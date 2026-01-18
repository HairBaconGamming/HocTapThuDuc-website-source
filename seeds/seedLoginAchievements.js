// seeds/seedLoginAchievements.js
// Seed achievements liên quan đến login và community join
require('dotenv').config();
const mongoose = require('mongoose');
const { AchievementType } = require('../models/Achievement');

const loginAchievements = [
    {
        id: 'first_login',
        name: 'Chào mừng đến cộng đồng',
        description: 'Đăng nhập lần đầu tiên vào hệ thống',
        icon: '👋',
        color: '#3b82f6',
        category: 'social',
        points: 10,
        rarity: 'common',
        condition: {
            type: 'custom',
            value: 1,
            operator: '>='
        },
        unlockMessage: 'Chúc mừng! Bạn đã gia nhập cộng đồng Học Tập Thứ Đức! 🎉',
        isHidden: false,
        isActive: true
    },
    {
        id: 'community_join',
        name: 'Gia nhập cộng đồng',
        description: 'Bạn đã chính thức trở thành thành viên của cộng đồng',
        icon: '🤝',
        color: '#10b981',
        category: 'social',
        points: 15,
        rarity: 'common',
        condition: {
            type: 'custom',
            value: 1,
            operator: '>='
        },
        unlockMessage: 'Bạn đã gia nhập cộng đồng! Hãy bắt đầu học tập và khám phá những điều mới! 🌟',
        isHidden: false,
        isActive: true
    },
    {
        id: 'first_lesson',
        name: 'Bước đầu tiên',
        description: 'Hoàn thành bài học đầu tiên',
        icon: '📚',
        color: '#f59e0b',
        category: 'learning',
        points: 20,
        rarity: 'common',
        condition: {
            type: 'lessons_completed',
            value: 1,
            operator: '>='
        },
        unlockMessage: 'Tuyệt vời! Bạn đã hoàn thành bài học đầu tiên! 🎓',
        isHidden: false,
        isActive: true
    },
    {
        id: 'lesson_10',
        name: 'Học viên chăm chỉ',
        description: 'Hoàn thành 10 bài học',
        icon: '📖',
        color: '#8b5cf6',
        category: 'learning',
        points: 50,
        rarity: 'rare',
        condition: {
            type: 'lessons_completed',
            value: 10,
            operator: '>='
        },
        unlockMessage: 'Tuyệt vời! Bạn đã hoàn thành 10 bài học! Tiếp tục cố gắng! 💪',
        isHidden: false,
        isActive: true
    },
    {
        id: 'lesson_50',
        name: 'Bậc thầy học tập',
        description: 'Hoàn thành 50 bài học',
        icon: '🧙',
        color: '#ec4899',
        category: 'learning',
        points: 100,
        rarity: 'epic',
        condition: {
            type: 'lessons_completed',
            value: 50,
            operator: '>='
        },
        unlockMessage: 'Phi thường! Bạn đã hoàn thành 50 bài học! Bạn là một bậc thầy! 🏆',
        isHidden: false,
        isActive: true
    },
    {
        id: 'lesson_100',
        name: 'Huyền thoại học tập',
        description: 'Hoàn thành 100 bài học',
        icon: '⭐',
        color: '#f97316',
        category: 'learning',
        points: 200,
        rarity: 'legendary',
        condition: {
            type: 'lessons_completed',
            value: 100,
            operator: '>='
        },
        unlockMessage: 'Tuyệt vời! Bạn đã hoàn thành 100 bài học! Bạn là một huyền thoại! 👑',
        isHidden: false,
        isActive: true
    }
];

async function seedLoginAchievements() {
    try {
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb+srv://biesxiaolin:GgjBcJd8hz0maLl3@cluster0.4q4pw.mongodb.net/vocabulary_app?retryWrites=true&w=majority&appName=Cluster0');
        console.log('Connected to MongoDB');

        // Xóa achievements cũ nếu cần
        // await AchievementType.deleteMany({ id: { $in: loginAchievements.map(a => a.id) } });

        for (const achievement of loginAchievements) {
            const existing = await AchievementType.findOne({ id: achievement.id });
            if (!existing) {
                await AchievementType.create(achievement);
                console.log(`✓ Created achievement: ${achievement.name}`);
            } else {
                console.log(`✓ Achievement already exists: ${achievement.name}`);
            }
        }

        console.log('✓ Seeding completed!');
        process.exit(0);
    } catch (err) {
        console.error('Error seeding achievements:', err);
        process.exit(1);
    }
}

seedLoginAchievements();
