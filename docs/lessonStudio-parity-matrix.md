# LessonStudio Feature Parity Matrix

This matrix is the source of truth for redesign parity. Every row must remain functionally equivalent in the new LessonStudio implementation.

## Workspace Shell

| Feature | Current Trigger | Current Implementation | Required Parity |
|---|---|---|---|
| Preview mode (desktop/tablet/mobile) | Toolbar buttons `data-preview-mode` | `public/js/lessonEditorV4.js` | Preserve all 3 modes and persisted selection |
| Focus mode toggle | `#studioFocusToggle`, `#studioFocusToggleSecondary` | `public/js/lessonEditorV4.js` | Keep both entry points and visual focus behavior |
| Dock collapse/expand | `data-dock-toggle`/layout actions | `public/js/lessonEditorV4.js` + `views/ManageLesson.ejs` | Keep left/right independent dock controls |
| Dock resize | `.studio-dock-resizer` pointer drag | `public/js/lessonEditorV4.js` | Keep drag resizing with persisted widths |
| Dock tabs + mini rail | `data-dock-target` and mini buttons | `public/js/lessonEditorV4.js` | Keep tab switching and collapsed-dock quick access |
| Layout persistence | localStorage key `lesson-editor-v4-layout` | `public/js/lessonEditorV4.js` | Preserve saved layout between sessions |

## Tree and Curriculum Authoring

| Feature | Current Trigger | Current Implementation | Required Parity |
|---|---|---|---|
| Select subject | `#selectSubject` | `public/js/lessonEditorV3.js` | Keep subject-driven course loading |
| Select course | `#selectCourse` | `public/js/lessonEditorV3.js` | Keep tree loading and inspector sync |
| Quick create course | `data-studio-action="prompt-create-course"` | `public/js/lessonEditorV3.js` + `routes/course.js` | Keep create flow and immediate selection |
| Add unit | `data-studio-action="add-temp-unit"` | `public/js/lessonEditorV3.js` | Keep temporary unit behavior and later ID mapping |
| Add lesson | unit action in tree | `public/js/lessonEditorV3.js` | Keep temporary lesson creation and edit selection |
| Drag/sort unit+lesson | Sortable interactions | `public/js/lessonEditorV3.js` | Preserve ordering persistence to backend |
| Delete lesson/unit | tree actions | `public/js/lessonEditorV3.js` + APIs | Preserve confirmations and DB sync |

## Lesson Content Editor

| Feature | Current Trigger | Current Implementation | Required Parity |
|---|---|---|---|
| Block insertion menu | `data-canvas-action="open-menu"` + `Alt + /` | `public/js/lessonEditorV3.js` | Keep keyboard shortcut and insert-at-position |
| Block types | menu items `data-block-type` | `lessonEditorBlockRenderers.js` + V3 | Keep: `text`, `image`, `video`, `resource`, `code`, `callout`, `html_preview`, `question` |
| Block reorder/delete/edit | per-block controls | `lessonEditorCanvasEngine.js` + V3 | Preserve all core block operations |
| Lesson title editing | `#mainTitleInput` | `public/js/lessonEditorV3.js` | Keep validation and dirty-state tracking |
| Math insertion | math modal actions | `views/ManageLesson.ejs` + V3 | Keep inline/block LaTeX insertion behavior |

## Quiz Builder

| Feature | Current Trigger | Current Implementation | Required Parity |
|---|---|---|---|
| Open quiz editor | question block action | `public/js/lessonEditorV3.js` | Keep modal editing experience |
| Quiz types | modal form type selector | `public/js/lessonEditorV3.js` | Keep `choice`, `fill`, `essay`, `matching`, `ordering` |
| Quiz settings | modal settings fields | `public/js/lessonEditorV3.js` | Preserve randomize/passingScore/showFeedback semantics |
| Backward compatibility | save payload `quizData` + `content` | `controllers/lessonController.js` | Keep both serialized forms |

## Persistence and Publish

| Feature | Current Trigger | Current API | Required Parity |
|---|---|---|---|
| Save lesson draft | quick save, inspector draft, `Ctrl/Cmd+S` | `POST /api/lesson/save` | Keep save behavior and status feedback |
| Publish lesson | inspector publish, quick publish, shortcut | `POST /api/lesson/save` (`isPublished=true`) | Keep publish pathway unchanged |
| Save/publish unit bulk | inspector unit actions | `POST /api/unit/bulk-status` | Keep unit-wide publish toggle |
| Save/publish course | course actions + metadata autosave | `POST /api/course/:id/update`, `POST /api/course/:id/update-full` | Preserve metadata and structure sync behavior |
| Revision snapshots | save events | `LessonRevision` creation in `saveLessonAjax` | Keep auto revision and cap at 50 |
| Revision list/restore | revision modal | `GET /api/lesson/:id/revisions`, `POST /api/lesson/restore/:revisionId` | Preserve restore behavior |

## Import, Export, and AI

| Feature | Current Trigger | Current Implementation | Required Parity |
|---|---|---|---|
| Export lesson JSON | `data-studio-action="export-lesson-json"` | `public/js/lessonEditorV3.js` | Keep exported object format `{title,description,blocks}` |
| Import lesson JSON | file input + action button | `public/js/lessonEditorV3.js` | Keep support for legacy array and object format |
| AI prompt modal | inline button | `views/ManageLesson.ejs` | Preserve copy prompt workflow |
| AI Tutor side panel | partial include | `views/partials/aiTutor.ejs` + `public/js/aiTutor.js` | Keep lesson-studio variant and snapshot context |

## Access and Security-sensitive Behavior

| Feature | Current Trigger | Current Implementation | Required Parity |
|---|---|---|---|
| Teacher/admin gating | route middleware | `routes/api.js`, `routes/course.js`, `routes/lesson.js` | Preserve access restrictions |
| Ownership checks | save/update calls | `controllers/lessonController.js`, `controllers/courseController.js` | Keep owner-only edits for non-admin |
| Allow save progress toggle | lesson inspector switch | stored by `saveLessonAjax`, consumed in lesson detail | Keep learner progress autosave behavior |
| HTML preview warning | quality checks | `public/js/lessonEditorV4.js` | Preserve warning signal in quality panel |

## Known Existing Risks (to be hardened in redesign)

1. Snapshot sync can hard-delete units/lessons if client snapshot is stale.
2. `lessonMapping` is returned but may be incomplete for temporary lesson IDs.
3. Mixed responsibilities between client tree logic and server-side sync logic increase regression risk.
