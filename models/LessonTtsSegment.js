const mongoose = require('mongoose');

const lessonTtsSegmentSchema = new mongoose.Schema({
    lesson: { type: mongoose.Schema.Types.ObjectId, ref: 'Lesson', required: true, index: true },
    cacheKey: { type: String, required: true, index: true },
    segmentIndex: { type: Number, required: true },
    segmentCount: { type: Number, required: true },
    voice: { type: String, required: true },
    outputFormat: { type: String, required: true },
    extractorVersion: { type: String, required: true },
    gridFsFileId: { type: mongoose.Schema.Types.ObjectId, required: true },
    charCount: { type: Number, default: 0 }
}, { timestamps: true });

lessonTtsSegmentSchema.index({ cacheKey: 1, segmentIndex: 1 }, { unique: true });

module.exports = mongoose.model('LessonTtsSegment', lessonTtsSegmentSchema);
