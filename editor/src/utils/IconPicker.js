/**
 * The shared IconSet picker and the small icon field that opens it.
 *
 * One implementation serves the Database editor (item, weapon, armor, skill
 * icons), the Plugin Manager (`@type icon` parameters at the top level, in
 * structs, and in arrays), and Plugin Command arguments. Icon indices are
 * always handed back as numbers; callers that store strings (plugins.js does)
 * convert at the write.
 *
 * The sheet loads through the same URL resolution as the database list
 * icons: the web host's asset bridge when present, an encoded file:// URL
 * otherwise (backslashes become slashes before encoding). A project without
 * img/system/IconSet.png reports that instead of opening an empty grid.
 */
(function(root) {
    'use strict';

    const ICONS_PER_ROW = 16;
    const ICON_SIZE = 32;
    const tt = text => root.I18n ? root.I18n.tText(text) : text;

    function imageUrl(filePath) {
        return root.RPGReactorAssetUrl
            ? root.RPGReactorAssetUrl(filePath)
            : encodeURI('file://' + String(filePath).replace(/\\/g, '/'))
                .replace(/#/g, '%23').replace(/\?/g, '%3F');
    }

    function iconSetPathFor(projectPath) {
        if (!projectPath) return null;
        if (typeof require === 'function') {
            try { return require('path').join(projectPath, 'img', 'system', 'IconSet.png'); } catch (e) { /* browser */ }
        }
        return String(projectPath).replace(/[\\/]+$/, '') + '/img/system/IconSet.png';
    }

    // Decoded sheets by path. Previews share one load; the picker itself
    // always reloads so an edited IconSet.png shows its current contents.
    const sheets = new Map();
    function loadSheet(iconSetPath, fresh) {
        if (fresh || !sheets.has(iconSetPath)) {
            sheets.set(iconSetPath, new Promise((resolve, reject) => {
                const img = new Image();
                img.onload = () => resolve(img);
                img.onerror = () => {
                    sheets.delete(iconSetPath);
                    reject(new Error('IconSet.png could not be loaded: ' + iconSetPath));
                };
                img.src = imageUrl(iconSetPath);
            }));
        }
        return sheets.get(iconSetPath);
    }

    function reportMissing() {
        const message = tt('IconSet.png was not found in img/system.');
        const ui = root.reactor && root.reactor.uiManager;
        if (ui && typeof ui.showAlert === 'function') ui.showAlert(tt('Select Icon'), message);
        else if (typeof alert === 'function') alert(message);
    }

    function iconCount(img) {
        return Math.ceil(img.height / ICON_SIZE) * ICONS_PER_ROW;
    }

    function drawIcon(canvas, img, index) {
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const i = Math.max(0, Math.floor(Number(index) || 0));
        if (!img || i >= iconCount(img)) return;
        const col = i % ICONS_PER_ROW;
        const row = Math.floor(i / ICONS_PER_ROW);
        ctx.drawImage(img, col * ICON_SIZE, row * ICON_SIZE, ICON_SIZE, ICON_SIZE, 0, 0, canvas.width, canvas.height);
    }

    /**
     * Open the picker over the sheet at iconSetPath.
     * @param {number} currentIconIndex
     * @param {function(number)} onSelectCallback - called with the chosen index on OK.
     * @param {string} iconSetPath
     * @param {{zIndex?: number}} [options]
     */
    function show(currentIconIndex, onSelectCallback, iconSetPath, options = {}) {
        const zIndex = options.zIndex || 10000;
        const modal = document.createElement('div');
        modal.className = 'rr-icon-picker-overlay';
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background-color: rgba(0, 0, 0, 0.8);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: ${zIndex};
        `;

        const container = document.createElement('div');
        container.style.cssText = `
            background-color: var(--color-bg-surface);
            border: 1px solid var(--color-border);
            border-radius: 8px;
            max-width: 90vw;
            max-height: 80vh;
            display: flex;
            flex-direction: column;
        `;

        const title = document.createElement('h2');
        title.textContent = tt('Select Icon');
        title.style.cssText = 'margin: 0; padding: 20px 20px 16px 20px; color: var(--color-text-strong); font-size: 16px;';
        container.appendChild(title);

        const canvasContainer = document.createElement('div');
        canvasContainer.style.cssText = `
            flex: 1;
            overflow-y: auto;
            overflow-x: hidden;
            padding: 0 20px;
        `;

        const canvas = document.createElement('canvas');
        canvas.style.cssText = `
            display: block;
            border: 1px solid var(--color-border);
            cursor: pointer;
            image-rendering: pixelated;
            margin: 0 auto;
        `;
        canvasContainer.appendChild(canvas);
        container.appendChild(canvasContainer);

        const bottomSection = document.createElement('div');
        bottomSection.style.cssText = `
            background-color: var(--color-bg-panel);
            border-top: 1px solid var(--color-border);
            padding: 16px 20px;
        `;

        const selectedInfo = document.createElement('div');
        selectedInfo.style.cssText = 'margin: 0 0 16px 0; color: var(--color-text-strong); font-size: 13px;';
        selectedInfo.textContent = `${tt('Selected Icon:')} ${currentIconIndex}`;
        bottomSection.appendChild(selectedInfo);

        const buttonContainer = document.createElement('div');
        buttonContainer.style.cssText = 'display: flex; gap: 8px; justify-content: flex-end;';

        // Captured, so a field or grid cell with focus cannot swallow the key
        // first, and removed on close so a stale picker cannot answer for the
        // one on screen.
        const onKey = event => {
            if (event.key === 'Escape') {
                event.stopPropagation();
                close();
            }
        };
        const close = () => {
            document.removeEventListener('keydown', onKey, true);
            if (modal.parentNode) modal.parentNode.removeChild(modal);
        };
        document.addEventListener('keydown', onKey, true);

        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = tt('Cancel');
        cancelBtn.className = 'rr-btn-secondary';
        cancelBtn.onclick = close;

        const okBtn = document.createElement('button');
        okBtn.textContent = tt('OK');
        okBtn.className = 'rr-button-primary';
        okBtn.onmouseenter = () => { okBtn.style.backgroundColor = 'var(--color-accent-muted)'; };
        okBtn.onmouseleave = () => { okBtn.style.backgroundColor = 'var(--color-accent)'; };

        let selectedIconIndex = Math.max(0, Math.floor(Number(currentIconIndex) || 0));

        okBtn.onclick = () => {
            onSelectCallback(selectedIconIndex);
            close();
        };

        buttonContainer.appendChild(cancelBtn);
        buttonContainer.appendChild(okBtn);
        bottomSection.appendChild(buttonContainer);
        container.appendChild(bottomSection);

        modal.appendChild(container);
        document.body.appendChild(modal);

        loadSheet(iconSetPath, true).then(img => {
            if (!modal.parentNode) return;
            const scale = 2; // Icons at 2x for easier selection
            const imgRows = Math.ceil(img.height / ICON_SIZE);
            const maxIndex = imgRows * ICONS_PER_ROW - 1;
            canvas.width = ICONS_PER_ROW * ICON_SIZE * scale;
            canvas.height = imgRows * ICON_SIZE * scale;

            const ctx = canvas.getContext('2d');

            // The sheet is drawn once to an offscreen canvas; a selection
            // change copies it back and strokes the highlight.
            const cachedIconSheet = document.createElement('canvas');
            cachedIconSheet.width = canvas.width;
            cachedIconSheet.height = canvas.height;
            const cacheCtx = cachedIconSheet.getContext('2d');
            for (let row = 0; row < imgRows; row++) {
                for (let col = 0; col < ICONS_PER_ROW; col++) {
                    cacheCtx.drawImage(
                        img,
                        col * ICON_SIZE, row * ICON_SIZE,
                        ICON_SIZE, ICON_SIZE,
                        col * ICON_SIZE * scale, row * ICON_SIZE * scale,
                        ICON_SIZE * scale, ICON_SIZE * scale
                    );
                }
            }

            const drawSelection = (iconIndex) => {
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(cachedIconSheet, 0, 0);
                const col = iconIndex % ICONS_PER_ROW;
                const row = Math.floor(iconIndex / ICONS_PER_ROW);
                ctx.strokeStyle = (root.ThemeColors && root.ThemeColors.resolve)
                    ? root.ThemeColors.resolve('--color-accent-bright', '#ffd700') : '#ffd700';
                ctx.lineWidth = 3;
                ctx.strokeRect(
                    col * ICON_SIZE * scale + 1.5,
                    row * ICON_SIZE * scale + 1.5,
                    ICON_SIZE * scale - 3,
                    ICON_SIZE * scale - 3
                );
            };

            selectedIconIndex = Math.min(selectedIconIndex, maxIndex);
            drawSelection(selectedIconIndex);

            canvas.onclick = (e) => {
                const rect = canvas.getBoundingClientRect();
                const x = e.clientX - rect.left;
                const y = e.clientY - rect.top;
                const col = Math.floor(x / (ICON_SIZE * scale));
                const row = Math.floor(y / (ICON_SIZE * scale));
                // A click in the border or past the sheet picks nothing.
                if (col < 0 || col >= ICONS_PER_ROW || row < 0 || row >= imgRows) return;
                selectedIconIndex = Math.min(row * ICONS_PER_ROW + col, maxIndex);
                selectedInfo.textContent = `${tt('Selected Icon:')} ${selectedIconIndex}`;
                drawSelection(selectedIconIndex);
            };
        }).catch(() => {
            close();
            reportMissing();
        });

        modal.onclick = (e) => {
            // A click on the backdrop no longer closes the dialog: an accidental
            // click beside it must never cost in-progress work. Close deliberately.
        };
        return modal;
    }

    /**
     * A field showing the icon, its index, and a Change... button.
     * @param {object} options
     * @param {string|number} options.value - current index.
     * @param {?string} options.iconSetPath - the project's IconSet.png; null disables the button.
     * @param {function(string)} options.onChange - receives the new index as a string.
     * @param {string} [options.inputStyle] - cssText for the index input.
     * @param {number} [options.zIndex] - overlay z-index for the picker.
     */
    function createField(options) {
        const { value, iconSetPath, onChange, inputStyle, zIndex } = options;
        const row = document.createElement('div');
        row.className = 'rr-icon-field';
        row.style.cssText = 'display:flex;align-items:center;gap:6px;min-width:0;';

        const preview = document.createElement('canvas');
        preview.width = ICON_SIZE;
        preview.height = ICON_SIZE;
        preview.style.cssText = 'width:32px;height:32px;flex-shrink:0;border:1px solid var(--color-border);border-radius:3px;background:var(--color-bg-deep);image-rendering:pixelated;';

        const input = document.createElement('input');
        input.type = 'text';
        input.inputMode = 'numeric';
        input.value = String(Math.max(0, Math.floor(Number(value) || 0)));
        input.style.cssText = (inputStyle || '') + 'width:72px;flex:0 0 72px;';

        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = tt('Change...');
        button.className = 'rr-btn-browse';
        button.disabled = !iconSetPath;

        const repaint = () => {
            if (!iconSetPath) return;
            loadSheet(iconSetPath, false)
                .then(img => drawIcon(preview, img, input.value))
                .catch(() => { /* preview stays empty; the picker reports */ });
        };
        const commit = (index) => {
            const clean = String(Math.max(0, Math.floor(Number(index) || 0)));
            input.value = clean;
            onChange(clean);
            repaint();
        };

        input.addEventListener('change', e => commit(e.target.value));
        button.addEventListener('click', () => {
            if (!iconSetPath) return;
            show(Number(input.value) || 0, index => commit(index), iconSetPath, { zIndex });
        });

        row.appendChild(preview);
        row.appendChild(input);
        row.appendChild(button);
        repaint();
        return row;
    }

    root.RRIconPicker = { show, createField, imageUrl, iconSetPathFor, ICONS_PER_ROW, ICON_SIZE };
})(typeof window !== 'undefined' ? window : globalThis);
