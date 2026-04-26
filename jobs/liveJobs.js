const cron = require("node-cron");
const mongoose = require("mongoose");
const { dispatchScheduledLiveReminders } = require("../services/liveService");

let jobsStarted = false;

async function safeRun(taskName, fn) {
  try {
    if (mongoose.connection.readyState !== 1) return;
    await fn();
  } catch (error) {
    console.error(`[LiveJobs] ${taskName} failed:`, error.message);
  }
}

function startLiveJobs() {
  if (jobsStarted) return;
  jobsStarted = true;

  cron.schedule(
    "*/5 * * * *",
    () => {
      safeRun("dispatch-reminders", () => dispatchScheduledLiveReminders());
    },
    { timezone: process.env.APP_TIMEZONE || "Asia/Bangkok" }
  );
}

module.exports = {
  startLiveJobs,
};
