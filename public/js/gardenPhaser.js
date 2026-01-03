/**
 * GARDEN PHASER ENGINE - FINAL STABLE
 * Fixes: 
 * 1. Texture reset size bug (Tưới nước bị lỗi hình).
 * 2. Hitbox update bug (Cây chín nhưng không click thu hoạch được).
 * 3. Realtime sync logic.
 */

const ASSETS = window.gardenAssets;
const GARDEN_DATA = window.gardenData;
const GRID_SIZE = 64;
const WORLD_W = 64 * GRID_SIZE;
const WORLD_H = 64 * GRID_SIZE;

// --- 0. UI HELPERS ---
if (typeof Swal !== 'undefined') {
    window.SwalPixel = Swal.mixin({
        toast: true, position: 'top-end', showConfirmButton: false, timer: 2000, timerProgressBar: true,
        background: '#3e2723', color: '#ffb300', iconColor: '#ffb300',
        customClass: { popup: 'swal2-toast-pixel' },
        didOpen: (toast) => {
            toast.addEventListener('mouseenter', Swal.stopTimer);
            toast.addEventListener('mouseleave', Swal.resumeTimer);
        }
    });
}
function showToast(m, i = 'info') { if (window.SwalPixel) window.SwalPixel.fire({ title: m, icon: i }); else console.log(m); }

// --- 1. DỮ LIỆU HỘI THOẠI NPC ---
const NPC_DIALOGUES = {
    welcome: ["Hế lô cưng! Nay mua gì nè? 💖", "Vào lựa lẹ đi, hàng mới về nóng hổi! 🔥", "Trộm vía, nay nhìn bạn tươi nha!"],
    plants: ["Trồng cây đi, đừng trồng cây si! 🌱", "Hạt giống bao nảy mầm!", "Mua Lúa đi, sau này tha hồ gặt hái! 🌾"],
    decors: ["Decor cái vườn cho nó keo lỳ đi fen! ✨", "Nhà sạch thì mát, vườn đẹp thì tốn tiền! 💸"],
    backgrounds: ["Đất chật người đông, mở rộng ra cho thoáng! 🚜"]
};
function getNPCSpeech(category) {
    const list = NPC_DIALOGUES[category] || NPC_DIALOGUES.welcome;
    return list[Math.floor(Math.random() * list.length)];
}

// --- 2. MAIN SCENE ---
class MainScene extends Phaser.Scene {
    constructor() {
        super({ key: 'MainScene' });
        this.marker = null; 
        this.selectionMarker = null; 
        this.currentTool = 'cursor'; 
        this.bgTile = null;
        this.isDraggingSprite = false; 
        this.isPanning = false;
        this.dragStart = { x: 0, y: 0 }; 
        this.holdTimer = null;
        this.movingSprite = null; 
        this.selectedTile = null; 
        this.saveCamTimer = null;
    }

    preload() {
        // Load Assets
        for (let key in ASSETS.PLANTS) ASSETS.PLANTS[key].stages.forEach((url, i) => this.load.image(`plant_${key}_${i}`, url));
        for (let key in ASSETS.DECORS) {
            const item = ASSETS.DECORS[key];
            if (item.isFence) {
                this.load.image(`decor_${key}_base`, 'https://i.imgur.com/8BiKzXw.png'); // Placeholder fence
                this.load.image(`decor_${key}_h`, 'https://i.imgur.com/GzJzM9S.png');
                this.load.image(`decor_${key}_v`, 'https://i.imgur.com/vPqAlqL.png');
            } else {
                this.load.image(`decor_${key}`, item.image);
            }
        }
        this.load.image('water_drop', '/api/pro-images/1767290687212-2rlhp4.png');
        this.load.image('star_particle', '/api/pro-images/1767290642605-hz0cd0.png');

        if (ASSETS.PLOT && ASSETS.PLOT.grass) this.load.image('grass_tile', ASSETS.PLOT.grass.textureUrl);
        if (ASSETS.FARMING) {
            this.load.image('soil_dry', ASSETS.FARMING.soil_dry);
            this.load.image('soil_wet', ASSETS.FARMING.soil_wet);
        }
    }

    create() {
        window.sceneContext = this;
        this.physics.world.setBounds(0, 0, WORLD_W, WORLD_H);
        this.input.mouse.disableContextMenu();

        // Camera Setup
        const savedCam = GARDEN_DATA.camera || { x: WORLD_W / 2, y: WORLD_H / 2, zoom: 1 };
        this.cameras.main.setBounds(0, 0, WORLD_W, WORLD_H).centerOn(savedCam.x, savedCam.y).setZoom(savedCam.zoom);

        // Background
        this.bgTile = this.add.tileSprite(0, 0, WORLD_W, WORLD_H, 'grass_tile').setOrigin(0);
        if (this.textures.exists('grass_tile')) {
            const frame = this.textures.get('grass_tile').getSourceImage();
            if (frame) this.bgTile.setTileScale(GRID_SIZE / frame.width, GRID_SIZE / frame.height);
        }
        this.drawGrid();

        // Markers
        this.marker = this.add.graphics().lineStyle(3, 0xffffff, 1).strokeRect(0, 0, GRID_SIZE, GRID_SIZE).setDepth(999999);
        this.selectionMarker = this.add.graphics().lineStyle(4, 0x00ffff, 1).strokeRect(0, 0, GRID_SIZE, GRID_SIZE).setDepth(999998).setVisible(false);
        this.waterEmitter = this.add.particles(0, 0, 'water_drop', { speed: 100, scale: { start: 0.05, end: 0 }, lifespan: 500, emitting: false });

        // --- INPUT EVENTS ---
        this.input.on('pointerdown', (pointer) => {
            if (this.movingSprite && pointer.button === 0) { this.placeMovingSprite(); return; }
            if (!this.movingSprite && (pointer.middleButtonDown() || (this.currentTool === 'move' && pointer.leftButtonDown()))) {
                this.isPanning = true; this.input.setDefaultCursor('grabbing');
            }
        });

        this.input.on('pointerup', () => { 
            if (this.isPanning) { 
                this.isPanning = false; this.scheduleSaveCamera(); 
                this.input.setDefaultCursor(this.currentTool === 'move' ? 'grab' : 'default');
            }
            if (this.holdTimer) { this.holdTimer.remove(); this.holdTimer = null; }
        });

        this.input.on('pointermove', (pointer) => {
            if (this.holdTimer && Phaser.Math.Distance.Between(pointer.downX, pointer.downY, pointer.x, pointer.y) > 10) {
                this.holdTimer.remove(); this.holdTimer = null;
            }
            if (this.isPanning && !this.movingSprite) {
                const dx = (pointer.x - pointer.prevPosition.x) / this.cameras.main.zoom;
                const dy = (pointer.y - pointer.prevPosition.y) / this.cameras.main.zoom;
                this.cameras.main.scrollX -= dx; this.cameras.main.scrollY -= dy;
            }
            
            const worldP = pointer.positionToCamera(this.cameras.main);
            const gx = Math.floor(worldP.x / GRID_SIZE); const gy = Math.floor(worldP.y / GRID_SIZE);
            
            if (this.movingSprite) {
                this.marker.clear().lineStyle(3, 0x00ff00, 1).strokeRect(gx * GRID_SIZE, gy * GRID_SIZE, this.movingSprite.displayWidth, this.movingSprite.displayHeight);
                this.movingSprite.x = gx * GRID_SIZE + this.movingSprite.displayWidth / 2;
                this.movingSprite.y = gy * GRID_SIZE + this.movingSprite.displayHeight;
                if (this.movingSprite.thirstyIcon) { /* logic icon */ }
            } else {
                const col = (this.currentTool === 'cursor') ? 0xffffff : (this.currentTool === 'move' ? 0xaaaaaa : 0xffeb3b);
                this.marker.clear().lineStyle(3, col, 1).strokeRect(gx * GRID_SIZE, gy * GRID_SIZE, GRID_SIZE, GRID_SIZE);
            }

            if (this.selectedTile) {
                this.selectionMarker.setVisible(true);
                const w = this.selectedTile.displayWidth || GRID_SIZE;
                const h = this.selectedTile.displayHeight || GRID_SIZE;
                let drawX = this.selectedTile.x;
                let drawY = this.selectedTile.y;
                if (this.selectedTile.itemData.type !== 'plot') { drawX -= w/2; drawY -= h; }
                this.selectionMarker.clear().lineStyle(4, 0x00ffff, 1).strokeRect(drawX, drawY, w, h);
            } else { this.selectionMarker.setVisible(false); }

            const hud = document.getElementById('hudCoords'); if (hud) hud.innerText = `${gx}, ${gy}`;
        });

        this.input.on('wheel', (p, g, x, y, z) => {
            this.cameras.main.setZoom(Phaser.Math.Clamp(this.cameras.main.zoom - y * 0.001, 0.5, 2));
            this.scheduleSaveCamera();
        });

        this.input.on('pointerdown', (pointer) => {
            if (this.isPanning || this.movingSprite) return;
            const worldP = pointer.positionToCamera(this.cameras.main);
            this.handleToolAction(worldP.x, worldP.y, pointer);
        });

        // Init
        if (window.gardenData && window.gardenData.items) window.gardenData.items.forEach(item => this.renderItem(item));
        this.time.delayedCall(100, () => this.updateAllFences());

        // Listeners
        window.gameEvents.on('toolChanged', (t) => {
            this.currentTool = t;
            this.input.setDefaultCursor(t === 'move' ? 'grab' : 'default');
            this.updateCursor(t); this.isPanning = false; if (this.movingSprite) this.cancelMove();
            this.selectedTile = null; window.hidePlantStats();
        });
        window.gameEvents.on('openShop', (tab) => openShopHTML(tab));

        // Realtime Loop
        this.time.addEvent({ delay: 1000, callback: this.updateRealtimeGrowth, callbackScope: this, loop: true });
    }

    // --- TOOL ACTIONS ---
    async handleToolAction(x, y, pointer) {
        if (pointer.button !== 0) return;
        if (this.currentTool === 'move') { this.selectedTile = null; window.hidePlantStats(); return; }

        const gx = Math.floor(x / GRID_SIZE) * GRID_SIZE;
        const gy = Math.floor(y / GRID_SIZE) * GRID_SIZE;
        const all = this.children.list;

        const plot = all.find(o => o.itemData && o.itemData.type === 'plot' && Math.abs(o.itemData.x - gx) < 1 && Math.abs(o.itemData.y - gy) < 1);
        const plant = all.find(o => o.isGardenItem && o.itemData && o.itemData.type !== 'plot' && Math.abs(o.itemData.x - gx) < 1 && Math.abs(o.itemData.y - gy) < 1);

        // 1. CURSOR
        if (this.currentTool === 'cursor') {
            if (plant) { this.selectedTile = plant; window.showPlantStats(plant.itemData, { x: gx/GRID_SIZE, y: gy/GRID_SIZE }); }
            else if (plot) { this.selectedTile = plot; window.showPlantStats(plot.itemData, { x: gx/GRID_SIZE, y: gy/GRID_SIZE }); }
            else { this.selectedTile = null; window.hidePlantStats(); }
            return;
        } else {
            this.selectedTile = null; window.hidePlantStats();
        }

        // [SEC] Security Check
        if (!window.isOwner) {
            showToast('Chỉ chủ nhà mới được làm việc này! 👀', 'warning');
            this.currentTool = 'cursor'; window.selectTool('cursor'); return;
        }

        // 2. WATER (FIX LỖI TEXTURE)
        if (this.currentTool === 'water') {
            if (plant && plant.itemData.isDead) return showToast('Cây hẹo rồi! 🥀', 'error');
            if (plant || plot) {
                const id = plant ? plant.itemData._id : plot.itemData._id;
                const res = await apiCall('/my-garden/interact', { uniqueId: id, action: 'water' });
                if (res.success) {
                    updateHUD(res);
                    this.waterEmitter.emitParticleAt(gx + 32, gy + 32, 10);
                    this.showFloatingText(gx + 32, gy, "-1 💧", "blue");
                    const now = Date.now();

                    // [FIX] Set lại size sau khi setTexture để tránh bị thu nhỏ về size gốc của ảnh
                    if (plot) {
                        plot.setTexture('soil_wet');
                        plot.setDisplaySize(GRID_SIZE, GRID_SIZE); // [FIX] QUAN TRỌNG
                        plot.itemData.lastWatered = new Date();
                        plot.itemData.clientRefTime = now;
                    }
                    if (plant) {
                        plant.itemData.witherProgress = 0;
                        this.updateThirstyIcon(plant, false);
                        const groundPlot = all.find(o => o.itemData && o.itemData.type === 'plot' && o.itemData.x === plant.itemData.x && o.itemData.y === plant.itemData.y);
                        if (groundPlot) {
                            groundPlot.setTexture('soil_wet');
                            groundPlot.setDisplaySize(GRID_SIZE, GRID_SIZE); // [FIX] QUAN TRỌNG
                            groundPlot.itemData.lastWatered = new Date();
                            groundPlot.itemData.clientRefTime = now;
                        }
                        if (res.item) Object.assign(plant.itemData, res.item);
                        plant.itemData.clientRefTime = now;
                    }
                    showToast('Đã tưới nước! 💦', 'success');
                    if (window.checkTutorialAction) window.checkTutorialAction('wait_action_water');
                } else showToast(res.msg, 'warning');
            }
        }

        // 3. HOE
        else if (this.currentTool === 'hoe') {
            if (!plot) {
                if (plant) return showToast('Vướng cây rồi fen!', 'warning');
                const res = await apiCall('/my-garden/buy', { type: 'plot', itemId: 'soil_tile', x: gx, y: gy });
                if (res.success) {
                    this.renderItem(res.item); updateHUD(res); showToast(res.msg, 'success');
                    if (window.checkTutorialAction) window.checkTutorialAction('wait_action_buy_plot');
                } else showToast(res.msg, 'error');
            }
        }

        // 4. SHOVEL
        else if (this.currentTool === 'shovel') {
            if (plant) this.removeObj(plant); else if (plot) this.removeObj(plot);
        }

        // 5. BASKET
        else if (this.currentTool === 'basket') {
            if (plant && plant.itemData.type === 'plant') {
                if (plant.itemData.isDead) return showToast('Cây chết rồi, dùng xẻng đi!', 'error');
                
                // Gửi request thu hoạch (Server sẽ check lại stage lần nữa cho chắc)
                const res = await apiCall('/my-garden/interact', { uniqueId: plant.itemData._id, action: 'harvest' });
                
                if (res.success) {
                    updateHUD(res);
                    if (res.xpReward) this.showFloatingText(plant.x, plant.y - 60, `+${res.xpReward} XP ✨`, 'green');
                    if (res.goldReward) this.showFloatingText(plant.x, plant.y - 90, `+${res.goldReward} 💰`, 'gold');
                    if (res.levelData && res.levelData.hasLeveledUp) showToast(`Đột phá: ${res.levelData.levelName}!`, 'success');

                    this.tweens.add({
                        targets: plant, y: plant.y - 100, alpha: 0, duration: 600,
                        onComplete: () => {
                            if (plant.ui) plant.ui.destroy();
                            if (plant.thirstyIcon) plant.thirstyIcon.destroy();
                            plant.destroy();
                        }
                    });
                    this.selectedTile = null; window.hidePlantStats();
                    showToast(res.msg, 'success');
                } else {
                    showToast(res.msg, 'warning');
                }
            }
        }
    }

    // --- RENDER & LOGIC ---
    renderItem(item) {
        item.clientRefTime = Date.now();
        
        // Render Plot
        if (item.type === 'plot') {
            const isWet = item.lastWatered != null;
            const plot = this.add.image(item.x, item.y, isWet ? 'soil_wet' : 'soil_dry')
                .setOrigin(0).setDisplaySize(GRID_SIZE, GRID_SIZE);
            plot.itemData = item; plot.isGardenItem = false; plot.setDepth(0);
            plot.setInteractive();
            plot.on('pointerover', () => { this.hoveredSprite = plot; });
            plot.on('pointerout', () => { if (this.hoveredSprite === plot) this.hoveredSprite = null; });
            return plot;
        }

        // Render Item
        const config = ASSETS.PLANTS[item.itemId] || ASSETS.DECORS[item.itemId];
        if (!config) return null;

        let key = `decor_${item.itemId}`;
        if (config.isFence) key = `decor_${item.itemId}_base`;
        else if (item.type === 'plant') key = `plant_${item.itemId}_${item.stage || 0}`;

        const w = config.size?.w || 1;
        const h = config.size?.h || 1;

        const sprite = this.add.sprite(
            item.x + (w * GRID_SIZE) / 2, 
            item.y + (h * GRID_SIZE), 
            key
        ).setOrigin(0.5, 1).setDisplaySize(w * GRID_SIZE, h * GRID_SIZE);
        
        sprite.isGardenItem = true; sprite.itemData = item; 
        sprite.setInteractive(); this.input.setDraggable(sprite);

        if (item.isDead) sprite.setTint(0x555555);
        if (item.type === 'plant') this.updatePlantUI(sprite);

        sprite.on('pointerdown', (p) => {
            if (this.currentTool === 'cursor' && p.button === 0) {
                this.holdTimer = this.time.delayedCall(1000, () => this.startMovingSprite(sprite));
            }
        });

        if (config.isFence) this.time.delayedCall(50, () => this.updateAllFences());
        return sprite;
    }

    updateRealtimeGrowth() {
        const now = Date.now();
        const plotMap = {};
        this.children.list.forEach(o => { if (o.itemData && o.itemData.type === 'plot') plotMap[`${o.itemData.x},${o.itemData.y}`] = o.itemData; });

        this.children.list.forEach(sprite => {
            // Logic cho Đất (Tự khô)
            if (sprite.itemData && sprite.itemData.type === 'plot' && sprite.itemData.lastWatered) {
                if (now - new Date(sprite.itemData.lastWatered).getTime() >= 24 * 60 * 60 * 1000) {
                    // [FIX] Hết nước -> Về đất khô -> Phải set lại size
                    sprite.setTexture('soil_dry');
                    sprite.setDisplaySize(GRID_SIZE, GRID_SIZE);
                    sprite.itemData.lastWatered = null;
                }
            }

            // Logic cho Cây
            if (!sprite.isGardenItem || !sprite.itemData || sprite.itemData.type !== 'plant') return;
            const item = sprite.itemData;
            if (item.isDead) { this.updateThirstyIcon(sprite, false); return; }

            const config = ASSETS.PLANTS[item.itemId]; if (!config) return;
            const plotData = plotMap[`${item.x},${item.y}`];
            let isWet = false;

            if (plotData && plotData.lastWatered) {
                if (now - new Date(plotData.lastWatered).getTime() < 24 * 60 * 60 * 1000) isWet = true;
            }

            this.updateThirstyIcon(sprite, !isWet && !item.isDead);
            const elapsed = now - (item.clientRefTime || now);
            
            // Growth Logic
            if (isWet && item.stage < config.maxStage) {
                const estimatedProgress = (item.growthProgress || 0) + elapsed;
                const timePerStage = this.parseDuration(config.growthTime);
                const calcStage = Math.floor(estimatedProgress / timePerStage);
                const newStage = Math.min(calcStage, config.maxStage);
                
                if (newStage > item.stage) {
                    item.stage = newStage;
                    sprite.setTexture(`plant_${item.itemId}_${newStage}`);
                    
                    // [FIX QUAN TRỌNG] Cập nhật lại size và hitbox khi cây lớn lên
                    // Nếu không update, sprite sẽ bé tí hoặc hitbox bị lệch -> Không click thu hoạch được
                    const w = config.size?.w || 1;
                    const h = config.size?.h || 1;
                    sprite.setDisplaySize(w * GRID_SIZE, h * GRID_SIZE);
                    sprite.setOrigin(0.5, 1); // Đảm bảo gốc vẫn ở chân
                    
                    this.showLevelUpEffect(sprite);
                    if (newStage >= config.maxStage) this.updatePlantUI(sprite);
                }
            }
            
            // Wither Logic
            if (!isWet && item.stage > 0) {
                const currentWither = (item.witherProgress || 0) + elapsed;
                const maxWither = this.parseDuration(config.witherTime || '30 phút');
                if (currentWither >= maxWither) {
                    item.isDead = true;
                    sprite.setTint(0x555555);
                    this.updateThirstyIcon(sprite, false);
                    showToast('Có cây đã chết khô! 🥀', 'error');
                }
            }
        });
    }

    // --- SUPPORT FUNCTIONS ---
    updateAllFences() {
        this.children.list.forEach(child => {
            if (child.isGardenItem && ASSETS.DECORS[child.itemData.itemId]?.isFence) this.updateFenceTexture(child);
        });
    }
    updateFenceTexture(sprite) {
        const item = sprite.itemData;
        const id = item.itemId;
        const x = item.x; const y = item.y;
        const hasTop = this.hasFenceAt(x, y - GRID_SIZE, id);
        const hasBottom = this.hasFenceAt(x, y + GRID_SIZE, id);
        const hasLeft = this.hasFenceAt(x - GRID_SIZE, y, id);
        const hasRight = this.hasFenceAt(x + GRID_SIZE, y, id);

        let textureKey = `decor_${id}_base`;
        if (hasLeft || hasRight) {
            if (!hasTop && !hasBottom) textureKey = `decor_${id}_h`;
        }
        if (hasTop || hasBottom) {
            if (!hasLeft && !hasRight) textureKey = `decor_${id}_v`;
        }
        sprite.setTexture(textureKey);
        // [FIX] Fence cũng cần reset size
        const w = ASSETS.DECORS[id].size.w; const h = ASSETS.DECORS[id].size.h;
        sprite.setDisplaySize(w * GRID_SIZE, h * GRID_SIZE);
    }
    hasFenceAt(x, y, itemId) {
        return this.children.list.some(o => o.isGardenItem && o.itemData.x === x && o.itemData.y === y && o.itemData.itemId === itemId);
    }
    
    update() {
        this.children.list.forEach(child => {
            if (child.isGardenItem) {
                child.setDepth(child === this.movingSprite ? 999999 : child.y);
                if (child.ui) child.ui.setPosition(child.x, child.y - child.displayHeight - 10);
                if (child.thirstyIcon) child.thirstyIcon.setPosition(child.x, child.y - child.displayHeight);
            }
        });
    }

    startMovingSprite(sprite) {
        if (!window.isOwner) return;
        const item = sprite.itemData;
        const cfg = ASSETS.PLANTS[item.itemId] || ASSETS.DECORS[item.itemId];
        const canMove = !item.isDead && (item.type === 'decoration' || item.stage === 0 || (cfg && item.stage >= cfg.maxStage));
        
        if (canMove) {
            this.movingSprite = sprite; 
            this.originalPos = { x: sprite.x, y: sprite.y };
            if (sprite.ui) sprite.ui.setVisible(false);
            if (sprite.thirstyIcon) sprite.thirstyIcon.setVisible(true);
            if (window.statsInterval) clearInterval(window.statsInterval);
            this.input.setDefaultCursor('grabbing'); 
            showToast('Đang di chuyển...', 'info');
        } else showToast(item.isDead ? 'Cây chết không dời được!' : 'Cây đang lớn, đừng động!', 'warning');
    }

    placeMovingSprite() {
        if (!this.movingSprite) return;
        savePosition(this.movingSprite);
        this.movingSprite.setAlpha(1);
        if (this.movingSprite.ui) this.movingSprite.ui.setVisible(true);
        if (this.movingSprite.thirstyIcon) this.movingSprite.thirstyIcon.setVisible(true);
        
        if (ASSETS.DECORS[this.movingSprite.itemData.itemId]?.isFence) this.updateAllFences();
        
        const gx = Math.floor(this.movingSprite.x / GRID_SIZE); 
        const gy = Math.floor(this.movingSprite.y / GRID_SIZE);
        window.showPlantStats(this.movingSprite.itemData, { x: gx, y: gy });

        this.movingSprite = null; 
        this.input.setDefaultCursor('default'); 
        showToast('Đã đặt!', 'success');
    }

    cancelMove() {
        if (!this.movingSprite) return;
        this.movingSprite.x = this.originalPos.x;
        this.movingSprite.y = this.originalPos.y;
        this.movingSprite.setAlpha(1);
        if (this.movingSprite.ui) this.movingSprite.ui.setVisible(true);
        if (this.movingSprite.thirstyIcon) this.movingSprite.thirstyIcon.setVisible(true);
        
        const gx = Math.floor(this.movingSprite.x / GRID_SIZE);
        const gy = Math.floor(this.movingSprite.y / GRID_SIZE);
        window.showPlantStats(this.movingSprite.itemData, { x: gx, y: gy });

        this.movingSprite = null; 
        this.input.setDefaultCursor('default');
    }

    async removeObj(obj) {
        const res = await apiCall('/my-garden/remove', { uniqueId: obj.itemData._id });
        if (res.success) {
            if (obj.ui) obj.ui.destroy();
            if (obj.miniHud) obj.miniHud.destroy();
            if (obj.thirstyIcon) obj.thirstyIcon.destroy();
            this.tweens.add({ targets: obj, scale: 0, duration: 200, onComplete: () => {
                obj.destroy();
                if (ASSETS.DECORS[obj.itemData.itemId]?.isFence) this.time.delayedCall(100, () => this.updateAllFences());
            }});
            this.add.particles(obj.x, obj.y, 'soil_dry', { speed: 100, lifespan: 300 }).explode();
            this.selectedTile = null; window.hidePlantStats();
            showToast('Đã dọn dẹp!', 'success');
        }
    }

    drawGrid() {
        if (this.gridGraphics) this.gridGraphics.destroy();
        const g = this.add.graphics().lineStyle(1, 0xffffff, 0.05);
        for (let x = 0; x <= WORLD_W; x += GRID_SIZE) { g.moveTo(x, 0); g.lineTo(x, WORLD_H); }
        for (let y = 0; y <= WORLD_H; y += GRID_SIZE) { g.moveTo(0, y); g.lineTo(WORLD_W, y); }
        g.strokePath(); this.gridGraphics = g;
    }
    updateCursor(t) {
        const col = (t === 'cursor') ? 0xffffff : (t === 'move' ? 0xaaaaaa : 0xffeb3b);
        this.marker.clear().lineStyle(3, col, 1).strokeRect(0, 0, GRID_SIZE, GRID_SIZE);
    }
    createMiniHUD(sprite, isPlot) {}
    updateMiniHUD(sprite) {}
    updatePlantUI(sprite) {
        if (sprite.ui) sprite.ui.destroy();
        const cfg = ASSETS.PLANTS[sprite.itemData.itemId];
        if (cfg && (sprite.itemData.stage >= cfg.maxStage) && !sprite.itemData.isDead) {
            const s = this.add.text(0, 0, '⭐', { fontSize: '32px' }).setOrigin(0.5);
            this.tweens.add({ targets: s, y: '-=15', yoyo: true, repeat: -1 });
            sprite.ui = this.add.container(sprite.x, sprite.y, [s]).setDepth(99999);
        }
    }
    updateThirstyIcon(sprite, isThirsty) {
        if (isThirsty) {
            if (!sprite.thirstyIcon) {
                const container = this.add.container(sprite.x, sprite.y - sprite.displayHeight);
                const icon = this.add.image(0, 0, 'water_drop').setOrigin(0.5, 1).setDisplaySize(32, 32);
                container.add(icon); container.setDepth(999999);
                this.tweens.add({ targets: icon, y: -15, duration: 800, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
                sprite.thirstyIcon = container;
            }
        } else { if (sprite.thirstyIcon) { sprite.thirstyIcon.destroy(); sprite.thirstyIcon = null; } }
    }
    parseDuration(str) {
        if (!str) return 5 * 60000;
        const num = parseInt(str);
        if (str.includes('giờ')) return num * 3600000;
        return num * 60000;
    }
    showFloatingText(x, y, message, color) {
        let hexColor = '#ffffff';
        if (color === 'gold') hexColor = '#ffeb3b'; else if (color === 'red') hexColor = '#ef5350';
        else if (color === 'blue') hexColor = '#42a5f5'; else if (color === 'green') hexColor = '#66bb6a';
        const txt = this.add.text(x, y - 20, message, { fontFamily: 'VT323', fontSize: '32px', color: hexColor, stroke: '#000', strokeThickness: 4 }).setOrigin(0.5).setDepth(999999);
        this.tweens.add({ targets: txt, y: y - 100, alpha: 0, duration: 2000, onComplete: () => txt.destroy() });
    }
    showLevelUpEffect(sprite) {
        this.showFloatingText(sprite.x, sprite.y - sprite.displayHeight, 'LỚN LÊN! 🌱', 'green');
        this.add.particles(0, 0, 'star_particle', { x: sprite.x, y: sprite.y - sprite.displayHeight / 2, speed: { min: 50, max: 150 }, scale: { start: 0.4, end: 0 }, lifespan: 800, quantity: 5 }).explode();
    }
    scheduleSaveCamera() {
        if (this.saveCamTimer) clearTimeout(this.saveCamTimer);
        this.saveCamTimer = setTimeout(() => {
            const cam = this.cameras.main;
            apiCall('/my-garden/save-camera', { x: cam.scrollX + cam.width / 2, y: cam.scrollY + cam.height / 2, zoom: cam.zoom });
        }, 1000);
    }
}

// --- 3. GLOBAL HELPERS ---
const config = { type: Phaser.AUTO, parent: 'game-container', backgroundColor: '#1e3323', scale: { mode: Phaser.Scale.RESIZE, width: '100%', height: '100%', autoCenter: Phaser.Scale.CENTER_BOTH }, physics: { default: 'arcade', arcade: { debug: false } }, render: { pixelArt: true, antialias: false, roundPixels: true }, scene: MainScene };
const game = new Phaser.Game(config);
let sceneContext;
window.gameEvents = new Phaser.Events.EventEmitter();

async function savePosition(s) {
    let cfg = ASSETS.PLANTS[s.itemData.itemId] || ASSETS.DECORS[s.itemData.itemId];
    let w = (cfg?.size?.w || 1) * GRID_SIZE, h = (cfg?.size?.h || 1) * GRID_SIZE;
    const gx = Math.floor((s.x - w / 2) / GRID_SIZE) * GRID_SIZE;
    const gy = Math.floor((s.y - h) / GRID_SIZE) * GRID_SIZE;
    s.itemData.x = gx; s.itemData.y = gy;
    await apiCall('/my-garden/move', { uniqueId: s.itemData._id, x: gx, y: gy });
}
async function apiCall(u, b) { try { return await (await fetch(u, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) })).json(); } catch (e) { return { success: false }; } }
function updateHUD(d) { if (d.newWater !== undefined) document.getElementById('hudWater').innerText = d.newWater; if (d.newGold !== undefined) document.getElementById('hudGold').innerText = d.newGold; }

window.buyItemPhaser = async function (i, t) {
    document.getElementById('shopOverlay').style.display = 'none';
    showToast('Chọn vị trí... 🌱', 'info');
    const s = game.scene.keys['MainScene'];
    const cancelBtn = document.createElement('button');
    cancelBtn.innerHTML = '❌ Hủy (X)';
    cancelBtn.style.cssText = 'position:fixed; bottom:100px; left:50%; transform:translateX(-50%); padding:10px 20px; background:#ef5350; color:white; border:none; border-radius:20px; font-family:"VT323"; font-size:1.5rem; cursor:pointer; z-index:10000;';
    cancelBtn.onclick = () => window.cancelPlantingMode();
    document.body.appendChild(cancelBtn);

    const plantHandler = async (p) => {
        if (p.button !== 0) return;
        const w = p.positionToCamera(s.cameras.main);
        const x = Math.floor(w.x / GRID_SIZE) * GRID_SIZE;
        const y = Math.floor(w.y / GRID_SIZE) * GRID_SIZE;
        const r = await apiCall('/my-garden/buy', { itemId: i, type: t, x: x, y: y });
        if (r.success) {
            updateHUD(r); s.renderItem(r.item);
            if (ASSETS.DECORS[i]?.isFence) s.updateAllFences();
            showToast('Thành công! 🎉', 'success');
        } else showToast(r.msg, 'error');
        window.cancelPlantingMode();
    };
    s.input.once('pointerdown', plantHandler);
    window.cancelPlantingMode = function () {
        s.input.off('pointerdown', plantHandler);
        if (cancelBtn.parentNode) cancelBtn.parentNode.removeChild(cancelBtn);
        window.cancelPlantingMode = null;
    };
};

window.populateShop = function (category) {
    const grid = document.getElementById('shopGrid');
    const speech = document.getElementById('npcSpeech');
    if (speech) speech.innerText = getNPCSpeech(category);
    grid.innerHTML = '';
    const assets = window.gardenAssets;
    let items = (category === 'plants') ? assets.PLANTS : (category === 'decors') ? assets.DECORS : {};
    if (category === 'backgrounds') { grid.innerHTML = `<div>Dùng cuốc mở đất nhé!</div>`; return; }
    Object.keys(items).forEach(key => {
        const item = items[key];
        const currentLevel = window.userLevel || 1;
        const requiredLevel = item.unlockLevel || 1;
        const isLocked = currentLevel < requiredLevel;
        const div = document.createElement('div');
        div.className = `item-card ${isLocked ? 'locked' : ''}`;
        if (!isLocked) div.onclick = () => window.buyItemPhaser(key, item.type);
        else div.onclick = () => { showToast(`Cần cấp ${requiredLevel}!`, 'error'); div.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-5px)' }, { transform: 'translateX(5px)' }, { transform: 'translateX(0)' }], { duration: 300 }); };
        
        let imgUrl = item.image;
        if (category === 'plants' && item.stages) imgUrl = item.stages[item.stages.length - 1];
        if (category === 'decors' && item.isFence) imgUrl = item.images?.base || 'https://i.imgur.com/8BiKzXw.png'; // Fallback for fence
        
        div.innerHTML = `${isLocked ? `<div class="lock-overlay">🔒 Lv.${requiredLevel}</div>` : ''}<img src="${imgUrl}" class="item-img"><div class="item-name">${item.name}</div><div class="item-price">${item.price} 💰</div>`;
        grid.appendChild(div);
    });
};
window.switchShopTab = function (t) { document.querySelectorAll('.shop-tab').forEach(e => e.classList.remove('active')); document.getElementById(`tab-${t}`).classList.add('active'); window.populateShop(t); };
window.openShopHTML = function (tab = 'plants') { document.getElementById('shopOverlay').style.display = 'flex'; window.switchShopTab(tab); };