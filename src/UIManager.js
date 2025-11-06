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
                const action = e.target.getAttribute('data-action');
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
                const action = e.target.getAttribute('data-action');
                const tool = e.target.getAttribute('data-tool');

                if (action) {
                    this.handleToolbarAction(action);
                } else if (tool) {
                    this.setDrawTool(tool);
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
    }

    setupNativeMenu() {
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
            label: 'System',
            click: () => this.callbacks.openDatabase('system')
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

        nw.Window.get().menu = menubar;
    }

    setupKeyboardShortcuts() {
        if (typeof nw === 'undefined') return;

        // F12 - Toggle developer tools
        window.addEventListener('keydown', (e) => {
            if (e.keyCode === 123 || e.key === 'F12') { // 123 is keyCode for F12
                e.preventDefault();
                e.stopPropagation();
                const win = nw.Window.get();
                if (win.isDevToolsOpen()) {
                    win.closeDevTools();
                } else {
                    win.showDevTools();
                }
                return false;
            }
        }, true); // Use capture phase
    }

    handleToolbarAction(action) {
        console.log('Toolbar action:', action);

        switch(action) {
            case 'save':
                this.callbacks.saveProject();
                break;
            case 'save-all':
                this.callbacks.saveAll();
                break;
            case 'playtest':
                this.callbacks.playtest();
                break;
            case 'eraser':
                if (this.callbacks.getMapEditor) {
                    const mapEditor = this.callbacks.getMapEditor();
                    if (mapEditor) {
                        const isEraser = !mapEditor.eraserMode;
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
        }
    }

    setDrawTool(tool) {
        if (!this.callbacks.getMapEditor) return;

        const mapEditor = this.callbacks.getMapEditor();
        if (!mapEditor) return;

        mapEditor.setTool(tool);

        // Update button visual states
        document.querySelectorAll('.tool-draw-mode').forEach(btn => {
            btn.classList.remove('active');
        });

        const activeBtn = document.querySelector(`[data-tool="${tool}"]`);
        if (activeBtn) {
            activeBtn.classList.add('active');
        }

        console.log(`Draw tool set to: ${tool}`);
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
