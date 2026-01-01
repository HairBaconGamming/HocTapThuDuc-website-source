const mongoose = require('mongoose');

const ProImageSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    url: { type: String, required: true },      // Đường dẫn ảnh (VD: /uploads/pro/...)
    filename: { type: String, required: true }, // Tên file vật lý để xóa sau này
    size: { type: Number },                     // Kích thước file (bytes)
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('ProImage', ProImageSchema);