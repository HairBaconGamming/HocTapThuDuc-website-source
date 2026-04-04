const mongoose = require('mongoose');
const Lesson = require('../models/Lesson');
const Flashcard = require('../models/Flashcard');
const LessonRewardEvent = require('../models/LessonRewardEvent');
const { getLessonAccessState } = require('../utils/contentAccess');
const { sanitizePlainText } = require('../utils/lessonAnchorUtils');
const {
    normalizeCheckpointKey,
    isSupportedRewardEventType,
    countNonCompletionDrops,
    lessonHasCheckpoint,
    createRewardPresentation,
    determineRevealReward
} = require('../utils/lessonGamificationUtils');
const { grantTypedReward } = require('../services/gardenRewardService');

function sanitizeMeta(input = {}) {
    return {
        progressPercent: Math.max(0, Math.min(100, Number(input.progressPercent || 0))),
        headingLevel: Math.max(1, Math.min(4, Number(input.headingLevel || 0))),
        headingText: sanitizePlainText(input.headingText, { maxLength: 180 }),
        blockType: sanitizePlainText(input.blockType, { maxLength: 40 }).toLowerCase(),
        quality: Math.max(0, Math.min(5, Number(input.quality || 0))),
        source: sanitizePlainText(input.source, { maxLength: 40 }).toLowerCase(),
        duration: Math.max(0, Math.min(7200, Number(input.duration || 0))),
        cardId: sanitizePlainText(input.cardId, { maxLength: 64 })
    };
}

async function loadAccessibleLesson(lessonId, user) {
    const lesson = await Lesson.findById(lessonId)
        .select('_id title content courseId unitId subject subjectId createdBy isPublished isPro isProOnly')
        .lean();

    if (!lesson) {
        return { error: { status: 404, message: 'Bài học không tồn tại.' } };
    }

    const access = await getLessonAccessState(user, lesson);
    if (!access.allowed) {
        return {
            error: {
                status: access.needsPro ? 403 : 404,
                message: access.needsPro
                    ? 'Bạn cần PRO để nhận phần thưởng trong bài học này.'
                    : 'Bài học hiện không khả dụng.'
            }
        };
    }

    if (lesson.isPublished === false || access.course?.isPublished === false) {
        return { error: { status: 403, message: 'Bài học này chưa sẵn sàng để nhận thưởng.' } };
    }

    return { lesson, access };
}

function serializeRewardEvent(event) {
    const rewardType = event.rewardType || 'water';
    const rewardAmount = Number(event.rewardAmount || 0);
    const sourceLabel = sanitizePlainText(event.meta?.sourceLabel, { maxLength: 120 }) || 'Kho báu bài học';

    return {
        _id: String(event._id),
        lessonId: String(event.lesson),
        eventType: event.eventType,
        checkpointKey: event.checkpointKey,
        rewardType,
        rewardAmount,
        status: event.status,
        revealedAt: event.revealedAt,
        claimedAt: event.claimedAt,
        presentation: createRewardPresentation(rewardType, rewardAmount, sourceLabel),
        meta: {
            headingText: sanitizePlainText(event.meta?.headingText, { maxLength: 180 }),
            headingLevel: Number(event.meta?.headingLevel || 0),
            source: sanitizePlainText(event.meta?.source, { maxLength: 40 }),
            sourceLabel
        }
    };
}

async function validateFlashcardScope(userId, lessonId, meta) {
    if (!meta.cardId) {
        return { error: { status: 400, message: 'Thiếu cardId cho checkpoint flashcard.' } };
    }

    const card = await Flashcard.findOne({
        _id: meta.cardId,
        user: userId,
        lesson: lessonId,
        sourceType: 'inline_selection'
    }).select('_id anchor').lean();

    if (!card) {
        return { error: { status: 404, message: 'Checkpoint flashcard không còn hợp lệ.' } };
    }

    return { card };
}

exports.listPendingRewards = async (req, res) => {
    try {
        const context = await loadAccessibleLesson(req.params.lessonId, req.user);
        if (context.error) {
            return res.status(context.error.status).json({ success: false, message: context.error.message });
        }

        const rewards = await LessonRewardEvent.find({
            user: req.user._id,
            lesson: req.params.lessonId,
            status: 'revealed'
        })
            .sort({ revealedAt: -1 })
            .limit(6)
            .lean();

        res.json({
            success: true,
            rewards: rewards.map(serializeRewardEvent)
        });
    } catch (error) {
        console.error('List pending rewards error:', error);
        res.status(500).json({ success: false, message: 'Không thể tải phần thưởng bài học.' });
    }
};

exports.revealReward = async (req, res) => {
    try {
        const eventType = sanitizePlainText(req.body.eventType, { maxLength: 40 }).toLowerCase();
        if (!isSupportedRewardEventType(eventType) || eventType === 'lesson_completed') {
            return res.status(400).json({ success: false, message: 'Loại checkpoint thưởng không hợp lệ.' });
        }

        const context = await loadAccessibleLesson(req.params.lessonId, req.user);
        if (context.error) {
            return res.status(context.error.status).json({ success: false, message: context.error.message });
        }

        const meta = sanitizeMeta(req.body.meta || {});
        let checkpointKey = normalizeCheckpointKey(req.body.checkpointKey);

        if (eventType === 'flashcard_review') {
            const flashcardScope = await validateFlashcardScope(req.user._id, req.params.lessonId, meta);
            if (flashcardScope.error) {
                return res.status(flashcardScope.error.status).json({ success: false, message: flashcardScope.error.message });
            }
            checkpointKey = normalizeCheckpointKey(flashcardScope.card.anchor?.blockKey || checkpointKey || `inline-flashcard-${flashcardScope.card._id}`);
        }

        if (!checkpointKey) {
            return res.status(400).json({ success: false, message: 'Thiếu checkpointKey cho phần thưởng.' });
        }

        if ((eventType === 'scroll_checkpoint' || eventType === 'video_finished' || eventType === 'quiz_passed')
            && !lessonHasCheckpoint(context.lesson, checkpointKey)) {
            return res.status(400).json({ success: false, message: 'Checkpoint không còn khớp với bài học hiện tại.' });
        }

        const existing = await LessonRewardEvent.findOne({
            user: req.user._id,
            lesson: req.params.lessonId,
            eventType,
            checkpointKey
        }).lean();

        if (existing) {
            return res.json({
                success: true,
                revealed: existing.status === 'revealed',
                alreadyKnown: true,
                reward: serializeRewardEvent(existing)
            });
        }

        const existingDrops = await LessonRewardEvent.find({
            user: req.user._id,
            lesson: req.params.lessonId,
            eventType: { $ne: 'lesson_completed' },
            status: { $in: ['revealed', 'claiming', 'claimed'] }
        }).select('eventType').lean();

        const reward = determineRevealReward({
            userId: String(req.user._id),
            lessonId: String(req.params.lessonId),
            eventType,
            checkpointKey,
            meta,
            existingRewardCount: countNonCompletionDrops(existingDrops)
        });

        if (!reward) {
            return res.json({ success: true, revealed: false });
        }

        const eventDoc = await LessonRewardEvent.create({
            user: req.user._id,
            lesson: req.params.lessonId,
            eventType,
            checkpointKey,
            rewardType: reward.rewardType,
            rewardAmount: reward.rewardAmount,
            status: 'revealed',
            meta: {
                ...meta,
                sourceLabel: reward.sourceLabel
            }
        });

        res.status(201).json({
            success: true,
            revealed: true,
            reward: serializeRewardEvent(eventDoc.toObject())
        });
    } catch (error) {
        if (error?.code === 11000) {
            const existing = await LessonRewardEvent.findOne({
                user: req.user._id,
                lesson: req.params.lessonId,
                eventType: sanitizePlainText(req.body.eventType, { maxLength: 40 }).toLowerCase(),
                checkpointKey: normalizeCheckpointKey(req.body.checkpointKey)
            }).lean();

            return res.json({
                success: true,
                revealed: existing?.status === 'revealed',
                alreadyKnown: true,
                reward: existing ? serializeRewardEvent(existing) : null
            });
        }

        console.error('Reveal reward error:', error);
        res.status(500).json({ success: false, message: 'Không thể bật kho báu ẩn lúc này.' });
    }
};

exports.claimReward = async (req, res) => {
    try {
        const reveal = await LessonRewardEvent.findOneAndUpdate(
            {
                _id: req.params.rewardId,
                user: req.user._id,
                status: 'revealed'
            },
            {
                $set: {
                    status: 'claiming',
                    claimedAt: new Date(),
                    'meta.claimToken': new mongoose.Types.ObjectId().toString()
                }
            },
            { new: true }
        );

        if (!reveal) {
            const existing = await LessonRewardEvent.findOne({
                _id: req.params.rewardId,
                user: req.user._id
            }).lean();

            if (!existing) {
                return res.status(404).json({ success: false, message: 'Phần thưởng không tồn tại.' });
            }

            if (existing.status === 'claimed') {
                return res.json({
                    success: true,
                    alreadyClaimed: true,
                    reward: serializeRewardEvent(existing)
                });
            }

            return res.status(409).json({
                success: false,
                message: 'Phần thưởng đang được xử lý, vui lòng thử lại ngay sau đó.'
            });
        }

        const context = await loadAccessibleLesson(reveal.lesson, req.user);
        if (context.error) {
            await LessonRewardEvent.updateOne(
                { _id: reveal._id, user: req.user._id, status: 'claiming' },
                { $set: { status: 'revealed', claimedAt: null }, $unset: { 'meta.claimToken': 1 } }
            );
            return res.status(context.error.status).json({ success: false, message: context.error.message });
        }

        const garden = await grantTypedReward(req.user._id, reveal.rewardType, reveal.rewardAmount);
        const claimToken = reveal.meta?.claimToken;

        const claimedEvent = await LessonRewardEvent.findOneAndUpdate(
            { _id: reveal._id, user: req.user._id, status: 'claiming', 'meta.claimToken': claimToken },
            { $set: { status: 'claimed' }, $unset: { 'meta.claimToken': 1 } },
            { new: true }
        );

        res.json({
            success: true,
            alreadyClaimed: false,
            reward: serializeRewardEvent((claimedEvent || reveal).toObject ? (claimedEvent || reveal).toObject() : (claimedEvent || reveal)),
            balances: {
                water: Number(garden.water || 0),
                fertilizer: Number(garden.fertilizer || 0),
                gold: Number(garden.gold || 0)
            }
        });
    } catch (error) {
        console.error('Claim reward error:', error);
        await LessonRewardEvent.updateOne(
            { _id: req.params.rewardId, user: req.user._id, status: 'claiming' },
            { $set: { status: 'revealed', claimedAt: null }, $unset: { 'meta.claimToken': 1 } }
        );
        res.status(500).json({ success: false, message: 'Không thể nhận phần thưởng lúc này.' });
    }
};
