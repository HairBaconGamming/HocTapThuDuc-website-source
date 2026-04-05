const express = require('express');
const router = express.Router();
const guildController = require('../controllers/guildController');
const { isLoggedIn } = require('../middlewares/auth');

router.get('/', isLoggedIn, guildController.getGuildHub);
router.post('/', isLoggedIn, guildController.createGuild);
router.get('/:slug', isLoggedIn, guildController.getGuildDetail);
router.post('/:slug/join', isLoggedIn, guildController.joinGuild);
router.post('/:slug/apply', isLoggedIn, guildController.applyToGuild);
router.post('/:slug/leave', isLoggedIn, guildController.leaveGuild);
router.post('/:slug/contribute', isLoggedIn, guildController.contribute);
router.post('/:slug/contributions/:contributionId/applause', isLoggedIn, guildController.toggleApplause);
router.post('/:slug/applications/:applicationId/review', isLoggedIn, guildController.reviewApplication);
router.post('/:slug/members/:memberId/role', isLoggedIn, guildController.updateMemberRole);
router.post('/:slug/members/:memberId/kick', isLoggedIn, guildController.kickMember);
router.post('/:slug/announcement', isLoggedIn, guildController.updateAnnouncement);
router.post('/:slug/join-settings', isLoggedIn, guildController.updateJoinSettings);
router.post('/:slug/invite-code/refresh', isLoggedIn, guildController.refreshInviteCode);
router.post('/:slug/auto-moderation', isLoggedIn, guildController.updateAutoModeration);
router.post('/:slug/weekly-goal', isLoggedIn, guildController.updateWeeklyGoal);

module.exports = router;
