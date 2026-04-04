const assert = require('assert');
const {
    getContributionValue,
    getGuildTreeStageData,
    buildGuildTreeProgress,
    buildGuildBuffSnapshot
} = require('../utils/guildTreeUtils');

function runTest(name, fn) {
    try {
        fn();
        console.log(`PASS ${name}`);
    } catch (error) {
        console.error(`FAIL ${name}`);
        throw error;
    }
}

runTest('guild contribution values scale by resource weight', () => {
    assert.strictEqual(getContributionValue('water', 2), 12);
    assert.strictEqual(getContributionValue('tomato', 3), 135);
    assert.strictEqual(getContributionValue('invalid', 5), 0);
});

runTest('guild tree stage selection follows xp thresholds', () => {
    assert.strictEqual(getGuildTreeStageData(0).stage, 0);
    assert.strictEqual(getGuildTreeStageData(121).stage, 1);
    assert.strictEqual(getGuildTreeStageData(5000).stage, 8);
    assert.strictEqual(getGuildTreeStageData(999999).stage, 9);
});

runTest('guild tree progress exposes next stage information', () => {
    const progress = buildGuildTreeProgress(700);
    assert.strictEqual(progress.current.stage, 3);
    assert.strictEqual(progress.next.stage, 4);
    assert.ok(progress.percent > 0 && progress.percent < 100);
});

runTest('guild buffs mirror current tree stage', () => {
    const buffs = buildGuildBuffSnapshot(6800);
    assert.strictEqual(buffs.lessonXpPct, 25);
    assert.strictEqual(buffs.witherTimeBonusPct, 25);
});

console.log('Guild tree utilities OK.');
