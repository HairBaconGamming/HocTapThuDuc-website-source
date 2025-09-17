// public/js/lessonEditorV3.js
// @ts-check // Optional: Enable type checking in VS Code

// Assume showAlert is defined globally or imported elsewhere
// declare function showAlert(message: string, type: 'success' | 'error' | 'warning' | 'info', duration?: number): void;

// Register GSAP plugins
if (typeof gsap !== 'undefined' && typeof Flip !== 'undefined') {
    gsap.registerPlugin(Flip);
    // Optional: Register ScrollTrigger if you use it elsewhere or for future use
    // gsap.registerPlugin(ScrollTrigger);
} else {
    console.error("GSAP Core or Flip plugin not loaded. Animations might be disabled or broken.");
}

// Optional: Math plugin (uncomment if used and properly imported/configured)
// import mathEditorPlugin from "./plugins/mathEditorPlugin.js";

document.addEventListener("DOMContentLoaded", () => {
    console.log("Initializing Manage Lesson V3 Script (with Multi-Choice Quiz)...");

    // --- Library Checks ---
    if (typeof gsap === 'undefined' || typeof Flip === 'undefined') {
        console.error("GSAP or GSAP Flip plugin not loaded! Animations will be disabled.");
        // Provide fallback or stop execution if essential
    }
    if (typeof toastui === 'undefined' || typeof toastui.Editor === 'undefined') {
        console.error("Toast UI Editor not loaded! Critical dependency.");
        // Potentially disable features relying on the editor or stop script
        return;
    }
    if (typeof marked === 'undefined') {
        console.error("Marked library not loaded (needed for previews)! Previews will likely fail.");
    }
    // Check for Math rendering functions
    const hasRenderMathInElement = typeof renderMathInElement === 'function'; // For KaTeX auto-render
    const hasMathLive = typeof MathLive !== 'undefined' && typeof MathLive.renderMathInElement === 'function';
    if (!hasRenderMathInElement) console.warn("KaTeX auto-render function 'renderMathInElement' not found. Math formulas in previews might not render.");
    if (!hasMathLive) console.warn("MathLive library or 'renderMathInElement' method not found. MathLive formulas in previews might not render.");

    // --- Configuration ---
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const mathLiveRenderOptions = { /* MathLive rendering options if needed */ };
    const katexRenderOptions = {
        delimiters: [
            { left: "$$", right: "$$", display: true },
            { left: "$", right: "$", display: false },
            { left: "\\(", right: "\\)", display: false },
            { left: "\\[", right: "\\]", display: true }
        ],
        throwOnError: false, // Prevent KaTeX errors from stopping the script
        output: "htmlAndMathml" // Recommended for accessibility
    };

    // --- Global Editor Instance & State ---
    /** @type {import('@toast-ui/editor').Editor | null} */
    let fullscreenEditorInstance = null;
    /** @type {{ type: string; qId: string | number | undefined; optIndex: number | undefined; dataInput: HTMLInputElement | HTMLTextAreaElement; previewContainer: HTMLElement; context: string; } | null} */
    let currentEditingTarget = null; // Info about what's being edited
    /** @type {Array<{id: string; question: string; options: Array<{text: string; isCorrect: boolean}>}>} */
    let quizData = []; // More specific type for quiz
    /** @type {Array<{question: string; sampleAnswer: string}>} */
    let essayData = []; // More specific type for essay
    // let quizCounter = 0; // Removed as robust ID generation is used

    // --- DOM References ---
    /** @param {string} id */
    const getEl = id => document.getElementById(id);
    const lessonForm = /** @type {HTMLFormElement | null} */ (getEl("lessonForm"));

    if (!lessonForm) {
        console.error("FATAL: Lesson form (#lessonForm) not found! Script cannot proceed.");
        return;
    }

    const steps = gsap.utils.toArray(".form-step");
    const stepIndicators = gsap.utils.toArray(".step-indicator .step");
    const typeSelectHidden = /** @type {HTMLInputElement | null} */ (getEl("lessonType"));
    const mode = lessonForm.getAttribute("action")?.includes("/edit") ? 'edit' : 'add';

    // Step 1 Elements
    const subjectSelect = /** @type {HTMLSelectElement | null} */ (getEl("subjectId"));
    const titleInput = /** @type {HTMLInputElement | null} */ (getEl("title"));
    const categorySelect = /** @type {HTMLSelectElement | null} */ (getEl("category"));
    const proOnlyCheckbox = /** @type {HTMLInputElement | null} */ (lessonForm.querySelector('input[name="isProOnly"]'));

    // Step 2 Elements
    const typeTabButtons = document.querySelectorAll(".lesson-type-selector-v2 .type-tab-btn");
    const editorPanels = document.querySelectorAll(".editor-area .editor-panel");
    const markdownDataInput = /** @type {HTMLTextAreaElement | null} */ (getEl("markdownData")); // Hidden textarea for main markdown
    const quizContainer = getEl("quizContainer");
    const quizDataInput = /** @type {HTMLInputElement | null} */ (getEl("quizData")); // Hidden input for stringified quiz JSON
    const addQuestionBtn = getEl("addQuestionBtn");
    const generateQuizBtn = getEl("generateQuizBtn"); // AI generation button
    const docxFileInput = /** @type {HTMLInputElement | null} */ (getEl("docxFile")); // AI file input
    const videoUrlInput = /** @type {HTMLInputElement | null} */ (getEl("videoUrl"));
    const videoPreviewArea = getEl("videoPreview");
    const essayPromptDataInput = /** @type {HTMLTextAreaElement | null} */ (getEl("essayPromptData")); // Hidden textarea for essay prompt
    const essayContainer = getEl("essayContainer");
    const essayDataInput = /** @type {HTMLInputElement | null} */ (getEl("essayData")); // Hidden input for stringified essay JSON
    const addEssayQuestionBtn = getEl("addEssayQuestionBtn");
    const essayGradingSelect = /** @type {HTMLSelectElement | null} */ (getEl("essayGrading"));
    const absoluteSettingsDiv = getEl("absoluteSettings");
    const absoluteToleranceInput = /** @type {HTMLInputElement | null} */ (getEl("absoluteTolerance"));

    // Step 3 Elements
    const reviewSubject = getEl("reviewSubject");
    const reviewTitle = getEl("reviewTitle");
    const reviewCategory = getEl("reviewCategory");
    const reviewType = getEl("reviewType");
    const reviewProOnly = getEl("reviewProOnly");
    const reviewContentPreview = getEl("reviewContentPreview");
    const saveProgressBtn = getEl("saveProgressBtn"); // Only exists in 'add' mode
    const finalSubmitBtn = getEl("finalSubmitBtn") || lessonForm.querySelector('button[type="submit"].final-submit-btn');

    // Fullscreen Modal Elements
    const fullscreenModal = getEl("fullscreen-editor-modal");
    const modalBackdrop = fullscreenModal?.querySelector(".modal-backdrop");
    const modalContent = fullscreenModal?.querySelector(".modal-content");
    const editorContainer = getEl("fullscreen-editor-container");
    const editorContextTitle = getEl("fullscreen-editor-context");
    const closeModalBtn = fullscreenModal?.querySelector(".close-fullscreen-editor");
    const saveAndCloseBtn = getEl("save-and-close-editor");

    // --- State Variables ---
    let currentStep = 1;
    let isSubmitting = false; // Prevent double submit
    let isEditorOpen = false; // Track if the fullscreen editor is active
    let isAnimating = false;  // Prevent conflicting animations

    // ==========================================================================
    // HELPER FUNCTIONS
    // ==========================================================================

    /**
     * Throttles a function to ensure it's not called too frequently.
     * @param {Function} func The function to throttle.
     * @param {number} limit The throttle limit in milliseconds.
     * @returns {Function} The throttled function.
     */
    function throttle(func, limit) {
        let lastFunc;
        let lastRan;
        return function(...args) {
            const context = this;
            if (!lastRan) {
                func.apply(context, args);
                lastRan = Date.now();
            } else {
                clearTimeout(lastFunc);
                lastFunc = setTimeout(function() {
                    if ((Date.now() - lastRan) >= limit) {
                        func.apply(context, args);
                        lastRan = Date.now();
                    }
                }, limit - (Date.now() - lastRan));
            }
        }
    }

    /**
     * Renders Markdown content into a preview element safely, including math formulas.
     * @param {HTMLElement | null} previewContainer The container element holding the preview.
     * @param {string | undefined | null} markdownContent The Markdown string to render.
     */
    function renderPreview(previewContainer, markdownContent) {
        if (!previewContainer) {
            console.warn("renderPreview called with null previewContainer.");
            return;
        }
        const previewContentDiv = /** @type {HTMLElement | null} */ (previewContainer.querySelector('.preview-content'));
        if (!previewContentDiv) {
            console.warn("renderPreview: '.preview-content' div not found inside container:", previewContainer);
            return;
        }

        markdownContent = markdownContent || ''; // Ensure it's a string

        try {
            let htmlContent = '<p><em>Chưa có nội dung</em></p>'; // Default content
            if (typeof marked !== 'undefined') {
                // Basic check for non-empty/non-whitespace content before parsing
                if (markdownContent.trim()) {
                    htmlContent = marked.parse(markdownContent);
                    // !!! IMPORTANT: SANITIZE HTML IN PRODUCTION using a library like DOMPurify !!!
                    // Example (requires DOMPurify library):
                    // if (typeof DOMPurify !== 'undefined') {
                    //     htmlContent = DOMPurify.sanitize(htmlContent, { USE_PROFILES: { html: true } });
                    // } else {
                    //     console.warn("DOMPurify not loaded. Skipping HTML sanitization for preview.");
                    // }
                }
                previewContentDiv.innerHTML = htmlContent;
            } else {
                // Fallback if marked.js is missing - display raw text safely
                previewContentDiv.textContent = markdownContent.trim() ? markdownContent : 'Chưa có nội dung (lỗi trình phân tích)';
                console.error("Marked library not found, rendering raw text.");
            }

            // Render Math formulas if libraries are available
            if (htmlContent !== '<p><em>Chưa có nội dung</em></p>') { // Only render math if there's actual content
                if (hasRenderMathInElement) {
                    try {
                        renderMathInElement(previewContentDiv, katexRenderOptions);
                    } catch (katexError) {
                        console.error("KaTeX rendering error:", katexError);
                    }
                }
                if (hasMathLive) {
                     try {
                         MathLive.renderMathInElement(previewContentDiv, mathLiveRenderOptions);
                     } catch (mathliveError) {
                         console.error("MathLive rendering error:", mathliveError);
                     }
                }
            }

        } catch (e) {
            console.error("Markdown parsing/rendering error:", e);
            previewContentDiv.innerHTML = '<p><em>Lỗi hiển thị nội dung</em></p>'; // Safer fallback
        }
    }

    // ==========================================================================
    // FULLSCREEN EDITOR MANAGEMENT
    // ==========================================================================

    /**
     * Initializes or updates the single fullscreen editor instance.
     * @param {string} initialMarkdown The initial Markdown content for the editor.
     * @returns {boolean} True if setup was successful, false otherwise.
     */
    function setupFullscreenEditor(initialMarkdown) {
        if (!editorContainer) {
            console.error("FATAL: Fullscreen editor container (#fullscreen-editor-container) not found.");
            showAlert("Lỗi giao diện: Không tìm thấy vùng soạn thảo. Hãy thử tải lại.", "error", 5000);
            return false; // Indicate failure
        }

        initialMarkdown = initialMarkdown || ""; // Ensure string

        if (!fullscreenEditorInstance) {
            console.log("Initializing Fullscreen Editor...");
            try {
                fullscreenEditorInstance = new toastui.Editor({
                    el: editorContainer,
                    initialEditType: "markdown",
                    previewStyle: "vertical",
                    height: "100%",
                    initialValue: initialMarkdown,
                    usageStatistics: false,
                    // plugins: [mathEditorPlugin], // Uncomment if using math plugin
                    // Example: Customize toolbar
                    // toolbarItems: [
                    //    ['heading', 'bold', 'italic', 'strike'], ['hr', 'quote'],
                    //    ['ul', 'ol', 'task'], ['table', 'image', 'link'],
                    //    ['code', 'codeblock'], ['scrollSync']
                    // ],
                     events: {
                         // Optional: Add TUI events if needed (e.g., change, keydown)
                         // change: () => { console.log("Editor content changed"); }
                     }
                });
                console.log("Fullscreen Editor Initialized successfully.");
                return true;
            } catch (e) {
                console.error("FATAL: Failed to initialize Fullscreen Editor:", e);
                showAlert("Không thể khởi tạo trình soạn thảo. Vui lòng tải lại trang.", "error", 5000);
                editorContainer.innerHTML = '<p class="text-danger">Lỗi khởi tạo trình soạn thảo.</p>'; // Provide feedback in UI
                return false;
            }
        } else {
            console.log("Updating content for existing Fullscreen Editor.");
            try {
                // Use setMarkdown API
                fullscreenEditorInstance.setMarkdown(initialMarkdown, false); // `false` prevents firing the 'change' event unnecessarily
                fullscreenEditorInstance.moveCursorToStart(); // Reset cursor position
                // Ensure editor is visible and refresh layout if needed (especially after display:none)
                 if (fullscreenModal?.classList.contains('active')) {
                    fullscreenEditorInstance.refresh();
                 }
                console.log("Fullscreen Editor content updated.");
                return true;
            } catch(e) {
                console.error("Error setting markdown on existing editor:", e);
                showAlert("Lỗi cập nhật nội dung trình soạn thảo.", "error");
                return false;
            }
        }
    }

    /**
     * Opens the fullscreen editor modal with Flip animation.
     * @param {object} targetInfo Information about the element being edited.
     * @param {string} targetInfo.type Type of content (e.g., 'markdown', 'quizQuestion').
     * @param {string | number | undefined} targetInfo.qId Question ID or Essay Index.
     * @param {number | undefined} targetInfo.optIndex Option Index.
     * @param {HTMLInputElement | HTMLTextAreaElement} targetInfo.dataInput The hidden input storing the data.
     * @param {HTMLElement} targetInfo.previewContainer The preview element that was clicked.
     * @param {string} targetInfo.context A description for the modal title.
     */
    function openFullscreenEditor(targetInfo) {
        if (isAnimating || isEditorOpen) {
            console.warn("Cannot open editor: Already open or animating.", { isAnimating, isEditorOpen });
            return;
        }
        if (!fullscreenModal || !modalContent || !targetInfo?.previewContainer || !targetInfo?.dataInput) {
            console.error("Cannot open editor: Missing required elements (modal, content, previewContainer, dataInput) or targetInfo.", { fullscreenModal, modalContent, targetInfo });
            showAlert("Lỗi giao diện: Không thể mở trình soạn thảo.", "error");
            return;
        }
        if (typeof Flip === 'undefined') {
             console.error("GSAP Flip plugin not available. Opening editor without animation.");
             // Simple show fallback:
             if (!setupFullscreenEditor(targetInfo.dataInput.value)) return; // Setup content first
             currentEditingTarget = targetInfo;
             fullscreenModal.classList.add("active");
             if(editorContextTitle) editorContextTitle.textContent = `Chỉnh sửa: ${targetInfo.context || 'Nội dung'}`;
             isEditorOpen = true;
             fullscreenEditorInstance?.focus();
             fullscreenEditorInstance?.refresh(); // Refresh layout
             return;
        }

        console.log("Opening editor for:", targetInfo);
        isAnimating = true; // Lock animation state
        currentEditingTarget = targetInfo;
        const initialMarkdown = currentEditingTarget.dataInput.value;

        // 1. Setup Editor Content FIRST
        if (!setupFullscreenEditor(initialMarkdown)) {
            console.error("Editor setup failed. Aborting open animation.");
             isAnimating = false;
             currentEditingTarget = null;
             // Clean up partial state if needed
             fullscreenModal.classList.remove("active");
             if(modalBackdrop) gsap.set(modalBackdrop, { autoAlpha: 0 });
            return;
        }

        // 2. Get State (Before DOM changes) - From preview to modal content
        const state = Flip.getState(targetInfo.previewContainer, modalContent, { props: "borderRadius, boxShadow, opacity, visibility" });

        // 3. Make DOM changes
        fullscreenModal.classList.add("active"); // Make modal visible (opacity 0 initially if animating backdrop)
        targetInfo.previewContainer.style.visibility = 'hidden'; // Keep space, hide visually
        if(editorContextTitle) editorContextTitle.textContent = `Chỉnh sửa: ${targetInfo.context || 'Nội dung'}`;
        gsap.set(modalContent, { visibility: 'visible' }); // Ensure modal content is visible for Flip

        // 4. Animate with Flip
        Flip.from(state, {
            targets: modalContent,
            duration: prefersReducedMotion ? 0 : 0.6,
            ease: "expo.inOut",
            absolute: true, // Crucial for position: fixed transitions
            // scale: true, // Implicitly handled
            onComplete: () => {
                isEditorOpen = true;
                isAnimating = false;
                fullscreenEditorInstance?.focus();
                fullscreenEditorInstance?.refresh(); // Refresh TUI layout after animation
                console.log("Editor open animation complete.");
            },
            // Fallback for non-flip environments (though checked earlier)
            simple: true
        });

        // Animate backdrop fade-in separately
        if (modalBackdrop) {
             gsap.fromTo(modalBackdrop, { autoAlpha: 0 }, { duration: 0.4, autoAlpha: 1 });
        }
    }

    /**
     * Closes the fullscreen editor modal with Flip animation.
     * @param {boolean} [forceClose=false] If true, closes immediately without animation or saving.
     */
    function closeFullscreenEditor(forceClose = false) {
        if (isAnimating || !isEditorOpen || !fullscreenModal || !modalContent) {
             console.warn("Cannot close editor: Not open or currently animating.", { isAnimating, isEditorOpen });
            return;
        }
         if (!currentEditingTarget && !forceClose) {
            console.warn("Cannot perform close animation: Missing 'currentEditingTarget'. Forcing close.");
            forceClose = true;
         }

        console.log("Closing editor.", { forceClose });
        isAnimating = true; // Lock animation state

        // --- Force Close ---
        if (forceClose) {
            fullscreenModal.classList.remove("active");
            if (currentEditingTarget?.previewContainer) {
                 currentEditingTarget.previewContainer.style.visibility = 'visible'; // Show preview again
            }
            if(modalBackdrop) gsap.set(modalBackdrop, { autoAlpha: 0 }); // Hide backdrop immediately
            isEditorOpen = false;
            isAnimating = false;
            currentEditingTarget = null; // Clear target
            console.log("Editor force closed.");
            return;
        }

        // --- Check for Flip ---
         if (typeof Flip === 'undefined') {
             console.error("GSAP Flip plugin not available. Closing editor without animation.");
             if (!saveEditorContent()) {
                 console.warn("Content saving failed or was cancelled during non-animated close.");
             }
             fullscreenModal.classList.remove("active");
             if (currentEditingTarget?.previewContainer) {
                currentEditingTarget.previewContainer.style.visibility = 'visible';
             }
             if(modalBackdrop) gsap.set(modalBackdrop, { autoAlpha: 0 });
             isEditorOpen = false;
             isAnimating = false;
             currentEditingTarget = null;
             return;
         }


        // --- Try to Save Content ---
        if (!saveEditorContent()) {
            console.warn("Content saving failed or was cancelled. Editor remains open.");
            // Optionally ask user: if (!window.confirm("Lưu thất bại. Đóng mà không lưu?")) {...}
            isAnimating = false; // Unlock animation state if save fails
            return; // Keep editor open if save failed
        }

        // --- Animate Closing ---
        isEditorOpen = false; // Set flag early

         // Ensure target preview is available
         if (!currentEditingTarget?.previewContainer) {
             console.error("Cannot perform close animation: previewContainer missing from currentEditingTarget.");
             closeFullscreenEditor(true); // Force close if target is bad
             return;
         }

         // 1. Get State (Modal content is start) - To preview container
         const state = Flip.getState(modalContent, currentEditingTarget.previewContainer, { props: "borderRadius, boxShadow, opacity, visibility" });

         // 2. Make DOM changes (Prepare preview)
         currentEditingTarget.previewContainer.style.visibility = 'visible'; // Make preview visible for Flip target
         gsap.set(currentEditingTarget.previewContainer, { opacity: 0 }); // Start preview invisible for fade-in effect

         // 3. Animate with Flip
         Flip.from(state, {
             targets: currentEditingTarget.previewContainer,
             duration: prefersReducedMotion ? 0 : 0.5,
             ease: "expo.inOut",
             absolute: true,
             // scale: true,
             onStart: () => {
                 // Fade out modal content slightly delayed
                 gsap.to(modalContent, { duration: 0.3, opacity: 0, delay: 0.1 });
                 // Fade out backdrop
                 if (modalBackdrop) {
                     gsap.to(modalBackdrop, { duration: 0.4, autoAlpha: 0 });
                 }
             },
             onComplete: () => {
                 fullscreenModal.classList.remove("active"); // Hide modal container AFTER animation
                 gsap.set(modalContent, { opacity: 1, visibility: 'hidden' }); // Reset modal content for next time
                 gsap.set(currentEditingTarget?.previewContainer, { opacity: 1 }); // Ensure preview is fully opaque
                 isAnimating = false; // Unlock animation state
                 currentEditingTarget = null; // Clear target info
                 console.log("Editor close animation complete.");
             },
             simple: true // Fallback
         });
    }

    /**
     * Saves content from the fullscreen editor to the target input and updates JS data arrays.
     * Also re-renders the specific preview area.
     * @returns {boolean} True if saving was successful, false otherwise.
     */
    function saveEditorContent() {
        if (!fullscreenEditorInstance || !currentEditingTarget || !currentEditingTarget.dataInput || !currentEditingTarget.previewContainer) {
            console.error("Cannot save editor content: Missing editor instance or target information.", { fullscreenEditorInstance, currentEditingTarget });
            showAlert("Lỗi lưu nội dung: Thiếu thông tin cần thiết.", "error");
            return false; // Indicate failure
        }

        const newMarkdown = fullscreenEditorInstance.getMarkdown();
        const { type, qId, optIndex, dataInput, previewContainer } = currentEditingTarget;

        // Update the hidden input's value
        dataInput.value = newMarkdown;

        // Update the corresponding JS data array
        let updateSuccess = false;
        try {
            switch (type) {
                case 'markdown':
                    updateSuccess = true; // Data input is the source of truth here
                    break;
                case 'quizQuestion':
                    const qIndexQQ = quizData.findIndex(q => q && q.id === qId); // Add safety check for q
                    if (qIndexQQ > -1) {
                        quizData[qIndexQQ].question = newMarkdown;
                        updateQuizDataInput(); // Update the main hidden quiz JSON input
                        updateSuccess = true;
                    } else console.warn(`Quiz question with id ${qId} not found in data array for saving.`);
                    break;
                case 'quizOption':
                    const qIndexQO = quizData.findIndex(q => q && q.id === qId); // Safety check
                    if (qIndexQO > -1 && quizData[qIndexQO].options && optIndex !== undefined && quizData[qIndexQO].options[optIndex]) {
                        quizData[qIndexQO].options[optIndex].text = newMarkdown;
                        updateQuizDataInput();
                        updateSuccess = true;
                    } else console.warn(`Quiz option with qId ${qId} and optIndex ${optIndex} not found for saving.`);
                    break;
                case 'essayPrompt':
                    updateSuccess = true; // Data input is the source of truth
                    break;
                case 'essayQuestion':
                    // Assuming qId is the *index* for essays
                    if (typeof qId === 'number' && essayData[qId]) {
                        essayData[qId].question = newMarkdown;
                        updateEssayDataInput();
                        updateSuccess = true;
                    } else console.warn(`Essay question with index ${qId} not found for saving.`);
                    break;
                case 'essayAnswer':
                     // Assuming qId is the *index* for essays
                    if (typeof qId === 'number' && essayData[qId]) {
                        essayData[qId].sampleAnswer = newMarkdown;
                        updateEssayDataInput();
                        updateSuccess = true;
                    } else console.warn(`Essay answer with index ${qId} not found for saving.`);
                    break;
                default:
                    console.warn("Unknown editing target type for saving:", type);
                    showAlert(`Lỗi lưu: Không nhận dạng được loại nội dung "${type}".`, "error");
                    return false; // Cannot save unknown type
            }
        } catch (error) {
             console.error("Error updating JS data array during save:", error);
             showAlert("Lỗi lưu dữ liệu vào bộ nhớ trong.", "error");
             return false; // Indicate failure
        }

        if (updateSuccess) {
             // Re-render the specific preview area with the new content
             renderPreview(previewContainer, newMarkdown);
             console.log(`Content saved successfully for target: ${type} (ID/Index: ${qId}, OptIndex: ${optIndex})`);
             // Trigger auto-save if in add mode after successful save
             if (mode !== 'edit') saveProgressThrottled();
             return true; // Indicate success
        } else {
             console.error(`Failed to update JS data for target: ${type} (ID/Index: ${qId}, OptIndex: ${optIndex})`);
              showAlert("Không thể cập nhật dữ liệu bài học sau khi sửa.", "error");
             return false; // Indicate failure
        }
    }

    /**
     * Adds a click listener to a preview element to trigger the fullscreen editor.
     * Adds a class to prevent adding multiple listeners.
     * @param {HTMLElement} element The preview element.
     */
    function addPreviewClickListener(element) {
        if (!element || element.classList.contains('listener-added')) return;

        element.addEventListener('click', (e) => {
            // Prevent triggering if clicking on interactive elements *inside* the preview
            if (e.target.closest('a, button, input, select, textarea, .mathfield')) {
                console.log("Clicked on interactive element inside preview, ignoring editor open.");
                return;
            }
            // Prevent if already animating or open
            if (isAnimating || isEditorOpen) {
                console.warn("Ignoring preview click, editor is already open or animating.");
                return;
            }

            const targetInputId = element.dataset.editorTarget;
            const targetInput = targetInputId ? /** @type {HTMLInputElement | HTMLTextAreaElement | null} */ (getEl(targetInputId)) : null;
            if (!targetInput) {
                console.error(`Data input element with ID #${targetInputId} not found for the clicked preview.`, element);
                showAlert("Lỗi: Không tìm thấy nơi lưu dữ liệu được liên kết.", "error");
                return;
            }

            // Gather necessary context information from data attributes
            const context = element.dataset.editorContext || 'Nội dung không xác định';
            const type = element.dataset.editorType; // e.g., 'quizQuestion'
            const qId = element.dataset.qId;        // Question ID (string) or Essay Index (string representation of number)
            const optIndexStr = element.dataset.optIndex; // Option Index (string or undefined)

            if (!type) {
                 console.error("Missing 'data-editor-type' attribute on preview element.", element);
                 showAlert("Lỗi: Không xác định được loại nội dung cần sửa.", "error");
                 return;
            }

            // Determine if qId should be treated as a number (for essay index)
            let parsedQId = qId;
            if ((type === 'essayQuestion' || type === 'essayAnswer') && qId !== undefined) {
                const numId = parseInt(qId, 10);
                if (!isNaN(numId)) {
                    parsedQId = numId;
                } else {
                    console.error(`Invalid numeric index found for essay type: ${qId}`);
                    showAlert("Lỗi dữ liệu: Chỉ số câu hỏi tự luận không hợp lệ.", "error");
                    return;
                }
            }


            openFullscreenEditor({
                type: type,
                qId: parsedQId, // Use parsed number for essay, keep string for quiz ID
                optIndex: optIndexStr !== undefined ? parseInt(optIndexStr, 10) : undefined, // Parse if exists
                dataInput: targetInput,         // Reference to the hidden textarea/input
                previewContainer: element,      // Reference to the preview div itself
                context: context                // String description for modal title
            });
        });

        element.classList.add('listener-added'); // Mark as processed
    }
    // ==========================================================================
    // STEP NAVIGATION & UI LOGIC
    // ==========================================================================

    /**
     * Updates the visual state of the step indicators.
     * @param {number} targetStep The step number to mark as active.
     */
    function updateStepIndicator(targetStep) {
        stepIndicators.forEach((stepEl, index) => {
            const stepNum = index + 1;
            stepEl.classList.remove('active', 'completed');
            if (stepNum < targetStep) {
                stepEl.classList.add('completed');
            } else if (stepNum === targetStep) {
                stepEl.classList.add('active');
            }
        });
    }

    /**
     * Navigates to the specified step number with animation.
     * @param {number} targetStepNum The step number to navigate to (1-based).
     */
    function goToStep(targetStepNum) {
        if (isAnimating) { console.warn("Animation in progress, delaying step change."); return; }

        const currentStepElement = /** @type {HTMLElement | undefined} */ (steps.find(step => step.classList.contains('active')));
        const targetStepElement = /** @type {HTMLElement | undefined} */ (steps.find(step => step.dataset.stepContent == targetStepNum)); // Use == for type coercion flexibility
        const wrapper = /** @type {HTMLElement | null} */ (document.querySelector('.form-steps-wrapper'));

        if (!targetStepElement || !wrapper || targetStepElement.classList.contains('active')) {
            console.warn(`goToStep(${targetStepNum}) - Target invalid, already active, or wrapper not found.`);
            return;
        }

        const currentStepNum = currentStepElement ? parseInt(currentStepElement.dataset.stepContent || '0', 10) : 0;
        console.log(`Navigating from step ${currentStepNum} to ${targetStepNum}`);
        isAnimating = true; // Lock animation

        // --- Prepare for Step Change ---
        // Populate review data if moving to step 3
        if (targetStepNum === 3) {
            populateReviewData();
        }
        // Ensure data is parsed/ready if moving TO step 2 (usually handled by initial load or type change)
        // if (targetStepNum === 2) { /* Data should already be parsed */ }


        // --- Height Calculation ---
        let targetHeight = 0;
        // Temporarily modify target styles to measure its natural height
        const originalStyles = {
            position: targetStepElement.style.position,
            display: targetStepElement.style.display,
            visibility: targetStepElement.style.visibility,
            opacity: targetStepElement.style.opacity
        };
        gsap.set(targetStepElement, {
            position: 'relative', // Allow natural height calculation
            display: 'block',
            visibility: 'hidden', // Keep hidden but occupy space
            opacity: 0
        });
        targetHeight = targetStepElement.scrollHeight;
        // Restore original styles immediately before animation starts
        gsap.set(targetStepElement, {
            position: originalStyles.position || 'absolute', // Default back to absolute for transitions
            display: originalStyles.display || 'none',
            visibility: originalStyles.visibility || 'hidden',
            opacity: originalStyles.opacity || '0'
        });
        console.log(`Target step ${targetStepNum} calculated height: ${targetHeight}px`);


        // --- Animation Logic ---
        if (prefersReducedMotion) {
            // Simple show/hide, no animation
            steps.forEach(step => {
                 step.classList.remove('active');
                 gsap.set(step, { display: 'none', opacity: 0, position: 'absolute' });
            });
            targetStepElement.classList.add('active');
            gsap.set(targetStepElement, { display: 'block', opacity: 1, position: 'relative'});
            gsap.set(wrapper, { height: targetHeight > 0 ? `${targetHeight}px` : 'auto' });
            // Set wrapper height back to auto after render to allow dynamic content changes later
             requestAnimationFrame(() => {
                 requestAnimationFrame(() => {
                     if(targetStepElement.classList.contains('active')) gsap.set(wrapper, { height: 'auto' });
                 });
             });
             isAnimating = false; // Unlock immediately

        } else {
            // GSAP Timeline animation
            const tl = gsap.timeline({
                defaults: { duration: 0.5, ease: 'power2.inOut' },
                onComplete: () => {
                    // Ensure correct final state
                    steps.forEach(step => {
                        const isActive = step === targetStepElement;
                        step.classList.toggle('active', isActive);
                        // Use set instead of to for instant final state
                        gsap.set(step, {
                            position: isActive ? 'relative' : 'absolute',
                            display: isActive ? 'block' : 'none',
                            autoAlpha: isActive ? 1 : 0 // Handles visibility and opacity
                        });
                    });
                    // Set wrapper height to auto AFTER animation
                    gsap.set(wrapper, { height: 'auto' });
                    console.log(`Step transition complete. Wrapper height set to auto. Active step: ${targetStepElement.dataset.stepContent}`);
                    // Refresh ScrollTrigger if layout changed significantly and it's loaded
                    if (typeof ScrollTrigger !== 'undefined') ScrollTrigger.refresh();
                    isAnimating = false; // Unlock animation state
                }
            });

            const direction = targetStepNum > currentStepNum ? 1 : -1; // 1 for next, -1 for back

            // 1. Animate wrapper height
            // Start immediately, use 'auto' if targetHeight is 0 or invalid
            tl.to(wrapper, { height: targetHeight > 0 ? targetHeight : 'auto' }, 0);

            // 2. Animate out current step
            if (currentStepElement) {
                tl.to(currentStepElement, { autoAlpha: 0, x: -50 * direction }, 0); // Fade and slide out
            }

            // 3. Animate in target step
            // Set initial state (off-screen, invisible, absolute position)
            gsap.set(targetStepElement, { x: 50 * direction, autoAlpha: 0, position: 'absolute', display: 'block' });
            // Add active class slightly before 'in' animation starts visually
            tl.call(() => targetStepElement.classList.add('active'), null, ">-0.3");
            // Animate to final position (visible, centered)
            tl.to(targetStepElement, { autoAlpha: 1, x: 0 }, "<"); // Start slightly before outgoing finishes
        }

        currentStep = targetStepNum;
        updateStepIndicator(currentStep);
    }

    // Event listeners for step navigation buttons
    document.querySelectorAll('.next-step-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            if (isAnimating) return;
            const nextStep = parseInt(btn.dataset.nextStep || '0', 10);
            if (nextStep > currentStep) {
                // Optional: Add validation for current step before proceeding
                // if (validateStep(currentStep)) { goToStep(nextStep); } else { return; }
                goToStep(nextStep);
            }
        });
    });
    document.querySelectorAll('.back-step-btn').forEach(btn => {
        btn.addEventListener('click', () => {
             if (isAnimating) return;
            const prevStep = parseInt(btn.dataset.prevStep || '0', 10);
            if (prevStep < currentStep) {
                goToStep(prevStep);
            }
        });
    });

    // Lesson Type Tab Button Logic
    typeTabButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            if (isAnimating || !typeSelectHidden) return; // Prevent type change during animation or if hidden input missing
            const newType = btn.dataset.type;
            if (!newType || typeSelectHidden.value === newType) return; // Do nothing if invalid or already active

            console.log("Changing lesson type to:", newType);
            isAnimating = true; // Lock during panel transition
            typeSelectHidden.value = newType;

            // Update button active states
            typeTabButtons.forEach(b => b.classList.remove("active"));
            btn.classList.add("active");

            // Animate Panel Transition
            const targetPanel = /** @type {HTMLElement | null} */ (document.querySelector(`.editor-panel[data-editor-type="${newType}"]`));
            const currentPanel = /** @type {HTMLElement | undefined} */ (Array.from(editorPanels).find(p => {
                const style = window.getComputedStyle(p);
                return style.display !== 'none' && style.opacity !== '0' && style.visibility !== 'hidden';
            })); // Find currently visible panel more reliably


            if (!targetPanel) {
                console.error(`Editor panel for type "${newType}" not found!`);
                 showAlert(`Giao diện cho loại "${newType}" bị thiếu.`, "error");
                 isAnimating = false; // Unlock
                 return;
            }

            if (prefersReducedMotion) {
                 editorPanels.forEach(p => {
                     gsap.set(p, { display: (p === targetPanel) ? 'block' : 'none' });
                 });
                 renderInitialPreviewsForType(newType); // Render after display change
                 isAnimating = false;
            } else {
                const tl = gsap.timeline({
                    onComplete: () => {
                        // Ensure final display states are correct
                        editorPanels.forEach(p => {
                            gsap.set(p, { display: (p === targetPanel) ? 'block' : 'none' });
                        });
                        renderInitialPreviewsForType(newType); // Render content for the new type
                        if (typeof ScrollTrigger !== 'undefined') ScrollTrigger.refresh();
                         isAnimating = false; // Unlock
                         console.log("Panel transition complete for type:", newType);
                    }
                });

                if (currentPanel && currentPanel !== targetPanel) {
                    tl.to(currentPanel, { duration: 0.3, autoAlpha: 0, scale: 0.97, ease: 'power1.in' }, 0);
                }

                // Set initial state for target panel (hidden, scaled down, but display: block to allow animation)
                gsap.set(targetPanel, { display: 'block', autoAlpha: 0, scale: 0.97 });
                // Animate target panel in
                tl.to(targetPanel, { duration: 0.4, autoAlpha: 1, scale: 1, ease: 'power2.out' }, ">-0.1"); // Overlap slightly
            }

            // Trigger auto-save if in add mode
            if (mode !== 'edit') saveProgressThrottled();
        });
    });

    /**
     * Renders the initial previews for the selected lesson type.
     * Assumes quizData and essayData arrays are already populated (by initial load or loadProgress).
     * @param {string | undefined | null} type The lesson type (e.g., 'markdown', 'quiz').
     */
    function renderInitialPreviewsForType(type) {
        console.log("Rendering initial previews for type:", type);

        // No need to parse here - parsing happens during initial load (edit mode) or in loadProgress (add mode)

        switch (type) {
            case "markdown":
                const mdPreview = document.querySelector('.editor-preview-container[data-editor-target="markdownData"]');
                if (mdPreview && markdownDataInput) renderPreview(mdPreview, markdownDataInput.value);
                break;
            case "quiz":
                 if (!quizContainer) break;
                renderQuiz(); // Rebuilds the quiz UI based on `quizData`
                break;
            case "video":
                triggerVideoPreviewUpdate(); // Video uses its own update mechanism
                break;
            case "essay":
                const promptPreview = document.querySelector('.editor-preview-container[data-editor-target="essayPromptData"]');
                if (promptPreview && essayPromptDataInput) renderPreview(promptPreview, essayPromptDataInput.value);
                 if (!essayContainer) break;
                renderEssayQuestions(); // Rebuilds essay questions based on `essayData`
                break;
            default:
                console.warn("Unknown lesson type for initial preview rendering:", type);
                break;
        }
        // Add listeners to any newly rendered interactive previews that don't have them yet
        document.querySelectorAll('.interactive-preview:not(.listener-added)').forEach(el => {
             addPreviewClickListener( /** @type {HTMLElement} */ (el));
        });
    }

    // ==========================================================================
    // QUIZ EDITOR LOGIC (MULTI-CHOICE MODIFIED)
    // ==========================================================================

    /** Updates the hidden quizData input with the stringified current quizData array. */
    function updateQuizDataInput() {
        if (!quizDataInput) return;
        try {
            // Filter out potential null/undefined entries if using splice incorrectly elsewhere
            const cleanQuizData = quizData.filter(q => q && typeof q === 'object' && q.id); // Basic sanity check
            if (cleanQuizData.length !== quizData.length) {
                 console.warn("Quiz data contained invalid entries, cleaning before saving to input.");
                 quizData = cleanQuizData; // Update the main array if cleaned
            }
            quizDataInput.value = JSON.stringify(quizData);
            // console.log("Quiz Data Input Updated:", quizDataInput.value); // Reduce console noise
        } catch (e) {
            console.error("Error stringifying quiz data:", e, quizData);
            showAlert("Lỗi nghiêm trọng khi cập nhật dữ liệu Quiz! Dữ liệu có thể không được lưu.", "error", 5000);
        }
     }

    /** Updates the visual numbering (Câu 1, Câu 2...) of quiz questions. */
    function updateQuizNumbering() {
        if (!quizContainer) return;
        const questionCards = quizContainer.querySelectorAll('.quiz-question-card');
        questionCards.forEach((qCard, i) => {
            const numberSpan = qCard.querySelector('.question-number');
            if (numberSpan) numberSpan.textContent = `Câu ${i + 1}`;

            // Update context data attribute for previews
            const qPreview = qCard.querySelector('.editor-preview-container[data-editor-type="quizQuestion"]');
            if (qPreview instanceof HTMLElement) {
                 qPreview.dataset.editorContext = `Câu hỏi Quiz ${i + 1}`;
                 // Also update qId in case it was generated dynamically (though ideally IDs are stable)
                 // qPreview.dataset.qId = qCard.dataset.id; // Assuming card has correct ID
            }

            // Update option contexts
            qCard.querySelectorAll('.quiz-option-card').forEach((optCard, optIdx) => {
                 const oPreview = optCard.querySelector('.editor-preview-container[data-editor-type="quizOption"]');
                  if (oPreview instanceof HTMLElement) {
                      oPreview.dataset.editorContext = `Lựa chọn ${String.fromCharCode(65 + optIdx)} - Câu ${i + 1}`;
                      // Update indices if needed (though add/remove logic should handle this)
                      // oPreview.dataset.optIndex = String(optIdx);
                  }
            });
        });
    }

    /**
     * Creates the HTML structure for a single quiz question card with previews.
     * @param {any} questionData The data object for the question. Requires at least { id: string, question: string, options: any[] }.
     * @param {string} qId The unique ID for this question.
     * @returns {HTMLElement | null} The created card element or null on failure.
     */
    function createQuizQuestionElement(questionData, qId) {
        if (!quizContainer) { console.error("Quiz container not found."); return null; }
        if (!questionData || typeof qId !== 'string' || !qId) { console.error("Invalid question data or ID provided.", { questionData, qId }); return null; }
        if (!Array.isArray(questionData.options)) questionData.options = []; // Ensure options is an array

        const questionIndex = quizData.findIndex(q => q && q.id === qId); // Get current index for context
        const questionEditorTargetId = `quizQuestionData_${qId}`; // Unique ID for the hidden data store

        const card = document.createElement("div");
        card.className = "quiz-question-card";
        card.dataset.id = qId; // Store ID on the card

        card.innerHTML = `
            <div class="quiz-card-header">
                <span class="question-number">Câu ${questionIndex + 1}</span>
                <div class="quiz-card-actions">
                    <button type="button" class="btn-icon remove-question-btn" title="Xóa câu hỏi ${questionIndex + 1}"><i class="fas fa-trash-alt"></i></button>
                </div>
            </div>
            <div class="quiz-card-body">
                <label class="form-label" for="${questionEditorTargetId}_preview">Nội dung câu hỏi:</label>
                <!-- Question Preview Area -->
                <div id="${questionEditorTargetId}_preview" class="editor-preview-container interactive-preview"
                     data-editor-target="${questionEditorTargetId}"
                     data-editor-type="quizQuestion"
                     data-q-id="${qId}"
                     data-editor-context="Câu hỏi Quiz ${questionIndex + 1}"
                     tabindex="0" role="button" aria-label="Chỉnh sửa nội dung câu hỏi ${questionIndex + 1}">
                    <div class="preview-content"></div>
                    <div class="edit-overlay" aria-hidden="true"><i class="fas fa-pencil-alt"></i> Chỉnh sửa</div>
                </div>
                <textarea id="${questionEditorTargetId}" class="hidden-data" aria-hidden="true">${questionData.question || ''}</textarea>
                <label class="form-label" style="margin-top: 15px;">Các lựa chọn (Có thể chọn nhiều đáp án đúng):</label>
                <div class="options-container" id="options-container-${qId}"></div>
                <button type="button" class="btn btn-secondary add-option-btn"><i class="fas fa-plus"></i> Thêm lựa chọn</button>
            </div>
        `;

        // Append to container *before* adding listeners if possible
        quizContainer.appendChild(card);

        // Render initial preview content for the question
        const questionPreview = /** @type {HTMLElement | null} */ (card.querySelector('.editor-preview-container[data-editor-type="quizQuestion"]'));
        if (questionPreview) {
            renderPreview(questionPreview, questionData.question);
            addPreviewClickListener(questionPreview); // Attach listener
        }

        // Add listeners for card buttons
        const addOptBtn = card.querySelector(".add-option-btn");
        if (addOptBtn) {
            addOptBtn.addEventListener("click", () => {
                if (isAnimating) return;
                addQuizOption(qId); // Add a new blank option
            });
        }

        const removeQBtn = card.querySelector(".remove-question-btn");
        if (removeQBtn) {
            removeQBtn.addEventListener("click", () => {
                 if (isAnimating) return;
                 // Use a custom confirmation modal ideally
                 if (window.confirm(`Bạn chắc muốn xóa Câu ${questionIndex + 1}?`)) {
                      // Find index again right before splicing
                      const currentIndex = quizData.findIndex(item => item && item.id === qId);
                      if (currentIndex > -1) {
                          quizData.splice(currentIndex, 1); // Remove from data array
                          // Animate removal
                           gsap.to(card, { duration: 0.3, autoAlpha: 0, height: 0, marginTop: 0, marginBottom: -15, ease: 'power1.in', onComplete: () => {
                              card.remove(); // Remove from DOM after animation
                              updateQuizDataInput();
                              updateQuizNumbering(); // Renumber remaining questions
                              if(mode !== 'edit') saveProgressThrottled(); // Save after removal
                          }});
                      } else {
                           console.warn(`Question ${qId} not found in data array for removal.`);
                           card.remove(); // Remove from DOM anyway if data is inconsistent
                           updateQuizDataInput();
                           updateQuizNumbering();
                      }
                  }
             });
        }

        return card; // Return the created element
    }

     /**
      * Adds a quiz option (with preview) to a specific question. NOW USES CHECKBOXES.
      * @param {string} qId The ID of the question to add the option to.
      * @param {number | null} [optionIndex=null] The index to insert at (used for rendering existing data). If null, appends.
      * @param {any} [optionData=null] The data for the option ({ text: string, isCorrect: boolean }). If null, creates a blank option.
      */
    function addQuizOption(qId, optionIndex = null, optionData = null) {
        const question = quizData.find(q => q?.id === qId);
        if (!question) { console.error(`Quiz Q ${qId} not found for adding option.`); return; }
        if (!Array.isArray(question.options)) question.options = [];

        const optionsContainer = getEl(`options-container-${qId}`);
        if (!optionsContainer) { console.error(`Options container for Q ${qId} not found.`); return; }

        const isNewOption = (optionIndex === null);
        const targetIndex = isNewOption ? question.options.length : optionIndex;
        const currentOptionData = optionData || { text: "", isCorrect: false };

        // Add/Update data array before creating DOM
        if (isNewOption) {
            question.options.push({ ...currentOptionData });
        } else if (optionIndex !== null && question.options[optionIndex]) {
            question.options[optionIndex] = { ...currentOptionData };
        } else if (optionIndex !== null) { // Index out of bounds? Append instead.
            console.warn(`Attempted render at invalid option index ${optionIndex} for Q ${qId}. Appending.`);
            question.options.push({ ...currentOptionData });
        }

        const optionDiv = document.createElement("div");
        optionDiv.className = "quiz-option-card"; // Keep same card structure
        optionDiv.dataset.optIndex = String(targetIndex);
        const optionEditorTargetId = `quizOptionData_${qId}_${targetIndex}`;
        const checkboxId = `correctAnswer_${qId}_${targetIndex}`; // Unique ID for checkbox and label's 'for'

        const questionIndexForContext = quizData.findIndex(q => q?.id === qId);

        optionDiv.innerHTML = `
            <div class="option-content">
                 <!-- Option Preview Area -->
                 <div class="editor-preview-container interactive-preview"
                      data-editor-target="${optionEditorTargetId}"
                      data-editor-type="quizOption"
                      data-q-id="${qId}"
                      data-opt-index="${targetIndex}"
                      data-editor-context="Lựa chọn ${String.fromCharCode(65 + targetIndex)} - Câu ${questionIndexForContext + 1}"
                      tabindex="0" role="button" aria-label="Chỉnh sửa lựa chọn ${String.fromCharCode(65 + targetIndex)} câu ${questionIndexForContext + 1}">
                     <div class="preview-content"></div>
                     <div class="edit-overlay" aria-hidden="true"><i class="fas fa-pencil-alt"></i> Chỉnh sửa</div>
                 </div>
                 <textarea id="${optionEditorTargetId}" class="hidden-data" aria-hidden="true">${currentOptionData.text || ''}</textarea>
            </div>
            <div class="option-controls">
                 <!-- Wrapper for custom checkbox -->
                 <div class="choice-control">
                     <input
                         type="checkbox" 
                         name="${checkboxId}" 
                         id="${checkboxId}" 
                         class="correct-checkbox visually-hidden" 
                         value="${targetIndex}"
                         data-q-id="${qId}"
                         data-opt-index="${targetIndex}" 
                         ${currentOptionData.isCorrect ? "checked" : ""}
                         aria-labelledby="${checkboxId}-label" 
                      >
                      <label
                          for="${checkboxId}"
                          id="${checkboxId}-label"
                          class="correct-answer-label" 
                          title="Đánh dấu là đáp án đúng/sai"
                      >
                          <span class="custom-choice-indicator" aria-hidden="true">
                              <i class="fas fa-check check-icon"></i>
                          </span>
                          <!-- Screen reader text can be simpler or removed if label text is clear -->
                          <span class="sr-only">Check if correct answer for option ${targetIndex + 1}</span>
                      </label>
                 </div>
                 <button type="button" class="btn-icon remove-option-btn" title="Xóa lựa chọn ${String.fromCharCode(65 + targetIndex)}"><i class="fas fa-times"></i></button>
            </div>
        `;
        optionsContainer.appendChild(optionDiv);

        // Render preview content
        const optionPreview = /** @type {HTMLElement | null} */ (optionDiv.querySelector('.editor-preview-container[data-editor-type="quizOption"]'));
        if (optionPreview) {
            renderPreview(optionPreview, currentOptionData.text);
            addPreviewClickListener(optionPreview);
        }

        // --- MODIFIED: Event Listener for Checkbox ---
        const checkbox = /** @type {HTMLInputElement | null} */ (optionDiv.querySelector(".correct-checkbox"));
        if (checkbox) {
            checkbox.addEventListener("change", (e) => {
                if (!(e.target instanceof HTMLInputElement)) return;

                const changedQId = e.target.dataset.qId;
                const changedOptIndexStr = e.target.dataset.optIndex;

                if (changedQId === undefined || changedOptIndexStr === undefined) {
                    console.error("Missing data attributes on checkbox for multi-choice update.");
                    return;
                }
                const changedOptIndex = parseInt(changedOptIndexStr, 10);
                if (isNaN(changedOptIndex)) {
                     console.error("Invalid option index on checkbox.");
                     return;
                }

                 // Find the specific question and option in the data array
                 const currentQuestion = quizData.find(q => q?.id === changedQId);
                 if (!currentQuestion || !currentQuestion.options || !currentQuestion.options[changedOptIndex]) {
                     console.error(`Cannot find question or option to update: QID ${changedQId}, Index ${changedOptIndex}`);
                     return;
                 }

                 // Update the isCorrect status based on the checkbox's checked state
                 currentQuestion.options[changedOptIndex].isCorrect = e.target.checked;

                 console.log(`Option ${changedOptIndex} for Q:${changedQId} isCorrect set to: ${e.target.checked}`);

                 // Update the main hidden input
                 updateQuizDataInput();

                 // Trigger auto-save if needed
                 if(mode !== 'edit') saveProgressThrottled();
            });
        }

        // Remove button listener
        const removeOptBtn = optionDiv.querySelector(".remove-option-btn");
        if (removeOptBtn) {
             removeOptBtn.addEventListener("click", () => {
                 if (isAnimating) return;
                 // Find the option's index *within the current data structure* using the dataset index
                 const indexToRemove = parseInt(optionDiv.dataset.optIndex || '-1', 10);

                 if (indexToRemove > -1 && question.options && question.options[indexToRemove]) {
                     question.options.splice(indexToRemove, 1); // Remove from data using stored index

                     // Animate removal
                     gsap.to(optionDiv, { duration: 0.3, autoAlpha: 0, height: 0, ease: 'power1.in', onComplete: () => {
                         optionDiv.remove(); // Remove from DOM after animation
                         updateQuizDataInput();
                         // Re-assign correct indices and update context/targets for remaining DOM elements
                         // This is crucial after splicing the data array
                         optionsContainer.querySelectorAll('.quiz-option-card').forEach((card, newIdx) => {
                             if (!(card instanceof HTMLElement)) return;
                             card.dataset.optIndex = String(newIdx);
                             const check = /** @type {HTMLInputElement | null} */ (card.querySelector('.correct-checkbox')); // Target checkbox
                             const label = /** @type {HTMLLabelElement | null} */ (card.querySelector('.correct-answer-label'));
                             const removeBtn = card.querySelector('.remove-option-btn');
                             const newCheckboxId = `correctAnswer_${qId}_${newIdx}`; // Update ID pattern
                             if (check) {
                                 check.value = String(newIdx);
                                 check.id = newCheckboxId;
                                 check.name = newCheckboxId; // Update name
                                 check.dataset.optIndex = String(newIdx);
                             }
                             if (label) {
                                 label.htmlFor = newCheckboxId; // Update label's 'for'
                                 label.title = `Đánh dấu là đáp án đúng/sai`; // Update title
                             }
                             const preview = card.querySelector('.editor-preview-container'); const textarea = card.querySelector('.hidden-data');
                             if (preview instanceof HTMLElement && textarea instanceof HTMLElement) {
                                 const newTargetId = `quizOptionData_${qId}_${newIdx}`;
                                 preview.dataset.optIndex = String(newIdx);
                                 preview.dataset.editorTarget = newTargetId;
                                 preview.dataset.editorContext = `Lựa chọn ${String.fromCharCode(65 + newIdx)} - Câu ${questionIndexForContext + 1}`;
                                 textarea.id = newTargetId;
                                 // Update accessibility attributes if needed
                                 preview.setAttribute('aria-label', `Chỉnh sửa lựa chọn ${String.fromCharCode(65 + newIdx)} câu ${questionIndexForContext + 1}`);
                             }
                             if(removeBtn) removeBtn.setAttribute('title', `Xóa lựa chọn ${String.fromCharCode(65 + newIdx)}`);
                         });
                         if(mode !== 'edit') saveProgressThrottled(); // Save progress after structure change
                     }});

                 } else {
                      console.warn(`Could not remove option at index ${indexToRemove} for question ${qId}. Data mismatch or index invalid?`, question.options);
                      // Fallback: just remove from DOM if data is inconsistent
                      optionDiv.remove();
                      updateQuizDataInput(); // Try to save anyway
                 }
             });
        }

        // Animate entrance if new option
        if (isNewOption) {
             updateQuizDataInput(); // Save structure
             if (!prefersReducedMotion) { gsap.from(optionDiv, {duration: 0.4, autoAlpha: 0, y: 20, ease: 'power2.out'}); }
             if(mode !== 'edit') saveProgressThrottled();
        }
    }

    /** Adds a completely new, blank quiz question card to the UI and data array. */
    function addNewQuizQuestion() {
        if (isAnimating || !quizContainer) return;
        const qId = `quizQ_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
        const newQuestionData = { id: qId, question: "", options: [] };
        quizData.push(newQuestionData);
        const newQuestionElement = createQuizQuestionElement(newQuestionData, qId);
        if (newQuestionElement) {
            addQuizOption(qId); // Add default option
            updateQuizDataInput();
            updateQuizNumbering();
            newQuestionElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            if (!prefersReducedMotion) {
                gsap.from(newQuestionElement, { duration: 0.5, autoAlpha: 0, y: 30, ease: 'power2.out', delay: 0.1 });
            }
            if(mode !== 'edit') saveProgressThrottled();
            console.log("Added new quiz question with ID:", qId);
        } else {
            console.error("Failed to create new quiz question element.");
            const failedIndex = quizData.findIndex(q => q?.id === qId);
            if (failedIndex > -1) quizData.splice(failedIndex, 1);
            showAlert("Không thể thêm câu hỏi mới vào giao diện.", "error");
        }
    }

    /** Renders the entire quiz section based on the current `quizData` array. */
    function renderQuiz() {
        if (!quizContainer) {
             console.error("Cannot render quiz: Missing container (#quizContainer).");
             return;
        }
        // quizData should be up-to-date (parsed on load or modified by interactions)
        console.log("Rendering Quiz UI (Multi-Choice Enabled)"); // Log deep copy

        quizContainer.innerHTML = ""; // Clear existing questions visually

        if (!Array.isArray(quizData)) {
             console.error("Quiz data is not an array, cannot render.", quizData);
             quizData = []; // Attempt recovery
             updateQuizDataInput(); // Update input to reflect reset
             quizContainer.innerHTML = '<p class="text-danger text-center">Lỗi: Dữ liệu quiz không hợp lệ.</p>';
             return;
        }

        if (quizData.length === 0) {
            quizContainer.innerHTML = '<p class="text-center text-muted">Chưa có câu hỏi nào. Hãy thêm câu hỏi mới hoặc tạo từ file!</p>';
        } else {
            quizData.forEach((q, index) => {
                 // Ensure each question has a valid ID (important for data from server/AI without IDs)
                if (!q || typeof q !== 'object') {
                     console.warn(`Invalid item found at quiz index ${index}, skipping rendering.`, q);
                     // Optionally remove it from quizData here or filter before loop
                     return; // Skip this item
                 }
                if (!q.id || typeof q.id !== 'string') {
                    console.warn(`Question at index ${index} is missing a valid string ID. Generating fallback ID.`);
                    q.id = `quizQ_render_${Date.now()}_${index}`;
                    // No need to update quizData[index] directly if q is a reference from the loop
                }

                // Create the question element
                const questionElement = createQuizQuestionElement(q, q.id);

                // If element created successfully, render its options
                if (questionElement) {
                    q.options = q.options || []; // Ensure options array exists
                    if (Array.isArray(q.options)) {
                        q.options.forEach((opt, optIdx) => {
                             if (opt && typeof opt === 'object') { // Basic check for valid option object
                                addQuizOption(q.id, optIdx, opt); // Render each valid option
                             } else {
                                 console.warn(`Invalid option found at index ${optIdx} for question ${q.id}, skipping.`, opt);
                                 // Optionally remove/clean the invalid option from q.options here
                             }
                        });
                    } else {
                         console.warn(`Options for question ${q.id} is not an array. Resetting.`, q.options);
                         q.options = []; // Reset to empty array
                         // Optionally add a default blank option: addQuizOption(q.id);
                    }
                } else {
                     console.error(`Failed to create question element for index ${index}, ID ${q.id}`);
                }
            });
            updateQuizDataInput(); // Ensure hidden input reflects potentially corrected data IDs
            updateQuizNumbering(); // Update all numbers after rendering is complete
        }
        // Ensure listeners are attached to all newly rendered previews
         quizContainer.querySelectorAll('.interactive-preview:not(.listener-added)').forEach(el => {
             addPreviewClickListener( /** @type {HTMLElement} */ (el));
        });
     }

    // --- Quiz Button Listeners ---
    addQuestionBtn?.addEventListener("click", addNewQuizQuestion);

    generateQuizBtn?.addEventListener("click", async () => {
        if (!docxFileInput?.files?.length) {
            showAlert("Vui lòng chọn một file DOCX hoặc PDF để tạo Quiz.", "warning", 3000);
            docxFileInput?.focus();
            return;
        }
        if (isAnimating || isSubmitting) {
            console.warn("Cannot generate quiz: Animation or submission in progress.");
            return;
        }

        const file = docxFileInput.files[0];
        if (file.size > 10 * 1024 * 1024) { // Example: 10MB limit
             showAlert("File quá lớn (tối đa 10MB).", "error", 4000);
             return;
        }

        const formData = new FormData();
        formData.append("file", file);

        const loadingOverlay = getEl("loading-overlay"); // Assuming you have one
        loadingOverlay?.classList.add("active");
        generateQuizBtn.disabled = true;
        generateQuizBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang xử lý...';
        let generatedSuccessfully = false; // Track success

        try {
            const res = await fetch("/api/quiz-generator", { method: "POST", body: formData });

            if (!res.ok) {
                // Try to parse error message from server response body
                let errorMsg = `Lỗi máy chủ (${res.status})`;
                 try {
                    const errorData = await res.json();
                    errorMsg = errorData.error || errorData.message || errorMsg;
                 } catch (parseErr) { /* Ignore if response is not JSON */ }
                showAlert(`Lỗi tạo quiz: ${errorMsg}`, "error", 5000);
                console.error("Quiz generation error:", res.status, res.statusText);
                return; // Exit after handling server error
            }

            const data = await res.json();

            if (data.error) { // Handle application-level errors returned in JSON
                showAlert(`Lỗi tạo quiz: ${data.error}`, "error", 5000);
                console.error("Quiz generation application error:", data.error);

            } else if (data.quiz && Array.isArray(data.quiz) && data.quiz.length > 0) {
                // Assign unique IDs and structure validation might be needed here
                const generatedQuiz = data.quiz.map((q, index) => ({
                    id: `quizQ_gen_${Date.now()}_${index}`, // Ensure new unique client-side IDs
                    question: q.question || "", // Ensure fields exist
                    options: Array.isArray(q.options) ? q.options.map(opt => ({ // Ensure options structure
                        text: opt.text || "",
                        isCorrect: !!opt.isCorrect // Coerce to boolean
                    })) : [],
                }));

                // Ask user whether to replace or append? (Replacing is simpler)
                let replace = true; // Default to replace
                if (quizData.length > 0) {
                     replace = window.confirm(`Đã tạo ${generatedQuiz.length} câu hỏi từ file.\n\nBẠN CÓ MUỐN THAY THẾ các câu hỏi hiện tại không?\n\n(Chọn 'OK' để thay thế, 'Cancel' để giữ lại câu cũ và hủy thêm câu mới).`);
                }

                if (replace) {
                    quizData = generatedQuiz; // Replace existing data
                    renderQuiz(); // Re-render the entire quiz section with new data
                    showAlert(`Đã tạo và thay thế thành công ${quizData.length} câu hỏi!`, "success", 3500);
                    generatedSuccessfully = true; // Mark success
                     if(mode !== 'edit') saveProgressThrottled(); // Save progress
                } else {
                     showAlert("Đã hủy thêm câu hỏi từ file.", "info", 2500);
                }

            } else if (data.quiz && Array.isArray(data.quiz) && data.quiz.length === 0) {
                 showAlert("File được xử lý nhưng không tìm thấy câu hỏi nào phù hợp để tạo quiz.", "warning", 4000);
                 console.warn("Quiz generation returned empty array.");
            } else {
                showAlert("Không nhận được dữ liệu quiz hợp lệ từ máy chủ.", "error", 4000);
                console.error("Invalid quiz data format received:", data);
            }
        } catch (err) {
            showAlert("Lỗi mạng hoặc lỗi xử lý khi tạo quiz.", "error", 4000);
            console.error("Fetch error during quiz generation:", err);
        } finally {
            loadingOverlay?.classList.remove("active");
            generateQuizBtn.disabled = false;
            generateQuizBtn.innerHTML = '<i class="fas fa-cogs"></i> Tạo Quiz';
            // Clear file input only on successful generation and replacement/append? Or always?
             if (docxFileInput) docxFileInput.value = ''; // Clear file input regardless
        }
    });


    // ==========================================================================
    // ESSAY EDITOR LOGIC
    // ==========================================================================

    /** Updates the hidden essayData input with the stringified current essayData array. */
    function updateEssayDataInput() {
         if (!essayDataInput) return;
        try {
            // Filter out potential null/undefined entries left by 'remove' logic
            const cleanEssayData = essayData.filter(e => e !== null && e !== undefined);
            if (cleanEssayData.length !== essayData.length) {
                console.warn("Essay data contained null entries, cleaning before saving to input.");
                 essayData = cleanEssayData; // Update the main array
            }
            essayDataInput.value = JSON.stringify(essayData);
            // console.log("Essay Data Input Updated:", essayDataInput.value);
        } catch (e) {
            console.error("Error stringifying essay data:", e, essayData);
            showAlert("Lỗi nghiêm trọng khi cập nhật dữ liệu Tự luận! Dữ liệu có thể không được lưu.", "error", 5000);
        }
    }

    /** Renders the essay questions based on the current `essayData` array. */
    function renderEssayQuestions() {
        if (!essayContainer) {
            console.error("Cannot render essay questions: Missing container (#essayContainer).");
            return;
        }
        // essayData should be up-to-date (parsed on load or modified by interactions)
        console.log("Rendering Essay Questions UI with data:", JSON.parse(JSON.stringify(essayData))); // Log deep copy

        essayContainer.innerHTML = ''; // Clear existing visually

        if (!Array.isArray(essayData)) {
            console.error("Essay data is not an array, cannot render.", essayData);
            essayData = []; // Attempt recovery
            updateEssayDataInput(); // Update input to reflect reset
            essayContainer.innerHTML = '<p class="text-danger text-center">Lỗi: Dữ liệu tự luận không hợp lệ.</p>';
            return;
        }

        if (essayData.length === 0) {
             essayContainer.innerHTML = '<p class="text-center text-muted">Chưa có câu hỏi tự luận nào.</p>';
        } else {
            // Filter out nulls before rendering, in case remove logic left them
            const validEssayData = essayData.filter(item => item !== null && item !== undefined);
            if (validEssayData.length !== essayData.length) {
                 console.warn("Found null entries in essayData during render, rendering only valid items.");
                 essayData = validEssayData; // Update main array to clean state
                 updateEssayDataInput(); // Save cleaned state
            }


            essayData.forEach((item, idx) => {
                 // Basic check for valid object structure
                 if (!item || typeof item !== 'object') {
                    console.warn(`Invalid essay item found at index ${idx}, skipping render.`, item);
                    return; // Skip this item
                 }

                const essayDiv = document.createElement("div");
                essayDiv.className = "essay-question-card";
                essayDiv.dataset.index = String(idx); // Use index as the identifier
                const questionTargetId = `essayQuestionData_${idx}`;
                const answerTargetId = `essayAnswerData_${idx}`;
                const currentQuestionNumber = idx + 1; // For labels/context

                essayDiv.innerHTML = `
                    <div class="essay-card-header">
                        <span class="question-number">Câu Tự Luận ${currentQuestionNumber}</span>
                        <button type="button" class="btn-icon remove-essay-question-btn" title="Xóa câu hỏi Tự luận ${currentQuestionNumber}"><i class="fas fa-trash-alt"></i></button>
                    </div>
                    <div class="essay-card-body">
                        <label class="form-label" for="${questionTargetId}_preview">Nội dung câu hỏi:</label>
                        <!-- Essay Question Preview -->
                        <div id="${questionTargetId}_preview" class="editor-preview-container interactive-preview"
                             data-editor-target="${questionTargetId}"
                             data-editor-type="essayQuestion"
                             data-q-id="${idx}"
                             data-editor-context="Câu hỏi Tự luận ${currentQuestionNumber}"
                             tabindex="0" role="button" aria-label="Chỉnh sửa câu hỏi Tự luận ${currentQuestionNumber}">
                            <div class="preview-content"></div>
                             <div class="edit-overlay" aria-hidden="true"><i class="fas fa-pencil-alt"></i> Chỉnh sửa</div>
                        </div>
                        <textarea id="${questionTargetId}" class="hidden-data" aria-hidden="true">${item.question || ''}</textarea>

                        <label class="form-label" style="margin-top: 15px;" for="${answerTargetId}_preview">Đáp án mẫu (Gợi ý chấm):</label>
                        <!-- Essay Answer Preview -->
                         <div id="${answerTargetId}_preview" class="editor-preview-container interactive-preview"
                              data-editor-target="${answerTargetId}"
                              data-editor-type="essayAnswer"
                              data-q-id="${idx}" 
                              data-editor-context="Đáp án mẫu - Câu ${currentQuestionNumber}"
                              tabindex="0" role="button" aria-label="Chỉnh sửa đáp án mẫu cho Câu ${currentQuestionNumber}">
                             <div class="preview-content"></div>
                             <div class="edit-overlay" aria-hidden="true"><i class="fas fa-pencil-alt"></i> Chỉnh sửa</div>
                        </div>
                         <textarea id="${answerTargetId}" class="hidden-data" aria-hidden="true">${item.sampleAnswer || ''}</textarea>
                    </div>
                `;
                essayContainer.appendChild(essayDiv);

                // Render initial previews
                const qPreview = /** @type {HTMLElement | null} */ (essayDiv.querySelector('.editor-preview-container[data-editor-type="essayQuestion"]'));
                const aPreview = /** @type {HTMLElement | null} */ (essayDiv.querySelector('.editor-preview-container[data-editor-type="essayAnswer"]'));
                 if(qPreview) renderPreview(qPreview, item.question);
                 if(aPreview) renderPreview(aPreview, item.sampleAnswer);
                 if(qPreview) addPreviewClickListener(qPreview); // Attach listener
                 if(aPreview) addPreviewClickListener(aPreview); // Attach listener

                // Remove button listener
                const removeBtn = essayDiv.querySelector(".remove-essay-question-btn");
                if (removeBtn) {
                    removeBtn.addEventListener("click", () => {
                        if (isAnimating) return;
                        // Use custom confirm modal ideally
                        if (window.confirm(`Bạn có chắc muốn xóa Câu hỏi Tự luận ${currentQuestionNumber}?`)) {
                            const currentIndex = parseInt(essayDiv.dataset.index || '-1', 10);
                            if (currentIndex > -1 && essayData[currentIndex] !== undefined) {
                                // Mark for removal instead of splicing immediately to avoid index shifts during potential animations
                                // essayData.splice(currentIndex, 1); // Avoid splice here
                                essayData[currentIndex] = null; // Mark as null
                                console.log(`Marked essay question at index ${currentIndex} for removal.`);

                                // Animate removal
                                gsap.to(essayDiv, { duration: 0.3, autoAlpha: 0, height: 0, marginTop: 0, marginBottom: -15, ease: 'power1.in', onComplete: () => {
                                    essayDiv.remove(); // Remove from DOM
                                    // Now, update the data input and re-number visually
                                    updateEssayDataInput(); // Saves the array *with* nulls filtered out
                                    updateEssayQuestionNumbering(); // Fix numbers on remaining visible cards
                                    if (mode !== 'edit') saveProgressThrottled();
                                }});
                            } else {
                                 console.warn(`Could not mark essay question at index ${currentIndex} for removal. Index invalid or item already removed?`);
                                 essayDiv.remove(); // Remove from DOM anyway
                                 updateEssayDataInput();
                                 updateEssayQuestionNumbering();
                            }
                        }
                    });
                }
            });
             // Ensure numbering is correct after initial render
            updateEssayQuestionNumbering();
            // Update hidden input after rendering all valid items
            // updateEssayDataInput(); // Already called within the loop if items were cleaned
        }

        // Ensure listeners are attached to all newly rendered previews
         essayContainer.querySelectorAll('.interactive-preview:not(.listener-added)').forEach(el => {
            addPreviewClickListener( /** @type {HTMLElement} */ (el));
        });
    }

    /** Updates the visual numbering (Câu Tự Luận 1...) of the essay questions currently in the DOM. */
    function updateEssayQuestionNumbering() {
         if (!essayContainer) return;
         let visibleIndex = 0;
         // Select only cards that are likely visible (not display:none or opacity:0 from removal animation)
         essayContainer.querySelectorAll('.essay-question-card').forEach((card) => {
            if (!(card instanceof HTMLElement)) return;
             // Check computed style for visibility/display might be more robust but slower
             // For simplicity, assume cards present are meant to be numbered sequentially
             visibleIndex++;
             const numberSpan = card.querySelector('.question-number');
             if (numberSpan) numberSpan.textContent = `Câu Tự Luận ${visibleIndex}`;

             // Update context attributes and aria-labels using the current visibleIndex
             const qIdx = card.dataset.index; // Keep original data index link
             const qPreview = /** @type {HTMLElement | null} */ (card.querySelector('.editor-preview-container[data-editor-type="essayQuestion"]'));
             const aPreview = /** @type {HTMLElement | null} */ (card.querySelector('.editor-preview-container[data-editor-type="essayAnswer"]'));
             if (qPreview) {
                qPreview.dataset.editorContext = `Câu hỏi Tự luận ${visibleIndex}`;
                qPreview.setAttribute('aria-label', `Chỉnh sửa câu hỏi Tự luận ${visibleIndex}`);
             }
             if (aPreview) {
                aPreview.dataset.editorContext = `Đáp án mẫu - Câu ${visibleIndex}`;
                 aPreview.setAttribute('aria-label', `Chỉnh sửa đáp án mẫu cho Câu ${visibleIndex}`);
             }
             const removeBtn = card.querySelector('.remove-essay-question-btn');
             if(removeBtn) removeBtn.setAttribute('title', `Xóa câu hỏi Tự luận ${visibleIndex}`);

             // Important: Update the dataset.index ONLY if you are re-indexing the underlying essayData array
             // If using the 'mark as null' approach, the original index remains the link to the data
             // card.dataset.index = String(visibleIndex - 1); // << DO NOT DO THIS unless re-indexing essayData itself
         });
         console.log("Updated essay question numbering. Visible count:", visibleIndex);
     }


    /** Adds a new, blank essay question card to the UI and data array. */
    function addNewEssayQuestion() {
        if (isAnimating || !essayContainer) return;

        const newItem = { question: "", sampleAnswer: "" };
        essayData.push(newItem); // Add to data array first
        const newIndex = essayData.length - 1; // Index of the new item in the *current* array

        // Manually create and append the new card element
        const essayDiv = document.createElement("div");
        essayDiv.className = "essay-question-card";
        essayDiv.dataset.index = String(newIndex); // Store its index
        const questionTargetId = `essayQuestionData_${newIndex}`;
        const answerTargetId = `essayAnswerData_${newIndex}`;

        // Calculate the visual number based on current visible cards + 1
        const currentVisibleCount = essayContainer.querySelectorAll('.essay-question-card').length;
        const newQuestionNumber = currentVisibleCount + 1;

        essayDiv.innerHTML = `
            <div class="essay-card-header">
                <span class="question-number">Câu Tự Luận ${newQuestionNumber}</span>
                <button type="button" class="btn-icon remove-essay-question-btn" title="Xóa câu hỏi Tự luận ${newQuestionNumber}"><i class="fas fa-trash-alt"></i></button>
            </div>
            <div class="essay-card-body">
                 <label class="form-label" for="${questionTargetId}_preview">Nội dung câu hỏi:</label>
                 <div id="${questionTargetId}_preview" class="editor-preview-container interactive-preview"
                      data-editor-target="${questionTargetId}" data-editor-type="essayQuestion" data-q-id="${newIndex}"
                      data-editor-context="Câu hỏi Tự luận ${newQuestionNumber}" tabindex="0" role="button" aria-label="Chỉnh sửa câu hỏi Tự luận ${newQuestionNumber}">
                     <div class="preview-content"></div><div class="edit-overlay" aria-hidden="true"><i class="fas fa-pencil-alt"></i> Chỉnh sửa</div>
                 </div>
                 <textarea id="${questionTargetId}" class="hidden-data" aria-hidden="true"></textarea>

                 <label class="form-label" style="margin-top: 15px;" for="${answerTargetId}_preview">Đáp án mẫu (Gợi ý chấm):</label>
                 <div id="${answerTargetId}_preview" class="editor-preview-container interactive-preview"
                      data-editor-target="${answerTargetId}" data-editor-type="essayAnswer" data-q-id="${newIndex}"
                      data-editor-context="Đáp án mẫu - Câu ${newQuestionNumber}" tabindex="0" role="button" aria-label="Chỉnh sửa đáp án mẫu cho Câu ${newQuestionNumber}">
                     <div class="preview-content"></div><div class="edit-overlay" aria-hidden="true"><i class="fas fa-pencil-alt"></i> Chỉnh sửa</div>
                 </div>
                 <textarea id="${answerTargetId}" class="hidden-data" aria-hidden="true"></textarea>
             </div>
        `;
        essayContainer.appendChild(essayDiv);

        // Render previews and add listeners
        const qPreview = /** @type {HTMLElement | null} */ (essayDiv.querySelector('.editor-preview-container[data-editor-type="essayQuestion"]'));
        const aPreview = /** @type {HTMLElement | null} */ (essayDiv.querySelector('.editor-preview-container[data-editor-type="essayAnswer"]'));
         if (qPreview) renderPreview(qPreview, newItem.question); // Initially empty
         if (aPreview) renderPreview(aPreview, newItem.sampleAnswer); // Initially empty
         if (qPreview) addPreviewClickListener(qPreview);
         if (aPreview) addPreviewClickListener(aPreview);

        // Add remove listener for the new card
        const removeBtn = essayDiv.querySelector(".remove-essay-question-btn");
        if (removeBtn) {
            removeBtn.addEventListener("click", () => {
                if (isAnimating) return;
                if (window.confirm(`Bạn có chắc muốn xóa Câu hỏi Tự luận ${newQuestionNumber}?`)) {
                     const currentIndex = parseInt(essayDiv.dataset.index || '-1', 10);
                     if (currentIndex > -1 && essayData[currentIndex] !== undefined) {
                         essayData[currentIndex] = null; // Mark for removal
                          console.log(`Marked new essay question at index ${currentIndex} for removal.`);
                         gsap.to(essayDiv, { duration: 0.3, autoAlpha: 0, height: 0, marginTop: 0, marginBottom: -15, ease: 'power1.in', onComplete: () => {
                             essayDiv.remove();
                             updateEssayDataInput(); // Save cleaned data
                             updateEssayQuestionNumbering(); // Update numbering
                             if(mode !== 'edit') saveProgressThrottled();
                         }});
                     } else {
                          console.warn(`Could not mark new essay question at index ${currentIndex} for removal.`);
                           essayDiv.remove(); // Remove from DOM anyway
                           updateEssayDataInput();
                           updateEssayQuestionNumbering();
                     }
                 }
            });
        }

        // Update data input immediately after adding to the array
        updateEssayDataInput();

        essayDiv.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        // Animate entrance
        if (!prefersReducedMotion) {
             gsap.from(essayDiv, { duration: 0.5, autoAlpha: 0, y: 30, ease: 'power2.out', delay: 0.1 });
        }
        if(mode !== 'edit') saveProgressThrottled();
        console.log("Added new essay question at index:", newIndex);
    }

    // --- Essay Button/Select Listeners ---
    addEssayQuestionBtn?.addEventListener("click", addNewEssayQuestion);

    essayGradingSelect?.addEventListener("change", () => {
        if(absoluteSettingsDiv) {
            const showAbsolute = essayGradingSelect.value === "absolute";
            // Animate toggle smoothly
            const currentHeight = absoluteSettingsDiv.offsetHeight;
            gsap.fromTo(absoluteSettingsDiv,
                { height: currentHeight, autoAlpha: absoluteSettingsDiv.style.opacity }, // Start from current state
                { duration: 0.3, height: showAbsolute ? 'auto' : 0, autoAlpha: showAbsolute ? 1 : 0, marginTop: showAbsolute ? 15 : 0, ease: 'power1.inOut'}
            );
        }
         if (mode !== 'edit') saveProgressThrottled(); // Save progress on change
    });
    // Initial check for absolute settings display on load (handled in initial load logic now)


    // ==========================================================================
    // VIDEO EDITOR LOGIC
    // ==========================================================================
    /** Updates the video preview area based on the URL in the videoUrlInput. */
    function triggerVideoPreviewUpdate() {
        if (!videoUrlInput || !videoPreviewArea) {
             // console.warn("Video input or preview area not found.");
             return;
        }
        const url = videoUrlInput.value.trim();
        videoPreviewArea.innerHTML = ''; // Clear previous preview or error

        if (!url) {
            videoPreviewArea.innerHTML = '<p class="text-muted text-center">Dán URL video vào ô trên để xem trước.</p>';
            return; // Exit if URL is empty
        }

        let embedUrl = '';
        let videoId = '';
        let platform = '';

        try {
            // More robust URL parsing
            if (url.match(/^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+/)) {
                platform = 'youtube';
                if (url.includes("watch?v=")) {
                    videoId = new URL(url).searchParams.get("v");
                } else if (url.includes("youtu.be/")) {
                    videoId = new URL(url).pathname.split('/')[1]?.split('?')[0]; // Get part after '/' and before '?'
                } else if (url.includes("/embed/")) {
                     videoId = new URL(url).pathname.split('/embed/')[1]?.split('?')[0];
                }
                 if (videoId) embedUrl = `https://www.youtube.com/embed/${videoId}`;

            } else if (url.match(/^(https?:\/\/)?(www\.)?(vimeo\.com)\/.+/)) {
                platform = 'vimeo';
                 const match = url.match(/vimeo\.com\/(?:video\/)?(\d+)/);
                 if (match && match[1]) {
                     videoId = match[1];
                     embedUrl = `https://player.vimeo.com/video/${videoId}`;
                 }
            }
            // Add other providers (e.g., Dailymotion) here with similar regex/parsing logic

            if (embedUrl && videoId && platform) {
                // Basic validation: Check if videoId seems reasonable (e.g., length for YouTube)
                 if (platform === 'youtube' && videoId.length !== 11) {
                     console.warn("Potential invalid YouTube video ID detected:", videoId);
                     // Optionally add more checks
                 }
                console.log(`Detected ${platform} video ID: ${videoId}`);
                // Use title attribute for accessibility
                videoPreviewArea.innerHTML = `<iframe src="${embedUrl}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen title="Xem trước video ${platform}"></iframe>`;
            } else {
                 console.warn("Could not extract embeddable URL from:", url);
                videoPreviewArea.innerHTML = '<p class="video-error text-danger text-center">Không thể nhận dạng URL video hợp lệ (Hỗ trợ YouTube, Vimeo).</p>';
            }
        } catch (error) {
             // Catch potential errors from URL constructor if URL is malformed
            console.error("Error parsing video URL:", error, url);
            videoPreviewArea.innerHTML = '<p class="video-error text-danger text-center">URL không hợp lệ hoặc không được hỗ trợ.</p>';
        }

        // The hidden input is usually the same as the visible one (name="editorData[video]")
        // No separate update needed unless your structure is different.

        // Trigger auto-save only if URL is considered valid? Or always on input?
        if (mode !== 'edit') saveProgressThrottled();
    }
    // Use 'input' for immediate feedback, throttled to avoid excessive updates
    videoUrlInput?.addEventListener("input", throttle(triggerVideoPreviewUpdate, 600));


    // ==========================================================================
    // LOCAL PROGRESS SAVING ('Add' Mode Only)
    // ==========================================================================
    const localProgressKey = `lessonProgressV3_${lessonForm.dataset.lessonId || 'new'}`; // Use data attribute or action for key

    /** Saves the current form state to localStorage. */
    const saveProgress = () => {
        if (mode === 'edit') return; // Only save progress in 'add' mode
        if (isSubmitting) return; // Don't save if form is submitting
        console.log("Auto-saving progress...");

        // Ensure data arrays are stringified into hidden inputs *before* saving
        updateQuizDataInput();
        updateEssayDataInput();

        const dataToSave = {
            _timestamp: Date.now(),
            // Step 1
            subjectId: subjectSelect?.value,
            title: titleInput?.value,
            category: categorySelect?.value,
            isProOnly: proOnlyCheckbox?.checked ?? false, // Default to false if null
            // Step 2 - Type and Data
            type: typeSelectHidden?.value,
            markdownData: markdownDataInput?.value,
            quizData: quizDataInput?.value,       // Already stringified
            videoUrl: videoUrlInput?.value,        // Current value from visible input
            essayPrompt: essayPromptDataInput?.value,
            essayGrading: essayGradingSelect?.value,
            absoluteTolerance: absoluteToleranceInput?.value,
            essayData: essayDataInput?.value,       // Already stringified
            // State
            currentStep: currentStep
        };

        try {
            localStorage.setItem(localProgressKey, JSON.stringify(dataToSave));
            console.log("Progress saved successfully to localStorage.");
            // Optional: Show subtle save indicator
            saveProgressBtn?.classList.add('saved-indicator'); // Add class for CSS feedback
            setTimeout(() => saveProgressBtn?.classList.remove('saved-indicator'), 1500);
        } catch (e) {
            console.error("Error saving progress to localStorage:", e);
            if (e.name === 'QuotaExceededError') {
                showAlert('Bộ nhớ cục bộ đã đầy, không thể lưu nháp tự động!', 'error', 5000);
                // Consider disabling auto-save here?
            } else {
                 showAlert('Lỗi khi lưu nháp tạm thời.', 'warning');
            }
        }
    };

    // Throttle auto-saving triggered by input/change events
    const saveProgressThrottled = throttle(saveProgress, 3500); // Save max every 3.5 seconds

    /**
     * Loads saved progress from localStorage and applies it to the form.
     * Returns true if progress was found and attempted to load, false otherwise.
    */
    const loadProgress = () => {
        if (mode === 'edit') return false; // Don't load for existing lessons

        const saved = localStorage.getItem(localProgressKey);
        if (!saved) {
             console.log("No saved progress found.");
             return false; // No saved data
        }

        console.log("Found saved progress in localStorage.");
        // Use custom confirm modal ideally
        if (!window.confirm("Tìm thấy bản nháp chưa lưu của bài học này. Bạn có muốn khôi phục không? (Chọn 'Cancel' để bắt đầu mới)")) {
            localStorage.removeItem(localProgressKey); // User chose not to restore
            console.log("User declined restoring progress. Starting fresh.");
            return false; // Did not load
        }

        let loadedSuccessfully = false; // Flag
        try {
            const data = JSON.parse(saved);
            console.log("Loading saved data:", data);

            // --- Restore Step 1 ---
            if (data.subjectId && subjectSelect) subjectSelect.value = data.subjectId;
            if (data.title !== undefined && titleInput) titleInput.value = data.title; // Allow empty title
            if (data.category && categorySelect) categorySelect.value = data.category;
            if (proOnlyCheckbox) proOnlyCheckbox.checked = data.isProOnly || false;

            // --- Restore Type and Hidden Data Inputs ---
            let loadedType = 'markdown'; // Default
            if (data.type && typeSelectHidden) {
                typeSelectHidden.value = data.type;
                loadedType = data.type;
                // Update type tab buttons visually
                typeTabButtons.forEach(b => b.classList.toggle("active", b.dataset.type === loadedType));
                // Update editor panel visibility *before* step change/render
                editorPanels.forEach(p => {
                    const panelType = p.dataset.editorType;
                    gsap.set(p, { display: panelType === loadedType ? 'block' : 'none', autoAlpha: panelType === loadedType ? 1 : 0 });
                });
                 console.log("Restored type:", loadedType);
            }
            // Set hidden input values FROM saved data
            if (data.markdownData !== undefined && markdownDataInput) markdownDataInput.value = data.markdownData;
            if (data.quizData !== undefined && quizDataInput) quizDataInput.value = data.quizData; // Stringified JSON
            if (data.videoUrl !== undefined && videoUrlInput) videoUrlInput.value = data.videoUrl;
            if (data.essayPrompt !== undefined && essayPromptDataInput) essayPromptDataInput.value = data.essayPrompt;
            if (data.essayData !== undefined && essayDataInput) essayDataInput.value = data.essayData; // Stringified JSON
            if (data.essayGrading && essayGradingSelect) {
                 essayGradingSelect.value = data.essayGrading;
                 // Trigger absolute tolerance visibility based on loaded value
                 if(absoluteSettingsDiv) {
                     const showAbsolute = data.essayGrading === "absolute";
                      gsap.set(absoluteSettingsDiv, { height: showAbsolute ? 'auto' : 0, autoAlpha: showAbsolute ? 1 : 0, marginTop: showAbsolute ? 15 : 0 });
                 }
            }
            if (data.absoluteTolerance && absoluteToleranceInput) absoluteToleranceInput.value = data.absoluteTolerance;


            // --- PARSE data AFTER loading into inputs ---
            try {
                 if (quizDataInput?.value) {
                    quizData = JSON.parse(quizDataInput.value);
                     if (!Array.isArray(quizData)) throw new Error("Parsed quiz data is not an array");
                 } else quizData = [];

                 if (essayDataInput?.value) {
                    essayData = JSON.parse(essayDataInput.value);
                     if (!Array.isArray(essayData)) throw new Error("Parsed essay data is not an array");
                 } else essayData = [];

                 console.log("Parsed loaded Quiz/Essay data from localStorage:", { quizData: JSON.parse(JSON.stringify(quizData)), essayData: JSON.parse(JSON.stringify(essayData)) });
            } catch (parseError) {
                 console.error("Error parsing quiz/essay data loaded from localStorage:", parseError);
                 quizData = []; // Reset on error
                 essayData = []; // Reset on error
                 if (quizDataInput) quizDataInput.value = '[]'; // Clear invalid input
                 if (essayDataInput) essayDataInput.value = '[]'; // Clear invalid input
                 showAlert("Lỗi đọc dữ liệu Quiz/Essay từ bản nháp. Một số nội dung có thể bị mất.", "warning");
            }
            // --- END PARSE ---


            // --- Restore Step and Render ---
            const loadedStep = (typeof data.currentStep === 'number' && data.currentStep >= 1 && data.currentStep <= steps.length) ? data.currentStep : 1;

            // Go to the saved step WITHOUT animation to avoid visual glitches during setup
             currentStep = loadedStep; // Set internal state
             steps.forEach(step => {
                 const stepNum = parseInt(step.dataset.stepContent || '0', 10);
                 const isActive = stepNum === loadedStep;
                  step.classList.toggle('active', isActive);
                  gsap.set(step, { position: isActive ? 'relative' : 'absolute', display: isActive ? 'block' : 'none', autoAlpha: isActive ? 1 : 0 });
             });
             updateStepIndicator(loadedStep); // Update visual indicator

             // Set wrapper height initially based on the loaded step's content
             const activeStepEl = steps.find(s => s.classList.contains('active'));
             if (activeStepEl) {
                  const wrapper = document.querySelector('.form-steps-wrapper');
                  // Temporarily make visible to measure height accurately
                  const originalVisibility = activeStepEl.style.visibility;
                  activeStepEl.style.visibility = 'hidden';
                  if (wrapper instanceof HTMLElement) {
                      wrapper.style.height = `${activeStepEl.scrollHeight}px`;
                  }
                   activeStepEl.style.visibility = originalVisibility;
                  // Reset to auto height after a frame
                  requestAnimationFrame(() => requestAnimationFrame(() => { if (wrapper instanceof HTMLElement) wrapper.style.height = 'auto'; }));
             }

             // Render previews AFTER setting the step, data, and ensuring correct panels are visible
             renderInitialPreviewsForType(loadedType);

             // Trigger video preview if loaded type is video
             if (loadedType === 'video' && videoUrlInput?.value) {
                  triggerVideoPreviewUpdate();
             }

             showAlert("Đã khôi phục bản nháp thành công!", "success", 2500);
             loadedSuccessfully = true; // Mark as successful load attempt

        } catch (e) {
            console.error("Error parsing or applying saved progress:", e);
            showAlert("Lỗi nghiêm trọng khi khôi phục bản nháp. Bắt đầu mới.", "error");
            localStorage.removeItem(localProgressKey); // Clear potentially corrupted data
            loadedSuccessfully = false; // Load failed
             // Reset form to default state? Or just reload the page?
             // window.location.reload(); // Simplest way to ensure clean slate
        }
        return loadedSuccessfully; // Return status
    };

    // Attach progress saving listeners only in 'add' mode
    if (mode !== 'edit' && lessonForm) {
        // Save on input/change events (throttled)
        lessonForm.addEventListener("input", saveProgressThrottled);
        lessonForm.addEventListener("change", saveProgressThrottled); // For selects, checkboxes, radios

        // Optional: Manual Save Button
        saveProgressBtn?.addEventListener("click", () => {
            saveProgress(); // Immediate save (not throttled)
            showAlert("Đã lưu nháp thủ công!", "info", 1500);
        });
         // Optional: Save before leaving the page
         window.addEventListener('beforeunload', (event) => {
             // Don't save if submitting normally
              if (!isSubmitting) {
                 console.log("Saving progress before unload...");
                 saveProgress(); // Attempt one last save
              }
             // Standard practice for beforeunload requires returning undefined or nothing for modern browsers
             // The confirmation message is handled by the browser itself.
             // event.preventDefault(); // Not needed unless conditionally preventing unload
             // event.returnValue = ''; // Standard way to trigger confirmation (browser controls message)
         });
    }

    // ==========================================================================
    // REVIEW STEP POPULATION
    // ==========================================================================
    /** Populates the summary fields in the review step (Step 3). */
    function populateReviewData() {
        if (reviewSubject) reviewSubject.textContent = subjectSelect?.selectedOptions[0]?.text || '(Chưa chọn)';
        if (reviewTitle) reviewTitle.textContent = titleInput?.value.trim() || '(Chưa có tiêu đề)';
        if (reviewCategory) reviewCategory.textContent = categorySelect?.selectedOptions[0]?.text || '(Chưa chọn)';
        if (reviewType && typeSelectHidden) {
             const activeTypeBtn = document.querySelector(`.type-tab-btn[data-type="${typeSelectHidden.value}"] span`);
             reviewType.textContent = activeTypeBtn?.textContent || typeSelectHidden.value || 'N/A';
        }
        if (reviewProOnly && proOnlyCheckbox) reviewProOnly.textContent = proOnlyCheckbox.checked ? 'Có (PRO)' : 'Không';

        // Provide a more informative content preview based on type
        if (reviewContentPreview) {
             let contentSummary = "Xem chi tiết nội dung ở Bước 2.";
             const currentType = typeSelectHidden?.value;
             switch(currentType) {
                 case 'markdown':
                     const mdLength = markdownDataInput?.value?.length || 0;
                     contentSummary = mdLength > 0 ? `Văn bản Markdown (${mdLength} ký tự)` : "Chưa có nội dung Markdown.";
                     break;
                 case 'quiz':
                     const qCount = quizData.filter(q => q).length; // Count valid questions
                     contentSummary = qCount > 0 ? `Trắc nghiệm (${qCount} câu hỏi)` : "Chưa có câu hỏi trắc nghiệm.";
                     break;
                 case 'video':
                     contentSummary = videoUrlInput?.value ? `Video: ${videoUrlInput.value}` : "Chưa có liên kết video.";
                     break;
                 case 'essay':
                      const eCount = essayData.filter(e => e).length; // Count valid questions
                      const hasPrompt = !!essayPromptDataInput?.value?.trim();
                      contentSummary = `Tự luận ${hasPrompt ? '(có đề bài chung)' : ''} (${eCount} câu hỏi)`;
                      if (eCount === 0 && !hasPrompt) contentSummary = "Chưa có nội dung tự luận.";
                     break;
             }
             reviewContentPreview.textContent = contentSummary;
        }
    }

    // ==========================================================================
    // FORM SUBMISSION
    // ==========================================================================
    lessonForm.addEventListener("submit", async (e) => {
        if (isSubmitting || isAnimating) {
            e.preventDefault();
            console.warn("Form submission prevented: Already submitting or animating.", { isSubmitting, isAnimating });
            showAlert("Đang xử lý hoặc hiệu ứng đang chạy, vui lòng đợi.", "warning", 2000);
            return;
        }
         if (isEditorOpen) {
             e.preventDefault();
             console.warn("Form submission prevented: Fullscreen editor is open.");
             showAlert("Vui lòng đóng trình soạn thảo (Lưu & Đóng) trước khi gửi bài học.", "warning", 3000);
             return;
         }


        console.log("Form submit initiated...");
        // Ensure latest data from arrays is in hidden inputs before native submission
        updateQuizDataInput();
        updateEssayDataInput();
        console.log("Final Quiz Data for submit:", quizDataInput?.value);
        console.log("Final Essay Data for submit:", essayDataInput?.value);

        // --- Basic HTML5 Validation (and focus) ---
        if (!lessonForm.checkValidity()) {
            e.preventDefault(); // Prevent submission
            console.log("Form validation failed.");
            showAlert("Vui lòng điền đầy đủ các trường bắt buộc hoặc sửa lỗi định dạng.", "error", 4000);

            // Find first invalid field
            const firstInvalid = /** @type {HTMLElement | null} */ (lessonForm.querySelector(':invalid'));
            if (firstInvalid) {
                 // Scroll to the step containing the invalid field
                 const invalidStepElement = firstInvalid.closest('.form-step');
                 if (invalidStepElement && !invalidStepElement.classList.contains('active')) {
                     const stepNum = parseInt(invalidStepElement.dataset.stepContent || '0', 10);
                     if (stepNum > 0) {
                         console.log(`Validation failed on step ${stepNum}, navigating...`);
                         goToStep(stepNum); // Navigate to the step
                         // Focus after step transition animation completes
                          setTimeout(() => {
                             firstInvalid.focus({ preventScroll: true }); // Focus without jumping scroll
                             // Optional shake animation
                             if (!prefersReducedMotion && typeof gsap !== 'undefined') {
                                 gsap.fromTo(firstInvalid.closest('.input-field-group, .custom-select-wrapper-v2, .quiz-question-card, .essay-question-card') || firstInvalid, { x: 0 }, { duration: 0.6, x: "+=6", yoyo: true, repeat: 3, ease: 'power1.inOut' });
                             }
                             // Scroll the field into view smoothly after focusing
                             firstInvalid.scrollIntoView({ behavior: 'smooth', block: 'center' });
                          }, 600); // Adjust delay based on animation duration
                     } else { firstInvalid.focus(); } // Fallback focus if step not found
                 } else {
                     // Already on the correct step, just focus and shake
                      firstInvalid.focus({ preventScroll: true });
                     if (!prefersReducedMotion && typeof gsap !== 'undefined') {
                         gsap.fromTo(firstInvalid.closest('.input-field-group, .custom-select-wrapper-v2, .quiz-question-card, .essay-question-card') || firstInvalid, { x: 0 }, { duration: 0.6, x: "+=6", yoyo: true, repeat: 3, ease: 'power1.inOut' });
                     }
                     firstInvalid.scrollIntoView({ behavior: 'smooth', block: 'center' });
                 }
            }
            return; // Stop submission
        }

        // --- Turnstile Check (Optional but recommended) ---
        // You might need to get the token and include it in the submission if handled via fetch
        // For native form submit, the server usually validates the 'cf-turnstile-response' field
        // const turnstileResponse = lessonForm.querySelector('[name="cf-turnstile-response"]')?.value;
        // if (!turnstileResponse) {
        //      e.preventDefault();
        //      showAlert("Vui lòng hoàn thành xác minh bảo mật (Turnstile).", "error");
        //      // Focus or highlight the Turnstile widget if possible
        //      return;
        // }

        // --- Set Submitting State ---
        isSubmitting = true;
        if (finalSubmitBtn instanceof HTMLButtonElement) {
            finalSubmitBtn.classList.add('submitting'); // Add visual state
            finalSubmitBtn.disabled = true;
            const btnText = finalSubmitBtn.querySelector('.btn-text') || finalSubmitBtn;
            if (btnText) btnText.innerHTML = `<i class="fas fa-spinner fa-spin"></i> ${mode === 'edit' ? 'Đang cập nhật...' : 'Đang thêm...'}`;
        }
        const loadingOverlay = getEl("loading-overlay");
        loadingOverlay?.classList.add("active"); // Show global overlay

        // --- Clear Local Progress on Successful Submit Intent (Add Mode Only) ---
        // Do this *before* the native submission navigates away
        if (mode !== 'edit') {
            console.log("Clearing local progress before submission...");
            localStorage.removeItem(localProgressKey);
        }

        // Allow native form submission to proceed
        console.log("Form validated. Allowing native submission...");
        // If using Fetch API instead:
        // e.preventDefault();
        // // ... gather FormData ...
        // fetch(lessonForm.action, { method: lessonForm.method, body: formData })
        //    .then(...)
        //    .catch(...)
        //    .finally(() => { isSubmitting = false; /* Reset button state */ });
    });

    // ==========================================================================
    // MODAL EVENT LISTENERS
    // ==========================================================================
    saveAndCloseBtn?.addEventListener('click', () => {
        if (isAnimating) return;
        closeFullscreenEditor(); // Will attempt to save first
    });
    closeModalBtn?.addEventListener('click', () => {
        if (isAnimating) return;
         // Ask for confirmation if there are unsaved changes?
         // let hasChanges = fullscreenEditorInstance?.getMarkdown() !== currentEditingTarget?.dataInput?.value;
         // if(hasChanges && !window.confirm("Bạn có thay đổi chưa lưu. Đóng mà không lưu?")) return;
        closeFullscreenEditor(); // Attempt save first by default
    });
    modalBackdrop?.addEventListener('click', () => {
        if (isAnimating) return;
         // closeFullscreenEditor(true); // Force close without saving on backdrop click? Or same as close button?
        closeFullscreenEditor(); // Attempt save first
    });
    // Close modal on ESC key
     document.addEventListener('keydown', (e) => {
         if (e.key === 'Escape' && isEditorOpen && !isAnimating) {
             console.log("ESC key pressed, closing editor.");
             // Check for changes before closing on ESC?
             closeFullscreenEditor(); // Attempt save first
         }
     });

    // ==========================================================================
    // INITIAL PAGE STATE & LOAD
    // ==========================================================================

    console.log("Setting up initial page state...");
    // Set initial step indicator
    updateStepIndicator(currentStep); // Should be 1 initially

    // Set initial visibility of steps (only step 1 active/visible)
    steps.forEach((step, index) => {
        const isActive = index === 0;
        step.classList.toggle('active', isActive);
        gsap.set(step, {
            position: isActive ? 'relative' : 'absolute',
            display: isActive ? 'block' : 'none',
            autoAlpha: isActive ? 1 : 0
        });
    });
    // Ensure wrapper height is initially auto or fits step 1
    const wrapper = document.querySelector('.form-steps-wrapper');
    if (wrapper instanceof HTMLElement) gsap.set(wrapper, { height: 'auto' });


    // --- Load Progress (Add Mode) or Parse Initial Data (Edit Mode) ---
    let progressLoaded = false;
    if (mode !== 'edit') {
        progressLoaded = loadProgress(); // Tries to load, returns true if successful
    }

    // If progress wasn't loaded (i.e., edit mode OR add mode starting fresh)
    if (!progressLoaded) {
        console.log(`Initializing state for mode: ${mode}. Progress loaded: ${progressLoaded}`);
        const initialType = typeSelectHidden?.value || 'markdown'; // Get type set by EJS or default

        // --- Edit Mode: Parse initial data provided by EJS ---
        if (mode === 'edit') {
            console.log("Edit mode: Parsing initial data from EJS inputs...");
            try {
                // Parse Quiz data
                 if (quizDataInput?.value) {
                     quizData = JSON.parse(quizDataInput.value);
                     if (!Array.isArray(quizData)) {
                         console.error("Initial quiz data from EJS is not an array:", quizData);
                         quizData = []; // Reset on error
                         quizDataInput.value = '[]'; // Clear bad data
                     }
                 } else quizData = [];
                 console.log("Parsed initial Quiz Data:", JSON.parse(JSON.stringify(quizData)));

                // Parse Essay data
                 if (essayDataInput?.value) {
                     essayData = JSON.parse(essayDataInput.value);
                      if (!Array.isArray(essayData)) {
                         console.error("Initial essay data from EJS is not an array:", essayData);
                         essayData = []; // Reset on error
                         essayDataInput.value = '[]'; // Clear bad data
                     }
                 } else essayData = [];
                 console.log("Parsed initial Essay Data:", JSON.parse(JSON.stringify(essayData)));

                // Ensure essay absolute settings visibility matches loaded state
                if (essayGradingSelect && absoluteSettingsDiv) {
                    const showAbsolute = essayGradingSelect.value === "absolute";
                    gsap.set(absoluteSettingsDiv, { height: showAbsolute ? 'auto' : 0, autoAlpha: showAbsolute ? 1 : 0, marginTop: showAbsolute ? 15 : 0 });
                    console.log(`Initial Essay Grading: ${essayGradingSelect.value}, Absolute Settings Visible: ${showAbsolute}`);
                } else if (essayGradingSelect && !absoluteSettingsDiv) {
                    console.warn("Essay grading select found, but absoluteSettingsDiv is missing.");
                }

            } catch (e) {
                console.error("FATAL: Error parsing initial JSON data in Edit Mode:", e);
                showAlert("Lỗi nghiêm trọng khi tải dữ liệu bài học (Quiz/Essay). Nội dung có thể không hiển thị đúng hoặc bị mất khi lưu.", "error", 7000);
                // Reset to empty arrays to prevent further errors during rendering
                quizData = [];
                essayData = [];
                 // Optionally clear the inputs that failed parsing
                 if (quizDataInput) quizDataInput.value = '[]';
                 if (essayDataInput) essayDataInput.value = '[]';
            }
        }
        // --- End Edit Mode Parsing ---

        // Render initial previews using the correct type and the now-populated data arrays
        renderInitialPreviewsForType(initialType);

        // Trigger video preview if type is video and URL exists (value set by EJS in edit mode)
        if (initialType === 'video' && videoUrlInput?.value) {
            console.log("Initial load: Triggering video preview update.");
            triggerVideoPreviewUpdate();
        }
    }
    // --- End Initial Load Logic ---


    // Add initial click listeners to static previews (markdown, essay prompt)
    document.querySelectorAll('.interactive-preview:not(.listener-added)').forEach(el => {
        addPreviewClickListener( /** @type {HTMLElement} */ (el));
    });

    // Initial Load Animations (Slide-ins for content)
    if (!prefersReducedMotion && typeof gsap !== 'undefined') {
        gsap.from('.step-indicator .step', {
            duration: 0.6, y: -20, autoAlpha: 0, stagger: 0.1,
            ease: 'power2.out', delay: 0.2
        });
        gsap.from('.main-title', {
            duration: 0.7, y: -25, autoAlpha: 0,
            ease: 'power3.out', delay: 0.3
        });

        // Select the elements for the slide-up animation
        const stepContentElements = '.form-step.active > *:not(.step-title), .form-step.active .form-grid > *, .form-step.active .step-navigation > *';

        // Ensure elements start visible (opacity: 1) before the 'from' animation
        // This might already be handled by the initial step setup, but being explicit is safer
        gsap.set(stepContentElements, { opacity: 1, visibility: 'visible' });

        // Animate ONLY the 'y' position from 25 to 0
        gsap.from(stepContentElements, {
            duration: 0.6,
            y: 25,           // Animate y from 25
            // autoAlpha: 0, // REMOVED - We want opacity: 1 throughout
            opacity: 1,      // Ensure opacity stays 1 (might be default, but explicit)
            stagger: 0.07,
            ease: 'power2.out',
            delay: 0.5,
            clearProps: "transform" // Remove the 'y' transform style once animation is complete
        });
    }
  
    // --- Input Field Focus/Blur & Placeholder Interaction ---
    const inputs = document.querySelectorAll('.form-input-v2');
    inputs.forEach(input => {
        const group = input.closest('.input-field-group');
        if(!group) return;

        const checkFilled = () => {
             if (input.value !== "") {
                 group.classList.add('filled');
             } else {
                 group.classList.remove('filled');
             }
        };

        input.addEventListener('focus', () => group.classList.add('focused'));
        input.addEventListener('blur', () => {
            group.classList.remove('focused');
            checkFilled();
        });
        checkFilled(); // Initial check for autofill
    });

    // --- TAG INPUT V3 INITIALIZATION ---
    const tagInputContainer = document.getElementById('tag-input-container');
    if (tagInputContainer) {
        const realInput = tagInputContainer.querySelector('.tag-input-field');
        const hiddenInput = document.getElementById('hidden-tags-input');
        let tags = [];

        const updateHiddenInput = () => {
            hiddenInput.value = tags.join(',');
            // Trigger save progress
            if(mode !== 'edit') saveProgressThrottled();
        };

        const createTagElement = (tagText) => {
            const tagEl = document.createElement('span');
            tagEl.className = 'tag-item';
            tagEl.innerHTML = `
                ${tagText}
                <button type="button" class="remove-tag-btn" title="Remove ${tagText}">&times;</button>
            `;

            tagEl.querySelector('.remove-tag-btn').addEventListener('click', () => {
                const index = tags.indexOf(tagText);
                if (index > -1) {
                    tags.splice(index, 1);
                    updateHiddenInput();
                    tagEl.remove();
                }
            });

            return tagEl;
        };

        const addTag = (tagText) => {
            const trimmedTag = tagText.trim();
            if (trimmedTag.length > 1 && !tags.includes(trimmedTag)) {
                tags.push(trimmedTag);
                const tagElement = createTagElement(trimmedTag);
                realInput.before(tagElement); // Thêm tag pill vào trước ô input
                updateHiddenInput();
            }
            realInput.value = "";
        };

        realInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ',') {
                e.preventDefault();
                addTag(realInput.value);
            } else if (e.key === 'Backspace' && realInput.value === '') {
                if (tags.length > 0) {
                    const lastTag = tags.pop();
                    const lastTagEl = tagInputContainer.querySelector('.tag-item:last-of-type');
                    if (lastTagEl) lastTagEl.remove();
                    updateHiddenInput();
                }
            }
        });

        tagInputContainer.addEventListener('click', () => {
            realInput.focus();
        });
        
        // Load initial tags from hidden input on page load
        const initialTags = hiddenInput.value.split(',').filter(Boolean);
        initialTags.forEach(addTag);
    }
    // --- END TAG INPUT V3 ---

    console.log(`Manage Lesson V3 Script Initialized. Mode: ${mode}. Multi-choice quiz enabled.`);

}); // End DOMContentLoaded