// RPG Reactor - UI Manager
// Handles UI initialization, menus, keyboard shortcuts, and UI state management

class UIManager {
    constructor(callbacks) {
        // Callbacks to main app
        this.callbacks = callbacks;
        this.projectLoaded = false;
    }

    setupEventHandlers() {
        // Welcome screen buttons
        const welcomeButtons = document.querySelectorAll('.welcome-button');
        welcomeButtons.forEach(button => {
            button.addEventListener('click', (e) => {
                const action = e.currentTarget.getAttribute('data-action');
                if (action === 'new-project') {
                    this.callbacks.newProject();
                } else if (action === 'open-project') {
                    this.callbacks.openProject();
                }
            });
        });

        // Toolbar buttons
        const toolButtons = document.querySelectorAll('.tool-button');
        toolButtons.forEach(button => {
            button.addEventListener('click', (e) => {
                const action = e.currentTarget.getAttribute('data-action');
                const tool = e.currentTarget.getAttribute('data-tool');
                const layer = e.currentTarget.getAttribute('data-layer');

                if (action) {
                    this.handleToolbarAction(action);
                } else if (tool) {
                    this.setDrawTool(tool);
                } else if (layer !== null) {
                    this.setLayerMode(layer);
                }
            });
        });

        // Sidebar tree items - delegate event to handle dynamically added items
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('tree-item')) {
                document.querySelectorAll('.tree-item').forEach(i => i.classList.remove('selected'));
                e.target.classList.add('selected');
            }
        });

        // HTML Menu Bar - Setup dropdown behavior
        const menuItems = document.querySelectorAll('.html-menu-item');
        menuItems.forEach(item => {
            item.addEventListener('click', (e) => {
                const menuName = item.getAttribute('data-menu');
                const submenu = document.getElementById(`submenu-${menuName}`);

                // Close all other submenus
                document.querySelectorAll('.html-submenu').forEach(sub => {
                    if (sub !== submenu) {
                        sub.style.display = 'none';
                    }
                });

                // Toggle this submenu
                if (submenu) {
                    submenu.style.display = submenu.style.display === 'none' ? 'block' : 'none';
                }
            });
        });

        // Close submenus when clicking outside the menu bar
        // Uses pointerdown + capture to fire before anything can swallow the event
        document.addEventListener('pointerdown', (e) => {
            if (!e.target.closest('#html-menu-bar')) {
                document.querySelectorAll('.html-submenu').forEach(sub => {
                    sub.style.display = 'none';
                });
            }
        }, true);

        // HTML Menu Bar - Handle menu option clicks
        document.addEventListener('click', (e) => {
            const option = e.target.closest('.html-menu-option');
            if (option) {
                const action = option.getAttribute('data-action');
                const db = option.getAttribute('data-db');

                // Close all submenus
                document.querySelectorAll('.html-submenu').forEach(sub => {
                    sub.style.display = 'none';
                });

                if (action) {
                    this.handleHtmlMenuAction(action);
                } else if (db) {
                    this.callbacks.openDatabase(db);
                }
            }
        });

        document.addEventListener('click', (e) => {
            const link = e.target.closest('a.external-link');
            if (!link) return;
            const href = link.getAttribute('href');
            if (!href) return;
            if (typeof nw !== 'undefined' && nw.Shell?.openExternal) {
                e.preventDefault();
                nw.Shell.openExternal(href);
            }
        });
    }

    handleHtmlMenuAction(action) {
        switch(action) {
            case 'new-project':
                this.callbacks.newProject();
                break;
            case 'open-project':
                this.callbacks.openProject();
                break;
            case 'close-project':
                this.callbacks.closeProject();
                break;
            case 'exit':
                if (typeof nw !== 'undefined') {
                    nw.App.quit();
                }
                break;
            case 'options':
                if (this.callbacks.showOptions) {
                    this.callbacks.showOptions();
                }
                break;
            case 'forge-launcher':
                if (this.callbacks.showForgeLauncher) {
                    this.callbacks.showForgeLauncher();
                }
                break;
            case 'forge-character-generator':
                if (this.callbacks.openForgeTool) {
                    this.callbacks.openForgeTool('character-generator');
                }
                break;
            case 'forge-animation-generator':
                if (this.callbacks.openForgeTool) {
                    this.callbacks.openForgeTool('animation-generator');
                }
                break;
            case 'forge-sound-effect-generator':
                if (this.callbacks.openForgeTool) {
                    this.callbacks.openForgeTool('sound-effect-generator');
                }
                break;
            case 'forge-effekseer-generator':
                if (this.callbacks.openForgeTool) {
                    this.callbacks.openForgeTool('effekseer-generator');
                }
                break;
            case 'manage-plugins':
                if (this.callbacks.showPluginManager) {
                    this.callbacks.showPluginManager();
                }
                break;
            case 'audio-player':
                this.callbacks.showAudioPlayer();
                break;
            case 'toggle-event-mode':
                if (this.callbacks.toggleEventMode) {
                    this.callbacks.toggleEventMode();
                }
                break;
            case 'devtools':
                if (typeof nw !== 'undefined') {
                    const win = nw.Window.get();
                    if (typeof win.isDevToolsOpen === 'function' && win.isDevToolsOpen()) {
                        win.closeDevTools();
                    } else {
                        win.showDevTools();
                    }
                }
                break;
            case 'about':
                this.callbacks.showAbout();
                break;
            case 'build-deployment':
                if (this.callbacks.openBuildManager) {
                    this.callbacks.openBuildManager();
                }
                break;
            case 'dist-editor':
                if (this.callbacks.openDistEditor) {
                    this.callbacks.openDistEditor();
                }
                break;
        }
    }

    setupNativeMenu() {
        // Native menus are broken on Linux - using HTML menu bar instead
        return;

        /* DISABLED - Native menu doesn't work on Linux
        if (typeof nw === 'undefined') return;

        const menubar = new nw.Menu({ type: 'menubar' });

        // File menu
        const fileMenu = new nw.Menu();
        fileMenu.append(new nw.MenuItem({
            label: 'New Project',
            click: () => this.callbacks.newProject()
        }));
        fileMenu.append(new nw.MenuItem({
            label: 'Open Project',
            click: () => this.callbacks.openProject()
        }));
        fileMenu.append(new nw.MenuItem({ type: 'separator' }));
        fileMenu.append(new nw.MenuItem({
            label: 'Close Project',
            click: () => this.callbacks.closeProject()
        }));
        fileMenu.append(new nw.MenuItem({ type: 'separator' }));
        fileMenu.append(new nw.MenuItem({
            label: 'Exit',
            click: () => nw.App.quit()
        }));

        menubar.append(new nw.MenuItem({
            label: 'File',
            submenu: fileMenu
        }));

        // Edit menu (only shown when project loaded)
        const editMenu = new nw.Menu();
        editMenu.append(new nw.MenuItem({
            label: 'Undo',
            click: () => console.log('Undo')
        }));
        editMenu.append(new nw.MenuItem({
            label: 'Redo',
            click: () => console.log('Redo')
        }));

        menubar.append(new nw.MenuItem({
            label: 'Edit',
            submenu: editMenu
        }));

        // Database menu
        const databaseMenu = new nw.Menu();
        databaseMenu.append(new nw.MenuItem({
            label: 'Actors',
            click: () => this.callbacks.openDatabase('actors')
        }));
        databaseMenu.append(new nw.MenuItem({
            label: 'Classes',
            click: () => this.callbacks.openDatabase('classes')
        }));
        databaseMenu.append(new nw.MenuItem({
            label: 'Skills',
            click: () => this.callbacks.openDatabase('skills')
        }));
        databaseMenu.append(new nw.MenuItem({
            label: 'Items',
            click: () => this.callbacks.openDatabase('items')
        }));
        databaseMenu.append(new nw.MenuItem({
            label: 'Weapons',
            click: () => this.callbacks.openDatabase('weapons')
        }));
        databaseMenu.append(new nw.MenuItem({
            label: 'Armors',
            click: () => this.callbacks.openDatabase('armors')
        }));
        databaseMenu.append(new nw.MenuItem({ type: 'separator' }));
        databaseMenu.append(new nw.MenuItem({
            label: 'Enemies',
            click: () => this.callbacks.openDatabase('enemies')
        }));
        databaseMenu.append(new nw.MenuItem({
            label: 'Troops',
            click: () => this.callbacks.openDatabase('troops')
        }));
        databaseMenu.append(new nw.MenuItem({
            label: 'States',
            click: () => this.callbacks.openDatabase('states')
        }));
        databaseMenu.append(new nw.MenuItem({ type: 'separator' }));
        databaseMenu.append(new nw.MenuItem({
            label: 'Animations',
            click: () => this.callbacks.openDatabase('animations')
        }));
        databaseMenu.append(new nw.MenuItem({
            label: 'Tilesets',
            click: () => this.callbacks.openDatabase('tilesets')
        }));
        databaseMenu.append(new nw.MenuItem({
            label: 'Common Events',
            click: () => this.callbacks.openDatabase('commonEvents')
        }));
        databaseMenu.append(new nw.MenuItem({ type: 'separator' }));
        databaseMenu.append(new nw.MenuItem({
            label: 'System 1',
            click: () => this.callbacks.openDatabase('system1')
        }));
        databaseMenu.append(new nw.MenuItem({
            label: 'System 2',
            click: () => this.callbacks.openDatabase('system2')
        }));
        databaseMenu.append(new nw.MenuItem({
            label: 'Types',
            click: () => this.callbacks.openDatabase('types')
        }));
        databaseMenu.append(new nw.MenuItem({
            label: 'Terms',
            click: () => this.callbacks.openDatabase('terms')
        }));

        menubar.append(new nw.MenuItem({
            label: 'Database',
            submenu: databaseMenu
        }));

        // Tools menu
        const toolsMenu = new nw.Menu();
        toolsMenu.append(new nw.MenuItem({
            label: '♪ Audio Player',
            click: () => this.callbacks.showAudioPlayer()
        }));

        menubar.append(new nw.MenuItem({
            label: 'Tools',
            submenu: toolsMenu
        }));

        // Help menu
        const helpMenu = new nw.Menu();
        helpMenu.append(new nw.MenuItem({
            label: 'Developer Tools',
            click: () => {
                const win = nw.Window.get();
                if (win.isDevToolsOpen()) {
                    win.closeDevTools();
                } else {
                    win.showDevTools();
                }
            }
        }));
        helpMenu.append(new nw.MenuItem({ type: 'separator' }));
        helpMenu.append(new nw.MenuItem({
            label: 'About RPG Reactor',
            click: () => this.callbacks.showAbout()
        }));

        menubar.append(new nw.MenuItem({
            label: 'Help',
            submenu: helpMenu
        }));

        // DEBUG MENU - Simple test menu
        const debugMenu = new nw.Menu();
        debugMenu.append(new nw.MenuItem({
            label: 'Test Alert',
            click: function() {
                alert('Debug menu item clicked!');
            }
        }));
        debugMenu.append(new nw.MenuItem({
            label: 'Test Console Log',
            click: function() {
                console.log('!!!!! DEBUG MENU CONSOLE LOG !!!!!');
            }
        }));
        debugMenu.append(new nw.MenuItem({
            label: 'Test Both',
            click: function() {
                console.log('!!!!! DEBUG BOTH TEST !!!!!');
                alert('Both console and alert!');
            }
        }));

        menubar.append(new nw.MenuItem({
            label: 'DEBUG',
            submenu: debugMenu
        }));

        nw.Window.get().menu = menubar;
        console.log('Menu setup complete - DEBUG menu should be visible');
        */
    }

    setupKeyboardShortcuts() {
        if (typeof nw === 'undefined') return;

        // Keyboard shortcuts
        window.addEventListener('keydown', (e) => {
            // F12 - Toggle developer tools
            if (e.keyCode === 123 || e.key === 'F12') { // 123 is keyCode for F12
                e.preventDefault();
                e.stopPropagation();
                const win = nw.Window.get();
                try {
                    if (typeof win.isDevToolsOpen === 'function' && win.isDevToolsOpen()) {
                        win.closeDevTools();
                    } else {
                        win.showDevTools();
                    }
                } catch (err) {
                    // Fallback: just toggle dev tools
                    win.showDevTools();
                }
                return false;
            }

            // Database and modal editors own their shortcuts. Do not let map/event
            // shortcuts bleed into them from this global capture handler.
            if (this.isEditorModalOpenForGlobalShortcuts()) {
                return;
            }

            // Ctrl+Z - Undo (only when not in a text input)
            if (e.ctrlKey && e.key === 'z' && !e.shiftKey) {
                const activeElement = document.activeElement;
                const isTextInput = activeElement && (
                    activeElement.tagName === 'INPUT' ||
                    activeElement.tagName === 'TEXTAREA' ||
                    activeElement.isContentEditable
                );

                if (!isTextInput) {
                    e.preventDefault();

                    // Check if event mode is active
                    if (this.callbacks.getEventManager) {
                        const eventManager = this.callbacks.getEventManager();
                        if (eventManager && eventManager.eventMode && eventManager.canUndo()) {
                            eventManager.undo();
                            return;
                        }
                    }

                    // Otherwise use map editor undo
                    if (this.callbacks.getMapEditor) {
                        const mapEditor = this.callbacks.getMapEditor();
                        if (mapEditor && mapEditor.canUndo()) {
                            mapEditor.undo();
                        }
                    }
                }
            }

            // Ctrl+Y or Ctrl+Shift+Z - Redo (only when not in a text input)
            if ((e.ctrlKey && e.key === 'y') || (e.ctrlKey && e.shiftKey && e.key === 'z')) {
                const activeElement = document.activeElement;
                const isTextInput = activeElement && (
                    activeElement.tagName === 'INPUT' ||
                    activeElement.tagName === 'TEXTAREA' ||
                    activeElement.isContentEditable
                );

                if (!isTextInput) {
                    e.preventDefault();

                    // Check if event mode is active
                    if (this.callbacks.getEventManager) {
                        const eventManager = this.callbacks.getEventManager();
                        if (eventManager && eventManager.eventMode && eventManager.canRedo()) {
                            eventManager.redo();
                            return;
                        }
                    }

                    // Otherwise use map editor redo
                    if (this.callbacks.getMapEditor) {
                        const mapEditor = this.callbacks.getMapEditor();
                        if (mapEditor && mapEditor.canRedo()) {
                            mapEditor.redo();
                        }
                    }
                }
            }

            // Ctrl+C - Copy event (only in event mode)
            if (e.ctrlKey && e.key === 'c') {
                const activeElement = document.activeElement;
                const isTextInput = activeElement && (
                    activeElement.tagName === 'INPUT' ||
                    activeElement.tagName === 'TEXTAREA' ||
                    activeElement.isContentEditable
                );

                if (!isTextInput) {
                    const eventManager = this.callbacks.getEventManager ? this.callbacks.getEventManager() : null;
                    const selectedMap = document.querySelector('#maps-list .tree-item.selected[data-map-id]');
                    if ((!eventManager || !eventManager.eventMode) && selectedMap && window.reactor?.projectController?.copyMap) {
                        e.preventDefault();
                        window.reactor.projectController.copyMap(parseInt(selectedMap.getAttribute('data-map-id')));
                        return;
                    }
                }

                if (!isTextInput && this.callbacks.getEventManager) {
                    const eventManager = this.callbacks.getEventManager();
                    if (eventManager && eventManager.eventMode && eventManager.selectedEvent) {
                        e.preventDefault();
                        eventManager.copyEvent(eventManager.selectedEvent);
                    }
                }
            }

            // Ctrl+X - Cut event (only in event mode)
            if (e.ctrlKey && e.key === 'x') {
                const activeElement = document.activeElement;
                const isTextInput = activeElement && (
                    activeElement.tagName === 'INPUT' ||
                    activeElement.tagName === 'TEXTAREA' ||
                    activeElement.isContentEditable
                );

                // Check if event editor is open (don't intercept Ctrl+X)
                const ctxModal = document.getElementById('event-editor-modal');
                const eventEditorOpen = ctxModal && ctxModal.style.display !== 'none';

                if (!isTextInput && !eventEditorOpen) {
                    const eventManager = this.callbacks.getEventManager ? this.callbacks.getEventManager() : null;
                    const selectedMap = document.querySelector('#maps-list .tree-item.selected[data-map-id]');
                    if ((!eventManager || !eventManager.eventMode) && selectedMap && window.reactor?.projectController?.copyMap) {
                        e.preventDefault();
                        window.reactor.projectController.copyMap(parseInt(selectedMap.getAttribute('data-map-id')));
                        return;
                    }
                }

                if (!isTextInput && !eventEditorOpen && this.callbacks.getEventManager) {
                    const eventManager = this.callbacks.getEventManager();
                    if (eventManager && eventManager.eventMode && eventManager.selectedEvent) {
                        e.preventDefault();
                        eventManager.cutEvent(eventManager.selectedEvent);
                    }
                }
            }

            // Ctrl+V - Paste event (only in event mode)
            if (e.ctrlKey && e.key === 'v') {
                const activeElement = document.activeElement;
                const isTextInput = activeElement && (
                    activeElement.tagName === 'INPUT' ||
                    activeElement.tagName === 'TEXTAREA' ||
                    activeElement.isContentEditable
                );

                // Check if event editor is open (don't intercept Ctrl+V)
                const pasteModal = document.getElementById('event-editor-modal');
                const eventEditorOpenForPaste = pasteModal && pasteModal.style.display !== 'none';

                if (!isTextInput && !eventEditorOpenForPaste && this.callbacks.getEventManager) {
                    const eventManager = this.callbacks.getEventManager();
                    if (eventManager && eventManager.eventMode) {
                        e.preventDefault();
                        // Paste at selected tile position or selected event position
                        const x = eventManager.selectedTileX !== null ? eventManager.selectedTileX :
                                  (eventManager.selectedEvent ? eventManager.selectedEvent.x : 0);
                        const y = eventManager.selectedTileY !== null ? eventManager.selectedTileY :
                                  (eventManager.selectedEvent ? eventManager.selectedEvent.y : 0);
                        eventManager.pasteEvent(x, y);
                        return;
                    }
                }

                if (!isTextInput && !eventEditorOpenForPaste && window.reactor?.projectController?.pasteMap) {
                    e.preventDefault();
                    window.reactor.projectController.pasteMap();
                }
            }

            // Delete - Delete event (only in event mode)
            if (e.key === 'Delete') {
                const activeElement = document.activeElement;
                const isTextInput = activeElement && (
                    activeElement.tagName === 'INPUT' ||
                    activeElement.tagName === 'TEXTAREA' ||
                    activeElement.isContentEditable
                );

                // Check if event editor is open (don't intercept Delete key)
                const delModal = document.getElementById('event-editor-modal');
                const eventEditorOpen = delModal && delModal.style.display !== 'none';

                if (!isTextInput && !eventEditorOpen && this.callbacks.getEventManager) {
                    const eventManager = this.callbacks.getEventManager();
                    if (eventManager && eventManager.eventMode && eventManager.selectedEvent) {
                        e.preventDefault();
                        eventManager.deleteEvent(eventManager.selectedEvent);
                        return;
                    }

                    const selectedMap = document.querySelector('#maps-list .tree-item.selected[data-map-id], #quick-access-list .tree-item.selected[data-map-id]');
                    if ((!eventManager || !eventManager.eventMode) && selectedMap && window.reactor?.projectController?.deleteMap) {
                        e.preventDefault();
                        window.reactor.projectController.deleteMap(parseInt(selectedMap.getAttribute('data-map-id'), 10));
                    }
                } else if (!isTextInput && !eventEditorOpen) {
                    const selectedMap = document.querySelector('#maps-list .tree-item.selected[data-map-id], #quick-access-list .tree-item.selected[data-map-id]');
                    if (selectedMap && window.reactor?.projectController?.deleteMap) {
                        e.preventDefault();
                        window.reactor.projectController.deleteMap(parseInt(selectedMap.getAttribute('data-map-id'), 10));
                    }
                }
            }
        }, true); // Use capture phase
    }

    isEditorModalOpenForGlobalShortcuts() {
        const databaseViewer = document.getElementById('database-viewer');
        if (databaseViewer && databaseViewer.classList.contains('active')) {
            return true;
        }

        const modalIds = [
            'map-properties-modal',
            'image-picker-modal',
            'audio-player-modal',
            'plugin-manager-modal'
        ];

        return modalIds.some(id => {
            const modal = document.getElementById(id);
            return modal && modal.style.display && modal.style.display !== 'none';
        });
    }

    handleToolbarAction(action) {
        switch(action) {
            case 'new-project':
                this.callbacks.newProject();
                break;
            case 'open-project':
                this.callbacks.openProject();
                break;
            case 'save':
                this.callbacks.saveProject();
                break;
            case 'undo':
                // Check if event mode is active
                if (this.callbacks.getEventManager) {
                    const eventManager = this.callbacks.getEventManager();
                    if (eventManager && eventManager.eventMode) {
                        eventManager.undo();
                        break;
                    }
                }
                // Otherwise use map editor undo
                if (this.callbacks.getMapEditor) {
                    const mapEditor = this.callbacks.getMapEditor();
                    if (mapEditor) {
                        mapEditor.undo();
                    }
                }
                break;
            case 'redo':
                // Check if event mode is active
                if (this.callbacks.getEventManager) {
                    const eventManager = this.callbacks.getEventManager();
                    if (eventManager && eventManager.eventMode) {
                        eventManager.redo();
                        break;
                    }
                }
                // Otherwise use map editor redo
                if (this.callbacks.getMapEditor) {
                    const mapEditor = this.callbacks.getMapEditor();
                    if (mapEditor) {
                        mapEditor.redo();
                    }
                }
                break;
            case 'playtest':
                this.callbacks.playtest();
                break;
            case 'open-database':
                // Open database menu with Actors as default
                this.callbacks.openDatabase('actors');
                break;
            case 'open-plugins':
                // Open plugins manager
                if (this.callbacks.showPluginManager) {
                    this.callbacks.showPluginManager();
                }
                break;
            case 'audio-player':
                this.callbacks.showAudioPlayer();
                break;
            case 'forge-launcher':
                if (this.callbacks.showForgeLauncher) {
                    this.callbacks.showForgeLauncher();
                }
                break;
            case 'eraser':
                // Disable event mode if active (switching to tileset mode)
                if (this.callbacks.disableEventModeIfActive) {
                    this.callbacks.disableEventModeIfActive();
                }

                if (this.callbacks.getMapEditor) {
                    const mapEditor = this.callbacks.getMapEditor();
                    if (mapEditor) {
                        const isEraser = !mapEditor.eraserMode;

                        // Deactivate shadow pen when enabling eraser
                        if (isEraser && mapEditor.shadowPenMode) {
                            mapEditor.setShadowPenMode(false);
                        }

                        mapEditor.setEraserMode(isEraser);
                        // Update button visual state
                        const eraserBtn = document.querySelector('[data-action="eraser"]');
                        if (eraserBtn) {
                            if (isEraser) {
                                eraserBtn.classList.add('active');
                            } else {
                                eraserBtn.classList.remove('active');
                            }
                        }
                    }
                }
                break;
            case 'shadow-pen':
                if (this.callbacks.disableEventModeIfActive) {
                    this.callbacks.disableEventModeIfActive();
                }

                if (this.callbacks.getMapEditor) {
                    const mapEditor = this.callbacks.getMapEditor();
                    if (mapEditor) {
                        const isShadowPen = !mapEditor.shadowPenMode;
                        mapEditor.setShadowPenMode(isShadowPen);
                    }
                }
                break;
            case 'toggle-event-mode':
                if (this.callbacks.toggleEventMode) {
                    this.callbacks.toggleEventMode();
                }
                break;
        }
    }

    setDrawTool(tool) {
        if (!this.callbacks.getMapEditor) return;

        // Disable event mode if active (switching to tileset mode)
        if (this.callbacks.disableEventModeIfActive) {
            this.callbacks.disableEventModeIfActive();
        }

        const mapEditor = this.callbacks.getMapEditor();
        if (!mapEditor) return;

        // Deactivate shadow pen when switching to a drawing tool
        if (mapEditor.shadowPenMode) {
            mapEditor.setShadowPenMode(false);
        }

        mapEditor.setTool(tool);

        // Update button visual states
        document.querySelectorAll('.tool-draw-mode').forEach(btn => {
            btn.classList.remove('active');
        });

        const activeBtn = document.querySelector(`[data-tool="${tool}"]`);
        if (activeBtn) {
            activeBtn.classList.add('active');
        }
    }

    setLayerMode(layer) {
        if (!this.callbacks.getMapEditor) return;

        // Disable event mode if active (switching to tileset mode)
        if (this.callbacks.disableEventModeIfActive) {
            this.callbacks.disableEventModeIfActive();
        }

        const mapEditor = this.callbacks.getMapEditor();
        if (!mapEditor) return;

        // Convert layer string to appropriate value
        const layerValue = layer === 'auto' ? 'auto' : parseInt(layer);
        mapEditor.setLayerMode(layerValue);

        // Update button visual states
        document.querySelectorAll('.layer-mode').forEach(btn => {
            btn.classList.remove('active');
        });

        const activeBtn = document.querySelector(`[data-layer="${layer}"]`);
        if (activeBtn) {
            activeBtn.classList.add('active');
        }
    }

    updateUndoRedoButtons(canUndo, canRedo) {
        const undoBtn = document.getElementById('undo-btn');
        const redoBtn = document.getElementById('redo-btn');

        if (undoBtn) {
            undoBtn.disabled = !canUndo;
            undoBtn.style.opacity = canUndo ? '1.0' : '0.5';
        }

        if (redoBtn) {
            redoBtn.disabled = !canRedo;
            redoBtn.style.opacity = canRedo ? '1.0' : '0.5';
        }
    }

    showWelcomeScreen() {
        document.getElementById('welcome-screen').style.display = 'flex';
        document.getElementById('editor-ui').style.display = 'none';
        document.getElementById('toolbar').style.display = 'none';
        this.projectLoaded = false;
    }

    showEditorUI() {
        document.getElementById('welcome-screen').style.display = 'none';
        document.getElementById('editor-ui').style.display = 'flex';
        document.getElementById('toolbar').style.display = 'flex';
        this.projectLoaded = true;

        // Scale toolbar icons after toolbar becomes visible
        requestAnimationFrame(() => {
            if (window.reactor) {
                window.reactor.scaleToolbarIcons();
            }
        });
    }

    updateStatus(message) {
        // Status bar removed - status updates are visual only
    }
}
