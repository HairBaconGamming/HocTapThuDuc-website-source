// --- LESSON DETAIL PAGE SCRIPT V2 (with Multi-Choice) ---
document.addEventListener('DOMContentLoaded', () => {
    // --- Config & Refs ---
    if (typeof gsap === 'undefined') { console.error("GSAP not loaded!"); return; }
    if (typeof marked === 'undefined') { console.warn("Marked library not loaded! Markdown parsing might fail."); }
    gsap.registerPlugin(ScrollTrigger);
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const lessonType = "<%= lesson?.type ?? 'unknown' %>";
    const lessonId = "<%= lesson?._id ?? '' %>";
    const completeBtn = document.getElementById("completeLessonBtnV2");
    const scoreRequirementMsg = document.getElementById("scoreRequirementMsg");
    const PASSING_PERCENTAGE = 80;
    const contentWrapper = document.querySelector('.lesson-content-wrapper');

    // --- General Animations ---
    // ... (Animations remain the same as previous version) ...
    if (!prefersReducedMotion) { gsap.from('[data-animate="header-fade-in"]', { duration: 0.8, y: -40, autoAlpha: 0, ease: 'power3.out', delay: 0.2 }); gsap.from('.lesson-type-icon', { duration: 0.6, scale: 0, rotation: -90, ease: 'back.out(1.7)', delay: 0.4 }); gsap.from('.lesson-title-area > *', { duration: 0.7, x: -30, autoAlpha: 0, stagger: 0.1, ease: 'power2.out', delay: 0.5 }); gsap.from('[data-animate="content-fade-up"]', { duration: 1.0, y: 50, autoAlpha: 0, ease: 'power3.out', delay: 0.4 }); gsap.from('[data-animate="action-bar-slide-up"]', { duration: 0.8, y: 40, autoAlpha: 0, ease: 'power2.out', delay: 0.8 }); } else { gsap.set('[data-animate="header-fade-in"], [data-animate="content-fade-up"], [data-animate="action-bar-slide-up"]', {autoAlpha: 1}); }

    // --- Markdown Specific Processing ---
    if (lessonType === 'markdown' && contentWrapper) {
        // ... (Markdown processing, KaTeX, Prism, Lightbox, Countdown logic remains the same) ...
         const contentAreaMd = document.getElementById("lessonContentV2");
         if (contentAreaMd && typeof renderMathInElement === 'function') { try { renderMathInElement(contentAreaMd, { delimiters: [ { left: '$$', right: '$$', display: true }, { left: '$', right: '$', display: false }, { left: '\\(', right: '\\)', display: false }, { left: '\\[', right: '\\]', display: true } ], throwOnError: false }); console.log("KaTeX rendered."); } catch (error) { console.error("KaTeX error:", error); } }
         if (contentAreaMd && typeof Prism !== 'undefined') { try { Prism.highlightAllUnder(contentAreaMd); } catch (error) { console.error("Prism error:", error); } }
         const markdownImages = contentAreaMd ? contentAreaMd.querySelectorAll('img') : []; markdownImages.forEach(img => { img.style.cursor = 'pointer'; img.addEventListener('click', () => openLessonLightbox(img.src, img.alt || 'Hình ảnh')); });
         const estimatedTimeSeconds = <%= (lesson?.estimatedReadingTime ?? 0) * 60 %>; const countdownTextEl = document.getElementById("countdownTextV2"); const countdownProgressCircle = document.getElementById("countdownProgressCircle"); const countdownContainer = document.getElementById("countdownContainerV2");
         if (estimatedTimeSeconds > 0 && countdownTextEl && countdownProgressCircle && completeBtn && countdownContainer) { let remaining = estimatedTimeSeconds; countdownTextEl.textContent = remaining; gsap.set(countdownProgressCircle, { strokeDashoffset: 100 }); if (!prefersReducedMotion) { const interval = setInterval(() => { remaining--; countdownTextEl.textContent = remaining > 0 ? remaining : "✓"; const progress = Math.max(0, (remaining / estimatedTimeSeconds)); const dashoffset = progress * 100; gsap.to(countdownProgressCircle, { strokeDashoffset: dashoffset, duration: 1, ease: 'linear' }); if (remaining <= 0) { clearInterval(interval); completeBtn.disabled = false; gsap.to(completeBtn, { scale: 1.1, duration: 0.3, yoyo: true, repeat: 1, ease: 'back.out(3)' }); gsap.to(countdownContainer, { scale: 1.1, autoAlpha: 0.7, duration: 0.3, ease: 'power2.out'}); } }, 1000); completeBtn.disabled = true; } else { completeBtn.disabled = false; countdownContainer.style.display = 'none'; } } else if(completeBtn) { completeBtn.disabled = false; if(countdownContainer) countdownContainer.style.display = 'none'; }
    } else if (completeBtn) {
         // Enable complete button immediately for non-markdown lessons
         completeBtn.disabled = false;
    }


    // --- Quiz Specific Processing (MULTI-CHOICE AWARE) ---
    if (lessonType === 'quiz' && contentWrapper) {
        let quizDataParsed = [];
        try {
            // 1. Get the outer string (which contains the JSON string inside)
            const outerString = <%- JSON.stringify(lesson.editorData.quiz || '[]') %>;

            // 2. Parse the outer string to get the *inner* JSON string
            // Note: JSON.stringify already handles escaping within the string literal
            const innerJsonString = JSON.parse(outerString);

            // 3. Parse the inner JSON string to get the actual data
            // Add a check to ensure innerJsonString is actually a string before parsing
            if (typeof innerJsonString === 'string') {
                 quizDataParsed = JSON.parse(innerJsonString);
            } else {
                 // If the outer parse already resulted in an object (meaning server sent correct data)
                 console.warn("Quiz data might not have been double-stringified, using directly.");
                 quizDataParsed = innerJsonString || [];
            }


            // Validate that the result is an array
            if (!Array.isArray(quizDataParsed)) {
                console.error("Parsed quiz data is not an array");
                throw new Error("Parsed data is not an array");
            }
            console.log("Successfully parsed quiz data");

        } catch (e) {
            console.error("Error parsing quiz data (potentially double-stringified):", e);
            quizDataParsed = []; // Reset on error
            const quizContainer = document.getElementById('quizContainerV2');
            if (quizContainer) {
                 quizContainer.insertAdjacentHTML('beforebegin',
                    '<p class="placeholder-text video-error">Lỗi tải dữ liệu trắc nghiệm. Dữ liệu có thể không đúng định dạng.</p>');
            }
        }
        const quizForm = document.getElementById('quizFormV2');
        const quizContainer = document.getElementById('quizContainerV2');
        const resultDiv = document.getElementById('quizResultV2');
        const resetBtn = document.getElementById("resetQuizBtnV2");
        const randomQuestionsToggle = /** @type {HTMLInputElement | null} */ (document.getElementById("toggleRandomQuestions"));
        const randomChoicesToggle = /** @type {HTMLInputElement | null} */ (document.getElementById("toggleRandomChoices"));
        let originalQuestionElements = quizContainer ? Array.from(quizContainer.children) : [];

        function shuffleArray(array) { /* ... shuffle logic ... */ for(let i=array.length-1; i>0; i--){ const j=Math.floor(Math.random()*(i+1)); [array[i],array[j]]=[array[j],array[i]]; } return array; }

        function loadQuizProgress() {
             const savedQuiz = localStorage.getItem('quizProgress_' + lessonId);
             if (savedQuiz && quizContainer) {
                 try {
                     const savedAnswers = JSON.parse(savedQuiz);
                     quizContainer.querySelectorAll('.quiz-question-card').forEach((qElem) => {
                         const originalIndex = parseInt(qElem.dataset.originalIndex ?? '-1', 10);
                         const inputType = qElem.dataset.inputType; // Get input type

                         if (!isNaN(originalIndex) && savedAnswers[originalIndex] !== null && savedAnswers[originalIndex] !== undefined) {
                             const answersForQuestion = savedAnswers[originalIndex];

                             if (inputType === 'radio') {
                                 const savedOptionIndex = answersForQuestion; // It's a single index
                                 const selectedOption = qElem.querySelector(`.quiz-option-v2[data-option-index="${savedOptionIndex}"]`);
                                 const radio = selectedOption?.querySelector('input[type="radio"]');
                                 if (radio) { radio.checked = true; selectedOption?.classList.add('selected'); }
                             } else if (inputType === 'checkbox') {
                                 if (Array.isArray(answersForQuestion)) { // Expecting an array of indices
                                     answersForQuestion.forEach(savedOptionIndex => {
                                         const selectedOption = qElem.querySelector(`.quiz-option-v2[data-option-index="${savedOptionIndex}"]`);
                                         const checkbox = selectedOption?.querySelector('input[type="checkbox"]');
                                         if (checkbox) { checkbox.checked = true; selectedOption?.classList.add('selected'); /* Optionally add visual cue */}
                                     });
                                 }
                             }
                         }
                     });
                     console.log("Quiz progress loaded.");
                 } catch (e) { console.error("Error loading quiz progress:", e); }
             }
         }

        function saveQuizProgress() {
            const answersByOriginalIndex = [];
             if (quizContainer) {
                 quizContainer.querySelectorAll('.quiz-question-card').forEach(qElem => {
                     const originalIndex = parseInt(qElem.dataset.originalIndex ?? '-1', 10);
                     const inputType = qElem.dataset.inputType;

                     if (originalIndex > -1) {
                         if (inputType === 'radio') {
                             const selectedRadio = qElem.querySelector('input[type="radio"]:checked');
                             answersByOriginalIndex[originalIndex] = selectedRadio ? selectedRadio.value : null; // Store index
                         } else if (inputType === 'checkbox') {
                             const checkedBoxes = qElem.querySelectorAll('input[type="checkbox"]:checked');
                             const checkedIndices = Array.from(checkedBoxes).map(cb => cb.value); // Store array of indices
                             answersByOriginalIndex[originalIndex] = checkedIndices;
                         }
                     }
                 });
                 try { localStorage.setItem('quizProgress_' + lessonId, JSON.stringify(answersByOriginalIndex)); } catch(e) { console.error("Error saving quiz progress:", e); }
             }
         }

        function resetQuestionElementState(questionElem) { /* ... same as before ... */
              if (!questionElem) return;
              questionElem.querySelectorAll('.quiz-option-v2').forEach(opt => { opt.classList.remove('selected', 'correct', 'incorrect', 'correct-answer-reveal'); opt.style.pointerEvents = 'auto'; });
              questionElem.querySelectorAll('.quiz-input').forEach(input => { input.checked = false; }); // Target generic class
              const feedbackDiv = questionElem.querySelector('.question-feedback'); if (feedbackDiv) feedbackDiv.innerHTML = '';
        }

        function renderQuiz(randomizeQuestions, randomizeChoices) { /* ... same as before ... */
            if (!quizContainer || !Array.isArray(quizDataParsed)) return;
            let questionsToRenderElements = originalQuestionElements.slice();
            if (randomizeQuestions) shuffleArray(questionsToRenderElements);
            quizContainer.innerHTML = '';
            questionsToRenderElements.forEach(qElementTemplate => { const newQuestionElem = qElementTemplate.cloneNode(true); resetQuestionElementState(newQuestionElem); const optionsContainer = newQuestionElem.querySelector(".quiz-options-list"); if (optionsContainer && randomizeChoices) { let options = Array.from(optionsContainer.children); shuffleArray(options); optionsContainer.innerHTML = ''; options.forEach(opt => optionsContainer.appendChild(opt)); } quizContainer.appendChild(newQuestionElem); });
            attachOptionListeners(); if (resultDiv) resultDiv.innerHTML = ''; if (quizForm) { quizForm.classList.remove('submitted'); const submitBtn = quizForm.querySelector('.submit-quiz-btn'); if (submitBtn) submitBtn.disabled = false; }
        }

        function attachOptionListeners() {
            quizContainer?.querySelectorAll('.quiz-option-v2').forEach(optionElem => {
                 optionElem.replaceWith(optionElem.cloneNode(true)); // Remove old listeners
            });
            quizContainer?.querySelectorAll('.quiz-option-v2').forEach(optionElem => {
                const input = optionElem.querySelector('.quiz-input'); // Use generic class
                if (input?.type === 'radio') {
                     // Only attach the visual selection logic to radio buttons
                     optionElem.addEventListener('click', handleRadioOptionClick);
                } else if (input?.type === 'checkbox') {
                     // Checkbox clicks are handled natively, just save progress
                     optionElem.addEventListener('change', handleCheckboxChange); // Use change for checkboxes
                }
            });
        }
        function handleRadioOptionClick(event) { // Renamed for clarity
            const wrapperDiv = event.currentTarget;
            const radioInput = wrapperDiv.querySelector('input[type="radio"]');
            if (radioInput && event.target !== radioInput && !event.target.closest('label')) { radioInput.checked = true; }
            const parentList = wrapperDiv.closest('.quiz-options-list'); if (!parentList) return;
            parentList.querySelectorAll('.quiz-option-v2').forEach(opt => opt.classList.remove('selected'));
            wrapperDiv.classList.add('selected');
            saveQuizProgress();
        }
        function handleCheckboxChange(event) {
            // Save progress whenever any checkbox changes state
            saveQuizProgress();
             // Optional: add/remove 'selected' class visually for checkboxes too
            const wrapperDiv = event.currentTarget.closest('.quiz-option-v2');
            const checkbox = event.currentTarget.querySelector('input[type="checkbox"]');
             if (wrapperDiv && checkbox) {
                 wrapperDiv.classList.toggle('selected', checkbox.checked);
             }
        }


        function resetAndRenderQuiz() { /* ... same as before ... */
            try { localStorage.removeItem('quizProgress_' + lessonId); } catch (e) { console.error("Error removing quiz progress:", e); }
            const randomizeQ = randomQuestionsToggle?.checked ?? false; const randomizeC = randomChoicesToggle?.checked ?? false;
            if(quizContainer) quizContainer.innerHTML = '';
            let elementsToRender = randomizeQ ? shuffleArray(originalQuestionElements.slice()) : originalQuestionElements.slice();
            elementsToRender.forEach(templateElement => { const clonedElement = templateElement.cloneNode(true); resetQuestionElementState(clonedElement); const optionsContainer = clonedElement.querySelector(".quiz-options-list"); if (optionsContainer && randomizeC) { let options = Array.from(optionsContainer.children); shuffleArray(options); optionsContainer.innerHTML = ""; options.forEach(opt => optionsContainer.appendChild(opt)); } quizContainer.appendChild(clonedElement); });
            attachOptionListeners(); if (resultDiv) resultDiv.innerHTML = ''; if(quizForm){ quizForm.classList.remove('submitted'); const submitBtn = quizForm.querySelector('.submit-quiz-btn'); if(submitBtn) submitBtn.disabled = false; }
            loadQuizProgress(); quizContainer?.scrollIntoView({ behavior: 'smooth', block: 'start' }); if(completeBtn) completeBtn.disabled = true; if(scoreRequirementMsg) scoreRequirementMsg.style.display = 'none';
        }

        resetBtn?.addEventListener("click", resetAndRenderQuiz);
        randomQuestionsToggle?.addEventListener("change", resetAndRenderQuiz);
        randomChoicesToggle?.addEventListener("change", resetAndRenderQuiz);

        if(quizContainer){
             originalQuestionElements = Array.from(quizContainer.children);
             renderQuiz(false, false); // Calls attachOptionListeners internally
             loadQuizProgress();
        } else { console.error("Quiz container missing on load."); }

        // --- Quiz Form Submission (MULTI-CHOICE AWARE - CORRECTED) ---
        quizForm?.addEventListener('submit', function(e) {
            e.preventDefault();
            if (this.classList.contains('submitted')) {
                console.log("Quiz already submitted.");
                return; // Prevent re-submit
            }

            let correctQuestionsCount = 0; // Count correctly answered *questions*
            let allQuestionsAnswered = true; // Assume true initially
            const questionElements = quizContainer?.querySelectorAll('.quiz-question-card') ?? [];
            const totalQuestions = questionElements.length;

            if (totalQuestions === 0) {
                showAlert("Không có câu hỏi nào để nộp bài.", "info");
                return;
            }
            console.log(`Starting quiz submission check for ${totalQuestions} questions.`);

            // --- Helper Function to Check Correctness (Consolidates Logic) ---
            function checkQuestionCorrectness(questionElem, qData) {
                if (!qData || !Array.isArray(qData.options)) {
                    console.error("checkQuestionCorrectness: Invalid qData provided.", qData);
                    return false; // Cannot determine correctness if data is bad
                }
                const inputType = questionElem.dataset.inputType;

                if (inputType === 'radio') {
                    const selectedRadio = questionElem.querySelector('input[type="radio"]:checked');
                    const selectedOptionIndex = selectedRadio ? parseInt(selectedRadio.value, 10) : -1;
                    // Correct if a radio is selected AND that option's isCorrect is true
                    return selectedOptionIndex !== -1 && qData.options[selectedOptionIndex]?.isCorrect === true;
                } else if (inputType === 'checkbox') {
                    const checkedBoxes = questionElem.querySelectorAll('input[type="checkbox"]:checked');
                    const checkedIndices = new Set(Array.from(checkedBoxes).map(cb => parseInt(cb.value, 10)));
                    const correctIndices = new Set();
                    qData.options.forEach((opt, idx) => { if (opt.isCorrect === true) correctIndices.add(idx); });

                    // Strict Check: Correct ONLY if the set of checked indices exactly matches the set of correct indices
                    return checkedIndices.size === correctIndices.size &&
                           [...checkedIndices].every(idx => correctIndices.has(idx));
                }
                console.warn(`checkQuestionCorrectness: Unknown input type "${inputType}"`);
                return false; // Default for unknown type
            }
            // --- End Helper Function ---


            // --- Phase 1: Validate Answers and Calculate Score ---
            console.log("Phase 1: Validating answers and calculating score...");
            questionElements.forEach((questionElem, index) => {
                const originalIndex = parseInt(questionElem.dataset.originalIndex ?? '-1', 10);
                const inputType = questionElem.dataset.inputType;

                // Basic Data Sanity Check
                if (isNaN(originalIndex) || !quizDataParsed || !quizDataParsed[originalIndex]) {
                     console.error(`Submit Error: Invalid index (${originalIndex}) or missing data at index ${index}.`);
                     allQuestionsAnswered = false; // Treat as unanswered if data is broken
                     questionElem.classList.add('error-highlight'); // Maybe add an error style
                     return; // Stop processing this question
                }
                const qData = quizDataParsed[originalIndex];

                // Check if Answered
                let isAnswered = false;
                if (inputType === 'radio') {
                    isAnswered = !!questionElem.querySelector('input[type="radio"]:checked');
                } else if (inputType === 'checkbox') {
                    isAnswered = !!questionElem.querySelector('input[type="checkbox"]:checked'); // Any checked counts as answered for this check
                }

                if (!isAnswered) {
                    allQuestionsAnswered = false;
                    questionElem.classList.add('unanswered-highlight');
                    console.log(`Question ${index + 1} (original index ${originalIndex}) is unanswered.`);
                } else {
                    questionElem.classList.remove('unanswered-highlight'); // Remove highlight if answered now
                    // Calculate score ONLY IF answered
                    if (checkQuestionCorrectness(questionElem, qData)) {
                        correctQuestionsCount++;
                        console.log(`Question ${index + 1} (original index ${originalIndex}) answered correctly.`);
                    } else {
                         console.log(`Question ${index + 1} (original index ${originalIndex}) answered incorrectly.`);
                    }
                }
            }); // End Phase 1 loop

            // --- Stop if not all questions are answered ---
            if (!allQuestionsAnswered) {
                showAlert('Vui lòng trả lời tất cả câu hỏi trước khi nộp bài.', 'warning');
                // Scroll to first unanswered question
                const firstUnanswered = quizContainer?.querySelector('.unanswered-highlight');
                firstUnanswered?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                // Optional: Remove highlights after a delay
                setTimeout(() => { quizContainer?.querySelectorAll('.unanswered-highlight').forEach(el => el.classList.remove('unanswered-highlight')); }, 3000);
                return; // EXIT submission
            }

            // --- Phase 2: Show Feedback and Results (Only if all answered) ---
            console.log("Phase 2: All questions answered. Applying feedback...");
            this.classList.add('submitted'); // Mark form as submitted
            const submitBtn = this.querySelector('.submit-quiz-btn');
            if(submitBtn) submitBtn.disabled = true; // Disable submit button
            const feedbackAnimations = [];

            questionElements.forEach(questionElem => {
                 const originalIndex = parseInt(questionElem.dataset.originalIndex ?? '-1', 10);
                 if (isNaN(originalIndex) || !quizDataParsed[originalIndex]) return; // Skip if bad data

                 const qData = quizDataParsed[originalIndex];
                 const options = questionElem.querySelectorAll('.quiz-option-v2');
                 const feedbackDiv = questionElem.querySelector('.question-feedback');

                 if(feedbackDiv) feedbackDiv.innerHTML = ''; // Clear old feedback

                 // Determine overall correctness using the helper function again
                 const isQuestionCorrectOverall = checkQuestionCorrectness(questionElem, qData);

                 // Apply feedback styles to all options
                 options.forEach(opt => {
                     opt.style.pointerEvents = 'none'; // Disable interaction
                     opt.classList.remove('correct', 'incorrect', 'correct-answer-reveal', 'selected'); // Clear previous states

                     const optIndex = parseInt(opt.dataset.optionIndex ?? '-1', 10);
                     if (isNaN(optIndex) || !qData.options?.[optIndex]) return; // Skip if bad option data

                     const isThisOptionCorrect = qData.options[optIndex].isCorrect === true;
                     const inputElement = opt.querySelector('.quiz-input'); // Generic class
                     const isChecked = inputElement?.checked || false; // Is this specific option checked?

                     // 1. Reveal ALL correct answers
                     if (isThisOptionCorrect) {
                         opt.classList.add('correct-answer-reveal');
                     }

                     // 2. Style CHECKED options based on correctness
                     if (isChecked) {
                         opt.classList.add(isThisOptionCorrect ? 'correct' : 'incorrect');
                         // Animate selected/checked option
                         if(!prefersReducedMotion) {
                            feedbackAnimations.push(gsap.fromTo(opt, { scale: 1 }, { scale: 1.05, duration: 0.3, yoyo: true, repeat: 1, ease: 'power2.inOut' }));
                         }
                     }
                     // 3. Add 'selected' class back to checked options for visual consistency
                     if (isChecked) {
                         opt.classList.add('selected');
                     }
                 });

                 // Show explanation if question was answered INCORRECTLY and explanation exists
                 if (!isQuestionCorrectOverall && qData.explanation && feedbackDiv) {
                     const sanitizedExplanation = qData.explanation.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
                     feedbackDiv.innerHTML = `<p class="feedback-explanation"><em>Giải thích:</em> ${sanitizedExplanation}</p>`;
                     if(!prefersReducedMotion){
                         feedbackAnimations.push(gsap.from(feedbackDiv, { autoAlpha: 0, y: 10, duration: 0.4, ease: 'power1.out' }));
                     } else {
                         gsap.set(feedbackDiv, {autoAlpha: 1});
                     }
                 }
            }); // End Phase 2 loop

            // --- Display final results after animations ---
            Promise.all(feedbackAnimations).catch(err => console.error("Feedback animation error:", err)).finally(() => {
                const scorePercentage = totalQuestions > 0 ? (correctQuestionsCount / totalQuestions) * 100 : 0;
                if (resultDiv) {
                    resultDiv.innerHTML = ''; // Clear previous
                    const resultContainer = document.createElement('div');
                    resultContainer.className = `quiz-final-result ${scorePercentage >= PASSING_PERCENTAGE ? 'perfect' : (scorePercentage >= 50 ? 'good' : 'bad')}`;
                    resultContainer.innerHTML = `
                         <h4>Kết quả:</h4>
                         <p>Bạn đã trả lời đúng <strong>${correctQuestionsCount} / ${totalQuestions}</strong> câu (${scorePercentage.toFixed(0)}%).</p>
                         ${scorePercentage >= PASSING_PERCENTAGE ? '<span class="perfect-score-msg"><i class="fas fa-star"></i> Đạt yêu cầu hoàn thành!</span>' : `<span class="fail-score-msg"><i class="fas fa-times-circle"></i> Cần đạt ${PASSING_PERCENTAGE}% để hoàn thành.</span>`}
                         <button type="button" class="results-reset-btn">Làm lại</button>
                    `;
                    resultDiv.appendChild(resultContainer);

                    const resultsResetBtn = resultDiv.querySelector('.results-reset-btn');
                    // Ensure resetAndRenderQuiz is defined before attaching listener
                    if(typeof resetAndRenderQuiz === 'function') {
                         resultsResetBtn?.addEventListener('click', resetAndRenderQuiz);
                    } else {
                         console.error("resetAndRenderQuiz function not found, reset button in results won't work.");
                    }


                    // Animate result container entrance
                    if(!prefersReducedMotion){
                         gsap.from(resultContainer, { duration: 0.5, scale: 0.8, autoAlpha: 0, ease: 'back.out(1.7)' });
                     } else {
                          gsap.set(resultContainer, { autoAlpha: 1 });
                     }

                    // Enable/Disable Complete Button based on score
                    if (scorePercentage >= PASSING_PERCENTAGE) {
                       if(completeBtn) completeBtn.disabled = false;
                       if(scoreRequirementMsg) scoreRequirementMsg.style.display = 'none';
                       if(!prefersReducedMotion && completeBtn) gsap.to(completeBtn, { scale: 1.1, duration: 0.3, yoyo: true, repeat: 1, ease: 'back.out(3)' });
                   } else {
                        if(completeBtn) completeBtn.disabled = true; // Keep disabled
                        if(scoreRequirementMsg) scoreRequirementMsg.style.display = 'inline'; // Show requirement message
                   }
                     resultDiv.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
                // Ensure options remain disabled
                quizContainer?.querySelectorAll('.quiz-option-v2').forEach(opt => { opt.style.pointerEvents = 'none'; });
            }); // End Promise.finally
        }); // End submit event listener
    }


    // --- Essay Specific Processing ---
    if (lessonType === 'essay' && contentWrapper) {
        const essayForm = document.getElementById('essayFormV2');
        const submitBtnEssay = document.getElementById('submitEssayBtnV2');
        const gradingStatusEl = document.getElementById('gradingStatusV2');
        const essayResultDiv = document.getElementById('essayResultV2');
        const essayAnswerTextareas = document.querySelectorAll('.essay-answer-textarea');

        // Load/Save Essay Progress
        function loadEssayProgress() {
          const savedEssay = localStorage.getItem('essayProgress_' + lessonId);
          if (savedEssay) { try { const essayAnswers = JSON.parse(savedEssay); document.querySelectorAll('.essay-question-group').forEach((qElem, idx) => { const textarea = qElem.querySelector('.essay-answer-textarea'); if (textarea && essayAnswers[idx]) { textarea.value = essayAnswers[idx]; const wrapper = textarea.closest('.textarea-wrapper'); if(wrapper) wrapper.classList.add('filled'); } }); console.log("Essay progress loaded."); } catch (e) { console.error("Error loading essay progress:", e); } }
       }
       function saveEssayProgress() {
          const essayAnswers = []; document.querySelectorAll('.essay-question-group').forEach(qElem => { const textarea = qElem.querySelector('.essay-answer-textarea'); essayAnswers.push(textarea ? textarea.value : ''); }); try { localStorage.setItem('essayProgress_' + lessonId, JSON.stringify(essayAnswers)); /* console.log("Essay progress saved."); */ } catch(e) { console.error("Error saving essay progress", e); }
       }

        loadEssayProgress(); // Load on page start
        essayAnswerTextareas.forEach(textarea => {
             textarea.addEventListener('input', saveEssayProgress); // Save on input
             // Label animation logic
             const wrapper = textarea.closest('.textarea-wrapper');
             const label = wrapper?.querySelector('label'); // Assuming label exists
             if (!wrapper) return;
             const checkFilled = () => { if (textarea.value.trim() !== "") wrapper.classList.add('filled'); else wrapper.classList.remove('filled'); };
             textarea.addEventListener('focus', () => wrapper.classList.add('focused'));
             textarea.addEventListener('blur', () => { wrapper.classList.remove('focused'); checkFilled(); });
             checkFilled(); // Initial check
        });


        // Essay Submission
        essayForm?.addEventListener('submit', async function(e){
            e.preventDefault();
            if(submitBtnEssay?.classList.contains('submitting')) return;

            const essayQuestions = document.querySelectorAll('.essay-question-group');
            const answers = [];
            let allFilled = true;
            essayQuestions.forEach(qElem => {
                const textarea = qElem.querySelector('.essay-answer-textarea');
                const answer = textarea ? textarea.value.trim() : '';
                if(!answer) {
                     allFilled = false;
                     textarea?.classList.add('invalid'); // Highlight empty textareas
                } else {
                     textarea?.classList.remove('invalid');
                }
                answers.push(answer);
            });

             if(!allFilled){
                 showAlert("Vui lòng trả lời tất cả các câu hỏi tự luận.", "warning");
                 return;
             }

            if(gradingStatusEl) gradingStatusEl.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Đang chấm bài bằng AI...`;
            if(submitBtnEssay) { submitBtnEssay.disabled = true; submitBtnEssay.classList.add('submitting'); }
            if(essayResultDiv) essayResultDiv.innerHTML = ''; // Clear previous results

            try {
                const response = await fetch(`/essay/grade/${lessonId}`, { // Ensure API endpoint is correct
                    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ answers })
                });
                const result = await response.json();

                if(gradingStatusEl) gsap.to(gradingStatusEl, {autoAlpha: 0, duration: 0.3 }); // Fade out status

                if(!response.ok || result.error) { throw new Error(result.error || `HTTP error ${response.status}`); }

                // Display Essay Results
                 if(essayResultDiv) {
                     essayResultDiv.innerHTML = `<h4><i class="fas fa-poll"></i> Kết quả chấm bài:</h4>`;
                     const avgScoreEl = document.createElement('p');
                     avgScoreEl.className = 'average-score';
                     const averageScore = Math.round(result.averageScore || 0);
                     avgScoreEl.innerHTML = `Điểm trung bình: <span class="score-value" data-score="${averageScore}">0</span> / 100`;
                     essayResultDiv.appendChild(avgScoreEl);

                     const avgScoreValue = avgScoreEl.querySelector('.score-value');
                     if(avgScoreValue && !prefersReducedMotion){
                         gsap.to(avgScoreValue, { textContent: averageScore, duration: 1.5, ease: 'power1.out', snap: {textContent: 1}, roundProps: 'textContent'});
                     } else if (avgScoreValue) {
                         avgScoreValue.textContent = averageScore;
                     }

                     const detailsContainer = document.createElement('div');
                     detailsContainer.className = 'essay-score-details';
                     essayResultDiv.appendChild(detailsContainer);

                     // --- CORE FIX: Access comments and diffs using index from the main result object ---
                     const scoresArray = result.scores || [];
                     const commentsArray = result.comments || []; // Get comments array
                     const diffsArray = result.diffs || [];       // Get diffs array

                     scoresArray.forEach((scoreValue, idx) => { // Iterate through scores
                         const detailEl = document.createElement('div');
                         detailEl.className = 'score-detail-item';
                         const score = Math.round(scoreValue || 0); // Get score for this index
                         const comment = commentsArray[idx] || ""; // Get comment for this index
                         const diffHtml = diffsArray[idx] || "";    // Get diff HTML for this index

                         let scoreColorClass = score >= 80 ? 'high' : score >= 50 ? 'medium' : 'low';

                         detailEl.innerHTML = `
                              <div class="score-header"><strong>Câu ${idx + 1}:</strong> <span class="score-badge ${scoreColorClass}">${score} / 100</span></div>
                              ${comment ? `<p class="essay-comment"><i class="fas fa-comment-dots"></i> <strong>Nhận xét:</strong> ${comment}</p>` : ''}
                              ${diffHtml ? `<div class="diff-display-v2"><p><strong>Gợi ý sửa lỗi:</strong></p>${diffHtml}</div>` : ''}
                         `;
                         detailsContainer.appendChild(detailEl);
                     });
                     // --- END CORE FIX ---

                     if(!prefersReducedMotion){
                         gsap.from(detailsContainer.children, {duration: 0.5, autoAlpha: 0, y: 15, stagger: 0.1, ease:'power2.out', delay: 0.5});
                     }

                     // Enable/Disable Complete Button
                     if (averageScore >= PASSING_PERCENTAGE) {
                        if(completeBtn) completeBtn.disabled = false;
                        if(scoreRequirementMsg) scoreRequirementMsg.style.display = 'none';
                        if(!prefersReducedMotion && completeBtn) gsap.to(completeBtn, { scale: 1.1, duration: 0.3, yoyo: true, repeat: 1, ease: 'back.out(3)' });
                        const passMsg = document.createElement('p'); passMsg.className = 'perfect-score-msg'; passMsg.innerHTML = `<i class="fas fa-star"></i> Đạt yêu cầu hoàn thành!`; essayResultDiv.appendChild(passMsg);
                     } else {
                         if(completeBtn) completeBtn.disabled = true;
                         if(scoreRequirementMsg) scoreRequirementMsg.style.display = 'inline';
                         const failMsg = document.createElement('p'); failMsg.className = 'fail-score-msg'; failMsg.innerHTML = `<i class="fas fa-times-circle"></i> Chưa đạt yêu cầu (${PASSING_PERCENTAGE}%).`; essayResultDiv.appendChild(failMsg);
                     }
                      // Add reset button
                      const essayResetBtn = document.createElement('button');
                      essayResetBtn.type = 'button';
                      essayResetBtn.className = 'btn btn-secondary-outline results-reset-btn'; // Reuse quiz reset style
                      essayResetBtn.innerHTML = '<i class="fas fa-redo"></i> Làm lại bài tự luận';
                      essayResetBtn.addEventListener('click', () => {
                           if (window.confirm('Bạn muốn xóa bài làm hiện tại và làm lại?')) {
                               essayAnswerTextareas.forEach(ta => ta.value = ''); // Clear textareas
                               saveEssayProgress(); // Save cleared state
                               if(essayResultDiv) essayResultDiv.innerHTML = ''; // Clear results
                               if(gradingStatusEl) gradingStatusEl.innerHTML = ''; // Clear status
                               if(completeBtn) completeBtn.disabled = true; // Disable complete btn
                               if(scoreRequirementMsg) scoreRequirementMsg.style.display = 'none'; // Hide score message
                                essayAnswerTextareas[0]?.focus(); // Focus first textarea
                           }
                      });
                       essayResultDiv.appendChild(essayResetBtn); // Add button to results
                 }

            } catch(err) {
                console.error("Essay grading error:", err);
                if(gradingStatusEl) gradingStatusEl.textContent = "Lỗi khi chấm bài.";
                 showAlert(`Đã có lỗi xảy ra: ${err.message || 'Không thể chấm bài.'}`, "error", 5000);
            } finally {
                 if(submitBtnEssay) { submitBtnEssay.disabled = false; submitBtnEssay.classList.remove('submitting'); }
            }
        });
    }


    // --- Progress Saving Button ---
    const saveBtn = document.getElementById('lessonProgressBtnV2');
    saveBtn?.addEventListener('click', function () {
        let saved = false;
        if (lessonType === 'essay') { saveEssayProgress(); saved = true; }
        if (lessonType === 'quiz') { saveQuizProgress(); saved = true; }

        if (saved && showAlert) {
            // Subtle confirmation animation on button
            gsap.timeline()
                .to(saveBtn, { scale: 0.95, duration: 0.15, ease: 'power1.in' })
                .to(saveBtn, { scale: 1, duration: 0.4, ease: 'elastic.out(1, 0.5)' });
            showAlert("Tiến trình đã được lưu cục bộ.", "info", 2500);
        } else if (showAlert) {
            showAlert("Không có tiến trình để lưu cho loại bài học này.", "info", 2500);
        }
    });

    // --- Lesson Completion ---
    completeBtn?.addEventListener("click", async function() {
        if(this.disabled) return;

         let confirmed = false;
         if(typeof showCustomConfirm === 'function'){
             confirmed = await showCustomConfirm("Bạn chắc chắn đã hoàn thành bài học này?");
         } else {
             confirmed = window.confirm("Bạn đã hoàn thành bài học chưa?");
         }

          if (confirmed) {
              this.disabled = true;
              this.classList.add('submitting');
              try {
                  const res = await fetch(`/lesson/${lessonId}/complete`, {
                      method: 'POST', headers: { 'Content-Type': 'application/json' }
                  });
                  const data = await res.json();
                  this.classList.remove('submitting');

                  if (data.success) {
                       showArtisticCompletionNotification(data);
                       this.textContent = "Đã Hoàn Thành";
                       this.disabled = true;
                       localStorage.removeItem('essayProgress_' + lessonId);
                       localStorage.removeItem('quizProgress_' + lessonId);
                  } else {
                       if(showAlert) showAlert("Lỗi khi đánh dấu hoàn thành: " + (data.error || 'Unknown error'), "error", 5000);
                       this.disabled = false;
                  }
              } catch (err) {
                  console.error("Completion error:", err);
                  if(showAlert) showAlert("Lỗi kết nối khi đánh dấu hoàn thành.", "error", 5000);
                  this.classList.remove('submitting');
                  this.disabled = false;
              }
          }
    });

    // --- Artistic Completion Notification ---
    function showArtisticCompletionNotification(data) {
        const existingNotif = document.querySelector('.achievement-notification-v2');
        if(existingNotif) existingNotif.remove();

        const notif = document.createElement("div");
        notif.className = "achievement-notification-v2";

        const content = document.createElement('div');
        content.className = 'achievement-content';

        const iconSrc = data.achievementName
             ? '/img/achievement-icon.png' // Replace with your achievement icon path
             : '/img/checkmark-icon.png';   // Replace with your checkmark icon path

        const titleText = data.achievementName || "Hoàn Thành!";
        const descText = data.achievementDescription || `Bạn nhận được ${data.pointsAwarded || 0} điểm! <br/>Tổng điểm: ${data.totalPoints || 'N/A'}`;

        function wrapChars(text, baseDelay = 0, increment = 0.03) { /* ... wrap logic as before ... */ return text.split('').map((char, i) => `<span class="char-anim" style="animation-delay: ${(baseDelay + i * increment).toFixed(3)}s;">${char === ' ' ? ' ' : char}</span>`).join(''); }
        function wrapLines(text, baseDelay = 0, increment = 0.1){ /* ... wrap logic as before ... */ return text.split('<br/>').map((line, index) => `<span class="line-anim" style="animation-delay: ${(baseDelay + index * increment).toFixed(3)}s">${line}</span>`).join('<br/>'); }

        const titleDelay = 0.5;
        const descDelay = titleDelay + (titleText.length * 0.03) + 0.2;

        content.innerHTML = `
            <div class="achievement-icon-container"> <img src="${iconSrc}" alt="Notification Icon" class="achievement-icon ${data.achievementName ? 'trophy' : 'checkmark'}"> </div>
            <div class="achievement-text"> <div class="achievement-title" aria-label="${titleText}">${wrapChars(titleText, titleDelay, 0.03)}</div> <div class="achievement-description">${wrapLines(descText, descDelay, 0.1)}</div> </div>`;

        notif.appendChild(content);
        document.body.appendChild(notif);

        // Particle effect
        if (data.achievementName && typeof tsParticles !== 'undefined' && !prefersReducedMotion) { /* ... tsParticles config as before ... */ }

        // Animation
        gsap.fromTo(notif, { y: -20, autoAlpha: 0, scale: 0.9 }, { y: 0, autoAlpha: 1, scale: 1, duration: 0.6, ease: 'back.out(1.7)' });
        const displayDuration = Math.max(5000, (descDelay + (descText.length * 0.025) + 1) * 1000);
        gsap.to(notif, { delay: displayDuration / 1000, duration: 0.8, autoAlpha: 0, y: -30, scale: 0.9, ease: 'power2.in', onComplete: () => notif.remove() });
    }


    // --- Lightbox Setup ---
    const lightboxModal = document.getElementById('lessonLightboxModal');
    const lightboxImg = document.getElementById('lessonLightboxImg');
    const lightboxCaption = document.getElementById('lessonLightboxCaption');
    const lightboxCloseBtn = document.querySelector('#lessonLightboxModal .lightbox-close-btn');
    const lightboxBackdrop = document.querySelector('#lessonLightboxModal .lightbox-backdrop');

    function openLessonLightbox(src, caption) {
         if (!src || !lightboxModal || !lightboxImg || !lightboxCaption) return;
         lightboxImg.src = ''; lightboxImg.src = src; lightboxCaption.textContent = caption || '';
         gsap.set(lightboxModal, { display: 'flex', autoAlpha: 0 });
         gsap.to(lightboxModal, { duration: 0.4, autoAlpha: 1, ease: 'power2.out' });
         gsap.from(lightboxImg, { duration: 0.5, scale: 0.9, delay: 0.1, ease: 'power2.out' });
         document.body.style.overflow = 'hidden';
     }
    function closeLessonLightbox() {
         if (!lightboxModal || !(lightboxImg instanceof HTMLImageElement)) return;
         gsap.to(lightboxModal, { duration: 0.3, autoAlpha: 0, ease: 'power1.in', onComplete: () => { lightboxModal.style.display = 'none'; document.body.style.overflow = ''; lightboxImg.src = ''; } });
     }
    lightboxCloseBtn?.addEventListener('click', closeLessonLightbox);
    lightboxBackdrop?.addEventListener('click', closeLessonLightbox);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && lightboxModal && lightboxModal.style.display !== 'none') closeLessonLightbox(); });

    // --- Loading Link Script ---
    document.querySelectorAll(".loading-link").forEach(anchor => {
        anchor.addEventListener("click", function (event) {
             // Simple check if it's a link to the same page (hash link)
            if (this.hash && this.pathname === window.location.pathname) { return; }
            // Prevent default navigation for external links or other protocols? Maybe not needed.
            // if (this.hostname !== window.location.hostname || this.protocol !== window.location.protocol) { return; }

             const overlay = document.getElementById('loading-overlay');
             if (overlay) {
                overlay.style.opacity = '0'; // Start transparent
                overlay.classList.add('active');
                gsap.to(overlay, { opacity: 1, duration: 0.3 }); // Fade in
             }
             // No preventDefault(), allow navigation to proceed after showing overlay
         });
     });

    // --- Initial State for Complete Button (Quiz/Essay) ---
     if ((lessonType === 'quiz' || lessonType === 'essay') && completeBtn) {
         completeBtn.disabled = true; // Start disabled
          if(scoreRequirementMsg) scoreRequirementMsg.style.display = 'inline'; // Show requirement initially
     } else if (scoreRequirementMsg) {
           scoreRequirementMsg.style.display = 'none'; // Hide if not quiz/essay
     }

     if (lessonType === 'quiz') {
        // --- PAGINATION LOGIC FOR QUIZ VIEW ---
        const ITEMS_PER_PAGE = 5; // Có thể đặt khác với trang editor
        const quizContainer = document.getElementById('quizContainerV2');
        if (!quizContainer) return;

        const allQuestionCards = Array.from(quizContainer.querySelectorAll('.quiz-question-card'));
        const totalItems = allQuestionCards.length;
        
        const showPage = (page) => {
            const startIndex = (page - 1) * ITEMS_PER_PAGE;
            const endIndex = startIndex + ITEMS_PER_PAGE;
            
            allQuestionCards.forEach((card, index) => {
                if (index >= startIndex && index < endIndex) {
                    card.style.display = 'block';
                } else {
                    card.style.display = 'none';
                }
            });
        };

        const setupPagination = () => {
            const paginationContainer = document.getElementById('quizPagination');
            if (!paginationContainer) return;

            const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE);
            let currentPage = 1;

            const renderButtons = () => {
                paginationContainer.innerHTML = '';
                if (totalPages <= 1) return;

                const prevBtn = document.createElement('button');
                prevBtn.innerHTML = '<i class="fas fa-chevron-left"></i>';
                prevBtn.className = 'pagination-btn';
                prevBtn.disabled = currentPage === 1;
                prevBtn.addEventListener('click', () => {
                    if (currentPage > 1) {
                        currentPage--;
                        showPage(currentPage);
                        renderButtons();
                    }
                });
                paginationContainer.appendChild(prevBtn);

                const pageInfo = document.createElement('span');
                pageInfo.className = 'pagination-info';
                pageInfo.textContent = `Trang ${currentPage} / ${totalPages}`;
                paginationContainer.appendChild(pageInfo);

                const nextBtn = document.createElement('button');
                nextBtn.innerHTML = '<i class="fas fa-chevron-right"></i>';
                nextBtn.className = 'pagination-btn';
                nextBtn.disabled = currentPage === totalPages;
                nextBtn.addEventListener('click', () => {
                    if (currentPage < totalPages) {
                        currentPage++;
                        showPage(currentPage);
                        renderButtons();
                    }
                });
                paginationContainer.appendChild(nextBtn);
            };

            showPage(1); // Hiển thị trang đầu tiên
            renderButtons();
        };

        setupPagination();
    }

}); // End DOMContentLoaded