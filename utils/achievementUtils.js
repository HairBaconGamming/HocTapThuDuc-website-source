const mongoose = require("mongoose");
const { AchievementType, UserAchievement } = require("../models/Achievement");
const User = require("../models/User");
const Lesson = require("../models/Lesson");
const LessonCompletion = require("../models/LessonCompletion");
const Garden = require("../models/Garden");
const { emitAchievementUnlocked } = require("./realtime");

const RARITY_ORDER = {
  common: 1,
  rare: 2,
  epic: 3,
  legendary: 4
};

const CUSTOM_TRIGGER_MAP = {
  login: ["first_login"],
  register: ["community_join"]
};

const HIDDEN_ACHIEVEMENT_PLACEHOLDER = {
  name: "Thanh tich bi an",
  description: "Mo khoa de kham pha thanh tich nay.",
  icon: "❓"
};

function toObjectId(value) {
  if (value instanceof mongoose.Types.ObjectId) {
    return value;
  }

  if (value && typeof value === "object" && value._id) {
    return toObjectId(value._id);
  }

  return new mongoose.Types.ObjectId(value);
}

function toIdString(value) {
  if (!value) {
    return "";
  }

  if (typeof value === "string") {
    return value;
  }

  if (value instanceof mongoose.Types.ObjectId) {
    return value.toString();
  }

  if (value._id) {
    return toIdString(value._id);
  }

  return String(value);
}

function compareWithOperator(currentValue, targetValue, operator = ">=") {
  switch (operator) {
    case ">=":
      return currentValue >= targetValue;
    case ">":
      return currentValue > targetValue;
    case "==":
      return currentValue === targetValue;
    case "<=":
      return currentValue <= targetValue;
    case "<":
      return currentValue < targetValue;
    default:
      return false;
  }
}

function resolveCustomTriggerIds(triggerKey) {
  return CUSTOM_TRIGGER_MAP[triggerKey] || [];
}

function normalizeAchievementDetail(source) {
  if (!source) {
    return {};
  }

  const achievementId = source.achievementId && typeof source.achievementId === "object"
    ? source.achievementId
    : null;
  const achievementData = source.achievementData || {};

  return {
    _id: source._id ? toIdString(source._id) : achievementId?._id ? toIdString(achievementId._id) : null,
    id: source.id || achievementId?.id || achievementData.id || null,
    name: source.name || achievementId?.name || achievementData.name || "Thanh tich",
    description: source.description || achievementId?.description || achievementData.description || "",
    icon: source.icon || achievementId?.icon || achievementData.icon || "🏆",
    color: source.color || achievementId?.color || achievementData.color || "#4f46e5",
    points: Number(source.points ?? achievementId?.points ?? achievementData.points ?? 0),
    rarity: source.rarity || achievementId?.rarity || achievementData.rarity || "common",
    category: source.category || achievementId?.category || achievementData.category || "learning",
    unlockMessage: source.unlockMessage || achievementId?.unlockMessage || achievementData.unlockMessage || "",
    isHidden: Boolean(source.isHidden ?? achievementId?.isHidden),
    condition: source.condition || achievementId?.condition || null
  };
}

function createAchievementSnapshot(achievement) {
  const detail = normalizeAchievementDetail(achievement);
  return {
    id: detail.id,
    name: detail.name,
    description: detail.description,
    icon: detail.icon,
    color: detail.color,
    points: detail.points,
    rarity: detail.rarity,
    category: detail.category,
    unlockMessage: detail.unlockMessage
  };
}

function serializeUnlockedAchievement(userAchievement) {
  const detail = normalizeAchievementDetail(userAchievement);
  return {
    _id: userAchievement?._id ? toIdString(userAchievement._id) : detail._id,
    achievementId:
      userAchievement?.achievementId && typeof userAchievement.achievementId === "object"
        ? toIdString(userAchievement.achievementId._id || userAchievement.achievementId)
        : toIdString(userAchievement?.achievementId),
    id: detail.id,
    name: detail.name,
    description: detail.description,
    icon: detail.icon,
    color: detail.color,
    points: detail.points,
    rarity: detail.rarity,
    category: detail.category,
    unlockMessage: detail.unlockMessage,
    unlockedAt: userAchievement?.unlockedAt || null,
    unlocked: true
  };
}

function buildProgressState(achievement, metrics = {}, isUnlocked = false) {
  const condition = achievement?.condition || {};
  const targetValue = Number(condition.value ?? 1);

  if (!condition.type) {
    return {
      currentValue: 0,
      targetValue,
      percent: isUnlocked ? 100 : 0,
      unlocked: isUnlocked
    };
  }

  if (condition.type === "custom") {
    return {
      currentValue: isUnlocked ? 1 : 0,
      targetValue: 1,
      percent: isUnlocked ? 100 : 0,
      unlocked: isUnlocked
    };
  }

  const currentValue = Number(metrics[condition.type] || 0);
  const reached = compareWithOperator(currentValue, targetValue, condition.operator);
  let percent = 0;

  if (isUnlocked || reached) {
    percent = 100;
  } else if (targetValue > 0) {
    percent = Math.max(0, Math.min(99, Math.round((currentValue / targetValue) * 100)));
  }

  return {
    currentValue,
    targetValue,
    percent,
    unlocked: isUnlocked || reached
  };
}

function evaluateCondition(condition, payload = {}) {
  if (!condition?.type) {
    return false;
  }

  if (condition.type === "custom") {
    return Boolean(payload.allowCustomUnlock);
  }

  const metrics = payload.metrics || {};
  const currentValue = Number(
    payload.currentValue != null ? payload.currentValue : metrics[condition.type] || 0
  );
  const targetValue = Number(condition.value ?? 1);
  return compareWithOperator(currentValue, targetValue, condition.operator);
}

function maskLockedAchievement(achievement) {
  if (!achievement?.isHidden) {
    return achievement;
  }

  return {
    ...achievement,
    name: HIDDEN_ACHIEVEMENT_PLACEHOLDER.name,
    description: HIDDEN_ACHIEVEMENT_PLACEHOLDER.description,
    icon: HIDDEN_ACHIEVEMENT_PLACEHOLDER.icon
  };
}

async function getDistinctEnrolledCourseCount(userId) {
  const [result] = await LessonCompletion.aggregate([
    { $match: { user: toObjectId(userId) } },
    {
      $lookup: {
        from: "lessons",
        localField: "lesson",
        foreignField: "_id",
        as: "lesson"
      }
    },
    { $unwind: "$lesson" },
    { $match: { "lesson.courseId": { $exists: true, $ne: null } } },
    { $group: { _id: "$lesson.courseId" } },
    { $count: "count" }
  ]);

  return result?.count || 0;
}

async function loadAchievementContext(userId) {
  const normalizedUserId = toObjectId(userId);

  const [user, garden, lessonCount, unlockedAchievements, enrolledCourseCount] =
    await Promise.all([
      User.findById(normalizedUserId).lean(),
      Garden.findOne({ user: normalizedUserId }).lean(),
      LessonCompletion.countDocuments({ user: normalizedUserId }),
      UserAchievement.find({ user: normalizedUserId }).sort({ unlockedAt: -1 }).lean(),
      getDistinctEnrolledCourseCount(normalizedUserId)
    ]);

  if (!user) {
    return null;
  }

  const activePlantCount = (garden?.items || []).filter((item) => item.type === "plant").length;
  const activeDecorationCount = (garden?.items || []).filter(
    (item) => item.type === "decoration"
  ).length;

  const achievementPoints = unlockedAchievements.reduce((total, unlockedAchievement) => {
    const detail = normalizeAchievementDetail(unlockedAchievement);
    return total + Number(detail.points || 0);
  }, 0);

  const metrics = {
    lessons_completed: lessonCount,
    points_reached: Math.max(Number(user.points || 0), Number(user.totalPoints || 0)),
    streak_days: Number(user.currentStreak || 0),
    level_reached: Number(user.level || 0),
    courses_enrolled: enrolledCourseCount,
    plants_planted: Math.max(Number(garden?.plantCount || 0), activePlantCount),
    plants_harvested: Number(garden?.harvestCount || 0),
    plants_watered: Number(garden?.waterCount || 0),
    decorations_placed: Math.max(Number(garden?.decorationCount || 0), activeDecorationCount),
    gold_collected: Number(garden?.totalGoldCollected || 0),
    plant_survival_streak: Number(garden?.plantSurvivalStreak || 0),
    achievement_points: achievementPoints
  };

  return {
    user,
    garden,
    lessonCount,
    unlockedAchievements,
    unlockedIdSet: new Set(unlockedAchievements.map((item) => toIdString(item.achievementId))),
    unlockedByAchievementId: new Map(
      unlockedAchievements.map((item) => [toIdString(item.achievementId), item])
    ),
    metrics
  };
}

function buildAchievementQuery(triggerType, data = {}) {
  const query = { isActive: true };

  if (triggerType === "custom") {
    const ids = resolveCustomTriggerIds(data.triggerType);
    query.id = { $in: ids };
    return query;
  }

  if (Array.isArray(triggerType)) {
    query["condition.type"] = { $in: triggerType };
    return query;
  }

  query["condition.type"] = triggerType;
  return query;
}

async function unlockAchievement(userId, achievement) {
  const snapshot = createAchievementSnapshot(achievement);

  try {
    const userAchievement = await UserAchievement.create({
      user: toObjectId(userId),
      achievementId: achievement._id,
      achievementData: snapshot,
      unlockedAt: new Date()
    });

    const payload = serializeUnlockedAchievement({
      ...userAchievement.toObject(),
      achievementData: snapshot
    });

    emitAchievementUnlocked(userId, payload);
    return payload;
  } catch (err) {
    if (err?.code === 11000) {
      return null;
    }

    throw err;
  }
}

async function checkAndUnlockAchievements(userId, triggerType, data = {}) {
  try {
    const context = await loadAchievementContext(userId);
    if (!context) {
      return [];
    }

    if (triggerType === "custom" && resolveCustomTriggerIds(data.triggerType).length === 0) {
      return [];
    }

    const achievements = await AchievementType.find(buildAchievementQuery(triggerType, data))
      .sort({ points: 1, createdAt: 1 })
      .lean();

    const unlocked = [];

    for (const achievement of achievements) {
      const achievementKey = toIdString(achievement._id);
      if (context.unlockedIdSet.has(achievementKey)) {
        continue;
      }

      const isEligible =
        triggerType === "custom"
          ? resolveCustomTriggerIds(data.triggerType).includes(achievement.id)
          : evaluateCondition(achievement.condition, { metrics: context.metrics });

      if (!isEligible) {
        continue;
      }

      const payload = await unlockAchievement(userId, achievement);
      if (!payload) {
        continue;
      }

      context.unlockedIdSet.add(achievementKey);
      context.unlockedAchievements.unshift(payload);
      context.metrics.achievement_points += Number(payload.points || 0);
      unlocked.push(payload);
    }

    return unlocked;
  } catch (err) {
    console.error("Error in checkAndUnlockAchievements:", err);
    return [];
  }
}

async function checkAchievementTriggers(userId, triggerTypes) {
  const merged = [];
  const seenIds = new Set();

  for (const triggerType of triggerTypes) {
    const unlocked = await checkAndUnlockAchievements(userId, triggerType);
    unlocked.forEach((achievement) => {
      const id = achievement.id || achievement._id;
      if (!seenIds.has(id)) {
        seenIds.add(id);
        merged.push(achievement);
      }
    });
  }

  return merged;
}

async function onUserRegistered(userId) {
  return checkAndUnlockAchievements(userId, "custom", { triggerType: "register" });
}

async function onUserLogin(userId) {
  return checkAndUnlockAchievements(userId, "custom", { triggerType: "login" });
}

async function onLessonCompleted(userId) {
  return checkAchievementTriggers(userId, [
    "lessons_completed",
    "points_reached",
    "streak_days",
    "level_reached"
  ]);
}

async function onPointsGained(userId) {
  return checkAchievementTriggers(userId, ["points_reached", "level_reached"]);
}

async function onDailyCheck(userId) {
  return checkAchievementTriggers(userId, ["streak_days", "level_reached"]);
}

async function onPlantPlanted(userId) {
  return checkAndUnlockAchievements(userId, "plants_planted");
}

async function onPlantHarvested(userId) {
  return checkAchievementTriggers(userId, [
    "plants_harvested",
    "gold_collected",
    "level_reached"
  ]);
}

async function onPlantWatered(userId) {
  return checkAndUnlockAchievements(userId, "plants_watered");
}

async function onDecorationPlaced(userId) {
  return checkAndUnlockAchievements(userId, "decorations_placed");
}

async function onDailyGardenCheck(userId) {
  return checkAndUnlockAchievements(userId, "plant_survival_streak");
}

async function getUserAchievements(userId) {
  try {
    const achievements = await UserAchievement.find({ user: toObjectId(userId) })
      .populate("achievementId")
      .sort({ unlockedAt: -1 })
      .lean();

    return achievements.map(serializeUnlockedAchievement);
  } catch (err) {
    console.error("Error in getUserAchievements:", err);
    return [];
  }
}

async function getAchievementProgressDetails(userId) {
  try {
    const context = await loadAchievementContext(userId);
    if (!context) {
      return {};
    }

    const activeAchievements = await AchievementType.find({ isActive: true }).lean();

    return activeAchievements.reduce((progressMap, achievement) => {
      const key = toIdString(achievement._id);
      progressMap[key] = buildProgressState(
        achievement,
        context.metrics,
        context.unlockedIdSet.has(key)
      );
      return progressMap;
    }, {});
  } catch (err) {
    console.error("Error in getAchievementProgressDetails:", err);
    return {};
  }
}

async function getAchievementProgress(userId) {
  const details = await getAchievementProgressDetails(userId);
  return Object.keys(details).reduce((acc, key) => {
    acc[key] = details[key].percent || 0;
    return acc;
  }, {});
}

function buildAchievementGalleryItem(achievement, unlockedRecord, progress) {
  const detail = normalizeAchievementDetail(achievement);
  const unlocked = Boolean(unlockedRecord);
  const safeDetail = unlocked ? detail : maskLockedAchievement(detail);

  return {
    _id: toIdString(achievement._id),
    id: detail.id,
    name: safeDetail.name,
    description: safeDetail.description,
    icon: safeDetail.icon,
    color: detail.color,
    points: detail.points,
    rarity: detail.rarity,
    category: detail.category,
    condition: detail.condition,
    unlockMessage: detail.unlockMessage,
    isHidden: detail.isHidden,
    unlocked,
    unlockedAt: unlockedRecord?.unlockedAt || null,
    progress: progress.percent,
    progressDetail: progress
  };
}

async function getAchievementGallery(userId, filters = {}) {
  try {
    const context = await loadAchievementContext(userId);
    if (!context) {
      return [];
    }

    const query = { isActive: true };
    if (filters.category) {
      query.category = filters.category;
    }
    if (filters.rarity) {
      query.rarity = filters.rarity;
    }

    const achievements = await AchievementType.find(query).lean();
    const progressDetails = await getAchievementProgressDetails(userId);

    return achievements
      .map((achievement) => {
        const key = toIdString(achievement._id);
        return buildAchievementGalleryItem(
          achievement,
          context.unlockedByAchievementId.get(key),
          progressDetails[key] || buildProgressState(achievement, context.metrics, false)
        );
      })
      .sort((left, right) => {
        if (left.unlocked !== right.unlocked) {
          return left.unlocked ? -1 : 1;
        }

        const rarityDelta =
          (RARITY_ORDER[right.rarity] || 0) - (RARITY_ORDER[left.rarity] || 0);
        if (rarityDelta !== 0) {
          return rarityDelta;
        }

        if (right.progress !== left.progress) {
          return right.progress - left.progress;
        }

        return left.name.localeCompare(right.name);
      });
  } catch (err) {
    console.error("Error in getAchievementGallery:", err);
    return [];
  }
}

async function getAchievementStats(userId) {
  try {
    const [totalAchievements, context] = await Promise.all([
      AchievementType.countDocuments({ isActive: true }),
      loadAchievementContext(userId)
    ]);

    if (!context) {
      return { total: 0, unlocked: 0, locked: 0, completion: 0, achievementPoints: 0 };
    }

    const unlockedCount = context.unlockedAchievements.length;
    const lockedCount = Math.max(0, totalAchievements - unlockedCount);

    return {
      total: totalAchievements,
      unlocked: unlockedCount,
      locked: lockedCount,
      completion: totalAchievements > 0 ? Math.round((unlockedCount / totalAchievements) * 100) : 0,
      achievementPoints: context.metrics.achievement_points
    };
  } catch (err) {
    console.error("Error in getAchievementStats:", err);
    return { total: 0, unlocked: 0, locked: 0, completion: 0, achievementPoints: 0 };
  }
}

async function checkAndAwardAchievements() {
  return [];
}

const achievementChecker = {
  checkAndUnlockAchievements,
  onUserRegistered,
  onUserLogin,
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
  getAchievementProgressDetails,
  getAchievementGallery,
  getAchievementStats,
  evaluateCondition,
  buildProgressState,
  resolveCustomTriggerIds
};

module.exports = {
  checkAndAwardAchievements,
  achievementChecker
};
