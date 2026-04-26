(function () {
  const STORAGE_KEY = "lesson-editor-v4-layout";

  function readStorage() {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (error) {
      return {};
    }
  }

  const initialState = Object.assign(
    {
      previewMode: "desktop",
      focus: false,
      chromeCollapsed: false,
      wideCanvas: false,
      dockState: { left: "open", right: "open" },
      widths: { left: 324, right: 332 },
      activeTabs: { left: "left-structure", right: "right-properties" }
    },
    readStorage()
  );

  const listeners = new Set();

  function persist(state) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
      // ignore
    }
  }

  function notify(state) {
    listeners.forEach((listener) => {
      try {
        listener(state);
      } catch (error) {
        // ignore listener failures
      }
    });
  }

  function createStudioStore() {
    const state = JSON.parse(JSON.stringify(initialState));

    return {
      getState() {
        return state;
      },
      update(updater, { persistLayout = true } = {}) {
        if (typeof updater === "function") updater(state);
        if (persistLayout) persist(state);
        notify(state);
      },
      subscribe(listener) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      }
    };
  }

  window.createStudioStore = createStudioStore;
})();
