const express = require('express');
const router = express.Router();
const gardenController = require('../controllers/gardenController');
const { isLoggedIn } = require('../middlewares/auth');

router.get('/', isLoggedIn, gardenController.getGarden);
router.post('/buy', isLoggedIn, gardenController.buyItem);
router.post('/move', isLoggedIn, gardenController.moveItem);
router.post('/interact', isLoggedIn, gardenController.interactItem);
router.post('/remove', isLoggedIn, gardenController.removeItem);
router.post('/save-camera', isLoggedIn, gardenController.saveCamera);
router.post('/claim-quest', isLoggedIn, gardenController.claimDailyQuest);

router.get('/visit/:userId', isLoggedIn, gardenController.visitGarden);

module.exports = router;
