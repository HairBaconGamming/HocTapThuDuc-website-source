const mongoose = require('mongoose');

const FlashcardSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    lesson: { type: mongoose.Schema.Types.ObjectId, ref: 'Lesson', required: true },

    front: { type: String, required: true },
    back: { type: String, required: true },
    sourceType: { type: String, enum: ['manual', 'inline_selection'], default: 'manual' },
    anchor: {
        blockKey: { type: String, default: '' },
        blockType: { type: String, default: '' },
        selectedText: { type: String, default: '' },
        prefix: { type: String, default: '' },
        suffix: { type: String, default: '' },
        startOffset: { type: Number, default: 0 },
        endOffset: { type: Number, default: 0 },
        quoteHash: { type: String, default: '' }
    },

    interval: { type: Number, default: 0 },
    repetition: { type: Number, default: 0 },
    efactor: { type: Number, default: 2.5 },
    nextReviewDate: { type: Date, default: Date.now }
}, { timestamps: true });

FlashcardSchema.index({ user: 1, lesson: 1, sourceType: 1, 'anchor.blockKey': 1, createdAt: 1 });

module.exports = mongoose.model('Flashcard', FlashcardSchema);
