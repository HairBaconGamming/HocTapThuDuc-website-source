const slugify = require('slugify');
const mongoose = require('mongoose');
const Guild = require('../models/Guild');
const User = require('../models/User');
const GuildContribution = require('../models/GuildContribution');
const {
    buildGuildBuffSnapshot,
    buildGuildTreeProgress,
    getGuildTreeStageData
} = require('../utils/guildTreeUtils');

const MIN_JOIN_LEVEL = 3;
const MIN_CREATE_LEVEL = 10;

class GuildServiceError extends Error {
    constructor(message, status = 400) {
        super(message);
        this.name = 'GuildServiceError';
        this.status = status;
    }
}

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
    return guild;
}

async function getGuildMemberPreview(guildId) {
    return User.find({ guild: guildId })
        .select('username avatar level guildRole joinedGuildAt')
        .sort({ guildRole: 1, level: -1, username: 1 })
        .lean();
}

async function getGuildContributionPreview(guildId) {
    return GuildContribution.find({ guild: guildId })
        .sort({ createdAt: -1 })
        .limit(12)
        .populate('user', 'username avatar')
        .lean();
}

async function getGuildTopContributors(guildId) {
    return GuildContribution.aggregate([
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
                totalContributionValue: 1,
                totalAmount: 1
            }
        }
    ]);
}

async function hydrateGuildDetail(guild) {
    if (!guild) return null;
    syncGuildDerivedState(guild);

    const [members, recentContributions, topContributors] = await Promise.all([
        getGuildMemberPreview(guild._id),
        getGuildContributionPreview(guild._id),
        getGuildTopContributors(guild._id)
    ]);

    const treeProgress = buildGuildTreeProgress(guild.treeXp || 0);

    return {
        guild,
        members,
        recentContributions,
        topContributors,
        treeProgress
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
        user,
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
        throw new GuildServiceError('Ten Tong Mon can it nhat 3 ky tu.');
    }

    const user = await User.findById(userId);
    if (!user) {
        throw new GuildServiceError('Khong tim thay nguoi choi.', 404);
    }
    if (user.guild) {
        throw new GuildServiceError('Ban da o trong mot Tong Mon roi.');
    }
    if ((user.level || 0) < MIN_CREATE_LEVEL) {
        throw new GuildServiceError(`Can dat Level ${MIN_CREATE_LEVEL} moi co the lap Tong Mon.`);
    }

    const slug = await buildUniqueGuildSlug(safeName);
    const guild = new Guild({
        name: safeName,
        slug,
        description: String(description || '').trim().slice(0, 260),
        leader: user._id,
        memberCount: 1,
        levelRequirement: MIN_JOIN_LEVEL
    });

    syncGuildDerivedState(guild);
    await guild.save();

    user.guild = guild._id;
    user.guildRole = 'leader';
    user.joinedGuildAt = new Date();
    await user.save();

    return guild;
}

async function joinGuild({ userId, guildIdOrSlug }) {
    const user = await User.findById(userId);
    if (!user) {
        throw new GuildServiceError('Khong tim thay nguoi choi.', 404);
    }
    if (user.guild) {
        throw new GuildServiceError('Ban da gia nhap Tong Mon khac.');
    }

    const query = mongoose.Types.ObjectId.isValid(guildIdOrSlug)
        ? { $or: [{ _id: guildIdOrSlug }, { slug: guildIdOrSlug }] }
        : { slug: guildIdOrSlug };
    const guild = await Guild.findOne(query);
    if (!guild) {
        throw new GuildServiceError('Tong Mon khong ton tai.', 404);
    }
    if ((user.level || 0) < (guild.levelRequirement || MIN_JOIN_LEVEL)) {
        throw new GuildServiceError(`Can dat Level ${guild.levelRequirement || MIN_JOIN_LEVEL} de gia nhap Tong Mon nay.`);
    }
    if ((guild.memberCount || 0) >= (guild.memberLimit || 30)) {
        throw new GuildServiceError('Tong Mon da dat toi da thanh vien.');
    }
    if (guild.settings?.joinMode === 'invite') {
        throw new GuildServiceError('Tong Mon nay hien chi nhan qua loi moi.');
    }

    user.guild = guild._id;
    user.guildRole = 'member';
    user.joinedGuildAt = new Date();
    guild.memberCount = Math.max(1, (guild.memberCount || 0) + 1);

    await Promise.all([user.save(), guild.save()]);
    return guild;
}

async function leaveGuild({ userId }) {
    const user = await User.findById(userId);
    if (!user?.guild) {
        throw new GuildServiceError('Ban chua tham gia Tong Mon nao.');
    }

    const guild = await Guild.findById(user.guild);
    if (!guild) {
        user.guild = null;
        user.guildRole = 'member';
        user.joinedGuildAt = null;
        await user.save();
        return null;
    }

    const isLeader = String(guild.leader) === String(user._id);
    if (isLeader && (guild.memberCount || 1) > 1) {
        throw new GuildServiceError('Tong chu khong the roi Tong Mon khi van con thanh vien. Hay chuyen giao hoac giai tan sau.');
    }

    if (isLeader) {
        await User.updateMany({ guild: guild._id }, {
            $set: { guild: null, guildRole: 'member', joinedGuildAt: null }
        });
        await GuildContribution.deleteMany({ guild: guild._id });
        await guild.deleteOne();
        return null;
    }

    user.guild = null;
    user.guildRole = 'member';
    user.joinedGuildAt = null;
    guild.memberCount = Math.max(1, (guild.memberCount || 1) - 1);

    await Promise.all([user.save(), guild.save()]);
    return guild;
}

async function getGuildBySlug(slug) {
    const guild = await Guild.findOne({ slug }).populate('leader', 'username avatar level');
    if (!guild) return null;
    return hydrateGuildDetail(guild);
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
