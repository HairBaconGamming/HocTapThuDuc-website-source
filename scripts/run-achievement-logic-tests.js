const assert = require("assert");
const { achievementChecker } = require("../utils/achievementUtils");

function pass(name) {
  console.log(`PASS ${name}`);
}

function run() {
  const lessonCondition = { type: "lessons_completed", value: 10, operator: ">=" };
  assert.strictEqual(
    achievementChecker.evaluateCondition(lessonCondition, { metrics: { lessons_completed: 10 } }),
    true
  );
  assert.strictEqual(
    achievementChecker.evaluateCondition(lessonCondition, { metrics: { lessons_completed: 9 } }),
    false
  );
  pass("evaluateCondition respects comparison operators for lesson counts");

  const pointsCondition = { type: "points_reached", value: 500, operator: ">=" };
  assert.strictEqual(
    achievementChecker.evaluateCondition(pointsCondition, { metrics: { points_reached: 500 } }),
    true
  );
  assert.strictEqual(
    achievementChecker.evaluateCondition(pointsCondition, { metrics: { points_reached: 499 } }),
    false
  );
  pass("points_reached evaluates against learning points instead of achievement points");

  const levelProgress = achievementChecker.buildProgressState(
    { condition: { type: "level_reached", value: 10, operator: ">=" } },
    { level_reached: 6 },
    false
  );
  assert.strictEqual(levelProgress.currentValue, 6);
  assert.strictEqual(levelProgress.targetValue, 10);
  assert.strictEqual(levelProgress.percent, 60);
  pass("buildProgressState reports exact level progress");

  const customIds = achievementChecker.resolveCustomTriggerIds("login");
  assert.deepStrictEqual(customIds, ["first_login"]);
  pass("custom trigger mapping separates login achievements cleanly");
}

try {
  run();
} catch (err) {
  console.error("Achievement logic test failed:", err);
  process.exit(1);
}
