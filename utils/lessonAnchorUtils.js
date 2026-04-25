const crypto = require('crypto');

const ALLOWED_HIGHLIGHT_COLORS = ['yellow', 'blue', 'green', 'pink', 'purple'];

function sanitizePlainText(value, { maxLength = 5000, trim = true } = {}) {
    let text = typeof value === 'string' ? value : String(value || '');
    text = text.replace(/\u0000/g, '').replace(/\r/g, '');
    if (trim) text = text.trim();
    if (text.length > maxLength) text = text.slice(0, maxLength);
    return text;
}

function hashText(value) {
    return crypto.createHash('sha1').update(String(value || '')).digest('hex');
}

function hashSeed(seed) {
    return hashText(seed).slice(0, 12);
}

function legacyClientHashSeed(seed) {
    let hash = 0;
    const source = String(seed || '');
    for (let index = 0; index < source.length; index += 1) {
        hash = ((hash << 5) - hash) + source.charCodeAt(index);
        hash |= 0;
    }
    return Math.abs(hash).toString(36);
}

function createStableBlockKey(block, index = 0) {
    if (!block || typeof block !== 'object') return `block-${index}`;

    const directId = block.id || block.blockId || block._id || block.data?.id || block.data?.blockId;
    if (directId) return sanitizePlainText(directId, { maxLength: 120 });

    const seedText =
        block.data?.text ||
        block.data?.title ||
        block.data?.question ||
        block.data?.html ||
        block.data?.code ||
        block.data?.url ||
        '';

    const seed = [block.type || 'unknown', seedText].join('|');
    return `block-${index}-${legacyClientHashSeed(seed.slice(0, 160))}`;
}

function extractLessonBlocks(lessonOrContent) {
    const rawContent =
        lessonOrContent && typeof lessonOrContent === 'object' && lessonOrContent.content !== undefined
            ? lessonOrContent.content
            : lessonOrContent;

    if (Array.isArray(rawContent)) return rawContent;

    if (typeof rawContent === 'string') {
        try {
            const parsed = JSON.parse(rawContent);
            return Array.isArray(parsed) ? parsed : [];
        } catch (error) {
            return [];
        }
    }

    return [];
}

function extractLessonBlockKeys(lessonOrContent) {
    const blocks = extractLessonBlocks(lessonOrContent);
    const keys = new Set();

    blocks.forEach((block, index) => {
        keys.add(createStableBlockKey(block, index));
    });

    return keys;
}

function normalizeHighlightColor(value) {
    const normalized = sanitizePlainText(value, { maxLength: 20 }).toLowerCase();
    return ALLOWED_HIGHLIGHT_COLORS.includes(normalized) ? normalized : 'yellow';
}

function normalizeAnchorInput(input = {}) {
    const blockKey = sanitizePlainText(input.blockKey || input.blockId, { maxLength: 120 });
    const blockType = sanitizePlainText(input.blockType, { maxLength: 40 }).toLowerCase();
    const selectedText = sanitizePlainText(input.selectedText, { maxLength: 1200 });
    const prefix = sanitizePlainText(input.prefix, { maxLength: 160, trim: false });
    const suffix = sanitizePlainText(input.suffix, { maxLength: 160, trim: false });

    const startOffset = Number.isFinite(Number(input.startOffset)) ? Math.max(0, Math.floor(Number(input.startOffset))) : -1;
    const endOffset = Number.isFinite(Number(input.endOffset)) ? Math.max(0, Math.floor(Number(input.endOffset))) : -1;

    if (!blockKey) {
        throw new Error('Thiếu blockKey cho neo văn bản.');
    }

    if (!selectedText || selectedText.length < 2) {
        throw new Error('Đoạn được chọn quá ngắn hoặc không hợp lệ.');
    }

    if (startOffset < 0 || endOffset <= startOffset) {
        throw new Error('Khoảng neo văn bản không hợp lệ.');
    }

    return {
        blockKey,
        blockType,
        selectedText,
        prefix,
        suffix,
        startOffset,
        endOffset,
        quoteHash: hashText(selectedText.toLowerCase())
    };
}

function validateAnchorAgainstLesson(anchor, lessonOrContent) {
    const blockKeys = extractLessonBlockKeys(lessonOrContent);
    if (blockKeys.size === 0) return true;
    return blockKeys.has(anchor.blockKey);
}

function rangesOverlap(a, b) {
    if (!a || !b) return false;
    if (a.blockKey !== b.blockKey) return false;
    return a.startOffset < b.endOffset && b.startOffset < a.endOffset;
}

module.exports = {
    ALLOWED_HIGHLIGHT_COLORS,
    sanitizePlainText,
    normalizeHighlightColor,
    normalizeAnchorInput,
    createStableBlockKey,
    extractLessonBlocks,
    extractLessonBlockKeys,
    validateAnchorAgainstLesson,
    rangesOverlap
};
