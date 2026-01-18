// seeds/fixVisitStats.js
require('dotenv').config();
const mongoose = require('mongoose');
const VisitStats = require('../models/VisitStats');

const cleanupVisitStats = async () => {
    try {
        console.log('🔄 Kết nối MongoDB...');
        console.log('MONGO_URI:', process.env.MONGO_URI || 'mongodb://localhost:27017/studypro');
        await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/studypro');
        
        console.log('🗑️  Xóa tất cả indexes trên collection VisitStats...');
        try {
            await VisitStats.collection.dropIndexes();
            console.log('✅ Đã xóa tất cả indexes');
        } catch (e) {
            console.log('ℹ️  Không có indexes để xóa');
        }
        
        console.log('🗑️  Xóa collection VisitStats cũ...');
        try {
            await VisitStats.collection.drop();
            console.log('✅ Đã xóa collection VisitStats');
        } catch (e) {
            console.log('ℹ️  Collection không tồn tại hoặc đã xóa');
        }
        
        console.log('🔄 Tạo collection mới với schema và indexes...');
        const doc = new VisitStats({ dateStr: '2026-01-19', count: 0 });
        await doc.save();
        console.log('✅ Tạo document test thành công');
        
        // Xóa document test
        await VisitStats.deleteOne({ dateStr: '2026-01-19' });
        
        console.log('✨ Fix hoàn thành! Collection VisitStats sạch sẽ.');
        process.exit(0);
    } catch (err) {
        console.error('❌ Lỗi:', err.message);
        process.exit(1);
    }
};

cleanupVisitStats();
