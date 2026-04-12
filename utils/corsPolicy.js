const DEFAULT_PRODUCTION_ORIGINS = ['https://hoctapthuduc.onrender.com'];
const SAFE_NULL_ORIGIN_METHODS = new Set(['GET', 'HEAD']);
const NULL_ORIGIN_NAVIGATION_METHODS = new Set(['GET', 'HEAD', 'POST']);

function splitOrigins(value) {
    return String(value || '')
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean);
}

function getAllowedOrigins() {
    const fromEnv = [
        ...splitOrigins(process.env.ALLOWED_ORIGINS),
        ...splitOrigins(process.env.APP_ORIGIN),
        ...splitOrigins(process.env.RENDER_EXTERNAL_URL)
    ];

    return Array.from(new Set([...DEFAULT_PRODUCTION_ORIGINS, ...fromEnv]));
}

function getRequestedMethod(req) {
    return String(
        req.get('access-control-request-method') ||
        req.method ||
        'GET'
    ).toUpperCase();
}

function hasSensitiveAuthContext(req) {
    const requestedHeaders = String(req.get('access-control-request-headers') || '').toLowerCase();

    return !!(
        req.headers.cookie ||
        req.headers.authorization ||
        requestedHeaders.includes('authorization')
    );
}

function isSafeNullOriginRequest(req) {
    const method = getRequestedMethod(req);
    return SAFE_NULL_ORIGIN_METHODS.has(method) && !hasSensitiveAuthContext(req);
}

function isNullOriginDocumentNavigation(req) {
    const method = String(req.method || 'GET').toUpperCase();
    const accept = String(req.get('accept') || '').toLowerCase();
    const contentType = String(req.get('content-type') || '').toLowerCase();
    const fetchMode = String(req.get('sec-fetch-mode') || '').toLowerCase();
    const fetchDest = String(req.get('sec-fetch-dest') || '').toLowerCase();

    const standardFormEncoding =
        !contentType ||
        contentType.includes('application/x-www-form-urlencoded') ||
        contentType.includes('multipart/form-data') ||
        contentType.includes('text/plain');

    const looksLikeDocumentNavigation =
        fetchMode === 'navigate' ||
        fetchDest === 'document' ||
        accept.includes('text/html');

    return (
        NULL_ORIGIN_NAVIGATION_METHODS.has(method) &&
        standardFormEncoding &&
        looksLikeDocumentNavigation
    );
}

function buildCorsOptions(req) {
    const origin = req.get('origin');

    if (process.env.NODE_ENV !== 'production') {
        return {
            origin: true,
            credentials: true,
            optionsSuccessStatus: 204
        };
    }

    if (!origin) {
        return {
            origin: true,
            credentials: true,
            optionsSuccessStatus: 204
        };
    }

    if (getAllowedOrigins().includes(origin)) {
        return {
            origin: true,
            credentials: true,
            optionsSuccessStatus: 204
        };
    }

    if (origin === 'null' && isSafeNullOriginRequest(req)) {
        return {
            origin: true,
            credentials: false,
            optionsSuccessStatus: 204
        };
    }

    if (origin === 'null' && isNullOriginDocumentNavigation(req)) {
        return {
            origin: true,
            credentials: true,
            optionsSuccessStatus: 204
        };
    }

    return {
        origin: false,
        credentials: false,
        optionsSuccessStatus: 204
    };
}

function corsOptionsDelegate(req, callback) {
    const options = buildCorsOptions(req);

    if (req.get('origin') && options.origin === false) {
        console.warn(`🚫 Blocked CORS Origin: ${req.get('origin')} ${req.method} ${req.originalUrl}`);
    }

    callback(null, options);
}

module.exports = {
    DEFAULT_PRODUCTION_ORIGINS,
    getAllowedOrigins,
    getRequestedMethod,
    hasSensitiveAuthContext,
    isSafeNullOriginRequest,
    isNullOriginDocumentNavigation,
    buildCorsOptions,
    corsOptionsDelegate
};
