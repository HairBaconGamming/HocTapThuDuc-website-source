# Task: Sync "kinh nghiệm needed" (XP to next level) across garden, profile, dashboard

## Plan Progress
✅ **Step 1**: Understand files - COMPLETED (read models, views, utils, controllers/services)

**Remaining Steps:**
✅ - [x] Step 2: routes/index.js /dashboard
✅ - [x] Step 3: Read & analyzed
✅ - [x] Step 4: Added LevelUtils import & levelInfo computation in routes/index.js
✅ - [x] Step 5: Updated views/dashboard.ejs to use levelInfo.requiredXP / levelInfo.progress with fallback
- [ ] Step 6: Test XP bars match across garden/profile/dashboard
✅ - [x] Step 7: Changes complete

## Current Status
- Garden: ✅ Correct (via gardenStateService.getLevelViewData)
- Profile: ✅ Correct (profileController.js → levelInfo)
- Dashboard: ❌ Wrong (hardcoded level*1000)

