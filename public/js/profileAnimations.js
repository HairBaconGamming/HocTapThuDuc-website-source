// public/js/profileAnimations.js
// Animations và effects cho profile page

document.addEventListener('DOMContentLoaded', () => {
    // 1. Animate XP bar on load
    animateXPBar();
    
    // 2. Animate achievement items with stagger
    animateAchievements();
    
    // 3. Animate stats with counter
    animateStats();
    
    // 4. Add realm-specific glow effect
    addRealmGlow();
});

// Animate XP bar
function animateXPBar() {
    const xpFill = document.querySelector('.xp-fill');
    if (xpFill) {
        const width = xpFill.style.width;
        xpFill.style.width = '0%';
        setTimeout(() => {
            xpFill.style.transition = 'width 1.5s cubic-bezier(0.4, 0, 0.2, 1)';
            xpFill.style.width = width;
        }, 100);
    }
}

// Animate achievements with stagger effect
function animateAchievements() {
    const achievements = document.querySelectorAll('.achievement-item');
    achievements.forEach((item, index) => {
        item.style.opacity = '0';
        item.style.transform = 'translateY(20px)';
        setTimeout(() => {
            item.style.transition = 'all 0.5s ease-out';
            item.style.opacity = '1';
            item.style.transform = 'translateY(0)';
        }, index * 50);
    });
}

// Animate stats with number counter
function animateStats() {
    const statNums = document.querySelectorAll('.stat-num');
    statNums.forEach(stat => {
        const finalValue = stat.textContent;
        const numMatch = finalValue.match(/\d+/);
        if (numMatch) {
            const finalNum = parseInt(numMatch[0]);
            const startNum = 0;
            const duration = 1000;
            const startTime = Date.now();
            
            const animate = () => {
                const elapsed = Date.now() - startTime;
                const progress = Math.min(elapsed / duration, 1);
                const current = Math.floor(startNum + (finalNum - startNum) * progress);
                
                // Preserve the original format (with # for rank, etc)
                const prefix = finalValue.substring(0, finalValue.indexOf(numMatch[0]));
                const suffix = finalValue.substring(finalValue.indexOf(numMatch[0]) + numMatch[0].length);
                
                stat.textContent = prefix + current.toLocaleString() + suffix;
                
                if (progress < 1) {
                    requestAnimationFrame(animate);
                }
            };
            
            animate();
        }
    });
}

// Add realm-specific glow effect
function addRealmGlow() {
    const realmCard = document.querySelector('.realm-card');
    if (realmCard) {
        const realmIndex = realmCard.getAttribute('data-realm');
        
        // Define glow colors for each realm
        const glowColors = {
            0: 'rgba(252, 211, 77, 0.5)',    // Phàm Nhân - Yellow
            1: 'rgba(96, 165, 250, 0.5)',    // Tiên Đạo - Blue
            2: 'rgba(216, 180, 254, 0.5)',   // Thần Đạo - Purple
            3: 'rgba(244, 114, 182, 0.5)',   // Thánh Đạo - Pink
            4: 'rgba(134, 239, 172, 0.5)',   // Đạo Cảnh - Green
            5: 'rgba(56, 189, 248, 0.5)',    // Hỗn Độn - Cyan
            6: 'rgba(252, 165, 165, 0.5)',   // Hư Không - Red
            7: 'rgba(196, 181, 253, 0.5)',   // Khởi Nguyên - Indigo
            8: 'rgba(250, 204, 21, 0.5)',    // Chí Cao - Amber
            9: 'rgba(45, 212, 191, 0.5)'     // Vượt Ngưỡng - Teal
        };
        
        const glowColor = glowColors[realmIndex] || glowColors[0];
        
        // Add pulsing glow animation
        const style = document.createElement('style');
        style.textContent = `
            @keyframes realmGlow {
                0%, 100% {
                    box-shadow: 0 0 20px ${glowColor}, 0 10px 30px -10px rgba(0,0,0,0.05);
                }
                50% {
                    box-shadow: 0 0 40px ${glowColor}, 0 10px 30px -10px rgba(0,0,0,0.1);
                }
            }
            .realm-card {
                animation: realmGlow 3s ease-in-out infinite;
            }
        `;
        document.head.appendChild(style);
    }
}

// Add hover effects to achievement items
document.addEventListener('DOMContentLoaded', () => {
    const achievementItems = document.querySelectorAll('.achievement-item');
    achievementItems.forEach(item => {
        item.addEventListener('mouseenter', function() {
            this.style.transform = 'translateY(-8px) scale(1.05) rotate(2deg)';
        });
        item.addEventListener('mouseleave', function() {
            this.style.transform = 'translateY(0) scale(1) rotate(0deg)';
        });
    });
});

// Add ripple effect on click
function addRippleEffect(event) {
    const button = event.currentTarget;
    const ripple = document.createElement('span');
    const rect = button.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height);
    const x = event.clientX - rect.left - size / 2;
    const y = event.clientY - rect.top - size / 2;
    
    ripple.style.width = ripple.style.height = size + 'px';
    ripple.style.left = x + 'px';
    ripple.style.top = y + 'px';
    ripple.classList.add('ripple');
    
    button.appendChild(ripple);
    
    setTimeout(() => ripple.remove(), 600);
}

// Add ripple CSS
const rippleStyle = document.createElement('style');
rippleStyle.textContent = `
    .ripple {
        position: absolute;
        border-radius: 50%;
        background: rgba(255, 255, 255, 0.6);
        transform: scale(0);
        animation: ripple-animation 0.6s ease-out;
        pointer-events: none;
    }
    
    @keyframes ripple-animation {
        to {
            transform: scale(4);
            opacity: 0;
        }
    }
`;
document.head.appendChild(rippleStyle);
