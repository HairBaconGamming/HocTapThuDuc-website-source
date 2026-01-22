/**
 * LESSON DETAIL ENGINE - ULTIMATE FIX
 * Tính năng: Xử lý triệt để lỗi render HTML/SVG, Full Page Scroll, TOC, Quiz
 */

document.addEventListener('DOMContentLoaded', () => {
    initLessonContent();
    if(typeof StudyManager !== 'undefined') StudyManager.init(); 
});

let tocObserver = null;
function initLessonContent() {
    const contentArea = document.getElementById('lessonContentArea');
    if (!contentArea) return;

    // 1. Cấu hình Markdown
    if (typeof marked !== 'undefined') {
        marked.use({ breaks: true, gfm: true });
    }

    // 2. GIẢI MÃ DỮ LIỆU TỪ BASE64 (An toàn tuyệt đối)
    let blocks = [];
    try {
        if (window.LESSON_CONTENT_B64) {
            // Bước A: Decode Base64 sang chuỗi UTF-8
            const decodedString = decodeBase64(window.LESSON_CONTENT_B64);
            
            // Bước B: Parse JSON lần 1
            let parsedData = JSON.parse(decodedString);

            // Bước C: Kiểm tra Double Stringify (Quan trọng)
            // Nếu dữ liệu trong DB bị lưu dưới dạng chuỗi JSON trong chuỗi JSON, ta cần parse thêm 1 lần nữa.
            if (typeof parsedData === 'string') {
                try {
                    // Thử parse lần 2 để lấy Object thật
                    let deepParse = JSON.parse(parsedData);
                    parsedData = deepParse;
                } catch (e) {
                    // Nếu không phải JSON, giữ nguyên là string
                    console.log("Data is a raw string, not double JSON.");
                }
            }

            blocks = Array.isArray(parsedData) ? parsedData : [parsedData];
        }
    } catch (e) {
        console.error("Critical Data Error:", e);
        contentArea.innerHTML = '<div class="alert alert-danger">Lỗi tải dữ liệu bài học.</div>';
        return;
    }

    contentArea.innerHTML = '';

    // 3. RENDER BLOCKS
    if (Array.isArray(blocks) && blocks.length > 0) {
        blocks.forEach((block, index) => {
            const blockHTML = renderSingleBlock(block, index);
            if(blockHTML) contentArea.appendChild(blockHTML);
        });
    } else {
        contentArea.innerHTML = '<div class="text-center py-5 text-muted">Bài học này chưa có nội dung.</div>';
    }

    // 4. Post-Render
    if (window.renderMathInElement) {
        renderMathInElement(contentArea, {
            delimiters: [{left: '$$', right: '$$', display: true}, {left: '$', right: '$', display: false}],
            throwOnError: false
        });
    }
    if (window.Prism) Prism.highlightAllUnder(contentArea);
    
    generateTableOfContents();
    initReadingProgress();
}

// --- HELPER: DECODE BASE64 UTF-8 SAFE ---
function decodeBase64(str) {
    return decodeURIComponent(atob(str).split('').map(function(c) {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
    }).join(''));
}

/* =========================================
   BLOCK RENDERER ENGINE
   ========================================= */

function renderSingleBlock(block, idx) {
    const wrapper = document.createElement('div');
    wrapper.className = `content-block-render block-type-${block.type}`;
    wrapper.dataset.id = idx;

    switch (block.type) {
        case 'header': 
            const level = block.data.level || 2;
            const hTag = document.createElement(`h${level}`);
            hTag.innerHTML = block.data.text;
            hTag.id = `heading-${idx}`;
            wrapper.appendChild(hTag);
            break;

        case 'text':
            let htmlContent = marked.parse(block.data.text || '');
            if (window.DOMPurify) htmlContent = DOMPurify.sanitize(htmlContent);
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = htmlContent;
            tempDiv.querySelectorAll('h1, h2, h3, h4').forEach((h, i) => {
                if(!h.id) h.id = `md-heading-${idx}-${i}`;
            });
            wrapper.innerHTML = tempDiv.innerHTML;
            break;

        case 'image':
            if (block.data.url) {
                wrapper.className += ' text-center my-4';
                const img = document.createElement('img');
                img.src = block.data.url;
                img.alt = block.data.caption || 'Hình ảnh';
                img.loading = 'lazy';
                img.onclick = () => window.open(img.src, '_blank');
                img.style.cursor = 'zoom-in';
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
                videoWrapper.className = 'video-block-wrapper';
                const videoInfo = getEmbedUrl(block.data.url, block.data.autoplay);
                
                if (videoInfo && videoInfo.url) {
                    if (videoInfo.type === 'iframe') {
                        videoWrapper.innerHTML = `
                            <iframe 
                                src="${videoInfo.url}" 
                                frameborder="0" 
                                allow="autoplay; encrypted-media; picture-in-picture; clipboard-write" 
                                allowfullscreen 
                                referrerpolicy="origin"
                                title="Video bài học"
                            ></iframe>`;
                    } else {
                        videoWrapper.innerHTML = `<video src="${videoInfo.url}" controls ${block.data.autoplay ? 'autoplay muted' : ''} style="width:100%; height:100%;"></video>`;
                    }
                } else {
                    videoWrapper.className = 'alert alert-warning my-3';
                    videoWrapper.innerHTML = `<i class="fas fa-exclamation-triangle me-2"></i> Video không khả dụng: <a href="${block.data.url}" target="_blank">Mở link gốc</a>`;
                }
                wrapper.appendChild(videoWrapper);
            }
            break;

        case 'document':
        case 'resource':
            const docUrl = block.data.url || '#';
            const docTitle = block.data.title || 'Tài liệu đính kèm';
            const docExt = docUrl.split('.').pop().toLowerCase();
            let iconClass = 'fas fa-file-alt';
            if(['pdf'].includes(docExt)) iconClass = 'fas fa-file-pdf text-danger';
            else if(['doc','docx'].includes(docExt)) iconClass = 'fas fa-file-word text-primary';
            else if(['xls','xlsx'].includes(docExt)) iconClass = 'fas fa-file-excel text-success';
            else if(['zip','rar'].includes(docExt)) iconClass = 'fas fa-file-archive text-warning';
            else if(['drive'].includes(block.data.iconType)) iconClass = 'fab fa-google-drive text-success';

            wrapper.innerHTML = `
                <a href="${docUrl}" target="_blank" class="document-card text-decoration-none">
                    <div class="doc-icon"><i class="${iconClass}"></i></div>
                    <div class="doc-info">
                        <div class="doc-title">${docTitle}</div>
                        <div class="doc-meta">Nhấn để xem hoặc tải xuống</div>
                    </div>
                    <div class="doc-action"><i class="fas fa-external-link-alt"></i></div>
                </a>`;
            break;

        // [FIXED] HTML PREVIEW - ÁP DỤNG CLEAN DEEPLY
        case 'html_preview':
            wrapper.className += ' mb-4';
            const uniqueId = `html-preview-${idx}`;
            
            // [FIXED] LẤY TRỰC TIẾP HTML GỐC, KHÔNG DÙNG REGEX REPLACE
            // Vì đã qua Base64 và JSON.parse, các ký tự \n, \", <script> đã được khôi phục chính xác.
            const htmlCode = block.data.html || '';
            
            const settings = block.data.settings || { 
                showSource: true, defaultTab: 'result', height: 400, viewport: 'responsive' 
            };
            
            let containerStyle = `height: ${settings.height}px; display:block;`;
            if (settings.viewport === 'mobile') {
                containerStyle += 'width: 375px; margin: 0 auto; border: 4px solid #333; border-radius: 20px; overflow: hidden; box-shadow: 0 10px 20px rgba(0,0,0,0.2);';
            } else if (settings.viewport === 'tablet') {
                containerStyle += 'width: 768px; margin: 0 auto; border: 4px solid #333; border-radius: 12px;';
            } else {
                containerStyle += 'width: 100%;';
            }

            const isCodeActive = settings.defaultTab === 'code' && settings.showSource;
            const isResultActive = !isCodeActive;

            const headerHTML = settings.showSource ? `
                <div class="card-header bg-light d-flex justify-content-between align-items-center py-2 px-3">
                     <span class="badge bg-orange text-white" style="background:#f97316"><i class="fab fa-html5 me-1"></i> Demo</span>
                    <ul class="nav nav-pills nav-sm card-header-pills" role="tablist">
                        <li class="nav-item"><button class="nav-link ${isResultActive ? 'active' : ''} py-1 px-3 fw-bold" data-bs-toggle="tab" data-bs-target="#preview-${uniqueId}">Kết quả</button></li>
                        <li class="nav-item"><button class="nav-link ${isCodeActive ? 'active' : ''} py-1 px-3 fw-bold" data-bs-toggle="tab" data-bs-target="#code-${uniqueId}">Mã nguồn</button></li>
                    </ul>
                </div>` : '';

            // Escape để hiển thị source code an toàn
            const sourceCodeDisplay = htmlCode.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

            wrapper.innerHTML = `
                <div class="card shadow-sm border rounded overflow-hidden bg-white">
                    ${headerHTML}
                    <div class="card-body p-0">
                        <div class="tab-content">
                            <div class="tab-pane fade ${isResultActive ? 'show active' : ''}" id="preview-${uniqueId}">
                                <div class="bg-light checkerboard-bg py-3 px-0 text-center" style="overflow-x: auto;"> 
                                    <div class="iframe-container" style="${containerStyle}">
                                        <iframe id="iframe-${uniqueId}" style="width:100%; height:100%; border:none;" title="HTML Preview"></iframe>
                                    </div>
                                </div>
                            </div>
                            ${settings.showSource ? `
                            <div class="tab-pane fade ${isCodeActive ? 'show active' : ''}" id="code-${uniqueId}">
                                <div class="position-relative">
                                    <button class="btn btn-sm btn-dark position-absolute top-0 end-0 m-2 opacity-75" onclick="copyCode(this)">Copy</button>
                                    <pre class="line-numbers m-0 rounded-0" style="max-height: ${settings.height}px;"><code class="language-html">${sourceCodeDisplay}</code></pre>
                                </div>
                            </div>` : ''}
                        </div>
                    </div>
                </div>`;

            setTimeout(() => {
                const iframe = wrapper.querySelector(`#iframe-${uniqueId}`);
                if (iframe) {
                    const doc = iframe.contentWindow.document;
                    doc.open();
                    
                    // Inject CSS Bootstrap nếu được bật
                    let headInject = '<style>body{margin:0; padding:0; font-family:-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;}</style>';
                    if (settings.includeBootstrap) {
                        headInject += '<link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">';
                    }
                    
                    // [IMPORTANT] Ghi nội dung HTML gốc vào Iframe.
                    // Vì đã qua Base64 -> JSON.parse, htmlCode bây giờ là chuỗi gốc chuẩn xác.
                    // Không cần replace hay clean gì nữa.
                    doc.write(htmlCode);
                    doc.close();
                }
            }, 50);
            break;

        case 'code':
            const lang = block.data.language || 'javascript';
            const codeText = (block.data.code || '').replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
            wrapper.innerHTML = `
                <div class="code-viewer-container">
                    <div class="code-header"><span>${lang.toUpperCase()}</span><button class="btn btn-sm btn-dark border-secondary text-light btn-copy-code" onclick="copyCode(this)">Copy</button></div>
                    <pre class="line-numbers"><code class="language-${lang}">${codeText}</code></pre>
                </div>`;
            break;

        case 'callout':
            const cType = {info:'alert-info', warning:'alert-warning', danger:'alert-danger', success:'alert-success'}[block.data.style] || 'alert-info';
            wrapper.className += ` alert ${cType} border-0 shadow-sm d-flex align-items-start my-3`;
            wrapper.innerHTML = `<div class="me-3 mt-1"><i class="fas fa-info-circle fa-lg"></i></div><div class="flex-grow-1">${marked.parse(block.data.text || '')}</div>`;
            break;

        case 'quiz':
        case 'question':
            if (block.data.questions && block.data.questions.length > 0) wrapper.appendChild(renderQuizBlock(block.data, idx));
            break;
    }
    return wrapper;
}

function renderQuizBlock(data, blockIdx) {
    const settings = data.settings || { passingScore: 50, showFeedback: 'submit' };
    const container = document.createElement('div');
    container.className = 'quiz-wrapper bg-white mb-4 shadow-sm rounded border';
    const feedbackMode = settings.showFeedback || 'submit';
    
    container.innerHTML = `
        <div class="p-3 border-bottom bg-light d-flex justify-content-between align-items-center flex-wrap">
            <div>
                <strong class="text-primary"><i class="fas fa-puzzle-piece me-2"></i>Bài tập thực hành</strong>
                <span class="badge bg-secondary ms-2">Điểm đạt: ${settings.passingScore}%</span>
            </div>
            <small class="text-muted mt-2 mt-md-0">
                <i class="fas fa-lightbulb me-1"></i> ${feedbackMode === 'instant' ? 'Chấm điểm từng câu' : feedbackMode === 'submit' ? 'Xem kết quả sau khi nộp' : 'Chế độ kiểm tra'}
            </small>
        </div>
        <div class="quiz-body p-4"></div>
        <div class="quiz-footer p-3 border-top bg-light d-flex justify-content-between align-items-center flex-wrap gap-2">
            <div class="quiz-controls-left"></div>
            <div class="text-end"><button class="btn btn-primary btn-submit-quiz shadow-sm fw-bold px-4"><i class="fas fa-paper-plane me-2"></i> Nộp bài</button></div>
        </div>`;
    
    const body = container.querySelector('.quiz-body');
    const btnSubmit = container.querySelector('.btn-submit-quiz');

    const parseMD = (text) => {
        if (typeof marked === 'undefined') return text;
        let html = marked.parse(text);
        if (window.DOMPurify) {
            html = DOMPurify.sanitize(html, {
                ADD_TAGS: ['input'], 
                ADD_ATTR: ['type', 'class', 'style', 'data-answer', 'placeholder', 'autocomplete', 'disabled', 'value']
            });
        }
        return html;
    };

    const questions = data.questions || [];
    questions.forEach((q, idx) => {
        const qEl = document.createElement('div');
        qEl.className = 'quiz-question mb-4 pb-3 border-bottom';
        if(idx === questions.length -1) qEl.classList.remove('border-bottom');
        qEl.dataset.type = q.type;
        qEl.dataset.index = idx;
        
        let qContent = '';

        if (q.type === 'fill') {
            let rawText = q.content || q.question || '';
            if (rawText.includes('[') && rawText.includes(']')) {
                rawText = rawText.replace(/\[(.*?)\]/g, (match, answer) => {
                    const width = Math.max(100, answer.length * 15);
                    const safeAns = answer.replace(/"/g, '&quot;');
                    return `<input type="text" class="form-control d-inline-block text-center fw-bold fill-input mx-1" style="width: ${width}px; min-width: 80px; padding: 0.25rem 0.5rem; color: #4f46e5;" data-answer="${safeAns}" placeholder="..." autocomplete="off">`;
                });
            } else {
                rawText += ` <input type="text" class="form-control fill-input" data-answer="" placeholder="..." autocomplete="off">`;
            }
            qContent = `<div class="question-content lh-lg">${parseMD(`**Câu ${idx + 1}:** ${rawText}`)}</div>`;
        } else {
            qContent = `<div class="question-content mb-3">${parseMD(`**Câu ${idx + 1}:** ${q.question}`)}</div>`;
            if (q.type === 'essay') {
                qContent += `<textarea class="form-control essay-input bg-light" rows="4" placeholder="Nhập câu trả lời..." style="resize:vertical;"></textarea><div class="mt-2 text-muted small"><i class="fas fa-pen-fancy"></i> Gợi ý: Trả lời ngắn gọn.</div>`;
            } else if (q.type === 'choice') {
                const type = q.isMulti ? 'checkbox' : 'radio';
                const name = `q_${blockIdx}_${idx}`;
                let opts = '';
                (q.options || []).forEach((opt, optIdx) => {
                    const isCorrect = (q.correct || []).includes(optIdx);
                    opts += `<label class="quiz-option d-block p-3 rounded mb-2 cursor-pointer position-relative border transition-all" data-option-idx="${optIdx}" data-is-correct="${isCorrect}"><input class="form-check-input me-2" type="${type}" name="${name}" value="${optIdx}" data-correct="${isCorrect}"><span>${opt}</span><i class="fas fa-check text-success position-absolute end-0 me-3 result-icon" style="display:none; top: 18px;"></i><i class="fas fa-times text-danger position-absolute end-0 me-3 result-icon" style="display:none; top: 18px;"></i></label>`;
                });
                qContent += `<div class="options-list">${opts}</div>`;
            }
        }

        const explainText = parseMD(q.explanation || 'Không có giải thích chi tiết.');
        qContent += `<div class="explanation mt-3 p-3 rounded bg-info-subtle text-info-emphasis animate__animated animate__fadeIn" style="display:none; border-left: 4px solid #0ea5e9;"><div class="fw-bold mb-1"><i class="fas fa-lightbulb me-2"></i>Giải thích / Đáp án:</div><div class="markdown-body">${explainText}</div></div>`;
        qEl.innerHTML = qContent;
        
        if (feedbackMode === 'instant') {
            if (q.type === 'choice') {
                qEl.querySelectorAll('input').forEach(input => {
                    input.addEventListener('change', function() {
                        const label = input.closest('label');
                        const isCorrect = input.dataset.correct === 'true';
                        qEl.querySelectorAll('label').forEach(l => {
                            l.classList.remove('bg-success-subtle', 'bg-danger-subtle', 'border-success', 'border-danger');
                            l.querySelectorAll('.result-icon').forEach(i => i.style.display = 'none');
                        });
                        if (isCorrect) {
                            label.classList.add('bg-success-subtle', 'border-success');
                            label.querySelector('.fa-check').style.display = 'block';
                            if(qEl.querySelector('.explanation')) qEl.querySelector('.explanation').style.display = 'block';
                        } else {
                            label.classList.add('bg-danger-subtle', 'border-danger');
                            label.querySelector('.fa-times').style.display = 'block';
                            if(qEl.querySelector('.explanation')) qEl.querySelector('.explanation').style.display = 'none';
                        }
                    });
                });
            } else if (q.type === 'fill') {
                qEl.querySelectorAll('.fill-input').forEach(input => {
                    const checkVal = () => {
                        const val = input.value.trim().toLowerCase();
                        const correct = input.dataset.answer.trim().toLowerCase();
                        input.classList.remove('is-valid', 'is-invalid', 'bg-success-subtle', 'text-success');
                        if(val && val === correct) {
                            input.classList.add('is-valid', 'bg-success-subtle', 'text-success'); 
                            input.disabled = true;
                            const allDone = Array.from(qEl.querySelectorAll('.fill-input')).every(i => i.classList.contains('is-valid'));
                            if(allDone) qEl.querySelector('.explanation').style.display = 'block';
                        } else if(val) {
                            input.classList.add('is-invalid');
                        }
                    };
                    input.addEventListener('change', checkVal);
                    input.addEventListener('keydown', e => { if(e.key === 'Enter') checkVal(); });
                });
            }
        }
        body.appendChild(qEl);
    });

    btnSubmit.onclick = () => {
        let correctCount = 0;
        const qEls = body.querySelectorAll('.quiz-question');
        qEls.forEach(qEl => {
            const type = qEl.dataset.type;
            let isQCorrect = false;
            if (type === 'choice') {
                const inputs = qEl.querySelectorAll('input');
                let userCorrect = true, hasChecked = false;
                inputs.forEach(inp => {
                    const label = inp.closest('label');
                    const isRight = inp.dataset.correct === 'true';
                    label.classList.remove('bg-success-subtle', 'bg-danger-subtle', 'border-success', 'border-danger');
                    label.querySelectorAll('.result-icon').forEach(i => i.style.display = 'none');
                    if (inp.checked) {
                        hasChecked = true;
                        if (isRight) {
                            label.classList.add('bg-success-subtle', 'border-success');
                            label.querySelector('.fa-check').style.display = 'block';
                        } else {
                            userCorrect = false;
                            label.classList.add('bg-danger-subtle', 'border-danger');
                            label.querySelector('.fa-times').style.display = 'block';
                        }
                    } else if (isRight && feedbackMode !== 'never') {
                        label.style.border = "2px dashed #198754";
                        if(q.isMulti) userCorrect = false;
                    }
                    inp.disabled = true;
                });
                if (hasChecked && userCorrect) isQCorrect = true;
            } else if (type === 'fill') {
                const inputs = qEl.querySelectorAll('.fill-input');
                let allCorrect = true;
                inputs.forEach(inp => {
                    const val = inp.value.trim().toLowerCase();
                    const ans = inp.dataset.answer.trim().toLowerCase();
                    inp.classList.remove('is-valid', 'is-invalid', 'bg-success-subtle', 'text-success');
                    if (val === ans) {
                        inp.classList.add('is-valid', 'bg-success-subtle', 'text-success');
                    } else {
                        allCorrect = false;
                        inp.classList.add('is-invalid');
                        if (feedbackMode !== 'never') {
                            if(inp.nextElementSibling?.classList.contains('correct-ans-hint')) inp.nextElementSibling.remove();
                            const hint = document.createElement('span');
                            hint.className = 'correct-ans-hint badge bg-success text-white ms-2 shadow-sm animate__animated animate__flipInX';
                            hint.innerHTML = `<i class="fas fa-check me-1"></i> ${inp.dataset.answer}`;
                            inp.after(hint);
                        }
                    }
                    inp.disabled = true;
                });
                if(inputs.length > 0 && allCorrect) isQCorrect = true;
            } else if (type === 'essay') {
                const txt = qEl.querySelector('textarea');
                if (txt.value.trim().length > 0) {
                    txt.classList.add('is-valid'); isQCorrect = true;
                } else {
                    txt.classList.add('is-invalid');
                }
                txt.disabled = true;
            }
            if(isQCorrect) correctCount++;
            if(qEl.querySelector('.explanation') && feedbackMode !== 'never') qEl.querySelector('.explanation').style.display = 'block';
        });

        const percent = Math.round((correctCount / questions.length) * 100);
        const passed = percent >= settings.passingScore;
        Swal.fire({
            title: passed ? 'Tuyệt vời! 🎉' : 'Hoàn thành!',
            html: `<div class="my-2"><p>Kết quả: <b>${correctCount}/${questions.length}</b> câu.</p><div class="progress" style="height: 10px;"><div class="progress-bar bg-${passed ? 'success' : 'primary'}" role="progressbar" style="width: ${percent}%"></div></div></div>`,
            confirmButtonText: 'Đóng', customClass: { confirmButton: 'btn btn-primary px-4 py-2 rounded-pill' }
        });
        if(passed) triggerConfetti();
        btnSubmit.disabled = true;
        btnSubmit.innerHTML = `<i class="fas fa-check-double"></i> Đã chấm (${percent}%)`;
        btnSubmit.className = `btn btn-${passed ? 'success' : 'secondary'} shadow-sm fw-bold px-4`;
    };

    return container;
}

function generateTableOfContents() {
    const tocList = document.getElementById('toc-list');
    const contentArea = document.getElementById('lessonContentArea');
    if(!tocList || !contentArea) return;
    const headers = Array.from(contentArea.querySelectorAll('h1, h2, h3, h4'));
    if(headers.length === 0) { tocList.innerHTML = '<li class="text-muted small ps-4 py-3">Bài học chưa có mục lục.</li>'; return; }
    let html = '', counters = [0,0,0,0], lastLevel = 0;
    headers.forEach((h, i) => {
        if(!h.id) h.id = `toc-${i}`;
        const lvl = parseInt(h.tagName.substring(1)) - 1;
        if(lvl < lastLevel) for(let j=lvl+1; j<4; j++) counters[j]=0;
        counters[lvl]++; lastLevel=lvl;
        html += `<li><a href="#${h.id}" class="toc-link toc-item-h${lvl+1}" onclick="scrollToHeader(event,'${h.id}')"><span class="toc-number">${counters.slice(0,lvl+1).join('.')}</span> ${h.innerText}</a></li>`;
    });
    tocList.innerHTML = html;
    initScrollSpy(headers);
}

function initScrollSpy(headers) {
    if(tocObserver) tocObserver.disconnect();
    const scrollContainer = document.querySelector('.lesson-content-wrapper');
    tocObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if(entry.isIntersecting) {
                document.querySelectorAll('.toc-link').forEach(a=>a.classList.remove('active'));
                const link = document.querySelector(`.toc-link[href="#${entry.target.id}"]`);
                if(link) { link.classList.add('active'); link.scrollIntoView({block:'nearest'}); }
            }
        });
    }, {root: scrollContainer, rootMargin: '0px 0px -80% 0px'});
    headers.forEach(h => tocObserver.observe(h));
}

function scrollToHeader(e, id) {
    e.preventDefault();
    const el = document.getElementById(id);
    if(el) { el.scrollIntoView({behavior:'smooth', block:'start'}); history.pushState(null,null,`#${id}`); }
}

function initReadingProgress() {
    if(!document.getElementById('reading-progress')) {
        const bar = document.createElement('div');
        bar.id = 'reading-progress';
        bar.className = 'reading-progress-bar';
        document.body.appendChild(bar);
    }
    const bar = document.getElementById('reading-progress');
    const con = document.querySelector('.lesson-content-wrapper');
    if(con) con.addEventListener('scroll', () => {
        bar.style.width = ((con.scrollTop / (con.scrollHeight - con.clientHeight)) * 100) + "%";
    });
}

function copyCode(btn) {
    const code = btn.closest('.code-viewer-container').querySelector('code').innerText;
    navigator.clipboard.writeText(code).then(() => {
        const original = btn.innerHTML; 
        btn.innerHTML = '<i class="fas fa-check"></i> Đã chép'; 
        btn.classList.replace('btn-dark', 'btn-success');
        setTimeout(() => { btn.innerHTML = original; btn.classList.replace('btn-success', 'btn-dark'); }, 2000);
    });
}

function getEmbedUrl(url, autoplay) {
    if (!url) return null;
    const ytMatch = url.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=|shorts\/)|youtu\.be\/)([^"&?\/\s]{11})/);
    if (ytMatch && ytMatch[1]) {
        const origin = window.location.origin;
        return { type: 'iframe', url: `https://www.youtube.com/embed/${ytMatch[1]}?enablejsapi=1&origin=${origin}&modestbranding=1&rel=0${autoplay ? '&autoplay=1&mute=1' : ''}` };
    }
    const driveMatch = url.match(/drive\.google\.com\/file\/d\/([^\/]+)\//);
    if (driveMatch && driveMatch[1]) return { type: 'iframe', url: `https://drive.google.com/file/d/${driveMatch[1]}/preview` };
    return { type: 'video', url: url };
}

function triggerConfetti() { 
    if(window.confetti) confetti({ particleCount: 150, spread: 80, origin: { y: 0.6 } }); 
}

const StudyManager = {
    REWARD_INTERVAL: 300, AFK_TIMEOUT: 60, MIN_LEARN_TIME: 10,
    secondsStudied: 0, secondsSinceLastInput: 0, isAFK: false, interval: null,
    init: function() { this.createUI(); this.bindEvents(); this.start(); this.lockButton(); },
    createUI: function() {
        const div = document.createElement('div'); div.id = 'study-floater'; div.className = 'study-floater active animate__animated animate__fadeInUp';
        div.innerHTML = `<div class="timer-ring"></div><div class="fw-bold" id="timer-text">00:00</div>`; document.body.appendChild(div);
    },
    bindEvents: function() {
        const reset = () => { this.secondsSinceLastInput = 0; if(this.isAFK) { this.isAFK = false; document.getElementById('study-floater')?.classList.replace('afk', 'active'); } };
        ['mousemove', 'keydown', 'scroll', 'click'].forEach(e => window.addEventListener(e, reset));
        document.addEventListener('visibilitychange', () => { if(document.hidden) this.isAFK = true; });
    },
    start: function() {
        this.interval = setInterval(() => {
            if(document.hidden || this.isAFK) {
                const w = document.getElementById('study-floater'); if(w && !w.classList.contains('afk')) { w.classList.replace('active', 'afk'); document.getElementById('timer-text').innerText = "PAUSE"; } return;
            }
            this.secondsSinceLastInput++; if(this.secondsSinceLastInput > this.AFK_TIMEOUT) { this.isAFK = true; return; }
            this.secondsStudied++;
            const m = Math.floor(this.secondsStudied/60).toString().padStart(2,'0'), s = (this.secondsStudied%60).toString().padStart(2,'0');
            if(document.getElementById('timer-text')) document.getElementById('timer-text').innerText = `${m}:${s}`;
            this.checkUnlock();
            if(this.secondsStudied > 0 && this.secondsStudied % this.REWARD_INTERVAL === 0) this.claimReward();
        }, 1000);
    },
    claimReward: async function() { try { await fetch('/api/lesson/claim-study-reward', { method: 'POST' }); Swal.mixin({toast: true, position: 'top-end', showConfirmButton: false, timer: 3000, background: '#10b981', color: '#fff'}).fire({ icon: 'success', title: '🎁 +XP chăm học!' }); } catch(e){} },
    lockButton: function() { const btn = document.getElementById('btn-finish-lesson'); if(btn) { btn.disabled = true; btn.classList.add('disabled', 'opacity-50'); btn.style.cursor = 'not-allowed'; } },
    checkUnlock: function() { if(this.secondsStudied >= this.MIN_LEARN_TIME) { const btn = document.getElementById('btn-finish-lesson'); if(btn && btn.disabled) { btn.disabled = false; btn.classList.remove('disabled', 'opacity-50'); btn.style.cursor = 'pointer'; btn.classList.add('animate__animated', 'animate__pulse', 'animate__infinite'); } } }
};

window.completeLesson = async function(id) {
    const btn = document.getElementById('btn-finish-lesson'); if(btn.disabled) return;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span> Xử lý...';
    try {
        const res = await fetch(`/lesson/${id}/complete`, { method: 'POST' });
        const data = await res.json();
        if(res.ok) {
            triggerConfetti();
            Swal.fire({ title: 'TUYỆT VỜI! 🎉', text: `+${data.points || 10} Điểm`, icon: 'success' }).then(() => window.location.reload());
        } else { Swal.fire('Lỗi', data.message, 'error'); btn.innerHTML = 'Thử lại'; }
    } catch(e) { Swal.fire('Lỗi mạng', 'Kiểm tra kết nối', 'error'); btn.innerHTML = 'Thử lại'; }
};