// routes/admin.js
const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { isLoggedIn, isAdmin } = require('../middlewares/auth');

// --- GET: Hiển thị trang Admin ---
router.get('/', isLoggedIn, isAdmin, adminController.getAdminPanel);

// --- POST: Quản lý User ---
router.post('/user/update', isLoggedIn, isAdmin, adminController.updateUser);
router.post('/user/delete', isLoggedIn, isAdmin, adminController.deleteUser);

// --- POST: Quản lý Course ---
router.post('/course/approve', isLoggedIn, isAdmin, adminController.approveCourse);
router.post('/course/delete', isLoggedIn, isAdmin, adminController.deleteCourse);

// --- [MỚI] POST: Quản lý Subject (Môn học) ---
// Route này sẽ xử lý cả Tạo mới và Cập nhật
router.post('/subject/save', isLoggedIn, isAdmin, adminController.saveSubject); 
router.post('/subject/delete', isLoggedIn, isAdmin, adminController.deleteSubject);

// --- POST: Quản lý News ---
router.post('/news/create', isLoggedIn, isAdmin, adminController.createNews);
router.post('/news/delete', isLoggedIn, isAdmin, adminController.deleteNews);

module.exports = router;