const moment = require("moment-timezone");
const {
  AccessToken,
  RoomServiceClient,
  EgressClient,
  WebhookReceiver,
} = require("livekit-server-sdk");
const { EncodedFileOutput, EncodedFileType, S3Upload } = require("@livekit/protocol");

const Course = require("../models/Course");
const Lesson = require("../models/Lesson");
const Subject = require("../models/Subject");
const User = require("../models/User");
const UserActivityLog = require("../models/UserActivityLog");
const LiveAttendance = require("../models/LiveAttendance");
const LiveChatMessage = require("../models/LiveChatMessage");
const { LiveHandRaise } = require("../models/LiveHandRaise");
const { LiveQuestion } = require("../models/LiveQuestion");
const {
  LiveSession,
  LIVE_REPLAY_STATUSES,
} = require("../models/LiveSession");
const { hasProAccess } = require("../middlewares/auth");
const {
  buildCourseVisibilityFilter,
  buildLessonVisibilityFilter,
} = require("../utils/contentAccess");
const { buildCoursePath } = require("../utils/urlHelpers");
const { getIo } = require("../utils/realtime");

const APP_TIMEZONE = process.env.APP_TIMEZONE || "Asia/Bangkok";
const LIVE_ATTENDANCE_QUALIFY_MINUTES = Math.max(
  1,
  Number(process.env.LIVE_ATTENDANCE_QUALIFY_MINUTES || 10)
);
const LIVE_ATTENDANCE_REWARD_POINTS = Math.max(
  0,
  Number(process.env.LIVE_ATTENDANCE_REWARD_POINTS || 5)
);
const LIVE_ACTIVE_PING_WINDOW_MS = 2 * 60 * 1000;
const LIVEKIT_URL = String(process.env.LIVEKIT_URL || "").trim();
const LIVEKIT_API_KEY = String(process.env.LIVEKIT_API_KEY || "").trim();
const LIVEKIT_API_SECRET = String(process.env.LIVEKIT_API_SECRET || "").trim();
const LIVEKIT_WEBHOOK_KEY = String(process.env.LIVEKIT_WEBHOOK_API_KEY || LIVEKIT_API_KEY).trim();
const LIVEKIT_WEBHOOK_SECRET = String(
  process.env.LIVEKIT_WEBHOOK_SECRET || LIVEKIT_API_SECRET
).trim();

let roomServiceClient = null;
let egressClient = null;
let webhookReceiver = null;

function createLiveError(status, message, code = "LIVE_ERROR") {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function normalizeText(value, fallback = "", maxLength = 0) {
  const normalized = String(value || fallback).trim();
  if (!maxLength || normalized.length <= maxLength) {
    return normalized;
  }
  return normalized.slice(0, maxLength).trim();
}

function toIdString(value) {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object") {
    if (value._id) return toIdString(value._id);
    if (typeof value.toHexString === "function") return value.toHexString();
  }
  return String(value);
}

function getUserAvatar(user) {
  return (
    String(user?.avatar || "").trim() ||
    "https://static.vecteezy.com/system/resources/previews/013/360/247/non_2x/default-avatar-photo-icon-social-media-profile-sign-symbol-vector.jpg"
  );
}

function getProviderKind() {
  return isLiveKitConfigured() ? "livekit" : "mock";
}

function isLiveKitConfigured() {
  return !!(LIVEKIT_URL && LIVEKIT_API_KEY && LIVEKIT_API_SECRET);
}

function isLiveRecordingConfigured() {
  return !!(
    isLiveKitConfigured() &&
    process.env.LIVEKIT_EGRESS_S3_ACCESS_KEY &&
    process.env.LIVEKIT_EGRESS_S3_SECRET &&
    process.env.LIVEKIT_EGRESS_S3_REGION &&
    process.env.LIVEKIT_EGRESS_S3_BUCKET
  );
}

function getRoomServiceClient() {
  if (!isLiveKitConfigured()) return null;
  if (!roomServiceClient) {
    roomServiceClient = new RoomServiceClient(
      LIVEKIT_URL,
      LIVEKIT_API_KEY,
      LIVEKIT_API_SECRET
    );
  }
  return roomServiceClient;
}

function getEgressClient() {
  if (!isLiveKitConfigured()) return null;
  if (!egressClient) {
    egressClient = new EgressClient(LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET);
  }
  return egressClient;
}

function getWebhookReceiver() {
  if (!isLiveKitConfigured()) return null;
  if (!webhookReceiver) {
    webhookReceiver = new WebhookReceiver(LIVEKIT_WEBHOOK_KEY, LIVEKIT_WEBHOOK_SECRET);
  }
  return webhookReceiver;
}

function formatLiveDate(value, fallback = "Chưa chốt lịch") {
  if (!value) return fallback;
  return moment(value).tz(APP_TIMEZONE).format("HH:mm • DD/MM/YYYY");
}

function buildProviderRoomName(session) {
  return `httd-live-${toIdString(session?._id || session)}`;
}

function serializeHost(hostUser) {
  if (!hostUser) {
    return {
      id: "",
      username: "Ẩn danh",
      avatar: getUserAvatar(null),
      flags: { isPro: false, isTeacher: false, isAdmin: false },
    };
  }

  return {
    id: toIdString(hostUser._id || hostUser),
    username: normalizeText(hostUser.username, "Bạn học", 80),
    avatar: getUserAvatar(hostUser),
    flags: {
      isPro: !!hostUser.isPro,
      isTeacher: !!hostUser.isTeacher,
      isAdmin: !!hostUser.isAdmin,
    },
  };
}

function getLinkedMaterialSummary(session) {
  if (!session) return null;

  if (session.bindingType === "course" && session.courseId) {
    const course = session.courseId;
    return {
      type: "course",
      title: course.title || "Khóa học liên quan",
      href: buildCoursePath(course),
      secondaryTitle: session.subjectId?.name || "",
      secondaryHref: session.subjectId?._id
        ? `/subjects/${session.subjectId._id}/${session.subjectId.slug || ""}`
        : "",
      ctaLabel: "Mở khóa học",
    };
  }

  if (session.bindingType === "lesson" && session.lessonId) {
    const lesson = session.lessonId;
    return {
      type: "lesson",
      title: lesson.title || "Bài học liên quan",
      href: `/lesson/${toIdString(lesson._id || lesson)}`,
      secondaryTitle: session.courseId?.title || "",
      secondaryHref: session.courseId ? buildCoursePath(session.courseId) : "",
      ctaLabel: "Mở bài học",
    };
  }

  return null;
}

function isSessionHost(session, user) {
  if (!session || !user) return false;
  return toIdString(session.hostUser) === toIdString(user._id);
}

function isSessionModerator(session, user) {
  if (!session || !user) return false;
  if (user.isAdmin) return true;
  if (isSessionHost(session, user)) return true;
  return Array.isArray(session.moderatorUsers)
    ? session.moderatorUsers.some((entry) => toIdString(entry) === toIdString(user._id))
    : false;
}

function getSessionRole(session, user) {
  if (!user) return "guest";
  if (isSessionHost(session, user)) return "host";
  if (isSessionModerator(session, user)) return "moderator";
  return "viewer";
}

function getSessionStatusMeta(session) {
  const status = session?.status || "scheduled";
  switch (status) {
    case "live":
      return { label: "Đang phát", tone: "live" };
    case "ended":
      return { label: "Đã kết thúc", tone: "ended" };
    case "cancelled":
      return { label: "Đã hủy", tone: "cancelled" };
    case "failed":
      return { label: "Lỗi phòng", tone: "failed" };
    default:
      return { label: "Sắp diễn ra", tone: "scheduled" };
  }
}

function getReplayMeta(session) {
  const replayStatus = LIVE_REPLAY_STATUSES.includes(session?.replayStatus)
    ? session.replayStatus
    : "pending";

  switch (replayStatus) {
    case "ready":
      return { label: "Có replay", tone: "ready" };
    case "failed":
      return { label: "Replay lỗi", tone: "failed" };
    case "expired":
      return { label: "Replay hết hạn", tone: "expired" };
    default:
      return { label: "Đang xử lý replay", tone: "pending" };
  }
}

function serializeSession(session, user, extra = {}) {
  const statusMeta = getSessionStatusMeta(session);
  const replayMeta = getReplayMeta(session);
  const linkedMaterial = getLinkedMaterialSummary(session);
  const role = getSessionRole(session, user);
  const scheduledLabel = formatLiveDate(session.scheduledFor || session.actualStartedAt);

  return {
    id: toIdString(session._id),
    slug: session.slug,
    title: session.title,
    description: session.description || "",
    category: session.category || "Học tập",
    thumbnail:
      session.thumbnail ||
      "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=1200&q=80",
    visibility: session.visibility || "logged_in",
    sessionMode: session.sessionMode || "scheduled",
    status: session.status,
    statusLabel: statusMeta.label,
    statusTone: statusMeta.tone,
    replayStatus: session.replayStatus,
    replayLabel: replayMeta.label,
    replayTone: replayMeta.tone,
    scheduledFor: session.scheduledFor,
    scheduledLabel,
    actualStartedAt: session.actualStartedAt,
    endedAt: session.endedAt,
    providerKind: session.providerKind || "mock",
    viewerCount: Number(session.viewerCountSnapshot || 0),
    viewerPeak: Number(session.viewerPeak || 0),
    uniqueViewerCount: Number(session.uniqueViewerCount || 0),
    attendanceQualifiedCount: Number(session.attendanceQualifiedCount || 0),
    chatMessagesCount: Number(session.chatMessagesCount || 0),
    questionsCount: Number(session.questionsCount || 0),
    raisedHandsCount: Number(session.raisedHandsCount || 0),
    replayUrl: session.replayPlaybackUrl || session.replayUrl || "",
    replayNote: session.replayNote || "",
    host: serializeHost(session.hostUser),
    linkedMaterial,
    subject: session.subjectId
      ? {
          id: toIdString(session.subjectId._id || session.subjectId),
          name: session.subjectId.name || "Môn học",
        }
      : null,
    permissions: {
      role,
      canModerate: role === "host" || role === "moderator",
      canStart:
        ["scheduled", "draft", "failed"].includes(session.status) &&
        (role === "host" || role === "moderator"),
      canEnd: session.status === "live" && (role === "host" || role === "moderator"),
      canJoinRoom: role !== "guest",
      canCreate: !!user && hasProAccess(user),
      isReminderSubscribed:
        !!user && Array.isArray(session.reminderSubscribers)
          ? session.reminderSubscribers.some(
              (entry) => toIdString(entry) === toIdString(user._id)
            )
          : false,
    },
    urls: {
      room: `/live/${session.slug}`,
      replay: `/live/${session.slug}/replay`,
      api: `/live/sessions/${session._id}`,
    },
    ...extra,
  };
}

function applySessionPopulate(query) {
  return query
    .populate("hostUser", "username avatar isPro isTeacher isAdmin")
    .populate("subjectId", "name slug")
    .populate("courseId", "title thumbnail slug subjectId")
    .populate("lessonId", "title courseId subjectId");
}

async function resolveBindingSelection(user, bindingType, courseId, lessonId) {
  if (!bindingType) {
    return {
      bindingType: null,
      subjectId: null,
      courseId: null,
      lessonId: null,
    };
  }

  if (bindingType === "course") {
    if (!courseId) {
      throw createLiveError(400, "Bạn cần chọn khóa học để gắn buổi live.");
    }

    const course = await Course.findOne(
      buildCourseVisibilityFilter(user, { _id: courseId })
    )
      .select("_id title subjectId thumbnail slug")
      .lean();

    if (!course) {
      throw createLiveError(404, "Không tìm thấy khóa học hợp lệ để gắn livestream.");
    }

    return {
      bindingType: "course",
      subjectId: course.subjectId || null,
      courseId: course._id,
      lessonId: null,
      course,
      lesson: null,
    };
  }

  if (bindingType === "lesson") {
    if (!lessonId) {
      throw createLiveError(400, "Bạn cần chọn bài học để gắn buổi live.");
    }

    const lesson = await Lesson.findOne(
      buildLessonVisibilityFilter(user, { _id: lessonId })
    )
      .select("_id title courseId subject subjectId")
      .populate("courseId", "_id title thumbnail slug subjectId")
      .lean();

    if (!lesson) {
      throw createLiveError(404, "Không tìm thấy bài học hợp lệ để gắn livestream.");
    }

    return {
      bindingType: "lesson",
      subjectId:
        lesson.subjectId ||
        lesson.subject ||
        lesson.courseId?.subjectId ||
        null,
      courseId: lesson.courseId?._id || lesson.courseId || null,
      lessonId: lesson._id,
      course: lesson.courseId || null,
      lesson,
    };
  }

  throw createLiveError(400, "Liên kết bài học/khóa học chưa hợp lệ.");
}

async function ensureNoConflictingLive(hostUserId, ignoreSessionId = null) {
  const filter = {
    hostUser: hostUserId,
    status: "live",
  };

  if (ignoreSessionId) {
    filter._id = { $ne: ignoreSessionId };
  }

  const existing = await LiveSession.findOne(filter).select("_id slug title").lean();
  if (existing) {
    throw createLiveError(
      409,
      `Bạn đang có buổi live khác đang phát: ${existing.title}.`,
      "LIVE_CONFLICT"
    );
  }
}

async function ensureProviderRoom(session) {
  const providerRoomName = session.providerRoomName || buildProviderRoomName(session);

  if (!isLiveKitConfigured()) {
    if (session.providerRoomName !== providerRoomName || session.providerKind !== "mock") {
      session.providerRoomName = providerRoomName;
      session.providerKind = "mock";
      await session.save();
    }

    return {
      providerKind: "mock",
      roomName: providerRoomName,
      roomSid: session.providerRoomSid || "",
    };
  }

  const roomClient = getRoomServiceClient();
  if (!roomClient) {
    // Fallback to mock if client creation failed
    session.providerKind = "mock";
    session.providerRoomName = providerRoomName;
    await session.save();
    return {
      providerKind: "mock",
      roomName: providerRoomName,
      roomSid: "",
    };
  }

  let room = null;

  try {
    const existingRooms = await roomClient.listRooms([providerRoomName]);
    room = Array.isArray(existingRooms) && existingRooms.length > 0 ? existingRooms[0] : null;
  } catch (error) {
    console.error("[LiveService] Error listing rooms:", error.message);
    room = null;
  }

  if (!room) {
    try {
      room = await roomClient.createRoom({
        name: providerRoomName,
        emptyTimeout: 15 * 60,
        departureTimeout: 120,
        maxParticipants: 150,
        metadata: JSON.stringify({
          sessionId: toIdString(session._id),
          slug: session.slug,
          title: session.title,
          hostUser: toIdString(session.hostUser),
        }),
      });
    } catch (error) {
      console.error("[LiveService] Error creating room:", error.message);
      // Fallback to mock on creation failure
      session.providerKind = "mock";
      session.providerRoomName = providerRoomName;
      await session.save();
      return {
        providerKind: "mock",
        roomName: providerRoomName,
        roomSid: "",
      };
    }
  }

  session.providerKind = "livekit";
  session.providerRoomName = providerRoomName;
  session.providerRoomSid = room?.sid || session.providerRoomSid || "";
  await session.save();

  return {
    providerKind: "livekit",
    roomName: providerRoomName,
    roomSid: room?.sid || "",
  };
}

async function maybeStartRecording(session) {
  if (!isLiveRecordingConfigured()) {
    return { started: false, reason: "recording_not_configured" };
  }

  const egress = getEgressClient();
  if (!egress) {
    return { started: false, reason: "egress_client_unavailable" };
  }

  const upload = new S3Upload({
    accessKey: String(process.env.LIVEKIT_EGRESS_S3_ACCESS_KEY || ""),
    secret: String(process.env.LIVEKIT_EGRESS_S3_SECRET || ""),
    sessionToken: String(process.env.LIVEKIT_EGRESS_S3_SESSION_TOKEN || ""),
    region: String(process.env.LIVEKIT_EGRESS_S3_REGION || ""),
    endpoint: String(process.env.LIVEKIT_EGRESS_S3_ENDPOINT || ""),
    bucket: String(process.env.LIVEKIT_EGRESS_S3_BUCKET || ""),
    forcePathStyle: String(process.env.LIVEKIT_EGRESS_S3_FORCE_PATH_STYLE || "false") === "true",
    metadata: {
      liveSessionId: toIdString(session._id),
      liveSessionSlug: session.slug,
    },
    tagging: String(process.env.LIVEKIT_EGRESS_S3_TAGGING || ""),
    contentDisposition: String(process.env.LIVEKIT_EGRESS_S3_CONTENT_DISPOSITION || ""),
    assumeRoleArn: String(process.env.LIVEKIT_EGRESS_S3_ASSUME_ROLE_ARN || ""),
    assumeRoleExternalId: String(
      process.env.LIVEKIT_EGRESS_S3_ASSUME_ROLE_EXTERNAL_ID || ""
    ),
  });

  const output = new EncodedFileOutput({
    fileType: EncodedFileType.MP4,
    filepath: `${String(process.env.LIVEKIT_EGRESS_S3_PREFIX || "livestreams").replace(/\/$/, "")}/${session.slug}-${Date.now()}.mp4`,
    output: {
      case: "s3",
      value: upload,
    },
  });

  try {
    const result = await egress.startRoomCompositeEgress(session.providerRoomName, output);

    session.providerEgressId = result?.egressId || session.providerEgressId || "";
    session.replayStatus = "pending";
    session.replayNote = "Đang chờ LiveKit xử lý replay sau khi buổi live kết thúc.";
    await session.save();

    return {
      started: true,
      egressId: result?.egressId || "",
    };
  } catch (error) {
    console.error("[LiveService] Error starting recording:", error.message);
    return { started: false, reason: "egress_api_error", error: error.message };
  }
}

function buildActivityDateKey(date = new Date()) {
  return moment(date).tz(APP_TIMEZONE).format("YYYY-MM-DD");
}

async function incrementUserActivityMinute(userId, minutes) {
  const safeMinutes = Math.max(0, Number(minutes || 0));
  if (!safeMinutes) return;

  const dateStr = buildActivityDateKey();
  await UserActivityLog.findOneAndUpdate(
    { user: userId, dateStr },
    {
      $inc: { minutes: safeMinutes },
      $set: { lastActive: new Date() },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}

async function refreshSessionMetrics(sessionId) {
  const activeSince = new Date(Date.now() - LIVE_ACTIVE_PING_WINDOW_MS);
  const [
    viewerCountSnapshot,
    uniqueViewerCount,
    attendanceQualifiedCount,
    chatMessagesCount,
    questionsCount,
    raisedHandsCount,
  ] = await Promise.all([
    LiveAttendance.countDocuments({
      sessionId,
      lastPingAt: { $gte: activeSince },
    }),
    LiveAttendance.countDocuments({ sessionId }),
    LiveAttendance.countDocuments({ sessionId, qualified: true }),
    LiveChatMessage.countDocuments({ sessionId, hidden: false }),
    LiveQuestion.countDocuments({
      sessionId,
      status: { $in: ["queued", "pinned", "answered"] },
    }),
    LiveHandRaise.countDocuments({
      sessionId,
      status: { $in: ["raised", "accepted"] },
    }),
  ]);

  const session = await LiveSession.findById(sessionId);
  if (!session) return null;

  session.viewerCountSnapshot = viewerCountSnapshot;
  session.viewerPeak = Math.max(Number(session.viewerPeak || 0), viewerCountSnapshot);
  session.uniqueViewerCount = uniqueViewerCount;
  session.attendanceQualifiedCount = attendanceQualifiedCount;
  session.chatMessagesCount = chatMessagesCount;
  session.questionsCount = questionsCount;
  session.raisedHandsCount = raisedHandsCount;
  await session.save();

  return session;
}

async function emitSessionUpdated(sessionId) {
  const session = await applySessionPopulate(LiveSession.findById(sessionId)).lean();
  if (!session) return null;

  const payload = serializeSession(session, null, {
    permissions: undefined,
  });
  const io = getIo();
  if (io) {
    io.to("live-hub").emit("liveSessionUpdated", payload);
    io.to(`live-session:${sessionId}`).emit("liveSessionUpdated", payload);
  }

  return payload;
}

function emitLiveReminder(userIds, payload) {
  const io = getIo();
  if (!io || !Array.isArray(userIds) || userIds.length === 0) return;

  userIds.forEach((userId) => {
    if (userId) {
      io.to(`user:${toIdString(userId)}`).emit("liveReminder", payload);
    }
  });
}

function emitRoomEvent(sessionId, eventName, payload) {
  const io = getIo();
  if (!io) return;
  io.to(`live-session:${sessionId}`).emit(eventName, payload);
}

async function createLiveSession({
  user,
  title,
  description,
  category,
  thumbnail,
  bindingType,
  courseId,
  lessonId,
  scheduledFor,
  sessionMode,
}) {
  if (!user || !hasProAccess(user)) {
    throw createLiveError(403, "Bạn cần PRO hoặc quyền Teacher/Admin để tạo livestream.");
  }

  const safeTitle = normalizeText(title, "", 160);
  if (safeTitle.length < 3) {
    throw createLiveError(400, "Tiêu đề buổi live cần dài ít nhất 3 ký tự.");
  }

  const mode = sessionMode === "instant" ? "instant" : "scheduled";
  const binding = await resolveBindingSelection(user, bindingType, courseId, lessonId);
  await ensureNoConflictingLive(user._id);

  let scheduledDate = null;
  if (mode === "scheduled") {
    scheduledDate = scheduledFor ? new Date(scheduledFor) : null;
    if (!scheduledDate || Number.isNaN(scheduledDate.getTime())) {
      throw createLiveError(400, "Bạn cần chọn thời gian phát hợp lệ.");
    }
  } else {
    scheduledDate = new Date();
  }

  const session = new LiveSession({
    title: safeTitle,
    description: normalizeText(description, "", 2400),
    category: normalizeText(category, "Học tập", 60) || "Học tập",
    thumbnail: normalizeText(thumbnail, "", 1200),
    hostUser: user._id,
    subjectId: binding.subjectId,
    courseId: binding.courseId,
    lessonId: binding.lessonId,
    bindingType: binding.bindingType,
    sessionMode: mode,
    status: mode === "instant" ? "live" : "scheduled",
    scheduledFor: scheduledDate,
    actualStartedAt: mode === "instant" ? new Date() : null,
    providerKind: getProviderKind(),
    replayStatus: mode === "instant" ? "pending" : "ready",
  });

  session.providerRoomName = buildProviderRoomName(session);
  if (mode !== "instant") {
    session.replayStatus = "ready";
    session.replayNote = "Replay sẽ xuất hiện ở đây sau khi buổi live kết thúc.";
  }

  await session.save();

  if (mode === "instant") {
    try {
      await ensureProviderRoom(session);
    } catch (error) {
      session.providerError = normalizeText(error.message, "", 900);
      session.providerKind = "mock";
      session.providerRoomName = buildProviderRoomName(session);
      session.replayStatus = "ready";
      session.replayNote = "Không thể kết nối LiveKit, chuyển sang chế độ mock.";
      await session.save();
    }

    if (session.providerKind === "livekit") {
      try {
        await maybeStartRecording(session);
      } catch (error) {
        session.providerError = normalizeText(error.message, "", 900);
        session.replayStatus = "failed";
        session.replayNote = "Không thể khởi tạo recording tự động, buổi live vẫn tiếp tục.";
        await session.save();
      }
    } else {
      session.replayStatus = "ready";
      session.replayNote = "Mock room đang bật. Replay chỉ lưu metadata, chat và Q&A.";
      await session.save();
    }
  }

  await emitSessionUpdated(session._id);
  return getLiveSessionById(session._id, user);
}

async function startLiveSession(sessionId, user) {
  const session = await LiveSession.findById(sessionId);
  if (!session) {
    throw createLiveError(404, "Không tìm thấy buổi live.");
  }
  if (!isSessionModerator(session, user)) {
    throw createLiveError(403, "Bạn không có quyền bắt đầu buổi live này.");
  }
  if (session.status === "live") {
    return getLiveSessionById(sessionId, user);
  }

  await ensureNoConflictingLive(session.hostUser, session._id);
  session.status = "live";
  session.actualStartedAt = session.actualStartedAt || new Date();
  session.scheduledFor = session.scheduledFor || session.actualStartedAt;
  session.replayStatus = "pending";
  session.replayNote = "Buổi live đang phát. Replay sẽ cập nhật sau khi kết thúc.";

  await session.save();
  await ensureProviderRoom(session);

  if (session.providerKind === "livekit") {
    try {
      await maybeStartRecording(session);
    } catch (error) {
      session.providerError = normalizeText(error.message, "", 900);
      session.replayStatus = "failed";
      session.replayNote = "Recording chưa khởi tạo được, nhưng phòng live đã lên sóng.";
      await session.save();
    }
  } else {
    session.replayStatus = "ready";
    session.replayNote = "Mock room đang phát. Replay sẽ là bản tóm tắt nội dung và tương tác.";
    await session.save();
  }

  await refreshSessionMetrics(sessionId);
  await emitSessionUpdated(sessionId);
  return getLiveSessionById(sessionId, user);
}

async function endLiveSession(sessionId, user) {
  const session = await LiveSession.findById(sessionId);
  if (!session) {
    throw createLiveError(404, "Không tìm thấy buổi live.");
  }
  if (!isSessionModerator(session, user)) {
    throw createLiveError(403, "Bạn không có quyền kết thúc buổi live này.");
  }

  const now = new Date();
  session.status = "ended";
  session.endedAt = now;

  if (session.providerKind === "livekit" && session.providerEgressId && isLiveRecordingConfigured()) {
    session.replayStatus = "pending";
    session.replayNote = "Replay đang được LiveKit xử lý sau khi phòng vừa kết thúc.";
  } else {
    session.replayStatus = "ready";
    session.replayNote =
      session.providerKind === "mock"
        ? "Mock room đã kết thúc. Replay hiện gồm metadata, chat và Q&A snapshot."
        : "Phòng đã kết thúc. Chưa cấu hình recording tự động nên replay chỉ gồm metadata và bản tóm tắt.";
  }

  await session.save();

  if (session.providerKind === "livekit") {
    try {
      const roomClient = getRoomServiceClient();
      if (roomClient && session.providerRoomName) {
        await roomClient.deleteRoom(session.providerRoomName);
      }
    } catch (error) {
      session.providerError = normalizeText(error.message, "", 900);
      await session.save();
    }
  }

  await LiveAttendance.updateMany(
    { sessionId, $or: [{ leftAt: null }, { leftAt: { $exists: false } }] },
    { $set: { leftAt: now } }
  );

  await refreshSessionMetrics(sessionId);
  await emitSessionUpdated(sessionId);
  return getLiveSessionById(sessionId, user);
}

async function getLiveSessionById(sessionId, user) {
  const session = await applySessionPopulate(LiveSession.findById(sessionId)).lean();
  if (!session) return null;
  return serializeSession(session, user);
}

async function getLiveSessionBySlug(slug, user) {
  const session = await applySessionPopulate(LiveSession.findOne({ slug })).lean();
  if (!session) return null;
  return serializeSession(session, user);
}

async function findLiveSessionDocumentBySlug(slug) {
  return applySessionPopulate(LiveSession.findOne({ slug })).lean();
}

async function findLiveSessionDocumentById(sessionId) {
  return applySessionPopulate(LiveSession.findById(sessionId)).lean();
}

async function listLiveSessions(user, filters = {}) {
  const queryText = normalizeText(filters.q || filters.query || "", "", 120);
  const hostText = normalizeText(filters.host || "", "", 80).toLowerCase();
  const subjectId = normalizeText(filters.subjectId || "", "", 24);
  const courseId = normalizeText(filters.courseId || "", "", 24);
  const now = new Date();

  const baseFilter = {};
  if (subjectId) baseFilter.subjectId = subjectId;
  if (courseId) baseFilter.courseId = courseId;
  if (queryText) {
    baseFilter.$or = [
      { title: { $regex: queryText, $options: "i" } },
      { description: { $regex: queryText, $options: "i" } },
      { category: { $regex: queryText, $options: "i" } },
    ];
  }

  const [liveNowDocs, upcomingDocs, replayDocs] = await Promise.all([
    applySessionPopulate(
      LiveSession.find({
        ...baseFilter,
        status: "live",
      }).sort({ actualStartedAt: -1, scheduledFor: 1 }).limit(12)
    ).lean(),
    applySessionPopulate(
      LiveSession.find({
        ...baseFilter,
        status: "scheduled",
        scheduledFor: { $gte: new Date(now.getTime() - 6 * 60 * 60 * 1000) },
      })
        .sort({ scheduledFor: 1 })
        .limit(20)
    ).lean(),
    applySessionPopulate(
      LiveSession.find({
        ...baseFilter,
        status: "ended",
      })
        .sort({ endedAt: -1 })
        .limit(18)
    ).lean(),
  ]);

  const filterByHost = (items) =>
    !hostText
      ? items
      : items.filter((session) =>
          String(session.hostUser?.username || "").toLowerCase().includes(hostText)
        );

  const liveNow = filterByHost(liveNowDocs).map((session) => serializeSession(session, user));
  const upcoming = filterByHost(upcomingDocs).map((session) => serializeSession(session, user));
  const replays = filterByHost(replayDocs).map((session) => serializeSession(session, user));

  return {
    liveNow,
    upcoming,
    replays,
    filters: {
      q: queryText,
      host: hostText,
      subjectId,
      courseId,
    },
  };
}

async function getAdminLiveSummary() {
  const [total, liveNow, scheduled, ended, failed, pendingReplay] = await Promise.all([
    LiveSession.countDocuments({}),
    LiveSession.countDocuments({ status: "live" }),
    LiveSession.countDocuments({ status: "scheduled" }),
    LiveSession.countDocuments({ status: "ended" }),
    LiveSession.countDocuments({ status: "failed" }),
    LiveSession.countDocuments({ replayStatus: "pending" }),
  ]);

  return { total, liveNow, scheduled, ended, failed, pendingReplay };
}

async function buildLiveHubData(user, filters = {}) {
  const [sessionBuckets, subjects, courses, adminSummary] = await Promise.all([
    listLiveSessions(user, filters),
    Subject.find({}).select("_id name slug").sort({ name: 1 }).lean(),
    Course.find(buildCourseVisibilityFilter(user))
      .select("_id title slug subjectId")
      .sort({ createdAt: -1 })
      .limit(80)
      .lean(),
    user?.isAdmin ? getAdminLiveSummary() : Promise.resolve(null),
  ]);

  return {
    ...sessionBuckets,
    subjects,
    courses,
    adminSummary,
  };
}

async function buildLiveStudioData(user) {
  const [courses, lessons] = await Promise.all([
    Course.find(buildCourseVisibilityFilter(user))
      .select("_id title slug subjectId thumbnail")
      .sort({ createdAt: -1 })
      .limit(80)
      .lean(),
    Lesson.find(buildLessonVisibilityFilter(user))
      .select("_id title courseId subject subjectId")
      .sort({ createdAt: -1 })
      .limit(120)
      .lean(),
  ]);

  return {
    suggestedSchedule: moment().tz(APP_TIMEZONE).add(1, "hour").startOf("hour").format("YYYY-MM-DDTHH:mm"),
    courses,
    lessons,
  };
}

async function buildLiveRoomData(slug, user) {
  const sessionDoc = await applySessionPopulate(LiveSession.findOne({ slug })).lean();

  if (!sessionDoc) {
    throw createLiveError(404, "Không tìm thấy buổi livestream.");
  }

  const [chatMessages, questions, hands] = await Promise.all([
    LiveChatMessage.find({ sessionId: sessionDoc._id, hidden: false })
      .sort({ createdAt: 1 })
      .limit(60)
      .lean(),
    LiveQuestion.find({
      sessionId: sessionDoc._id,
      status: { $in: ["queued", "pinned", "answered"] },
    })
      .sort({ pinnedAt: -1, createdAt: 1 })
      .limit(50)
      .lean(),
    LiveHandRaise.find({
      sessionId: sessionDoc._id,
      status: { $in: ["raised", "accepted"] },
    })
      .sort({ raisedAt: 1 })
      .limit(40)
      .lean(),
  ]);

  return {
    session: serializeSession(sessionDoc, user),
    chatMessages: chatMessages.map((entry) => ({
      id: toIdString(entry._id),
      username: entry.username,
      avatar: entry.avatar || getUserAvatar(null),
      content: entry.content,
      isSystem: !!entry.isSystem,
      createdAt: entry.createdAt,
      userId: toIdString(entry.user),
    })),
    questions: questions.map((entry) => ({
      id: toIdString(entry._id),
      username: entry.username,
      avatar: entry.avatar || getUserAvatar(null),
      content: entry.content,
      status: entry.status,
      createdAt: entry.createdAt,
      userId: toIdString(entry.user),
    })),
    hands: hands.map((entry) => ({
      id: toIdString(entry._id),
      username: entry.username,
      avatar: entry.avatar || getUserAvatar(null),
      status: entry.status,
      raisedAt: entry.raisedAt,
      userId: toIdString(entry.user),
    })),
    livekitConfigured: isLiveKitConfigured(),
    recordingConfigured: isLiveRecordingConfigured(),
  };
}

async function buildLiveReplayData(slug, user) {
  return buildLiveRoomData(slug, user);
}

async function issueSessionToken(sessionId, user) {
  const session = await LiveSession.findById(sessionId);
  if (!session) {
    throw createLiveError(404, "Không tìm thấy buổi live.");
  }
  if (!user) {
    throw createLiveError(401, "Bạn cần đăng nhập để vào phòng live.");
  }
  if (
    Array.isArray(session.kickedUserIds) &&
    session.kickedUserIds.some((entry) => toIdString(entry) === toIdString(user._id))
  ) {
    throw createLiveError(403, "Bạn đã bị chặn khỏi buổi live này.");
  }

  const role = getSessionRole(session, user);
  const canModerate = role === "host" || role === "moderator";

  if (session.status !== "live") {
    return {
      providerKind: session.providerKind || getProviderKind(),
      token: "",
      url: LIVEKIT_URL,
      roomName: session.providerRoomName || buildProviderRoomName(session),
      joinReady: false,
      role,
      waitingReason:
        session.status === "ended"
          ? "Buổi live đã kết thúc."
          : "Buổi live chưa lên sóng. Hãy chờ host bắt đầu phòng.",
    };
  }

  await ensureProviderRoom(session);

  if (!isLiveKitConfigured()) {
    return {
      providerKind: "mock",
      token: `mock-${toIdString(session._id)}-${toIdString(user._id)}`,
      url: "",
      roomName: session.providerRoomName,
      joinReady: true,
      role,
      mockMode: true,
    };
  }

  const token = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
    identity: toIdString(user._id),
    name: normalizeText(user.username, "Bạn học", 80),
    ttl: "2h",
    metadata: JSON.stringify({
      sessionId: toIdString(session._id),
      role,
      avatar: getUserAvatar(user),
    }),
  });

  token.addGrant({
    room: session.providerRoomName,
    roomJoin: true,
    roomAdmin: canModerate,
    canPublish: canModerate,
    canSubscribe: true,
    canPublishData: true,
    canUpdateOwnMetadata: canModerate,
  });

  return {
    providerKind: "livekit",
    token: await token.toJwt(),
    url: LIVEKIT_URL,
    roomName: session.providerRoomName,
    joinReady: true,
    role,
  };
}

async function listSessionChat(sessionId) {
  const messages = await LiveChatMessage.find({ sessionId, hidden: false })
    .sort({ createdAt: 1 })
    .limit(80)
    .lean();

  return messages.map((entry) => ({
    id: toIdString(entry._id),
    userId: toIdString(entry.user),
    username: entry.username,
    avatar: entry.avatar || getUserAvatar(null),
    content: entry.content,
    createdAt: entry.createdAt,
    isSystem: !!entry.isSystem,
  }));
}

async function createSessionChatMessage(sessionId, user, content) {
  const session = await LiveSession.findById(sessionId);
  if (!session) {
    throw createLiveError(404, "Không tìm thấy buổi live.");
  }
  if (session.status === "ended" || session.status === "cancelled") {
    throw createLiveError(409, "Buổi live đã kết thúc, không thể gửi chat mới.");
  }
  if (
    Array.isArray(session.chatMutedUserIds) &&
    session.chatMutedUserIds.some((entry) => toIdString(entry) === toIdString(user._id))
  ) {
    throw createLiveError(403, "Bạn đang bị tắt quyền chat trong phòng này.");
  }

  const safeContent = normalizeText(content, "", 1200);
  if (safeContent.length < 1) {
    throw createLiveError(400, "Tin nhắn chat đang trống.");
  }

  const message = await LiveChatMessage.create({
    sessionId,
    user: user._id,
    username: normalizeText(user.username, "Bạn học", 80),
    avatar: getUserAvatar(user),
    content: safeContent,
  });

  await refreshSessionMetrics(sessionId);
  const payload = {
    id: toIdString(message._id),
    userId: toIdString(message.user),
    username: message.username,
    avatar: message.avatar,
    content: message.content,
    createdAt: message.createdAt,
    isSystem: false,
  };
  emitRoomEvent(sessionId, "liveChatMessage", payload);
  await emitSessionUpdated(sessionId);
  return payload;
}

async function createSessionQuestion(sessionId, user, content) {
  const session = await LiveSession.findById(sessionId);
  if (!session) {
    throw createLiveError(404, "Không tìm thấy buổi live.");
  }

  const safeContent = normalizeText(content, "", 1000);
  if (safeContent.length < 5) {
    throw createLiveError(400, "Câu hỏi nên dài ít nhất 5 ký tự.");
  }

  const question = await LiveQuestion.create({
    sessionId,
    user: user._id,
    username: normalizeText(user.username, "Bạn học", 80),
    avatar: getUserAvatar(user),
    content: safeContent,
  });

  await refreshSessionMetrics(sessionId);
  const payload = {
    id: toIdString(question._id),
    userId: toIdString(question.user),
    username: question.username,
    avatar: question.avatar,
    content: question.content,
    status: question.status,
    createdAt: question.createdAt,
  };
  emitRoomEvent(sessionId, "liveQuestionUpdate", payload);
  await emitSessionUpdated(sessionId);
  return payload;
}

async function updateSessionQuestionStatus(sessionId, questionId, user, status) {
  const session = await LiveSession.findById(sessionId);
  if (!session) throw createLiveError(404, "Không tìm thấy buổi live.");
  if (!isSessionModerator(session, user)) {
    throw createLiveError(403, "Bạn không có quyền duyệt câu hỏi trong phòng này.");
  }

  const question = await LiveQuestion.findOne({ _id: questionId, sessionId });
  if (!question) throw createLiveError(404, "Không tìm thấy câu hỏi.");

  const nextStatus = ["queued", "pinned", "answered", "dismissed"].includes(status)
    ? status
    : "queued";

  question.status = nextStatus;
  question.moderatedBy = user._id;
  if (nextStatus === "pinned") question.pinnedAt = new Date();
  if (nextStatus === "answered") question.answeredAt = new Date();
  if (nextStatus === "dismissed") question.dismissedAt = new Date();
  await question.save();

  await refreshSessionMetrics(sessionId);
  const payload = {
    id: toIdString(question._id),
    userId: toIdString(question.user),
    username: question.username,
    avatar: question.avatar,
    content: question.content,
    status: question.status,
    createdAt: question.createdAt,
  };
  emitRoomEvent(sessionId, "liveQuestionUpdate", payload);
  await emitSessionUpdated(sessionId);
  return payload;
}

async function toggleRaiseHand(sessionId, user) {
  const session = await LiveSession.findById(sessionId);
  if (!session) throw createLiveError(404, "Không tìm thấy buổi live.");

  let hand = await LiveHandRaise.findOne({ sessionId, user: user._id });
  let action = "raised";
  if (!hand) {
    hand = await LiveHandRaise.create({
      sessionId,
      user: user._id,
      username: normalizeText(user.username, "Bạn học", 80),
      avatar: getUserAvatar(user),
      status: "raised",
      raisedAt: new Date(),
    });
  } else if (hand.status === "raised" || hand.status === "accepted") {
    hand.status = "lowered";
    hand.handledBy = user._id;
    hand.handledAt = new Date();
    await hand.save();
    action = "lowered";
  } else {
    hand.status = "raised";
    hand.handledBy = null;
    hand.handledAt = null;
    hand.raisedAt = new Date();
    await hand.save();
  }

  await refreshSessionMetrics(sessionId);
  const payload = {
    id: toIdString(hand._id),
    userId: toIdString(hand.user),
    username: hand.username,
    avatar: hand.avatar,
    status: hand.status,
    raisedAt: hand.raisedAt,
    action,
  };
  emitRoomEvent(sessionId, "liveHandUpdate", payload);
  await emitSessionUpdated(sessionId);
  return payload;
}

async function updateRaiseHandStatus(sessionId, handId, user, status) {
  const session = await LiveSession.findById(sessionId);
  if (!session) throw createLiveError(404, "Không tìm thấy buổi live.");
  if (!isSessionModerator(session, user)) {
    throw createLiveError(403, "Bạn không có quyền xử lý lượt giơ tay.");
  }

  const hand = await LiveHandRaise.findOne({ _id: handId, sessionId });
  if (!hand) throw createLiveError(404, "Không tìm thấy lượt giơ tay.");

  const nextStatus = ["raised", "accepted", "lowered"].includes(status) ? status : "lowered";
  hand.status = nextStatus;
  hand.handledBy = user._id;
  hand.handledAt = new Date();
  await hand.save();

  await refreshSessionMetrics(sessionId);
  const payload = {
    id: toIdString(hand._id),
    userId: toIdString(hand.user),
    username: hand.username,
    avatar: hand.avatar,
    status: hand.status,
    raisedAt: hand.raisedAt,
  };
  emitRoomEvent(sessionId, "liveHandUpdate", payload);
  await emitSessionUpdated(sessionId);
  return payload;
}

async function toggleReminderSubscription(sessionId, user) {
  const session = await LiveSession.findById(sessionId);
  if (!session) throw createLiveError(404, "Không tìm thấy buổi live.");

  const userId = toIdString(user._id);
  const isSubscribed = Array.isArray(session.reminderSubscribers)
    ? session.reminderSubscribers.some((entry) => toIdString(entry) === userId)
    : false;

  if (isSubscribed) {
    session.reminderSubscribers = session.reminderSubscribers.filter(
      (entry) => toIdString(entry) !== userId
    );
  } else {
    session.reminderSubscribers.push(user._id);
  }

  await session.save();
  await emitSessionUpdated(sessionId);
  return { subscribed: !isSubscribed };
}

async function recordLiveAttendancePing(sessionId, user) {
  const session = await LiveSession.findById(sessionId);
  if (!session) throw createLiveError(404, "Không tìm thấy buổi live.");
  if (session.status === "cancelled") {
    throw createLiveError(409, "Buổi live đã bị hủy.");
  }
  if (session.status === "ended") {
    throw createLiveError(409, "Buổi live đã kết thúc.");
  }

  const now = new Date();
  let attendance = await LiveAttendance.findOne({ sessionId, user: user._id });
  let minutesToAdd = 1;
  let newlyQualified = false;

  if (!attendance) {
    attendance = new LiveAttendance({
      sessionId,
      user: user._id,
      joinedAt: now,
      lastJoinedAt: now,
      lastPingAt: now,
      leftAt: null,
      totalMinutes: 1,
      joinCount: 1,
    });
  } else {
    const diffMs = Math.max(
      0,
      now.getTime() - new Date(attendance.lastPingAt || now).getTime()
    );
    minutesToAdd = diffMs >= 45 * 1000 ? Math.max(1, Math.floor(diffMs / 60000)) : 0;
    if (minutesToAdd > 5) minutesToAdd = 5;

    attendance.lastPingAt = now;
    attendance.leftAt = null;
    attendance.lastJoinedAt = attendance.lastJoinedAt || now;
    attendance.totalMinutes =
      Math.max(0, Number(attendance.totalMinutes || 0)) + minutesToAdd;
  }

  if (!attendance.qualified && attendance.totalMinutes >= LIVE_ATTENDANCE_QUALIFY_MINUTES) {
    attendance.qualified = true;
    attendance.qualificationAwardedAt = now;
    newlyQualified = true;
  }

  await attendance.save();

  if (minutesToAdd > 0) {
    await incrementUserActivityMinute(user._id, minutesToAdd);
  }

  if (newlyQualified && LIVE_ATTENDANCE_REWARD_POINTS > 0) {
    await User.findByIdAndUpdate(user._id, {
      $inc: {
        points: LIVE_ATTENDANCE_REWARD_POINTS,
        totalPoints: LIVE_ATTENDANCE_REWARD_POINTS,
      },
    });
  }

  await refreshSessionMetrics(sessionId);
  await emitSessionUpdated(sessionId);
  return {
    totalMinutes: attendance.totalMinutes,
    qualified: attendance.qualified,
    qualifiedThreshold: LIVE_ATTENDANCE_QUALIFY_MINUTES,
    rewardPoints: newlyQualified ? LIVE_ATTENDANCE_REWARD_POINTS : 0,
  };
}

function buildReminderPayload(session, thresholdLabel) {
  return {
    sessionId: toIdString(session._id),
    slug: session.slug,
    title: session.title,
    thresholdLabel,
    scheduledLabel: formatLiveDate(session.scheduledFor),
    url: `/live/${session.slug}`,
  };
}

async function dispatchScheduledLiveReminders() {
  const now = moment().tz(APP_TIMEZONE);
  const sessions = await LiveSession.find({
    status: "scheduled",
    scheduledFor: { $gte: now.clone().subtract(5, "minutes").toDate() },
  }).select(
    "_id slug title scheduledFor reminderSubscribers lastReminderAt24h lastReminderAt1h lastReminderAt10m hostUser"
  );

  for (const session of sessions) {
    if (!session.scheduledFor) continue;
    const diffMinutes = moment(session.scheduledFor).diff(now, "minutes");
    const subscribers = Array.isArray(session.reminderSubscribers)
      ? session.reminderSubscribers
      : [];

    if (!subscribers.length) continue;

    if (diffMinutes <= 10 && diffMinutes >= 0 && !session.lastReminderAt10m) {
      emitLiveReminder(subscribers, buildReminderPayload(session, "10 phút nữa"));
      session.lastReminderAt10m = new Date();
      await session.save();
      continue;
    }

    if (diffMinutes <= 60 && diffMinutes > 10 && !session.lastReminderAt1h) {
      emitLiveReminder(subscribers, buildReminderPayload(session, "1 giờ nữa"));
      session.lastReminderAt1h = new Date();
      await session.save();
      continue;
    }

    if (diffMinutes <= 24 * 60 && diffMinutes > 60 && !session.lastReminderAt24h) {
      emitLiveReminder(subscribers, buildReminderPayload(session, "24 giờ nữa"));
      session.lastReminderAt24h = new Date();
      await session.save();
    }
  }
}

async function processProviderWebhook(rawBody, authHeader = "") {
  if (!isLiveKitConfigured()) {
    return { accepted: false, providerKind: "mock", reason: "livekit_not_configured" };
  }

  const receiver = getWebhookReceiver();
  const event = await receiver.receive(String(rawBody || ""), authHeader);
  const eventName = normalizeText(event?.event, "", 120);
  const roomName =
    normalizeText(event?.room?.name, "", 200) ||
    normalizeText(event?.roomName, "", 200) ||
    normalizeText(event?.egressInfo?.roomName, "", 200);

  if (!roomName) {
    return { accepted: true, event: eventName, sessionId: null };
  }

  const session = await LiveSession.findOne({ providerRoomName: roomName });
  if (!session) {
    return { accepted: true, event: eventName, sessionId: null };
  }

  session.providerLastWebhookEvent = eventName;
  session.providerLastWebhookAt = new Date();

  if (eventName === "room_started") {
    session.status = "live";
    session.actualStartedAt = session.actualStartedAt || new Date();
  }

  if (eventName === "room_finished") {
    session.status = "ended";
    session.endedAt = session.endedAt || new Date();
    if (!isLiveRecordingConfigured() && !session.replayPlaybackUrl) {
      session.replayStatus = "ready";
      session.replayNote =
        session.replayNote ||
        "Buổi live đã kết thúc. Replay hiện là bản metadata do chưa bật recording tự động.";
    }
  }

  if (eventName === "egress_updated" && event?.egressInfo) {
    const egressInfo = event.egressInfo;
    session.providerEgressId = egressInfo.egressId || session.providerEgressId || "";

    const firstFile = Array.isArray(egressInfo.fileResults)
      ? egressInfo.fileResults[0]
      : null;
    const playbackUrl = normalizeText(
      firstFile?.location || firstFile?.filename || firstFile?.filepath || "",
      "",
      1200
    );

    if (playbackUrl) {
      session.replayUrl = playbackUrl;
      session.replayPlaybackUrl = playbackUrl;
      session.replayStatus = "ready";
      session.replayNote = "Replay đã sẵn sàng từ LiveKit.";
    } else if (/failed|aborted|limit_reached|error/i.test(String(egressInfo.status || ""))) {
      session.replayStatus = "failed";
      session.replayNote = "LiveKit không thể hoàn tất recording của buổi này.";
    }
  }

  await session.save();
  await refreshSessionMetrics(session._id);
  await emitSessionUpdated(session._id);
  return {
    accepted: true,
    event: eventName,
    sessionId: toIdString(session._id),
  };
}

async function findLegacySession(roomId) {
  const normalized = normalizeText(roomId, "", 200);
  if (!normalized) return null;

  const lookup = [{ providerRoomName: normalized }, { providerRoomSid: normalized }];
  if (/^[a-f\d]{24}$/i.test(normalized)) {
    lookup.unshift({ _id: normalized });
  }

  const session = await LiveSession.findOne({
    $or: lookup,
  })
    .select("slug")
    .lean();

  return session || null;
}

async function getUpcomingDashboardSessions(user) {
  const sessions = await applySessionPopulate(
    LiveSession.find({
      status: { $in: ["scheduled", "live"] },
      $or: [{ hostUser: user._id }, { reminderSubscribers: user._id }],
    })
      .sort({ status: -1, scheduledFor: 1, actualStartedAt: -1 })
      .limit(4)
  ).lean();

  return sessions.map((session) => serializeSession(session, user));
}

module.exports = {
  APP_TIMEZONE,
  LIVE_ATTENDANCE_QUALIFY_MINUTES,
  LIVE_ATTENDANCE_REWARD_POINTS,
  buildLiveHubData,
  buildLiveReplayData,
  buildLiveRoomData,
  buildLiveStudioData,
  createLiveError,
  createLiveSession,
  createSessionChatMessage,
  createSessionQuestion,
  dispatchScheduledLiveReminders,
  endLiveSession,
  findLegacySession,
  findLiveSessionDocumentById,
  findLiveSessionDocumentBySlug,
  getAdminLiveSummary,
  getLiveSessionById,
  getLiveSessionBySlug,
  getProviderKind,
  getUpcomingDashboardSessions,
  isLiveKitConfigured,
  isLiveRecordingConfigured,
  issueSessionToken,
  listLiveSessions,
  listSessionChat,
  processProviderWebhook,
  recordLiveAttendancePing,
  refreshSessionMetrics,
  serializeSession,
  startLiveSession,
  toggleRaiseHand,
  toggleReminderSubscription,
  updateRaiseHandStatus,
  updateSessionQuestionStatus,
};
