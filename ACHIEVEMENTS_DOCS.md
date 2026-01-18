# 🏆 Hệ Thống Thành Tích (Achievement System) - Tài Liệu Hoàn Chỉnh

## 📋 Tổng Quan

Hệ thống Thành Tích là một hệ thống gamification chuyên nghiệp cho nền tảng học tập. Người dùng có thể mở khóa các thành tích khác nhau dựa trên hoạt động học tập, kiếm điểm, duy trì streak, v.v.

## 🎯 Các Tính Năng Chính

### 1. **Hệ Thống Hai Model (Professional Architecture)**
- **AchievementType**: Template/định nghĩa thành tích (admin tạo)
- **UserAchievement**: Tiến độ của user (hệ thống tự động tạo)

### 2. **Phân Loại Thành Tích**
- 📚 **Learning**: Học tập (hoàn thành N bài học)
- ⚡ **Engagement**: Tương tác (kiếm N điểm)
- 🎯 **Challenge**: Thử thách (duy trì streak N ngày)
- 👥 **Social**: Xã hội (chia sẻ, cộng tác)
- 🎉 **Milestone**: Cột mốc (các sự kiện đặc biệt)

### 3. **Độ Hiếm (Rarity System)**
- 🟢 **Common**: Thường - 10-50 điểm
- 🔵 **Rare**: Hiếm - 50-100 điểm
- 🟣 **Epic**: Tuyệt vời - 100-200 điểm
- 🟡 **Legendary**: Huyền thoại - 200-500+ điểm

### 4. **Hệ Thống Điều Kiện Linh Hoạt**
```javascript
condition: {
    type: 'lessons_completed' | 'points_reached' | 'streak_days' | 'courses_enrolled' | 'custom',
    value: 10,  // Mục tiêu
    operator: '>=' | '>' | '==' | '<=' | '<'
}
```

## 📁 Cấu Trúc File

```
├── models/
│   └── Achievement.js           # 2 Mongoose schemas (AchievementType + UserAchievement)
│
├── controllers/
│   └── achievementController.js # Xử lý request achievements
│
├── routes/
│   └── achievements.js          # API routes (GET/POST)
│
├── utils/
│   ├── achievementUtils.js      # Core logic (checkAndUnlock, triggers)
│   └── achievementChecker.js    # Deprecated wrapper
│
├── views/
│   ├── achievements.ejs         # Trang thành tích chính
│   ├── dashboard.ejs            # Widget thành tích trên dashboard
│   └── partials/
│       ├── header.ejs           # Link tới achievements page
│       └── achievementNotification.ejs
│
├── public/
│   └── js/
│       └── achievementSystem.js # Client-side notification manager
│
└── seeds/
    └── seedAchievements.js      # Seed data (18 achievements)
```

## 🚀 Cách Sử Dụng

### 1. **Seed Achievements Vào Database**
```bash
# Đảm bảo MongoDB chạy
node seeds/seedAchievements.js
```

Output:
```
🔄 Kết nối MongoDB...
🗑️  Xóa achievements cũ...
📥 Thêm achievements mới...
✅ Đã thêm 18 achievements!

📊 Achievements Summary:
  Learning: 5
  Engagement: 3
  Challenge: 3
  Social: 1
```

### 2. **API Endpoints**

#### Lấy thành tích của user
```
GET /api/achievements/my-achievements
Response: { success: true, achievements: [...] }
```

#### Lấy stats
```
GET /api/achievements/stats
Response: { 
  success: true, 
  stats: { total, unlocked, locked, completion, points }
}
```

#### Lấy tất cả achievements (có filter)
```
GET /api/achievements/all?category=learning&rarity=epic
Response: { success: true, achievements: [...] }
```

#### Lấy progress cho achievements chưa unlock
```
GET /api/achievements/progress
Response: { success: true, progress: {...} }
```

### 3. **Trigger Achievements**

#### Khi hoàn thành bài học
```javascript
// Tự động trigger via LessonCompletion post-save hook
const completion = await LessonCompletion.create({ user, lesson });
// → System tự động gọi achievementChecker.onLessonCompleted(user._id)
```

#### Khi kiếm điểm
```javascript
// Tự động trigger khi User.totalPoints thay đổi
await achievementChecker.onPointsGained(userId);
```

#### Kiểm tra hàng ngày (streak)
```javascript
// Chạy trong cron job (cần setup scheduler)
await achievementChecker.onDailyCheck(userId);
```

## 🎮 UI/UX

### 1. **Trang Achievements (`/achievements`)**
- ✨ Hero section với stats
- 🔍 Filter by category + rarity
- 📊 Grid view của tất cả achievements
- 📈 Progress bar cho achievements chưa unlock
- ✅ Unlock date cho achievements đã unlock

### 2. **Dashboard Widget**
- 🏆 Hiển thị 4 achievements gần nhất
- Liên kết tới trang achievements
- Load via AJAX

### 3. **Toast Notification**
- 🎉 Hiện lên khi unlock achievement
- Auto-dismiss sau 5 giây
- Animation mượt mà (slideInUp)
- Client-side check mỗi 10 giây

## 📊 Database Schema

### AchievementType
```javascript
{
    id: String (unique),
    name: String,
    description: String,
    icon: String (emoji),
    color: String (hex),
    category: 'learning' | 'engagement' | 'challenge' | 'social' | 'milestone',
    points: Number,
    rarity: 'common' | 'rare' | 'epic' | 'legendary',
    condition: {
        type: String (required),
        value: Number (required),
        operator: String (default: '>=')
    },
    unlockMessage: String,
    isHidden: Boolean (default: false),
    isActive: Boolean (default: true),
    createdAt: Date
}
```

### UserAchievement
```javascript
{
    user: ObjectId (ref: User),
    achievementId: ObjectId (ref: AchievementType),
    achievementData: {
        name, description, icon, points, rarity, category
    },
    unlockedAt: Date,
    notified: Boolean (default: false),
    createdAt: Date,
    
    // Index: unique (user, achievementId)
}
```

## 🔧 Extension/Tùy Chỉnh

### Thêm Achievement Mới
```javascript
// Trong seedAchievements.js hoặc admin endpoint
const achievement = await AchievementType.create({
    id: 'unique_id',
    name: '🎓 Tên Thành Tích',
    description: 'Mô tả',
    icon: '🎓',
    color: '#3b82f6',
    category: 'learning',
    points: 25,
    rarity: 'rare',
    condition: {
        type: 'lessons_completed',
        value: 10,
        operator: '>='
    },
    unlockMessage: 'Chúc mừng! Bạn đã...'
});
```

### Thêm Custom Trigger
```javascript
// Trong achievementUtils.js
async function onCustomEvent(userId, data) {
    return await checkAndUnlockAchievements(userId, 'custom', data);
}

// Sử dụng:
await achievementChecker.onCustomEvent(userId, { eventType: 'share_lesson' });
```

### Integration với Existing Code
```javascript
// Trong controller/route khi user event xảy ra:
const { achievementChecker } = require('../utils/achievementUtils');

// Sau khi hoàn thành lesson
const newAchievements = await achievementChecker.onLessonCompleted(user._id);
if (newAchievements.length > 0) {
    // Gửi socket notification
    io.to(user._id.toString()).emit('achievement_unlocked', newAchievements);
}
```

## ⚙️ Configuration

### Environment Variables
```
MONGO_URI=mongodb://localhost:27017/studypro
NODE_ENV=development
```

### Cron Jobs (Để Setup)
```javascript
// scheduler.js (thêm)
const schedule = require('node-schedule');
const { achievementChecker } = require('./utils/achievementUtils');

// Hàng ngày lúc 12 sáng
schedule.scheduleJob('0 0 * * *', async () => {
    const users = await User.find({});
    for (const user of users) {
        await achievementChecker.onDailyCheck(user._id);
    }
    console.log('✅ Daily achievement check completed');
});
```

## 🐛 Troubleshooting

### Achievement không unlock
```
✅ Kiểm tra condition.type trong database
✅ Verify condition.value vs user's actual value
✅ Kiểm tra isActive: true trên AchievementType
✅ Xóa UserAchievement cũ để re-trigger
```

### Toast notification không hiện
```
✅ Kiểm tra /public/js/achievementSystem.js đã load
✅ Check browser console cho errors
✅ Verify /api/achievements/my-achievements endpoint
```

### Database connection error
```
✅ Đảm bảo MongoDB service chạy: mongod
✅ Kiểm tra MONGO_URI trong .env
✅ Verify network connection
```

## 📈 Future Enhancements

- [ ] Admin dashboard để manage achievements
- [ ] Achievement unlock percentage stats
- [ ] Social sharing của achievements
- [ ] Achievement badges cho profile
- [ ] Time-limited achievements (seasonal)
- [ ] Team achievements (group unlocks)
- [ ] Real-time achievement leaderboard
- [ ] Achievement categories/collections

## 📝 Notes

- Điểm từ achievements được cộng vào `user.totalPoints`
- Mỗi user chỉ có thể unlock mỗi achievement một lần (unique constraint)
- Achievement progress được tính real-time từ user data
- Toast notifications check mỗi 10 giây
- Tất cả operations là non-blocking (fire-and-forget)

## 🎯 Best Practices

1. **Cân bằng độ khó**: Common → Rare → Epic → Legendary
2. **Feedback rõ ràng**: Unlock message phải motivating
3. **Non-blocking**: Achievements không chặn main operations
4. **Scalability**: Dùng indexes để query nhanh
5. **User Experience**: Toast + progress bars + clear messages

---

**Version**: 1.0  
**Last Updated**: 2024  
**Status**: Production Ready ✅
