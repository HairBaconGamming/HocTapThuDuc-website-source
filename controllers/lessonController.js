// controllers/lessonController.js
const Lesson = require('../models/Lesson');
const Unit = require('../models/Unit');
const Course = require('../models/Course');

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
                        // Nếu bài học đang sửa là bài mới tạo, ID của nó sẽ được update ở phần trên (logic Lesson cũ)
                        // Ở đây ta chỉ update order và unitId cho các bài *khác* trong list
                        const lId = (lNode.id === 'current_new_lesson') ? savedLessonId : lNode.id;
                        
                        if (lId && !lId.startsWith('new_lesson_')) {
                            await Lesson.findByIdAndUpdate(lId, {
                                unitId: currentUnitId,
                                order: lessonOrder
                            });
                        }
                    }
                }
            }
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