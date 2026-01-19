// public/js/comments.js
// Comment System for Lesson Detail

class CommentSystem {
    constructor(lessonId) {
        this.lessonId = lessonId;
        this.currentPage = 1;
        this.pageSize = 10;
        this.totalComments = 0;
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.loadComments();
    }

    setupEventListeners() {
        const postBtn = document.getElementById('btn-post-comment');
        const commentInput = document.getElementById('comment-input');

        if (postBtn) {
            postBtn.addEventListener('click', () => this.postComment());
        }

        if (commentInput) {
            commentInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && e.ctrlKey) {
                    this.postComment();
                }
            });

            commentInput.addEventListener('input', (e) => {
                const charsSpan = document.getElementById('comment-chars');
                if (charsSpan) {
                    charsSpan.textContent = `${e.target.value.length}/5000`;
                }
            });
        }

        const loadMoreBtn = document.getElementById('btn-load-more');
        if (loadMoreBtn) {
            loadMoreBtn.addEventListener('click', () => this.loadMoreComments());
        }
    }

    async loadComments() {
        try {
            const response = await fetch(`/api/comments/lesson/${this.lessonId}?page=1&limit=${this.pageSize}`);
            const data = await response.json();

            if (data.success) {
                this.totalComments = data.pagination.total;
                this.renderComments(data.comments);
                this.updateCommentCount();
                this.setupLoadMoreButton(data.pagination);
            }
        } catch (err) {
            console.error('Load comments error:', err);
        }
    }

    async loadMoreComments() {
        try {
            this.currentPage++;
            const response = await fetch(`/api/comments/lesson/${this.lessonId}?page=${this.currentPage}&limit=${this.pageSize}`);
            const data = await response.json();

            if (data.success) {
                this.appendComments(data.comments);
                this.setupLoadMoreButton(data.pagination);
            }
        } catch (err) {
            console.error('Load more comments error:', err);
        }
    }

    renderComments(comments) {
        const container = document.getElementById('comments-container');
        if (!comments || comments.length === 0) {
            container.innerHTML = '<div class="text-center text-muted py-4">Chưa có bình luận nào. Hãy là người đầu tiên!</div>';
            return;
        }

        container.innerHTML = comments.map(comment => this.renderComment(comment)).join('');
    }

    appendComments(comments) {
        const container = document.getElementById('comments-container');
        comments.forEach(comment => {
            container.innerHTML += this.renderComment(comment);
        });
    }

    renderComment(comment) {
        const user = comment.user;
        const isOwner = window.currentUser && window.currentUser._id === user._id;

        return `
            <div class="comment-item border-bottom py-3" data-comment-id="${comment._id}">
                <div class="d-flex gap-3">
                    <img src="${user.avatar || 'https://via.placeholder.com/40'}" 
                         alt="${user.username}" 
                         class="rounded-circle" 
                         width="40" height="40"
                         onerror="this.src='https://via.placeholder.com/40'">
                    
                    <div class="flex-grow-1">
                        <div class="d-flex justify-content-between align-items-start mb-2">
                            <div>
                                <strong class="text-dark">${user.username}</strong>
                                <span class="text-muted ms-2 small">${this.formatTime(comment.createdAt)}</span>
                                ${comment.isEdited ? '<span class="text-muted ms-2 small">(đã chỉnh sửa)</span>' : ''}
                            </div>
                            ${isOwner ? `
                                <div class="dropdown">
                                    <button class="btn btn-sm btn-light" type="button" data-bs-toggle="dropdown">
                                        <i class="fas fa-ellipsis-v"></i>
                                    </button>
                                    <ul class="dropdown-menu">
                                        <li><a class="dropdown-item" href="#" onclick="commentSystem.editComment('${comment._id}'); return false;">
                                            <i class="fas fa-edit me-2"></i>Chỉnh sửa
                                        </a></li>
                                        <li><hr class="dropdown-divider"></li>
                                        <li><a class="dropdown-item text-danger" href="#" onclick="commentSystem.deleteComment('${comment._id}'); return false;">
                                            <i class="fas fa-trash me-2"></i>Xóa
                                        </a></li>
                                    </ul>
                                </div>
                            ` : ''}
                        </div>
                        
                        <p class="mb-3 text-break">${this.escapeHtml(comment.content)}</p>
                        
                        <div class="d-flex gap-3 small mb-3">
                            <button class="btn btn-sm btn-light comment-like-btn ${comment.likedBy && comment.likedBy.some(id => id === window.currentUser?._id) ? 'active' : ''}" 
                                    onclick="commentSystem.likeComment('${comment._id}')">
                                <i class="fas fa-thumbs-up me-1"></i>
                                <span class="like-count">${comment.likes || 0}</span>
                            </button>
                            <button class="btn btn-sm btn-light" onclick="commentSystem.showReplyForm('${comment._id}')">
                                <i class="fas fa-reply me-1"></i>Trả lời
                            </button>
                        </div>

                        <!-- Replies -->
                        ${comment.replies && comment.replies.length > 0 ? `
                            <div class="replies-container ms-4 mt-3 border-start ps-3">
                                ${comment.replies.map(reply => this.renderReply(comment._id, reply)).join('')}
                            </div>
                        ` : ''}

                        <!-- Reply Form -->
                        <div class="reply-form-container ms-4 mt-3" style="display: none;" data-comment-id="${comment._id}">
                            <div class="input-group input-group-sm">
                                <input type="text" class="form-control reply-input" placeholder="Nhập trả lời..." maxlength="500">
                                <button class="btn btn-primary btn-sm" type="button" onclick="commentSystem.postReply('${comment._id}')">
                                    Gửi
                                </button>
                                <button class="btn btn-light btn-sm" type="button" onclick="commentSystem.cancelReply('${comment._id}')">
                                    Hủy
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    renderReply(commentId, reply) {
        const isOwner = window.currentUser && window.currentUser._id === reply.user._id;

        return `
            <div class="reply-item mb-2 pb-2" data-reply-id="${reply._id}">
                <div class="d-flex gap-2">
                    <img src="${reply.user.avatar || 'https://via.placeholder.com/32'}" 
                         alt="${reply.user.username}" 
                         class="rounded-circle" 
                         width="32" height="32"
                         onerror="this.src='https://via.placeholder.com/32'">
                    
                    <div class="flex-grow-1">
                        <div class="d-flex justify-content-between align-items-start">
                            <div>
                                <strong class="text-dark small">${reply.user.username}</strong>
                                <span class="text-muted ms-2 small">${this.formatTime(reply.createdAt)}</span>
                            </div>
                            ${isOwner ? `
                                <div class="btn-group btn-group-sm">
                                    <button class="btn btn-light" onclick="commentSystem.deleteReply('${commentId}', '${reply._id}')">
                                        <i class="fas fa-trash small"></i>
                                    </button>
                                </div>
                            ` : ''}
                        </div>
                        <p class="mb-1 small text-break">${this.escapeHtml(reply.content)}</p>
                        <div class="small">
                            <button class="btn btn-sm btn-link p-0 reply-like-btn ${reply.likedBy && reply.likedBy.some(id => id === window.currentUser?._id) ? 'active' : ''}" 
                                    onclick="commentSystem.likeReply('${commentId}', '${reply._id}')">
                                <i class="fas fa-thumbs-up me-1"></i>
                                <span class="like-count">${reply.likes || 0}</span>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    async postComment() {
        const input = document.getElementById('comment-input');
        const content = input.value.trim();

        if (!content) {
            alert('Vui lòng nhập nội dung bình luận');
            return;
        }

        try {
            const response = await fetch(`/api/comments/lesson/${this.lessonId}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ content })
            });

            const data = await response.json();

            if (data.success) {
                input.value = '';
                document.getElementById('comment-chars').textContent = '0/5000';
                this.loadComments();
                alert('Bình luận thành công!');
            } else {
                alert(data.message || 'Lỗi khi đăng bình luận');
            }
        } catch (err) {
            console.error('Post comment error:', err);
            alert('Lỗi khi đăng bình luận');
        }
    }

    async deleteComment(commentId) {
        if (!confirm('Bạn có chắc muốn xóa bình luận này?')) return;

        try {
            const response = await fetch(`/api/comments/${commentId}`, {
                method: 'DELETE'
            });

            const data = await response.json();

            if (data.success) {
                this.loadComments();
                alert('Xóa bình luận thành công');
            }
        } catch (err) {
            console.error('Delete comment error:', err);
            alert('Lỗi khi xóa bình luận');
        }
    }

    async likeComment(commentId) {
        try {
            const response = await fetch(`/api/comments/${commentId}/like`, {
                method: 'POST'
            });

            const data = await response.json();

            if (data.success) {
                const btn = document.querySelector(`[data-comment-id="${commentId}"] .comment-like-btn`);
                if (btn) {
                    btn.classList.toggle('active');
                    btn.querySelector('.like-count').textContent = data.likes;
                }
            }
        } catch (err) {
            console.error('Like comment error:', err);
        }
    }

    showReplyForm(commentId) {
        const container = document.querySelector(`[data-comment-id="${commentId}"] .reply-form-container`);
        if (container) {
            container.style.display = 'block';
            container.querySelector('.reply-input').focus();
        }
    }

    cancelReply(commentId) {
        const container = document.querySelector(`[data-comment-id="${commentId}"] .reply-form-container`);
        if (container) {
            container.style.display = 'none';
            container.querySelector('.reply-input').value = '';
        }
    }

    async postReply(commentId) {
        const container = document.querySelector(`[data-comment-id="${commentId}"] .reply-form-container`);
        const input = container.querySelector('.reply-input');
        const content = input.value.trim();

        if (!content) {
            alert('Vui lòng nhập nội dung trả lời');
            return;
        }

        try {
            const response = await fetch(`/api/comments/${commentId}/replies`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ content })
            });

            const data = await response.json();

            if (data.success) {
                this.loadComments();
                alert('Trả lời thành công!');
            }
        } catch (err) {
            console.error('Post reply error:', err);
            alert('Lỗi khi trả lời');
        }
    }

    async deleteReply(commentId, replyId) {
        if (!confirm('Bạn có chắc muốn xóa trả lời này?')) return;

        try {
            const response = await fetch(`/api/comments/${commentId}/replies/${replyId}`, {
                method: 'DELETE'
            });

            const data = await response.json();

            if (data.success) {
                this.loadComments();
                alert('Xóa trả lời thành công');
            }
        } catch (err) {
            console.error('Delete reply error:', err);
            alert('Lỗi khi xóa trả lời');
        }
    }

    async likeReply(commentId, replyId) {
        try {
            const response = await fetch(`/api/comments/${commentId}/replies/${replyId}/like`, {
                method: 'POST'
            });

            const data = await response.json();

            if (data.success) {
                const btn = document.querySelector(`[data-reply-id="${replyId}"] .reply-like-btn`);
                if (btn) {
                    btn.classList.toggle('active');
                    btn.querySelector('.like-count').textContent = data.likes;
                }
            }
        } catch (err) {
            console.error('Like reply error:', err);
        }
    }

    updateCommentCount() {
        const countSpan = document.getElementById('comment-count');
        if (countSpan) {
            countSpan.textContent = this.totalComments;
        }
    }

    setupLoadMoreButton(pagination) {
        const loadMoreBtn = document.getElementById('btn-load-more');
        if (loadMoreBtn) {
            if (pagination.page < pagination.pages) {
                loadMoreBtn.style.display = 'block';
            } else {
                loadMoreBtn.style.display = 'none';
            }
        }
    }

    formatTime(dateString) {
        const date = new Date(dateString);
        const now = new Date();
        const diff = now - date;

        const minutes = Math.floor(diff / 60000);
        const hours = Math.floor(diff / 3600000);
        const days = Math.floor(diff / 86400000);

        if (minutes < 1) return 'vừa xong';
        if (minutes < 60) return `${minutes} phút trước`;
        if (hours < 24) return `${hours} giờ trước`;
        if (days < 7) return `${days} ngày trước`;

        return date.toLocaleDateString('vi-VN');
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    editComment(commentId) {
        alert('Tính năng chỉnh sửa sẽ sớm có');
    }
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', function() {
    const lessonId = window.LESSON_ID;
    if (lessonId) {
        window.commentSystem = new CommentSystem(lessonId);
    }
});
