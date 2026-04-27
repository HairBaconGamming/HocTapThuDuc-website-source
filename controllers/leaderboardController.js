// controllers/leaderboardController.js
const User = require('../models/User');
const { getGuildCompetitionSnapshot } = require('../services/guildCompetitionService');

exports.getLeaderboard = async (req, res) => {
    try {
        const realmHelper = require('../utils/realmHelper');
        let users = await User.find({ points: { $gt: 0 } })
            .sort({ points: -1 })
            .limit(50)
            .lean();

        // Attach Identity & Cultivation Data
        users = users.map(u => {
            return {
                ...u,
                displayName: u.displayName || u.username,
                realmData: (u.showCultivation !== false) ? realmHelper.getRealmData(u.level || 1) : null
            };
        });

        const top3 = users.slice(0, 3);
        const restOfList = users.slice(3);

        let myRank = 0;
        if (req.user) {
            const countBetter = await User.countDocuments({ points: { $gt: req.user.points || 0 } });
            myRank = countBetter + 1;
        }

        const guildCompetition = await getGuildCompetitionSnapshot(req.user?.guild || null);

        res.render('leaderboard', {
            user: req.user,
            top3,
            restOfList,
            myRank,
            guildCompetition,
            activePage: 'leaderboard'
        });
    } catch (err) {
        console.error('Lỗi Leaderboard:', err);
        res.redirect('/');
    }
};
