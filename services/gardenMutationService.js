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
const { ensureGarden } = require('./gardenRewardService');
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
    assertAction(Number.isInteger(number), `${label} khong hop le.`);
    assertAction(isValidGridCoordinate(number), `${label} nam ngoai khu vuon.`);
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
    await syncGardenState(garden, { persist: true });
    await ensureDailyQuestState(garden, { persist: true });
    return garden;
}

async function buyItem({ userId, itemId, type, x, y }) {
    const normalizedType = normalizeItemType(type);
    const safeX = normalizeGridCoordinate(x, 'Vi tri X');
    const safeY = normalizeGridCoordinate(y, 'Vi tri Y');

    assertAction(['plot', 'plant', 'decoration'].includes(normalizedType), 'Loai vat pham khong hop le.');

    const garden = await loadGardenForMutation(userId);
    const user = await User.findById(userId);
    assertAction(user, 'Khong tim thay nguoi choi.', 404);

    if (normalizedType === 'plot') {
        assertAction(!findPlot(garden, safeX, safeY), 'Cho nay da co dat roi!');
        assertAction(!findNonPlotOccupant(garden, safeX, safeY), 'Cho nay da co vat pham roi!');

        const currentPlots = garden.items.filter((item) => item.type === 'plot').length;
        const plotPrice = Math.ceil(PLOT_BASE_PRICE * Math.pow(1.005, currentPlots));

        assertAction(garden.gold >= plotPrice, `Can ${plotPrice} vang de mo rong!`);

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
            msg: `Mo rong dat (-${plotPrice} vang)`,
            item: garden.items[garden.items.length - 1],
            newGold: garden.gold
        };
    }

    const itemConfig = getItemConfig(normalizedType, itemId);
    assertAction(itemConfig, 'Vat pham loi.');

    if (itemConfig.unlockLevel) {
        assertAction((user.level || 1) >= itemConfig.unlockLevel, `Can Level ${itemConfig.unlockLevel} de mua vat pham nay!`);
    }

    assertAction(garden.gold >= itemConfig.price, 'Khong du vang.');

    if (normalizedType === 'plant') {
        assertAction(findPlot(garden, safeX, safeY), 'Phai cuoc dat truoc!');
        assertAction(!findNonPlotOccupant(garden, safeX, safeY), 'O dat nay da co cay!');
    }

    if (normalizedType === 'decoration') {
        assertAction(!findPlot(garden, safeX, safeY), 'Decor phai dat tren co!');
        assertAction(!findNonPlotOccupant(garden, safeX, safeY), 'Vuong vat can!');
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
        msg: `Da mua ${itemConfig.name}`,
        newGold: garden.gold,
        item: garden.items[garden.items.length - 1],
        achievements,
        dailyQuests: buildDailyQuests(garden)
    };
}

async function moveItem({ userId, uniqueId, x, y }) {
    const safeX = normalizeGridCoordinate(x, 'Vi tri X');
    const safeY = normalizeGridCoordinate(y, 'Vi tri Y');
    assertAction(uniqueId, 'Thieu ma vat pham.');

    const garden = await loadGardenForMutation(userId);
    const item = garden.items.id(uniqueId);
    assertAction(item, 'Vat pham khong ton tai hoac khong thuoc ve ban.', 404);
    assertAction(item.type !== 'plot', 'Khong the di chuyen o dat!');

    const config = ASSETS.PLANTS[item.itemId] || ASSETS.DECORS[item.itemId];
    const canMove = !item.isDead && (
        item.type === 'decoration'
        || item.stage === 0
        || (config && item.stage >= config.maxStage)
    );

    assertAction(canMove, item.isDead ? 'Cay chet khong doi duoc!' : 'Cay dang lon, khong nen dong vao!');

    if (item.type === 'plant') {
        assertAction(findPlot(garden, safeX, safeY), 'Cay phai dat tren dat!');
        assertAction(!findNonPlotOccupant(garden, safeX, safeY, uniqueId), 'Vi tri bi trung!');
    }

    if (item.type === 'decoration') {
        assertAction(!findPlot(garden, safeX, safeY), 'Decor phai dat tren co!');
        assertAction(!findNonPlotOccupant(garden, safeX, safeY, uniqueId), 'Vi tri bi trung!');
    }

    item.x = safeX;
    item.y = safeY;
    await garden.save();

    return { success: true };
}

async function interactItem({ userId, uniqueId, action }) {
    assertAction(uniqueId, 'Thieu ma vat pham.');
    assertAction(['water', 'harvest', 'fertilize'].includes(action), 'Hanh dong khong hop le.');

    const garden = await loadGardenForMutation(userId);
    const item = garden.items.id(uniqueId);
    assertAction(item, 'Vat pham khong ton tai hoac khong thuoc ve ban.', 404);

    if (action === 'water') {
        assertAction(garden.water > 0, 'Het nuoc roi!');

        const plot = item.type === 'plot' ? item : findPlot(garden, item.x, item.y);
        assertAction(plot, 'Khong tim thay o dat de tuoi.');

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
            msg: 'Da tuoi nuoc (am 24h)',
            item,
            newWater: garden.water,
            achievements,
            dailyQuests: buildDailyQuests(garden)
        };
    }

    if (action === 'fertilize') {
        assertAction(item.type === 'plant', 'Chi co the bon phan cho cay trong.');
        assertAction(!item.isDead, 'Cay da chet, khong the bon phan.');
        assertAction(garden.fertilizer > 0, 'Ban da het phan bon.');

        const config = ASSETS.PLANTS[item.itemId];
        assertAction(config, 'Khong tim thay cau hinh cay trong.');
        assertAction(item.stage < config.maxStage, 'Cay da san sang thu hoach.');

        const plot = findPlot(garden, item.x, item.y);
        assertAction(plot, 'Khong tim thay o dat cua cay.');

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

        await garden.save();

        return {
            success: true,
            msg: item.stage >= config.maxStage
                ? 'Da bon phan, cay da san sang thu hoach!'
                : 'Da bon phan, cay lon nhanh hon!',
            item: item.toObject(),
            plot: plot.toObject(),
            newFertilizer: garden.fertilizer,
            dailyQuests: buildDailyQuests(garden)
        };
    }

    assertAction(item.type === 'plant', 'Chi co the thu hoach cay trong.');

    const config = ASSETS.PLANTS[item.itemId];
    assertAction(config, 'Khong tim thay cau hinh cay trong.');
    assertAction(item.stage >= config.maxStage, 'Chua chin!');

    const rewardGold = Math.floor(Math.random() * ((config.rewardGold.max - config.rewardGold.min) + 1)) + config.rewardGold.min;
    const rewardXP = config.rewardXP || 10;

    garden.gold += rewardGold;
    garden.harvestCount = (garden.harvestCount || 0) + 1;
    garden.totalGoldCollected = (garden.totalGoldCollected || 0) + rewardGold;

    const user = await User.findById(userId);
    assertAction(user, 'Khong tim thay nguoi choi.', 404);

    const levelResult = LevelUtils.calculateLevelUp(user.level, user.xp, rewardXP);
    user.level = levelResult.newLevel;
    user.xp = levelResult.newXP;

    if (config.isMultiHarvest) {
        item.stage = Number.isInteger(config.afterharvestStage) ? config.afterharvestStage : 0;
        item.growthProgress = 0;
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
        achievements,
        levelData: {
            level: user.level,
            currentXP: nextLevelInfo.currentXP,
            nextLevelXP: nextLevelInfo.nextLevelXP,
            levelName: nextLevelInfo.levelName,
            hasLeveledUp: levelResult.hasLeveledUp
        },
        dailyQuests: buildDailyQuests(garden),
        msg: config.isMultiHarvest
            ? `Thu hoach qua: +${rewardGold}G, +${rewardXP}XP (Cay se phat trien lai!)`
            : `Thu hoach: +${rewardGold}G, +${rewardXP}XP`
    };
}

async function removeItem({ userId, uniqueId }) {
    assertAction(uniqueId, 'Thieu ma vat pham.');

    const garden = await loadGardenForMutation(userId);
    const item = garden.items.id(uniqueId);
    assertAction(item, 'Vat pham khong ton tai hoac khong thuoc ve ban.', 404);

    if (item.type === 'plot') {
        assertAction(!findNonPlotOccupant(garden, item.x, item.y), 'Can don cay hoac decor truoc khi xoa dat.');
    }

    garden.items.pull(item._id);
    await garden.save();

    return { success: true, msg: 'Da don dep!' };
}

async function saveCamera({ userId, x, y, zoom }) {
    const camera = {
        x: Number(x),
        y: Number(y),
        zoom: Number(zoom)
    };

    assertAction(isValidCameraState(camera), 'Trang thai camera khong hop le.');

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
    assertAction(Number.isInteger(safeStep), 'Buoc tutorial khong hop le.');
    assertAction(safeStep >= 0 && safeStep <= 999, 'Buoc tutorial nam ngoai pham vi.');

    await Garden.findOneAndUpdate(
        { user: userId },
        { tutorialStep: safeStep },
        { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    return { success: true };
}

module.exports = {
    GardenActionError,
    buyItem,
    moveItem,
    interactItem,
    removeItem,
    saveCamera,
    updateTutorialStep
};
