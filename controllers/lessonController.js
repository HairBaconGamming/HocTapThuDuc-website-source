// controllers/lessonController.js
const Lesson = require('../models/Lesson');
const Unit = require('../models/Unit');
const Course = require('../models/Course');
const LessonRevision = require('../models/LessonRevision');
const User = require('../models/User');
const Garden = require('../models/Garden');
const mongoose = require('mongoose');

const toBoolean = (value) => value === true || value === 'true' || value === 'on' || value === 1 || value === '1';

async function getOwnedCourse(courseId, user) {
    if (!courseId) return null;

    const query = { _id: courseId };
    if (!user.isAdmin) {
        query.author = user._id;
    }

    return Course.findOne(query).select('_id author').lean();
}

async function canManageLesson(user, lesson) {
    if (!user || !lesson) return false;
    if (user.isAdmin) return true;
    if (lesson.createdBy && lesson.createdBy.toString() === user._id.toString()) return true;
    if (lesson.courseId) {
        const ownedCourse = await Course.findOne({ _id: lesson.courseId, author: user._id }).select('_id').lean();
        return !!ownedCourse;
    }
    return false;
}

exports.saveLessonAjax = async (req, res) => {
    try {
        const { 
            title, content, type, subjectId, isPro, quizData, isPublished,
            curriculumSnapshot, currentEditingId, 
            courseId // <--- Bắt buộc phải có courseId gửi lên
        } = req.body;

        const normalizedIsPro = toBoolean(isPro);
        const normalizedIsPublished = toBoolean(isPublished);
        const normalizedSubjectId = subjectId || undefined;
        const ownedCourse = courseId ? await getOwnedCourse(courseId, req.user) : null;
        if (courseId && !ownedCourse) {
            return res.status(403).json({ success: false, error: 'Bạn không có quyền lưu bài trong khóa học này.' });
        }

        let savedLessonId = currentEditingId;
        let currentLessonDoc;
        let existingLesson = null;

        // --- 1. XỬ LÝ BÀI HỌC HIỆN TẠI (Main Lesson) ---
        const lessonPayload = {
            title,
            content,
            type,
            subject: normalizedSubjectId,
            subjectId: normalizedSubjectId,
            courseId: courseId || undefined,
            isPro: normalizedIsPro,
            isProOnly: normalizedIsPro,
            isPublished: normalizedIsPublished,
            quizData: quizData ? JSON.parse(quizData) : []
        };

        // Kiểm tra xem có phải bài mới không (current_new_lesson hoặc new_lesson_...)
        const isNewLesson = !currentEditingId || 
                            currentEditingId === 'current_new_lesson' || 
                            currentEditingId.startsWith('new_lesson_');

        if (isNewLesson) {
            // TẠO MỚI
            currentLessonDoc = new Lesson({ ...lessonPayload, createdBy: req.user._id });
            await currentLessonDoc.save();
            savedLessonId = currentLessonDoc._id.toString();
        } else {
            // CẬP NHẬT (Chỉ khi ID hợp lệ)
            if (mongoose.Types.ObjectId.isValid(currentEditingId)) {
                existingLesson = await Lesson.findById(currentEditingId);
                if (!existingLesson) {
                    return res.status(404).json({ success: false, error: 'Không tìm thấy bài học cần cập nhật.' });
                }

                const canManage = await canManageLesson(req.user, existingLesson);
                if (!canManage) {
                    return res.status(403).json({ success: false, error: 'Bạn không có quyền sửa bài học này.' });
                }

                currentLessonDoc = await Lesson.findByIdAndUpdate(
                    currentEditingId,
                    { ...lessonPayload, createdBy: existingLesson.createdBy || req.user._id },
                    { new: true }
                );
            } else {
                // Fallback: Tạo mới nếu ID rác
                currentLessonDoc = new Lesson({ ...lessonPayload, createdBy: req.user._id });
                await currentLessonDoc.save();
                savedLessonId = currentLessonDoc._id.toString();
            }
        }

        // --- 2. XỬ LÝ CẤU TRÚC CÂY (SNAPSHOT) ---
        // Biến lưu map ID để trả về Client (Fix lỗi Dupe)
        let unitMapping = {};   // { "new_unit_123": "65af..." }
        let lessonMapping = {}; // { "new_lesson_456": "65bd..." }

        if (curriculumSnapshot && courseId) {
            let tree = JSON.parse(curriculumSnapshot);

            // 1. Lấy danh sách các Unit ID hợp lệ đang tồn tại trên cây (UI)
            // Lọc bỏ các ID tạm (new_unit_...) vì chúng chưa có trong DB
            const activeUnitIds = tree
                .map(u => u.id)
                .filter(id => !id.startsWith('new_unit_'));

            // 2. [QUAN TRỌNG] XÓA CÁC UNIT KHÔNG CÒN TRONG DANH SÁCH
            // Tìm tất cả Unit của khóa học này trong DB mà KHÔNG nằm trong activeUnitIds
            const unitsToDelete = await Unit.find({
                courseId: courseId,
                _id: { $nin: activeUnitIds }
            });

            if (unitsToDelete.length > 0) {
                const deleteIds = unitsToDelete.map(u => u._id);
                console.log(`🧹 Cleanup: Deleting ${deleteIds.length} orphan units...`);

                // Bước A: Xóa các Unit đó
                await Unit.deleteMany({ _id: { $in: deleteIds } });

                // Bước B: Xóa luôn tất cả bài học (Lessons) thuộc về các Unit đó (Cascading Delete)
                await Lesson.deleteMany({ unitId: { $in: deleteIds } });
            }

            // 3. Xử lý Thêm mới / Cập nhật vị trí (Logic cũ + Refactor nhẹ)
            let unitOrder = 0;
            for (let uNode of tree) {
                unitOrder++;
                let currentUnitId = uNode.id;

                // A. Tạo Unit mới nếu là ID tạm
                if (uNode.id.startsWith('new_unit_')) {
                    const newUnit = await Unit.create({
                        title: uNode.title || "Chương mới",
                        courseId: courseId,
                        order: unitOrder
                    });
                    currentUnitId = newUnit._id.toString();
                    unitMapping[uNode.id] = currentUnitId; // Map ID tạm -> thật
                } 
                // B. Update Unit cũ
                else {
                    await Unit.findByIdAndUpdate(currentUnitId, { 
                        title: uNode.title,
                        order: unitOrder
                    });
                }

                // C. Cập nhật thứ tự các bài học trong Unit này
                if (uNode.lessons && uNode.lessons.length > 0) {
                    let lessonOrder = 0;
                    for (let lNode of uNode.lessons) {
                        lessonOrder++;
                        
                        // [FIX] Kiểm tra xem node này có phải là bài vừa mới tạo không
                        // Map cả 'current_new_lesson' HOẶC ID tạm đang edit (currentEditingId) sang ID thật (savedLessonId)
                        const isCurrentCreatedLesson = (lNode.id === 'current_new_lesson') || 
                                                    (currentEditingId && lNode.id === currentEditingId);

                        const lId = isCurrentCreatedLesson ? savedLessonId : lNode.id;
                        
                        // Chỉ update những bài có ID thật (bỏ qua các ID new_lesson_ rác nếu có)
                        if (lId && !lId.startsWith('new_lesson_')) {
                            await Lesson.findByIdAndUpdate(lId, {
                                unitId: currentUnitId, // Gán bài vào chương (Unit)
                                order: lessonOrder     // Cập nhật vị trí
                            });
                        }
                    }
                }
            }
        }

        // [NEW] LƯU LỊCH SỬ PHIÊN BẢN (REVISION)
        try {
            // [FIX] Kiểm tra xem có lesson doc chưa
            if (currentLessonDoc) {
                // 1. Tạo bản lưu mới
                await LessonRevision.create({
                    lessonId: currentLessonDoc._id, // Sửa lesson -> currentLessonDoc
                    title: currentLessonDoc.title,  // Sửa lesson -> currentLessonDoc
                    content: currentLessonDoc.content, // Sửa lesson -> currentLessonDoc
                    updatedBy: req.user._id
                });

                // 2. Giới hạn 50 phiên bản (Xóa bản cũ nhất nếu vượt quá)
                const count = await LessonRevision.countDocuments({ lessonId: currentLessonDoc._id });
                if (count > 50) {
                    // Tìm và xóa bản cũ nhất
                    const oldest = await LessonRevision.findOne({ lessonId: currentLessonDoc._id }).sort({ createdAt: 1 });
                    if (oldest) {
                        await LessonRevision.findByIdAndDelete(oldest._id);
                    }
                }
            }
        } catch (revErr) {
            console.error('Lỗi lưu lịch sử:', revErr);
            // Không return lỗi, vì việc lưu bài chính đã thành công
        }

        // --- 3. TRẢ KẾT QUẢ ---
        res.json({ 
            success: true, 
            newLessonId: savedLessonId,
            unitMapping: unitMapping,     // Frontend dùng cái này để update DOM Unit
            lessonMapping: lessonMapping  // Frontend dùng cái này để update DOM Lesson
        });

    } catch (err) {
        console.error("Save Error:", err);
        res.status(500).json({ success: false, error: err.message });
    }
};

exports.getLessonDetail = async (req, res) => {
    try {
        const { id } = req.params;
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(404).json({ success: false, error: 'ID không hợp lệ' });
        }
        const lesson = await Lesson.findById(id).lean();
        if (!lesson) {
            return res.status(404).json({ success: false, error: 'Không tìm thấy bài học' });
        }
        const canManage = await canManageLesson(req.user, lesson);
        if (!canManage) {
            return res.status(403).json({ success: false, error: 'Bạn không có quyền xem bài học này trong editor.' });
        }
        res.json({ success: true, lesson });
    } catch (err) {
        res.status(500).json({ success: false, error: 'Lỗi server: ' + err.message });
    }
};

// [NEW] Lấy danh sách lịch sử
exports.getRevisions = async (req, res) => {
    try {
        const { id } = req.params; // lessonId
        const lesson = await Lesson.findById(id).select('createdBy courseId').lean();
        if (!lesson) {
            return res.status(404).json({ success: false, error: 'Không tìm thấy bài học.' });
        }
        const canManage = await canManageLesson(req.user, lesson);
        if (!canManage) {
            return res.status(403).json({ success: false, error: 'Bạn không có quyền xem lịch sử bài học này.' });
        }
        // Chỉ lấy các trường cần thiết để nhẹ gánh (bỏ content)
        const revisions = await LessonRevision.find({ lessonId: id })
            .select('title createdAt updatedBy') 
            .populate('updatedBy', 'username')
            .sort({ createdAt: -1 }) // Mới nhất lên đầu
            .limit(50);
            
        res.json({ success: true, revisions });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// [NEW] Khôi phục phiên bản
exports.restoreRevision = async (req, res) => {
    try {
        const { revisionId } = req.params;
        const revision = await LessonRevision.findById(revisionId);
        
        if (!revision) return res.status(404).json({ success: false, error: 'Phiên bản không tồn tại' });

        const lesson = await Lesson.findById(revision.lessonId).select('createdBy courseId');
        if (!lesson) {
            return res.status(404).json({ success: false, error: 'Bài học gốc không còn tồn tại.' });
        }
        const canManage = await canManageLesson(req.user, lesson);
        if (!canManage) {
            return res.status(403).json({ success: false, error: 'Bạn không có quyền khôi phục phiên bản này.' });
        }

        // Update bài học hiện tại bằng nội dung của revision
        await Lesson.findByIdAndUpdate(revision.lessonId, {
            title: revision.title,
            content: revision.content,
            updatedAt: new Date()
        });

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// [FIX] Nhận thưởng học tập (Mỗi 5 phút) - Đã sửa logic cộng nước vào Garden
exports.claimStudyReward = async (req, res) => {
    try {
        const userId = req.user._id;
        
        // Lấy cả User (để check time) và Garden (để cộng nước)
        const user = await User.findById(userId);
        const garden = await Garden.findOne({ user: userId }); // [2] TÌM GARDEN

        if (!garden) {
            return res.status(404).json({ success: false, msg: 'Bạn chưa kích hoạt Linh Điền!' });
        }

        // 1. Chống Hack Speed/Spam Request
        const now = Date.now();
        // Lưu ý: Đảm bảo model User của bạn đã có trường lastStudyRewardAt
        // Nếu chưa có, bạn cần thêm vào schema User hoặc chuyển logic time này sang schema Garden
        const lastClaim = user.lastStudyRewardAt ? new Date(user.lastStudyRewardAt).getTime() : 0;
        const diff = now - lastClaim;

        if (diff < 290000) { // 290s = 4 phút 50 giây
            return res.status(429).json({ success: false, msg: 'Chưa đủ thời gian học!' });
        }

        // 2. Tính toán phần thưởng
        const bonus = Math.floor((user.level || 0) / 10); // Thêm fallback || 0 cho an toàn
        const reward = 1 + bonus;

        // 3. Cập nhật Dữ liệu
        // [3] CỘNG NƯỚC VÀO GARDEN (ĐÚNG)
        garden.water = (garden.water || 0) + reward; 
        await garden.save();

        // Cập nhật thời gian nhận thưởng vào User
        user.lastStudyRewardAt = now;
        await user.save();

        res.json({ 
            success: true, 
            reward: reward, 
            newWater: garden.water, // Trả về số nước mới trong Garden
            msg: `Bạn đã học chăm chỉ! Nhận +${reward} Nước 💧` 
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, msg: 'Lỗi server' });
    }
};
