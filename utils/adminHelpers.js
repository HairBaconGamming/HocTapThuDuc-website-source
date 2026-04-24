const mongoose = require('mongoose');

const OWNER_USERNAME = 'truonghoangnam';
const DEFAULT_PAGE_SIZE = 12;

function escapeRegex(value = '') {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parsePositiveInt(value, fallback = 1, { min = 1, max = 100 } = {}) {
    const parsed = Number.parseInt(value, 10);
    if (Number.isNaN(parsed)) return fallback;
    return Math.min(max, Math.max(min, parsed));
}

function parseNullableBoolean(value) {
    if (value === true || value === false) return value;
    if (value === undefined || value === null || value === '') return null;

    const normalized = String(value).trim().toLowerCase();
    if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
    if (['false', '0', 'no', 'off'].includes(normalized)) return false;
    return null;
}

function parseSort(value, allowed = [], fallback = '') {
    if (!value) return fallback;
    return allowed.includes(value) ? value : fallback;
}

function parseDateInput(value, { endOfDay = false } = {}) {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    if (endOfDay) {
        date.setHours(23, 59, 59, 999);
    } else {
        date.setHours(0, 0, 0, 0);
    }
    return date;
}

function buildDateRange(dateFrom, dateTo) {
    const start = parseDateInput(dateFrom);
    const end = parseDateInput(dateTo, { endOfDay: true });
    return { start, end };
}

function safeAdminReturnTo(value, fallback = '/admin/overview') {
    if (typeof value !== 'string') return fallback;
    const trimmed = value.trim();
    if (!trimmed.startsWith('/admin')) return fallback;
    return trimmed;
}

function getReturnTo(req, fallback = '/admin/overview') {
    return safeAdminReturnTo(req.body?.returnTo || req.query?.returnTo, fallback);
}

function buildQueryString(query = {}, overrides = {}) {
    const params = new URLSearchParams();
    const merged = { ...query, ...overrides };

    Object.entries(merged).forEach(([key, value]) => {
        if (value === undefined || value === null || value === '') return;
        params.set(key, String(value));
    });

    const queryString = params.toString();
    return queryString ? `?${queryString}` : '';
}

function buildAdminUrl(pathname, query = {}, overrides = {}) {
    return `${pathname}${buildQueryString(query, overrides)}`;
}

function toObjectId(value) {
    if (!mongoose.Types.ObjectId.isValid(value)) return null;
    return new mongoose.Types.ObjectId(value);
}

function buildPagination(page, totalItems, pageSize = DEFAULT_PAGE_SIZE) {
    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
    const safePage = Math.min(totalPages, Math.max(1, page));
    return {
        page: safePage,
        totalItems,
        pageSize,
        totalPages,
        hasPrev: safePage > 1,
        hasNext: safePage < totalPages,
        skip: (safePage - 1) * pageSize
    };
}

function parseListQuery(rawQuery = {}, options = {}) {
    const {
        allowedSorts = [],
        defaultSort = 'newest',
        defaultPageSize = DEFAULT_PAGE_SIZE
    } = options;

    return {
        q: String(rawQuery.q || '').trim(),
        status: String(rawQuery.status || '').trim(),
        sort: parseSort(String(rawQuery.sort || '').trim(), allowedSorts, defaultSort),
        page: parsePositiveInt(rawQuery.page, 1),
        pageSize: parsePositiveInt(rawQuery.pageSize, defaultPageSize, { min: 5, max: 50 }),
        subjectId: String(rawQuery.subjectId || '').trim(),
        authorId: String(rawQuery.authorId || '').trim(),
        dateFrom: String(rawQuery.dateFrom || '').trim(),
        dateTo: String(rawQuery.dateTo || '').trim()
    };
}

module.exports = {
    OWNER_USERNAME,
    DEFAULT_PAGE_SIZE,
    escapeRegex,
    parsePositiveInt,
    parseNullableBoolean,
    parseSort,
    parseDateInput,
    buildDateRange,
    safeAdminReturnTo,
    getReturnTo,
    buildQueryString,
    buildAdminUrl,
    toObjectId,
    buildPagination,
    parseListQuery
};
