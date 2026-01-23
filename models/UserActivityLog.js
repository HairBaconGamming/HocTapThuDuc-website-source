const mongoose = require('mongoose');

const userActivityLogSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    dateStr: { type: String, required: true }, // Format: "YYYY-MM-DD"
    minutes: { type: Number, default: 0 },     // Tổng số phút hoạt động
    lastActive: { type: Date, default: Date.now }
});

// Index để tìm kiếm nhanh, đảm bảo mỗi user chỉ có 1 record mỗi ngày
userActivityLogSchema.index({ user: 1, dateStr: 1 }, { unique: true });

module.exports = mongoose.model('UserActivityLog', userActivityLogSchema);