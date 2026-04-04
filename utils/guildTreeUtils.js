const CONTRIBUTION_VALUES = Object.freeze({
    water: 6,
    fertilizer: 18,
    gold: 1,
    sunflower: 20,
    wheat: 35,
    carrot: 60,
    tomato: 45
});

const GUILD_TREE_STAGES = Object.freeze([
    {
        stage: 0,
        minXp: 0,
        name: 'Mầm Linh Thụ',
        motto: 'Khởi đầu cho một tông môn non trẻ.',
        buffs: { lessonXpPct: 0, witherTimeBonusPct: 0 }
    },
    {
        stage: 1,
        minXp: 120,
        name: 'Nhất Diệp',
        motto: 'Linh thụ đã chạm rễ vào đất trời.',
        buffs: { lessonXpPct: 2, witherTimeBonusPct: 0 }
    },
    {
        stage: 2,
        minXp: 320,
        name: 'Sinh Trưởng',
        motto: 'Sinh khí bắt đầu hội tụ quanh thân cây.',
        buffs: { lessonXpPct: 4, witherTimeBonusPct: 0 }
    },
    {
        stage: 3,
        minXp: 650,
        name: 'Khai Hoa',
        motto: 'Linh thụ mở rộng tán lá và phản hồi năng lượng.',
        buffs: { lessonXpPct: 6, witherTimeBonusPct: 4 }
    },
    {
        stage: 4,
        minXp: 1100,
        name: 'Tỏa Quang',
        motto: 'Tông môn bắt đầu nhận được bảo trợ rõ nét hơn.',
        buffs: { lessonXpPct: 8, witherTimeBonusPct: 6 }
    },
    {
        stage: 5,
        minXp: 1750,
        name: 'Kết Tinh',
        motto: 'Cảnh giới của tông môn dần kết lại trong linh thụ.',
        buffs: { lessonXpPct: 10, witherTimeBonusPct: 10 }
    },
    {
        stage: 6,
        minXp: 2550,
        name: 'Thiên Quang',
        motto: 'Mỗi lần học tập đều được linh thụ tiếp sức.',
        buffs: { lessonXpPct: 12, witherTimeBonusPct: 12 }
    },
    {
        stage: 7,
        minXp: 3600,
        name: 'Ngũ Sắc',
        motto: 'Linh thụ tỏa ra ngũ sắc bao phủ tông môn.',
        buffs: { lessonXpPct: 15, witherTimeBonusPct: 15 }
    },
    {
        stage: 8,
        minXp: 5000,
        name: 'Tinh Vân',
        motto: 'Cảnh giới cao hơn giúp mọi thành viên thăng hoa nhanh hơn.',
        buffs: { lessonXpPct: 18, witherTimeBonusPct: 20 }
    },
    {
        stage: 9,
        minXp: 6800,
        name: 'Thần Mộc',
        motto: 'Linh thụ đã trở thành trái tim của cả tông môn.',
        buffs: { lessonXpPct: 25, witherTimeBonusPct: 25 }
    }
]);

function clampPositiveInteger(value) {
    const amount = Number(value);
    if (!Number.isFinite(amount) || amount <= 0) return 0;
    return Math.floor(amount);
}

function getContributionValue(resourceType, amount) {
    const safeAmount = clampPositiveInteger(amount);
    if (!safeAmount) return 0;

    const unitValue = CONTRIBUTION_VALUES[resourceType];
    if (!unitValue) return 0;
    return unitValue * safeAmount;
}

function getGuildTreeStageData(treeXp) {
    const safeXp = Math.max(0, Number(treeXp || 0));
    let currentStage = GUILD_TREE_STAGES[0];

    for (const stageData of GUILD_TREE_STAGES) {
        if (safeXp >= stageData.minXp) {
            currentStage = stageData;
            continue;
        }
        break;
    }

    return currentStage;
}

function getNextGuildTreeStage(treeXp) {
    const current = getGuildTreeStageData(treeXp);
    return GUILD_TREE_STAGES.find((stageData) => stageData.stage === current.stage + 1) || null;
}

function buildGuildTreeProgress(treeXp) {
    const safeXp = Math.max(0, Number(treeXp || 0));
    const current = getGuildTreeStageData(safeXp);
    const next = getNextGuildTreeStage(safeXp);

    if (!next) {
        return {
            current,
            next: null,
            percent: 100,
            xpIntoStage: safeXp - current.minXp,
            xpNeeded: 0,
            xpForNextStage: 0
        };
    }

    const stageSpan = Math.max(1, next.minXp - current.minXp);
    const xpIntoStage = Math.max(0, safeXp - current.minXp);
    const xpForNextStage = Math.max(0, next.minXp - safeXp);

    return {
        current,
        next,
        percent: Math.max(0, Math.min(100, Math.round((xpIntoStage / stageSpan) * 100))),
        xpIntoStage,
        xpNeeded: stageSpan,
        xpForNextStage
    };
}

function buildGuildBuffSnapshot(treeXp) {
    const stageData = getGuildTreeStageData(treeXp);
    return {
        lessonXpPct: stageData.buffs.lessonXpPct || 0,
        witherTimeBonusPct: stageData.buffs.witherTimeBonusPct || 0
    };
}

module.exports = {
    CONTRIBUTION_VALUES,
    GUILD_TREE_STAGES,
    clampPositiveInteger,
    getContributionValue,
    getGuildTreeStageData,
    getNextGuildTreeStage,
    buildGuildTreeProgress,
    buildGuildBuffSnapshot
};
