function classifyGoogleOAuthCallbackFailure({ query = {}, err } = {}) {
    const providerError = String(query.error || '').trim().toLowerCase();
    const providerDescription = String(query.error_description || '').trim();
    const authCode = typeof query.code === 'string' ? query.code.trim() : '';
    const errorCode = String(err?.code || '').trim().toLowerCase();
    const errorName = String(err?.name || err?.constructor?.name || '').trim().toLowerCase();
    const errorMessage = String(err?.message || '').trim();
    const combinedErrorText = `${errorCode} ${errorName} ${errorMessage}`.toLowerCase();

    if (providerError === 'access_denied') {
        return {
            logLevel: 'warn',
            logMessage: 'Google OAuth was cancelled by the user.',
            userMessage: 'Ban da huy dang nhap Google.'
        };
    }

    if (providerError) {
        return {
            logLevel: 'warn',
            logMessage: `Google OAuth returned ${providerError}${providerDescription ? `: ${providerDescription}` : ''}.`,
            userMessage: 'Dang nhap Google khong hoan tat. Vui long thu lai.'
        };
    }

    if (!authCode) {
        return {
            logLevel: 'warn',
            logMessage: 'Google OAuth callback arrived without an auth code.',
            userMessage: 'Thieu ma xac thuc tu Google. Vui long thu dang nhap lai.'
        };
    }

    if (
        errorCode === 'invalid_grant' ||
        combinedErrorText.includes('malformed auth code') ||
        combinedErrorText.includes('invalid_grant') ||
        combinedErrorText.includes('invalid authorization code')
    ) {
        return {
            logLevel: 'warn',
            logMessage: `Google OAuth rejected the auth code${errorMessage ? `: ${errorMessage}` : '.'}`,
            userMessage: 'Ma dang nhap Google khong con hop le hoac da het han. Vui long thu lai.'
        };
    }

    return null;
}

module.exports = {
    classifyGoogleOAuthCallbackFailure
};
