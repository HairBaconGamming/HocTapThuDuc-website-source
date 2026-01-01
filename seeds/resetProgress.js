const mongoose = require('mongoose');
const dotenv = require('dotenv');

// 1. Import Model User
const User = require('../models/User');

// 2. Import Model LessonCompletion (Nếu bạn dùng bảng riêng để lưu tiến độ học)
// Dùng try-catch để tránh lỗi nếu project của bạn không có file này
let LessonCompletion;
try {
    LessonCompletion = require('../models/LessonCompletion');
} catch (e) {
    LessonCompletion = null;
}

// 3. Import Model VisitStats (Nếu bạn dùng để lưu thống kê truy cập)
let VisitStats;
try {
    VisitStats = require('../models/VisitStats');
} catch (e) {
    VisitStats = null;
}

dotenv.config();

async function resetAllProgress() {
    try {
        // --- KẾT NỐI DB ---
        if (!process.env.MONGO_URI) {
            console.error("❌ Lỗi: Chưa cấu hình MONGO_URI trong file .env");
            process.exit(1);
        }
        await mongoose.connect(process.env.MONGO_URI);
        console.log("🔌 Đã kết nối MongoDB.");

        // --- BẮT ĐẦU RESET ---
        console.log("⏳ Đang reset dữ liệu điểm số, cây trồng...");

        // 1. Reset các trường trong bảng User theo Schema bạn cung cấp
        const userUpdateResult = await User.updateMany({}, {
            $set: {
                points: 0,              // Reset điểm thường
                growthPoints: 0,        // Reset điểm tăng trưởng

                // Nếu bạn có trường này (dù không hiện trong snippet) thì reset luôn:
                completedLessons: []    
            }
        });

        console.log(`✅ Đã reset điểm và cây cho ${userUpdateResult.modifiedCount} thành viên.`);

        // 2. Xóa lịch sử bài học (Nếu dùng bảng riêng)
        if (LessonCompletion) {
            const lessonDeleteResult = await LessonCompletion.deleteMany({});
            console.log(`✅ Đã xóa ${lessonDeleteResult.deletedCount} bản ghi lịch sử bài học (LessonCompletion).`);
        } else {
            console.log("ℹ️ Không tìm thấy model LessonCompletion (hoặc bạn lưu trực tiếp trong User), bỏ qua bước này.");
        }

        // 3. Reset thống kê truy cập (Nếu dùng VisitStats)
        if (VisitStats) {
            const visitDeleteResult = await VisitStats.deleteMany({});
            console.log(`✅ Đã xóa ${visitDeleteResult.deletedCount} bản ghi thống kê truy cập (VisitStats).`);
        } else {
            console.log("ℹ️ Không tìm thấy model VisitStats, bỏ qua bước này.");
        }

        console.log("\n🎉 HOÀN TẤT! Tất cả đã về vạch xuất phát.");
        process.exit(0);

    } catch (err) {
        console.error("❌ Có lỗi xảy ra:", err);
        process.exit(1);
    }
}

resetAllProgress();