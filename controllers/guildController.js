const realmHelper = require('../utils/realmHelper');
const gardenAssets = require('../config/gardenAssets');
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

const TAB_WHITELIST = new Set(['overview', 'goal', 'members', 'admin']);
const JOIN_MODE_LABELS = {
    open: 'Vào tự do',
    approval: 'Cần phê duyệt',
    invite: 'Chỉ qua mật lệnh'
};
const ROLE_LABELS = {
    leader: 'Trưởng môn',
    co_leader: 'Phó tông chủ',
    elder: 'Trưởng lão',
    member: 'Đệ tử'
};
const DONATION_SYMBOLS = {
    water: '💧',
    fertilizer: '🌿',
    gold: '🪙',
    tomato: '🍅',
    wheat: '🌾',
    carrot: '🥕',
    sunflower: '🌻',
    watermelon: '🍉',
    chili_pepper: '🌶️'
};

function formatCompactNumber(value) {
    return Number(value || 0).toLocaleString('vi-VN', { maximumFractionDigits: 1 });
}

function getTreeAsset(stage) {
    return Array.isArray(guildTreeAssets)
        ? guildTreeAssets.find((entry) => entry.stage === stage) || null
        : null;
}

function normalizeGuildTab(tab, showAdminTab) {
    if (!TAB_WHITELIST.has(tab)) return 'overview';
    if (tab === 'admin' && !showAdminTab) return 'overview';
    return tab;
}

function buildDonationCatalog(viewerResources) {
    const inventory = viewerResources.inventory || {};
    const resourceIcons = gardenAssets.UI?.resourceIcons || {};

    const catalog = [
        {
            key: 'water',
            label: 'Nước',
            symbol: DONATION_SYMBOLS.water || '💧',
            iconUrl: resourceIcons.water || '',
            amount: viewerResources.water || 0
        },
        {
            key: 'fertilizer',
            label: 'Phân bón',
            symbol: DONATION_SYMBOLS.fertilizer || '🌿',
            iconUrl: resourceIcons.fertilizer || '',
            amount: viewerResources.fertilizer || 0
        },
        {
            key: 'gold',
            label: 'Tiền vàng',
            symbol: DONATION_SYMBOLS.gold || '🪙',
            iconUrl: resourceIcons.gold || '',
            amount: viewerResources.gold || 0
        }
    ];

    if (gardenAssets.PLANTS) {
        Object.keys(gardenAssets.PLANTS).forEach(key => {
            const plant = gardenAssets.PLANTS[key];
            catalog.push({
                key: key,
                label: plant.name || key,
                symbol: DONATION_SYMBOLS[key] || '🌱',
                iconUrl: plant.harvestIcon || '',
                amount: inventory[key] || 0
            });
        });
    }

    return catalog;
}

function buildHeroMetaChips(guild) {
    return [
        {
            key: 'leader',
            text: `Trưởng môn: ${guild.leader?.username || 'Ẩn danh'}`
        },
        {
            key: 'members',
            text: `${guild.memberCount}/${guild.memberLimit} thành viên`
        },
        {
            key: 'joinMode',
            text: JOIN_MODE_LABELS[guild.settings?.joinMode || 'open'] || 'Vào tự do'
        }
    ];
}

function buildCurrentBuffBadges(buffSnapshot) {
    return [
        {
            label: 'XP học bài',
            value: `+${buffSnapshot.lessonXpPct || 0}%`,
            tone: 'xp'
        },
        {
            label: 'Độ bền cây',
            value: `+${buffSnapshot.witherTimeBonusPct || 0}%`,
            tone: 'garden'
        }
    ];
}

function buildGoalArtifacts(weeklyGoal, donationLookup) {
    const targetLabel = weeklyGoal && weeklyGoal.targetType === 'resource'
        ? (donationLookup[weeklyGoal.targetResource]?.label || weeklyGoal.targetResource || 'Tài nguyên')
        : 'Linh Lực';
    const targetSymbol = weeklyGoal && weeklyGoal.targetType === 'resource'
        ? (donationLookup[weeklyGoal.targetResource]?.symbol || '✨')
        : '✨';
    const percent = weeklyGoal && Number(weeklyGoal.targetAmount || 0) > 0
        ? Math.min(100, Math.round((Number(weeklyGoal.currentAmount || 0) / Number(weeklyGoal.targetAmount || 0)) * 100))
        : 0;

    return {
        weeklyGoal,
        weeklyGoalPercent: percent,
        weeklyGoalTarget: targetLabel,
        weeklyGoalTargetSymbol: targetSymbol,
        goalBanner: weeklyGoal
            ? {
                title: weeklyGoal.title || 'Tích lũy linh lực tuần này',
                progressText: `${targetSymbol} Đạt ${formatCompactNumber(weeklyGoal.currentAmount)} / ${formatCompactNumber(weeklyGoal.targetAmount)} ${targetLabel}`,
                cta: 'Xem chi tiết',
                percent
            }
            : null,
        goalModalSummary: weeklyGoal
            ? {
                title: weeklyGoal.title || 'Chiến dịch tuần',
                description: weeklyGoal.rewardPreview || 'Hoàn thành chiến dịch để nhận phần thưởng cộng hưởng cho cả Tông Môn.',
                metrics: [
                    { label: 'Đã góp', value: formatCompactNumber(weeklyGoal.currentAmount) },
                    { label: 'Mục tiêu', value: formatCompactNumber(weeklyGoal.targetAmount) },
                    { label: 'Tiến độ', value: `${percent}%` }
                ]
            }
            : null
    };
}

function buildMemberRows({ members, viewerUserId, isMember, permissions, roleOptions }) {
    return (members || []).map((member) => {
        const canEditRole = isMember
            && permissions.promoteMembers
            && String(member._id) !== String(viewerUserId)
            && Array.isArray(roleOptions)
            && roleOptions.length > 0;
        const canKick = canEditRole && permissions.kickMembers && member.roleKey !== 'leader';

        return {
            ...member,
            roleText: ROLE_LABELS[member.roleKey] || member.roleLabel,
            lastActiveText: member.lastActive
                ? new Date(member.lastActive).toLocaleString('vi-VN')
                : 'Chưa ghi nhận',
            weeklyContributionText: formatCompactNumber(member.weeklyContributionValue),
            weeklyStudyMinutesText: Number(member.weeklyStudyMinutes || 0).toLocaleString('vi-VN'),
            canEditRole,
            canKick
        };
    });
}

function buildAdminRows({ guild, permissions, weeklyGoal, announcementCopy }) {
    const rows = [];

    if (permissions.editAnnouncement) {
        rows.push({
            key: 'announcement',
            title: 'Tông Môn Lệnh',
            description: announcementCopy || 'Chưa có thông báo chung. Hãy ghim mục tiêu hoặc nhịp học của tuần này.',
            actionLabel: 'Chỉnh sửa',
            drawerTarget: 'announcement'
        });
    }

    if (permissions.approveApplications) {
        rows.push({
            key: 'recruitment',
            title: 'Chế độ tuyển sinh',
            description: `${JOIN_MODE_LABELS[guild.settings?.joinMode || 'open']} · Level tối thiểu ${guild.settings?.joinThresholds?.minLevel || 0} · Streak tối thiểu ${guild.settings?.joinThresholds?.minStreak || 0}`,
            actionLabel: 'Đổi',
            drawerTarget: 'recruitment'
        });
    }

    if (permissions.manageWeeklyGoal) {
        rows.push({
            key: 'goal-settings',
            title: 'Mục tiêu tuần',
            description: weeklyGoal?.title || 'Chưa khởi tạo chiến dịch tuần.',
            actionLabel: '+ Tạo chiến dịch',
            drawerTarget: 'goal-settings'
        });
    }

    if (permissions.setAutoKickRules) {
        rows.push({
            key: 'moderation',
            title: 'Thiết quân luật',
            description: `${guild.settings?.autoModeration?.enabled ? 'Đang bật auto-kick' : 'Đang tắt auto-kick'} · Offline quá ${guild.settings?.autoModeration?.kickAfterInactiveDays || 0} ngày · Cống hiến tuần ≤ ${guild.settings?.autoModeration?.kickIfWeeklyContributionBelow || 0}`,
            actionLabel: 'Chỉnh sửa',
            drawerTarget: 'moderation'
        });
    }

    if (permissions.refreshInviteCode) {
        rows.push({
            key: 'invite-tools',
            title: 'Mật lệnh chiêu mộ',
            description: guild.settings?.inviteCode
                ? 'Đang có mật lệnh hoạt động để chiêu mộ đệ tử mới.'
                : 'Chưa có mật lệnh chiêu mộ.',
            actionLabel: 'Quản lý',
            drawerTarget: 'invite-tools'
        });
    }

    return rows;
}

function buildRightRail({ topContributors, recentContributions }) {
    return {
        defaultSegment: 'leaderboard',
        leaderboard: topContributors || [],
        activity: recentContributions || []
    };
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

        const viewerResources = {
            water: viewerGarden.water || 0,
            fertilizer: viewerGarden.fertilizer || 0,
            gold: viewerGarden.gold || 0,
            inventory
        };
        const roleOptions = getAssignableRoles(viewerRole);
        const showAdminTab = isMember && viewerRole === 'leader';
        const activeTab = normalizeGuildTab(req.query.tab, showAdminTab);
        const donationCatalog = buildDonationCatalog(viewerResources);
        const donationLookup = donationCatalog.reduce((acc, item) => {
            acc[item.key] = item;
            return acc;
        }, {});
        const weeklyGoal = guildDetail.weeklyGoal || guildDetail.guild.weeklyGoalSnapshot || null;
        const goalArtifacts = buildGoalArtifacts(weeklyGoal, donationLookup);
        const tree = guildDetail.treeProgress;
        const buffSnapshot = guildDetail.guild.buffSnapshot || { lessonXpPct: 0, witherTimeBonusPct: 0 };
        const treeAsset = getTreeAsset(tree.current.stage);
        const nextUnlockCopy = tree.next
            ? `Còn ${formatCompactNumber(tree.xpForNextStage)} Linh Lực để mở khóa ${tree.next.name}.`
            : 'Linh Thụ đã đạt đỉnh cảnh giới và đang che chở toàn bộ Tông Môn.';
        const currentBuffBadges = buildCurrentBuffBadges(buffSnapshot);
        const announcementCopy = guildDetail.guild.announcement?.content || '';
        const memberRows = buildMemberRows({
            members: guildDetail.members,
            viewerUserId: req.user._id,
            isMember,
            permissions,
            roleOptions
        });
        const adminRows = buildAdminRows({
            guild: guildDetail.guild,
            permissions,
            weeklyGoal,
            announcementCopy
        });
        const rightRail = buildRightRail({
            topContributors: guildDetail.topContributors,
            recentContributions: guildDetail.recentContributions
        });
        const guildUi = {
            activeTab,
            showAdminTab,
            heroMetaChips: buildHeroMetaChips(guildDetail.guild),
            joinModeLabelMap: JOIN_MODE_LABELS,
            roleLabelMap: ROLE_LABELS,
            donationCatalog,
            donationLookup,
            tree,
            treeAsset,
            nextUnlockCopy,
            currentBuffBadges,
            announcementCopy,
            weeklyGoal,
            weeklyGoalPercent: goalArtifacts.weeklyGoalPercent,
            weeklyGoalTarget: goalArtifacts.weeklyGoalTarget,
            weeklyGoalTargetSymbol: goalArtifacts.weeklyGoalTargetSymbol,
            goalBanner: goalArtifacts.goalBanner,
            goalModalSummary: goalArtifacts.goalModalSummary,
            topContributors: guildDetail.topContributors || [],
            topThreeContributors: (guildDetail.topContributors || []).slice(0, 3),
            competition: guildDetail.competition || { weekly: { top: [], self: null }, monthly: { top: [], self: null } },
            memberRows,
            adminRows,
            rightRail,
            viewerResourceSummary: viewerResources
        };

        res.render('guild', {
            title: guildDetail.guild.name,
            user: req.user,
            guildDetail,
            guildTreeAssets,
            guildUi,
            viewerContext,
            viewerUserId: String(req.user._id),
            viewerResources,
            isMember,
            canJoin,
            pendingApplication,
            permissions,
            viewerRole,
            roleOptions,
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
