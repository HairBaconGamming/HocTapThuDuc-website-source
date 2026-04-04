/**
 * LESSON DETAIL COMMENTS - Floating Modal System
 * Handles opening/closing comments modal and displaying comments
 */

class LessonDetailsCommentsSystem {
    constructor() {
        this.isModalOpen = false;
        this.commentCount = 0;
        this.isLoggedIn = document.body.dataset.userId ? true : false;
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.loadComments();
    }

    setupEventListeners() {
        const btnCloseComments = document.getElementById('btn-close-comments');
        const commentsModal = document.getElementById('comments-modal');
        const toggleButtons = Array.from(document.querySelectorAll('[data-comments-toggle], #btn-toggle-comments'));

        toggleButtons.forEach((button) => {
            button.addEventListener('click', () => this.toggleCommentsModal());
        });

        // Close modal
        if (btnCloseComments) {
            btnCloseComments.addEventListener('click', () => this.closeCommentsModal());
        }

        // Close on outside click
        if (commentsModal) {
            commentsModal.addEventListener('click', (e) => {
                if (e.target === commentsModal) {
                    this.closeCommentsModal();
                }
            });
        }

        // Close on ESC key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isModalOpen) {
                this.closeCommentsModal();
            }
        });
    }

    toggleCommentsModal() {
        if (this.isModalOpen) {
            this.closeCommentsModal();
        } else {
            this.openCommentsModal();
        }
    }

    openCommentsModal() {
        const modal = document.getElementById('comments-modal');
        if (modal) {
            if (window.LessonWorkspace && typeof window.LessonWorkspace.setToolsDrawerState === 'function') {
                window.LessonWorkspace.setToolsDrawerState(false);
            }
            if (window.LessonWorkspace && typeof window.LessonWorkspace.closePreviewFullscreen === 'function') {
                window.LessonWorkspace.closePreviewFullscreen();
            }
            modal.classList.remove('hidden');
            this.isModalOpen = true;
            document.body.classList.add('lesson-comments-open');
            if (window.LessonWorkspace && typeof window.LessonWorkspace.syncOverlay === 'function') {
                window.LessonWorkspace.syncOverlay();
            }
        }
    }

    closeCommentsModal() {
        const modal = document.getElementById('comments-modal');
        if (modal) {
            modal.classList.add('hidden');
            this.isModalOpen = false;
            document.body.classList.remove('lesson-comments-open');
            if (window.LessonWorkspace && typeof window.LessonWorkspace.syncOverlay === 'function') {
                window.LessonWorkspace.syncOverlay();
            }
        }
    }

    async loadComments() {
        try {
            const lessonId = window.LESSON_ID;
            if (!lessonId) return;

            const response = await fetch(`/api/comments/lesson/${lessonId}`);
            if (!response.ok) throw new Error('Failed to load comments');

            const data = await response.json();
            
            // Handle API response format with pagination
            const comments = data.comments || data || [];
            const commentsArray = Array.isArray(comments) ? comments : [];
            
            this.commentCount = commentsArray.length;
            this.updateCommentBadge();
            this.renderComments(commentsArray);
        } catch (error) {
            console.error('Error loading comments:', error);
        }
    }

    updateCommentBadge() {
        const badge = document.getElementById('comment-badge');
        const inlineBadge = document.getElementById('comment-badge-inline');
        
        if (this.commentCount > 0) {
            if (badge) badge.style.display = 'flex';
            if (badge) badge.textContent = this.commentCount > 9 ? '9+' : this.commentCount;
            if (inlineBadge) inlineBadge.style.display = 'inline-flex';
            if (inlineBadge) inlineBadge.textContent = this.commentCount > 9 ? '9+' : this.commentCount;
        } else {
            if (badge) badge.style.display = 'none';
            if (inlineBadge) inlineBadge.style.display = 'none';
        }
    }

    renderComments(comments) {
        const modalBody = document.getElementById('comments-modal-body');
        if (!modalBody) return;

        // Ensure comments is an array
        const commentsArray = Array.isArray(comments) ? comments : [];

        if (commentsArray.length === 0) {
            modalBody.innerHTML = '<div class="text-center py-4 text-muted"><p style="font-size: 0.9rem;">📝 Chưa có bình luận nào. Hãy là người đầu tiên!</p></div>';
            return;
        }

        // Sort by likes (descending) and take top 3
        const topComments = commentsArray
            .sort((a, b) => (b.likes || 0) - (a.likes || 0))
            .slice(0, 3);

        let html = '<div class="comments-list">';
        topComments.forEach(comment => {
            html += this.renderSingleComment(comment);
        });
        html += '</div>';

        // Add link to full discussion
        html += `
            <div style="text-align: center; margin-top: 1.5rem; padding-top: 1rem; border-top: 1px solid #e2e8f0;">
                <a href="/lesson/${window.LESSON_ID}/discussion" style="color: #667eea; font-weight: 600; text-decoration: none; display: inline-flex; align-items: center; gap: 6px; font-size: 0.9rem;">
                    <i class="fas fa-comments"></i> Xem tất cả bình luận →
                </a>
            </div>
        `;

        modalBody.innerHTML = html;
    }

    renderSingleComment(comment) {
        const date = new Date(comment.createdAt);
        const timeAgo = this.getTimeAgo(date);
        const avatar = this.getSafeAssetUrl(comment.user?.avatar, '/uploads/default-avatar.png');
        const username = this.escapeHtml(comment.user?.username || 'Anonymous');

        let repliesHtml = '';
        if (comment.replies && comment.replies.length > 0) {
            repliesHtml = this.renderReplies(comment.replies);
        }

        return `
            <div class="comment-item" style="background: white; border: 1px solid #e2e8f0; border-radius: 12px; padding: 1rem; margin-bottom: 1rem;">
                <div class="comment-header">
                    <div class="comment-author">
                        <img src="${avatar}" alt="${username}" class="comment-avatar" style="width: 36px; height: 36px; border-radius: 50%; margin-right: 0.75rem;">
                        <div class="comment-info">
                            <strong style="color: #0f172a; display: block; font-size: 0.95rem;">${username}</strong>
                            <div class="comment-meta" style="color: #64748b; font-size: 0.8rem;">${timeAgo}</div>
                        </div>
                    </div>
                </div>
                <div class="comment-content" style="color: #334155; margin: 0.75rem 0; line-height: 1.5; word-break: break-word;">${this.sanitizeHTML(comment.content)}</div>
                ${repliesHtml}
            </div>
        `;
    }

    renderReplies(replies) {
        let html = '<div style="margin-top: 1rem; padding-left: 1.5rem; border-left: 3px solid #e2e8f0;">';
        replies.forEach(reply => {
            const date = new Date(reply.createdAt);
            const timeAgo = this.getTimeAgo(date);
            const avatar = this.getSafeAssetUrl(reply.user?.avatar, '/uploads/default-avatar.png');
            const username = this.escapeHtml(reply.user?.username || 'Anonymous');

            html += `
                <div class="reply-item" style="margin-bottom: 0.8rem; background: #f8fafc; padding: 0.75rem; border-radius: 8px;">
                    <div style="display: flex; align-items: center; margin-bottom: 0.5rem; gap: 0.5rem;">
                        <img src="${avatar}" alt="${username}" style="width: 28px; height: 28px; border-radius: 50%;">
                        <strong style="color: #0f172a; font-size: 0.9rem;">${username}</strong>
                        <span style="font-size: 0.75rem; color: #94a3b8;">${timeAgo}</span>
                    </div>
                    <div style="color: #334155; font-size: 0.9rem; line-height: 1.4;">${this.sanitizeHTML(reply.content)}</div>
                </div>
            `;
        });
        html += '</div>';
        return html;
    }

    getTimeAgo(date) {
        const now = new Date();
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        if (diffMins < 1) return 'Vừa xong';
        if (diffMins < 60) return `${diffMins} phút trước`;
        if (diffHours < 24) return `${diffHours} giờ trước`;
        if (diffDays < 7) return `${diffDays} ngày trước`;
        
        return date.toLocaleDateString('vi-VN');
    }

    sanitizeHTML(content) {
        const div = document.createElement('div');
        div.textContent = content;
        return div.innerHTML;
    }

    escapeHtml(content) {
        const div = document.createElement('div');
        div.textContent = content || '';
        return div.innerHTML;
    }

    getSafeAssetUrl(value, fallback) {
        if (!value || typeof value !== 'string') return fallback;
        try {
            const resolved = new URL(value, window.location.origin);
            if (['http:', 'https:'].includes(resolved.protocol)) {
                return resolved.toString();
            }
        } catch (e) {}
        return fallback;
    }

    async addComment(content) {
        if (!content.trim()) {
            alert('Vui lòng nhập nội dung bình luận');
            return;
        }

        try {
            const lessonId = window.LESSON_ID;
            const response = await fetch(`/api/comments/lesson/${lessonId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content })
            });

            if (!response.ok) {
                const error = await response.json();
                alert(error.message || error.error || 'Lỗi đăng bình luận');
                return;
            }
            
            this.loadComments();
            this.clearCommentForm();
        } catch (error) {
            console.error('Error posting comment:', error);
            alert('Lỗi khi đăng bình luận');
        }
    }

    clearCommentForm() {
        const textarea = document.getElementById('modal-comment-input');
        if (textarea) {
            textarea.value = '';
            this.updateCharCount();
        }
    }

    updateCharCount() {
        const textarea = document.getElementById('modal-comment-input');
        const charCount = document.getElementById('modal-comment-chars');
        if (textarea && charCount) {
            charCount.textContent = `${textarea.value.length}/5000`;
        }
    }
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    window.lessonsCommentSystem = new LessonDetailsCommentsSystem();
    window.lessonCommentsSystem = window.lessonsCommentSystem;
    
    // Setup comment form in modal footer
    const modalFooter = document.getElementById('comments-modal-footer');
    if (modalFooter) {
        // Check if user is logged in
        const isLoggedIn = !!window.USER;

        if (isLoggedIn) {
            modalFooter.innerHTML = `
                <textarea 
                    id="modal-comment-input" 
                    class="form-control" 
                    placeholder="Viết bình luận của bạn..." 
                    rows="3" 
                    maxlength="5000"
                    style="resize: vertical; border: 1px solid #e2e8f0; border-radius: 8px; padding: 0.75rem; margin-bottom: 0.75rem; font-family: inherit;"></textarea>
                <div style="display: flex; justify-content: space-between; align-items: center; gap: 0.75rem;">
                    <span id="modal-comment-chars" style="font-size: 0.8rem; color: #94a3b8;">0/5000</span>
                    <button id="modal-btn-post" class="btn" style="background: linear-gradient(135deg, #667eea, #764ba2); color: white; border: none; padding: 0.6rem 1.5rem; border-radius: 8px; font-weight: 600; cursor: pointer; font-size: 0.9rem;">
                        <i class="fas fa-paper-plane" style="margin-right: 0.5rem;"></i>Đăng
                    </button>
                </div>
            `;

            // Setup textarea listeners
            const textarea = document.getElementById('modal-comment-input');
            if (textarea) {
                textarea.addEventListener('input', () => {
                    window.lessonsCommentSystem.updateCharCount();
                });
            }

            // Setup post button
            const postBtn = document.getElementById('modal-btn-post');
            if (postBtn) {
                postBtn.addEventListener('click', () => {
                    const content = textarea.value;
                    window.lessonsCommentSystem.addComment(content);
                });

                // Allow Ctrl+Enter to post
                textarea.addEventListener('keydown', (e) => {
                    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                        e.preventDefault();
                        postBtn.click();
                    }
                });
            }
        } else {
            // Show login prompt
            modalFooter.innerHTML = `
                <div style="background: #f0f4ff; border: 1px solid #667eea; border-radius: 8px; padding: 1rem; text-align: center;">
                    <p style="margin: 0 0 0.5rem 0; color: #0f172a; font-weight: 600;">Bạn cần đăng nhập</p>
                    <a href="/login" class="btn" style="background: linear-gradient(135deg, #667eea, #764ba2); color: white; text-decoration: none; padding: 0.6rem 1.5rem; border-radius: 8px; font-weight: 600; display: inline-block;">
                        <i class="fas fa-sign-in-alt" style="margin-right: 0.5rem;"></i>Đăng nhập ngay
                    </a>
                </div>
            `;
        }
    }
});

