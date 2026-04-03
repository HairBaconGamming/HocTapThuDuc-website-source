const mongoose = require('mongoose');

const GardenSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    gold: { type: Number, default: 100 },
    tutorialStep: { type: Number, default: 0 },
    water: { type: Number, default: 1 },
    fertilizer: { type: Number, default: 0 },

    camera: {
        x: { type: Number, default: 2048 },
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
            witherProgress: { type: Number, default: 0 },
            isDead: { type: Boolean, default: false },
            lastUpdated: { type: Date, default: Date.now },
            plantedAt: { type: Date, default: Date.now }
        }
    ],

    harvestCount: { type: Number, default: 0 },
    waterCount: { type: Number, default: 0 },
    plantCount: { type: Number, default: 0 },
    totalGoldCollected: { type: Number, default: 0 },
    plantSurvivalStreak: { type: Number, default: 0 },

    dailyQuestState: {
        dateKey: { type: String, default: null },
        waterCount: { type: Number, default: 0 },
        harvestCount: { type: Number, default: 0 },
        plantCount: { type: Number, default: 0 },
        claimedQuestIds: [{ type: String }]
    }
}, { timestamps: true });

module.exports = mongoose.model('Garden', GardenSchema);
