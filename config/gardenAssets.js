module.exports = {
    PLANTS: {
        'sunflower': {
            name: 'Hướng Dương',
            type: 'plant',
            price: 50,
            maxStage: 3,
            waterNeeded: 6,
            rewardGold: { min: 60, max: 90 },
            
            // [MỚI] Cấu hình Level
            unlockLevel: 1,  // Cấp 1 trồng được ngay
            rewardXP: 15,    // Thu hoạch được 15 XP
            
            size: { w: 1, h: 1 },
            growthTime: '5 phút/cấp',
            totalTime: '20 phút',
            witherTime: '5 phút', 
            stages: [
                '/api/pro-images/1767282830562-cb26a4.png',
                '/api/pro-images/1767283026974-wmnw2v.png',
                '/api/pro-images/1767283134884-rk2iu1.png',
                '/api/pro-images/1767283174918-vvfz7i.png'
            ]
        },
        'wheat': {
            name: 'Lúa Mì',
            type: 'plant',
            price: 60,
            maxStage: 4,
            waterNeeded: 4,
            rewardGold: { min: 70, max: 100 },
            
            // [MỚI] Yêu cầu cấp 3 mới mua được
            unlockLevel: 3,
            rewardXP: 30,    // Thu hoạch được nhiều XP hơn
            
            size: { w: 1, h: 1 },
            growthTime: '4 phút/cấp',
            totalTime: '20 phút',
            witherTime: '3 phút',
            stages: [
                '/api/pro-images/1767344323984-uvbj9k.png',
                '/api/pro-images/1767344484389-wozd1r.png',
                '/api/pro-images/1767344718200-ri0b40.png',
                '/api/pro-images/1767344776642-rd3z59.png',
                '/api/pro-images/1767344824123-375yyj.png'
            ]
        }
    },
    // ... (Giữ nguyên phần còn lại)
    BACKGROUNDS: { default: { name: 'Nông Trại Xanh', textureUrl: '/api/pro-images/1767279348273-pugf3p.png', color: '#4caf50' } },
    FARMING: {
        soil_dry: '/api/pro-images/1767279361492-y0oaxm.png',
        soil_wet: '/api/pro-images/1767279364836-nzvgqf.png',
        tools: {
            cursor: { name: 'Tay', icon: '/api/pro-images/1767279404345-i1iil1.png' },
            hoe:    { name: 'Cuốc', icon: '/api/pro-images/1767279674003-ce1uok.png' },
            shovel: { name: 'Xẻng', icon: '/api/pro-images/1767282498111-ptuhwu.png' },
            water:  { name: 'Tưới', icon: '/api/pro-images/1767284837348-1o2riz.png' },
            basket: { name: 'Thu',  icon: '/api/pro-images/1767284874328-507gk3.png' }
        }
    },
    DECORS: {}
};