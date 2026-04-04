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
        name: 'Mam Linh Thu',
        motto: 'Khoi dau cho mot tong mon non tre.',
        buffs: { lessonXpPct: 0, witherTimeBonusPct: 0 }
    },
    {
        stage: 1,
        minXp: 120,
        name: 'Nhat Diep',
        motto: 'Linh thu da cham re vao dat troi.',
        buffs: { lessonXpPct: 2, witherTimeBonusPct: 0 }
    },
    {
        stage: 2,
        minXp: 320,
        name: 'Sinh Truong',
        motto: 'Sinh khi bat dau hoi tu quanh than cay.',
        buffs: { lessonXpPct: 4, witherTimeBonusPct: 0 }
    },
    {
        stage: 3,
        minXp: 650,
        name: 'Khai Hoa',
        motto: 'Linh thu mo rong tan la va phan hoi nang luong.',
        buffs: { lessonXpPct: 6, witherTimeBonusPct: 4 }
    },
    {
        stage: 4,
        minXp: 1100,
        name: 'Toa Quang',
        motto: 'Tong mon bat dau nhan duoc bao tro ro net hon.',
        buffs: { lessonXpPct: 8, witherTimeBonusPct: 6 }
    },
    {
        stage: 5,
        minXp: 1750,
        name: 'Ket Tinh',
        motto: 'Canh gioi cua tong mon dan ket lai trong linh thu.',
        buffs: { lessonXpPct: 10, witherTimeBonusPct: 10 }
    },
    {
        stage: 6,
        minXp: 2550,
        name: 'Thien Quang',
        motto: 'Moi lan hoc tap deu duoc linh thu tiep suc.',
        buffs: { lessonXpPct: 12, witherTimeBonusPct: 12 }
    },
    {
        stage: 7,
        minXp: 3600,
        name: 'Ngu Sac',
        motto: 'Linh thu toa ra ngu sac bao phu tong mon.',
        buffs: { lessonXpPct: 15, witherTimeBonusPct: 15 }
    },
    {
        stage: 8,
        minXp: 5000,
        name: 'Tinh Van',
        motto: 'Canh gioi cao hon giup moi thanh vien thang hoa nhanh hon.',
        buffs: { lessonXpPct: 18, witherTimeBonusPct: 20 }
    },
    {
        stage: 9,
        minXp: 6800,
        name: 'Than Moc',
        motto: 'Linh thu da tro thanh trai tim cua ca tong mon.',
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
