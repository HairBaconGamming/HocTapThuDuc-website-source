/**
 * ============================================================================
 * PIXEL FARM ENGINE - ULTIMATE EDITION (v10.3 - Fix Star UI Bug)
 * Author: Senior Node.js Dev
 * Status: Production Ready
 * Fixes: 
 * - [v10.3] Destroy UI (Star/Water Icon) correctly when harvesting or removing.
 * - [v10.2] Auto-select item after placing.
 * - [v10.1] Smart Input for Camera Pan.
 * ============================================================================
 */

// --- 1. CONFIG & ASSETS ---
const GRID_SIZE = 64; 
const WORLD_W = 64 * GRID_SIZE; 
const WORLD_H = 64 * GRID_SIZE; 

const ASSETS = window.gardenAssets || {};
const GARDEN_DATA = window.gardenData || {};
const IS_OWNER = window.isOwner || false;

const PHASER_CONFIG = {
    type: Phaser.AUTO,
    parent: 'garden-game-container',
    backgroundColor: '#1e3323',
    scale: {
        mode: Phaser.Scale.RESIZE,
        width: '100%',
        height: '100%',
        autoCenter: Phaser.Scale.CENTER_BOTH
    },
    physics: { default: 'arcade', arcade: { debug: false } },
    render: { pixelArt: true, antialias: false, roundPixels: true },
    input: { activePointers: 3 }, 
    scene: null 
};

// --- 2. HELPER FUNCTIONS ---

function parseDuration(str) {
    if (!str) return 5 * 60000;
    const num = parseInt(str);
    return num * (str.includes('giờ') ? 3600000 : 60000);
}

function showToast(msg, type = 'info') {
    if (typeof Swal !== 'undefined' && window.SwalPixel) {
        window.SwalPixel.fire({ title: msg, icon: type });
    } else if (typeof Swal !== 'undefined') {
        const Toast = Swal.mixin({
            toast: true, position: 'top-end', showConfirmButton: false, timer: 2000,
            timerProgressBar: true, background: '#3e2723', color: '#ffb300', iconColor: '#ffb300'
        });
        Toast.fire({ title: msg, icon: type });
    } else {
        console.log(`[${type.toUpperCase()}] ${msg}`);
    }
}

async function apiCall(url, body) {
    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        return await res.json();
    } catch (e) {
        return { success: false, msg: 'Mất kết nối server!' };
    }
}

function updateHUD(data) {
    if (data.newWater !== undefined) {
        const el = document.getElementById('ui-water');
        if (el) el.innerText = data.newWater;
    }
    if (data.newGold !== undefined) {
        const el = document.getElementById('ui-gold');
        if (el) el.innerText = data.newGold;
    }
    
    if (data.levelData) {
        const bar = document.getElementById('ui-xp-bar');
        const txt = document.getElementById('ui-xp-text');
        const lvl = document.getElementById('ui-level');
        const realm = document.getElementById('ui-realm');
        
        if (data.levelData.currentXP !== undefined && data.levelData.nextLevelXP) {
            const current = data.levelData.currentXP;
            const max = data.levelData.nextLevelXP;
            const pct = max > 0 ? Math.min(100, Math.max(0, (current / max) * 100)) : 0;
            
            if (bar) bar.style.width = pct + "%";
            if (txt) txt.innerText = `${current}/${max}`;
        }
        
        if (lvl && data.levelData.level) lvl.innerText = data.levelData.level;
        if (realm && data.levelData.levelName) realm.innerText = data.levelData.levelName;
    }
}

function updateCoords(x, y) {
    const elX = document.getElementById('ui-coords-x');
    const elY = document.getElementById('ui-coords-y');
    if (elX) elX.innerText = x;
    if (elY) elY.innerText = y;
}

// --- 3. MAIN SCENE ---

class MainScene extends Phaser.Scene {
    constructor() {
        super({ key: 'MainScene' });
        
        this.currentTool = 'cursor';
        this.plantingMode = { active: false, itemId: null, type: null };
        
        this.movingSprite = null;
        this.isMovingObject = false;
        this.originalPos = null;

        this.isPanning = false;
        this.dragStartPoint = new Phaser.Math.Vector2();
        this.initialZoomDistance = 0;
        this.initialCameraZoom = 1;
        this.saveCamTimer = null;
        this.minZoom = 0.5;
        this.maxZoom = 2.5;
        
        this.selectedTile = null;
        this.selectionMarker = null;
        this.marker = null;
        this.waterEmitter = null;

        this.keys = null;
        this.camVelocity = new Phaser.Math.Vector2(0, 0);
    }

    preload() {
        this.load.image('water_drop', '/api/pro-images/1767290687212-2rlhp4.png');
        this.load.image('star_particle', '/api/pro-images/1767290642605-hz0cd0.png');
        
        if (ASSETS.PLOT && ASSETS.PLOT.grass) this.load.image('grass_tile', ASSETS.PLOT.grass.textureUrl);
        if (ASSETS.FARMING) {
            this.load.image('soil_dry', ASSETS.FARMING.soil_dry);
            this.load.image('soil_wet', ASSETS.FARMING.soil_wet);
        }
        for (let key in ASSETS.PLANTS) {
            ASSETS.PLANTS[key].stages.forEach((url, i) => this.load.image(`plant_${key}_${i}`, url));
        }
        for (let key in ASSETS.DECORS) {
            const item = ASSETS.DECORS[key];
            if (item.isFence) {
                this.load.image(`decor_${key}_base`, item.images?.base || item.image);
                this.load.image(`decor_${key}_h`, item.images?.h || item.image);
                this.load.image(`decor_${key}_v`, item.images?.v || item.image);
            } else {
                this.load.image(`decor_${key}`, item.image);
            }
        }
    }

    create() {
        window.sceneContext = this; 
        this.physics.world.setBounds(0, 0, WORLD_W, WORLD_H);
        this.input.addPointer(2);

        this.keys = this.input.keyboard.addKeys({ Q: Phaser.Input.Keyboard.KeyCodes.Q });

        this.bgTile = this.add.tileSprite(0, 0, WORLD_W, WORLD_H, 'grass_tile').setOrigin(0);
        if (this.textures.exists('grass_tile')) {
            const img = this.textures.get('grass_tile').getSourceImage();
            if (img) this.bgTile.setTileScale(GRID_SIZE / img.width, GRID_SIZE / img.height);
        }
        this.drawGrid();

        this.marker = this.add.graphics().lineStyle(3, 0xffffff, 1).strokeRect(0, 0, GRID_SIZE, GRID_SIZE).setDepth(999999);
        this.selectionMarker = this.add.graphics().lineStyle(4, 0x00ffff, 1).strokeRect(0, 0, GRID_SIZE, GRID_SIZE).setDepth(999998).setVisible(false);
        this.waterEmitter = this.add.particles(0, 0, 'water_drop', { speed: { min: 100, max: 200 }, scale: { start: 0.05, end: 0 }, lifespan: 600, gravityY: 300, quantity: 5, emitting: false });

        this.setupCamera();
        this.setupInput();
        this.setupExternalEvents();
        this.initHUD();

        if (GARDEN_DATA.items && Array.isArray(GARDEN_DATA.items)) {
            GARDEN_DATA.items.forEach(item => this.renderItem(item));
        }
        this.time.delayedCall(100, () => this.updateAllFences());

        this.time.addEvent({ delay: 1000, callback: this.updateRealtimeGrowth, callbackScope: this, loop: true });

        setTimeout(() => {
            if (window.finishLoading) window.finishLoading();
        }, 500);
    }

    initHUD() {
        updateHUD({
            newWater: GARDEN_DATA.water,
            newGold: GARDEN_DATA.gold,
            levelData: {
                level: GARDEN_DATA.userLevel,
                currentXP: GARDEN_DATA.currentXP,
                nextLevelXP: GARDEN_DATA.nextLevelXP,
                levelName: GARDEN_DATA.levelName
            }
        });
    }

    update(time, delta) {
        if (this.game.device.os.desktop && this.keys.Q.isDown) {
            const pointer = this.input.activePointer;
            const threshold = 80; 
            const maxSpeed = 15; 
            let targetVX = 0; let targetVY = 0;

            if (pointer.x < threshold) targetVX = -maxSpeed;
            else if (pointer.x > this.scale.width - threshold) targetVX = maxSpeed;

            if (pointer.y < threshold) targetVY = -maxSpeed;
            else if (pointer.y > this.scale.height - threshold) targetVY = maxSpeed;

            this.camVelocity.x = Phaser.Math.Linear(this.camVelocity.x, targetVX, 0.1);
            this.camVelocity.y = Phaser.Math.Linear(this.camVelocity.y, targetVY, 0.1);

            this.cameras.main.scrollX += this.camVelocity.x;
            this.cameras.main.scrollY += this.camVelocity.y;
        } else {
            this.camVelocity.x = Phaser.Math.Linear(this.camVelocity.x, 0, 0.2);
            this.camVelocity.y = Phaser.Math.Linear(this.camVelocity.y, 0, 0.2);
            if (Math.abs(this.camVelocity.x) > 0.1 || Math.abs(this.camVelocity.y) > 0.1) {
                this.cameras.main.scrollX += this.camVelocity.x;
                this.cameras.main.scrollY += this.camVelocity.y;
            }
        }

        this.children.list.forEach(c => {
            if (c.isGardenItem) {
                c.setDepth(c === this.movingSprite ? 9999999 : c.y);
                if (c.ui) c.ui.setPosition(c.x, c.y - c.displayHeight - 10);
                if (c.thirstyIcon) c.thirstyIcon.setPosition(c.x, c.y - c.displayHeight);
            }
        });
    }

    setupExternalEvents() {
        window.addEventListener('resize', () => {
            this.game.scale.resize(window.innerWidth, window.innerHeight);
            this.updateCameraBounds();
        });

        window.gameEvents.on('toolChanged', (toolName) => {
            this.currentTool = toolName;
            this.input.setDefaultCursor(toolName === 'move' ? 'grab' : 'default');
            
            if (this.isMovingObject) this.cancelMoveObject();
            
            if (toolName !== 'move' && toolName !== 'cursor' && this.plantingMode.active) {
                this.cancelPlanting();
            }
            if (toolName !== 'cursor') {
                this.selectedTile = null;
                this.selectionMarker.setVisible(false);
                if(window.hidePlantStats) window.hidePlantStats();
            }
        });

        window.gameEvents.on('buyItem', ({ id, type }) => {
            this.plantingMode = { active: true, itemId: id, type: type };
            if (window.togglePlantingUI) {
                const itemData = ASSETS.PLANTS[id] || ASSETS.DECORS[id];
                window.togglePlantingUI(true, itemData ? itemData.name : "Vật phẩm");
            }
            showToast('Đã lấy hàng! Bấm chuột để đặt 🌱', 'info');
        });

        window.gameEvents.on('cancelPlanting', () => this.cancelPlanting());
        
        window.gameEvents.on('toggleMoveMode', () => {
            if (this.isMovingObject) {
                this.cancelMoveObject();
            } else {
                if (!this.selectedTile) return showToast('Hãy chọn 1 vật thể trước!', 'warning');
                this.startMovingSprite(this.selectedTile);
            }
        });
    }

    cancelPlanting() {
        this.plantingMode = { active: false, itemId: null, type: null };
        if (window.togglePlantingUI) window.togglePlantingUI(false);
        this.currentTool = 'cursor';
        if(window.selectTool) window.selectTool('cursor');
    }

    setupCamera() {
        this.cameras.main.setBounds(0, 0, WORLD_W, WORLD_H);
        this.updateCameraBounds();
        const savedCam = GARDEN_DATA.camera || { x: WORLD_W / 2, y: WORLD_H / 2, zoom: 1 };
        this.cameras.main.centerOn(Phaser.Math.Clamp(savedCam.x, 0, WORLD_W), Phaser.Math.Clamp(savedCam.y, 0, WORLD_H));
        this.cameras.main.setZoom(Math.max(savedCam.zoom, this.minZoom));
    }

    updateCameraBounds() {
        const minX = this.scale.width / WORLD_W;
        const minY = this.scale.height / WORLD_H;
        this.minZoom = Math.max(minX, minY, 0.5);
    }

    setupInput() {
        this.input.mouse.disableContextMenu();

        this.input.keyboard.on('keydown-SPACE', () => {
            const pointer = this.input.activePointer;
            const worldPoint = pointer.positionToCamera(this.cameras.main);
            const gx = Math.floor(worldPoint.x / GRID_SIZE) * GRID_SIZE;
            const gy = Math.floor(worldPoint.y / GRID_SIZE) * GRID_SIZE;

            if (this.plantingMode.active) this.handlePlantingAction(gx, gy);
            else if (this.isMovingObject && this.movingSprite) this.placeMovingSprite();
            else this.handleToolAction(gx, gy);
        });

        this.input.keyboard.on('keydown-R', () => {
            if (!IS_OWNER) return;
            if (this.isMovingObject) this.cancelMoveObject();
            else {
                if (this.selectedTile) this.startMovingSprite(this.selectedTile);
                else {
                    const pointer = this.input.activePointer;
                    const worldPoint = pointer.positionToCamera(this.cameras.main);
                    const gx = Math.floor(worldPoint.x / GRID_SIZE) * GRID_SIZE;
                    const gy = Math.floor(worldPoint.y / GRID_SIZE) * GRID_SIZE;
                    const item = this.children.list.find(c => c.isGardenItem && Math.abs(c.itemData.x - gx)<1 && Math.abs(c.itemData.y - gy)<1);
                    if (item) this.startMovingSprite(item);
                    else showToast('Hãy chỉ vào vật cần di chuyển!', 'warning');
                }
            }
        });

        this.input.on('wheel', (pointer, gameObjects, deltaX, deltaY, deltaZ) => {
            const cam = this.cameras.main;
            const newZoom = Phaser.Math.Clamp(cam.zoom - deltaY * 0.001, this.minZoom, this.maxZoom);
            cam.setZoom(newZoom);
            this.scheduleSaveCamera();
        });

        this.input.on('pointerdown', (pointer) => {
            if (this.input.pointer1.isDown && this.input.pointer2.isDown) {
                this.isPanning = false;
                this.initialZoomDistance = Phaser.Math.Distance.Between(this.input.pointer1.x, this.input.pointer1.y, this.input.pointer2.x, this.input.pointer2.y);
                this.initialCameraZoom = this.cameras.main.zoom;
                return;
            }

            if (this.isMovingObject && this.movingSprite && pointer.button === 0) {
                this.placeMovingSprite();
                return;
            }

            this.isPanning = false;
            this.dragStartPoint.set(pointer.x, pointer.y);
        });

        this.input.on('pointermove', (pointer) => {
            const worldPoint = pointer.positionToCamera(this.cameras.main);
            const gx = Math.floor(worldPoint.x / GRID_SIZE);
            const gy = Math.floor(worldPoint.y / GRID_SIZE);
            updateCoords(gx, gy);

            if (this.input.pointer1.isDown && this.input.pointer2.isDown) {
                const dist = Phaser.Math.Distance.Between(this.input.pointer1.x, this.input.pointer1.y, this.input.pointer2.x, this.input.pointer2.y);
                if (this.initialZoomDistance > 0) {
                    const scale = dist / this.initialZoomDistance;
                    this.cameras.main.setZoom(Phaser.Math.Clamp(this.initialCameraZoom * scale, this.minZoom, this.maxZoom));
                }
                return;
            }

            const isTouch = this.game.device.os.android || this.game.device.os.iOS;
            const isMiddleClick = pointer.button === 1;
            const isMoveTool = this.currentTool === 'move';
            
            const canPan = pointer.isDown && (
                isMiddleClick || 
                isMoveTool || 
                (isTouch && this.currentTool === 'cursor' && !this.plantingMode.active && !this.isMovingObject)
            );
            
            if (canPan) {
                if (!this.isPanning) {
                    const dist = Phaser.Math.Distance.Between(pointer.x, pointer.y, this.dragStartPoint.x, this.dragStartPoint.y);
                    if (dist > 10) {
                        this.isPanning = true;
                        this.input.setDefaultCursor('grabbing');
                        this.selectedTile = null; 
                        this.selectionMarker.setVisible(false); 
                        if(window.hidePlantStats) window.hidePlantStats();
                    }
                }

                if (this.isPanning) {
                    const cam = this.cameras.main;
                    const dx = (pointer.x - pointer.prevPosition.x) / cam.zoom;
                    const dy = (pointer.y - pointer.prevPosition.y) / cam.zoom;
                    cam.scrollX -= dx; cam.scrollY -= dy;
                }
            }

            if (this.isMovingObject && this.movingSprite) {
                const w = this.movingSprite.displayWidth;
                const h = this.movingSprite.displayHeight;
                this.movingSprite.x = (gx * GRID_SIZE) + (w / 2);
                this.movingSprite.y = (gy * GRID_SIZE) + h;
                this.marker.clear().lineStyle(3, 0x00ff00, 1).strokeRect(gx * GRID_SIZE, gy * GRID_SIZE, w, h);
            } else {
                let color = 0xffffff;
                if (this.plantingMode.active) color = 0x66bb6a;
                else if (this.currentTool === 'shovel') color = 0xef5350;
                else if (this.currentTool === 'water') color = 0x42a5f5;
                this.marker.clear().lineStyle(3, color, 1).strokeRect(gx * GRID_SIZE, gy * GRID_SIZE, GRID_SIZE, GRID_SIZE);
            }
        });

        this.input.on('pointerup', (pointer) => { 
            if (!this.isPanning && pointer.button === 0) {
                const worldPoint = pointer.positionToCamera(this.cameras.main);
                const gx = Math.floor(worldPoint.x / GRID_SIZE) * GRID_SIZE;
                const gy = Math.floor(worldPoint.y / GRID_SIZE) * GRID_SIZE;
                
                if (this.plantingMode.active) this.handlePlantingAction(gx, gy);
                else if (!this.isMovingObject) this.handleToolAction(gx, gy);
            }

            this.isPanning = false; 
            this.input.setDefaultCursor(this.currentTool === 'move' ? 'grab' : 'default');
            this.initialZoomDistance = 0;
            this.scheduleSaveCamera();
        });
    }

    startMovingSprite(sprite) {
        if (!IS_OWNER) return showToast('Chỉ chủ nhà mới được di chuyển!', 'warning');
        
        const item = sprite.itemData;
        if (item.type === 'plot') return showToast('Không thể di chuyển đất! 🚜', 'warning');

        const cfg = ASSETS.PLANTS[item.itemId] || ASSETS.DECORS[item.itemId];
        const canMove = !item.isDead && (item.type === 'decoration' || item.type === 'decor' || item.stage === 0 || (cfg && item.stage >= cfg.maxStage));
        
        if (canMove) {
            this.isMovingObject = true;
            this.movingSprite = sprite;
            this.originalPos = { x: sprite.x, y: sprite.y };
            
            if (sprite.ui) sprite.ui.setVisible(false);
            if (sprite.thirstyIcon) sprite.thirstyIcon.setVisible(true);
            this.selectedTile = null; 
            this.selectionMarker.setVisible(false); 
            if(window.hidePlantStats) window.hidePlantStats();
            
            this.input.setDefaultCursor('grabbing');
            showToast('Chế độ di chuyển: Click để đặt lại 🏗️', 'info');
            if (window.updateMobileMoveBtn) window.updateMobileMoveBtn(true);
        } else {
            showToast(item.isDead ? 'Cây chết không dời được!' : 'Cây đang lớn, không nên động vào!', 'warning');
        }
    }

    async placeMovingSprite() {
        if (!this.movingSprite) return;
        const sprite = this.movingSprite;
        const gx = Math.floor(sprite.x / GRID_SIZE) * GRID_SIZE;
        const gy = Math.floor((sprite.y - sprite.displayHeight) / GRID_SIZE) * GRID_SIZE;

        const conflict = this.children.list.find(o => {
            if (o === sprite || !o.isGardenItem || !o.itemData) return false;
            const hit = Math.abs(o.itemData.x - gx) < 1 && Math.abs(o.itemData.y - gy) < 1;
            if (!hit) return false;
            if (sprite.itemData.type === 'plant' && o.itemData.type === 'plot') return false; 
            return true;
        });

        if (conflict) return showToast('Vị trí bị trùng!', 'error');

        const hasPlot = this.children.list.some(o => o.itemData?.type === 'plot' && Math.abs(o.itemData.x - gx) < 1 && Math.abs(o.itemData.y - gy) < 1);
        
        if (sprite.itemData.type === 'plant' && !hasPlot) return showToast('Cây phải đặt trên đất!', 'warning');
        if ((sprite.itemData.type === 'decoration' || sprite.itemData.type === 'decor') && hasPlot) return showToast('Decor phải đặt trên cỏ!', 'warning');

        const res = await apiCall('/my-garden/move', { uniqueId: sprite.itemData._id, x: gx, y: gy });
        if (res.success) {
            sprite.itemData.x = gx; sprite.itemData.y = gy; sprite.setDepth(gy);
            if (sprite.ui) sprite.ui.setVisible(true);
            if (ASSETS.DECORS[sprite.itemData.itemId]?.isFence) this.updateAllFences();
            showToast('Đã di chuyển!', 'success');
            this.cancelMoveObject(false);
            
            this.selectItem(sprite);
        } else {
            showToast(res.msg, 'error');
            this.cancelMoveObject(true);
        }
    }

    cancelMoveObject(resetPos = true) {
        if (resetPos && this.movingSprite && this.originalPos) {
            this.movingSprite.x = this.originalPos.x;
            this.movingSprite.y = this.originalPos.y;
            if (this.movingSprite.ui) this.movingSprite.ui.setVisible(true);
        }
        this.isMovingObject = false; this.movingSprite = null; this.originalPos = null;
        this.input.setDefaultCursor('default');
        if (window.updateMobileMoveBtn) window.updateMobileMoveBtn(false);
    }

    async handlePlantingAction(gx, gy) {
        if (!this.plantingMode.active) return;
        const { itemId, type } = this.plantingMode;

        const allItems = this.children.list.filter(c => c.isGardenItem && c.itemData);
        const existingPlot = allItems.find(i => i.itemData.type === 'plot' && Math.abs(i.itemData.x - gx) < 1 && Math.abs(i.itemData.y - gy) < 1);
        const existingItem = allItems.find(i => i.itemData.type !== 'plot' && Math.abs(i.itemData.x - gx) < 1 && Math.abs(i.itemData.y - gy) < 1);

        if (type === 'plant') {
            if (!existingPlot) return showToast('Cần có đất để trồng! 🏜️', 'warning');
            if (existingItem) return showToast('Đã có cây rồi! 🌲', 'warning');
        } else if (type === 'plot') {
            if (existingPlot) return showToast('Chỗ này có đất rồi! 🚜', 'warning');
        } else if (type === 'decor' || type === 'decoration') {
            if (existingPlot) return showToast('Decor phải đặt trên cỏ!', 'warning');
            if (existingItem) return showToast('Vướng vật cản!', 'warning');
        }

        const res = await apiCall('/my-garden/buy', { itemId, type, x: gx, y: gy });
        if (res.success) {
            updateHUD(res);
            this.renderItem(res.item);
            this.add.particles(gx + 32, gy + 32, 'star_particle', { speed: 100, scale: { start: 0.5, end: 0 }, lifespan: 500, quantity: 10 }).explode();
            window.gameEvents.emit('actionSuccess', { action: 'plant' });
            if (ASSETS.DECORS[itemId]?.isFence) this.updateAllFences();
        } else showToast(res.msg, 'error');
    }

    async handleToolAction(gx, gy) {
        const allItems = this.children.list.filter(c => c.isGardenItem && c.itemData);
        const plant = allItems.find(i => i.itemData.type !== 'plot' && Math.abs(i.itemData.x - gx) < 1 && Math.abs(i.itemData.y - gy) < 1);
        const plot = allItems.find(i => i.itemData.type === 'plot' && Math.abs(i.itemData.x - gx) < 1 && Math.abs(i.itemData.y - gy) < 1);

        if (this.currentTool === 'cursor') {
            if (plant) this.selectItem(plant);
            else if (plot) this.selectItem(plot);
            else { 
                this.selectedTile = null; 
                this.selectionMarker.setVisible(false); 
                if(window.hidePlantStats) window.hidePlantStats(); 
            }
            return;
        }

        if (!IS_OWNER) return showToast('Chỉ chủ vườn mới được làm!', 'warning');

        if (this.currentTool === 'hoe') {
            if (!plot && !plant) {
                const res = await apiCall('/my-garden/buy', { type: 'plot', itemId: 'soil_tile', x: gx, y: gy });
                if (res.success) { 
                    this.renderItem(res.item); 
                    updateHUD(res); 
                    this.add.particles(gx+32, gy+32, 'soil_dry', { speed: 50, scale: { start: 0.2, end: 0 }, lifespan: 300, quantity: 5 }).explode(); 
                    
                    // [NEW] THÊM DÒNG NÀY ĐỂ TUTORIAL BIẾT ĐÃ CUỐC XONG
                    window.gameEvents.emit('actionSuccess', { action: 'hoe' });
                }
                else showToast(res.msg, 'error');
            } else showToast('Có đất rồi!', 'info');
        }
        else if (this.currentTool === 'water') {
            if (plant || plot) {
                const targetId = plant ? plant.itemData._id : plot.itemData._id;
                const res = await apiCall('/my-garden/interact', { uniqueId: targetId, action: 'water' });
                if (res.success) {
                    this.waterEmitter.emitParticleAt(gx + 32, gy + 32, 10);
                    const now = new Date();
                    if (plot) { plot.setTexture('soil_wet').setDisplaySize(GRID_SIZE, GRID_SIZE); plot.itemData.lastWatered = now; }
                    if (plant) {
                        plant.itemData.witherProgress = 0; this.updateThirstyIcon(plant, false);
                        const subPlot = allItems.find(i => i.itemData.type === 'plot' && Math.abs(i.itemData.x - gx)<1 && Math.abs(i.itemData.y - gy)<1);
                        if (subPlot) { subPlot.setTexture('soil_wet').setDisplaySize(GRID_SIZE, GRID_SIZE); subPlot.itemData.lastWatered = now; }
                    }
                    window.gameEvents.emit('actionSuccess', { action: 'water', target: targetId }); 
                    showToast('Đã tưới! 💦', 'success');
                } else showToast(res.msg, 'warning');
            }
        }
        else if (this.currentTool === 'basket') {
            if (plant && plant.itemData.type === 'plant') {
                if (plant.itemData.isDead) return showToast('Cây chết rồi!', 'error');
                const res = await apiCall('/my-garden/interact', { uniqueId: plant.itemData._id, action: 'harvest' });
                if (res.success) {
                    updateHUD(res);
                    if (res.xpReward) this.showFloatingText(gx + 32, gy, `+${res.xpReward} XP`, 'green');
                    if (res.goldReward) this.showFloatingText(gx + 32, gy - 20, `+${res.goldReward} Gold`, 'gold');
                    
                    // [FIX] Destroy UI (Star) manually
                    if (plant.ui) { plant.ui.destroy(); plant.ui = null; }

                    this.tweens.add({ targets: plant, y: plant.y - 60, alpha: 0, duration: 500, onComplete: () => { if(plant.thirstyIcon) plant.thirstyIcon.destroy(); plant.destroy(); } });
                    this.selectedTile = null; if(window.hidePlantStats) window.hidePlantStats();
                    
                    window.gameEvents.emit('actionSuccess', { action: 'harvest' });
                    showToast('Thu hoạch! 🌾', 'success');
                } else showToast(res.msg, 'warning');
            }
        }
        else if (this.currentTool === 'shovel') {
            const target = plant || plot;
            if (target) {
                const res = await apiCall('/my-garden/remove', { uniqueId: target.itemData._id });
                if (res.success) {
                    // [FIX] Destroy UI
                    if (target.ui) { target.ui.destroy(); target.ui = null; }
                    if (target.thirstyIcon) target.thirstyIcon.destroy();
                    
                    target.destroy();
                    if (ASSETS.DECORS[target.itemData.itemId]?.isFence) this.updateAllFences();
                    this.selectedTile = null; if(window.hidePlantStats) window.hidePlantStats();
                    showToast('Đã dọn dẹp!', 'success');
                }
            }
        }
    }

    renderItem(item) {
        item.clientRefTime = Date.now();
        if (item.type === 'plot') {
            const isWet = item.lastWatered && (Date.now() - new Date(item.lastWatered).getTime() < 24 * 3600000);
            const plot = this.add.image(item.x, item.y, isWet ? 'soil_wet' : 'soil_dry')
                .setOrigin(0).setDisplaySize(GRID_SIZE, GRID_SIZE).setDepth(0);
            plot.itemData = item; plot.isGardenItem = true;
            plot.setInteractive();
            return plot;
        }
        const config = ASSETS.PLANTS[item.itemId] || ASSETS.DECORS[item.itemId];
        if (!config) return null;
        
        let key = config.isFence ? `decor_${item.itemId}_base` : (item.type === 'plant' ? `plant_${item.itemId}_${item.stage || 0}` : `decor_${item.itemId}`);
        const w = config.size?.w || 1; const h = config.size?.h || 1;
        
        const sprite = this.add.sprite(item.x + (w * GRID_SIZE) / 2, item.y + (h * GRID_SIZE), key)
            .setOrigin(0.5, 1).setDisplaySize(w * GRID_SIZE, h * GRID_SIZE);
        
        sprite.itemData = item; sprite.isGardenItem = true; sprite.setDepth(item.y);
        if (item.isDead) sprite.setTint(0x555555);
        
        sprite.setInteractive(); this.input.setDraggable(sprite);

        if (item.type === 'plant') this.updatePlantUI(sprite);
        return sprite;
    }

    updateRealtimeGrowth() {
        const now = Date.now();
        const plotMap = {};
        this.children.list.forEach(c => { if(c.itemData && c.itemData.type==='plot') plotMap[`${c.itemData.x},${c.itemData.y}`] = c; });
        
        this.children.list.forEach(sprite => {
            if(!sprite.isGardenItem || !sprite.itemData) return;
            const item = sprite.itemData;
            
            if(item.type==='plot' && item.lastWatered && (now - new Date(item.lastWatered).getTime() >= 24*3600000)) {
                sprite.setTexture('soil_dry').setDisplaySize(GRID_SIZE,GRID_SIZE); item.lastWatered = null;
            }
            
            if(item.type==='plant' && !item.isDead) {
                const config = ASSETS.PLANTS[item.itemId];
                if(!config) return;
                
                const plotSprite = plotMap[`${item.x},${item.y}`];
                const isWet = plotSprite && plotSprite.itemData.lastWatered;
                this.updateThirstyIcon(sprite, !isWet && item.stage > 0);
                
                if(isWet) {
                    const elapsed = now - (item.clientRefTime || now);
                    const currentProgress = (item.growthProgress || 0) + elapsed;
                    const timePerStage = parseDuration(config.growthTime);
                    const newStage = Math.min(Math.floor(currentProgress / timePerStage), config.maxStage);
                    
                    if(newStage > item.stage) {
                        item.stage = newStage;
                        sprite.setTexture(`plant_${item.itemId}_${newStage}`);
                        sprite.setDisplaySize((config.size?.w||1)*GRID_SIZE, (config.size?.h||1)*GRID_SIZE).setOrigin(0.5,1);
                        
                        if(newStage < config.maxStage) this.showFloatingText(sprite.x, sprite.y-sprite.displayHeight, "Lớn lên! 🌱", "green");
                        else this.showFloatingText(sprite.x, sprite.y-sprite.displayHeight, "Chín rồi! ⭐", "gold");
                        
                        if(newStage >= config.maxStage) this.updatePlantUI(sprite);
                    }
                }
            }
        });
    }

    drawGrid() {
        if (this.gridGraphics) this.gridGraphics.destroy();
        const g = this.add.graphics().lineStyle(1, 0xffffff, 0.05);
        for(let x=0; x<=WORLD_W; x+=GRID_SIZE) { g.moveTo(x,0); g.lineTo(x,WORLD_H); }
        for(let y=0; y<=WORLD_H; y+=GRID_SIZE) { g.moveTo(0,y); g.lineTo(WORLD_W,y); }
        g.strokePath(); this.gridGraphics = g;
    }

    selectItem(sprite) {
        this.selectedTile = sprite;
        this.selectionMarker.setVisible(true);
        const w = sprite.displayWidth; const h = sprite.displayHeight;
        
        const drawX = sprite.x - (w * sprite.originX);
        const drawY = sprite.y - (h * sprite.originY);
        
        this.selectionMarker.clear().lineStyle(4, 0x00ffff, 1).strokeRect(drawX, drawY, w, h);
        if(window.showPlantStats) window.showPlantStats(sprite.itemData);
        if (IS_OWNER && window.updateMobileMoveBtn) window.updateMobileMoveBtn(true);
    }

    updateThirstyIcon(sprite, isThirsty) {
        if(isThirsty && !sprite.thirstyIcon) {
            const icon = this.add.image(sprite.x, sprite.y-sprite.displayHeight-20, 'water_drop').setOrigin(0.5,1).setDepth(999999);
            this.tweens.add({targets:icon, y:'-=15', duration:800, yoyo:true, repeat:-1});
            sprite.thirstyIcon = icon;
        } else if(!isThirsty && sprite.thirstyIcon) {
            sprite.thirstyIcon.destroy(); sprite.thirstyIcon = null;
        }
    }
    
    updatePlantUI(sprite) {
        if (sprite.ui) sprite.ui.destroy();
        const cfg = ASSETS.PLANTS[sprite.itemData.itemId];
        if (cfg && (sprite.itemData.stage >= cfg.maxStage) && !sprite.itemData.isDead) {
            const s = this.add.text(0, 0, '⭐', { fontSize: '32px' }).setOrigin(0.5);
            this.tweens.add({ targets: s, y: '-=15', yoyo: true, repeat: -1 });
            sprite.ui = this.add.container(sprite.x, sprite.y, [s]).setDepth(99999);
        }
    }

    updateAllFences() { this.children.list.forEach(c => { if(c.isGardenItem && ASSETS.DECORS[c.itemData.itemId]?.isFence) this.updateFenceTexture(c); }); }
    updateFenceTexture(s) {
        const { itemId, x, y } = s.itemData;
        const check = (dx, dy) => this.children.list.some(o => o.isGardenItem && o.itemData.itemId===itemId && Math.abs(o.itemData.x - (x+dx))<1 && Math.abs(o.itemData.y - (y+dy))<1);
        let key = `decor_${itemId}_base`;
        if((check(-64,0)||check(64,0)) && !(check(0,-64)||check(0,64))) key=`decor_${itemId}_h`;
        else if((check(0,-64)||check(0,64)) && !(check(-64,0)||check(64,0))) key=`decor_${itemId}_v`;
        s.setTexture(key).setDisplaySize(GRID_SIZE,GRID_SIZE);
    }

    showFloatingText(x, y, msg, cType) {
        const colors = { gold: '#ffeb3b', green: '#66bb6a', blue: '#42a5f5' };
        const txt = this.add.text(x, y-20, msg, { fontFamily: 'VT323', fontSize: '32px', color: colors[cType]||'#fff', stroke:'#000', strokeThickness:4 }).setOrigin(0.5).setDepth(999999);
        this.tweens.add({ targets:txt, y:y-100, alpha:0, duration:1500, onComplete:()=>txt.destroy() });
    }

    scheduleSaveCamera() {
        if(this.saveCamTimer) clearTimeout(this.saveCamTimer);
        this.saveCamTimer = setTimeout(() => {
            const cam = this.cameras.main;
            apiCall('/my-garden/save-camera', { x: cam.scrollX+cam.width/2, y: cam.scrollY+cam.height/2, zoom: cam.zoom });
        }, 2000);
    }
}

// --- 4. GLOBAL INIT ---
const config = { ...PHASER_CONFIG, scene: MainScene };
const game = new Phaser.Game(config);
window.gameEvents = new Phaser.Events.EventEmitter();

window.selectTool = function(t) { window.gameEvents.emit('toolChanged', t); };
window.cancelPlanting = function() { window.gameEvents.emit('cancelPlanting'); };
window.updateCoords = updateCoords;