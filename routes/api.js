const express = require('express');
const router = express.Router();
const passport = require('passport');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const moment = require('moment-timezone'); // [FIX] Thêm dòng này
const User = require('../models/User');
const UserActivityLog = require('../models/UserActivityLog'); // [FIX] Thêm dòng này
const { isLoggedIn, isPro, isTeacher } = require('../middlewares/auth');
const unitController = require('../controllers/unitController');
const lessonController = require('../controllers/lessonController');
const lessonTtsController = require('../controllers/lessonTtsController');
const courseController = require('../controllers/courseController');
const authMiddleware = require('../middlewares/auth');
const gardenController = require('../controllers/gardenController');
const { achievementChecker } = require('../utils/achievementUtils');
const { getJwtSecret } = require('../utils/secrets');
const LessonProgress = require('../models/LessonProgress');

const JWT_SECRET = getJwtSecret();
const lessonTtsManifestLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 8,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        success: false,
        error: 'Bạn thao tác nghe bài quá nhanh. Vui lòng thử lại sau ít phút.'
    }
});

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
                  lastLoginUA: req.get('User-Agent') || 'Unknown'
             }).exec().then(async () => {
                  try {
                       await achievementChecker.onUserLogin(user._id);
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
            isAdmin: user.isAdmin,
            isTeacher: user.isTeacher
        };
        
        const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '1d' });

        return res.json({ 
            success: true, 
            message: 'Đăng nhập thành công!', 
            token: token, 
            user: { 
                id: user._id, 
                username: user.username, 
                email: user.email, 
                isPro: user.isPro, 
                isAdmin: user.isAdmin,
                isTeacher: user.isTeacher
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
            isPro: req.user.isPro,
            isAdmin: req.user.isAdmin,
            isTeacher: req.user.isTeacher
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
router.get('/lesson/:id/tts', authMiddleware.isLoggedIn, lessonTtsManifestLimiter, lessonTtsController.getLessonTtsManifest);
router.get('/lesson/tts/audio/:segmentId', authMiddleware.isLoggedIn, lessonTtsController.streamLessonTtsAudio);
router.post('/lesson/save', isTeacher, lessonController.saveLessonAjax);
router.get('/lesson/:id', isTeacher, lessonController.getLessonDetail);
router.post('/unit/bulk-status', isTeacher, courseController.bulkUpdateUnitStatus);
router.post('/course/:id/update-full', isTeacher, courseController.updateCourseFull);
router.post('/course/:id/like', authMiddleware.isLoggedIn, courseController.toggleCourseLike);
router.post('/unit/:id/delete', isTeacher, unitController.deleteUnit);
router.get('/lesson/:id/revisions', isTeacher, lessonController.getRevisions);
router.post('/lesson/restore/:revisionId', isTeacher, lessonController.restoreRevision);
router.post('/lesson/claim-study-reward', authMiddleware.isLoggedIn, lessonController.claimStudyReward);

router.post('/lesson/:id/progress', isLoggedIn, async (req, res) => {
    try {
        const { answersData } = req.body;

        await LessonProgress.findOneAndUpdate(
            { user: req.user._id, lesson: req.params.id },
            { $set: { answersData: answersData && typeof answersData === 'object' ? answersData : {} } },
            { upsert: true, new: true, setDefaultsOnInsert: true }
        );

        res.json({ success: true });
    } catch (error) {
        console.error('Lesson progress save error:', error);
        res.status(500).json({ success: false });
    }
});

router.get('/lesson/:id/progress', isLoggedIn, async (req, res) => {
    try {
        const progress = await LessonProgress.findOne({
            user: req.user._id,
            lesson: req.params.id
        }).lean();

        res.json({
            success: true,
            answersData: progress && progress.answersData && typeof progress.answersData === 'object'
                ? progress.answersData
                : {}
        });
    } catch (error) {
        console.error('Lesson progress load error:', error);
        res.status(500).json({ success: false });
    }
});

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
