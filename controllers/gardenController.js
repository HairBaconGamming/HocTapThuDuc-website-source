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

// Lấy dữ liệu vườn
exports.getGarden = async (req, res) => {
    try {
        let garden = await Garden.findOne({ user: req.user._id });
        if (!garden) garden = await new Garden({ user: req.user._id }).save();
        
        await syncGardenState(garden);

        res.render('garden', { 
            title: 'Nông Trại Vui Vẻ', 
            user: req.user, 
            garden,
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
        let garden = await Garden.findOne({ user: req.user._id });
        
        await syncGardenState(garden);

        const item = garden.items.id(uniqueId);
        if (!item) return res.json({ success: false, msg: 'Lỗi vật phẩm' });

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
            const plantConfig = ASSETS.PLANTS[item.itemId];
            if (item.stage < plantConfig.maxStage) return res.json({ success: false, msg: 'Cây chưa chín!' });

            // 1. Cộng Vàng
            const rewardGold = Math.floor(Math.random() * (plantConfig.rewardGold.max - plantConfig.rewardGold.min)) + plantConfig.rewardGold.min;
            garden.gold += rewardGold;

            // 2. [CẬP NHẬT] Cộng XP & Tính Level theo hệ thống Tu Tiên
            const user = await User.findById(req.user._id);
            const rewardXP = plantConfig.rewardXP || 10;
            
            // Sử dụng hàm tính toán chung
            const levelResult = LevelUtils.calculateLevelUp(user.level, user.xp, rewardXP);
            
            user.level = levelResult.newLevel;
            user.xp = levelResult.newXP;
            
            // Lấy thông tin hiển thị
            const levelInfo = LevelUtils.getLevelInfo(user.level, user.xp);
            
            let levelUpMsg = "";
            if (levelResult.hasLeveledUp) {
                levelUpMsg = ` ⚡ ĐỘT PHÁ: ${levelInfo.fullName}!`;
            }
            
            await user.save();

            // Xóa cây
            garden.items.pull(uniqueId);
            await garden.save();

            return res.json({ 
                success: true, 
                newGold: garden.gold, 
                goldReward: rewardGold, 
                xpReward: rewardXP,
                // Trả về dữ liệu level để frontend hiển thị nếu cần
                levelData: {
                    level: user.level,
                    levelName: levelInfo.fullName,
                    hasLeveledUp: levelResult.hasLeveledUp
                },
                msg: `Thu hoạch: +${rewardGold} vàng, +${rewardXP} XP.${levelUpMsg}` 
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

exports.finishTutorialStep = async (req, res) => {
    try {
        const { step } = req.body;
        await Garden.updateOne({ user: req.user._id, tutorialStep: { $lt: step } }, { $set: { tutorialStep: step } });
        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false }); }
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

        const garden = await Garden.findOne({ user: targetUserId }).populate('user', 'username');
        if (!garden) return res.render('error', { message: 'Vườn không tồn tại!' });

        await syncGardenState(garden);

        res.render('garden', { 
            title: `Vườn của ${garden.user.username}`, 
            user: req.user, 
            garden: garden,
            ownerName: garden.user.username,
            isOwner: false, 
            assets: ASSETS
        });
    } catch (err) { res.redirect('/'); }
};