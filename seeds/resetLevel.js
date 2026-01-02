const mongoose = require('mongoose');
const dotenv = require('dotenv');
const User = require('../models/User'); // Đảm bảo đường dẫn đúng tới model User

// Load biến môi trường để lấy chuỗi kết nối DB
dotenv.config();

// --- CẤU HÌNH ---
// Điền username của người bạn muốn reset vào đây
const TARGET_USERNAME = "truonghoangnam"; 

const resetUser = async () => {
    try {
        // 1. Kết nối MongoDB
        console.log("⏳ Đang kết nối Database...");
        await mongoose.connect(process.env.MONGO_URI); // Kiểm tra lại tên biến trong .env của bạn (VD: MONGO_URI hoặc DATABASE_URL)
        console.log("✅ Kết nối thành công!");

        // 2. Tìm User
        const user = await User.findOne({ username: TARGET_USERNAME });

        if (!user) {
            console.error(`❌ Không tìm thấy user có tên: "${TARGET_USERNAME}"`);
            process.exit(1);
        }

        // 3. Reset thông số
        console.log(`🔍 Tìm thấy: ${user.username} (Hiện tại: Lv.${user.level} - ${user.xp} XP)`);
        
        user.level = 1;
        user.xp = 0;
        // user.points = 0; // Bỏ comment dòng này nếu muốn xóa luôn điểm tích lũy
        
        await user.save();

        console.log(`
        =========================================
        ♻️  ĐÃ TRÙNG SINH THÀNH CÔNG!
        👤  User: ${user.username}
        📉  Cấp độ: Về Lv.1 (Luyện Khí Tầng 1)
        ✨  XP: 0
        =========================================
        `);

    } catch (error) {
        console.error("❌ Lỗi:", error);
    } finally {
        // 4. Ngắt kết nối
        await mongoose.disconnect();
        process.exit();
    }
};

resetUser();