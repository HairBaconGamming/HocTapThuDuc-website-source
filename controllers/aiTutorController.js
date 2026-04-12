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

const pageGuides = {
  default:
    "Ngu canh la toan bo website hoc tap. Hay dong vai tro ly hoc tap gon gang: tom tat, giai thich, chi dan thao tac tren web, va goi y buoc tiep theo that cu the.",
  "lesson-detail":
    "Ngu canh la trang hoc bai. Uu tien giai thich de hieu, tom tat y chinh, ra goi y theo tung nac, tao mini quiz, va khong lo dap an qua truc dien neu nguoi hoc chi muon goi y.",
  "lesson-studio":
    "Ngu canh la studio bien soan bai hoc. Hay hanh xu nhu instructional designer va bien tap vien: goi y cau truc, do ro rang, luong quiz, microcopy, do mo bai, va checklist truoc khi publish.",
  garden:
    "Ngu canh la game nong trai hoc tap. Hay tu van nhu quan gia thong minh cua khu vuon: giai thich UI, chi huong uu tien tai nguyen, va goi y cach hoc de doi loot/phan thuong.",
  qa: "Ngu canh la khu hoi dap hoc thuat. Hay giup nguoi dung dat cau hoi ro hon, tach bai giai thanh tung buoc, va giu giong dieu than thien nhu mot mentor hoc tap.",
  guild:
    "Ngu canh la workspace Tong Mon/Bang Hoi. Hay giai thich buff, muc tieu tuan, donation, leaderboard, va cach dong gop de ca nhan va tap the cung di len."
};

const platformKnowledge = [
  "Nen tang nay co Dashboard ca nhan, Kho bi kip theo mon, trang chi tiet khoa hoc, trang hoc bai, flashcard review, thanh tich, profile, leaderboard, khu hoi dap, Tin tuc, nong trai Garden, Tong Mon/Bang Hoi, Lesson Studio cho giao vien, va kho anh PRO.",
  "Dashboard tap trung vao tien do hoc, course dang hoc, level/xp, chart hoat dong, va lien ket nhanh sang Garden, Tong Mon, thanh tich.",
  "Trang course hien roadmap hoc, loot preview, flashcard deck, phan thuong theo level, va nut tiep tuc hoc.",
  "Trang lesson co reading workspace, quiz, ghi chu, highlight, comment theo doan trich, flashcard checkpoint, phan thuong hoc ben bi, AI Tutor, va co-presence thoi gian thuc.",
  "Lesson Studio dung de bien soan lesson/course/unit/tree, draft/publish, quiz block, media block, va review noi dung truoc khi dang.",
  "Garden la nong trai hoc tap, co tai nguyen nuoc/phan bon/vang, cay trong, shop, nhiem vu, va huong dan theo phong cach game.",
  "Tong Mon/Bang Hoi co cay Linh Thu, donation, buff, muc tieu tuan, leaderboard, thanh vien, quan tri, va dong gop anh huong den xep hang.",
  "Khu hoi dap QA co dat cau hoi, treo bounty vang, tra loi, upvote, chap nhan dap an, contributor board, va hot tags.",
  "Thanh tich, diem cong hien, xp, vang, va phan thuong trong garden/guild lien thong voi nhau de tao gamification xuyen suot.",
  "Neu nguoi dung hoi cach dung mot tinh nang, hay tra loi dua tren he thong nay, neu thieu du lieu thi noi ro dang suy luan tu giao dien hien tai."
].join("\n");

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
      const role = item?.role === "assistant" ? "AI" : "Nguoi dung";
      const content = cleanText(item?.content, 900);
      return content ? `${role}: ${content}` : "";
    })
    .filter(Boolean)
    .join("\n");
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
    ? `Nguoi dung hien tai: ${cleanText(user.username || "Hoc vien", 60)} | level ${Math.max(
        0,
        Number(user.level) || 0
      )} | vai tro: ${user.isAdmin ? "admin" : user.isTeacher ? "teacher" : "student"}`
    : "Nguoi dung hien tai: khach hoac chua dang nhap.";

  const safePageTitle = cleanText(pageTitle, 180);
  const safePrompt = cleanText(prompt, 1400);
  const safeSelection = cleanText(selection, 1800);
  const safeSummary = cleanText(contextSummary, 3400);
  const safeMetadata = stringifyMetadata(metadata);
  const safeHistory = formatHistory(history);

  return [
    "Ban la AI Tutor cua Hoc Tap Thu Duc.",
    "Hay luon phan hoi bang tieng Viet thuan tuy, de hieu, phu hop voi hoc sinh.",
    "Ban duoc phep va duoc khuyen khich dung Markdown ro rang: tieu de ngan, bullet list, bang, blockquote, checklist, code block neu can.",
    "Khi co cong thuc Toan/Ly/Hoa, hay dung cu phap LaTeX voi $...$ hoac $$...$$ thay vi mo ta bang van ban thuong.",
    "Neu du lieu trang khong du, hay noi ro ban dang suy luan tu giao dien hien tai; khong bia dat tinh nang, so lieu, hoac ket qua.",
    "Tra loi nen uu tien cau truc sau: 1 dong mo dau ngan, 3-5 bullet hay buoc, va ket thuc bang buoc tiep theo cuc ky cu the neu phu hop.",
    "Neu nguoi dung muon goi y thay vi dap an, hay giu theo kieu Socratic: goi y theo tung nac, khong spoil qua nhanh.",
    guide,
    `Kien thuc he thong de tham chieu:\n${platformKnowledge}`,
    userSummary,
    safePageTitle ? `Tieu de trang: ${safePageTitle}` : "",
    safeSelection ? `Doan nguoi dung dang chon:\n${safeSelection}` : "",
    safeSummary ? `Tom tat ngu canh hien tai:\n${safeSummary}` : "",
    safeMetadata ? `Metadata bo sung:\n${safeMetadata}` : "",
    safeHistory ? `Hoi thoai gan day:\n${safeHistory}` : "",
    `Yeu cau moi cua nguoi dung:\n${safePrompt}`
  ]
    .filter(Boolean)
    .join("\n\n");
}

function extractReplyFromChoices(payload) {
  const content = payload?.choices?.[0]?.message?.content;

  if (typeof content === "string") {
    return content;
  }

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

  if (typeof deltaContent === "string") {
    return deltaContent;
  }

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

async function requestTutorReply(finalPrompt) {
  const response = await fetch("https://api.siliconflow.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: modelName,
      messages: [
        {
          role: "user",
          content: finalPrompt
        }
      ],
      ...requestConfig
    })
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const remoteError =
      payload?.error?.message ||
      payload?.message ||
      "SiliconFlow khong tra ve phan hoi hop le.";
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

async function streamTutorReply(finalPrompt, res) {
  const response = await fetch("https://api.siliconflow.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: modelName,
      messages: [
        {
          role: "user",
          content: finalPrompt
        }
      ],
      stream: true,
      ...requestConfig
    })
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    const remoteError =
      payload?.error?.message ||
      payload?.message ||
      "SiliconFlow khong the stream phan hoi luc nay.";
    const error = new Error(remoteError);
    error.statusCode = response.status;
    throw error;
  }

  if (!response.body) {
    const fallbackReply = await requestTutorReply(finalPrompt);
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
    const error = new Error("Ban chua nhap cau hoi cho AI Tutor.");
    error.statusCode = 400;
    throw error;
  }

  if (!apiKey) {
    const error = new Error("AI Tutor chua duoc cau hinh khoa SiliconFlow tren server.");
    error.statusCode = 503;
    throw error;
  }

  return buildSystemPrompt({
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
    ? "AI Tutor dang hoi qua tai. Ban thu lai sau it phut nhe."
    : cleanText(error?.message, 260) || "Khong the lay phan hoi tu AI Tutor.";
}

exports.askTutor = async (req, res) => {
  try {
    const finalPrompt = buildPromptFromRequest(req);
    const reply = await requestTutorReply(finalPrompt);

    if (!reply) {
      return res.status(502).json({
        success: false,
        error: "AI Tutor chua tao duoc phan hoi phu hop."
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
    const finalPrompt = buildPromptFromRequest(req);
    setSseHeaders(res);
    sendStreamPacket(res, { type: "ready", model: modelName });
    await streamTutorReply(finalPrompt, res);
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
