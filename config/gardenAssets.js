module.exports = {
    PLANTS: {
        'sunflower': {
            name: 'Hướng Dương',
            type: 'plant',
            price: 50,
            maxStage: 3,
            waterNeeded: 6,
            rewardGold: { min: 80, max: 120 },
            size: { w: 1, h: 1 },
            growthTime: '6 phút/cấp',
            totalTime: '24 phút',
            
            // [MỚI] Thời gian héo (Nếu không có nước quá lâu sẽ chết)
            witherTime: '5 phút', 
            
            stages: [
                '/api/pro-images/1767282830562-cb26a4.png',
                '/api/pro-images/1767283026974-wmnw2v.png',
                '/api/pro-images/1767283134884-rk2iu1.png',
                '/api/pro-images/1767283174918-vvfz7i.png'
            ]
        },
        // ... (Thêm witherTime cho các cây khác nếu muốn)
    },
    // ... (Các phần khác giữ nguyên)
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