const mongoose = require('mongoose');

const AdminActionLogSchema = new mongoose.Schema({
    actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    domain: { type: String, required: true, trim: true, maxlength: 60, index: true },
    action: { type: String, required: true, trim: true, maxlength: 80, index: true },
    targetType: { type: String, required: true, trim: true, maxlength: 80, index: true },
    targetId: { type: String, required: true, trim: true, maxlength: 120, index: true },
    summary: { type: String, required: true, trim: true, maxlength: 240 },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} }
}, { timestamps: true });

AdminActionLogSchema.index({ domain: 1, createdAt: -1 });
AdminActionLogSchema.index({ targetType: 1, targetId: 1, createdAt: -1 });

module.exports = mongoose.model('AdminActionLog', AdminActionLogSchema);
