const cron = require('node-cron');
const mongoose = require('mongoose');
const { runGuildAutoModerationSweep } = require('../services/guildGovernanceService');
const { refreshStandingRanks } = require('../services/guildCompetitionService');
const { getCurrentMonthKey, getCurrentWeekKey } = require('../utils/guildPeriodUtils');

let jobsStarted = false;

async function safeRun(taskName, fn) {
    try {
        if (mongoose.connection.readyState !== 1) return;
        await fn();
    } catch (error) {
        console.error(`[GuildJobs] ${taskName} failed:`, error.message);
    }
}

function startGuildJobs() {
    if (jobsStarted) return;
    jobsStarted = true;

    cron.schedule('0 3 * * *', () => {
        safeRun('auto-moderation', () => runGuildAutoModerationSweep());
    }, { timezone: process.env.APP_TIMEZONE || 'Asia/Bangkok' });

    cron.schedule('15 * * * *', () => {
        safeRun('standing-refresh', async () => {
            await refreshStandingRanks('weekly', getCurrentWeekKey());
            await refreshStandingRanks('monthly', getCurrentMonthKey());
        });
    }, { timezone: process.env.APP_TIMEZONE || 'Asia/Bangkok' });
}

module.exports = {
    startGuildJobs
};
