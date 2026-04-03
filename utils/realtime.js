let ioInstance = null;

function setIo(io) {
  ioInstance = io;
}

function getIo() {
  return ioInstance;
}

function emitAchievementUnlocked(userId, achievement) {
  if (!ioInstance || !userId || !achievement) {
    return;
  }

  ioInstance.to(`user:${userId.toString()}`).emit("newAchievement", achievement);
}

module.exports = {
  setIo,
  getIo,
  emitAchievementUnlocked
};
