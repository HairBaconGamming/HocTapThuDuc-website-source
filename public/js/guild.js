(function () {
    const page = document.querySelector('[data-guild-page]');
    if (!page) return;

    const body = document.body;
    const prefersReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    const tabButtons = Array.from(document.querySelectorAll('[data-guild-tab]'));
    const tabPanels = Array.from(document.querySelectorAll('[data-guild-panel]'));
    const segmentButtons = Array.from(document.querySelectorAll('[data-guild-segment]'));
    const segmentPanels = Array.from(document.querySelectorAll('[data-guild-segment-panel]'));
    const tabLabels = {
        overview: 'Overview',
        goal: 'Weekly Quests',
        members: 'Members',
        admin: 'Admin/Settings'
    };

    const donationForm = document.getElementById('guildDonationForm');
    const treeSanctuary = document.getElementById('guildTreeSanctuary');
    const resourceButtons = Array.from(document.querySelectorAll('[data-resource-button]'));
    const quickButtons = Array.from(document.querySelectorAll('.guild-quick-btn'));
    const customAmountInput = document.getElementById('guildCustomAmount');
    const donationSlider = document.getElementById('guildDonationSlider');
    const resourceInput = donationForm?.querySelector('input[name="resourceType"]');
    const amountInput = donationForm?.querySelector('input[name="amount"]');
    const donateSummary = document.getElementById('guildDonateSummary');
    const donateCta = document.getElementById('guildDonateCta');
    const donateSubmit = document.getElementById('guildDonateSubmit');
    const selectedResourceLabel = document.getElementById('guildSelectedResourceLabel');
    const selectedResourceAmount = document.getElementById('guildSelectedResourceAmount');

    const modalBackdrop = document.querySelector('[data-guild-modal-backdrop]');
    const goalModal = document.querySelector('[data-guild-modal="goal"]');
    const drawerBackdrop = document.querySelector('[data-guild-drawer-backdrop]');
    const drawers = Array.from(document.querySelectorAll('[data-guild-drawer]'));

    function safeAlert(message, type = 'success', duration = 2600) {
        if (window.showAlert) {
            window.showAlert(message, type, duration);
            return;
        }
        console[type === 'error' ? 'error' : 'log'](message);
    }

    function syncOverlayLock() {
        const modalOpen = goalModal && !goalModal.hidden;
        const drawerOpen = drawers.some((drawer) => !drawer.hidden);
        body.classList.toggle('guild-overlay-open', Boolean(modalOpen || drawerOpen));
    }

    function setActiveTab(tabName) {
        const nextTab = tabButtons.find((button) => button.dataset.guildTab === tabName) ? tabName : 'overview';

        tabButtons.forEach((button) => {
            button.classList.toggle('is-active', button.dataset.guildTab === nextTab);
        });

        tabPanels.forEach((panel) => {
            const active = panel.dataset.guildPanel === nextTab;
            panel.hidden = !active;
            panel.classList.toggle('is-active', active);
        });

        const url = new URL(window.location.href);
        url.searchParams.set('tab', nextTab);
        window.history.replaceState({}, '', url);
    }

    function setActiveSegment(segmentName) {
        const nextSegment = segmentButtons.find((button) => button.dataset.guildSegment === segmentName)
            ? segmentName
            : 'leaderboard';

        segmentButtons.forEach((button) => {
            button.classList.toggle('is-active', button.dataset.guildSegment === nextSegment);
        });

        segmentPanels.forEach((panel) => {
            const active = panel.dataset.guildSegmentPanel === nextSegment;
            panel.hidden = !active;
            panel.classList.toggle('is-active', active);
        });
    }

    function closeGoalModal() {
        if (!goalModal || !modalBackdrop) return;
        goalModal.hidden = true;
        modalBackdrop.hidden = true;
        syncOverlayLock();
    }

    function openGoalModal() {
        if (!goalModal || !modalBackdrop) return;
        goalModal.hidden = false;
        modalBackdrop.hidden = false;
        syncOverlayLock();
    }

    function closeDrawers() {
        if (!drawerBackdrop) return;
        drawerBackdrop.hidden = true;
        drawers.forEach((drawer) => {
            drawer.hidden = true;
            drawer.classList.remove('is-open');
        });
        syncOverlayLock();
    }

    function openDrawer(name) {
        const target = drawers.find((drawer) => drawer.dataset.guildDrawer === name);
        if (!target || !drawerBackdrop) return;

        closeGoalModal();
        drawerBackdrop.hidden = false;

        drawers.forEach((drawer) => {
            const active = drawer === target;
            drawer.hidden = !active;
            drawer.classList.toggle('is-open', active);
        });

        syncOverlayLock();
    }

    function getSelectedResourceButton() {
        return resourceButtons.find((button) => button.classList.contains('is-active')) || resourceButtons[0] || null;
    }

    function sanitizeAmount(value) {
        const numeric = Number(value);
        if (!Number.isFinite(numeric) || numeric <= 0) return 0;
        return Math.floor(numeric);
    }

    function getAvailableAmount(button) {
        return Math.max(0, Number(button?.dataset.resourceAmount || 0));
    }

    function syncAmount(nextValue) {
        const selected = getSelectedResourceButton();
        const available = getAvailableAmount(selected);
        const amount = available <= 0 ? 0 : Math.min(available, Math.max(1, sanitizeAmount(nextValue)));

        if (customAmountInput) customAmountInput.value = amount;
        if (donationSlider) {
            donationSlider.min = available <= 0 ? 0 : 1;
            donationSlider.max = Math.max(0, available);
            donationSlider.value = amount;
        }
        if (amountInput) amountInput.value = amount;
        return amount;
    }

    function updateDonationSummary(nextValue) {
        const selected = getSelectedResourceButton();
        if (!selected) return;

        const amount = syncAmount(nextValue || amountInput?.value || 10);
        const label = selected.dataset.resourceLabel || 'Tài nguyên';
        const symbol = selected.dataset.resourceIcon || '✨';
        const available = getAvailableAmount(selected);

        if (resourceInput) resourceInput.value = selected.dataset.resourceKey || 'water';
        if (selectedResourceLabel) selectedResourceLabel.textContent = label;
        if (selectedResourceAmount) selectedResourceAmount.textContent = available.toLocaleString('vi-VN');
        if (donateSummary) donateSummary.textContent = amount > 0 ? `${symbol} ${amount} ${label}` : `${symbol} Hết ${label}`;
        if (donateCta) donateCta.textContent = amount > 0 ? `Dâng ${amount.toLocaleString('vi-VN')} ${label}` : 'Kho hiện đã cạn';
        if (donateSubmit) donateSubmit.disabled = amount <= 0;
    }

    function selectResource(button) {
        if (!button) return;
        resourceButtons.forEach((candidate) => {
            candidate.classList.toggle('is-active', candidate === button);
        });
        updateDonationSummary(customAmountInput?.value || amountInput?.value || 10);
    }

    function burstTokens(sourceNode, amount) {
        if (prefersReducedMotion || !sourceNode || !treeSanctuary) return;

        const burst = document.createElement('div');
        burst.className = 'guild-token-burst';
        document.body.appendChild(burst);

        const sourceRect = sourceNode.getBoundingClientRect();
        const targetRect = treeSanctuary.getBoundingClientRect();
        const selected = getSelectedResourceButton();
        const icon = selected?.dataset.resourceIcon || '✨';
        const iconUrl = selected?.dataset.resourceIconUrl || '';
        const tokenCount = Math.max(4, Math.min(12, Math.ceil(amount / 20)));

        for (let index = 0; index < tokenCount; index += 1) {
            const token = document.createElement('span');
            token.className = 'guild-token-burst__token';
            if (iconUrl) {
                const image = document.createElement('img');
                image.src = iconUrl;
                image.alt = selected?.dataset.resourceLabel || 'Tài nguyên';
                token.appendChild(image);
            } else {
                token.textContent = icon;
            }
            token.style.setProperty('--token-start-x', `${sourceRect.left + (sourceRect.width / 2) + ((index % 3) * 8)}px`);
            token.style.setProperty('--token-start-y', `${sourceRect.top + (sourceRect.height / 2)}px`);
            token.style.setProperty(
                '--token-end-x',
                `${targetRect.left + (targetRect.width / 2) - (sourceRect.left + (sourceRect.width / 2)) + ((index % 3) * 10)}px`
            );
            token.style.setProperty(
                '--token-end-y',
                `${targetRect.top + (targetRect.height / 2) - (sourceRect.top + (sourceRect.height / 2)) - ((index % 2) * 18)}px`
            );
            burst.appendChild(token);
        }

        treeSanctuary.classList.add('is-fed');
        window.setTimeout(() => treeSanctuary.classList.remove('is-fed'), 1200);
        window.setTimeout(() => burst.remove(), 950);
    }

    async function submitDonation(nextValue) {
        if (!donationForm || !resourceInput || !donateSubmit) return;

        const selected = getSelectedResourceButton();
        const available = getAvailableAmount(selected);
        const amount = sanitizeAmount(nextValue);

        if (!selected || amount <= 0 || available < amount) {
            safeAlert('Kho của bạn không đủ cho lần quyên góp này.', 'warning', 3200);
            return;
        }

        syncAmount(amount);
        donateSubmit.disabled = true;

        try {
            const response = await fetch(donationForm.action, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
                    Accept: 'application/json',
                    'X-Requested-With': 'XMLHttpRequest'
                },
                body: new URLSearchParams({
                    resourceType: resourceInput.value,
                    amount: String(amount)
                })
            });

            const payload = await response.json();
            if (!response.ok || !payload.success) {
                throw new Error(payload.message || 'Quyên góp thất bại.');
            }

            burstTokens(selected, amount);
            safeAlert(payload.message || 'Đã quyên góp thành công.', 'success', 2800);
            window.setTimeout(() => window.location.reload(), prefersReducedMotion ? 140 : 900);
        } catch (error) {
            safeAlert(error.message || 'Quyên góp thất bại.', 'error', 3400);
        } finally {
            donateSubmit.disabled = false;
        }
    }

    tabButtons.forEach((button) => {
        const label = tabLabels[button.dataset.guildTab];
        if (label) {
            button.textContent = label;
        }
        button.addEventListener('click', () => setActiveTab(button.dataset.guildTab));
    });

    segmentButtons.forEach((button) => {
        button.addEventListener('click', () => setActiveSegment(button.dataset.guildSegment));
    });

    document.querySelectorAll('[data-guild-modal-open="goal"]').forEach((button) => {
        button.addEventListener('click', openGoalModal);
    });

    document.querySelectorAll('[data-guild-modal-close]').forEach((button) => {
        button.addEventListener('click', closeGoalModal);
    });

    modalBackdrop?.addEventListener('click', closeGoalModal);

    document.querySelectorAll('[data-guild-drawer-target]').forEach((button) => {
        button.addEventListener('click', () => openDrawer(button.dataset.guildDrawerTarget));
    });

    document.querySelectorAll('[data-guild-drawer-close]').forEach((button) => {
        button.addEventListener('click', closeDrawers);
    });

    drawerBackdrop?.addEventListener('click', closeDrawers);

    resourceButtons.forEach((button) => {
        button.addEventListener('click', () => selectResource(button));
    });

    quickButtons.forEach((button) => {
        button.addEventListener('click', () => {
            const selected = getSelectedResourceButton();
            if (!selected) return;

            const amount = button.dataset.quickAmount === 'all'
                ? getAvailableAmount(selected)
                : sanitizeAmount(button.dataset.quickAmount);

            if (!amount) {
                safeAlert('Tài nguyên này hiện đã cạn kho.', 'warning', 2600);
                return;
            }

            updateDonationSummary(amount);
        });
    });

    donationSlider?.addEventListener('input', () => updateDonationSummary(donationSlider.value));
    customAmountInput?.addEventListener('input', () => updateDonationSummary(customAmountInput.value));

    donationForm?.addEventListener('submit', (event) => {
        event.preventDefault();
        submitDonation(customAmountInput?.value || amountInput?.value || 1);
    });

    document.querySelectorAll('[data-applause-url]').forEach((button) => {
        button.addEventListener('click', async () => {
            const url = button.getAttribute('data-applause-url');
            const countNode = button.querySelector('[data-applause-count]');
            if (!url || !countNode) return;

            button.disabled = true;

            try {
                const response = await fetch(url, {
                    method: 'POST',
                    headers: {
                        Accept: 'application/json',
                        'X-Requested-With': 'XMLHttpRequest'
                    }
                });

                const payload = await response.json();
                if (!response.ok || !payload.success) {
                    throw new Error(payload.message || 'Không thể vỗ tay lúc này.');
                }

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

    const initialTab = new URL(window.location.href).searchParams.get('tab') || page.dataset.activeTab || 'overview';
    const defaultSegment = page.dataset.defaultSegment || 'leaderboard';
    setActiveTab(initialTab);
    setActiveSegment(defaultSegment);

    if (resourceButtons.length) {
        selectResource(resourceButtons[0]);
        updateDonationSummary(10);
    }
})();
