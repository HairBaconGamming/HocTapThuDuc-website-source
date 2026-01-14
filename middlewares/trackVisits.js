// middlewares/trackVisits.js
const VisitStats = require('../models/VisitStats');

const trackVisits = async (req, res, next) => {
    try {
        // Chỉ đếm các request GET tới trang chính, bỏ qua file tĩnh/api/admin để tránh rác data
        if (req.method === 'GET' && !req.path.startsWith('/admin') && !req.path.startsWith('/api') && !req.path.startsWith('/public')) {
            
            const now = new Date();
            // Tạo chuỗi ngày theo múi giờ Việt Nam hoặc Server (YYYY-MM-DD)
            const dateStr = now.toISOString().split('T')[0]; 

            await VisitStats.findOneAndUpdate(
                { dateStr: dateStr },
                { 
                    $inc: { count: 1 }, // Tăng count lên 1
                    $setOnInsert: { date: now } // Nếu chưa có thì set ngày tạo
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