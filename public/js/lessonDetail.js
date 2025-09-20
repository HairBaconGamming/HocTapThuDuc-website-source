// public/js/lessonDetail.js

document.addEventListener('DOMContentLoaded', () => {
    const lessonType = document.body.dataset.lessonType; // Cần thêm data-lesson-type vào thẻ <body> trong EJS

    if (lessonType === 'quiz') {
        // --- PAGINATION LOGIC FOR QUIZ VIEW ---
        const ITEMS_PER_PAGE = 5; // Có thể đặt khác với trang editor
        const quizContainer = document.getElementById('quizContainerV2');
        if (!quizContainer) return;

        const allQuestionCards = Array.from(quizContainer.querySelectorAll('.quiz-question-card'));
        const totalItems = allQuestionCards.length;
        
        const showPage = (page) => {
            const startIndex = (page - 1) * ITEMS_PER_PAGE;
            const endIndex = startIndex + ITEMS_PER_PAGE;
            
            allQuestionCards.forEach((card, index) => {
                if (index >= startIndex && index < endIndex) {
                    card.style.display = 'block';
                } else {
                    card.style.display = 'none';
                }
            });
        };

        const setupPagination = () => {
            const paginationContainer = document.getElementById('quizPagination');
            if (!paginationContainer) return;

            const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE);
            let currentPage = 1;

            const renderButtons = () => {
                paginationContainer.innerHTML = '';
                if (totalPages <= 1) return;

                const prevBtn = document.createElement('button');
                prevBtn.innerHTML = '<i class="fas fa-chevron-left"></i>';
                prevBtn.className = 'pagination-btn';
                prevBtn.disabled = currentPage === 1;
                prevBtn.addEventListener('click', () => {
                    if (currentPage > 1) {
                        currentPage--;
                        showPage(currentPage);
                        renderButtons();
                    }
                });
                paginationContainer.appendChild(prevBtn);

                const pageInfo = document.createElement('span');
                pageInfo.className = 'pagination-info';
                pageInfo.textContent = `Trang ${currentPage} / ${totalPages}`;
                paginationContainer.appendChild(pageInfo);

                const nextBtn = document.createElement('button');
                nextBtn.innerHTML = '<i class="fas fa-chevron-right"></i>';
                nextBtn.className = 'pagination-btn';
                nextBtn.disabled = currentPage === totalPages;
                nextBtn.addEventListener('click', () => {
                    if (currentPage < totalPages) {
                        currentPage++;
                        showPage(currentPage);
                        renderButtons();
                    }
                });
                paginationContainer.appendChild(nextBtn);
            };

            showPage(1); // Hiển thị trang đầu tiên
            renderButtons();
        };

        setupPagination();
    }
    
    // Logic cho các loại bài học khác có thể thêm vào đây
});