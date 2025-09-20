const cron = require('node-cron');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const Lesson = require('./models/Lesson');
const Subject = require('./models/Subject');
const mongoose = require('mongoose');

// Import Google Generative AI library
const { GoogleGenerativeAI } = require("@google/generative-ai");

// Use system user ID "67dc37c5333c73b751f94d19" for AI-generated lessons
const systemUserId = new mongoose.Types.ObjectId("67dc37c5333c73b751f94d19");

// Use API key from environment
const apiKey = process.env.GEMINI_API_KEY_DANGBAI;
const genAI = new GoogleGenerativeAI(apiKey);

// Get Gemini model
const geminiModel = genAI.getGenerativeModel({
  model: "gemini-2.0-flash-thinking-exp-01-21"
});

// Generation configuration
const generationConfig = {
  temperature: 0.7,
  topP: 0.95,
  topK: 64,
  maxOutputTokens: 65536,
  responseMimeType: "text/plain"
};

// Path to file storing topics
const topicsFilePath = path.join(__dirname, "topics.json");

// Read topics from file, or create default if missing
function readTopics() {
  if (!fs.existsSync(topicsFilePath)) {
    const defaultTopics = {
      "Toán": "Ôn tập tuyển sinh lớp 10 Toán: Chủ đề ban đầu",
      "Văn": "Ôn tập tuyển sinh lớp 10 Văn: Chủ đề ban đầu",
      "Anh": "Ôn tập tuyển sinh lớp 10 Anh: Chủ đề ban đầu"
    };
    fs.writeFileSync(topicsFilePath, JSON.stringify(defaultTopics, null, 2));
    return defaultTopics;
  }
  const data = fs.readFileSync(topicsFilePath, "utf8");
  return JSON.parse(data);
}

// Write topics to file
function writeTopics(topics) {
  fs.writeFileSync(topicsFilePath, JSON.stringify(topics, null, 2));
}

// A helper to remove basic markdown syntax from a string
function removeMarkdown(text) {
  return text.replace(/[#*_`>~\[\]\(\)]/g, "").trim();
}

// Function to generate AI course content using the Gemini model
async function generateAICourse(prompt) {
  try {
    const result = await geminiModel.startChat({ history: [], generationConfig }).sendMessage(prompt);
    return result.response.text();
  } catch (error) {
    console.error('Error generating AI content:', error);
    return null;
  }
}

// Dummy getLatestInfo function; replace with a real API call if needed.
async function getLatestInfo(query) {
  try {
    return `Latest update about ${query}: Sample snippet.
URL: https://example.com/update1

Latest update about ${query}: Another snippet.
URL: https://example.com/update2

Latest update about ${query}: More details here.
URL: https://example.com/update3`;
  } catch (error) {
    console.error("Error in getLatestInfo:", error);
    return "";
  }
}

async function autoPostAICourses() {
  try {
    // Retrieve subjects to post for (e.g., Toán, Văn, Anh)
    const subjectsToPost = await Subject.find({ name: { $in: ["Văn", "Anh"] } });
    const topics = readTopics();

    // Define possible lesson types
    const lessonTypes = ["markdown", "quiz", "essay"];

    for (const subject of subjectsToPost) {
      const currentTopic = topics[subject.name] || `Ôn tập tuyển sinh lớp 10 ${subject.name}: Chủ đề ban đầu`;
      const searchQuery = `Tuyển sinh lớp 10 TP Hồ Chí Minh ${subject.name} cập nhật 2024`;
      const extraInfo = await getLatestInfo(searchQuery);

      // Randomly choose a lesson type
      const randomIndex = Math.floor(Math.random() * lessonTypes.length);
      const lessonType = lessonTypes[randomIndex];

      let prompt = "";
      if (lessonType === "markdown") {
        prompt = `Dựa trên chủ đề: "${currentTopic}" và thông tin cập nhật mới nhất: "${extraInfo}", hãy tạo một bài học ôn tập tuyển sinh lớp 10 TP Hồ Chí Minh cho môn ${subject.name}. 
Yêu cầu:
- Dòng đầu tiên: Tiêu đề hấp dẫn (không chứa markdown).
- Các dòng tiếp theo: Nội dung bài học chi tiết, bao gồm bài giảng, ví dụ và bài tập kèm lời giải (văn bản mô tả rõ ràng).
- Dòng cuối cùng: Một chủ đề mới để dùng cho lần tạo bài học tiếp theo.
Định dạng: Tiêu đề ở dòng đầu tiên, sau đó là một dòng trống, rồi đến nội dung bài học, và ở dòng cuối cùng là chủ đề mới.`;
      } else if (lessonType === "quiz") {
        prompt = `Dựa trên chủ đề: "${currentTopic}" và thông tin cập nhật mới nhất: "${extraInfo}", hãy tạo một bài trắc nghiệm tuyển sinh lớp 10 TP Hồ Chí Minh cho môn ${subject.name} dưới dạng JSON.
Yêu cầu:
- Output phải là một JSON array, mỗi phần tử là một đối tượng với các trường: "question" (string), "options" (array of strings), và "correctAnswer" (string).
- Không có văn bản phụ nào ngoài JSON.
- Sau JSON, ở dòng cuối cùng, xuất ra một chuỗi chủ đề mới để dùng cho lần tạo bài học tiếp theo.
Ví dụ:
[
  { "question": "Câu hỏi 1", "options": ["A", "B", "C", "D"], "correctAnswer": "B" },
  { "question": "Câu hỏi 2", "options": ["A", "B", "C", "D"], "correctAnswer": "C" }
]
Chủ đề mới: [Your new topic here]`;
      } else if (lessonType === "essay") {
        // For essay, instruct the AI to output a JSON object containing two keys:
        // "questions": an array of essay question objects, and "essayPrompt": a string.
        prompt = `Dựa trên chủ đề: "${currentTopic}" và thông tin cập nhật mới nhất: "${extraInfo}", hãy tạo đề bài tự luận tuyển sinh lớp 10 TP Hồ Chí Minh cho môn ${subject.name} dưới dạng JSON.
Yêu cầu:
- Output phải là một JSON object với hai trường:
  • "questions": là một JSON array, mỗi phần tử là một đối tượng có các trường "question" (string) và "sampleAnswer" (string, có thể rỗng).
  • "essayPrompt": là một chuỗi chứa đề bài tự luận.
- JSON output không chứa văn bản nào khác ngoài JSON.
- Sau JSON, ở dòng cuối cùng, xuất ra một chuỗi chủ đề mới để dùng cho lần tạo đề bài tự luận tiếp theo.
Ví dụ:
{
  "questions": [
    { "question": "Câu hỏi 1", "sampleAnswer": "Đáp án mẫu 1" },
    { "question": "Câu hỏi 2", "sampleAnswer": "Đáp án mẫu 2" }
  ],
  "essayPrompt": "Đề bài: ..."
}
Chủ đề mới: [Your new topic here]`;
      }

      const aiResult = await generateAICourse(prompt);
      if (aiResult) {
        if (lessonType === "markdown") {
          const lines = aiResult.split(/\r?\n/).filter(line => line.trim() !== "");
          if (lines.length < 3) {
            console.error(`Kết quả AI không đủ định dạng cho môn ${subject.name} loại ${lessonType}`);
            continue;
          }
          const rawTitle = lines[0];
          const aiTitle = removeMarkdown(rawTitle);
          const newTopic = lines[lines.length - 1].trim();
          const aiContent = lines.slice(1, lines.length - 1).join("\n").trim();
          if (aiContent) {
            const newLesson = new Lesson({
              subject: subject._id,
              title: aiTitle,
              content: aiContent,
              category: "theory",
              type: lessonType,
              createdBy: systemUserId,
              editorData: { markdown: aiContent },
              isProOnly: false,
              isAIGenerated: true
            });
            await newLesson.save();
            console.log(`Đã đăng bài học AI (${lessonType}) cho môn ${subject.name} với tiêu đề: ${aiTitle}`);
            topics[subject.name] = newTopic;
            writeTopics(topics);
            console.log(`Cập nhật chủ đề mới cho ${subject.name}: ${newTopic}`);
          } else {
            console.error(`Không thể tạo nội dung bài học cho môn ${subject.name}`);
          }
        } else if (lessonType === "quiz") {
          const parts = aiResult.split(/\r?\n/).filter(line => line.trim() !== "");
          if (parts.length < 2) {
            console.error(`Kết quả AI không đủ định dạng cho môn ${subject.name} loại ${lessonType}`);
            continue;
          }
          const newTopic = parts.pop().trim();
          const jsonString = parts.join("\n").trim();
          let quizData;
          try {
            quizData = JSON.parse(jsonString);
          } catch (e) {
            console.error("JSON parse error for quiz data:", e);
            quizData = [];
          }
          const aiTitle = (quizData.length > 0 && quizData[0].question)
                          ? removeMarkdown(quizData[0].question) + " [AI Quiz]"
                          : `Bài trắc nghiệm ${subject.name} [AI]`;
          const newLesson = new Lesson({
            subject: subject._id,
            title: aiTitle,
            content: "Bài trắc nghiệm do AI tạo.",
            category: "theory",
            type: lessonType,
            createdBy: systemUserId,
            editorData: { quiz: JSON.stringify(quizData) },
            isProOnly: false,
            isAIGenerated: true
          });
          await newLesson.save();
          console.log(`Đã đăng bài trắc nghiệm AI cho môn ${subject.name} với tiêu đề: ${aiTitle}`);
          topics[subject.name] = newTopic;
          writeTopics(topics);
          console.log(`Cập nhật chủ đề mới cho ${subject.name}: ${newTopic}`);
        } else if (lessonType === "essay") {
          // For essay, we expect the AI output to contain a JSON object followed by a separator and then the new topic.
          const separator = "Chủ đề mới:";
          const separatorIndex = aiResult.lastIndexOf(separator);
          if (separatorIndex === -1) {
            console.error(`Kết quả AI không chứa separator "${separator}" cho môn ${subject.name} loại ${lessonType}`);
            continue;
          }
          const jsonString = aiResult.substring(0, separatorIndex).trim();
          const newTopic = aiResult.substring(separatorIndex + separator.length).trim();
          let essayOutput;
          try {
            essayOutput = JSON.parse(jsonString);
          } catch (e) {
            console.error("JSON parse error for essay data:", e);
            essayOutput = { questions: [], essayPrompt: "" };
          }
          const essayData = essayOutput.questions || [];
          const essayPrompt = essayOutput.essayPrompt || "";
          const aiTitle = (essayData.length > 0 && essayData[0].question)
                          ? removeMarkdown(essayData[0].question) + " [AI Essay]"
                          : `Đề bài tự luận ${subject.name} [AI]`;
          // Randomly choose an essay grading method from available options.
          const possibleGradingMethods = ["ai", "smart", "absolute", "simple"];
          const essayGradingMethod = possibleGradingMethods[Math.floor(Math.random() * possibleGradingMethods.length)];
          
          const newLesson = new Lesson({
            subject: subject._id,
            title: aiTitle,
            content: "Đề bài tự luận do AI tạo.",
            category: "theory",
            type: lessonType,
            createdBy: systemUserId,
            editorData: {
              essay: JSON.stringify(essayData),
              essayPrompt: essayPrompt,
              essayGrading: essayGradingMethod
            },
            isProOnly: false,
            isAIGenerated: true
          });
          await newLesson.save();
          console.log(`Đã đăng đề bài tự luận AI cho môn ${subject.name} với tiêu đề: ${aiTitle}`);
          topics[subject.name] = newTopic;
          writeTopics(topics);
          console.log(`Cập nhật chủ đề mới cho ${subject.name}: ${newTopic}`);
        }
      } else {
        console.error(`Không thể tạo bài học cho môn ${subject.name}`);
      }
    }
  } catch (error) {
    console.error("Error in autoPostAICourses:", error);
  }
}


module.exports = { autoPostAICourses };
