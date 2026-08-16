// RPG Reactor - Database Tileset Editor
// Provides an interface for creating and editing tilesets
// Unified version combining standalone and database integration functionality

class DatabaseTilesetEditor {
    // Tilesets.json is the largest database file — each tileset carries an
    // 8192-entry flags array — so a truncate-in-place write leaves the widest
    // window in which a crash destroys the previous good copy along with the
    // new one. Falls back to a plain write when the fs implementation has no
    // renameSync (test mocks, web host shims).
    _writeFileAtomic(fs, filePath, data, options) {
        const atomic = (typeof window !== 'undefined' && window.RRWriteFileAtomicSync) || null;
        if (atomic && fs && typeof fs.renameSync === 'function') {
            atomic(fs, filePath, data, options);
        } else {
            fs.writeFileSync(filePath, data, options);
        }
    }

    constructor(app, projectPath, databaseManager, projectManager, commonUI, parentEditor) {
        // Support both old signature (app, projectPath, databaseManager)
        // and new signature (databaseManager, projectManager, commonUI, parentEditor)

        // The renderer app is optional, so the string project path identifies the old signature.
        if (typeof projectPath === 'string') {
            // Old signature: (app, projectPath, databaseManager)
            this.app = app;
            this.projectPath = projectPath;
            this.databaseManager = databaseManager;
            this.projectManager = null;
            this.commonUI = null;
            this.parentEditor = null;
        } else {
            // New signature: (databaseManager, projectManager, commonUI, parentEditor)
            this.databaseManager = app; // First arg is actually databaseManager
            this.projectManager = projectPath; // Second arg is actually projectManager
            this.commonUI = databaseManager; // Third arg is actually commonUI
            this.parentEditor = projectManager; // Fourth arg is actually parentEditor
            this.app = null;
            this.projectPath = null;
        }

        this.fs = null;
        this.path = null;
        const host = typeof window !== 'undefined' ? window.RPGReactorHost : null;
        if (host?.fs && host?.path) {
            this.fs = host.fs;
            this.path = host.path;
        }
        this.currentTileset = null;
        this.tilesetList = [];
        this.selectedImageIndex = null;
        this.currentEditMode = null; // 'passage-o', 'passage-x', 'passage-4dir', 'ladder', 'bush', 'counter', 'damage', 'terrain'
        this.selectedDirection = null; // For 4-dir passage: 'down', 'left', 'right', 'up'
        this.selectedTerrain = 0; // For terrain tag: 0-7
        this.currentTab = 'A'; // Current layer tab: 'A', 'B', 'C', 'D', 'E', 'F', 'G'
        this.selectedTile = null; // Currently selected tile { x, y } for highlighting
        this.passageBrush = null; // 'o' | 'x' | 'star' picked in the Key, null = click-to-cycle
        this.imageCache = new Map(); // Cache rendered tileset images to avoid redrawing
        // Sheets are laid out in whatever size the project chose, so the
        // editor samples them in that step rather than assuming 48.
        this.tileSize = this.readTileSize();
        this.currentCanvas = null; // Store current canvas to update without recreating
        this.tabCanvases = []; // Canvases of a multi-layer tab, for whole-view repaints

        // Tileset editor reference (for database wrapper functionality)
        this.tilesetEditor = null;
        this.onTilesetSaved = null;

        // Initialize Node.js modules if running in NW.js
        if (!this.fs && typeof nw !== 'undefined') {
            this.fs = require('fs');
            this.path = require('path');
        }
    }

    // Get the current project path (handles both old and new signatures)
    getProjectPath() {
        if (this.projectPath) {
            return this.projectPath; // Old signature
        }
        if (this.projectManager && this.projectManager.getCurrentProject) {
            const project = this.projectManager.getCurrentProject();
            return project ? project.path : null;
        }
        return null;
    }

    assetUrl(filePath) {
        if (!filePath || /^(file|https?):\/\//i.test(filePath)) return filePath;
        if (typeof window !== 'undefined' && window.RPGReactorAssetUrl) {
            return window.RPGReactorAssetUrl(filePath);
        }

        try {
            const { pathToFileURL } = require('url');
            if (pathToFileURL) return pathToFileURL(filePath).href;
        } catch (error) {
            // Fall through for restricted hosts without Node's URL module.
        }

        let normalized = String(filePath).replace(/\\/g, '/');
        if (/^[A-Za-z]:\//.test(normalized)) normalized = '/' + normalized;
        return 'file://' + encodeURI(normalized).replace(/#/g, '%23');
    }

    // Initialize the tileset editor UI
    async loadTilesets() {
        if (!this.fs) {
            console.error('File system not available');
            return;
        }

        try {
            const tilesetsPath = this.path.join(this.getProjectPath(), 'data', 'Tilesets.json');

            if (!this.fs.existsSync(tilesetsPath)) {
                console.warn('Tilesets.json not found, creating new file');
                this.tilesetList = [null]; // RPG Maker format starts with null at index 0
                this.saveTilesetsFile();
                return;
            }

            const data = JSON.parse(this.fs.readFileSync(tilesetsPath, 'utf8'));
            this.tilesetList = data;


            // Select first valid tileset
            for (let i = 1; i < this.tilesetList.length; i++) {
                if (this.tilesetList[i]) {
                    this.selectTileset(i);
                    break;
                }
            }
        } catch (error) {
            console.error('Error loading tilesets:', error);
        }
    }

    selectTileset(id) {
        this.currentTileset = this.tilesetList[id];
        this.clearTile3DSelection();
    }

    saveTileset() {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        if (!this.currentTileset) {
            alert(tt('No tileset selected'));
            return;
        }

        // Update name from input (check both old UI and compact UI)
        const nameInput = document.getElementById('compact-tileset-name-input');
        if (nameInput) {
            this.currentTileset.name = nameInput.value;
        }

        // Inside the Database modal, Save updates the transactional in-memory
        // database. The modal's OK/Save action owns persistence and Cancel can
        // still restore its snapshot.
        if (this.parentEditor?._activeDatabaseList?.type === 'tilesets') {
            this.notifyTilesetSaved();
            this.updateStatus(`${this.currentTileset.name} ${tt('updated')}`);
            return;
        }

        // Ensure the tilesetList is initialized and contains the current tileset
        if (!this.tilesetList || this.tilesetList.length === 0) {
            console.warn('TilesetList is empty, loading from file before saving...');
            this.loadTilesets();
            // Give it a moment to load
            setTimeout(() => {
                this.saveAfterLoad();
            }, 100);
            return;
        }

        // Update the current tileset in the list
        if (this.currentTileset.id) {
            this.tilesetList[this.currentTileset.id] = this.currentTileset;
        }

        // Save to file
        this.saveTilesetsFile();

        // Refresh list to show updated name
        this.notifyTilesetSaved();

        // Update status
        this.updateStatus(`${tt('Tileset saved:')} ${this.currentTileset.name}`);
        console.log('Tileset saved:', this.currentTileset.name);
    }

    saveAfterLoad() {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        console.log('saveAfterLoad - tilesetList length:', this.tilesetList.length);

        // Update the current tileset in the list
        if (this.currentTileset && this.currentTileset.id) {
            this.tilesetList[this.currentTileset.id] = this.currentTileset;
        }

        // Save to file
        this.saveTilesetsFile();

        // Refresh list to show updated name
        this.notifyTilesetSaved();

        // Update status
        this.updateStatus(`${tt('Tileset saved:')} ${this.currentTileset.name}`);
        console.log('Tileset saved:', this.currentTileset.name);
    }

    notifyTilesetSaved() {
        if (typeof this.onTilesetSaved === 'function') {
            this.onTilesetSaved(this.currentTileset);
        }
    }

    /** The 3D classification module, absent on hosts that never loaded it. */
    /** The project's tile size, from System.json; 48 when it says nothing. */
    readTileSize() {
        const metrics = (typeof RRTileMetrics !== 'undefined' && RRTileMetrics)
            || (typeof window !== 'undefined' && window.RRTileMetrics);
        const system = this.databaseManager && typeof this.databaseManager.getSystem === 'function'
            ? this.databaseManager.getSystem()
            : null;
        return metrics ? metrics.tileSizeOf(system) : 48;
    }

    tileset3DClasses() {
        return (typeof window !== 'undefined' && window.RRTileset3DClass) || null;
    }

    /**
     * The live classification store.
     *
     * The database owns it when there is one, so the modal's OK/Cancel covers
     * 3D classes along with everything else. Standalone (the old constructor
     * signature, and tests) it is read from disk once and written by
     * `saveTilesetsFile`.
     */
    tileset3DStore() {
        const classes = this.tileset3DClasses();
        if (!classes) return null;
        if (this.databaseManager && typeof this.databaseManager.getTileset3D === 'function') {
            return this.databaseManager.getTileset3D();
        }
        if (!this._tileset3d) {
            this._tileset3d = classes.create();
            const filePath = this.tileset3DPath();
            if (filePath && this.fs && this.fs.existsSync(filePath)) {
                try {
                    this._tileset3d = classes.normalize(JSON.parse(this.fs.readFileSync(filePath, 'utf8')));
                } catch (error) {
                    // Starting empty would silently overwrite the author's work
                    // on the next save, so keep the failure loud and visible.
                    console.error(`Error loading ${classes.FILENAME}:`, error);
                }
            }
        }
        return this._tileset3d;
    }

    tileset3DPath() {
        const classes = this.tileset3DClasses();
        const projectPath = this.getProjectPath();
        if (!classes || !projectPath || !this.path) return null;
        return this.path.join(projectPath, 'data', classes.FILENAME);
    }

    /** Persist classification alongside Tilesets.json outside the modal. */
    /**
     * Tell the open map that the 3D classification changed.
     *
     * Its own event rather than a tileset save: the 3D view rebuilds from the
     * classification and needs to know, while the database list and the sheet
     * diff do not — and this fires on every stroke of the Shape tool.
     */
    notifyTileset3DSaved() {
        if (typeof document === 'undefined' || typeof CustomEvent !== 'function') return;
        document.dispatchEvent(new CustomEvent('rr-tileset-3d-saved', {
            detail: { tilesetId: this.currentTileset ? this.currentTileset.id : null }
        }));
    }

    saveTileset3DFile() {
        const classes = this.tileset3DClasses();
        if (!classes || !this.fs) return;
        const projectPath = this.getProjectPath();
        if (!projectPath) return;
        this.notifyTileset3DSaved();

        if (this.databaseManager && typeof this.databaseManager.saveTileset3D === 'function') {
            this.databaseManager.saveTileset3D(projectPath);
            return;
        }

        const filePath = this.tileset3DPath();
        const store = this._tileset3d;
        if (!filePath || !store) return;
        // A project that never classifies a tile gains no file.
        if (classes.isEmpty(store) && !this.fs.existsSync(filePath)) return;
        try {
            this._writeFileAtomic(this.fs, filePath, JSON.stringify(classes.normalize(store)));
        } catch (error) {
            console.error(`Error saving ${classes.FILENAME}:`, error);
        }
    }

    saveTilesetsFile() {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        if (!this.fs) {
            console.error('Cannot save: fs not available');
            return;
        }

        const projectPath = this.getProjectPath();
        if (!projectPath) {
            console.error('Cannot save: projectPath is null');
            alert(tt('Error: Project path not available. Cannot save tilesets.'));
            return;
        }

        console.log('Saving tilesets...');
        console.log('Project path:', projectPath);
        console.log('Tileset list length:', this.tilesetList.length);
        console.log('Current tileset:', this.currentTileset);

        try {
            const tilesetsPath = this.path.join(projectPath, 'data', 'Tilesets.json');
            console.log('Full path:', tilesetsPath);

            // Use RPG Maker's compact JSON format (each tileset on one line)
            // This keeps file size small by not pretty-printing the large flags arrays
            const jsonLines = ['['];
            for (let i = 0; i < this.tilesetList.length; i++) {
                const tileset = this.tilesetList[i];
                const line = (tileset === null) ? 'null' : JSON.stringify(tileset);
                const isLast = (i === this.tilesetList.length - 1);
                jsonLines.push(line + (isLast ? '' : ','));
            }
            jsonLines.push(']');
            const compactJson = jsonLines.join('\n');

            this._writeFileAtomic(this.fs, tilesetsPath, compactJson);
            this.saveTileset3DFile();
            console.log('Tilesets.json saved successfully');
        } catch (error) {
            console.error('Error saving Tilesets.json:', error);
            alert(`${tt('Error saving tilesets:')} ${error.message}`);
        }
    }

    initializeCompactUI(container, tileset) {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        // Load the full tilesets list from file
        this.loadTilesets();

        // Set the current tileset
        this.currentTileset = tileset;
        this.clearTile3DSelection();

        // Debug: Log initialization details
        console.log('=== Initializing Compact Tileset UI ===');
        console.log('Tileset:', tileset.name, '(ID:', tileset.id + ')');
        console.log('Project path:', this.getProjectPath());
        console.log('fs available:', !!this.fs);
        console.log('path available:', !!this.path);

        container.innerHTML = `
            <div style="display: flex; flex-direction: column; height: 100%; overflow: hidden;">
                <!-- Header with tileset name and save button -->
                <div style="padding: 8px 12px; border-bottom: 1px solid var(--color-border); background-color: var(--color-bg-menubar); flex-shrink: 0;">
                    <div style="display: flex; gap: 8px; align-items: center;">
                        <label style="font-size: 11px; color: var(--color-text-muted);">${tt('Name:')}</label>
                        <input type="text" id="compact-tileset-name-input" value="${rrEscapeHtml(tileset.name)}"
                               style="flex: 1; max-width: 250px; padding: 4px 8px; background-color: var(--color-bg-input-alt); border: 1px solid var(--color-border-input); color: var(--color-text); border-radius: 3px; font-size: 11px;"
                               placeholder="${tt('Tileset name')}" />
                        <button id="compact-save-tileset-btn" class="tool-button" style="font-size: 11px; padding: 4px 12px;">${tt('Save')}</button>
                    </div>
                </div>

                <!-- Main two-column layout -->
                <div style="display: flex; flex: 1; overflow: hidden;">
                    <!-- Left sidebar: Layer list (top) and flag editor (bottom) -->
                    <div style="width: 260px; border-right: 1px solid var(--color-border); display: flex; flex-direction: column; background-color: var(--color-bg-list-item);">
                        <!-- Top: Layer list. Sized to its eleven rows rather
                             than sharing the column half-and-half with Flags:
                             an equal split left the list scrolling while the
                             panel below it had room to spare. -->
                        <div style="flex: 0 0 auto; display: flex; flex-direction: column; border-bottom: 1px solid var(--color-border); overflow: hidden;">
                            <div style="padding: 8px; border-bottom: 1px solid var(--color-border); background-color: var(--color-bg-panel);">
                                <h3 style="margin: 0; font-size: 11px; font-weight: 600; color: var(--color-text);">${tt('Tileset Layers')}</h3>
                            </div>
                            <div style="flex: 0 0 auto; padding: 6px 8px;">
                                <div style="margin-bottom: 6px;">
                                    <h4 style="margin: 0 0 4px 0; font-size: 9px; color: var(--color-text-muted); text-transform: uppercase; letter-spacing: 0.5px;">${tt('Autotiles (A)')}</h4>
                                    ${this.createCompactLayerItem('A1', 0)}
                                    ${this.createCompactLayerItem('A2', 1)}
                                    ${this.createCompactLayerItem('A3', 2)}
                                    ${this.createCompactLayerItem('A4', 3)}
                                    ${this.createCompactLayerItem('A5', 4)}
                                </div>
                                <div>
                                    <h4 style="margin: 0 0 4px 0; font-size: 9px; color: var(--color-text-muted); text-transform: uppercase; letter-spacing: 0.5px;">${tt('Normal (B-G)')}</h4>
                                    ${this.createCompactLayerItem('B', 5)}
                                    ${this.createCompactLayerItem('C', 6)}
                                    ${this.createCompactLayerItem('D', 7)}
                                    ${this.createCompactLayerItem('E', 8)}
                                    ${this.createCompactLayerItem('F', 9)}
                                    ${this.createCompactLayerItem('G', 10)}
                                </div>
                            </div>
                        </div>

                        <!-- Bottom: Flag editor -->
                        <div style="flex: 1; display: flex; flex-direction: column; overflow: hidden;">
                            <div style="padding: 8px; border-bottom: 1px solid var(--color-border); background-color: var(--color-bg-panel);">
                                <h4 style="margin: 0; font-size: 11px; font-weight: 600; color: var(--color-text);">${tt('Flags')}</h4>
                            </div>
                            <div style="flex: 1; overflow-y: auto; padding: 8px;">
                                <!-- Flag buttons as single column list -->
                                <button class="compact-flag-btn" id="flag-passability" data-mode="passability"
                                        style="width: 100%; margin-bottom: 6px; font-size: 12px; padding: 10px; background-color: var(--color-bg-panel); border: 1px solid var(--color-border-input); color: var(--color-text); border-radius: 6px; cursor: pointer; text-align: left; display: flex; align-items: center; gap: 8px;">
                                    ${DatabaseTilesetEditor.flagIcon('passability')}<span>${tt('Passability (O/X/★)')}</span>
                                </button>
                                <button class="compact-flag-btn" id="flag-4dir" data-mode="4dir"
                                        style="width: 100%; margin-bottom: 6px; font-size: 12px; padding: 10px; background-color: var(--color-bg-panel); border: 1px solid var(--color-border-input); color: var(--color-text); border-radius: 6px; cursor: pointer; text-align: left; display: flex; align-items: center; gap: 8px;">
                                    ${DatabaseTilesetEditor.flagIcon('4dir')}<span>${tt('Passage (4 Dir)')}</span>
                                </button>
                                <button class="compact-flag-btn" id="flag-ladder" data-mode="ladder"
                                        style="width: 100%; margin-bottom: 6px; font-size: 12px; padding: 10px; background-color: var(--color-bg-panel); border: 1px solid var(--color-border-input); color: var(--color-text); border-radius: 6px; cursor: pointer; text-align: left; display: flex; align-items: center; gap: 8px;">
                                    ${DatabaseTilesetEditor.flagIcon('ladder')}<span>${tt('Ladder')}</span>
                                </button>
                                <button class="compact-flag-btn" id="flag-bush" data-mode="bush"
                                        style="width: 100%; margin-bottom: 6px; font-size: 12px; padding: 10px; background-color: var(--color-bg-panel); border: 1px solid var(--color-border-input); color: var(--color-text); border-radius: 6px; cursor: pointer; text-align: left; display: flex; align-items: center; gap: 8px;">
                                    ${DatabaseTilesetEditor.flagIcon('bush')}<span>${tt('Bush')}</span>
                                </button>
                                <button class="compact-flag-btn" id="flag-counter" data-mode="counter"
                                        style="width: 100%; margin-bottom: 6px; font-size: 12px; padding: 10px; background-color: var(--color-bg-panel); border: 1px solid var(--color-border-input); color: var(--color-text); border-radius: 6px; cursor: pointer; text-align: left; display: flex; align-items: center; gap: 8px;">
                                    ${DatabaseTilesetEditor.flagIcon('counter')}<span>${tt('Counter')}</span>
                                </button>
                                <button class="compact-flag-btn" id="flag-damage" data-mode="damage"
                                        style="width: 100%; margin-bottom: 6px; font-size: 12px; padding: 10px; background-color: var(--color-bg-panel); border: 1px solid var(--color-border-input); color: var(--color-text); border-radius: 6px; cursor: pointer; text-align: left; display: flex; align-items: center; gap: 8px;">
                                    ${DatabaseTilesetEditor.flagIcon('damage')}<span>${tt('Damage Floor')}</span>
                                </button>
                                <button class="compact-flag-btn" id="flag-terrain" data-mode="terrain"
                                        style="width: 100%; margin-bottom: 6px; font-size: 12px; padding: 10px; background-color: var(--color-bg-panel); border: 1px solid var(--color-border-input); color: var(--color-text); border-radius: 6px; cursor: pointer; text-align: left; display: flex; align-items: center; gap: 8px;">
                                    ${DatabaseTilesetEditor.flagIcon('terrain')}<span>${tt('Terrain Tag (0-7)')}</span>
                                </button>
                                <button class="compact-flag-btn" id="flag-tile3d" data-mode="tile3d"
                                        style="width: 100%; margin-bottom: 6px; font-size: 12px; padding: 10px; background-color: var(--color-bg-panel); border: 1px solid var(--color-border-input); color: var(--color-text); border-radius: 6px; cursor: pointer; text-align: left; display: flex; align-items: center; gap: 8px;">
                                    ${DatabaseTilesetEditor.flagIcon('tile3d')}<span>${tt('3D Shape')}</span>
                                </button>

                                <p style="font-size: 8px; color: var(--color-text-dim); margin: 8px 0 0 0; line-height: 1.3;">
                                    ${tt('Select flag, click layer, then click tiles')}
                                </p>
                            </div>
                        </div>
                    </div>

                    <!-- Right: Tabs + Preview -->
                    <div style="flex: 1; display: flex; flex-direction: column; overflow: hidden; background-color: var(--color-bg-base);">
                        <!-- Tab buttons -->
                        <div style="padding: 8px; border-bottom: 1px solid var(--color-border); background-color: var(--color-bg-list-item-alt); display: flex; gap: 6px;">
                            <button class="compact-layer-tab" data-tab="A" style="flex: 1; padding: 8px; font-size: 11px; background-color: var(--color-bg-hover); border: 1px solid var(--color-accent-bright); color: var(--color-text-strong); border-radius: 3px; cursor: pointer; font-weight: 600;">${tt('A (Autotiles)')}</button>
                            <button class="compact-layer-tab" data-tab="B" style="flex: 1; padding: 8px; font-size: 11px; background-color: var(--color-bg-panel); border: 1px solid var(--color-border-input); color: var(--color-text); border-radius: 3px; cursor: pointer;">B</button>
                            <button class="compact-layer-tab" data-tab="C" style="flex: 1; padding: 8px; font-size: 11px; background-color: var(--color-bg-panel); border: 1px solid var(--color-border-input); color: var(--color-text); border-radius: 3px; cursor: pointer;">C</button>
                            <button class="compact-layer-tab" data-tab="D" style="flex: 1; padding: 8px; font-size: 11px; background-color: var(--color-bg-panel); border: 1px solid var(--color-border-input); color: var(--color-text); border-radius: 3px; cursor: pointer;">D</button>
                            <button class="compact-layer-tab" data-tab="E" style="flex: 1; padding: 8px; font-size: 11px; background-color: var(--color-bg-panel); border: 1px solid var(--color-border-input); color: var(--color-text); border-radius: 3px; cursor: pointer;">E</button>
                            <button class="compact-layer-tab" data-tab="F" style="flex: 1; padding: 8px; font-size: 11px; background-color: var(--color-bg-panel); border: 1px solid var(--color-border-input); color: var(--color-text); border-radius: 3px; cursor: pointer;">F</button>
                            <button class="compact-layer-tab" data-tab="G" style="flex: 1; padding: 8px; font-size: 11px; background-color: var(--color-bg-panel); border: 1px solid var(--color-border-input); color: var(--color-text); border-radius: 3px; cursor: pointer;">G</button>
                        </div>

                        <!-- Preview area: key, sheet, 3D preview.
                             The key and the preview live in the margins the
                             sheet was already leaving empty, so nothing the
                             author was looking at moves to make room. -->
                        <div style="flex: 1; overflow: auto; padding: 16px; display: flex; align-items: flex-start; justify-content: center; gap: 16px;">
                            <!-- Sticky, so the Key — and the tool palettes it
                                 hosts — stay reachable while a tall sheet
                                 scrolls; a sheet is up to 32 rows and the
                                 brushes were a full scroll away from the tiles
                                 being painted. -->
                            <div id="flag-mode-key" style="flex: 0 0 168px; align-self: flex-start; position: sticky; top: 0; max-height: 100%; overflow-y: auto;"></div>
                            <div id="compact-tileset-canvas-container" style="max-width: 100%;">
                                <p style="color: var(--color-text-muted); font-size: 10px;">${tt('Click a layer on the left to view')}</p>
                            </div>
                            <div id="tile3d-preview" style="flex: 0 0 168px; align-self: flex-start;"></div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // Wait for DOM to be ready, then initialize
        setTimeout(() => {
            // Set up event listeners for the compact UI
            this.setupCompactEventListeners();

            // The key and the preview belong to whatever mode is already
            // selected, so they are drawn on open rather than on first click.
            this.refreshFlagKey();
            this.refreshTile3DPreview();

            // Load layer list thumbnails
            this.loadLayerListThumbnails();

            // Set up layer list click/double-click handlers (only once)
            this.setupLayerListHandlers();

            // Load initial tab (A by default)
            this.switchTab('A');
        }, 0);
    }

    // Create a compact layer item for the left sidebar
    createCompactLayerItem(label, index) {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        const fileName = this.currentTileset.tilesetNames[index] || '';
        return `
            <div class="compact-layer-item" data-index="${index}"
                 style="margin-bottom: 3px; padding: 3px 5px; background-color: var(--color-bg-panel); border: 1px solid var(--color-border); border-radius: 3px; cursor: pointer; transition: all 0.15s;">
                <div style="display: flex; align-items: center; gap: 6px;">
                    <div class="layer-thumb-mini" style="width: 22px; height: 22px; background: var(--color-bg-surface); border: 1px solid var(--color-border-input); display: flex; align-items: center; justify-content: center; font-size: 8px; color: var(--color-text-dim); overflow: hidden; flex-shrink: 0;">
                        ${fileName ? '' : '-'}
                    </div>
                    <div style="flex: 1; min-width: 0;">
                        <div style="font-size: 10px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                            <span style="font-weight: 600; color: var(--color-accent-bright);">${label}</span>
                            <span style="color: ${fileName ? 'var(--color-text-muted)' : 'var(--color-text-dim)'}; font-weight: normal; font-size: 9px;"> - ${rrEscapeHtml(fileName || tt('(None)'))}</span>
                        </div>
                    </div>
                    <button class="rr-choose-tileset-image" data-index="${index}"
                        title="${rrEscapeHtml(tt('Choose Image'))}"
                        style="flex-shrink: 0; padding: 1px 7px; font-size: 12px; line-height: 15px; background: var(--color-accent-tint-15); color: var(--color-accent-bright); border: 1px solid var(--color-accent-border-strong); border-radius: 3px; cursor: pointer;">+</button>
                </div>
            </div>
        `;
    }

    // Load thumbnails for layer items in left sidebar
    loadLayerListThumbnails() {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        document.querySelectorAll('.compact-layer-item').forEach(item => {
            const index = parseInt(item.dataset.index);
            const fileName = this.currentTileset.tilesetNames[index];

            // Update the filename text
            const fileNameSpan = item.querySelector('span:last-child');
            if (fileNameSpan) {
                fileNameSpan.textContent = ` - ${fileName || tt('(None)')}`;
                fileNameSpan.style.color = fileName ? 'var(--color-text-muted)' : 'var(--color-text-dim)';
            }

            // Update thumbnail
            const thumbContainer = item.querySelector('.layer-thumb-mini');
            if (fileName && this.path && this.getProjectPath()) {
                const fileNameWithExt = fileName.endsWith('.png') ? fileName : fileName + '.png';
                const imagePath = this.path.join(this.getProjectPath(), 'img', 'tilesets', fileNameWithExt);

                if (this.fs && this.fs.existsSync(imagePath)) {
                    const img = document.createElement('img');
                    img.src = this.assetUrl(imagePath);
                    img.style.cssText = 'width: 100%; height: 100%; object-fit: cover; image-rendering: pixelated;';
                    thumbContainer.innerHTML = '';
                    thumbContainer.appendChild(img);
                }
            } else {
                thumbContainer.innerHTML = '-';
            }
        });
    }

    // Set up event handlers for layer list items (call once during initialization)
    setupLayerListHandlers() {
        // The "+" on an unassigned row opens the picker for that slot directly.
        // It sits inside the row, so the click has to stop before the row's own
        // select/double-click handling sees it.
        document.querySelectorAll('.rr-choose-tileset-image').forEach(button => {
            button.addEventListener('click', event => {
                event.stopPropagation();
                event.preventDefault();
                const index = parseInt(button.dataset.index, 10);
                if (Number.isNaN(index)) return;
                this.selectedImageIndex = index;
                this.selectImageFileForLayer(index);
            });
            button.addEventListener('dblclick', event => event.stopPropagation());
        });

        document.querySelectorAll('.compact-layer-item').forEach(item => {
            const index = parseInt(item.dataset.index);

            // Set up click handler
            item.addEventListener('click', () => {
                const fileName = this.currentTileset.tilesetNames[index];

                // Update tab button to show correct tab (without full switchTab which highlights all layers in tab)
                const appropriateTab = this.getTabForLayerIndex(index);

                // Update tab button styles only
                document.querySelectorAll('.compact-layer-tab').forEach(btn => {
                    if (btn.dataset.tab === appropriateTab) {
                        btn.style.backgroundColor = 'var(--color-bg-hover)';
                        btn.style.borderColor = 'var(--color-accent-bright)';
                        btn.style.fontWeight = '600';
                    } else {
                        btn.style.backgroundColor = 'var(--color-bg-panel)';
                        btn.style.borderColor = 'var(--color-border-input)';
                        btn.style.fontWeight = 'normal';
                    }
                });

                // Highlight only this specific layer
                document.querySelectorAll('.compact-layer-item').forEach(i => {
                    i.style.backgroundColor = 'var(--color-bg-panel)';
                    i.style.borderColor = 'var(--color-border)';
                });
                item.style.backgroundColor = 'var(--color-bg-hover)';
                item.style.borderColor = 'var(--color-accent-bright)';

                this.selectedImageIndex = index;

                if (fileName) {
                    this.renderCompactTilesetCanvas(fileName, index);
                } else {
                    const tt = text => window.I18n ? window.I18n.tText(text) : text;
                    const container = document.getElementById('compact-tileset-canvas-container');
                    container.innerHTML = `<p style="color: var(--color-text-muted); font-size: 10px; text-align: center;">${tt('No image assigned to this layer')}</p>`;
                }
            });

            // Set up double-click handler for selecting new image
            item.addEventListener('dblclick', () => {
                this.selectImageFileForLayer(index);
            });
        });
    }

    // Open custom image picker modal for selecting a tileset image
    selectImageFileForLayer(index) {
        const layerNames = RRTilesetSheets.SHEET_KEYS;
        const layerName = layerNames[index];

        // Show custom image picker modal
        this.showTilesetImagePicker(index, layerName);
    }

    // Show custom tileset image picker modal with file list and preview
    showTilesetImagePicker(layerIndex, layerName) {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        const t = key => (window.I18n ? window.I18n.t(key) : key);

        const overlay = document.createElement('div');
        overlay.className = 'rr-modal-overlay';

        const dialog = document.createElement('div');
        dialog.className = 'rr-modal';
        dialog.style.cssText = 'width: min(92vw, 1100px); height: min(88vh, 780px); display: flex; flex-direction: column;';

        const header = document.createElement('div');
        header.className = 'rr-modal-header';
        const title = document.createElement('div');
        title.className = 'rr-modal-title';
        title.textContent = `${tt('Select Tileset for')} ${layerName}`;
        const closeButton = document.createElement('button');
        closeButton.className = 'rr-modal-close';
        closeButton.type = 'button';
        closeButton.textContent = '×';
        closeButton.setAttribute('aria-label', t('common.cancel'));
        header.appendChild(title);
        header.appendChild(closeButton);

        const body = document.createElement('div');
        body.className = 'rr-modal-body';
        // `.rr-modal-body` is a padded, scrolling, gapped *column*. This one is
        // a flush two-pane row, so the direction and gap have to be overridden
        // explicitly: leaving the column direction made the list pane size to
        // its content height instead of the dialog's, so the browser's
        // `height: 100%` never resolved, nothing overflowed, and neither the
        // list nor the section rail could scroll.
        body.style.cssText = 'flex: 1; min-height: 0; display: flex; flex-direction: row; gap: 0; padding: 0; overflow: hidden;';

        // A column: a pinned "(None)" row above the searchable browser. The
        // browser sizes itself with height:100%, which cannot share a column
        // with anything else, so it is given an explicit flex basis and its own
        // height rule is cleared below.
        const listPane = document.createElement('div');
        listPane.style.cssText = 'width: 300px; flex-shrink: 0; border-right: 1px solid var(--color-border); display: flex; flex-direction: column; min-height: 0;';

        // A pinned "(None)" row, above the browser and outside it, so clearing a
        // slot stays reachable no matter what the search box is filtering to.
        const noneRow = document.createElement('div');
        noneRow.className = 'rr-picker-file-item rr-tileset-none-option';
        noneRow.tabIndex = 0;
        noneRow.setAttribute('role', 'option');
        noneRow.textContent = t('common.none');
        noneRow.style.cssText = 'flex: 0 0 auto; padding: 8px 10px; margin: 8px 8px 0 8px; cursor: pointer; border: 1px dashed var(--color-border-input); border-radius: 3px; font-size: 12px; color: var(--color-text-muted); font-style: italic; text-align: center;';

        const previewPane = document.createElement('div');
        previewPane.style.cssText = 'flex: 1; min-width: 0; background: var(--color-bg-deep); display: flex; align-items: center; justify-content: center; overflow: auto; padding: 16px;';
        const previewEmpty = () => {
            previewPane.innerHTML = '';
            const hint = document.createElement('p');
            hint.style.cssText = 'color: var(--color-text-dim); font-size: 13px;';
            hint.textContent = tt('Select a tileset to preview');
            previewPane.appendChild(hint);
        };
        previewEmpty();

        body.appendChild(listPane);
        body.appendChild(previewPane);

        const footer = document.createElement('div');
        footer.className = 'rr-modal-footer';
        const cancelButton = document.createElement('button');
        cancelButton.type = 'button';
        cancelButton.className = 'tool-button';
        cancelButton.textContent = t('common.cancel');
        const selectButton = document.createElement('button');
        selectButton.type = 'button';
        selectButton.className = 'tool-button';
        selectButton.textContent = tt('Select This Tileset');
        selectButton.disabled = true;
        selectButton.style.opacity = '0.5';
        footer.appendChild(cancelButton);
        footer.appendChild(selectButton);

        dialog.appendChild(header);
        dialog.appendChild(body);
        dialog.appendChild(footer);
        overlay.appendChild(dialog);

        // null means nothing picked yet; '' is a real choice meaning clear the
        // slot, so the two cannot share a sentinel.
        let chosen = null;
        const markChosen = () => {
            selectButton.disabled = false;
            selectButton.style.opacity = '';
        };
        const close = () => {
            document.removeEventListener('keydown', onKeyDown);
            if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
        };
        const confirm = () => {
            if (chosen === null) return;
            this.assignTilesetToLayer(layerIndex, chosen, layerName);
            close();
        };
        function onKeyDown(event) {
            if (event.key === 'Escape') { event.preventDefault(); close(); }
        }

        listPane.appendChild(noneRow);

        const selectNone = () => {
            chosen = '';
            markChosen();
            noneRow.style.backgroundColor = 'var(--color-accent-tint-15)';
            noneRow.style.color = 'var(--color-accent-bright)';
            noneRow.style.borderColor = 'var(--color-accent-border-strong)';
            noneRow.style.borderStyle = 'solid';
            previewPane.innerHTML = '';
            const cleared = document.createElement('p');
            cleared.style.cssText = 'color: var(--color-text-dim); font-size: 13px;';
            cleared.textContent = t('common.none');
            previewPane.appendChild(cleared);
        };
        noneRow.addEventListener('click', selectNone);
        noneRow.addEventListener('dblclick', () => { selectNone(); confirm(); });
        noneRow.addEventListener('keydown', event => {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            event.preventDefault();
            selectNone();
        });

        const tilesetsDir = this.path.join(this.getProjectPath(), 'img', 'tilesets');
        const files = this.fs.existsSync(tilesetsDir)
            ? RRAssetFiles.listUnique(tilesetsDir, ['.png'])
            : null;

        if (!files) {
            listPane.innerHTML = `<p style="color: var(--color-text-muted); padding: 16px; font-size: 12px;">${tt('Tilesets directory not found')}</p>`;
        } else {
            const byName = new Map(files.map(file => [file.name, file.absolutePath]));

            const showPreview = name => {
                const absolutePath = byName.get(name);
                previewPane.innerHTML = '';
                if (!absolutePath) { previewEmpty(); return; }
                const image = document.createElement('img');
                image.src = this.assetUrl(absolutePath);
                image.style.cssText = 'max-width: 100%; max-height: 100%; image-rendering: pixelated; display: block;';
                image.addEventListener('dblclick', confirm);
                previewPane.appendChild(image);
            };

            const browser = RRPickerIndex.createBrowser({
                files: files.map(file => file.name),
                selectedName: this.currentTileset?.tilesetNames?.[layerIndex] || '',
                searchPlaceholder: tt('Search files...'),
                emptyText: tt('No tileset images found in img/tilesets'),
                onSelect: name => {
                    chosen = name;
                    markChosen();
                    noneRow.style.backgroundColor = '';
                    noneRow.style.color = 'var(--color-text-muted)';
                    noneRow.style.borderColor = 'var(--color-border-input)';
                    noneRow.style.borderStyle = 'dashed';
                    showPreview(name);
                }
            });
            // Clear the component's own height:100% before handing it a flex
            // basis, or the two rules fight and the inner list stops scrolling.
            browser.element.style.height = 'auto';
            browser.element.style.flex = '1 1 0';
            browser.element.style.minHeight = '0';
            listPane.appendChild(browser.element);

            // Double-clicking a row assigns straight away, as it did before.
            browser.list.addEventListener('dblclick', event => {
                const item = event.target.closest('.rr-picker-file-item');
                if (item && item.dataset.fileName) {
                    chosen = item.dataset.fileName;
                    confirm();
                }
            });

            const current = this.currentTileset?.tilesetNames?.[layerIndex] || '';
            if (current && byName.has(current)) {
                chosen = current;
                markChosen();
                showPreview(current);
                browser.scrollTo(current);
            }
        }

        closeButton.addEventListener('click', close);
        cancelButton.addEventListener('click', close);
        selectButton.addEventListener('click', confirm);
        overlay.addEventListener('click', event => {
            if (event.target === overlay) close();
        });
        document.addEventListener('keydown', onKeyDown);

        document.body.appendChild(overlay);
    }

    // Browse for external tileset file (copies to project)
    assignTilesetToLayer(layerIndex, baseName, layerName) {
        // Clear cache for old layer first (before overwriting)
        const oldFileName = this.currentTileset.tilesetNames[layerIndex];
        if (oldFileName) {
            this.imageCache.delete(this.baseCacheKey(layerIndex, oldFileName));
        }

        // Update tileset data. Slots past the end of a legacy nine-entry
        // array are filled rather than assigned directly, so no holes are
        // left behind for JSON.stringify to turn into nulls.
        RRTilesetSheets.setNameAt(this.currentTileset.tilesetNames, layerIndex, baseName);

        // Clear cache for new layer as well
        this.imageCache.delete(this.baseCacheKey(layerIndex, baseName));

        // Switch to the tab that contains this layer
        const appropriateTab = this.getTabForLayerIndex(layerIndex);
        this.switchTab(appropriateTab);

        // Refresh UI - reload thumbnails
        this.loadLayerListThumbnails();

        // Announce it, exactly as saving the tileset does.
        //
        // Assigning a sheet only updated this editor's own thumbnails, so the
        // map canvas and the tile palette — each of which captured the tileset
        // when the map opened — knew nothing about it until the Save button
        // beside the name was pressed. A sheet added to E, F or G was
        // therefore not selectable in its tab, and a tile placed from one drew
        // nothing at all, because the sheet it addresses had never been
        // loaded. This only announces; the Database modal still owns writing
        // the file, so Cancel can still put everything back.
        this.notifyTilesetSaved();

        const shown = baseName || (window.I18n ? window.I18n.t('common.none') : '(None)');
        console.log(`Tileset ${shown} assigned to ${layerName} (index ${layerIndex})`);
        this.updateStatus(`${layerName}: ${shown}`);
    }

    // Switch to a different layer tab (shows specific layers in preview)
    switchTab(tab) {
        this.currentTab = tab;
        this.currentCanvas = null; // Clear current canvas when switching tabs
        console.log('Switching to tab:', tab);

        // Update tab button styles
        document.querySelectorAll('.compact-layer-tab').forEach(btn => {
            if (btn.dataset.tab === tab) {
                btn.style.backgroundColor = 'var(--color-bg-hover)';
                btn.style.borderColor = 'var(--color-accent-bright)';
                btn.style.fontWeight = '600';
            } else {
                btn.style.backgroundColor = 'var(--color-bg-panel)';
                btn.style.borderColor = 'var(--color-border-input)';
                btn.style.fontWeight = 'normal';
            }
        });

        // Update layer list highlighting to match the tab
        const layerIndices = this.getLayerIndicesForTab(tab);
        document.querySelectorAll('.compact-layer-item').forEach(item => {
            const index = parseInt(item.dataset.index);
            if (layerIndices.includes(index)) {
                // Highlight layers in this tab
                item.style.backgroundColor = 'var(--color-bg-hover)';
                item.style.borderColor = 'var(--color-accent-bright)';
            } else {
                // Unhighlight other layers
                item.style.backgroundColor = 'var(--color-bg-panel)';
                item.style.borderColor = 'var(--color-border)';
            }
        });

        // Render the layers for this tab in the preview canvas
        this.renderTabPreview(tab);
    }

    // Render preview for a specific tab (shows all layers in that tab stacked)
    renderTabPreview(tab) {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        const container = document.getElementById('compact-tileset-canvas-container');
        const layerIndices = this.getLayerIndicesForTab(tab);

        // Both render paths below rebuild these; clearing here keeps a canvas
        // from a previously viewed tab from being repainted after it is gone.
        this.currentCanvas = null;
        this.tabCanvases = [];

        container.innerHTML = `<p style="color: var(--color-text-muted); font-size: 10px;">${tt('Loading layers...')}</p>`;

        // Collect images for this tab
        const images = [];
        for (const index of layerIndices) {
            const fileName = this.currentTileset.tilesetNames[index];
            if (fileName && this.path && this.getProjectPath()) {
                const fileNameWithExt = fileName.endsWith('.png') ? fileName : fileName + '.png';
                const imagePath = this.path.join(this.getProjectPath(), 'img', 'tilesets', fileNameWithExt);
                if (this.fs && this.fs.existsSync(imagePath)) {
                    images.push({ index, fileName: fileNameWithExt, imagePath });
                }
            }
        }

        if (images.length === 0) {
            // An unassigned tab used to be dead space, leaving double-clicking a
            // row in the left column as the only way in. Offer the same picker
            // here. B-G are single-slot tabs so they get one button; the A tab
            // covers A1-A5, so each sublayer gets its own rather than making the
            // button guess which one was meant.
            const perSlot = layerIndices.length > 1;
            const buttons = layerIndices.map(index => {
                const key = RRTilesetSheets.keyFromIndex(index) || '';
                const label = perSlot ? `${key} — ${tt('Choose Image')}` : tt('Choose Image');
                return `<button class="rr-choose-tileset-image tool-button" data-index="${index}"
                            style="font-size: 11px; padding: 6px 14px;">${rrEscapeHtml(label)}</button>`;
            }).join('');

            container.innerHTML = `
                <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; padding: 24px 12px;">
                    <p style="color: var(--color-text-muted); font-size: 10px; text-align: center; margin: 0;">${tt('No images assigned to this tab')}</p>
                    <div style="display: flex; flex-wrap: wrap; gap: 6px; justify-content: center;">${buttons}</div>
                </div>`;

            container.querySelectorAll('.rr-choose-tileset-image').forEach(button => {
                button.addEventListener('click', () => {
                    const index = parseInt(button.dataset.index, 10);
                    if (Number.isNaN(index)) return;
                    this.selectedImageIndex = index;
                    this.selectImageFileForLayer(index);
                });
            });
            return;
        }

        // For single-layer tabs (B, C, D, E), render with proper canvas handling
        if (images.length === 1) {
            this.renderCompactTilesetCanvas(images[0].fileName, images[0].index);
            return;
        }

        // For multi-layer tabs (A), create stacked canvases with proper rendering
        const wrapper = document.createElement('div');
        wrapper.style.cssText = 'display: flex; flex-direction: column; gap: 2px;';

        let loadedCount = 0;
        const totalImages = images.length;

        images.forEach(({ index, fileName, imagePath }) => {
            const img = new Image();
            img.onload = () => {
                const isSplitSheet = RRTilesetSheets.isNormalSheetIndex(index);

                // Create canvas for this layer
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                ctx.imageSmoothingEnabled = false;

                if (isSplitSheet) {
                    // B-E layers: Split in half vertically and stack
                    const halfWidth = img.width / 2;
                    const scale = 1;
                    canvas.width = halfWidth * scale;
                    canvas.height = img.height * 2 * scale;
                    canvas.style.border = '1px solid var(--color-border-input)';
                    canvas.style.imageRendering = 'pixelated';
                    canvas.style.display = 'block';

                    // Draw left half on top
                    ctx.drawImage(img, 0, 0, halfWidth, img.height, 0, 0, halfWidth * scale, img.height * scale);
                    // Draw right half on bottom
                    ctx.drawImage(img, halfWidth, 0, halfWidth, img.height, 0, img.height * scale, halfWidth * scale, img.height * scale);
                    // Draw grid
                    this.drawTilesetGrid(ctx, halfWidth, img.height * 2, scale);
                } else {
                    // A1-A5 layers
                    const layerNames = ['A1', 'A2', 'A3', 'A4', 'A5'];
                    const layerName = layerNames[index];

                    // Check if we have a cached base canvas
                    const cacheKey = this.baseCacheKey(index, fileName);
                    let baseCanvas = this.imageCache.get(cacheKey);

                    if (!baseCanvas) {
                        // For A1-A4 autotiles, show representative preview tiles only
                        if (index >= 0 && index <= 3) {
                            // A1-A4: Use autotile palette rendering
                            baseCanvas = document.createElement('canvas');
                            const baseCtx = baseCanvas.getContext('2d');
                            this.renderAutotilePalette(baseCtx, img, layerName);
                        } else {
                            // A5: Display as-is
                            const scale = 1;
                            baseCanvas = document.createElement('canvas');
                            baseCanvas.width = img.width * scale;
                            baseCanvas.height = img.height * scale;

                            const baseCtx = baseCanvas.getContext('2d');
                            baseCtx.imageSmoothingEnabled = false;
                            baseCtx.drawImage(img, 0, 0, img.width, img.height, 0, 0, img.width * scale, img.height * scale);
                            // Draw grid
                            this.drawTilesetGrid(baseCtx, img.width, img.height, scale);
                        }

                        // Cache the base canvas
                        this.imageCache.set(cacheKey, baseCanvas);
                    }

                    // Set canvas size and draw base
                    canvas.width = baseCanvas.width;
                    canvas.height = baseCanvas.height;
                    canvas.style.border = '1px solid var(--color-border-input)';
                    canvas.style.imageRendering = 'pixelated';
                    canvas.style.display = 'block';

                    ctx.drawImage(baseCanvas, 0, 0);
                }

                // Draw passage overlay
                this.drawCompactPassageOverlay(ctx, canvas.width, canvas.height, index, isSplitSheet);

                // Add click handler
                canvas.addEventListener('click', (e) => {
                    this.handleCompactCanvasClick(e, canvas, index, fileName, isSplitSheet);
                });
                this.attachTile3DDrag(canvas, index, isSplitSheet);
                this.attachPassageBrushDrag(canvas, index, isSplitSheet);

                this.tabCanvases.push({ canvas, imageIndex: index, isSplitSheet });
                wrapper.appendChild(canvas);

                loadedCount++;
                if (loadedCount === totalImages) {
                    console.log(`Tab ${tab}: Loaded ${loadedCount} layers`);
                    container.innerHTML = '';
                    container.appendChild(wrapper);
                }
            };

            img.onerror = () => {
                console.error(`Failed to load: ${fileName}`);
                loadedCount++;
                if (loadedCount === totalImages) {
                    container.innerHTML = '';
                    container.appendChild(wrapper);
                }
            };

            img.src = this.assetUrl(imagePath);
        });
    }

    // Get layer indices for a given tab
    getLayerIndicesForTab(tab) {
        switch(tab) {
            case 'A': return [0, 1, 2, 3, 4]; // A1-A5
            case 'B': return [5];               // B
            case 'C': return [6];               // C
            case 'D': return [7];               // D
            case 'E': return [8];               // E
            case 'F': return [9];               // F
            case 'G': return [10];              // G
            default: return [0, 1, 2, 3, 4];
        }
    }

    // Get tab for a given layer index (reverse mapping)
    getTabForLayerIndex(layerIndex) {
        if (layerIndex >= 0 && layerIndex <= 4) return 'A'; // A1-A5
        if (layerIndex === 5) return 'B';
        if (layerIndex === 6) return 'C';
        if (layerIndex === 7) return 'D';
        if (layerIndex === 8) return 'E';
        if (layerIndex === 9) return 'F';
        if (layerIndex === 10) return 'G';
        return 'A'; // Default
    }

    // Create a layer list item for the left sidebar
    setupCompactEventListeners() {
        // Tileset name input
        const nameInput = document.getElementById('compact-tileset-name-input');
        if (nameInput) {
            nameInput.addEventListener('input', (e) => {
                this.currentTileset.name = e.target.value;
            });
        }

        // Save button
        const saveBtn = document.getElementById('compact-save-tileset-btn');
        if (saveBtn) {
            saveBtn.addEventListener('click', () => {
                this.saveTileset();
            });
        }

        // Tab buttons
        document.querySelectorAll('.compact-layer-tab').forEach(btn => {
            btn.addEventListener('click', () => {
                this.switchTab(btn.dataset.tab);
            });
        });

        // Flag buttons
        document.querySelectorAll('.compact-flag-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const mode = btn.dataset.mode;

                console.log('Flag button clicked:', mode);

                // Remove active state from all flag buttons
                document.querySelectorAll('.compact-flag-btn').forEach(b => {
                    b.style.backgroundColor = 'var(--color-bg-panel)';
                    b.style.borderColor = 'var(--color-border-input)';
                });

                // Highlight selected button
                btn.style.backgroundColor = 'var(--color-bg-hover)';
                btn.style.borderColor = 'var(--color-accent-bright)';

                // Set edit mode. Entering or leaving 3D classification swaps
                // what the overlay shows, not just what a click does, so the
                // canvases already on screen have to be repainted.
                const was3D = this.currentEditMode === 'tile3d';
                this.currentEditMode = mode;
                // Leaving 3D drops what was selected in it. Kept, it came back
                // as a box round a rectangle the mode being returned to has no
                // concept of.
                if (was3D && mode !== 'tile3d') this.clearTile3DSelection();
                if (was3D !== (mode === 'tile3d')) this.refreshOverlays();
                this.refreshFlagKey();
                this.refreshTile3DPreview();
                console.log(`Edit mode: ${mode}`);
            });
        });
    }

    // Load thumbnails for all layer slots
    renderCompactTilesetCanvas(fileName, imageIndex) {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        const container = document.getElementById('compact-tileset-canvas-container');
        if (!container) return;

        container.innerHTML = `<p style="color: var(--color-text-muted); font-size: 11px;">${tt('Loading tileset image...')}</p>`;

        // Add .png extension if not already present
        const fileNameWithExt = fileName.endsWith('.png') ? fileName : fileName + '.png';
        const imagePath = this.path.join(this.getProjectPath(), 'img', 'tilesets', fileNameWithExt);

        // Check if file exists
        if (!this.fs.existsSync(imagePath)) {
            container.innerHTML = `<p style="color: #f44; font-size: 11px;">${tt('Image file not found:')} ${rrEscapeHtml(fileName)}</p>`;
            return;
        }

        const img = new Image();
        img.onload = () => {
            // Determine if this is a B-E layer (indices 5-8)
            const isSplitSheet = RRTilesetSheets.isNormalSheetIndex(imageIndex);

            // Check if we have a cached base image
            const cacheKey = this.baseCacheKey(imageIndex, fileName);
            let baseCanvas = this.imageCache.get(cacheKey);

            if (!baseCanvas) {
                // Create and cache the base image
                if (isSplitSheet) {
                    // B-E layers: Split in half vertically and stack
                    const halfWidth = img.width / 2;
                    const scale = 1;

                    baseCanvas = document.createElement('canvas');
                    baseCanvas.width = halfWidth * scale;
                    baseCanvas.height = img.height * 2 * scale;

                    const baseCtx = baseCanvas.getContext('2d');
                    baseCtx.imageSmoothingEnabled = false;

                    // Draw left half on top
                    baseCtx.drawImage(img, 0, 0, halfWidth, img.height, 0, 0, halfWidth * scale, img.height * scale);
                    // Draw right half on bottom
                    baseCtx.drawImage(img, halfWidth, 0, halfWidth, img.height, 0, img.height * scale, halfWidth * scale, img.height * scale);
                    // Draw grid
                    this.drawTilesetGrid(baseCtx, halfWidth, img.height * 2, scale);
                } else {
                    // A1-A5 layers
                    const layerNames = ['A1', 'A2', 'A3', 'A4', 'A5'];
                    const layerName = layerNames[imageIndex];

                    // For A1-A4 autotiles, show representative preview tiles only
                    if (imageIndex >= 0 && imageIndex <= 3) {
                        // A1-A4: Use autotile palette rendering
                        const tempCanvas = document.createElement('canvas');
                        const tempCtx = tempCanvas.getContext('2d');
                        this.renderAutotilePalette(tempCtx, img, layerName);

                        baseCanvas = tempCanvas;
                    } else {
                        // A5: Display as-is
                        const scale = 1;

                        baseCanvas = document.createElement('canvas');
                        baseCanvas.width = img.width * scale;
                        baseCanvas.height = img.height * scale;

                        const baseCtx = baseCanvas.getContext('2d');
                        baseCtx.imageSmoothingEnabled = false;

                        // Draw the tileset image
                        baseCtx.drawImage(img, 0, 0, img.width, img.height, 0, 0, img.width * scale, img.height * scale);
                        // Draw grid
                        this.drawTilesetGrid(baseCtx, img.width, img.height, scale);
                    }
                }

                // Cache the base canvas
                this.imageCache.set(cacheKey, baseCanvas);
            }

            // Create display canvas by copying base
            const canvas = document.createElement('canvas');
            canvas.width = baseCanvas.width;
            canvas.height = baseCanvas.height;
            canvas.style.border = '1px solid var(--color-border-input)';
            canvas.style.cursor = 'crosshair';
            canvas.style.imageRendering = 'pixelated';

            const ctx = canvas.getContext('2d');
            ctx.imageSmoothingEnabled = false;

            // Copy base image
            ctx.drawImage(baseCanvas, 0, 0);

            // Draw the passage flags overlay
            this.drawCompactPassageOverlay(ctx, canvas.width, canvas.height, imageIndex, isSplitSheet);

            // Draw selection highlight if a tile is selected
            if (this.selectedTile) {
                this.drawSelectionHighlight(ctx, this.selectedTile.x, this.selectedTile.y, isSplitSheet);
            }

            // Set up click handler
            canvas.addEventListener('click', (e) => {
                this.handleCompactCanvasClick(e, canvas, imageIndex, fileName, isSplitSheet);
            });
            this.attachTile3DDrag(canvas, imageIndex, isSplitSheet);
            this.attachPassageBrushDrag(canvas, imageIndex, isSplitSheet);

            // Store current canvas info for updates
            this.currentCanvas = { canvas, ctx, imageIndex, isSplitSheet, baseCanvas };

            // Replace container content with canvas
            container.innerHTML = '';
            container.appendChild(canvas);
        };

        img.onerror = () => {
            container.innerHTML = `<p style="color: #f44; font-size: 11px;">${tt('Failed to load image:')} ${rrEscapeHtml(fileName)}</p>`;
        };

        img.src = this.assetUrl(imagePath);
    }

    // Redraw just the overlay without recreating the canvas (prevents flicker)
    redrawOverlay() {
        if (!this.currentCanvas) {
            console.warn('No current canvas to redraw');
            return;
        }

        const { canvas, ctx, imageIndex, isSplitSheet, baseCanvas } = this.currentCanvas;

        // Clear and redraw from base
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(baseCanvas, 0, 0);

        // Redraw passage overlay
        this.drawCompactPassageOverlay(ctx, canvas.width, canvas.height, imageIndex, isSplitSheet);

        // Redraw selection highlight if a tile is selected
        if (this.selectedTile) {
            this.drawSelectionHighlight(ctx, this.selectedTile.x, this.selectedTile.y, isSplitSheet);
        }
    }

    /** Repaint every canvas currently on screen, whichever view is showing. */
    refreshOverlays() {
        if (this.currentCanvas) {
            this.redrawOverlay();
            return;
        }
        for (const entry of this.tabCanvases || []) {
            this.redrawCanvasOverlay(entry.canvas, entry.imageIndex, entry.isSplitSheet);
        }
    }

    // Redraw overlay on a specific canvas (for tab view with multiple canvases)
    redrawCanvasOverlay(canvas, imageIndex, isSplitSheet) {
        const ctx = canvas.getContext('2d');

        // Get the cached base canvas for this layer
        const fileName = this.currentTileset.tilesetNames[imageIndex];
        // Normalize fileName to include .png extension (must match how it was cached)
        const cacheKey = this.baseCacheKey(imageIndex, fileName);

        console.log(`Attempting to redraw overlay for imageIndex ${imageIndex}, fileName: ${fileName}, cacheKey: ${cacheKey}`);

        const baseCanvas = this.imageCache.get(cacheKey);

        if (!baseCanvas) {
            console.warn(`No cached base canvas found for key: ${cacheKey}`);
            console.warn('Available cache keys:', Array.from(this.imageCache.keys()));
            return;
        }

        console.log('Found base canvas, redrawing overlay');

        // Clear and redraw from base
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(baseCanvas, 0, 0);

        // Redraw passage overlay
        this.drawCompactPassageOverlay(ctx, canvas.width, canvas.height, imageIndex, isSplitSheet);

        // Redraw selection highlight if a tile is selected
        if (this.selectedTile) {
            this.drawSelectionHighlight(ctx, this.selectedTile.x, this.selectedTile.y, isSplitSheet);
        }
    }

    // Draw 48x48 grid over tileset (like map editor)
    drawTilesetGrid(ctx, width, height, scale) {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.lineWidth = 1;

        const tileSize = this.tileSize * scale;

        // Draw vertical lines
        for (let x = 0; x <= width * scale; x += tileSize) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, height * scale);
            ctx.stroke();
        }

        // Draw horizontal lines
        for (let y = 0; y <= height * scale; y += tileSize) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(width * scale, y);
            ctx.stroke();
        }
    }

    // Render autotile palette showing representative tiles only (one per autotile kind)
    renderAutotilePalette(ctx, img, layer) {
        const canvas = ctx.canvas;
        const tileSize = this.tileSize;

        // Autotile palette layout:
        // A1: 16 kinds (8 cols × 2 rows - water types + waterfalls spread horizontally)
        // A2: 32 kinds (8 cols × 4 rows - ground autotiles)
        // A3: 32 kinds (8 cols × 4 rows - building/wall autotiles)
        // A4: 48 kinds (8 cols × 6 rows - wall and roof autotiles)

        let gridCols, gridRows;

        switch(layer) {
            case 'A1':
                gridCols = 8;
                gridRows = 2;
                break;
            case 'A2':
                gridCols = 8;
                gridRows = 4;
                break;
            case 'A3':
                gridCols = 8;
                gridRows = 4;
                break;
            case 'A4':
                gridCols = 8;
                gridRows = 6;
                break;
        }

        canvas.width = gridCols * tileSize;
        canvas.height = gridRows * tileSize;

        // Clear canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.imageSmoothingEnabled = false;

        // Draw each autotile preview
        for (let row = 0; row < gridRows; row++) {
            for (let col = 0; col < gridCols; col++) {
                const destX = col * tileSize;
                const destY = row * tileSize;
                const kindIndex = row * gridCols + col;

                // Draw properly assembled autotile preview
                this.drawAutotilePreview(ctx, img, layer, kindIndex, destX, destY, tileSize);
            }
        }

        // Draw grid
        this.drawTilesetGrid(ctx, canvas.width, canvas.height, 1);
    }

    drawAutotilePreview(ctx, img, layer, kindIndex, destX, destY, tileSize) {
        // Each autotile "kind" is arranged in a 2x3 block (96px wide, 144px tall for A2-A4)
        // The top-left tile (48x48) is the preview tile used in the palette

        let srcX, srcY;

        if (layer === 'A1') {
            // A1: 8 cols × 2 rows layout
            const sourceRow = Math.floor(kindIndex / 4); // 0-3 (4 autotiles per source row)
            const blockInRow = kindIndex % 4; // Which of the 4 blocks (0,3,4,7)

            // Map to actual block positions: 0->block0, 1->block3, 2->block4, 3->block7
            const blockMap = [0, 3, 4, 7];
            const block = blockMap[blockInRow];

            srcX = block * tileSize * 2;  // Block position in pixels
            srcY = sourceRow * tileSize * 3;  // Source row in pixels
        } else if (layer === 'A2') {
            // A2: Ground autotiles (8 columns × 4 rows of 2x3 blocks)
            const col = kindIndex % 8;
            const row = Math.floor(kindIndex / 8);
            srcX = col * tileSize * 2;  // Each block is 2 tiles (96px) wide
            srcY = row * tileSize * 3;  // Each block is 3 tiles (144px) tall
        } else if (layer === 'A3') {
            // A3: Building/wall autotiles (8 columns × 4 rows of 2x2 blocks)
            const col = kindIndex % 8;
            const row = Math.floor(kindIndex / 8);
            srcX = col * tileSize * 2;  // Each block is 2 tiles (96px) wide
            srcY = row * tileSize * 2;  // Each block is 2 tiles (96px) tall for A3
        } else if (layer === 'A4') {
            // A4: Wall and roof autotiles (8 columns × 6 rows)
            const col = kindIndex % 8;
            const row = Math.floor(kindIndex / 8);
            srcX = col * tileSize * 2;  // Each block is 2 tiles (96px) wide

            // Calculate Y position: roofs are 3 tiles tall, walls are 2 tiles tall
            const pairIndex = Math.floor(row / 2);  // Which roof+wall pair (0, 1, or 2)
            const isWall = row % 2 === 1;
            srcY = pairIndex * tileSize * 5 + (isWall ? tileSize * 3 : 0);
        }

        // Extract just the top-left preview tile (48x48)
        ctx.drawImage(
            img,
            srcX, srcY,
            tileSize, tileSize,
            destX, destY,
            tileSize, tileSize
        );
    }

    // Get tile index in flags array for a given image and tile position
    // Based on RPG Maker MZ's tileset indexing system
    getTileIndexForImage(imageIndex, tileX, tileY, tilesPerRow) {
        // RPG Maker MZ tileset flag indices:
        // B-E tiles (imageIndex 5-8): Start at 0
        // A5 tiles (imageIndex 4): Start at 1536
        // A1 autotiles (imageIndex 0): Start at 2048
        // A2 autotiles (imageIndex 1): Start at 2816
        // A3 autotiles (imageIndex 2): Start at 4352
        // A4 autotiles (imageIndex 3): Start at 5888

        const tileOffset = tileY * tilesPerRow + tileX;

        switch(imageIndex) {
            // A1-A4 palettes show one cell per autotile KIND, and each kind
            // occupies 48 consecutive flag slots (one per shape). Indexing
            // by the raw cell offset landed every edit on a shape slot of
            // kind 0 — the runtime then read the untouched real slot, so
            // passability/ladder/terrain edits on autotiles never took
            // effect in game (and the editor overlay read back through the
            // same wrong slot, hiding it).
            case 0: // A1
                return 2048 + tileOffset * 48;
            case 1: // A2
                return 2816 + tileOffset * 48;
            case 2: // A3
                return 4352 + tileOffset * 48;
            case 3: // A4
                return 5888 + tileOffset * 48;
            case 4: // A5
                return 1536 + tileOffset;
            case 5: // B
                return 0 + tileOffset;
            case 6: // C
                return 256 + tileOffset; // B is 16x16 = 256 tiles
            case 7: // D
                return 512 + tileOffset;
            case 8: // E
                return 768 + tileOffset;
            // F and G occupy 1024-1535, the band MZ leaves unallocated between
            // E and A5. The 8192-entry flags array already covers it.
            case 9: // F
                return 1024 + tileOffset;
            case 10: // G
                return 1280 + tileOffset;
            default:
                return 0;
        }
    }

    // Draw passage overlay for compact UI
    /**
     * Draw a flag glyph with a dark outline behind it.
     *
     * The markers are painted straight onto the tileset art, so a light glyph
     * over light pixels (or a red X over red brickwork) disappeared entirely.
     * Stroking the same text underneath in near-black gives every marker an
     * edge regardless of what is behind it; `lineJoin: round` keeps the
     * corners of X and the star from spiking.
     */
    drawFlagGlyph(ctx, text, x, y, outlineWidth = 4) {
        const previous = {
            strokeStyle: ctx.strokeStyle,
            lineWidth: ctx.lineWidth,
            lineJoin: ctx.lineJoin
        };
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.9)';
        ctx.lineWidth = outlineWidth;
        ctx.lineJoin = 'round';
        ctx.strokeText(text, x, y);
        ctx.fillText(text, x, y);
        ctx.strokeStyle = previous.strokeStyle;
        ctx.lineWidth = previous.lineWidth;
        ctx.lineJoin = previous.lineJoin;
    }

    /**
     * Filled dot with a dark rim.
     *
     * The markers sit directly on the tile art, so a soft drop shadow was not
     * enough separation against busy or same-hued pixels; each shape carries an
     * explicit edge instead.
     */
    drawFlagDot(ctx, x, y, radius, fill) {
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fillStyle = fill;
        ctx.fill();
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.9)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
    }

    /** Chevron drawn dark-and-wide first, then the colour on top. */
    drawFlagArrow(ctx, points, color) {
        const trace = () => {
            ctx.beginPath();
            ctx.moveTo(points[0], points[1]);
            ctx.lineTo(points[2], points[3]);
            ctx.lineTo(points[4], points[5]);
        };
        const previousCap = ctx.lineCap;
        const previousJoin = ctx.lineJoin;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        trace();
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.9)';
        ctx.lineWidth = 5;
        ctx.stroke();
        trace();
        ctx.strokeStyle = color;
        ctx.lineWidth = 2.5;
        ctx.stroke();
        ctx.lineCap = previousCap;
        ctx.lineJoin = previousJoin;
    }

    /**
     * How much the overlay marks are scaled for the cell they sit in.
     *
     * The passage arrows, the flag icons and the 3D class marks are drawn at
     * fixed sizes chosen for a 48-pixel cell, and deliberately kept at that
     * size on a 32-pixel one so they stay legible rather than shrinking to
     * nothing. Below that the cell is smaller than the mark: a margin of 8
     * puts the left and right arrows of a 16-pixel tile on the same point, a
     * ladder icon 16 pixels tall runs into the tile beneath it, and a width of
     * `tileSize - 26` comes out negative — which `fillRect` draws *backwards*,
     * into the neighbouring tile, rather than clipping away.
     *
     * Capped at 1 so 48 and 32 are untouched.
     */
    markScale() {
        return Math.min(1, this.tileSize / 32);
    }

    /** Filled rectangle with a dark border. */
    drawFlagRect(ctx, x, y, w, h, fill) {
        ctx.fillStyle = fill;
        ctx.fillRect(x, y, w, h);
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.9)';
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    }

    /**
     * Which tiles stand up in 3D.
     *
     * Drawn instead of the flag markers rather than alongside them: a tile
     * already carries up to seven flag glyphs, and classifying a building means
     * reading its shape in the art, which needs the sheet mostly uncovered.
     */
    drawTile3DOverlay(ctx, width, height, imageIndex) {
        const classes = this.tileset3DClasses();
        const store = this.tileset3DStore();
        if (!classes || !store || !this.currentTileset) return;

        const tilesetId = this.currentTileset.id;
        const tilesX = Math.floor(width / this.tileSize);
        const tilesY = Math.floor(height / this.tileSize);

        // Which kinds are somebody's roof. Gathered once rather than searched
        // per tile: the sheet is up to 256 cells and the list is short.
        const roofTiles = new Set();
        const named = store.materials && store.materials[String(tilesetId)];
        for (const key of Object.keys(named || {})) {
            const top = named[key] && named[key].top;
            if (top) roofTiles.add(classes.keyFor(top));
        }

        for (let y = 0; y < tilesY; y++) {
            for (let x = 0; x < tilesX; x++) {
                const tileIndex = this.getTileIndexForImage(imageIndex, x, y, tilesX);
                const value = classes.classOf(store, tilesetId, tileIndex);

                const drawX = x * this.tileSize;
                const drawY = y * this.tileSize;
                const centerX = drawX + this.tileSize / 2;
                const centerY = drawY + this.tileSize / 2;
                // A declared object is drawn over the classes: an outline round
                // the whole rectangle, and a bar on any cell the author has
                // laid flat. The two say different things — the class is what
                // an unattached tile is, the role is how a tile behaves inside
                // the object it belongs to — so both have to be visible at once.
                const member = classes.objectAt(store, tilesetId, tileIndex);
                if (member) {
                    const { object, dc, dr, role } = member;
                    // The selection traces this same rectangle, so drawing the
                    // object's own outline as well left two rings a pixel
                    // apart round one object.
                    const isSelected = this._selected3dObject
                        && this._selected3dObject.tile === object.tile;
                    // Only the outer edges, so a block reads as one object
                    // rather than as a grid of boxes. When the object is the
                    // selected one the selection ring traces exactly this
                    // rectangle, so this is left off and there is one box.
                    if (!isSelected) {
                        ctx.save();
                        ctx.strokeStyle = 'rgba(255, 235, 130, 0.95)';
                        ctx.lineWidth = 2;
                        ctx.beginPath();
                        if (dr === 0) { ctx.moveTo(drawX, drawY + 1); ctx.lineTo(drawX + this.tileSize, drawY + 1); }
                        if (dr === object.h - 1) {
                            ctx.moveTo(drawX, drawY + this.tileSize - 1);
                            ctx.lineTo(drawX + this.tileSize, drawY + this.tileSize - 1);
                        }
                        if (dc === 0) { ctx.moveTo(drawX + 1, drawY); ctx.lineTo(drawX + 1, drawY + this.tileSize); }
                        if (dc === object.w - 1) {
                            ctx.moveTo(drawX + this.tileSize - 1, drawY);
                            ctx.lineTo(drawX + this.tileSize - 1, drawY + this.tileSize);
                        }
                        ctx.stroke();
                        ctx.restore();
                    }
                    if (role === classes.FLAT) {
                        const s = this.markScale();
                        this.drawFlagRect(ctx, drawX + 7 * s, centerY - 2 * s,
                            this.tileSize - 14 * s, 5 * s, 'rgba(255, 235, 130, 0.98)');
                    }
                }
                // A wall that has been given a roof, and the roof it was
                // given. Drawn before the class check, because the pairing is
                // worth seeing on a wall nobody has classified yet.
                const material = classes.materialOf
                    ? classes.materialOf(store, tilesetId, tileIndex) : null;
                if (material && material.top) {
                    this.drawRoofMark(ctx, drawX, drawY, 'wall');
                }
                if (roofTiles && roofTiles.has(classes.keyFor(tileIndex))) {
                    this.drawRoofMark(ctx, drawX, drawY, 'top');
                }

                if (value === classes.AUTO) continue;

                // Inside a declared object the class is drawn once, in the
                // middle of the object. Drawn on every cell it read as four
                // separate mountains rather than one mountain drawn across
                // four cells, which is the opposite of what the declaration
                // says; drawn in the object's top-left corner it read as one
                // cell of the object standing up while the rest lay flat. The
                // tint still covers the whole object.
                const markHere = !member || (member.dc === 0 && member.dr === 0);

                // The glyph keeps its size — it has to stay legible on a 32
                // pixel tile — and moves to the centre of whatever it
                // describes. Everything below places itself inside a
                // tile-sized box around this point.
                const glyphX = member
                    ? (x - member.dc) * this.tileSize + member.object.w * this.tileSize / 2
                    : centerX;
                let glyphY = member
                    ? (y - member.dr) * this.tileSize + member.object.h * this.tileSize / 2
                    : centerY;

                // A cell laid flat inside the object draws its own bar across
                // the middle of that cell. Where the object's centre lands on
                // one, the two marks sat on top of each other; the class rises
                // clear of it, since the bar is about that cell and the class
                // is about the whole object. Raised, the class drops its own
                // ground line — the flat bar directly beneath it is a
                // horizontal line already, and two of them in one cell is a
                // muddle rather than a description.
                const raised = !!member && markHere
                    && this.tile3dCentreIsFlat(member, x, y, imageIndex, tilesX);
                if (raised) {
                    const objectTop = (y - member.dr) * this.tileSize;
                    glyphY = Math.max(objectTop + 14 * this.markScale(), glyphY - this.tileSize / 3);
                }
                const boxX = glyphX - this.tileSize / 2;
                const boxY = glyphY - this.tileSize / 2;

                const panel = value === classes.PANEL;
                const upright = value === classes.UPRIGHT;
                const scenery = value === classes.SCENERY;
                const foliage = value === classes.FOLIAGE;

                ctx.fillStyle = panel
                    ? 'rgba(200, 150, 255, 0.22)'
                    : foliage ? 'rgba(90, 210, 150, 0.22)'
                        : scenery ? 'rgba(120, 230, 120, 0.20)'
                            : upright ? 'rgba(255, 170, 40, 0.22)' : 'rgba(70, 190, 255, 0.18)';
                ctx.fillRect(drawX, drawY, this.tileSize, this.tileSize);
                if (!markHere) continue;

                // Every offset below is measured for a 48-pixel cell and holds
                // at 32; on a smaller tile it has to come in with the cell or
                // it draws outside it. See markScale.
                const s = this.markScale();
                if (panel) {
                    // A slab with a visible edge: it faces a way and has a
                    // little depth, which is what separates it from a cut-out
                    // that turns to follow the camera.
                    this.drawFlagRect(ctx, boxX + 11 * s, boxY + 12 * s, this.tileSize - 26 * s,
                        this.tileSize - 24 * s, 'rgba(210, 170, 255, 0.98)');
                    this.drawFlagRect(ctx, boxX + this.tileSize - 15 * s, boxY + 15 * s, 4 * s,
                        this.tileSize - 28 * s, 'rgba(150, 110, 200, 0.98)');
                } else if (foliage) {
                    // Two small chevrons over an unbroken ground line: this
                    // tile is a crowd of separate things standing on ground
                    // that stays where it is, rather than one mass or one wall.
                    this.drawFlagArrow(ctx, [
                        glyphX - 10 * s, glyphY + 2 * s,
                        glyphX - 5 * s, glyphY - 7 * s,
                        glyphX, glyphY + 2 * s
                    ], 'rgba(130, 240, 185, 0.98)');
                    this.drawFlagArrow(ctx, [
                        glyphX + 1 * s, glyphY + 4 * s,
                        glyphX + 6 * s, glyphY - 4 * s,
                        glyphX + 11 * s, glyphY + 4 * s
                    ], 'rgba(130, 240, 185, 0.98)');
                    if (!raised) {
                        this.drawFlagRect(ctx, boxX + 8 * s, boxY + this.tileSize - 12 * s,
                            this.tileSize - 16 * s, 3 * s, 'rgba(130, 240, 185, 0.98)');
                    }
                } else if (scenery) {
                    // A single standing tile: one chevron on its own base, in
                    // contrast to Upright's chevron on a full-width ground line.
                    this.drawFlagArrow(ctx, [
                        glyphX - 7 * s, glyphY + 3 * s,
                        glyphX, glyphY - 7 * s,
                        glyphX + 7 * s, glyphY + 3 * s
                    ], 'rgba(150, 245, 150, 0.98)');
                    if (!raised) {
                        this.drawFlagRect(ctx, glyphX - 7 * s, boxY + this.tileSize - 13 * s,
                            14 * s, 4 * s, 'rgba(150, 245, 150, 0.98)');
                    }
                } else if (upright) {
                    // A chevron rising from a ground line: this tile is part of
                    // something that stands where it is painted.
                    this.drawFlagArrow(ctx, [
                        glyphX - 11 * s, glyphY + 5 * s,
                        glyphX, glyphY - 9 * s,
                        glyphX + 11 * s, glyphY + 5 * s
                    ], 'rgba(255, 196, 80, 0.98)');
                    if (!raised) {
                        this.drawFlagRect(ctx, boxX + 10 * s, boxY + this.tileSize - 13 * s,
                            this.tileSize - 20 * s, 4 * s, 'rgba(255, 196, 80, 0.98)');
                    }
                } else {
                    this.drawFlagRect(ctx, boxX + 9 * s, glyphY - 2 * s, this.tileSize - 18 * s,
                        5 * s, 'rgba(130, 220, 255, 0.98)');
                }
            }
        }

        // What is selected, drawn over the classes: the whole object when one
        // is selected, so a 2x2 mountain highlights as a mountain rather than
        // as whichever of its four squares happened to be clicked.
        const chosen = this.selected3dRect;
        if (chosen && (chosen.imageIndex === undefined || chosen.imageIndex === imageIndex)) {
            // A selection stored in sheet coordinates belongs to a declared
            // object, and an object wide enough to cross column eight is one
            // rectangle on the sheet shown as two stacked pieces in the
            // palette. Each piece gets the wash and the ring, so a reactor
            // spanning both halves reads as one selected object instead of
            // drawing one box at coordinates that exist on neither piece.
            const pieces = [];
            if (chosen.sheet) {
                const s = chosen.sheet;
                const leftWidth = Math.min(s.col + s.w, 8) - s.col;
                if (leftWidth > 0) pieces.push({ x: s.col, y: s.row, w: leftWidth, h: s.h });
                const rightStart = Math.max(s.col, 8);
                if (s.col + s.w > rightStart) {
                    pieces.push({
                        x: rightStart - 8, y: s.row + 16,
                        w: s.col + s.w - rightStart, h: s.h
                    });
                }
            } else {
                pieces.push(chosen);
            }
            ctx.save();
            for (const piece of pieces) {
                const left = piece.x * this.tileSize, top = piece.y * this.tileSize;
                const wide = piece.w * this.tileSize, high = piece.h * this.tileSize;
                // A declared object's own outline is suppressed while it is
                // selected, so this ring is the only box drawn round it. The
                // wash covers the whole rectangle, which is what says the
                // selection is the object rather than the cell that was
                // clicked.
                ctx.fillStyle = 'rgba(90, 190, 255, 0.14)';
                ctx.fillRect(left, top, wide, high);
                ctx.strokeStyle = 'rgba(120, 205, 255, 0.98)';
                ctx.lineWidth = 3;
                ctx.strokeRect(left + 1.5, top + 1.5, wide - 3, high - 3);
            }
            ctx.restore();
        }

        // The rectangle being dragged, drawn last so it sits over everything.
        const drag = this._tile3dDrag;
        if (drag && drag.imageIndex === imageIndex) {
            const { x0, x1, y0, y1 } = DatabaseTilesetEditor.dragBounds(drag);
            const left = x0 * this.tileSize, top = y0 * this.tileSize;
            const wide = (x1 - x0 + 1) * this.tileSize, high = (y1 - y0 + 1) * this.tileSize;
            ctx.save();
            ctx.fillStyle = 'rgba(255, 235, 130, 0.16)';
            ctx.fillRect(left, top, wide, high);
            ctx.strokeStyle = 'rgba(255, 235, 130, 0.95)';
            ctx.setLineDash([5, 3]);
            ctx.lineWidth = 2;
            ctx.strokeRect(left + 1, top + 1, wide - 2, high - 2);
            ctx.restore();
        }
    }

    drawCompactPassageOverlay(ctx, width, height, imageIndex, isSplitSheet) {
        if (this.currentEditMode === 'tile3d') {
            this.drawTile3DOverlay(ctx, width, height, imageIndex);
            return;
        }

        const tilesX = Math.floor(width / this.tileSize);
        const tilesY = Math.floor(height / this.tileSize);

        for (let y = 0; y < tilesY; y++) {
            for (let x = 0; x < tilesX; x++) {
                // For B-E layers, flags are stored in 8-column split layout order
                // So we just use x,y directly (no remapping needed)
                const tileIndex = this.getTileIndexForImage(imageIndex, x, y, tilesX);
                const flag = this.currentTileset.flags[tileIndex] || 0;

                // Drawing coordinates (use actual canvas position x, y)
                const drawX = x * this.tileSize;
                const drawY = y * this.tileSize;
                const centerX = drawX + this.tileSize / 2;
                const centerY = drawY + this.tileSize / 2;

                const passageBits = flag & 0x0F; // Bits 0-3 for directions
                const aboveChar = flag & 0x10;   // Bit 4 for above characters

                // Draw O for fully passable tiles (bits 0-3 all clear, bit 4 also clear)
                if (passageBits === 0 && !aboveChar) {
                    ctx.fillStyle = 'rgba(120, 255, 120, 0.95)';
                    ctx.font = `bold ${28 * this.markScale()}px Arial`;
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    this.drawFlagGlyph(ctx, 'O', centerX, centerY);
                }

                // Draw X for fully impassable tiles (all direction bits set: 0x0F)
                if (passageBits === 0x0F) {
                    ctx.fillStyle = 'rgba(255, 60, 60, 0.95)';
                    ctx.font = `bold ${32 * this.markScale()}px Arial`;
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    this.drawFlagGlyph(ctx, 'X', centerX, centerY);
                }

                // Draw 4-dir passage indicators (arrows for passable, dots for blocked)
                // Don't show if we're displaying O, X, or ★
                const isO = passageBits === 0 && !aboveChar;
                const isX = passageBits === 0x0F;
                const isStar = aboveChar;

                if (!isO && !isX && !isStar) {
                    // A margin of 8 lands the left and right markers of a
                    // 16-pixel tile on the same point, so all four directions
                    // read as one blob. See markScale.
                    const s = this.markScale();
                    const margin = 8 * s;
                    const arrowSize = 6 * s;
                    const dotRadius = 3 * s;

                    // Down: bit 0 (SET = blocked, CLEAR = passable)
                    if (flag & 0x01) {
                        // Blocked - show dot
                        this.drawFlagDot(ctx, centerX, drawY + this.tileSize - margin, dotRadius, 'rgba(255, 110, 110, 0.95)');
                    } else {
                        // Passable - show outward arrow
                        this.drawFlagArrow(ctx, [centerX - arrowSize, drawY + this.tileSize - margin - arrowSize, centerX, drawY + this.tileSize - margin, centerX + arrowSize, drawY + this.tileSize - margin - arrowSize], 'rgba(120, 255, 120, 0.95)');
                    }

                    // Left: bit 1
                    if (flag & 0x02) {
                        // Blocked - show dot
                        this.drawFlagDot(ctx, drawX + margin, centerY, dotRadius, 'rgba(255, 110, 110, 0.95)');
                    } else {
                        // Passable - show outward arrow
                        this.drawFlagArrow(ctx, [drawX + margin + arrowSize, centerY - arrowSize, drawX + margin, centerY, drawX + margin + arrowSize, centerY + arrowSize], 'rgba(120, 255, 120, 0.95)');
                    }

                    // Right: bit 2
                    if (flag & 0x04) {
                        // Blocked - show dot
                        this.drawFlagDot(ctx, drawX + this.tileSize - margin, centerY, dotRadius, 'rgba(255, 110, 110, 0.95)');
                    } else {
                        // Passable - show outward arrow
                        this.drawFlagArrow(ctx, [drawX + this.tileSize - margin - arrowSize, centerY - arrowSize, drawX + this.tileSize - margin, centerY, drawX + this.tileSize - margin - arrowSize, centerY + arrowSize], 'rgba(120, 255, 120, 0.95)');
                    }

                    // Up: bit 3
                    if (flag & 0x08) {
                        // Blocked - show dot
                        this.drawFlagDot(ctx, centerX, drawY + margin, dotRadius, 'rgba(255, 110, 110, 0.95)');
                    } else {
                        // Passable - show outward arrow
                        this.drawFlagArrow(ctx, [centerX - arrowSize, drawY + margin + arrowSize, centerX, drawY + margin, centerX + arrowSize, drawY + margin + arrowSize], 'rgba(120, 255, 120, 0.95)');
                    }
                }

                // Draw star for above characters (bit 4 set)
                if (flag & 0x10) {
                    ctx.fillStyle = 'rgba(255, 215, 0, 0.95)';
                    ctx.font = `bold ${this.tileSize - 10}px Arial`;
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    this.drawFlagGlyph(ctx, '★', centerX, centerY);
                }

                // Draw ladder icon (bit 5 set) - in top-left corner
                if (flag & 0x20) {
                    const s = this.markScale();
                    this.drawFlagRect(ctx, drawX + 4 * s, drawY + 4 * s, 8 * s, 16 * s,
                        'rgba(160, 210, 255, 0.95)');
                    // Rungs, drawn over the outlined stile
                    ctx.fillStyle = 'rgba(30, 30, 120, 0.95)';
                    ctx.fillRect(drawX + 3 * s, drawY + 7 * s, 10 * s, 2 * s);
                    ctx.fillRect(drawX + 3 * s, drawY + 11 * s, 10 * s, 2 * s);
                    ctx.fillRect(drawX + 3 * s, drawY + 15 * s, 10 * s, 2 * s);
                }

                // Draw bush icon (bit 6 set) - a shrub in the top-right corner.
                // A plain dot was indistinguishable from every other dot on the
                // sheet; a silhouette says which flag it is at a glance.
                if (flag & 0x40) {
                    const s = this.markScale();
                    this.drawBushMark(ctx, drawX + this.tileSize - 12 * s, drawY + 4 * s, 14 * s);
                }

                // Draw counter icon (bit 7 set) - purple bar in bottom-left
                if (flag & 0x80) {
                    const s = this.markScale();
                    this.drawFlagRect(ctx, drawX + 4 * s, drawY + this.tileSize - 8 * s,
                        16 * s, 4 * s, 'rgba(210, 160, 255, 0.95)');
                }

                // Draw damage floor icon (bit 8 set) - warning symbol in bottom-right
                if (flag & 0x100) {
                    ctx.fillStyle = 'rgba(255, 100, 0, 0.95)';
                    ctx.font = `bold ${this.tileSize / 3}px Arial`;
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    const s = this.markScale();
                    this.drawFlagGlyph(ctx, '⚠', drawX + this.tileSize - 12 * s,
                        drawY + this.tileSize - 12 * s, 3);
                }

                // Draw terrain tag. Game_Map.terrainTag is `flags[tile] >> 12`
                // with no mask, so read it the same way — masking here would
                // show a plausible 0-15 for a flag the engine reads as garbage.
                const terrainTag = flag >>> 12;
                if (terrainTag > 0) {
                    ctx.font = `bold ${this.tileSize / 3}px Arial`;
                    ctx.textAlign = 'right';
                    ctx.textBaseline = 'top';
                    // Draw black border
                    ctx.strokeStyle = '#000000';
                    ctx.lineWidth = 3;
                    const s = this.markScale();
                    ctx.strokeText(terrainTag.toString(), drawX + this.tileSize - 4 * s, drawY + 2 * s);
                    // Draw white fill
                    ctx.fillStyle = '#FFFFFF';
                    this.drawFlagGlyph(ctx, terrainTag.toString(),
                        drawX + this.tileSize - 4 * s, drawY + 2 * s, 3);
                }
            }
        }
    }

    // Draw selection highlight overlay (like TilesetPaletteViewer)
    drawSelectionHighlight(ctx, tileX, tileY, isSplitSheet) {
        // 3D classification selects whole objects, and draws that selection
        // itself. Drawing this single cell as well put a second box inside the
        // first, which reads as though the click had selected one square of the
        // object rather than the object.
        if (this.currentEditMode === 'tile3d') return;

        const scale = 1;
        const tileSize = this.tileSize * scale;

        // Convert logical tile coordinates to canvas coordinates
        // For B-E layers, tiles in the right half (x >= 8) are drawn in the bottom half
        let canvasX = tileX;
        let canvasY = tileY;

        if (isSplitSheet && tileX >= 8) {
            // Right half of original image (x 8-15) displays in bottom half of canvas
            canvasX = tileX - 8;  // Map x 8-15 to canvas x 0-7
            canvasY = tileY + 16; // Offset down by image height (768px / 48px = 16 tiles)
        }

        // Draw selection rectangle
        ctx.strokeStyle = '#007acc';
        ctx.lineWidth = 3;
        ctx.strokeRect(
            canvasX * tileSize,
            canvasY * tileSize,
            tileSize,
            tileSize
        );

        // Draw semi-transparent overlay
        ctx.fillStyle = 'rgba(0, 122, 204, 0.2)';
        ctx.fillRect(
            canvasX * tileSize,
            canvasY * tileSize,
            tileSize,
            tileSize
        );
    }

    // Handle canvas click for compact UI
    handleCompactCanvasClick(e, canvas, imageIndex, fileName, isSplitSheet) {
        if (!this.currentEditMode) {
            console.warn('No edit mode selected! Click a flag button first');
            return;
        }

        const rect = canvas.getBoundingClientRect();
        const x = Math.floor((e.clientX - rect.left) / this.tileSize);
        const y = Math.floor((e.clientY - rect.top) / this.tileSize);

        const tilesX = Math.floor(canvas.width / this.tileSize);
        const tilesY = Math.floor(canvas.height / this.tileSize);

        // For B-E layers, flags are stored in 8-column split layout order
        // So we just use x,y directly (no remapping needed)
        const tileIndex = this.getTileIndexForImage(imageIndex, x, y, tilesX);

        const oldFlag = this.currentTileset.flags[tileIndex] || 0;
        let currentFlag = oldFlag;

        console.log(`Clicked canvas (${x}, ${y}) at index ${tileIndex}, current flag: ${oldFlag} (0x${oldFlag.toString(16)}), mode: ${this.currentEditMode}`);

        // Store selected tile for highlighting
        this.selectedTile = { x, y };

        // 3D classification is not a tileset flag — it lives in its own file —
        // and it is applied by dragging a rectangle rather than by clicking, so
        // the drag handler owns it entirely. A plain click is a 1x1 drag.
        if (this.currentEditMode === 'tile3d') return;

        // Apply the selected edit mode
        switch (this.currentEditMode) {
            case 'passability':
                // A mark picked in the Key paints its value; the pointer
                // handlers already painted this tile on pointerdown, so the
                // trailing click resolves to the same flag and no-ops.
                if (this.passageBrush) {
                    currentFlag = this.passageBrushFlag(oldFlag);
                    break;
                }
                // Cycle through: O (passable) → X (impassable) → ★ (above) → O
                const passageBits = oldFlag & 0x1F; // Bits 0-4

                if (passageBits === 0) {
                    // Currently O → change to X (set all direction bits 0-3)
                    currentFlag = (oldFlag & ~0x1F) | 0x0F;
                } else if (passageBits === 0x0F) {
                    // Currently X → change to ★ (clear all, set bit 4)
                    currentFlag = (oldFlag & ~0x1F) | 0x10;
                } else {
                    // Currently ★ or something else → change to O (clear all)
                    currentFlag = oldFlag & ~0x1F;
                }
                break;

            case '4dir':
                // Detect which quadrant of the tile was clicked to toggle that direction
                // Get click position within the tile
                const tileOffsetX = (e.clientX - rect.left) - (x * this.tileSize);
                const tileOffsetY = (e.clientY - rect.top) - (y * this.tileSize);
                const halfTile = this.tileSize / 2;

                // Determine which direction was clicked based on quadrant
                let directionBit = 0;

                // Calculate distance from center to determine which edge is closest
                const distToTop = tileOffsetY;
                const distToBottom = this.tileSize - tileOffsetY;
                const distToLeft = tileOffsetX;
                const distToRight = this.tileSize - tileOffsetX;

                const minDist = Math.min(distToTop, distToBottom, distToLeft, distToRight);

                if (minDist === distToTop) {
                    directionBit = 0x08; // Up (bit 3)
                } else if (minDist === distToBottom) {
                    directionBit = 0x01; // Down (bit 0)
                } else if (minDist === distToLeft) {
                    directionBit = 0x02; // Left (bit 1)
                } else {
                    directionBit = 0x04; // Right (bit 2)
                }

                // Toggle the clicked direction bit
                // Also clear bit 4 (above characters) as it's mutually exclusive with 4-dir
                currentFlag = (oldFlag & ~0x10) ^ directionBit;
                break;

            case 'ladder':
                // Toggle ladder bit (bit 5)
                currentFlag = oldFlag ^ 0x20;
                break;

            case 'bush':
                // Toggle bush bit (bit 6)
                currentFlag = oldFlag ^ 0x40;
                break;

            case 'counter':
                // Toggle counter bit (bit 7)
                currentFlag = oldFlag ^ 0x80;
                break;

            case 'damage':
                // Toggle damage floor bit (bit 8)
                currentFlag = oldFlag ^ 0x100;
                break;

            case 'terrain':
                // Cycle terrain tag (bits 12-15) from 0-7
                const currentTerrain = (oldFlag >>> 12) & 0x0F;
                const nextTerrain = (currentTerrain + 1) % 8; // Cycle 0→1→2→3→4→5→6→7→0
                // Clear everything from bit 12 up, not just bits 12-15. The
                // engine reads the tag as an unmasked `flag >> 12`, so leaving
                // higher bits set means the tag written here is not the tag the
                // game sees — third-party tools have been observed writing
                // 32-bit values into this array. Bits 0-11 carry every flag the
                // engine defines (passage 0x0f, star 0x10, ladder 0x20,
                // bush 0x40, counter 0x80, damage floor 0x100) and are kept.
                currentFlag = (oldFlag & 0x0FFF) | (nextTerrain << 12);
                break;
        }

        if (currentFlag !== oldFlag) {
            this.currentTileset.flags[tileIndex] = currentFlag;
            // Autotiles: mirror the flag to all 48 shape slots of the kind —
            // the runtime looks flags up by the FULL tile id (base + shape),
            // exactly as the MZ editor writes them.
            if (tileIndex >= 2048 && tileIndex < 8192) {
                for (let s = 1; s < 48; s++) {
                    this.currentTileset.flags[tileIndex + s] = currentFlag;
                }
            }
            console.log(`Flag changed: ${oldFlag} (0x${oldFlag.toString(16)}) -> ${currentFlag} (0x${currentFlag.toString(16)})`);
            this.repaintClickedCanvas(canvas, imageIndex, isSplitSheet);
            // Announce it. The map canvas holds the tileset it captured when
            // the map opened, so a passability or star change edited here
            // reached it only when the project was closed and reopened.
            // ProjectController already coalesces the burst a few seconds of
            // clicking produces.
            this.notifyTilesetSaved();
        } else {
            console.log('Flag unchanged');
        }
    }

    /**
     * Repaint whichever canvas was clicked.
     *
     * The single-layer view keeps its canvas in `currentCanvas` with a cached
     * base; the A tab stacks several, so the clicked one is redrawn directly.
     */
    repaintClickedCanvas(canvas, imageIndex, isSplitSheet) {
        if (this.currentCanvas && this.currentCanvas.canvas === canvas) {
            this.redrawOverlay();
        } else {
            this.redrawCanvasOverlay(canvas, imageIndex, isSplitSheet);
        }
    }

    /**
     * Advance one tile through Auto -> Flat -> Upright.
     *
     * Autotile ids fold to their kind, so classifying a wall classifies every
     * shape of that wall — see `RRTileset3DClass.keyFor`.
     */
    /**
     * Shift-click twice to say "these tiles are one object".
     *
     * The first click marks a corner, the second declares the rectangle between
     * them. Which tiles belong to one object cannot be inferred: two different
     * objects sitting side by side on the sheet look exactly like one wide
     * object, and autotile terrain gives no grouping at all. Shift-clicking a
     * tile that is already declared clears its object instead, so the same
     * gesture undoes itself.
     */
    markTile3DObject(tileIndex) {
        const classes = this.tileset3DClasses();
        const store = this.tileset3DStore();
        if (!classes || !store || !this.currentTileset) return;
        const tilesetId = this.currentTileset.id;

        if (!this._tile3dCorner) {
            if (classes.objectAt(store, tilesetId, tileIndex)) {
                classes.clearObject(store, tilesetId, tileIndex);
                console.log(`3D object cleared at tile ${tileIndex}`);
                return;
            }
            this._tile3dCorner = tileIndex;
            console.log('3D object: shift-click the opposite corner');
            return;
        }

        const from = classes.sheetCell(this._tile3dCorner);
        const to = classes.sheetCell(tileIndex);
        this._tile3dCorner = null;
        if (from.setNumber !== to.setNumber) return;
        const col = Math.min(from.col, to.col), row = Math.min(from.row, to.row);
        const width = Math.abs(from.col - to.col) + 1;
        const height = Math.abs(from.row - to.row) + 1;
        classes.defineObject(store, tilesetId,
            classes.tileAtCell(from.setNumber, col, row), width, height);
        console.log(`3D object declared: ${width}x${height} from tile ` +
            `${classes.tileAtCell(from.setNumber, col, row)}`);
    }

    /**
     * The mark on a flag-mode button.
     *
     * Drawn as a few strokes rather than a detailed picture: these render at
     * 16px, where anything finer collapses into a smudge. `currentColor` so a
     * selected button's icon follows its text.
     */
    static flagIcon(mode) {
        const open = '<svg class="flag-mode-icon" viewBox="0 0 24 24" width="16" height="16"'
            + ' fill="none" stroke="currentColor" stroke-width="2"'
            + ' stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">';
        const shapes = {
            // A circle over a cross: pass, or do not.
            passability: '<circle cx="12" cy="8" r="4.2"/><path d="M7.8 15.8l8.4 5.2M16.2 15.8l-8.4 5.2"/>',
            // Four arrows from one centre.
            '4dir': '<path d="M12 3v18M3 12h18"/><path d="M12 3l-2.6 3M12 3l2.6 3'
                + 'M12 21l-2.6-3M12 21l2.6-3M3 12l3-2.6M3 12l3 2.6M21 12l-3-2.6M21 12l-3 2.6"/>',
            // A stile: two rails and rungs.
            ladder: '<path d="M8 3v18M16 3v18M8 8h8M8 13h8M8 18h8"/>',
            // A shrub: three overlapping clumps on a line. Drawn as arcs
            // rather than as leaves on stems, which at 16px is one grey blob.
            bush: '<path d="M3.5 20h17"/>'
                + '<path d="M4.5 20a4 4 0 016.2-3.3A5 5 0 0119.5 20z"/>'
                + '<path d="M12 16.8V11M9.6 13.4L12 15M14.4 13.4L12 15"/>',
            // A counter top with a lip, seen end on.
            counter: '<path d="M3 9h18v3H3z"/><path d="M6 12v8M18 12v8"/>',
            // A hazard triangle.
            damage: '<path d="M12 4l8.5 15h-17z"/><path d="M12 10v4M12 17.2v.1"/>',
            // A tag with its hole.
            terrain: '<path d="M4 4h9l7 7-9 9-7-7z"/><circle cx="8.5" cy="8.5" r="1.4"/>',
            // A cube: the one flag that is about three dimensions.
            tile3d: '<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/>'
                + '<path d="M12 21v-9M12 12l8-4.5M12 12L4 7.5"/>'
        };
        return shapes[mode] ? `${open}${shapes[mode]}</svg>` : '';
    }


    /**
     * What the marks in the current mode mean.
     *
     * The overlays draw a lot of small glyphs and none of them announce
     * themselves. The key sits in the margin beside the sheet, and it is built
     * from the same colours the overlay uses so the two cannot drift apart in
     * appearance without drifting apart in code.
     */
    /**
     * What the marks in the current mode mean.
     *
     * Each row's mark is a small canvas drawn by the same code that draws it on
     * a tile, so the key cannot say one thing while the sheet shows another.
     * The first attempt used coloured squares and half of them came out blank,
     * because the flags that matter are drawn as glyphs rather than as tints.
     */
    static flagKeyRows(mode) {
        const rows = {
            passability: [
                ['pass-o', 'Passable'],
                ['pass-x', 'Blocked'],
                ['pass-star', 'Drawn above characters']
            ],
            '4dir': [
                ['dir-open', 'Arrow: that side is open'],
                ['dir-blocked', 'Dot: that side is blocked']
            ],
            ladder: [['ladder', 'Climbed vertically']],
            bush: [['bush', 'Covers the lower half of a character']],
            counter: [['counter', 'Talked and traded across']],
            damage: [['damage', 'Costs HP to stand on']],
            terrain: [['terrain', 'Tag 0-7, read by events and plugins']],
            tile3d: [
                ['3d-flat', 'Flat - lies on the ground'],
                ['3d-upright', 'Upright - part of a standing object'],
                ['3d-scenery', 'Scenery - raises the ground into a mass'],
                ['3d-foliage', 'Foliage - a cut-out per cell, ground unchanged'],
                ['3d-panel', 'Panel - faces a way: a gate, a door, a sign'],
                ['3d-object', 'One declared 3D object'],
                ['3d-role-flat', 'Lies flat within its object'],
                ['3d-roof-wall', 'Wall capped with a roof (Roof tool)'],
                ['3d-roof-top', 'The roof another wall is capped with']
            ]
        };
        return rows[mode] || null;
    }

    static flagKey(mode, passageBrush) {
        const rows = DatabaseTilesetEditor.flagKeyRows(mode);
        if (!rows) return '';
        const tt = text => (typeof window !== 'undefined' && window.I18n)
            ? window.I18n.tText(text) : text;
        // In passability mode the Key doubles as a palette: pick a mark and
        // clicks (and drags) paint that value instead of cycling.
        const brushOf = { 'pass-o': 'o', 'pass-x': 'x', 'pass-star': 'star' };
        const paintable = mode === 'passability';
        const items = rows.map(([mark, label]) => {
            const brush = paintable ? brushOf[mark] : null;
            const active = brush && brush === passageBrush;
            const rowAttrs = brush ? ` data-passage-brush="${brush}"` : '';
            const rowStyle = brush
                ? `cursor:pointer;border-radius:5px;padding:2px 4px;margin:0 -4px 5px -4px;`
                    + `border:1px solid ${active ? 'var(--color-accent-bright)' : 'transparent'};`
                    + `background:${active ? 'var(--color-bg-hover)' : 'transparent'};`
                : 'margin-bottom:7px;';
            return `<div${rowAttrs} style="display:flex;align-items:center;gap:8px;${rowStyle}">`
                + `<canvas class="flag-key-mark" data-mark="${mark}" width="26" height="26" `
                + `style="width:26px;height:26px;flex:0 0 26px;border-radius:4px;`
                + `background:var(--color-bg-deep);pointer-events:none;"></canvas>`
                + `<span style="font-size:10px;color:var(--color-text-muted);line-height:1.3;`
                + `pointer-events:none;">${label}</span></div>`;
        }).join('');
        const hint = paintable
            ? `<p style="font-size:9px;color:var(--color-text-dim);margin:8px 0 0 0;line-height:1.4;">`
                + tt('Click a mark to paint it — click or drag across the sheet. Click the mark again to go back to cycling.') + `</p>`
            : '';
        return `<div style="background:var(--color-bg-panel);border:1px solid var(--color-border);`
            + `border-radius:6px;padding:10px;">`
            + `<h4 style="margin:0 0 8px 0;font-size:9px;text-transform:uppercase;`
            + `letter-spacing:0.5px;color:var(--color-text-muted);">Key</h4>${items}${hint}</div>`;
    }

    /**
     * The tools for 3D authoring, as a palette rather than a cycle.
     *
     * Clicking used to advance a tile through every class, which meant there
     * was no way to look at a tile without changing it. Pick a tool, then
     * click: Select only selects, and each of the others paints one thing.
     */
    static tile3dTools() {
        // Named and described here rather than in the markup, so the labels
        // and the hints go through the same table every other string does —
        // the 3D palette shipped in English on every locale.
        const tt = text => (typeof window !== 'undefined' && window.I18n)
            ? window.I18n.tText(text) : text;
        return [
            ['select', tt('Select'), tt('Look at a tile without changing it')],
            ['flat', tt('Flat'), tt('Lies on the ground')],
            ['upright', tt('Upright'), tt('Part of a standing object')],
            ['scenery', tt('Scenery'), tt('Raises the ground into a mass')],
            ['foliage', tt('Foliage'), tt('A cut-out per cell')],
            ['panel', tt('Panel'), tt('Stands still and faces a way: a gate, door or sign')],
            ['auto', tt('Auto'), tt('Clear the class back to the flag heuristic')],
            ['clear', tt('Clear'), tt('Forget every 3D setting on these tiles: class, object, stand-in and roof')],
            ['object', tt('Object'), tt('Drag a rectangle to group those tiles as one object')],
            ['role', tt('Role'), tt('Lay tiles flat within their object, or stand them')],
            ['top', tt('Roof'), tt('Click a wall, then the roof that covers it')]
        ];
    }

    static tile3dToolbar(active) {
        const buttons = DatabaseTilesetEditor.tile3dTools().map(([id, label, hint]) =>
            `<button class="tile3d-tool" data-tool="${id}" title="${hint}" `
            + `style="font-size:10px;padding:5px 6px;border-radius:4px;cursor:pointer;`
            + `text-align:left;border:1px solid ${id === active
                ? 'var(--color-accent-bright)' : 'var(--color-border-input)'};`
            + `background:${id === active ? 'var(--color-bg-hover)' : 'var(--color-bg-panel)'};`
            + `color:var(--color-text);">${label}</button>`).join('');
        return `<div style="background:var(--color-bg-panel);border:1px solid var(--color-border);`
            + `border-radius:6px;padding:10px;margin-bottom:10px;">`
            + `<h4 style="margin:0 0 8px 0;font-size:9px;text-transform:uppercase;`
            + `letter-spacing:0.5px;color:var(--color-text-muted);">3D tool</h4>`
            + `<div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;">${buttons}</div>`
            + `<p style="font-size:9px;color:var(--color-text-dim);margin:8px 0 0 0;line-height:1.4;">`
            + `Drag a rectangle to apply the tool. A click is a single tile. `
            + `Select changes nothing.</p>`
            + `<p id="tile3d-tool-notice" style="font-size:9px;line-height:1.4;`
            + `color:var(--color-accent-bright);margin:6px 0 0 0;display:none;"></p></div>`;
    }

    /**
     * Say why a tool did nothing.
     *
     * These refusals used to go to the console, which meant the button simply
     * appeared not to work: the commonest of them is declaring an object on an
     * autotile, and nothing on screen said so.
     */
    noteTile3DRefusal(message) {
        const notice = document.getElementById('tile3d-tool-notice');
        if (!notice) return;
        notice.textContent = message;
        notice.style.display = message ? 'block' : 'none';
    }


    /** Redraw the tools and the key for whatever mode is selected. */
    refreshFlagKey() {
        const host = document.getElementById('flag-mode-key');
        if (!host) return;
        if (!this.tile3dTool) this.tile3dTool = 'select';
        const toolbar = this.currentEditMode === 'tile3d'
            ? DatabaseTilesetEditor.tile3dToolbar(this.tile3dTool) : '';
        host.innerHTML = toolbar
            + DatabaseTilesetEditor.flagKey(this.currentEditMode, this.passageBrush);
        for (const canvas of host.querySelectorAll('canvas.flag-key-mark')) {
            this.drawKeyMark(canvas.getContext('2d'), canvas.dataset.mark, canvas.width);
        }
        for (const button of host.querySelectorAll('button.tile3d-tool')) {
            button.addEventListener('click', () => {
                this.tile3dTool = button.dataset.tool;
                // Choosing a tool abandons a half-finished object rectangle.
                this._tile3dCorner = null;
                this.refreshFlagKey();
            });
        }
        for (const row of host.querySelectorAll('[data-passage-brush]')) {
            row.addEventListener('click', () => {
                const brush = row.dataset.passageBrush;
                // The same mark again puts the click back to cycling.
                this.passageBrush = this.passageBrush === brush ? null : brush;
                this.refreshFlagKey();
            });
        }
    }

    /** The flag a passage brush writes, over whatever the tile had. */
    passageBrushFlag(oldFlag) {
        switch (this.passageBrush) {
            case 'o': return oldFlag & ~0x1F;
            case 'x': return (oldFlag & ~0x1F) | 0x0F;
            case 'star': return (oldFlag & ~0x1F) | 0x10;
        }
        return oldFlag;
    }

    /** Write one tile's flag with autotile mirroring, repaint, and announce. */
    writeTileFlag(canvas, imageIndex, isSplitSheet, tileIndex, newFlag) {
        const oldFlag = this.currentTileset.flags[tileIndex] || 0;
        if (newFlag === oldFlag) return false;
        this.currentTileset.flags[tileIndex] = newFlag;
        // Autotiles: mirror the flag to all 48 shape slots of the kind — the
        // runtime looks flags up by the FULL tile id (base + shape).
        if (tileIndex >= 2048 && tileIndex < 8192) {
            for (let s = 1; s < 48; s++) {
                this.currentTileset.flags[tileIndex + s] = newFlag;
            }
        }
        this.repaintClickedCanvas(canvas, imageIndex, isSplitSheet);
        this.notifyTilesetSaved();
        return true;
    }

    /**
     * Sweep-paint the picked passage mark across the sheet.
     *
     * The Key's O/X/star rows are a palette: with one picked, a click paints
     * that value and a drag paints every tile the pointer crosses — retreading
     * a tile is idempotent, so a wobbly sweep cannot cycle anything. With no
     * mark picked the canvases keep their click-to-cycle behaviour untouched.
     */
    attachPassageBrushDrag(canvas, imageIndex, isSplitSheet) {
        if (!canvas || canvas.dataset.passageBrushDrag) return;
        canvas.dataset.passageBrushDrag = '1';

        const cellAt = event => {
            const rect = canvas.getBoundingClientRect();
            const scaleX = canvas.width / rect.width;
            const scaleY = canvas.height / rect.height;
            const lastX = Math.max(0, Math.floor(canvas.width / this.tileSize) - 1);
            const lastY = Math.max(0, Math.floor(canvas.height / this.tileSize) - 1);
            const clamp = (value, last) => Math.max(0, Math.min(last, value));
            return {
                x: clamp(Math.floor(((event.clientX - rect.left) * scaleX) / this.tileSize), lastX),
                y: clamp(Math.floor(((event.clientY - rect.top) * scaleY) / this.tileSize), lastY)
            };
        };

        const paint = cell => {
            const tilesX = Math.floor(canvas.width / this.tileSize);
            const tileIndex = this.getTileIndexForImage(imageIndex, cell.x, cell.y, tilesX);
            const oldFlag = this.currentTileset.flags[tileIndex] || 0;
            this.selectedTile = { x: cell.x, y: cell.y };
            this.writeTileFlag(canvas, imageIndex, isSplitSheet, tileIndex,
                this.passageBrushFlag(oldFlag));
        };

        canvas.addEventListener('pointerdown', event => {
            if (this.currentEditMode !== 'passability' || !this.passageBrush) return;
            event.preventDefault();
            const cell = cellAt(event);
            this._passageBrushDrag = { imageIndex, last: cell };
            canvas.setPointerCapture?.(event.pointerId);
            paint(cell);
        });

        canvas.addEventListener('pointermove', event => {
            const drag = this._passageBrushDrag;
            if (!drag || drag.imageIndex !== imageIndex) return;
            const cell = cellAt(event);
            if (cell.x === drag.last.x && cell.y === drag.last.y) return;
            drag.last = cell;
            paint(cell);
        });

        const release = event => {
            if (!this._passageBrushDrag) return;
            this._passageBrushDrag = null;
            canvas.releasePointerCapture?.(event.pointerId);
        };
        canvas.addEventListener('pointerup', release);
        canvas.addEventListener('pointercancel', release);
    }

    /**
     * One key mark, drawn with the same helpers the tile overlay uses.
     *
     * The size is the key swatch rather than a tile, so positions are scaled
     * from the tile geometry instead of copied from it.
     */
    drawKeyMark(ctx, mark, size) {
        const classes = this.tileset3DClasses();
        const mid = size / 2;
        ctx.clearRect(0, 0, size, size);
        const tint = colour => { ctx.fillStyle = colour; ctx.fillRect(0, 0, size, size); };
        const glyph = (text, colour) => {
            ctx.fillStyle = colour;
            ctx.font = `bold ${Math.round(size * 0.62)}px Arial`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(text, mid, mid + 1);
        };
        switch (mark) {
            case 'pass-o': glyph('O', 'rgba(120, 230, 120, 0.98)'); break;
            case 'pass-x': glyph('X', 'rgba(255, 110, 110, 0.98)'); break;
            case 'pass-star': glyph('\u2605', 'rgba(255, 220, 110, 0.98)'); break;
            case 'dir-open':
                this.drawFlagArrow(ctx, [mid - 5, mid + 4, mid, mid - 5, mid + 5, mid + 4],
                    'rgba(140, 220, 255, 0.98)');
                break;
            case 'dir-blocked': this.drawFlagDot(ctx, mid, mid, 4, 'rgba(255, 130, 130, 0.98)'); break;
            case 'ladder':
                this.drawFlagRect(ctx, mid - 5, 4, 10, size - 8, 'rgba(160, 210, 255, 0.95)');
                ctx.fillStyle = 'rgba(30, 30, 120, 0.95)';
                for (let i = 0; i < 3; i++) ctx.fillRect(mid - 6, 8 + i * 5, 12, 2);
                break;
            case 'bush': this.drawBushMark(ctx, 4, 3, size - 8); break;
            case 'counter':
                this.drawFlagRect(ctx, 4, mid - 2, size - 8, 5, 'rgba(210, 160, 255, 0.95)');
                break;
            case 'damage': glyph('\u26a0', 'rgba(255, 140, 40, 0.98)'); break;
            case 'terrain': glyph('3', 'rgba(255, 235, 130, 0.98)'); break;
            case '3d-flat':
                tint('rgba(70, 190, 255, 0.30)');
                this.drawFlagRect(ctx, 5, mid - 2, size - 10, 5, 'rgba(130, 220, 255, 0.98)');
                break;
            case '3d-upright':
                tint('rgba(255, 170, 40, 0.30)');
                this.drawFlagArrow(ctx, [mid - 8, mid + 4, mid, mid - 7, mid + 8, mid + 4],
                    'rgba(255, 196, 80, 0.98)');
                this.drawFlagRect(ctx, 5, size - 8, size - 10, 3, 'rgba(255, 196, 80, 0.98)');
                break;
            case '3d-scenery':
                tint('rgba(120, 230, 120, 0.28)');
                this.drawFlagArrow(ctx, [mid - 6, mid + 3, mid, mid - 6, mid + 6, mid + 3],
                    'rgba(150, 245, 150, 0.98)');
                this.drawFlagRect(ctx, mid - 6, size - 8, 12, 3, 'rgba(150, 245, 150, 0.98)');
                break;
            case '3d-foliage':
                tint('rgba(90, 210, 150, 0.30)');
                this.drawFlagArrow(ctx, [mid - 8, mid + 2, mid - 4, mid - 6, mid, mid + 2],
                    'rgba(130, 240, 185, 0.98)');
                this.drawFlagArrow(ctx, [mid + 1, mid + 4, mid + 5, mid - 3, mid + 9, mid + 4],
                    'rgba(130, 240, 185, 0.98)');
                this.drawFlagRect(ctx, 4, size - 8, size - 8, 3, 'rgba(130, 240, 185, 0.98)');
                break;
            case '3d-panel':
                tint('rgba(200, 150, 255, 0.28)');
                // A slab seen at a slight angle: a front with a visible edge,
                // which is the whole difference from a billboard.
                this.drawFlagRect(ctx, 5, 5, size - 14, size - 10, 'rgba(210, 170, 255, 0.98)');
                this.drawFlagRect(ctx, size - 9, 8, 4, size - 16, 'rgba(150, 110, 200, 0.98)');
                break;
            case '3d-roof-wall': {
                // A wall with a lid: the face, and a roof line across its top.
                tint('rgba(120, 200, 255, 0.22)');
                this.drawFlagRect(ctx, 5, mid, size - 10, size - mid - 5,
                    'rgba(150, 210, 255, 0.9)');
                this.drawFlagArrow(ctx, [4, mid, mid, 5, size - 4, mid],
                    'rgba(190, 230, 255, 0.98)');
                break;
            }
            case '3d-roof-top':
                // The roof on its own, which is what the wall borrows.
                tint('rgba(120, 200, 255, 0.16)');
                this.drawFlagArrow(ctx, [4, mid + 3, mid, mid - 6, size - 4, mid + 3],
                    'rgba(190, 230, 255, 0.98)');
                break;
            case '3d-object':
                ctx.strokeStyle = 'rgba(255, 235, 130, 0.95)';
                ctx.lineWidth = 2;
                ctx.strokeRect(4, 4, size - 8, size - 8);
                break;
            case '3d-role-flat':
                ctx.strokeStyle = 'rgba(255, 235, 130, 0.55)';
                ctx.lineWidth = 2;
                ctx.strokeRect(4, 4, size - 8, size - 8);
                this.drawFlagRect(ctx, 7, mid - 2, size - 14, 5, 'rgba(255, 235, 130, 0.98)');
                break;
            default: if (classes) break;
        }
    }


    /**
     * A small picture of what the selected tile becomes in 3D.
     *
     * Drawn here rather than by the real renderer on purpose: the tileset
     * editor would have to load three.js, the sheets and a scene to show one
     * tile, and what an author needs to check is which parts stand and which
     * lie down — not lighting. So it is an oblique diagram using the tile's own
     * art, and it says so, rather than implying it is the view you will get.
     */
    refreshTile3DPreview() {
        const host = document.getElementById('tile3d-preview');
        if (!host) return;
        // English for now, as with the key beside it.
        if (this.currentEditMode !== 'tile3d') { host.innerHTML = ''; return; }

        const classes = this.tileset3DClasses();
        const store = this.tileset3DStore();
        const tileIndex = this._preview3dTile;
        if (!classes || !store || !this.currentTileset || tileIndex === undefined) {
            host.innerHTML = `<div style="background:var(--color-bg-panel);border:1px solid `
                + `var(--color-border);border-radius:6px;padding:10px;font-size:10px;`
                + `color:var(--color-text-muted);">Click a tile to preview it in 3D</div>`;
            return;
        }

        const tilesetId = this.currentTileset.id;
        const member = classes.objectAt(store, tilesetId, tileIndex);
        const value = classes.classOf(store, tilesetId, tileIndex);
        // An undeclared tile is one cell whose role is its class: a tile set
        // to Flat lies down. It used to be given a standing role regardless,
        // so the preview showed every tile standing and could not be used to
        // check the one decision it exists to show.
        const soloRole = value === classes.GROUND ? classes.FLAT : classes.STAND;
        const object = member
            ? member.object
            : { tile: tileIndex, w: 1, h: 1, roles: soloRole };
        const names = {
            [classes.GROUND]: 'Flat', [classes.UPRIGHT]: 'Upright',
            [classes.SCENERY]: 'Scenery', [classes.FOLIAGE]: 'Foliage'
        };
        const className = names[value] || 'unclassified — the runtime decides';
        const label = member
            ? `${object.w}x${object.h} declared object — ${className}`
            : `single tile — ${className}`;

        host.innerHTML = `<div style="background:var(--color-bg-panel);border:1px solid `
            + `var(--color-border);border-radius:6px;padding:10px;">`
            + `<h4 style="margin:0 0 8px 0;font-size:9px;text-transform:uppercase;`
            + `letter-spacing:0.5px;color:var(--color-text-muted);">3D preview</h4>`
            + `<canvas id="tile3d-preview-canvas" width="146" height="146" `
            + `style="width:146px;height:146px;image-rendering:pixelated;border-radius:4px;`
            + `background:var(--color-bg-deep);cursor:ew-resize;touch-action:none;"></canvas>`
            + `<p style="font-size:9px;color:var(--color-text-dim);margin:6px 0 0 0;">${label}</p>`
            + `<p style="font-size:9px;color:var(--color-text-dim);margin:2px 0 0 0;">`
            + `Drag to turn</p></div>`;
        const canvas = document.getElementById('tile3d-preview-canvas');
        this.drawTile3DPreview(canvas, object);
        this.attachTile3DPreviewDrag(canvas, object);
    }

    /** Drag across the preview to turn the object on the spot. */
    attachTile3DPreviewDrag(canvas, object) {
        if (!canvas) return;
        let from = null;
        canvas.addEventListener('pointerdown', event => {
            from = { x: event.clientX, yaw: this._preview3dYaw || 0 };
            canvas.setPointerCapture?.(event.pointerId);
        });
        canvas.addEventListener('pointermove', event => {
            if (!from) return;
            // A drag across the pane is a little over half a turn, which is
            // enough to see every side without the object spinning away.
            this._preview3dYaw = from.yaw + (event.clientX - from.x) * 0.9;
            this.drawTile3DPreview(canvas, object);
        });
        const release = event => {
            from = null;
            canvas.releasePointerCapture?.(event.pointerId);
        };
        canvas.addEventListener('pointerup', release);
        canvas.addEventListener('pointercancel', release);
    }

    /**
     * The diagram itself: a ground plane in oblique projection, the object's
     * standing rows raised off it, and any row the author has laid flat drawn
     * on the ground where it belongs.
     */
    drawTile3DPreview(canvas, object) {
        const classes = this.tileset3DClasses();
        if (!canvas || !classes || !this.currentTileset) return;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const yaw = ((this._preview3dYaw || 0) * Math.PI) / 180;
        // Sized to the object rather than fixed, so a single tile is not a
        // speck in the middle of a wide empty plane and a 4x4 still fits.
        const span = Math.max(object.w, object.h) + 2.4;
        const cell = Math.max(10, Math.min(30, (canvas.width - 16) / span));
        // A ground plane seen at a slant, turning under the object. The turn
        // has to be legible on the ground, because the standing art cannot show
        // it: a cut-out spins to face the camera, so its picture is the same
        // from every side. That is why the object read as a static 2D drawing
        // when the ground was one fixed parallelogram.
        const squash = 0.55;
        const centreX = canvas.width / 2;
        const horizon = canvas.height * 0.66;
        const project = (gx, gz) => ({
            x: centreX + (gx * Math.cos(yaw) - gz * Math.sin(yaw)) * cell,
            y: horizon + (gx * Math.sin(yaw) + gz * Math.cos(yaw)) * cell * squash
        });

        // The footprint plus a margin, so there is ground to see it turn on.
        const halfW = object.w / 2, halfH = object.h / 2;
        const margin = 1.2;
        ctx.save();
        ctx.beginPath();
        const corners = [
            project(-halfW - margin, -halfH - margin), project(halfW + margin, -halfH - margin),
            project(halfW + margin, halfH + margin), project(-halfW - margin, halfH + margin)
        ];
        ctx.moveTo(corners[0].x, corners[0].y);
        for (const corner of corners.slice(1)) ctx.lineTo(corner.x, corner.y);
        ctx.closePath();
        ctx.fillStyle = 'rgba(120, 120, 130, 0.20)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(160, 160, 175, 0.45)';
        ctx.stroke();
        // Grid lines over the footprint, which is where a turn reads clearly.
        ctx.strokeStyle = 'rgba(160, 160, 175, 0.28)';
        ctx.beginPath();
        for (let i = 0; i <= object.w; i++) {
            const a = project(-halfW + i, -halfH), b = project(-halfW + i, halfH);
            ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
        }
        for (let i = 0; i <= object.h; i++) {
            const a = project(-halfW, -halfH + i), b = project(halfW, -halfH + i);
            ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
        }
        ctx.stroke();
        ctx.restore();

        const source = this.previewArtSource(object);
        const roles = object.roles || '';

        // Flat parts lie on the ground and turn with it, so they are drawn
        // first and the standing parts go over them.
        for (let dr = 0; dr < object.h; dr++) {
            for (let dc = 0; dc < object.w; dc++) {
                if (roles[dr * object.w + dc] !== classes.FLAT) continue;
                const a = project(-halfW + dc, -halfH + dr);
                const b = project(-halfW + dc + 1, -halfH + dr + 1);
                this.drawPreviewPiece(ctx, source, dc, dr,
                    Math.min(a.x, b.x), Math.min(a.y, b.y),
                    Math.max(6, Math.abs(b.x - a.x)), Math.max(4, Math.abs(b.y - a.y)));
            }
        }

        // Standing parts, face-on, anchored on the middle of the footprint —
        // where the renderer anchors them, and the point they turn about. On
        // the southern edge the axis sat at the front of the object and it
        // swung around that instead of turning where it stands.
        const base = project(0, 0);
        for (let dr = object.h - 1; dr >= 0; dr--) {
            for (let dc = 0; dc < object.w; dc++) {
                if (roles[dr * object.w + dc] === classes.FLAT) continue;
                const x = base.x + (dc - object.w / 2) * cell;
                const y = base.y - (object.h - dr) * cell;
                this.drawPreviewPiece(ctx, source, dc, dr, x, y, cell, cell);
            }
        }
    }

    /**
     * Where the preview's art comes from.
     *
     * A B-G tile is a rectangle of its sheet. An autotile is not: the A tabs
     * show a *rendered* palette, one cell per kind, so the preview copies that
     * cell from the palette the author is looking at rather than addressing a
     * sheet the art was never laid out on. Reading it as a sheet drew nothing
     * at all, which is what an A-layer preview did.
     */
    previewArtSource(object) {
        const classes = this.tileset3DClasses();
        if (!classes) return null;
        if (object.tile >= 2048) {
            const chosen = this._preview3dCell;
            if (!chosen) return null;
            // The *base* render, not the tab canvas: the tab has the flag
            // overlay painted onto it, so copying a cell from there carried the
            // class chevron into the preview — a marker about the tile drawn as
            // though it were part of the art.
            const base = this.cachedBaseCanvas(chosen.imageIndex);
            if (!base) return null;
            return {
                image: base, size: this.tileSize, stepped: false,
                sx: chosen.x * this.tileSize, sy: chosen.y * this.tileSize
            };
        }
        const origin = classes.sheetCell(object.tile);
        const image = this.sheetImageFor(origin.setNumber);
        if (!image) return null;
        const cell = this.tileSize;
        return { image, size: cell, stepped: true, sx: origin.col * cell, sy: origin.row * cell };
    }

    /**
     * The unmarked render of a layer, from the cache the tab canvases are built
     * from. Everything on screen has the flag overlay drawn over it; this is
     * what it was drawn over.
     */
    cachedBaseCanvas(imageIndex) {
        if (!this.imageCache) return null;
        const key = this.baseCacheKey(imageIndex);
        return (key && this.imageCache.get(key)) || null;
    }

    /**
     * The key a layer's base render is cached under.
     *
     * Everywhere that writes the cache names the file with its extension,
     * because that is the form it loaded. The 3D preview looked it up by the
     * bare name held in `tilesetNames`, missed every time, and drew an empty
     * box in place of the tile's art — which read as the preview not working
     * at all on the A tabs.
     */
    baseCacheKey(imageIndex, fileName = null) {
        const name = fileName
            || (this.currentTileset && this.currentTileset.tilesetNames[imageIndex]);
        if (!name) return null;
        return `${imageIndex}_${name.endsWith('.png') ? name : name + '.png'}`;
    }

    /**
     * The loaded sheet for a set number, if it has been drawn once already.
     *
     * Kept to what is in hand: the preview is a hint beside the sheet the
     * author is looking at, so it draws boxes rather than starting a load and
     * repainting later.
     */
    sheetImageFor(setNumber) {
        if (!this.currentTileset || !this.fs || !this.path) return null;
        const fileName = this.currentTileset.tilesetNames[setNumber];
        if (!fileName) return null;
        if (!this._sheetImages) this._sheetImages = new Map();
        if (this._sheetImages.has(fileName)) return this._sheetImages.get(fileName);
        const projectPath = this.getProjectPath();
        if (!projectPath) return null;
        const imagePath = this.path.join(projectPath, 'img', 'tilesets', `${fileName}.png`);
        if (!this.fs.existsSync(imagePath)) return null;
        const image = new Image();
        // Repaint once it arrives; until then the preview draws placeholders.
        image.onload = () => this.refreshTile3DPreview();
        image.src = this.assetUrl(imagePath);
        this._sheetImages.set(fileName, image);
        return image.complete ? image : null;
    }

    /**
     * A shrub, drawn small enough to survive a tile corner.
     *
     * Two lobes over a stem on a ground line: enough silhouette to be told from
     * the dots and bars the other flags use.
     */
    drawBushMark(ctx, x, y, size) {
        const green = 'rgba(80, 225, 80, 0.98)';
        const dark = 'rgba(12, 70, 12, 0.95)';
        ctx.save();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = dark;
        ctx.fillStyle = green;
        ctx.beginPath();
        ctx.arc(x + size * 0.34, y + size * 0.52, size * 0.30, 0, Math.PI * 2);
        ctx.arc(x + size * 0.66, y + size * 0.52, size * 0.30, 0, Math.PI * 2);
        ctx.arc(x + size * 0.50, y + size * 0.34, size * 0.28, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x + size * 0.5, y + size * 0.62);
        ctx.lineTo(x + size * 0.5, y + size * 0.92);
        ctx.strokeStyle = dark;
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x + size * 0.14, y + size * 0.94);
        ctx.lineTo(x + size * 0.86, y + size * 0.94);
        ctx.stroke();
        ctx.restore();
    }

    /** One cell of the preview, or a placeholder when the art is not to hand. */
    drawPreviewPiece(ctx, source, dc, dr, x, y, w, h) {
        if (source && source.image) {
            // A sheet block steps through its cells; an autotile palette holds
            // one rendered cell per kind and has no neighbours to step to.
            const stepping = source.stepped ? 1 : 0;
            const sx = source.sx + stepping * dc * source.size;
            const sy = source.sy + stepping * dr * source.size;
            if (source.image.width > sx && source.image.height > sy) {
                ctx.imageSmoothingEnabled = false;
                ctx.drawImage(source.image, sx, sy, source.size, source.size, x, y, w, h);
                return;
            }
        }
        ctx.save();
        ctx.fillStyle = 'rgba(200, 200, 215, 0.20)';
        ctx.strokeStyle = 'rgba(200, 200, 215, 0.45)';
        ctx.fillRect(x, y, w, h);
        ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
        ctx.restore();
    }


    /**
     * Drag a rectangle across the sheet to apply the current 3D tool.
     *
     * The same gesture as the map's area paint, because it is the same job:
     * mark out a region and say what it is. Clicking one tile at a time and
     * counting corners was the wrong shape for declaring an object, which is
     * a rectangle by definition — and a click here is simply a 1x1 drag, so
     * single tiles still work without a second mode.
     */
    attachTile3DDrag(canvas, imageIndex, isSplitSheet) {
        if (!canvas || canvas.dataset.tile3dDrag) return;
        canvas.dataset.tile3dDrag = '1';

        const cellAt = event => {
            const rect = canvas.getBoundingClientRect();
            // The canvas may be laid out at a different size from its backing
            // store, so the pointer is scaled into canvas pixels first.
            const scaleX = canvas.width / rect.width;
            const scaleY = canvas.height / rect.height;
            // Held inside the sheet. A drag that ran off the bottom edge kept
            // counting rows, and the rectangle it declared reached down into
            // tiles that were not on screen — so an object quietly claimed art
            // the author could not see until they scrolled to it.
            const lastX = Math.max(0, Math.floor(canvas.width / this.tileSize) - 1);
            const lastY = Math.max(0, Math.floor(canvas.height / this.tileSize) - 1);
            const clamp = (value, last) => Math.max(0, Math.min(last, value));
            return {
                x: clamp(Math.floor(((event.clientX - rect.left) * scaleX) / this.tileSize), lastX),
                y: clamp(Math.floor(((event.clientY - rect.top) * scaleY) / this.tileSize), lastY)
            };
        };

        canvas.addEventListener('pointerdown', event => {
            if (this.currentEditMode !== 'tile3d') return;
            event.preventDefault();
            const cell = cellAt(event);
            // Shift, Ctrl, or Cmd all mean "add to the object": which key a
            // hand reaches for varies by habit and platform, and refusing two
            // of the three read as the gesture not existing.
            this._tile3dDrag = {
                imageIndex, from: cell, to: cell,
                extend: !!(event.shiftKey || event.ctrlKey || event.metaKey)
            };
            canvas.setPointerCapture?.(event.pointerId);
            this.repaintClickedCanvas(canvas, imageIndex, isSplitSheet);
        });

        canvas.addEventListener('pointermove', event => {
            const drag = this._tile3dDrag;
            if (!drag || drag.imageIndex !== imageIndex) return;
            const cell = cellAt(event);
            if (cell.x === drag.to.x && cell.y === drag.to.y) return;
            drag.to = cell;
            this.repaintClickedCanvas(canvas, imageIndex, isSplitSheet);
        });

        const finish = event => {
            const drag = this._tile3dDrag;
            if (!drag || drag.imageIndex !== imageIndex) return;
            this._tile3dDrag = null;
            canvas.releasePointerCapture?.(event.pointerId);
            const tilesX = Math.floor(canvas.width / this.tileSize);
            this.applyTile3DTool(drag, imageIndex, tilesX);
            this.repaintClickedCanvas(canvas, imageIndex, isSplitSheet);
            this.refreshTile3DPreview();
        };
        canvas.addEventListener('pointerup', finish);
        canvas.addEventListener('pointercancel', () => {
            this._tile3dDrag = null;
            this.repaintClickedCanvas(canvas, imageIndex, isSplitSheet);
        });
    }

    /**
     * A small roof over a corner of the tile.
     *
     * In the corner rather than the middle, because a wall carries its class
     * glyph there already and the two say different things: what this tile is,
     * and what covers it. `kind` is `'wall'` for the wall that was given a
     * roof and `'top'` for the tile serving as one.
     */
    drawRoofMark(ctx, drawX, drawY, kind) {
        const right = drawX + this.tileSize - 4;
        const top = drawY + 4;
        const wide = Math.max(10, Math.round(this.tileSize / 4));
        const high = Math.round(wide * 0.6);
        const colour = kind === 'wall'
            ? 'rgba(190, 230, 255, 0.98)' : 'rgba(140, 200, 245, 0.98)';
        this.drawFlagArrow(ctx, [
            right - wide, top + high,
            right - wide / 2, top,
            right, top + high
        ], colour);
        // The wall also gets the face beneath its roof, so the two are told
        // apart at a glance rather than by colour alone.
        if (kind === 'wall') {
            this.drawFlagRect(ctx, right - wide + 1, top + high, wide - 2, 3, colour);
        }
    }

    /**
     * Whether the middle of an object is a cell that has been laid flat.
     *
     * `originX/originY` are the object's top-left cell on the canvas. An even
     * width or height has no single middle cell — the centre falls on the join
     * — so both candidates are examined.
     */
    tile3dCentreIsFlat(member, originX, originY, imageIndex, tilesX) {
        const classes = this.tileset3DClasses();
        const store = this.tileset3DStore();
        if (!classes || !store || !this.currentTileset) return false;
        const { object } = member;
        const cols = [Math.floor((object.w - 1) / 2), Math.ceil((object.w - 1) / 2)];
        const rows = [Math.floor((object.h - 1) / 2), Math.ceil((object.h - 1) / 2)];
        for (const dc of new Set(cols)) {
            for (const dr of new Set(rows)) {
                const tile = this.getTileIndexForImage(
                    imageIndex, originX + dc, originY + dr, tilesX);
                if (classes.roleOf(store, this.currentTileset.id, tile) === classes.FLAT) {
                    return true;
                }
            }
        }
        return false;
    }

    /**
     * The rectangle covering an existing object and a newly dragged piece.
     *
     * Worked out in *sheet* coordinates rather than in the palette's, because
     * the palette splits a sixteen-column sheet into two stacked halves: a prop
     * crossing that seam looks like two separate pieces on screen while being
     * one contiguous rectangle on the sheet. Returns null when the two are on
     * different sheets, which cannot be one object.
     */
    mergeTile3DObject(existingTile, addedTile, addedW, addedH) {
        const classes = this.tileset3DClasses();
        const store = this.tileset3DStore();
        if (!classes || !store || !this.currentTileset) return null;
        // By origin rather than by lookup: an object anchored at the top-left
        // of a sheet has origin 0, and a *lookup* for 0 is refused on purpose —
        // an empty map cell reads as 0 and must not match anything.
        const existing = classes.objectList(store, this.currentTileset.id)
            .find(object => object.tile === existingTile);
        // Each refusal says which one it is. All three used to be a bare null
        // and the caller blamed the sheet for every one of them, so extending
        // an object anchored at the top-left of a sheet reported that the two
        // halves were on different sheets when they plainly were not.
        if (!existing) {
            return { error: 'The object being extended is no longer there — select it '
                + 'again, then shift-drag.' };
        }

        const origin = classes.sheetCell(existing.tile);
        const added = classes.sheetCell(addedTile);
        if (origin.setNumber !== added.setNumber) {
            return { error: 'That is on a different sheet from the object being extended.' };
        }

        const left = Math.min(origin.col, added.col);
        const top = Math.min(origin.row, added.row);
        const right = Math.max(origin.col + existing.w, added.col + addedW);
        const bottom = Math.max(origin.row + existing.h, added.row + addedH);
        // Bounds are checked here rather than read off `tileAtCell`, which
        // answers 0 both for the top-left tile of a sheet and for a cell past
        // its edge. Treating that 0 as failure is what broke this: an object
        // anchored at the sheet's first tile could never be extended.
        if (left < 0 || top < 0 || right > 16 || bottom > 16) {
            return { error: 'That would reach past the edge of the sheet.' };
        }
        return {
            tile: classes.tileAtCell(origin.setNumber, left, top),
            w: right - left,
            h: bottom - top
        };
    }

    /**
     * Forget what is selected in 3D mode.
     *
     * The selection is a rectangle on one sheet of one tileset, so it means
     * nothing once either of those changes, and left behind it drew a box
     * round whatever art now occupies those cells.
     */
    clearTile3DSelection() {
        this.selected3dRect = null;
        this._selected3dObject = null;
        this._lastDeclaredObject = null;
        this._preview3dTile = null;
        this._preview3dCell = null;
        this._tile3dCorner = null;
    }

    /** A declared object's selection rectangle, in sheet coordinates. */
    static sheetSelection(classes, object, imageIndex) {
        const origin = classes.sheetCell(object.tile);
        return {
            sheet: { col: origin.col, row: origin.row, w: object.w, h: object.h },
            imageIndex
        };
    }

    /** The rectangle a drag covers, in tile coordinates. */
    static dragBounds(drag) {
        return {
            x0: Math.min(drag.from.x, drag.to.x), x1: Math.max(drag.from.x, drag.to.x),
            y0: Math.min(drag.from.y, drag.to.y), y1: Math.max(drag.from.y, drag.to.y)
        };
    }

    /** Apply the selected tool over everything the drag covered. */
    applyTile3DTool(drag, imageIndex, tilesX) {
        const classes = this.tileset3DClasses();
        const store = this.tileset3DStore();
        if (!classes || !store || !this.currentTileset) return;
        const tilesetId = this.currentTileset.id;
        const tool = this.tile3dTool || 'select';
        const { x0, x1, y0, y1 } = DatabaseTilesetEditor.dragBounds(drag);
        const indexAt = (x, y) => this.getTileIndexForImage(imageIndex, x, y, tilesX);

        // What a shift-drag joins on to, read *before* the drag reselects
        // below. Shift used to extend only an object declared earlier in the
        // same session, so selecting an existing object and shift-dragging the
        // rest of it started a new object instead of extending that one —
        // which is the whole gesture, for a tower that crosses the sheet seam.
        const joinTo = drag.extend
            ? ((this._selected3dObject && this._selected3dObject.tile)
                || this._lastDeclaredObject || null)
            : null;

        // Whatever the tool, the drag also selects, and selecting a tile that
        // belongs to a declared object selects the object: the whole point of
        // declaring one is that it stops being a collection of squares.
        this._preview3dTile = indexAt(x0, y0);
        // The A tabs are a rendered palette rather than a sheet, so the preview
        // needs the cell that was clicked, not just the tile id.
        this._preview3dCell = { imageIndex, x: x0, y: y0 };
        const member = classes.objectAt(store, tilesetId, this._preview3dTile);
        this._selected3dObject = member ? member.object : null;
        // Carries the sheet it was made on: every sheet draws this overlay, and
        // a rectangle with no sheet on it was drawn at the same coordinates on
        // all of them. An object's selection is stored in *sheet* coordinates:
        // subtracting dc/dr from the display cell put the box at coordinates
        // that exist on neither half once the object crosses the palette seam.
        this.selected3dRect = member
            ? DatabaseTilesetEditor.sheetSelection(classes, member.object, imageIndex)
            : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1, imageIndex };

        if (tool === 'select') return;

        // Pairing a wall with the roof that covers it. Two clicks, because it
        // names a relationship between two tiles rather than setting a property
        // of one: the wall first, then the roof. A4 pairs these by its own
        // layout and needs none of this; A3 is walls throughout, and a tileset
        // that draws its roofs elsewhere has no rule to derive from either.
        if (tool === 'top') {
            const picked = indexAt(x0, y0);
            if (!this._tile3dTopWall) {
                if (!classes.isWallLike || !classes.isWallLike(picked)) {
                    // Anything can be a roof; only a wall can want one.
                    this.noteTile3DRefusal(
                        'Start with the wall: click a wall autotile on A3 or A4, '
                        + 'then click the tile that covers its top.');
                    return;
                }
                this._tile3dTopWall = picked;
                const named = classes.materialOf(store, tilesetId, picked);
                this.noteTile3DRefusal(named
                    ? 'Wall selected — click its roof, or click this wall again to clear.'
                    : 'Wall selected — now click the tile that covers its top.');
                this.refreshTile3DPreview();
                return;
            }
            const wall = this._tile3dTopWall;
            this._tile3dTopWall = null;
            if (classes.keyFor(picked) === classes.keyFor(wall)) {
                classes.setTopFace(store, tilesetId, wall, 0);
                this.noteTile3DRefusal('Roof cleared — this wall keeps its own art on top.');
            } else {
                classes.setTopFace(store, tilesetId, wall, picked);
                this.noteTile3DRefusal('Roof set.');
            }
            this.saveTileset3DFile();
            this.refreshOverlays();
            this.refreshTile3DPreview();
            return;
        }
        this._tile3dTopWall = null;

        // Clearing works everywhere, including on autotiles: anything that can
        // be classified has to be un-classifiable, and it was not — Auto reset
        // the class and left the stand-in, the roof pairing and the object
        // membership behind, with no way back short of editing the file.
        if (tool === 'clear') {
            let cleared = 0;
            for (let y = y0; y <= y1; y++) {
                for (let x = x0; x <= x1; x++) {
                    if (classes.clearTile(store, tilesetId, indexAt(x, y))) cleared++;
                }
            }
            this._selected3dObject = null;
            this._lastDeclaredObject = null;
            this.selected3dRect = { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1, imageIndex };
            this.noteTile3DRefusal(cleared
                ? `Cleared ${cleared} tile${cleared === 1 ? '' : 's'} — class, object, `
                    + 'stand-in and roof.'
                : 'Nothing set on these tiles to clear.');
            this.saveTileset3DFile();
            this.refreshOverlays();
            this.refreshTile3DPreview();
            return;
        }

        // Declaring is a B-E idea: an object is a rectangle of a sheet, and an
        // autotile id is a corner arrangement rather than a place in a drawing.
        // Autotile terrain says what it is through its 3D class instead.
        // A5 is not an autotile: whole tiles, eight to a row, so it declares
        // objects like B-G. Only A1-A4 cannot.
        const autotile = indexAt(x0, y0) >= 2048;
        if ((tool === 'object' || tool === 'role') && autotile) {
            this.noteTile3DRefusal(
                'Objects are declared on A5 and B-G. An autotile id is a corner '
                + 'arrangement rather than a place in a drawing, so a rectangle '
                + 'of the sheet means nothing here — classify the kind with '
                + 'Flat, Upright, Scenery or Foliage instead.');
            return;
        }
        this.noteTile3DRefusal('');

        if (tool === 'object') {
            const width = x1 - x0 + 1, height = y1 - y0 + 1;
            // A single click must never destroy a grouping. Redeclaring one
            // cell of a 2x2 replaced it with a 1x1 — one stray click and the
            // object was gone, which is far too easy to do by accident.
            if (!joinTo && width === 1 && height === 1
                && classes.objectAt(store, tilesetId, indexAt(x0, y0))) {
                this.noteTile3DRefusal('Already part of an object — drag a rectangle '
                    + 'to redeclare it, shift-drag to extend it, or use Clear.');
                return;
            }
            // Shift extends what was declared last instead of starting again.
            //
            // A B-G sheet is sixteen columns shown as two eight-column halves
            // stacked, so a prop wide enough to cross column eight — a tower, a
            // smoke stack — appears as two pieces on different rows of the
            // palette and cannot be dragged out in one go. It is still a single
            // rectangle *on the sheet*, though, so both pieces are taken in
            // sheet coordinates and the rectangle that covers them is declared.
            if (joinTo) {
                const merged = this.mergeTile3DObject(
                    joinTo, indexAt(x0, y0), width, height);
                if (!merged || merged.error) {
                    this.noteTile3DRefusal((merged && merged.error)
                        || 'That cannot be joined to the object being extended.');
                    return;
                }
                classes.clearObject(store, tilesetId, joinTo);
                classes.defineObject(store, tilesetId, merged.tile, merged.w, merged.h);
                this._lastDeclaredObject = merged.tile;
                // The whole merged object stays highlighted — drawn as two
                // pieces when it spans the palette seam — so the gesture's
                // result is visible as one selected object, not as whichever
                // piece was added last.
                const wholeObject = classes.objectAt(store, tilesetId, merged.tile)?.object
                    || { tile: merged.tile, w: merged.w, h: merged.h };
                this.selected3dRect = DatabaseTilesetEditor.sheetSelection(
                    classes, wholeObject, imageIndex);
                this._selected3dObject = wholeObject;
                this.noteTile3DRefusal(`Object extended to ${merged.w}x${merged.h}. `
                    + 'Shift-drag again to add more.');
                this.saveTileset3DFile();
                this.refreshOverlays();
                return;
            }

            classes.defineObject(store, tilesetId, indexAt(x0, y0), width, height);
            this._lastDeclaredObject = indexAt(x0, y0);
            this.noteTile3DRefusal(`Object declared: ${width}x${height}. `
                + 'Shift-drag another part to add it to this one.');
            this.saveTileset3DFile();
            return;
        }
        if (tool === 'role') {
            // One decision for the whole rectangle rather than a per-tile
            // toggle, so dragging over a mixed selection does not scramble it.
            let anyStanding = false;
            for (let y = y0; y <= y1 && !anyStanding; y++) {
                for (let x = x0; x <= x1; x++) {
                    if (classes.roleOf(store, tilesetId, indexAt(x, y)) === classes.STAND) {
                        anyStanding = true;
                        break;
                    }
                }
            }
            for (let y = y0; y <= y1; y++) {
                for (let x = x0; x <= x1; x++) {
                    const tile = indexAt(x, y);
                    const isStanding = classes.roleOf(store, tilesetId, tile) === classes.STAND;
                    if (isStanding === anyStanding) classes.cycleRole(store, tilesetId, tile);
                }
            }
            // Every other tool saves here; this one returned without doing it,
            // so laying an object's ground rows flat changed the store in
            // memory and nothing else — not the file, not the open 3D map. It
            // read as the tool doing nothing at all, and reopening the project
            // put the rows back up.
            this.saveTileset3DFile();
            this.refreshOverlays();
            return;
        }
        for (let y = y0; y <= y1; y++) {
            for (let x = x0; x <= x1; x++) this.setTile3DClass(indexAt(x, y), tool);
        }
        // Once for the whole drag, not once per cell. The Roof, Clear and
        // Object tools already saved here; painting a class did not, so the
        // change reached neither the file nor the open 3D map — which is why
        // it only appeared after the 3D view was switched off and on, since
        // that rebuilds from a store the editor had been updating in memory.
        this.saveTileset3DFile();
    }

    /** Paint one 3D class onto a tile, the tool palette's job. */
    setTile3DClass(tileIndex, tool) {
        const classes = this.tileset3DClasses();
        const store = this.tileset3DStore();
        if (!classes || !store || !this.currentTileset) return;
        const values = {
            auto: classes.AUTO, flat: classes.GROUND, upright: classes.UPRIGHT,
            scenery: classes.SCENERY, foliage: classes.FOLIAGE, panel: classes.PANEL
        };
        if (!(tool in values)) return;
        classes.setClass(store, this.currentTileset.id, tileIndex, values[tool]);
    }

    cycleTile3DClass(tileIndex) {
        const classes = this.tileset3DClasses();
        const store = this.tileset3DStore();
        if (!classes || !store || !this.currentTileset) return;

        const tilesetId = this.currentTileset.id;
        const next = classes.cycle(classes.classOf(store, tilesetId, tileIndex));
        classes.setClass(store, tilesetId, tileIndex, next);
        const names = {
            [classes.AUTO]: 'auto', [classes.GROUND]: 'flat',
            [classes.UPRIGHT]: 'upright', [classes.SCENERY]: 'scenery',
            [classes.FOLIAGE]: 'foliage', [classes.PANEL]: 'panel'
        };
        console.log(`3D class for tile ${tileIndex}: ${names[next]}`);
        this.saveTileset3DFile();
    }

    // Render full tileset preview showing all layers stacked vertically (like RPG Maker)
    updateStatus(message) {
        if (this.parentEditor && this.parentEditor.updateStatus) {
            this.parentEditor.updateStatus(message);
        }
    }

    cleanupListKeyHandler() {
        if (this._tilesetListKeyHandler) {
            document.removeEventListener('keydown', this._tilesetListKeyHandler);
            this._tilesetListKeyHandler = null;
        }
    }

    /**
     * Show tileset detail view (for database modal)
     */
    showTilesetEditorDetail(container, tileset) {
        container.innerHTML = '';
        container.style.overflow = 'hidden';
        container.style.display = 'flex';
        container.style.flexDirection = 'column';

        // Debug: Log current project state
        console.log('=== showTilesetEditorDetail ===');
        console.log('Current project:', this.projectManager ? this.projectManager.getCurrentProject() : 'NO PROJECT MANAGER');
        console.log('Current project path:', this.projectManager && this.projectManager.getCurrentProject() ? this.projectManager.getCurrentProject().path : 'NO PROJECT');

        // Create tileset editor container within the detail panel
        const editorContainer = document.createElement('div');
        editorContainer.style.cssText = 'display: flex; flex-direction: column; height: 100%; overflow: hidden;';

        // Append to DOM FIRST so elements exist when we initialize
        container.appendChild(editorContainer);

        // Initialize tileset editor if not already done
        const currentProject = this.projectManager ? this.projectManager.getCurrentProject() : null;
        if (!this.tilesetEditor && currentProject) {
            console.log('Creating new DatabaseTilesetEditor with project path:', currentProject.path);
            this.tilesetEditor = new DatabaseTilesetEditor(
                this.databaseManager,
                this.projectManager,
                this.commonUI,
                this.parentEditor
            );
        } else {
            if (this.tilesetEditor) {
                console.log('Reusing existing DatabaseTilesetEditor, current projectPath:', this.tilesetEditor.projectPath);
            }
        }

        if (!this.tilesetEditor) {
            const tt = text => window.I18n ? window.I18n.tText(text) : text;
            container.innerHTML = `<p style="color: #f44; text-align: center; margin-top: 100px;">${tt('Failed to initialize tileset editor')}</p>`;
            return;
        }

        this.tilesetEditor.onTilesetSaved = (savedTileset) => {
            if (!savedTileset) return;
            this.databaseManager.updateTileset(savedTileset.id, savedTileset);
            // The map canvas and the tile palette each captured this tileset
            // when the map opened, so neither notices a sheet being assigned.
            // Announce the save rather than reaching into them from here.
            if (typeof document !== 'undefined' && typeof CustomEvent === 'function') {
                document.dispatchEvent(new CustomEvent('rr-tileset-saved', {
                    detail: { tilesetId: savedTileset.id }
                }));
            }
            if (this.parentEditor?._activeDatabaseList?.type === 'tilesets') {
                this.parentEditor._activeDatabaseList.mutationGeneration++;
                this.parentEditor._activeDatabaseList.refresh();
            } else if (typeof this._refreshTilesetDatabaseList === 'function') {
                this._refreshTilesetDatabaseList(savedTileset.id);
            }
        };

        // Initialize the compact UI for modal display (now that container is in DOM)
        this.tilesetEditor.initializeCompactUI(editorContainer, tileset);
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = DatabaseTilesetEditor;
}
