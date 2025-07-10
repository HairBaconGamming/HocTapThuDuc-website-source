// routes/quizGenerator.js
const express = require("express");
const router = express.Router();
const multer = require("multer");
const mammoth = require("mammoth");
const anyText = require("any-text"); // Alternative extraction for huge DOCX files or if Mammoth fails
const pdfParse = require("pdf-parse"); // For PDF extraction
const fs = require("fs");
const tmp = require("tmp");
const { isPro } = require("../middlewares/auth");

// Import the Google Generative AI library (used solely for quiz generation)
const { GoogleGenerativeAI } = require("@google/generative-ai");

// Use environment variable or fallback secret key
const apiKey = process.env.GEMINI_API_KEY_2 || "AIzaSyALx6MqoO2Lz9SQjhCpd3msWodOQQRMlxc";
const genAI = new GoogleGenerativeAI(apiKey);

// Get the Gemini model
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

// Use Multer with memory storage for file uploads
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: { fileSize: 20 * 1024 * 1024 } // Limit 20 MB per file
});

// Helper function to clean and parse JSON from AI responses
function parseAIResponse(responseText) {
  let cleaned = responseText.trim();
  // Remove markdown code block if present
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(\w+)?/, "").trim();
    if (cleaned.endsWith("```")) {
      cleaned = cleaned.slice(0, -3).trim();
    }
  }
  return JSON.parse(cleaned);
}

// Function to generate quiz from text using Gemini AI
async function generateQuizFromText(text) {
  try {
    const chatSession = geminiModel.startChat({
      generationConfig,
      history: []
    });
    // Create prompt for generating a quiz
   const prompt = `Dựa trên văn bản sau, hãy tạo ra một bộ câu hỏi trắc nghiệm.  
- Mỗi câu có thể là nhiều lựa chọn hoặc dạng Đúng/Sai.  
- **Tất cả các đáp án trong "options" phải lấy nguyên văn từ văn bản** (không tự sinh đáp án mới).  
- Trả về kết quả ở định dạng JSON, trong đó mỗi phần tử có cấu trúc:

{
  "question": "Câu hỏi",
  "options": [
    {"text": "Đáp án A (nguyên văn)", "isCorrect": false},
    {"text": "Đáp án B (nguyên văn)", "isCorrect": true},
    ...
    // với dạng Đúng/Sai, sẽ có đúng 2 phần tử: "Đúng" và "Sai"
  ],
  "correctAnswer": "Đáp án đúng (text)"
}

Văn bản: "${text}"`;

    const result = await chatSession.sendMessage(prompt);
    let responseText = result.response.text().trim();
    // Clean markdown code block formatting if present
    const quiz = parseAIResponse(responseText);
    return quiz;
  } catch (err) {
    console.error("Gemini error:", err);
    // Return a sample quiz if an error occurs during quiz generation
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

// Function to generate quiz from file by extracting text then generating quiz.
// For DOCX files, we try Mammoth first and fall back to any-text when necessary.
async function generateQuizFromFile(file) {
  let text = "";

  // Handle PDF files
  if (file.mimetype === "application/pdf") {
    const pdfData = await pdfParse(file.buffer);
    text = pdfData.text;
  }
  // Handle DOCX files
  else if (
    file.mimetype === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    file.originalname.toLowerCase().endsWith(".docx")
  ) {
    // Attempt extraction using Mammoth first
    try {
      const result = await mammoth.extractRawText({ buffer: file.buffer });
      text = result.value;
    } catch (mammothError) {
      console.error("Mammoth extraction failed:", mammothError);
    }

    // If Mammoth returned no text or the file is large, fallback to any-text extraction
    if (!text || text.trim() === "" || file.size > 10 * 1024 * 1024) {
      try {
        // Create a temporary file to store the buffer since any-text expects a file path.
        const tempFile = tmp.fileSync({ postfix: '.docx' });
        fs.writeFileSync(tempFile.name, file.buffer);

        // Use any-text.getText with the temporary file path
        text = await anyText.getText(tempFile.name);

        // Remove the temporary file
        tempFile.removeCallback();

        if (!text || text.trim() === "") {
          throw new Error("Any-text extraction returned empty text");
        }
      } catch (anyTextError) {
        console.error("Any-text extraction failed:", anyTextError);
        throw new Error("Không thể trích xuất nội dung từ file DOCX.");
      }
    }
  } else {
    throw new Error("Loại file không được hỗ trợ. Vui lòng upload file PDF hoặc DOCX.");
  }

  if (!text || text.trim() === "") {
    throw new Error("File trống hoặc không thể đọc được nội dung.");
  }

  // Generate quiz from the extracted text
  return await generateQuizFromText(text);
}

// POST /api/quiz-generator
// Uses the "file" field to upload PDF or DOCX
router.post("/", isPro, upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "Không có file được upload!" });
    }
    
    // Process the file and create quiz
    const quiz = await generateQuizFromFile(req.file);
    res.json({ quiz });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Lỗi khi xử lý file và tạo quiz." });
  }
});

module.exports = router;
