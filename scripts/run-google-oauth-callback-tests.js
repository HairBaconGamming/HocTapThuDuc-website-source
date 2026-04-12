const assert = require('assert');

const { classifyGoogleOAuthCallbackFailure } = require('../utils/googleOAuthCallback');

function runTest(name, fn) {
    try {
        fn();
        console.log(`PASS ${name}`);
    } catch (error) {
        console.error(`FAIL ${name}`);
        throw error;
    }
}

runTest('missing code is treated as a recoverable login failure', () => {
    const result = classifyGoogleOAuthCallbackFailure({ query: {} });
    assert.ok(result);
    assert.match(result.userMessage, /Thieu ma xac thuc/i);
});

runTest('provider access denial becomes a friendly message', () => {
    const result = classifyGoogleOAuthCallbackFailure({
        query: { error: 'access_denied' }
    });

    assert.ok(result);
    assert.match(result.userMessage, /huy dang nhap Google/i);
});

runTest('invalid_grant auth code errors are downgraded from server errors', () => {
    const result = classifyGoogleOAuthCallbackFailure({
        query: { code: 'bad-code' },
        err: { code: 'invalid_grant', message: 'TokenError: Malformed auth code.' }
    });

    assert.ok(result);
    assert.match(result.userMessage, /khong con hop le|het han/i);
});

runTest('unknown errors still bubble up to the global handler', () => {
    const result = classifyGoogleOAuthCallbackFailure({
        query: { code: 'some-code' },
        err: { code: 'server_error', message: 'Unexpected upstream failure' }
    });

    assert.strictEqual(result, null);
});
