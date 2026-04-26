document.addEventListener("DOMContentLoaded", () => {
  const reminderButtons = document.querySelectorAll(".js-live-reminder");
  const filterForm = document.getElementById("liveHubFilters");
  const currentUserId = document.body.dataset.userId;
  let refreshTimeout = null;

  async function subscribeReminder(button) {
    const sessionId = button.dataset.sessionId;
    if (!sessionId) return;

    button.disabled = true;
    try {
      const response = await fetch(`/live/sessions/${sessionId}/reminders/subscribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Không thể cập nhật nhắc lịch.");
      }

      button.dataset.subscribed = payload.subscribed ? "true" : "false";
      button.textContent = payload.subscribed ? "Đã bật nhắc" : "Nhắc tôi";
      if (typeof showAlert === "function") {
        showAlert(
          payload.subscribed
            ? "Đã bật nhắc lịch cho buổi live này."
            : "Đã tắt nhắc lịch.",
          "success",
          3200
        );
      }
    } catch (error) {
      if (typeof showAlert === "function") {
        showAlert(error.message, "error", 4200);
      }
    } finally {
      button.disabled = false;
    }
  }

  reminderButtons.forEach((button) => {
    button.addEventListener("click", () => subscribeReminder(button));
  });

  if (typeof io !== "undefined") {
    const socket = io();
    socket.on("connect", () => {
      if (currentUserId) {
        socket.emit("userConnect", currentUserId);
      }
      socket.emit("subscribe_live_hub");
    });

    socket.on("liveSessionUpdated", () => {
      clearTimeout(refreshTimeout);
      refreshTimeout = setTimeout(() => {
        if (document.visibilityState === "visible") {
          window.location.reload();
        }
      }, 1200);
    });
  }

  filterForm?.addEventListener("submit", () => {
    const submitButton = filterForm.querySelector('button[type="submit"]');
    if (submitButton) submitButton.disabled = true;
  });
});
