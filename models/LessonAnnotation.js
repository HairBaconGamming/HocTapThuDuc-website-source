const mongoose = require('mongoose');

const LessonAnchorSchema = new mongoose.Schema({
    blockKey: { type: String, required: true },
    blockType: { type: String, default: '' },
    selectedText: { type: String, required: true },
    prefix: { type: String, default: '' },
    suffix: { type: String, default: '' },
    startOffset: { type: Number, required: true },
    endOffset: { type: Number, required: true },
    quoteHash: { type: String, required: true }
}, { _id: false });

const LessonAnnotationSchema = new mongoose.Schema({
    lesson: { type: mongoose.Schema.Types.ObjectId, ref: 'Lesson', required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    revisionKey: { type: String, default: '' },
    kind: {
        type: String,
        enum: ['highlight', 'note'],
        required: true
    },
    color: {
        type: String,
        enum: ['yellow', 'blue', 'green', 'pink', 'purple'],
        default: 'yellow'
    },
    note: { type: String, default: '' },
    anchor: { type: LessonAnchorSchema, required: true }
}, { timestamps: true });

LessonAnnotationSchema.index({ lesson: 1, user: 1, createdAt: -1 });
LessonAnnotationSchema.index({ lesson: 1, user: 1, 'anchor.blockKey': 1, 'anchor.startOffset': 1 });

module.exports = mongoose.model('LessonAnnotation', LessonAnnotationSchema);
