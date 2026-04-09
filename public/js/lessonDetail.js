const LESSON_STORAGE_PREFIX = 'lesson-detail-v3:';
let tocObserver = null;

document.addEventListener('DOMContentLoaded', () => {
    LessonWorkspace.init();
    if (typeof StudyManager !== 'undefined') StudyManager.init();
});

const LessonWorkspace = {
    lessonId: window.LESSON_ID,
    headings: [],
    activeHeadingIndex: -1,
    scrollSaveTimer: null,
    notesSavedTimer: null,
    activeInteractiveBlock: null,
    activeFullscreenPreview: null,
    renderedBlocks: [],

    init() {
        document.body.classList.add('lesson-detail-mode');
        this.bindGlobalEvents();
        this.applySavedLayout();
        this.initLessonContent();
        this.initNotes();
        this.maybeShowResumeBanner();
        setTimeout(() => {
            if (typeof LessonProgressManager !== 'undefined') LessonProgressManager.init();
        }, 500);
    },

    getScrollContainer() {
        return document.querySelector('.lesson-stage');
    },

    getOverlay() {
        return document.getElementById('lessonOverlay');
    },

    getToolsDrawer() {
        return document.getElementById('lessonToolsDrawer');
    },

    getReadingSurface() {
        return document.getElementById('lessonReadingSurface');
    },

    isMobileLayout() {
        return window.matchMedia('(max-width: 1180px)').matches;
    },

    getLayoutStorageKey(suffix) {
        return `${LESSON_STORAGE_PREFIX}${this.lessonId}:${suffix}`;
    },

    applySavedLayout() {
        const savedMode = window.localStorage.getItem(this.getLayoutStorageKey('mode')) || 'standard';
        this.applyLayoutMode(savedMode, false);

        if (this.isMobileLayout()) {
            this.setMobileRailState('left', false);
            this.setToolsDrawerState(false);
            return;
        }

        const savedLeft = window.localStorage.getItem(this.getLayoutStorageKey('leftRail'));
        const savedTools = window.localStorage.getItem(this.getLayoutStorageKey('toolsDrawer'));
        document.body.classList.toggle('lesson-left-collapsed', savedLeft === 'collapsed');
        this.setToolsDrawerState(savedTools === 'open', false);
    },

    bindGlobalEvents() {
        document.addEventListener('click', (event) => {
            const layoutButton = event.target.closest('[data-layout-mode]');
            if (layoutButton) {
                this.applyLayoutMode(layoutButton.dataset.layoutMode, true);
                return;
            }

            const actionButton = event.target.closest('[data-lesson-action]');
            if (actionButton) {
                this.handleAction(actionButton.dataset.lessonAction);
                return;
            }

            const tocLink = event.target.closest('[data-scroll-target]');
            if (tocLink) {
                event.preventDefault();
                this.scrollToHeading(tocLink.dataset.scrollTarget);
                return;
            }

            const htmlTabButton = event.target.closest('[data-html-tab]');
            if (htmlTabButton) {
                this.toggleHtmlTab(htmlTabButton);
                return;
            }

            const toggleCodeButton = event.target.closest('[data-toggle-code]');
            if (toggleCodeButton) {
                this.toggleCodeExpansion(toggleCodeButton);
                return;
            }

            const previewButton = event.target.closest('[data-toggle-preview-fullscreen]');
            if (previewButton) {
                this.togglePreviewFullscreen(previewButton);
                return;
            }

            const copyButton = event.target.closest('[data-copy-code]');
            if (copyButton) {
                this.copyCode(copyButton);
                return;
            }

            const completeButton = event.target.closest('[data-lesson-complete]');
            if (completeButton) {
                this.completeLesson(completeButton.dataset.lessonComplete);
                return;
            }

            const quizWrapper = event.target.closest('.quiz-wrapper');
            if (quizWrapper) {
                this.setInteractiveFocus(quizWrapper.closest('.content-block-render'));
                return;
            }

            this.clearInteractiveFocus();
        });

        const scrollContainer = this.getScrollContainer();
        if (scrollContainer) {
            scrollContainer.addEventListener('scroll', () => {
                this.updateReadingProgress();
                this.queueSaveScrollPosition();
            });
        }

        const noteField = document.getElementById('lessonQuickNotes');
        if (noteField) noteField.addEventListener('input', () => this.saveNotes());

        const tocSearch = document.getElementById('tocSearchInput');
        if (tocSearch) tocSearch.addEventListener('input', () => this.filterToc());

        const resumeButton = document.getElementById('lessonResumeButton');
        if (resumeButton) resumeButton.addEventListener('click', () => this.restoreSavedScrollPosition(true));

        const overlay = this.getOverlay();
        if (overlay) {
            overlay.addEventListener('click', () => {
                if (this.isMobileLayout()) {
                    this.setMobileRailState('left', false);
                }
                this.setToolsDrawerState(false);
                if (typeof window.lessonCommentsSystem?.closeCommentsModal === 'function') {
                    window.lessonCommentsSystem.closeCommentsModal();
                }
                this.closePreviewFullscreen();
                this.closeFabMenu();
                this.syncOverlay();
            });
        }

        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') {
                this.closePreviewFullscreen();
                this.setToolsDrawerState(false);
                this.closeFabMenu();
            }
        });

        window.addEventListener('resize', () => {
            if (this.isMobileLayout()) {
                this.setMobileRailState('left', false);
            }
            this.syncOverlay();
        });
    },

    handleAction(action) {
        if (action === 'toggle-left-rail') this.toggleRail('left');
        if (action === 'toggle-tools') this.toggleToolsDrawer();
        if (action === 'toggle-fab-menu') this.toggleFabMenu();
    },

    applyLayoutMode(mode, persist = true) {
        document.querySelectorAll('[data-layout-mode]').forEach((button) => {
            button.classList.toggle('is-active', button.dataset.layoutMode === mode);
        });

        document.body.classList.toggle('lesson-focus-mode', mode === 'focus');
        document.body.classList.toggle('lesson-wide-mode', mode === 'wide');

        if (mode === 'focus' || mode === 'wide') {
            document.body.classList.add('lesson-left-collapsed');
            this.setToolsDrawerState(false, false);
        } else if (!this.isMobileLayout()) {
            document.body.classList.remove('lesson-left-collapsed');
        }

        if (persist) {
            window.localStorage.setItem(this.getLayoutStorageKey('mode'), mode);
        }
    },

    toggleRail(side) {
        if (side !== 'left') return;
        if (this.isMobileLayout()) {
            const rail = document.getElementById('lessonSidebar');
            this.setMobileRailState('left', rail?.dataset.railState !== 'open');
            this.setToolsDrawerState(false);
            this.syncOverlay();
            return;
        }

        const className = 'lesson-left-collapsed';
        const collapsed = !document.body.classList.contains(className);
        document.body.classList.toggle(className, collapsed);
        window.localStorage.setItem(this.getLayoutStorageKey('leftRail'), collapsed ? 'collapsed' : 'open');
    },

    setMobileRailState(side, isOpen) {
        const rail = document.getElementById('lessonSidebar');
        if (rail) rail.dataset.railState = isOpen ? 'open' : 'closed';
    },

    toggleToolsDrawer() {
        const drawer = this.getToolsDrawer();
        const shouldOpen = drawer?.dataset.drawerState !== 'open';
        this.setToolsDrawerState(shouldOpen);
        this.closeFabMenu();
    },

    setToolsDrawerState(isOpen, persist = true) {
        const drawer = this.getToolsDrawer();
        if (!drawer) return;

        if (isOpen && typeof window.lessonCommentsSystem?.closeCommentsModal === 'function') {
            window.lessonCommentsSystem.closeCommentsModal();
        }
        if (isOpen && this.isMobileLayout()) {
            this.setMobileRailState('left', false);
        }

        drawer.dataset.drawerState = isOpen ? 'open' : 'closed';
        drawer.classList.toggle('hidden', !isOpen);
        document.body.classList.toggle('lesson-tools-open', isOpen);

        if (persist) {
            window.localStorage.setItem(this.getLayoutStorageKey('toolsDrawer'), isOpen ? 'open' : 'closed');
        }

        this.syncOverlay();
    },

    syncOverlay() {
        const overlay = this.getOverlay();
        if (!overlay) return;
        const leftOpen = document.getElementById('lessonSidebar')?.dataset.railState === 'open';
        const toolsOpen = this.getToolsDrawer()?.dataset.drawerState === 'open';
        const commentsOpen = document.body.classList.contains('lesson-comments-open');
        const previewOpen = !!this.activeFullscreenPreview;
        const shouldShow = commentsOpen || previewOpen || toolsOpen || (this.isMobileLayout() && leftOpen);
        overlay.classList.toggle('hidden', !shouldShow);
    },

    toggleFabMenu() {
        document.body.classList.toggle('lesson-fab-open');
    },

    closeFabMenu() {
        document.body.classList.remove('lesson-fab-open');
    },

    initNotes() {
        const noteField = document.getElementById('lessonQuickNotes');
        if (noteField) {
            noteField.value = window.localStorage.getItem(this.getLayoutStorageKey('notes')) || '';
        }
    },

    saveNotes() {
        const noteField = document.getElementById('lessonQuickNotes');
        const savedState = document.getElementById('notesSavedState');
        if (!noteField) return;
        window.localStorage.setItem(this.getLayoutStorageKey('notes'), noteField.value);
        if (savedState) {
            savedState.textContent = 'Đã lưu';
            window.clearTimeout(this.notesSavedTimer);
            this.notesSavedTimer = window.setTimeout(() => {
                savedState.textContent = 'Tự lưu';
            }, 1200);
        }
    },

    maybeShowResumeBanner() {
        const saved = this.readSavedScrollPosition();
        const banner = document.getElementById('lessonResumeBanner');
        const label = document.getElementById('lessonResumeLabel');
        if (!banner || !saved || saved.top < 180) return;

        banner.classList.remove('hidden');
        if (label) label.textContent = `Bạn đã dừng ở khoảng ${saved.percent}% nội dung. Có thể quay lại đúng vị trí cũ.`;
    },

    readSavedScrollPosition() {
        try {
            const raw = window.localStorage.getItem(this.getLayoutStorageKey('scroll'));
            return raw ? JSON.parse(raw) : null;
        } catch (error) {
            return null;
        }
    },

    queueSaveScrollPosition() {
        window.clearTimeout(this.scrollSaveTimer);
        this.scrollSaveTimer = window.setTimeout(() => this.saveScrollPosition(), 120);
    },

    saveScrollPosition() {
        const container = this.getScrollContainer();
        if (!container) return;
        const percent = container.scrollHeight > container.clientHeight
            ? Math.round((container.scrollTop / (container.scrollHeight - container.clientHeight)) * 100)
            : 0;
        window.localStorage.setItem(this.getLayoutStorageKey('scroll'), JSON.stringify({
            top: container.scrollTop,
            percent
        }));
    },

    restoreSavedScrollPosition(hideBanner = false) {
        const container = this.getScrollContainer();
        const saved = this.readSavedScrollPosition();
        const banner = document.getElementById('lessonResumeBanner');
        if (!container || !saved) return;
        container.scrollTo({ top: saved.top, behavior: 'smooth' });
        if (hideBanner && banner) banner.classList.add('hidden');
    },

    initLessonContent() {
        const contentArea = document.getElementById('lessonContentArea');
        if (!contentArea) return;

        if (typeof marked !== 'undefined') {
            marked.use({ breaks: true, gfm: true });
        }

        let blocks = [];
        try {
            if (window.LESSON_CONTENT_B64) {
                const decodedString = this.decodeBase64(window.LESSON_CONTENT_B64);
                let parsedData = JSON.parse(decodedString);
                if (typeof parsedData === 'string') {
                    try { parsedData = JSON.parse(parsedData); } catch (error) {}
                }
                blocks = Array.isArray(parsedData) ? parsedData : [parsedData];
            }
        } catch (error) {
            console.error('Critical Data Error:', error);
            contentArea.innerHTML = '<div class="lesson-empty-inline">Lỗi tải dữ liệu bài học.</div>';
            return;
        }

        contentArea.innerHTML = '';
        this.renderedBlocks = blocks;
        if (Array.isArray(blocks) && blocks.length > 0) {
            blocks.forEach((block, index) => {
                const blockNode = this.renderSingleBlock(block, index);
                if (blockNode) contentArea.appendChild(blockNode);
            });
        } else {
            contentArea.innerHTML = '<div class="lesson-empty-inline">Bài học này chưa có nội dung.</div>';
        }

        if (window.renderMathInElement) {
            renderMathInElement(contentArea, {
                delimiters: [
                    { left: '$$', right: '$$', display: true },
                    { left: '$', right: '$', display: false }
                ],
                throwOnError: false
            });
        }

        if (window.Prism) Prism.highlightAllUnder(contentArea);

        contentArea.querySelectorAll('.content-block-render[data-annotation-enabled="true"]').forEach((blockNode) => {
            blockNode.__lessonOriginalHtml = blockNode.innerHTML;
        });

        this.generateTableOfContents();
        this.renderSectionStrip();
        this.updateReadingProgress();
        this.updateLessonInsights(blocks);
        document.dispatchEvent(new CustomEvent('lesson:content-ready', {
            detail: {
                lessonId: this.lessonId,
                blocks: blocks.map((block, index) => ({
                    blockKey: this.getBlockKey(block, index),
                    blockType: block?.type || '',
                    index
                }))
            }
        }));
    },

    decodeBase64(str) {
        return decodeURIComponent(atob(str).split('').map((char) => `%${(`00${char.charCodeAt(0).toString(16)}`).slice(-2)}`).join(''));
    },

    hashSeed(value) {
        let hash = 0;
        const source = String(value || '');
        for (let index = 0; index < source.length; index += 1) {
            hash = ((hash << 5) - hash) + source.charCodeAt(index);
            hash |= 0;
        }
        return Math.abs(hash).toString(36);
    },

    getBlockKey(block, index) {
        const directId = block?.id || block?.blockId || block?._id || block?.data?.id || block?.data?.blockId;
        if (directId) return String(directId);

        const seed = [
            block?.type || 'unknown',
            block?.data?.text || block?.data?.title || block?.data?.question || block?.data?.html || block?.data?.code || block?.data?.url || ''
        ].join('|');

        return `block-${index}-${this.hashSeed(seed.slice(0, 160))}`;
    },

    isAnnotationEnabledType(type) {
        return ['header', 'text', 'callout', 'code'].includes(type);
    },

    buildSandboxedPreviewSrcdoc(htmlCode, includeBootstrap) {
        let head = '<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">';
        head += '<base target="_blank">';
        head += '<style>body{margin:0;padding:16px;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:#ffffff;}</style>';
        if (includeBootstrap) {
            head += '<link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">';
            head += '<script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"><\/script>';
        }
        return `<!doctype html><html><head>${head}</head><body>${htmlCode || ''}</body></html>`;
    },

    sanitizeHtml(html, options) {
        return window.DOMPurify ? DOMPurify.sanitize(html || '', options || {}) : (html || '');
    },

    escapeHtml(value) {
        return String(value || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    },

    getSafeHref(rawUrl) {
        if (!rawUrl || typeof rawUrl !== 'string') return '';
        try {
            const resolved = new URL(rawUrl, window.location.origin);
            if (['http:', 'https:'].includes(resolved.protocol)) return resolved.toString();
        } catch (error) {}
        return '';
    },

    renderSingleBlock(block, index) {
        const wrapper = document.createElement('div');
        wrapper.className = `content-block-render block-type-${block.type}`;
        wrapper.dataset.id = index;
        wrapper.dataset.blockKey = this.getBlockKey(block, index);
        wrapper.dataset.blockType = block.type || '';
        if (this.isAnnotationEnabledType(block.type)) {
            wrapper.dataset.annotationEnabled = 'true';
        }

        switch (block.type) {
            case 'header': {
                const level = block.data?.level || 2;
                const heading = document.createElement(`h${level}`);
                heading.textContent = block.data?.text || '';
                heading.id = `heading-${index}`;
                wrapper.appendChild(heading);
                break;
            }
            case 'text': {
                let htmlContent = marked.parse(block.data?.text || '');
                htmlContent = this.sanitizeHtml(htmlContent);
                const tempDiv = document.createElement('div');
                tempDiv.innerHTML = htmlContent;
                tempDiv.querySelectorAll('h1, h2, h3, h4').forEach((heading, headingIndex) => {
                    if (!heading.id) heading.id = `md-heading-${index}-${headingIndex}`;
                });
                wrapper.innerHTML = tempDiv.innerHTML;
                break;
            }
            case 'image': {
                if (!block.data?.url) break;
                const img = document.createElement('img');
                img.src = block.data.url;
                img.alt = block.data.caption || 'Hình ảnh';
                img.loading = 'lazy';
                img.style.cursor = 'zoom-in';
                img.addEventListener('click', () => window.open(img.src, '_blank', 'noopener'));
                wrapper.appendChild(img);
                if (block.data.caption) {
                    const caption = document.createElement('div');
                    caption.className = 'text-center text-muted small fst-italic mt-2';
                    caption.textContent = block.data.caption;
                    wrapper.appendChild(caption);
                }
                break;
            }
            case 'video': {
                if (!block.data?.url) break;
                const videoWrapper = document.createElement('div');
                videoWrapper.className = 'video-block-wrapper';
                const videoInfo = getEmbedUrl(block.data.url, block.data.autoplay);
                const safeVideoId = `lesson-video-${String(wrapper.dataset.blockKey || index).replace(/[^a-z0-9_-]/gi, '-')}`;
                if (videoInfo?.url) {
                    if (videoInfo.type === 'iframe') {
                        videoWrapper.innerHTML = `<iframe src="${videoInfo.url}" frameborder="0" allow="autoplay; encrypted-media; picture-in-picture; clipboard-write" allowfullscreen referrerpolicy="origin" title="Video bài học"></iframe>`;
                        const iframe = videoWrapper.querySelector('iframe');
                        if (iframe) {
                            iframe.id = safeVideoId;
                            iframe.classList.add('lesson-video-iframe');
                            iframe.dataset.blockKey = wrapper.dataset.blockKey || '';
                            iframe.dataset.videoProvider = videoInfo.provider || 'iframe';
                        }
                    } else {
                        const safeVideoUrl = this.getSafeHref(videoInfo.url);
                        if (safeVideoUrl) {
                            videoWrapper.innerHTML = `<video src="${safeVideoUrl}" controls ${block.data.autoplay ? 'autoplay muted' : ''}></video>`;
                            const video = videoWrapper.querySelector('video');
                            if (video) {
                                video.id = safeVideoId;
                                video.classList.add('lesson-video-player');
                                video.dataset.blockKey = wrapper.dataset.blockKey || '';
                                video.dataset.videoProvider = videoInfo.provider || 'native';
                            }
                        }
                    }
                } else {
                    videoWrapper.innerHTML = '<div class="lesson-empty-inline">Video không khả dụng.</div>';
                }
                wrapper.appendChild(videoWrapper);
                break;
            }
            case 'document':
            case 'resource': {
                const docUrl = this.getSafeHref(block.data?.url) || '#';
                const docTitle = block.data?.title || 'Tài liệu đính kèm';
                const docExt = docUrl.split('.').pop().toLowerCase();
                let iconClass = 'fas fa-file-alt';
                if (['pdf'].includes(docExt)) iconClass = 'fas fa-file-pdf text-danger';
                else if (['doc', 'docx'].includes(docExt)) iconClass = 'fas fa-file-word text-primary';
                else if (['xls', 'xlsx'].includes(docExt)) iconClass = 'fas fa-file-excel text-success';
                else if (['zip', 'rar'].includes(docExt)) iconClass = 'fas fa-file-archive text-warning';

                wrapper.innerHTML = `
                    <a href="${docUrl}" target="_blank" rel="noopener noreferrer" class="document-card">
                        <div class="doc-icon"><i class="${iconClass}"></i></div>
                        <div class="doc-info">
                            <div class="doc-title">${this.escapeHtml(docTitle)}</div>
                            <div class="doc-meta">Nhấn để xem hoặc tải xuống</div>
                        </div>
                        <div class="doc-action"><i class="fas fa-external-link-alt"></i></div>
                    </a>
                `;
                break;
            }
            case 'html_preview': {
                const uniqueId = `html-preview-${index}`;
                const settings = block.data?.settings || { showSource: true, defaultTab: 'result', height: 420 };
                const htmlCode = block.data?.html || '';
                const sourceCodeDisplay = this.escapeHtml(htmlCode);
                const sourceLineCount = htmlCode ? htmlCode.split('\n').length : 0;
                const shouldCollapseSource = sourceLineCount > 14;
                const isCodeActive = settings.defaultTab === 'code' && settings.showSource;
                const isResultActive = !isCodeActive;

                wrapper.innerHTML = `
                    <div class="quiz-wrapper html-preview-card" data-html-preview-root>
                        ${settings.showSource ? `<div class="code-header"><span><i class="fab fa-html5"></i> HTML preview</span><div class="lesson-mode-switch"><button type="button" class="${isResultActive ? 'is-active' : ''}" data-html-tab="preview-${uniqueId}">Kết quả</button><button type="button" class="${isCodeActive ? 'is-active' : ''}" data-html-tab="code-${uniqueId}">Mã nguồn</button></div></div>` : ''}
                        <div class="html-preview-toolbar">
                            <span><i class="fab fa-html5"></i> HTML preview</span>
                            <div class="lesson-mode-switch">
                                ${settings.showSource ? `<button type="button" class="${isResultActive ? 'is-active' : ''}" data-html-tab="preview-${uniqueId}">Kết quả</button><button type="button" class="${isCodeActive ? 'is-active' : ''}" data-html-tab="code-${uniqueId}">Mã nguồn</button>` : ''}
                                <button type="button" class="html-preview-action is-ghost" data-toggle-preview-fullscreen><i class="fas fa-expand"></i><span>Phóng to</span></button>
                            </div>
                        </div>
                        <div class="tab-content">
                            <div class="tab-pane ${isResultActive ? 'is-visible' : 'hidden'}" id="preview-${uniqueId}">
                                <iframe id="iframe-${uniqueId}" style="height:${settings.height}px;width:100%;border:0;" title="HTML Preview" sandbox="allow-scripts allow-forms allow-modals allow-popups" referrerpolicy="no-referrer"></iframe>
                            </div>
                            ${settings.showSource ? `<div class="tab-pane ${isCodeActive ? 'is-visible' : 'hidden'}" id="code-${uniqueId}"><div class="code-header"><span>Mã nguồn</span><button type="button" class="btn-copy-code" data-copy-code>Copy</button></div><pre class="line-numbers m-0"><code class="language-html">${sourceCodeDisplay}</code></pre></div>` : ''}
                        </div>
                    </div>
                `;

                window.setTimeout(() => {
                    const previewRoot = wrapper.querySelector('[data-html-preview-root]');
                    const legacyHeader = previewRoot?.querySelector(':scope > .code-header');
                    const iframe = wrapper.querySelector(`#iframe-${uniqueId}`);
                    if (iframe) iframe.srcdoc = this.buildSandboxedPreviewSrcdoc(htmlCode, settings.includeBootstrap);
                    if (legacyHeader) legacyHeader.remove();

                    const codePane = wrapper.querySelector(`#code-${uniqueId}`);
                    if (codePane) {
                        codePane.classList.add('html-source-pane');
                        if (shouldCollapseSource) {
                            codePane.classList.add('is-collapsed');
                            if (!codePane.querySelector('.code-block-fade')) {
                                const fade = document.createElement('div');
                                fade.className = 'code-block-fade';
                                codePane.appendChild(fade);
                            }
                            if (!codePane.querySelector('.code-block-actions')) {
                                const actions = document.createElement('div');
                                actions.className = 'code-block-actions';
                                actions.innerHTML = '<span>Xem 15 dòng đầu để giữ nhịp đọc.</span><button type="button" class="code-expand-button" data-toggle-code aria-expanded="false"><i class="fas fa-chevron-down"></i><span>Xem thêm</span></button>';
                                codePane.appendChild(actions);
                            }
                        }
                    }
                }, 20);
                break;
            }
            case 'code': {
                const lang = block.data?.language || 'javascript';
                const rawCode = block.data?.code || '';
                const codeText = this.escapeHtml(rawCode);
                const lineCount = rawCode ? rawCode.split('\n').length : 0;
                const shouldCollapse = lineCount > 14;
                wrapper.innerHTML = `<div class="code-viewer-container"><div class="code-header"><span>${lang.toUpperCase()}</span><button type="button" class="btn-copy-code" data-copy-code>Copy</button></div><div class="code-block-frame ${shouldCollapse ? 'is-collapsed' : ''}"><pre class="line-numbers"><code class="language-${lang}">${codeText}</code></pre><div class="code-block-fade"></div></div>${shouldCollapse ? `<div class="code-block-actions"><span>Đã rút gọn để không cắt nhịp bài học.</span><button type="button" class="code-expand-button" data-toggle-code aria-expanded="false"><i class="fas fa-chevron-down"></i><span>Xem thêm</span></button></div>` : ''}</div>`;
                break;
            }
            case 'callout': {
                const calloutBody = this.sanitizeHtml(marked.parse(block.data?.text || ''));
                wrapper.innerHTML = `<div class="explanation"><div class="fw-bold mb-2"><i class="fas fa-circle-info"></i> Ghi chú</div><div>${calloutBody}</div></div>`;
                break;
            }
            case 'quiz':
            case 'question':
                if (block.data?.questions && block.data.questions.length > 0) {
                    wrapper.appendChild(this.renderQuizBlock(block.data, index));
                }
                break;
        }

        if (wrapper.dataset.annotationEnabled === 'true') {
            wrapper.__lessonOriginalHtml = wrapper.innerHTML;
        }

        return wrapper;
    },

    renderQuizBlock(data, blockIndex) {
        const settings = data.settings || { passingScore: 50, showFeedback: 'submit' };
        const questions = data.questions || [];
        const container = document.createElement('div');
        container.className = 'quiz-wrapper';
        container.dataset.quizId = String(blockIndex);
        container.tabIndex = 0;
        const feedbackMode = settings.showFeedback || 'submit';

        container.innerHTML = `<div class="code-header"><span><i class="fas fa-puzzle-piece"></i> Bài tập thực hành</span><span>Điểm đạt: ${settings.passingScore}%</span></div><div class="quiz-body p-4"></div><div class="comments-modal-footer"><button type="button" class="lesson-complete-button" data-submit-quiz="${blockIndex}"><i class="fas fa-paper-plane"></i><span>Nộp bài</span></button></div>`;

        const body = container.querySelector('.quiz-body');
        const submitButton = container.querySelector('[data-submit-quiz]');

        const parseMarkdown = (text) => {
            if (typeof marked === 'undefined') return this.escapeHtml(text);
            let html = marked.parse(text || '');
            if (window.DOMPurify) {
                html = DOMPurify.sanitize(html, {
                    ADD_TAGS: ['input'],
                    ADD_ATTR: ['type', 'class', 'style', 'data-answer', 'placeholder', 'autocomplete', 'disabled', 'value']
                });
            }
            return html;
        };

        questions.forEach((question, questionIndex) => {
            const questionEl = document.createElement('div');
            questionEl.className = 'quiz-question';
            questionEl.dataset.type = question.type;
            questionEl.dataset.index = questionIndex;

            let contentHtml = '';
            if (question.type === 'fill') {
                let rawText = question.content || question.question || '';
                rawText = rawText.replace(/\[(.*?)\]/g, (match, answer) => `<input type="text" class="fill-input mx-1" style="width:${Math.max(100, answer.length * 15)}px;min-width:80px;" data-answer="${this.escapeHtml(answer)}" placeholder="..." autocomplete="off">`);
                contentHtml = `<div class="question-content">${parseMarkdown(`**Câu ${questionIndex + 1}:** ${rawText}`)}</div>`;
            } else {
                contentHtml = `<div class="question-content mb-3">${parseMarkdown(`**Câu ${questionIndex + 1}:** ${question.question || ''}`)}</div>`;
                if (question.type === 'essay') {
                    contentHtml += '<textarea class="lesson-notes-field essay-input" rows="4" placeholder="Nhập câu trả lời..."></textarea>';
                } else if (question.type === 'choice') {
                    const inputType = question.isMulti ? 'checkbox' : 'radio';
                    const inputName = `q_${blockIndex}_${questionIndex}`;
                    const optionsHtml = (question.options || []).map((option, optionIndex) => {
                        const isCorrect = (question.correct || []).includes(optionIndex);
                        return `<label class="quiz-option" data-option-idx="${optionIndex}" data-is-correct="${isCorrect}"><input class="form-check-input" type="${inputType}" name="${inputName}" value="${optionIndex}" data-correct="${isCorrect}"><span>${this.escapeHtml(option)}</span></label>`;
                    }).join('');
                    contentHtml += `<div class="options-list">${optionsHtml}</div>`;
                } else if (question.type === 'matching') {
                    // Trộn đáp án cột phải (Shuffle)
                    const rightOptions = (question.pairs || []).map((p, i) => ({ text: p.right, originalIndex: i }));
                    // Shuffle array thuật toán mờ
                    rightOptions.sort(() => Math.random() - 0.5); 

                    let matchHtml = '<div class="matching-grid" style="display:grid; gap:10px; margin-top:10px;">';
                    (question.pairs || []).forEach((p, pIdx) => {
                        let selectOptions = `<option value="">-- Kéo chọn đáp án --</option>`;
                        rightOptions.forEach(opt => {
                            selectOptions += `<option value="${opt.originalIndex}">${this.escapeHtml(opt.text)}</option>`;
                        });
                        matchHtml += `
                            <div class="matching-row" style="display:flex; align-items:center; gap:15px; background:white; padding:10px; border-radius:8px; border:1px solid #e2e8f0;">
                                <div style="flex:1; font-weight:600; color:#334155;">${this.escapeHtml(p.left)}</div>
                                <div style="flex:1;">
                                    <select class="form-select match-select" data-pair-idx="${pIdx}" style="width:100%; padding:8px; border-radius:6px; border:1px solid #cbd5e1;">
                                        ${selectOptions}
                                    </select>
                                </div>
                            </div>
                        `;
                    });
                    matchHtml += '</div>';
                    contentHtml = `<div class="question-content mb-3">${parseMarkdown(`**Câu ${questionIndex + 1}:** ${question.question || ''}`)}</div>${matchHtml}`;

                } else if (question.type === 'ordering') {
                    // Trộn thứ tự
                    const shuffledItems = (question.items || []).map((item, i) => ({ text: item, originalIndex: i })).sort(() => Math.random() - 0.5);
                    
                    let orderHtml = `<ul class="sortable-order-list" id="order-list-${blockIndex}-${questionIndex}" style="list-style:none; padding:0; margin:10px 0; display:grid; gap:8px;">`;
                    shuffledItems.forEach(item => {
                        orderHtml += `
                            <li class="order-item" data-id="${item.originalIndex}" style="background:white; padding:12px 15px; border:1px solid #e2e8f0; border-radius:8px; cursor:grab; display:flex; align-items:center; gap:10px; font-weight:500;">
                                <i class="fas fa-grip-vertical text-muted"></i> ${this.escapeHtml(item.text)}
                            </li>`;
                    });
                    orderHtml += '</ul><div style="font-size:0.8rem; color:#64748b; font-style:italic;"><i class="fas fa-mouse-pointer"></i> Kéo thả các mục lên xuống để sắp xếp thứ tự đúng.</div>';
                    
                    contentHtml = `<div class="question-content mb-3">${parseMarkdown(`**Câu ${questionIndex + 1}:** ${question.question || ''}`)}</div>${orderHtml}`;

                    // Active kéo thả sau khi render DOM
                    setTimeout(() => {
                        const el = document.getElementById(`order-list-${blockIndex}-${questionIndex}`);
                        if(el && window.Sortable) {
                            el.__sortable = new Sortable(el, {
                                animation: 150,
                                ghostClass: 'bg-light',
                                onEnd: () => {
                                    if (typeof LessonProgressManager !== 'undefined') {
                                        LessonProgressManager.triggerSave();
                                    }
                                }
                            });
                        }
                    }, 100);
                }
            }

            const explanationHtml = parseMarkdown(question.explanation || 'Không có giải thích chi tiết.');
            contentHtml += `<div class="explanation hidden"><div class="fw-bold mb-2"><i class="fas fa-lightbulb"></i> Giải thích</div><div>${explanationHtml}</div></div>`;
            questionEl.innerHTML = contentHtml;

            if (feedbackMode === 'instant' && question.type === 'choice') {
                questionEl.querySelectorAll('input').forEach((input) => {
                    input.addEventListener('change', () => {
                        const label = input.closest('label');
                        const isCorrect = input.dataset.correct === 'true';
                        questionEl.querySelectorAll('label').forEach((item) => item.classList.remove('bg-success-subtle', 'bg-danger-subtle'));
                        label.classList.add(isCorrect ? 'bg-success-subtle' : 'bg-danger-subtle');
                        if (isCorrect) questionEl.querySelector('.explanation')?.classList.remove('hidden');
                    });
                });
            }

            body.appendChild(questionEl);
        });

        submitButton.addEventListener('click', () => {
            let correctCount = 0;
            const questionEls = body.querySelectorAll('.quiz-question');

            questionEls.forEach((questionEl) => {
                const questionIndex = Number(questionEl.dataset.index || 0);
                const question = questions[questionIndex];
                if (!question) return;

                let isQuestionCorrect = false;
                if (question.type === 'choice') {
                    const checkedValues = Array.from(questionEl.querySelectorAll('input:checked')).map((input) => Number(input.value)).sort((a, b) => a - b);
                    const correctValues = (question.correct || []).slice().sort((a, b) => a - b);
                    isQuestionCorrect = JSON.stringify(checkedValues) === JSON.stringify(correctValues);
                    questionEl.querySelectorAll('label').forEach((label) => {
                        const optionIndex = Number(label.dataset.optionIdx || 0);
                        if (correctValues.includes(optionIndex)) label.classList.add('bg-success-subtle');
                        else if (checkedValues.includes(optionIndex)) label.classList.add('bg-danger-subtle');
                        label.querySelector('input')?.setAttribute('disabled', 'disabled');
                    });
                } else if (question.type === 'fill') {
                    const fillInputs = Array.from(questionEl.querySelectorAll('.fill-input'));
                    isQuestionCorrect = fillInputs.every((input) => {
                        const matches = input.value.trim().toLowerCase() === String(input.dataset.answer || '').trim().toLowerCase();
                        input.classList.toggle('is-valid', matches);
                        input.classList.toggle('is-invalid', !matches);
                        input.disabled = true;
                        return matches;
                    });
                } else if (question.type === 'essay') {
                    const essayInput = questionEl.querySelector('.essay-input');
                    isQuestionCorrect = !!essayInput && essayInput.value.trim().length > 0;
                    if (essayInput) essayInput.disabled = true;
                } else if (question.type === 'matching') {
                    const selects = Array.from(questionEl.querySelectorAll('.match-select'));
                    isQuestionCorrect = selects.every(select => {
                        const expectedIdx = select.dataset.pairIdx;
                        const selectedIdx = select.value;
                        const matches = expectedIdx === selectedIdx;
                        
                        select.style.borderColor = matches ? '#10b981' : '#ef4444';
                        select.style.backgroundColor = matches ? '#ecfdf5' : '#fef2f2';
                        select.disabled = true;
                        return matches;
                    });

                } else if (question.type === 'ordering') {
                    const listItems = Array.from(questionEl.querySelectorAll('.order-item'));
                    // Lấy thứ tự học sinh kéo thả
                    const currentOrder = listItems.map(li => Number(li.dataset.id));
                    
                    // Kiểm tra xem nó có tăng dần từ 0, 1, 2, 3... không (vì gốc của ta lưu đúng thứ tự đó)
                    isQuestionCorrect = true;
                    for(let i = 0; i < currentOrder.length; i++) {
                        const li = listItems[i];
                        if(currentOrder[i] === i) {
                            li.style.borderColor = '#10b981';
                            li.style.backgroundColor = '#ecfdf5';
                        } else {
                            isQuestionCorrect = false;
                            li.style.borderColor = '#ef4444';
                            li.style.backgroundColor = '#fef2f2';
                        }
                        // Xóa cursor grab
                        li.style.cursor = 'default';
                    }
                    
                    // Tắt kéo thả
                    const ul = questionEl.querySelector('.sortable-order-list');
                    if(ul && ul.__sortable) ul.__sortable.option("disabled", true);
                }

                if (isQuestionCorrect) correctCount += 1;
                if (feedbackMode !== 'never') questionEl.querySelector('.explanation')?.classList.remove('hidden');
            });

            const percent = questions.length ? Math.round((correctCount / questions.length) * 100) : 0;
            const passed = percent >= settings.passingScore;
            Swal.fire({ title: passed ? 'Tuyệt vời!' : 'Hoàn thành!', text: `Kết quả: ${correctCount}/${questions.length} câu đúng.`, icon: passed ? 'success' : 'info', confirmButtonText: 'Đóng' });
            if (passed) {
                triggerConfetti();
                document.dispatchEvent(new CustomEvent('lesson:quiz-passed', {
                    detail: {
                        blockKey: container.closest('.content-block-render')?.dataset.blockKey || '',
                        percent,
                        questionCount: questions.length
                    }
                }));
            }
            submitButton.disabled = true;
            submitButton.querySelector('span').textContent = `Đã chấm (${percent}%)`;
        });

        return container;
    },

    generateTableOfContents() {
        const tocList = document.getElementById('toc-list');
        const contentArea = document.getElementById('lessonContentArea');
        if (!tocList || !contentArea) return;

        this.headings = Array.from(contentArea.querySelectorAll('h1, h2, h3, h4'));
        if (this.headings.length === 0) {
            tocList.innerHTML = '<li class="lesson-empty-inline">Bài học chưa có mục lục.</li>';
            return;
        }

        const counters = [0, 0, 0, 0];
        let lastLevel = 0;
        tocList.innerHTML = this.headings.map((heading, index) => {
            if (!heading.id) heading.id = `toc-${index}`;
            const level = parseInt(heading.tagName.substring(1), 10) - 1;
            if (level < lastLevel) {
                for (let i = level + 1; i < 4; i++) counters[i] = 0;
            }
            counters[level] += 1;
            lastLevel = level;
            return `<li><a href="#${heading.id}" class="toc-link toc-item-h${level + 1}" data-scroll-target="${heading.id}"><span class="toc-number">${counters.slice(0, level + 1).join('.')}</span><span>${this.escapeHtml(heading.innerText)}</span></a></li>`;
        }).join('');

        this.initScrollSpy();
        this.filterToc();
    },

    renderSectionStrip() {
        const strip = document.getElementById('lessonSectionStrip');
        if (!strip) return;

        const primarySections = this.headings.filter((heading) => /H[12]/.test(heading.tagName));
        if (primarySections.length === 0) {
            strip.innerHTML = '<span class="lesson-empty-inline">Bài học đang ở dạng cuộn liền mạch, chưa có checkpoint theo heading lớn.</span>';
            return;
        }

        strip.innerHTML = primarySections.map((heading, index) => (
            `<a href="#${heading.id}" class="lesson-section-chip" data-scroll-target="${heading.id}" data-section-chip><span>Phần ${index + 1}</span><strong>${this.escapeHtml(heading.innerText)}</strong></a>`
        )).join('');
    },

    initScrollSpy() {
        if (tocObserver) tocObserver.disconnect();
        const scrollContainer = this.getScrollContainer();
        if (!scrollContainer || this.headings.length === 0) return;

        tocObserver = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                if (!entry.isIntersecting) return;
                const currentIndex = this.headings.findIndex((heading) => heading.id === entry.target.id);
                if (currentIndex === -1) return;
                this.activeHeadingIndex = currentIndex;
                document.querySelectorAll('.toc-link').forEach((link) => {
                    link.classList.toggle('active', link.dataset.scrollTarget === entry.target.id);
                });
                this.updateSectionIndicators();
            });
        }, { root: scrollContainer, rootMargin: '0px 0px -72% 0px' });

        this.headings.forEach((heading) => tocObserver.observe(heading));
    },

    updateSectionIndicators() {
        const currentHeading = this.headings[this.activeHeadingIndex] || null;
        const nextHeading = this.headings[this.activeHeadingIndex + 1] || null;
        const currentLabel = document.getElementById('currentSectionLabel');
        const nextLabel = document.getElementById('nextSectionLabel');
        const inlineCurrent = document.getElementById('currentSectionInline');
        document.querySelectorAll('[data-section-chip]').forEach((chip) => {
            chip.classList.toggle('is-active', chip.dataset.scrollTarget === currentHeading?.id);
        });
        if (inlineCurrent && currentHeading) {
            inlineCurrent.textContent = `Đang đọc: ${currentHeading.innerText}`;
        } else if (inlineCurrent) {
            inlineCurrent.textContent = 'Đang ở phần mở đầu';
        }
        if (currentLabel) currentLabel.textContent = currentHeading ? currentHeading.innerText : 'Đang ở phần mở đầu';
        if (nextLabel) nextLabel.textContent = nextHeading ? nextHeading.innerText : 'Không còn section tiếp theo';
    },

    scrollToHeading(id) {
        const heading = document.getElementById(id);
        if (heading) heading.scrollIntoView({ behavior: 'smooth', block: 'start' });
        if (this.isMobileLayout()) {
            this.setMobileRailState('left', false);
            this.syncOverlay();
        }
    },

    scrollToBlockKey(blockKey) {
        if (!blockKey) return null;
        const safeSelector = typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
            ? `.content-block-render[data-block-key="${CSS.escape(blockKey)}"]`
            : `.content-block-render[data-block-key="${String(blockKey).replace(/"/g, '\\"')}"]`;
        const block = document.querySelector(safeSelector);
        if (block) {
            block.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        return block || null;
    },

    toggleHtmlTab(button) {
        const targetId = button.dataset.htmlTab;
        const wrapper = button.closest('.quiz-wrapper');
        if (!wrapper || !targetId) return;
        wrapper.querySelectorAll('[data-html-tab]').forEach((item) => item.classList.toggle('is-active', item === button));
        wrapper.querySelectorAll('.tab-pane').forEach((pane) => {
            pane.classList.toggle('hidden', pane.id !== targetId);
            pane.classList.toggle('is-visible', pane.id === targetId);
        });
    },

    toggleCodeExpansion(button) {
        const sourcePane = button.closest('.html-source-pane');
        const codeFrame = button.closest('.code-viewer-container')?.querySelector('.code-block-frame');
        const target = sourcePane || codeFrame;
        if (!target) return;

        const collapsed = target.classList.contains('is-collapsed');
        target.classList.toggle('is-collapsed', !collapsed);
        button.setAttribute('aria-expanded', collapsed ? 'true' : 'false');
        button.innerHTML = collapsed
            ? '<i class="fas fa-chevron-up"></i><span>Thu gọn</span>'
            : '<i class="fas fa-chevron-down"></i><span>Xem thêm</span>';
    },

    togglePreviewFullscreen(button) {
        const previewRoot = button.closest('[data-html-preview-root]');
        if (!previewRoot) return;

        const shouldOpen = !previewRoot.classList.contains('is-fullscreen');
        this.closePreviewFullscreen();

        if (shouldOpen) {
            previewRoot.classList.add('is-fullscreen');
            document.body.classList.add('lesson-preview-open');
            this.activeFullscreenPreview = previewRoot;
            button.innerHTML = '<i class="fas fa-compress"></i><span>Thu nhỏ</span>';
        } else {
            button.innerHTML = '<i class="fas fa-expand"></i><span>Phóng to</span>';
        }

        this.syncOverlay();
    },

    closePreviewFullscreen() {
        if (!this.activeFullscreenPreview) return;

        const button = this.activeFullscreenPreview.querySelector('[data-toggle-preview-fullscreen]');
        this.activeFullscreenPreview.classList.remove('is-fullscreen');
        document.body.classList.remove('lesson-preview-open');
        if (button) {
            button.innerHTML = '<i class="fas fa-expand"></i><span>Phóng to</span>';
        }
        this.activeFullscreenPreview = null;
        this.syncOverlay();
    },

    setInteractiveFocus(blockNode) {
        const readingSurface = this.getReadingSurface();
        if (!readingSurface || !blockNode) return;

        if (this.activeInteractiveBlock && this.activeInteractiveBlock !== blockNode) {
            this.activeInteractiveBlock.classList.remove('is-quiz-focus');
            this.activeInteractiveBlock.querySelector('.quiz-wrapper')?.classList.remove('is-engaged');
        }

        this.activeInteractiveBlock = blockNode;
        readingSurface.classList.add('has-quiz-focus');
        blockNode.classList.add('is-quiz-focus');
        blockNode.querySelector('.quiz-wrapper')?.classList.add('is-engaged');
    },

    clearInteractiveFocus() {
        const readingSurface = this.getReadingSurface();
        if (!readingSurface || !this.activeInteractiveBlock) return;

        this.activeInteractiveBlock.classList.remove('is-quiz-focus');
        this.activeInteractiveBlock.querySelector('.quiz-wrapper')?.classList.remove('is-engaged');
        this.activeInteractiveBlock = null;
        readingSurface.classList.remove('has-quiz-focus');
    },

    updateReadingProgress() {
        let progressBar = document.getElementById('reading-progress');
        if (!progressBar) {
            progressBar = document.createElement('div');
            progressBar.id = 'reading-progress';
            progressBar.className = 'reading-progress-bar';
            document.body.appendChild(progressBar);
        }

        const container = this.getScrollContainer();
        if (!container) return;
        const maxScroll = Math.max(container.scrollHeight - container.clientHeight, 1);
        const percent = Math.min(100, Math.max(0, (container.scrollTop / maxScroll) * 100));
        progressBar.style.width = `${percent}%`;

        const inlineBar = document.getElementById('readingProgressInline');
        const inlineLabel = document.getElementById('readingProgressLabel');
        if (inlineBar) inlineBar.style.width = `${percent}%`;
        if (inlineLabel) inlineLabel.textContent = `${Math.round(percent)}%`;
    },

    updateLessonInsights(blocks) {
        const plainText = blocks.map((block) => {
            if (block.type === 'text' || block.type === 'header' || block.type === 'callout') return block.data?.text || '';
            return '';
        }).join(' ');

        const wordCount = plainText.trim() ? plainText.trim().split(/\s+/).length : 0;
        const readMinutes = Math.max(1, Math.round(wordCount / 220));
        const videoCount = blocks.filter((block) => block.type === 'video').length;
        const quizCount = blocks.filter((block) => block.type === 'quiz' || block.type === 'question').length;
        const documentCount = blocks.filter((block) => block.type === 'document' || block.type === 'resource').length;

        const estimatedReadTimeLabel = document.getElementById('estimatedReadTimeLabel');
        const qualityHint = document.getElementById('lessonQualityHint');
        if (estimatedReadTimeLabel) estimatedReadTimeLabel.textContent = `${readMinutes} phút • ${wordCount} từ`;

        if (qualityHint) {
            if (this.headings.length === 0) qualityHint.textContent = 'Nên thêm heading để TOC rõ hơn';
            else if (quizCount === 0 && wordCount > 900) qualityHint.textContent = 'Bài dài, nên thêm checkpoint luyện tập';
            else if (videoCount > 0 && documentCount > 0) qualityHint.textContent = 'Bố cục giàu media, khá cân bằng';
            else qualityHint.textContent = 'Bố cục ổn định và dễ theo dõi';
        }
    },

    filterToc() {
        const query = this.getNormalized(document.getElementById('tocSearchInput')?.value);
        document.querySelectorAll('#toc-list .toc-link').forEach((link) => {
            const text = this.getNormalized(link.textContent);
            link.parentElement.style.display = !query || text.includes(query) ? '' : 'none';
        });
    },

    getNormalized(value) {
        return String(value || '').trim().toLowerCase();
    },

    async copyCode(button) {
        const code = button.closest('.code-viewer-container, .tab-pane')?.querySelector('code')?.innerText || '';
        if (!code) return;
        await navigator.clipboard.writeText(code);
        const original = button.textContent;
        button.textContent = 'Đã chép';
        window.setTimeout(() => {
            button.textContent = original;
        }, 1500);
    },

    async completeLesson(id) {
        const button = document.getElementById('btn-finish-lesson');
        if (!button || button.disabled) return;

        const text = button.querySelector('span');
        button.disabled = true;
        if (text) text.textContent = 'Đang xử lý...';

        try {
            const response = await fetch(`/lesson/${id}/complete`, { method: 'POST' });
            const data = await response.json();
            if (response.ok) {
                button.classList.add('is-completed');
                if (text) text.textContent = 'Đã hoàn thành bài học';
                window.LESSON_VIEW_STATE = {
                    ...(window.LESSON_VIEW_STATE || {}),
                    isCompleted: true
                };

                if (window.lessonGamification?.showCompletionCelebration) {
                    window.lessonGamification.showCompletionCelebration(data);
                } else {
                    triggerConfetti();
                    Swal.fire({ title: 'Tuyệt vời!', text: `+${data.points || 10} điểm`, icon: 'success', confirmButtonText: 'Tiếp tục' });
                }
                return;
            }
            throw new Error(data.message || data.error || 'Không thể hoàn thành bài học.');
        } catch (error) {
            button.disabled = false;
            if (text) text.textContent = 'Hoàn thành bài học';
            Swal.fire('Lỗi', error.message || 'Không thể hoàn thành bài học.', 'error');
        }
    }
};

const LessonProgressManager = {
    lessonId: window.LESSON_ID,
    allowSave: window.LESSON_VIEW_STATE?.allowSaveProgress !== false && !!window.USER?.id,
    saveTimeout: null,
    isRestoring: false,

    init() {
        if (!this.allowSave || window.LESSON_VIEW_STATE?.isCompleted) return;

        this.injectStableIds();
        this.fetchProgress();

        const contentArea = document.getElementById('lessonContentArea');
        if (!contentArea) return;

        contentArea.addEventListener('input', (event) => {
            if (event.target.matches('input, textarea, select')) {
                this.triggerSave();
            }
        });

        contentArea.addEventListener('change', (event) => {
            if (event.target.matches('input, textarea, select')) {
                this.triggerSave();
            }
        });
    },

    injectStableIds() {
        const wrappers = document.querySelectorAll('.quiz-wrapper');
        wrappers.forEach((wrapper, blockIdx) => {
            const quizId = wrapper.dataset.quizId || String(blockIdx);
            wrapper.dataset.quizId = quizId;

            wrapper.querySelectorAll('.quiz-question').forEach((questionEl, questionIdx) => {
                questionEl.dataset.index = questionEl.dataset.index || String(questionIdx);

                questionEl.querySelectorAll('.fill-input').forEach((input, inputIdx) => {
                    input.dataset.saveId = `fill_${quizId}_${questionIdx}_${inputIdx}`;
                });

                questionEl.querySelectorAll('.essay-input').forEach((input) => {
                    input.dataset.saveId = `essay_${quizId}_${questionIdx}`;
                });

                questionEl.querySelectorAll('.match-select').forEach((select) => {
                    const pairIdx = select.dataset.pairIdx || '0';
                    select.dataset.saveId = `match_${quizId}_${questionIdx}_${pairIdx}`;
                });

                const orderList = questionEl.querySelector('.sortable-order-list');
                if (orderList) {
                    orderList.dataset.saveId = `order_${quizId}_${questionIdx}`;
                }
            });
        });
    },

    triggerSave() {
        if (this.isRestoring) return;
        window.clearTimeout(this.saveTimeout);
        this.saveTimeout = window.setTimeout(() => this.saveToServer(), 1500);
    },

    async saveToServer() {
        const answersData = this.collectData();
        if (!this.lessonId) return;

        try {
            await fetch(`/api/lesson/${this.lessonId}/progress`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ answersData })
            });

            this.showSavedIndicator();
        } catch (error) {
            console.error('Save progress failed', error);
        }
    },

    async fetchProgress() {
        if (!this.lessonId) return;

        try {
            const response = await fetch(`/api/lesson/${this.lessonId}/progress`);
            const data = await response.json();
            if (data.success && data.answersData && Object.keys(data.answersData).length > 0) {
                this.restoreData(data.answersData);
            }
        } catch (error) {
            console.error('Load progress failed', error);
        }
    },

    collectData() {
        const data = {};
        const contentArea = document.getElementById('lessonContentArea');
        if (!contentArea) return data;

        contentArea.querySelectorAll('input[type="radio"]:checked, input[type="checkbox"]:checked').forEach((input) => {
            const name = input.name;
            if (!name) return;

            if (input.type === 'checkbox') {
                if (!Array.isArray(data[name])) data[name] = [];
                data[name].push(input.value);
            } else {
                data[name] = input.value;
            }
        });

        contentArea.querySelectorAll('input[type="text"][data-save-id], textarea[data-save-id], select[data-save-id]').forEach((input) => {
            if (input.dataset.saveId && input.value !== '') {
                data[input.dataset.saveId] = input.value;
            }
        });

        contentArea.querySelectorAll('.sortable-order-list[data-save-id]').forEach((list) => {
            data[list.dataset.saveId] = Array.from(list.querySelectorAll('.order-item')).map((item) => item.dataset.id);
        });

        return data;
    },

    restoreData(data) {
        const contentArea = document.getElementById('lessonContentArea');
        if (!contentArea) return;

        this.isRestoring = true;

        try {
            contentArea.querySelectorAll('input[type="radio"], input[type="checkbox"]').forEach((input) => {
                const savedValue = data[input.name];
                if (savedValue === undefined) {
                    input.checked = false;
                    return;
                }

                if (Array.isArray(savedValue)) {
                    input.checked = savedValue.includes(input.value);
                } else {
                    input.checked = savedValue === input.value;
                }
            });

            contentArea.querySelectorAll('input[type="text"][data-save-id], textarea[data-save-id], select[data-save-id]').forEach((input) => {
                const key = input.dataset.saveId;
                if (key && Object.prototype.hasOwnProperty.call(data, key)) {
                    input.value = data[key];
                }
            });

            contentArea.querySelectorAll('.sortable-order-list[data-save-id]').forEach((list) => {
                const key = list.dataset.saveId;
                const savedOrder = data[key];
                if (!Array.isArray(savedOrder)) return;

                savedOrder.forEach((idStr) => {
                    const item = list.querySelector(`.order-item[data-id="${idStr}"]`);
                    if (item) list.appendChild(item);
                });
            });
        } finally {
            this.isRestoring = false;
        }
    },

    showSavedIndicator() {
        let indicator = document.getElementById('progress-saved-indicator');

        if (!indicator) {
            indicator = document.createElement('div');
            indicator.id = 'progress-saved-indicator';
            indicator.innerHTML = '<i class="fas fa-cloud-upload-alt"></i> Tiến trình đã lưu';
            indicator.style.cssText = 'position:fixed;bottom:20px;left:20px;background:rgba(16,185,129,0.92);color:#fff;padding:8px 16px;border-radius:999px;font-size:0.82rem;font-weight:700;z-index:9999;box-shadow:0 10px 24px rgba(16,185,129,0.28);transition:opacity .25s ease;opacity:0;';
            document.body.appendChild(indicator);
        }

        indicator.style.opacity = '1';
        window.clearTimeout(indicator.__hideTimer);
        indicator.__hideTimer = window.setTimeout(() => {
            indicator.style.opacity = '0';
        }, 2000);
    }
};

function getEmbedUrl(url, autoplay) {
    if (!url) return null;
    const ytMatch = url.match(/(?:youtube\.com\/(?:[^/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=|shorts\/)|youtu\.be\/)([^"&?/\s]{11})/);
    if (ytMatch && ytMatch[1]) {
        const origin = window.location.origin;
        return {
            type: 'iframe',
            provider: 'youtube',
            url: `https://www.youtube.com/embed/${ytMatch[1]}?enablejsapi=1&origin=${origin}&modestbranding=1&rel=0${autoplay ? '&autoplay=1&mute=1' : ''}`
        };
    }

    const driveMatch = url.match(/drive\.google\.com\/file\/d\/([^/]+)\//);
    if (driveMatch && driveMatch[1]) {
        return { type: 'iframe', provider: 'drive', url: `https://drive.google.com/file/d/${driveMatch[1]}/preview` };
    }

    return { type: 'video', provider: 'native', url };
}

function triggerConfetti() {
    if (window.confetti) confetti({ particleCount: 150, spread: 80, origin: { y: 0.65 } });
}

const StudyManager = {
    REWARD_INTERVAL: 300,
    AFK_TIMEOUT: 60,
    MIN_LEARN_TIME: 10,
    secondsStudied: 0,
    secondsSinceLastInput: 0,
    isAFK: false,
    interval: null,

    init() {
        if (window.LESSON_VIEW_STATE?.isCompleted) return;
        this.createUI();
        this.bindEvents();
        this.start();
        this.lockButton();
    },

    createUI() {
        const floater = document.createElement('div');
        floater.id = 'study-floater';
        floater.className = 'study-floater';
        floater.innerHTML = '<div class="timer-ring"></div><div class="fw-bold" id="timer-text">00:00</div>';
        document.body.appendChild(floater);
    },

    bindEvents() {
        const reset = () => {
            this.secondsSinceLastInput = 0;
            this.isAFK = false;
        };

        ['mousemove', 'keydown', 'scroll', 'click'].forEach((eventName) => {
            window.addEventListener(eventName, reset, { passive: true });
        });

        document.addEventListener('visibilitychange', () => {
            if (document.hidden) this.isAFK = true;
        });
    },

    start() {
        this.interval = window.setInterval(() => {
            if (document.hidden || this.isAFK) return;
            this.secondsSinceLastInput += 1;
            if (this.secondsSinceLastInput > this.AFK_TIMEOUT) {
                this.isAFK = true;
                return;
            }

            this.secondsStudied += 1;
            const minutes = String(Math.floor(this.secondsStudied / 60)).padStart(2, '0');
            const seconds = String(this.secondsStudied % 60).padStart(2, '0');
            const timerText = document.getElementById('timer-text');
            if (timerText) timerText.textContent = `${minutes}:${seconds}`;

            if (this.secondsStudied > 0 && this.secondsStudied % this.REWARD_INTERVAL === 0) this.claimReward();
            this.checkUnlock();
        }, 1000);
    },

    async claimReward() {
        try {
            const response = await fetch('/api/lesson/claim-study-reward', { method: 'POST' });
            const data = await response.json().catch(() => ({}));
            if (response.ok && data?.gardenReward && window.lessonGamification?.showPassiveRewardToast) {
                window.lessonGamification.showPassiveRewardToast({
                    rewardType: data.gardenReward.rewardType,
                    rewardAmount: data.gardenReward.rewardAmount,
                    sourceLabel: 'Thưởng học bền bỉ'
                });
            }
        } catch (error) {}
    },

    lockButton() {
        const button = document.getElementById('btn-finish-lesson');
        if (!button || button.disabled) return;
        button.disabled = true;
        button.style.opacity = '0.65';
        button.style.cursor = 'not-allowed';
    },

    checkUnlock() {
        if (this.secondsStudied < this.MIN_LEARN_TIME) return;
        const button = document.getElementById('btn-finish-lesson');
        if (!button || !button.disabled) return;
        button.disabled = false;
        button.style.opacity = '1';
        button.style.cursor = 'pointer';
    }
};

window.LessonWorkspace = LessonWorkspace;
window.LessonProgressManager = LessonProgressManager;
