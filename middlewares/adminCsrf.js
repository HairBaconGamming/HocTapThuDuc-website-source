const crypto = require('crypto');

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function ensureAdminCsrfToken(req) {
    if (!req.session) {
        throw new Error('Admin CSRF protection requires session support.');
    }

    if (!req.session.adminCsrfToken) {
        req.session.adminCsrfToken = crypto.randomBytes(32).toString('hex');
    }

    return req.session.adminCsrfToken;
}

function adminCsrfGuard(req, res, next) {
    try {
        const token = ensureAdminCsrfToken(req);
        res.locals.adminCsrfToken = token;

        if (SAFE_METHODS.has(req.method)) {
            return next();
        }

        const providedToken =
            req.body?._csrf ||
            req.get('x-csrf-token') ||
            req.get('x-admin-csrf-token');

        if (providedToken && providedToken === token) {
            return next();
        }

        if (req.accepts('json') === 'json' || req.path.startsWith('/api/')) {
            return res.status(403).json({ error: 'CSRF token không hợp lệ hoặc đã hết hạn.' });
        }

        req.flash('error', 'Phiên quản trị đã thay đổi. Vui lòng tải lại trang và thử lại.');
        return res.status(403).redirect(req.get('referer') || '/admin/overview');
    } catch (error) {
        console.error('Admin CSRF error:', error);
        return res.status(500).send('Admin CSRF setup failed.');
    }
}

module.exports = {
    adminCsrfGuard,
    ensureAdminCsrfToken
};
