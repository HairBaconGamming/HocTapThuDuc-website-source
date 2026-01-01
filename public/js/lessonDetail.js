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
                // Pass the whole data object so settings are available
                wrapper.appendChild(renderQuizBlock(block.data, idx));
            }
            break;

        default:
            console.warn('Unknown block type:', block.type);
            break;
    }

    return wrapper;
}

/* --- QUIZ RENDERER & LOGIC --- */

// Shuffle helper (Fisher-Yates)
function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

function renderQuizBlock(data, blockIdx) {
    // data: { questions: [...], settings: { ... } }
    const settings = data.settings || { randomizeQuestions: false, randomizeOptions: false, passingScore: 50, showFeedback: 'submit' };

    const container = document.createElement('div');
    container.className = 'quiz-wrapper';

    container.innerHTML = `
        <div class="quiz-header">
            <span><i class="fas fa-clipboard-check"></i> Bài tập thực hành</span>
            <small style="font-weight:400; font-size:0.8rem; margin-left:auto;">
                Đạt: ${settings.passingScore}% | Chế độ: ${settings.showFeedback === 'instant' ? 'Luyện tập' : (settings.showFeedback === 'submit' ? 'Kiểm tra' : 'Ẩn giải thích')}
            </small>
        </div>
    `;

    // Deep copy questions to avoid mutating original data
    let questionsToRender = JSON.parse(JSON.stringify(data.questions || []));
    if (settings.randomizeQuestions) shuffleArray(questionsToRender);

    questionsToRender.forEach((q, qIdx) => {
        const qDiv = document.createElement('div');
        qDiv.className = 'question-item';
        qDiv.dataset.type = q.type;

        // Question title
        let qContent = '';
        if (q.type === 'fill') {
            const parts = (q.content || '').split(/(\[.*?\])/);
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

        // Options (choice)
        let optionsHTML = '';
        if (q.type === 'choice') {
            const inputType = q.isMulti ? 'checkbox' : 'radio';
            const name = `quiz_${blockIdx}_${qIdx}`;

            // Prepare options with original indices
            let optionsWithIndex = (q.options || []).map((opt, idx) => ({ text: opt, originalIndex: idx }));
            if (settings.randomizeOptions) optionsWithIndex = shuffleArray(optionsWithIndex);

            optionsWithIndex.forEach(optObj => {
                const isCorrect = (q.correct || []).includes(optObj.originalIndex);
                optionsHTML += `
                    <label class="quiz-option" data-correct="${isCorrect}">
                        <input type="${inputType}" name="${name}" value="${optObj.originalIndex}">
                        <span>${optObj.text}</span>
                    </label>
                `;
            });

            optionsHTML = `<div class="q-options">${optionsHTML}</div>`;
        } else if (q.type === 'essay') {
            optionsHTML = `<textarea class="essay-textarea" placeholder="Nhập câu trả lời của bạn..."></textarea>`;
        }

        const explainHTML = q.explanation ? `<div class="explanation-box" data-mode="${settings.showFeedback}">${q.explanation}</div>` : '';

        qDiv.innerHTML = `${qContent} ${optionsHTML} ${explainHTML}`;

        // Instant feedback mode
        if (settings.showFeedback === 'instant' && q.type === 'choice') {
            const inputs = qDiv.querySelectorAll('input');
            inputs.forEach(input => {
                input.addEventListener('change', () => {
                    const labels = qDiv.querySelectorAll('label');
                    labels.forEach(l => l.classList.remove('correct', 'incorrect'));

                    // If single choice, disable after selection
                    if (!q.isMulti) inputs.forEach(i => i.disabled = true);

                    const label = input.closest('label');
                    const isCorrect = label.dataset.correct === 'true';
                    if (isCorrect) label.classList.add('correct');
                    else {
                        label.classList.add('incorrect');
                        qDiv.querySelectorAll('label[data-correct="true"]').forEach(l => l.classList.add('correct'));
                    }

                    const expBox = qDiv.querySelector('.explanation-box');
                    if (expBox) expBox.style.display = 'block';
                });
            });
        }

        container.appendChild(qDiv);
    });

    // Add submit button for non-instant modes
    if (settings.showFeedback !== 'instant') {
        const checkBtn = document.createElement('button');
        checkBtn.className = 'btn-check-quiz';
        checkBtn.innerText = 'Nộp bài & Chấm điểm';
        checkBtn.onclick = () => checkQuizResult(container, settings);
        container.appendChild(checkBtn);
    }

    return container;
}

function checkQuizResult(container, settings = { passingScore: 50, showFeedback: 'submit' }) {
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

            // Reset
            labels.forEach(l => { l.classList.remove('correct', 'incorrect'); l.style.border = ''; });

            let userCorrect = true;
            inputs.forEach(inp => {
                const parent = inp.closest('label');
                const shouldBeChecked = parent.dataset.correct === 'true';

                if (inp.checked) {
                    if (shouldBeChecked) parent.classList.add('correct');
                    else { parent.classList.add('incorrect'); userCorrect = false; }
                } else {
                    if (shouldBeChecked) { parent.style.border = '1px dashed #22c55e'; userCorrect = false; }
                }
            });

            if (userCorrect) isCorrect = true;

            // Feedback handling
            const exp = qDiv.querySelector('.explanation-box');
            if (settings.showFeedback === 'submit') {
                if (exp) exp.style.display = 'block';
            } else if (settings.showFeedback === 'never') {
                if (exp) exp.remove();
            }

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
            if (allFilledCorrect) isCorrect = true;

            const exp = qDiv.querySelector('.explanation-box');
            if (settings.showFeedback === 'submit') {
                if (exp) exp.style.display = 'block';
            } else if (settings.showFeedback === 'never') {
                if (exp) exp.remove();
            }
        }

        if (isCorrect) correctCount++;
    });

    // Compute percentage and pass/fail
    const percentage = total > 0 ? Math.round((correctCount / total) * 100) : 0;
    const isPassed = percentage >= (settings.passingScore || 50);

    Swal.fire({
        title: isPassed ? 'Đạt Yêu Cầu! 🎉' : 'Chưa Đạt 😞',
        text: `Bạn đúng ${correctCount}/${total} câu (${percentage}%). Điểm chuẩn là ${settings.passingScore}%.`,
        icon: isPassed ? 'success' : 'error'
    });
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
            // [NÂNG CẤP] Giao diện phần thưởng đẹp mắt
            Swal.fire({
                title: '<span style="color: #059669; font-weight: 800; font-size: 1.8rem;">XUẤT SẮC! 🎉</span>',
                html: `
                    <div style="font-size: 1.1rem; color: #4b5563; margin-bottom: 20px;">
                        Bạn đã nỗ lực hết mình! Đây là phần thưởng xứng đáng:
                    </div>
                    
                    <div style="display: flex; justify-content: center; gap: 15px; margin-bottom: 10px; flex-wrap: wrap;">
                        <div class="reward-card" style="background: #ecfdf5; color: #059669; border: 2px solid #a7f3d0;">
                            <div style="font-size: 2rem; margin-bottom: 5px;">🏆</div>
                            <div style="font-weight: 800; font-size: 1.2rem;">+${data.points || 0}</div>
                            <div style="font-size: 0.9rem; font-weight: 600;">Điểm</div>
                        </div>

                        <div class="reward-card" style="background: #eff6ff; color: #2563eb; border: 2px solid #bfdbfe;">
                            <div style="font-size: 2rem; margin-bottom: 5px;">💧</div>
                            <div style="font-weight: 800; font-size: 1.2rem;">+${data.water || 0}</div>
                            <div style="font-size: 0.9rem; font-weight: 600;">Nước</div>
                        </div>

                        <div class="reward-card" style="background: #fffbeb; color: #d97706; border: 2px solid #fde68a;">
                            <div style="font-size: 2rem; margin-bottom: 5px;">💰</div>
                            <div style="font-weight: 800; font-size: 1.2rem;">+${data.gold || 0}</div>
                            <div style="font-size: 0.9rem; font-weight: 600;">Vàng</div>
                        </div>
                    </div>
                    
                    <style>
                        .reward-card {
                            width: 90px; padding: 10px; border-radius: 15px;
                            text-align: center; box-shadow: 0 4px 6px rgba(0,0,0,0.05);
                            animation: popIn 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275);
                        }
                        @keyframes popIn { from { transform: scale(0.5); opacity: 0; } to { transform: scale(1); opacity: 1; } }
                    </style>
                `,
                icon: null, // Tắt icon mặc định để dùng giao diện custom
                showConfirmButton: true,
                confirmButtonText: 'Tuyệt vời! Tiếp tục nào 🚀',
                confirmButtonColor: '#059669',
                backdrop: `rgba(0,0,0,0.4)`,
                padding: '2rem',
                customClass: {
                    popup: 'rounded-2xl'
                }
            }).then(() => {
                // Update UI Nút bấm
                btn.innerHTML = '<i class="fas fa-check-double"></i> Đã hoàn thành';
                btn.style.background = '#059669';
                btn.style.transform = 'none';
                btn.style.boxShadow = 'none';
                
                // [MỚI] Cập nhật số liệu trên Header (nếu có) ngay lập tức
                const headerPoints = document.querySelector('.user-points-display'); // Class ví dụ trên header
                const headerWater = document.querySelector('.user-water-display');
                if(headerPoints) headerPoints.innerText = data.points;
                if(headerWater) headerWater.innerText = data.water;
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