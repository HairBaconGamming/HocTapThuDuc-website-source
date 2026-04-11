const mongoose = require('mongoose');

const QUESTION_SUBJECTS = ['Toán', 'Lý', 'Hóa', 'Sinh', 'Anh', 'Văn', 'Khác'];
const QUESTION_GRADES = ['10', '11', '12', 'Chung'];

const QuestionSchema = new mongoose.Schema({
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 220 },
    content: { type: String, required: true, trim: true, maxlength: 20000 },
    images: [{ type: String, trim: true }],
    subject: { type: String, enum: QUESTION_SUBJECTS, required: true, default: 'Khác' },
    grade: { type: String, enum: QUESTION_GRADES, required: true, default: 'Chung' },
    bountyAmount: { type: Number, default: 0, min: 0 },
    viewCount: { type: Number, default: 0, min: 0 },
    answerCount: { type: Number, default: 0, min: 0 },
    status: { type: String, enum: ['open', 'resolved', 'closed'], default: 'open', index: true },
    upvotes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    acceptedAnswer: { type: mongoose.Schema.Types.ObjectId, ref: 'Answer', default: null }
}, { timestamps: true });

QuestionSchema.index({ subject: 1, grade: 1, createdAt: -1 });
QuestionSchema.index({ author: 1, createdAt: -1 });
QuestionSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('Question', QuestionSchema);
module.exports.QUESTION_SUBJECTS = QUESTION_SUBJECTS;
module.exports.QUESTION_GRADES = QUESTION_GRADES;
