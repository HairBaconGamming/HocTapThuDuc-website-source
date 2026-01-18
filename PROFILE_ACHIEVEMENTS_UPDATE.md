# Profile View & Achievement System Updates

## Tính năng mới được thêm vào

### 1. Profile View Enhancements

#### Thêm hiển thị thành tích (Achievements)
- Hiển thị 6 thành tích gần nhất của user
- Hiển thị tổng số thành tích đã unlock
- Mỗi thành tích có icon, tên, và tooltip
- Có animation khi hover

#### Thêm hiển thị chuỗi học (Streak)
- Hiển thị số ngày liên tiếp học tập
- Có icon 🔥 để biểu thị streak
- Nằm trong stats-container-bottom

#### Thêm hiển thị xếp hạng (Rank)
- Hiển thị vị trí của user trên leaderboard
- Tính toán dựa trên totalPoints
- Có icon 🥇 để biểu thị rank

#### Thêm hiển thị tổng điểm (Total Points)
- Hiển thị tổng điểm từ achievements
- Có icon ⭐ để biểu thị điểm
- Nằm trong stats-container-bottom

### 2. Realm Card Design Variations

Mỗi cảnh giới (realm) có thiết kế màu sắc khác nhau:

- **Phàm Nhân (1-10)**: Vàng cam (Yellow-Orange)
- **Tiên Đạo (11-20)**: Xanh dương (Blue)
- **Thần Đạo (21-30)**: Tím (Purple)
- **Thánh Đạo (31-40)**: Hồng (Pink)
- **Đạo Cảnh (41-50)**: Xanh lá (Green)
- **Hỗn Độn (51-60)**: Xanh cyan (Cyan)
- **Hư Không (61-70)**: Đỏ (Red)
- **Khởi Nguyên (71-80)**: Chỉ (Indigo)
- **Chí Cao (81-90)**: Vàng (Amber)
- **Vượt Ngưỡng (91-100)**: Xanh ngọc (Teal)

Mỗi realm card có:
- Gradient background riêng
- Border color phù hợp
- Text color tương ứng
- Pulsing glow animation

### 3. Animations & Effects

#### Achievement Items
- Slide in animation khi load
- Bounce animation trên icon
- Scale up + glow effect khi hover
- Stagger effect (mỗi item delay 50ms)

#### Stats Counter
- Number counter animation (0 → final value)
- Duration: 1 second
- Easing: smooth

#### Realm Card
- Pulsing glow animation (3s loop)
- Glow color thay đổi theo realm
- Hover effect: translateY(-3px)

#### XP Bar
- Smooth fill animation (1.5s)
- Cubic-bezier easing
- Glow effect trên bar

### 4. Achievement System on Login

#### Automatic Achievement Check
Khi user đăng nhập, hệ thống sẽ tự động check:
- **first_login**: Đăng nhập lần đầu tiên
- **community_join**: Gia nhập cộng đồng
- Các achievements khác liên quan đến login

#### Achievement Types
```javascript
{
    id: 'first_login',
    name: 'Chào mừng đến cộng đồng',
    description: 'Đăng nhập lần đầu tiên vào hệ thống',
    icon: '👋',
    category: 'social',
    points: 10,
    rarity: 'common'
}
```

#### Trigger Points
- **Login**: Khi user đăng nhập
- **Lesson Completed**: Khi hoàn thành bài học
- **Points Reached**: Khi đạt mốc điểm
- **Streak Days**: Khi đạt chuỗi học

## Cách sử dụng

### 1. Seed Login Achievements
```bash
node seeds/seedLoginAchievements.js
```

Điều này sẽ tạo các achievements:
- first_login
- community_join
- first_lesson
- lesson_10
- lesson_50
- lesson_100

### 2. Xem Profile
Truy cập `/profile` để xem profile của user hiện tại.

Profile sẽ hiển thị:
- Avatar, username, level
- Cảnh giới hiện tại với XP bar
- Stats: Vàng, Điểm, Bài học
- Thành tích (6 gần nhất)
- Xếp hạng, Chuỗi học, Tổng điểm
- Hoạt động gần đây

### 3. Achievement Unlock
Achievements sẽ tự động unlock khi:
- User đăng nhập (first_login, community_join)
- User hoàn thành bài học (first_lesson, lesson_10, etc)
- User đạt mốc điểm

## File được thêm/sửa

### Thêm mới:
- `seeds/seedLoginAchievements.js` - Seed achievements
- `public/js/profileAnimations.js` - Animations cho profile

### Sửa đổi:
- `controllers/profileController.js` - Thêm logic lấy achievements, rank, streak
- `views/profile.ejs` - Thêm UI cho achievements, rank, streak
- `public/css/styleProfile.css` - Thêm CSS cho achievements, realm variations, animations
- `routes/auth.js` - Thêm achievement check khi login
- `utils/achievementUtils.js` - Thêm support cho custom trigger types

## Styling Details

### Achievement Card
- Background: Gradient purple-pink
- Border: 2px solid #e879f9
- Grid: 6 columns
- Gap: 12px

### Stats Bottom
- Background: Gradient theo loại (rank, streak, points)
- Border: 2px solid
- Animation: slideInUp 0.6s

### Realm Card
- Dynamic background theo realm index
- Pulsing glow animation
- Smooth transitions

## Browser Compatibility
- Chrome/Edge: ✓ Full support
- Firefox: ✓ Full support
- Safari: ✓ Full support
- Mobile: ✓ Responsive design

## Performance Notes
- Animations sử dụng CSS transforms (GPU accelerated)
- Number counter sử dụng requestAnimationFrame
- Stagger effect sử dụng setTimeout (50ms intervals)
- Tổng animation time: ~2 seconds

## Future Enhancements
- [ ] Achievement detail modal
- [ ] Achievement progress bar
- [ ] Achievement notifications
- [ ] Achievement sharing
- [ ] Achievement categories filter
- [ ] Leaderboard integration
