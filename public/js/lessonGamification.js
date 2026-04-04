(function () {
    class LessonGamification {
        constructor() {
            this.lessonId = window.LESSON_ID;
            this.user = window.USER || null;
            this.pendingRewards = new Map();
            this.seenCheckpointEvents = new Set();
            this.headingObserver = null;
            this.youtubeApiPromise = null;
            this.youtubePlayers = new Map();
            this.isReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
            this.autoNextCountdown = null;
            this.init();
        }

        init() {
            if (!this.lessonId || !this.user?.id) return;
            this.createUI();
            this.bindEvents();
            this.loadPendingRewards();
        }

        createUI() {
            this.rewardStack = document.createElement('div');
            this.rewardStack.className = 'lesson-reward-stack';
            this.rewardStack.id = 'lessonRewardStack';
            document.body.appendChild(this.rewardStack);

            this.toastRack = document.createElement('div');
            this.toastRack.className = 'lesson-reward-toast-rack';
            this.toastRack.id = 'lessonRewardToastRack';
            document.body.appendChild(this.toastRack);

            this.completionOverlay = document.createElement('div');
            this.completionOverlay.className = 'lesson-completion-overlay hidden';
            this.completionOverlay.id = 'lessonCompletionOverlay';
            document.body.appendChild(this.completionOverlay);
        }

        bindEvents() {
            document.addEventListener('lesson:content-ready', () => {
                this.observeHeadingCheckpoints();
                this.bindVideoCheckpoints();
            });

            document.addEventListener('lesson:quiz-passed', (event) => {
                const detail = event.detail || {};
                if (!detail.blockKey) return;
                this.revealReward('quiz_passed', detail.blockKey, {
                    source: 'quiz',
                    progressPercent: this.getCurrentProgressPercent()
                });
            });

            document.addEventListener('lesson:flashcard-reviewed', (event) => {
                const detail = event.detail || {};
                if (!detail.blockKey) return;
                this.revealReward('flashcard_review', detail.blockKey, {
                    source: 'flashcard',
                    quality: Number(detail.quality || 0),
                    cardId: detail.cardId || '',
                    progressPercent: this.getCurrentProgressPercent()
                });
            });

            document.addEventListener('click', (event) => {
                const rewardButton = event.target.closest('[data-reward-claim]');
                if (rewardButton) {
                    this.claimReward(rewardButton.dataset.rewardClaim, rewardButton);
                    return;
                }

                const completionAction = event.target.closest('[data-completion-action]');
                if (completionAction) {
                    this.handleCompletionAction(completionAction.dataset.completionAction, completionAction.dataset.completionHref || '');
                }
            });
        }

        getCurrentProgressPercent() {
            const container = window.LessonWorkspace?.getScrollContainer?.();
            if (!container) return 0;
            const maxScroll = Math.max(container.scrollHeight - container.clientHeight, 1);
            return Math.round(Math.min(100, Math.max(0, (container.scrollTop / maxScroll) * 100)));
        }

        buildCheckpointEventKey(eventType, checkpointKey) {
            return `${eventType}:${checkpointKey}`;
        }

        markCheckpointSeen(eventType, checkpointKey) {
            if (!eventType || !checkpointKey) return;
            this.seenCheckpointEvents.add(this.buildCheckpointEventKey(eventType, checkpointKey));
        }

        hasSeenCheckpoint(eventType, checkpointKey) {
            return this.seenCheckpointEvents.has(this.buildCheckpointEventKey(eventType, checkpointKey));
        }

        observeHeadingCheckpoints() {
            if (this.headingObserver) {
                this.headingObserver.disconnect();
            }

            const scrollRoot = window.LessonWorkspace?.getScrollContainer?.() || null;
            const headings = Array.from(document.querySelectorAll(
                '#lessonContentArea .content-block-render.block-type-header > h1, #lessonContentArea .content-block-render.block-type-header > h2'
            ));
            if (headings.length === 0) return;

            this.headingObserver = new IntersectionObserver((entries) => {
                entries.forEach((entry) => {
                    if (!entry.isIntersecting) return;
                    const block = entry.target.closest('.content-block-render');
                    const checkpointKey = block?.dataset.blockKey || '';
                    if (!checkpointKey || this.hasSeenCheckpoint('scroll_checkpoint', checkpointKey)) return;

                    this.revealReward('scroll_checkpoint', checkpointKey, {
                        source: 'heading',
                        progressPercent: this.getCurrentProgressPercent(),
                        headingLevel: Number(String(entry.target.tagName || 'H2').replace('H', '')) || 2,
                        headingText: entry.target.textContent || '',
                        blockType: block?.dataset.blockType || 'header'
                    });
                });
            }, {
                root: scrollRoot,
                rootMargin: '0px 0px -55% 0px',
                threshold: 0.55
            });

            headings.forEach((heading) => this.headingObserver.observe(heading));
        }

        bindVideoCheckpoints() {
            document.querySelectorAll('.lesson-video-player[data-block-key]').forEach((video) => {
                if (video.dataset.rewardBound === 'true') return;
                video.dataset.rewardBound = 'true';
                video.addEventListener('ended', () => {
                    const checkpointKey = video.dataset.blockKey || '';
                    if (!checkpointKey) return;
                    this.revealReward('video_finished', checkpointKey, {
                        source: 'native-video',
                        duration: Number(video.duration || 0),
                        progressPercent: this.getCurrentProgressPercent()
                    });
                });
            });

            document.querySelectorAll('.lesson-video-iframe[data-video-provider="youtube"][data-block-key]').forEach((iframe) => {
                if (iframe.dataset.playerBound === 'true') return;
                iframe.dataset.playerBound = 'true';
                this.bindYouTubeIframe(iframe);
            });
        }

        async bindYouTubeIframe(iframe) {
            try {
                const YT = await this.ensureYouTubeApi();
                if (!YT?.Player || !iframe?.id || this.youtubePlayers.has(iframe.id)) return;

                const player = new YT.Player(iframe.id, {
                    events: {
                        onStateChange: (event) => {
                            if (event.data === YT.PlayerState.ENDED) {
                                this.revealReward('video_finished', iframe.dataset.blockKey || '', {
                                    source: 'youtube',
                                    progressPercent: this.getCurrentProgressPercent()
                                });
                            }
                        }
                    }
                });

                this.youtubePlayers.set(iframe.id, player);
            } catch (error) {
                console.warn('YouTube reward tracker unavailable:', error?.message || error);
            }
        }

        ensureYouTubeApi() {
            if (window.YT?.Player) return Promise.resolve(window.YT);
            if (this.youtubeApiPromise) return this.youtubeApiPromise;

            this.youtubeApiPromise = new Promise((resolve, reject) => {
                const previousReady = window.onYouTubeIframeAPIReady;
                window.onYouTubeIframeAPIReady = () => {
                    if (typeof previousReady === 'function') previousReady();
                    resolve(window.YT);
                };

                if (!document.querySelector('script[data-youtube-api="true"]')) {
                    const script = document.createElement('script');
                    script.src = 'https://www.youtube.com/iframe_api';
                    script.async = true;
                    script.dataset.youtubeApi = 'true';
                    script.onerror = () => reject(new Error('Không tải được YouTube API.'));
                    document.head.appendChild(script);
                }
            });

            return this.youtubeApiPromise;
        }

        async loadPendingRewards() {
            try {
                const response = await fetch(`/api/lesson-rewards/lesson/${this.lessonId}`);
                const data = await response.json();
                if (!response.ok || !Array.isArray(data.rewards)) return;
                data.rewards.forEach((reward) => this.enqueueReward(reward));
            } catch (error) {
                console.warn('Pending reward load failed:', error?.message || error);
            }
        }

        async revealReward(eventType, checkpointKey, meta = {}) {
            if (!checkpointKey) return;
            const seenKey = this.buildCheckpointEventKey(eventType, checkpointKey);
            if (this.seenCheckpointEvents.has(seenKey)) return;
            this.seenCheckpointEvents.add(seenKey);

            try {
                const response = await fetch(`/api/lesson-rewards/lesson/${this.lessonId}/reveal`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ eventType, checkpointKey, meta })
                });
                const data = await response.json().catch(() => ({}));

                if (!response.ok) {
                    this.seenCheckpointEvents.delete(seenKey);
                    if (response.status !== 409 && response.status !== 429) {
                        console.warn('Reward reveal blocked:', data?.message || response.statusText);
                    }
                    return;
                }

                if (data.reward) {
                    this.markCheckpointSeen(data.reward.eventType, data.reward.checkpointKey);
                }

                if (data.revealed && data.reward) {
                    this.enqueueReward(data.reward);
                }
            } catch (error) {
                this.seenCheckpointEvents.delete(seenKey);
                console.warn('Reward reveal failed:', error?.message || error);
            }
        }

        enqueueReward(reward) {
            if (!reward?._id) return;
            this.markCheckpointSeen(reward.eventType, reward.checkpointKey);
            if (reward.status && reward.status !== 'revealed') return;
            if (this.pendingRewards.has(reward._id)) return;
            this.pendingRewards.set(reward._id, reward);
            this.renderRewardStack();
            this.revealDropAnimation(reward);
        }

        revealDropAnimation(reward) {
            if (this.isReducedMotion) return;
            const node = this.rewardStack?.querySelector(`[data-reward-id="${reward._id}"]`);
            if (!node) return;
            node.classList.remove('is-revealed');
            window.requestAnimationFrame(() => {
                node.classList.add('is-revealed');
            });
        }

        renderRewardStack() {
            if (!this.rewardStack) return;
            const rewards = Array.from(this.pendingRewards.values()).slice(-4).reverse();
            this.rewardStack.innerHTML = '';
            this.rewardStack.classList.toggle('is-empty', rewards.length === 0);

            rewards.forEach((reward) => {
                const button = document.createElement('button');
                button.type = 'button';
                button.className = 'lesson-drop-pill';
                button.dataset.rewardId = reward._id;
                button.dataset.rewardClaim = reward._id;
                const presentation = reward.presentation || {};
                button.innerHTML = `
                    <span class="lesson-drop-pill-icon">${presentation.icon || '🎁'}</span>
                    <span class="lesson-drop-pill-copy">
                        <strong>${presentation.title || 'Phần thưởng ẩn'}</strong>
                        <small>${presentation.subtitle || 'Bấm để nhận ngay'}</small>
                    </span>
                    <span class="lesson-drop-pill-cta">Nhận</span>
                `;
                this.rewardStack.appendChild(button);
            });
        }

        async claimReward(rewardId, trigger) {
            if (!rewardId) return;
            trigger?.setAttribute('disabled', 'disabled');

            try {
                const response = await fetch(`/api/lesson-rewards/${rewardId}/claim`, { method: 'POST' });
                const data = await response.json().catch(() => ({}));
                if (!response.ok) {
                    throw new Error(data.message || 'Không thể nhận phần thưởng.');
                }

                const reward = data.reward || this.pendingRewards.get(rewardId);
                this.pendingRewards.delete(rewardId);
                this.renderRewardStack();

                if (reward) {
                    this.showPassiveRewardToast({
                        rewardType: reward.rewardType,
                        rewardAmount: reward.rewardAmount,
                        sourceLabel: reward.meta?.sourceLabel || reward.presentation?.subtitle || 'Phần thưởng bài học'
                    });
                }
            } catch (error) {
                trigger?.removeAttribute('disabled');
                window.Swal?.fire('Chưa nhận được', error.message || 'Không thể nhận phần thưởng.', 'error');
            }
        }

        showPassiveRewardToast({ rewardType, rewardAmount, sourceLabel }) {
            if (!this.toastRack) return;
            const presentation = this.getPresentation(rewardType, rewardAmount, sourceLabel);
            const toast = document.createElement('div');
            toast.className = 'lesson-reward-toast';
            toast.innerHTML = `
                <span class="lesson-reward-toast-icon">${presentation.icon}</span>
                <span class="lesson-reward-toast-copy">
                    <strong>${presentation.title}</strong>
                    <small>${presentation.subtitle}</small>
                </span>
            `;
            this.toastRack.appendChild(toast);
            window.setTimeout(() => {
                toast.classList.add('is-leaving');
                window.setTimeout(() => toast.remove(), 260);
            }, 2600);
        }

        getPresentation(rewardType, rewardAmount, sourceLabel) {
            const reward = {
                rewardType,
                rewardAmount,
                presentation: null,
                meta: { sourceLabel }
            };
            if (reward.presentation) return reward.presentation;

            const icon = rewardType === 'water'
                ? '💧'
                : rewardType === 'fertilizer'
                    ? '🪴'
                    : rewardType === 'gold'
                        ? '🪙'
                        : '🎁';

            return {
                icon,
                title: `+${rewardAmount} ${rewardType === 'water' ? 'nước' : rewardType === 'fertilizer' ? 'phân bón' : rewardType === 'gold' ? 'vàng' : 'quà'}`,
                subtitle: sourceLabel || 'Phần thưởng bài học'
            };
        }

        showCompletionCelebration(payload) {
            const celebration = payload?.celebration || {};
            const rewards = celebration.rewards || {};
            const nextLesson = celebration.nextLesson || payload?.nextLesson || null;
            const achievements = Array.isArray(celebration.achievements) ? celebration.achievements.slice(0, 3) : [];
            const shouldAutoNext = !!(nextLesson?.url);

            if (!this.isReducedMotion) {
                triggerConfetti();
                window.setTimeout(() => triggerConfetti(), 240);
            }

            this.completionOverlay.innerHTML = `
                <div class="lesson-completion-card">
                    <div class="lesson-completion-head">
                        <span class="lesson-completion-kicker">${celebration.isLevelUp ? 'Level up' : 'Hoàn thành bài học'}</span>
                        <h2>${celebration.headline || 'Hoàn thành bài học!'}</h2>
                        <p>${celebration.subheadline || 'Bạn vừa khép lại một bài học rất gọn.'}</p>
                    </div>

                    <div class="lesson-completion-rewards">
                        ${this.renderCompletionMetric('⭐', `${rewards.points || payload?.points || 0} điểm`, 'Điểm học tập')}
                        ${this.renderCompletionMetric('⚡', `${rewards.xp || payload?.xp || 0} XP`, 'Kinh nghiệm')}
                        ${this.renderCompletionMetric('💧', `+${rewards.water || payload?.water || 0}`, 'Nước')}
                        ${this.renderCompletionMetric('🪙', `+${rewards.gold || payload?.gold || 0}`, 'Vàng')}
                        ${(rewards.fertilizer || 0) > 0 ? this.renderCompletionMetric('🪴', `+${rewards.fertilizer}`, 'Phân bón') : ''}
                    </div>

                    <div class="lesson-completion-meta">
                        <span>Bài: ${celebration.lessonTitle || document.title}</span>
                        <span>Streak: ${celebration.streak || payload?.streak || 0} ngày</span>
                        ${celebration.isLevelUp ? '<span class="is-highlight">Vừa lên cấp</span>' : ''}
                    </div>

                    ${achievements.length > 0 ? `
                        <div class="lesson-completion-achievements">
                            <span class="lesson-completion-subtitle">Mốc mới vừa mở</span>
                            <div class="lesson-completion-achievement-list">
                                ${achievements.map((achievement) => `
                                    <div class="lesson-completion-achievement">
                                        <span>${achievement.icon || '🏆'}</span>
                                        <div>
                                            <strong>${achievement.name || 'Thành tích mới'}</strong>
                                            <small>${achievement.unlockMessage || achievement.description || 'Đã được ghi nhận vào hồ sơ học tập'}</small>
                                        </div>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    ` : ''}

                    ${shouldAutoNext ? `
                        <div class="lesson-completion-autonext" id="lessonCompletionAutonext">
                            <div>
                                <span class="lesson-completion-subtitle">Binge-learning</span>
                                <strong>Tự chuyển sang "${nextLesson.title}" sau <span id="lessonCompletionCountdown">5</span> giây</strong>
                            </div>
                            <button type="button" class="lesson-completion-button is-secondary is-compact" data-completion-action="cancel-next">Dừng tự chuyển</button>
                        </div>
                    ` : ''}

                    <div class="lesson-completion-actions">
                        <button type="button" class="lesson-completion-button is-secondary" data-completion-action="stay">Ở lại ôn tiếp</button>
                        <a class="lesson-completion-button is-ghost" data-completion-action="garden" href="/my-garden">Vào khu vườn</a>
                        ${nextLesson?.url ? `<a class="lesson-completion-button is-primary" data-completion-action="next" data-completion-href="${nextLesson.url}" href="${nextLesson.url}">Sang bài tiếp</a>` : '<button type="button" class="lesson-completion-button is-primary" data-completion-action="close">Đóng</button>'}
                    </div>
                </div>
            `;

            this.completionOverlay.classList.remove('hidden');
            document.body.classList.add('lesson-completion-open');
            this.startAutoNextCountdown(nextLesson);
        }

        renderCompletionMetric(icon, value, label) {
            return `
                <div class="lesson-completion-metric">
                    <span class="lesson-completion-metric-icon">${icon}</span>
                    <strong>${value}</strong>
                    <small>${label}</small>
                </div>
            `;
        }

        startAutoNextCountdown(nextLesson) {
            this.clearAutoNextCountdown();
            if (!nextLesson?.url) return;

            let remaining = 5;
            const countdownEl = document.getElementById('lessonCompletionCountdown');
            if (countdownEl) countdownEl.textContent = String(remaining);

            this.autoNextCountdown = window.setInterval(() => {
                remaining -= 1;
                if (countdownEl) countdownEl.textContent = String(Math.max(0, remaining));
                if (remaining <= 0) {
                    this.clearAutoNextCountdown();
                    window.location.href = nextLesson.url;
                }
            }, 1000);
        }

        clearAutoNextCountdown() {
            if (this.autoNextCountdown) {
                window.clearInterval(this.autoNextCountdown);
                this.autoNextCountdown = null;
            }
        }

        handleCompletionAction(action, href) {
            if (action === 'cancel-next' || action === 'stay' || action === 'close') {
                this.clearAutoNextCountdown();
            }

            if (action === 'next' && href) {
                this.clearAutoNextCountdown();
                window.location.href = href;
                return;
            }

            if (action === 'garden') {
                this.clearAutoNextCountdown();
                window.location.href = '/my-garden';
                return;
            }

            this.completionOverlay.classList.add('hidden');
            document.body.classList.remove('lesson-completion-open');
        }
    }

    window.lessonGamification = new LessonGamification();
})();
