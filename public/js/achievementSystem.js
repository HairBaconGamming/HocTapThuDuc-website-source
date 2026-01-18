<!-- public/js/achievementSystem.js -->

// Achievement Notification Manager
class AchievementNotificationManager {
    constructor() {
        this.lastCheckTime = localStorage.getItem('lastAchievementCheck') || new Date().getTime();
    }

    async checkForNewAchievements() {
        try {
            const response = await fetch('/api/achievements/my-achievements');
            if (!response.ok) return;

            const data = await response.json();
            if (!data.success || !data.achievements) return;

            // Check for achievements newer than last check
            const now = new Date().getTime();
            const newAchievements = data.achievements.filter(a => {
                const unlockedTime = new Date(a.unlockedAt).getTime();
                return unlockedTime > this.lastCheckTime;
            });

            // Show notifications for each new achievement
            newAchievements.forEach(achievement => {
                this.showNotification(achievement);
            });

            this.lastCheckTime = now;
            localStorage.setItem('lastAchievementCheck', now);
        } catch (err) {
            console.error('Error checking achievements:', err);
        }
    }

    showNotification(achievement) {
        const notification = this.createNotificationElement(achievement);
        document.body.appendChild(notification);

        // Auto remove after 5 seconds
        setTimeout(() => {
            notification.classList.add('hide');
            setTimeout(() => notification.remove(), 400);
        }, 5000);
    }

    createNotificationElement(achievement) {
        const div = document.createElement('div');
        div.className = 'achievement-notification';
        
        // Handle both data structures
        const name = achievement.achievement?.name || achievement.name || 'Thành tích';
        const points = achievement.achievement?.points || achievement.points || 0;
        const icon = achievement.icon || '🏆';
        
        div.innerHTML = `
            <div class="achievement-notify-content">
                <div class="achievement-notify-icon">${icon}</div>
                <div class="achievement-notify-text">
                    <div class="achievement-notify-title">🏆 Bạn đã mở khóa thành tích!</div>
                    <div class="achievement-notify-name">${name}</div>
                    <div class="achievement-notify-points">+${points} ⭐</div>
                </div>
                <button class="achievement-notify-close" onclick="this.parentElement.parentElement.remove()">×</button>
            </div>
        `;
        return div;
    }
}

// Styles
const achievementStyles = `
<style>
.achievement-notification {
    position: fixed;
    bottom: 20px;
    right: 20px;
    background: linear-gradient(135deg, #4f46e5 0%, #0ea5e9 100%);
    color: white;
    border-radius: 12px;
    padding: 0;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
    z-index: 10000;
    animation: slideInUp 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
    max-width: 350px;
    margin: 10px;
}

.achievement-notify-content {
    display: flex;
    gap: 12px;
    padding: 16px 20px;
    align-items: flex-start;
}

.achievement-notify-icon {
    font-size: 2.5rem;
    min-width: 50px;
    text-align: center;
    animation: bounce 0.6s ease;
}

.achievement-notify-text {
    flex: 1;
    min-width: 0;
}

.achievement-notify-title {
    font-size: 0.85rem;
    opacity: 0.9;
    font-weight: 500;
    margin-bottom: 4px;
}

.achievement-notify-name {
    font-size: 1.05rem;
    font-weight: bold;
    margin-bottom: 6px;
    word-wrap: break-word;
}

.achievement-notify-points {
    font-size: 0.9rem;
    opacity: 0.95;
    font-weight: 500;
}

.achievement-notify-close {
    background: none;
    border: none;
    color: white;
    font-size: 1.5rem;
    cursor: pointer;
    opacity: 0.8;
    transition: opacity 0.2s;
    padding: 0;
    margin: -8px;
}

.achievement-notify-close:hover {
    opacity: 1;
}

.achievement-notification.hide {
    animation: slideOutDown 0.4s ease forwards;
}

@keyframes slideInUp {
    from {
        transform: translateY(400px) scale(0.9);
        opacity: 0;
    }
    to {
        transform: translateY(0) scale(1);
        opacity: 1;
    }
}

@keyframes slideOutDown {
    from {
        transform: translateY(0) scale(1);
        opacity: 1;
    }
    to {
        transform: translateY(400px) scale(0.9);
        opacity: 0;
    }
}

@keyframes bounce {
    0%, 100% { transform: scale(1); }
    50% { transform: scale(1.1); }
}

@media (max-width: 480px) {
    .achievement-notification {
        bottom: 10px;
        right: 10px;
        left: 10px;
        max-width: none;
    }
}
</style>
`;

// Initialize and inject styles
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        document.head.insertAdjacentHTML('beforeend', achievementStyles);
        const manager = new AchievementNotificationManager();
        // Check every 10 seconds
        setInterval(() => manager.checkForNewAchievements(), 10000);
    });
} else {
    document.head.insertAdjacentHTML('beforeend', achievementStyles);
    const manager = new AchievementNotificationManager();
    setInterval(() => manager.checkForNewAchievements(), 10000);
}
