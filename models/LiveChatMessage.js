const mongoose = require('mongoose');

const liveChatMessageSchema = new mongoose.Schema({
    sessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'LiveSession', required: true, index: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    username: { type: String, required: true, trim: true, maxlength: 80 },
    avatar: { type: String, default: '', trim: true },
    content: { type: String, required: true, trim: true, maxlength: 1200 },
    isSystem: { type: Boolean, default: false },
    hidden: { type: Boolean, default: false, index: true },
    hiddenAt: { type: Date, default: null },
    hiddenBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
}, {
    timestamps: true
});

module.exports = mongoose.model('LiveChatMessage', liveChatMessageSchema);
