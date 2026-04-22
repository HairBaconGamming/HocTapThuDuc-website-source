const Guild = require('../models/Guild');
const GuildContribution = require('../models/GuildContribution');
const User = require('../models/User');
const { ensureGarden } = require('./gardenRewardService');
const {
    CONTRIBUTION_VALUES,
    clampPositiveInteger,
    formatContributionSummary,
    getContributionValue,
    roundSpiritPower
} = require('../utils/guildTreeUtils');
const { removeInventoryItem, getInventorySnapshot } = require('./gardenInventoryService');
const { GuildServiceError } = require('./guildErrors');
const { syncGuildDerivedState, hydrateGuildDetail } = require('./guildService');
const { createAuditLog, syncWeeklyGoalProgress } = require('./guildGovernanceService');

const DONATION_FIELDS = new Set(['water', 'fertilizer', 'gold']);
const DONATION_ITEMS = new Set(
    Object.keys(CONTRIBUTION_VALUES).filter((resourceType) => !DONATION_FIELDS.has(resourceType))
);

async function contributeToGuild({ userId, resourceType, amount }) {
    const safeAmount = clampPositiveInteger(amount);
    if (!safeAmount) {
        throw new GuildServiceError('Số lượng quyên góp phải lớn hơn 0.');
    }

    const user = await User.findById(userId).select('_id guild guildRole');
    if (!user?.guild) {
        throw new GuildServiceError('Bạn chưa gia nhập Tông Môn nào.');
    }

    const guild = await Guild.findById(user.guild).populate('leader', 'username avatar level');
    if (!guild) {
        throw new GuildServiceError('Tông Môn không tồn tại.', 404);
    }

    const contributionValue = getContributionValue(resourceType, safeAmount);
    if (!contributionValue) {
        throw new GuildServiceError('Tài nguyên quyên góp không hợp lệ.');
    }

    const garden = await ensureGarden(userId);

    if (DONATION_FIELDS.has(resourceType)) {
        const remainingAmount = Number(garden[resourceType] || 0);
        if (remainingAmount < safeAmount) {
            throw new GuildServiceError('Bạn không đủ tài nguyên để quyên góp.');
        }
        garden[resourceType] = remainingAmount - safeAmount;
    } else if (DONATION_ITEMS.has(resourceType)) {
        const removed = removeInventoryItem(garden, resourceType, safeAmount);
        if (!removed) {
            throw new GuildServiceError('Kho nông sản của bạn không đủ.');
        }
    } else {
        throw new GuildServiceError('Tài nguyên quyên góp không được hỗ trợ.');
    }

    guild.vault[resourceType] = (guild.vault[resourceType] || 0) + safeAmount;
    guild.treeXp = roundSpiritPower(Math.max(0, Number(guild.treeXp || 0) + contributionValue));
    guild.totalContributionValue = roundSpiritPower(Math.max(0, Number(guild.totalContributionValue || 0) + contributionValue));
    guild.lastContributionAt = new Date();
    syncGuildDerivedState(guild);

    const resourceSummary = formatContributionSummary(resourceType, safeAmount);

    const contribution = await GuildContribution.create({
        guild: guild._id,
        user: user._id,
        resourceType,
        amount: safeAmount,
        contributionValue
    });

    await Promise.all([garden.save(), guild.save()]);
    await syncWeeklyGoalProgress(guild._id, {
        resourceType,
        amount: safeAmount,
        spiritPower: contributionValue
    });
    await createAuditLog({
        guildId: guild._id,
        actorId: user._id,
        targetUserId: user._id,
        actionType: contributionValue >= 700 ? 'milestone' : 'contribution',
        message: contributionValue >= 700
            ? `${user.username} vừa tạo một pha bạo kích quyên góp ${resourceSummary}.`
            : `${user.username} đã quyên góp ${resourceSummary}.`,
        metadata: {
            contributionId: contribution._id,
            resourceType,
            amount: safeAmount,
            contributionValue
        }
    });

    const guildDetail = await hydrateGuildDetail(guild, user._id);

    return {
        success: true,
        contribution,
        guildDetail,
        inventory: getInventorySnapshot(garden),
        resources: {
            water: garden.water || 0,
            fertilizer: garden.fertilizer || 0,
            gold: garden.gold || 0
        },
        message: `Đã quyên góp ${resourceSummary} cho Linh Thụ.`,
        contributionValue
    };
}

async function toggleContributionApplause({ userId, contributionId }) {
    const contribution = await GuildContribution.findById(contributionId);
    if (!contribution) {
        throw new GuildServiceError('Không tìm thấy lần quyên góp này.', 404);
    }

    const user = await User.findById(userId).select('_id guild');
    if (!user?.guild || String(user.guild) !== String(contribution.guild)) {
        throw new GuildServiceError('Bạn chỉ có thể vỗ tay cho hoạt động trong Tông Môn của mình.', 403);
    }

    const userKey = String(user._id);
    const alreadyApplauded = contribution.applaudedBy.some((memberId) => String(memberId) === userKey);

    if (alreadyApplauded) {
        contribution.applaudedBy = contribution.applaudedBy.filter((memberId) => String(memberId) !== userKey);
        contribution.applauseCount = Math.max(0, (contribution.applauseCount || 0) - 1);
    } else {
        contribution.applaudedBy.push(user._id);
        contribution.applauseCount = (contribution.applauseCount || 0) + 1;
    }

    await contribution.save();

    return {
        success: true,
        applauseCount: contribution.applauseCount || 0,
        isApplauded: !alreadyApplauded,
        message: alreadyApplauded ? 'Bạn đã thu hồi một tràng vỗ tay.' : 'Một tràng vỗ tay vừa được gửi tới đồng môn.'
    };
}

module.exports = {
    contributeToGuild,
    toggleContributionApplause
};
