const mongoose = require('mongoose');

const ReplySchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    content: { type: String, required: true },
    likes: { type: Number, default: 0 },
    likedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
}, { _id: true });

const CommentAnchorSchema = new mongoose.Schema({
    blockKey: { type: String, required: true },
    blockType: { type: String, default: '' },
    selectedText: { type: String, required: true },
    prefix: { type: String, default: '' },
    suffix: { type: String, default: '' },
    startOffset: { type: Number, required: true },
    endOffset: { type: Number, required: true },
    quoteHash: { type: String, required: true }
}, { _id: false });

const CommentSchema = new mongoose.Schema({
    lesson: { type: mongoose.Schema.Types.ObjectId, ref: 'Lesson', required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    content: { type: String, required: true },
    contextAnchor: { type: CommentAnchorSchema, default: null },
    likes: { type: Number, default: 0 },
    likedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    replies: [ReplySchema],
    isEdited: { type: Boolean, default: false },
    editedAt: { type: Date, default: null },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null }
}, { timestamps: true });

CommentSchema.index({ lesson: 1, createdAt: -1 });
CommentSchema.index({ user: 1 });
CommentSchema.index({ lesson: 1, 'contextAnchor.blockKey': 1, createdAt: -1 });

module.exports = mongoose.model('Comment', CommentSchema);
