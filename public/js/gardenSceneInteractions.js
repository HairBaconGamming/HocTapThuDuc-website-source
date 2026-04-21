(function attachGardenSceneInteractions(window) {
    const GRID_SIZE = 64;
    const ASSETS = window.gardenAssets || {};
    const IS_OWNER = window.isOwner || false;
    const GardenShared = window.GardenShared || {};
    const showToast = GardenShared.showToast || ((msg) => console.log(msg));
    const apiCall = GardenShared.apiCall || (async () => ({ success: false, msg: 'Mat ket noi server!' }));
    const updateHUD = GardenShared.updateHUD || (() => {});
    const ActionQueue = GardenShared.ActionQueue;

    function getSceneItems(scene) {
        return scene.children.list.filter((child) => child.isGardenItem && child.itemData);
    }

    function enqueue(action, payload, rollback) {
        if (ActionQueue) return ActionQueue.enqueue(action, payload, rollback);
        return apiCall('/my-garden/interact', { ...payload, action });
    }

    window.GardenSceneInteractions = {
        startMovingSprite(sprite) {
            if (!IS_OWNER) return showToast('Chi chu nha moi duoc di chuyen!', 'warning');
            const item = sprite.itemData;
            if (item.type === 'plot') return showToast('Khong the di chuyen dat!', 'warning');
            const cfg = ASSETS.PLANTS[item.itemId] || ASSETS.DECORS[item.itemId];
            const canMove = !item.isDead && (
                item.type === 'decoration' || item.type === 'decor'
                || item.stage === 0 || (cfg && item.stage >= cfg.maxStage)
            );
            if (!canMove) return showToast(item.isDead ? 'Cay chet khong doi duoc!' : 'Cay dang lon!', 'warning');

            this.isMovingObject = true;
            this.movingSprite = sprite;
            this.originalPos = { x: sprite.x, y: sprite.y };
            if (sprite.ui) sprite.ui.setVisible(false);
            if (sprite.thirstyIcon) sprite.thirstyIcon.setVisible(true);
            this.selectedTile = null;
            this.selectionMarker.setVisible(false);
            if (window.hidePlantStats) window.hidePlantStats();
            this.input.setDefaultCursor('grabbing');
            showToast('Che do di chuyen: Click de dat lai', 'info');
            if (window.updateMobileMoveBtn) window.updateMobileMoveBtn(true);
        },

        async placeMovingSprite() {
            if (!this.movingSprite) return;
            const sprite = this.movingSprite;
            const gx = Math.floor(sprite.x / GRID_SIZE) * GRID_SIZE;
            const gy = Math.floor((sprite.y - sprite.displayHeight) / GRID_SIZE) * GRID_SIZE;

            const conflict = this.children.list.find((o) => {
                if (o === sprite || !o.isGardenItem || !o.itemData) return false;
                if (!(Math.abs(o.itemData.x - gx) < 1 && Math.abs(o.itemData.y - gy) < 1)) return false;
                if (sprite.itemData.type === 'plant' && o.itemData.type === 'plot') return false;
                return true;
            });
            if (conflict) return showToast('Vi tri bi trung!', 'error');

            const hasPlot = this.children.list.some((o) => (
                o.itemData?.type === 'plot'
                && Math.abs(o.itemData.x - gx) < 1
                && Math.abs(o.itemData.y - gy) < 1
            ));
            if (sprite.itemData.type === 'plant' && !hasPlot) return showToast('Cay phai dat tren dat!', 'warning');
            if ((sprite.itemData.type === 'decoration' || sprite.itemData.type === 'decor') && hasPlot) {
                return showToast('Decor phai dat tren co!', 'warning');
            }

            // Optimistic move
            const oldX = sprite.itemData.x;
            const oldY = sprite.itemData.y;
            sprite.itemData.x = gx;
            sprite.itemData.y = gy;
            sprite.setDepth(gy);
            if (GardenShared.moveGardenItem) GardenShared.moveGardenItem(sprite.itemData._id, gx, gy);
            if (sprite.ui) sprite.ui.setVisible(true);
            if (ASSETS.DECORS[sprite.itemData.itemId]?.isFence) this.updateAllFences();
            showToast('Da di chuyen!', 'success');
            this.cancelMoveObject(false);
            this.selectItem(sprite);

            const ref = sprite;
            enqueue('move', { uniqueId: sprite.itemData._id, x: gx, y: gy }, () => {
                ref.itemData.x = oldX; ref.itemData.y = oldY;
                ref.x = oldX + (ref.displayWidth / 2);
                ref.y = oldY + ref.displayHeight;
                ref.setDepth(oldY);
                if (GardenShared.moveGardenItem) GardenShared.moveGardenItem(ref.itemData._id, oldX, oldY);
                showToast('Di chuyen that bai, hoan tac!', 'error');
            });
        },

        cancelMoveObject(resetPos = true) {
            if (resetPos && this.movingSprite && this.originalPos) {
                this.movingSprite.x = this.originalPos.x;
                this.movingSprite.y = this.originalPos.y;
                if (this.movingSprite.ui) this.movingSprite.ui.setVisible(true);
            }
            this.isMovingObject = false;
            this.movingSprite = null;
            this.originalPos = null;
            this.input.setDefaultCursor('default');
            if (window.updateMobileMoveBtn) window.updateMobileMoveBtn(false);
        },

        async handlePlantingAction(gx, gy) {
            if (!this.plantingMode.active) return;
            const { itemId, type } = this.plantingMode;
            const allItems = getSceneItems(this);
            const existingPlot = allItems.find((i) => i.itemData.type === 'plot' && Math.abs(i.itemData.x - gx) < 1 && Math.abs(i.itemData.y - gy) < 1);
            const existingItem = allItems.find((i) => i.itemData.type !== 'plot' && Math.abs(i.itemData.x - gx) < 1 && Math.abs(i.itemData.y - gy) < 1);

            if (type === 'plant') {
                if (!existingPlot) return showToast('Can co dat de trong!', 'warning');
                if (existingItem) return showToast('Da co cay roi!', 'warning');
            } else if (type === 'plot') {
                if (existingPlot) return showToast('Cho nay co dat roi!', 'warning');
            } else if (type === 'decor' || type === 'decoration') {
                if (existingPlot) return showToast('Decor phai dat tren co!', 'warning');
                if (existingItem) return showToast('Vuong vat can!', 'warning');
            }

            // Buy needs server _id, so keep direct
            const res = await apiCall('/my-garden/buy', { itemId, type, x: gx, y: gy });
            if (!res.success) return showToast(res.msg, 'error');
            updateHUD(res);
            if (GardenShared.addGardenItem && res.item) GardenShared.addGardenItem(res.item);
            this.renderItem(res.item);
            this.add.particles(gx + 32, gy + 32, 'star_particle', {
                speed: 100, scale: { start: 0.5, end: 0 }, lifespan: 500, quantity: 10
            }).explode();
            window.gameEvents.emit('actionSuccess', { action: 'plant' });
            if (ASSETS.DECORS[itemId]?.isFence) this.updateAllFences();
        },

        async handleToolAction(gx, gy) {
            const allItems = getSceneItems(this);
            const plant = allItems.find((i) => i.itemData.type !== 'plot' && Math.abs(i.itemData.x - gx) < 1 && Math.abs(i.itemData.y - gy) < 1);
            const plot = allItems.find((i) => i.itemData.type === 'plot' && Math.abs(i.itemData.x - gx) < 1 && Math.abs(i.itemData.y - gy) < 1);

            if (this.currentTool === 'cursor') {
                if (plant) this.selectItem(plant);
                else if (plot) this.selectItem(plot);
                else { this.selectedTile = null; this.selectionMarker.setVisible(false); if (window.hidePlantStats) window.hidePlantStats(); }
                return;
            }
            if (!IS_OWNER) return showToast('Chi chu vuon moi duoc lam!', 'warning');

            // HOE: needs server _id
            if (this.currentTool === 'hoe') {
                if (plot || plant) return showToast('Co dat roi!', 'info');
                const res = await apiCall('/my-garden/buy', { type: 'plot', itemId: 'soil_tile', x: gx, y: gy });
                if (!res.success) return showToast(res.msg, 'error');
                this.renderItem(res.item);
                updateHUD(res);
                if (GardenShared.addGardenItem && res.item) GardenShared.addGardenItem(res.item);
                this.add.particles(gx + 32, gy + 32, 'soil_dry', { speed: 50, scale: { start: 0.2, end: 0 }, lifespan: 300, quantity: 5 }).explode();
                window.gameEvents.emit('actionSuccess', { action: 'hoe' });
                return;
            }

            // WATER: optimistic + queue
            if (this.currentTool === 'water') {
                if (!plant && !plot) return;
                const targetId = plant ? plant.itemData._id : plot.itemData._id;
                this.waterEmitter.emitParticleAt(gx + 32, gy + 32, 10);
                const now = new Date();
                if (plot) { plot.setTexture('soil_wet').setDisplaySize(GRID_SIZE, GRID_SIZE); plot.itemData.lastWatered = now; }
                if (plant) {
                    plant.itemData.witherProgress = 0;
                    this.updateThirstyIcon(plant, false);
                    const sp = allItems.find((i) => i.itemData.type === 'plot' && Math.abs(i.itemData.x - gx) < 1 && Math.abs(i.itemData.y - gy) < 1);
                    if (sp) { sp.setTexture('soil_wet').setDisplaySize(GRID_SIZE, GRID_SIZE); sp.itemData.lastWatered = now; }
                }
                showToast('Da tuoi!', 'success');
                window.gameEvents.emit('actionSuccess', { action: 'water', target: targetId });
                const pRef = plot;
                enqueue('water', { uniqueId: targetId }, (r) => {
                    if (pRef) pRef.setTexture('soil_dry').setDisplaySize(GRID_SIZE, GRID_SIZE);
                    showToast(r.msg || 'Tuoi that bai!', 'error');
                });
                return;
            }

            // BASKET: optimistic + queue
            if (this.currentTool === 'basket') {
                if (!plant || plant.itemData.type !== 'plant') return;
                if (plant.itemData.isDead) return showToast('Cay chet roi!', 'error');
                const cfg = ASSETS.PLANTS[plant.itemData.itemId];
                if (!cfg || plant.itemData.stage < cfg.maxStage) return showToast('Chua chin!', 'warning');

                if (plant.ui) { plant.ui.destroy(); plant.ui = null; }
                const pId = plant.itemData._id;

                if (cfg.isMultiHarvest) {
                    const ns = Number.isInteger(cfg.afterharvestStage) ? cfg.afterharvestStage : 0;
                    const tps = GardenShared.parseDuration ? GardenShared.parseDuration(cfg.growthTime) : 300000;
                    plant.itemData.stage = ns;
                    plant.itemData.growthProgress = ns * tps;
                    plant.itemData.witherProgress = 0;
                    plant.itemData.isDead = false;
                    plant.itemData.lastUpdated = new Date();
                    plant.itemData.clientRefTime = Date.now();
                    plant.setTexture(`plant_${plant.itemData.itemId}_${ns}`);
                    plant.setDisplaySize((cfg.size?.w || 1) * GRID_SIZE, (cfg.size?.h || 1) * GRID_SIZE).setOrigin(0.5, 1);
                    this.updatePlantUI(plant);
                    this.selectItem(plant);
                } else {
                    const pr = plant;
                    this.tweens.add({ targets: plant, y: plant.y - 60, alpha: 0, duration: 500, onComplete: () => { if (pr.thirstyIcon) pr.thirstyIcon.destroy(); pr.destroy(); } });
                    if (GardenShared.removeGardenItem) GardenShared.removeGardenItem(pId);
                    this.selectedTile = null;
                    if (window.hidePlantStats) window.hidePlantStats();
                }
                window.gameEvents.emit('actionSuccess', { action: 'harvest' });
                showToast('Thu hoach!', 'success');
                enqueue('harvest', { uniqueId: pId }, (r) => { showToast(r.msg || 'Thu hoach loi!', 'error'); });
                return;
            }

            // SHOVEL: optimistic + queue
            if (this.currentTool === 'shovel') {
                const target = plant || plot;
                if (!target) return;
                const td = { ...target.itemData };
                if (target.ui) { target.ui.destroy(); target.ui = null; }
                if (target.thirstyIcon) target.thirstyIcon.destroy();
                if (GardenShared.removeGardenItem) GardenShared.removeGardenItem(td._id);
                target.destroy();
                if (ASSETS.DECORS[td.itemId]?.isFence) this.updateAllFences();
                this.selectedTile = null;
                if (window.hidePlantStats) window.hidePlantStats();
                showToast('Da don dep!', 'success');
                const sc = this;
                enqueue('remove', { uniqueId: td._id }, () => {
                    sc.renderItem(td);
                    if (GardenShared.addGardenItem) GardenShared.addGardenItem(td);
                    showToast('Xoa that bai, hoan tac!', 'error');
                });
            }
        }
    };
})(window);
