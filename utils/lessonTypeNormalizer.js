/**
 * Lesson Type Normalizer
 * Maps legacy lesson types to the 4 canonical types and provides
 * UI configuration metadata for each.
 *
 * Canonical types:
 *   concept      — 📘 Bài Giảng Nền Tảng (theory, reading-heavy)
 *   masterclass  — ▶️ Lớp Học Tương Tác (video-centric)
 *   checkpoint   — ⚔️ Thực Chiến / Vượt Ải (quiz/assessment)
 *   lab          — 🛠️ Xưởng Thực Hành (code sandbox)
 */

const CANONICAL_TYPES = ['concept', 'masterclass', 'checkpoint', 'lab'];

const LEGACY_MAP = {
    // → concept
    theory: 'concept',
    markdown: 'concept',
    document: 'concept',
    resource: 'concept',
    // → masterclass
    video: 'masterclass',
    // → checkpoint
    quiz: 'checkpoint',
    question: 'checkpoint',
    essay: 'checkpoint',
    // → lab
    code: 'lab',
    // canonical values map to themselves
    concept: 'concept',
    masterclass: 'masterclass',
    checkpoint: 'checkpoint',
    lab: 'lab'
};

const TYPE_CONFIGS = {
    concept: {
        key: 'concept',
        label: 'Bài Giảng Nền Tảng',
        shortLabel: 'Nền tảng',
        icon: 'fa-book-open',
        emoji: '📘',
        accentColor: '#6366f1',
        defaultLayoutMode: 'focus',
        features: {
            ttsTopbar: true,
            highlightToolbar: true,
            zenModeDefault: true,
            antiCopy: false,
            videoTheater: false,
            splitScreen: false,
            quizGate: false,
            leaderboard: false
        }
    },
    masterclass: {
        key: 'masterclass',
        label: 'Lớp Học Tương Tác',
        shortLabel: 'Masterclass',
        icon: 'fa-play-circle',
        emoji: '▶️',
        accentColor: '#8b5cf6',
        defaultLayoutMode: 'standard',
        features: {
            ttsTopbar: false,
            highlightToolbar: false,
            zenModeDefault: false,
            antiCopy: false,
            videoTheater: true,
            splitScreen: false,
            quizGate: false,
            leaderboard: false
        }
    },
    checkpoint: {
        key: 'checkpoint',
        label: 'Thực Chiến / Vượt Ải',
        shortLabel: 'Checkpoint',
        icon: 'fa-shield-halved',
        emoji: '⚔️',
        accentColor: '#ef4444',
        defaultLayoutMode: 'standard',
        features: {
            ttsTopbar: false,
            highlightToolbar: false,
            zenModeDefault: false,
            antiCopy: true,
            videoTheater: false,
            splitScreen: false,
            quizGate: true,
            leaderboard: true
        }
    },
    lab: {
        key: 'lab',
        label: 'Xưởng Thực Hành',
        shortLabel: 'Lab',
        icon: 'fa-code',
        emoji: '🛠️',
        accentColor: '#22c55e',
        defaultLayoutMode: 'wide',
        features: {
            ttsTopbar: false,
            highlightToolbar: false,
            zenModeDefault: false,
            antiCopy: false,
            videoTheater: false,
            splitScreen: true,
            quizGate: false,
            leaderboard: false
        }
    }
};

/**
 * Normalize a raw lesson type string into one of the 4 canonical types.
 * @param {string} rawType — the value from Lesson.type in the database
 * @returns {string} one of: 'concept', 'masterclass', 'checkpoint', 'lab'
 */
function mapLegacyType(rawType) {
    const key = String(rawType || '').trim().toLowerCase();
    return LEGACY_MAP[key] || 'concept';
}

/**
 * Return full UI/UX configuration for a normalized lesson type.
 * @param {string} normalizedType — one of the 4 canonical types
 * @returns {object}
 */
function getLessonTypeConfig(normalizedType) {
    return TYPE_CONFIGS[normalizedType] || TYPE_CONFIGS.concept;
}

/**
 * Convenience: get both normalized type + config from a raw DB value.
 * @param {string} rawType
 * @returns {{ normalizedType: string, typeConfig: object }}
 */
function resolveLessonType(rawType) {
    const normalizedType = mapLegacyType(rawType);
    return { normalizedType, typeConfig: getLessonTypeConfig(normalizedType) };
}

module.exports = {
    CANONICAL_TYPES,
    LEGACY_MAP,
    TYPE_CONFIGS,
    mapLegacyType,
    getLessonTypeConfig,
    resolveLessonType
};
