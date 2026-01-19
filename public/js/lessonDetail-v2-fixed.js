/**
 * LESSON DETAIL V2 - MODERN PAGINATION ENGINE
 * Tính năng: Phân trang thông minh, TOC động, Timer học, Full content support
 */

let currentPage = 1;
let totalPages = 1;
const WORDS_PER_PAGE = 500;
let contentPages = [];
let contentData = [];
let studyStartTime = Date.now();
let timerInterval = null;
let isHeaderHidden = false;
let lastScrollTop = 0;

document.addEventListener('DOMContentLoaded', () => {
    document.body.style.overflow = 'hidden';
    
    initLessonContent();
    startStudyTimer();
    loadComments();
    setupHeaderHoverShow();
});

/* ===== HEADER HOVER SHOW ===== */
function setupHeaderHoverShow() {
    const header = document.querySelector('.lesson-mini-header');
    const contentContainer = document.getElementById('content-container');
    const isMobile = window.innerWidth < 768;
    
    if (!header || !contentContainer) return;
    
    // Desktop: Auto-hide header, show on hover/scroll-up
    if (!isMobile) {
        // Hide initially on desktop
        header.style.transform = 'translateY(-100%)';
        header.style.transition = 'transform 0.3s ease-in-out';
        isHeaderHidden = true;
        
        // Show on hover at top
        document.addEventListener('mousemove', (e) => {
            if (e.clientY < 40 && isHeaderHidden) {
                header.style.transform = 'translateY(0)';
                isHeaderHidden = false;
            }
        });
        
        // Hide when mouse leaves header area and scroll down
        header.addEventListener('mouseleave', () => {
            if (contentContainer.scrollTop > 100) {
                header.style.transform = 'translateY(-100%)';
                isHeaderHidden = true;
            }
        });
        
        // Show when scrolling up
        contentContainer.addEventListener('scroll', () => {
            const scrollTop = contentContainer.scrollTop;
            if (scrollTop < lastScrollTop && isHeaderHidden) {
                // Scrolling up
                header.style.transform = 'translateY(0)';
                isHeaderHidden = false;
            } else if (scrollTop > lastScrollTop && scrollTop > 100 && !isHeaderHidden) {
                // Scrolling down past top
                setTimeout(() => {
                    if (!header.matches(':hover')) {
                        header.style.transform = 'translateY(-100%)';
                        isHeaderHidden = true;
                    }
                }, 300);
            }
            lastScrollTop = scrollTop;
        });
    }
}

/* ===== INIT CONTENT ===== */
function initLessonContent() {
    // Get content from server-rendered data or from attribute
    let blocks = [];
    const lessonObj = window.lessonData || {};
    
    try {
        // Try to get content from window.lessonData first (server-rendered)
        if (window.lessonData && window.lessonData.content) {
            const content = window.lessonData.content;
            if (typeof content === 'string') {
                blocks = JSON.parse(content);
            } else {
                blocks = content;
            }
        } 
        
        // If no blocks yet, try to find in DOM
        if (!blocks || blocks.length === 0) {
            const contentEl = document.querySelector('[data-lesson-content]');
            if (contentEl) {
                const rawContent = contentEl.getAttribute('data-lesson-content');
                blocks = JSON.parse(rawContent);
            }
        }
        
        // If still no blocks, try alternative
        if (!blocks || blocks.length === 0) {
            // Check if lesson data exists in page
            const scripts = document.querySelectorAll('script[type="application/json"]');
            for (let script of scripts) {
                try {
                    const data = JSON.parse(script.textContent);
                    if (data.blocks || data.content) {
                        blocks = data.blocks || data.content;
                        break;
                    }
                } catch(e) {}
            }
        }
        
        if (!Array.isArray(blocks)) blocks = [blocks];
    } catch (e) {
        console.error("Lỗi parse nội dung:", e);
        showError('Lỗi định dạng nội dung');
        return;
    }

    if (!blocks || blocks.length === 0) {
        showError('Bài học này chưa có nội dung');
        return;
    }

    contentData = blocks;
    createPages(blocks);
    goToPage(1);
}

/* ===== CREATE PAGES FROM BLOCKS ===== */
function createPages(blocks) {
    contentPages = [];
    let currentPageBlocks = [];
    let currentWordCount = 0;

    blocks.forEach((block, idx) => {
        const blockHTML = renderSingleBlock(block, idx);
        const wordCount = estimateWords(block);

        // Nếu trang hiện tại quá dài, tạo trang mới
        if (currentWordCount + wordCount > WORDS_PER_PAGE && currentPageBlocks.length > 0) {
            const pageContainer = document.createElement('div');
            pageContainer.className = 'page-content';
            pageContainer.innerHTML = currentPageBlocks.join('');
            contentPages.push(pageContainer);
            
            currentPageBlocks = [];
            currentWordCount = 0;
        }

        if (blockHTML) {
            currentPageBlocks.push(blockHTML);
            currentWordCount += wordCount;
        }
    });

    // Thêm trang cuối cùng
    if (currentPageBlocks.length > 0) {
        const pageContainer = document.createElement('div');
        pageContainer.className = 'page-content';
        pageContainer.innerHTML = currentPageBlocks.join('');
        contentPages.push(pageContainer);
    }

    totalPages = contentPages.length || 1;
    updatePageUI();
}

/* ===== RENDER SINGLE BLOCK ===== */
function renderSingleBlock(block, idx) {
    if (!block) return '';

    try {
        switch (block.type) {
            case 'header':
            case 'heading':
                const level = block.data.level || 2;
                const text = escapeHtml(block.data.text || '');
                return `<h${level} id="heading-${idx}" class="heading-${level}">${text}</h${level}>`;

            case 'paragraph':
            case 'text':
                const para = block.data.text || '';
                const html = marked.parse(para);
                const sanitized = window.DOMPurify ? DOMPurify.sanitize(html) : html;
                return `<p>${sanitized}</p>`;

            case 'image':
                const imgAlt = escapeHtml(block.data.caption || 'Image');
                const imgSrc = escapeHtml(block.data.url || '');
                const caption = block.data.caption ? `<div class="image-caption">${escapeHtml(block.data.caption)}</div>` : '';
                return `<div class="image-container"><img src="${imgSrc}" alt="${imgAlt}" class="page-image" />${caption}</div>`;

            case 'video':
                const videoUrl = escapeHtml(block.data.url || '');
                if (videoUrl.includes('youtube.com') || videoUrl.includes('youtu.be')) {
                    const videoId = extractYoutubeId(videoUrl);
                    return `<div class="video-container"><iframe width="100%" height="400" src="https://www.youtube.com/embed/${videoId}" frameborder="0" allowfullscreen></iframe></div>`;
                }
                return `<video src="${videoUrl}" controls style="max-width:100%; border-radius:8px; margin:1rem 0;"></video>`;

            case 'code':
                const lang = escapeHtml(block.data.language || 'javascript');
                const code = escapeHtml(block.data.code || '');
                return `
                    <div class="code-viewer-container">
                        <div class="code-header">
                            <span>${lang}</span>
                            <button class="btn-copy-code" onclick="copyCode(this)">
                                <i class="fas fa-copy"></i> Sao chép
                            </button>
                        </div>
                        <pre><code class="language-${lang}">${code}</code></pre>
                    </div>`;

            case 'quote':
            case 'blockquote':
                const quoteText = block.data.text || '';
                const quoteSanitized = window.DOMPurify ? DOMPurify.sanitize(marked.parse(quoteText)) : marked.parse(quoteText);
                return `<blockquote class="page-quote">${quoteSanitized}</blockquote>`;

            case 'list':
                const items = (block.data.items || []).map(item => `<li>${escapeHtml(item)}</li>`).join('');
                const tag = block.data.style === 'ordered' ? 'ol' : 'ul';
                return `<${tag} class="page-list">${items}</${tag}>`;

            case 'callout':
            case 'alert':
                const alertType = block.data.style || 'info';
                const alertText = block.data.text || '';
                const alertSanitized = window.DOMPurify ? DOMPurify.sanitize(marked.parse(alertText)) : marked.parse(alertText);
                const iconMap = {'info': 'fa-info-circle', 'warning': 'fa-exclamation-triangle', 'danger': 'fa-bomb', 'success': 'fa-check-circle'};
                const icon = iconMap[alertType] || 'fa-info-circle';
                return `<div class="alert-box alert-${alertType}"><i class="fas ${icon}"></i><div>${alertSanitized}</div></div>`;

            case 'resource':
                const resUrl = escapeHtml(block.data.url || '#');
                const resTitle = escapeHtml(block.data.title || 'Tài liệu');
                return `<a href="${resUrl}" target="_blank" class="resource-link"><i class="fas fa-link"></i> ${resTitle}</a>`;

            case 'quiz':
            case 'question':
                return renderQuiz(block.data, idx);

            case 'separator':
            case 'divider':
                return `<hr class="page-divider">`;

            default:
                return '';
        }
    } catch (e) {
        console.error(`Lỗi render block ${block.type}:`, e);
        return '';
    }
}

/* ===== RENDER QUIZ ===== */
function renderQuiz(quizData, idx) {
    const questions = quizData.questions || [];
    if (!questions.length) return '';
    
    let html = `<div class="quiz-wrapper" data-quiz-id="${idx}">
        <div class="quiz-header"><i class="fas fa-tasks"></i> Câu hỏi</div>
        <div class="quiz-body">`;

    questions.forEach((q, qIdx) => {
        html += `<div class="quiz-question">
            <strong>${qIdx + 1}. ${escapeHtml(q.text || '')}</strong>
            <div style="margin-top: 0.8rem;">`;

        const options = q.options || [];
        options.forEach((opt, optIdx) => {
            const type = q.type === 'multiple' ? 'checkbox' : 'radio';
            const optId = `quiz-${idx}-q${qIdx}-opt${optIdx}`;
            
            html += `<label class="quiz-option">
                <input type="${type}" name="quiz-${idx}-q${qIdx}" value="${optIdx}" id="${optId}">
                <span>${escapeHtml(opt.text || '')}</span>
            </label>`;
        });

        html += `</div></div>`;
    });

    html += `</div>
        <button class="btn-submit-quiz" onclick="submitQuiz(${idx})">
            <i class="fas fa-check"></i> Kiểm tra
        </button>
    </div>`;

    return html;
}

/* ===== ESTIMATE WORDS ===== */
function estimateWords(block) {
    switch (block.type) {
        case 'header':
        case 'heading':
            return (block.data.text || '').split(/\s+/).length;
        case 'paragraph':
        case 'text':
            return (block.data.text || '').split(/\s+/).length;
        case 'list':
            return (block.data.items || []).join(' ').split(/\s+/).length;
        case 'quote':
        case 'blockquote':
            return (block.data.text || '').split(/\s+/).length;
        case 'callout':
        case 'alert':
            return (block.data.text || '').split(/\s+/).length;
        default:
            return 30;
    }
}

/* ===== GO TO PAGE ===== */
function goToPage(pageNum) {
    pageNum = parseInt(pageNum);
    
    if (pageNum < 1 || pageNum > totalPages) return;
    
    currentPage = pageNum;
    
    const container = document.getElementById('content-container');
    if (!container) return;
    
    container.innerHTML = '';
    
    if (contentPages[currentPage - 1]) {
        container.appendChild(contentPages[currentPage - 1].cloneNode(true));
    }
    
    setTimeout(() => {
        setupMathAndCode();
        generateTableOfContents();
    }, 50);
    
    updatePageUI();
    container.scrollTop = 0;
}

/* ===== NEXT/PREV PAGE ===== */
function nextPage() {
    if (currentPage < totalPages) {
        goToPage(currentPage + 1);
    }
}

function previousPage() {
    if (currentPage > 1) {
        goToPage(currentPage - 1);
    }
}

/* ===== UPDATE PAGE UI ===== */
function updatePageUI() {
    document.getElementById('current-page').textContent = currentPage;
    document.getElementById('page-current').textContent = currentPage;
    document.getElementById('stat-pages').textContent = currentPage;
    document.getElementById('total-pages').textContent = totalPages;
    document.getElementById('page-total').textContent = totalPages;
    document.getElementById('stat-total-pages').textContent = totalPages;
    document.getElementById('page-slider').value = currentPage;
    document.getElementById('page-slider').max = totalPages;

    document.getElementById('btn-prev-page').disabled = currentPage === 1;
    document.getElementById('btn-next-page').disabled = currentPage === totalPages;

    const progress = (currentPage / totalPages) * 100;
    const bar = document.getElementById('progress-bar');
    if (bar) bar.style.width = progress + '%';
}

/* ===== SETUP MATH & CODE ===== */
function setupMathAndCode() {
    const container = document.getElementById('content-container');
    if (!container) return;
    
    if (window.renderMathInElement) {
        try {
            renderMathInElement(container, {
                delimiters: [
                    {left: '$$', right: '$$', display: true},
                    {left: '$', right: '$', display: false},
                    {left: '\\(', right: '\\)', display: false},
                    {left: '\\[', right: '\\]', display: true}
                ],
                throwOnError: false
            });
        } catch (e) {
            console.warn('KaTeX error:', e);
        }
    }

    if (window.Prism && container) {
        Prism.highlightAllUnder(container);
    }
}

/* ===== GENERATE TABLE OF CONTENTS ===== */
function generateTableOfContents() {
    const container = document.getElementById('content-container');
    const headings = container.querySelectorAll('h1, h2, h3');
    const tocList = document.getElementById('toc-list');
    
    if (!tocList) return;
    
    if (!headings.length) {
        tocList.innerHTML = '<li class="toc-placeholder">Không có mục lục</li>';
        return;
    }

    const toc = [];
    headings.forEach((heading, idx) => {
        if (!heading.id) heading.id = `heading-${idx}`;
        
        const level = parseInt(heading.tagName.substring(1));
        toc.push({
            id: heading.id,
            text: heading.textContent,
            level: level
        });
    });

    tocList.innerHTML = toc.map((item, idx) => `
        <li class="toc-level-${item.level}">
            <a href="#${item.id}" class="toc-list ${item.level > 2 ? 'sub' : ''}" onclick="scrollToHeading('${item.id}'); return false;">
                ${escapeHtml(item.text)}
            </a>
        </li>
    `).join('');
}

function scrollToHeading(id) {
    const heading = document.getElementById(id);
    if (heading) {
        const container = document.getElementById('content-container');
        const topOffset = heading.offsetTop - 50;
        container.scrollTop = topOffset;
    }
}

/* ===== STUDY TIMER ===== */
function startStudyTimer() {
    studyStartTime = Date.now();
    timerInterval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - studyStartTime) / 1000);
        const minutes = Math.floor(elapsed / 60);
        const seconds = elapsed % 60;
        const timeStr = String(minutes).padStart(2, '0') + ':' + String(seconds).padStart(2, '0');
        
        const timerEl = document.getElementById('timer-display');
        if (timerEl) timerEl.textContent = timeStr;
        
        const studyEl = document.getElementById('study-time');
        if (studyEl) studyEl.textContent = timeStr;
    }, 1000);
}

/* ===== COMPLETE LESSON ===== */
function completeLesson(lessonId) {
    if (typeof Swal === 'undefined') {
        alert('Bạn chắc chắn muốn hoàn thành bài học này?');
        return fetch(`/api/complete-lesson/${lessonId}`, { method: 'POST' })
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    alert('Thành công!');
                    window.location.reload();
                }
            });
    }

    Swal.fire({
        title: 'Hoàn thành bài học?',
        text: 'Bạn chắc chắn đã hoàn thành bài học này?',
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: 'Có, hoàn thành',
        cancelButtonText: 'Hủy'
    }).then(result => {
        if (result.isConfirmed) {
            fetch(`/api/complete-lesson/${lessonId}`, { method: 'POST' })
                .then(res => res.json())
                .then(data => {
                    if (data.success) {
                        if (typeof confetti !== 'undefined') {
                            confetti({
                                particleCount: 100,
                                spread: 70,
                                origin: { y: 0.6 }
                            });
                        }
                        Swal.fire('Thành công!', 'Bài học đã được hoàn thành.', 'success')
                            .then(() => window.location.reload());
                    }
                })
                .catch(err => {
                    Swal.fire('Lỗi!', 'Có lỗi xảy ra.', 'error');
                });
        }
    });
}

/* ===== COMMENTS ===== */
function openComments() {
    document.getElementById('comments-modal').classList.add('active');
}

function closeComments() {
    document.getElementById('comments-modal').classList.remove('active');
}

function loadComments() {
    const lessonId = window.LESSON_ID;
    if (!lessonId) return;
    
    fetch(`/api/comments/lesson/${lessonId}`)
        .then(res => {
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return res.json();
        })
        .then(data => {
            const commentsList = document.getElementById('comments-list');
            if (commentsList && data.comments && data.comments.length > 0) {
                commentsList.innerHTML = data.comments.map(c => `
                    <div class="comment-item">
                        <div class="comment-author">
                            <img src="${c.user.avatar || '/img/default-avatar.png'}" class="comment-avatar" alt="${c.user.username}">
                            <span>${c.user.username}</span>
                        </div>
                        <div class="comment-content">${escapeHtml(c.text)}</div>
                        <small class="text-muted">${new Date(c.createdAt).toLocaleDateString('vi-VN')}</small>
                    </div>
                `).join('');
                
                const badge = document.getElementById('comment-badge');
                if (badge) {
                    badge.textContent = data.comments.length;
                    badge.style.display = 'flex';
                }
            }
        })
        .catch(err => console.error('Error loading comments:', err));
}

// Setup comment posting
document.addEventListener('DOMContentLoaded', () => {
    const commentInput = document.getElementById('comment-input');
    if (commentInput) {
        commentInput.addEventListener('input', () => {
            const count = commentInput.value.length;
            const charEl = document.getElementById('comment-chars');
            if (charEl) charEl.textContent = count + '/5000';
        });

        const postBtn = document.getElementById('btn-post-comment');
        if (postBtn) {
            postBtn.addEventListener('click', () => {
                const text = commentInput.value.trim();
                if (!text) {
                    alert('Vui lòng nhập bình luận.');
                    return;
                }

                fetch(`/api/comments/lesson/${window.LESSON_ID}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ text })
                })
                    .then(res => {
                        if (!res.ok) throw new Error(`HTTP ${res.status}`);
                        return res.json();
                    })
                    .then(data => {
                        if (data.success) {
                            commentInput.value = '';
                            document.getElementById('comment-chars').textContent = '0/5000';
                            loadComments();
                            alert('Bình luận đã được đăng!');
                        } else {
                            alert('Không thể đăng bình luận.');
                        }
                    })
                    .catch(err => {
                        console.error('Post comment error:', err);
                        alert('Có lỗi khi đăng bình luận.');
                    });
            });
        }
    }
});

/* ===== UTILITIES ===== */
function escapeHtml(text) {
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return String(text).replace(/[&<>"']/g, m => map[m]);
}

function copyCode(btn) {
    const pre = btn.parentElement.nextElementSibling;
    const text = pre.textContent;
    
    navigator.clipboard.writeText(text).then(() => {
        const original = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-check"></i> Đã sao chép';
        setTimeout(() => {
            btn.innerHTML = original;
        }, 2000);
    });
}

function submitQuiz(quizId) {
    alert('Quiz: ' + quizId);
}

function extractYoutubeId(url) {
    const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]+)/);
    return match ? match[1] : '';
}

function toggleSidebar() {
    const sidebar = document.getElementById('sidebar-toc');
    if (sidebar) sidebar.classList.toggle('active');
}

function showError(msg) {
    const container = document.getElementById('content-container');
    if (container) {
        container.innerHTML = `<div style="padding:2rem; text-align:center; color:#dc2626;"><i class="fas fa-exclamation-circle" style="font-size:2rem; margin-bottom:1rem;"></i><p>${escapeHtml(msg)}</p></div>`;
    }
}

/* ===== KEYBOARD SHORTCUTS ===== */
document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey) {
        if (e.key === 'ArrowRight') {
            e.preventDefault();
            nextPage();
        } else if (e.key === 'ArrowLeft') {
            e.preventDefault();
            previousPage();
        }
    }
});
