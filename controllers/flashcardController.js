const Flashcard = require('../models/Flashcard');
const Lesson = require('../models/Lesson');
const { grantFertilizer } = require('../services/gardenRewardService');
const { getLessonAccessState } = require('../utils/contentAccess');
const {
    normalizeAnchorInput,
    sanitizePlainText,
    validateAnchorAgainstLesson
} = require('../utils/lessonAnchorUtils');

async function loadAccessibleLesson(lessonId, user) {
    const lesson = await Lesson.findById(lessonId)
        .select('_id courseId createdBy isPublished isPro isProOnly content')
        .lean();

    if (!lesson) {
        return { error: { status: 404, message: 'Bài học không tồn tại' } };
    }

    const access = await getLessonAccessState(user, lesson);
    if (!access.allowed) {
        return {
            error: {
                status: access.needsPro ? 403 : 404,
                message: access.needsPro ? 'Bạn cần PRO để dùng thẻ học trong bài này.' : 'Bài học hiện không khả dụng.'
            }
        };
    }

    return { lesson, access };
}

exports.getReviewSession = async (req, res) => {
    try {
        const today = new Date();
        const limitPerSession = 30;
        const courseId = String(req.query.courseId || '').trim();
        const query = {
            user: req.user._id,
            nextReviewDate: { $lte: today }
        };

        if (courseId) {
            const lessonIds = await Lesson.find({ courseId }).distinct('_id');
            if (lessonIds.length === 0) {
                return res.json({
                    success: true,
                    cards: [],
                    remaining: 0
                });
            }
            query.lesson = { $in: lessonIds };
        }

        const cards = await Flashcard.find(query)
            .sort({ nextReviewDate: 1 })
            .limit(limitPerSession)
            .populate({
                path: 'lesson',
                select: 'title subject',
                populate: { path: 'subject', select: 'name' }
            });

        const shuffledCards = cards.sort(() => Math.random() - 0.5);

        res.json({
            success: true,
            cards: shuffledCards,
            remaining: Math.max(0, cards.length - limitPerSession)
        });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
};

exports.processReview = async (req, res) => {
    try {
        const { cardId, quality } = req.body;
        const card = await Flashcard.findById(cardId);
        if (!card) return res.status(404).json({ error: 'Thẻ không tồn tại' });

        const q = parseInt(quality, 10);

        if (q >= 3) {
            if (card.repetition === 0) card.interval = 1;
            else if (card.repetition === 1) card.interval = 6;
            else card.interval = Math.round(card.interval * card.efactor);
            card.repetition += 1;
        } else {
            card.repetition = 0;
            card.interval = 1;
        }

        card.efactor = card.efactor + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
        if (card.efactor < 1.3) card.efactor = 1.3;

        const nextDate = new Date();
        nextDate.setDate(nextDate.getDate() + card.interval);
        card.nextReviewDate = nextDate;

        await card.save();

        let bonusFertilizer = 0;
        if (q >= 3 && Math.random() < 0.3) {
            bonusFertilizer = 1;
            await grantFertilizer(req.user._id, 1);
        }

        res.json({ success: true, nextDate, bonusFertilizer });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
};

exports.createCard = async (req, res) => {
    try {
        const { lessonId } = req.body;
        const front = sanitizePlainText(req.body.front, { maxLength: 240 });
        const back = sanitizePlainText(req.body.back, { maxLength: 2000 });

        if (!front || !back) {
            return res.status(400).json({ success: false, message: 'Thẻ học cần đủ mặt trước và mặt sau.' });
        }

        const context = await loadAccessibleLesson(lessonId, req.user);
        if (context.error) {
            return res.status(context.error.status).json({ success: false, message: context.error.message });
        }

        await Flashcard.create({
            user: req.user._id,
            lesson: lessonId,
            front,
            back
        });

        res.json({ success: true, message: 'Đã tạo thẻ!' });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
};

exports.getInlineCheckpoints = async (req, res) => {
    try {
        const { lessonId } = req.params;
        const context = await loadAccessibleLesson(lessonId, req.user);
        if (context.error) {
            return res.status(context.error.status).json({ success: false, message: context.error.message });
        }

        const cards = await Flashcard.find({
            user: req.user._id,
            lesson: lessonId,
            sourceType: 'inline_selection'
        })
            .sort({ createdAt: 1 })
            .lean();

        res.json({ success: true, cards });
    } catch (error) {
        console.error('Get inline checkpoints error:', error);
        res.status(500).json({ success: false, message: 'Không thể tải flashcard trong bài.' });
    }
};

exports.createInlineCheckpoint = async (req, res) => {
    try {
        const { lessonId } = req.params;
        const context = await loadAccessibleLesson(lessonId, req.user);
        if (context.error) {
            return res.status(context.error.status).json({ success: false, message: context.error.message });
        }

        const front = sanitizePlainText(req.body.front, { maxLength: 240 });
        const back = sanitizePlainText(req.body.back, { maxLength: 2000 });
        if (!front || !back) {
            return res.status(400).json({ success: false, message: 'Flashcard cần đủ mặt trước và mặt sau.' });
        }

        const anchor = normalizeAnchorInput(req.body.anchor);
        if (!validateAnchorAgainstLesson(anchor, context.lesson)) {
            return res.status(400).json({ success: false, message: 'Checkpoint không còn khớp với bài học hiện tại.' });
        }

        const existing = await Flashcard.findOne({
            user: req.user._id,
            lesson: lessonId,
            sourceType: 'inline_selection',
            front,
            back,
            'anchor.quoteHash': anchor.quoteHash
        }).lean();

        if (existing) {
            return res.json({ success: true, created: false, card: existing });
        }

        const card = await Flashcard.create({
            user: req.user._id,
            lesson: lessonId,
            front,
            back,
            sourceType: 'inline_selection',
            anchor
        });

        res.status(201).json({ success: true, created: true, card });
    } catch (error) {
        console.error('Create inline checkpoint error:', error);
        res.status(500).json({ success: false, message: error.message || 'Không thể tạo flashcard trong bài.' });
    }
};

exports.updateCard = async (req, res) => {
    try {
        const { id } = req.params;
        const front = sanitizePlainText(req.body.front, { maxLength: 240 });
        const back = sanitizePlainText(req.body.back, { maxLength: 2000 });

        if (!front || !back) {
            return res.status(400).json({ success: false, message: 'Flashcard cần đủ mặt trước và mặt sau.' });
        }

        const card = await Flashcard.findOneAndUpdate(
            { _id: id, user: req.user._id },
            { front, back },
            { new: true }
        );

        if (!card) {
            return res.status(404).json({ success: false, message: 'Thẻ không tồn tại hoặc bạn không có quyền sửa.' });
        }

        res.json({ success: true, card });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
};

exports.deleteCard = async (req, res) => {
    try {
        const { id } = req.params;
        const card = await Flashcard.findOneAndDelete({ _id: id, user: req.user._id });
        if (!card) {
            return res.status(404).json({ success: false, message: 'Thẻ không tồn tại hoặc bạn không có quyền xóa.' });
        }
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
};

