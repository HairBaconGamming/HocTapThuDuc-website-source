const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const moment = require('moment-timezone');

// Import all necessary models
const User = require('../models/User');
const Lesson = require('../models/Lesson');
const Subject = require('../models/Subject');
const News = require('../models/News');
const VisitStats = require('../models/VisitStats');
const BanEntry = require('../models/BanEntry');
const { autoPostAICourses } = require('../scheduler');

// Middleware to check if the user is the designated admin
function isAdmin(req, res, next) {
    if (req.user && req.user.username === 'truonghoangnam') {
        return next();
    }
    if (req.path.startsWith('/api/')) {
       return res.status(403).json({ error: 'Forbidden: Access is denied.' });
    }
    return res.status(403).render('error', { title: '403 Forbidden', message: 'You do not have permission to view this page.', user: req.user, activePage: '' });
}

// All admin routes are protected by the isAdmin middleware
router.use(isAdmin);

// Main Admin Panel Page
router.get('/', (req, res) => {
    res.render('admin', { user: req.user, activePage: 'admin' });
});

// --- API Endpoints for the Admin Panel ---

// GET API for dashboard stats (Enhanced with chart data)
router.get('/api/stats', async (req, res) => {
    try {
        const today = moment().tz("Asia/Ho_Chi_Minh").format("YYYY-MM-DD");
        
        const userRegistrationData = await User.aggregate([
            { $match: { createdAt: { $gte: moment().subtract(7, 'days').toDate() } } },
            { $group: {
                _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt", timezone: "Asia/Ho_Chi_Minh" } },
                count: { $sum: 1 }
            }},
            { $sort: { _id: 1 } }
        ]);

        const [
            totalUsers, proUsers, totalLessons, totalNews, totalSubjects,
            totalVisitsDoc, dailyVisitsDoc, bannedUsers
        ] = await Promise.all([
            User.countDocuments(), User.countDocuments({ isPro: true }),
            Lesson.countDocuments(), News.countDocuments(), Subject.countDocuments(),
            VisitStats.findOne({ key: "totalVisits" }), VisitStats.findOne({ key: `dailyVisits_${today}` }),
            User.countDocuments({ isBanned: true })
        ]);

        res.json({
            totalUsers, proUsers, bannedUsers, totalLessons, totalNews, totalSubjects,
            totalVisits: totalVisitsDoc ? totalVisitsDoc.count : 0,
            dailyVisits: dailyVisitsDoc ? dailyVisitsDoc.count : 0,
            userRegistrationData
        });
    } catch (error) {
        console.error("Error fetching admin stats:", error);
        res.status(500).json({ error: 'Failed to fetch stats' });
    }
});

// User Management with Advanced Filtering
router.get('/api/users', async (req, res) => {
    try {
        const { page = 1, limit = 10, search = '', isPro, isBanned } = req.query;
        const skip = (page - 1) * limit;

        let query = {};
        if (search) {
            const regex = new RegExp(search, 'i');
            query = { $or: [{ username: regex }, { email: regex }] };
        }
        if (isPro !== undefined && isPro !== 'all') query.isPro = (isPro === 'true');
        if (isBanned !== undefined && isBanned !== 'all') query.isBanned = (isBanned === 'true');

        const users = await User.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).select('-password -__v');
        const total = await User.countDocuments(query);

        res.json({ users, total, page, pages: Math.ceil(total / limit) });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch users' });
    }
});

// POST API to update a user
router.post('/api/users/:id/update', async (req, res) => {
    try {
        const { isPro, points, growthPoints } = req.body;
        const user = await User.findById(req.params.id);
        if (!user) return res.status(404).json({ error: 'User not found' });

        if (isPro !== undefined) user.isPro = (isPro === 'true' || isPro === true);
        if (points !== undefined) user.points = Number(points);
        if (growthPoints !== undefined) user.growthPoints = Number(growthPoints);

        await user.save();
        res.json({ success: true, message: `User ${user.username} updated.` });
    } catch (error) {
        res.status(500).json({ error: 'Failed to update user' });
    }
});

// Ban a user
router.post('/api/users/:id/ban', async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) return res.status(404).json({ error: 'User not found' });
        user.isBanned = true;
        await user.save();
        res.json({ success: true, message: `User ${user.username} has been banned.` });
    } catch (error) {
        res.status(500).json({ error: 'Failed to ban user' });
    }
});

// Unban a user
router.post('/api/users/:id/unban', async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) return res.status(404).json({ error: 'User not found' });
        user.isBanned = false;
        await user.save();
        res.json({ success: true, message: `User ${user.username} has been unbanned.` });
    } catch (error) {
        res.status(500).json({ error: 'Failed to unban user' });
    }
});

// GET API for PRO Secret Keys
router.get('/api/pro-keys', async (req, res) => {
    try {
        const { page = 1, limit = 15, search = '' } = req.query;
        let query = search ? { username: new RegExp(search, 'i') } : {};
        const users = await User.find(query).sort({ username: 1 }).skip((page - 1) * limit).limit(limit).select('username isPro proSecretKey');
        const total = await User.countDocuments(query);
        res.json({ users, total, page, pages: Math.ceil(total / limit) });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch PRO secret keys' });
    }
});

// GET API for Ban Entries
router.get('/api/bans', async (req, res) => {
    try {
        const bans = await BanEntry.find().sort({ bannedAt: -1 });
        res.json(bans);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch ban entries' });
    }
});

// DELETE API for a Ban Entry
router.delete('/api/bans/:id', async (req, res) => {
    try {
        await BanEntry.findByIdAndDelete(req.params.id);
        res.json({ success: true, message: 'Ban entry removed.' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to remove ban entry' });
    }
});

// Content Management: Lessons
router.get('/api/lessons', async (req, res) => {
    try {
        const { page = 1, limit = 10, search = '' } = req.query;
        let query = search ? { title: new RegExp(search, 'i') } : {};
        const lessons = await Lesson.find(query).populate('subject', 'name').populate('createdBy', 'username').sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit);
        const total = await Lesson.countDocuments(query);
        res.json({ lessons, total, page, pages: Math.ceil(total / limit) });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch lessons' });
    }
});

router.delete('/api/lessons/:id', async (req, res) => {
    try {
        await Lesson.findByIdAndDelete(req.params.id);
        res.json({ success: true, message: 'Lesson deleted.' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete lesson' });
    }
});

// Content Management: News
router.get('/api/news', async (req, res) => {
    try {
        const { page = 1, limit = 10, search = '' } = req.query;
        let query = search ? { title: new RegExp(search, 'i') } : {};
        const newsItems = await News.find(query).populate('postedBy', 'username').sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit);
        const total = await News.countDocuments(query);
        res.json({ newsItems, total, page, pages: Math.ceil(total / limit) });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch news' });
    }
});

router.delete('/api/news/:id', async (req, res) => {
    try {
        await News.findByIdAndDelete(req.params.id);
        res.json({ success: true, message: 'News article deleted.' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete news article' });
    }
});

// GET API for Subjects
router.get('/api/subjects', async (req, res) => {
    try {
        const subjects = await Subject.find().sort({ name: 1 });
        res.json(subjects);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch subjects' });
    }
});

// POST API to add a Subject
router.post('/api/subjects', async (req, res) => {
    try {
        const { name, description, image } = req.body;
        if (!name) return res.status(400).json({ error: 'Subject name is required.' });
        const newSubject = new Subject({ name, description, image });
        await newSubject.save();
        res.status(201).json(newSubject);
    } catch (error) {
        if (error.code === 11000) {
            return res.status(409).json({ error: 'Subject with this name already exists.' });
        }
        res.status(500).json({ error: 'Failed to create subject' });
    }
});

// DELETE API for a Subject
router.delete('/api/subjects/:id', async (req, res) => {
    try {
        // Optional: Check if any lessons are using this subject before deleting
        const lessonCount = await Lesson.countDocuments({ subject: req.params.id });
        if (lessonCount > 0) {
            return res.status(400).json({ error: `Cannot delete subject, ${lessonCount} lessons are using it.` });
        }
        const subject = await Subject.findByIdAndDelete(req.params.id);
        if (!subject) return res.status(404).json({ error: 'Subject not found' });
        res.json({ success: true, message: 'Subject deleted.' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete subject' });
    }
});


// POST API to trigger AI post generation
router.post('/api/trigger-ai-post', async (req, res) => {
    console.log("Admin manually triggered AI course posting...");
    try {
        // Execute the function but don't wait for it to finish
        autoPostAICourses();
        res.status(202).json({ success: true, message: 'AI course generation has been triggered in the background.' });
    } catch (error) {
        console.error("Error triggering AI post job:", error);
        res.status(500).json({ error: 'Failed to trigger AI job.' });
    }
});

router.get('/api/logs', async (req, res) => {
    const logs = [
        { level: 'INFO', message: `Admin user '${req.user.username}' accessed log data.`, timestamp: new Date() },
        { level: 'INFO', message: 'AI Content Generation job completed successfully.', timestamp: moment().subtract(2, 'hours').toDate() },
        { level: 'WARN', message: 'Database connection latency spiked to 250ms.', timestamp: moment().subtract(3, 'hours').toDate() },
        { level: 'ERROR', message: 'Failed to fetch data from external API: /api/live/stream (Timeout)', timestamp: moment().subtract(5, 'hours').toDate() },
        { level: 'INFO', message: 'User \'testuser123\' completed lesson \'Algebra Basics\'.', timestamp: moment().subtract(6, 'hours').toDate() },
    ];
    res.json(logs);
});

module.exports = router;