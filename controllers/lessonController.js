// controllers/lessonController.js
const Lesson = require('../models/Lesson');
const Unit = require('../models/Unit');
const Course = require('../models/Course'); // Import thêm

exports.saveLessonAjax = async (req, res) => {
    try {
        const { 
            title, content, type, subjectId, isPro, quizData, isPublished,
            curriculumSnapshot, currentEditingId, 
            courseId 
        } = req.body;

        let savedLessonId = currentEditingId;
        let currentLessonDoc;

        // --- 1. XỬ LÝ BÀI HỌC HIỆN TẠI ---
        const lessonPayload = {
            title, content, type, subjectId, courseId, 
            isPro, isPublished,
            quizData: quizData ? JSON.parse(quizData) : [],
            createdBy: req.user._id
        };

        // FIX LỖI Ở ĐÂY: Kiểm tra kỹ các trường hợp ID là bài mới
        // Bài mới có thể là: "current_new_lesson" (khi vào trang /add) HOẶC bắt đầu bằng "new_lesson_" (khi tạo từ cây)
        const isNewLesson = !currentEditingId || 
                            currentEditingId === 'current_new_lesson' || 
                            currentEditingId.startsWith('new_lesson_');

        if (isNewLesson) {
            // TẠO MỚI
            currentLessonDoc = new Lesson(lessonPayload);
            await currentLessonDoc.save();
            savedLessonId = currentLessonDoc._id; // Lấy ID thật vừa tạo
        } else {
            // CẬP NHẬT (Chỉ chạy vào đây khi ID là ObjectId thật)
            // Kiểm tra xem ID có hợp lệ không để tránh crash
            if (require('mongoose').Types.ObjectId.isValid(currentEditingId)) {
                currentLessonDoc = await Lesson.findByIdAndUpdate(currentEditingId, lessonPayload, { new: true });
            } else {
                // Nếu ID rác lọt vào đây -> coi như tạo mới
                currentLessonDoc = new Lesson(lessonPayload);
                await currentLessonDoc.save();
                savedLessonId = currentLessonDoc._id;
            }
        }

        // --- 2. XỬ LÝ CẤU TRÚC CÂY (SNAPSHOT) ---
        if (curriculumSnapshot && courseId) {
            let tree = JSON.parse(curriculumSnapshot);
            let hasStructureChange = false;

            // A. Duyệt tree để tạo các Unit/Lesson mới và map ID giả -> ID thật
            for (let uNode of tree) {
                // Unit mới
                if (uNode.id.startsWith('new_')) {
                    const newUnit = await Unit.create({
                        title: uNode.title,
                        courseId: courseId,
                        order: 9999 // Order tạm để không ảnh hưởng live
                    });
                    uNode.id = newUnit._id.toString();
                    hasStructureChange = true;
                } else {
                    // Cập nhật tên Unit (không thay đổi order khi chỉ lưu nháp)
                    if (require('mongoose').Types.ObjectId.isValid(uNode.id)) {
                        await Unit.findByIdAndUpdate(uNode.id, { title: uNode.title });
                    }
                }

                // Lessons trong Unit
                if (uNode.lessons && uNode.lessons.length > 0) {
                    for (let lNode of uNode.lessons) {
                        // Map ID giả sang ID thật (nếu là bài đang lưu hoặc current_new_lesson)
                        if (lNode.id === currentEditingId || lNode.id === 'current_new_lesson') {
                            lNode.id = savedLessonId.toString();
                        } else if (lNode.id.startsWith('new_lesson_')) {
                            const newL = await Lesson.create({
                                title: lNode.title,
                                unitId: uNode.id, // tạm gán Unit cha
                                courseId: courseId,
                                subjectId: subjectId,
                                order: 9999, // tạm
                                type: 'theory', content: '',
                                isPublished: false,
                                createdBy: req.user._id
                            });
                            lNode.id = newL._id.toString();
                            hasStructureChange = true;
                        } else {
                            // Cập nhật tên bài nếu cần
                            if (require('mongoose').Types.ObjectId.isValid(lNode.id)) {
                                await Lesson.findByIdAndUpdate(lNode.id, { title: lNode.title });
                            }
                        }
                    }
                }
            }

            // B. Nếu Publish -> APPLY cấu trúc vào DB (cập nhật order, unitId)
            if (isPublished) {
                console.log('🚀 Publishing tree to live...');
                for (let [uIdx, uNode] of tree.entries()) {
                    await Unit.findByIdAndUpdate(uNode.id, { order: uIdx + 1 });
                    if (uNode.lessons && uNode.lessons.length > 0) {
                        for (let [lIdx, lNode] of uNode.lessons.entries()) {
                            if (require('mongoose').Types.ObjectId.isValid(lNode.id)) {
                                await Lesson.findByIdAndUpdate(lNode.id, {
                                    unitId: uNode.id,
                                    order: lIdx + 1
                                });
                            }
                        }
                    }
                }

                // Remove draft
                await Course.findByIdAndUpdate(courseId, { draftTree: null, lastEditedLessonId: savedLessonId });

            } else {
                // C. Draft mode: lưu tree JSON vào Course.draftTree (đã map ID thật nếu có)
                console.log('📝 Saving draft tree...');
                await Course.findByIdAndUpdate(courseId, {
                    draftTree: JSON.stringify(tree),
                    lastEditedLessonId: savedLessonId
                });
            }
        }

        res.json({ success: true, newLessonId: savedLessonId });

    } catch (err) {
        console.error("Save Error:", err);
        res.status(500).json({ success: false, error: err.message });
    }
};

exports.getLessonDetail = async (req, res) => {
    try {
        const { id } = req.params;

        // 1. Kiểm tra ID hợp lệ (tránh lỗi CastError của MongoDB)
        if (!require('mongoose').Types.ObjectId.isValid(id)) {
            return res.status(404).json({ success: false, error: 'ID bài học không hợp lệ' });
        }

        // 2. Tìm bài học
        const lesson = await require('../models/Lesson').findById(id).lean();

        // 3. Nếu không thấy -> Trả về JSON 404 (Không được render view!)
        if (!lesson) {
            return res.status(404).json({ success: false, error: 'Không tìm thấy bài học này' });
        }

        // 4. Thành công
        res.json({ success: true, lesson });

    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: 'Lỗi server: ' + err.message });
    }
};