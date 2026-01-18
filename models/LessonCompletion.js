const mongoose = require("mongoose");

const LessonCompletionSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  lesson: { type: mongoose.Schema.Types.ObjectId, ref: "Lesson", required: true },
  completedAt: { type: Date, default: Date.now }
});

// Đảm bảo mỗi user chỉ có một bản ghi hoàn thành cho mỗi lesson
LessonCompletionSchema.index({ user: 1, lesson: 1 }, { unique: true });

// Post-save hook: Trigger achievement check khi lesson hoàn thành
LessonCompletionSchema.post('save', async function(doc) {
  try {
    // Chỉ trigger nếu đây là bản ghi mới (isNew)
    if (this.isNew) {
      const { achievementChecker } = require('../utils/achievementUtils');
      if (achievementChecker && achievementChecker.onLessonCompleted) {
        // Fire-and-forget để không chặn response
        setImmediate(async () => {
          try {
            await achievementChecker.onLessonCompleted(doc.user);
            console.log(`✅ Achievement check triggered for user ${doc.user}`);
          } catch (err) {
            console.error('Achievement check error:', err.message);
          }
        });
      }
    }
  } catch (err) {
    console.error('LessonCompletion post-save hook error:', err);
  }
});

module.exports = mongoose.model("LessonCompletion", LessonCompletionSchema);
