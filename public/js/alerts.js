// public/js/alerts.js

// --- FIXED: proper top-level guards and reduced-motion detection ---
const gsapExists = typeof gsap !== "undefined";
const tsParticlesExists = typeof tsParticles !== "undefined";
const prefersReducedMotion =
  (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) ||
  false;

if (!gsapExists)
  console.error(
    "GSAP library not loaded! Animations in alerts.js will be affected."
  );
if (!tsParticlesExists)
  console.warn(
    "tsParticles library not loaded! Particle effects in achievement notifications will not work."
  );


/**
 * Displays an advanced toast alert based on the CSS structure in styles.css.
 * @param {string} message - The main alert message.
 * @param {string} [type='info'] - The alert type: 'info', 'success', 'error', or 'warning'. Used as CSS class.
 * @param {number} [duration=5000] - Duration in milliseconds before auto-hiding.
 * @param {string|null} [title=null] - Optional title. If null, uses default based on type.
 */
function showAlert(message, type = "info", duration = 5000, title = null) {
  const container = document.getElementById("alert-container");
  if (!container) {
    console.error("Alert container #alert-container not found.");
    return;
  }

  // Validate type
  const validTypes = ["info", "success", "error", "warning"];
  const safeType = validTypes.includes(type) ? type : "info";

  // --- Create Toast Element ---
  const alertEl = document.createElement("div");
  alertEl.classList.add("alert-toast", safeType);
  alertEl.setAttribute("role", "alert");
  alertEl.style.setProperty("--toast-duration", `${duration / 1000}s`); // Set duration for CSS progress bar

  // --- Define Icons & Titles ---
  const icons = {
    success: "fas fa-check-circle",
    error: "fas fa-times-circle",
    info: "fas fa-info-circle",
    warning: "fas fa-exclamation-triangle",
  };
  const defaultTitles = {
    success: "Thành công!",
    error: "Lỗi!",
    info: "Thông báo",
    warning: "Cảnh báo!",
  };

  const finalTitle = title || defaultTitles[safeType];
  const iconClass = icons[safeType];

  // --- Build Inner HTML ---
  alertEl.innerHTML = `
        <div class="toast-icon-area">
            <i class="${iconClass}"></i>
        </div>
        <div class="toast-content">
            <div class="toast-title">${finalTitle}</div>
            <div class="toast-message">${message}</div>
        </div>
        <button class="toast-close" aria-label="Đóng">×</button>
    `;

  // --- Prepend to container (newest on top) ---
  container.prepend(alertEl); // Use prepend instead of appendChild

  // --- Auto-hide & Interaction ---
  let hideTimeoutId; // Store timeout ID

  const closeToast = () => {
    // Prevent closing multiple times
    if (alertEl.classList.contains("exiting")) return;

    clearTimeout(hideTimeoutId); // Clear auto-hide timer
    alertEl.classList.add("exiting"); // Trigger CSS exit animation

    // Reliable removal after animation
    alertEl.addEventListener(
      "animationend",
      (event) => {
        if (
          event.animationName === "toastOutRight" &&
          alertEl.parentNode === container
        ) {
          alertEl.remove();
        }
      },
      { once: true }
    );

    // Fallback removal
    const exitDuration =
      parseFloat(
        getComputedStyle(alertEl).getPropertyValue("--anim-duration-exit") ||
          "0.5"
      ) * 1000;
    setTimeout(() => {
      if (alertEl.parentNode === container) {
        // Check if still attached
        alertEl.remove();
      }
    }, exitDuration + 100); // Slightly longer than animation
  };

  // Close button listener
  const closeButton = alertEl.querySelector(".toast-close");
  closeButton?.addEventListener("click", closeToast);

  // Set auto-hide timer
  hideTimeoutId = setTimeout(closeToast, duration);

  // Pause on hover (including progress bar via CSS class)
  alertEl.addEventListener("mouseenter", () => {
    clearTimeout(hideTimeoutId);
    alertEl.classList.add("paused"); // CSS rule needed: .alert-toast.paused::after { animation-play-state: paused; }
  });

  alertEl.addEventListener("mouseleave", () => {
    alertEl.classList.remove("paused");
    // Restart timer for remaining duration (more complex) OR full duration (simpler)
    // Restarting full duration for simplicity:
    hideTimeoutId = setTimeout(closeToast, duration);
  });
} // End showAlert

// --- Helper Function: wrapCharacters for Achievement Notification ---
function wrapCharacters(text = "", baseDelay = 0, delayIncrement = 0.03) {
  if (typeof text !== "string") return "";
  const tokens = text.split(/(<br\s*\/?>)/gi); // Split by <br> tags
  let delayCounter = 0;
  return tokens
    .map((token) => {
      if (token.match(/<br\s*\/?>/i)) {
        return token; // Keep <br> tags as they are
      } else {
        // Process non-break parts
        return token
          .split("")
          .map((char) => {
            const delay = baseDelay + delayCounter * delayIncrement;
            if (char !== " ") delayCounter++; // Only increment delay for non-space characters
            let displayChar = char === " " ? " " : char; // Preserve spaces
            // Highlight numbers (optional)
            if (/[0-9]/.test(char)) {
              displayChar = `<span class="char-highlight">${displayChar}</span>`;
            }
            // Apply animation span only to non-space characters
            return char === " "
              ? displayChar
              : `<span class="char-anim" style="--char-delay: ${delay.toFixed(
                  3
                )}s;">${displayChar}</span>`;
          })
          .join("");
      }
    })
    .join("");
}

// --- Artistic Achievement Notification Function ---
function showAchievementNotification(achievement) {
  // Validate data
  if (
    !achievement ||
    !achievement.icon ||
    !achievement.name ||
    !achievement.description
  ) {
    console.error(
      "Invalid achievement data passed to showAchievementNotification:",
      achievement
    );
    return;
  }

  // Prevent stacking multiple achievement popups (optional: queue them?)
  const existingNotif = document.querySelector(".achievement-masterpiece");
  if (existingNotif) {
    console.log("Dismissing previous achievement notification.");
    // Ensure GSAP is loaded before using it
    if (gsapExists) {
      gsap.to(existingNotif, {
        autoAlpha: 0,
        scale: 0.9,
        duration: 0.3,
        onComplete: () => existingNotif.remove(),
      });
      setTimeout(() => createAndShowNotification(achievement), 400); // Show new one after delay
    } else {
      existingNotif.remove(); // Remove instantly if no GSAP
      createAndShowNotification(achievement);
    }
    return;
  }

  createAndShowNotification(achievement);
}

function createAndShowNotification(achievement) {
  // --- Create Notification Element ---
  const notif = document.createElement("div");
  notif.className = "achievement-masterpiece";
  notif.setAttribute("role", "alert");
  notif.setAttribute("aria-live", "polite");
  const particleContainerId = `achievement-particles-${Date.now()}`;

  // --- Animation Delays ---
  const iconAnimDuration = 0.7;
  const titleBaseDelay = 0.3;
  const titleIncrement = 0.04;
  const descBaseDelay =
    titleBaseDelay + achievement.name.length * titleIncrement + 0.2;
  const descIncrement = 0.02;

  // --- Inner HTML ---
  notif.innerHTML = `
        <div class="notification-background-glow"></div>
        <div id="${particleContainerId}" class="notification-particle-canvas"></div>
        <div class="achievement-content">
            <div class="achievement-icon-wrapper">
                <img src="${achievement.icon}" alt="Thành tích: ${
    achievement.name
  }" class="achievement-main-icon">
            </div>
            <div class="achievement-text-content">
                <div class="achievement-announcement">Thành Tích Mở Khóa!</div>
                <h3 class="achievement-main-title" aria-label="${
                  achievement.name
                }">
                    ${wrapCharacters(
                      achievement.name,
                      titleBaseDelay,
                      titleIncrement
                    )}
                </h3>
                <p class="achievement-main-description">
                    ${wrapCharacters(
                      achievement.description,
                      descBaseDelay,
                      descIncrement
                    )}
                </p>
            </div>
            <button class="achievement-close-btn" aria-label="Đóng">×</button>
        </div>
    `;
  document.body.appendChild(notif);

  // --- Particle Config ---
  const particleConfig = getParticleConfigForNotification(prefersReducedMotion);

  // --- Initialize Particles ---
  let particlesInstance = null;
  if (tsParticlesExists && !prefersReducedMotion) {
    tsParticles
      .load(particleContainerId, particleConfig)
      .then((container) => {
        particlesInstance = container;
      })
      .catch((error) =>
        console.error("tsParticles notification error:", error)
      );
  }

  // --- GSAP Entrance & Exit ---
  let autoHideTimeoutId;
  const hideNotification = (element) => {
    if (!element || element.isHiding) return;
    element.isHiding = true; // Flag to prevent multi-trigger
    clearTimeout(autoHideTimeoutId);

    if (gsapExists && !prefersReducedMotion) {
      gsap.to(element, {
        duration: 0.6,
        autoAlpha: 0,
        yPercent: 50,
        scale: 0.9,
        ease: "power2.in",
        onComplete: () => {
          particlesInstance?.destroy(); // Destroy particles
          element.remove();
        },
      });
    } else {
      particlesInstance?.destroy();
      element.remove();
    }
  };

  // Entrance animation
  if (gsapExists && !prefersReducedMotion) {
    const entranceTl = gsap.timeline({
      paused: true,
      onComplete: () => {
        const displayDuration = Math.max(
          7000,
          Math.ceil(
            (descBaseDelay +
              achievement.description.length * descIncrement +
              1) *
              1000
          )
        );
        autoHideTimeoutId = setTimeout(
          () => hideNotification(notif),
          displayDuration
        );
      },
    });
    entranceTl
      .set(notif, { display: "block" })
      .fromTo(
        notif,
        { yPercent: 100, autoAlpha: 0, scale: 0.9 },
        {
          yPercent: 0,
          autoAlpha: 1,
          scale: 1,
          duration: 0.8,
          ease: "power3.out",
        }
      )
      .fromTo(
        ".achievement-icon-wrapper",
        { scale: 0, rotationZ: -180 },
        {
          scale: 1,
          rotationZ: 0,
          duration: iconAnimDuration,
          ease: "back.out(1.7)",
          delay: 0.1,
        },
        0.2
      )
      .from(
        ".notification-background-glow",
        { opacity: 0, scale: 0.8, duration: 1, ease: "power2.out" },
        0.3
      );
    entranceTl.play();
  } else {
    // Reduced motion / No GSAP
    gsap.set(notif, { display: "block", autoAlpha: 1 });
    const displayDuration = Math.max(
      7000,
      Math.ceil(
        (descBaseDelay + achievement.description.length * descIncrement + 1) *
          1000
      )
    );
    autoHideTimeoutId = setTimeout(
      () => hideNotification(notif),
      displayDuration
    );
  }

  // Close button
  const closeBtn = notif.querySelector(".achievement-close-btn");
  closeBtn?.addEventListener("click", () => hideNotification(notif));
} // End showAchievementNotification

// --- Artistic Notification Function for Level Up ---
// (Similar to the lesson completion one, but tailored for tree levels)
function showArtisticTreeLevelUpNotification(data) {
  if (!data) return;
  const prefersReducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)"
  ).matches;

  const existingNotif = document.querySelector(".tree-level-up-notification");
  if (existingNotif) existingNotif.remove();

  const notif = document.createElement("div");
  notif.className = "tree-level-up-notification"; // New class name
  notif.setAttribute("aria-live", "polite");

  const particleContainerId = `tree-levelup-particles-${Date.now()}`;

  // Delays for text animation
  const iconAnimDuration = 0.8;
  const titleBaseDelay = 0.3;
  const titleIncrement = 0.05;
  const descBaseDelay =
    titleBaseDelay + (data.levelName?.length || 10) * titleIncrement + 0.2;
  const descIncrement = 0.03;

  notif.innerHTML = `
        <div class="notification-background-glow tree-glow"></div>
        <div id="${particleContainerId}" class="notification-particle-canvas"></div>
        <div class="level-up-content">
            <div class="level-up-icon-container">
                <%# Use a dynamic icon or a fixed one %>
                <i class="fas fa-seedling level-up-icon"></i>
                 <span class="level-up-number">${data.newLevel}</span>
            </div>
            <div class="level-up-text">
                <div class="level-up-title" aria-label="${
                  data.levelName || "Level Up!"
                }">
                    ${wrapCharacters(
                      data.levelName || "Lên Cấp!",
                      titleBaseDelay,
                      titleIncrement
                    )}
                </div>
                <div class="level-up-description">
                    ${wrapCharacters(
                      data.message || "Cây của bạn đã mạnh mẽ hơn!",
                      descBaseDelay,
                      descIncrement
                    )}
                </div>
            </div>
            <button class="achievement-close-btn" aria-label="Đóng">×</button>
        </div>
    `;

  document.body.appendChild(notif);

  // --- Initialize Particles ---
  if (typeof tsParticles !== "undefined" && !prefersReducedMotion) {
    tsParticles
      .load(particleContainerId, {
        fpsLimit: 60,
        particles: {
          number: { value: 60 },
          color: { value: ["#4CAF50", "#8BC34A", "#FFFFFF", "#ffde7d"] },
          shape: { type: "polygon", polygon: { sides: 6 } },
          opacity: { value: { min: 0.4, max: 0.9 } },
          size: { value: { min: 2, max: 5 } },
          move: {
            enable: true,
            speed: { min: 2, max: 5 },
            direction: "top",
            outModes: { default: "destroy", top: "none" },
            gravity: { enable: true, acceleration: -5 },
          },
        },
        interactivity: { enabled: false },
        detectRetina: true,
        background: { color: "transparent" },
        emitters: {
          position: { x: 50, y: 100 },
          rate: { quantity: 8, delay: 0.05 },
          size: { width: 100, height: 0 },
          life: { duration: 0.8, count: 1 },
        },
      })
      .catch((error) => console.error("tsParticles level up error:", error));
  }

  // --- Entrance Animation ---
  const entranceTl = gsap.timeline({
    paused: true,
    onComplete: () => {
      const displayDuration = Math.max(
        6000,
        Math.ceil(
          (descBaseDelay + (data.message?.length || 20) * descIncrement + 1) *
            1000
        )
      );
      autoHideTimeoutId = setTimeout(
        () => hideNotification(notif),
        displayDuration
      );
    },
  });
  if (!prefersReducedMotion) {
    entranceTl
      .set(notif, { display: "block" })
      .fromTo(
        notif,
        { yPercent: 110, autoAlpha: 0, rotationX: -20 },
        {
          yPercent: 0,
          autoAlpha: 1,
          rotationX: 0,
          duration: 0.8,
          ease: "power3.out",
        }
      )
      .from(
        ".level-up-icon-container",
        { scale: 0, rotationY: 180, duration: 0.7, ease: "back.out(1.5)" },
        "-=0.4"
      )
      .from(
        ".notification-background-glow",
        { scale: 0.5, opacity: 0, duration: 1, ease: "power2.out" },
        "<"
      );
  } else {
    entranceTl.set(notif, { display: "block", autoAlpha: 1 });
  }
  entranceTl.play();

  // --- Hide Logic ---
  let autoHideTimeoutId;
  const hideNotification = (element) => {
    /* ... same hide logic as achievement notif ... */
    if (!element) return;
    clearTimeout(autoHideTimeoutId);
    if (!prefersReducedMotion) {
      gsap.to(element, {
        duration: 0.5,
        autoAlpha: 0,
        yPercent: 50,
        scale: 0.9,
        ease: "power2.in",
        onComplete: () => {
          const instanceId = element.querySelector(
            ".notification-particle-canvas"
          )?.id;
          if (instanceId)
            tsParticles
              .dom()
              .find((c) => c.id === instanceId)
              ?.destroy();
          element.remove();
        },
      });
    } else {
      element.remove();
    }
  };
  const closeBtn = notif.querySelector(".achievement-close-btn");
  closeBtn?.addEventListener("click", () => hideNotification(notif));
} // End showArtisticTreeLevelUpNotification

// --- Socket.IO Listener Setup ---
const loggedInUserId = document.body.dataset.userId; // Assuming you add data-user-id to body
(() => {
  if (typeof io === "undefined") {
    console.warn(
      "Socket.IO client not loaded, cannot listen for achievements."
    );
    return;
  }
  try {
    const socket = io(); // Initialize connection
    let hasListener = false; // Prevent adding listener multiple times

    // Throttle / aggregate tree updates
    let lastTreeUpdateAt = 0;
    let pendingTreeUpdate = null;
    const TREE_THROTTLE_MS = 1500; // allow update every ~1.5s

    socket.on("connect", () => {
      console.log("Alerts: Socket connected for achievements", socket.id);
      socket.emit('userConnect', loggedInUserId);
      // Add listener only once connected
      if (!hasListener) {
        socket.on("newAchievement", (achievement) => {
          console.log("Received achievement via socket:", achievement);
          showAchievementNotification(achievement); // Call the display function
        });
        // Throttled handler for frequent updates
        socket.on("treePointsUpdate", (data) => {
          const now = Date.now();
          if (now - lastTreeUpdateAt < TREE_THROTTLE_MS) {
            // keep latest pending, but avoid immediate DOM/animation
            pendingTreeUpdate = data;
            return;
          }
          lastTreeUpdateAt = now;
          // process immediately
          handleTreeUpdate(data);

          // schedule processing of any pending update after throttle window
          setTimeout(() => {
            if (pendingTreeUpdate) {
              handleTreeUpdate(pendingTreeUpdate);
              pendingTreeUpdate = null;
              lastTreeUpdateAt = Date.now();
            }
          }, TREE_THROTTLE_MS + 50);
        });

        hasListener = true; // Mark listener as added
      }
      // Join user room if user ID is available (requires user ID on client)
      // const userId = document.body.dataset.userId; // Example: Get from body data attribute
      // if (userId) socket.emit('userConnect', userId);
    });
    socket.on("disconnect", () => {
      console.log("Alerts: Socket disconnected.");
      hasListener = false;
    }); // Reset flag on disconnect
    socket.on("connect_error", (err) =>
      console.error("Alerts: Socket connection error.", err)
    );

    function handleTreeUpdate(data) {
      // Lightweight handling: avoid heavy GSAP unless visible and allowed
      const treeContainer = document.getElementById("cssTreeContainer");
      if (treeContainer) {
        if (!prefersReducedMotion && gsapExists) {
          // small visual pulse
          const progressBar = document.getElementById("treeProgressBarFill");
          if (progressBar) {
            try {
              gsap.fromTo(
                progressBar,
                { scaleY: 1 },
                {
                  scaleY: 1.12,
                  duration: 0.18,
                  yoyo: true,
                  repeat: 1,
                  transformOrigin: "center bottom",
                  ease: "power2.out",
                }
              );
            } catch (e) {
              /* swallow animation errors */
            }
          }
        }
        // update textual values using lightweight DOM ops
        if (typeof animateProgressBar === "function") {
          animateProgressBar(
            data.newGrowthPoints,
            data.treeLevel,
            data.pointsForCurrentLevel,
            data.pointsForNextLevel
          );
        }
        if (typeof animateTotalPoints === "function") {
          animateTotalPoints(data.newGrowthPoints);
        }
      } else {
        // not on tree page: show a brief toast (non-blocking)
        if (typeof showAlert === "function") {
          showAlert(`+${data.pointsGained} điểm tăng trưởng!`, "info", 2500);
        }
      }
    }
  } catch (error) {
    console.error("Failed to initialize Socket.IO for achievements:", error);
  }
})();