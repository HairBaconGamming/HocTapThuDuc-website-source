const Achievement = require('../models/Achievement');
const Lesson = require('../models/Lesson');
const LessonCompletion = require('../models/LessonCompletion');
const stringSimilarity = require("string-similarity");

// Dictionary chứa URL badge cho từng mốc bài học đã hoàn thành
const badgeUrls = {
  10: "https://cdn.glitch.global/71030012-56ea-4d26-a426-e0099201df1c/Rules!.png?v=1743349969433",
  50: "https://cdn.glitch.global/71030012-56ea-4d26-a426-e0099201df1c/Rules!%20(1).png?v=1743516307951",
  100: "https://cdn.glitch.global/71030012-56ea-4d26-a426-e0099201df1c/Rules!%20(2).png?v=1743516407488"
};

// Badge cho người tạo bài học
const contributionBadgeUrl = "https://cdn.glitch.global/71030012-56ea-4d26-a426-e0099201df1c/Rules!%20(3).png?v=1743599907853"; 

async function checkAndAwardAchievements(user, io) {
  // Tính số lượng bài học mà người dùng đã hoàn thành
  const lessonCompletedCount = await LessonCompletion.countDocuments({ user: user._id });
  console.log(user.username + " completedLessonCount: " + lessonCompletedCount);

  // Mốc thành tích cho bài học đã hoàn thành
  const lessonMilestones = [10, 50, 100];
  for (const milestone of lessonMilestones) {
    if (lessonCompletedCount >= milestone) {
      // Kiểm tra xem thành tích đã được ghi nhận chưa
      const exists = await Achievement.findOne({ 
        user: user._id, 
        name: `Người chăm học ${milestone} bài.` 
      });

      if (!exists) {
        const achievement = new Achievement({
          user: user._id,
          name: `Người chăm học ${milestone} bài.`,
          description: `Hoàn thành ${milestone} bài học.`,
          icon: badgeUrls[milestone] || "/images/badges/default.png",
          points: milestone*10
        });

        await achievement.save();
        user.points += achievement.points;
        await user.save();

        // Gửi thông báo real-time qua Socket.IO
        io.to(user._id.toString()).emit("newAchievement", achievement);
      }
    }
  }

  // ➤ Kiểm tra số bài học do người dùng tạo
  const lessonsCreatedCount = await Lesson.countDocuments({ createdBy: user });
  console.log(user.username + " lessonsCreatedCount: " + lessonsCreatedCount);

  // Nếu người dùng đã tạo ít nhất 10 bài học, cấp thành tích "Cống hiến 10 bài học"
  if (lessonsCreatedCount >= 10) {
    const contributionExists = await Achievement.findOne({ 
      user: user._id, 
      name: "Cống hiến 10 bài học" 
    });

    if (!contributionExists) {
      const contributionAchievement = new Achievement({
        user: user._id,
        name: "Cống hiến 10 bài học",
        description: "Tạo ra 10 bài học trên hệ thống.",
        icon: contributionBadgeUrl, 
        points: 150 // Tặng thêm 150 điểm khi đạt
      });

      await contributionAchievement.save();
      user.points += contributionAchievement.points;
      await user.save();

      // Gửi thông báo real-time qua Socket.IO
      io.to(user._id.toString()).emit("newAchievement", contributionAchievement);
    }
  }
}

module.exports = { checkAndAwardAchievements };
