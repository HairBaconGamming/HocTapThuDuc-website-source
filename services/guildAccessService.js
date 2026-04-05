const ROLE_ORDER = Object.freeze({
    member: 1,
    elder: 2,
    officer: 2,
    co_leader: 3,
    leader: 4
});

const ROLE_LABELS = Object.freeze({
    leader: 'Trưởng môn',
    co_leader: 'Phó tông chủ',
    elder: 'Trưởng lão',
    officer: 'Trưởng lão',
    member: 'Đệ tử'
});

const DEFAULT_PERMISSION_MATRIX = Object.freeze({
    leader: {
        approveApplications: true,
        inviteMembers: true,
        kickMembers: true,
        promoteMembers: true,
        editAnnouncement: true,
        manageWeeklyGoal: true,
        manageSkillTree: true,
        setAutoKickRules: true,
        refreshInviteCode: true
    },
    co_leader: {
        approveApplications: true,
        inviteMembers: true,
        kickMembers: true,
        promoteMembers: true,
        editAnnouncement: true,
        manageWeeklyGoal: true,
        manageSkillTree: true,
        setAutoKickRules: true,
        refreshInviteCode: true
    },
    elder: {
        approveApplications: true,
        inviteMembers: true,
        kickMembers: true,
        promoteMembers: false,
        editAnnouncement: true,
        manageWeeklyGoal: false,
        manageSkillTree: false,
        setAutoKickRules: false,
        refreshInviteCode: false
    },
    member: {
        approveApplications: false,
        inviteMembers: false,
        kickMembers: false,
        promoteMembers: false,
        editAnnouncement: false,
        manageWeeklyGoal: false,
        manageSkillTree: false,
        setAutoKickRules: false,
        refreshInviteCode: false
    }
});

function normalizeGuildRole(role) {
    const normalized = String(role || 'member').trim().toLowerCase();
    if (normalized === 'officer') return 'elder';
    if (ROLE_ORDER[normalized]) return normalized;
    return 'member';
}

function getGuildRoleLabel(role) {
    return ROLE_LABELS[normalizeGuildRole(role)] || ROLE_LABELS.member;
}

function getPermissionMatrix(guild) {
    const overrides = guild?.settings?.permissions || {};
    return {
        leader: { ...DEFAULT_PERMISSION_MATRIX.leader, ...(overrides.leader || {}) },
        co_leader: { ...DEFAULT_PERMISSION_MATRIX.co_leader, ...(overrides.co_leader || {}) },
        elder: { ...DEFAULT_PERMISSION_MATRIX.elder, ...(overrides.elder || {}) },
        member: { ...DEFAULT_PERMISSION_MATRIX.member, ...(overrides.member || {}) }
    };
}

function hasGuildPermission(guild, role, permission) {
    const normalizedRole = normalizeGuildRole(role);
    const matrix = getPermissionMatrix(guild);
    return Boolean(matrix[normalizedRole]?.[permission]);
}

function canManageTargetRole(actorRole, targetRole) {
    const actorRank = ROLE_ORDER[normalizeGuildRole(actorRole)] || 0;
    const targetRank = ROLE_ORDER[normalizeGuildRole(targetRole)] || 0;
    return actorRank > targetRank;
}

function getAssignableRoles(actorRole) {
    const normalizedActor = normalizeGuildRole(actorRole);
    if (normalizedActor === 'leader') return ['co_leader', 'elder', 'member'];
    if (normalizedActor === 'co_leader') return ['elder', 'member'];
    return [];
}

module.exports = {
    ROLE_ORDER,
    ROLE_LABELS,
    DEFAULT_PERMISSION_MATRIX,
    normalizeGuildRole,
    getGuildRoleLabel,
    hasGuildPermission,
    canManageTargetRole,
    getAssignableRoles
};
