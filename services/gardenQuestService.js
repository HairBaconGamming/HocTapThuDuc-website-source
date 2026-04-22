const Garden = require('../models/Garden');

const QUEST_TIMEZONE = 'Asia/Ho_Chi_Minh';
const MAX_DAILY_QUESTS = 5;
const RICH_FARMER_BASE_TARGET = 500;
const RICH_FARMER_TARGET_GROWTH = 1.08;

/**
 * Full quest pool — 15 diverse quest definitions.
 * Each quest has a unique id, metric to track, baseline key, target, icon, and base rewards.
 * Rewards will be scaled by user level at runtime.
 */
const QUEST_POOL = [
    {
        id: 'water-3',
        title: 'Tưới cây siêng năng',
        description: 'Tưới 3 lần để giữ vườn ẩm trong ngày.',
        metric: 'waterCount',
        baselineKey: 'waterCount',
        target: 3,
        icon: '💧',
        category: 'water',
        baseRewards: { water: 2 }
    },
    {
        id: 'water-5',
        title: 'Thủy sư chăm chỉ',
        description: 'Tưới nước 5 lần — giữ cho linh mạch luôn dồi dào.',
        metric: 'waterCount',
        baselineKey: 'waterCount',
        target: 5,
        icon: '🌊',
        category: 'water',
        baseRewards: { water: 3, gold: 30 }
    },
    {
        id: 'water-10',
        title: 'Đại Thủy Sư',
        description: 'Tưới nước 10 lần — thể hiện sự tận tâm với khu vườn.',
        metric: 'waterCount',
        baselineKey: 'waterCount',
        target: 10,
        icon: '🌀',
        category: 'water',
        baseRewards: { water: 5, gold: 80 }
    },
    {
        id: 'plant-2',
        title: 'Gieo hạt mới',
        description: 'Trồng 2 cây mới để mở rộng khu vườn.',
        metric: 'plantCount',
        baselineKey: 'plantCount',
        target: 2,
        icon: '🌱',
        category: 'plant',
        baseRewards: { fertilizer: 1, gold: 40 }
    },
    {
        id: 'plant-4',
        title: 'Nông dân cần mẫn',
        description: 'Trồng 4 cây — mở rộng quy mô canh tác.',
        metric: 'plantCount',
        baselineKey: 'plantCount',
        target: 4,
        icon: '🌿',
        category: 'plant',
        baseRewards: { fertilizer: 2, gold: 80 }
    },
    {
        id: 'harvest-2',
        title: 'Thu hoạch đầu ngày',
        description: 'Thu hoạch 2 cây chín để nhận thưởng thêm.',
        metric: 'harvestCount',
        baselineKey: 'harvestCount',
        target: 2,
        icon: '🧺',
        category: 'harvest',
        baseRewards: { gold: 120, fertilizer: 1 }
    },
    {
        id: 'harvest-5',
        title: 'Mùa bội thu',
        description: 'Thu hoạch 5 cây — chuẩn bị kho lương thực dồi dào.',
        metric: 'harvestCount',
        baselineKey: 'harvestCount',
        target: 5,
        icon: '🌾',
        category: 'harvest',
        baseRewards: { gold: 250, water: 2 }
    },
    {
        id: 'harvest-10',
        title: 'Đại Thu Hoạch',
        description: 'Thu hoạch 10 cây — đây là vụ thu hoạch lịch sử!',
        metric: 'harvestCount',
        baselineKey: 'harvestCount',
        target: 10,
        icon: '🏆',
        category: 'harvest',
        baseRewards: { gold: 500, fertilizer: 3 }
    },
    {
        id: 'decorate-1',
        title: 'Trang trí khu vườn',
        description: 'Đặt 1 vật trang trí để làm đẹp không gian.',
        metric: 'decorationCount',
        baselineKey: 'decorationCount',
        target: 1,
        icon: '🎨',
        category: 'decorate',
        baseRewards: { gold: 60 }
    },
    {
        id: 'decorate-3',
        disabled: true,
        title: 'Kiến trúc sư',
        description: 'Đặt 3 vật trang trí — biến khu vườn thành tác phẩm nghệ thuật.',
        metric: 'decorationCount',
        baselineKey: 'decorationCount',
        target: 3,
        icon: '🏡',
        category: 'decorate',
        baseRewards: { gold: 150, water: 1 }
    },
    {
        id: 'gold-200',
        title: 'Tích lũy vàng',
        description: 'Thu được tổng cộng 200 vàng từ các hoạt động hôm nay.',
        metric: 'totalGoldCollected',
        baselineKey: 'totalGoldCollected',
        target: 200,
        icon: '💰',
        category: 'gold',
        baseRewards: { water: 2, fertilizer: 1 }
    },
    {
        id: 'gold-500',
        title: 'Phú ông nông trại',
        description: 'Thu được tổng cộng 500 vàng — tay buôn thứ thiệt!',
        metric: 'totalGoldCollected',
        baselineKey: 'totalGoldCollected',
        target: RICH_FARMER_BASE_TARGET,
        targetScaling: {
            mode: 'exponential',
            factor: RICH_FARMER_TARGET_GROWTH
        },
        icon: '👑',
        category: 'gold',
        baseRewards: { water: 3, fertilizer: 2 }
    },
    {
        id: 'lesson-1',
        title: 'Hoàn thành bài học',
        description: 'Hoàn thành 1 bài học trong ngày để nhận thêm tài nguyên cho nông trại.',
        metric: 'lessonCompleteCount',
        baselineKey: 'lessonCompleteCount',
        target: 1,
        icon: '📘',
        category: 'lesson',
        baseRewards: { gold: 120, water: 1, fertilizer: 1 }
    },
    {
        id: 'fertilize-2',
        title: 'Bón phân cần mẫn',
        description: 'Bón phân cho 2 cây để tăng tốc quá trình sinh trưởng.',
        metric: 'fertilizeCount',
        baselineKey: 'fertilizeCount',
        target: 2,
        icon: '🧪',
        category: 'fertilize',
        baseRewards: { gold: 80, water: 1 }
    },
    {
        id: 'fertilize-5',
        title: 'Chuyên gia phân bón',
        description: 'Bón phân cho 5 cây — linh dược phát triển vượt bậc!',
        metric: 'fertilizeCount',
        baselineKey: 'fertilizeCount',
        target: 5,
        icon: '⚗️',
        category: 'fertilize',
        baseRewards: { gold: 180, fertilizer: 2 }
    },
    {
        id: 'plant-6',
        title: 'Đại nông gia',
        description: 'Trồng 6 cây trong một ngày — quy mô vườn bùng nổ!',
        metric: 'plantCount',
        baselineKey: 'plantCount',
        target: 6,
        icon: '🌳',
        category: 'plant',
        baseRewards: { gold: 200, water: 2, fertilizer: 1 }
    }
];

/**
 * Simple seeded PRNG (mulberry32) for deterministic quest selection.
 * Given the same seed, always produces the same sequence.
 */
function seededRandom(seed) {
    let t = (seed + 0x6D2B79F5) | 0;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/**
 * Hash a string to a numeric seed.
 */
function hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash | 0;
    }
    return Math.abs(hash);
}

function deterministicShuffle(list, seedKey) {
    const items = [...list];

    for (let i = items.length - 1; i > 0; i -= 1) {
        const seed = hashString(`${seedKey}-${i}`);
        const swapIndex = Math.floor(seededRandom(seed) * (i + 1));
        [items[i], items[swapIndex]] = [items[swapIndex], items[i]];
    }

    return items;
}

/**
 * Select N unique quests from the pool using a deterministic seed.
 * Ensures no two quests share the same category when possible.
 */
function selectDailyQuests(userId, dateKey, count = MAX_DAILY_QUESTS) {
    const seedStr = `${userId}-${dateKey}-quest-v2`;
    const pool = QUEST_POOL.filter((quest) => !quest.disabled);
    const groupedByCategory = new Map();
    const selected = [];
    const selectedIds = new Set();

    pool.forEach((quest) => {
        if (!groupedByCategory.has(quest.category)) {
            groupedByCategory.set(quest.category, []);
        }
        groupedByCategory.get(quest.category).push(quest);
    });

    const categories = deterministicShuffle([...groupedByCategory.keys()], `${seedStr}-categories`);
    for (const cat of categories) {
        if (selected.length >= count) break;
        const catQuests = deterministicShuffle(
            groupedByCategory.get(cat) || [],
            `${seedStr}-${cat}`
        );
        if (catQuests.length > 0) {
            selected.push(catQuests[0]);
            selectedIds.add(catQuests[0].id);
        }
    }

    const remaining = deterministicShuffle(
        pool.filter((quest) => !selectedIds.has(quest.id)),
        `${seedStr}-remaining`
    );
    while (selected.length < count && remaining.length > 0) {
        selected.push(remaining.shift());
    }

    return selected.slice(0, count);
}

/**
 * Scale rewards based on user level.
 * Formula: base * (1 + 0.15 * (level - 1)), capped at 5x base
 */
function scaleRewards(baseRewards, userLevel = 1) {
    const multiplier = Math.min(5, 1 + 0.15 * (Math.max(1, userLevel) - 1));
    const scaled = {};

    if (baseRewards.gold) {
        scaled.gold = Math.round(baseRewards.gold * multiplier);
    }
    if (baseRewards.water) {
        scaled.water = Math.round(baseRewards.water * multiplier);
    }
    if (baseRewards.fertilizer) {
        scaled.fertilizer = Math.round(baseRewards.fertilizer * multiplier);
    }

    return scaled;
}

function resolveQuestTarget(quest, userLevel = 1) {
    const baseTarget = Math.max(1, Number(quest?.target || 1));
    const scaling = quest?.targetScaling;
    const safeLevel = Math.max(1, Math.floor(Number(userLevel) || 1));

    if (!scaling || scaling.mode !== 'exponential') {
        return baseTarget;
    }

    const factor = Math.max(1.01, Number(scaling.factor || 1.05));
    return Math.max(baseTarget, Math.round(baseTarget * Math.pow(factor, safeLevel - 1)));
}

function getGardenDateKey(date = new Date()) {
    const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: QUEST_TIMEZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    });
    const parts = formatter.formatToParts(date);
    const year = parts.find((entry) => entry.type === 'year')?.value;
    const month = parts.find((entry) => entry.type === 'month')?.value;
    const day = parts.find((entry) => entry.type === 'day')?.value;

    return `${year}-${month}-${day}`;
}

function buildFreshQuestState(garden, dateKey, userId) {
    const activeQuestIds = selectDailyQuests(userId || String(garden.user), dateKey)
        .map(q => q.id);

    return {
        dateKey,
        waterCount: garden.waterCount || 0,
        harvestCount: garden.harvestCount || 0,
        plantCount: garden.plantCount || 0,
        decorationCount: garden.decorationCount || 0,
        totalGoldCollected: garden.totalGoldCollected || 0,
        fertilizeCount: garden.fertilizeCount || 0,
        lessonCompleteCount: garden.lessonCompleteCount || 0,
        activeQuestIds,
        claimedQuestIds: []
    };
}

function getQuestState(garden, dateKey = getGardenDateKey()) {
    const state = garden.dailyQuestState;
    if (!state || state.dateKey !== dateKey) {
        return buildFreshQuestState(garden, dateKey);
    }

    return {
        dateKey: state.dateKey,
        waterCount: state.waterCount || 0,
        harvestCount: state.harvestCount || 0,
        plantCount: state.plantCount || 0,
        decorationCount: state.decorationCount || 0,
        totalGoldCollected: state.totalGoldCollected || 0,
        fertilizeCount: state.fertilizeCount || 0,
        lessonCompleteCount: state.lessonCompleteCount || 0,
        activeQuestIds: Array.isArray(state.activeQuestIds) ? [...state.activeQuestIds] : [],
        claimedQuestIds: Array.isArray(state.claimedQuestIds) ? [...state.claimedQuestIds] : []
    };
}

async function ensureDailyQuestState(garden, options = {}) {
    const { persist = false, date = new Date() } = options;
    const dateKey = getGardenDateKey(date);
    const currentState = garden.dailyQuestState;

    if (currentState && currentState.dateKey === dateKey) {
        return getQuestState(garden, dateKey);
    }

    const nextState = buildFreshQuestState(garden, dateKey);
    garden.dailyQuestState = nextState;

    if (persist) {
        await garden.save();
    }

    return nextState;
}

function buildDailyQuests(garden, options = {}) {
    const { date = new Date(), userLevel = 1 } = options;
    const dateKey = getGardenDateKey(date);
    const state = getQuestState(garden, dateKey);

    // Get the active quest definitions for today
    const activeIds = state.activeQuestIds;
    let activeQuests;

    if (activeIds && activeIds.length > 0) {
        activeQuests = activeIds
            .map(id => QUEST_POOL.find(q => q.id === id))
            .filter((quest) => quest && !quest.disabled);
    } else {
        // Fallback: select fresh quests
        activeQuests = selectDailyQuests(String(garden.user), dateKey);
    }

    if (activeQuests.length < MAX_DAILY_QUESTS) {
        const seenQuestIds = new Set(activeQuests.map((quest) => quest.id));
        const fallbackQuests = selectDailyQuests(String(garden.user), dateKey);
        fallbackQuests.forEach((quest) => {
            if (activeQuests.length >= MAX_DAILY_QUESTS) return;
            if (!seenQuestIds.has(quest.id)) {
                activeQuests.push(quest);
                seenQuestIds.add(quest.id);
            }
        });
    }

    return activeQuests.map((quest) => {
        const currentValue = garden[quest.metric] || 0;
        const baselineValue = state[quest.baselineKey] || 0;
        const progress = Math.max(0, currentValue - baselineValue);
        const target = resolveQuestTarget(quest, userLevel);
        const claimed = state.claimedQuestIds.includes(quest.id);
        const complete = progress >= target;
        const scaledRewards = scaleRewards(quest.baseRewards, userLevel);

        return {
            id: quest.id,
            title: quest.title,
            description: quest.description,
            icon: quest.icon,
            category: quest.category,
            progress: Math.min(progress, target),
            target,
            claimed,
            complete,
            rewards: scaledRewards
        };
    });
}

async function recordLessonCompletion(userId, amount = 1) {
    const safeAmount = Math.max(0, Math.floor(Number(amount || 0)));
    if (!safeAmount) return null;

    return Garden.findOneAndUpdate(
        { user: userId },
        { $inc: { lessonCompleteCount: safeAmount } },
        { new: true, upsert: true, setDefaultsOnInsert: true }
    );
}

async function claimDailyQuest(userId, questId, userLevel = 1) {
    const garden = await Garden.findOne({ user: userId });
    if (!garden) {
        throw new Error('Garden not found');
    }

    const state = await ensureDailyQuestState(garden, { persist: true });
    const quest = buildDailyQuests(garden, { userLevel }).find((entry) => entry.id === questId);

    if (!quest) {
        return { success: false, msg: 'Nhiệm vụ không tồn tại.' };
    }

    if (state.claimedQuestIds.includes(questId)) {
        return { success: false, msg: 'Bạn đã nhận thưởng nhiệm vụ này rồi.' };
    }

    if (!quest.complete) {
        return { success: false, msg: 'Nhiệm vụ chưa hoàn thành.' };
    }

    const reward = quest.rewards || {};
    if (reward.gold) garden.gold = (garden.gold || 0) + reward.gold;
    if (reward.water) garden.water = (garden.water || 0) + reward.water;
    if (reward.fertilizer) garden.fertilizer = (garden.fertilizer || 0) + reward.fertilizer;

    garden.dailyQuestState.claimedQuestIds = [...state.claimedQuestIds, questId];
    await garden.save();

    return {
        success: true,
        msg: 'Đã nhận thưởng nhiệm vụ hôm nay!',
        newGold: garden.gold,
        newWater: garden.water,
        newFertilizer: garden.fertilizer,
        dailyQuests: buildDailyQuests(garden, { userLevel })
    };
}

module.exports = {
    QUEST_POOL,
    MAX_DAILY_QUESTS,
    getGardenDateKey,
    getQuestState,
    ensureDailyQuestState,
    buildDailyQuests,
    claimDailyQuest,
    scaleRewards,
    resolveQuestTarget,
    recordLessonCompletion
};
