(function () {
    if (window.__aiTutorInitialized) return;
    window.__aiTutorInitialized = true;

    const shell = document.querySelector("[data-ai-tutor-shell]");
    if (!shell) return;

    const bootstrap = window.AI_TUTOR_BOOTSTRAP || {};
    const toggleBtn = shell.querySelector("[data-ai-tutor-toggle]");
    const externalToggles = Array.from(document.querySelectorAll("[data-ai-tutor-external-toggle]"));
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
            { label: "Tóm tắt trang", prompt: "Tóm tắt nhanh nội dung quan trọng nhất trên trang này cho tôi." },
            { label: "Hỏi về Web", prompt: "Tôi muốn hỏi về lập trình web. Bạn có thể giúp gì cho tôi về HTML, CSS, JavaScript, hoặc backend?" },
            { label: "Ôn tập nhanh", prompt: "Tạo 3 câu hỏi ôn nhanh dựa trên nội dung trang này." },
            { label: "Code mẫu", prompt: "Cho tôi một code mẫu minh họa cho nội dung đang học, có comment giải thích từng dòng." }
        ],
        "lesson-detail": [
            { label: "Tóm tắt bài", prompt: "Tóm tắt bài học này thật ngắn gọn, dễ nhớ." },
            { label: "Giải thích chậm", prompt: "Giải thích nội dung này theo cách chậm hơn và rõ hơn." },
            { label: "Tạo mini quiz", prompt: "Tạo 3 câu hỏi mini để tôi tự kiểm tra lại bài này." },
            { label: "Code ví dụ", prompt: "Cho tôi ví dụ code thực tế liên quan đến nội dung bài học này, có giải thích chi tiết." }
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
        ],
        qa: [
            { label: "Đặt câu hỏi rõ hơn", prompt: "Giúp tôi viết lại câu hỏi theo cách rõ, gọn và dễ được giải hơn." },
            { label: "Tách bài giải", prompt: "Nếu trả lời bài này, nên tách thành mấy bước để dễ theo dõi nhất?" },
            { label: "Debug code", prompt: "Giúp tôi debug và giải thích lỗi trong đoạn code liên quan đến câu hỏi này." },
            { label: "Ý tưởng bounty", prompt: "Khi nào nên treo bounty và cần mô tả thêm gì để thu hút người giải?" }
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
                currentSection ? `Đang đọc: ${clampText(currentSection, 160)}` : "",
                nextSection ? `Kế tiếp: ${clampText(nextSection, 160)}` : "",
                lessonContent ? `Nội dung hiện trên màn hình:\n${lessonContent}` : "",
                !lessonContent && fallbackB64 ? `Nội dung bài học:\n${clampText(fallbackB64, 2800)}` : ""
            ].filter(Boolean).join("\n\n"),
            metadata: {
                lessonId: window.LESSON_ID || "",
                lessonViewState: window.LESSON_VIEW_STATE || {}
            }
        };
    }

    function summarizeStudioBlockTypes(blocks) {
        return (Array.isArray(blocks) ? blocks : []).reduce((summary, block) => {
            const type = String(block?.type || "unknown").trim() || "unknown";
            summary[type] = (summary[type] || 0) + 1;
            return summary;
        }, {});
    }

    function buildStudioQualityHints(snapshot) {
        const hints = [];
        const blocks = Array.isArray(snapshot?.blocks) ? snapshot.blocks : [];

        if (!String(snapshot?.title || "").trim()) {
            hints.push("Lesson title is missing.");
        }

        blocks.forEach((block, index) => {
            const order = index + 1;
            const type = String(block?.type || "unknown");
            if (type === "text" && !String(block?.data?.text || "").trim()) {
                hints.push(`Text block #${order} is empty.`);
            }
            if (["image", "video", "resource"].includes(type) && !String(block?.data?.url || "").trim()) {
                hints.push(`${type} block #${order} is missing URL.`);
            }
            if (type === "resource" && !String(block?.data?.title || "").trim()) {
                hints.push(`Resource block #${order} is missing title.`);
            }
            if ((type === "question" || type === "quiz") && !(block?.data?.questions || []).length) {
                hints.push(`Quiz block #${order} has no questions.`);
            }
            if (type === "html_preview" && /<script/i.test(String(block?.data?.html || ""))) {
                hints.push(`HTML preview block #${order} contains script tag.`);
            }
        });

        return hints.slice(0, 8);
    }

    function getStudioSelectionLabels() {
        return {
            subjectLabel: clampText(document.getElementById("studioSubjectChip")?.textContent || "", 120),
            courseLabel: clampText(document.getElementById("studioCourseChip")?.textContent || "", 160),
            selectionLabel: clampText(document.getElementById("studioSelectionChip")?.textContent || "", 160)
        };
    }

    function getLessonStudioContext() {
        const snapshot = window.LessonStudioBridge && typeof window.LessonStudioBridge.getSnapshot === "function"
            ? window.LessonStudioBridge.getSnapshot()
            : null;
        const metrics = snapshot?.metrics || {};
        const blocks = Array.isArray(snapshot?.blocks) ? snapshot.blocks : [];
        const firstBlocks = blocks.slice(0, 5).map((block, index) => ({
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
        }));
        const blockTypeCounts = summarizeStudioBlockTypes(blocks);
        const qualityHints = buildStudioQualityHints(snapshot);
        const studioState = snapshot?.studioState || {};
        const labels = getStudioSelectionLabels();
        const blockTypeSummary = Object.entries(blockTypeCounts)
            .map(([type, count]) => `${type}:${count}`)
            .join(", ");
        const dirtySummary = snapshot
            ? `Trang thai luu: lessonDirty=${Boolean(studioState.lessonDirty)}, courseDirty=${Boolean(studioState.courseDirty)}.`
            : "";

        return {
            pageTitle: snapshot?.title || document.title,
            selection: getSelectedText(),
            contextSummary: [
                labels.subjectLabel ? `Mon hoc: ${labels.subjectLabel}` : "",
                labels.courseLabel ? `Khoa hoc: ${labels.courseLabel}` : "",
                labels.selectionLabel ? `Dang chon: ${labels.selectionLabel}` : "",
                dirtySummary,
                blockTypeSummary ? `Phan bo block: ${blockTypeSummary}` : "",
                qualityHints.length ? `Quality hints: ${qualityHints.join(" | ")}` : "",
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
                    courseId: snapshot.courseId,
                    subjectId: snapshot.subjectId,
                    subjectLabel: labels.subjectLabel,
                    courseLabel: labels.courseLabel,
                    selectionLabel: labels.selectionLabel,
                    metrics,
                    blockTypeCounts,
                    qualityHints,
                    firstBlocks
                } : null
            }
        };
    }

    function summarizeGardenCounts(items) {
        return items.reduce((summary, item) => {
            if (item?.type === "plot") {
                summary.plots += 1;
            }

            if (item?.type === "plant") {
                summary.plants += 1;
                if (item?.isDead) {
                    summary.deadPlants += 1;
                }

                const maxStage = Number(window.gardenAssets?.PLANTS?.[item.itemId]?.maxStage || 0);
                if (!item?.isDead && Number(item?.stage || 0) >= maxStage) {
                    summary.readyPlants += 1;
                }
            }

            return summary;
        }, {
            plots: 0,
            plants: 0,
            readyPlants: 0,
            deadPlants: 0
        });
    }

    function buildGardenCropBreakdown(items) {
        const cropMap = new Map();

        items.forEach((item) => {
            if (item?.type !== "plant" || !item?.itemId) return;

            const config = window.gardenAssets?.PLANTS?.[item.itemId] || {};
            const maxStage = Number(config.maxStage || 0);
            const current = cropMap.get(item.itemId) || {
                itemId: item.itemId,
                name: config.name || item.itemId,
                count: 0,
                ready: 0,
                dead: 0
            };

            current.count += 1;
            if (item.isDead) current.dead += 1;
            if (!item.isDead && Number(item.stage || 0) >= maxStage) current.ready += 1;

            cropMap.set(item.itemId, current);
        });

        return Array.from(cropMap.values())
            .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
            .slice(0, 8);
    }

    function buildGardenInventorySummary(inventory) {
        return Object.entries(inventory || {})
            .map(([itemId, count]) => ({
                itemId,
                count: Number(count || 0),
                name: window.gardenAssets?.PLANTS?.[itemId]?.name || itemId
            }))
            .filter((entry) => entry.count > 0)
            .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
            .slice(0, 8);
    }

    function buildGardenQuestSummary(quests) {
        return (Array.isArray(quests) ? quests : [])
            .map((quest) => ({
                id: quest?.id || "",
                title: clampText(quest?.title || "", 80),
                progress: Number(quest?.progress || 0),
                target: Number(quest?.target || 0),
                complete: !!quest?.complete,
                claimed: !!quest?.claimed
            }))
            .slice(0, 5);
    }

    function getGardenSelectedPlantMeta() {
        const name = document.getElementById("statName")?.textContent || "";
        if (!name || name === "...") return null;

        return {
            name: clampText(name, 120),
            stageBadge: clampText(document.getElementById("statStageBadge")?.textContent || "", 120),
            totalTime: clampText(document.getElementById("statTotalTime")?.textContent || "", 80),
            wateringTime: clampText(document.getElementById("statWateringTime")?.textContent || "", 80),
            soilStatus: clampText(document.getElementById("statSoilStatus")?.textContent || "", 180)
        };
    }

    function getGardenContext() {
        const gardenData = window.gardenData || {};
        const items = Array.isArray(gardenData.items) ? gardenData.items : [];
        const guideLine = document.getElementById("gardenGuideLine")?.textContent || "";
        const sceneTitle = document.getElementById("sceneTitle")?.textContent || "Vườn hiện tại";
        const questCount = document.getElementById("questSummaryCount")?.textContent || "0";
        const selectedPlant = getGardenSelectedPlantMeta();
        const counts = summarizeGardenCounts(items);
        const cropBreakdown = buildGardenCropBreakdown(items);
        const inventorySummary = buildGardenInventorySummary(gardenData.inventory);
        const dailyQuestSummary = buildGardenQuestSummary(gardenData.dailyQuests);
        const pendingClaimQuests = dailyQuestSummary.filter((quest) => quest.complete && !quest.claimed).length;
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
                    userLevel: Number(gardenData.userLevel) || 0,
                    levelName: clampText(gardenData.levelName || "", 120),
                    isOwner: !!window.isOwner,
                    counts,
                    cropBreakdown,
                    inventory: inventorySummary,
                    dailyQuests: dailyQuestSummary,
                    pendingClaimQuests,
                    selectedPlant
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
                hero ? `Khu vực hiện tại: ${clampText(hero.textContent, 180)}` : "",
                feedText ? `Tóm tắt khu hỏi đáp:\n${feedText}` : ""
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
            ? `Đang bám theo đoạn bạn bôi đen (${selected.length} ký tự).`
            : "Chưa có đoạn chọn riêng.";
    }

    function updateContextLabel() {
        if (!contextLabel) return;
        const labels = {
            default: "Đang đọc ngữ cảnh trang",
            "lesson-detail": "Đang bám vào bài học hiện tại",
            "lesson-studio": "Đang đọc snapshot từ studio",
            garden: "Đang đọc trạng thái vườn",
            qa: "Đang đọc khu hỏi đáp học thuật"
        };
        contextLabel.textContent = labels[pageType] || labels.default;
    }

    function createMessage(role, content, options) {
        const message = {
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            role,
            content: clampText(content, 16000),
            streaming: !!options?.streaming
        };
        state.messages.push(message);
        if (state.messages.length > 20) {
            state.messages = state.messages.slice(-20);
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

    function injectCopyButtons(container) {
        if (!container) return;
        container.querySelectorAll("pre > code, pre").forEach((block) => {
            if (block.parentElement?.querySelector(".ai-tutor-copy-btn")) return;
            const pre = block.tagName === "PRE" ? block : block.parentElement;
            if (!pre || pre.querySelector(".ai-tutor-copy-btn")) return;
            pre.style.position = "relative";
            const btn = document.createElement("button");
            btn.className = "ai-tutor-copy-btn";
            btn.type = "button";
            btn.title = "Copy code";
            btn.innerHTML = '<i class="fas fa-copy"></i>';
            btn.addEventListener("click", () => {
                const text = (block.tagName === "CODE" ? block : block.querySelector("code") || block).textContent || "";
                navigator.clipboard.writeText(text).then(() => {
                    btn.innerHTML = '<i class="fas fa-check"></i>';
                    setTimeout(() => { btn.innerHTML = '<i class="fas fa-copy"></i>'; }, 1500);
                }).catch(() => {});
            });
            pre.appendChild(btn);
        });
    }

    function bindFollowUpClicks(container) {
        if (!container) return;
        container.querySelectorAll(".ai-tutor-msg-bubble--rich").forEach((bubble) => {
            if (bubble.dataset.followupBound) return;
            bubble.dataset.followupBound = "1";
            bubble.addEventListener("click", (e) => {
                const li = e.target.closest("li");
                if (!li) return;
                const hr = bubble.querySelector("hr");
                if (!hr) return;
                let node = hr.nextElementSibling;
                let isFollowUpSection = false;
                while (node) {
                    if (node.contains(li)) { isFollowUpSection = true; break; }
                    node = node.nextElementSibling;
                }
                if (!isFollowUpSection) return;
                const text = li.textContent.replace(/^[-•*]\s*/, "").trim();
                if (text && !state.busy) {
                    if (input) { input.value = text; input.focus(); }
                    askTutor(text);
                }
            });
        });
    }

    function renderThreadNow() {
        if (!thread) return;

        const welcome = shell.querySelector("[data-ai-tutor-welcome]");
        if (welcome) {
            const introMap = {
                default: "Chào bạn! 👋 Mình là **AI Tutor** — trợ lý đa năng có thể giúp bạn:\n- 🌐 **Lập trình web** (HTML/CSS/JS/Node/React/DB...)\n- 📐 **Toán, Lý, Hóa, Sinh** (giải bài + LaTeX)\n- 📝 **Văn, Sử, Anh** (phân tích, nghị luận)\n- 💻 **Tin học** (thuật toán, cấu trúc dữ liệu)\n\nCứ hỏi bất cứ điều gì, mình sẽ trả lời cặn kẽ kèm ví dụ!",
                "lesson-detail": "Mình đang đọc cùng bài học với bạn. Có thể nhờ: tóm tắt, giải thích chậm, tạo mini quiz, hoặc **hỏi bất kỳ kiến thức web/môn học** nào liên quan!",
                "lesson-studio": "Mình đang theo snapshot studio để gợi ý cấu trúc, quality và checklist publish cho bài học bạn đang soạn.",
                garden: "Mình đang nhìn trạng thái khu vườn hiện tại để gợi ý tài nguyên, nhiệm vụ và bước tiếp theo.",
                qa: "Mình sẵn sàng: đặt câu hỏi rõ hơn, tách bài giải từng bước, **debug code**, hoặc giải thích kiến thức nền!"
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
        injectCopyButtons(thread);
        bindFollowUpClicks(thread);
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

        externalToggles.forEach((button) => {
            button.setAttribute("aria-expanded", state.open ? "true" : "false");
            button.classList.toggle("is-active", state.open);
        });

        try {
            window.localStorage.setItem(storageKey, state.open ? "1" : "0");
        } catch (error) {
            // Ignore storage errors.
        }

        window.dispatchEvent(new CustomEvent("ai-tutor:statechange", {
            detail: {
                open: state.open,
                pageType,
                variant
            }
        }));
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
        setStatus("AI Tutor đang suy nghĩ...");

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
                    history: state.messages.slice(-10).map((message) => ({
                        role: message.role,
                        content: message.content
                    }))
                })
            });

            const data = await response.json().catch(() => ({}));
            if (!response.ok || !data.success) {
                throw new Error(data.error || "Không thể gọi AI Tutor lúc này.");
            }

            createMessage("assistant", data.reply);
            scheduleRenderThread();
            setStatus("Đã cập nhật gợi ý mới.");
        } catch (error) {
            createMessage("assistant", error.message || "AI Tutor đang hơi bận một nhịp. Thử lại sau nhé.");
            scheduleRenderThread();
            setStatus("Tạm thời chưa lấy được phản hồi.");
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
        const history = state.messages.slice(-10).map((message) => ({
            role: message.role,
            content: message.content
        }));

        state.busy = true;
        shell.classList.add("is-busy");
        setStatus("AI Tutor đang stream phản hồi...");

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
                throw new Error("Streaming tạm thời không sẵn sàng.");
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
                        setStatus("Đang nhận từng dòng trả lời...");
                        return;
                    }

                    if (packet.type === "done") {
                        assistantMessage.content = packet.reply || assistantMessage.content;
                        assistantMessage.streaming = false;
                        scheduleRenderThread();
                        setStatus("Đã cập nhật gợi ý mới.");
                        streamDone = true;
                        return;
                    }

                    if (packet.type === "error") {
                        throw new Error(packet.error || "Không thể stream phản hồi lúc này.");
                    }
                });
            }

            assistantMessage.streaming = false;
            if (!assistantMessage.content.trim()) {
                throw new Error("AI Tutor chưa tạo được phản hồi phù hợp.");
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
            if (event.target.closest("[data-ai-tutor-external-toggle]")) return;
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
    window.AITutorUI = {
        open: () => syncOpenState(true),
        close: () => syncOpenState(false),
        toggle: () => syncOpenState(!state.open),
        isOpen: () => state.open,
        refreshContext: () => {
            updateContextLabel();
            updateSelectionStatus();
        }
    };
    restoreOpenState();
    renderThreadNow();
    bindEvents();
})();
