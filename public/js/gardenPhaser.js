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
const GardenShared = window.GardenShared || {};
const SceneSetup = window.GardenSceneSetup || {};
const SceneInteractions = window.GardenSceneInteractions || {};
const SceneRendering = window.GardenSceneRendering || {};

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
const parseDuration = GardenShared.parseDuration || function parseDurationFallback(str) {
    if (!str) return 5 * 60000;
    const strVal = String(str).toLowerCase();
    const num = parseFloat(strVal);
    if (!Number.isFinite(num)) return 5 * 60000;
    if (strVal.includes('ngày') || strVal.includes('day')) return num * 24 * 3600000;
    if (strVal.includes('giờ') || strVal.includes('hour') || strVal.includes('h')) return num * 3600000;
    if (strVal.includes('giây') || strVal.includes('sec') || strVal.includes('s')) return num * 1000;
    return num * 60000;
};

const showToast = GardenShared.showToast || function showToastFallback(msg, type = 'info') {
    console.log(`[${type.toUpperCase()}] ${msg}`);
};

const apiCall = GardenShared.apiCall || (async function apiCallFallback() {
    return { success: false, msg: 'Mất kết nối server!' };
});

const updateHUD = GardenShared.updateHUD || function noop() {};
const updateCoords = GardenShared.updateCoords || function noop() {};

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
        this.load.image('water_drop', ASSETS.UI?.resourceIcons?.water || '/api/pro-images/1767290687212-2rlhp4.png');
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
            newFertilizer: GARDEN_DATA.fertilizer,
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
        return SceneSetup.setupExternalEvents.call(this);
    }

    cancelPlanting() {
        return SceneSetup.cancelPlanting.call(this);
    }

    setupCamera() {
        return SceneSetup.setupCamera.call(this);
    }

    updateCameraBounds() {
        return SceneSetup.updateCameraBounds.call(this);
    }

    setupInput() {
        return SceneSetup.setupInput.call(this);
    }

    startMovingSprite(sprite) {
        return SceneInteractions.startMovingSprite.call(this, sprite);
    }

    async placeMovingSprite() {
        return SceneInteractions.placeMovingSprite.call(this);
    }

    cancelMoveObject(resetPos = true) {
        return SceneInteractions.cancelMoveObject.call(this, resetPos);
    }

    async handlePlantingAction(gx, gy) {
        return SceneInteractions.handlePlantingAction.call(this, gx, gy);
    }

    async handleToolAction(gx, gy) {
        return SceneInteractions.handleToolAction.call(this, gx, gy);
    }

    renderItem(item) {
        return SceneRendering.renderItem.call(this, item);
    }

    updateRealtimeGrowth() {
        return SceneRendering.updateRealtimeGrowth.call(this);
    }

    drawGrid() {
        return SceneRendering.drawGrid.call(this);
    }

    selectItem(sprite) {
        return SceneRendering.selectItem.call(this, sprite);
    }

    updateThirstyIcon(sprite, isThirsty) {
        return SceneRendering.updateThirstyIcon.call(this, sprite, isThirsty);
    }
    
    updatePlantUI(sprite) {
        return SceneRendering.updatePlantUI.call(this, sprite);
    }

    updateAllFences() { return SceneRendering.updateAllFences.call(this); }
    updateFenceTexture(s) {
        return SceneRendering.updateFenceTexture.call(this, s);
    }

    showFloatingText(x, y, msg, cType) {
        return SceneRendering.showFloatingText.call(this, x, y, msg, cType);
    }

    scheduleSaveCamera() {
        return SceneRendering.scheduleSaveCamera.call(this);
    }
}

// --- 4. GLOBAL INIT ---
const config = { ...PHASER_CONFIG, scene: MainScene };
const game = new Phaser.Game(config);
window.gameEvents = new Phaser.Events.EventEmitter();

window.selectTool = function(t) { window.gameEvents.emit('toolChanged', t); };
window.cancelPlanting = function() { window.gameEvents.emit('cancelPlanting'); };
window.updateCoords = updateCoords;
