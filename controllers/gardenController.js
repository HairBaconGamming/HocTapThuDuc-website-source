const Garden = require('../models/Garden');
const ASSETS = require('../config/gardenAssets');

// Giá đất cơ bản
const PLOT_BASE_PRICE = 50;

// Helper: Đổi thời gian config sang mili-giây
function parseDuration(str) {
    if (!str) return 24 * 60 * 60 * 1000; // Mặc định 1 ngày
    const num = parseInt(str);
    if (str.includes('phút')) return num * 60 * 1000;
    if (str.includes('giờ')) return num * 3600000;
    return num * 60000; // Mặc định là phút
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
        if (item.isDead) return; // Chết rồi thì thôi

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

                // LOGIC LỚN & HÉO
                if (isWet) {
                    // Có nước -> Lớn lên & Hồi phục
                    if (item.stage < config.maxStage) {
                        // [FIX] Bỏ nhân 2, chỉ cộng deltaTime chuẩn (1x)
                        item.growthProgress = (item.growthProgress || 0) + deltaTime;

                        // Tính Stage
                        const timePerStage = parseDuration(config.growthTime);
                        const calculatedStage = Math.floor(item.growthProgress / timePerStage);
                        item.stage = Math.min(calculatedStage, config.maxStage);
                    }
                    // Giảm héo
                    if (item.witherProgress > 0) {
                        item.witherProgress = Math.max(0, item.witherProgress - deltaTime);
                    }
                } else {
                    // Không nước -> Héo (Giữ nguyên)
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
            isOwner: true, // [MỚI] Xác nhận là chủ nhà
            assets: ASSETS
        });
    } catch (err) {
        console.error(err);
        res.redirect('/');
    }
};

exports.buyItem = async (req, res) => {
    try {
        const { itemId, type, x, y } = req.body;
        const garden = await Garden.findOne({ user: req.user._id });

        await syncGardenState(garden);

        // --- A. XỬ LÝ MUA ĐẤT (PLOT) - GIÁ TĂNG DẦN ---
        if (type === 'plot') {
            // 1. Đếm số ô đất hiện có
            const currentPlots = garden.items.filter(i => i.type === 'plot').length;
            
            // 2. Tính giá theo cấp số nhân 1.15 (Làm tròn lên)
            // Công thức: Giá = Giá Gốc * (1.15 ^ Số lượng hiện tại)
            const plotPrice = Math.ceil(PLOT_BASE_PRICE * Math.pow(1.005, currentPlots));

            // 3. Kiểm tra tiền
            if (garden.gold < plotPrice) {
                return res.json({ success: false, msg: `Cần ${plotPrice} vàng để mở rộng ô đất tiếp theo!` });
            }

            // 4. Trừ tiền và Thêm đất
            garden.gold -= plotPrice;
            
            const newPlot = {
                type: 'plot',
                itemId: 'soil_tile',
                x: x, 
                y: y,
                waterCount: 0
            };
            garden.items.push(newPlot);
            await garden.save();
            
            return res.json({ 
                success: true, 
                msg: `Mở rộng đất (-${plotPrice} vàng)`, 
                item: garden.items[garden.items.length - 1],
                newGold: garden.gold
            });
        }

        // --- B. CÁC LOẠI KHÁC (GIỮ NGUYÊN) ---
        let itemConfig, category;
        if (type === 'plant') { itemConfig = ASSETS.PLANTS[itemId]; category = 'plant'; }
        else if (type === 'decoration') { itemConfig = ASSETS.DECORS[itemId]; category = 'decoration'; }

        // ... (Logic check tiền và trừ tiền như cũ) ...
        if (!itemConfig) return res.json({ success: false, msg: 'Vật phẩm lỗi' });
        if (garden.gold < itemConfig.price) return res.json({ success: false, msg: 'Không đủ vàng' });

        // [MỚI] Ràng buộc: Cây phải trồng trên đất
        if (type === 'plant') {
            const hasPlot = garden.items.some(i => i.type === 'plot' && i.x === x && i.y === y);
            if (!hasPlot) {
                return res.json({ success: false, msg: 'Phải cuốc đất trước khi trồng cây!' });
            }
            // Không trồng đè lên cây khác (Backend check kỹ hơn)
            const hasPlant = garden.items.some(i => i.type !== 'plot' && i.x === x && i.y === y);
            if (hasPlant) return res.json({ success: false, msg: 'Ô đất này đã có cây!' });
        }

        garden.gold -= itemConfig.price;

        const newItem = {
            type: type === 'plot' ? 'plot' : (type === 'plant' ? 'plant' : 'decoration'),
            itemId: itemId,
            x: x, y: y,
            stage: 0,
            growthProgress: 0, // Reset progress
            witherProgress: 0,
            isDead: false,
            lastWatered: null, // Mới mua đất thì khô
            lastUpdated: new Date(),
            plantedAt: new Date()
        };
        garden.items.push(newItem);
        await garden.save();

        res.json({
            success: true,
            msg: `Đã mua ${itemConfig.name}`,
            newGold: garden.gold,
            item: garden.items[garden.items.length - 1]
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, msg: 'Lỗi Server' });
    }
};

// Di chuyển (Lưu vị trí)
exports.moveItem = async (req, res) => {
    try {
        const { uniqueId, x, y } = req.body;
        // Update trong mảng items dựa trên _id
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
        
        // Sync trạng thái trước
        await syncGardenState(garden);

        const item = garden.items.id(uniqueId);
        if (!item) return res.json({ success: false, msg: 'Lỗi vật phẩm' });

        // --- TƯỚI NƯỚC (Interact vào Cây hoặc Đất) ---
        if (action === 'water') {
            // Tìm ô đất tại vị trí đó (nếu đang click vào cây)
            let plot = item;
            if (item.type !== 'plot') {
                plot = garden.items.find(i => i.type === 'plot' && i.x === item.x && i.y === item.y);
            }

            if (plot) {
                plot.lastWatered = new Date(); // Cập nhật thời gian tưới
                // [MỚI] Reset héo khi tưới
                if (item.type === 'plant') {
                    item.witherProgress = 0;
                }
                await garden.save();
                return res.json({ success: true, msg: 'Đã tưới nước (Ẩm 24h)', item: item, evolved: false });
            }
        }

        // --- THU HOẠCH ---
        if (action === 'harvest') {
            const plantConfig = ASSETS.PLANTS[item.itemId];
            if (item.stage < plantConfig.maxStage) return res.json({ success: false, msg: 'Cây chưa chín!' });

            // Random vàng thưởng
            const reward = Math.floor(Math.random() * (plantConfig.rewardGold.max - plantConfig.rewardGold.min)) + plantConfig.rewardGold.min;
            garden.gold += reward;

            // Xóa cây (Giữ lại đất)
            garden.items.pull(uniqueId);
            await garden.save();

            return res.json({ success: true, newGold: garden.gold, goldReward: reward, msg: `Thu hoạch +${reward} vàng!` });
        }

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// Xóa vật phẩm (Xẻng)
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
        // Chỉ cập nhật nếu bước mới lớn hơn bước hiện tại
        await Garden.updateOne(
            { user: req.user._id, tutorialStep: { $lt: step } },
            { $set: { tutorialStep: step } }
        );
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false });
    }
};

// Lưu vị trí camera
exports.saveCamera = async (req, res) => {
    try {
        const { x, y, zoom } = req.body;
        await Garden.updateOne(
            { user: req.user._id },
            { $set: { 'camera.x': x, 'camera.y': y, 'camera.zoom': zoom } }
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false });
    }
};

// [MỚI] Thăm vườn người khác
exports.visitGarden = async (req, res) => {
    try {
        const targetUserId = req.params.userId;
        
        // 1. Kiểm tra xem có đang thăm chính mình không
        if (req.user._id.toString() === targetUserId) {
            return res.redirect('/my-garden');
        }

        // 2. Tìm vườn của người đó
        const garden = await Garden.findOne({ user: targetUserId }).populate('user', 'username');
        
        // Nếu họ chưa có vườn
        if (!garden) {
            return res.render('error', { message: 'Người chơi này chưa kích hoạt vườn!' });
        }

        // 3. Đồng bộ trạng thái cây (để hiển thị đúng level/héo)
        await syncGardenState(garden);

        // 4. Render với cờ isOwner = false
        res.render('garden', { 
            title: `Vườn của ${garden.user.username}`, 
            user: req.user,      // Người đang xem (để hiển thị header)
            garden: garden,      // Dữ liệu vườn của người kia
            ownerName: garden.user.username, // Tên chủ vườn
            isOwner: false,      // Quan trọng: Đánh dấu là khách
            assets: ASSETS
        });

    } catch (err) {
        console.error(err);
        res.redirect('/');
    }
};