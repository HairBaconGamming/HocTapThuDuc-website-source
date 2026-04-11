const { GoogleGenerativeAI } = require("@google/generative-ai");

const apiKey = process.env.GEMINI_API_KEY_2 || process.env.GEMINI_API_KEY || "";

const generationConfig = {
  temperature: 0.55,
  topP: 0.92,
  topK: 40,
  maxOutputTokens: 1800,
  responseMimeType: "text/plain"
};

const pageGuides = {
  default:
    "Ngữ cảnh chung của website học tập. Hãy đóng vai người hướng dẫn học tập gọn gàng, ưu tiên tóm tắt, định hướng bước tiếp theo và chỉ ra điều quan trọng nhất trên trang.",
  "lesson-detail":
    "Ngữ cảnh là trang học bài. Ưu tiên giải thích dễ hiểu, tóm tắt phần đang học, gợi ý cách ghi nhớ, tạo câu hỏi ôn nhanh và không làm lộ đáp án theo kiểu quá trực tiếp nếu người học chỉ muốn gợi ý.",
  "lesson-studio":
    "Ngữ cảnh là studio biên soạn bài học. Hãy hành xử như một instructional designer và biên tập viên: góp ý cấu trúc, chất lượng truyền đạt, checklist trước khi publish, ý tưởng quiz, microcopy và cách làm bài học rõ hơn.",
  garden:
    "Ngữ cảnh là game nông trại học tập. Hãy hướng dẫn nước đi tiếp theo, ưu tiên tài nguyên, giải thích UI/nhiệm vụ, và giữ giọng điệu thân thiện như một trợ lý nông trại thông minh."
};

function cleanText(value, limit = 4000) {
  if (value === null || value === undefined) return "";
  const normalized = String(value)
    .replace(/\r/g, "")
    .replace(/\t/g, " ")
    .replace(/\u00a0/g, " ")
    .replace(/[ ]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return normalized.length > limit ? `${normalized.slice(0, limit)}...` : normalized;
}

function stringifyMetadata(metadata) {
  if (!metadata || typeof metadata !== "object") return "";

  try {
    return cleanText(JSON.stringify(metadata, null, 2), 2600);
  } catch (error) {
    return "";
  }
}

function formatHistory(history) {
  if (!Array.isArray(history) || history.length === 0) return "";

  const lines = history
    .slice(-6)
    .map((item) => {
      const role = item && item.role === "assistant" ? "AI" : "Người dùng";
      const content = cleanText(item && item.content, 900);
      return content ? `${role}: ${content}` : "";
    })
    .filter(Boolean);

  return lines.length ? lines.join("\n") : "";
}

function buildSystemPrompt({
  pageType,
  pageTitle,
  prompt,
  selection,
  contextSummary,
  metadata,
  user,
  history
}) {
  const guide = pageGuides[pageType] || pageGuides.default;
  const userSummary = user
    ? `Người dùng hiện tại: ${cleanText(user.username || "Học viên", 60)} | level ${Math.max(0, Number(user.level) || 0)} | vai trò: ${user.isAdmin ? "admin" : user.isTeacher ? "teacher" : "student"}`
    : "Người dùng hiện tại: khách hoặc chưa đăng nhập.";

  const safePageTitle = cleanText(pageTitle, 140);
  const safePrompt = cleanText(prompt, 1200);
  const safeSelection = cleanText(selection, 1500);
  const safeSummary = cleanText(contextSummary, 2600);
  const safeMetadata = stringifyMetadata(metadata);
  const safeHistory = formatHistory(history);

  return [
    "Bạn là AI Tutor của Hoc Tap Thu Duc.",
    "Mục tiêu: hướng dẫn ngắn gọn, hữu ích, dễ làm theo và không lan man.",
    guide,
    "Quy tắc trả lời:",
    "- Luôn trả lời bằng tiếng Việt tự nhiên.",
    "- Giữ câu trả lời gọn: tối đa 1 đoạn mở đầu ngắn và 3-5 bullet khi cần.",
    "- Nếu dữ liệu trang thiếu, nói rõ đang suy luận từ ngữ cảnh hiện có.",
    "- Không bịa dữ kiện, số liệu, hay hành vi hệ thống.",
    "- Khi phù hợp, kết thúc bằng một bước tiếp theo rất cụ thể.",
    userSummary,
    safePageTitle ? `Tiêu đề trang: ${safePageTitle}` : "",
    safeSelection ? `Đoạn người dùng đang chọn hoặc đang nhìn tới:\n${safeSelection}` : "",
    safeSummary ? `Tóm tắt ngữ cảnh trang:\n${safeSummary}` : "",
    safeMetadata ? `Metadata cấu trúc:\n${safeMetadata}` : "",
    safeHistory ? `Đoạn hội thoại gần đây:\n${safeHistory}` : "",
    `Yêu cầu mới của người dùng:\n${safePrompt}`
  ]
    .filter(Boolean)
    .join("\n\n");
}

exports.askTutor = async (req, res) => {
  try {
    const { prompt, pageType, pageTitle, selection, contextSummary, metadata, history } = req.body || {};
    const safePrompt = cleanText(prompt, 1200);

    if (!safePrompt) {
      return res.status(400).json({
        success: false,
        error: "Bạn chưa nhập câu hỏi cho AI Tutor."
      });
    }

    if (!apiKey) {
      return res.status(503).json({
        success: false,
        error: "AI Tutor chưa được cấu hình khoá Gemini trên server."
      });
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: "gemini-2.0-flash-thinking-exp-01-21"
    });

    const chatSession = model.startChat({
      generationConfig,
      history: []
    });

    const finalPrompt = buildSystemPrompt({
      pageType: cleanText(pageType, 80) || "default",
      pageTitle,
      prompt: safePrompt,
      selection,
      contextSummary,
      metadata,
      history,
      user: req.user || null
    });

    const result = await chatSession.sendMessage(finalPrompt);
    const reply = cleanText(result?.response?.text?.() || "", 5000);

    if (!reply) {
      return res.status(502).json({
        success: false,
        error: "AI Tutor chưa tạo được phản hồi phù hợp."
      });
    }

    return res.json({
      success: true,
      reply
    });
  } catch (error) {
    console.error("AI Tutor error:", error);
    return res.status(500).json({
      success: false,
      error: "AI Tutor đang hơi quá tải. Bạn thử lại sau ít phút nhé."
    });
  }
};
