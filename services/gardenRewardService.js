const Garden = require('../models/Garden');

async function ensureGarden(userId) {
    let garden = await Garden.findOne({ user: userId });

    if (!garden) {
        garden = await new Garden({ user: userId }).save();
    }

    return garden;
}

async function grantGardenResource(userId, field, amount) {
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

module.exports = {
    ensureGarden,
    grantWater,
    grantFertilizer
};
