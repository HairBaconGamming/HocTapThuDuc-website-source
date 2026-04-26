const mongoose = require('mongoose');

const LIVE_HAND_RAISE_STATUSES = ['raised', 'accepted', 'lowered'];

const liveHandRaiseSchema = new mongoose.Schema({
    sessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'LiveSession', required: true, index: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    username: { type: String, required: true, trim: true, maxlength: 80 },
    avatar: { type: String, default: '', trim: true },
    status: { type: String, enum: LIVE_HAND_RAISE_STATUSES, default: 'raised', index: true },
    raisedAt: { type: Date, default: Date.now },
    handledAt: { type: Date, default: null },
    handledBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
}, {
    timestamps: true
});

liveHandRaiseSchema.index({ sessionId: 1, user: 1 }, { unique: true });

module.exports = {
    LiveHandRaise: mongoose.model('LiveHandRaise', liveHandRaiseSchema),
    LIVE_HAND_RAISE_STATUSES
};
