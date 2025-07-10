// public/js/plugins/mathEditorPlugin.js
// Hàm load script động từ một URL
function loadScript(url) {
  return new Promise((resolve, reject) => {
    // Nếu script đã tồn tại thì bỏ qua việc load lại
    if (document.querySelector(`script[src="${url}"]`)) {
      return resolve(url);
    }
    const script = document.createElement("script");
    script.src = url;
    script.async = true;
    script.onload = () => resolve(url);
    script.onerror = () => reject(new Error(`Không thể tải script: ${url}`));
    document.head.appendChild(script);
  });
}

// Hàm load Style (CSS) động từ một URL
function loadStyle(url) {
  return new Promise((resolve, reject) => {
    // Kiểm tra nếu style đã tồn tại
    if (document.querySelector(`link[href="${url}"]`)) {
      return resolve(url);
    }
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = url;
    link.onload = () => resolve(url);
    link.onerror = () => reject(new Error(`Không thể tải stylesheet: ${url}`));
    document.head.appendChild(link);
  });
}

// Hàm setupDependencies tự động load các module cần thiết
function setupDependencies() {
  return Promise.all([
    loadScript("https://cdn.jsdelivr.net/npm/katex@0.15.1/dist/katex.min.js"),
    loadStyle("https://cdn.jsdelivr.net/npm/katex@0.15.1/dist/katex.min.css"),
    loadScript("https://unpkg.com/mathlive@0.72.1/dist/mathlive.min.js"),
    loadStyle("https://unpkg.com/mathlive@0.72.1/dist/mathlive-fonts.css"),
  ])
    .then(() => {
      console.log("Tất cả các dependency đã được load!");
    })
    .catch((error) => {
      console.error("Lỗi khi load dependencies:", error);
    });
}

function mathEditorPlugin(context) {
  const { instance: editor } = context;

  // Tự setup các module phụ thuộc ngay khi plugin khởi tạo
  setupDependencies();

  let popup = null;
  let previewEl = null; // Preview element dùng để render bằng KaTeX

  // Xử lý khi click vào nút toolbar
  function onClickButton() {
    if (popup && popup.classList.contains("show")) {
      hidePopup();
    } else {
      showPopup();
    }
  }

  function showPopup() {
    if (!popup) {
      popup = createPopup();
      document.body.appendChild(popup);
      document.addEventListener("click", handleOutsideClick);
      window.addEventListener("scroll", updatePopupPosition);
      window.addEventListener("resize", updatePopupPosition);
    }
    popup.classList.add("show");
    positionPopup(popup);
    // Focus vào math-field (nếu có)
    const mf = popup.querySelector("math-field");
    mf && mf.focus();
  }

  function hidePopup() {
    if (popup) {
      popup.classList.remove("show");
    }
    document.removeEventListener("click", handleOutsideClick);
    window.removeEventListener("scroll", updatePopupPosition);
    window.removeEventListener("resize", updatePopupPosition);
  }

  function updatePopupPosition() {
    if (popup && popup.classList.contains("show")) {
      positionPopup(popup);
    }
  }

  function handleOutsideClick(e) {
    if (popup && !popup.contains(e.target) && e.target !== mathToolbarEl) {
      hidePopup();
    }
  }

  // Hàm chèn công thức vào editor dưới dạng inline hoặc display math
  function insertMath(isDisplay, mathField) {
    const mathCode = mathField.value.trim();
    if (!mathCode) return;
    const syntax = isDisplay ? `\n$$\n${mathCode}\n$$\n` : `$${mathCode}$`;
    editor.insertText(syntax);
    hidePopup();
  }

  // Cập nhật preview sử dụng KaTeX dựa trên giá trị của math-field
  function updatePreview(mathField) {
    const code = mathField.value.trim();
    if (!code) {
      previewEl.innerHTML = "<em>Math preview will appear here...</em>";
      return;
    }
    try {
      previewEl.innerHTML = katex.renderToString(code, { throwOnError: false });
    } catch (err) {
      previewEl.innerHTML = `<span style="color:red;">${err.message}</span>`;
    }
  }

  // Tạo popup với giao diện hiện đại và tích hợp Mathlive
  function createPopup() {
    const popupEl = document.createElement("div");
    popupEl.className = "modern-math-popup";
    popupEl.style.cssText =
      "position: absolute; z-index: 1000; background: #fff; border: 1px solid #ddd; border-radius: 4px; padding: 15px; box-shadow: 0px 4px 10px rgba(0,0,0,0.1);";

    // Header của popup
    const header = document.createElement("div");
    header.textContent = "Math Editor";
    header.style.cssText = "font-size: 18px; font-weight: 600; margin-bottom: 15px; color: #333;";
    popupEl.appendChild(header);

    // Tạo phần tử math-field của Mathlive
    const mathField = document.createElement("math-field");
    mathField.setAttribute("virtual-keyboard-mode", "manual"); // Tùy chọn: tắt bàn phím ảo trên mobile
    mathField.style.cssText =
      "width: 100%; min-height: 50px; font-size: 18px; border: 1px solid #ddd; border-radius: 4px; padding: 10px; margin-bottom: 15px;";
    popupEl.appendChild(mathField);

    // Tạo preview area để hiển thị kết quả bằng KaTeX
    previewEl = document.createElement("div");
    previewEl.style.cssText =
      "min-height: 30px; margin-bottom: 15px; font-size: 16px; color: #555;";
    previewEl.innerHTML = "<em>Math preview will appear here...</em>";
    popupEl.appendChild(previewEl);

    // Container chứa các nút chức năng
    const btnContainer = document.createElement("div");
    btnContainer.style.textAlign = "right";

    const btnInline = document.createElement("button");
    btnInline.textContent = "Insert Inline";
    btnInline.style.cssText =
      "margin-right: 10px; padding: 8px 12px; border: none; background-color: #007bff; color: #fff; border-radius: 4px; cursor: pointer;";
    btnInline.addEventListener("click", () => insertMath(false, mathField));

    const btnDisplay = document.createElement("button");
    btnDisplay.textContent = "Insert Display";
    btnDisplay.style.cssText =
      "padding: 8px 12px; border: none; background-color: #28a745; color: #fff; border-radius: 4px; cursor: pointer;";
    btnDisplay.addEventListener("click", () => insertMath(true, mathField));

    btnContainer.appendChild(btnInline);
    btnContainer.appendChild(btnDisplay);
    popupEl.appendChild(btnContainer);

    // Cập nhật preview khi người dùng thay đổi nội dung trong math-field
    mathField.addEventListener("input", () => updatePreview(mathField));

    return popupEl;
  }

  // Định vị popup dựa vào vị trí của nút toolbar
  function positionPopup(el) {
    if (mathToolbarEl) {
      const rect = mathToolbarEl.getBoundingClientRect();
      el.style.top = rect.bottom + window.scrollY + 10 + "px";
      el.style.left = rect.left + window.scrollX + "px";
    } else {
      el.style.top = "100px";
      el.style.left = "100px";
    }
  }

  // Tạo nút toolbar với biểu tượng toán học
  const mathToolbarEl = document.createElement("span");
  mathToolbarEl.textContent = "∑";
  mathToolbarEl.style.cssText =
    "cursor: pointer; background: #f8f9fa; padding: 8px 10px; border-radius: 4px; font-size: 18px; color: #333;";
  mathToolbarEl.title = "Math Editor";
  mathToolbarEl.addEventListener("click", onClickButton);

  return {
    toolbarItems: [
      {
        groupIndex: 3,
        item: {
          name: "math",
          tooltip: "Math Editor",
          el: mathToolbarEl,
        },
      },
    ],
  };
}

// Đặt tên cho plugin (hữu ích cho debug và tích hợp)
mathEditorPlugin.pluginName = "mathEditorPlugin";
export default mathEditorPlugin;
