// public/js/plugins/mathEditorPlugin.js

// --- Helper Functions (giữ nguyên) ---
function loadScript(url) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${url}"]`)) return resolve(url);
    const script = document.createElement("script");
    script.src = url;
    script.async = true;
    script.onload = () => resolve(url);
    script.onerror = () => reject(new Error(`Không thể tải script: ${url}`));
    document.head.appendChild(script);
  });
}

function loadStyle(url) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`link[href="${url}"]`)) return resolve(url);
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = url;
    link.onload = () => resolve(url);
    link.onerror = () => reject(new Error(`Không thể tải stylesheet: ${url}`));
    document.head.appendChild(link);
  });
}

function setupDependencies() {
  return Promise.all([
    loadScript("https://cdn.jsdelivr.net/npm/katex@0.16.10/dist/katex.min.js"),
    loadStyle("https://cdn.jsdelivr.net/npm/katex@0.16.10/dist/katex.min.css"),
    loadScript("https://unpkg.com/mathlive@0.98.4/dist/mathlive.min.js"), // Cập nhật phiên bản MathLive
    loadStyle("https://unpkg.com/mathlive@0.98.4/dist/mathlive-fonts.css"),
  ]).then(() => {
    console.log("Math Editor dependencies loaded!");
  }).catch((error) => {
    console.error("Error loading Math Editor dependencies:", error);
  });
}

// =================================================================
// ===== PHIÊN BẢN PLUGIN ĐÃ SỬA LẠI THEO ĐÚNG CHUẨN TOAST UI =====
// =================================================================

function mathEditorPlugin(context, options) {
  // Tự động load các thư viện cần thiết ngay khi plugin được gọi
  setupDependencies();

  const { eventEmitter } = context;
  let popup = null;
  let mathToolbarButton = null;

  // --- Logic của Popup (giữ nguyên) ---
  let previewEl = null;
  const showPopup = (editor) => {
    if (!popup) {
      popup = createPopup(editor);
      document.body.appendChild(popup);
      document.addEventListener("click", handleOutsideClick, true); // Use capture phase
    }
    popup.classList.add("show");
    positionPopup(popup);
    const mf = popup.querySelector("math-field");
    if (mf) mf.focus();
  };
  const hidePopup = () => {
    if (popup) popup.classList.remove("show");
    document.removeEventListener("click", handleOutsideClick, true);
  };
  const positionPopup = (el) => {
    if (mathToolbarButton) {
      const rect = mathToolbarButton.getBoundingClientRect();
      el.style.top = `${rect.bottom + window.scrollY + 10}px`;
      el.style.left = `${Math.max(0, rect.left + window.scrollX - (el.offsetWidth / 2) + (rect.width / 2))}px`;
    }
  };
  const handleOutsideClick = (e) => {
    if (popup && !popup.contains(e.target) && !mathToolbarButton.contains(e.target)) {
      hidePopup();
    }
  };
  const insertMath = (editor, isDisplay, mathField) => {
    const mathCode = mathField.value.trim();
    if (!mathCode) return;
    const syntax = isDisplay ? `\n$$\n${mathCode}\n$$\n` : `$${mathCode}$`;
    editor.insertText(syntax);
    hidePopup();
  };
  const updatePreview = (mathField) => {
    if(!previewEl) return;
    const code = mathField.value.trim();
    if (!code) {
      previewEl.innerHTML = "<em>Xem trước công thức...</em>";
      return;
    }
    try {
      if (window.katex) {
        previewEl.innerHTML = window.katex.renderToString(code, { throwOnError: false, displayMode: true });
      }
    } catch (err) {
      previewEl.innerHTML = `<span style="color:red;">${err.message}</span>`;
    }
  };
  const createPopup = (editor) => {
    const popupEl = document.createElement("div");
    popupEl.className = "modern-math-popup";
    // ... (Toàn bộ code tạo giao diện popup giữ nguyên như cũ)
    popupEl.style.cssText = "position: absolute; width: 450px; z-index: 1000; background: #fff; border: 1px solid #ddd; border-radius: 8px; padding: 20px; box-shadow: 0px 5px 15px rgba(0,0,0,0.15); font-family: sans-serif;";
    const header = document.createElement("div");
    header.textContent = "Soạn thảo Công thức Toán";
    header.style.cssText = "font-size: 16px; font-weight: 600; margin-bottom: 15px; color: #333;";
    popupEl.appendChild(header);
    const mathField = document.createElement("math-field");
    mathField.style.cssText = "display: block; width: 100%; font-size: 18px; border: 1px solid #ccc; border-radius: 4px; padding: 10px; margin-bottom: 15px;";
    popupEl.appendChild(mathField);
    previewEl = document.createElement("div");
    previewEl.style.cssText = "min-height: 40px; margin-bottom: 15px; font-size: 16px; color: #555; padding: 10px; background: #f9f9f9; border-radius: 4px; text-align: center;";
    previewEl.innerHTML = "<em>Xem trước công thức...</em>";
    popupEl.appendChild(previewEl);
    const btnContainer = document.createElement("div");
    btnContainer.style.cssText = "display: flex; justify-content: flex-end; gap: 10px;";
    const btnInline = document.createElement("button");
    btnInline.textContent = "Chèn Inline";
    btnInline.style.cssText = "padding: 8px 16px; border: 1px solid #007bff; background-color: #fff; color: #007bff; border-radius: 4px; cursor: pointer;";
    btnInline.addEventListener("click", () => insertMath(editor, false, mathField));
    const btnDisplay = document.createElement("button");
    btnDisplay.textContent = "Chèn Display";
    btnDisplay.style.cssText = "padding: 8px 16px; border: none; background-color: #28a745; color: #fff; border-radius: 4px; cursor: pointer;";
    btnDisplay.addEventListener("click", () => insertMath(editor, true, mathField));
    btnContainer.appendChild(btnInline);
    btnContainer.appendChild(btnDisplay);
    popupEl.appendChild(btnContainer);
    mathField.addEventListener("input", () => updatePreview(mathField));
    return popupEl;
  };
  
  // --- Hàm tạo button theo đúng chuẩn Toast UI ---
  const createMathButton = (editor) => {
    const button = document.createElement('button');
    button.className = 'toastui-editor-toolbar-icons';
    button.style.backgroundImage = 'none';
    button.style.margin = '0';
    button.innerHTML = `<b style="font-size: 1.2em; font-family: serif;">∑</b>`; // Biểu tượng Sigma
    
    button.addEventListener('click', () => {
        // Toggle popup
        if (popup && popup.classList.contains("show")) {
            hidePopup();
        } else {
            showPopup(editor);
        }
        eventEmitter.emit('closePopup'); // Đóng các popup khác của ToastUI
    });
    
    // Lưu lại tham chiếu đến button để định vị popup
    mathToolbarButton = button; 
    
    return button;
  };

  // Trả về đối tượng toolbar item theo đúng định dạng
  return {
    toolbarItems: [
      {
        groupIndex: 3, // Vị trí nhóm toolbar (thường sau table, image, link)
        itemIndex: 3,  // Vị trí trong nhóm
        item: {
          name: 'mathEditor',
          tooltip: 'Chèn Công thức Toán',
          el: createMathButton(eventEmitter.getEditor()), // Truyền instance editor vào
        }
      }
    ]
  };
}