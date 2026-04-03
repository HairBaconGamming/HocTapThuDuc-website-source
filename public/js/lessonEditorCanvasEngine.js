(function () {
    function cloneDeep(value) {
        return JSON.parse(JSON.stringify(value));
    }

    function coerceValue(input) {
        const valueType = input.dataset.blockValueType;
        if (valueType === "number") {
            return Number(input.value);
        }

        if (valueType === "boolean" || input.type === "checkbox") {
            return Boolean(input.checked);
        }

        return input.value;
    }

    function create(config) {
        let bound = false;

        function getBlocks() {
            const blocks = config.getBlocks();
            return Array.isArray(blocks) ? blocks : [];
        }

        function markDirty() {
            if (typeof config.markDirty === "function") config.markDirty();
        }

        function render() {
            if (typeof config.render === "function") config.render();
        }

        function buildTemplate(type) {
            if (typeof config.createTemplate !== "function") return null;
            const template = config.createTemplate(type);
            return template ? cloneDeep(template) : null;
        }

        function setInsertIndex(index) {
            if (typeof config.setInsertIndex === "function") config.setInsertIndex(index);
        }

        function getInsertIndex() {
            if (typeof config.getInsertIndex === "function") return config.getInsertIndex();
            return -1;
        }

        function openMenu(index, anchorEl) {
            const menu = document.getElementById(config.menuId || "blockMenu");
            const searchInput = document.getElementById(config.menuSearchId || "blockMenuSearch");
            if (!menu || !anchorEl) return;

            setInsertIndex(index);
            menu.style.display = "block";

            if (searchInput) {
                searchInput.value = "";
                if (typeof config.filterMenu === "function") config.filterMenu("");
                window.setTimeout(() => searchInput.focus(), 0);
            }

            const rect = anchorEl.getBoundingClientRect();
            const menuWidth = menu.offsetWidth || 220;
            let leftPos = rect.left + rect.width / 2 - menuWidth / 2;
            if (leftPos < 10) leftPos = 10;
            if (leftPos + menuWidth > window.innerWidth) leftPos = window.innerWidth - menuWidth - 10;
            menu.style.left = `${leftPos}px`;

            const menuHeight = menu.offsetHeight || 320;
            const spaceBelow = window.innerHeight - rect.bottom;
            if (spaceBelow < menuHeight + 20) {
                menu.style.top = "auto";
                menu.style.bottom = `${window.innerHeight - rect.top + 10}px`;
                menu.style.transformOrigin = "bottom center";
            } else {
                menu.style.top = `${rect.bottom + 10}px`;
                menu.style.bottom = "auto";
                menu.style.transformOrigin = "top center";
            }
        }

        function closeMenu() {
            const menu = document.getElementById(config.menuId || "blockMenu");
            const searchInput = document.getElementById(config.menuSearchId || "blockMenuSearch");
            if (menu) menu.style.display = "none";
            if (searchInput) searchInput.value = "";
            if (typeof config.filterMenu === "function") config.filterMenu("");
            setInsertIndex(-2);
        }

        function addBlock(type, explicitIndex) {
            const blocks = getBlocks();
            const newBlock = buildTemplate(type);
            if (!newBlock) return false;

            const insertIndex = Number.isInteger(explicitIndex) ? explicitIndex : getInsertIndex();
            if (insertIndex === -1) blocks.push(newBlock);
            else blocks.splice(insertIndex + 1, 0, newBlock);

            closeMenu();
            markDirty();
            render();
            return true;
        }

        async function deleteBlock(index) {
            const blocks = getBlocks();
            if (!blocks[index]) return false;

            let confirmed = true;
            if (typeof config.confirmDelete === "function") {
                confirmed = await config.confirmDelete(index);
            }
            if (!confirmed) return false;

            blocks.splice(index, 1);
            markDirty();
            render();
            return true;
        }

        function moveBlock(index, delta) {
            const blocks = getBlocks();
            const nextIndex = index + delta;
            if (!blocks[index] || nextIndex < 0 || nextIndex >= blocks.length) return false;

            const item = blocks.splice(index, 1)[0];
            blocks.splice(nextIndex, 0, item);
            markDirty();
            render();
            return true;
        }

        function toggleFlag(index, flagName) {
            const blocks = getBlocks();
            if (!blocks[index]) return false;
            blocks[index][flagName] = !blocks[index][flagName];
            markDirty();
            render();
            return true;
        }

        function updateField(index, path, value, options = {}) {
            const blocks = getBlocks();
            const block = blocks[index];
            if (!block) return false;

            if (!block.data) block.data = {};
            const keys = path.split(".");
            let target = block.data;
            for (let i = 0; i < keys.length - 1; i += 1) {
                const key = keys[i];
                if (!target[key] || typeof target[key] !== "object") target[key] = {};
                target = target[key];
            }
            target[keys[keys.length - 1]] = value;

            markDirty();
            if (options.render !== false) render();
            else if (typeof config.onSoftChange === "function") config.onSoftChange();
            return true;
        }

        function handleAction(action, index, element) {
            if (action === "move-up") return moveBlock(index, -1);
            if (action === "move-down") return moveBlock(index, 1);
            if (action === "delete") return deleteBlock(index);
            if (action === "toggle-video-settings") return toggleFlag(index, "_settingsOpen");
            if (action === "toggle-html-settings") return toggleFlag(index, "_settingsOpen");
            if (action === "edit-quiz" && typeof config.editQuestionBlock === "function") return config.editQuestionBlock(index);
            if (action === "open-menu") {
                const insertIndex = Number(element?.dataset.insertIndex ?? index ?? -1);
                return openMenu(insertIndex, element);
            }
            return false;
        }

        function bindDelegates() {
            if (bound) return;
            bound = true;

            document.addEventListener("click", (event) => {
                const actionEl = event.target.closest("[data-block-action], [data-canvas-action], #blockMenu [data-block-type]");
                if (!actionEl) return;

                if (actionEl.dataset.blockType) {
                    addBlock(actionEl.dataset.blockType);
                    return;
                }

                if (actionEl.dataset.canvasAction === "open-menu") {
                    event.preventDefault();
                    const insertIndex = Number(actionEl.dataset.insertIndex ?? -1);
                    openMenu(insertIndex, actionEl);
                    return;
                }

                if (actionEl.dataset.blockAction) {
                    event.preventDefault();
                    const index = Number(actionEl.dataset.blockIndex);
                    handleAction(actionEl.dataset.blockAction, index, actionEl);
                }
            });

            document.addEventListener("change", (event) => {
                const field = event.target.closest("[data-block-field]");
                if (!field) return;

                const index = Number(field.dataset.blockIndex);
                const path = field.dataset.blockField;
                if (!path || Number.isNaN(index)) return;
                updateField(index, path, coerceValue(field), { render: field.dataset.blockRender !== "false" });
            });
        }

        return {
            bindDelegates,
            openMenu,
            closeMenu,
            addBlock,
            deleteBlock,
            moveBlock,
            toggleFlag,
            updateField
        };
    }

    window.LessonCanvasEngine = {
        create
    };
})();
