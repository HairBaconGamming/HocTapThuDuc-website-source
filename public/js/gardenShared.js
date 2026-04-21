(function attachGardenShared(window) {
    const gardenData = window.gardenData || {};

    function parseDuration(value) {
        if (!value) return 5 * 60 * 1000;

        const strVal = String(value).toLowerCase();
        const amount = parseFloat(strVal);
        if (!Number.isFinite(amount)) return 5 * 60 * 1000;

        if (strVal.includes('ngày') || strVal.includes('day')) {
            return amount * 24 * 60 * 60 * 1000;
        } else if (strVal.includes('giờ') || strVal.includes('gio') || strVal.includes('hour')) {
            return amount * 60 * 60 * 1000;
        } else if (strVal.includes('giây') || strVal.includes('sec')) {
            return amount * 1000;
        }
        
        // Mặc định là phút
        return amount * 60 * 1000;
    }

    function formatTime(ms) {
        if (ms <= 0) return '00:00';

        const totalSeconds = Math.floor(ms / 1000);
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;

        if (hours > 0) return `${hours}g ${minutes}p`;
        if (minutes > 0) return `${minutes}p ${seconds}s`;
        return `${seconds}s`;
    }

    function applyGardenDefaults(data = gardenData) {
        if (!data.items || !Array.isArray(data.items)) data.items = [];
        if (!data.dailyQuests || !Array.isArray(data.dailyQuests)) data.dailyQuests = [];
        if (!data.inventory || typeof data.inventory !== 'object') {
            data.inventory = {};
        }
        Object.keys(window.gardenAssets?.PLANTS || {}).forEach((key) => {
            const value = Number(data.inventory[key] || 0);
            data.inventory[key] = Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
        });
        if (!data.userLevel) data.userLevel = 1;
        if (!data.currentXP) data.currentXP = 0;
        if (!data.nextLevelXP) data.nextLevelXP = 100;
        if (!data.gold) data.gold = 0;
        if (!data.water) data.water = 0;
        if (!data.fertilizer) data.fertilizer = 0;
        if (typeof data.tutorialStep === 'undefined') data.tutorialStep = 0;
        return data;
    }

    function showToast(msg, type = 'info') {
        if (typeof window.Swal !== 'undefined' && window.SwalPixel) {
            window.SwalPixel.fire({ title: msg, icon: type });
            return;
        }

        if (typeof window.Swal !== 'undefined') {
            const Toast = window.Swal.mixin({
                toast: true,
                position: 'top-end',
                showConfirmButton: false,
                timer: 2000,
                timerProgressBar: true,
                background: '#3e2723',
                color: '#ffb300',
                iconColor: '#ffb300'
            });
            Toast.fire({ title: msg, icon: type });
            return;
        }

        console.log(`[${type.toUpperCase()}] ${msg}`);
    }

    async function apiCall(url, body) {
        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });

            return await response.json();
        } catch (error) {
            return {
                success: false,
                msg: 'Mất kết nối server!'
            };
        }
    }

    function syncGardenData(response = {}) {
        applyGardenDefaults(gardenData);

        if (response.newWater !== undefined) {
            gardenData.water = response.newWater;
        }

        if (response.newGold !== undefined) {
            gardenData.gold = response.newGold;
        }

        if (response.newFertilizer !== undefined) {
            gardenData.fertilizer = response.newFertilizer;
        }

        if (Array.isArray(response.dailyQuests)) {
            gardenData.dailyQuests = response.dailyQuests;
        }

        if (response.inventory && typeof response.inventory === 'object') {
            gardenData.inventory = {
                ...(gardenData.inventory || {}),
                ...response.inventory
            };
        }

        if (response.levelData) {
            if (response.levelData.level !== undefined) gardenData.userLevel = response.levelData.level;
            if (response.levelData.currentXP !== undefined) gardenData.currentXP = response.levelData.currentXP;
            if (response.levelData.nextLevelXP !== undefined) gardenData.nextLevelXP = response.levelData.nextLevelXP;
            if (response.levelData.levelName) gardenData.levelName = response.levelData.levelName;
        }

        return gardenData;
    }

    function updateHUD(data) {
        syncGardenData(data);

        if (data.newWater !== undefined) {
            const el = document.getElementById('ui-water');
            if (el) el.innerText = data.newWater;
        }

        if (data.newGold !== undefined) {
            const el = document.getElementById('ui-gold');
            if (el) el.innerText = data.newGold;
            const shopGold = document.getElementById('shop-user-gold');
            if (shopGold) shopGold.innerText = data.newGold;
        }

        if (data.newFertilizer !== undefined) {
            const el = document.getElementById('ui-fertilizer');
            if (el) el.innerText = data.newFertilizer;

            const panelCount = document.getElementById('statFertilizerCount');
            if (panelCount) panelCount.innerText = data.newFertilizer;
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

                if (bar) bar.style.width = `${pct}%`;
                if (txt) txt.innerText = `${current}/${max}`;
            }

            if (lvl && data.levelData.level) lvl.innerText = data.levelData.level;
            if (realm && data.levelData.levelName) realm.innerText = data.levelData.levelName;
        }

        if (typeof window.renderDailyQuests === 'function') {
            window.renderDailyQuests(gardenData.dailyQuests || []);
        }

        if (typeof window.renderGardenInventory === 'function') {
            window.renderGardenInventory(gardenData.inventory || {});
        }
    }

    function updateCoords(x, y) {
        const elX = document.getElementById('ui-coords-x');
        const elY = document.getElementById('ui-coords-y');
        if (elX) elX.innerText = x;
        if (elY) elY.innerText = y;
    }

    function addGardenItem(item) {
        if (!item) return;
        applyGardenDefaults(gardenData);

        const index = gardenData.items.findIndex((entry) => String(entry._id) === String(item._id));
        if (index >= 0) {
            gardenData.items[index] = item;
        } else {
            gardenData.items.push(item);
        }
    }

    function removeGardenItem(uniqueId) {
        applyGardenDefaults(gardenData);
        gardenData.items = gardenData.items.filter((entry) => String(entry._id) !== String(uniqueId));
    }

    function moveGardenItem(uniqueId, x, y) {
        applyGardenDefaults(gardenData);
        const item = gardenData.items.find((entry) => String(entry._id) === String(uniqueId));
        if (item) {
            item.x = x;
            item.y = y;
        }
    }

    // =========================================================================
    // ActionQueue — Batches actions, sends a single /my-garden/batch request
    // =========================================================================
    const ActionQueue = {
        _queue: [],        // pending actions: { action, payload, resolve, reject, rollback }
        _timer: null,
        _flushing: false,
        DEBOUNCE_MS: 600,  // wait 600ms after last action before flushing
        MAX_QUEUE: 30,

        /**
         * Push an action onto the queue. Returns a Promise that resolves
         * when the batch response arrives for this specific action.
         *
         * @param {string} action  - 'water' | 'buy' | 'harvest' | 'move' | 'remove' | 'fertilize'
         * @param {object} payload - per-action parameters
         * @param {function} [rollback] - called if the server rejects this action
         * @returns {Promise<object>}
         */
        enqueue(action, payload, rollback) {
            return new Promise((resolve, reject) => {
                this._queue.push({ action, payload, rollback, resolve, reject });

                // If queue is full, flush immediately
                if (this._queue.length >= this.MAX_QUEUE) {
                    this._flushNow();
                    return;
                }

                // Otherwise, debounce
                clearTimeout(this._timer);
                this._timer = setTimeout(() => this._flushNow(), this.DEBOUNCE_MS);
            });
        },

        /**
         * Force-flush whatever is in the queue right now.
         */
        async _flushNow() {
            clearTimeout(this._timer);
            if (this._flushing || this._queue.length === 0) return;

            this._flushing = true;
            const batch = this._queue.splice(0, this.MAX_QUEUE);

            try {
                const body = { actions: batch.map(b => ({ action: b.action, payload: b.payload })) };
                const res = await apiCall('/my-garden/batch', body);

                if (res.success && Array.isArray(res.results)) {
                    // Apply the authoritative garden state from the server
                    if (res.garden) {
                        updateHUD(res.garden);
                    }

                    // Resolve each item
                    res.results.forEach((result, i) => {
                        if (batch[i]) {
                            if (result.success) {
                                batch[i].resolve(result);
                            } else {
                                // Call rollback if provided
                                if (typeof batch[i].rollback === 'function') {
                                    try { batch[i].rollback(result); } catch (_) {}
                                }
                                batch[i].resolve(result); // still resolve so UI can handle
                            }
                        }
                    });
                } else {
                    // Whole batch failed — rollback everything
                    const errMsg = res.msg || 'Batch failed';
                    batch.forEach(b => {
                        if (typeof b.rollback === 'function') {
                            try { b.rollback({ success: false, msg: errMsg }); } catch (_) {}
                        }
                        b.resolve({ success: false, msg: errMsg });
                    });
                }
            } catch (err) {
                batch.forEach(b => {
                    if (typeof b.rollback === 'function') {
                        try { b.rollback({ success: false, msg: 'Mất kết nối!' }); } catch (_) {}
                    }
                    b.resolve({ success: false, msg: 'Mất kết nối!' });
                });
            } finally {
                this._flushing = false;
                // If more items accumulated while we were flushing, flush again
                if (this._queue.length > 0) {
                    this._flushNow();
                }
            }
        }
    };

    window.GardenShared = {
        parseDuration,
        formatTime,
        applyGardenDefaults,
        showToast,
        apiCall,
        syncGardenData,
        updateHUD,
        updateCoords,
        addGardenItem,
        removeGardenItem,
        moveGardenItem,
        ActionQueue
    };
})(window);
