// controllers/unitController.js
const Unit = require('../models/Unit');
const Course = require('../models/Course');
const Lesson = require('../models/Lesson');

const toBoolean = (value) => value === true || value === 'true' || value === 'on' || value === 1 || value === '1';

async function canManageUnit(user, unit) {
    if (!user || !unit) return false;
    if (user.isAdmin) return true;

    const ownedCourse = await Course.findOne({
        _id: unit.courseId,
        author: user._id
    }).select('_id').lean();

    return !!ownedCourse;
}

// 1. API: Tao Chuong moi
exports.createUnit = async (req, res) => {
    try {
        const { title, courseId, order } = req.body;
        if (!courseId) {
            return res.status(400).json({ error: 'Thieu courseId de tao chuong.' });
        }

        const newUnit = new Unit({
            title,
            courseId,
            order: order || 0
        });

        await newUnit.save();
        res.json({ success: true, message: 'Da tao chuong moi thanh cong!' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Loi khi tao chuong.' });
    }
};

// 2. API: Lay danh sach chuong theo mon (Dung cho Dropdown)
exports.getUnitsBySubject = async (req, res) => {
    try {
        const { subjectId } = req.params;
        const courseIds = await Course.find({ subjectId }).distinct('_id');
        const units = await Unit.find({ courseId: { $in: courseIds } }).sort({ courseId: 1, order: 1 });
        res.json(units);
    } catch (err) {
        res.status(500).json({ error: 'Loi lay danh sach chuong' });
    }
};

// 3. API: Xoa Chuong
exports.deleteUnit = async (req, res) => {
    try {
        const unitId = req.params.id;
        const unit = await Unit.findById(unitId);

        if (!unit) {
            return res.status(404).json({ success: false, error: 'Khong tim thay chuong nay.' });
        }

        const canManage = await canManageUnit(req.user, unit);
        if (!canManage) {
            return res.status(403).json({ success: false, error: 'Ban khong co quyen xoa chuong nay.' });
        }

        await Lesson.deleteMany({ unitId });
        await Unit.findByIdAndDelete(unitId);

        res.json({ success: true, message: 'Da xoa vinh vien chuong va cac bai hoc ben trong.' });
    } catch (err) {
        console.error('Delete Unit Error:', err);
        res.status(500).json({ success: false, error: 'Loi server khi xoa chuong.' });
    }
};

exports.bulkUpdateStatus = async (req, res) => {
    try {
        const { unitId, isPublished } = req.body;

        if (!unitId) {
            return res.status(400).json({ success: false, error: 'Thieu Unit ID' });
        }

        const unit = await Unit.findById(unitId).lean();
        if (!unit) {
            return res.status(404).json({ success: false, error: 'Khong tim thay chuong nay.' });
        }

        const canManage = await canManageUnit(req.user, unit);
        if (!canManage) {
            return res.status(403).json({ success: false, error: 'Ban khong co quyen cap nhat chuong nay.' });
        }

        const result = await Lesson.updateMany(
            { unitId },
            { $set: { isPublished: toBoolean(isPublished) } }
        );

        res.json({
            success: true,
            updatedCount: result.modifiedCount
        });
    } catch (err) {
        console.error('Bulk Update Error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
};
