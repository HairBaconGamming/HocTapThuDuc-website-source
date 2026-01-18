// test/achievementSystem.test.js
const mongoose = require('mongoose');
const { AchievementType, UserAchievement } = require('../models/Achievement');
const User = require('../models/User');
const { achievementChecker } = require('../utils/achievementUtils');

const TEST_ACHIEVEMENTS = [
    {
        id: 'test_lessons_5',
        name: '📚 Test Achievement',
        description: 'Test 5 lessons',
        icon: '📚',
        color: '#3b82f6',
        category: 'learning',
        points: 25,
        rarity: 'common',
        condition: { type: 'lessons_completed', value: 5, operator: '>=' },
        unlockMessage: 'Test achievement unlocked!',
        isActive: true
    }
];

async function runTests() {
    try {
        console.log('🧪 Starting Achievement System Tests...\n');

        // Connect to DB
        const uri = process.env.MONGO_URI || 'mongodb://localhost:27017/studypro_test';
        await mongoose.connect(uri);
        console.log('✅ Connected to MongoDB\n');

        // Test 1: Check Achievement Creation
        console.log('Test 1: Create Achievement');
        await AchievementType.deleteMany({ id: 'test_lessons_5' });
        const achievement = await AchievementType.create(TEST_ACHIEVEMENTS[0]);
        console.log(`✅ Created achievement: ${achievement.name}\n`);

        // Test 2: Create Test User
        console.log('Test 2: Create Test User');
        const testUser = await User.findOneAndUpdate(
            { username: 'test_achievement_user' },
            {
                email: 'test@achievement.com',
                lessonsCompleted: 0,
                totalPoints: 0,
                currentStreak: 0
            },
            { upsert: true, new: true }
        );
        console.log(`✅ Created/Updated test user: ${testUser.username}\n`);

        // Test 3: Check Condition Evaluation
        console.log('Test 3: Test Condition Evaluation');
        const testCondition = { type: 'lessons_completed', value: 5, operator: '>=' };
        console.log(`   Condition: ${testCondition.value} lessons >= ?`);
        
        // Case 1: Less than condition
        let result = achievementChecker.evaluateCondition(testCondition, { currentValue: 3 });
        console.log(`   • 3 lessons: ${result ? '✅ PASS' : '❌ FAIL (expected)'}`);
        
        // Case 2: Equal to condition
        result = achievementChecker.evaluateCondition(testCondition, { currentValue: 5 });
        console.log(`   • 5 lessons: ${result ? '✅ PASS' : '❌ FAIL'}`);
        
        // Case 3: Greater than condition
        result = achievementChecker.evaluateCondition(testCondition, { currentValue: 10 });
        console.log(`   • 10 lessons: ${result ? '✅ PASS' : '❌ FAIL'}\n`);

        // Test 4: Unlock Achievement with insufficient data
        console.log('Test 4: Attempt Unlock (insufficient)');
        let unlocked = await achievementChecker.checkAndUnlockAchievements(
            testUser._id,
            'lessons_completed',
            { currentValue: 3 }
        );
        console.log(`   Unlocked count: ${unlocked.length} (expected: 0) ${unlocked.length === 0 ? '✅' : '❌'}\n`);

        // Test 5: Unlock Achievement with sufficient data
        console.log('Test 5: Attempt Unlock (sufficient)');
        unlocked = await achievementChecker.checkAndUnlockAchievements(
            testUser._id,
            'lessons_completed',
            { currentValue: 5 }
        );
        console.log(`   Unlocked count: ${unlocked.length} (expected: 1) ${unlocked.length === 1 ? '✅' : '❌'}`);
        if (unlocked.length > 0) {
            console.log(`   Achievement: ${unlocked[0].name}`);
            console.log(`   Points: ${unlocked[0].points}\n`);
        }

        // Test 6: Verify database entry
        console.log('Test 6: Verify Database Entry');
        const userAch = await UserAchievement.findOne({ user: testUser._id });
        if (userAch) {
            console.log(`   ✅ UserAchievement created`);
            console.log(`   Achievement ID: ${userAch.achievementId}`);
            console.log(`   Unlocked At: ${userAch.unlockedAt}\n`);
        } else {
            console.log(`   ❌ UserAchievement not found\n`);
        }

        // Test 7: Prevent duplicate unlock
        console.log('Test 7: Prevent Duplicate Unlock');
        unlocked = await achievementChecker.checkAndUnlockAchievements(
            testUser._id,
            'lessons_completed',
            { currentValue: 5 }
        );
        console.log(`   Unlocked count: ${unlocked.length} (expected: 0) ${unlocked.length === 0 ? '✅' : '❌'}\n`);

        // Test 8: Get user achievements
        console.log('Test 8: Get User Achievements');
        const userAchievements = await achievementChecker.getUserAchievements(testUser._id);
        console.log(`   Total achievements: ${userAchievements.length} (expected: 1) ${userAchievements.length === 1 ? '✅' : '❌'}\n`);

        // Test 9: Get achievement stats
        console.log('Test 9: Get Achievement Stats');
        const stats = await achievementChecker.getAchievementStats(testUser._id);
        console.log(`   Total: ${stats.total}`);
        console.log(`   Unlocked: ${stats.unlocked}`);
        console.log(`   Locked: ${stats.locked}`);
        console.log(`   Completion: ${stats.completion}%`);
        console.log(`   Points: ${stats.points}\n`);

        // Cleanup
        console.log('🧹 Cleaning up test data...');
        await AchievementType.deleteMany({ id: 'test_lessons_5' });
        await UserAchievement.deleteMany({ user: testUser._id });
        console.log('✅ Cleanup complete\n');

        console.log('🎉 All tests completed!');
        process.exit(0);

    } catch (err) {
        console.error('❌ Test error:', err);
        process.exit(1);
    }
}

runTests();
