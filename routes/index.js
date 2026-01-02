const express = require('express');
const router = express.Router();
const moment = require("moment-timezone");
// Helper để tránh lỗi 500 khi search ký tự đặc biệt trong Dashboard
const escapeRegex = (text) => text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&");

// --- IMPORT MODELS ---
const User = require('../models/User');
const Lesson = require('../models/Lesson');
const LessonCompletion = require('../models/LessonCompletion');
const News = require('../models/News');
const Subject = require('../models/Subject');
const Course = require('../models/Course');
const Unit = require('../models/Unit');
const VisitStats = require('../models/VisitStats');
const Achievement = require('../models/Achievement');

// --- IMPORT CONTROLLERS ---
const courseController = require('../controllers/courseController');
const profileController = require('../controllers/profileController'); // [QUAN TRỌNG]
const leaderboardController = require('../controllers/leaderboardController');

// Import Middleware
const { isLoggedIn } = require('../middlewares/auth');

// --- 1. HOME PAGE ---
router.get("/", async (req, res) => {
    try {
        const today = moment().tz("Asia/Ho_Chi_Minh").format("YYYY-MM-DD");
        const [totalUsers, totalVisitsDoc, dailyVisitsDoc, latestLessons] = await Promise.all([
            User.countDocuments(),
            VisitStats.findOne({ key: "totalVisits" }),
            VisitStats.findOne({ key: `dailyVisits_${today}` }),
            Lesson.find({ isPublished: true }).sort({ createdAt: -1 }).limit(5).lean()
        ]);

        res.render("index", {
            user: req.user,
            latestLessons,
            totalUsers,
            totalVisits: totalVisitsDoc ? totalVisitsDoc.count : 0,
            dailyVisits: dailyVisitsDoc ? dailyVisitsDoc.count : 0
        });
    } catch (error) {
        console.error("Home Error:", error);
        res.render("index", { user: req.user, latestLessons: [], totalUsers: 0, totalVisits: 0, dailyVisits: 0 });
    }
});

// --- 2. DASHBOARD ---
router.get("/dashboard", isLoggedIn, async (req, res) => {
    try {
        const sortOption = req.query.sort || "desc";
        const sortObj = { createdAt: sortOption === "asc" ? 1 : -1 };
        
        // Filter Lesson
        const lessonFilter = { createdBy: req.user._id };
        if (req.query.subject) lessonFilter.subject = req.query.subject;
        if (req.query.category) lessonFilter.category = req.query.category;
        
        // [FIX BUG 500] Escape Regex để tránh crash khi user nhập ký tự lạ (vd: "(" )
        if (req.query.q) {
            const regex = new RegExp(escapeRegex(req.query.q), "i");
            lessonFilter.$or = [{ title: regex }, { content: regex }];
        }

        // Filter News
        const newsFilter = { postedBy: req.user._id };
        if (req.query.newsCategory) newsFilter.category = req.query.newsCategory;
        if (req.query.newsQuery) {
            newsFilter.title = { $regex: escapeRegex(req.query.newsQuery), $options: "i" };
        }

        // Fetch Data
        const [subjects, userNews, lessons] = await Promise.all([
            Subject.find({}).select("_id name").lean(),
            News.find(newsFilter).sort({ createdAt: req.query.newsSort === "asc" ? 1 : -1 }).lean(),
            Lesson.find(lessonFilter)
                .populate('subject')
                .populate('createdBy', 'username avatar isTeacher')
                .sort(sortObj)
                .lean()
        ]);

        res.render("dashboard", {
            user: req.user, 
            lessons, 
            userNews, 
            subjects,
            currentSubject: req.query.subject || "", 
            currentCategory: req.query.category || "",
            currentSort: sortOption, 
            currentQuery: req.query.q || "",
            currentNewsCategory: req.query.newsCategory || "",
            currentNewsQuery: req.query.newsQuery || "",
            currentNewsSort: req.query.newsSort || "desc",
            activePage: "dashboard"
        });

    } catch (err) {
        console.error("Dashboard Error:", err);
        req.flash("error", "Lỗi tải bảng điều khiển.");
        res.redirect("/");
    }
});

// --- 3. SUBJECTS LIST ---
router.get("/subjects", async (req, res) => {
    try {
        const subjects = await Subject.find({}).lean();
        res.render("subjects", { user: req.user, subjects, activePage: "subjects" });
    } catch(e) {
        console.error(e);
        res.redirect('/');
    }
});

// --- 4. SUBJECT DETAIL ---
router.get("/subjects/:id", async (req, res) => {
    try {
        const subjectId = req.params.id;
        const subject = await Subject.findById(subjectId).lean();
        if (!subject) return res.redirect('/subjects');

        const courses = await Course.find({ subjectId: subject._id, isPublished: true }).sort({ createdAt: -1 }).lean();
        
        let selectedCourse = null;
        if (req.query.courseId) selectedCourse = courses.find(c => c._id.toString() === req.query.courseId);
        if (!selectedCourse && courses.length > 0) selectedCourse = courses[0];

        let units = [];
        if (selectedCourse) {
            units = await Unit.find({ courseId: selectedCourse._id })
                .populate({ path: 'lessons', options: { sort: { order: 1 } } })
                .sort({ order: 1 }).lean();
        }

        let lessons = [];
        if (courses.length === 0) {
             lessons = await Lesson.find({ subject: subject._id }).sort({ createdAt: -1 }).lean();
        }
        
        const totalLessons = await Lesson.countDocuments({ subjectId: subject._id });

        res.render("subjectDetail", {
            user: req.user, subject, courses, selectedCourse, units, lessons,
            totalLessons, uniqueTags: [], activeTag: '', currentCategory: '', currentQuery: '', currentSort: 'desc',
            activePage: "subjects"
        });
    } catch (e) {
        console.error(e);
        res.redirect('/subjects');
    }
});

// --- 5. LEADERBOARD ---
router.get("/leaderboard", isLoggedIn, leaderboardController.getLeaderboard);

// --- 6. PRO IMAGES ---
router.get("/pro-images", isLoggedIn, (req, res) => {
    if (req.user && req.user.isPro) {
        res.render("proImages", { user: req.user, activePage: "proImages" });
    } else {
        req.flash("error", "Tính năng chỉ dành cho tài khoản PRO.");
        res.redirect("/upgrade");
    }
});

// --- 7. PROFILE (ĐÃ CẬP NHẬT DÙNG CONTROLLER) ---

// Xem Profile của chính mình (Tự động redirect hoặc render view của mình)
// Sử dụng profileController để lấy Level, XP, Cảnh Giới
router.get("/profile", isLoggedIn, profileController.getProfile);

// Xem Profile người khác
router.get("/profile/view/:id", profileController.getProfile);

// Edit Profile UI (Giữ nguyên logic cũ vì chưa chuyển sang controller)
router.get("/profile/edit", isLoggedIn, (req, res) => {
    res.render("editProfile", { user: req.user, activePage: "profile" });
});

// Edit Profile Submit (Giữ nguyên logic cũ)
router.post("/profile/edit", isLoggedIn, async (req, res) => {
    try {
        const { email, bio, class: userClass, school, avatar } = req.body; 
        const user = await User.findById(req.user._id);
        
        user.email = email; 
        user.bio = bio; 
        user.class = userClass; 
        user.school = school;
        
        if (avatar && avatar.trim() !== "") user.avatar = avatar.trim();
        
        if (req.body.resetPassword === "true") {
            const { currentPassword, newPassword, confirmNewPassword } = req.body;
            const isMatch = await new Promise((resolve, reject) => {
                user.comparePassword(currentPassword, (err, m) => err ? reject(err) : resolve(m));
            });
            if (!isMatch) { req.flash("error", "Mật khẩu cũ không đúng."); return res.redirect("/profile/edit"); }
            if(newPassword !== confirmNewPassword) { req.flash("error", "Xác nhận mật khẩu không khớp."); return res.redirect("/profile/edit"); }
            user.password = newPassword;
        }
        await user.save();
        req.flash("success", "Cập nhật hồ sơ thành công.");
        res.redirect("/profile");
    } catch(e) {
        console.error(e);
        req.flash("error", "Lỗi cập nhật.");
        res.redirect("/profile/edit");
    }
});

// --- 8. COURSE DETAIL ---
router.get('/course/:id', courseController.getCourseDetail);

module.exports = router;