// controllers/lessonController.js
const Lesson = require('../models/Lesson');
const Unit = require('../models/Unit');
const Course = require('../models/Course');

exports.saveLessonAjax = async (req, res) => {
    try {
        const { 
            title, content, type, subjectId, isPro, quizData, isPublished,
            curriculumSnapshot, currentEditingId, 
            courseId 
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

            // A. Duyệt tree để tạo các Unit/Lesson mới và map ID giả -> ID thật
            for (let uNode of tree) {
                // --- XỬ LÝ UNIT ---
                if (uNode.id.startsWith('new_unit_')) {
                    const tempId = uNode.id;
                    const newUnit = await Unit.create({
                        title: uNode.title,
                        courseId: courseId,
                        order: 9999 // Order tạm
                    });
                    
                    // Cập nhật ID trong tree memory để lưu xuống DB (Draft/Live)
                    uNode.id = newUnit._id.toString();
                    
                    // [QUAN TRỌNG] Lưu vào mapping để trả về Client
                    unitMapping[tempId] = uNode.id;
                } else {
                    // Cập nhật tên Unit cũ
                    if (require('mongoose').Types.ObjectId.isValid(uNode.id)) {
                        await Unit.findByIdAndUpdate(uNode.id, { title: uNode.title });
                    }
                }

                // --- XỬ LÝ LESSONS CON ---
                if (uNode.lessons && uNode.lessons.length > 0) {
                    for (let lNode of uNode.lessons) {
                        
                        // Case 1: Bài đang sửa (Main)
                        if (lNode.id === currentEditingId || lNode.id === 'current_new_lesson') {
                            lNode.id = savedLessonId;
                        } 
                        // Case 2: Bài mới khác được tạo nhanh trên cây (new_lesson_...)
                        else if (lNode.id.startsWith('new_lesson_')) {
                            const tempLId = lNode.id;
                            const newL = await Lesson.create({
                                title: lNode.title,
                                unitId: uNode.id, // Gán vào ID thật của Unit (vừa tạo hoặc có sẵn)
                                courseId: courseId,
                                subjectId: subjectId,
                                order: 9999,
                                type: 'theory', content: '',
                                isPublished: false,
                                createdBy: req.user._id
                            });
                            
                            lNode.id = newL._id.toString();
                            lessonMapping[tempLId] = lNode.id; // Lưu mapping
                        } 
                        // Case 3: Bài cũ -> Cập nhật tên
                        else {
                            if (require('mongoose').Types.ObjectId.isValid(lNode.id)) {
                                await Lesson.findByIdAndUpdate(lNode.id, { title: lNode.title });
                            }
                        }
                    }
                }
            }

            // B. Chế độ PUBLISH -> APPLY cấu trúc vào DB (cập nhật order, unitId)
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

                // Xóa bản nháp sau khi Publish
                await Course.findByIdAndUpdate(courseId, { draftTree: null, lastEditedLessonId: savedLessonId });

            } else {
                // C. Chế độ DRAFT -> Lưu JSON vào Course.draftTree
                console.log('📝 Saving draft tree...');
                await Course.findByIdAndUpdate(courseId, {
                    draftTree: JSON.stringify(tree), // Tree này đã chứa toàn bộ ID thật
                    lastEditedLessonId: savedLessonId
                });
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