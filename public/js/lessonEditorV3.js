/**
 * LESSON EDITOR V3 - FINAL FULL STABLE
 * Features: 
 * - TreeList (Draft/Live Mode, Sortable)
 * - Block Editor (EasyMDE, Smart Video, Advanced Quiz)
 * - AJAX Saving (Publish/Draft)
 */

// --- GLOBAL VARIABLES ---
let blocks = [];       // Lưu trữ nội dung các khối (JSON)
let editors = {};      // Quản lý các instance EasyMDE
let activeLessonId = null; // ID bài đang chọn (có thể là new_... hoặc ID thật)
let blockInsertIndex = -1; // Vị trí chèn khối mới
let currentLessonId = window.location.pathname.split('/').pop(); // ID từ URL

// Xử lý trường hợp URL là /add
if (currentLessonId === 'add') currentLessonId = 'current_new_lesson';

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
    initApp();
    
    // Live Update Title: Gõ ở giữa -> Cập nhật tên bên trái cây
    const titleInput = document.getElementById('mainTitleInput');
    if(titleInput) {
        titleInput.addEventListener('input', (e) => {
            const val = e.target.value;
            if(activeLessonId) {
                const treeItem = document.querySelector(`.tree-lesson[data-lesson-id="${activeLessonId}"]`);
                if(treeItem) {
                    const treeInput = treeItem.querySelector('.lesson-title-input');
                    if(treeInput) treeInput.value = val;
                }
            }
        });
    }
});

function initApp() {
    // 1. Init Curriculum Tree: Load danh sách môn học nếu có sẵn value
    const subIdElement = document.getElementById('selectSubject');
    if (subIdElement && subIdElement.value) {
        loadCourses(subIdElement.value);
    }

    // 2. Click outside to close Block Menu
    document.addEventListener('click', (e) => {
        const menu = document.getElementById('blockMenu');
        if (menu && menu.style.display === 'block') {
            if (!menu.contains(e.target) && 
                !e.target.closest('.add-block-placeholder') && 
                !e.target.closest('.inserter-line') &&
                !e.target.closest('.btn-icon-mini')) {
                closeBlockMenu();
            }
        }
    });
}

// Helper set text status
function setSaveStatus(text) {
    const el = document.getElementById('saveStatus');
    if (el) el.innerText = text;
}

/* ==========================================================================
   PART 1: LEFT PANEL - CURRICULUM TREE & COURSE MANAGER
   ========================================================================== */

// --- 1. KHI CHỌN MÔN HỌC -> LOAD DANH SÁCH KHÓA HỌC ---
async function loadCourses(subjectId) {
    const courseGroup = document.getElementById('courseSelectGroup');
    const courseSelect = document.getElementById('selectCourse');
    const treeContainer = document.getElementById('treeContainer');
    const btnAdd = document.getElementById('btnAddUnitMain');
    const hiddenSub = document.getElementById('hiddenSubjectId');

    // Reset UI
    if(hiddenSub) hiddenSub.value = subjectId;
    if(courseSelect) courseSelect.innerHTML = '<option value="">Đang tải...</option>';
    if(treeContainer) treeContainer.innerHTML = '<div class="empty-state">Vui lòng chọn khóa học.</div>';
    if(btnAdd) btnAdd.style.display = 'none';

    if(!subjectId) {
        if(courseGroup) courseGroup.style.display = 'none';
        return;
    }

    try {
        const res = await fetch(`/api/courses/by-subject/${subjectId}`);
        const courses = await res.json();
        
        if(courseSelect) {
            courseSelect.innerHTML = '<option value="">-- Chọn Khóa Học --</option>';
            if(courses.length > 0) {
                courses.forEach(c => {
                    courseSelect.innerHTML += `<option value="${c._id}">${c.title}</option>`;
                });
            } else {
                courseSelect.innerHTML = '<option value="">(Chưa có khóa học nào)</option>';
            }
        }
        
        if(courseGroup) courseGroup.style.display = 'block';

    } catch(err) {
        console.error(err);
        Swal.fire('Lỗi', 'Không tải được danh sách khóa học', 'error');
    }
}

// --- 2. KHI CHỌN KHÓA HỌC -> LOAD CẤU TRÚC (TREE) ---
async function loadCurriculumByCourse(courseId) {
    const container = document.getElementById('treeContainer');
    const btnAdd = document.getElementById('btnAddUnitMain');
    const hiddenCourse = document.getElementById('hiddenCourseId');
    
    if(hiddenCourse) hiddenCourse.value = courseId;

    if(!courseId) {
        if(container) container.innerHTML = '<div class="empty-state">Vui lòng chọn khóa học.</div>';
        if(btnAdd) btnAdd.style.display = 'none';
        return;
    }

    // Hiệu ứng Loading
    if(container) container.innerHTML = '<div style="text-align:center; padding:30px; color:#666;"><i class="fas fa-spinner fa-spin fa-2x"></i><br><br>Đang tải giáo trình...</div>';

    try {
        const res = await fetch(`/api/tree/by-course/${courseId}`);
        const data = await res.json();
        
        if(container) container.innerHTML = '';

        // KIỂM TRA: LÀ BẢN NHÁP HAY LIVE?
        if (data.source === 'draft') {
            const alertHtml = `
                <div style="background:#fff7ed; color:#c2410c; padding:12px; margin-bottom:15px; border-radius:6px; border:1px solid #ffedd5; display:flex; justify-content:space-between; align-items:center; font-size:0.9rem;">
                    <div>
                        <i class="fas fa-exclamation-triangle"></i> 
                        <b>Chế độ Bản Nháp</b><br>
                        <span style="font-size:0.8rem; opacity:0.8">Thay đổi chưa được công khai.</span>
                    </div>
                    <button type="button" onclick="discardDraft('${courseId}')" style="border:none; background:white; border:1px solid #c2410c; color:#c2410c; padding:4px 8px; border-radius:4px; cursor:pointer; font-size:0.75rem;">
                        <i class="fas fa-undo"></i> Hủy nháp
                    </button>
                </div>`;
            container.innerHTML = alertHtml;
            renderTreeFromJson(data.tree); 
        } else {
            // Live mode
            renderTreeFromJson(data.tree); 
        }

        if(btnAdd) btnAdd.style.display = 'block';

        // Tự động mở bài học lần trước đang sửa
        if(data.lastEditedId) {
            setTimeout(() => {
                const item = document.querySelector(`.tree-lesson[data-lesson-id="${data.lastEditedId}"]`);
                if(item) item.click();
            }, 500);
        }

    } catch(err) {
        console.error(err);
        if(container) container.innerHTML = '<div style="color:red; text-align:center; padding:20px;">Lỗi tải dữ liệu cây.<br>Vui lòng thử lại.</div>';
    }
}

// --- 3. RENDER TREE TỪ JSON ---
function renderTreeFromJson(units) {
    const container = document.getElementById('treeContainer');
    
    // Tạo wrapper riêng để không xóa mất Alert Draft
    let listWrapper = document.getElementById('treeListWrapper');
    if(!listWrapper) {
        listWrapper = document.createElement('div');
        listWrapper.id = 'treeListWrapper';
        container.appendChild(listWrapper);
    } else {
        listWrapper.innerHTML = '';
    }

    if(!units || units.length === 0) {
        listWrapper.innerHTML = '<div class="empty-state" style="margin-top:20px;">Khóa học này chưa có chương nào.</div>';
        return;
    }

    // Render từng Unit
    units.forEach(u => {
        const uId = u.id || u._id;
        createUnitDOM(uId, u.title, u.lessons, listWrapper);
    });
    
    // Sortable cho Chương
    if(typeof Sortable !== 'undefined') {
        new Sortable(listWrapper, {
            handle: '.tree-unit-header',
            animation: 150,
            ghostClass: 'sortable-ghost'
        });
    }
}

// --- 4. CREATE UNIT DOM (Hỗ trợ targetContainer) ---
function createUnitDOM(id, title, lessons = [], targetContainer) {
    // Nếu không truyền container thì lấy mặc định (cho trường hợp thêm mới)
    const container = targetContainer || document.getElementById('treeListWrapper') || document.getElementById('treeContainer');

    const unitEl = document.createElement('div');
    unitEl.className = 'tree-unit';
    unitEl.dataset.unitId = id; 

    unitEl.innerHTML = `
        <div class="tree-unit-header">
            <div style="display:flex; align-items:center; flex-grow:1;">
                <i class="fas fa-grip-vertical" style="color:#ccc; cursor:grab; margin-right:8px;" title="Kéo để sắp xếp chương"></i>
                <input type="text" class="unit-title-input" value="${title}" 
                       placeholder="Nhập tên chương..."
                       onchange="this.setAttribute('value', this.value)">
            </div>
            <div class="tree-actions">
                <button type="button" class="btn-icon-mini" onclick="addTempLessonToUnit(this)" title="Thêm bài vào chương này"><i class="fas fa-plus"></i></button>
                <button type="button" class="btn-icon-mini" onclick="deleteUnitDOM(this)" title="Xóa chương"><i class="fas fa-trash"></i></button>
            </div>
        </div>
        <div class="tree-lesson-list" data-unit-id="${id}"></div>
    `;

    const listContainer = unitEl.querySelector('.tree-lesson-list');

    // Render Lessons bên trong
    if(lessons && lessons.length > 0) {
        lessons.forEach(l => {
            const lId = l.id || l._id;
            const lessonObj = { _id: lId, title: l.title, type: l.type, isPublished: l.isPublished };
            const isCurrent = (String(lId) === String(activeLessonId));
            listContainer.appendChild(createLessonDOM(lessonObj, isCurrent));
        });
    }

    container.appendChild(unitEl);

    // Sortable cho Bài học
    if(typeof Sortable !== 'undefined') {
        new Sortable(listContainer, {
            group: 'lessons', 
            handle: '.drag-handle',
            animation: 150,
            ghostClass: 'sortable-ghost'
        });
    }
    
    // Auto focus nếu tên rỗng
    if(title === '') {
        setTimeout(() => unitEl.querySelector('.unit-title-input').focus(), 100);
    }
}

// --- 5. CREATE LESSON DOM (Duy nhất) ---
function createLessonDOM(lesson, isCurrent = false) {
    const el = document.createElement('div');
    const lessonId = lesson._id || lesson.id;
    
    // Class Active
    el.className = `tree-lesson ${String(lessonId) === String(activeLessonId) ? 'active' : ''}`;
    el.dataset.lessonId = lessonId;
    
    // Icon loại bài học
    let icon = '<i class="fas fa-file-alt"></i>';
    if(lesson.type === 'video') icon = '<i class="fas fa-video"></i>';
    if(lesson.type === 'question' || lesson.type === 'quiz') icon = '<i class="fas fa-question-circle"></i>';

    // Trạng thái Nháp
    let statusIcon = '';
    if (lesson.isPublished === false || String(lessonId).startsWith('new_') || lessonId === 'current_new_lesson') {
        statusIcon = `<i class="fas fa-pencil-ruler" style="font-size: 0.7rem; color: #f59e0b;" title="Bản nháp"></i>`;
    }

    // --- CẤU TRÚC HTML MỚI (CÓ NÚT XÓA) ---
    // Sử dụng Flexbox để căn chỉnh: [Drag][Icon][Input] ......... [Status][Delete]
    el.innerHTML = `
        <div style="display:flex; align-items:center; flex-grow:1; overflow:hidden; padding-right:5px;">
            <i class="fas fa-ellipsis-v drag-handle" style="margin-right:8px; cursor:grab; color:#ccc;"></i>
            <span class="lesson-icon" style="margin-right:8px;">${icon}</span>
            <input type="text" class="lesson-title-input" value="${lesson.title}" 
                   onchange="this.setAttribute('value', this.value)" 
                   onclick="event.stopPropagation()"
                   style="flex-grow:1; border:none; background:transparent; min-width:0;"> 
        </div>
        
        <div class="lesson-actions" style="display:flex; align-items:center; gap:8px;">
            ${statusIcon}
            <button type="button" class="btn-icon-mini delete-lesson-btn" 
                    title="Xóa bài học" 
                    onclick="deleteLessonDOM(this, '${lessonId}', event)">
                <i class="fas fa-times" style="color:#ef4444;"></i>
            </button>
        </div>
    `;

    // Sự kiện click chọn bài
    el.onclick = () => selectLesson(lessonId, lesson.title, lesson.type);
    
    // Live update title
    const input = el.querySelector('input');
    input.addEventListener('input', (e) => {
        if(String(lessonId) === String(activeLessonId)) {
            const mainInput = document.getElementById('mainTitleInput');
            if(mainInput) mainInput.value = e.target.value;
        }
    });

    return el;
}

/* --- HÀM XÓA BÀI HỌC --- */
async function deleteLessonDOM(btn, lessonId, event) {
    // Ngăn sự kiện click lan ra ngoài (để không kích hoạt selectLesson)
    event.stopPropagation(); 

    // Xác nhận xóa
    const result = await Swal.fire({
        title: 'Xóa bài học này?',
        text: "Hành động này không thể hoàn tác!",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#d33',
        cancelButtonColor: '#3085d6',
        confirmButtonText: 'Xóa ngay',
        cancelButtonText: 'Hủy'
    });

    if (!result.isConfirmed) return;

    const lessonEl = btn.closest('.tree-lesson');

    // TRƯỜNG HỢP 1: Bài mới (Chưa lưu vào DB) -> Xóa trên giao diện thôi
    if (lessonId.startsWith('new_') || lessonId === 'current_new_lesson') {
        lessonEl.remove();
        
        // Nếu đang chọn bài này thì reset editor
        if (lessonId === activeLessonId) {
            document.getElementById('editorMainPanel').style.display = 'none';
            document.getElementById('emptyStatePanel').style.display = 'block';
            activeLessonId = null;
        }
        
        Swal.fire('Đã xóa', 'Đã xóa bài học nháp.', 'success');
        return;
    }

    // TRƯỜNG HỢP 2: Bài đã có trong DB -> Gọi API xóa thật
    try {
        // Gọi API xóa (Backend đã có route này trong server.js)
        const res = await fetch(`/lesson/${lessonId}/delete`, { method: 'POST' });
        
        // Lưu ý: Route cũ của bạn có thể redirect về dashboard, 
        // nên check res.ok hoặc res.redirected là đủ.
        // Tốt nhất backend nên trả về JSON {success: true}
        
        if (res.ok) {
            lessonEl.remove();
            
            if (lessonId === activeLessonId) {
                document.getElementById('editorMainPanel').style.display = 'none';
                document.getElementById('emptyStatePanel').style.display = 'block';
                activeLessonId = null;
            }
            
            Swal.fire('Đã xóa', 'Bài học đã được xóa vĩnh viễn.', 'success');
        } else {
            Swal.fire('Lỗi', 'Không thể xóa bài học.', 'error');
        }
    } catch (err) {
        console.error(err);
        Swal.fire('Lỗi', 'Lỗi kết nối server.', 'error');
    }
}

// --- 6. ACTIONS (Thêm Chương, Thêm Bài, Xóa Chương) ---

function addTempUnit() {
    const tempId = 'new_unit_' + Date.now();
    createUnitDOM(tempId, '', []);
}

function addTempLessonToUnit(btn) {
    const unitEl = btn.closest('.tree-unit');
    const listContainer = unitEl.querySelector('.tree-lesson-list');
    
    const tempId = 'new_lesson_' + Date.now();
    const tempLesson = { _id: tempId, title: 'Bài học mới', type: 'theory', isPublished: false };

    const lessonDOM = createLessonDOM(tempLesson, false);
    listContainer.appendChild(lessonDOM);

    // Tự động chọn bài vừa tạo
    selectLesson(tempId, 'Bài học mới');
    
    // Focus vào ô nhập tên Ở GIỮA
    setTimeout(() => {
        const mainTitle = document.getElementById('mainTitleInput');
        if(mainTitle) mainTitle.select();
    }, 200);
}

/* --- HÀM XÓA CHƯƠNG (CẬP NHẬT: XÓA CẢ BÀI HỌC CON) --- */
async function deleteUnitDOM(btn) {
    const unitEl = btn.closest('.tree-unit');
    const lessons = unitEl.querySelectorAll('.tree-lesson');
    const lessonCount = lessons.length;

    // 1. Xác định nội dung cảnh báo
    let title = 'Xóa chương này?';
    let text = "Hành động này sẽ xóa chương khỏi cấu trúc.";
    let confirmBtnText = 'Xóa chương';

    if (lessonCount > 0) {
        title = `CẢNH BÁO: Chương này có ${lessonCount} bài học!`;
        text = "Nếu bạn xóa chương này, TẤT CẢ bài học bên trong cũng sẽ bị xóa khỏi danh sách. Bạn có chắc chắn không?";
        confirmBtnText = 'Đồng ý xóa tất cả';
    }

    // 2. Hiển thị Popup xác nhận
    const result = await Swal.fire({
        title: title,
        text: text,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#d33',
        cancelButtonColor: '#3085d6',
        confirmButtonText: confirmBtnText,
        cancelButtonText: 'Hủy'
    });

    if (!result.isConfirmed) return;

    // 3. Xử lý Logic Xóa
    // Kiểm tra xem bài đang sửa (activeLessonId) có nằm trong chương bị xóa không
    let isActiveLessonInside = false;
    if (activeLessonId) {
        const activeItem = unitEl.querySelector(`.tree-lesson[data-lesson-id="${activeLessonId}"]`);
        if (activeItem) isActiveLessonInside = true;
    }

    // Hiệu ứng xóa UI
    unitEl.style.transition = 'all 0.3s ease';
    unitEl.style.opacity = '0';
    unitEl.style.transform = 'scale(0.95)';
    
    setTimeout(() => {
        unitEl.remove();

        // Nếu bài đang mở bị xóa theo chương -> Reset màn hình Editor về trống
        if (isActiveLessonInside) {
            document.getElementById('editorMainPanel').style.display = 'none';
            document.getElementById('emptyStatePanel').style.display = 'block';
            activeLessonId = null;
            document.getElementById('currentEditingId').value = '';
        }

        Swal.fire('Đã xóa', 'Chương và các bài học bên trong đã được xóa.', 'success');
    }, 300);
}

// --- 7. TẠO KHÓA HỌC NHANH (Popup) ---
async function promptCreateCourse() {
    const subjectSelect = document.getElementById('selectSubject');
    const subjectId = subjectSelect ? subjectSelect.value : null;
    if(!subjectId) return Swal.fire('Lỗi', 'Chọn môn học trước', 'warning');

    const { value: title } = await Swal.fire({
        title: 'Tạo Khóa Học Mới',
        input: 'text',
        inputPlaceholder: 'Ví dụ: Toán 12 Nâng Cao',
        showCancelButton: true,
        confirmButtonText: 'Tạo ngay'
    });

    if(title) {
        try {
            const res = await fetch('/api/courses/quick-create', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ title, subjectId })
            });
            const data = await res.json();
            
            if(data.success) {
                await loadCourses(subjectId);
                const courseSelect = document.getElementById('selectCourse');
                if(courseSelect) courseSelect.value = data.course._id;
                loadCurriculumByCourse(data.course._id);
                Swal.fire({ icon: 'success', title: 'Đã tạo khóa học mới!', toast: true, position: 'top-end', showConfirmButton: false, timer: 3000 });
            }
        } catch(err) {
            Swal.fire('Lỗi', 'Không tạo được khóa học', 'error');
        }
    }
}

/* --- HÀM XÓA KHÓA HỌC HIỆN TẠI --- */
async function deleteCurrentCourse() {
    const courseSelect = document.getElementById('selectCourse');
    const courseId = courseSelect.value;
    const courseName = courseSelect.options[courseSelect.selectedIndex]?.text;

    if (!courseId) {
        return Swal.fire('Lỗi', 'Vui lòng chọn khóa học cần xóa.', 'warning');
    }

    // Cảnh báo mạnh
    const result = await Swal.fire({
        title: 'Xóa khóa học này?',
        html: `Bạn đang xóa khóa học: <b>${courseName}</b>.<br><br>
               <span style="color:red; font-weight:bold;">CẢNH BÁO:</span> 
               Tất cả Chương và Bài học bên trong sẽ bị xóa vĩnh viễn!`,
        icon: 'error',
        showCancelButton: true,
        confirmButtonColor: '#d33',
        cancelButtonColor: '#3085d6',
        confirmButtonText: 'Xóa vĩnh viễn',
        cancelButtonText: 'Hủy'
    });

    if (result.isConfirmed) {
        try {
            // Gọi API
            const res = await fetch(`/api/course/${courseId}/delete`, { method: 'POST' });
            const data = await res.json();

            if (data.success) {
                Swal.fire('Đã xóa', 'Khóa học đã bị xóa thành công.', 'success');
                
                // Refresh lại danh sách khóa học
                const subjectId = document.getElementById('selectSubject').value;
                loadCourses(subjectId);
                
                // Reset cây thư mục
                document.getElementById('treeContainer').innerHTML = '<div class="empty-state">Vui lòng chọn khóa học.</div>';
                document.getElementById('btnAddUnitMain').style.display = 'none';
            } else {
                Swal.fire('Lỗi', data.error || 'Không thể xóa khóa học.', 'error');
            }
        } catch (err) {
            console.error(err);
            Swal.fire('Lỗi', 'Lỗi kết nối server.', 'error');
        }
    }
}

// --- 8. HỦY BỎ BẢN NHÁP ---
async function discardDraft(courseId) {
    const result = await Swal.fire({
        title: 'Hủy bỏ bản nháp?',
        text: "Mọi thay đổi chưa đăng sẽ bị mất vĩnh viễn! Cấu trúc sẽ quay về phiên bản đang hiển thị cho học sinh.",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#d33',
        confirmButtonText: 'Đồng ý hủy',
        cancelButtonText: 'Giữ lại'
    });

    if (result.isConfirmed) {
        try {
            const res = await fetch(`/api/course/${courseId}/discard-draft`, { method: 'POST' });
            const data = await res.json();
            if (data.success) {
                loadCurriculumByCourse(courseId);
                Swal.fire('Hoàn tất', 'Bản nháp đã được hủy.', 'success');
            } else {
                Swal.fire('Lỗi', 'Không thể hủy bản nháp', 'error');
            }
        } catch (err) {
            Swal.fire('Lỗi', 'Lỗi kết nối server', 'error');
        }
    }
}

/* --- QUẢN LÝ CẤU HÌNH KHÓA HỌC --- */

// 1. Mở Modal và Load dữ liệu
async function openCourseSettings() {
    const courseId = document.getElementById('selectCourse').value;
    if (!courseId) return Swal.fire('Lỗi', 'Vui lòng chọn khóa học trước.', 'warning');

    try {
        // Fetch thông tin chi tiết khóa học
        const res = await fetch(`/api/course/${courseId}/details`);
        const data = await res.json();

        if (data.success) {
            const c = data.course;
            document.getElementById('settingCourseTitle').value = c.title;
            document.getElementById('settingCourseThumb').value = c.thumbnail || '';
            document.getElementById('thumbPreview').src = c.thumbnail || '/img/default-course.jpg';
            document.getElementById('settingCourseDesc').value = c.description || '';
            document.getElementById('settingCoursePro').checked = c.isPro || false;
            document.getElementById('settingCoursePublic').checked = c.isPublished;

            document.getElementById('courseSettingsModal').style.display = 'flex';
        } else {
            Swal.fire('Lỗi', 'Không tải được thông tin khóa học.', 'error');
        }
    } catch (e) {
        console.error(e);
        Swal.fire('Lỗi', 'Lỗi kết nối server.', 'error');
    }
}

// 2. Đóng Modal
function closeCourseSettings() {
    document.getElementById('courseSettingsModal').style.display = 'none';
}

// 3. Lưu Cấu hình
async function saveCourseSettings() {
    const courseId = document.getElementById('selectCourse').value;
    const title = document.getElementById('settingCourseTitle').value;
    const thumbnail = document.getElementById('settingCourseThumb').value;
    const description = document.getElementById('settingCourseDesc').value;
    const isPro = document.getElementById('settingCoursePro').checked;
    const isPublished = document.getElementById('settingCoursePublic').checked;

    if (!title.trim()) return Swal.fire('Lỗi', 'Tên khóa học không được để trống.', 'warning');

    try {
        const res = await fetch(`/api/course/${courseId}/update`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title, thumbnail, description, isPro, isPublished })
        });

        const result = await res.json();

        if (result.success) {
            Swal.fire('Thành công', 'Cập nhật khóa học thành công!', 'success');
            closeCourseSettings();
            
            // Cập nhật lại tên trong select box nếu đổi tên
            const select = document.getElementById('selectCourse');
            select.options[select.selectedIndex].text = title;
        } else {
            Swal.fire('Lỗi', result.error || 'Cập nhật thất bại.', 'error');
        }
    } catch (e) {
        console.error(e);
        Swal.fire('Lỗi', 'Lỗi kết nối server.', 'error');
    }
}

/* ==========================================================================
   PART 2: CENTER PANEL - LESSON SELECTION & BLOCK EDITOR
   ========================================================================== */

// --- 1. SELECT LESSON (SPA LOGIC) ---
async function selectLesson(id, titleFallback = 'Bài học mới', type = 'theory') {
    // A. UI Updates
    document.querySelectorAll('.tree-lesson').forEach(el => el.classList.remove('active'));
    const activeItem = document.querySelector(`.tree-lesson[data-lesson-id="${id}"]`);
    if(activeItem) activeItem.classList.add('active');

    const emptyStatePanel = document.getElementById('emptyStatePanel');
    if(emptyStatePanel) emptyStatePanel.style.display = 'none';
    
    const mainPanel = document.getElementById('editorMainPanel');
    if(mainPanel) mainPanel.style.display = 'contents';

    // B. Update State
    activeLessonId = id;
    const currentIdInput = document.getElementById('currentEditingId');
    if(currentIdInput) currentIdInput.value = id;
    
    const mainTitleInput = document.getElementById('mainTitleInput');
    if(mainTitleInput) mainTitleInput.value = titleFallback;
    
    setSaveStatus('Đang tải...');

    // C. Check New vs Old
    if(id === 'current_new_lesson' || String(id).startsWith('new_lesson_')) {
        // --- BÀI MỚI (Reset trắng) ---
        initBlocks(''); 
        const isProInp = document.getElementById('isProInput');
        if(isProInp) isProInp.checked = false;
        
        setSaveStatus('Bản nháp (Chưa lưu)');
        updateStatusBadge(false); // Luôn là nháp
        
        // Sync tên từ cây (nếu có)
        if(activeItem) {
            const currentTitleVal = activeItem.querySelector('.lesson-title-input').value;
            if(mainTitleInput) mainTitleInput.value = currentTitleVal;
        } else {
            if(mainTitleInput) mainTitleInput.value = '';
        }

    } else {
        // --- BÀI CŨ (Load từ API) ---
        try {
            const res = await fetch(`/api/lesson/${id}`);
            if (!res.ok) {
                // Nếu lỗi 404 hoặc 500
                if (res.status === 404) {
                    Swal.fire('Không tìm thấy', 'Bài học này có thể đã bị xóa.', 'warning');
                } else {
                    Swal.fire('Lỗi', `Server trả về lỗi: ${res.status}`, 'error');
                }
                setSaveStatus('Lỗi tải');
                return; 
            }
            const data = await res.json();
            
            if(data.success) {
                const l = data.lesson;
                if(mainTitleInput) mainTitleInput.value = l.title;
                
                const isProInp = document.getElementById('isProInput');
                if(isProInp) isProInp.checked = l.isPro;
                
                updateStatusBadge(l.isPublished);

                // Load Blocks
                initBlocks(l.content);
                
                setSaveStatus('Đã đồng bộ');
            } else {
                Swal.fire('Lỗi', 'Không thể tải nội dung bài học', 'error');
            }
        } catch(err) {
            console.error(err);
            Swal.fire('Lỗi', 'Lỗi kết nối server', 'error');
        }
    }
}

function updateStatusBadge(isPublished) {
    const badge = document.getElementById('publishStatusBadge');
    if (!badge) return;

    if (isPublished) {
        badge.className = 'status-badge published';
        badge.innerText = 'ĐÃ ĐĂNG';
        badge.style.background = '#dcfce7';
        badge.style.color = '#16a34a';
        badge.style.border = '1px solid #86efac';
    } else {
        badge.className = 'status-badge draft';
        badge.innerText = 'BẢN NHÁP';
        badge.style.background = '#f1f5f9';
        badge.style.color = '#64748b';
        badge.style.border = '1px solid #cbd5e1';
    }
}

// --- 2. BLOCK EDITOR CORE ---

function initBlocks(initialContent) {
    let parsed = null;
    
    // Parse JSON
    if (initialContent && initialContent.trim()) {
        try {
            parsed = JSON.parse(initialContent);
            if (!Array.isArray(parsed)) parsed = null;
        } catch (e) {
            parsed = null;
        }
    }

    if (parsed) {
        blocks = parsed;
    } else if (initialContent && initialContent.trim()) {
        // Fallback text cũ
        blocks = [{ type: 'text', data: { text: initialContent } }];
    } else {
        // Mặc định 1 block text
        blocks = [{ type: 'text', data: { text: '' } }];
    }

    renderBlocks();
    
    // Sortable Blocks (Kéo thả thứ tự nội dung)
    const canvas = document.getElementById('editorCanvas');
    if(canvas && typeof Sortable !== 'undefined') {
        new Sortable(canvas, {
            handle: '.drag-handle-block',
            animation: 150,
            ghostClass: 'sortable-ghost',
            onEnd: function (evt) {
                const item = blocks.splice(evt.oldIndex, 1)[0];
                blocks.splice(evt.newIndex, 0, item);
                renderBlocks(); // Re-render để cập nhật index
            }
        });
    }
}

// RENDER ALL BLOCKS
function renderBlocks() {
    cleanupEditors(); // Dọn dẹp editor cũ

    const canvas = document.getElementById('editorCanvas');
    if (!canvas) return;
    canvas.innerHTML = '';

    blocks.forEach((b, idx) => {
        const el = document.createElement('div');
        el.className = 'content-block';
        el.dataset.index = idx;

        // Header Controls
        const header = document.createElement('div');
        header.className = 'block-controls';
        header.innerHTML = `
            <div class="btn-ctrl drag-handle-block" title="Kéo thả"><i class="fas fa-grip-lines"></i></div>
            <button type="button" class="btn-ctrl" onclick="moveBlock(${idx}, -1)" title="Lên"><i class="fas fa-arrow-up"></i></button>
            <button type="button" class="btn-ctrl" onclick="moveBlock(${idx}, 1)" title="Xuống"><i class="fas fa-arrow-down"></i></button>
            <button type="button" class="btn-ctrl delete" onclick="deleteBlock(${idx})" title="Xóa"><i class="fas fa-trash"></i></button>
        `;
        el.appendChild(header);

        const body = document.createElement('div');
        body.className = 'block-body';

        // --- RENDER TYPE: TEXT ---
        if (b.type === 'text') {
            body.innerHTML = `<div class="block-label"><i class="fab fa-markdown"></i> Văn bản (Advanced)</div>`;
            const ta = document.createElement('textarea');
            ta.id = `editor-area-${idx}`;
            ta.className = 'easymde-input';
            ta.value = b.data && b.data.text ? b.data.text : '';
            body.appendChild(ta);

        // --- RENDER TYPE: IMAGE ---
        } else if (b.type === 'image') {
            body.innerHTML = `<div class="block-label"><i class="fas fa-image"></i> Hình ảnh</div>`;
            const inp = document.createElement('input');
            inp.className = 'studio-select';
            inp.placeholder = 'URL ảnh...';
            inp.value = b.data?.url || '';
            inp.addEventListener('change', (e) => { blocks[idx].data.url = e.target.value; renderBlocks(); });
            body.appendChild(inp);
            if(b.data?.url) {
                const img = document.createElement('img');
                img.src = b.data.url; img.style.maxWidth = '100%'; img.style.marginTop = '10px';
                body.appendChild(img);
            }

        // --- RENDER TYPE: VIDEO (SMART) ---
        } else if (b.type === 'video') {
            const data = b.data || {};
            const ratio = data.ratio || '16/9';
            const isAutoplay = data.autoplay || false;

            body.innerHTML = `<div class="block-label"><i class="fab fa-youtube"></i> Video / Embed Link</div>`;
            
            const wrapper = document.createElement('div');
            wrapper.className = 'video-block-wrapper';

            // Input
            wrapper.innerHTML = `
                <div class="video-input-group">
                    <input type="text" class="studio-select" 
                           placeholder="Dán link Youtube, Vimeo hoặc link file .mp4..." 
                           value="${data.url || ''}" 
                           onchange="updateVideoBlock(${idx}, 'url', this.value)">
                </div>
            `;

            // Preview
            const preview = document.createElement('div');
            preview.className = 'video-preview-box';
            preview.style.aspectRatio = ratio.replace('/', ' / ');
            
            if (data.url) {
                const embedInfo = getVideoTypeInfo(data.url);
                if (embedInfo.type === 'iframe') {
                    const embedSrc = getEmbedUrl(data.url, isAutoplay);
                    preview.innerHTML = embedSrc ? 
                        `<iframe src="${embedSrc}" frameborder="0" allow="autoplay; encrypted-media" allowfullscreen></iframe>` : 
                        `<div class="empty-preview">Link không hỗ trợ</div>`;
                } else {
                    preview.innerHTML = `<video src="${data.url}" controls ${isAutoplay ? 'autoplay muted' : ''} style="width:100%; height:100%"></video>`;
                }
            } else {
                preview.innerHTML = `<div class="empty-preview"><i class="fas fa-play-circle" style="font-size:2rem; opacity:0.3;"></i><span>Preview</span></div>`;
            }
            wrapper.appendChild(preview);

            // Settings
            const settingsDiv = document.createElement('div');
            settingsDiv.innerHTML = `
                <input type="text" class="studio-select" style="margin-top:10px; border:none; border-bottom:1px dashed #ccc;" placeholder="Chú thích (Caption)..." value="${data.caption || ''}" onchange="updateVideoBlock(${idx}, 'caption', this.value)">
                <div class="video-settings-toggle" onclick="this.nextElementSibling.classList.toggle('show')">Cấu hình nâng cao</div>
                <div class="video-settings-panel">
                    <div class="v-setting-item">
                        <label>Tỷ lệ</label>
                        <select class="studio-select" onchange="updateVideoBlock(${idx}, 'ratio', this.value)">
                            <option value="16/9" ${ratio === '16/9' ? 'selected' : ''}>16:9</option>
                            <option value="9/16" ${ratio === '9/16' ? 'selected' : ''}>9:16</option>
                        </select>
                    </div>
                    <div class="v-setting-item">
                        <label>Autoplay</label>
                        <input type="checkbox" ${isAutoplay ? 'checked' : ''} onchange="updateVideoBlock(${idx}, 'autoplay', this.checked)">
                    </div>
                </div>
            `;
            wrapper.appendChild(settingsDiv);
            body.appendChild(wrapper);

        // --- RENDER TYPE: QUESTION (QUIZ) ---
        } else if (b.type === 'question' || b.type === 'quiz') {
             el.classList.add('block-quiz');
             const questions = b.data?.questions || [];
             const summary = questions.length + ' câu hỏi';
             
             body.innerHTML = `
                <div class="block-label"><i class="fas fa-question-circle"></i> Bộ Câu Hỏi</div>
                <div style="display:flex; justify-content:space-between; align-items:center; margin-top:10px;">
                    <div style="font-size:0.9rem; color:#4b5563;"><strong>${summary}</strong></div>
                    <button type="button" class="btn-mini-add" onclick="editQuestionBlock(${idx})"><i class="fas fa-edit"></i> Chỉnh sửa</button>
                </div>
             `;
        
        // --- RENDER TYPE: CALLOUT ---
        } else if (b.type === 'callout') {
             el.classList.add('block-callout');
             body.innerHTML = `<div class="block-label"><i class="fas fa-exclamation-circle"></i> Ghi chú</div>`;
             const ta = document.createElement('textarea');
             ta.className = 'studio-select';
             ta.value = b.data?.text || '';
             ta.addEventListener('input', (e) => { blocks[idx].data.text = e.target.value; });
             body.appendChild(ta);
        }

        el.appendChild(body);
        canvas.appendChild(el);

        // Inserter Line
        const inserter = document.createElement('div');
        inserter.className = 'inserter-line';
        inserter.innerHTML = `<div class="inserter-btn"><i class="fas fa-plus"></i></div>`;
        
        // SỬA DÒNG NÀY: Truyền thêm (e) vào hàm
        inserter.onclick = (e) => openBlockMenu(idx, e);
        canvas.appendChild(inserter);
    });

    // Init EasyMDE for all text blocks
    initMarkdownEditors();
}

// --- 3. BLOCK HELPERS ---

function cleanupEditors() {
    Object.keys(editors).forEach(key => {
        if (editors[key]) {
            try { editors[key].toTextArea(); } catch(e) {}
            editors[key] = null;
        }
    });
    editors = {};
}

function initMarkdownEditors() {
    const textareas = document.querySelectorAll('.easymde-input');
    textareas.forEach(el => {
        const idx = parseInt(el.id.split('-')[2]);
        if(isNaN(idx) || !blocks[idx]) return;

        const easyMDE = new EasyMDE({
            element: el,
            spellChecker: false,
            status: false,
            minHeight: "150px",
            placeholder: "Viết nội dung bài học...",
            toolbar: ["bold", "italic", "heading", "|", "quote", "unordered-list", "ordered-list", "|", "link", "image", "table", "|", "preview", "side-by-side", "fullscreen"],
        });

        easyMDE.codemirror.on("change", () => {
            if(blocks[idx] && blocks[idx].data) {
                blocks[idx].data.text = easyMDE.value();
            }
        });
        editors[idx] = easyMDE;
    });
}

function openBlockMenu(index, event) {
    blockInsertIndex = index;
    const menu = document.getElementById('blockMenu');
    
    if (menu && event) {
        // 1. Hiển thị trước để trình duyệt tính toán kích thước thực
        menu.style.display = 'block';
        
        // 2. Lấy vị trí của nút bấm (Inserter Button)
        // event.currentTarget là dòng kẻ, ta lấy nút tròn bên trong hoặc chính dòng kẻ
        const rect = event.currentTarget.getBoundingClientRect();
        
        // 3. Tính toán vị trí Left (Căn giữa nút bấm)
        // rect.left + một nửa chiều rộng nút - một nửa chiều rộng menu
        const menuWidth = menu.offsetWidth || 200;
        let leftPos = rect.left + (rect.width / 2) - (menuWidth / 2);
        
        // Giới hạn không cho tràn màn hình trái/phải
        if (leftPos < 10) leftPos = 10;
        if (leftPos + menuWidth > window.innerWidth) leftPos = window.innerWidth - menuWidth - 10;

        menu.style.left = `${leftPos}px`;

        // 4. Tính toán vị trí Top/Bottom (Thông minh)
        const menuHeight = menu.offsetHeight || 300;
        const spaceBelow = window.innerHeight - rect.bottom;

        if (spaceBelow < menuHeight + 20) {
            // Nếu bên dưới hết chỗ -> Hiển thị BÊN TRÊN nút bấm
            menu.style.top = 'auto';
            menu.style.bottom = `${window.innerHeight - rect.top + 10}px`;
            
            // Thêm hiệu ứng xuất hiện từ dưới lên (Optional)
            menu.style.transformOrigin = 'bottom center';
        } else {
            // Nếu bên dưới còn chỗ -> Hiển thị BÊN DƯỚI nút bấm (Mặc định)
            menu.style.top = `${rect.bottom + 10}px`;
            menu.style.bottom = 'auto';
            
            menu.style.transformOrigin = 'top center';
        }
    }
}

function closeBlockMenu() {
    const menu = document.getElementById('blockMenu');
    if (menu) menu.style.display = 'none';
    blockInsertIndex = -2;
}

function addBlock(type) {
    const tpl = {
        text: { type: 'text', data: { text: '' } },
        image: { type: 'image', data: { url: '' } },
        video: { type: 'video', data: { url: '' } },
        callout: { type: 'callout', data: { text: '' } },
        question: { type: 'question', data: { questions: [] } }
    };
    
    const newBlock = JSON.parse(JSON.stringify(tpl[type]));

    if (blockInsertIndex === -1) blocks.push(newBlock);
    else blocks.splice(blockInsertIndex + 1, 0, newBlock);

    closeBlockMenu();
    renderBlocks();
}

function deleteBlock(index) {
    Swal.fire({
        title: 'Xóa khối này?', icon: 'warning', showCancelButton: true, confirmButtonText: 'Xóa'
    }).then((res) => {
        if(res.isConfirmed) {
            blocks.splice(index, 1);
            renderBlocks();
        }
    });
}

function moveBlock(index, dir) {
    const newIndex = index + dir;
    if(newIndex < 0 || newIndex >= blocks.length) return;
    const item = blocks.splice(index, 1)[0];
    blocks.splice(newIndex, 0, item);
    renderBlocks();
}

function serializeBlocks() {
    return JSON.stringify(blocks);
}

// --- VIDEO HELPERS ---
function updateVideoBlock(idx, field, value) {
    if (!blocks[idx].data) blocks[idx].data = {};
    blocks[idx].data[field] = value;
    renderBlocks(); 
}

function getVideoTypeInfo(url) {
    if (!url) return { type: 'unknown' };
    if (/(?:youtu\.be\/|youtube\.com\/|vimeo\.com\/)/.test(url)) return { type: 'iframe' };
    return { type: 'video' };
}

function getEmbedUrl(url, autoplay) {
    if (!url) return null;
    let embedUrl = null;
    const ytMatch = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([^#&?]*).*/);
    if (ytMatch && ytMatch[1]) {
        embedUrl = `https://www.youtube.com/embed/${ytMatch[1]}?rel=0`;
        if(autoplay) embedUrl += "&autoplay=1&mute=1";
    }
    const vimeoMatch = url.match(/vimeo\.com\/(\d+)/);
    if (vimeoMatch && vimeoMatch[1]) {
        embedUrl = `https://player.vimeo.com/video/${vimeoMatch[1]}`;
        if(autoplay) embedUrl += "?autoplay=1&muted=1";
    }
    return embedUrl || url; // Fallback to raw url
}

/* ==========================================================================
   PART 3: QUIZ BUILDER (MODAL LOGIC)
   ========================================================================== */

function editQuestionBlock(blockIndex) {
    const block = blocks[blockIndex];
    const modalId = `q-modal-${Date.now()}`;
    const containerId = `${modalId}-container`;

    Swal.fire({
        title: 'Biên soạn Bộ câu hỏi',
        html: `
            <div id="${modalId}" style="text-align:left; max-height:65vh; overflow-y:auto; padding-right:5px; padding-bottom:10px;">
                <div id="${containerId}"></div>
            </div>
            <div class="add-q-buttons">
                <button type="button" class="btn-add-q" onclick="addQuestionItem('${containerId}', 'choice')"><i class="fas fa-list-ul"></i> Trắc nghiệm</button>
                <button type="button" class="btn-add-q" onclick="addQuestionItem('${containerId}', 'fill')"><i class="fas fa-edit"></i> Điền từ</button>
                <button type="button" class="btn-add-q" onclick="addQuestionItem('${containerId}', 'essay')"><i class="fas fa-pen-nib"></i> Tự luận</button>
            </div>
        `,
        width: 850,
        showCancelButton: true,
        confirmButtonText: 'Lưu bộ đề',
        didOpen: () => {
            renderQuestionsToModal(block.data.questions || [], containerId);
        },
        preConfirm: () => {
            return serializeQuestionData(containerId);
        }
    }).then((result) => {
        if (result.isConfirmed) {
            try {
                block.data.questions = JSON.parse(result.value);
                renderBlocks();
            } catch (e) { console.error("Lỗi lưu câu hỏi", e); }
        }
    });
}

function renderQuestionsToModal(questions, containerId) {
    const container = document.getElementById(containerId);
    if(!container) return;
    container.innerHTML = '';
    questions.forEach((q, i) => renderSingleQuestionItem(q, i, container));
}

// Window helpers for inline HTML onclicks
window.addQuestionItem = function(containerId, type) {
    const container = document.getElementById(containerId);
    const idx = container.querySelectorAll('.quiz-item').length;
    let qData = { type: type, question: '', explanation: '' };

    if (type === 'choice') {
        qData.options = ['', '']; qData.correct = [0]; qData.isMulti = false;
    } else if (type === 'fill') {
        qData.content = 'Thủ đô của Việt Nam là [Hà Nội].';
    } else if (type === 'essay') {
        qData.modelAnswer = '';
    }
    renderSingleQuestionItem(qData, idx, container);
    container.lastElementChild.scrollIntoView({ behavior: 'smooth' });
}

window.addOptionToQuestion = function(btn, groupName) {
    const container = btn.closest('.quiz-item').querySelector('.q-options-container');
    const idx = container.querySelectorAll('.option-row').length;
    const isMulti = btn.closest('.quiz-item').querySelector('.q-multi-toggle').checked;
    const inputType = isMulti ? 'checkbox' : 'radio';

    const div = document.createElement('div');
    div.className = 'option-row';
    div.style.cssText = 'display:flex; align-items:center; gap:8px; margin-bottom:5px;';
    div.innerHTML = `
        <input type="${inputType}" name="${groupName}" class="q-correct-check" value="${idx}" style="cursor:pointer;">
        <input type="text" class="studio-select q-opt-val" value="" placeholder="Đáp án ${idx+1}">
        <button type="button" class="btn-ctrl delete" onclick="this.parentElement.remove()" tabindex="-1"><i class="fas fa-minus"></i></button>
    `;
    container.appendChild(div);
}

window.toggleMulti = function(checkbox, groupName) {
    const inputs = document.querySelectorAll(`input[name="${groupName}"]`);
    inputs.forEach(inp => {
        inp.type = checkbox.checked ? 'checkbox' : 'radio';
        inp.checked = false; 
    });
}

function renderSingleQuestionItem(q, idx, container) {
    const div = document.createElement('div');
    div.className = 'quiz-item';
    div.dataset.type = q.type;
    div.style.cssText = "background:#f9fafb; padding:15px; border:1px solid #e5e7eb; border-radius:8px; margin-bottom:15px; position:relative;";

    let badge = '', contentHtml = '';
    const deleteBtn = `<button type="button" class="btn-ctrl delete" style="position:absolute; top:10px; right:10px;" onclick="this.closest('.quiz-item').remove()"><i class="fas fa-trash"></i></button>`;

    if (q.type === 'choice' || !q.type) { 
        badge = `<span class="q-type-badge q-type-choice">TRẮC NGHIỆM</span>`;
        const uniqueName = `q_radio_${Date.now()}_${idx}`;
        const inputType = q.isMulti ? 'checkbox' : 'radio';
        const correctArr = Array.isArray(q.correct) ? q.correct : [q.correct];

        let optsHtml = '';
        (q.options || ['', '']).forEach((opt, i) => {
            const isChecked = correctArr.includes(i) ? 'checked' : '';
            optsHtml += `
                <div class="option-row" style="display:flex; align-items:center; gap:8px; margin-bottom:5px;">
                    <input type="${inputType}" name="${uniqueName}" class="q-correct-check" value="${i}" ${isChecked} style="cursor:pointer;">
                    <input type="text" class="studio-select q-opt-val" value="${opt}" placeholder="Đáp án ${i+1}">
                    <button type="button" class="btn-ctrl delete" onclick="this.parentElement.remove()" tabindex="-1"><i class="fas fa-minus"></i></button>
                </div>`;
        });

        contentHtml = `
            <input type="text" class="studio-select q-title" placeholder="Nhập câu hỏi..." value="${q.question}" style="font-weight:700; margin-bottom:10px;">
            <div class="q-options-container">${optsHtml}</div>
            <div style="margin-top:10px; display:flex; gap:10px;">
                <button type="button" class="btn-mini-add" onclick="addOptionToQuestion(this, '${uniqueName}')">+ Đáp án</button>
                <label style="font-size:0.8rem; display:flex; align-items:center; gap:5px;">
                    <input type="checkbox" class="q-multi-toggle" onchange="toggleMulti(this, '${uniqueName}')" ${q.isMulti ? 'checked' : ''}> Chọn nhiều
                </label>
            </div>
        `;
    } else if (q.type === 'fill') {
        badge = `<span class="q-type-badge q-type-fill">ĐIỀN TỪ</span>`;
        contentHtml = `
            <div class="q-hint">Viết câu hỏi và đặt đáp án đúng trong ngoặc vuông [ ]. Ví dụ: 1 + 1 = [2]</div>
            <textarea class="q-fill-input q-content" rows="3">${q.content || ''}</textarea>
        `;
    } else if (q.type === 'essay') {
        badge = `<span class="q-type-badge q-type-essay">TỰ LUẬN</span>`;
        contentHtml = `
            <input type="text" class="studio-select q-title" placeholder="Nhập đề bài tự luận..." value="${q.question}" style="font-weight:700; margin-bottom:10px;">
            <textarea class="q-model-answer" placeholder="Nhập đáp án mẫu hoặc gợi ý chấm điểm...">${q.modelAnswer || ''}</textarea>
        `;
    }

    const explainHtml = `
        <div style="margin-top:10px; border-top:1px dashed #ddd; padding-top:5px;">
            <input type="text" class="studio-select q-explain" placeholder="Giải thích đáp án (Tùy chọn)..." value="${q.explanation || ''}" style="font-size:0.85rem; background:#fff;">
        </div>
    `;

    div.innerHTML = `${deleteBtn} <div style="margin-bottom:10px;">${badge} <strong>Câu ${idx+1}</strong></div> ${contentHtml} ${explainHtml}`;
    container.appendChild(div);
}

function serializeQuestionData(containerId) {
    const container = document.getElementById(containerId);
    if(!container) return '[]';
    const items = container.querySelectorAll('.quiz-item');
    const data = [];

    items.forEach(item => {
        const type = item.dataset.type;
        const explanation = item.querySelector('.q-explain').value;
        
        if (type === 'choice') {
            const question = item.querySelector('.q-title').value;
            const isMulti = item.querySelector('.q-multi-toggle').checked;
            const options = []; const correct = [];
            item.querySelectorAll('.option-row').forEach((row, idx) => {
                options.push(row.querySelector('.q-opt-val').value);
                if(row.querySelector('.q-correct-check').checked) correct.push(idx);
            });
            if(question.trim()) data.push({ type, question, options, correct, isMulti, explanation });
        
        } else if (type === 'fill') {
            const content = item.querySelector('.q-content').value;
            if(content.trim()) data.push({ type, content, explanation });
        } else if (type === 'essay') {
            const question = item.querySelector('.q-title').value;
            const modelAnswer = item.querySelector('.q-model-answer').value;
            if(question.trim()) data.push({ type, question, modelAnswer, explanation });
        }
    });
    return JSON.stringify(data);
}

/* ==========================================================================
   PART 4: SAVING LOGIC
   ========================================================================== */

async function submitLessonAJAX(publishStatus) {
    const btnDraft = document.querySelector('.btn-draft');
    const btnPublish = document.querySelector('.btn-publish');
    
    // UI Loading
    const originalDraftText = btnDraft ? btnDraft.innerHTML : 'Lưu nháp';
    const originalPublishText = btnPublish ? btnPublish.innerHTML : 'Đăng bài';
    
    if(btnPublish && publishStatus) {
        btnPublish.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang đăng...';
        btnPublish.disabled = true;
        if(btnDraft) btnDraft.disabled = true;
    } else if (btnDraft) {
        btnDraft.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang lưu...';
        btnDraft.disabled = true;
        if(btnPublish) btnPublish.disabled = true;
    }

    try {
        const titleInput = document.getElementById('mainTitleInput');
        if (!titleInput.value.trim()) {
            Swal.fire('Thiếu thông tin', 'Vui lòng nhập tên bài học.', 'warning');
            throw new Error("Missing title");
        }

        const title = titleInput.value;
        const isProInp = document.getElementById('isProInput');
        const isPro = isProInp ? isProInp.checked : false;
        
        const contentJSON = serializeBlocks();
        const subjectSelect = document.getElementById('selectSubject');
        const subjectId = subjectSelect ? subjectSelect.value : '';
        const courseId = document.getElementById('hiddenCourseId').value;
        
        // Snapshot Tree
        const treeData = [];
        document.querySelectorAll('.tree-unit').forEach((uEl, uIdx) => {
            const unitId = uEl.dataset.unitId || '';
            const unitTitle = uEl.querySelector('.unit-title-input').value;
            const lessonIds = [];
            uEl.querySelectorAll('.tree-lesson').forEach(lEl => {
                const lessonTitleInp = lEl.querySelector('.lesson-title-input');
                lessonIds.push({
                    id: lEl.dataset.lessonId,
                    title: lessonTitleInp ? lessonTitleInp.value : ''
                });
            });
            treeData.push({ id: unitId, title: unitTitle, order: uIdx + 1, lessons: lessonIds });
        });

        // Quiz Data (Backward Compatibility)
        let quizData = [];
        const quizBlock = blocks.find(b => b.type === 'quiz' || b.type === 'question');
        if(quizBlock && quizBlock.data && quizBlock.data.questions) {
            quizData = quizBlock.data.questions;
        }

        const payload = {
            title, content: contentJSON, type: 'theory',
            isPro, isPublished: publishStatus,
            subjectId, courseId, // New field for hierarchy
            quizData: JSON.stringify(quizData),
            curriculumSnapshot: JSON.stringify(treeData),
            currentEditingId: activeLessonId
        };

        const res = await fetch('/api/lesson/save', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(payload)
        });
        
        const result = await res.json();

        if(result.success) {
            const Toast = Swal.mixin({ toast: true, position: 'bottom-end', showConfirmButton: false, timer: 3000 });
            
            if(publishStatus) {
                Toast.fire({ icon: 'success', title: 'Đã đăng bài thành công!' });
                updateStatusBadge(true);
            } else {
                Toast.fire({ icon: 'info', title: 'Đã lưu bản nháp' });
                updateStatusBadge(false);
            }
            
            const lastSaved = document.getElementById('lastSavedTime');
            if(lastSaved) lastSaved.innerText = new Date().toLocaleTimeString('vi-VN');

            // Cập nhật ID thật nếu là bài mới
            if(String(activeLessonId).startsWith('new_lesson_') || activeLessonId === 'current_new_lesson') {
                const treeItem = document.querySelector(`.tree-lesson[data-lesson-id="${activeLessonId}"]`);
                if(treeItem) treeItem.dataset.lessonId = result.newLessonId;
                
                activeLessonId = result.newLessonId;
                const currentIdInp = document.getElementById('currentEditingId');
                if(currentIdInp) currentIdInp.value = result.newLessonId;
            }

            // Reload tree nếu vừa lưu nháp/publish để đồng bộ ID thật cho các item
            // loadCurriculumByCourse(courseId); // Optional: có thể bật nếu muốn chắc chắn

        } else {
            Swal.fire('Lỗi', result.error || 'Lỗi không xác định', 'error');
        }

    } catch(err) {
        if(err.message !== "Missing title") {
            console.error(err);
            Swal.fire('Lỗi', 'Không thể kết nối server', 'error');
        }
    } finally {
        if(btnPublish) { btnPublish.innerHTML = originalPublishText; btnPublish.disabled = false; }
        if(btnDraft) { btnDraft.innerHTML = originalDraftText; btnDraft.disabled = false; }
    }
}