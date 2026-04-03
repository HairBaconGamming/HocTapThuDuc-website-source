const mongoose = require("mongoose");

const CONDITION_TYPES = [
  "lessons_completed",
  "points_reached",
  "streak_days",
  "courses_enrolled",
  "custom",
  "plants_planted",
  "plants_harvested",
  "plants_watered",
  "decorations_placed",
  "gold_collected",
  "plant_survival_streak",
  "level_reached"
];

const AchievementTypeSchema = new mongoose.Schema(
  {
    id: { type: String, unique: true, required: true },
    name: { type: String, required: true },
    description: { type: String, default: "" },
    icon: { type: String, default: "🏆" },
    color: { type: String, default: "#4f46e5" },
    category: {
      type: String,
      enum: ["learning", "engagement", "challenge", "social", "milestone"],
      default: "learning"
    },
    points: { type: Number, default: 0 },
    rarity: {
      type: String,
      enum: ["common", "rare", "epic", "legendary"],
      default: "common"
    },
    condition: {
      type: {
        type: String,
        enum: CONDITION_TYPES,
        required: true
      },
      value: { type: Number, default: 1 },
      operator: {
        type: String,
        enum: [">=", "==", ">", "<=", "<"],
        default: ">="
      }
    },
    unlockMessage: { type: String, default: "" },
    isHidden: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true }
  },
  { timestamps: true }
);

const AchievementSnapshotSchema = new mongoose.Schema(
  {
    id: String,
    name: String,
    description: String,
    icon: String,
    color: String,
    points: Number,
    rarity: String,
    category: String,
    unlockMessage: String
  },
  { _id: false }
);

const UserAchievementSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    achievementId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AchievementType",
      required: true
    },
    achievementData: { type: AchievementSnapshotSchema, default: {} },
    unlockedAt: { type: Date, default: Date.now },
    notified: { type: Boolean, default: false }
  },
  { timestamps: true }
);

UserAchievementSchema.index({ user: 1, achievementId: 1 }, { unique: true });

module.exports = {
  CONDITION_TYPES,
  AchievementType: mongoose.model("AchievementType", AchievementTypeSchema),
  UserAchievement: mongoose.model("UserAchievement", UserAchievementSchema)
};
