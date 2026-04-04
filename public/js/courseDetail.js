(function () {
    function normalizeText(value) {
        return String(value || '').trim().toLowerCase();
    }

    function getStickyCard() {
        return document.getElementById('courseStickyCard');
    }

    function getDefaultPreview() {
        const card = getStickyCard();
        if (!card) return null;

        return {
            state: card.dataset.defaultState || '',
            title: card.dataset.defaultTitle || '',
            meta: card.dataset.defaultMeta || '',
            href: card.dataset.defaultHref || '#',
            cta: card.dataset.defaultCta || 'Vào học'
        };
    }

    function setStickyPreview(preview) {
        if (!preview) return;

        const stateEl = document.getElementById('courseStickyState');
        const titleEl = document.getElementById('courseStickyTitle');
        const metaEl = document.getElementById('courseStickyMeta');
        const primaryEl = document.getElementById('courseStickyPrimary');
        const primaryLabelEl = document.getElementById('courseStickyPrimaryLabel');
        const mobileTitleEl = document.getElementById('courseMobileTitle');
        const mobilePrimaryEl = document.getElementById('courseMobilePrimary');
        const mobilePrimaryLabelEl = document.getElementById('courseMobilePrimaryLabel');

        if (stateEl) stateEl.textContent = preview.state || '';
        if (titleEl) titleEl.textContent = preview.title || '';
        if (metaEl) metaEl.textContent = preview.meta || '';

        if (primaryEl) primaryEl.href = preview.href || '#';
        if (primaryLabelEl) primaryLabelEl.textContent = preview.cta || 'Vào học';

        if (mobileTitleEl) mobileTitleEl.textContent = preview.title || '';
        if (mobilePrimaryEl) mobilePrimaryEl.href = preview.href || '#';
        if (mobilePrimaryLabelEl) mobilePrimaryLabelEl.textContent = preview.cta || 'Vào học';
    }

    function extractPreview(node) {
        if (!node) return null;
        return {
            state: node.dataset.previewState || '',
            title: node.dataset.previewTitle || '',
            meta: node.dataset.previewMeta || '',
            href: node.dataset.previewHref || node.getAttribute('href') || '#',
            cta: node.dataset.previewCta || 'Vào học'
        };
    }

    function clearPreviewState() {
        document.querySelectorAll('.course-roadmap-lesson.is-previewed').forEach((node) => {
            node.classList.remove('is-previewed');
        });
    }

    function setPreviewFromNode(node) {
        if (!node) {
            setStickyPreview(getDefaultPreview());
            clearPreviewState();
            return;
        }

        clearPreviewState();
        node.classList.add('is-previewed');
        setStickyPreview(extractPreview(node));
    }

    function applyFilters() {
        const query = normalizeText(document.getElementById('courseLessonSearch')?.value);
        const activeFilter = document.querySelector('#courseFilterPills button.is-active')?.dataset.courseFilter || 'all';

        let visibleUnitCount = 0;
        let visibleLessonCount = 0;

        document.querySelectorAll('[data-unit-card]').forEach((unitCard) => {
            const unitTitle = normalizeText(unitCard.dataset.unitTitle);
            let unitHasVisibleLesson = false;

            unitCard.querySelectorAll('[data-lesson-row]').forEach((lessonRow) => {
                const lessonTitle = normalizeText(lessonRow.dataset.lessonTitle);
                const lessonType = lessonRow.dataset.lessonType || '';
                const isLocked = lessonRow.dataset.lessonLocked === 'true';
                const isCompleted = lessonRow.dataset.lessonCompleted === 'true';

                const queryMatch = !query || unitTitle.includes(query) || lessonTitle.includes(query);
                let filterMatch = true;

                if (activeFilter === 'video') filterMatch = lessonType === 'video';
                else if (activeFilter === 'quiz') filterMatch = lessonType === 'quiz' || lessonType === 'question';
                else if (activeFilter === 'locked') filterMatch = isLocked;
                else if (activeFilter === 'completed') filterMatch = isCompleted;

                const shouldShow = queryMatch && filterMatch;
                lessonRow.style.display = shouldShow ? '' : 'none';

                if (shouldShow) {
                    unitHasVisibleLesson = true;
                    visibleLessonCount += 1;
                }
            });

            unitCard.style.display = unitHasVisibleLesson ? '' : 'none';
            if (unitHasVisibleLesson) visibleUnitCount += 1;
        });

        const lessonCountEl = document.getElementById('courseVisibleLessonCount');
        const unitCountEl = document.getElementById('courseVisibleUnitCount');
        if (lessonCountEl) lessonCountEl.textContent = String(visibleLessonCount);
        if (unitCountEl) unitCountEl.textContent = String(visibleUnitCount);

        const activePreview = document.querySelector('.course-roadmap-lesson.is-previewed');
        if (activePreview && activePreview.style.display === 'none') {
            setPreviewFromNode(null);
        }
    }

    function bindFilters() {
        const pills = document.getElementById('courseFilterPills');
        if (pills) {
            pills.addEventListener('click', (event) => {
                const button = event.target.closest('button[data-course-filter]');
                if (!button) return;

                pills.querySelectorAll('button[data-course-filter]').forEach((item) => {
                    item.classList.toggle('is-active', item === button);
                });

                applyFilters();
            });
        }

        const search = document.getElementById('courseLessonSearch');
        if (search) {
            search.addEventListener('input', applyFilters);
        }
    }

    function bindRoadmapPreview() {
        document.addEventListener('mouseenter', (event) => {
            const lessonRow = event.target.closest('.course-roadmap-lesson[data-lesson-row]');
            if (!lessonRow) return;
            setPreviewFromNode(lessonRow);
        }, true);

        document.addEventListener('focusin', (event) => {
            const lessonRow = event.target.closest('.course-roadmap-lesson[data-lesson-row]');
            if (!lessonRow) return;
            setPreviewFromNode(lessonRow);
        });
    }

    document.addEventListener('DOMContentLoaded', () => {
        setStickyPreview(getDefaultPreview());
        bindFilters();
        bindRoadmapPreview();
        applyFilters();
    });
})();
