const mongoose = require('mongoose');

const GardenSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    gold: { type: Number, default: 100 },
    tutorialStep: { type: Number, default: 0 },
    water: { type: Number, default: 1 },
    
    // [MỚI] Lưu vị trí Camera
    camera: {
        x: { type: Number, default: 2048 }, // Giữa map (64*64/2)
        y: { type: Number, default: 2048 },
        zoom: { type: Number, default: 1 }
    },

    items: [
        {
            type: { type: String, enum: ['plant', 'decoration', 'plot'], required: true },
            itemId: { type: String, required: true },
            x: { type: Number, default: 0 },
            y: { type: Number, default: 0 },
            
            stage: { type: Number, default: 0 },
            lastWatered: { type: Date, default: null }, 
            growthProgress: { type: Number, default: 0 },
            
            // [MỚI] Cơ chế héo hon
            witherProgress: { type: Number, default: 0 }, // Thời gian đã bị khát nước (ms)
            isDead: { type: Boolean, default: false },    // Cây đã chết chưa?
            
            lastUpdated: { type: Date, default: Date.now },
            plantedAt: { type: Date, default: Date.now }
        }
    ]
}, { timestamps: true });

module.exports = mongoose.model('Garden', GardenSchema);