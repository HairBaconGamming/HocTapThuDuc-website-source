const Garden = require('../models/Garden');
const User = require('../models/User');
const ASSETS = require('../config/gardenAssets');
const LevelUtils = require('../utils/level');
const { achievementChecker } = require('../utils/achievementUtils');
const {
    getLevelViewData,
    isValidCameraState,
    isValidGridCoordinate,
    parseDuration,
    syncGardenState
} = require('./gardenStateService');
const { getGuildBuffSnapshotForUser, getWitherTimeMultiplier } = require('./guildService');
const { ensureGarden } = require('./gardenRewardService');
const { addInventoryItem } = require('./gardenInventoryService');
const {
    buildDailyQuests,
    ensureDailyQuestState
} = require('./gardenQuestService');

const PLOT_BASE_PRICE = 50;

class GardenActionError extends Error {
    constructor(message, status = 400) {
        super(message);
        this.name = 'GardenActionError';
        this.status = status;
    }
}

function assertAction(condition, message, status = 400) {
    if (!condition) {
        throw new GardenActionError(message, status);
    }
}

function normalizeGridCoordinate(value, label) {
    const number = Number(value);
    assertAction(Number.isInteger(number), `${label} không hợp lệ.`);
    assertAction(isValidGridCoordinate(number), `${label} nằm ngoài khu vườn.`);
    return number;
}

function normalizeItemType(type) {
    return type === 'decor' ? 'decoration' : type;
}

function getItemConfig(type, itemId) {
    if (type === 'plant') return ASSETS.PLANTS[itemId];
    if (type === 'decoration') return ASSETS.DECORS[itemId];
    return null;
}

function isSameCell(item, x, y) {
    return item.x === x && item.y === y;
}

function findPlot(garden, x, y, excludedId = null) {
    return garden.items.find((item) => (
        item.type === 'plot'
        && isSameCell(item, x, y)
        && (!excludedId || String(item._id) !== String(excludedId))
    ));
}

function findNonPlotOccupant(garden, x, y, excludedId = null) {
    return garden.items.find((item) => (
        item.type !== 'plot'
        && isSameCell(item, x, y)
        && (!excludedId || String(item._id) !== String(excludedId))
    ));
}

async function loadGardenForMutation(userId) {
    const garden = await ensureGarden(userId);
    const guildBuffs = await getGuildBuffSnapshotForUser(userId);
    await syncGardenState(garden, {
        persist: true,
        witherTimeMultiplier: getWitherTimeMultiplier(guildBuffs)
    });
    await ensureDailyQuestState(garden, { persist: true });
    return garden;
}

async function buyItem({ userId, itemId, type, x, y }) {
    const normalizedType = normalizeItemType(type);
    const safeX = normalizeGridCoordinate(x, 'Vi tri X');
    const safeY = normalizeGridCoordinate(y, 'Vi tri Y');

    assertAction(['plot', 'plant', 'decoration'].includes(normalizedType), 'Loại vật phẩm không hợp lệ.');

    const garden = await loadGardenForMutation(userId);
    const user = await User.findById(userId);
    assertAction(user, 'Không tìm thấy người chơi.', 404);

    if (normalizedType === 'plot') {
        assertAction(!findPlot(garden, safeX, safeY), 'Chỗ này đã có đất rồi!');
        assertAction(!findNonPlotOccupant(garden, safeX, safeY), 'Chỗ này đã có vật phẩm rồi!');

        const currentPlots = garden.items.filter((item) => item.type === 'plot').length;
        const plotPrice = Math.ceil(PLOT_BASE_PRICE * Math.pow(1.005, currentPlots));

        assertAction(garden.gold >= plotPrice, `Cần ${plotPrice} vàng để mở rộng!`);

        garden.gold -= plotPrice;
        garden.items.push({
            type: 'plot',
            itemId: 'soil_tile',
            x: safeX,
            y: safeY
        });
        await garden.save();

        return {
            success: true,
            msg: `Mở rộng đất (-${plotPrice} vàng)`,
            item: garden.items[garden.items.length - 1],
            newGold: garden.gold
        };
    }

    const itemConfig = getItemConfig(normalizedType, itemId);
    assertAction(itemConfig, 'Vật phẩm lỗi.');

    if (itemConfig.unlockLevel) {
        assertAction((user.level || 1) >= itemConfig.unlockLevel, `Cần Level ${itemConfig.unlockLevel} để mua vật phẩm này!`);
    }

    assertAction(garden.gold >= itemConfig.price, 'Không đủ vàng.');

    if (normalizedType === 'plant') {
        assertAction(findPlot(garden, safeX, safeY), 'Phải cuốc đất trước!');
        assertAction(!findNonPlotOccupant(garden, safeX, safeY), 'Ô đất này đã có cây!');
    }

    if (normalizedType === 'decoration') {
        assertAction(!findPlot(garden, safeX, safeY), 'Decor phải đặt trên cỏ!');
        assertAction(!findNonPlotOccupant(garden, safeX, safeY), 'Vướng vật cản!');
    }

    garden.gold -= itemConfig.price;
    garden.items.push({
        type: normalizedType,
        itemId,
        x: safeX,
        y: safeY,
        stage: 0,
        growthProgress: 0,
        witherProgress: 0,
        isDead: false,
        lastWatered: null,
        lastUpdated: new Date(),
        plantedAt: new Date()
    });

    if (normalizedType === 'plant') {
        garden.plantCount = (garden.plantCount || 0) + 1;
    } else if (normalizedType === 'decoration') {
        garden.decorationCount = (garden.decorationCount || 0) + 1;
    }

    await garden.save();

    let achievements = [];
    if (normalizedType === 'plant') {
        achievements = await achievementChecker.onPlantPlanted(userId);
    } else if (normalizedType === 'decoration') {
        achievements = await achievementChecker.onDecorationPlaced(userId);
    }

    return {
        success: true,
        msg: `Đã mua ${itemConfig.name}`,
        newGold: garden.gold,
        item: garden.items[garden.items.length - 1],
        achievements,
        dailyQuests: buildDailyQuests(garden, { userLevel: user.level || 1 })
    };
}

async function moveItem({ userId, uniqueId, x, y }) {
    const safeX = normalizeGridCoordinate(x, 'Vi tri X');
    const safeY = normalizeGridCoordinate(y, 'Vi tri Y');
    assertAction(uniqueId, 'Thiếu mã vật phẩm.');

    const garden = await loadGardenForMutation(userId);
    const item = garden.items.id(uniqueId);
    assertAction(item, 'Vật phẩm không tồn tại hoặc không thuộc về bạn.', 404);
    assertAction(item.type !== 'plot', 'Không thể di chuyển ô đất!');

    const config = ASSETS.PLANTS[item.itemId] || ASSETS.DECORS[item.itemId];
    const canMove = !item.isDead && (
        item.type === 'decoration'
        || item.stage === 0
        || (config && item.stage >= config.maxStage)
    );

    assertAction(canMove, item.isDead ? 'Cây chết không dời được!' : 'Cây đang lớn, không nên động vào!');

    if (item.type === 'plant') {
        assertAction(findPlot(garden, safeX, safeY), 'Cây phải đặt trên đất!');
        assertAction(!findNonPlotOccupant(garden, safeX, safeY, uniqueId), 'Vị trí bị trùng!');
    }

    if (item.type === 'decoration') {
        assertAction(!findPlot(garden, safeX, safeY), 'Decor phải đặt trên cỏ!');
        assertAction(!findNonPlotOccupant(garden, safeX, safeY, uniqueId), 'Vị trí bị trùng!');
    }

    item.x = safeX;
    item.y = safeY;
    await garden.save();

    return { success: true };
}

async function interactItem({ userId, uniqueId, action }) {
    assertAction(uniqueId, 'Thiếu mã vật phẩm.');
    assertAction(['water', 'harvest', 'fertilize'].includes(action), 'Hành động không hợp lệ.');

    const garden = await loadGardenForMutation(userId);
    const item = garden.items.id(uniqueId);
    assertAction(item, 'Vật phẩm không tồn tại hoặc không thuộc về bạn.', 404);

    const user = await User.findById(userId);
    assertAction(user, 'Không tìm thấy người chơi.', 404);

    if (action === 'water') {
        assertAction(garden.water > 0, 'Hết nước rồi!');

        const plot = item.type === 'plot' ? item : findPlot(garden, item.x, item.y);
        assertAction(plot, 'Không tìm thấy ô đất để tưới.');

        const plant = item.type === 'plant'
            ? item
            : findNonPlotOccupant(garden, plot.x, plot.y);

        garden.water = Math.max(0, garden.water - 1);
        plot.lastWatered = new Date();
        if (plant?.type === 'plant') {
            plant.witherProgress = 0;
        }

        garden.waterCount = (garden.waterCount || 0) + 1;
        await garden.save();

        const achievements = await achievementChecker.onPlantWatered(userId);

        return {
            success: true,
            msg: 'Đã tưới nước (ẩm 24h)',
            item,
            newWater: garden.water,
            achievements,
            dailyQuests: buildDailyQuests(garden, { userLevel: user.level || 1 })
        };
    }

    if (action === 'fertilize') {
        assertAction(item.type === 'plant', 'Chỉ có thể bón phân cho cây trồng.');
        assertAction(!item.isDead, 'Cây đã chết, không thể bón phân.');
        assertAction(garden.fertilizer > 0, 'Bạn đã hết phân bón.');

        const config = ASSETS.PLANTS[item.itemId];
        assertAction(config, 'Không tìm thấy cấu hình cây trồng.');
        assertAction(item.stage < config.maxStage, 'Cây đã sẵn sàng thu hoạch.');

        const plot = findPlot(garden, item.x, item.y);
        assertAction(plot, 'Không tìm thấy ô đất của cây.');

        const now = new Date();
        const timePerStage = parseDuration(config.growthTime);

        garden.fertilizer = Math.max(0, (garden.fertilizer || 0) - 1);
        item.growthProgress = Math.max(0, item.growthProgress || 0) + timePerStage;
        item.stage = Math.min(Math.floor(item.growthProgress / timePerStage), config.maxStage);
        item.witherProgress = 0;
        item.isDead = false;
        item.lastUpdated = now;
        plot.lastWatered = now;
        plot.lastUpdated = now;

        garden.fertilizeCount = (garden.fertilizeCount || 0) + 1;

        await garden.save();

        return {
            success: true,
            msg: item.stage >= config.maxStage
                ? 'Đã bón phân, cây đã sẵn sàng thu hoạch!'
                : 'Đã bón phân, cây lớn nhanh hơn!',
            item: item.toObject(),
            plot: plot.toObject(),
            newFertilizer: garden.fertilizer,
            dailyQuests: buildDailyQuests(garden, { userLevel: user.level || 1 })
        };
    }

    assertAction(item.type === 'plant', 'Chỉ có thể thu hoạch cây trồng.');

    const config = ASSETS.PLANTS[item.itemId];
    assertAction(config, 'Không tìm thấy cấu hình cây trồng.');
    assertAction(item.stage >= config.maxStage, 'Chưa chín!');

    const rewardGold = Math.floor(Math.random() * ((config.rewardGold.max - config.rewardGold.min) + 1)) + config.rewardGold.min;
    const rewardXP = config.rewardXP || 10;
    const harvestYield = Math.max(1, Number(config.harvestYield || 1));

    garden.gold += rewardGold;
    garden.harvestCount = (garden.harvestCount || 0) + 1;
    garden.totalGoldCollected = (garden.totalGoldCollected || 0) + rewardGold;
    const inventory = addInventoryItem(garden, item.itemId, harvestYield);

    const levelResult = LevelUtils.calculateLevelUp(user.level, user.xp, rewardXP);
    user.level = levelResult.newLevel;
    user.xp = levelResult.newXP;

    if (config.isMultiHarvest) {
        const timePerStage = parseDuration(config.growthTime);
        item.stage = Number.isInteger(config.afterharvestStage) ? config.afterharvestStage : 0;
        item.growthProgress = item.stage * timePerStage;
        item.witherProgress = 0;
        item.isDead = false;
        item.lastUpdated = new Date();
    } else {
        garden.items.pull(item._id);
    }

    await Promise.all([garden.save(), user.save()]);

    const nextLevelInfo = getLevelViewData(user);
    const achievements = await achievementChecker.onPlantHarvested(userId, rewardGold);

    return {
        success: true,
        newGold: garden.gold,
        goldReward: rewardGold,
        xpReward: rewardXP,
        harvestYield,
        inventory,
        achievements,
        levelData: {
            level: user.level,
            currentXP: nextLevelInfo.currentXP,
            nextLevelXP: nextLevelInfo.nextLevelXP,
            levelName: nextLevelInfo.levelName,
            hasLeveledUp: levelResult.hasLeveledUp
        },
        dailyQuests: buildDailyQuests(garden, { userLevel: user.level || 1 }),
        msg: config.isMultiHarvest
            ? `Thu hoạch quả: +${rewardGold}G, +${rewardXP}XP (Cây sẽ phát triển lại!)`
            : `Thu hoạch: +${rewardGold}G, +${rewardXP}XP`
    };
}

async function removeItem({ userId, uniqueId }) {
    assertAction(uniqueId, 'Thiếu mã vật phẩm.');

    const garden = await loadGardenForMutation(userId);
    const item = garden.items.id(uniqueId);
    assertAction(item, 'Vật phẩm không tồn tại hoặc không thuộc về bạn.', 404);

    if (item.type === 'plot') {
        assertAction(!findNonPlotOccupant(garden, item.x, item.y), 'Cần dọn cây hoặc decor trước khi xóa đất.');
    }

    garden.items.pull(item._id);
    await garden.save();

    return { success: true, msg: 'Đã dọn dẹp!' };
}

async function saveCamera({ userId, x, y, zoom }) {
    const camera = {
        x: Number(x),
        y: Number(y),
        zoom: Number(zoom)
    };

    assertAction(isValidCameraState(camera), 'Trạng thái camera không hợp lệ.');

    await ensureGarden(userId);
    await Garden.updateOne(
        { user: userId },
        {
            $set: {
                'camera.x': camera.x,
                'camera.y': camera.y,
                'camera.zoom': camera.zoom
            }
        }
    );

    return { success: true };
}

async function updateTutorialStep({ userId, step }) {
    const safeStep = Number(step);
    assertAction(Number.isInteger(safeStep), 'Bước tutorial không hợp lệ.');
    assertAction(safeStep >= 0 && safeStep <= 999, 'Bước tutorial nằm ngoài phạm vi.');

    await Garden.findOneAndUpdate(
        { user: userId },
        { tutorialStep: safeStep },
        { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    return { success: true };
}

/**
 * processBatchActions — Execute multiple garden actions in a single DB round-trip.
 *
 * @param {string} userId
 * @param {Array<{action: string, payload: object}>} actions
 *   action = 'water' | 'buy' | 'move' | 'remove' | 'harvest' | 'fertilize'
 *   payload = the per-action params (uniqueId, itemId, type, x, y, etc.)
 *
 * Returns { success: true, results: [...], garden: { newGold, newWater, ... } }
 */
async function processBatchActions(userId, actions = []) {
    if (!Array.isArray(actions) || actions.length === 0) {
        return { success: true, results: [], garden: {} };
    }

    // Cap batch size to prevent abuse
    const MAX_BATCH = 30;
    const safeActions = actions.slice(0, MAX_BATCH);

    // Load garden + sync state ONCE for the entire batch
    const garden = await loadGardenForMutation(userId);
    const user = await User.findById(userId);
    if (!user) throw new GardenActionError('Không tìm thấy người chơi.', 404);

    const results = [];
    let needSave = false;
    let cumulativeXP = 0;
    let lastLevelResult = null;

    for (const entry of safeActions) {
        const { action, payload } = entry || {};
        try {
            if (action === 'water') {
                const { uniqueId } = payload || {};
                const item = garden.items.id(uniqueId);
                if (!item) { results.push({ action, success: false, msg: 'Vật phẩm không tồn tại.' }); continue; }
                if (garden.water <= 0) { results.push({ action, success: false, msg: 'Hết nước rồi!' }); continue; }

                const plot = item.type === 'plot' ? item : findPlot(garden, item.x, item.y);
                if (!plot) { results.push({ action, success: false, msg: 'Không tìm thấy ô đất để tưới.' }); continue; }

                const plant = item.type === 'plant'
                    ? item
                    : findNonPlotOccupant(garden, plot.x, plot.y);

                garden.water = Math.max(0, garden.water - 1);
                plot.lastWatered = new Date();
                if (plant?.type === 'plant') {
                    plant.witherProgress = 0;
                }
                garden.waterCount = (garden.waterCount || 0) + 1;
                needSave = true;
                results.push({ action, success: true, uniqueId });

            } else if (action === 'harvest') {
                const { uniqueId } = payload || {};
                const item = garden.items.id(uniqueId);
                if (!item || item.type !== 'plant') { results.push({ action, success: false, msg: 'Chỉ có thể thu hoạch cây trồng.' }); continue; }

                const config = ASSETS.PLANTS[item.itemId];
                if (!config) { results.push({ action, success: false, msg: 'Không tìm thấy cấu hình cây.' }); continue; }
                if (item.stage < config.maxStage) { results.push({ action, success: false, msg: 'Chưa chín!' }); continue; }

                const rewardGold = Math.floor(Math.random() * ((config.rewardGold.max - config.rewardGold.min) + 1)) + config.rewardGold.min;
                const rewardXP = config.rewardXP || 10;
                const harvestYield = Math.max(1, Number(config.harvestYield || 1));

                garden.gold += rewardGold;
                garden.harvestCount = (garden.harvestCount || 0) + 1;
                garden.totalGoldCollected = (garden.totalGoldCollected || 0) + rewardGold;
                addInventoryItem(garden, item.itemId, harvestYield);

                cumulativeXP += rewardXP;

                if (config.isMultiHarvest) {
                    const timePerStage = parseDuration(config.growthTime);
                    item.stage = Number.isInteger(config.afterharvestStage) ? config.afterharvestStage : 0;
                    item.growthProgress = item.stage * timePerStage;
                    item.witherProgress = 0;
                    item.isDead = false;
                    item.lastUpdated = new Date();
                } else {
                    garden.items.pull(item._id);
                }

                needSave = true;
                results.push({ action, success: true, uniqueId, goldReward: rewardGold, xpReward: rewardXP, harvestYield });

            } else if (action === 'fertilize') {
                const { uniqueId } = payload || {};
                const item = garden.items.id(uniqueId);
                if (!item || item.type !== 'plant') { results.push({ action, success: false, msg: 'Chỉ có thể bón phân cho cây.' }); continue; }
                if (item.isDead) { results.push({ action, success: false, msg: 'Cây đã chết.' }); continue; }
                if (garden.fertilizer <= 0) { results.push({ action, success: false, msg: 'Hết phân bón.' }); continue; }

                const config = ASSETS.PLANTS[item.itemId];
                if (!config) { results.push({ action, success: false, msg: 'Không tìm thấy cấu hình cây.' }); continue; }
                if (item.stage >= config.maxStage) { results.push({ action, success: false, msg: 'Cây đã sẵn sàng thu hoạch.' }); continue; }

                const plot = findPlot(garden, item.x, item.y);
                const now = new Date();
                const timePerStage = parseDuration(config.growthTime);

                garden.fertilizer = Math.max(0, (garden.fertilizer || 0) - 1);
                item.growthProgress = Math.max(0, item.growthProgress || 0) + timePerStage;
                item.stage = Math.min(Math.floor(item.growthProgress / timePerStage), config.maxStage);
                item.witherProgress = 0;
                item.isDead = false;
                item.lastUpdated = now;
                if (plot) { plot.lastWatered = now; plot.lastUpdated = now; }

                garden.fertilizeCount = (garden.fertilizeCount || 0) + 1;

                needSave = true;
                results.push({ action, success: true, uniqueId, item: item.toObject() });

            } else if (action === 'buy') {
                // Lightweight buy within batch (no achievement check to avoid N+1)
                const { itemId, type, x, y } = payload || {};
                const normalizedType = normalizeItemType(type);
                const safeX = Number(x); const safeY = Number(y);
                if (!Number.isInteger(safeX) || !Number.isInteger(safeY) || !isValidGridCoordinate(safeX) || !isValidGridCoordinate(safeY)) {
                    results.push({ action, success: false, msg: 'Vị trí không hợp lệ.' }); continue;
                }

                if (normalizedType === 'plot') {
                    if (findPlot(garden, safeX, safeY)) { results.push({ action, success: false, msg: 'Chỗ này đã có đất.' }); continue; }
                    const currentPlots = garden.items.filter((i) => i.type === 'plot').length;
                    const plotPrice = Math.ceil(PLOT_BASE_PRICE * Math.pow(1.005, currentPlots));
                    if (garden.gold < plotPrice) { results.push({ action, success: false, msg: `Cần ${plotPrice} vàng.` }); continue; }

                    garden.gold -= plotPrice;
                    garden.items.push({ type: 'plot', itemId: 'soil_tile', x: safeX, y: safeY });
                    needSave = true;
                    results.push({ action, success: true, item: garden.items[garden.items.length - 1] });

                } else {
                    const itemConfig = getItemConfig(normalizedType, itemId);
                    if (!itemConfig) { results.push({ action, success: false, msg: 'Vật phẩm lỗi.' }); continue; }
                    if (garden.gold < itemConfig.price) { results.push({ action, success: false, msg: 'Không đủ vàng.' }); continue; }
                    if (normalizedType === 'plant' && !findPlot(garden, safeX, safeY)) { results.push({ action, success: false, msg: 'Phải cuốc đất trước.' }); continue; }
                    if (normalizedType === 'plant' && findNonPlotOccupant(garden, safeX, safeY)) { results.push({ action, success: false, msg: 'Ô đất này đã có cây.' }); continue; }
                    if (normalizedType === 'decoration' && findPlot(garden, safeX, safeY)) { results.push({ action, success: false, msg: 'Decor phải đặt trên cỏ.' }); continue; }
                    if (normalizedType === 'decoration' && findNonPlotOccupant(garden, safeX, safeY)) { results.push({ action, success: false, msg: 'Vướng vật cản.' }); continue; }

                    garden.gold -= itemConfig.price;
                    garden.items.push({
                        type: normalizedType, itemId, x: safeX, y: safeY,
                        stage: 0, growthProgress: 0, witherProgress: 0, isDead: false,
                        lastWatered: null, lastUpdated: new Date(), plantedAt: new Date()
                    });
                    needSave = true;
                    results.push({ action, success: true, item: garden.items[garden.items.length - 1] });
                }

            } else if (action === 'move') {
                const { uniqueId, x, y } = payload || {};
                const safeX = Number(x); const safeY = Number(y);
                const item = garden.items.id(uniqueId);
                if (!item) { results.push({ action, success: false, msg: 'Vật phẩm không tồn tại.' }); continue; }
                item.x = safeX; item.y = safeY;
                needSave = true;
                results.push({ action, success: true, uniqueId });

            } else if (action === 'remove') {
                const { uniqueId } = payload || {};
                const item = garden.items.id(uniqueId);
                if (!item) { results.push({ action, success: false, msg: 'Vật phẩm không tồn tại.' }); continue; }
                if (item.type === 'plot' && findNonPlotOccupant(garden, item.x, item.y)) {
                    results.push({ action, success: false, msg: 'Cần dọn cây trước.' }); continue;
                }
                garden.items.pull(item._id);
                needSave = true;
                results.push({ action, success: true, uniqueId });

            } else {
                results.push({ action, success: false, msg: 'Hành động không hợp lệ.' });
            }
        } catch (err) {
            results.push({ action, success: false, msg: err.message || 'Lỗi xử lý.' });
        }
    }

    // Apply cumulative XP once
    if (cumulativeXP > 0) {
        lastLevelResult = LevelUtils.calculateLevelUp(user.level, user.xp, cumulativeXP);
        user.level = lastLevelResult.newLevel;
        user.xp = lastLevelResult.newXP;
    }

    // Single DB save for everything
    if (needSave) {
        const saves = [garden.save()];
        if (cumulativeXP > 0) saves.push(user.save());
        await Promise.all(saves);
    }

    const levelData = getLevelViewData(user);
    return {
        success: true,
        results,
        garden: {
            newGold: garden.gold,
            newWater: garden.water,
            newFertilizer: garden.fertilizer,
            inventory: garden.inventory || {},
            dailyQuests: buildDailyQuests(garden, { userLevel: user.level || 1 }),
            levelData
        }
    };
}

module.exports = {
    GardenActionError,
    buyItem,
    moveItem,
    interactItem,
    removeItem,
    saveCamera,
    updateTutorialStep,
    processBatchActions
};
