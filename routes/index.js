const express = require('express');
const router = express.Router();
const moment = require("moment-timezone");
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
const UserActivityLog = require('../models/UserActivityLog');

// --- IMPORT CONTROLLERS ---
const courseController = require('../controllers/courseController');
const profileController = require('../controllers/profileController');
const leaderboardController = require('../controllers/leaderboardController');

// Import Middleware
const { isLoggedIn } = require('../middlewares/auth');

// --- 1. HOME PAGE ---
router.get("/", async (req, res) => {
    try {
        const subjects = await Subject.find().limit(6).lean();
        const courses = await Course.find({ isPublished: true })
            .sort({ createdAt: -1 })
            .limit(6)
            .populate('author', 'username avatar')
            .populate('subjectId', 'name')
            .lean();

        const totalCourses = await Course.countDocuments({ isPublished: true });
        const totalStudents = await User.countDocuments({ role: 'student' });
        const totalLessons = await Lesson.countDocuments({}); 

        res.render("index", {
            user: req.user,
            subjects,
            courses,
            totalCourses,
            totalStudents,
            totalLessons,
            activePage: 'home' 
        });
    } catch (e) {
        console.error("Home Error:", e);
        res.render("index", { user: req.user, subjects: [], courses: [], totalCourses: 0, totalStudents: 0, totalLessons: 0, activePage: 'home' });
    }
});

// --- 2. DASHBOARD (FULL COMPLETED & FIXED) ---
router.get("/dashboard", isLoggedIn, async (req, res) => {
    try {
        // 1. Lấy dữ liệu cơ bản (Subject, News, My Lessons)
        const [subjects, userNews, lessons] = await Promise.all([
            Subject.find({}).select("_id name").lean(),
            News.find({ postedBy: req.user._id }).sort({ createdAt: -1 }).lean(),
            Lesson.find({ createdBy: req.user._id }).sort({ createdAt: -1 }).lean()
        ]);

        // 2. Lấy lịch sử học tập (Completions)
        // [FIX] Populate 'courseId' thay vì 'course' để tránh lỗi StrictPopulateError
        const completions = await LessonCompletion.find({ user: req.user._id })
            .populate({
                path: 'lesson',
                select: 'title subject courseId', 
                populate: { path: 'courseId', select: 'title thumbnail subjectId' } 
            })
            .sort({ completedAt: -1 })
            .lean();

        // 3. Xử lý logic "Khóa học đã tham gia" & "Khóa học gần nhất"
        // Lấy toàn bộ khóa học public để tham chiếu thông tin
        const allCourses = await Course.find({ isPublished: true }).select('_id title thumbnail subjectId').lean();
        
        // Lấy toàn bộ bài học (chỉ lấy field cần thiết) để đếm tổng số bài
        const allLessons = await Lesson.find().select('_id courseId subject').lean();

        const enrolledMap = new Map();

        // Duyệt qua từng bài đã học để gom nhóm vào Course
        completions.forEach(c => {
            if (!c.lesson) return;
            
            // Ưu tiên lấy courseId từ bài học
            let courseId = c.lesson.courseId ? c.lesson.courseId._id.toString() : null;
            
            // Fallback: Nếu bài học không có courseId, thử tìm qua Subject (Logic cũ)
            if (!courseId && c.lesson.subject) {
                const foundCourse = allCourses.find(course => course.subjectId?.toString() === c.lesson.subject.toString());
                if (foundCourse) courseId = foundCourse._id.toString();
            }

            if (courseId) {
                if (!enrolledMap.has(courseId)) {
                    enrolledMap.set(courseId, { completedLessonIds: new Set() });
                }
                enrolledMap.get(courseId).completedLessonIds.add(c.lesson._id.toString());
            }
        });

        const enrolledCourses = [];
        let recentCourse = null;

        // Tính toán % tiến độ cho từng khóa
        for (const [courseId, data] of enrolledMap) {
            const courseInfo = allCourses.find(c => c._id.toString() === courseId);
            if (courseInfo) {
                // Đếm tổng số bài thuộc khóa này (khớp theo courseId hoặc subjectId)
                const totalLessonsInCourse = allLessons.filter(l => 
                    (l.courseId && l.courseId.toString() === courseId) || 
                    (l.subject && l.subject.toString() === courseInfo.subjectId?.toString())
                ).length;

                const completedCount = data.completedLessonIds.size;
                const progress = totalLessonsInCourse > 0 ? Math.round((completedCount / totalLessonsInCourse) * 100) : 0;

                const courseObj = {
                    _id: courseInfo._id,
                    title: courseInfo.title,
                    image: courseInfo.thumbnail || 'https://i.ibb.co/BVnNtLhp/default-course.png',
                    totalLessons: totalLessonsInCourse,
                    completedLessons: completedCount,
                    progress: progress
                };

                enrolledCourses.push(courseObj);
            }
        }

        // Sắp xếp khóa học theo tiến độ (khóa nào học nhiều hiện lên đầu)
        enrolledCourses.sort((a, b) => b.progress - a.progress);

        // Xác định khóa học "Tiếp tục học" (Lấy từ bài học mới nhất)
        if (completions.length > 0 && completions[0].lesson) {
            const lastLesson = completions[0].lesson;
            let lastCourseId = lastLesson.courseId ? lastLesson.courseId._id.toString() : null;
             
            if (!lastCourseId && lastLesson.subject) {
                const found = allCourses.find(c => c.subjectId?.toString() === lastLesson.subject.toString());
                if (found) lastCourseId = found._id.toString();
            }
            
            if (lastCourseId) {
                recentCourse = enrolledCourses.find(c => c._id.toString() === lastCourseId);
            }
        }
        
        // Nếu không tìm thấy recent từ history, lấy khóa đầu tiên trong danh sách enrolled
        if (!recentCourse && enrolledCourses.length > 0) {
            recentCourse = enrolledCourses[0];
        }

        // 4. Tính Hoạt động tuần này (REAL TIME SPENT từ UserActivityLog)
        const weeklyActivity = [0, 0, 0, 0, 0, 0, 0]; // Mảng 7 ngày (Thứ 2 -> CN)
        
        // Xác định ngày Thứ 2 đầu tuần theo giờ VN
        const today = moment().tz("Asia/Ho_Chi_Minh");
        const startOfWeek = today.clone().startOf('isoWeek'); // isoWeek bắt đầu từ Thứ 2

        // Tạo danh sách 7 ngày trong tuần dạng chuỗi "YYYY-MM-DD"
        const dateList = [];
        for(let i=0; i<7; i++) {
            dateList.push(startOfWeek.clone().add(i, 'days').format("YYYY-MM-DD"));
        }

        // Query bảng UserActivityLog (Nếu chưa có model này, hãy tạo nó trước!)
        // Nếu chưa tạo model, đoạn này sẽ lỗi -> Cần đảm bảo model tồn tại.
        try {
            const UserActivityLog = require('../models/UserActivityLog'); // Dynamic require để tránh lỗi nếu chưa tạo file
            const activityLogs = await UserActivityLog.find({
                user: req.user._id,
                dateStr: { $in: dateList }
            }).lean();

            // Map dữ liệu phút vào mảng weeklyActivity (đổi sang giờ)
            dateList.forEach((date, index) => {
                const log = activityLogs.find(l => l.dateStr === date);
                if (log) {
                    // Chuyển phút thành giờ (lấy 1 số lẻ thập phân)
                    weeklyActivity[index] = parseFloat((log.minutes / 60).toFixed(1));
                }
            });
        } catch (err) {
            console.warn("UserActivityLog model chưa tồn tại hoặc lỗi query:", err.message);
            // Fallback: Nếu lỗi (do chưa tạo model), để mảng 0
        }

        // 5. Các dữ liệu phụ (Vườn, Thành tích)
        const gardenData = await Garden.findOne({ user: req.user._id }).lean();
        
        const userAchievements = await UserAchievement.find({ user: req.user._id })
            .populate('achievementId')
            .sort({ unlockedAt: -1 })
            .limit(4)
            .lean();
            
        const completedLessonsCount = completions.length;

        // 6. Render View
        res.render("dashboard", {
            user: req.user,
            lessons, 
            userNews, 
            subjects,
            enrolledCourses,    // Danh sách thật
            recentCourse,       // Khóa học gần nhất thật
            weeklyActivity: JSON.stringify(weeklyActivity), // Biểu đồ giờ học thật
            completedLessonsCount,
            gardenData,
            userAchievements,
            activePage: "dashboard",
            
            // Các biến filter giữ nguyên để không lỗi view nếu có dùng
            currentSubject: "", currentCategory: "", currentSort: "desc", currentQuery: "",
            currentNewsCategory: "", currentNewsQuery: "", currentNewsSort: "desc"
        });

    } catch (err) {
        console.error("Dashboard Error:", err);
        req.flash("error", "Lỗi tải bảng điều khiển.");
        res.redirect("/");
    }
});

// --- CÁC ROUTE KHÁC GIỮ NGUYÊN ---
router.get("/subjects", async (req, res) => {
    try {
        const subjects = await Subject.find().sort({ name: 1 }).lean();
        const subjectsWithCount = await Promise.all(subjects.map(async (sub) => {
            const count = await Course.countDocuments({ subjectId: sub._id, isPublished: true });
            return { ...sub, courseCount: count };
        }));
        res.render("subjects", { user: req.user, subjects: subjectsWithCount, activePage: "subjects", title: "Danh mục Môn học" });
    } catch(e) { console.error(e); res.redirect('/'); }
});

router.get("/subjects/:id", async (req, res) => {
    try {
        const subjectId = req.params.id;
        const subject = await Subject.findById(subjectId).lean();
        if (!subject) return res.redirect('/subjects');
        const courses = await Course.find({ subjectId: subject._id, isPublished: true }).populate('author', 'username avatar').sort({ createdAt: -1 }).lean();
        res.render("subjectDetail", { user: req.user, subject, courses, selectedCourse: null, units: [], lessons: [], totalLessons: 0, uniqueTags: [], activeTag: '', currentCategory: '', currentQuery: '', currentSort: 'desc', activePage: "subjects" });
    } catch (e) { console.error(e); res.redirect('/subjects'); }
});

router.get("/leaderboard", isLoggedIn, leaderboardController.getLeaderboard);

router.get("/pro-images", isLoggedIn, (req, res) => {
    if (req.user && req.user.isPro) res.render("proImages", { user: req.user, activePage: "proImages" });
    else { req.flash("error", "Chỉ dành cho PRO."); res.redirect("/upgrade"); }
});

router.get("/profile", isLoggedIn, profileController.getProfile);
router.get("/profile/view/:id", profileController.getProfile);
router.get("/achievements", isLoggedIn, (req, res) => { res.render("achievements", { user: req.user, activePage: "achievements", title: "Thành Tích" }); });
router.get("/profile/edit", isLoggedIn, (req, res) => { res.render("editProfile", { user: req.user, activePage: "profile" }); });
router.post("/profile/edit", isLoggedIn, async (req, res) => {
    try {
        const { email, bio, class: userClass, school, avatar } = req.body; 
        const user = await User.findById(req.user._id);
        user.email = email; user.bio = bio; user.class = userClass; user.school = school;
        if (avatar && avatar.trim() !== "") user.avatar = avatar.trim();
        await user.save();
        req.flash("success", "Đã cập nhật."); res.redirect("/profile");
    } catch(e) { req.flash("error", "Lỗi."); res.redirect("/profile/edit"); }
});

router.get('/course/:id', courseController.getCourseDetail);

router.get("/courses", async (req, res) => {
    try {
        const courses = await Course.find({ isPublished: true }).populate('author', 'username avatar').populate('subjectId', 'name icon').sort({ createdAt: -1 }).lean();
        res.render("courses", { user: req.user, courses, activePage: "courses", title: "Thư viện khóa học" });
    } catch (e) { console.error(e); res.redirect('/'); }
});

module.exports = router;