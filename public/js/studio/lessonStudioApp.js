(function () {
  function bindQuickActions() {
    document.querySelectorAll("[data-studio-action]").forEach((button) => {
      button.addEventListener("click", () => {
        if (!window.LessonStudioBridge) return;
        const action = button.dataset.studioAction;
        if (action === "quick-save" || action === "quick-draft") window.LessonStudioBridge.quickDraft();
        if (action === "quick-publish") window.LessonStudioBridge.quickPublish();
      });
    });
  }

  function init() {
    if (!document.getElementById("studioWorkspace")) return;
    if (typeof window.createStudioStore !== "function") return;

    const store = window.createStudioStore();
    const layoutModule = window.createStudioLayoutModule ? window.createStudioLayoutModule(store) : null;
    const insightModule = window.createStudioInsightModule ? window.createStudioInsightModule() : null;

    if (layoutModule && typeof layoutModule.init === "function") layoutModule.init();
    if (insightModule && typeof insightModule.init === "function") insightModule.init();

    bindQuickActions();

    window.LessonEditorV4 = {
      init,
      syncNow: () => {
        if (insightModule && typeof insightModule.syncNow === "function") insightModule.syncNow();
      },
      applyPreviewMode: (mode) => {
        store.update((state) => {
          state.previewMode = mode;
        });
      },
      setActiveDockTab: (side, target) => {
        store.update((state) => {
          state.activeTabs[side] = target;
          state.dockState[side] = "open";
        });
      }
    };
  }

  document.addEventListener("DOMContentLoaded", init);
})();
