(function attachGardenSceneSetup(window) {
    const GRID_SIZE = 64;
    const WORLD_W = 64 * GRID_SIZE;
    const WORLD_H = 64 * GRID_SIZE;
    const ASSETS = window.gardenAssets || {};
    const GARDEN_DATA = window.gardenData || {};
    const IS_OWNER = window.isOwner || false;
    const GardenShared = window.GardenShared || {};
    const showToast = GardenShared.showToast || ((msg) => console.log(msg));
    const updateCoords = GardenShared.updateCoords || (() => {});

    window.GardenSceneSetup = {
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
                    if (window.hidePlantStats) window.hidePlantStats();
                }
            });

            window.gameEvents.on('buyItem', ({ id, type }) => {
                this.plantingMode = { active: true, itemId: id, type };
                if (window.togglePlantingUI) {
                    const itemData = ASSETS.PLANTS[id] || ASSETS.DECORS[id];
                    window.togglePlantingUI(true, itemData ? itemData.name : 'Vat pham');
                }
                showToast('Da lay hang! Bam chuot de dat', 'info');
            });

            window.gameEvents.on('cancelPlanting', () => this.cancelPlanting());

            window.gameEvents.on('toggleMoveMode', () => {
                if (this.isMovingObject) {
                    this.cancelMoveObject();
                    return;
                }

                if (!this.selectedTile) return showToast('Hay chon 1 vat the truoc!', 'warning');
                this.startMovingSprite(this.selectedTile);
            });
        },

        cancelPlanting() {
            this.plantingMode = { active: false, itemId: null, type: null };
            if (window.togglePlantingUI) window.togglePlantingUI(false);
            this.currentTool = 'cursor';
            if (window.selectTool) window.selectTool('cursor');
        },

        setupCamera() {
            this.cameras.main.setBounds(0, 0, WORLD_W, WORLD_H);
            this.updateCameraBounds();

            const savedCam = GARDEN_DATA.camera || { x: WORLD_W / 2, y: WORLD_H / 2, zoom: 1 };
            this.cameras.main.centerOn(
                Phaser.Math.Clamp(savedCam.x, 0, WORLD_W),
                Phaser.Math.Clamp(savedCam.y, 0, WORLD_H)
            );
            this.cameras.main.setZoom(Math.max(savedCam.zoom, this.minZoom));
        },

        updateCameraBounds() {
            const minX = this.scale.width / WORLD_W;
            const minY = this.scale.height / WORLD_H;
            this.minZoom = Math.max(minX, minY, 0.5);
        },

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
                if (this.isMovingObject) {
                    this.cancelMoveObject();
                    return;
                }

                if (this.selectedTile) {
                    this.startMovingSprite(this.selectedTile);
                    return;
                }

                const pointer = this.input.activePointer;
                const worldPoint = pointer.positionToCamera(this.cameras.main);
                const gx = Math.floor(worldPoint.x / GRID_SIZE) * GRID_SIZE;
                const gy = Math.floor(worldPoint.y / GRID_SIZE) * GRID_SIZE;
                const item = this.children.list.find((child) => (
                    child.isGardenItem
                    && Math.abs(child.itemData.x - gx) < 1
                    && Math.abs(child.itemData.y - gy) < 1
                ));

                if (item) this.startMovingSprite(item);
                else showToast('Hay chi vao vat can di chuyen!', 'warning');
            });

            this.input.on('wheel', (pointer, gameObjects, deltaX, deltaY) => {
                const cam = this.cameras.main;
                const newZoom = Phaser.Math.Clamp(cam.zoom - deltaY * 0.001, this.minZoom, this.maxZoom);
                cam.setZoom(newZoom);
                this.scheduleSaveCamera();
            });

            this.input.on('pointerdown', (pointer) => {
                if (this.input.pointer1.isDown && this.input.pointer2.isDown) {
                    this.isPanning = false;
                    this.initialZoomDistance = Phaser.Math.Distance.Between(
                        this.input.pointer1.x,
                        this.input.pointer1.y,
                        this.input.pointer2.x,
                        this.input.pointer2.y
                    );
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
                    const dist = Phaser.Math.Distance.Between(
                        this.input.pointer1.x,
                        this.input.pointer1.y,
                        this.input.pointer2.x,
                        this.input.pointer2.y
                    );
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
                    isMiddleClick
                    || isMoveTool
                    || (isTouch && this.currentTool === 'cursor' && !this.plantingMode.active && !this.isMovingObject)
                );

                if (canPan) {
                    if (!this.isPanning) {
                        const dist = Phaser.Math.Distance.Between(pointer.x, pointer.y, this.dragStartPoint.x, this.dragStartPoint.y);
                        if (dist > 10) {
                            this.isPanning = true;
                            this.input.setDefaultCursor('grabbing');
                            this.selectedTile = null;
                            this.selectionMarker.setVisible(false);
                            if (window.hidePlantStats) window.hidePlantStats();
                        }
                    }

                    if (this.isPanning) {
                        const cam = this.cameras.main;
                        const dx = (pointer.x - pointer.prevPosition.x) / cam.zoom;
                        const dy = (pointer.y - pointer.prevPosition.y) / cam.zoom;
                        cam.scrollX -= dx;
                        cam.scrollY -= dy;
                    }
                }

                if (this.isMovingObject && this.movingSprite) {
                    const w = this.movingSprite.displayWidth;
                    const h = this.movingSprite.displayHeight;
                    this.movingSprite.x = (gx * GRID_SIZE) + (w / 2);
                    this.movingSprite.y = (gy * GRID_SIZE) + h;
                    this.marker.clear().lineStyle(3, 0x00ff00, 1).strokeRect(gx * GRID_SIZE, gy * GRID_SIZE, w, h);
                    return;
                }

                let color = 0xffffff;
                if (this.plantingMode.active) color = 0x66bb6a;
                else if (this.currentTool === 'shovel') color = 0xef5350;
                else if (this.currentTool === 'water') color = 0x42a5f5;

                this.marker.clear().lineStyle(3, color, 1).strokeRect(gx * GRID_SIZE, gy * GRID_SIZE, GRID_SIZE, GRID_SIZE);
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
    };
})(window);
