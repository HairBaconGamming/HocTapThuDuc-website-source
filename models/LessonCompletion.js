const mongoose = require("mongoose");

const LessonCompletionSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  lesson: { type: mongoose.Schema.Types.ObjectId, ref: "Lesson", required: true },
  completedAt: { type: Date, default: Date.now }
});

// Đảm bảo mỗi user chỉ có một bản ghi hoàn thành cho mỗi lesson
LessonCompletionSchema.index({ user: 1, lesson: 1 }, { unique: true });

module.exports = mongoose.model("LessonCompletion", LessonCompletionSchema);
