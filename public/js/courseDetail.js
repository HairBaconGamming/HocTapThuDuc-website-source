(function () {
    const STORAGE_PREFIX = 'course-detail-open-units:';

    function normalizeText(value) {
        return String(value || '').trim().toLowerCase();
    }

    function getCourseId() {
        return window.COURSE_DETAIL_STATE?.courseId || '';
    }

    function getStorageKey() {
        return `${STORAGE_PREFIX}${getCourseId() || 'default'}`;
    }

    function readOpenUnits() {
        try {
            const raw = window.localStorage.getItem(getStorageKey());
            const parsed = raw ? JSON.parse(raw) : [];
            return Array.isArray(parsed) ? new Set(parsed) : new Set();
        } catch (error) {
            return new Set();
        }
    }

    function persistOpenUnits() {
        const openIndexes = Array.from(document.querySelectorAll('[data-unit-card]'))
            .filter((card) => card.querySelector('[data-unit-toggle]')?.classList.contains('is-open'))
            .map((card, index) => index);

        try {
            window.localStorage.setItem(getStorageKey(), JSON.stringify(openIndexes));
        } catch (error) {
            // ignore storage errors
        }
    }

    function applyUnitState(card, isOpen) {
        const toggle = card.querySelector('[data-unit-toggle]');
        const body = card.querySelector('[data-unit-body]');
        if (!toggle || !body) return;

        toggle.classList.toggle('is-open', isOpen);
        toggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
        body.classList.toggle('is-open', isOpen);
    }

    function restoreUnitsFromStorage() {
        const openUnits = readOpenUnits();
        document.querySelectorAll('[data-unit-card]').forEach((card, index) => {
            if (openUnits.has(index)) {
                applyUnitState(card, true);
            }
        });
    }

    function bindUnitToggles() {
        document.addEventListener('click', (event) => {
            const toggle = event.target.closest('[data-unit-toggle]');
            if (!toggle) return;

            const card = toggle.closest('[data-unit-card]');
            if (!card) return;

            const shouldOpen = !toggle.classList.contains('is-open');
            applyUnitState(card, shouldOpen);
            persistOpenUnits();
        });
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
    }

    function bindFilters() {
        const pills = document.getElementById('courseFilterPills');
        if (!pills) return;

        pills.addEventListener('click', (event) => {
            const button = event.target.closest('button[data-course-filter]');
            if (!button) return;

            pills.querySelectorAll('button[data-course-filter]').forEach((item) => {
                item.classList.toggle('is-active', item === button);
            });

            applyFilters();
        });

        const search = document.getElementById('courseLessonSearch');
        if (search) {
            search.addEventListener('input', applyFilters);
        }
    }

    function bindExpandCollapseActions() {
        document.addEventListener('click', (event) => {
            const button = event.target.closest('[data-course-action]');
            if (!button) return;

            const action = button.dataset.courseAction;
            if (action === 'expand-all' || action === 'collapse-all') {
                const shouldOpen = action === 'expand-all';
                document.querySelectorAll('[data-unit-card]').forEach((card) => {
                    if (card.style.display === 'none') return;
                    applyUnitState(card, shouldOpen);
                });
                persistOpenUnits();
            }
        });
    }

    document.addEventListener('DOMContentLoaded', () => {
        restoreUnitsFromStorage();
        bindUnitToggles();
        bindFilters();
        bindExpandCollapseActions();
        applyFilters();
    });
})();
