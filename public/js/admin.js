document.addEventListener('DOMContentLoaded', () => {
    let userChart = null; // To hold the Chart.js instance

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
        lessons: () => loadLessons(1),
        news: () => loadNews(1),
        proKeys: () => loadProKeys(1),
        subjects: loadSubjects,
        bans: loadBans,
        'system-actions': () => {}, // No initial load needed
        'system-logs': loadLogs
    };

    // --- Toast & API Utilities ---
    function showToast(message, type = 'success') {
        const toastContainer = document.body;
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;
        toastContainer.appendChild(toast);
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
        const grid = document.getElementById('stats-grid');
        grid.innerHTML = Array(7).fill(0).map(() => `<div class="stat-card loader"></div>`).join('');
        const data = await apiFetch('/api/stats');
        grid.innerHTML = `
            <div class="stat-card"><div class="stat-title"><i class="fas fa-users stat-icon"></i>Total Users</div><div class="stat-value">${data.totalUsers}</div></div>
            <div class="stat-card"><div class="stat-title"><i class="fas fa-crown stat-icon"></i>PRO Users</div><div class="stat-value">${data.proUsers}</div></div>
            <div class="stat-card"><div class="stat-title"><i class="fas fa-user-slash stat-icon"></i>Banned</div><div class="stat-value">${data.bannedUsers}</div></div>
            <div class="stat-card"><div class="stat-title"><i class="fas fa-book-open stat-icon"></i>Lessons</div><div class="stat-value">${data.totalLessons}</div></div>
            <div class="stat-card"><div class="stat-title"><i class="fas fa-newspaper stat-icon"></i>News</div><div class="stat-value">${data.totalNews}</div></div>
            <div class="stat-card"><div class="stat-title"><i class="fas fa-chart-line stat-icon"></i>Total Visits</div><div class="stat-value">${data.totalVisits}</div></div>
            <div class="stat-card"><div class="stat-title"><i class="fas fa-calendar-day stat-icon"></i>Visits Today</div><div class="stat-value">${data.dailyVisits}</div></div>
        `;
        renderUserChart(data.userRegistrationData);
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
                <td><span class="status-tag pro">${u.isPro ? 'Yes' : 'No'}</span></td>
                <td>${u.points}</td>
                <td><span class="status-tag ${u.isBanned ? 'banned' : 'active'}">${u.isBanned ? 'Banned' : 'Active'}</span></td>
                <td>${new Date(u.createdAt).toLocaleDateString()}</td>
                <td>
                    <button class="action-btn primary edit-user-btn" title="Edit"><i class="fas fa-edit"></i></button>
                    ${u.isBanned ? `<button class="action-btn success unban-user-btn" title="Unban"><i class="fas fa-unlock"></i></button>` : `<button class="action-btn danger ban-user-btn" title="Ban"><i class="fas fa-gavel"></i></button>`}
                </td>
            </tr>`).join('');
        renderPagination('users-pagination', data.page, data.pages, loadUsers);
    }
    
    async function loadLessons(page = 1) {
        const tbody = document.getElementById('lessons-table-body');
        createTableLoader(tbody);
        const search = searchInputs.lessons.value;
        const data = await apiFetch(`/api/lessons?page=${page}&search=${search}`);
        tbody.innerHTML = data.lessons.map(l => `
            <tr data-id="${l._id}">
                <td>${l.title}</td>
                <td>${l.subject?.name || 'N/A'}</td>
                <td>${l.type}</td>
                <td>${l.createdBy?.username || 'N/A'}</td>
                <td>${new Date(l.createdAt).toLocaleDateString()}</td>
                <td><button class="action-btn danger delete-lesson-btn" title="Delete"><i class="fas fa-trash"></i></button></td>
            </tr>`).join('');
        renderPagination('lessons-pagination', data.page, data.pages, loadLessons);
    }

    async function loadNews(page = 1) {
        const tbody = document.getElementById('news-table-body');
        createTableLoader(tbody);
        const search = searchInputs.news.value;
        const data = await apiFetch(`/api/news?page=${page}&search=${search}`);
        tbody.innerHTML = data.newsItems.map(n => `
            <tr data-id="${n._id}">
                <td>${n.title}</td>
                <td>${n.category}</td>
                <td>${n.postedBy?.username || 'N/A'}</td>
                <td>${new Date(n.createdAt).toLocaleDateString()}</td>
                <td><button class="action-btn danger delete-news-btn" title="Delete"><i class="fas fa-trash"></i></button></td>
            </tr>`).join('');
        renderPagination('news-pagination', data.page, data.pages, loadNews);
    }

    async function loadProKeys(page = 1) {
        const tbody = document.getElementById('pro-keys-table-body');
        createTableLoader(tbody);
        const search = searchInputs.proKeys.value;
        const data = await apiFetch(`/api/pro-keys?page=${page}&search=${search}`);
        tbody.innerHTML = data.users.map(u => `
            <tr>
                <td><strong>${u.username}</strong></td>
                <td><span class="status-tag pro">${u.isPro ? 'Yes' : 'No'}</span></td>
                <td><code class="secret-key-code">${u.proSecretKey || 'N/A'}</code></td>
                <td><button class="action-btn copy-key-btn" data-key="${u.proSecretKey || ''}" title="Copy"><i class="fas fa-copy"></i></button></td>
            </tr>`).join('');
        renderPagination('pro-keys-pagination', data.page, data.pages, loadProKeys);
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

    async function loadBans() {
        const tbody = document.getElementById('bans-table-body');
        createTableLoader(tbody);
        const bans = await apiFetch('/api/bans');
        tbody.innerHTML = bans.map(b => `
            <tr data-id="${b._id}">
                <td>${b.ip}</td>
                <td>${b.userAgent}</td>
                <td>${new Date(b.bannedAt).toLocaleString()}</td>
                <td><button class="action-btn danger delete-ban-btn" title="Remove Ban"><i class="fas fa-trash"></i></button></td>
            </tr>`).join('');
    }

    async function loadLogs() {
        const logViewer = document.getElementById('log-viewer');
        logViewer.innerHTML = '<div class="loader-cell"><div class="loader"></div></div>';
        const logs = await apiFetch('/api/logs');
        logViewer.innerHTML = logs.map(l => `
            <div class="log-entry">
                <span class="log-timestamp">${new Date(l.timestamp).toLocaleString()}</span>
                <span class="log-level ${l.level}">${l.level}</span>
                <span class="log-message">${l.message}</span>
            </div>`).join('');
        logViewer.scrollTop = logViewer.scrollHeight;
    }
    
    // --- Chart.js ---
    function renderUserChart(registrationData) {
        const ctx = document.getElementById('user-registration-chart').getContext('2d');
        const labels = [];
        const dateMap = new Map();
        for (let i = 6; i >= 0; i--) {
            const date = moment().subtract(i, 'days').format('YYYY-MM-DD');
            labels.push(date);
            dateMap.set(date, 0);
        }
        registrationData.forEach(item => dateMap.set(item._id, item.count));
        
        if (userChart) userChart.destroy();
        userChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'New Users',
                    data: Array.from(dateMap.values()),
                    backgroundColor: 'rgba(99, 102, 241, 0.5)',
                    borderColor: 'rgba(99, 102, 241, 1)',
                    borderWidth: 1,
                    borderRadius: 4,
                }]
            },
            options: { scales: { y: { beginAtZero: true, ticks: { color: '#9CA3AF' }}, x: { ticks: { color: '#9CA3AF' }}}, plugins: { legend: { display: false } } }
        });
    }

    // --- Event Delegation ---
    document.querySelector('.main-content').addEventListener('click', async (e) => {
        const btn = e.target.closest('.action-btn');
        if (!btn) return;

        const row = e.target.closest('tr');
        const id = row?.dataset.id;
        
        if (btn.classList.contains('edit-user-btn')) openUserEditModal(JSON.parse(row.dataset.info));
        else if (btn.classList.contains('ban-user-btn') && confirm('Ban this user?')) await apiFetch(`/api/users/${id}/ban`, { method: 'POST' }).then(() => loadUsers(1));
        else if (btn.classList.contains('unban-user-btn')) await apiFetch(`/api/users/${id}/unban`, { method: 'POST' }).then(() => loadUsers(1));
        else if (btn.classList.contains('delete-lesson-btn') && confirm('Delete this lesson?')) await apiFetch(`/api/lessons/${id}`, { method: 'DELETE' }).then(() => loadLessons(1));
        else if (btn.classList.contains('delete-news-btn') && confirm('Delete this news article?')) await apiFetch(`/api/news/${id}`, { method: 'DELETE' }).then(() => loadNews(1));
        else if (btn.classList.contains('delete-subject-btn') && confirm('Delete subject?')) await apiFetch(`/api/subjects/${id}`, { method: 'DELETE' }).then(() => loadSubjects());
        else if (btn.classList.contains('delete-ban-btn') && confirm('Remove this ban entry?')) await apiFetch(`/api/bans/${id}`, { method: 'DELETE' }).then(() => loadBans());
        else if (btn.classList.contains('copy-key-btn')) {
            const key = btn.dataset.key;
            if (key) navigator.clipboard.writeText(key).then(() => showToast('Key copied!'));
        }
    });

    document.getElementById('trigger-ai-btn').addEventListener('click', async () => {
        if(confirm('Trigger AI content generation?')) await apiFetch('/api/trigger-ai-post', { method: 'POST' });
    });

    // --- Modal Logic ---
    const modals = {
        user: document.getElementById('user-edit-modal'),
        subject: document.getElementById('subject-edit-modal')
    };
    const openModal = (modal) => modal.classList.add('active');
    const closeModal = (modal) => modal.classList.remove('active');
    Object.values(modals).forEach(modal => {
        if (!modal) return;
        modal.querySelector('.modal-close-btn').onclick = () => closeModal(modal);
        modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(modal); });
    });
    
    function openUserEditModal(user) {
        const form = modals.user.querySelector('form');
        form.querySelector('#modal-userid').value = user._id;
        form.querySelector('#modal-username').textContent = user.username;
        form.querySelector('#modal-isPro').value = user.isPro;
        form.querySelector('#modal-points').value = user.points;
        form.querySelector('#modal-growthPoints').value = user.growthPoints;
        openModal(modals.user);
    }
    document.getElementById('add-subject-btn').onclick = () => openSubjectEditModal();
    function openSubjectEditModal(subject = null) {
        const form = modals.subject.querySelector('form');
        form.reset();
        form.querySelector('#modal-subject-title').textContent = subject ? 'Edit Subject' : 'Add New Subject';
        form.querySelector('#modal-subject-id').value = subject ? subject._id : '';
        if (subject) {
            form.querySelector('#modal-subject-name').value = subject.name;
            form.querySelector('#modal-subject-description').value = subject.description;
            form.querySelector('#modal-subject-image').value = subject.image;
        }
        openModal(modals.subject);
    }
    
    document.getElementById('user-edit-form').onsubmit = async (e) => {
        e.preventDefault();
        const id = e.target.querySelector('#modal-userid').value;
        const data = {
            isPro: e.target.querySelector('#modal-isPro').value,
            points: e.target.querySelector('#modal-points').value,
            growthPoints: e.target.querySelector('#modal-growthPoints').value
        };
        await apiFetch(`/api/users/${id}/update`, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(data) });
        closeModal(modals.user);
        loadUsers(1);
    };

    document.getElementById('subject-edit-form').onsubmit = async (e) => {
        e.preventDefault();
        const id = e.target.querySelector('#modal-subject-id').value;
        const data = {
            name: e.target.querySelector('#modal-subject-name').value,
            description: e.target.querySelector('#modal-subject-description').value,
            image: e.target.querySelector('#modal-subject-image').value
        };
        // This example only implements Add, but a real app would check for ID to do a PUT request
        await apiFetch('/api/subjects', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(data) });
        closeModal(modals.subject);
        loadSubjects();
    };

    // --- Initial Load ---
    const initialTab = window.location.hash.substring(1) || 'dashboard';
    if(tabLoadFunctions[initialTab]) {
        switchTab(initialTab);
    } else {
        switchTab('dashboard');
    }
});