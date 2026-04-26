const mongoose = require('mongoose');

const LIVE_QUESTION_STATUSES = ['queued', 'pinned', 'answered', 'dismissed'];

const liveQuestionSchema = new mongoose.Schema({
    sessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'LiveSession', required: true, index: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    username: { type: String, required: true, trim: true, maxlength: 80 },
    avatar: { type: String, default: '', trim: true },
    content: { type: String, required: true, trim: true, maxlength: 1000 },
    status: { type: String, enum: LIVE_QUESTION_STATUSES, default: 'queued', index: true },
    moderatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    pinnedAt: { type: Date, default: null },
    answeredAt: { type: Date, default: null },
    dismissedAt: { type: Date, default: null }
}, {
    timestamps: true
});

module.exports = {
    LiveQuestion: mongoose.model('LiveQuestion', liveQuestionSchema),
    LIVE_QUESTION_STATUSES
};
