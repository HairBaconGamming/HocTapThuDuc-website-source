const mongoose = require('mongoose');

const unitSchema = new mongoose.Schema({
    title: { type: String, required: true },
    // Thay đổi ở đây: Link tới Course
    courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true },
    order: { type: Number, default: 0 }
}, { toJSON: { virtuals: true }, toObject: { virtuals: true } });

unitSchema.virtual('lessons', {
    ref: 'Lesson',
    localField: '_id',
    foreignField: 'unitId',
    options: { sort: { order: 1 } }
});

module.exports = mongoose.model('Unit', unitSchema);