const cron = require("node-cron");
const mongoose = require("mongoose");
const { dispatchScheduledLiveReminders, refreshAllActiveSessions } = require("../services/liveService");

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

  // Cập nhật viewers mỗi 5 giây cho toàn bộ phòng live đang phát
  setInterval(() => {
    safeRun("refresh-viewers", () => refreshAllActiveSessions());
  }, 5000);
}

module.exports = {
  startLiveJobs,
};
