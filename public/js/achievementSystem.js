const AchievementSystem = {
    init: function() {
        // Lắng nghe socket hoặc check định kỳ nếu cần
        // Hiện tại giả sử hệ thống gọi hàm showUnlock() khi có phản hồi từ API login/complete lesson
    },

    // Hàm gọi hiển thị thông báo
    showUnlock: function(data) {
        // [FIX LỖI DỮ LIỆU]
        // Kiểm tra xem data là object Achievement gốc hay UserAchievement (có lồng nhau)
        // Cấu trúc thường là: data.achievementId (nếu đã populate) HOẶC data (nếu trả về raw achievement)
        
        let achievement = null;
        let unlockedAt = new Date();

        if (data.achievementId && data.achievementId.name) {
            // Trường hợp trả về UserAchievement đã populate
            achievement = data.achievementId;
            unlockedAt = data.unlockedAt;
        } else if (data.name) {
            // Trường hợp trả về trực tiếp Achievement
            achievement = data;
        } else if (data.achievement) {
             // Trường hợp lồng trong field achievement
             achievement = data.achievement;
        }

        // Nếu vẫn không tìm thấy tên, dừng lại để tránh lỗi hiển thị rỗng
        if (!achievement || !achievement.name) {
            console.error("Achievement Data Invalid:", data);
            return;
        }

        // [FIX LỖI +0 ĐIỂM] & ICON
        const name = achievement.name;
        const icon = achievement.icon || '🏆'; // Icon mặc định nếu thiếu
        const points = achievement.points || achievement.xp || 10; // Fallback điểm nếu thiếu
        
        this.renderToast(name, icon, points);
        this.playSound();
    },

    renderToast: function(name, icon, points) {
        const container = document.getElementById('achievement-toast-container');
        if (!container) return;

        const toast = document.createElement('div');
        toast.className = 'ach-toast';
        toast.innerHTML = `
            <div class="ach-icon-wrapper">${icon}</div>
            <div class="ach-content">
                <div class="ach-title">Thành tích mở khóa!</div>
                <div class="ach-name">${name}</div>
                <div class="ach-points">+${points} Điểm thưởng</div>
            </div>
        `;

        container.appendChild(toast);

        // Kích hoạt animation sau 1 frame
        requestAnimationFrame(() => {
            toast.classList.add('active');
        });

        // Tự động ẩn sau 5 giây
        setTimeout(() => {
            toast.classList.remove('active');
            toast.style.opacity = '0';
            setTimeout(() => toast.remove(), 500); // Xóa khỏi DOM
        }, 5000);
    },

    playSound: function() {
        const audio = document.getElementById('ach-sound');
        if (audio) {
            audio.volume = 0.5;
            audio.play().catch(e => console.log("Audio autoplay blocked")); // Bắt lỗi nếu trình duyệt chặn
        }
    }
};

// Expose ra global để các file khác gọi được
window.AchievementSystem = AchievementSystem;