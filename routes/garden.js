// routes/garden.js
const express = require('express');
const router = express.Router();
const gardenController = require('../controllers/gardenController');
const { isLoggedIn } = require('../middlewares/auth');

router.get('/', isLoggedIn, gardenController.getGarden);

// [QUAN TRỌNG] Route xử lý mua hàng
router.post('/buy', isLoggedIn, gardenController.buyItem);

router.post('/move', isLoggedIn, gardenController.moveItem);
router.post('/interact', isLoggedIn, gardenController.interactItem);
router.post('/remove', isLoggedIn, gardenController.removeItem); // Route cho cái xẻng

module.exports = router;