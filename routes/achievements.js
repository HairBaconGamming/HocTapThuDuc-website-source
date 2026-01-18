// routes/achievements.js
const express = require('express');
const router = express.Router();
const achievementController = require('../controllers/achievementController');
const { isLoggedIn } = require('../middlewares/auth');

// Get user's unlocked achievements
router.get('/my-achievements', isLoggedIn, achievementController.getUserAchievements);

// Get achievement stats
router.get('/stats', isLoggedIn, achievementController.getAchievementStats);

// Get all achievements (with filter)
router.get('/all', isLoggedIn, achievementController.getAllAchievements);

// Get achievement progress for locked achievements
router.get('/progress', isLoggedIn, achievementController.getProgress);

// Check and unlock achievements (usually triggered by system)
router.post('/check', isLoggedIn, achievementController.checkAchievements);

module.exports = router;
