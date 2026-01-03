// controllers/unitController.js
const Unit = require('../models/Unit');
const Subject = require('../models/Subject');
const Lesson = require('../models/Lesson');

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
        const unitId = req.params.id;

        // 1. Kiểm tra xem Unit có tồn tại không
        const unit = await Unit.findById(unitId);
        if (!unit) {
            return res.status(404).json({ success: false, error: 'Không tìm thấy chương này.' });
        }

        // 2. Xóa tất cả bài học thuộc chương này trước
        await Lesson.deleteMany({ unitId: unitId });

        // 3. Xóa chính chương đó
        await Unit.findByIdAndDelete(unitId);

        res.json({ success: true, message: 'Đã xóa vĩnh viễn chương và các bài học bên trong.' });
    } catch (err) {
        console.error("Delete Unit Error:", err);
        res.status(500).json({ success: false, error: 'Lỗi server khi xóa chương.' });
    }
};

exports.bulkUpdateStatus = async (req, res) => {
    try {
        const { unitId, isPublished } = req.body;

        if (!unitId) return res.status(400).json({ success: false, error: 'Thiếu Unit ID' });

        // Update tất cả lesson có unitId tương ứng
        const result = await Lesson.updateMany(
            { unitId: unitId },
            { isPublished: isPublished }
        );

        res.json({ 
            success: true, 
            updatedCount: result.modifiedCount 
        });

    } catch (err) {
        console.error("Bulk Update Error:", err);
        res.status(500).json({ success: false, error: err.message });
    }
};