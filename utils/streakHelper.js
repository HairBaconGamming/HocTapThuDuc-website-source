const User = require('../models/User');
const moment = require('moment-timezone');

// Hàm chuẩn hóa ngày theo giờ Việt Nam
const getVNDate = (date) => moment(date).tz("Asia/Ho_Chi_Minh").format("YYYY-MM-DD");

/**
 * Cập nhật Streak khi hoàn thành bài học
 */
exports.updateStreak = async (userId) => {
    try {
        const user = await User.findById(userId);
        if (!user) return { updated: false };

        const now = moment().tz("Asia/Ho_Chi_Minh");
        const todayStr = now.format("YYYY-MM-DD");
        
        // Lấy ngày học cuối (nếu có)
        // [FIX] Dùng đúng tên biến: lastStudyDate
        let lastDateStr = null;
        if (user.lastStudyDate) {
            lastDateStr = moment(user.lastStudyDate).tz("Asia/Ho_Chi_Minh").format("YYYY-MM-DD");
        }

        // Case 1: Đã học hôm nay -> Không làm gì
        if (lastDateStr === todayStr) {
            return { updated: false, streak: user.currentStreak };
        }

        // Case 2: Kiểm tra liên tiếp (Hôm qua)
        const yesterdayStr = now.clone().subtract(1, 'days').format("YYYY-MM-DD");

        if (lastDateStr === yesterdayStr) {
            // Liên tiếp -> Tăng streak
            user.currentStreak = (user.currentStreak || 0) + 1;
        } else {
            // Đứt quãng hoặc mới tinh -> Reset về 1
            user.currentStreak = 1;
        }

        // Lưu ngày học mới
        user.lastStudyDate = new Date();
        await user.save();

        console.log(`🔥 Streak Updated: User ${user.username} | Streak: ${user.currentStreak}`);
        return { updated: true, streak: user.currentStreak };

    } catch (err) {
        console.error("Streak Helper Error:", err);
        return { updated: false };
    }
};

/**
 * [MỚI] Hàm lấy thông tin Streak cho Profile (Fix lỗi profileController)
 */
exports.getStreakInfo = async (userId) => {
    try {
        const user = await User.findById(userId);
        if (!user) return { streak: 0, lastStudyDate: null, nextResetTime: null };

        // Logic tính thời gian reset (Ví dụ: Hết ngày hôm nay hoặc 24h sau)
        // Ở đây ta tính: Cuối ngày hôm nay theo giờ VN
        const now = moment().tz("Asia/Ho_Chi_Minh");
        const nextReset = now.clone().endOf('day').toDate(); // 23:59:59 hôm nay

        return {
            streak: user.currentStreak || 0,
            lastStudyDate: user.lastStudyDate,
            nextResetTime: nextReset // Trả về Date object để EJS hiển thị
        };
    } catch (err) {
        console.error("Get Streak Info Error:", err);
        return { streak: 0, lastStudyDate: null, nextResetTime: null };
    }
};

/**
 * Hàm Reset Streak (nếu cần gọi thủ công)
 */
exports.resetStreak = async (userId) => {
    try {
        await User.findByIdAndUpdate(userId, { currentStreak: 0 });
    } catch (err) {
        console.error(err);
    }
};