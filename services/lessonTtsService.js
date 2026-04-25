// Polyfill globalThis.crypto for Node 18 (msedge-tts requires the Web Crypto API global)
if (!globalThis.crypto) {
    const { webcrypto } = require('crypto');
    globalThis.crypto = webcrypto;
}

const mongoose = require('mongoose');
const { Readable } = require('stream');

const Lesson = require('../models/Lesson');
const LessonTtsSegment = require('../models/LessonTtsSegment');
const { getLessonAccessState } = require('../utils/contentAccess');
const {
    DEFAULT_TTS_MAX_SEGMENT_CHARS,
    DEFAULT_TTS_OUTPUT_FORMAT,
    TTS_EXTRACTOR_VERSION,
    extractSpeakableParagraphsFromLesson,
    chunkSpeakableText,
    buildLessonTtsCacheKey,
    escapeSsmlText
} = require('../utils/lessonTtsUtils');

const DEFAULT_TTS_VOICE = process.env.LESSON_TTS_DEFAULT_VOICE || 'vi-VN-HoaiMyNeural';
const FALLBACK_TTS_VOICE = 'vi-VN-NamMinhNeural';
const LESSON_TTS_BUCKET_NAME = 'lessonTtsAudio';

let ttsModulePromise = null;
let ttsAudioBucket = null;
const inFlightGenerations = new Map();

function createHttpError(status, message, code) {
    const error = new Error(message);
    error.status = status;
    error.code = code || 'lesson_tts_error';
    return error;
}

function getLessonSelectFields() {
    return '_id title content editorData type courseId unitId subject subjectId createdBy isPublished isPro isProOnly updatedAt';
}

function getLessonTtsBucket() {
    if (ttsAudioBucket && ttsAudioBucket.s && ttsAudioBucket.s.db) {
        return ttsAudioBucket;
    }

    if (!mongoose.connection || mongoose.connection.readyState !== 1 || !mongoose.connection.db) {
        throw createHttpError(503, 'Dịch vụ audio bài học chưa sẵn sàng.', 'lesson_tts_storage_unavailable');
    }

    ttsAudioBucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, {
        bucketName: LESSON_TTS_BUCKET_NAME
    });

    return ttsAudioBucket;
}

function buildVoiceFallbackChain(preferredVoice) {
    const voices = [preferredVoice || DEFAULT_TTS_VOICE, DEFAULT_TTS_VOICE, FALLBACK_TTS_VOICE];
    return Array.from(new Set(voices.filter(Boolean)));
}

function formatLessonAccessError(access) {
    if (access && access.needsPro) {
        return createHttpError(403, 'Bạn cần PRO để nghe audio của bài học này.', 'lesson_tts_requires_pro');
    }

    return createHttpError(403, 'Bạn không có quyền truy cập audio của bài học này.', 'lesson_tts_forbidden');
}

async function loadLessonForTts(lessonId) {
    if (!mongoose.Types.ObjectId.isValid(String(lessonId || ''))) {
        throw createHttpError(404, 'Không tìm thấy bài học để tạo audio.', 'lesson_tts_invalid_lesson');
    }

    const lesson = await Lesson.findById(lessonId).select(getLessonSelectFields()).lean();
    if (!lesson) {
        throw createHttpError(404, 'Không tìm thấy bài học để tạo audio.', 'lesson_tts_not_found');
    }
    return lesson;
}

async function assertLessonAccess(user, lessonId) {
    const lesson = await loadLessonForTts(lessonId);
    const access = await getLessonAccessState(user, lesson);

    if (!access.allowed) {
        throw formatLessonAccessError(access);
    }

    return { lesson, access };
}

async function loadMsEdgeTtsModule() {
    if (!ttsModulePromise) {
        ttsModulePromise = import('msedge-tts');
    }

    return ttsModulePromise;
}

async function readStreamToBuffer(stream) {
    const chunks = [];

    for await (const chunk of stream) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }

    return Buffer.concat(chunks);
}

async function uploadBufferToGridFs(buffer, filename, metadata) {
    const bucket = getLessonTtsBucket();
    const readable = Readable.from(buffer);

    return new Promise((resolve, reject) => {
        const uploadStream = bucket.openUploadStream(filename, {
            contentType: 'audio/mpeg',
            metadata
        });

        readable
            .pipe(uploadStream)
            .on('error', reject)
            .on('finish', () => resolve(uploadStream.id));
    });
}

async function deleteGridFsFile(fileId) {
    if (!fileId) return;

    try {
        const bucket = getLessonTtsBucket();
        await bucket.delete(fileId);
    } catch (error) {
        if (error && error.code === 'ENOENT') return;
        throw error;
    }
}

async function cleanupGeneratedArtifacts(segmentDocs = []) {
    for (const segment of segmentDocs) {
        if (segment && segment.gridFsFileId) {
            await deleteGridFsFile(segment.gridFsFileId);
        }
        if (segment && segment._id) {
            await LessonTtsSegment.deleteOne({ _id: segment._id });
        }
    }
}

async function findReadySegments(cacheKey) {
    const docs = await LessonTtsSegment.find({ cacheKey })
        .sort({ segmentIndex: 1, _id: 1 })
        .lean();

    if (!docs.length) return [];

    const expectedCount = Number(docs[0].segmentCount || 0);
    if (!expectedCount || docs.length !== expectedCount) {
        return [];
    }

    const isContiguous = docs.every((doc, index) =>
        doc.segmentIndex === index
        && doc.segmentCount === expectedCount
        && doc.gridFsFileId
    );

    return isContiguous ? docs : [];
}

function createManifestPayload({ lessonId, voice, status, segments }) {
    return {
        lessonId: String(lessonId),
        voice,
        status,
        segments: (segments || []).map((segment) => ({
            id: String(segment._id),
            index: segment.segmentIndex,
            url: `/api/lesson/tts/audio/${segment._id}`
        }))
    };
}

async function synthesizeChunkBuffer(chunk, preferredVoice, { lockVoice = false } = {}) {
    const { MsEdgeTTS, OUTPUT_FORMAT } = await loadMsEdgeTtsModule();
    const voices = lockVoice
        ? [preferredVoice].filter(Boolean)
        : buildVoiceFallbackChain(preferredVoice);
    let lastError = null;

    for (const voice of voices) {
        const tts = new MsEdgeTTS();

        try {
            await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3);
            const { audioStream, metadataStream } = await Promise.resolve(tts.toStream(escapeSsmlText(chunk)));

            if (metadataStream && typeof metadataStream.resume === 'function') {
                metadataStream.resume();
            }

            const buffer = await readStreamToBuffer(audioStream);
            tts.close();

            return { buffer, voice };
        } catch (error) {
            lastError = error;
            try {
                tts.close();
            } catch (closeError) {
                // Ignore close errors from failed TTS attempts.
            }
        }
    }

    throw lastError || createHttpError(502, 'Không thể tổng hợp audio cho bài học.', 'lesson_tts_synthesis_failed');
}

async function generateLessonTtsSegments({ lesson, preferredVoice = DEFAULT_TTS_VOICE }) {
    const paragraphs = extractSpeakableParagraphsFromLesson(lesson);
    if (!paragraphs.length) {
        return {
            voice: preferredVoice,
            cacheKey: buildLessonTtsCacheKey({
                lessonId: lesson._id,
                updatedAt: lesson.updatedAt,
                voice: preferredVoice,
                outputFormat: DEFAULT_TTS_OUTPUT_FORMAT,
                extractorVersion: TTS_EXTRACTOR_VERSION
            }),
            status: 'empty',
            segments: []
        };
    }

    const chunks = chunkSpeakableText(paragraphs, DEFAULT_TTS_MAX_SEGMENT_CHARS);
    if (!chunks.length) {
        return {
            voice: preferredVoice,
            cacheKey: buildLessonTtsCacheKey({
                lessonId: lesson._id,
                updatedAt: lesson.updatedAt,
                voice: preferredVoice,
                outputFormat: DEFAULT_TTS_OUTPUT_FORMAT,
                extractorVersion: TTS_EXTRACTOR_VERSION
            }),
            status: 'empty',
            segments: []
        };
    }

    let resolvedVoice = preferredVoice;
    const uploadedSegments = [];
    const segmentCount = chunks.length;
    const initialCacheKey = buildLessonTtsCacheKey({
        lessonId: lesson._id,
        updatedAt: lesson.updatedAt,
        voice: preferredVoice,
        outputFormat: DEFAULT_TTS_OUTPUT_FORMAT,
        extractorVersion: TTS_EXTRACTOR_VERSION
    });

    try {
        for (let index = 0; index < chunks.length; index += 1) {
            const chunk = chunks[index];
            const { buffer, voice } = await synthesizeChunkBuffer(chunk, resolvedVoice, {
                lockVoice: index > 0
            });
            resolvedVoice = voice;

            const cacheKey = buildLessonTtsCacheKey({
                lessonId: lesson._id,
                updatedAt: lesson.updatedAt,
                voice: resolvedVoice,
                outputFormat: DEFAULT_TTS_OUTPUT_FORMAT,
                extractorVersion: TTS_EXTRACTOR_VERSION
            });

            const gridFsFileId = await uploadBufferToGridFs(
                buffer,
                `${cacheKey}-${index + 1}.mp3`,
                {
                    lessonId: String(lesson._id),
                    cacheKey,
                    segmentIndex: index,
                    segmentCount,
                    voice: resolvedVoice,
                    outputFormat: DEFAULT_TTS_OUTPUT_FORMAT
                }
            );

            let doc;
            try {
                doc = await LessonTtsSegment.create({
                    lesson: lesson._id,
                    cacheKey,
                    segmentIndex: index,
                    segmentCount,
                    voice: resolvedVoice,
                    outputFormat: DEFAULT_TTS_OUTPUT_FORMAT,
                    extractorVersion: TTS_EXTRACTOR_VERSION,
                    gridFsFileId,
                    charCount: chunk.length
                });
            } catch (error) {
                await deleteGridFsFile(gridFsFileId);
                throw error;
            }

            uploadedSegments.push(doc);
        }

        return {
            voice: resolvedVoice,
            cacheKey: buildLessonTtsCacheKey({
                lessonId: lesson._id,
                updatedAt: lesson.updatedAt,
                voice: resolvedVoice,
                outputFormat: DEFAULT_TTS_OUTPUT_FORMAT,
                extractorVersion: TTS_EXTRACTOR_VERSION
            }),
            status: 'ready',
            segments: uploadedSegments
        };
    } catch (error) {
        await cleanupGeneratedArtifacts(uploadedSegments);

        if (resolvedVoice !== preferredVoice) {
            await LessonTtsSegment.deleteMany({ cacheKey: initialCacheKey });
        }

        throw error;
    }
}

function runInFlightDeduped(cacheKey, factory) {
    if (inFlightGenerations.has(cacheKey)) {
        return inFlightGenerations.get(cacheKey);
    }

    const promise = Promise.resolve()
        .then(factory)
        .finally(() => {
            if (inFlightGenerations.get(cacheKey) === promise) {
                inFlightGenerations.delete(cacheKey);
            }
        });

    inFlightGenerations.set(cacheKey, promise);
    return promise;
}

async function ensureLessonTtsManifest({ lessonId, user, preferredVoice = DEFAULT_TTS_VOICE }) {
    const { lesson } = await assertLessonAccess(user, lessonId);
    const voiceCandidates = buildVoiceFallbackChain(preferredVoice);
    const initialCacheKey = buildLessonTtsCacheKey({
        lessonId: lesson._id,
        updatedAt: lesson.updatedAt,
        voice: voiceCandidates[0],
        outputFormat: DEFAULT_TTS_OUTPUT_FORMAT,
        extractorVersion: TTS_EXTRACTOR_VERSION
    });

    let readySegments = [];

    for (const voice of voiceCandidates) {
        const cacheKey = buildLessonTtsCacheKey({
            lessonId: lesson._id,
            updatedAt: lesson.updatedAt,
            voice,
            outputFormat: DEFAULT_TTS_OUTPUT_FORMAT,
            extractorVersion: TTS_EXTRACTOR_VERSION
        });

        readySegments = await findReadySegments(cacheKey);
        if (readySegments.length > 0) {
            return createManifestPayload({
                lessonId: lesson._id,
                voice: readySegments[0].voice,
                status: 'ready',
                segments: readySegments
            });
        }
    }

    const generationResult = await runInFlightDeduped(initialCacheKey, async () => generateLessonTtsSegments({
        lesson,
        preferredVoice
    }));

    if (generationResult.status === 'empty') {
        return createManifestPayload({
            lessonId: lesson._id,
            voice: generationResult.voice,
            status: 'empty',
            segments: []
        });
    }

    readySegments = generationResult.segments.length > 0
        ? generationResult.segments
        : await findReadySegments(generationResult.cacheKey);

    return createManifestPayload({
        lessonId: lesson._id,
        voice: generationResult.voice,
        status: readySegments.length > 0 ? 'ready' : 'empty',
        segments: readySegments
    });
}

async function loadSegmentForStreaming({ segmentId, user }) {
    const segment = await LessonTtsSegment.findById(segmentId).lean();
    if (!segment) {
        throw createHttpError(404, 'Không tìm thấy segment audio của bài học.', 'lesson_tts_segment_not_found');
    }

    const { lesson } = await assertLessonAccess(user, segment.lesson);
    const currentCacheKey = buildLessonTtsCacheKey({
        lessonId: lesson._id,
        updatedAt: lesson.updatedAt,
        voice: segment.voice,
        outputFormat: segment.outputFormat || DEFAULT_TTS_OUTPUT_FORMAT,
        extractorVersion: segment.extractorVersion || TTS_EXTRACTOR_VERSION
    });

    if (segment.cacheKey !== currentCacheKey) {
        throw createHttpError(410, 'Audio bài học đã cũ, vui lòng tải lại bài học để nghe bản mới nhất.', 'lesson_tts_segment_stale');
    }

    const bucket = getLessonTtsBucket();
    return {
        lesson,
        segment,
        stream: bucket.openDownloadStream(segment.gridFsFileId)
    };
}

module.exports = {
    DEFAULT_TTS_OUTPUT_FORMAT,
    DEFAULT_TTS_VOICE,
    FALLBACK_TTS_VOICE,
    LESSON_TTS_BUCKET_NAME,
    createHttpError,
    runInFlightDeduped,
    ensureLessonTtsManifest,
    loadSegmentForStreaming
};
