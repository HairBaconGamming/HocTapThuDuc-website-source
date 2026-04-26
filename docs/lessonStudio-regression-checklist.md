# LessonStudio Regression Checklist

Use this checklist before cutover. A build is releasable only when all items pass.

## 1) Tree and Structure

- [ ] Select subject loads courses.
- [ ] Select course loads full unit/lesson tree.
- [ ] Create quick course works and course is immediately selectable.
- [ ] Add new unit and rename unit.
- [ ] Add new lesson under unit and open it for editing.
- [ ] Drag-sort units and lessons, reload page, order is preserved.
- [ ] Delete unit confirms and removes associated lessons.
- [ ] Delete lesson confirms and removes lesson only.

## 2) Lesson Editing and Blocks

- [ ] Add each block type: text/image/video/resource/code/callout/html_preview/question.
- [ ] Reorder blocks by drag and verify final order in saved payload.
- [ ] Delete block and verify serialization consistency.
- [ ] Edit text block with markdown + KaTeX content.
- [ ] Use Math modal to insert inline and block formula.
- [ ] Verify block menu keyboard shortcut `Alt + /`.

## 3) Quiz Builder

- [ ] Create `choice` question and mark correct answer(s).
- [ ] Create `fill` question and verify bracket-answer format.
- [ ] Create `essay` with model answer.
- [ ] Create `matching` pairs.
- [ ] Create `ordering` items.
- [ ] Save and reload, confirm all quiz types deserialize correctly.

## 4) Save/Publish/Revisions

- [ ] `Ctrl/Cmd + S` saves draft.
- [ ] `Ctrl/Cmd + Shift + P` publishes lesson.
- [ ] Inspector draft/publish buttons work.
- [ ] Unit bulk draft/publish updates all lessons in unit.
- [ ] Course save/publish updates course metadata.
- [ ] Revision list opens and includes newest saves.
- [ ] Restore revision works and overwrites current content.

## 5) Import/Export

- [ ] Export JSON produces valid object `{title, description, blocks}`.
- [ ] Import legacy array format works.
- [ ] Import object format with `blocks` works.
- [ ] Imported content can be saved and re-opened without corruption.

## 6) Quality and Inspector

- [ ] Quality panel flags missing title.
- [ ] Quality panel flags empty text block.
- [ ] Quality panel flags missing URLs for media/resource blocks.
- [ ] Quality panel flags empty question block.
- [ ] Publish checklist updates after save and after edits.

## 7) AI Integration

- [ ] AI Tutor appears in lesson-studio mode.
- [ ] AI request includes studio context/snapshot metadata.
- [ ] Copy Prompt modal opens and copies content successfully.

## 8) Permissions and Safety

- [ ] Non-teacher cannot access studio save/update APIs.
- [ ] Non-owner teacher cannot modify another teacher's lesson/course.
- [ ] Destructive sync guard prevents accidental mass deletion without explicit confirmation.

## 9) Performance and Reliability

- [ ] Large course (10+ units, 100+ lessons) tree interactions remain responsive.
- [ ] Save roundtrip remains acceptable under normal network latency.
- [ ] No console errors during common authoring flow.
