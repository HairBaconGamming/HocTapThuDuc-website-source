const mongoose = require('mongoose');
const User = require('../models/User');
const Garden = require('../models/Garden');
const LessonCompletion = require('../models/LessonCompletion');
const { UserAchievement } = require('../models/Achievement');
const LevelUtils = require('../utils/level');
const moment = require('moment-timezone');
const streakHelper = require('../utils/streakHelper');
const realmHelper = require('../utils/realmHelper');

exports.getProfile = async (req, res) => {
    try {
        const userId = req.params.id || req.user._id;

        const user = await User.findById(userId);
        const userObjectId = typeof userId === 'string' ? new mongoose.Types.ObjectId(userId) : userId;
        if (!user) return res.render('error', { message: 'Không tìm thấy đạo hữu này!' });

        // 1. Lấy thông tin Cảnh Giới
        const levelInfo = LevelUtils.getLevelInfo(user.level || 1, user.xp || 0);

        // 2. Lấy thông tin Vườn
        const garden = await Garden.findOne({ user: userId });
        const gold = garden ? garden.gold : 0;

        // 3. Đếm số bài đã học
        const completedCount = await LessonCompletion.countDocuments({ user: userId });

        // 4. Lấy danh sách hoạt động
        let activities = await LessonCompletion.find({ user: userId })
            .sort({ createdAt: -1 })
            .limit(5)
            .populate('lesson', 'title')
            .lean();

        // Map dữ liệu để khớp với EJS
        activities = activities.map(act => ({
            ...act,
            lessonId: act.lesson
        }));

        // 5. Lấy thông tin achievements
        const achievements = await UserAchievement.find({ user: userId })
            .sort({ unlockedAt: -1 })
            .limit(6)
            .lean();

        const totalAchievements = await UserAchievement.countDocuments({ user: userId });

        // Calculate achievement points from unlocked achievements
        const pointsData = await UserAchievement.aggregate([
            { $match: { user: new mongoose.Types.ObjectId(userId.toString()) } },
            { $lookup: { from: 'achievementtypes', localField: 'achievementId', foreignField: '_id', as: 'achievement' } },
            { $unwind: '$achievement' },
            { $group: { _id: null, achievementPoints: { $sum: '$achievement.points' } } }
        ]);
        const achievementPoints = pointsData[0]?.achievementPoints || 0;

        // 6. Lấy rank trên leaderboard (sắp xếp theo points)
        const userRank = await User.countDocuments({ 
            points: { $gt: user.points || 0 } 
        }).then(count => count + 1);

        // 7. Tính streak với thời gian reset tiếp theo
        const streakInfo = await streakHelper.getStreakInfo(userId);

        const realmInfo = realmHelper.getRealmData(user.level || 1);

        // 8. Render View
        res.render('profile', {
            title: `Hồ sơ ${user.username}`,
            profileUser: user,
            currentUser: req.user,
            realmInfo: realmInfo,
            isOwner: req.user && req.user._id.toString() === user._id.toString(),
            
            levelInfo: levelInfo,
            stats: {
                gold: gold,
                lessons: completedCount,
                points: user.points || 0,
                achievementPoints: achievementPoints
            },
            activities: activities,
            achievements: achievements,
            totalAchievements: totalAchievements,
            userRank: userRank,
            streak: streakInfo.streak,
            lastStudyDate: streakInfo.lastStudyDate,
            nextResetTime: streakInfo.nextResetTime,
            
            moment: moment
        });

    } catch (err) {
        console.error("Profile Error:", err);
        res.redirect('/');
    }
};