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
        tomato: { type: Number, default: 0 },
        watermelon: { type: Number, default: 0 },
        chili_pepper: { type: Number, default: 0 }
    },
    totalContributionValue: { type: Number, default: 0 },
    announcement: {
        content: { type: String, default: '', trim: true, maxlength: 700 },
        updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        updatedAt: { type: Date, default: null }
    },
    weeklyGoalSnapshot: {
        goalId: { type: mongoose.Schema.Types.ObjectId, ref: 'GuildWeeklyGoal', default: null },
        weekKey: { type: String, default: '' },
        title: { type: String, default: '' },
        targetType: { type: String, default: 'spirit_power' },
        targetResource: { type: String, default: null },
        targetAmount: { type: Number, default: 0 },
        currentAmount: { type: Number, default: 0 },
        rewardPreview: { type: String, default: '' },
        status: { type: String, default: 'idle' }
    },
    seasonBadge: {
        title: { type: String, default: '' },
        icon: { type: String, default: '' },
        aura: { type: String, default: '' }
    },
    settings: {
        joinMode: { type: String, enum: ['open', 'approval', 'invite'], default: 'open' },
        isPublic: { type: Boolean, default: true },
        inviteCode: { type: String, default: '' },
        joinThresholds: {
            minLevel: { type: Number, default: 0 },
            minStreak: { type: Number, default: 0 },
            minTotalPoints: { type: Number, default: 0 },
            minWeeklyMinutes: { type: Number, default: 0 }
        },
        permissions: {
            leader: { type: mongoose.Schema.Types.Mixed, default: {} },
            co_leader: { type: mongoose.Schema.Types.Mixed, default: {} },
            elder: { type: mongoose.Schema.Types.Mixed, default: {} },
            member: { type: mongoose.Schema.Types.Mixed, default: {} }
        },
        autoModeration: {
            enabled: { type: Boolean, default: false },
            kickAfterInactiveDays: { type: Number, default: 0 },
            kickIfWeeklyContributionBelow: { type: Number, default: 0 },
            excludeRoles: {
                type: [String],
                default: ['leader', 'co_leader']
            }
        }
    },
    lastContributionAt: { type: Date, default: null }
}, { timestamps: true });

module.exports = mongoose.model('Guild', GuildSchema);
