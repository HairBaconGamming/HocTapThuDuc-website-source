const mongoose = require('mongoose');

const GuildContributionSchema = new mongoose.Schema({
    guild: { type: mongoose.Schema.Types.ObjectId, ref: 'Guild', required: true, index: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    resourceType: {
        type: String,
        enum: ['water', 'fertilizer', 'gold', 'sunflower', 'wheat', 'carrot', 'tomato'],
        required: true
    },
    amount: { type: Number, required: true, min: 1 },
    contributionValue: { type: Number, required: true, min: 0.1 },
    applauseCount: { type: Number, default: 0, min: 0 },
    applaudedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }]
}, { timestamps: true });

module.exports = mongoose.model('GuildContribution', GuildContributionSchema);
