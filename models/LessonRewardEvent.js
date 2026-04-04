const mongoose = require('mongoose');

const RewardBundleSchema = new mongoose.Schema({
    water: { type: Number, default: 0 },
    fertilizer: { type: Number, default: 0 },
    gold: { type: Number, default: 0 },
    points: { type: Number, default: 0 },
    xp: { type: Number, default: 0 }
}, { _id: false });

const LessonRewardEventSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    lesson: { type: mongoose.Schema.Types.ObjectId, ref: 'Lesson', required: true },
    eventType: {
        type: String,
        enum: ['scroll_checkpoint', 'video_finished', 'flashcard_review', 'quiz_passed', 'lesson_completed'],
        required: true
    },
    checkpointKey: { type: String, required: true, default: '' },
    rewardType: {
        type: String,
        enum: ['water', 'fertilizer', 'gold', 'bundle'],
        required: true
    },
    rewardAmount: { type: Number, default: 0 },
    rewardBundle: { type: RewardBundleSchema, default: null },
    status: {
        type: String,
        enum: ['revealed', 'claiming', 'claimed', 'ignored'],
        default: 'revealed'
    },
    revealedAt: { type: Date, default: Date.now },
    claimedAt: { type: Date, default: null },
    meta: { type: mongoose.Schema.Types.Mixed, default: {} }
}, { timestamps: true });

LessonRewardEventSchema.index(
    { user: 1, lesson: 1, eventType: 1, checkpointKey: 1 },
    { unique: true, name: 'lesson_reward_unique_checkpoint' }
);
LessonRewardEventSchema.index({ user: 1, lesson: 1, status: 1, revealedAt: -1 });
LessonRewardEventSchema.index({ user: 1, eventType: 1, status: 1, createdAt: -1 });

module.exports = mongoose.model('LessonRewardEvent', LessonRewardEventSchema);
