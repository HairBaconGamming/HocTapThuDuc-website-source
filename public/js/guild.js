(function () {
    const page = document.querySelector('[data-guild-page]');
    if (!page) return;

    const prefersReducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const donationForm = document.getElementById('guildDonationForm');
    const treeSanctuary = document.getElementById('guildTreeSanctuary');
    const resourceButtons = Array.from(document.querySelectorAll('.guild-resource-pill'));
    const quickButtons = Array.from(document.querySelectorAll('.guild-quick-btn'));
    const customAmountInput = document.getElementById('guildCustomAmount');
    const donateSummary = document.getElementById('guildDonateSummary');
    const submitButton = document.getElementById('guildDonateSubmit');
    const resourceInput = donationForm?.querySelector('input[name="resourceType"]');
    const amountInput = donationForm?.querySelector('input[name="amount"]');

    function getSelectedResource() {
        const active = resourceButtons.find((button) => button.classList.contains('is-active'));
        return active || resourceButtons[0] || null;
    }

    function setSelectedResource(button) {
        if (!button) return;
        resourceButtons.forEach((item) => item.classList.toggle('is-active', item === button));
        if (resourceInput) {
            resourceInput.value = button.dataset.resourceKey || 'water';
        }
        updateDonationSummary();
    }

    function sanitizeAmount(value) {
        const numeric = Number(value);
        if (!Number.isFinite(numeric) || numeric <= 0) return 1;
        return Math.floor(numeric);
    }

    function getAvailableAmount(button) {
        return Math.max(0, Number(button?.dataset.resourceAmount || 0));
    }

    function updateDonationSummary(amountOverride) {
        const button = getSelectedResource();
        if (!button || !donateSummary || !amountInput) return;

        const amount = sanitizeAmount(amountOverride || amountInput.value || customAmountInput?.value || 10);
        amountInput.value = amount;
        if (customAmountInput) customAmountInput.value = amount;
        donateSummary.textContent = `${button.dataset.resourceIcon || '✨'} ${amount} ${button.dataset.resourceLabel || 'Tài nguyên'}`;
    }

    function burstTokens(button, amount) {
        if (prefersReducedMotion || !treeSanctuary || !button) return;

        const burst = document.createElement('div');
        burst.className = 'guild-token-burst';
        document.body.appendChild(burst);

        const sourceRect = button.getBoundingClientRect();
        const targetRect = treeSanctuary.getBoundingClientRect();
        const icon = (getSelectedResource()?.dataset.resourceIcon) || '✨';
        const tokenCount = Math.max(4, Math.min(10, Math.ceil(amount / 20)));

        for (let index = 0; index < tokenCount; index += 1) {
            const token = document.createElement('span');
            token.className = 'guild-token-burst__token';
            token.textContent = icon;
            token.style.setProperty('--token-start-x', `${sourceRect.left + (sourceRect.width / 2) + (index * 6)}px`);
            token.style.setProperty('--token-start-y', `${sourceRect.top + (sourceRect.height / 2)}px`);
            token.style.setProperty('--token-end-x', `${targetRect.left + (targetRect.width / 2) - (sourceRect.left + (sourceRect.width / 2)) + ((index % 3) * 8)}px`);
            token.style.setProperty('--token-end-y', `${targetRect.top + (targetRect.height / 2) - (sourceRect.top + (sourceRect.height / 2)) - ((index % 2) * 20)}px`);
            burst.appendChild(token);
        }

        treeSanctuary.classList.add('is-fed');
        window.setTimeout(() => treeSanctuary.classList.remove('is-fed'), 1200);
        window.setTimeout(() => burst.remove(), 950);
    }

    async function submitDonation(amount) {
        if (!donationForm || !resourceInput || !submitButton) return;

        const resourceButton = getSelectedResource();
        const availableAmount = getAvailableAmount(resourceButton);
        const finalAmount = sanitizeAmount(amount);

        if (availableAmount < finalAmount) {
            window.showAlert?.('Kho của bạn không đủ cho lần quyên góp này.', 'warning', 3200);
            return;
        }

        amountInput.value = finalAmount;
        if (customAmountInput) customAmountInput.value = finalAmount;
        submitButton.disabled = true;

        try {
            const response = await fetch(donationForm.action, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
                    'Accept': 'application/json',
                    'X-Requested-With': 'XMLHttpRequest'
                },
                body: new URLSearchParams({
                    resourceType: resourceInput.value,
                    amount: String(finalAmount)
                })
            });

            const payload = await response.json();
            if (!response.ok || !payload.success) {
                throw new Error(payload.message || 'Quyên góp thất bại.');
            }

            burstTokens(submitButton, finalAmount);
            window.showAlert?.(payload.message || 'Đã quyên góp thành công.', 'success', 2800);
            window.setTimeout(() => window.location.reload(), prefersReducedMotion ? 120 : 900);
        } catch (error) {
            window.showAlert?.(error.message || 'Quyên góp thất bại.', 'error', 3600);
        } finally {
            submitButton.disabled = false;
        }
    }

    resourceButtons.forEach((button) => {
        button.addEventListener('click', () => {
            setSelectedResource(button);
        });
    });

    quickButtons.forEach((button) => {
        button.addEventListener('click', () => {
            const selected = getSelectedResource();
            if (!selected) return;

            const requested = button.dataset.quickAmount === 'all'
                ? getAvailableAmount(selected)
                : sanitizeAmount(button.dataset.quickAmount);

            if (!requested) {
                window.showAlert?.('Tài nguyên này hiện đã cạn kho.', 'warning', 2600);
                return;
            }

            updateDonationSummary(requested);
            submitDonation(requested);
        });
    });

    customAmountInput?.addEventListener('input', () => {
        updateDonationSummary(customAmountInput.value);
    });

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
                        'Accept': 'application/json',
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
                window.showAlert?.(error.message || 'Không thể vỗ tay lúc này.', 'error', 3000);
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
                window.showAlert?.('Đã sao chép mật lệnh chiêu mộ.', 'success', 2200);
            } catch (error) {
                window.showAlert?.('Không thể sao chép mật lệnh lúc này.', 'error', 2600);
            }
        });
    });

    if (resourceButtons.length) {
        setSelectedResource(resourceButtons[0]);
        updateDonationSummary(10);
    }
})();
