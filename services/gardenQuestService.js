const Garden = require('../models/Garden');

const QUEST_TIMEZONE = 'Asia/Ho_Chi_Minh';

const QUEST_DEFINITIONS = [
    {
        id: 'water-3',
        title: 'Tuoi Cay',
        description: 'Tuoi 3 lan de giu vuon am trong ngay.',
        metric: 'waterCount',
        baselineKey: 'waterCount',
        target: 3,
        rewards: { water: 2 }
    },
    {
        id: 'plant-2',
        title: 'Trong Moi',
        description: 'Trong 2 cay moi de mo rong khu vuon.',
        metric: 'plantCount',
        baselineKey: 'plantCount',
        target: 2,
        rewards: { fertilizer: 1, gold: 40 }
    },
    {
        id: 'harvest-2',
        title: 'Thu Hoach',
        description: 'Thu hoach 2 cay chin de nhan thuong them.',
        metric: 'harvestCount',
        baselineKey: 'harvestCount',
        target: 2,
        rewards: { gold: 120, fertilizer: 1 }
    }
];

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

function buildFreshQuestState(garden, dateKey) {
    return {
        dateKey,
        waterCount: garden.waterCount || 0,
        harvestCount: garden.harvestCount || 0,
        plantCount: garden.plantCount || 0,
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
    const { date = new Date() } = options;
    const dateKey = getGardenDateKey(date);
    const state = getQuestState(garden, dateKey);

    return QUEST_DEFINITIONS.map((quest) => {
        const currentValue = garden[quest.metric] || 0;
        const baselineValue = state[quest.baselineKey] || 0;
        const progress = Math.max(0, currentValue - baselineValue);
        const claimed = state.claimedQuestIds.includes(quest.id);
        const complete = progress >= quest.target;

        return {
            id: quest.id,
            title: quest.title,
            description: quest.description,
            progress: Math.min(progress, quest.target),
            target: quest.target,
            claimed,
            complete,
            rewards: quest.rewards
        };
    });
}

async function claimDailyQuest(userId, questId) {
    const garden = await Garden.findOne({ user: userId });
    if (!garden) {
        throw new Error('Garden not found');
    }

    const state = await ensureDailyQuestState(garden, { persist: true });
    const quest = buildDailyQuests(garden).find((entry) => entry.id === questId);

    if (!quest) {
        return { success: false, msg: 'Nhiem vu khong ton tai.' };
    }

    if (state.claimedQuestIds.includes(questId)) {
        return { success: false, msg: 'Ban da nhan thuong nhiem vu nay roi.' };
    }

    if (!quest.complete) {
        return { success: false, msg: 'Nhiem vu chua hoan thanh.' };
    }

    const reward = quest.rewards || {};
    if (reward.gold) garden.gold = (garden.gold || 0) + reward.gold;
    if (reward.water) garden.water = (garden.water || 0) + reward.water;
    if (reward.fertilizer) garden.fertilizer = (garden.fertilizer || 0) + reward.fertilizer;

    garden.dailyQuestState.claimedQuestIds = [...state.claimedQuestIds, questId];
    await garden.save();

    return {
        success: true,
        msg: 'Da nhan thuong nhiem vu hom nay!',
        newGold: garden.gold,
        newWater: garden.water,
        newFertilizer: garden.fertilizer,
        dailyQuests: buildDailyQuests(garden)
    };
}

module.exports = {
    QUEST_DEFINITIONS,
    getGardenDateKey,
    getQuestState,
    ensureDailyQuestState,
    buildDailyQuests,
    claimDailyQuest
};
