(() => {
    'use strict';

    // ==========================================
    // 1. CORE UTILITIES (Fetch, Toast, UI States)
    // ==========================================

    const showToast = (message, isError = false) => {
        let toast = document.getElementById('qaToast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'qaToast';
            toast.className = 'qa-toast';
            document.body.appendChild(toast);
        }

        // UI Toast theo phong cách Glassmorphism
        const icon = isError ? '<i class="fas fa-exclamation-circle"></i>' : '<i class="fas fa-check-circle"></i>';
        toast.innerHTML = `<div style="display: flex; align-items: center; gap: 10px;">
                                <span style="color: ${isError ? '#ef4444' : '#10b981'}; font-size: 1.2rem;">${icon}</span>
                                <span style="font-weight: 600;">${message}</span>
                           </div>`;
        
        toast.style.background = isError ? 'rgba(69, 10, 10, 0.95)' : 'rgba(15, 23, 42, 0.95)';
        toast.style.backdropFilter = 'blur(12px)';
        toast.style.border = `1px solid ${isError ? 'rgba(239, 68, 68, 0.3)' : 'rgba(255,255,255,0.1)'}`;
        
        toast.classList.add('is-visible');
        
        clearTimeout(showToast._timer);
        showToast._timer = setTimeout(() => {
            toast.classList.remove('is-visible');
        }, 3000);
    };

    // Nâng cấp Fetch API với Async/Await cho code sạch hơn
    const request = async (url, payload = {}) => {
        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'X-Requested-With': 'XMLHttpRequest'
                },
                body: JSON.stringify(payload)
            });

            const data = await response.json().catch(() => ({ success: false, error: 'Phản hồi không hợp lệ từ máy chủ.' }));
            
            if (!response.ok || data.success === false) {
                throw new Error(data.error || 'Không thể xử lý yêu cầu.');
            }
            return data;
        } catch (error) {
            throw error;
        }
    };

    // Hàm tạo hiệu ứng loading cho nút bấm (Rất quan trọng cho Mobile UX)
    const toggleButtonLoading = (button, isLoading) => {
        if (!button) return;
        if (isLoading) {
            button.disabled = true;
            button.dataset.originalHtml = button.innerHTML;
            button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang xử lý...';
            button.style.opacity = '0.8';
        } else {
            button.disabled = false;
            button.innerHTML = button.dataset.originalHtml || button.innerHTML;
            button.style.opacity = '1';
        }
    };


    // ==========================================
    // 2. DOM INITIALIZATION FUNCTIONS
    // ==========================================

    const formatRelativeTimes = () => {
        const formatter = new Intl.RelativeTimeFormat('vi', { numeric: 'auto' });
        const now = Date.now();
        
        document.querySelectorAll('[data-relative-time]').forEach(node => {
            const value = node.getAttribute('datetime') || node.dataset.relativeTime;
            const time = value ? new Date(value).getTime() : NaN;
            if (!Number.isFinite(time)) return;
            
            const diffMinutes = Math.round((time - now) / 60000);
            let text = '';
            
            if (Math.abs(diffMinutes) < 60) {
                text = formatter.format(diffMinutes, 'minute');
            } else {
                const diffHours = Math.round(diffMinutes / 60);
                if (Math.abs(diffHours) < 24) {
                    text = formatter.format(diffHours, 'hour');
                } else {
                    const diffDays = Math.round(diffHours / 24);
                    text = formatter.format(diffDays, 'day');
                }
            }
            node.textContent = text;
        });
    };

    const initSegments = () => {
        document.querySelectorAll('[data-segment]').forEach(segment => {
            const buttons = segment.querySelectorAll('[data-segment-button]');
            const panels = segment.parentElement.querySelectorAll('[data-segment-panel]');
            
            buttons.forEach(button => {
                button.addEventListener('click', () => {
                    const target = button.dataset.segmentButton;
                    buttons.forEach(btn => btn.classList.toggle('is-active', btn === button));
                    panels.forEach(panel => panel.classList.toggle('is-active', panel.dataset.segmentPanel === target));
                });
            });
        });
    };

    const initModals = () => {
        document.querySelectorAll('[data-open-modal]').forEach(trigger => {
            trigger.addEventListener('click', () => {
                const modal = document.querySelector(`[data-modal="${trigger.dataset.openModal}"]`);
                if (modal) modal.classList.add('is-open');
            });
        });

        document.querySelectorAll('[data-close-modal]').forEach(trigger => {
            trigger.addEventListener('click', () => {
                const modal = trigger.closest('.qa-modal');
                if (modal) modal.classList.remove('is-open');
            });
        });

        document.querySelectorAll('.qa-modal').forEach(modal => {
            modal.addEventListener('click', event => {
                if (event.target === modal) modal.classList.remove('is-open');
            });
        });

        document.addEventListener('keydown', event => {
            if (event.key === 'Escape') {
                document.querySelectorAll('.qa-modal.is-open').forEach(modal => modal.classList.remove('is-open'));
            }
        });
    };


    // ==========================================
    // 3. FORM SUBMISSIONS & ACTIONS
    // ==========================================

    const initForms = () => {
        // Form Đặt câu hỏi
        const questionForm = document.getElementById('qaQuestionForm');
        if (questionForm) {
            questionForm.addEventListener('submit', async (event) => {
                event.preventDefault();
                const submitButton = questionForm.querySelector('[type="submit"]');
                toggleButtonLoading(submitButton, true);

                try {
                    const data = await request('/qa/questions', {
                        title: questionForm.title.value,
                        subject: questionForm.subject.value,
                        grade: questionForm.grade.value,
                        bountyAmount: questionForm.bountyAmount.value,
                        images: questionForm.images.value,
                        content: questionForm.content.value
                    });
                    showToast('Đã treo câu hỏi lên Bảng Cầu Cứu.');
                    window.location.href = data.redirectUrl || '/qa';
                } catch (error) {
                    showToast(error.message, true);
                    toggleButtonLoading(submitButton, false);
                }
            });
        }

        // Form Viết lời giải
        const answerForm = document.getElementById('qaAnswerForm');
        if (answerForm) {
            answerForm.addEventListener('submit', async (event) => {
                event.preventDefault();
                const submitButton = answerForm.querySelector('[type="submit"]');
                toggleButtonLoading(submitButton, true);

                try {
                    const data = await request('/qa/answers', {
                        questionId: answerForm.questionId.value,
                        content: answerForm.content.value
                    });
                    showToast('Lời giải xuất sắc đã được gửi.');
                    window.location.href = data.redirectUrl || window.location.href;
                } catch (error) {
                    showToast(error.message, true);
                    toggleButtonLoading(submitButton, false);
                }
            });
        }

        // Form Bình luận thảo luận
        document.querySelectorAll('.qa-comment-form').forEach(form => {
            form.addEventListener('submit', async (event) => {
                event.preventDefault();
                const answerId = form.dataset.answerId;
                const textarea = form.querySelector('textarea');
                const submitButton = form.querySelector('[type="submit"]');
                
                if (!answerId || !textarea) return;
                toggleButtonLoading(submitButton, true);

                try {
                    const data = await request(`/qa/answers/${answerId}/comments`, { content: textarea.value });
                    showToast('Đã thêm bình luận.');
                    window.location.href = data.redirectUrl || window.location.href;
                } catch (error) {
                    showToast(error.message, true);
                    toggleButtonLoading(submitButton, false);
                }
            });
        });
    };

    const initActionButtons = () => {
        document.addEventListener('click', async (event) => {
            const button = event.target.closest('.qa-upvote-btn, .qa-accept-btn');
            if (!button) return;
            
            event.preventDefault();
            const url = button.dataset.actionUrl;
            if (!url) return;
            
            toggleButtonLoading(button, true);

            try {
                const data = await request(url, {});
                showToast(button.classList.contains('qa-accept-btn') ? 'Tuyệt vời! Đã chốt đáp án.' : 'Đã cập nhật upvote.');
                window.location.href = data.redirectUrl || window.location.href;
            } catch (error) {
                showToast(error.message, true);
                toggleButtonLoading(button, false);
            }
        });
    };

    const initInteractions = () => {
        // Toggle Comments
        document.querySelectorAll('[data-toggle-comments]').forEach(button => {
            button.addEventListener('click', () => {
                const panel = document.getElementById(button.dataset.toggleComments);
                if (!panel) return;
                panel.hidden = !panel.hidden;
                button.classList.toggle('is-active', !panel.hidden);
            });
        });

        // Toggle Sidebar Mobile (Được thêm từ Đợt 2 HTML)
        const mobileFilterToggle = document.querySelector('.qa-mobile-filter-toggle button');
        const layout = document.querySelector('.qa-layout');
        if (mobileFilterToggle && layout) {
            mobileFilterToggle.addEventListener('click', () => {
                layout.classList.toggle('show-sidebar');
            });
        }
    };

    const initMath = () => {
        if (typeof window.renderMathInElement !== 'function') return;
        document.querySelectorAll('.qa-math').forEach(node => {
            window.renderMathInElement(node, {
                delimiters: [
                    { left: '$$', right: '$$', display: true },
                    { left: '$', right: '$', display: false },
                    { left: '\\(', right: '\\)', display: false },
                    { left: '\\[', right: '\\]', display: true }
                ],
                throwOnError: false
            });
        });
    };

    // ==========================================
    // 4. BOOTSTRAP
    // ==========================================
    document.addEventListener('DOMContentLoaded', () => {
        formatRelativeTimes();
        initSegments();
        initModals();
        initForms();
        initActionButtons();
        initInteractions();
        initMath();
    });

})();