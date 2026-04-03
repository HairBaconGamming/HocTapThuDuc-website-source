(function () {
    const STORAGE_KEY = "lesson-editor-v4-layout";

    function $(selector) {
        return document.querySelector(selector);
    }

    function createEl(tag, className, text) {
        const el = document.createElement(tag);
        if (className) el.className = className;
        if (text != null) el.textContent = text;
        return el;
    }

    function readStorage() {
        try {
            const raw = window.localStorage.getItem(STORAGE_KEY);
            return raw ? JSON.parse(raw) : {};
        } catch (error) {
            return {};
        }
    }

    const state = Object.assign(
        {
            previewMode: "desktop",
            focus: false,
            chromeCollapsed: false,
            wideCanvas: false,
            dockState: { left: "open", right: "open" },
            widths: { left: 324, right: 332 },
            activeTabs: { left: "left-structure", right: "right-properties" }
        },
        readStorage()
    );

    function persistState() {
        try {
            window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        } catch (error) {
            // ignore storage errors
        }
    }

    function getSnapshot() {
        if (window.LessonStudioBridge && typeof window.LessonStudioBridge.getSnapshot === "function") {
            return window.LessonStudioBridge.getSnapshot();
        }

        return {
            blocks: [],
            activeLessonId: "",
            activeContext: "course",
            studioState: { lessonDirty: false, courseDirty: false, lastSavedAt: null },
            metrics: { blocks: 0, words: 0, media: 0, readTime: 0 },
            title: ""
        };
    }

    function applyWidths() {
        document.documentElement.style.setProperty("--v4-left-width", `${state.widths.left || 324}px`);
        document.documentElement.style.setProperty("--v4-right-width", `${state.widths.right || 332}px`);
    }

    function setActiveDockTab(side, target, shouldPersist = true) {
        const shell = side === "left" ? $("#studioLeftDock") : $("#studioRightDock");
        if (!shell || !target) return;

        const tabGroup = shell.querySelector(`[data-dock-tabs="${side}"]`);
        if (!tabGroup) return;

        state.activeTabs[side] = target;
        tabGroup.querySelectorAll("button[data-dock-target]").forEach((button) => {
            button.classList.toggle("is-active", button.dataset.dockTarget === target);
        });
        shell.querySelectorAll(".studio-dock-mini-button[data-dock-mini-target]").forEach((button) => {
            button.classList.toggle("is-active", button.dataset.dockMiniTarget === target);
        });
        shell.querySelectorAll(".studio-dock-panel").forEach((panel) => {
            panel.classList.toggle("is-active", panel.dataset.dockPanel === target);
        });
        if (side === "left") applyNavigatorSearch();
        if (side === "right") applyInspectorSearch();
        if (shouldPersist) persistState();
    }

    function applyPreviewMode(mode, shouldPersist = true) {
        state.previewMode = mode;
        const mainShell = $("#studioMainShell");
        if (mainShell) mainShell.dataset.previewMode = mode;

        document.querySelectorAll("button[data-preview-mode]").forEach((button) => {
            button.classList.toggle("is-active", button.dataset.previewMode === mode);
        });

        const modeLabel = $("#v4CanvasModeLabel");
        if (modeLabel) modeLabel.textContent = mode.charAt(0).toUpperCase() + mode.slice(1);

        if (shouldPersist) persistState();
    }

    function applyFocusMode(shouldPersist = true) {
        const root = $(".studio-v4-root");
        if (root) root.classList.toggle("is-focus", !!state.focus);
        if (shouldPersist) persistState();
    }

    function syncLayoutButtons() {
        document.querySelectorAll("[data-layout-action]").forEach((button) => {
            const action = button.dataset.layoutAction;
            let isActive = false;

            if (action === "toggle-left-dock") isActive = state.dockState.left !== "collapsed";
            else if (action === "toggle-right-dock") isActive = state.dockState.right !== "collapsed";
            else if (action === "toggle-wide-canvas") isActive = !!state.wideCanvas;
            else if (action === "toggle-chrome") isActive = !!state.chromeCollapsed;

            button.classList.toggle("is-active", isActive);
            button.setAttribute("aria-pressed", isActive ? "true" : "false");
        });
    }

    function applyChromeCollapse(shouldPersist = true) {
        const root = $(".studio-v4-root");
        if (root) root.classList.toggle("is-chrome-collapsed", !!state.chromeCollapsed);
        syncLayoutButtons();
        if (shouldPersist) persistState();
    }

    function applyWideCanvas(shouldPersist = true) {
        const root = $(".studio-v4-root");
        if (root) root.classList.toggle("is-wide-canvas", !!state.wideCanvas);
        syncLayoutButtons();
        if (shouldPersist) persistState();
    }

    function applyDockState(side, shouldPersist = true) {
        const shell = side === "left" ? $("#studioLeftDock") : $("#studioRightDock");
        if (!shell) return;
        shell.dataset.dockState = state.dockState[side] || "open";
        syncLayoutButtons();
        if (shouldPersist) persistState();
    }

    function applyStoredLayout() {
        applyPreviewMode(state.previewMode || "desktop", false);
        applyFocusMode(false);
        applyChromeCollapse(false);
        applyDockState("left", false);
        applyDockState("right", false);
        applyWideCanvas(false);
        applyWidths();
        setActiveDockTab("left", state.activeTabs.left || "left-structure", false);
        setActiveDockTab("right", state.activeTabs.right || "right-properties", false);
        syncLayoutButtons();
    }

    function bindTabs() {
        document.querySelectorAll("[data-dock-tabs]").forEach((tabGroup) => {
            tabGroup.addEventListener("click", (event) => {
                const button = event.target.closest("button[data-dock-target]");
                if (!button) return;

                const side = tabGroup.dataset.dockTabs;
                setActiveDockTab(side, button.dataset.dockTarget);
            });
        });
    }

    function bindPreviewButtons() {
        document.addEventListener("click", (event) => {
            const button = event.target.closest("button[data-preview-mode]");
            if (!button) return;
            applyPreviewMode(button.dataset.previewMode);
        });
    }

    function toggleFocusMode() {
        state.focus = !state.focus;
        applyFocusMode();
    }

    function bindFocusToggles() {
        ["#studioFocusToggle", "#studioFocusToggleSecondary"].forEach((selector) => {
            const button = $(selector);
            if (button) button.addEventListener("click", toggleFocusMode);
        });
    }

    function toggleChromeCompact() {
        state.chromeCollapsed = !state.chromeCollapsed;
        applyChromeCollapse();
    }

    function toggleDockSide(side) {
        state.dockState[side] = state.dockState[side] === "collapsed" ? "open" : "collapsed";
        if (state.wideCanvas && state.dockState[side] !== "collapsed") {
            state.wideCanvas = false;
            applyWideCanvas(false);
        }
        applyDockState(side);
    }

    function toggleWideCanvas() {
        state.wideCanvas = !state.wideCanvas;
        if (state.wideCanvas) {
            state.dockState.left = "collapsed";
            state.dockState.right = "collapsed";
        } else {
            state.dockState.left = "open";
            state.dockState.right = "open";
        }
        applyDockState("left", false);
        applyDockState("right", false);
        applyWideCanvas();
    }

    function bindDockToggles() {
        document.querySelectorAll("[data-dock-toggle]").forEach((button) => {
            button.addEventListener("click", () => {
                toggleDockSide(button.dataset.dockToggle);
            });
        });
    }

    function bindLayoutActions() {
        document.addEventListener("click", (event) => {
            const button = event.target.closest("[data-layout-action]");
            if (!button) return;

            const action = button.dataset.layoutAction;
            if (action === "toggle-chrome") toggleChromeCompact();
            else if (action === "toggle-left-dock") toggleDockSide("left");
            else if (action === "toggle-right-dock") toggleDockSide("right");
            else if (action === "toggle-wide-canvas") toggleWideCanvas();
        });
    }

    function bindDockMiniRail() {
        document.querySelectorAll("[data-dock-mini]").forEach((rail) => {
            rail.addEventListener("click", (event) => {
                const button = event.target.closest("[data-dock-mini-target]");
                if (!button) return;

                const side = rail.dataset.dockMini;
                if (!side) return;

                if (state.dockState[side] === "collapsed") {
                    state.dockState[side] = "open";
                    if (state.wideCanvas) {
                        state.wideCanvas = false;
                        applyWideCanvas(false);
                    }
                    applyDockState(side, false);
                }

                setActiveDockTab(side, button.dataset.dockMiniTarget);
                persistState();
            });
        });
    }

    function bindResizers() {
        document.querySelectorAll(".studio-dock-resizer").forEach((handle) => {
            handle.addEventListener("pointerdown", (event) => {
                const side = handle.dataset.resizer;
                const startX = event.clientX;
                const startLeft = state.widths.left || 324;
                const startRight = state.widths.right || 332;

                function onMove(moveEvent) {
                    const delta = moveEvent.clientX - startX;
                    if (side === "left") {
                        state.widths.left = Math.max(260, Math.min(560, startLeft + delta));
                    } else {
                        state.widths.right = Math.max(280, Math.min(620, startRight - delta));
                    }
                    applyWidths();
                }

                function onUp() {
                    window.removeEventListener("pointermove", onMove);
                    window.removeEventListener("pointerup", onUp);
                    persistState();
                }

                window.addEventListener("pointermove", onMove);
                window.addEventListener("pointerup", onUp);
            });
        });
    }

    function bindQuickActions() {
        document.querySelectorAll("[data-studio-action]").forEach((button) => {
            button.addEventListener("click", () => {
                if (!window.LessonStudioBridge) return;
                const action = button.dataset.studioAction;
                if (action === "quick-save" || action === "quick-draft") window.LessonStudioBridge.quickDraft();
                if (action === "quick-publish") window.LessonStudioBridge.quickPublish();
            });
        });
    }

    function normalizeText(value) {
        return String(value || "").toLowerCase().trim();
    }

    function applyNavigatorSearch() {
        const query = normalizeText($("#studioNavigatorSearch")?.value);

        document.querySelectorAll(".tree-unit").forEach((unitEl) => {
            const unitInput = unitEl.querySelector(".unit-title-input");
            const unitMatch = normalizeText(unitInput?.value).includes(query);
            let lessonMatch = false;

            unitEl.querySelectorAll(".tree-lesson").forEach((lessonEl) => {
                const lessonInput = lessonEl.querySelector(".lesson-title-input");
                const matched = !query || normalizeText(lessonInput?.value).includes(query);
                lessonEl.style.display = matched ? "" : "none";
                if (matched) lessonMatch = true;
            });

            unitEl.style.display = !query || unitMatch || lessonMatch ? "" : "none";
        });

        ["#v4OutlineTree", "#v4AssetInventory", "#v4RevisionQuickList"].forEach((selector) => {
            const container = $(selector);
            if (!container) return;

            container.querySelectorAll(".studio-smart-item, .studio-smart-empty").forEach((item) => {
                const matched = !query || normalizeText(item.textContent).includes(query);
                item.style.display = matched ? "" : "none";
            });
        });
    }

    function applyInspectorSearch() {
        const query = normalizeText($("#studioInspectorSearch")?.value);
        const activePanel = $("#studioRightDock .studio-dock-panel.is-active");
        if (!activePanel) return;

        activePanel.querySelectorAll(".control-item, .studio-help-card, .studio-smart-group, .studio-smart-item, .studio-inspector-command").forEach((item) => {
            const matched = !query || normalizeText(item.textContent).includes(query);
            item.style.display = matched ? "" : "none";
        });
    }

    function bindDockSearch() {
        const navigatorSearch = $("#studioNavigatorSearch");
        if (navigatorSearch) navigatorSearch.addEventListener("input", applyNavigatorSearch);

        const inspectorSearch = $("#studioInspectorSearch");
        if (inspectorSearch) inspectorSearch.addEventListener("input", applyInspectorSearch);
    }

    function describeBlock(block, index) {
        const typeMap = {
            text: "Văn bản",
            image: "Hình ảnh",
            video: "Video",
            resource: "Tài liệu",
            code: "Code",
            question: "Câu hỏi",
            quiz: "Câu hỏi",
            callout: "Ghi chú",
            html_preview: "HTML"
        };
        const label = typeMap[block.type] || `Block ${index + 1}`;
        const text = block?.data?.text || block?.data?.title || block?.data?.caption || block?.data?.code || "";
        return {
            label,
            summary: String(text).replace(/\s+/g, " ").trim().slice(0, 96) || "Chưa có nội dung tóm tắt."
        };
    }

    function scrollToBlock(index) {
        const target = document.querySelector(`.content-block[data-index="${index}"]`);
        if (!target) return;

        target.scrollIntoView({ behavior: "smooth", block: "center" });
        target.classList.add("is-v4-spotlight");
        window.setTimeout(() => target.classList.remove("is-v4-spotlight"), 1500);
    }

    function createSmartItem({ title, text, tone = "", interactive = false, onClick = null }) {
        const item = createEl("div", `studio-smart-item${tone ? ` is-${tone}` : ""}${interactive ? " is-interactive" : ""}`);
        item.appendChild(createEl("strong", "", title));
        item.appendChild(createEl("span", "", text));
        if (interactive && typeof onClick === "function") item.addEventListener("click", onClick);
        return item;
    }

    function setTabText(side, target, text) {
        const shell = side === "left" ? $("#studioLeftDock") : $("#studioRightDock");
        if (!shell) return;
        const button = shell.querySelector(`button[data-dock-target="${target}"]`);
        if (button) button.textContent = text;
    }

    function renderOutline(snapshot) {
        const container = $("#v4OutlineTree");
        if (!container) return;
        container.innerHTML = "";

        const blocks = snapshot.blocks || [];
        const summary = $("#v4OutlineSummary");
        if (summary) summary.textContent = `${blocks.length} mục`;

        if (!blocks.length) {
            container.appendChild(createEmpty("fa-list-ul", "Chưa có cấu trúc để hiển thị."));
            return;
        }

        blocks.forEach((block, index) => {
            const info = describeBlock(block, index);
            container.appendChild(createSmartItem({
                title: `${index + 1}. ${info.label}`,
                text: info.summary,
                interactive: true,
                onClick: () => scrollToBlock(index)
            }));
        });
    }

    function renderAssets(snapshot) {
        const container = $("#v4AssetInventory");
        if (!container) return;
        container.innerHTML = "";

        const assets = (snapshot.blocks || []).map((block, index) => ({ block, index })).filter(({ block }) => ["image", "video", "resource", "html_preview"].includes(block.type));
        if (!assets.length) {
            container.appendChild(createEmpty("fa-photo-film", "Chưa có tài nguyên nào trong bài học."));
            return;
        }

        assets.forEach(({ block, index }) => {
            const info = describeBlock(block, index);
            container.appendChild(createSmartItem({
                title: info.label,
                text: info.summary,
                interactive: true,
                onClick: () => scrollToBlock(index)
            }));
        });
    }

    function collectQualityChecks(snapshot) {
        const issues = [];

        if (!snapshot.title) {
            issues.push({ level: "Cần làm", text: "Bài học chưa có tiêu đề rõ ràng.", tone: "danger" });
        }

        (snapshot.blocks || []).forEach((block, index) => {
            if (block.type === "text" && !String(block?.data?.text || "").trim()) {
                issues.push({ level: "Cần làm", text: `Block văn bản #${index + 1} đang trống.`, tone: "danger" });
            }
            if (["image", "video", "resource"].includes(block.type) && !String(block?.data?.url || "").trim()) {
                issues.push({ level: "Cần làm", text: `${describeBlock(block, index).label} #${index + 1} chưa có URL.`, tone: "danger" });
            }
            if (block.type === "resource" && !String(block?.data?.title || "").trim()) {
                issues.push({ level: "Nên bổ sung", text: `Tài liệu #${index + 1} chưa có tên hiển thị.`, tone: "warning" });
            }
            if ((block.type === "question" || block.type === "quiz") && !(block?.data?.questions || []).length) {
                issues.push({ level: "Cần làm", text: `Khối câu hỏi #${index + 1} chưa có nội dung.`, tone: "danger" });
            }
            if (block.type === "html_preview" && /<script/i.test(String(block?.data?.html || ""))) {
                issues.push({ level: "Cảnh báo", text: `HTML preview #${index + 1} chứa thẻ script, cần kiểm tra kỹ.`, tone: "warning" });
            }
        });

        return issues;
    }

    function renderQuality(snapshot, issues) {
        const container = $("#v4QualityChecks");
        if (!container) return;
        container.innerHTML = "";

        const summary = $("#v4QualitySummary");
        if (summary) summary.textContent = issues.length ? `${issues.length} lưu ý` : "Ổn định";

        if (!issues.length) {
            container.appendChild(createSmartItem({
                title: "Sẵn sàng",
                text: "Chưa thấy lỗi rõ ràng ở bài học hiện tại.",
                tone: "success"
            }));
            return;
        }

        issues.forEach((issue) => {
            container.appendChild(createSmartItem({
                title: issue.level,
                text: issue.text,
                tone: issue.tone
            }));
        });
    }

    function renderPublishChecklist(snapshot, issues) {
        const container = $("#v4PublishChecklist");
        if (!container) return;
        container.innerHTML = "";

        if (!snapshot.activeLessonId) {
            container.appendChild(createEmpty("fa-rocket", "Chọn bài học để xem checklist xuất bản."));
            return;
        }

        const checklist = [
            {
                ok: Boolean(snapshot.title),
                title: snapshot.title ? "Đã có tiêu đề bài học." : "Thiếu tiêu đề bài học."
            },
            {
                ok: snapshot.metrics.blocks > 0,
                title: snapshot.metrics.blocks > 0 ? `Có ${snapshot.metrics.blocks} block nội dung.` : "Chưa có block nội dung nào."
            },
            {
                ok: !snapshot.studioState.lessonDirty,
                title: snapshot.studioState.lessonDirty ? "Có thay đổi chưa lưu." : "Không có thay đổi chưa lưu."
            },
            {
                ok: issues.length === 0,
                title: issues.length === 0 ? "Không có cảnh báo chất lượng nghiêm trọng." : `Còn ${issues.length} mục cần rà trước khi publish.`
            }
        ];

        checklist.forEach((item) => {
            container.appendChild(createSmartItem({
                title: item.ok ? "Đạt" : "Cần xử lý",
                text: item.title,
                tone: item.ok ? "success" : "warning"
            }));
        });
    }

    function renderRevisionHint(snapshot) {
        const container = $("#v4RevisionQuickList");
        if (!container) return;
        container.innerHTML = "";

        const lastSaved = snapshot.studioState.lastSavedAt;
        if (!snapshot.activeLessonId) {
            container.appendChild(createEmpty("fa-clock-rotate-left", "Chọn bài học để theo dõi revision."));
            return;
        }

        container.appendChild(createSmartItem({
            title: "Mốc gần nhất",
            text: lastSaved ? `Lưu gần nhất: ${new Date(lastSaved).toLocaleTimeString("vi-VN")}` : "Bài học chưa có mốc lưu trong phiên làm việc này."
        }));
    }

    function updateTabSignals(snapshot, issues) {
        const blockCount = (snapshot.blocks || []).length;
        const assetCount = (snapshot.blocks || []).filter((block) => ["image", "video", "resource", "html_preview"].includes(block.type)).length;
        setTabText("left", "left-structure", "Cấu trúc");
        setTabText("left", "left-outline", blockCount ? `Dàn ý (${blockCount})` : "Dàn ý");
        setTabText("left", "left-assets", assetCount ? `Tài nguyên (${assetCount})` : "Tài nguyên");
        setTabText("left", "left-revisions", snapshot.activeLessonId ? "Phiên bản" : "Phiên bản");
        setTabText("right", "right-properties", "Thuộc tính");
        setTabText("right", "right-layout", "Bố cục");
        setTabText("right", "right-quality", issues.length ? `Chất lượng (${issues.length})` : "Chất lượng");
        setTabText("right", "right-publish", snapshot.studioState.lessonDirty ? "Xuất bản • nháp" : "Xuất bản");

        const sourceIds = ["treeUnitCount", "treeLessonCount", "treeDraftCount"];
        const targetIds = ["treeUnitCountMini", "treeLessonCountMini", "treeDraftCountMini"];
        sourceIds.forEach((sourceId, index) => {
            const source = document.getElementById(sourceId);
            const target = document.getElementById(targetIds[index]);
            if (source && target) target.textContent = source.textContent;
        });
    }

    function updateInspectorHint(snapshot, issues) {
        const title = $("#studioInspectorTitle");
        const body = $("#studioInspectorBody");
        const contextBadge = $("#v4InspectorContextBadge");
        const stateBadge = $("#v4InspectorStateBadge");
        const recommendation = $("#v4InspectorRecommendationBody");
        if (!title || !body) return;

        if (contextBadge) {
            contextBadge.textContent = snapshot.activeContext === "lesson"
                ? "Bài học"
                : snapshot.activeContext === "unit"
                    ? "Chương"
                    : "Khóa học";
        }

        if (stateBadge) {
            stateBadge.textContent = snapshot.studioState.lessonDirty || snapshot.studioState.courseDirty
                ? "Có thay đổi"
                : "Ổn định";
        }

        if (snapshot.activeContext === "lesson") {
            title.textContent = "Điều khiển bài học";
            body.textContent = issues.length
                ? `Canvas đang có ${issues.length} lưu ý cần rà. Bạn có thể chuyển nhanh sang tab Chất lượng hoặc Xuất bản.`
                : "Bài học đang sạch hơn. Bạn có thể tiếp tục biên tập hoặc xuất bản ngay từ thanh bên phải.";
            if (recommendation) {
                recommendation.textContent = snapshot.studioState.lessonDirty
                    ? "Gợi ý tiếp theo: lưu nháp trước, rồi dùng tab Chất lượng để rà nốt các điểm chưa ổn."
                    : "Gợi ý tiếp theo: kiểm tra quyền truy cập, mở revision nếu cần, rồi xuất bản ngay từ cụm hành động bên dưới.";
            }
            return;
        }

        if (snapshot.activeContext === "unit") {
            title.textContent = "Điều khiển chương";
            body.textContent = "Dùng inspector để đổi tên chương, cập nhật trạng thái hàng loạt và xóa chương khi cần.";
            if (recommendation) {
                recommendation.textContent = "Gợi ý tiếp theo: chuẩn hóa tên chương, rồi dùng thao tác hàng loạt để đồng bộ trạng thái cho toàn bộ bài học.";
            }
            return;
        }

        title.textContent = "Điều khiển khóa học";
        body.textContent = "Cập nhật metadata khóa học, thumbnail, PRO/public và các thao tác lưu nhanh trong cùng một chỗ.";
        if (recommendation) {
            recommendation.textContent = "Gợi ý tiếp theo: chốt thumbnail, mô tả ngắn và trạng thái công khai trước khi đi tiếp vào từng bài học.";
        }
    }

    function createEmpty(icon, text) {
        const wrapper = createEl("div", "studio-smart-empty");
        wrapper.appendChild(createEl("i", `fas ${icon}`));
        wrapper.appendChild(createEl("span", "", text));
        return wrapper;
    }

    function syncNow(reason, explicitSnapshot) {
        const snapshot = explicitSnapshot || getSnapshot();
        const issues = collectQualityChecks(snapshot);
        renderOutline(snapshot);
        renderAssets(snapshot);
        renderQuality(snapshot, issues);
        renderPublishChecklist(snapshot, issues);
        renderRevisionHint(snapshot);
        updateInspectorHint(snapshot, issues);
        updateTabSignals(snapshot, issues);
        applyNavigatorSearch();
        applyInspectorSearch();
    }

    function init() {
        if (!$("#studioWorkspace")) return;

        bindTabs();
        bindPreviewButtons();
        bindFocusToggles();
        bindDockToggles();
        bindLayoutActions();
        bindDockMiniRail();
        bindDockSearch();
        bindResizers();
        bindQuickActions();
        applyStoredLayout();
        document.addEventListener("lesson-studio:statechange", (event) => syncNow("bridge", event.detail?.snapshot || null));
        syncNow("init");
    }

    window.LessonEditorV4 = {
        init,
        syncNow,
        applyPreviewMode,
        setActiveDockTab
    };

    document.addEventListener("DOMContentLoaded", init);
})();
