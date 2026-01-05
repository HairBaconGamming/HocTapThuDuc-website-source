document.addEventListener('DOMContentLoaded', () => {
    initLessonContent();
});

function initLessonContent() {
    const contentArea = document.getElementById('lessonContentArea');
    if (!contentArea) return;

    // 1. Lấy dữ liệu RAW từ server
    const rawContent = contentArea.getAttribute('data-content');
    
    // 2. Parse JSON an toàn
    let blocks = [];
    try {
        if (rawContent && (rawContent.startsWith('[') || rawContent.startsWith('{'))) {
            blocks = JSON.parse(rawContent);
            if (!Array.isArray(blocks)) blocks = [blocks]; 
        } else {
            // Fallback: Markdown cũ
            blocks = [{ type: 'text', data: { text: rawContent } }];
        }
    } catch (e) {
        console.error("Lỗi parse nội dung:", e);
        contentArea.innerHTML = '<div class="alert alert-danger">Lỗi định dạng nội dung.</div>';
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
        contentArea.innerHTML = '<p class="text-muted text-center" style="padding: 40px;">Bài học chưa có nội dung.</p>';
    }

    // 5. Render Math (KaTeX)
    if (window.renderMathInElement) {
        renderMathInElement(contentArea, {
            delimiters: [
                {left: '$$', right: '$$', display: true},
                {left: '$', right: '$', display: false},
                {left: '\\(', right: '\\)', display: false},
                {left: '\\[', right: '\\]', display: true}
            ],
            throwOnError: false
        });
    }

    if (window.Prism) {
        Prism.highlightAllUnder(contentArea);
    }
}

/* --- BLOCK RENDERER ENGINE --- */

function renderSingleBlock(block, idx) {
    const wrapper = document.createElement('div');
    wrapper.className = `content-block-render block-type-${block.type}`;
    wrapper.dataset.id = idx;

    switch (block.type) {
        case 'text':
            let htmlContent = marked.parse(block.data.text || '');
            if (window.DOMPurify) htmlContent = DOMPurify.sanitize(htmlContent);
            wrapper.innerHTML = htmlContent;
            break;

        case 'image':
            if (block.data.url) {
                const img = document.createElement('img');
                img.src = block.data.url;
                img.alt = 'Lesson Image';
                img.loading = 'lazy';
                img.className = 'img-fluid rounded shadow-sm';
                wrapper.appendChild(img);
                
                if(block.data.caption) {
                    const cap = document.createElement('div');
                    cap.className = 'text-center text-muted small fst-italic mt-2';
                    cap.innerText = block.data.caption;
                    wrapper.appendChild(cap);
                }
            }
            break;

        case 'video':
            if (block.data.url) {
                const videoWrapper = document.createElement('div');
                videoWrapper.className = 'block-video ratio ratio-16x9 rounded overflow-hidden shadow-sm';
                
                const videoInfo = getEmbedUrl(block.data.url, block.data.autoplay);
                
                if (videoInfo && videoInfo.url) {
                    if (videoInfo.type === 'iframe') {
                        // [FIX] Thêm referrerpolicy="origin" để sửa lỗi 153
                        videoWrapper.innerHTML = `<iframe src="${videoInfo.url}" title="Video bài học" allowfullscreen allow="autoplay; encrypted-media; picture-in-picture" referrerpolicy="origin"></iframe>`;
                    } else {
                        // Render Video HTML5
                        videoWrapper.innerHTML = `<video src="${videoInfo.url}" controls ${block.data.autoplay ? 'autoplay muted' : ''} style="width:100%; height:100%; object-fit:contain; background:#000;"></video>`;
                    }
                } else {
                    videoWrapper.innerHTML = `<div class="d-flex align-items-center justify-content-center bg-light text-muted h-100">Video không khả dụng</div>`;
                }
                wrapper.appendChild(videoWrapper);

                if (block.data.caption) {
                    const cap = document.createElement('div');
                    cap.className = 'video-caption text-center text-muted mt-2';
                    cap.innerText = block.data.caption;
                    wrapper.appendChild(cap);
                }
            }
            break;

        case 'resource':
            // Map icon đẹp
            const iconMap = {
                drive: { icon: 'fab fa-google-drive', color: '#16a34a', bg: '#dcfce7' },
                pdf:   { icon: 'fas fa-file-pdf', color: '#dc2626', bg: '#fee2e2' },
                doc:   { icon: 'fas fa-file-word', color: '#2563eb', bg: '#dbeafe' },
                zip:   { icon: 'fas fa-file-archive', color: '#d97706', bg: '#fef3c7' },
                link:  { icon: 'fas fa-link', color: '#4b5563', bg: '#f3f4f6' }
            };
            const theme = iconMap[block.data.iconType] || iconMap.link;
            
            wrapper.innerHTML = `
                <a href="${block.data.url}" target="_blank" class="text-decoration-none resource-card-link">
                    <div class="card border-0 shadow-sm hover-shadow transition-all" style="background:${theme.bg}; border-left: 4px solid ${theme.color} !important;">
                        <div class="card-body d-flex align-items-center p-3">
                            <div class="rounded-circle d-flex align-items-center justify-content-center me-3" 
                                 style="width:48px; height:48px; background:rgba(255,255,255,0.6); color:${theme.color}; font-size:1.5rem;">
                                <i class="${theme.icon}"></i>
                            </div>
                            <div class="flex-grow-1">
                                <h6 class="mb-0 fw-bold text-dark">${block.data.title || 'Tài liệu tham khảo'}</h6>
                                <small class="text-muted text-truncate d-block" style="max-width: 250px;">
                                    ${block.data.url}
                                </small>
                            </div>
                            <div class="ms-3 text-secondary">
                                <i class="fas fa-download"></i>
                            </div>
                        </div>
                    </div>
                </a>
            `;
            break;

        case 'code':
            wrapper.className += ' block-code';
            const lang = block.data.language || 'javascript';
            const codeContent = block.data.code || '';
            
            // Escape HTML để tránh lỗi hiển thị khi code chứa thẻ <script> hoặc <div>
            const escapedCode = codeContent
                .replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;")
                .replace(/"/g, "&quot;")
                .replace(/'/g, "&#039;");

            wrapper.innerHTML = `
                <div class="code-viewer-container" style="position: relative; background: #2d2d2d; border-radius: 6px; overflow: hidden; margin-bottom: 1rem;">
                    <div class="code-header" style="background: #404040; color: #ccc; padding: 5px 15px; font-size: 0.8rem; display: flex; justify-content: space-between; align-items: center;">
                        <span style="text-transform: uppercase; font-weight: bold;">${lang}</span>
                        <button class="btn-copy-code" onclick="copyCode(this)" style="background: none; border: none; color: #fff; cursor: pointer; font-size: 0.8rem;">
                            <i class="far fa-copy"></i> Copy
                        </button>
                    </div>
                    <pre style="margin: 0; padding: 15px; overflow-x: auto;"><code class="language-${lang}">${escapedCode}</code></pre>
                </div>
            `;
            break;

        case 'callout':
            wrapper.className += ' block-callout alert alert-info border-0 shadow-sm';
            const calloutText = marked.parse(block.data.text || '');
            wrapper.innerHTML = `<div class="d-flex"><i class="fas fa-info-circle me-3 mt-1 fa-lg text-primary"></i> <div>${calloutText}</div></div>`;
            break;

        case 'quiz':
        case 'question':
            if (block.data.questions && block.data.questions.length > 0) {
                wrapper.appendChild(renderQuizBlock(block.data, idx));
            }
            break;

        default:
            console.warn('Unknown block type:', block.type);
            break;
    }

    return wrapper;
}

function copyCode(btn) {
    // Tìm thẻ code trong cùng container
    const codeBlock = btn.closest('.code-viewer-container').querySelector('code');
    const text = codeBlock.innerText;

    navigator.clipboard.writeText(text).then(() => {
        const originalHTML = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-check"></i> Copied!';
        btn.style.color = '#4ade80';
        
        setTimeout(() => {
            btn.innerHTML = originalHTML;
            btn.style.color = '#fff';
        }, 2000);
    }).catch(err => {
        console.error('Không copy được: ', err);
    });
}

// --- VIDEO HELPERS (Fix Bug 153 & Hỗ trợ Google Drive) ---
function getEmbedUrl(url, autoplay) {
    if (!url) return null;
    let embedUrl = null;

    // 1. YouTube (Hỗ trợ cả Shorts, Live, và các dạng link dị)
    const ytMatch = url.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=|shorts\/)|youtu\.be\/)([^"&?\/\s]{11})/);
    if (ytMatch && ytMatch[1]) {
        embedUrl = `https://www.youtube.com/embed/${ytMatch[1]}`;
        if (autoplay) embedUrl += "&autoplay=1&mute=1";
        return { type: 'iframe', url: embedUrl };
    }

    // 2. Vimeo
    const vimeoMatch = url.match(/(?:vimeo\.com\/|player\.vimeo\.com\/video\/)(\d+)/);
    if (vimeoMatch && vimeoMatch[1]) {
        embedUrl = `https://player.vimeo.com/video/${vimeoMatch[1]}`;
        if (autoplay) embedUrl += "?autoplay=1&muted=1";
        return { type: 'iframe', url: embedUrl };
    }

    // 3. Google Drive (Fix lỗi 153: Tự chuyển link /view -> /preview)
    const driveMatch = url.match(/drive\.google\.com\/file\/d\/([^\/]+)\//);
    if (driveMatch && driveMatch[1]) {
        embedUrl = `https://drive.google.com/file/d/${driveMatch[1]}/preview`;
        return { type: 'iframe', url: embedUrl };
    }

    // 4. File Video Trực tiếp (.mp4, .webm...)
    return { type: 'video', url: url };
}

/* --- QUIZ RENDERER --- */

function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

function renderQuizBlock(data, blockIdx) {
    const settings = data.settings || { randomizeQuestions: false, randomizeOptions: false, passingScore: 50, showFeedback: 'submit' };

    const container = document.createElement('div');
    container.className = 'quiz-wrapper card border-0 shadow-sm mb-4';
    
    container.innerHTML = `
        <div class="card-header bg-white border-bottom-0 pt-3">
            <div class="d-flex justify-content-between align-items-center">
                <span class="fw-bold text-primary"><i class="fas fa-tasks me-2"></i> Bài tập thực hành</span>
                <span class="badge bg-light text-dark border">Đạt: ${settings.passingScore}%</span>
            </div>
        </div>
        <div class="card-body"></div>
    `;
    const body = container.querySelector('.card-body');

    let questionsToRender = JSON.parse(JSON.stringify(data.questions || []));
    if (settings.randomizeQuestions) shuffleArray(questionsToRender);

    questionsToRender.forEach((q, qIdx) => {
        const qDiv = document.createElement('div');
        qDiv.className = 'question-item mb-4 pb-3 border-bottom';
        if(qIdx === questionsToRender.length - 1) qDiv.classList.remove('border-bottom');
        
        qDiv.dataset.type = q.type;

        // Content
        let qContent = '';
        if (q.type === 'fill') {
            const parts = (q.content || '').split(/(\[.*?\])/);
            qContent = parts.map(part => {
                if (part.startsWith('[') && part.endsWith(']')) {
                    const answer = part.slice(1, -1);
                    return `<input type="text" class="form-control d-inline-block w-auto mx-1 text-center fw-bold text-primary fill-input" data-answer="${answer}" style="min-width: 80px;" autocomplete="off">`;
                }
                return `<span>${part}</span>`;
            }).join('');
            qContent = `<div class="mb-3 lh-lg">${qIdx + 1}. ${qContent}</div>`;
        } else {
            qContent = `<div class="fw-bold mb-3">Câu ${qIdx + 1}: ${q.question}</div>`;
        }

        // Options
        let optionsHTML = '';
        if (q.type === 'choice') {
            const inputType = q.isMulti ? 'checkbox' : 'radio';
            const name = `quiz_${blockIdx}_${qIdx}`;
            
            let optionsWithIndex = (q.options || []).map((opt, idx) => ({ text: opt, originalIndex: idx }));
            if (settings.randomizeOptions) optionsWithIndex = shuffleArray(optionsWithIndex);

            optionsHTML = `<div class="d-flex flex-column gap-2">`;
            optionsWithIndex.forEach(optObj => {
                const isCorrect = (q.correct || []).includes(optObj.originalIndex);
                optionsHTML += `
                    <label class="quiz-option p-2 border rounded cursor-pointer hover-bg-light" data-correct="${isCorrect}">
                        <div class="form-check">
                            <input class="form-check-input" type="${inputType}" name="${name}" value="${optObj.originalIndex}">
                            <span class="form-check-label w-100">${optObj.text}</span>
                        </div>
                    </label>
                `;
            });
            optionsHTML += `</div>`;
        } else if (q.type === 'essay') {
            // [FIX] Thêm div chứa đáp án mẫu (ẩn mặc định)
            optionsHTML = `
                <textarea class="form-control" rows="3" placeholder="Nhập câu trả lời..."></textarea>
                <div class="model-answer alert alert-success mt-2" style="display:none;">
                    <i class="fas fa-check-circle me-1"></i> <strong>Đáp án mẫu:</strong><br>
                    ${q.modelAnswer || '(Không có đáp án mẫu)'}
                </div>
            `;
        }

        const explainHTML = q.explanation ? `<div class="explanation-box alert alert-warning mt-2" style="display:none;"><i class="fas fa-lightbulb me-2"></i> ${q.explanation}</div>` : '';

        qDiv.innerHTML = `${qContent} ${optionsHTML} ${explainHTML}`;

        // Instant Check Logic (Chỉ cho trắc nghiệm)
        if (settings.showFeedback === 'instant' && q.type === 'choice') {
            const inputs = qDiv.querySelectorAll('input');
            inputs.forEach(input => {
                input.addEventListener('change', () => {
                    if (!q.isMulti) inputs.forEach(i => i.disabled = true);
                    const label = input.closest('label');
                    const isCorrect = label.dataset.correct === 'true';
                    if (isCorrect) {
                        label.classList.add('bg-success-subtle', 'border-success');
                        label.querySelector('.form-check-input').classList.add('is-valid');
                    } else {
                        label.classList.add('bg-danger-subtle', 'border-danger');
                        label.querySelector('.form-check-input').classList.add('is-invalid');
                        qDiv.querySelectorAll('label[data-correct="true"]').forEach(l => l.classList.add('bg-success-subtle', 'border-success'));
                    }
                    const expBox = qDiv.querySelector('.explanation-box');
                    if (expBox) expBox.style.display = 'block';
                });
            });
        }

        body.appendChild(qDiv);
    });

    if (settings.showFeedback !== 'instant') {
        const checkBtn = document.createElement('button');
        checkBtn.className = 'btn btn-primary w-100 mt-3';
        checkBtn.innerHTML = '<i class="fas fa-check"></i> Nộp bài & Chấm điểm';
        checkBtn.onclick = () => checkQuizResult(container, settings);
        body.appendChild(checkBtn);
    }

    return container;
}

function checkQuizResult(container, settings) {
    const questions = container.querySelectorAll('.question-item');
    let correctCount = 0;
    let total = 0;

    questions.forEach(qDiv => {
        const type = qDiv.dataset.type;
        let isCorrect = false;

        // 1. TRẮC NGHIỆM
        if (type === 'choice') {
            total++;
            const inputs = qDiv.querySelectorAll('input');
            const labels = qDiv.querySelectorAll('label');
            
            labels.forEach(l => {
                l.classList.remove('bg-success-subtle', 'border-success', 'bg-danger-subtle', 'border-danger');
                l.querySelector('input').classList.remove('is-valid', 'is-invalid');
            });

            let userCorrect = true;
            let hasSelection = false;

            inputs.forEach(inp => {
                const parent = inp.closest('label');
                const shouldBeChecked = parent.dataset.correct === 'true';

                if (inp.checked) {
                    hasSelection = true;
                    if (shouldBeChecked) {
                        parent.classList.add('bg-success-subtle', 'border-success');
                    } else {
                        parent.classList.add('bg-danger-subtle', 'border-danger');
                        userCorrect = false;
                    }
                } else {
                    if (shouldBeChecked) {
                        parent.style.border = "1px dashed #198754"; // Gợi ý đáp án đúng
                        userCorrect = false;
                    }
                }
            });

            if (hasSelection && userCorrect) isCorrect = true;

        // 2. ĐIỀN TỪ (Cập nhật hiển thị đáp án)
        } else if (type === 'fill') {
            total++;
            const inputs = qDiv.querySelectorAll('.fill-input');
            let allFilledCorrect = true;

            inputs.forEach(inp => {
                const userVal = inp.value.trim().toLowerCase();
                const correctVal = inp.dataset.answer.trim().toLowerCase();

                // Xóa đáp án cũ nếu có (để tránh bị duplicate khi bấm Nộp nhiều lần)
                const nextEl = inp.nextElementSibling;
                if(nextEl && nextEl.classList.contains('correct-ans-display')) {
                    nextEl.remove();
                }

                if (userVal === correctVal) {
                    inp.classList.add('is-valid');
                    inp.classList.remove('is-invalid');
                } else {
                    inp.classList.add('is-invalid');
                    inp.classList.remove('is-valid');
                    allFilledCorrect = false;
                    
                    // [FIX] Hiển thị đáp án đúng ngay bên cạnh
                    const ansSpan = document.createElement('span');
                    ansSpan.className = 'correct-ans-display ms-1 fw-bold text-success';
                    ansSpan.innerText = `(${inp.dataset.answer})`;
                    inp.after(ansSpan);
                }
            });
            if (allFilledCorrect) isCorrect = true;
            
        // 3. TỰ LUẬN (Cập nhật hiển thị đáp án mẫu)
        } else if (type === 'essay') {
            // Tự luận không tính điểm tự động, nhưng hiện đáp án mẫu để đối chiếu
            const modelAnsBox = qDiv.querySelector('.model-answer');
            if (modelAnsBox) {
                modelAnsBox.style.display = 'block';
                modelAnsBox.classList.add('animate__animated', 'animate__fadeIn');
            }
        }

        if (isCorrect) correctCount++;

        // Hiển thị giải thích (chung cho mọi loại)
        const exp = qDiv.querySelector('.explanation-box');
        if (settings.showFeedback === 'submit') {
            if (exp) exp.style.display = 'block';
        }
    });

    const percentage = total > 0 ? Math.round((correctCount / total) * 100) : 0;
    const isPassed = percentage >= (settings.passingScore || 50);

    if (typeof Swal !== 'undefined') {
        Swal.fire({
            title: isPassed ? 'Đạt Yêu Cầu! 🎉' : 'Cần cố gắng hơn 😞',
            html: `Kết quả: <b>${correctCount}/${total}</b> câu đúng (${percentage}%).<br>Điểm đạt: ${settings.passingScore}%`,
            icon: isPassed ? 'success' : 'error'
        });
    } else {
        alert(`Kết quả: ${correctCount}/${total} (${percentage}%)`);
    }
}

// [GEN Z UPDATE] Danh sách câu khen "mặn mòi"
const genZPraises = [
    "Đỉnh nóc, kịch trần! 🏠",
    "Slay quá fen ơi! 💅",
    "10 điểm về chỗ! 💯",
    "Kiến thức này đã được tiếp thu! 🧠",
    "Out trình server! 🚀",
    "Gét gô! Quá dữ luôn! 🔥",
    "Nghệ cả củ! 🎨"
];

function getRandomPraise() {
    return genZPraises[Math.floor(Math.random() * genZPraises.length)];
}

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
            confetti(Object.assign({}, defaults, { particleCount, origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 } }));
            confetti(Object.assign({}, defaults, { particleCount, origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 } }));
        }, 250);
    }
}

// [NÂNG CẤP] Hoàn thành bài học
async function completeLesson(lessonId) {
    const btn = document.getElementById('btnComplete');
    const originalText = btn.innerHTML;
    
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang "loát"...';
    btn.disabled = true;
    btn.style.opacity = '0.8';

    try {
        const res = await fetch(`/lesson/${lessonId}/complete`, { method: 'POST' });
        const data = await res.json();

        if (res.ok) {
            triggerConfetti();

            const praise = getRandomPraise();
            
            let levelUpHtml = '';
            if (data.isLevelUp) {
                levelUpHtml = `
                    <div class="level-up-badge animate-bounce" style="background: linear-gradient(135deg, #f59e0b, #d97706); padding: 15px; border-radius: 15px; margin: 10px auto; box-shadow: 0 10px 20px rgba(245, 158, 11, 0.4);">
                        <span style="font-size: 3rem;">🆙</span>
                        <div style="font-weight: 900; font-size: 1.5rem; color: #fff; text-shadow: 2px 2px 0 #d97706;">
                            LÊN CẤP ${data.level || 'MỚI'}!
                        </div>
                        <div style="font-size: 0.9rem; color: #fff;">${data.levelName || 'Đẳng cấp mới'}</div>
                    </div>
                `;
            }

            Swal.fire({
                title: `<div style="font-weight: 800; font-size: 2rem; background: linear-gradient(to right, #10b981, #3b82f6); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">${praise}</div>`,
                html: `
                    <div style="margin-bottom: 20px;">
                        ${levelUpHtml}
                        <div style="font-size: 1.1rem; color: #4b5563; margin-top: 10px;">Thu hoạch được nè:</div>
                    </div>
                    
                    <div style="display: flex; justify-content: center; gap: 10px; flex-wrap: wrap;">
                        <div style="background: #ecfdf5; border: 2px solid #10b981; color: #047857; width: 80px; padding: 10px 5px; border-radius: 16px;">
                            <div style="font-size: 1.8rem;">🪙</div>
                            <div style="font-weight: 900; font-size: 1.1rem;">+${data.points}</div>
                            <div style="font-size: 0.7rem; text-transform: uppercase;">Điểm</div>
                        </div>
                        <div style="background: #fff7ed; border: 2px solid #f97316; color: #c2410c; width: 80px; padding: 10px 5px; border-radius: 16px;">
                            <div style="font-size: 1.8rem;">✨</div>
                            <div style="font-weight: 900; font-size: 1.1rem;">+${data.xp}</div>
                            <div style="font-size: 0.7rem; text-transform: uppercase;">XP</div>
                        </div>
                        <div style="background: #eff6ff; border: 2px solid #3b82f6; color: #1d4ed8; width: 80px; padding: 10px 5px; border-radius: 16px;">
                            <div style="font-size: 1.8rem;">💧</div>
                            <div style="font-weight: 900; font-size: 1.1rem;">+${data.water}</div> 
                            <div style="font-size: 0.7rem; text-transform: uppercase;">Nước</div>
                        </div>
                        <div style="background: #fefce8; border: 2px solid #eab308; color: #854d0e; width: 80px; padding: 10px 5px; border-radius: 16px;">
                            <div style="font-size: 1.8rem;">💰</div>
                            <div style="font-weight: 900; font-size: 1.1rem;">+${data.gold}</div> 
                            <div style="font-size: 0.7rem; text-transform: uppercase;">Vàng</div>
                        </div>
                    </div>
                `,
                showConfirmButton: true,
                confirmButtonText: 'Tiếp tục cày! 🚀',
                confirmButtonColor: '#10b981',
                width: '450px'
            }).then(() => {
                btn.innerHTML = '<i class="fas fa-check-double"></i> Đã học xong';
                btn.className = "btn btn-success w-100";
                
                const headerPoints = document.querySelector('.user-points-display');
                if(headerPoints && data.points) {
                    let current = parseInt(headerPoints.innerText) || 0;
                    headerPoints.innerText = current + data.points;
                }
            });
        } else {
            Swal.fire('Hả?', data.error || 'Lỗi gì đó rồi...', 'warning');
            btn.innerHTML = originalText;
            btn.disabled = false;
            btn.style.opacity = '1';
        }
    } catch (e) {
        console.error(e);
        Swal.fire('Toang', 'Mạng lag quá fen ơi!', 'error');
        btn.innerHTML = originalText;
        btn.disabled = false;
        btn.style.opacity = '1';
    }
}