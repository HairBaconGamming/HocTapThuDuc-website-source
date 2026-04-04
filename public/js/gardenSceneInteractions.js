(function attachGardenSceneInteractions(window) {
    const GRID_SIZE = 64;
    const ASSETS = window.gardenAssets || {};
    const IS_OWNER = window.isOwner || false;
    const GardenShared = window.GardenShared || {};
    const showToast = GardenShared.showToast || ((msg) => console.log(msg));
    const apiCall = GardenShared.apiCall || (async () => ({ success: false, msg: 'Mat ket noi server!' }));
    const updateHUD = GardenShared.updateHUD || (() => {});

    function getSceneItems(scene) {
        return scene.children.list.filter((child) => child.isGardenItem && child.itemData);
    }

    window.GardenSceneInteractions = {
        startMovingSprite(sprite) {
            if (!IS_OWNER) return showToast('Chi chu nha moi duoc di chuyen!', 'warning');

            const item = sprite.itemData;
            if (item.type === 'plot') return showToast('Khong the di chuyen dat!', 'warning');

            const cfg = ASSETS.PLANTS[item.itemId] || ASSETS.DECORS[item.itemId];
            const canMove = !item.isDead && (
                item.type === 'decoration'
                || item.type === 'decor'
                || item.stage === 0
                || (cfg && item.stage >= cfg.maxStage)
            );

            if (!canMove) {
                return showToast(item.isDead ? 'Cay chet khong doi duoc!' : 'Cay dang lon, khong nen dong vao!', 'warning');
            }

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

            const conflict = this.children.list.find((other) => {
                if (other === sprite || !other.isGardenItem || !other.itemData) return false;
                const hit = Math.abs(other.itemData.x - gx) < 1 && Math.abs(other.itemData.y - gy) < 1;
                if (!hit) return false;
                if (sprite.itemData.type === 'plant' && other.itemData.type === 'plot') return false;
                return true;
            });

            if (conflict) return showToast('Vi tri bi trung!', 'error');

            const hasPlot = this.children.list.some((other) => (
                other.itemData?.type === 'plot'
                && Math.abs(other.itemData.x - gx) < 1
                && Math.abs(other.itemData.y - gy) < 1
            ));

            if (sprite.itemData.type === 'plant' && !hasPlot) return showToast('Cay phai dat tren dat!', 'warning');
            if ((sprite.itemData.type === 'decoration' || sprite.itemData.type === 'decor') && hasPlot) {
                return showToast('Decor phai dat tren co!', 'warning');
            }

            const res = await apiCall('/my-garden/move', { uniqueId: sprite.itemData._id, x: gx, y: gy });
            if (!res.success) {
                showToast(res.msg, 'error');
                this.cancelMoveObject(true);
                return;
            }

            sprite.itemData.x = gx;
            sprite.itemData.y = gy;
            sprite.setDepth(gy);
            if (GardenShared.moveGardenItem) GardenShared.moveGardenItem(sprite.itemData._id, gx, gy);
            if (sprite.ui) sprite.ui.setVisible(true);
            if (ASSETS.DECORS[sprite.itemData.itemId]?.isFence) this.updateAllFences();

            showToast('Da di chuyen!', 'success');
            this.cancelMoveObject(false);
            this.selectItem(sprite);
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
            const existingPlot = allItems.find((item) => item.itemData.type === 'plot' && Math.abs(item.itemData.x - gx) < 1 && Math.abs(item.itemData.y - gy) < 1);
            const existingItem = allItems.find((item) => item.itemData.type !== 'plot' && Math.abs(item.itemData.x - gx) < 1 && Math.abs(item.itemData.y - gy) < 1);

            if (type === 'plant') {
                if (!existingPlot) return showToast('Can co dat de trong!', 'warning');
                if (existingItem) return showToast('Da co cay roi!', 'warning');
            } else if (type === 'plot') {
                if (existingPlot) return showToast('Cho nay co dat roi!', 'warning');
            } else if (type === 'decor' || type === 'decoration') {
                if (existingPlot) return showToast('Decor phai dat tren co!', 'warning');
                if (existingItem) return showToast('Vuong vat can!', 'warning');
            }

            const res = await apiCall('/my-garden/buy', { itemId, type, x: gx, y: gy });
            if (!res.success) return showToast(res.msg, 'error');

            updateHUD(res);
            if (GardenShared.addGardenItem && res.item) GardenShared.addGardenItem(res.item);
            this.renderItem(res.item);
            this.add.particles(gx + 32, gy + 32, 'star_particle', {
                speed: 100,
                scale: { start: 0.5, end: 0 },
                lifespan: 500,
                quantity: 10
            }).explode();

            window.gameEvents.emit('actionSuccess', { action: 'plant' });
            if (ASSETS.DECORS[itemId]?.isFence) this.updateAllFences();
        },

        async handleToolAction(gx, gy) {
            const allItems = getSceneItems(this);
            const plant = allItems.find((item) => item.itemData.type !== 'plot' && Math.abs(item.itemData.x - gx) < 1 && Math.abs(item.itemData.y - gy) < 1);
            const plot = allItems.find((item) => item.itemData.type === 'plot' && Math.abs(item.itemData.x - gx) < 1 && Math.abs(item.itemData.y - gy) < 1);

            if (this.currentTool === 'cursor') {
                if (plant) this.selectItem(plant);
                else if (plot) this.selectItem(plot);
                else {
                    this.selectedTile = null;
                    this.selectionMarker.setVisible(false);
                    if (window.hidePlantStats) window.hidePlantStats();
                }
                return;
            }

            if (!IS_OWNER) return showToast('Chi chu vuon moi duoc lam!', 'warning');

            if (this.currentTool === 'hoe') {
                if (plot || plant) return showToast('Co dat roi!', 'info');

                const res = await apiCall('/my-garden/buy', { type: 'plot', itemId: 'soil_tile', x: gx, y: gy });
                if (!res.success) return showToast(res.msg, 'error');

                this.renderItem(res.item);
                updateHUD(res);
                if (GardenShared.addGardenItem && res.item) GardenShared.addGardenItem(res.item);
                this.add.particles(gx + 32, gy + 32, 'soil_dry', {
                    speed: 50,
                    scale: { start: 0.2, end: 0 },
                    lifespan: 300,
                    quantity: 5
                }).explode();

                window.gameEvents.emit('actionSuccess', { action: 'hoe' });
                return;
            }

            if (this.currentTool === 'water') {
                if (!plant && !plot) return;

                const targetId = plant ? plant.itemData._id : plot.itemData._id;
                const res = await apiCall('/my-garden/interact', { uniqueId: targetId, action: 'water' });
                if (!res.success) return showToast(res.msg, 'warning');

                this.waterEmitter.emitParticleAt(gx + 32, gy + 32, 10);
                const now = new Date();
                if (plot) {
                    plot.setTexture('soil_wet').setDisplaySize(GRID_SIZE, GRID_SIZE);
                    plot.itemData.lastWatered = now;
                }
                if (plant) {
                    plant.itemData.witherProgress = 0;
                    this.updateThirstyIcon(plant, false);
                    const subPlot = allItems.find((item) => item.itemData.type === 'plot' && Math.abs(item.itemData.x - gx) < 1 && Math.abs(item.itemData.y - gy) < 1);
                    if (subPlot) {
                        subPlot.setTexture('soil_wet').setDisplaySize(GRID_SIZE, GRID_SIZE);
                        subPlot.itemData.lastWatered = now;
                    }
                }

                updateHUD(res);
                window.gameEvents.emit('actionSuccess', { action: 'water', target: targetId });
                showToast('Da tuoi!', 'success');
                return;
            }

            if (this.currentTool === 'basket') {
                if (!plant || plant.itemData.type !== 'plant') return;
                if (plant.itemData.isDead) return showToast('Cay chet roi!', 'error');

                const res = await apiCall('/my-garden/interact', { uniqueId: plant.itemData._id, action: 'harvest' });
                if (!res.success) return showToast(res.msg, 'warning');

                const plantConfig = ASSETS.PLANTS[plant.itemData.itemId];
                updateHUD(res);
                if (res.xpReward) this.showFloatingText(gx + 32, gy, `+${res.xpReward} XP`, 'green');
                if (res.goldReward) this.showFloatingText(gx + 32, gy - 20, `+${res.goldReward} Gold`, 'gold');
                if (res.harvestYield) this.showFloatingText(gx + 32, gy - 40, `+${res.harvestYield} ${plantConfig?.name || plant.itemData.itemId}`, 'blue');

                if (plant.ui) {
                    plant.ui.destroy();
                    plant.ui = null;
                }

                if (plantConfig?.isMultiHarvest) {
                    const nextStage = Number.isInteger(plantConfig.afterharvestStage) ? plantConfig.afterharvestStage : 0;
                    const timePerStage = GardenShared.parseDuration
                        ? GardenShared.parseDuration(plantConfig.growthTime)
                        : 5 * 60 * 1000;
                    plant.itemData.stage = nextStage;
                    plant.itemData.growthProgress = nextStage * timePerStage;
                    plant.itemData.witherProgress = 0;
                    plant.itemData.isDead = false;
                    plant.itemData.lastUpdated = new Date();
                    plant.itemData.clientRefTime = Date.now();
                    plant.setTexture(`plant_${plant.itemData.itemId}_${nextStage}`);
                    plant.setDisplaySize((plantConfig.size?.w || 1) * GRID_SIZE, (plantConfig.size?.h || 1) * GRID_SIZE).setOrigin(0.5, 1);
                    this.updatePlantUI(plant);
                    this.selectItem(plant);
                } else {
                    this.tweens.add({
                        targets: plant,
                        y: plant.y - 60,
                        alpha: 0,
                        duration: 500,
                        onComplete: () => {
                            if (plant.thirstyIcon) plant.thirstyIcon.destroy();
                            plant.destroy();
                        }
                    });
                    if (GardenShared.removeGardenItem) GardenShared.removeGardenItem(plant.itemData._id);
                    this.selectedTile = null;
                    if (window.hidePlantStats) window.hidePlantStats();
                }

                window.gameEvents.emit('actionSuccess', { action: 'harvest' });
                showToast('Thu hoach!', 'success');
                return;
            }

            if (this.currentTool === 'shovel') {
                const target = plant || plot;
                if (!target) return;

                const res = await apiCall('/my-garden/remove', { uniqueId: target.itemData._id });
                if (!res.success) return;

                if (target.ui) {
                    target.ui.destroy();
                    target.ui = null;
                }
                if (target.thirstyIcon) target.thirstyIcon.destroy();

                if (GardenShared.removeGardenItem) GardenShared.removeGardenItem(target.itemData._id);
                target.destroy();
                if (ASSETS.DECORS[target.itemData.itemId]?.isFence) this.updateAllFences();
                this.selectedTile = null;
                if (window.hidePlantStats) window.hidePlantStats();
                showToast('Da don dep!', 'success');
            }
        }
    };
})(window);
