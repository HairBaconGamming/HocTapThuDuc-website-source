const express = require('express');
const router = express.Router();
const passport = require('passport');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { isLoggedIn, isPro, isTeacher } = require('../middlewares/auth'); // Thêm isTeacher
const unitController = require('../controllers/unitController');
const lessonController = require('../controllers/lessonController'); // Import lessonController
const courseController = require('../controllers/courseController');

// --- 1. API Đăng nhập (JWT) ---
router.post('/auth/login', (req, res, next) => {
    passport.authenticate('local', { session: false }, (err, user, info) => {
        if (err) {
            console.error("API Login Error:", err);
            return res.status(500).json({ message: 'Lỗi máy chủ khi đăng nhập.' });
        }
        if (!user) {
            return res.status(401).json({ message: info?.message || 'Tên đăng nhập hoặc mật khẩu không chính xác.' });
        }

        // Cập nhật thông tin đăng nhập
        try {
             User.findByIdAndUpdate(user._id, {
                  lastLoginIP: req.ip,
                  lastloginUA: req.get('User-Agent') || 'Unknown'
             }).exec();
        } catch(saveErr) {
             console.error(saveErr);
        }

        // Tạo Token JWT
        const payload = { 
            id: user._id, 
            username: user.username, 
            email: user.email, 
            isPro: user.isPro, 
            isAdmin: user.isAdmin 
        };
        
        const secretKey = process.env.JWT_SECRET || 'secret_key_fallback'; // Đảm bảo có key
        const token = jwt.sign(payload, secretKey, { expiresIn: '1d' });

        return res.json({ 
            success: true, 
            message: 'Đăng nhập thành công!', 
            token: token, 
            user: { 
                id: user._id, 
                username: user.username, 
                email: user.email, 
                isPro: user.isPro, 
                isAdmin: user.isAdmin 
            } 
        });
    })(req, res, next);
});

// --- 2. API Đăng ký (Optional - Nếu Frontend gọi API) ---
router.post('/auth/register', async (req, res) => {
    const { username, password, email } = req.body;
    
    // Validate cơ bản
    if (!username || username.length < 6) return res.status(400).json({ message: 'Username quá ngắn.' });
    if (!password || password.length < 6) return res.status(400).json({ message: 'Password quá ngắn.' });

    try {
        const exists = await User.findOne({ $or: [{ username }, { email }] });
        if (exists) return res.status(409).json({ message: 'User đã tồn tại.' });

        const newUser = new User({ username, password, email });
        await newUser.save();
        res.status(201).json({ success: true, message: 'Đăng ký thành công.' });
    } catch (e) {
        res.status(500).json({ message: 'Lỗi server.' });
    }
});

// --- 3. API Đăng xuất ---
router.post('/auth/logout', (req, res) => {
    if (req.isAuthenticated()) {
        req.logout(() => {});
    }
    // Hủy session nếu dùng session
    if (req.session) {
        req.session.destroy();
    }
    res.clearCookie('connect.sid');
    return res.json({ success: true, message: 'Đã đăng xuất.' });
});

// --- 4. Kiểm tra trạng thái đăng nhập ---
router.get('/auth/status', (req, res) => {
    if (req.isAuthenticated()) {
        const userInfo = { 
            id: req.user._id, 
            username: req.user.username, 
            email: req.user.email, 
            isPro: req.user.isPro 
        };
        res.json({ isAuthenticated: true, user: userInfo });
    } else {
        res.json({ isAuthenticated: false, user: null });
    }
});

// --- 5. Cập nhật Avatar (Yêu cầu Login & PRO) ---
router.post('/user/avatar', isLoggedIn, isPro, async (req, res) => {
    try {
        const { avatarUrl } = req.body;
        // Accept absolute (http/https) or relative (starting with '/') URLs, and data URLs
        if (!avatarUrl || !(avatarUrl.startsWith('/') || avatarUrl.startsWith('http') || avatarUrl.startsWith('data:'))) {
            return res.status(400).json({ error: 'URL ảnh không hợp lệ.' });
        }

        // Normalize absolute URLs to path + query to avoid saving host (prevents localhost:3000 entries)
        let storeUrl = avatarUrl;
        try {
            if (avatarUrl.startsWith('http')) {
                const parsed = new URL(avatarUrl);
                storeUrl = parsed.pathname + parsed.search; // keep path and query if present
            }
        } catch (e) {
            // If URL parsing fails, fall back to original value
            console.warn('Failed to parse avatar URL for normalization:', avatarUrl, e);
        }

        await User.findByIdAndUpdate(req.user._id, { avatar: storeUrl });
        res.json({ success: true, message: 'Cập nhật avatar thành công.', newAvatarUrl: storeUrl });

    } catch (error) {
        console.error("Avatar Update Error:", error);
        res.status(500).json({ error: 'Lỗi server khi cập nhật avatar.' });
    }
});

// --- 3. API LESSON (MỚI THÊM) ---
// Prefix URL sẽ là: /api/lesson/...

// Lưu bài học (AJAX từ Editor)
// Yêu cầu quyền Teacher
router.post('/lesson/save', isTeacher, lessonController.saveLessonAjax);

// Lấy chi tiết bài học (JSON để load vào Editor)
// Route này dùng để load dữ liệu khi bấm vào cây thư mục
router.get('/lesson/:id', isTeacher, lessonController.getLessonDetail);

router.post('/unit/bulk-status', unitController.bulkUpdateStatus);

router.post('/course/:id/update-full', courseController.updateCourseFull);

router.post('/unit/:id/delete', isTeacher, unitController.deleteUnit);

module.exports = router;