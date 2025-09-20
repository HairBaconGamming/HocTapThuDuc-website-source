// controllers/adminController.js

const User = require('../models/User');
const Lesson = require('../models/Lesson');
const Subject = require('../models/Subject');
const News = require('../models/News');
const VisitStats = require('../models/VisitStats');
const { autoPostAICourses } = require('../scheduler');
const crypto = require('crypto');
const moment = require('moment-timezone');

// Helper
function generateSecretKey() {
    return crypto.randomBytes(16).toString('hex');
}

// Render the main admin panel page
exports.renderAdminPanel = (req, res) => {
    res.render('admin', {
        user: req.user,
        activePage: 'admin'
    });
};

// --- API Endpoints ---

// GET /api/stats - Dashboard statistics
exports.getStats = async (req, res) => {
    try {
        const today = moment().tz("Asia/Ho_Chi_Minh").format("YYYY-MM-DD");

        const [
            totalUsers, proUsers, totalLessons, totalNews, totalSubjects,
            totalVisitsDoc, dailyVisitsDoc, bannedUsers,
            recentUsers, recentLessons
        ] = await Promise.all([
            User.countDocuments(),
            User.countDocuments({ isPro: true }),
            Lesson.countDocuments(),
            News.countDocuments(),
            Subject.countDocuments(),
            VisitStats.findOne({ key: "totalVisits" }),
            VisitStats.findOne({ key: `dailyVisits_${today}` }),
            User.countDocuments({ isBanned: true }),
            User.find().sort({ createdAt: -1 }).limit(5).select('username createdAt isPro').lean(),
            Lesson.find().sort({ createdAt: -1 }).limit(5).populate('createdBy', 'username').select('title createdBy').lean()
        ]);

        res.json({
            totalUsers, proUsers, bannedUsers, totalLessons, totalNews, totalSubjects,
            totalVisits: totalVisitsDoc ? totalVisitsDoc.count : 0,
            dailyVisits: dailyVisitsDoc ? dailyVisitsDoc.count : 0,
            recentUsers, recentLessons
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch dashboard stats' });
    }
};

// GET /api/users - User management
exports.getUsers = async (req, res) => {
    try {
        const page = parseInt(req.query.page, 10) || 1;
        const limit = parseInt(req.query.limit, 10) || 10;
        const { search = '', isPro, isBanned } = req.query;
        const skip = (page - 1) * limit;

        let query = {};
        if (search) {
            const regex = new RegExp(search, 'i');
            query.$or = [{ username: regex }, { email: regex }];
        }
        if (isPro !== undefined && isPro !== 'all') query.isPro = (isPro === 'true');
        if (isBanned !== undefined && isBanned !== 'all') query.isBanned = (isBanned === 'true');

        const users = await User.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).select('-password').lean();
        const total = await User.countDocuments(query);

        res.json({ users, total, page, pages: Math.ceil(total / limit) });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch users' });
    }
};

// POST /api/users/:id/update - Update user details
exports.updateUser = async (req, res) => {
    const { id } = req.params;
    const { avatar, points, growthPoints, isPro, isTeacher } = req.body;
    
    // Chỉ Admin mới có quyền thay đổi isPro và isTeacher
    if (!req.user.isAdmin) {
        if (isPro !== undefined || isTeacher !== undefined) {
            return res.status(403).json({ error: 'Bạn không có quyền thay đổi vai trò hoặc trạng thái PRO.' });
        }
    }

    try {
        const user = await User.findById(id);
        if (!user) return res.status(404).json({ error: 'User not found' });

        if (avatar !== undefined) user.avatar = avatar;
        if (points !== undefined) user.points = Number(points);
        if (growthPoints !== undefined) user.growthPoints = Number(growthPoints);

        // Chỉ Admin mới có thể cập nhật các trường này
        if (req.user.isAdmin) {
            if (isPro !== undefined) user.isPro = (isPro === 'true');
            if (isTeacher !== undefined) user.isTeacher = (isTeacher === 'true');
        }
        
        await user.save();
        res.json({ success: true, message: `User ${user.username} updated.` });
    } catch (error) {
        res.status(500).json({ error: 'Failed to update user' });
    }
};

// POST /api/users/:id/ban - Ban a user
exports.banUser = async (req, res) => {
    try {
        await User.findByIdAndUpdate(req.params.id, { isBanned: true });
        res.json({ success: true, message: `User has been banned.` });
    } catch (error) {
        res.status(500).json({ error: 'Failed to ban user' });
    }
};

// POST /api/users/:id/unban - Unban a user
exports.unbanUser = async (req, res) => {
    try {
        await User.findByIdAndUpdate(req.params.id, { isBanned: false });
        res.json({ success: true, message: `User has been unbanned.` });
    } catch (error) {
        res.status(500).json({ error: 'Failed to unban user' });
    }
};

// GET /api/users/pro-keys
exports.getProKeys = async (req, res) => {
     try {
        const page = parseInt(req.query.page, 10) || 1;
        const limit = parseInt(req.query.limit, 10) || 15;
        const { search = '' } = req.query;
        let query = search ? { username: new RegExp(search, 'i') } : {};

        const users = await User.find(query).sort({ username: 1 }).skip((page - 1) * limit).limit(limit).select('username proSecretKey').lean();
        const total = await User.countDocuments(query);
        res.json({ users, total, page, pages: Math.ceil(total / limit) });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch PRO secret keys' });
    }
};

// POST /api/users/:id/regenerate-key
exports.regenerateProKey = async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) return res.status(404).json({ error: 'User not found' });
        
        user.proSecretKey = generateSecretKey();
        await user.save();
        res.json({ success: true, message: `New key generated for ${user.username}.` });
    } catch (error) {
        res.status(500).json({ error: 'Failed to regenerate key' });
    }
};

// GET /api/subjects
exports.getSubjects = async (req, res) => {
    try {
        const subjects = await Subject.find().sort({ name: 1 }).lean();
        res.json(subjects);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch subjects' });
    }
};

// POST /api/subjects
exports.createSubject = async (req, res) => {
    try {
        const { name, description, image } = req.body;
        if (!name) return res.status(400).json({ error: 'Subject name is required.' });

        const newSubject = new Subject({ name, description, image });
        await newSubject.save();
        res.status(201).json(newSubject);
    } catch (error) {
        if (error.code === 11000) return res.status(409).json({ error: 'Subject with this name already exists.' });
        res.status(500).json({ error: 'Failed to create subject' });
    }
};

// DELETE /api/subjects/:id
exports.deleteSubject = async (req, res) => {
    try {
        await Subject.findByIdAndDelete(req.params.id);
        res.status(204).send();
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete subject' });
    }
};
