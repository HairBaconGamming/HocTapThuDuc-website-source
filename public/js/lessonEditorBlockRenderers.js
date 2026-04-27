(function () {
    function createBlockFrame(index) {
        const el = document.createElement('div');
        el.className = 'content-block';
        el.dataset.index = index;

        const header = document.createElement('div');
        header.className = 'block-controls';
        header.innerHTML = `
            <div class="btn-ctrl drag-handle-block" title="Kéo thả"><i class="fas fa-grip-lines"></i></div>
            <button type="button" class="btn-ctrl" data-block-action="move-up" data-block-index="${index}" title="Lên"><i class="fas fa-arrow-up"></i></button>
            <button type="button" class="btn-ctrl" data-block-action="move-down" data-block-index="${index}" title="Xuống"><i class="fas fa-arrow-down"></i></button>
            <button type="button" class="btn-ctrl delete" data-block-action="delete" data-block-index="${index}" title="Xóa"><i class="fas fa-trash"></i></button>
        `;
        el.appendChild(header);

        const body = document.createElement('div');
        body.className = 'block-body';
        el.appendChild(body);
        return { el, body };
    }

    function appendInserter(canvas, index) {
        const inserter = document.createElement('div');
        inserter.className = 'inserter-line';
        inserter.dataset.canvasAction = 'open-menu';
        inserter.dataset.insertIndex = String(index);
        inserter.innerHTML = `<div class="inserter-btn"><i class="fas fa-plus"></i></div>`;
        canvas.appendChild(inserter);
    }

    function renderVideoBlock(body, block, index, helpers) {
        const data = block.data || {};
        const ratio = data.ratio || '16/9';
        const isAutoplay = data.autoplay || false;
        const isSettingsOpen = block._settingsOpen === true;

        body.innerHTML = `<div class="block-label"><i class="fab fa-youtube"></i> Video / Embed Link</div>`;

        const wrapper = document.createElement('div');
        wrapper.className = 'video-block-wrapper';
        wrapper.innerHTML = `
            <div class="video-input-group">
                <input type="text" class="studio-select"
                       placeholder="Dán link Youtube (Shorts ok), Vimeo hoặc file .mp4..."
                       value="${(data.url || '').replace(/"/g, '&quot;')}"
                       data-block-index="${index}"
                       data-block-field="url">
            </div>
        `;

        const preview = document.createElement('div');
        preview.className = 'video-preview-box';
        preview.style.aspectRatio = ratio.replace('/', ' / ');

        if (data.url) {
            const videoInfo = helpers.getEmbedUrl(data.url, isAutoplay);
            if (videoInfo.type === 'iframe') {
                preview.innerHTML = `<iframe src="${videoInfo.url}" frameborder="0" allow="autoplay; encrypted-media" allowfullscreen referrerpolicy="origin"></iframe>`;
            } else {
                preview.innerHTML = `<video src="${videoInfo.url}" controls ${isAutoplay ? 'autoplay muted' : ''} style="width:100%; height:100%"></video>`;
            }
        }

        wrapper.appendChild(preview);

        const settingsDiv = document.createElement('div');
        const displayStyle = isSettingsOpen ? 'display:block' : 'display:none';
        const toggleIcon = isSettingsOpen ? 'fa-chevron-up' : 'fa-chevron-down';
        settingsDiv.innerHTML = `
            <input type="text" class="studio-select" style="margin-top:10px; border:none; border-bottom:1px dashed #ccc;"
                   placeholder="Chú thích (Caption)..."
                   value="${(data.caption || '').replace(/"/g, '&quot;')}"
                   data-block-index="${index}"
                   data-block-field="caption">

            <div class="video-settings-toggle" data-block-action="toggle-video-settings" data-block-index="${index}" style="cursor:pointer; color:#2563eb; margin-top:8px; font-size:0.85rem; font-weight:600;">
                Cấu hình nâng cao <i class="fas ${toggleIcon}"></i>
            </div>

            <div class="video-settings-panel" style="background:#f8fafc; padding:10px; border-radius:6px; margin-top:5px; ${displayStyle}">
                <div class="v-setting-item" style="margin-bottom:10px;">
                    <label style="display:block; font-size:0.8rem; color:#64748b; margin-bottom:4px;">Tỷ lệ khung hình</label>
                    <select class="studio-select" data-block-index="${index}" data-block-field="ratio">
                        <option value="16/9" ${ratio === '16/9' ? 'selected' : ''}>16:9 (Mặc định)</option>
                        <option value="21/9" ${ratio === '21/9' ? 'selected' : ''}>21:9 (Điện ảnh)</option>
                        <option value="4/3" ${ratio === '4/3' ? 'selected' : ''}>4:3 (Cũ)</option>
                        <option value="9/16" ${ratio === '9/16' ? 'selected' : ''}>9:16 (Tiktok/Shorts)</option>
                    </select>
                </div>
                <div class="v-setting-item" style="display:flex; align-items:center;">
                    <input type="checkbox" id="vid-auto-${index}" ${isAutoplay ? 'checked' : ''}
                           data-block-index="${index}"
                           data-block-field="autoplay"
                           data-block-value-type="boolean"
                           style="margin-right:8px;">
                    <label for="vid-auto-${index}" style="font-size:0.9rem;">Tự động phát</label>
                </div>
            </div>
        `;
        wrapper.appendChild(settingsDiv);
        body.appendChild(wrapper);
    }

    function renderResourceBlock(body, block, index) {
        body.innerHTML = `<div class="block-label"><i class="fas fa-cloud-download-alt"></i> Tài liệu (Google Drive / Link ngoài)</div>`;

        const wrapper = document.createElement('div');
        wrapper.className = 'resource-block-wrapper';
        wrapper.style.cssText = 'padding: 15px; border: 1px solid #e5e7eb; border-radius: 8px; background: #fff;';
        wrapper.innerHTML = `
            <div style="display:flex; gap:10px; margin-bottom:10px;">
                <div style="flex-grow:1;">
                    <label style="font-size:0.8rem; color:#6b7280;">Tên tài liệu hiển thị</label>
                    <input type="text" class="studio-select"
                           value="${block.data.title || ''}"
                           data-block-index="${index}"
                           data-block-field="title"
                           style="font-weight:600;">
                </div>
                <div style="width:120px;">
                    <label style="font-size:0.8rem; color:#6b7280;">Loại icon</label>
                    <select class="studio-select" data-block-index="${index}" data-block-field="iconType">
                        <option value="drive" ${block.data.iconType === 'drive' ? 'selected' : ''}>Google Drive</option>
                        <option value="pdf" ${block.data.iconType === 'pdf' ? 'selected' : ''}>PDF File</option>
                        <option value="doc" ${block.data.iconType === 'doc' ? 'selected' : ''}>Word/Docs</option>
                        <option value="zip" ${block.data.iconType === 'zip' ? 'selected' : ''}>File Zip</option>
                        <option value="link" ${block.data.iconType === 'link' ? 'selected' : ''}>Link Web</option>
                    </select>
                </div>
            </div>
            <div>
                <label style="font-size:0.8rem; color:#6b7280;">Đường dẫn (URL)</label>
                <div style="display:flex; gap:5px;">
                    <input type="text" class="studio-select"
                           value="${block.data.url || ''}"
                           data-block-index="${index}"
                           data-block-field="url">
                    <a href="${block.data.url || '#'}" target="_blank" class="btn-icon-mini" style="width:40px; text-decoration:none; display:flex; align-items:center; justify-content:center; border:1px solid #ddd;"><i class="fas fa-external-link-alt"></i></a>
                </div>
            </div>
        `;
        body.appendChild(wrapper);
    }

    function renderQuestionBlock(el, body, block, index) {
        el.classList.add('block-quiz');
        if (!block.data) block.data = {};
        if (!block.data.settings) {
            block.data.settings = { randomizeQuestions: false, randomizeOptions: false, passingScore: 50, showFeedback: 'submit' };
        }

        const settings = block.data.settings;
        const questions = block.data?.questions || [];
        const summary = `${questions.length} câu hỏi`;

        const settingsBar = document.createElement('div');
        settingsBar.className = 'quiz-settings-bar';
        settingsBar.innerHTML = `
            <div class="quiz-settings-header">
                <i class="fas fa-cog"></i> Cấu hình bài tập
            </div>
            <div class="quiz-settings-content" style="display:grid;">
                <label class="q-setting-item">
                    <input type="checkbox" data-block-index="${index}" data-block-field="settings.randomizeQuestions" data-block-value-type="boolean" ${settings.randomizeQuestions ? 'checked' : ''}> Đảo ngẫu nhiên câu hỏi
                </label>
                <label class="q-setting-item">
                    <input type="checkbox" data-block-index="${index}" data-block-field="settings.randomizeOptions" data-block-value-type="boolean" ${settings.randomizeOptions ? 'checked' : ''}> Đảo vị trí đáp án
                </label>
                <label class="q-setting-item">
                    <span>Điểm đạt (%):</span>
                    <input type="number" min="0" max="100" value="${settings.passingScore}" data-block-index="${index}" data-block-field="settings.passingScore" data-block-value-type="number">
                </label>
                <label class="q-setting-item">
                    <span>Xem đáp án:</span>
                    <select data-block-index="${index}" data-block-field="settings.showFeedback">
                        <option value="instant" ${settings.showFeedback === 'instant' ? 'selected' : ''}>Ngay khi chọn</option>
                        <option value="submit" ${settings.showFeedback === 'submit' ? 'selected' : ''}>Sau khi nộp bài</option>
                        <option value="never" ${settings.showFeedback === 'never' ? 'selected' : ''}>Không hiển thị</option>
                    </select>
                </label>
            </div>
        `;

        const toggle = settingsBar.querySelector('.quiz-settings-header');
        const content = settingsBar.querySelector('.quiz-settings-content');
        toggle.addEventListener('click', () => {
            content.style.display = content.style.display === 'none' ? 'grid' : 'none';
        });

        body.appendChild(settingsBar);

        const summaryWrap = document.createElement('div');
        summaryWrap.innerHTML = `
            <div class="block-label"><i class="fas fa-question-circle"></i> Bộ Câu Hỏi</div>
            <div style="display:flex; justify-content:space-between; align-items:center; margin-top:10px;">
                <div style="font-size:0.9rem; color:#4b5563;"><strong>${summary}</strong></div>
                <button type="button" class="btn-mini-add" data-block-action="edit-quiz" data-block-index="${index}"><i class="fas fa-edit"></i> Chỉnh sửa</button>
            </div>
        `;
        body.appendChild(summaryWrap);
    }

    function renderHtmlPreviewBlock(body, block, index, helpers) {
        body.innerHTML = `<div class="block-label"><i class="fab fa-html5"></i> HTML Live Preview</div>`;

        const settings = block.data.settings || {
            showSource: true,
            defaultTab: 'result',
            height: 400,
            viewport: 'responsive',
            includeBootstrap: false
        };
        const isSettingsOpen = block._settingsOpen === true;

        const settingsPanel = `
            <div class="html-settings-panel" style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:6px; padding:12px; margin-bottom:12px; ${isSettingsOpen ? 'display:block' : 'display:none'}">
                <div class="row g-2">
                    <div class="col-md-4">
                        <label class="small text-muted mb-1">Chế độ xem mặc định</label>
                        <select class="studio-select" data-block-index="${index}" data-block-field="settings.defaultTab">
                            <option value="result" ${settings.defaultTab === 'result' ? 'selected' : ''}>Kết quả (Result)</option>
                            <option value="code" ${settings.defaultTab === 'code' ? 'selected' : ''}>Mã nguồn (Code)</option>
                        </select>
                    </div>
                    <div class="col-md-4">
                        <label class="small text-muted mb-1">Kích thước Viewport</label>
                        <select class="studio-select" data-block-index="${index}" data-block-field="settings.viewport">
                            <option value="responsive" ${settings.viewport === 'responsive' ? 'selected' : ''}>Tự động (Responsive)</option>
                            <option value="mobile" ${settings.viewport === 'mobile' ? 'selected' : ''}>Điện thoại (375px)</option>
                            <option value="tablet" ${settings.viewport === 'tablet' ? 'selected' : ''}>Máy tính bảng (768px)</option>
                        </select>
                    </div>
                    <div class="col-md-4">
                        <label class="small text-muted mb-1">Chiều cao khung (px)</label>
                        <input type="number" class="studio-select" value="${settings.height || 400}" min="100" step="50" data-block-index="${index}" data-block-field="settings.height" data-block-value-type="number">
                    </div>
                    <div class="col-12 mt-2 d-flex gap-3 pt-2 border-top">
                        <label class="d-flex align-items-center cursor-pointer">
                            <input type="checkbox" class="me-2" data-block-index="${index}" data-block-field="settings.showSource" data-block-value-type="boolean" ${settings.showSource !== false ? 'checked' : ''}>
                            <span class="small">Cho phép học viên xem Code</span>
                        </label>
                        <label class="d-flex align-items-center cursor-pointer">
                            <input type="checkbox" class="me-2" data-block-index="${index}" data-block-field="settings.includeBootstrap" data-block-value-type="boolean" ${settings.includeBootstrap ? 'checked' : ''}>
                            <span class="small text-primary fw-bold"><i class="fab fa-bootstrap me-1"></i> Tự động nhúng Bootstrap 5</span>
                        </label>
                    </div>
                </div>
            </div>
        `;

        const wrapper = document.createElement('div');
        wrapper.className = 'html-preview-wrapper';
        wrapper.style.cssText = 'display: flex; flex-direction: column; border: 1px solid #cbd5e1; border-radius: 8px; overflow: hidden; background: #fff;';

        const configHeader = `
            <div style="padding: 8px 12px; background: #f1f5f9; border-bottom: 1px solid #e2e8f0; display:flex; justify-content:space-between; align-items:center;">
                <div class="small fw-bold text-secondary">SOURCE & PREVIEW</div>
                <button type="button" class="btn btn-sm btn-light border" data-block-action="toggle-html-settings" data-block-index="${index}" style="font-size:0.75rem; color:#475569;">
                    <i class="fas fa-cog"></i> Cấu hình hiển thị
                </button>
            </div>
        `;

        const columnsContainer = document.createElement('div');
        columnsContainer.style.cssText = 'display: flex; flex-wrap: wrap; min-height: 300px;';

        const leftCol = document.createElement('div');
        leftCol.style.cssText = 'flex: 1; min-width: 300px; display: flex; flex-direction: column; border-right: 1px solid #cbd5e1; background: #1e293b;';

        const textarea = document.createElement('textarea');
        textarea.className = 'studio-select';
        textarea.style.cssText = "flex: 1; border: none; resize: vertical; font-family: 'Consolas', 'Monaco', monospace; font-size: 13px; padding: 15px; background: #1e293b; color: #e2e8f0; line-height: 1.6; outline: none; min-height: 300px;";
        textarea.placeholder = '<h1>Nhập mã HTML/CSS/JS...</h1>';
        textarea.value = block.data?.html || '';
        textarea.spellcheck = false;

        const rightCol = document.createElement('div');
        rightCol.style.cssText = 'flex: 1; min-width: 300px; display: flex; flex-direction: column; background: #fff; position: relative;';

        const previewHeader = document.createElement('div');
        previewHeader.style.cssText = 'padding: 6px 10px; background: #f8fafc; border-bottom: 1px solid #e2e8f0; font-size: 0.7rem; color: #94a3b8; text-transform: uppercase; font-weight: bold; letter-spacing: 0.5px;';
        previewHeader.innerHTML = 'Kết quả thực thi';

        const iframe = document.createElement('iframe');
        iframe.style.cssText = 'flex: 1; width: 100%; border: none; background: #fff;';
        iframe.sandbox = 'allow-scripts allow-forms allow-modals allow-popups';
        iframe.referrerPolicy = 'no-referrer';

        const updatePreview = (value) => {
            iframe.srcdoc = helpers.buildSandboxedPreviewSrcdoc(value, settings.includeBootstrap, 15);
        };

        let timer;
        textarea.addEventListener('input', (event) => {
            const value = event.target.value;
            block.data.html = value;
            helpers.markStudioDirty();
            helpers.refreshStudioUI('lesson');

            window.clearTimeout(timer);
            timer = window.setTimeout(() => updatePreview(value), 800);
        });

        textarea.addEventListener('keydown', function (event) {
            if (event.key === 'Tab') {
                event.preventDefault();
                const start = this.selectionStart;
                const end = this.selectionEnd;
                this.value = this.value.substring(0, start) + '  ' + this.value.substring(end);
                this.selectionStart = this.selectionEnd = start + 2;
                block.data.html = this.value;
            }
        });

        window.setTimeout(() => updatePreview(textarea.value), 100);

        leftCol.appendChild(textarea);
        rightCol.appendChild(previewHeader);
        rightCol.appendChild(iframe);

        columnsContainer.appendChild(leftCol);
        columnsContainer.appendChild(rightCol);
        wrapper.innerHTML = configHeader;
        wrapper.appendChild(columnsContainer);

        body.innerHTML += settingsPanel;
        body.appendChild(wrapper);
    }

    function renderAccordionBlock(body, block, index, helpers) {
        body.innerHTML = `<div class="block-label" style="color: #4f46e5;"><i class="fas fa-chevron-down"></i> Accordion (Ẩn/Hiện nội dung)</div>`;
        const wrapper = document.createElement('div');
        wrapper.className = 'accordion-block-wrapper';
        wrapper.style.cssText = 'padding: 15px; border: 1px solid #cbd5e1; border-radius: 8px; background: #fff; display: flex; flex-direction: column; gap: 10px;';
        
        wrapper.innerHTML = `
            <div>
                <label style="font-size: 0.8rem; font-weight: 600; color: #475569;">Tiêu đề Accordion (luôn hiển thị)</label>
                <input type="text" class="studio-select" placeholder="Ví dụ: Gợi ý giải bài tập..." value="${(block.data.title || '').replace(/"/g, '&quot;')}" style="margin-top: 5px; font-weight: bold;">
            </div>
            <div>
                <label style="font-size: 0.8rem; font-weight: 600; color: #475569;">Nội dung (sẽ bị ẩn đi, hỗ trợ Markdown)</label>
            </div>
        `;
        
        const titleInput = wrapper.querySelector('input');
        titleInput.addEventListener('input', (e) => {
            block.data.title = e.target.value;
            helpers.markStudioDirty();
        });

        const ta = document.createElement('textarea');
        ta.className = 'easymde-input';
        ta.id = `editor-area-${index}-accordion`;
        ta.value = block.data.content || '';
        wrapper.appendChild(ta);

        body.appendChild(wrapper);
        // Note: The easymde instance will be initialized in initMarkdownEditors() because we used the class 'easymde-input'
        // wait, we need to ensure initMarkdownEditors picks it up. It picks up by `.easymde-input` but uses `el.id.split('-')[2]` to find block index.
        // Let's change the ID format so `initMarkdownEditors` can find it, or we need to handle it custom.
        // In lessonEditorV3.js: `const idx = parseInt(el.id.split('-')[2]); if(isNaN(idx) || !blocks[idx]) return;`
        // So `editor-area-${index}` will be matched! If a block has multiple textareas, they will overwrite the editor reference, which is bad.
        // For accordion, it has exactly 1 textarea, so `editor-area-${index}` is fine. But let's name it:
        ta.id = `editor-area-${index}-accordion`; // the split('-')[2] will still return index!
    }

    function renderTabsBlock(body, block, index, helpers) {
        body.innerHTML = `<div class="block-label" style="color: #db2777;"><i class="fas fa-folder-open"></i> Tabs (Điều hướng theo thẻ)</div>`;
        const wrapper = document.createElement('div');
        wrapper.className = 'tabs-block-wrapper';
        wrapper.style.cssText = 'padding: 15px; border: 1px solid #cbd5e1; border-radius: 8px; background: #fff;';

        const tabsData = block.data.tabs || [];
        
        const tabsContainer = document.createElement('div');
        tabsContainer.className = 'studio-tabs-list';
        tabsContainer.style.cssText = 'display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 15px; border-bottom: 1px solid #e2e8f0; padding-bottom: 10px;';

        let activeTabIndex = block._activeTab || 0;
        if (activeTabIndex >= tabsData.length) activeTabIndex = 0;

        const renderTabList = () => {
            tabsContainer.innerHTML = '';
            tabsData.forEach((tab, tIdx) => {
                const isAct = (tIdx === activeTabIndex);
                const btn = document.createElement('div');
                btn.style.cssText = `padding: 6px 12px; border-radius: 6px; cursor: pointer; font-size: 0.85rem; font-weight: 600; display: flex; align-items: center; gap: 8px; border: 1px solid ${isAct ? '#db2777' : '#e2e8f0'}; background: ${isAct ? '#fce7f3' : '#f8fafc'}; color: ${isAct ? '#be185d' : '#64748b'};`;
                
                const titleSpan = document.createElement('span');
                titleSpan.textContent = tab.title || `Tab ${tIdx + 1}`;
                
                const delBtn = document.createElement('i');
                delBtn.className = 'fas fa-times';
                delBtn.style.cssText = 'font-size: 0.75rem; padding: 2px; border-radius: 50%; opacity: 0.7;';
                delBtn.onmouseover = () => { delBtn.style.opacity = 1; delBtn.style.color = 'red'; };
                delBtn.onmouseout = () => { delBtn.style.opacity = 0.7; delBtn.style.color = ''; };
                delBtn.onclick = (e) => {
                    e.stopPropagation();
                    if (tabsData.length <= 1) return alert('Phải có ít nhất 1 tab!');
                    if (confirm('Xóa tab này?')) {
                        tabsData.splice(tIdx, 1);
                        if (activeTabIndex >= tabsData.length) activeTabIndex = 0;
                        block._activeTab = activeTabIndex;
                        helpers.markStudioDirty();
                        helpers.refreshStudioUI('lesson'); // Re-render the whole block
                    }
                };

                btn.appendChild(titleSpan);
                btn.appendChild(delBtn);
                btn.onclick = () => {
                    block._activeTab = tIdx;
                    helpers.refreshStudioUI('lesson');
                };
                tabsContainer.appendChild(btn);
            });

            const addBtn = document.createElement('div');
            addBtn.innerHTML = '<i class="fas fa-plus"></i> Thêm Tab';
            addBtn.style.cssText = 'padding: 6px 12px; border-radius: 6px; cursor: pointer; font-size: 0.85rem; font-weight: 600; color: #db2777; border: 1px dashed #db2777; display: flex; align-items: center; gap: 5px;';
            addBtn.onclick = () => {
                tabsData.push({ title: `Tab ${tabsData.length + 1}`, content: '' });
                block._activeTab = tabsData.length - 1;
                helpers.markStudioDirty();
                helpers.refreshStudioUI('lesson');
            };
            tabsContainer.appendChild(addBtn);
        };

        renderTabList();
        wrapper.appendChild(tabsContainer);

        // Render active tab content
        if (tabsData.length > 0) {
            const currentTab = tabsData[activeTabIndex];
            const contentDiv = document.createElement('div');
            contentDiv.style.cssText = 'display: flex; flex-direction: column; gap: 10px;';
            
            contentDiv.innerHTML = `
                <div>
                    <label style="font-size: 0.8rem; font-weight: 600; color: #475569;">Tên Tab</label>
                    <input type="text" class="studio-select" value="${(currentTab.title || '').replace(/"/g, '&quot;')}" style="margin-top: 5px; max-width: 300px;">
                </div>
                <div>
                    <label style="font-size: 0.8rem; font-weight: 600; color: #475569;">Nội dung (Hỗ trợ Markdown)</label>
                </div>
            `;

            const titleInput = contentDiv.querySelector('input');
            titleInput.addEventListener('input', (e) => {
                currentTab.title = e.target.value;
                helpers.markStudioDirty();
                // To avoid losing focus, we only update the tab label visually instead of full re-render
                tabsContainer.children[activeTabIndex].querySelector('span').textContent = e.target.value || 'Tab trống';
            });

            // For tabs, we use a standard textarea (no EasyMDE directly inside because re-rendering destroys the EasyMDE instance)
            // Wait, we can use EasyMDE! Since refreshStudioUI('lesson') calls renderBlocks, which reinits markdown editors.
            const ta = document.createElement('textarea');
            ta.className = 'easymde-input';
            // Unique ID format so that the EasyMDE init picks it up. We use split('-')[2] to get block index.
            // But we must also update the specific tab's content.
            // EasyMDE's init function in lessonEditorV3.js does:
            // blocks[idx].data.text = easyMDE.value()  <-- THIS IS A PROBLEM!
            // It assumes blocks[idx].data.text!
            // So we CANNOT use class 'easymde-input' directly without changing initMarkdownEditors!
            // We will just use standard textarea for now to avoid breaking existing logic.
            ta.style.cssText = 'width: 100%; height: 200px; border: 1px solid #cbd5e1; border-radius: 6px; padding: 10px; font-family: Consolas, monospace; font-size: 13px; line-height: 1.5; resize: vertical;';
            ta.value = currentTab.content || '';
            ta.placeholder = 'Gõ markdown ở đây...';
            
            ta.addEventListener('input', (e) => {
                currentTab.content = e.target.value;
                helpers.markStudioDirty();
            });

            contentDiv.appendChild(ta);
            wrapper.appendChild(contentDiv);
        }

        body.appendChild(wrapper);
    }

    function renderMermaidBlock(body, block, index, helpers) {
        body.innerHTML = `<div class="block-label" style="color: #0d9488;"><i class="fas fa-project-diagram"></i> Sơ đồ Mermaid (Flowchart, Mindmap...)</div>`;
        const wrapper = document.createElement('div');
        wrapper.className = 'mermaid-block-wrapper';
        wrapper.style.cssText = 'display: flex; gap: 15px; border: 1px solid #cbd5e1; border-radius: 8px; padding: 15px; background: #f8fafc; min-height: 250px;';

        const leftCol = document.createElement('div');
        leftCol.style.cssText = 'flex: 1; display: flex; flex-direction: column; gap: 5px;';
        leftCol.innerHTML = `
            <div style="font-size: 0.8rem; font-weight: 600; color: #475569; display: flex; justify-content: space-between;">
                <span>Mã nguồn Sơ đồ (Mermaid.js syntax)</span>
                <a href="https://mermaid.js.org/intro/" target="_blank" style="color: #0d9488; text-decoration: none;"><i class="fas fa-external-link-alt"></i> Hướng dẫn gõ</a>
            </div>
        `;
        
        const ta = document.createElement('textarea');
        ta.className = 'studio-select';
        ta.style.cssText = "flex: 1; border: 1px solid #cbd5e1; resize: vertical; font-family: 'Consolas', 'Monaco', monospace; font-size: 13px; padding: 10px; background: #1e293b; color: #e2e8f0; line-height: 1.5; outline: none; border-radius: 6px; min-height: 200px;";
        ta.value = block.data.code || '';
        ta.spellcheck = false;

        const rightCol = document.createElement('div');
        rightCol.style.cssText = 'flex: 1; background: #fff; border: 1px dashed #cbd5e1; border-radius: 6px; display: flex; align-items: center; justify-content: center; padding: 15px; overflow: auto; min-width: 300px;';
        
        const previewFrame = document.createElement('iframe');
        previewFrame.style.cssText = 'width: 100%; height: 100%; border: none;';
        
        const updatePreview = (code) => {
            const srcdoc = `
                <!DOCTYPE html>
                <html>
                <head>
                    <script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"><\\/script>
                    <style>body { margin: 0; padding: 0; display: flex; align-items: center; justify-content: center; height: 100vh; overflow: hidden; font-family: sans-serif; }</style>
                </head>
                <body>
                    <div class="mermaid">${code.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>
                    <script>mermaid.initialize({ startOnLoad: true, theme: 'default' });<\\/script>
                </body>
                </html>
            `;
            previewFrame.srcdoc = srcdoc;
        };

        ta.addEventListener('input', (e) => {
            block.data.code = e.target.value;
            helpers.markStudioDirty();
            updatePreview(e.target.value);
        });
        
        // Tab key support
        ta.addEventListener('keydown', function(e) {
            if (e.key === 'Tab') {
                e.preventDefault();
                const start = this.selectionStart;
                const end = this.selectionEnd;
                this.value = this.value.substring(0, start) + "    " + this.value.substring(end);
                this.selectionStart = this.selectionEnd = start + 4;
                block.data.code = this.value;
                updatePreview(this.value);
            }
        });

        if (block.data.code) {
            updatePreview(block.data.code);
        }

        leftCol.appendChild(ta);
        rightCol.appendChild(previewFrame);
        wrapper.appendChild(leftCol);
        wrapper.appendChild(rightCol);
        body.appendChild(wrapper);
    }

    window.LessonBlockRenderers = {
        createBlockFrame,
        appendInserter,
        renderVideoBlock,
        renderResourceBlock,
        renderQuestionBlock,
        renderHtmlPreviewBlock,
        renderAccordionBlock,
        renderTabsBlock,
        renderMermaidBlock
    };
})();
