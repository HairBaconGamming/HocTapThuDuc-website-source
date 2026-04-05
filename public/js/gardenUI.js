(function attachGardenUI(window) {
    const gardenAssets = window.gardenAssets || {};
    const gardenData = window.gardenData || {};
    const helpers = window.GardenShared || {};
    const formatTime = helpers.formatTime || ((value) => `${value}`);
    const parseDuration = helpers.parseDuration || (() => 5 * 60 * 1000);
    const apiCall = helpers.apiCall || (async () => ({ success: false, msg: 'Mat ket noi server!' }));
    const updateHUD = helpers.updateHUD || (() => {});
    const addGardenItem = helpers.addGardenItem || (() => {});
    const showToast = helpers.showToast || ((msg) => console.log(msg));

    let selectedShopItem = null;
    let statsInterval = null;
    let domActionsBound = false;
    let keyboardBound = false;
    let keepAliveStarted = false;
    let fertilizePending = false;
    const shellState = {
        sidebarExpanded: false,
        mobileDrawerOpen: false,
        questDrawerOpen: false,
        toolbeltCollapsed: false,
        dialogMinimized: true,
        inspectorVisible: false,
        activePanel: 'quests'
    };
    const resourceIcons = gardenAssets.UI?.resourceIcons || {};
    const harvestIcons = gardenAssets.UI?.harvestIcons || {};
    const guideTips = [
        'Tưới nước đều để giữ tiến độ phát triển ổn định trong 24 giờ ẩm đất.',
        'Dùng bảng nhiệm vụ để lấy thêm nước, phân bón và vàng miễn phí mỗi ngày.',
        'Cà chua là cây nhiều vụ: thu hoạch xong sẽ lùi giai đoạn rồi mọc tiếp.',
        'Mở túi vật phẩm để xem nông sản vừa thu được và chuẩn bị quyên góp cho Tông Môn.'
    ];

    function getGardenItems() {
        return Array.isArray(gardenData.items) ? gardenData.items : [];
    }

    function isMobileViewport() {
        return window.matchMedia('(max-width: 768px)').matches;
    }

    function getShellRoot() {
        return document.querySelector('.pixel-ui.garden-shell');
    }

    function getDisplayNameForItem(itemKey) {
        return gardenAssets.PLANTS?.[itemKey]?.name || itemKey;
    }

    function getHarvestIcon(itemKey) {
        return harvestIcons[itemKey]
            || gardenAssets.PLANTS?.[itemKey]?.harvestIcon
            || gardenAssets.PLANTS?.[itemKey]?.stages?.[gardenAssets.PLANTS[itemKey].stages.length - 1]
            || resourceIcons.gold
            || '';
    }

    function escapeHtml(value = '') {
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function syncShellState() {
        const root = getShellRoot();
        const backdrop = document.getElementById('gardenShellBackdrop');
        const sidebar = document.getElementById('gardenSidebar');
        const toolbeltToggle = document.getElementById('toggleToolbeltBtn');
        const guideToggle = document.getElementById('gardenGuideToggle');
        const menuToggles = [
            document.getElementById('gardenMenuToggle'),
            document.getElementById('gardenTopMenuBtn')
        ].filter(Boolean);
        const isSidebarOpen = shellState.sidebarExpanded || shellState.mobileDrawerOpen;

        if (!root) return;

        root.classList.toggle('sidebar-open', isSidebarOpen);
        root.classList.toggle('toolbelt-collapsed', shellState.toolbeltCollapsed);
        root.classList.toggle('dialog-minimized', shellState.dialogMinimized);
        root.classList.toggle('inspector-visible', shellState.inspectorVisible);

        if (sidebar) {
            sidebar.setAttribute('aria-hidden', isSidebarOpen ? 'false' : 'true');
        }
        if (backdrop) {
            backdrop.hidden = !isSidebarOpen;
        }
        if (toolbeltToggle) {
            toolbeltToggle.setAttribute('aria-expanded', shellState.toolbeltCollapsed ? 'false' : 'true');
        }
        if (guideToggle) {
            guideToggle.setAttribute('aria-expanded', shellState.dialogMinimized ? 'false' : 'true');
        }

        menuToggles.forEach((toggle) => {
            toggle.setAttribute('aria-expanded', isSidebarOpen ? 'true' : 'false');
        });

        document.querySelectorAll('[data-shell-target]').forEach((element) => {
            const target = element.getAttribute('data-shell-target');
            element.classList.toggle('is-active', target === shellState.activePanel);
        });

        document.querySelectorAll('.drawer-tab[data-shell-target]').forEach((element) => {
            element.classList.toggle('active', element.getAttribute('data-shell-target') === shellState.activePanel);
        });

        document.querySelectorAll('.drawer-panel[data-sidebar-panel]').forEach((panel) => {
            panel.classList.toggle('active', panel.getAttribute('data-sidebar-panel') === shellState.activePanel);
        });
    }

    function closeSidebar() {
        shellState.sidebarExpanded = false;
        shellState.mobileDrawerOpen = false;
        shellState.questDrawerOpen = false;
        syncShellState();
    }

    function openSidebar(panel = shellState.activePanel) {
        shellState.activePanel = panel;
        if (isMobileViewport()) {
            shellState.mobileDrawerOpen = true;
        } else {
            shellState.sidebarExpanded = true;
        }
        syncShellState();
    }

    function openPanel(panel = 'quests') {
        shellState.activePanel = panel;
        shellState.questDrawerOpen = panel === 'quests';

        if (panel === 'quests') {
            setGuideLine('Theo dõi nhiệm vụ để nhận thêm nước, phân bón và vàng miễn phí mỗi ngày.');
        } else if (panel === 'inventory') {
            setGuideLine('Đây là kho nông sản vừa thu hoạch. Bạn có thể giữ lại hoặc đem quyên góp cho Tông Môn.');
        } else if (panel === 'guide') {
            setGuideLine('Mở các mẹo điều phối để tối ưu nhịp tưới nước, bón phân và thu hoạch.');
        } else if (panel === 'social') {
            setGuideLine('Kết nối với khách ghé thăm và Tông Môn để biến khu vườn thành một điểm tụ hội.');
        }

        openSidebar(panel);
    }

    function toggleSidebar() {
        if ((isMobileViewport() && shellState.mobileDrawerOpen) || (!isMobileViewport() && shellState.sidebarExpanded)) {
            closeSidebar();
            return;
        }
        openSidebar(shellState.activePanel || 'quests');
    }

    function updateQuestSummary() {
        const countEl = document.getElementById('questSummaryCount');
        const statusEl = document.getElementById('questSummaryStatus');
        const quests = Array.isArray(gardenData.dailyQuests) ? gardenData.dailyQuests : [];
        const pending = quests.filter((quest) => quest.complete && !quest.claimed).length;
        const complete = quests.filter((quest) => quest.claimed).length;

        if (countEl) {
            countEl.innerText = String(pending || quests.length || 0);
        }

        if (!statusEl) return;
        if (!quests.length) {
            statusEl.innerText = 'Hôm nay chưa có nhiệm vụ';
        } else if (pending > 0) {
            statusEl.innerText = `${pending} thưởng đang chờ nhận`;
        } else {
            statusEl.innerText = `${complete}/${quests.length} nhiệm vụ đã hoàn tất`;
        }
    }

    function renderInventory(inventory = gardenData.inventory || {}) {
        const list = document.getElementById('gardenInventoryList');
        const summary = document.getElementById('gardenInventorySummary');
        if (!list) return;

        const keys = ['sunflower', 'wheat', 'carrot', 'tomato'];
        const total = keys.reduce((sum, key) => sum + Number(inventory[key] || 0), 0);

        if (summary) {
            summary.innerText = total > 0 ? `${total} nông sản trong túi` : 'Túi đang trống';
        }

        list.innerHTML = keys.map((key) => {
            const count = Number(inventory[key] || 0);
            return `
                <div class="inventory-card">
                    <img src="${escapeHtml(getHarvestIcon(key))}" alt="${escapeHtml(getDisplayNameForItem(key))}">
                    <div>
                        <strong>${escapeHtml(getDisplayNameForItem(key))}</strong>
                        <span>${count} vật phẩm</span>
                    </div>
                </div>
            `;
        }).join('');
    }

    function renderGuideTips() {
        const list = document.getElementById('gardenGuideTips');
        if (!list) return;

        list.innerHTML = guideTips.map((tip, index) => `
            <div class="guide-tip">
                <strong>Mẹo ${index + 1}</strong>
                <div>${escapeHtml(tip)}</div>
            </div>
        `).join('');
    }

    function setGuideLine(text) {
        const line = document.getElementById('gardenGuideLine');
        if (line) line.innerText = text;
    }

    function toggleGuideWidget(force) {
        shellState.dialogMinimized = typeof force === 'boolean'
            ? !force
            : !shellState.dialogMinimized;
        syncShellState();
    }

    function toggleToolbelt(forceCollapsed) {
        shellState.toolbeltCollapsed = typeof forceCollapsed === 'boolean'
            ? forceCollapsed
            : !shellState.toolbeltCollapsed;
        syncShellState();
    }

    function handleViewportMode() {
        if (isMobileViewport()) {
            shellState.sidebarExpanded = false;
            shellState.toolbeltCollapsed = true;
        } else {
            shellState.mobileDrawerOpen = false;
            shellState.toolbeltCollapsed = false;
        }
        syncShellState();
    }

    function getSelectedPlantSprite() {
        const scene = window.sceneContext;
        const sprite = scene?.selectedTile;
        if (!scene || !sprite?.itemData || sprite.itemData.type !== 'plant') return null;
        return sprite;
    }

    function getScenePlotSprite(scene, itemData) {
        return scene?.children?.list?.find((entry) => (
            entry.isGardenItem
            && entry.itemData?.type === 'plot'
            && entry.itemData.x === itemData.x
            && entry.itemData.y === itemData.y
        )) || null;
    }

    function syncSceneItemData(sprite, itemData) {
        if (!sprite?.itemData || !itemData) return;
        Object.assign(sprite.itemData, itemData);
        addGardenItem(itemData);
    }

    function updateFertilizeControls({ visible = false, count = gardenData.fertilizer || 0, disabledReason = '' } = {}) {
        const row = document.getElementById('plantActionRow');
        const btn = document.getElementById('statFertilizeBtn');
        const countEl = document.getElementById('statFertilizerCount');

        if (!row || !btn || !countEl) return;

        row.classList.toggle('active', Boolean(visible));
        countEl.innerText = count;

        const label = fertilizePending
            ? 'DANG BON PHAN...'
            : (disabledReason || 'BON PHAN (+1 CAP)');
        btn.disabled = fertilizePending || Boolean(disabledReason) || !visible;
        btn.innerText = label;
    }

    async function fertilizeSelectedPlant() {
        const scene = window.sceneContext;
        const sprite = getSelectedPlantSprite();
        if (!window.isOwner || !scene || !sprite || fertilizePending) return;

        fertilizePending = true;
        updateFertilizeControls({ visible: true });

        const response = await apiCall('/my-garden/interact', {
            uniqueId: sprite.itemData._id,
            action: 'fertilize'
        });

        fertilizePending = false;

        if (!response.success) {
            scene.selectItem?.(sprite);
            showToast(response.msg, 'warning');
            return;
        }

        updateHUD(response);

        if (response.plot) {
            const plotSprite = getScenePlotSprite(scene, sprite.itemData);
            if (plotSprite) {
                syncSceneItemData(plotSprite, response.plot);
                plotSprite.setTexture('soil_wet').setDisplaySize(64, 64);
            } else {
                addGardenItem(response.plot);
            }
        }

        if (response.item) {
            syncSceneItemData(sprite, response.item);

            const config = gardenAssets.PLANTS?.[sprite.itemData.itemId];
            if (config) {
                sprite.clearTint?.();
                sprite.setTexture(`plant_${sprite.itemData.itemId}_${sprite.itemData.stage || 0}`);
                sprite
                    .setDisplaySize((config.size?.w || 1) * 64, (config.size?.h || 1) * 64)
                    .setOrigin(0.5, 1);
            }

            scene.updateThirstyIcon?.(sprite, false);
            scene.updatePlantUI?.(sprite);
            scene.selectItem?.(sprite);
            scene.showFloatingText?.(sprite.x, sprite.y - sprite.displayHeight, '+1 CAP', 'blue');
        }

        showToast(response.msg, 'success');
    }

    function formatQuestReward(rewards = {}) {
        const rewardParts = [];

        if (rewards.water) {
            rewardParts.push(`
                <span class="quest-reward-chip">
                    <img src="${escapeHtml(resourceIcons.water || '')}" alt="Nước">
                    <span>+${rewards.water} nước</span>
                </span>
            `);
        }

        if (rewards.fertilizer) {
            rewardParts.push(`
                <span class="quest-reward-chip">
                    <img src="${escapeHtml(resourceIcons.fertilizer || '')}" alt="Phân bón">
                    <span>+${rewards.fertilizer} phân</span>
                </span>
            `);
        }

        if (rewards.gold) {
            rewardParts.push(`
                <span class="quest-reward-chip">
                    <img src="${escapeHtml(resourceIcons.gold || '')}" alt="Vàng">
                    <span>+${rewards.gold} vàng</span>
                </span>
            `);
        }

        return rewardParts.join('');
    }

    function renderDailyQuests(quests = gardenData.dailyQuests || []) {
        const list = document.getElementById('dailyQuestList');
        if (!list) return;

        gardenData.dailyQuests = Array.isArray(quests) ? quests : [];
        updateQuestSummary();

        if (!gardenData.dailyQuests.length) {
            list.innerHTML = '<div class="quest-empty">Hôm nay chưa có nhiệm vụ.</div>';
            return;
        }

        list.innerHTML = gardenData.dailyQuests.map((quest) => {
            const pct = quest.target > 0 ? Math.min(100, Math.round((quest.progress / quest.target) * 100)) : 0;
            const cardClass = [
                'quest-card',
                quest.claimed ? 'claimed' : '',
                (!quest.claimed && quest.complete) ? 'complete' : ''
            ].filter(Boolean).join(' ');

            let buttonLabel = 'Đang làm';
            if (quest.claimed) buttonLabel = 'Đã nhận';
            else if (quest.complete) buttonLabel = 'Nhận thưởng';

            return `
                <div class="${cardClass}">
                    <div class="quest-topline">
                        <strong class="quest-title">${escapeHtml(quest.title)}</strong>
                        <span class="quest-progress-label">${quest.progress}/${quest.target}</span>
                    </div>
                    <div class="quest-desc">${escapeHtml(quest.description)}</div>
                    <div class="quest-progress">
                        <div class="quest-progress-fill" style="width:${pct}%"></div>
                    </div>
                    <div class="quest-bottomline">
                        <span class="quest-reward">${formatQuestReward(quest.rewards)}</span>
                        <button
                            class="quest-claim-btn"
                            data-quest-id="${quest.id}"
                            ${quest.complete && !quest.claimed ? '' : 'disabled'}
                        >${buttonLabel}</button>
                    </div>
                </div>
            `;
        }).join('');
    }

    async function claimQuest(questId) {
        if (!questId) return;

        const response = await apiCall('/my-garden/claim-quest', { questId });
        if (!response.success) {
            showToast(response.msg, 'warning');
            return;
        }

        updateHUD(response);
        renderDailyQuests(response.dailyQuests || []);
        showToast(response.msg, 'success');
    }

    function toggleToolAvailability(toolName) {
        document.querySelectorAll('.tool-slot').forEach((element) => {
            const tool = element.getAttribute('data-tool');
            const allowShop = tool === 'shop' && (toolName === 'cursor' || toolName === null);

            if (allowShop || toolName === null || tool === toolName) {
                element.classList.remove('disabled-tool');
            } else {
                element.classList.add('disabled-tool');
            }
        });
    }

    function setAllowedTool(toolName) {
        window.allowedTutorialTool = toolName;
        toggleToolAvailability(toolName);
    }

    function togglePlantingUI(active, itemName = '') {
        const ui = document.getElementById('plantingModeUI');
        const toolbar = document.getElementById('mainToolbar');
        if (!ui || !toolbar) return;

        if (active) {
            ui.style.display = 'flex';
            const label = document.getElementById('plantingItemName');
            if (label) label.innerText = itemName;
            toolbar.classList.add('disabled-toolbar');
            hidePlantStats();
        } else {
            ui.style.display = 'none';
            toolbar.classList.remove('disabled-toolbar');
        }
    }

    function renderPlantStats(itemData) {
        const panel = document.getElementById('plantStats');
        if (!panel) return;

        const isPlot = itemData.type === 'plot';
        const config = isPlot ? null : gardenAssets.PLANTS?.[itemData.itemId];
        if (!isPlot && !config) {
            hidePlantStats();
            return;
        }

        panel.classList.add('active');

        const render = () => {
            if (isPlot) {
                document.getElementById('statName').innerText = 'Ô Đất Trống';
                document.getElementById('statImg').src = '/api/pro-images/1767291175911-ytf6vu.png';
                document.getElementById('statStageBadge').innerText = 'Sẵn sàng';
                document.getElementById('statStageBadge').className = 'pixel-badge grey';
                document.getElementById('statGrowthBar').style.width = '0%';
                document.getElementById('statWitherBar').style.width = '0%';
                document.getElementById('statTimeProgress').innerText = '--%';
                document.getElementById('statWitherVal').innerText = '--%';
                document.getElementById('statTotalTime').innerText = '---';
                document.getElementById('statPrice').innerText = '---';
                document.getElementById('statWateringTime').innerText = '---';
                document.getElementById('statStageTime').innerText = '---';
                document.getElementById('statSoilStatus').innerText = 'Đất trống';
                document.getElementById('statSoilStatus').style.color = '';
                updateFertilizeControls({ visible: false });
                return;
            }

            document.getElementById('statName').innerText = config.name;
            document.getElementById('statImg').src = config.stages[itemData.stage || 0];
            document.getElementById('statPrice').innerText = `${config.rewardGold.min}-${config.rewardGold.max}`;

            const now = Date.now();
            const lastUpdate = itemData.lastUpdated
                ? new Date(itemData.lastUpdated).getTime()
                : new Date(itemData.plantedAt).getTime();
            const elapsed = now - lastUpdate;

            const plot = getGardenItems().find((entry) => entry.type === 'plot' && entry.x === itemData.x && entry.y === itemData.y);
            const isWet = Boolean(plot?.lastWatered) && (now - new Date(plot.lastWatered).getTime() < 24 * 3600000);

            document.getElementById('statSoilStatus').innerText = isWet ? '💧 Đất ẩm' : '🌵 Đất khô';
            document.getElementById('statSoilStatus').style.color = isWet ? '#29b6f6' : '#ef5350';

            const currentProgress = (itemData.growthProgress || 0) + (isWet ? elapsed : 0);
            const timePerStage = parseDuration(config.growthTime);
            const maxStage = config.maxStage || 3;
            const stage = Math.min(Math.floor(currentProgress / timePerStage), maxStage);
            const pct = Math.min(100, ((currentProgress % timePerStage) / timePerStage) * 100);

            if (stage >= maxStage) {
                document.getElementById('statGrowthBar').style.width = '100%';
                document.getElementById('statTimeProgress').innerText = 'MAX';
                document.getElementById('statStageBadge').innerText = 'ĐÃ CHÍN';
                document.getElementById('statStageBadge').className = 'pixel-badge green';
                document.getElementById('statTotalTime').innerText = 'Thu hoạch!';
                document.getElementById('statStageTime').innerText = '---';
            } else {
                document.getElementById('statGrowthBar').style.width = `${pct}%`;
                document.getElementById('statTimeProgress').innerText = `${Math.floor(pct)}%`;
                document.getElementById('statStageBadge').innerText = `Cấp ${stage + 1}/${maxStage + 1}`;
                document.getElementById('statStageBadge').className = 'pixel-badge yellow';
                const remaining = timePerStage - (currentProgress % timePerStage);
                const formattedRemaining = formatTime(remaining);
                document.getElementById('statTotalTime').innerText = formattedRemaining;
                document.getElementById('statStageTime').innerText = formattedRemaining;
            }

            const witherTime = parseDuration(config.witherTime || '30 phút');
            const lastWaterTime = plot?.lastWatered
                ? new Date(plot.lastWatered).getTime()
                : new Date(itemData.plantedAt).getTime();
            const timeSinceWater = now - lastWaterTime;
            const witherProgress = Math.max(0, timeSinceWater - (24 * 3600000));
            const healthPct = Math.max(0, 100 - ((witherProgress / witherTime) * 100));

            document.getElementById('statWitherBar').style.width = `${healthPct}%`;
            document.getElementById('statWitherVal').innerText = `${Math.floor(healthPct)}%`;

            const remainingWaterTime = witherTime - witherProgress;
            document.getElementById('statWateringTime').innerText = formatTime(Math.max(0, remainingWaterTime));
            document.getElementById('statWateringTime').style.color = healthPct > 50 ? '#29b6f6' : (healthPct > 20 ? '#ffa726' : '#ef5350');

            let disabledReason = '';
            if (itemData.isDead) {
                disabledReason = 'CAY DA CHET';
            } else if (stage >= maxStage) {
                disabledReason = 'DA SAN SANG THU HOACH';
            } else if ((gardenData.fertilizer || 0) <= 0) {
                disabledReason = 'HET PHAN BON';
            }

            updateFertilizeControls({
                visible: Boolean(window.isOwner),
                count: gardenData.fertilizer || 0,
                disabledReason
            });

            if (healthPct > 0 && !isWet && remainingWaterTime > 0) {
                document.getElementById('statSoilStatus').innerText = `🌵 Đất khô - Tưới trong ${formatTime(remainingWaterTime)}`;
            } else if (isWet) {
                document.getElementById('statSoilStatus').innerText = `💧 Đất ẩm - Còn ${formatTime((24 * 3600000) - timeSinceWater)}`;
            } else {
                document.getElementById('statSoilStatus').innerText = '☠️ Đất quá khô - Cây sắp chết!';
            }
        };

        render();
        statsInterval = setInterval(render, 1000);
    }

    function showPlantStats(itemData) {
        if (statsInterval) clearInterval(statsInterval);
        shellState.inspectorVisible = true;
        setGuideLine('Đang xem cây trồng. Bạn có thể tưới nước, bón phân hoặc đổi công cụ ngay trên canvas.');
        syncShellState();
        renderPlantStats(itemData);
    }

    function hidePlantStats() {
        if (statsInterval) clearInterval(statsInterval);
        statsInterval = null;
        shellState.inspectorVisible = false;
        const panel = document.getElementById('plantStats');
        if (panel) panel.classList.remove('active');
        updateFertilizeControls({ visible: false });
        syncShellState();
    }

    function openShopHTML(tab = 'plant') {
        const overlay = document.getElementById('shopOverlay');
        if (!overlay) return;

        closeSidebar();
        setGuideLine('Tàng Bảo Các đã mở. Chọn hạt giống hoặc trang trí rồi trở lại khu vườn để đặt vật phẩm.');
        overlay.style.display = 'flex';
        document.getElementById('shop-npc-state').style.display = 'flex';
        document.getElementById('shop-item-state').style.display = 'none';
        selectedShopItem = null;

        const goldEl = document.getElementById('shop-user-gold');
        if (goldEl) goldEl.innerText = gardenData.gold || 0;

        renderShopItems(tab);
        if (window.gameEvents) window.gameEvents.emit('shopOpen');
    }

    function closeShop() {
        const overlay = document.getElementById('shopOverlay');
        if (overlay) overlay.style.display = 'none';
        setGuideLine('Khu vườn đã sẵn sàng. Chọn công cụ ở thanh dưới hoặc mở bảng điều hướng để xem nhiệm vụ.');
    }

    function getShopItems(type) {
        const items = [];
        if (type === 'plant') {
            Object.entries(gardenAssets.PLANTS || {}).forEach(([key, value]) => {
                items.push({ id: key, ...value, buyPrice: value.price, category: 'plant' });
            });
        } else if (type === 'decor') {
            Object.entries(gardenAssets.DECORS || {}).forEach(([key, value]) => {
                items.push({ id: key, ...value, buyPrice: value.price, category: 'decor' });
            });
        }
        return items;
    }

    function selectShopItem(item, isLocked, cardElement) {
        selectedShopItem = item;
        document.querySelectorAll('.shop-card').forEach((card) => card.classList.remove('selected'));
        if (cardElement) cardElement.classList.add('selected');

        document.getElementById('shop-npc-state').style.display = 'none';
        document.getElementById('shop-item-state').style.display = 'flex';

        const icon = item.icon || (item.stages ? item.stages[item.stages.length - 1] : item.image);
        document.getElementById('d-img').src = icon;
        document.getElementById('d-name').innerText = item.name;
        document.getElementById('d-type').innerText = item.category === 'plant' ? 'Hạt Giống' : 'Trang Trí';

        const levelEl = document.getElementById('d-level');
        levelEl.innerText = `Cấp ${item.unlockLevel || 1}`;
        levelEl.style.color = isLocked ? '#ef5350' : '#33691e';
        if (isLocked) levelEl.innerHTML += ' <i class="fas fa-exclamation-circle"></i>';

        if (item.category === 'plant') {
            document.getElementById('d-time').innerText = item.growthTime || 'Unknown';
            document.getElementById('d-xp').innerText = `${item.rewardXP || 0} XP`;
        } else {
            document.getElementById('d-time').innerText = 'Vĩnh viễn';
            document.getElementById('d-xp').innerText = 'Trang trí';
        }

        const price = item.buyPrice !== undefined ? item.buyPrice : 0;
        document.getElementById('d-price').innerText = `${price} Xu`;

        const btn = document.getElementById('btn-confirm-buy');
        const userGold = gardenData.gold || 0;

        if (isLocked) {
            btn.disabled = true;
            btn.innerText = `CẦN LEVEL ${item.unlockLevel || 1}`;
            btn.style.background = '#9e9e9e';
            btn.style.borderColor = '#616161';
        } else if (userGold < price) {
            btn.disabled = true;
            btn.innerText = 'KHÔNG ĐỦ TIỀN';
            btn.style.background = '#ef5350';
            btn.style.borderColor = '#b71c1c';
        } else {
            btn.disabled = false;
            btn.innerText = 'MUA & TRỒNG';
            btn.style.background = 'var(--accent-green)';
            btn.style.borderColor = '#2e7d32';
        }
    }

    function renderShopItems(type) {
        document.querySelectorAll('.pixel-tab').forEach((tab) => tab.classList.remove('active'));
        const tabBtn = document.getElementById(`tab-${type}`);
        if (tabBtn) tabBtn.classList.add('active');

        const container = document.getElementById('shopGrid');
        if (!container) return;

        container.innerHTML = '';
        const items = getShopItems(type);
        const userLevel = gardenData.userLevel || 1;

        if (items.length === 0) {
            container.innerHTML = '<div style="padding:40px; text-align:center; width:100%; color:#8d6e63; font-style:italic;">(Trống trơn...)</div>';
            return;
        }

        items.forEach((item) => {
            const requiredLevel = item.unlockLevel || 1;
            const isLocked = userLevel < requiredLevel;
            const icon = item.icon || (item.stages ? item.stages[item.stages.length - 1] : item.image);
            const card = document.createElement('div');
            card.className = `shop-card ${isLocked ? 'locked' : ''}`;
            card.addEventListener('click', () => selectShopItem(item, isLocked, card));

            const displayPrice = item.buyPrice !== undefined ? item.buyPrice : '??';
            const lockHtml = isLocked
                ? `
                    <div class="lock-overlay"><i class="fas fa-lock"></i></div>
                    <div class="req-level">Lv ${requiredLevel}</div>
                `
                : '';

            card.innerHTML = `
                ${lockHtml}
                <img src="${icon}">
                <div class="name">${item.name}</div>
                <div class="price">💰 ${displayPrice}</div>
            `;
            container.appendChild(card);
        });
    }

    function confirmBuy() {
        if (!selectedShopItem || !window.gameEvents) return;
        window.gameEvents.emit('buyItem', { id: selectedShopItem.id, type: selectedShopItem.category });
        closeShop();
    }

    function selectTool(toolName) {
        const toolbar = document.getElementById('mainToolbar');
        if (toolbar?.classList.contains('disabled-toolbar')) return;
        if (window.allowedTutorialTool !== null && window.allowedTutorialTool !== toolName) return;

        if (window.gameEvents) window.gameEvents.emit('toolChanged', toolName);
        document.querySelectorAll('.tool-slot').forEach((element) => element.classList.remove('active'));
        const activeEl = document.querySelector(`.tool-slot[data-tool="${toolName}"]`);
        if (activeEl) activeEl.classList.add('active');
    }

    function toggleMoveMode() {
        const btn = document.getElementById('mobileMoveBtn');
        if (btn) btn.classList.toggle('active');
        if (window.gameEvents) window.gameEvents.emit('toggleMoveMode');
    }

    function updateMobileMoveBtn(show) {
        const btn = document.getElementById('mobileMoveBtn');
        if (!btn) return;
        btn.style.display = show ? 'flex' : 'none';
        if (!show) btn.classList.remove('active');
    }

    function bindKeyboardShortcuts() {
        if (keyboardBound) return;
        keyboardBound = true;

        document.addEventListener('keydown', (event) => {
            if (['INPUT', 'TEXTAREA'].includes(event.target.tagName)) return;

            const key = event.key.toLowerCase();
            const isOwner = window.isOwner;
            if (key === 'x') {
                window.cancelPlanting?.();
                return;
            }

            if (key === 'escape') {
                closeShop();
                hidePlantStats();
                closeSidebar();
                toggleGuideWidget(false);
                window.cancelPlanting?.();
                return;
            }

            const tools = { '1': 'move', '2': 'cursor', '3': 'hoe', '4': 'water', '5': 'basket', '6': 'shovel' };
            if (tools[key]) {
                const toolName = tools[key];
                if (window.allowedTutorialTool !== null && window.allowedTutorialTool !== toolName) return;
                if (isOwner || ['1', '2'].includes(key)) selectTool(toolName);
            }

            if (key === 'f' && isOwner) {
                if (window.allowedTutorialTool !== null && window.allowedTutorialTool !== 'cursor') return;
                openShopHTML('plant');
            }
        });
    }

    function bindDomActions() {
        if (domActionsBound) return;
        domActionsBound = true;

        document.getElementById('gardenMenuToggle')?.addEventListener('click', () => {
            toggleSidebar();
        });

        document.getElementById('gardenTopMenuBtn')?.addEventListener('click', () => {
            toggleSidebar();
        });

        document.getElementById('gardenMenuClose')?.addEventListener('click', () => {
            closeSidebar();
        });

        document.getElementById('gardenShellBackdrop')?.addEventListener('click', () => {
            closeSidebar();
        });

        document.querySelectorAll('[data-shell-target]').forEach((element) => {
            element.addEventListener('click', () => {
                const target = element.getAttribute('data-shell-target') || 'quests';
                openPanel(target);
            });
        });

        document.getElementById('toggleToolbeltBtn')?.addEventListener('click', () => {
            toggleToolbelt();
        });

        document.getElementById('gardenGuideToggle')?.addEventListener('click', () => {
            toggleGuideWidget(shellState.dialogMinimized);
        });

        document.getElementById('cancelPlantingBtn')?.addEventListener('click', () => {
            window.cancelPlanting?.();
        });

        document.getElementById('mobileMoveBtn')?.addEventListener('click', () => {
            toggleMoveMode();
        });

        document.getElementById('closePlantStatsBtn')?.addEventListener('click', () => {
            hidePlantStats();
        });

        document.getElementById('closeShopBtn')?.addEventListener('click', () => {
            closeShop();
        });

        document.getElementById('btn-confirm-buy')?.addEventListener('click', () => {
            confirmBuy();
        });

        document.getElementById('statFertilizeBtn')?.addEventListener('click', () => {
            fertilizeSelectedPlant();
        });

        document.getElementById('dailyQuestList')?.addEventListener('click', (event) => {
            const button = event.target.closest('.quest-claim-btn[data-quest-id]');
            if (!button || button.disabled) return;
            claimQuest(button.getAttribute('data-quest-id'));
        });

        document.querySelectorAll('.tool-slot[data-tool]').forEach((element) => {
            element.addEventListener('click', () => {
                const tool = element.getAttribute('data-tool');
                if (tool === 'shop') {
                    openShopHTML(element.getAttribute('data-shop-tab') || 'plant');
                    return;
                }

                selectTool(tool);
            });
        });

        document.querySelectorAll('.pixel-tab[data-shop-tab]').forEach((element) => {
            element.addEventListener('click', () => {
                renderShopItems(element.getAttribute('data-shop-tab') || 'plant');
            });
        });

        // Garden dropdown toggle
        document.getElementById('gardenStatusDropdownBtn')?.addEventListener('click', (event) => {
            event.stopPropagation();
            toggleGardenDropdown();
        });

        // Close dropdown when clicking outside
        document.addEventListener('click', (event) => {
            const dropdown = document.getElementById('gardenStatusDropdownMenu');
            const btn = document.getElementById('gardenStatusDropdownBtn');
            if (dropdown && btn && !dropdown.contains(event.target) && !btn.contains(event.target)) {
                closeGardenDropdown();
            }
        });

        window.addEventListener('resize', handleViewportMode);
    }

    function toggleGardenDropdown() {
        const dropdown = document.getElementById('gardenStatusDropdownMenu');
        if (!dropdown) return;

        const isOpen = dropdown.getAttribute('aria-hidden') === 'false';
        if (isOpen) {
            closeGardenDropdown();
        } else {
            openGardenDropdown();
        }
    }

    function openGardenDropdown() {
        const dropdown = document.getElementById('gardenStatusDropdownMenu');
        const btn = document.getElementById('gardenStatusDropdownBtn');
        if (!dropdown || !btn) return;

        dropdown.setAttribute('aria-hidden', 'false');
        btn.setAttribute('aria-expanded', 'true');
    }

    function closeGardenDropdown() {
        const dropdown = document.getElementById('gardenStatusDropdownMenu');
        const btn = document.getElementById('gardenStatusDropdownBtn');
        if (!dropdown || !btn) return;

        dropdown.setAttribute('aria-hidden', 'true');
        btn.setAttribute('aria-expanded', 'false');
    }

    function updateGardenDropdownContent(gardenInfo = {}) {
        // Update visitor count or owner name based on context
        const visitorCountEl = document.getElementById('dropdownVisitorCount');
        if (visitorCountEl && gardenInfo.visitorCount !== undefined) {
            visitorCountEl.textContent = String(gardenInfo.visitorCount);
        }

        const ownerNameEl = document.getElementById('dropdownOwnerName');
        if (ownerNameEl && gardenInfo.ownerName !== undefined) {
            ownerNameEl.textContent = gardenInfo.ownerName;
        }

        const gardenNameEl = document.getElementById('dropdownGardenName');
        if (gardenNameEl && gardenInfo.gardenName !== undefined) {
            gardenNameEl.textContent = gardenInfo.gardenName;
        }

        const guildNameEl = document.getElementById('dropdownGuildName');
        if (guildNameEl && gardenInfo.guildName !== undefined) {
            guildNameEl.textContent = gardenInfo.guildName;
        }
    }

    function toggleQuestDrawer() {
        const isOpen = shellState.questDrawerOpen
            && shellState.activePanel === 'quests'
            && (shellState.sidebarExpanded || shellState.mobileDrawerOpen);
        if (isOpen) {
            closeQuestDrawer();
        } else {
            openQuestDrawer();
        }
    }

    function openQuestDrawer() {
        shellState.questDrawerOpen = true;
        openPanel('quests');
        return;

        const drawer = document.getElementById('questSideDrawer');
        if (!drawer) return;

        shellState.questDrawerOpen = true;
        drawer.setAttribute('aria-hidden', 'false');
        document.getElementById('gardenShellBackdrop')?.removeAttribute('hidden');
        syncShellState();

        // Populate quest list in drawer
        const questDrawerList = document.getElementById('questDrawerList');
        if (questDrawerList) {
            const quests = Array.isArray(gardenData.dailyQuests) ? gardenData.dailyQuests : [];
            questDrawerList.innerHTML = quests.length > 0
                ? quests.map((quest) => {
                    const pct = quest.target > 0 ? Math.min(100, Math.round((quest.progress / quest.target) * 100)) : 0;
                    const cardClass = [
                        'quest-card',
                        quest.claimed ? 'claimed' : '',
                        (!quest.claimed && quest.complete) ? 'complete' : ''
                    ].filter(Boolean).join(' ');

                    let buttonLabel = 'Đang làm';
                    if (quest.claimed) buttonLabel = 'Đã nhận';
                    else if (quest.complete) buttonLabel = 'Nhận thưởng';

                    return `
                        <div class="${cardClass}">
                            <div class="quest-topline">
                                <strong class="quest-title">${escapeHtml(quest.title)}</strong>
                                <span class="quest-progress-label">${quest.progress}/${quest.target}</span>
                            </div>
                            <div class="quest-desc">${escapeHtml(quest.description)}</div>
                            <div class="quest-progress">
                                <div class="quest-progress-fill" style="width:${pct}%"></div>
                            </div>
                            <div class="quest-bottomline">
                                <span class="quest-reward">${formatQuestReward(quest.rewards)}</span>
                                <button
                                    class="quest-claim-btn"
                                    data-quest-id="${quest.id}"
                                    ${quest.complete && !quest.claimed ? '' : 'disabled'}
                                >${buttonLabel}</button>
                            </div>
                        </div>
                    `;
                }).join('')
                : '<div style="padding:20px; text-align:center; color:#8d6e63;">Hôm nay chưa có nhiệm vụ</div>';
        }
    }

    function closeQuestDrawer() {
        shellState.questDrawerOpen = false;
        if (shellState.activePanel === 'quests') {
            closeSidebar();
            return;
        }
        syncShellState();
        return;

        const drawer = document.getElementById('questSideDrawer');
        if (!drawer) return;

        shellState.questDrawerOpen = false;
        drawer.setAttribute('aria-hidden', 'true');
        syncShellState();
    }

    function startKeepAlivePing() {
        if (keepAliveStarted) return;
        keepAliveStarted = true;

        const interval = 10 * 60 * 1000;
        setInterval(() => {
            fetch('/api/ping').catch((error) => {
                console.warn('Keep-alive failed:', error);
            });
        }, interval);
    }

    function initLoadingSystem() {
        const LoadingSystem = {
            tips: [
                "Dùng 'Thủy Linh Quyết' (Tưới nước) thường xuyên để Linh Thảo hấp thụ tinh hoa nhật nguyệt.",
                "Gặp cây khô héo, hãy dùng Xẻng để 'Đoạn Tuyệt Duyên Trần', tránh làm ô uế linh mạch.",
                "Muốn đột phá cảnh giới nhanh chóng? Hãy ghé 'Tàng Bảo Các' (Shop) mua hạt giống Thiên Phẩm.",
                "Thường xuyên du ngoạn Động Phủ của các đạo hữu khác để đàm đạo và học hỏi pháp trận.",
                "Mỗi loại Linh Dược đều có thời khắc 'Độ Kiếp' (Chín) khác nhau, chớ để lỡ thời cơ thu hoạch.",
                "Tích lũy Linh Thạch để mở rộng ranh giới Linh Điền, xây dựng cơ đồ vạn năm.",
                'Tâm bất biến giữa dòng đời vạn biến, nhưng cây thiếu nước thì... chết chắc.'
            ],
            steps: [
                { pct: 10, text: 'Đang hấp thụ Thiên Địa Linh Khí...' },
                { pct: 25, text: 'Đang ngưng tụ hình hài Vạn Vật...' },
                { pct: 45, text: 'Đang khai mở không gian Linh Điền...' },
                { pct: 60, text: 'Triệu hồi Thổ Địa cai quản...' },
                { pct: 75, text: 'Đang khắc họa Tụ Linh Trận...' },
                { pct: 85, text: 'Ổn định Tâm Ma, củng cố Đạo Tâm...' },
                { pct: 95, text: 'Sắp hoàn tất Độ Kiếp...' }
            ],
            currentPct: 0,
            interval: null,
            init() {
                const tip = this.tips[Math.floor(Math.random() * this.tips.length)];
                const tipEl = document.getElementById('load-tip-text');
                if (tipEl) tipEl.innerText = tip;

                this.interval = setInterval(() => {
                    if (this.currentPct < 90) {
                        this.currentPct += Math.random() * 5;
                        this.updateUI();
                    }
                }, 200);
            },
            updateUI() {
                const pct = Math.min(100, Math.floor(this.currentPct));
                const bar = document.getElementById('load-bar');
                const percent = document.getElementById('load-percent');
                if (bar) bar.style.width = `${pct}%`;
                if (percent) percent.innerText = pct;

                const step = this.steps.slice().reverse().find((entry) => pct >= entry.pct);
                const status = document.getElementById('load-status-text');
                if (step && status) status.innerText = step.text;
            },
            finish() {
                clearInterval(this.interval);
                this.currentPct = 100;
                this.updateUI();

                const status = document.getElementById('load-status-text');
                if (status) status.innerText = 'Đại Đạo Đã Thành! Nhập Định!';

                setTimeout(() => {
                    const el = document.getElementById('rustic-loading');
                    if (!el) return;
                    el.style.opacity = '0';
                    setTimeout(() => {
                        el.style.display = 'none';
                        if (window.Tutorial && !window.Tutorial.active) {
                            // window.Tutorial.init();
                        }
                    }, 600);
                }, 800);
            }
        };

        LoadingSystem.init();
        window.finishLoading = () => LoadingSystem.finish();
    }

    function initGardenPage() {
        helpers.applyGardenDefaults?.(gardenData);
        window.allowedTutorialTool = null;
        setAllowedTool(null);
        bindDomActions();
        bindKeyboardShortcuts();
        renderInventory(gardenData.inventory || {});
        renderDailyQuests(gardenData.dailyQuests || []);
        renderGuideTips();
        setGuideLine('Chạm vào cây hoặc ô đất để xem thông tin nhanh. Mở bảng điều hướng để xem nhiệm vụ, vật phẩm và mẹo canh tác.');
        handleViewportMode();
        syncShellState();
        startKeepAlivePing();
        initLoadingSystem();
    }

    window.setAllowedTool = setAllowedTool;
    window.togglePlantingUI = togglePlantingUI;
    window.showPlantStats = showPlantStats;
    window.hidePlantStats = hidePlantStats;
    window.openShopHTML = openShopHTML;
    window.closeShop = closeShop;
    window.renderShopItems = renderShopItems;
    window.confirmBuy = confirmBuy;
    window.selectTool = selectTool;
    window.toggleMoveMode = toggleMoveMode;
    window.updateMobileMoveBtn = updateMobileMoveBtn;
    window.renderDailyQuests = renderDailyQuests;
    window.renderGardenInventory = renderInventory;
    window.openGardenPanel = openPanel;
    window.updateGardenDropdownContent = updateGardenDropdownContent;
    window.toggleQuestDrawer = toggleQuestDrawer;
    window.openQuestDrawer = openQuestDrawer;
    window.closeQuestDrawer = closeQuestDrawer;
    window.initGardenPage = initGardenPage;
})(window);
