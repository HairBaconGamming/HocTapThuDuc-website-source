const User = require('../models/User');
const Lesson = require('../models/Lesson');
const Course = require('../models/Course');
const News = require('../models/News');
const {
    buildCourseVisibilityFilter,
    buildLessonVisibilityFilter
} = require('../utils/contentAccess');

// --- 1. DANH SÁCH TÍNH NĂNG HỆ THỐNG (Hardcoded) ---
// (Giữ nguyên như cũ vì nó rất tiện)
const SYSTEM_FEATURES = [
    { 
        title: "🏆 Bảng Xếp Hạng (Leaderboard)", 
        url: "/leaderboard", 
        keywords: ["bang xep hang", "rank", "top", "leaderboard", "dua top", "xep hang"],
        icon: "fas fa-trophy",
        desc: "Xem ai đang đứng đầu server học tập"
    },
    { 
        title: "📡 Phòng Live Stream", 
        url: "/live", 
        keywords: ["live", "stream", "truc tiep", "phat song", "video"],
        icon: "fas fa-broadcast-tower",
        desc: "Tham gia các buổi học trực tuyến"
    },
    { 
        title: "📰 Tin Tức & Sự Kiện", 
        url: "/news", 
        keywords: ["tin tuc", "news", "su kien", "thong bao", "event"],
        icon: "far fa-newspaper",
        desc: "Cập nhật thông tin mới nhất"
    },
    { 
        title: "🖼️ Kho Ảnh VIP (Pro Images)", 
        url: "/pro-images", 
        keywords: ["anh", "image", "avatar", "kho anh", "pro image", "vip"],
        icon: "fas fa-images",
        desc: "Kho tài nguyên ảnh dành riêng cho VIP"
    },
    { 
        title: "👤 Hồ Sơ Cá Nhân", 
        url: "/profile", 
        keywords: ["ho so", "profile", "thong tin", "tai khoan", "account", "avatar"],
        icon: "fas fa-id-card",
        desc: "Quản lý thông tin cá nhân của bạn"
    },
    { 
        title: "💎 Nâng Cấp VIP (Upgrade)", 
        url: "/upgrade", 
        keywords: ["nang cap", "upgrade", "vip", "pro", "nap", "mua"],
        icon: "fas fa-crown",
        desc: "Mở khóa toàn bộ tính năng xịn xò"
    },
    { 
        title: "🛠️ Đăng Nhập / Đăng Ký", 
        url: "/login", 
        keywords: ["dang nhap", "login", "dang ky", "register", "signin", "signup"],
        icon: "fas fa-sign-in-alt",
        desc: "Truy cập vào hệ thống"
    }
];

function searchFeatures(keyword) {
    if (!keyword) return [];
    const lowerKey = keyword.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    return SYSTEM_FEATURES.filter(f => {
        const matchTitle = f.title.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").includes(lowerKey);
        const matchKey = f.keywords.some(k => k.includes(lowerKey));
        return matchTitle || matchKey;
    });
}

// --- 2. CONTROLLER TRANG TÌM KIẾM CHÍNH (Search Page) ---
exports.searchPage = async (req, res) => {
    try {
        const keyword = req.query.q ? req.query.q.trim() : '';
        const type = req.query.type || 'all';

        let results = { features: [], lessons: [], courses: [], users: [], news: [] };
        
        // --- [MỚI] LOGIC TẠO TỪ KHÓA HOT (Dữ liệu thật) ---
        let hotTags = [];
        try {
            // 1. Lấy 3 bài học có lượt xem cao nhất (Trending)
            const topLessons = await Lesson.find(buildLessonVisibilityFilter(req.user)).sort({ views: -1 }).select('title').limit(3).lean();
            
            // 2. Lấy 2 khóa học mới nhất
            const newCourses = await Course.find(buildCourseVisibilityFilter(req.user)).sort({ createdAt: -1 }).select('title').limit(2).lean();

            // 3. Xây dựng danh sách Tags
            hotTags = [
                // Tag cứng quan trọng
                { text: "🏆 Đua Top Server", url: "/search?q=Rank" },
                { text: "📡 Live Stream", url: "/search?q=Live" },
                
                // Tag động từ DB
                ...topLessons.map(l => ({ text: `🔥 ${l.title}`, url: `/search?q=${encodeURIComponent(l.title)}` })),
                ...newCourses.map(c => ({ text: `📘 ${c.title}`, url: `/search?q=${encodeURIComponent(c.title)}` }))
            ];
            
            // Nếu ít dữ liệu quá thì độn thêm tag mặc định
            if (hotTags.length < 5) {
                hotTags.push({ text: "👑 Admin", url: "/search?q=Admin" });
                hotTags.push({ text: "English", url: "/search?q=Anh" });
            }

        } catch (e) {
            console.error("Error fetching hot tags:", e);
            // Fallback nếu lỗi DB
            hotTags = [
                { text: "Toán", url: "/search?q=Toán" },
                { text: "Văn", url: "/search?q=Văn" },
                { text: "Anh", url: "/search?q=Anh" }
            ];
        }
        // --------------------------------------------------

        if (keyword && keyword.length > 0) {
            const regex = new RegExp(keyword.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&"), 'i');
            const [lessons, courses, users, news] = await Promise.all([
                Lesson.find(buildLessonVisibilityFilter(req.user, { title: regex })).select('title slug views description').limit(10).lean(),
                Course.find(buildCourseVisibilityFilter(req.user, { title: regex })).select('title description thumbnail').limit(10).lean(),
                User.find({ $or: [{ username: regex }, { email: regex }] }).select('username avatar isPro role').limit(10).lean(),
                News.find({ title: regex }).select('title category createdAt').limit(10).lean()
            ]);
            const features = searchFeatures(keyword);
            results = { features, lessons, courses, users, news };
        } 

        res.render('search', {
            title: keyword ? `Tìm kiếm: ${keyword}` : 'Tìm kiếm thông minh',
            user: req.user,
            keyword,
            activeType: type,
            results,
            hotTags, // <--- Truyền biến này sang View
            activePage: 'search'
        });

    } catch (err) {
        console.error("Search Page Error:", err);
        res.status(500).render('error', { message: 'Lỗi hệ thống tìm kiếm' });
    }
};

// --- 3. API GỢI Ý NHANH (Suggestions) ---
// Yêu cầu: Chỉ tìm User, Course, News, Feature. (BỎ LESSON)
exports.getSuggestions = async (req, res) => {
    try {
        const keyword = req.query.q ? req.query.q.trim() : '';

        // Xử lý tìm kiếm trống: Trả về mảng rỗng ngay, không query DB
        if (!keyword || keyword.length < 1) {
            return res.json({ success: true, data: [] });
        }

        const regex = new RegExp(keyword.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&"), 'i');

        // Tìm song song (BỎ Lesson.find)
        const [courses, news, users] = await Promise.all([
            Course.find(buildCourseVisibilityFilter(req.user, { title: regex })).select('title _id').limit(3).lean(),
            News.find({ title: regex }).select('title _id').limit(3).lean(),
            User.find({ username: regex }).select('username _id avatar isPro').limit(3).lean()
        ]);

        // Tìm tính năng
        const features = searchFeatures(keyword).slice(0, 2); 

        // Gộp kết quả
        const suggestions = [
            // 1. Tính năng
            ...features.map(f => ({ type: 'feature', text: f.title, url: f.url, icon: f.icon, isSystem: true })),
            
            // 2. User (Ưu tiên hiện user để kết bạn/xem profile)
            ...users.map(u => ({ type: 'user', text: u.username, url: `/profile/view/${u._id}`, icon: 'fas fa-user', isPro: u.isPro })),

            // 3. Khóa học
            ...courses.map(c => ({ type: 'course', text: c.title, url: `/course/${c._id}`, icon: 'fas fa-layer-group' })),
            
            // 4. Tin tức
            ...news.map(n => ({ type: 'news', text: n.title, url: `/news/${n._id}`, icon: 'far fa-newspaper' }))
        ];

        res.json({ success: true, data: suggestions });

    } catch (err) {
        console.error("Suggest Error:", err);
        res.json({ success: false, data: [] });
    }
};
