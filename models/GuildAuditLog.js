const mongoose = require('mongoose');

const GuildAuditLogSchema = new mongoose.Schema({
    guild: { type: mongoose.Schema.Types.ObjectId, ref: 'Guild', required: true, index: true },
    actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    targetUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    actionType: {
        type: String,
        required: true,
        enum: [
            'guild_created',
            'member_joined',
            'member_left',
            'member_kicked',
            'application_submitted',
            'application_approved',
            'application_rejected',
            'role_changed',
            'join_settings_updated',
            'announcement_updated',
            'invite_code_refreshed',
            'weekly_goal_updated',
            'weekly_goal_completed',
            'auto_moderation_updated',
            'auto_kick',
            'contribution',
            'milestone'
        ],
        index: true
    },
    message: { type: String, required: true, trim: true, maxlength: 400 },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} }
}, { timestamps: true });

GuildAuditLogSchema.index({ guild: 1, createdAt: -1 });

module.exports = mongoose.model('GuildAuditLog', GuildAuditLogSchema);
