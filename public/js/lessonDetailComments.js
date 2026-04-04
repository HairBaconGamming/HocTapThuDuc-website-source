class LessonDetailsCommentsSystem {
    constructor() {
        this.isModalOpen = false;
        this.commentCount = 0;
        this.comments = [];
        this.pendingContextAnchor = null;
        this.isLoggedIn = !!document.body.dataset.userId || !!window.USER;
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.renderComposer();
        this.loadComments();
    }

    setupEventListeners() {
        const btnCloseComments = document.getElementById('btn-close-comments');
        const commentsModal = document.getElementById('comments-modal');
        const toggleButtons = Array.from(document.querySelectorAll('[data-comments-toggle], #btn-toggle-comments'));

        toggleButtons.forEach((button) => {
            button.addEventListener('click', () => this.toggleCommentsModal());
        });

        if (btnCloseComments) {
            btnCloseComments.addEventListener('click', () => this.closeCommentsModal());
        }

        if (commentsModal) {
            commentsModal.addEventListener('click', (event) => {
                if (event.target.matches('[data-comment-jump]')) {
                    const payload = event.target.getAttribute('data-comment-jump');
                    this.jumpToContext(payload);
                    return;
                }

                if (event.target.matches('[data-clear-comment-context]')) {
                    this.clearPendingContext();
                    return;
                }

                if (event.target === commentsModal) {
                    this.closeCommentsModal();
                }
            });
        }

        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape' && this.isModalOpen) {
                this.closeCommentsModal();
            }
        });
    }

    toggleCommentsModal() {
        if (this.isModalOpen) this.closeCommentsModal();
        else this.openCommentsModal();
    }

    openCommentsModal(options = {}) {
        const modal = document.getElementById('comments-modal');
        if (!modal) return;

        if (window.LessonWorkspace && typeof window.LessonWorkspace.setToolsDrawerState === 'function') {
            window.LessonWorkspace.setToolsDrawerState(false);
        }
        if (window.LessonWorkspace && typeof window.LessonWorkspace.closePreviewFullscreen === 'function') {
            window.LessonWorkspace.closePreviewFullscreen();
        }
        if (window.LessonWorkspace && typeof window.LessonWorkspace.closeFabMenu === 'function') {
            window.LessonWorkspace.closeFabMenu();
        }

        modal.classList.remove('hidden');
        this.isModalOpen = true;
        document.body.classList.add('lesson-comments-open');
        if (window.LessonWorkspace && typeof window.LessonWorkspace.syncOverlay === 'function') {
            window.LessonWorkspace.syncOverlay();
        }

        if (options.focusComposer) {
            window.setTimeout(() => {
                document.getElementById('modal-comment-input')?.focus();
            }, 50);
        }
    }

    closeCommentsModal() {
        const modal = document.getElementById('comments-modal');
        if (!modal) return;

        modal.classList.add('hidden');
        this.isModalOpen = false;
        document.body.classList.remove('lesson-comments-open');
        if (window.LessonWorkspace && typeof window.LessonWorkspace.syncOverlay === 'function') {
            window.LessonWorkspace.syncOverlay();
        }
    }

    setPendingContext(anchor) {
        this.pendingContextAnchor = anchor || null;
        this.renderComposer();
        this.openCommentsModal({ focusComposer: true });
    }

    clearPendingContext() {
        this.pendingContextAnchor = null;
        this.renderComposer();
    }

    async loadComments() {
        try {
            const lessonId = window.LESSON_ID;
            if (!lessonId) return;

            const response = await fetch(`/api/comments/lesson/${lessonId}`);
            if (!response.ok) throw new Error('Failed to load comments');

            const data = await response.json();
            const comments = Array.isArray(data.comments) ? data.comments : [];
            this.comments = comments;
            this.commentCount = comments.length;
            this.updateCommentBadge();
            this.renderComments(comments);
        } catch (error) {
            console.error('Error loading comments:', error);
        }
    }

    updateCommentBadge() {
        const values = [this.commentCount > 9 ? '9+' : String(this.commentCount)];
        ['comment-badge', 'comment-badge-inline', 'comment-badge-desktop'].forEach((id) => {
            const badge = document.getElementById(id);
            if (!badge) return;
            if (this.commentCount > 0) {
                badge.style.display = id === 'comment-badge-inline' ? 'inline-flex' : 'flex';
                badge.textContent = values[0];
            } else {
                badge.style.display = 'none';
            }
        });
    }

    renderComments(comments) {
        const modalBody = document.getElementById('comments-modal-body');
        if (!modalBody) return;
        modalBody.innerHTML = '';

        if (!Array.isArray(comments) || comments.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'lesson-inline-empty comments-empty';
            empty.textContent = 'Chưa có bình luận nào. Hãy là người đầu tiên mở cuộc thảo luận.';
            modalBody.appendChild(empty);
            return;
        }

        const list = document.createElement('div');
        list.className = 'comments-list';

        comments
            .slice()
            .sort((a, b) => (b.likes || 0) - (a.likes || 0))
            .slice(0, 6)
            .forEach((comment) => list.appendChild(this.buildCommentNode(comment)));

        modalBody.appendChild(list);

        const footerLink = document.createElement('div');
        footerLink.className = 'comments-summary-link';
        const link = document.createElement('a');
        link.href = `/lesson/${window.LESSON_ID}/discussion`;
        link.textContent = 'Xem tất cả bình luận →';
        footerLink.appendChild(link);
        modalBody.appendChild(footerLink);
    }

    buildCommentNode(comment) {
        const item = document.createElement('article');
        item.className = 'comment-item';

        const header = document.createElement('div');
        header.className = 'comment-header';

        const author = document.createElement('div');
        author.className = 'comment-author';

        const avatar = document.createElement('img');
        avatar.className = 'comment-avatar';
        avatar.src = this.getSafeAssetUrl(comment.user?.avatar, '/uploads/default-avatar.png');
        avatar.alt = comment.user?.username || 'Người dùng';
        author.appendChild(avatar);

        const info = document.createElement('div');
        info.className = 'comment-info';
        const username = document.createElement('strong');
        username.textContent = comment.user?.username || 'Anonymous';
        const meta = document.createElement('div');
        meta.className = 'comment-meta';
        meta.textContent = this.getTimeAgo(new Date(comment.createdAt));
        info.appendChild(username);
        info.appendChild(meta);
        author.appendChild(info);
        header.appendChild(author);
        item.appendChild(header);

        if (comment.contextAnchor?.selectedText) {
            item.appendChild(this.buildContextSnippet(comment.contextAnchor));
        }

        const content = document.createElement('div');
        content.className = 'comment-content';
        content.textContent = comment.content;
        item.appendChild(content);

        if (Array.isArray(comment.replies) && comment.replies.length > 0) {
            const replies = document.createElement('div');
            replies.className = 'comment-replies';
            comment.replies.forEach((reply) => replies.appendChild(this.buildReplyNode(reply)));
            item.appendChild(replies);
        }

        return item;
    }

    buildReplyNode(reply) {
        const wrapper = document.createElement('div');
        wrapper.className = 'reply-item';

        const top = document.createElement('div');
        top.className = 'reply-meta';

        const avatar = document.createElement('img');
        avatar.src = this.getSafeAssetUrl(reply.user?.avatar, '/uploads/default-avatar.png');
        avatar.alt = reply.user?.username || 'Người dùng';
        top.appendChild(avatar);

        const name = document.createElement('strong');
        name.textContent = reply.user?.username || 'Anonymous';
        top.appendChild(name);

        const time = document.createElement('span');
        time.textContent = this.getTimeAgo(new Date(reply.createdAt));
        top.appendChild(time);
        wrapper.appendChild(top);

        const content = document.createElement('div');
        content.className = 'reply-content';
        content.textContent = reply.content;
        wrapper.appendChild(content);
        return wrapper;
    }

    buildContextSnippet(anchor) {
        const wrapper = document.createElement('button');
        wrapper.type = 'button';
        wrapper.className = 'comment-context-snippet';
        wrapper.setAttribute('data-comment-jump', JSON.stringify(anchor));

        const kicker = document.createElement('span');
        kicker.className = 'comment-context-kicker';
        kicker.textContent = 'Hỏi theo ngữ cảnh';

        const quote = document.createElement('strong');
        quote.textContent = anchor.selectedText;

        wrapper.appendChild(kicker);
        wrapper.appendChild(quote);
        return wrapper;
    }

    renderComposer() {
        const modalFooter = document.getElementById('comments-modal-footer');
        if (!modalFooter) return;
        modalFooter.innerHTML = '';

        if (!this.isLoggedIn) {
            const prompt = document.createElement('div');
            prompt.className = 'comments-login-prompt';
            const title = document.createElement('p');
            title.textContent = 'Bạn cần đăng nhập để tham gia thảo luận.';
            const link = document.createElement('a');
            link.href = '/login';
            link.textContent = 'Đăng nhập ngay';
            prompt.appendChild(title);
            prompt.appendChild(link);
            modalFooter.appendChild(prompt);
            return;
        }

        if (this.pendingContextAnchor?.selectedText) {
            const contextBox = document.createElement('div');
            contextBox.className = 'comment-composer-context';

            const copy = document.createElement('div');
            copy.className = 'comment-composer-context-copy';
            const label = document.createElement('span');
            label.textContent = 'Đang hỏi về đoạn này';
            const quote = document.createElement('strong');
            quote.textContent = this.pendingContextAnchor.selectedText;
            copy.appendChild(label);
            copy.appendChild(quote);

            const clearBtn = document.createElement('button');
            clearBtn.type = 'button';
            clearBtn.className = 'comment-context-clear';
            clearBtn.setAttribute('data-clear-comment-context', 'true');
            clearBtn.textContent = 'Bỏ đoạn trích';

            contextBox.appendChild(copy);
            contextBox.appendChild(clearBtn);
            modalFooter.appendChild(contextBox);
        }

        const textarea = document.createElement('textarea');
        textarea.id = 'modal-comment-input';
        textarea.className = 'modal-comment-input';
        textarea.placeholder = this.pendingContextAnchor
            ? 'Viết câu hỏi hoặc điều bạn chưa hiểu về đoạn vừa chọn...'
            : 'Viết bình luận của bạn...';
        textarea.rows = 3;
        textarea.maxLength = 5000;
        textarea.addEventListener('input', () => this.updateCharCount());
        textarea.addEventListener('keydown', (event) => {
            if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
                event.preventDefault();
                this.addComment(textarea.value);
            }
        });
        modalFooter.appendChild(textarea);

        const actions = document.createElement('div');
        actions.className = 'comments-composer-actions';

        const charCount = document.createElement('span');
        charCount.id = 'modal-comment-chars';
        charCount.className = 'comment-char-count';
        charCount.textContent = '0/5000';

        const button = document.createElement('button');
        button.type = 'button';
        button.id = 'modal-btn-post';
        button.className = 'comment-submit-button';
        button.innerHTML = '<i class="fas fa-paper-plane"></i><span>Đăng</span>';
        button.addEventListener('click', () => this.addComment(textarea.value));

        actions.appendChild(charCount);
        actions.appendChild(button);
        modalFooter.appendChild(actions);
    }

    updateCharCount() {
        const textarea = document.getElementById('modal-comment-input');
        const charCount = document.getElementById('modal-comment-chars');
        if (textarea && charCount) {
            charCount.textContent = `${textarea.value.length}/5000`;
        }
    }

    async addComment(content) {
        const cleanContent = String(content || '').trim();
        if (!cleanContent) {
            window.alert('Vui lòng nhập nội dung bình luận');
            return;
        }

        try {
            const lessonId = window.LESSON_ID;
            const response = await fetch(`/api/comments/lesson/${lessonId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    content: cleanContent,
                    contextAnchor: this.pendingContextAnchor
                })
            });

            const data = await response.json();
            if (!response.ok) {
                window.alert(data.message || data.error || 'Lỗi đăng bình luận');
                return;
            }

            this.clearCommentForm();
            this.clearPendingContext();
            await this.loadComments();
        } catch (error) {
            console.error('Error posting comment:', error);
            window.alert('Lỗi khi đăng bình luận');
        }
    }

    clearCommentForm() {
        const textarea = document.getElementById('modal-comment-input');
        if (textarea) {
            textarea.value = '';
            this.updateCharCount();
        }
    }

    jumpToContext(payload) {
        if (!payload) return;
        try {
            const anchor = typeof payload === 'string' ? JSON.parse(payload) : payload;
            if (window.lessonActiveLearning && typeof window.lessonActiveLearning.focusContextAnchor === 'function') {
                window.lessonActiveLearning.focusContextAnchor(anchor);
            }
            this.closeCommentsModal();
        } catch (error) {
            console.error('Jump to context error:', error);
        }
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

    getSafeAssetUrl(value, fallback) {
        if (!value || typeof value !== 'string') return fallback;
        try {
            const resolved = new URL(value, window.location.origin);
            if (['http:', 'https:'].includes(resolved.protocol)) {
                return resolved.toString();
            }
        } catch (error) {}
        return fallback;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.lessonsCommentSystem = new LessonDetailsCommentsSystem();
    window.lessonCommentsSystem = window.lessonsCommentSystem;
});
