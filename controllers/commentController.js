// controllers/commentController.js
const Comment = require('../models/Comment');
const Lesson = require('../models/Lesson');
const User = require('../models/User');

// Get all comments for a lesson
exports.getComments = async (req, res) => {
    try {
        const { lessonId } = req.params;
        const page = req.query.page || 1;
        const limit = req.query.limit || 10;
        const skip = (page - 1) * limit;

        // Verify lesson exists
        const lesson = await Lesson.findById(lessonId);
        if (!lesson) {
            return res.status(404).json({ success: false, message: 'Bài học không tồn tại' });
        }

        // Get comments with user details
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
                page: parseInt(page),
                limit: parseInt(limit),
                pages: Math.ceil(total / limit)
            }
        });
    } catch (err) {
        console.error('Get comments error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
};

// Create a new comment
exports.createComment = async (req, res) => {
    try {
        const { lessonId } = req.params;
        const { content } = req.body;
        const userId = req.user._id;

        // Validation
        if (!content || content.trim().length === 0) {
            return res.status(400).json({ success: false, message: 'Nội dung bình luận không được trống' });
        }

        if (content.length > 5000) {
            return res.status(400).json({ success: false, message: 'Nội dung bình luận tối đa 5000 ký tự' });
        }

        // Verify lesson exists
        const lesson = await Lesson.findById(lessonId);
        if (!lesson) {
            return res.status(404).json({ success: false, message: 'Bài học không tồn tại' });
        }

        // Create comment
        const comment = new Comment({
            lesson: lessonId,
            user: userId,
            content: content.trim()
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

// Edit a comment
exports.editComment = async (req, res) => {
    try {
        const { commentId } = req.params;
        const { content } = req.body;
        const userId = req.user._id;

        // Validation
        if (!content || content.trim().length === 0) {
            return res.status(400).json({ success: false, message: 'Nội dung bình luận không được trống' });
        }

        const comment = await Comment.findById(commentId);
        if (!comment) {
            return res.status(404).json({ success: false, message: 'Bình luận không tồn tại' });
        }

        // Check authorization
        if (comment.user.toString() !== userId.toString()) {
            return res.status(403).json({ success: false, message: 'Bạn không có quyền chỉnh sửa bình luận này' });
        }

        // Update comment
        comment.content = content.trim();
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

// Delete a comment
exports.deleteComment = async (req, res) => {
    try {
        const { commentId } = req.params;
        const userId = req.user._id;

        const comment = await Comment.findById(commentId);
        if (!comment) {
            return res.status(404).json({ success: false, message: 'Bình luận không tồn tại' });
        }

        // Check authorization
        if (comment.user.toString() !== userId.toString()) {
            return res.status(403).json({ success: false, message: 'Bạn không có quyền xóa bình luận này' });
        }

        // Soft delete
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

// Like a comment
exports.likeComment = async (req, res) => {
    try {
        const { commentId } = req.params;
        const userId = req.user._id;

        const comment = await Comment.findById(commentId);
        if (!comment) {
            return res.status(404).json({ success: false, message: 'Bình luận không tồn tại' });
        }

        // Check if already liked
        const alreadyLiked = comment.likedBy.some(id => id.toString() === userId.toString());

        if (alreadyLiked) {
            // Remove like
            comment.likedBy = comment.likedBy.filter(id => id.toString() !== userId.toString());
            comment.likes = Math.max(0, comment.likes - 1);
        } else {
            // Add like
            comment.likedBy.push(userId);
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

// Add reply to comment
exports.addReply = async (req, res) => {
    try {
        const { commentId } = req.params;
        const { content } = req.body;
        const userId = req.user._id;

        // Validation
        if (!content || content.trim().length === 0) {
            return res.status(400).json({ success: false, message: 'Nội dung trả lời không được trống' });
        }

        const comment = await Comment.findById(commentId);
        if (!comment) {
            return res.status(404).json({ success: false, message: 'Bình luận không tồn tại' });
        }

        // Add reply
        const reply = {
            user: userId,
            content: content.trim(),
            likes: 0,
            likedBy: [],
            createdAt: new Date()
        };

        comment.replies.push(reply);
        await comment.save();

        // Populate reply user details
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

// Edit reply
exports.editReply = async (req, res) => {
    try {
        const { commentId, replyId } = req.params;
        const { content } = req.body;
        const userId = req.user._id;

        // Validation
        if (!content || content.trim().length === 0) {
            return res.status(400).json({ success: false, message: 'Nội dung trả lời không được trống' });
        }

        const comment = await Comment.findById(commentId);
        if (!comment) {
            return res.status(404).json({ success: false, message: 'Bình luận không tồn tại' });
        }

        const reply = comment.replies.id(replyId);
        if (!reply) {
            return res.status(404).json({ success: false, message: 'Trả lời không tồn tại' });
        }

        // Check authorization
        if (reply.user.toString() !== userId.toString()) {
            return res.status(403).json({ success: false, message: 'Bạn không có quyền chỉnh sửa trả lời này' });
        }

        // Update reply
        reply.content = content.trim();
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

// Delete reply
exports.deleteReply = async (req, res) => {
    try {
        const { commentId, replyId } = req.params;
        const userId = req.user._id;

        const comment = await Comment.findById(commentId);
        if (!comment) {
            return res.status(404).json({ success: false, message: 'Bình luận không tồn tại' });
        }

        const reply = comment.replies.id(replyId);
        if (!reply) {
            return res.status(404).json({ success: false, message: 'Trả lời không tồn tại' });
        }

        // Check authorization
        if (reply.user.toString() !== userId.toString()) {
            return res.status(403).json({ success: false, message: 'Bạn không có quyền xóa trả lời này' });
        }

        // Remove reply
        comment.replies.id(replyId).remove();
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

// Like reply
exports.likeReply = async (req, res) => {
    try {
        const { commentId, replyId } = req.params;
        const userId = req.user._id;

        const comment = await Comment.findById(commentId);
        if (!comment) {
            return res.status(404).json({ success: false, message: 'Bình luận không tồn tại' });
        }

        const reply = comment.replies.id(replyId);
        if (!reply) {
            return res.status(404).json({ success: false, message: 'Trả lời không tồn tại' });
        }

        // Check if already liked
        const alreadyLiked = reply.likedBy.some(id => id.toString() === userId.toString());

        if (alreadyLiked) {
            // Remove like
            reply.likedBy = reply.likedBy.filter(id => id.toString() !== userId.toString());
            reply.likes = Math.max(0, reply.likes - 1);
        } else {
            // Add like
            reply.likedBy.push(userId);
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
