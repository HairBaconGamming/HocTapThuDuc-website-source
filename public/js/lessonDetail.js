// public/js/lessonDetail.js

document.addEventListener('DOMContentLoaded', () => {
    // Lấy lessonType từ data-attribute trên thẻ body
    const lessonType = document.body.dataset.lessonType;

    // --- LOGIC CHUNG ---
    // (GSAP Animations, Lightbox, Loading Link, Completion Logic... giữ nguyên như phiên bản trước)

    // =========================================================================
    // ===== LOGIC DÀNH RIÊNG CHO QUIZ (ĐÃ NÂNG CẤP) =====
    // =========================================================================
    if (lessonType === 'quiz') {
        const quizContainer = document.getElementById('quizContainerV2');
        if (!quizContainer) return;

        // Lưu trữ template gốc của các câu hỏi
        const originalQuestionTemplates = Array.from(quizContainer.querySelectorAll('.quiz-question-card'));
        const quizForm = document.getElementById('quizFormV2');
        const resultDiv = document.getElementById('quizResultV2');
        const resetBtn = document.getElementById("resetQuizBtnV2");
        const randomQuestionsToggle = document.getElementById("toggleRandomQuestions");
        const randomChoicesToggle = document.getElementById("toggleRandomChoices");
        const paginationContainer = document.getElementById('quizPagination');

        const ITEMS_PER_PAGE = 5;
        let currentPage = 1;

        /**
         * Hàm render lại toàn bộ giao diện quiz từ template gốc.
         * Đảm bảo mọi thứ đều "sạch sẽ" như lúc mới tải trang.
         */
        const renderQuizState = () => {
            const randomizeQuestions = randomQuestionsToggle.checked;
            const randomizeChoices = randomChoicesToggle.checked;

            // 1. Sao chép và xáo trộn (nếu cần)
            let questionElementsToRender = originalQuestionTemplates.map(el => el.cloneNode(true));
            if (randomizeQuestions) {
                for (let i = questionElementsToRender.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [questionElementsToRender[i], questionElementsToRender[j]] = [questionElementsToRender[j], questionElementsToRender[i]];
                }
            }

            // 2. Xóa sạch container
            quizContainer.innerHTML = '';

            // 3. Render lại các câu hỏi đã được sắp xếp
            questionElementsToRender.forEach(qElement => {
                // Xáo trộn đáp án nếu cần
                if (randomizeChoices) {
                    const optionsContainer = qElement.querySelector(".quiz-options-list");
                    if (optionsContainer) {
                        const options = Array.from(optionsContainer.children);
                        for (let i = options.length - 1; i > 0; i--) {
                            const j = Math.floor(Math.random() * (i + 1));
                            optionsContainer.appendChild(options[j]);
                        }
                    }
                }
                quizContainer.appendChild(qElement);
            });
            
            // 4. Reset các trạng thái giao diện khác
            resultDiv.innerHTML = '';
            quizForm.classList.remove('submitted');
            const submitBtn = quizForm.querySelector('.submit-quiz-btn');
            if (submitBtn) submitBtn.disabled = false;
            
            // 5. Thiết lập lại phân trang
            setupPagination(questionElementsToRender);
        };
        
        /**
         * Thiết lập và hiển thị phân trang dựa trên danh sách các câu hỏi hiện tại.
         */
        const setupPagination = (currentQuestionElements) => {
            const totalItems = currentQuestionElements.length;
            const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE);
            currentPage = 1;

            const showPage = (page) => {
                currentPage = page;
                const startIndex = (page - 1) * ITEMS_PER_PAGE;
                const endIndex = startIndex + ITEMS_PER_PAGE;

                currentQuestionElements.forEach((card, index) => {
                    card.style.display = (index >= startIndex && index < endIndex) ? 'block' : 'none';
                });

                renderPaginationButtons(currentQuestionElements); // Render lại nút để cập nhật active
            };

            const renderPaginationButtons = () => {
                paginationContainer.innerHTML = '';
                if (totalPages <= 1) return;

                // Nút "Trước"
                const prevBtn = document.createElement('button');
                prevBtn.innerHTML = '<i class="fas fa-chevron-left"></i>';
                prevBtn.className = 'pagination-btn';
                prevBtn.disabled = currentPage === 1;
                prevBtn.addEventListener('click', () => showPage(currentPage - 1));
                paginationContainer.appendChild(prevBtn);
                
                // Nút số (Logic nâng cao có thể thêm vào đây nếu muốn)
                const pageInfo = document.createElement('span');
                pageInfo.className = 'pagination-info';
                pageInfo.textContent = `Trang ${currentPage} / ${totalPages}`;
                paginationContainer.appendChild(pageInfo);

                // Nút "Sau"
                const nextBtn = document.createElement('button');
                nextBtn.innerHTML = '<i class="fas fa-chevron-right"></i>';
                nextBtn.className = 'pagination-btn';
                nextBtn.disabled = currentPage === totalPages;
                nextBtn.addEventListener('click', () => showPage(currentPage + 1));
                paginationContainer.appendChild(nextBtn);
            };

            showPage(1); // Hiển thị trang đầu tiên
        };


        // Gắn sự kiện
        resetBtn.addEventListener("click", renderQuizState);
        randomQuestionsToggle.addEventListener("change", renderQuizState);
        randomChoicesToggle.addEventListener("change", renderQuizState);

        // Khởi tạo lần đầu
        renderQuizState();
    }
    
    // ... (Toàn bộ logic khác của trang detail: quiz submission, essay, markdown, v.v. giữ nguyên) ...
});