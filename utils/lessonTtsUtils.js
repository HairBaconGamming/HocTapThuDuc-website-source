const crypto = require('crypto');
const { JSDOM } = require('jsdom');
const marked = require('marked');

const { extractLessonBlocks, sanitizePlainText } = require('./lessonAnchorUtils');

const DEFAULT_TTS_MAX_SEGMENT_CHARS = 1800;
const TTS_EXTRACTOR_VERSION = 'lesson-tts-v1';
const DEFAULT_TTS_OUTPUT_FORMAT = 'audio-24khz-96kbitrate-mono-mp3';

function normalizeWhitespace(value, { preserveParagraphs = false } = {}) {
    let text = typeof value === 'string' ? value : String(value || '');
    text = text
        .replace(/\u0000/g, '')
        .replace(/[\u200B-\u200D\uFEFF]/g, '')
        .replace(/\u00A0/g, ' ')
        .replace(/\r\n?/g, '\n');

    if (preserveParagraphs) {
        text = text
            .replace(/[ \t\f\v]+/g, ' ')
            .replace(/ *\n */g, '\n')
            .replace(/\n{3,}/g, '\n\n');
    } else {
        text = text.replace(/\s+/g, ' ');
    }

    return text.trim();
}

function normalizeSpeakableText(value) {
    let text = normalizeWhitespace(value, { preserveParagraphs: true });
    text = text
        .replace(/\bhttps?:\/\/\S+/gi, ' ')
        .replace(/\bwww\.\S+/gi, ' ')
        .replace(/\s+([,.;!?])/g, '$1')
        .replace(/([,.;!?])([^\s])/g, '$1 $2')
        .replace(/\n{3,}/g, '\n\n');

    return normalizeWhitespace(text, { preserveParagraphs: true });
}

function htmlToPlainText(html) {
    const withBreakHints = String(html || '')
        .replace(/<\s*br\s*\/?>/gi, '\n')
        .replace(/<\/\s*(p|div|li|blockquote|h[1-6]|tr|section|article|ul|ol)\s*>/gi, '\n');

    const dom = new JSDOM(`<body>${withBreakHints}</body>`);
    return normalizeSpeakableText(dom.window.document.body.textContent || '');
}

function markdownToPlainText(markdown) {
    if (!markdown) return '';

    try {
        return htmlToPlainText(marked.parse(String(markdown), { gfm: true, breaks: true }));
    } catch (error) {
        return normalizeSpeakableText(markdown);
    }
}

function splitSpeakableParagraphs(value) {
    const text = normalizeSpeakableText(value);
    if (!text) return [];

    return text
        .split(/\n{2,}/)
        .map((paragraph) => normalizeSpeakableText(paragraph))
        .filter(Boolean);
}

function normalizeOptionText(option) {
    if (typeof option === 'string') return normalizeSpeakableText(option);
    if (option && typeof option === 'object') {
        return normalizeSpeakableText(option.text || option.label || option.value || option.answer || '');
    }
    return '';
}

function uniqueNonEmpty(values) {
    return Array.from(new Set((values || []).map((value) => normalizeSpeakableText(value)).filter(Boolean)));
}

function extractChoiceCorrectAnswers(question, optionTexts) {
    const answers = [];

    if (Array.isArray(question.correct)) {
        question.correct
            .map((value) => Number(value))
            .filter((value) => Number.isInteger(value) && value >= 0 && value < optionTexts.length)
            .forEach((index) => answers.push(optionTexts[index]));
    }

    if (typeof question.correctAnswer === 'string') {
        answers.push(question.correctAnswer);
    }

    if (Array.isArray(question.options)) {
        question.options.forEach((option, index) => {
            if (option && typeof option === 'object' && option.isCorrect) {
                answers.push(normalizeOptionText(option) || `Lựa chọn ${index + 1}`);
            }
        });
    }

    return uniqueNonEmpty(answers);
}

function extractFillAnswers(question) {
    const answers = [];
    const haystack = String(question.content || question.question || '');
    const matches = haystack.match(/\[(.*?)\]/g) || [];

    matches.forEach((match) => {
        const cleaned = normalizeSpeakableText(match.replace(/^\[|\]$/g, ''));
        if (cleaned) answers.push(cleaned);
    });

    if (typeof question.correctAnswer === 'string') {
        answers.push(question.correctAnswer);
    }

    return uniqueNonEmpty(answers);
}

function extractQuizParagraphs(questions = []) {
    const paragraphs = [];

    questions.forEach((question, questionIndex) => {
        if (!question || typeof question !== 'object') return;

        const prompt = markdownToPlainText(question.question || question.content || '');
        if (prompt) {
            paragraphs.push(`Câu hỏi ${questionIndex + 1}. ${prompt}`);
        }

        if (question.type === 'choice') {
            const optionTexts = (question.options || []).map((option) => normalizeOptionText(option)).filter(Boolean);
            if (optionTexts.length > 0) {
                paragraphs.push(`Các lựa chọn. ${optionTexts.map((option, optionIndex) => `Lựa chọn ${optionIndex + 1}: ${option}.`).join(' ')}`);
            }

            const correctAnswers = extractChoiceCorrectAnswers(question, optionTexts);
            if (correctAnswers.length > 0) {
                paragraphs.push(`Đáp án đúng. ${correctAnswers.join('. ')}.`);
            }
        } else if (question.type === 'fill') {
            const answers = extractFillAnswers(question);
            if (answers.length > 0) {
                paragraphs.push(`Đáp án điền chỗ trống. ${answers.join('. ')}.`);
            }
        } else if (question.type === 'matching') {
            const pairs = Array.isArray(question.pairs) ? question.pairs : [];
            if (pairs.length > 0) {
                paragraphs.push(`Ghép đôi. ${pairs.map((pair, pairIndex) => {
                    const left = normalizeSpeakableText(pair && pair.left);
                    const right = normalizeSpeakableText(pair && pair.right);
                    if (!left && !right) return '';
                    return `Cặp ${pairIndex + 1}: ${left} ghép với ${right}.`;
                }).filter(Boolean).join(' ')}`);
            }
        } else if (question.type === 'ordering') {
            const items = uniqueNonEmpty(question.items || []);
            if (items.length > 0) {
                paragraphs.push(`Thứ tự đúng. ${items.join(', ')}.`);
            }
        } else if (question.type === 'essay') {
            const sampleAnswer = markdownToPlainText(question.sampleAnswer || '');
            if (sampleAnswer) {
                paragraphs.push(`Gợi ý trả lời. ${sampleAnswer}`);
            }
        }

        const explanation = markdownToPlainText(question.explanation || '');
        if (explanation) {
            paragraphs.push(`Giải thích. ${explanation}`);
        }
    });

    return paragraphs.flatMap(splitSpeakableParagraphs);
}

function extractSpeakableParagraphsFromBlocks(lessonOrContent) {
    const blocks = extractLessonBlocks(lessonOrContent);
    if (!blocks.length) return [];

    const paragraphs = [];

    blocks.forEach((block) => {
        if (!block || typeof block !== 'object') return;

        switch (block.type) {
            case 'header':
            case 'heading':
                paragraphs.push(...splitSpeakableParagraphs(block.data && block.data.text));
                break;
            case 'text':
            case 'paragraph':
                paragraphs.push(...splitSpeakableParagraphs(markdownToPlainText(block.data && block.data.text)));
                break;
            case 'callout':
            case 'alert':
                paragraphs.push(...splitSpeakableParagraphs(`Ghi chú. ${markdownToPlainText(block.data && block.data.text)}`));
                break;
            case 'image':
                if (block.data && block.data.caption) {
                    paragraphs.push(...splitSpeakableParagraphs(`Hình minh họa. ${block.data.caption}`));
                }
                break;
            case 'document':
            case 'resource':
                if (block.data && block.data.title) {
                    paragraphs.push(...splitSpeakableParagraphs(`Tài liệu đính kèm. ${block.data.title}`));
                }
                break;
            case 'quiz':
            case 'question':
                paragraphs.push(...extractQuizParagraphs(block.data && block.data.questions));
                break;
            default:
                break;
        }
    });

    return paragraphs.map((paragraph) => normalizeSpeakableText(paragraph)).filter(Boolean);
}

function extractSpeakableParagraphsFromLesson(lesson = {}) {
    const blockParagraphs = extractSpeakableParagraphsFromBlocks(lesson);
    if (blockParagraphs.length > 0) {
        return blockParagraphs;
    }

    const legacyMarkdown = lesson && lesson.editorData && lesson.editorData.markdown;
    if (legacyMarkdown) {
        return splitSpeakableParagraphs(markdownToPlainText(legacyMarkdown));
    }

    if (typeof lesson.content === 'string') {
        return splitSpeakableParagraphs(markdownToPlainText(lesson.content));
    }

    return [];
}

function splitIntoSentenceUnits(text) {
    const normalized = normalizeSpeakableText(text);
    if (!normalized) return [];

    const matches = normalized.match(/[^.!?…\n]+(?:[.!?…]+|$)/g);
    return (matches || [normalized]).map((item) => normalizeSpeakableText(item)).filter(Boolean);
}

function splitByWords(text, maxChars) {
    const normalized = normalizeSpeakableText(text);
    if (!normalized) return [];
    if (normalized.length <= maxChars) return [normalized];

    const pieces = [];
    const words = normalized.split(/\s+/).filter(Boolean);
    let current = '';

    words.forEach((word) => {
        if (word.length > maxChars) {
            if (current) {
                pieces.push(current);
                current = '';
            }

            for (let index = 0; index < word.length; index += maxChars) {
                pieces.push(word.slice(index, index + maxChars));
            }
            return;
        }

        if (!current) {
            current = word;
            return;
        }

        if ((current.length + 1 + word.length) <= maxChars) {
            current += ` ${word}`;
            return;
        }

        pieces.push(current);
        current = word;
    });

    if (current) {
        pieces.push(current);
    }

    return pieces;
}

function splitLongParagraph(paragraph, maxChars = DEFAULT_TTS_MAX_SEGMENT_CHARS) {
    const normalized = normalizeSpeakableText(paragraph);
    if (!normalized) return [];
    if (normalized.length <= maxChars) return [normalized];

    const sentences = splitIntoSentenceUnits(normalized);
    if (sentences.length <= 1) {
        return splitByWords(normalized, maxChars);
    }

    const pieces = [];
    let current = '';

    sentences.forEach((sentence) => {
        if (sentence.length > maxChars) {
            if (current) {
                pieces.push(current);
                current = '';
            }

            splitByWords(sentence, maxChars).forEach((piece) => {
                if (piece) pieces.push(piece);
            });
            return;
        }

        if (!current) {
            current = sentence;
            return;
        }

        if ((current.length + 1 + sentence.length) <= maxChars) {
            current += ` ${sentence}`;
            return;
        }

        pieces.push(current);
        current = sentence;
    });

    if (current) {
        pieces.push(current);
    }

    return pieces;
}

function chunkSpeakableText(input, maxChars = DEFAULT_TTS_MAX_SEGMENT_CHARS) {
    const limit = Number.isInteger(maxChars) && maxChars > 120 ? maxChars : DEFAULT_TTS_MAX_SEGMENT_CHARS;
    const paragraphs = Array.isArray(input)
        ? input.map((item) => normalizeSpeakableText(item)).filter(Boolean)
        : splitSpeakableParagraphs(input);

    const chunks = [];
    let current = '';

    paragraphs.forEach((paragraph) => {
        const pieces = splitLongParagraph(paragraph, limit);
        pieces.forEach((piece) => {
            if (!current) {
                current = piece;
                return;
            }

            if ((current.length + 2 + piece.length) <= limit) {
                current += `\n\n${piece}`;
                return;
            }

            chunks.push(current);
            current = piece;
        });
    });

    if (current) {
        chunks.push(current);
    }

    return chunks;
}

function buildLessonTtsCacheKey({
    lessonId,
    updatedAt,
    voice,
    outputFormat = DEFAULT_TTS_OUTPUT_FORMAT,
    extractorVersion = TTS_EXTRACTOR_VERSION
}) {
    const safeLessonId = sanitizePlainText(lessonId, { maxLength: 120 }) || 'lesson';
    const safeUpdatedAt = updatedAt instanceof Date
        ? updatedAt.toISOString()
        : sanitizePlainText(updatedAt, { maxLength: 120, trim: true });
    const safeVoice = sanitizePlainText(voice, { maxLength: 120 }) || 'vi-VN-HoaiMyNeural';
    const safeOutputFormat = sanitizePlainText(outputFormat, { maxLength: 120 }) || DEFAULT_TTS_OUTPUT_FORMAT;
    const safeExtractorVersion = sanitizePlainText(extractorVersion, { maxLength: 120 }) || TTS_EXTRACTOR_VERSION;

    return crypto
        .createHash('sha1')
        .update([safeLessonId, safeUpdatedAt, safeVoice, safeOutputFormat, safeExtractorVersion].join('|'))
        .digest('hex');
}

function escapeSsmlText(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

module.exports = {
    DEFAULT_TTS_MAX_SEGMENT_CHARS,
    DEFAULT_TTS_OUTPUT_FORMAT,
    TTS_EXTRACTOR_VERSION,
    normalizeWhitespace,
    normalizeSpeakableText,
    htmlToPlainText,
    markdownToPlainText,
    splitSpeakableParagraphs,
    extractQuizParagraphs,
    extractSpeakableParagraphsFromBlocks,
    extractSpeakableParagraphsFromLesson,
    splitIntoSentenceUnits,
    splitLongParagraph,
    chunkSpeakableText,
    buildLessonTtsCacheKey,
    escapeSsmlText
};
