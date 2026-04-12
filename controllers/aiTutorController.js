const apiKey =
  process.env.SILICONFLOW_API_KEY ||
  process.env.SILICONFLOW_TOKEN ||
  "";

const modelName =
  process.env.SILICONFLOW_AI_TUTOR_MODEL || "nex-agi/DeepSeek-V3.1-Nex-N1";

const requestConfig = {
  temperature: 0.5,
  top_p: 0.92,
  max_tokens: 2200
};

// Đã tối ưu ngắn gọn, tập trung vào nhiệm vụ cốt lõi
const pageGuides = {
  default: "Vai trò: Trợ lý học tập. Nhiệm vụ: Tóm tắt, giải thích, chỉ dẫn thao tác web ngắn gọn.",
  "lesson-detail": "Vai trò: Gia sư Socratic. Nhiệm vụ: Gợi ý từng bước, không đưa đáp án trực tiếp, tạo mini-quiz kiểm tra hiểu bài.",
  "lesson-studio": "Vai trò: Chuyên gia thiết kế bài giảng (Instructional Designer). Nhiệm vụ: Góp ý cấu trúc, tinh chỉnh nội dung, tạo checklist trước khi xuất bản.",
  garden: "Vai trò: Quản gia nông trại. Nhiệm vụ: Hướng dẫn quản lý tài nguyên, gợi ý tối ưu cày cuốc đổi thưởng.",
  qa: "Vai trò: Mentor học thuật. Nhiệm vụ: Phân tích câu hỏi, chia nhỏ bài giải thành các bước dễ hiểu.",
  guild: "Vai trò: Cố vấn bang hội. Nhiệm vụ: Giải thích cơ chế quyên góp, buff, và chiến lược leo rank tập thể."
};

// Chia nhỏ kiến thức để "Gọi trang nào - Load context trang đó", cực kỳ tiết kiệm Token
const platformKnowledge = {
  default: "Hệ thống có: Dashboard, Khóa học, Flashcard, Game Nông trại (Garden), Bang hội (Tông Môn), Hỏi đáp (QA), và Lesson Studio.",
  "lesson-detail": "Trang bài học có: Reading workspace, quiz, ghi chú, highlight, flashcard checkpoint, AI Tutor.",
  "lesson-studio": "Lesson Studio: Dùng để soạn lesson/course/unit, có quiz/media block, draft/publish.",
  garden: "Nông trại học tập (Garden): Có tài nguyên nước/phân bón/vàng, trồng cây, shop, nhiệm vụ. XP và vàng liên thông với khóa học.",
  qa: "Khu Hỏi đáp: Đặt câu hỏi, treo thưởng bằng Vàng (bounty), trả lời, upvote, contributor board.",
  guild: "Tông Môn/Bang hội: Cây Linh Thú, quyên góp, buff sức mạnh, mục tiêu tuần, leaderboard."
};

function cleanText(value, limit = 5000) {
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
    return cleanText(JSON.stringify(metadata, null, 2), 3200);
  } catch (error) {
    return "";
  }
}

function formatHistory(history) {
  if (!Array.isArray(history) || history.length === 0) return "";
  return history
    .slice(-6)
    .map((item) => {
      const role = item?.role === "assistant" ? "AI" : "User";
      const content = cleanText(item?.content, 900);
      return content ? `${role}: ${content}` : "";
    })
    .filter(Boolean)
    .join("\n");
}

// HÀM MỚI: Tách biệt System Role (Quy tắc) và User Role (Ngữ cảnh + Câu hỏi)
function buildMessages({
  pageType,
  pageTitle,
  prompt,
  selection,
  contextSummary,
  metadata,
  user,
  history
}) {
  const safePageType = pageGuides[pageType] ? pageType : "default";

  // 1. SYSTEM PROMPT: Nhẹ nhàng, logic, định hình nhân vật
  const systemInstructions = [
    "Bạn là AI Tutor của Học Tập Thủ Đức. Luôn giao tiếp bằng Tiếng Việt thân thiện, dễ hiểu, phù hợp học sinh.",
    "",
    "### QUY TẮC PHẢN HỒI:",
    "- Cấu trúc: 1 dòng mở bài -> Gạch đầu dòng (3-5 ý chính) -> Gợi ý bước tiếp theo cực kỳ cụ thể.",
    "- Format: Dùng Markdown (tiêu đề, bullet list, in đậm).",
    "- Công thức: Trình bày Toán/Lý/Hóa bằng LaTeX ($...$ hoặc $$...$$).",
    "- Trung thực: Chỉ trả lời dựa trên ngữ cảnh giao diện được cung cấp, tuyệt đối không bịa đặt tính năng.",
    "",
    "### VAI TRÒ & NHIỆM VỤ HIỆN TẠI:",
    pageGuides[safePageType],
    "",
    "### THÔNG TIN HỆ THỐNG HIỆN TẠI:",
    platformKnowledge[safePageType]
  ].join("\n");

  // 2. USER CONTEXT: Chứa dữ liệu thực tế
  const userInfo = user
    ? `Học viên: ${cleanText(user.username || "Ẩn danh", 60)} | Level ${Math.max(0, Number(user.level) || 0)} | Vai trò: ${user.isAdmin ? "Admin" : user.isTeacher ? "Teacher" : "Student"}`
    : "Người dùng: Khách (Chưa đăng nhập)";

  const userContent = [
    `[NGỮ CẢNH HỆ THỐNG]`,
    userInfo,
    pageTitle ? `- Tiêu đề trang: ${cleanText(pageTitle, 180)}` : "",
    selection ? `- Đoạn văn bản đang bôi đen:\n"${cleanText(selection, 1800)}"` : "",
    contextSummary ? `- Tóm tắt nội dung trang:\n${cleanText(contextSummary, 3400)}` : "",
    metadata ? `- Metadata bổ sung: ${stringifyMetadata(metadata)}` : "",
    history && history.length > 0 ? `\n[LỊCH SỬ TRÒ CHUYỆN GẦN ĐÂY]\n${formatHistory(history)}` : "",
    `\n[YÊU CẦU MỚI TỪ NGƯỜI DÙNG]\n${cleanText(prompt, 1400)}`
  ]
    .filter(Boolean)
    .join("\n");

  return [
    { role: "system", content: systemInstructions },
    { role: "user", content: userContent }
  ];
}

function extractReplyFromChoices(payload) {
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (typeof item === "string") return item;
        if (item?.type === "text") return item.text || "";
        return "";
      })
      .filter(Boolean)
      .join("\n");
  }
  return "";
}

function extractDeltaText(payload) {
  const deltaContent = payload?.choices?.[0]?.delta?.content;
  if (typeof deltaContent === "string") return deltaContent;
  if (Array.isArray(deltaContent)) {
    return deltaContent
      .map((item) => {
        if (typeof item === "string") return item;
        if (item?.type === "text") return item.text || "";
        return "";
      })
      .filter(Boolean)
      .join("");
  }
  return "";
}

// CẬP NHẬT: Nhận mảng messagesPayload thay vì finalPrompt
async function requestTutorReply(messagesPayload) {
  const response = await fetch("https://api.siliconflow.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: modelName,
      messages: messagesPayload,
      ...requestConfig
    })
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const remoteError =
      payload?.error?.message ||
      payload?.message ||
      "SiliconFlow không trả về phản hồi hợp lệ.";
    const error = new Error(remoteError);
    error.statusCode = response.status;
    throw error;
  }

  return cleanText(extractReplyFromChoices(payload), 7000);
}

function sendStreamPacket(res, packet) {
  res.write(`data: ${JSON.stringify(packet)}\n\n`);
}

function setSseHeaders(res) {
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  if (typeof res.flushHeaders === "function") {
    res.flushHeaders();
  }
}

// CẬP NHẬT: Nhận mảng messagesPayload
async function streamTutorReply(messagesPayload, res) {
  const response = await fetch("https://api.siliconflow.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: modelName,
      messages: messagesPayload,
      stream: true,
      ...requestConfig
    })
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    const remoteError =
      payload?.error?.message ||
      payload?.message ||
      "SiliconFlow không thể stream phản hồi lúc này.";
    const error = new Error(remoteError);
    error.statusCode = response.status;
    throw error;
  }

  if (!response.body) {
    const fallbackReply = await requestTutorReply(messagesPayload);
    sendStreamPacket(res, { type: "delta", delta: fallbackReply });
    sendStreamPacket(res, { type: "done", reply: fallbackReply });
    return;
  }

  const decoder = new TextDecoder();
  let buffer = "";
  let fullReply = "";

  for await (const chunk of response.body) {
    buffer += decoder.decode(chunk, { stream: true });

    let boundaryIndex = buffer.indexOf("\n\n");
    while (boundaryIndex >= 0) {
      const rawEvent = buffer.slice(0, boundaryIndex);
      buffer = buffer.slice(boundaryIndex + 2);
      boundaryIndex = buffer.indexOf("\n\n");

      const payloadText = rawEvent
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trim())
        .join("");

      if (!payloadText) continue;
      if (payloadText === "[DONE]") {
        sendStreamPacket(res, { type: "done", reply: fullReply });
        return;
      }

      try {
        const payload = JSON.parse(payloadText);
        const delta = extractDeltaText(payload);
        if (!delta) continue;
        fullReply += delta;
        sendStreamPacket(res, { type: "delta", delta });
      } catch (error) {
        // Skip malformed partial packets from upstream.
      }
    }
  }

  sendStreamPacket(res, { type: "done", reply: fullReply });
}

function buildPromptFromRequest(req) {
  const { prompt, pageType, pageTitle, selection, contextSummary, metadata, history } =
    req.body || {};
  const safePrompt = cleanText(prompt, 1400);

  if (!safePrompt) {
    const error = new Error("Bạn chưa nhập câu hỏi cho AI Tutor.");
    error.statusCode = 400;
    throw error;
  }

  if (!apiKey) {
    const error = new Error("AI Tutor chưa được cấu hình khóa API trên server.");
    error.statusCode = 503;
    throw error;
  }

  return buildMessages({
    pageType: cleanText(pageType, 80) || "default",
    pageTitle,
    prompt: safePrompt,
    selection,
    contextSummary,
    metadata,
    history,
    user: req.user || null
  });
}

function resolveErrorStatus(error) {
  return Number(error?.statusCode) >= 400 && Number(error?.statusCode) < 600
    ? Number(error.statusCode)
    : 500;
}

function resolvePublicErrorMessage(error, statusCode) {
  return statusCode >= 500
    ? "AI Tutor đang hơi quá tải. Bạn thử lại sau ít phút nhé."
    : cleanText(error?.message, 260) || "Không thể lấy phản hồi từ AI Tutor.";
}

// CONTROLLERS
exports.askTutor = async (req, res) => {
  try {
    const messagesPayload = buildPromptFromRequest(req);
    const reply = await requestTutorReply(messagesPayload);

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
    const statusCode = resolveErrorStatus(error);
    return res.status(statusCode).json({
      success: false,
      error: resolvePublicErrorMessage(error, statusCode)
    });
  }
};

exports.streamTutor = async (req, res) => {
  try {
    const messagesPayload = buildPromptFromRequest(req);
    setSseHeaders(res);
    sendStreamPacket(res, { type: "ready", model: modelName });
    
    await streamTutorReply(messagesPayload, res);
    res.end();
  } catch (error) {
    console.error("AI Tutor stream error:", error);
    const statusCode = resolveErrorStatus(error);

    if (!res.headersSent) {
      return res.status(statusCode).json({
        success: false,
        error: resolvePublicErrorMessage(error, statusCode)
      });
    }

    sendStreamPacket(res, {
      type: "error",
      error: resolvePublicErrorMessage(error, statusCode)
    });
    res.end();
  }
};