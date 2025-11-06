// RPG Reactor - Database Tileset Editor
// Provides an interface for creating and editing tilesets
// Unified version combining standalone and database integration functionality

class DatabaseTilesetEditor {
    constructor(app, projectPath, databaseManager, projectManager, commonUI, parentEditor) {
        // Support both old signature (app, projectPath, databaseManager)
        // and new signature (databaseManager, projectManager, commonUI, parentEditor)

        // Detect if called with old signature (first arg is app object)
        if (app && typeof app === 'object' && projectPath && typeof projectPath === 'string') {
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
        this.currentTileset = null;
        this.tilesetList = [];
        this.selectedImageIndex = null;
        this.currentEditMode = null; // 'passage-o', 'passage-x', 'passage-4dir', 'ladder', 'bush', 'counter', 'damage', 'terrain'
        this.selectedDirection = null; // For 4-dir passage: 'down', 'left', 'right', 'up'
        this.selectedTerrain = 0; // For terrain tag: 0-7
        this.currentTab = 'A'; // Current layer tab: 'A', 'B', 'C', 'D', 'E'
        this.tileSize = 48;
        this.selectedTile = null; // Currently selected tile { x, y } for highlighting

        // Tileset editor reference (for database wrapper functionality)
        this.tilesetEditor = null;

        // Initialize Node.js modules if running in NW.js
        if (typeof nw !== 'undefined') {
            this.fs = require('fs');
            this.path = require('path');
        }
    }

    // Initialize the tileset editor UI
    initializeUI(container) {
        container.innerHTML = `
            <div id="tileset-editor-container" style="display: flex; height: 100%; overflow: hidden;">
                <!-- Tileset List Sidebar -->
                <div id="tileset-list-panel" style="width: 250px; background-color: #252526; border-right: 1px solid #3e3e42; overflow-y: auto;">
                    <div style="padding: 12px; border-bottom: 1px solid #3e3e42; display: flex; justify-content: space-between; align-items: center;">
                        <span style="font-weight: 600; font-size: 13px;">Tilesets</span>
                        <button id="add-tileset-btn" class="tool-button" style="padding: 4px 8px; font-size: 11px;">New</button>
                    </div>
                    <div id="tileset-list" style="padding: 8px;">
                        <!-- Tileset list will be populated here -->
                    </div>
                </div>

                <!-- Main Editor Area (Middle Column - Fixed Width) -->
                <div id="tileset-editor-main" style="width: 350px; display: flex; flex-direction: column; overflow: hidden; flex-shrink: 0;">
                    <!-- Editor Toolbar -->
                    <div id="tileset-toolbar" style="padding: 12px; border-bottom: 1px solid #3e3e42; background-color: #2d2d30;">
                        <div style="display: flex; gap: 8px; align-items: center;">
                            <button id="close-tileset-editor-btn" class="tool-button">← Back to Database</button>
                            <label style="font-size: 12px; color: #999;">Name:</label>
                            <input type="text" id="tileset-name-input" style="flex: 1; max-width: 300px; padding: 4px 8px; background-color: #3c3c3c; border: 1px solid #555; color: #ccc; border-radius: 3px; font-size: 12px;" placeholder="Tileset name" />
                            <button id="save-tileset-btn" class="tool-button" style="margin-left: auto;">Save</button>
                            <button id="delete-tileset-btn" class="tool-button" style="background-color: #5a2d2d;">Delete</button>
                        </div>
                    </div>

                    <!-- Editor Content -->
                    <div id="tileset-editor-content" style="flex: 1; overflow-y: auto; padding: 16px;">
                        <div style="max-width: 100%;">
                            <h3 style="margin-bottom: 12px; font-size: 13px; font-weight: 600; color: #ccc;">Tileset Images</h3>

                            <!-- Autotile Images (A1-A5) -->
                            <div style="margin-bottom: 16px;">
                                <h4 style="margin-bottom: 8px; font-size: 11px; color: #999; text-transform: uppercase;">Autotiles</h4>
                                <div style="display: flex; flex-direction: column; gap: 8px;">
                                    ${this.createTilesetImageSlot('A1', 0, 'Animated Water')}
                                    ${this.createTilesetImageSlot('A2', 1, 'Ground Autotiles')}
                                    ${this.createTilesetImageSlot('A3', 2, 'Building Autotiles')}
                                    ${this.createTilesetImageSlot('A4', 3, 'Wall Autotiles')}
                                    ${this.createTilesetImageSlot('A5', 4, 'Normal Tiles')}
                                </div>
                            </div>

                            <!-- Normal Tileset Images (B-E) -->
                            <div style="margin-bottom: 16px;">
                                <h4 style="margin-bottom: 8px; font-size: 11px; color: #999; text-transform: uppercase;">Normal Tilesets</h4>
                                <div style="display: flex; flex-direction: column; gap: 8px;">
                                    ${this.createTilesetImageSlot('B', 5, 'Tileset B')}
                                    ${this.createTilesetImageSlot('C', 6, 'Tileset C')}
                                    ${this.createTilesetImageSlot('D', 7, 'Tileset D')}
                                    ${this.createTilesetImageSlot('E', 8, 'Tileset E')}
                                </div>
                            </div>

                            <!-- Mode Selection -->
                            <div style="margin-bottom: 16px;">
                                <h4 style="margin-bottom: 8px; font-size: 11px; color: #999; text-transform: uppercase;">Passage Settings</h4>
                                <div style="display: flex; flex-direction: column; gap: 6px; margin-bottom: 8px;">
                                    <button class="tool-button passage-mode-btn" id="mode-o" title="Passable" style="width: 100%;">O (Pass)</button>
                                    <button class="tool-button passage-mode-btn" id="mode-x" title="Impassable" style="width: 100%;">X (Block)</button>
                                    <button class="tool-button passage-mode-btn" id="mode-star" title="Above Character" style="width: 100%;">★ (Above)</button>
                                </div>
                                <p style="font-size: 10px; color: #999;">Click an image above, then click tiles to edit</p>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Tileset Viewer Panel (Right Column - Takes remaining space) -->
                <div id="tileset-viewer-panel" style="flex: 1; background-color: #1e1e1e; border-left: 1px solid #3e3e42; overflow: auto; display: flex; flex-direction: column;">
                    <div style="padding: 12px; border-bottom: 1px solid #3e3e42; background-color: #2d2d30;">
                        <h4 style="font-size: 12px; font-weight: 600; color: #ccc;">Tile Flags Editor</h4>
                        <p style="font-size: 11px; color: #999; margin-top: 4px;">Click a tileset image to view and edit flags</p>
                    </div>
                    <div id="tileset-canvas-container" style="flex: 1; overflow: auto; padding: 16px;">
                        <canvas id="tileset-canvas" style="display: none; image-rendering: pixelated; cursor: crosshair;"></canvas>
                        <p id="tileset-no-selection" style="color: #666; text-align: center; margin-top: 100px;">Select a tileset image to edit passage settings</p>
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
        return `
            <div class="tileset-image-slot" data-index="${index}" style="background-color: #2d2d30; border: 1px solid #555; border-radius: 4px; padding: 8px; cursor: pointer; transition: all 0.2s; display: flex; align-items: center; gap: 8px;">
                <div class="image-preview" data-index="${index}" style="width: 60px; height: 60px; flex-shrink: 0; background-color: #1e1e1e; border: 1px solid #444; border-radius: 3px; display: flex; align-items: center; justify-content: center; background-size: contain; background-repeat: no-repeat; background-position: center;">
                    <span style="font-size: 9px; color: #666;">?</span>
                </div>
                <div style="flex: 1; min-width: 0;">
                    <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 4px;">
                        <span style="font-weight: 600; font-size: 12px;">${label}</span>
                        <button class="clear-image-btn" data-index="${index}" style="background: #5a2d2d; border: none; color: #ccc; padding: 2px 6px; border-radius: 3px; font-size: 9px; cursor: pointer; display: none;">Clear</button>
                    </div>
                    <div style="font-size: 10px; color: #888;">${description}</div>
                    <div class="image-filename" data-index="${index}" style="font-size: 9px; color: #aaa; margin-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; display: none;"></div>
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
            const tilesetsPath = this.path.join(this.projectPath, 'data', 'Tilesets.json');

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
        const listContainer = document.getElementById('tileset-list');
        listContainer.innerHTML = '';

        for (let i = 1; i < this.tilesetList.length; i++) {
            const tileset = this.tilesetList[i];
            if (!tileset) continue;

            const item = document.createElement('div');
            item.className = 'tree-item';
            item.textContent = `${String(i).padStart(3, '0')}: ${tileset.name || 'Unnamed'}`;
            item.dataset.id = i;
            item.addEventListener('click', () => this.selectTileset(i));
            listContainer.appendChild(item);
        }
    }

    selectTileset(id) {
        this.currentTileset = this.tilesetList[id];
        if (!this.currentTileset) return;

        // Update UI
        document.getElementById('tileset-name-input').value = this.currentTileset.name || '';

        // Highlight selected tileset in list
        document.querySelectorAll('#tileset-list .tree-item').forEach(item => {
            item.style.backgroundColor = item.dataset.id == id ? '#37373d' : '';
        });

        // Load tileset images into preview slots
        this.loadTilesetPreviews();
    }

    loadTilesetPreviews() {
        if (!this.currentTileset) return;

        const tilesetNames = this.currentTileset.tilesetNames;

        for (let i = 0; i < 9; i++) {
            const name = tilesetNames[i];
            const preview = document.querySelector(`.image-preview[data-index="${i}"]`);
            const filename = document.querySelector(`.image-filename[data-index="${i}"]`);
            const clearBtn = document.querySelector(`.clear-image-btn[data-index="${i}"]`);

            if (name && name !== '') {
                // Try to load and display the image
                const imgPath = this.path.join(this.projectPath, 'img', 'tilesets', name + '.png');
                if (this.fs.existsSync(imgPath)) {
                    const fileUrl = 'file://' + imgPath.replace(/\\/g, '/');
                    preview.style.backgroundImage = `url('${fileUrl}')`;
                    preview.innerHTML = '';
                    filename.textContent = name + '.png';
                    filename.style.display = 'block';
                    clearBtn.style.display = 'inline-block';
                } else {
                    preview.style.backgroundImage = 'none';
                    preview.innerHTML = '<span style="font-size: 11px; color: #888;">File not found</span>';
                    filename.textContent = name + '.png (missing)';
                    filename.style.display = 'block';
                    clearBtn.style.display = 'inline-block';
                }
            } else {
                preview.style.backgroundImage = 'none';
                preview.innerHTML = '<span style="font-size: 11px; color: #666;">Click to select</span>';
                filename.style.display = 'none';
                clearBtn.style.display = 'none';
            }
        }
    }

    selectTilesetImage(index) {
        if (!this.currentTileset) {
            alert('Please select or create a tileset first');
            return;
        }

        const tilesetsDir = this.path.join(this.projectPath, 'img', 'tilesets');

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
                    alert('Error copying file: ' + error.message);
                }
            }
        };
        input.click();
    }

    clearTilesetImage(index) {
        if (!this.currentTileset) return;

        if (confirm('Remove this tileset image?')) {
            this.currentTileset.tilesetNames[index] = '';
            this.loadTilesetPreviews();
        }
    }

    createNewTileset() {
        const name = prompt('Enter tileset name:', 'New Tileset');
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
        if (!this.currentTileset) {
            alert('No tileset selected');
            return;
        }

        // Update name from input
        this.currentTileset.name = document.getElementById('tileset-name-input').value;

        // Save to file
        this.saveTilesetsFile();

        // Refresh list
        this.renderTilesetList();

        console.log('Tileset saved:', this.currentTileset.name);
    }

    deleteTileset() {
        if (!this.currentTileset) {
            alert('No tileset selected');
            return;
        }

        if (confirm(`Delete tileset "${this.currentTileset.name}"?`)) {
            const id = this.currentTileset.id;
            this.tilesetList[id] = null;
            this.currentTileset = null;

            this.saveTilesetsFile();
            this.renderTilesetList();

            // Clear editor
            document.getElementById('tileset-name-input').value = '';
            document.querySelectorAll('.image-preview').forEach(preview => {
                preview.style.backgroundImage = 'none';
                preview.innerHTML = '<span style="font-size: 11px; color: #666;">Click to select</span>';
            });
        }
    }

    saveTilesetsFile() {
        if (!this.fs) return;

        try {
            const tilesetsPath = this.path.join(this.projectPath, 'data', 'Tilesets.json');
            this.fs.writeFileSync(tilesetsPath, JSON.stringify(this.tilesetList, null, 2));
            console.log('Tilesets.json saved');
        } catch (error) {
            console.error('Error saving Tilesets.json:', error);
            alert('Error saving tilesets: ' + error.message);
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
        const imgPath = 'file://' + this.path.join(this.projectPath, 'img', 'tilesets', imageFileName);

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
            noSelection.style.display = 'block';
            canvas.style.display = 'none';
            alert('Error loading tileset image: ' + fileName);
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

                // Draw passage overlay
                const passability = flag & 0x0F;
                const hasStar = (flag & 0x10) !== 0;

                // Show passability state
                if (passability === 0x0F) {
                    // Fully impassable - show red X
                    ctx.fillStyle = 'rgba(255, 0, 0, 0.3)';
                    ctx.fillRect(px, py, this.tileSize, this.tileSize);
                    ctx.fillStyle = '#fff';
                    ctx.font = 'bold 24px Arial';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText('X', px + this.tileSize/2, py + this.tileSize/2);
                } else if (passability === 0) {
                    // Fully passable - show green O
                    ctx.fillStyle = 'rgba(0, 255, 0, 0.2)';
                    ctx.fillRect(px, py, this.tileSize, this.tileSize);
                    ctx.fillStyle = '#0f0';
                    ctx.font = 'bold 24px Arial';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText('O', px + this.tileSize/2, py + this.tileSize/2);
                } else {
                    // Partial blocking - show orange with number
                    ctx.fillStyle = 'rgba(255, 165, 0, 0.3)';
                    ctx.fillRect(px, py, this.tileSize, this.tileSize);
                    ctx.fillStyle = '#fff';
                    ctx.font = 'bold 16px Arial';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText(passability.toString(), px + this.tileSize/2, py + this.tileSize/2);
                }

                // Draw star overlay (above character) - separate from passability
                if (hasStar) {
                    ctx.fillStyle = '#ff0';
                    ctx.font = 'bold 20px Arial';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'top';
                    ctx.fillText('★', px + this.tileSize/2, py + 2);
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
        this.currentTileset = tileset;

        // Debug: Log initialization details
        console.log('=== Initializing Compact Tileset UI ===');
        console.log('Tileset:', tileset.name, '(ID:', tileset.id + ')');
        console.log('Project path:', this.projectPath);
        console.log('fs available:', !!this.fs);
        console.log('path available:', !!this.path);

        container.innerHTML = `
            <div style="display: flex; flex-direction: column; height: 100%; overflow: hidden;">
                <!-- Header with tileset name and save button -->
                <div style="padding: 8px 12px; border-bottom: 1px solid #3e3e42; background-color: #2d2d30; flex-shrink: 0;">
                    <div style="display: flex; gap: 8px; align-items: center;">
                        <label style="font-size: 11px; color: #999;">Name:</label>
                        <input type="text" id="compact-tileset-name-input" value="${tileset.name || ''}"
                               style="flex: 1; max-width: 250px; padding: 4px 8px; background-color: #3c3c3c; border: 1px solid #555; color: #ccc; border-radius: 3px; font-size: 11px;"
                               placeholder="Tileset name" />
                        <button id="compact-save-tileset-btn" class="tool-button" style="font-size: 11px; padding: 4px 12px;">Save</button>
                    </div>
                </div>

                <!-- Main two-column layout -->
                <div style="display: flex; flex: 1; overflow: hidden;">
                    <!-- Left sidebar: Layer list (top) and flag editor (bottom) -->
                    <div style="width: 260px; border-right: 1px solid #3e3e42; display: flex; flex-direction: column; background-color: #252526;">
                        <!-- Top: Layer list -->
                        <div style="flex: 1; display: flex; flex-direction: column; border-bottom: 1px solid #3e3e42; overflow: hidden;">
                            <div style="padding: 8px; border-bottom: 1px solid #3e3e42; background-color: #2d2d30;">
                                <h3 style="margin: 0; font-size: 11px; font-weight: 600; color: #ccc;">Tileset Layers</h3>
                            </div>
                            <div style="flex: 1; overflow-y: auto; padding: 8px;">
                                <div style="margin-bottom: 12px;">
                                    <h4 style="margin: 0 0 6px 0; font-size: 9px; color: #999; text-transform: uppercase; letter-spacing: 0.5px;">Autotiles (A)</h4>
                                    ${this.createCompactLayerItem('A1', 0)}
                                    ${this.createCompactLayerItem('A2', 1)}
                                    ${this.createCompactLayerItem('A3', 2)}
                                    ${this.createCompactLayerItem('A4', 3)}
                                    ${this.createCompactLayerItem('A5', 4)}
                                </div>
                                <div>
                                    <h4 style="margin: 0 0 6px 0; font-size: 9px; color: #999; text-transform: uppercase; letter-spacing: 0.5px;">Normal (B-E)</h4>
                                    ${this.createCompactLayerItem('B', 5)}
                                    ${this.createCompactLayerItem('C', 6)}
                                    ${this.createCompactLayerItem('D', 7)}
                                    ${this.createCompactLayerItem('E', 8)}
                                </div>
                            </div>
                        </div>

                        <!-- Bottom: Flag editor -->
                        <div style="flex: 1; display: flex; flex-direction: column; overflow: hidden;">
                            <div style="padding: 8px; border-bottom: 1px solid #3e3e42; background-color: #2d2d30;">
                                <h4 style="margin: 0; font-size: 11px; font-weight: 600; color: #ccc;">Flags</h4>
                            </div>
                            <div style="flex: 1; overflow-y: auto; padding: 8px;">
                                <!-- Flag buttons as single column list -->
                                <button class="compact-flag-btn" id="flag-passage-o" data-mode="passage-o"
                                        style="width: 100%; margin-bottom: 4px; font-size: 10px; padding: 6px; background-color: #2d2d30; border: 1px solid #555; color: #ccc; border-radius: 2px; cursor: pointer; text-align: left;">
                                    O - Passable
                                </button>
                                <button class="compact-flag-btn" id="flag-passage-x" data-mode="passage-x"
                                        style="width: 100%; margin-bottom: 4px; font-size: 10px; padding: 6px; background-color: #2d2d30; border: 1px solid #555; color: #ccc; border-radius: 2px; cursor: pointer; text-align: left;">
                                    X - Impassable
                                </button>
                                <button class="compact-flag-btn" id="flag-4dir" data-mode="4dir"
                                        style="width: 100%; margin-bottom: 4px; font-size: 10px; padding: 6px; background-color: #2d2d30; border: 1px solid #555; color: #ccc; border-radius: 2px; cursor: pointer; text-align: left;">
                                    ↕↔ - Passage (4 Dir)
                                </button>
                                <button class="compact-flag-btn" id="flag-above" data-mode="above"
                                        style="width: 100%; margin-bottom: 4px; font-size: 10px; padding: 6px; background-color: #2d2d30; border: 1px solid #555; color: #ccc; border-radius: 2px; cursor: pointer; text-align: left;">
                                    ★ - Above Characters
                                </button>
                                <button class="compact-flag-btn" id="flag-ladder" data-mode="ladder"
                                        style="width: 100%; margin-bottom: 4px; font-size: 10px; padding: 6px; background-color: #2d2d30; border: 1px solid #555; color: #ccc; border-radius: 2px; cursor: pointer; text-align: left;">
                                    Ladder
                                </button>
                                <button class="compact-flag-btn" id="flag-bush" data-mode="bush"
                                        style="width: 100%; margin-bottom: 4px; font-size: 10px; padding: 6px; background-color: #2d2d30; border: 1px solid #555; color: #ccc; border-radius: 2px; cursor: pointer; text-align: left;">
                                    Bush
                                </button>
                                <button class="compact-flag-btn" id="flag-counter" data-mode="counter"
                                        style="width: 100%; margin-bottom: 4px; font-size: 10px; padding: 6px; background-color: #2d2d30; border: 1px solid #555; color: #ccc; border-radius: 2px; cursor: pointer; text-align: left;">
                                    Counter
                                </button>
                                <button class="compact-flag-btn" id="flag-damage" data-mode="damage"
                                        style="width: 100%; margin-bottom: 4px; font-size: 10px; padding: 6px; background-color: #2d2d30; border: 1px solid #555; color: #ccc; border-radius: 2px; cursor: pointer; text-align: left;">
                                    ⚠ - Damage Floor
                                </button>

                                <!-- Terrain tags as horizontal buttons -->
                                <div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid #3e3e42;">
                                    <div style="font-size: 9px; color: #999; margin-bottom: 4px;">Terrain Tag</div>
                                    <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 3px;">
                                        ${[0, 1, 2, 3, 4, 5, 6, 7].map(n => `
                                            <button class="compact-flag-btn" id="flag-terrain-${n}" data-mode="terrain" data-terrain="${n}"
                                                    style="font-size: 9px; padding: 6px; background-color: #2d2d30; border: 1px solid #555; color: #ccc; border-radius: 2px; cursor: pointer;">
                                                ${n}
                                            </button>
                                        `).join('')}
                                    </div>
                                </div>

                                <p style="font-size: 8px; color: #666; margin: 8px 0 0 0; line-height: 1.3;">
                                    Select flag, click layer, then click tiles
                                </p>
                            </div>
                        </div>
                    </div>

                    <!-- Right: Tabs + Preview -->
                    <div style="flex: 1; display: flex; flex-direction: column; overflow: hidden; background-color: #1a1a1a;">
                        <!-- Tab buttons -->
                        <div style="padding: 8px; border-bottom: 1px solid #3e3e42; background-color: #2d2d30; display: flex; gap: 6px;">
                            <button class="compact-layer-tab" data-tab="A" style="flex: 1; padding: 8px; font-size: 11px; background-color: #37373d; border: 1px solid #4fc3f7; color: #fff; border-radius: 3px; cursor: pointer; font-weight: 600;">A (Autotiles)</button>
                            <button class="compact-layer-tab" data-tab="B" style="flex: 1; padding: 8px; font-size: 11px; background-color: #2d2d30; border: 1px solid #555; color: #ccc; border-radius: 3px; cursor: pointer;">B</button>
                            <button class="compact-layer-tab" data-tab="C" style="flex: 1; padding: 8px; font-size: 11px; background-color: #2d2d30; border: 1px solid #555; color: #ccc; border-radius: 3px; cursor: pointer;">C</button>
                            <button class="compact-layer-tab" data-tab="D" style="flex: 1; padding: 8px; font-size: 11px; background-color: #2d2d30; border: 1px solid #555; color: #ccc; border-radius: 3px; cursor: pointer;">D</button>
                            <button class="compact-layer-tab" data-tab="E" style="flex: 1; padding: 8px; font-size: 11px; background-color: #2d2d30; border: 1px solid #555; color: #ccc; border-radius: 3px; cursor: pointer;">E</button>
                        </div>

                        <!-- Preview area with canvas -->
                        <div style="flex: 1; overflow: auto; padding: 16px; display: flex; align-items: flex-start; justify-content: center;">
                            <div id="compact-tileset-canvas-container" style="max-width: 100%;">
                                <p style="color: #888; font-size: 10px;">Click a layer on the left to view</p>
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

            // Load initial tab (A by default)
            this.switchTab('A');
        }, 0);
    }

    // Create a compact layer item for the left sidebar
    createCompactLayerItem(label, index) {
        const fileName = this.currentTileset.tilesetNames[index] || '';
        return `
            <div class="compact-layer-item" data-index="${index}"
                 style="margin-bottom: 6px; padding: 6px; background-color: #2d2d30; border: 1px solid #3e3e42; border-radius: 3px; cursor: pointer; transition: all 0.15s;">
                <div style="display: flex; align-items: center; gap: 6px;">
                    <div class="layer-thumb-mini" style="width: 32px; height: 32px; background: #1e1e1e; border: 1px solid #555; display: flex; align-items: center; justify-content: center; font-size: 8px; color: #666; overflow: hidden; flex-shrink: 0;">
                        ${fileName ? '' : '-'}
                    </div>
                    <div style="flex: 1; min-width: 0;">
                        <div style="font-weight: 600; color: #4fc3f7; font-size: 10px;">${label}</div>
                        <div style="font-size: 8px; color: ${fileName ? '#999' : '#666'}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${fileName || '(None)'}</div>
                    </div>
                </div>
            </div>
        `;
    }

    // Load thumbnails for layer items in left sidebar
    loadLayerListThumbnails() {
        document.querySelectorAll('.compact-layer-item').forEach(item => {
            const index = parseInt(item.dataset.index);
            const fileName = this.currentTileset.tilesetNames[index];

            if (fileName && this.path && this.projectPath) {
                const fileNameWithExt = fileName.endsWith('.png') ? fileName : fileName + '.png';
                const imagePath = this.path.join(this.projectPath, 'img', 'tilesets', fileNameWithExt);

                if (this.fs && this.fs.existsSync(imagePath)) {
                    const thumbContainer = item.querySelector('.layer-thumb-mini');
                    const img = document.createElement('img');
                    img.src = 'file://' + imagePath;
                    img.style.cssText = 'width: 100%; height: 100%; object-fit: cover; image-rendering: pixelated;';
                    thumbContainer.innerHTML = '';
                    thumbContainer.appendChild(img);
                }
            }

            // Set up click handler
            item.addEventListener('click', () => {
                const fileName = this.currentTileset.tilesetNames[index];

                // Highlight selected
                document.querySelectorAll('.compact-layer-item').forEach(i => {
                    i.style.backgroundColor = '#2d2d30';
                    i.style.borderColor = '#3e3e42';
                });
                item.style.backgroundColor = '#37373d';
                item.style.borderColor = '#4fc3f7';

                this.selectedImageIndex = index;

                if (fileName) {
                    this.renderCompactTilesetCanvas(fileName, index);
                } else {
                    const container = document.getElementById('compact-tileset-canvas-container');
                    container.innerHTML = '<p style="color: #888; font-size: 10px; text-align: center;">No image assigned to this layer</p>';
                }
            });
        });
    }

    // Switch to a different layer tab (shows specific layers in preview)
    switchTab(tab) {
        this.currentTab = tab;
        console.log('Switching to tab:', tab);

        // Update tab button styles
        document.querySelectorAll('.compact-layer-tab').forEach(btn => {
            if (btn.dataset.tab === tab) {
                btn.style.backgroundColor = '#37373d';
                btn.style.borderColor = '#4fc3f7';
                btn.style.fontWeight = '600';
            } else {
                btn.style.backgroundColor = '#2d2d30';
                btn.style.borderColor = '#555';
                btn.style.fontWeight = 'normal';
            }
        });

        // Render the layers for this tab in the preview canvas
        this.renderTabPreview(tab);
    }

    // Render preview for a specific tab (shows all layers in that tab stacked)
    renderTabPreview(tab) {
        const container = document.getElementById('compact-tileset-canvas-container');
        const layerIndices = this.getLayerIndicesForTab(tab);

        container.innerHTML = '<p style="color: #888; font-size: 10px;">Loading layers...</p>';

        // Collect images for this tab
        const images = [];
        for (const index of layerIndices) {
            const fileName = this.currentTileset.tilesetNames[index];
            if (fileName && this.path && this.projectPath) {
                const fileNameWithExt = fileName.endsWith('.png') ? fileName : fileName + '.png';
                const imagePath = this.path.join(this.projectPath, 'img', 'tilesets', fileNameWithExt);
                if (this.fs && this.fs.existsSync(imagePath)) {
                    images.push({ index, fileName: fileNameWithExt, imagePath });
                }
            }
        }

        if (images.length === 0) {
            container.innerHTML = '<p style="color: #888; font-size: 10px; text-align: center;">No images assigned to this tab</p>';
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
                    canvas.style.border = '1px solid #555';
                    canvas.style.imageRendering = 'pixelated';
                    canvas.style.display = 'block';

                    // Draw left half on top
                    ctx.drawImage(img, 0, 0, halfWidth, img.height, 0, 0, halfWidth * scale, img.height * scale);
                    // Draw right half on bottom
                    ctx.drawImage(img, halfWidth, 0, halfWidth, img.height, 0, img.height * scale, halfWidth * scale, img.height * scale);
                    // Draw grid
                    this.drawTilesetGrid(ctx, halfWidth, img.height * 2, scale);
                } else {
                    // A1-A5 layers: Display as-is
                    const scale = 1;
                    canvas.width = img.width * scale;
                    canvas.height = img.height * scale;
                    canvas.style.border = '1px solid #555';
                    canvas.style.imageRendering = 'pixelated';
                    canvas.style.display = 'block';

                    ctx.drawImage(img, 0, 0, img.width, img.height, 0, 0, img.width * scale, img.height * scale);
                    // Draw grid
                    this.drawTilesetGrid(ctx, img.width, img.height, scale);
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

            img.src = 'file://' + imagePath;
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

    // Create a layer list item for the left sidebar
    createLayerListItem(label, index, description) {
        const fileName = this.currentTileset.tilesetNames[index] || '';
        const displayName = fileName || '';

        return `
            <div class="compact-tileset-image-slot" data-index="${index}" data-filename="${fileName}"
                 style="display: flex; align-items: center; gap: 8px; padding: 6px; margin-bottom: 4px; background-color: #2d2d30; border: 1px solid #3e3e42; border-radius: 3px; cursor: pointer; transition: all 0.15s;">
                <div class="layer-thumbnail-container" style="width: 60px; height: 60px; background: #1e1e1e; border: 1px solid #555; display: flex; align-items: center; justify-content: center; font-size: 9px; color: #666; overflow: hidden;">
                    ${fileName ? '' : '-'}
                </div>
                <div style="flex: 1; min-width: 0;">
                    <div style="font-weight: 600; color: #4fc3f7; font-size: 10px; margin-bottom: 2px;">${label}</div>
                    <div class="layer-filename" style="font-size: 8px; color: ${fileName ? '#ccc' : '#666'}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${displayName || 'No image assigned'}">
                        ${displayName || '(None)'}
                    </div>
                    <button class="change-image-btn" data-index="${index}" style="margin-top: 4px; padding: 2px 6px; font-size: 8px; background: #007acc; border: none; color: white; border-radius: 2px; cursor: pointer;">Change</button>
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
                const terrain = btn.dataset.terrain;

                console.log('Flag button clicked:', mode, terrain);

                // Remove active state from all flag buttons
                document.querySelectorAll('.compact-flag-btn').forEach(b => {
                    b.style.backgroundColor = '#2d2d30';
                    b.style.borderColor = '#555';
                });

                // Highlight selected button
                btn.style.backgroundColor = '#37373d';
                btn.style.borderColor = '#4fc3f7';

                // Set edit mode
                if (mode === 'terrain') {
                    this.currentEditMode = 'terrain';
                    this.selectedTerrain = parseInt(terrain);
                    console.log(`Edit mode: terrain tag ${terrain}`);
                } else {
                    this.currentEditMode = mode;
                    console.log(`Edit mode: ${mode}`);
                }
            });
        });
    }

    // Load thumbnails for all layer slots
    loadLayerThumbnails() {
        document.querySelectorAll('.compact-tileset-image-slot').forEach(slot => {
            const index = parseInt(slot.dataset.index);
            const fileName = slot.dataset.filename;

            if (fileName && this.path && this.projectPath) {
                const thumbnailContainer = slot.querySelector('.layer-thumbnail-container');
                // Add .png extension if not already present
                const fileNameWithExt = fileName.endsWith('.png') ? fileName : fileName + '.png';
                const imagePath = this.path.join(this.projectPath, 'img', 'tilesets', fileNameWithExt);

                console.log(`Loading thumbnail for layer ${index}: ${fileName}`);
                console.log(`  Project path: ${this.projectPath}`);
                console.log(`  Full image path: ${imagePath}`);
                console.log(`  File exists: ${this.fs && this.fs.existsSync(imagePath)}`);

                if (this.fs && this.fs.existsSync(imagePath)) {
                    const img = document.createElement('img');
                    img.src = 'file://' + imagePath;
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
            alert('File picker requires NW.js');
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
                    slot.querySelector('.layer-filename').style.color = '#ccc';

                    // Load the thumbnail
                    const thumbnailContainer = slot.querySelector('.layer-thumbnail-container');
                    const img = document.createElement('img');
                    img.src = 'file://' + file.path;
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
        const container = document.getElementById('compact-tileset-canvas-container');
        if (!container) return;

        container.innerHTML = '<p style="color: #888; font-size: 11px;">Loading tileset image...</p>';

        // Add .png extension if not already present
        const fileNameWithExt = fileName.endsWith('.png') ? fileName : fileName + '.png';
        const imagePath = this.path.join(this.projectPath, 'img', 'tilesets', fileNameWithExt);

        // Check if file exists
        if (!this.fs.existsSync(imagePath)) {
            container.innerHTML = `<p style="color: #f44; font-size: 11px;">Image file not found: ${fileName}</p>`;
            return;
        }

        const img = new Image();
        img.onload = () => {
            // Determine if this is a B-E layer (indices 5-8)
            const isBtoE = imageIndex >= 5 && imageIndex <= 8;

            let canvas, ctx;

            if (isBtoE) {
                // B-E layers: Split in half vertically and stack
                // Original: 768x768, becomes 384x1536 (left half on top, right half on bottom)
                // RPG Maker style: split the 768px wide image into two 384px columns stacked vertically
                const halfWidth = img.width / 2;
                const scale = 1;

                canvas = document.createElement('canvas');
                canvas.width = halfWidth * scale;
                canvas.height = img.height * 2 * scale; // Double height to stack both halves
                canvas.style.border = '1px solid #555';
                canvas.style.cursor = 'crosshair';
                canvas.style.imageRendering = 'pixelated';

                ctx = canvas.getContext('2d');
                ctx.imageSmoothingEnabled = false;

                // Draw left half on top
                ctx.drawImage(img, 0, 0, halfWidth, img.height, 0, 0, halfWidth * scale, img.height * scale);

                // Draw right half on bottom
                ctx.drawImage(img, halfWidth, 0, halfWidth, img.height, 0, img.height * scale, halfWidth * scale, img.height * scale);

                // Draw 48x48 grid over the tileset
                this.drawTilesetGrid(ctx, halfWidth, img.height * 2, scale);
            } else {
                // A1-A5 layers: Display as-is
                const scale = 1;

                canvas = document.createElement('canvas');
                canvas.width = img.width * scale;
                canvas.height = img.height * scale;
                canvas.style.border = '1px solid #555';
                canvas.style.cursor = 'crosshair';
                canvas.style.imageRendering = 'pixelated';

                ctx = canvas.getContext('2d');
                ctx.imageSmoothingEnabled = false;

                // Draw the tileset image
                ctx.drawImage(img, 0, 0, img.width, img.height, 0, 0, img.width * scale, img.height * scale);

                // Draw 48x48 grid over the tileset
                this.drawTilesetGrid(ctx, img.width, img.height, scale);
            }

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

            // Replace container content with canvas
            container.innerHTML = '';
            container.appendChild(canvas);
        };

        img.onerror = () => {
            container.innerHTML = `<p style="color: #f44; font-size: 11px;">Failed to load image: ${fileName}</p>`;
        };

        // Use file:// protocol for NW.js
        img.src = 'file://' + imagePath;
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
            case 0: // A1
                return 2048 + tileOffset;
            case 1: // A2
                return 2816 + tileOffset;
            case 2: // A3
                return 4352 + tileOffset;
            case 3: // A4
                return 5888 + tileOffset;
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
                // For B-E layers that are split, we need to remap coordinates
                let tileX = x;
                let tileY = y;

                if (isBtoE) {
                    // The canvas is split: left half on top, right half on bottom
                    // Original image: 768 wide (16 tiles), 768 tall (16 tiles)
                    // Split canvas: 384 wide (8 tiles), 1536 tall (32 tiles)
                    const halfHeight = tilesY / 2;

                    if (y >= halfHeight) {
                        // Bottom half: this was the right side of original image
                        tileX = x + tilesX; // Shift X to right half
                        tileY = y - halfHeight; // Reset Y to top
                    }
                    // Top half stays as-is (left side of original)
                }

                const tileIndex = this.getTileIndexForImage(imageIndex, tileX, tileY, isBtoE ? tilesX * 2 : tilesX);
                const flag = this.currentTileset.flags[tileIndex] || 0;

                // Drawing coordinates (use actual canvas position x, y)
                const drawX = x * this.tileSize;
                const drawY = y * this.tileSize;
                const centerX = drawX + this.tileSize / 2;
                const centerY = drawY + this.tileSize / 2;

                // Draw O for passable tiles (bits 0-4 all clear)
                const passageBits = flag & 0x1F;
                if (passageBits === 0) {
                    ctx.strokeStyle = 'rgba(100, 255, 100, 0.7)';
                    ctx.lineWidth = 2;
                    ctx.beginPath();
                    ctx.arc(centerX, centerY, this.tileSize / 3, 0, Math.PI * 2);
                    ctx.stroke();
                }

                // Draw X for impassable tiles (bit 4 set)
                if (flag & 0x10) {
                    ctx.strokeStyle = 'rgba(255, 0, 0, 0.8)';
                    ctx.lineWidth = 3;
                    ctx.beginPath();
                    ctx.moveTo(drawX + 6, drawY + 6);
                    ctx.lineTo(drawX + this.tileSize - 6, drawY + this.tileSize - 6);
                    ctx.moveTo(drawX + this.tileSize - 6, drawY + 6);
                    ctx.lineTo(drawX + 6, drawY + this.tileSize - 6);
                    ctx.stroke();
                }

                // Draw 4-dir arrows (bits 0-3)
                if (!(flag & 0x10)) { // Only show if not fully impassable
                    const margin = 8;
                    ctx.strokeStyle = 'rgba(255, 100, 100, 0.7)';
                    ctx.lineWidth = 2;

                    // Down blocked (bit 0)
                    if (flag & 0x01) {
                        ctx.beginPath();
                        ctx.moveTo(centerX - 6, drawY + this.tileSize - margin);
                        ctx.lineTo(centerX, drawY + this.tileSize - margin - 6);
                        ctx.lineTo(centerX + 6, drawY + this.tileSize - margin);
                        ctx.stroke();
                    }

                    // Left blocked (bit 1)
                    if (flag & 0x02) {
                        ctx.beginPath();
                        ctx.moveTo(drawX + margin, centerY - 6);
                        ctx.lineTo(drawX + margin + 6, centerY);
                        ctx.lineTo(drawX + margin, centerY + 6);
                        ctx.stroke();
                    }

                    // Right blocked (bit 2)
                    if (flag & 0x04) {
                        ctx.beginPath();
                        ctx.moveTo(drawX + this.tileSize - margin, centerY - 6);
                        ctx.lineTo(drawX + this.tileSize - margin - 6, centerY);
                        ctx.lineTo(drawX + this.tileSize - margin, centerY + 6);
                        ctx.stroke();
                    }

                    // Up blocked (bit 3)
                    if (flag & 0x08) {
                        ctx.beginPath();
                        ctx.moveTo(centerX - 6, drawY + margin);
                        ctx.lineTo(centerX, drawY + margin + 6);
                        ctx.lineTo(centerX + 6, drawY + margin);
                        ctx.stroke();
                    }
                }

                // Draw star for bush/above tiles (bit 6 set)
                if (flag & 0x40) {
                    ctx.fillStyle = 'rgba(255, 215, 0, 0.9)';
                    ctx.font = `${this.tileSize - 12}px Arial`;
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText('★', centerX, centerY);
                }

                // Draw ladder icon (bit 5 set)
                if (flag & 0x20) {
                    ctx.strokeStyle = 'rgba(150, 200, 255, 0.8)';
                    ctx.lineWidth = 2;
                    const ladderW = 12;
                    const ladderH = this.tileSize - 16;
                    ctx.strokeRect(centerX - ladderW/2, drawY + 8, ladderW, ladderH);
                    // Rungs
                    for (let i = 1; i < 4; i++) {
                        const rungY = drawY + 8 + (ladderH * i / 4);
                        ctx.beginPath();
                        ctx.moveTo(centerX - ladderW/2, rungY);
                        ctx.lineTo(centerX + ladderW/2, rungY);
                        ctx.stroke();
                    }
                }

                // Draw counter icon (bit 7 set)
                if (flag & 0x80) {
                    ctx.fillStyle = 'rgba(200, 150, 255, 0.7)';
                    ctx.fillRect(drawX + 4, centerY - 3, this.tileSize - 8, 6);
                }

                // Draw damage floor icon (bit 8 set)
                if (flag & 0x100) {
                    ctx.fillStyle = 'rgba(255, 100, 0, 0.8)';
                    ctx.font = `${this.tileSize - 20}px Arial`;
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText('⚠', centerX, centerY);
                }

                // Draw terrain tag (bits 12-15)
                const terrainTag = (flag >> 12) & 0x0F;
                if (terrainTag > 0) {
                    ctx.fillStyle = 'rgba(100, 255, 100, 0.8)';
                    ctx.font = `${this.tileSize / 3}px Arial`;
                    ctx.textAlign = 'right';
                    ctx.textBaseline = 'top';
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

        // For B-E layers that are split, remap coordinates
        let tileX = x;
        let tileY = y;

        if (isBtoE) {
            // The canvas is split: left half on top, right half on bottom
            // Canvas: 384 wide (8 tiles), 1536 tall (32 tiles)
            // Original: 768 wide (16 tiles), 768 tall (16 tiles)
            const halfHeight = tilesY / 2;

            if (y >= halfHeight) {
                // Bottom half: this was the right side of original image
                tileX = x + tilesX; // Shift X to right half
                tileY = y - halfHeight; // Reset Y to top
            }
            // Top half stays as-is (left side of original)
        }

        const tileIndex = this.getTileIndexForImage(imageIndex, tileX, tileY, isBtoE ? tilesX * 2 : tilesX);

        const oldFlag = this.currentTileset.flags[tileIndex] || 0;
        let currentFlag = oldFlag;

        console.log(`Clicked canvas (${x}, ${y})${isBtoE ? ` -> tile (${tileX}, ${tileY})` : ''} at index ${tileIndex}, current flag: ${oldFlag} (0x${oldFlag.toString(16)}), mode: ${this.currentEditMode}`);

        // Store selected tile for highlighting (use logical coordinates)
        this.selectedTile = { x: tileX, y: tileY };

        // Apply the selected edit mode
        switch (this.currentEditMode) {
            case 'passage-o':
                // Passable: Clear bits 0-4 (all passage bits) and bit 6 (above characters)
                // O, X, and ★ are mutually exclusive
                currentFlag = oldFlag & ~0x5F; // Clear bits 0-4 and 6
                break;

            case 'passage-x':
                // Impassable: Set bit 4, clear bits 0-3 and bit 6 (above characters)
                // O, X, and ★ are mutually exclusive
                currentFlag = (oldFlag & ~0x4F) | 0x10; // Clear bits 0-3 and 6, set bit 4
                break;

            case '4dir':
                // Cycle through 4-directional passage bits (down, left, right, up)
                // Clear bit 6 (above characters) as well - O, X, and ★ are mutually exclusive
                // Current 4-dir state
                const fourDirBits = oldFlag & 0x0F;

                // Cycle: none -> down -> down+left -> down+left+right -> all -> none
                if (fourDirBits === 0) {
                    currentFlag = (oldFlag & ~0x5F) | 0x01; // Set down, clear bits 6 and passage bits
                } else if (fourDirBits === 0x01) {
                    currentFlag = (oldFlag & ~0x5F) | 0x03; // Set down+left
                } else if (fourDirBits === 0x03) {
                    currentFlag = (oldFlag & ~0x5F) | 0x07; // Set down+left+right
                } else if (fourDirBits === 0x07) {
                    currentFlag = (oldFlag & ~0x5F) | 0x0F; // Set all 4 directions
                } else {
                    currentFlag = (oldFlag & ~0x5F); // Clear all 4-dir bits and bit 6
                }
                break;

            case 'above':
                // Above characters: Set bit 6, clear bits 0-4 (passage bits)
                // O, X, and ★ are mutually exclusive
                currentFlag = (oldFlag & ~0x1F) | 0x40; // Clear passage bits, set bit 6
                break;

            case 'ladder':
                // Toggle ladder bit (bit 5)
                currentFlag = oldFlag ^ 0x20;
                break;

            case 'bush':
                // Toggle bush bit (bit 5)
                currentFlag = oldFlag ^ 0x20;
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
                // Set terrain tag (bits 12-15)
                currentFlag = (oldFlag & ~0xF000) | (this.selectedTerrain << 12);
                break;
        }

        if (currentFlag !== oldFlag) {
            this.currentTileset.flags[tileIndex] = currentFlag;
            console.log(`Flag changed: ${oldFlag} (0x${oldFlag.toString(16)}) -> ${currentFlag} (0x${currentFlag.toString(16)})`);

            // Re-render the current tab view (which may contain multiple layers)
            this.renderTabPreview(this.currentTab);
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

        container.innerHTML = '<p style="color: #888; font-size: 10px;">Loading tileset preview...</p>';

        // Collect all tileset images that exist, in order
        const tilesetImages = [];
        console.log('=== Rendering Full Tileset Preview ===');
        console.log('Project path:', this.projectPath);
        for (let i = 0; i < 9; i++) {
            const fileName = this.currentTileset.tilesetNames[i];
            if (fileName && this.path && this.projectPath) {
                // Add .png extension if not already present
                const fileNameWithExt = fileName.endsWith('.png') ? fileName : fileName + '.png';
                const imagePath = this.path.join(this.projectPath, 'img', 'tilesets', fileNameWithExt);
                const exists = this.fs && this.fs.existsSync(imagePath);
                console.log(`Layer ${i} (${['A1', 'A2', 'A3', 'A4', 'A5', 'B', 'C', 'D', 'E'][i]}): ${fileName} -> ${imagePath} (exists: ${exists})`);
                if (exists) {
                    tilesetImages.push({ index: i, fileName: fileNameWithExt, imagePath });
                }
            }
        }

        if (tilesetImages.length === 0) {
            container.innerHTML = '<p style="color: #888; font-size: 10px;">No tileset images assigned. Click a layer on the left to assign images.</p>';
            return;
        }

        // Create a wrapper for the stacked tileset images
        const previewWrapper = document.createElement('div');
        previewWrapper.style.cssText = 'display: inline-block; border: 2px solid #555;';

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
                        const imgEl = document.createElement('img');
                        imgEl.src = 'file://' + this.path.join(this.projectPath, 'img', 'tilesets', fileName);
                        imgEl.style.cssText = 'display: block; width: 100%; height: auto; image-rendering: pixelated; border-bottom: 1px solid #444;';
                        imgEl.style.borderBottom = (index === 8) ? 'none' : '1px solid #444';
                        previewWrapper.appendChild(imgEl);
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
                        container.innerHTML = '<p style="color: #f44; font-size: 10px;">Failed to load tileset images</p>';
                    } else {
                        // Show what we could load
                        imagesToLoad.sort((a, b) => a.index - b.index);
                        imagesToLoad.forEach(({ img, index, fileName }) => {
                            const imgEl = document.createElement('img');
                            imgEl.src = 'file://' + this.path.join(this.projectPath, 'img', 'tilesets', fileName);
                            imgEl.style.cssText = 'display: block; width: 100%; height: auto; image-rendering: pixelated; border-bottom: 1px solid #444;';
                            previewWrapper.appendChild(imgEl);
                        });
                        container.innerHTML = '';
                        container.appendChild(previewWrapper);
                    }
                }
            };

            img.src = 'file://' + imagePath;
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

    /**
     * Show tileset detail view (for database modal)
     */
    showTilesetDetail(container, tileset) {
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
            <div class="database-section-header">General</div>
            <div class="database-section-content">
                <div class="form-row">
                    <div class="form-group">
                        <label class="database-field-label">Name:</label>
                        <input type="text" class="database-field-value" value="${tileset.name || ''}" data-field="name" data-tileset-id="${tileset.id}">
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group-fixed">
                        <label class="database-field-label">Mode:</label>
                        <select class="database-field-value" style="width: 120px;" readonly disabled>
                            <option value="0" ${tileset.mode === 0 ? 'selected' : ''}>Field</option>
                            <option value="1" ${tileset.mode === 1 ? 'selected' : ''}>Area</option>
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
        const imageLabels = ['A1 (Animations)', 'A2 (Ground)', 'A3 (Buildings)', 'A4 (Walls)', 'A5 (Normal)', 'B', 'C', 'D', 'E'];

        imagesSection.innerHTML = `
            <div class="database-section-header">Tileset Images</div>
            <div class="database-section-content">
                <table class="traits-table">
                    <thead>
                        <tr>
                            <th>Type</th>
                            <th>Filename</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${imageLabels.map((label, idx) => `
                            <tr>
                                <td style="width: 150px;">${label}</td>
                                <td style="font-family: monospace; font-size: 11px;">${tilesetNames[idx] || '<i style="color: #666;">not set</i>'}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
                <p style="color: #999; font-size: 11px; margin-top: 12px;">
                    Tileset image editing requires the advanced tileset editor
                </p>
            </div>
        `;
        gridWrapper.appendChild(imagesSection);

        // Note Section
        const noteSection = document.createElement('div');
        noteSection.className = 'database-section';
        noteSection.innerHTML = `
            <div class="database-section-header">Note</div>
            <div class="database-section-content">
                <textarea class="database-field-value" rows="4" style="width: 100%;" data-field="note" data-tileset-id="${tileset.id}">${tileset.note || ''}</textarea>
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
        this.updateStatus(`${fieldName} updated`);
    }

    /**
     * Show tileset editor within the database modal
     */
    showTilesetEditor() {
        const viewer = document.getElementById('database-viewer');
        const titleEl = document.getElementById('database-viewer-title');
        const listEl = document.getElementById('database-list');
        const detailEl = document.getElementById('database-detail');

        if (!viewer || !titleEl || !listEl || !detailEl) {
            console.error('Database viewer elements not found');
            return;
        }

        // Update active nav item
        document.querySelectorAll('.database-nav-item').forEach(item => {
            item.classList.remove('active');
            if (item.dataset.type === 'tilesets') {
                item.classList.add('active');
            }
        });

        // Set title
        titleEl.textContent = 'Tilesets';

        // Get tilesets data
        const tilesets = this.databaseManager.getTilesets();

        // Populate tileset list
        listEl.innerHTML = '';
        tilesets.forEach((tileset) => {
            const item = document.createElement('div');
            item.className = 'database-list-item';

            const nameSpan = document.createElement('span');
            nameSpan.textContent = tileset.name || 'Unnamed';

            const idSpan = document.createElement('span');
            idSpan.className = 'database-list-id';
            idSpan.textContent = `#${tileset.id || '?'}`;

            item.appendChild(nameSpan);
            item.appendChild(idSpan);

            item.addEventListener('click', () => {
                // Remove selection from all items
                document.querySelectorAll('.database-list-item').forEach(i => i.classList.remove('selected'));
                item.classList.add('selected');

                // Show tileset editor in detail panel
                this.showTilesetEditorDetail(detailEl, tileset);
            });

            listEl.appendChild(item);
        });

        // Show initial message
        detailEl.innerHTML = '<p style="color: #999; text-align: center; margin-top: 100px;">Select a tileset from the list</p>';

        // Show viewer
        viewer.classList.add('active');

        // Set up close button
        const closeBtn = document.getElementById('database-close-btn');
        if (closeBtn) {
            closeBtn.onclick = () => {
                // Also close tileset editor if it's open
                const tilesetEditorContainer = document.getElementById('tileset-editor-main-container');
                if (tilesetEditorContainer && tilesetEditorContainer.style.display !== 'none') {
                    tilesetEditorContainer.style.display = 'none';
                }
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
        if (!this.tilesetEditor && this.parentEditor && this.parentEditor.callbacks && this.parentEditor.callbacks.getRendererApp && currentProject) {
            console.log('Creating new DatabaseTilesetEditor with project path:', currentProject.path);
            this.tilesetEditor = new DatabaseTilesetEditor(
                this.parentEditor.callbacks.getRendererApp(),
                currentProject.path,
                this.databaseManager
            );
        } else {
            if (this.tilesetEditor) {
                console.log('Reusing existing DatabaseTilesetEditor, current projectPath:', this.tilesetEditor.projectPath);
            }
        }

        if (!this.tilesetEditor) {
            container.innerHTML = '<p style="color: #f44; text-align: center; margin-top: 100px;">Failed to initialize tileset editor</p>';
            return;
        }

        // Initialize the compact UI for modal display (now that container is in DOM)
        this.tilesetEditor.initializeCompactUI(editorContainer, tileset);
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = TilesetEditor;
}
