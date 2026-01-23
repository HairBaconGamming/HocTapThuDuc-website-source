/**
 * COURSES PAGE LOGIC
 * Features: Scroll Animations, Client-side Search, Filter UI
 */

document.addEventListener('DOMContentLoaded', () => {
    initScrollReveal();
    initSearch();
    initFilterTags();
});

// 1. SCROLL REVEAL ANIMATION
function initScrollReveal() {
    const observerOptions = {
        root: null,
        rootMargin: '0px',
        threshold: 0.1
    };

    const revealObserver = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('active');
                observer.unobserve(entry.target);
            }
        });
    }, observerOptions);

    document.querySelectorAll('.reveal-holder').forEach(el => {
        revealObserver.observe(el);
    });
}

// 2. CLIENT-SIDE SEARCH FUNCTION
function initSearch() {
    const searchInput = document.getElementById('searchInput');
    if (!searchInput) return;

    searchInput.addEventListener('keyup', function() {
        const val = this.value.toLowerCase().trim();
        const cards = document.querySelectorAll('.course-card');
        let hasResult = false;

        cards.forEach(card => {
            // Lấy title và cả tên tác giả để tìm kiếm
            const title = card.querySelector('.course-title').innerText.toLowerCase();
            const author = card.querySelector('.author-name').innerText.toLowerCase();
            const tag = card.querySelector('.course-category-badge').innerText.toLowerCase();

            if (title.includes(val) || author.includes(val) || tag.includes(val)) {
                card.style.display = 'flex';
                // Reset animation để nó hiện lại đẹp mắt
                card.classList.remove('active');
                setTimeout(() => card.classList.add('active'), 50);
                hasResult = true;
            } else {
                card.style.display = 'none';
            }
        });

        // Xử lý thông báo không tìm thấy (Optional: Bạn có thể thêm div thông báo vào HTML)
        // console.log(hasResult ? "Found" : "Not Found");
    });
}

// 3. FILTER TAGS UI (Chỉ là hiệu ứng Click, chưa gọi API)
function initFilterTags() {
    const tags = document.querySelectorAll('.filter-tag');
    
    tags.forEach(tag => {
        tag.addEventListener('click', function() {
            // Xóa active cũ
            tags.forEach(t => t.classList.remove('active'));
            // Thêm active mới
            this.classList.add('active');
            
            // TODO: Kết hợp logic lọc bài học ở đây nếu muốn
            const filterValue = this.innerText.toLowerCase();
            const searchInput = document.getElementById('searchInput');
            
            if(filterValue === 'tất cả') {
                if(searchInput) {
                    searchInput.value = '';
                    searchInput.dispatchEvent(new Event('keyup')); // Reset search
                }
            } else {
                // Giả lập tìm kiếm theo tag
                if(searchInput) {
                    searchInput.value = filterValue;
                    searchInput.dispatchEvent(new Event('keyup'));
                }
            }
        });
    });
}