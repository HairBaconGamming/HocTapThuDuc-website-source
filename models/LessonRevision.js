// models/LessonRevision.js
const mongoose = require('mongoose');

const lessonRevisionSchema = new mongoose.Schema({
    lessonId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Lesson',
        required: true,
        index: true // Tạo index để query cho nhanh
    },
    title: String,
    content: String, // Lưu JSON string của các blocks
    updatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('LessonRevision', lessonRevisionSchema);