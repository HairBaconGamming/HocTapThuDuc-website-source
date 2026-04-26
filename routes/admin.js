const express = require('express');
const router = express.Router();

const adminController = require('../controllers/adminController');
const { isLoggedIn, isAdmin } = require('../middlewares/auth');
const { adminCsrfGuard } = require('../middlewares/adminCsrf');

router.use(isLoggedIn, isAdmin, adminCsrfGuard);

router.get('/', adminController.redirectAdminEntry);

router.get('/overview', adminController.getOverview);
router.get('/users', adminController.getUsers);
router.get('/content/courses', adminController.getCourses);
router.get('/content/subjects', adminController.getSubjects);
router.get('/content/lessons', adminController.getLessons);
router.get('/content/lessons/:id/edit', adminController.getAdminLessonEditor);
router.get('/content/lives', adminController.getLiveSessions);
router.get('/content/news', adminController.getNews);
router.get('/content/pro-images', adminController.getProImages);
router.get('/community/questions', adminController.getQuestions);
router.get('/community/comments', adminController.getComments);
router.get('/community/guilds', adminController.getGuilds);
router.get('/community/guild-applications', adminController.getGuildApplications);
router.get('/gamification/achievements', adminController.getAchievements);
router.get('/gamification/rewards', adminController.getRewards);
router.get('/gamification/standings', adminController.getStandings);
router.get('/system/traffic', adminController.getTraffic);
router.get('/system/bans', adminController.getBans);
router.get('/system/audit', adminController.getAudit);

router.post('/users/:id/roles', adminController.updateUser);
router.post('/users/:id/ban', adminController.banUser);
router.post('/users/:id/unban', adminController.unbanUser);
router.post('/users/:id/delete', adminController.deleteUser);

router.post('/content/courses/:id/publish', adminController.approveCourse);
router.post('/content/courses/:id/delete', adminController.deleteCourse);
router.post('/content/subjects/save', adminController.saveSubject);
router.post('/content/subjects/:id/delete', adminController.deleteSubject);
router.post('/content/lessons/:id/edit', adminController.saveAdminLessonEditor);
router.post('/content/lessons/:id/publish', adminController.toggleLessonPublish);
router.post('/content/lives/:id/end', adminController.endLiveSession);
router.post('/content/lives/:id/delete', adminController.deleteLiveSession);
router.post('/content/news/save', adminController.saveNews);
router.post('/content/news/:id/delete', adminController.deleteNews);

router.post('/community/questions/:id/status', adminController.updateQuestionStatus);
router.post('/community/comments/:id/moderate', adminController.moderateComment);
router.post('/community/guild-applications/:id/review', adminController.reviewGuildApplication);

router.post('/gamification/achievements/save', adminController.saveAchievement);

// Legacy compatibility routes
router.post('/user/update', adminController.updateUser);
router.post('/user/delete', adminController.deleteUser);
router.post('/course/approve', adminController.approveCourse);
router.post('/course/delete', adminController.deleteCourse);
router.post('/subject/save', adminController.saveSubject);
router.post('/subject/delete', adminController.deleteSubject);
router.post('/news/create', adminController.createNews);
router.post('/news/delete', adminController.deleteNews);

module.exports = router;
