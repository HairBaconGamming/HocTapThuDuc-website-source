const User = require('../models/User');
const Course = require('../models/Course');
const Unit = require('../models/Unit');
const Lesson = require('../models/Lesson');
const News = require('../models/News'); // <--- Đã sửa thành News
const VisitStats = require('../models/VisitStats'); // Import Model thống kê truy cập

exports.getAdminPanel = async (req, res) => {
    try {
        // 1. Thống kê tổng quan (Giữ nguyên code cũ)
        const totalUsers = await User.countDocuments();
        const totalCourses = await Course.countDocuments();
        const totalLessons = await Lesson.countDocuments();
        const totalNews = await News.countDocuments();

        const users = await User.find().sort({ createdAt: -1 }).lean();
        const courses = await Course.find().populate('author', 'username email').sort({ createdAt: -1 }).lean();
        const subjects = await Subject.find().sort({ createdAt: -1 }).lean();
        const news = await News.find().sort({ createdAt: -1 }).lean();

        // 2. --- XỬ LÝ DỮ LIỆU BIỂU ĐỒ (7 NGÀY GẦN NHẤT) ---
        const labels = [];
        const dataVisits = [];
        const dataRegisters = [];

        for (let i = 6; i >= 0; i--) {
            // Tạo ngày: Hôm nay, hôm qua, hôm kia...
            const d = new Date();
            d.setDate(d.getDate() - i);
            
            // Set thời gian bắt đầu và kết thúc của ngày đó (00:00 -> 23:59)
            const startOfDay = new Date(d.setHours(0, 0, 0, 0));
            const endOfDay = new Date(d.setHours(23, 59, 59, 999));

            // Format nhãn ngày tháng (VD: "28/12")
            const dateStr = startOfDay.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
            labels.push(dateStr);

            // A. Đếm số User đăng ký trong khoảng thời gian này
            const regCount = await User.countDocuments({
                createdAt: { $gte: startOfDay, $lte: endOfDay }
            });
            dataRegisters.push(regCount);

            // B. Lấy số lượt truy cập từ bảng VisitStats (Nếu có)
            // Lưu ý: Bạn cần đảm bảo middleware đếm lượt truy cập đang chạy và lưu vào DB với field 'date' là startOfDay
            const visitRecord = await VisitStats.findOne({ date: startOfDay });
            dataVisits.push(visitRecord ? visitRecord.count : 0);
        }

        // 3. Render và truyền chartData sang View
        res.render('admin', {
            title: 'Admin Dashboard',
            user: req.user,
            stats: { totalUsers, totalCourses, totalLessons, totalNews },
            users,
            courses,
            subjects,
            news,
            // Truyền dữ liệu chart riêng biệt để tránh lỗi JSON
            labels: labels,
            visits: dataVisits,
            registers: dataRegisters,
            layout: false
        });

    } catch (err) {
        console.error("Admin Panel Error:", err);
        res.status(500).send("Server Error: " + err.message);
    }
};

exports.updateUser = async (req, res) => {
    try {
        // Lấy isAdmin từ body (nếu check thì là 'on', không check là undefined)
        const { userId, isAdmin, isPro, isTeacher, proSecretKey } = req.body;
        const currentUser = req.user;

        const targetUser = await User.findById(userId);
        if (!targetUser) return res.redirect('/admin?tab=users');

        // --- BẢO MẬT ---
        
        // 1. Nếu đang sửa 'truonghoangnam' -> Giữ nguyên quyền Admin
        if (targetUser.username === 'truonghoangnam') {
            await User.findByIdAndUpdate(userId, {
                // isAdmin: true, // Mặc định true, không cần update lại
                isPro: true,
                isTeacher: true,
                proSecretKey: proSecretKey
            });
            req.flash('success', 'Đã update thông tin Owner.');
            return res.redirect('/admin?tab=users');
        }

        // 2. Chuẩn bị object update
        let updateData = {
            isPro: isPro === 'on',
            isTeacher: isTeacher === 'on',
            proSecretKey: proSecretKey
        };

        // 3. Xử lý quyền Admin
        // Chỉ 'truonghoangnam' mới được phép thay đổi trường isAdmin
        if (currentUser.username === 'truonghoangnam') {
            updateData.isAdmin = (isAdmin === 'on');
        } 
        // Nếu không phải truonghoangnam, ta KHÔNG thêm isAdmin vào updateData 
        // => Giá trị cũ trong DB được giữ nguyên (an toàn)

        await User.findByIdAndUpdate(userId, updateData);

        req.flash('success', 'Cập nhật thành công!');
        res.redirect('/admin?tab=users');

    } catch (err) {
        console.error(err);
        req.flash('error', 'Lỗi server');
        res.redirect('/admin?tab=users');
    }
};

exports.deleteUser = async (req, res) => {
    try {
        const targetUser = await User.findById(req.body.userId);
        if (targetUser.username === 'truonghoangnam') {
            req.flash('error', 'Không thể xóa tài khoản Super Admin!');
            return res.redirect('/admin?tab=users');
        }
        await User.findByIdAndDelete(req.body.userId);
        req.flash('success', 'Xóa người dùng thành công!');
        res.redirect('/admin?tab=users');
    } catch (err) {
        console.error(err);
        req.flash('error', 'Lỗi xóa user');
        res.redirect('/admin?tab=users');
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