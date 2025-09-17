// public/js/lessonFilter.js

document.addEventListener('DOMContentLoaded', () => {
    const tagListContainer = document.querySelector('.tag-list');
    if (!tagListContainer) return;

    const lessonsGrid = document.querySelector('.lessons-grid');
    const allLessonCards = lessonsGrid ? Array.from(lessonsGrid.querySelectorAll('.lesson-card-v2')) : [];
    const filterButtons = tagListContainer.querySelectorAll('.tag-filter-btn');

    const filterLessons = (selectedTag) => {
        allLessonCards.forEach(card => {
            if (selectedTag === 'all') {
                card.classList.remove('hidden');
                return;
            }
            
            const cardTags = card.dataset.tags ? card.dataset.tags.split(',') : [];
            if (cardTags.includes(selectedTag)) {
                card.classList.remove('hidden');
            } else {
                card.classList.add('hidden');
            }
        });
    };

    filterButtons.forEach(button => {
        button.addEventListener('click', (e) => {
            const selectedTag = e.currentTarget.dataset.tag;

            // 1. Cập nhật giao diện nút
            filterButtons.forEach(btn => btn.classList.remove('active'));
            e.currentTarget.classList.add('active');

            // 2. Cập nhật URL mà không reload
            const currentUrl = new URL(window.location.href);
            if (selectedTag === 'all') {
                currentUrl.searchParams.delete('tag');
            } else {
                currentUrl.searchParams.set('tag', selectedTag);
            }
            history.pushState({}, '', currentUrl);

            // 3. Lọc các card
            filterLessons(selectedTag);
        });
    });
});