const { AchievementType, UserAchievement } = require('../models/Achievement');
const User = require('../models/User');
const LessonCompletion = require('../models/LessonCompletion');
const stringSimilarity = require("string-similarity");

// Evaluate condition để kiểm tra xem achievement có unlock không
function evaluateCondition(condition, data) {
  if (!condition || !condition.type) return false;

  const value = data?.currentValue || 0;

  switch (condition.operator) {
    case '>=':
      return value >= condition.value;
    case '>':
      return value > condition.value;
    case '==':
      return value === condition.value;
    case '<=':
      return value <= condition.value;
    case '<':
      return value < condition.value;
    default:
      return false;
  }
}

// Kiểm tra và unlock achievements cho user
async function checkAndUnlockAchievements(userId, triggerType, data = {}) {
  try {
    const user = await User.findById(userId);
    if (!user) return [];

    // Xử lý custom trigger types (login, community_join, etc)
    let query = { isActive: true };
    
    if (triggerType === 'custom') {
      // Cho custom triggers, tìm achievements có id phù hợp
      if (data.triggerType === 'login') {
        // Tìm achievements liên quan đến login hoặc community join
        query = {
          isActive: true,
          'condition.type': 'custom',
          id: { $in: ['first_login', 'community_join'] }
        };
      }
    } else {
      // Lấy tất cả achievements cùng điều kiện
      query['condition.type'] = triggerType;
    }

    const achievements = await AchievementType.find(query);

    const unlockedAchievements = [];

    for (const achievement of achievements) {
      // Kiểm tra xem user đã có achievement này chưa
      const userAchievement = await UserAchievement.findOne({
        user: userId,
        achievementId: achievement._id
      });

      if (userAchievement) continue; // Đã unlock rồi

      // Kiểm tra điều kiện
      let isConditionMet = false;
      
      if (triggerType === 'custom' && data.triggerType === 'login') {
        // Cho login achievements, luôn unlock (nếu chưa unlock)
        isConditionMet = true;
      } else {
        isConditionMet = evaluateCondition(achievement.condition, data);
      }

      if (isConditionMet) {
        // Unlock achievement
        const newAchievement = await UserAchievement.create({
          user: userId,
          achievementId: achievement._id,
          achievementData: {
            name: achievement.name,
            description: achievement.description,
            icon: achievement.icon,
            points: achievement.points,
            rarity: achievement.rarity,
            category: achievement.category
          },
          unlockedAt: new Date()
        });

        // Cộng điểm cho user
        user.totalPoints = (user.totalPoints || 0) + achievement.points;
        await user.save();

        unlockedAchievements.push({
          _id: achievement._id,
          name: achievement.name,
          description: achievement.description,
          icon: achievement.icon,
          points: achievement.points,
          rarity: achievement.rarity,
          category: achievement.category,
          unlockMessage: achievement.unlockMessage
        });
      }
    }

    return unlockedAchievements;
  } catch (err) {
    console.error('Error in checkAndUnlockAchievements:', err);
    return [];
  }
}

// Trigger khi hoàn thành bài học
async function onLessonCompleted(userId) {
  try {
    const lessonCount = await LessonCompletion.countDocuments({ user: userId });
    return await checkAndUnlockAchievements(userId, 'lessons_completed', { currentValue: lessonCount });
  } catch (err) {
    console.error('Error in onLessonCompleted:', err);
    return [];
  }
}

// Trigger khi nhận điểm
async function onPointsGained(userId) {
  try {
    const user = await User.findById(userId);
    if (!user) return [];
    return await checkAndUnlockAchievements(userId, 'points_reached', { currentValue: user.totalPoints || 0 });
  } catch (err) {
    console.error('Error in onPointsGained:', err);
    return [];
  }
}

// Trigger kiểm tra hàng ngày (streak, login)
async function onDailyCheck(userId) {
  try {
    const user = await User.findById(userId);
    if (!user) return [];
    return await checkAndUnlockAchievements(userId, 'streak_days', { currentValue: user.currentStreak || 0 });
  } catch (err) {
    console.error('Error in onDailyCheck:', err);
    return [];
  }
}

// Lấy tất cả achievements của user
async function getUserAchievements(userId) {
  try {
    return await UserAchievement.find({ user: userId })
      .populate('achievementId')
      .sort({ unlockedAt: -1 })
      .lean();
  } catch (err) {
    console.error('Error in getUserAchievements:', err);
    return [];
  }
}

// Lấy progress của achievements chưa unlock
async function getAchievementProgress(userId) {
  try {
    const user = await User.findById(userId);
    if (!user) return {};

    // Lấy tất cả achievements đã unlock
    const unlockedIds = new Set(
      (await UserAchievement.find({ user: userId }).select('achievementId').lean())
        .map(a => a.achievementId.toString())
    );

    // Lấy achievements chưa unlock
    const lockedAchievements = await AchievementType.find({
      isActive: true,
      _id: { $nin: Array.from(unlockedIds) }
    }).lean();

    const progress = {};
    for (const achievement of lockedAchievements) {
      let percent = 0;

      if (achievement.condition?.type === 'lessons_completed') {
        const completedCount = await LessonCompletion.countDocuments({ user: userId });
        percent = Math.min((completedCount / achievement.condition.value) * 100, 99);
      } else if (achievement.condition?.type === 'points_reached') {
        percent = Math.min(((user.totalPoints || 0) / achievement.condition.value) * 100, 99);
      } else if (achievement.condition?.type === 'streak_days') {
        percent = Math.min(((user.currentStreak || 0) / achievement.condition.value) * 100, 99);
      }

      progress[achievement._id.toString()] = Math.round(percent);
    }

    return progress;
  } catch (err) {
    console.error('Error in getAchievementProgress:', err);
    return {};
  }
}

// Lấy stats achievements
async function getAchievementStats(userId) {
  try {
    const totalAchievements = await AchievementType.countDocuments({ isActive: true });
    const unlockedCount = await UserAchievement.countDocuments({ user: userId });
    const lockedCount = totalAchievements - unlockedCount;

    // Tính total points từ achievements
    const pointsData = await UserAchievement.aggregate([
      { $match: { user: require('mongoose').Types.ObjectId(userId) } },
      { $lookup: { from: 'achievementtypes', localField: 'achievementId', foreignField: '_id', as: 'achievement' } },
      { $unwind: '$achievement' },
      { $group: { _id: null, totalPoints: { $sum: '$achievement.points' } } }
    ]);

    const totalPoints = pointsData[0]?.totalPoints || 0;

    return {
      total: totalAchievements,
      unlocked: unlockedCount,
      locked: lockedCount,
      completion: totalAchievements > 0 ? Math.round((unlockedCount / totalAchievements) * 100) : 0,
      points: totalPoints
    };
  } catch (err) {
    console.error('Error in getAchievementStats:', err);
    return { total: 0, unlocked: 0, locked: 0, completion: 0, points: 0 };
  }
}

// Legacy: Dictionary chứa URL badge cho từng mốc bài học đã hoàn thành
const badgeUrls = {
  10: "https://cdn.glitch.global/71030012-56ea-4d26-a426-e0099201df1c/Rules!.png?v=1743349969433",
  50: "https://cdn.glitch.global/71030012-56ea-4d26-a426-e0099201df1c/Rules!%20(1).png?v=1743516307951",
  100: "https://cdn.glitch.global/71030012-56ea-4d26-a426-e0099201df1c/Rules!%20(2).png?v=1743516407488"
};

// Badge cho người tạo bài học
const contributionBadgeUrl = "https://cdn.glitch.global/71030012-56ea-4d26-a426-e0099201df1c/Rules!%20(3).png?v=1743599907853"; 

// Legacy: Check and award achievements
async function checkAndAwardAchievements(user, io) {
  // Tính số lượng bài học mà người dùng đã hoàn thành
  const lessonCompletedCount = await LessonCompletion.countDocuments({ user: user._id });
  console.log(user.username + " completedLessonCount: " + lessonCompletedCount);

  // Mốc thành tích cho bài học đã hoàn thành
  const lessonMilestones = [10, 50, 100];
  for (const milestone of lessonMilestones) {
    if (lessonCompletedCount >= milestone) {
      console.log(`${user.username} qualifies for ${milestone} lessons achievement`);
    }
  }

}

// Trigger khi trồng cây
async function onPlantPlanted(userId) {
  try {
    const Garden = require('../models/Garden');
    const garden = await Garden.findOne({ user: userId });
    if (!garden) return [];
    
    // Đếm số cây (item type = 'plant')
    const plantCount = (garden.items || []).filter(item => item.type === 'plant' && !item.isDead).length;
    return await checkAndUnlockAchievements(userId, 'plants_planted', { currentValue: plantCount });
  } catch (err) {
    console.error('Error in onPlantPlanted:', err);
    return [];
  }
}

// Trigger khi thu hoạch
async function onPlantHarvested(userId, goldEarned = 0) {
  try {
    const Garden = require('../models/Garden');
    const garden = await Garden.findOne({ user: userId });
    if (!garden) return [];
    
    // Đếm tổng số lần thu hoạch từ history (nếu có) hoặc từ garden.harvestCount
    // Tạm thời dùng harvestCount nếu tồn tại
    const harvestCount = garden.harvestCount || 0;
    
    // Cộng tổng vàng đã thu hoạch
    const totalGoldCollected = (garden.totalGoldCollected || 0) + goldEarned;
    
    const results = [];
    results.push(...await checkAndUnlockAchievements(userId, 'plants_harvested', { currentValue: harvestCount + 1 }));
    results.push(...await checkAndUnlockAchievements(userId, 'gold_collected', { currentValue: totalGoldCollected }));
    
    return results;
  } catch (err) {
    console.error('Error in onPlantHarvested:', err);
    return [];
  }
}

// Trigger khi tưới cây
async function onPlantWatered(userId) {
  try {
    const Garden = require('../models/Garden');
    const garden = await Garden.findOne({ user: userId });
    if (!garden) return [];
    
    // Đếm số lần tưới cây
    const waterCount = garden.waterCount || 0;
    return await checkAndUnlockAchievements(userId, 'plants_watered', { currentValue: waterCount + 1 });
  } catch (err) {
    console.error('Error in onPlantWatered:', err);
    return [];
  }
}

// Trigger khi đặt trang trí
async function onDecorationPlaced(userId) {
  try {
    const Garden = require('../models/Garden');
    const garden = await Garden.findOne({ user: userId });
    if (!garden) return [];
    
    // Đếm số trang trí (item type = 'decoration')
    const decorationCount = (garden.items || []).filter(item => item.type === 'decoration').length;
    return await checkAndUnlockAchievements(userId, 'decorations_placed', { currentValue: decorationCount });
  } catch (err) {
    console.error('Error in onDecorationPlaced:', err);
    return [];
  }
}

// Trigger kiểm tra plant survival streak hàng ngày
async function onDailyGardenCheck(userId) {
  try {
    const Garden = require('../models/Garden');
    const garden = await Garden.findOne({ user: userId });
    if (!garden) return [];
    
    // Lấy plant survival streak từ garden
    const survivalStreak = garden.plantSurvivalStreak || 0;
    return await checkAndUnlockAchievements(userId, 'plant_survival_streak', { currentValue: survivalStreak });
  } catch (err) {
    console.error('Error in onDailyGardenCheck:', err);
    return [];
  }
}

// Export new achievement system functions
const achievementChecker = {
  checkAndUnlockAchievements,
  onLessonCompleted,
  onPointsGained,
  onDailyCheck,
  onPlantPlanted,
  onPlantHarvested,
  onPlantWatered,
  onDecorationPlaced,
  onDailyGardenCheck,
  getUserAchievements,
  getAchievementProgress,
  getAchievementStats,
  evaluateCondition
};

module.exports = { 
  checkAndAwardAchievements,
  achievementChecker
};
