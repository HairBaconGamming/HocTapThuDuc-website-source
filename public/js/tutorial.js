const Tutorial = {
    steps: [
        {
            id: 'intro',
            title: 'Chào Đạo Hữu! 🙏',
            text: 'Chào mừng đến với Linh Điền! Ta là Thổ Địa, ta sẽ hướng dẫn ngài cách trồng linh dược.',
            btn: 'Bắt đầu'
        },
        {
            id: 'open_shop',
            title: 'Bước 1: Mua Hạt Giống',
            text: 'Hãy mở <b>Cửa Hàng (Shop)</b> để mua hạt giống đầu tiên.',
            target: '[data-tool="shop"]', // Selector nút Shop trong EJS
            trigger: 'shopOpen', // Sự kiện tự định nghĩa
            manual: true // Cho phép bấm Next nếu lỡ mở rồi tắt
        },
        {
            id: 'buy_seed',
            title: 'Bước 2: Chọn Giống',
            text: 'Chọn một loại hạt giống bất kỳ trong tab "Hạt Giống".',
            target: '#shopGrid .shop-card:first-child', // Card đầu tiên
            trigger: 'buyItem', // Sự kiện từ garden.ejs emit
            forceAction: () => window.openShopHTML('plants') // Mở lại shop nếu lỡ tắt
        },
        {
            id: 'plant',
            title: 'Bước 3: Gieo Hạt',
            text: 'Di chuyển chuột ra vùng đất trống và click chuột trái (hoặc Space) để gieo hạt.',
            target: '#garden-game-container',
            btn: 'Đã gieo xong' // Vì Phaser không emit event placement success nên dùng nút manual
        },
        {
            id: 'water',
            title: 'Bước 4: Tưới Nước',
            text: 'Cây cần nước! Chọn <b>Bình Tưới</b> và tưới cho cây.',
            target: '[data-tool="water"]',
            trigger: 'action_water' // Event từ gardenPhaser v10.2
        },
        {
            id: 'finish',
            title: 'Hoàn Thành! 🎉',
            text: 'Tuyệt vời! Khi cây chín (có sao ⭐), hãy dùng <b>Giỏ</b> để thu hoạch nhé. Chúc ngài tu luyện thành công!',
            btn: 'Kết thúc'
        }
    ],
    idx: 0,
    active: false,

    init() {
        // Chỉ chạy nếu chưa có nhiều cây (người chơi mới)
        if (window.gardenData && window.gardenData.items && window.gardenData.items.length > 2) return;
        
        // Inject HTML
        const html = `
            <div id="tutorial-overlay">
                <div id="tut-focus" class="tut-focus"></div>
                <div id="tut-hand" class="tut-hand">👇</div>
                <div class="tut-dialog">
                    <div class="tut-header">
                        <span class="tut-title" id="tut-title">...</span>
                        <button class="tut-close" onclick="Tutorial.stop()">×</button>
                    </div>
                    <div class="tut-body" id="tut-text">...</div>
                    <div class="tut-controls">
                        <button class="btn-tut" id="tut-btn" onclick="Tutorial.next()">Tiếp</button>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', html);
        
        // Listeners
        this.setupEvents();
        
        // Start delay
        setTimeout(() => this.start(), 1500);
    },

    start() {
        this.active = true;
        this.idx = 0;
        document.getElementById('tutorial-overlay').style.display = 'block';
        this.renderStep();
    },

    stop() {
        this.active = false;
        document.getElementById('tutorial-overlay').style.display = 'none';
    },

    next() {
        this.idx++;
        if (this.idx >= this.steps.length) this.stop();
        else this.renderStep();
    },

    renderStep() {
        const step = this.steps[this.idx];
        document.getElementById('tut-title').innerText = step.title;
        document.getElementById('tut-text').innerHTML = step.text;
        
        const btn = document.getElementById('tut-btn');
        btn.innerText = step.btn || 'Tiếp tục';
        btn.style.display = step.trigger && !step.manual ? 'none' : 'block';

        if (step.forceAction) step.forceAction();

        this.highlight(step.target);
    },

    highlight(selector) {
        const focus = document.getElementById('tut-focus');
        const hand = document.getElementById('tut-hand');
        
        if (!selector) {
            focus.style.opacity = 0;
            hand.style.display = 'none';
            return;
        }

        const el = document.querySelector(selector);
        if (el) {
            const rect = el.getBoundingClientRect();
            focus.style.opacity = 1;
            focus.style.top = rect.top + 'px';
            focus.style.left = rect.left + 'px';
            focus.style.width = rect.width + 'px';
            focus.style.height = rect.height + 'px';

            hand.style.display = 'block';
            hand.style.top = (rect.top - 60) + 'px';
            hand.style.left = (rect.left + rect.width/2 - 25) + 'px';
        }
    }
    ,
    setupEvents() {
        if (!window.gameEvents) return;

        // 1. Mua hàng (Từ garden.ejs emit)
        window.gameEvents.on('buyItem', () => {
            if (this.active && this.steps[this.idx].id === 'buy_seed') {
                this.next();
            }
        });

        // 2. Hành động Phaser (Từ gardenPhaser.js v10.2 emit)
        window.gameEvents.on('actionSuccess', (data) => {
            if (!this.active) return;
            const step = this.steps[this.idx];
            if (step.id === 'water' && data.action === 'water') {
                this.next();
            }
        });

        // 3. Hack: Detect Shop Open (MutationObserver hoặc click listener)
        document.addEventListener('click', (e) => {
            if (!this.active) return;
            const step = this.steps[this.idx];
            if (step.id === 'open_shop' && e.target.closest('[data-tool="shop"]')) {
                setTimeout(() => this.next(), 500);
            }
        });
    }
};

// Auto run
document.addEventListener('DOMContentLoaded', () => Tutorial.init());