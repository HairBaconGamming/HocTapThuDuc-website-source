const assert = require('assert');

const {
    buildCorsOptions,
    isSafeNullOriginRequest,
    isNullOriginDocumentNavigation
} = require('../utils/corsPolicy');

function withEnv(patch, fn) {
    const original = {};

    for (const [key, value] of Object.entries(patch)) {
        original[key] = process.env[key];
        if (typeof value === 'undefined') {
            delete process.env[key];
        } else {
            process.env[key] = value;
        }
    }

    try {
        fn();
    } finally {
        for (const [key, value] of Object.entries(original)) {
            if (typeof value === 'undefined') {
                delete process.env[key];
            } else {
                process.env[key] = value;
            }
        }
    }
}

function mockRequest({
    origin,
    method = 'GET',
    path = '/api/ping',
    cookie,
    authorization,
    accessControlRequestMethod,
    accessControlRequestHeaders
} = {}) {
    const headers = {};

    if (origin !== undefined) headers.origin = origin;
    if (cookie) headers.cookie = cookie;
    if (authorization) headers.authorization = authorization;
    if (accessControlRequestMethod) headers['access-control-request-method'] = accessControlRequestMethod;
    if (accessControlRequestHeaders) headers['access-control-request-headers'] = accessControlRequestHeaders;

    return {
        method,
        originalUrl: path,
        headers,
        get(name) {
            return headers[String(name || '').toLowerCase()];
        }
    };
}

function runTest(name, fn) {
    try {
        fn();
        console.log(`PASS ${name}`);
    } catch (error) {
        console.error(`FAIL ${name}`);
        throw error;
    }
}

runTest('development mode allows arbitrary origins with credentials', () => {
    withEnv({ NODE_ENV: 'development' }, () => {
        const options = buildCorsOptions(mockRequest({ origin: 'https://evil.example' }));
        assert.strictEqual(options.origin, true);
        assert.strictEqual(options.credentials, true);
    });
});

runTest('production allows first-party origin with credentials', () => {
    withEnv({ NODE_ENV: 'production' }, () => {
        const options = buildCorsOptions(mockRequest({ origin: 'https://hoctapthuduc.onrender.com' }));
        assert.strictEqual(options.origin, true);
        assert.strictEqual(options.credentials, true);
    });
});

runTest('production allows requests without origin header', () => {
    withEnv({ NODE_ENV: 'production' }, () => {
        const options = buildCorsOptions(mockRequest());
        assert.strictEqual(options.origin, true);
        assert.strictEqual(options.credentials, true);
    });
});

runTest('null origin is allowed only for safe read requests without auth context', () => {
    const req = mockRequest({ origin: 'null', method: 'GET' });
    assert.strictEqual(isSafeNullOriginRequest(req), true);

    withEnv({ NODE_ENV: 'production' }, () => {
        const options = buildCorsOptions(req);
        assert.strictEqual(options.origin, true);
        assert.strictEqual(options.credentials, false);
    });
});

runTest('null origin is blocked when cookies are present', () => {
    const req = mockRequest({ origin: 'null', method: 'GET', cookie: 'connect.sid=test' });
    assert.strictEqual(isSafeNullOriginRequest(req), false);

    withEnv({ NODE_ENV: 'production' }, () => {
        const options = buildCorsOptions(req);
        assert.strictEqual(options.origin, false);
        assert.strictEqual(options.credentials, false);
    });
});

runTest('null origin preflight for unsafe method is blocked', () => {
    const req = mockRequest({
        origin: 'null',
        method: 'OPTIONS',
        accessControlRequestMethod: 'POST'
    });

    assert.strictEqual(isSafeNullOriginRequest(req), false);

    withEnv({ NODE_ENV: 'production' }, () => {
        const options = buildCorsOptions(req);
        assert.strictEqual(options.origin, false);
    });
});

runTest('null origin document navigation POST is allowed for standard HTML forms', () => {
    const req = mockRequest({
        origin: 'null',
        method: 'POST',
        path: '/login'
    });

    req.headers.accept = 'text/html,application/xhtml+xml';
    req.headers['content-type'] = 'application/x-www-form-urlencoded';
    req.headers['sec-fetch-mode'] = 'navigate';
    req.headers['sec-fetch-dest'] = 'document';

    assert.strictEqual(isNullOriginDocumentNavigation(req), true);

    withEnv({ NODE_ENV: 'production' }, () => {
        const options = buildCorsOptions(req);
        assert.strictEqual(options.origin, true);
        assert.strictEqual(options.credentials, true);
    });
});

runTest('null origin XHR-style POST stays blocked', () => {
    const req = mockRequest({
        origin: 'null',
        method: 'POST',
        path: '/api/auth/login'
    });

    req.headers.accept = 'application/json';
    req.headers['content-type'] = 'application/json';
    req.headers['sec-fetch-mode'] = 'cors';
    req.headers['sec-fetch-dest'] = 'empty';

    assert.strictEqual(isNullOriginDocumentNavigation(req), false);

    withEnv({ NODE_ENV: 'production' }, () => {
        const options = buildCorsOptions(req);
        assert.strictEqual(options.origin, false);
        assert.strictEqual(options.credentials, false);
    });
});

runTest('untrusted production origin is blocked without throwing server errors', () => {
    withEnv({ NODE_ENV: 'production' }, () => {
        const options = buildCorsOptions(mockRequest({ origin: 'https://evil.example' }));
        assert.strictEqual(options.origin, false);
        assert.strictEqual(options.credentials, false);
    });
});
