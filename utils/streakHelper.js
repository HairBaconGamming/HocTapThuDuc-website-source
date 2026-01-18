// utils/streakHelper.js
// Helper functions để quản lý chuỗi học (streak)

const User = require('../models/User');

/**
 * Update streak khi user hoàn thành bài học
 * @param {ObjectId} userId - ID của user
 * @returns {Object} - { streak: number, isNewDay: boolean }
 */
async function updateStreak(userId) {
    try {
        const user = await User.findById(userId);
        if (!user) return { streak: 0, isNewDay: false };

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const lastStudyDate = user.lastStudyDate ? new Date(user.lastStudyDate) : null;
        lastStudyDate?.setHours(0, 0, 0, 0);

        let newStreak = user.currentStreak || 0;
        let isNewDay = false;

        if (!lastStudyDate) {
            // Lần đầu tiên học
            newStreak = 1;
            isNewDay = true;
        } else if (lastStudyDate.getTime() === today.getTime()) {
            // Cùng ngày, không tăng streak
            isNewDay = false;
        } else if (lastStudyDate.getTime() === today.getTime() - 24 * 60 * 60 * 1000) {
            // Hôm qua, tăng streak
            newStreak += 1;
            isNewDay = true;
        } else {
            // Quá 1 ngày không học, reset streak
            newStreak = 1;
            isNewDay = true;
        }

        // Update user
        user.currentStreak = newStreak;
        user.lastStudyDate = new Date();
        await user.save();

        return { streak: newStreak, isNewDay };
    } catch (err) {
        console.error('Error updating streak:', err);
        return { streak: 0, isNewDay: false };
    }
}

/**
 * Reset streak (khi user không học trong 1 ngày)
 * @param {ObjectId} userId - ID của user
 */
async function resetStreak(userId) {
    try {
        const user = await User.findById(userId);
        if (!user) return;

        user.currentStreak = 0;
        await user.save();
    } catch (err) {
        console.error('Error resetting streak:', err);
    }
}

/**
 * Get streak info
 * @param {ObjectId} userId - ID của user
 * @returns {Object} - { streak: number, lastStudyDate: Date }
 */
async function getStreakInfo(userId) {
    try {
        const user = await User.findById(userId);
        if (!user) return { streak: 0, lastStudyDate: null };

        return {
            streak: user.currentStreak || 0,
            lastStudyDate: user.lastStudyDate
        };
    } catch (err) {
        console.error('Error getting streak info:', err);
        return { streak: 0, lastStudyDate: null };
    }
}

module.exports = {
    updateStreak,
    resetStreak,
    getStreakInfo
};
