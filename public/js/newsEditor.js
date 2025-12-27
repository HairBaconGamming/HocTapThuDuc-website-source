/* public/js/newsEditor.js - Thêm đoạn này vào */

// GLOBAL: Switch Mode
window.switchThumbMode = (mode) => {
    // Xóa active cũ
    document.querySelectorAll('.thumb-tab:not(.locked)').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.thumb-input-group').forEach(g => g.classList.remove('active'));

    const uploadBtn = document.querySelector('button[onclick="switchThumbMode(\'upload\')"]');
    const urlBtn = document.querySelector('button[onclick="switchThumbMode(\'url\')"]');
    
    const modeUploadDiv = document.getElementById('modeUpload');
    const modeUrlDiv = document.getElementById('modeUrl');

    if(mode === 'upload') {
        if(uploadBtn) uploadBtn.classList.add('active');
        if(modeUploadDiv) modeUploadDiv.classList.add('active');
        
        // Reset URL input
        const urlInp = document.getElementById('urlInput');
        if(urlInp) urlInp.value = ''; 
    } else {
        if(urlBtn) urlBtn.classList.add('active');
        if(modeUrlDiv) modeUrlDiv.classList.add('active');
        
        // Reset File input
        const fileInp = document.getElementById('coverInput');
        if(fileInp) fileInp.value = '';
    }

    // Ẩn preview cũ
    const pv = document.getElementById('coverPreview');
    const rm = document.getElementById('btnRemoveCover');
    if(pv) pv.style.display = 'none';
    if(rm) rm.style.display = 'none';
};

document.addEventListener('DOMContentLoaded', () => {
    const previewImg = document.getElementById('coverPreview');
    const btnRemove = document.getElementById('btnRemoveCover');
    const uploadPlaceholder = document.getElementById('uploadPlaceholder');
    const urlInputGroup = document.getElementById('modeUrl');
    const modeUploadDiv = document.getElementById('modeUpload');

    // 1. XỬ LÝ UPLOAD FILE
    const coverInput = document.getElementById('coverInput');
    const coverZone = document.getElementById('coverZone');

    if (coverZone && coverInput && modeUploadDiv) {
        coverZone.addEventListener('click', (e) => {
            // Chỉ trigger khi modeUpload đang active VÀ không click vào nút xóa
            if (modeUploadDiv.classList.contains('active') && 
                e.target !== btnRemove && 
                (!btnRemove || !btnRemove.contains(e.target)) &&
                e.target.tagName !== 'INPUT') {
                coverInput.click();
            }
        });
    }

    if (coverInput) {
        coverInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (evt) => {
                    showPreview(evt.target.result);
                };
                reader.readAsDataURL(file);
            }
        });
    }

    // 2. XỬ LÝ URL INPUT
    const urlInput = document.getElementById('urlInput');
    if (urlInput) {
        urlInput.addEventListener('input', (e) => {
            const url = e.target.value.trim();
            if(url.match(/\.(jpeg|jpg|gif|png|webp)$/) != null || url.startsWith('http')) {
                showPreview(url);
            }
        });
    }

    // Helper: Show Preview
    function showPreview(src) {
        if (!previewImg) return;
        previewImg.src = src;
        previewImg.style.display = 'block';
        if (btnRemove) btnRemove.style.display = 'flex';
        
        // Ẩn các input đi cho đẹp
        if (uploadPlaceholder) uploadPlaceholder.style.opacity = '0';
        if (urlInputGroup) urlInputGroup.style.opacity = '0';
    }

    // 3. XÓA ẢNH
    if (btnRemove) {
        btnRemove.addEventListener('click', (e) => {
            e.stopPropagation();
            if (coverInput) coverInput.value = '';
            if (urlInput) urlInput.value = '';
            if (previewImg) {
                previewImg.src = '';
                previewImg.style.display = 'none';
            }
            btnRemove.style.display = 'none';
            
            // Hiện lại input
            if (uploadPlaceholder) uploadPlaceholder.style.opacity = '1';
            if (urlInputGroup) urlInputGroup.style.opacity = '1';
        });
    }

    // --- 3. TOAST UI EDITOR (MARKDOWN) ---
    const editorEl = document.querySelector('#newsContentEditor');
    const hiddenContentInput = document.querySelector('#hiddenContentInput');
    let newsEditor;

    if (editorEl) {
        newsEditor = new toastui.Editor({
            el: editorEl,
            height: '600px',
            initialEditType: 'markdown',
            previewStyle: 'vertical',
            initialValue: hiddenContentInput.value || '',
            placeholder: 'Viết nội dung tin tức ở đây... (Support Markdown)',
            autofocus: false,
            toolbarItems: [
                ['heading', 'bold', 'italic', 'strike'],
                ['hr', 'quote'],
                ['ul', 'ol', 'task', 'indent', 'outdent'],
                ['table', 'image', 'link'],
                ['code', 'codeblock']
            ]
        });
    }

    // --- 4. FORM SUBMIT ---
    const form = document.getElementById('newsForm');
    form.addEventListener('submit', (e) => {
        // Sync content từ Editor sang Input ẩn
        if (newsEditor) {
            hiddenContentInput.value = newsEditor.getMarkdown();
        }

        // Validate cơ bản
        if (!document.querySelector('input[name="title"]').value.trim()) {
            e.preventDefault();
            alert("Vui lòng nhập tiêu đề!");
            return;
        }
        if (!hiddenContentInput.value.trim()) {
            e.preventDefault();
            alert("Nội dung không được để trống!");
            return;
        }

        // UI Loading
        const btn = document.getElementById('btnSubmit');
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang đăng...';
        btn.style.opacity = '0.7';
        btn.style.pointerEvents = 'none';
    });
});