const express = require('express');
const router = express.Router();

const qaController = require('../controllers/qaController');
const { isLoggedIn } = require('../middlewares/auth');

router.get('/', qaController.getQaHub);
router.get('/questions', qaController.getQaFeed);
router.get('/ask', isLoggedIn, qaController.getQaAskPage);
router.get('/community', qaController.getQaCommunityPage);
router.get('/questions/:id/:slug?', qaController.getQuestionDetail);

router.post('/questions', isLoggedIn, qaController.createQuestion);
router.post('/answers', isLoggedIn, qaController.createAnswer);
router.post('/answers/:id/upvote', isLoggedIn, qaController.upvoteAnswer);
router.post('/answers/:id/accept', isLoggedIn, qaController.acceptAnswer);
router.post('/answers/:id/comments', isLoggedIn, qaController.addComment);

module.exports = router;
