// utils/growthUtils.js

const TREE_LEVEL_THRESHOLDS = [0, 50, 150, 350, 700, 1200, 2000, 3000, 6000];
const MAX_TREE_LEVEL = TREE_LEVEL_THRESHOLDS.length - 1;

function getPointsForNextLevel(currentLevel) {
    if (currentLevel >= MAX_TREE_LEVEL) return Infinity;
    return TREE_LEVEL_THRESHOLDS[currentLevel + 1];
}

function getPointsForCurrentLevel(currentLevel) {
    if (currentLevel <= 0) return 0;
    if (currentLevel > MAX_TREE_LEVEL) return TREE_LEVEL_THRESHOLDS[MAX_TREE_LEVEL];
    return TREE_LEVEL_THRESHOLDS[currentLevel];
}

/**
 * Updates user's growth points and tree level, emitting socket events.
 * IMPORTANT: Assumes the calling function will handle saving the user document.
 * @param {User} user - Mongoose user document (will be modified).
 * @param {number} pointsToAdd - Points earned from an activity.
 * @param {object} io - Socket.IO server instance.
 * @param {string} sourceActivity - Optional description of the source (e.g., "lesson_complete", "quiz_bonus").
 * @returns {Promise<{leveledUp: boolean, oldLevel: number, newLevel: number, pointsGained: number, achievementAwarded: object|null}>} - Info about growth.
 */
async function updateGrowth(user, pointsToAdd, io, sourceActivity = 'activity') {
    if (!user || pointsToAdd <= 0) {
        return { leveledUp: false, oldLevel: user?.treeLevel || 0, newLevel: user?.treeLevel || 0, pointsGained: 0, achievementAwarded: null };
    }

    const oldLevel = user.treeLevel || 0;
    const oldGrowthPoints = user.growthPoints || 0;
    user.growthPoints += pointsToAdd; // Update growth points first
    user.lastGrowthActivity = new Date(); // Update timestamp

    let currentLevel = oldLevel;
    let leveledUp = false;
    let achievementAwarded = null; // Placeholder

    // --- Emit basic points gain event ---
    // Emit to the specific user's room
    if (io) {
        const currentLevelThreshold = getPointsForCurrentLevel(currentLevel);
        const nextLevelThreshold = getPointsForNextLevel(currentLevel);
        const pointsInCurrentLevel = user.growthPoints - currentLevelThreshold;
        const pointsNeededInCurrentLevel = nextLevelThreshold === Infinity ? 0 : nextLevelThreshold - currentLevelThreshold;
        const progressPercent = pointsNeededInCurrentLevel > 0 ? Math.max(0, Math.min(100, (pointsInCurrentLevel / pointsNeededInCurrentLevel) * 100)) : (currentLevel >= MAX_TREE_LEVEL ? 100 : 0);

        io.to(user._id.toString()).emit('treePointsUpdate', {
            pointsGained: pointsToAdd,
            newGrowthPoints: user.growthPoints,
            treeLevel: currentLevel, // Level BEFORE potential level up check
            pointsForCurrentLevel: currentLevelThreshold,
            pointsForNextLevel: nextLevelThreshold,
            progressPercent: progressPercent,
            source: sourceActivity
        });
        console.log(`Emitted treePointsUpdate to user ${user._id}: +${pointsToAdd} points`);
    }

    // --- Check for Level Up ---
    while (currentLevel < MAX_TREE_LEVEL && user.growthPoints >= getPointsForNextLevel(currentLevel)) {
        currentLevel++;
        leveledUp = true;
        console.log(`User ${user.username} tree leveled up to ${currentLevel}!`);

        // --- TODO: Check/Award Tree Level Achievement ---
        // achievementAwarded = await checkAndAwardTreeAchievement(user, currentLevel, io);

        // --- Emit Level Up Event ---
        if (io) {
            const levelUpData = {
                newLevel: currentLevel,
                levelName: `Cây Cấp ${currentLevel}`, // Replace with better names later
                message: `Chúc mừng! Cây của bạn đã phát triển lên cấp độ ${currentLevel}!`,
                // Include threshold info for the *new* level
                pointsForCurrentLevel: getPointsForCurrentLevel(currentLevel),
                pointsForNextLevel: getPointsForNextLevel(currentLevel),
                // achievement: achievementAwarded // Include if achievement logic is added
            };
            io.to(user._id.toString()).emit('treeLevelUp', levelUpData);
            console.log(`Emitted treeLevelUp to user ${user._id}: Level ${currentLevel}`);
        }
    }

    user.treeLevel = currentLevel; // Set final level on user object

    // NOTE: User document is modified but *not saved* here. The calling route should handle saving.

    return { leveledUp, oldLevel, newLevel: currentLevel, pointsGained: pointsToAdd, achievementAwarded };
}

module.exports = {
    TREE_LEVEL_THRESHOLDS, MAX_TREE_LEVEL,
    getPointsForNextLevel, getPointsForCurrentLevel,
    updateGrowth // Export the main function
};