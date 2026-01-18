// seeds/seedAchievements.js
require('dotenv').config();
const mongoose = require('mongoose');
const { AchievementType } = require('../models/Achievement');

const ACHIEVEMENTS = [
    // Learning Milestones
    {
        id: 'first_lesson',
        name: '🎓 Bước Đầu Tiên',
        description: 'Hoàn thành bài học đầu tiên',
        icon: '🎓',
        color: '#3b82f6',
        category: 'learning',
        points: 10,
        rarity: 'common',
        condition: { type: 'lessons_completed', value: 1, operator: '>=' },
        unlockMessage: 'Chúc mừng bạn đã bước vào thế giới học tập! 🎉'
    },
    {
        id: 'lessons_10',
        name: '📚 Học Viên Đầu Tiên',
        description: 'Hoàn thành 10 bài học',
        icon: '📚',
        color: '#8b5cf6',
        category: 'learning',
        points: 25,
        rarity: 'rare',
        condition: { type: 'lessons_completed', value: 10, operator: '>=' },
        unlockMessage: 'Bạn đã hoàn thành 10 bài học! Tiếp tục như vậy! 💪'
    },
    {
        id: 'lessons_25',
        name: '🏆 Chuyên Gia Tập Sự',
        description: 'Hoàn thành 25 bài học',
        icon: '🏆',
        color: '#f59e0b',
        category: 'learning',
        points: 50,
        rarity: 'epic',
        condition: { type: 'lessons_completed', value: 25, operator: '>=' },
        unlockMessage: 'Bạn đã trở thành chuyên gia tập sự! 🌟'
    },
    {
        id: 'lessons_50',
        name: '👑 Thạc Sĩ Kiến Thức',
        description: 'Hoàn thành 50 bài học',
        icon: '👑',
        color: '#ec4899',
        category: 'learning',
        points: 100,
        rarity: 'epic',
        condition: { type: 'lessons_completed', value: 50, operator: '>=' },
        unlockMessage: 'Wow! Bạn đã hoàn thành 50 bài học! Bạn thực sự là một bậc thầy! 🎓'
    },
    {
        id: 'lessons_100',
        name: '🎯 Huyền Thoại Học Tập',
        description: 'Hoàn thành 100 bài học',
        icon: '🎯',
        color: '#dc2626',
        category: 'learning',
        points: 200,
        rarity: 'legendary',
        condition: { type: 'lessons_completed', value: 100, operator: '>=' },
        unlockMessage: 'Bạn là một huyền thoại! 100 bài học hoàn thành! 🚀'
    },

    // Points & Engagement
    {
        id: 'points_100',
        name: '⚡ Thu Thập Năng Lượng',
        description: 'Tích lũy 100 điểm',
        icon: '⚡',
        color: '#14b8a6',
        category: 'engagement',
        points: 15,
        rarity: 'common',
        condition: { type: 'points_reached', value: 100, operator: '>=' },
        unlockMessage: 'Bạn đã thu thập 100 điểm! 💯'
    },
    {
        id: 'points_500',
        name: '💎 Kho Báu Kiếm Được',
        description: 'Tích lũy 500 điểm',
        icon: '💎',
        color: '#06b6d4',
        category: 'engagement',
        points: 50,
        rarity: 'rare',
        condition: { type: 'points_reached', value: 500, operator: '>=' },
        unlockMessage: 'Bạn là một người thu thập điểm lão luyện! 💎'
    },
    {
        id: 'points_1000',
        name: '🌟 Ngôi Sao Lấp Lánh',
        description: 'Tích lũy 1000 điểm',
        icon: '🌟',
        color: '#f97316',
        category: 'engagement',
        points: 100,
        rarity: 'epic',
        condition: { type: 'points_reached', value: 1000, operator: '>=' },
        unlockMessage: 'Bạn là một ngôi sao! 1000 điểm! ✨'
    },

    // Streak & Consistency
    {
        id: 'streak_7',
        name: '🔥 Chuỗi 7 Ngày',
        description: 'Duy trì chuỗi 7 ngày liên tiếp',
        icon: '🔥',
        color: '#ef4444',
        category: 'challenge',
        points: 35,
        rarity: 'rare',
        condition: { type: 'streak_days', value: 7, operator: '>=' },
        unlockMessage: 'Bạn đã duy trì chuỗi 7 ngày! Bạn kiên trì quá! 🔥'
    },
    {
        id: 'streak_30',
        name: '💪 Vua Kiên Trì',
        description: 'Duy trì chuỗi 30 ngày liên tiếp',
        icon: '💪',
        color: '#d946ef',
        category: 'challenge',
        points: 100,
        rarity: 'epic',
        condition: { type: 'streak_days', value: 30, operator: '>=' },
        unlockMessage: 'Một tháng liên tiếp! Bạn thực sự là một chiến binh! 💪'
    },
    {
        id: 'streak_100',
        name: '👨‍🚀 Phi Hành Gia Huyền Thoại',
        description: 'Duy trì chuỗi 100 ngày liên tiếp',
        icon: '👨‍🚀',
        color: '#7c3aed',
        category: 'challenge',
        points: 500,
        rarity: 'legendary',
        condition: { type: 'streak_days', value: 100, operator: '>=' },
        unlockMessage: 'OMG! 100 ngày liên tiếp! Bạn không thể ngừng được! 👨‍🚀'
    },

    ];

async function seedAchievements() {
    try {
        console.log('🔄 Kết nối MongoDB...');
        await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/studypro');

        console.log('🗑️  Xóa achievements cũ...');
        await AchievementType.deleteMany({});

        console.log('📥 Thêm achievements mới...');
        const inserted = await AchievementType.insertMany(ACHIEVEMENTS);

        console.log(`✅ Đã thêm ${inserted.length} achievements!`);
        console.log('');
        console.log('📊 Achievements Summary:');
        console.log('  Learning:', ACHIEVEMENTS.filter(a => a.category === 'learning').length);
        console.log('  Engagement:', ACHIEVEMENTS.filter(a => a.category === 'engagement').length);
        console.log('  Challenge:', ACHIEVEMENTS.filter(a => a.category === 'challenge').length);
        console.log('  Social:', ACHIEVEMENTS.filter(a => a.category === 'social').length);

        process.exit(0);
    } catch (err) {
        console.error('❌ Lỗi:', err.message);
        process.exit(1);
    }
}

seedAchievements();
