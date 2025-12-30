const mongoose = require('mongoose');

const GardenSchema = new mongoose.Schema({
    // ... các trường user, water, gold, fertilizer giữ nguyên ...
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    water: { type: Number, default: 50 },
    gold: { type: Number, default: 100 },
    fertilizer: { type: Number, default: 5 },

    // [MỚI] Lưu ID background đang dùng
    backgroundId: { type: String, default: 'default' },

    // Danh sách vật phẩm
    items: [
        {
            _id: { type: mongoose.Schema.Types.ObjectId, auto: true },
            type: { type: String, enum: ['plant', 'decoration'] },
            itemId: { type: String, required: true }, 
            x: { type: Number, default: 50 },
            y: { type: Number, default: 50 },
            // zIndex không cần lưu DB nữa, Frontend sẽ tự tính toán dựa trên Y
            
            // Plant props
            stage: { type: Number, default: 0 },
            waterCount: { type: Number, default: 0 },
            plantedAt: { type: Date, default: Date.now },
            isFertilized: { type: Boolean, default: false }
        }
    ]
}, { timestamps: true });

module.exports = mongoose.model('Garden', GardenSchema);