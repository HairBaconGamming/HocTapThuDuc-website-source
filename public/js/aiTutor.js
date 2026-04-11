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
        messages: []
    };

    const actionSets = {
        default: [
            { label: "Tóm tắt trang", prompt: "Tóm tắt nhanh nội dung quan trọng nhất trên trang này cho tôi." },
            { label: "Bước tiếp theo", prompt: "Với trang này, tôi nên làm gì tiếp theo để học hiệu quả hơn?" },
            { label: "Ôn tập nhanh", prompt: "Tạo 3 câu hỏi ôn nhanh dựa trên nội dung trang này." }
        ],
        "lesson-detail": [
            { label: "Tóm tắt bài", prompt: "Tóm tắt bài học này thật ngắn gọn, dễ nhớ." },
            { label: "Giải thích chậm hơn", prompt: "Giải thích nội dung này theo cách chậm hơn và rõ hơn." },
            { label: "Tạo mini quiz", prompt: "Tạo 3 câu hỏi mini để tôi tự kiểm tra lại bài này." }
        ],
        "lesson-studio": [
            { label: "Rà soát bài", prompt: "Rà soát bài học đang soạn và chỉ ra 3 điểm cần nâng chất lượng." },
            { label: "Viết lại mở bài", prompt: "Viết lại đoạn mở đầu bài học để gọn, rõ và cuốn hút hơn." },
            { label: "Checklist publish", prompt: "Cho tôi checklist trước khi publish bài học này." }
        ],
        garden: [
            { label: "Nên làm gì tiếp", prompt: "Với trạng thái vườn hiện tại, tôi nên ưu tiên làm gì tiếp theo?" },
            { label: "Giải thích nhiệm vụ", prompt: "Giải thích nhanh các mục tiêu hoặc việc cần làm trong vườn." },
            { label: "Tối ưu tài nguyên", prompt: "Gợi ý cách dùng nước, phân bón và vàng hợp lý hơn." }
        ]
    };

    function detectPageType() {
        if (document.body.classList.contains("garden-rustic-page")) return "garden";
        if (document.body.classList.contains("studio-v4-page")) return "lesson-studio";
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
                heading ? `Tiêu đề chính: ${clampText(heading.textContent, 180)}` : "",
                sampleText ? `Nội dung hiện có:\n${sampleText}` : ""
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
                heroMeta ? `Meta bài học: ${clampText(heroMeta, 240)}` : "",
                currentSection ? `Đang đọc: ${clampText(currentSection, 140)}` : "",
                nextSection ? `Kế tiếp: ${clampText(nextSection, 140)}` : "",
                lessonContent ? `Nội dung hiện trên màn hình:\n${lessonContent}` : "",
                !lessonContent && fallbackB64 ? `Nội dung bài học:\n${clampText(fallbackB64, 2800)}` : ""
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
                snapshot?.title ? `Tiêu đề bài học: ${clampText(snapshot.title, 200)}` : "",
                `Context đang sửa: ${snapshot?.activeContext || "unknown"}`,
                `Số block: ${Number(metrics.blocks) || 0}, số từ: ${Number(metrics.words) || 0}, media: ${Number(metrics.media) || 0}, read time: ${Number(metrics.readTime) || 0} phút.`,
                firstBlocks.length ? `Mẫu block đầu:\n${clampText(JSON.stringify(firstBlocks, null, 2), 1200)}` : ""
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
                `Tài nguyên: nước ${Number(gardenData.water) || 0}, phân bón ${Number(gardenData.fertilizer) || 0}, vàng ${Number(gardenData.gold) || 0}.`,
                `Tiến trình tutorial: step ${Number(gardenData.tutorialStep) || 0}.`,
                `Quest đang hiện: ${clampText(questCount, 20)}.`,
                guideLine ? `NPC đang nhắc: ${clampText(guideLine, 240)}` : "",
                visiblePlant && visiblePlant !== "..." ? `Đang xem cây: ${clampText(visiblePlant, 120)}` : ""
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

    function buildContext() {
        if (pageType === "lesson-detail") return getLessonDetailContext();
        if (pageType === "lesson-studio") return getLessonStudioContext();
        if (pageType === "garden") return getGardenContext();
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
            ? `Đang bám theo đoạn bạn bôi đen (${selected.length} ký tự).`
            : "Chưa có đoạn chọn riêng.";
    }

    function updateContextLabel() {
        if (!contextLabel) return;
        const labels = {
            default: "Đang đọc bối cảnh trang",
            "lesson-detail": "Đang bám vào bài học hiện tại",
            "lesson-studio": "Đang đọc snapshot từ studio",
            garden: "Đang đọc trạng thái vườn"
        };
        contextLabel.textContent = labels[pageType] || labels.default;
    }

    function createMessage(role, content) {
        state.messages.push({ role, content: clampText(content, 5000) });
        if (state.messages.length > 10) {
            state.messages = state.messages.slice(-10);
        }
    }

    function renderThread() {
        if (!thread) return;

        const welcome = shell.querySelector("[data-ai-tutor-welcome]");
        if (welcome) {
            const introMap = {
                default: "Mình bám theo nội dung trang này để tóm tắt, giải thích và gợi ý bước tiếp theo cho bạn.",
                "lesson-detail": "Mình đang đọc cùng bài học với bạn. Bạn có thể nhờ tóm tắt, giải thích chậm hơn hoặc tạo câu hỏi ôn nhanh.",
                "lesson-studio": "Mình đang theo snapshot studio để góp ý cấu trúc, chất lượng và checklist publish cho bài học bạn đang soạn.",
                garden: "Mình đang nhìn trạng thái khu vườn hiện tại để gợi ý tài nguyên, nhiệm vụ và bước tiếp theo."
            };
            welcome.textContent = introMap[pageType] || introMap.default;
        }

        const dynamicMessages = state.messages.map((message) => `
            <article class="ai-tutor-msg ai-tutor-msg--${message.role}">
                <div class="ai-tutor-msg-bubble">${escapeHtml(message.content)}</div>
            </article>
        `).join("");

        const staticMessage = thread.querySelector(".ai-tutor-msg");
        thread.innerHTML = staticMessage ? staticMessage.outerHTML + dynamicMessages : dynamicMessages;
        thread.scrollTop = thread.scrollHeight;
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
            // Ignore localStorage failures.
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

    async function askTutor(promptText) {
        const prompt = clampText(promptText, 1200);
        if (!prompt || state.busy) return;

        const context = buildContext();
        state.busy = true;
        shell.classList.add("is-busy");
        setStatus("AI Tutor đang suy nghĩ...");

        createMessage("user", prompt);
        renderThread();

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
                    history: state.messages.slice(-6)
                })
            });

            const data = await response.json().catch(() => ({}));
            if (!response.ok || !data.success) {
                throw new Error(data.error || "Không thể gọi AI Tutor lúc này.");
            }

            createMessage("assistant", data.reply);
            renderThread();
            setStatus("Đã cập nhật gợi ý mới.");
        } catch (error) {
            createMessage("assistant", error.message || "AI Tutor đang hơi bận một nhịp. Thử lại sau nhé.");
            renderThread();
            setStatus("Tạm thời chưa lấy được phản hồi.");
        } finally {
            state.busy = false;
            shell.classList.remove("is-busy");
        }
    }

    function handleQuickActionClick(event) {
        const actionBtn = event.target.closest("[data-ai-action]");
        if (!actionBtn) return;

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
                setStatus("Đã làm mới snapshot studio.");
            });
        }
    }

    renderQuickActions();
    updateContextLabel();
    updateSelectionStatus();
    restoreOpenState();
    renderThread();
    bindEvents();
})();
