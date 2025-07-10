const mongoose = require('mongoose');

const AchievementSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: { type: String },
  icon: { type: String }, // URL hoặc tên icon
  points: { type: Number, default: 0 },
  awardedAt: { type: Date, default: Date.now },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
});

module.exports = mongoose.model('Achievement', AchievementSchema);
