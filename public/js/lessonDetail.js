document.addEventListener('DOMContentLoaded', () => {
    initLessonContent();
});

function initLessonContent() {
    const contentArea = document.getElementById('lessonContentArea');
    if (!contentArea) return;

    // 1. Lấy dữ liệu RAW từ server
    const rawContent = contentArea.getAttribute('data-content');
    
    // 2. Parse JSON
    let blocks = [];
    try {
        // Kiểm tra nếu là JSON Array
        if (rawContent && (rawContent.startsWith('[') || rawContent.startsWith('{'))) {
            blocks = JSON.parse(rawContent);
        } else {
            // Fallback: Nếu là string thường (Markdown cũ)
            blocks = [{ type: 'text', data: { text: rawContent } }];
        }
    } catch (e) {
        console.error("Lỗi parse nội dung bài học:", e);
        contentArea.innerHTML = '<div class="alert alert-danger">Lỗi định dạng nội dung bài học.</div>';
        return;
    }

    // 3. Xóa loading spinner
    contentArea.innerHTML = '';

    // 4. Render từng Block
    if (Array.isArray(blocks) && blocks.length > 0) {
        blocks.forEach((block, index) => {
            const blockHTML = renderSingleBlock(block, index);
            contentArea.appendChild(blockHTML);
        });
    } else {
        contentArea.innerHTML = '<p class="text-muted text-center">Bài học chưa có nội dung.</p>';
    }
}

/* --- BLOCK RENDERER ENGINE --- */

function renderSingleBlock(block, idx) {
    const wrapper = document.createElement('div');
    wrapper.className = `content-block-render block-type-${block.type}`;
    wrapper.dataset.id = idx;

    switch (block.type) {
        case 'text':
            // Sử dụng Marked.js để render Markdown thành HTML
            const htmlContent = marked.parse(block.data.text || '');
            wrapper.innerHTML = htmlContent;
            break;

        case 'image':
            if (block.data.url) {
                const img = document.createElement('img');
                img.src = block.data.url;
                img.alt = 'Lesson Image';
                img.loading = 'lazy'; // Tối ưu hiệu năng
                wrapper.appendChild(img);
                
                // Caption (nếu có - trong data cấu trúc editor V3 có thể thêm field caption)
                if(block.data.caption) {
                    const cap = document.createElement('div');
                    cap.className = 'text-center text-muted small fst-italic';
                    cap.innerText = block.data.caption;
                    wrapper.appendChild(cap);
                }
            }
            break;

        case 'video':
            if (block.data.url) {
                const videoWrapper = document.createElement('div');
                videoWrapper.className = 'block-video';
                
                const embedUrl = getEmbedUrl(block.data.url, block.data.autoplay);
                if (embedUrl) {
                    videoWrapper.innerHTML = `<iframe src="${embedUrl}" allowfullscreen allow="autoplay; encrypted-media"></iframe>`;
                } else {
                    // Fallback cho file mp4 trực tiếp
                    videoWrapper.innerHTML = `<video src="${block.data.url}" controls style="width:100%; height:100%"></video>`;
                }
                wrapper.appendChild(videoWrapper);

                if (block.data.caption) {
                    const cap = document.createElement('div');
                    cap.className = 'video-caption';
                    cap.innerText = block.data.caption;
                    wrapper.appendChild(cap);
                }
            }
            break;

        case 'callout':
            wrapper.className += ' block-callout';
            wrapper.innerHTML = `<i class="fas fa-exclamation-circle me-2"></i> ${block.data.text || ''}`;
            break;

        case 'quiz':
        case 'question':
            if (block.data.questions && block.data.questions.length > 0) {
                wrapper.appendChild(renderQuizBlock(block.data.questions, idx));
            }
            break;

        default:
            console.warn('Unknown block type:', block.type);
            break;
    }

    return wrapper;
}

/* --- QUIZ RENDERER & LOGIC --- */

function renderQuizBlock(questions, blockIdx) {
    const container = document.createElement('div');
    container.className = 'quiz-wrapper';
    
    container.innerHTML = `<div class="quiz-header"><i class="fas fa-clipboard-check"></i> Bài tập thực hành</div>`;

    questions.forEach((q, qIdx) => {
        const qDiv = document.createElement('div');
        qDiv.className = 'question-item';
        qDiv.dataset.type = q.type;
        
        // 1. Tiêu đề câu hỏi
        let qContent = '';
        if (q.type === 'fill') {
            // Xử lý điền từ: Thay [text] thành input
            const parts = q.content.split(/(\[.*?\])/);
            qContent = parts.map(part => {
                if (part.startsWith('[') && part.endsWith(']')) {
                    const answer = part.slice(1, -1);
                    return `<input type="text" class="fill-input" data-answer="${answer}" placeholder="..." autocomplete="off">`;
                }
                return `<span>${part}</span>`;
            }).join('');
        } else {
            qContent = `<div class="q-text">Câu ${qIdx + 1}: ${q.question}</div>`;
        }
        
        // 2. Options (Cho trắc nghiệm)
        let optionsHTML = '';
        if (q.type === 'choice') {
            const inputType = q.isMulti ? 'checkbox' : 'radio';
            const name = `quiz_${blockIdx}_${qIdx}`;
            
            q.options.forEach((opt, oIdx) => {
                // Lưu index đúng vào data attribute để check
                const isCorrect = q.correct.includes(oIdx); 
                optionsHTML += `
                    <label data-correct="${isCorrect}">
                        <input type="${inputType}" name="${name}" value="${oIdx}">
                        ${opt}
                    </label>
                `;
            });
            optionsHTML = `<div class="q-options">${optionsHTML}</div>`;
        } else if (q.type === 'essay') {
            optionsHTML = `<textarea class="essay-textarea" placeholder="Nhập câu trả lời của bạn..."></textarea>`;
        }

        // 3. Giải thích (Ẩn)
        const explainHTML = q.explanation ? `<div class="explanation-box">${q.explanation}</div>` : '';

        qDiv.innerHTML = `${qContent} ${optionsHTML} ${explainHTML}`;
        container.appendChild(qDiv);
    });

    // Nút kiểm tra
    const checkBtn = document.createElement('button');
    checkBtn.className = 'btn-check-quiz';
    checkBtn.innerText = 'Kiểm tra đáp án';
    checkBtn.onclick = () => checkQuizResult(container);
    container.appendChild(checkBtn);

    return container;
}

function checkQuizResult(container) {
    const questions = container.querySelectorAll('.question-item');
    let correctCount = 0;
    let total = 0;

    questions.forEach(qDiv => {
        const type = qDiv.dataset.type;
        let isCorrect = false;

        if (type === 'choice') {
            total++;
            const inputs = qDiv.querySelectorAll('input');
            const labels = qDiv.querySelectorAll('label');
            
            // Reset styles
            labels.forEach(l => l.classList.remove('correct', 'incorrect'));

            let userCorrect = true;
            inputs.forEach(inp => {
                const parent = inp.closest('label');
                const shouldBeChecked = parent.dataset.correct === 'true';
                
                if (inp.checked) {
                    if (shouldBeChecked) {
                        parent.classList.add('correct');
                    } else {
                        parent.classList.add('incorrect');
                        userCorrect = false;
                    }
                } else {
                    if (shouldBeChecked) {
                        // Người dùng thiếu đáp án đúng này
                        // Optional: Highlight đáp án đúng bị thiếu (màu nhạt hơn)
                        parent.style.border = '1px dashed #22c55e';
                        userCorrect = false; 
                    }
                }
            });
            if (userCorrect) isCorrect = true;

        } else if (type === 'fill') {
            total++;
            const inputs = qDiv.querySelectorAll('.fill-input');
            let allFilledCorrect = true;
            
            inputs.forEach(inp => {
                const userVal = inp.value.trim().toLowerCase();
                const correctVal = inp.dataset.answer.trim().toLowerCase();
                
                if (userVal === correctVal) {
                    inp.style.color = '#15803d';
                    inp.style.borderBottomColor = '#22c55e';
                } else {
                    inp.style.color = '#b91c1c';
                    inp.style.borderBottomColor = '#ef4444';
                    allFilledCorrect = false;
                }
            });
            if(allFilledCorrect) isCorrect = true;
        }

        // Hiện giải thích nếu có
        const explainBox = qDiv.querySelector('.explanation-box');
        if(explainBox) explainBox.style.display = 'block';

        if(isCorrect) correctCount++;
    });

    // Thông báo kết quả
    if(total > 0) {
        if(correctCount === total) {
            Swal.fire('Tuyệt vời!', `Bạn đã trả lời đúng ${correctCount}/${total} câu.`, 'success');
        } else {
            Swal.fire('Cố lên!', `Bạn đúng ${correctCount}/${total} câu. Hãy xem lại các lỗi sai nhé.`, 'warning');
        }
    } else {
        // Tự luận
        Swal.fire('Đã lưu', 'Câu trả lời tự luận đã được ghi nhận.', 'info');
    }
}

/* --- HELPERS & ACTIONS --- */

// Helper lấy link Youtube/Vimeo (Copy từ lessonEditorV3 để đồng bộ)
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
    }
    if (!embedUrl && url.match(/\.(mp4|webm|ogg)$/)) return null; 
    return embedUrl;
}

// Hoàn thành bài học
async function completeLesson(lessonId) {
    const btn = document.getElementById('btnComplete');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang xử lý...';
    btn.disabled = true;

    try {
        const res = await fetch(`/lesson/${lessonId}/complete`, { method: 'POST' });
        const data = await res.json();

        if (res.ok) {
            Swal.fire({
                title: 'Hoàn thành!',
                text: data.message || `Chúc mừng! Bạn nhận được +${data.points || 0} điểm.`,
                icon: 'success',
                timer: 2000,
                showConfirmButton: false
            }).then(() => {
                // Redirect hoặc update UI
                btn.innerHTML = '<i class="fas fa-check-double"></i> Đã hoàn thành';
                btn.style.background = '#059669';
                
                // Nếu có next lesson logic thì redirect ở đây
                // window.location.href = '/next-lesson...';
            });
        } else {
            Swal.fire('Thông báo', data.error || 'Đã xảy ra lỗi.', 'info');
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
    } catch (e) {
        console.error(e);
        Swal.fire('Lỗi', 'Không thể kết nối đến server.', 'error');
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}