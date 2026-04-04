const assert = require('assert');
const {
    normalizeCheckpointKey,
    deterministicRatio,
    countNonCompletionDrops,
    lessonHasCheckpoint,
    createRewardPresentation,
    determineRevealReward,
    buildCompletionGardenBundle,
    buildCompletionCelebrationPayload
} = require('../utils/lessonGamificationUtils');

function testCheckpointNormalization() {
    assert.strictEqual(normalizeCheckpointKey('  heading-1  '), 'heading-1');
}

function testDeterministicRatio() {
    const first = deterministicRatio('user-1|lesson-1|scroll|block-a');
    const second = deterministicRatio('user-1|lesson-1|scroll|block-a');
    assert.strictEqual(first, second, 'Tỉ lệ hash phải ổn định với cùng seed');
    assert.ok(first >= 0 && first <= 1, 'Tỉ lệ hash phải nằm trong đoạn 0..1');
}

function testDropCounting() {
    const count = countNonCompletionDrops([
        { eventType: 'scroll_checkpoint' },
        { eventType: 'lesson_completed' },
        { eventType: 'video_finished' }
    ]);
    assert.strictEqual(count, 2, 'Chỉ đếm reward drop, không đếm lesson_completed');
}

function testLessonCheckpointValidation() {
    const lesson = {
        content: JSON.stringify([
            { id: 'heading-intro', type: 'header', data: { text: 'Mở đầu' } },
            { id: 'text-main', type: 'text', data: { text: 'Xin chào' } }
        ])
    };

    assert.strictEqual(lessonHasCheckpoint(lesson, 'heading-intro'), true);
    assert.strictEqual(lessonHasCheckpoint(lesson, 'missing-key'), false);
}

function testRevealRewardRules() {
    const reward = determineRevealReward({
        userId: 'user-1',
        lessonId: 'lesson-1',
        eventType: 'video_finished',
        checkpointKey: 'video-1',
        meta: { progressPercent: 66 },
        existingRewardCount: 0
    });

    assert.ok(reward, 'Video checkpoint hợp lệ phải có thể tạo reward');
    assert.ok(['fertilizer', 'gold'].includes(reward.rewardType));

    const blocked = determineRevealReward({
        userId: 'user-1',
        lessonId: 'lesson-1',
        eventType: 'scroll_checkpoint',
        checkpointKey: 'heading-1',
        meta: { progressPercent: 12, headingLevel: 2 },
        existingRewardCount: 0
    });
    assert.strictEqual(blocked, null, 'Checkpoint quá sớm không nên reveal reward');
}

function testPresentation() {
    const presentation = createRewardPresentation('water', 2, 'Kho báu ẩn');
    assert.strictEqual(presentation.icon, '💧');
    assert.ok(presentation.title.includes('+2'));
}

function testCompletionBundle() {
    const bundle = buildCompletionGardenBundle(3);
    assert.strictEqual(bundle.water, 3);
    assert.ok(bundle.gold > 0);
}

function testCelebrationPayload() {
    const payload = buildCompletionCelebrationPayload({
        lessonTitle: 'Bài học thử',
        points: 10,
        xp: 12,
        streak: 3,
        isLevelUp: true,
        achievements: [{ name: 'Mốc mới' }],
        nextLesson: { url: '/lesson/next', title: 'Bài tiếp' },
        gardenRewards: { water: 2, gold: 40, fertilizer: 0 }
    });

    assert.strictEqual(payload.lessonTitle, 'Bài học thử');
    assert.strictEqual(payload.rewards.water, 2);
    assert.strictEqual(payload.isLevelUp, true);
    assert.strictEqual(payload.nextLesson.url, '/lesson/next');
}

function run() {
    testCheckpointNormalization();
    testDeterministicRatio();
    testDropCounting();
    testLessonCheckpointValidation();
    testRevealRewardRules();
    testPresentation();
    testCompletionBundle();
    testCelebrationPayload();
    console.log('Lesson gamification OK.');
}

run();
