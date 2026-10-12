/**
 * TransferPlayerEditor - Editor for Transfer Player event command (code 201)
 */
class TransferPlayerEditor {
    constructor(databaseManager, projectController) {
        this.databaseManager = databaseManager;
        this.projectController = projectController;
        this.modal = null;
        this.callback = null;
        this.mapId = 1;
        this.x = 0;
        this.y = 0;
        this.direction = 0; // 0=Retain, 2=Down, 4=Left, 6=Right, 8=Up
        this.fadeType = 0; // 0=Black, 1=White, 2=None
    }

    /**
     * How many pixels a tile is on the preview canvas.
     *
     * The preview is drawn by the map canvas, which measures in the project's
     * tile size. Assuming 48 here put the grid and the selection box out of
     * step with the art on a 32-pixel project, and made a click land on the
     * wrong tile.
     */
    tilePixels() {
        return this.projectController?.tilemapManager?.TILE_SIZE || 48;
    }

    /**
     * Show editor for a transfer player command
     * @param {object} command - The command to edit (or null for new)
     * @param {function} callback - Callback when done editing
     */
    show(command, callback) {
        this.callback = callback;

        if (command && command.code === 201) {
            const params = command.parameters;
            // Standard format: [designation, mapId, x, y, direction, fadeType]
            // designation 1 = "by variables": params[1..3] are VARIABLE IDs,
            // which this dialog cannot edit — remember them so OK doesn't
            // rewrite the command into a direct transfer to those raw ids.
            this.designation = params[0] || 0;
            this.variableParams = this.designation !== 0 ? [params[1], params[2], params[3]] : null;
            this.mapId = params[1] || 1;
            this.x = params[2] !== undefined ? params[2] : 0;
            this.y = params[3] !== undefined ? params[3] : 0;
            this.direction = params[4] || 0;
            this.fadeType = params[5] || 0;
        } else {
            this.designation = 0;
            this.variableParams = null;
            this.mapId = 1;
            this.x = 0;
            this.y = 0;
            this.direction = 0;
            this.fadeType = 0;
        }

        if (!this.modal) {
            this.createModal();
        }

        this.renderContent();
        this.modal.style.display = 'flex';
    }

    /**
     * Create modal structure
     */
    createModal() {
        this.modal = document.createElement('div');
        this.modal.className = 'transfer-player-editor-modal';
        this.modal.style.cssText = `
            display: none;
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background-color: rgba(0, 0, 0, 0.7);
            z-index: 10005;
            justify-content: center;
            align-items: center;
        `;

        const container = document.createElement('div');
        container.className = 'transfer-player-container rr-modal';
        container.style.cssText = `width: min(500px, calc(100vw - 24px)); max-height: 92vh;`;

        this.modal.appendChild(container);

        this.modal.addEventListener('click', (e) => {
            // A click on the backdrop no longer closes the dialog: an accidental
            // click beside it must never cost in-progress work. Close deliberately.
        });

        document.body.appendChild(this.modal);
    }

    /**
     * Render modal content
     */
    renderContent() {
        const t = text => window.I18n ? window.I18n.tText(text) : text;
        const container = this.modal.querySelector('.transfer-player-container');
        container.innerHTML = '';

        // Header
        const header = document.createElement('div');
        header.className = 'rr-modal-header';
        header.innerHTML = `
            <div class="rr-modal-title">${t('Transfer Player')}</div>
            <button class="rr-modal-close close-btn" type="button">×</button>
        `;
        container.appendChild(header);

        header.querySelector('.close-btn').addEventListener('click', () => this.close());

        // Content
        const content = document.createElement('div');
        content.style.cssText = `
            padding: 16px;
            display: flex;
            flex-direction: column;
            gap: 12px;
            overflow-y: auto;
            min-height: 0;
        `;

        // Map ID with Browse button
        const mapRow = document.createElement('div');
        mapRow.style.cssText = 'display: flex; align-items: center; gap: 8px;';

        const mapLabel = document.createElement('span');
        mapLabel.textContent = t('Map:');
        mapLabel.style.cssText = 'color: var(--color-text); font-size: 13px; min-width: 80px;';

        const mapInput = document.createElement('input');
        mapInput.type = 'number';
        mapInput.min = 1;
        mapInput.max = 9999;
        mapInput.value = this.mapId;
        mapInput.className = 'map-id-input';
        mapInput.style.cssText = `
            padding: 6px 10px;
            background-color: var(--color-bg-input);
            color: var(--color-text);
            border: 1px solid var(--color-border-input);
            border-radius: 3px;
            font-size: 12px;
            width: 100px;
        `;
        mapInput.addEventListener('input', (e) => {
            this.mapId = parseInt(e.target.value) || 1;
            const mapNameSpan = this.modal.querySelector('.map-name-display');
            if (mapNameSpan) {
                mapNameSpan.textContent = this.getMapName(this.mapId);
            }
        });

        const mapName = document.createElement('span');
        mapName.className = 'map-name-display';
        mapName.style.cssText = 'color: var(--color-text-muted); font-size: 12px; flex: 1;';
        mapName.textContent = this.getMapName(this.mapId);

        const browseBtn = document.createElement('button');
        browseBtn.textContent = t('Browse...');
        browseBtn.style.cssText = `
            padding: 6px 12px;
            background-color: var(--color-accent);
            color: var(--color-accent-on);
            border: none;
            border-radius: 3px;
            cursor: pointer;
            font-size: 12px;
            font-weight: bold;
        `;
        browseBtn.addEventListener('mouseenter', () => { browseBtn.style.backgroundColor = 'var(--color-accent-hover)'; });
        browseBtn.addEventListener('mouseleave', () => { browseBtn.style.backgroundColor = 'var(--color-accent)'; });
        browseBtn.addEventListener('click', () => {
            this.showMapPicker();
        });

        mapRow.appendChild(mapLabel);
        mapRow.appendChild(mapInput);
        mapRow.appendChild(mapName);
        mapRow.appendChild(browseBtn);
        content.appendChild(mapRow);

        // X coordinate
        const xRow = document.createElement('div');
        xRow.style.cssText = 'display: flex; align-items: center; gap: 8px;';

        const xLabel = document.createElement('span');
        xLabel.textContent = t('X:');
        xLabel.style.cssText = 'color: var(--color-text); font-size: 13px; min-width: 80px;';

        const xInput = document.createElement('input');
        xInput.type = 'number';
        xInput.min = 0;
        xInput.max = 999;
        xInput.value = this.x;
        xInput.style.cssText = `
            padding: 6px 10px;
            background-color: var(--color-bg-input);
            color: var(--color-text);
            border: 1px solid var(--color-border-input);
            border-radius: 3px;
            font-size: 12px;
            width: 100px;
        `;
        xInput.addEventListener('input', (e) => {
            this.x = parseInt(e.target.value) || 0;
        });

        xRow.appendChild(xLabel);
        xRow.appendChild(xInput);
        content.appendChild(xRow);

        // Y coordinate
        const yRow = document.createElement('div');
        yRow.style.cssText = 'display: flex; align-items: center; gap: 8px;';

        const yLabel = document.createElement('span');
        yLabel.textContent = t('Y:');
        yLabel.style.cssText = 'color: var(--color-text); font-size: 13px; min-width: 80px;';

        const yInput = document.createElement('input');
        yInput.type = 'number';
        yInput.min = 0;
        yInput.max = 999;
        yInput.value = this.y;
        yInput.style.cssText = `
            padding: 6px 10px;
            background-color: var(--color-bg-input);
            color: var(--color-text);
            border: 1px solid var(--color-border-input);
            border-radius: 3px;
            font-size: 12px;
            width: 100px;
        `;
        yInput.addEventListener('input', (e) => {
            this.y = parseInt(e.target.value) || 0;
        });

        yRow.appendChild(yLabel);
        yRow.appendChild(yInput);
        content.appendChild(yRow);

        // Direction
        const directionRow = document.createElement('div');
        directionRow.style.cssText = 'display: flex; align-items: center; gap: 8px; padding-top: 8px; border-top: 1px solid var(--color-border);';

        const directionLabel = document.createElement('span');
        directionLabel.textContent = t('Direction:');
        directionLabel.style.cssText = 'color: var(--color-text); font-size: 13px; min-width: 80px;';

        const directionSelect = document.createElement('select');
        directionSelect.style.cssText = `
            padding: 6px 10px;
            background-color: var(--color-bg-input);
            color: var(--color-text);
            border: 1px solid var(--color-border-input);
            border-radius: 3px;
            font-size: 12px;
            width: 150px;
        `;
        directionSelect.innerHTML = `
            <option value="0" ${this.direction === 0 ? 'selected' : ''}>${t('Retain')}</option>
            <option value="2" ${this.direction === 2 ? 'selected' : ''}>${t('Down')}</option>
            <option value="4" ${this.direction === 4 ? 'selected' : ''}>${t('Left')}</option>
            <option value="6" ${this.direction === 6 ? 'selected' : ''}>${t('Right')}</option>
            <option value="8" ${this.direction === 8 ? 'selected' : ''}>${t('Up')}</option>
        `;
        directionSelect.addEventListener('change', (e) => {
            this.direction = parseInt(e.target.value);
        });

        directionRow.appendChild(directionLabel);
        directionRow.appendChild(directionSelect);
        content.appendChild(directionRow);

        // Fade Type
        const fadeRow = document.createElement('div');
        fadeRow.style.cssText = 'display: flex; align-items: center; gap: 8px;';

        const fadeLabel = document.createElement('span');
        fadeLabel.textContent = t('Fade:');
        fadeLabel.style.cssText = 'color: var(--color-text); font-size: 13px; min-width: 80px;';

        const fadeSelect = document.createElement('select');
        fadeSelect.style.cssText = `
            padding: 6px 10px;
            background-color: var(--color-bg-input);
            color: var(--color-text);
            border: 1px solid var(--color-border-input);
            border-radius: 3px;
            font-size: 12px;
            width: 150px;
        `;
        fadeSelect.innerHTML = `
            <option value="0" ${this.fadeType === 0 ? 'selected' : ''}>${t('Black')}</option>
            <option value="1" ${this.fadeType === 1 ? 'selected' : ''}>${t('White')}</option>
            <option value="2" ${this.fadeType === 2 ? 'selected' : ''}>${t('None')}</option>
        `;
        fadeSelect.addEventListener('change', (e) => {
            this.fadeType = parseInt(e.target.value);
        });

        fadeRow.appendChild(fadeLabel);
        fadeRow.appendChild(fadeSelect);
        content.appendChild(fadeRow);

        container.appendChild(content);

        // Footer
        const footer = document.createElement('div');
        footer.className = 'rr-modal-footer';

        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = t('Cancel');
        cancelBtn.className = 'rr-btn-secondary';
        cancelBtn.addEventListener('click', () => this.close());

        const okBtn = document.createElement('button');
        okBtn.textContent = t('OK');
        okBtn.className = 'rr-button-primary';
        okBtn.addEventListener('click', () => this.save());

        footer.appendChild(cancelBtn);
        footer.appendChild(okBtn);
        container.appendChild(footer);
    }

    /**
     * Show map picker with visual preview. It opens scrolled to the chosen
     * tile, and a 3D map is drawn as the editor's view of it from above.
     * @param {object} options - `mapId`, `x`, `y`, `title`, `onConfirm(location)`,
     *   `onCancel()`, and `thisMapOnly` (the map list is left out: the tile is on that map)
     */
    showMapPicker(options = {}) {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        const currentProject = this.projectController.getCurrentProject ?
            this.projectController.getCurrentProject() :
            this.projectController.currentProject;
        const firstMapId = currentProject?.maps?.find(map => map?.id)?.id || 1;
        const requestedMapId = Number(options.mapId ?? this.mapId);
        const selection = {
            mapId: requestedMapId > 0 ? requestedMapId : firstMapId,
            x: Math.max(0, Math.trunc(Number(options.x ?? this.x) || 0)),
            y: Math.max(0, Math.trunc(Number(options.y ?? this.y) || 0))
        };
        const expandedMapIds = new Set((currentProject?.maps || [])
            .filter(map => map?.id && map.expanded)
            .map(map => map.id));
        const picker = document.createElement('div');
        picker.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background-color: rgba(0, 0, 0, 0.85);
            z-index: 10006;
            display: flex;
            justify-content: center;
            align-items: center;
        `;

        const container = document.createElement('div');
        container.className = 'rr-modal';
        container.style.cssText = `width: min(1400px, calc(100vw - 24px)); max-height: 95vh;`;

        // Header
        const header = document.createElement('div');
        header.className = 'rr-modal-header';
        header.innerHTML = `
            <div class="rr-modal-title">${options.title || tt('Select Map & Position')}</div>
            <button class="close-picker" style="background: none; border: none; color: var(--color-text-strong); font-size: 20px; cursor: pointer;">×</button>
        `;

        // Content area - split into map tree (left) and preview (right)
        const content = document.createElement('div');
        content.style.cssText = `
            display: flex;
            flex: 1;
            overflow: hidden;
        `;

        // Right side - Map preview (create first so we have canvas reference)
        const previewSection = document.createElement('div');
        previewSection.style.cssText = `
            flex: 1;
            min-width: 0;
            display: flex;
            flex-direction: column;
            padding: 16px;
            gap: 8px;
        `;

        // Zoom controls
        const zoomControls = document.createElement('div');
        zoomControls.style.cssText = `
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 8px;
            background-color: var(--color-bg-list-item);
            border: 1px solid var(--color-border);
            border-radius: 3px;
        `;

        let zoomLevel = 1.0;

        const zoomOutBtn = document.createElement('button');
        zoomOutBtn.textContent = '−';
        zoomOutBtn.style.cssText = `
            padding: 4px 12px;
            background-color: var(--color-bg-panel);
            color: var(--color-text);
            border: 1px solid var(--color-border-input);
            border-radius: 3px;
            cursor: pointer;
            font-size: 16px;
            font-weight: bold;
        `;

        const zoomLabel = document.createElement('span');
        zoomLabel.textContent = '100%';
        zoomLabel.style.cssText = 'color: var(--color-text); font-size: 12px; min-width: 50px; text-align: center;';

        const zoomInBtn = document.createElement('button');
        zoomInBtn.textContent = '+';
        zoomInBtn.style.cssText = `
            padding: 4px 12px;
            background-color: var(--color-bg-panel);
            color: var(--color-text);
            border: 1px solid var(--color-border-input);
            border-radius: 3px;
            cursor: pointer;
            font-size: 16px;
            font-weight: bold;
        `;

        const zoomResetBtn = document.createElement('button');
        zoomResetBtn.textContent = tt('Reset');
        zoomResetBtn.style.cssText = `
            padding: 4px 12px;
            background-color: var(--color-bg-panel);
            color: var(--color-text);
            border: 1px solid var(--color-border-input);
            border-radius: 3px;
            cursor: pointer;
            font-size: 12px;
        `;

        zoomControls.appendChild(zoomOutBtn);
        zoomControls.appendChild(zoomLabel);
        zoomControls.appendChild(zoomInBtn);
        zoomControls.appendChild(zoomResetBtn);

        // A 3D map is shown standing, as the map view shows it, or flat from above; the choice is kept for the next time.
        const viewToggle = document.createElement('div');
        viewToggle.className = 'map-picker-view';
        viewToggle.style.display = 'none';
        const viewButtons = {};
        for (const [mode, label] of [['3d', '3D'], ['flat', 'Top Down']]) {
            const button = document.createElement('button');
            button.type = 'button';
            button.textContent = tt(label);
            button.dataset.view = mode;
            button.addEventListener('click', () => setView(mode));
            viewToggle.appendChild(button);
            viewButtons[mode] = button;
        }
        zoomControls.appendChild(viewToggle);
        const stage3d = document.createElement('div');
        stage3d.className = 'map-picker-3d';
        stage3d.style.display = 'none';

        previewSection.appendChild(zoomControls);

        // Map preview container with scroll
        const previewContainer = document.createElement('div');
        previewContainer.style.cssText = `
            flex: 1;
            min-height: 0;
            min-width: 0;
            overflow: auto;
            background-color: #0a0a0a;
            border: 1px solid var(--color-border);
            border-radius: 3px;
            position: relative;
            scrollbar-width: thin;
            scrollbar-color: var(--color-border-input) var(--color-bg-input);
        `;

        // Coordinates display: one line in the view's upper right corner, over the map. Its margins add up to its
        // own height, so it takes no room and the map starts at the view's top edge; a click passes through it.
        const coordsDisplay = document.createElement('div');
        coordsDisplay.className = 'coords-display';
        coordsDisplay.style.cssText = `
            position: sticky;
            top: 8px;
            left: calc(100% - 148px);
            box-sizing: border-box;
            width: 132px;
            height: 28px;
            line-height: 16px;
            padding: 6px 8px;
            background-color: rgba(0, 0, 0, 0.8);
            color: var(--color-text-strong);
            font-size: 12px;
            font-family: monospace;
            text-align: center;
            white-space: nowrap;
            border-radius: 3px;
            z-index: 10;
            margin: 8px 8px -36px 8px;
            pointer-events: none;
        `;
        coordsDisplay.textContent = `X: ${selection.x}, Y: ${selection.y}`;
        previewContainer.appendChild(coordsDisplay);

        const mapCanvas = document.createElement('canvas');
        mapCanvas.width = 800;
        mapCanvas.height = 600;
        mapCanvas.style.cssText = `
            image-rendering: pixelated;
            image-rendering: -moz-crisp-edges;
            image-rendering: crisp-edges;
            cursor: crosshair;
            display: block;
        `;

        // Container to hold the scaled canvas
        const canvasContainer = document.createElement('div');
        canvasContainer.style.cssText = `
            display: inline-block;
        `;
        canvasContainer.appendChild(mapCanvas);

        // Zoom functions
        const updateZoom = () => {
            // Simply set the CSS display size based on zoom
            mapCanvas.style.width = `${mapCanvas.width * zoomLevel}px`;
            mapCanvas.style.height = `${mapCanvas.height * zoomLevel}px`;
            zoomLabel.textContent = `${Math.round(zoomLevel * 100)}%`;
        };

        // The zoom at which the whole map is in view (1 for a map that fits as it is), and the map last shown whole.
        let fitLevel = 1, fittedMap = 0;
        // Zoomed, the chosen tile stays in the middle of the view.
        zoomInBtn.addEventListener('click', () => {
            zoomLevel = Math.min(zoomLevel < 0.25 ? 0.25 : zoomLevel + 0.25, 3.0);
            updateZoom();
            scrollToSelection();
        });

        zoomOutBtn.addEventListener('click', () => {
            zoomLevel = Math.max(zoomLevel - 0.25, Math.min(0.25, fitLevel));
            updateZoom();
            scrollToSelection();
        });

        zoomResetBtn.addEventListener('click', () => {
            zoomLevel = 1.0;
            updateZoom();
            scrollToSelection();
        });

        previewContainer.appendChild(canvasContainer);
        previewSection.appendChild(previewContainer);
        previewSection.appendChild(stage3d);

        // The flat picture with the chosen tile marked on it.
        const redrawSelection = () => {
            if (!baseMapCanvas || !(baseMapCanvas.width > 0 && baseMapCanvas.height > 0)) return;
            const ctx = mapCanvas.getContext('2d'), previousOperation = ctx.globalCompositeOperation;
            ctx.globalCompositeOperation = 'copy';
            ctx.drawImage(baseMapCanvas, 0, 0);
            ctx.globalCompositeOperation = previousOperation;
            this.drawSelectionOverlay(mapCanvas, selection);
        };
        const stand3d = typeof MapPicker3D !== 'undefined' && MapPicker3D.available() ? new MapPicker3D(stage3d, (x, y) => {
            selection.x = x;
            selection.y = y;
            coordsDisplay.textContent = `X: ${x}, Y: ${y}`;
            redrawSelection();
        }) : null;
        // Whether the map shown is a 3D map, which view is asked for, and the map standing in the 3D view (0: none).
        let standing = false, shown3d = 0;
        let viewMode = '3d';
        try { if (localStorage.getItem('rr.mapPicker.view') === 'flat') viewMode = 'flat'; } catch (error) { /* the 3D view */ }
        const applyView = () => {
            const in3d = standing && !!stand3d && viewMode === '3d';
            viewToggle.style.display = standing && stand3d ? 'flex' : 'none';
            // (Not the primary button's look: OK is the dialog's one main action.)
            for (const [mode, button] of Object.entries(viewButtons)) {
                const on = (mode === '3d') === in3d;
                button.className = 'rr-btn-secondary' + (on ? ' is-on' : '');
                button.setAttribute('aria-pressed', on ? 'true' : 'false');
            }
            previewContainer.style.display = in3d ? 'none' : '';
            stage3d.style.display = in3d ? '' : 'none';
            for (const control of [zoomOutBtn, zoomLabel, zoomInBtn, zoomResetBtn]) control.style.visibility = in3d ? 'hidden' : '';
            if (in3d) {
                if (shown3d !== selection.mapId) { shown3d = selection.mapId; stand3d.show(selection.mapId, selection); }
                else stand3d.select(selection.x, selection.y);
            } else {
                // The standing world is let go while the flat picture is up: it is a whole map on the GPU.
                if (stand3d && shown3d) { stand3d.dispose(); shown3d = 0; }
                updateZoom();
                scrollToSelection();
            }
        };
        const setView = mode => {
            viewMode = mode === 'flat' ? 'flat' : '3d';
            try { localStorage.setItem('rr.mapPicker.view', viewMode); } catch (error) { /* kept for this picker only */ }
            applyView();
        };

        // Left side - Map tree (create after canvas so we can reference it)
        const mapTreeSection = document.createElement('div');
        mapTreeSection.style.cssText = `
            width: 300px;
            display: flex;
            flex-direction: column;
            border-right: 1px solid var(--color-border);
            background-color: var(--color-bg-list-item);
        `;

        const mapTreeHeader = document.createElement('div');
        mapTreeHeader.textContent = tt('Maps');
        mapTreeHeader.style.cssText = `
            padding: 12px;
            background-color: var(--color-bg-panel);
            border-bottom: 1px solid var(--color-border);
            color: var(--color-text-strong);
            font-size: 13px;
            font-weight: bold;
        `;
        mapTreeSection.appendChild(mapTreeHeader);

        // Search box
        const searchContainer = document.createElement('div');
        searchContainer.style.cssText = `
            padding: 8px;
            background-color: var(--color-bg-list-item);
            border-bottom: 1px solid var(--color-border);
        `;

        const searchInput = document.createElement('input');
        searchInput.type = 'text';
        searchInput.placeholder = tt('Search maps...');
        searchInput.style.cssText = `
            width: 100%;
            padding: 6px 10px;
            background-color: var(--color-bg-input);
            color: var(--color-text);
            border: 1px solid var(--color-border-input);
            border-radius: 3px;
            font-size: 12px;
            box-sizing: border-box;
        `;

        searchContainer.appendChild(searchInput);
        mapTreeSection.appendChild(searchContainer);

        // Map tree list
        const mapTreeList = document.createElement('div');
        mapTreeList.className = 'map-tree-list';
        mapTreeList.style.cssText = `
            flex: 1;
            overflow-y: auto;
            padding: 0;
        `;

        // Build map tree using same logic as main editor
        // Build tree will be called after loadMap is defined
        let buildTreeCalled = false;

        // Search functionality
        searchInput.addEventListener('input', (e) => {
            const searchTerm = e.target.value.toLowerCase();
            this.buildMapTreeForPicker(
                mapTreeList,
                mapCanvas,
                coordsDisplay,
                searchInput,
                loadMap,
                selection,
                expandedMapIds
            );
            const items = mapTreeList.querySelectorAll('.tree-item');

            items.forEach(item => {
                const text = item.textContent.toLowerCase();
                if (searchTerm === '' || text.includes(searchTerm)) {
                    item.style.display = '';
                } else {
                    item.style.display = 'none';
                }
            });
        });

        mapTreeSection.appendChild(mapTreeList);

        // Add sections to content (tree on left, preview on right)
        if (!options.thisMapOnly) content.appendChild(mapTreeSection);
        content.appendChild(previewSection);

        container.appendChild(header);
        container.appendChild(content);

        // Footer
        const footer = document.createElement('div');
        footer.className = 'rr-modal-footer';

        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = tt('Cancel');
        cancelBtn.className = 'rr-btn-secondary';
        let confirmed = false;
        // The picker's keys: the focus starts inside and stays there, Escape is Cancel, Enter is OK.
        const keys = typeof RRKeyboardNavigation !== 'undefined' && RRKeyboardNavigation.modal ? RRKeyboardNavigation.modal(picker, { onEscape: () => closePicker() }) : null;
        const closePicker = () => {
            if (!picker.isConnected) return;
            if (stand3d) stand3d.dispose();
            if (keys) { keys.leave(); if (typeof keys.dispose === 'function') keys.dispose(); }
            document.removeEventListener('keydown', onPageKey);
            picker.remove();
            if (!confirmed && options.onCancel) options.onCancel();
        };
        cancelBtn.addEventListener('click', closePicker);

        const okBtn = document.createElement('button');
        okBtn.textContent = tt('OK');
        okBtn.className = 'rr-button-primary';
        const onKey = event => {
            if (okBtn.disabled || !TransferPlayerEditor.confirmsOn(event)) return;
            event.preventDefault();
            okBtn.click();
        };
        picker.addEventListener('keydown', onKey);
        // A click on the picture leaves the focus on the page: Enter there is the picker's.
        const onPageKey = event => { if (event.target === document.body && picker.isConnected) onKey(event); };
        document.addEventListener('keydown', onPageKey);
        okBtn.addEventListener('click', () => {
            const confirmedLocation = { ...selection };
            confirmed = true;
            if (options.onConfirm) {
                options.onConfirm(confirmedLocation);
            } else {
                this.mapId = confirmedLocation.mapId;
                this.x = confirmedLocation.x;
                this.y = confirmedLocation.y;
                this.renderContent();
            }
            closePicker();
        });

        footer.appendChild(cancelBtn);
        footer.appendChild(okBtn);
        container.appendChild(footer);

        picker.appendChild(container);

        // Load map and render preview
        // Cache the base map image to avoid re-rendering on every click
        let baseMapCanvas = null;
        let mapLoadGeneration = 0;

        const loadMap = async (mapId) => {
            const generation = ++mapLoadGeneration;
            okBtn.disabled = true;
            mapCanvas.style.pointerEvents = 'none';
            const renderedCanvas = document.createElement('canvas');
            renderedCanvas.width = mapCanvas.width;
            renderedCanvas.height = mapCanvas.height;
            await this.renderMapPreview(renderedCanvas, coordsDisplay, mapId);
            if (generation !== mapLoadGeneration) return false;
            const stood = await this.drawTopDown3D(renderedCanvas, mapId);
            if (generation !== mapLoadGeneration) return false;
            standing = !!stood;

            mapCanvas.width = renderedCanvas.width;
            mapCanvas.height = renderedCanvas.height;
            mapCanvas.getContext('2d').drawImage(renderedCanvas, 0, 0);

            // Cache the base map (tiles + events + grid, but WITHOUT selection)
            // The current canvas has grid but no selection
            baseMapCanvas = document.createElement('canvas');
            baseMapCanvas.width = mapCanvas.width;
            baseMapCanvas.height = mapCanvas.height;
            const baseCtx = baseMapCanvas.getContext('2d');
            baseCtx.drawImage(mapCanvas, 0, 0);

            // Now draw the selection on top
            this.drawSelectionOverlay(mapCanvas, selection);

            // A map larger than the view is shown whole when it is first picked: the place is found by the lie of
            // the map, then zoomed into.
            const fit = Math.min(previewContainer.clientWidth / mapCanvas.width, previewContainer.clientHeight / mapCanvas.height);
            fitLevel = fit > 0 && fit < 1 ? Math.max(0.05, Math.floor(fit * 100) / 100) : 1;
            if (fittedMap !== mapId) { fittedMap = mapId; if (fitLevel < 1) zoomLevel = fitLevel; }
            updateZoom();
            scrollToSelection();
            applyView();
            okBtn.disabled = false;
            mapCanvas.style.pointerEvents = '';
            // OK could not hold the focus while it was off: it takes it now, unless the focus is elsewhere in the picker.
            // The picker is entered once, so the focus still goes back to what opened it.
            if (keys && !picker.contains(document.activeElement)) okBtn.focus({ preventScroll: true });
            return true;
        };

        // The chosen tile in the middle of the view.
        const scrollToSelection = () => {
            const to = TransferPlayerEditor.scrollFor(selection, this.tilePixels(), zoomLevel, previewContainer.clientWidth, previewContainer.clientHeight);
            previewContainer.scrollLeft = to.left;
            previewContainer.scrollTop = to.top;
        };

        // Click on map to select position
        mapCanvas.addEventListener('click', (e) => {
            const rect = mapCanvas.getBoundingClientRect();
            const clickX = e.clientX - rect.left;
            const clickY = e.clientY - rect.top;

            // Account for zoom level when calculating tile coordinates
            const tileSize = this.tilePixels();
            const adjustedX = clickX / zoomLevel;
            const adjustedY = clickY / zoomLevel;

            selection.x = Math.floor(adjustedX / tileSize);
            selection.y = Math.floor(adjustedY / tileSize);

            coordsDisplay.textContent = `X: ${selection.x}, Y: ${selection.y}`;

            // Restore base map and redraw selection (no re-rendering needed)
            redrawSelection();
        });

        // Mousemove to show hover tile
        mapCanvas.addEventListener('mousemove', (e) => {
            const rect = mapCanvas.getBoundingClientRect();
            const hoverX = e.clientX - rect.left;
            const hoverY = e.clientY - rect.top;

            const tileSize = this.tilePixels();
            const tileX = Math.floor(hoverX / tileSize);
            const tileY = Math.floor(hoverY / tileSize);

            // Could add hover highlight here if desired
        });

        header.querySelector('.close-picker').addEventListener('click', closePicker);

        picker.addEventListener('click', (e) => {
            if (e.target === picker) {
                closePicker();
            }
        });

        document.body.appendChild(picker);
        if (keys) keys.enter(okBtn);

        // Build the map tree now that loadMap is defined
        this.buildMapTreeForPicker(
            mapTreeList,
            mapCanvas,
            coordsDisplay,
            searchInput,
            loadMap,
            selection,
            expandedMapIds
        );

        // Initial load
        loadMap(selection.mapId);
        return { modal: picker, close: closePicker };
    }

    /** Where the preview scrolls to so the chosen tile is in the middle of a view `viewWidth` × `viewHeight`: `{ left, top }` in pixels. */
    static scrollFor(selection, tile, zoom, viewWidth, viewHeight) {
        const size = tile * zoom;
        return {
            left: Math.max(0, (selection.x + 0.5) * size - viewWidth / 2),
            top: Math.max(0, (selection.y + 0.5) * size - viewHeight / 2)
        };
    }

    /** Whether a key press in the picker is OK: Enter anywhere but on a button or in a field, which use it themselves. */
    static confirmsOn(event) {
        if (!event || event.key !== 'Enter' || event.defaultPrevented || event.isComposing || event.shiftKey || event.ctrlKey || event.altKey || event.metaKey) return false;
        const tag = String((event.target && event.target.tagName) || '').toUpperCase();
        return tag !== 'BUTTON' && tag !== 'INPUT' && tag !== 'SELECT' && tag !== 'TEXTAREA';
    }

    /**
     * How a plan draws the pieces: the kinds a storey tall, the ones narrower
     * than their cell (`[u0, v0, u1, v1]` in the cell, before its turn), the
     * ones left out, and the shapes drawn round or as a ring.
     */
    static get PLAN_PIECES() {
        return {
            tall: ['wall', 'doorway', 'window', 'pillar'],
            part: { fence: [0, 0.42, 1, 0.58], door: [0, 0.44, 1, 0.56], pillar: [0.24, 0.24, 0.76, 0.76] },
            skip: ['glass', 'ladder'],
            round: ['cylinder', 'capsule', 'cone', 'dome', 'sphere', 'dish', 'hull', 'spike', 'rock'],
            ring: ['tube', 'ring']
        };
    }

    /**
     * A 3D map seen from straight above, worked out from its data alone (the
     * map and its sidecar, `mapData.reactor3d`): what the position picker
     * draws where the flat preview has no tiles. Null for a map that is not 3D.
     *
     *   floor    the room's floor image (img/parallaxes), '' when it has none
     *   bare     1 for a cell with no tile: the ground is drawn there
     *   shade    how light the ground is, a cell: 1 on the flat, more on a slope that faces the upper left, less on one that faces away
     *   cliff    `{ material, tint, cells }`: 1 in `cells` where the ground is steeper than the room's cliff slope
     *   grounds  the painted ground types, `[{ material, tint, scale, levels }]`, levels 0-9 a cell
     *   water    0, or 1 + the place in `waters` of the sheet that lies over the cell; `waters` is `[{ colour }]`
     *   marks    the pieces, lowest top first: `{ form, x, y, w, d, angle, thick, material, tint, scale }` in tiles;
     *            "cell" is the rectangle from (x, y); "box", "round" and "ring" stand round their middle (x, y), turned by `angle` degrees
     *   props    the models, `[{ x, y, r }]`, by their middle
     */
    static topDownPlan(mapData) {
        const local = name => (typeof require === 'function' && typeof module !== 'undefined' ? require('../../utils/' + name) : null);
        const E = (typeof RRMapElevation !== 'undefined' && RRMapElevation) || local('MapElevation.js');
        const sidecar = mapData && mapData.reactor3d;
        if (!E || !sidecar || typeof sidecar !== 'object' || !/<3d>/i.test(String(mapData.note || ''))) return null;
        const width = Math.floor(Number(mapData.width)) || 0, height = Math.floor(Number(mapData.height)) || 0;
        if (!(width > 0 && height > 0)) return null;
        const size = width * height, kinds = TransferPlayerEditor.PLAN_PIECES;

        const bare = new Uint8Array(size).fill(1);
        const tiles = Array.isArray(mapData.data) ? mapData.data : [];
        for (let i = 0; i < size; i++) for (let z = 0; z < 4; z++) if (tiles[z * size + i] > 0) { bare[i] = 0; break; }

        // The ground's shape: lit from the upper left, rock where it is steep.
        const room = E.room(mapData), steep = E.roomCliff(sidecar.room);
        const shade = new Float32Array(size).fill(1), cliffCells = new Uint8Array(size);
        const grid = E.terrain(mapData);
        if (grid) {
            const stride = width + 1, at = i => Number(grid[i]) || 0;
            const limit = Math.tan(steep.slope * Math.PI / 180), light = [-0.468, 0.749, -0.468];
            for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
                const a = at(y * stride + x), b = at(y * stride + x + 1), c = at((y + 1) * stride + x), d = at((y + 1) * stride + x + 1);
                const dx = (b + d - a - c) / 2, dy = (c + d - a - b) / 2;
                if (!dx && !dy) continue;
                const lit = (-dx * light[0] + light[1] - dy * light[2]) / (Math.hypot(dx, 1, dy) * light[1]);
                shade[y * width + x] = Math.max(0.35, Math.min(1.5, lit));
                if (steep.name && Math.hypot(dx, dy) >= limit) cliffCells[y * width + x] = 1;
            }
        }

        const G = (typeof RRMapGround !== 'undefined' && RRMapGround) || local('MapGround.js');
        const grounds = (G ? G.types(mapData) : []).map(type => ({ material: type.material, tint: type.tint || '', scale: type.scale || 4, levels: G.decode(type.paint, size) }))
            .filter(type => type.levels.some(level => level > 0));

        const water = new Uint16Array(size), waters = [];
        for (const sheet of E.water(mapData)) {
            waters.push({ colour: sheet.colour || '' });
            for (let y = sheet.y0; y <= sheet.y1; y++) for (let x = sheet.x0; x <= sheet.x1; x++) if (E.waterCovers(sheet, x, y)) water[y * width + x] = waters.length;
        }

        const marks = [], caps = [];
        let rockTop = 0;
        for (const piece of E.pieces(mapData)) {
            if (kinds.skip.includes(piece.kind) || /^glass/i.test(piece.material)) continue;
            const mark = { form: 'cell', x: 0, y: 0, w: 1, d: 1, angle: 0, thick: 0, material: piece.material, tint: piece.tint || '', scale: 1 };
            let top;
            if (Array.isArray(piece.size)) {
                const offset = Array.isArray(piece.offset) ? piece.offset : [0, 0];
                mark.form = kinds.ring.includes(piece.kind) ? 'ring' : kinds.round.includes(piece.kind) ? 'round' : 'box';
                mark.x = piece.x + 0.5 + offset[0]; mark.y = piece.y + 0.5 + offset[1];
                mark.w = piece.size[0]; mark.d = piece.size[2]; mark.angle = piece.angle || 0;
                if (mark.form === 'ring') mark.thick = Number.isFinite(piece.thick) ? piece.thick : ((E.SHAPE_PARAMS[piece.kind] || {}).thick || 0.3);
                // A rock wears its image five tiles wide, as the map lays it.
                if (piece.kind === 'rock') mark.scale = 5;
                top = piece.z + piece.size[1];
            } else {
                // A part of the cell, turned with the piece: a quarter turn swaps its two axes.
                const [u0, v0, u1, v1] = kinds.part[piece.kind] || [0, 0, 1, 1];
                const across = piece.rot % 2 === 0;
                mark.x = piece.x + (across ? u0 : v0); mark.y = piece.y + (across ? v0 : u0);
                mark.w = across ? u1 - u0 : v1 - v0; mark.d = across ? v1 - v0 : u1 - u0;
                top = piece.z + (kinds.tall.includes(piece.kind) ? 5 : 1);
            }
            marks.push({ mark, top, order: marks.length });
            if (piece.kind !== 'rock') continue;
            rockTop = Math.max(rockTop, top);
            // A capped rock: its top wears the cap ("ground" is the room's floor), the rock shows round it.
            if (piece.cap) {
                const ground = piece.cap === 'ground';
                caps.push(Object.assign({}, mark, { w: mark.w * 0.8, d: mark.d * 0.8, material: ground ? '' : piece.cap, tint: '', scale: ground ? 0 : 3 }));
            }
        }
        // Rocks that touch are one mass: every cap is drawn after every rock, so only the rim round the mass shows.
        for (const cap of caps) marks.push({ mark: cap, top: rockTop, order: marks.length });
        // What stands higher is drawn later; pieces of one height keep the order they were laid in.
        marks.sort((a, b) => a.top - b.top || a.order - b.order);

        const props = E.props(mapData).map(prop => ({ x: prop.x + 0.5, y: prop.y + 0.5, r: Math.max(0.4, Math.min(3, (Number(prop.size) || 4) / 8)) }));
        return { width, height, floor: room.floor || '', bare, shade, cliff: { material: steep.name || '', tint: steep.tint || '', cells: cliffCells },
            grounds, water, waters, marks: marks.map(entry => entry.mark), props };
    }

    /**
     * Draws a plan on a 2D context at `tile` pixels a tile. `fill(material,
     * tint, scale)` gives the fill for a material (`scale` tiles to one image;
     * the material '' is the room's floor). Ground is drawn on bare cells
     * only, so a map's own tiles stay as they are.
     */
    static paintTopDown(ctx, plan, tile, fill) {
        const { width, height } = plan;
        // A run of cells along a row that share a value is one rectangle; 0 draws nothing.
        const runs = (pick, draw) => {
            for (let y = 0; y < height; y++) {
                let from = 0, value = pick(y * width);
                for (let x = 1; x <= width; x++) {
                    const next = x < width ? pick(y * width + x) : -1;
                    if (next === value) continue;
                    if (value) draw(from, y, x - from, value);
                    from = x; value = next;
                }
            }
        };
        const rect = (x, y, w) => ctx.fillRect(x * tile, y * tile, w * tile, tile);
        ctx.save();
        ctx.fillStyle = fill('', '', 0);
        runs(i => plan.bare[i], rect);
        for (const ground of plan.grounds) {
            ctx.fillStyle = fill(ground.material, ground.tint, ground.scale);
            runs(i => (plan.bare[i] ? ground.levels[i] : 0), (x, y, w, level) => { ctx.globalAlpha = level / 9; rect(x, y, w); });
        }
        // The light, in sixteenths: darker or lighter than the flat, never so dark that the ground is lost.
        runs(i => (plan.bare[i] ? Math.round((plan.shade[i] - 1) * 16) : 0), (x, y, w, steps) => {
            ctx.fillStyle = steps < 0 ? '#000000' : '#ffffff';
            ctx.globalAlpha = steps < 0 ? Math.min(0.45, -steps / 16) : Math.min(0.25, steps / 32);
            rect(x, y, w);
        });
        ctx.globalAlpha = 1;
        if (plan.cliff.material) {
            ctx.fillStyle = fill(plan.cliff.material, plan.cliff.tint, 5);
            runs(i => (plan.bare[i] ? plan.cliff.cells[i] : 0), rect);
        }
        ctx.globalAlpha = 0.85;
        runs(i => plan.water[i], (x, y, w, sheet) => { ctx.fillStyle = plan.waters[sheet - 1].colour || '#2f6f96'; rect(x, y, w); });
        ctx.globalAlpha = 1;
        for (const mark of plan.marks) {
            const style = fill(mark.material, mark.tint, mark.scale);
            ctx.fillStyle = style;
            if (mark.form === 'cell') { ctx.fillRect(mark.x * tile, mark.y * tile, mark.w * tile, mark.d * tile); continue; }
            ctx.save();
            ctx.translate(mark.x * tile, mark.y * tile);
            if (mark.angle) ctx.rotate(mark.angle * Math.PI / 180);
            if (mark.form === 'box') ctx.fillRect(-mark.w * tile / 2, -mark.d * tile / 2, mark.w * tile, mark.d * tile);
            else {
                const line = mark.form === 'ring' ? Math.max(1, mark.thick * mark.w * tile / 2) : 0;
                ctx.beginPath();
                ctx.ellipse(0, 0, Math.max(0.5, (mark.w * tile - line) / 2), Math.max(0.5, (mark.d * tile - line) / 2), 0, 0, Math.PI * 2);
                if (line) { ctx.strokeStyle = style; ctx.lineWidth = line; ctx.stroke(); } else ctx.fill();
            }
            ctx.restore();
        }
        // A model is a round mark: what it looks like is not in the map's data.
        ctx.fillStyle = 'rgba(38, 66, 40, 0.8)';
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.lineWidth = 1;
        for (const prop of plan.props) {
            ctx.beginPath();
            ctx.ellipse(prop.x * tile, prop.y * tile, prop.r * tile, prop.r * tile, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
        }
        ctx.restore();
    }

    /** The pixels a tile takes in the plan's own picture: the preview's, fewer on a map so large its picture would not fit a canvas. */
    static planTile(plan, tile) {
        return Math.max(6, Math.min(tile, Math.floor(4096 / Math.max(plan.width, plan.height))));
    }

    /** The map as the picker reads it: the open map as it stands in the editor, any other from its files, with its sidecar. Null when it cannot be read. */
    _mapForPlan(mapId) {
        const tilemap = this.projectController && this.projectController.tilemapManager;
        if (!tilemap) return null;
        const open = tilemap.currentMap;
        if (open && Number(tilemap.currentMapId || open.id) === Number(mapId)) return open;
        try {
            const file = tilemap.path.join(tilemap.projectPath, 'data', `Map${String(mapId).padStart(3, '0')}.json`);
            if (!tilemap.fs.existsSync(file)) return null;
            const mapData = RRJson.parse(tilemap.fs.readFileSync(file));
            mapData.id = Number(mapId);
            tilemap.loadMapSidecar(mapData);
            return mapData;
        } catch (error) {
            console.warn('TransferPlayerEditor: the map could not be read for its picture:', error);
            return null;
        }
    }

    /** An image under the project's img/<folder>, loaded; null when the project has none by that name. */
    _loadProjectImage(folder, name) {
        const tilemap = this.projectController && this.projectController.tilemapManager;
        if (!tilemap || !name || typeof RRAssetFiles === 'undefined') return Promise.resolve(null);
        const url = RRAssetFiles.imageUrlFor(tilemap.path.join(tilemap.projectPath, 'img', folder), name);
        if (!url) return Promise.resolve(null);
        return new Promise(resolve => {
            const image = new Image();
            image.onload = () => resolve(image);
            image.onerror = () => resolve(null);
            image.src = url;
        });
    }

    /**
     * Draws a 3D map from straight above over a preview that
     * `renderMapPreview` drew (black where the map has no tiles): its ground,
     * water, pieces and models, read from the map's data, so any map of the
     * project is drawn whichever map and view the editor is showing.
     * Resolves whether it drew.
     */
    async drawTopDown3D(canvas, mapId) {
        const plan = TransferPlayerEditor.topDownPlan(this._mapForPlan(mapId));
        if (!plan || typeof document === 'undefined') return false;
        const tile = this.tilePixels(), px = TransferPlayerEditor.planTile(plan, tile);
        // Every image the plan names, loaded once.
        const names = new Set(plan.marks.map(mark => mark.material).concat(plan.grounds.map(ground => ground.material), [plan.cliff.material]));
        const images = new Map();
        await Promise.all(Array.from(names).filter(Boolean).map(async name => images.set(name, await this._loadProjectImage('materials', name))));
        const floor = await this._loadProjectImage('parallaxes', plan.floor);
        const picture = document.createElement('canvas');
        picture.width = plan.width * px;
        picture.height = plan.height * px;
        const ctx = picture.getContext('2d');
        const fills = new Map();
        const fill = (material, tint, scale) => {
            const key = material + '|' + tint + '|' + scale;
            if (fills.has(key)) return fills.get(key);
            let style = '#9a9a9a';
            const image = material ? images.get(material) : floor;
            if (image) {
                // The floor lies at its own size, as the map lays it; a material covers `scale` tiles.
                const swatch = document.createElement('canvas');
                swatch.width = material ? Math.max(2, Math.round(scale * px)) : Math.max(2, Math.round(image.naturalWidth * px / tile));
                swatch.height = material ? swatch.width : Math.max(2, Math.round(image.naturalHeight * px / tile));
                const paint = swatch.getContext('2d');
                paint.drawImage(image, 0, 0, swatch.width, swatch.height);
                if (tint) { paint.globalCompositeOperation = 'multiply'; paint.fillStyle = tint; paint.fillRect(0, 0, swatch.width, swatch.height); }
                style = ctx.createPattern(swatch, 'repeat');
            } else if (!material) style = '#2c3a2a';
            else if (/glow$/i.test(material)) style = '#ffcf86';
            else if (tint) style = tint;
            fills.set(key, style);
            return style;
        };
        try {
            TransferPlayerEditor.paintTopDown(ctx, plan, px, fill);
            const target = canvas.getContext('2d');
            target.save();
            // Over the black the preview left where there are no tiles: its grid and its events stay on top of the picture.
            target.globalCompositeOperation = 'screen';
            target.imageSmoothingEnabled = true;
            target.drawImage(picture, 0, 0, picture.width, picture.height, 0, 0, plan.width * tile, plan.height * tile);
            target.restore();
        } catch (error) {
            console.warn('TransferPlayerEditor: the 3D map could not be drawn from above:', error);
            return false;
        }
        return true;
    }

    /**
     * Build hierarchical map tree for picker dialog
     */
    buildMapTreeForPicker(
        container,
        mapCanvas,
        coordsDisplay,
        searchInput,
        loadMap,
        selection = this,
        expandedMapIds = new Set()
    ) {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        const currentProject = this.projectController.getCurrentProject ?
            this.projectController.getCurrentProject() :
            this.projectController.currentProject;

        if (!currentProject || !currentProject.maps) {
            container.innerHTML = `<div class="tree-item" style="padding: 8px; color: var(--color-text-muted);">${tt('No maps available')}</div>`;
            return;
        }

        container.innerHTML = '';

        const childrenByParent = new Map();
        currentProject.maps.forEach((map, index) => {
            if (!map || !map.id) return;
            const parentId = map.parentId || 0;
            if (!childrenByParent.has(parentId)) childrenByParent.set(parentId, []);
            childrenByParent.get(parentId).push({ ...map, index });
        });
        childrenByParent.forEach(children => {
            children.sort((a, b) => (a.order || 0) - (b.order || 0));
        });

        // Build hierarchical tree starting from root (parentId = 0)
        const buildTree = (parentId, depth = 0) => {
            const children = childrenByParent.get(parentId) || [];

            children.forEach(map => {
                const mapItem = document.createElement('div');
                mapItem.className = 'tree-item';
                mapItem.setAttribute('data-map-id', map.id);
                mapItem.style.cssText = `
                    padding: 8px;
                    padding-left: ${8 + depth * 16}px;
                    cursor: pointer;
                    user-select: none;
                    color: var(--color-text);
                    font-size: 13px;
                `;

                // Check if this map has children
                const hasChildren = childrenByParent.has(map.id);

                // Add expand/collapse icon if has children
                if (hasChildren) {
                    const icon = document.createElement('span');
                    icon.className = 'tree-icon';
                    icon.textContent = expandedMapIds.has(map.id) ? '▼ ' : '► ';
                    icon.style.cssText = 'cursor: pointer; user-select: none; margin-right: 4px;';
                    icon.addEventListener('click', (e) => {
                        e.stopPropagation();
                        if (expandedMapIds.has(map.id)) expandedMapIds.delete(map.id);
                        else expandedMapIds.add(map.id);
                        this.buildMapTreeForPicker(
                            container,
                            mapCanvas,
                            coordsDisplay,
                            searchInput,
                            loadMap,
                            selection,
                            expandedMapIds
                        );
                    });
                    mapItem.appendChild(icon);
                } else {
                    const spacer = document.createElement('span');
                    spacer.textContent = '   ';
                    mapItem.appendChild(spacer);
                }

                // Add map name
                const nameSpan = document.createElement('span');
                nameSpan.textContent = map.name || tt('Unnamed Map');
                mapItem.appendChild(nameSpan);

                // Highlight if this is the selected map
                if (map.id === selection.mapId) {
                    mapItem.style.backgroundColor = 'var(--color-selection-deep)';
                }

                // Hover effects
                mapItem.addEventListener('mouseenter', () => {
                    if (map.id !== selection.mapId) {
                        mapItem.style.backgroundColor = 'var(--color-bg-list-item)';
                    }
                });

                mapItem.addEventListener('mouseleave', () => {
                    if (map.id !== selection.mapId) {
                        mapItem.style.backgroundColor = '';
                    }
                });

                // Add click handler to load map
                mapItem.addEventListener('click', async () => {
                    selection.mapId = map.id;
                    selection.x = 0;
                    selection.y = 0;
                    coordsDisplay.textContent = `X: ${selection.x}, Y: ${selection.y}`;

                    // Update selection highlighting
                    container.querySelectorAll('.tree-item').forEach(item => {
                        item.style.backgroundColor = '';
                    });
                    mapItem.style.backgroundColor = 'var(--color-selection-deep)';

                    // Load map preview (use loadMap to update cache)
                    await loadMap(map.id);
                });

                container.appendChild(mapItem);

                // Recursively build children if expanded
                if (hasChildren && (expandedMapIds.has(map.id) || searchInput.value)) {
                    buildTree(map.id, depth + 1);
                }
            });
        };

        // Start building from root level (parentId = 0)
        buildTree(0);
    }

    /**
     * Render map preview on canvas using TilemapManager's direct canvas rendering
     */
    async renderMapPreview(canvas, coordsDisplay, mapId) {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        const ctx = canvas.getContext('2d');

        // Check if project is loaded
        const currentProject = this.projectController.getCurrentProject ?
            this.projectController.getCurrentProject() :
            this.projectController.currentProject;

        if (!currentProject) {
            ctx.fillStyle = ThemeColors.resolve('--color-border-subtle', '#333333');
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = '#999';
            ctx.font = '14px monospace';
            ctx.fillText(tt('No project loaded'), 10, 30);
            return;
        }

        try {
            // Use TilemapManager to render map directly to canvas
            if (this.projectController && this.projectController.tilemapManager) {
                const tilemapManager = this.projectController.tilemapManager;

                // Render the full map to the canvas
                const success = await tilemapManager.renderMapToCanvas(mapId, canvas);

                if (!success) {
                    throw new Error('Failed to render map');
                }

                // Draw grid overlay (but not selection - that's added separately)
                const tileSize = this.tilePixels();
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
                ctx.lineWidth = 1;

                const width = canvas.width / tileSize;
                const height = canvas.height / tileSize;

                for (let x = 0; x <= width; x++) {
                    ctx.beginPath();
                    ctx.moveTo(x * tileSize, 0);
                    ctx.lineTo(x * tileSize, canvas.height);
                    ctx.stroke();
                }

                for (let y = 0; y <= height; y++) {
                    ctx.beginPath();
                    ctx.moveTo(0, y * tileSize);
                    ctx.lineTo(canvas.width, y * tileSize);
                    ctx.stroke();
                }
            } else {
                // Fallback if tilemapManager not available
                ctx.fillStyle = ThemeColors.resolve('--color-border-subtle', '#333333');
                ctx.fillRect(0, 0, 400, 300);
                ctx.fillStyle = '#999';
                ctx.font = '14px monospace';
                ctx.fillText(tt('TilemapManager not available'), 10, 30);
            }

        } catch (e) {
            console.error('TransferPlayerEditor: Failed to load map:', e);
            ctx.fillStyle = ThemeColors.resolve('--color-border-subtle', '#333333');
            ctx.fillRect(0, 0, 400, 300);
            ctx.fillStyle = '#ff6666';
            ctx.font = '14px monospace';
            ctx.fillText(`${tt('Failed to load Map')}${mapId.toString().padStart(3, '0')}`, 10, 30);
            ctx.fillText(e.message, 10, 50);
        }
    }

    /**
     * Get map name from map ID
     */
    getMapName(mapId) {
        try {
            const mapInfos = this.databaseManager.getMapInfos();
            if (mapInfos && mapInfos[mapId]) {
                return mapInfos[mapId].name || `Map${mapId.toString().padStart(3, '0')}`;
            }
        } catch (e) {
            // Fallback if database not available
        }
        return `Map${mapId.toString().padStart(3, '0')}`;
    }

    /**
     * Build command from current data
     */
    buildCommand() {
        // A variable-designated transfer keeps its designation and variable
        // ids; only direction/fade are editable here for that mode.
        if (this.designation !== 0 && this.variableParams) {
            return {
                code: 201,
                indent: 0,
                parameters: [
                    this.designation,
                    this.variableParams[0],
                    this.variableParams[1],
                    this.variableParams[2],
                    this.direction,
                    this.fadeType
                ]
            };
        }
        return {
            code: 201,
            indent: 0,
            parameters: [
                0, // Direct designation
                this.mapId,
                this.x,
                this.y,
                this.direction,
                this.fadeType
            ]
        };
    }

    /**
     * Save and return command
     */
    save() {
        if (this.callback) {
            const command = this.buildCommand();
            this.callback(command);
        }
        this.close();
    }

    /**
     * Close modal
     */
    /**
     * Draw selection overlay on canvas (grid and highlight)
     */
    drawSelectionOverlay(canvas, location = this) {
        const ctx = canvas.getContext('2d');
        const tileSize = this.tilePixels();

        // Highlight selected position
        ctx.fillStyle = 'rgba(212, 175, 55, 0.4)';
        ctx.fillRect(location.x * tileSize, location.y * tileSize, tileSize, tileSize);

        ctx.strokeStyle = '#d4af37';
        ctx.lineWidth = 3;
        ctx.strokeRect(location.x * tileSize, location.y * tileSize, tileSize, tileSize);

        // Draw position marker
        ctx.fillStyle = '#d4af37';
        ctx.beginPath();
        ctx.arc(
            location.x * tileSize + tileSize / 2,
            location.y * tileSize + tileSize / 2,
            8,
            0,
            Math.PI * 2
        );
        ctx.fill();

        ctx.fillStyle = '#000';
        ctx.beginPath();
        ctx.arc(
            location.x * tileSize + tileSize / 2,
            location.y * tileSize + tileSize / 2,
            4,
            0,
            Math.PI * 2
        );
        ctx.fill();
    }

    close() {
        if (this.modal) {
            this.modal.style.display = 'none';
        }
    }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = TransferPlayerEditor;
}
