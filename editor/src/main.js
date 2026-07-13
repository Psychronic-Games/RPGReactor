// RPG Reactor - Main Entry Point (Refactored)
// This is the main orchestrator that coordinates all subsystems

class RPGReactor {
    constructor() {
        // Core managers (data layer)
        this.projectManager = new ProjectManager();
        this.databaseManager = new DatabaseManager();

        // UI and Controller layer
        this.uiManager = null;
        this.projectController = null;
        this.audioPlayer = null;
        this.playtestManager = null;
        this.databaseEditorUI = null;
        this.sidebarResizer = null;
        this.buildManager = null;
        this.pluginManager = null;

        // Map editing subsystems
        this.tilemapManager = null;
        this.regionManager = null;
        this.mapEditor = null;
        this.tilesetEditor = null;
        this.tilesetPaletteViewer = null;
        this.eventManager = null;

        // PERFORMANCE: Cache last displayed coordinates to avoid unnecessary DOM updates
        this.lastDisplayedCoords = { x: null, y: null };

        // Initialize
        this.init();
    }

    async init() {
        if (this.relaunchFramelessForWine()) return;

        this.centerWindowOnStartup();

        // Set application icon for taskbar/dock (important for Linux)
        this.setApplicationIcon();

        // Initialize performance profiler
        window.perfProfiler = new PerformanceProfiler();

        // Wait for DOM to be ready
        if (document.readyState === 'loading') {
            await new Promise(resolve => {
                document.addEventListener('DOMContentLoaded', resolve);
            });
        }

        this.applyCompatibilityWindowFixes();

        // Initialize Effekseer runtime for animation previews (delayed to ensure library is loaded)
        // Use setTimeout to allow Effekseer library to fully initialize
        setTimeout(() => this.initEffekseer(), 100);

        if (window.I18n) window.I18n.apply(document);

        // Initialize UI Manager with callbacks to this main app
        this.uiManager = new UIManager({
            newProject: () => this.projectController.newProject(),
            openProject: () => this.projectController.openProject(),
            closeProject: () => this.projectController.closeProject(),
            exit: () => this.projectController.requestApplicationClose(),
            saveProject: () => this.projectController.saveProject(),
            saveAll: () => this.projectController.saveAll(),
            playtest: () => this.playtest(),
            openDatabase: (type) => this.openDatabase(type),
            showAudioPlayer: () => this.audioPlayer.showAudioPlayer(),
            showOptions: () => this.optionsManager.show(),
            showForgeLauncher: () => this.forgeManager.showLauncher(),
            openForgeTool: (toolId) => this.forgeManager.openTool(toolId),
            showPluginManager: () => this.showPluginManager(),
            showAbout: () => this.showAbout(),
            getMapEditor: () => this.mapEditor,
            getEventManager: () => this.eventManager,
            toggleEventMode: () => this.toggleEventMode(),
            disableEventModeIfActive: () => this.disableEventModeIfActive(),
            installRuntime: () => this.projectController.installReactorRuntime(),
            openBuildManager: () => this.buildManager.open(),
            openDistEditor: () => this.distEditorManager.open()
        });

        // Initialize Sidebar Resizer for resizable panels
        this.sidebarResizer = new SidebarResizer();
        this.sidebarResizer.initialize();

        // Keep sidebar layout correct on window resize and scale toolbar icons
        window.addEventListener('resize', () => {
            if (this.sidebarResizer) {
                this.sidebarResizer.refresh();
            }
            this.resetSidebarScroll();
            this.scaleToolbarIcons();
        });

        // Initialize Project Controller
        this.projectController = new ProjectController(
            this.projectManager,
            this.databaseManager,
            this.uiManager
        );

        if (typeof nw !== 'undefined') {
            const appWindow = nw.Window.get();
            appWindow.on('close', () => {
                if (this.projectController.allowApplicationClose) {
                    appWindow.close(true);
                    return;
                }
                this.projectController.requestApplicationClose();
            });
        }

        // Set up callback for when maps are loaded
        this.projectController.onMapLoaded = () => {
            // Remember current event mode state
            const wasInEventMode = this.eventManager ? this.eventManager.eventMode : false;

            this.showTilesetPalette();

            // Initialize or recreate map editor for tile painting
            if (!this.mapEditor && this.tilesetPaletteViewer) {
                this.mapEditor = new MapEditor(
                    this.projectController.getTilemapManager(),
                    this.tilesetPaletteViewer
                );

                // Give palette viewer reference to map editor for auto-toggling erase mode
                this.tilesetPaletteViewer.setMapEditor(this.mapEditor);

                // Set region manager reference
                this.mapEditor.setRegionManager(this.projectController.getRegionManager());

                // Set up coordinate tracking callback for tileset mode
                this.mapEditor.onCoordinatesChange = (x, y) => {
                    this.updateMapCoordinates(x, y);
                };

                // Set up undo/redo state change callback
                this.mapEditor.onUndoStateChange = (canUndo, canRedo) => {
                    this.uiManager.updateUndoRedoButtons(canUndo, canRedo);
                };

                // Register with project controller so it can update references when switching projects
                this.projectController.setMapEditor(this.mapEditor);

                // PERFORMANCE: Wrap MapEditor methods for profiling
                if (window.perfProfiler) {
                    perfProfiler.wrapMethod(this.mapEditor, 'paintTile', 'MapEditor');
                    perfProfiler.wrapMethod(this.mapEditor, 'updateTilePreview', 'MapEditor');
                    perfProfiler.wrapMethod(this.mapEditor, 'hideTilePreview', 'MapEditor');
                    perfProfiler.wrapMethod(this.mapEditor, 'toggleShadow', 'MapEditor');
                    perfProfiler.wrapMethod(this.mapEditor, 'paintRectangle', 'MapEditor');
                    perfProfiler.wrapMethod(this.mapEditor, 'paintCircle', 'MapEditor');
                    perfProfiler.wrapMethod(this.mapEditor, 'eraseTile', 'MapEditor');
                }
            } else if (this.mapEditor) {
                // Update MapEditor's references in case they changed (e.g., project switch)
                // This ensures it has the current TilemapManager
                this.mapEditor.tilemapManager = this.projectController.getTilemapManager();
                this.mapEditor.regionManager = this.projectController.getRegionManager();
            }

            // Re-setup map interaction for the new map (important when switching maps)
            if (this.mapEditor) {
                this.mapEditor.setupMapInteraction();

                // Clear undo history when loading a new map
                this.mapEditor.clearUndoHistory();
            }

            // Initialize event manager
            if (!this.eventManager) {
                this.eventManager = new EventManager(
                    this.projectController,
                    this.databaseManager
                );

                // Set sidebar resizer reference
                if (this.sidebarResizer) {
                    this.eventManager.setSidebarResizer(this.sidebarResizer);
                }

            }

            // Always reinitialize event layer with current TilemapManager
            // This is important when switching projects or maps
            this.eventManager.initializeEventLayer(this.projectController.getTilemapManager());
            this.projectController.eventManager = this.eventManager;

            // Set current map for event manager
            if (this.eventManager) {
                const currentMap = this.projectController.getTilemapManager().currentMap;
                this.eventManager.setCurrentMap(currentMap);

                // Set up coordinate tracking callback
                this.eventManager.onCoordinatesChange = (x, y) => {
                    this.updateMapCoordinates(x, y);
                };

                // Set up undo/redo state change callback
                this.eventManager.onUndoStateChange = (canUndo, canRedo) => {
                    this.uiManager.updateUndoRedoButtons(canUndo, canRedo);
                };

                // Clear undo history when loading a new map
                this.eventManager.clearUndoHistory();
            }

            // Set up zoom change callback
            const tilemapManager = this.projectController.getTilemapManager();
            if (tilemapManager) {
                tilemapManager.onZoomChange = () => {
                    this.updateMapZoom();
                };
            }

            // Restore event mode state if it was on
            if (wasInEventMode && this.eventManager) {
                this.eventManager.setEventMode(true);
                if (this.mapEditor) {
                    this.mapEditor.setEnabled(false);
                }
                // Make sure button shows active state
                const button = document.getElementById('toolbar-event-manager-btn');
                if (button) {
                    button.classList.add('active');
                }
            } else {
                // Make sure tileset mode is properly enabled
                if (this.mapEditor) {
                    this.mapEditor.setEnabled(true);
                }
                // Make sure button shows inactive state
                const button = document.getElementById('toolbar-event-manager-btn');
                if (button) {
                    button.classList.remove('active');
                }
            }

            // Update map info banner
            this.updateMapInfoBanner();
        };

        // Initialize Audio Player
        this.audioPlayer = new AudioPlayer();

        // Initialize Options Manager (theme/preferences modal)
        this.optionsManager = new OptionsManager();

        // Initialize Forge tool suite (character generator etc.)
        this.forgeManager = new ForgeManager(this.projectController);

        // Initialize Playtest Manager
        this.playtestManager = new PlaytestManager();

        // Initialize Build Manager
        const web = window.RPGReactorHost?.mode === 'web';
        this.buildManager = web
            ? { open: () => window.RPGReactorHost.unsupported('Game deployment') }
            : new BuildManager();

        // Initialize Editor Distribution Manager
        this.distEditorManager = web
            ? { open: () => window.RPGReactorHost.unsupported('Editor deployment') }
            : new DistEditorManager();

        // Initialize Plugin Manager
        this.pluginManager = new PluginManager(this.projectController);

        // Set up UI event handlers
        this.uiManager.setupEventHandlers();

        // Set up NW.js native menu
        this.uiManager.setupNativeMenu();

        // Set up keyboard shortcuts
        this.uiManager.setupKeyboardShortcuts();

        // Set up database navigation
        this.setupDatabaseNavigation();

        // PERFORMANCE: Wrap main.js methods for profiling
        if (window.perfProfiler) {
            perfProfiler.wrapMethod(this, 'updateMapCoordinates', 'Main');
        }

        // Start with welcome screen (Pixi will initialize when project loads)
        this.uiManager.showWelcomeScreen();

        // DevTools can be toggled via Help > Developer Tools or F12

        // Pixi is initialized in ProjectController, no RendererManager needed

        // Disable browser context menu on canvas and canvas container
        document.addEventListener('contextmenu', (e) => {
            if (e.target.tagName === 'CANVAS' || e.target.id === 'canvas-container') {
                e.preventDefault();
                return false;
            }
        });

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
    async playtest() {
        const project = this.projectController.getCurrentProject();
        if (!project) {
            this.uiManager.updateStatus(window.I18n ? window.I18n.t('status.noProjectLoaded') : 'No project loaded');
            return;
        }

        if (this.projectController.repairInvalidSystemMapReferences) {
            await this.projectController.repairInvalidSystemMapReferences();
        }

        // Stop any audio playing in the editor before launching playtest
        if (this.audioPlayer) {
            this.audioPlayer.stopExternal();
        }

        const success = this.playtestManager.playtest(project.path);
        if (!success) {
            this.uiManager.updateStatus(window.I18n ? window.I18n.t('status.playtestNotImplemented') : 'Playtest mode not yet implemented');
        }
    }

    // Show about dialog
    showAbout() {
        const modal = document.getElementById('about-modal');
        if (modal) {
            modal.style.display = 'flex';
        }
    }

    // Show plugin manager
    showPluginManager() {
        if (!this.projectController.isProjectLoaded()) {
            alert(window.I18n ? window.I18n.t('alert.loadProjectFirst') : 'Please load a project first.');
            return;
        }
        if (this.pluginManager) {
            this.pluginManager.show();
        }
    }

    // Toggle event mode
    toggleEventMode() {
        if (!this.eventManager) {
            this.uiManager.updateStatus(window.I18n ? window.I18n.t('status.loadMapFirst') : 'Load a map first');
            return;
        }

        // Ensure event manager has reference to tileset palette viewer
        if (this.tilesetPaletteViewer) {
            this.eventManager.setTilesetPaletteViewer(this.tilesetPaletteViewer);
        }

        // Toggle event mode
        const newMode = !this.eventManager.eventMode;
        this.eventManager.setEventMode(newMode);

        // Disable/enable map editor based on event mode
        if (this.mapEditor) {
            this.mapEditor.setEnabled(!newMode);
            // Disable shadow pen when entering event mode
            if (newMode && this.mapEditor.shadowPenMode) {
                this.mapEditor.setShadowPenMode(false);
            }
            // Re-setup map interaction when returning to tileset mode
            if (!newMode) {
                this.mapEditor.setupMapInteraction();
            }
        }

        // Clear tileset palette selection when entering event mode
        if (newMode && this.tilesetPaletteViewer) {
            this.tilesetPaletteViewer.clearSelection();
        }

        // Deselect all tileset tool buttons when entering event mode
        if (newMode) {
            document.querySelectorAll('.tool-draw-mode').forEach(btn => {
                btn.classList.remove('active');
            });
        } else {
            // Re-select the default tool (pencil) when exiting event mode
            if (this.mapEditor) {
                this.mapEditor.setTool('pencil');
            }
            document.querySelectorAll('.tool-draw-mode').forEach(btn => {
                btn.classList.remove('active');
                if (btn.dataset.tool === 'pencil') {
                    btn.classList.add('active');
                }
            });
        }

        // Update button appearance
        const button = document.getElementById('toolbar-event-manager-btn');
        if (button) {
            if (newMode) {
                button.classList.add('active');
            } else {
                button.classList.remove('active');
            }
        }

        // Update undo/redo button states based on the current mode
        if (newMode) {
            // Event mode - update buttons based on event manager undo state
            this.uiManager.updateUndoRedoButtons(
                this.eventManager.canUndo(),
                this.eventManager.canRedo()
            );
        } else {
            // Map editor mode - update buttons based on map editor undo state
            if (this.mapEditor) {
                this.uiManager.updateUndoRedoButtons(
                    this.mapEditor.canUndo(),
                    this.mapEditor.canRedo()
                );
            }
        }

        // Update status
        this.uiManager.updateStatus(window.I18n
            ? window.I18n.t(newMode ? 'status.eventModeEnabled' : 'status.eventModeDisabled')
            : (newMode ? 'Event mode enabled' : 'Event mode disabled'));
    }

    // Disable event mode if currently active (called when switching to tileset tools)
    disableEventModeIfActive() {
        if (!this.eventManager) return;

        // If event mode is currently active, deactivate it
        if (this.eventManager.eventMode) {

            this.eventManager.setEventMode(false);

            // Enable map editor
            if (this.mapEditor) {
                this.mapEditor.setEnabled(true);
                // Re-setup map interaction when returning to tileset mode
                this.mapEditor.setupMapInteraction();
            }

            // Clear tileset selection (important to prevent janky behavior)
            if (this.tilesetPaletteViewer) {
                this.tilesetPaletteViewer.clearSelection();
            }

            // Re-select the default tool (pencil)
            if (this.mapEditor) {
                this.mapEditor.setTool('pencil');
            }
            document.querySelectorAll('.tool-draw-mode').forEach(btn => {
                btn.classList.remove('active');
                if (btn.dataset.tool === 'pencil') {
                    btn.classList.add('active');
                }
            });

            // Update button appearance
            const button = document.getElementById('toolbar-event-manager-btn');
            if (button) {
                button.classList.remove('active');
            }

            // Update status
            this.uiManager.updateStatus('Tileset mode enabled');
        }
    }

    // Show tileset palette viewer
    async showTilesetPalette() {
        const tilemapManager = this.projectController.getTilemapManager();
        if (!tilemapManager) {
            return;
        }

        // Get the tileset palette section and content container
        const paletteSection = document.getElementById('tileset-palette-section');
        const paletteContent = document.getElementById('tileset-palette-content');

        if (!paletteSection || !paletteContent) {
            return;
        }

        // Get current map data
        const mapData = tilemapManager.currentMap;
        if (!mapData) {
            paletteSection.style.display = 'none';
            return;
        }

        // Show the palette section (use 'flex' to ensure flex layout is active)
        paletteSection.style.display = 'flex';

        // Initialize tileset palette viewer if not already done
        if (!this.tilesetPaletteViewer) {
            const project = this.projectController.getCurrentProject();
            this.tilemapManager = this.projectController.getTilemapManager();
            this.tilesetPaletteViewer = new TilesetPaletteViewer(
                this.tilemapManager.app,
                project.path
            );
            this.projectController.setTilesetPaletteViewer(this.tilesetPaletteViewer);

            // Initialize the UI only once
            this.tilesetPaletteViewer.initializeUI(paletteContent);

            // Set up region tab callback
            this.tilesetPaletteViewer.onRegionTabSelected = () => {
                const regionContainer = document.getElementById('region-ui-container');
                const regionManager = this.projectController.getRegionManager();
                if (regionContainer && regionManager) {
                    regionManager.initializeUI(regionContainer);
                    regionManager.createRegionLayer();
                    regionManager.setVisible(true);
                }
            };

            // Set up tileset layer selection callback - disable event mode when switching to tileset mode
            this.tilesetPaletteViewer.onTilesetLayerSelected = () => {
                // Hide regions overlay when switching away from R tab
                const regionManager = this.projectController.getRegionManager();
                if (regionManager) {
                    regionManager.setVisible(false);
                }

                // If event mode is currently active, deactivate it
                if (this.eventManager && this.eventManager.eventMode) {
                    this.eventManager.setEventMode(false);

                    // Enable map editor
                    if (this.mapEditor) {
                        this.mapEditor.setEnabled(true);
                        // Re-setup map interaction when returning to tileset mode
                        this.mapEditor.setupMapInteraction();
                    }

                    // Update button appearance
                    const button = document.getElementById('toolbar-event-manager-btn');
                    if (button) {
                        button.classList.remove('active');
                    }

                    // Update status
                    this.uiManager.updateStatus('Tileset mode enabled');
                }
            };

            // Set up layer changed callback to update layer highlights
            this.tilesetPaletteViewer.onLayerChanged = (layerName) => {
                const tilemapManager = this.projectController.getTilemapManager();
                if (tilemapManager && tilemapManager.renderLayerHighlights) {
                    tilemapManager.renderLayerHighlights();
                }
            };
        }

        // Always ensure event manager has reference to tileset palette viewer
        if (this.eventManager && this.tilesetPaletteViewer) {
            this.eventManager.setTilesetPaletteViewer(this.tilesetPaletteViewer);
        }

        // Load the tileset for the current map (wait for images to load)
        await this.tilesetPaletteViewer.loadTilesetForMap(mapData);

        // Update resize handles visibility and force layout recalculation
        if (this.sidebarResizer) {
            this.sidebarResizer.refresh();
        }

        // Fix for NW.js/Linux: when new content is created inside overflow:hidden containers,
        // the browser can silently set scrollTop, hiding the header/tabs at the top.
        // Reset all scroll positions to ensure the sidebar headers are visible.
        this.resetSidebarScroll();
    }

    // Reset scroll positions on the sidebar and all its sections.
    // When NW.js/Chromium creates content inside overflow:hidden containers,
    // it can silently set scrollTop, pushing headers out of view.
    resetSidebarScroll() {
        const resetAll = () => {
            const sidebar = document.getElementById('sidebar');
            if (sidebar) sidebar.scrollTop = 0;

            // Reset all resizable sections
            document.querySelectorAll('.resizable-section').forEach(section => {
                section.scrollTop = 0;
            });

            // Reset sidebar-content containers (except maps list which manages its own scroll)
            document.querySelectorAll('.sidebar-content').forEach(content => {
                if (content.id !== 'maps-list') {
                    content.scrollTop = 0;
                }
            });
        };

        // Reset immediately
        resetAll();
        // Reset after layout settles (next frame)
        requestAnimationFrame(resetAll);
        // Reset once more after a short delay for NW.js layout quirks
        setTimeout(resetAll, 50);
    }

    // Scale toolbar icons to fit available width.
    // At full size: 32px icons. Shrinks proportionally when the window is narrow.
    scaleToolbarIcons() {
        const toolbar = document.getElementById('toolbar');
        if (!toolbar || toolbar.style.display === 'none') return;

        const maxSize = 32;
        const minSize = 16;

        // Temporarily set to max size and allow overflow for accurate measurement
        toolbar.style.setProperty('--toolbar-icon-size', maxSize + 'px');
        toolbar.style.overflow = 'visible';

        // Force reflow to get accurate scrollWidth at full icon size
        const naturalWidth = toolbar.scrollWidth;
        const availableWidth = toolbar.clientWidth;

        // Restore overflow
        toolbar.style.overflow = '';

        if (naturalWidth <= availableWidth) {
            // Plenty of room, use full size
            return;
        }

        // Calculate how much space the icons occupy vs fixed elements (labels, separators, gaps, padding)
        const iconCount = toolbar.querySelectorAll('.tool-button img').length;
        const totalIconWidth = iconCount * maxSize;
        const fixedWidth = naturalWidth - totalIconWidth;

        // Solve for icon size: iconCount * newSize + fixedWidth <= availableWidth
        const newSize = Math.max(minSize, Math.min(maxSize, Math.floor((availableWidth - fixedWidth) / iconCount)));
        toolbar.style.setProperty('--toolbar-icon-size', newSize + 'px');
    }

    // ==========================================
    // TILESET EDITOR
    // ==========================================
    showTilesetEditor() {
        // Hide database viewer
        const viewer = document.getElementById('database-viewer');
        viewer.classList.remove('active');

        // Get or create the tileset editor container
        let editorContainer = document.getElementById('tileset-editor-main-container');
        if (!editorContainer) {
            editorContainer = document.createElement('div');
            editorContainer.id = 'tileset-editor-main-container';
            editorContainer.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; z-index: 10000; background-color: var(--color-bg-surface); display: none;';
            document.body.appendChild(editorContainer);
        }

        // Show the container
        editorContainer.style.display = 'flex';

        // Initialize tileset editor if not already done
        if (!this.tilesetEditor) {
            const project = this.projectController.getCurrentProject();
            this.tilesetEditor = new TilesetEditor(
                this.tilemapManager.app,
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
    }

    closeTilesetEditor() {
        // Hide the tileset editor container
        const editorContainer = document.getElementById('tileset-editor-main-container');
        if (editorContainer) {
            editorContainer.style.display = 'none';
        }

        // Show database viewer with tilesets
        this.openDatabase('tilesets');
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
                    getRendererApp: () => this.tilemapManager?.app || null,
                    showTilesetEditor: () => this.showTilesetEditor(),
                    closeTilesetEditor: () => this.closeTilesetEditor(),
                    showTypesEditor: () => this.showTypesEditor(),
                    showTermsEditor: () => this.showTermsEditor()
                }
            );
        }
        this.databaseEditorUI.playtestManager = this.playtestManager;
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
                    getRendererApp: () => this.tilemapManager?.app || null,
                    showTilesetEditor: () => this.showTilesetEditor(),
                    closeTilesetEditor: () => this.closeTilesetEditor(),
                    showTypesEditor: () => this.showTypesEditor(),
                    showTermsEditor: () => this.showTermsEditor()
                }
            );
        }

        // Update project reference and playtest manager in case they changed
        this.databaseEditorUI.setCurrentProject(this.projectController.getCurrentProject());
        this.databaseEditorUI.playtestManager = this.playtestManager;

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

    async loadMap(mapId) {
        if (!this.tilemapManager) {
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

                // Give palette viewer reference to map editor for auto-toggling erase mode
                this.tilesetPaletteViewer.setMapEditor(this.mapEditor);

                // Set region manager reference
                if (this.projectController) {
                    this.mapEditor.setRegionManager(this.projectController.getRegionManager());
                }

                this.mapEditor.setupMapInteraction();
            }
        } else {
            this.updateStatus(`Failed to load map ${mapId}`);
        }
    }

    updateStatus(message) {
        // Status bar removed - status updates handled by UIManager
    }

    // Update map info banner with current map information
    updateMapInfoBanner() {
        const tilemapManager = this.projectController.getTilemapManager();
        if (!tilemapManager || !tilemapManager.currentMap) {
            return;
        }

        const map = tilemapManager.currentMap;
        const mapInfoContent = document.getElementById('map-info-content');
        const mapIdEl = document.getElementById('map-id');
        const mapNameEl = document.getElementById('map-name');
        const mapDimensionsEl = document.getElementById('map-dimensions');

        if (mapInfoContent && mapIdEl && mapNameEl && mapDimensionsEl) {
            // Show the map info content
            mapInfoContent.style.display = 'block';

            // Format map ID with leading zeros (e.g., 001, 002, etc.)
            const mapIdStr = String(map.id).padStart(3, '0');
            mapIdEl.textContent = mapIdStr;

            // Display map name from MapInfos.json (the actual map name)
            // Fallback to displayName from Map file if MapInfos not available
            const mapInfos = this.projectController.getMapInfos();
            const mapInfo = mapInfos && mapInfos[map.id];
            const mapName = (mapInfo && mapInfo.name) ? mapInfo.name : (map.displayName || 'Unnamed Map');
            mapNameEl.textContent = mapName;

            // Display dimensions
            mapDimensionsEl.textContent = `${map.width} x ${map.height}`;
        }

        // Update zoom level
        this.updateMapZoom();
    }

    // Update zoom level display
    updateMapZoom() {
        const tilemapManager = this.projectController.getTilemapManager();
        if (!tilemapManager || !tilemapManager.container) {
            return;
        }

        const zoomEl = document.getElementById('map-zoom');
        if (zoomEl) {
            const scale = tilemapManager.container.scale.x;
            const zoomPercent = Math.round(scale * 100);
            zoomEl.textContent = `${zoomPercent}%`;
        }
    }

    // Update map coordinates display (called from EventManager and MapEditor)
    updateMapCoordinates(x, y) {
        // PERFORMANCE: Skip DOM update if coordinates haven't changed
        if (this.lastDisplayedCoords.x === x && this.lastDisplayedCoords.y === y) {
            return;
        }

        this.lastDisplayedCoords.x = x;
        this.lastDisplayedCoords.y = y;

        const coordsEl = document.getElementById('map-coordinates');

        if (coordsEl) {
            if (x !== null && y !== null) {
                coordsEl.textContent = `${x}, ${y}`;
            } else {
                coordsEl.textContent = '--,--';
            }
        }
    }

    // Initialize Effekseer runtime for animation previews
    initEffekseer() {
        if (typeof effekseer === 'undefined') {
            window._effekseerReady = false;
            return;
        }

        const onLoad = () => {
            window._effekseerReady = true;
        };

        const onError = (message) => {
            window._effekseerReady = false;
        };

        try {
            effekseer.initRuntime('libs/effekseer.wasm', onLoad, onError);
        } catch (e) {
            window._effekseerReady = false;
        }
    }

    setApplicationIcon() {
        // Set the window icon for taskbar/dock (critical for Linux)
        try {
            const win = nw.Window.get();
            const path = require('path');
            const fs = require('fs');
            const appRootCandidates = [
                typeof __dirname !== 'undefined' ? __dirname : null,
                path.join(process.cwd(), 'package.nw'),
                process.cwd(),
                typeof __dirname !== 'undefined' ? path.resolve(__dirname, '..') : null
            ].filter(Boolean);

            const findIcon = (fileName) => {
                for (const root of appRootCandidates) {
                    const candidate = path.join(root, 'images', fileName);
                    if (fs.existsSync(candidate)) return candidate;
                }
                return null;
            };

            const pngIconPath = findIcon('icon.png');
            const icoIconPath = findIcon('icon.ico');

            // Set the window icon - this is what fixes the taskbar icon issue
            win.setShowInTaskbar(true);

            // On Linux, we need to set the icon explicitly at runtime
            if (process.platform === 'linux') {
                // Try multiple approaches for Linux
                if (pngIconPath) win.setIcon(pngIconPath);

                // Also try setting it as a data URL for better compatibility
                if (pngIconPath) {
                    const iconData = fs.readFileSync(pngIconPath);
                    const base64Icon = iconData.toString('base64');
                    const dataUrl = `data:image/png;base64,${base64Icon}`;

                    // Try setting with data URL
                    setTimeout(() => {
                        try {
                            win.setIcon(dataUrl);
                        } catch (e) {
                            // File path method already applied
                        }
                    }, 100);
                }
            } else if (process.platform === 'win32') {
                const iconPath = icoIconPath || pngIconPath;
                if (iconPath) win.setIcon(iconPath);
            }
            // macOS uses .icns from package.json automatically
        } catch (error) {
            // Icon setting is non-critical, silently continue
        }
    }

    centerWindowOnStartup() {
        if (typeof nw === 'undefined') return;

        try {
            const win = nw.Window.get();
            if (typeof win.setPosition === 'function') {
                win.setPosition('center');
                return;
            }

            const width = win.width || 1280;
            const height = win.height || 720;
            const left = Math.max(0, Math.round(((window.screen.availWidth || window.screen.width) - width) / 2));
            const top = Math.max(0, Math.round(((window.screen.availHeight || window.screen.height) - height) / 2));
            win.moveTo(left, top);
        } catch (error) {
            // Centering is a startup nicety; never block app load.
        }
    }

    isWineRuntime() {
        if (typeof process === 'undefined' || process.platform !== 'win32') return false;

        const env = process.env || {};
        if (env.WINEPREFIX || env.WINEARCH || env.WINELOADERNOEXEC || env.WINESERVER || env.WINEDEBUG || env.WINEESYNC || env.WINEFSYNC ||
            env.STEAM_COMPAT_DATA_PATH || env.STEAM_COMPAT_CLIENT_INSTALL_PATH || env.PROTONPATH || env.PROTON_LOG || env.SteamGameId) {
            return true;
        }

        try {
            const fs = require('fs');
            if (fs.existsSync('Z:\\proc\\version') || fs.existsSync('Z:\\usr\\bin\\wine')) {
                return true;
            }
        } catch (error) {
            // Try the Wine registry keys below.
        }

        try {
            const { execFileSync } = require('child_process');
            const options = { stdio: 'ignore', windowsHide: true, timeout: 1000 };
            execFileSync('reg', ['query', 'HKCU\\Software\\Wine'], options);
            return true;
        } catch (error) {
            try {
                const { execFileSync } = require('child_process');
                execFileSync('reg', ['query', 'HKLM\\Software\\Wine'], { stdio: 'ignore', windowsHide: true, timeout: 1000 });
                return true;
            } catch (innerError) {
                return false;
            }
        }
    }

    isFramelessCompatibilityMode() {
        try {
            const params = new URLSearchParams(window.location.search);
            return params.get('rrFrameless') === '1' || params.get('rrWineFrame') === '0';
        } catch (error) {
            return false;
        }
    }

    applyCompatibilityWindowFixes() {
        if (typeof nw === 'undefined') return;

        const framelessCompatibility = this.isFramelessCompatibilityMode();
        const wineRuntime = this.isWineRuntime();
        if (!framelessCompatibility && !wineRuntime) return;

        try {
            if (wineRuntime) document.documentElement.classList.add('rr-wine-runtime');
            if (framelessCompatibility) {
                document.documentElement.classList.add('rr-frameless-runtime');
                this.installCompatibilityTitlebar();
            }
        } catch (error) {
            // Non-critical visual hint only.
        }

        try {
            const win = nw.Window.get();

            // Wine/Proton can expose an empty native menu band in NW.js Windows builds.
            // That shifts painting without shifting hit-testing, so mouse clicks
            // land one title/menu-bar height away from the visible controls.
            try { win.menu = null; } catch (error) {}
            try { win.setShowInTaskbar(true); } catch (error) {}
        } catch (error) {
            // Running under Wine should not prevent the app from loading.
        }
    }

    relaunchFramelessForWine() {
        if (!this.isWineRuntime() || typeof nw === 'undefined') return false;

        try {
            const params = new URLSearchParams(window.location.search);
            if (params.get('rrFrameless') === '1' || params.get('rrWineFrame') === '0') return false;

            params.set('rrWineFrame', '0');
            params.set('rrFrameless', '1');
            const url = new URL(window.location.href);
            url.search = params.toString();

            const current = nw.Window.get();
            const options = {
                frame: false,
                toolbar: false,
                show: true,
                width: current.width || 1280,
                height: current.height || 720,
                min_width: 1280,
                min_height: 720,
                position: 'center',
                resizable: true,
                icon: 'images/icon.png'
            };

            nw.Window.open(url.toString(), options, () => {
                try { current.close(true); } catch (error) {}
            });

            return true;
        } catch (error) {
            return false;
        }
    }

    installCompatibilityTitlebar() {
        if (document.getElementById('compat-titlebar')) return;

        const titlebar = document.createElement('div');
        titlebar.id = 'compat-titlebar';
        titlebar.innerHTML = `
            <div class="compat-titlebar-icon"><img src="images/icon.png" alt=""></div>
            <div class="compat-titlebar-title">RPG Reactor | Reactor One</div>
            <div class="compat-titlebar-controls">
                <button type="button" data-window-action="minimize" title="Minimize">&minus;</button>
                <button type="button" data-window-action="maximize" title="Maximize">□</button>
                <button type="button" data-window-action="close" title="Close">×</button>
            </div>
        `;

        document.body.insertBefore(titlebar, document.body.firstChild);

        const win = nw.Window.get();
        titlebar.querySelector('[data-window-action="minimize"]').addEventListener('click', () => win.minimize());
        titlebar.querySelector('[data-window-action="maximize"]').addEventListener('click', () => {
            try {
                if (this.compatWindowRestoreBounds) {
                    const bounds = this.compatWindowRestoreBounds;
                    this.compatWindowRestoreBounds = null;
                    win.moveTo(bounds.x, bounds.y);
                    win.resizeTo(bounds.width, bounds.height);
                    return;
                }

                this.compatWindowRestoreBounds = {
                    x: win.x,
                    y: win.y,
                    width: win.width,
                    height: win.height
                };

                const screenLeft = typeof window.screen.availLeft === 'number' ? window.screen.availLeft : 0;
                const screenTop = typeof window.screen.availTop === 'number' ? window.screen.availTop : 0;
                win.moveTo(screenLeft, screenTop);
                win.resizeTo(window.screen.availWidth, window.screen.availHeight);
            } catch (error) {
                // Avoid native maximize under Proton; it can reintroduce a host titlebar.
            }
        });
        titlebar.querySelector('[data-window-action="close"]').addEventListener('click', () => {
            this.projectController.requestApplicationClose();
        });
    }
}

// Initialize the application
const reactor = new RPGReactor();

// Make reactor globally accessible for subsystems that need it
window.reactor = reactor;
