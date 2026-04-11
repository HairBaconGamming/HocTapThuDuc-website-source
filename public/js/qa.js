(function () {
    function parseJsonResponse(response) {
        return response.json().catch(function () {
            return { success: false, error: 'Phản hồi không hợp lệ từ máy chủ.' };
        });
    }

    function showToast(message, isError) {
        var toast = document.getElementById('qaToast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'qaToast';
            toast.className = 'qa-toast';
            document.body.appendChild(toast);
        }
        toast.textContent = message;
        toast.style.background = isError ? '#7f1d1d' : '#111827';
        toast.classList.add('is-visible');
        clearTimeout(showToast._timer);
        showToast._timer = setTimeout(function () {
            toast.classList.remove('is-visible');
        }, 2400);
    }

    function request(url, payload) {
        return fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'X-Requested-With': 'XMLHttpRequest'
            },
            body: JSON.stringify(payload || {})
        }).then(function (response) {
            return parseJsonResponse(response).then(function (data) {
                if (!response.ok || data.success === false) {
                    throw new Error(data.error || 'Không thể xử lý yêu cầu.');
                }
                return data;
            });
        });
    }

    function formatRelativeTimes() {
        var formatter = new Intl.RelativeTimeFormat('vi', { numeric: 'auto' });
        var now = Date.now();
        document.querySelectorAll('[data-relative-time]').forEach(function (node) {
            var value = node.getAttribute('datetime') || node.dataset.relativeTime;
            var time = value ? new Date(value).getTime() : NaN;
            if (!Number.isFinite(time)) return;
            var diffMinutes = Math.round((time - now) / 60000);
            var text = '';
            if (Math.abs(diffMinutes) < 60) {
                text = formatter.format(diffMinutes, 'minute');
            } else {
                var diffHours = Math.round(diffMinutes / 60);
                if (Math.abs(diffHours) < 24) {
                    text = formatter.format(diffHours, 'hour');
                } else {
                    var diffDays = Math.round(diffHours / 24);
                    text = formatter.format(diffDays, 'day');
                }
            }
            node.textContent = text;
        });
    }

    function initSegments() {
        document.querySelectorAll('[data-segment]').forEach(function (segment) {
            var buttons = segment.querySelectorAll('[data-segment-button]');
            var panels = segment.parentElement.querySelectorAll('[data-segment-panel]');
            buttons.forEach(function (button) {
                button.addEventListener('click', function () {
                    var target = button.dataset.segmentButton;
                    buttons.forEach(function (btn) {
                        btn.classList.toggle('is-active', btn === button);
                    });
                    panels.forEach(function (panel) {
                        panel.classList.toggle('is-active', panel.dataset.segmentPanel === target);
                    });
                });
            });
        });
    }

    function initModals() {
        document.querySelectorAll('[data-open-modal]').forEach(function (trigger) {
            trigger.addEventListener('click', function () {
                var modal = document.querySelector('[data-modal="' + trigger.dataset.openModal + '"]');
                if (modal) modal.classList.add('is-open');
            });
        });

        document.querySelectorAll('[data-close-modal]').forEach(function (trigger) {
            trigger.addEventListener('click', function () {
                var modal = trigger.closest('.qa-modal');
                if (modal) modal.classList.remove('is-open');
            });
        });

        document.querySelectorAll('.qa-modal').forEach(function (modal) {
            modal.addEventListener('click', function (event) {
                if (event.target === modal) {
                    modal.classList.remove('is-open');
                }
            });
        });

        document.addEventListener('keydown', function (event) {
            if (event.key === 'Escape') {
                document.querySelectorAll('.qa-modal.is-open').forEach(function (modal) {
                    modal.classList.remove('is-open');
                });
            }
        });
    }

    function initQuestionForm() {
        var form = document.getElementById('qaQuestionForm');
        if (!form) return;

        form.addEventListener('submit', function (event) {
            event.preventDefault();
            var submitButton = form.querySelector('[type="submit"]');
            if (submitButton) submitButton.disabled = true;

            request('/qa/questions', {
                title: form.title.value,
                subject: form.subject.value,
                grade: form.grade.value,
                bountyAmount: form.bountyAmount.value,
                images: form.images.value,
                content: form.content.value
            })
                .then(function (data) {
                    showToast('Đã treo câu hỏi lên Bảng Cầu Cứu.');
                    window.location.href = data.redirectUrl || '/qa';
                })
                .catch(function (error) {
                    showToast(error.message, true);
                    if (submitButton) submitButton.disabled = false;
                });
        });
    }

    function initAnswerForm() {
        var form = document.getElementById('qaAnswerForm');
        if (!form) return;

        form.addEventListener('submit', function (event) {
            event.preventDefault();
            var submitButton = form.querySelector('[type="submit"]');
            if (submitButton) submitButton.disabled = true;

            request('/qa/answers', {
                questionId: form.questionId.value,
                images: form.images.value,
                content: form.content.value
            })
                .then(function (data) {
                    showToast('Lời giải đã được gửi.');
                    window.location.href = data.redirectUrl || window.location.href;
                })
                .catch(function (error) {
                    showToast(error.message, true);
                    if (submitButton) submitButton.disabled = false;
                });
        });
    }

    function initCommentForms() {
        document.querySelectorAll('.qa-comment-form').forEach(function (form) {
            form.addEventListener('submit', function (event) {
                event.preventDefault();
                var answerId = form.dataset.answerId;
                var textarea = form.querySelector('textarea');
                var submitButton = form.querySelector('[type="submit"]');
                if (!answerId || !textarea) return;
                if (submitButton) submitButton.disabled = true;

                request('/qa/answers/' + answerId + '/comments', {
                    content: textarea.value
                })
                    .then(function (data) {
                        showToast('Đã thêm bình luận.');
                        window.location.href = data.redirectUrl || window.location.href;
                    })
                    .catch(function (error) {
                        showToast(error.message, true);
                        if (submitButton) submitButton.disabled = false;
                    });
            });
        });
    }

    function initActionButtons() {
        document.addEventListener('click', function (event) {
            var button = event.target.closest('.qa-upvote-btn, .qa-accept-btn');
            if (!button) return;
            event.preventDefault();
            var url = button.dataset.actionUrl;
            if (!url) return;
            button.disabled = true;

            request(url, {})
                .then(function (data) {
                    showToast(button.classList.contains('qa-accept-btn') ? 'Đã chốt đáp án.' : 'Đã cập nhật upvote.');
                    window.location.href = data.redirectUrl || window.location.href;
                })
                .catch(function (error) {
                    showToast(error.message, true);
                    button.disabled = false;
                });
        });
    }

    function initCommentToggle() {
        document.querySelectorAll('[data-toggle-comments]').forEach(function (button) {
            button.addEventListener('click', function () {
                var panel = document.getElementById(button.dataset.toggleComments);
                if (!panel) return;
                panel.hidden = !panel.hidden;
                button.classList.toggle('is-active', !panel.hidden);
            });
        });
    }

    function initMath() {
        if (typeof window.renderMathInElement !== 'function') return;
        document.querySelectorAll('.qa-math').forEach(function (node) {
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
    }

    document.addEventListener('DOMContentLoaded', function () {
        formatRelativeTimes();
        initSegments();
        initModals();
        initQuestionForm();
        initAnswerForm();
        initCommentForms();
        initActionButtons();
        initCommentToggle();
        initMath();
    });
})();
