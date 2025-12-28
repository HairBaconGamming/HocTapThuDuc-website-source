const User = require('../models/User');
const Course = require('../models/Course');
const Unit = require('../models/Unit');
const Lesson = require('../models/Lesson');
const News = require('../models/News'); // <--- Đã sửa thành News

// 1. GET ADMIN PANEL
exports.getAdminPanel = async (req, res) => {
    try {
        const totalUsers = await User.countDocuments();
        const totalCourses = await Course.countDocuments();
        const totalLessons = await Lesson.countDocuments();
        const totalNews = await News.countDocuments(); // <--- Sửa

        const users = await User.find().sort({ createdAt: -1 }).lean();
        const courses = await Course.find().populate('author', 'username email').sort({ createdAt: -1 }).lean();
        
        // Lấy tin tức (News)
        const newsList = await News.find().populate('postedBy', 'username').sort({ createdAt: -1 }).lean();

        res.render('admin', {
            title: 'Admin Dashboard',
            user: req.user,
            stats: { totalUsers, totalCourses, totalLessons, totalNews },
            users,
            courses,
            news: newsList, // Truyền biến newsList vào view
            layout: false
        });

    } catch (err) {
        console.error("Admin Panel Error:", err);
        res.status(500).send("Server Error: " + err.message);
    }
};

// 2. USER ACTIONS
exports.updateUser = async (req, res) => {
    try {
        const { userId, role, isPro, isTeacher, proSecretKey } = req.body;
        
        await User.findByIdAndUpdate(userId, {
            role: role,
            isPro: isPro === 'on', // Checkbox trả về 'on' nếu được tick
            isTeacher: isTeacher === 'on',
            proSecretKey: proSecretKey
        });

        res.redirect('/admin?tab=users');
    } catch (err) {
        console.error(err);
        res.redirect('/admin?error=update_user_failed');
    }
};

exports.deleteUser = async (req, res) => {
    try {
        await User.findByIdAndDelete(req.body.userId);
        res.redirect('/admin?tab=users');
    } catch (err) {
        console.error(err);
        res.redirect('/admin');
    }
};

// 3. COURSE ACTIONS
exports.approveCourse = async (req, res) => {
    try {
        const { courseId, isPublished } = req.body;
        // Toggle trạng thái public
        await Course.findByIdAndUpdate(courseId, { 
            isPublished: isPublished === 'on' 
        });
        res.redirect('/admin?tab=courses');
    } catch (err) {
        console.error(err);
        res.redirect('/admin');
    }
};

exports.deleteCourse = async (req, res) => {
    try {
        const courseId = req.body.courseId;
        // Xóa Course, Unit, Lesson liên quan (Basic cleanup)
        await Course.findByIdAndDelete(courseId);
        await Unit.deleteMany({ courseId: courseId });
        // (Nâng cao: Cần tìm Lesson ID để xóa trong bảng Lesson nữa)
        
        res.redirect('/admin?tab=courses');
    } catch (err) {
        console.error(err);
        res.redirect('/admin');
    }
};

// 4. NEWS ACTIONS (Cập nhật theo Schema News.js)
exports.createNews = async (req, res) => {
    try {
        const { title, content, category, image } = req.body;
        
        await News.create({
            title,
            content,
            category: category || 'Thông báo', // Mặc định nếu không chọn
            image: image || '',
            postedBy: req.user._id // <--- Khớp với schema News.js
        });
        
        res.redirect('/admin?tab=news');
    } catch (err) {
        console.error("Create News Error:", err);
        res.redirect('/admin?error=create_news_failed');
    }
};

exports.deleteNews = async (req, res) => {
    try {
        await News.findByIdAndDelete(req.body.newsId);
        res.redirect('/admin?tab=news');
    } catch (err) {
        console.error(err);
        res.redirect('/admin');
    }
};