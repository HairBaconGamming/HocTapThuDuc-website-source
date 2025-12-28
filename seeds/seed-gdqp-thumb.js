// seed-gdqp-thumb.js

require('dotenv').config(); // Load biến môi trường để lấy MONGO_URI
const mongoose = require('mongoose');

// --- 1. CẤU HÌNH ĐƯỜNG DẪN VÀ DỮ LIỆU ---

// Đảm bảo đường dẫn này trỏ đúng đến file Model Subject của bạn
const Subject = require('../models/Subject'); // <-- KIỂM TRA ĐƯỜNG DẪN NÀY

// Tên chính xác của môn học trong Database
const TARGET_SUBJECT_NAME = "Giáo dục quốc phòng";

// URL ảnh mới bạn muốn cập nhật
// (Có thể là link online hoặc đường dẫn tương đối /img/...)
const NEW_THUMBNAIL_URL = "https://tuyensinhso.vn/images/files/tuyensinhso.vn/giao%20duc%20quoc%20phong%20la%20mon%20chinh%20thong.jpg"; // <-- THAY LINK ẢNH CỦA BẠN VÀO ĐÂY

// Tên trường (field) trong database lưu ảnh.
// Nếu bạn dùng 'image' hay 'avatar' thì sửa lại dòng dưới.
const FIELD_NAME_TO_UPDATE = "thumbnail"; // <-- KIỂM TRA TÊN FIELD TRONG SCHEMA CỦA BẠN


// --- 2. HÀM THỰC THI SEED ---
async function seedThumbnail() {
    console.log('🚀 Bắt đầu quá trình cập nhật thumbnail...');
    const mongoURI = process.env.MONGO_URI || 'mongodb://localhost:27017/studypro';

    try {
        // Kết nối DB
        await mongoose.connect(mongoURI);
        console.log('✅ Đã kết nối MongoDB.');

        // Tìm và cập nhật
        console.log(`🔍 Đang tìm môn học: "${TARGET_SUBJECT_NAME}"...`);

        const filter = { name: TARGET_SUBJECT_NAME };
        
        // Sử dụng computed property name ([FIELD_NAME_TO_UPDATE]) để dùng biến làm tên field
        const update = { $set: { [FIELD_NAME_TO_UPDATE]: NEW_THUMBNAIL_URL } };
        
        // new: true để trả về document sau khi đã update
        const updatedSubject = await Subject.findOneAndUpdate(filter, update, { new: true });

        if (updatedSubject) {
            console.log('---------------------------------');
            console.log('🎉 CẬP NHẬT THÀNH CÔNG!');
            console.log(`📘 Môn học: ${updatedSubject.name}`);
            console.log(`🖼️ Thumbnail mới: ${updatedSubject[FIELD_NAME_TO_UPDATE]}`);
            console.log('---------------------------------');
        } else {
            console.log('---------------------------------');
            console.error(`❌ LỖI: Không tìm thấy môn học có tên "${TARGET_SUBJECT_NAME}".`);
            console.error('👉 Vui lòng kiểm tra chính xác tên môn học trong database.');
            console.log('---------------------------------');
        }

    } catch (err) {
        console.error('❌ Đã xảy ra lỗi hệ thống:', err);
    } finally {
        // Ngắt kết nối và thoát
        await mongoose.disconnect();
        console.log('👋 Đã ngắt kết nối DB.');
        process.exit(0);
    }
}

// Chạy hàm
seedThumbnail();