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

// --- [GEN Z UPDATE] Danh sách câu khen "mặn mòi" ---
const genZPraises = [
    "Đỉnh nóc, kịch trần! 🏠",
    "Slay quá fen ơi! 💅",
    "10 điểm về chỗ! 💯",
    "Kiến thức này đã được tiếp thu! 🧠",
    "Out trình server! 🚀",
    "Gét gô! Quá dữ luôn! 🔥",
    "Nghệ cả củ! 🎨"
];

// Hàm lấy câu chúc ngẫu nhiên
function getRandomPraise() {
    return genZPraises[Math.floor(Math.random() * genZPraises.length)];
}

// Hàm bắn pháo giấy ăn mừng
function triggerConfetti() {
    if (typeof confetti === 'function') {
        var duration = 3 * 1000;
        var animationEnd = Date.now() + duration;
        var defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 9999 };

        var randomInRange = function(min, max) {
            return Math.random() * (max - min) + min;
        };

        var interval = setInterval(function() {
            var timeLeft = animationEnd - Date.now();

            if (timeLeft <= 0) {
                return clearInterval(interval);
            }

            var particleCount = 50 * (timeLeft / duration);
            // Bắn từ 2 bên màn hình vào
            confetti(Object.assign({}, defaults, { particleCount, origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 } }));
            confetti(Object.assign({}, defaults, { particleCount, origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 } }));
        }, 250);
    }
}

// [NÂNG CẤP] Hoàn thành bài học
async function completeLesson(lessonId) {
    const btn = document.getElementById('btnComplete');
    const originalText = btn.innerHTML;
    
    // Hiệu ứng loading "chill"
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang tải dữ liệu...';
    btn.disabled = true;
    btn.style.opacity = '0.8';

    try {
        const res = await fetch(`/lesson/${lessonId}/complete`, { method: 'POST' });
        const data = await res.json();

        if (res.ok) {
            // 1. Kích hoạt pháo giấy ngay lập tức
            triggerConfetti();

            // 2. Chuẩn bị nội dung Popup
            const praise = getRandomPraise();
            
            // Xử lý thông báo Level Up (nếu có)
            let levelUpHtml = '';
            if (data.isLevelUp) {
                levelUpHtml = `
                    <div class="level-up-badge animate-bounce">
                        <span style="font-size: 3rem;">🆙</span>
                        <div style="font-weight: 900; font-size: 1.5rem; color: #fff; text-shadow: 2px 2px 0 #d97706;">
                            LÊN CẤP ${data.level || 'MỚI'}!
                        </div>
                        <div style="font-size: 0.9rem; color: #fff;">Đẳng cấp đã được khẳng định!</div>
                    </div>
                `;
            }

            // 3. Hiển thị SweetAlert xịn sò
            Swal.fire({
                title: `<div class="genz-title">${praise}</div>`,
                html: `
                    <div style="margin-bottom: 20px;">
                        ${levelUpHtml}
                        <div style="font-size: 1.1rem; color: #4b5563; margin-top: 10px;">
                            Bạn vừa "bỏ túi" được mớ quà nè:
                        </div>
                    </div>
                    
                    <div class="reward-container">
                        <div class="reward-card card-points">
                            <div class="reward-icon">🪙</div>
                            <div class="reward-value">+${data.points || 0}</div>
                            <div class="reward-label">Points</div>
                        </div>

                        <div class="reward-card card-xp">
                            <div class="reward-icon">✨</div>
                            <div class="reward-value">+${data.xp || 0}</div>
                            <div class="reward-label">XP</div>
                        </div>

                        <div class="reward-card card-water">
                            <div class="reward-icon">💧</div>
                            <div class="reward-value">+${data.gold || 0}</div> 
                            <div class="reward-label">Vàng</div>
                        </div>
                    </div>
                    
                    <style>
                        .genz-title { 
                            font-family: 'Quicksand', sans-serif; 
                            font-weight: 800; 
                            font-size: 2rem; 
                            background: linear-gradient(to right, #10b981, #3b82f6); 
                            -webkit-background-clip: text; 
                            -webkit-text-fill-color: transparent;
                        }
                        .level-up-badge {
                            background: linear-gradient(135deg, #f59e0b, #d97706);
                            padding: 15px;
                            border-radius: 15px;
                            margin: 10px auto;
                            box-shadow: 0 10px 20px rgba(245, 158, 11, 0.4);
                            transform: scale(1);
                            animation: pulse 1s infinite;
                        }
                        .reward-container {
                            display: flex; justify-content: center; gap: 15px; flex-wrap: wrap;
                        }
                        .reward-card {
                            width: 90px; padding: 15px 10px; border-radius: 16px;
                            text-align: center; position: relative; overflow: hidden;
                            transition: transform 0.3s;
                            box-shadow: 0 8px 15px rgba(0,0,0,0.05);
                        }
                        .reward-card:hover { transform: translateY(-5px); }
                        
                        .card-points { background: #ecfdf5; border: 2px solid #10b981; color: #047857; }
                        .card-xp { background: #fff7ed; border: 2px solid #f97316; color: #c2410c; }
                        .card-water { background: #eff6ff; border: 2px solid #3b82f6; color: #1d4ed8; }

                        .reward-icon { font-size: 2rem; margin-bottom: 5px; }
                        .reward-value { font-weight: 900; font-size: 1.3rem; }
                        .reward-label { font-size: 0.8rem; font-weight: 700; text-transform: uppercase; opacity: 0.8; }

                        @keyframes pulse { 0% { transform: scale(1); } 50% { transform: scale(1.05); } 100% { transform: scale(1); } }
                    </style>
                `,
                icon: null,
                showConfirmButton: true,
                confirmButtonText: 'Tiếp tục cày cuốc! 🚀',
                confirmButtonColor: '#10b981',
                background: '#fff',
                backdrop: `
                    rgba(0, 0, 50, 0.6)
                    url("https://melmagazine.com/uploads/2021/01/Gigachad.jpg")
                    center center / cover
                    no-repeat
                `,
                customClass: {
                    popup: 'rounded-3xl shadow-2xl'
                }
            }).then(() => {
                // Update UI Nút bấm sau khi đóng popup
                btn.innerHTML = '<i class="fas fa-check-double"></i> Xong phim!';
                btn.style.background = '#10b981';
                btn.style.opacity = '1';
                btn.style.transform = 'none';
                btn.style.boxShadow = 'none';
                
                // Cập nhật số liệu trên Header (nếu có)
                const headerPoints = document.querySelector('.user-points-display');
                if(headerPoints && data.points) {
                    // Hiệu ứng nhảy số đơn giản
                    let current = parseInt(headerPoints.innerText) || 0;
                    headerPoints.innerText = current + data.points;
                    headerPoints.style.color = '#10b981';
                    setTimeout(() => headerPoints.style.color = '', 1000);
                }
            });
        } else {
            Swal.fire({
                title: 'Úi chà!',
                text: data.error || 'Có lỗi gì đó sai sai rồi...',
                icon: 'warning',
                confirmButtonText: 'Để thử lại'
            });
            btn.innerHTML = originalText;
            btn.disabled = false;
            btn.style.opacity = '1';
        }
    } catch (e) {
        console.error(e);
        Swal.fire('Lỗi mạng', 'Không kết nối được server, kiểm tra wifi đi fen!', 'error');
        btn.innerHTML = originalText;
        btn.disabled = false;
        btn.style.opacity = '1';
    }
}