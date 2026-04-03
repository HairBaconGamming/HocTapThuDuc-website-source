const express = require("express");
const multer = require("multer");
const mammoth = require("mammoth");
const pdfParse = require("pdf-parse");
const { JSDOM } = require("jsdom");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { isPro } = require("../middlewares/auth");

const router = express.Router();

const apiKey = process.env.GEMINI_API_KEY_2;
const genAI = new GoogleGenerativeAI(apiKey);

const geminiModel = genAI.getGenerativeModel({
  model: "gemini-2.0-flash-thinking-exp-01-21"
});

const generationConfig = {
  temperature: 0.7,
  topP: 0.95,
  topK: 64,
  maxOutputTokens: 65536,
  responseMimeType: "text/plain"
};

const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 }
});

function parseAIResponse(responseText) {
  let cleaned = responseText.trim();

  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(\w+)?/, "").trim();
    if (cleaned.endsWith("```")) {
      cleaned = cleaned.slice(0, -3).trim();
    }
  }

  return JSON.parse(cleaned);
}

function normalizeExtractedText(text) {
  return String(text || "")
    .replace(/\r/g, "")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function extractPlainTextFromHtml(html) {
  const dom = new JSDOM(`<body>${html || ""}</body>`);
  const text = dom.window.document.body.textContent || "";
  dom.window.close();
  return normalizeExtractedText(text);
}

async function extractTextFromDocx(file) {
  try {
    const rawResult = await mammoth.extractRawText({ buffer: file.buffer });
    const rawText = normalizeExtractedText(rawResult.value);
    if (rawText) {
      return rawText;
    }
  } catch (rawError) {
    console.error("Mammoth raw DOCX extraction failed:", rawError);
  }

  try {
    const htmlResult = await mammoth.convertToHtml({ buffer: file.buffer });
    const htmlText = extractPlainTextFromHtml(htmlResult.value);
    if (htmlText) {
      return htmlText;
    }
  } catch (htmlError) {
    console.error("Mammoth HTML DOCX extraction failed:", htmlError);
  }

  throw new Error("Khong the trich xuat noi dung tu file DOCX.");
}

async function generateQuizFromText(text) {
  try {
    const chatSession = geminiModel.startChat({
      generationConfig,
      history: []
    });

    const prompt = `Dua tren van ban sau, hay tao ra mot bo cau hoi trac nghiem.
- Moi cau co the la nhieu lua chon hoac dang Dung/Sai.
- Tat ca dap an trong "options" phai lay tu van ban, khong tu sinh dap an moi.
- Tra ve ket qua o dinh dang JSON, moi phan tu co cau truc:

{
  "question": "Cau hoi",
  "options": [
    { "text": "Dap an A", "isCorrect": false },
    { "text": "Dap an B", "isCorrect": true }
  ],
  "correctAnswer": "Dap an dung"
}

Van ban: "${text}"`;

    const result = await chatSession.sendMessage(prompt);
    const responseText = result.response.text().trim();
    return parseAIResponse(responseText);
  } catch (err) {
    console.error("Gemini error:", err);
    return [
      {
        question: "What is the main idea of the document?",
        options: [
          { text: "Option A", isCorrect: false },
          { text: "Option B", isCorrect: true },
          { text: "Option C", isCorrect: false },
          { text: "Option D", isCorrect: false }
        ],
        correctAnswer: "Option B"
      }
    ];
  }
}

async function generateQuizFromFile(file) {
  let text = "";

  if (file.mimetype === "application/pdf") {
    const pdfData = await pdfParse(file.buffer);
    text = normalizeExtractedText(pdfData.text);
  } else if (
    file.mimetype ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    file.originalname.toLowerCase().endsWith(".docx")
  ) {
    text = await extractTextFromDocx(file);
  } else {
    throw new Error("Loai file khong duoc ho tro. Vui long upload file PDF hoac DOCX.");
  }

  if (!text) {
    throw new Error("File trong hoac khong the doc duoc noi dung.");
  }

  return generateQuizFromText(text);
}

router.post("/", isPro, upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "Khong co file duoc upload." });
    }

    const quiz = await generateQuizFromFile(req.file);
    return res.json({ quiz });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Loi khi xu ly file va tao quiz." });
  }
});

module.exports = router;
