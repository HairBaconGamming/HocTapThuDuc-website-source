const AUTH_BLOCKLIST = new Set([
    '/login',
    '/register',
    '/logout',
    '/auth/google',
    '/auth/google/callback'
]);

function sanitizeInternalRedirect(candidate) {
    if (typeof candidate !== 'string') return null;

    const value = candidate.trim();
    if (!value || !value.startsWith('/') || value.startsWith('//')) {
        return null;
    }

    try {
        const parsed = new URL(value, 'http://local.test');
        const normalized = `${parsed.pathname}${parsed.search || ''}${parsed.hash || ''}`;
        return AUTH_BLOCKLIST.has(parsed.pathname) ? null : normalized;
    } catch (error) {
        return null;
    }
}

function getSafeRefererPath(req) {
    const referer = String(req.get('referer') || '').trim();
    if (!referer) return null;

    try {
        const refererUrl = new URL(referer);
        const currentOrigin = `${req.protocol}://${req.get('host')}`;
        if (refererUrl.origin !== currentOrigin) return null;

        return sanitizeInternalRedirect(`${refererUrl.pathname}${refererUrl.search || ''}${refererUrl.hash || ''}`);
    } catch (error) {
        return null;
    }
}

function rememberReturnTo(req, candidate) {
    const safeRedirect = sanitizeInternalRedirect(candidate);
    if (safeRedirect && req.session) {
        req.session.authReturnTo = safeRedirect;
    }
    return safeRedirect;
}

function getRememberedReturnTo(req) {
    return sanitizeInternalRedirect(req?.session?.authReturnTo || '');
}

function consumeReturnTo(req) {
    const remembered = getRememberedReturnTo(req);
    if (req?.session) {
        delete req.session.authReturnTo;
    }
    return remembered;
}

module.exports = {
    sanitizeInternalRedirect,
    getSafeRefererPath,
    rememberReturnTo,
    getRememberedReturnTo,
    consumeReturnTo
};
