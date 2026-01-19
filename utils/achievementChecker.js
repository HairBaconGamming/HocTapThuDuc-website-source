// utils/achievementChecker.js - DEPRECATED
// Sử dụng utils/achievementUtils.js thay thế

// Re-export từ achievementUtils
const { achievementChecker } = require('./achievementUtils');
module.exports = achievementChecker;

                // Thêm points cho user
                user.points = (user.points || 0) + achievement.points;
                await user.save();

                unlockedAchievements.push({
                    ...achievement.toObject(),
                    unlockedAt: newAchievement.unlockedAt
                });
            }
        }

        return unlockedAchievements;
    } catch (err) {
        console.error('Error checking achievements:', err);
        return [];
    }
}

/**
 * Evaluate điều kiện achievement
 */
function evaluateCondition(condition, data) {
    const { type, value, operator } = condition;
    const actualValue = data[type] || 0;

    switch (operator) {
        case '>=':
            return actualValue >= value;
        case '>':
            return actualValue > value;
        case '==':
            return actualValue == value;
        case '<=':
            return actualValue <= value;
        default:
            return false;
    }
}

/**
 * Trigger achievement check khi lesson hoàn thành
 */
async function onLessonCompleted(userId) {
    try {
        const completionCount = await LessonCompletion.countDocuments({ user: userId });
        return await checkAndUnlockAchievements(userId, 'lessons_completed', {
            lessons_completed: completionCount
        });
    } catch (err) {
        console.error('Error on lesson completed:', err);
        return [];
    }
}

/**
 * Trigger achievement check khi user đạt điểm
 */
async function onPointsGained(userId) {
    try {
        const user = await User.findById(userId);
        return await checkAndUnlockAchievements(userId, 'points_reached', {
            points_reached: user.points || 0
        });
    } catch (err) {
        console.error('Error on points gained:', err);
        return [];
    }
}

/**
 * Trigger achievement check hàng ngày (streak, login)
 */
async function onDailyCheck(userId) {
    try {
        const user = await User.findById(userId);
        
        // Trigger multiple condition checks
        const results = [];
        results.push(...await checkAndUnlockAchievements(userId, 'streak_days', {
            streak_days: user.streak || 0
        }));
        
        return results;
    } catch (err) {
        console.error('Error on daily check:', err);
        return [];
    }
}

/**
 * Lấy tất cả achievements của user
 */
async function getUserAchievements(userId) {
    try {
        const userAchievements = await UserAchievement.find({ user: userId })
            .sort({ unlockedAt: -1 })
            .lean();

        return userAchievements;
    } catch (err) {
        console.error('Error getting user achievements:', err);
        return [];
    }
}

/**
 * Lấy achievement progress (để hiển thị %, số bài còn lại, etc)
 */
async function getAchievementProgress(userId) {
    try {
        const user = await User.findById(userId);
        const completionCount = await LessonCompletion.countDocuments({ user: userId });

        const allAchievements = await AchievementType.find({ isActive: true });
        const unlockedIds = await UserAchievement.find({ user: userId })
            .select('achievementId')
            .lean();
        const unlockedIdSet = new Set(unlockedIds.map(a => a.achievementId));

        const progress = allAchievements.map(achievement => {
            const isUnlocked = unlockedIdSet.has(achievement.id);

            if (isUnlocked) {
                return {
                    id: achievement.id,
                    name: achievement.name,
                    icon: achievement.icon,
                    isUnlocked: true,
                    progress: 100
                };
            }

            // Hitung progress cho achievements chưa unlock
            let currentValue = 0;
            let targetValue = achievement.condition.value;

            if (achievement.condition.type === 'lessons_completed') {
                currentValue = completionCount;
            } else if (achievement.condition.type === 'points_reached') {
                currentValue = user.points || 0;
            } else if (achievement.condition.type === 'streak_days') {
                currentValue = user.streak || 0;
            }

            const progressPercent = Math.min(Math.round((currentValue / targetValue) * 100), 99);

            return {
                id: achievement.id,
                name: achievement.name,
                icon: achievement.icon,
                description: achievement.description,
                isUnlocked: false,
                currentValue,
                targetValue,
                progress: progressPercent,
                rarity: achievement.rarity
            };
        });

        return progress;
    } catch (err) {
        console.error('Error getting achievement progress:', err);
        return [];
    }
}

/**
 * Lấy unlock stats
 */
async function getAchievementStats(userId) {
    try {
        const totalAchievements = await AchievementType.countDocuments({ isActive: true });
        const unlockedAchievements = await UserAchievement.countDocuments({ user: userId });
        const achievementPointsData = await UserAchievement.aggregate([
            { $match: { user: mongoose.Types.ObjectId(userId) } },
            { $group: { _id: null, achievementPoints: { $sum: '$achievementData.points' } } }
        ]);

        return {
            total: totalAchievements,
            unlocked: unlockedAchievements,
            locked: totalAchievements - unlockedAchievements,
            completionPercent: Math.round((unlockedAchievements / totalAchievements) * 100),
            achievementPoints: achievementPointsData[0]?.achievementPoints || 0
        };
    } catch (err) {
        console.error('Error getting achievement stats:', err);
        return { total: 0, unlocked: 0, locked: 0, completionPercent: 0, achievementPoints: 0 };
    }
}

module.exports = {
    checkAndUnlockAchievements,
    onLessonCompleted,
    onPointsGained,
    onDailyCheck,
    getUserAchievements,
    getAchievementProgress,
    getAchievementStats
};
