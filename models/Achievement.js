const mongoose = require('mongoose');

// Achievement Type Definition - Định nghĩa template
const AchievementTypeSchema = new mongoose.Schema({
  id: { type: String, unique: true, required: true }, // VD: 'first_lesson', 'lesson_100'
  name: { type: String, required: true },
  description: { type: String },
  icon: { type: String }, // URL hoặc emoji
  color: { type: String, default: '#4f46e5' }, // Hex color
  category: { 
    type: String, 
    enum: ['learning', 'engagement', 'challenge', 'social', 'milestone'],
    default: 'learning'
  },
  points: { type: Number, default: 0 },
  rarity: { 
    type: String, 
    enum: ['common', 'rare', 'epic', 'legendary'],
    default: 'common'
  },
  condition: {
    type: { 
      type: String, 
      enum: ['lessons_completed', 'points_reached', 'streak_days', 'courses_enrolled', 'custom', 'plants_planted', 'plants_harvested', 'plants_watered', 'decorations_placed', 'gold_collected', 'plant_survival_streak'],
      required: true 
    },
    value: { type: Number }, // VD: 10 bài học, 100 điểm
    operator: { type: String, enum: ['>=', '==', '>', '<='], default: '>=' } // Điều kiện so sánh
  },
  unlockMessage: { type: String }, // Message khi unlock
  isHidden: { type: Boolean, default: false }, // Ẩn cho tới khi unlock
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

// User Achievement - Ghi lại achievement mà user đã unlock
const UserAchievementSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  achievementId: { type: String, required: true }, // Reference đến AchievementType.id
  achievementData: { // Snapshot của achievement tại thời điểm unlock
    name: String,
    description: String,
    icon: String,
    points: Number,
    rarity: String
  },
  unlockedAt: { type: Date, default: Date.now },
  notified: { type: Boolean, default: false }
}, { timestamps: true });

// Tạo index
UserAchievementSchema.index({ user: 1, achievementId: 1 }, { unique: true });

module.exports = {
  AchievementType: mongoose.model('AchievementType', AchievementTypeSchema),
  UserAchievement: mongoose.model('UserAchievement', UserAchievementSchema)
};
