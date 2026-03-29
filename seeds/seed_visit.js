const mongoose = require('mongoose');
const dotenv = require('dotenv');

// Load biến môi trường
dotenv.config();

// Import Model VisitStats
const VisitStats = require('../models/VisitStats');

async function seedVisitStats() {
    try {
        // 1. Kết nối DB
        if (!process.env.MONGO_URI) {
            console.error("❌ Lỗi: Chưa cấu hình MONGO_URI trong file .env");
            process.exit(1);
        }
        const mongoUri = process.env.MONGO_URI.replace(/^"(.*)"$/, '$1');
        await mongoose.connect(mongoUri);
        console.log("🔌 Đã kết nối MongoDB.");

        // 2. Thiết lập ngày hôm nay
        const today = new Date();
        today.setHours(0, 0, 0, 0); // Reset giờ về 00:00:00

        // 3. Cập nhật hoặc tạo mới bản ghi với count = 4739 cho totalVisits
        const result = await VisitStats.findOneAndUpdate(
            { dateStr: "totalVisits" },
            { $set: { count: 4739, dateStr: "totalVisits" } },
            { upsert: true, new: true }
        );

        console.log(`✅ Đã thiết lập tổng số lượt truy cập là 4739.`);
        console.log("🎉 SEEDING COMPLETED SUCCESSFULLY!");
        process.exit(0);

    } catch (err) {
        console.error("❌ Có lỗi xảy ra:", err);
        process.exit(1);
    }
}

seedVisitStats();
