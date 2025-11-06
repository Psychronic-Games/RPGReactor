// RPG Reactor - Project Controller
// Handles project lifecycle: creating, opening, saving, closing projects

class ProjectController {
    constructor(projectManager, databaseManager, uiManager) {
        this.projectManager = projectManager;
        this.databaseManager = databaseManager;
        this.uiManager = uiManager;
        this.currentProject = null;
        this.projectLoaded = false;

        // References to be set by main app
        this.app = null;
        this.tilemapManager = null;
        this.regionManager = null;
        this.mapEditor = null;
        this.tilesetPaletteViewer = null;
    }

    setRendererApp(app) {
        this.app = app;
    }

    async checkAutoLoadProject() {
        const lastProjectPath = localStorage.getItem('lastProjectPath');

        if (lastProjectPath && typeof nw !== 'undefined') {
            const fs = require('fs');

            // Check if the project path still exists
            if (fs.existsSync(lastProjectPath)) {
                console.log('Auto-loading last project:', lastProjectPath);
                this.uiManager.updateStatus('Loading last project...');

                // Load the project
                this.currentProject = await this.projectManager.loadProject(lastProjectPath);

                if (this.currentProject) {
                    await this.uiManager.showEditorUI();
                    this.uiManager.updateStatus('Opened project: ' + this.currentProject.name);
                    await this.populateProjectUI();
                } else {
                    console.log('Failed to auto-load project');
                    this.uiManager.updateStatus('Failed to load last project');
                }
            } else {
                console.log('Last project path no longer exists, clearing saved path');
                localStorage.removeItem('lastProjectPath');
            }
        }
    }

    closeProject() {
        if (!this.projectLoaded) return;

        // TODO: Add confirmation dialog if there are unsaved changes
        this.currentProject = null;

        // Don't clear the saved path - keep it for next session
        // localStorage.removeItem('lastProjectPath');

        this.uiManager.showWelcomeScreen();
        this.uiManager.updateStatus('Project closed');
        this.projectLoaded = false;
    }

    async newProject() {
        console.log('Creating new project...');
        if (typeof nw !== 'undefined') {
            // First, ask for project name
            const projectName = prompt('Enter project name:', 'My RPG Project');
            if (!projectName) return;

            // Use NW.js chooser for directory selection
            const chooser = document.createElement('input');
            chooser.setAttribute('type', 'file');
            chooser.setAttribute('nwdirectory', '');
            chooser.setAttribute('nwworkingdir', require('os').homedir());

            chooser.addEventListener('change', async (e) => {
                const basePath = chooser.value;
                if (basePath) {
                    this.uiManager.updateStatus('Creating project...');

                    // Create project in a subdirectory with the project name
                    const path = require('path');
                    const projectPath = path.join(basePath, projectName);

                    // Use ProjectManager to create the project
                    const success = await this.projectManager.createNewProject(projectPath, projectName);

                    if (success) {
                        // Load the newly created project
                        this.currentProject = await this.projectManager.loadProject(projectPath);
                        if (this.currentProject) {
                            // Save last opened project path
                            localStorage.setItem('lastProjectPath', projectPath);

                            await this.uiManager.showEditorUI();
                            this.uiManager.updateStatus('New project created: ' + projectName);
                            await this.populateProjectUI();
                        } else {
                            alert('Failed to load the newly created project');
                            this.uiManager.updateStatus('Error creating project');
                        }
                    } else {
                        alert('Failed to create project. Check console for details.');
                        this.uiManager.updateStatus('Error creating project');
                    }
                }
            });

            chooser.click();
        } else {
            // For testing without NW.js
            this.currentProject = { path: '/demo', name: 'Demo Project' };
            await this.uiManager.showEditorUI();
            this.uiManager.updateStatus('Demo project loaded');
            this.initializeNewProject();
        }
    }

    async openProject() {
        console.log('Opening project...');
        if (typeof nw !== 'undefined') {
            const input = document.createElement('input');
            input.setAttribute('type', 'file');
            input.setAttribute('nwdirectory', '');
            input.setAttribute('nwworkingdir', require('os').homedir());
            input.addEventListener('change', async (e) => {
                const projectPath = e.target.value;
                if (projectPath) {
                    this.uiManager.updateStatus('Loading project...');

                    // Use ProjectManager to load the project
                    this.currentProject = await this.projectManager.loadProject(projectPath);

                    if (this.currentProject) {
                        // Save last opened project path
                        localStorage.setItem('lastProjectPath', projectPath);

                        await this.uiManager.showEditorUI();
                        this.uiManager.updateStatus('Opened project: ' + this.currentProject.name);
                        await this.populateProjectUI();
                    } else {
                        alert('Failed to load project. Make sure it\'s a valid RPG Reactor or RPG Maker project.');
                        this.uiManager.updateStatus('Error loading project');
                    }
                }
            });
            input.click();
        } else {
            // For testing without NW.js
            this.currentProject = { path: '/demo', name: 'Demo Project', maps: [] };
            await this.uiManager.showEditorUI();
            this.uiManager.updateStatus('Demo project loaded');
            this.initializeNewProject();
        }
    }

    async populateProjectUI() {
        // Load database
        this.uiManager.updateStatus('Loading database...');
        const dbLoaded = await this.databaseManager.loadAllData(this.currentProject.path);

        if (!dbLoaded) {
            console.error('Failed to load database');
            this.uiManager.updateStatus('Error loading database');
            return;
        }

        // Initialize tilemap manager
        if (!this.tilemapManager) {
            this.tilemapManager = new TilemapManager(
                this.app,
                this.currentProject.path,
                this.databaseManager
            );

            // Initialize region manager
            this.regionManager = new RegionManager(this.tilemapManager);
        }

        // Populate maps list
        const mapsList = document.getElementById('maps-list');
        if (this.currentProject.maps && this.currentProject.maps.length > 0) {
            mapsList.innerHTML = '';
            this.currentProject.maps.forEach((map, index) => {
                if (map && map.id) {
                    const mapItem = document.createElement('div');
                    mapItem.className = 'tree-item';
                    mapItem.setAttribute('data-map-id', map.id);
                    mapItem.textContent = `${map.name || 'Unnamed Map'}`;

                    // Add click handler to load map
                    mapItem.addEventListener('click', () => {
                        this.loadMap(map.id);
                    });

                    mapsList.appendChild(mapItem);
                }
            });

            // Auto-load first map
            if (this.currentProject.maps[1]) {
                this.loadMap(this.currentProject.maps[1].id);
            }
        } else {
            mapsList.innerHTML = '<div class="tree-item">No maps yet</div>';
        }

        // Update window title
        if (typeof nw !== 'undefined') {
            nw.Window.get().title = `${this.currentProject.name} - RPG Reactor`;
        }

        this.uiManager.updateStatus('Project loaded successfully');
        this.projectLoaded = true;
    }

    initializeNewProject() {
        // Fallback for demo mode
        const mapsList = document.getElementById('maps-list');
        mapsList.innerHTML = `
            <div class="tree-item" data-map="MAP001">MAP001: Untitled Map</div>
        `;
    }

    async saveProject() {
        if (!this.projectLoaded || !this.currentProject) return;
        console.log('Saving project...');

        const success = await this.projectManager.saveProject(this.currentProject);
        if (success) {
            this.uiManager.updateStatus('Project saved');
        } else {
            this.uiManager.updateStatus('Error saving project');
        }
    }

    saveAll() {
        if (!this.projectLoaded) return;
        console.log('Saving all...');
        // TODO: Implement save all
        this.uiManager.updateStatus('All files saved');
    }

    async loadMap(mapId) {
        if (!this.tilemapManager) {
            console.error('Tilemap manager not initialized');
            return;
        }

        this.uiManager.updateStatus(`Loading map ${mapId}...`);

        const success = await this.tilemapManager.loadMap(mapId);

        if (success) {
            this.uiManager.updateStatus(`Map ${mapId} loaded`);

            // Highlight selected map in list
            document.querySelectorAll('[data-map-id]').forEach(item => {
                item.classList.remove('selected');
                if (parseInt(item.getAttribute('data-map-id')) === mapId) {
                    item.classList.add('selected');
                }
            });

            // This callback will be set by main app
            if (this.onMapLoaded) {
                this.onMapLoaded();
            }
        } else {
            this.uiManager.updateStatus(`Failed to load map ${mapId}`);
        }
    }

    getCurrentProject() {
        return this.currentProject;
    }

    isProjectLoaded() {
        return this.projectLoaded;
    }

    getTilemapManager() {
        return this.tilemapManager;
    }

    getRegionManager() {
        return this.regionManager;
    }

    getMapEditor() {
        return this.mapEditor;
    }

    setMapEditor(mapEditor) {
        this.mapEditor = mapEditor;
    }

    setTilesetPaletteViewer(viewer) {
        this.tilesetPaletteViewer = viewer;
    }
}
