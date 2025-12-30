/**
 * GARDEN PHASER ENGINE - ULTIMATE EDITION
 * Features: Fullpage, Grid Snapping, Tiling Textures, Particles, Juice
 */

const ASSETS = window.gardenAssets;
const GARDEN_DATA = window.gardenData;

// CẤU HÌNH HỆ THỐNG
const GRID_SIZE = 40;       // Kích thước ô lưới để snap
const BASE_SCALE = 0.6;     // Tỷ lệ thu nhỏ vật thể (0.6 để vườn trông rộng hơn)

// Cấu hình Game Phaser
const config = {
    type: Phaser.AUTO,
    parent: 'game-container',
    
    // Tự động resize theo thẻ cha (div#game-container)
    scale: {
        mode: Phaser.Scale.RESIZE, 
        width: '100%',
        height: '100%',
        autoCenter: Phaser.Scale.CENTER_BOTH
    },
    
    render: {
        pixelArt: false,
        antialias: true,
        roundPixels: true // Giúp render sắc nét hơn khi dùng Grid
    },
    scene: {
        preload: preload,
        create: create,
        update: update
    }
};

const game = new Phaser.Game(config);
let sceneContext;
let bgTile; // Biến lưu background để xử lý resize
let gardenRect = { width: window.innerWidth, height: window.innerHeight };

// Event Bus để giao tiếp với HTML
window.gameEvents = new Phaser.Events.EventEmitter();

// ============================================================
// 1. PRELOAD (TẢI TÀI NGUYÊN)
// ============================================================
function preload() {
    // A. LOADING BAR
    const width = this.cameras.main.width;
    const height = this.cameras.main.height;
    
    const progressBar = this.add.graphics();
    const progressBox = this.add.graphics();
    progressBox.fillStyle(0x222222, 0.8);
    progressBox.fillRoundedRect(width/2 - 160, height/2 - 25, 320, 50, 10);

    const loadingText = this.make.text({
        x: width / 2, y: height / 2 + 50,
        text: 'Đang tải khu vườn...',
        style: { font: '18px Quicksand', fill: '#ffffff' }
    });
    loadingText.setOrigin(0.5, 0.5);

    this.load.on('progress', function (value) {
        progressBar.clear();
        progressBar.fillStyle(0x10b981, 1);
        progressBar.fillRoundedRect(width/2 - 150, height/2 - 15, 300 * value, 30, 5);
    });

    this.load.on('complete', function () {
        progressBar.destroy();
        progressBox.destroy();
        loadingText.destroy();
    });

    // B. LOAD TEXTURE NỀN CỰC ĐẸP (Seamless Grass)
    // Bạn có thể thay link này bằng ảnh texture đất/cỏ khác tùy thích
    for (let key in ASSETS.BACKGROUNDS) {
        const bg = ASSETS.BACKGROUNDS[key];
        // Đặt key là 'bg_texture_id' để dễ gọi
        this.load.image(`bg_texture_${key}`, bg.textureUrl);
    }
    
    // C. LOAD ASSETS TỪ CONFIG SERVER
    for (let key in ASSETS.PLANTS) {
        ASSETS.PLANTS[key].stages.forEach((url, index) => {
            this.load.image(`plant_${key}_${index}`, url);
        });
    }
    for (let key in ASSETS.DECORS) {
        this.load.image(`decor_${key}`, ASSETS.DECORS[key].image);
    }

    // D. LOAD UI & HIỆU ỨNG
    this.load.image('star_particle', 'https://cdn-icons-png.flaticon.com/512/616/616490.png');
    this.load.image('water_drop', 'https://cdn-icons-png.flaticon.com/512/427/427112.png');
    this.load.image('lock_icon', 'https://cdn-icons-png.flaticon.com/512/3064/3064197.png');
}

// ============================================================
// 2. CREATE (KHỞI TẠO GAME)
// ============================================================
function create() {
    sceneContext = this;

    // A. TẠO BACKGROUND (TILE SPRITE)
    // TileSprite giúp lặp lại texture vô tận
    // Màu nền dự phòng
    this.cameras.main.setBackgroundColor('#386641'); 

    const bgKey = window.currentBgId || 'default';

    bgTile = this.add.tileSprite(0, 0, this.scale.width, this.scale.height, `bg_texture_${bgKey}`);
    bgTile.setOrigin(0, 0);
    bgTile.setScrollFactor(0);
    
    // Tint màu nhẹ để không bị quá chói, hợp style RPG tối
    bgTile.setTint(0xcccccc);

    // B. VẼ LƯỚI (GRID) MỜ (Optional - Giúp căn chỉnh)
    drawGrid(this);

    // C. HỆ THỐNG HẠT (PARTICLES)
    // 1. Hạt nước
    this.waterEmitter = this.add.particles(0, 0, 'water_drop', {
        speed: { min: 100, max: 200 }, scale: { start: 0.05, end: 0 }, 
        lifespan: 600, gravityY: 500, quantity: 5, emitting: false
    });

    // 2. Hạt sáng (Sao)
    this.starEmitter = this.add.particles(0, 0, 'star_particle', {
        speed: { min: 50, max: 150 }, scale: { start: 0.05, end: 0 }, 
        lifespan: 1000, gravityY: 100, rotate: { start: 0, end: 360 }, emitting: false
    });

    // D. SPAWN VẬT PHẨM TỪ DB
    window.gardenData.items.forEach(item => {
        spawnItem(this, item, false);
    });

    // E. SỰ KIỆN (EVENTS)
    window.gameEvents.on('openShop', (type) => openShopHTML(type));
    
    // Xử lý khi resize trình duyệt
    this.scale.on('resize', (gameSize) => {
        gardenRect = { width: gameSize.width, height: gameSize.height };
        bgTile.setSize(gameSize.width, gameSize.height);
        drawGrid(this); // Vẽ lại lưới
    });
}

// Hàm vẽ lưới
function drawGrid(scene) {
    if (scene.gridGraphics) scene.gridGraphics.destroy();
    
    const graphics = scene.add.graphics();
    graphics.lineStyle(1, 0x000000, 0.05); // Màu đen, alpha 0.05 (rất mờ)
    
    for(let x = 0; x < scene.scale.width; x += GRID_SIZE) {
        graphics.moveTo(x, 0);
        graphics.lineTo(x, scene.scale.height);
    }
    for(let y = 0; y < scene.scale.height; y += GRID_SIZE) {
        graphics.moveTo(0, y);
        graphics.lineTo(scene.scale.width, y);
    }
    graphics.strokePath();
    scene.gridGraphics = graphics;
}

// ============================================================
// 3. UPDATE (VÒNG LẶP GAME)
// ============================================================
function update() {
    // DEPTH SORTING (2.5D EFFECT)
    // Sắp xếp lớp hiển thị dựa trên trục Y. Vật ở dưới (Y cao) sẽ đè lên vật ở trên.
    this.children.list.forEach(child => {
        if (child.isGardenItem) {
            child.setDepth(child.y);
            
            // UI đi kèm (Thanh máu, Icon) luôn nổi trên cùng
            if (child.uiContainer) {
                child.uiContainer.setPosition(child.x, child.y - child.displayHeight - 10);
                child.uiContainer.setDepth(child.y + 10000); 
            }
        }
    });
}

// ============================================================
// LOGIC CHÍNH: SPAWN & TƯƠNG TÁC
// ============================================================

function spawnItem(scene, itemData, isNew = true) {
    let textureKey = '';
    
    if (itemData.type === 'plant') {
        const stage = itemData.stage !== undefined ? itemData.stage : 0; 
        textureKey = `plant_${itemData.itemId}_${stage}`;
    } else {
        textureKey = `decor_${itemData.itemId}`;
    }

    // Chuyển đổi % sang Pixel (Responsive)
    const posX = (itemData.x / 100) * scene.scale.width;
    const posY = (itemData.y / 100) * scene.scale.height;

    // TẠO SPRITE
    const sprite = scene.add.sprite(posX, posY, textureKey).setInteractive({ cursor: 'pointer' });
    sprite.setOrigin(0.5, 1); // Gốc tọa độ ở chân vật thể
    sprite.isGardenItem = true;
    sprite.itemData = itemData; // Lưu dữ liệu vào sprite
    
    // Base Scale (Lưu lại để dùng cho hiệu ứng hover)
    sprite.baseScale = BASE_SCALE;

    // Hiệu ứng xuất hiện (Spawn Animation)
    if (isNew) {
        sprite.setScale(0);
        scene.tweens.add({
            targets: sprite,
            scaleX: BASE_SCALE, scaleY: BASE_SCALE,
            duration: 800,
            ease: 'Elastic.easeOut'
        });
        scene.starEmitter.emitParticleAt(posX, posY - 50, 10);
    } else {
        sprite.setScale(BASE_SCALE);
    }

    setupInteractions(scene, sprite);
    updateItemUI(scene, sprite);

    return sprite;
}

function setupInteractions(scene, sprite) {
    scene.input.setDraggable(sprite);

    // 1. HOVER EFFECT
    sprite.on('pointerover', () => {
        sprite.setTint(0xffffee); // Sáng lên
        scene.tweens.add({ 
            targets: sprite, 
            scaleX: sprite.baseScale + 0.05, 
            scaleY: sprite.baseScale + 0.05, 
            duration: 100 
        });
        document.body.style.cursor = 'pointer';
    });

    sprite.on('pointerout', () => {
        sprite.clearTint();
        scene.tweens.add({ 
            targets: sprite, 
            scaleX: sprite.baseScale, 
            scaleY: sprite.baseScale, 
            duration: 100 
        });
        document.body.style.cursor = 'default';
    });

    // 2. DRAG START
    sprite.on('dragstart', () => {
        sprite.setAlpha(0.7);
        // Nhấc lên nhẹ
        scene.tweens.add({ 
            targets: sprite, 
            scaleX: sprite.baseScale + 0.1, 
            scaleY: sprite.baseScale + 0.1, 
            duration: 200 
        });
    });

    // 3. DRAGGING & GRID SNAPPING (HÍT VÀO LƯỚI)
    sprite.on('drag', (pointer, dragX, dragY) => {
        // Tính toán vị trí snap
        const snappedX = Math.round(dragX / GRID_SIZE) * GRID_SIZE;
        const snappedY = Math.round(dragY / GRID_SIZE) * GRID_SIZE;

        // Giới hạn trong màn hình
        sprite.x = Phaser.Math.Clamp(snappedX, 0, scene.scale.width);
        sprite.y = Phaser.Math.Clamp(snappedY, 0, scene.scale.height);
    });

    // 4. DRAG END
    sprite.on('dragend', () => {
        sprite.setAlpha(1);
        scene.tweens.add({ 
            targets: sprite, 
            scaleX: sprite.baseScale, 
            scaleY: sprite.baseScale, 
            duration: 200 
        });
        
        savePosition(scene, sprite); // Lưu vị trí mới
    });

    // 5. DOUBLE CLICK (TƯƠNG TÁC)
    let lastClick = 0;
    sprite.on('pointerdown', () => {
        const now = Date.now();
        if (now - lastClick < 300) {
            interactWithItem(scene, sprite);
        } else {
            // Hiệu ứng nhún khi click đơn
            scene.tweens.add({
                targets: sprite,
                scaleY: sprite.baseScale * 0.9, scaleX: sprite.baseScale * 1.1,
                duration: 50,
                yoyo: true
            });
        }
        lastClick = now;
    });
}

// Cập nhật UI đi kèm (Thanh máu, Icon thu hoạch)
function updateItemUI(scene, sprite) {
    if (sprite.uiContainer) sprite.uiContainer.destroy();
    
    if (sprite.itemData.type !== 'plant') return;

    const container = scene.add.container(sprite.x, sprite.y);
    const config = ASSETS.PLANTS[sprite.itemData.itemId];

    // Check trạng thái chín
    if (sprite.itemData.stage >= config.maxStage) {
        // ICON THU HOẠCH
        const star = scene.add.image(0, 0, 'star_particle').setScale(0.8);
        scene.tweens.add({
            targets: star,
            y: '-=15',
            duration: 600,
            yoyo: true,
            repeat: -1
        });
        container.add(star);
    } else {
        // THANH TIẾN ĐỘ NƯỚC
        const progress = sprite.itemData.waterCount / config.waterNeededPerStage;
        const width = 50; // Chiều rộng thanh máu
        
        const bg = scene.add.rectangle(0, 0, width, 6, 0x000000, 0.5);
        const fillWidth = width * Math.max(0.05, progress);
        const fill = scene.add.rectangle(-width/2, 0, fillWidth, 6, 0x3b82f6, 1).setOrigin(0, 0.5);
        
        container.add([bg, fill]);
    }

    sprite.uiContainer = container;
}

// ============================================================
// API & NETWORK
// ============================================================

async function savePosition(scene, sprite) {
    // Lưu dưới dạng % để tương thích đa màn hình
    const x = (sprite.x / scene.scale.width) * 100;
    const y = (sprite.y / scene.scale.height) * 100;
    
    sprite.itemData.x = x;
    sprite.itemData.y = y;

    await fetch('/my-tree/move', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ uniqueId: sprite.itemData._id, x, y })
    });
}

async function interactWithItem(scene, sprite) {
    if (sprite.itemData.type !== 'plant') return;

    const uniqueId = sprite.itemData._id;
    const config = ASSETS.PLANTS[sprite.itemData.itemId];
    const isReady = sprite.itemData.stage >= config.maxStage;
    const action = isReady ? 'harvest' : 'water';

    try {
        const res = await fetch('/my-tree/interact', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ uniqueId, action })
        });
        const data = await res.json();

        if (data.success) {
            updateHTMLHUD(data);

            if (action === 'harvest') {
                // HIỆU ỨNG THU HOẠCH
                scene.starEmitter.emitParticleAt(sprite.x, sprite.y - 50, 20);
                showFloatingText(scene, sprite.x, sprite.y - 80, `+${data.goldReward || '?'} Vàng`, 0xffd700);
                
                // Cây bay lên và biến mất
                scene.tweens.add({
                    targets: sprite,
                    y: sprite.y - 100, alpha: 0, scale: 1.2,
                    duration: 400,
                    onComplete: () => {
                        if(sprite.uiContainer) sprite.uiContainer.destroy();
                        sprite.destroy();
                    }
                });
            } else {
                // HIỆU ỨNG TƯỚI NƯỚC
                scene.waterEmitter.emitParticleAt(sprite.x, sprite.y - 60, 8);
                
                sprite.itemData.waterCount = data.item.waterCount;
                sprite.itemData.stage = data.item.stage;

                if (data.evolved) {
                    sprite.setTexture(`plant_${sprite.itemData.itemId}_${sprite.itemData.stage}`);
                    showFloatingText(scene, sprite.x, sprite.y - 80, "Level Up!", 0x10b981);
                    
                    // Hiệu ứng "Giật mình" vui vẻ
                    scene.tweens.add({
                        targets: sprite,
                        scaleX: sprite.baseScale * 1.4, scaleY: sprite.baseScale * 0.6,
                        duration: 150,
                        yoyo: true,
                        ease: 'Bounce.easeOut'
                    });
                } else {
                    // Rung nhẹ
                    scene.tweens.add({
                        targets: sprite,
                        angle: { from: -3, to: 3 },
                        duration: 50,
                        yoyo: true,
                        repeat: 2
                    });
                }
                updateItemUI(scene, sprite);
            }
        } else {
            showFloatingText(scene, sprite.x, sprite.y - 50, data.msg, 0xff4444);
            scene.cameras.main.shake(100, 0.005);
        }
    } catch(e) { console.error(e); }
}

// Chữ bay (Floating Text)
function showFloatingText(scene, x, y, message, color = 0xffffff) {
    const text = scene.add.text(x, y, message, {
        font: 'bold 24px Quicksand',
        fill: '#ffffff',
        stroke: '#000000',
        strokeThickness: 4
    }).setOrigin(0.5);
    text.setTint(color);
    text.setDepth(99999);

    scene.tweens.add({
        targets: text,
        y: y - 100,
        alpha: 0,
        scale: 1.2,
        duration: 1200,
        ease: 'Power2',
        onComplete: () => text.destroy()
    });
}

function updateHTMLHUD(data) {
    if(data.newWater !== undefined) document.getElementById('hudWater').innerText = data.newWater;
    if(data.newGold !== undefined) document.getElementById('hudGold').innerText = data.newGold;
}

// ============================================================
// SHOP LOGIC (GỌI TỪ HTML)
// ============================================================

function openShopHTML(type) {
    const drawer = document.getElementById('shopOverlay');
    const grid = document.getElementById('shopGrid');
    const title = document.getElementById('shopTitle');
    
    drawer.style.display = 'flex';
    grid.innerHTML = '';
    
    let items = {};
    if (type === 'plants') { items = ASSETS.PLANTS; title.innerText = "Hạt Giống"; }
    else if (type === 'decors') { items = ASSETS.DECORS; title.innerText = "Trang Trí"; }
    else { items = ASSETS.BACKGROUNDS; title.innerText = "Phông Nền"; }

    for (const [key, item] of Object.entries(items)) {
        let img = (type === 'plants') ? item.stages[3] : item.image;
        if(type === 'backgrounds') img = 'https://cdn-icons-png.flaticon.com/512/3214/3214954.png';

        grid.innerHTML += `
            <div class="shop-card" onclick="buyItemPhaser('${key}', '${type === 'plants' ? 'plant' : (type === 'decors' ? 'decoration' : 'background')}')">
                <img src="${img}" style="width:50px; height:50px; object-fit:contain;">
                <h4>${item.name}</h4>
                <div class="price-tag">${item.price}💰</div>
            </div>
        `;
    }
}

async function buyItemPhaser(itemId, type) {
    // Random vị trí gần giữa màn hình
    const x = 40 + Math.random() * 20; 
    const y = 40 + Math.random() * 20;

    try {
        const res = await fetch('/my-tree/buy', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ itemId, type, x, y })
        });
        const data = await res.json();

        if (data.success) {
            updateHTMLHUD(data);
            document.getElementById('shopOverlay').style.display = 'none';

            if (data.isBackground) {
                location.reload(); 
            } else {
                spawnItem(sceneContext, data.item, true);
                showFloatingText(sceneContext, sceneContext.scale.width/2, sceneContext.scale.height/2, `-${ASSETS[type === 'plant' ? 'PLANTS' : 'DECORS'][itemId].price} Vàng`, 0xffd700);
            }
        } else {
            Swal.fire('Oops', data.msg, 'error');
        }
    } catch(e) { console.error(e); }
}

// ============================================================
// 4. LOGIC SHOP UI (HTML INTERACTION)
// ============================================================

// Định nghĩa hàm Global để HTML gọi được (onclick)
window.switchShopTab = function(type) {
    // 1. Cập nhật UI Tabs (Active)
    const tabs = document.querySelectorAll('.tab-rpg');
    tabs.forEach(t => t.classList.remove('active'));

    // Highlight tab tương ứng
    if (type === 'plants') tabs[0].classList.add('active');
    else if (type === 'decors') tabs[1].classList.add('active');
    else if (type === 'backgrounds') tabs[2].classList.add('active');

    // 2. Render Danh sách vật phẩm
    const grid = document.getElementById('shopGrid');
    grid.innerHTML = ''; // Xóa cũ

    let items = {};
    let itemType = '';

    // Lấy danh sách từ ASSETS
    if (type === 'plants') { 
        items = window.gardenAssets.PLANTS; 
        itemType = 'plant';
    } else if (type === 'decors') { 
        items = window.gardenAssets.DECORS; 
        itemType = 'decoration';
    } else { 
        items = window.gardenAssets.BACKGROUNDS; 
        itemType = 'background';
    }

    // 3. Loop và tạo HTML thẻ bài
    for (const [key, item] of Object.entries(items)) {
        // Chọn ảnh đại diện
        let imgUrl = item.image;
        
        // Nếu là cây, lấy ảnh giai đoạn cuối cho đẹp
        if (itemType === 'plant') imgUrl = item.stages[3]; 
        
        // Nếu là Background, dùng icon đại diện chung hoặc ảnh riêng
        if (itemType === 'background' && !imgUrl) {
            imgUrl = 'https://cdn-icons-png.flaticon.com/512/3214/3214954.png';
        }

        // Tạo thẻ HTML
        grid.innerHTML += `
            <div class="item-card" onclick="buyItemPhaser('${key}', '${itemType}')">
                <img src="${imgUrl}">
                <div class="item-name">${item.name}</div>
                <div class="item-price">${item.price}💰</div>
            </div>
        `;
    }
};

// Hàm mở Shop (được gọi từ EventBus của Phaser)
function openShopHTML(defaultTab = 'plants') {
    const overlay = document.getElementById('shopOverlay');
    if (overlay) {
        overlay.style.display = 'flex'; // Hiện Modal
        window.switchShopTab(defaultTab); // Load tab mặc định
    }
}

// Logic Mua hàng (đã có ở trên, nhưng đảm bảo nó là Global nếu cần)
window.buyItemPhaser = async function(itemId, type) {
    // Random vị trí gần giữa màn hình để người chơi thấy ngay
    const x = 40 + Math.random() * 20; 
    const y = 40 + Math.random() * 20;

    try {
        const res = await fetch('/my-tree/buy', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ itemId, type, x, y })
        });
        const data = await res.json();

        if (data.success) {
            // Cập nhật tiền trên HUD
            updateHTMLHUD(data);
            
            // Đóng shop
            document.getElementById('shopOverlay').style.display = 'none';

            if (data.isBackground) {
                location.reload(); // Reload để nhận background mới
            } else {
                // Spawn item mới vào game ngay lập tức
                spawnItem(sceneContext, data.item, true);
                
                // Hiệu ứng trừ tiền bay lên (Floating Text)
                const price = window.gardenAssets[type === 'plant' ? 'PLANTS' : 'DECORS'][itemId].price;
                showFloatingText(sceneContext, sceneContext.scale.width/2, sceneContext.scale.height/2, `-${price} Gold`, 0xffd700);
                
                // Thông báo nhỏ
                window.SwalPixel.fire({ icon: 'success', title: `Đã mua ${data.item.itemId}!` });
            }
        } else {
            window.SwalPixel.fire({ icon: 'error', title: data.msg });
        }
    } catch(e) { console.error(e); }
};