const express = require("express");
const router = express.Router();
const multer = require("multer");
const axios = require("axios");
const jwt = require("jsonwebtoken");
const upload = multer();
const { isLoggedIn, isPro, hasProAccess } = require("../middlewares/auth");
const { getJwtSecret } = require("../utils/secrets");
const { processLessonContent, getWordDiff, gradeEssaySimple, gradeEssaySmart, gradeEssayAIAll, levenshtein } = require("../utils/essayHelpers");
const Lesson = require("../models/Lesson");
const Subject = require("../models/Subject");
const Unit = require("../models/Unit");
const Course = require("../models/Course");
const LessonCompletion = require("../models/LessonCompletion");
const User = require("../models/User");
const LessonRewardEvent = require('../models/LessonRewardEvent');
const LevelUtils = require("../utils/level");
const { achievementChecker } = require("../utils/achievementUtils");
const streakHelper = require("../utils/streakHelper");
const { grantRewardBundle } = require("../services/gardenRewardService");
const {
    buildCompletionGardenBundle,
    buildCompletionCelebrationPayload
} = require("../utils/lessonGamificationUtils");
const {
    getLessonAccessState,
    buildLessonVisibilityFilter
} = require("../utils/contentAccess");

const JWT_SECRET = getJwtSecret();

// Rate Limiters
const rateLimit = require("express-rate-limit");
const completeLimiter = rateLimit({ windowMs: 60000, max: 3, message: "Thử lại sau 1 phút." });

// Add Lesson UI
router.get("/add", isLoggedIn, async (req, res) => {
    try {
        const subjects = await Subject.find({}).lean();
        res.render("ManageLesson", { mode: "add", user: req.user, subjects, lesson: null, activePage: "lessonAdd" });
    } catch (e) { res.redirect("/dashboard"); }
});

// Add Lesson Submit
router.post("/add", isLoggedIn, async (req, res) => {
    // Captcha Check
    const turnstileToken = req.body["cf-turnstile-response"];
    if (!turnstileToken) { req.flash("error", "Thiếu Captcha."); return res.redirect("/lesson/add"); }
    
    try {
        // Verify Captcha
        const params = new URLSearchParams({ secret: process.env.TURNSTILE_SECRET_KEY, response: turnstileToken, remoteip: req.ip });
        const cfRes = await axios.post("https://challenges.cloudflare.com/turnstile/v0/siteverify", params);
        if (!cfRes.data.success) { req.flash("error", "Captcha sai."); return res.redirect("/lesson/add"); }

        // Process Data
        let { subjectId, title, category, type, tags, isProOnly } = req.body;
        const content = processLessonContent(req.body);
        const tagsArray = typeof tags === 'string' ? tags.split(',').map(t => t.trim()).filter(Boolean) : [];

        const newLesson = new Lesson({
            subject: subjectId, subjectId, title, content, category, type: type || "markdown",
            createdBy: req.user._id, editorData: req.body.editorData,
            isPro: isProOnly === "true", isProOnly: isProOnly === "true", tags: tagsArray
        });

        await newLesson.save();
        req.app.locals.io.emit("newLesson", { lessonId: newLesson._id, title });
        req.flash("success", "Thêm bài thành công!");
        res.redirect("/subjects/" + subjectId);

    } catch (e) {
        console.error(e);
        req.flash("error", "Lỗi thêm bài.");
        res.redirect("/lesson/add");
    }
});

// View Lesson
router.get("/:id", isLoggedIn, async (req, res) => {
    try {
        const lesson = await Lesson.findById(req.params.id).populate("createdBy", "username avatar isTeacher").lean();
        if (!lesson) return res.redirect("/subjects");

        let course = null;
        try {
            if (lesson.courseId) {
                course = await Course.findById(lesson.courseId).populate('subjectId', 'name _id').lean();
            }
        } catch (e) { course = null; }

        const access = await getLessonAccessState(req.user, lesson, { course });
        if (!access.allowed) {
            if (access.needsPro) {
                req.flash("error", "Can PRO.");
                return res.redirect("/upgrade");
            }
            return res.redirect("/subjects");
        }

        course = access.course || course;

        // Try to resolve subject: primary source is lesson.subject, fallback to lesson.subjectId
        let subject = null;
        try {
            if (lesson.subject) subject = await Subject.findById(lesson.subject).select("name").lean();
            else if (lesson.subjectId) subject = await Subject.findById(lesson.subjectId).select("name").lean();
        } catch (e) { subject = null; }

        // Try to load Unit if lesson has unitId (may be null)
        let unit = null;
        if (lesson.unitId) {
            try {
                unit = await Unit.findById(lesson.unitId).select('title').lean();
            } catch (e) { unit = null; }
        }

        // Ensure lesson.subject is safe for templates (avoid null._id errors)
        const lessonSubjectObj = subject || (lesson.subjectId ? { _id: lesson.subjectId.toString(), name: null } : (lesson.subject ? { _id: lesson.subject.toString(), name: null } : null));
        const lessonData = { ...lesson, subject: lessonSubjectObj };

        // Process Types
        if (lesson.type === "markdown") {
            lessonData.renderedContent = req.app.locals.marked(lesson.editorData?.markdown || lesson.content || "");
        } else if (lesson.type === "document" && lesson.editorData?.document) {
            try {
                const doc = JSON.parse(lesson.editorData.document);
                if (doc.fileId) {
                    const token = jwt.sign({ fileId: doc.fileId, lessonId: lesson._id.toString() }, JWT_SECRET, { expiresIn: '10m' });
                    doc.publicViewUrl = `${req.protocol}://${req.get('host')}/documents/public-view/${doc.fileId}?token=${token}`;
                }
                lessonData.documentData = doc;
            } catch (e) {}
        }
        if (lesson.editorData?.quiz) try { lessonData.quizData = JSON.parse(lesson.editorData.quiz); } catch(e) { lessonData.quizData = []; }
        if (lesson.editorData?.essay) try { lessonData.essayData = JSON.parse(lesson.editorData.essay); } catch(e) { lessonData.essayData = []; }

        // Compute previous/next lessons (within same Unit if present, otherwise within same Subject).
        let prevLesson = null;
        let nextLesson = null;
        let courseLessons = [];
        let lessonPosition = { index: 1, total: 1 };
        let courseProgress = { completedCount: 0, totalCount: 0, percent: 0 };
        let isCompleted = false;
        let recommendedNextLesson = null;
        try {
            const listFilter = access.canManage ? {} : buildLessonVisibilityFilter(req.user);
            if (lesson.unitId) listFilter.unitId = lesson.unitId;
            else if (course && course._id) listFilter.courseId = course._id;
            else listFilter.subject = lesson.subject || lesson.subjectId;

            const siblings = await Lesson.find(listFilter).sort({ order: 1, _id: 1 }).select('_id title order').lean();
            const idx = siblings.findIndex(s => s._id.toString() === lesson._id.toString());
            if (idx > 0) prevLesson = siblings[idx - 1];
            if (idx >= 0 && idx < siblings.length - 1) nextLesson = siblings[idx + 1];

            lessonPosition = {
                index: idx >= 0 ? idx + 1 : 1,
                total: siblings.length || 1
            };

            let completedSet = new Set();
            if (req.user && siblings.length > 0) {
                const completionDocs = await LessonCompletion.find({
                    user: req.user._id,
                    lesson: { $in: siblings.map((item) => item._id) }
                }).select('lesson').lean();
                completedSet = new Set(completionDocs.map((entry) => entry.lesson.toString()));
            }

            courseLessons = siblings.map((item) => ({
                ...item,
                completed: completedSet.has(item._id.toString()),
                active: item._id.toString() === lesson._id.toString()
            }));

            isCompleted = completedSet.has(lesson._id.toString());
            courseProgress = {
                completedCount: courseLessons.filter((item) => item.completed).length,
                totalCount: courseLessons.length,
                percent: courseLessons.length
                    ? Math.round((courseLessons.filter((item) => item.completed).length / courseLessons.length) * 100)
                    : 0
            };

            recommendedNextLesson =
                courseLessons.slice(Math.max(idx + 1, 0)).find((item) => !item.completed) ||
                nextLesson ||
                courseLessons.find((item) => !item.completed && !item.active) ||
                null;
        } catch (e) { /* ignore navigation errors */ }

        // Build breadcrumbs: Home > Subject > Course > Lesson
        const breadcrumbs = [
            { label: 'Trang chủ', url: '/' },
            ...(course && course.subjectId && course.subjectId.name ? [{ label: course.subjectId.name, url: `/subjects/${course.subjectId._id}` }] : (subject ? [{ label: subject.name, url: `/subjects/${subject._id}` }] : [])),
            ...(course ? [{ label: course.title, url: `/course/${course._id}` }] : []),
            { label: lesson.title, url: null }
        ];

        // Pass course to view so Back button can target course page
        res.render("lessonDetail", {
            user: req.user,
            lesson: lessonData,
            subject,
            unit,
            prevLesson,
            nextLesson,
            course,
            courseLessons,
            lessonPosition,
            courseProgress,
            isCompleted,
            recommendedNextLesson,
            marked: req.app.locals.marked,
            breadcrumbs,
            activePage: "subjects"
        });
    } catch (e) { res.redirect("/subjects"); }
});

// View Lesson Discussion Page
router.get("/:id/discussion", isLoggedIn, async (req, res) => {
    try {
        const lesson = await Lesson.findById(req.params.id).populate("createdBy", "username avatar isTeacher").lean();
        if (!lesson) return res.redirect("/subjects");

        let course = null;
        try {
            if (lesson.courseId) {
                course = await Course.findById(lesson.courseId).select('_id author isPublished isPro subjectId').lean();
            }
        } catch (e) { course = null; }

        const access = await getLessonAccessState(req.user, lesson, { course });
        if (!access.allowed) {
            if (access.needsPro) {
                req.flash("error", "Can PRO.");
                return res.redirect("/upgrade");
            }
            return res.redirect("/subjects");
        }

        // Try to resolve subject
        let subject = null;
        try {
            if (lesson.subject) subject = await Subject.findById(lesson.subject).select("name").lean();
            else if (lesson.subjectId) subject = await Subject.findById(lesson.subjectId).select("name").lean();
        } catch (e) { subject = null; }

        // Build breadcrumbs
        const breadcrumbs = [
            { label: 'Trang chủ', url: '/' },
            { label: subject ? subject.name : 'Bài học', url: subject ? `/subjects/${subject._id}` : '/subjects' },
            { label: lesson.title, url: `/lesson/${lesson._id}` },
            { label: 'Thảo luận', url: null }
        ];

        res.render("lessonDiscussion", { user: req.user, lesson, subject, breadcrumbs, activePage: "subjects" });
    } catch (e) { 
        console.error(e);
        res.redirect("/subjects"); 
    }
});

// Edit Lesson UI
router.get("/:id/edit", isLoggedIn, async (req, res) => {
    try {
        const lesson = await Lesson.findById(req.params.id).lean();
        if (!lesson || lesson.createdBy.toString() !== req.user._id.toString()) return res.redirect("/dashboard");
        const subjects = await Subject.find({}).lean();
        res.render("ManageLesson", { mode: "edit", user: req.user, lesson, subjects, activePage: "dashboard" });
    } catch (e) { res.redirect("/dashboard"); }
});

// Edit Lesson Submit
router.post("/:id/edit", isLoggedIn, upload.none(), async (req, res) => {
    try {
        const lesson = await Lesson.findById(req.params.id);
        if (!lesson || lesson.createdBy.toString() !== req.user._id.toString()) return res.redirect("/dashboard");

        const { subjectId, title, category, type, editorData, isProOnly, tags } = req.body;
        lesson.subject = subjectId; lesson.subjectId = subjectId; lesson.title = title; lesson.category = category;
        lesson.type = type || "markdown"; lesson.editorData = editorData;
        lesson.isPro = isProOnly === "true"; lesson.isProOnly = isProOnly === "true";
        lesson.tags = typeof tags === 'string' ? tags.split(',').map(t => t.trim()).filter(Boolean) : [];
        lesson.content = processLessonContent(req.body);

        await lesson.save();
        req.flash("success", "Cập nhật thành công.");
        res.redirect("/lesson/" + lesson._id);
    } catch (e) { req.flash("error", "Lỗi cập nhật."); res.redirect(`/lesson/${req.params.id}/edit`); }
});

// Delete Lesson
router.post("/:id/delete", isLoggedIn, async (req, res) => {
    try {
        await Lesson.findOneAndDelete({ _id: req.params.id, createdBy: req.user._id });
        req.flash("success", "Đã xóa.");
    } catch (e) { req.flash("error", "Lỗi xóa."); }
    res.redirect("/dashboard");
});

async function resolveNextLessonSuggestion(user, lesson, access) {
    try {
        const listFilter = access?.canManage ? {} : buildLessonVisibilityFilter(user);
        if (lesson.unitId) listFilter.unitId = lesson.unitId;
        else if (lesson.courseId) listFilter.courseId = lesson.courseId;
        else if (lesson.subject || lesson.subjectId) listFilter.subject = lesson.subject || lesson.subjectId;
        else return null;

        const siblings = await Lesson.find(listFilter)
            .sort({ order: 1, _id: 1 })
            .select("_id title")
            .lean();

        const currentIndex = siblings.findIndex((item) => String(item._id) === String(lesson._id));
        const nextLesson = currentIndex >= 0 ? siblings[currentIndex + 1] : null;
        if (!nextLesson) return null;

        return {
            id: String(nextLesson._id),
            title: nextLesson.title,
            url: `/lesson/${nextLesson._id}`
        };
    } catch (error) {
        return null;
    }
}

router.post("/:id/complete", isLoggedIn, completeLimiter, async (req, res) => {
    try {
        const lessonId = req.params.id;
        const userId = req.user._id;

        // 1. Kiểm tra đã học chưa
        const exists = await LessonCompletion.findOne({ user: userId, lesson: lessonId });
        if (exists) return res.status(400).json({ error: "Bạn đã hoàn thành bài này rồi.", message: "Bạn đã hoàn thành bài này rồi." });

        const lesson = await Lesson.findById(lessonId)
            .select('_id title courseId unitId subject subjectId createdBy isPublished isPro isProOnly')
            .lean();
        if (!lesson) {
            return res.status(404).json({ error: "Bai hoc khong ton tai.", message: "Bai hoc khong ton tai." });
        }

        const access = await getLessonAccessState(req.user, lesson);
        if (!access.allowed || lesson.isPublished === false || access.course?.isPublished === false) {
            if (access.needsPro) {
                return res.status(403).json({ error: "Ban can PRO de hoan thanh bai hoc nay.", message: "Ban can PRO de hoan thanh bai hoc nay." });
            }
            return res.status(403).json({ error: "Bai hoc nay hien khong san sang de nhan thuong.", message: "Bai hoc nay hien khong san sang de nhan thuong." });
        }

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ error: "Khong tim thay nguoi dung.", message: "Khong tim thay nguoi dung." });
        }
        
        // 2. Tính thưởng (Logic cũ)
        const currentLevel = Math.max(1, user.level || 1);
        const POINTS = 10;
        const gardenRewards = buildCompletionGardenBundle(currentLevel);
        const XP_REWARD = Math.max(10, Math.floor(LevelUtils.getRequiredXP(currentLevel) * 0.05));

        // Cập nhật Level User
        const levelRes = LevelUtils.calculateLevelUp(user.level, user.xp, XP_REWARD);
        user.points += POINTS;
        user.level = levelRes.newLevel;
        user.xp = levelRes.newXP;

        // 3. Lưu dữ liệu
        const completion = new LessonCompletion({ user: userId, lesson: lessonId });
        completion.$locals = { ...(completion.$locals || {}), skipAchievementCheck: true };
        await completion.save();
        
        // [QUAN TRỌNG] CẬP NHẬT STREAK TẠI ĐÂY
        // Gọi hàm updateStreak trước khi user.save() lần cuối
        const streakResult = await streakHelper.updateStreak(userId);
        if (streakResult && streakResult.updated) {
            user.currentStreak = streakResult.streak;
        }
        
        await user.save(); // Save lần cuối cùng cập nhật tất cả (Level, Points, Streak)

        // Cập nhật Garden
        const garden = await grantRewardBundle(userId, gardenRewards);

        // Check Achievements
        const unlocked = await achievementChecker.onLessonCompleted(userId);
        const nextLesson = await resolveNextLessonSuggestion(req.user, lesson, access);

        await LessonRewardEvent.findOneAndUpdate(
            {
                user: userId,
                lesson: lessonId,
                eventType: 'lesson_completed',
                checkpointKey: 'lesson-complete'
            },
            {
                $setOnInsert: {
                    rewardType: 'bundle',
                    rewardAmount: 0,
                    rewardBundle: {
                        ...gardenRewards,
                        points: POINTS,
                        xp: XP_REWARD
                    },
                    status: 'claimed',
                    claimedAt: new Date(),
                    meta: {
                        lessonTitle: lesson.title,
                        streak: user.currentStreak || 0,
                        isLevelUp: levelRes.hasLeveledUp
                    }
                }
            },
            { upsert: true }
        );

        const celebration = buildCompletionCelebrationPayload({
            lessonTitle: lesson.title,
            points: POINTS,
            xp: XP_REWARD,
            streak: user.currentStreak || 0,
            isLevelUp: levelRes.hasLeveledUp,
            achievements: unlocked,
            nextLesson,
            gardenRewards
        });
        
        res.json({ 
            success: true, 
            message: "Hoàn thành bài học!",
            points: POINTS,
            xp: XP_REWARD,
            streak: user.currentStreak || 0, // Trả về streak mới để frontend hiển thị
            isLevelUp: levelRes.hasLeveledUp,
            achievements: unlocked,
            water: gardenRewards.water,
            gold: gardenRewards.gold,
            gardenRewards,
            gardenBalances: {
                water: Number(garden.water || 0),
                fertilizer: Number(garden.fertilizer || 0),
                gold: Number(garden.gold || 0)
            },
            nextLesson,
            celebration
        });

    } catch (e) { 
        console.error("Complete Lesson Error:", e);
        res.status(500).json({ error: "Lỗi hệ thống." }); 
    }
});

// Grade Essay
router.post("/essay/grade/:lessonId", isLoggedIn, async (req, res) => {
    // ... Copy full logic from original server.js `app.post("/essay/grade/:lessonId")` ...
    // Using helper functions imported from essayHelpers.js
    try {
        const { answers } = req.body;
        const lesson = await Lesson.findById(req.params.lessonId);
        if (!lesson || lesson.type !== "essay") return res.status(400).json({ error: "Không phải tự luận" });

        let essayData = JSON.parse(lesson.editorData?.essay || "[]");
        let method = lesson.editorData?.essayGrading || "simple";
        if (method === "smart" && !hasProAccess(req.user)) method = "simple";

        let scores = [], diffs = [], comments = [];

        if (method === "ai") {
            const aiRes = await gradeEssayAIAll(essayData, answers);
            scores = aiRes.scores; comments = aiRes.comments;
            diffs = essayData.map(() => "");
        } else if (method === "smart") {
            for (let i = 0; i < essayData.length; i++) {
                scores.push(await gradeEssaySmart(essayData[i].sampleAnswer, answers[i]));
                diffs.push(""); comments.push("");
            }
        } else if (method === "absolute") {
            for (let i = 0; i < essayData.length; i++) {
                const sample = essayData[i].sampleAnswer || "";
                const student = answers[i] || "";
                const dist = levenshtein(sample.toLowerCase(), student.toLowerCase());
                const tol = parseInt(lesson.editorData?.absoluteTolerance || "2");
                scores.push(dist === 0 ? 100 : (dist < tol ? Math.round(100*(tol-dist)/tol) : 0));
                diffs.push(getWordDiff(sample, student)); comments.push("");
            }
        } else {
            for (let i = 0; i < essayData.length; i++) {
                scores.push(gradeEssaySimple(essayData[i].sampleAnswer, answers[i]));
                diffs.push(getWordDiff(essayData[i].sampleAnswer, answers[i])); comments.push("");
            }
        }
        
        const avg = scores.length ? Math.round(scores.reduce((a,b)=>a+b,0)/scores.length) : 0;
        res.json({ scores, averageScore: avg, diffs, comments });

    } catch (e) { res.status(500).json({ error: "Lỗi chấm bài." }); }
});

module.exports = router;
