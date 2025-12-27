// controllers/unitController.js
const Unit = require('../models/Unit');
const Subject = require('../models/Subject');

// 1. API: Tạo Chương mới
exports.createUnit = async (req, res) => {
    try {
        const { title, subjectId, order } = req.body;
        
        const newUnit = new Unit({
            title,
            subjectId,
            order: order || 0
        });

        await newUnit.save();
        res.json({ success: true, message: 'Đã tạo chương mới thành công!' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Lỗi khi tạo chương.' });
    }
};

// 2. API: Lấy danh sách chương theo môn (Dùng cho Dropdown)
exports.getUnitsBySubject = async (req, res) => {
    try {
        const { subjectId } = req.params;
        const units = await Unit.find({ subjectId }).sort({ order: 1 }); // Sắp xếp theo thứ tự
        res.json(units);
    } catch (err) {
        res.status(500).json({ error: 'Lỗi lấy danh sách chương' });
    }
};

// 3. API: Xóa Chương
exports.deleteUnit = async (req, res) => {
    try {
        await Unit.findByIdAndDelete(req.params.id);
        res.json({ success: true, message: 'Đã xóa chương.' });
    } catch (err) {
        res.status(500).json({ error: 'Lỗi xóa chương' });
    }
};