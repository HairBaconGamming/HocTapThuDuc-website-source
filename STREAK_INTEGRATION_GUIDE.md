# Streak Integration Guide

## Cách tích hợp Streak vào Lesson Completion

### 1. Trong Lesson Controller

Khi user hoàn thành bài học, thêm code sau:

```javascript
const { updateStreak } = require('../utils/streakHelper');

// Sau khi user hoàn thành bài học
const streakResult = await updateStreak(req.user._id);

if (streakResult.isNewDay) {
    // Có thể thêm notification hoặc reward cho streak mới
    console.log(`User ${req.user.username} has a ${streakResult.streak} day streak!`);
}
```

### 2. Trong Achievement Checker

Thêm check cho streak achievements:

```javascript
// Khi hoàn thành bài học
const { updateStreak } = require('../utils/streakHelper');
const streakResult = await updateStreak(userId);

// Check streak achievements
if (streakResult.isNewDay) {
    const newAchievements = await achievementChecker.checkAndUnlockAchievements(
        userId,
        'streak_days',
        { currentValue: streakResult.streak }
    );
}
```

### 3. Seed Streak Achievements

Thêm vào `seedLoginAchievements.js`:

```javascript
{
    id: 'streak_3',
    name: 'Học tập liên tục',
    description: 'Duy trì chuỗi học 3 ngày liên tiếp',
    icon: '🔥',
    category: 'engagement',
    points: 30,
    rarity: 'rare',
    condition: {
        type: 'streak_days',
        value: 3,
        operator: '>='
    },
    unlockMessage: 'Tuyệt vời! Bạn đã duy trì chuỗi học 3 ngày! 🔥',
    isActive: true
},
{
    id: 'streak_7',
    name: 'Chiến binh học tập',
    description: 'Duy trì chuỗi học 7 ngày liên tiếp',
    icon: '⚔️',
    category: 'engagement',
    points: 50,
    rarity: 'epic',
    condition: {
        type: 'streak_days',
        value: 7,
        operator: '>='
    },
    unlockMessage: 'Phi thường! Bạn đã duy trì chuỗi học 7 ngày! ⚔️',
    isActive: true
},
{
    id: 'streak_30',
    name: 'Huyền thoại kiên trì',
    description: 'Duy trì chuỗi học 30 ngày liên tiếp',
    icon: '👑',
    category: 'engagement',
    points: 100,
    rarity: 'legendary',
    condition: {
        type: 'streak_days',
        value: 30,
        operator: '>='
    },
    unlockMessage: 'Tuyệt vời! Bạn đã duy trì chuỗi học 30 ngày! 👑',
    isActive: true
}
```

### 4. Cron Job để Reset Streak

Tạo file `jobs/streakResetJob.js`:

```javascript
const cron = require('node-cron');
const User = require('../models/User');
const { resetStreak } = require('../utils/streakHelper');

// Chạy mỗi ngày lúc 00:00
cron.schedule('0 0 * * *', async () => {
    try {
        console.log('Running streak reset job...');
        
        const users = await User.find({ currentStreak: { $gt: 0 } });
        
        for (const user of users) {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            
            const lastStudyDate = new Date(user.lastStudyDate);
            lastStudyDate.setHours(0, 0, 0, 0);
            
            // Nếu quá 1 ngày không học, reset streak
            if (today.getTime() - lastStudyDate.getTime() > 24 * 60 * 60 * 1000) {
                await resetStreak(user._id);
                console.log(`Reset streak for user ${user.username}`);
            }
        }
        
        console.log('Streak reset job completed');
    } catch (err) {
        console.error('Error in streak reset job:', err);
    }
});

module.exports = { startStreakResetJob: () => {} };
```

### 5. Thêm vào Server.js

```javascript
// Trong server.js
require('./jobs/streakResetJob');
```

## Streak Display

Streak sẽ hiển thị trên profile:
- Số ngày liên tiếp học tập
- Icon 🔥
- Nằm trong stats-container-bottom

## Streak Logic

1. **Lần đầu tiên học**: streak = 1
2. **Cùng ngày học lại**: streak không thay đổi
3. **Hôm sau học**: streak += 1
4. **Quá 1 ngày không học**: streak = 0 (reset)

## Testing

```bash
# Test streak update
node -e "
const { updateStreak } = require('./utils/streakHelper');
const userId = 'YOUR_USER_ID';
updateStreak(userId).then(result => console.log(result));
"
```

## Notes

- Streak được tính theo ngày (UTC)
- Mỗi ngày chỉ tính 1 lần (dù học bao nhiêu bài)
- Streak reset tự động nếu không học trong 1 ngày
- Có thể thêm reward/bonus cho streak cao
