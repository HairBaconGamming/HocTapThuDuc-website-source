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

        // Get achievement points earned from unlocked achievements only
        const pointsData = await UserAchievement.aggregate([
            { $match: { user: new mongoose.Types.ObjectId(userId) } },
            { $lookup: { from: 'achievementtypes', localField: 'achievementId', foreignField: '_id', as: 'achievement' } },
            { $unwind: '$achievement' },
            { $group: { _id: null, achievementPoints: { $sum: '$achievement.points' } } }
        ]);

        const achievementPoints = pointsData[0]?.achievementPoints || 0;

        res.json({
            success: true,
            stats: {
                total: totalAchievements,
                unlocked: unlockedCount,
                locked: lockedCount,
                completion: totalAchievements > 0 ? Math.round((unlockedCount / totalAchievements) * 100) : 0,
                achievementPoints: achievementPoints
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

        // Get progress for locked achievements
        const progress = await achievementChecker.getAchievementProgress(userId);

        const enriched = achievements.map(a => ({
            _id: a._id,
            name: a.name,
            description: a.description,
            icon: a.icon,
            points: a.points,
            rarity: a.rarity,
            category: a.category,
            condition: a.condition,
            unlocked: unlockedIds.has(a._id.toString()),
            progress: unlockedIds.has(a._id.toString()) ? 100 : (progress[a._id.toString()] || 0)
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
        
        // Lấy progress từ achievementChecker
        const progress = await achievementChecker.getAchievementProgress(userId);
        
        // Lấy all locked achievements
        const lockedAchievementIds = (await UserAchievement.find({ user: userId }).select('achievementId').lean())
            .map(a => a.achievementId.toString());
        
        const lockedAchievements = await AchievementType.find({
            isActive: true,
            _id: { $nin: lockedAchievementIds }
        }).lean();

        const enriched = lockedAchievements.map(a => ({
            _id: a._id,
            name: a.name,
            description: a.description,
            icon: a.icon,
            points: a.points,
            rarity: a.rarity,
            category: a.category,
            condition: a.condition,
            progress: progress[a._id.toString()] || 0
        }));

        res.json({ success: true, progress: enriched });
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

// Get all achievements with progress and unlock status
exports.getAchievementsWithProgress = async (req, res) => {
    try {
        const userId = req.user._id;

        // Get unlocked achievement IDs
        const unlockedAchievements = await UserAchievement.find({ user: userId })
            .select('achievementId')
            .lean();
        const unlockedIds = new Set(
            unlockedAchievements.map(a => a.achievementId.toString())
        );

        // Get all active achievements
        const allAchievements = await AchievementType.find({ isActive: true }).lean();

        // Get progress for each achievement
        const progress = await achievementChecker.getAchievementProgress(userId);

        // Build response with all data
        const achievements = allAchievements.map(a => {
            const isUnlocked = unlockedIds.has(a._id.toString());
            return {
                _id: a._id,
                id: a.id,
                name: a.name,
                description: a.description,
                icon: a.icon,
                color: a.color,
                points: a.points,
                rarity: a.rarity,
                category: a.category,
                condition: a.condition,
                unlockMessage: a.unlockMessage,
                isHidden: a.isHidden,
                unlocked: isUnlocked,
                progress: isUnlocked ? 100 : (progress[a._id.toString()] || 0),
                unlockedAt: unlockedAchievements.find(ua => ua.achievementId.toString() === a._id.toString())?.unlockedAt || null
            };
        });

        // Sort: unlocked first, then by progress
        achievements.sort((a, b) => {
            if (a.unlocked !== b.unlocked) return b.unlocked ? 1 : -1;
            return b.progress - a.progress;
        });

        res.json({ success: true, achievements });
    } catch (err) {
        console.error('Get achievements with progress error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
};

