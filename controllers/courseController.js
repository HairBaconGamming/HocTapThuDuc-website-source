const Course = require('../models/Course');
const Unit = require('../models/Unit');
const User = require('../models/User');
const Lesson = require('../models/Lesson');

exports.getCourseDetail = async (req, res) => {
    try {
        const { id } = req.params; // Lấy ID từ URL (vd: /course/65a...)

        // 1. Lấy thông tin khóa học + Tác giả
        const course = await Course.findById(id).populate('author', 'username avatar bio').lean();
        
        if (!course) {
            return res.status(404).render('404', { title: 'Không tìm thấy khóa học', user: req.user });
        }

        // 2. Lấy danh sách Chương + Bài học (Chỉ lấy bài đã Publish)
        const units = await Unit.find({ courseId: id })
            .sort({ order: 1 })
            .populate({
                path: 'lessons',
                match: { isPublished: true }, // Chỉ hiện bài đã đăng
                select: 'title type isPro isProOnly slug duration', // Lấy các trường cần thiết
                options: { sort: { order: 1 } }
            })
            .lean();

        // 3. Tính toán thống kê
        let totalLessons = 0;
        let totalVideos = 0;
        let totalQuiz = 0;

        units.forEach(u => {
            if (u.lessons) {
                totalLessons += u.lessons.length;
                u.lessons.forEach(l => {
                    if (l.type === 'video') totalVideos++;
                    if (l.type === 'quiz' || l.type === 'question') totalQuiz++;
                });
            }
        });

        // 4. Render View
        res.render('courseDetail', {
            title: course.title,
            course,
            units,
            stats: { totalLessons, totalVideos, totalQuiz },
            user: req.user,
            activePage: 'courses'
        });

    } catch (err) {
        console.error(err);
        res.status(500).render('error', { message: 'Lỗi server', user: req.user });
    }
};

// 1. API: Lấy danh sách khóa học theo Subject (Cho Dropdown cấp 2)
exports.getCoursesBySubject = async (req, res) => {
    try {
        const { subjectId } = req.params;
        const courses = await Course.find({ subjectId }).sort({ createdAt: -1 });
        res.json(courses);
    } catch (err) {
        res.status(500).json({ error: 'Lỗi tải danh sách khóa học' });
    }
};

// 2. API: Tạo khóa học nhanh (Quick Create từ nút +)
exports.createQuickCourse = async (req, res) => {
    try {
        const { title, subjectId } = req.body;
        const newCourse = new Course({
            title,
            subjectId,
            author: req.user._id // Giả sử đã có middleware auth
        });
        await newCourse.save();
        res.json({ success: true, course: newCourse });
    } catch (err) {
        res.status(500).json({ error: 'Lỗi tạo khóa học' });
    }
};

// 3. API: Lấy Cây Giáo Trình (Tree) theo Course
exports.getTreeByCourse = async (req, res) => {
    try {
        const { courseId } = req.params;
        const course = await Course.findById(courseId).lean();
        if (!course) return res.status(404).json({ error: 'Course not found' });

        // 1. If there's a draft tree, return it (priority)
        if (course.draftTree) {
            try {
                const tree = JSON.parse(course.draftTree);
                return res.json({ source: 'draft', tree: tree, lastEditedId: course.lastEditedLessonId || null });
            } catch (e) {
                console.error('Error parsing draftTree for course', courseId, e);
                // Fallthrough to live mode if draft is corrupted
            }
        }

        // 2. Otherwise load from live DB
        const units = await Unit.find({ courseId })
            .sort({ order: 1 })
            .populate({
                path: 'lessons',
                select: 'title _id type isPro order isPublished',
                options: { sort: { order: 1 } }
            })
            .lean();

        const treeFromDB = units.map(u => ({
            id: u._id.toString(),
            title: u.title,
            order: u.order,
            lessons: (u.lessons || []).map(l => ({
                id: l._id.toString(),
                title: l.title,
                type: l.type,
                isPublished: !!l.isPublished
            }))
        }));

        res.json({ source: 'live', tree: treeFromDB, lastEditedId: null });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Lỗi tải cấu trúc' });
    }
};

// Discard draft
exports.discardDraft = async (req, res) => {
    try {
        const { courseId } = req.params;
        await Course.findByIdAndUpdate(courseId, { draftTree: null, lastEditedLessonId: null });
        res.json({ success: true });
    } catch (err) {
        console.error('Error discarding draft for course', req.params.courseId, err);
        res.status(500).json({ error: err.message });
    }
};

exports.deleteCourse = async (req, res) => {
    try {
        const { courseId } = req.params;

        // 1. Kiểm tra khóa học có tồn tại không
        const course = await Course.findById(courseId);
        if (!course) {
            return res.status(404).json({ error: 'Khóa học không tồn tại' });
        }

        // 2. Xóa tất cả BÀI HỌC thuộc khóa này
        await Lesson.deleteMany({ courseId: courseId });

        // 3. Xóa tất cả CHƯƠNG thuộc khóa này
        await Unit.deleteMany({ courseId: courseId });

        // 4. Cuối cùng xóa KHÓA HỌC
        await Course.findByIdAndDelete(courseId);

        res.json({ success: true, message: 'Đã xóa khóa học và toàn bộ nội dung bên trong.' });

    } catch (err) {
        console.error("Delete Course Error:", err);
        res.status(500).json({ error: 'Lỗi server khi xóa khóa học.' });
    }
};

// API: Lấy chi tiết khóa học (cho Modal Settings)
exports.getCourseDetails = async (req, res) => {
    try {
        const course = await Course.findById(req.params.courseId);
        if (!course) return res.status(404).json({ success: false, error: 'Không tìm thấy' });
        res.json({ success: true, course });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
};

// API: Cập nhật khóa học
exports.updateCourse = async (req, res) => {
    try {
        const { courseId } = req.params;
        const { title, thumbnail, description, isPro, isPublished } = req.body;

        await Course.findByIdAndUpdate(courseId, {
            title, thumbnail, description, isPro, isPublished
        });

        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
};