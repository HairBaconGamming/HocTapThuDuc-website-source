const ASSETS = require('../config/gardenAssets');

const INVENTORY_KEYS = Object.keys(ASSETS.PLANTS || {});

function ensureInventoryShape(garden) {
    if (!garden.inventory || typeof garden.inventory !== 'object') {
        garden.inventory = {};
    }

    INVENTORY_KEYS.forEach((key) => {
        const current = Number(garden.inventory[key] || 0);
        garden.inventory[key] = Number.isFinite(current) && current > 0 ? Math.floor(current) : 0;
    });

    return garden.inventory;
}

function getInventorySnapshot(garden) {
    const inventory = ensureInventoryShape(garden);
    return INVENTORY_KEYS.reduce((snapshot, key) => {
        snapshot[key] = inventory[key] || 0;
        return snapshot;
    }, {});
}

function addInventoryItem(garden, itemId, amount) {
    const safeAmount = Math.max(0, Math.floor(Number(amount) || 0));
    if (!safeAmount || !INVENTORY_KEYS.includes(itemId)) {
        return getInventorySnapshot(garden);
    }

    const inventory = ensureInventoryShape(garden);
    inventory[itemId] = (inventory[itemId] || 0) + safeAmount;
    return getInventorySnapshot(garden);
}

function removeInventoryItem(garden, itemId, amount) {
    const safeAmount = Math.max(0, Math.floor(Number(amount) || 0));
    const inventory = ensureInventoryShape(garden);
    const current = inventory[itemId] || 0;

    if (!INVENTORY_KEYS.includes(itemId) || safeAmount <= 0 || current < safeAmount) {
        return false;
    }

    inventory[itemId] = current - safeAmount;
    return true;
}

module.exports = {
    INVENTORY_KEYS,
    ensureInventoryShape,
    getInventorySnapshot,
    addInventoryItem,
    removeInventoryItem
};
