// controllers/leaderboardController.js
const User = require('../models/User');

exports.getLeaderboard = async (req, res) => {
    try {
        // 1. Lấy Top 50 người điểm cao nhất
        const allTopUsers = await User.find({ isBanned: false })
            .sort({ points: -1 })
            .limit(50)
            .select('username avatar points isPro bio class')
            .lean();

        // 2. Tách Top 3 (Podium) và phần còn lại (List)
        const top3 = allTopUsers.slice(0, 3);
        const restOfList = allTopUsers.slice(3);

        // 3. Tìm thứ hạng của user hiện tại (nếu đã đăng nhập)
        let myRank = null;
        if (req.user) {
            // Đếm xem có bao nhiêu người điểm cao hơn mình
            const higherRankCount = await User.countDocuments({ 
                points: { $gt: req.user.points },
                isBanned: false
            });
            myRank = higherRankCount + 1;
        }

        res.render('leaderboard', {
            title: 'Đấu Trường Danh Vọng',
            user: req.user,
            top3,
            restOfList,
            myRank,
            activePage: 'leaderboard'
        });

    } catch (err) {
        console.error(err);
        res.status(500).render('error', { error: err });
    }
};