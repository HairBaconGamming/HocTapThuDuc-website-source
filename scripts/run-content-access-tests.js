const assert = require('assert');
const mongoose = require('mongoose');
const {
    normalizeId,
    canManageCourse,
    canManageLesson
} = require('../utils/contentAccess');

function runTest(name, fn) {
    try {
        fn();
        console.log(`PASS ${name}`);
    } catch (error) {
        console.error(`FAIL ${name}`);
        throw error;
    }
}

runTest('normalizeId resolves raw ObjectId without recursing infinitely', () => {
    const objectId = new mongoose.Types.ObjectId();
    assert.strictEqual(normalizeId(objectId), objectId.toHexString());
});

runTest('normalizeId unwraps nested mongoose-style documents safely', () => {
    const objectId = new mongoose.Types.ObjectId();
    assert.strictEqual(normalizeId({ _id: objectId }), objectId.toHexString());
    assert.strictEqual(normalizeId({ id: objectId }), objectId.toHexString());
});

runTest('canManageCourse matches populated and raw author ids', () => {
    const userId = new mongoose.Types.ObjectId();
    const user = { _id: userId };

    assert.strictEqual(canManageCourse(user, { author: userId }), true);
    assert.strictEqual(canManageCourse(user, { author: { _id: userId } }), true);
});

runTest('canManageLesson still grants access for lesson creator', () => {
    const userId = new mongoose.Types.ObjectId();
    const user = { _id: userId };
    const lesson = { createdBy: { _id: userId } };

    assert.strictEqual(canManageLesson(user, lesson, null), true);
});

console.log('Content access utilities OK.');
