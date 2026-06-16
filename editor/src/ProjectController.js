// RPG Reactor - Project Controller
// Handles project lifecycle: creating, opening, saving, closing projects

class ProjectController {
    constructor(projectManager, databaseManager, uiManager) {
        this.projectManager = projectManager;
        this.databaseManager = databaseManager;
        this.uiManager = uiManager;
        this.currentProject = null;
        this.projectLoaded = false;
        this.lastLoadedProjectPath = null; // Track which project components are loaded for
        this.projectLockPath = null;

        // References to be set by main app
        this.app = null;
        this.tilemapManager = null;
        this.regionManager = null;
        this.mapEditor = null;
        this.tilesetPaletteViewer = null;
        this.eventManager = null;

        if (typeof window !== 'undefined') {
            window.addEventListener('beforeunload', () => this.releaseProjectLock());
        }
    }

    getProjectLockPath(projectPath) {
        if (typeof nw === 'undefined') return null;
        const path = require('path');
        return path.join(projectPath, '.rpgreactor.lock');
    }

    isProcessRunning(pid) {
        if (!pid || typeof process === 'undefined') return false;
        try {
            process.kill(pid, 0);
            return true;
        } catch (error) {
            return error && error.code === 'EPERM';
        }
    }

    acquireProjectLock(projectPath) {
        if (typeof nw === 'undefined') return true;

        const fs = require('fs');
        const lockPath = this.getProjectLockPath(projectPath);

        try {
            if (fs.existsSync(lockPath)) {
                const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
                if (lock.pid && lock.pid !== process.pid && this.isProcessRunning(lock.pid)) {
                    alert(`This project is already open in another RPG Reactor instance.\n\n${projectPath}`);
                    this.uiManager.updateStatus('Project already open in another instance');
                    return false;
                }
            }

            const previousLockPath = this.projectLockPath;
            fs.writeFileSync(lockPath, JSON.stringify({
                app: 'RPG Reactor',
                pid: process.pid,
                openedAt: new Date().toISOString()
            }, null, 2));
            this.projectLockPath = lockPath;

            if (previousLockPath && previousLockPath !== lockPath) {
                this.releaseProjectLock(previousLockPath);
            }

            return true;
        } catch (error) {
            console.warn('Could not acquire project lock:', error);
            return true;
        }
    }

    releaseProjectLock(lockPath = this.projectLockPath) {
        if (!lockPath || typeof nw === 'undefined') return;

        try {
            const fs = require('fs');
            if (fs.existsSync(lockPath)) {
                const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
                if (!lock.pid || lock.pid === process.pid) {
                    fs.unlinkSync(lockPath);
                }
            }
        } catch (error) {
            console.warn('Could not release project lock:', error);
        }

        if (lockPath === this.projectLockPath) {
            this.projectLockPath = null;
        }
    }

    getLastMapStorageKey() {
        const projectPath = this.currentProject?.path || 'default';
        return `lastMapId:${encodeURIComponent(projectPath)}`;
    }

    setRendererApp(app) {
        this.app = app;
    }

    async checkAutoLoadProject() {
        const lastProjectPath = localStorage.getItem('lastProjectPath');

        if (!lastProjectPath) {
            return;
        }

        if (typeof nw === 'undefined') {
            return;
        }

        const fs = require('fs');

        // Check if the project path still exists
        if (!fs.existsSync(lastProjectPath)) {
            localStorage.removeItem('lastProjectPath');
            return;
        }

        this.uiManager.updateStatus('Loading last project...');

        try {
            // Load the project
            const loadedProject = await this.projectManager.loadProject(lastProjectPath);

            if (loadedProject && this.acquireProjectLock(loadedProject.path)) {
                this.currentProject = loadedProject;
                await this.uiManager.showEditorUI();
                this.uiManager.updateStatus('Opened project: ' + this.currentProject.name);
                await this.populateProjectUI();
            } else {
                this.uiManager.updateStatus('Failed to load last project');
            }
        } catch (error) {
            console.error(`Error loading last project at ${lastProjectPath}:`, error);
            this.uiManager.updateStatus('Error loading last project');
        }
    }

    closeProject() {
        if (!this.projectLoaded) return;

        // TODO: Add confirmation dialog if there are unsaved changes
        this.releaseProjectLock();
        this.currentProject = null;

        // Don't clear the saved path - keep it for next session
        // localStorage.removeItem('lastProjectPath');

        this.uiManager.showWelcomeScreen();
        this.uiManager.updateStatus('Project closed');
        this.projectLoaded = false;
    }

    async newProject() {
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
                        const loadedProject = await this.projectManager.loadProject(projectPath);
                        if (loadedProject && this.acquireProjectLock(loadedProject.path)) {
                            this.currentProject = loadedProject;
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
        if (typeof nw !== 'undefined') {
            const input = document.createElement('input');
            input.setAttribute('type', 'file');
            input.setAttribute('nwdirectory', '');
            input.setAttribute('nwworkingdir', require('os').homedir());
            input.addEventListener('change', async (e) => {
                const projectPath = input.value || e.target.value;
                if (projectPath) {
                    try {
                        this.uiManager.updateStatus('Loading project...');

                        // Use ProjectManager to load the project
                        const loadedProject = await this.projectManager.loadProject(projectPath);

                        if (loadedProject && this.acquireProjectLock(loadedProject.path)) {
                            this.currentProject = loadedProject;
                            // Save last opened project path
                            localStorage.setItem('lastProjectPath', projectPath);

                            await this.uiManager.showEditorUI();
                            this.uiManager.updateStatus('Opened project: ' + this.currentProject.name);
                            await this.populateProjectUI();
                        } else {
                            alert(`Failed to load project. Make sure it's a valid RPG Reactor or RPG Maker project.\n\n${projectPath}`);
                            this.uiManager.updateStatus('Error loading project');
                        }
                    } catch (error) {
                        console.error(`Error opening project at ${projectPath}:`, error);
                        alert(`Error opening project:\n${projectPath}\n\n${error.message || error}`);
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
            this.uiManager.updateStatus('Error loading database');
            return;
        }

        // Check if we've switched to a different project
        const projectHasChanged = this.lastLoadedProjectPath !== this.currentProject.path;

        // Initialize PIXI if not already done
        if (!this.app) {
            this.app = new PIXI.Application();
            const container = document.getElementById('canvas-container');

            // Get initial container size
            const rect = container.getBoundingClientRect();

            await this.app.init({
                backgroundColor: 0x111111,
                backgroundAlpha: 1,
                resolution: window.devicePixelRatio || 1,
                autoDensity: true,
                preference: 'webgl',
                antialias: false,
                roundPixels: true,  // PIXI8: Prevent sub-pixel rendering for crisp pixel art
                width: rect.width,
                height: rect.height
            });
            container.appendChild(this.app.canvas);
            this.app.canvas.style.display = 'block';
            this.app.canvas.style.imageRendering = 'pixelated';

            // Handle window resize
            window.addEventListener('resize', () => {
                const newRect = container.getBoundingClientRect();
                this.app.renderer.resize(newRect.width, newRect.height);
            });
        }

        // Initialize or recreate tilemap manager if project changed
        if (!this.tilemapManager || projectHasChanged) {
            // Clean up old TilemapManager before replacing it
            if (this.tilemapManager) {
                this.tilemapManager.destroy();
            }

            this.tilemapManager = new TilemapManager(
                this.app,
                this.currentProject.path,
                this.databaseManager
            );

            // PERFORMANCE: Wrap TilemapManager methods for profiling
            if (window.perfProfiler) {
                perfProfiler.wrapMethod(this.tilemapManager, 'renderTile', 'TilemapManager');
                perfProfiler.wrapMethod(this.tilemapManager, 'renderAutotile', 'TilemapManager');
                perfProfiler.wrapMethod(this.tilemapManager, 'renderShadowTile', 'TilemapManager');
                perfProfiler.wrapMethod(this.tilemapManager, 'updateA1Tiles', 'TilemapManager');
                perfProfiler.wrapMethod(this.tilemapManager, 'updateShadowTile', 'TilemapManager');
                perfProfiler.wrapMethod(this.tilemapManager, 'clearTileSpritesAt', 'TilemapManager');
                perfProfiler.wrapMethod(this.tilemapManager, 'getVisibleTileBounds', 'TilemapManager');
                perfProfiler.wrapMethod(this.tilemapManager, 'renderLayerHighlights', 'TilemapManager');
                perfProfiler.wrapMethod(this.tilemapManager, 'updateTiles', 'TilemapManager');
            }

            // Initialize region manager
            this.regionManager = new RegionManager(this.tilemapManager);

            // Update TilesetPaletteViewer project path if it exists
            if (this.tilesetPaletteViewer) {
                this.tilesetPaletteViewer.setProjectPath(this.currentProject.path);
            }

            // Note: MapEditor and EventManager will be reinitialized in the onMapLoaded callback
            // when a map loads, ensuring they get the new TilemapManager's container

            // Update the tracked project path
            this.lastLoadedProjectPath = this.currentProject.path;
        }

        // Add map search functionality
        this.setupMapSearch();

        // Populate maps list
        this.renderMapsList();

        // Auto-load last edited map or first map
        const lastMapId = localStorage.getItem(this.getLastMapStorageKey()) || localStorage.getItem('lastMapId');
        let mapToLoad = null;

        if (lastMapId && this.currentProject.maps.find(m => m && m.id === parseInt(lastMapId))) {
            mapToLoad = parseInt(lastMapId);
        } else if (this.currentProject.maps[1]) {
            mapToLoad = this.currentProject.maps[1].id;
        }

        if (mapToLoad) {
            const loaded = await this.loadMap(mapToLoad);
            if (!loaded) {
                for (const map of this.currentProject.maps) {
                    if (!map || map.id === mapToLoad) continue;
                    if (await this.loadMap(map.id)) break;
                }
            }
        }

        // Update window title
        if (typeof nw !== 'undefined') {
            const gameTitle = this.databaseManager.data.system?.gameTitle || this.currentProject.name;
            nw.Window.get().title = `RPG Reactor | ${gameTitle}`;
        }

        this.uiManager.updateStatus('Project loaded successfully');
        this.projectLoaded = true;

        // Notify audio player that project is loaded (via global reactor instance)
        if (window.reactor && window.reactor.audioPlayer) {
            window.reactor.audioPlayer.setCurrentProject(this.currentProject);
        }
    }

    // Set up map search functionality
    setupMapSearch() {
        const mapsList = document.getElementById('maps-list');
        if (!mapsList) return;

        // Check if search already exists
        if (document.getElementById('map-search-input')) return;

        // Create search container
        const searchContainer = document.createElement('div');
        searchContainer.style.cssText = `
            padding: 8px;
            background-color: var(--color-bg-list-item);
            border-bottom: 1px solid var(--color-border);
        `;

        const searchInput = document.createElement('input');
        searchInput.id = 'map-search-input';
        searchInput.type = 'text';
        searchInput.placeholder = 'Search maps...';
        searchInput.style.cssText = `
            width: 100%;
            padding: 6px 8px;
            background-color: var(--color-bg-input-alt);
            color: var(--color-text);
            border: 1px solid var(--color-border-input);
            border-radius: 3px;
            font-size: 12px;
            box-sizing: border-box;
        `;

        searchInput.addEventListener('input', (e) => {
            this.filterMaps(e.target.value);
        });

        searchContainer.appendChild(searchInput);
        mapsList.parentNode.insertBefore(searchContainer, mapsList);

        // Setup tab switching
        this.setupMapTabs();
    }

    // Setup tab switching for Map Tree and Quick Access
    setupMapTabs() {
        const mapTreeTab = document.getElementById('map-tree-tab');
        const quickAccessTab = document.getElementById('quick-access-tab');
        const mapsList = document.getElementById('maps-list');
        const quickAccessList = document.getElementById('quick-access-list');

        if (!mapTreeTab || !quickAccessTab || !mapsList || !quickAccessList) return;

        mapTreeTab.addEventListener('click', () => {
            mapTreeTab.classList.add('active');
            mapTreeTab.style.backgroundColor = 'var(--color-bg-surface)';
            mapTreeTab.style.color = 'var(--color-text)';
            quickAccessTab.classList.remove('active');
            quickAccessTab.style.backgroundColor = 'var(--color-bg-list-item)';
            quickAccessTab.style.color = 'var(--color-text-muted)';
            mapsList.style.display = 'block';
            quickAccessList.style.display = 'none';
        });

        quickAccessTab.addEventListener('click', () => {
            quickAccessTab.classList.add('active');
            quickAccessTab.style.backgroundColor = 'var(--color-bg-surface)';
            quickAccessTab.style.color = 'var(--color-text)';
            mapTreeTab.classList.remove('active');
            mapTreeTab.style.backgroundColor = 'var(--color-bg-list-item)';
            mapTreeTab.style.color = 'var(--color-text-muted)';
            quickAccessList.style.display = 'block';
            mapsList.style.display = 'none';
            this.renderQuickAccessList();
        });
    }

    // Filter maps based on search text
    filterMaps(searchText) {
        const mapItems = document.querySelectorAll('[data-map-id]');
        const lowerSearch = searchText.toLowerCase();

        mapItems.forEach(item => {
            const mapName = item.textContent.toLowerCase();
            if (mapName.includes(lowerSearch)) {
                item.style.display = 'block';
            } else {
                item.style.display = 'none';
            }
        });
    }

    // Render the maps list as hierarchical tree
    renderMapsList() {
        const mapsList = document.getElementById('maps-list');
        if (!mapsList) return;

        // Store the currently loaded map ID to re-highlight after render
        const currentMapId = this.tilemapManager?.currentMap?.id;

        // Save current scroll position
        const scrollTop = mapsList.scrollTop;

        if (this.currentProject.maps && this.currentProject.maps.length > 0) {
            mapsList.innerHTML = '';
            let selectedElement = null;

            // Build hierarchical tree starting from root (parentId = 0)
            const buildTree = (parentId, depth = 0) => {
                // Get all maps with this parentId, sorted by order
                const children = this.currentProject.maps
                    .map((map, index) => ({ ...map, index }))
                    .filter(map => map && map.id && map.parentId === parentId)
                    .sort((a, b) => (a.order || 0) - (b.order || 0));

                children.forEach(map => {
                    const mapItem = document.createElement('div');
                    mapItem.className = 'tree-item';
                    mapItem.setAttribute('data-map-id', map.id);
                    mapItem.setAttribute('draggable', 'true');
                    mapItem.style.paddingLeft = `${8 + depth * 16}px`;

                    // Check if this map has children
                    const hasChildren = this.currentProject.maps.some(m => m && m.parentId === map.id);

                    // Add expand/collapse icon if has children
                    if (hasChildren) {
                        const icon = document.createElement('span');
                        icon.className = 'tree-icon';
                        icon.textContent = map.expanded ? '▼ ' : '► ';
                        icon.style.cssText = 'cursor: pointer; user-select: none; margin-right: 4px;';
                        icon.addEventListener('click', (e) => {
                            e.stopPropagation();
                            this.toggleMapExpanded(map.id);
                        });
                        mapItem.appendChild(icon);
                    } else {
                        // Add spacing for alignment
                        const spacer = document.createElement('span');
                        spacer.textContent = '   ';
                        mapItem.appendChild(spacer);
                    }

                    // Add map name
                    const nameSpan = document.createElement('span');
                    nameSpan.textContent = map.name || 'Unnamed Map';
                    mapItem.appendChild(nameSpan);

                    // Highlight if this is the currently loaded map
                    if (currentMapId && map.id === currentMapId) {
                        mapItem.classList.add('selected');
                        selectedElement = mapItem;
                    }

                    // Add click handler to load map
                    mapItem.addEventListener('click', () => {
                        this.loadMap(map.id);
                    });

                    // Add right-click context menu handler
                    mapItem.addEventListener('contextmenu', (e) => {
                        e.preventDefault();
                        this.showMapContextMenu(e.pageX, e.pageY, map.id);
                    });

                    // Add drag and drop handlers
                    this.addMapDragHandlers(mapItem, map);

                    mapsList.appendChild(mapItem);

                    // Recursively build children if expanded
                    if (hasChildren && map.expanded) {
                        buildTree(map.id, depth + 1);
                    }
                });
            };

            // Start building from root level (parentId = 0)
            buildTree(0);

            // Scroll to the selected element to keep it visible
            if (selectedElement) {
                // Use setTimeout to ensure DOM has updated
                setTimeout(() => {
                    selectedElement.scrollIntoView({
                        behavior: 'auto',
                        block: 'nearest',
                        inline: 'nearest'
                    });
                }, 0);
            } else {
                // No selected element, restore previous scroll position
                mapsList.scrollTop = scrollTop;
            }
        } else {
            mapsList.innerHTML = '<div class="tree-item">No maps yet</div>';
        }
    }

    // Toggle map expanded state
    toggleMapExpanded(mapId) {
        const map = this.currentProject.maps[mapId];
        if (map) {
            map.expanded = !map.expanded;
            this.renderMapsList();
        }
    }

    // Add drag and drop handlers to a map item
    addMapDragHandlers(mapItem, map) {
        let draggedElement = null;
        let dropIndicator = null;

        mapItem.addEventListener('dragstart', (e) => {
            draggedElement = mapItem;
            mapItem.style.opacity = '0.5';
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', map.id);
        });

        mapItem.addEventListener('dragend', (e) => {
            mapItem.style.opacity = '1';
            if (dropIndicator && dropIndicator.parentNode) {
                dropIndicator.parentNode.removeChild(dropIndicator);
            }
            dropIndicator = null;
        });

        mapItem.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';

            // Create or update drop indicator
            if (!dropIndicator) {
                dropIndicator = document.createElement('div');
                dropIndicator.style.cssText = 'height: 2px; background-color: var(--color-link); margin: 2px 0;';
            }

            // Determine drop position (above, below, or as child)
            const rect = mapItem.getBoundingClientRect();
            const mouseY = e.clientY;
            const itemTop = rect.top;
            const itemBottom = rect.bottom;
            const itemHeight = rect.height;

            // If hovering over top 25%, insert before
            if (mouseY < itemTop + itemHeight * 0.25) {
                if (mapItem.previousSibling !== dropIndicator) {
                    mapItem.parentNode.insertBefore(dropIndicator, mapItem);
                }
            }
            // If hovering over bottom 25%, insert after
            else if (mouseY > itemBottom - itemHeight * 0.25) {
                if (mapItem.nextSibling !== dropIndicator) {
                    if (mapItem.nextSibling) {
                        mapItem.parentNode.insertBefore(dropIndicator, mapItem.nextSibling);
                    } else {
                        mapItem.parentNode.appendChild(dropIndicator);
                    }
                }
            }
            // Middle 50% - make it a child
            else {
                // Visual feedback for making it a child (highlight the item)
                mapItem.style.backgroundColor = 'var(--color-selection-deep)';
                if (dropIndicator && dropIndicator.parentNode) {
                    dropIndicator.parentNode.removeChild(dropIndicator);
                    dropIndicator = null;
                }
            }
        });

        mapItem.addEventListener('dragleave', (e) => {
            mapItem.style.backgroundColor = '';
            if (dropIndicator && dropIndicator.parentNode) {
                dropIndicator.parentNode.removeChild(dropIndicator);
                dropIndicator = null;
            }
        });

        mapItem.addEventListener('drop', (e) => {
            e.preventDefault();
            e.stopPropagation();
            mapItem.style.backgroundColor = '';

            const draggedMapId = parseInt(e.dataTransfer.getData('text/plain'));
            const targetMapId = map.id;

            if (draggedMapId === targetMapId) return; // Can't drop on itself

            const rect = mapItem.getBoundingClientRect();
            const mouseY = e.clientY;
            const itemTop = rect.top;
            const itemBottom = rect.bottom;
            const itemHeight = rect.height;

            // Determine drop action based on position
            if (mouseY < itemTop + itemHeight * 0.25) {
                // Drop before (same parent, adjust order)
                this.moveMapBefore(draggedMapId, targetMapId);
            } else if (mouseY > itemBottom - itemHeight * 0.25) {
                // Drop after (same parent, adjust order)
                this.moveMapAfter(draggedMapId, targetMapId);
            } else {
                // Drop as child
                this.moveMapAsChild(draggedMapId, targetMapId);
            }

            if (dropIndicator && dropIndicator.parentNode) {
                dropIndicator.parentNode.removeChild(dropIndicator);
                dropIndicator = null;
            }
        });
    }

    // Move a map to be before another map (same parent)
    moveMapBefore(draggedMapId, targetMapId) {
        const draggedMap = this.currentProject.maps[draggedMapId];
        const targetMap = this.currentProject.maps[targetMapId];

        if (!draggedMap || !targetMap) return;

        // Prevent making a map its own ancestor
        if (this.isAncestor(draggedMapId, targetMapId)) {
            this.uiManager.updateStatus('Cannot move a parent into its own child');
            return;
        }

        // Set same parent as target
        draggedMap.parentId = targetMap.parentId;

        // Recalculate order for all siblings
        this.recalculateMapOrder(targetMap.parentId);

        this.renderMapsList();
        this.uiManager.updateStatus(`Moved "${draggedMap.name}" before "${targetMap.name}"`);
    }

    // Move a map to be after another map (same parent)
    moveMapAfter(draggedMapId, targetMapId) {
        const draggedMap = this.currentProject.maps[draggedMapId];
        const targetMap = this.currentProject.maps[targetMapId];

        if (!draggedMap || !targetMap) return;

        // Prevent making a map its own ancestor
        if (this.isAncestor(draggedMapId, targetMapId)) {
            this.uiManager.updateStatus('Cannot move a parent into its own child');
            return;
        }

        // Set same parent as target
        draggedMap.parentId = targetMap.parentId;
        draggedMap.order = targetMap.order + 1;

        // Recalculate order for all siblings
        this.recalculateMapOrder(targetMap.parentId);

        this.renderMapsList();
        this.uiManager.updateStatus(`Moved "${draggedMap.name}" after "${targetMap.name}"`);
    }

    // Move a map to be a child of another map
    moveMapAsChild(draggedMapId, targetMapId) {
        const draggedMap = this.currentProject.maps[draggedMapId];
        const targetMap = this.currentProject.maps[targetMapId];

        if (!draggedMap || !targetMap) return;

        // Prevent making a map its own ancestor
        if (this.isAncestor(draggedMapId, targetMapId)) {
            this.uiManager.updateStatus('Cannot move a parent into its own child');
            return;
        }

        // Set new parent
        draggedMap.parentId = targetMapId;

        // Expand target to show the new child
        targetMap.expanded = true;

        // Recalculate order for new siblings
        this.recalculateMapOrder(targetMapId);

        this.renderMapsList();
        this.uiManager.updateStatus(`Moved "${draggedMap.name}" into "${targetMap.name}"`);
    }

    // Check if a map is an ancestor of another (to prevent circular references)
    isAncestor(potentialAncestorId, mapId) {
        let currentMap = this.currentProject.maps[mapId];
        while (currentMap && currentMap.parentId !== 0) {
            if (currentMap.parentId === potentialAncestorId) {
                return true;
            }
            currentMap = this.currentProject.maps[currentMap.parentId];
        }
        return false;
    }

    // Recalculate order values for all maps with the same parent
    recalculateMapOrder(parentId) {
        const siblings = this.currentProject.maps
            .map((map, index) => ({ ...map, index }))
            .filter(map => map && map.parentId === parentId)
            .sort((a, b) => (a.order || 0) - (b.order || 0));

        siblings.forEach((map, index) => {
            this.currentProject.maps[map.index].order = index;
        });
    }

    // Render Quick Access list
    renderQuickAccessList() {
        const quickAccessList = document.getElementById('quick-access-list');
        if (!quickAccessList) return;

        // Store the currently loaded map ID to re-highlight after render
        const currentMapId = this.tilemapManager?.currentMap?.id;

        if (this.currentProject.maps && this.currentProject.maps.length > 0) {
            // Filter maps marked as quick access
            const quickMaps = this.currentProject.maps
                .map((map, index) => ({ ...map, index }))
                .filter(map => map && map.id && map.quick === true)
                .sort((a, b) => (a.order || 0) - (b.order || 0));

            if (quickMaps.length > 0) {
                quickAccessList.innerHTML = '';

                quickMaps.forEach(map => {
                    const mapItem = document.createElement('div');
                    mapItem.className = 'tree-item';
                    mapItem.setAttribute('data-map-id', map.id);
                    mapItem.textContent = map.name || 'Unnamed Map';

                    // Highlight if this is the currently loaded map
                    if (currentMapId && map.id === currentMapId) {
                        mapItem.classList.add('selected');
                    }

                    // Add click handler to load map
                    mapItem.addEventListener('click', () => {
                        this.loadMap(map.id);
                    });

                    // Add right-click context menu handler
                    mapItem.addEventListener('contextmenu', (e) => {
                        e.preventDefault();
                        this.showMapContextMenu(e.pageX, e.pageY, map.id);
                    });

                    quickAccessList.appendChild(mapItem);
                });
            } else {
                quickAccessList.innerHTML = '<div class="tree-item">No quick access maps yet</div>';
            }
        } else {
            quickAccessList.innerHTML = '<div class="tree-item">No quick access maps yet</div>';
        }
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

        // Save current map (including event changes)
        if (this.tilemapManager && this.tilemapManager.currentMap) {
            this.tilemapManager.saveMap();
        }

        const success = await this.projectManager.saveProject(this.currentProject);
        if (success) {
            this.uiManager.updateStatus('Project saved');
        } else {
            this.uiManager.updateStatus('Error saving project');
        }
    }

    saveAll() {
        if (!this.projectLoaded) return;
        // TODO: Implement save all
        this.uiManager.updateStatus('All files saved');
    }

    async loadMap(mapId) {
        if (!this.tilemapManager) {
            return false;
        }

        this.uiManager.updateStatus(`Loading map ${mapId}...`);

        const success = await this.tilemapManager.loadMap(mapId);

        if (success) {
            this.uiManager.updateStatus(`Map ${mapId} loaded`);

            // Save last edited map
            localStorage.setItem(this.getLastMapStorageKey(), mapId.toString());

            // Highlight selected map in list
            this.highlightCurrentMap(mapId);

            // This callback will be set by main app
            if (this.onMapLoaded) {
                this.onMapLoaded();
            }

            return true;
        } else {
            this.uiManager.updateStatus(`Failed to load map ${mapId}`);
            return false;
        }
    }

    // Highlight the currently selected map in the maps list
    highlightCurrentMap(mapId) {
        let selectedElement = null;
        document.querySelectorAll('[data-map-id]').forEach(item => {
            item.classList.remove('selected');
            if (parseInt(item.getAttribute('data-map-id')) === mapId) {
                item.classList.add('selected');
                selectedElement = item;
            }
        });

        // Scroll selected map into view
        if (selectedElement) {
            setTimeout(() => {
                selectedElement.scrollIntoView({
                    behavior: 'auto',
                    block: 'nearest',
                    inline: 'nearest'
                });
            }, 0);
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

    getMapInfos() {
        return this.currentProject?.maps || null;
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

    // Show context menu for map
    showMapContextMenu(x, y, mapId) {
        // Remove any existing context menu
        this.hideMapContextMenu();

        const contextMenu = document.createElement('div');
        contextMenu.id = 'map-context-menu';
        contextMenu.style.cssText = `
            position: fixed;
            background-color: var(--color-bg-menubar);
            border: 1px solid var(--color-border);
            border-radius: 4px;
            padding: 4px 0;
            z-index: 10001;
            min-width: 200px;
            box-shadow: 0 4px 8px rgba(0, 0, 0, 0.3);
            visibility: hidden;
        `;

        // Check if map is already in quick access
        const map = this.currentProject.maps[mapId];
        const isInQuickAccess = map && map.quick === true;
        const deleteMapIds = this.getMapAndDescendantIds(mapId);
        const remainingMapCount = (this.currentProject.maps || [])
            .filter(mapInfo => mapInfo && !deleteMapIds.includes(mapInfo.id))
            .length;
        const canDeleteMap = !!map && typeof nw !== 'undefined' && remainingMapCount > 0;

        const menuItems = [
            { label: 'Edit Map', action: () => this.editMap(mapId) },
            { label: 'New Map', action: () => this.createNewMap() },
            { label: 'Load Sample Map', action: () => this.loadSampleMap(), enabled: false },
            {
                label: isInQuickAccess ? 'Remove From Quick Access' : 'Add To Quick Access',
                action: () => this.toggleQuickAccess(mapId)
            },
            { separator: true },
            { label: 'Copy Map', action: () => this.copyMap(mapId), enabled: true },
            { label: 'Paste Map', action: () => this.pasteMap(), enabled: true },
            { label: 'Delete Map', action: () => this.deleteMap(mapId), enabled: canDeleteMap },
            { separator: true },
            { label: 'Shift', action: () => this.shiftMap(mapId), enabled: false },
            { label: 'Generate Dungeon', action: () => this.generateDungeon(mapId), enabled: false },
            { label: 'Save Map As Image', action: () => this.saveMapAsImage(mapId), enabled: !!map && typeof nw !== 'undefined' }
        ];

        menuItems.forEach(item => {
            if (item.separator) {
                const separator = document.createElement('div');
                separator.style.cssText = 'height: 1px; background-color: var(--color-border); margin: 4px 0;';
                contextMenu.appendChild(separator);
            } else {
                const menuItem = document.createElement('div');
                menuItem.textContent = item.label;
                const isEnabled = item.enabled !== false;
                menuItem.style.cssText = `
                    padding: 6px 16px;
                    cursor: ${isEnabled ? 'pointer' : 'default'};
                    color: ${isEnabled ? 'var(--color-text)' : 'var(--color-text-dim)'};
                    font-size: 13px;
                    transition: background-color 0.15s;
                `;

                if (isEnabled) {
                    menuItem.addEventListener('mouseenter', () => {
                        menuItem.style.backgroundColor = 'var(--color-selection-deep)';
                    });
                    menuItem.addEventListener('mouseleave', () => {
                        menuItem.style.backgroundColor = 'transparent';
                    });
                    menuItem.addEventListener('click', () => {
                        item.action();
                        this.hideMapContextMenu();
                    });
                }

                contextMenu.appendChild(menuItem);
            }
        });

        document.body.appendChild(contextMenu);

        // Calculate proper position to keep menu on screen
        const menuRect = contextMenu.getBoundingClientRect();
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;

        // Adjust horizontal position if menu would go off right edge
        let finalX = x;
        if (x + menuRect.width > viewportWidth) {
            finalX = viewportWidth - menuRect.width - 10; // 10px margin from edge
        }

        // Adjust vertical position if menu would go off bottom edge
        let finalY = y;
        if (y + menuRect.height > viewportHeight) {
            finalY = viewportHeight - menuRect.height - 10; // 10px margin from edge
        }

        // Apply final position and make visible
        contextMenu.style.left = `${finalX}px`;
        contextMenu.style.top = `${finalY}px`;
        contextMenu.style.visibility = 'visible';

        // Close menu when clicking outside
        const closeMenu = (e) => {
            if (!contextMenu.contains(e.target)) {
                this.hideMapContextMenu();
                document.removeEventListener('click', closeMenu);
            }
        };
        setTimeout(() => {
            document.addEventListener('click', closeMenu);
        }, 0);
    }

    hideMapContextMenu() {
        const existingMenu = document.getElementById('map-context-menu');
        if (existingMenu) {
            existingMenu.remove();
        }
    }

    // Toggle quick access for a map
    toggleQuickAccess(mapId) {
        const map = this.currentProject.maps[mapId];
        if (map) {
            map.quick = !map.quick;
            // If currently viewing quick access tab, refresh it
            const quickAccessTab = document.getElementById('quick-access-tab');
            if (quickAccessTab && quickAccessTab.classList.contains('active')) {
                this.renderQuickAccessList();
            }
            this.uiManager.updateStatus(map.quick ? `Added "${map.name}" to Quick Access` : `Removed "${map.name}" from Quick Access`);
        }
    }

    // Edit map properties
    editMap(mapId) {
        let map = null;

        // If this is the currently loaded map in TilemapManager, use that data (most up-to-date)
        if (this.tilemapManager && this.tilemapManager.currentMap && this.tilemapManager.currentMap.id === mapId) {
            map = this.tilemapManager.currentMap;
        } else {
            // Load map data from disk (Map###.json)
            if (typeof nw !== 'undefined') {
                const fs = require('fs');
                const path = require('path');
                const mapFile = `Map${String(mapId).padStart(3, '0')}.json`;
                const mapPath = path.join(this.currentProject.path, 'data', mapFile);

                if (fs.existsSync(mapPath)) {
                    map = JSON.parse(fs.readFileSync(mapPath, 'utf8'));
                    map.id = mapId;
                }
            }
        }

        if (!map) {
            return;
        }

        // Get the map name from MapInfos (the actual map name, not displayName)
        const mapInfo = this.currentProject.maps && this.currentProject.maps[mapId];
        if (mapInfo && mapInfo.name) {
            map.name = mapInfo.name;
        } else {
            // Fallback to displayName if no map name in MapInfos
            map.name = map.displayName || '';
        }

        this.openMapPropertiesModal(map);
    }

    // Create new map
    createNewMap() {
        // Create a default map object
        const newMap = {
            id: this.getNextMapId(),
            name: 'New Map',
            displayName: '',
            tilesetId: 1,
            width: 17,
            height: 13,
            scrollType: 0,
            autoplayBgm: false,
            autoplayBgs: false,
            bgm: { name: '', pan: 0, pitch: 100, volume: 100 },
            bgs: { name: '', pan: 0, pitch: 100, volume: 80 },
            battleback1Name: '',
            battleback2Name: '',
            specifyBattleback: false,
            disableDashing: false,
            parallaxName: '',
            parallaxLoopX: false,
            parallaxLoopY: false,
            parallaxShow: false,
            parallaxSx: 0,
            parallaxSy: 0,
            encounterList: [],
            encounterStep: 30,
            note: '',
            data: [],
            events: []
        };

        this.openMapPropertiesModal(newMap, true);
    }

    getNextMapId() {
        let maxId = 0;
        this.currentProject.maps.forEach(map => {
            if (map && map.id > maxId) {
                maxId = map.id;
            }
        });
        return maxId + 1;
    }

    // Open map properties modal
    openMapPropertiesModal(mapData, isNewMap = false) {
        const modal = document.getElementById('map-properties-modal');
        if (!modal) {
            return;
        }

        // Store current map data and mode
        this.currentEditingMap = mapData;
        this.isCreatingNewMap = isNewMap;

        // Update modal title
        const title = document.getElementById('map-properties-title');
        title.textContent = isNewMap ? 'New Map' : 'Map Properties';

        // Populate form fields
        this.populateMapPropertiesForm(mapData);

        // Setup modal controls
        this.setupMapPropertiesModalControls();

        // Show modal
        modal.style.display = 'flex';
    }

    populateMapPropertiesForm(mapData) {
        // General Settings
        document.getElementById('map-name-input').value = mapData.name || '';
        document.getElementById('map-display-name-input').value = mapData.displayName || '';
        document.getElementById('map-width-input').value = mapData.width || 17;
        document.getElementById('map-height-input').value = mapData.height || 13;
        document.getElementById('map-scroll-type-select').value = mapData.scrollType || 0;
        document.getElementById('map-encounter-steps-input').value = mapData.encounterStep || 30;
        document.getElementById('map-disable-dashing-checkbox').checked = mapData.disableDashing || false;

        // Populate tileset dropdown
        this.populateTilesetDropdown();
        document.getElementById('map-tileset-select').value = mapData.tilesetId || 1;

        // BGM Settings
        const bgmCheckbox = document.getElementById('map-autoplay-bgm-checkbox');
        const bgmPicker = document.getElementById('map-bgm-picker');
        bgmCheckbox.checked = mapData.autoplayBgm || false;
        bgmPicker.style.display = bgmCheckbox.checked ? 'block' : 'none';

        this.populateAudioDropdown('map-bgm-select', 'bgm');
        const bgmSelect = document.getElementById('map-bgm-select');
        const bgmName = mapData.bgm?.name || '';
        bgmSelect.value = bgmName;

        // If BGM not found in folder, add it as missing option
        if (bgmName && bgmSelect.value !== bgmName) {
            const option = document.createElement('option');
            option.value = bgmName;
            option.textContent = `${bgmName} (missing)`;
            option.style.color = '#ff6666';
            bgmSelect.appendChild(option);
            bgmSelect.value = bgmName;
        }

        document.getElementById('map-bgm-volume').value = mapData.bgm?.volume ?? 100;
        document.getElementById('map-bgm-pitch').value = mapData.bgm?.pitch ?? 100;
        document.getElementById('map-bgm-pan').value = mapData.bgm?.pan ?? 0;

        // BGS Settings
        const bgsCheckbox = document.getElementById('map-autoplay-bgs-checkbox');
        const bgsPicker = document.getElementById('map-bgs-picker');
        bgsCheckbox.checked = mapData.autoplayBgs || false;
        bgsPicker.style.display = bgsCheckbox.checked ? 'block' : 'none';

        this.populateAudioDropdown('map-bgs-select', 'bgs');
        const bgsSelect = document.getElementById('map-bgs-select');
        const bgsName = mapData.bgs?.name || '';
        bgsSelect.value = bgsName;

        // If BGS not found in folder, add it as missing option
        if (bgsName && bgsSelect.value !== bgsName) {
            const option = document.createElement('option');
            option.value = bgsName;
            option.textContent = `${bgsName} (missing)`;
            option.style.color = '#ff6666';
            bgsSelect.appendChild(option);
            bgsSelect.value = bgsName;
        }

        document.getElementById('map-bgs-volume').value = mapData.bgs?.volume ?? 80;
        document.getElementById('map-bgs-pitch').value = mapData.bgs?.pitch ?? 100;
        document.getElementById('map-bgs-pan').value = mapData.bgs?.pan ?? 0;

        // Battleback Settings
        const battlebackCheckbox = document.getElementById('map-specify-battleback-checkbox');
        const battlebackPicker = document.getElementById('map-battleback-picker');
        battlebackCheckbox.checked = mapData.specifyBattleback || false;
        battlebackPicker.style.display = battlebackCheckbox.checked ? 'flex' : 'none';

        this.populateBattlebackDropdowns();
        document.getElementById('map-battleback1-select').value = mapData.battleback1Name || '';
        document.getElementById('map-battleback2-select').value = mapData.battleback2Name || '';

        // Parallax Settings
        this.populateParallaxDropdown();
        const parallaxSelect = document.getElementById('map-parallax-image-select');
        const parallaxValue = mapData.parallaxName || '';
        parallaxSelect.value = parallaxValue;

        // If parallax value not found in dropdown, add it as a missing option
        if (parallaxValue && parallaxSelect.value !== parallaxValue) {
            const option = document.createElement('option');
            option.value = parallaxValue;
            option.textContent = `${parallaxValue} (missing)`;
            option.style.color = '#ff6666';
            parallaxSelect.appendChild(option);
            parallaxSelect.value = parallaxValue;
        }

        document.getElementById('map-parallax-loop-x-checkbox').checked = mapData.parallaxLoopX || false;
        document.getElementById('map-parallax-loop-y-checkbox').checked = mapData.parallaxLoopY || false;
        document.getElementById('map-parallax-show-checkbox').checked = mapData.parallaxShow || false;
        document.getElementById('map-parallax-sx-input').value = mapData.parallaxSx || 0;
        document.getElementById('map-parallax-sy-input').value = mapData.parallaxSy || 0;

        // Note
        document.getElementById('map-note-textarea').value = mapData.note || '';

        // Encounters
        this.populateEncountersList(mapData.encounterList || []);
    }

    populateTilesetDropdown() {
        const select = document.getElementById('map-tileset-select');
        select.innerHTML = '<option value="1">Tileset 1</option>'; // Default option

        if (this.databaseManager && this.databaseManager.data.tilesets) {
            const tilesets = this.databaseManager.data.tilesets;
            select.innerHTML = '';
            tilesets.forEach((tileset, index) => {
                if (tileset && index > 0) { // Skip index 0 (null)
                    const option = document.createElement('option');
                    option.value = tileset.id || index;
                    option.textContent = tileset.name || `Tileset ${tileset.id || index}`;
                    select.appendChild(option);
                }
            });
        }
    }

    populateAudioDropdown(selectId, type) {
        const select = document.getElementById(selectId);
        select.innerHTML = '<option value="">(None)</option>';

        if (!this.currentProject || !this.currentProject.path || typeof nw === 'undefined') {
            return;
        }

        const fs = require('fs');
        const path = require('path');
        const audioFolder = path.join(this.currentProject.path, 'audio', type);

        // Check if folder exists
        if (!fs.existsSync(audioFolder)) {
            return;
        }

        // Read audio files
        const files = fs.readdirSync(audioFolder).filter(file => {
            return file.endsWith('.ogg') || file.endsWith('.m4a') || file.endsWith('.mp3') || file.endsWith('.wav');
        });

        // Add files to dropdown (without extensions)
        files.forEach(file => {
            const displayName = file.replace(/\.(ogg|m4a|mp3|wav)$/i, '');
            const option = document.createElement('option');
            option.value = displayName;
            option.textContent = displayName;
            select.appendChild(option);
        });
    }

    getMapAudioPreviewPath(type) {
        const name = document.getElementById(`map-${type}-select`)?.value || '';
        if (!name || !this.currentProject?.path || typeof nw === 'undefined') return null;

        const fs = require('fs');
        const path = require('path');
        const audioFolder = path.join(this.currentProject.path, 'audio', type);
        const extensions = ['.ogg', '.m4a', '.mp3', '.wav'];

        for (const ext of extensions) {
            const filePath = path.join(audioFolder, name + ext);
            if (fs.existsSync(filePath)) {
                return 'file://' + filePath.replace(/\\/g, '/');
            }
        }

        return null;
    }

    getMapAudioPreviewParams(type) {
        const defaultVolume = type === 'bgs' ? 80 : 100;
        const readNumber = (id, fallback) => {
            const value = parseInt(document.getElementById(id)?.value, 10);
            return Number.isFinite(value) ? value : fallback;
        };

        return {
            audioType: type,
            volume: readNumber(`map-${type}-volume`, defaultVolume),
            pitch: readNumber(`map-${type}-pitch`, 100),
            pan: readNumber(`map-${type}-pan`, 0),
            loop: true
        };
    }

    updateMapAudioPreviewStatus(type, message, isError = false) {
        const status = document.getElementById(`map-${type}-preview-status`);
        if (!status) return;
        status.textContent = message;
        status.style.color = isError ? '#ff6666' : 'var(--color-text-muted)';
    }

    playMapAudioPreview(type) {
        const audioPlayer = window.reactor?.audioPlayer;
        if (!audioPlayer) {
            this.updateMapAudioPreviewStatus(type, 'Audio player unavailable', true);
            return;
        }

        const name = document.getElementById(`map-${type}-select`)?.value || '';
        if (!name) {
            audioPlayer.stopExternal(type);
            this.updateMapAudioPreviewStatus(type, 'No track selected', true);
            return;
        }

        const filePath = this.getMapAudioPreviewPath(type);
        if (!filePath) {
            this.updateMapAudioPreviewStatus(type, `${name} not found`, true);
            return;
        }

        audioPlayer.playExternal(filePath, this.getMapAudioPreviewParams(type));
        this.updateMapAudioPreviewStatus(type, `Previewing ${name}`);
    }

    pauseMapAudioPreview(type) {
        const audioPlayer = window.reactor?.audioPlayer;
        const channel = audioPlayer?.getChannel?.(type);
        if (!channel) return;
        channel.audio.pause();
        channel.playing = false;
        this.updateMapAudioPreviewStatus(type, 'Preview paused');
    }

    stopMapAudioPreview(type) {
        const audioPlayer = window.reactor?.audioPlayer;
        if (audioPlayer) {
            audioPlayer.stopExternal(type);
        }
        this.updateMapAudioPreviewStatus(type, 'No preview playing');
    }

    stopMapAudioPreviews() {
        this.stopMapAudioPreview('bgm');
        this.stopMapAudioPreview('bgs');
    }

    setupMapAudioPreviewControls(type) {
        const select = document.getElementById(`map-${type}-select`);
        const playBtn = document.getElementById(`map-${type}-play-btn`);
        const pauseBtn = document.getElementById(`map-${type}-pause-btn`);
        const stopBtn = document.getElementById(`map-${type}-stop-btn`);
        const volumeInput = document.getElementById(`map-${type}-volume`);
        const pitchInput = document.getElementById(`map-${type}-pitch`);
        const panInput = document.getElementById(`map-${type}-pan`);

        if (!select || !playBtn || !pauseBtn || !stopBtn) return;

        const styleHover = (button) => {
            button.onmouseenter = () => { button.style.backgroundColor = 'var(--color-accent-tint-25)'; };
            button.onmouseleave = () => { button.style.backgroundColor = 'var(--color-bg-panel)'; };
        };

        [playBtn, pauseBtn, stopBtn].forEach(styleHover);

        playBtn.onclick = () => this.playMapAudioPreview(type);
        pauseBtn.onclick = () => this.pauseMapAudioPreview(type);
        stopBtn.onclick = () => this.stopMapAudioPreview(type);
        select.onchange = () => {
            this.stopMapAudioPreview(type);
            if (select.value) {
                this.updateMapAudioPreviewStatus(type, `Selected ${select.value}`);
            }
        };

        [volumeInput, pitchInput, panInput].forEach(input => {
            if (!input) return;
            input.oninput = () => {
                const audioPlayer = window.reactor?.audioPlayer;
                const channel = audioPlayer?.getChannel?.(type);
                if (channel?.playing) {
                    this.playMapAudioPreview(type);
                }
            };
        });
    }

    populateBattlebackDropdowns() {
        const select1 = document.getElementById('map-battleback1-select');
        const select2 = document.getElementById('map-battleback2-select');
        select1.innerHTML = '<option value="">(None)</option>';
        select2.innerHTML = '<option value="">(None)</option>';

        if (!this.currentProject || !this.currentProject.path || typeof nw === 'undefined') {
            return;
        }

        const fs = require('fs');
        const path = require('path');
        const bb1Folder = path.join(this.currentProject.path, 'img', 'battlebacks1');
        const bb2Folder = path.join(this.currentProject.path, 'img', 'battlebacks2');

        // Load battleback1 images
        if (fs.existsSync(bb1Folder)) {
            const files = fs.readdirSync(bb1Folder).filter(file => {
                return file.endsWith('.png') || file.endsWith('.jpg') || file.endsWith('.jpeg');
            });

            files.forEach(file => {
                const option = document.createElement('option');
                option.value = file.replace(/\.(png|jpg|jpeg)$/, '');
                option.textContent = file.replace(/\.(png|jpg|jpeg)$/, '');
                select1.appendChild(option);
            });
        }

        // Load battleback2 images
        if (fs.existsSync(bb2Folder)) {
            const files = fs.readdirSync(bb2Folder).filter(file => {
                return file.endsWith('.png') || file.endsWith('.jpg') || file.endsWith('.jpeg');
            });

            files.forEach(file => {
                const option = document.createElement('option');
                option.value = file.replace(/\.(png|jpg|jpeg)$/, '');
                option.textContent = file.replace(/\.(png|jpg|jpeg)$/, '');
                select2.appendChild(option);
            });
        }
    }

    populateParallaxDropdown() {
        const select = document.getElementById('map-parallax-image-select');
        select.innerHTML = '<option value="">(None)</option>';

        if (!this.currentProject || !this.currentProject.path || typeof nw === 'undefined') {
            return;
        }

        const fs = require('fs');
        const path = require('path');
        const parallaxFolder = path.join(this.currentProject.path, 'img', 'parallaxes');

        // Check if folder exists
        if (!fs.existsSync(parallaxFolder)) {
            return;
        }

        // Read parallax images
        const files = fs.readdirSync(parallaxFolder).filter(file => {
            return file.endsWith('.png') || file.endsWith('.jpg') || file.endsWith('.jpeg');
        });

        // Add files to dropdown (without extensions)
        files.forEach(file => {
            const displayName = file.replace(/\.(png|jpg|jpeg)$/, '');
            const option = document.createElement('option');
            option.value = displayName;
            option.textContent = displayName;
            select.appendChild(option);
        });
    }

    populateEncountersList(encounters) {
        const list = document.getElementById('map-encounters-list');
        list.innerHTML = '';

        encounters.forEach((encounter, index) => {
            this.addEncounterRow(encounter, index);
        });
    }

    addEncounterRow(encounter = null, index = null) {
        const list = document.getElementById('map-encounters-list');
        const row = document.createElement('div');
        row.style.cssText = 'display: grid; grid-template-columns: 2fr 1fr 2fr auto; gap: 6px; padding: 4px 6px; background-color: var(--color-bg-menubar); border-radius: 3px; margin-bottom: 3px;';

        // Troop dropdown
        const troopSelect = document.createElement('select');
        troopSelect.style.cssText = 'padding: 3px 4px; background-color: var(--color-bg-input-alt); border: 1px solid var(--color-border-input); color: var(--color-text); border-radius: 3px; font-size: 11px; width: 100%; box-sizing: border-box;';
        troopSelect.innerHTML = '<option value="0">(None)</option>';

        if (this.databaseManager && this.databaseManager.data.troops) {
            const troops = this.databaseManager.data.troops;
            troops.forEach((troop, i) => {
                if (troop && i > 0) {
                    const option = document.createElement('option');
                    option.value = i;
                    option.textContent = troop.name || `Troop ${i}`;
                    troopSelect.appendChild(option);
                }
            });
        }

        if (encounter && encounter.troopId) {
            troopSelect.value = encounter.troopId;
        }

        // Weight input
        const weightInput = document.createElement('input');
        weightInput.type = 'number';
        weightInput.min = '1';
        weightInput.max = '99';
        weightInput.value = encounter ? (encounter.weight || 10) : 10;
        weightInput.style.cssText = 'padding: 3px 4px; background-color: var(--color-bg-input-alt); border: 1px solid var(--color-border-input); color: var(--color-text); border-radius: 3px; font-size: 11px; width: 100%; box-sizing: border-box;';

        // Range container (whole map vs regions)
        const rangeContainer = document.createElement('div');
        rangeContainer.style.cssText = 'display: flex; flex-direction: column; gap: 2px;';

        // Radio buttons container
        const radioContainer = document.createElement('div');
        radioContainer.style.cssText = 'display: flex; gap: 8px; font-size: 10px;';

        const radioId = `encounter-range-${Date.now()}-${Math.random()}`;

        // Whole map radio
        const wholeMapLabel = document.createElement('label');
        wholeMapLabel.style.cssText = 'display: flex; align-items: center; gap: 3px; color: var(--color-text); cursor: pointer;';
        const wholeMapRadio = document.createElement('input');
        wholeMapRadio.type = 'radio';
        wholeMapRadio.name = radioId;
        wholeMapRadio.value = 'whole';
        wholeMapLabel.appendChild(wholeMapRadio);
        wholeMapLabel.appendChild(document.createTextNode('Whole Map'));

        // Regions radio
        const regionsLabel = document.createElement('label');
        regionsLabel.style.cssText = 'display: flex; align-items: center; gap: 3px; color: var(--color-text); cursor: pointer;';
        const regionsRadio = document.createElement('input');
        regionsRadio.type = 'radio';
        regionsRadio.name = radioId;
        regionsRadio.value = 'regions';
        regionsLabel.appendChild(regionsRadio);
        regionsLabel.appendChild(document.createTextNode('Regions'));

        radioContainer.appendChild(wholeMapLabel);
        radioContainer.appendChild(regionsLabel);

        // Regions input (for specifying region IDs)
        const regionsInput = document.createElement('input');
        regionsInput.type = 'text';
        regionsInput.placeholder = '1,2,3';
        regionsInput.style.cssText = 'padding: 2px 4px; background-color: var(--color-bg-input-alt); border: 1px solid var(--color-border-input); color: var(--color-text); border-radius: 3px; font-size: 10px; width: 100%; box-sizing: border-box;';

        // Set initial values based on encounter data
        const isWholeMap = !encounter || !encounter.regionSet || encounter.regionSet.length === 0 || encounter.regionSet[0] === 0;
        if (isWholeMap) {
            wholeMapRadio.checked = true;
            regionsInput.disabled = true;
            regionsInput.style.opacity = '0.5';
            regionsInput.value = '';
        } else {
            regionsRadio.checked = true;
            regionsInput.value = encounter.regionSet.join(',');
        }

        // Toggle regions input enabled/disabled based on radio selection
        wholeMapRadio.addEventListener('change', () => {
            if (wholeMapRadio.checked) {
                regionsInput.disabled = true;
                regionsInput.style.opacity = '0.5';
                regionsInput.value = '';
            }
        });

        regionsRadio.addEventListener('change', () => {
            if (regionsRadio.checked) {
                regionsInput.disabled = false;
                regionsInput.style.opacity = '1';
                if (!regionsInput.value) {
                    regionsInput.value = '1';
                }
            }
        });

        rangeContainer.appendChild(radioContainer);
        rangeContainer.appendChild(regionsInput);

        // Store references for data extraction
        rangeContainer._wholeMapRadio = wholeMapRadio;
        rangeContainer._regionsRadio = regionsRadio;
        rangeContainer._regionsInput = regionsInput;

        // Delete button
        const deleteBtn = document.createElement('button');
        deleteBtn.textContent = '×';
        deleteBtn.style.cssText = 'padding: 2px 6px; background-color: #c72e2e; border: none; color: var(--color-text-strong); border-radius: 3px; font-size: 14px; cursor: pointer; font-weight: bold; line-height: 1;';
        deleteBtn.addEventListener('click', () => {
            row.remove();
        });

        row.appendChild(troopSelect);
        row.appendChild(weightInput);
        row.appendChild(rangeContainer);
        row.appendChild(deleteBtn);

        list.appendChild(row);
    }

    setupMapPropertiesModalControls() {
        // Remove old event listeners by cloning buttons
        const oldOkBtn = document.getElementById('map-properties-ok-btn');
        const oldCancelBtn = document.getElementById('map-properties-cancel-btn');
        const oldCloseBtn = document.getElementById('map-properties-close-btn');
        const oldAddEncounterBtn = document.getElementById('map-add-encounter-btn');

        const okBtn = oldOkBtn.cloneNode(true);
        const cancelBtn = oldCancelBtn.cloneNode(true);
        const closeBtn = oldCloseBtn.cloneNode(true);
        const addEncounterBtn = oldAddEncounterBtn.cloneNode(true);

        oldOkBtn.replaceWith(okBtn);
        oldCancelBtn.replaceWith(cancelBtn);
        oldCloseBtn.replaceWith(closeBtn);
        oldAddEncounterBtn.replaceWith(addEncounterBtn);

        // OK button
        okBtn.addEventListener('click', async () => {
            await this.saveMapProperties();
            this.stopMapAudioPreviews();
            document.getElementById('map-properties-modal').style.display = 'none';
        });

        // Cancel and Close buttons
        const closeModal = () => {
            this.stopMapAudioPreviews();
            document.getElementById('map-properties-modal').style.display = 'none';
        };
        cancelBtn.addEventListener('click', closeModal);
        closeBtn.addEventListener('click', closeModal);

        // Add encounter button
        addEncounterBtn.addEventListener('click', () => {
            this.addEncounterRow();
        });

        // Toggle checkboxes
        document.getElementById('map-autoplay-bgm-checkbox').addEventListener('change', (e) => {
            document.getElementById('map-bgm-picker').style.display = e.target.checked ? 'block' : 'none';
            if (!e.target.checked) this.stopMapAudioPreview('bgm');
        });

        document.getElementById('map-autoplay-bgs-checkbox').addEventListener('change', (e) => {
            document.getElementById('map-bgs-picker').style.display = e.target.checked ? 'block' : 'none';
            if (!e.target.checked) this.stopMapAudioPreview('bgs');
        });

        document.getElementById('map-specify-battleback-checkbox').addEventListener('change', (e) => {
            document.getElementById('map-battleback-picker').style.display = e.target.checked ? 'flex' : 'none';
        });

        this.setupMapAudioPreviewControls('bgm');
        this.setupMapAudioPreviewControls('bgs');
    }

    writeMapDataFile(mapData) {
        if (typeof nw === 'undefined' || !this.currentProject?.path) return false;

        try {
            const fs = require('fs');
            const path = require('path');
            const mapPath = path.join(this.currentProject.path, 'data', `Map${String(mapData.id).padStart(3, '0')}.json`);
            const dataToSave = { ...mapData };
            delete dataToSave.id;
            delete dataToSave.name;
            fs.writeFileSync(mapPath, JSON.stringify(dataToSave, null, 2), 'utf8');
            return true;
        } catch (error) {
            console.error('Error writing map file:', error);
            return false;
        }
    }

    async saveMapProperties() {
        const readNumber = (id, fallback) => {
            const value = parseInt(document.getElementById(id).value, 10);
            return Number.isFinite(value) ? value : fallback;
        };

        // Collect data from form
        const mapData = {
            id: this.currentEditingMap.id,
            name: document.getElementById('map-name-input').value || 'Unnamed Map',
            displayName: document.getElementById('map-display-name-input').value || '',
            tilesetId: parseInt(document.getElementById('map-tileset-select').value) || 1,
            width: parseInt(document.getElementById('map-width-input').value) || 17,
            height: parseInt(document.getElementById('map-height-input').value) || 13,
            scrollType: parseInt(document.getElementById('map-scroll-type-select').value) || 0,
            encounterStep: parseInt(document.getElementById('map-encounter-steps-input').value) || 30,
            disableDashing: document.getElementById('map-disable-dashing-checkbox').checked,

            autoplayBgm: document.getElementById('map-autoplay-bgm-checkbox').checked,
            bgm: {
                name: document.getElementById('map-bgm-select').value || '',
                volume: readNumber('map-bgm-volume', 100),
                pitch: readNumber('map-bgm-pitch', 100),
                pan: readNumber('map-bgm-pan', 0)
            },

            autoplayBgs: document.getElementById('map-autoplay-bgs-checkbox').checked,
            bgs: {
                name: document.getElementById('map-bgs-select').value || '',
                volume: readNumber('map-bgs-volume', 80),
                pitch: readNumber('map-bgs-pitch', 100),
                pan: readNumber('map-bgs-pan', 0)
            },

            specifyBattleback: document.getElementById('map-specify-battleback-checkbox').checked,
            battleback1Name: document.getElementById('map-battleback1-select').value || '',
            battleback2Name: document.getElementById('map-battleback2-select').value || '',

            parallaxName: document.getElementById('map-parallax-image-select').value || '',
            parallaxLoopX: document.getElementById('map-parallax-loop-x-checkbox').checked,
            parallaxLoopY: document.getElementById('map-parallax-loop-y-checkbox').checked,
            parallaxShow: document.getElementById('map-parallax-show-checkbox').checked,
            parallaxSx: parseInt(document.getElementById('map-parallax-sx-input').value) || 0,
            parallaxSy: parseInt(document.getElementById('map-parallax-sy-input').value) || 0,

            note: document.getElementById('map-note-textarea').value || '',

            encounterList: this.getEncounterListFromForm(),

            // Preserve existing data
            data: this.currentEditingMap.data || [],
            events: this.currentEditingMap.events || []
        };

        // Initialize data array if creating new map
        if (this.isCreatingNewMap && (!mapData.data || mapData.data.length === 0)) {
            const size = mapData.width * mapData.height * 6; // 6 layers
            mapData.data = new Array(size).fill(0);
        } else if (!this.isCreatingNewMap) {
            // Check if dimensions changed for existing map
            const oldWidth = this.currentEditingMap.width;
            const oldHeight = this.currentEditingMap.height;
            const newWidth = mapData.width;
            const newHeight = mapData.height;

            if (oldWidth !== newWidth || oldHeight !== newHeight) {
                // Resize the data array, preserving existing tiles
                mapData.data = this.resizeMapData(
                    this.currentEditingMap.data,
                    oldWidth,
                    oldHeight,
                    newWidth,
                    newHeight
                );
            }
        }

        if (this.isCreatingNewMap) {
            // Add to MapInfos (currentProject.maps is the MapInfos.json data)
            if (!this.currentProject.maps) {
                this.currentProject.maps = [];
            }
            this.currentProject.maps[mapData.id] = {
                id: mapData.id,
                expanded: true,
                name: mapData.name,
                order: this.currentProject.maps.length,
                parentId: 0,
                scrollX: 0,
                scrollY: 0
            };

            // Save map file
            if (typeof nw !== 'undefined') {
                this.writeMapDataFile(mapData);
            }

            // Refresh maps list
            this.renderMapsList();

            this.uiManager.updateStatus(`Created map: ${mapData.name}`);
        } else {
            // Update existing map

            // If this is the currently loaded map, check dimensions BEFORE any updates
            let dimensionsChanged = false;
            let tilesetChanged = false;
            if (this.tilemapManager && this.tilemapManager.currentMap && this.tilemapManager.currentMap.id === mapData.id) {
                dimensionsChanged =
                    this.tilemapManager.currentMap.width !== mapData.width ||
                    this.tilemapManager.currentMap.height !== mapData.height;
                tilesetChanged = this.tilemapManager.currentMap.tilesetId !== mapData.tilesetId;
            }

            // Now update the editing map (which may be the same object as currentMap)
            Object.assign(this.currentEditingMap, mapData);

            // Update MapInfos if name changed
            if (this.currentProject.maps && this.currentProject.maps[mapData.id]) {
                this.currentProject.maps[mapData.id].name = mapData.name;
            }

            this.writeMapDataFile(mapData);
            if (this.projectManager && this.projectManager.saveMapInfos) {
                this.projectManager.saveMapInfos(this.currentProject.path, this.currentProject.maps);
            }

            // Refresh maps list to show updated name (this will also re-highlight the current map)
            this.renderMapsList();

            // If this is the currently loaded map and dimensions changed, re-render
            if (this.tilemapManager && this.tilemapManager.currentMap && this.tilemapManager.currentMap.id === mapData.id) {

                if (dimensionsChanged || tilesetChanged) {
                    await this.loadMap(mapData.id);
                } else {
                    // Just re-render parallax to reflect changes
                    await this.tilemapManager.renderParallax();
                }
            }

            this.uiManager.updateStatus(`Updated map: ${mapData.name}`);
        }
    }

    getEncounterListFromForm() {
        const encounters = [];
        const rows = document.querySelectorAll('#map-encounters-list > div');

        rows.forEach(row => {
            const troopSelect = row.querySelector('select');
            const weightInput = row.querySelector('input[type="number"]');
            const rangeContainer = row.children[2]; // Third child is the range container

            const troopId = parseInt(troopSelect.value);
            if (troopId > 0) {
                let regionSet = [0]; // Default to whole map

                // Check if regions radio is selected
                if (rangeContainer._regionsRadio && rangeContainer._regionsRadio.checked) {
                    const regionsValue = rangeContainer._regionsInput.value.trim();
                    if (regionsValue) {
                        const regions = regionsValue.split(',').map(r => parseInt(r.trim())).filter(r => !isNaN(r) && r > 0);
                        if (regions.length > 0) {
                            regionSet = regions;
                        }
                    }
                }

                encounters.push({
                    troopId: troopId,
                    weight: parseInt(weightInput.value) || 10,
                    regionSet: regionSet
                });
            }
        });

        return encounters;
    }

    resizeMapData(oldData, oldWidth, oldHeight, newWidth, newHeight) {
        const numLayers = 6; // RPG Maker uses 6 layers
        const newSize = newWidth * newHeight * numLayers;
        const newData = new Array(newSize).fill(0);

        // Copy tiles from old data to new data, layer by layer
        for (let layer = 0; layer < numLayers; layer++) {
            const oldLayerOffset = layer * (oldWidth * oldHeight);
            const newLayerOffset = layer * (newWidth * newHeight);

            for (let y = 0; y < Math.min(oldHeight, newHeight); y++) {
                for (let x = 0; x < Math.min(oldWidth, newWidth); x++) {
                    const oldIndex = oldLayerOffset + (y * oldWidth + x);
                    const newIndex = newLayerOffset + (y * newWidth + x);
                    newData[newIndex] = oldData[oldIndex] || 0;
                }
            }
        }

        return newData;
    }

    // Placeholder methods for other context menu items
    loadSampleMap() {
        alert('Load Sample Map - Coming soon!');
    }

    addToQuickAccess(mapId) {
        alert('Add To Quick Access - Coming soon!');
    }

    async copyMap(mapId) {
        if (!this.currentProject || typeof nw === 'undefined') return;

        try {
            const fs = require('fs');
            const path = require('path');
            let mapData = null;

            if (this.tilemapManager && this.tilemapManager.currentMap && this.tilemapManager.currentMap.id === mapId) {
                mapData = JSON.parse(JSON.stringify(this.tilemapManager.currentMap));
            } else {
                const mapPath = path.join(this.currentProject.path, 'data', `Map${String(mapId).padStart(3, '0')}.json`);
                if (!fs.existsSync(mapPath)) {
                    alert('Map file not found.');
                    return;
                }
                mapData = JSON.parse(fs.readFileSync(mapPath, 'utf8'));
                mapData.id = mapId;
            }

            const mapInfo = this.currentProject.maps?.[mapId] ? JSON.parse(JSON.stringify(this.currentProject.maps[mapId])) : null;
            const payload = {
                sourceProjectName: this.currentProject.name,
                sourceProjectPath: this.currentProject.path,
                mapId,
                mapData,
                mapInfo,
                tileset: mapData.tilesetId ? JSON.parse(JSON.stringify(this.databaseManager.getTileset(mapData.tilesetId))) : null
            };

            if (typeof ReactorClipboard !== 'undefined') {
                await ReactorClipboard.write('map', payload);
            }

            this.uiManager.updateStatus(`Copied map ${mapId} to clipboard`);
        } catch (error) {
            console.error('Error copying map:', error);
            alert('Failed to copy map. Check console for details.');
        }
    }

    async pasteMap() {
        if (!this.currentProject || typeof nw === 'undefined') return;

        try {
            const clipboardData = typeof ReactorClipboard !== 'undefined' ? await ReactorClipboard.read('map') : null;
            const payload = clipboardData?.payload || null;
            if (!payload || !payload.mapData) {
                alert('No map in clipboard to paste.');
                return;
            }

            const fs = require('fs');
            const path = require('path');
            const newMapId = this.getNextAvailableMapId();
            const sourceName = payload.mapInfo?.name || payload.mapData.displayName || `Map ${payload.mapId || ''}`.trim();
            const mapName = this.getUniqueMapName(`${sourceName} Copy`);

            const newMapData = JSON.parse(JSON.stringify(payload.mapData));
            newMapData.id = newMapId;
            delete newMapData.id;

            if (payload.tileset) {
                newMapData.tilesetId = await this.importCopiedTileset(payload.tileset);
            } else if (!this.databaseManager.getTileset(newMapData.tilesetId)) {
                newMapData.tilesetId = this.databaseManager.getTilesets()[0]?.id || 1;
            }

            if (newMapData.displayName && newMapData.displayName === sourceName) {
                newMapData.displayName = mapName;
            }

            const mapPath = path.join(this.currentProject.path, 'data', `Map${String(newMapId).padStart(3, '0')}.json`);
            fs.writeFileSync(mapPath, JSON.stringify(newMapData));

            if (!this.currentProject.maps) {
                this.currentProject.maps = [];
            }

            const sourceInfo = payload.mapInfo || {};
            this.currentProject.maps[newMapId] = {
                id: newMapId,
                expanded: sourceInfo.expanded !== undefined ? sourceInfo.expanded : true,
                name: mapName,
                order: this.currentProject.maps.length,
                parentId: 0,
                scrollX: 0,
                scrollY: 0
            };

            if (this.projectManager && this.projectManager.saveMapInfos) {
                this.projectManager.saveMapInfos(this.currentProject.path, this.currentProject.maps);
            }

            this.renderMapsList();
            this.uiManager.updateStatus(`Pasted map as ${String(newMapId).padStart(3, '0')}: ${mapName}`);
        } catch (error) {
            console.error('Error pasting map:', error);
            alert('Failed to paste map. Check console for details.');
        }
    }

    async importCopiedTileset(sourceTileset) {
        if (!sourceTileset) return 1;

        const targetTilesets = this.databaseManager.data.tilesets || [];
        const sameName = sourceTileset.name
            ? targetTilesets.find(tileset => tileset && tileset.name === sourceTileset.name)
            : null;

        if (sameName) {
            return sameName.id;
        }

        let targetId = sourceTileset.id;
        if (!targetId || targetTilesets[targetId]) {
            targetId = targetTilesets.length;
            if (targetId < 1) targetId = 1;
            while (targetTilesets[targetId]) {
                targetId++;
            }
        }

        const importedTileset = JSON.parse(JSON.stringify(sourceTileset));
        importedTileset.id = targetId;
        targetTilesets[targetId] = importedTileset;
        this.databaseManager.data.tilesets = targetTilesets;

        if (this.currentProject?.path) {
            await this.databaseManager.saveJSON(this.currentProject.path, 'Tilesets.json', targetTilesets);
        }

        return targetId;
    }

    getNextAvailableMapId() {
        const maps = this.currentProject?.maps || [];
        for (let i = 1; i < maps.length; i++) {
            if (!maps[i]) return i;
        }
        return Math.max(1, maps.length);
    }

    getUniqueMapName(baseName) {
        const maps = this.currentProject?.maps || [];
        const names = new Set(maps.filter(Boolean).map(map => map.name));
        if (!names.has(baseName)) return baseName;

        let index = 2;
        while (names.has(`${baseName} ${index}`)) {
            index++;
        }
        return `${baseName} ${index}`;
    }

    async deleteMap(mapId) {
        if (!this.currentProject || typeof nw === 'undefined') return;

        const map = this.currentProject.maps?.[mapId];
        if (!map) return;

        const mapIdsToDelete = this.getMapAndDescendantIds(mapId);
        const remainingMaps = (this.currentProject.maps || [])
            .filter(mapInfo => mapInfo && !mapIdsToDelete.includes(mapInfo.id));

        if (remainingMaps.length === 0) {
            alert('Cannot delete the last map in the project.');
            return;
        }

        const childCount = mapIdsToDelete.length - 1;
        const message = childCount > 0
            ? `Delete "${map.name || 'Unnamed Map'}" and ${childCount} child map${childCount === 1 ? '' : 's'}?\n\nThis removes their Map###.json files and MapInfos entries.`
            : `Delete "${map.name || 'Unnamed Map'}"?\n\nThis removes its Map${String(mapId).padStart(3, '0')}.json file and MapInfos entry.`;

        if (!confirm(message)) return;

        try {
            const fs = require('fs');
            const path = require('path');
            const dataDir = path.join(this.currentProject.path, 'data');
            const currentMapId = this.tilemapManager?.currentMap?.id || null;
            const deletingCurrentMap = mapIdsToDelete.includes(currentMapId);
            const nextMapId = deletingCurrentMap ? remainingMaps[0].id : currentMapId;

            for (const deleteId of mapIdsToDelete) {
                const mapPath = path.join(dataDir, `Map${String(deleteId).padStart(3, '0')}.json`);
                if (fs.existsSync(mapPath)) {
                    fs.unlinkSync(mapPath);
                }
                this.currentProject.maps[deleteId] = null;
            }

            for (const remainingMap of remainingMaps) {
                if (remainingMap.parentId && mapIdsToDelete.includes(remainingMap.parentId)) {
                    remainingMap.parentId = 0;
                }
            }
            this.recalculateAllMapOrders();
            await this.repairInvalidSystemMapReferences(mapIdsToDelete, remainingMaps[0]?.id || null);

            if (this.projectManager && this.projectManager.saveMapInfos) {
                this.projectManager.saveMapInfos(this.currentProject.path, this.currentProject.maps);
            }
            if (this.databaseManager?.data) {
                this.databaseManager.data.mapInfos = this.currentProject.maps;
            }

            const lastMapId = localStorage.getItem(this.getLastMapStorageKey());
            if (lastMapId && mapIdsToDelete.includes(parseInt(lastMapId, 10))) {
                localStorage.setItem(this.getLastMapStorageKey(), String(nextMapId));
            }

            this.renderMapsList();
            this.renderQuickAccessList();

            if (deletingCurrentMap && nextMapId) {
                await this.loadMap(nextMapId);
            }

            this.uiManager.updateStatus(`Deleted map: ${map.name || String(mapId).padStart(3, '0')}`);
        } catch (error) {
            console.error('Error deleting map:', error);
            alert('Failed to delete map. Check console for details.');
        }
    }

    getMapAndDescendantIds(mapId) {
        const maps = this.currentProject?.maps || [];
        const ids = [];
        const visit = (id) => {
            const map = maps[id];
            if (!map || ids.includes(id)) return;
            ids.push(id);
            maps.forEach(child => {
                if (child && child.parentId === id) {
                    visit(child.id);
                }
            });
        };
        visit(mapId);
        return ids;
    }

    recalculateAllMapOrders() {
        const maps = this.currentProject?.maps || [];
        const parentIds = new Set([0]);
        maps.forEach(map => {
            if (map) parentIds.add(map.parentId || 0);
        });
        parentIds.forEach(parentId => this.recalculateMapOrder(parentId));
    }

    async repairInvalidSystemMapReferences(deletedMapIds = [], fallbackMapId = null) {
        const system = this.databaseManager?.data?.system;
        if (!this.currentProject || !system || typeof nw === 'undefined') return false;

        const validMapId = fallbackMapId || this.getFirstPlayableMapId(deletedMapIds);
        if (!validMapId) return false;

        let changed = false;
        const isInvalidMapId = (mapId) => {
            if (!mapId) return false;
            if (deletedMapIds.includes(mapId)) return true;
            return !this.mapFileExists(mapId) || !this.currentProject.maps?.[mapId];
        };

        if (isInvalidMapId(system.startMapId)) {
            system.startMapId = validMapId;
            system.startX = 0;
            system.startY = 0;
            changed = true;
        }

        ['boat', 'ship', 'airship'].forEach(vehicleKey => {
            const vehicle = system[vehicleKey];
            if (vehicle && isInvalidMapId(vehicle.startMapId)) {
                vehicle.startMapId = 0;
                vehicle.startX = 0;
                vehicle.startY = 0;
                changed = true;
            }
        });

        if (changed && this.databaseManager.saveJSON) {
            await this.databaseManager.saveJSON(this.currentProject.path, 'System.json', system);
            this.uiManager.updateStatus(`Updated starting positions to avoid deleted maps`);
        }

        return changed;
    }

    getFirstPlayableMapId(excludedMapIds = []) {
        const maps = this.currentProject?.maps || [];
        const firstMap = maps.find(map => map && !excludedMapIds.includes(map.id) && this.mapFileExists(map.id));
        return firstMap ? firstMap.id : null;
    }

    mapFileExists(mapId) {
        if (!this.currentProject || typeof nw === 'undefined') return false;
        const fs = require('fs');
        const path = require('path');
        const mapPath = path.join(this.currentProject.path, 'data', `Map${String(mapId).padStart(3, '0')}.json`);
        return fs.existsSync(mapPath);
    }

    shiftMap(mapId) {
        alert('Shift - Coming soon!');
    }

    generateDungeon(mapId) {
        alert('Generate Dungeon - Coming soon!');
    }

    async saveMapAsImage(mapId) {
        if (!this.currentProject || !this.tilemapManager || typeof nw === 'undefined') return;

        const mapInfo = this.currentProject.maps?.[mapId];
        if (!mapInfo) return;

        try {
            const fs = require('fs');
            const path = require('path');

            if (this.tilemapManager.currentMap?.id === mapId) {
                this.tilemapManager.saveMap();
            }

            const mapPath = path.join(this.currentProject.path, 'data', `Map${String(mapId).padStart(3, '0')}.json`);
            if (!fs.existsSync(mapPath)) {
                alert('Map file not found.');
                return;
            }

            const mapData = JSON.parse(fs.readFileSync(mapPath, 'utf8'));
            const pixelWidth = (mapData.width || 0) * 48;
            const pixelHeight = (mapData.height || 0) * 48;
            const maxCanvasSize = 32767;
            if (!pixelWidth || !pixelHeight || pixelWidth > maxCanvasSize || pixelHeight > maxCanvasSize) {
                alert(`Map image is too large to export (${pixelWidth}x${pixelHeight}).`);
                return;
            }

            const safeName = (mapInfo.name || `Map${String(mapId).padStart(3, '0')}`)
                .replace(/[\\/:*?"<>|]/g, '_')
                .trim() || `Map${String(mapId).padStart(3, '0')}`;

            const input = document.createElement('input');
            input.type = 'file';
            input.setAttribute('nwsaveas', `${safeName}.png`);
            input.setAttribute('accept', '.png');
            input.setAttribute('nwworkingdir', this.currentProject.path);

            input.addEventListener('change', async () => {
                let outputPath = input.value || input.files?.[0]?.path;
                if (!outputPath) return;
                if (!outputPath.toLowerCase().endsWith('.png')) {
                    outputPath += '.png';
                }

                this.uiManager.updateStatus(`Exporting ${mapInfo.name || safeName}...`);

                const canvas = document.createElement('canvas');
                const success = await this.tilemapManager.renderMapToCanvas(mapId, canvas, {
                    includeEvents: false,
                    includeShadows: true,
                    includeParallax: true
                });

                if (!success) {
                    alert('Failed to render map image.');
                    this.uiManager.updateStatus('Map image export failed');
                    return;
                }

                const pngData = canvas.toDataURL('image/png').replace(/^data:image\/png;base64,/, '');
                fs.writeFileSync(outputPath, Buffer.from(pngData, 'base64'));
                this.uiManager.updateStatus(`Saved map image: ${outputPath}`);
            });

            input.click();
        } catch (error) {
            console.error('Error saving map image:', error);
            alert('Failed to save map image. Check console for details.');
            this.uiManager.updateStatus('Map image export failed');
        }
    }
}
