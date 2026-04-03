(function () {
    function createIcon(className, title) {
        const icon = document.createElement('i');
        icon.className = className;
        if (title) icon.title = title;
        return icon;
    }

    function createMiniButton(action, title, iconClass, extraData) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'btn-icon-mini';
        button.dataset.treeAction = action;
        button.title = title;

        if (extraData) {
            Object.entries(extraData).forEach(([key, value]) => {
                button.dataset[key] = value;
            });
        }

        button.appendChild(createIcon(iconClass, title));
        return button;
    }

    function createRootNode(courseName) {
        const rootEl = document.createElement('div');
        rootEl.className = 'tree-root-item';
        rootEl.dataset.treeAction = 'select-course-root';
        rootEl.style.cssText = 'padding: 10px 5px; font-weight: 700; color: #2563eb; cursor: pointer; border-bottom: 2px solid #eff6ff; display: flex; align-items: center;';

        const icon = createIcon('fas fa-graduation-cap', 'Chọn khóa học');
        icon.style.marginRight = '8px';

        const label = document.createElement('span');
        label.style.flexGrow = '1';
        label.textContent = courseName;

        const chevron = createIcon('fas fa-chevron-right');
        chevron.style.cssText = 'font-size: 0.8rem; color: #bfdbfe;';

        rootEl.append(icon, label, chevron);
        return rootEl;
    }

    function createUnitNode(id, title) {
        const unitEl = document.createElement('div');
        unitEl.className = 'tree-unit';
        unitEl.dataset.unitId = id;

        const header = document.createElement('div');
        header.className = 'tree-unit-header';
        header.dataset.treeAction = 'select-unit';
        header.dataset.unitId = id;

        const left = document.createElement('div');
        left.style.cssText = 'display:flex; align-items:center; flex-grow:1;';

        const grip = createIcon('fas fa-grip-vertical drag-handle-unit', 'Kéo để sắp xếp chương');
        grip.dataset.treeAction = 'noop';
        grip.style.cssText = 'color:#ccc; cursor:grab; margin-right:8px;';

        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'unit-title-input';
        input.value = title || '';
        input.placeholder = 'Nhập tên chương...';
        input.autocomplete = 'off';
        input.style.flexGrow = '1';

        left.append(grip, input);

        const actions = document.createElement('div');
        actions.className = 'tree-actions';
        actions.appendChild(
            createMiniButton('add-lesson', 'Thêm bài vào chương này', 'fas fa-plus', { unitId: id })
        );

        header.append(left, actions);

        const listContainer = document.createElement('div');
        listContainer.className = 'tree-lesson-list';
        listContainer.dataset.unitId = id;

        unitEl.append(header, listContainer);
        return unitEl;
    }

    function createLessonNode(lesson, activeLessonId) {
        const lessonId = lesson._id || lesson.id;
        const isDraft = lesson.isPublished === false || String(lessonId).startsWith('new_') || lessonId === 'current_new_lesson';

        const el = document.createElement('div');
        el.className = `tree-lesson ${String(lessonId) === String(activeLessonId) ? 'active' : ''}`;
        el.dataset.lessonId = lessonId;
        el.dataset.lessonType = lesson.type || 'theory';
        el.dataset.treeAction = 'select-lesson';

        const main = document.createElement('div');
        main.style.cssText = 'display:flex; align-items:center; flex-grow:1; overflow:hidden; padding-right:5px;';

        const drag = createIcon('fas fa-ellipsis-v drag-handle', 'Kéo để sắp xếp bài học');
        drag.dataset.treeAction = 'noop';
        drag.style.cssText = 'margin-right:8px; cursor:grab; color:#ccc;';

        const iconWrap = document.createElement('span');
        iconWrap.className = 'lesson-icon';
        iconWrap.style.marginRight = '8px';
        iconWrap.innerHTML = getLessonIconMarkup(lesson.type);

        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'lesson-title-input';
        input.value = lesson.title || '';
        input.autocomplete = 'off';
        input.style.cssText = 'flex-grow:1; border:none; background:transparent; min-width:0;';

        main.append(drag, iconWrap, input);

        const actions = document.createElement('div');
        actions.className = 'lesson-actions';
        actions.style.cssText = 'display:flex; align-items:center; gap:8px;';

        if (isDraft) {
            const statusIcon = createIcon('fas fa-pencil-ruler', 'Bản nháp');
            statusIcon.style.cssText = 'font-size: 0.7rem; color: #f59e0b;';
            actions.appendChild(statusIcon);
        }

        const deleteButton = createMiniButton('delete-lesson', 'Xóa bài học', 'fas fa-times', { lessonId });
        deleteButton.classList.add('delete-lesson-btn');
        const deleteIcon = deleteButton.querySelector('i');
        if (deleteIcon) deleteIcon.style.color = '#ef4444';
        actions.appendChild(deleteButton);

        el.append(main, actions);
        return el;
    }

    function getLessonIconMarkup(type) {
        if (type === 'video') return '<i class="fas fa-video"></i>';
        if (type === 'question' || type === 'quiz') return '<i class="fas fa-question-circle"></i>';
        return '<i class="fas fa-file-alt"></i>';
    }

    window.LessonTreeRenderers = {
        createRootNode,
        createUnitNode,
        createLessonNode
    };
})();
