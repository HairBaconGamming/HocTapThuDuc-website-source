const assert = require('assert');
const {
    createStableBlockKey,
    extractLessonBlocks,
    extractLessonBlockKeys,
    normalizeAnchorInput,
    normalizeHighlightColor,
    sanitizePlainText,
    validateAnchorAgainstLesson,
    rangesOverlap
} = require('../utils/lessonAnchorUtils');

function testStableBlockKeys() {
    const block = { type: 'text', data: { text: 'Xin chào active learning' } };
    const first = createStableBlockKey(block, 0);
    const second = createStableBlockKey(block, 0);
    assert.strictEqual(first, second, 'Block key phải ổn định với cùng dữ liệu đầu vào');
}

function testLessonBlockExtraction() {
    const blocks = extractLessonBlocks(JSON.stringify([
        { type: 'header', data: { text: 'Mở đầu' } },
        { type: 'text', data: { text: 'Nội dung' } }
    ]));
    assert.strictEqual(blocks.length, 2, 'Phải parse được mảng block từ JSON string');

    const keys = extractLessonBlockKeys(blocks);
    assert.strictEqual(keys.size, 2, 'Phải trích được block key cho từng block');
}

function testAnchorNormalization() {
    const anchor = normalizeAnchorInput({
        blockKey: 'block-1',
        blockType: 'text',
        selectedText: 'Đây là đoạn quan trọng',
        prefix: 'abc',
        suffix: 'xyz',
        startOffset: 4,
        endOffset: 26
    });

    assert.strictEqual(anchor.blockKey, 'block-1');
    assert.strictEqual(anchor.selectedText, 'Đây là đoạn quan trọng');
    assert.ok(anchor.quoteHash, 'Quote hash phải được sinh ra');
}

function testHighlightColorNormalization() {
    assert.strictEqual(normalizeHighlightColor('Blue'), 'blue');
    assert.strictEqual(normalizeHighlightColor('khong-hop-le'), 'yellow');
}

function testSanitizeText() {
    assert.strictEqual(sanitizePlainText('  xin chao  '), 'xin chao');
    assert.strictEqual(sanitizePlainText('a'.repeat(10), { maxLength: 5 }), 'aaaaa');
}

function testAnchorValidationAgainstLesson() {
    const lesson = {
        content: JSON.stringify([
            { type: 'header', data: { text: 'Chương 1' }, id: 'heading-intro' }
        ])
    };
    const isValid = validateAnchorAgainstLesson({
        blockKey: 'heading-intro',
        selectedText: 'Chương 1',
        startOffset: 0,
        endOffset: 7
    }, lesson);
    assert.strictEqual(isValid, true, 'Anchor phải khớp với block key thật của lesson');
}

function testRangeOverlap() {
    const a = { blockKey: 'block-a', startOffset: 10, endOffset: 30 };
    const b = { blockKey: 'block-a', startOffset: 25, endOffset: 40 };
    const c = { blockKey: 'block-b', startOffset: 25, endOffset: 40 };

    assert.strictEqual(rangesOverlap(a, b), true, 'Hai range cùng block và chồng nhau phải trả về true');
    assert.strictEqual(rangesOverlap(a, c), false, 'Hai range khác block không được coi là chồng nhau');
}

function run() {
    testStableBlockKeys();
    testLessonBlockExtraction();
    testAnchorNormalization();
    testHighlightColorNormalization();
    testSanitizeText();
    testAnchorValidationAgainstLesson();
    testRangeOverlap();
    console.log('Lesson active learning OK.');
}

run();
