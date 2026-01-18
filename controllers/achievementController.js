// controllers/achievementController.js
const mongoose = require('mongoose');
const { AchievementType, UserAchievement } = require('../models/Achievement');
const { achievementChecker } = require('../utils/achievementUtils');

// Get all user achievements
exports.getUserAchievements = async (req, res) => {
    try {
        const userId = req.user._id;

        // Get all user unlocked achievements with achievement details
        const achievements = await UserAchievement.find({ user: userId })
            .populate('achievementId')
            .sort({ unlockedAt: -1 })
            .lean();

        res.json({
            success: true,
            achievements: achievements.map(a => ({
                _id: a._id,
                achievement: a.achievementId,
                unlockedAt: a.unlockedAt,
                icon: a.achievementId.icon,
                name: a.achievementId.name,
                description: a.achievementId.description,
                points: a.achievementId.points,
                rarity: a.achievementId.rarity,
                category: a.achievementId.category
            }))
        });
    } catch (err) {
        console.error('Get user achievements error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
};

// Get achievement stats
exports.getAchievementStats = async (req, res) => {
    try {
        const userId = req.user._id;

        const totalAchievements = await AchievementType.countDocuments({ isActive: true });
        const unlockedCount = await UserAchievement.countDocuments({ user: userId });
        const lockedCount = totalAchievements - unlockedCount;

        // Get total points earned
        const pointsData = await UserAchievement.aggregate([
            { $match: { user: new mongoose.Types.ObjectId(userId) } },
            { $lookup: { from: 'achievementtypes', localField: 'achievementId', foreignField: '_id', as: 'achievement' } },
            { $unwind: '$achievement' },
            { $group: { _id: null, totalPoints: { $sum: '$achievement.points' } } }
        ]);

        const totalPoints = pointsData[0]?.totalPoints || 0;

        res.json({
            success: true,
            stats: {
                total: totalAchievements,
                unlocked: unlockedCount,
                locked: lockedCount,
                completion: totalAchievements > 0 ? Math.round((unlockedCount / totalAchievements) * 100) : 0,
                points: totalPoints
            }
        });
    } catch (err) {
        console.error('Get achievement stats error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
};

// Get all achievements (for gallery/admin)
exports.getAllAchievements = async (req, res) => {
    try {
        const userId = req.user._id;
        const { category, rarity } = req.query;

        let query = { isActive: true };
        if (category) query.category = category;
        if (rarity) query.rarity = rarity;

        const achievements = await AchievementType.find(query).sort({ rarity: -1 }).lean();

        // Get user unlocked achievements
        const unlockedIds = new Set(
            (await UserAchievement.find({ user: userId }).select('achievementId').lean())
                .map(a => a.achievementId.toString())
        );

        const enriched = achievements.map(a => ({
            ...a,
            unlocked: unlockedIds.has(a._id.toString()),
            unlockedAt: null
        }));

        res.json({ success: true, achievements: enriched });
    } catch (err) {
        console.error('Get all achievements error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
};

// Get achievements progress
exports.getProgress = async (req, res) => {
    try {
        const userId = req.user._id;
        const lockedAchievements = await AchievementType.find({
            isActive: true,
            _id: { $nin: (await UserAchievement.find({ user: userId }).select('achievementId').lean()).map(a => a.achievementId) }
        }).lean();

        // Get user stats for progress calculation
        const User = require('../models/User');
        const user = await User.findById(userId);

        const progress = lockedAchievements.map(a => {
            let percent = 0;

            if (a.condition.type === 'lessons_completed') {
                percent = Math.min((user.lessonsCompleted || 0) / a.condition.value * 100, 99);
            } else if (a.condition.type === 'points_reached') {
                percent = Math.min((user.totalPoints || 0) / a.condition.value * 100, 99);
            } else if (a.condition.type === 'streak_days') {
                percent = Math.min((user.currentStreak || 0) / a.condition.value * 100, 99);
            }

            return {
                ...a,
                progress: Math.round(percent)
            };
        });

        res.json({ success: true, progress });
    } catch (err) {
        console.error('Get progress error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
};

// Check and unlock achievements (usually called by system)
exports.checkAchievements = async (req, res) => {
    try {
        const userId = req.user._id;
        const { triggerType, data } = req.body;

        const newlyUnlocked = await achievementChecker.checkAndUnlockAchievements(
            userId,
            triggerType,
            data
        );

        res.json({
            success: true,
            newlyUnlocked: newlyUnlocked.map(a => ({
                icon: a.icon,
                name: a.name,
                description: a.description,
                points: a.points,
                rarity: a.rarity
            }))
        });
    } catch (err) {
        console.error('Check achievements error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
};

