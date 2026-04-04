const crypto = require('crypto');
const { sanitizePlainText, extractLessonBlockKeys } = require('./lessonAnchorUtils');

const REWARD_EVENT_TYPES = [
    'scroll_checkpoint',
    'video_finished',
    'flashcard_review',
    'quiz_passed',
    'lesson_completed'
];

const REWARD_TYPES = ['water', 'fertilizer', 'gold', 'bundle'];

function normalizeCheckpointKey(value) {
    return sanitizePlainText(value, { maxLength: 120 });
}

function isSupportedRewardEventType(value) {
    return REWARD_EVENT_TYPES.includes(String(value || '').trim());
}

function isSupportedRewardType(value) {
    return REWARD_TYPES.includes(String(value || '').trim());
}

function deterministicRatio(seed) {
    const hash = crypto.createHash('sha1').update(String(seed || '')).digest('hex');
    const slice = hash.slice(0, 8);
    return parseInt(slice, 16) / 0xffffffff;
}

function toPercent(seed) {
    return Math.round(deterministicRatio(seed) * 100);
}

function countNonCompletionDrops(events = []) {
    return events.filter((event) => event && event.eventType !== 'lesson_completed').length;
}

function lessonHasCheckpoint(lesson, checkpointKey) {
    const normalizedKey = normalizeCheckpointKey(checkpointKey);
    if (!normalizedKey) return false;
    const blockKeys = extractLessonBlockKeys(lesson);
    if (blockKeys.size === 0) return true;
    return blockKeys.has(normalizedKey);
}

function createRewardPresentation(rewardType, rewardAmount, sourceLabel = '') {
    const amount = Number(rewardAmount || 0);
    const label = sanitizePlainText(sourceLabel, { maxLength: 120 }) || 'Kho báu ẩn';

    if (rewardType === 'water') {
        return {
            icon: '💧',
            title: `+${amount} nước`,
            subtitle: `${label} vừa làm khu vườn của bạn tươi hơn`
        };
    }

    if (rewardType === 'fertilizer') {
        return {
            icon: '🪴',
            title: `+${amount} phân bón`,
            subtitle: `${label} để dành cho lần tăng tốc kế tiếp`
        };
    }

    if (rewardType === 'gold') {
        return {
            icon: '🪙',
            title: `+${amount} vàng`,
            subtitle: `${label} thưởng cho nhịp học bền bỉ`
        };
    }

    return {
        icon: '🎁',
        title: 'Phần thưởng bài học',
        subtitle: label
    };
}

function determineRevealReward({
    userId,
    lessonId,
    eventType,
    checkpointKey,
    meta = {},
    existingRewardCount = 0
}) {
    if (!isSupportedRewardEventType(eventType) || eventType === 'lesson_completed') {
        return null;
    }

    if (existingRewardCount >= 2) {
        return null;
    }

    const seed = `${userId}|${lessonId}|${eventType}|${checkpointKey}`;
    const roll = toPercent(seed);
    const progressPercent = Math.max(0, Math.min(100, Number(meta.progressPercent || 0)));
    const headingLevel = Math.max(1, Math.min(4, Number(meta.headingLevel || 2)));
    const quality = Math.max(0, Math.min(5, Number(meta.quality || 0)));

    if (eventType === 'scroll_checkpoint') {
        if (progressPercent < 18) return null;
        const threshold = headingLevel <= 2 ? 46 : 28;
        if (roll > threshold) return null;

        if (roll <= 14) {
            return {
                rewardType: 'gold',
                rewardAmount: 20 + Math.max(10, Math.round(progressPercent / 3)),
                sourceLabel: 'Kho báu ẩn của chương khó'
            };
        }

        return {
            rewardType: 'water',
            rewardAmount: progressPercent >= 58 ? 2 : 1,
            sourceLabel: 'Giọt nước kiến thức'
        };
    }

    if (eventType === 'video_finished') {
        return roll <= 58
            ? {
                rewardType: 'fertilizer',
                rewardAmount: 1,
                sourceLabel: 'Quà xem trọn video'
            }
            : {
                rewardType: 'gold',
                rewardAmount: 45,
                sourceLabel: 'Quà xem trọn video'
            };
    }

    if (eventType === 'quiz_passed') {
        return {
            rewardType: 'gold',
            rewardAmount: 60,
            sourceLabel: 'Thưởng vượt checkpoint'
        };
    }

    if (eventType === 'flashcard_review') {
        if (quality < 3) return null;
        return roll <= 42
            ? {
                rewardType: 'fertilizer',
                rewardAmount: 1,
                sourceLabel: 'Mảnh ghép ghi nhớ'
            }
            : {
                rewardType: 'water',
                rewardAmount: 2,
                sourceLabel: 'Mảnh ghép ghi nhớ'
            };
    }

    return null;
}

function buildCompletionGardenBundle(level) {
    const currentLevel = Math.max(1, Number(level || 1));
    return {
        water: currentLevel,
        gold: Math.floor(50 * Math.pow(currentLevel, 1.5)),
        fertilizer: 0
    };
}

function buildCompletionCelebrationPayload({
    lessonTitle,
    points,
    xp,
    streak,
    isLevelUp,
    achievements = [],
    nextLesson = null,
    gardenRewards = {}
}) {
    return {
        headline: isLevelUp ? 'Lên cấp rồi!' : 'Hoàn thành bài học!',
        subheadline: isLevelUp
            ? 'Bạn vừa vượt thêm một mốc học tập và mang quà về cho khu vườn.'
            : 'Bạn đã chốt xong bài học này với một cú về đích rất gọn.',
        lessonTitle: sanitizePlainText(lessonTitle, { maxLength: 180 }),
        rewards: {
            points: Number(points || 0),
            xp: Number(xp || 0),
            water: Number(gardenRewards.water || 0),
            gold: Number(gardenRewards.gold || 0),
            fertilizer: Number(gardenRewards.fertilizer || 0)
        },
        streak: Number(streak || 0),
        isLevelUp: Boolean(isLevelUp),
        achievements: Array.isArray(achievements) ? achievements : [],
        nextLesson: nextLesson || null
    };
}

module.exports = {
    REWARD_EVENT_TYPES,
    REWARD_TYPES,
    normalizeCheckpointKey,
    isSupportedRewardEventType,
    isSupportedRewardType,
    deterministicRatio,
    countNonCompletionDrops,
    lessonHasCheckpoint,
    createRewardPresentation,
    determineRevealReward,
    buildCompletionGardenBundle,
    buildCompletionCelebrationPayload
};
