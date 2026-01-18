// middlewares/trackVisits.js
const VisitStats = require('../models/VisitStats');
const moment = require('moment-timezone');

const trackVisits = async (req, res, next) => {
    try {
        // Chỉ đếm các request GET tới trang chính, bỏ qua file tĩnh/api/admin để tránh rác data
        if (req.method === 'GET' && !req.path.startsWith('/admin') && !req.path.startsWith('/api') && !req.path.startsWith('/public')) {
            
            const now = new Date();
            // Tạo chuỗi ngày theo múi giờ Việt Nam (YYYY-MM-DD)
            const dateStr = moment().tz("Asia/Ho_Chi_Minh").format("YYYY-MM-DD");

            await VisitStats.findOneAndUpdate(
                { dateStr: dateStr },
                { 
                    $inc: { count: 1 }, // Tăng count lên 1
                    $setOnInsert: { dateStr: dateStr, date: now } // Nếu chưa có thì set ngày tạo
                },
                { upsert: true, new: true } // Upsert: chưa có thì tạo mới
            );
        }
    } catch (err) {
        console.error("Lỗi trackVisits:", err);
    }
    next();
};

module.exports = trackVisits;