document.addEventListener('DOMContentLoaded', () => {
    // --- Chart.js and Moment.js are loaded via CDN in the EJS file ---
    let userChart = null; 

    // --- State and Configuration ---
    const searchInputs = {
        users: document.getElementById('user-search-input'),
        lessons: document.getElementById('lesson-search-input'),
        news: document.getElementById('news-search-input'),
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
        system: () => {}, // No initial load needed
    };
    
    // --- Toast & API Utilities ---
    function showToast(message, type = 'success') {
        const container = document.getElementById('toast-container');
        if (!container) {
            const tempContainer = document.createElement('div');
            tempContainer.id = 'toast-container';
            document.body.appendChild(tempContainer);
        }
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;
        document.getElementById('toast-container').appendChild(toast);
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
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ error: 'An unknown server error occurred.' }));
                throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
            }
            if (options.method === 'DELETE' || response.status === 204) return response;
            return response.json();
        } catch (error) {
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
        if (interval > 1) return Math.floor(interval) + " years ago";
        interval = seconds / 2592000;
        if (interval > 1) return Math.floor(interval) + " months ago";
        interval = seconds / 86400;
        if (interval > 1) return Math.floor(interval) + " days ago";
        interval = seconds / 3600;
        if (interval > 1) return Math.floor(interval) + " hours ago";
        interval = seconds / 60;
        if (interval > 1) return Math.floor(interval) + " minutes ago";
        return Math.floor(seconds) + " seconds ago";
    };

    // --- Pagination Renderer ---
    function renderPagination(containerId, currentPage, totalPages, onPageClick) {
        const container = document.getElementById(containerId);
        if(!container) return;
        container.innerHTML = '';
        if (totalPages <= 1) return;
        const createBtn = (text, page, isDisabled = false) => {
            const btn = document.createElement('button');
            btn.innerHTML = text;
            btn.className = 'pagination-btn';
            btn.disabled = isDisabled;
            if (currentPage === page) btn.classList.add('active');
            btn.onclick = () => onPageClick(page);
            return btn;
        };
        container.appendChild(createBtn('«', currentPage - 1, currentPage === 1));
        for (let i = 1; i <= totalPages; i++) container.appendChild(createBtn(i, i));
        container.appendChild(createBtn('»', currentPage + 1, currentPage === totalPages));
    }
    
    // --- Data Loading Functions ---
    async function loadDashboard() {
        try {
            const grid = document.getElementById('stats-grid');
            grid.innerHTML = Array(8).fill(0).map(() => `<div class="stat-card loader"></div>`).join('');
            const data = await apiFetch('/api/stats');
            grid.innerHTML = `
                <div class="stat-card"><div class="stat-title"><i class="fas fa-users stat-icon"></i>Total Users</div><div class="stat-value">${data.totalUsers}</div></div>
                <div class="stat-card"><div class="stat-title"><i class="fas fa-crown stat-icon"></i>PRO Users</div><div class="stat-value">${data.proUsers}</div></div>
                <div class="stat-card"><div class="stat-title"><i class="fas fa-user-slash stat-icon"></i>Banned</div><div class="stat-value">${data.bannedUsers}</div></div>
                <div class="stat-card"><div class="stat-title"><i class="fas fa-book-open stat-icon"></i>Lessons</div><div class="stat-value">${data.totalLessons}</div></div>
                <div class="stat-card"><div class="stat-title"><i class="fas fa-newspaper stat-icon"></i>News</div><div class="stat-value">${data.totalNews}</div></div>
                 <div class="stat-card"><div class="stat-title"><i class="fas fa-shapes stat-icon"></i>Subjects</div><div class="stat-value">${data.totalSubjects}</div></div>
                <div class="stat-card"><div class="stat-title"><i class="fas fa-chart-line stat-icon"></i>Total Visits</div><div class="stat-value">${data.totalVisits}</div></div>
                <div class="stat-card"><div class="stat-title"><i class="fas fa-calendar-day stat-icon"></i>Visits Today</div><div class="stat-value">${data.dailyVisits}</div></div>
            `;
            const recentUsersList = document.getElementById('recent-users-list');
            recentUsersList.innerHTML = data.recentUsers.map(u => `<li><span>${u.isPro ? '👑' : ''} ${u.username}</span> <span class="time-since">${timeAgo(u.createdAt)}</span></li>`).join('');
            const recentLessonsList = document.getElementById('recent-lessons-list');
            recentLessonsList.innerHTML = data.recentLessons.map(l => `<li><span>${l.title}</span> <span class="time-since">by ${l.createdBy?.username || 'N/A'}</span></li>`).join('');
        } catch(e) {}
    }

    async function loadUsers(page = 1) {
        const tbody = document.getElementById('users-table-body');
        createTableLoader(tbody);
        const search = searchInputs.users.value;
        const isPro = filterSelects.users.isPro.value;
        const isBanned = filterSelects.users.isBanned.value;
        const data = await apiFetch(`/api/users?page=${page}&search=${search}&isPro=${isPro}&isBanned=${isBanned}`);
        tbody.innerHTML = data.users.map(u => `
            <tr data-id="${u._id}" data-info='${JSON.stringify(u)}'>
                <td><strong>${u.username}</strong></td>
                <td><img src="${u.avatar || 'https://cdn.glitch.global/b34fd7c6-dd60-4242-a917-992503c79a1f/7915522.png?v=1745082805191'}" alt="avatar" class="table-avatar"></td>
                <td>${u.email || 'N/A'}</td>
                <td><span class="status-tag pro">${u.isPro ? 'Yes' : 'No'}</span></td>
                <td>${u.points}</td>
                <td><span class="status-tag ${u.isBanned ? 'banned' : 'active'}">${u.isBanned ? 'Banned' : 'Active'}</span></td>
                <td>${new Date(u.createdAt).toLocaleDateString()}</td>
                <td>
                    <button class="action-btn primary edit-user-btn" title="Edit"><i class="fas fa-edit"></i></button>
                    ${u.isBanned ? `<button class="action-btn success unban-user-btn" title="Unban"><i class="fas fa-unlock"></i></button>` : `<button class="action-btn danger ban-user-btn" title="Ban"><i class="fas fa-gavel"></i></button>`}
                </td>
            </tr>`).join('');
        renderPagination('users-pagination', data.page, data.pages, (p) => loadUsers(p));
    }

    async function loadProKeys(page = 1) {
        const tbody = document.getElementById('pro-keys-table-body');
        createTableLoader(tbody);
        const search = searchInputs.proKeys.value;
        const data = await apiFetch(`/api/users/pro-keys?page=${page}&search=${search}`);
        tbody.innerHTML = data.users.map(u => `
            <tr data-id="${u._id}" data-username="${u.username}">
                <td><strong>${u.username}</strong></td>
                <td><code class="secret-key-code">${u.proSecretKey || 'N/A'}</code></td>
                <td>
                    <button class="action-btn copy-key-btn" data-key="${u.proSecretKey || ''}" title="Copy"><i class="fas fa-copy"></i></button>
                    <button class="action-btn warning regenerate-key-btn" title="Regenerate Key"><i class="fas fa-sync-alt"></i></button>
                </td>
            </tr>`).join('');
        renderPagination('pro-keys-pagination', data.page, data.pages, (p) => loadProKeys(p));
    }
    
    async function loadSubjects() {
        const tbody = document.getElementById('subjects-table-body');
        createTableLoader(tbody);
        const subjects = await apiFetch('/api/subjects');
        tbody.innerHTML = subjects.map(s => `
            <tr data-id="${s._id}">
                <td><strong>${s.name}</strong></td>
                <td>${s.description || 'N/A'}</td>
                <td>${s.image ? `<a href="${s.image}" target="_blank">View</a>` : 'N/A'}</td>
                <td><button class="action-btn danger delete-subject-btn" title="Delete"><i class="fas fa-trash"></i></button></td>
            </tr>`).join('');
    }

    // --- Main Event Delegation for Actions ---
    document.querySelector('.main-content').addEventListener('click', async (e) => {
        const btn = e.target.closest('.action-btn');
        if (!btn) return;
        const row = e.target.closest('tr');
        const id = row?.dataset.id;
        
        if (btn.classList.contains('edit-user-btn')) openUserEditModal(JSON.parse(row.dataset.info));
        else if (btn.classList.contains('ban-user-btn') && confirm('Ban this user?')) await apiFetch(`/api/users/${id}/ban`, { method: 'POST' }).then(() => loadUsers(1, searchInputs.users.value));
        else if (btn.classList.contains('unban-user-btn')) await apiFetch(`/api/users/${id}/unban`, { method: 'POST' }).then(() => loadUsers(1, searchInputs.users.value));
        else if (btn.classList.contains('delete-subject-btn') && confirm('Delete subject?')) await apiFetch(`/api/subjects/${id}`, { method: 'DELETE' }).then(loadSubjects);
        else if (btn.classList.contains('copy-key-btn')) navigator.clipboard.writeText(btn.dataset.key).then(() => showToast('Key copied!'));
        else if (btn.classList.contains('regenerate-key-btn') && confirm(`Generate new key for ${row.dataset.username}?`)) await apiFetch(`/api/users/${id}/regenerate-key`, { method: 'POST' }).then(() => loadProKeys(1, searchInputs.proKeys.value));
    });

    document.getElementById('trigger-ai-btn')?.addEventListener('click', async () => {
        if(confirm('Trigger AI content generation job?')) await apiFetch('/api/trigger-ai-post', { method: 'POST' });
    });

    // --- Modal Logic ---
    const modals = { user: document.getElementById('user-edit-modal'), subject: document.getElementById('subject-edit-modal') };
    const openModal = (modal) => modal?.classList.add('active');
    const closeModal = (modal) => modal?.classList.remove('active');
    Object.values(modals).forEach(modal => {
        if (!modal) return;
        modal.querySelector('.modal-close-btn').onclick = () => closeModal(modal);
        modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(modal); });
    });
    
    function openUserEditModal(user) {
        const modal = modals.user;
        modal.querySelector('#modal-userid').value = user._id;
        modal.querySelector('#modal-username').textContent = user.username;
        modal.querySelector('#modal-avatar').value = user.avatar || '';
        modal.querySelector('#modal-isPro').value = user.isPro.toString();
        modal.querySelector('#modal-points').value = user.points || 0;
        modal.querySelector('#modal-growthPoints').value = user.growthPoints || 0;
        openModal(modal);
    }
    document.getElementById('add-subject-btn').onclick = () => openSubjectEditModal();

    function openSubjectEditModal(subject = null) {
        const modal = modals.subject;
        const form = modal.querySelector('form');
        form.reset();
        // CORRECTED: Use modal.querySelector instead of form.querySelector for the title
        modal.querySelector('#modal-subject-title').textContent = subject ? 'Edit Subject' : 'Add New Subject';
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
        const data = {
            avatar: e.target.querySelector('#modal-avatar').value,
            isPro: e.target.querySelector('#modal-isPro').value,
            points: e.target.querySelector('#modal-points').value,
            growthPoints: e.target.querySelector('#modal-growthPoints').value
        };
        await apiFetch(`/api/users/${id}/update`, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(data) });
        closeModal(modals.user);
        loadUsers(1, searchInputs.users.value);
    };

    document.getElementById('subject-edit-form').onsubmit = async (e) => {
        e.preventDefault();
        const data = {
            name: e.target.querySelector('#modal-subject-name').value,
            description: e.target.querySelector('#modal-subject-description').value,
            image: e.target.querySelector('#modal-subject-image').value
        };
        await apiFetch('/api/subjects', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(data) });
        closeModal(modals.subject);
        loadSubjects();
    };

    // --- Tab Navigation & Initial Load ---
    const sidebarLinks = document.querySelectorAll('.sidebar-nav .nav-link');
    const tabContents = document.querySelectorAll('.main-content .tab-content');

    function switchTab(tabId, pushState = true) {
        if (!tabId || !tabLoadFunctions[tabId]) tabId = 'dashboard';
        sidebarLinks.forEach(link => link.classList.toggle('active', link.dataset.tab === tabId));
        tabContents.forEach(tab => tab.classList.toggle('active', tab.id === tabId));
        if (tabLoadFunctions[tabId]) tabLoadFunctions[tabId]();
        if (pushState) history.pushState({ tab: tabId }, '', `#${tabId}`);
    }

    sidebarLinks.forEach(link => link.addEventListener('click', (e) => {
        e.preventDefault();
        switchTab(link.dataset.tab);
    }));
    window.addEventListener('popstate', () => switchTab(window.location.hash.substring(1) || 'dashboard', false));
    
    // --- Attaching Search and Filter Listeners ---
    let debounceTimeout;
    Object.values(searchInputs).forEach(input => {
        if (input) {
            input.addEventListener('input', () => {
                clearTimeout(debounceTimeout);
                debounceTimeout = setTimeout(() => {
                    const activeTab = document.querySelector('.tab-content.active').id;
                    if(tabLoadFunctions[activeTab]) tabLoadFunctions[activeTab](1);
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