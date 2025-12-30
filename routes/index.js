// routes/index.js
const express = require('express');
const router = express.Router();
const moment = require("moment-timezone");

// --- IMPORT MODELS (QUAN TRỌNG ĐỂ KHÔNG BỊ LỖI 500) ---
const User = require('../models/User');
const Lesson = require('../models/Lesson');
const LessonCompletion = require('../models/LessonCompletion');
const News = require('../models/News');
const Subject = require('../models/Subject');
const Course = require('../models/Course');
const Unit = require('../models/Unit');
const VisitStats = require('../models/VisitStats');
const Achievement = require('../models/Achievement');
const courseController = require('../controllers/courseController');


// Import Middleware & Controller
const { isLoggedIn } = require('../middlewares/auth');
const leaderboardController = require('../controllers/leaderboardController');

// --- 1. HOME PAGE ---
router.get("/", async (req, res) => {
    try {
        const today = moment().tz("Asia/Ho_Chi_Minh").format("YYYY-MM-DD");
        const [totalUsers, totalVisitsDoc, dailyVisitsDoc, latestLessons] = await Promise.all([
            User.countDocuments(),
            VisitStats.findOne({ key: "totalVisits" }),
            VisitStats.findOne({ key: `dailyVisits_${today}` }),
            Lesson.find().sort({ createdAt: -1 }).limit(5).lean()
        ]);

        const totalVisits = totalVisitsDoc ? totalVisitsDoc.count : 0;
        const dailyVisits = dailyVisitsDoc ? dailyVisitsDoc.count : 0;

        res.render("index", {
            user: req.user,
            latestLessons,
            totalUsers,
            totalVisits,
            dailyVisits
        });
    } catch (error) {
        console.error("Home Error:", error);
        res.render("index", { user: req.user, latestLessons: [], totalUsers: 0, totalVisits: 0, dailyVisits: 0 });
    }
});

// --- 2. DASHBOARD (FIX BUG 500) ---
router.get("/dashboard", isLoggedIn, async (req, res) => {
    try {
        const sortOption = req.query.sort || "desc";
        const sortObj = { createdAt: sortOption === "asc" ? 1 : -1 };
        
        // Filter Lesson
        const lessonFilter = { createdBy: req.user._id };
        if (req.query.subject) lessonFilter.subject = req.query.subject;
        if (req.query.category) lessonFilter.category = req.query.category;
        if (req.query.q) {
            const regex = new RegExp(req.query.q, "i");
            lessonFilter.$or = [{ title: regex }, { content: regex }];
        }

        // Filter News
        const newsFilter = { postedBy: req.user._id };
        if (req.query.newsCategory) newsFilter.category = req.query.newsCategory;
        if (req.query.newsQuery) newsFilter.title = { $regex: req.query.newsQuery, $options: "i" };

        // Fetch Data
        const [subjects, userNews, lessons] = await Promise.all([
            Subject.find({}).select("_id name").lean(),
            News.find(newsFilter).sort({ createdAt: req.query.newsSort === "asc" ? 1 : -1 }).lean(),
            Lesson.find(lessonFilter)
                .populate('subject')
                .populate('createdBy', 'username avatar isTeacher') // Populate đủ field
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
            // Các biến news
            currentNewsCategory: req.query.newsCategory || "",
            currentNewsQuery: req.query.newsQuery || "",
            currentNewsSort: req.query.newsSort || "desc",
            activePage: "dashboard"
        });

    } catch (err) {
        console.error("Dashboard Error:", err); // Log lỗi ra console để debug
        req.flash("error", "Lỗi tải bảng điều khiển: " + err.message);
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

// --- 4. SUBJECT DETAIL (Course/Tree Logic) ---
router.get("/subjects/:id", async (req, res) => {
    try {
        const subjectId = req.params.id;
        const subject = await Subject.findById(subjectId).lean();
        if (!subject) return res.redirect('/subjects');

        // Lấy danh sách Courses thuộc Subject
        const courses = await Course.find({ subjectId: subject._id, isPublished: true }).sort({ createdAt: -1 }).lean();
        
        let selectedCourse = null;
        if (req.query.courseId) selectedCourse = courses.find(c => c._id.toString() === req.query.courseId);
        if (!selectedCourse && courses.length > 0) selectedCourse = courses[0];

        let units = [];
        if (selectedCourse) {
            units = await Unit.find({ courseId: selectedCourse._id })
                .populate({ path: 'lessons', options: { sort: { order: 1 } } }) // Lấy cả bài chưa public để check logic
                .sort({ order: 1 }).lean();
            
            // Filter bài học public phía client view nếu cần, hoặc filter ngay tại query
        }

        // Lấy bài học lẻ (Legacy support cho hệ thống cũ không có Course)
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

// --- 5. LEADERBOARD (ROUTE MỚI) ---
router.get("/leaderboard", isLoggedIn, leaderboardController.getLeaderboard);

// --- 6. PRO IMAGES (KHO ẢNH - ROUTE MỚI) ---
router.get("/pro-images", isLoggedIn, (req, res) => {
    if (req.user && req.user.isPro) {
        res.render("proImages", { user: req.user, activePage: "proImages" });
    } else {
        req.flash("error", "Tính năng chỉ dành cho tài khoản PRO.");
        res.redirect("/upgrade");
    }
});

// --- 7. PROFILE & MY TREE ---
router.get("/profile", isLoggedIn, async (req, res) => {
    try {
        const user = req.user;

        // Calculate completed lessons count
        const completedLessonsCount = await LessonCompletion.countDocuments({
            userId: user._id,
            completed: true
        });

        // Calculate user rank based on points
        const rank = await User.countDocuments({ points: { $gt: user.points || 0 } }) + 1;

        // Get recent lesson completions as activities
        const recentCompletions = await LessonCompletion.find({
            userId: user._id,
            completed: true
        })
        .populate('lessonId', 'title')
        .sort({ completedAt: -1 })
        .limit(5)
        .lean();

        const achievements = await Achievement.find({ user: req.user._id }).lean();

        res.render("profile", {
            user: req.user,
            achievements,
            stats: {
                completedLessons: completedLessonsCount,
                rank: rank
            },
            activities: recentCompletions,
            activePage: "profile"
        });
    } catch(e) {
        console.error(e);
        res.redirect('/');
    }
});

router.get("/profile/edit", isLoggedIn, (req, res) => {
    res.render("editProfile", { user: req.user, activePage: "profile" });
});

router.post("/profile/edit", isLoggedIn, async (req, res) => {
    try {
        // Added 'avatar' to destructuring
        const { email, bio, class: userClass, school, avatar } = req.body; 
        const user = await User.findById(req.user._id);
        
        user.email = email; 
        user.bio = bio; 
        user.class = userClass; 
        user.school = school;
        
        // Explicitly update avatar if provided
        if (avatar && avatar.trim() !== "") {
            user.avatar = avatar.trim();
        }
        
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

router.get("/profile/view/:id", async (req, res) => {
    try {
        const targetUser = await User.findById(req.params.id).lean();
        if(!targetUser) return res.redirect("/");

        // Calculate completed lessons count for target user
        const completedLessonsCount = await LessonCompletion.countDocuments({
            userId: targetUser._id,
            completed: true
        });

        // Calculate user rank based on points for target user
        const rank = await User.countDocuments({ points: { $gt: targetUser.points || 0 } }) + 1;

        // Get recent lesson completions as activities for target user
        const recentCompletions = await LessonCompletion.find({
            userId: targetUser._id,
            completed: true
        })
        .populate('lessonId', 'title')
        .sort({ completedAt: -1 })
        .limit(5)
        .lean();

        const achievements = await Achievement.find({ user: targetUser._id }).lean();

        res.render("profileView", {
            title: `Hồ sơ ${targetUser.username}`,
            profile: targetUser,
            targetUser,
            user: req.user,
            viewedUserAchievements: achievements,
            stats: {
                completedLessons: completedLessonsCount,
                rank: rank
            },
            activities: recentCompletions,
            activePage: "profileView"
        });
    } catch(e) {
        console.error(e);
        res.redirect("/");
    }
});

router.get('/course/:id', courseController.getCourseDetail);

module.exports = router;