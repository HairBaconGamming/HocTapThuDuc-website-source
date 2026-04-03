const assert = require('assert');

const {
  GRID_SIZE,
  WORLD_SIZE,
  MOISTURE_DURATION,
  parseDuration,
  isValidGridCoordinate,
  isValidCameraState,
  applyGardenState,
  syncGardenState
} = require('../services/gardenStateService');

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function runTest(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

runTest('parseDuration handles minutes and hours', () => {
  assert.strictEqual(parseDuration('5 phút'), 5 * 60 * 1000);
  assert.strictEqual(parseDuration('2 giờ'), 2 * 60 * 60 * 1000);
  assert.strictEqual(parseDuration('15'), 15 * 60 * 1000);
});

runTest('grid coordinate validation enforces tile boundaries', () => {
  assert.strictEqual(isValidGridCoordinate(0), true);
  assert.strictEqual(isValidGridCoordinate(GRID_SIZE * 3), true);
  assert.strictEqual(isValidGridCoordinate(-GRID_SIZE), false);
  assert.strictEqual(isValidGridCoordinate(63), false);
  assert.strictEqual(isValidGridCoordinate(WORLD_SIZE), false);
});

runTest('camera validation enforces world bounds and zoom limits', () => {
  assert.strictEqual(isValidCameraState({ x: WORLD_SIZE / 2, y: WORLD_SIZE / 2, zoom: 1 }), true);
  assert.strictEqual(isValidCameraState({ x: -1, y: 0, zoom: 1 }), false);
  assert.strictEqual(isValidCameraState({ x: 0, y: WORLD_SIZE + 1, zoom: 1 }), false);
  assert.strictEqual(isValidCameraState({ x: 0, y: 0, zoom: 0.1 }), false);
});

runTest('applyGardenState dries expired plots without saving', () => {
  const now = new Date('2026-04-03T10:00:00.000Z');
  const garden = {
    items: [
      {
        type: 'plot',
        x: 0,
        y: 0,
        lastWatered: new Date(now.getTime() - MOISTURE_DURATION - 60 * 1000),
        lastUpdated: new Date(now.getTime() - 10 * 60 * 1000)
      }
    ]
  };

  const changed = applyGardenState(garden, now);
  assert.strictEqual(changed, true);
  assert.strictEqual(garden.items[0].lastWatered, null);
  assert.strictEqual(new Date(garden.items[0].lastUpdated).toISOString(), now.toISOString());
});

runTest('applyGardenState grows wet plants over time', () => {
  const now = new Date('2026-04-03T10:00:00.000Z');
  const garden = {
    items: clone([
      {
        type: 'plot',
        x: 0,
        y: 0,
        lastWatered: new Date(now.getTime() - 10 * 60 * 1000),
        lastUpdated: new Date(now.getTime() - 10 * 60 * 1000)
      },
      {
        type: 'plant',
        itemId: 'sunflower',
        x: 0,
        y: 0,
        stage: 0,
        growthProgress: 0,
        witherProgress: 0,
        isDead: false,
        plantedAt: new Date(now.getTime() - 10 * 60 * 1000),
        lastUpdated: new Date(now.getTime() - 5 * 60 * 1000)
      }
    ])
  };

  const changed = applyGardenState(garden, now);
  assert.strictEqual(changed, true);
  assert.strictEqual(garden.items[1].stage, 1);
  assert.ok(garden.items[1].growthProgress >= 5 * 60 * 1000);
});

runTest('applyGardenState kills dry plants after wither limit', () => {
  const now = new Date('2026-04-03T10:00:00.000Z');
  const garden = {
    items: clone([
      {
        type: 'plot',
        x: 0,
        y: 0,
        lastWatered: null,
        lastUpdated: new Date(now.getTime() - 2 * 60 * 60 * 1000)
      },
      {
        type: 'plant',
        itemId: 'sunflower',
        x: 0,
        y: 0,
        stage: 1,
        growthProgress: 0,
        witherProgress: 0,
        isDead: false,
        plantedAt: new Date(now.getTime() - 2 * 60 * 60 * 1000),
        lastUpdated: new Date(now.getTime() - 61 * 60 * 1000)
      }
    ])
  };

  const changed = applyGardenState(garden, now);
  assert.strictEqual(changed, true);
  assert.strictEqual(garden.items[1].isDead, true);
  assert.ok(garden.items[1].witherProgress >= 61 * 60 * 1000);
});

async function runAsyncTests() {
  const now = new Date('2026-04-03T10:00:00.000Z');

  let saveCalls = 0;
  const changedGarden = {
    items: [
      {
        type: 'plot',
        x: 0,
        y: 0,
        lastWatered: new Date(now.getTime() - MOISTURE_DURATION - 1000),
        lastUpdated: new Date(now.getTime() - 1000)
      }
    ],
    async save() {
      saveCalls += 1;
    }
  };

  const result = await syncGardenState(changedGarden, { persist: true, now });
  assert.strictEqual(result.changed, true);
  assert.strictEqual(saveCalls, 1);

  const stableGarden = {
    items: [
      {
        type: 'plot',
        x: 0,
        y: 0,
        lastWatered: null,
        lastUpdated: now
      }
    ],
    async save() {
      saveCalls += 1;
    }
  };

  const stableResult = await syncGardenState(stableGarden, { persist: true, now });
  assert.strictEqual(stableResult.changed, false);
  assert.strictEqual(saveCalls, 1);

  console.log('PASS syncGardenState persists only when state changes');
}

runAsyncTests().catch((error) => {
  console.error('FAIL syncGardenState persists only when state changes');
  console.error(error);
  process.exit(1);
});
