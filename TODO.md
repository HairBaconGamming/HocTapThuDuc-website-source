# TODO: Upgrade Learning Methods and UX in lessonDetail

## Learning Methods Upgrades
- [ ] Implement Spaced Repetition System (SRS) in quiz study mode: Add review intervals based on performance (easy: +4x, hard: next session), track due dates, filter due questions.
- [ ] Add inline quizzes to markdown content: Parse quiz blocks, render mini-quiz components with feedback.
- [ ] Enhance essay with revision prompts: Post-grading, add "Rewrite" button to highlight low-score sections and provide targeted prompts.

## UX Upgrades
- [ ] Add loading states: Spinners for quiz submission and essay grading.
- [ ] Enhance animations: Confetti on correct quiz answers, shake on wrong, smooth mode transitions.
- [ ] Improve accessibility: ARIA labels for quiz options, keyboard navigation for modes.
- [ ] Mobile responsiveness: Update CSS for better mobile layout (e.g., quiz options, progress bars).
- [ ] Better user feedback: Tooltips on buttons, progress animations, error messages.

## Files to Edit
- [ ] views/lessonDetail.ejs: Core changes for SRS, inline quizzes, revision prompts, UX enhancements.
- [ ] public/js/lessonDetail.js: Cleanup redundancy, integrate pagination if needed.
- [ ] public/styleLessonDetail.css: Styles for new elements (SRS badges, inline quizzes, mobile tweaks).

## Testing
- [ ] Manual test: Simulate SRS in quiz study mode, check localStorage.
- [ ] Browser test: Launch lesson page, verify animations and responsiveness.
- [ ] Accessibility check: Use screen reader, keyboard nav.
