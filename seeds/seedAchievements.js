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

    // Garden & Farming
    {
        id: 'first_plant',
        name: '🌱 Nông Dân Tập Sự',
        description: 'Trồng cây đầu tiên',
        icon: '🌱',
        color: '#22c55e',
        category: 'engagement',
        points: 10,
        rarity: 'common',
        condition: { type: 'plants_planted', value: 1, operator: '>=' },
        unlockMessage: 'Bạn đã trồng cây đầu tiên! Đó là khởi đầu của một nông trại vĩ đại! 🌱'
    },
    {
        id: 'plants_10',
        name: '🌾 Nông Dân Giàu Kinh Nghiệm',
        description: 'Trồng 10 cây',
        icon: '🌾',
        color: '#16a34a',
        category: 'engagement',
        points: 30,
        rarity: 'rare',
        condition: { type: 'plants_planted', value: 10, operator: '>=' },
        unlockMessage: 'Bạn đã trồng 10 cây! Nông trại của bạn sắp thành phố rồi! 🌾'
    },
    {
        id: 'plants_50',
        name: '🌳 Tỷ Phú Xanh',
        description: 'Trồng 50 cây',
        icon: '🌳',
        color: '#15803d',
        category: 'engagement',
        points: 80,
        rarity: 'epic',
        condition: { type: 'plants_planted', value: 50, operator: '>=' },
        unlockMessage: 'Wow! Bạn đã trồng 50 cây! Nông trại của bạn giờ là một rừng đêm thực sự! 🌳'
    },
    {
        id: 'first_harvest',
        name: '🍎 Vào Mùa Thu Hoạch',
        description: 'Thu hoạch cây đầu tiên',
        icon: '🍎',
        color: '#dc2626',
        category: 'engagement',
        points: 15,
        rarity: 'common',
        condition: { type: 'plants_harvested', value: 1, operator: '>=' },
        unlockMessage: 'Bạn đã thu hoạch cây đầu tiên! Công lao của bạn đã được ghi nhận! 🍎'
    },
    {
        id: 'harvest_100',
        name: '🌽 Nông Dân Vàng',
        description: 'Thu hoạch 100 lần',
        icon: '🌽',
        color: '#d97706',
        category: 'engagement',
        points: 75,
        rarity: 'epic',
        condition: { type: 'plants_harvested', value: 100, operator: '>=' },
        unlockMessage: 'Bạn đã thu hoạch 100 lần! Bạn là một nông dân chuyên nghiệp! 🌽'
    },
    {
        id: 'gold_1000',
        name: '💰 Nhà Giàu Nông Trại',
        description: 'Thu thập 1000 vàng từ nông trại',
        icon: '💰',
        color: '#fbbf24',
        category: 'engagement',
        points: 60,
        rarity: 'epic',
        condition: { type: 'gold_collected', value: 1000, operator: '>=' },
        unlockMessage: 'Bạn đã thu thập 1000 vàng! Bạn giàu có rồi! 💰'
    },
    {
        id: 'watered_100',
        name: '💧 Tưới Cây Siêu Nhân',
        description: 'Tưới nước 100 lần',
        icon: '💧',
        color: '#06b6d4',
        category: 'engagement',
        points: 40,
        rarity: 'rare',
        condition: { type: 'plants_watered', value: 100, operator: '>=' },
        unlockMessage: 'Bạn đã tưới nước 100 lần! Cây cối của bạn thực sự may mắn! 💧'
    },

    // Milestone
    {
        id: 'community_join',
        name: '👥 Gia Nhập Cộng Đồng',
        description: 'Gia nhập cộng đồng học tập',
        icon: '👥',
        color: '#3b82f6',
        category: 'social',
        points: 20,
        rarity: 'common',
        condition: { type: 'custom', value: 1, operator: '>=' },
        unlockMessage: 'Chào mừng bạn gia nhập cộng đồng! Hãy cùng nhau học tập! 👥'
    },
    {
        id: 'first_login',
        name: '✨ Lần Đầu Bước Vào',
        description: 'Đăng nhập lần đầu tiên',
        icon: '✨',
        color: '#a855f7',
        category: 'milestone',
        points: 5,
        rarity: 'common',
        condition: { type: 'custom', value: 1, operator: '>=' },
        unlockMessage: 'Bạn đã bắt đầu hành trình của mình! Vui vẻ lên! ✨'
    },
    {
        id: 'level_10',
        name: '🎖️ Cảnh Giới Cao Thượng',
        description: 'Đạt level 10',
        icon: '🎖️',
        color: '#f59e0b',
        category: 'milestone',
        points: 150,
        rarity: 'epic',
        condition: { type: 'custom', value: 10, operator: '>=' },
        unlockMessage: 'Bạn đã đạt level 10! Bạn đang tiến bộ đáng kể! 🎖️'
    },
    {
        id: 'decoration_master',
        name: '🎨 Nghệ Sĩ Trang Trí',
        description: 'Đặt 20 vật trang trí',
        icon: '🎨',
        color: '#ec4899',
        category: 'engagement',
        points: 50,
        rarity: 'rare',
        condition: { type: 'decorations_placed', value: 20, operator: '>=' },
        unlockMessage: 'Bạn là một nghệ sĩ trang trí! Nông trại của bạn thật tuyệt vời! 🎨'
    }

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
        console.log('  Milestone:', ACHIEVEMENTS.filter(a => a.category === 'milestone').length);

        process.exit(0);
    } catch (err) {
        console.error('❌ Lỗi:', err.message);
        process.exit(1);
    }
}

seedAchievements();
