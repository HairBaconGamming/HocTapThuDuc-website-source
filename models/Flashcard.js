const mongoose = require('mongoose');

const FlashcardSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    lesson: { type: mongoose.Schema.Types.ObjectId, ref: 'Lesson', required: true },
    
    front: { type: String, required: true }, // Câu hỏi / Từ vựng
    back: { type: String, required: true },  // Đáp án / Nghĩa
    
    // --- SRS DATA (SuperMemo-2 Algorithm) ---
    interval: { type: Number, default: 0 }, // Số ngày chờ đến lần ôn tiếp theo
    repetition: { type: Number, default: 0 }, // Số lần đã nhớ liên tiếp
    efactor: { type: Number, default: 2.5 }, // Easiness Factor (Độ dễ), mặc định 2.5
    
    nextReviewDate: { type: Date, default: Date.now }, // Ngày cần ôn tập

}, { timestamps: true });

module.exports = mongoose.model('Flashcard', FlashcardSchema);