const express = require('express');
const rateLimit = require('express-rate-limit');
const { isLoggedIn } = require('../middlewares/auth');
const lessonRewardController = require('../controllers/lessonRewardController');

const router = express.Router();

const revealLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 24,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: 'Bạn đang bật checkpoint hơi nhanh. Thử lại sau ít phút.' }
});

const claimLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: 'Bạn đang nhận quà quá nhanh. Thử lại sau ít phút.' }
});

router.get('/lesson/:lessonId', isLoggedIn, lessonRewardController.listPendingRewards);
router.post('/lesson/:lessonId/reveal', isLoggedIn, revealLimiter, lessonRewardController.revealReward);
router.post('/:rewardId/claim', isLoggedIn, claimLimiter, lessonRewardController.claimReward);

module.exports = router;
