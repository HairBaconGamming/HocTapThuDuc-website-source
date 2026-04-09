const Course = require('../models/Course');
const Unit = require('../models/Unit');
const User = require('../models/User');
const Lesson = require('../models/Lesson');
const LessonCompletion = require('../models/LessonCompletion');
const Flashcard = require('../models/Flashcard');
const {
    buildLessonVisibilityFilter,
    hasProContentAccess,
    canManageCourse
} = require('../utils/contentAccess');
const LevelUtils = require('../utils/level');
const { buildCompletionGardenBundle } = require('../utils/lessonGamificationUtils');

const toBoolean = (value) => value === true || value === 'true' || value === 'on' || value === 1 || value === '1';

async function findOwnedCourse(courseId, user, { lean = false } = {}) {
    if (!courseId) return null;

    const query = { _id: courseId };
    if (!(user && user.isAdmin)) {
        query.author = user._id;
    }

    let cursor = Course.findOne(query);
    if (lean) cursor = cursor.lean();
    return cursor;
}

async function ensureOwnedCourse(courseId, user, res, { lean = false, notFoundMessage = 'Không tìm thấy khóa học hoặc bạn không có quyền truy cập.' } = {}) {
    const course = await findOwnedCourse(courseId, user, { lean });
    if (!course) {
        res.status(403).json({ success: false, error: notFoundMessage });
        return null;
    }
    return course;
}

function estimateLessonMinutes(lesson) {
    if (typeof lesson?.duration === 'number' && !Number.isNaN(lesson.duration) && lesson.duration > 0) {
        return Math.max(1, Math.round(lesson.duration));
    }

    switch (lesson?.type) {
        case 'video':
            return 8;
        case 'quiz':
        case 'question':
            return 6;
        case 'document':
        case 'resource':
            return 4;
        default:
            return 5;
    }
}

function getLessonTypeMeta(type) {
    switch (type) {
        case 'video':
            return { label: 'Video', icon: 'fa-play-circle' };
        case 'quiz':
        case 'question':
            return { label: 'Luyện tập', icon: 'fa-circle-question' };
        case 'document':
        case 'resource':
            return { label: 'Tài liệu', icon: 'fa-file-lines' };
        case 'code':
            return { label: 'Code', icon: 'fa-code' };
        default:
            return { label: 'Bài học', icon: 'fa-book-open' };
    }
}

function stripHtml(value = '') {
    return String(value || '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function getHeroDescription(description) {
    const clean = stripHtml(description);
    if (!clean) {
        return 'Khóa học được biên soạn như một hành trình học gọn, rõ nhịp và dễ quay lại đúng chỗ đang học.';
    }

    const firstSentence = clean.split(/(?<=[.!?])\s+/)[0] || clean;
    return firstSentence.length <= 180 ? firstSentence : `${firstSentence.slice(0, 177).trim()}...`;
}

function buildCourseRewardPreviewLegacy({ course, progress, stats }) {
    const accessibleCount = Math.max(1, Number(progress?.accessibleCount || 0));
    const totalVideos = Math.max(0, Number(stats?.totalVideos || 0));
    const totalQuiz = Math.max(0, Number(stats?.totalQuiz || 0));

    return {
        badge: `Huy hiệu ${course?.subjectId?.name || 'Chặng mới'}`,
        headline: `Khi đi hết ${accessibleCount} bài đang mở`,
        summary: [
            `${accessibleCount * 10} điểm`,
            `${accessibleCount * 12} XP`,
            `+${Math.max(3, Math.ceil(accessibleCount * 1.5))} nước`,
            `+${Math.max(1, Math.ceil((totalVideos + totalQuiz) / 4))} phân bón`
        ],
        water: Math.max(3, Math.ceil(accessibleCount * 1.5)),
        fertilizer: Math.max(1, Math.ceil((totalVideos + totalQuiz) / 4)),
        gold: Math.max(80, totalVideos * 24 + totalQuiz * 30 + accessibleCount * 10),
        xp: accessibleCount * 12
    };
}

function buildCourseRewardPreview({ course, progress, user }) {
    const currentLevel = user ? Math.max(1, Number(user.level || 1)) : 1;
    const remainingAccessible = Math.max(0, Number(progress?.accessibleCount || 0) - Number(progress?.completedCount || 0));
    const multiplier = remainingAccessible > 0 ? remainingAccessible : Math.max(1, Number(progress?.accessibleCount || 1));
    const headlineText = remainingAccessible > 0
        ? `Hoàn thành ${remainingAccessible} bài còn lại sẽ nhận được:`
        : 'Tổng tài nguyên khóa học mang lại:';

    const baseGarden = buildCompletionGardenBundle(currentLevel);
    const baseXp = Math.max(10, Math.floor(LevelUtils.getRequiredXP(currentLevel) * 0.05));
    const basePoints = 10;

    return {
        badge: `Huy hiệu ${course?.subjectId?.name || 'Chặng mới'}`,
        headline: headlineText,
        water: baseGarden.water * multiplier,
        fertilizer: baseGarden.fertilizer * multiplier,
        gold: baseGarden.gold * multiplier,
        xp: baseXp * multiplier,
        points: basePoints * multiplier,
        summary: [
            `+${basePoints * multiplier} điểm`,
            `+${baseXp * multiplier} XP`,
            `+${baseGarden.water * multiplier} nước`,
            `+${baseGarden.gold * multiplier} vàng`
        ]
    };
}

function buildCourseLearningPromise({ progress, stats }) {
    return [
        {
            label: 'Bài đang mở',
            value: `${progress.accessibleCount} bài`,
            copy: 'Đi theo nhịp đã mở để không bị loãng mạch học và vẫn giữ được cảm giác tiến lên.',
            icon: 'fa-route'
        },
        {
            label: 'Video trực quan',
            value: `${stats.totalVideos} video`,
            copy: 'Những phần cần nhìn tận mắt sẽ được giữ lại ở video thay vì dồn hết vào chữ.',
            icon: 'fa-circle-play'
        },
        {
            label: 'Checkpoint luyện tập',
            value: `${stats.totalQuiz} bài`,
            copy: 'Mỗi chặng đều có điểm dừng để kiểm tra hiểu bài, không chỉ đọc rồi lướt qua.',
            icon: 'fa-circle-question'
        },
        {
            label: 'Tài liệu quay lại',
            value: `${stats.totalDocuments} mục`,
            copy: 'Giữ tài nguyên quan trọng gần tay để quay lại đúng chỗ mỗi khi cần ôn tập.',
            icon: 'fa-file-lines'
        }
    ];
}

function buildCourseCtaState({ course, user, progress, firstAccessibleLessonId, resumeLessonId, hasPremiumLocked }) {
    if (!user) {
        return {
            tone: 'guest',
            eyebrow: 'Sẵn sàng bắt đầu',
            title: 'Đăng nhập để mở hành trình học',
            body: 'Lưu tiến độ, đồng bộ bài đang học và mở khóa gợi ý bài tiếp theo ngay trong khóa này.',
            primary: {
                href: `/login?redirect=/course/${course._id}`,
                label: 'Đăng nhập để bắt đầu'
            },
            secondary: firstAccessibleLessonId
                ? { href: `/lesson/${firstAccessibleLessonId}`, label: 'Xem bài mở đầu' }
                : null
        };
    }

    if (!firstAccessibleLessonId) {
        return {
            tone: 'locked',
            eyebrow: 'Nội dung đang khóa',
            title: hasPremiumLocked ? 'Cần PRO để mở trọn khóa học' : 'Khóa học đang được cập nhật',
            body: hasPremiumLocked
                ? 'Một số bài trong khóa đang ở chế độ nâng cao. Nâng cấp để mở đầy đủ lộ trình học.'
                : 'Khóa học chưa có bài học khả dụng ở thời điểm hiện tại.',
            primary: hasPremiumLocked
                ? { href: '/upgrade', label: 'Nâng cấp PRO' }
                : null,
            secondary: null
        };
    }

    if (progress.completedCount > 0 && progress.completedCount < progress.accessibleCount) {
        return {
            tone: 'resume',
            eyebrow: 'Đang học dở',
            title: 'Tiếp tục đúng nhịp đang học',
            body: `Bạn đã hoàn thành ${progress.completedCount}/${progress.accessibleCount} bài có thể truy cập. Hệ thống sẽ đưa bạn đến bài hợp lý tiếp theo.`,
            primary: {
                href: `/lesson/${resumeLessonId || firstAccessibleLessonId}`,
                label: 'Tiếp tục học'
            },
            secondary: {
                href: `/lesson/${firstAccessibleLessonId}`,
                label: 'Xem lại từ đầu'
            }
        };
    }

    if (progress.accessibleCount > 0 && progress.completedCount === progress.accessibleCount) {
        return {
            tone: 'completed',
            eyebrow: 'Đã hoàn thành',
            title: 'Ôn tập hoặc mở rộng sâu hơn',
            body: hasPremiumLocked
                ? 'Bạn đã đi hết phần đang mở. Có thể ôn lại từ đầu hoặc nâng cấp để học tiếp các bài nâng cao.'
                : 'Bạn đã hoàn thành toàn bộ phần đang mở của khóa học. Có thể ôn lại để củng cố kiến thức.',
            primary: {
                href: `/lesson/${firstAccessibleLessonId}`,
                label: 'Ôn tập lại'
            },
            secondary: hasPremiumLocked
                ? { href: '/upgrade', label: 'Mở khóa PRO' }
                : null
        };
    }

    return {
        tone: 'start',
        eyebrow: 'Khởi động khóa học',
        title: 'Bắt đầu từ bài mở đầu',
        body: 'Đi theo lộ trình đã sắp sẵn để giữ nhịp học ổn định và mở dần các bài tiếp theo.',
        primary: {
            href: `/lesson/${firstAccessibleLessonId}`,
            label: 'Bắt đầu học'
        },
        secondary: hasPremiumLocked
            ? { href: '/upgrade', label: 'Mở khóa PRO' }
            : null
    };
}

const legacyGetCourseDetailDeprecated = async (req, res) => {
    try {
        const { id } = req.params; // Lấy ID từ URL (vd: /course/65a...)

        // 1. Lấy thông tin khóa học + Tác giả + Môn học (note: field is subjectId)
        const course = await Course.findById(id)
            .populate('author', 'username avatar bio')
            .populate('subjectId', 'name')
            .lean();

        const authorId = course && course.author && typeof course.author === 'object'
            ? course.author._id?.toString()
            : course?.author?.toString();
        const canViewDraft = !!(
            req.user && (
                req.user.isAdmin ||
                (authorId && authorId === req.user._id.toString())
            )
        );
        
        if (!course) {
            return res.status(404).render('404', { title: 'Không tìm thấy khóa học', user: req.user });
        }

        // 2. Lấy danh sách Chương + Bài học (Chỉ lấy bài đã Publish)
        if (!course.isPublished && !canViewDraft) {
            return res.status(404).render('404', { title: 'Khong tim thay khoa hoc', user: req.user });
        }

        const lessonMatch = canViewDraft ? {} : buildLessonVisibilityFilter(req.user);
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
        const course = await ensureOwnedCourse(courseId, req.user, res, {
            lean: true,
            notFoundMessage: 'Khóa học không tồn tại hoặc bạn không có quyền xem cấu trúc này.'
        });
        if (!course) return;

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
        const course = await ensureOwnedCourse(courseId, req.user, res, {
            notFoundMessage: 'Bạn không có quyền hủy bản nháp của khóa học này.'
        });
        if (!course) return;
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
        const course = await ensureOwnedCourse(courseId, req.user, res, {
            notFoundMessage: 'Khóa học không tồn tại hoặc bạn không có quyền xóa.'
        });
        if (!course) return;

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
        const course = await ensureOwnedCourse(req.params.courseId, req.user, res, {
            notFoundMessage: 'Không tìm thấy khóa học hoặc bạn không có quyền xem.'
        });
        if (!course) return;
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
        const course = await ensureOwnedCourse(courseId, req.user, res, {
            notFoundMessage: 'Bạn không có quyền sửa khóa học này'
        });
        if (!course) return;

        const { title, thumbnail, description, isPro, isPublished } = req.body;
        
        // Cập nhật
        course.title = title;
        course.thumbnail = thumbnail;
        course.description = description;
        course.isPro = toBoolean(isPro);
        course.isPublished = toBoolean(isPublished);
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
        const course = await ensureOwnedCourse(courseId, req.user, res, {
            notFoundMessage: 'Bạn không có quyền cập nhật trạng thái khóa học này.'
        });
        if (!course) return;

        const publishValue = toBoolean(isPublished);
        await Course.findByIdAndUpdate(courseId, { isPublished: publishValue });

        res.json({ success: true, msg: publishValue ? 'Đã công khai khóa học!' : 'Đã chuyển khóa học về nháp.' });
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

        const unit = await Unit.findById(unitId).lean();
        if (!unit) {
            return res.status(404).json({ success: false, error: 'Không tìm thấy chương cần cập nhật.' });
        }

        const course = await findOwnedCourse(unit.courseId, req.user, { lean: true });
        if (!course) {
            return res.status(403).json({ success: false, error: 'Bạn không có quyền cập nhật chương này.' });
        }

        const publishValue = toBoolean(isPublished);

        // Cập nhật tất cả Lesson thuộc Unit này
        const result = await Lesson.updateMany(
            { unitId: unitId },
            { $set: { isPublished: publishValue } }
        );

        res.json({
            success: true,
            updatedCount: result.modifiedCount,
            msg: publishValue ? 'Đã đăng tất cả bài trong chương!' : 'Đã gỡ tất cả bài trong chương về nháp.'
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

        const ownedCourse = await ensureOwnedCourse(courseId, req.user, res, {
            notFoundMessage: 'Bạn không có quyền đồng bộ khóa học này.'
        });
        if (!ownedCourse) return;

        const normalizedIsPro = toBoolean(isPro);
        const normalizedIsPublished = toBoolean(isPublished);

        // 1. Cập nhật thông tin cơ bản của Course
        await Course.findByIdAndUpdate(courseId, {
            title,
            description,
            thumbnail,
            isPro: normalizedIsPro,
            isPublished: normalizedIsPublished
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

// Canonical public detail handler used by course detail pages.
exports.getCourseDetail = async (req, res) => {
    try {
        const { id } = req.params;
        const course = await Course.findById(id)
            .populate('author', 'username avatar bio')
            .populate('subjectId', 'name')
            .lean();

        if (!course) {
            return res.status(404).render('404', { title: 'Khong tim thay khoa hoc', user: req.user });
        }

        const canViewDraft = canManageCourse(req.user, course);

        if (!course.isPublished && !canViewDraft) {
            return res.status(404).render('404', { title: 'Khong tim thay khoa hoc', user: req.user });
        }

        const canUsePremium = hasProContentAccess(req.user) || canViewDraft;
        const lessonMatch = canViewDraft ? {} : { isPublished: true };
        const units = await Unit.find({ courseId: id })
            .sort({ order: 1 })
            .populate({
                path: 'lessons',
                match: lessonMatch,
                select: 'title type isPro isProOnly slug duration isPublished',
                options: { sort: { order: 1 } }
            })
            .lean();

        let totalVideos = 0;
        let totalQuiz = 0;
        let totalDocuments = 0;
        let totalDuration = 0;
        let premiumLessons = 0;
        const lessonIds = [];

        const normalizedUnits = units.map((unit, unitIndex) => {
            const normalizedLessons = (unit.lessons || []).map((lesson, lessonIndex) => {
                const durationMinutes = estimateLessonMinutes(lesson);
                const typeMeta = getLessonTypeMeta(lesson.type);
                const isLocked = !canUsePremium && !!(lesson.isPro || lesson.isProOnly);

                lessonIds.push(lesson._id);
                totalDuration += durationMinutes;
                if (lesson.type === 'video') totalVideos++;
                if (lesson.type === 'quiz' || lesson.type === 'question') totalQuiz++;
                if (lesson.type === 'document' || lesson.type === 'resource') totalDocuments++;
                if (lesson.isPro || lesson.isProOnly) premiumLessons++;

                return {
                    ...lesson,
                    index: lessonIndex + 1,
                    durationMinutes,
                    durationLabel: `${durationMinutes} phút`,
                    typeLabel: typeMeta.label,
                    typeIcon: typeMeta.icon,
                    isLocked,
                    canOpen: !isLocked,
                    link: isLocked
                        ? (req.user ? '/upgrade' : `/login?redirect=/course/${course._id}`)
                        : `/lesson/${lesson._id}`
                };
            });

            return {
                ...unit,
                index: unitIndex + 1,
                lessons: normalizedLessons
            };
        });

        let completedSet = new Set();
        if (req.user && lessonIds.length > 0) {
            const completionDocs = await LessonCompletion.find({
                user: req.user._id,
                lesson: { $in: lessonIds }
            }).select('lesson').lean();
            completedSet = new Set(completionDocs.map((entry) => entry.lesson.toString()));
        }

        const unitsWithProgress = normalizedUnits.map((unit) => {
            const lessons = unit.lessons.map((lesson) => ({
                ...lesson,
                isCompleted: completedSet.has(lesson._id.toString())
            }));
            const accessibleCount = lessons.filter((lesson) => !lesson.isLocked).length;
            const completedCount = lessons.filter((lesson) => lesson.isCompleted && !lesson.isLocked).length;

            return {
                ...unit,
                lessons,
                summary: {
                    totalCount: lessons.length,
                    accessibleCount,
                    completedCount,
                    lockedCount: lessons.filter((lesson) => lesson.isLocked).length,
                    durationLabel: `${lessons.reduce((sum, lesson) => sum + lesson.durationMinutes, 0)} phút`
                }
            };
        });

        const flatLessons = unitsWithProgress.flatMap((unit) => unit.lessons);
        const accessibleLessons = flatLessons.filter((lesson) => !lesson.isLocked);
        const completedAccessibleCount = accessibleLessons.filter((lesson) => lesson.isCompleted).length;
        const firstLessonId = accessibleLessons[0]?._id?.toString() || null;
        const resumeLessonId = accessibleLessons.find((lesson) => !lesson.isCompleted)?._id?.toString() || firstLessonId;

        let studentCount = 0;
        if (lessonIds.length > 0) {
            const uniqueStudents = await LessonCompletion.distinct('user', { lesson: { $in: lessonIds } });
            studentCount = uniqueStudents.length;
        }

        const stats = {
            totalLessons: flatLessons.length,
            totalVideos,
            totalQuiz,
            totalDocuments,
            totalDuration,
            unitCount: unitsWithProgress.length,
            premiumLessons,
            studentCount
        };

        const progress = {
            completedCount: completedAccessibleCount,
            accessibleCount: accessibleLessons.length,
            totalCount: flatLessons.length,
            percent: accessibleLessons.length
                ? Math.round((completedAccessibleCount / accessibleLessons.length) * 100)
                : 0,
            remainingCount: Math.max(accessibleLessons.length - completedAccessibleCount, 0)
        };

        const cta = buildCourseCtaState({
            course,
            user: req.user,
            progress,
            firstAccessibleLessonId: firstLessonId,
            resumeLessonId,
            hasPremiumLocked: flatLessons.some((lesson) => lesson.isLocked)
        });

        const nextLessonCard = accessibleLessons.find((lesson) => String(lesson._id) === String(resumeLessonId))
            || accessibleLessons.find((lesson) => !lesson.isCompleted)
            || accessibleLessons[0]
            || null;

        const rewardPreview = buildCourseRewardPreview({ course, progress, user: req.user });
        const learningPromise = buildCourseLearningPromise({ progress, stats });

        let flashcardDeck = {
            count: 0,
            href: `/flashcards/review?courseId=${course._id}`,
            label: 'Ôn tập thẻ ghi nhớ của khóa này'
        };

        if (req.user && lessonIds.length > 0) {
            flashcardDeck.count = await Flashcard.countDocuments({
                user: req.user._id,
                lesson: { $in: lessonIds }
            });
        }

        res.render('courseDetail', {
            title: course.title,
            course,
            units: unitsWithProgress,
            stats,
            progress,
            cta,
            heroDescription: getHeroDescription(course.description),
            firstLessonId,
            resumeLessonId,
            nextLessonCard,
            rewardPreview,
            learningPromise,
            flashcardDeck,
            canViewDraft,
            userHasPremiumAccess: canUsePremium,
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
        res.status(500).render('error', { message: 'Loi server', user: req.user });
    }
};
