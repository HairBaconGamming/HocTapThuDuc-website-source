// middlewares/trackVisits.js
const VisitStats = require('../models/VisitStats');

module.exports = async (req, res, next) => {
    try {
        // Chỉ đếm các request GET tới trang chính, bỏ qua file tĩnh (css, js, images)
        if (req.method === 'GET' && !req.path.match(/\.(css|js|png|jpg|jpeg|gif|ico)$/)) {
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            // Tìm bản ghi hôm nay, nếu không có thì tạo mới, nếu có thì tăng count
            await VisitStats.findOneAndUpdate(
                { date: today },
                { $inc: { count: 1 } },
                { upsert: true, new: true }
            );
        }
    } catch (err) {
        console.error("Track Visit Error:", err);
    }
    next();
};