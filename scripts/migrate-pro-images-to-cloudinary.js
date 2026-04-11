require('dotenv').config();

const mongoose = require('mongoose');
const { migrateLegacyProImages, hasCloudinaryEnv } = require('../services/proImageMigrationService');

function stripWrappingQuotes(value) {
    return typeof value === 'string' ? value.replace(/^\"(.*)\"$/, '$1') : value;
}

function parseArgs(argv) {
    return {
        deleteLegacy: !argv.includes('--keep-legacy'),
        limit: (() => {
            const hit = argv.find((arg) => arg.startsWith('--limit='));
            return hit ? Math.max(1, Number(hit.split('=')[1]) || 0) : 0;
        })()
    };
}

async function main() {
    const args = parseArgs(process.argv.slice(2));

    if (!hasCloudinaryEnv()) {
        throw new Error('Missing Cloudinary env: CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET');
    }

    const mongoUri = stripWrappingQuotes(
        process.env.IMAGE_MONGO_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/studypro'
    );

    await mongoose.connect(mongoUri);

    const summary = await migrateLegacyProImages({
        deleteLegacy: args.deleteLegacy,
        limit: args.limit,
        logger: console
    });

    console.log('--- Migration summary ---');
    console.log(`Success: ${summary.successCount}`);
    console.log(`Skipped: ${summary.skipCount}`);
    console.log(`Failed: ${summary.failCount}`);
    console.log(`Legacy deletion: ${args.deleteLegacy ? 'enabled' : 'disabled'}`);

    await mongoose.disconnect();

    if (summary.failCount > 0) {
        process.exitCode = 1;
    }
}

main().catch(async (error) => {
    console.error(error);
    try {
        await mongoose.disconnect();
    } catch (_) {
        // ignore disconnect errors
    }
    process.exit(1);
});
