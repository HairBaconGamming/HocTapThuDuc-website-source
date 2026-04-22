const mongoose = require('mongoose');

const GuildWeeklyGoalSchema = new mongoose.Schema({
    guild: { type: mongoose.Schema.Types.ObjectId, ref: 'Guild', required: true, index: true },
    weekKey: { type: String, required: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 120 },
    targetType: { type: String, enum: ['spirit_power', 'resource'], required: true },
    targetResource: {
        type: String,
        enum: ['water', 'fertilizer', 'gold', 'sunflower', 'wheat', 'carrot', 'tomato', 'watermelon', 'chili_pepper', null],
        default: null
    },
    targetAmount: { type: Number, required: true, min: 1 },
    currentAmount: { type: Number, default: 0, min: 0 },
    rewardPreview: { type: String, default: '', trim: true, maxlength: 220 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    status: { type: String, enum: ['active', 'completed', 'expired'], default: 'active', index: true },
    completedAt: { type: Date, default: null }
}, { timestamps: true });

GuildWeeklyGoalSchema.index({ guild: 1, weekKey: 1 }, { unique: true, name: 'guild_week_goal_unique' });

module.exports = mongoose.model('GuildWeeklyGoal', GuildWeeklyGoalSchema);
