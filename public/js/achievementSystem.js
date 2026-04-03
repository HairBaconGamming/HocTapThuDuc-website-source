const AchievementSystem = {
  normalize(data) {
    if (!data) {
      return null;
    }

    if (data.achievement && data.achievement.name) {
      return data.achievement;
    }

    if (data.achievementId && data.achievementId.name) {
      return {
        ...data.achievementId,
        unlockedAt: data.unlockedAt || null
      };
    }

    if (data.name) {
      return data;
    }

    console.error("Achievement Data Invalid:", data);
    return null;
  },

  showUnlock(data) {
    const achievement = this.normalize(data);
    if (!achievement) {
      return;
    }

    this.renderToast(achievement);
    this.playSound();
  },

  renderToast(achievement) {
    const container = document.getElementById("achievement-toast-container");
    if (!container) {
      return;
    }

    const icon = achievement.icon || "🏆";
    const points = Number(achievement.points || 0);
    const name = achievement.name || "Thanh tich moi";
    const unlockMessage = achievement.unlockMessage || achievement.description || "";
    const color = achievement.color || "#ffd700";

    const toast = document.createElement("div");
    toast.className = "ach-toast";
    toast.style.borderColor = color;

    const iconWrapper = document.createElement("div");
    iconWrapper.className = "ach-icon-wrapper";
    iconWrapper.style.background = `linear-gradient(135deg, ${color}, #111827)`;
    iconWrapper.textContent = icon;

    const content = document.createElement("div");
    content.className = "ach-content";

    const title = document.createElement("div");
    title.className = "ach-title";
    title.textContent = "Thanh tich mo khoa";

    const nameElement = document.createElement("div");
    nameElement.className = "ach-name";
    nameElement.textContent = name;

    const pointsElement = document.createElement("div");
    pointsElement.className = "ach-points";
    pointsElement.textContent = `+${points} diem thanh tich`;

    content.appendChild(title);
    content.appendChild(nameElement);

    if (unlockMessage) {
      const description = document.createElement("div");
      description.className = "ach-description";
      description.textContent = unlockMessage;
      content.appendChild(description);
    }

    content.appendChild(pointsElement);
    toast.appendChild(iconWrapper);
    toast.appendChild(content);

    container.appendChild(toast);

    requestAnimationFrame(() => {
      toast.classList.add("active");
    });

    setTimeout(() => {
      toast.classList.remove("active");
      toast.style.opacity = "0";
      setTimeout(() => toast.remove(), 500);
    }, 5000);
  },

  playSound() {
    const audio = document.getElementById("ach-sound");
    if (!audio) {
      return;
    }

    audio.volume = 0.5;
    audio.play().catch(() => {});
  }
};

window.AchievementSystem = AchievementSystem;
