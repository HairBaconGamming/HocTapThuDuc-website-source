require("dotenv").config();

const mongoose = require("mongoose");
const { AchievementType } = require("../models/Achievement");
const { ACHIEVEMENT_DEFINITIONS } = require("../config/achievementDefinitions");

const gardenAchievements = ACHIEVEMENT_DEFINITIONS.filter((achievement) =>
  [
    "plants_planted",
    "plants_harvested",
    "plants_watered",
    "decorations_placed",
    "gold_collected",
    "plant_survival_streak"
  ].includes(achievement.condition.type)
);

async function seedGardenAchievements() {
  try {
    await mongoose.connect(process.env.MONGO_URI || "mongodb://localhost:27017/studypro");

    for (const achievement of gardenAchievements) {
      await AchievementType.findOneAndUpdate(
        { id: achievement.id },
        { $set: achievement },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
    }

    console.log(`Synced ${gardenAchievements.length} garden achievements.`);
    process.exit(0);
  } catch (err) {
    console.error("Seed garden achievements failed:", err);
    process.exit(1);
  }
}

seedGardenAchievements();
