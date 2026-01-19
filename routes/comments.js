// routes/comments.js
const express = require('express');
const router = express.Router();
const commentController = require('../controllers/commentController');
const { isLoggedIn } = require('../middlewares/auth');

// Get all comments for a lesson
router.get('/lesson/:lessonId', commentController.getComments);

// Create a new comment
router.post('/lesson/:lessonId', isLoggedIn, commentController.createComment);

// Edit a comment
router.put('/:commentId', isLoggedIn, commentController.editComment);

// Delete a comment
router.delete('/:commentId', isLoggedIn, commentController.deleteComment);

// Like a comment
router.post('/:commentId/like', isLoggedIn, commentController.likeComment);

// Add reply to comment
router.post('/:commentId/replies', isLoggedIn, commentController.addReply);

// Edit reply
router.put('/:commentId/replies/:replyId', isLoggedIn, commentController.editReply);

// Delete reply
router.delete('/:commentId/replies/:replyId', isLoggedIn, commentController.deleteReply);

// Like reply
router.post('/:commentId/replies/:replyId/like', isLoggedIn, commentController.likeReply);

module.exports = router;
