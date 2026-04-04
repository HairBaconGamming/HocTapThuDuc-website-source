const express = require('express');
const router = express.Router();
const guildController = require('../controllers/guildController');
const { isLoggedIn } = require('../middlewares/auth');

router.get('/', isLoggedIn, guildController.getGuildHub);
router.post('/', isLoggedIn, guildController.createGuild);
router.get('/:slug', isLoggedIn, guildController.getGuildDetail);
router.post('/:slug/join', isLoggedIn, guildController.joinGuild);
router.post('/:slug/leave', isLoggedIn, guildController.leaveGuild);
router.post('/:slug/contribute', isLoggedIn, guildController.contribute);

module.exports = router;
