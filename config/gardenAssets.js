module.exports = {
    // 1. CÂY TRỒNG (PLANTS) - Giữ nguyên hoặc thêm cây mới tùy bạn
    PLANTS: {
        'sunflower': {
            name: 'Hướng Dương',
            type: 'plant',
            price: 50,
            waterNeeded: 3,
            maxStage: 3,
            rewardGold: { min: 60, max: 80 },
            size: { w: 1, h: 2 },
            stages: [
                'https://i.ytimg.com/vi/875z4ZVITEY/sddefault.jpg', // Hạt
                'https://opengameart.org/sites/default/files/Promo_1_0.png', // Mầm
                'https://img.freepik.com/premium-vector/vector-background-illustration-sunflower-growth-phases_284645-1465.jpg', // Lớn
                'https://www.shutterstock.com/image-vector/sunflower-life-cycle-infographic-plant-260nw-2194942567.jpg'  // Chín
            ]
        }
    },

    // 2. ĐỒ TRANG TRÍ (DECORS)
    DECORS: {
    },

    // 3. PHÔNG NỀN (BACKGROUNDS) - ĐÃ ĐIỀU CHỈNH
    // Lưu ý: textureUrl phải là ảnh có thể lặp lại (Seamless Pattern)
    BACKGROUNDS: {
        'default': { 
            name: 'Đồng Cỏ Xanh', 
            price: 10, 
            type: 'background', 
            // Ảnh hiện trong Shop
            image: 'https://i.ytimg.com/vi/9TlmBmMonIc/maxresdefault.jpg', 
            // Texture thật để load vào game (Dùng link raw github ổn định)
            textureUrl: 'https://i.ytimg.com/vi/9TlmBmMonIc/maxresdefault.jpg',
            color: '#4caf50' 
        },
        'soil': { 
            name: 'Đất Ruộng', 
            price: 50, 
            type: 'background', 
            image: 'https://i.ibb.co/1Y5YLJ8Q/Gemini-Generated-Image-sayk7zsayk7zsayk.png', 
            // Texture đất nâu
            textureUrl: 'https://i.ibb.co/1Y5YLJ8Q/Gemini-Generated-Image-sayk7zsayk7zsayk.png',
            color: '#5d4037' 
        },
    }
};