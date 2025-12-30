const mongoose = require('mongoose');
const dotenv = require('dotenv');
const User = require('../models/User');

dotenv.config();

async function cleanupOldData() {
    try {
        if (!process.env.MONGO_URI) throw new Error("❌ Thiếu MONGO_URI");
        await mongoose.connect(process.env.MONGO_URI);
        console.log("🔌 Đã kết nối MongoDB.");

        console.log("🧹 Đang dọn dẹp tàn dư hệ thống trồng cây cũ...");

        // Sử dụng $unset để xóa hoàn toàn các trường này khỏi document
        const result = await User.updateMany({}, {
            $unset: {
                treeLevel: "",          // Xóa cấp độ cây cũ
                growthPoints: "",       // Xóa điểm tăng trưởng cũ
                treeCurrentPoints: "",  // Xóa điểm hiện tại cũ
                lastGrowthActivity: ""  // Xóa log hoạt động cũ
            }
        });

        console.log(`✅ Đã dọn sạch dữ liệu cũ cho ${result.modifiedCount} người dùng.`);
        console.log("🌱 Từ giờ hệ thống chỉ sử dụng 'Garden' model.");

        process.exit(0);
    } catch (err) {
        console.error("❌ Lỗi dọn dẹp:", err);
        process.exit(1);
    }
}

cleanupOldData();