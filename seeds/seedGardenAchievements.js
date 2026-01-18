// seeds/seedGardenAchievements.js
// Seed achievements liên quan đến garden (vườn)
require('dotenv').config();
const mongoose = require('mongoose');
const { AchievementType } = require('../models/Achievement');

const gardenAchievements = [
    {
        id: 'garden_first_plant',
        name: 'Nhà vườn mới tập sự',
        description: 'Trồng cây đầu tiên trong vườn',
        icon: '🌱',
        color: '#10b981',
        category: 'engagement',
        points: 15,
        rarity: 'common',
        condition: {
            type: 'plants_planted',
            value: 1,
            operator: '>='
        },
        unlockMessage: 'Tuyệt vời! Bạn đã trồng cây đầu tiên! Hãy chăm sóc nó! 🌱',
        isHidden: false,
        isActive: true
    },
    {
        id: 'garden_5_plants',
        name: 'Nhà vườn nhỏ',
        description: 'Trồng 5 cây trong vườn',
        icon: '🌿',
        color: '#059669',
        category: 'engagement',
        points: 30,
        rarity: 'common',
        condition: {
            type: 'plants_planted',
            value: 5,
            operator: '>='
        },
        unlockMessage: 'Xuất sắc! Bạn đã có 5 cây trong vườn! 🌿',
        isHidden: false,
        isActive: true
    },
    {
        id: 'garden_10_plants',
        name: 'Nhà vườn xinh đẹp',
        description: 'Trồng 10 cây trong vườn',
        icon: '🌳',
        color: '#047857',
        category: 'engagement',
        points: 50,
        rarity: 'rare',
        condition: {
            type: 'plants_planted',
            value: 10,
            operator: '>='
        },
        unlockMessage: 'Tuyệt vời! Vườn của bạn trở thành một khu vườn xinh đẹp! 🌳',
        isHidden: false,
        isActive: true
    },
    {
        id: 'garden_harvest_first',
        name: 'Thu hoạch đầu tiên',
        description: 'Thu hoạch cây trái lần đầu tiên',
        icon: '🌾',
        color: '#d97706',
        category: 'engagement',
        points: 25,
        rarity: 'common',
        condition: {
            type: 'plants_harvested',
            value: 1,
            operator: '>='
        },
        unlockMessage: 'Chúc mừng! Bạn đã thu hoạch thành công lần đầu! 🌾',
        isHidden: false,
        isActive: true
    },
    {
        id: 'garden_harvest_5',
        name: 'Nông dân chính thức',
        description: 'Thu hoạch 5 lần',
        icon: '🚜',
        color: '#b45309',
        category: 'engagement',
        points: 60,
        rarity: 'rare',
        condition: {
            type: 'plants_harvested',
            value: 5,
            operator: '>='
        },
        unlockMessage: 'Tuyệt vời! Bạn đã trở thành một nông dân chính thức! 🚜',
        isHidden: false,
        isActive: true
    },
    {
        id: 'garden_harvest_20',
        name: 'Chủ nhân trang trại',
        description: 'Thu hoạch 20 lần',
        icon: '🏡',
        color: '#92400e',
        category: 'engagement',
        points: 120,
        rarity: 'epic',
        condition: {
            type: 'plants_harvested',
            value: 20,
            operator: '>='
        },
        unlockMessage: 'Phi thường! Bạn là chủ nhân của một trang trại lớn! 🏡',
        isHidden: false,
        isActive: true
    },
    {
        id: 'garden_gold_collector',
        name: 'Nhà sưu tập vàng',
        description: 'Tích lũy 500 vàng từ vườn',
        icon: '🏆',
        color: '#fbbf24',
        category: 'engagement',
        points: 80,
        rarity: 'epic',
        condition: {
            type: 'gold_collected',
            value: 500,
            operator: '>='
        },
        unlockMessage: 'Tuyệt vời! Bạn đã tích lũy 500 vàng từ vườn! 🏆',
        isHidden: false,
        isActive: true
    },
    {
        id: 'garden_water_master',
        name: 'Thạc sĩ tưới cây',
        description: 'Tưới nước cho cây 20 lần',
        icon: '💧',
        color: '#0ea5e9',
        category: 'engagement',
        points: 40,
        rarity: 'rare',
        condition: {
            type: 'plants_watered',
            value: 20,
            operator: '>='
        },
        unlockMessage: 'Tuyệt vời! Bạn đã tưới nước cho cây 20 lần! Cây khỏe nhất làng! 💧',
        isHidden: false,
        isActive: true
    },
    {
        id: 'garden_no_wither',
        name: 'Chúa tể vườn xanh',
        description: 'Giữ cây không héo hon trong 10 ngày liên tiếp',
        icon: '👑',
        color: '#8b5cf6',
        category: 'challenge',
        points: 100,
        rarity: 'epic',
        condition: {
            type: 'plant_survival_streak',
            value: 10,
            operator: '>='
        },
        unlockMessage: 'Phi thường! Bạn đã giữ cây khỏe mạnh 10 ngày! Bạn là chúa tể vườn xanh! 👑',
        isHidden: false,
        isActive: true
    },
    {
        id: 'garden_golden_harvest',
        name: 'Vàng ơi vàng',
        description: 'Thu hoạch được 1000 vàng tổng cộng',
        icon: '💰',
        color: '#fcd34d',
        category: 'milestone',
        points: 150,
        rarity: 'legendary',
        condition: {
            type: 'gold_collected',
            value: 1000,
            operator: '>='
        },
        unlockMessage: 'Tuyệt vời! Bạn đã thu hoạch được 1000 vàng! Bạn là một nhà kinh tế giỏi! 💰',
        isHidden: false,
        isActive: true
    },
    {
        id: 'garden_decoration_master',
        name: 'Nghệ nhân trang trí',
        description: 'Trang trí vườn với 10 vật trang trí',
        icon: '🎨',
        color: '#ec4899',
        category: 'engagement',
        points: 70,
        rarity: 'rare',
        condition: {
            type: 'decorations_placed',
            value: 10,
            operator: '>='
        },
        unlockMessage: 'Tuyệt vời! Vườn bạn trở thành một kiệt tác nghệ thuật! 🎨',
        isHidden: false,
        isActive: true
    }
];

async function seedGardenAchievements() {
    try {
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb+srv://biesxiaolin:GgjBcJd8hz0maLl3@cluster0.4q4pw.mongodb.net/vocabulary_app?retryWrites=true&w=majority&appName=Cluster0');
        console.log('✓ Connected to MongoDB');

        for (const achievement of gardenAchievements) {
            const existing = await AchievementType.findOne({ id: achievement.id });
            if (!existing) {
                await AchievementType.create(achievement);
                console.log(`✓ Created achievement: ${achievement.name}`);
            } else {
                console.log(`✓ Achievement already exists: ${achievement.name}`);
            }
        }

        console.log('\n✅ Garden achievements seeding completed!');
        process.exit(0);
    } catch (err) {
        console.error('❌ Error seeding garden achievements:', err);
        process.exit(1);
    }
}

seedGardenAchievements();
