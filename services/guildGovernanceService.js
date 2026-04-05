const crypto = require('crypto');
const Guild = require('../models/Guild');
const GuildApplication = require('../models/GuildApplication');
const GuildAuditLog = require('../models/GuildAuditLog');
const GuildWeeklyGoal = require('../models/GuildWeeklyGoal');
const GuildContribution = require('../models/GuildContribution');
const User = require('../models/User');
const UserActivityLog = require('../models/UserActivityLog');
const {
    normalizeGuildRole,
    getGuildRoleLabel,
    hasGuildPermission,
    canManageTargetRole,
    getAssignableRoles
} = require('./guildAccessService');
const { getCurrentWeekKey, getDateDaysAgo, getWeekRange } = require('../utils/guildPeriodUtils');
const { GuildServiceError } = require('./guildErrors');

async function createAuditLog({ guildId, actorId = null, targetUserId = null, actionType, message, metadata = {} }) {
    if (!guildId || !actionType || !message) return null;
    return GuildAuditLog.create({
        guild: guildId,
        actor: actorId || null,
        targetUser: targetUserId || null,
        actionType,
        message,
        metadata
    });
}

async function buildJoinThresholdFeedback(user, guild) {
    const thresholds = guild?.settings?.joinThresholds || {};
    const failures = [];
    if ((user.level || 0) < Number(thresholds.minLevel || guild.levelRequirement || 0)) {
        failures.push(`Cần đạt level ${thresholds.minLevel || guild.levelRequirement || 0}.`);
    }
    if ((user.currentStreak || 0) < Number(thresholds.minStreak || 0)) {
        failures.push(`Cần duy trì chuỗi học ít nhất ${thresholds.minStreak} ngày.`);
    }
    if ((user.totalPoints || 0) < Number(thresholds.minTotalPoints || 0)) {
        failures.push(`Cần tích lũy ${thresholds.minTotalPoints} điểm học tập.`);
    }
    if (Number(thresholds.minWeeklyMinutes || 0) > 0) {
        const weekRange = getWeekRange();
        const weekRows = await UserActivityLog.find({
            user: user._id,
            dateStr: {
                $gte: weekRange.start.toISOString().slice(0, 10),
                $lte: weekRange.end.toISOString().slice(0, 10)
            }
        }).select('minutes').lean();
        const totalWeeklyMinutes = weekRows.reduce((sum, row) => sum + Number(row.minutes || 0), 0);
        if (totalWeeklyMinutes < Number(thresholds.minWeeklyMinutes || 0)) {
            failures.push(`Cần tích lũy ${thresholds.minWeeklyMinutes} phút học trong tuần.`);
        }
    }
    return failures;
}

function ensurePermission(guild, actorRole, permission) {
    if (!hasGuildPermission(guild, actorRole, permission)) {
        throw new GuildServiceError('Bạn không có quyền thực hiện thao tác này.', 403);
    }
}

async function submitGuildApplication({ userId, guildId, message = '' }) {
    const [user, guild] = await Promise.all([
        User.findById(userId).select('_id username guild level currentStreak totalPoints'),
        Guild.findById(guildId)
    ]);

    if (!user || !guild) {
        throw new GuildServiceError('Không tìm thấy dữ liệu Tông Môn hoặc người dùng.', 404);
    }
    if (user.guild) {
        throw new GuildServiceError('Bạn đã thuộc một Tông Môn khác.');
    }
    const thresholdFailures = await buildJoinThresholdFeedback(user, guild);
    if (thresholdFailures.length) {
        throw new GuildServiceError(thresholdFailures[0]);
    }
    if (guild.settings?.joinMode !== 'approval') {
        throw new GuildServiceError('Tông Môn này không mở đơn gia nhập theo chế độ duyệt.');
    }

    const application = await GuildApplication.create({
        guild: guild._id,
        applicant: user._id,
        message: String(message || '').trim().slice(0, 500)
    });

    await createAuditLog({
        guildId: guild._id,
        actorId: user._id,
        targetUserId: user._id,
        actionType: 'application_submitted',
        message: `${user.username} đã nộp đơn gia nhập Tông Môn.`,
        metadata: { applicationId: application._id }
    });

    return application;
}

async function reviewGuildApplication({ actorUserId, applicationId, decision, reviewNote = '' }) {
    const application = await GuildApplication.findById(applicationId).populate('guild');
    if (!application || !application.guild) {
        throw new GuildServiceError('Đơn gia nhập không tồn tại.', 404);
    }
    if (application.status !== 'pending') {
        throw new GuildServiceError('Đơn này đã được xử lý trước đó.');
    }

    const actor = await User.findById(actorUserId).select('_id username guild guildRole');
    if (!actor || String(actor.guild) !== String(application.guild._id)) {
        throw new GuildServiceError('Bạn không thuộc Tông Môn này.', 403);
    }
    ensurePermission(application.guild, actor.guildRole, 'approveApplications');

    const applicant = await User.findById(application.applicant);
    if (!applicant) {
        throw new GuildServiceError('Người nộp đơn không còn tồn tại.', 404);
    }

    const approved = decision === 'approved';
    application.status = approved ? 'approved' : 'rejected';
    application.reviewedBy = actor._id;
    application.reviewedAt = new Date();
    application.reviewNote = String(reviewNote || '').trim().slice(0, 300);

    if (approved) {
        if (applicant.guild) {
            throw new GuildServiceError('Người này đã gia nhập Tông Môn khác trước khi được duyệt.');
        }
        if ((application.guild.memberCount || 0) >= (application.guild.memberLimit || 30)) {
            throw new GuildServiceError('Tông Môn đã đầy, không thể duyệt thêm thành viên.');
        }
        applicant.guild = application.guild._id;
        applicant.guildRole = 'member';
        applicant.joinedGuildAt = new Date();
        application.guild.memberCount = Math.min(application.guild.memberLimit || 100, (application.guild.memberCount || 0) + 1);
        await applicant.save();
        await application.guild.save();
    }

    await application.save();
    await createAuditLog({
        guildId: application.guild._id,
        actorId: actor._id,
        targetUserId: applicant._id,
        actionType: approved ? 'application_approved' : 'application_rejected',
        message: approved
            ? `${actor.username} đã duyệt đơn của ${applicant.username}.`
            : `${actor.username} đã từ chối đơn của ${applicant.username}.`,
        metadata: { applicationId: application._id, reviewNote: application.reviewNote }
    });

    return application;
}

async function updateGuildRole({ actorUserId, guildId, targetUserId, nextRole }) {
    const [guild, actor, targetUser] = await Promise.all([
        Guild.findById(guildId),
        User.findById(actorUserId).select('_id username guild guildRole'),
        User.findById(targetUserId).select('_id username guild guildRole')
    ]);

    if (!guild || !actor || !targetUser) {
        throw new GuildServiceError('Không tìm thấy dữ liệu để đổi chức vụ.', 404);
    }
    if (String(actor.guild) !== String(guild._id) || String(targetUser.guild) !== String(guild._id)) {
        throw new GuildServiceError('Chỉ có thể đổi chức vụ cho thành viên cùng Tông Môn.', 403);
    }

    ensurePermission(guild, actor.guildRole, 'promoteMembers');

    const previousRole = normalizeGuildRole(targetUser.guildRole);
    const normalizedNextRole = normalizeGuildRole(nextRole);
    if (normalizedNextRole === previousRole) {
        throw new GuildServiceError('Thành viên này đã ở chức vụ đó rồi.');
    }
    if (!getAssignableRoles(actor.guildRole).includes(normalizedNextRole)) {
        throw new GuildServiceError('Bạn không thể bổ nhiệm chức vụ này.');
    }
    if (!canManageTargetRole(actor.guildRole, targetUser.guildRole)) {
        throw new GuildServiceError('Bạn không đủ quyền để thay đổi chức vụ của người này.', 403);
    }
    targetUser.guildRole = normalizedNextRole;
    await targetUser.save();

    await createAuditLog({
        guildId: guild._id,
        actorId: actor._id,
        targetUserId: targetUser._id,
        actionType: 'role_changed',
        message: `${actor.username} đã bổ nhiệm ${targetUser.username} từ ${getGuildRoleLabel(previousRole)} lên ${getGuildRoleLabel(normalizedNextRole)}.`,
        metadata: { previousRole, nextRole: normalizedNextRole }
    });

    return targetUser;
}

async function kickGuildMember({ actorUserId, guildId, targetUserId, reason = '', isSystem = false }) {
    const [guild, actor, targetUser] = await Promise.all([
        Guild.findById(guildId),
        actorUserId ? User.findById(actorUserId).select('_id username guild guildRole') : null,
        User.findById(targetUserId).select('_id username guild guildRole')
    ]);

    if (!guild || !targetUser) {
        throw new GuildServiceError('Không tìm thấy thành viên hoặc Tông Môn.', 404);
    }
    if (String(targetUser.guild) !== String(guild._id)) {
        throw new GuildServiceError('Người này không còn thuộc Tông Môn.', 404);
    }
    if (normalizeGuildRole(targetUser.guildRole) === 'leader') {
        throw new GuildServiceError('Không thể trục xuất Trưởng môn.');
    }

    if (!isSystem) {
        if (!actor || String(actor.guild) !== String(guild._id)) {
            throw new GuildServiceError('Bạn không thuộc Tông Môn này.', 403);
        }
        ensurePermission(guild, actor.guildRole, 'kickMembers');
        if (!canManageTargetRole(actor.guildRole, targetUser.guildRole)) {
            throw new GuildServiceError('Bạn không đủ quyền để trục xuất người này.', 403);
        }
    }

    targetUser.guild = null;
    targetUser.guildRole = 'member';
    targetUser.joinedGuildAt = null;
    guild.memberCount = Math.max(1, Number(guild.memberCount || 1) - 1);

    await Promise.all([targetUser.save(), guild.save()]);

    await createAuditLog({
        guildId: guild._id,
        actorId: actor?._id || null,
        targetUserId: targetUser._id,
        actionType: isSystem ? 'auto_kick' : 'member_kicked',
        message: isSystem
            ? `${targetUser.username} bị hệ thống loại khỏi Tông Môn. ${reason}`.trim()
            : `${actor.username} đã trục xuất ${targetUser.username}. ${reason}`.trim(),
        metadata: { reason, bySystem: isSystem }
    });
}

async function updateGuildAnnouncement({ actorUserId, guildId, content }) {
    const [guild, actor] = await Promise.all([
        Guild.findById(guildId),
        User.findById(actorUserId).select('_id username guild guildRole')
    ]);
    if (!guild || !actor || String(actor.guild) !== String(guild._id)) {
        throw new GuildServiceError('Bạn không thể cập nhật Tông Môn này.', 403);
    }
    ensurePermission(guild, actor.guildRole, 'editAnnouncement');

    guild.announcement = {
        content: String(content || '').trim().slice(0, 700),
        updatedBy: actor._id,
        updatedAt: new Date()
    };
    await guild.save();

    await createAuditLog({
        guildId: guild._id,
        actorId: actor._id,
        actionType: 'announcement_updated',
        message: `${actor.username} đã cập nhật Tông Môn Lệnh.`,
        metadata: { preview: guild.announcement.content.slice(0, 140) }
    });

    return guild.announcement;
}

async function updateGuildJoinSettings({ actorUserId, guildId, payload }) {
    const [guild, actor] = await Promise.all([
        Guild.findById(guildId),
        User.findById(actorUserId).select('_id username guild guildRole')
    ]);
    if (!guild || !actor || String(actor.guild) !== String(guild._id)) {
        throw new GuildServiceError('Bạn không thể chỉnh tuyển sinh của Tông Môn này.', 403);
    }
    ensurePermission(guild, actor.guildRole, 'approveApplications');

    const nextJoinMode = ['open', 'approval', 'invite'].includes(payload?.joinMode)
        ? payload.joinMode
        : (guild.settings?.joinMode || 'open');

    guild.settings = guild.settings || {};
    guild.settings.joinMode = nextJoinMode;
    guild.settings.joinThresholds = {
        minLevel: Math.max(0, Number(payload?.minLevel || 0)),
        minStreak: Math.max(0, Number(payload?.minStreak || 0)),
        minTotalPoints: Math.max(0, Number(payload?.minTotalPoints || 0)),
        minWeeklyMinutes: Math.max(0, Number(payload?.minWeeklyMinutes || 0))
    };
    if (!guild.settings.inviteCode) {
        guild.settings.inviteCode = crypto.randomBytes(3).toString('hex').toUpperCase();
    }
    await guild.save();

    await createAuditLog({
        guildId: guild._id,
        actorId: actor._id,
        actionType: 'join_settings_updated',
        message: `${actor.username} đã cập nhật cổng tuyển sinh Tông Môn.`,
        metadata: {
            joinMode: guild.settings.joinMode,
            thresholds: guild.settings.joinThresholds
        }
    });

    return guild.settings;
}

async function refreshGuildInviteCode({ actorUserId, guildId }) {
    const [guild, actor] = await Promise.all([
        Guild.findById(guildId),
        User.findById(actorUserId).select('_id username guild guildRole')
    ]);
    if (!guild || !actor || String(actor.guild) !== String(guild._id)) {
        throw new GuildServiceError('Bạn không thể làm mới mật lệnh mời.', 403);
    }
    ensurePermission(guild, actor.guildRole, 'refreshInviteCode');
    guild.settings = guild.settings || {};
    guild.settings.inviteCode = crypto.randomBytes(4).toString('hex').toUpperCase();
    await guild.save();

    await createAuditLog({
        guildId: guild._id,
        actorId: actor._id,
        actionType: 'invite_code_refreshed',
        message: `${actor.username} đã làm mới mật lệnh chiêu mộ.`,
        metadata: { inviteCode: guild.settings.inviteCode }
    });

    return guild.settings.inviteCode;
}

async function updateGuildAutoModeration({ actorUserId, guildId, payload }) {
    const [guild, actor] = await Promise.all([
        Guild.findById(guildId),
        User.findById(actorUserId).select('_id username guild guildRole')
    ]);
    if (!guild || !actor || String(actor.guild) !== String(guild._id)) {
        throw new GuildServiceError('Bạn không thể chỉnh quân luật của Tông Môn này.', 403);
    }
    ensurePermission(guild, actor.guildRole, 'setAutoKickRules');

    guild.settings = guild.settings || {};
    guild.settings.autoModeration = {
        enabled: String(payload?.enabled) === 'true' || payload?.enabled === true,
        kickAfterInactiveDays: Math.max(0, Number(payload?.kickAfterInactiveDays || 0)),
        kickIfWeeklyContributionBelow: Math.max(0, Number(payload?.kickIfWeeklyContributionBelow || 0)),
        excludeRoles: ['leader', 'co_leader']
    };
    await guild.save();

    await createAuditLog({
        guildId: guild._id,
        actorId: actor._id,
        actionType: 'auto_moderation_updated',
        message: `${actor.username} đã cập nhật quân luật tự động.`,
        metadata: guild.settings.autoModeration
    });

    return guild.settings.autoModeration;
}

async function createOrUpdateWeeklyGoal({ actorUserId, guildId, payload }) {
    const [guild, actor] = await Promise.all([
        Guild.findById(guildId),
        User.findById(actorUserId).select('_id username guild guildRole')
    ]);
    if (!guild || !actor || String(actor.guild) !== String(guild._id)) {
        throw new GuildServiceError('Bạn không thể đặt mục tiêu cho Tông Môn này.', 403);
    }
    ensurePermission(guild, actor.guildRole, 'manageWeeklyGoal');

    const weekKey = getCurrentWeekKey();
    const targetType = payload?.targetType === 'resource' ? 'resource' : 'spirit_power';
    const targetResource = targetType === 'resource' ? String(payload?.targetResource || 'water') : null;
    const title = String(payload?.title || '').trim().slice(0, 120) || 'Mục tiêu tuần';
    const targetAmount = Math.max(1, Number(payload?.targetAmount || 1));
    const rewardPreview = String(payload?.rewardPreview || '').trim().slice(0, 220);

    const goal = await GuildWeeklyGoal.findOneAndUpdate(
        { guild: guild._id, weekKey },
        {
            $set: {
                title,
                targetType,
                targetResource,
                targetAmount,
                rewardPreview,
                createdBy: actor._id,
                status: 'active'
            },
            $setOnInsert: { currentAmount: 0 }
        },
        { new: true, upsert: true }
    );

    guild.weeklyGoalSnapshot = {
        goalId: goal._id,
        weekKey,
        title: goal.title,
        targetType: goal.targetType,
        targetResource: goal.targetResource,
        targetAmount: goal.targetAmount,
        currentAmount: goal.currentAmount,
        rewardPreview: goal.rewardPreview,
        status: goal.status
    };
    await guild.save();

    await createAuditLog({
        guildId: guild._id,
        actorId: actor._id,
        actionType: 'weekly_goal_updated',
        message: `${actor.username} đã đặt mục tiêu tuần mới cho Tông Môn.`,
        metadata: {
            title: goal.title,
            targetType: goal.targetType,
            targetResource: goal.targetResource,
            targetAmount: goal.targetAmount
        }
    });

    return goal;
}

async function syncWeeklyGoalProgress(guildId, { resourceType, amount, spiritPower }) {
    const weekKey = getCurrentWeekKey();
    const goal = await GuildWeeklyGoal.findOne({ guild: guildId, weekKey, status: 'active' });
    if (!goal) return null;

    let delta = 0;
    if (goal.targetType === 'spirit_power') {
        delta = Math.max(0, Number(spiritPower || 0));
    } else if (goal.targetType === 'resource' && goal.targetResource === resourceType) {
        delta = Math.max(0, Number(amount || 0));
    }
    if (!delta) return goal;

    goal.currentAmount = Number(goal.currentAmount || 0) + delta;
    if (goal.currentAmount >= goal.targetAmount) {
        goal.currentAmount = goal.targetAmount;
        goal.status = 'completed';
        goal.completedAt = new Date();
    }
    await goal.save();

    const guild = await Guild.findById(guildId);
    if (guild) {
        guild.weeklyGoalSnapshot = {
            goalId: goal._id,
            weekKey: goal.weekKey,
            title: goal.title,
            targetType: goal.targetType,
            targetResource: goal.targetResource,
            targetAmount: goal.targetAmount,
            currentAmount: goal.currentAmount,
            rewardPreview: goal.rewardPreview,
            status: goal.status
        };
        await guild.save();

        if (goal.status === 'completed') {
            await createAuditLog({
                guildId,
                actionType: 'weekly_goal_completed',
                message: `Tông Môn đã hoàn thành mục tiêu tuần: ${goal.title}.`,
                metadata: { goalId: goal._id }
            });
        }
    }

    return goal;
}

async function runGuildAutoModerationSweep() {
    const guilds = await Guild.find({ 'settings.autoModeration.enabled': true }).lean();
    if (!guilds.length) return { kickedCount: 0 };

    let kickedCount = 0;

    for (const guild of guilds) {
        const auto = guild.settings?.autoModeration || {};
        const inactiveThreshold = auto.kickAfterInactiveDays > 0
            ? getDateDaysAgo(auto.kickAfterInactiveDays)
            : null;
        const weekRange = getWeekRange();

        const members = await User.find({ guild: guild._id }).select('_id username guildRole');
        const memberIds = members.map((member) => member._id);

        const activityRows = memberIds.length
            ? await UserActivityLog.aggregate([
                { $match: { user: { $in: memberIds }, dateStr: { $gte: weekRange.start.toISOString().slice(0, 10), $lte: weekRange.end.toISOString().slice(0, 10) } } },
                {
                    $group: {
                        _id: '$user',
                        weeklyMinutes: { $sum: '$minutes' },
                        lastActive: { $max: '$lastActive' }
                    }
                }
            ])
            : [];
        const activityMap = new Map(activityRows.map((row) => [String(row._id), row]));

        const contributionRows = memberIds.length
            ? await GuildContribution.aggregate([
                { $match: { guild: guild._id, user: { $in: memberIds }, createdAt: { $gte: weekRange.start, $lte: weekRange.end } } },
                { $group: { _id: '$user', weeklyContributionValue: { $sum: '$contributionValue' } } }
            ])
            : [];
        const contributionMap = new Map(contributionRows.map((row) => [String(row._id), Number(row.weeklyContributionValue || 0)]));

        for (const member of members) {
            const role = normalizeGuildRole(member.guildRole);
            if (role === 'leader' || role === 'co_leader') continue;

            const activity = activityMap.get(String(member._id));
            const lastActive = activity?.lastActive || null;
            const weeklyContribution = contributionMap.get(String(member._id)) || 0;
            const shouldKickForInactivity = inactiveThreshold && (!lastActive || new Date(lastActive) < inactiveThreshold);
            const shouldKickForContribution = auto.kickIfWeeklyContributionBelow > 0 && weeklyContribution <= auto.kickIfWeeklyContributionBelow;

            if (shouldKickForInactivity || shouldKickForContribution) {
                const reasonParts = [];
                if (shouldKickForInactivity) reasonParts.push(`Offline quá ${auto.kickAfterInactiveDays} ngày`);
                if (shouldKickForContribution) reasonParts.push(`đóng góp tuần <= ${auto.kickIfWeeklyContributionBelow}`);
                await kickGuildMember({
                    guildId: guild._id,
                    targetUserId: member._id,
                    reason: reasonParts.join(' · '),
                    isSystem: true
                });
                kickedCount += 1;
            }
        }
    }

    return { kickedCount };
}

module.exports = {
    createAuditLog,
    buildJoinThresholdFeedback,
    submitGuildApplication,
    reviewGuildApplication,
    updateGuildRole,
    kickGuildMember,
    updateGuildAnnouncement,
    updateGuildJoinSettings,
    refreshGuildInviteCode,
    updateGuildAutoModeration,
    createOrUpdateWeeklyGoal,
    syncWeeklyGoalProgress,
    runGuildAutoModerationSweep
};
