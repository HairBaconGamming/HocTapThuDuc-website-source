// controllers/lessonController.js
const Lesson = require('../models/Lesson');
const Unit = require('../models/Unit');
const Course = require('../models/Course');
const LessonRevision = require('../models/LessonRevision');
const User = require('../models/User');

exports.saveLessonAjax = async (req, res) => {
    try {
        const { 
            title, content, type, subjectId, isPro, quizData, isPublished,
            curriculumSnapshot, currentEditingId, 
            courseId // <--- Bắt buộc phải có courseId gửi lên
        } = req.body;

        let savedLessonId = currentEditingId;
        let currentLessonDoc;

        // --- 1. XỬ LÝ BÀI HỌC HIỆN TẠI (Main Lesson) ---
        const lessonPayload = {
            title, content, type, subjectId, courseId, 
            isPro, isPublished,
            quizData: quizData ? JSON.parse(quizData) : [],
            createdBy: req.user._id
        };

        // Kiểm tra xem có phải bài mới không (current_new_lesson hoặc new_lesson_...)
        const isNewLesson = !currentEditingId || 
                            currentEditingId === 'current_new_lesson' || 
                            currentEditingId.startsWith('new_lesson_');

        if (isNewLesson) {
            // TẠO MỚI
            currentLessonDoc = new Lesson(lessonPayload);
            await currentLessonDoc.save();
            savedLessonId = currentLessonDoc._id.toString();
        } else {
            // CẬP NHẬT (Chỉ khi ID hợp lệ)
            if (require('mongoose').Types.ObjectId.isValid(currentEditingId)) {
                currentLessonDoc = await Lesson.findByIdAndUpdate(currentEditingId, lessonPayload, { new: true });
            } else {
                // Fallback: Tạo mới nếu ID rác
                currentLessonDoc = new Lesson(lessonPayload);
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
            // 1. Tạo bản lưu mới
            await LessonRevision.create({
                lessonId: lesson._id,
                title: lesson.title,
                content: lesson.content,
                updatedBy: req.user._id
            });

            // 2. Giới hạn 50 phiên bản (Xóa bản cũ nhất nếu vượt quá)
            const count = await LessonRevision.countDocuments({ lessonId: lesson._id });
            if (count > 50) {
                // Tìm và xóa bản cũ nhất (sort createdAt tăng dần -> cũ nhất lên đầu)
                const oldest = await LessonRevision.findOne({ lessonId: lesson._id }).sort({ createdAt: 1 });
                if (oldest) {
                    await LessonRevision.findByIdAndDelete(oldest._id);
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
        if (!require('mongoose').Types.ObjectId.isValid(id)) {
            return res.status(404).json({ success: false, error: 'ID không hợp lệ' });
        }
        const lesson = await require('../models/Lesson').findById(id).lean();
        if (!lesson) {
            return res.status(404).json({ success: false, error: 'Không tìm thấy bài học' });
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

// [NEW] Nhận thưởng học tập (Mỗi 5 phút)
exports.claimStudyReward = async (req, res) => {
    try {
        const userId = req.user._id;
        const user = await User.findById(userId);

        // 1. Chống Hack Speed/Spam Request
        // Kiểm tra lần nhận thưởng cuối cùng. Nếu < 4 phút 50 giây thì chặn.
        const now = Date.now();
        const lastClaim = user.lastStudyRewardAt ? new Date(user.lastStudyRewardAt).getTime() : 0;
        const diff = now - lastClaim;

        if (diff < 290000) { // 290s = 4 phút 50 giây (Cho phép sai số mạng 10s)
            return res.status(429).json({ success: false, msg: 'Chưa đủ thời gian học!' });
        }

        // 2. Tính toán phần thưởng
        // Cơ bản 1 nước + (Level / 10)
        const bonus = Math.floor(user.level / 10);
        const reward = 1 + bonus;

        // 3. Cập nhật User
        user.water += reward;
        user.lastStudyRewardAt = now;
        await user.save();

        res.json({ 
            success: true, 
            reward: reward, 
            newWater: user.water,
            msg: `Bạn đã học chăm chỉ! Nhận +${reward} Nước 💧` 
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, msg: 'Lỗi server' });
    }
};