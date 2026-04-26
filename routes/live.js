const express = require("express");
const rateLimit = require("express-rate-limit");
const { isLoggedIn, isPro } = require("../middlewares/auth");
const {
  buildLiveHubData,
  buildLiveReplayData,
  buildLiveRoomData,
  buildLiveStudioData,
  createLiveSession,
  createSessionChatMessage,
  createSessionQuestion,
  endLiveSession,
  findLegacySession,
  getLiveSessionById,
  getLiveSessionBySlug,
  issueSessionToken,
  listSessionChat,
  processProviderWebhook,
  recordLiveAttendancePing,
  startLiveSession,
  toggleRaiseHand,
  toggleReminderSubscription,
  updateRaiseHandStatus,
  updateSessionQuestionStatus,
} = require("../services/liveService");

const router = express.Router();

const createLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 8,
  standardHeaders: true,
  legacyHeaders: false,
});

const chatLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
});

const questionLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
});

const handLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
});

function sendError(req, res, error, fallbackRedirect = "/live") {
  const status = Number(error?.status || 500);
  const message = error?.message || "Đã xảy ra lỗi với tính năng livestream.";
  const acceptHeader = String(req.get("accept") || "");
  const wantsJson =
    req.xhr ||
    req.path.startsWith("/sessions") ||
    req.path.startsWith("/replays") ||
    req.path.startsWith("/webhooks") ||
    acceptHeader.includes("application/json") ||
    req.get("x-requested-with") === "XMLHttpRequest" ||
    req.get("sec-fetch-dest") === "empty";

  if (!wantsJson && req.accepts("html") && req.method === "GET") {
    req.flash("error", message);
    return res.redirect(fallbackRedirect);
  }

  return res.status(status).json({
    error: message,
    code: error?.code || "LIVE_ERROR",
  });
}

async function handleCreateSession(req, res) {
  const session = await createLiveSession({
    user: req.user,
    title: req.body.title,
    description: req.body.description,
    category: req.body.category,
    thumbnail: req.body.thumbnail,
    bindingType: req.body.bindingType,
    courseId: req.body.courseId,
    lessonId: req.body.lessonId,
    scheduledFor: req.body.scheduledFor,
    sessionMode: req.body.sessionMode,
  });

  return res.status(201).json({
    success: true,
    session,
    redirectUrl: session?.urls?.room || "/live",
  });
}

router.get("/", isLoggedIn, async (req, res) => {
  try {
    const data = await buildLiveHubData(req.user, req.query);
    res.render("liveList", {
      title: "Live Hub",
      user: req.user,
      activePage: "live",
      liveNow: data.liveNow,
      upcoming: data.upcoming,
      replays: data.replays,
      liveSubjects: data.subjects,
      liveCourses: data.courses,
      liveAdminSummary: data.adminSummary,
      liveFilters: data.filters,
    });
  } catch (error) {
    sendError(req, res, error);
  }
});

router.get("/create", isPro, async (req, res) => {
  try {
    const data = await buildLiveStudioData(req.user);
    res.render("liveCreate", {
      title: "Studio Livestream",
      user: req.user,
      activePage: "live",
      liveStudioCourses: data.courses,
      liveStudioLessons: data.lessons,
      suggestedSchedule: data.suggestedSchedule,
    });
  } catch (error) {
    sendError(req, res, error, "/live");
  }
});

router.get("/sessions", isLoggedIn, async (req, res) => {
  try {
    const data = await buildLiveHubData(req.user, req.query);
    res.json({ success: true, ...data });
  } catch (error) {
    sendError(req, res, error);
  }
});

router.post("/sessions", isPro, createLimiter, async (req, res) => {
  try {
    await handleCreateSession(req, res);
  } catch (error) {
    sendError(req, res, error);
  }
});

router.post("/create", isPro, createLimiter, async (req, res) => {
  try {
    await handleCreateSession(req, res);
  } catch (error) {
    sendError(req, res, error);
  }
});

router.get("/sessions/:slug", isLoggedIn, async (req, res) => {
  try {
    const session = await getLiveSessionBySlug(req.params.slug, req.user);
    if (!session) {
      return res.status(404).json({ error: "Không tìm thấy buổi live." });
    }
    res.json({ success: true, session });
  } catch (error) {
    sendError(req, res, error);
  }
});

router.post("/sessions/:id/start", isLoggedIn, async (req, res) => {
  try {
    const session = await startLiveSession(req.params.id, req.user);
    res.json({ success: true, session });
  } catch (error) {
    sendError(req, res, error);
  }
});

router.post("/sessions/:id/end", isLoggedIn, async (req, res) => {
  try {
    const session = await endLiveSession(req.params.id, req.user);
    res.json({ success: true, session });
  } catch (error) {
    sendError(req, res, error);
  }
});

router.post("/sessions/:id/token", isLoggedIn, async (req, res) => {
  try {
    const token = await issueSessionToken(req.params.id, req.user);
    res.json({ success: true, ...token });
  } catch (error) {
    sendError(req, res, error);
  }
});

router.get("/sessions/:id/chat", isLoggedIn, async (req, res) => {
  try {
    const messages = await listSessionChat(req.params.id);
    res.json({ success: true, messages });
  } catch (error) {
    sendError(req, res, error);
  }
});

router.post("/sessions/:id/chat", isLoggedIn, chatLimiter, async (req, res) => {
  try {
    const message = await createSessionChatMessage(req.params.id, req.user, req.body.content);
    res.status(201).json({ success: true, message });
  } catch (error) {
    sendError(req, res, error);
  }
});

router.post("/sessions/:id/questions", isLoggedIn, questionLimiter, async (req, res) => {
  try {
    const question = await createSessionQuestion(req.params.id, req.user, req.body.content);
    res.status(201).json({ success: true, question });
  } catch (error) {
    sendError(req, res, error);
  }
});

router.post("/sessions/:id/questions/:questionId/status", isLoggedIn, async (req, res) => {
  try {
    const question = await updateSessionQuestionStatus(
      req.params.id,
      req.params.questionId,
      req.user,
      req.body.status
    );
    res.json({ success: true, question });
  } catch (error) {
    sendError(req, res, error);
  }
});

router.post("/sessions/:id/hands", isLoggedIn, handLimiter, async (req, res) => {
  try {
    const hand = await toggleRaiseHand(req.params.id, req.user);
    res.json({ success: true, hand });
  } catch (error) {
    sendError(req, res, error);
  }
});

router.post("/sessions/:id/hands/:handId/status", isLoggedIn, async (req, res) => {
  try {
    const hand = await updateRaiseHandStatus(
      req.params.id,
      req.params.handId,
      req.user,
      req.body.status
    );
    res.json({ success: true, hand });
  } catch (error) {
    sendError(req, res, error);
  }
});

router.post("/sessions/:id/reminders/subscribe", isLoggedIn, async (req, res) => {
  try {
    const result = await toggleReminderSubscription(req.params.id, req.user);
    res.json({ success: true, ...result });
  } catch (error) {
    sendError(req, res, error);
  }
});

router.post("/sessions/:id/attendance/ping", isLoggedIn, async (req, res) => {
  try {
    const attendance = await recordLiveAttendancePing(req.params.id, req.user);
    res.json({ success: true, attendance });
  } catch (error) {
    sendError(req, res, error);
  }
});

router.post("/webhooks/provider", async (req, res) => {
  try {
    const rawBody =
      req.rawBody ||
      (typeof req.body === "string" ? req.body : JSON.stringify(req.body || {}));
    const result = await processProviderWebhook(rawBody, req.get("authorization") || "");
    res.json({ success: true, ...result });
  } catch (error) {
    sendError(req, res, error);
  }
});

router.get("/replays/:slug", isLoggedIn, async (req, res) => {
  try {
    const data = await buildLiveReplayData(req.params.slug, req.user);
    res.json({ success: true, ...data });
  } catch (error) {
    sendError(req, res, error);
  }
});

router.get("/joinLive/:roomId", isLoggedIn, async (req, res) => {
  try {
    const legacySession = await findLegacySession(req.params.roomId);
    if (!legacySession?.slug) {
      req.flash("error", "Phòng live cũ này không còn tồn tại.");
      return res.redirect("/live");
    }
    res.redirect(`/live/${legacySession.slug}`);
  } catch (error) {
    sendError(req, res, error, "/live");
  }
});

router.get("/getToken", isLoggedIn, async (req, res) => {
  try {
    const sessionId = String(req.query.roomId || "").trim();
    let session = await getLiveSessionById(sessionId, req.user);
    if (!session) {
      const legacySession = await findLegacySession(sessionId);
      if (legacySession?.slug) {
        session = await getLiveSessionBySlug(legacySession.slug, req.user);
      }
    }
    if (!session) {
      return res.status(404).json({ error: "Không tìm thấy buổi live tương ứng." });
    }
    const token = await issueSessionToken(session.id, req.user);
    res.json({ success: true, ...token });
  } catch (error) {
    sendError(req, res, error);
  }
});

router.get("/:slug/replay", isLoggedIn, async (req, res) => {
  try {
    const data = await buildLiveReplayData(req.params.slug, req.user);
    res.render("liveReplay", {
      title: `Replay | ${data.session.title}`,
      user: req.user,
      activePage: "live",
      liveRoomData: data,
    });
  } catch (error) {
    sendError(req, res, error, "/live");
  }
});

router.get("/:slug", isLoggedIn, async (req, res) => {
  try {
    const data = await buildLiveRoomData(req.params.slug, req.user);
    res.render("liveRoom", {
      title: data.session.title,
      user: req.user,
      activePage: "live",
      disableActivityHeartbeat: true,
      liveRoomData: data,
    });
  } catch (error) {
    sendError(req, res, error, "/live");
  }
});

module.exports = router;
