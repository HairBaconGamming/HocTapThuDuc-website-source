/**
 * discussion.js - Fixed Like Logic
 * Quản lý logic cho trang Thảo luận bài học
 */

class DiscussionSystem {
    constructor() {
        this.lessonId = window.LESSON_ID;
        // Lấy thông tin user từ EJS (đã stringify)
        this.currentUser = window.USER; 
        this.authorUsername = window.AUTHOR_USERNAME; 
        
        this.commentsListEl = document.getElementById('comments-list');
        this.totalCountEl = document.getElementById('total-count');
        this.commentInput = document.getElementById('comment-text');
        this.charCountEl = document.getElementById('char-count');
        
        this.init();
    }

    init() {
        this.loadComments();
        
        if(this.commentInput) {
            this.commentInput.addEventListener('input', (e) => {
                if(this.charCountEl) this.charCountEl.textContent = e.target.value.length;
            });
        }
    }

    // --- HELPER QUAN TRỌNG: CHECK LIKE ---
    // Xử lý cả trường hợp likedBy là mảng ID (String) hoặc mảng User (Object)
    checkIsLiked(likedByArray) {
        if (!this.currentUser || !likedByArray || !Array.isArray(likedByArray)) return false;
        
        const currentUserId = this.currentUser.id; // ID từ session user

        return likedByArray.some(item => {
            // Trường hợp 1: Item là String (ID) - Thường gặp ở Reply
            if (typeof item === 'string') {
                return item === currentUserId;
            }
            // Trường hợp 2: Item là Object (User populate) - Thường gặp ở Comment
            if (typeof item === 'object' && item !== null) {
                return item._id === currentUserId || item.id === currentUserId;
            }
            return false;
        });
    }

    // --- API CALLS ---

    async loadComments(silent = false) {
        if(!silent && this.commentsListEl) {
            this.commentsListEl.innerHTML = '<div class="loading-state"><div class="spinner"></div><div class="loading-text">Đang tải thảo luận...</div></div>';
        }
        
        try {
            const res = await fetch(`/api/comments/lesson/${this.lessonId}`);
            if (!res.ok) throw new Error('Failed to load');
            
            const data = await res.json();
            const comments = data.comments || [];
            
            if(this.totalCountEl) this.totalCountEl.textContent = comments.length;
            this.renderComments(comments);

        } catch (error) {
            console.error(error);
            if(!silent && this.commentsListEl) this.commentsListEl.innerHTML = '<div class="empty-state">Lỗi tải dữ liệu. Vui lòng tải lại trang.</div>';
        }
    }

    async submitComment() {
        if (!this.checkLogin()) return;

        const text = this.commentInput.value.trim();
        if (!text) return alert('Vui lòng nhập nội dung!');

        const btn = document.getElementById('btn-submit');
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

        try {
            const res = await fetch(`/api/comments/lesson/${this.lessonId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content: text })
            });
            
            if (!res.ok) throw new Error('Failed');

            this.commentInput.value = '';
            if(this.charCountEl) this.charCountEl.textContent = '0';
            
            await this.loadComments(true);

        } catch (error) {
            alert('Có lỗi xảy ra khi gửi bình luận.');
        } finally {
            btn.disabled = false;
            btn.innerHTML = 'Gửi bình luận';
        }
    }

    async submitReply(commentId) {
        if (!this.checkLogin()) return;

        const input = document.getElementById(`reply-input-${commentId}`);
        const text = input.value.trim();
        if (!text) return alert('Vui lòng nhập nội dung trả lời!');

        const btn = document.getElementById(`btn-reply-send-${commentId}`);
        const originalText = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

        try {
            const res = await fetch(`/api/comments/${commentId}/replies`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content: text })
            });

            if (!res.ok) throw new Error('Failed');

            await this.loadComments(true); 

        } catch (e) {
            alert('Lỗi gửi phản hồi.');
        } finally {
            btn.disabled = false;
            btn.innerHTML = originalText;
        }
    }

    async toggleLike(type, id, parentId = null) {
        if (!this.checkLogin()) return;

        const btnId = type === 'comment' ? `btn-like-${id}` : `btn-like-reply-${id}`;
        const btn = document.getElementById(btnId);
        const countSpan = btn.querySelector('span');
        
        const isLiked = btn.classList.contains('liked');
        let count = parseInt(countSpan.textContent) || 0;

        // Optimistic UI Update
        if(isLiked) {
            btn.classList.remove('liked');
            btn.querySelector('i').className = 'far fa-heart'; // Icon rỗng
            countSpan.textContent = Math.max(0, count - 1);
        } else {
            btn.classList.add('liked');
            btn.querySelector('i').className = 'fas fa-heart'; // Icon đặc
            btn.classList.add('animate__animated', 'animate__heartBeat');
            setTimeout(() => btn.classList.remove('animate__animated', 'animate__heartBeat'), 1000);
            countSpan.textContent = count + 1;
        }

        try {
            const endpoint = type === 'comment' 
                ? `/api/comments/${id}/like` 
                : `/api/comments/${parentId}/replies/${id}/like`;
            
            const res = await fetch(endpoint, { method: 'POST' });
            if(!res.ok) throw new Error('Like failed');
            
            const data = await res.json();
            // Sync chuẩn xác từ server
            countSpan.textContent = data.likes; 
            
            // Fix lại UI nếu server trả về trạng thái khác dự đoán (rất hiếm)
            if (data.isLiked) {
                btn.classList.add('liked');
                btn.querySelector('i').className = 'fas fa-heart';
            } else {
                btn.classList.remove('liked');
                btn.querySelector('i').className = 'far fa-heart';
            }

        } catch (e) {
            console.error('Like error', e);
            // Revert UI nếu lỗi mạng
            if(isLiked) {
                btn.classList.add('liked');
                btn.querySelector('i').className = 'fas fa-heart';
                countSpan.textContent = count;
            } else {
                btn.classList.remove('liked');
                btn.querySelector('i').className = 'far fa-heart';
                countSpan.textContent = count;
            }
        }
    }

    // --- RENDER UI ---

    renderComments(comments) {
        if (!this.commentsListEl) return;

        if (comments.length === 0) {
            this.commentsListEl.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">💭</div>
                    <p>Chưa có bình luận nào. Hãy là người đầu tiên!</p>
                </div>`;
            return;
        }

        let html = '';
        comments.forEach(c => {
            html += this.buildCommentHTML(c);
        });
        this.commentsListEl.innerHTML = html;
    }

    buildCommentHTML(comment) {
        const timeAgo = this.getTimeAgo(comment.createdAt);
        const commentAuraClass = this.getGuildAuraClass(comment.user?.guildAura);
        const commentAuraBadge = comment.user?.guildAura?.title
            ? `<span class="comment-guild-aura-inline ${commentAuraClass}">${comment.user.guildAura.icon || '✨'} ${this.escapeHtml(comment.user.guildAura.title)}</span>`
            : '';
        
        // [FIXED] Dùng hàm checkIsLiked thay vì .includes()
        const isLiked = this.checkIsLiked(comment.likedBy);
        
        const likeClass = isLiked ? 'liked' : '';
        const likeIcon = isLiked ? 'fas' : 'far';
        
        const authorBadge = comment.user?.username === this.authorUsername 
            ? '<span class="comment-badge">Tác giả</span>' : '';

        // Render Replies
        let repliesHtml = '';
        if (comment.replies && comment.replies.length > 0) {
            repliesHtml = '<div class="replies-section">';
            comment.replies.forEach(r => {
                // [FIXED] Check like cho reply
                const rLiked = this.checkIsLiked(r.likedBy);
                const rLikeClass = rLiked ? 'liked' : '';
                const rLikeIcon = rLiked ? 'fas' : 'far';
                const replyAuraClass = this.getGuildAuraClass(r.user?.guildAura);
                const replyAuraIcon = r.user?.guildAura?.icon
                    ? `<span class="comment-guild-aura-icon ${replyAuraClass}">${this.escapeHtml(r.user.guildAura.icon)}</span>`
                    : '';

                repliesHtml += `
                    <div class="reply">
                        <img src="${r.user?.avatar || '/uploads/default-avatar.png'}" class="reply-avatar ${replyAuraClass}">
                        <div class="reply-content">
                            <div class="reply-header">
                                <span class="reply-author">${this.escapeHtml(r.user?.username || 'Ẩn danh')}</span>
                                ${replyAuraIcon}
                                ${r.user?.username === this.authorUsername ? '<span class="comment-badge" style="font-size:0.6rem">Tác giả</span>' : ''}
                                <span class="reply-time">${this.getTimeAgo(r.createdAt)}</span>
                            </div>
                            <div class="reply-text">${this.escapeHtml(r.content)}</div>
                            <div class="comment-actions mt-1">
                                <button id="btn-like-reply-${r._id}" class="action-btn ${rLikeClass}" onclick="discussion.toggleLike('reply', '${r._id}', '${comment._id}')">
                                    <i class="${rLikeIcon} fa-heart"></i> <span>${r.likes || 0}</span>
                                </button>
                            </div>
                        </div>
                    </div>`;
            });
            repliesHtml += '</div>';
        }

        return `
            <div class="comment" id="comment-${comment._id}">
                <img src="${comment.user?.avatar || '/uploads/default-avatar.png'}" class="comment-avatar ${commentAuraClass}">
                <div class="comment-content">
                    <div class="comment-header">
                        <span class="comment-author">${this.escapeHtml(comment.user?.username || 'Ẩn danh')}</span>
                        ${commentAuraBadge}
                        ${authorBadge}
                        <span class="comment-time">${timeAgo}</span>
                    </div>
                    <div class="comment-text">${this.escapeHtml(comment.content)}</div>
                    
                    <div class="comment-actions">
                        <button id="btn-like-${comment._id}" class="action-btn ${likeClass}" onclick="discussion.toggleLike('comment', '${comment._id}')">
                            <i class="${likeIcon} fa-heart"></i> <span>${comment.likes || 0}</span>
                        </button>
                        <button class="action-btn" onclick="discussion.toggleReplyForm('${comment._id}')">
                            <i class="fas fa-reply"></i> Trả lời
                        </button>
                    </div>

                    <div id="reply-form-${comment._id}" class="reply-form-container">
                        <div class="reply-input-group">
                            <textarea id="reply-input-${comment._id}" class="reply-input" placeholder="Viết phản hồi của bạn..."></textarea>
                            <button id="btn-reply-send-${comment._id}" class="btn-send-reply" onclick="discussion.submitReply('${comment._id}')">Gửi</button>
                            <button class="btn-cancel-reply" onclick="discussion.toggleReplyForm('${comment._id}')">Huỷ</button>
                        </div>
                    </div>

                    ${repliesHtml}
                </div>
            </div>`;
    }

    toggleReplyForm(commentId) {
        if (!this.checkLogin()) return;
        const form = document.getElementById(`reply-form-${commentId}`);
        const input = document.getElementById(`reply-input-${commentId}`);
        
        if (form.classList.contains('active')) {
            form.classList.remove('active');
        } else {
            document.querySelectorAll('.reply-form-container.active').forEach(el => el.classList.remove('active'));
            form.classList.add('active');
            input.focus();
        }
    }

    checkLogin() {
        if (!this.currentUser) {
            Swal.fire({
                icon: 'info',
                title: 'Yêu cầu đăng nhập',
                text: 'Bạn cần đăng nhập để thực hiện hành động này.',
                confirmButtonText: 'Đăng nhập ngay',
                showCancelButton: true,
                cancelButtonText: 'Đóng'
            }).then((result) => {
                if (result.isConfirmed) window.location.href = '/login';
            });
            return false;
        }
        return true;
    }

    getTimeAgo(dateString) {
        const diffMs = new Date() - new Date(dateString);
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        if (diffMins < 1) return 'Vừa xong';
        if (diffMins < 60) return `${diffMins} phút trước`;
        if (diffHours < 24) return `${diffHours} giờ trước`;
        if (diffDays < 7) return `${diffDays} ngày trước`;
        return new Date(dateString).toLocaleDateString('vi-VN');
    }

    escapeHtml(text) {
        if (!text) return '';
        return text.replace(/&/g, "&amp;")
                   .replace(/</g, "&lt;")
                   .replace(/>/g, "&gt;")
                   .replace(/"/g, "&quot;")
                   .replace(/'/g, "&#039;");
    }

    getGuildAuraClass(guildAura) {
        if (!guildAura?.aura) return '';
        return `guild-aura-${guildAura.aura}`;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.discussion = new DiscussionSystem();
});
