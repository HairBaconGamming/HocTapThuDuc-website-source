const moment = require('moment-timezone');

const DEFAULT_TZ = process.env.APP_TIMEZONE || 'Asia/Bangkok';

function getMomentInTz(date = new Date()) {
    return moment(date).tz(DEFAULT_TZ);
}

function getCurrentWeekKey(date = new Date()) {
    return getMomentInTz(date).format('GGGG-[W]WW');
}

function getCurrentMonthKey(date = new Date()) {
    return getMomentInTz(date).format('YYYY-MM');
}

function getWeekRange(date = new Date()) {
    const start = getMomentInTz(date).startOf('isoWeek');
    const end = getMomentInTz(date).endOf('isoWeek');
    return {
        start: start.toDate(),
        end: end.toDate()
    };
}

function getMonthRange(date = new Date()) {
    const start = getMomentInTz(date).startOf('month');
    const end = getMomentInTz(date).endOf('month');
    return {
        start: start.toDate(),
        end: end.toDate()
    };
}

function getDateDaysAgo(days) {
    return getMomentInTz().subtract(Math.max(0, Number(days || 0)), 'days').toDate();
}

module.exports = {
    DEFAULT_TZ,
    getCurrentWeekKey,
    getCurrentMonthKey,
    getWeekRange,
    getMonthRange,
    getDateDaysAgo
};
