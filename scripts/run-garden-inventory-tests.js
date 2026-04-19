const assert = require('assert');

const ASSETS = require('../config/gardenAssets');
const {
    INVENTORY_KEYS,
    ensureInventoryShape,
    getInventorySnapshot,
    addInventoryItem
} = require('../services/gardenInventoryService');

function runTest(name, fn) {
    try {
        fn();
        console.log(`PASS ${name}`);
    } catch (error) {
        console.error(`FAIL ${name}`);
        throw error;
    }
}

runTest('inventory keys mirror the plant catalog', () => {
    assert.deepStrictEqual(
        [...INVENTORY_KEYS].sort(),
        Object.keys(ASSETS.PLANTS || {}).sort()
    );
});

runTest('ensureInventoryShape seeds every plant slot with numeric defaults', () => {
    const garden = { inventory: { sunflower: 3, watermelon: '2' } };
    const inventory = ensureInventoryShape(garden);

    INVENTORY_KEYS.forEach((key) => {
        assert.ok(Object.prototype.hasOwnProperty.call(inventory, key));
        assert.ok(Number.isInteger(inventory[key]));
        assert.ok(inventory[key] >= 0);
    });
});

runTest('addInventoryItem accepts later-unlock crops', () => {
    const garden = { inventory: {} };
    const snapshot = addInventoryItem(garden, 'watermelon', 2);

    assert.strictEqual(snapshot.watermelon, 2);
    assert.strictEqual(getInventorySnapshot(garden).watermelon, 2);
});
