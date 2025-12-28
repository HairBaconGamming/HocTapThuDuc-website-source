// fix-avatars.js
require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User'); // Đảm bảo đường dẫn đúng tới model User

// Lấy URI từ .env hoặc dùng fallback localhost
const uri = process.env.MONGO_URI || 'mongodb://localhost:27017/studypro';

async function fixAllUserAvatars() {
    console.log('🚀 Bắt đầu quét và sửa lỗi Avatar...');

    try {
        // 1. Kết nối DB
        await mongoose.connect(uri.replace(/^"(.*)"$/, '$1'));
        console.log('✅ Đã kết nối MongoDB.');

        // 2. Lấy toàn bộ user
        const users = await User.find({});
        console.log(`📊 Tìm thấy tổng cộng: ${users.length} users.`);

        let updatedCount = 0;
        let errorCount = 0;

        // 3. Duyệt từng user để xử lý
        for (const user of users) {
            let originalAvatar = user.avatar;
            let newAvatar = originalAvatar;
            let isChanged = false;

            // CASE A: Avatar rỗng hoặc null -> Set mặc định
            if (!newAvatar || newAvatar.trim() === '') {
                newAvatar = '/img/default-avatar.png';
                isChanged = true;
            } 
            // CASE B: Avatar chứa localhost hoặc domain full -> Cắt lấy đường dẫn tương đối
            else if (newAvatar.includes('/api/pro-images/')) {
                // Logic: Tìm vị trí của "/api/" và cắt từ đó trở đi
                // VD: http://localhost:3000/api/pro-images/abc.png -> /api/pro-images/abc.png
                const relativePath = '/api/pro-images/' + newAvatar.split('/api/pro-images/')[1];
                
                if (newAvatar !== relativePath) {
                    newAvatar = relativePath;
                    isChanged = true;
                }
            }
            // CASE C: Avatar là link ngoài (google, facebook) -> Giữ nguyên (trừ khi lỗi http)
            else if (newAvatar.startsWith('http://')) {
                // Nếu muốn ép về https (nếu link hỗ trợ)
                // newAvatar = newAvatar.replace('http://', 'https://');
                // isChanged = true;
            }

            // 4. Lưu lại nếu có thay đổi
            if (isChanged) {
                try {
                    // Update trực tiếp để tránh validate hook không cần thiết
                    await User.updateOne({ _id: user._id }, { $set: { avatar: newAvatar } });
                    console.log(`   Running fix for [${user.username}]: ${originalAvatar} -> ${newAvatar}`);
                    updatedCount++;
                } catch (e) {
                    console.error(`   ❌ Lỗi khi save user ${user.username}:`, e.message);
                    errorCount++;
                }
            }
        }

        console.log('------------------------------------------------');
        console.log(`✅ Hoàn tất!`);
        console.log(`📝 Đã cập nhật: ${updatedCount} users`);
        console.log(`⚠️ Lỗi: ${errorCount} users`);
        console.log(`✨ Các user còn lại avatar đã chuẩn.`);

    } catch (err) {
        console.error('❌ Lỗi kết nối hoặc xử lý:', err);
    } finally {
        await mongoose.disconnect();
        console.log('👋 Đã ngắt kết nối DB.');
        process.exit();
    }
}

// Chạy hàm
fixAllUserAvatars();