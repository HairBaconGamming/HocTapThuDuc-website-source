const mongoose = require('mongoose');
const slugify = require('slugify');

const subjectSchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true },
    slug: { type: String, slug: 'name', unique: true }, // Cần plugin mongoose-slug-generator
    image: { type: String },
    description: String,
    // Virtual field sẽ lấy danh sách Units
}, { toJSON: { virtuals: true }, toObject: { virtuals: true } });

// Virtual populate để lấy toàn bộ chương của môn học
subjectSchema.virtual('units', {
    ref: 'Unit',
    localField: '_id',
    foreignField: 'subjectId',
    options: { sort: { order: 1 } } // Sắp xếp theo thứ tự
});

// Generate unique slug before validation (use slugify)
subjectSchema.pre('validate', async function (next) {
    if (this.slug) return next();
    if (!this.name) return next();
    const base = slugify(this.name, { lower: true, strict: true });
    let slug = base;
    let i = 0;
    while (await this.constructor.exists({ slug })) {
        i++;
        slug = `${base}-${i}`;
    }
    this.slug = slug;
    next();
});

module.exports = mongoose.model('Subject', subjectSchema);