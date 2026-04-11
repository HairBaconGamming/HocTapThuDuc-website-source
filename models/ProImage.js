const mongoose = require('mongoose');

const ProImageSchema = new mongoose.Schema(
    {
        user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
        url: { type: String, required: true, trim: true },
        public_id: { type: String, trim: true },
        displayName: { type: String, trim: true },
        filename: { type: String, trim: true },
        size: { type: Number, default: 0 },
        source: { type: String, enum: ['cloudinary', 'gridfs-migrated'], default: 'cloudinary' },
        legacyFileId: { type: String, trim: true, default: null }
    },
    { timestamps: true }
);

ProImageSchema.index({ legacyFileId: 1 }, { sparse: true });

module.exports = mongoose.model('ProImage', ProImageSchema);
