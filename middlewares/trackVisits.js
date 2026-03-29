// middlewares/trackVisits.js
const VisitStats = require('../models/VisitStats');
const moment = require('moment-timezone');
const mongoose = require('mongoose');

const trackVisits = async (req, res, next) => {
    try {
        const isStaticAsset = /\.[a-z0-9]+$/i.test(req.path);
        const isPageRequest = req.method === 'GET'
            && !req.path.startsWith('/admin')
            && !req.path.startsWith('/api')
            && !isStaticAsset;

        if (isPageRequest && mongoose.connection.readyState === 1) {
            const now = new Date();
            const dateStr = moment().tz("Asia/Ho_Chi_Minh").format("YYYY-MM-DD");

            await Promise.all([
                VisitStats.findOneAndUpdate(
                    { dateStr: 'totalVisits' },
                    {
                        $inc: { count: 1 },
                        $setOnInsert: { dateStr: 'totalVisits', date: now }
                    },
                    { upsert: true, new: true }
                ),
                VisitStats.findOneAndUpdate(
                    { dateStr },
                    {
                        $inc: { count: 1 },
                        $setOnInsert: { dateStr, date: now }
                    },
                    { upsert: true, new: true }
                )
            ]);
        }
    } catch (err) {
        console.error("Lỗi trackVisits:", err);
    }
    next();
};

module.exports = trackVisits;
