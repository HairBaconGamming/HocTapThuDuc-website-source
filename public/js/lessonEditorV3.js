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
let lessonCanvasEngine = null;

if (currentLessonId === 'add') currentLessonId = 'current_new_lesson';

const studioState = {
    lessonDirty: false,
    courseDirty: false,
    lastSavedAt: null
};

function cloneBlocksForBridge() {
    try {
        return JSON.parse(JSON.stringify(blocks));
    } catch (err) {
        return [];
    }
}

function getStudioBridgeSnapshot() {
    return {
        blocks: cloneBlocksForBridge(),
        activeLessonId,
        activeUnitId,
        activeContext,
        studioState: { ...studioState },
        metrics: typeof getLessonMetrics === 'function' ? getLessonMetrics() : { blocks: 0, words: 0, media: 0, readTime: 0 },
        title: document.getElementById('mainTitleInput')?.value?.trim() || '',
        courseId: document.getElementById('hiddenCourseId')?.value || '',
        subjectId: document.getElementById('hiddenSubjectId')?.value || ''
    };
}

function notifyStudioBridge(reason = 'update') {
    const detail = {
        reason,
        snapshot: getStudioBridgeSnapshot()
    };

    document.dispatchEvent(new CustomEvent('lesson-studio:statechange', { detail }));
}

window.LessonStudioBridge = {
    getSnapshot: getStudioBridgeSnapshot,
    notify: notifyStudioBridge,
    openRevisionHistory: () => typeof openRevisionHistory === 'function' && openRevisionHistory(),
    quickSave: () => {
        if (activeContext === 'lesson') return submitLessonAJAX(false);
        if (activeContext === 'course') return saveCourseStatus(false);
        if (activeContext === 'unit') return saveUnitStatus(false);
    },
    quickPublish: () => {
        if (activeContext === 'lesson') return submitLessonAJAX(true);
        if (activeContext === 'course') return saveCourseStatus(true);
        if (activeContext === 'unit') return saveUnitStatus(true);
    },
    quickDraft: () => {
        if (activeContext === 'lesson') return submitLessonAJAX(false);
        if (activeContext === 'course') return saveCourseStatus(false);
        if (activeContext === 'unit') return saveUnitStatus(false);
    }
};

const lessonBlockTemplates = {
    text: { type: 'text', data: { text: '' } },
    image: { type: 'image', data: { url: '' } },
    video: { type: 'video', data: { url: '' } },
    html_preview: {
        type: 'html_preview',
        data: {
            html: '\n<h1>Hello World</h1>',
            settings: {
                showSource: true,
                defaultTab: 'result',
                height: 400,
                viewport: 'responsive',
                includeBootstrap: false
            }
        }
    },
    resource: { type: 'resource', data: { title: '', url: '', iconType: 'drive' } },
    code: { type: 'code', data: { language: 'javascript', code: '' } },
    callout: { type: 'callout', data: { text: '' } },
    question: { type: 'question', data: { questions: [] } }
};

function ensureCanvasEngine() {
    if (lessonCanvasEngine || !window.LessonCanvasEngine || typeof window.LessonCanvasEngine.create !== 'function') {
        return lessonCanvasEngine;
    }

    lessonCanvasEngine = window.LessonCanvasEngine.create({
        getBlocks: () => blocks,
        getInsertIndex: () => blockInsertIndex,
        setInsertIndex: (value) => {
            blockInsertIndex = value;
        },
        createTemplate: (type) => lessonBlockTemplates[type],
        markDirty: () => markStudioDirty('lesson'),
        render: () => renderBlocks(),
        filterMenu: (query) => filterBlockMenu(query),
        confirmDelete: async () => {
            const result = await Swal.fire({
                title: 'Xóa khối này?',
                icon: 'warning',
                showCancelButton: true,
                confirmButtonText: 'Xóa'
            });
            return result.isConfirmed;
        },
        editQuestionBlock: (index) => editQuestionBlock(index)
    });

    lessonCanvasEngine.bindDelegates();
    return lessonCanvasEngine;
}

function buildSandboxedPreviewSrcdoc(htmlCode, includeBootstrap = false, bodyPadding = 15) {
    let head = '<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">';
    head += '<base target="_blank">';
    head += `<style>body{margin:0; padding:${bodyPadding}px; font-family:-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;}</style>`;

    if (includeBootstrap) {
        head += '<link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">';
        head += '<script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"><\/script>';
    }

    return `<!doctype html><html><head>${head}</head><body>${htmlCode || ''}</body></html>`;
}

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
            markStudioDirty();
            refreshStudioUI();
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
                !e.target.closest('[data-canvas-action="open-menu"]') &&
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
            markStudioDirty();
            refreshStudioUI();
        });
    }

    // Đóng modal khi click ra ngoài
    document.addEventListener('click', (e) => {
        const modal = document.getElementById('mathLiveModal');
        if (e.target === modal) closeMathModal();
    });

    bindStudioEnhancements();
    ensureCanvasEngine();
    refreshStudioUI();
}

// Helper set text status
function setSaveStatus(text, tone = null) {
    const el = document.getElementById('saveStatus');
    if (el) {
        el.innerText = text;
        el.dataset.tone = tone || el.dataset.tone || 'idle';
    }

}

function getDirtyScope(scope = activeContext) {
    return scope === 'lesson' ? 'lesson' : 'course';
}

function hasDirtyChanges() {
    return studioState.lessonDirty || studioState.courseDirty;
}

function markStudioDirty(scope = activeContext) {
    studioState[`${getDirtyScope(scope)}Dirty`] = true;
    setSaveStatus('Co thay doi chua luu', 'dirty');
    notifyStudioBridge('dirty');
}

function clearStudioDirty(message = 'Da dong bo', scope = activeContext) {
    studioState[`${getDirtyScope(scope)}Dirty`] = false;
    studioState.lastSavedAt = new Date();
    if (hasDirtyChanges()) setSaveStatus('Co thay doi chua luu', 'dirty');
    else setSaveStatus(message, 'saved');
    notifyStudioBridge('saved');
}

function getSelectedOptionLabel(id, fallback) {
    const select = document.getElementById(id);
    if (!select || !select.options || select.selectedIndex < 0) return fallback;
    return select.options[select.selectedIndex]?.text?.trim() || fallback;
}

function getActiveUnitTitle() {
    if (!activeUnitId) return 'Chua chon chuong';
    const unitEl = document.querySelector(`.tree-unit[data-unit-id="${activeUnitId}"]`);
    const input = unitEl ? unitEl.querySelector('.unit-title-input') : null;
    return input?.value?.trim() || document.getElementById('settingUnitTitle')?.value?.trim() || 'Chuong hien tai';
}

function getActiveLessonTitle() {
    const title = document.getElementById('mainTitleInput')?.value?.trim();
    if (title) return title;
    if (activeLessonId) {
        const lessonEl = document.querySelector(`.tree-lesson[data-lesson-id="${activeLessonId}"]`);
        const input = lessonEl ? lessonEl.querySelector('.lesson-title-input') : null;
        if (input?.value?.trim()) return input.value.trim();
    }
    return 'Chua chon bai hoc';
}

function getTextWordCount(value) {
    return (value || '')
        .replace(/<[^>]*>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .split(' ')
        .filter(Boolean).length;
}

function getLessonMetrics() {
    let words = 0;
    let media = 0;

    blocks.forEach((block) => {
        if (!block || !block.type) return;

        if (block.type === 'text') {
            words += getTextWordCount(block.data?.text || '');
        } else if (block.type === 'callout') {
            words += getTextWordCount(block.data?.text || '');
        } else if (block.type === 'resource') {
            words += getTextWordCount(block.data?.title || '');
        } else if (block.type === 'question') {
            (block.data?.questions || []).forEach((question) => {
                words += getTextWordCount(question?.question || '');
                words += getTextWordCount(question?.explanation || '');
                words += getTextWordCount(question?.modelAnswer || '');
            });
        } else if (block.type === 'code') {
            words += getTextWordCount(block.data?.code || '');
        } else if (block.type === 'html_preview') {
            words += getTextWordCount(block.data?.html || '');
        }

        if (['image', 'video', 'resource', 'html_preview'].includes(block.type)) {
            media += 1;
        }
    });

    return {
        blocks: blocks.length,
        words,
        media,
        readTime: Math.max(0, Math.ceil(words / 180))
    };
}

function refreshTreeOverview() {
    const unitCount = document.getElementById('treeUnitCount');
    const lessonCount = document.getElementById('treeLessonCount');
    const draftCount = document.getElementById('treeDraftCount');
    const headline = document.getElementById('studioCourseHeadline');
    const hint = document.getElementById('studioStructureHint');

    const units = document.querySelectorAll('.tree-unit').length;
    const lessons = document.querySelectorAll('.tree-lesson').length;
    const drafts = document.querySelectorAll('.tree-lesson .fa-pencil-ruler').length;

    if (unitCount) unitCount.textContent = String(units);
    if (lessonCount) lessonCount.textContent = String(lessons);
    if (draftCount) draftCount.textContent = String(drafts);

    const courseName = getSelectedOptionLabel('selectCourse', 'Chua chon khoa hoc');
    if (headline) headline.textContent = courseName;
    if (hint) {
        hint.textContent = lessons
            ? `Workspace hien co ${units} chuong va ${lessons} bai hoc. Keo tha de sap xep va chon muc bat ky de bien tap.`
            : 'Chon mon hoc va khoa hoc de mo cay giao trinh, sau do keo tha chuong va bai hoc ngay trong panel nay.';
    }
}

function updateModeCopy(mode) {
    const subjectLabel = getSelectedOptionLabel('selectSubject', 'Chua chon mon');
    const courseLabel = getSelectedOptionLabel('selectCourse', 'Chua chon khoa');
    const lessonTitle = getActiveLessonTitle();
    const unitTitle = getActiveUnitTitle();
    const metrics = getLessonMetrics();

    const copyMap = {
        course: {
            context: 'Course',
            selection: courseLabel,
            canvasTitle: courseLabel,
            canvasHint: 'Chinh sua metadata khoa hoc, thong tin cong khai va sap xep toan bo chuong ngay trong workspace.',
            heading: 'Tong quan khoa hoc',
            subhead: 'Bam vao chuong hoac bai hoc de di sau hon, hoac tiep tuc tinh chinh metadata cua khoa hoc.',
            inspectorTitle: 'Course inspector',
            inspectorBody: 'Panel nay giu thong tin chung cua khoa hoc, che do cong khai va thao tac dong bo cau truc.'
        },
        unit: {
            context: 'Unit',
            selection: unitTitle,
            canvasTitle: unitTitle,
            canvasHint: 'Dang o che do quan ly chuong. Ban co the doi ten, danh dau trang thai va thao tac hang loat cho toan chuong.',
            heading: unitTitle,
            subhead: 'Chon bai hoc trong chuong de mo block editor hoac dung inspector de thao tac hang loat.',
            inspectorTitle: 'Unit inspector',
            inspectorBody: 'Panel nay dung de doi ten chuong, publish nhieu bai cung luc va xu ly cac thao tac cap chuong.'
        },
        lesson: {
            context: 'Lesson',
            selection: lessonTitle,
            canvasTitle: lessonTitle,
            canvasHint: 'Dang trong block editor. Sap xep khoi, viet noi dung va theo doi thong so bien soan ngay tai trung tam.',
            heading: lessonTitle,
            subhead: `Bai hoc hien co ${metrics.blocks} block, ${metrics.words} tu va ${metrics.media} thanh phan media.`,
            inspectorTitle: 'Lesson inspector',
            inspectorBody: 'Panel nay dieu khien quyen truy cap, publish, import export JSON va lich su phien ban cho bai hoc.'
        }
    };

    const copy = copyMap[mode] || copyMap.course;
    const contextLabel = document.getElementById('studioContextLabel');
    const selectionLabel = document.getElementById('studioSelectionLabel');
    const subjectChip = document.getElementById('studioSubjectChip');
    const courseChip = document.getElementById('studioCourseChip');
    const selectionChip = document.getElementById('studioSelectionChip');
    const metricsChip = document.getElementById('studioMetricsChip');
    const canvasTitle = document.getElementById('studioCanvasTitle');
    const canvasHint = document.getElementById('studioCanvasHint');
    const canvasHeading = document.getElementById('studioCanvasHeading');
    const canvasSubhead = document.getElementById('studioCanvasSubhead');
    const inspectorTitle = document.getElementById('studioInspectorTitle');
    const inspectorBody = document.getElementById('studioInspectorBody');
    const eyebrow = document.getElementById('studioCanvasEyebrow');

    if (contextLabel) contextLabel.textContent = copy.context;
    if (selectionLabel) selectionLabel.textContent = copy.selection;
    if (subjectChip) subjectChip.textContent = subjectLabel;
    if (courseChip) courseChip.textContent = courseLabel;
    if (selectionChip) selectionChip.textContent = copy.selection;
    if (metricsChip) metricsChip.textContent = `${metrics.blocks} blocks · ${metrics.words} words`;
    if (canvasTitle) canvasTitle.textContent = copy.canvasTitle;
    if (canvasHint) canvasHint.innerHTML = copy.canvasHint;
    if (canvasHeading) canvasHeading.textContent = copy.heading;
    if (canvasSubhead) canvasSubhead.textContent = copy.subhead;
    if (inspectorTitle) inspectorTitle.textContent = copy.inspectorTitle;
    if (inspectorBody) inspectorBody.textContent = copy.inspectorBody;
    if (eyebrow) eyebrow.textContent = mode === 'lesson' ? 'Lesson canvas' : mode === 'unit' ? 'Unit workspace' : 'Course overview';

    const metricBlockCount = document.getElementById('metricBlockCount');
    const metricWordCount = document.getElementById('metricWordCount');
    const metricMediaCount = document.getElementById('metricMediaCount');
    const metricReadTime = document.getElementById('metricReadTime');

    if (metricBlockCount) metricBlockCount.textContent = String(metrics.blocks);
    if (metricWordCount) metricWordCount.textContent = String(metrics.words);
    if (metricMediaCount) metricMediaCount.textContent = String(metrics.media);
    if (metricReadTime) metricReadTime.textContent = `${metrics.readTime} min`;
}

function refreshStudioUI(mode = activeContext) {
    refreshTreeOverview();
    updateModeCopy(mode);
    notifyStudioBridge('ui-refresh');
}

function getCanvasScrollContainer() {
    return document.querySelector('.studio-editor-body')
        || document.querySelector('.center-panel .panel-body')
        || document.scrollingElement
        || document.documentElement;
}

function captureFocusedFieldState(activeElement, activeBlock) {
    if (!activeElement || !(activeElement instanceof HTMLElement)) return null;

    const state = {
        id: activeElement.id || '',
        tagName: activeElement.tagName,
        blockIndex: activeBlock?.dataset?.index ?? null,
        blockField: activeElement.dataset?.blockField || '',
        isLessonTitle: activeElement.classList.contains('lesson-title-input'),
        isUnitTitle: activeElement.classList.contains('unit-title-input'),
        selectionStart: typeof activeElement.selectionStart === 'number' ? activeElement.selectionStart : null,
        selectionEnd: typeof activeElement.selectionEnd === 'number' ? activeElement.selectionEnd : null
    };

    if (!state.id && !state.blockField && !state.isLessonTitle && !state.isUnitTitle) {
        return null;
    }

    return state;
}

function restoreFocusedFieldState(state) {
    if (!state) return;

    let target = null;

    if (state.id) {
        target = document.getElementById(state.id);
    }

    if (!target && state.blockIndex != null && state.blockField) {
        target = document.querySelector(`[data-block-index="${state.blockIndex}"][data-block-field="${state.blockField}"]`);
    }

    if (!target && state.blockIndex != null && state.isLessonTitle) {
        target = document.querySelector(`.tree-lesson[data-lesson-id="${activeLessonId}"] .lesson-title-input`);
    }

    if (!target && state.isUnitTitle && activeUnitId) {
        target = document.querySelector(`.tree-unit[data-unit-id="${activeUnitId}"] .unit-title-input`);
    }

    if (!target || typeof target.focus !== 'function') return;

    try {
        target.focus({ preventScroll: true });
    } catch (error) {
        target.focus();
    }

    if (typeof state.selectionStart === 'number' && typeof target.setSelectionRange === 'function') {
        try {
            target.setSelectionRange(state.selectionStart, state.selectionEnd ?? state.selectionStart);
        } catch (error) {
            // Ignore selection restore issues on non-textual inputs.
        }
    }
}

function captureCanvasViewportState() {
    const scroller = getCanvasScrollContainer();
    const activeElement = document.activeElement;
    const activeBlock = activeElement?.closest?.('.content-block');
    const scrollerRect = scroller === document.scrollingElement || scroller === document.documentElement || scroller === document.body
        ? { top: 0 }
        : scroller.getBoundingClientRect();
    const activeRect = activeBlock ? activeBlock.getBoundingClientRect() : null;

    return {
        scroller,
        scrollTop: scroller?.scrollTop || 0,
        scrollLeft: scroller?.scrollLeft || 0,
        activeBlockIndex: activeBlock?.dataset?.index ?? null,
        activeBlockOffset: activeRect ? activeRect.top - scrollerRect.top : null,
        focusedField: captureFocusedFieldState(activeElement, activeBlock)
    };
}

function restoreCanvasViewportState(viewState) {
    if (!viewState || !viewState.scroller) return;

    const scroller = viewState.scroller;
    let nextTop = viewState.scrollTop || 0;

    if (viewState.activeBlockIndex != null && viewState.activeBlockOffset != null) {
        const activeBlock = document.querySelector(`.content-block[data-index="${viewState.activeBlockIndex}"]`);
        if (activeBlock) {
            const scrollerRect = scroller === document.scrollingElement || scroller === document.documentElement || scroller === document.body
                ? { top: 0 }
                : scroller.getBoundingClientRect();
            const activeRect = activeBlock.getBoundingClientRect();
            nextTop = (viewState.scrollTop || 0) + (activeRect.top - scrollerRect.top - viewState.activeBlockOffset);
        }
    }

    scroller.scrollTop = Math.max(0, nextTop);
    scroller.scrollLeft = viewState.scrollLeft || 0;
    restoreFocusedFieldState(viewState.focusedField);
}

function filterBlockMenu(query) {
    const normalized = (query || '').trim().toLowerCase();
    document.querySelectorAll('#blockMenu .menu-item').forEach((item) => {
        const text = item.textContent.toLowerCase();
        item.style.display = !normalized || text.includes(normalized) ? 'flex' : 'none';
    });
}

function bindStudioEnhancements() {
    const searchInput = document.getElementById('blockMenuSearch');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => filterBlockMenu(e.target.value));
    }

    const subjectSelect = document.getElementById('selectSubject');
    if (subjectSelect) {
        subjectSelect.addEventListener('change', (event) => loadCourses(event.target.value));
    }

    const courseSelect = document.getElementById('selectCourse');
    if (courseSelect) {
        courseSelect.addEventListener('change', (event) => loadCurriculumByCourse(event.target.value));
    }

    ['pCourseTitle', 'pCourseDesc', 'pCourseThumb'].forEach((id) => {
        const field = document.getElementById(id);
        if (!field) return;
        field.addEventListener('input', () => {
            if (id === 'pCourseThumb') updateCourseThumbPreview();
            markStudioDirty();
            refreshStudioUI();
            autoSaveCourse();
        });
    });

    ['pCoursePro', 'pCoursePublic'].forEach((id) => {
        const field = document.getElementById(id);
        if (!field) return;
        field.addEventListener('change', () => {
            markStudioDirty();
            refreshStudioUI();
            autoSaveCourse();
        });
    });

    const settingUnitTitle = document.getElementById('settingUnitTitle');
    if (settingUnitTitle) {
        settingUnitTitle.addEventListener('input', (event) => {
            syncUnitTitleToTree(event.target);
            markStudioDirty();
            refreshStudioUI(activeContext);
        });
    }

    const settingCourseThumb = document.getElementById('settingCourseThumb');
    if (settingCourseThumb) {
        settingCourseThumb.addEventListener('input', () => {
            const thumbPreview = document.getElementById('thumbPreview');
            if (thumbPreview) thumbPreview.src = settingCourseThumb.value || '/img/default-course.jpg';
        });
    }

    const importJsonInput = document.getElementById('importJsonInput');
    if (importJsonInput) {
        importJsonInput.addEventListener('change', () => importLessonJSON(importJsonInput));
    }

    window.addEventListener('beforeunload', (event) => {
        if (!hasDirtyChanges()) return;
        event.preventDefault();
        event.returnValue = '';
    });

    document.addEventListener('keydown', (event) => {
        const isSave = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's';
        const isPublish = (event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === 'p';
        const isQuickInsert = event.altKey && event.key === '/';

        if (isSave) {
            event.preventDefault();
            if (activeContext === 'lesson') submitLessonAJAX(false);
            else if (activeContext === 'course') saveCourseStatus(false);
        } else if (isPublish) {
            event.preventDefault();
            if (activeContext === 'lesson') submitLessonAJAX(true);
            else if (activeContext === 'course') saveCourseStatus(true);
        } else if (isQuickInsert && activeContext === 'lesson') {
            event.preventDefault();
            const placeholder = document.querySelector('.add-block-placeholder');
            if (placeholder) openBlockMenu(blocks.length - 1, { currentTarget: placeholder });
        }
    });

    document.addEventListener('click', (event) => {
        const modalAction = event.target.closest('[data-modal-action]');
        if (modalAction) {
            const action = modalAction.dataset.modalAction;
            if (action === 'close-math') closeMathModal();
            else if (action === 'close-revision') {
                const revisionModal = document.getElementById('revisionModal');
                if (revisionModal) revisionModal.style.display = 'none';
            } else if (action === 'close-course-settings') {
                closeCourseSettings();
            }
            return;
        }

        const revisionAction = event.target.closest('[data-revision-action]');
        if (revisionAction) {
            if (revisionAction.dataset.revisionAction === 'restore' && revisionAction.dataset.revisionId) {
                restoreRevision(revisionAction.dataset.revisionId);
            }
            return;
        }

        const studioAction = event.target.closest('[data-studio-action]');
        if (studioAction) {
            const action = studioAction.dataset.studioAction;

            if (action === 'prompt-create-course') {
                promptCreateCourse();
                return;
            }

            if (action === 'select-course-panel') {
                selectCourse();
                return;
            }

            if (action === 'delete-current-course') {
                deleteCurrentCourse();
                return;
            }

            if (action === 'add-temp-unit') {
                addTempUnit();
                return;
            }

            if (action === 'open-revisions') {
                openRevisionHistory();
                return;
            }

            if (action === 'save-course') {
                saveCourseStatus(studioAction.dataset.publishState === 'publish');
                return;
            }

            if (action === 'save-unit') {
                saveUnitStatus(studioAction.dataset.publishState === 'publish');
                return;
            }

            if (action === 'delete-active-unit') {
                triggerDeleteActiveUnit();
                return;
            }

            if (action === 'save-lesson') {
                submitLessonAJAX(studioAction.dataset.publishState === 'publish');
                return;
            }

            if (action === 'export-lesson-json') {
                exportLessonJSON();
                return;
            }

            if (action === 'open-import-json') {
                importJsonInput?.click();
                return;
            }

            if (action === 'insert-math') {
                insertMathToEditor(studioAction.dataset.mathMode === 'block');
                return;
            }

            if (action === 'close-course-settings') {
                closeCourseSettings();
                return;
            }

            if (action === 'save-course-settings') {
                saveCourseSettings();
                return;
            }
        }

        const treeAction = event.target.closest('[data-tree-action]');
        if (treeAction) {
            const action = treeAction.dataset.treeAction;

            if (action === 'noop') {
                event.stopPropagation();
                return;
            }

            if (action === 'select-course-root') {
                selectCourse();
                return;
            }

            if (action === 'select-unit') {
                if (event.target.closest('.unit-title-input')) return;
                selectUnit(treeAction.dataset.unitId || treeAction.closest('.tree-unit')?.dataset.unitId, treeAction);
                return;
            }

            if (action === 'add-lesson') {
                event.stopPropagation();
                addTempLessonToUnit(treeAction);
                return;
            }

            if (action === 'select-lesson') {
                if (event.target.closest('.lesson-title-input')) return;
                const lessonEl = treeAction.closest('.tree-lesson');
                const lessonInput = lessonEl?.querySelector('.lesson-title-input');
                if (lessonEl?.dataset.lessonId) {
                    selectLesson(
                        lessonEl.dataset.lessonId,
                        lessonInput ? lessonInput.value : 'Bài học mới',
                        lessonEl.dataset.lessonType || 'theory'
                    );
                }
                return;
            }

            if (action === 'delete-lesson') {
                event.stopPropagation();
                const lessonId = treeAction.dataset.lessonId || treeAction.closest('.tree-lesson')?.dataset.lessonId;
                if (lessonId) deleteLessonDOM(treeAction, lessonId, event);
                return;
            }

            if (action === 'discard-draft' && treeAction.dataset.courseId) {
                discardDraft(treeAction.dataset.courseId);
                return;
            }
        }

        const quizAction = event.target.closest('[data-quiz-action]');
        if (!quizAction) return;

        const action = quizAction.dataset.quizAction;
        if (action === 'add-question') {
            addQuestionItem(quizAction.dataset.containerId, quizAction.dataset.questionType);
        } else if (action === 'add-option') {
            addOptionToQuestion(quizAction, quizAction.dataset.groupName);
        } else if (action === 'remove-option') {
            quizAction.parentElement.remove();
        } else if (action === 'remove-question') {
            quizAction.closest('.quiz-item')?.remove();
        }
    });

    document.addEventListener('change', (event) => {
        const quizAction = event.target.closest('[data-quiz-action="toggle-multi"]');
        if (!quizAction) return;
        toggleMulti(quizAction, quizAction.dataset.groupName);
    });
}

// Toggle menu cấu hình cho HTML Block
function toggleHtmlSettings(idx) {
    const engine = ensureCanvasEngine();
    if (engine) return engine.toggleFlag(idx, '_settingsOpen');
    if (!blocks[idx]) return;
    blocks[idx]._settingsOpen = !blocks[idx]._settingsOpen;
    renderBlocks();
}

// --- HÀM CHUYỂN NGỮ CẢNH RIGHT PANEL ---
function legacySwitchPanelMode(mode) {
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

function switchPanelMode(mode) {
    activeContext = mode;

    ['course', 'unit', 'lesson'].forEach((panel) => {
        const element = document.getElementById(`panel-${panel}`);
        if (element) element.style.display = panel === mode ? 'block' : 'none';
    });

    const editorPanel = document.getElementById('editorMainPanel');
    const emptyPanel = document.getElementById('emptyStatePanel');

    if (mode === 'lesson') {
        if (editorPanel) editorPanel.style.display = 'contents';
        if (emptyPanel) emptyPanel.style.display = 'none';
    } else {
        if (editorPanel) editorPanel.style.display = 'none';
        if (emptyPanel) emptyPanel.style.display = 'flex';
    }

    refreshStudioUI(mode);
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
        refreshStudioUI('course');
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
        refreshStudioUI('course');

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
            container.appendChild(createDraftAlert(courseId));
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

function createDraftAlert(courseId) {
    const alertBox = document.createElement('div');
    alertBox.style.cssText = 'background:#fff7ed; color:#c2410c; padding:12px; margin-bottom:15px; border-radius:6px; border:1px solid #ffedd5; display:flex; justify-content:space-between; align-items:center; font-size:0.9rem;';

    const info = document.createElement('div');

    const strong = document.createElement('strong');
    strong.textContent = 'Chế độ Bản Nháp';

    const subText = document.createElement('span');
    subText.style.cssText = 'font-size:0.8rem; opacity:0.8';
    subText.textContent = 'Thay đổi chưa được công khai.';

    const warningIcon = document.createElement('i');
    warningIcon.className = 'fas fa-exclamation-triangle';
    warningIcon.style.marginRight = '6px';

    info.append(warningIcon, strong, document.createElement('br'), subText);

    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.treeAction = 'discard-draft';
    button.dataset.courseId = courseId;
    button.style.cssText = 'border:none; background:white; border:1px solid #c2410c; color:#c2410c; padding:4px 8px; border-radius:4px; cursor:pointer; font-size:0.75rem;';

    const buttonIcon = document.createElement('i');
    buttonIcon.className = 'fas fa-undo';
    buttonIcon.style.marginRight = '4px';
    button.append(buttonIcon, document.createTextNode('Hủy nháp'));

    alertBox.append(info, button);
    return alertBox;
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
    
    const rootEl = window.LessonTreeRenderers
        ? window.LessonTreeRenderers.createRootNode(courseName)
        : document.createElement('div');

    if (!window.LessonTreeRenderers) {
        rootEl.className = 'tree-root-item';
        rootEl.dataset.treeAction = 'select-course-root';
        rootEl.style.cssText = 'padding: 10px 5px; font-weight: 700; color: #2563eb; cursor: pointer; border-bottom: 2px solid #eff6ff; display: flex; align-items: center;';
        rootEl.innerHTML = `
            <i class="fas fa-graduation-cap" style="margin-right: 8px;"></i>
            <span style="flex-grow: 1;">${courseName}</span>
            <i class="fas fa-chevron-right" style="font-size: 0.8rem; color: #bfdbfe;"></i>
        `;
    }

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
        refreshStudioUI('unit');
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
        refreshStudioUI('course');
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
        deleteUnitDOM({ closest: () => unitEl }); // Mock element
    }
}

// --- 4. CREATE UNIT DOM (Hỗ trợ targetContainer) ---
function createUnitDOM(id, title, lessons = [], targetContainer) {
    // Nếu không truyền container thì lấy mặc định
    const container = targetContainer || document.getElementById('treeListWrapper') || document.getElementById('treeContainer');

    const unitEl = window.LessonTreeRenderers
        ? window.LessonTreeRenderers.createUnitNode(id, title)
        : document.createElement('div');

    if (!window.LessonTreeRenderers) {
        unitEl.className = 'tree-unit';
        unitEl.dataset.unitId = id;
        unitEl.innerHTML = `
            <div class="tree-unit-header" data-tree-action="select-unit" data-unit-id="${id}">
                <div style="display:flex; align-items:center; flex-grow:1;">
                    <i class="fas fa-grip-vertical drag-handle-unit" 
                       data-tree-action="noop"
                       style="color:#ccc; cursor:grab; margin-right:8px;" 
                       title="Kéo để sắp xếp chương"></i>
                    <input type="text" class="unit-title-input" value="${title}" placeholder="Nhập tên chương...">
                </div>
                <div class="tree-actions">
                    <button type="button" class="btn-icon-mini" data-tree-action="add-lesson" data-unit-id="${id}" title="Thêm bài vào chương này"><i class="fas fa-plus"></i></button>
                </div>
            </div>
            <div class="tree-lesson-list" data-unit-id="${id}"></div>
        `;
    }

    const unitTitleInput = unitEl.querySelector('.unit-title-input');
    if (unitTitleInput) {
        unitTitleInput.addEventListener('click', (event) => event.stopPropagation());
        unitTitleInput.addEventListener('input', () => {
            syncTreeToUnitPanel(unitTitleInput);
            markStudioDirty();
            refreshStudioUI(activeContext);
        });
    }

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
            ghostClass: 'sortable-ghost',
            onEnd: () => {
                markStudioDirty();
                refreshStudioUI(activeContext);
            }
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
    const lessonId = lesson._id || lesson.id;
    const el = window.LessonTreeRenderers
        ? window.LessonTreeRenderers.createLessonNode(lesson, isCurrent ? lessonId : activeLessonId)
        : document.createElement('div');

    if (!window.LessonTreeRenderers) {
        el.className = `tree-lesson ${String(lessonId) === String(activeLessonId) ? 'active' : ''}`;
        el.dataset.lessonId = lessonId;
        el.dataset.lessonType = lesson.type || 'theory';
        el.dataset.treeAction = 'select-lesson';

        let icon = '<i class="fas fa-file-alt"></i>';
        if(lesson.type === 'video') icon = '<i class="fas fa-video"></i>';
        if(lesson.type === 'question' || lesson.type === 'quiz') icon = '<i class="fas fa-question-circle"></i>';

        let statusIcon = '';
        if (lesson.isPublished === false || String(lessonId).startsWith('new_') || lessonId === 'current_new_lesson') {
            statusIcon = `<i class="fas fa-pencil-ruler" style="font-size: 0.7rem; color: #f59e0b;" title="Bản nháp"></i>`;
        }

        el.innerHTML = `
            <div style="display:flex; align-items:center; flex-grow:1; overflow:hidden; padding-right:5px;">
                <i class="fas fa-ellipsis-v drag-handle" data-tree-action="noop" style="margin-right:8px; cursor:grab; color:#ccc;"></i>
                <span class="lesson-icon" style="margin-right:8px;">${icon}</span>
                <input type="text" class="lesson-title-input" value="${lesson.title}" style="flex-grow:1; border:none; background:transparent; min-width:0;">
            </div>
            <div class="lesson-actions" style="display:flex; align-items:center; gap:8px;">
                ${statusIcon}
                <button type="button" class="btn-icon-mini delete-lesson-btn" title="Xóa bài học" data-tree-action="delete-lesson" data-lesson-id="${lessonId}">
                    <i class="fas fa-times" style="color:#ef4444;"></i>
                </button>
            </div>
        `;
    }
    
    // Live update title
    const input = el.querySelector('input');
    input.addEventListener('click', (event) => event.stopPropagation());
    input.addEventListener('input', (e) => {
        if(String(lessonId) === String(activeLessonId)) {
            const mainInput = document.getElementById('mainTitleInput');
            if(mainInput) mainInput.value = e.target.value;
        }
        markStudioDirty();
        refreshStudioUI(activeContext);
    });

    return el;
}

/* --- HÀM XÓA BÀI HỌC (Đã Fix UI Reset) --- */
async function deleteLessonDOM(btn, lessonId, event) {
    event.stopPropagation(); 

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

    // Helper để reset UI nếu xóa đúng bài đang chọn
    const resetUIIfActive = () => {
        if (lessonId === activeLessonId) {
            // [FIX 2] Gọi hàm selectCourse() để reset toàn bộ về màn hình quản lý khóa học
            // Hàm này sẽ: Ẩn editor giữa, Hiện empty state, Chuyển panel phải về Course, Reset activeLessonId
            if (typeof selectCourse === 'function') {
                selectCourse();
            } else {
                // Fallback thủ công nếu chưa có hàm selectCourse
                document.getElementById('editorMainPanel').style.display = 'none';
                document.getElementById('emptyStatePanel').style.display = 'flex';
                document.getElementById('panel-lesson').style.display = 'none'; // Ẩn panel bài học
                document.getElementById('panel-course').style.display = 'block'; // Hiện panel khóa học
                activeLessonId = null;
            }
        }
    };

    // TRƯỜNG HỢP 1: Bài mới (Nháp)
    if (lessonId.startsWith('new_') || lessonId === 'current_new_lesson') {
        lessonEl.remove();
        resetUIIfActive(); // Gọi hàm fix
        Swal.fire('Đã xóa', 'Đã xóa bài học nháp.', 'success');
        return;
    }

    // TRƯỜNG HỢP 2: Bài đã có trong DB
    try {
        const res = await fetch(`/lesson/${lessonId}/delete`, { method: 'POST' });
        
        if (res.ok) {
            lessonEl.remove();
            resetUIIfActive(); // Gọi hàm fix
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
    markStudioDirty();
    refreshStudioUI(activeContext);
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
    markStudioDirty();
    refreshStudioUI('lesson');
    
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
    setSaveStatus('Dang tai...', 'saving');
    
    setSaveStatus('Đang tải...');

    // 4. Load Data
    if(id === 'current_new_lesson' || String(id).startsWith('new_lesson_')) {
        // --- BÀI MỚI (Reset trắng) ---
        initBlocks(''); 
        const isProInp = document.getElementById('isProInput');
        if(isProInp) isProInp.checked = false;
        const allowSaveInp = document.getElementById('allowSaveProgressInput');
        if (allowSaveInp) allowSaveInp.checked = true;
        setSaveStatus('Ban nhap chua luu', 'dirty');
        
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
                const allowSaveInp = document.getElementById('allowSaveProgressInput');
                if (allowSaveInp) allowSaveInp.checked = l.allowSaveProgress !== false;
                
                updateStatusBadge(l.isPublished);

                // Load Blocks
                initBlocks(l.content);
                clearStudioDirty('Da dong bo');
                
                setSaveStatus('Đã đồng bộ');
            } else {
                Swal.fire('Lỗi', 'Không thể tải nội dung bài học', 'error');
            }
        } catch(err) {
            console.error(err);
            Swal.fire('Lỗi', 'Lỗi kết nối server', 'error');
        }
    }

    refreshStudioUI('lesson');
    notifyStudioBridge('lesson-selected');
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
    ensureCanvasEngine();
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
    notifyStudioBridge('blocks-init');
    
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
                markStudioDirty();
                renderBlocks(); // Re-render để cập nhật index
            }
        });
    }
}

// --- VIDEO SETTINGS HELPER ---
function toggleVideoSettings(idx) {
    const engine = ensureCanvasEngine();
    if (engine) return engine.toggleFlag(idx, '_settingsOpen');
    if (!blocks[idx]) return;
    blocks[idx]._settingsOpen = !blocks[idx]._settingsOpen;
    renderBlocks();
}

// RENDER ALL BLOCKS (FIX SCROLL JUMP)
function renderBlocks() {
    const viewportState = captureCanvasViewportState();

    cleanupEditors(); // Dọn dẹp editor cũ

    const canvas = document.getElementById('editorCanvas');
    if (!canvas) return;
    canvas.innerHTML = '';
    const blockRenderers = window.LessonBlockRenderers;

    blocks.forEach((b, idx) => {
        const frame = blockRenderers && typeof blockRenderers.createBlockFrame === 'function'
            ? blockRenderers.createBlockFrame(idx)
            : { el: document.createElement('div'), body: document.createElement('div') };
        const el = frame.el;
        const body = frame.body;

        if (!el.className) {
            el.className = 'content-block';
            el.dataset.index = idx;
            body.className = 'block-body';
            el.appendChild(body);
        }

        // --- RENDER TYPE: TEXT ---
        if (b.type === 'text') {
            body.innerHTML = `<div class="block-label"><i class="fab fa-markdown"></i> Văn bản (Advanced)</div>`;
            const ta = document.createElement('textarea');
            ta.id = `editor-area-${idx}`;
            ta.className = 'easymde-input';
            ta.value = b.data && b.data.text ? b.data.text : '';
            // [OPTIMIZE] Không render lại toàn bộ khi gõ phím
            // Sự kiện 'change' của EasyMDE tự xử lý, không cần gọi renderBlocks() trong onchange của textarea này
            body.appendChild(ta);

        // --- RENDER TYPE: IMAGE ---
        } else if (b.type === 'image') {
            body.innerHTML = `<div class="block-label"><i class="fas fa-image"></i> Hình ảnh</div>`;
            const inp = document.createElement('input');
            inp.className = 'studio-select';
            inp.placeholder = 'URL ảnh...';
            inp.value = b.data?.url || '';
            // [FIX] onchange thay vì oninput để tránh re-render liên tục khi gõ
            inp.addEventListener('change', (e) => { 
                blocks[idx].data.url = e.target.value; 
                markStudioDirty('lesson');
                renderBlocks(); 
            });
            body.appendChild(inp);
            if(b.data?.url) {
                const img = document.createElement('img');
                img.src = b.data.url; img.style.maxWidth = '100%'; img.style.marginTop = '10px';
                body.appendChild(img);
            }

        // --- RENDER TYPE: VIDEO (FIXED) ---
        } else if (b.type === 'video') {
            blockRenderers.renderVideoBlock(body, b, idx, { getEmbedUrl });

        // --- RENDER TYPE: RESOURCE ---
        } else if (b.type === 'resource') {
            blockRenderers.renderResourceBlock(body, b, idx);

        // --- RENDER TYPE: CODE SNIPPET ---
        } else if (b.type === 'code') {
            body.innerHTML = `<div class="block-label"><i class="fas fa-code"></i> Code Snippet</div>`;
            
            const wrapper = document.createElement('div');
            wrapper.className = 'code-editor-wrapper';
            wrapper.style.cssText = "background: #1e1e1e; padding: 10px; border-radius: 6px; border: 1px solid #333;";

            // Select Language
            const langSelect = document.createElement('select');
            langSelect.className = 'studio-select';
            langSelect.style.cssText = "background: #333; color: #fff; border: none; margin-bottom: 10px; width: auto;";
            
            const languages = [
                {val: 'javascript', label: 'JavaScript'},
                {val: 'html', label: 'HTML'},
                {val: 'css', label: 'CSS'},
                {val: 'python', label: 'Python'},
                {val: 'java', label: 'Java'},
                {val: 'cpp', label: 'C++'},
                {val: 'sql', label: 'SQL'},
                {val: 'json', label: 'JSON'}
            ];

            const language = b.language || (b.data && b.data.language) || 'javascript';
            const codeContent = b.code || (b.data && b.data.code) || '';

            languages.forEach(l => {
                const opt = document.createElement('option');
                opt.value = l.val;
                opt.innerText = l.label;
                if(language === l.val) opt.selected = true;
                langSelect.appendChild(opt);
            });

            langSelect.onchange = (e) => {
                blocks[idx].data.language = e.target.value;
                markStudioDirty('lesson');
            };

            // Textarea nhập code
            const codeArea = document.createElement('textarea');
            codeArea.className = 'code-input';
            codeArea.placeholder = 'Paste code vào đây...';
            codeArea.value = codeContent || '';
            codeArea.spellcheck = false;
            // Style cho giống Editor thật
            codeArea.style.cssText = "width: 100%; height: 200px; background: #1e1e1e; color: #d4d4d4; font-family: 'Consolas', 'Monaco', monospace; font-size: 14px; border: none; outline: none; resize: vertical; padding: 5px; line-height: 1.5;";
            
            // Dùng oninput thay vì onchange để mượt mà, nhưng không gọi renderBlocks
            codeArea.oninput = (e) => {
                blocks[idx].data.code = e.target.value;
                markStudioDirty('lesson');
                refreshStudioUI('lesson');
            };
            // Tab key support (thụt đầu dòng)
            codeArea.addEventListener('keydown', function(e) {
                if (e.key == 'Tab') {
                    e.preventDefault();
                    var start = this.selectionStart;
                    var end = this.selectionEnd;
                    this.value = this.value.substring(0, start) + "    " + this.value.substring(end);
                    this.selectionStart = this.selectionEnd = start + 4;
                    blocks[idx].data.code = this.value;
                    markStudioDirty('lesson');
                    refreshStudioUI('lesson');
                }
            });

            wrapper.appendChild(langSelect);
            wrapper.appendChild(codeArea);
            body.appendChild(wrapper);

        // --- RENDER TYPE: QUIZ ---
        } else if (b.type === 'question' || b.type === 'quiz') {
             blockRenderers.renderQuestionBlock(el, body, b, idx);
        
        // --- RENDER TYPE: CALLOUT ---
        } else if (b.type === 'callout') {
             el.classList.add('block-callout');
             body.innerHTML = `<div class="block-label"><i class="fas fa-exclamation-circle"></i> Ghi chú</div>`;
             const ta = document.createElement('textarea');
             ta.className = 'studio-select';
             ta.value = b.data?.text || '';
             // [FIX] Dùng onchange thay vì oninput để giảm tần suất re-render (dù callout là input thuần)
             // Nhưng nếu dùng textarea thuần thì không render lại cả block nên oninput vẫn ok, chỉ cần không gọi renderBlocks() trong đó
             ta.addEventListener('input', (e) => {
                 blocks[idx].data.text = e.target.value;
                 markStudioDirty();
                 refreshStudioUI('lesson');
             });
             body.appendChild(ta);
        // --- RENDER TYPE: HTML PREVIEW (FULL FEATURES) ---
        } else if (b.type === 'html_preview') {
            blockRenderers.renderHtmlPreviewBlock(body, b, idx, {
                buildSandboxedPreviewSrcdoc,
                markStudioDirty: () => markStudioDirty('lesson'),
                refreshStudioUI
            });
        }

        el.appendChild(body);
        canvas.appendChild(el);

        blockRenderers.appendInserter(canvas, idx);
    });

    // Init EasyMDE for all text blocks
    initMarkdownEditors(); // Hàm này cần được viết lại để không re-focus linh tinh
    refreshStudioUI(activeContext);

    requestAnimationFrame(() => {
        restoreCanvasViewportState(viewportState);
        notifyStudioBridge('blocks-rendered');
    });
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
                markStudioDirty();
                refreshStudioUI('lesson');
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
    const engine = ensureCanvasEngine();
    if (engine && event && event.currentTarget) {
        return engine.openMenu(index, event.currentTarget);
    }
    blockInsertIndex = index;
    const menu = document.getElementById('blockMenu');
    const searchInput = document.getElementById('blockMenuSearch');
    
    if (menu && event) {
        // 1. Hiển thị trước để trình duyệt tính toán kích thước thực
        menu.style.display = 'block';
        if (searchInput) {
            searchInput.value = '';
            filterBlockMenu('');
            setTimeout(() => searchInput.focus(), 0);
        }
        
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
    const engine = ensureCanvasEngine();
    if (engine) return engine.closeMenu();
    const menu = document.getElementById('blockMenu');
    const searchInput = document.getElementById('blockMenuSearch');
    if (menu) menu.style.display = 'none';
    if (searchInput) searchInput.value = '';
    filterBlockMenu('');
    blockInsertIndex = -2;
}

function addBlock(type) {
    const engine = ensureCanvasEngine();
    if (engine) return engine.addBlock(type);

    const newBlock = JSON.parse(JSON.stringify(lessonBlockTemplates[type]));
    if (blockInsertIndex === -1) blocks.push(newBlock);
    else blocks.splice(blockInsertIndex + 1, 0, newBlock);
    closeBlockMenu();
    markStudioDirty();
    renderBlocks();
}

function deleteBlock(index) {
    const engine = ensureCanvasEngine();
    if (engine) return engine.deleteBlock(index);
    Swal.fire({
        title: 'Xóa khối này?', icon: 'warning', showCancelButton: true, confirmButtonText: 'Xóa'
    }).then((res) => {
        if(res.isConfirmed) {
            blocks.splice(index, 1);
            markStudioDirty();
            renderBlocks();
        }
    });
}

function moveBlock(index, dir) {
    const engine = ensureCanvasEngine();
    if (engine) return engine.moveBlock(index, dir);
    const newIndex = index + dir;
    if(newIndex < 0 || newIndex >= blocks.length) return;
    const item = blocks.splice(index, 1)[0];
    blocks.splice(newIndex, 0, item);
    markStudioDirty();
    renderBlocks();
}

function serializeBlocks() {
    return JSON.stringify(blocks);
}

// --- VIDEO HELPERS ---
function updateVideoBlock(idx, field, value) {
    const engine = ensureCanvasEngine();
    if (engine) return engine.updateField(idx, field, value);
    if (!blocks[idx].data) blocks[idx].data = {};
    blocks[idx].data[field] = value;
    markStudioDirty();
    renderBlocks(); 
}

function getVideoTypeInfo(url) {
    if (!url) return { type: 'unknown' };
    if (/(?:youtu\.be\/|youtube\.com\/|vimeo\.com\/)/.test(url)) return { type: 'iframe' };
    return { type: 'video' };
}

// --- VIDEO HELPERS (Fix Bug 153 & Config Error) ---
function getEmbedUrl(url, autoplay) {
    if (!url) return null;

    // 1. YouTube (Bắt chặt ID 11 ký tự, hỗ trợ mọi dạng link: shorts, m., youtu.be...)
    const ytMatch = url.match(/(?:youtube(?:-nocookie)?\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=|shorts\/)|youtu\.be\/)([^"&?\/\s]{11})/);
    
    if (ytMatch && ytMatch[1]) {
        let embed = `https://www.youtube.com/embed/${ytMatch[1]}?rel=0`;
        if (autoplay) embed += "&autoplay=1&mute=1"; 
        return { type: 'iframe', url: embed };
    }

    // 2. Vimeo
    const vimeoMatch = url.match(/(?:vimeo\.com\/|player\.vimeo\.com\/video\/)(\d+)/);
    if (vimeoMatch && vimeoMatch[1]) {
        let embed = `https://player.vimeo.com/video/${vimeoMatch[1]}`;
        if (autoplay) embed += "?autoplay=1&muted=1";
        return { type: 'iframe', url: embed };
    }

    // 3. File trực tiếp (.mp4) hoặc link không xác định -> Dùng thẻ Video
    return { type: 'video', url: url };
}

// Update nested data path in a block (e.g. 'settings.randomizeQuestions')
function updateBlockData(index, path, value) {
    const engine = ensureCanvasEngine();
    if (engine) return engine.updateField(index, path, value);
    if (typeof index !== 'number' || !blocks[index]) return;
    const keys = path.split('.');
    let target = blocks[index].data;
    for (let i = 0; i < keys.length - 1; i++) {
        const k = keys[i];
        if (!target[k]) target[k] = {};
        target = target[k];
    }
    const finalKey = keys[keys.length - 1];
    if (typeof value === 'string' && /^\d+$/.test(value)) {
        value = Number(value);
    }
    target[finalKey] = value;
    markStudioDirty();
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
                <button type="button" class="btn-add-q" data-quiz-action="add-question" data-container-id="${containerId}" data-question-type="choice"><i class="fas fa-list-ul"></i> Trắc nghiệm</button>
                <button type="button" class="btn-add-q" data-quiz-action="add-question" data-container-id="${containerId}" data-question-type="fill"><i class="fas fa-edit"></i> Điền từ</button>
                <button type="button" class="btn-add-q" data-quiz-action="add-question" data-container-id="${containerId}" data-question-type="essay"><i class="fas fa-pen-nib"></i> Tự luận</button>
                <button type="button" class="btn-add-q" data-quiz-action="add-question" data-container-id="${containerId}" data-question-type="matching"><i class="fas fa-link"></i> Nối ý</button>
                <button type="button" class="btn-add-q" data-quiz-action="add-question" data-container-id="${containerId}" data-question-type="ordering"><i class="fas fa-sort-amount-down"></i> Sắp xếp</button>
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
    } else if (type === 'matching') {
        qData.question = 'Nối các khái niệm sau:';
        qData.pairs = [{left: '', right: ''}, {left: '', right: ''}];
    } else if (type === 'ordering') {
        qData.question = 'Sắp xếp theo thứ tự đúng:';
        qData.items = ['', '', ''];
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
        <button type="button" class="btn-ctrl delete" data-quiz-action="remove-option" tabindex="-1"><i class="fas fa-minus"></i></button>
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

window.addPairToQuestion = function(btn) {
    const container = btn.parentElement.querySelector('.q-pairs-container');
    const div = document.createElement('div');
    div.className = 'pair-row';
    div.style.cssText = 'display:flex; gap:10px; margin-bottom:5px;';
    div.innerHTML = `<input type="text" class="studio-select q-pair-left" placeholder="Vế trái"><input type="text" class="studio-select q-pair-right" placeholder="Vế phải (đáp án đúng)"><button type="button" class="btn-ctrl delete" data-quiz-action="remove-option"><i class="fas fa-minus"></i></button>`;
    container.appendChild(div);
}
window.addOrderToQuestion = function(btn) {
    const container = btn.parentElement.querySelector('.q-order-container');
    const idx = container.querySelectorAll('.order-row').length + 1;
    const div = document.createElement('div');
    div.className = 'order-row';
    div.style.cssText = 'display:flex; align-items:center; gap:10px; margin-bottom:5px;';
    div.innerHTML = `<span style="color:#999; font-weight:bold;">${idx}.</span><input type="text" class="studio-select q-order-val" placeholder="Nhập bước"><button type="button" class="btn-ctrl delete" data-quiz-action="remove-option"><i class="fas fa-minus"></i></button>`;
    container.appendChild(div);
}

function renderSingleQuestionItem(q, idx, container) {
    const div = document.createElement('div');
    div.className = 'quiz-item';
    div.dataset.type = q.type;
    div.style.cssText = "background:#f9fafb; padding:15px; border:1px solid #e5e7eb; border-radius:8px; margin-bottom:15px; position:relative;";

    let badge = '', contentHtml = '';
    const deleteBtn = `<button type="button" class="btn-ctrl delete" style="position:absolute; top:10px; right:10px;" data-quiz-action="remove-question"><i class="fas fa-trash"></i></button>`;

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
                    <button type="button" class="btn-ctrl delete" data-quiz-action="remove-option" tabindex="-1"><i class="fas fa-minus"></i></button>
                </div>`;
        });

        contentHtml = `
            <input type="text" class="studio-select q-title" placeholder="Nhập câu hỏi..." value="${q.question}" style="font-weight:700; margin-bottom:10px;">
            <div class="q-options-container">${optsHtml}</div>
            <div style="margin-top:10px; display:flex; gap:10px;">
                <button type="button" class="btn-mini-add" data-quiz-action="add-option" data-group-name="${uniqueName}">+ Đáp án</button>
                <label style="font-size:0.8rem; display:flex; align-items:center; gap:5px;">
                    <input type="checkbox" class="q-multi-toggle" data-quiz-action="toggle-multi" data-group-name="${uniqueName}" ${q.isMulti ? 'checked' : ''}> Chọn nhiều
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
    } else if (q.type === 'matching') {
        badge = `<span class="q-type-badge" style="background:#e0e7ff; color:#4338ca; border:1px solid #c7d2fe;">NỐI Ý</span>`;
        let pairsHtml = '';
        (q.pairs || []).forEach((p, i) => {
            pairsHtml += `
                <div class="pair-row" style="display:flex; gap:10px; margin-bottom:5px;">
                    <input type="text" class="studio-select q-pair-left" value="${p.left}" placeholder="Vế trái">
                    <input type="text" class="studio-select q-pair-right" value="${p.right}" placeholder="Vế phải (đáp án đúng)">
                    <button type="button" class="btn-ctrl delete" data-quiz-action="remove-option"><i class="fas fa-minus"></i></button>
                </div>`;
        });
        contentHtml = `
            <input type="text" class="studio-select q-title" placeholder="Câu hỏi..." value="${q.question}" style="font-weight:700; margin-bottom:10px;">
            <div class="q-pairs-container">${pairsHtml}</div>
            <button type="button" class="btn-mini-add mt-2" onclick="addPairToQuestion(this)">+ Thêm cặp</button>
        `;
    } else if (q.type === 'ordering') {
        badge = `<span class="q-type-badge" style="background:#ffedd5; color:#c2410c; border:1px solid #fed7aa;">SẮP XẾP</span>`;
        let itemsHtml = '';
        (q.items || []).forEach((item, i) => {
            itemsHtml += `
                <div class="order-row" style="display:flex; align-items:center; gap:10px; margin-bottom:5px;">
                    <span style="color:#999; font-weight:bold;">${i+1}.</span>
                    <input type="text" class="studio-select q-order-val" value="${item}" placeholder="Nhập bước theo đúng thứ tự">
                    <button type="button" class="btn-ctrl delete" data-quiz-action="remove-option"><i class="fas fa-minus"></i></button>
                </div>`;
        });
        contentHtml = `
            <input type="text" class="studio-select q-title" placeholder="Câu hỏi..." value="${q.question}" style="font-weight:700; margin-bottom:10px;">
            <div style="font-size:0.8rem; color:#666; margin-bottom:5px;">Lưu ý: Nhập các mục theo đúng thứ tự chuẩn xác từ trên xuống dưới.</div>
            <div class="q-order-container">${itemsHtml}</div>
            <button type="button" class="btn-mini-add mt-2" onclick="addOrderToQuestion(this)">+ Thêm mục</button>
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
        } else if (type === 'matching') {
            const question = item.querySelector('.q-title').value;
            const pairs = [];
            item.querySelectorAll('.pair-row').forEach(row => {
                const left = row.querySelector('.q-pair-left').value.trim();
                const right = row.querySelector('.q-pair-right').value.trim();
                if (left || right) pairs.push({ left, right });
            });
            if(question.trim() && pairs.length > 0) data.push({ type, question, pairs, explanation });
        } else if (type === 'ordering') {
            const question = item.querySelector('.q-title').value;
            const orderItems = [];
            item.querySelectorAll('.order-row').forEach(row => {
                const val = row.querySelector('.q-order-val').value.trim();
                if (val) orderItems.push(val);
            });
            if(question.trim() && orderItems.length > 0) data.push({ type, question, items: orderItems, explanation });
        }
    });
    return JSON.stringify(data);
}

/* ==========================================================================
   PART 4: SAVING LOGIC
   ========================================================================== */

async function submitLessonAJAX(publishStatus) {
    const btnDraft = document.querySelector('#panel-lesson .btn-draft');
    const btnPublish = document.querySelector('#panel-lesson .btn-publish');
    
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

    setSaveStatus(publishStatus ? 'Dang dang bai...' : 'Dang luu nhap...', 'saving');

    try {
        const titleInput = document.getElementById('mainTitleInput');
        if (!titleInput.value.trim()) {
            Swal.fire('Thiếu thông tin', 'Vui lòng nhập tên bài học.', 'warning');
            throw new Error("Missing title");
        }

        const title = titleInput.value;
        const isProInp = document.getElementById('isProInput');
        const isPro = isProInp ? isProInp.checked : false;
        const allowSaveInp = document.getElementById('allowSaveProgressInput');
        const allowSaveProgress = allowSaveInp ? allowSaveInp.checked : true;
        
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
            allowSaveProgress,
            subjectId, courseId, // New field for hierarchy
            quizData: JSON.stringify(quizData),
            curriculumSnapshot: JSON.stringify(treeData),
            allowDestructiveSync: true,
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

            // [FIX 1] CẬP NHẬT TRẠNG THÁI TRÊN CÂY THƯ MỤC (TreeList)
            // Tìm item bài học đang active
            const treeItem = document.querySelector(`.tree-lesson[data-lesson-id="${activeLessonId}"]`);
            if (treeItem) {
                const actionDiv = treeItem.querySelector('.lesson-actions');
                const draftIcon = actionDiv.querySelector('.fa-pencil-ruler'); // Icon bút chì

                if (publishStatus) {
                    // Nếu ĐĂNG -> Xóa icon bút chì (nếu có)
                    if (draftIcon) draftIcon.remove();
                } else {
                    // Nếu LƯU NHÁP -> Thêm icon bút chì (nếu chưa có)
                    if (!draftIcon) {
                        const iconHtml = `<i class="fas fa-pencil-ruler" style="font-size: 0.7rem; color: #f59e0b;" title="Bản nháp"></i>`;
                        actionDiv.insertAdjacentHTML('afterbegin', iconHtml);
                    }
                }
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
            clearStudioDirty(publishStatus ? 'Da dang bai' : 'Da luu nhap');
            refreshStudioUI('lesson');

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
        if (hasDirtyChanges()) setSaveStatus('Co thay doi chua luu', 'dirty');
    }
}

/* ==========================================================================
   PART 5: IMPORT / EXPORT TOOLS
   ========================================================================== */

/**
 * Xuất nội dung bài học hiện tại ra file .json
 * Cập nhật: Xuất theo cấu trúc Object { title, description, blocks } chuẩn AI
 */
function exportLessonJSON() {
    const titleInput = document.getElementById('mainTitleInput');
    const currentTitle = titleInput ? titleInput.value.trim() : '';

    // 1. Tạo cấu trúc dữ liệu chuẩn (Format Mới)
    const exportData = {
        title: currentTitle || "Bài học không tên",
        description: "Bài học được xuất từ hệ thống quản lý.", // Placeholder nếu sau này có field description
        blocks: blocks // Mảng blocks toàn cục
    };

    // 2. Serialize
    const dataStr = JSON.stringify(exportData, null, 2); // Format đẹp
    const blob = new Blob([dataStr], { type: "application/json" });

    // 3. Tạo tên file dựa trên tiêu đề bài học
    let filename = 'lesson_data.json';
    if (currentTitle) {
        // Chuyển tiếng Việt có dấu thành không dấu, thay khoảng trắng bằng _
        const cleanTitle = currentTitle
            .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
            .replace(/[^a-zA-Z0-9]/g, '_')
            .toLowerCase();
        filename = `${cleanTitle}.json`;
    }

    // 4. Tải xuống
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
 * Nhập nội dung từ file .json vào editor (Hỗ trợ cả format cũ và format AI mới)
 */
async function importLessonJSON(input) {
    const file = input.files[0];
    if (!file) return;

    // Cảnh báo trước khi ghi đè
    const result = await Swal.fire({
        title: 'Nhập dữ liệu?',
        text: "Hành động này sẽ GHI ĐÈ toàn bộ nội dung hiện tại. Bạn có chắc không?",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#3085d6',
        cancelButtonColor: '#d33',
        confirmButtonText: 'Đồng ý nhập',
        cancelButtonText: 'Hủy'
    });

    if (!result.isConfirmed) {
        input.value = ''; 
        return;
    }

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const json = JSON.parse(e.target.result);
            let validBlocks = null;
            let lessonTitle = null;

            // [FIX] CASE 1: Format cũ (Chỉ là mảng blocks)
            if (Array.isArray(json)) {
                validBlocks = json;
            } 
            // [FIX] CASE 2: Format AI mới (Object chứa title, description, blocks)
            else if (typeof json === 'object' && json !== null && Array.isArray(json.blocks)) {
                validBlocks = json.blocks;
                lessonTitle = json.title; // Lấy luôn tiêu đề
            }

            if (validBlocks) {
                // 1. Cập nhật Blocks
                blocks = validBlocks;
                markStudioDirty();
                renderBlocks();
                refreshStudioUI('lesson');

                // 2. Tự động điền tiêu đề nếu có (Format AI)
                if (lessonTitle) {
                    const titleInput = document.getElementById('mainTitleInput');
                    if (titleInput) {
                        titleInput.value = lessonTitle;
                        // Trigger sự kiện để cập nhật bên cây thư mục nếu cần
                        titleInput.dispatchEvent(new Event('input')); 
                    }
                }

                Swal.fire({
                    icon: 'success',
                    title: 'Nhập thành công!',
                    text: `Đã tải ${validBlocks.length} khối nội dung.${lessonTitle ? ' Đã cập nhật tiêu đề.' : ''}`,
                    timer: 2000,
                    showConfirmButton: false
                });
            } else {
                Swal.fire('Lỗi định dạng', 'File JSON không chứa cấu trúc bài học hợp lệ (cần mảng "blocks").', 'error');
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
    setSaveStatus('Dang luu cau hinh khoa hoc...', 'saving');

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
                clearStudioDirty('Da luu cau hinh khoa hoc');
                // Update select box tên khóa học nếu cần
                const select = document.getElementById('selectCourse');
                if(select && select.options[select.selectedIndex]) {
                    select.options[select.selectedIndex].text = title;
                }
                refreshStudioUI('course');
                setTimeout(() => { headerLabel.innerHTML = '<i class="fas fa-sliders-h"></i> Thiết lập'; }, 2000);
            }
        } catch(e) {
            headerLabel.innerHTML = '<i class="fas fa-exclamation-triangle" style="color:red"></i> Lỗi lưu';
            setSaveStatus('Luu cau hinh that bai', 'error');
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
    setSaveStatus(btnText, 'saving'); // Tận dụng hàm setSaveStatus có sẵn hoặc dùng Swal loading

    try {
        const curriculumSnapshot = getTreeStructure();

        const res = await fetch(`/api/course/${courseId}/update-full`, { // Gọi route mới
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                title, description, thumbnail, isPro, isPublished,
                curriculumSnapshot: JSON.stringify(curriculumSnapshot), // Gửi kèm cây
                allowDestructiveSync: true
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
            clearStudioDirty(isPublished ? 'Da cong khai khoa hoc' : 'Da luu nhap khoa hoc');
            refreshStudioUI('course');
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
    const coursePublic = document.getElementById('pCoursePublic');
    if (coursePublic) coursePublic.checked = course.isPublished || false;
    
    // Update Badge
    const badge = document.getElementById('courseStatusBadge');
    if(badge) {
        badge.innerText = course.isPublished ? 'CÔNG KHAI' : 'BẢN NHÁP';
        badge.style.background = course.isPublished ? '#dcfce7' : '#f1f5f9';
        badge.style.color = course.isPublished ? '#166534' : '#475569';
    }

    refreshStudioUI('course');
}

// Hàm đăng (hoặc ẩn) tất cả bài học trong 1 chương
async function toggleUnitPublish(unitId, isPublished) {
    const actionName = isPublished ? "ĐĂNG" : "ẨN";
    
    // Confirm cho chắc chắn
    if (!confirm(`Bạn có chắc muốn ${actionName} toàn bộ bài học trong chương này không?`)) return;

    try {
        const res = await fetch('/api/unit/bulk-status', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                unitId: unitId, 
                isPublished: isPublished 
            })
        });

        const data = await res.json();

        if (data.success) {
            // Show thông báo đẹp (hoặc alert)
            if (typeof Swal !== 'undefined') {
                Swal.fire('Thành công', `Đã cập nhật ${data.updatedCount} bài học!`, 'success')
                .then(() => location.reload());
            } else {
                alert(`Thành công! Đã cập nhật ${data.updatedCount} bài học.`);
                location.reload();
            }
        } else {
            alert('Lỗi: ' + data.error);
        }
    } catch (err) {
        console.error(err);
        alert('Lỗi kết nối server!');
    }
}

// --- REVISION HISTORY SYSTEM ---

async function openRevisionHistory() {
    const lessonId = document.getElementById('currentEditingId').value;
    if (!lessonId) return alert('Vui lòng lưu bài học trước khi xem lịch sử.');

    const modal = document.getElementById('revisionModal');
    const list = document.getElementById('revisionList');
    
    modal.style.display = 'flex';
    list.innerHTML = '<div class="text-center py-4"><i class="fas fa-spinner fa-spin"></i> Đang tải...</div>';

    try {
        const res = await fetch(`/api/lesson/${lessonId}/revisions`);
        const data = await res.json();

        if (data.success) {
            if (data.revisions.length === 0) {
                list.innerHTML = '<div class="text-center text-muted py-4">Chưa có lịch sử lưu nào.</div>';
                return;
            }

            list.replaceChildren();
            const fragment = document.createDocumentFragment();

            data.revisions.forEach((rev) => {
                fragment.appendChild(createRevisionItem(rev));
            });

            list.appendChild(fragment);
        } else {
            list.innerHTML = '<div class="text-danger text-center">Lỗi tải dữ liệu.</div>';
        }
    } catch (e) {
        console.error(e);
        list.innerHTML = '<div class="text-danger text-center">Lỗi kết nối.</div>';
    }
}

async function restoreRevision(revId) {
    if (!confirm('CẢNH BÁO: Nội dung hiện tại sẽ bị thay thế bằng phiên bản này. Bạn có chắc không?')) return;

    try {
        const res = await fetch(`/api/lesson/restore/${revId}`, { method: 'POST' });
        const data = await res.json();

        if (data.success) {
            alert('Khôi phục thành công! Trang sẽ tải lại.');
            location.reload();
        } else {
            alert('Lỗi: ' + data.error);
        }
    } catch (e) {
        console.error(e);
        alert('Lỗi kết nối server.');
    }
}

function createRevisionItem(rev) {
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'display:flex; justify-content:space-between; align-items:center; padding:10px; border-bottom:1px solid #f1f5f9;';

    const content = document.createElement('div');

    const title = document.createElement('div');
    title.style.cssText = 'font-weight:600; color:#334155;';
    title.textContent = new Date(rev.createdAt).toLocaleString('vi-VN');

    const meta = document.createElement('div');
    meta.style.cssText = 'font-size:0.8rem; color:#64748b;';

    const icon = document.createElement('i');
    icon.className = 'fas fa-user';
    icon.style.marginRight = '6px';

    const username = rev.updatedBy ? rev.updatedBy.username : 'Ẩn danh';
    const boldTitle = document.createElement('b');
    boldTitle.textContent = rev.title || 'Không có tiêu đề';

    meta.append(icon, document.createTextNode(`${username} - Tiêu đề: `), boldTitle);
    content.append(title, meta);

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn btn-sm btn-outline-primary';
    button.dataset.revisionAction = 'restore';
    button.dataset.revisionId = rev._id;

    const buttonIcon = document.createElement('i');
    buttonIcon.className = 'fas fa-undo';
    buttonIcon.style.marginRight = '6px';
    button.append(buttonIcon, document.createTextNode('Khôi phục'));

    wrapper.append(content, button);
    return wrapper;
}
