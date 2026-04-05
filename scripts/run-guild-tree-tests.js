const assert = require('assert');
const {
    getContributionValue,
    getSpiritTreeThreshold,
    getGuildTreeStageData,
    buildGuildTreeProgress,
    buildGuildBuffSnapshot,
    getContributionResourceMeta
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
    assert.strictEqual(getContributionValue('gold', 1), 0.1);
    assert.strictEqual(getContributionValue('invalid', 5), 0);
});

runTest('guild contribution meta stays available for the redesigned UI', () => {
    assert.strictEqual(getContributionResourceMeta('water').label, 'Nước');
    assert.strictEqual(getContributionResourceMeta('gold').icon, '🪙');
});

runTest('guild tree thresholds follow steeper exponential growth', () => {
    assert.strictEqual(getSpiritTreeThreshold(1), 1000);
    assert.strictEqual(getSpiritTreeThreshold(2), 3000);
    assert.strictEqual(getSpiritTreeThreshold(3), 9000);
    assert.strictEqual(getSpiritTreeThreshold(9), 6561000);
});

runTest('guild tree stage selection follows xp thresholds', () => {
    assert.strictEqual(getGuildTreeStageData(0).stage, 0);
    assert.strictEqual(getGuildTreeStageData(1000).stage, 1);
    assert.strictEqual(getGuildTreeStageData(9000).stage, 3);
    assert.strictEqual(getGuildTreeStageData(2200000).stage, 8);
    assert.strictEqual(getGuildTreeStageData(7000000).stage, 9);
});

runTest('guild tree progress exposes next stage information', () => {
    const progress = buildGuildTreeProgress(12000);
    assert.strictEqual(progress.current.stage, 3);
    assert.strictEqual(progress.next.stage, 4);
    assert.ok(progress.percent > 0 && progress.percent < 100);
    assert.ok(progress.xpForNextStage > 0);
});

runTest('guild buffs mirror current tree stage', () => {
    const buffs = buildGuildBuffSnapshot(6561000);
    assert.strictEqual(buffs.lessonXpPct, 25);
    assert.strictEqual(buffs.witherTimeBonusPct, 25);
});

console.log('Guild tree utilities OK.');
