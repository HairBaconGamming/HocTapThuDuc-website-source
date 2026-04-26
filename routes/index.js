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
const LevelUtils = require('../utils/level');
const Garden = require('../models/Garden');
const LessonRevision = require('../models/LessonRevision');
const UserActivityLog = require('../models/UserActivityLog');
const { getCourseAccessState, buildCourseVisibilityFilter } = require('../utils/contentAccess');
const { buildAbsoluteUrl, buildCoursePath, buildSubjectPath } = require('../utils/urlHelpers');
const { getUpcomingDashboardSessions } = require('../services/liveService');

// --- IMPORT CONTROLLERS ---
const courseController = require('../controllers/courseController');
const profileController = require('../controllers/profileController');
const leaderboardController = require('../controllers/leaderboardController');

// Import Middleware
const { isLoggedIn, hasProAccess } = require('../middlewares/auth');

// --- 1. HOME PAGE ---
router.get("/", async (req, res) => {
    try {
        const subjects = await Subject.find().limit(6).lean();
        const courses = await Course.find(buildCourseVisibilityFilter(req.user))
            .sort({ createdAt: -1 })
            .limit(6)
            .populate('author', 'username avatar')
            .populate('subjectId', 'name')
            .lean();

        const totalCourses = await Course.countDocuments(buildCourseVisibilityFilter(req.user));
        const totalStudents = await User.countDocuments({ isAdmin: { $ne: true }, isTeacher: { $ne: true } });
        const totalLessons = await Lesson.countDocuments({}); 

        let levelInfo = null;
        let heatmapData = [];
        
        if (req.user) {
            levelInfo = LevelUtils.getLevelInfo(req.user.level || 1, req.user.xp || 0);
            
            // Generate fake heatmap data for the last 60 days
            const today = new Date();
            for (let i = 59; i >= 0; i--) {
                const date = new Date(today);
                date.setDate(date.getDate() - i);
                
                // Randomize activity level: 0 (none), 1 (low), 2 (medium), 3 (high)
                // Make weekends more active perhaps, or just totally random, biased towards 0
                const isActive = Math.random() > 0.4; // 60% chance to be active
                const activityLevel = isActive ? Math.floor(Math.random() * 3) + 1 : 0;
                
                heatmapData.push({
                    date: date.toISOString().split('T')[0],
                    level: activityLevel
                });
            }
        }

        res.render("index", {
            user: req.user,
            subjects,
            courses,
            totalCourses,
            totalStudents,
            totalLessons,
            levelInfo,
            heatmapData,
            activePage: 'home' 
        });
    } catch (e) {
        console.error("Home Error:", e);
        res.render("index", { user: req.user, subjects: [], courses: [], totalCourses: 0, totalStudents: 0, totalLessons: 0, levelInfo: null, heatmapData: [], activePage: 'home' });
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
        const allCourses = await Course.find(buildCourseVisibilityFilter(req.user)).select('_id title thumbnail subjectId').lean();
        
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
        const liveSessions = await getUpcomingDashboardSessions(req.user);
            
        const completedLessonsCount = completions.length;

// 6. Render View
        const levelInfo = LevelUtils.getLevelInfo(req.user.level || 1, req.user.xp || 0);
        
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
            liveSessions,
            levelInfo,  // ← NEW: Sync with garden/profile
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
router.get("/flashcards/review", isLoggedIn, async (req, res) => {
    try {
        const courseId = String(req.query.courseId || '').trim();
        let course = null;

        if (courseId) {
            course = await Course.findById(courseId)
                .select('_id title subjectId')
                .populate('subjectId', 'name')
                .lean();
        }

        const breadcrumbs = [
            { label: 'Trang chủ', url: '/' },
            ...(course ? [{ label: course.title, url: buildCoursePath(course) }] : []),
            { label: 'Ôn tập flashcard', url: null }
        ];

        res.render("flashcardReview", {
            user: req.user,
            course,
            courseId: course ? String(course._id) : '',
            breadcrumbs,
            activePage: "subjects",
            title: course ? `Ôn tập | ${course.title}` : 'Ôn tập flashcard'
        });
    } catch (error) {
        console.error("Flashcard review page error:", error);
        res.redirect("/dashboard");
    }
});

router.get("/subjects", async (req, res) => {
    try {
        const subjects = await Subject.find().sort({ name: 1 }).lean();
        const subjectsWithCount = await Promise.all(subjects.map(async (sub) => {
            const count = await Course.countDocuments(buildCourseVisibilityFilter(req.user, { subjectId: sub._id }));
            return { ...sub, courseCount: count };
        }));
        res.render("subjects", { user: req.user, subjects: subjectsWithCount, activePage: "subjects", title: "Danh mục Môn học" });
    } catch(e) { console.error(e); res.redirect('/'); }
});

router.get("/subjects/:id/:slug?", async (req, res) => {
    try {
        const mongoose = require('mongoose');
        const subjectId = req.params.id;
        const subject = await Subject.findById(subjectId).lean();
        if (!subject) return res.redirect('/subjects');
        const canonicalPath = buildSubjectPath(subject);
        if (req.params.slug !== canonicalPath.split('/').pop()) {
            return res.redirect(301, canonicalPath);
        }
        
        let courses = await Course.find(buildCourseVisibilityFilter(req.user, { subjectId: subject._id })).populate('author', 'username avatar').sort({ createdAt: -1 }).lean();
        
        const courseIds = courses.map(c => c._id);
        const courseObjectIds = courseIds.map(id => new mongoose.Types.ObjectId(id));

        // 1. Lesson counts per course & total views from lessons
        const lessonAgg = await Lesson.aggregate([
            { $match: { courseId: { $in: courseObjectIds } } },
            { $group: { _id: '$courseId', count: { $sum: 1 }, totalViews: { $sum: '$views' } } }
        ]);

        // 2. Total students in this subject (unique users who completed any lesson in this subject)
        const subjectLessonIds = await Lesson.find({ courseId: { $in: courseIds } }).distinct('_id');
        const uniqueStudents = await LessonCompletion.distinct('user', { lesson: { $in: subjectLessonIds } });
        const totalStudents = uniqueStudents.length;

        // 3. User progress
        let completionMap = {};
        if (req.user) {
            const completions = await LessonCompletion.find({ 
                user: req.user._id, lesson: { $in: subjectLessonIds } 
            }).populate('lesson', 'courseId').lean();
            
            completions.forEach(comp => {
                if (comp.lesson && comp.lesson.courseId) {
                    const cid = comp.lesson.courseId.toString();
                    completionMap[cid] = (completionMap[cid] || 0) + 1;
                }
            });
        }

        // 4. Enrich each course object
        courses.forEach(course => {
            const agg = lessonAgg.find(a => a._id.equals(course._id));
            course.lessonCount = agg?.count || 0;
            const lessonViews = agg?.totalViews || 0;
            course.viewCount = (course.views || 0) + lessonViews;
            course.likeCount = (course.likes || []).length;
            course.isLikedByUser = req.user ? (course.likes || []).some(id => id.toString() === req.user._id.toString()) : false;
            course.completedCount = completionMap[course._id.toString()] || 0;
            course.progressPercent = course.lessonCount > 0 
                ? Math.round((course.completedCount / course.lessonCount) * 100) : 0;
        });

        // 5. Subject-level totals
        const totalViews = courses.reduce((sum, c) => sum + c.viewCount, 0);
        const totalLikes = courses.reduce((sum, c) => sum + c.likeCount, 0);
        const totalLessons = courses.reduce((sum, c) => sum + c.lessonCount, 0);

        res.render("subjectDetail", {
            title: subject.name,
            user: req.user,
            subject,
            courses,
            totalViews,
            totalLikes,
            totalStudents,
            totalLessons,
            metaTitle: `${subject.name} | Học Tập Thủ Đức`,
            metaDescription: subject.description || `Khám phá các khóa học ${subject.name} với lộ trình rõ ràng, bài học tương tác và gamification học tập.`,
            metaImage: subject.image || 'https://i.ibb.co/BVnNtLhp/default-course.png',
            metaUrl: buildAbsoluteUrl(res.locals.siteOrigin, canonicalPath),
            activePage: "subjects"
        });
    } catch (e) { console.error(e); res.redirect('/subjects'); }
});

router.get("/leaderboard", isLoggedIn, leaderboardController.getLeaderboard);

router.get("/pro-images", isLoggedIn, (req, res) => {
    if (hasProAccess(req.user)) res.render("proImages", { user: req.user, activePage: "proImages" });
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
        if (avatar && avatar.trim() !== "" && user.isPro) {
            user.avatar = avatar.trim();
        }
        await user.save();
        req.flash("success", "Đã cập nhật."); res.redirect("/profile");
    } catch(e) { req.flash("error", "Lỗi."); res.redirect("/profile/edit"); }
});

router.get('/course/:id/:slug?', async (req, res, next) => {
    try {
        const course = await Course.findById(req.params.id).select('_id author isPublished isPro').lean();
        if (!course) {
            return courseController.getCourseDetail(req, res, next);
        }

        const canonicalPath = buildCoursePath(course);
        if (req.params.slug !== canonicalPath.split('/').pop()) {
            return res.redirect(301, canonicalPath);
        }

        const access = await getCourseAccessState(req.user, course);
        if (!access.allowed) {
            if (access.needsPro) {
                if (req.user) {
                    req.flash('error', 'Can PRO de xem khoa hoc nay.');
                    return res.redirect('/upgrade');
                }
                return res.redirect(`/login?redirect=/course/${req.params.id}`);
            }

            return res.status(404).render('404', { title: 'Khong tim thay khoa hoc', user: req.user });
        }

        return courseController.getCourseDetail(req, res, next);
    } catch (error) {
        return next(error);
    }
});

router.get("/courses", async (req, res) => {
    try {
        const courses = await Course.find(buildCourseVisibilityFilter(req.user)).populate('author', 'username avatar').populate('subjectId', 'name icon').sort({ createdAt: -1 }).lean();
        res.render("courses", { user: req.user, courses, activePage: "courses", title: "Thư viện khóa học" });
    } catch (e) { console.error(e); res.redirect('/'); }
});

module.exports = router;
