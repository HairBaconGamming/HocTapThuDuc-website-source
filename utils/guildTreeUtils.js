const RESOURCE_META = Object.freeze({
    water: { label: 'Nước', icon: '💧', tone: 'water' },
    fertilizer: { label: 'Phân bón', icon: '🌿', tone: 'fertilizer' },
    gold: { label: 'Tiền vàng', icon: '🪙', tone: 'gold' },
    sunflower: { label: 'Hướng dương', icon: '🌻', tone: 'crop' },
    wheat: { label: 'Lúa mì', icon: '🌾', tone: 'crop' },
    carrot: { label: 'Cà rốt', icon: '🥕', tone: 'crop' },
    tomato: { label: 'Cà chua', icon: '🍅', tone: 'crop' }
});

const CONTRIBUTION_VALUES = Object.freeze({
    water: 6,
    fertilizer: 18,
    gold: 0.5,
    sunflower: 20,
    wheat: 35,
    carrot: 60,
    tomato: 120
});

const SPIRIT_TREE_XP_BASE = 1000;
const SPIRIT_TREE_XP_GROWTH = 3;

function getSpiritTreeThreshold(stage) {
    if (stage <= 0) return 0;
    return Math.round(SPIRIT_TREE_XP_BASE * Math.pow(SPIRIT_TREE_XP_GROWTH, stage - 1));
}

const GUILD_TREE_STAGES = Object.freeze([
    {
        stage: 0,
        minXp: getSpiritTreeThreshold(0),
        name: 'Mầm Linh Thụ',
        motto: 'Một nhánh mầm yếu ớt đang chờ cả tông môn cùng nuôi dưỡng.',
        unlockText: 'Mở hành trình Linh Thụ và chuẩn bị buff đầu tiên cho toàn bang.',
        buffs: { lessonXpPct: 0, witherTimeBonusPct: 0 }
    },
    {
        stage: 1,
        minXp: getSpiritTreeThreshold(1),
        name: 'Nhất Diệp',
        motto: 'Chiếc lá đầu tiên mở ra, báo hiệu linh khí đã bắt đầu hội tụ.',
        unlockText: 'Mở khóa +2% XP học bài cho toàn thể thành viên.',
        buffs: { lessonXpPct: 2, witherTimeBonusPct: 0 }
    },
    {
        stage: 2,
        minXp: getSpiritTreeThreshold(2),
        name: 'Sinh Trưởng',
        motto: 'Linh Thụ bén rễ sâu hơn, hấp thu sức học của cả tông môn.',
        unlockText: 'Mở khóa +4% XP học bài và ánh sáng Linh Thụ rõ hơn.',
        buffs: { lessonXpPct: 4, witherTimeBonusPct: 0 }
    },
    {
        stage: 3,
        minXp: getSpiritTreeThreshold(3),
        name: 'Khai Hoa',
        motto: 'Tán lá bung rộng, năng lượng học tập bắt đầu lan ngược về khu vườn.',
        unlockText: 'Mở khóa +6% XP học bài và +4% độ bền cây cá nhân.',
        buffs: { lessonXpPct: 6, witherTimeBonusPct: 4 }
    },
    {
        stage: 4,
        minXp: getSpiritTreeThreshold(4),
        name: 'Tỏa Quang',
        motto: 'Linh quang đã phủ khắp thân cây, tông môn bước vào giai đoạn tăng trưởng nóng.',
        unlockText: 'Mở khóa +8% XP học bài, +6% độ bền cây và hào quang Linh Thụ.',
        buffs: { lessonXpPct: 8, witherTimeBonusPct: 6 }
    },
    {
        stage: 5,
        minXp: getSpiritTreeThreshold(5),
        name: 'Kết Tinh',
        motto: 'Tinh hoa bắt đầu kết tụ trên tán, mỗi lần cống hiến đều có trọng lượng hơn.',
        unlockText: 'Mở khóa +10% XP học bài và +10% độ bền cây.',
        buffs: { lessonXpPct: 10, witherTimeBonusPct: 10 }
    },
    {
        stage: 6,
        minXp: getSpiritTreeThreshold(6),
        name: 'Thiên Quang',
        motto: 'Linh Thụ hóa thành cột sáng, tiếp sức cho những buổi học dài hơi nhất.',
        unlockText: 'Mở khóa +12% XP học bài và +12% độ bền cây.',
        buffs: { lessonXpPct: 12, witherTimeBonusPct: 12 }
    },
    {
        stage: 7,
        minXp: getSpiritTreeThreshold(7),
        name: 'Ngũ Sắc',
        motto: 'Ngũ sắc tinh vân vờn quanh Linh Thụ, báo hiệu sức mạnh tông môn đã thành hình.',
        unlockText: 'Mở khóa +15% XP học bài và +15% độ bền cây.',
        buffs: { lessonXpPct: 15, witherTimeBonusPct: 15 }
    },
    {
        stage: 8,
        minXp: getSpiritTreeThreshold(8),
        name: 'Tinh Vân',
        motto: 'Toàn bộ khu vườn được bao phủ bởi tinh vân, thành viên thăng hoa cực nhanh.',
        unlockText: 'Mở khóa +18% XP học bài, +20% độ bền cây và rương tuần Tông Môn.',
        buffs: { lessonXpPct: 18, witherTimeBonusPct: 20 }
    },
    {
        stage: 9,
        minXp: getSpiritTreeThreshold(9),
        name: 'Thần Mộc',
        motto: 'Linh Thụ đã trở thành trái tim bất tử của tông môn, nối liền cả học tập lẫn khu vườn.',
        unlockText: 'Đạt cảnh giới tối thượng: +25% XP học bài và +25% độ bền cây.',
        buffs: { lessonXpPct: 25, witherTimeBonusPct: 25 }
    }
]);

function roundSpiritPower(value) {
    const safeValue = Number(value || 0);
    if (!Number.isFinite(safeValue)) return 0;
    return Math.round((safeValue + Number.EPSILON) * 10) / 10;
}

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
    return roundSpiritPower(unitValue * safeAmount);
}

function getContributionResourceMeta(resourceType) {
    return RESOURCE_META[resourceType] || { label: resourceType, icon: '✨', tone: 'neutral' };
}

function formatContributionSummary(resourceType, amount) {
    const meta = getContributionResourceMeta(resourceType);
    return `${meta.icon} ${amount} ${meta.label}`;
}

function getGuildTreeStageData(treeXp) {
    const safeXp = roundSpiritPower(Math.max(0, Number(treeXp || 0)));
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
    const safeXp = roundSpiritPower(Math.max(0, Number(treeXp || 0)));
    const current = getGuildTreeStageData(safeXp);
    const next = getNextGuildTreeStage(safeXp);

    if (!next) {
        return {
            current,
            next: null,
            percent: 100,
            xpIntoStage: roundSpiritPower(safeXp - current.minXp),
            xpNeeded: 0,
            xpForNextStage: 0
        };
    }

    const stageSpan = Math.max(1, next.minXp - current.minXp);
    const xpIntoStage = roundSpiritPower(Math.max(0, safeXp - current.minXp));
    const xpForNextStage = roundSpiritPower(Math.max(0, next.minXp - safeXp));

    return {
        current,
        next,
        percent: Math.max(0, Math.min(100, Math.round((xpIntoStage / stageSpan) * 100))),
        xpIntoStage,
        xpNeeded: roundSpiritPower(stageSpan),
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
    RESOURCE_META,
    CONTRIBUTION_VALUES,
    SPIRIT_TREE_XP_BASE,
    SPIRIT_TREE_XP_GROWTH,
    GUILD_TREE_STAGES,
    clampPositiveInteger,
    roundSpiritPower,
    getSpiritTreeThreshold,
    getContributionValue,
    getContributionResourceMeta,
    formatContributionSummary,
    getGuildTreeStageData,
    getNextGuildTreeStage,
    buildGuildTreeProgress,
    buildGuildBuffSnapshot
};
