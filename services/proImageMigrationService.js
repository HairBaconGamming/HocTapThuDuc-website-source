const mongoose = require('mongoose');
const cloudinary = require('cloudinary').v2;

const ProImage = require('../models/ProImage');

const LEGACY_BUCKET_NAME = 'pro-images';
const FOLDER = 'hoctapthuduc/pro-images';

let activeMigrationPromise = null;

function hasCloudinaryEnv() {
    return Boolean(
        process.env.CLOUDINARY_CLOUD_NAME &&
        process.env.CLOUDINARY_API_KEY &&
        process.env.CLOUDINARY_API_SECRET
    );
}

function ensureCloudinaryConfig() {
    if (!hasCloudinaryEnv()) {
        throw new Error('Missing Cloudinary env');
    }

    cloudinary.config({
        cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
        api_key: process.env.CLOUDINARY_API_KEY,
        api_secret: process.env.CLOUDINARY_API_SECRET
    });
}

function readStreamToBuffer(stream) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        stream.on('data', (chunk) => chunks.push(chunk));
        stream.on('error', reject);
        stream.on('end', () => resolve(Buffer.concat(chunks)));
    });
}

function uploadBufferToCloudinary(buffer, options) {
    return new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(options, (error, result) => {
            if (error) return reject(error);
            resolve(result);
        });
        stream.end(buffer);
    });
}

async function migrateLegacyProImages(options = {}) {
    if (activeMigrationPromise) return activeMigrationPromise;

    activeMigrationPromise = (async () => {
        const {
            deleteLegacy = true,
            limit = 0,
            logger = console
        } = options;

        if (!hasCloudinaryEnv()) {
            return {
                skipped: true,
                reason: 'missing-cloudinary-env',
                successCount: 0,
                skipCount: 0,
                failCount: 0,
                pendingCount: 0
            };
        }

        if (mongoose.connection.readyState !== 1) {
            throw new Error('Mongoose default connection is not ready');
        }

        ensureCloudinaryConfig();

        const bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, {
            bucketName: LEGACY_BUCKET_NAME
        });

        const migratedLegacyIds = new Set(
            (await ProImage.find({ legacyFileId: { $ne: null } }).select('legacyFileId').lean())
                .map((row) => String(row.legacyFileId || ''))
                .filter(Boolean)
        );

        const allFiles = await mongoose.connection.db
            .collection(`${LEGACY_BUCKET_NAME}.files`)
            .find({})
            .sort({ uploadDate: 1 })
            .toArray();

        const pendingFiles = allFiles.filter((file) => !migratedLegacyIds.has(String(file._id)));
        const files = limit > 0 ? pendingFiles.slice(0, limit) : pendingFiles;

        if (typeof logger?.log === 'function') {
            logger.log(`[pro-image-migrate] total=${allFiles.length}, migrated=${migratedLegacyIds.size}, pending=${pendingFiles.length}, run=${files.length}`);
        }

        let successCount = 0;
        let skipCount = 0;
        let failCount = 0;

        for (const file of files) {
            const legacyId = String(file._id);
            const userId = file.metadata?.user;

            if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
                skipCount += 1;
                if (typeof logger?.warn === 'function') {
                    logger.warn(`[pro-image-migrate] skip ${legacyId}: invalid metadata.user`);
                }
                continue;
            }

            try {
                const existing = await ProImage.findOne({ legacyFileId: legacyId }).lean();
                if (existing) {
                    skipCount += 1;
                    continue;
                }

                const buffer = await readStreamToBuffer(bucket.openDownloadStream(file._id));
                const originalName = file.metadata?.displayName || file.filename || `legacy-${legacyId}`;

                const result = await uploadBufferToCloudinary(buffer, {
                    folder: FOLDER,
                    public_id: `legacy-${legacyId}`,
                    overwrite: false,
                    resource_type: 'image',
                    transformation: [{ quality: 'auto', fetch_format: 'auto' }]
                });

                await ProImage.create({
                    user: new mongoose.Types.ObjectId(userId),
                    url: result.secure_url || result.url,
                    public_id: result.public_id,
                    displayName: originalName,
                    filename: file.filename || originalName,
                    size: Number(file.length) || 0,
                    source: 'gridfs-migrated',
                    legacyFileId: legacyId,
                    createdAt: file.uploadDate || new Date(),
                    updatedAt: new Date()
                });

                if (deleteLegacy) {
                    await bucket.delete(file._id);
                }

                successCount += 1;
                if (typeof logger?.log === 'function') {
                    logger.log(`[pro-image-migrate] migrated ${legacyId} -> ${result.public_id}`);
                }
            } catch (error) {
                failCount += 1;
                if (typeof logger?.error === 'function') {
                    logger.error(`[pro-image-migrate] failed ${legacyId}: ${error.message}`);
                }
            }
        }

        return {
            skipped: false,
            successCount,
            skipCount,
            failCount,
            pendingCount: pendingFiles.length
        };
    })();

    try {
        return await activeMigrationPromise;
    } finally {
        activeMigrationPromise = null;
    }
}

module.exports = {
    hasCloudinaryEnv,
    migrateLegacyProImages
};
