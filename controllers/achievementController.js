const { achievementChecker } = require("../utils/achievementUtils");

exports.getUserAchievements = async (req, res) => {
  try {
    const achievements = await achievementChecker.getUserAchievements(req.user._id);
    res.json({ success: true, achievements });
  } catch (err) {
    console.error("Get user achievements error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getAchievementStats = async (req, res) => {
  try {
    const stats = await achievementChecker.getAchievementStats(req.user._id);
    res.json({ success: true, stats });
  } catch (err) {
    console.error("Get achievement stats error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getAllAchievements = async (req, res) => {
  try {
    const filters = {
      category: req.query.category || undefined,
      rarity: req.query.rarity || undefined
    };
    const achievements = await achievementChecker.getAchievementGallery(req.user._id, filters);
    res.json({ success: true, achievements });
  } catch (err) {
    console.error("Get all achievements error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getProgress = async (req, res) => {
  try {
    const achievements = await achievementChecker.getAchievementGallery(req.user._id, {
      category: req.query.category || undefined,
      rarity: req.query.rarity || undefined
    });
    const locked = achievements.filter((achievement) => !achievement.unlocked);
    res.json({ success: true, progress: locked });
  } catch (err) {
    console.error("Get progress error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.checkAchievements = async (req, res) => {
  try {
    const { triggerType, data } = req.body;
    const newlyUnlocked = await achievementChecker.checkAndUnlockAchievements(
      req.user._id,
      triggerType,
      data
    );

    res.json({
      success: true,
      newlyUnlocked
    });
  } catch (err) {
    console.error("Check achievements error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getAchievementsWithProgress = async (req, res) => {
  try {
    const achievements = await achievementChecker.getAchievementGallery(req.user._id, {
      category: req.query.category || undefined,
      rarity: req.query.rarity || undefined
    });
    res.json({ success: true, achievements });
  } catch (err) {
    console.error("Get achievements with progress error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};
