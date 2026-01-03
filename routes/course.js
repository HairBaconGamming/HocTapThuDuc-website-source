const express = require('express');
const router = express.Router();
const { isAdmin, isTeacher } = require('../middlewares/auth');
const courseController = require('../controllers/courseController');
const unitController = require('../controllers/unitController');

// Các route này sẽ được prefix là /api trong server.js

// 1. Lấy danh sách khóa học theo môn
router.get('/courses/by-subject/:subjectId', courseController.getCoursesBySubject);

// 2. Tạo khóa học nhanh
router.post('/courses/quick-create', isTeacher, courseController.createQuickCourse);

// 3. Lấy cấu trúc cây (Tree)
router.get('/tree/by-course/:courseId', courseController.getTreeByCourse);

// 4. Hủy bản nháp
router.post('/course/:courseId/discard-draft', isTeacher, courseController.discardDraft);

// 5. Route cũ (Lấy Unit theo môn)
router.get('/units/:subjectId', unitController.getUnitsBySubject);

router.post('/course/:courseId/delete', isTeacher, courseController.deleteCourse);

// Route lấy thông tin
router.get('/course/:courseId/details', isTeacher, courseController.getCourseDetails);

// Route cập nhật thông tin
router.post('/course/:courseId/update', isTeacher, courseController.updateCourse);

// New routes for publication management
router.post('/course/status', isTeacher, courseController.updateCourseStatus);
router.post('/unit/bulk-status', isTeacher, courseController.bulkUpdateUnitStatus);

module.exports = router;
