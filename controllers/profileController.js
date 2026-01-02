const User = require('../models/User');
const Garden = require('../models/Garden');
const LessonCompletion = require('../models/LessonCompletion');
const LevelUtils = require('../utils/level');
const moment = require('moment-timezone'); // [FIX 1] Import thư viện moment

exports.getProfile = async (req, res) => {
    try {
        const userId = req.params.id || req.user._id;
        
        const user = await User.findById(userId);
        if (!user) return res.render('error', { message: 'Không tìm thấy đạo hữu này!' });

        // 1. Lấy thông tin Cảnh Giới
        const levelInfo = LevelUtils.getLevelInfo(user.level || 1, user.xp || 0);

        // 2. Lấy thông tin Vườn
        const garden = await Garden.findOne({ user: userId });
        const gold = garden ? garden.gold : 0;

        // 3. Đếm số bài đã học
        const completedCount = await LessonCompletion.countDocuments({ user: userId });

        // 4. Lấy danh sách hoạt động
        let activities = await LessonCompletion.find({ user: userId })
            .sort({ createdAt: -1 })
            .limit(5)
            .populate('lesson', 'title')
            .lean();

        // Map dữ liệu để khớp với EJS
        activities = activities.map(act => ({
            ...act,
            lessonId: act.lesson
        }));

        // 5. Render View
        res.render('profile', {
            title: `Hồ sơ ${user.username}`,
            profileUser: user,
            currentUser: req.user,
            isOwner: req.user && req.user._id.toString() === user._id.toString(),
            
            levelInfo: levelInfo,
            stats: {
                gold: gold,
                lessons: completedCount,
                points: user.points || 0
            },
            activities: activities,
            
            moment: moment // [FIX 2] Truyền biến moment sang view để EJS sử dụng
        });

    } catch (err) {
        console.error("Profile Error:", err);
        res.redirect('/');
    }
};