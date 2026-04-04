const Comment = require('../models/Comment');
const Lesson = require('../models/Lesson');
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

    const access = await getLessonAccessState(user || null, lesson);
    if (!access.allowed) {
        return {
            error: {
                status: access.needsPro ? 403 : 404,
                message: access.needsPro
                    ? 'Bạn cần PRO để truy cập thảo luận của bài học này'
                    : 'Bài học hiện không khả dụng'
            }
        };
    }

    return { lesson, access };
}

async function loadCommentScope(commentId, user) {
    const comment = await Comment.findById(commentId);
    if (!comment) {
        return { error: { status: 404, message: 'Bình luận không tồn tại' } };
    }

    const lessonContext = await loadAccessibleLesson(comment.lesson, user);
    if (lessonContext.error) {
        return { error: lessonContext.error };
    }

    return { comment, lesson: lessonContext.lesson, access: lessonContext.access };
}

exports.getComments = async (req, res) => {
    try {
        const { lessonId } = req.params;
        const page = Math.max(1, parseInt(req.query.page || 1, 10));
        const limit = Math.min(50, Math.max(1, parseInt(req.query.limit || 10, 10)));
        const skip = (page - 1) * limit;

        const context = await loadAccessibleLesson(lessonId, req.user || null);
        if (context.error) {
            return res.status(context.error.status).json({ success: false, message: context.error.message });
        }

        const comments = await Comment.find({ lesson: lessonId, isDeleted: false })
            .populate('user', 'username avatar')
            .populate('replies.user', 'username avatar')
            .populate('likedBy', 'username')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean();

        const total = await Comment.countDocuments({ lesson: lessonId, isDeleted: false });

        res.json({
            success: true,
            comments,
            pagination: {
                total,
                page,
                limit,
                pages: Math.ceil(total / limit)
            }
        });
    } catch (err) {
        console.error('Get comments error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
};

exports.createComment = async (req, res) => {
    try {
        const { lessonId } = req.params;
        const cleanContent = sanitizePlainText(req.body.content, { maxLength: 5000 });

        if (!cleanContent) {
            return res.status(400).json({ success: false, message: 'Nội dung bình luận không được trống' });
        }

        const context = await loadAccessibleLesson(lessonId, req.user);
        if (context.error) {
            return res.status(context.error.status).json({ success: false, message: context.error.message });
        }

        let contextAnchor = null;
        if (req.body.contextAnchor) {
            contextAnchor = normalizeAnchorInput(req.body.contextAnchor);
            if (!validateAnchorAgainstLesson(contextAnchor, context.lesson)) {
                return res.status(400).json({ success: false, message: 'Đoạn trích không còn khớp với bài học hiện tại' });
            }
        }

        const comment = new Comment({
            lesson: lessonId,
            user: req.user._id,
            content: cleanContent,
            contextAnchor
        });

        await comment.save();
        await comment.populate('user', 'username avatar');

        res.status(201).json({
            success: true,
            message: 'Bình luận thành công',
            comment
        });
    } catch (err) {
        console.error('Create comment error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
};

exports.editComment = async (req, res) => {
    try {
        const cleanContent = sanitizePlainText(req.body.content, { maxLength: 5000 });
        if (!cleanContent) {
            return res.status(400).json({ success: false, message: 'Nội dung bình luận không được trống' });
        }

        const scope = await loadCommentScope(req.params.commentId, req.user);
        if (scope.error) {
            return res.status(scope.error.status).json({ success: false, message: scope.error.message });
        }

        const { comment } = scope;
        if (String(comment.user) !== String(req.user._id)) {
            return res.status(403).json({ success: false, message: 'Bạn không có quyền chỉnh sửa bình luận này' });
        }

        comment.content = cleanContent;
        comment.isEdited = true;
        comment.editedAt = new Date();
        await comment.save();

        res.json({
            success: true,
            message: 'Chỉnh sửa bình luận thành công',
            comment
        });
    } catch (err) {
        console.error('Edit comment error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
};

exports.deleteComment = async (req, res) => {
    try {
        const scope = await loadCommentScope(req.params.commentId, req.user);
        if (scope.error) {
            return res.status(scope.error.status).json({ success: false, message: scope.error.message });
        }

        const { comment } = scope;
        if (String(comment.user) !== String(req.user._id)) {
            return res.status(403).json({ success: false, message: 'Bạn không có quyền xóa bình luận này' });
        }

        comment.isDeleted = true;
        comment.deletedAt = new Date();
        await comment.save();

        res.json({
            success: true,
            message: 'Xóa bình luận thành công'
        });
    } catch (err) {
        console.error('Delete comment error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
};

exports.likeComment = async (req, res) => {
    try {
        const scope = await loadCommentScope(req.params.commentId, req.user);
        if (scope.error) {
            return res.status(scope.error.status).json({ success: false, message: scope.error.message });
        }

        const { comment } = scope;
        const alreadyLiked = comment.likedBy.some((id) => String(id) === String(req.user._id));

        if (alreadyLiked) {
            comment.likedBy = comment.likedBy.filter((id) => String(id) !== String(req.user._id));
            comment.likes = Math.max(0, comment.likes - 1);
        } else {
            comment.likedBy.push(req.user._id);
            comment.likes += 1;
        }

        await comment.save();

        res.json({
            success: true,
            message: alreadyLiked ? 'Bỏ thích bình luận' : 'Thích bình luận',
            likes: comment.likes,
            isLiked: !alreadyLiked
        });
    } catch (err) {
        console.error('Like comment error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
};

exports.addReply = async (req, res) => {
    try {
        const cleanContent = sanitizePlainText(req.body.content, { maxLength: 5000 });
        if (!cleanContent) {
            return res.status(400).json({ success: false, message: 'Nội dung trả lời không được trống' });
        }

        const scope = await loadCommentScope(req.params.commentId, req.user);
        if (scope.error) {
            return res.status(scope.error.status).json({ success: false, message: scope.error.message });
        }

        const { comment } = scope;
        comment.replies.push({
            user: req.user._id,
            content: cleanContent,
            likes: 0,
            likedBy: [],
            createdAt: new Date(),
            updatedAt: new Date()
        });

        await comment.save();
        await comment.populate('replies.user', 'username avatar');

        res.status(201).json({
            success: true,
            message: 'Trả lời thành công',
            reply: comment.replies[comment.replies.length - 1]
        });
    } catch (err) {
        console.error('Add reply error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
};

exports.editReply = async (req, res) => {
    try {
        const cleanContent = sanitizePlainText(req.body.content, { maxLength: 5000 });
        if (!cleanContent) {
            return res.status(400).json({ success: false, message: 'Nội dung trả lời không được trống' });
        }

        const scope = await loadCommentScope(req.params.commentId, req.user);
        if (scope.error) {
            return res.status(scope.error.status).json({ success: false, message: scope.error.message });
        }

        const { comment } = scope;
        const reply = comment.replies.id(req.params.replyId);
        if (!reply) {
            return res.status(404).json({ success: false, message: 'Trả lời không tồn tại' });
        }

        if (String(reply.user) !== String(req.user._id)) {
            return res.status(403).json({ success: false, message: 'Bạn không có quyền chỉnh sửa trả lời này' });
        }

        reply.content = cleanContent;
        reply.updatedAt = new Date();
        await comment.save();

        res.json({
            success: true,
            message: 'Chỉnh sửa trả lời thành công',
            reply
        });
    } catch (err) {
        console.error('Edit reply error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
};

exports.deleteReply = async (req, res) => {
    try {
        const scope = await loadCommentScope(req.params.commentId, req.user);
        if (scope.error) {
            return res.status(scope.error.status).json({ success: false, message: scope.error.message });
        }

        const { comment } = scope;
        const reply = comment.replies.id(req.params.replyId);
        if (!reply) {
            return res.status(404).json({ success: false, message: 'Trả lời không tồn tại' });
        }

        if (String(reply.user) !== String(req.user._id)) {
            return res.status(403).json({ success: false, message: 'Bạn không có quyền xóa trả lời này' });
        }

        comment.replies.pull({ _id: req.params.replyId });
        await comment.save();

        res.json({
            success: true,
            message: 'Xóa trả lời thành công'
        });
    } catch (err) {
        console.error('Delete reply error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
};

exports.likeReply = async (req, res) => {
    try {
        const scope = await loadCommentScope(req.params.commentId, req.user);
        if (scope.error) {
            return res.status(scope.error.status).json({ success: false, message: scope.error.message });
        }

        const { comment } = scope;
        const reply = comment.replies.id(req.params.replyId);
        if (!reply) {
            return res.status(404).json({ success: false, message: 'Trả lời không tồn tại' });
        }

        const alreadyLiked = reply.likedBy.some((id) => String(id) === String(req.user._id));
        if (alreadyLiked) {
            reply.likedBy = reply.likedBy.filter((id) => String(id) !== String(req.user._id));
            reply.likes = Math.max(0, reply.likes - 1);
        } else {
            reply.likedBy.push(req.user._id);
            reply.likes += 1;
        }

        await comment.save();

        res.json({
            success: true,
            message: alreadyLiked ? 'Bỏ thích trả lời' : 'Thích trả lời',
            likes: reply.likes,
            isLiked: !alreadyLiked
        });
    } catch (err) {
        console.error('Like reply error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
};
