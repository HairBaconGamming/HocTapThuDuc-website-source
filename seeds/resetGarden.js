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
        
        // Tính toán tâm bản đồ (64x64 ô, mỗi ô 64px)
        const GRID_SIZE = 64;
        const MAP_SIZE = 64;
        const CENTER_X = (MAP_SIZE * GRID_SIZE) / 2; // 2048
        const CENTER_Y = (MAP_SIZE * GRID_SIZE) / 2; // 2048

        for (const user of users) {
            // Tạo vườn mặc định cho từng user
            await new Garden({
                user: user._id,
                gold: 100,         // Tặng 500 vàng để người chơi thoải mái test tính năng mua bán
                water: 1,         // Tặng 50 nước
                fertilizer: 0,     // Tặng 5 phân bón
                backgroundId: 'default',
                
                // [MỚI] Reset tiến độ hướng dẫn về 0 (Bắt đầu lại tutorial)
                tutorialStep: 0,   
                
                // [MỚI] Đặt camera vào giữa map ngay từ đầu để không bị lạc
                camera: { 
                    x: CENTER_X, 
                    y: CENTER_Y, 
                    zoom: 1 
                },

                items: []          // Vườn trống để user tự kéo thả
            }).save();
            count++;
        }

        console.log(`🌱 Đã cấp vườn mới (Full Options) thành công cho ${count} người dùng!`);
        console.log("✨ Hoàn tất. Hệ thống Garden đã sẵn sàng.");

        process.exit(0);
    } catch (err) {
        console.error("❌ Lỗi Reset:", err);
        process.exit(1);
    }
};

resetGarden();