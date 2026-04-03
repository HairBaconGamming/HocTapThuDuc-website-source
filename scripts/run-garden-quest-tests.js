const assert = require('assert');

const {
    getGardenDateKey,
    getQuestState,
    ensureDailyQuestState,
    buildDailyQuests
} = require('../services/gardenQuestService');

function runTest(name, fn) {
    try {
        fn();
        console.log(`PASS ${name}`);
    } catch (error) {
        console.error(`FAIL ${name}`);
        throw error;
    }
}

runTest('getGardenDateKey returns stable Asia/Ho_Chi_Minh date key', () => {
    const key = getGardenDateKey(new Date('2026-04-03T01:30:00.000Z'));
    assert.strictEqual(key, '2026-04-03');
});

runTest('buildDailyQuests uses daily baseline to calculate progress', () => {
    const date = new Date('2026-04-03T10:00:00.000Z');
    const dateKey = getGardenDateKey(date);
    const garden = {
        waterCount: 5,
        harvestCount: 3,
        plantCount: 4,
        dailyQuestState: {
            dateKey,
            waterCount: 2,
            harvestCount: 1,
            plantCount: 3,
            claimedQuestIds: ['plant-2']
        }
    };

    const quests = buildDailyQuests(garden, { date });
    const waterQuest = quests.find((entry) => entry.id === 'water-3');
    const plantQuest = quests.find((entry) => entry.id === 'plant-2');
    const harvestQuest = quests.find((entry) => entry.id === 'harvest-2');

    assert.strictEqual(waterQuest.progress, 3);
    assert.strictEqual(waterQuest.complete, true);
    assert.strictEqual(plantQuest.progress, 1);
    assert.strictEqual(plantQuest.claimed, true);
    assert.strictEqual(harvestQuest.progress, 2);
    assert.strictEqual(harvestQuest.complete, true);
});

runTest('getQuestState falls back to fresh baseline when day changes', () => {
    const date = new Date('2026-04-04T10:00:00.000Z');
    const state = getQuestState({
        waterCount: 7,
        harvestCount: 4,
        plantCount: 3,
        dailyQuestState: {
            dateKey: '2026-04-03',
            waterCount: 1,
            harvestCount: 1,
            plantCount: 1,
            claimedQuestIds: ['water-3']
        }
    }, getGardenDateKey(date));

    assert.strictEqual(state.waterCount, 7);
    assert.strictEqual(state.harvestCount, 4);
    assert.strictEqual(state.plantCount, 3);
    assert.deepStrictEqual(state.claimedQuestIds, []);
});

async function runAsyncTests() {
    let saveCalls = 0;
    const date = new Date('2026-04-05T10:00:00.000Z');
    const dateKey = getGardenDateKey(date);

    const garden = {
        waterCount: 9,
        harvestCount: 5,
        plantCount: 6,
        dailyQuestState: {
            dateKey: 'stale',
            waterCount: 0,
            harvestCount: 0,
            plantCount: 0,
            claimedQuestIds: []
        },
        async save() {
            saveCalls += 1;
        }
    };

    const state = await ensureDailyQuestState(garden, { persist: true, date });
    assert.strictEqual(saveCalls, 1);
    assert.strictEqual(state.dateKey, dateKey);
    assert.strictEqual(state.waterCount, 9);
    assert.strictEqual(state.harvestCount, 5);
    assert.strictEqual(state.plantCount, 6);
    console.log('PASS ensureDailyQuestState rotates stale quest baseline');
}

runAsyncTests().catch((error) => {
    console.error('FAIL ensureDailyQuestState rotates stale quest baseline');
    console.error(error);
    process.exit(1);
});
