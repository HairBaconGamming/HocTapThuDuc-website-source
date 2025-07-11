const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

// Import all necessary models
const User = require('../models/User');
const Lesson = require('../models/Lesson');
const Subject = require('../models/Subject');
const News = require('../models/News');
const VisitStats = require('../models/VisitStats');
const BanEntry = require('../models/BanEntry');
const { autoPostAICourses } = require('../scheduler'); // For manual trigger
const moment = require('moment-timezone');

// Middleware to check if the user is the designated admin
function isAdmin(req, res, next) {
    if (req.user && req.user.username === 'truonghoangnam') {
        return next();
    }
    // For API routes, return JSON error. For page routes, redirect.
    if (req.path.startsWith('/api/')) {
       return res.status(403).json({ error: 'Forbidden: Access is denied.' });
    }
    return res.status(403).send('Forbidden');
}

// All admin routes are protected by the isAdmin middleware
router.use(isAdmin);

// Main Admin Panel Page
router.get('/', async (req, res) => {
    try {
        // Initial data for the dashboard can be fetched here if needed,
        // but we will fetch via API for a more dynamic feel.
        res.render('admin', { user: req.user, activePage: 'admin' });
    } catch (error) {
        console.error("Error loading admin panel:", error);
        res.status(500).send("Error loading admin panel.");
    }
});


// --- API Endpoints for the Admin Panel ---

// GET API for dashboard stats
router.get('/api/stats', async (req, res) => {
    try {
        const today = moment().tz("Asia/Ho_Chi_Minh").format("YYYY-MM-DD");
        const [
            totalUsers,
            proUsers,
            totalLessons,
            totalNews,
            totalSubjects,
            totalVisitsDoc,
            dailyVisitsDoc,
            bannedUsers,
            recentUsers,
            recentLessons
        ] = await Promise.all([
            User.countDocuments(),
            User.countDocuments({ isPro: true }),
            Lesson.countDocuments(),
            News.countDocuments(),
            Subject.countDocuments(),
            VisitStats.findOne({ key: "totalVisits" }),
            VisitStats.findOne({ key: `dailyVisits_${today}` }),
            User.countDocuments({ isBanned: true }),
            User.find().sort({ createdAt: -1 }).limit(5).select('username createdAt isPro'),
            Lesson.find().sort({ createdAt: -1 }).limit(5).populate('createdBy', 'username').select('title createdBy')
        ]);

        res.json({
            totalUsers,
            proUsers,
            bannedUsers,
            totalLessons,
            totalNews,
            totalSubjects,
            totalVisits: totalVisitsDoc ? totalVisitsDoc.count : 0,
            dailyVisits: dailyVisitsDoc ? dailyVisitsDoc.count : 0,
            recentUsers,
            recentLessons,
        });
    } catch (error) {
        console.error("Error fetching admin stats:", error);
        res.status(500).json({ error: 'Failed to fetch stats' });
    }
});

// GET API for User Management
router.get('/api/users', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const searchQuery = req.query.search || '';
        const skip = (page - 1) * limit;

        let query = {};
        if (searchQuery) {
            const regex = new RegExp(searchQuery, 'i');
            query = { $or: [{ username: regex }, { email: regex }] };
        }

        const users = await User.find(query)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .select('-password -proSecretKey'); // Exclude sensitive fields

        const total = await User.countDocuments(query);

        res.json({
            users,
            total,
            page,
            pages: Math.ceil(total / limit)
        });
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

// POST API to ban a user
router.post('/api/users/:id/ban', async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) return res.status(404).json({ error: 'User not found' });

        user.isBanned = true;
        // Create a corresponding ban entry for IP/UserAgent for extra security
        if(user.lastLoginIP && user.lastloginUA) {
            await BanEntry.findOneAndUpdate(
                { ip: user.lastLoginIP, userAgent: user.lastloginUA },
                { ip: user.lastLoginIP, userAgent: user.lastloginUA, banToken: `banned_by_admin_${user._id}` },
                { upsert: true }
            );
        }
        await user.save();
        res.json({ success: true, message: `User ${user.username} has been banned.` });
    } catch (error) {
        res.status(500).json({ error: 'Failed to ban user' });
    }
});

// POST API to unban a user
router.post('/api/users/:id/unban', async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) return res.status(404).json({ error: 'User not found' });

        user.isBanned = false;
        // Remove associated ban entries
         if(user.lastLoginIP) {
            await BanEntry.deleteMany({ ip: user.lastLoginIP });
        }
        await user.save();
        res.json({ success: true, message: `User ${user.username} has been unbanned.` });
    } catch (error) {
        res.status(500).json({ error: 'Failed to unban user' });
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

module.exports = router;