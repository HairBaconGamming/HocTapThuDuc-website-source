const User = require('../models/User');
const Course = require('../models/Course');
const Unit = require('../models/Unit');
const Lesson = require('../models/Lesson');
const Subject = require('../models/Subject');
const News = require('../models/News'); // <--- Đã sửa thành News
const VisitStats = require('../models/VisitStats'); // Import Model thống kê truy cập

// controllers/adminController.js

exports.getAdminPanel = async (req, res) => {
    try {
        // ... (Giữ nguyên các phần thống kê User, Course, News cũ ...)
        const totalUsers = await User.countDocuments();
        const totalCourses = await Course.countDocuments();
        const totalLessons = await Lesson.countDocuments();
        const totalNews = await News.countDocuments();

        const users = await User.find().sort({ createdAt: -1 }).limit(10).lean();
        const courses = await Course.find().populate('author', 'username email').sort({ createdAt: -1 }).limit(10).lean();
        const subjects = await Subject.find().sort({ createdAt: -1 }).lean();
        const news = await News.find().sort({ createdAt: -1 }).limit(10).lean();

        // --- XỬ LÝ CHART DATA ---

        // 1. CHART: Growth (7 ngày) - Giữ nguyên logic cũ
        const labels = [];
        const dataVisits = [];
        const dataRegisters = [];
        
        for (let i = 6; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            const dateStr = d.toISOString().split('T')[0];
            const displayDate = d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
            
            labels.push(displayDate);
            
            const startOfDay = new Date(d.setHours(0,0,0,0));
            const endOfDay = new Date(d.setHours(23,59,59,999));
            
            dataRegisters.push(await User.countDocuments({ createdAt: { $gte: startOfDay, $lte: endOfDay } }));
            
            const visitRecord = await VisitStats.findOne({ dateStr: dateStr });
            dataVisits.push(visitRecord ? visitRecord.count : 0);
        }

        // 2. CHART: User Structure (Phân loại User)
        const countPro = await User.countDocuments({ isPro: true });
        const countTeacher = await User.countDocuments({ isTeacher: true });
        const countAdmin = await User.countDocuments({ isAdmin: true });
        const countNormal = totalUsers - countPro - countTeacher - countAdmin; // Tương đối (nếu user không overlap quyền)

        // 3. CHART: Content Distribution (Khóa học theo Môn)
        // Lấy top 5 môn có nhiều khóa học nhất (hoặc tất cả)
        const subjectLabels = [];
        const subjectCounts = [];
        
        // Dùng Promise.all để chạy nhanh hơn thay vì await trong loop
        await Promise.all(subjects.map(async (sub) => {
            const count = await Course.countDocuments({ subject: sub._id });
            if (count > 0) { // Chỉ lấy môn có khóa học để đỡ rác biểu đồ
                subjectLabels.push(sub.name);
                subjectCounts.push(count);
            }
        }));

        // Gửi tất cả xuống View
        res.render('admin', {
            title: 'Admin Dashboard',
            user: req.user,
            stats: { totalUsers, totalCourses, totalLessons, totalNews },
            users, courses, subjects, news,
            
            // Object chứa toàn bộ data chart
            chartData: {
                growth: { labels, visits: dataVisits, registers: dataRegisters },
                userPie: { 
                    labels: ['Thành viên thường', 'Tài khoản PRO', 'Giáo viên', 'Admin'], 
                    data: [countNormal > 0 ? countNormal : 0, countPro, countTeacher, countAdmin] 
                },
                contentBar: { labels: subjectLabels, data: subjectCounts }
            },
            layout: false
        });

    } catch (err) {
        console.error("Admin Panel Error:", err);
        res.status(500).send("Server Error");
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

exports.saveSubject = async (req, res) => {
    try {
        // Lấy dữ liệu từ Form (admin.ejs dòng 1031)
        const { subjectId, name, image } = req.body;

        // Validate cơ bản
        if (!name) {
            req.flash('error', 'Tên môn học không được để trống!');
            return res.redirect('/admin?tab=subjects');
        }

        // 1. TRƯỜNG HỢP CẬP NHẬT (NẾU CÓ ID)
        if (subjectId && subjectId.trim() !== '') {
            await Subject.findByIdAndUpdate(subjectId, {
                name: name.trim(),
                image: image ? image.trim() : ''
            });
            req.flash('success', 'Cập nhật môn học thành công!');
        } 
        // 2. TRƯỜNG HỢP THÊM MỚI (KHÔNG CÓ ID)
        else {
            const newSubject = new Subject({
                name: name.trim(),
                image: image ? image.trim() : ''
            });
            await newSubject.save();
            req.flash('success', 'Thêm môn học mới thành công!');
        }

        res.redirect('/admin?tab=subjects');

    } catch (err) {
        console.error("Lỗi Save Subject:", err);
        req.flash('error', 'Lỗi hệ thống: ' + err.message);
        res.redirect('/admin?tab=subjects');
    }
};

// --- [FIX] XÓA MÔN HỌC ---
exports.deleteSubject = async (req, res) => {
    try {
        const { subjectId } = req.body; // Lấy ID từ form delete
        
        if (!subjectId) {
            req.flash('error', 'Không tìm thấy ID môn học cần xóa.');
            return res.redirect('/admin?tab=subjects');
        }

        await Subject.findByIdAndDelete(subjectId);
        
        req.flash('success', 'Đã xóa môn học!');
        res.redirect('/admin?tab=subjects');
        
    } catch (err) {
        console.error("Lỗi Delete Subject:", err);
        req.flash('error', 'Lỗi khi xóa: ' + err.message);
        res.redirect('/admin?tab=subjects');
    }
};