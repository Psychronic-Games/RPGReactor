// RPG Reactor - Database Tileset Editor
// Provides an interface for creating and editing tilesets
// Unified version combining standalone and database integration functionality

class DatabaseTilesetEditor {
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
        this.currentTab = 'A'; // Current layer tab: 'A', 'B', 'C', 'D', 'E'
        this.tileSize = 48;
        this.selectedTile = null; // Currently selected tile { x, y } for highlighting
        this.imageCache = new Map(); // Cache rendered tileset images to avoid redrawing
        this.currentCanvas = null; // Store current canvas to update without recreating

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
    initializeUI(container) {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        container.innerHTML = `
            <div id="tileset-editor-container" style="display: flex; height: 100%; overflow: hidden;">
                <!-- Tileset List Sidebar -->
                <div id="tileset-list-panel" style="width: 250px; background-color: var(--color-bg-list-item); border-right: 1px solid var(--color-border); overflow-y: auto;">
                    <div style="padding: 12px; border-bottom: 1px solid var(--color-border); display: flex; justify-content: space-between; align-items: center;">
                        <span style="font-weight: 600; font-size: 13px;">${tt('Tilesets')}</span>
                        <button id="add-tileset-btn" class="tool-button" style="padding: 4px 8px; font-size: 11px;">${tt('New')}</button>
                    </div>
                    <div id="tileset-list" style="padding: 8px;">
                        <!-- Tileset list will be populated here -->
                    </div>
                </div>

                <!-- Main Editor Area (Middle Column - Fixed Width) -->
                <div id="tileset-editor-main" style="width: 350px; display: flex; flex-direction: column; overflow: hidden; flex-shrink: 0;">
                    <!-- Editor Toolbar -->
                    <div id="tileset-toolbar" style="padding: 12px; border-bottom: 1px solid var(--color-border); background-color: var(--color-bg-menubar);">
                        <div style="display: flex; gap: 8px; align-items: center;">
                            <button id="close-tileset-editor-btn" class="tool-button">← ${tt('Back to Database')}</button>
                            <label style="font-size: 12px; color: var(--color-text-muted);">${tt('Name:')}</label>
                            <input type="text" id="tileset-name-input" style="flex: 1; max-width: 300px; padding: 4px 8px; background-color: var(--color-bg-input-alt); border: 1px solid var(--color-border-input); color: var(--color-text); border-radius: 3px; font-size: 12px;" placeholder="${tt('Tileset name')}" />
                            <button id="save-tileset-btn" class="tool-button" style="margin-left: auto;">${tt('Save')}</button>
                            <button id="delete-tileset-btn" class="tool-button" style="background-color: var(--color-danger);">${tt('Delete')}</button>
                        </div>
                    </div>

                    <!-- Editor Content -->
                    <div id="tileset-editor-content" style="flex: 1; overflow-y: auto; padding: 16px;">
                        <div style="max-width: 100%;">
                            <h3 style="margin-bottom: 12px; font-size: 13px; font-weight: 600; color: var(--color-text);">${tt('Tileset Images')}</h3>

                            <!-- Autotile Images (A1-A5) -->
                            <div style="margin-bottom: 16px;">
                                <h4 style="margin-bottom: 8px; font-size: 11px; color: var(--color-text-muted); text-transform: uppercase;">${tt('Autotiles')}</h4>
                                <div style="display: flex; flex-direction: column; gap: 8px;">
                                    ${this.createTilesetImageSlot('A1', 0, tt('Animated Water'))}
                                    ${this.createTilesetImageSlot('A2', 1, tt('Ground Autotiles'))}
                                    ${this.createTilesetImageSlot('A3', 2, tt('Building Autotiles'))}
                                    ${this.createTilesetImageSlot('A4', 3, tt('Wall Autotiles'))}
                                    ${this.createTilesetImageSlot('A5', 4, tt('Normal Tiles'))}
                                </div>
                            </div>

                            <!-- Normal Tileset Images (B-E) -->
                            <div style="margin-bottom: 16px;">
                                <h4 style="margin-bottom: 8px; font-size: 11px; color: var(--color-text-muted); text-transform: uppercase;">${tt('Normal Tilesets')}</h4>
                                <div style="display: flex; flex-direction: column; gap: 8px;">
                                    ${this.createTilesetImageSlot('B', 5, tt('Tileset B'))}
                                    ${this.createTilesetImageSlot('C', 6, tt('Tileset C'))}
                                    ${this.createTilesetImageSlot('D', 7, tt('Tileset D'))}
                                    ${this.createTilesetImageSlot('E', 8, tt('Tileset E'))}
                                </div>
                            </div>

                            <!-- Mode Selection -->
                            <div style="margin-bottom: 16px;">
                                <h4 style="margin-bottom: 8px; font-size: 11px; color: var(--color-text-muted); text-transform: uppercase;">${tt('Passage Settings')}</h4>
                                <div style="display: flex; flex-direction: column; gap: 6px; margin-bottom: 8px;">
                                    <button class="tool-button passage-mode-btn" id="mode-o" title="${tt('Passable')}" style="width: 100%;">${tt('O (Pass)')}</button>
                                    <button class="tool-button passage-mode-btn" id="mode-x" title="${tt('Impassable')}" style="width: 100%;">${tt('X (Block)')}</button>
                                    <button class="tool-button passage-mode-btn" id="mode-star" title="${tt('Above Character')}" style="width: 100%;">${tt('★ (Above)')}</button>
                                </div>
                                <p style="font-size: 10px; color: var(--color-text-muted);">${tt('Click an image above, then click tiles to edit')}</p>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Tileset Viewer Panel (Right Column - Takes remaining space) -->
                <div id="tileset-viewer-panel" style="flex: 1; background-color: var(--color-bg-surface); border-left: 1px solid var(--color-border); overflow: auto; display: flex; flex-direction: column;">
                    <div style="padding: 12px; border-bottom: 1px solid var(--color-border); background-color: var(--color-bg-menubar);">
                        <h4 style="font-size: 12px; font-weight: 600; color: var(--color-text);">${tt('Tile Flags Editor')}</h4>
                        <p style="font-size: 11px; color: var(--color-text-muted); margin-top: 4px;">${tt('Click a tileset image to view and edit flags')}</p>
                    </div>
                    <div id="tileset-canvas-container" style="flex: 1; overflow: auto; padding: 16px;">
                        <canvas id="tileset-canvas" style="display: none; image-rendering: pixelated; cursor: crosshair;"></canvas>
                        <p id="tileset-no-selection" style="color: var(--color-text-dim); text-align: center; margin-top: 100px;">${tt('Select a tileset image to edit passage settings')}</p>
                    </div>
                </div>
            </div>
        `;

        // Set up event listeners
        this.setupEventListeners();

        // Load tilesets
        this.loadTilesets();
    }

    createTilesetImageSlot(label, index, description) {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        return `
            <div class="tileset-image-slot" data-index="${index}" style="background-color: var(--color-bg-menubar); border: 1px solid var(--color-border-input); border-radius: 4px; padding: 8px; cursor: pointer; transition: all 0.2s; display: flex; align-items: center; gap: 8px;">
                <div class="image-preview" data-index="${index}" style="width: 60px; height: 60px; flex-shrink: 0; background-color: var(--color-bg-surface); border: 1px solid var(--color-bg-button-hover); border-radius: 3px; display: flex; align-items: center; justify-content: center; background-size: contain; background-repeat: no-repeat; background-position: center;">
                    <span style="font-size: 9px; color: var(--color-text-dim);">?</span>
                </div>
                <div style="flex: 1; min-width: 0;">
                    <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 4px;">
                        <span style="font-weight: 600; font-size: 12px;">${label}</span>
                        <button class="clear-image-btn" data-index="${index}" style="background: var(--color-danger); border: none; color: var(--color-text); padding: 2px 6px; border-radius: 3px; font-size: 9px; cursor: pointer; display: none;">${tt('Clear')}</button>
                    </div>
                    <div style="font-size: 10px; color: var(--color-text-muted);">${description}</div>
                    <div class="image-filename" data-index="${index}" style="font-size: 9px; color: var(--color-text-muted); margin-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; display: none;"></div>
                </div>
            </div>
        `;
    }

    setupEventListeners() {
        // Close editor button
        const closeBtn = document.getElementById('close-tileset-editor-btn');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                if (this.onClose) {
                    this.onClose();
                }
            });
        }

        // Add new tileset button
        document.getElementById('add-tileset-btn').addEventListener('click', () => {
            this.createNewTileset();
        });

        // Save tileset button
        document.getElementById('save-tileset-btn').addEventListener('click', () => {
            this.saveTileset();
        });

        // Delete tileset button
        document.getElementById('delete-tileset-btn').addEventListener('click', () => {
            this.deleteTileset();
        });

        // Tileset image slot clicks
        document.querySelectorAll('.tileset-image-slot').forEach(slot => {
            slot.addEventListener('click', (e) => {
                // Don't trigger if clicking the clear button
                if (e.target.classList.contains('clear-image-btn')) return;

                const index = slot.dataset.index;
                this.openTilesetImageForEditing(index);
            });
        });

        // Clear image buttons
        document.querySelectorAll('.clear-image-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const index = btn.dataset.index;
                this.clearTilesetImage(index);
            });
        });

        // Passage mode buttons
        const modeButtons = document.querySelectorAll('.passage-mode-btn');
        console.log(`Found ${modeButtons.length} mode buttons`);
        modeButtons.forEach(btn => {
            console.log(`Setting up listener for button: ${btn.id}`);
            btn.addEventListener('click', (e) => {
                console.log('Mode button clicked:', e.target.id);
                document.querySelectorAll('.passage-mode-btn').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');

                if (e.target.id === 'mode-o') {
                    this.currentEditMode = 'passable';
                    console.log('Mode set to: PASSABLE (O)');
                } else if (e.target.id === 'mode-x') {
                    this.currentEditMode = 'impassable';
                    console.log('Mode set to: IMPASSABLE (X)');
                } else if (e.target.id === 'mode-star') {
                    this.currentEditMode = 'star';
                    console.log('Mode set to: STAR (★)');
                }
            });
        });

        // Tileset canvas click for editing flags
        const canvas = document.getElementById('tileset-canvas');
        if (canvas) {
            canvas.addEventListener('click', (e) => {
                this.handleTilesetCanvasClick(e);
            });
        }

        // Set default mode
        document.getElementById('mode-o').classList.add('active');
    }

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

            this.renderTilesetList();

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

    renderTilesetList() {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        const listContainer = document.getElementById('tileset-list');
        if (!listContainer) {
            // Compact UI doesn't have this element, skip
            return;
        }

        listContainer.innerHTML = '';

        for (let i = 1; i < this.tilesetList.length; i++) {
            const tileset = this.tilesetList[i];
            if (!tileset) continue;

            const item = document.createElement('div');
            item.className = 'tree-item';
            item.textContent = `${String(i).padStart(3, '0')}: ${tileset.name || tt('Unnamed')}`;
            item.dataset.id = i;
            item.addEventListener('click', () => this.selectTileset(i));
            listContainer.appendChild(item);
        }
    }

    selectTileset(id) {
        this.currentTileset = this.tilesetList[id];
        if (!this.currentTileset) return;

        // Update UI (only for old UI, not compact mode)
        const nameInput = document.getElementById('tileset-name-input');
        if (nameInput) {
            nameInput.value = this.currentTileset.name || '';
        }

        // Highlight selected tileset in list (only for old UI)
        const listItems = document.querySelectorAll('#tileset-list .tree-item');
        if (listItems.length > 0) {
            listItems.forEach(item => {
                item.style.backgroundColor = item.dataset.id == id ? 'var(--color-bg-hover)' : '';
            });
        }

        // Load tileset images into preview slots (only for old UI)
        const previewSlots = document.querySelectorAll('.image-preview');
        if (previewSlots.length > 0) {
            this.loadTilesetPreviews();
        }
    }

    loadTilesetPreviews() {
        if (!this.currentTileset) return;
        const tt = text => window.I18n ? window.I18n.tText(text) : text;

        const tilesetNames = this.currentTileset.tilesetNames;

        for (let i = 0; i < 9; i++) {
            const name = tilesetNames[i];
            const preview = document.querySelector(`.image-preview[data-index="${i}"]`);
            const filename = document.querySelector(`.image-filename[data-index="${i}"]`);
            const clearBtn = document.querySelector(`.clear-image-btn[data-index="${i}"]`);

            if (name && name !== '') {
                // Try to load and display the image
                const imgPath = this.path.join(this.getProjectPath(), 'img', 'tilesets', name + '.png');
                if (this.fs.existsSync(imgPath)) {
                    const fileUrl = this.assetUrl(imgPath);
                    preview.style.backgroundImage = `url('${fileUrl}')`;
                    preview.innerHTML = '';
                    filename.textContent = name + '.png';
                    filename.style.display = 'block';
                    clearBtn.style.display = 'inline-block';
                } else {
                    preview.style.backgroundImage = 'none';
                    preview.innerHTML = `<span style="font-size: 11px; color: var(--color-text-muted);">${tt('File not found')}</span>`;
                    filename.textContent = name + '.png ' + tt('(missing)');
                    filename.style.display = 'block';
                    clearBtn.style.display = 'inline-block';
                }
            } else {
                preview.style.backgroundImage = 'none';
                preview.innerHTML = `<span style="font-size: 11px; color: var(--color-text-dim);">${tt('Click to select')}</span>`;
                filename.style.display = 'none';
                clearBtn.style.display = 'none';
            }
        }
    }

    selectTilesetImage(index) {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        if (!this.currentTileset) {
            alert(tt('Please select or create a tileset first'));
            return;
        }

        const tilesetsDir = this.path.join(this.getProjectPath(), 'img', 'tilesets');

        // Use NW.js file dialog
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.png';
        input.onchange = (e) => {
            const file = e.target.files[0];
            if (file) {
                const filename = this.path.basename(file.path, '.png');

                // Copy file to project tilesets directory
                try {
                    if (!this.fs.existsSync(tilesetsDir)) {
                        this.fs.mkdirSync(tilesetsDir, { recursive: true });
                    }

                    const destPath = this.path.join(tilesetsDir, filename + '.png');
                    this.fs.copyFileSync(file.path, destPath);

                    // Update tileset data
                    this.currentTileset.tilesetNames[index] = filename;

                    // Refresh preview
                    this.loadTilesetPreviews();

                    console.log(`Added tileset image: ${filename}`);
                } catch (error) {
                    console.error('Error copying tileset image:', error);
                    alert(`${tt('Error copying file:')} ${error.message}`);
                }
            }
        };
        input.click();
    }

    clearTilesetImage(index) {
        if (!this.currentTileset) return;

        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        if (confirm(tt('Remove this tileset image?'))) {
            this.currentTileset.tilesetNames[index] = '';
            this.loadTilesetPreviews();
        }
    }

    createNewTileset() {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        const name = prompt(tt('Enter tileset name:'), 'New Tileset');
        if (!name) return;

        const newTileset = {
            id: this.tilesetList.length,
            flags: new Array(8192).fill(0),
            mode: 0,
            name: name,
            note: '',
            tilesetNames: ['', '', '', '', '', '', '', '', '']
        };

        this.tilesetList.push(newTileset);
        this.renderTilesetList();
        this.selectTileset(newTileset.id);
    }

    saveTileset() {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        if (!this.currentTileset) {
            alert(tt('No tileset selected'));
            return;
        }

        // Update name from input (check both old UI and compact UI)
        const nameInput = document.getElementById('compact-tileset-name-input') ||
                         document.getElementById('tileset-name-input');
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
        this.renderTilesetList();
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
        this.renderTilesetList();
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

    deleteTileset() {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        if (!this.currentTileset) {
            alert(tt('No tileset selected'));
            return;
        }

        if (confirm(`${tt('Delete tileset')} "${this.currentTileset.name}"?`)) {
            const id = this.currentTileset.id;
            this.tilesetList[id] = null;
            this.currentTileset = null;

            this.saveTilesetsFile();
            this.renderTilesetList();

            // Clear editor
            document.getElementById('tileset-name-input').value = '';
            document.querySelectorAll('.image-preview').forEach(preview => {
                preview.style.backgroundImage = 'none';
                preview.innerHTML = `<span style="font-size: 11px; color: var(--color-text-dim);">${tt('Click to select')}</span>`;
            });
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

            this.fs.writeFileSync(tilesetsPath, compactJson);
            console.log('Tilesets.json saved successfully');
        } catch (error) {
            console.error('Error saving Tilesets.json:', error);
            alert(`${tt('Error saving tilesets:')} ${error.message}`);
        }
    }

    openTilesetImageForEditing(index) {
        if (!this.currentTileset) return;

        this.selectedImageIndex = parseInt(index);
        const fileName = this.currentTileset.tilesetNames[this.selectedImageIndex];

        if (!fileName) {
            // If no file is set, prompt to select one
            this.selectTilesetImage(this.selectedImageIndex);
            return;
        }

        // Load and render the tileset image with flags
        this.renderTilesetCanvas(fileName, this.selectedImageIndex);
    }

    async renderTilesetCanvas(fileName, imageIndex) {
        const canvas = document.getElementById('tileset-canvas');
        const noSelection = document.getElementById('tileset-no-selection');
        const ctx = canvas.getContext('2d');

        noSelection.style.display = 'none';
        canvas.style.display = 'block';

        // Load the image - add .png extension if not present
        const img = new Image();
        const imageFileName = fileName.endsWith('.png') ? fileName : fileName + '.png';
        const imgPath = this.assetUrl(this.path.join(this.getProjectPath(), 'img', 'tilesets', imageFileName));

        img.onload = () => {
            // Calculate canvas size based on image
            canvas.width = img.width;
            canvas.height = img.height;

            // Draw the tileset image
            ctx.drawImage(img, 0, 0);

            // Draw flag overlays
            this.drawFlagOverlays(ctx, imageIndex, img.width, img.height);
        };

        img.onerror = () => {
            const tt = text => window.I18n ? window.I18n.tText(text) : text;
            noSelection.style.display = 'block';
            canvas.style.display = 'none';
            alert(`${tt('Error loading tileset image:')} ${fileName}`);
        };

        img.src = imgPath;
    }

    drawFlagOverlays(ctx, imageIndex, width, height) {
        if (!this.currentTileset || !this.currentTileset.flags) return;

        const tilesPerRow = Math.floor(width / this.tileSize);
        const tilesPerCol = Math.floor(height / this.tileSize);

        // Calculate starting flag index for this image (ensure imageIndex is a number)
        const imgIdx = parseInt(imageIndex);
        let flagOffset = 0;
        if (imgIdx === 0) flagOffset = 0;           // A1
        else if (imgIdx === 1) flagOffset = 2048;   // A2
        else if (imgIdx === 2) flagOffset = 2816;   // A3
        else if (imgIdx === 3) flagOffset = 4352;   // A4
        else if (imgIdx === 4) flagOffset = 5888;   // A5
        else if (imgIdx === 5) flagOffset = 6144;   // B
        else if (imgIdx === 6) flagOffset = 6400;   // C
        else if (imgIdx === 7) flagOffset = 6656;   // D
        else if (imgIdx === 8) flagOffset = 6912;   // E

        console.log(`Drawing overlays for image ${imgIdx} (orig: ${imageIndex}), offset ${flagOffset}, grid ${tilesPerRow}x${tilesPerCol}`);

        for (let y = 0; y < tilesPerCol; y++) {
            for (let x = 0; x < tilesPerRow; x++) {
                const tileIndex = flagOffset + (y * tilesPerRow) + x;
                const flag = this.currentTileset.flags[tileIndex] || 0;

                const px = x * this.tileSize;
                const py = y * this.tileSize;
                const centerX = px + this.tileSize / 2;
                const centerY = py + this.tileSize / 2;

                const passageBits = flag & 0x0F; // Bits 0-3 for directions
                const aboveChar = flag & 0x10;   // Bit 4 for above characters

                // Draw O for fully passable tiles (bits 0-3 all clear, bit 4 also clear)
                if (passageBits === 0 && !aboveChar) {
                    ctx.fillStyle = 'rgba(100, 255, 100, 0.6)';
                    ctx.font = 'bold 28px Arial';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText('O', centerX, centerY);
                }

                // Draw X for fully impassable tiles (all direction bits set: 0x0F)
                if (passageBits === 0x0F) {
                    ctx.fillStyle = 'rgba(255, 0, 0, 0.8)';
                    ctx.font = 'bold 32px Arial';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText('X', centerX, centerY);
                }

                // Draw 4-dir arrows (bits 0-3) - only if not fully impassable or fully passable
                if (passageBits !== 0 && passageBits !== 0x0F) {
                    const margin = 8;
                    ctx.strokeStyle = 'rgba(255, 100, 100, 0.7)';
                    ctx.lineWidth = 2;

                    // Down blocked (bit 0)
                    if (flag & 0x01) {
                        ctx.beginPath();
                        ctx.moveTo(centerX - 6, py + this.tileSize - margin);
                        ctx.lineTo(centerX, py + this.tileSize - margin - 6);
                        ctx.lineTo(centerX + 6, py + this.tileSize - margin);
                        ctx.stroke();
                    }

                    // Left blocked (bit 1)
                    if (flag & 0x02) {
                        ctx.beginPath();
                        ctx.moveTo(px + margin, centerY - 6);
                        ctx.lineTo(px + margin + 6, centerY);
                        ctx.lineTo(px + margin, centerY + 6);
                        ctx.stroke();
                    }

                    // Right blocked (bit 2)
                    if (flag & 0x04) {
                        ctx.beginPath();
                        ctx.moveTo(px + this.tileSize - margin, centerY - 6);
                        ctx.lineTo(px + this.tileSize - margin - 6, centerY);
                        ctx.lineTo(px + this.tileSize - margin, centerY + 6);
                        ctx.stroke();
                    }

                    // Up blocked (bit 3)
                    if (flag & 0x08) {
                        ctx.beginPath();
                        ctx.moveTo(centerX - 6, py + margin);
                        ctx.lineTo(centerX, py + margin + 6);
                        ctx.lineTo(centerX + 6, py + margin);
                        ctx.stroke();
                    }
                }

                // Draw star for above characters (bit 4 set)
                if (flag & 0x10) {
                    ctx.fillStyle = 'rgba(255, 215, 0, 0.95)';
                    ctx.font = `bold ${this.tileSize - 10}px Arial`;
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText('★', centerX, centerY);
                }

                // Draw ladder icon (bit 5 set) - in top-left corner
                if (flag & 0x20) {
                    ctx.fillStyle = 'rgba(150, 200, 255, 0.9)';
                    ctx.fillRect(px + 4, py + 4, 8, 16);
                    // Rungs
                    ctx.fillStyle = 'rgba(50, 50, 150, 0.9)';
                    ctx.fillRect(px + 3, py + 7, 10, 2);
                    ctx.fillRect(px + 3, py + 11, 10, 2);
                    ctx.fillRect(px + 3, py + 15, 10, 2);
                }

                // Draw bush icon (bit 6 set) - green circle in top-right corner
                if (flag & 0x40) {
                    ctx.fillStyle = 'rgba(50, 200, 50, 0.9)';
                    ctx.beginPath();
                    ctx.arc(px + this.tileSize - 8, py + 8, 6, 0, Math.PI * 2);
                    ctx.fill();
                    // Add darker center
                    ctx.fillStyle = 'rgba(20, 100, 20, 0.9)';
                    ctx.beginPath();
                    ctx.arc(px + this.tileSize - 8, py + 8, 3, 0, Math.PI * 2);
                    ctx.fill();
                }

                // Draw counter icon (bit 7 set) - purple bar in bottom-left
                if (flag & 0x80) {
                    ctx.fillStyle = 'rgba(200, 150, 255, 0.9)';
                    ctx.fillRect(px + 4, py + this.tileSize - 8, 16, 4);
                }

                // Draw damage floor icon (bit 8 set) - warning symbol in bottom-right
                if (flag & 0x100) {
                    ctx.fillStyle = 'rgba(255, 100, 0, 0.95)';
                    ctx.font = `bold ${this.tileSize / 3}px Arial`;
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText('⚠', px + this.tileSize - 12, py + this.tileSize - 12);
                }

                // Draw terrain tag (bits 12-15)
                const terrainTag = (flag >> 12) & 0x0F;
                if (terrainTag > 0) {
                    ctx.fillStyle = 'rgba(100, 255, 100, 0.8)';
                    ctx.font = `${this.tileSize / 3}px Arial`;
                    ctx.textAlign = 'right';
                    ctx.textBaseline = 'top';
                    ctx.fillText(terrainTag.toString(), px + this.tileSize - 4, py + 2);
                }

                // Draw grid
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
                ctx.strokeRect(px, py, this.tileSize, this.tileSize);
            }
        }
    }

    handleTilesetCanvasClick(e) {
        console.log('Canvas clicked!', e);

        if (!this.currentTileset || this.selectedImageIndex === null) {
            console.log('Click ignored: no tileset or image selected', {
                currentTileset: this.currentTileset,
                selectedImageIndex: this.selectedImageIndex
            });
            return;
        }

        const canvas = document.getElementById('tileset-canvas');
        const rect = canvas.getBoundingClientRect();

        // Get the actual canvas coordinates accounting for any scaling
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;

        const canvasX = (e.clientX - rect.left) * scaleX;
        const canvasY = (e.clientY - rect.top) * scaleY;

        const x = Math.floor(canvasX / this.tileSize);
        const y = Math.floor(canvasY / this.tileSize);

        const tilesPerRow = Math.floor(canvas.width / this.tileSize);
        const tilesPerCol = Math.floor(canvas.height / this.tileSize);

        console.log(`Click at canvas (${canvasX}, ${canvasY}) -> tile (${x}, ${y}), grid: ${tilesPerRow}x${tilesPerCol}`);

        // Validate click is within bounds
        if (x < 0 || x >= tilesPerRow || y < 0 || y >= tilesPerCol) {
            console.log(`Click out of bounds: (${x}, ${y})`);
            return;
        }

        // Calculate flag offset (ensure we're working with a number)
        const idx = parseInt(this.selectedImageIndex);
        let flagOffset = 0;
        if (idx === 0) flagOffset = 0;
        else if (idx === 1) flagOffset = 2048;
        else if (idx === 2) flagOffset = 2816;
        else if (idx === 3) flagOffset = 4352;
        else if (idx === 4) flagOffset = 5888;
        else if (idx === 5) flagOffset = 6144;
        else if (idx === 6) flagOffset = 6400;
        else if (idx === 7) flagOffset = 6656;
        else if (idx === 8) flagOffset = 6912;

        const tileIndex = flagOffset + (y * tilesPerRow) + x;

        if (!this.currentTileset.flags) {
            this.currentTileset.flags = new Array(8192).fill(0);
        }

        let currentFlag = this.currentTileset.flags[tileIndex] || 0;
        const oldFlag = currentFlag;

        // Apply the edit based on mode
        if (this.currentEditMode === 'passable') {
            // Clear impassable bits (set to 0) - keep upper bits
            currentFlag = currentFlag & ~0x0F;
        } else if (this.currentEditMode === 'impassable') {
            // Set all direction bits to impassable (0x0F) - keep upper bits
            currentFlag = (currentFlag & ~0x0F) | 0x0F;
        } else if (this.currentEditMode === 'star') {
            // Toggle star bit (0x10) - keep all other bits
            currentFlag = currentFlag ^ 0x10;
        }

        // Only update and re-render if the flag actually changed
        if (currentFlag !== oldFlag) {
            this.currentTileset.flags[tileIndex] = currentFlag;
            console.log(`Tile (${x}, ${y}) at index ${tileIndex}: flag ${oldFlag} (0x${oldFlag.toString(16)}) -> ${currentFlag} (0x${currentFlag.toString(16)}) (mode: ${this.currentEditMode})`);

            // Re-render the canvas
            const fileName = this.currentTileset.tilesetNames[this.selectedImageIndex];
            this.renderTilesetCanvas(fileName, this.selectedImageIndex);
        } else {
            console.log(`Tile (${x}, ${y}) at index ${tileIndex}: flag unchanged ${oldFlag} (0x${oldFlag.toString(16)}) (mode: ${this.currentEditMode})`);
        }
    }

    // Initialize a compact UI for display within the database modal
    initializeCompactUI(container, tileset) {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        // Load the full tilesets list from file
        this.loadTilesets();

        // Set the current tileset
        this.currentTileset = tileset;

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
                        <!-- Top: Layer list -->
                        <div style="flex: 1; display: flex; flex-direction: column; border-bottom: 1px solid var(--color-border); overflow: hidden;">
                            <div style="padding: 8px; border-bottom: 1px solid var(--color-border); background-color: var(--color-bg-panel);">
                                <h3 style="margin: 0; font-size: 11px; font-weight: 600; color: var(--color-text);">${tt('Tileset Layers')}</h3>
                            </div>
                            <div style="flex: 1; overflow-y: auto; padding: 8px;">
                                <div style="margin-bottom: 12px;">
                                    <h4 style="margin: 0 0 6px 0; font-size: 9px; color: var(--color-text-muted); text-transform: uppercase; letter-spacing: 0.5px;">${tt('Autotiles (A)')}</h4>
                                    ${this.createCompactLayerItem('A1', 0)}
                                    ${this.createCompactLayerItem('A2', 1)}
                                    ${this.createCompactLayerItem('A3', 2)}
                                    ${this.createCompactLayerItem('A4', 3)}
                                    ${this.createCompactLayerItem('A5', 4)}
                                </div>
                                <div>
                                    <h4 style="margin: 0 0 6px 0; font-size: 9px; color: var(--color-text-muted); text-transform: uppercase; letter-spacing: 0.5px;">${tt('Normal (B-E)')}</h4>
                                    ${this.createCompactLayerItem('B', 5)}
                                    ${this.createCompactLayerItem('C', 6)}
                                    ${this.createCompactLayerItem('D', 7)}
                                    ${this.createCompactLayerItem('E', 8)}
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
                                        style="width: 100%; margin-bottom: 6px; font-size: 12px; padding: 10px; background-color: var(--color-bg-panel); border: 1px solid var(--color-border-input); color: var(--color-text); border-radius: 6px; cursor: pointer; text-align: left;">
                                    ${tt('Passability (O/X/★)')}
                                </button>
                                <button class="compact-flag-btn" id="flag-4dir" data-mode="4dir"
                                        style="width: 100%; margin-bottom: 6px; font-size: 12px; padding: 10px; background-color: var(--color-bg-panel); border: 1px solid var(--color-border-input); color: var(--color-text); border-radius: 6px; cursor: pointer; text-align: left;">
                                    ↕↔ - ${tt('Passage (4 Dir)')}
                                </button>
                                <button class="compact-flag-btn" id="flag-ladder" data-mode="ladder"
                                        style="width: 100%; margin-bottom: 6px; font-size: 12px; padding: 10px; background-color: var(--color-bg-panel); border: 1px solid var(--color-border-input); color: var(--color-text); border-radius: 6px; cursor: pointer; text-align: left;">
                                    ${tt('Ladder')}
                                </button>
                                <button class="compact-flag-btn" id="flag-bush" data-mode="bush"
                                        style="width: 100%; margin-bottom: 6px; font-size: 12px; padding: 10px; background-color: var(--color-bg-panel); border: 1px solid var(--color-border-input); color: var(--color-text); border-radius: 6px; cursor: pointer; text-align: left;">
                                    ${tt('Bush')}
                                </button>
                                <button class="compact-flag-btn" id="flag-counter" data-mode="counter"
                                        style="width: 100%; margin-bottom: 6px; font-size: 12px; padding: 10px; background-color: var(--color-bg-panel); border: 1px solid var(--color-border-input); color: var(--color-text); border-radius: 6px; cursor: pointer; text-align: left;">
                                    ${tt('Counter')}
                                </button>
                                <button class="compact-flag-btn" id="flag-damage" data-mode="damage"
                                        style="width: 100%; margin-bottom: 6px; font-size: 12px; padding: 10px; background-color: var(--color-bg-panel); border: 1px solid var(--color-border-input); color: var(--color-text); border-radius: 6px; cursor: pointer; text-align: left;">
                                    ⚠ - ${tt('Damage Floor')}
                                </button>
                                <button class="compact-flag-btn" id="flag-terrain" data-mode="terrain"
                                        style="width: 100%; margin-bottom: 6px; font-size: 12px; padding: 10px; background-color: var(--color-bg-panel); border: 1px solid var(--color-border-input); color: var(--color-text); border-radius: 6px; cursor: pointer; text-align: left;">
                                    ${tt('Terrain Tag (0-7)')}
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
                        </div>

                        <!-- Preview area with canvas -->
                        <div style="flex: 1; overflow: auto; padding: 16px; display: flex; align-items: flex-start; justify-content: center;">
                            <div id="compact-tileset-canvas-container" style="max-width: 100%;">
                                <p style="color: var(--color-text-muted); font-size: 10px;">${tt('Click a layer on the left to view')}</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // Wait for DOM to be ready, then initialize
        setTimeout(() => {
            // Set up event listeners for the compact UI
            this.setupCompactEventListeners();

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
                 style="margin-bottom: 6px; padding: 6px; background-color: var(--color-bg-panel); border: 1px solid var(--color-border); border-radius: 3px; cursor: pointer; transition: all 0.15s;">
                <div style="display: flex; align-items: center; gap: 6px;">
                    <div class="layer-thumb-mini" style="width: 32px; height: 32px; background: var(--color-bg-surface); border: 1px solid var(--color-border-input); display: flex; align-items: center; justify-content: center; font-size: 8px; color: var(--color-text-dim); overflow: hidden; flex-shrink: 0;">
                        ${fileName ? '' : '-'}
                    </div>
                    <div style="flex: 1; min-width: 0;">
                        <div style="font-size: 10px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                            <span style="font-weight: 600; color: var(--color-accent-bright);">${label}</span>
                            <span style="color: ${fileName ? 'var(--color-text-muted)' : 'var(--color-text-dim)'}; font-weight: normal; font-size: 9px;"> - ${rrEscapeHtml(fileName || tt('(None)'))}</span>
                        </div>
                    </div>
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
        const layerNames = ['A1', 'A2', 'A3', 'A4', 'A5', 'B', 'C', 'D', 'E'];
        const layerName = layerNames[index];

        // Show custom image picker modal
        this.showTilesetImagePicker(index, layerName);
    }

    // Show custom tileset image picker modal with file list and preview
    showTilesetImagePicker(layerIndex, layerName) {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        // Create modal overlay
        const modal = document.createElement('div');
        modal.style.cssText = `
            position: fixed; top: 0; left: 0; right: 0; bottom: 0;
            background: rgba(0,0,0,0.8); z-index: 10000;
            display: flex; align-items: center; justify-content: center;
        `;

        // Create modal content
        const modalContent = document.createElement('div');
        modalContent.style.cssText = `
            background: var(--color-bg-list-item); border: 2px solid var(--color-accent-bright);
            border-radius: 8px; width: 85%; max-width: 1100px; height: 85%;
            display: flex; flex-direction: column; overflow: hidden;
        `;

        // Header
        const header = document.createElement('div');
        header.style.cssText = 'padding: 16px; border-bottom: 1px solid var(--color-border); background: var(--color-bg-surface);';
        header.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <h3 style="margin: 0; color: var(--color-accent-bright); font-size: 16px;">${tt('Select Tileset for')} ${layerName}</h3>
                <button id="close-picker" style="background: var(--color-danger-pressed); color: white; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer;">${tt('Close')}</button>
            </div>
        `;

        // Main content area (file list + preview)
        const mainContent = document.createElement('div');
        mainContent.style.cssText = 'flex: 1; display: flex; overflow: hidden;';

        // Left: File list
        const fileListContainer = document.createElement('div');
        fileListContainer.style.cssText = `
            width: 300px; border-right: 1px solid var(--color-border);
            background: var(--color-bg-surface); overflow-y: auto;
        `;

        // Right: Large preview
        const previewContainer = document.createElement('div');
        previewContainer.style.cssText = `
            flex: 1; background: #0a0a0a; display: flex;
            align-items: center; justify-content: center;
            overflow: auto; padding: 16px;
        `;
        previewContainer.innerHTML = `<p style="color: var(--color-text-dim); font-size: 14px;">${tt('Select a tileset to preview')}</p>`;

        mainContent.appendChild(fileListContainer);
        mainContent.appendChild(previewContainer);

        modalContent.appendChild(header);
        modalContent.appendChild(mainContent);
        modal.appendChild(modalContent);

        // Load tileset files from img/tilesets
        const tilesetsDir = this.path.join(this.getProjectPath(), 'img', 'tilesets');

        if (this.fs.existsSync(tilesetsDir)) {
            const pngFiles = RRAssetFiles.listUnique(tilesetsDir, ['.png']);

            if (pngFiles.length === 0) {
                fileListContainer.innerHTML = `<p style="color: var(--color-text-muted); padding: 16px; font-size: 12px;">${tt('No tileset images found in img/tilesets')}</p>`;
            } else {
                pngFiles.forEach(file => {
                    const filePath = file.absolutePath;
                    const baseName = file.name;

                    // Create list item
                    const listItem = document.createElement('div');
                    listItem.style.cssText = `
                        padding: 10px 16px; cursor: pointer;
                        border-bottom: 1px solid var(--color-border);
                        transition: all 0.15s; font-size: 13px; color: var(--color-text);
                    `;
                    listItem.textContent = baseName;

                    // Hover effect
                    listItem.addEventListener('mouseenter', () => {
                        listItem.style.backgroundColor = 'var(--color-bg-menubar)';
                    });

                    listItem.addEventListener('mouseleave', () => {
                        if (!listItem.classList.contains('selected')) {
                            listItem.style.backgroundColor = 'transparent';
                        }
                    });

                    // Click to preview
                    listItem.addEventListener('click', () => {
                        // Remove previous selection
                        fileListContainer.querySelectorAll('div').forEach(item => {
                            item.classList.remove('selected');
                            if (item !== listItem) {
                                item.style.backgroundColor = 'transparent';
                            }
                        });

                        // Highlight this item
                        listItem.classList.add('selected');
                        listItem.style.backgroundColor = 'var(--color-bg-hover)';

                        // Show large preview with select button
                        previewContainer.innerHTML = `
                            <div style="display: flex; flex-direction: column; align-items: center; gap: 16px; max-width: 100%; max-height: 100%;">
                                <img src="${rrEscapeHtml(this.assetUrl(filePath))}"
                                     style="max-width: 100%; max-height: calc(100% - 60px); image-rendering: pixelated; display: block;">
                                <button id="select-tileset-btn" style="
                                    background: var(--color-accent-bright); color: var(--color-bg-deep); border: none;
                                    padding: 12px 32px; border-radius: 4px; cursor: pointer;
                                    font-size: 14px; font-weight: bold;
                                    transition: background 0.2s;
                                ">${tt('Select This Tileset')}</button>
                            </div>
                        `;

                        // Add select button handler
                        const selectBtn = previewContainer.querySelector('#select-tileset-btn');
                        selectBtn.addEventListener('mouseenter', () => {
                            selectBtn.style.background = '#FFC700';
                        });
                        selectBtn.addEventListener('mouseleave', () => {
                            selectBtn.style.background = 'var(--color-accent-bright)';
                        });
                        selectBtn.addEventListener('click', () => {
                            this.assignTilesetToLayer(layerIndex, baseName, layerName);
                            document.body.removeChild(modal);
                        });
                    });

                    // Double-click to select and close
                    listItem.addEventListener('dblclick', () => {
                        this.assignTilesetToLayer(layerIndex, baseName, layerName);
                        document.body.removeChild(modal);
                    });

                    fileListContainer.appendChild(listItem);
                });
            }
        } else {
            fileListContainer.innerHTML = `<p style="color: var(--color-text-muted); padding: 16px; font-size: 12px;">${tt('Tilesets directory not found')}</p>`;
        }

        // Close button handler
        header.querySelector('#close-picker').addEventListener('click', () => {
            document.body.removeChild(modal);
        });

        // Close on background click
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                document.body.removeChild(modal);
            }
        });

        document.body.appendChild(modal);
    }

    // Browse for external tileset file (copies to project)
    browseExternalTilesetFile(layerIndex, layerName) {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/png';

        input.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                const baseName = this.path.basename(file.path, '.png');
                const fileName = baseName + '.png';

                const tilesetsDir = this.path.join(this.getProjectPath(), 'img', 'tilesets');
                const destPath = this.path.join(tilesetsDir, fileName);

                try {
                    if (!this.fs.existsSync(tilesetsDir)) {
                        this.fs.mkdirSync(tilesetsDir, { recursive: true });
                    }

                    this.fs.copyFileSync(file.path, destPath);
                    this.assignTilesetToLayer(layerIndex, baseName, layerName);
                    this.updateStatus(`${tt('Imported and assigned:')} ${fileName} ${tt('to')} ${layerName}`);
                } catch (error) {
                    console.error('Failed to copy file:', error);
                    this.updateStatus(tt('Error: Failed to import file'));
                }
            }
        });

        input.click();
    }

    // Assign a tileset to a layer
    assignTilesetToLayer(layerIndex, baseName, layerName) {
        // Clear cache for old layer first (before overwriting)
        const oldFileName = this.currentTileset.tilesetNames[layerIndex];
        if (oldFileName) {
            const oldCacheKey = `${layerIndex}_${oldFileName.endsWith('.png') ? oldFileName : oldFileName + '.png'}`;
            this.imageCache.delete(oldCacheKey);
        }

        // Update tileset data
        this.currentTileset.tilesetNames[layerIndex] = baseName;

        // Clear cache for new layer as well
        const newCacheKey = `${layerIndex}_${baseName}.png`;
        this.imageCache.delete(newCacheKey);

        // Switch to the tab that contains this layer
        const appropriateTab = this.getTabForLayerIndex(layerIndex);
        this.switchTab(appropriateTab);

        // Refresh UI - reload thumbnails
        this.loadLayerListThumbnails();

        console.log(`Tileset ${baseName} assigned to ${layerName} (index ${layerIndex})`);
        this.updateStatus(`${layerName}: ${baseName}`);
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
            container.innerHTML = `<p style="color: var(--color-text-muted); font-size: 10px; text-align: center;">${tt('No images assigned to this tab')}</p>`;
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
                const isBtoE = index >= 5 && index <= 8;

                // Create canvas for this layer
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                ctx.imageSmoothingEnabled = false;

                if (isBtoE) {
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
                    const cacheKey = `${index}_${fileName}`;
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
                this.drawCompactPassageOverlay(ctx, canvas.width, canvas.height, index, isBtoE);

                // Add click handler
                canvas.addEventListener('click', (e) => {
                    this.handleCompactCanvasClick(e, canvas, index, fileName, isBtoE);
                });

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
        return 'A'; // Default
    }

    // Create a layer list item for the left sidebar
    createLayerListItem(label, index, description) {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        const fileName = this.currentTileset.tilesetNames[index] || '';
        const displayName = fileName || '';

        return `
            <div class="compact-tileset-image-slot" data-index="${index}" data-filename="${rrEscapeHtml(fileName)}"
                 style="display: flex; align-items: center; gap: 8px; padding: 6px; margin-bottom: 4px; background-color: var(--color-bg-menubar); border: 1px solid var(--color-border); border-radius: 3px; cursor: pointer; transition: all 0.15s;">
                <div class="layer-thumbnail-container" style="width: 60px; height: 60px; background: var(--color-bg-surface); border: 1px solid var(--color-border-input); display: flex; align-items: center; justify-content: center; font-size: 9px; color: var(--color-text-dim); overflow: hidden;">
                    ${fileName ? '' : '-'}
                </div>
                <div style="flex: 1; min-width: 0;">
                    <div style="font-weight: 600; color: #4fc3f7; font-size: 10px; margin-bottom: 2px;">${label}</div>
                    <div class="layer-filename" style="font-size: 8px; color: ${fileName ? 'var(--color-text)' : 'var(--color-text-dim)'}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${rrEscapeHtml(displayName || tt('No image assigned'))}">
                        ${rrEscapeHtml(displayName || tt('(None)'))}
                    </div>
                    <button class="change-image-btn" data-index="${index}" style="margin-top: 4px; padding: 2px 6px; font-size: 8px; background: var(--color-link); border: none; color: white; border-radius: 2px; cursor: pointer;">${tt('Change')}</button>
                </div>
            </div>
        `;
    }

    // Set up event listeners for the compact UI
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

                // Set edit mode
                this.currentEditMode = mode;
                console.log(`Edit mode: ${mode}`);
            });
        });
    }

    // Load thumbnails for all layer slots
    loadLayerThumbnails() {
        document.querySelectorAll('.compact-tileset-image-slot').forEach(slot => {
            const index = parseInt(slot.dataset.index);
            const fileName = slot.dataset.filename;

            if (fileName && this.path && this.getProjectPath()) {
                const thumbnailContainer = slot.querySelector('.layer-thumbnail-container');
                // Add .png extension if not already present
                const fileNameWithExt = fileName.endsWith('.png') ? fileName : fileName + '.png';
                const imagePath = this.path.join(this.getProjectPath(), 'img', 'tilesets', fileNameWithExt);

                console.log(`Loading thumbnail for layer ${index}: ${fileName}`);
                console.log(`  Project path: ${this.getProjectPath()}`);
                console.log(`  Full image path: ${imagePath}`);
                console.log(`  File exists: ${this.fs && this.fs.existsSync(imagePath)}`);

                if (this.fs && this.fs.existsSync(imagePath)) {
                    const img = document.createElement('img');
                    img.src = this.assetUrl(imagePath);
                    img.style.cssText = 'width: 100%; height: 100%; object-fit: cover; image-rendering: pixelated;';
                    img.onerror = () => {
                        console.error(`Failed to load thumbnail image: ${imagePath}`);
                        thumbnailContainer.innerHTML = '?';
                        thumbnailContainer.style.color = '#f44';
                    };
                    img.onload = () => {
                        console.log(`Successfully loaded thumbnail: ${fileName}`);
                    };
                    thumbnailContainer.innerHTML = '';
                    thumbnailContainer.appendChild(img);
                } else {
                    console.warn(`Thumbnail image not found: ${imagePath}`);
                    thumbnailContainer.innerHTML = '?';
                    thumbnailContainer.style.color = '#f66';
                }
            }
        });
    }

    // Open file picker to change a tileset image
    openImagePicker(index) {
        if (typeof nw === 'undefined') {
            const tt = text => window.I18n ? window.I18n.tText(text) : text;
            alert(tt('File picker requires NW.js'));
            return;
        }

        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/png';

        input.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                // Get just the filename without path
                const fileName = this.path.basename(file.path);

                // Update the tileset
                this.currentTileset.tilesetNames[index] = fileName;

                // Update the UI
                const slot = document.querySelector(`.compact-tileset-image-slot[data-index="${index}"]`);
                if (slot) {
                    slot.dataset.filename = fileName;
                    slot.querySelector('.layer-filename').textContent = fileName;
                    slot.querySelector('.layer-filename').style.color = 'var(--color-text)';

                    // Load the thumbnail
                    const thumbnailContainer = slot.querySelector('.layer-thumbnail-container');
                    const img = document.createElement('img');
                    img.src = this.assetUrl(file.path);
                    img.style.cssText = 'width: 100%; height: 100%; object-fit: cover; image-rendering: pixelated;';
                    thumbnailContainer.innerHTML = '';
                    thumbnailContainer.appendChild(img);
                }

                // Reload the full preview
                this.renderFullTilesetPreview();

                console.log(`Updated tileset layer ${index} to: ${fileName}`);
            }
        });

        input.click();
    }

    // Render tileset canvas for the compact UI
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
            const isBtoE = imageIndex >= 5 && imageIndex <= 8;

            // Check if we have a cached base image
            const cacheKey = `${imageIndex}_${fileName}`;
            let baseCanvas = this.imageCache.get(cacheKey);

            if (!baseCanvas) {
                // Create and cache the base image
                if (isBtoE) {
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
            this.drawCompactPassageOverlay(ctx, canvas.width, canvas.height, imageIndex, isBtoE);

            // Draw selection highlight if a tile is selected
            if (this.selectedTile) {
                this.drawSelectionHighlight(ctx, this.selectedTile.x, this.selectedTile.y, isBtoE);
            }

            // Set up click handler
            canvas.addEventListener('click', (e) => {
                this.handleCompactCanvasClick(e, canvas, imageIndex, fileName, isBtoE);
            });

            // Store current canvas info for updates
            this.currentCanvas = { canvas, ctx, imageIndex, isBtoE, baseCanvas };

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

        const { canvas, ctx, imageIndex, isBtoE, baseCanvas } = this.currentCanvas;

        // Clear and redraw from base
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(baseCanvas, 0, 0);

        // Redraw passage overlay
        this.drawCompactPassageOverlay(ctx, canvas.width, canvas.height, imageIndex, isBtoE);

        // Redraw selection highlight if a tile is selected
        if (this.selectedTile) {
            this.drawSelectionHighlight(ctx, this.selectedTile.x, this.selectedTile.y, isBtoE);
        }
    }

    // Redraw overlay on a specific canvas (for tab view with multiple canvases)
    redrawCanvasOverlay(canvas, imageIndex, isBtoE) {
        const ctx = canvas.getContext('2d');

        // Get the cached base canvas for this layer
        const fileName = this.currentTileset.tilesetNames[imageIndex];
        // Normalize fileName to include .png extension (must match how it was cached)
        const fileNameWithExt = fileName && (fileName.endsWith('.png') ? fileName : fileName + '.png');
        const cacheKey = `${imageIndex}_${fileNameWithExt}`;

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
        this.drawCompactPassageOverlay(ctx, canvas.width, canvas.height, imageIndex, isBtoE);

        // Redraw selection highlight if a tile is selected
        if (this.selectedTile) {
            this.drawSelectionHighlight(ctx, this.selectedTile.x, this.selectedTile.y, isBtoE);
        }
    }

    // Draw 48x48 grid over tileset (like map editor)
    drawTilesetGrid(ctx, width, height, scale) {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.lineWidth = 1;

        const tileSize = 48 * scale; // RPG Maker uses 48px tiles

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
        const tileSize = 48; // Each preview tile is 48x48

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
            default:
                return 0;
        }
    }

    // Draw passage overlay for compact UI
    drawCompactPassageOverlay(ctx, width, height, imageIndex, isBtoE) {
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
                    ctx.fillStyle = 'rgba(100, 255, 100, 0.6)';
                    ctx.font = 'bold 28px Arial';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText('O', centerX, centerY);
                }

                // Draw X for fully impassable tiles (all direction bits set: 0x0F)
                if (passageBits === 0x0F) {
                    ctx.fillStyle = 'rgba(255, 0, 0, 0.8)';
                    ctx.font = 'bold 32px Arial';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText('X', centerX, centerY);
                }

                // Draw 4-dir passage indicators (arrows for passable, dots for blocked)
                // Don't show if we're displaying O, X, or ★
                const isO = passageBits === 0 && !aboveChar;
                const isX = passageBits === 0x0F;
                const isStar = aboveChar;

                if (!isO && !isX && !isStar) {
                    const margin = 8;
                    const arrowSize = 6;
                    const dotRadius = 3;

                    // Down: bit 0 (SET = blocked, CLEAR = passable)
                    if (flag & 0x01) {
                        // Blocked - show dot
                        ctx.fillStyle = 'rgba(255, 100, 100, 0.8)';
                        ctx.beginPath();
                        ctx.arc(centerX, drawY + this.tileSize - margin, dotRadius, 0, Math.PI * 2);
                        ctx.fill();
                    } else {
                        // Passable - show outward arrow
                        ctx.strokeStyle = 'rgba(100, 255, 100, 0.8)';
                        ctx.fillStyle = 'rgba(100, 255, 100, 0.8)';
                        ctx.lineWidth = 2;
                        ctx.beginPath();
                        ctx.moveTo(centerX - arrowSize, drawY + this.tileSize - margin - arrowSize);
                        ctx.lineTo(centerX, drawY + this.tileSize - margin);
                        ctx.lineTo(centerX + arrowSize, drawY + this.tileSize - margin - arrowSize);
                        ctx.stroke();
                    }

                    // Left: bit 1
                    if (flag & 0x02) {
                        // Blocked - show dot
                        ctx.fillStyle = 'rgba(255, 100, 100, 0.8)';
                        ctx.beginPath();
                        ctx.arc(drawX + margin, centerY, dotRadius, 0, Math.PI * 2);
                        ctx.fill();
                    } else {
                        // Passable - show outward arrow
                        ctx.strokeStyle = 'rgba(100, 255, 100, 0.8)';
                        ctx.fillStyle = 'rgba(100, 255, 100, 0.8)';
                        ctx.lineWidth = 2;
                        ctx.beginPath();
                        ctx.moveTo(drawX + margin + arrowSize, centerY - arrowSize);
                        ctx.lineTo(drawX + margin, centerY);
                        ctx.lineTo(drawX + margin + arrowSize, centerY + arrowSize);
                        ctx.stroke();
                    }

                    // Right: bit 2
                    if (flag & 0x04) {
                        // Blocked - show dot
                        ctx.fillStyle = 'rgba(255, 100, 100, 0.8)';
                        ctx.beginPath();
                        ctx.arc(drawX + this.tileSize - margin, centerY, dotRadius, 0, Math.PI * 2);
                        ctx.fill();
                    } else {
                        // Passable - show outward arrow
                        ctx.strokeStyle = 'rgba(100, 255, 100, 0.8)';
                        ctx.fillStyle = 'rgba(100, 255, 100, 0.8)';
                        ctx.lineWidth = 2;
                        ctx.beginPath();
                        ctx.moveTo(drawX + this.tileSize - margin - arrowSize, centerY - arrowSize);
                        ctx.lineTo(drawX + this.tileSize - margin, centerY);
                        ctx.lineTo(drawX + this.tileSize - margin - arrowSize, centerY + arrowSize);
                        ctx.stroke();
                    }

                    // Up: bit 3
                    if (flag & 0x08) {
                        // Blocked - show dot
                        ctx.fillStyle = 'rgba(255, 100, 100, 0.8)';
                        ctx.beginPath();
                        ctx.arc(centerX, drawY + margin, dotRadius, 0, Math.PI * 2);
                        ctx.fill();
                    } else {
                        // Passable - show outward arrow
                        ctx.strokeStyle = 'rgba(100, 255, 100, 0.8)';
                        ctx.fillStyle = 'rgba(100, 255, 100, 0.8)';
                        ctx.lineWidth = 2;
                        ctx.beginPath();
                        ctx.moveTo(centerX - arrowSize, drawY + margin + arrowSize);
                        ctx.lineTo(centerX, drawY + margin);
                        ctx.lineTo(centerX + arrowSize, drawY + margin + arrowSize);
                        ctx.stroke();
                    }
                }

                // Draw star for above characters (bit 4 set)
                if (flag & 0x10) {
                    ctx.fillStyle = 'rgba(255, 215, 0, 0.95)';
                    ctx.font = `bold ${this.tileSize - 10}px Arial`;
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText('★', centerX, centerY);
                }

                // Draw ladder icon (bit 5 set) - in top-left corner
                if (flag & 0x20) {
                    ctx.fillStyle = 'rgba(150, 200, 255, 0.9)';
                    ctx.fillRect(drawX + 4, drawY + 4, 8, 16);
                    // Rungs
                    ctx.fillStyle = 'rgba(50, 50, 150, 0.9)';
                    ctx.fillRect(drawX + 3, drawY + 7, 10, 2);
                    ctx.fillRect(drawX + 3, drawY + 11, 10, 2);
                    ctx.fillRect(drawX + 3, drawY + 15, 10, 2);
                }

                // Draw bush icon (bit 6 set) - green circle in top-right corner
                if (flag & 0x40) {
                    ctx.fillStyle = 'rgba(50, 200, 50, 0.9)';
                    ctx.beginPath();
                    ctx.arc(drawX + this.tileSize - 8, drawY + 8, 6, 0, Math.PI * 2);
                    ctx.fill();
                    // Add darker center
                    ctx.fillStyle = 'rgba(20, 100, 20, 0.9)';
                    ctx.beginPath();
                    ctx.arc(drawX + this.tileSize - 8, drawY + 8, 3, 0, Math.PI * 2);
                    ctx.fill();
                }

                // Draw counter icon (bit 7 set) - purple bar in bottom-left
                if (flag & 0x80) {
                    ctx.fillStyle = 'rgba(200, 150, 255, 0.9)';
                    ctx.fillRect(drawX + 4, drawY + this.tileSize - 8, 16, 4);
                }

                // Draw damage floor icon (bit 8 set) - warning symbol in bottom-right
                if (flag & 0x100) {
                    ctx.fillStyle = 'rgba(255, 100, 0, 0.95)';
                    ctx.font = `bold ${this.tileSize / 3}px Arial`;
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText('⚠', drawX + this.tileSize - 12, drawY + this.tileSize - 12);
                }

                // Draw terrain tag (bits 12-15)
                const terrainTag = (flag >> 12) & 0x0F;
                if (terrainTag > 0) {
                    ctx.font = `bold ${this.tileSize / 3}px Arial`;
                    ctx.textAlign = 'right';
                    ctx.textBaseline = 'top';
                    // Draw black border
                    ctx.strokeStyle = '#000000';
                    ctx.lineWidth = 3;
                    ctx.strokeText(terrainTag.toString(), drawX + this.tileSize - 4, drawY + 2);
                    // Draw white fill
                    ctx.fillStyle = '#FFFFFF';
                    ctx.fillText(terrainTag.toString(), drawX + this.tileSize - 4, drawY + 2);
                }
            }
        }
    }

    // Draw selection highlight overlay (like TilesetPaletteViewer)
    drawSelectionHighlight(ctx, tileX, tileY, isBtoE) {
        const scale = 1;
        const tileSize = 48 * scale;

        // Convert logical tile coordinates to canvas coordinates
        // For B-E layers, tiles in the right half (x >= 8) are drawn in the bottom half
        let canvasX = tileX;
        let canvasY = tileY;

        if (isBtoE && tileX >= 8) {
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
    handleCompactCanvasClick(e, canvas, imageIndex, fileName, isBtoE) {
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

        // Apply the selected edit mode
        switch (this.currentEditMode) {
            case 'passability':
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
                const currentTerrain = (oldFlag >> 12) & 0x0F;
                const nextTerrain = (currentTerrain + 1) % 8; // Cycle 0→1→2→3→4→5→6→7→0
                currentFlag = (oldFlag & ~0xF000) | (nextTerrain << 12);
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

            // Redraw the overlay on the clicked canvas
            // Use this.currentCanvas if available (single layer view), otherwise redraw the clicked canvas directly
            if (this.currentCanvas && this.currentCanvas.canvas === canvas) {
                this.redrawOverlay();
            } else {
                // For tab view with multiple canvases, redraw the clicked canvas directly
                this.redrawCanvasOverlay(canvas, imageIndex, isBtoE);
            }
        } else {
            console.log('Flag unchanged');
        }
    }

    // Render full tileset preview showing all layers stacked vertically (like RPG Maker)
    renderFullTilesetPreview() {
        const container = document.getElementById('compact-tileset-preview-container');
        if (!container) {
            console.warn('compact-tileset-preview-container not found');
            return;
        }

        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        container.innerHTML = `<p style="color: var(--color-text-muted); font-size: 10px;">${tt('Loading tileset preview...')}</p>`;

        // Collect all tileset images that exist, in order
        const tilesetImages = [];
        console.log('=== Rendering Full Tileset Preview ===');
        console.log('Project path:', this.getProjectPath());
        for (let i = 0; i < 9; i++) {
            const fileName = this.currentTileset.tilesetNames[i];
            if (fileName && this.path && this.getProjectPath()) {
                // Add .png extension if not already present
                const fileNameWithExt = fileName.endsWith('.png') ? fileName : fileName + '.png';
                const imagePath = this.path.join(this.getProjectPath(), 'img', 'tilesets', fileNameWithExt);
                const exists = this.fs && this.fs.existsSync(imagePath);
                console.log(`Layer ${i} (${['A1', 'A2', 'A3', 'A4', 'A5', 'B', 'C', 'D', 'E'][i]}): ${fileName} -> ${imagePath} (exists: ${exists})`);
                if (exists) {
                    tilesetImages.push({ index: i, fileName: fileNameWithExt, imagePath });
                }
            }
        }

        if (tilesetImages.length === 0) {
            container.innerHTML = `<p style="color: var(--color-text-muted); font-size: 10px;">${tt('No tileset images assigned. Click a layer on the left to assign images.')}</p>`;
            return;
        }

        // Create a wrapper for the stacked tileset images
        const previewWrapper = document.createElement('div');
        previewWrapper.style.cssText = 'display: inline-block; border: 2px solid var(--color-border-input);';

        let loadedCount = 0;
        const totalImages = tilesetImages.length;
        const imagesToLoad = [];

        // Load all images first to determine dimensions
        tilesetImages.forEach(({ index, fileName, imagePath }) => {
            const img = new Image();
            img.dataset.index = index;
            img.dataset.fileName = fileName;

            img.onload = () => {
                loadedCount++;
                imagesToLoad.push({ img, index, fileName });
                console.log(`Loaded tileset layer ${['A1', 'A2', 'A3', 'A4', 'A5', 'B', 'C', 'D', 'E'][index]}: ${fileName} (${loadedCount}/${totalImages})`);

                // When all images are loaded, stack them vertically
                if (loadedCount === totalImages) {
                    // Sort by index
                    imagesToLoad.sort((a, b) => a.index - b.index);

                    // Stack all images vertically
                    imagesToLoad.forEach(({ img, index, fileName }) => {
                        const layerNames = ['A1', 'A2', 'A3', 'A4', 'A5', 'B', 'C', 'D', 'E'];
                        const layerName = layerNames[index];

                        // For A1-A4 autotiles, render with autotile preview logic
                        if (index >= 0 && index <= 3) {
                            // A1-A4: Use autotile palette rendering
                            const canvas = document.createElement('canvas');
                            const ctx = canvas.getContext('2d');
                            this.renderAutotilePalette(ctx, img, layerName);

                            canvas.style.cssText = 'display: block; width: 100%; height: auto; image-rendering: pixelated; border-bottom: 1px solid var(--color-bg-button-hover);';
                            canvas.style.borderBottom = (index === 8) ? 'none' : '1px solid var(--color-bg-button-hover)';
                            previewWrapper.appendChild(canvas);
                        } else {
                            // A5, B-E: Display as-is using img element
                            const imgEl = document.createElement('img');
                            imgEl.src = this.assetUrl(this.path.join(this.getProjectPath(), 'img', 'tilesets', fileName));
                            imgEl.style.cssText = 'display: block; width: 100%; height: auto; image-rendering: pixelated; border-bottom: 1px solid var(--color-bg-button-hover);';
                            imgEl.style.borderBottom = (index === 8) ? 'none' : '1px solid var(--color-bg-button-hover)';
                            previewWrapper.appendChild(imgEl);
                        }
                    });

                    container.innerHTML = '';
                    container.appendChild(previewWrapper);
                    console.log('Full tileset preview rendered with all layers stacked');
                }
            };

            img.onerror = () => {
                loadedCount++;
                console.error('Failed to load tileset image:', fileName);

                if (loadedCount === totalImages) {
                    if (imagesToLoad.length === 0) {
                        container.innerHTML = `<p style="color: #f44; font-size: 10px;">${tt('Failed to load tileset images')}</p>`;
                    } else {
                        // Show what we could load
                        imagesToLoad.sort((a, b) => a.index - b.index);
                        imagesToLoad.forEach(({ img, index, fileName }) => {
                            const layerNames = ['A1', 'A2', 'A3', 'A4', 'A5', 'B', 'C', 'D', 'E'];
                            const layerName = layerNames[index];

                            // For A1-A4 autotiles, render with autotile preview logic
                            if (index >= 0 && index <= 3) {
                                // A1-A4: Use autotile palette rendering
                                const canvas = document.createElement('canvas');
                                const ctx = canvas.getContext('2d');
                                this.renderAutotilePalette(ctx, img, layerName);

                                canvas.style.cssText = 'display: block; width: 100%; height: auto; image-rendering: pixelated; border-bottom: 1px solid var(--color-bg-button-hover);';
                                previewWrapper.appendChild(canvas);
                            } else {
                                // A5, B-E: Display as-is
                                const imgEl = document.createElement('img');
                                imgEl.src = this.assetUrl(this.path.join(this.getProjectPath(), 'img', 'tilesets', fileName));
                                imgEl.style.cssText = 'display: block; width: 100%; height: auto; image-rendering: pixelated; border-bottom: 1px solid var(--color-bg-button-hover);';
                                previewWrapper.appendChild(imgEl);
                            }
                        });
                        container.innerHTML = '';
                        container.appendChild(previewWrapper);
                    }
                }
            };

            img.src = this.assetUrl(imagePath);
        });
    }

    // ========================================
    // Database Integration Wrapper Methods
    // ========================================

    /**
     * Update status message (calls back to parent editor)
     */
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
    showTilesetDetail(container, tileset) {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        const wrapper = document.createElement('div');
        wrapper.style.display = 'flex';
        wrapper.style.flexDirection = 'column';
        wrapper.style.height = '100%';

        const gridWrapper = document.createElement('div');
        gridWrapper.style.padding = '16px';
        gridWrapper.style.display = 'flex';
        gridWrapper.style.flexDirection = 'column';
        gridWrapper.style.gap = '16px';

        // General Settings
        const generalSection = document.createElement('div');
        generalSection.className = 'database-section';
        generalSection.innerHTML = `
            <div class="database-section-header">${tt('General')}</div>
            <div class="database-section-content">
                <div class="form-row">
                    <div class="form-group">
                        <label class="database-field-label">${tt('Name:')}</label>
                        <input type="text" class="database-field-value" value="${rrEscapeHtml(tileset.name)}" data-field="name" data-tileset-id="${tileset.id}">
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group-fixed">
                        <label class="database-field-label">${tt('Mode:')}</label>
                        <select class="database-field-value" style="width: 120px;" readonly disabled>
                            <option value="0" ${tileset.mode === 0 ? 'selected' : ''}>${tt('Field')}</option>
                            <option value="1" ${tileset.mode === 1 ? 'selected' : ''}>${tt('Area')}</option>
                        </select>
                    </div>
                </div>
            </div>
        `;
        gridWrapper.appendChild(generalSection);

        // Tileset Images Section
        const imagesSection = document.createElement('div');
        imagesSection.className = 'database-section';
        const tilesetNames = tileset.tilesetNames || [];
        const imageLabels = [tt('A1 (Animations)'), tt('A2 (Ground)'), tt('A3 (Buildings)'), tt('A4 (Walls)'), tt('A5 (Normal)'), 'B', 'C', 'D', 'E'];

        imagesSection.innerHTML = `
            <div class="database-section-header">${tt('Tileset Images')}</div>
            <div class="database-section-content">
                <table class="traits-table">
                    <thead>
                        <tr>
                            <th>${tt('Type')}</th>
                            <th>${tt('Filename')}</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${imageLabels.map((label, idx) => `
                            <tr>
                                <td style="width: 150px;">${label}</td>
                                <td style="font-family: monospace; font-size: 11px;">${tilesetNames[idx] ? rrEscapeHtml(tilesetNames[idx]) : `<i style="color: var(--color-text-dim);">${tt('not set')}</i>`}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
                <p style="color: var(--color-text-muted); font-size: 11px; margin-top: 12px;">
                    ${tt('Tileset image editing requires the advanced tileset editor')}
                </p>
            </div>
        `;
        gridWrapper.appendChild(imagesSection);

        // Note Section
        const noteSection = document.createElement('div');
        noteSection.className = 'database-section';
        noteSection.innerHTML = `
            <div class="database-section-header">${tt('Note')}</div>
            <div class="database-section-content">
                <textarea class="database-field-value" rows="4" style="width: 100%;" data-field="note" data-tileset-id="${tileset.id}">${rrEscapeHtml(tileset.note)}</textarea>
            </div>
        `;
        gridWrapper.appendChild(noteSection);

        wrapper.appendChild(gridWrapper);
        container.appendChild(wrapper);

        // Add event listeners
        setTimeout(() => {
            const editableFields = container.querySelectorAll('[data-tileset-id]');
            editableFields.forEach(field => {
                field.addEventListener('change', (e) => {
                    const fieldName = e.target.dataset.field;
                    const tilesetId = parseInt(e.target.dataset.tilesetId);
                    const value = e.target.value;
                    this.updateTilesetField(tilesetId, fieldName, value);
                });
            });
        }, 0);
    }

    /**
     * Update tileset field (for database modal)
     */
    updateTilesetField(tilesetId, fieldName, value) {
        const tileset = this.databaseManager.getTileset(tilesetId);
        if (!tileset) return;

        tileset[fieldName] = value;
        this.databaseManager.updateTileset(tilesetId, tileset);
        console.log(`Updated tileset ${tilesetId} field ${fieldName} to:`, value);
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        this.updateStatus(`${fieldName} ${tt('updated')}`);
    }

    /**
     * Show tileset editor within the database modal
     */
    showTilesetEditor() {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        const viewer = document.getElementById('database-viewer');
        const titleEl = document.getElementById('database-viewer-title');
        const listEl = document.getElementById('database-list');
        const detailEl = document.getElementById('database-detail');

        if (!viewer || !titleEl || !listEl || !detailEl) {
            console.error('Database viewer elements not found');
            return;
        }

        this.parentEditor?.prepareDatabaseSection?.('tilesets', tt('Tilesets'));

        // Get tilesets data
        let tilesets = this.databaseManager.getTilesets();
        let selectedTilesetId = null;
        const batchSize = 250;
        let filteredTilesets = tilesets;
        let renderedCount = 0;

        // Remove old search/button bar from previous tab
        const existingSearch = listEl.parentNode.querySelector('.database-search-container');
        if (existingSearch) existingSearch.remove();
        const existingButtons = listEl.parentNode.querySelector('.database-button-bar');
        if (existingButtons) existingButtons.remove();
        const existingMaxBtn = listEl.parentNode.querySelector('.database-change-max-btn');
        if (existingMaxBtn) existingMaxBtn.remove();
        const existingPager = listEl.parentNode.querySelector('.database-list-pager');
        if (existingPager) existingPager.remove();

        // Add tileset search bar
        const searchContainer = document.createElement('div');
        searchContainer.className = 'database-search-container';
        searchContainer.style.cssText = 'padding: 8px; background-color: var(--color-bg-menubar); border-bottom: 1px solid var(--color-border); flex-shrink: 0;';

        const searchInput = document.createElement('input');
        searchInput.type = 'text';
        searchInput.placeholder = tt('Search tilesets...');
        searchInput.style.cssText = 'width: 100%; padding: 4px 8px; background-color: var(--color-bg-surface); color: var(--color-text); border: 1px solid var(--color-border); border-radius: 3px; font-size: 12px; box-sizing: border-box;';
        searchContainer.appendChild(searchInput);
        listEl.parentNode.insertBefore(searchContainer, listEl);

        // Keep one continuous list and append more rows near the bottom.
        const populateTilesetList = (filter, append = false) => {
            if (!append) {
                listEl.innerHTML = '';
                renderedCount = 0;
                const filterLower = (filter || '').toLowerCase();
                filteredTilesets = filterLower ? tilesets.filter(tileset =>
                    (tileset.name || '').toLowerCase().includes(filterLower) ||
                    (tileset.id && String(tileset.id).includes(filterLower))
                ) : tilesets;
            }
            const end = Math.min(renderedCount + batchSize, filteredTilesets.length);

            filteredTilesets.slice(renderedCount, end).forEach((tileset) => {
                const item = document.createElement('div');
                item.className = 'database-list-item';
                item.dataset.tilesetId = tileset.id;

                const nameSpan = document.createElement('span');
                nameSpan.textContent = tileset.name || tt('Unnamed');

                const idSpan = document.createElement('span');
                idSpan.className = 'database-list-id';
                idSpan.textContent = `#${tileset.id || '?'}`;

                item.appendChild(nameSpan);
                item.appendChild(idSpan);

                item.addEventListener('click', () => {
                    document.querySelectorAll('.database-list-item').forEach(i => i.classList.remove('selected'));
                    item.classList.add('selected');
                    selectedTilesetId = tileset.id;
                    this.showTilesetEditorDetail(detailEl, tileset);
                });

                listEl.appendChild(item);
            });
            renderedCount = end;
        };

        listEl.onscroll = () => {
            const nearBottom = listEl.scrollTop + listEl.clientHeight >= listEl.scrollHeight - 160;
            if (nearBottom && renderedCount < filteredTilesets.length) {
                populateTilesetList(searchInput.value, true);
            }
        };

        const getSelectedTilesetId = () => {
            if (selectedTilesetId !== null) return selectedTilesetId;
            const selected = listEl.querySelector('.database-list-item.selected');
            return selected ? parseInt(selected.dataset.tilesetId, 10) : null;
        };

        const selectTilesetListItem = (tilesetId) => {
            const item = listEl.querySelector(`.database-list-item[data-tileset-id="${tilesetId}"]`);
            if (!item) return;
            document.querySelectorAll('.database-list-item').forEach(i => i.classList.remove('selected'));
            item.classList.add('selected');
        };

        this._refreshTilesetDatabaseList = (tilesetId = selectedTilesetId) => {
            tilesets = this.databaseManager.getTilesets();
            populateTilesetList(searchInput.value);
            selectedTilesetId = tilesetId;
            if (tilesetId !== null && tilesetId !== undefined) {
                selectTilesetListItem(tilesetId);
            }
        };

        const copySelectedTileset = () => {
            const tilesetId = getSelectedTilesetId();
            const tileset = this.databaseManager.data.tilesets?.[tilesetId];
            if (!tileset) {
                alert(tt('Select a tileset to copy.'));
                return;
            }

            const copied = JSON.parse(JSON.stringify(tileset));
            delete copied.id;
            this.tilesetClipboard = copied;
            if (this.parentEditor?.writeDatabaseEntryClipboard) {
                this.parentEditor.writeDatabaseEntryClipboard('tilesets', copied);
            } else if (typeof ReactorClipboard !== 'undefined') {
                ReactorClipboard.write('databaseEntry', { databaseType: 'tilesets', entry: copied });
            }
            this.updateStatus(tt('Tileset copied to clipboard'));
        };

        const pasteSelectedTileset = async () => {
            const tilesetId = getSelectedTilesetId();
            if (!tilesetId) {
                alert(tt('Select a tileset slot to paste into.'));
                return;
            }
            let clipboard = null;
            if (this.parentEditor?.readDatabaseEntryClipboard) {
                clipboard = await this.parentEditor.readDatabaseEntryClipboard('tilesets');
            } else if (typeof ReactorClipboard !== 'undefined') {
                const clipboardData = await ReactorClipboard.read('databaseEntry');
                if (clipboardData?.payload?.databaseType === 'tilesets') {
                    clipboard = { entry: clipboardData.payload.entry };
                }
            } else if (this.tilesetClipboard) {
                clipboard = { entry: this.tilesetClipboard };
            }
            if (!clipboard?.entry) {
                alert(tt('No tileset in clipboard to paste.'));
                return;
            }

            const pasted = JSON.parse(JSON.stringify(clipboard.entry));
            delete pasted.id;
            this.tilesetClipboard = JSON.parse(JSON.stringify(pasted));
            pasted.id = tilesetId;
            this.databaseManager.data.tilesets[tilesetId] = pasted;
            tilesets = this.databaseManager.getTilesets();
            populateTilesetList(searchInput.value);
            selectedTilesetId = tilesetId;
            selectTilesetListItem(tilesetId);
            this.showTilesetEditorDetail(detailEl, pasted);
            this.updateStatus(tt('Tileset pasted'));
        };

        searchInput.addEventListener('input', (e) => {
            populateTilesetList(e.target.value);
            listEl.scrollTop = 0;
        });

        this.cleanupListKeyHandler();
        this._tilesetListKeyHandler = (e) => {
            if (!viewer.classList.contains('active')) return;
            const activeNav = document.querySelector('.database-nav-item.active');
            if (!activeNav || activeNav.dataset.type !== 'tilesets') return;

            const tag = document.activeElement?.tagName;
            if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || document.activeElement?.isContentEditable) return;
            if (!e.ctrlKey && !e.metaKey) return;

            if (e.key === 'c') {
                e.preventDefault();
                copySelectedTileset();
            } else if (e.key === 'v') {
                e.preventDefault();
                pasteSelectedTileset();
            }
        };
        document.addEventListener('keydown', this._tilesetListKeyHandler);

        const changeMaxBtn = document.createElement('button');
        changeMaxBtn.className = 'database-change-max-btn';
        changeMaxBtn.textContent = tt('Change Maximum');
        changeMaxBtn.title = `${tt('Max:')} ${this.databaseManager.getMaximumEntries('tilesets')}`;
        changeMaxBtn.style.cssText = 'width: 100%; padding: 6px 8px; background-color: var(--color-bg-panel); color: var(--color-text); border: 1px solid var(--color-border-input); border-top: none; cursor: pointer; font-size: 11px; transition: background-color 0.2s; flex-shrink: 0;';
        changeMaxBtn.onmouseenter = () => { changeMaxBtn.style.backgroundColor = 'var(--color-accent-tint-25)'; };
        changeMaxBtn.onmouseleave = () => { changeMaxBtn.style.backgroundColor = 'var(--color-bg-panel)'; };
        changeMaxBtn.onclick = () => {
            const currentMax = this.databaseManager.getMaxEntries('tilesets');
            const template = this.parentEditor?.getDefaultTemplates?.().tilesets;
            if (!template || !this.parentEditor?.showChangeMaximumModal) return;

            this.parentEditor.showChangeMaximumModal(tt('Tilesets'), 'tilesets', currentMax, (newMax) => {
                this.databaseManager.changeMaximum('tilesets', newMax, template);
                tilesets = this.databaseManager.getTilesets();
                populateTilesetList(searchInput.value);
                detailEl.innerHTML = `<p style="color: var(--color-text-muted); text-align: center; margin-top: 100px;">${tt('Select a tileset from the list')}</p>`;
                this.updateStatus(`${tt('Tilesets maximum changed to')} ${newMax}`);
            });
        };
        listEl.parentNode.appendChild(changeMaxBtn);

        populateTilesetList();

        // Show initial message
        detailEl.innerHTML = `<p style="color: var(--color-text-muted); text-align: center; margin-top: 100px;">${tt('Select a tileset from the list')}</p>`;

        // Show viewer
        viewer.classList.add('active');

        if (this.parentEditor?.setupDatabaseControls) {
            this.parentEditor.takeDatabaseSnapshot?.();
            this.parentEditor.setupDatabaseControls();
        } else {
            const closeBtn = document.getElementById('database-close-btn');
            if (!closeBtn) return;
            closeBtn.onclick = () => {
                // Also close tileset editor if it's open
                const tilesetEditorContainer = document.getElementById('tileset-editor-main-container');
                if (tilesetEditorContainer && tilesetEditorContainer.style.display !== 'none') {
                    tilesetEditorContainer.style.display = 'none';
                }
                this.cleanupListKeyHandler();
                viewer.classList.remove('active');
            };
        }
    }

    /**
     * Show tileset editor detail in the database detail panel
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
