const mongoose = require('mongoose');

const liveAttendanceSchema = new mongoose.Schema({
    sessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'LiveSession', required: true, index: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    joinedAt: { type: Date, default: Date.now },
    lastJoinedAt: { type: Date, default: Date.now },
    leftAt: { type: Date, default: null },
    lastPingAt: { type: Date, default: Date.now },
    totalMinutes: { type: Number, default: 0, min: 0 },
    joinCount: { type: Number, default: 1, min: 0 },
    qualified: { type: Boolean, default: false },
    qualificationAwardedAt: { type: Date, default: null }
}, {
    timestamps: true
});

liveAttendanceSchema.index({ sessionId: 1, user: 1 }, { unique: true });

module.exports = mongoose.model('LiveAttendance', liveAttendanceSchema);
