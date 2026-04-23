const ASSETS = require("../config/gardenAssets");
const {
  MAX_DAILY_QUESTS,
  QUEST_POOL,
  resolveQuestTarget
} = require("./gardenQuestService");
const {
  MOISTURE_DURATION,
  parseDuration
} = require("./gardenStateService");
const {
  CONTRIBUTION_VALUES,
  GUILD_TREE_STAGES
} = require("../utils/guildTreeUtils");

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function formatDurationFromMs(ms) {
  const safeMs = Math.max(0, Number(ms || 0));
  const totalMinutes = Math.round(safeMs / 60000);
  const days = Math.floor(totalMinutes / (24 * 60));
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
  const minutes = totalMinutes % 60;
  const parts = [];

  if (days > 0) parts.push(`${days} ngày`);
  if (hours > 0) parts.push(`${hours} giờ`);
  if (minutes > 0 || parts.length === 0) parts.push(`${minutes} phút`);

  return parts.join(" ");
}

function formatDurationText(value) {
  return formatDurationFromMs(parseDuration(value));
}

function formatRewardRange(config = {}) {
  const min = Number(config.rewardGold?.min || 0);
  const max = Number(config.rewardGold?.max || 0);
  if (!min && !max) return "0";
  if (min === max) return `${min}`;
  return `${min}-${max}`;
}

function getAverageRewardGold(config = {}) {
  const min = Number(config.rewardGold?.min || 0);
  const max = Number(config.rewardGold?.max || 0);
  return Math.round((min + max) / 2);
}

function getBackendMaturityMs(config = {}) {
  const timePerStage = parseDuration(config.growthTime);
  return timePerStage * Math.max(0, Number(config.maxStage || 0));
}

function getDisplayTotalMs(config = {}) {
  return parseDuration(config.totalTime || config.growthTime);
}

function buildPlantLine([plantId, config]) {
  const timePerStageMs = parseDuration(config.growthTime);
  const backendMaturityMs = getBackendMaturityMs(config);
  const displayTotalMs = getDisplayTotalMs(config);
  const witherMs = parseDuration(config.witherTime || "30 phút");
  const harvestMode = config.isMultiHarvest
    ? `đa vụ, thu xong quay về stage ${Number.isInteger(config.afterharvestStage) ? config.afterharvestStage : 0}`
    : "một vụ, thu xong bị gỡ khỏi vườn";

  const notes = [];
  if (displayTotalMs !== backendMaturityMs) {
    notes.push(
      `UI/config ghi tổng thời gian ${formatDurationFromMs(displayTotalMs)}, nhưng backend cho phép chín sau khoảng ${formatDurationFromMs(backendMaturityMs)} nếu đất luôn ẩm`
    );
  } else {
    notes.push(`chín sau khoảng ${formatDurationFromMs(backendMaturityMs)} nếu đất luôn ẩm`);
  }

  if (plantId === "chili_pepper" && config.isMultiHarvest) {
    notes.push("comment cũ ghi 'chỉ thu hoạch 1 lần' nhưng code hiện tại đang chạy theo chế độ đa vụ");
  }

  const contribution = Number(CONTRIBUTION_VALUES[plantId] || 0);

  return [
    `- ${config.name} (${plantId}): mở khóa level ${Number(config.unlockLevel || 1)}, giá ${Number(config.price || 0)} vàng, ${Number(config.maxStage || 0) + 1} mốc stage (0..${Number(config.maxStage || 0)}).`,
    `  Mỗi stage mất ${formatDurationFromMs(timePerStageMs)}; vàng thu hoạch ${formatRewardRange(config)}; XP ${Number(config.rewardXP || 0)}; tồn kho +${Math.max(1, Number(config.harvestYield || 1))} mỗi lần.`,
    `  Héo khi khô khoảng ${formatDurationFromMs(witherMs)}; kiểu cây: ${harvestMode}; hiến cống Linh Thụ: ${contribution || 0} linh lực mỗi đơn vị.`,
    `  Ghi chú chuẩn theo code: ${notes.join("; ")}.`
  ].join(" ");
}

function buildQuestLine(quest) {
  const baseRewardParts = [];
  if (quest.baseRewards?.gold) baseRewardParts.push(`${quest.baseRewards.gold} vàng`);
  if (quest.baseRewards?.water) baseRewardParts.push(`${quest.baseRewards.water} nước`);
  if (quest.baseRewards?.fertilizer) baseRewardParts.push(`${quest.baseRewards.fertilizer} phân`);

  const targetText = quest.targetScaling?.mode === "exponential"
    ? `${quest.target} ở level 1 và tăng theo hàm mũ (factor ${Number(quest.targetScaling.factor || 1)})`
    : `${quest.target}`;

  return `- ${quest.id}: ${quest.title}. Metric ${quest.metric}, target ${targetText}, thưởng gốc ${baseRewardParts.join(", ") || "không có"}.`;
}

function buildGuildBuffLines() {
  return GUILD_TREE_STAGES.map((stage) => {
    const lessonXpPct = Number(stage.buffs?.lessonXpPct || 0);
    const witherTimeBonusPct = Number(stage.buffs?.witherTimeBonusPct || 0);
    return `- Stage ${stage.stage} (${stage.name}): +${lessonXpPct}% XP bài học, +${witherTimeBonusPct}% thời gian héo cây.`;
  }).join("\n");
}

function buildRuntimeCropSummary(cropBreakdown = []) {
  if (!Array.isArray(cropBreakdown) || cropBreakdown.length === 0) {
    return "";
  }

  return cropBreakdown
    .map((entry) => {
      const parts = [`${entry.name || entry.itemId}: ${Number(entry.count || 0)} cây`];
      if (Number(entry.ready || 0) > 0) parts.push(`${Number(entry.ready)} chín`);
      if (Number(entry.dead || 0) > 0) parts.push(`${Number(entry.dead)} chết`);
      return parts.join(", ");
    })
    .join(" | ");
}

function buildRuntimeInventorySummary(inventory = []) {
  if (!Array.isArray(inventory) || inventory.length === 0) {
    return "";
  }

  return inventory
    .map((entry) => `${entry.name || entry.itemId} x${Number(entry.count || 0)}`)
    .join(", ");
}

function buildRuntimeQuestSummary(quests = []) {
  if (!Array.isArray(quests) || quests.length === 0) {
    return "";
  }

  return quests
    .map((quest) => {
      const state = quest.claimed
        ? "đã nhận"
        : quest.complete
          ? "đã xong, chưa nhận"
          : "đang làm";
      return `${quest.title}: ${Number(quest.progress || 0)}/${Number(quest.target || 0)} (${state})`;
    })
    .join(" | ");
}

function buildGardenRuntimeSummary(gardenMeta = {}) {
  if (!gardenMeta || typeof gardenMeta !== "object") return "";

  const lines = [];
  const resources = [
    `nước ${Number(gardenMeta.water || 0)}`,
    `phân ${Number(gardenMeta.fertilizer || 0)}`,
    `vàng ${Number(gardenMeta.gold || 0)}`
  ].join(", ");
  lines.push(`- Tài nguyên hiện có: ${resources}.`);

  if (gardenMeta.userLevel || gardenMeta.levelName) {
    lines.push(
      `- Level vườn/người chơi: ${Number(gardenMeta.userLevel || 0)}${gardenMeta.levelName ? ` (${gardenMeta.levelName})` : ""}.`
    );
  }

  if (gardenMeta.counts) {
    lines.push(
      `- Quy mô hiện tại: ${Number(gardenMeta.counts.plots || 0)} ô đất, ${Number(gardenMeta.counts.plants || 0)} cây, ${Number(gardenMeta.counts.readyPlants || 0)} cây chín, ${Number(gardenMeta.counts.deadPlants || 0)} cây chết.`
    );
  }

  const cropSummary = buildRuntimeCropSummary(gardenMeta.cropBreakdown);
  if (cropSummary) {
    lines.push(`- Cây đang có: ${cropSummary}.`);
  }

  const inventorySummary = buildRuntimeInventorySummary(gardenMeta.inventory);
  if (inventorySummary) {
    lines.push(`- Tồn kho đã thu hoạch: ${inventorySummary}.`);
  }

  const questSummary = buildRuntimeQuestSummary(gardenMeta.dailyQuests);
  if (questSummary) {
    lines.push(`- Quest hôm nay: ${questSummary}.`);
  }

  if (gardenMeta.selectedPlant?.name) {
    const selected = gardenMeta.selectedPlant;
    lines.push(
      `- Cây đang inspect: ${selected.name}${selected.stageBadge ? `, ${selected.stageBadge}` : ""}${selected.totalTime ? `, tổng thời gian hiển thị ${selected.totalTime}` : ""}${selected.wateringTime ? `, cửa sổ ẩm ${selected.wateringTime}` : ""}.`
    );
  }

  if (gardenMeta.pendingClaimQuests !== undefined) {
    lines.push(`- Quest chờ nhận thưởng: ${Number(gardenMeta.pendingClaimQuests || 0)}.`);
  }

  return lines.join("\n");
}

function buildGardenTutorKnowledge({ metadata } = {}) {
  const plantLines = Object.entries(ASSETS.PLANTS || {})
    .map(buildPlantLine)
    .join("\n");

  const questLines = QUEST_POOL
    .filter((quest) => !quest.disabled)
    .map(buildQuestLine)
    .join("\n");

  const runtimeSummary = buildGardenRuntimeSummary(metadata?.garden);

  return [
    "### MY GARDEN CANONICAL KNOWLEDGE",
    "- Khi user hỏi về My Garden, nông trại, crop, nước, phân bón, quest, thu hoạch, Linh Thụ hoặc các cây trong game, phải ưu tiên sự thật theo code hiện tại của hệ thống này, không suy diễn theo nông nghiệp đời thực.",
    "- Nếu user hỏi về cây ngoài đời (ví dụ đất thật, sâu bệnh, khí hậu, giống thật, ăn uống, trồng ngoài vườn thật), phải nói rõ đó là kiến thức ngoài game và không được trộn lẫn với cơ chế My Garden.",
    "- Nếu config hiển thị và backend lệch nhau, phải ưu tiên hành vi backend khi nói 'thực tế game đang chạy thế nào', đồng thời có thể ghi chú phần hiển thị để user không bị rối.",
    "",
    "#### Core Rules",
    `- Vườn mới mặc định có 100 vàng, 1 nước, 0 phân bón. Mở rộng ô đất dùng giá động: ceil(50 * 1.005^số_ô_đất_hiện_có).`,
    "- Cây chỉ trồng được trên ô đất (`plot`). Trang trí chỉ đặt trên cỏ, không đặt trên ô đất.",
    `- Tưới nước tốn 1 nước. Khi tưới, ô đất ẩm trong ${formatDurationFromMs(MOISTURE_DURATION)}. Tưới cây hay tưới ô đất đều cập nhật ` + "`plot.lastWatered`" + " của ô đất đó.",
    "- Cây chỉ tăng trưởng khi ô đất còn ẩm. Backend tính `stage = floor(growthProgress / growthTime)` và chặn tối đa ở `maxStage`.",
    "- Khi ô đất khô và cây đã qua stage 0, `witherProgress` sẽ tăng dần. Khi vượt `witherTime * guildMultiplier` thì cây chết.",
    "- Tưới nước sẽ reset `witherProgress` của cây về 0. Khi cây đang ẩm, phần `witherProgress` cũ cũng tự giảm dần về 0 theo thời gian.",
    "- Bón phân chỉ dùng cho cây còn sống và chưa chín. Mỗi lần bón tốn 1 phân, cộng đúng 1 nhịp `growthTime` (thực chất gần như +1 stage), reset héo và đồng thời làm ướt lại ô đất.",
    "- Thu hoạch chỉ thành công khi `stage >= maxStage`. Cây một vụ bị gỡ khỏi vườn sau khi thu. Cây đa vụ sẽ quay về `afterharvestStage` và tiếp tục lớn lại.",
    "- Di chuyển cây chỉ hợp lệ khi cây chưa chết và hoặc đang ở stage 0, hoặc đã chín hoàn toàn. Cây đang lớn giữa chừng không nên/không được dời.",
    "- Inventory trong Garden hiện lưu nông sản đã thu hoạch. Mỗi lần thu hoạch mặc định +1 đơn vị vào kho nếu cây không có `harvestYield` riêng.",
    "",
    "#### Plant Catalog",
    plantLines,
    "",
    "#### Daily Quests",
    `- Mỗi ngày có tối đa ${MAX_DAILY_QUESTS} quest active.`,
    "- Quest được chọn deterministic theo user + ngày, nên hai người khác nhau có thể không nhận cùng bộ quest.",
    "- Progress quest tính theo chênh lệch so với baseline tại lúc reset ngày, không phải tổng thành tích trọn đời.",
    "- Reward quest scale theo level với công thức `base * (1 + 0.15 * (level - 1))`, cap tối đa 5x reward gốc.",
    `- Quest "gold-500" dùng target động theo level. Ví dụ level 1 cần ${resolveQuestTarget(QUEST_POOL.find((quest) => quest.id === "gold-500"), 1)}, level 10 cần ${resolveQuestTarget(QUEST_POOL.find((quest) => quest.id === "gold-500"), 10)}.`,
    questLines,
    "",
    "#### Guild / Spirit Tree",
    "- Buff bang hội chỉ ảnh hưởng My Garden theo 2 hướng chính: tăng XP bài học và kéo dài thời gian héo cây (`witherTimeMultiplier = 1 + witherTimeBonusPct / 100`).",
    buildGuildBuffLines(),
    "",
    "#### Known Data Mismatches You Must Handle Carefully",
    `- Hướng Dương: config ghi ${formatDurationText(ASSETS.PLANTS.sunflower.totalTime)}, nhưng backend chín sau khoảng ${formatDurationFromMs(getBackendMaturityMs(ASSETS.PLANTS.sunflower))} nếu đất luôn ẩm.`,
    `- Lúa Mì: config ghi ${formatDurationText(ASSETS.PLANTS.wheat.totalTime)}, nhưng backend chín sau khoảng ${formatDurationFromMs(getBackendMaturityMs(ASSETS.PLANTS.wheat))} nếu đất luôn ẩm.`,
    `- Cà Rốt: config ghi ${formatDurationText(ASSETS.PLANTS.carrot.totalTime)}, nhưng backend chín sau khoảng ${formatDurationFromMs(getBackendMaturityMs(ASSETS.PLANTS.carrot))} nếu đất luôn ẩm.`,
    "- Ớt Siêu Cay: comment cũ nói chỉ thu hoạch 1 lần, nhưng code hiện tại đang bật `isMultiHarvest: true` và `afterharvestStage: 2`, nên hành vi thực tế là cây tái sinh sau thu hoạch.",
    ...(runtimeSummary ? ["", "#### Runtime Snapshot", runtimeSummary] : [])
  ].join("\n");
}

const GARDEN_KEYWORDS = [
  "my-garden",
  "my garden",
  "/my-garden",
  "nong trai",
  "vuon",
  "thu hoach",
  "tuoi nuoc",
  "phan bon",
  "linh thu",
  "tong mon",
  "guild",
  "quest",
  "sunflower",
  "wheat",
  "carrot",
  "tomato",
  "watermelon",
  "chili pepper",
  "chili_pepper",
  "huong duong",
  "lua mi",
  "ca rot",
  "ca chua",
  "dua hau",
  "ot sieu cay"
];

function isGardenTopic({ pageType, prompt, contextSummary, metadata } = {}) {
  if (pageType === "garden") return true;
  if (metadata?.garden && typeof metadata.garden === "object") return true;

  const haystack = normalizeText([
    prompt,
    contextSummary,
    metadata?.pathname,
    metadata?.variant,
    metadata?.garden?.selectedPlant?.name
  ].filter(Boolean).join(" "));

  return GARDEN_KEYWORDS.some((keyword) => haystack.includes(keyword));
}

module.exports = {
  isGardenTopic,
  buildGardenTutorKnowledge,
  buildGardenRuntimeSummary
};
