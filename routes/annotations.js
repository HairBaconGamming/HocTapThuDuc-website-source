const express = require('express');
const router = express.Router();
const annotationController = require('../controllers/annotationController');
const { isLoggedIn } = require('../middlewares/auth');

router.get('/lesson/:lessonId', isLoggedIn, annotationController.listAnnotations);
router.post('/lesson/:lessonId', isLoggedIn, annotationController.createAnnotation);
router.put('/:annotationId', isLoggedIn, annotationController.updateAnnotation);
router.delete('/:annotationId', isLoggedIn, annotationController.deleteAnnotation);

module.exports = router;
