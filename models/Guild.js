const mongoose = require('mongoose');

const GuildSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true, maxlength: 60 },
    slug: { type: String, required: true, trim: true, unique: true, index: true },
    description: { type: String, default: '', trim: true, maxlength: 260 },
    leader: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    memberCount: { type: Number, default: 1, min: 1 },
    memberLimit: { type: Number, default: 30, min: 2, max: 100 },
    levelRequirement: { type: Number, default: 3, min: 0 },
    treeXp: { type: Number, default: 0, min: 0 },
    treeStage: { type: Number, default: 0, min: 0, max: 9 },
    buffSnapshot: {
        lessonXpPct: { type: Number, default: 0 },
        witherTimeBonusPct: { type: Number, default: 0 }
    },
    vault: {
        water: { type: Number, default: 0 },
        fertilizer: { type: Number, default: 0 },
        gold: { type: Number, default: 0 },
        sunflower: { type: Number, default: 0 },
        wheat: { type: Number, default: 0 },
        carrot: { type: Number, default: 0 },
        tomato: { type: Number, default: 0 }
    },
    totalContributionValue: { type: Number, default: 0 },
    settings: {
        joinMode: { type: String, enum: ['open', 'invite'], default: 'open' },
        isPublic: { type: Boolean, default: true }
    },
    lastContributionAt: { type: Date, default: null }
}, { timestamps: true });

module.exports = mongoose.model('Guild', GuildSchema);
