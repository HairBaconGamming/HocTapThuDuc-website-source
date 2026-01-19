/**
 * LESSON DETAIL V2 - MODERN PAGINATION ENGINE
 * Tính năng: Phân trang thông minh, TOC động, Timer học
 */

let currentPage = 1;
let totalPages = 1;
const WORDS_PER_PAGE = 400; // Điều chỉnh số từ mỗi trang
let contentPages = [];
let contentData = [];
let studyStartTime = Date.now();
let timerInterval = null;
let lastScrollTop = 0;
let isHeaderHidden = false;

document.addEventListener('DOMContentLoaded', () => {
    // Prevent body scroll
    document.body.style.overflow = 'hidden';
    
    initLessonContent();
    startStudyTimer();
    loadComments();
    setupHeaderAutoHide();
});

/* ===== HEADER AUTO-HIDE ON SCROLL ===== */
function setupHeaderAutoHide() {
    const contentContainer = document.getElementById('content-container');
    const header = document.getElementById('lessonHeader');
    const isMobile = window.innerWidth < 768;
    
    if (!contentContainer || !header) return;
    
    // On mobile, keep header always visible
    if (isMobile) {
        header.classList.remove('hidden');
        header.classList.add('visible');
        return;
    }
    
    // Desktop: Auto-hide on scroll
    contentContainer.addEventListener('scroll', () => {
        const scrollTop = contentContainer.scrollTop;
        const scrollDirection = scrollTop > lastScrollTop ? 'down' : 'up';
        
        if (scrollDirection === 'down' && scrollTop > 100) {
            // Scrolling down - hide header
            if (!isHeaderHidden) {
                header.classList.add('hidden');
                header.classList.remove('visible');
                isHeaderHidden = true;
            }
        } else {
            // Scrolling up or near top - show header
            if (isHeaderHidden) {
                header.classList.remove('hidden');
                header.classList.add('visible');
                isHeaderHidden = false;
            }
        }
        
        lastScrollTop = scrollTop;
    });
    
    // Show header when hovering near top on desktop
    document.addEventListener('mousemove', (e) => {
        if (!isMobile && e.clientY < 30 && isHeaderHidden) {
            header.classList.remove('hidden');
            header.classList.add('visible');
            isHeaderHidden = false;
        }
    });
}

function initLessonContent() {
    const contentArea = document.getElementById('lessonContentArea');
    if (!contentArea) return;

    const rawContent = contentArea.getAttribute('data-content');
    
    let blocks = [];
    try {
        if (rawContent && (rawContent.startsWith('[') || rawContent.startsWith('{'))) {
            blocks = JSON.parse(rawContent);
            if (!Array.isArray(blocks)) blocks = [blocks];
        } else {
            blocks = [{ type: 'text', data: { text: rawContent } }];
        }
    } catch (e) {
        console.error("Lỗi parse nội dung:", e);
        document.getElementById('content-container').innerHTML = '<div class="alert alert-danger">Lỗi định dạng nội dung JSON.</div>';
        return;
    }

    contentData = blocks;
    
    // Tạo các trang từ blocks
    createPages(blocks);
    
    // Render trang đầu tiên
    goToPage(1);
    
    // Post-render processors
    setupMathAndCode();
    generateTableOfContents();
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
            pageContainer.innerHTML = currentPageBlocks.map(b => b).join('');
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
        pageContainer.innerHTML = currentPageBlocks.map(b => b).join('');
        contentPages.push(pageContainer);
    }

    totalPages = contentPages.length || 1;
    
    // Update UI
    document.getElementById('total-pages').textContent = totalPages;
    document.getElementById('page-total').textContent = totalPages;
    document.getElementById('stat-total-pages').textContent = totalPages;
    document.getElementById('page-slider').max = totalPages;
}

/* ===== RENDER SINGLE BLOCK ===== */
function renderSingleBlock(block, idx) {
    if (!block) return '';

    switch (block.type) {
        case 'header':
        case 'heading':
            const level = block.data.level || 2;
            return `<h${level} id="heading-${idx}">${escapeHtml(block.data.text || '')}</h${level}>`;

        case 'paragraph':
        case 'text':
            const text = block.data.text || '';
            const htmlContent = marked.parse(text);
            const sanitized = window.DOMPurify ? DOMPurify.sanitize(htmlContent) : htmlContent;
            return `<p>${sanitized}</p>`;

        case 'image':
            const alt = escapeHtml(block.data.caption || 'Image');
            const src = escapeHtml(block.data.url || '');
            return `<img src="${src}" alt="${alt}" title="${alt}" />`;

        case 'code':
            const lang = block.data.language || 'javascript';
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
            const quoteText = block.data.text || '';
            return `<blockquote>${marked.parse(quoteText)}</blockquote>`;

        case 'list':
            const items = (block.data.items || []).map(item => `<li>${escapeHtml(item)}</li>`).join('');
            const tag = block.data.style === 'ordered' ? 'ol' : 'ul';
            return `<${tag}>${items}</${tag}>`;

        case 'quiz':
            return renderQuiz(block.data, idx);

        default:
            return '';
    }
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
            return (block.data.text || '').split(/\s+/).length;
        default:
            return 50; // Default estimate
    }
}

/* ===== GO TO PAGE ===== */
function goToPage(pageNum) {
    pageNum = parseInt(pageNum);
    
    if (pageNum < 1 || pageNum > totalPages) return;
    
    currentPage = pageNum;
    
    // Update container
    const container = document.getElementById('content-container');
    container.innerHTML = '';
    
    if (contentPages[currentPage - 1]) {
        container.appendChild(contentPages[currentPage - 1].cloneNode(true));
    }
    
    // Scroll to top of content
    setTimeout(() => {
        container.scrollTop = 0;
        // Show header when changing page
        const header = document.getElementById('lessonHeader');
        if (header) {
            header.classList.remove('hidden');
            header.classList.add('visible');
            isHeaderHidden = false;
        }
        setupMathAndCode();
    }, 100);
    
    // Update UI
    updatePageUI();
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
    document.getElementById('page-slider').value = currentPage;

    // Disable buttons
    document.getElementById('btn-prev-page').disabled = currentPage === 1;
    document.getElementById('btn-next-page').disabled = currentPage === totalPages;

    // Update progress
    const progress = (currentPage / totalPages) * 100;
    document.getElementById('progress-bar').style.width = progress + '%';
}

/* ===== SETUP MATH & CODE ===== */
function setupMathAndCode() {
    const container = document.getElementById('content-container');
    
    // Render KaTeX
    if (window.renderMathInElement && container) {
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

    // Highlight code
    if (window.Prism && container) {
        Prism.highlightAllUnder(container);
    }
}

/* ===== GENERATE TABLE OF CONTENTS ===== */
function generateTableOfContents() {
    const container = document.getElementById('content-container');
    const headings = container.querySelectorAll('h1, h2, h3');
    const tocList = document.getElementById('toc-list');
    
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
            <a href="#${item.id}" class="toc-list ${item.level > 2 ? 'sub' : ''}" onclick="scrollToHeading('${item.id}')">
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

/* ===== QUIZ RENDERER ===== */
function renderQuiz(quizData, idx) {
    const questions = quizData.questions || [];
    
    let html = `<div class="quiz-wrapper" data-quiz-id="${idx}">
        <div class="quiz-header">
            <i class="fas fa-tasks"></i> Câu hỏi
        </div>
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

function submitQuiz(quizId) {
    alert('Quiz kiểm tra chức năng. Bạn đã chọn câu trả lời!');
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

/* ===== STUDY TIMER ===== */
function startStudyTimer() {
    studyStartTime = Date.now();
    timerInterval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - studyStartTime) / 1000);
        const minutes = Math.floor(elapsed / 60);
        const seconds = elapsed % 60;
        const timeStr = String(minutes).padStart(2, '0') + ':' + String(seconds).padStart(2, '0');
        
        document.getElementById('timer-display').textContent = timeStr;
        document.getElementById('study-time').textContent = timeStr;
    }, 1000);
}

/* ===== COMPLETE LESSON ===== */
function completeLesson(lessonId) {
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
                        confetti({
                            particleCount: 100,
                            spread: 70,
                            origin: { y: 0.6 }
                        });
                        Swal.fire('Thành công!', 'Bài học đã được hoàn thành.', 'success')
                            .then(() => window.location.reload());
                    }
                })
                .catch(err => {
                    Swal.fire('Lỗi!', 'Có lỗi xảy ra khi hoàn thành bài.', 'error');
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

document.addEventListener('DOMContentLoaded', () => {
    const commentInput = document.getElementById('comment-input');
    if (commentInput) {
        commentInput.addEventListener('input', () => {
            const count = commentInput.value.length;
            document.getElementById('comment-chars').textContent = count + '/5000';
        });

        const postBtn = document.getElementById('btn-post-comment');
        if (postBtn) {
            postBtn.addEventListener('click', () => {
                const text = commentInput.value.trim();
                if (!text) {
                    Swal.fire('Cảnh báo!', 'Vui lòng nhập bình luận.', 'warning');
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
                            Swal.fire('Thành công!', 'Bình luận đã được đăng.', 'success');
                        } else {
                            Swal.fire('Lỗi!', data.message || 'Không thể đăng bình luận.', 'error');
                        }
                    })
                    .catch(err => {
                        console.error('Post comment error:', err);
                        Swal.fire('Lỗi!', 'Có lỗi khi đăng bình luận.', 'error');
                    });
            });
        }
    }
});

/* ===== SIDEBAR TOGGLE (MOBILE) ===== */
function toggleSidebar() {
    const sidebar = document.getElementById('sidebar-toc');
    sidebar.classList.toggle('active');
}

/* ===== UTILITIES ===== */
function escapeHtml(text) {
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, m => map[m]);
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
