// controllers/subjectController.js
const Subject = require('../models/Subject');
const Unit = require('../models/Unit');
const Lesson = require('../models/Lesson');

// Trang chi tiết môn học (Lộ trình học)
exports.getSubjectDetail = async (req, res) => {
    try {
        const { slug } = req.params;
        
        // 1. Tìm môn học
        const subject = await Subject.findOne({ slug: slug });
        if (!subject) return res.status(404).render('404');

        // 2. Tìm các Chương (Unit) của môn này
        // Populate ngược: Tìm Unit có subjectId = subject._id
        // Sau đó populate tiếp 'lessons' bên trong Unit
        const units = await Unit.find({ subjectId: subject._id })
            .sort({ order: 1 })
            .populate({
                path: 'lessons',
                select: 'title type slug order isPro', // Chỉ lấy field cần thiết
                options: { sort: { order: 1 } }
            })
            .lean();

        res.render('subjectDetail', {
            title: subject.name,
            subject,
            units, // Truyền cây thư mục (Môn -> Chương -> Bài) ra view
            breadcrumbs: [
                { label: 'Trang chủ', url: '/' },
                { label: subject.name, url: null }
            ],
            user: req.user
        });

    } catch (err) {
        console.error(err);
        res.status(500).render('error');
    }
};