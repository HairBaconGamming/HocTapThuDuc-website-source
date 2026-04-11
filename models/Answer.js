const mongoose = require('mongoose');

const AnswerCommentSchema = new mongoose.Schema({
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    content: { type: String, required: true, trim: true, maxlength: 3000 },
    createdAt: { type: Date, default: Date.now }
}, { _id: true });

const AnswerSchema = new mongoose.Schema({
    question: { type: mongoose.Schema.Types.ObjectId, ref: 'Question', required: true, index: true },
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    content: { type: String, required: true, trim: true, maxlength: 20000 },
    images: [{ type: String, trim: true }],
    upvotes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    isAccepted: { type: Boolean, default: false, index: true },
    comments: [AnswerCommentSchema]
}, { timestamps: true });

AnswerSchema.index({ question: 1, createdAt: 1 });
AnswerSchema.index({ author: 1, createdAt: -1 });

module.exports = mongoose.model('Answer', AnswerSchema);
