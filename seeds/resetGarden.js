const mongoose = require('mongoose');
const dotenv = require('dotenv');
const User = require('../models/User');
const Garden = require('../models/Garden');

// Load biến môi trường
dotenv.config();

const resetGarden = async () => {
    try {
        // 1. Kết nối MongoDB
        if (!process.env.MONGO_URI) {
            throw new Error("❌ Không tìm thấy MONGO_URI trong file .env");
        }
        await mongoose.connect(process.env.MONGO_URI);
        console.log("🔌 Đã kết nối MongoDB.");

        // 2. Xóa sạch dữ liệu Garden cũ
        console.log("🗑️ Đang xóa toàn bộ dữ liệu vườn cũ...");
        await Garden.deleteMany({});
        console.log("✅ Đã xóa sạch bảng Garden.");

        // 3. Lấy danh sách User để tạo vườn mới
        const users = await User.find({});
        console.log(`👥 Tìm thấy ${users.length} người dùng. Đang cấp lại đất...`);

        let count = 0;
        for (const user of users) {
            // Tạo vườn mặc định cho từng user
            await new Garden({
                user: user._id,
                water: 50,         // Tặng 50 nước
                gold: 200,         // Tặng 200 vàng khởi nghiệp
                fertilizer: 5,     // Tặng 5 phân bón
                backgroundId: 'default',
                items: []          // Vườn trống để user tự kéo thả
            }).save();
            count++;
        }

        console.log(`🌱 Đã cấp vườn mới thành công cho ${count} người dùng!`);
        console.log("✨ Hoàn tất. Hệ thống Garden đã sẵn sàng.");

        process.exit(0);
    } catch (err) {
        console.error("❌ Lỗi Reset:", err);
        process.exit(1);
    }
};

resetGarden();