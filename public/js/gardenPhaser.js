/**
 * GARDEN PHASER ENGINE - DRAG & DROP FIX
 * Update: Cập nhật trạng thái đất Real-time khi kéo cây.
 */

const ASSETS = window.gardenAssets;
const GARDEN_DATA = window.gardenData;
const GRID_SIZE = 64;
const WORLD_W = 64 * GRID_SIZE;
const WORLD_H = 64 * GRID_SIZE;

// --- 0. KHỞI TẠO TOAST ---
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

// --- 1. HỘI THOẠI NPC ---
const NPC_DIALOGUES = {
    welcome: [ "Hế lô cưng! Nay mua gì nè? 💖", "Vào lựa lẹ đi, hàng mới về nóng hổi! 🔥", "Trộm vía, nay nhìn bạn tươi nha! Mua cây đi!", "Khách quen, giảm giá... trong mơ nha! 🤣" ],
    plants: [ "Trồng cây đi, đừng trồng cây si! 🌱", "Hạt giống bao nảy mầm, không nảy bắt đền... trời! 😜", "Mua Lúa đi, sau này tha hồ gặt hái! 🌾", "Hướng dương nè, nhìn là thấy chói chang liền! 🌻" ],
    decors: [ "Decor cái vườn cho nó keo lỳ đi fen! ✨", "Nhà sạch thì mát, vườn đẹp thì... tốn tiền! 💸", "Mấy cái này đang trend đó, chốt đơn lẹ!", "Vườn đẹp là auto có người yêu nha (chắc vậy)!" ],
    backgrounds: [ "Đất chật người đông, mở rộng ra cho thoáng! 🚜", "Muốn làm đại gia đất đai thì bơi vào đây!", "Mua thêm đất đi, trồng cho đã cái nư!", "Cẩn thận nha, cuốc đất nhiều lên cơ tay đó! 💪" ]
};

function getNPCSpeech(category) {
    const list = NPC_DIALOGUES[category] || NPC_DIALOGUES.welcome;
    return list[Math.floor(Math.random() * list.length)];
}

class MainScene extends Phaser.Scene {
    constructor() {
        super({ key: 'MainScene' });
        this.marker = null; this.currentTool = 'cursor'; this.bgTile = null;
        this.isDraggingSprite = false; this.isPanning = false;
        this.dragStart = { x: 0, y: 0 }; this.holdTimer = null;
        this.movingSprite = null; this.hoveredSprite = null; this.saveCamTimer = null;
    }

    preload() {
        for (let key in ASSETS.PLANTS) ASSETS.PLANTS[key].stages.forEach((url, i) => this.load.image(`plant_${key}_${i}`, url));
        for (let key in ASSETS.DECORS) this.load.image(`decor_${key}`, ASSETS.DECORS[key].image);
        this.load.image('water_drop', '/api/pro-images/1767290687212-2rlhp4.png');
        this.load.image('star_particle', '/api/pro-images/1767290642605-hz0cd0.png');
    }

    create() {
        window.sceneContext = this;
        this.physics.world.setBounds(0, 0, WORLD_W, WORLD_H);
        this.input.mouse.disableContextMenu();

        const savedCam = GARDEN_DATA.camera || { x: WORLD_W/2, y: WORLD_H/2, zoom: 1 };
        this.cameras.main.setBounds(0, 0, WORLD_W, WORLD_H).centerOn(savedCam.x, savedCam.y).setZoom(savedCam.zoom);

        this.createProceduralTexture('grass_tile', '#66bb6a', '#388e3c');
        this.createProceduralTexture('soil_dry',   '#8d6e63', '#5d4037');
        this.createProceduralTexture('soil_wet',   '#4e342e', '#3e2723');
        
        // [FIX] Bãi cỏ giữ nguyên kích thước WORLD, không được resize theo màn hình
        this.bgTile = this.add.tileSprite(0, 0, WORLD_W, WORLD_H, 'grass_tile').setOrigin(0);
        
        this.drawGrid();

        this.marker = this.add.graphics().lineStyle(3, 0xffffff, 1).strokeRect(0, 0, GRID_SIZE, GRID_SIZE).setDepth(99999);
        this.waterEmitter = this.add.particles(0, 0, 'water_drop', { speed: 100, scale: {start:0.05, end:0}, lifespan: 500, emitting: false });

        this.input.on('pointerdown', (pointer) => {
            if (this.movingSprite && pointer.button === 0) { this.placeMovingSprite(); return; }
            if (!this.movingSprite && (pointer.middleButtonDown() || (this.currentTool === 'cursor' && pointer.leftButtonDown()))) {
                this.isPanning = true; this.dragStart.x = pointer.x; this.dragStart.y = pointer.y;
            }
        });

        this.input.on('pointerup', () => { 
            if (this.isPanning) { this.isPanning = false; this.scheduleSaveCamera(); }
            if (this.holdTimer) { this.holdTimer.remove(); this.holdTimer = null; }
        });

        // [LOGIC DI CHUYỂN & CẬP NHẬT TRẠNG THÁI ĐẤT]
        this.input.on('pointermove', (pointer) => {
            if (this.holdTimer && Phaser.Math.Distance.Between(pointer.downX, pointer.downY, pointer.x, pointer.y) > 10) {
                this.holdTimer.remove(); this.holdTimer = null;
            }
            if (this.isPanning && !this.movingSprite) {
                this.cameras.main.scrollX -= (pointer.x - this.dragStart.x) / this.cameras.main.zoom;
                this.cameras.main.scrollY -= (pointer.y - this.dragStart.y) / this.cameras.main.zoom;
                this.dragStart.x = pointer.x; this.dragStart.y = pointer.y;
            }
            
            const worldP = pointer.positionToCamera(this.cameras.main);
            const gx = Math.floor(worldP.x / GRID_SIZE); 
            const gy = Math.floor(worldP.y / GRID_SIZE);
            
            if (this.movingSprite) {
                this.marker.clear().lineStyle(3, 0x00ff00, 1).strokeRect(gx*GRID_SIZE, gy*GRID_SIZE, this.movingSprite.displayWidth, this.movingSprite.displayHeight);
                this.movingSprite.x = gx*GRID_SIZE + this.movingSprite.displayWidth/2;
                this.movingSprite.y = gy*GRID_SIZE + this.movingSprite.displayHeight;

                const checkX = gx * GRID_SIZE;
                const checkY = gy * GRID_SIZE;
                const plotUnderneath = this.children.list.find(o => o.itemData && o.itemData.type === 'plot' && o.itemData.x === checkX && o.itemData.y === checkY);

                let isGroundWet = false;
                if (plotUnderneath && plotUnderneath.itemData.lastWatered) {
                    const now = Date.now();
                    const wateredTime = new Date(plotUnderneath.itemData.lastWatered).getTime();
                    if (now - wateredTime < 24 * 60 * 60 * 1000) isGroundWet = true;
                }

                if (this.movingSprite.thirstyIcon) {
                    this.movingSprite.thirstyIcon.setVisible(!isGroundWet);
                    this.movingSprite.thirstyIcon.setPosition(this.movingSprite.x, this.movingSprite.y - this.movingSprite.displayHeight);
                }

                const statusEl = document.getElementById('statSoilStatus');
                const coordsEl = document.getElementById('statCoords');
                if (statusEl) {
                    if (isGroundWet) {
                        statusEl.innerText = "Đất Ẩm (Tốt) [Sẽ đặt tại đây]";
                        statusEl.style.color = "#4fc3f7"; 
                    } else {
                        statusEl.innerText = "Đất Khô [Sẽ đặt tại đây]";
                        statusEl.style.color = "#ef5350"; 
                    }
                }
                if (coordsEl) coordsEl.innerText = `Pos: (${gx}, ${gy})`;

            } else {
                this.marker.clear().lineStyle(3, 0xffffff, 1).strokeRect(gx*GRID_SIZE, gy*GRID_SIZE, GRID_SIZE, GRID_SIZE);
            }
            
            const hud = document.getElementById('hudCoords'); if(hud) hud.innerText = `${gx}, ${gy}`;
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

        this.input.keyboard.on('keydown-E', () => {
            const panel = document.getElementById('plantStats');
            if (panel.classList.contains('active')) window.hidePlantStats();
            else if (this.hoveredSprite && this.currentTool === 'cursor') {
                const gx = Math.floor(this.hoveredSprite.itemData.x / GRID_SIZE);
                const gy = Math.floor(this.hoveredSprite.itemData.y / GRID_SIZE);
                window.showPlantStats(this.hoveredSprite.itemData, {x: gx, y: gy});
            }
        });
        this.input.keyboard.on('keydown-R', () => { if (this.hoveredSprite && this.currentTool === 'cursor') this.startMovingSprite(this.hoveredSprite); });

        if (window.gardenData && window.gardenData.items) window.gardenData.items.forEach(item => this.renderItem(item));

        window.gameEvents.on('toolChanged', (t) => { this.currentTool = t; this.updateCursor(t); this.isPanning = false; if(this.movingSprite) this.cancelMove(); });
        window.gameEvents.on('openShop', (tab) => openShopHTML(tab));
        this.scale.on('resize', (s) => this.bgTile.setSize(s.width, s.height)); // <-- XÓA HOẶC KHÔNG DÙNG DÒNG NÀY CHO BGTILE

        this.time.addEvent({ delay: 1000, callback: this.updateRealtimeGrowth, callbackScope: this, loop: true });
    }

    update() {
        this.children.list.forEach(child => {
            if (child.isGardenItem) {
                child.setDepth(child === this.movingSprite ? 999999 : child.y);
                if (child.ui) child.ui.setPosition(child.x, child.y - (child.displayHeight + 10));
                if (child.miniHud) child.miniHud.setPosition(child.x, child.y - child.displayHeight - 20);
                
                if (child.thirstyIcon) {
                    child.thirstyIcon.setPosition(child.x, child.y - child.displayHeight);
                    child.thirstyIcon.setDepth(999999);
                }
            }
        });
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
        } else {
            if (sprite.thirstyIcon) { sprite.thirstyIcon.destroy(); sprite.thirstyIcon = null; }
        }
    }

    updateRealtimeGrowth() {
        const now = Date.now();
        const plotMap = {};
        this.children.list.forEach(o => { if(o.itemData && o.itemData.type === 'plot') plotMap[`${o.itemData.x},${o.itemData.y}`] = o.itemData; });

        this.children.list.forEach(sprite => {
            if (!sprite.isGardenItem || !sprite.itemData || sprite.itemData.type !== 'plant') return;
            const item = sprite.itemData;
            
            if (item.isDead) { this.updateThirstyIcon(sprite, false); return; }

            const config = ASSETS.PLANTS[item.itemId]; if (!config) return;
            const plotData = plotMap[`${item.x},${item.y}`];
            let isWet = false;
            
            if (plotData && plotData.lastWatered) {
                const wateredTime = new Date(plotData.lastWatered).getTime();
                if (now - wateredTime < 24 * 60 * 60 * 1000) isWet = true;
                if (!isWet) { const plotSprite = this.children.list.find(o => o.itemData === plotData); if(plotSprite) plotSprite.setTexture('soil_dry'); }
            }

            this.updateThirstyIcon(sprite, !isWet && !item.isDead);

            const elapsed = now - (item.clientRefTime || now); 
            if (isWet && item.stage < config.maxStage) {
                const estimatedProgress = (item.growthProgress || 0) + elapsed;
                const timePerStage = this.parseDuration(config.growthTime);
                const calcStage = Math.floor(estimatedProgress / timePerStage);
                const newStage = Math.min(calcStage, config.maxStage);
                if (newStage > item.stage) {
                    item.stage = newStage; sprite.setTexture(`plant_${item.itemId}_${newStage}`); this.showLevelUpEffect(sprite);
                }
            }
            if (!isWet && item.stage > 0) {
                const currentWither = (item.witherProgress || 0) + elapsed;
                const maxWither = this.parseDuration(config.witherTime || '30 phút');
                if (currentWither >= maxWither) {
                    item.isDead = true; sprite.setTint(0x555555); this.updateThirstyIcon(sprite, false); showToast('Có cây đã chết khô! 🥀', 'error');
                }
            }
        });
    }

    parseDuration(str) { if (!str) return 5 * 60000; const num = parseInt(str); if (str.includes('giờ')) return num * 3600000; return num * 60000; }

    showFloatingText(x, y, message, color) {
        let hexColor = '#ffffff';
        if (color === 'gold' || color === 'yellow') hexColor = '#ffeb3b';
        else if (color === 'red') hexColor = '#ef5350';
        else if (color === 'blue') hexColor = '#42a5f5';
        else if (color === 'green') hexColor = '#66bb6a';
        else if (color === 'gray') hexColor = '#bdbdbd'; 
        const txt = this.add.text(x, y - 20, message, { fontFamily: 'VT323', fontSize: '32px', color: hexColor, stroke: '#000', strokeThickness: 4, align: 'center' }).setOrigin(0.5).setDepth(999999);
        this.tweens.add({ targets: txt, y: y - 100, alpha: 0, duration: 2000, ease: 'Power2', onComplete: () => txt.destroy() });
    }

    showLevelUpEffect(sprite) {
        this.showFloatingText(sprite.x, sprite.y - sprite.displayHeight, 'LỚN LÊN! 🌱', 'green');
        this.add.particles(0, 0, 'star_particle', { x: sprite.x, y: sprite.y - sprite.displayHeight/2, speed: { min: 50, max: 150 }, scale: { start: 0.4, end: 0 }, lifespan: 800, quantity: 5 }).explode();
    }

    scheduleSaveCamera() {
        if (this.saveCamTimer) clearTimeout(this.saveCamTimer);
        this.saveCamTimer = setTimeout(() => {
            const cam = this.cameras.main;
            apiCall('/my-garden/save-camera', { x: cam.scrollX + cam.width/2, y: cam.scrollY + cam.height/2, zoom: cam.zoom });
        }, 1000);
    }

    async handleToolAction(x, y, pointer) {
        if (pointer.button !== 0) return;
        const gx = Math.floor(x / GRID_SIZE) * GRID_SIZE; const gy = Math.floor(y / GRID_SIZE) * GRID_SIZE;
        const all = this.children.list;
        const plot = all.find(o => o.itemData && o.itemData.type === 'plot' && o.itemData.x === gx && o.itemData.y === gy);
        const plant = all.find(o => {
            if (!o.isGardenItem || !o.itemData || o.itemData.type === 'plot') return false;
            const w = o.displayWidth, h = o.displayHeight; return (x >= o.x-w/2 && x <= o.x+w/2 && y >= o.y-h && y <= o.y);
        });

        if (this.currentTool === 'cursor') {
            if (plant) { window.showPlantStats(plant.itemData, {x: gx/GRID_SIZE, y: gy/GRID_SIZE}); this.tweens.add({ targets: plant, alpha: 0.5, duration: 100, yoyo: true }); }
            else if (plot) window.showPlantStats(plot.itemData, {x: gx/GRID_SIZE, y: gy/GRID_SIZE});
            else window.hidePlantStats();
            return;
        } else { window.hidePlantStats(); }

        if (this.currentTool === 'hoe') {
            if (!plot) {
                if (plant) return showToast('Vướng cây rồi fen!', 'warning');
                const res = await apiCall('/my-garden/buy', { type:'plot', itemId:'soil_tile', x:gx, y:gy });
                if (res.success) { 
                    this.renderItem(res.item); updateHUD(res); showToast(res.msg, 'success');
                    if(window.checkTutorialAction) window.checkTutorialAction('wait_action_buy_plot');
                } else { showToast(res.msg, 'error'); if(res.msg.includes('vàng') || res.msg.includes('tiền')) this.showFloatingText(gx+32, gy, "Thiếu Tiền! 💸", 'red'); }
            }
        }
        else if (this.currentTool === 'water') {
            if (plant && plant.itemData.isDead) { showToast('Cây hẹo rồi, không cứu được đâu! 🥀', 'error'); this.showFloatingText(plant.x, plant.y - 40, "Đã Chết 💀", 'gray'); return; }
            if (plant || plot) {
                const id = plant ? plant.itemData._id : plot.itemData._id;
                const res = await apiCall('/my-garden/interact', { uniqueId: id, action:'water' });
                if (res.success) {
                    updateHUD(res); this.waterEmitter.emitParticleAt(gx+32, gy+32, 10); this.showFloatingText(gx + 32, gy, "-1 💧", "blue");
                    const now = Date.now();
                    if(plot) { plot.setTexture('soil_wet'); plot.itemData.lastWatered = new Date(); plot.itemData.clientRefTime = now; }
                    if(plant) {
                        plant.itemData.witherProgress = 0; this.updateThirstyIcon(plant, false);
                        const groundPlot = all.find(o => o.itemData && o.itemData.type === 'plot' && o.itemData.x === plant.itemData.x && o.itemData.y === plant.itemData.y);
                        if(groundPlot) { groundPlot.setTexture('soil_wet'); groundPlot.itemData.lastWatered = new Date(); groundPlot.itemData.clientRefTime = now; }
                        if(res.item) { Object.assign(plant.itemData, res.item); plant.itemData.clientRefTime = now; }
                        if (plant.itemData.stage > 0) plant.setTexture(`plant_${plant.itemData.itemId}_${plant.itemData.stage}`);
                    }
                    showToast('Đã tưới nước! 💦', 'success'); if(window.checkTutorialAction) window.checkTutorialAction('wait_action_water');
                } else { showToast(res.msg, 'warning'); if(res.msg.includes('nước')) this.showFloatingText(gx + 32, gy, "Hết Nước! 😩", "red"); }
            }
        }
        else if (this.currentTool === 'shovel') { if (plant) this.removeObj(plant); else if (plot) this.removeObj(plot); }
        else if (this.currentTool === 'basket') {
            if (plant && plant.itemData.type === 'plant') {
                if (plant.itemData.isDead) { showToast('Cây hẹo rồi, dọn dẹp đi thôi! 🧹', 'error'); this.showFloatingText(plant.x, plant.y - 40, "Đã Chết 💀", 'gray'); return; }
                const res = await apiCall('/my-garden/interact', { uniqueId: plant.itemData._id, action: 'harvest' });
                if (res.success) {
                    updateHUD(res);
                    if (res.xpReward) this.showFloatingText(plant.x, plant.y - 60, `+${res.xpReward} XP ✨`, 'green');
                    if (res.goldReward) this.showFloatingText(plant.x, plant.y - 90, `+${res.goldReward} 💰`, 'gold');
                    this.tweens.add({ targets: plant, y: plant.y - 100, alpha: 0, duration: 600, onComplete: () => { 
                        if (plant.ui) plant.ui.destroy(); if (plant.miniHud) plant.miniHud.destroy(); if (plant.thirstyIcon) plant.thirstyIcon.destroy(); plant.destroy(); 
                    }});
                    showToast(res.msg, 'success');
                } else showToast(res.msg, 'warning');
            }
        }
    }

    renderItem(item) {
        item.clientRefTime = Date.now();
        if (item.type === 'plot') {
            const isWet = item.lastWatered != null;
            const plot = this.add.image(item.x, item.y, isWet ? 'soil_wet' : 'soil_dry').setOrigin(0).setDisplaySize(GRID_SIZE, GRID_SIZE);
            plot.itemData = item; plot.isGardenItem = false; plot.setDepth(0);
            plot.setInteractive(); this.createMiniHUD(plot, true);
            plot.on('pointerover', () => {
                this.hoveredSprite = plot;
                if (this.currentTool === 'cursor' && plot.miniHud && !this.movingSprite) {
                    const hasPlant = this.children.list.some(c => c.isGardenItem && c.itemData.type !== 'plot' && c.itemData.x === plot.itemData.x && c.itemData.y === plot.itemData.y);
                    if (!hasPlant) plot.miniHud.setVisible(true);
                }
            });
            plot.on('pointerout', () => { if (this.hoveredSprite === plot) this.hoveredSprite = null; if (plot.miniHud) this.time.delayedCall(100, () => { if(!plot.miniHud.isHovered) plot.miniHud.setVisible(false); }); });
            return plot;
        }
        let key = `plant_${item.itemId}_${item.stage||0}`;
        if (!this.textures.exists(key)) key = `decor_${item.itemId}`; if (!this.textures.exists(key)) key = 'missing';
        const config = ASSETS.PLANTS[item.itemId] || ASSETS.DECORS[item.itemId];
        const w = (config?.size?.w || 1) * GRID_SIZE; const h = (config?.size?.h || 1) * GRID_SIZE;
        const sprite = this.add.sprite(item.x + w/2, item.y + h, key).setOrigin(0.5, 1).setDisplaySize(w, h);
        sprite.isGardenItem = true; sprite.itemData = item; sprite.setInteractive(); this.input.setDraggable(sprite);
        if (item.isDead) sprite.setTint(0x555555);
        if(item.type==='plant') { this.updatePlantUI(sprite); this.createMiniHUD(sprite, false); }
        
        sprite.on('pointerover', () => {
            this.hoveredSprite = sprite;
            if (this.currentTool==='cursor' && sprite.miniHud && !this.movingSprite) { this.updateMiniHUD(sprite); sprite.miniHud.setVisible(true); }
        });
        sprite.on('pointerout', () => { if (this.hoveredSprite === sprite) this.hoveredSprite = null; if (sprite.miniHud) this.time.delayedCall(100, () => { if(!sprite.miniHud.isHovered) sprite.miniHud.setVisible(false); }); });
        sprite.on('pointerdown', (p) => { if (this.currentTool==='cursor' && p.button===0) { this.holdTimer = this.time.delayedCall(2000, () => this.startMovingSprite(sprite)); } });
        return sprite;
    }

    createMiniHUD(sprite, isPlot = false) {
        const yOffset = isPlot ? 10 : (sprite.displayHeight + 20);
        const container = this.add.container(sprite.x + (isPlot ? 32 : 0), sprite.y - yOffset).setVisible(false).setDepth(999999);
        const bgHeight = isPlot ? 30 : 60; const bg = this.add.rectangle(0, -bgHeight/2 + 10, 70, bgHeight, 0x000000, 0).setOrigin(0.5); container.add(bg);
        if (!isPlot) {
            const barBg = this.add.rectangle(0, -25, 60, 6, 0x000000); const barFill = this.add.rectangle(-30, -25, 0, 6, 0x00ff00).setOrigin(0, 0.5);
            container.add([barBg, barFill]); sprite.miniHudFill = barFill;
        }
        const mkBtn = (y, txt, col, cb) => {
            const b = this.add.container(0, y); const r = this.add.rectangle(0, 0, 60, 20, col).setOrigin(0.5).setInteractive();
            const t = this.add.text(0, 0, txt, {fontSize:'12px', fontFamily:'VT323', color:'#fff'}).setOrigin(0.5);
            r.on('pointerdown', (e) => { e.event.stopPropagation(); cb(); }); r.on('pointerover', () => container.isHovered = true); r.on('pointerout', () => container.isHovered = false); b.add([r, t]); return b;
        };
        container.add(mkBtn(isPlot ? 0 : -5, 'Xem (E)', 0x2196f3, () => {
            const gx = Math.floor(sprite.itemData.x / GRID_SIZE); const gy = Math.floor(sprite.itemData.y / GRID_SIZE); window.showPlantStats(sprite.itemData, {x: gx, y: gy});
        }));
        if (!isPlot) container.add(mkBtn(20, 'Dời (R)', 0xff9800, () => this.startMovingSprite(sprite)));
        sprite.miniHud = container;
    }

    updateMiniHUD(sprite) {
        if(!sprite.miniHud) return; const cfg = ASSETS.PLANTS[sprite.itemData.itemId]; if(!cfg) return;
        const pct = Math.min(1, (sprite.itemData.stage||0) / (cfg.maxStage||3));
        sprite.miniHudFill.width = 60 * pct;
        if(sprite.itemData.isDead) sprite.miniHudFill.fillColor = 0x555555;
        else if(sprite.itemData.stage >= cfg.maxStage) sprite.miniHudFill.fillColor = 0xffeb3b;
        else sprite.miniHudFill.fillColor = 0x00ff00;
    }

    updatePlantUI(sprite) {
        if(sprite.ui) sprite.ui.destroy(); const cfg = ASSETS.PLANTS[sprite.itemData.itemId];
        if(cfg && (sprite.itemData.stage >= cfg.maxStage) && !sprite.itemData.isDead) {
            const s = this.add.text(0,0,'⭐',{fontSize:'32px'}).setOrigin(0.5); this.tweens.add({targets:s, y:'-=15', yoyo:true, repeat:-1}); sprite.ui = this.add.container(sprite.x, sprite.y, [s]).setDepth(99999);
        }
    }

    // [CẬP NHẬT] Hàm startMovingSprite - Dừng update tự động từ bảng info
    startMovingSprite(sprite) {
        const item = sprite.itemData; const cfg = ASSETS.PLANTS[item.itemId] || ASSETS.DECORS[item.itemId];
        const canMove = !item.isDead && (item.type === 'decoration' || item.stage === 0 || (cfg && item.stage >= cfg.maxStage));
        if (canMove) {
            this.movingSprite = sprite; this.originalPos = {x:sprite.x, y:sprite.y};
            if(sprite.ui) sprite.ui.setVisible(false); if(sprite.miniHud) sprite.miniHud.setVisible(false);
            if(sprite.thirstyIcon) sprite.thirstyIcon.setVisible(true);
            
            // [FIX] Dừng cập nhật Stats Panel tự động để không bị reset text
            if(window.statsInterval) clearInterval(window.statsInterval);

            this.input.setDefaultCursor('grabbing'); showToast('Đang di chuyển... Đặt xuống đi fen!', 'info');
        } else showToast(item.isDead ? 'Cây hẹo rồi không dời được!' : 'Cây đang lớn, đừng làm phiền nó!', 'warning');
    }

    placeMovingSprite() {
        if(!this.movingSprite) return; savePosition(this.movingSprite);
        this.movingSprite.setAlpha(1); if(this.movingSprite.ui) this.movingSprite.ui.setVisible(true);
        if(this.movingSprite.thirstyIcon) this.movingSprite.thirstyIcon.setVisible(true);
        
        // [FIX] Restart lại Stats Panel tại vị trí mới
        const gx = Math.floor(this.movingSprite.x / GRID_SIZE); const gy = Math.floor(this.movingSprite.y / GRID_SIZE);
        window.showPlantStats(this.movingSprite.itemData, {x: gx, y: gy});

        this.movingSprite = null; this.input.setDefaultCursor('default'); showToast('Đã đặt xuống yên vị! 🛋️', 'success');
    }

    cancelMove() {
        if(!this.movingSprite) return; this.movingSprite.x = this.originalPos.x; this.movingSprite.y = this.originalPos.y;
        this.movingSprite.setAlpha(1); if(this.movingSprite.ui) this.movingSprite.ui.setVisible(true);
        if(this.movingSprite.thirstyIcon) this.movingSprite.thirstyIcon.setVisible(true);
        
        // Restart stats
        const gx = Math.floor(this.movingSprite.x / GRID_SIZE); const gy = Math.floor(this.movingSprite.y / GRID_SIZE);
        window.showPlantStats(this.movingSprite.itemData, {x: gx, y: gy});

        this.movingSprite = null; this.input.setDefaultCursor('default');
    }

    async removeObj(obj) {
        const res = await apiCall('/my-garden/remove', { uniqueId: obj.itemData._id });
        if(res.success) {
            if(obj.ui) obj.ui.destroy(); if(obj.miniHud) obj.miniHud.destroy(); if(obj.thirstyIcon) obj.thirstyIcon.destroy();
            this.tweens.add({targets:obj, scale:0, duration:200, onComplete:()=>obj.destroy()});
            this.add.particles(obj.x, obj.y, 'soil_dry', {speed:100, lifespan:300}).explode();
            showToast('Đã dọn dẹp sạch sẽ! 🧹', 'success');
        }
    }

    createProceduralTexture(k,b,d){if(!this.textures.exists(k)){const c=document.createElement('canvas');c.width=GRID_SIZE;c.height=GRID_SIZE;const x=c.getContext('2d');x.fillStyle=b;x.fillRect(0,0,GRID_SIZE,GRID_SIZE);x.fillStyle=d;for(let i=0;i<GRID_SIZE*GRID_SIZE*0.2;i++)x.fillRect(Math.random()*GRID_SIZE,Math.random()*GRID_SIZE,1,1);x.strokeStyle=d;x.lineWidth=1;x.strokeRect(0.5,0.5,GRID_SIZE-1,GRID_SIZE-1);this.textures.addCanvas(k,c);}}
    drawGrid(){if(this.gridGraphics)this.gridGraphics.destroy();const g=this.add.graphics().lineStyle(1,0xffffff,0.05);for(let x=0;x<=WORLD_W;x+=GRID_SIZE){g.moveTo(x,0);g.lineTo(x,WORLD_H);}for(let y=0;y<=WORLD_H;y+=GRID_SIZE){g.moveTo(0,y);g.lineTo(WORLD_W,y);}g.strokePath();this.gridGraphics=g;}
    updateCursor(t){this.marker.clear().lineStyle(t==='cursor'?2:4,t==='hoe'?0xffeb3b:t==='water'?0x00bcd4:t==='basket'?0xff5722:t==='shovel'?0xf44336:0xffffff,1).strokeRect(0,0,GRID_SIZE,GRID_SIZE);}
}

const config = { type: Phaser.AUTO, parent: 'game-container', backgroundColor: '#1e3323', scale: { mode: Phaser.Scale.RESIZE, width: '100%', height: '100%', autoCenter: Phaser.Scale.CENTER_BOTH }, physics: { default: 'arcade', arcade: { debug: false } }, render: { pixelArt: true, antialias: false, roundPixels: true }, scene: MainScene };
const game = new Phaser.Game(config);
let sceneContext; window.gameEvents = new Phaser.Events.EventEmitter();

// [FIX] Cập nhật ngay itemData cục bộ khi save
async function savePosition(s){ 
    let cfg=ASSETS.PLANTS[s.itemData.itemId]||ASSETS.DECORS[s.itemData.itemId]; 
    let w=(cfg?.size?.w||1)*GRID_SIZE, h=(cfg?.size?.h||1)*GRID_SIZE; 
    const gx=Math.floor((s.x-w/2)/GRID_SIZE)*GRID_SIZE; 
    const gy=Math.floor((s.y-h)/GRID_SIZE)*GRID_SIZE; 
    
    // Cập nhật Local Data
    s.itemData.x = gx;
    s.itemData.y = gy;

    await apiCall('/my-garden/move', {uniqueId:s.itemData._id, x:gx, y:gy}); 
}

async function apiCall(u,b){try{return await(await fetch(u,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(b)})).json();}catch(e){return{success:false};}}
function updateHUD(d){if(d.newWater!==undefined)document.getElementById('hudWater').innerText=d.newWater;if(d.newGold!==undefined)document.getElementById('hudGold').innerText=d.newGold;}
function showToast(m,i='info'){ if(window.SwalPixel){ window.SwalPixel.fire({title:m, icon:i}); } else { console.log(m); } }

window.populateShop = function(category) {
    const grid = document.getElementById('shopGrid'); const speech = document.getElementById('npcSpeech');
    if(speech) speech.innerText = getNPCSpeech(category);
    grid.innerHTML = '';
    const assets = window.gardenAssets; let items = {};
    if (category === 'plants') items = assets.PLANTS; else if (category === 'decors') items = assets.DECORS;
    else if (category === 'backgrounds') { grid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; color: #5d4037; padding: 20px;"><div style="font-size: 3rem; margin-bottom: 10px;">🚜</div><div>Dùng <b>CÂY CUỐC</b> (Phím 2) bấm vào ô đất trống để mở rộng nhé!</div><div style="margin-top:10px; color:#e65100;">Giá tăng dần theo số lượng đất nha đại gia!</div></div>`; return; }
    Object.keys(items).forEach(key => {
        const item = items[key]; const currentLevel = window.userLevel || 1; const requiredLevel = item.unlockLevel || 1; const isLocked = currentLevel < requiredLevel;
        const div = document.createElement('div'); div.className = `item-card ${isLocked ? 'locked' : ''}`;
        if (!isLocked) { div.onclick = () => window.buyItemPhaser(key, item.type); } 
        else { div.onclick = () => { showToast(`Cần cấp ${requiredLevel} để mở khóa!`, 'error'); div.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-5px)' }, { transform: 'translateX(5px)' }, { transform: 'translateX(0)' }], { duration: 300 }); }; }
        let imgUrl = item.image; if (category === 'plants' && item.stages) imgUrl = item.stages[item.stages.length-1];
        div.innerHTML = `${isLocked ? `<div class="lock-overlay">🔒 Lv.${requiredLevel}</div>` : ''}<img src="${imgUrl}" class="item-img"><div class="item-name">${item.name}</div><div class="item-price">${item.price} 💰</div>`;
        grid.appendChild(div);
    });
};

window.switchShopTab = function(t){ document.querySelectorAll('.shop-tab').forEach(e => e.classList.remove('active')); const activeTab = document.getElementById(`tab-${t}`); if(activeTab) activeTab.classList.add('active'); window.populateShop(t); };

window.buyItemPhaser = async function(i, t) {
    document.getElementById('shopOverlay').style.display = 'none'; showToast('Chọn vị trí để đặt! 👇', 'info');
    if(window.checkTutorialAction) window.checkTutorialAction('wait_buy_plant');
    const s = game.scene.keys['MainScene'];
    s.input.once('pointerdown', async (p) => {
        if (p.button !== 0) return;
        const w = p.positionToCamera(s.cameras.main); const x = Math.floor(w.x / GRID_SIZE) * GRID_SIZE; const y = Math.floor(w.y / GRID_SIZE) * GRID_SIZE;
        const assets = window.gardenAssets;
        const itemConfig = (t==='plant') ? assets.PLANTS[i] : assets.DECORS[i];
        const r = await apiCall('/my-garden/buy', { itemId: i, type: t, x: x, y: y });
        if (r.success) {
            updateHUD(r); s.renderItem(r.item); s.add.particles(x + 32, y + 32, 'soil_dry', { speed: 80, scale: { start: 0.2, end: 0 }, lifespan: 300 }).explode();
            if (itemConfig && itemConfig.price) s.showFloatingText(x + 32, y, `-${itemConfig.price} 💰`, 'red');
            showToast('Đã đặt thành công! 🎉', 'success');
            if(window.checkTutorialAction) window.checkTutorialAction('wait_action_plant');
        } else {
            showToast(r.msg, 'error');
            if(r.msg.includes('vàng') || r.msg.includes('tiền')) s.showFloatingText(x + 32, y, "Thiếu Tiền! 💸", 'red');
        }
    });
};

window.openShopHTML = function(tab = 'plants') {
    document.getElementById('shopOverlay').style.display = 'flex';
    const win = document.querySelector('.rpg-shop-window');
    if(win) { win.style.transform = 'scale(0.8)'; win.style.opacity = '0'; setTimeout(() => { win.style.transition = 'all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)'; win.style.transform = 'scale(1)'; win.style.opacity = '1'; }, 10); }
    window.switchShopTab(tab);
    if (window.checkTutorialAction) { window.checkTutorialAction('wait_open_shop'); }
};