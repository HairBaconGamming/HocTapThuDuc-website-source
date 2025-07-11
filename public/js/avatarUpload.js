document.addEventListener('DOMContentLoaded', () => {
    // Check if we are on the profile edit page and if the user is PRO
    const avatarSection = document.querySelector('.avatar-management-area');
    if (!avatarSection) {
        return; // Exit if this isn't the right page
    }

    const previewImg = document.getElementById('current-avatar-preview');
    const fileInput = document.getElementById('avatar-file-input');
    const uploadBtn = document.getElementById('upload-avatar-btn');
    const galleryContainer = document.getElementById('pro-image-gallery');
    const headerAvatar = document.querySelector('.user-avatar-header');

    let selectedFile = null;

    // --- 1. Load User's Existing PRO Images ---
    async function loadUserImages() {
        galleryContainer.innerHTML = '<div class="gallery-loader"><i class="fas fa-spinner fa-spin"></i> Loading...</div>';
        try {
            const response = await fetch('/api/pro-images/list');
            if (!response.ok) throw new Error('Failed to fetch images.');
            const images = await response.json();

            if (images.length === 0) {
                galleryContainer.innerHTML = '<p class="gallery-loader">No images uploaded yet.</p>';
                return;
            }

            galleryContainer.innerHTML = ''; // Clear loader
            images.forEach(image => {
                const url = `/api/pro-images/${image.filename}`;
                const item = document.createElement('div');
                item.className = 'gallery-item';
                item.innerHTML = `
                    <img src="${url}" alt="${image.displayName}" loading="lazy">
                    <div class="set-avatar-overlay"><i class="fas fa-check"></i> Set Avatar</div>
                `;
                item.addEventListener('click', () => handleSetAvatar(url));
                galleryContainer.appendChild(item);
            });
        } catch (error) {
            console.error(error);
            galleryContainer.innerHTML = '<p class="gallery-loader">Could not load images.</p>';
        }
    }

    // --- 2. Handle Setting an Avatar ---
    async function handleSetAvatar(avatarUrl) {
        showToast('Setting new avatar...', 'info');
        try {
            const response = await fetch('/api/user/avatar', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ avatarUrl })
            });

            if (!response.ok) {
                const errData = await response.json();
                throw new Error(errData.error || 'Failed to set avatar.');
            }
            
            const result = await response.json();
            previewImg.src = result.newAvatarUrl;
            if(headerAvatar) headerAvatar.src = result.newAvatarUrl;
            showToast('Avatar updated successfully!', 'success');

        } catch (error) {
            console.error(error);
            showToast(error.message, 'danger');
        }
    }
    
    // --- 3. Handle File Input and Upload ---
    fileInput.addEventListener('change', () => {
        const file = fileInput.files[0];
        if (file) {
            // Validate file type and size
            const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
            if (!allowedTypes.includes(file.type)) {
                showToast('Invalid file type. Please select a JPG, PNG, GIF, or WEBP file.', 'danger');
                fileInput.value = '';
                return;
            }
            if (file.size > 5 * 1024 * 1024) { // 5 MB limit
                showToast('File is too large. Maximum size is 5MB.', 'danger');
                fileInput.value = '';
                return;
            }
            
            selectedFile = file;
            uploadBtn.disabled = false;
            // Show a preview of the selected file
            const reader = new FileReader();
            reader.onload = (e) => { previewImg.src = e.target.result; };
            reader.readAsDataURL(file);
        } else {
            selectedFile = null;
            uploadBtn.disabled = true;
        }
    });

    uploadBtn.addEventListener('click', async () => {
        if (!selectedFile) return;

        uploadBtn.disabled = true;
        uploadBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Uploading...';

        const formData = new FormData();
        formData.append('image', selectedFile);

        try {
            // Use the existing pro-images upload endpoint
            const uploadResponse = await fetch('/api/pro-images/upload', {
                method: 'POST',
                body: formData,
            });

            if (!uploadResponse.ok) {
                 const errData = await uploadResponse.json();
                throw new Error(errData.error || 'Upload failed.');
            }
            const uploadResult = await uploadResponse.json();
            
            // Now, set the uploaded image URL as the avatar
            await handleSetAvatar(uploadResult.url);
            
            // Refresh the gallery to show the new image
            await loadUserImages();
            
        } catch (error) {
            console.error(error);
            showToast(error.message, 'danger');
        } finally {
            uploadBtn.disabled = true; // Disable until a new file is chosen
            uploadBtn.innerHTML = '<i class="fas fa-check"></i> Lưu Ảnh Này';
            fileInput.value = ''; // Reset file input
            selectedFile = null;
        }
    });

    // --- Simple Toast Notification ---
    function showToast(message, type = 'success', duration = 3000) {
        const existingToast = document.querySelector('.admin-toast');
        if(existingToast) existingToast.remove();

        const toast = document.createElement('div');
        toast.className = `admin-toast ${type}`;
        toast.textContent = message;
        document.body.appendChild(toast);
        
        setTimeout(() => toast.classList.add('show'), 10);
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 500);
        }, duration);
    }
    
    // Initial Load
    loadUserImages();
});