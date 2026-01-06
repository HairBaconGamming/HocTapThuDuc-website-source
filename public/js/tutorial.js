/**
 * GARDEN TUTORIAL SYSTEM v12.0 (Smart Player Detection)
 * - Detect Old Player: Items > 2 => Auto Finish (999).
 * - Detect Newbie: Items == 0 => Auto Reset (0).
 */

const Tutorial = {
    NPC_IMAGE: 'http://localhost:3000/api/pro-images/1767292174351-vww00c.png',
    NPC_NAME: 'Linh Nhi Sư Tỷ',
    FINISHED_STEP: 999,

    idx: 0,
    active: false,
    gender: null,
    addressTerm: 'Đạo hữu',

    steps: [
        // ... (Giữ nguyên danh sách các bước steps như cũ) ...
        // 0. CHỌN GIỚI TÍNH
        {
            id: 'gender_select',
            text: 'Chào mừng tân thủ! Ta là Linh Nhi. <br><br>Cho ta hỏi, các hạ là...',
            isGenderStep: true, allowedTool: 'cursor' 
        },
        // ... COPY LẠI CÁC BƯỚC CŨ VÀO ĐÂY ...
        // (Để tiết kiệm không gian, tôi dùng lại cấu trúc steps của bản v11)
        // Bạn hãy giữ nguyên mảng steps đầy đủ nhé!
        {
            id: 'select_move',
            text: 'Trước hết, {address} hãy chọn công cụ <b>Di Chuyển (Move)</b> (Phím 1) để quan sát.',
            target: '[data-tool="move"]',
            trigger: 'toolChanged',
            check: (data) => data === 'move',
            allowedTool: 'move'
        },
        {
            id: 'try_move',
            text: 'Giờ hãy thử <b>Kéo thả chuột</b> để di chuyển camera xem toàn cảnh nhé.',
            target: '#garden-game-container',
            btn: 'Đã biết di chuyển',
            allowedTool: 'move'
        },
        {
            id: 'select_hoe',
            text: 'Để trồng trọt cần có đất. Hãy chọn công cụ <b>Cuốc (Hoe)</b> (Phím 3).',
            target: '[data-tool="hoe"]',
            trigger: 'toolChanged',
            check: (data) => data === 'hoe',
            allowedTool: 'hoe'
        },
        {
            id: 'action_hoe',
            text: 'Ra bãi cỏ trống và <b>Click Chuột</b> để cuốc một ô linh điền.',
            target: '#garden-game-container',
            trigger: 'actionSuccess',
            check: (data) => data.action === 'hoe',
            allowedTool: 'hoe'
        },
        {
            id: 'open_shop',
            text: 'Có đất rồi. Giờ hãy mở <b>Cửa Hàng (Shop)</b> để mua hạt giống.',
            target: '[data-tool="shop"]',
            trigger: 'shopOpen', 
            manual: true,
            allowedTool: 'cursor'
        },
        {
            id: 'select_seed',
            text: 'Chọn một loại hạt giống bất kỳ để xem thông tin.',
            target: '#shopGrid .shop-card:first-child',
            manual: true,
            check: () => document.getElementById('shop-item-state').style.display !== 'none',
            allowedTool: 'cursor',
            requireShop: true
        },
        {
            id: 'confirm_buy', 
            text: 'Chú ý các chỉ số rồi ấn nút <b>MUA & TRỒNG</b>.',
            target: '#btn-confirm-buy',
            trigger: 'buyItem',
            allowedTool: 'cursor',
            requireShop: true
        },
        {
            id: 'plant_seed',
            text: 'Di chuyển hạt giống vào <b>Ô Đất</b> vừa cuốc rồi click để gieo.',
            target: '#garden-game-container',
            trigger: 'actionSuccess',
            check: (data) => data.action === 'plant',
            allowedTool: 'cursor'
        },
        {
            id: 'select_cursor',
            text: 'Cây đã gieo! Chọn công cụ <b>Con Trỏ (Cursor)</b> (Phím 2) để kiểm tra tình trạng.',
            target: '[data-tool="cursor"]',
            trigger: 'toolChanged',
            check: (data) => data === 'cursor',
            allowedTool: 'cursor'
        },
        {
            id: 'inspect_plant',
            text: 'Hãy <b>Click vào cây</b> vừa trồng để xem chi tiết.',
            target: '#garden-game-container',
            manual: true,
            check: () => document.getElementById('plantStats').classList.contains('active'),
            allowedTool: 'cursor'
        },
        {
            id: 'explain_water_bar',
            text: '💧 <b>Thanh Độ Ẩm:</b> Cây cần nước để sống. Cạn nước sẽ ngừng lớn!',
            target: '#statWitherBar',
            btn: 'Đã hiểu',
            allowedTool: 'cursor'
        },
        {
            id: 'explain_growth_bar',
            text: '🌱 <b>Thanh Tăng Trưởng:</b> Đủ nước thanh này sẽ đầy. 100% cây sẽ lớn.',
            target: '#statGrowthBar',
            btn: 'Tiếp tục',
            allowedTool: 'cursor'
        },
        {
            id: 'select_water',
            text: 'Đất khô quá! Chọn <b>Bình Tưới (Water)</b> (Phím 4) ngay.',
            target: '[data-tool="water"]',
            trigger: 'toolChanged',
            check: (data) => data === 'water',
            allowedTool: 'water'
        },
        {
            id: 'action_water',
            text: 'Tưới nước cho cây nào.',
            target: '#garden-game-container',
            trigger: 'actionSuccess',
            check: (data) => data.action === 'water',
            allowedTool: 'water'
        },
        {
            id: 'explain_basket',
            text: 'Khi cây chín (có sao ⭐), hãy dùng <b>Giỏ</b> để thu hoạch.',
            target: '[data-tool="basket"]',
            btn: 'Ghi nhớ',
            allowedTool: 'basket'
        },
        {
            id: 'explain_shovel',
            text: 'Còn <b>Xẻng</b> dùng để phá bỏ cây chết. <br>⚠️ Cẩn thận kẻo mất cây!',
            target: '[data-tool="shovel"]',
            btn: 'Đã rõ',
            allowedTool: 'shovel'
        },
        {
            id: 'finish',
            text: 'Chúc {address} tu luyện thành công! Tỷ đi đây.',
            btn: 'Đa tạ Sư tỷ!',
            allowedTool: null
        }
    ],

    init() {
        const dbStep = window.gardenData ? window.gardenData.tutorialStep : 0;
        const gardenItems = window.gardenData ? window.gardenData.items : [];
        const itemCount = gardenItems.length;

        // --- 1. CHECK NGƯỜI CHƠI CŨ (Vườn đã phát triển) ---
        // Nếu có quá 2 món đồ (Tutorial chỉ tạo ra max 2 món: đất + cây)
        // Hoặc DB đã đánh dấu hoàn thành
        if (itemCount > 2 || dbStep === this.FINISHED_STEP) {
            console.log("Detect: Người chơi cũ (Vườn > 2 items).");
            
            // Nếu DB chưa đánh dấu xong (ví dụ bug), thì đánh dấu ngay để lần sau ko check nữa
            if (dbStep !== this.FINISHED_STEP) {
                console.log("Auto-fix: Đánh dấu hoàn thành tutorial.");
                this.saveProgress(this.FINISHED_STEP);
            }
            return; // DỪNG TUTORIAL
        }

        // --- 2. CHECK NGƯỜI CHƠI MỚI (Vườn trống trơn) ---
        if (itemCount === 0) {
            console.log("Detect: Newbie (Vườn trống). Reset Tutorial.");
            this.idx = 0;
            // Nếu DB đang lưu bước dở dang, reset về 0
            if (dbStep !== 0) this.saveProgress(0);
        } 
        
        // --- 3. CHECK ĐANG LÀM DỞ (Vườn có 1-2 món) ---
        else {
            console.log("Detect: Đang làm dở Tutorial. Resume.");
            this.idx = dbStep;
            
            // Safety check: Nếu item < 2 mà dbStep lại quá lớn (lớn hơn số bước), reset lại
            if (this.idx >= this.steps.length) {
                this.idx = 0; 
                this.saveProgress(0);
            }
        }

        // --- INJECT UI ---
        if (!document.getElementById('tutorial-overlay')) {
            const html = `
                <div id="tutorial-overlay">
                    <div id="tut-focus" class="tut-focus"></div>
                    <div class="tut-dialog-container">
                        <div class="tut-npc-portrait"><img src="${this.NPC_IMAGE}" alt="NPC"></div>
                        <div class="tut-content-box">
                            <div class="tut-header">
                                <span class="tut-npc-name">${this.NPC_NAME}</span>
                                <button class="tut-close" onclick="Tutorial.skip()">×</button>
                            </div>
                            <div class="tut-body" id="tut-text">...</div>
                            <div id="tut-normal-controls" class="tut-controls">
                                <button class="btn-tut primary" id="tut-btn" onclick="Tutorial.next()">Tiếp tục</button>
                            </div>
                            <div id="tut-gender-controls" class="gender-selection" style="display:none;">
                                <button class="btn-tut btn-gender male" onclick="Tutorial.selectGender('male')"><i class="fas fa-mars"></i> Nam</button>
                                <button class="btn-tut btn-gender female" onclick="Tutorial.selectGender('female')"><i class="fas fa-venus"></i> Nữ</button>
                            </div>
                        </div>
                    </div>
                </div>
            `;
            document.body.insertAdjacentHTML('beforeend', html);
        }
        
        this.setupEvents();
        setTimeout(() => this.start(), 1000);
    },

    start() {
        this.active = true;
        document.getElementById('tutorial-overlay').style.display = 'block';
        this.renderStep();
    },

    skip() {
        if(confirm("Các hạ có chắc muốn bỏ qua hướng dẫn?")) {
            this.finishTutorial();
        }
    },

    finishTutorial() {
        this.active = false;
        document.getElementById('tutorial-overlay').style.display = 'none';
        if(window.setAllowedTool) window.setAllowedTool(null);
        this.saveProgress(this.FINISHED_STEP);
    },

    selectGender(selection) {
        this.gender = selection;
        this.addressTerm = (selection === 'male') ? 'Sư đệ' : 'Sư muội';
        this.next();
    },

    next() {
        const step = this.steps[this.idx];
        if (step.id === 'plant_seed' && window.cancelPlanting) window.cancelPlanting();
        if (step.check && typeof step.check === 'function' && step.manual) {
            if (!step.check()) { this.shakeDialog(); return; }
        }
        
        this.idx++;
        
        // Save progress immediately
        if (this.idx < this.steps.length) {
            this.saveProgress(this.idx);
            this.renderStep();
        } else {
            this.finishTutorial();
        }
    },

    saveProgress(stepIndex) {
        fetch('/api/my-garden/tutorial-step', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ step: stepIndex })
        }).catch(err => console.error("Lỗi lưu tutorial:", err));
    },

    renderStep() {
        const step = this.steps[this.idx];
        const textEl = document.getElementById('tut-text');
        const nextBtn = document.getElementById('tut-btn');
        
        // Lock Tools
        if(window.setAllowedTool) window.setAllowedTool(step.allowedTool !== undefined ? step.allowedTool : null);

        // Auto Open Shop if needed
        if (step.requireShop && typeof window.openShopHTML === 'function') {
            const shopOverlay = document.getElementById('shopOverlay');
            if (!shopOverlay || shopOverlay.style.display === 'none') {
                window.openShopHTML('plant');
            }
        }

        // Shop Mode Position
        const container = document.querySelector('.tut-dialog-container');
        const shopSteps = ['select_seed', 'confirm_buy'];
        if (shopSteps.includes(step.id)) container.classList.add('shop-mode');
        else container.classList.remove('shop-mode');

        // Text
        textEl.innerHTML = step.text.replace(/{address}/g, `<b>${this.addressTerm}</b>`);
        
        if (step.isGenderStep) {
            document.getElementById('tut-normal-controls').style.display = 'none';
            document.getElementById('tut-gender-controls').style.display = 'flex';
            this.highlight(null);
        } else {
            document.getElementById('tut-normal-controls').style.display = 'flex';
            document.getElementById('tut-gender-controls').style.display = 'none';
            
            nextBtn.innerText = step.btn || 'Tiếp theo';
            if (step.trigger && !step.manual) nextBtn.style.display = 'none';
            else nextBtn.style.display = 'block';
            
            setTimeout(() => this.highlight(step.target), 200);
        }
    },

    highlight(selector) {
        const focus = document.getElementById('tut-focus');
        if (!selector) { focus.style.opacity = 0; return; }
        const el = document.querySelector(selector);
        if (!el || el.offsetParent === null) { focus.style.opacity = 0; return; }
        const rect = el.getBoundingClientRect();
        focus.style.opacity = 1;
        focus.style.top = rect.top + 'px';
        focus.style.left = rect.left + 'px';
        focus.style.width = rect.width + 'px';
        focus.style.height = rect.height + 'px';
    },

    shakeDialog() {
        const container = document.querySelector('.tut-dialog-container');
        container.style.animation = 'none';
        container.offsetHeight; 
        container.style.animation = 'shake 0.4s';
    },

    setupEvents() {
        if (!window.gameEvents) return;

        document.addEventListener('click', (e) => {
            if (!this.active) return;
            const step = this.steps[this.idx];
            if (step.id === 'open_shop' && e.target.closest('[data-tool="shop"]')) setTimeout(() => this.next(), 500);
            if (step.id === 'select_seed' && e.target.closest('.shop-card')) setTimeout(() => this.next(), 500);
            if (step.id === 'inspect_plant' && e.target.id === 'garden-game-container') {
                setTimeout(() => { if (document.getElementById('plantStats').classList.contains('active')) this.next(); }, 300);
            }
        });

        window.gameEvents.on('buyItem', () => {
            const step = this.steps[this.idx];
            if (this.active && step.trigger === 'buyItem') this.next();
        });

        window.gameEvents.on('toolChanged', (toolName) => {
            if (!this.active) return;
            const step = this.steps[this.idx];
            if (step.trigger === 'toolChanged' && step.check(toolName)) this.next();
        });

        window.gameEvents.on('actionSuccess', (data) => {
            if (!this.active) return;
            const step = this.steps[this.idx];
            if (step.trigger === 'actionSuccess' && step.check(data)) this.next();
        });
        
        window.gameEvents.on('shopOpen', () => {
             if (this.active && this.steps[this.idx].id === 'open_shop') setTimeout(() => this.next(), 500);
        });
    }
};

document.addEventListener('DOMContentLoaded', () => Tutorial.init());