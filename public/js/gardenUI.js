(function attachGardenUI(window) {
    const gardenAssets = window.gardenAssets || {};
    const gardenData = window.gardenData || {};
    const helpers = window.GardenShared || {};
    const formatTime = helpers.formatTime || ((value) => `${value}`);
    const parseDuration = helpers.parseDuration || (() => 5 * 60 * 1000);
    const apiCall = helpers.apiCall || (async () => ({ success: false, msg: 'Mất kết nối server!' }));
    const updateHUD = helpers.updateHUD || (() => { });
    const addGardenItem = helpers.addGardenItem || (() => { });
    const showToast = helpers.showToast || ((msg) => console.log(msg));

    let selectedShopItem = null;
    let selectedInventoryKey = null;
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

    const inventoryContributionValues = Object.freeze({
        sunflower: 20,
        wheat: 35,
        carrot: 60,
        tomato: 120,
        watermelon: 1000,
        chili_pepper: 300
    });

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

    function getInventoryKeys() {
        return Object.keys(gardenAssets.PLANTS || {});
    }

    function formatDurationLong(value) {
        const ms = typeof value === 'number' ? value : parseDuration(value);
        const totalMinutes = Math.max(0, Math.round(ms / 60000));
        const days = Math.floor(totalMinutes / (24 * 60));
        const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
        const minutes = totalMinutes % 60;
        const parts = [];

        if (days > 0) parts.push(`${days} ngày`);
        if (hours > 0) parts.push(`${hours} giờ`);
        if (minutes > 0 || !parts.length) parts.push(`${minutes} phút`);

        return parts.join(' ');
    }

    function getInventoryStageCount(config = {}) {
        if (Array.isArray(config.stages) && config.stages.length) {
            return config.stages.length;
        }
        return Math.max(1, Number(config.maxStage || 0) + 1);
    }

    function getAverageGold(config = {}) {
        const min = Number(config.rewardGold?.min || 0);
        const max = Number(config.rewardGold?.max || 0);
        if (!min && !max) return 0;
        return Math.round((min + max) / 2);
    }

    function getInventoryTier(config = {}) {
        const unlockLevel = Number(config.unlockLevel || 1);
        const avgGold = getAverageGold(config);

        if (unlockLevel >= 21 || avgGold >= 2500) {
            return { label: 'Huyền thoại', tone: 'legendary' };
        }
        if (unlockLevel >= 15 || avgGold >= 700) {
            return { label: 'Sử thi', tone: 'epic' };
        }
        if (unlockLevel >= 8 || avgGold >= 250) {
            return { label: 'Hiếm', tone: 'rare' };
        }
        if (unlockLevel >= 3 || avgGold >= 120) {
            return { label: 'Khá hiếm', tone: 'uncommon' };
        }
        return { label: 'Phổ thông', tone: 'common' };
    }

    function getCareDifficulty(config = {}) {
        const totalMs = parseDuration(config.totalTime || config.growthTime);
        const witherMs = parseDuration(config.witherTime || '30 phut');
        const ratio = totalMs > 0 ? witherMs / totalMs : 0;

        if (ratio <= 1) return 'Canh sát, dễ lỡ nhịp';
        if (ratio <= 2) return 'Cần để mắt thường xuyên';
        if (ratio <= 6) return 'Chăm vừa tay';
        return 'Rất dễ duy trì';
    }

    function getRotationProfile(config = {}) {
        const totalMinutes = Math.max(1, Math.round(parseDuration(config.totalTime || config.growthTime) / 60000));

        if (totalMinutes <= 25) return 'Xoay vòng cực nhanh';
        if (totalMinutes <= 70) return 'Luân canh cân bằng';
        if (totalMinutes <= 240) return 'Đầu tư trung hạn';
        return 'Farm dài hơi';
    }

    function getUsageRole(config = {}) {
        if (config.isMultiHarvest && Number(config.unlockLevel || 0) >= 15) {
            return 'Trụ cột tái thu hoạch';
        }
        if (config.isMultiHarvest) {
            return 'Nhịp farm bền bỉ';
        }
        if (Number(config.unlockLevel || 0) <= 2) {
            return 'Món mở kho đầu game';
        }
        if (Number(config.rewardXP || 0) >= 5000) {
            return 'Nguồn đột phá kinh nghiệm';
        }
        return 'Nguồn thu hoạch ổn định';
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

    function setShopOpenState(isOpen) {
        const root = getShellRoot();
        if (!root) return;
        root.classList.toggle('shop-open', Boolean(isOpen));
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
        } else if (panel === 'guide') {
            setGuideLine('Mở các mẹo điều phối để tối ưu nhịp tưới nước, bón phân và thu hoạch.');
        } else if (panel === 'social') {
            setGuideLine('Kết nối với khách ghé thăm và Tông Môn để biến khu vườn thành một điểm tụ hội.');
        }

        openSidebar(panel);
    }

    let inventoryFilterTab = 'all';
    let inventorySearchText = '';
    let inventorySortOrder = 'qty-desc';

    function openInventoryModal() {
        const overlay = document.getElementById('inventoryOverlay');
        if (!overlay) return;
        closeSidebar();
        hidePlantStats();
        toggleGuideWidget(false);
        overlay.style.display = 'flex';
        overlay.setAttribute('aria-hidden', 'false');
        setGuideLine('Kho đồ không gian đã mở. Bạn có thể tìm kiếm, lọc và xem thông số nông sản.');
        renderInventory(gardenData.inventory || {});
    }

    function closeInventoryModal() {
        const overlay = document.getElementById('inventoryOverlay');
        if (overlay) {
            overlay.style.display = 'none';
            overlay.setAttribute('aria-hidden', 'true');
        }
        setGuideLine('Khu vườn đã sẵn sàng. Chọn công cụ ở thanh dưới hoặc mở bảng điều hướng để xem nhiệm vụ.');
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
        const modalStatusEl = document.getElementById('questModalSummaryStatus');
        const badgeEl = document.getElementById('questFabBadge');

        const quests = Array.isArray(gardenData.dailyQuests) ? gardenData.dailyQuests : [];
        const pending = quests.filter((quest) => quest.complete && !quest.claimed).length;
        const complete = quests.filter((quest) => quest.claimed).length;

        if (countEl) countEl.innerText = String(pending || quests.length || 0);

        if (badgeEl) {
            if (pending > 0) {
                badgeEl.innerText = String(pending);
                badgeEl.style.display = 'flex';
                badgeEl.parentElement.classList.add('pulse-anim');
            } else {
                badgeEl.style.display = 'none';
                badgeEl.parentElement.classList.remove('pulse-anim');
            }
        }

        if (statusEl) {
            if (!quests.length) {
                statusEl.innerText = 'Hôm nay chưa có nhiệm vụ';
            } else if (pending > 0) {
                statusEl.innerText = `${pending} thưởng đang chờ nhận`;
            } else {
                statusEl.innerText = `${complete}/${quests.length} nhiệm vụ đã hoàn tất`;
            }
        }

        if (modalStatusEl) {
            modalStatusEl.innerText = `Tiến độ: ${complete}/${quests.length} nhiệm vụ hoàn thành`;
        }
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
            ? 'ĐANG BÓN PHÂN...'
            : (disabledReason || 'BÓN PHÂN (+1 CẤP)');
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

    async function harvestMultiplePlants(filterFn) {
        if (!window.isOwner) return;
        
        const items = getGardenItems();
        const toHarvest = items.filter(item => {
            if (item.type !== 'plant' || item.isDead) return false;
            const config = gardenAssets.PLANTS?.[item.itemId];
            if (!config) return false;
            if (item.stage < config.maxStage) return false;
            return filterFn ? filterFn(item) : true;
        });

        if (toHarvest.length === 0) {
            showToast('Không có cây nào sẵn sàng thu hoạch!', 'info');
            return;
        }

        const actions = toHarvest.map(item => ({
            action: 'harvest',
            payload: { uniqueId: item._id }
        }));

        const response = await apiCall('/my-garden/batch', { actions });
        if (!response.success) {
            showToast(response.msg, 'warning');
            return;
        }

        updateHUD(response.garden);

        const successes = response.results.filter(r => r.success);
        if (successes.length > 0) {
            let totalGold = 0;
            let totalXP = 0;
            successes.forEach(res => {
                totalGold += res.goldReward || 0;
                totalXP += res.xpReward || 0;
                
                const scene = window.sceneContext;
                if (scene) {
                    const sprite = scene.children.list.find(s => s.isGardenItem && s.itemData?._id === res.uniqueId);
                    if (sprite) {
                        const itemIndex = gardenData.items.findIndex(i => i._id === res.uniqueId);
                        if (itemIndex > -1) {
                            const itemData = gardenData.items[itemIndex];
                            const config = gardenAssets.PLANTS[itemData.itemId];
                            if (config && config.isMultiHarvest) {
                                const ns = Number.isInteger(config.afterharvestStage) ? config.afterharvestStage : 0;
                                const tps = parseDuration(config.growthTime);
                                itemData.stage = ns;
                                itemData.growthProgress = ns * tps;
                                itemData.witherProgress = 0;
                                itemData.isDead = false;
                                itemData.lastUpdated = new Date();
                                
                                syncSceneItemData(sprite, itemData);
                                sprite.setTexture(`plant_${itemData.itemId}_${ns}`);
                                sprite.setDisplaySize((config.size?.w || 1) * 64, (config.size?.h || 1) * 64).setOrigin(0.5, 1);
                                scene.updatePlantUI?.(sprite);
                            } else {
                                gardenData.items.splice(itemIndex, 1);
                                if (sprite.ui) sprite.ui.destroy();
                                if (sprite.thirstyIcon) sprite.thirstyIcon.destroy();
                                sprite.destroy();
                            }
                        }
                        scene.showFloatingText?.(sprite.x, sprite.y - 64, `+${res.goldReward}G`, 'gold');
                    }
                }
            });
            showToast(`Thu hoạch thành công ${successes.length} cây! +${totalGold} Vàng, +${totalXP} XP`, 'success');
            if (window.gameEvents) window.gameEvents.emit('actionSuccess', { action: 'harvest_batch' });
        } else {
            showToast('Không thể thu hoạch.', 'warning');
        }
        
        hidePlantStats();
    }

    async function waterMultiplePlants(filterFn) {
        if (!window.isOwner) return;

        const items = getGardenItems();
        const now = Date.now();
        
        let targetPlants = items.filter(item => {
            if (item.type !== 'plant' || item.isDead) return false;
            return filterFn ? filterFn(item) : true;
        });

        if (targetPlants.length === 0) {
            showToast('Không có cây nào cần tưới!', 'info');
            return;
        }

        const result = await Swal.fire({
            title: 'Tưới nước',
            text: 'Bạn có muốn tưới luôn những cây đã được tưới (đất ẩm) không?',
            icon: 'question',
            showCancelButton: true,
            showDenyButton: true,
            confirmButtonText: 'Chỉ cây khô',
            denyButtonText: 'Tưới tất cả',
            cancelButtonText: 'Hủy'
        });

        if (result.isDismissed) return;

        const waterAll = result.isDenied;

        targetPlants = targetPlants.filter(item => {
            if (waterAll) return true;
            const plot = items.find(p => p.type === 'plot' && p.x === item.x && p.y === item.y);
            const isWet = Boolean(plot?.lastWatered) && (now - new Date(plot.lastWatered).getTime() < 24 * 3600000);
            return !isWet;
        });

        if (targetPlants.length === 0) {
            showToast('Tất cả các cây được chọn đều đã được tưới!', 'info');
            return;
        }

        const availableWater = gardenData.water || 0;
        if (availableWater < targetPlants.length) {
            showToast(`Bạn chỉ còn ${availableWater} nước, không đủ để tưới ${targetPlants.length} cây!`, 'warning');
            return;
        }

        const actions = targetPlants.map(item => ({
            action: 'water',
            payload: { uniqueId: item._id }
        }));

        const response = await apiCall('/my-garden/batch', { actions });
        if (!response.success) {
            showToast(response.msg, 'warning');
            return;
        }

        updateHUD(response.garden);

        const successes = response.results.filter(r => r.success);
        if (successes.length > 0) {
            successes.forEach(res => {
                const itemIndex = gardenData.items.findIndex(i => i._id === res.uniqueId);
                if (itemIndex > -1) {
                    const itemData = gardenData.items[itemIndex];
                    itemData.witherProgress = 0;
                    
                    const plotIndex = gardenData.items.findIndex(p => p.type === 'plot' && p.x === itemData.x && p.y === itemData.y);
                    if (plotIndex > -1) {
                        gardenData.items[plotIndex].lastWatered = new Date();
                    }

                    const scene = window.sceneContext;
                    if (scene) {
                        const sprite = scene.children.list.find(s => s.isGardenItem && s.itemData?._id === res.uniqueId);
                        if (sprite) {
                            scene.updateThirstyIcon?.(sprite, false);
                            scene.updatePlantUI?.(sprite);
                            scene.waterEmitter?.emitParticleAt(sprite.x, sprite.y - 32, 10);
                        }
                        const plotSprite = scene.children.list.find(s => s.isGardenItem && s.itemData?._id === gardenData.items[plotIndex]?._id);
                        if (plotSprite) {
                            plotSprite.setTexture('soil_wet').setDisplaySize(64, 64);
                        }
                    }
                }
            });
            showToast(`Đã tưới thành công ${successes.length} cây!`, 'success');
            if (window.gameEvents) window.gameEvents.emit('actionSuccess', { action: 'water_batch' });
        } else {
            showToast('Không thể tưới nước.', 'warning');
        }
        
        hidePlantStats();
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
        const list = document.getElementById('questModalList');
        if (!list) return;

        gardenData.dailyQuests = Array.isArray(quests) ? quests : [];
        updateQuestSummary();

        if (!gardenData.dailyQuests.length) {
            list.innerHTML = '<div class="quest-empty"><i class="fas fa-box-open"></i> Hôm nay chưa có nhiệm vụ.</div>';
            return;
        }

        list.innerHTML = gardenData.dailyQuests.map((quest) => {
            const pct = quest.target > 0 ? Math.min(100, Math.round((quest.progress / quest.target) * 100)) : 0;
            const isClaimed = quest.claimed;
            const isComplete = !isClaimed && quest.complete;

            const cardClass = [
                'quest-card-premium',
                isClaimed ? 'claimed' : '',
                isComplete ? 'complete' : ''
            ].filter(Boolean).join(' ');

            let buttonLabel = 'Đang làm';
            if (isClaimed) buttonLabel = 'Đã nhận';
            else if (isComplete) buttonLabel = 'Nhận thưởng';

            // SVG Progress Arc calculation
            const radius = 20;
            const circumference = 2 * Math.PI * radius;
            const strokeDashoffset = circumference - (pct / 100) * circumference;

            return `
                <div class="${cardClass}">
                    ${isComplete ? '<div class="quest-shimmer"></div>' : ''}
                    <div class="quest-type-icon">${quest.icon || '📜'}</div>
                    <div class="quest-content">
                        <div class="quest-topline">
                            <strong class="quest-title">${escapeHtml(quest.title)}</strong>
                        </div>
                        <div class="quest-desc">${escapeHtml(quest.description)}</div>
                        <div class="quest-bottomline">
                            <span class="quest-reward">${formatQuestReward(quest.rewards)}</span>
                        </div>
                    </div>
                    <div class="quest-actions">
                        <div class="quest-progress-ring">
                            <svg width="48" height="48">
                                <circle class="ring-bg" cx="24" cy="24" r="${radius}"></circle>
                                <circle class="ring-fill" cx="24" cy="24" r="${radius}" 
                                    style="stroke-dasharray: ${circumference}; stroke-dashoffset: ${strokeDashoffset};"></circle>
                            </svg>
                            <span class="ring-text">${quest.progress}/${quest.target}</span>
                        </div>
                        <button
                            class="pixel-btn quest-claim-btn ${isComplete ? 'pulse-btn' : ''}"
                            data-quest-id="${quest.id}"
                            ${isComplete ? '' : 'disabled'}
                        >${buttonLabel}</button>
                    </div>
                </div>
            `;
        }).join('');
    }

    function openQuestModal() {
        const overlay = document.getElementById('questModalOverlay');
        if (overlay) {
            overlay.style.display = 'flex';
            requestAnimationFrame(() => overlay.setAttribute('aria-hidden', 'false'));
            renderDailyQuests();
        }
    }

    function closeQuestModal() {
        const overlay = document.getElementById('questModalOverlay');
        if (overlay) {
            overlay.setAttribute('aria-hidden', 'true');
            setTimeout(() => { overlay.style.display = 'none'; }, 250);
        }
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

            const witherMultiplier = gardenData.witherTimeMultiplier || 1;
            const witherTime = parseDuration(config.witherTime || '30 phút') * witherMultiplier;
            
            // Predict current wither progress based on server-side baseline
            const lastWatered = plot?.lastWatered ? new Date(plot.lastWatered).getTime() : 0;
            const wetUntil = lastWatered > 0 ? lastWatered + 24 * 3600000 : 0;
            
            const wetDelta = lastWatered > 0 
                ? Math.max(0, Math.min(now, wetUntil) - Math.max(lastUpdate, lastWatered))
                : 0;
            const dryDelta = Math.max(0, elapsed - wetDelta);
            
            let currentWitherProgress = (itemData.witherProgress || 0);
            if (wetDelta > 0) currentWitherProgress = Math.max(0, currentWitherProgress - wetDelta);
            if (dryDelta > 0 && itemData.stage > 0) currentWitherProgress += dryDelta;

            const healthPct = Math.max(0, 100 - ((currentWitherProgress / witherTime) * 100));

            document.getElementById('statWitherBar').style.width = `${healthPct}%`;
            document.getElementById('statWitherVal').innerText = `${Math.floor(healthPct)}%`;

            const remainingWaterTime = witherTime - currentWitherProgress;
            document.getElementById('statWateringTime').innerText = formatTime(Math.max(0, remainingWaterTime));
            document.getElementById('statWateringTime').style.color = healthPct > 50 ? '#29b6f6' : (healthPct > 20 ? '#ffa726' : '#ef5350');

            let disabledReason = '';
            if (itemData.isDead) {
                disabledReason = 'CÂY ĐÃ CHẾT';
            } else if (stage >= maxStage) {
                disabledReason = 'ĐÃ SẴN SÀNG THU HOẠCH';
            } else if ((gardenData.fertilizer || 0) <= 0) {
                disabledReason = 'HẾT PHÂN BÓN';
            }

            updateFertilizeControls({
                visible: Boolean(window.isOwner),
                count: gardenData.fertilizer || 0,
                disabledReason
            });

            const typeHarvestBtn = document.getElementById('statHarvestTypeBtn');
            const typeHarvestCountSpan = document.getElementById('statHarvestTypeCount');
            const typeWaterBtn = document.getElementById('statWaterTypeBtn');
            const typeWaterCountSpan = document.getElementById('statWaterTypeCount');
            const fertilizerMeta = document.getElementById('statFertilizerMeta');
            const fertBtn = document.getElementById('statFertilizeBtn');
            
            if (window.isOwner && !itemData.isDead) {
                const items = getGardenItems();
                
                // Harvest type button logic
                if (stage >= maxStage && typeHarvestBtn && typeHarvestCountSpan) {
                    const harvestableCount = items.filter(i => {
                        if (i.type !== 'plant' || i.isDead || i.itemId !== itemData.itemId) return false;
                        const cfg = gardenAssets.PLANTS?.[i.itemId];
                        return cfg && i.stage >= (cfg.maxStage || 3);
                    }).length;
                    
                    if (harvestableCount > 1) {
                        typeHarvestBtn.style.display = 'block';
                        typeHarvestCountSpan.innerText = harvestableCount;
                        typeHarvestBtn.setAttribute('data-harvest-item-id', itemData.itemId);
                        if(fertilizerMeta) fertilizerMeta.style.display = 'none';
                        if(fertBtn) fertBtn.style.display = 'none';
                    } else {
                        typeHarvestBtn.style.display = 'none';
                        if(fertilizerMeta) fertilizerMeta.style.display = 'block';
                        if(fertBtn) fertBtn.style.display = 'block';
                    }
                } else {
                    if (typeHarvestBtn) typeHarvestBtn.style.display = 'none';
                    if (fertilizerMeta) fertilizerMeta.style.display = 'block';
                    if (fertBtn) fertBtn.style.display = 'block';
                }

                // Water type button logic
                if (typeWaterBtn && typeWaterCountSpan) {
                    const sameTypeCount = items.filter(i => i.type === 'plant' && !i.isDead && i.itemId === itemData.itemId).length;
                    if (sameTypeCount > 1) {
                        typeWaterBtn.style.display = 'block';
                        typeWaterCountSpan.innerText = sameTypeCount;
                        typeWaterBtn.setAttribute('data-water-item-id', itemData.itemId);
                    } else {
                        typeWaterBtn.style.display = 'none';
                    }
                }
            } else {
                if (typeHarvestBtn) typeHarvestBtn.style.display = 'none';
                if (typeWaterBtn) typeWaterBtn.style.display = 'none';
                if (fertilizerMeta) fertilizerMeta.style.display = 'block';
                if (fertBtn) fertBtn.style.display = 'block';
            }

            if (itemData.isDead) {
                document.getElementById('statSoilStatus').innerText = '☠️ Cây đã chết khô!';
                document.getElementById('statSoilStatus').style.color = '#ef5350';
            } else if (healthPct > 0 && !isWet && remainingWaterTime > 0) {
                document.getElementById('statSoilStatus').innerText = `🌵 Đất khô - Tưới trong ${formatTime(remainingWaterTime)}`;
                document.getElementById('statSoilStatus').style.color = '#ef5350';
            } else if (isWet) {
                const wetRemaining = (24 * 3600000) - (now - lastWatered);
                document.getElementById('statSoilStatus').innerText = `💧 Đất ẩm - Còn ${formatTime(Math.max(0, wetRemaining))}`;
                document.getElementById('statSoilStatus').style.color = '#29b6f6';
            } else {
                document.getElementById('statSoilStatus').innerText = '☠️ Đất quá khô - Cây sắp chết!';
                document.getElementById('statSoilStatus').style.color = '#ef5350';
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
        hidePlantStats();
        toggleGuideWidget(false);
        setShopOpenState(true);
        setGuideLine('Tàng Bảo Các đã mở. Chọn hạt giống hoặc trang trí rồi trở lại khu vườn để đặt vật phẩm.');
        overlay.style.display = 'flex';
        overlay.setAttribute('aria-hidden', 'false');
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
        if (overlay) {
            overlay.style.display = 'none';
            overlay.setAttribute('aria-hidden', 'true');
        }
        setShopOpenState(false);
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
                if (target === 'inventory') {
                    openInventoryModal();
                } else if (target === 'quest-modal') {
                    openQuestModal();
                } else {
                    openPanel(target);
                }
            });
        });

        document.getElementById('closeInventoryBtn')?.addEventListener('click', closeInventoryModal);
        document.getElementById('inventoryOverlay')?.addEventListener('click', (event) => {
            if (event.target?.id === 'inventoryOverlay') closeInventoryModal();
        });

        document.getElementById('closeQuestModalBtn')?.addEventListener('click', closeQuestModal);
        document.getElementById('questModalOverlay')?.addEventListener('click', (event) => {
            if (event.target?.id === 'questModalOverlay') closeQuestModal();
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                closeInventoryModal();
                closeQuestModal();
            }
        });

        document.getElementById('inventorySearchInput')?.addEventListener('input', (e) => {
            inventorySearchText = (e.target.value || '').toLowerCase();
            renderInventory();
        });

        document.querySelectorAll('.pixel-tab[data-inv-tab]').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.pixel-tab[data-inv-tab]').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                inventoryFilterTab = btn.getAttribute('data-inv-tab') || 'all';
                renderInventory();
            });
        });

        document.getElementById('inventorySortSelect')?.addEventListener('change', (e) => {
            inventorySortOrder = e.target.value || 'qty-desc';
            renderInventory();
        });

        document.getElementById('toggleToolbeltBtn')?.addEventListener('click', () => {
            toggleToolbelt();
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

        document.getElementById('shopOverlay')?.addEventListener('click', (event) => {
            if (event.target?.id === 'shopOverlay') {
                closeShop();
            }
        });

        document.getElementById('btn-confirm-buy')?.addEventListener('click', () => {
            confirmBuy();
        });

        document.getElementById('statFertilizeBtn')?.addEventListener('click', () => {
            fertilizeSelectedPlant();
        });

        document.getElementById('statHarvestTypeBtn')?.addEventListener('click', (e) => {
            const itemId = e.target.closest('button').getAttribute('data-harvest-item-id');
            if (itemId) {
                harvestMultiplePlants(item => item.itemId === itemId);
            }
        });

        document.getElementById('harvestAllBtn')?.addEventListener('click', () => {
            harvestMultiplePlants();
        });

        document.getElementById('statWaterTypeBtn')?.addEventListener('click', (e) => {
            const itemId = e.target.closest('button').getAttribute('data-water-item-id');
            if (itemId) {
                waterMultiplePlants(item => item.itemId === itemId);
            }
        });

        document.getElementById('waterAllBtn')?.addEventListener('click', () => {
            waterMultiplePlants();
        });

        document.getElementById('questModalList')?.addEventListener('click', (event) => {
            const button = event.target.closest('.quest-claim-btn[data-quest-id]');
            if (!button || button.disabled) return;
            claimQuest(button.getAttribute('data-quest-id'));
        });

        document.getElementById('gardenInventoryList')?.addEventListener('click', (event) => {
            const slot = event.target.closest('.inventory-slot[data-item-key]');
            if (!slot || slot.disabled) return;

            selectedInventoryKey = slot.getAttribute('data-item-key');
            renderInventory(gardenData.inventory || {});
            setGuideLine(`Đang soi hồ sơ ${getDisplayNameForItem(selectedInventoryKey)}. Kéo xuống phần phân tích để xem nhịp tăng trưởng, mức thưởng và độ khó chăm.`);
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


        window.addEventListener('resize', handleViewportMode);
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
    }

    function closeQuestDrawer() {
        shellState.questDrawerOpen = false;
        if (shellState.activePanel === 'quests') {
            closeSidebar();
            return;
        }
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

    function buildInventoryInsight(itemKey, count = 0) {
        const config = gardenAssets.PLANTS?.[itemKey];
        if (!config) return null;

        const ownedCount = Math.max(0, Number(count || 0));
        const growthStageMs = parseDuration(config.growthTime);
        const totalGrowthMs = parseDuration(config.totalTime || config.growthTime);
        const witherMs = parseDuration(config.witherTime || '30 phut');
        const averageGold = getAverageGold(config);
        const harvestYield = Math.max(1, Number(config.harvestYield || 1));
        const stageCount = getInventoryStageCount(config);
        const tier = getInventoryTier(config);
        const unitContribution = Number(inventoryContributionValues[itemKey] || 0);
        const totalContribution = unitContribution > 0 ? unitContribution * ownedCount : 0;
        const cycleHours = Math.max(totalGrowthMs / (60 * 60 * 1000), 1 / 60);
        const goldPerHour = Math.round(averageGold / cycleHours);
        const xpPerHour = Math.round(Number(config.rewardXP || 0) / cycleHours);
        const stashValueEstimate = averageGold * ownedCount;
        const regrowStage = Number.isFinite(Number(config.afterharvestStage))
            ? Number(config.afterharvestStage)
            : null;

        return {
            key: itemKey,
            config,
            count: ownedCount,
            icon: getHarvestIcon(itemKey),
            tier,
            harvestMode: config.isMultiHarvest ? 'Thu nhiều đợt' : 'Thu một lần',
            stageCount,
            stageTime: formatDurationLong(growthStageMs),
            totalTime: formatDurationLong(totalGrowthMs),
            witherTime: formatDurationLong(witherMs),
            averageGold,
            goldRange: `${Number(config.rewardGold?.min || 0)} - ${Number(config.rewardGold?.max || 0)} vàng`,
            xpReward: Number(config.rewardXP || 0),
            harvestYield,
            unlockLevel: Number(config.unlockLevel || 1),
            size: `${Number(config.size?.w || 1)} x ${Number(config.size?.h || 1)} ô`,
            careDifficulty: getCareDifficulty(config),
            rotationProfile: getRotationProfile(config),
            usageRole: getUsageRole(config),
            goldPerHour,
            xpPerHour,
            stashValueEstimate,
            regrowStage,
            contribution: unitContribution > 0 ? `${unitContribution} / vật phẩm` : 'Chưa hỗ trợ',
            totalContribution: totalContribution > 0 ? `${totalContribution} linh lực` : 'Chưa khả dụng',
            description: `${config.name} thuộc nhóm ${tier.label.toLowerCase()}, thiên về ${getUsageRole(config).toLowerCase()} và hợp với nhịp ${getRotationProfile(config).toLowerCase()}.`,
            notes: [
                `${config.name} mất khoảng ${formatDurationLong(totalGrowthMs)} để hoàn tất chu kỳ thu hoạch, với mỗi cấp tăng trưởng dài khoảng ${formatDurationLong(growthStageMs)}.`,
                config.isMultiHarvest
                    ? `Giống cây này tái sinh sau thu hoạch${regrowStage !== null ? ` từ mốc ${regrowStage}` : ''}, rất hợp cho người muốn giữ một ô farm vận hành liên tục.`
                    : 'Giống cây này kết thúc luôn sau khi thu hoạch, phù hợp để xoay vòng ô đất thật nhanh.',
                `Cửa sổ héo ở mức ${formatDurationLong(witherMs)}, nên độ khó chăm hiện được xếp vào nhóm "${getCareDifficulty(config)}".`,
                `Hiệu suất quy đổi đang ở khoảng ${goldPerHour} vàng/giờ và ${xpPerHour} XP/giờ nếu giữ nhịp thu hoạch đều.`,
                unitContribution > 0
                    ? `Mỗi đơn vị có thể hiến cống khoảng ${unitContribution} linh lực cho Linh Thụ; số bạn đang giữ tương đương gần ${totalContribution} linh lực.`
                    : 'Vật phẩm này hiện chưa nằm trong nhóm nông sản hiến cống mặc định của Tông Môn.',
                ownedCount > 0
                    ? `Bạn đang có sẵn ${ownedCount} ${config.name.toLowerCase()} trong túi, tương đương khoảng ${stashValueEstimate} vàng giá trị thu hoạch trung bình.`
                    : `Hiện bạn chưa có ${config.name.toLowerCase()} nào trong túi.`
            ]
        };
    }

    function renderInventoryDetail(itemKey, inventory = gardenData.inventory || {}) {
        const panel = document.getElementById('gardenInventoryDetail');
        if (!panel) return;

        const ownedKeys = getInventoryKeys().filter((key) => Number(inventory[key] || 0) > 0);
        const safeKey = ownedKeys.includes(itemKey) ? itemKey : (ownedKeys[0] || null);

        if (!safeKey) {
            panel.innerHTML = `
                <div class="inventory-detail-empty">
                    <div class="inventory-detail-empty-icon">
                        <i class="fas fa-box-open"></i>
                    </div>
                    <strong>Túi đồ đang trống</strong>
                    <p>Hãy thu hoạch vài luống cây trước. Khi có nông sản, bấm vào đúng ô chứa vật phẩm là hồ sơ chi tiết sẽ hiện đầy đủ ở đây.</p>
                </div>
            `;
            return;
        }

        const insight = buildInventoryInsight(safeKey, inventory[safeKey]);
        if (!insight) {
            panel.innerHTML = `
                <div class="inventory-detail-empty">
                    <div class="inventory-detail-empty-icon">
                        <i class="fas fa-triangle-exclamation"></i>
                    </div>
                    <strong>Không đọc được dữ liệu vật phẩm</strong>
                    <p>Món đồ này chưa có đủ cấu hình để hiển thị hồ sơ chi tiết.</p>
                </div>
            `;
            return;
        }

        panel.innerHTML = `
            <div class="inventory-detail-card tone-${escapeHtml(insight.tier.tone)}">
                <div class="inventory-detail-hero">
                    <div class="inventory-detail-art">
                        <img src="${escapeHtml(insight.icon)}" alt="${escapeHtml(insight.config.name)}">
                    </div>
                    <div class="inventory-detail-heading">
                        <div class="inventory-detail-kicker">Hồ sơ vật phẩm</div>
                        <h4>${escapeHtml(insight.config.name)}</h4>
                    </div>
                    <p class="inventory-detail-description">${escapeHtml(insight.description)}</p>
                    <div class="inventory-detail-chips">
                        <span class="inventory-detail-chip tone-${escapeHtml(insight.tier.tone)}">${escapeHtml(insight.tier.label)}</span>
                        <span class="inventory-detail-chip">${escapeHtml(insight.harvestMode)}</span>
                        <span class="inventory-detail-chip">Sở hữu ${escapeHtml(String(insight.count))}</span>
                        <span class="inventory-detail-chip">Mở khóa LV ${escapeHtml(String(insight.unlockLevel))}</span>
                    </div>
                </div>

                <div class="inventory-stat-grid">
                    <div class="inventory-stat-card">
                        <span class="inventory-stat-label">Vàng mỗi lần</span>
                        <strong>${escapeHtml(insight.goldRange)}</strong>
                        <small>Trung bình ${escapeHtml(String(insight.averageGold))} vàng</small>
                    </div>
                    <div class="inventory-stat-card">
                        <span class="inventory-stat-label">Kinh nghiệm</span>
                        <strong>${escapeHtml(String(insight.xpReward))} XP</strong>
                        <small>${escapeHtml(insight.usageRole)}</small>
                    </div>
                    <div class="inventory-stat-card">
                        <span class="inventory-stat-label">Chu kỳ hoàn chỉnh</span>
                        <strong>${escapeHtml(insight.totalTime)}</strong>
                        <small>${escapeHtml(insight.rotationProfile)}</small>
                    </div>
                    <div class="inventory-stat-card">
                        <span class="inventory-stat-label">Cửa sổ héo</span>
                        <strong>${escapeHtml(insight.witherTime)}</strong>
                        <small>${escapeHtml(insight.careDifficulty)}</small>
                    </div>
                    <div class="inventory-stat-card">
                        <span class="inventory-stat-label">Sản lượng kho</span>
                        <strong>${escapeHtml(String(insight.count))} đang cất</strong>
                        <small>${escapeHtml(String(insight.harvestYield))} đơn vị / lần thu</small>
                    </div>
                    <div class="inventory-stat-card">
                        <span class="inventory-stat-label">Nhịp lợi nhuận</span>
                        <strong>${escapeHtml(String(insight.goldPerHour))} vàng/giờ</strong>
                        <small>${escapeHtml(String(insight.xpPerHour))} XP/giờ nếu farm đều</small>
                    </div>
                    <div class="inventory-stat-card">
                        <span class="inventory-stat-label">Hiến cống</span>
                        <strong>${escapeHtml(insight.contribution)}</strong>
                        <small>${escapeHtml(insight.totalContribution)}</small>
                    </div>
                    <div class="inventory-stat-card">
                        <span class="inventory-stat-label">Giá trị ước tính</span>
                        <strong>${escapeHtml(String(insight.stashValueEstimate))} vàng</strong>
                        <small>Giá trị trung bình của lượng đang giữ</small>
                    </div>
                </div>

                <div class="inventory-detail-section">
                    <div class="inventory-detail-section-title">Thông số canh tác</div>
                    <div class="inventory-detail-facts">
                        <div class="inventory-fact-row"><span>Thời gian mỗi cấp</span><strong>${escapeHtml(insight.stageTime)}</strong></div>
                        <div class="inventory-fact-row"><span>Số giai đoạn</span><strong>${escapeHtml(String(insight.stageCount))} mốc</strong></div>
                        <div class="inventory-fact-row"><span>Kích thước chiếm chỗ</span><strong>${escapeHtml(insight.size)}</strong></div>
                        <div class="inventory-fact-row"><span>Kiểu vận hành</span><strong>${escapeHtml(insight.harvestMode)}</strong></div>
                        <div class="inventory-fact-row"><span>Mốc tái sinh</span><strong>${escapeHtml(insight.regrowStage !== null ? `Stage ${insight.regrowStage}` : 'Không có')}</strong></div>
                    </div>
                </div>

                <div class="inventory-detail-section">
                    <div class="inventory-detail-section-title">Phân tích sử dụng</div>
                    <ul class="inventory-detail-notes">
                        ${insight.notes.map((note) => `<li>${escapeHtml(note)}</li>`).join('')}
                    </ul>
                </div>
                
                <div class="inventory-modal-actions">
                    <button class="btn-inv-action btn-use" onclick="Swal.fire('Chức năng sắp ra mắt', 'Nông sản hiện tại dùng để Hiến Cống cho Tông Môn. Tính năng Nấu Ăn sẽ sớm được ra mắt!', 'info')" type="button">Sử Dụng</button>
                    <button class="btn-inv-action btn-sell" onclick="Swal.fire('Tính năng đang phát triển', 'Chức năng bán vật phẩm đang được rèn luyện!', 'info')" type="button">Bán Đi</button>
                    <button class="btn-inv-action btn-tribute" onclick="window.location.href='/guilds'" type="button">Hiến Cống</button>
                </div>
            </div>
        `;
    }

    function renderInventory(inventory = gardenData.inventory || {}) {
        const list = document.getElementById('gardenInventoryList');
        const summary = document.getElementById('gardenInventorySummary');
        if (!list) return;

        let keys = getInventoryKeys();

        // Lọc vật phẩm đang sở hữu trước
        const ownedKeys = keys.filter(key => Number(inventory[key] || 0) > 0);

        // Áp dụng bộ lọc (Filter & Search)
        let filteredKeys = ownedKeys.filter(key => {
            const config = gardenAssets.PLANTS?.[key] || {};
            const name = (config.name || '').toLowerCase();

            if (inventorySearchText && !name.includes(inventorySearchText)) return false;

            if (inventoryFilterTab !== 'all') {
                if (inventoryFilterTab === 'seed') return false; // Túi đồ chỉ chứa nông sản đã thu hoạch
                if (inventoryFilterTab === 'harvest') return true;
                if (inventoryFilterTab === 'decor') return false; // Hiện MyGarden chưa support lưu decor vào túi
            }
            return true;
        });

        // Áp dụng Sắp xếp (Sort)
        filteredKeys.sort((a, b) => {
            const countA = Number(inventory[a] || 0);
            const countB = Number(inventory[b] || 0);
            if (inventorySortOrder === 'qty-desc') return countB - countA;
            if (inventorySortOrder === 'qty-asc') return countA - countB;
            if (inventorySortOrder === 'tier-desc') {
                const tierScores = { 'legendary': 5, 'epic': 4, 'rare': 3, 'uncommon': 2, 'common': 1 };
                const tierA = tierScores[getInventoryTier(gardenAssets.PLANTS?.[a] || {}).tone] || 0;
                const tierB = tierScores[getInventoryTier(gardenAssets.PLANTS?.[b] || {}).tone] || 0;
                return tierB - tierA || countB - countA;
            }
            return 0;
        });

        const total = filteredKeys.reduce((sum, key) => sum + Number(inventory[key] || 0), 0);

        if (!selectedInventoryKey || !filteredKeys.includes(selectedInventoryKey)) {
            selectedInventoryKey = filteredKeys[0] || null;
        }

        if (summary) {
            summary.innerText = total > 0
                ? `${total} vật phẩm • Đã hiển thị ${filteredKeys.length} loại`
                : `Túi đang trống`;
        }

        list.innerHTML = filteredKeys.map((key, index) => {
            const count = Math.max(0, Number(inventory[key] || 0));
            const config = gardenAssets.PLANTS?.[key] || {};
            const tier = getInventoryTier(config);
            const isOwned = count > 0;
            const selectedClass = selectedInventoryKey === key ? ' is-selected' : '';
            const stateClass = isOwned ? ' is-owned' : ' is-empty';

            return `
                <button
                    type="button"
                    class="inventory-slot${selectedClass}${stateClass}"
                    data-item-key="${escapeHtml(key)}"
                    style="--slot-order:${index};"
                    ${isOwned ? '' : 'disabled aria-disabled="true"'}
                    aria-selected="${selectedInventoryKey === key ? 'true' : 'false'}"
                >
                    <span class="inventory-slot-tier tone-${escapeHtml(tier.tone)}">${escapeHtml(tier.label)}</span>
                    <span class="inventory-slot-count">${escapeHtml(String(count))}</span>
                    <span class="inventory-slot-art">
                        <img src="${escapeHtml(getHarvestIcon(key))}" alt="${escapeHtml(getDisplayNameForItem(key))}">
                    </span>
                    <span class="inventory-slot-meta">
                        <strong>${escapeHtml(getDisplayNameForItem(key))}</strong>
                        <small>${isOwned ? 'Bấm để xem hồ sơ' : 'Ô trống'}</small>
                    </span>
                </button>
            `;
        }).join('');

        renderInventoryDetail(selectedInventoryKey, inventory);
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
    window.openInventoryModal = openInventoryModal;
    window.closeInventoryModal = closeInventoryModal;
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
    window.toggleQuestDrawer = toggleQuestDrawer;
    window.openQuestDrawer = openQuestDrawer;
    window.closeQuestDrawer = closeQuestDrawer;
    window.initGardenPage = initGardenPage;
})(window);
