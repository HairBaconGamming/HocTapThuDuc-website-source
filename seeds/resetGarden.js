// scripts/resetGarden.js
require('dotenv').config(); // Load biến môi trường (.env)
const mongoose = require('mongoose');

// --- IMPORT MODELS ---
const User = require('../models/User'); 
const Garden = require('../models/Garden'); 

// --- CẤU HÌNH MẶC ĐỊNH (Tân thủ) ---
const DEFAULT_GARDEN_STATE = {
    gold: 100,          // Vàng khởi đầu
    water: 1,           // Nước khởi đầu
    items: [],          // Xóa sạch cây cối/đất
    
    // [QUAN TRỌNG] Reset tiến độ Tutorial về 0 để hệ thống nhận diện là Newbie
    tutorialStep: 0,    

    // [MỚI] Reset Camera về giữa map (64 * 64 / 2 = 2048)
    camera: {
        x: 2048,
        y: 2048,
        zoom: 1
    }
};

// --- HÀM KẾT NỐI & RESET ---
async function resetUserGarden(targetUsername) {
    try {
        console.log('🔌 Đang kết nối Database...');
        await mongoose.connect(process.env.MONGO_URI); 
        console.log('✅ Kết nối thành công!');

        // 1. Tìm User ID từ Username
        const user = await User.findOne({ username: targetUsername });
        if (!user) {
            console.error(`❌ Không tìm thấy user: "${targetUsername}"`);
            process.exit(1);
        }
        console.log(`👤 Đã tìm thấy User: ${user.username} (ID: ${user._id})`);

        // 2. Reset Garden
        const result = await Garden.findOneAndUpdate(
            { user: user._id }, 
            { $set: DEFAULT_GARDEN_STATE },
            { new: true } // Trả về dữ liệu mới sau khi update
        );

        // 3. (Tùy chọn) Reset Level của User nếu cần
        // Nếu Level lưu bên User Model thì uncomment đoạn dưới:
        /*
        await User.findByIdAndUpdate(user._id, {
            $set: {
                level: 1,
                xp: 0
            }
        });
        console.log('⬇️  Đã reset Level & XP của User về 1.');
        */

        if (result) {
            console.log('------------------------------------------------');
            console.log(`🎉 RESET VƯỜN THÀNH CÔNG CHO: ${targetUsername}`);
            console.log(`💰 Vàng: ${result.gold}`);
            console.log(`📚 Tutorial Step: ${result.tutorialStep}`);
            console.log(`📷 Camera: [${result.camera.x}, ${result.camera.y}]`);
            console.log(`🌱 Items: ${result.items.length} (Đã dọn sạch)`);
            console.log('------------------------------------------------');
        } else {
            console.log('⚠️ User này chưa tạo vườn (Garden document not found).');
        }

    } catch (err) {
        console.error('🔥 Lỗi:', err);
    } finally {
        await mongoose.disconnect();
        console.log('👋 Đã ngắt kết nối.');
        process.exit();
    }
}

// --- LẤY USERNAME TỪ DÒNG LỆNH ---
const args = process.argv.slice(2);
if (args.length === 0) {
    console.error('⚠️ Vui lòng nhập username! Ví dụ: node scripts/resetGarden.js admin');
    process.exit(1);
}

const username = args[0];
resetUserGarden(username);