const LessonAnnotation = require('../models/LessonAnnotation');
const Lesson = require('../models/Lesson');
const { getLessonAccessState } = require('../utils/contentAccess');
const {
    normalizeAnchorInput,
    normalizeHighlightColor,
    sanitizePlainText,
    validateAnchorAgainstLesson,
    rangesOverlap
} = require('../utils/lessonAnchorUtils');

async function loadAccessibleLesson(req, lessonId) {
    const lesson = await Lesson.findById(lessonId)
        .select('_id courseId createdBy isPublished isPro isProOnly content updatedAt')
        .lean();

    if (!lesson) {
        return { error: { status: 404, message: 'Bài học không tồn tại.' } };
    }

    const access = await getLessonAccessState(req.user, lesson);
    if (!access.allowed) {
        return {
            error: {
                status: access.needsPro ? 403 : 404,
                message: access.needsPro ? 'Bạn cần PRO để dùng tính năng này trong bài học.' : 'Bài học hiện không khả dụng.'
            }
        };
    }

    return { lesson, access };
}

function buildRevisionKey(lesson) {
    return lesson?.updatedAt ? String(new Date(lesson.updatedAt).getTime()) : '';
}

exports.listAnnotations = async (req, res) => {
    try {
        const { lessonId } = req.params;
        const context = await loadAccessibleLesson(req, lessonId);
        if (context.error) {
            return res.status(context.error.status).json({ success: false, message: context.error.message });
        }

        const annotations = await LessonAnnotation.find({
            lesson: lessonId,
            user: req.user._id
        })
            .sort({ createdAt: 1 })
            .lean();

        res.json({
            success: true,
            annotations,
            revisionKey: buildRevisionKey(context.lesson)
        });
    } catch (error) {
        console.error('List annotations error:', error);
        res.status(500).json({ success: false, message: 'Không thể tải ghi chú tại chỗ.' });
    }
};

exports.createAnnotation = async (req, res) => {
    try {
        const { lessonId } = req.params;
        const context = await loadAccessibleLesson(req, lessonId);
        if (context.error) {
            return res.status(context.error.status).json({ success: false, message: context.error.message });
        }

        const kind = sanitizePlainText(req.body.kind, { maxLength: 20 }).toLowerCase();
        if (!['highlight', 'note'].includes(kind)) {
            return res.status(400).json({ success: false, message: 'Loại annotation không hợp lệ.' });
        }

        const anchor = normalizeAnchorInput(req.body.anchor);
        if (!validateAnchorAgainstLesson(anchor, context.lesson)) {
            return res.status(400).json({ success: false, message: 'Neo văn bản không còn khớp với bài học hiện tại.' });
        }

        const note = sanitizePlainText(req.body.note, { maxLength: 2000 });
        if (kind === 'note' && !note) {
            return res.status(400).json({ success: false, message: 'Ghi chú không được để trống.' });
        }

        const existingAnnotations = await LessonAnnotation.find({
            lesson: lessonId,
            user: req.user._id,
            'anchor.blockKey': anchor.blockKey
        }).select('anchor').lean();

        const overlapsExisting = existingAnnotations.some((annotation) => rangesOverlap(annotation.anchor, anchor));
        if (overlapsExisting) {
            return res.status(409).json({
                success: false,
                message: 'Đoạn này đang chồng với một highlight hoặc ghi chú khác. Hãy chọn một khoảng khác rõ ràng hơn.'
            });
        }

        const annotation = await LessonAnnotation.create({
            lesson: lessonId,
            user: req.user._id,
            revisionKey: buildRevisionKey(context.lesson),
            kind,
            color: normalizeHighlightColor(req.body.color),
            note,
            anchor
        });

        res.status(201).json({
            success: true,
            annotation
        });
    } catch (error) {
        console.error('Create annotation error:', error);
        res.status(500).json({ success: false, message: error.message || 'Không thể tạo ghi chú.' });
    }
};

exports.updateAnnotation = async (req, res) => {
    try {
        const { annotationId } = req.params;
        const annotation = await LessonAnnotation.findById(annotationId);
        if (!annotation) {
            return res.status(404).json({ success: false, message: 'Không tìm thấy annotation.' });
        }

        if (String(annotation.user) !== String(req.user._id)) {
            return res.status(403).json({ success: false, message: 'Bạn không có quyền cập nhật annotation này.' });
        }

        const context = await loadAccessibleLesson(req, annotation.lesson);
        if (context.error) {
            return res.status(context.error.status).json({ success: false, message: context.error.message });
        }

        if (req.body.color !== undefined) {
            annotation.color = normalizeHighlightColor(req.body.color);
        }

        if (req.body.note !== undefined) {
            annotation.note = sanitizePlainText(req.body.note, { maxLength: 2000 });
            if (annotation.kind === 'note' && !annotation.note) {
                return res.status(400).json({ success: false, message: 'Ghi chú không được để trống.' });
            }
        }

        await annotation.save();

        res.json({
            success: true,
            annotation
        });
    } catch (error) {
        console.error('Update annotation error:', error);
        res.status(500).json({ success: false, message: 'Không thể cập nhật annotation.' });
    }
};

exports.deleteAnnotation = async (req, res) => {
    try {
        const { annotationId } = req.params;
        const annotation = await LessonAnnotation.findById(annotationId);
        if (!annotation) {
            return res.status(404).json({ success: false, message: 'Không tìm thấy annotation.' });
        }

        if (String(annotation.user) !== String(req.user._id)) {
            return res.status(403).json({ success: false, message: 'Bạn không có quyền xóa annotation này.' });
        }

        await annotation.deleteOne();
        res.json({ success: true });
    } catch (error) {
        console.error('Delete annotation error:', error);
        res.status(500).json({ success: false, message: 'Không thể xóa annotation.' });
    }
};
