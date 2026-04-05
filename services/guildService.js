const crypto = require('crypto');
const slugify = require('slugify');
const mongoose = require('mongoose');
const Guild = require('../models/Guild');
const User = require('../models/User');
const UserActivityLog = require('../models/UserActivityLog');
const GuildContribution = require('../models/GuildContribution');
const GuildApplication = require('../models/GuildApplication');
const GuildAuditLog = require('../models/GuildAuditLog');
const GuildWeeklyGoal = require('../models/GuildWeeklyGoal');
const {
    RESOURCE_META,
    buildGuildBuffSnapshot,
    buildGuildTreeProgress,
    getGuildTreeStageData
} = require('../utils/guildTreeUtils');
const { getWeekRange } = require('../utils/guildPeriodUtils');
const { GuildServiceError } = require('./guildErrors');
const { getGuildRoleLabel, normalizeGuildRole } = require('./guildAccessService');
const { createAuditLog, buildJoinThresholdFeedback } = require('./guildGovernanceService');
const { getGuildCompetitionSnapshot } = require('./guildCompetitionService');

const MIN_JOIN_LEVEL = 3;
const MIN_CREATE_LEVEL = 10;
const ONLINE_WINDOW_MS = 5 * 60 * 1000;

function normalizeGuildName(name) {
    return String(name || '').trim().replace(/\s+/g, ' ');
}

async function buildUniqueGuildSlug(name) {
    const baseSlug = slugify(name, { lower: true, strict: true, locale: 'vi' }) || `tong-mon-${Date.now()}`;
    let slug = baseSlug;
    let suffix = 1;

    while (await Guild.exists({ slug })) {
        slug = `${baseSlug}-${suffix}`;
        suffix += 1;
    }

    return slug;
}

function syncGuildDerivedState(guild) {
    const stageData = getGuildTreeStageData(guild.treeXp || 0);
    guild.treeStage = stageData.stage;
    guild.buffSnapshot = buildGuildBuffSnapshot(guild.treeXp || 0);
    if (!guild.settings?.inviteCode) {
        guild.settings = guild.settings || {};
        guild.settings.inviteCode = crypto.randomBytes(3).toString('hex').toUpperCase();
    }
    return guild;
}

async function buildMemberActivityMap(userIds) {
    if (!userIds.length) return new Map();

    const weekRange = getWeekRange();
    const todayRange = {
        start: weekRange.start.toISOString().slice(0, 10),
        end: weekRange.end.toISOString().slice(0, 10)
    };

    const rows = await UserActivityLog.aggregate([
        { $match: { user: { $in: userIds }, dateStr: { $gte: todayRange.start, $lte: todayRange.end } } },
        {
            $group: {
                _id: '$user',
                weeklyMinutes: { $sum: '$minutes' },
                lastActive: { $max: '$lastActive' }
            }
        }
    ]);

    return new Map(rows.map((row) => [String(row._id), row]));
}

async function buildWeeklyContributionMap(userIds, guildId) {
    if (!userIds.length) return new Map();
    const weekRange = getWeekRange();
    const rows = await GuildContribution.aggregate([
        {
            $match: {
                guild: guildId,
                user: { $in: userIds },
                createdAt: { $gte: weekRange.start, $lte: weekRange.end }
            }
        },
        {
            $group: {
                _id: '$user',
                weeklyContributionValue: { $sum: '$contributionValue' }
            }
        }
    ]);

    return new Map(rows.map((row) => [String(row._id), Number(row.weeklyContributionValue || 0)]));
}

function getContributionDrama(contributionValue) {
    const safeValue = Number(contributionValue || 0);
    if (safeValue >= 2500) {
        return { tone: 'legendary', label: 'Bạo kích', highlight: true };
    }
    if (safeValue >= 700) {
        return { tone: 'epic', label: 'Rực sáng', highlight: true };
    }
    return { tone: 'calm', label: 'Bền bỉ', highlight: false };
}

async function getGuildMemberPreview(guildId) {
    const members = await User.find({ guild: guildId })
        .select('username avatar level guildRole joinedGuildAt')
        .sort({ level: -1, username: 1 })
        .lean();

    const memberIds = members.map((member) => member._id);
    const [activityMap, contributionMap] = await Promise.all([
        buildMemberActivityMap(memberIds),
        buildWeeklyContributionMap(memberIds, guildId)
    ]);

    const onlineThreshold = new Date(Date.now() - ONLINE_WINDOW_MS);

    return members.map((member) => {
        const activity = activityMap.get(String(member._id));
        const lastActive = activity?.lastActive ? new Date(activity.lastActive) : null;
        return {
            ...member,
            roleKey: normalizeGuildRole(member.guildRole),
            roleLabel: getGuildRoleLabel(member.guildRole),
            weeklyStudyMinutes: Number(activity?.weeklyMinutes || 0),
            weeklyContributionValue: Number(contributionMap.get(String(member._id)) || 0),
            lastActive,
            isOnline: Boolean(lastActive && lastActive >= onlineThreshold)
        };
    });
}

async function getGuildContributionPreview(guildId) {
    const entries = await GuildContribution.find({ guild: guildId })
        .sort({ createdAt: -1 })
        .limit(16)
        .populate('user', 'username avatar')
        .lean();

    return entries.map((entry) => {
        const meta = RESOURCE_META[entry.resourceType] || { label: entry.resourceType, icon: '✨', tone: 'neutral' };
        const drama = getContributionDrama(entry.contributionValue);
        return {
            ...entry,
            resourceLabel: meta.label,
            resourceIcon: meta.icon,
            resourceTone: meta.tone,
            dramaTone: drama.tone,
            dramaLabel: drama.label,
            isLegendary: drama.tone === 'legendary',
            isHighlight: drama.highlight
        };
    });
}

async function getGuildTopContributors(guildId) {
    const rows = await GuildContribution.aggregate([
        { $match: { guild: guildId } },
        {
            $group: {
                _id: '$user',
                totalContributionValue: { $sum: '$contributionValue' },
                totalAmount: { $sum: '$amount' }
            }
        },
        { $sort: { totalContributionValue: -1 } },
        { $limit: 8 },
        {
            $lookup: {
                from: 'users',
                localField: '_id',
                foreignField: '_id',
                as: 'user'
            }
        },
        { $unwind: '$user' },
        {
            $project: {
                _id: 0,
                userId: '$user._id',
                username: '$user.username',
                avatar: '$user.avatar',
                level: '$user.level',
                guildRole: '$user.guildRole',
                totalContributionValue: 1,
                totalAmount: 1
            }
        }
    ]);

    return rows.map((row, index) => ({
        ...row,
        rank: index + 1
    }));
}

async function hydrateGuildDetail(guild, viewerUserId = null) {
    if (!guild) return null;
    syncGuildDerivedState(guild);

    const [members, recentContributions, topContributors, competition, applications, auditLogs, weeklyGoal] = await Promise.all([
        getGuildMemberPreview(guild._id),
        getGuildContributionPreview(guild._id),
        getGuildTopContributors(guild._id),
        getGuildCompetitionSnapshot(guild._id),
        GuildApplication.find({ guild: guild._id, status: 'pending' })
            .sort({ createdAt: 1 })
            .limit(12)
            .populate('applicant', 'username avatar level currentStreak totalPoints')
            .lean(),
        GuildAuditLog.find({ guild: guild._id })
            .sort({ createdAt: -1 })
            .limit(18)
            .populate('actor', 'username avatar')
            .populate('targetUser', 'username avatar')
            .lean(),
        guild.weeklyGoalSnapshot?.goalId
            ? GuildWeeklyGoal.findById(guild.weeklyGoalSnapshot.goalId).lean()
            : GuildWeeklyGoal.findOne({ guild: guild._id, weekKey: guild.weeklyGoalSnapshot?.weekKey || '', status: { $in: ['active', 'completed'] } }).lean()
    ]);

    const treeProgress = buildGuildTreeProgress(guild.treeXp || 0);
    const viewerMember = viewerUserId
        ? members.find((member) => String(member._id) === String(viewerUserId))
        : null;

    return {
        guild,
        members,
        recentContributions,
        topContributors,
        treeProgress,
        competition,
        applications,
        auditLogs,
        weeklyGoal,
        viewerMember
    };
}

async function getUserGuildContext(userId) {
    const user = await User.findById(userId).select('guild guildRole level username').lean();
    if (!user?.guild) {
        return {
            user,
            guild: null,
            buffs: { lessonXpPct: 0, witherTimeBonusPct: 0 }
        };
    }

    const guild = await Guild.findById(user.guild).populate('leader', 'username avatar level').lean();
    if (!guild) {
        return {
            user,
            guild: null,
            buffs: { lessonXpPct: 0, witherTimeBonusPct: 0 }
        };
    }

    const treeProgress = buildGuildTreeProgress(guild.treeXp || 0);
    return {
        user: { ...user, guildRole: normalizeGuildRole(user.guildRole) },
        guild,
        buffs: buildGuildBuffSnapshot(guild.treeXp || 0),
        treeProgress
    };
}

async function getGuildBuffSnapshotForUser(userId) {
    const context = await getUserGuildContext(userId);
    return context.buffs || { lessonXpPct: 0, witherTimeBonusPct: 0 };
}

function applyLessonXpBuff(baseXp, buffs = {}) {
    const safeBaseXp = Math.max(0, Number(baseXp || 0));
    const bonusPct = Math.max(0, Number(buffs.lessonXpPct || 0));
    if (!safeBaseXp || !bonusPct) return safeBaseXp;
    return Math.max(safeBaseXp, Math.round(safeBaseXp * (1 + (bonusPct / 100))));
}

function getWitherTimeMultiplier(buffs = {}) {
    const bonusPct = Math.max(0, Number(buffs.witherTimeBonusPct || 0));
    return 1 + (bonusPct / 100);
}

async function listGuilds() {
    const guilds = await Guild.find({})
        .sort({ treeStage: -1, totalContributionValue: -1, memberCount: -1, createdAt: 1 })
        .populate('leader', 'username avatar level')
        .lean();

    return guilds.map((guild) => ({
        ...guild,
        treeProgress: buildGuildTreeProgress(guild.treeXp || 0),
        buffSnapshot: buildGuildBuffSnapshot(guild.treeXp || 0)
    }));
}

async function createGuild({ userId, name, description }) {
    const safeName = normalizeGuildName(name);
    if (safeName.length < 3) {
        throw new GuildServiceError('Tên Tông Môn cần ít nhất 3 ký tự.');
    }

    const user = await User.findById(userId);
    if (!user) {
        throw new GuildServiceError('Không tìm thấy người chơi.', 404);
    }
    if (user.guild) {
        throw new GuildServiceError('Bạn đã ở trong một Tông Môn rồi.');
    }
    if ((user.level || 0) < MIN_CREATE_LEVEL) {
        throw new GuildServiceError(`Cần đạt Level ${MIN_CREATE_LEVEL} mới có thể lập Tông Môn.`);
    }

    const slug = await buildUniqueGuildSlug(safeName);
    const guild = new Guild({
        name: safeName,
        slug,
        description: String(description || '').trim().slice(0, 260),
        leader: user._id,
        memberCount: 1,
        levelRequirement: MIN_JOIN_LEVEL,
        announcement: {
            content: 'Tông Môn vừa khai sơn. Hãy cùng nhau nuôi lớn Linh Thụ và dựng nên khí thế đầu tiên.',
            updatedBy: user._id,
            updatedAt: new Date()
        },
        settings: {
            joinMode: 'open',
            isPublic: true,
            inviteCode: crypto.randomBytes(3).toString('hex').toUpperCase(),
            joinThresholds: {
                minLevel: MIN_JOIN_LEVEL,
                minStreak: 0,
                minTotalPoints: 0,
                minWeeklyMinutes: 0
            }
        }
    });

    syncGuildDerivedState(guild);
    await guild.save();

    user.guild = guild._id;
    user.guildRole = 'leader';
    user.joinedGuildAt = new Date();
    await user.save();

    await createAuditLog({
        guildId: guild._id,
        actorId: user._id,
        targetUserId: user._id,
        actionType: 'guild_created',
        message: `${user.username} đã khai sơn ${guild.name}.`
    });

    return guild;
}

async function joinGuild({ userId, guildIdOrSlug, inviteCode = '' }) {
    const user = await User.findById(userId);
    if (!user) {
        throw new GuildServiceError('Không tìm thấy người chơi.', 404);
    }
    if (user.guild) {
        throw new GuildServiceError('Bạn đã gia nhập Tông Môn khác.');
    }

    const query = mongoose.Types.ObjectId.isValid(guildIdOrSlug)
        ? { $or: [{ _id: guildIdOrSlug }, { slug: guildIdOrSlug }] }
        : { slug: guildIdOrSlug };
    const guild = await Guild.findOne(query);
    if (!guild) {
        throw new GuildServiceError('Tông Môn không tồn tại.', 404);
    }

    const thresholdFailures = await buildJoinThresholdFeedback(user, guild);
    if (thresholdFailures.length) {
        throw new GuildServiceError(thresholdFailures[0]);
    }
    if ((guild.memberCount || 0) >= (guild.memberLimit || 30)) {
        throw new GuildServiceError('Tông Môn đã đạt tối đa thành viên.');
    }

    const joinMode = guild.settings?.joinMode || 'open';
    if (joinMode === 'approval') {
        throw new GuildServiceError('Tông Môn này cần nộp đơn chờ phê duyệt trước khi gia nhập.');
    }
    if (joinMode === 'invite') {
        const safeInviteCode = String(inviteCode || '').trim().toUpperCase();
        if (!safeInviteCode || safeInviteCode !== String(guild.settings?.inviteCode || '').trim().toUpperCase()) {
            throw new GuildServiceError('Mật lệnh chiêu mộ không hợp lệ.');
        }
    }

    user.guild = guild._id;
    user.guildRole = 'member';
    user.joinedGuildAt = new Date();
    guild.memberCount = Math.max(1, (guild.memberCount || 0) + 1);

    await Promise.all([user.save(), guild.save()]);

    await createAuditLog({
        guildId: guild._id,
        actorId: user._id,
        targetUserId: user._id,
        actionType: 'member_joined',
        message: `${user.username} đã gia nhập Tông Môn.`
    });

    return guild;
}

async function leaveGuild({ userId }) {
    const user = await User.findById(userId);
    if (!user?.guild) {
        throw new GuildServiceError('Bạn chưa tham gia Tông Môn nào.');
    }

    const guild = await Guild.findById(user.guild);
    if (!guild) {
        user.guild = null;
        user.guildRole = 'member';
        user.joinedGuildAt = null;
        await user.save();
        return null;
    }

    const userRole = normalizeGuildRole(user.guildRole);
    const isLeader = String(guild.leader) === String(user._id) || userRole === 'leader';
    if (isLeader && (guild.memberCount || 1) > 1) {
        throw new GuildServiceError('Trưởng môn không thể rời Tông Môn khi vẫn còn thành viên. Hãy chuyển giao hoặc giải tán sau.');
    }

    if (isLeader) {
        await Promise.all([
            User.updateMany({ guild: guild._id }, { $set: { guild: null, guildRole: 'member', joinedGuildAt: null } }),
            GuildContribution.deleteMany({ guild: guild._id }),
            GuildApplication.deleteMany({ guild: guild._id }),
            GuildAuditLog.deleteMany({ guild: guild._id }),
            GuildWeeklyGoal.deleteMany({ guild: guild._id }),
            guild.deleteOne()
        ]);
        return null;
    }

    user.guild = null;
    user.guildRole = 'member';
    user.joinedGuildAt = null;
    guild.memberCount = Math.max(1, (guild.memberCount || 1) - 1);

    await Promise.all([user.save(), guild.save()]);

    await createAuditLog({
        guildId: guild._id,
        actorId: user._id,
        targetUserId: user._id,
        actionType: 'member_left',
        message: `${user.username} đã rời Tông Môn.`
    });

    return guild;
}

async function getGuildBySlug(slug, viewerUserId = null) {
    const guild = await Guild.findOne({ slug }).populate('leader', 'username avatar level');
    if (!guild) return null;
    return hydrateGuildDetail(guild, viewerUserId);
}

module.exports = {
    MIN_JOIN_LEVEL,
    MIN_CREATE_LEVEL,
    GuildServiceError,
    syncGuildDerivedState,
    getUserGuildContext,
    getGuildBuffSnapshotForUser,
    applyLessonXpBuff,
    getWitherTimeMultiplier,
    listGuilds,
    createGuild,
    joinGuild,
    leaveGuild,
    getGuildBySlug,
    hydrateGuildDetail
};
