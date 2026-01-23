const express = require('express');
const router = express.Router();
const passport = require('passport');
const jwt = require('jsonwebtoken');
const moment = require('moment-timezone'); // [FIX] Thêm dòng này
const User = require('../models/User');
const UserActivityLog = require('../models/UserActivityLog'); // [FIX] Thêm dòng này
const { isLoggedIn, isPro, isTeacher } = require('../middlewares/auth');
const unitController = require('../controllers/unitController');
const lessonController = require('../controllers/lessonController');
const courseController = require('../controllers/courseController');
const authMiddleware = require('../middlewares/auth');
const gardenController = require('../controllers/gardenController');
const { achievementChecker } = require('../utils/achievementUtils');

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

        try {
             User.findByIdAndUpdate(user._id, {
                  lastLoginIP: req.ip,
                  lastloginUA: req.get('User-Agent') || 'Unknown'
             }).exec().then(async () => {
                  try {
                       await achievementChecker.checkAndUnlockAchievements(
                            user._id,
                            'custom',
                            { triggerType: 'login' }
                       );
                  } catch (e) {
                       console.error('Error checking achievements on API login:', e);
                  }
             });
        } catch(saveErr) {
             console.error(saveErr);
        }

        const payload = { 
            id: user._id, 
            username: user.username, 
            email: user.email, 
            isPro: user.isPro, 
            isAdmin: user.isAdmin 
        };
        
        const secretKey = process.env.JWT_SECRET || 'secret_key_fallback';
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

// --- 2. API Đăng ký ---
router.post('/auth/register', async (req, res) => {
    const { username, password, email } = req.body;
    
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

// --- 5. Cập nhật Avatar ---
router.post('/user/avatar', isLoggedIn, isPro, async (req, res) => {
    try {
        const { avatarUrl } = req.body;
        if (!avatarUrl || !(avatarUrl.startsWith('/') || avatarUrl.startsWith('http') || avatarUrl.startsWith('data:'))) {
            return res.status(400).json({ error: 'URL ảnh không hợp lệ.' });
        }

        let storeUrl = avatarUrl;
        try {
            if (avatarUrl.startsWith('http')) {
                const parsed = new URL(avatarUrl);
                storeUrl = parsed.pathname + parsed.search;
            }
        } catch (e) {
            console.warn('Failed to parse avatar URL for normalization:', avatarUrl, e);
        }

        await User.findByIdAndUpdate(req.user._id, { avatar: storeUrl });
        res.json({ success: true, message: 'Cập nhật avatar thành công.', newAvatarUrl: storeUrl });

    } catch (error) {
        console.error("Avatar Update Error:", error);
        res.status(500).json({ error: 'Lỗi server khi cập nhật avatar.' });
    }
});

// --- API LESSON & COURSE ---
router.post('/lesson/save', isTeacher, lessonController.saveLessonAjax);
router.get('/lesson/:id', isTeacher, lessonController.getLessonDetail);
router.post('/unit/bulk-status', unitController.bulkUpdateStatus);
router.post('/course/:id/update-full', courseController.updateCourseFull);
router.post('/unit/:id/delete', isTeacher, unitController.deleteUnit);
router.get('/lesson/:id/revisions', lessonController.getRevisions);
router.post('/lesson/restore/:revisionId', lessonController.restoreRevision);
router.post('/lesson/claim-study-reward', authMiddleware.isLoggedIn, lessonController.claimStudyReward);

router.get('/ping', (req, res) => {
    res.status(200).send('Pong! 🏓');
});

router.post('/my-garden/tutorial-step', authMiddleware.isLoggedIn, gardenController.updateTutorialStep);

// --- [NEW] HEARTBEAT TRACKING API (Tính giờ học) ---
router.post('/activity/heartbeat', isLoggedIn, async (req, res) => {
    try {
        // Lấy ngày hiện tại theo giờ VN
        const today = moment().tz("Asia/Ho_Chi_Minh").format("YYYY-MM-DD");
        
        await UserActivityLog.findOneAndUpdate(
            { user: req.user._id, dateStr: today },
            { 
                $inc: { minutes: 1 }, // Cộng thêm 1 phút mỗi lần gọi
                $set: { lastActive: new Date() }
            },
            { upsert: true, new: true, setDefaultsOnInsert: true }
        );
        res.json({ success: true });
    } catch (e) {
        console.error("Activity Track Error:", e);
        res.status(500).json({ success: false });
    }
});

module.exports = router;