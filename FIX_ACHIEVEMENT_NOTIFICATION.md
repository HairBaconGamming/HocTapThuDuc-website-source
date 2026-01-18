# Fix Achievement Notification Undefined Issue

## Problem
Achievement notification hiển thị `undefined` thay vì tên thành tích và điểm số.

## Root Cause
Dữ liệu achievement từ API có cấu trúc:
```javascript
{
    achievement: { name: "...", points: 10, ... },
    icon: "🏆",
    ...
}
```

Nhưng code đang truy cập `achievement.achievement.name` mà không kiểm tra xem dữ liệu có tồn tại không.

## Solution Applied

### 1. Fixed `achievementSystem.js`
Thêm fallback logic để xử lý cả hai cấu trúc dữ liệu:

```javascript
const name = achievement.achievement?.name || achievement.name || 'Thành tích';
const points = achievement.achievement?.points || achievement.points || 0;
const icon = achievement.icon || '🏆';
```

### 2. Fixed `achievementNotification.ejs`
Cập nhật `showAchievementNotification()` function với cùng logic:

```javascript
const name = achievement.achievement?.name || achievement.name || 'Thành tích';
const points = achievement.achievement?.points || achievement.points || 0;
const icon = achievement.icon || '🏆';
```

### 3. Added Achievement Notification to Header
Thêm `<%- include('achievementNotification') %>` vào `header.ejs` để notification được load.

## Files Modified
1. `public/js/achievementSystem.js` - Fixed data structure handling
2. `views/partials/achievementNotification.ejs` - Fixed data structure handling
3. `views/partials/header.ejs` - Added achievement notification include

## Testing
1. Đăng nhập vào tài khoản
2. Kiểm tra xem notification có hiển thị đúng không
3. Xem tên thành tích, điểm số, icon có hiển thị không

## Expected Result
Notification sẽ hiển thị:
```
🏆 Bạn đã mở khóa thành tích!
Gia Nhập Cộng Đồng
+15 ⭐ điểm
```

Thay vì:
```
🏆 Bạn đã mở khóa thành tích!
undefined
+undefined ⭐
```

## Status
✅ Fixed
