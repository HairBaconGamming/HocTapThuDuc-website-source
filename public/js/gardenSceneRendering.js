(function attachGardenSceneRendering(window) {
    const GRID_SIZE = 64;
    const WORLD_W = 64 * GRID_SIZE;
    const WORLD_H = 64 * GRID_SIZE;
    const ASSETS = window.gardenAssets || {};
    const GARDEN_DATA = window.gardenData || {};
    const IS_OWNER = window.isOwner || false;
    const GardenShared = window.GardenShared || {};
    const parseDuration = GardenShared.parseDuration || (() => 5 * 60 * 1000);
    const apiCall = GardenShared.apiCall || (async () => ({ success: false }));

    window.GardenSceneRendering = {
        renderItem(item) {
            item.clientRefTime = Date.now();
            if (item.type === 'plot') {
                const isWet = item.lastWatered && (Date.now() - new Date(item.lastWatered).getTime() < 24 * 3600000);
                const plot = this.add.image(item.x, item.y, isWet ? 'soil_wet' : 'soil_dry')
                    .setOrigin(0)
                    .setDisplaySize(GRID_SIZE, GRID_SIZE)
                    .setDepth(0);
                plot.itemData = item;
                plot.isGardenItem = true;
                plot.setInteractive();
                return plot;
            }

            const config = ASSETS.PLANTS[item.itemId] || ASSETS.DECORS[item.itemId];
            if (!config) return null;

            const key = config.isFence
                ? `decor_${item.itemId}_base`
                : (item.type === 'plant' ? `plant_${item.itemId}_${item.stage || 0}` : `decor_${item.itemId}`);
            const w = config.size?.w || 1;
            const h = config.size?.h || 1;

            const sprite = this.add.sprite(
                item.x + (w * GRID_SIZE) / 2,
                item.y + (h * GRID_SIZE),
                key
            ).setOrigin(0.5, 1).setDisplaySize(w * GRID_SIZE, h * GRID_SIZE);

            sprite.itemData = item;
            sprite.isGardenItem = true;
            sprite.setDepth(item.y);
            if (item.isDead) sprite.setTint(0x555555);

            sprite.setInteractive();
            this.input.setDraggable(sprite);

            if (item.type === 'plant') this.updatePlantUI(sprite);
            return sprite;
        },

        updateRealtimeGrowth() {
            const now = Date.now();
            const plotMap = {};
            this.children.list.forEach((child) => {
                if (child.itemData && child.itemData.type === 'plot') {
                    plotMap[`${child.itemData.x},${child.itemData.y}`] = child;
                }
            });

            this.children.list.forEach((sprite) => {
                if (!sprite.isGardenItem || !sprite.itemData) return;
                const item = sprite.itemData;

                if (item.type === 'plot' && item.lastWatered && (now - new Date(item.lastWatered).getTime() >= 24 * 3600000)) {
                    sprite.setTexture('soil_dry').setDisplaySize(GRID_SIZE, GRID_SIZE);
                    item.lastWatered = null;
                }

                if (item.type !== 'plant' || item.isDead) return;

                const config = ASSETS.PLANTS[item.itemId];
                if (!config) return;

                const plotSprite = plotMap[`${item.x},${item.y}`];
                const isWet = plotSprite && plotSprite.itemData.lastWatered;
                this.updateThirstyIcon(sprite, !isWet && item.stage > 0);

                if (!isWet) return;

                const elapsed = now - (item.clientRefTime || now);
                const currentProgress = (item.growthProgress || 0) + elapsed;
                const timePerStage = parseDuration(config.growthTime);
                const newStage = Math.min(Math.floor(currentProgress / timePerStage), config.maxStage);

                if (newStage <= item.stage) return;

                item.stage = newStage;
                sprite.setTexture(`plant_${item.itemId}_${newStage}`);
                sprite.setDisplaySize((config.size?.w || 1) * GRID_SIZE, (config.size?.h || 1) * GRID_SIZE).setOrigin(0.5, 1);

                if (newStage < config.maxStage) this.showFloatingText(sprite.x, sprite.y - sprite.displayHeight, 'Lon len!', 'green');
                else this.showFloatingText(sprite.x, sprite.y - sprite.displayHeight, 'Chin roi!', 'gold');

                if (newStage >= config.maxStage) this.updatePlantUI(sprite);
            });
        },

        drawGrid() {
            if (this.gridGraphics) this.gridGraphics.destroy();
            const graphics = this.add.graphics().lineStyle(1, 0xffffff, 0.05);
            for (let x = 0; x <= WORLD_W; x += GRID_SIZE) {
                graphics.moveTo(x, 0);
                graphics.lineTo(x, WORLD_H);
            }
            for (let y = 0; y <= WORLD_H; y += GRID_SIZE) {
                graphics.moveTo(0, y);
                graphics.lineTo(WORLD_W, y);
            }
            graphics.strokePath();
            this.gridGraphics = graphics;
        },

        selectItem(sprite) {
            this.selectedTile = sprite;
            this.selectionMarker.setVisible(true);
            const w = sprite.displayWidth;
            const h = sprite.displayHeight;
            const drawX = sprite.x - (w * sprite.originX);
            const drawY = sprite.y - (h * sprite.originY);

            this.selectionMarker.clear().lineStyle(4, 0x00ffff, 1).strokeRect(drawX, drawY, w, h);
            if (window.showPlantStats) window.showPlantStats(sprite.itemData);
            if (IS_OWNER && window.updateMobileMoveBtn) window.updateMobileMoveBtn(true);
        },

        updateThirstyIcon(sprite, isThirsty) {
            if (isThirsty && !sprite.thirstyIcon) {
                const icon = this.add.image(sprite.x, sprite.y - sprite.displayHeight - 20, 'water_drop').setOrigin(0.5, 1).setDepth(999999);
                this.tweens.add({ targets: icon, y: '-=15', duration: 800, yoyo: true, repeat: -1 });
                sprite.thirstyIcon = icon;
                return;
            }

            if (!isThirsty && sprite.thirstyIcon) {
                sprite.thirstyIcon.destroy();
                sprite.thirstyIcon = null;
            }
        },

        updatePlantUI(sprite) {
            if (sprite.ui) sprite.ui.destroy();
            const cfg = ASSETS.PLANTS[sprite.itemData.itemId];
            if (!cfg || sprite.itemData.stage < cfg.maxStage || sprite.itemData.isDead) return;

            const star = this.add.text(0, 0, '⭐', { fontSize: '32px' }).setOrigin(0.5);
            this.tweens.add({ targets: star, y: '-=15', yoyo: true, repeat: -1 });
            sprite.ui = this.add.container(sprite.x, sprite.y, [star]).setDepth(99999);
        },

        updateAllFences() {
            this.children.list.forEach((child) => {
                if (child.isGardenItem && ASSETS.DECORS[child.itemData.itemId]?.isFence) {
                    this.updateFenceTexture(child);
                }
            });
        },

        updateFenceTexture(sprite) {
            const { itemId, x, y } = sprite.itemData;
            const check = (dx, dy) => this.children.list.some((other) => (
                other.isGardenItem
                && other.itemData.itemId === itemId
                && Math.abs(other.itemData.x - (x + dx)) < 1
                && Math.abs(other.itemData.y - (y + dy)) < 1
            ));

            let key = `decor_${itemId}_base`;
            if ((check(-64, 0) || check(64, 0)) && !(check(0, -64) || check(0, 64))) key = `decor_${itemId}_h`;
            else if ((check(0, -64) || check(0, 64)) && !(check(-64, 0) || check(64, 0))) key = `decor_${itemId}_v`;

            sprite.setTexture(key).setDisplaySize(GRID_SIZE, GRID_SIZE);
        },

        showFloatingText(x, y, msg, cType) {
            const colors = { gold: '#ffeb3b', green: '#66bb6a', blue: '#42a5f5' };
            const text = this.add.text(x, y - 20, msg, {
                fontFamily: 'VT323',
                fontSize: '32px',
                color: colors[cType] || '#fff',
                stroke: '#000',
                strokeThickness: 4
            }).setOrigin(0.5).setDepth(999999);

            this.tweens.add({
                targets: text,
                y: y - 100,
                alpha: 0,
                duration: 1500,
                onComplete: () => text.destroy()
            });
        },

        scheduleSaveCamera() {
            if (this.saveCamTimer) clearTimeout(this.saveCamTimer);
            this.saveCamTimer = setTimeout(() => {
                const cam = this.cameras.main;
                apiCall('/my-garden/save-camera', {
                    x: cam.scrollX + cam.width / 2,
                    y: cam.scrollY + cam.height / 2,
                    zoom: cam.zoom
                });
            }, 2000);
        }
    };
})(window);
