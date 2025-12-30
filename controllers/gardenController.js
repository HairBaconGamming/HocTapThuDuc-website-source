const Garden = require('../models/Garden');
const PLANT_TYPES = require('../config/plants'); // Giả sử bạn đã có file này
const ASSETS = require('../config/gardenAssets'); // Import file Assets

exports.getGarden = async (req, res) => {
    try {
        let garden = await Garden.findOne({ user: req.user._id });
        if (!garden) {
            garden = await new Garden({ user: req.user._id }).save();
        }
        
        // Truyền toàn bộ config sang view
        res.render('garden', { 
            title: 'Vườn Tri Thức', 
            user: req.user, 
            garden,
            assets: ASSETS, // Truyền assets
            activePage: 'garden'
        });
    } catch (err) {
        console.error(err);
        res.redirect('/');
    }
};

exports.buyAndPlace = async (req, res) => {
    try {
        const { itemId, type, x, y } = req.body;
        const garden = await Garden.findOne({ user: req.user._id });

        // Tìm item trong file config
        let itemConfig;
        if (type === 'plant') itemConfig = ASSETS.PLANTS[itemId];
        else if (type === 'decoration') itemConfig = ASSETS.DECORS[itemId];
        else if (type === 'background') itemConfig = ASSETS.BACKGROUNDS[itemId];

        if (!itemConfig) return res.json({ success: false, msg: 'Vật phẩm không tồn tại!' });
        if (garden.gold < itemConfig.price) return res.json({ success: false, msg: 'Không đủ vàng!' });

        // Logic mua Background
        if (type === 'background') {
            garden.gold -= itemConfig.price;
            garden.backgroundId = itemId;
            await garden.save();
            return res.json({ success: true, msg: `Đã đổi nền: ${itemConfig.name}`, newGold: garden.gold, isBackground: true, backgroundId: itemId });
        }

        // Logic mua Cây/Decor
        garden.gold -= itemConfig.price;
        garden.items.push({
            type: type,
            itemId: itemId,
            x: x || 50,
            y: y || 50
        });

        await garden.save();
        const newItem = garden.items[garden.items.length - 1];
        res.json({ success: true, msg: `Đã mua ${itemConfig.name}`, newGold: garden.gold, item: newItem });

    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// 3. Di chuyển vật phẩm (Lưu tọa độ mới)
exports.moveItem = async (req, res) => {
    try {
        const { uniqueId, x, y } = req.body;
        await Garden.updateOne(
            { user: req.user._id, "items._id": uniqueId },
            { 
                $set: { 
                    "items.$.x": x,
                    "items.$.y": y
                }
            }
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// 4. Tưới nước / Chăm sóc (Cập nhật logic cũ sang dùng uniqueId)
exports.interactItem = async (req, res) => {
    try {
        const { uniqueId, action } = req.body; // action: 'water', 'harvest', 'fertilizer'
        const garden = await Garden.findOne({ user: req.user._id });
        const item = garden.items.id(uniqueId);

        if (!item || item.type !== 'plant') return res.json({ success: false, msg: 'Vật thể không hợp lệ' });

        const plantConfig = PLANT_TYPES[item.itemId];

        // --- Logic cũ (Tưới nước) ---
        if (action === 'water') {
            if (garden.water <= 0) return res.json({ success: false, msg: 'Hết nước!' });
            
            garden.water--;
            item.waterCount++;
            
            let evolved = false;
            if (item.waterCount >= plantConfig.waterNeededPerStage && item.stage < plantConfig.maxStage) {
                item.stage++;
                item.waterCount = 0;
                evolved = true;
            }
            await garden.save();
            return res.json({ success: true, newWater: garden.water, item, evolved, msg: evolved ? 'Cây đã lớn!' : 'Đã tưới nước' });
        }

        // --- Logic cũ (Thu hoạch) ---
        if (action === 'harvest') {
            if (item.stage < plantConfig.maxStage) return res.json({ success: false, msg: 'Chưa chín!' });
            
            const goldReward = Math.floor(Math.random() * (plantConfig.rewardGold.max - plantConfig.rewardGold.min)) + plantConfig.rewardGold.min;
            garden.gold += goldReward;
            
            // Xóa cây sau khi thu hoạch
            garden.items.pull(uniqueId);
            
            await garden.save();
            return res.json({ success: true, newGold: garden.gold, msg: `Thu hoạch +${goldReward} vàng!`, removeId: uniqueId });
        }

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.buyItem = async (req, res) => {
    try {
        const { itemId, type, x, y } = req.body; 
        // x, y là toạ độ % (nếu là background thì không quan tâm x,y)

        const garden = await Garden.findOne({ user: req.user._id });
        if (!garden) return res.status(404).json({ success: false, msg: 'Chưa có vườn' });

        // 1. TÌM ITEM TRONG CONFIG (Để lấy giá chuẩn)
        let itemConfig = null;
        let category = '';

        if (type === 'plant') {
            itemConfig = ASSETS.PLANTS[itemId];
            category = 'plant';
        } else if (type === 'decoration') { // Frontend gửi 'decoration' hoặc 'decors' tùy code
            itemConfig = ASSETS.DECORS[itemId];
            category = 'decoration';
        } else if (type === 'background') {
            itemConfig = ASSETS.BACKGROUNDS[itemId];
            category = 'background';
        }

        // 2. VALIDATE
        if (!itemConfig) {
            return res.json({ success: false, msg: 'Vật phẩm không tồn tại trong Shop!' });
        }

        if (garden.gold < itemConfig.price) {
            return res.json({ success: false, msg: 'Bạn không đủ Vàng! Hãy cày thêm nhé.' });
        }

        if (itemConfig.requireBg && itemConfig.requireBg.length > 0) {
            // Nếu ID nền hiện tại không nằm trong danh sách cho phép
            if (!itemConfig.requireBg.includes(garden.backgroundId)) {
                // Tìm tên của các nền cho phép để báo lỗi
                const allowedNames = itemConfig.requireBg.map(id => ASSETS.BACKGROUNDS[id]?.name || id).join(', ');
                return res.json({ success: false, msg: `Cây này chỉ trồng được trên: ${allowedNames}` });
            }
        }

        // 3. THỰC HIỆN GIAO DỊCH
        // Trừ tiền
        garden.gold -= itemConfig.price;

        let newItem = null;

        // Xử lý riêng cho Background
        if (category === 'background') {
            garden.backgroundId = itemId;
            // Background không thêm vào items array
        } 
        // Xử lý cho Cây và Decor
        else {
            newItem = {
                type: category,
                itemId: itemId,
                x: x || 50, // Mặc định giữa màn hình nếu lỗi toạ độ
                y: y || 50,
                stage: 0,   // Cây mới mua thì là hạt giống (stage 0)
                waterCount: 0,
                plantedAt: new Date()
            };
            garden.items.push(newItem);
        }

        // 4. LƯU DATABASE
        await garden.save();

        // Nếu thêm item mới, lấy item vừa push (có _id của mongoose tạo)
        let returnedItem = null;
        if (category !== 'background') {
            returnedItem = garden.items[garden.items.length - 1];
        }

        // 5. TRẢ VỀ CLIENT
        return res.json({ 
            success: true, 
            msg: `Đã mua ${itemConfig.name}!`, 
            newGold: garden.gold,
            isBackground: (category === 'background'),
            item: returnedItem // Trả về để Phaser vẽ ngay lập tức
        });

    } catch (err) {
        console.error("Buy Error:", err);
        return res.status(500).json({ success: false, msg: 'Lỗi Server khi mua hàng.' });
    }
};

exports.removeItem = async (req, res) => {
    try {
        const { uniqueId } = req.body;
        const garden = await Garden.findOne({ user: req.user._id });

        // Tìm và xóa item khỏi mảng
        const itemIndex = garden.items.findIndex(i => i._id.toString() === uniqueId);
        if (itemIndex === -1) return res.json({ success: false, msg: 'Vật phẩm không tồn tại' });

        // (Optional) Có thể hoàn lại 50% tiền nếu muốn:
        // const item = garden.items[itemIndex];
        // const config = ...
        // garden.gold += Math.floor(config.price / 2);

        garden.items.splice(itemIndex, 1);
        await garden.save();

        res.json({ success: true, msg: 'Đã dọn dẹp!' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};