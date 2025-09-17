// routes/admin.js

const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { isAdmin, isTeacher, canManageUsers } = require('../middlewares/auth');

// Middleware chung: Phải là Teacher hoặc Admin mới được vào
router.use(isTeacher);

// --- Page Rendering ---
// Teacher và Admin đều có thể xem trang chính
router.get('/', adminController.renderAdminPanel);

// --- API Endpoints ---

// Dashboard (Teacher & Admin)
router.get('/api/stats', adminController.getStats);

// User Management
router.get('/api/users', adminController.getUsers); // Teacher & Admin
router.post('/api/users/:id/update', adminController.updateUser); // Teacher & Admin (logic quyền trong controller)
router.post('/api/users/:id/ban', canManageUsers, adminController.banUser); // Logic quyền phức tạp
router.post('/api/users/:id/unban', canManageUsers, adminController.unbanUser); // Logic quyền phức tạp

// Subject Management (Teacher & Admin)
router.get('/api/subjects', adminController.getSubjects);
router.post('/api/subjects', adminController.createSubject);
router.delete('/api/subjects/:id', adminController.deleteSubject);

// ===========================================
// ===== CÁC ROUTE CHỈ DÀNH CHO ADMIN =====
// ===========================================
router.use(isAdmin); // Middleware tiếp theo sẽ yêu cầu quyền Admin

// PRO Key Management (Admin only)
router.get('/api/users/pro-keys', adminController.getProKeys);
router.post('/api/users/:id/regenerate-key', adminController.regenerateProKey);

// System Actions (Admin only)
router.post('/api/trigger-ai-post', adminController.triggerAiPost);

module.exports = router;