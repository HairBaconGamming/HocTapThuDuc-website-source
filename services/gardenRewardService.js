const Garden = require('../models/Garden');
const { ensureInventoryShape } = require('./gardenInventoryService');
const RESOURCE_FIELDS = new Set(['water', 'fertilizer', 'gold']);

async function ensureGarden(userId) {
    let garden = await Garden.findOne({ user: userId });

    if (!garden) {
        garden = await new Garden({ user: userId }).save();
    } else {
        ensureInventoryShape(garden);
    }

    return garden;
}

async function grantGardenResource(userId, field, amount) {
    if (!RESOURCE_FIELDS.has(field)) {
        throw new Error(`Unsupported garden reward field: ${field}`);
    }

    const safeAmount = Number(amount);
    if (!Number.isFinite(safeAmount) || safeAmount <= 0) {
        throw new Error('Reward amount must be a positive number');
    }

    const garden = await ensureGarden(userId);
    garden[field] = (garden[field] || 0) + safeAmount;
    await garden.save();

    return garden;
}

async function grantWater(userId, amount) {
    return grantGardenResource(userId, 'water', amount);
}

async function grantFertilizer(userId, amount) {
    return grantGardenResource(userId, 'fertilizer', amount);
}

async function grantGold(userId, amount) {
    return grantGardenResource(userId, 'gold', amount);
}

async function grantRewardBundle(userId, bundle = {}) {
    const safeBundle = {
        water: Math.max(0, Number(bundle.water || 0)),
        fertilizer: Math.max(0, Number(bundle.fertilizer || 0)),
        gold: Math.max(0, Number(bundle.gold || 0))
    };

    const hasReward = Object.values(safeBundle).some((amount) => amount > 0);
    if (!hasReward) {
        return ensureGarden(userId);
    }

    const garden = await ensureGarden(userId);
    RESOURCE_FIELDS.forEach((field) => {
        if (safeBundle[field] > 0) {
            garden[field] = (garden[field] || 0) + safeBundle[field];
        }
    });
    await garden.save();
    return garden;
}

async function grantTypedReward(userId, rewardType, rewardAmount) {
    if (rewardType === 'water') return grantWater(userId, rewardAmount);
    if (rewardType === 'fertilizer') return grantFertilizer(userId, rewardAmount);
    if (rewardType === 'gold') return grantGold(userId, rewardAmount);
    throw new Error(`Unsupported reward type: ${rewardType}`);
}

module.exports = {
    ensureGarden,
    grantWater,
    grantFertilizer,
    grantGold,
    grantRewardBundle,
    grantTypedReward
};
