/**
 * LESSON DETAIL ENGINE - V3 POWERFUL
 * Tính năng: Render Block, TOC tự động, Anti-AFK, Quiz Gamification
 */

document.addEventListener('DOMContentLoaded', () => {
    initLessonContent();
    
    // Chỉ chạy bộ đếm giờ nếu không phải chế độ xem trước (nếu cần)
    StudyManager.init(); 
});

function initLessonContent() {
    const contentArea = document.getElementById('lessonContentArea');
    if (!contentArea) return;

    // 1. Lấy dữ liệu RAW từ attribute data-content
    const rawContent = contentArea.getAttribute('data-content');
    
    // 2. Parse JSON an toàn
    let blocks = [];
    try {
        if (rawContent && (rawContent.startsWith('[') || rawContent.startsWith('{'))) {
            blocks = JSON.parse(rawContent);
            if (!Array.isArray(blocks)) blocks = [blocks]; 
        } else {
            // Fallback cho bài học cũ (chỉ có text)
            blocks = [{ type: 'text', data: { text: rawContent } }]; 
        }
    } catch (e) {
        console.error("Lỗi parse nội dung:", e);
        contentArea.innerHTML = '<div class="alert alert-danger">Lỗi định dạng nội dung JSON.</div>';
        return;
    }

    // 3. Xóa loading spinner
    contentArea.innerHTML = '';

    // 4. Render từng Block
    if (Array.isArray(blocks) && blocks.length > 0) {
        blocks.forEach((block, index) => {
            const blockHTML = renderSingleBlock(block, index);
            if(blockHTML) contentArea.appendChild(blockHTML);
        });
    } else {
        contentArea.innerHTML = `
            <div class="text-center py-5 text-muted">
                <i class="fas fa-scroll fa-3x mb-3 text-secondary opacity-50"></i>
                <p>Bài học này chưa có nội dung.</p>
            </div>`;
    }

    // 5. Các xử lý sau khi render xong (Post-Render)
    
    // a. Render Công thức toán (KaTeX)
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

    // b. Tô màu code (Prism)
    if (window.Prism) {
        Prism.highlightAllUnder(contentArea);
    }

    // c. Tạo Mục Lục Tự Động (TOC) bên sidebar phải
    generateTableOfContents();
}

/* --- BLOCK RENDERER ENGINE --- */

function renderSingleBlock(block, idx) {
    const wrapper = document.createElement('div');
    wrapper.className = `content-block-render block-type-${block.type}`;
    wrapper.dataset.id = idx;

    switch (block.type) {
        case 'header': 
            const level = block.data.level || 2;
            const hTag = document.createElement(`h${level}`);
            hTag.innerHTML = block.data.text;
            hTag.id = `heading-${idx}`; // ID để TOC link tới
            wrapper.appendChild(hTag);
            break;

        case 'text':
            let htmlContent = marked.parse(block.data.text || '');
            if (window.DOMPurify) htmlContent = DOMPurify.sanitize(htmlContent);
            
            // Tự động thêm ID cho các thẻ H1, H2, H3 bên trong Markdown để TOC bắt được
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = htmlContent;
            tempDiv.querySelectorAll('h1, h2, h3').forEach((h, i) => {
                if(!h.id) h.id = `md-heading-${idx}-${i}`;
            });
            
            wrapper.innerHTML = tempDiv.innerHTML;
            break;

        case 'image':
            if (block.data.url) {
                wrapper.className += ' text-center my-4';
                const img = document.createElement('img');
                img.src = block.data.url;
                img.alt = block.data.caption || 'Hình ảnh bài học';
                img.loading = 'lazy';
                img.className = 'img-fluid shadow-sm border rounded';
                
                // Click để xem ảnh gốc (Simple Lightbox)
                img.style.cursor = 'zoom-in';
                img.onclick = () => window.open(img.src, '_blank');

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
                videoWrapper.className = 'ratio ratio-16x9 rounded overflow-hidden shadow-sm bg-dark my-4';
                
                const videoInfo = getEmbedUrl(block.data.url, block.data.autoplay);
                
                if (videoInfo && videoInfo.url) {
                    if (videoInfo.type === 'iframe') {
                        videoWrapper.innerHTML = `<iframe src="${videoInfo.url}" title="Video bài học" allowfullscreen allow="autoplay; encrypted-media; picture-in-picture" referrerpolicy="origin"></iframe>`;
                    } else {
                        videoWrapper.innerHTML = `<video src="${videoInfo.url}" controls ${block.data.autoplay ? 'autoplay muted' : ''} style="width:100%; height:100%;"></video>`;
                    }
                }
                wrapper.appendChild(videoWrapper);
            }
            break;

        case 'resource':
            const iconMap = {
                drive: { icon: 'fab fa-google-drive', color: '#16a34a', bg: '#dcfce7' },
                pdf:   { icon: 'fas fa-file-pdf', color: '#dc2626', bg: '#fee2e2' },
                doc:   { icon: 'fas fa-file-word', color: '#2563eb', bg: '#dbeafe' },
                zip:   { icon: 'fas fa-file-archive', color: '#d97706', bg: '#fef3c7' },
                link:  { icon: 'fas fa-link', color: '#4b5563', bg: '#f3f4f6' }
            };
            const theme = iconMap[block.data.iconType] || iconMap.link;
            
            wrapper.innerHTML = `
                <a href="${block.data.url}" target="_blank" class="text-decoration-none resource-card-link d-block my-3">
                    <div class="card border-0 shadow-sm hover-shadow transition-all" style="background:${theme.bg}; border-left: 5px solid ${theme.color} !important; transition: transform 0.2s;">
                        <div class="card-body d-flex align-items-center p-3">
                            <div class="rounded-circle d-flex align-items-center justify-content-center me-3 shadow-sm bg-white" 
                                 style="width:50px; height:50px; color:${theme.color}; font-size:1.5rem;">
                                <i class="${theme.icon}"></i>
                            </div>
                            <div class="flex-grow-1">
                                <h6 class="mb-1 fw-bold text-dark">${block.data.title || 'Tài liệu tham khảo'}</h6>
                                <small class="text-secondary d-block text-truncate" style="max-width: 300px;">
                                    <i class="fas fa-external-link-alt me-1"></i> Bấm để mở
                                </small>
                            </div>
                        </div>
                    </div>
                </a>
            `;
            // Hover effect JS (bổ sung cho CSS)
            wrapper.onmouseenter = () => wrapper.querySelector('.card').style.transform = 'translateY(-3px)';
            wrapper.onmouseleave = () => wrapper.querySelector('.card').style.transform = 'translateY(0)';
            break;

        case 'code':
            wrapper.className += ' block-code my-3';
            const lang = block.data.language || 'javascript';
            // Escape HTML để hiển thị code an toàn
            const codeContent = (block.data.code || '').replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

            wrapper.innerHTML = `
                <div class="code-viewer-container">
                    <div class="code-header">
                        <span style="font-family:monospace; font-weight:bold; color:#a3a3a3;">
                            <i class="fas fa-code me-2"></i>${lang.toUpperCase()}
                        </span>
                        <button class="btn btn-sm btn-dark border-secondary text-light btn-copy-code" onclick="copyCode(this)">
                            <i class="far fa-copy"></i> Copy
                        </button>
                    </div>
                    <pre class="line-numbers"><code class="language-${lang}">${codeContent}</code></pre>
                </div>
            `;
            break;

        case 'callout':
            const typeMap = {
                info: { class: 'alert-info', icon: 'fa-info-circle' },
                warning: { class: 'alert-warning', icon: 'fa-exclamation-triangle' },
                danger: { class: 'alert-danger', icon: 'fa-bomb' },
                success: { class: 'alert-success', icon: 'fa-check-circle' },
                note: { class: 'alert-secondary', icon: 'fa-sticky-note' }
            };
            const cType = typeMap[block.data.style] || typeMap.info;
            const cText = marked.parse(block.data.text || '');
            
            wrapper.className += ` alert ${cType.class} border-0 shadow-sm d-flex align-items-start my-3`;
            wrapper.innerHTML = `
                <div class="me-3 mt-1"><i class="fas ${cType.icon} fa-lg"></i></div>
                <div class="flex-grow-1">${cText}</div>
            `;
            break;

        case 'quiz':
        case 'question':
            if (block.data.questions && block.data.questions.length > 0) {
                wrapper.appendChild(renderQuizBlock(block.data, idx));
            }
            break;
    }
    return wrapper;
}

// --- TOC GENERATOR (Mục lục tự động) ---
function generateTableOfContents() {
    const tocList = document.getElementById('toc-list');
    const tocListMobile = document.getElementById('toc-list-mobile');
    const contentArea = document.getElementById('lessonContentArea');
    
    if(!tocList || !contentArea) return;

    // Tìm tất cả H1, H2, H3 trong content
    const headers = contentArea.querySelectorAll('h1, h2, h3');
    
    if(headers.length === 0) {
        tocList.innerHTML = '<li class="text-muted small ps-2">Bài học không có mục lớn.</li>';
        return;
    }

    let html = '';
    headers.forEach((header, index) => {
        // Nếu thẻ chưa có ID thì gán ID ngẫu nhiên
        if(!header.id) header.id = `toc-auto-${index}`;
        
        const text = header.innerText;
        const tagName = header.tagName.toLowerCase();
        
        // Thụt đầu dòng cho H3
        const indentClass = tagName === 'h3' ? 'sub' : '';
        
        html += `<li><a href="#${header.id}" class="toc-link ${indentClass}" onclick="scrollToHeader(event, '${header.id}')">${text}</a></li>`;
    });

    tocList.innerHTML = html;
    if(tocListMobile) tocListMobile.innerHTML = html;

    // Scroll Spy: Highlight mục lục khi cuộn trang
    window.addEventListener('scroll', () => {
        let current = '';
        const scrollY = window.scrollY;
        
        headers.forEach(header => {
            const top = header.offsetTop;
            // Nếu cuộn qua header đó (-150px offset cho header sticky)
            if (scrollY >= (top - 150)) {
                current = header.getAttribute('id');
            }
        });

        // Xóa active cũ, thêm active mới
        document.querySelectorAll('.toc-link').forEach(a => {
            a.classList.remove('active');
            if(a.getAttribute('href') === '#' + current) {
                a.classList.add('active');
            }
        });
    });
}

function scrollToHeader(e, id) {
    e.preventDefault();
    const el = document.getElementById(id);
    if(el) {
        // Cuộn mượt và trừ hao chiều cao header sticky
        const headerOffset = 100;
        const elementPosition = el.getBoundingClientRect().top;
        const offsetPosition = elementPosition + window.pageYOffset - headerOffset;
      
        window.scrollTo({ top: offsetPosition, behavior: 'smooth' });
        
        // Đóng mobile TOC nếu đang mở
        const offcanvasEl = document.getElementById('tocOffcanvas');
        if (offcanvasEl) {
            const bsOffcanvas = bootstrap.Offcanvas.getInstance(offcanvasEl);
            if (bsOffcanvas) bsOffcanvas.hide();
        }
    }
}

// --- HELPERS ---

function copyCode(btn) {
    const code = btn.closest('.code-viewer-container').querySelector('code').innerText;
    navigator.clipboard.writeText(code).then(() => {
        const originalHTML = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-check"></i> Đã chép';
        btn.classList.remove('btn-dark');
        btn.classList.add('btn-success');
        
        setTimeout(() => {
            btn.innerHTML = originalHTML;
            btn.classList.remove('btn-success');
            btn.classList.add('btn-dark');
        }, 2000);
    });
}

function getEmbedUrl(url, autoplay) {
    if (!url) return null;
    
    // Youtube
    const ytMatch = url.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=|shorts\/)|youtu\.be\/)([^"&?\/\s]{11})/);
    if (ytMatch && ytMatch[1]) {
        return { type: 'iframe', url: `https://www.youtube.com/embed/${ytMatch[1]}${autoplay ? '?autoplay=1&mute=1' : ''}` };
    }
    
    // Google Drive Preview fix
    const driveMatch = url.match(/drive\.google\.com\/file\/d\/([^\/]+)\//);
    if (driveMatch && driveMatch[1]) {
        return { type: 'iframe', url: `https://drive.google.com/file/d/${driveMatch[1]}/preview` };
    }

    // Direct Video Link
    return { type: 'video', url: url };
}

/* --- QUIZ RENDERER (GAMIFIED) --- */
function renderQuizBlock(data, blockIdx) {
    const settings = data.settings || { passingScore: 50, showFeedback: 'submit' };
    const container = document.createElement('div');
    container.className = 'quiz-wrapper bg-white mb-4';
    
    // Header Quiz
    container.innerHTML = `
        <div class="p-3 border-bottom bg-light d-flex justify-content-between align-items-center">
            <strong class="text-primary"><i class="fas fa-puzzle-piece me-2"></i>Bài tập thực hành</strong>
            <span class="badge bg-secondary">Điểm đạt: ${settings.passingScore}%</span>
        </div>
        <div class="quiz-body p-4"></div>
        <div class="quiz-footer p-3 border-top bg-light text-end">
            <button class="btn btn-primary btn-submit-quiz shadow-sm fw-bold px-4">
                <i class="fas fa-paper-plane me-2"></i> Nộp bài
            </button>
        </div>
    `;
    
    const body = container.querySelector('.quiz-body');
    const btnSubmit = container.querySelector('.btn-submit-quiz');

    // Render questions
    const questions = data.questions || [];
    questions.forEach((q, idx) => {
        const qEl = document.createElement('div');
        qEl.className = 'quiz-question mb-4 pb-3 border-bottom';
        if(idx === questions.length -1) qEl.classList.remove('border-bottom');
        qEl.dataset.type = q.type;
        
        let qContent = `<div class="fw-bold mb-3">Câu ${idx + 1}: ${q.question}</div>`;
        
        // Render Options dựa trên loại câu hỏi
        if (q.type === 'choice') {
            const type = q.isMulti ? 'checkbox' : 'radio';
            const name = `q_${blockIdx}_${idx}`;
            let opts = '';
            (q.options || []).forEach((opt, optIdx) => {
                opts += `
                    <label class="quiz-option d-block p-3 rounded mb-2 cursor-pointer position-relative">
                        <input class="form-check-input me-2" type="${type}" name="${name}" value="${optIdx}" data-correct="${(q.correct || []).includes(optIdx)}">
                        <span>${opt}</span>
                        <i class="fas fa-check text-success position-absolute end-0 me-3 result-icon" style="display:none; top: 12px;"></i>
                        <i class="fas fa-times text-danger position-absolute end-0 me-3 result-icon" style="display:none; top: 12px;"></i>
                    </label>
                `;
            });
            qContent += `<div class="options-list">${opts}</div>`;
        } else if (q.type === 'fill') {
             qContent += `<input type="text" class="form-control fill-input" data-answer="${q.content || ''}" placeholder="Nhập đáp án của bạn..." autocomplete="off">`;
        }

        // Explanation Box (Ẩn mặc định)
        qContent += `
            <div class="explanation mt-3 p-3 rounded bg-info-subtle text-info-emphasis" style="display:none; border-left: 4px solid #0ea5e9;">
                <i class="fas fa-lightbulb me-2"></i> <strong>Giải thích:</strong> ${q.explanation || 'Không có giải thích chi tiết.'}
            </div>
        `;

        qEl.innerHTML = qContent;
        body.appendChild(qEl);
    });

    // Handle Submit Logic
    btnSubmit.onclick = () => {
        let correctCount = 0;
        const qEls = body.querySelectorAll('.quiz-question');
        
        qEls.forEach(qEl => {
            const type = qEl.dataset.type;
            let isCorrect = false;

            if (type === 'choice') {
                const inputs = qEl.querySelectorAll('input');
                let userCorrect = true;
                let hasChecked = false;

                inputs.forEach(inp => {
                    const label = inp.closest('label');
                    const isRight = inp.dataset.correct === 'true';
                    const iconCheck = label.querySelector('.fa-check');
                    const iconTimes = label.querySelector('.fa-times');

                    // Reset style cũ
                    label.classList.remove('bg-success-subtle', 'bg-danger-subtle');
                    iconCheck.style.display = 'none';
                    iconTimes.style.display = 'none';

                    if (inp.checked) {
                        hasChecked = true;
                        if (isRight) {
                            label.classList.add('bg-success-subtle');
                            iconCheck.style.display = 'block';
                        } else {
                            label.classList.add('bg-danger-subtle');
                            iconTimes.style.display = 'block';
                            userCorrect = false;
                        }
                    } else if (isRight) {
                        // Highlight đáp án đúng bị bỏ sót (viền xanh đứt đoạn)
                        label.style.border = "2px dashed #198754";
                        userCorrect = false;
                    }
                    // Disable inputs
                    inp.disabled = true;
                });
                if (hasChecked && userCorrect) isCorrect = true;

            } else if (type === 'fill') {
                const input = qEl.querySelector('.fill-input');
                const userVal = input.value.trim().toLowerCase();
                const correctVal = input.dataset.answer.trim().toLowerCase();
                
                if (userVal === correctVal) {
                    input.classList.add('is-valid');
                    isCorrect = true;
                } else {
                    input.classList.add('is-invalid');
                    // Hiện đáp án đúng
                    const ansDiv = document.createElement('div');
                    ansDiv.className = 'text-success fw-bold mt-1 small';
                    ansDiv.innerText = `Đáp án đúng: ${input.dataset.answer}`;
                    input.after(ansDiv);
                }
                input.disabled = true;
            }

            if(isCorrect) correctCount++;
            
            // Hiện giải thích
            const exp = qEl.querySelector('.explanation');
            if(exp) {
                exp.style.display = 'block';
                exp.classList.add('animate__animated', 'animate__fadeIn');
            }
        });

        // Tính điểm
        const percent = Math.round((correctCount / questions.length) * 100);
        const passed = percent >= settings.passingScore;

        Swal.fire({
            title: passed ? 'Làm tốt lắm! 🌟' : 'Cần cố gắng hơn! 😅',
            html: `Kết quả: <b>${correctCount}/${questions.length}</b> câu đúng (${percent}%)`,
            icon: passed ? 'success' : 'warning',
            confirmButtonText: 'Đóng'
        });

        if(passed) triggerConfetti();
        btnSubmit.disabled = true;
        btnSubmit.innerHTML = `<i class="fas fa-check"></i> Đã chấm điểm`;
        btnSubmit.classList.replace('btn-primary', 'btn-secondary');
    };

    return container;
}

/**
 * STUDY MANAGER (AFK Timer & Rewards System)
 */
const StudyManager = {
    REWARD_INTERVAL: 300, // 5 phút nhận thưởng 1 lần
    AFK_TIMEOUT: 60,      // 60 giây không thao tác => AFK
    MIN_LEARN_TIME: 10,   // Thời gian học tối thiểu để hoàn thành bài
    
    secondsStudied: 0,
    secondsSinceLastInput: 0,
    isAFK: false,
    interval: null,

    init: function() {
        this.createUI();
        this.bindEvents();
        this.start();
        this.lockButton();
    },

    // Tạo Widget Đồng hồ
    createUI: function() {
        const div = document.createElement('div');
        div.id = 'study-floater';
        div.className = 'study-floater active animate__animated animate__fadeInUp';
        div.innerHTML = `
            <div class="timer-ring"></div>
            <div class="fw-bold" id="timer-text">00:00</div>
        `;
        document.body.appendChild(div);
    },

    // Bắt sự kiện người dùng
    bindEvents: function() {
        const reset = () => {
            this.secondsSinceLastInput = 0;
            if(this.isAFK) {
                this.isAFK = false;
                const widget = document.getElementById('study-floater');
                if(widget) {
                    widget.classList.remove('afk');
                    widget.classList.add('active');
                    // Thay đổi màu ring lại thành xanh
                    widget.querySelector('.timer-ring').style.borderTopColor = '#10b981';
                }
            }
        };
        ['mousemove', 'keydown', 'scroll', 'click', 'touchstart'].forEach(e => window.addEventListener(e, reset));
        
        // Khi chuyển tab => Auto AFK
        document.addEventListener('visibilitychange', () => {
            if(document.hidden) this.isAFK = true;
        });
    },

    start: function() {
        this.interval = setInterval(() => {
            // Nếu tab ẩn hoặc AFK
            if(document.hidden || this.isAFK) {
                const widget = document.getElementById('study-floater');
                if(widget && !widget.classList.contains('afk')) {
                    widget.classList.add('afk');
                    widget.classList.remove('active');
                    document.getElementById('timer-text').innerText = "Tạm dừng";
                    widget.querySelector('.timer-ring').style.borderTopColor = '#ef4444';
                }
                return;
            }

            this.secondsSinceLastInput++;
            if(this.secondsSinceLastInput > this.AFK_TIMEOUT) {
                this.isAFK = true;
                return;
            }

            this.secondsStudied++;
            
            // Cập nhật UI Đồng hồ
            const m = Math.floor(this.secondsStudied / 60).toString().padStart(2, '0');
            const s = (this.secondsStudied % 60).toString().padStart(2, '0');
            const timerText = document.getElementById('timer-text');
            if(timerText) timerText.innerText = `${m}:${s}`;
            
            // Cập nhật thanh tiến độ bên phải
            const percent = Math.min((this.secondsStudied / this.MIN_LEARN_TIME) * 100, 100);
            const bar = document.getElementById('ss-progress');
            if(bar) bar.style.width = `${percent}%`;
            
            const timerSidebar = document.getElementById('ss-timer');
            if(timerSidebar) timerSidebar.innerText = `${m}:${s}`;

            this.checkUnlock();

            // Cơ chế nhận thưởng (Mỗi 5 phút)
            if(this.secondsStudied > 0 && this.secondsStudied % this.REWARD_INTERVAL === 0) {
                this.claimReward();
            }
        }, 1000);
    },

    claimReward: async function() {
        try {
            await fetch('/api/lesson/claim-study-reward', { method: 'POST' });
            
            const Toast = Swal.mixin({
                toast: true, position: 'top-end', showConfirmButton: false, timer: 3000,
                background: '#10b981', color: '#fff'
            });
            Toast.fire({ icon: 'success', title: '🎁 +XP chăm học!' });
        } catch(e) {
            console.error("Reward error", e);
        }
    },

    lockButton: function() {
        const btn = document.getElementById('btn-finish-lesson');
        if(!btn) return;
        
        // Chỉ khóa nếu chưa hoàn thành (kiểm tra text nút hoặc trạng thái server nếu cần)
        // Ở đây giả định load trang là chưa hoàn thành
        btn.disabled = true;
        btn.classList.add('disabled', 'opacity-50');
        btn.style.cursor = 'not-allowed';
        
        const hint = document.getElementById('finish-hint');
        if(hint) hint.innerText = `Cần học tối thiểu ${this.MIN_LEARN_TIME} giây để hoàn thành.`;
    },

    checkUnlock: function() {
        if(this.secondsStudied >= this.MIN_LEARN_TIME) {
            const btn = document.getElementById('btn-finish-lesson');
            if(btn && btn.disabled) {
                btn.disabled = false;
                btn.classList.remove('disabled', 'opacity-50');
                btn.style.cursor = 'pointer';
                btn.classList.add('animate__animated', 'animate__pulse', 'animate__infinite');
                
                const hint = document.getElementById('finish-hint');
                if(hint) {
                    hint.innerText = "Bạn đã đủ điều kiện hoàn thành!";
                    hint.className = "text-success mb-3 small fw-bold";
                }
            }
        }
    }
};

function triggerConfetti() {
    if(window.confetti) {
        confetti({ particleCount: 150, spread: 80, origin: { y: 0.6 } });
    }
}

// Global function cho nút Hoàn thành
window.completeLesson = async function(id) {
    const btn = document.getElementById('btn-finish-lesson');
    if(btn.disabled) return;

    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span> Đang xử lý...';
    btn.classList.remove('animate__animated'); // Tắt hiệu ứng rung
    
    try {
        const res = await fetch(`/lesson/${id}/complete`, { method: 'POST' });
        const data = await res.json();
        
        if(res.ok) {
            triggerConfetti();
            Swal.fire({
                title: 'TUYỆT VỜI! 🎉',
                html: `
                    <div class="py-2">
                        <div class="fw-bold text-success fs-3 mb-2">+${data.points || 10} Điểm</div>
                        <div class="text-muted">Bạn đã hoàn thành bài học này xuất sắc!</div>
                    </div>
                `,
                icon: 'success',
                confirmButtonText: 'Học tiếp bài sau 🚀',
                confirmButtonColor: '#4f46e5'
            }).then(() => {
                // Reload hoặc chuyển trang tiếp theo tùy logic
                window.location.reload();
            });
            
            btn.innerHTML = '<i class="fas fa-check-double"></i> Đã hoàn thành';
            btn.className = 'btn btn-secondary btn-lg px-5 py-3 rounded-pill shadow-sm disabled';
        } else {
            Swal.fire('Lỗi', data.message || 'Không thể hoàn thành', 'error');
            btn.innerHTML = 'Thử lại';
        }
    } catch(e) {
        console.error(e);
        Swal.fire('Lỗi mạng', 'Kiểm tra kết nối internet', 'error');
        btn.innerHTML = 'Thử lại';
    }
};