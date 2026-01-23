const express = require("express");
const router = express.Router();
const multer = require("multer");
const axios = require("axios");
const jwt = require("jsonwebtoken");
const upload = multer();
const { isLoggedIn, isPro } = require("../middlewares/auth");
const { processLessonContent, getWordDiff, gradeEssaySimple, gradeEssaySmart, gradeEssayAIAll, levenshtein } = require("../utils/essayHelpers");
const Lesson = require("../models/Lesson");
const Subject = require("../models/Subject");
const Unit = require("../models/Unit");
const Course = require("../models/Course");
const LessonCompletion = require("../models/LessonCompletion");
const User = require("../models/User");
const Garden = require('../models/Garden');
const LevelUtils = require("../utils/level");
const { achievementChecker } = require("../utils/achievementUtils");
const streakHelper = require("../utils/streakHelper");

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
            subject: subjectId, title, content, category, type: type || "markdown",
            createdBy: req.user._id, editorData: req.body.editorData,
            isProOnly: isProOnly === "true", tags: tagsArray
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
        if (lesson.isProOnly && !req.user.isPro) { req.flash("error", "Cần PRO."); return res.redirect("/upgrade"); }

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
                    const token = jwt.sign({ fileId: doc.fileId }, process.env.JWT_SECRET, { expiresIn: '10m' });
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
        try {
            const visibility = { isPublished: true };
            // Non-PRO users should not see PRO-only lessons in navigation
            if (!req.user?.isPro) visibility.isProOnly = { $ne: true };

            const listFilter = { ...visibility };
            if (lesson.unitId) listFilter.unitId = lesson.unitId;
            else listFilter.subject = lesson.unitId ? lesson.unitId : (lesson.subject || lesson.subjectId);

            const siblings = await require('../models/Lesson').find(listFilter).sort({ order: 1, _id: 1 }).select('_id title order').lean();
            const idx = siblings.findIndex(s => s._id.toString() === lesson._id.toString());
            if (idx > 0) prevLesson = siblings[idx - 1];
            if (idx >= 0 && idx < siblings.length - 1) nextLesson = siblings[idx + 1];
        } catch (e) { /* ignore navigation errors */ }

        // Try to resolve Course (and its Subject) for breadcrumb (if lesson.courseId present)
        let course = null;
        try {
            if (lesson.courseId) {
                course = await Course.findById(lesson.courseId).populate('subjectId', 'name _id').lean();
            }
        } catch (e) { course = null; }

        // Build breadcrumbs: Home > Subject > Course > Lesson
        const breadcrumbs = [
            { label: 'Trang chủ', url: '/' },
            ...(course && course.subjectId && course.subjectId.name ? [{ label: course.subjectId.name, url: `/subjects/${course.subjectId._id}` }] : (subject ? [{ label: subject.name, url: `/subjects/${subject._id}` }] : [])),
            ...(course ? [{ label: course.title, url: `/course/${course._id}` }] : []),
            { label: lesson.title, url: null }
        ];

        // Pass course to view so Back button can target course page
        res.render("lessonDetail", { user: req.user, lesson: lessonData, subject, unit, prevLesson, nextLesson, course, marked: req.app.locals.marked, breadcrumbs, activePage: "subjects" });
    } catch (e) { res.redirect("/subjects"); }
});

// View Lesson Discussion Page
router.get("/:id/discussion", isLoggedIn, async (req, res) => {
    try {
        const lesson = await Lesson.findById(req.params.id).populate("createdBy", "username avatar isTeacher").lean();
        if (!lesson) return res.redirect("/subjects");

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
        lesson.subject = subjectId; lesson.title = title; lesson.category = category;
        lesson.type = type || "markdown"; lesson.editorData = editorData;
        lesson.isProOnly = isProOnly === "true";
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

router.post("/:id/complete", isLoggedIn, async (req, res) => {
    try {
        const lessonId = req.params.id;
        const userId = req.user._id;

        // 1. Kiểm tra đã học chưa
        const exists = await LessonCompletion.findOne({ user: userId, lesson: lessonId });
        if (exists) return res.status(400).json({ error: "Bạn đã hoàn thành bài này rồi." });

        const user = await User.findById(userId);
        
        // 2. Tính thưởng (Logic cũ)
        const currentLevel = user.level || 1;
        const POINTS = 10;
        const WATER = currentLevel;
        const GOLD = Math.floor(50 * Math.pow(currentLevel, 1.5));
        const XP_REWARD = Math.max(10, Math.floor(LevelUtils.getRequiredXP(currentLevel) * 0.05));

        // Cập nhật Level User
        const levelRes = LevelUtils.calculateLevelUp(user.level, user.xp, XP_REWARD);
        user.points += POINTS;
        user.level = levelRes.newLevel;
        user.xp = levelRes.newXP;

        // 3. Lưu dữ liệu
        await new LessonCompletion({ user: userId, lesson: lessonId }).save();
        
        // [QUAN TRỌNG] CẬP NHẬT STREAK TẠI ĐÂY
        // Gọi hàm updateStreak trước khi user.save() lần cuối
        const streakResult = await streakHelper.updateStreak(userId);
        if (streakResult && streakResult.updated) {
            // Nếu helper đã save user thì ta không cần save lại, 
            // nhưng để chắc chắn đồng bộ dữ liệu points/level ở trên, ta gán lại streak vào biến user hiện tại
            user.streak = streakResult.streak;
            // Lưu ý: Helper đã save user rồi, nhưng user ở đây (biến user) đang giữ data level/points mới
            // Nên ta cần save biến user này đè lên.
        }
        
        await user.save(); // Save lần cuối cùng cập nhật tất cả (Level, Points, Streak)

        // Cập nhật Garden
        await Garden.findOneAndUpdate(
            { user: userId },
            { $inc: { water: WATER, gold: GOLD } }, 
            { upsert: true, new: true }
        );

        // Check Achievements
        const unlocked = await achievementChecker.onLessonCompleted(userId);
        
        res.json({ 
            success: true, 
            message: "Hoàn thành bài học!",
            points: POINTS,
            xp: XP_REWARD,
            streak: user.streak, // Trả về streak mới để frontend hiển thị
            isLevelUp: levelRes.hasLeveledUp,
            achievements: unlocked
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
        if (method === "smart" && !req.user.isPro) method = "simple";

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