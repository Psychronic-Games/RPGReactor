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
        container.className = 'transfer-player-container';
        container.style.cssText = `
            background-color: var(--color-bg-surface);
            border: 1px solid var(--color-border);
            border-radius: 6px;
            width: 500px;
            display: flex;
            flex-direction: column;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
        `;

        this.modal.appendChild(container);

        this.modal.addEventListener('click', (e) => {
            if (e.target === this.modal) {
                this.close();
            }
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
        header.style.cssText = `
            padding: 12px 16px;
            background-color: var(--color-bg-panel);
            border-bottom: 1px solid var(--color-border);
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-top-left-radius: 6px;
            border-top-right-radius: 6px;
        `;
        header.innerHTML = `
            <h3 style="margin: 0; color: var(--color-text-strong); font-size: 16px;">${t('Transfer Player')}</h3>
            <button class="close-btn" style="background: none; border: none; color: var(--color-text-strong); font-size: 20px; cursor: pointer; padding: 0; width: 24px; height: 24px;">×</button>
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
            color: var(--color-bg-deep);
            border: none;
            border-radius: 3px;
            cursor: pointer;
            font-size: 12px;
            font-weight: bold;
        `;
        browseBtn.addEventListener('mouseenter', () => { browseBtn.style.backgroundColor = '#e8c84a'; });
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
        footer.style.cssText = `
            padding: 12px 16px;
            background-color: var(--color-bg-panel);
            border-top: 1px solid var(--color-border);
            display: flex;
            justify-content: flex-end;
            gap: 8px;
            border-bottom-left-radius: 6px;
            border-bottom-right-radius: 6px;
        `;

        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = t('Cancel');
        cancelBtn.className = 'rr-btn-secondary';
        cancelBtn.addEventListener('click', () => this.close());

        const okBtn = document.createElement('button');
        okBtn.textContent = t('OK');
        okBtn.style.cssText = `
            padding: 6px 20px;
            background-color: var(--color-accent);
            color: var(--color-bg-deep);
            border: none;
            border-radius: 3px;
            cursor: pointer;
            font-size: 12px;
            font-weight: bold;
        `;
        okBtn.addEventListener('click', () => this.save());

        footer.appendChild(cancelBtn);
        footer.appendChild(okBtn);
        container.appendChild(footer);
    }

    /**
     * Show map picker with visual preview.
     * @param {object} options - Initial location and optional confirmation callback
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
        container.style.cssText = `
            background-color: var(--color-bg-surface);
            border: 1px solid var(--color-border);
            border-radius: 6px;
            width: 95%;
            max-width: 1400px;
            max-height: 95vh;
            display: flex;
            flex-direction: column;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
        `;

        // Header
        const header = document.createElement('div');
        header.style.cssText = `
            padding: 12px 16px;
            background-color: var(--color-bg-panel);
            border-bottom: 1px solid var(--color-border);
            display: flex;
            justify-content: space-between;
            align-items: center;
        `;
        header.innerHTML = `
            <h3 style="margin: 0; color: var(--color-text-strong); font-size: 16px;">${options.title || tt('Select Map & Position')}</h3>
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

        // Coordinates display
        const coordsDisplay = document.createElement('div');
        coordsDisplay.className = 'coords-display';
        coordsDisplay.style.cssText = `
            position: sticky;
            top: 8px;
            left: calc(100% - 120px);
            width: 100px;
            padding: 6px 12px;
            background-color: rgba(0, 0, 0, 0.8);
            color: var(--color-text-strong);
            font-size: 12px;
            font-family: monospace;
            border-radius: 3px;
            z-index: 10;
            float: right;
            margin: 8px;
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

        zoomInBtn.addEventListener('click', () => {
            zoomLevel = Math.min(zoomLevel + 0.25, 3.0);
            updateZoom();
        });

        zoomOutBtn.addEventListener('click', () => {
            zoomLevel = Math.max(zoomLevel - 0.25, 0.25);
            updateZoom();
        });

        zoomResetBtn.addEventListener('click', () => {
            zoomLevel = 1.0;
            updateZoom();
        });

        previewContainer.appendChild(canvasContainer);
        previewSection.appendChild(previewContainer);

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
        content.appendChild(mapTreeSection);
        content.appendChild(previewSection);

        container.appendChild(header);
        container.appendChild(content);

        // Footer
        const footer = document.createElement('div');
        footer.style.cssText = `
            padding: 12px 16px;
            background-color: var(--color-bg-panel);
            border-top: 1px solid var(--color-border);
            display: flex;
            justify-content: flex-end;
            gap: 8px;
            border-bottom-left-radius: 6px;
            border-bottom-right-radius: 6px;
        `;

        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = tt('Cancel');
        cancelBtn.className = 'rr-btn-secondary';
        const closePicker = () => picker.remove();
        cancelBtn.addEventListener('click', closePicker);

        const okBtn = document.createElement('button');
        okBtn.textContent = tt('OK');
        okBtn.style.cssText = `
            padding: 6px 20px;
            background-color: var(--color-accent);
            color: var(--color-bg-deep);
            border: none;
            border-radius: 3px;
            cursor: pointer;
            font-size: 12px;
            font-weight: bold;
        `;
        okBtn.addEventListener('click', () => {
            const confirmedLocation = { ...selection };
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

            updateZoom();
            okBtn.disabled = false;
            mapCanvas.style.pointerEvents = '';
            return true;
        };

        // Click on map to select position
        mapCanvas.addEventListener('click', (e) => {
            const rect = mapCanvas.getBoundingClientRect();
            const clickX = e.clientX - rect.left;
            const clickY = e.clientY - rect.top;

            // Account for zoom level when calculating tile coordinates
            const tileSize = 48;
            const adjustedX = clickX / zoomLevel;
            const adjustedY = clickY / zoomLevel;

            selection.x = Math.floor(adjustedX / tileSize);
            selection.y = Math.floor(adjustedY / tileSize);

            coordsDisplay.textContent = `X: ${selection.x}, Y: ${selection.y}`;

            // Restore base map and redraw selection (no re-rendering needed)
            if (baseMapCanvas && baseMapCanvas.width > 0 && baseMapCanvas.height > 0) {
                const ctx = mapCanvas.getContext('2d');
                // Save the current composite operation
                const previousOperation = ctx.globalCompositeOperation;

                // Use 'copy' to completely replace the canvas content
                ctx.globalCompositeOperation = 'copy';
                ctx.drawImage(baseMapCanvas, 0, 0);

                // Restore composite operation for drawing selection
                ctx.globalCompositeOperation = previousOperation;

                // Draw the new selection on top
                this.drawSelectionOverlay(mapCanvas, selection);
            }
        });

        // Mousemove to show hover tile
        mapCanvas.addEventListener('mousemove', (e) => {
            const rect = mapCanvas.getBoundingClientRect();
            const hoverX = e.clientX - rect.left;
            const hoverY = e.clientY - rect.top;

            const tileSize = 48;
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
                const tileSize = 48;
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
        const tileSize = 48;

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
