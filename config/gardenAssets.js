module.exports = {
    PLANTS: {
        'sunflower': {
            name: 'Hướng Dương',
            type: 'plant',
            price: 50,
            maxStage: 3,
            rewardGold: { min: 60, max: 90 },
            unlockLevel: 1,
            rewardXP: 30,
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
            price: 90,
            maxStage: 4,
            rewardGold: { min: 100, max: 140 },
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
        },
        'carrot': {
            name: 'Cà Rốt',
            type: 'plant',
            price: 250,
            maxStage: 3,
            rewardGold: { min: 300, max: 500 },
            unlockLevel: 8,
            rewardXP: 600,
            size: { w: 1, h: 1 },
            growthTime: '15 phút/cấp',
            totalTime: '60 phút',
            witherTime: '900 phút',
            stages: [
                'https://i.ibb.co/M5cGgrn7/Gemini-Generated-Image-n7bna6n7bna6n7bn-removebg-preview.png',
                'https://i.ibb.co/KzcfKq8T/Gemini-Generated-Image-h8vwrzh8vwrzh8vw-removebg-preview.png',
                'https://i.ibb.co/whVQmRxN/Gemini-Generated-Image-vs7ybovs7ybovs7y-removebg-preview.png',
                'https://i.ibb.co/KpCwqjWz/Gemini-Generated-Image-2vhht92vhht92vhh-removebg-preview.png'
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
    DECORS: {}
};