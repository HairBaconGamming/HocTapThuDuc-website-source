(function () {
    if (window.__aiTutorInitialized) return;
    window.__aiTutorInitialized = true;

    const shell = document.querySelector("[data-ai-tutor-shell]");
    if (!shell) return;

    const bootstrap = window.AI_TUTOR_BOOTSTRAP || {};
    const toggleBtn = shell.querySelector("[data-ai-tutor-toggle]");
    const closeBtn = shell.querySelector("[data-ai-tutor-close]");
    const panel = shell.querySelector("[data-ai-tutor-panel]");
    const thread = shell.querySelector("[data-ai-tutor-thread]");
    const form = shell.querySelector("[data-ai-tutor-form]");
    const input = shell.querySelector("[data-ai-tutor-input]");
    const quickActions = shell.querySelector("[data-ai-tutor-actions]");
    const statusNode = shell.querySelector("[data-ai-tutor-status]");
    const contextLabel = shell.querySelector("[data-ai-tutor-context-label]");
    const selectionStatus = shell.querySelector("[data-ai-tutor-selection-status]");

    const pageType = bootstrap.pageType || shell.dataset.pageType || detectPageType();
    const variant = bootstrap.variant || shell.dataset.variant || pageType;
    const storageKey = `ai-tutor-open:${variant}`;

    const state = {
        busy: false,
        open: false,
        messages: [],
        renderScheduled: false
    };

    const actionSets = {
        default: [
            { label: "Tom tat trang", prompt: "Tom tat nhanh noi dung quan trong nhat tren trang nay cho toi." },
            { label: "Buoc tiep theo", prompt: "Voi trang nay, toi nen lam gi tiep theo de hoc hieu qua hon?" },
            { label: "On tap nhanh", prompt: "Tao 3 cau hoi on nhanh dua tren noi dung trang nay." }
        ],
        "lesson-detail": [
            { label: "Tom tat bai", prompt: "Tom tat bai hoc nay that ngan gon, de nho." },
            { label: "Giai thich cham", prompt: "Giai thich noi dung nay theo cach cham hon va ro hon." },
            { label: "Tao mini quiz", prompt: "Tao 3 cau hoi mini de toi tu kiem tra lai bai nay." }
        ],
        "lesson-studio": [
            { label: "Ra soat bai", prompt: "Ra soat bai hoc dang soan va chi ra 3 diem can nang chat luong." },
            { label: "Viet lai mo bai", prompt: "Viet lai doan mo dau bai hoc de gon, ro va cuon hut hon." },
            { label: "Checklist publish", prompt: "Cho toi checklist truoc khi publish bai hoc nay." }
        ],
        garden: [
            { label: "Nen lam gi tiep", prompt: "Voi trang thai vuon hien tai, toi nen uu tien lam gi tiep theo?" },
            { label: "Giai thich nhiem vu", prompt: "Giai thich nhanh cac muc tieu hoac viec can lam trong vuon." },
            { label: "Toi uu tai nguyen", prompt: "Goi y cach dung nuoc, phan bon va vang hop ly hon." }
        ],
        qa: [
            { label: "Dat cau hoi ro hon", prompt: "Giup toi viet lai cau hoi theo cach ro, gon va de duoc giai hon." },
            { label: "Tach bai giai", prompt: "Neu tra loi bai nay, nen tach thanh may buoc de de theo nhat?" },
            { label: "Y tuong bounty", prompt: "Khi nao nen treo bounty va can mo ta them gi de thu hut nguoi giai?" }
        ]
    };

    if (window.marked && typeof window.marked.use === "function") {
        window.marked.use({
            breaks: true,
            gfm: true
        });
    }

    function detectPageType() {
        if (document.body.classList.contains("garden-rustic-page")) return "garden";
        if (document.body.classList.contains("studio-v4-page")) return "lesson-studio";
        if (document.body.classList.contains("qa")) return "qa";
        if (document.querySelector(".lesson-detail-page")) return "lesson-detail";
        return "default";
    }

    function escapeHtml(value) {
        return String(value || "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }

    function clampText(value, limit) {
        const normalized = String(value || "")
            .replace(/\r/g, "")
            .replace(/\u00a0/g, " ")
            .replace(/[ \t]+\n/g, "\n")
            .replace(/\n{3,}/g, "\n\n")
            .trim();

        if (!limit || normalized.length <= limit) return normalized;
        return `${normalized.slice(0, limit)}...`;
    }

    function decodeBase64(value) {
        try {
            return decodeURIComponent(escape(window.atob(value)));
        } catch (error) {
            try {
                return window.atob(value);
            } catch (fallbackError) {
                return "";
            }
        }
    }

    function getSelectedText() {
        const selection = window.getSelection ? window.getSelection().toString() : "";
        return clampText(selection, 900);
    }

    function getCommonPageContext() {
        const mainContent = document.querySelector("main") || document.querySelector(".container") || document.body;
        const heading = document.querySelector("h1");
        const sampleText = clampText(mainContent ? mainContent.innerText : "", 2200);

        return {
            pageTitle: document.title || "",
            selection: getSelectedText(),
            contextSummary: [
                heading ? `Tieu de chinh: ${clampText(heading.textContent, 180)}` : "",
                sampleText ? `Noi dung hien co:\n${sampleText}` : ""
            ].filter(Boolean).join("\n\n"),
            metadata: {
                pathname: window.location.pathname,
                variant
            }
        };
    }

    function getLessonDetailContext() {
        const title = document.querySelector(".lesson-title")?.textContent || document.title;
        const heroMeta = document.querySelector(".lesson-hero-meta-line")?.textContent || "";
        const currentSection = document.getElementById("currentSectionLabel")?.textContent || "";
        const nextSection = document.getElementById("nextSectionLabel")?.textContent || "";
        const lessonContent = clampText(document.getElementById("lessonContentArea")?.innerText || "", 2800);
        const fallbackB64 = typeof window.LESSON_CONTENT_B64 === "string" ? decodeBase64(window.LESSON_CONTENT_B64) : "";

        return {
            pageTitle: clampText(title, 180),
            selection: getSelectedText(),
            contextSummary: [
                heroMeta ? `Meta bai hoc: ${clampText(heroMeta, 240)}` : "",
                currentSection ? `Dang doc: ${clampText(currentSection, 160)}` : "",
                nextSection ? `Ke tiep: ${clampText(nextSection, 160)}` : "",
                lessonContent ? `Noi dung hien tren man hinh:\n${lessonContent}` : "",
                !lessonContent && fallbackB64 ? `Noi dung bai hoc:\n${clampText(fallbackB64, 2800)}` : ""
            ].filter(Boolean).join("\n\n"),
            metadata: {
                lessonId: window.LESSON_ID || "",
                lessonViewState: window.LESSON_VIEW_STATE || {}
            }
        };
    }

    function getLessonStudioContext() {
        const snapshot = window.LessonStudioBridge && typeof window.LessonStudioBridge.getSnapshot === "function"
            ? window.LessonStudioBridge.getSnapshot()
            : null;
        const metrics = snapshot?.metrics || {};
        const firstBlocks = Array.isArray(snapshot?.blocks)
            ? snapshot.blocks.slice(0, 3).map((block, index) => ({
                index,
                type: block?.type || "unknown",
                preview: clampText(
                    block?.data?.text ||
                    block?.data?.content ||
                    block?.data?.question ||
                    block?.data?.title ||
                    "",
                    280
                )
            }))
            : [];

        return {
            pageTitle: snapshot?.title || document.title,
            selection: getSelectedText(),
            contextSummary: [
                snapshot?.title ? `Tieu de bai hoc: ${clampText(snapshot.title, 200)}` : "",
                `Context dang sua: ${snapshot?.activeContext || "unknown"}`,
                `So block: ${Number(metrics.blocks) || 0}, so tu: ${Number(metrics.words) || 0}, media: ${Number(metrics.media) || 0}, read time: ${Number(metrics.readTime) || 0} phut.`,
                firstBlocks.length ? `Mau block dau:\n${clampText(JSON.stringify(firstBlocks, null, 2), 1200)}` : ""
            ].filter(Boolean).join("\n\n"),
            metadata: {
                studioSnapshot: snapshot ? {
                    activeContext: snapshot.activeContext,
                    activeLessonId: snapshot.activeLessonId,
                    activeUnitId: snapshot.activeUnitId,
                    studioState: snapshot.studioState,
                    title: snapshot.title,
                    metrics,
                    firstBlocks
                } : null
            }
        };
    }

    function getGardenContext() {
        const gardenData = window.gardenData || {};
        const guideLine = document.getElementById("gardenGuideLine")?.textContent || "";
        const sceneTitle = document.getElementById("sceneTitle")?.textContent || "Vuon hien tai";
        const questCount = document.getElementById("questSummaryCount")?.textContent || "0";
        const visiblePlant = document.getElementById("statName")?.textContent || "";

        return {
            pageTitle: clampText(sceneTitle, 160),
            selection: "",
            contextSummary: [
                `Tai nguyen: nuoc ${Number(gardenData.water) || 0}, phan bon ${Number(gardenData.fertilizer) || 0}, vang ${Number(gardenData.gold) || 0}.`,
                `Tien trinh tutorial: step ${Number(gardenData.tutorialStep) || 0}.`,
                `Quest dang hien: ${clampText(questCount, 20)}.`,
                guideLine ? `NPC dang nhac: ${clampText(guideLine, 240)}` : "",
                visiblePlant && visiblePlant !== "..." ? `Dang xem cay: ${clampText(visiblePlant, 120)}` : ""
            ].filter(Boolean).join("\n\n"),
            metadata: {
                garden: {
                    water: Number(gardenData.water) || 0,
                    fertilizer: Number(gardenData.fertilizer) || 0,
                    gold: Number(gardenData.gold) || 0,
                    tutorialStep: Number(gardenData.tutorialStep) || 0,
                    isOwner: !!window.isOwner
                }
            }
        };
    }

    function getQaContext() {
        const hero = document.querySelector(".qa-hero-title, .qa-question-title, .qa-panel-title");
        const feedText = clampText(document.querySelector(".qa-shell, .qa-detail-shell")?.innerText || "", 2500);
        return {
            pageTitle: document.title || "",
            selection: getSelectedText(),
            contextSummary: [
                hero ? `Khu vuc hien tai: ${clampText(hero.textContent, 180)}` : "",
                feedText ? `Tom tat khu hoi dap:\n${feedText}` : ""
            ].filter(Boolean).join("\n\n"),
            metadata: {
                pathname: window.location.pathname,
                pageKind: "qa"
            }
        };
    }

    function buildContext() {
        if (pageType === "lesson-detail") return getLessonDetailContext();
        if (pageType === "lesson-studio") return getLessonStudioContext();
        if (pageType === "garden") return getGardenContext();
        if (pageType === "qa") return getQaContext();
        return getCommonPageContext();
    }

    function getActions() {
        return actionSets[pageType] || actionSets.default;
    }

    function setStatus(text) {
        if (statusNode) statusNode.textContent = text;
    }

    function updateSelectionStatus() {
        if (!selectionStatus) return;
        const selected = getSelectedText();
        selectionStatus.textContent = selected
            ? `Dang bam theo doan ban boi den (${selected.length} ky tu).`
            : "Chua co doan chon rieng.";
    }

    function updateContextLabel() {
        if (!contextLabel) return;
        const labels = {
            default: "Dang doc ngu canh trang",
            "lesson-detail": "Dang bam vao bai hoc hien tai",
            "lesson-studio": "Dang doc snapshot tu studio",
            garden: "Dang doc trang thai vuon",
            qa: "Dang doc khu hoi dap hoc thuat"
        };
        contextLabel.textContent = labels[pageType] || labels.default;
    }

    function createMessage(role, content, options) {
        const message = {
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            role,
            content: clampText(content, 12000),
            streaming: !!options?.streaming
        };
        state.messages.push(message);
        if (state.messages.length > 12) {
            state.messages = state.messages.slice(-12);
        }
        return message;
    }

    function renderMarkdown(content) {
        const source = String(content || "");
        if (!source.trim()) {
            return "";
        }

        if (window.marked && typeof window.marked.parse === "function") {
            const rawHtml = window.marked.parse(source, { breaks: true, gfm: true });
            if (window.DOMPurify && typeof window.DOMPurify.sanitize === "function") {
                return window.DOMPurify.sanitize(rawHtml, {
                    USE_PROFILES: { html: true }
                });
            }
            return rawHtml;
        }

        return escapeHtml(source).replace(/\n/g, "<br>");
    }

    function decorateMath(root) {
        if (!root || typeof window.renderMathInElement !== "function") return;
        window.renderMathInElement(root, {
            delimiters: [
                { left: "$$", right: "$$", display: true },
                { left: "$", right: "$", display: false },
                { left: "\\(", right: "\\)", display: false },
                { left: "\\[", right: "\\]", display: true }
            ],
            throwOnError: false
        });
    }

    function renderThreadNow() {
        if (!thread) return;

        const welcome = shell.querySelector("[data-ai-tutor-welcome]");
        if (welcome) {
            const introMap = {
                default: "Minh bam theo noi dung trang nay de tom tat, giai thich va goi y buoc tiep theo cho ban.",
                "lesson-detail": "Minh dang doc cung bai hoc voi ban. Ban co the nho tom tat, giai thich cham hon, hoac tao mini quiz co cong thuc LaTeX.",
                "lesson-studio": "Minh dang theo snapshot studio de goi y cau truc, quality va checklist publish cho bai hoc ban dang soan.",
                garden: "Minh dang nhin trang thai khu vuon hien tai de goi y tai nguyen, nhiem vu va buoc tiep theo.",
                qa: "Minh dang bam theo khu hoi dap de giup dat cau hoi ro hon, tach bai giai theo tung buoc va huong dan cach thao luan."
            };
            welcome.innerHTML = renderMarkdown(introMap[pageType] || introMap.default);
            decorateMath(welcome);
        }

        const staticMessage = thread.querySelector(".ai-tutor-msg");
        const staticHtml = staticMessage ? staticMessage.outerHTML : "";
        const dynamicHtml = state.messages.map((message) => {
            const isAssistant = message.role === "assistant";
            const bubbleClass = isAssistant
                ? `ai-tutor-msg-bubble ai-tutor-msg-bubble--rich${message.streaming ? " is-streaming" : ""}`
                : "ai-tutor-msg-bubble";
            const bubbleContent = isAssistant
                ? renderMarkdown(message.content)
                : escapeHtml(message.content).replace(/\n/g, "<br>");

            return `
                <article class="ai-tutor-msg ai-tutor-msg--${message.role}">
                    <div class="${bubbleClass}">${bubbleContent || (message.streaming ? '<span class="ai-tutor-caret"></span>' : '')}</div>
                </article>
            `;
        }).join("");

        thread.innerHTML = `${staticHtml}${dynamicHtml}`;
        thread.querySelectorAll(".ai-tutor-msg-bubble--rich").forEach(decorateMath);
        thread.scrollTop = thread.scrollHeight;
    }

    function scheduleRenderThread() {
        if (state.renderScheduled) return;
        state.renderScheduled = true;
        window.requestAnimationFrame(() => {
            state.renderScheduled = false;
            renderThreadNow();
        });
    }

    function renderQuickActions() {
        if (!quickActions) return;

        quickActions.innerHTML = getActions().map((action, index) => `
            <button type="button" class="ai-tutor-action${index === 0 ? " is-selected" : ""}" data-ai-action="${escapeHtml(action.prompt)}">
                ${escapeHtml(action.label)}
            </button>
        `).join("");
    }

    function syncOpenState(open) {
        state.open = !!open;
        shell.classList.toggle("is-open", state.open);

        if (panel) {
            panel.hidden = !state.open;
        }

        if (toggleBtn) {
            toggleBtn.setAttribute("aria-expanded", state.open ? "true" : "false");
        }

        try {
            window.localStorage.setItem(storageKey, state.open ? "1" : "0");
        } catch (error) {
            // Ignore storage errors.
        }
    }

    function restoreOpenState() {
        try {
            if (window.localStorage.getItem(storageKey) === "1") {
                syncOpenState(true);
            }
        } catch (error) {
            syncOpenState(false);
        }
    }

    async function askTutorOnce(promptText) {
        const prompt = clampText(promptText, 1200);
        if (!prompt || state.busy) return;

        const context = buildContext();
        state.busy = true;
        shell.classList.add("is-busy");
        setStatus("AI Tutor dang suy nghi...");

        createMessage("user", prompt);
        scheduleRenderThread();

        try {
            const response = await fetch("/api/ai-tutor/ask", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    prompt,
                    pageType,
                    pageTitle: context.pageTitle,
                    selection: context.selection,
                    contextSummary: context.contextSummary,
                    metadata: context.metadata,
                    history: state.messages.slice(-6).map((message) => ({
                        role: message.role,
                        content: message.content
                    }))
                })
            });

            const data = await response.json().catch(() => ({}));
            if (!response.ok || !data.success) {
                throw new Error(data.error || "Khong the goi AI Tutor luc nay.");
            }

            createMessage("assistant", data.reply);
            scheduleRenderThread();
            setStatus("Da cap nhat goi y moi.");
        } catch (error) {
            createMessage("assistant", error.message || "AI Tutor dang hoi ban mot nhip. Thu lai sau nhe.");
            scheduleRenderThread();
            setStatus("Tam thoi chua lay duoc phan hoi.");
        } finally {
            state.busy = false;
            shell.classList.remove("is-busy");
        }
    }

    function parseSseBlocks(buffer, onPacket) {
        let working = buffer;
        let boundaryIndex = working.indexOf("\n\n");

        while (boundaryIndex >= 0) {
            const block = working.slice(0, boundaryIndex);
            working = working.slice(boundaryIndex + 2);
            boundaryIndex = working.indexOf("\n\n");

            const dataText = block
                .split("\n")
                .filter((line) => line.startsWith("data:"))
                .map((line) => line.slice(5).trim())
                .join("");

            if (!dataText) continue;

            try {
                onPacket(JSON.parse(dataText));
            } catch (error) {
                // Ignore malformed chunks.
            }
        }

        return working;
    }

    async function askTutor(promptText) {
        const prompt = clampText(promptText, 1200);
        if (!prompt || state.busy) return;

        const context = buildContext();
        const history = state.messages.slice(-6).map((message) => ({
            role: message.role,
            content: message.content
        }));

        state.busy = true;
        shell.classList.add("is-busy");
        setStatus("AI Tutor dang stream phan hoi...");

        createMessage("user", prompt);
        const assistantMessage = createMessage("assistant", "", { streaming: true });
        scheduleRenderThread();

        try {
            const response = await fetch("/api/ai-tutor/stream", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    prompt,
                    pageType,
                    pageTitle: context.pageTitle,
                    selection: context.selection,
                    contextSummary: context.contextSummary,
                    metadata: context.metadata,
                    history
                })
            });

            if (!response.ok || !response.body) {
                throw new Error("Streaming tam thoi khong san sang.");
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = "";
            let streamDone = false;

            while (!streamDone) {
                const { value, done } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });
                buffer = parseSseBlocks(buffer, (packet) => {
                    if (packet.type === "delta" && packet.delta) {
                        assistantMessage.content += packet.delta;
                        scheduleRenderThread();
                        setStatus("Dang nhan tung dong tra loi...");
                        return;
                    }

                    if (packet.type === "done") {
                        assistantMessage.content = packet.reply || assistantMessage.content;
                        assistantMessage.streaming = false;
                        scheduleRenderThread();
                        setStatus("Da cap nhat goi y moi.");
                        streamDone = true;
                        return;
                    }

                    if (packet.type === "error") {
                        throw new Error(packet.error || "Khong the stream phan hoi luc nay.");
                    }
                });
            }

            assistantMessage.streaming = false;
            if (!assistantMessage.content.trim()) {
                throw new Error("AI Tutor chua tao duoc phan hoi phu hop.");
            }
            scheduleRenderThread();
        } catch (error) {
            state.messages = state.messages.filter((message) => message.id !== assistantMessage.id);
            scheduleRenderThread();
            await askTutorOnce(prompt);
            return;
        } finally {
            state.busy = false;
            shell.classList.remove("is-busy");
        }
    }

    function handleQuickActionClick(event) {
        const actionBtn = event.target.closest("[data-ai-action]");
        if (!actionBtn || !quickActions) return;

        quickActions.querySelectorAll(".ai-tutor-action").forEach((button) => {
            button.classList.toggle("is-selected", button === actionBtn);
        });

        syncOpenState(true);
        askTutor(actionBtn.dataset.aiAction || "");
    }

    function bindEvents() {
        toggleBtn?.addEventListener("click", () => syncOpenState(!state.open));
        closeBtn?.addEventListener("click", () => syncOpenState(false));
        quickActions?.addEventListener("click", handleQuickActionClick);

        form?.addEventListener("submit", (event) => {
            event.preventDefault();
            const value = input?.value || "";
            if (!value.trim()) return;
            askTutor(value.trim());
            input.value = "";
            input.focus();
        });

        input?.addEventListener("keydown", (event) => {
            if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                form?.requestSubmit();
            }
        });

        document.addEventListener("keydown", (event) => {
            if (event.key === "Escape" && state.open) {
                syncOpenState(false);
            }
        });

        document.addEventListener("selectionchange", () => {
            updateSelectionStatus();
        });

        document.addEventListener("click", (event) => {
            if (!state.open) return;
            if (shell.contains(event.target)) return;
            syncOpenState(false);
        });

        if (pageType === "lesson-studio") {
            document.addEventListener("lesson-studio:statechange", () => {
                updateContextLabel();
                setStatus("Da lam moi snapshot studio.");
            });
        }
    }

    renderQuickActions();
    updateContextLabel();
    updateSelectionStatus();
    restoreOpenState();
    renderThreadNow();
    bindEvents();
})();
