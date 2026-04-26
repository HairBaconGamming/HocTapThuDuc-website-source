# LessonStudio Cutover Runbook

## Current Cutover Status

- Studio entry now uses modular app scripts in `views/ManageLesson.ejs`:
  - `/js/studio/studioStore.js`
  - `/js/studio/studioLayoutModule.js`
  - `/js/studio/studioInsightModule.js`
  - `/js/studio/lessonStudioApp.js`
- Legacy V3 authoring engine remains active for full feature parity.
- Backend sync guard is active (`allowDestructiveSync`) in lesson/course full sync endpoints.

## Rollback Procedure

1. Revert `views/ManageLesson.ejs` script includes:
   - remove `/js/studio/*`
   - restore `/js/lessonEditorV4.js`
2. Keep backend controllers as-is, or temporarily disable guard by forcing `allowDestructiveSync: true` at client.
3. Re-run syntax checks: `node scripts/run-syntax-checks.js`.

## Post-Cutover Monitoring

- Watch save/publish error rate for:
  - `POST /api/lesson/save`
  - `POST /api/course/:id/update-full`
- Track support reports for:
  - missing tree updates
  - incorrect lesson mapping after first save
  - broken dock/layout interactions
