// public/js/admin.js

document.addEventListener('DOMContentLoaded', () => {
    // --- State and Configuration ---
    const searchInputs = {
        users: document.getElementById('user-search-input'),
        proKeys: document.getElementById('pro-keys-search-input'),
    };
    const filterSelects = {
        users: {
            isPro: document.getElementById('user-pro-filter'),
            isBanned: document.getElementById('user-banned-filter'),
        }
    };
    const tabLoadFunctions = {
        dashboard: loadDashboard,
        users: () => loadUsers(1),
        proKeys: () => loadProKeys(1),
        subjects: loadSubjects,
        system: () => {}, 
    };
    
    // --- Toast & API Utilities ---
    function showToast(message, type = 'success') {
        const container = document.getElementById('toast-container');
        if (!container) return;
        
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;
        container.appendChild(toast);
        
        setTimeout(() => {
            toast.classList.add('show');
            setTimeout(() => {
                toast.classList.remove('show');
                toast.addEventListener('transitionend', () => toast.remove());
            }, 3000);
        }, 100);
    }

    async function apiFetch(url, options = {}) {
        try {
            const response = await fetch(`/admin${url}`, options);
            if (response.status === 204) return response;

            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.error || `HTTP error! status: ${response.status}`);
            }
            return data;
        } catch (error) {
            console.error('API Fetch Error:', error);
            showToast(error.message, 'danger');
            throw error;
        }
    }

    // --- Generic UI Helpers ---
    const createTableLoader = (tbody) => {
        if (!tbody) return;
        const cols = tbody.previousElementSibling?.firstElementChild?.childElementCount || 5;
        tbody.innerHTML = `<tr><td colspan="${cols}" class="loader-cell"><div class="loader"></div></td></tr>`;
    };
    const timeAgo = (dateString) => {
        if (!dateString) return 'N/A';
        const date = new Date(dateString);
        const seconds = Math.floor((new Date() - date) / 1000);
        let interval = seconds / 31536000;
        if (interval > 1) return Math.floor(interval) + " năm trước";
        interval = seconds / 2592000;
        if (interval > 1) return Math.floor(interval) + " tháng trước";
        interval = seconds / 86400;
        if (interval > 1) return Math.floor(interval) + " ngày trước";
        interval = seconds / 3600;
        if (interval > 1) return Math.floor(interval) + " giờ trước";
        interval = seconds / 60;
        if (interval > 1) return Math.floor(interval) + " phút trước";
        return Math.floor(seconds) + " giây trước";
    };

    // --- Pagination Renderer ---
    function renderPagination(containerId, currentPage, totalPages, onPageClick) {
        const container = document.getElementById(containerId);
        if (!container) return;
        container.innerHTML = '';
        if (totalPages <= 1) return;

        const createBtn = (text, page, isDisabled = false, isActive = false) => {
            const btn = document.createElement('button');
            btn.innerHTML = text;
            btn.className = 'pagination-btn';
            if (isActive) btn.classList.add('active');
            btn.disabled = isDisabled;
            btn.onclick = () => onPageClick(page);
            return btn;
        };

        container.appendChild(createBtn('«', currentPage - 1, currentPage === 1));
        for (let i = 1; i <= totalPages; i++) {
            container.appendChild(createBtn(i, i, false, currentPage === i));
        }
        container.appendChild(createBtn('»', currentPage + 1, currentPage === totalPages));
    }
    
    // --- Data Loading Functions ---
    async function loadDashboard() {
        try {
            const grid = document.getElementById('stats-grid');
            grid.innerHTML = Array(8).fill(0).map(() => `<div class="stat-card loader"></div>`).join('');
            
            const data = await apiFetch('/api/stats');
            
            grid.innerHTML = `
                <div class="stat-card"><div class="stat-title"><i class="fas fa-users stat-icon"></i>Tổng User</div><div class="stat-value">${data.totalUsers}</div></div>
                <div class="stat-card"><div class="stat-title"><i class="fas fa-crown stat-icon"></i>User PRO</div><div class="stat-value">${data.proUsers}</div></div>
                <div class="stat-card"><div class="stat-title"><i class="fas fa-user-slash stat-icon"></i>User bị khóa</div><div class="stat-value">${data.bannedUsers}</div></div>
                <div class="stat-card"><div class="stat-title"><i class="fas fa-book-open stat-icon"></i>Tổng bài học</div><div class="stat-value">${data.totalLessons}</div></div>
                <div class="stat-card"><div class="stat-title"><i class="fas fa-newspaper stat-icon"></i>Tổng tin tức</div><div class="stat-value">${data.totalNews}</div></div>
                <div class="stat-card"><div class="stat-title"><i class="fas fa-shapes stat-icon"></i>Tổng môn học</div><div class="stat-value">${data.totalSubjects}</div></div>
                <div class="stat-card"><div class="stat-title"><i class="fas fa-chart-line stat-icon"></i>Tổng lượt truy cập</div><div class="stat-value">${data.totalVisits}</div></div>
                <div class="stat-card"><div class="stat-title"><i class="fas fa-calendar-day stat-icon"></i>Truy cập hôm nay</div><div class="stat-value">${data.dailyVisits}</div></div>
            `;
            
            const recentUsersList = document.getElementById('recent-users-list');
            recentUsersList.innerHTML = data.recentUsers.map(u => `<li><span>${u.isPro ? '👑' : ''} ${u.username}</span> <span class="time-since">${timeAgo(u.createdAt)}</span></li>`).join('');
            
            const recentLessonsList = document.getElementById('recent-lessons-list');
            recentLessonsList.innerHTML = data.recentLessons.map(l => `<li><span>${l.title}</span> <span class="time-since">bởi ${l.createdBy?.username || 'N/A'}</span></li>`).join('');
        } catch(e) { /* Error already handled by apiFetch */ }
    }

    async function loadUsers(page = 1) {
        const tbody = document.getElementById('users-table-body');
        createTableLoader(tbody);
        try {
            const search = searchInputs.users.value;
            const isPro = filterSelects.users.isPro.value;
            const isBanned = filterSelects.users.isBanned.value;
            const data = await apiFetch(`/api/users?page=${page}&search=${search}&isPro=${isPro}&isBanned=${isBanned}`);
            
            tbody.innerHTML = data.users.map(u => {
                let role = 'User';
                if (u.isAdmin) role = 'Admin';
                else if (u.isTeacher) role = 'Teacher';

                // Logic to disable ban/unban buttons based on hierarchy
                let canManage = false;
                if (currentUser.isAdmin) {
                    canManage = !u.isAdmin; // Admin can ban/unban anyone except another Admin
                } else if (currentUser.isTeacher) {
                    canManage = !u.isAdmin && !u.isTeacher; // Teacher can only ban/unban regular users
                }

                return `
                <tr data-id="${u._id}" data-info='${JSON.stringify(u)}'>
                    <td><strong>${u.username}</strong></td>
                    <td>${role}</td>
                    <td><span class="status-tag ${u.isPro ? 'pro' : ''}">${u.isPro ? 'Có' : 'Không'}</span></td>
                    <td>${u.points || 0}</td>
                    <td><span class="status-tag ${u.isBanned ? 'banned' : 'active'}">${u.isBanned ? 'Khóa' : 'Hoạt động'}</span></td>
                    <td>${new Date(u.createdAt).toLocaleDateString()}</td>
                    <td>
                        <button class="action-btn primary edit-user-btn" title="Sửa"><i class="fas fa-edit"></i></button>
                        ${u.isBanned 
                            ? `<button class="action-btn success unban-user-btn" title="Mở khóa" ${!canManage ? 'disabled' : ''}><i class="fas fa-unlock"></i></button>` 
                            : `<button class="action-btn danger ban-user-btn" title="Khóa" ${!canManage ? 'disabled' : ''}><i class="fas fa-gavel"></i></button>`
                        }
                    </td>
                </tr>`;
            }).join('');
            renderPagination('users-pagination', data.page, data.pages, loadUsers);
        } catch (e) { tbody.innerHTML = `<tr><td colspan="7" class="text-danger text-center">Failed to load users.</td></tr>`;}
    }

    async function loadProKeys(page = 1) {
        const tbody = document.getElementById('pro-keys-table-body');
        createTableLoader(tbody);
        try {
            const search = searchInputs.proKeys.value;
            const data = await apiFetch(`/api/users/pro-keys?page=${page}&search=${search}`);
            tbody.innerHTML = data.users.map(u => `
                <tr data-id="${u._id}" data-username="${u.username}">
                    <td><strong>${u.username}</strong></td>
                    <td><code class="secret-key-code">${u.proSecretKey || 'N/A'}</code></td>
                    <td>
                        <button class="action-btn copy-key-btn" data-key="${u.proSecretKey || ''}" title="Sao chép"><i class="fas fa-copy"></i></button>
                        <button class="action-btn warning regenerate-key-btn" title="Tạo lại khóa"><i class="fas fa-sync-alt"></i></button>
                    </td>
                </tr>`).join('');
            renderPagination('pro-keys-pagination', data.page, data.pages, loadProKeys);
        } catch(e) { tbody.innerHTML = `<tr><td colspan="3" class="text-danger text-center">Failed to load PRO keys.</td></tr>`; }
    }
    
    async function loadSubjects() {
        const tbody = document.getElementById('subjects-table-body');
        createTableLoader(tbody);
        try {
            const subjects = await apiFetch('/api/subjects');
            tbody.innerHTML = subjects.map(s => `
                <tr data-id="${s._id}" data-info='${JSON.stringify(s)}'>
                    <td><strong>${s.name}</strong></td>
                    <td>${s.description || 'N/A'}</td>
                    <td>${s.image ? `<a href="${s.image}" target="_blank" rel="noopener noreferrer">Xem ảnh</a>` : 'N/A'}</td>
                    <td>
                        <button class="action-btn danger delete-subject-btn" title="Xóa"><i class="fas fa-trash"></i></button>
                    </td>
                </tr>`).join('');
        } catch(e) { tbody.innerHTML = `<tr><td colspan="4" class="text-danger text-center">Failed to load subjects.</td></tr>`; }
    }

    // --- Main Event Delegation for Actions ---
    document.querySelector('.main-content').addEventListener('click', async (e) => {
        const btn = e.target.closest('.action-btn');
        if (!btn || btn.disabled) return;

        const row = e.target.closest('tr');
        const id = row?.dataset.id;
        
        if (btn.classList.contains('edit-user-btn')) {
            openUserEditModal(JSON.parse(row.dataset.info));
        } else if (btn.classList.contains('ban-user-btn')) {
            if (confirm('Bạn chắc chắn muốn khóa người dùng này?')) {
                await apiFetch(`/api/users/${id}/ban`, { method: 'POST' }).then(() => loadUsers(1));
            }
        } else if (btn.classList.contains('unban-user-btn')) {
            await apiFetch(`/api/users/${id}/unban`, { method: 'POST' }).then(() => loadUsers(1));
        } else if (btn.classList.contains('delete-subject-btn')) {
             if (confirm('Bạn chắc chắn muốn xóa môn học này? Hành động này không thể hoàn tác.')) {
                await apiFetch(`/api/subjects/${id}`, { method: 'DELETE' }).then(loadSubjects);
            }
        } else if (btn.classList.contains('copy-key-btn')) {
            navigator.clipboard.writeText(btn.dataset.key).then(() => showToast('Đã sao chép khóa!'));
        } else if (btn.classList.contains('regenerate-key-btn')) {
            if (confirm(`Tạo khóa mới cho ${row.dataset.username}? Khóa cũ của họ sẽ không còn hoạt động.`)) {
                await apiFetch(`/api/users/${id}/regenerate-key`, { method: 'POST' }).then(() => loadProKeys(1));
            }
        }
    });

    document.getElementById('trigger-ai-btn')?.addEventListener('click', async () => {
        if(confirm('Hành động này sẽ bắt đầu job tạo nội dung AI dưới nền. Tiếp tục?')) {
            await apiFetch('/api/trigger-ai-post', { method: 'POST' }).then(data => {
                if (data.success) showToast(data.message, 'success');
            });
        }
    });

    // --- Modal Logic ---
    const modals = { 
        user: document.getElementById('user-edit-modal'), 
        subject: document.getElementById('subject-edit-modal') 
    };
    const openModal = (modal) => modal?.classList.add('active');
    const closeModal = (modal) => modal?.classList.remove('active');

    Object.values(modals).forEach(modal => {
        if (!modal) return;
        modal.querySelector('.modal-close-btn').onclick = () => closeModal(modal);
        modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(modal); });
    });
    
    function openUserEditModal(user) {
        const modal = modals.user;
        const isTeacherSelect = modal.querySelector('#modal-isTeacher');
        const isProSelect = modal.querySelector('#modal-isPro');

        // Logic phân quyền: Chỉ Admin mới được sửa vai trò và PRO
        isTeacherSelect.disabled = !currentUser.isAdmin;
        isProSelect.disabled = !currentUser.isAdmin;

        modal.querySelector('#modal-userid').value = user._id;
        modal.querySelector('#modal-username').textContent = user.username;
        modal.querySelector('#modal-avatar').value = user.avatar || '';
        isProSelect.value = user.isPro.toString();
        isTeacherSelect.value = user.isTeacher?.toString() || 'false';
        modal.querySelector('#modal-points').value = user.points || 0;
        modal.querySelector('#modal-growthPoints').value = user.growthPoints || 0;
        openModal(modal);
    }
    
    document.getElementById('add-subject-btn').onclick = () => openSubjectEditModal();

    function openSubjectEditModal(subject = null) {
        const modal = modals.subject;
        const form = modal.querySelector('form');
        form.reset();
        modal.querySelector('#modal-subject-title').textContent = subject ? 'Sửa môn học' : 'Thêm môn học mới';
        form.querySelector('#modal-subject-id').value = subject ? subject._id : '';
        if (subject) {
            form.querySelector('#modal-subject-name').value = subject.name;
            form.querySelector('#modal-subject-description').value = subject.description;
            form.querySelector('#modal-subject-image').value = subject.image;
        }
        openModal(modal);
    }
    
    document.getElementById('user-edit-form').onsubmit = async (e) => {
        e.preventDefault();
        const id = e.target.querySelector('#modal-userid').value;
        const isTeacherSelect = e.target.querySelector('#modal-isTeacher');
        const isProSelect = e.target.querySelector('#modal-isPro');

        const data = {
            avatar: e.target.querySelector('#modal-avatar').value,
            points: e.target.querySelector('#modal-points').value,
            growthPoints: e.target.querySelector('#modal-growthPoints').value
        };

        // Chỉ thêm các trường phân quyền vào payload nếu chúng không bị vô hiệu hóa
        if (!isTeacherSelect.disabled) data.isTeacher = isTeacherSelect.value;
        if (!isProSelect.disabled) data.isPro = isProSelect.value;

        await apiFetch(`/api/users/${id}/update`, { 
            method: 'POST', 
            headers: {'Content-Type': 'application/json'}, 
            body: JSON.stringify(data) 
        });
        closeModal(modals.user);
        loadUsers(1);
    };

    document.getElementById('subject-edit-form').onsubmit = async (e) => {
        e.preventDefault();
        const data = {
            name: e.target.querySelector('#modal-subject-name').value,
            description: e.target.querySelector('#modal-subject-description').value,
            image: e.target.querySelector('#modal-subject-image').value
        };
        await apiFetch('/api/subjects', {
            method: 'POST', 
            headers: {'Content-Type': 'application/json'}, 
            body: JSON.stringify(data) 
        });
        closeModal(modals.subject);
        loadSubjects();
    };

    // --- Tab Navigation & Initial Load ---
    const sidebarLinks = document.querySelectorAll('.sidebar-nav .nav-link');
    const tabContents = document.querySelectorAll('.main-content .tab-content');

    function switchTab(tabId, pushState = true) {
        tabId = tabId || 'dashboard';
        
        // Ngăn Teacher truy cập tab của Admin
        if (!currentUser.isAdmin && (tabId === 'proKeys' || tabId === 'system')) {
            showToast('Bạn không có quyền truy cập khu vực này.', 'warning');
            tabId = 'dashboard'; // Chuyển về dashboard
            pushState = true; // Cập nhật lại URL cho đúng
        }

        if (!tabLoadFunctions[tabId]) tabId = 'dashboard';

        sidebarLinks.forEach(link => link.classList.toggle('active', link.dataset.tab === tabId));
        tabContents.forEach(tab => tab.classList.toggle('active', tab.id === tabId));
        
        if (tabLoadFunctions[tabId]) tabLoadFunctions[tabId]();
        if (pushState) history.pushState({ tab: tabId }, '', `#${tabId}`);
    }

    sidebarLinks.forEach(link => link.addEventListener('click', (e) => {
        e.preventDefault();
        switchTab(link.dataset.tab);
    }));
    window.addEventListener('popstate', (e) => {
        switchTab(e.state?.tab || window.location.hash.substring(1) || 'dashboard', false);
    });
    
    // --- Attaching Search and Filter Listeners ---
    let debounceTimeout;
    Object.values(searchInputs).forEach(input => {
        if (input) {
            input.addEventListener('input', () => {
                clearTimeout(debounceTimeout);
                debounceTimeout = setTimeout(() => {
                    const activeTabId = document.querySelector('.tab-content.active')?.id;
                    if(activeTabId && tabLoadFunctions[activeTabId]) {
                        tabLoadFunctions[activeTabId](1);
                    }
                }, 400);
            });
        }
    });

    Object.values(filterSelects.users).forEach(select => {
        if (select) select.addEventListener('change', () => loadUsers(1));
    });

    // --- Initial Load ---
    switchTab(window.location.hash.substring(1) || 'dashboard', false);
});