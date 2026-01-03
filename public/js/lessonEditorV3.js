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

let activeContext = 'course'; // 'course' | 'unit' | 'lesson'
let activeUnitId = null;      // ID chương đang chọn

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

    const unitInput = document.getElementById('settingUnitTitle');
    if(unitInput) {
        unitInput.addEventListener('input', (e) => {
            const val = e.target.value;
            // Lấy bài đang active -> tìm cha -> update title
            const activeItem = document.querySelector(`.tree-lesson.active`);
            if(activeItem) {
                const parentUnit = activeItem.closest('.tree-unit');
                if(parentUnit) {
                    const treeInput = parentUnit.querySelector('.unit-title-input');
                    if(treeInput) treeInput.value = val;
                }
            }
        });
    }

    // Đóng modal khi click ra ngoài
    document.addEventListener('click', (e) => {
        const modal = document.getElementById('mathLiveModal');
        if (e.target === modal) closeMathModal();
    });
}

// Helper set text status
function setSaveStatus(text) {
    const el = document.getElementById('saveStatus');
    if (el) el.innerText = text;
}

// --- HÀM CHUYỂN NGỮ CẢNH RIGHT PANEL ---
function switchPanelMode(mode) {
    activeContext = mode;
    
    const pCourse = document.getElementById('panel-course');
    const pUnit = document.getElementById('panel-unit');
    const pLesson = document.getElementById('panel-lesson');

    // Reset tất cả về ẩn
    if(pCourse) pCourse.style.display = 'none';
    if(pUnit) pUnit.style.display = 'none';
    if(pLesson) pLesson.style.display = 'none';

    // Hiện cái cần thiết
    const target = document.getElementById(`panel-${mode}`);
    if(target) {
        target.style.display = 'block';
    } else {
        console.error(`Không tìm thấy panel: panel-${mode}. Hãy kiểm tra file ManageLesson.ejs`);
    }

    // Cập nhật giao diện chính (Center Panel)
    const editorPanel = document.getElementById('editorMainPanel');
    const emptyPanel = document.getElementById('emptyStatePanel');
    
    if (mode === 'lesson') {
        if(editorPanel) editorPanel.style.display = 'contents';
        if(emptyPanel) emptyPanel.style.display = 'none';
    } else {
        if(editorPanel) editorPanel.style.display = 'none';
        if(emptyPanel) {
            emptyPanel.style.display = 'flex';
            // Cập nhật nội dung Empty State cho sinh động
            let icon = mode === 'unit' ? 'fa-folder-open' : 'fa-book';
            let title = mode === 'unit' ? 'Quản lý Chương' : 'Quản lý Khóa học';
            let msg = mode === 'unit' ? 'Cài đặt tên chương và thao tác hàng loạt bên phải.' : 'Cài đặt chung cho khóa học bên phải.';
            
            emptyPanel.innerHTML = `
                <div style="text-align:center; color:#ccc;">
                    <i class="fas ${icon} fa-4x" style="margin-bottom:20px; opacity:0.3"></i>
                    <h3 style="color:#666; margin-bottom:10px;">${title}</h3>
                    <p>${msg}</p>
                </div>
            `;
        }
    }
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

// --- LOAD CẤU TRÚC (TREE) & THÔNG TIN KHÓA HỌC ---
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
        // 1. Fetch Tree Structure
        const resTree = await fetch(`/api/tree/by-course/${courseId}`);
        const dataTree = await resTree.json();
        
        if(container) container.innerHTML = '';

        // KIỂM TRA: LÀ BẢN NHÁP HAY LIVE?
        if (dataTree.source === 'draft') {
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
            renderTreeFromJson(dataTree.tree); 
        } else {
            // Live mode
            renderTreeFromJson(dataTree.tree); 
        }

        if(btnAdd) btnAdd.style.display = 'block';

        // 2. [NEW] Fetch Course Details & Fill Right Panel
        try {
            const resDetail = await fetch(`/api/course/${courseId}/details`);
            const dataDetail = await resDetail.json();
            if(dataDetail.success && typeof fillCoursePanel === 'function') {
                fillCoursePanel(dataDetail.course);
            }
        } catch(e) { console.error("Lỗi tải chi tiết khóa học:", e); }

        // 3. [NEW] Mặc định chọn Panel Khóa học
        if(typeof selectCourse === 'function') {
            selectCourse(); 
        }

        // Tự động mở bài học lần trước đang sửa (nếu có)
        if(dataTree.lastEditedId) {
            setTimeout(() => {
                const item = document.querySelector(`.tree-lesson[data-lesson-id="${dataTree.lastEditedId}"]`);
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
    
    // Tạo wrapper riêng
    let listWrapper = document.getElementById('treeListWrapper');
    if(!listWrapper) {
        listWrapper = document.createElement('div');
        listWrapper.id = 'treeListWrapper';
        container.appendChild(listWrapper);
    } else {
        listWrapper.innerHTML = '';
    }

    // [NEW] 1. Render COURSE ROOT (Dòng đầu tiên của cây)
    const courseSelect = document.getElementById('selectCourse');
    const courseName = courseSelect && courseSelect.options[courseSelect.selectedIndex] 
                       ? courseSelect.options[courseSelect.selectedIndex].text 
                       : 'Khóa học hiện tại';
    
    const rootEl = document.createElement('div');
    rootEl.className = 'tree-root-item';
    rootEl.style.cssText = 'padding: 10px 5px; font-weight: 700; color: #2563eb; cursor: pointer; border-bottom: 2px solid #eff6ff; display: flex; align-items: center;';
    rootEl.innerHTML = `
        <i class="fas fa-graduation-cap" style="margin-right: 8px;"></i>
        <span style="flex-grow: 1;">${courseName}</span>
        <i class="fas fa-chevron-right" style="font-size: 0.8rem; color: #bfdbfe;"></i>
    `;
    
    // Click vào root -> Chọn khóa học
    rootEl.onclick = () => selectCourse();
    listWrapper.appendChild(rootEl);


    // 2. Render các Unit như cũ
    if(!units || units.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'empty-state';
        empty.style.marginTop = '20px';
        empty.innerText = 'Khóa học này chưa có chương nào.';
        listWrapper.appendChild(empty);
    } else {
        units.forEach(u => {
            const uId = u.id || u._id;
            createUnitDOM(uId, u.title, u.lessons, listWrapper);
        });
    }
    
    // Sortable cho Chương
    if(typeof Sortable !== 'undefined') {
        new Sortable(listWrapper, {
            handle: '.tree-unit-header', // Chỉ kéo thả được unit, không kéo được root
            animation: 150,
            ghostClass: 'sortable-ghost',
            filter: '.tree-root-item' // Không cho sort cái root
        });
    }
}

// --- LOGIC CHỌN CHƯƠNG ---
function selectUnit(uId, headerEl) {
    console.log("Selected Unit:", uId); // Log để debug xem có nhận không

    // 1. Update UI Active (Highlight dòng được chọn)
    document.querySelectorAll('.tree-lesson').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.tree-unit-header').forEach(el => el.classList.remove('active-unit')); // Reset highlight cũ
    
    // Nếu headerEl chưa được truyền vào (trường hợp gọi từ code), tìm nó
    if (!headerEl) {
        const unitEl = document.querySelector(`.tree-unit[data-unit-id="${uId}"]`);
        if(unitEl) headerEl = unitEl.querySelector('.tree-unit-header');
    }
    
    if(headerEl) headerEl.classList.add('active-unit'); // Thêm class highlight (nhớ CSS class này)
    
    // 2. Load data vào Right Panel
    activeUnitId = uId;
    activeLessonId = null; // Bỏ chọn bài học
    
    // Lấy tên từ input trên cây để điền vào panel phải
    let title = '';
    if(headerEl) {
        const treeInput = headerEl.querySelector('.unit-title-input');
        title = treeInput ? treeInput.value : '';
    }

    const panelInput = document.getElementById('settingUnitTitle');
    if(panelInput) {
        panelInput.value = title;
        panelInput.dataset.bindingId = uId; // Bind ID để sync ngược lại khi gõ
        panelInput.disabled = false;
    }

    // 3. Switch Mode sang Panel Chương
    if (typeof switchPanelMode === 'function') {
        switchPanelMode('unit');
    } else {
        console.error("Thiếu hàm switchPanelMode!");
    }
}

// --- LOGIC CHỌN KHÓA HỌC (Default) ---
// Gọi hàm này khi load trang hoặc khi click ra ngoài (nếu muốn)
function selectCourse() {
    activeLessonId = null;
    activeUnitId = null;
    
    // 1. Reset UI Active cũ
    document.querySelectorAll('.tree-lesson').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.tree-unit-header').forEach(el => el.classList.remove('active-unit'));
    document.querySelectorAll('.tree-root-item').forEach(el => el.classList.remove('active-root')); // Reset root

    // 2. Highlight Root Item
    const rootItem = document.querySelector('.tree-root-item');
    if(rootItem) rootItem.classList.add('active-root');

    // 3. Chuyển Panel
    if(typeof switchPanelMode === 'function') {
        switchPanelMode('course');
    }
}

// 1. Gõ ở Panel Phải -> Cập nhật Cây (Cho Unit)
function syncUnitTitleToTree(panelInput) {
    const val = panelInput.value;
    const uId = panelInput.dataset.bindingId;
    if(!uId) return;

    // Tìm input trên cây
    const unitEl = document.querySelector(`.tree-unit[data-unit-id="${uId}"]`);
    if(unitEl) {
        const treeInput = unitEl.querySelector('.unit-title-input');
        if(treeInput) treeInput.value = val;
    }
}

// 2. Gõ ở Cây -> Cập nhật Panel Phải (Cho Unit)
function syncTreeToUnitPanel(treeInput) {
    // Chỉ cập nhật nếu đang chọn đúng unit đó
    const unitEl = treeInput.closest('.tree-unit');
    const uId = unitEl.dataset.unitId;
    
    if(activeContext === 'unit' && activeUnitId === uId) {
        const panelInput = document.getElementById('settingUnitTitle');
        if(panelInput) panelInput.value = treeInput.value;
    }
}

// 3. Xóa Unit từ Panel
function triggerDeleteActiveUnit() {
    if(!activeUnitId) return;
    const unitEl = document.querySelector(`.tree-unit[data-unit-id="${activeUnitId}"]`);
    if(unitEl) {
        // Tìm nút xóa trong DOM ảo và click nó (tận dụng hàm deleteUnitDOM cũ)
        // Hoặc viết lại hàm deleteUnitDirect(activeUnitId)
        // Cách nhanh:
        const btnDelete = unitEl.querySelector('.tree-actions .btn-icon-mini[onclick*="deleteUnitDOM"]'); 
        // Lưu ý: Code cũ tôi đã xóa nút delete ở header để chuyển vào panel.
        // NẾU BẠN MUỐN GIỮ NÚT TRÊN CÂY THÌ OK. NẾU KHÔNG THÌ GỌI LOGIC TRỰC TIẾP:
        deleteUnitDOM({ closest: () => unitEl }); // Mock element
    }
}

// --- 4. CREATE UNIT DOM (Hỗ trợ targetContainer) ---
function createUnitDOM(id, title, lessons = [], targetContainer) {
    // Nếu không truyền container thì lấy mặc định
    const container = targetContainer || document.getElementById('treeListWrapper') || document.getElementById('treeContainer');

    const unitEl = document.createElement('div');
    unitEl.className = 'tree-unit';
    unitEl.dataset.unitId = id; 

    // [QUAN TRỌNG] Thêm onclick="selectUnit(...)" vào class tree-unit-header
    unitEl.innerHTML = `
        <div class="tree-unit-header" onclick="selectUnit('${id}', this)">
            <div style="display:flex; align-items:center; flex-grow:1;">
                <i class="fas fa-grip-vertical drag-handle-unit" 
                   style="color:#ccc; cursor:grab; margin-right:8px;" 
                   title="Kéo để sắp xếp chương"
                   onclick="event.stopPropagation()"></i> <input type="text" class="unit-title-input" value="${title}" 
                       placeholder="Nhập tên chương..."
                       onchange="this.setAttribute('value', this.value)"
                       oninput="syncTreeToUnitPanel(this)"
                       onclick="event.stopPropagation()"> </div>
            <div class="tree-actions">
                <button type="button" class="btn-icon-mini" onclick="addTempLessonToUnit(this); event.stopPropagation();" title="Thêm bài vào chương này"><i class="fas fa-plus"></i></button>
                </div>
        </div>
        <div class="tree-lesson-list" data-unit-id="${id}"></div>
    `;

    const listContainer = unitEl.querySelector('.tree-lesson-list');

    // Render Lessons bên trong
    if(lessons && lessons.length > 0) {
        lessons.forEach(l => {
            const lId = l.id || l._id;
            const lessonObj = { _id: lId, title: l.title, type: l.type, isPublished: l.isPublished, isPro: l.isPro };
            // Check active
            const isCurrent = (String(lId) === String(activeLessonId));
            listContainer.appendChild(createLessonDOM(lessonObj, isCurrent));
        });
    }

    container.appendChild(unitEl);

    // Sortable cho Bài học (Kéo thả bài giữa các chương)
    if(typeof Sortable !== 'undefined') {
        new Sortable(listContainer, {
            group: 'lessons', 
            handle: '.drag-handle',
            animation: 150,
            ghostClass: 'sortable-ghost'
        });
    }
    
    // Auto focus nếu tên rỗng (khi tạo mới)
    if(title === '') {
        setTimeout(() => {
            const inp = unitEl.querySelector('.unit-title-input');
            if(inp) inp.focus();
        }, 100);
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

/**
 * TÌM hàm deleteUnitDOM và THAY THẾ bằng nội dung sau:
 */
async function deleteUnitDOM(btn) {
    const unitEl = btn.closest('.tree-unit');
    const unitId = unitEl.dataset.unitId;
    const lessons = unitEl.querySelectorAll('.tree-lesson');
    const lessonCount = lessons.length;

    // 1. Xác định nội dung cảnh báo
    let title = 'Xóa chương này?';
    let text = "Hành động này sẽ XÓA VĨNH VIỄN chương này khỏi Database.";
    let confirmBtnText = 'Xóa vĩnh viễn';

    if (lessonCount > 0) {
        title = `CẢNH BÁO: Chương này có ${lessonCount} bài học!`;
        text = "Nếu xóa, TẤT CẢ bài học bên trong cũng sẽ bị XÓA VĨNH VIỄN và KHÔNG THỂ KHÔI PHỤC. Bạn chắc chắn chứ?";
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
    
    // TRƯỜNG HỢP A: Chương mới tạo (chưa lưu vào DB - ID bắt đầu bằng new_unit_)
    if (unitId.startsWith('new_unit_')) {
        removeUnitUI(unitEl);
        Swal.fire('Đã xóa', 'Đã xóa chương nháp.', 'success');
        return;
    }

    // TRƯỜNG HỢP B: Chương đã có trong DB -> Gọi API xóa thật
    try {
        const res = await fetch(`/api/unit/${unitId}/delete`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });

        const data = await res.json();

        if (data.success) {
            removeUnitUI(unitEl);
            Swal.fire('Đã xóa', 'Chương và bài học đã được xóa vĩnh viễn.', 'success');
        } else {
            Swal.fire('Lỗi', data.error || 'Không thể xóa chương.', 'error');
        }

    } catch (err) {
        console.error(err);
        Swal.fire('Lỗi', 'Lỗi kết nối server.', 'error');
    }
}

// Helper: Hàm phụ trách việc xóa UI và reset Editor nếu cần
function removeUnitUI(unitEl) {
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
            document.getElementById('emptyStatePanel').style.display = 'flex';
            activeLessonId = null;
            const currentIdInp = document.getElementById('currentEditingId');
            if(currentIdInp) currentIdInp.value = '';
        }
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

// --- SELECT LESSON (SPA LOGIC) ---
async function selectLesson(id, titleFallback = 'Bài học mới', type = 'theory') {
    // 1. UI Updates (Tree Highlight)
    document.querySelectorAll('.tree-lesson').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.tree-unit-header').forEach(el => el.classList.remove('active-unit')); // Bỏ active của Unit/Course

    const activeItem = document.querySelector(`.tree-lesson[data-lesson-id="${id}"]`);
    if(activeItem) activeItem.classList.add('active');

    // 2. [NEW] Switch Right Panel Mode -> Lesson
    if(typeof switchPanelMode === 'function') {
        switchPanelMode('lesson');
    }

    // 3. State Updates
    activeLessonId = id;
    activeUnitId = null; // Reset Unit selection

    const currentIdInput = document.getElementById('currentEditingId');
    if(currentIdInput) currentIdInput.value = id;
    
    const mainTitleInput = document.getElementById('mainTitleInput');
    if(mainTitleInput) mainTitleInput.value = titleFallback;
    
    setSaveStatus('Đang tải...');

    // 4. Load Data
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
                if (res.status === 404) Swal.fire('Không tìm thấy', 'Bài học này có thể đã bị xóa.', 'warning');
                else Swal.fire('Lỗi', `Server trả về lỗi: ${res.status}`, 'error');
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
             // Ensure settings exist (backward compatible)
             if (!b.data) b.data = {};
             if (!b.data.settings) {
                 b.data.settings = {
                     randomizeQuestions: false,
                     randomizeOptions: false,
                     passingScore: 50,
                     showFeedback: 'submit'
                 };
             }
             const settings = b.data.settings;

             const questions = b.data?.questions || [];
             const summary = questions.length + ' câu hỏi';
             
             // Settings panel
             const settingsHTML = `
                <div class="quiz-settings-bar">
                    <div class="quiz-settings-header" onclick="this.nextElementSibling.style.display = this.nextElementSibling.style.display === 'none' ? 'grid' : 'none'">
                        <i class="fas fa-cog"></i> Cấu hình bài tập (Nhấn để ẩn/hiện)
                    </div>
                    <div class="quiz-settings-content" style="display:grid;">
                        <label class="q-setting-item">
                            <input type="checkbox" 
                                   onchange="updateBlockData(${idx}, 'settings.randomizeQuestions', this.checked)"
                                   ${settings.randomizeQuestions ? 'checked' : ''}>
                            Đảo ngẫu nhiên câu hỏi
                        </label>

                        <label class="q-setting-item">
                            <input type="checkbox" 
                                   onchange="updateBlockData(${idx}, 'settings.randomizeOptions', this.checked)"
                                   ${settings.randomizeOptions ? 'checked' : ''}>
                            Đảo vị trí đáp án
                        </label>

                        <label class="q-setting-item">
                            <span>Điểm đạt (%):</span>
                            <input type="number" min="0" max="100" 
                                   value="${settings.passingScore}"
                                   onchange="updateBlockData(${idx}, 'settings.passingScore', Number(this.value))">
                        </label>

                        <label class="q-setting-item">
                            <span>Xem đáp án:</span>
                            <select onchange="updateBlockData(${idx}, 'settings.showFeedback', this.value)">
                                <option value="instant" ${settings.showFeedback === 'instant' ? 'selected' : ''}>Ngay khi chọn</option>
                                <option value="submit" ${settings.showFeedback === 'submit' ? 'selected' : ''}>Sau khi nộp bài</option>
                                <option value="never" ${settings.showFeedback === 'never' ? 'selected' : ''}>Không hiển thị</option>
                            </select>
                        </label>
                    </div>
                </div>
             `;

             body.innerHTML = settingsHTML + `
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

/* =========================================================
   MATH LIVE & LATEX INTEGRATION FOR EASYMDE
   ========================================================= */

let currentMathEditorInstance = null; // Biến lưu editor đang focus để chèn công thức vào đúng chỗ

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
            placeholder: "Viết nội dung bài học... (Bấm nút ∑ để chèn toán)",
            
            // 1. CUSTOM TOOLBAR
            toolbar: [
                "bold", "italic", "heading", "|", 
                "quote", "unordered-list", "ordered-list", "|", 
                "link", "image", "table", "|", 
                {
                    name: "math",
                    action: (editor) => {
                        currentMathEditorInstance = editor; // Lưu instance hiện tại
                        openMathModal();
                    },
                    className: "fa fa-square-root-alt", // Icon căn bậc 2 (FontAwesome)
                    title: "Chèn công thức Toán (MathLive)",
                },
                "|", "preview", "side-by-side", "fullscreen"
            ],

            // 2. CUSTOM PREVIEW RENDER (Để hiển thị LaTeX)
            previewRender: function(plainText) {
                // Bước A: Render Markdown cơ bản trước
                // (EasyMDE dùng marked bên trong, ta gọi hàm mặc định của nó)
                const preview = this.parent.markdown(plainText);

                // Bước B: Tìm và render LaTeX bằng KaTeX
                // Chúng ta dùng container ảo để xử lý HTML string
                const div = document.createElement('div');
                div.innerHTML = preview;

                // Render KaTeX (yêu cầu thư viện KaTeX đã load ở ManageLesson.ejs)
                if (window.renderMathInElement) {
                    window.renderMathInElement(div, {
                        delimiters: [
                            {left: "$$", right: "$$", display: true},
                            {left: "$", right: "$", display: false}
                        ],
                        throwOnError: false
                    });
                } else if (window.katex) {
                    // Fallback nếu không có auto-render extension
                    // Regex thay thế thủ công (Đơn giản hóa)
                    div.innerHTML = div.innerHTML.replace(/\$\$([\s\S]*?)\$\$/g, (match, tex) => {
                        return katex.renderToString(tex, { displayMode: true, throwOnError: false });
                    }).replace(/\$([\s\S]*?)\$/g, (match, tex) => {
                        return katex.renderToString(tex, { displayMode: false, throwOnError: false });
                    });
                }

                return div.innerHTML;
            },
        });

        easyMDE.codemirror.on("change", () => {
            if(blocks[idx] && blocks[idx].data) {
                blocks[idx].data.text = easyMDE.value();
            }
        });
        editors[idx] = easyMDE;
    });
}

// --- MATH MODAL LOGIC ---

function openMathModal() {
    const modal = document.getElementById('mathLiveModal');
    const mf = document.getElementById('mathLiveInput');
    if (modal && mf) {
        modal.style.display = 'flex';
        mf.value = ''; // Reset
        setTimeout(() => mf.focus(), 100);
    }
}

function closeMathModal() {
    const modal = document.getElementById('mathLiveModal');
    if (modal) modal.style.display = 'none';
}

// Chèn công thức từ MathLive vào EasyMDE
function insertMathToEditor(isBlock) {
    const mf = document.getElementById('mathLiveInput');
    if (!mf || !currentMathEditorInstance) return;

    const latex = mf.value;
    if (!latex.trim()) {
        closeMathModal();
        return;
    }

    // Format: $$ công_thức $$ (Block) hoặc $ công_thức $ (Inline)
    const textToInsert = isBlock 
        ? `\n$$ ${latex} $$\n` 
        : `$ ${latex} $`;

    // Chèn vào vị trí con trỏ
    currentMathEditorInstance.codemirror.replaceSelection(textToInsert);
    
    closeMathModal();
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

// Update nested data path in a block (e.g. 'settings.randomizeQuestions')
function updateBlockData(index, path, value) {
    if (typeof index !== 'number' || !blocks[index]) return;
    const keys = path.split('.');
    let target = blocks[index].data;

    // Walk down to the parent of the final key
    for (let i = 0; i < keys.length - 1; i++) {
        const k = keys[i];
        if (!target[k]) target[k] = {};
        target = target[k];
    }

    // Coerce numeric strings to number when appropriate
    const finalKey = keys[keys.length - 1];
    if (typeof value === 'string' && /^\d+$/.test(value)) {
        value = Number(value);
    }

    target[finalKey] = value;

    // Re-render block preview only (avoid full reload for performance if desired)
    renderBlocks();
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
            courseId: courseId,
            currentEditingId: activeLessonId
        };

        const res = await fetch('/api/lesson/save', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(payload)
        });
        
        const result = await res.json();

        if(result.success) {
            if (result.unitMapping) {
                Object.keys(result.unitMapping).forEach(tempId => {
                    const realId = result.unitMapping[tempId];
                    // Tìm unit có id tạm trên giao diện
                    const unitEl = document.querySelector(`.tree-unit[data-unit-id="${tempId}"]`);
                    if (unitEl) {
                        unitEl.dataset.unitId = realId; // Update ID thật
                        
                        // Update luôn binding ở Right Panel nếu đang focus
                        const rightPanelUnitTitle = document.getElementById('settingUnitTitle');
                        if(rightPanelUnitTitle && rightPanelUnitTitle.dataset.bindingId === tempId) {
                            rightPanelUnitTitle.dataset.bindingId = realId;
                        }
                    }
                });
            }
            // [FIX] Cập nhật ID cho Lesson mới tạo (như cũ)
            if (result.lessonMapping) {
                Object.keys(result.lessonMapping).forEach(tempId => {
                    const realId = result.lessonMapping[tempId];
                    const lessonEl = document.querySelector(`.tree-lesson[data-lesson-id="${tempId}"]`);
                    if(lessonEl) lessonEl.dataset.lessonId = realId;
                });
            }
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
                activeLessonId = result.newLessonId;
                // Update input hidden
                const currentIdInp = document.getElementById('currentEditingId');
                if(currentIdInp) currentIdInp.value = result.newLessonId;
                
                // Update DOM item
                const treeItem = document.querySelector('.tree-lesson.active');
                if(treeItem) treeItem.dataset.lessonId = result.newLessonId;
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

/* ==========================================================================
   PART 5: IMPORT / EXPORT TOOLS
   ========================================================================== */

/**
 * Xuất nội dung bài học hiện tại ra file .json
 */
function exportLessonJSON() {
    // 1. Serialize blocks hiện tại
    const dataStr = JSON.stringify(blocks, null, 2); // Format đẹp
    const blob = new Blob([dataStr], { type: "application/json" });

    // 2. Tạo tên file dựa trên tiêu đề bài học
    const titleInput = document.getElementById('mainTitleInput');
    let filename = 'lesson_data.json';
    if (titleInput && titleInput.value.trim()) {
        // Chuyển tiếng Việt có dấu thành không dấu, thay khoảng trắng bằng _
        const cleanTitle = titleInput.value
            .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
            .replace(/[^a-zA-Z0-9]/g, '_')
            .toLowerCase();
        filename = `${cleanTitle}.json`;
    }

    // 3. Tải xuống
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    // Thông báo nhỏ
    const Toast = Swal.mixin({ toast: true, position: 'bottom-end', showConfirmButton: false, timer: 3000 });
    Toast.fire({ icon: 'success', title: 'Đã xuất file JSON thành công' });
}

/**
 * Nhập nội dung từ file .json vào editor
 */
async function importLessonJSON(input) {
    const file = input.files[0];
    if (!file) return;

    // Cảnh báo trước khi ghi đè
    const result = await Swal.fire({
        title: 'Nhập dữ liệu?',
        text: "Hành động này sẽ GHI ĐÈ toàn bộ nội dung hiện tại bằng dữ liệu từ file. Bạn có chắc không?",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#3085d6',
        cancelButtonColor: '#d33',
        confirmButtonText: 'Đồng ý nhập',
        cancelButtonText: 'Hủy'
    });

    if (!result.isConfirmed) {
        input.value = ''; // Reset input để chọn lại file cũ được
        return;
    }

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const json = JSON.parse(e.target.result);

            // Validate sơ bộ: Phải là mảng các blocks
            if (Array.isArray(json)) {
                // Cập nhật biến global blocks
                blocks = json;

                // Render lại giao diện
                renderBlocks();

                Swal.fire({
                    icon: 'success',
                    title: 'Nhập thành công!',
                    text: `Đã tải ${json.length} khối nội dung.`,
                    timer: 1500,
                    showConfirmButton: false
                });
            } else {
                Swal.fire('Lỗi định dạng', 'File JSON không đúng cấu trúc bài học (Phải là một mảng Array).', 'error');
            }
        } catch (err) {
            console.error(err);
            Swal.fire('Lỗi file', 'File JSON bị lỗi cú pháp hoặc hỏng.', 'error');
        }
        // Reset input
        input.value = '';
    };

    reader.readAsText(file);
}
/**
 * THÊM VÀO CUỐI FILE hoặc bất kỳ chỗ nào trống
 */

async function saveUnitStatus(isPublished) {
    const unitTitleInput = document.getElementById('settingUnitTitle');
    const unitId = unitTitleInput.dataset.bindingId;
    const unitName = unitTitleInput.value;

    if (!unitId || unitId.startsWith('new_unit_')) {
        return Swal.fire('Chưa lưu chương', 'Vui lòng lưu cấu trúc (nút Lưu Nháp/Đăng Bài ở dưới) trước khi thao tác hàng loạt.', 'warning');
    }

    const actionName = isPublished ? "ĐĂNG (Publish)" : "LƯU NHÁP (Draft)";
    
    // 1. Xác nhận
    const confirm = await Swal.fire({
        title: `${actionName} cả chương?`,
        html: `Bạn có chắc muốn chuyển tất cả bài học trong chương <b>"${unitName}"</b> sang trạng thái <b>${actionName}</b> không?`,
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: 'Làm luôn',
        cancelButtonText: 'Thôi'
    });

    if (!confirm.isConfirmed) return;

    // 2. Gọi API
    try {
        const res = await fetch('/api/unit/bulk-status', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ unitId, isPublished })
        });
        
        const data = await res.json();

        if (data.success) {
            // 3. Cập nhật UI cây thư mục (Không cần F5)
            const unitList = document.querySelector(`.tree-lesson-list[data-unit-id="${unitId}"]`);
            if (unitList) {
                const lessons = unitList.querySelectorAll('.tree-lesson');
                lessons.forEach(l => {
                    const statusDiv = l.querySelector('.lesson-actions');
                    // Xóa icon cũ
                    const oldIcon = statusDiv.querySelector('.fa-pencil-ruler');
                    if (oldIcon) oldIcon.remove();

                    // Nếu là Draft -> Thêm icon bút chì
                    if (!isPublished) {
                        const iconHtml = `<i class="fas fa-pencil-ruler" style="font-size: 0.7rem; color: #f59e0b;" title="Bản nháp"></i>`;
                        statusDiv.insertAdjacentHTML('afterbegin', iconHtml);
                    }
                });
            }

            // Nếu bài đang mở nằm trong chương đó, update luôn badge trạng thái
            if (activeLessonId) {
                const currentLessonEl = document.querySelector(`.tree-lesson.active`);
                if(currentLessonEl && currentLessonEl.closest(`.tree-lesson-list[data-unit-id="${unitId}"]`)) {
                    updateStatusBadge(isPublished);
                }
            }

            Swal.fire('Thành công', `Đã cập nhật trạng thái cho ${data.updatedCount} bài học.`, 'success');
        } else {
            Swal.fire('Lỗi', data.error || 'Có lỗi xảy ra', 'error');
        }
    } catch (e) {
        console.error(e);
        Swal.fire('Lỗi', 'Lỗi kết nối server', 'error');
    }
}

let courseSaveTimeout;
function autoSaveCourse() {
    clearTimeout(courseSaveTimeout);
    
    // UI Feedback: Đang lưu...
    const headerLabel = document.getElementById('panelHeaderLabel');
    headerLabel.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang lưu cấu hình...';

    courseSaveTimeout = setTimeout(async () => {
        const courseId = document.getElementById('hiddenCourseId').value;
        if(!courseId) return;

        const title = document.getElementById('pCourseTitle').value;
        const thumbnail = document.getElementById('pCourseThumb').value;
        const description = document.getElementById('pCourseDesc').value;
        const isPro = document.getElementById('pCoursePro').checked;
        const isPublished = document.getElementById('pCoursePublic').checked;

        try {
            const res = await fetch(`/api/course/${courseId}/update`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title, thumbnail, description, isPro, isPublished })
            });
            const data = await res.json();
            
            if(data.success) {
                headerLabel.innerHTML = '<i class="fas fa-check" style="color:#22c55e"></i> Đã lưu cấu hình';
                // Update select box tên khóa học nếu cần
                const select = document.getElementById('selectCourse');
                if(select && select.options[select.selectedIndex]) {
                    select.options[select.selectedIndex].text = title;
                }
                setTimeout(() => { headerLabel.innerHTML = '<i class="fas fa-sliders-h"></i> Thiết lập'; }, 2000);
            }
        } catch(e) {
            headerLabel.innerHTML = '<i class="fas fa-exclamation-triangle" style="color:red"></i> Lỗi lưu';
        }
    }, 1000); // Lưu sau 1s ngừng gõ
}

function updateCourseThumbPreview() {
    const url = document.getElementById('pCourseThumb').value;
    document.getElementById('pCourseThumbPreview').src = url || '/img/default-course.jpg';
}

// --- HELPER: LẤY CẤU TRÚC CÂY HIỆN TẠI ---
function getTreeStructure() {
    const treeData = [];
    document.querySelectorAll('.tree-unit').forEach((uEl, uIdx) => {
        const unitId = uEl.dataset.unitId || '';
        // Lấy tên chương từ input
        const unitTitleInput = uEl.querySelector('.unit-title-input');
        const unitTitle = unitTitleInput ? unitTitleInput.value : 'Chương mới';
        
        const lessonIds = [];
        uEl.querySelectorAll('.tree-lesson').forEach(lEl => {
            const lessonTitleInp = lEl.querySelector('.lesson-title-input');
            lessonIds.push({
                id: lEl.dataset.lessonId,
                title: lessonTitleInp ? lessonTitleInp.value : 'Bài học'
            });
        });
        
        treeData.push({ 
            id: unitId, 
            title: unitTitle, 
            order: uIdx + 1, 
            lessons: lessonIds 
        });
    });
    return treeData;
}

// --- LOGIC LƯU KHÓA HỌC (New) ---
async function saveCourseStatus(isPublished) {
    const courseId = document.getElementById('hiddenCourseId').value;
    if(!courseId) return Swal.fire('Lỗi', 'Không tìm thấy ID khóa học', 'error');

    // 1. Lấy dữ liệu form
    const title = document.getElementById('pCourseTitle').value;
    const description = document.getElementById('pCourseDesc').value;
    const thumbnail = document.getElementById('pCourseThumb').value;
    const isPro = document.getElementById('pCoursePro').checked;

    // 2. Lấy Snapshot cây cấu trúc (Để server biết cái nào đã bị xóa)
    const curriculumSnapshot = getTreeStructure();

    // UI Feedback
    const btnText = isPublished ? 'Đang đăng...' : 'Đang lưu...';
    setSaveStatus(btnText); // Tận dụng hàm setSaveStatus có sẵn hoặc dùng Swal loading

    try {
        const curriculumSnapshot = getTreeStructure();

        const res = await fetch(`/api/course/${courseId}/update-full`, { // Gọi route mới
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                title, description, thumbnail, isPro, isPublished,
                curriculumSnapshot: JSON.stringify(curriculumSnapshot) // Gửi kèm cây
            })
        });

        const data = await res.json();

        if(data.success) {
            Swal.fire({
                icon: 'success',
                title: isPublished ? 'Đã Công Khai!' : 'Đã Lưu Nháp!',
                text: 'Thông tin khóa học và cấu trúc chương đã được đồng bộ.',
                timer: 2000,
                showConfirmButton: false
            });

            // Cập nhật Badge trạng thái
            const badge = document.getElementById('courseStatusBadge');
            if(badge) {
                badge.innerText = isPublished ? 'CÔNG KHAI' : 'BẢN NHÁP';
                badge.style.background = isPublished ? '#dcfce7' : '#f1f5f9';
                badge.style.color = isPublished ? '#166534' : '#475569';
            }

            // Nếu server trả về mapping ID mới (cho chương mới tạo), update lại DOM
            if (data.unitMapping) {
                Object.keys(data.unitMapping).forEach(tempId => {
                    const realId = data.unitMapping[tempId];
                    const unitEl = document.querySelector(`.tree-unit[data-unit-id="${tempId}"]`);
                    if (unitEl) {
                        unitEl.dataset.unitId = realId;
                        // Update click handler để nó trỏ vào ID thật
                        const header = unitEl.querySelector('.tree-unit-header');
                        if(header) header.setAttribute('onclick', `selectUnit('${realId}', this)`);
                    }
                });
            }
            
            // Reload lại cây nếu cần thiết (optional)
            // loadCurriculumByCourse(courseId); 
        } else {
            Swal.fire('Lỗi', data.error || 'Lỗi khi lưu khóa học', 'error');
        }
    } catch(e) {
        console.error(e);
        Swal.fire('Lỗi', 'Không thể kết nối server', 'error');
    }
}

// Cập nhật hàm fillCoursePanel để hiển thị đúng trạng thái ban đầu
function fillCoursePanel(course) {
    document.getElementById('pCourseTitle').value = course.title;
    document.getElementById('pCourseDesc').value = course.description || '';
    document.getElementById('pCourseThumb').value = course.thumbnail || '';
    document.getElementById('pCourseThumbPreview').src = course.thumbnail || '/img/default-course.jpg';
    document.getElementById('pCoursePro').checked = course.isPro || false;
    
    // Update Badge
    const badge = document.getElementById('courseStatusBadge');
    if(badge) {
        badge.innerText = course.isPublished ? 'CÔNG KHAI' : 'BẢN NHÁP';
        badge.style.background = course.isPublished ? '#dcfce7' : '#f1f5f9';
        badge.style.color = course.isPublished ? '#166534' : '#475569';
    }
}