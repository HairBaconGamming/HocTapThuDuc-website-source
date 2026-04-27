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

// --- 2. DASHBOARD ---
router.get("/dashboard", isLoggedIn, async (req, res) => {
    try {
        const [subjects, userNews, lessons] = await Promise.all([
            Subject.find({}).select("_id name").lean(),
            News.find({ postedBy: req.user._id }).sort({ createdAt: -1 }).lean(),
            Lesson.find({ createdBy: req.user._id }).sort({ createdAt: -1 }).lean()
        ]);

        const completions = await LessonCompletion.find({ user: req.user._id })
            .populate({
                path: 'lesson',
                select: 'title subject courseId', 
                populate: { path: 'courseId', select: 'title thumbnail subjectId' } 
            })
            .sort({ completedAt: -1 })
            .lean();

        const allCourses = await Course.find(buildCourseVisibilityFilter(req.user)).select('_id title thumbnail subjectId').lean();
        const allLessons = await Lesson.find().select('_id courseId subject').lean();

        const enrolledMap = new Map();
        completions.forEach(c => {
            if (!c.lesson) return;
            let courseId = c.lesson.courseId ? c.lesson.courseId._id.toString() : null;
            if (!courseId && c.lesson.subject) {
                const foundCourse = allCourses.find(course => course.subjectId?.toString() === c.lesson.subject.toString());
                if (foundCourse) courseId = foundCourse._id.toString();
            }
            if (courseId) {
                if (!enrolledMap.has(courseId)) enrolledMap.set(courseId, { completedLessonIds: new Set() });
                enrolledMap.get(courseId).completedLessonIds.add(c.lesson._id.toString());
            }
        });

        const enrolledCourses = [];
        let recentCourse = null;

        for (const [courseId, data] of enrolledMap) {
            const courseInfo = allCourses.find(c => c._id.toString() === courseId);
            if (courseInfo) {
                const totalLessonsInCourse = allLessons.filter(l => 
                    (l.courseId && l.courseId.toString() === courseId) || 
                    (l.subject && l.subject.toString() === courseInfo.subjectId?.toString())
                ).length;
                const completedCount = data.completedLessonIds.size;
                const progress = totalLessonsInCourse > 0 ? Math.round((completedCount / totalLessonsInCourse) * 100) : 0;
                enrolledCourses.push({
                    _id: courseInfo._id,
                    title: courseInfo.title,
                    image: courseInfo.thumbnail || 'https://i.ibb.co/BVnNtLhp/default-course.png',
                    totalLessons: totalLessonsInCourse,
                    completedLessons: completedCount,
                    progress: progress
                });
            }
        }
        enrolledCourses.sort((a, b) => b.progress - a.progress);

        if (completions.length > 0 && completions[0].lesson) {
            const lastLesson = completions[0].lesson;
            let lastCourseId = lastLesson.courseId ? lastLesson.courseId._id.toString() : null;
            if (!lastCourseId && lastLesson.subject) {
                const found = allCourses.find(c => c.subjectId?.toString() === lastLesson.subject.toString());
                if (found) lastCourseId = found._id.toString();
            }
            if (lastCourseId) recentCourse = enrolledCourses.find(c => c._id.toString() === lastCourseId);
        }
        if (!recentCourse && enrolledCourses.length > 0) recentCourse = enrolledCourses[0];

        const weeklyActivity = [0, 0, 0, 0, 0, 0, 0];
        const todayMoment = moment().tz("Asia/Ho_Chi_Minh");
        const startOfWeek = todayMoment.clone().startOf('isoWeek');
        const dateList = [];
        for(let i=0; i<7; i++) dateList.push(startOfWeek.clone().add(i, 'days').format("YYYY-MM-DD"));

        try {
            const activityLogs = await UserActivityLog.find({ user: req.user._id, dateStr: { $in: dateList } }).lean();
            dateList.forEach((date, index) => {
                const log = activityLogs.find(l => l.dateStr === date);
                if (log) weeklyActivity[index] = parseFloat((log.minutes / 60).toFixed(1));
            });
        } catch (err) { console.warn(err.message); }

        const gardenData = await Garden.findOne({ user: req.user._id }).lean();
        const userAchievements = await UserAchievement.find({ user: req.user._id }).populate('achievementId').sort({ unlockedAt: -1 }).limit(4).lean();
        const liveSessions = await getUpcomingDashboardSessions(req.user);
        const levelInfo = LevelUtils.getLevelInfo(req.user.level || 1, req.user.xp || 0);
        
        res.render("dashboard", {
            user: req.user, lessons, userNews, subjects, enrolledCourses, recentCourse,
            weeklyActivity: JSON.stringify(weeklyActivity), completedLessonsCount: completions.length,
            gardenData, userAchievements, liveSessions, levelInfo, activePage: "dashboard",
            currentSubject: "", currentCategory: "", currentSort: "desc", currentQuery: "",
            currentNewsCategory: "", currentNewsQuery: "", currentNewsSort: "desc"
        });
    } catch (err) {
        console.error("Dashboard Error:", err);
        req.flash("error", "Lỗi tải bảng điều khiển.");
        res.redirect("/");
    }
});

// --- OTHER ROUTES ---
router.get("/flashcards/review", isLoggedIn, async (req, res) => {
    try {
        const courseId = String(req.query.courseId || '').trim();
        let course = null;
        if (courseId) {
            course = await Course.findById(courseId).select('_id title subjectId').populate('subjectId', 'name').lean();
        }
        const breadcrumbs = [
            { label: 'Trang chủ', url: '/' },
            ...(course ? [{ label: course.title, url: buildCoursePath(course) }] : []),
            { label: 'Ôn tập flashcard', url: null }
        ];
        res.render("flashcardReview", { user: req.user, course, courseId: course ? String(course._id) : '', breadcrumbs, activePage: "subjects", title: course ? `Ôn tập | ${course.title}` : 'Ôn tập flashcard' });
    } catch (error) { res.redirect("/dashboard"); }
});

router.get("/subjects", async (req, res) => {
    try {
        const subjects = await Subject.find().sort({ name: 1 }).lean();
        const subjectsWithCount = await Promise.all(subjects.map(async (sub) => {
            const count = await Course.countDocuments(buildCourseVisibilityFilter(req.user, { subjectId: sub._id }));
            return { ...sub, courseCount: count };
        }));
        res.render("subjects", { user: req.user, subjects: subjectsWithCount, activePage: "subjects", title: "Danh mục Môn học" });
    } catch(e) { res.redirect('/'); }
});

router.get("/subjects/:id/:slug?", async (req, res) => {
    try {
        const mongoose = require('mongoose');
        const subjectId = req.params.id;
        const subject = await Subject.findById(subjectId).lean();
        if (!subject) return res.redirect('/subjects');
        const canonicalPath = buildSubjectPath(subject);
        if (req.params.slug !== canonicalPath.split('/').pop()) return res.redirect(301, canonicalPath);
        
        let courses = await Course.find(buildCourseVisibilityFilter(req.user, { subjectId: subject._id })).populate('author', 'username avatar').sort({ createdAt: -1 }).lean();
        const courseIds = courses.map(c => c._id);
        const courseObjectIds = courseIds.map(id => new mongoose.Types.ObjectId(id));

        const lessonAgg = await Lesson.aggregate([
            { $match: { courseId: { $in: courseObjectIds } } },
            { $group: { _id: '$courseId', count: { $sum: 1 }, totalViews: { $sum: '$views' } } }
        ]);

        const subjectLessonIds = await Lesson.find({ courseId: { $in: courseIds } }).distinct('_id');
        const uniqueStudents = await LessonCompletion.distinct('user', { lesson: { $in: subjectLessonIds } });
        const totalStudents = uniqueStudents.length;

        let completionMap = {};
        if (req.user) {
            const completions = await LessonCompletion.find({ user: req.user._id, lesson: { $in: subjectLessonIds } }).populate('lesson', 'courseId').lean();
            completions.forEach(comp => {
                if (comp.lesson && comp.lesson.courseId) {
                    const cid = comp.lesson.courseId.toString();
                    completionMap[cid] = (completionMap[cid] || 0) + 1;
                }
            });
        }

        courses.forEach(course => {
            const agg = lessonAgg.find(a => a._id.equals(course._id));
            course.lessonCount = agg?.count || 0;
            course.viewCount = (course.views || 0) + (agg?.totalViews || 0);
            course.likeCount = (course.likes || []).length;
            course.isLikedByUser = req.user ? (course.likes || []).some(id => id.toString() === req.user._id.toString()) : false;
            course.completedCount = completionMap[course._id.toString()] || 0;
            course.progressPercent = course.lessonCount > 0 ? Math.round((course.completedCount / course.lessonCount) * 100) : 0;
        });

        res.render("subjectDetail", {
            title: subject.name, user: req.user, subject, courses,
            totalViews: courses.reduce((sum, c) => sum + c.viewCount, 0),
            totalLikes: courses.reduce((sum, c) => sum + c.likeCount, 0),
            totalStudents, totalLessons: courses.reduce((sum, c) => sum + c.lessonCount, 0),
            metaTitle: `${subject.name} | Học Tập Thủ Đức`,
            metaDescription: subject.description || `Khám phá các khóa học ${subject.name}.`,
            metaImage: subject.image || 'https://i.ibb.co/BVnNtLhp/default-course.png',
            metaUrl: buildAbsoluteUrl(res.locals.siteOrigin, canonicalPath),
            activePage: "subjects"
        });
    } catch (e) { res.redirect('/subjects'); }
});

router.get("/leaderboard", isLoggedIn, leaderboardController.getLeaderboard);

router.get("/pro-images", isLoggedIn, (req, res) => {
    if (hasProAccess(req.user)) res.render("proImages", { user: req.user, activePage: "proImages" });
    else { req.flash("error", "Chỉ dành cho PRO."); res.redirect("/upgrade"); }
});

// Profile Routes
router.get("/profile", isLoggedIn, profileController.getProfile);
router.get("/profile/view/:id", profileController.getProfile);
router.get("/achievements", isLoggedIn, (req, res) => { res.render("achievements", { user: req.user, activePage: "achievements", title: "Thành Tích" }); });
router.get("/profile/edit", isLoggedIn, (req, res) => { res.render("editProfile", { user: req.user, activePage: "profile" }); });
router.post("/profile/edit", isLoggedIn, async (req, res) => {
    try {
        const { email, bio, class: userClass, school, avatar, displayName, showCultivation } = req.body; 
        const user = await User.findById(req.user._id);
        user.email = email; user.bio = bio; user.class = userClass; user.school = school;
        user.displayName = (displayName || "").trim().substring(0, 30);
        user.showCultivation = showCultivation === 'on';
        if (avatar && avatar.trim() !== "" && user.isPro) user.avatar = avatar.trim();
        await user.save();
        req.flash("success", "Đã cập nhật hồ sơ thành công."); res.redirect("/profile");
    } catch(e) { req.flash("error", "Lỗi khi cập nhật hồ sơ."); res.redirect("/profile/edit"); }
});

router.get('/course/:id/:slug?', async (req, res, next) => {
    try {
        const course = await Course.findById(req.params.id).select('_id author isPublished isPro').lean();
        if (!course) return courseController.getCourseDetail(req, res, next);
        const canonicalPath = buildCoursePath(course);
        if (req.params.slug !== canonicalPath.split('/').pop()) return res.redirect(301, canonicalPath);
        const access = await getCourseAccessState(req.user, course);
        if (!access.allowed) {
            if (access.needsPro) {
                if (req.user) { req.flash('error', 'Cần PRO để xem khóa học này.'); return res.redirect('/upgrade'); }
                return res.redirect(`/login?redirect=/course/${req.params.id}`);
            }
            return res.status(404).render('404', { title: 'Không tìm thấy khóa học', user: req.user });
        }
        return courseController.getCourseDetail(req, res, next);
    } catch (error) { return next(error); }
});

router.get("/courses", async (req, res) => {
    try {
        const courses = await Course.find(buildCourseVisibilityFilter(req.user)).populate('author', 'username avatar').populate('subjectId', 'name icon').sort({ createdAt: -1 }).lean();
        res.render("courses", { user: req.user, courses, activePage: "courses", title: "Thư viện khóa học" });
    } catch (e) { res.redirect('/'); }
});

module.exports = router;
