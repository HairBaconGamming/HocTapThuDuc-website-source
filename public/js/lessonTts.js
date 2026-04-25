(function () {
    const LessonTtsPlayer = {
        manifest: null,
        manifestPromise: null,
        audio: null,
        currentSegmentIndex: -1,
        state: 'idle',
        elements: {},

        init() {
            this.elements = {
                card: document.getElementById('lessonTtsCard'),
                badge: document.getElementById('lessonTtsStatusBadge'),
                statusText: document.getElementById('lessonTtsStatusText'),
                progressText: document.getElementById('lessonTtsProgressText'),
                segmentText: document.getElementById('lessonTtsSegmentText'),
                playButton: document.getElementById('lessonTtsPlayButton'),
                pauseButton: document.getElementById('lessonTtsPauseButton'),
                resumeButton: document.getElementById('lessonTtsResumeButton')
            };

            if (!this.elements.card || !window.LESSON_TTS_STATE || !window.LESSON_TTS_STATE.manifestUrl) {
                return;
            }

            this.audio = new Audio();
            this.audio.preload = 'auto';
            this.bindEvents();
            this.render();
        },

        bindEvents() {
            this.elements.playButton.addEventListener('click', () => {
                void this.handlePlayClick();
            });

            this.elements.pauseButton.addEventListener('click', () => {
                this.pausePlayback();
            });

            this.elements.resumeButton.addEventListener('click', () => {
                void this.resumePlayback();
            });

            this.audio.addEventListener('ended', () => {
                void this.handleSegmentEnded();
            });

            this.audio.addEventListener('error', () => {
                this.setState('error', 'Không thể phát audio của bài học lúc này. Vui lòng thử lại.');
            });

            window.addEventListener('pagehide', () => this.destroy());
            window.addEventListener('beforeunload', () => this.destroy());
        },

        async handlePlayClick() {
            if (this.state === 'loading' || this.state === 'playing') {
                return;
            }

            if (this.state === 'ended' && this.manifest && this.manifest.segments && this.manifest.segments.length > 0) {
                this.currentSegmentIndex = 0;
                await this.playSegment(this.currentSegmentIndex, { forceReload: true });
                return;
            }

            const manifest = await this.ensureManifest();
            if (!manifest || manifest.status !== 'ready' || !manifest.segments || manifest.segments.length === 0) {
                return;
            }

            if (this.currentSegmentIndex < 0 || this.currentSegmentIndex >= manifest.segments.length) {
                this.currentSegmentIndex = 0;
            }

            await this.playSegment(this.currentSegmentIndex, { forceReload: true });
        },

        async ensureManifest() {
            if (this.manifest) {
                return this.manifest;
            }

            if (this.manifestPromise) {
                return this.manifestPromise;
            }

            this.setState('loading', 'Đang tạo audio cho bài học lần đầu. Thao tác này chỉ cần chờ ở lượt nghe đầu tiên.');

            this.manifestPromise = fetch(window.LESSON_TTS_STATE.manifestUrl, {
                method: 'GET',
                headers: {
                    Accept: 'application/json'
                }
            })
                .then(async (response) => {
                    const payload = await response.json().catch(() => ({}));

                    if (!response.ok || payload.success === false) {
                        throw new Error(payload.error || 'Không thể chuẩn bị audio của bài học.');
                    }

                    this.manifest = payload;
                    return payload;
                })
                .then((manifest) => {
                    if (!manifest.segments || manifest.segments.length === 0 || manifest.status === 'empty') {
                        this.currentSegmentIndex = -1;
                        this.setState('empty', 'Bài học này hiện không có phần văn bản phù hợp để phát audio.');
                        return manifest;
                    }

                    this.currentSegmentIndex = 0;
                    this.setState('ready', 'Audio đã sẵn sàng. Bạn có thể bắt đầu nghe toàn bộ bài học.');
                    return manifest;
                })
                .catch((error) => {
                    this.setState('error', error.message || 'Không thể chuẩn bị audio của bài học.');
                    throw error;
                })
                .finally(() => {
                    this.manifestPromise = null;
                });

            return this.manifestPromise;
        },

        async playSegment(index, { forceReload = false } = {}) {
            const segment = this.manifest && this.manifest.segments && this.manifest.segments[index];
            if (!segment || !this.audio) {
                this.finishPlayback();
                return;
            }

            const absoluteUrl = new URL(segment.url, window.location.origin).toString();
            if (forceReload || this.audio.src !== absoluteUrl) {
                this.audio.src = absoluteUrl;
                this.audio.load();
            }

            this.currentSegmentIndex = index;
            this.setState('playing', 'Đang phát audio của bài học.');

            try {
                await this.audio.play();
            } catch (error) {
                this.setState('error', 'Trình duyệt đang chặn phát audio hoặc audio chưa sẵn sàng. Vui lòng thử lại.');
            }
        },

        pausePlayback() {
            if (!this.audio || this.state !== 'playing') {
                return;
            }

            this.audio.pause();
            this.setState('paused', 'Audio đang tạm dừng. Bạn có thể tiếp tục từ đoạn hiện tại.');
        },

        async resumePlayback() {
            if (!this.audio || this.state === 'loading' || this.state === 'empty') {
                return;
            }

            if (!this.manifest || !this.manifest.segments || this.manifest.segments.length === 0) {
                await this.handlePlayClick();
                return;
            }

            if (!this.audio.src) {
                const nextIndex = this.currentSegmentIndex >= 0 ? this.currentSegmentIndex : 0;
                await this.playSegment(nextIndex, { forceReload: true });
                return;
            }

            this.setState('playing', 'Đang phát audio của bài học.');

            try {
                await this.audio.play();
            } catch (error) {
                this.setState('error', 'Không thể tiếp tục phát audio. Vui lòng thử lại.');
            }
        },

        async handleSegmentEnded() {
            if (!this.manifest || !this.manifest.segments) {
                this.finishPlayback();
                return;
            }

            const nextIndex = this.currentSegmentIndex + 1;
            if (nextIndex >= this.manifest.segments.length) {
                this.finishPlayback();
                return;
            }

            await this.playSegment(nextIndex, { forceReload: true });
        },

        finishPlayback() {
            if (this.audio) {
                this.audio.pause();
            }
            this.setState('ended', 'Đã phát xong toàn bộ audio của bài học.');
        },

        destroy() {
            if (!this.audio) return;

            this.audio.pause();
            this.audio.removeAttribute('src');
            this.audio.load();
        },

        setState(nextState, message) {
            this.state = nextState;
            this.render(message);
        },

        getSegmentLabel() {
            const totalSegments = this.manifest && this.manifest.segments ? this.manifest.segments.length : 0;
            const current = totalSegments > 0 && this.currentSegmentIndex >= 0
                ? Math.min(this.currentSegmentIndex + 1, totalSegments)
                : 0;

            return `${current}/${totalSegments} đoạn`;
        },

        getProgressLabel() {
            const totalSegments = this.manifest && this.manifest.segments ? this.manifest.segments.length : 0;

            if (this.state === 'playing') {
                return `Đang nghe đoạn ${this.currentSegmentIndex + 1} trên ${totalSegments}`;
            }

            if (this.state === 'paused') {
                return `Tạm dừng tại đoạn ${this.currentSegmentIndex + 1} trên ${totalSegments}`;
            }

            if (this.state === 'ended') {
                return 'Đã phát xong toàn bài';
            }

            if (this.state === 'loading') {
                return 'Đang chuẩn bị audio';
            }

            if (this.state === 'empty') {
                return 'Không có nội dung phát';
            }

            if (this.state === 'error') {
                return 'Cần thử lại';
            }

            return totalSegments > 0 ? 'Audio sẵn sàng để nghe' : 'Chưa bắt đầu';
        },

        render(message) {
            const stateTextMap = {
                idle: 'Sẵn sàng',
                ready: 'Sẵn sàng',
                loading: 'Đang tạo audio',
                playing: 'Đang phát',
                paused: 'Tạm dừng',
                ended: 'Hoàn tất',
                empty: 'Không khả dụng',
                error: 'Có lỗi'
            };

            const badgeState = this.state === 'idle' ? 'ready' : this.state;
            const canPlay = this.state !== 'loading' && this.state !== 'empty';
            const canPause = this.state === 'playing';
            const canResume = this.state === 'paused';

            if (this.elements.badge) {
                this.elements.badge.textContent = stateTextMap[this.state] || 'Sẵn sàng';
                this.elements.badge.dataset.state = badgeState;
            }

            if (this.elements.statusText) {
                this.elements.statusText.textContent = message || this.elements.statusText.textContent;
            }

            if (this.elements.progressText) {
                this.elements.progressText.textContent = this.getProgressLabel();
            }

            if (this.elements.segmentText) {
                this.elements.segmentText.textContent = this.getSegmentLabel();
            }

            if (this.elements.playButton) {
                this.elements.playButton.disabled = !canPlay;
            }

            if (this.elements.pauseButton) {
                this.elements.pauseButton.disabled = !canPause;
            }

            if (this.elements.resumeButton) {
                this.elements.resumeButton.disabled = !canResume;
            }
        }
    };

    document.addEventListener('DOMContentLoaded', () => {
        LessonTtsPlayer.init();
        window.lessonTtsPlayer = LessonTtsPlayer;
    });
})();
