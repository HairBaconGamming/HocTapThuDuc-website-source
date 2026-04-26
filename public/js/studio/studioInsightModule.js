(function () {
  function $(selector) {
    return document.querySelector(selector);
  }

  function createEl(tag, className, text) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text != null) el.textContent = text;
    return el;
  }

  function getSnapshot() {
    if (window.LessonStudioBridge && typeof window.LessonStudioBridge.getSnapshot === "function") {
      return window.LessonStudioBridge.getSnapshot();
    }
    return {
      title: "",
      blocks: [],
      metrics: { blocks: 0, words: 0, media: 0, readTime: 0 },
      activeLessonId: "",
      activeContext: "course",
      studioState: { lessonDirty: false, courseDirty: false, lastSavedAt: null }
    };
  }

  function describeBlock(block, index) {
    const typeMap = {
      text: "Văn bản",
      image: "Hình ảnh",
      video: "Video",
      resource: "Tài liệu",
      code: "Code",
      question: "Câu hỏi",
      quiz: "Câu hỏi",
      callout: "Ghi chú",
      html_preview: "HTML"
    };
    const label = typeMap[block.type] || `Block ${index + 1}`;
    const text = block?.data?.text || block?.data?.title || block?.data?.caption || block?.data?.code || "";
    return {
      label,
      summary: String(text).replace(/\s+/g, " ").trim().slice(0, 96) || "Chưa có nội dung tóm tắt."
    };
  }

  function createSmartItem(title, text, tone) {
    const item = createEl("div", `studio-smart-item${tone ? ` is-${tone}` : ""}`);
    item.appendChild(createEl("strong", "", title));
    item.appendChild(createEl("span", "", text));
    return item;
  }

  function createStudioInsightModule() {
    function collectQualityIssues(snapshot) {
      const issues = [];
      if (!snapshot.title) issues.push({ title: "Cần làm", text: "Bài học chưa có tiêu đề rõ ràng.", tone: "danger" });
      (snapshot.blocks || []).forEach((block, index) => {
        if (block.type === "text" && !String(block?.data?.text || "").trim()) {
          issues.push({ title: "Cần làm", text: `Block văn bản #${index + 1} đang trống.`, tone: "danger" });
        }
        if (["image", "video", "resource"].includes(block.type) && !String(block?.data?.url || "").trim()) {
          issues.push({ title: "Cần làm", text: `${describeBlock(block, index).label} #${index + 1} chưa có URL.`, tone: "danger" });
        }
      });
      return issues;
    }

    function renderOutline(snapshot) {
      const container = $("#v4OutlineTree");
      if (!container) return;
      container.innerHTML = "";
      const blocks = snapshot.blocks || [];
      const summary = $("#v4OutlineSummary");
      if (summary) summary.textContent = `${blocks.length} mục`;
      if (!blocks.length) {
        container.appendChild(createSmartItem("Trống", "Chưa có cấu trúc để hiển thị."));
        return;
      }
      blocks.forEach((block, index) => {
        const info = describeBlock(block, index);
        container.appendChild(createSmartItem(`${index + 1}. ${info.label}`, info.summary));
      });
    }

    function renderQuality(issues) {
      const container = $("#v4QualityChecks");
      if (!container) return;
      container.innerHTML = "";
      const qualitySummary = $("#v4QualitySummary");
      if (qualitySummary) qualitySummary.textContent = issues.length ? `${issues.length} lưu ý` : "Ổn định";
      if (!issues.length) {
        container.appendChild(createSmartItem("Sẵn sàng", "Chưa thấy lỗi rõ ràng ở bài học hiện tại.", "success"));
        return;
      }
      issues.forEach((issue) => container.appendChild(createSmartItem(issue.title, issue.text, issue.tone)));
    }

    function renderPublish(snapshot, issues) {
      const container = $("#v4PublishChecklist");
      if (!container) return;
      container.innerHTML = "";
      const checklist = [
        { ok: Boolean(snapshot.title), text: snapshot.title ? "Đã có tiêu đề bài học." : "Thiếu tiêu đề bài học." },
        { ok: snapshot.metrics.blocks > 0, text: snapshot.metrics.blocks > 0 ? `Có ${snapshot.metrics.blocks} block nội dung.` : "Chưa có block nội dung nào." },
        { ok: !snapshot.studioState.lessonDirty, text: snapshot.studioState.lessonDirty ? "Có thay đổi chưa lưu." : "Không có thay đổi chưa lưu." },
        { ok: issues.length === 0, text: issues.length === 0 ? "Không có cảnh báo chất lượng nghiêm trọng." : `Còn ${issues.length} mục cần rà trước khi publish.` }
      ];
      checklist.forEach((item) => {
        container.appendChild(createSmartItem(item.ok ? "Đạt" : "Cần xử lý", item.text, item.ok ? "success" : "warning"));
      });
    }

    function sync() {
      const snapshot = getSnapshot();
      const issues = collectQualityIssues(snapshot);
      renderOutline(snapshot);
      renderQuality(issues);
      renderPublish(snapshot, issues);
      const context = $("#v4InspectorContextBadge");
      if (context) context.textContent = snapshot.activeContext === "lesson" ? "Bài học" : snapshot.activeContext === "unit" ? "Chương" : "Khóa học";
      const state = $("#v4InspectorStateBadge");
      if (state) state.textContent = snapshot.studioState.lessonDirty || snapshot.studioState.courseDirty ? "Có thay đổi" : "Ổn định";
    }

    return {
      init() {
        document.addEventListener("lesson-studio:statechange", sync);
        sync();
      },
      syncNow: sync
    };
  }

  window.createStudioInsightModule = createStudioInsightModule;
})();
