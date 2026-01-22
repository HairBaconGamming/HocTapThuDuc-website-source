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
const { AchievementType, UserAchievement } = require('../models/Achievement');
const Garden = require('../models/Garden');
const LessonRevision = require('../models/LessonRevision');

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
            VisitStats.findOne({ dateStr: "totalVisits" }),
            VisitStats.findOne({ dateStr: `dailyVisits_${today}` }),
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
        const [subjects, userNews, lessons, completions] = await Promise.all([
            Subject.find({}).select("_id name").lean(),
            News.find(newsFilter).sort({ createdAt: req.query.newsSort === "asc" ? 1 : -1 }).lean(),
            Lesson.find(lessonFilter)
                .populate('subject')
                .populate('createdBy', 'username avatar isTeacher')
                .sort(sortObj)
                .lean(),
            LessonCompletion.find({ user: req.user._id })
                .populate({ path: 'lesson', select: 'title subject' })
                .sort({ completedAt: -1 })
                .lean()
        ]);

        // --- ENROLLED COURSES (từ lessons đã hoàn thành) ---
        const courseMap = new Map();
        // Filter out null lessons (deleted lessons) trước khi map
        const completedLessonIds = new Set(completions.filter(c => c.lesson).map(c => c.lesson._id.toString()));
        
        // Lấy tất cả lessons từ các courses
        const allLessonsInCourse = await Lesson.find()
            .select('_id subject')
            .lean();
        
        // Tính course progress
        const courses = await Course.find({ isPublished: true })
            .select('_id title thumbnail')
            .lean();
        
        const enrolledCourses = [];
        for (const course of courses) {
            const courseLessons = allLessonsInCourse.filter(l => l.subject?.toString() === course.subject?.toString() || l.course?.toString() === course._id.toString());
            const completedInCourse = courseLessons.filter(l => completedLessonIds.has(l._id.toString())).length;
            
            // Only show courses where user completed at least 1 lesson
            if (courseLessons.length > 0 && completedInCourse > 0) {
                enrolledCourses.push({
                    _id: course._id,
                    title: course.title,
                    image: course.thumbnail || 'https://i.ibb.co/BVnNtLhp/default-course.png',
                    totalLessons: courseLessons.length,
                    completedLessons: completedInCourse,
                    progress: Math.round((completedInCourse / courseLessons.length) * 100)
                });
            }
        }
        
        // Sắp xếp theo progress giảm dần (khóa gần hoàn thành lên trên)
        enrolledCourses.sort((a, b) => b.progress - a.progress);

        // --- RECENT COURSE (khóa học vừa học gần nhất) ---
        let recentCourse = null;
        // Tìm completion đầu tiên có lesson không null
        const recentCompletion = completions.find(c => c.lesson);
        if (recentCompletion && recentCompletion.lesson) {
            const recentLesson = recentCompletion.lesson;
            const recentCourseLessons = allLessonsInCourse.filter(l => l.subject?.toString() === recentLesson.subject?.toString());
            const recentCompleted = recentCourseLessons.length > 0 
                ? recentCourseLessons.filter(l => completedLessonIds.has(l._id.toString())).length 
                : 0;
            
            const foundCourse = courses.find(c => c._id.toString() === recentCompletion.lesson?.course?.toString());
            if ((foundCourse || recentCourseLessons.length > 0) && recentCourseLessons.length > 0) {
                const totalLessons = recentCourseLessons.length;
                const progressPercent = totalLessons > 0 ? Math.round((recentCompleted / totalLessons) * 100) : 0;
                
                recentCourse = {
                    _id: foundCourse?._id || recentCourseLessons[0].course,
                    title: foundCourse?.title || 'Khóa học gần đây',
                    image: foundCourse?.thumbnail,
                    progress: progressPercent
                };
            }
        }

        // --- WEEKLY ACTIVITY (7 ngày, tính theo LessonCompletion) ---
        const weeklyActivity = [];
        for (let i = 6; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            const dayStart = new Date(d.setHours(0, 0, 0, 0));
            const dayEnd = new Date(d.setHours(23, 59, 59, 999));
            
            // Đếm lessons hoàn thành trong ngày
            const dayCompletions = completions.filter(c => {
                const completedDate = new Date(c.completedAt);
                return completedDate >= dayStart && completedDate <= dayEnd;
            });
            
            // Tính giờ học (giả sử mỗi lesson = 0.5 giờ, có thể tùy chỉnh)
            const learningHours = (dayCompletions.length * 0.5).toFixed(1);
            weeklyActivity.push(parseFloat(learningHours));
        }

        // --- Count completed lessons ---
        const completedLessonsCount = completions.length;

        // --- GARDEN DATA ---
        const gardenData = await Garden.findOne({ user: req.user._id }).lean();

        // --- USER ACHIEVEMENTS (Recent 4) ---
        const userAchievements = await UserAchievement.find({ user: req.user._id })
            .populate('achievementId')
            .sort({ unlockedAt: -1 })
            .limit(4)
            .lean();

        // --- TOP 3 USERS (By Points) ---
        const topUsers = await User.find()
            .select('_id username avatar points')
            .sort({ points: -1 })
            .limit(3)
            .lean();

        res.render("dashboard", {
            user: req.user, 
            lessons, 
            userNews, 
            subjects,
            enrolledCourses,
            recentCourse,
            weeklyActivity: JSON.stringify(weeklyActivity),
            completedLessonsCount,
            gardenData,
            userAchievements,
            topUsers,
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

        // [FIX] Thêm .populate() để lấy thông tin tác giả (username, avatar)
        const courses = await Course.find({ subjectId: subject._id, isPublished: true })
            .populate('author', 'username avatar') // <--- DÒNG QUAN TRỌNG CẦN THÊM
            .sort({ createdAt: -1 })
            .lean();
        
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

// Achievements page
router.get("/achievements", isLoggedIn, (req, res) => {
    res.render("achievements", { user: req.user, activePage: "achievements", title: "Thành Tích" });
});

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