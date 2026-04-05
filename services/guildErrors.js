class GuildServiceError extends Error {
    constructor(message, status = 400) {
        super(message);
        this.name = 'GuildServiceError';
        this.status = status;
    }
}

module.exports = {
    GuildServiceError
};
