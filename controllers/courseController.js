const Course = require('../models/Course');
const Unit = require('../models/Unit');
const User = require('../models/User');
const Lesson = require('../models/Lesson');

exports.getCourseDetail = async (req, res) => {
    try {
        const { id } = req.params; // Lấy ID từ URL (vd: /course/65a...)

        // 1. Lấy thông tin khóa học + Tác giả + Môn học (note: field is subjectId)
        const course = await Course.findById(id)
            .populate('author', 'username avatar bio')
            .populate('subjectId', 'name')
            .lean();
        
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

        // 3. Tính toán thống kê & tìm bài học đầu tiên
        let totalLessons = 0;
        let totalVideos = 0;
        let totalQuiz = 0;
        let totalDuration = 0;
        let firstLessonId = null; // ID để gắn vào nút "Vào học ngay"

        for (const unit of units) {
            if (unit.lessons && unit.lessons.length > 0) {
                // Lấy bài học đầu tiên của chương đầu tiên có bài
                if (!firstLessonId) {
                    firstLessonId = unit.lessons[0]._id;
                }

                totalLessons += unit.lessons.length;

                for (const lesson of unit.lessons) {
                    if (lesson.type === 'video') totalVideos++;
                    if (lesson.type === 'quiz' || lesson.type === 'question') totalQuiz++;

                    // Nếu có trường duration (số), cộng lại
                    if (typeof lesson.duration === 'number' && !isNaN(lesson.duration)) {
                        totalDuration += lesson.duration;
                    }
                }
            }
        }

        // 4. Render View
        res.render('courseDetail', {
            title: course.title,
            course,
            units,
            stats: { totalLessons, totalVideos, totalQuiz, totalDuration },
            firstLessonId,
            breadcrumbs: [
                { label: 'Trang chủ', url: '/' },
                { label: course.subjectId?.name || 'Môn học', url: course.subjectId ? `/subjects/${course.subjectId._id}` : '/subjects' },
                { label: course.title, url: null }
            ],
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
        
        // [SỬA LẠI LOGIC]
        // Chỉ tìm các khóa học mà author chính là người đang login (req.user._id)
        // Điều này đảm bảo User A không thấy khóa học của User B trong dropdown
        const courses = await Course.find({ 
            subjectId: subjectId,
            author: req.user._id 
        }).sort({ createdAt: -1 });

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
            author: req.user._id,
            isPublished: false // [SỬA] Đảm bảo luôn là nháp khi tạo nhanh
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

        res.json({ source: 'live', tree: treeFromDB, lastEditedId: null, courseIsPublished: course.isPublished });
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

        // Kiểm tra quyền sở hữu: Phải là tác giả HOẶC là Admin trùm
        const course = await Course.findById(courseId);
        if (!course) return res.status(404).json({ error: 'Khóa học không tồn tại' });

        if (course.author.toString() !== req.user._id.toString() && req.user.username !== 'truonghoangnam') {
            return res.status(403).json({ error: 'Không có quyền xóa khóa học của người khác' });
        }

        // Thực hiện xóa (như cũ)
        await Lesson.deleteMany({ courseId: courseId });
        await Unit.deleteMany({ courseId: courseId });
        await Course.findByIdAndDelete(courseId);

        res.json({ success: true, message: 'Đã xóa khóa học.' });

    } catch (err) {
        res.status(500).json({ error: 'Lỗi server.' });
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
        
        // Kiểm tra quyền sở hữu trước khi update
        const course = await Course.findOne({ _id: courseId, author: req.user._id });
        if (!course) return res.status(403).json({ success: false, error: 'Bạn không có quyền sửa khóa học này' });

        const { title, thumbnail, description, isPro, isPublished } = req.body;
        
        // Cập nhật
        course.title = title;
        course.thumbnail = thumbnail;
        course.description = description;
        course.isPro = isPro;
        course.isPublished = isPublished;
        await course.save();

        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
};

// 1. Cập nhật trạng thái Khóa Học
exports.updateCourseStatus = async (req, res) => {
    try {
        const { courseId, isPublished } = req.body;
        // Chỉ chủ sở hữu mới được sửa (Middleware check rồi hoặc check thêm ở đây)
        await Course.findByIdAndUpdate(courseId, { isPublished: isPublished });

        res.json({ success: true, msg: isPublished ? 'Đã công khai khóa học!' : 'Đã chuyển khóa học về nháp.' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// 2. Cập nhật trạng thái toàn bộ Bài học trong 1 Chương (Unit)
exports.bulkUpdateUnitStatus = async (req, res) => {
    try {
        const { unitId, isPublished } = req.body;

        // Kiểm tra ID hợp lệ
        if (!unitId || unitId.startsWith('new_')) {
            return res.status(400).json({ success: false, error: 'Vui lòng lưu cấu trúc chương trước khi thao tác hàng loạt.' });
        }

        // Cập nhật tất cả Lesson thuộc Unit này
        await Lesson.updateMany(
            { unitId: unitId },
            { $set: { isPublished: isPublished } }
        );

        res.json({
            success: true,
            msg: isPublished ? 'Đã đăng tất cả bài trong chương!' : 'Đã gỡ tất cả bài trong chương về nháp.'
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};


// [NEW] API Update Full Course & Structure
exports.updateCourseFull = async (req, res) => {
    try {
        const courseId = req.params.id;
        const { 
            title, description, thumbnail, isPro, isPublished, 
            curriculumSnapshot 
        } = req.body;

        // 1. Cập nhật thông tin cơ bản của Course
        await Course.findByIdAndUpdate(courseId, {
            title, description, thumbnail, isPro, isPublished
        });

        let unitMapping = {};

        // 2. Xử lý đồng bộ Cấu trúc (Nếu có gửi lên)
        if (curriculumSnapshot) {
            const tree = JSON.parse(curriculumSnapshot);

            // A. Lọc danh sách Unit ID đang tồn tại trên UI (loại bỏ ID tạm)
            const activeUnitIds = tree
                .map(u => u.id)
                .filter(id => !id.startsWith('new_unit_'));

            // B. [QUAN TRỌNG] XÓA CÁC UNIT KHÔNG CÒN TRONG DANH SÁCH (Hard Delete)
            const unitsToDelete = await Unit.find({
                courseId: courseId,
                _id: { $nin: activeUnitIds }
            });

            if (unitsToDelete.length > 0) {
                const deleteIds = unitsToDelete.map(u => u._id);
                console.log(`CourseSync: Deleting ${deleteIds.length} orphan units...`);
                
                // Xóa Unit
                await Unit.deleteMany({ _id: { $in: deleteIds } });
                // Xóa Lesson thuộc Unit đó
                await Lesson.deleteMany({ unitId: { $in: deleteIds } });
            }

            // C. Cập nhật/Tạo mới Unit theo thứ tự
            let unitOrder = 0;
            for (let uNode of tree) {
                unitOrder++;
                let currentUnitId = uNode.id;

                if (uNode.id.startsWith('new_unit_')) {
                    // Tạo mới
                    const newUnit = await Unit.create({
                        title: uNode.title || "Chương mới",
                        courseId: courseId,
                        order: unitOrder
                    });
                    currentUnitId = newUnit._id.toString();
                    unitMapping[uNode.id] = currentUnitId;
                } else {
                    // Update cũ
                    await Unit.findByIdAndUpdate(currentUnitId, { 
                        title: uNode.title,
                        order: unitOrder 
                    });
                }

                // Cập nhật Lesson Order (nếu cần thiết, dù bài học thường save bên lessonController)
                // Nhưng để chắc chắn thứ tự đúng, ta update luôn order
                if (uNode.lessons && uNode.lessons.length > 0) {
                    let lessonOrder = 0;
                    for (let lNode of uNode.lessons) {
                        lessonOrder++;
                        if (!lNode.id.startsWith('new_lesson_')) { // Chỉ update bài đã có ID
                            await Lesson.findByIdAndUpdate(lNode.id, {
                                unitId: currentUnitId, // Move bài sang chương mới nếu có kéo thả
                                order: lessonOrder
                            });
                        }
                    }
                }
            }
        }

        res.json({ success: true, unitMapping });

    } catch (err) {
        console.error("Update Course Error:", err);
        res.status(500).json({ success: false, error: err.message });
    }
};