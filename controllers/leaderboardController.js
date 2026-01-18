// controllers/leaderboardController.js
const User = require('../models/User');

exports.getLeaderboard = async (req, res) => {
    try {
        // 1. Lấy danh sách User, sắp xếp theo points giảm dần
        // Chỉ lấy những người có điểm > 0 để b��ng đẹp hơn (tuỳ chọn)
        const users = await User.find({ points: { $gt: 0 } })
            .sort({ points: -1 }) // Điểm cao nhất lên đầu
            .limit(50)                 // Lấy Top 50
            .lean();

        // 2. Tách Top 3 và danh sách còn lại
        const top3 = users.slice(0, 3);
        const restOfList = users.slice(3);

        // 3. Tính hạng của người dùng hiện tại (nếu đã đăng nhập)
        let myRank = 0;
        if (req.user) {
            // Đếm số người có điểm cao hơn mình
            const countBetter = await User.countDocuments({ points: { $gt: req.user.points || 0 } });
            myRank = countBetter + 1;
        }

        res.render('leaderboard', {
            user: req.user,
            top3,
            restOfList,
            myRank,
            activePage: 'leaderboard'
        });
    } catch (err) {
        console.error("Lỗi Leaderboard:", err);
        res.redirect('/');
    }
};