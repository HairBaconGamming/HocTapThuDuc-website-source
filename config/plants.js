// config/plants.js
module.exports = {
    sunflower: {
        id: 'sunflower',
        name: 'Hướng Dương',
        price: 50, // Giá mua hạt (Gold)
        maxStage: 3,
        waterNeededPerStage: 2, // Cần tưới 2 lần để lên cấp
        rewardGold: { min: 80, max: 120 }, // Thu hoạch được vàng
        exp: 20, // Điểm kinh nghiệm cho User
        icon: ['🌱', '🌿', '🪴', '🌻'] // Icon theo từng giai đoạn
    },
    rose: {
        id: 'rose',
        name: 'Hồng Nhung',
        price: 100,
        maxStage: 3,
        waterNeededPerStage: 3,
        rewardGold: { min: 150, max: 250 },
        exp: 50,
        icon: ['🌱', '🌿', '🥀', '🌹']
    },
    cactus: {
        id: 'cactus',
        name: 'Xương Rồng',
        price: 200,
        maxStage: 3,
        waterNeededPerStage: 5,
        rewardGold: { min: 300, max: 500 },
        exp: 100,
        icon: ['🌱', '🌵', '🌵', '🌵'] // Xương rồng có hoa ở level cuối
    }
};