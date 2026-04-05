const mongoose = require('mongoose');

const GuildWeeklyStandingSchema = new mongoose.Schema({
    guild: { type: mongoose.Schema.Types.ObjectId, ref: 'Guild', required: true, index: true },
    periodType: { type: String, enum: ['weekly', 'monthly'], required: true, index: true },
    periodKey: { type: String, required: true, index: true },
    totalXp: { type: Number, default: 0, min: 0 },
    totalPoints: { type: Number, default: 0, min: 0 },
    totalStudyMinutes: { type: Number, default: 0, min: 0 },
    memberCountSnapshot: { type: Number, default: 0, min: 0 },
    rank: { type: Number, default: 0, min: 0 },
    rewardTitle: { type: String, default: '', trim: true, maxlength: 120 },
    rewardIcon: { type: String, default: '', trim: true, maxlength: 20 }
}, { timestamps: true });

GuildWeeklyStandingSchema.index(
    { guild: 1, periodType: 1, periodKey: 1 },
    { unique: true, name: 'guild_period_standing_unique' }
);

module.exports = mongoose.model('GuildWeeklyStanding', GuildWeeklyStandingSchema);
