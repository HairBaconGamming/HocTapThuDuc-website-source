## 🏆 Achievement System - Quick Reference

### 📍 Vị Trí File Quan Trọng

```
Models:
├── models/Achievement.js                    (Core schemas)
└── models/LessonCompletion.js              (Trigger hook)

Controllers:
└── controllers/achievementController.js    (API handlers)

Utils:
├── utils/achievementUtils.js               (Core logic)
└── utils/achievementChecker.js            (Wrapper)

Routes:
├── routes/achievements.js                  (API endpoints)
├── routes/index.js                         (Page routes)
└── server.js                               (Route registration)

Views:
├── views/achievements.ejs                  (Main page)
├── views/dashboard.ejs                     (Widget)
├── views/partials/header.ejs              (Nav link)
└── views/partials/achievementNotification.ejs

Scripts:
├── public/js/achievementSystem.js         (Notifications)
└── public/js/dashboard.js                 (Widget loading)

Seed & Test:
├── seeds/seedAchievements.js              (18 achievements)
└── test/achievementSystem.test.js         (9 tests)

Docs:
├── ACHIEVEMENTS_DOCS.md                   (Full docs)
└── ACHIEVEMENT_IMPLEMENTATION_SUMMARY.md  (This summary)
```

---

### 🔗 API Endpoints

```
GET  /api/achievements/my-achievements      → Fetch user achievements
GET  /api/achievements/stats               → Get user stats
GET  /api/achievements/all                 → List all achievements
GET  /api/achievements/progress            → Get progress for locked
POST /api/achievements/check               → Manual trigger check

GET  /achievements                         → Main achievements page
```

---

### 🎯 Achievement Types

```javascript
// Learning: Hoàn thành N bài học
type: 'lessons_completed'

// Engagement: Kiếm N điểm
type: 'points_reached'

// Challenge: Duy trì N ngày streak
type: 'streak_days'

// Enrollment: Đăng ký N khóa học
type: 'courses_enrolled'

// Custom: Sự kiện tùy chỉnh
type: 'custom'
```

---

### 📊 Achievement Object Structure

```javascript
{
    id: 'unique_id',
    name: '🎓 Tên Thành Tích',
    description: 'Mô tả...',
    icon: '🎓',  // Emoji
    color: '#3b82f6',  // Hex color
    category: 'learning' | 'engagement' | 'challenge' | 'social',
    points: 25,  // Reward points
    rarity: 'common' | 'rare' | 'epic' | 'legendary',
    condition: {
        type: 'lessons_completed',
        value: 10,  // Goal
        operator: '>='  // >=, >, ==, <=, <
    },
    unlockMessage: 'Chúc mừng!',
    isHidden: false,
    isActive: true
}
```

---

### 🔧 Key Functions

```javascript
// Check & unlock
achievementChecker.checkAndUnlockAchievements(userId, triggerType, data)
→ Returns: [{ name, icon, points, ... }]

// Triggers
achievementChecker.onLessonCompleted(userId)
achievementChecker.onPointsGained(userId)
achievementChecker.onDailyCheck(userId)

// Data retrieval
achievementChecker.getUserAchievements(userId)
achievementChecker.getAchievementStats(userId)
achievementChecker.getAchievementProgress(userId)

// Evaluation
achievementChecker.evaluateCondition(condition, data)
→ Returns: boolean
```

---

### 💾 Database Queries

```javascript
// Lấy tất cả achievements của user
UserAchievement.find({ user: userId }).populate('achievementId')

// Lấy single achievement
AchievementType.findById(achievementId)

// Kiểm tra đã unlock?
UserAchievement.findOne({ user: userId, achievementId })

// Thống kê
AchievementType.countDocuments({ isActive: true })
UserAchievement.countDocuments({ user: userId })
```

---

### 🎨 Frontend Integration

```javascript
// Show notification
showAchievementNotification({
    icon: '🎓',
    name: 'Achievement Name',
    points: 25
})

// Load achievements
fetch('/api/achievements/my-achievements')
fetch('/api/achievements/stats')
fetch('/api/achievements/all')
```

---

### 🚀 Deployment Checklist

- [ ] MongoDB database ready
- [ ] Run `node seeds/seedAchievements.js`
- [ ] Test API endpoints
- [ ] Verify routes loaded
- [ ] Check toast notifications
- [ ] Test on mobile
- [ ] Verify LessonCompletion triggers
- [ ] Monitor server logs

---

### 🐛 Common Issues & Fixes

| Issue | Solution |
|-------|----------|
| No achievements showing | Run seed script: `node seeds/seedAchievements.js` |
| Toast not appearing | Check `/public/js/achievementSystem.js` loaded, check console |
| Can't unlock achievement | Verify condition.value vs user's actual value |
| Duplicate unlock | Check unique index exists on UserAchievement |
| 404 on /achievements | Verify routes/index.js has GET /achievements |
| API 500 error | Check MongoDB connection, models imported |

---

### 📱 URLs to Test

```
/achievements              → Main achievements page
/api/achievements/my-achievements     → API
/api/achievements/stats              → API
/dashboard                 → Widget test
/profile                   → User profile
```

---

### 🎮 User Flow

```
1. User completes lesson
   ↓
2. LessonCompletion post-save hook triggers
   ↓
3. achievementChecker.onLessonCompleted() called
   ↓
4. Condition evaluated
   ↓
5. IF condition met:
   a. UserAchievement created
   b. Points added to user
   c. Toast notification sent (client-side)
   ↓
6. User sees notification
   ↓
7. User can view achievements page
```

---

### 💡 Code Snippets

#### Add to LessonCompletion trigger:
```javascript
const { achievementChecker } = require('../utils/achievementUtils');
const newAch = await achievementChecker.onLessonCompleted(userId);
if (newAch.length > 0) {
    io.to(userId).emit('achievements_unlocked', newAch);
}
```

#### Create new achievement (admin):
```javascript
const achievement = await AchievementType.create({
    id: 'my_achievement',
    name: '🏆 Achievement Name',
    // ... other fields
    condition: { type: 'lessons_completed', value: 50, operator: '>=' }
});
```

#### Manual check trigger:
```javascript
await achievementChecker.checkAndUnlockAchievements(
    userId,
    'lessons_completed',
    { currentValue: userLessonCount }
);
```

---

### 📈 Monitoring

```javascript
// Check if system is working
const stats = await achievementChecker.getAchievementStats(userId);
console.log(`User: ${stats.unlocked}/${stats.total} achievements`);

// Monitor unlock events
UserAchievement.countDocuments()
  .then(count => console.log(`Total unlocks: ${count}`))
```

---

### 🔐 Permissions

- **Any user**: View own achievements, view achievements page
- **Admin**: Create/edit achievements (future)
- **System**: Trigger achievement checks automatically

---

### 🎯 Success Metrics

- ✅ 18 achievements seeded
- ✅ All API endpoints working
- ✅ Toast notifications functional
- ✅ Dashboard widget loading
- ✅ Achievements page rendering
- ✅ No duplicate unlocks
- ✅ Points allocated correctly
- ✅ UI responsive on mobile

---

**Quick Command Reference**
```bash
# Seed achievements
node seeds/seedAchievements.js

# Run tests
node test/achievementSystem.test.js

# Check MongoDB
mongosh
db.achievementtypes.find().count()
db.userachievements.find().count()
```

---

**Version**: 1.0 | **Status**: ✅ Ready to Use
