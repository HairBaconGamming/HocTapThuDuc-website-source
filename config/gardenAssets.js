module.exports = {
    PLANTS: {
        'sunflower': {
            name: 'Hướng Dương',
            type: 'plant',
            price: 50,
            maxStage: 3,
            harvestIcon: 'https://i.ibb.co/8njCfQ4K/image-removebg-preview-14.png',
            rewardGold: { min: 60, max: 90 },
            unlockLevel: 1,
            rewardXP: 30,
            size: { w: 1, h: 1 },
            growthTime: '5 phút/cấp',
            totalTime: '20 phút',
            witherTime: '72 giờ', 
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
            harvestIcon: 'https://i.ibb.co/S4dVNQLx/image-removebg-preview-12.png',
            rewardGold: { min: 100, max: 140 },
            unlockLevel: 3,
            rewardXP: 100,
            size: { w: 1, h: 1 },
            growthTime: '6 phút/cấp',
            totalTime: '30 phút',
            witherTime: '48 giờ',
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
            harvestIcon: 'https://i.ibb.co/v66pYDv8/Gemini-Generated-Image-puwglepuwglepuwg-removebg-preview.png',
            rewardGold: { min: 300, max: 500 },
            unlockLevel: 8,
            rewardXP: 600,
            size: { w: 1, h: 1 },
            growthTime: '15 phút/cấp',
            totalTime: '60 phút',
            witherTime: '96 giờ',
            stages: [
                'https://i.ibb.co/M5cGgrn7/Gemini-Generated-Image-n7bna6n7bna6n7bn-removebg-preview.png',
                'https://i.ibb.co/KzcfKq8T/Gemini-Generated-Image-h8vwrzh8vwrzh8vw-removebg-preview.png',
                'https://i.ibb.co/whVQmRxN/Gemini-Generated-Image-vs7ybovs7ybovs7y-removebg-preview.png',
                'https://i.ibb.co/KpCwqjWz/Gemini-Generated-Image-2vhht92vhht92vhh-removebg-preview.png'
            ]
        },
        'tomato': {
            name: 'Cà Chua',
            type: 'plant',
            price: 2500,
            maxStage: 7,
            harvestIcon: 'https://i.ibb.co/3yj0KTb6/image-removebg-preview-10.png',
            afterharvestStage: 3,
            rewardGold: { min: 500, max: 600 },
            unlockLevel: 15,
            rewardXP: 2500,
            size: { w: 1, h: 1 },
            growthTime: '10 phút/cấp',
            totalTime: '70 phút',
            witherTime: '120 giờ',
            isMultiHarvest: true,
            stages: [
                'https://i.ibb.co/5yZqtnn/stage0.png',
                'https://i.ibb.co/tPkvJvdJ/stage1-removebg-preview.png',
                'https://i.ibb.co/pmNGxYc/stage2-removebg-preview.png',
                'https://i.ibb.co/VcwJcfn3/stage3-removebg-preview.png',
                'https://i.ibb.co/bYZD01M/flowering-removebg-preview.png',
                'https://i.ibb.co/MySkCjCC/fruit-early-removebg-preview.png',
                'https://i.ibb.co/S1fMKqw/fruit-middle-removebg-preview.png',
                'https://i.ibb.co/KRdHSc9/fruit-ripe-removebg-preview.png'
            ]
        },
        'watermelon': {
            name: 'Dưa Hấu',
            type: 'plant',
            price: 10000,
            maxStage: 5, // Có 6 trạng thái (0, 1, 2, 3, 4, 5)
            afterharvestStage: 4, 
            isMultiHarvest: true, 
            harvestIcon: 'https://i.ibb.co/CdjJ36Y/image-removebg-preview-26.png',
            rewardGold: { min: 3500, max: 5000 },
            unlockLevel: 21,
            rewardXP: 30000,
            size: { w: 1, h: 1 }, 
            growthTime: '72 phút/cấp', // 72 x 5 = 360 phút (6 tiếng)
            totalTime: '360 phút',
            witherTime: '1440 phút', // Héo sau 24 tiếng nếu không thu hoạch
            stages: [
                'https://i.ibb.co/RmYQMCr/image-removebg-preview-20.png', // Hạt
                'https://i.ibb.co/N291bTVq/image-removebg-preview-21.png', // Mầm
                'https://i.ibb.co/vSYSVFD/image-removebg-preview-22.png', // Dây non
                'https://i.ibb.co/5xtH4khH/image-removebg-preview-23.png', // Ra hoa
                'https://i.ibb.co/vCB8Z91T/image-removebg-preview-24.png', // Quả non
                'https://i.ibb.co/4wN56tZL/image-removebg-preview-25.png'  // Quả chín (Thu hoạch)
            ]
        },
        'chili_pepper': {
            name: 'Ớt Siêu Cay',
            type: 'plant',
            price: 15000,           // Giá hạt giống khá cao để tạo rủi ro
            maxStage: 4,            // 5 trạng thái (0 đến 4)
            afterharvestStage: 2, 
            isMultiHarvest: true,  // Chỉ thu hoạch 1 lần
            harvestIcon: 'https://i.ibb.co/Sw9HLkwf/image-removebg-preview-32.png',
            
            // Phần thưởng cực khủng so với thời gian bỏ ra
            rewardGold: { min: 900, max: 1800 }, 
            rewardXP: 15000,
            
            unlockLevel: 23,        // Yêu cầu Level 25
            size: { w: 1, h: 1 }, 
            
            growthTime: '5 phút/cấp', // 5 x 4 = 20 phút (Lớn cực nhanh)
            totalTime: '20 phút',
            
            // ĐIỂM NHẤN: Thời gian héo siêu ngắn
            witherTime: '1440 phút', // Chỉ có đúng 5 phút để thu hoạch sau khi chín!
            
            stages: [
                'https://i.ibb.co/FqqQtwdB/image-removebg-preview-27.png', // Hạt giống
                'https://i.ibb.co/FqyxJwd8/image-removebg-preview-29.png', // Nảy mầm
                'https://i.ibb.co/Xfs8NhYQ/image-removebg-preview-28.png', // Bụi lá
                'https://i.ibb.co/0RzbSQkp/image-removebg-preview-30.png', // Quả xanh
                'https://i.ibb.co/PZGXYLzt/image-removebg-preview-31.png'  // Quả đỏ (Thu hoạch)
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
            water:  { name: 'Tưới', icon: 'https://hoctapthuduc.onrender.com/api/pro-images/1767290687212-2rlhp4.png' },
            basket: { name: 'Thu',  icon: '/api/pro-images/1767284874328-507gk3.png' },
            move:   { name: 'Di chuyển',  icon: '/api/pro-images/1767370869321-kpc8y0.png' }
        }
    },
    UI: {
        resourceIcons: {
            water: 'https://hoctapthuduc.onrender.com/api/pro-images/1767290687212-2rlhp4.png',
            fertilizer: 'https://i.ibb.co/23KTJtgc/phan-bon.png',
            gold: 'https://i.ibb.co/WWYTbQxD/image-removebg-preview-11.png'
        },
        harvestIcons: {
            sunflower: 'https://i.ibb.co/8njCfQ4K/image-removebg-preview-14.png',
            wheat: 'https://i.ibb.co/S4dVNQLx/image-removebg-preview-12.png',
            carrot: 'https://i.ibb.co/v66pYDv8/Gemini-Generated-Image-puwglepuwglepuwg-removebg-preview.png',
            tomato: 'https://i.ibb.co/3yj0KTb6/image-removebg-preview-10.png'
        }
    },
    DECORS: {}
};
