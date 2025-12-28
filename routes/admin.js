const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { isLoggedIn, isAdmin } = require('../middlewares/auth'); // Giả sử bạn có middleware này

// --- GET: Hiển thị trang Admin ---
router.get('/', isLoggedIn, isAdmin, adminController.getAdminPanel);

// --- POST: Quản lý User ---
router.post('/user/update', isLoggedIn, isAdmin, adminController.updateUser);
router.post('/user/delete', isLoggedIn, isAdmin, adminController.deleteUser);

// --- POST: Quản lý Course ---
router.post('/course/approve', isLoggedIn, isAdmin, adminController.approveCourse);
router.post('/course/delete', isLoggedIn, isAdmin, adminController.deleteCourse);

// --- POST: Quản lý News (Tin tức) ---
router.post('/news/create', isLoggedIn, isAdmin, adminController.createNews);
router.post('/news/delete', isLoggedIn, isAdmin, adminController.deleteNews);

module.exports = router;