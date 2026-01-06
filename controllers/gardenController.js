const Garden = require('../models/Garden');
const User = require('../models/User'); // [QUAN TRỌNG] Import User để cộng XP
const ASSETS = require('../config/gardenAssets');
const LevelUtils = require('../utils/level');

// Giá đất cơ bản
const PLOT_BASE_PRICE = 50;

// Helper: Đổi thời gian config sang mili-giây
function parseDuration(str) {
    if (!str) return 24 * 60 * 60 * 1000;
    const num = parseInt(str);
    if (str.includes('phút')) return num * 60 * 1000;
    if (str.includes('giờ')) return num * 3600000;
    return num * 60000;
}

// === LOGIC SINH TRƯỞNG & HÉO ===
async function syncGardenState(garden) {
    const now = new Date();
    const MOISTURE_DURATION = 24 * 60 * 60 * 1000; // 24h

    // Map đất
    const plotMap = {};
    garden.items.forEach(item => {
        if (item.type === 'plot') plotMap[`${item.x},${item.y}`] = item;
    });

    garden.items.forEach(item => {
        if (item.isDead) return;

        const lastTime = item.lastUpdated ? new Date(item.lastUpdated).getTime() : new Date(item.plantedAt).getTime();
        const currentTime = now.getTime();
        const deltaTime = currentTime - lastTime;

        // 1. Cập nhật Đất
        if (item.type === 'plot' && item.lastWatered) {
            const wateredTime = new Date(item.lastWatered).getTime();
            if (currentTime - wateredTime > MOISTURE_DURATION) item.lastWatered = null;
        }

        // 2. Cập nhật Cây
        else if (item.type === 'plant') {
            const config = ASSETS.PLANTS[item.itemId];
            if (config) {
                const plot = plotMap[`${item.x},${item.y}`];
                const isWet = (plot && plot.lastWatered);

                if (isWet) {
                    // Có nước -> Lớn lên & Hồi phục
                    if (item.stage < config.maxStage) {
                        item.growthProgress = (item.growthProgress || 0) + deltaTime;
                        const timePerStage = parseDuration(config.growthTime);
                        const calculatedStage = Math.floor(item.growthProgress / timePerStage);
                        item.stage = Math.min(calculatedStage, config.maxStage);
                    }
                    // Giảm héo
                    if (item.witherProgress > 0) {
                        item.witherProgress = Math.max(0, item.witherProgress - deltaTime);
                    }
                } else {
                    // Không nước -> Héo
                    if (item.stage > 0) {
                        item.witherProgress = (item.witherProgress || 0) + deltaTime;
                        const maxWither = parseDuration(config.witherTime || '30 phút');
                        if (item.witherProgress >= maxWither) item.isDead = true;
                    }
                }
            }
        }
        item.lastUpdated = now;
    });

    await garden.save();
}

// [FIX] Hàm chuẩn hóa dữ liệu (Adapter)
// Map dữ liệu từ LevelUtils sang format mà Frontend (EJS/Phaser) đang đợi
function getLevelViewData(user) {
    const info = LevelUtils.getLevelInfo(user.level, user.xp);
    return {
        level: user.level,
        currentXP: info.currentXP,       // User XP hiện tại
        nextLevelXP: info.requiredXP,    // XP cần lên cấp (Từ file utils của bạn là requiredXP)
        levelName: info.fullName         // Tên cảnh giới (VD: Luyện Khí Tầng 1)
    };
}

exports.getGarden = async (req, res) => {
    try {
        let garden = await Garden.findOne({ user: req.user._id }).populate('user');
        if (!garden) garden = await new Garden({ user: req.user._id }).save();
        await syncGardenState(garden);

        // Lấy thông tin level chuẩn
        const levelData = getLevelViewData(req.user);

        // Merge vào gardenData để EJS render
        const gardenData = {
            ...garden.toObject(),
            userLevel: levelData.level,
            currentXP: levelData.currentXP,
            nextLevelXP: levelData.nextLevelXP,
            levelName: levelData.levelName,
            ownerName: req.user.username
        };

        res.render('garden', { 
            title: 'Nông Trại Vui Vẻ', 
            user: req.user, 
            garden: gardenData, 
            isOwner: true, 
            assets: ASSETS
        });
    } catch (err) {
        console.error(err);
        res.redirect('/');
    }
};

// Mua vật phẩm
exports.buyItem = async (req, res) => {
    try {
        const { itemId, type, x, y } = req.body;
        const garden = await Garden.findOne({ user: req.user._id });
        const user = await User.findById(req.user._id); // Lấy User để check Level

        await syncGardenState(garden);

        // --- A. MUA ĐẤT ---
        if (type === 'plot') {
            const currentPlots = garden.items.filter(i => i.type === 'plot').length;
            const plotPrice = Math.ceil(PLOT_BASE_PRICE * Math.pow(1.005, currentPlots));

            if (garden.gold < plotPrice) {
                return res.json({ success: false, msg: `Cần ${plotPrice} vàng để mở rộng!` });
            }

            garden.gold -= plotPrice;
            const newPlot = { type: 'plot', itemId: 'soil_tile', x: x, y: y, waterCount: 0 };
            garden.items.push(newPlot);
            await garden.save();
            
            return res.json({ success: true, msg: `Mở rộng đất (-${plotPrice} vàng)`, item: garden.items[garden.items.length - 1], newGold: garden.gold });
        }

        // --- B. CÁC LOẠI KHÁC ---
        let itemConfig;
        if (type === 'plant') { itemConfig = ASSETS.PLANTS[itemId]; }
        else if (type === 'decoration') { itemConfig = ASSETS.DECORS[itemId]; }

        if (!itemConfig) return res.json({ success: false, msg: 'Vật phẩm lỗi' });

        // [MỚI] CHECK LEVEL
        if (itemConfig.unlockLevel && (user.level || 1) < itemConfig.unlockLevel) {
            return res.json({ success: false, msg: `Cần Level ${itemConfig.unlockLevel} để mua cây này! 🌱` });
        }

        if (garden.gold < itemConfig.price) return res.json({ success: false, msg: 'Không đủ vàng' });

        // Ràng buộc vị trí
        if (type === 'plant') {
            const hasPlot = garden.items.some(i => i.type === 'plot' && i.x === x && i.y === y);
            if (!hasPlot) return res.json({ success: false, msg: 'Phải cuốc đất trước!' });
            const hasPlant = garden.items.some(i => i.type !== 'plot' && i.x === x && i.y === y);
            if (hasPlant) return res.json({ success: false, msg: 'Ô đất này đã có cây!' });
        }

        garden.gold -= itemConfig.price;

        const newItem = {
            type: type === 'plot' ? 'plot' : (type === 'plant' ? 'plant' : 'decoration'),
            itemId: itemId,
            x: x, y: y,
            stage: 0, growthProgress: 0, witherProgress: 0,
            isDead: false, lastWatered: null,
            lastUpdated: new Date(), plantedAt: new Date()
        };
        garden.items.push(newItem);
        await garden.save();

        res.json({ success: true, msg: `Đã mua ${itemConfig.name}`, newGold: garden.gold, item: garden.items[garden.items.length - 1] });

    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, msg: 'Lỗi Server' });
    }
};

// Di chuyển
exports.moveItem = async (req, res) => {
    try {
        const { uniqueId, x, y } = req.body;
        await Garden.updateOne(
            { user: req.user._id, "items._id": uniqueId },
            { $set: { "items.$.x": x, "items.$.y": y } }
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// Tương tác (Tưới / Thu hoạch)
exports.interactItem = async (req, res) => {
    try {
        const { uniqueId, action } = req.body;
        
        // 1. Luôn load vườn của NGƯỜI ĐANG ĐĂNG NHẬP
        // Điều này đảm bảo User A không bao giờ tác động được vào vườn User B
        let garden = await Garden.findOne({ user: req.user._id });
        
        if (!garden) {
            // Trường hợp hy hữu: User chưa có vườn nhưng cố gọi API
            return res.status(404).json({ success: false, msg: 'Bạn chưa có vườn!' });
        }

        await syncGardenState(garden);

        // 2. Tìm item trong vườn CỦA CHÍNH MÌNH
        const item = garden.items.id(uniqueId);
        
        // Nếu uniqueId là của vườn người khác, dòng trên sẽ trả về null -> An toàn tuyệt đối
        if (!item) {
            return res.status(404).json({ success: false, msg: 'Vật phẩm không tồn tại hoặc không thuộc về bạn!' });
        }

        // --- TƯỚI NƯỚC ---
        if (action === 'water') {
            if (garden.water <= 0) return res.json({ success: false, msg: 'Hết nước rồi! 💦' });

            let plot = item;
            if (item.type !== 'plot') {
                plot = garden.items.find(i => i.type === 'plot' && i.x === item.x && i.y === item.y);
            }

            if (plot) {
                garden.water = Math.max(0, garden.water - 1); // Trừ nước
                plot.lastWatered = new Date();
                if (item.type === 'plant') item.witherProgress = 0;
                
                await garden.save();
                return res.json({ success: true, msg: 'Đã tưới nước (Ẩm 24h)', item: item, newWater: garden.water });
            }
        }

        // --- THU HOẠCH ---
        if (action === 'harvest') {
            const config = ASSETS.PLANTS[item.itemId];
            if (item.stage < config.maxStage) return res.json({ success: false, msg: 'Chưa chín!' });

            const rewardGold = Math.floor(Math.random() * (config.rewardGold.max - config.rewardGold.min)) + config.rewardGold.min;
            garden.gold += rewardGold;

            const user = await User.findById(req.user._id);
            const rewardXP = config.rewardXP || 10;
            
            // Tính toán Level Up bằng file utils của bạn
            const levelResult = LevelUtils.calculateLevelUp(user.level, user.xp, rewardXP);
            user.level = levelResult.newLevel;
            user.xp = levelResult.newXP;
            await user.save();

            // Lấy info mới nhất để trả về cho Frontend update thanh bar
            const nextLevelInfo = LevelUtils.getLevelInfo(user.level, user.xp);

            garden.items.pull(uniqueId);
            await garden.save();

            return res.json({ 
                success: true, 
                newGold: garden.gold, 
                goldReward: rewardGold, xpReward: rewardXP,
                // Data chuẩn form cho hàm updateHUD bên Phaser
                levelData: {
                    level: user.level,
                    currentXP: nextLevelInfo.currentXP, // Khớp với utils
                    nextLevelXP: nextLevelInfo.requiredXP, // Khớp với utils
                    levelName: nextLevelInfo.fullName,
                    hasLeveledUp: levelResult.hasLeveledUp
                },
                msg: `Thu hoạch: +${rewardGold}G, +${rewardXP}XP`
            });
        }

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// Xóa vật phẩm
exports.removeItem = async (req, res) => {
    try {
        const { uniqueId } = req.body;
        const garden = await Garden.findOne({ user: req.user._id });
        garden.items.pull(uniqueId);
        await garden.save();
        res.json({ success: true, msg: 'Đã dọn dẹp!' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.saveCamera = async (req, res) => {
    try {
        const { x, y, zoom } = req.body;
        await Garden.updateOne({ user: req.user._id }, { $set: { 'camera.x': x, 'camera.y': y, 'camera.zoom': zoom } });
        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false }); }
};

exports.visitGarden = async (req, res) => {
    try {
        const targetUserId = req.params.userId;
        if (req.user._id.toString() === targetUserId) return res.redirect('/my-garden');

        const garden = await Garden.findOne({ user: targetUserId }).populate('user');
        if (!garden) return res.render('error', { message: 'Vườn không tồn tại!' });

        // Lấy thông tin level của CHỦ VƯỜN
        const levelData = getLevelViewData(garden.user);

        const gardenData = {
            ...garden.toObject(),
            userLevel: levelData.level,
            currentXP: levelData.currentXP,
            nextLevelXP: levelData.nextLevelXP,
            levelName: levelData.levelName,
            ownerName: garden.user.username
        };

        res.render('garden', { 
            title: `Vườn của ${gardenData.ownerName}`, 
            user: req.user, 
            garden: gardenData,
            isOwner: false, 
            assets: ASSETS
        });
    } catch (err) { res.redirect('/'); }
};

// [NEW] Cập nhật tiến độ Tutorial
exports.updateTutorialStep = async (req, res) => {
    try {
        const { step } = req.body;
        // Cập nhật bước hiện tại
        await Garden.findOneAndUpdate(
            { user: req.user._id }, 
            { tutorialStep: step }
        );
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false });
    }
};