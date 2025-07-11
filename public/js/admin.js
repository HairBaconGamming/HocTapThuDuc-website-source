document.addEventListener('DOMContentLoaded', () => {
    // --- Basic Setup & Elements ---
    const sidebarLinks = document.querySelectorAll('.sidebar-nav .nav-link');
    const tabContents = document.querySelectorAll('.main-content .tab-content');

    // --- Tab Navigation ---
    function switchTab(tabId) {
        sidebarLinks.forEach(link => {
            link.classList.toggle('active', link.getAttribute('href') === `#${tabId}`);
        });
        tabContents.forEach(tab => {
            tab.classList.toggle('active', tab.id === tabId);
        });

        // Load content for the new tab
        if (tabId === 'dashboard') loadDashboard();
        if (tabId === 'users') loadUsers();
        if (tabId === 'subjects') loadSubjects();
    }

    sidebarLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            const tabId = link.getAttribute('href').substring(1);
            if(tabId) {
                e.preventDefault();
                switchTab(tabId);
                // Update URL hash for better navigation
                window.location.hash = tabId;
            }
        });
    });
    
    // Check hash on page load to open the correct tab
    const currentHash = window.location.hash.substring(1);
    if (currentHash) {
        switchTab(currentHash);
    } else {
        loadDashboard(); // Load default tab content
    }

    // --- Toast Notification ---
    function showToast(message, type = 'success') {
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;
        document.body.appendChild(toast);
        setTimeout(() => {
            toast.classList.add('show');
            setTimeout(() => {
                toast.classList.remove('show');
                setTimeout(() => toast.remove(), 500);
            }, 3000);
        }, 100);
    }

    // --- API Fetcher ---
    async function apiFetch(url, options = {}) {
        try {
            const response = await fetch(`/admin${url}`, options);
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ error: 'An unknown error occurred' }));
                throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
            }
            return response.json();
        } catch (error) {
            console.error('API Fetch Error:', error);
            showToast(error.message, 'danger');
            throw error;
        }
    }
    
    // --- Dashboard ---
    async function loadDashboard() {
        try {
            const data = await apiFetch('/api/stats');
            const grid = document.getElementById('stats-grid');
            grid.innerHTML = `
                <div class="stat-card"><div class="stat-title"><i class="fas fa-users stat-icon"></i> Total Users</div><div class="stat-value">${data.totalUsers}</div></div>
                <div class="stat-card"><div class="stat-title"><i class="fas fa-crown stat-icon"></i> PRO Users</div><div class="stat-value">${data.proUsers}</div></div>
                <div class="stat-card"><div class="stat-title"><i class="fas fa-user-slash stat-icon"></i> Banned Users</div><div class="stat-value">${data.bannedUsers}</div></div>
                <div class="stat-card"><div class="stat-title"><i class="fas fa-book-open stat-icon"></i> Total Lessons</div><div class="stat-value">${data.totalLessons}</div></div>
                <div class="stat-card"><div class="stat-title"><i class="fas fa-newspaper stat-icon"></i> News Articles</div><div class="stat-value">${data.totalNews}</div></div>
                <div class="stat-card"><div class="stat-title"><i class="fas fa-shapes stat-icon"></i> Subjects</div><div class="stat-value">${data.totalSubjects}</div></div>
                <div class="stat-card"><div class="stat-title"><i class="fas fa-chart-line stat-icon"></i> Total Visits</div><div class="stat-value">${data.totalVisits}</div></div>
                <div class="stat-card"><div class="stat-title"><i class="fas fa-calendar-day stat-icon"></i> Visits Today</div><div class="stat-value">${data.dailyVisits}</div></div>
            `;

            const recentUsersList = document.getElementById('recent-users-list');
            recentUsersList.innerHTML = data.recentUsers.map(u => `<li><span>${u.isPro ? '👑' : ''} ${u.username}</span> <span class="time-since">${timeAgo(u.createdAt)}</span></li>`).join('');
            
            const recentLessonsList = document.getElementById('recent-lessons-list');
            recentLessonsList.innerHTML = data.recentLessons.map(l => `<li><span>${l.title}</span> <span class="time-since">by ${l.createdBy?.username || 'N/A'}</span></li>`).join('');

        } catch (error) { /* Error handled in apiFetch */ }
    }
    
    // --- User Management ---
    const userSearchInput = document.getElementById('user-search-input');
    let userSearchTimeout;
    
    userSearchInput.addEventListener('input', () => {
        clearTimeout(userSearchTimeout);
        userSearchTimeout = setTimeout(() => loadUsers(1, userSearchInput.value), 300);
    });

    async function loadUsers(page = 1, search = '') {
        try {
            const data = await apiFetch(`/api/users?page=${page}&search=${search}`);
            const tableBody = document.getElementById('users-table-body');
            tableBody.innerHTML = data.users.map(user => `
                <tr data-user-id="${user._id}">
                    <td><strong>${user.username}</strong></td>
                    <td>${user.email || 'N/A'}</td>
                    <td><span class="status-tag pro">${user.isPro ? 'Yes' : 'No'}</span></td>
                    <td>${user.points}</td>
                    <td><span class="status-tag ${user.isBanned ? 'banned' : 'active'}">${user.isBanned ? 'Banned' : 'Active'}</span></td>
                    <td>${new Date(user.createdAt).toLocaleDateString()}</td>
                    <td>
                        <button class="action-btn primary edit-user-btn" title="Edit"><i class="fas fa-edit"></i></button>
                        ${user.isBanned 
                            ? `<button class="action-btn success unban-user-btn" title="Unban"><i class="fas fa-unlock"></i></button>`
                            : `<button class="action-btn danger ban-user-btn" title="Ban"><i class="fas fa-gavel"></i></button>`
                        }
                    </td>
                </tr>
            `).join('');
            renderPagination('users-pagination', data.page, data.pages, (p) => loadUsers(p, search));
            attachUserActionListeners();
        } catch(error) { /* Handled in apiFetch */ }
    }

    function attachUserActionListeners() {
        document.querySelectorAll('.edit-user-btn').forEach(btn => {
            btn.onclick = (e) => {
                const row = e.target.closest('tr');
                const userId = row.dataset.userId;
                const user = { // Reconstruct user object from table row for modal
                    username: row.cells[0].innerText,
                    isPro: row.cells[2].innerText === 'Yes',
                    points: parseInt(row.cells[3].innerText)
                };
                openUserEditModal(userId, user);
            };
        });
        document.querySelectorAll('.ban-user-btn').forEach(btn => {
            btn.onclick = async (e) => {
                const userId = e.target.closest('tr').dataset.userId;
                if (confirm('Are you sure you want to ban this user?')) {
                    await apiFetch(`/api/users/${userId}/ban`, { method: 'POST' });
                    loadUsers(1, userSearchInput.value); // Refresh list
                }
            };
        });
        document.querySelectorAll('.unban-user-btn').forEach(btn => {
            btn.onclick = async (e) => {
                const userId = e.target.closest('tr').dataset.userId;
                await apiFetch(`/api/users/${userId}/unban`, { method: 'POST' });
                loadUsers(1, userSearchInput.value); // Refresh list
            };
        });
    }

    // --- Subject Management ---
    async function loadSubjects() {
        try {
            const subjects = await apiFetch('/api/subjects');
            const tableBody = document.getElementById('subjects-table-body');
            tableBody.innerHTML = subjects.map(sub => `
                <tr data-subject-id="${sub._id}">
                    <td><strong>${sub.name}</strong></td>
                    <td>${sub.description || 'N/A'}</td>
                    <td>${sub.image ? `<a href="${sub.image}" target="_blank">View Image</a>` : 'N/A'}</td>
                    <td>
                        <button class="action-btn danger delete-subject-btn" title="Delete"><i class="fas fa-trash"></i></button>
                    </td>
                </tr>
            `).join('');
            attachSubjectActionListeners();
        } catch(error) { /* Handled in apiFetch */ }
    }

    function attachSubjectActionListeners() {
        document.getElementById('add-subject-btn').onclick = () => openSubjectEditModal();
        document.querySelectorAll('.delete-subject-btn').forEach(btn => {
            btn.onclick = async (e) => {
                const subjectId = e.target.closest('tr').dataset.subjectId;
                if(confirm('Are you sure you want to delete this subject? This cannot be undone.')) {
                    await apiFetch(`/api/subjects/${subjectId}`, { method: 'DELETE' });
                    loadSubjects();
                }
            }
        });
    }

    // --- System Actions ---
    document.getElementById('trigger-ai-btn').addEventListener('click', async () => {
        if(confirm('This will trigger the AI content generation job. Continue?')) {
            await apiFetch('/api/trigger-ai-post', { method: 'POST' });
        }
    });

    // --- Modal Logic ---
    const userModal = document.getElementById('user-edit-modal');
    const subjectModal = document.getElementById('subject-edit-modal');

    function openModal(modal) { modal.classList.add('active'); }
    function closeModal(modal) { modal.classList.remove('active'); }

    [userModal, subjectModal].forEach(modal => {
        if(!modal) return;
        modal.querySelector('.modal-close-btn').onclick = () => closeModal(modal);
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeModal(modal);
        });
    });

    // User Edit Modal
    function openUserEditModal(userId, user) {
        document.getElementById('modal-userid').value = userId;
        document.getElementById('modal-username').textContent = user.username;
        document.getElementById('modal-isPro').value = user.isPro.toString();
        document.getElementById('modal-points').value = user.points;
        // The modal might not have this element if the model doesn't support it yet
        const growthPointsInput = document.getElementById('modal-growthPoints');
        if (growthPointsInput && user.growthPoints !== undefined) {
             growthPointsInput.value = user.growthPoints;
        } else if (growthPointsInput) {
            growthPointsInput.value = 0; // Default if not present
        }
        openModal(userModal);
    }
    
    document.getElementById('user-edit-form').onsubmit = async (e) => {
        e.preventDefault();
        const id = document.getElementById('modal-userid').value;
        const data = {
            isPro: document.getElementById('modal-isPro').value,
            points: document.getElementById('modal-points').value,
            growthPoints: document.getElementById('modal-growthPoints')?.value
        };
        await apiFetch(`/api/users/${id}/update`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        closeModal(userModal);
        loadUsers(1, userSearchInput.value); // Refresh
    };
    
    // Subject Edit/Add Modal
    function openSubjectEditModal(subject = null) {
        const form = document.getElementById('subject-edit-form');
        form.reset();
        document.getElementById('modal-subject-title').textContent = subject ? 'Edit Subject' : 'Add New Subject';
        document.getElementById('modal-subject-id').value = subject ? subject._id : '';
        if (subject) {
            document.getElementById('modal-subject-name').value = subject.name;
            document.getElementById('modal-subject-description').value = subject.description;
            document.getElementById('modal-subject-image').value = subject.image;
        }
        openModal(subjectModal);
    }
    
    document.getElementById('subject-edit-form').onsubmit = async (e) => {
        e.preventDefault();
        const id = document.getElementById('modal-subject-id').value;
        const data = {
            name: document.getElementById('modal-subject-name').value,
            description: document.getElementById('modal-subject-description').value,
            image: document.getElementById('modal-subject-image').value
        };
        if (id) {
            // Update logic (not implemented in this example API, but would be a PUT request)
            showToast('Update functionality not implemented in this example.', 'warning');
        } else {
            await apiFetch('/api/subjects', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
        }
        closeModal(subjectModal);
        loadSubjects();
    };

    // --- Utilities ---
    function renderPagination(containerId, currentPage, totalPages, onPageClick) {
        const container = document.getElementById(containerId);
        container.innerHTML = '';
        if (totalPages <= 1) return;

        // Previous button
        const prevBtn = document.createElement('button');
        prevBtn.innerHTML = '«';
        prevBtn.className = 'pagination-btn';
        prevBtn.disabled = currentPage === 1;
        prevBtn.onclick = () => onPageClick(currentPage - 1);
        container.appendChild(prevBtn);

        // Page numbers
        for (let i = 1; i <= totalPages; i++) {
            const pageBtn = document.createElement('button');
            pageBtn.innerText = i;
            pageBtn.className = 'pagination-btn';
            if (i === currentPage) pageBtn.classList.add('active');
            pageBtn.onclick = () => onPageClick(i);
            container.appendChild(pageBtn);
        }

        // Next button
        const nextBtn = document.createElement('button');
        nextBtn.innerHTML = '»';
        nextBtn.className = 'pagination-btn';
        nextBtn.disabled = currentPage === totalPages;
        nextBtn.onclick = () => onPageClick(currentPage + 1);
        container.appendChild(nextBtn);
    }
    
    function timeAgo(dateString) {
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
    }

});