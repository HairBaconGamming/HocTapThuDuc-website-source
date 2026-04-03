require("dotenv").config();

const mongoose = require("mongoose");
const { AchievementType } = require("../models/Achievement");
const { ACHIEVEMENT_DEFINITIONS } = require("../config/achievementDefinitions");

async function syncAchievements() {
  const uri = process.env.MONGO_URI || "mongodb://localhost:27017/studypro";
  await mongoose.connect(uri);

  const activeIds = ACHIEVEMENT_DEFINITIONS.map((achievement) => achievement.id);

  for (const achievement of ACHIEVEMENT_DEFINITIONS) {
    await AchievementType.findOneAndUpdate(
      { id: achievement.id },
      { $set: achievement },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  }

  await AchievementType.updateMany(
    { id: { $nin: activeIds } },
    { $set: { isActive: false } }
  );

  console.log(`Synced ${ACHIEVEMENT_DEFINITIONS.length} achievements.`);
  await mongoose.disconnect();
}

syncAchievements().catch(async (err) => {
  console.error("Achievement sync failed:", err);
  try {
    await mongoose.disconnect();
  } catch (disconnectError) {
    console.error("Disconnect failed:", disconnectError);
  }
  process.exit(1);
});
