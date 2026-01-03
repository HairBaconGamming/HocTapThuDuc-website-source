module.exports = {
    PLANTS: {
        'sunflower': {
            name: 'Hướng Dương',
            type: 'plant',
            price: 50,
            maxStage: 3,
            waterNeeded: 6,
            rewardGold: { min: 60, max: 90 },
            unlockLevel: 1,
            rewardXP: 15,
            size: { w: 1, h: 1 },
            growthTime: '5 phút/cấp',
            totalTime: '20 phút',
            witherTime: '60 phút', 
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
            price: 30,
            maxStage: 4,
            waterNeeded: 4,
            rewardGold: { min: 50, max: 100 },
            unlockLevel: 3,
            rewardXP: 100,
            size: { w: 1, h: 1 },
            growthTime: '6 phút/cấp',
            totalTime: '30 phút',
            witherTime: '40 phút',
            stages: [
                '/api/pro-images/1767344323984-uvbj9k.png',
                '/api/pro-images/1767344484389-wozd1r.png',
                '/api/pro-images/1767344718200-ri0b40.png',
                '/api/pro-images/1767344776642-rd3z59.png',
                '/api/pro-images/1767344824123-375yyj.png'
            ]
        }
    },
    PLOT: { 
        grass: { 
            name: 'Nông Trại Xanh', 
            textureUrl: '/api/pro-images/1767377708115-b1zfji.png',
            size: { w: 1, h: 1 } // [FIX] Size 1:1
        } 
    },
    FARMING: {
        soil_dry: '/api/pro-images/1767375643675-ez178t.png',
        soil_wet: '/api/pro-images/1767375726624-st3zyo.png',
        tools: {
            cursor: { name: 'Tay', icon: '/api/pro-images/1767279404345-i1iil1.png' },
            hoe:    { name: 'Cuốc', icon: '/api/pro-images/1767279674003-ce1uok.png' },
            shovel: { name: 'Xẻng', icon: '/api/pro-images/1767282498111-ptuhwu.png' },
            water:  { name: 'Tưới', icon: '/api/pro-images/1767284837348-1o2riz.png' },
            basket: { name: 'Thu',  icon: '/api/pro-images/1767284874328-507gk3.png' },
            move:   { name: 'Di chuyển',  icon: '/api/pro-images/1767370869321-kpc8y0.png' }
        }
    },
    DECORS: {
        'bench': {
            name: 'Ghế Đá',
            type: 'decoration',
            price: 150,
            image: '/api/pro-images/1767379113193-dxtnjn.png', // Thay link ảnh của bạn
            size: { w: 1, h: 1 }, // Ghế dài 2 ô
            unlockLevel: 2
        },
    }
};