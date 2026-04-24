const AdminActionLog = require('../models/AdminActionLog');

async function recordAdminAction({
    actorId,
    domain,
    action,
    targetType,
    targetId,
    summary,
    metadata = {}
}) {
    if (!actorId || !domain || !action || !targetType || !targetId || !summary) {
        return null;
    }

    return AdminActionLog.create({
        actor: actorId,
        domain,
        action,
        targetType,
        targetId: String(targetId),
        summary,
        metadata
    });
}

module.exports = {
    recordAdminAction
};
