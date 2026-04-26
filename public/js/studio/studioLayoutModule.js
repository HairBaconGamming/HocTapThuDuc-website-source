(function () {
  function $(selector) {
    return document.querySelector(selector);
  }

  function normalizeText(value) {
    return String(value || "").toLowerCase().trim();
  }

  function createStudioLayoutModule(store) {
    function applyWidths(state) {
      document.documentElement.style.setProperty("--v4-left-width", `${state.widths.left || 324}px`);
      document.documentElement.style.setProperty("--v4-right-width", `${state.widths.right || 332}px`);
    }

    function syncLayoutButtons(state) {
      document.querySelectorAll("[data-layout-action]").forEach((button) => {
        const action = button.dataset.layoutAction;
        let isActive = false;
        if (action === "toggle-left-dock") isActive = state.dockState.left !== "collapsed";
        else if (action === "toggle-right-dock") isActive = state.dockState.right !== "collapsed";
        else if (action === "toggle-wide-canvas") isActive = !!state.wideCanvas;
        else if (action === "toggle-chrome") isActive = !!state.chromeCollapsed;
        button.classList.toggle("is-active", isActive);
      });
    }

    function applyState() {
      const state = store.getState();
      const root = $(".studio-v4-root");
      const mainShell = $("#studioMainShell");
      const leftDock = $("#studioLeftDock");
      const rightDock = $("#studioRightDock");

      if (root) {
        root.classList.toggle("is-focus", !!state.focus);
        root.classList.toggle("is-chrome-collapsed", !!state.chromeCollapsed);
        root.classList.toggle("is-wide-canvas", !!state.wideCanvas);
      }

      if (mainShell) mainShell.dataset.previewMode = state.previewMode || "desktop";
      if (leftDock) leftDock.dataset.dockState = state.dockState.left || "open";
      if (rightDock) rightDock.dataset.dockState = state.dockState.right || "open";

      document.querySelectorAll("[data-preview-mode]").forEach((button) => {
        button.classList.toggle("is-active", button.dataset.previewMode === state.previewMode);
      });

      ["left", "right"].forEach((side) => {
        const dock = side === "left" ? leftDock : rightDock;
        if (!dock) return;
        const target = state.activeTabs[side];
        dock.querySelectorAll("[data-dock-target]").forEach((button) => {
          button.classList.toggle("is-active", button.dataset.dockTarget === target);
        });
        dock.querySelectorAll("[data-dock-mini-target]").forEach((button) => {
          button.classList.toggle("is-active", button.dataset.dockMiniTarget === target);
        });
        dock.querySelectorAll(".studio-dock-panel").forEach((panel) => {
          panel.classList.toggle("is-active", panel.dataset.dockPanel === target);
        });
      });

      applyWidths(state);
      syncLayoutButtons(state);
    }

    function bind() {
      document.addEventListener("click", (event) => {
        const previewButton = event.target.closest("[data-preview-mode]");
        if (previewButton) {
          store.update((state) => {
            state.previewMode = previewButton.dataset.previewMode;
          });
          return;
        }

        const dockToggle = event.target.closest("[data-dock-toggle]");
        if (dockToggle) {
          const side = dockToggle.dataset.dockToggle;
          store.update((state) => {
            state.dockState[side] = state.dockState[side] === "collapsed" ? "open" : "collapsed";
          });
          return;
        }

        const layoutButton = event.target.closest("[data-layout-action]");
        if (layoutButton) {
          const action = layoutButton.dataset.layoutAction;
          store.update((state) => {
            if (action === "toggle-chrome") state.chromeCollapsed = !state.chromeCollapsed;
            if (action === "toggle-wide-canvas") {
              state.wideCanvas = !state.wideCanvas;
              state.dockState.left = state.wideCanvas ? "collapsed" : "open";
              state.dockState.right = state.wideCanvas ? "collapsed" : "open";
            }
            if (action === "toggle-left-dock") state.dockState.left = state.dockState.left === "collapsed" ? "open" : "collapsed";
            if (action === "toggle-right-dock") state.dockState.right = state.dockState.right === "collapsed" ? "open" : "collapsed";
          });
          return;
        }

        const focusToggle = event.target.closest("#studioFocusToggle, #studioFocusToggleSecondary");
        if (focusToggle) {
          store.update((state) => {
            state.focus = !state.focus;
          });
          return;
        }

        const dockTabButton = event.target.closest("[data-dock-target]");
        if (dockTabButton) {
          const tabGroup = dockTabButton.closest("[data-dock-tabs]");
          if (!tabGroup) return;
          store.update((state) => {
            state.activeTabs[tabGroup.dataset.dockTabs] = dockTabButton.dataset.dockTarget;
          });
          return;
        }

        const miniTabButton = event.target.closest("[data-dock-mini-target]");
        if (miniTabButton) {
          const rail = miniTabButton.closest("[data-dock-mini]");
          if (!rail) return;
          store.update((state) => {
            state.activeTabs[rail.dataset.dockMini] = miniTabButton.dataset.dockMiniTarget;
            state.dockState[rail.dataset.dockMini] = "open";
          });
        }
      });

      document.querySelectorAll(".studio-dock-resizer").forEach((handle) => {
        handle.addEventListener("pointerdown", (event) => {
          const side = handle.dataset.resizer;
          const startX = event.clientX;
          const startLeft = store.getState().widths.left || 324;
          const startRight = store.getState().widths.right || 332;

          function onMove(moveEvent) {
            store.update((state) => {
              const delta = moveEvent.clientX - startX;
              if (side === "left") state.widths.left = Math.max(260, Math.min(560, startLeft + delta));
              else state.widths.right = Math.max(280, Math.min(620, startRight - delta));
            }, { persistLayout: false });
          }

          function onUp() {
            window.removeEventListener("pointermove", onMove);
            window.removeEventListener("pointerup", onUp);
            store.update(() => {}, { persistLayout: true });
          }

          window.addEventListener("pointermove", onMove);
          window.addEventListener("pointerup", onUp);
        });
      });

      const navigatorSearch = $("#studioNavigatorSearch");
      if (navigatorSearch) {
        navigatorSearch.addEventListener("input", () => {
          const query = normalizeText(navigatorSearch.value);
          document.querySelectorAll(".tree-unit").forEach((unitEl) => {
            const unitMatch = normalizeText(unitEl.textContent).includes(query);
            let lessonMatch = false;
            unitEl.querySelectorAll(".tree-lesson").forEach((lessonEl) => {
              const matched = !query || normalizeText(lessonEl.textContent).includes(query);
              lessonEl.style.display = matched ? "" : "none";
              if (matched) lessonMatch = true;
            });
            unitEl.style.display = !query || unitMatch || lessonMatch ? "" : "none";
          });
        });
      }
    }

    return {
      init() {
        bind();
        store.subscribe(applyState);
        applyState();
      }
    };
  }

  window.createStudioLayoutModule = createStudioLayoutModule;
})();
