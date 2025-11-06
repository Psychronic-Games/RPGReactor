// RPG Reactor - Main Entry Point (Refactored)
// This is the main orchestrator that coordinates all subsystems

class RPGReactor {
    constructor() {
        // Core managers (data layer)
        this.projectManager = new ProjectManager();
        this.databaseManager = new DatabaseManager();

        // UI and Controller layer
        this.uiManager = null;
        this.rendererManager = null;
        this.projectController = null;
        this.audioPlayer = null;
        this.playtestManager = null;
        this.databaseEditorUI = null;

        // Map editing subsystems
        this.tilemapManager = null;
        this.regionManager = null;
        this.mapEditor = null;
        this.tilesetEditor = null;
        this.tilesetPaletteViewer = null;

        // Initialize
        this.init();
    }

    async init() {
        console.log('RPG Reactor initializing...');

        // Wait for DOM to be ready
        if (document.readyState === 'loading') {
            await new Promise(resolve => {
                document.addEventListener('DOMContentLoaded', resolve);
            });
        }

        // Initialize UI Manager with callbacks to this main app
        this.uiManager = new UIManager({
            newProject: () => this.projectController.newProject(),
            openProject: () => this.projectController.openProject(),
            closeProject: () => this.projectController.closeProject(),
            saveProject: () => this.projectController.saveProject(),
            saveAll: () => this.projectController.saveAll(),
            playtest: () => this.playtest(),
            openDatabase: (type) => this.openDatabase(type),
            showAudioPlayer: () => this.audioPlayer.showAudioPlayer(),
            showAbout: () => this.showAbout(),
            getMapEditor: () => this.mapEditor
        });

        // Initialize Renderer Manager
        this.rendererManager = new RendererManager();

        // Initialize Project Controller
        this.projectController = new ProjectController(
            this.projectManager,
            this.databaseManager,
            this.uiManager
        );

        // Set up callback for when maps are loaded
        this.projectController.onMapLoaded = () => {
            this.showTilesetPalette();

            // Initialize map editor for tile painting
            if (!this.mapEditor && this.tilesetPaletteViewer) {
                this.mapEditor = new MapEditor(
                    this.projectController.getTilemapManager(),
                    this.tilesetPaletteViewer
                );
                this.mapEditor.setupMapInteraction();
                console.log('Map editor initialized');
            }
        };

        // Initialize Audio Player
        this.audioPlayer = new AudioPlayer();

        // Initialize Playtest Manager
        this.playtestManager = new PlaytestManager();

        // Set up UI event handlers
        this.uiManager.setupEventHandlers();

        // Set up NW.js native menu
        this.uiManager.setupNativeMenu();

        // Set up keyboard shortcuts
        this.uiManager.setupKeyboardShortcuts();

        // Set up database navigation
        this.setupDatabaseNavigation();

        // Start with welcome screen (Pixi will initialize when project loads)
        this.uiManager.showWelcomeScreen();

        console.log('RPG Reactor initialized successfully!');
        console.log('Pixi.js version:', PIXI.VERSION);

        if (typeof nw !== 'undefined') {
            console.log('NW.js version:', nw.process.versions['nw']);
            console.log('Chromium version:', nw.process.versions['chromium']);

            // Force open DevTools for debugging
            setTimeout(() => {
                const win = nw.Window.get();
                console.log('Attempting to open DevTools...');
                console.log('Window object:', win);
                console.log('showDevTools method exists:', typeof win.showDevTools === 'function');
                win.showDevTools();
            }, 500);
        }

        // Set up a callback for when projects are loaded to initialize renderer
        const originalShowEditorUI = this.uiManager.showEditorUI.bind(this.uiManager);
        this.uiManager.showEditorUI = async () => {
            // Initialize Pixi BEFORE showing editor UI
            if (!this.rendererManager.getApp()) {
                await this.rendererManager.initPixi();
                this.projectController.setRendererApp(this.rendererManager.getApp());
            }

            // Then show the UI
            originalShowEditorUI();
        };

        // Auto-load last opened project
        await this.projectController.checkAutoLoadProject();

        // Sync current project with audio player if a project was loaded
        if (this.projectController.isProjectLoaded()) {
            this.audioPlayer.setCurrentProject(this.projectController.getCurrentProject());
        }

        // Hide splash screen after 2 seconds
        setTimeout(() => {
            const splash = document.getElementById('splash-screen');
            if (splash) {
                splash.style.transition = 'opacity 0.5s';
                splash.style.opacity = '0';
                setTimeout(() => {
                    splash.style.display = 'none';
                }, 500);
            }
        }, 2000);
    }

    // Playtest orchestration
    playtest() {
        const project = this.projectController.getCurrentProject();
        if (!project) {
            this.uiManager.updateStatus('No project loaded');
            return;
        }

        const success = this.playtestManager.playtest(project.path);
        if (!success) {
            this.uiManager.updateStatus('Playtest mode not yet implemented');
        }
    }

    // Show about dialog
    showAbout() {
        console.log('showAbout() called');
        const modal = document.getElementById('about-modal');
        console.log('About modal element:', modal);
        if (modal) {
            console.log('Setting about modal display to flex');
            modal.style.display = 'flex';
        } else {
            console.error('about-modal element not found!');
        }
    }

    // Show tileset palette viewer
    showTilesetPalette() {
        const tilemapManager = this.projectController.getTilemapManager();
        if (!tilemapManager) {
            console.warn('Tilemap manager not initialized');
            return;
        }

        // Get the tileset palette section and content container
        const paletteSection = document.getElementById('tileset-palette-section');
        const paletteContent = document.getElementById('tileset-palette-content');

        if (!paletteSection || !paletteContent) {
            console.warn('Tileset palette section not found in DOM');
            return;
        }

        // Get current map data
        const mapData = tilemapManager.currentMap;
        if (!mapData) {
            console.warn('No map data available for tileset palette');
            paletteSection.style.display = 'none';
            return;
        }

        // Show the palette section
        paletteSection.style.display = 'block';

        // Initialize tileset palette viewer if not already done
        if (!this.tilesetPaletteViewer) {
            const project = this.projectController.getCurrentProject();
            this.tilesetPaletteViewer = new TilesetPaletteViewer(
                this.rendererManager.getApp(),
                project.path
            );
            this.projectController.setTilesetPaletteViewer(this.tilesetPaletteViewer);
        }

        // Initialize the UI
        this.tilesetPaletteViewer.initializeUI(paletteContent);

        // Set up region tab callback
        this.tilesetPaletteViewer.onRegionTabSelected = () => {
            const regionContainer = document.getElementById('region-ui-container');
            const regionManager = this.projectController.getRegionManager();
            if (regionContainer && regionManager) {
                regionManager.initializeUI(regionContainer);
                regionManager.createRegionLayer();
                regionManager.renderRegions();
            }
        };

        // Load the tileset for the current map
        this.tilesetPaletteViewer.loadTilesetForMap(mapData);

        console.log('Tileset palette viewer shown for map:', mapData.displayName || mapData.id);
    }

    openDatabase(type) {
        if (!this.projectController.isProjectLoaded()) {
            alert('Please load a project first');
            return;
        }

        console.log('Opening database:', type);

        // Get data based on type
        let data, title;
        switch(type) {
            case 'actors':
                data = this.databaseManager.getActors();
                title = 'Actors';
                break;
            case 'classes':
                data = this.databaseManager.getClasses();
                title = 'Classes';
                break;
            case 'skills':
                data = this.databaseManager.getSkills();
                title = 'Skills';
                break;
            case 'items':
                data = this.databaseManager.getItems();
                title = 'Items';
                break;
            case 'weapons':
                data = this.databaseManager.getWeapons();
                title = 'Weapons';
                break;
            case 'armors':
                data = this.databaseManager.getArmors();
                title = 'Armors';
                break;
            case 'enemies':
                data = this.databaseManager.getEnemies();
                title = 'Enemies';
                break;
            case 'troops':
                data = this.databaseManager.getTroops();
                title = 'Troops';
                break;
            case 'states':
                data = this.databaseManager.getStates();
                title = 'States';
                break;
            case 'animations':
                data = this.databaseManager.getAnimations();
                title = 'Animations';
                break;
            case 'tilesets':
                // Tilesets use custom editor
                this.showTilesetEditor();
                return;
            case 'commonEvents':
                data = this.databaseManager.getCommonEvents();
                title = 'Common Events';
                break;
            case 'types':
                // Types editor uses System.json
                this.showTypesEditor();
                return;
            case 'terms':
                // Terms editor uses System.json
                this.showTermsEditor();
                return;
            default:
                alert('Unknown database type: ' + type);
                return;
        }

        // Show database viewer
        this.showDatabaseViewer(title, data, type);
    }

    showDatabaseViewer(title, data, type) {
        const viewer = document.getElementById('database-viewer');
        const navEl = document.getElementById('database-navigation');
        const titleEl = document.getElementById('database-viewer-title');
        const listEl = document.getElementById('database-list');
        const detailEl = document.getElementById('database-detail');

        // Set up navigation if not already done
        if (navEl && navEl.children.length === 0) {
            this.setupDatabaseNavigation();
        }

        // Update active nav item
        if (navEl) {
            document.querySelectorAll('.database-nav-item').forEach(item => {
                item.classList.remove('active');
                if (item.dataset.type === type) {
                    item.classList.add('active');
                }
            });
        }

        titleEl.textContent = title;
        listEl.innerHTML = '';
        detailEl.innerHTML = '<p style="color: #999; text-align: center; margin-top: 100px;">Select an entry from the list</p>';

        // Populate list
        data.forEach((entry) => {
            const item = document.createElement('div');
            item.className = 'database-list-item';

            const nameSpan = document.createElement('span');
            nameSpan.textContent = entry.name || 'Unnamed';

            const idSpan = document.createElement('span');
            idSpan.className = 'database-list-id';
            idSpan.textContent = `#${entry.id || '?'}`;

            item.appendChild(nameSpan);
            item.appendChild(idSpan);

            item.addEventListener('click', () => {
                // Remove selection from all items
                document.querySelectorAll('.database-list-item').forEach(i => i.classList.remove('selected'));
                item.classList.add('selected');

                // Show detail
                this.showDatabaseDetail(entry, type);
            });

            listEl.appendChild(item);
        });

        // Show viewer
        viewer.classList.add('active');

        // Set up close button
        const closeBtn = document.getElementById('database-close-btn');
        closeBtn.onclick = () => {
            viewer.classList.remove('active');
        };

        // Don't close on background click - user must use X button
        // (Removed background click to prevent accidental closes)
    }



    // Tileset editor methods
    showTilesetEditor() {
        // Hide database viewer
        const viewer = document.getElementById('database-viewer');
        viewer.classList.remove('active');

        // Get or create the tileset editor container
        let editorContainer = document.getElementById('tileset-editor-main-container');
        if (!editorContainer) {
            editorContainer = document.createElement('div');
            editorContainer.id = 'tileset-editor-main-container';
            editorContainer.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; z-index: 10000; background-color: #1e1e1e; display: none;';
            document.body.appendChild(editorContainer);
        }

        // Show the container
        editorContainer.style.display = 'flex';

        // Initialize tileset editor if not already done
        if (!this.tilesetEditor) {
            const project = this.projectController.getCurrentProject();
            this.tilesetEditor = new TilesetEditor(
                this.rendererManager.getApp(),
                project.path,
                this.databaseManager
            );

            // Initialize the UI
            this.tilesetEditor.initializeUI(editorContainer);
            this.tilesetEditor.setupEventListeners();
            this.tilesetEditor.loadTilesets();

            // Set up close callback
            this.tilesetEditor.onClose = () => {
                this.closeTilesetEditor();
            };
        }

        console.log('Tileset editor shown');
    }

    closeTilesetEditor() {
        // Hide the tileset editor container
        const editorContainer = document.getElementById('tileset-editor-main-container');
        if (editorContainer) {
            editorContainer.style.display = 'none';
        }

        // Show database viewer with tilesets
        const data = this.databaseManager.getTilesets();
        this.showDatabaseViewer('Tilesets', data, 'tilesets');

        console.log('Tileset editor closed');
    }



    // ==========================================
    // DATABASE UI - Delegated to DatabaseEditorUI
    // ==========================================

    // Database UI is now handled by the DatabaseEditorUI class (see DatabaseEditorUI.js)
    // Methods are delegated through the databaseEditorUI instance

    setupDatabaseNavigation() {
        if (!this.databaseEditorUI) {
            this.databaseEditorUI = new DatabaseEditorUI(
                this.databaseManager,
                this.projectController.getCurrentProject(),
                {
                    updateStatus: (msg) => this.updateStatus(msg),
                    getRendererApp: () => this.rendererManager.getApp(),
                    showTilesetEditor: () => this.showTilesetEditor(),
                    closeTilesetEditor: () => this.closeTilesetEditor(),
                    showTypesEditor: () => this.showTypesEditor(),
                    showTermsEditor: () => this.showTermsEditor()
                }
            );
        }
        this.databaseEditorUI.setupDatabaseNavigation();
    }

    openDatabase(type) {
        if (!this.projectController.isProjectLoaded()) {
            alert('Please load a project first');
            return;
        }

        if (!this.databaseEditorUI) {
            this.databaseEditorUI = new DatabaseEditorUI(
                this.databaseManager,
                this.projectController.getCurrentProject(),
                {
                    updateStatus: (msg) => this.updateStatus(msg),
                    getRendererApp: () => this.rendererManager.getApp(),
                    showTilesetEditor: () => this.showTilesetEditor(),
                    closeTilesetEditor: () => this.closeTilesetEditor(),
                    showTypesEditor: () => this.showTypesEditor(),
                    showTermsEditor: () => this.showTermsEditor()
                }
            );
        }

        // Update project reference in case it changed
        this.databaseEditorUI.setCurrentProject(this.projectController.getCurrentProject());

        // Delegate to DatabaseEditorUI
        this.databaseEditorUI.openDatabase(type);
    }

    showTypesEditor() {
        if (this.databaseEditorUI) {
            this.databaseEditorUI.showTypesEditor();
        }
    }

    showTermsEditor() {
        if (this.databaseEditorUI) {
            this.databaseEditorUI.showTermsEditor();
        }
    }

    showAbout() {
        const modal = document.getElementById('about-modal');
        if (modal) {
            console.log('Setting about modal display to flex');
            modal.style.display = 'flex';
        } else {
            console.error('about-modal element not found!');
        }
    }
    async loadMap(mapId) {
        if (!this.tilemapManager) {
            console.error('Tilemap manager not initialized');
            return;
        }

        this.updateStatus(`Loading map ${mapId}...`);

        const success = await this.tilemapManager.loadMap(mapId);

        if (success) {
            this.updateStatus(`Map ${mapId} loaded`);

            // Highlight selected map in list
            document.querySelectorAll('[data-map-id]').forEach(item => {
                item.classList.remove('selected');
                if (parseInt(item.getAttribute('data-map-id')) === mapId) {
                    item.classList.add('selected');
                }
            });

            // Initialize and show tileset palette viewer
            this.showTilesetPalette();

            // Initialize map editor for tile painting
            if (!this.mapEditor && this.tilesetPaletteViewer) {
                this.mapEditor = new MapEditor(this.tilemapManager, this.tilesetPaletteViewer);
                this.mapEditor.setupMapInteraction();
                console.log('Map editor initialized');
            }
        } else {
            this.updateStatus(`Failed to load map ${mapId}`);
        }
    }

    updateStatus(message) {
        const statusBar = document.querySelector('#status-bar span:last-child');
        if (statusBar) {
            statusBar.textContent = message;
            setTimeout(() => {
                statusBar.textContent = 'Ready';
            }, 3000);
        }
    }
}

// Initialize the application
const reactor = new RPGReactor();
