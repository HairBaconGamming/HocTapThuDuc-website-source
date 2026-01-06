const express = require('express');
const router = express.Router();
const gardenController = require('../controllers/gardenController');
const { isLoggedIn } = require('../middlewares/auth');

// --- CÁC ROUTE CŨ (Giữ nguyên) ---
router.get('/', isLoggedIn, gardenController.getGarden);
router.post('/buy', isLoggedIn, gardenController.buyItem);
router.post('/move', isLoggedIn, gardenController.moveItem);
router.post('/interact', isLoggedIn, gardenController.interactItem);
router.post('/remove', isLoggedIn, gardenController.removeItem);
router.post('/save-camera', isLoggedIn, gardenController.saveCamera);

// [MỚI] Route thăm vườn
router.get('/visit/:userId', isLoggedIn, gardenController.visitGarden);

module.exports = router;