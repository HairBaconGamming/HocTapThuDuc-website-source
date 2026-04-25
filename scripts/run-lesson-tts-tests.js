const assert = require('assert');

const {
    extractSpeakableParagraphsFromLesson,
    chunkSpeakableText,
    buildLessonTtsCacheKey
} = require('../utils/lessonTtsUtils');
const { runInFlightDeduped } = require('../services/lessonTtsService');

function testSpeakableExtraction() {
    const lesson = {
        content: JSON.stringify([
            { type: 'header', data: { text: 'Chương 1: Dao động' } },
            { type: 'text', data: { text: 'Đây là **nội dung chính** của bài học.' } },
            { type: 'callout', data: { text: 'Lưu ý quan trọng cho học sinh.' } },
            { type: 'image', data: { url: 'https://example.com/image.png', caption: 'Sơ đồ minh họa' } },
            { type: 'resource', data: { url: 'https://example.com/file.pdf', title: 'Phiếu học tập' } },
            {
                type: 'quiz',
                data: {
                    questions: [
                        {
                            type: 'choice',
                            question: 'Đâu là đáp án đúng?',
                            options: ['Phương án A', 'Phương án B'],
                            correct: [1],
                            explanation: 'Vì phương án B phù hợp với đề bài.'
                        },
                        {
                            type: 'fill',
                            content: 'Công thức của nước là [H2O].'
                        }
                    ]
                }
            },
            { type: 'code', data: { language: 'js', code: 'console.log("skip me");' } },
            { type: 'html_preview', data: { html: '<h1>skip html</h1>' } },
            { type: 'video', data: { url: 'https://youtu.be/demo123' } }
        ])
    };

    const paragraphs = extractSpeakableParagraphsFromLesson(lesson);
    const joined = paragraphs.join(' ');

    assert.ok(joined.includes('Chương 1: Dao động'), 'Phải đọc được heading của bài học');
    assert.ok(joined.includes('nội dung chính'), 'Phải đọc được nội dung text chính');
    assert.ok(joined.includes('Lưu ý quan trọng'), 'Phải đọc được callout');
    assert.ok(joined.includes('Sơ đồ minh họa'), 'Phải đọc được caption của hình');
    assert.ok(joined.includes('Phiếu học tập'), 'Phải đọc được title của tài liệu');
    assert.ok(joined.includes('Câu hỏi 1'), 'Phải đọc được câu hỏi quiz');
    assert.ok(joined.includes('Đáp án đúng'), 'Phải đọc được đáp án quiz');
    assert.ok(joined.includes('H2O'), 'Phải đọc được đáp án điền khuyết');
    assert.ok(!joined.includes('console.log'), 'Không được đọc block code');
    assert.ok(!joined.includes('skip html'), 'Không được đọc block HTML preview');
    assert.ok(!joined.includes('youtu'), 'Không được đọc URL video');
}

function testChunkingRespectsLimit() {
    const chunks = chunkSpeakableText([
        'Đoạn mở đầu. Câu thứ hai của đoạn mở đầu. Câu thứ ba tiếp tục giữ ngữ cảnh để kiểm tra việc chia đoạn hợp lý.',
        'Đoạn thứ hai khá dài để buộc bộ chia nhỏ nội dung thành nhiều phần nhưng vẫn không vượt giới hạn ký tự đã cấu hình cho audio.'
    ], 130);

    assert.ok(chunks.length >= 2, 'Nội dung dài phải được tách thành nhiều segment');
    assert.ok(chunks.every((chunk) => chunk.length <= 130), 'Mỗi segment không được vượt quá giới hạn ký tự');
    assert.ok(chunks.join(' ').includes('Đoạn mở đầu'), 'Chunk đầu ra phải giữ nguyên nội dung gốc');
    assert.ok(chunks.join(' ').includes('Đoạn thứ hai'), 'Chunk đầu ra phải giữ đủ các đoạn chính');
}

function testCacheKeyChangesWhenInputsChange() {
    const baseInput = {
        lessonId: 'lesson-1',
        updatedAt: '2026-04-25T08:00:00.000Z',
        voice: 'vi-VN-HoaiMyNeural'
    };

    const first = buildLessonTtsCacheKey(baseInput);
    const second = buildLessonTtsCacheKey({
        ...baseInput,
        updatedAt: '2026-04-25T09:00:00.000Z'
    });
    const third = buildLessonTtsCacheKey({
        ...baseInput,
        voice: 'vi-VN-NamMinhNeural'
    });

    assert.notStrictEqual(first, second, 'Sửa bài học phải tạo cache key mới');
    assert.notStrictEqual(first, third, 'Đổi voice phải tạo cache key mới');
}

async function testInFlightDeduplication() {
    let invocationCount = 0;

    const work = async () => {
        invocationCount += 1;
        await new Promise((resolve) => setTimeout(resolve, 30));
        return 'shared-result';
    };

    const [first, second] = await Promise.all([
        runInFlightDeduped('cache-key-1', work),
        runInFlightDeduped('cache-key-1', work)
    ]);

    assert.strictEqual(first, 'shared-result');
    assert.strictEqual(second, 'shared-result');
    assert.strictEqual(invocationCount, 1, 'Các request cùng cache key chỉ được chạy synthesize một lần');

    await runInFlightDeduped('cache-key-1', work);
    assert.strictEqual(invocationCount, 2, 'Sau khi promise cũ hoàn tất, lần gọi mới phải được chạy lại bình thường');
}

async function run() {
    testSpeakableExtraction();
    testChunkingRespectsLimit();
    testCacheKeyChangesWhenInputsChange();
    await testInFlightDeduplication();
    console.log('Lesson TTS OK.');
}

run().catch((error) => {
    console.error(error);
    process.exit(1);
});
