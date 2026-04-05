const mongoose = require('mongoose');

const GuildApplicationSchema = new mongoose.Schema({
    guild: { type: mongoose.Schema.Types.ObjectId, ref: 'Guild', required: true, index: true },
    applicant: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    message: { type: String, default: '', trim: true, maxlength: 500 },
    status: {
        type: String,
        enum: ['pending', 'approved', 'rejected', 'cancelled'],
        default: 'pending',
        index: true
    },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    reviewedAt: { type: Date, default: null },
    reviewNote: { type: String, default: '', trim: true, maxlength: 300 }
}, { timestamps: true });

GuildApplicationSchema.index(
    { guild: 1, applicant: 1, status: 1 },
    { unique: true, partialFilterExpression: { status: 'pending' }, name: 'guild_pending_application_unique' }
);

module.exports = mongoose.model('GuildApplication', GuildApplicationSchema);
