const LevelUtils = require('../utils/level');
const ASSETS = require('../config/gardenAssets');
const { buildDailyQuests } = require('./gardenQuestService');

const GRID_SIZE = 64;
const WORLD_TILE_COUNT = 64;
const WORLD_SIZE = GRID_SIZE * WORLD_TILE_COUNT;
const MAX_TILE_COORD = WORLD_SIZE - GRID_SIZE;
const MOISTURE_DURATION = 24 * 60 * 60 * 1000;

function parseDuration(value) {
    if (!value) return 24 * 60 * 60 * 1000;

    const amount = parseInt(value, 10);
    if (!Number.isFinite(amount)) return 24 * 60 * 60 * 1000;

    if (value.includes('gio')) return amount * 60 * 60 * 1000;
    if (value.includes('phut')) return amount * 60 * 1000;
    if (value.includes('giờ')) return amount * 60 * 60 * 1000;
    if (value.includes('phút')) return amount * 60 * 1000;

    return amount * 60 * 1000;
}

function isValidGridCoordinate(value) {
    return Number.isInteger(value) && value >= 0 && value <= MAX_TILE_COORD && value % GRID_SIZE === 0;
}

function isValidCameraState(camera) {
    if (!camera || typeof camera !== 'object') return false;

    const { x, y, zoom } = camera;
    return Number.isFinite(x)
        && Number.isFinite(y)
        && Number.isFinite(zoom)
        && x >= 0
        && x <= WORLD_SIZE
        && y >= 0
        && y <= WORLD_SIZE
        && zoom >= 0.5
        && zoom <= 2.5;
}

function getLevelViewData(user) {
    const safeLevel = user?.level || 1;
    const safeXP = user?.xp || 0;
    const info = LevelUtils.getLevelInfo(safeLevel, safeXP);

    return {
        level: safeLevel,
        currentXP: info.currentXP,
        nextLevelXP: info.requiredXP,
        levelName: info.fullName
    };
}

function buildGardenViewData(garden, ownerUser) {
    const levelData = getLevelViewData(ownerUser);

    return {
        ...garden.toObject(),
        userLevel: levelData.level,
        currentXP: levelData.currentXP,
        nextLevelXP: levelData.nextLevelXP,
        levelName: levelData.levelName,
        ownerName: ownerUser?.username || 'Nguoi choi',
        dailyQuests: buildDailyQuests(garden, { userLevel: levelData.level })
    };
}

function applyGardenState(garden, now = new Date(), options = {}) {
    if (!garden) return false;

    let changed = false;
    const currentTime = now.getTime();
    const plotMap = new Map();
    const witherTimeMultiplier = Number(options.witherTimeMultiplier || 1) > 0
        ? Number(options.witherTimeMultiplier || 1)
        : 1;

    garden.items.forEach((item) => {
        if (item.type === 'plot') {
            plotMap.set(`${item.x},${item.y}`, item);
        }
    });

    garden.items.forEach((item) => {
        if (item.isDead) return;

        const lastTime = item.lastUpdated
            ? new Date(item.lastUpdated).getTime()
            : new Date(item.plantedAt).getTime();
        const deltaTime = Math.max(0, currentTime - lastTime);

        if (item.type === 'plot' && item.lastWatered) {
            const wateredTime = new Date(item.lastWatered).getTime();
            if (currentTime - wateredTime > MOISTURE_DURATION) {
                item.lastWatered = null;
                changed = true;
            }
        } else if (item.type === 'plant') {
            const config = ASSETS.PLANTS[item.itemId];
            if (config) {
                const plot = plotMap.get(`${item.x},${item.y}`);
                const wateredTime = plot?.lastWatered ? new Date(plot.lastWatered).getTime() : 0;
                const isWet = Boolean(plot?.lastWatered) && currentTime - wateredTime <= MOISTURE_DURATION;

                if (isWet) {
                    if (item.stage < config.maxStage && deltaTime > 0) {
                        item.growthProgress = (item.growthProgress || 0) + deltaTime;
                        const timePerStage = parseDuration(config.growthTime);
                        const calculatedStage = Math.floor(item.growthProgress / timePerStage);
                        const nextStage = Math.min(calculatedStage, config.maxStage);
                        if (nextStage !== item.stage) changed = true;
                        item.stage = nextStage;
                    }

                    if ((item.witherProgress || 0) > 0 && deltaTime > 0) {
                        const nextWitherProgress = Math.max(0, item.witherProgress - deltaTime);
                        if (nextWitherProgress !== item.witherProgress) changed = true;
                        item.witherProgress = nextWitherProgress;
                    }
                } else if (item.stage > 0 && deltaTime > 0) {
                    item.witherProgress = (item.witherProgress || 0) + deltaTime;
                    changed = true;

                    const maxWither = parseDuration(config.witherTime || '30 phut') * witherTimeMultiplier;
                    if (item.witherProgress >= maxWither && !item.isDead) {
                        item.isDead = true;
                    }
                }
            }
        }

        if (deltaTime > 0) {
            item.lastUpdated = now;
            changed = true;
        }
    });

    return changed;
}

async function syncGardenState(garden, options = {}) {
    const { persist = false, now = new Date() } = options;
    const changed = applyGardenState(garden, now, options);

    if (persist && changed) {
        await garden.save();
    }

    return { garden, changed };
}

module.exports = {
    GRID_SIZE,
    WORLD_SIZE,
    MAX_TILE_COORD,
    MOISTURE_DURATION,
    parseDuration,
    isValidGridCoordinate,
    isValidCameraState,
    getLevelViewData,
    buildGardenViewData,
    applyGardenState,
    syncGardenState
};
