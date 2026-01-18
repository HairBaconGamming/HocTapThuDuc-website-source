# Fix ObjectId Constructor Error

## Problem
API endpoint `/api/achievements/stats` trả về lỗi:
```
{"success":false,"message":"Class constructor ObjectId cannot be invoked without 'new'"}
```

## Root Cause
Trong `achievementController.js`, dòng 47 sử dụng:
```javascript
{ $match: { user: mongoose.Types.ObjectId(userId) } }
```

Từ Mongoose v6+, `ObjectId` là một class và cần phải sử dụng `new` keyword.

## Solution
Thay đổi từ:
```javascript
mongoose.Types.ObjectId(userId)
```

Thành:
```javascript
new mongoose.Types.ObjectId(userId)
```

## Files Modified
- `controllers/achievementController.js` - Line 47

## Testing
1. Truy cập `/api/achievements/stats`
2. Kiểm tra xem API có trả về dữ liệu đúng không
3. Không có lỗi ObjectId

## Expected Response
```json
{
  "success": true,
  "stats": {
    "total": 6,
    "unlocked": 2,
    "locked": 4,
    "completion": 33,
    "points": 25
  }
}
```

## Status
✅ Fixed
