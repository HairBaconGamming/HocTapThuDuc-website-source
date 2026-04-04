const Guild = require('../models/Guild');
const GuildContribution = require('../models/GuildContribution');
const User = require('../models/User');
const { ensureGarden } = require('./gardenRewardService');
const {
    clampPositiveInteger,
    getContributionValue
} = require('../utils/guildTreeUtils');
const { removeInventoryItem, getInventorySnapshot } = require('./gardenInventoryService');
const { GuildServiceError, syncGuildDerivedState, hydrateGuildDetail } = require('./guildService');

const DONATION_FIELDS = new Set(['water', 'fertilizer', 'gold']);
const DONATION_ITEMS = new Set(['sunflower', 'wheat', 'carrot', 'tomato']);

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
    let remainingAmount;

    if (DONATION_FIELDS.has(resourceType)) {
        remainingAmount = Number(garden[resourceType] || 0);
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
    guild.treeXp = Math.max(0, Number(guild.treeXp || 0) + contributionValue);
    guild.totalContributionValue = Math.max(0, Number(guild.totalContributionValue || 0) + contributionValue);
    guild.lastContributionAt = new Date();
    syncGuildDerivedState(guild);

    const contribution = await GuildContribution.create({
        guild: guild._id,
        user: user._id,
        resourceType,
        amount: safeAmount,
        contributionValue
    });

    await Promise.all([garden.save(), guild.save()]);

    const guildDetail = await hydrateGuildDetail(guild);

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
        message: `Đã quyên góp ${safeAmount} ${resourceType} cho Linh Thụ.`
    };
}

module.exports = {
    contributeToGuild
};
