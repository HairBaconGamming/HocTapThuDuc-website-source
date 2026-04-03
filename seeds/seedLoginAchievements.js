require("dotenv").config();

const mongoose = require("mongoose");
const { AchievementType } = require("../models/Achievement");
const { ACHIEVEMENT_DEFINITIONS } = require("../config/achievementDefinitions");

const loginAchievements = ACHIEVEMENT_DEFINITIONS.filter((achievement) =>
  ["community_join", "first_login"].includes(achievement.id)
);

async function seedLoginAchievements() {
  try {
    await mongoose.connect(process.env.MONGO_URI || "mongodb://localhost:27017/studypro");

    for (const achievement of loginAchievements) {
      await AchievementType.findOneAndUpdate(
        { id: achievement.id },
        { $set: achievement },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
    }

    console.log(`Synced ${loginAchievements.length} login achievements.`);
    process.exit(0);
  } catch (err) {
    console.error("Seed login achievements failed:", err);
    process.exit(1);
  }
}

seedLoginAchievements();
