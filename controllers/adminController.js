// controllers/adminController.js

const User = require('../models/User');
const Lesson = require('../models/Lesson');
const News = require('../models/News');
const Subject = require('../models/Subject');
const VisitStats = require('../models/VisitStats'); // Nếu bạn có model thống kê lượt truy cập
const moment = require('moment-timezone');

// --- MAIN PAGE RENDER ---
// Hàm này chuẩn bị toàn bộ dữ liệu cho giao diện "Command Center"
exports.getAdminPanel = async (req, res) => {
    try {
        const subjects = await Subject.find().sort({ name: 1 }).lean();
        const units = await Unit.find().populate('subjectId', 'name').sort({ subjectId: 1, order: 1 }).limit(100).lean();
        const today = moment().tz("Asia/Ho_Chi_Minh").format("YYYY-MM-DD");

        // 1. Chạy song song các query đếm số liệu (Stats)
        const [
            totalUsers, 
            proUsers, 
            totalLessons, 
            totalNews,
            visitData
        ] = await Promise.all([
            User.countDocuments(),
            User.countDocuments({ isPro: true }),
            Lesson.countDocuments(),
            News.countDocuments(),
            VisitStats.findOne({ key: `dailyVisits_${today}` }) // Lấy lượt view hôm nay (nếu có logic này)
        ]);

        // 2. Lấy danh sách dữ liệu chi tiết (Giới hạn 100 mới nhất để tối ưu)
        // Populate để lấy tên tác giả bài viết
        const users = await User.find().sort({ createdAt: -1 }).limit(100).lean();
        
        const lessons = await Lesson.find()
            .populate('createdBy', 'username') // Use createdBy as defined in Lesson schema
            .sort({ createdAt: -1 })
            .limit(100)
            .lean();

        const newsList = await News.find()
            .populate('postedBy', 'username avatar _id') // Include poster info for admin view
            .sort({ createdAt: -1 })
            .limit(100)
            .lean();

        // 3. Render ra View
        res.render('admin', {
            title: 'Admin Command Center',
            user: req.user,
            activePage: 'admin',
            stats: {
                totalUsers,
                proUsers,
                totalLessons,
                totalNews,
                todayVisits: visitData ? visitData.count : 0
            },
            users,
            lessons,
            newsList,
            subjects, 
            units,  
        });

    } catch (err) {
        console.error("Admin Panel Error:", err);
        // Render trang lỗi nếu database tạch
        res.status(500).render('error', { 
            title: '500 - Server Error',
            error: err,
            user: req.user 
        });
    }
};

// --- API: Stats (JSON) ---
exports.getStats = async (req, res) => {
    try {
        const today = moment().tz("Asia/Ho_Chi_Minh").format("YYYY-MM-DD");
        const [totalUsers, proUsers, totalLessons, totalNews, totalSubjects] = await Promise.all([
            User.countDocuments(),
            User.countDocuments({ isPro: true }),
            Lesson.countDocuments(),
            News.countDocuments(),
            Subject.countDocuments()
        ]);

        const visitData = await VisitStats.findOne({ key: `dailyVisits_${today}` });
        const dailyVisits = visitData ? visitData.count : 0;

        // Recent lists (small previews)
        const recentUsers = await User.find().sort({ createdAt: -1 }).limit(5).lean();
        const recentLessons = await Lesson.find().sort({ createdAt: -1 }).limit(5).lean();

        // Total visits (sum of all VisitStats counts if available)
        const allVisitsAgg = await VisitStats.aggregate([
            { $match: { key: { $regex: /^dailyVisits_/ } } },
            { $group: { _id: null, total: { $sum: "$count" } } }
        ]);
        const totalVisits = (allVisitsAgg[0] && allVisitsAgg[0].total) || 0;

        res.json({
            totalUsers,
            proUsers,
            totalLessons,
            totalNews,
            totalSubjects,
            totalVisits,
            dailyVisits,
            recentUsers,
            recentLessons
        });
    } catch (err) {
        console.error("Error fetching stats:", err);
        res.status(500).json({ error: 'Lỗi khi lấy số liệu thống kê' });
    }
};

// --- API: Users (paginated + filters) ---
exports.getUsers = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const perPage = 20;
        const search = req.query.search || '';
        const isPro = req.query.isPro;
        const isBanned = req.query.isBanned;

        const filter = {};
        if (search) filter.username = { $regex: search, $options: 'i' };
        if (isPro === 'true' || isPro === 'false') filter.isPro = isPro === 'true';
        if (isBanned === 'true' || isBanned === 'false') filter.isBanned = isBanned === 'true';

        const total = await User.countDocuments(filter);
        const users = await User.find(filter).sort({ createdAt: -1 }).skip((page - 1) * perPage).limit(perPage).lean();
        const pages = Math.max(1, Math.ceil(total / perPage));
        res.json({ users, page, pages });
    } catch (err) {
        console.error('Error fetching users:', err);
        res.status(500).json({ error: 'Lỗi khi lấy danh sách người dùng' });
    }
};

// --- API: Ban / Unban User ---
exports.banUser = async (req, res) => {
    try {
        const id = req.params.id;
        await User.findByIdAndUpdate(id, { isBanned: true });
        res.json({ success: true });
    } catch (err) {
        console.error('Ban user error:', err);
        res.status(500).json({ error: 'Lỗi khi khóa user' });
    }
};

exports.unbanUser = async (req, res) => {
    try {
        const id = req.params.id;
        await User.findByIdAndUpdate(id, { isBanned: false });
        res.json({ success: true });
    } catch (err) {
        console.error('Unban user error:', err);
        res.status(500).json({ error: 'Lỗi khi mở khóa user' });
    }
};

// --- API: Subjects ---
exports.getSubjects = async (req, res) => {
    try {
        const subjects = await Subject.find().lean();
        res.json(subjects);
    } catch (err) {
        console.error('Error fetching subjects:', err);
        res.status(500).json({ error: 'Lỗi khi lấy danh sách môn học' });
    }
};

exports.createSubject = async (req, res) => {
    try {
        const { name, description, image } = req.body;
        const subject = new Subject({ name, description, image });
        await subject.save();
        res.json({ success: true, subject });
    } catch (err) {
        console.error('Error creating subject:', err);
        res.status(500).json({ error: 'Lỗi khi tạo môn học' });
    }
};

exports.deleteSubject = async (req, res) => {
    try {
        await Subject.findByIdAndDelete(req.params.id);
        res.json({ success: true });
    } catch (err) {
        console.error('Error deleting subject:', err);
        res.status(500).json({ error: 'Lỗi khi xóa môn học' });
    }
};

// --- API: PRO Keys ---
function generateSecretKey() {
    return require('crypto').randomBytes(8).toString('hex');
}

exports.getProKeys = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const perPage = 20;
        const search = req.query.search || '';
        const filter = { proSecretKey: { $exists: true, $ne: '' } };
        if (search) filter.username = { $regex: search, $options: 'i' };
        const total = await User.countDocuments(filter);
        const users = await User.find(filter).sort({ createdAt: -1 }).skip((page - 1) * perPage).limit(perPage).lean();
        const pages = Math.max(1, Math.ceil(total / perPage));
        res.json({ users, page, pages });
    } catch (err) {
        console.error('Error fetching pro keys:', err);
        res.status(500).json({ error: 'Lỗi khi lấy danh sách key PRO' });
    }
};

exports.regenerateProKey = async (req, res) => {
    try {
        const id = req.params.id;
        const user = await User.findById(id);
        if (!user) return res.status(404).json({ error: 'User not found' });
        user.proSecretKey = generateSecretKey();
        await user.save();
        res.json({ success: true, key: user.proSecretKey });
    } catch (err) {
        console.error('Error regenerating key:', err);
        res.status(500).json({ error: 'Lỗi khi tạo lại khóa PRO' });
    }
};

// --- API ACTIONS (Xử lý các nút bấm trong Admin Panel) ---

// 1. Cập nhật User (Sửa/Ban)
exports.updateUser = async (req, res) => {
    const { id } = req.params;
    const { isPro, isBanned, points } = req.body;

    try {
        const updateData = {};
        if (isPro !== undefined) updateData.isPro = isPro === 'true' || isPro === true;
        if (isBanned !== undefined) updateData.isBanned = isBanned === 'true' || isBanned === true;
        if (points !== undefined) updateData.points = parseInt(points);

        await User.findByIdAndUpdate(id, updateData);
        res.json({ success: true, message: 'Cập nhật thành viên thành công!' });
    } catch (err) {
        res.status(500).json({ error: 'Lỗi cập nhật user' });
    }
};

// 2. Xóa User
exports.deleteUser = async (req, res) => {
    try {
        await User.findByIdAndDelete(req.params.id);
        res.json({ success: true, message: 'Đã xóa thành viên vĩnh viễn.' });
    } catch (err) {
        res.status(500).json({ error: 'Lỗi xóa user' });
    }
};

// 3. Xóa Bài học
exports.deleteLesson = async (req, res) => {
    try {
        await Lesson.findByIdAndDelete(req.params.id);
        res.json({ success: true, message: 'Đã xóa bài học.' });
    } catch (err) {
        res.status(500).json({ error: 'Lỗi xóa bài học' });
    }
};

// 4. Xóa Tin tức
exports.deleteNews = async (req, res) => {
    try {
        await News.findByIdAndDelete(req.params.id);
        res.json({ success: true, message: 'Đã xóa tin tức.' });
    } catch (err) {
        res.status(500).json({ error: 'Lỗi xóa tin tức' });
    }
};

// 5. API Data cho Chart (Traffic)
// Gọi API này từ Client-side JS để vẽ biểu đồ
exports.getChartData = async (req, res) => {
    try {
        // Giả lập logic lấy data 7 ngày gần nhất
        // Trong thực tế bạn cần query VisitStats theo range date
        const labels = [];
        const data = [];
        
        for(let i=6; i>=0; i--) {
            const date = moment().subtract(i, 'days').tz("Asia/Ho_Chi_Minh");
            const dateStr = date.format("YYYY-MM-DD");
            const stat = await VisitStats.findOne({ key: `dailyVisits_${dateStr}` });
            
            labels.push(date.format("DD/MM"));
            data.push(stat ? stat.count : 0);
        }

        res.json({ labels, data });
    } catch (err) {
        res.status(500).json({ error: 'Lỗi lấy data chart' });
    }
};