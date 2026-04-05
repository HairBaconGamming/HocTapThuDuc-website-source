const Guild = require('../models/Guild');
const GuildWeeklyStanding = require('../models/GuildWeeklyStanding');
const { getCurrentMonthKey, getCurrentWeekKey } = require('../utils/guildPeriodUtils');

const WEEKLY_REWARD_TITLES = {
    1: { title: 'Quán quân Tông Môn tuần', icon: '👑', aura: 'gold' },
    2: { title: 'Á quân Tông Môn tuần', icon: '🥈', aura: 'silver' },
    3: { title: 'Top 3 Tông Môn tuần', icon: '🥉', aura: 'bronze' }
};

const MONTHLY_REWARD_TITLES = {
    1: { title: 'Bá chủ Tông Môn tháng', icon: '🌟' },
    2: { title: 'Tinh anh Tông Môn tháng', icon: '✨' },
    3: { title: 'Danh môn tháng', icon: '💠' }
};

async function upsertStandingDelta({ guildId, xp = 0, points = 0, studyMinutes = 0 }) {
    if (!guildId) return;
    const deltas = {
        totalXp: Math.max(0, Number(xp || 0)),
        totalPoints: Math.max(0, Number(points || 0)),
        totalStudyMinutes: Math.max(0, Number(studyMinutes || 0))
    };

    const weekKey = getCurrentWeekKey();
    const monthKey = getCurrentMonthKey();

    await Promise.all([
        GuildWeeklyStanding.findOneAndUpdate(
            { guild: guildId, periodType: 'weekly', periodKey: weekKey },
            { $inc: deltas, $setOnInsert: { memberCountSnapshot: 0 } },
            { upsert: true, new: true }
        ),
        GuildWeeklyStanding.findOneAndUpdate(
            { guild: guildId, periodType: 'monthly', periodKey: monthKey },
            { $inc: deltas, $setOnInsert: { memberCountSnapshot: 0 } },
            { upsert: true, new: true }
        )
    ]);

    await Promise.all([
        refreshStandingRanks('weekly', weekKey),
        refreshStandingRanks('monthly', monthKey)
    ]);
}

async function refreshStandingRanks(periodType = 'weekly', periodKey = getCurrentWeekKey()) {
    const standings = await GuildWeeklyStanding.find({ periodType, periodKey }).sort({
        totalXp: -1,
        totalPoints: -1,
        totalStudyMinutes: -1,
        updatedAt: 1
    });

    const guildIds = standings.map((entry) => entry.guild);
    const counts = guildIds.length
        ? await Guild.find({ _id: { $in: guildIds } }).select('_id memberCount').lean()
        : [];
    const memberCountMap = new Map(counts.map((row) => [String(row._id), Number(row.memberCount || 0)]));

    const rewardCatalog = periodType === 'weekly' ? WEEKLY_REWARD_TITLES : MONTHLY_REWARD_TITLES;

    await Promise.all(standings.map((standing, index) => {
        const rank = index + 1;
        const reward = rewardCatalog[rank] || { title: '', icon: '' };
        standing.rank = rank;
        standing.rewardTitle = reward.title || '';
        standing.rewardIcon = reward.icon || '';
        standing.memberCountSnapshot = memberCountMap.get(String(standing.guild)) || standing.memberCountSnapshot || 0;
        return standing.save();
    }));
}

async function getGuildCompetitionSnapshot(guildId) {
    const weekKey = getCurrentWeekKey();
    const monthKey = getCurrentMonthKey();

    const [weeklyTop, monthlyTop, weeklySelf, monthlySelf] = await Promise.all([
        GuildWeeklyStanding.find({ periodType: 'weekly', periodKey: weekKey })
            .sort({ rank: 1 })
            .limit(5)
            .populate('guild', 'name slug')
            .lean(),
        GuildWeeklyStanding.find({ periodType: 'monthly', periodKey: monthKey })
            .sort({ rank: 1 })
            .limit(5)
            .populate('guild', 'name slug')
            .lean(),
        guildId
            ? GuildWeeklyStanding.findOne({ guild: guildId, periodType: 'weekly', periodKey: weekKey }).lean()
            : null,
        guildId
            ? GuildWeeklyStanding.findOne({ guild: guildId, periodType: 'monthly', periodKey: monthKey }).lean()
            : null
    ]);

    return {
        weekly: { periodKey: weekKey, top: weeklyTop, self: weeklySelf },
        monthly: { periodKey: monthKey, top: monthlyTop, self: monthlySelf }
    };
}

async function getWeeklyAuraMap() {
    const weekKey = getCurrentWeekKey();
    const topGuilds = await GuildWeeklyStanding.find({
        periodType: 'weekly',
        periodKey: weekKey,
        rank: { $gte: 1, $lte: 3 }
    }).select('guild rank rewardTitle rewardIcon').lean();

    const auraMap = new Map();
    topGuilds.forEach((entry) => {
        const reward = WEEKLY_REWARD_TITLES[entry.rank] || {};
        auraMap.set(String(entry.guild), {
            tier: entry.rank,
            aura: reward.aura || '',
            title: entry.rewardTitle || reward.title || '',
            icon: entry.rewardIcon || reward.icon || ''
        });
    });
    return auraMap;
}

module.exports = {
    upsertStandingDelta,
    refreshStandingRanks,
    getGuildCompetitionSnapshot,
    getWeeklyAuraMap
};
