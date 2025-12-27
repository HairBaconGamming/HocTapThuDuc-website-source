const mongoose = require('mongoose');
require('dotenv').config(); // Load biến môi trường từ file .env

// Import các Models
const Subject = require('../models/Subject');
const Course = require('../models/Course');
const Unit = require('../models/Unit');
const Lesson = require('../models/Lesson');

const clearDatabase = async () => {
    try {
        console.log('⏳ Đang kết nối tới MongoDB...');
        await mongoose.connect(process.env.MONGO_URI);
        console.log('🔌 Kết nối thành công!');

        console.log('====================================');
        console.log('🗑️  ĐANG XÓA TOÀN BỘ DỮ LIỆU HỌC TẬP...');
        console.log('====================================');

        // 1. Xóa Bài học (Cấp thấp nhất)
        const deletedLessons = await Lesson.deleteMany({});
        console.log(`✅ Đã xóa ${deletedLessons.deletedCount} bài học (Lessons).`);

        // 2. Xóa Chương
        const deletedUnits = await Unit.deleteMany({});
        console.log(`✅ Đã xóa ${deletedUnits.deletedCount} chương (Units).`);

        // 3. Xóa Khóa học
        const deletedCourses = await Course.deleteMany({});
        console.log(`✅ Đã xóa ${deletedCourses.deletedCount} khóa học (Courses).`);

        // 4. Xóa Môn học (Cấp cao nhất)
        const deletedSubjects = await Subject.deleteMany({});
        console.log(`✅ Đã xóa ${deletedSubjects.deletedCount} môn học (Subjects).`);

        console.log('====================================');
        console.log('✨ DATABASE ĐÃ ĐƯỢC DỌN SẠCH SẼ! ✨');
        console.log('====================================');

    } catch (err) {
        console.error('❌ Lỗi khi dọn dẹp database:', err);
    } finally {
        await mongoose.disconnect();
        console.log('👋 Đã ngắt kết nối.');
        process.exit();
    }
};

// Chạy hàm
clearDatabase();