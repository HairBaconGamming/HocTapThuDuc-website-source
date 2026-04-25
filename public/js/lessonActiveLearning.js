(function () {
    class LessonActiveLearning {
        constructor() {
            this.lessonId = window.LESSON_ID;
            this.annotations = [];
            this.flashcards = [];
            this.toolbarEl = null;
            this.popoverEl = null;
            this.currentSelection = null;
            this.ignoreSelectionUntil = 0;
            this.focusSelectionTimer = null;
            this.init();
        }

        init() {
            if (!this.lessonId) return;
            this.createFloatingUI();
            this.bindEvents();
            this.hydrateIfReady();
        }

        createFloatingUI() {
            this.toolbarEl = document.createElement('div');
            this.toolbarEl.className = 'lesson-selection-toolbar hidden';
            this.toolbarEl.innerHTML = `
                <button type="button" data-selection-action="highlight"><i class="fas fa-highlighter"></i><span>Tô sáng</span></button>
                <button type="button" data-selection-action="note"><i class="fas fa-note-sticky"></i><span>Ghi chú</span></button>
                <button type="button" data-selection-action="question"><i class="fas fa-circle-question"></i><span>Hỏi đoạn này</span></button>
                <button type="button" data-selection-action="flashcard"><i class="fas fa-layer-group"></i><span>Tạo flashcard</span></button>
            `;
            document.body.appendChild(this.toolbarEl);

            this.popoverEl = document.createElement('div');
            this.popoverEl.className = 'lesson-annotation-popover hidden';
            document.body.appendChild(this.popoverEl);
        }

        bindEvents() {
            document.addEventListener('lesson:content-ready', () => {
                this.hydrateIfReady();
            });

            document.addEventListener('selectionchange', () => {
                window.clearTimeout(this.focusSelectionTimer);
                this.focusSelectionTimer = window.setTimeout(() => this.refreshSelectionToolbar(), 10);
            });

            document.addEventListener('mouseup', () => {
                window.setTimeout(() => this.refreshSelectionToolbar(), 10);
            });

            document.addEventListener('scroll', () => {
                if (this.currentSelection) {
                    this.positionToolbar(this.currentSelection.rect);
                }
            }, true);

            document.addEventListener('click', (event) => {
                const toolbarButton = event.target.closest('[data-selection-action]');
                if (toolbarButton) {
                    this.handleSelectionAction(toolbarButton.dataset.selectionAction);
                    return;
                }

                const annotationMark = event.target.closest('.lesson-inline-highlight[data-annotation-id]');
                if (annotationMark) {
                    this.openAnnotationPopover(annotationMark);
                    return;
                }

                const popoverAction = event.target.closest('[data-annotation-popover-action]');
                if (popoverAction) {
                    const annotationId = popoverAction.dataset.annotationId;
                    const action = popoverAction.dataset.annotationPopoverAction;
                    if (action === 'edit') this.editAnnotation(annotationId);
                    if (action === 'delete') this.deleteAnnotation(annotationId);
                    return;
                }

                const flashcardAction = event.target.closest('[data-flashcard-action]');
                if (flashcardAction) {
                    this.handleFlashcardAction(flashcardAction);
                    return;
                }

                if (!event.target.closest('.lesson-selection-toolbar')) {
                    this.hideSelectionToolbar();
                }

                if (!event.target.closest('.lesson-annotation-popover')) {
                    this.hideAnnotationPopover();
                }
            });
        }

        hydrateIfReady() {
            const contentArea = document.getElementById('lessonContentArea');
            if (!contentArea || !contentArea.querySelector('.content-block-render')) return;
            this.loadAnnotations();
            this.loadFlashcards();
        }

        getContentArea() {
            return document.getElementById('lessonContentArea');
        }

        normalizeSelectionText(value) {
            return String(value || '').replace(/\s+/g, ' ').trim();
        }

        isSelectionBlocked(range) {
            if (!range) return true;
            const contentArea = this.getContentArea();
            const commonNode = range.commonAncestorContainer.nodeType === Node.TEXT_NODE
                ? range.commonAncestorContainer.parentElement
                : range.commonAncestorContainer;

            if (!contentArea || !commonNode || !contentArea.contains(commonNode)) return true;
            if (commonNode.closest('input, textarea, button, a, .comments-modal, .lesson-tools-drawer, .lesson-selection-toolbar')) return true;
            return false;
        }

        getClosestBlock(node) {
            if (!node) return null;
            const element = node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
            return element?.closest('.content-block-render[data-annotation-enabled="true"]') || null;
        }

        getSelectionContext() {
            if (Date.now() < this.ignoreSelectionUntil) return null;

            const selection = window.getSelection();
            if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return null;

            const range = selection.getRangeAt(0);
            if (this.isSelectionBlocked(range)) return null;

            const startBlock = this.getClosestBlock(range.startContainer);
            const endBlock = this.getClosestBlock(range.endContainer);
            if (!startBlock || !endBlock || startBlock !== endBlock) return null;

            const selectedText = this.normalizeSelectionText(selection.toString());
            if (!selectedText || selectedText.length < 2 || selectedText.length > 600) return null;

            const rootRange = range.cloneRange();
            rootRange.selectNodeContents(startBlock);
            rootRange.setEnd(range.startContainer, range.startOffset);
            const startOffset = rootRange.toString().length;
            const endOffset = startOffset + range.toString().length;

            const fullText = startBlock.textContent || '';
            const rect = range.getBoundingClientRect();
            if (!rect || (!rect.width && !rect.height)) return null;

            return {
                blockElement: startBlock,
                rect,
                anchor: {
                    blockKey: startBlock.dataset.blockKey,
                    blockType: startBlock.dataset.blockType || '',
                    selectedText,
                    prefix: fullText.slice(Math.max(0, startOffset - 60), startOffset),
                    suffix: fullText.slice(endOffset, Math.min(fullText.length, endOffset + 60)),
                    startOffset,
                    endOffset
                }
            };
        }

        refreshSelectionToolbar() {
            const context = this.getSelectionContext();
            this.currentSelection = context;
            if (!context) {
                this.hideSelectionToolbar();
                return;
            }

            this.positionToolbar(context.rect);
            this.toolbarEl.classList.remove('hidden');
        }

        positionToolbar(rect) {
            if (!this.toolbarEl || !rect) return;
            const toolbarRect = this.toolbarEl.getBoundingClientRect();
            const top = Math.max(16, rect.top + window.scrollY - toolbarRect.height - 14);
            const left = Math.min(
                window.scrollX + window.innerWidth - toolbarRect.width - 16,
                Math.max(16, rect.left + window.scrollX + (rect.width / 2) - (toolbarRect.width / 2))
            );
            this.toolbarEl.style.top = `${top}px`;
            this.toolbarEl.style.left = `${left}px`;
        }

        hideSelectionToolbar() {
            this.toolbarEl?.classList.add('hidden');
        }

        hideAnnotationPopover() {
            this.popoverEl?.classList.add('hidden');
        }

        async handleSelectionAction(action) {
            if (!this.currentSelection?.anchor) return;

            if (action === 'highlight') {
                await this.createAnnotation({
                    kind: 'highlight',
                    color: 'yellow',
                    anchor: this.currentSelection.anchor
                });
                return;
            }

            if (action === 'note') {
                await this.createNoteFromSelection();
                return;
            }

            if (action === 'question') {
                window.lessonCommentsSystem?.setPendingContext(this.cloneAnchor(this.currentSelection.anchor));
                this.clearSelection();
                return;
            }

            if (action === 'flashcard') {
                await this.createFlashcardFromSelection();
            }
        }

        clearSelection() {
            const selection = window.getSelection();
            if (selection) selection.removeAllRanges();
            this.currentSelection = null;
            this.hideSelectionToolbar();
        }

        cloneAnchor(anchor) {
            return anchor ? JSON.parse(JSON.stringify(anchor)) : null;
        }

        getModalClasses() {
            return {
                popup: 'lesson-smart-modal-popup',
                title: 'lesson-smart-modal-title',
                htmlContainer: 'lesson-smart-modal-html',
                confirmButton: 'lesson-smart-modal-confirm',
                cancelButton: 'lesson-smart-modal-cancel'
            };
        }

        async createAnnotation(payload) {
            try {
                const response = await fetch(`/api/annotations/lesson/${this.lessonId}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                const data = await response.json();
                if (!response.ok) {
                    throw new Error(data.message || 'Không thể tạo highlight.');
                }

                this.clearSelection();
                await this.loadAnnotations();
            } catch (error) {
                window.Swal?.fire('Chưa tạo được', error.message || 'Không thể tạo highlight.', 'error');
            }
        }

        async createNoteFromSelection() {
            if (!window.Swal) return;
            const anchor = this.cloneAnchor(this.currentSelection?.anchor);
            if (!anchor) return;

            const result = await Swal.fire({
                title: 'Ghi chú ngay tại đoạn đang đọc',
                html: `
                    <div class="lesson-smart-modal-shell">
                        <div class="lesson-smart-modal-context">
                            <span class="lesson-smart-modal-kicker">Đoạn đang chọn</span>
                            <strong>${this.escapeHtml(anchor.selectedText || 'Đoạn trích hiện tại')}</strong>
                        </div>
                        <div class="lesson-smart-modal-field">
                            <label for="lesson-inline-note">Ghi chú của bạn</label>
                            <textarea id="lesson-inline-note" class="swal2-textarea" placeholder="Viết điều bạn muốn ghi nhớ hoặc hỏi lại..." style="display:block;width:100%;min-height:160px;"></textarea>
                        </div>
                        <div class="lesson-smart-modal-field">
                            <label for="lesson-inline-note-color">Màu đánh dấu</label>
                            <select id="lesson-inline-note-color" class="swal2-select" style="display:block;width:100%;margin-top:12px;">
                                <option value="yellow">Vàng dịu</option>
                                <option value="blue">Xanh nhạt</option>
                                <option value="green">Xanh lá</option>
                                <option value="pink">Hồng</option>
                                <option value="purple">Tím</option>
                            </select>
                        </div>
                    </div>
                `,
                focusConfirm: false,
                showCancelButton: true,
                buttonsStyling: false,
                customClass: this.getModalClasses(),
                confirmButtonText: 'Lưu ghi chú',
                cancelButtonText: 'Đóng',
                preConfirm: () => {
                    const note = document.getElementById('lesson-inline-note')?.value?.trim();
                    const color = document.getElementById('lesson-inline-note-color')?.value || 'yellow';
                    if (!note) {
                        Swal.showValidationMessage('Ghi chú không được để trống.');
                        return false;
                    }
                    return { note, color };
                }
            });

            if (!result.isConfirmed || !result.value) return;

            await this.createAnnotation({
                kind: 'note',
                color: result.value.color,
                note: result.value.note,
                anchor
            });
        }

        async createFlashcardFromSelection() {
            if (!window.Swal) return;

            const anchor = this.cloneAnchor(this.currentSelection?.anchor);
            if (!anchor) return;
            const selectedText = anchor.selectedText;
            const result = await Swal.fire({
                title: 'Tạo checkpoint flashcard',
                html: `
                    <div class="lesson-smart-modal-shell">
                        <div class="lesson-smart-modal-context">
                            <span class="lesson-smart-modal-kicker">Checkpoint từ đoạn trích</span>
                            <strong>${this.escapeHtml(selectedText || 'Đoạn trích hiện tại')}</strong>
                        </div>
                        <div class="lesson-smart-modal-field">
                            <label for="lesson-inline-flashcard-front">Mặt trước</label>
                            <input id="lesson-inline-flashcard-front" class="swal2-input" placeholder="Mặt trước: câu hỏi hoặc tín hiệu gợi nhớ" value="Ý chính của đoạn này là gì?">
                        </div>
                        <div class="lesson-smart-modal-field">
                            <label for="lesson-inline-flashcard-back">Mặt sau</label>
                            <textarea id="lesson-inline-flashcard-back" class="swal2-textarea" placeholder="Mặt sau: câu trả lời / ghi nhớ chính" style="display:block;width:100%;min-height:160px;">${this.escapeHtml(selectedText || '')}</textarea>
                        </div>
                    </div>
                `,
                showCancelButton: true,
                buttonsStyling: false,
                customClass: this.getModalClasses(),
                confirmButtonText: 'Tạo flashcard',
                cancelButtonText: 'Đóng',
                preConfirm: () => {
                    const front = document.getElementById('lesson-inline-flashcard-front')?.value?.trim();
                    const back = document.getElementById('lesson-inline-flashcard-back')?.value?.trim();
                    if (!front || !back) {
                        Swal.showValidationMessage('Flashcard cần đủ mặt trước và mặt sau.');
                        return false;
                    }
                    return { front, back };
                }
            });

            if (!result.isConfirmed || !result.value) return;

            try {
                const response = await fetch(`/api/flashcards/lesson/${this.lessonId}/inline`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        front: result.value.front,
                        back: result.value.back,
                        anchor
                    })
                });
                const data = await response.json();
                if (!response.ok) {
                    throw new Error(data.message || 'Không thể tạo flashcard.');
                }

                this.clearSelection();
                await this.loadFlashcards();
            } catch (error) {
                Swal.fire('Chưa tạo được', error.message || 'Không thể tạo flashcard.', 'error');
            }
        }

        async loadAnnotations() {
            try {
                const response = await fetch(`/api/annotations/lesson/${this.lessonId}`);
                const data = await response.json();
                if (!response.ok) throw new Error(data.message || 'Không thể tải annotation.');
                this.annotations = Array.isArray(data.annotations) ? data.annotations : [];
                this.renderAnnotations();
            } catch (error) {
                console.error('Load annotations error:', error);
            }
        }

        async loadFlashcards() {
            try {
                const response = await fetch(`/api/flashcards/lesson/${this.lessonId}/inline`);
                const data = await response.json();
                if (!response.ok) throw new Error(data.message || 'Không thể tải flashcard.');
                this.flashcards = Array.isArray(data.cards) ? data.cards : [];
                this.renderInlineFlashcards();
            } catch (error) {
                console.error('Load inline flashcards error:', error);
            }
        }

        restoreAnnotationBlocks() {
            document.querySelectorAll('.content-block-render[data-annotation-enabled="true"]').forEach((block) => {
                if (typeof block.__lessonOriginalHtml === 'string') {
                    block.innerHTML = block.__lessonOriginalHtml;
                    if (window.renderMathInElement && ['text', 'callout'].includes(block.dataset.blockType)) {
                        renderMathInElement(block, {
                            delimiters: [
                                { left: '$$', right: '$$', display: true },
                                { left: '$', right: '$', display: false }
                            ],
                            throwOnError: false
                        });
                    }
                    if (window.Prism && block.dataset.blockType === 'code') {
                        Prism.highlightAllUnder(block);
                    }
                }
            });
        }

        createRangeFromOffsets(root, startOffset, endOffset) {
            const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
            let currentOffset = 0;
            let startNode = null;
            let endNode = null;
            let localStart = 0;
            let localEnd = 0;

            while (walker.nextNode()) {
                const node = walker.currentNode;
                const length = node.nodeValue.length;
                const nodeStart = currentOffset;
                const nodeEnd = currentOffset + length;

                if (!startNode && startOffset >= nodeStart && startOffset <= nodeEnd) {
                    startNode = node;
                    localStart = startOffset - nodeStart;
                }

                if (!endNode && endOffset >= nodeStart && endOffset <= nodeEnd) {
                    endNode = node;
                    localEnd = endOffset - nodeStart;
                    break;
                }

                currentOffset += length;
            }

            if (!startNode || !endNode) return null;

            const range = document.createRange();
            range.setStart(startNode, localStart);
            range.setEnd(endNode, localEnd);
            return range;
        }

        wrapRange(range, annotation) {
            const mark = document.createElement('mark');
            mark.className = `lesson-inline-highlight is-${annotation.color || 'yellow'} ${annotation.kind === 'note' ? 'has-note' : ''}`.trim();
            mark.dataset.annotationId = annotation._id;
            mark.dataset.annotationKind = annotation.kind;
            mark.setAttribute('tabindex', '0');

            try {
                range.surroundContents(mark);
            } catch (error) {
                const fragment = range.extractContents();
                mark.appendChild(fragment);
                range.insertNode(mark);
            }
        }

        renderAnnotations() {
            this.restoreAnnotationBlocks();
            const grouped = new Map();

            this.annotations.forEach((annotation) => {
                const key = annotation.anchor?.blockKey;
                if (!key) return;
                if (!grouped.has(key)) grouped.set(key, []);
                grouped.get(key).push(annotation);
            });

            grouped.forEach((items, blockKey) => {
                const block = document.querySelector(`.content-block-render[data-block-key="${this.escapeSelector(blockKey)}"]`);
                if (!block) return;

                items
                    .slice()
                    .sort((a, b) => b.anchor.startOffset - a.anchor.startOffset)
                    .forEach((annotation) => {
                        const range = this.createRangeFromOffsets(block, annotation.anchor.startOffset, annotation.anchor.endOffset);
                        if (range) this.wrapRange(range, annotation);
                    });
            });

            if (window.LessonWorkspace) {
                window.LessonWorkspace.generateTableOfContents();
                window.LessonWorkspace.renderSectionStrip();
                window.LessonWorkspace.updateReadingProgress();
            }
        }

        renderInlineFlashcards() {
            document.querySelectorAll('.lesson-inline-checkpoints').forEach((node) => node.remove());
            if (!Array.isArray(this.flashcards) || this.flashcards.length === 0) return;

            const grouped = new Map();
            this.flashcards.forEach((card) => {
                const key = card.anchor?.blockKey;
                if (!key) return;
                if (!grouped.has(key)) grouped.set(key, []);
                grouped.get(key).push(card);
            });

            grouped.forEach((cards, blockKey) => {
                const block = document.querySelector(`.content-block-render[data-block-key="${this.escapeSelector(blockKey)}"]`);
                if (!block) return;

                const shell = document.createElement('section');
                shell.className = 'lesson-inline-checkpoints';

                const head = document.createElement('div');
                head.className = 'lesson-inline-checkpoints-head';
                head.innerHTML = '<span>Checkpoint ghi nhớ</span><strong>Dừng 10 giây để active recall</strong>';
                shell.appendChild(head);

                cards.forEach((card) => shell.appendChild(this.buildFlashcardNode(card)));
                block.insertAdjacentElement('afterend', shell);
            });
        }

        buildFlashcardNode(card) {
            const cardEl = document.createElement('article');
            cardEl.className = 'lesson-inline-flashcard';
            cardEl.dataset.cardId = card._id;
            cardEl.dataset.blockKey = card.anchor?.blockKey || '';

            const headerHtml = (title, cardId) => `
                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">
                    <span class="lesson-inline-flashcard-kicker">${title}</span>
                    <div style="display: flex; gap: 4px; margin-top: -4px; margin-right: -4px;">
                        <button type="button" data-flashcard-action="edit" data-card-id="${cardId}" title="Sửa" style="background: none; border: none; color: var(--lesson-muted); cursor: pointer; padding: 4px; border-radius: 4px;"><i class="fas fa-pen" style="font-size: 0.8em;"></i></button>
                        <button type="button" data-flashcard-action="delete" data-card-id="${cardId}" title="Xóa" style="background: none; border: none; color: var(--lesson-danger); cursor: pointer; padding: 4px; border-radius: 4px;"><i class="fas fa-trash" style="font-size: 0.8em;"></i></button>
                    </div>
                </div>
            `;

            const front = document.createElement('div');
            front.className = 'lesson-inline-flashcard-face is-front';
            front.innerHTML = `${headerHtml('Mặt trước', card._id)}<strong>${this.escapeHtml(card.front)}</strong>`;

            const back = document.createElement('div');
            back.className = 'lesson-inline-flashcard-face is-back hidden';
            back.innerHTML = `${headerHtml('Mặt sau', card._id)}<strong>${this.escapeHtml(card.back)}</strong>`;

            const actions = document.createElement('div');
            actions.className = 'lesson-inline-flashcard-actions';
            actions.innerHTML = `
                <button type="button" class="lesson-inline-flashcard-button" data-flashcard-action="flip" data-card-id="${card._id}"><i class="fas fa-sync-alt"></i> Lật thẻ</button>
                <div class="lesson-inline-flashcard-review-actions hidden" style="display: flex; gap: 8px;">
                    <button type="button" class="lesson-inline-flashcard-button is-muted" data-flashcard-action="hard" data-card-id="${card._id}">Chưa nhớ</button>
                    <button type="button" class="lesson-inline-flashcard-button is-primary" data-flashcard-action="easy" data-card-id="${card._id}">Nhớ rồi</button>
                </div>
            `;

            cardEl.appendChild(front);
            cardEl.appendChild(back);
            cardEl.appendChild(actions);
            return cardEl;
        }

        async handleFlashcardAction(button) {
            const cardId = button.dataset.cardId;
            const action = button.dataset.flashcardAction;
            const cardEl = button.closest('.lesson-inline-flashcard');
            if (!cardId || !cardEl) return;

            if (action === 'delete') {
                this.deleteFlashcard(cardId);
                return;
            }

            if (action === 'edit') {
                this.editFlashcard(cardId);
                return;
            }

            if (action === 'flip') {
                const front = cardEl.querySelector('.is-front');
                const back = cardEl.querySelector('.is-back');
                const isFrontHidden = front.classList.contains('hidden');

                if (isFrontHidden) {
                    front.classList.remove('hidden');
                    back.classList.add('hidden');
                } else {
                    front.classList.add('hidden');
                    back.classList.remove('hidden');
                    if (!cardEl.classList.contains('is-reviewed')) {
                        const reviewActions = cardEl.querySelector('.lesson-inline-flashcard-review-actions');
                        if (reviewActions) reviewActions.classList.remove('hidden');
                    }
                }
                return;
            }

            const quality = action === 'easy' ? 4 : 1;
            try {
                const response = await fetch('/api/flashcards/submit', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ cardId, quality })
                });
                const data = await response.json();
                if (!response.ok) throw new Error(data.error || 'Không thể ghi nhận lần ôn tập.');

                cardEl.classList.add('is-reviewed');
                cardEl.querySelector('.lesson-inline-flashcard-actions').innerHTML = `
                    <span class="lesson-inline-flashcard-status">
                        ${action === 'easy' ? 'Đã nhớ tốt. Hẹn ôn lại sau.' : 'Đã ghi nhận là còn khó. Hệ thống sẽ nhắc lại sớm.'}
                    </span>
                `;

                document.dispatchEvent(new CustomEvent('lesson:flashcard-reviewed', {
                    detail: {
                        cardId,
                        blockKey: cardEl.dataset.blockKey || '',
                        quality,
                        bonusFertilizer: Number(data.bonusFertilizer || 0)
                    }
                }));

                if (Number(data.bonusFertilizer || 0) > 0 && window.lessonGamification?.showPassiveRewardToast) {
                    window.lessonGamification.showPassiveRewardToast({
                        rewardType: 'fertilizer',
                        rewardAmount: Number(data.bonusFertilizer || 0),
                        sourceLabel: 'Thưởng nhớ thẻ tốt'
                    });
                }
            } catch (error) {
                window.Swal?.fire('Chưa ghi nhận được', error.message || 'Không thể cập nhật flashcard.', 'error');
            }
        }

        async deleteFlashcard(cardId) {
            const confirm = window.confirm('Bạn có chắc muốn xóa flashcard này?');
            if (!confirm) return;

            try {
                const response = await fetch(`/api/flashcards/${cardId}`, { method: 'DELETE' });
                const data = await response.json();
                if (!response.ok) throw new Error(data.message || 'Không thể xóa flashcard.');
                await this.loadFlashcards();
            } catch (error) {
                window.Swal?.fire('Chưa xóa được', error.message || 'Không thể xóa flashcard.', 'error');
            }
        }

        async editFlashcard(cardId) {
            const card = this.flashcards.find(c => String(c._id) === String(cardId));
            if (!card || !window.Swal) return;

            const result = await Swal.fire({
                title: 'Sửa flashcard',
                html: `
                    <div class="lesson-smart-modal-shell">
                        <div class="lesson-smart-modal-field">
                            <label for="lesson-edit-flashcard-front">Mặt trước</label>
                            <input id="lesson-edit-flashcard-front" class="swal2-input" value="${this.escapeHtml(card.front || '')}">
                        </div>
                        <div class="lesson-smart-modal-field">
                            <label for="lesson-edit-flashcard-back">Mặt sau</label>
                            <textarea id="lesson-edit-flashcard-back" class="swal2-textarea" style="display:block;width:100%;min-height:160px;">${this.escapeHtml(card.back || '')}</textarea>
                        </div>
                    </div>
                `,
                showCancelButton: true,
                buttonsStyling: false,
                customClass: this.getModalClasses(),
                confirmButtonText: 'Lưu',
                cancelButtonText: 'Đóng',
                preConfirm: () => {
                    const front = document.getElementById('lesson-edit-flashcard-front')?.value?.trim();
                    const back = document.getElementById('lesson-edit-flashcard-back')?.value?.trim();
                    if (!front || !back) {
                        Swal.showValidationMessage('Vui lòng nhập đủ 2 mặt.');
                        return false;
                    }
                    return { front, back };
                }
            });

            if (!result.isConfirmed) return;

            try {
                const response = await fetch(`/api/flashcards/${cardId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(result.value)
                });
                const data = await response.json();
                if (!response.ok) throw new Error(data.message || 'Không thể sửa flashcard.');
                await this.loadFlashcards();
            } catch (error) {
                Swal.fire('Chưa lưu được', error.message || 'Không thể sửa flashcard.', 'error');
            }
        }

        openAnnotationPopover(mark) {
            const annotation = this.annotations.find((item) => String(item._id) === String(mark.dataset.annotationId));
            if (!annotation || !this.popoverEl) return;

            this.popoverEl.innerHTML = `
                <div class="lesson-annotation-popover-head">
                    <span>${annotation.kind === 'note' ? 'Ghi chú tại chỗ' : 'Highlight đã lưu'}</span>
                </div>
                <div class="lesson-annotation-popover-quote">${this.escapeHtml(annotation.anchor.selectedText)}</div>
                ${annotation.note ? `<div class="lesson-annotation-popover-note">${this.escapeHtml(annotation.note)}</div>` : ''}
                <div class="lesson-annotation-popover-actions">
                    ${annotation.kind === 'note' ? `<button type="button" data-annotation-popover-action="edit" data-annotation-id="${annotation._id}">Sửa ghi chú</button>` : ''}
                    <button type="button" data-annotation-popover-action="delete" data-annotation-id="${annotation._id}">Xóa</button>
                </div>
            `;

            const rect = mark.getBoundingClientRect();
            this.popoverEl.style.top = `${window.scrollY + rect.bottom + 12}px`;
            this.popoverEl.style.left = `${Math.max(16, window.scrollX + rect.left)}px`;
            this.popoverEl.classList.remove('hidden');
        }

        async editAnnotation(annotationId) {
            const annotation = this.annotations.find((item) => String(item._id) === String(annotationId));
            if (!annotation || !window.Swal) return;

            const result = await Swal.fire({
                title: 'Cập nhật ghi chú',
                html: `
                    <div class="lesson-smart-modal-shell">
                        <div class="lesson-smart-modal-context">
                            <span class="lesson-smart-modal-kicker">Đang chỉnh sửa</span>
                            <strong>${this.escapeHtml(annotation.anchor?.selectedText || 'Ghi chú trong bài học')}</strong>
                        </div>
                        <div class="lesson-smart-modal-field">
                            <label for="lesson-edit-note">Nội dung ghi chú</label>
                            <textarea id="lesson-edit-note" class="swal2-textarea" placeholder="Viết lại ghi chú..." style="display:block;width:100%;min-height:160px;">${this.escapeHtml(annotation.note || '')}</textarea>
                        </div>
                    </div>
                `,
                showCancelButton: true,
                buttonsStyling: false,
                customClass: this.getModalClasses(),
                confirmButtonText: 'Lưu',
                cancelButtonText: 'Đóng',
                preConfirm: () => {
                    const value = document.getElementById('lesson-edit-note')?.value?.trim();
                    if (!value) {
                        Swal.showValidationMessage('Ghi chú không được để trống.');
                        return false;
                    }
                    return value;
                }
            });

            if (!result.isConfirmed) return;

            try {
                const response = await fetch(`/api/annotations/${annotationId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ note: result.value })
                });
                const data = await response.json();
                if (!response.ok) throw new Error(data.message || 'Không thể cập nhật ghi chú.');
                this.hideAnnotationPopover();
                await this.loadAnnotations();
            } catch (error) {
                Swal.fire('Chưa lưu được', error.message || 'Không thể cập nhật ghi chú.', 'error');
            }
        }

        async deleteAnnotation(annotationId) {
            const confirm = window.confirm('Xóa highlight hoặc ghi chú này?');
            if (!confirm) return;

            try {
                const response = await fetch(`/api/annotations/${annotationId}`, { method: 'DELETE' });
                const data = await response.json();
                if (!response.ok) throw new Error(data.message || 'Không thể xóa annotation.');
                this.hideAnnotationPopover();
                await this.loadAnnotations();
            } catch (error) {
                window.Swal?.fire('Chưa xóa được', error.message || 'Không thể xóa annotation.', 'error');
            }
        }

        focusContextAnchor(anchor) {
            if (!anchor?.blockKey) return;

            this.ignoreSelectionUntil = Date.now() + 1800;
            this.clearSelection();

            const block = window.LessonWorkspace?.scrollToBlockKey
                ? window.LessonWorkspace.scrollToBlockKey(anchor.blockKey)
                : document.querySelector(`.content-block-render[data-block-key="${this.escapeSelector(anchor.blockKey)}"]`);

            if (!block) return;

            const range = this.createRangeFromOffsets(block, anchor.startOffset, anchor.endOffset);
            block.classList.add('lesson-context-target');
            window.clearTimeout(block.__contextFocusTimer);
            block.__contextFocusTimer = window.setTimeout(() => {
                block.classList.remove('lesson-context-target');
            }, 1800);

            if (!range) return;

            const selection = window.getSelection();
            if (selection) {
                selection.removeAllRanges();
                selection.addRange(range);
                window.setTimeout(() => {
                    selection.removeAllRanges();
                }, 1600);
            }
        }

        escapeHtml(value) {
            const div = document.createElement('div');
            div.textContent = value || '';
            return div.innerHTML;
        }

        escapeSelector(value) {
            if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
                return CSS.escape(value);
            }
            return String(value).replace(/"/g, '\\"');
        }
    }

    document.addEventListener('DOMContentLoaded', () => {
        window.lessonActiveLearning = new LessonActiveLearning();
    });
})();
