const mongoose = require("mongoose");

const LessonCompletionSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  lesson: { type: mongoose.Schema.Types.ObjectId, ref: "Lesson", required: true },
  completedAt: { type: Date, default: Date.now }
});

LessonCompletionSchema.index({ user: 1, lesson: 1 }, { unique: true });

LessonCompletionSchema.post("save", async function lessonCompletionPostSave(doc) {
  try {
    if (doc?.$locals?.skipAchievementCheck || !this.isNew) {
      return;
    }

    const { achievementChecker } = require("../utils/achievementUtils");
    if (!achievementChecker?.onLessonCompleted) {
      return;
    }

    setImmediate(async () => {
      try {
        await achievementChecker.onLessonCompleted(doc.user);
        console.log(`Achievement check triggered for user ${doc.user}`);
      } catch (err) {
        console.error("Achievement check error:", err.message);
      }
    });
  } catch (err) {
    console.error("LessonCompletion post-save hook error:", err);
  }
});

module.exports = mongoose.model("LessonCompletion", LessonCompletionSchema);
