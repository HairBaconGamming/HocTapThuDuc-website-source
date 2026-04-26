const mongoose = require('mongoose');
const slugify = require('slugify');

const LIVE_SESSION_STATUSES = ['draft', 'scheduled', 'live', 'ended', 'cancelled', 'failed'];
const LIVE_REPLAY_STATUSES = ['pending', 'ready', 'failed', 'expired'];
const LIVE_BINDING_TYPES = ['course', 'lesson'];
const LIVE_PROVIDER_KINDS = ['livekit', 'mock'];
const LIVE_SESSION_MODES = ['instant', 'scheduled'];

const liveSessionSchema = new mongoose.Schema({
    title: { type: String, required: true, trim: true, maxlength: 160 },
    slug: { type: String, required: true, unique: true, index: true },
    description: { type: String, default: '', trim: true, maxlength: 2400 },
    category: { type: String, default: 'Học tập', trim: true, maxlength: 60 },
    thumbnail: { type: String, default: '', trim: true },
    visibility: { type: String, enum: ['logged_in'], default: 'logged_in' },
    sessionMode: { type: String, enum: LIVE_SESSION_MODES, default: 'scheduled' },
    status: { type: String, enum: LIVE_SESSION_STATUSES, default: 'scheduled', index: true },
    replayStatus: { type: String, enum: LIVE_REPLAY_STATUSES, default: 'pending' },
    bindingType: { type: String, enum: LIVE_BINDING_TYPES, default: null },
    hostUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    moderatorUsers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    reminderSubscribers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    subjectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Subject', default: null, index: true },
    courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', default: null, index: true },
    lessonId: { type: mongoose.Schema.Types.ObjectId, ref: 'Lesson', default: null, index: true },
    scheduledFor: { type: Date, default: null, index: true },
    actualStartedAt: { type: Date, default: null },
    endedAt: { type: Date, default: null },
    providerKind: { type: String, enum: LIVE_PROVIDER_KINDS, default: 'mock' },
    providerRoomName: { type: String, default: '', trim: true, index: true },
    providerRoomSid: { type: String, default: '', trim: true },
    providerEgressId: { type: String, default: '', trim: true },
    providerLastWebhookEvent: { type: String, default: '', trim: true },
    providerLastWebhookAt: { type: Date, default: null },
    providerError: { type: String, default: '', trim: true, maxlength: 1000 },
    replayUrl: { type: String, default: '', trim: true },
    replayPlaybackUrl: { type: String, default: '', trim: true },
    replayPlaybackId: { type: String, default: '', trim: true },
    replayNote: { type: String, default: '', trim: true, maxlength: 800 },
    lastReminderAt24h: { type: Date, default: null },
    lastReminderAt1h: { type: Date, default: null },
    lastReminderAt10m: { type: Date, default: null },
    viewerCountSnapshot: { type: Number, default: 0, min: 0 },
    viewerPeak: { type: Number, default: 0, min: 0 },
    uniqueViewerCount: { type: Number, default: 0, min: 0 },
    attendanceQualifiedCount: { type: Number, default: 0, min: 0 },
    chatMessagesCount: { type: Number, default: 0, min: 0 },
    questionsCount: { type: Number, default: 0, min: 0 },
    raisedHandsCount: { type: Number, default: 0, min: 0 },
    chatMutedUserIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    kickedUserIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }]
}, {
    timestamps: true
});

liveSessionSchema.index({ status: 1, scheduledFor: 1 });
liveSessionSchema.index({ replayStatus: 1, endedAt: -1 });

liveSessionSchema.pre('validate', function (next) {
    if (!this.slug) {
        const base = slugify(this.title || 'live-session', {
            lower: true,
            strict: true,
            locale: 'vi'
        }) || 'live-session';
        const suffix = String(this._id || new mongoose.Types.ObjectId()).slice(-6).toLowerCase();
        this.slug = `${base}-${suffix}`;
    }

    if (!Array.isArray(this.moderatorUsers) || this.moderatorUsers.length === 0) {
        this.moderatorUsers = this.hostUser ? [this.hostUser] : [];
    } else if (this.hostUser && !this.moderatorUsers.some((entry) => String(entry) === String(this.hostUser))) {
        this.moderatorUsers.push(this.hostUser);
    }

    if (!Array.isArray(this.reminderSubscribers)) {
        this.reminderSubscribers = [];
    }
    if (this.hostUser && !this.reminderSubscribers.some((entry) => String(entry) === String(this.hostUser))) {
        this.reminderSubscribers.push(this.hostUser);
    }

    next();
});

module.exports = {
    LiveSession: mongoose.model('LiveSession', liveSessionSchema),
    LIVE_SESSION_STATUSES,
    LIVE_REPLAY_STATUSES,
    LIVE_BINDING_TYPES,
    LIVE_PROVIDER_KINDS,
    LIVE_SESSION_MODES
};
