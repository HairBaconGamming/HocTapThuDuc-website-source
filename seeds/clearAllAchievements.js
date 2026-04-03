require("dotenv").config();

const mongoose = require("mongoose");
const { UserAchievement } = require("../models/Achievement");

async function clearAllAchievements() {
  try {
    await mongoose.connect(process.env.MONGO_URI || "mongodb://localhost:27017/studypro");

    const deleteResult = await UserAchievement.deleteMany({});
    console.log(`Deleted ${deleteResult.deletedCount} unlocked achievement records.`);
    process.exit(0);
  } catch (err) {
    console.error("Clear achievements failed:", err);
    process.exit(1);
  }
}

clearAllAchievements();
