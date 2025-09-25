document.addEventListener('DOMContentLoaded', () => {
    const avatarSection = document.querySelector('.avatar-management-area');
    if (!avatarSection) return;

    // --- DOM ELEMENT REFERENCES ---
    const wrapper = document.querySelector('.avatar-preview-wrapper');
    const previewImg = document.getElementById('current-avatar-preview');
    const fileInput = document.getElementById('avatar-file-input');
    const actionButtonsContainer = document.getElementById('avatar-action-buttons');
    const saveBtn = document.getElementById('save-avatar-btn');
    const cancelBtn = document.getElementById('cancel-avatar-btn');
    const galleryContainer = document.getElementById('pro-image-gallery');
    const headerAvatar = document.querySelector('.user-avatar-header');
    const progressRing = document.querySelector('.progress-ring__circle-fill');

    // --- STATE MANAGEMENT ---
    let selectedFile = null;
    let isUploading = false;
    const originalAvatarSrc = previewImg.src;
    
    // Calculate progress ring circumference
    const radius = progressRing.r.baseVal.value;
    const circumference = radius * 2 * Math.PI;
    progressRing.style.strokeDasharray = `${circumference} ${circumference}`;
    progressRing.style.strokeDashoffset = circumference;

    // --- HELPER FUNCTIONS ---
    function setRingProgress(percent) {
        const offset = circumference - (percent / 100) * circumference;
        progressRing.style.strokeDashoffset = offset;
    }

    function showToast(message, type = 'success', duration = 3000) {
        // Assuming a global showAlert function exists from alerts.js
        if (typeof showAlert === 'function') {
            const title = type.charAt(0).toUpperCase() + type.slice(1);
            showAlert(message, type, duration, title);
        } else {
            console.log(`[Toast/${type}]: ${message}`);
        }
    }

    // --- CORE LOGIC ---
    async function loadUserImages() {
        galleryContainer.innerHTML = '<div class="gallery-loader"><i class="fas fa-spinner fa-spin"></i> Đang tải...</div>';
        try {
            const response = await fetch('/api/pro-images/list');
            if (!response.ok) throw new Error('Không thể tải danh sách ảnh.');
            const images = await response.json();

            if (images.length === 0) {
                galleryContainer.innerHTML = '<p class="gallery-loader">Bạn chưa tải lên ảnh nào.</p>';
                return;
            }

            galleryContainer.innerHTML = ''; // Clear loader
            images.forEach(image => {
                const item = document.createElement('div');
                item.className = 'gallery-item';
                item.innerHTML = `
                    <img src="${image.url}" alt="${image.displayName}" loading="lazy">
                    <div class="set-avatar-overlay"><i class="fas fa-check-circle"></i></div>
                `;
                item.addEventListener('click', () => handleSetAvatar(image.url));
                galleryContainer.appendChild(item);
            });
        } catch (error) {
            console.error(error);
            galleryContainer.innerHTML = '<p class="gallery-loader text-danger">Không thể tải ảnh.</p>';
        }
    }

    async function handleSetAvatar(avatarUrl) {
        showToast('Đang đặt ảnh đại diện...', 'info');
        try {
            const response = await fetch('/api/user/avatar', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ avatarUrl })
            });

            if (!response.ok) {
                const errData = await response.json();
                throw new Error(errData.error || 'Đặt ảnh đại diện thất bại.');
            }
            
            const result = await response.json();
            previewImg.src = result.newAvatarUrl;
            if(headerAvatar) headerAvatar.src = result.newAvatarUrl;
            previewImg.dataset.originalSrc = result.newAvatarUrl; // Update original source
            showToast('Cập nhật ảnh đại diện thành công!', 'success');
        } catch (error) {
            console.error(error);
            showToast(error.message, 'danger');
        }
    }

    function handleFileSelect(file) {
        if (!file) return;

        const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
        if (!allowedTypes.includes(file.type)) {
            showToast('Loại file không hợp lệ. Vui lòng chọn ảnh (JPG, PNG, GIF, WEBP).', 'danger');
            return;
        }
        if (file.size > 5 * 1024 * 1024) { // 5 MB limit
            showToast('File quá lớn. Kích thước tối đa là 5MB.', 'danger');
            return;
        }
        
        selectedFile = file;
        const reader = new FileReader();
        reader.onload = (e) => { previewImg.src = e.target.result; };
        reader.readAsDataURL(file);

        actionButtonsContainer.classList.add('visible');
    }

    function resetState() {
        selectedFile = null;
        fileInput.value = '';
        previewImg.src = previewImg.dataset.originalSrc || originalAvatarSrc;
        actionButtonsContainer.classList.remove('visible');
    }

    function handleUpload() {
        if (!selectedFile || isUploading) return;

        isUploading = true;
        wrapper.classList.add('uploading');
        setRingProgress(0);

        const formData = new FormData();
        formData.append('image', selectedFile);
        
        const xhr = new XMLHttpRequest();
        xhr.open('POST', '/api/pro-images/upload', true);

        xhr.upload.onprogress = (event) => {
            if (event.lengthComputable) {
                const percentComplete = (event.loaded / event.total) * 100;
                setRingProgress(percentComplete);
            }
        };

        xhr.onload = async () => {
            if (xhr.status >= 200 && xhr.status < 300) {
                const uploadResult = JSON.parse(xhr.responseText);
                await handleSetAvatar(uploadResult.url);
                await loadUserImages(); // Refresh gallery
                resetState();
            } else {
                try {
                    const errData = JSON.parse(xhr.responseText);
                    showToast(errData.error || 'Tải lên thất bại.', 'danger');
                } catch {
                    showToast('Tải lên thất bại.', 'danger');
                }
            }
             // Final state handled in 'loadend'
        };

        xhr.onerror = () => {
            showToast('Lỗi mạng, không thể tải ảnh lên.', 'danger');
             // Final state handled in 'loadend'
        };
        
        xhr.onloadend = () => {
            isUploading = false;
            wrapper.classList.remove('uploading');
            setTimeout(() => setRingProgress(0), 400); // Reset ring after transition
        };

        xhr.send(formData);
    }
    
    // --- EVENT LISTENERS ---
    wrapper.addEventListener('click', () => {
        if (!isUploading) fileInput.click();
    });

    fileInput.addEventListener('change', () => handleFileSelect(fileInput.files[0]));

    // Drag and Drop
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        wrapper.addEventListener(eventName, e => {
            e.preventDefault();
            e.stopPropagation();
        });
    });
    ['dragenter', 'dragover'].forEach(eventName => {
        wrapper.addEventListener(eventName, () => wrapper.classList.add('drag-over'));
    });
    ['dragleave', 'drop'].forEach(eventName => {
        wrapper.addEventListener(eventName, () => wrapper.classList.remove('drag-over'));
    });

    wrapper.addEventListener('drop', e => {
        const file = e.dataTransfer?.files[0];
        if (file) handleFileSelect(file);
    });

    saveBtn.addEventListener('click', handleUpload);
    cancelBtn.addEventListener('click', resetState);

    // Initial Load
    previewImg.dataset.originalSrc = originalAvatarSrc; // Store initial avatar
    loadUserImages();
});