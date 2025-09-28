# TODO: Upgrade Learning Methods and UX in lessonDetail

## Learning Methods Upgrades
- [x] Implement Spaced Repetition System (SRS) in quiz study mode: Add review intervals based on performance (easy: +4x, hard: next session), track due dates, filter due questions.
  - [x] Update interval logic in study mode JS: easy (+4x interval), hard (1 day), prioritize due questions by nextReview.
  - [x] Add filtering to show due questions first in study mode.
- [ ] Add inline quizzes to markdown content: Parse quiz blocks, render mini-quiz components with feedback.
  - [ ] Parse markdown for ```quiz ... ``` blocks in EJS/JS.
  - [ ] Render mini-quiz components with feedback in lesson content.
- [ ] Enhance essay with revision prompts: Post-grading, add "Rewrite" button to highlight low-score sections and provide targeted prompts.
  - [ ] Add "Rewrite" button post-grading in essay result UI.
  - [ ] Highlight low-score sections and generate targeted prompts in JS.

## UX Upgrades
- [x] Add loading states: Spinners for quiz submission and essay grading.
- [ ] Enhance animations: Confetti on correct quiz answers, shake on wrong, smooth mode transitions.
  - [ ] Add confetti on correct answers in review/study modes.
  - [ ] Add shake animation on wrong answers.
  - [ ] Smooth transitions for mode switches.
- [ ] Improve accessibility: ARIA labels for quiz options, keyboard navigation for modes.
  - [ ] Add ARIA labels to quiz options and buttons.
  - [ ] Implement keyboard navigation for modes and options.
- [ ] Mobile responsiveness: Update CSS for better mobile layout (e.g., quiz options, progress bars).
  - [ ] Tweak CSS for mobile quiz layouts, progress bars.
- [ ] Better user feedback: Tooltips on buttons, progress animations, error messages.
  - [ ] Add tooltips to buttons.
  - [ ] Enhance progress animations.
  - [ ] Improve error message displays.

## Files to Edit
- [ ] views/lessonDetail.ejs: Core changes for SRS, inline quizzes, revision prompts, UX enhancements.
- [ ] public/js/lessonDetail.js: Cleanup redundancy, integrate pagination if needed.
- [ ] public/styleLessonDetail.css: Styles for new elements (SRS badges, inline quizzes, mobile tweaks).

## Testing
- [x] Manual test: Simulate SRS in quiz study mode, check localStorage.
- [x] Browser test: Launch lesson page, verify animations and responsiveness.
