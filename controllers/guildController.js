const realmHelper = require('../utils/realmHelper');
const guildTreeAssets = require('../config/guildTreeAssets');
const GuildApplication = require('../models/GuildApplication');
const { ensureGarden } = require('../services/gardenRewardService');
const { getInventorySnapshot } = require('../services/gardenInventoryService');
const {
    MIN_CREATE_LEVEL,
    getUserGuildContext,
    listGuilds,
    createGuild,
    joinGuild,
    leaveGuild,
    getGuildBySlug,
    GuildServiceError
} = require('../services/guildService');
const { contributeToGuild, toggleContributionApplause } = require('../services/guildContributionService');
const {
    hasGuildPermission,
    getAssignableRoles,
    normalizeGuildRole
} = require('../services/guildAccessService');
const {
    submitGuildApplication,
    reviewGuildApplication,
    updateGuildRole,
    kickGuildMember,
    updateGuildAnnouncement,
    updateGuildJoinSettings,
    refreshGuildInviteCode,
    updateGuildAutoModeration,
    createOrUpdateWeeklyGoal
} = require('../services/guildGovernanceService');

function wantsJson(req) {
    return req.xhr
        || (req.get('x-requested-with') || '').toLowerCase() === 'xmlhttprequest'
        || req.accepts(['html', 'json']) === 'json';
}

function handleGuildError(req, res, error, fallbackRedirect = '/guilds') {
    const message = error instanceof GuildServiceError
        ? error.message
        : 'Đã có lỗi xảy ra với Tông Môn.';
    const status = error instanceof GuildServiceError ? error.status || 400 : 500;

    if (!(error instanceof GuildServiceError)) {
        console.error(error);
    }

    if (wantsJson(req)) {
        return res.status(status).json({ success: false, message });
    }

    req.flash('error', message);
    return res.redirect(fallbackRedirect);
}

exports.getGuildHub = async (req, res) => {
    try {
        const guildContext = await getUserGuildContext(req.user._id);
        if (guildContext.guild) {
            return res.redirect(`/guilds/${guildContext.guild.slug}`);
        }

        const guilds = await listGuilds();
        const realmInfo = realmHelper.getRealmData(req.user.level || 0);

        res.render('guilds', {
            title: 'Tông Môn',
            user: req.user,
            guilds,
            realmInfo,
            minCreateLevel: MIN_CREATE_LEVEL,
            canCreateGuild: (req.user.level || 0) >= MIN_CREATE_LEVEL,
            activePage: 'guilds'
        });
    } catch (error) {
        console.error(error);
        req.flash('error', 'Không thể tải Tông Môn lúc này.');
        res.redirect('/dashboard');
    }
};

exports.createGuild = async (req, res) => {
    try {
        const guild = await createGuild({
            userId: req.user._id,
            name: req.body.name,
            description: req.body.description
        });

        req.flash('success', `Đã khai tông ${guild.name}!`);
        res.redirect(`/guilds/${guild.slug}`);
    } catch (error) {
        handleGuildError(req, res, error);
    }
};

exports.joinGuild = async (req, res) => {
    try {
        const guild = await joinGuild({
            userId: req.user._id,
            guildIdOrSlug: req.params.slug,
            inviteCode: req.body.inviteCode
        });

        req.flash('success', `Đã gia nhập ${guild.name}.`);
        res.redirect(`/guilds/${guild.slug}`);
    } catch (error) {
        handleGuildError(req, res, error);
    }
};

exports.applyToGuild = async (req, res) => {
    try {
        await submitGuildApplication({
            userId: req.user._id,
            guildId: req.body.guildId,
            message: req.body.message
        });
        req.flash('success', 'Đơn gia nhập đã được gửi tới Tông Môn.');
        res.redirect(`/guilds/${req.params.slug}`);
    } catch (error) {
        handleGuildError(req, res, error, `/guilds/${req.params.slug}`);
    }
};

exports.leaveGuild = async (req, res) => {
    try {
        await leaveGuild({ userId: req.user._id });
        req.flash('success', 'Bạn đã rời Tông Môn.');
        res.redirect('/guilds');
    } catch (error) {
        handleGuildError(req, res, error, req.get('referer') || '/guilds');
    }
};

exports.getGuildDetail = async (req, res) => {
    try {
        const guildDetail = await getGuildBySlug(req.params.slug, req.user._id);
        if (!guildDetail) {
            req.flash('error', 'Tông Môn không tồn tại.');
            return res.redirect('/guilds');
        }

        const viewerContext = await getUserGuildContext(req.user._id);
        const viewerGarden = await ensureGarden(req.user._id);
        const inventory = getInventorySnapshot(viewerGarden);
        const isMember = Boolean(viewerContext.guild && String(viewerContext.guild._id) === String(guildDetail.guild._id));
        const viewerRole = normalizeGuildRole(viewerContext.user?.guildRole);
        const canJoin = !viewerContext.guild && (req.user.level || 0) >= (guildDetail.guild.levelRequirement || 0);
        const pendingApplication = !isMember
            ? await GuildApplication.findOne({
                guild: guildDetail.guild._id,
                applicant: req.user._id,
                status: 'pending'
            }).lean()
            : null;

        const permissions = {
            approveApplications: isMember && hasGuildPermission(guildDetail.guild, viewerRole, 'approveApplications'),
            kickMembers: isMember && hasGuildPermission(guildDetail.guild, viewerRole, 'kickMembers'),
            promoteMembers: isMember && hasGuildPermission(guildDetail.guild, viewerRole, 'promoteMembers'),
            editAnnouncement: isMember && hasGuildPermission(guildDetail.guild, viewerRole, 'editAnnouncement'),
            manageWeeklyGoal: isMember && hasGuildPermission(guildDetail.guild, viewerRole, 'manageWeeklyGoal'),
            setAutoKickRules: isMember && hasGuildPermission(guildDetail.guild, viewerRole, 'setAutoKickRules'),
            refreshInviteCode: isMember && hasGuildPermission(guildDetail.guild, viewerRole, 'refreshInviteCode')
        };

        res.render('guild', {
            title: guildDetail.guild.name,
            user: req.user,
            guildDetail,
            guildTreeAssets,
            viewerContext,
            viewerUserId: String(req.user._id),
            viewerResources: {
                water: viewerGarden.water || 0,
                fertilizer: viewerGarden.fertilizer || 0,
                gold: viewerGarden.gold || 0,
                inventory
            },
            isMember,
            canJoin,
            pendingApplication,
            permissions,
            viewerRole,
            roleOptions: getAssignableRoles(viewerRole),
            activePage: 'guilds'
        });
    } catch (error) {
        console.error(error);
        req.flash('error', 'Không thể mở Tông Môn này.');
        res.redirect('/guilds');
    }
};

exports.contribute = async (req, res) => {
    try {
        const result = await contributeToGuild({
            userId: req.user._id,
            resourceType: req.body.resourceType,
            amount: req.body.amount
        });

        if (wantsJson(req)) {
            return res.json({
                success: true,
                message: result.message,
                guildSlug: result.guildDetail.guild.slug,
                contributionValue: result.contributionValue,
                treeStage: result.guildDetail.treeProgress.current.stage
            });
        }

        req.flash('success', result.message);
        res.redirect(`/guilds/${result.guildDetail.guild.slug}`);
    } catch (error) {
        handleGuildError(req, res, error, req.get('referer') || '/guilds');
    }
};

exports.toggleApplause = async (req, res) => {
    try {
        const result = await toggleContributionApplause({
            userId: req.user._id,
            contributionId: req.params.contributionId
        });

        if (wantsJson(req)) {
            return res.json(result);
        }

        req.flash('success', result.message);
        res.redirect(req.get('referer') || `/guilds/${req.params.slug}`);
    } catch (error) {
        handleGuildError(req, res, error, req.get('referer') || `/guilds/${req.params.slug}`);
    }
};

exports.reviewApplication = async (req, res) => {
    try {
        await reviewGuildApplication({
            actorUserId: req.user._id,
            applicationId: req.params.applicationId,
            decision: req.body.decision,
            reviewNote: req.body.reviewNote
        });
        req.flash('success', 'Đã xử lý đơn gia nhập.');
        res.redirect(`/guilds/${req.params.slug}`);
    } catch (error) {
        handleGuildError(req, res, error, `/guilds/${req.params.slug}`);
    }
};

exports.updateMemberRole = async (req, res) => {
    try {
        await updateGuildRole({
            actorUserId: req.user._id,
            guildId: req.body.guildId,
            targetUserId: req.params.memberId,
            nextRole: req.body.nextRole
        });
        req.flash('success', 'Đã cập nhật chức vụ thành viên.');
        res.redirect(`/guilds/${req.params.slug}`);
    } catch (error) {
        handleGuildError(req, res, error, `/guilds/${req.params.slug}`);
    }
};

exports.kickMember = async (req, res) => {
    try {
        await kickGuildMember({
            actorUserId: req.user._id,
            guildId: req.body.guildId,
            targetUserId: req.params.memberId,
            reason: req.body.reason
        });
        req.flash('success', 'Đã trục xuất thành viên khỏi Tông Môn.');
        res.redirect(`/guilds/${req.params.slug}`);
    } catch (error) {
        handleGuildError(req, res, error, `/guilds/${req.params.slug}`);
    }
};

exports.updateAnnouncement = async (req, res) => {
    try {
        await updateGuildAnnouncement({
            actorUserId: req.user._id,
            guildId: req.body.guildId,
            content: req.body.content
        });
        req.flash('success', 'Tông Môn Lệnh đã được cập nhật.');
        res.redirect(`/guilds/${req.params.slug}`);
    } catch (error) {
        handleGuildError(req, res, error, `/guilds/${req.params.slug}`);
    }
};

exports.updateJoinSettings = async (req, res) => {
    try {
        await updateGuildJoinSettings({
            actorUserId: req.user._id,
            guildId: req.body.guildId,
            payload: req.body
        });
        req.flash('success', 'Đã cập nhật cổng tuyển sinh.');
        res.redirect(`/guilds/${req.params.slug}`);
    } catch (error) {
        handleGuildError(req, res, error, `/guilds/${req.params.slug}`);
    }
};

exports.refreshInviteCode = async (req, res) => {
    try {
        await refreshGuildInviteCode({
            actorUserId: req.user._id,
            guildId: req.body.guildId
        });
        req.flash('success', 'Đã làm mới mật lệnh chiêu mộ.');
        res.redirect(`/guilds/${req.params.slug}`);
    } catch (error) {
        handleGuildError(req, res, error, `/guilds/${req.params.slug}`);
    }
};

exports.updateAutoModeration = async (req, res) => {
    try {
        await updateGuildAutoModeration({
            actorUserId: req.user._id,
            guildId: req.body.guildId,
            payload: req.body
        });
        req.flash('success', 'Đã cập nhật quân luật tự động.');
        res.redirect(`/guilds/${req.params.slug}`);
    } catch (error) {
        handleGuildError(req, res, error, `/guilds/${req.params.slug}`);
    }
};

exports.updateWeeklyGoal = async (req, res) => {
    try {
        await createOrUpdateWeeklyGoal({
            actorUserId: req.user._id,
            guildId: req.body.guildId,
            payload: req.body
        });
        req.flash('success', 'Đã cập nhật mục tiêu tuần.');
        res.redirect(`/guilds/${req.params.slug}`);
    } catch (error) {
        handleGuildError(req, res, error, `/guilds/${req.params.slug}`);
    }
};
