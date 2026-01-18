// seeds/clearAllAchievements.js
// Xóa toàn bộ achievements của tất cả users và reset totalPoints
require('dotenv').config();
const mongoose = require('mongoose');
const { AchievementType, UserAchievement } = require('../models/Achievement');
const User = require('../models/User');

async function clearAllAchievements() {
    try {
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb+srv://biesxiaolin:GgjBcJd8hz0maLl3@cluster0.4q4pw.mongodb.net/vocabulary_app?retryWrites=true&w=majority&appName=Cluster0');
        console.log('✓ Connected to MongoDB');

        // 1. Xóa tất cả UserAchievement records
        const deleteResult = await UserAchievement.deleteMany({});
        console.log(`✓ Đã xóa ${deleteResult.deletedCount} achievement records`);

        // 2. Reset totalPoints cho tất cả users
        const updateResult = await User.updateMany(
            {},
            { totalPoints: 0 }
        );
        console.log(`✓ Đã reset totalPoints cho ${updateResult.modifiedCount} users`);

        console.log('\n✅ Xóa toàn bộ achievements hoàn tất!');
        process.exit(0);
    } catch (err) {
        console.error('❌ Error:', err);
        process.exit(1);
    }
}

clearAllAchievements();
