const express = require('express');
const router = express.Router();
const flashcardController = require('../controllers/flashcardController');
const { isLoggedIn } = require('../middlewares/auth');

router.get('/review', isLoggedIn, flashcardController.getReviewSession);
router.post('/submit', isLoggedIn, flashcardController.processReview);
router.post('/create', isLoggedIn, flashcardController.createCard);
router.get('/lesson/:lessonId/inline', isLoggedIn, flashcardController.getInlineCheckpoints);
router.post('/lesson/:lessonId/inline', isLoggedIn, flashcardController.createInlineCheckpoint);
router.put('/:id', isLoggedIn, flashcardController.updateCard);
router.delete('/:id', isLoggedIn, flashcardController.deleteCard);

module.exports = router;
