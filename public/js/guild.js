(function () {
    const page = document.querySelector('[data-guild-page]');
    if (!page) return;

    const prefersReducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const body = document.body;
    const donationForm = document.getElementById('guildDonationForm');
    const treeSanctuary = document.getElementById('guildTreeSanctuary');
    const resourceButtons = Array.from(document.querySelectorAll('[data-resource-button]'));
    const quickButtons = Array.from(document.querySelectorAll('.guild-quick-btn'));
    const customAmountInput = document.getElementById('guildCustomAmount');
    const donationSlider = document.getElementById('guildDonationSlider');
    const donateSummary = document.getElementById('guildDonateSummary');
    const donateCta = document.getElementById('guildDonateCta');
    const submitButton = document.getElementById('guildDonateSubmit');
    const resourceInput = donationForm?.querySelector('input[name="resourceType"]');
    const amountInput = donationForm?.querySelector('input[name="amount"]');
    const selectedResourceLabel = document.getElementById('guildSelectedResourceLabel');
    const selectedResourceAmount = document.getElementById('guildSelectedResourceAmount');
    const tabButtons = Array.from(document.querySelectorAll('[data-guild-tab]'));
    const tabPanels = Array.from(document.querySelectorAll('[data-guild-panel]'));
    const segmentButtons = Array.from(document.querySelectorAll('[data-guild-segment]'));
    const segmentPanels = Array.from(document.querySelectorAll('[data-guild-segment-panel]'));
    const modalBackdrop = document.querySelector('[data-guild-modal-backdrop]');
    const goalModal = document.querySelector('[data-guild-modal="goal"]');
    const drawerBackdrop = document.querySelector('[data-guild-drawer-backdrop]');
    const drawers = Array.from(document.querySelectorAll('[data-guild-drawer]'));

    function safeAlert(message, type = 'success', duration = 2600) {
        window.showAlert?.(message, type, duration);
    }

    function setActiveTab(tabName) {
        const nextTab = tabButtons.find((button) => button.dataset.guildTab === tabName) ? tabName : 'overview';
        tabButtons.forEach((button) => button.classList.toggle('is-active', button.dataset.guildTab === nextTab));
        tabPanels.forEach((panel) => {
            const active = panel.dataset.guildPanel === nextTab;
            panel.hidden = !active;
            panel.classList.toggle('is-active', active);
        });
        const url = new URL(window.location.href);
        url.searchParams.set('tab', nextTab);
        window.history.replaceState({}, '', url);
    }

    function setActiveSegment(name) {
        segmentButtons.forEach((button) => button.classList.toggle('is-active', button.dataset.guildSegment === name));
        segmentPanels.forEach((panel) => {
            const active = panel.dataset.guildSegmentPanel === name;
            panel.hidden = !active;
            panel.classList.toggle('is-active', active);
        });
    }

    function closeGoalModal() {
        if (!goalModal || !modalBackdrop) return;
        goalModal.hidden = true;
        modalBackdrop.hidden = true;
        body.classList.remove('guild-overlay-open');
    }

    function openGoalModal() {
        if (!goalModal || !modalBackdrop) return;
        goalModal.hidden = false;
        modalBackdrop.hidden = false;
        body.classList.add('guild-overlay-open');
    }

    function closeDrawers() {
        if (!drawerBackdrop) return;
        drawerBackdrop.hidden = true;
        drawers.forEach((drawer) => { drawer.hidden = true; drawer.classList.remove('is-open'); });
        body.classList.remove('guild-overlay-open');
    }

    function openDrawer(name) {
        const drawer = drawers.find((item) => item.dataset.guildDrawer === name);
        if (!drawer || !drawerBackdrop) return;
        closeGoalModal();
        drawerBackdrop.hidden = false;
        drawers.forEach((item) => {
            const active = item === drawer;
            item.hidden = !active;
            item.classList.toggle('is-open', active);
        });
        body.classList.add('guild-overlay-open');
    }

    function getSelectedResource() {
        return resourceButtons.find((button) => button.classList.contains('is-active')) || resourceButtons[0] || null;
    }

    function sanitizeAmount(value) {
        const numeric = Number(value);
        if (!Number.isFinite(numeric) || numeric <= 0) return 1;
        return Math.floor(numeric);
    }

    function getAvailableAmount(button) {
        return Math.max(0, Number(button?.dataset.resourceAmount || 0));
    }

    function syncAmount(value) {
        const resource = getSelectedResource();
        const max = Math.max(1, getAvailableAmount(resource));
        const nextValue = Math.min(max, sanitizeAmount(value));
        if (customAmountInput) customAmountInput.value = nextValue;
        if (donationSlider) donationSlider.value = nextValue;
        if (amountInput) amountInput.value = nextValue;
        return nextValue;
    }

    function updateDonationSummary(value) {
        const resource = getSelectedResource();
        if (!resource) return;
        const amount = syncAmount(value || amountInput?.value || 10);
        const label = resource.dataset.resourceLabel || 'Tài nguyên';
        const icon = resource.dataset.resourceIcon || '✨';
        if (resourceInput) resourceInput.value = resource.dataset.resourceKey || 'water';
        if (selectedResourceLabel) selectedResourceLabel.textContent = label;
        if (selectedResourceAmount) selectedResourceAmount.textContent = Number(resource.dataset.resourceAmount || 0).toLocaleString('vi-VN');
        if (donateSummary) donateSummary.textContent = `${icon} ${amount} ${label}`;
        if (donateCta) donateCta.textContent = `Dâng ${amount.toLocaleString('vi-VN')} ${label}`;
        if (donationSlider) donationSlider.max = Math.max(1, getAvailableAmount(resource));
    }

    function setSelectedResource(button) {
        if (!button) return;
        resourceButtons.forEach((item) => item.classList.toggle('is-active', item === button));
        updateDonationSummary(customAmountInput?.value || amountInput?.value || 10);
    }

    function burstTokens(button, amount) {
        if (prefersReducedMotion || !treeSanctuary || !button) return;
        const burst = document.createElement('div');
        burst.className = 'guild-token-burst';
        document.body.appendChild(burst);
        const sourceRect = button.getBoundingClientRect();
        const targetRect = treeSanctuary.getBoundingClientRect();
        const icon = getSelectedResource()?.dataset.resourceIcon || '✨';
        const tokenCount = Math.max(4, Math.min(12, Math.ceil(amount / 20)));
        for (let index = 0; index < tokenCount; index += 1) {
            const token = document.createElement('span');
            token.className = 'guild-token-burst__token';
            token.textContent = icon;
            token.style.setProperty('--token-start-x', `${sourceRect.left + (sourceRect.width / 2) + (index * 5)}px`);
            token.style.setProperty('--token-start-y', `${sourceRect.top + (sourceRect.height / 2)}px`);
            token.style.setProperty('--token-end-x', `${targetRect.left + (targetRect.width / 2) - (sourceRect.left + (sourceRect.width / 2)) + ((index % 3) * 10)}px`);
            token.style.setProperty('--token-end-y', `${targetRect.top + (targetRect.height / 2) - (sourceRect.top + (sourceRect.height / 2)) - ((index % 2) * 22)}px`);
            burst.appendChild(token);
        }
        treeSanctuary.classList.add('is-fed');
        window.setTimeout(() => treeSanctuary.classList.remove('is-fed'), 1200);
        window.setTimeout(() => burst.remove(), 950);
    }

    async function submitDonation(amount) {
        if (!donationForm || !resourceInput || !submitButton) return;
        const resource = getSelectedResource();
        const availableAmount = getAvailableAmount(resource);
        const finalAmount = sanitizeAmount(amount);
        if (availableAmount < finalAmount) {
            safeAlert('Kho của bạn không đủ cho lần quyên góp này.', 'warning', 3200);
            return;
        }
        syncAmount(finalAmount);
        submitButton.disabled = true;
        try {
            const response = await fetch(donationForm.action, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
                    Accept: 'application/json',
                    'X-Requested-With': 'XMLHttpRequest'
                },
                body: new URLSearchParams({ resourceType: resourceInput.value, amount: String(finalAmount) })
            });
            const payload = await response.json();
            if (!response.ok || !payload.success) throw new Error(payload.message || 'Quyên góp thất bại.');
            burstTokens(submitButton, finalAmount);
            safeAlert(payload.message || 'Đã quyên góp thành công.', 'success', 2800);
            window.setTimeout(() => window.location.reload(), prefersReducedMotion ? 120 : 900);
        } catch (error) {
            safeAlert(error.message || 'Quyên góp thất bại.', 'error', 3600);
        } finally {
            submitButton.disabled = false;
        }
    }

    tabButtons.forEach((button) => button.addEventListener('click', () => setActiveTab(button.dataset.guildTab)));
    segmentButtons.forEach((button) => button.addEventListener('click', () => setActiveSegment(button.dataset.guildSegment)));
    document.querySelectorAll('[data-guild-modal-open="goal"]').forEach((button) => button.addEventListener('click', openGoalModal));
    document.querySelectorAll('[data-guild-modal-close]').forEach((button) => button.addEventListener('click', closeGoalModal));
    modalBackdrop?.addEventListener('click', closeGoalModal);
    document.querySelectorAll('[data-guild-drawer-target]').forEach((button) => button.addEventListener('click', () => openDrawer(button.dataset.guildDrawerTarget)));
    document.querySelectorAll('[data-guild-drawer-close]').forEach((button) => button.addEventListener('click', closeDrawers));
    drawerBackdrop?.addEventListener('click', closeDrawers);

    resourceButtons.forEach((button) => button.addEventListener('click', () => setSelectedResource(button)));
    quickButtons.forEach((button) => button.addEventListener('click', () => {
        const selected = getSelectedResource();
        if (!selected) return;
        const amount = button.dataset.quickAmount === 'all' ? getAvailableAmount(selected) : sanitizeAmount(button.dataset.quickAmount);
        if (!amount) {
            safeAlert('Tài nguyên này hiện đã cạn kho.', 'warning', 2600);
            return;
        }
        updateDonationSummary(amount);
    }));
    donationSlider?.addEventListener('input', () => updateDonationSummary(donationSlider.value));
    customAmountInput?.addEventListener('input', () => updateDonationSummary(customAmountInput.value));
    donationForm?.addEventListener('submit', (event) => { event.preventDefault(); submitDonation(customAmountInput?.value || amountInput?.value || 1); });

    document.querySelectorAll('[data-applause-url]').forEach((button) => {
        button.addEventListener('click', async () => {
            const url = button.getAttribute('data-applause-url');
            const countNode = button.querySelector('[data-applause-count]');
            if (!url || !countNode) return;
            button.disabled = true;
            try {
                const response = await fetch(url, { method: 'POST', headers: { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' } });
                const payload = await response.json();
                if (!response.ok || !payload.success) throw new Error(payload.message || 'Không thể vỗ tay lúc này.');
                countNode.textContent = payload.applauseCount || 0;
                button.classList.toggle('is-active', Boolean(payload.isApplauded));
            } catch (error) {
                safeAlert(error.message || 'Không thể vỗ tay lúc này.', 'error', 3000);
            } finally {
                button.disabled = false;
            }
        });
    });

    document.querySelectorAll('[data-copy-text]').forEach((button) => {
        button.addEventListener('click', async () => {
            const text = button.getAttribute('data-copy-text');
            if (!text) return;
            try {
                await navigator.clipboard.writeText(text);
                safeAlert('Đã sao chép mật lệnh chiêu mộ.', 'success', 2200);
            } catch (error) {
                safeAlert('Không thể sao chép mật lệnh lúc này.', 'error', 2600);
            }
        });
    });

    document.addEventListener('keydown', (event) => {
        if (event.key !== 'Escape') return;
        closeGoalModal();
        closeDrawers();
    });

    const initialTab = new URL(window.location.href).searchParams.get('tab') || 'overview';
    setActiveTab(initialTab);
    setActiveSegment('leaderboard');
    if (resourceButtons.length) {
        setSelectedResource(resourceButtons[0]);
        updateDonationSummary(10);
    }
})();
