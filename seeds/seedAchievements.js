require("dotenv").config();

const mongoose = require("mongoose");
const { AchievementType } = require("../models/Achievement");
const { ACHIEVEMENT_DEFINITIONS } = require("../config/achievementDefinitions");

async function seedAchievements() {
  try {
    await mongoose.connect(process.env.MONGO_URI || "mongodb://localhost:27017/studypro");

    await AchievementType.deleteMany({});
    await AchievementType.insertMany(ACHIEVEMENT_DEFINITIONS);

    console.log(`Seeded ${ACHIEVEMENT_DEFINITIONS.length} achievements.`);
    process.exit(0);
  } catch (err) {
    console.error("Seed achievements failed:", err);
    process.exit(1);
  }
}

seedAchievements();
