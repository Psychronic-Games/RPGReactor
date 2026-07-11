// RPG Reactor - Event Manager
// Handles event creation, editing, and management on maps

class EventManager {
    constructor(projectController, databaseManager) {
        this.projectController = projectController;
        this.databaseManager = databaseManager;
        this.currentMap = null;
        this.selectedEvent = null;
        this.clipboard = null; // For cut/copy/paste
        this.eventMode = false; // Whether event editing mode is active
        this.eventSprites = new Map(); // Map of event ID to sprite
        this.eventContainer = null; // Pixi container for event sprites
        this.contextMenu = null;
        this.findDialog = null;
        this.currentSearchResults = [];
        this.currentSearchIndex = 0;
        this.hoverHighlight = null; // Graphics for hover highlighting
        this.selectionHighlight = null; // Graphics for selection highlighting (stays on clicked tile)
        this.selectedTileX = null; // Currently selected tile X
        this.selectedTileY = null; // Currently selected tile Y
        this.isDragging = false; // Whether we're currently dragging an event
        this.draggedEvent = null; // The event being dragged
        this.dragOffset = { x: 0, y: 0 }; // Offset from event position to mouse position
        this.startingPositionContainer = null; // Container for starting position markers
        this.contextMenuCloseHandler = null; // Context menu close handler reference
        this.tilesetPaletteViewer = null; // Reference to tileset palette viewer for tile selection
        this.sidebarResizer = null; // Reference to sidebar resizer for updating handle visibility

        // Undo/Redo system
        this.undoStack = [];
        this.redoStack = [];
        this.maxUndoSteps = 50; // Maximum number of undo steps to store

        // Event editor
        this.eventEditor = null; // Will be initialized when needed

        // Callbacks
        this.onCoordinatesChange = null; // Callback for when mouse coordinates change
        this.onUndoStateChange = null; // Callback for when undo/redo availability changes

        // Setup event editor modal close button
        this.setupEventEditorModal();
    }

    // Set tileset palette viewer reference
    setTilesetPaletteViewer(viewer) {
        this.tilesetPaletteViewer = viewer;
    }

    // Set sidebar resizer reference
    setSidebarResizer(resizer) {
        this.sidebarResizer = resizer;
    }

    // Undo/Redo system methods
    saveState() {
        if (!this.currentMap) return;

        // Save a deep copy of the current events array
        const eventsData = JSON.parse(JSON.stringify(this.currentMap.events || []));
        this.undoStack.push(eventsData);

        // Clear redo stack on new action
        this.redoStack = [];

        // Limit undo stack size
        if (this.undoStack.length > this.maxUndoSteps) {
            this.undoStack.shift();
        }

        // Notify about undo state change
        this.notifyUndoStateChange();
    }

    undo() {
        if (this.undoStack.length === 0) return;

        // Save current state to redo stack
        const currentData = JSON.parse(JSON.stringify(this.currentMap.events || []));
        this.redoStack.push(currentData);

        // Restore previous state
        const previousData = this.undoStack.pop();
        this.currentMap.events = previousData;

        // Clear selection if the selected event no longer exists
        if (this.selectedEvent) {
            const eventStillExists = this.currentMap.events.find(e => e && e.id === this.selectedEvent.id);
            if (!eventStillExists) {
                this.selectedEvent = null;
                this.selectedTileX = null;
                this.selectedTileY = null;
            }
        }

        // Re-render events
        this.renderEvents();

        // Notify about undo state change
        this.notifyUndoStateChange();
    }

    redo() {
        if (this.redoStack.length === 0) return;

        // Save current state to undo stack
        const currentData = JSON.parse(JSON.stringify(this.currentMap.events || []));
        this.undoStack.push(currentData);

        // Restore next state
        const nextData = this.redoStack.pop();
        this.currentMap.events = nextData;

        // Clear selection if the selected event no longer exists
        if (this.selectedEvent) {
            const eventStillExists = this.currentMap.events.find(e => e && e.id === this.selectedEvent.id);
            if (!eventStillExists) {
                this.selectedEvent = null;
                this.selectedTileX = null;
                this.selectedTileY = null;
            }
        }

        // Re-render events
        this.renderEvents();

        // Notify about undo state change
        this.notifyUndoStateChange();
    }

    canUndo() {
        return this.undoStack.length > 0;
    }

    canRedo() {
        return this.redoStack.length > 0;
    }

    clearUndoHistory() {
        this.undoStack = [];
        this.redoStack = [];
        this.notifyUndoStateChange();
    }

    notifyUndoStateChange() {
        if (this.onUndoStateChange) {
            this.onUndoStateChange(this.canUndo(), this.canRedo());
        }
    }

    // Initialize event layer and container
    initializeEventLayer(tilemapManager) {
        if (!tilemapManager || !tilemapManager.container) {
            console.warn('Cannot initialize event layer: tilemap manager not ready');
            return;
        }

        // Remove old containers if they exist and parent has changed
        if (this.eventContainer && this.eventContainer.parent !== tilemapManager.container) {
            if (this.eventContainer.parent) {
                this.eventContainer.parent.removeChild(this.eventContainer);
            }
            this.eventContainer = null;
        }

        if (this.hoverHighlight && this.hoverHighlight.parent !== tilemapManager.container) {
            if (this.hoverHighlight.parent) {
                this.hoverHighlight.parent.removeChild(this.hoverHighlight);
            }
            this.hoverHighlight = null;
        }

        if (this.selectionHighlight && this.selectionHighlight.parent !== tilemapManager.container) {
            if (this.selectionHighlight.parent) {
                this.selectionHighlight.parent.removeChild(this.selectionHighlight);
            }
            this.selectionHighlight = null;
        }

        if (this.startingPositionContainer && this.startingPositionContainer.parent !== tilemapManager.container) {
            if (this.startingPositionContainer.parent) {
                this.startingPositionContainer.parent.removeChild(this.startingPositionContainer);
            }
            this.startingPositionContainer = null;
        }

        // Create event container if it doesn't exist
        if (!this.eventContainer) {
            this.eventContainer = new PIXI.Container();
            this.eventContainer.label = 'events';
            tilemapManager.container.addChild(this.eventContainer);
            console.log('Event container created');
        }

        // Create hover highlight graphics (not used in event mode)
        if (!this.hoverHighlight) {
            this.hoverHighlight = new PIXI.Graphics();
            this.hoverHighlight.visible = false;
            tilemapManager.container.addChild(this.hoverHighlight);
        }

        // Create selection highlight graphics (stays on selected tile)
        if (!this.selectionHighlight) {
            this.selectionHighlight = new PIXI.Graphics();
            this.selectionHighlight.visible = false;
            tilemapManager.container.addChild(this.selectionHighlight);
        }

        // Create starting position container
        if (!this.startingPositionContainer) {
            this.startingPositionContainer = new PIXI.Container();
            this.startingPositionContainer.label = 'startingPositions';
            tilemapManager.container.addChild(this.startingPositionContainer);
        }

        this.tilemapManager = tilemapManager;
    }

    // Set the current map
    setCurrentMap(mapData) {
        this.currentMap = mapData;
        this.selectedEvent = null;

        // Re-initialize event layer for the new map
        if (this.tilemapManager) {
            this.initializeEventLayer(this.tilemapManager);
        }

        this.renderEvents();

        // Re-establish event interaction if event mode is active
        if (this.eventMode) {
            this.setupEventInteraction();
            this.renderStartingPositions();
        }
    }

    // Enable/disable event mode
    setEventMode(enabled) {
        this.eventMode = enabled;
        console.log(`Event mode: ${enabled ? 'enabled' : 'disabled'}`);

        if (enabled) {
            this.setupEventInteraction();
            this.renderStartingPositions(); // Show starting positions when entering event mode
            if (this.startingPositionContainer) {
                this.startingPositionContainer.visible = true;
            }
            // Set cursor for event mode
            if (this.tilemapManager && this.tilemapManager.container) {
                this.tilemapManager.container.cursor = 'default';
            }
        } else {
            this.removeEventInteraction();
            // Hide starting positions when leaving event mode
            if (this.startingPositionContainer) {
                this.startingPositionContainer.visible = false;
            }
            // Restore cursor for tile editing mode
            if (this.tilemapManager && this.tilemapManager.container) {
                this.tilemapManager.container.cursor = 'crosshair';
            }
            // Hide coordinate display when leaving event mode
            if (this.onCoordinatesChange) {
                this.onCoordinatesChange(null, null);
            }
        }
    }

    // Set up right-click context menu and event interaction
    setupEventInteraction() {
        if (!this.tilemapManager || !this.tilemapManager.container) {
            console.warn('Cannot setup event interaction: tilemap manager not ready');
            return;
        }

        const container = this.tilemapManager.container;

        // Make container interactive
        container.interactive = true;
        container.cursor = 'default';

        // Disable browser context menu on the canvas
        const canvasElement = container.view || document.querySelector('canvas');
        if (canvasElement) {
            canvasElement.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                return false;
            });
        }

        // Mouse move handler - not needed in event mode, selection stays on clicked tile
        // (hover highlighting is only for tileset mode)

        // Mouse leave handler
        container.on('pointerleave', () => {
            // Selection highlight stays visible even when mouse leaves
        });

        // Right-click handler
        container.on('rightdown', (event) => {
            event.stopPropagation();
            event.data.originalEvent.preventDefault();

            // Suppress the native browser/NW.js context menu that follows this pointerdown
            const suppressContextMenu = (e) => { e.preventDefault(); e.stopPropagation(); };
            document.addEventListener('contextmenu', suppressContextMenu, { capture: true, once: true });

            // Cancel any ongoing drag
            if (this.isDragging) {
                this.isDragging = false;
                this.draggedEvent = null;
                this.dragOffset = { x: 0, y: 0 };
                if (this.tilemapManager.container) {
                    this.tilemapManager.container.cursor = 'default';
                }
            }

            const pos = event.data.getLocalPosition(container);
            const tileX = Math.floor(pos.x / this.tilemapManager.TILE_WIDTH);
            const tileY = Math.floor(pos.y / this.tilemapManager.TILE_HEIGHT);

            // Update selection to this tile
            this.selectTile(tileX, tileY);

            // Check if there's an event at this position
            const eventAtPos = this.getEventAt(tileX, tileY);

            // Use the original mouse event position for context menu
            const mouseX = event.data.originalEvent.clientX;
            const mouseY = event.data.originalEvent.clientY;

            this.showContextMenu(mouseX, mouseY, tileX, tileY, eventAtPos);
        });

        // Left-click handler for selecting tiles and events
        // Track click timing for double-click detection
        let lastClickTime = 0;
        let lastClickX = null;
        let lastClickY = null;
        const DOUBLE_CLICK_THRESHOLD = 300; // milliseconds

        container.on('pointerdown', (event) => {
            if (event.data.button === 0 && !event.data.originalEvent.shiftKey) {
                const pos = event.data.getLocalPosition(container);
                const tileX = Math.floor(pos.x / this.tilemapManager.TILE_WIDTH);
                const tileY = Math.floor(pos.y / this.tilemapManager.TILE_HEIGHT);

                // Check for double-click
                const currentTime = Date.now();
                const isDoubleClick = (currentTime - lastClickTime < DOUBLE_CLICK_THRESHOLD) &&
                                     (lastClickX === tileX && lastClickY === tileY);

                if (isDoubleClick) {
                    // Double-click detected - edit event if one exists at this position
                    const eventAtPos = this.getEventAt(tileX, tileY);
                    if (eventAtPos) {
                        this.editEvent(eventAtPos);
                        // Reset click tracking
                        lastClickTime = 0;
                        lastClickX = null;
                        lastClickY = null;
                        return;
                    }
                }

                // Update click tracking for double-click detection
                lastClickTime = currentTime;
                lastClickX = tileX;
                lastClickY = tileY;

                // Update selection to this tile
                this.selectTile(tileX, tileY);

                const eventAtPos = this.getEventAt(tileX, tileY);

                // If no event at position and tiles are selected from palette, create a tileset event
                if (!eventAtPos && this.tilesetPaletteViewer) {
                    const selectedTiles = this.tilesetPaletteViewer.getSelectedTiles();
                    // console.log('Selected tiles from palette:', selectedTiles);
                    if (selectedTiles && selectedTiles.length > 0) {
                        // Get the first selected tile (single tile selection for now)
                        const tile = selectedTiles[0];
                        console.log('First selected tile:', tile);
                        // Convert to RPG Maker tileId format
                        const tileId = this.convertToTileId(tile.layer, tile.x, tile.y);
                        console.log('Converted tileId:', tileId);
                        if (tileId > 0) {
                            this.createNewEventWithTileset(tileX, tileY, tileId);
                            // Clear selection after creating event to prevent creating multiple
                            this.tilesetPaletteViewer.clearSelection();
                            return; // Don't proceed with normal event selection
                        }
                    }
                }

                this.selectEvent(eventAtPos);

                // Start dragging if there's an event at this position
                if (eventAtPos) {
                    this.startDragging(eventAtPos, event);
                }
            }
        });

        // Mouse move handler for dragging
        container.on('pointermove', (event) => {
            if (this.isDragging && this.draggedEvent) {
                this.updateDrag(event);
            }
        });

        // Mouse up handler for finishing drag
        container.on('pointerup', (event) => {
            if (this.isDragging) {
                this.finishDragging(event);
            }
        });

        container.on('pointerupoutside', (event) => {
            if (this.isDragging) {
                this.finishDragging(event);
            }
        });
    }

    // Remove event interaction
    removeEventInteraction() {
        if (!this.tilemapManager || !this.tilemapManager.container) return;

        const container = this.tilemapManager.container;
        container.off('pointerdown');
        container.off('rightdown');
        container.off('pointerleave');
        container.off('pointermove');
        container.off('pointerup');
        container.off('pointerupoutside');

        // Hide selection highlight when leaving event mode
        if (this.selectionHighlight) {
            this.selectionHighlight.visible = false;
        }

        // Clear selected tile
        this.selectedTileX = null;
        this.selectedTileY = null;

        // Cancel any ongoing drag
        this.isDragging = false;
        this.draggedEvent = null;
    }

    // Select a tile (shows persistent highlight)
    selectTile(tileX, tileY) {
        if (!this.currentMap) return;

        // Check if tile is within map bounds
        if (tileX < 0 || tileX >= this.currentMap.width || tileY < 0 || tileY >= this.currentMap.height) {
            return;
        }

        // Update selected tile position
        this.selectedTileX = tileX;
        this.selectedTileY = tileY;

        // Update the selection highlight
        this.updateSelectionHighlight();

        // Update coordinate display in event mode
        if (this.eventMode && this.onCoordinatesChange) {
            this.onCoordinatesChange(tileX, tileY);
        }
    }

    // Update selection highlight (stays on selected tile)
    updateSelectionHighlight() {
        if (!this.selectionHighlight || !this.currentMap) return;

        if (this.selectedTileX === null || this.selectedTileY === null) {
            this.selectionHighlight.visible = false;
            return;
        }

        // Clear and redraw highlight
        this.selectionHighlight.clear();

        const tileWidth = this.tilemapManager.TILE_WIDTH;
        const tileHeight = this.tilemapManager.TILE_HEIGHT;

        // Check if there's an event at this position
        const eventAtPos = this.getEventAt(this.selectedTileX, this.selectedTileY);

        // Draw gold highlight for tiles with events, cyan for empty tiles
        const color = eventAtPos ? 0xFFD700 : 0x00ffff;
        const alpha = eventAtPos ? 0.35 : 0.3;

        // PIXI v8 API - draw filled rectangle
        this.selectionHighlight.rect(
            this.selectedTileX * tileWidth,
            this.selectedTileY * tileHeight,
            tileWidth,
            tileHeight
        );
        this.selectionHighlight.fill({ color: color, alpha: alpha });

        // Border (thicker for selection) - PIXI v8 API
        this.selectionHighlight.rect(
            this.selectedTileX * tileWidth,
            this.selectedTileY * tileHeight,
            tileWidth,
            tileHeight
        );
        this.selectionHighlight.stroke({ color: color, width: 3, alpha: 1.0 });

        this.selectionHighlight.visible = true;
    }

    // Show context menu
    showContextMenu(x, y, tileX, tileY, eventAtPos) {
        // Remove existing context menu if any
        this.hideContextMenu();

        // Create context menu
        this.contextMenu = document.createElement('div');
        this.contextMenu.id = 'event-context-menu';
        this.contextMenu.style.cssText = `
            position: fixed;
            left: ${x}px;
            top: ${y}px;
            background-color: var(--color-bg-menubar);
            border: 1px solid var(--color-border);
            border-radius: 4px;
            padding: 4px 0;
            z-index: 10001;
            min-width: 200px;
            box-shadow: 0 4px 8px rgba(0, 0, 0, 0.3);
        `;

        // Check if tiles are selected from palette for creating tileset events
        const createEventAction = () => {
            console.log('createEventAction called!');
            console.log('tilesetPaletteViewer exists?', !!this.tilesetPaletteViewer);

            // Check if tiles are selected from palette
            if (this.tilesetPaletteViewer) {
                const selectedTiles = this.tilesetPaletteViewer.getSelectedTiles();
                console.log('Context menu - Selected tiles from palette:', selectedTiles);
                if (selectedTiles && selectedTiles.length > 0) {
                    const tile = selectedTiles[0];
                    console.log('Context menu - First selected tile:', tile);
                    const tileId = this.convertToTileId(tile.layer, tile.x, tile.y);
                    console.log('Context menu - Converted tileId:', tileId);
                    if (tileId > 0) {
                        this.createNewEventWithTileset(tileX, tileY, tileId);
                        // Clear selection after creating event to prevent creating multiple
                        this.tilesetPaletteViewer.clearSelection();
                        return;
                    }
                }
            }
            // Fall back to regular event creation
            this.createNewEvent(tileX, tileY);
        };

        // Menu items
        const menuItems = [
            { label: this._t('eventCtx.newEvent'), action: createEventAction, enabled: !eventAtPos },
            { label: this._t('eventCtx.editEvent'), action: () => this.editEvent(eventAtPos), enabled: !!eventAtPos },
            { separator: true },
            { label: this._t('eventCtx.cutEvent'), action: () => this.cutEvent(eventAtPos), enabled: !!eventAtPos },
            { label: this._t('eventCtx.copyEvent'), action: () => this.copyEvent(eventAtPos), enabled: !!eventAtPos },
            { label: this._t('eventCtx.pasteEvent'), action: () => this.pasteEvent(tileX, tileY), enabled: true },
            { label: this._t('eventCtx.deleteEvent'), action: () => this.deleteEvent(eventAtPos), enabled: !!eventAtPos },
            { separator: true },
            { label: this._t('eventCtx.findEvent'), action: () => this.showFindDialog(), enabled: true },
            { label: this._t('eventCtx.findNext'), action: () => this.findNext(), enabled: this.currentSearchResults.length > 0 },
            { label: this._t('eventCtx.findPrev'), action: () => this.findPrevious(), enabled: this.currentSearchResults.length > 0 },
            { separator: true },
            { label: this._t('eventCtx.setStart'), submenu: [
                { label: this._t('eventCtx.player'), action: () => this.setStartingPosition(tileX, tileY, 'player') },
                { label: this._t('eventCtx.boat'), action: () => this.setStartingPosition(tileX, tileY, 'boat') },
                { label: this._t('eventCtx.ship'), action: () => this.setStartingPosition(tileX, tileY, 'ship') },
                { label: this._t('eventCtx.airship'), action: () => this.setStartingPosition(tileX, tileY, 'airship') }
            ] }
        ];

        menuItems.forEach(item => {
            if (item.separator) {
                const separator = document.createElement('div');
                separator.style.cssText = 'height: 1px; background: var(--color-border); margin: 4px 0;';
                this.contextMenu.appendChild(separator);
            } else if (item.submenu) {
                const menuItem = document.createElement('div');
                menuItem.className = 'context-menu-item';
                menuItem.textContent = item.label + ' ▶';
                menuItem.style.cssText = `
                    padding: 8px 16px;
                    cursor: pointer;
                    font-size: 13px;
                    color: var(--color-text);
                    position: relative;
                `;

                // Create submenu
                const submenu = document.createElement('div');
                submenu.style.cssText = `
                    position: absolute;
                    left: 100%;
                    top: 0;
                    background-color: var(--color-bg-menubar);
                    border: 1px solid var(--color-border);
                    border-radius: 4px;
                    padding: 4px 0;
                    min-width: 150px;
                    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.3);
                    display: none;
                `;

                item.submenu.forEach(subItem => {
                    const subMenuItem = document.createElement('div');
                    subMenuItem.className = 'context-menu-item';
                    subMenuItem.textContent = subItem.label;
                    subMenuItem.style.cssText = `
                        padding: 8px 16px;
                        cursor: pointer;
                        font-size: 13px;
                        color: var(--color-text);
                    `;

                    subMenuItem.addEventListener('click', () => {
                        subItem.action();
                        this.hideContextMenu();
                    });

                    subMenuItem.addEventListener('mouseenter', () => {
                        subMenuItem.style.backgroundColor = 'var(--color-accent-tint-25)';
                    });

                    subMenuItem.addEventListener('mouseleave', () => {
                        subMenuItem.style.backgroundColor = 'transparent';
                    });

                    submenu.appendChild(subMenuItem);
                });

                menuItem.appendChild(submenu);

                menuItem.addEventListener('mouseenter', () => {
                    menuItem.style.backgroundColor = 'var(--color-accent-tint-25)';
                    submenu.style.display = 'block';
                });

                menuItem.addEventListener('mouseleave', () => {
                    menuItem.style.backgroundColor = 'transparent';
                    submenu.style.display = 'none';
                });

                this.contextMenu.appendChild(menuItem);
            } else {
                const menuItem = document.createElement('div');
                menuItem.className = 'context-menu-item';
                menuItem.textContent = item.label;
                menuItem.style.cssText = `
                    padding: 8px 16px;
                    cursor: ${item.enabled ? 'pointer' : 'not-allowed'};
                    font-size: 13px;
                    color: ${item.enabled ? 'var(--color-text)' : 'var(--color-text-dim)'};
                `;

                if (item.enabled) {
                    menuItem.addEventListener('click', () => {
                        item.action();
                        this.hideContextMenu();
                    });

                    menuItem.addEventListener('mouseenter', () => {
                        menuItem.style.backgroundColor = 'var(--color-accent-tint-25)';
                    });

                    menuItem.addEventListener('mouseleave', () => {
                        menuItem.style.backgroundColor = 'transparent';
                    });
                }

                this.contextMenu.appendChild(menuItem);
            }
        });

        document.body.appendChild(this.contextMenu);

        // Adjust position if menu overflows the viewport
        const menuRect = this.contextMenu.getBoundingClientRect();
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;

        if (menuRect.bottom > viewportHeight) {
            this.contextMenu.style.top = Math.max(0, viewportHeight - menuRect.height) + 'px';
        }
        if (menuRect.right > viewportWidth) {
            this.contextMenu.style.left = Math.max(0, viewportWidth - menuRect.width) + 'px';
        }

        // Close context menu when clicking elsewhere
        const closeHandler = (e) => {
            if (this.contextMenu && !this.contextMenu.contains(e.target)) {
                this.hideContextMenu();
                document.removeEventListener('click', closeHandler);
            }
        };

        // Store the close handler so we can remove it later
        this.contextMenuCloseHandler = closeHandler;

        setTimeout(() => {
            document.addEventListener('click', closeHandler);
        }, 10);
    }

    // Hide context menu
    hideContextMenu() {
        if (this.contextMenu) {
            this.contextMenu.remove();
            this.contextMenu = null;
        }

        // Remove the close handler if it exists
        if (this.contextMenuCloseHandler) {
            document.removeEventListener('click', this.contextMenuCloseHandler);
            this.contextMenuCloseHandler = null;
        }
    }

    // Get event at position
    getEventAt(x, y) {
        if (!this.currentMap || !this.currentMap.events) return null;

        return this.currentMap.events.find(event =>
            event && event.x === x && event.y === y
        );
    }

    // Select an event
    selectEvent(event) {
        const previousEvent = this.selectedEvent;
        this.selectedEvent = event;

        // Update selected tile coordinates for yellow highlight
        if (event) {
            this.selectedTileX = event.x;
            this.selectedTileY = event.y;
            this.updateSelectionHighlight(); // Update map highlight
        }

        // Update only the border color on affected sprites instead of full re-render
        if (previousEvent && previousEvent.id !== (event && event.id)) {
            this.updateEventSpriteBorder(previousEvent.id, false);
        }
        if (event) {
            this.updateEventSpriteBorder(event.id, true);
        }

        this.updateEventListSelection(); // Update sidebar list selection
    }

    // Update just the border color on an event sprite (green=selected, white=normal)
    updateEventSpriteBorder(eventId, isSelected) {
        const sprite = this.eventSprites.get(eventId);
        if (!sprite || !sprite.children || sprite.children.length === 0) return;

        // The first child is the Graphics object with background + border
        const graphics = sprite.children[0];
        if (!(graphics instanceof PIXI.Graphics)) return;

        const tileWidth = this.tilemapManager.TILE_WIDTH;
        const tileHeight = this.tilemapManager.TILE_HEIGHT;
        const borderColor = isSelected ? 0x00ff00 : 0xffffff;

        // Rebuild graphics (background + border)
        graphics.clear();
        graphics.rect(0, 0, tileWidth, tileHeight);
        graphics.fill({ color: 0x000000, alpha: 0.75 });
        graphics.rect(0, 0, tileWidth, tileHeight);
        graphics.stroke({ width: 1, color: borderColor });
    }

    // Select an event by ID
    selectEventById(eventId) {
        if (!this.currentMap || !this.currentMap.events) return;

        const event = this.currentMap.events.find(e => e && e.id === eventId);
        if (event) {
            this.selectEvent(event);
        }
    }

    // Start dragging an event
    startDragging(event, pointerEvent) {
        // Save state for undo (before moving the event)
        this.saveState();

        this.isDragging = true;
        this.draggedEvent = event;

        // Calculate offset from event position to mouse position
        const pos = pointerEvent.data.getLocalPosition(this.tilemapManager.container);
        const eventPixelX = event.x * this.tilemapManager.TILE_WIDTH;
        const eventPixelY = event.y * this.tilemapManager.TILE_HEIGHT;

        this.dragOffset.x = pos.x - eventPixelX;
        this.dragOffset.y = pos.y - eventPixelY;

        // Change cursor to grabbing
        if (this.tilemapManager.container) {
            this.tilemapManager.container.cursor = 'grabbing';
        }

        console.log(`Started dragging event ${event.name} from (${event.x}, ${event.y})`);
    }

    // Update drag position
    updateDrag(pointerEvent) {
        if (!this.isDragging || !this.draggedEvent) return;

        const pos = pointerEvent.data.getLocalPosition(this.tilemapManager.container);

        // Calculate new tile position based on mouse position
        const newPixelX = pos.x - this.dragOffset.x;
        const newPixelY = pos.y - this.dragOffset.y;
        const newTileX = Math.floor((newPixelX + this.tilemapManager.TILE_WIDTH / 2) / this.tilemapManager.TILE_WIDTH);
        const newTileY = Math.floor((newPixelY + this.tilemapManager.TILE_HEIGHT / 2) / this.tilemapManager.TILE_HEIGHT);

        // Check if position changed
        if (newTileX !== this.draggedEvent.x || newTileY !== this.draggedEvent.y) {
            // Check bounds
            if (newTileX >= 0 && newTileX < this.currentMap.width &&
                newTileY >= 0 && newTileY < this.currentMap.height) {

                // Check if there's another event at the target position (but not the dragged one)
                const existingEvent = this.getEventAt(newTileX, newTileY);
                if (!existingEvent || existingEvent.id === this.draggedEvent.id) {
                    // Update event position
                    this.draggedEvent.x = newTileX;
                    this.draggedEvent.y = newTileY;

                    // Update selection to follow the dragged event
                    this.selectTile(newTileX, newTileY);

                    // Re-render events
                    this.renderEvents();
                }
            }
        }
    }

    // Finish dragging
    finishDragging(pointerEvent) {
        if (!this.isDragging || !this.draggedEvent) return;

        console.log(`Finished dragging event ${this.draggedEvent.name} to (${this.draggedEvent.x}, ${this.draggedEvent.y})`);

        // Reset cursor
        if (this.tilemapManager.container) {
            this.tilemapManager.container.cursor = 'default';
        }

        this.isDragging = false;
        this.draggedEvent = null;
        this.dragOffset = { x: 0, y: 0 };

        // Final render to update appearance
        this.renderEvents();
    }

    // Convert layer, x, y to RPG Maker tileId
    convertToTileId(layer, x, y) {
        // RPG Maker MZ tile ID calculation:
        // B-E layers: tileId = y * 8 + x (starting from 0)
        // A5 layer: tileId = 1536 + (y * 8 + x)
        // A1-A4 (autotiles): tileId = 2048 + (kind * 48) where kind is the autotile index

        if (layer === 'A1' || layer === 'A2' || layer === 'A3' || layer === 'A4') {
            // Autotiles - each tile in the palette is a "kind"
            // A1: 16 kinds (0-15)
            // A2: 32 kinds (16-47)
            // A3: 32 kinds (48-79)
            // A4: 48 kinds (80-127)

            let kindOffset = 0;
            let kindsPerRow = 8; // 8 columns in the palette

            if (layer === 'A1') {
                kindOffset = 0;
            } else if (layer === 'A2') {
                kindOffset = 16;
            } else if (layer === 'A3') {
                kindOffset = 48;
            } else if (layer === 'A4') {
                kindOffset = 80;
            }

            const kind = y * kindsPerRow + x;
            return 2048 + ((kindOffset + kind) * 48);
        } else if (layer === 'A5') {
            // A5 tiles start at 1536
            return 1536 + (y * 8 + x);
        } else if (layer === 'B' || layer === 'C' || layer === 'D' || layer === 'E') {
            // Regular tiles B-E
            const tileIndex = y * 8 + x;

            if (layer === 'B') {
                return tileIndex;
            } else if (layer === 'C') {
                return 256 + tileIndex;
            } else if (layer === 'D') {
                return 512 + tileIndex;
            } else if (layer === 'E') {
                return 768 + tileIndex;
            }
        }

        return 0; // Invalid
    }

    // Create new event with tileset graphic
    createNewEventWithTileset(x, y, tileId) {
        console.log(`createNewEventWithTileset called: position (${x}, ${y}), tileId: ${tileId}`);

        if (!this.currentMap) {
            console.warn('No map loaded');
            return;
        }

        // Save state for undo
        this.saveState();

        // Find next available event ID
        const events = this.currentMap.events || [];
        let nextId = 1;
        for (let i = 1; i < events.length; i++) {
            if (!events[i]) {
                nextId = i;
                break;
            }
        }
        if (nextId === 1 && events.length > 1) {
            nextId = events.length;
        }

        // Create new event with tileset graphic
        const newEvent = {
            id: nextId,
            name: `EV${String(nextId).padStart(3, '0')}`,
            note: '',
            pages: [{
                conditions: {
                    actorId: 1,
                    actorValid: false,
                    itemId: 1,
                    itemValid: false,
                    selfSwitchCh: 'A',
                    selfSwitchValid: false,
                    switch1Id: 1,
                    switch1Valid: false,
                    switch2Id: 1,
                    switch2Valid: false,
                    variableId: 1,
                    variableValid: false,
                    variableValue: 0
                },
                directionFix: false,
                image: {
                    tileId: tileId, // Set tileset graphic
                    characterName: '',
                    direction: 2,
                    pattern: 0,
                    characterIndex: 0
                },
                moveFrequency: 3,
                moveRoute: {
                    list: [{ code: 0, indent: null, parameters: [] }],
                    repeat: true,
                    skippable: false,
                    wait: false
                },
                moveSpeed: 3,
                moveType: 0,
                priorityType: 1, // Same level as characters
                stepAnime: false,
                through: false,
                trigger: 0,
                walkAnime: false, // Tileset events don't animate
                list: [{ code: 0, indent: 0, parameters: [] }]
            }],
            x: x,
            y: y
        };

        // Add event to map
        if (!this.currentMap.events) {
            this.currentMap.events = [];
        }
        this.currentMap.events[nextId] = newEvent;

        console.log('Created event with image data:', JSON.stringify(newEvent.pages[0].image, null, 2));

        // Select and render
        this.selectedEvent = newEvent;
        this.renderEvents();

        console.log(`Created new tileset event ${newEvent.name} at (${x}, ${y}) with tileId ${tileId}`);

        // Show edit dialog
        this.editEvent(newEvent);
    }

    // Create new event
    createNewEvent(x, y) {
        if (!this.currentMap) {
            console.warn('No map loaded');
            return;
        }

        // Save state for undo
        this.saveState();

        // Find next available event ID
        const events = this.currentMap.events || [];
        let nextId = 1;
        for (let i = 1; i < events.length; i++) {
            if (!events[i]) {
                nextId = i;
                break;
            }
        }
        if (nextId === 1 && events.length > 1) {
            nextId = events.length;
        }

        // Create new event with default structure
        const newEvent = {
            id: nextId,
            name: `EV${String(nextId).padStart(3, '0')}`,
            note: '',
            pages: [{
                conditions: {
                    actorId: 1,
                    actorValid: false,
                    itemId: 1,
                    itemValid: false,
                    selfSwitchCh: 'A',
                    selfSwitchValid: false,
                    switch1Id: 1,
                    switch1Valid: false,
                    switch2Id: 1,
                    switch2Valid: false,
                    variableId: 1,
                    variableValid: false,
                    variableValue: 0
                },
                directionFix: false,
                image: {
                    tileId: 0,
                    characterName: '',
                    direction: 2,
                    pattern: 0,
                    characterIndex: 0
                },
                moveFrequency: 3,
                moveRoute: {
                    list: [{ code: 0, indent: null, parameters: [] }],
                    repeat: true,
                    skippable: false,
                    wait: false
                },
                moveSpeed: 3,
                moveType: 0,
                priorityType: 1,
                stepAnime: false,
                through: false,
                trigger: 0,
                walkAnime: true,
                list: [{ code: 0, indent: 0, parameters: [] }]
            }],
            x: x,
            y: y
        };

        // Add event to map
        if (!this.currentMap.events) {
            this.currentMap.events = [];
        }
        this.currentMap.events[nextId] = newEvent;

        // Select and render
        this.selectedEvent = newEvent;
        this.renderEvents();

        console.log(`Created new event ${newEvent.name} at (${x}, ${y})`);

        // Show edit dialog
        this.editEvent(newEvent);
    }

    // Setup event editor modal
    setupEventEditorModal() {
        const modal = document.getElementById('event-editor-modal');
        const closeBtn = document.getElementById('event-editor-close-btn');

        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                if (modal) {
                    modal.style.display = 'none';
                }
            });
        }

        // Close modal when clicking outside
        if (modal) {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    modal.style.display = 'none';
                }
            });
        }
    }

    // Edit event
    editEvent(event) {
        if (!event) {
            console.warn('No event to edit');
            return;
        }

        // Initialize event editor if not already created
        if (!this.eventEditor) {
            this.eventEditor = new EventEditor(
                null, // mapManager (not needed for now)
                this.databaseManager,
                this.projectController // Pass the whole controller so we can access currentProject
            );
        }

        // Get the modal and content container
        const modal = document.getElementById('event-editor-modal');
        const content = document.getElementById('event-editor-content');

        if (!modal || !content) {
            console.error('Event editor modal not found');
            return;
        }

        // Clear previous content
        content.innerHTML = '';

        // Show the event editor
        this.eventEditor.showEventEditor(content, event);

        // Display the modal
        modal.style.display = 'flex';

        console.log('Event editor opened for:', event.name);
    }

    // Cut event
    cutEvent(event) {
        if (!event) return;

        this.clipboard = JSON.parse(JSON.stringify(event));
        this.clipboard.cut = true;
        if (typeof ReactorClipboard !== 'undefined') {
            ReactorClipboard.write('event', { event: this.clipboard, cut: true });
        }
        this.deleteEvent(event);
        console.log('Event cut to clipboard');
    }

    // Copy event
    copyEvent(event) {
        if (!event) return;

        this.clipboard = JSON.parse(JSON.stringify(event));
        this.clipboard.cut = false;
        if (typeof ReactorClipboard !== 'undefined') {
            ReactorClipboard.write('event', { event: this.clipboard, cut: false });
        }
        console.log('Event copied to clipboard');
    }

    // Paste event
    async pasteEvent(x, y) {
        if (!this.currentMap) return;

        let eventData = this.clipboard;
        if (!eventData && typeof ReactorClipboard !== 'undefined') {
            const clipboardData = await ReactorClipboard.read('event');
            eventData = clipboardData?.payload?.event || null;
        }

        if (!eventData) {
            alert('No event in clipboard to paste.');
            return;
        }

        // Check if there's already an event at this position
        if (this.getEventAt(x, y)) {
            alert('There is already an event at this position.');
            return;
        }

        // Save state for undo
        this.saveState();

        // Find next available event ID
        const events = this.currentMap.events || [];
        let nextId = 1;
        for (let i = 1; i < events.length; i++) {
            if (!events[i]) {
                nextId = i;
                break;
            }
        }
        if (nextId === 1 && events.length > 1) {
            nextId = events.length;
        }

        // Create new event from clipboard
        const newEvent = JSON.parse(JSON.stringify(eventData));
        delete newEvent.cut;
        newEvent.id = nextId;
        newEvent.x = x;
        newEvent.y = y;
        newEvent.name = `EV${String(nextId).padStart(3, '0')}`;

        // Add to map
        this.currentMap.events[nextId] = newEvent;

        // Clear clipboard if it was a cut operation
        if (this.clipboard && this.clipboard.cut) {
            this.clipboard = null;
        }

        this.renderEvents();
        console.log(`Event pasted at (${x}, ${y})`);
    }

    // Delete event
    deleteEvent(event) {
        if (!event || !this.currentMap) return;

        // No confirmation - just delete
        {
            // Save state for undo
            this.saveState();

            // Remove from events array
            this.currentMap.events[event.id] = null;

            if (this.selectedEvent === event) {
                this.selectedEvent = null;
            }

            this.renderEvents();
            console.log(`Event ${event.name} deleted`);
        }
    }

    // Show find dialog
    _t(key, params) {
        return window.I18n ? window.I18n.t(key, params) : key;
    }

    showFindDialog() {
        if (this.findDialog) {
            this.findDialog.remove();
        }

        this.findDialog = document.createElement('div');
        this.findDialog.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background-color: var(--color-bg-menubar);
            border: 1px solid var(--color-border);
            border-radius: 8px;
            padding: 20px;
            z-index: 10002;
            min-width: 400px;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
        `;

        this.findDialog.innerHTML = `
            <h3 style="margin-top: 0; color: var(--color-text);" data-i18n="eventFind.title">Find Event</h3>
            <div style="margin-bottom: 16px;">
                <label style="display: block; color: var(--color-text-muted); margin-bottom: 4px;" data-i18n="eventFind.searchBy">Search by name or ID:</label>
                <input type="text" id="event-search-input" style="
                    width: 100%;
                    background-color: var(--color-bg-surface);
                    border: 1px solid var(--color-border-input);
                    color: var(--color-text);
                    padding: 8px;
                    font-size: 13px;
                    border-radius: 3px;
                ">
            </div>
            <div style="display: flex; gap: 8px; justify-content: flex-end;">
                <button id="event-search-cancel" class="rr-btn-secondary" data-i18n="common.cancel">Cancel</button>
                <button id="event-search-find" style="
                    background-color: var(--color-link);
                    border: none;
                    color: white;
                    padding: 8px 16px;
                    cursor: pointer;
                    border-radius: 3px;
                " data-i18n="eventFind.find">Find</button>
            </div>
        `;

        document.body.appendChild(this.findDialog);
        if (window.I18n && window.I18n.apply) window.I18n.apply(this.findDialog);

        const input = document.getElementById('event-search-input');
        const findBtn = document.getElementById('event-search-find');
        const cancelBtn = document.getElementById('event-search-cancel');

        input.focus();

        findBtn.addEventListener('click', () => {
            this.performSearch(input.value);
            this.findDialog.remove();
            this.findDialog = null;
        });

        cancelBtn.addEventListener('click', () => {
            this.findDialog.remove();
            this.findDialog = null;
        });

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                this.performSearch(input.value);
                this.findDialog.remove();
                this.findDialog = null;
            } else if (e.key === 'Escape') {
                this.findDialog.remove();
                this.findDialog = null;
            }
        });
    }

    // Perform search
    performSearch(query) {
        if (!this.currentMap || !query) return;

        const lowerQuery = query.toLowerCase();
        this.currentSearchResults = [];

        // Search through events
        if (this.currentMap.events) {
            this.currentMap.events.forEach(event => {
                if (!event) return;

                if (event.name.toLowerCase().includes(lowerQuery) ||
                    String(event.id).includes(query)) {
                    this.currentSearchResults.push(event);
                }
            });
        }

        this.currentSearchIndex = 0;

        if (this.currentSearchResults.length > 0) {
            this.selectEvent(this.currentSearchResults[0]);
            this.centerOnEvent(this.currentSearchResults[0]);
            console.log(`Found ${this.currentSearchResults.length} events matching "${query}"`);
        } else {
            alert(`No events found matching "${query}"`);
        }
    }

    // Find next
    findNext() {
        if (this.currentSearchResults.length === 0) return;

        this.currentSearchIndex = (this.currentSearchIndex + 1) % this.currentSearchResults.length;
        const event = this.currentSearchResults[this.currentSearchIndex];
        this.selectEvent(event);
        this.centerOnEvent(event);
    }

    // Find previous
    findPrevious() {
        if (this.currentSearchResults.length === 0) return;

        this.currentSearchIndex = (this.currentSearchIndex - 1 + this.currentSearchResults.length) % this.currentSearchResults.length;
        const event = this.currentSearchResults[this.currentSearchIndex];
        this.selectEvent(event);
        this.centerOnEvent(event);
    }

    // Center view on event
    centerOnEvent(event) {
        if (!event || !this.tilemapManager) return;

        const canvasContainer = document.getElementById('canvas-container');
        if (!canvasContainer) return;

        const eventPixelX = event.x * this.tilemapManager.TILE_WIDTH;
        const eventPixelY = event.y * this.tilemapManager.TILE_HEIGHT;

        // Center the view on the event
        const centerX = canvasContainer.clientWidth / 2;
        const centerY = canvasContainer.clientHeight / 2;

        canvasContainer.scrollLeft = eventPixelX - centerX;
        canvasContainer.scrollTop = eventPixelY - centerY;

        // Update selection to this tile
        this.selectTile(event.x, event.y);
    }

    // Set starting position
    async setStartingPosition(x, y, type) {
        const currentProject = this.projectController.getCurrentProject();
        if (!currentProject) {
            console.warn('No project loaded');
            return;
        }

        // Get system data
        const systemData = this.databaseManager.getSystem();
        if (!systemData) {
            console.warn('System data not available');
            return;
        }

        // Get current map ID from the loaded map
        const mapId = this.currentMap ? (this.currentMap.id || 1) : 1;

        // Update starting position based on type
        switch (type) {
            case 'player':
                systemData.startMapId = mapId;
                systemData.startX = x;
                systemData.startY = y;
                console.log(`Player starting position set to (${x}, ${y}) on map ${mapId}`);
                alert(`Player starting position set to (${x}, ${y}) on Map ${mapId}`);
                break;
            case 'boat':
                if (!systemData.boat) {
                    systemData.boat = {
                        bgm: { name: 'Ship1', pan: 0, pitch: 100, volume: 90 },
                        characterIndex: 0,
                        characterName: 'Vehicle',
                        startMapId: 0,
                        startX: 0,
                        startY: 0
                    };
                }
                systemData.boat.startMapId = mapId;
                systemData.boat.startX = x;
                systemData.boat.startY = y;
                console.log(`Boat starting position set to (${x}, ${y}) on map ${mapId}`);
                alert(`Boat starting position set to (${x}, ${y}) on Map ${mapId}`);
                break;
            case 'ship':
                if (!systemData.ship) {
                    systemData.ship = {
                        bgm: { name: 'Ship2', pan: 0, pitch: 100, volume: 90 },
                        characterIndex: 1,
                        characterName: 'Vehicle',
                        startMapId: 0,
                        startX: 0,
                        startY: 0
                    };
                }
                systemData.ship.startMapId = mapId;
                systemData.ship.startX = x;
                systemData.ship.startY = y;
                console.log(`Ship starting position set to (${x}, ${y}) on map ${mapId}`);
                alert(`Ship starting position set to (${x}, ${y}) on Map ${mapId}`);
                break;
            case 'airship':
                if (!systemData.airship) {
                    systemData.airship = {
                        bgm: { name: 'Ship3', pan: 0, pitch: 100, volume: 90 },
                        characterIndex: 3,
                        characterName: 'Vehicle',
                        startMapId: 0,
                        startX: 0,
                        startY: 0
                    };
                }
                systemData.airship.startMapId = mapId;
                systemData.airship.startX = x;
                systemData.airship.startY = y;
                console.log(`Airship starting position set to (${x}, ${y}) on map ${mapId}`);
                alert(`Airship starting position set to (${x}, ${y}) on Map ${mapId}`);
                break;
        }

        // Save the System.json file
        try {
            const projectPath = currentProject.path;
            await this.databaseManager.saveJSON(projectPath, 'System.json', systemData);
            console.log('System.json saved with new starting position');
        } catch (error) {
            console.error('Error saving System.json:', error);
            alert('Error saving starting position. Check console for details.');
        }

        // Re-render starting position markers for the current map
        // This will show the new marker if on this map, or hide it if moved to another map
        this.renderStartingPositions();
    }

    // Render events on the map
    renderEvents() {
        if (!this.eventContainer || !this.currentMap) return;

        // Clear existing event sprites
        this.eventContainer.removeChildren();
        this.eventSprites.clear();

        // Render each event
        if (this.currentMap.events) {
            this.currentMap.events.forEach(event => {
                if (!event) return;

                const sprite = this.createEventSprite(event);
                this.eventContainer.addChild(sprite);
                this.eventSprites.set(event.id, sprite);
            });
        }

        // Update selection highlight in case event status changed
        this.updateSelectionHighlight();

        // Update events list in sidebar
        this.updateEventsList();
    }

    // Update the events list in the sidebar
    updateEventsList() {
        const eventsListEl = document.getElementById('events-list');
        const eventsSectionEl = document.getElementById('events-section');

        if (!eventsListEl || !eventsSectionEl) return;

        // Show the events section when a map is loaded (use 'flex' explicitly for reliable layout)
        eventsSectionEl.style.display = 'flex';

        // Reset scroll position to prevent hidden headers (NW.js overflow:hidden scroll bug)
        eventsSectionEl.scrollTop = 0;
        const sidebar = document.getElementById('sidebar');
        if (sidebar) sidebar.scrollTop = 0;

        // Clear existing list
        eventsListEl.innerHTML = '';

        if (!this.currentMap || !this.currentMap.events || this.currentMap.events.length <= 1) {
            // No events (index 0 is null in MZ)
            eventsListEl.innerHTML = '<div class="tree-item" style="color: var(--color-text-muted); padding: 6px 8px;">No events on this map</div>';
            return;
        }

        // Add each event to the list
        this.currentMap.events.forEach((event, index) => {
            if (!event || index === 0) return; // Skip null and index 0

            const item = document.createElement('div');
            item.className = 'tree-item event-list-item';
            item.dataset.eventId = event.id;
            item.textContent = `${String(event.id).padStart(3, '0')}: ${event.name || 'Unnamed Event'}`;
            item.style.padding = '6px 8px';
            item.style.cursor = 'pointer';
            item.style.fontSize = '14px';
            item.style.borderRadius = '3px';
            item.style.margin = '2px 4px';

            // Click handler - select event on map
            item.addEventListener('click', (e) => {
                e.stopPropagation();
                this.selectEventById(event.id);
            });

            // Double-click handler - open event editor
            item.addEventListener('dblclick', (e) => {
                e.stopPropagation();
                this.selectEventById(event.id);
                this.editEvent(event);
            });

            // Right-click context menu
            item.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.selectEventById(event.id);
                this.showContextMenu(e.clientX, e.clientY, event.x, event.y, event);
            });

            eventsListEl.appendChild(item);
        });

        // Update selection highlight after populating list
        this.updateEventListSelection();

        // Update resize handles visibility
        if (this.sidebarResizer) {
            this.sidebarResizer.refresh();
        }
    }

    // Highlight the selected event in the sidebar list
    updateEventListSelection() {
        const eventsListEl = document.getElementById('events-list');
        if (!eventsListEl) return;

        // Remove previous selection (only the one that was selected, not all items)
        const previouslySelected = eventsListEl.querySelector('.event-list-item.selected');
        if (previouslySelected) {
            previouslySelected.classList.remove('selected');
            previouslySelected.style.backgroundColor = '';
        }

        // Highlight current selection with gold color
        if (this.selectedEvent) {
            const selectedItem = eventsListEl.querySelector(`[data-event-id="${this.selectedEvent.id}"]`);
            if (selectedItem) {
                selectedItem.classList.add('selected');
                selectedItem.style.backgroundColor = 'var(--color-accent-tint-35)'; // Gold highlight

                // Scroll into view if needed
                selectedItem.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            }
        }
    }

    // Render starting position markers
    renderStartingPositions() {
        if (!this.startingPositionContainer || !this.currentMap) return;

        // Clear existing markers
        this.startingPositionContainer.removeChildren();

        const systemData = this.databaseManager.getSystem();
        if (!systemData) return;

        const mapId = this.currentMap.id;
        console.log(`Rendering starting positions for map ${mapId}`);
        console.log(`Player start is on map ${systemData.startMapId} at (${systemData.startX}, ${systemData.startY})`);

        // Render player starting position
        if (systemData.startMapId === mapId) {
            console.log(`Rendering player starting position marker at (${systemData.startX}, ${systemData.startY})`);
            this.createStartingPositionMarker(systemData.startX, systemData.startY, 'Player', 0x00ff00);
        }

        // Render boat starting position
        if (systemData.boat && systemData.boat.startMapId === mapId) {
            this.createStartingPositionMarker(systemData.boat.startX, systemData.boat.startY, 'Boat', 0x0088ff);
        }

        // Render ship starting position
        if (systemData.ship && systemData.ship.startMapId === mapId) {
            this.createStartingPositionMarker(systemData.ship.startX, systemData.ship.startY, 'Ship', 0xff8800);
        }

        // Render airship starting position
        if (systemData.airship && systemData.airship.startMapId === mapId) {
            this.createStartingPositionMarker(systemData.airship.startX, systemData.airship.startY, 'Airship', 0xff00ff);
        }

        // Make container visible
        this.startingPositionContainer.visible = true;
    }

    // Create a starting position marker
    createStartingPositionMarker(x, y, label, color) {
        const container = new PIXI.Container();
        container.x = x * this.tilemapManager.TILE_WIDTH;
        container.y = y * this.tilemapManager.TILE_HEIGHT;

        // Draw marker background - PIXI v8 API
        const graphics = new PIXI.Graphics();
        graphics.rect(0, 0, this.tilemapManager.TILE_WIDTH, this.tilemapManager.TILE_HEIGHT);
        graphics.fill({ color: color, alpha: 0.5 });

        // Draw marker border - PIXI v8 API
        graphics.rect(0, 0, this.tilemapManager.TILE_WIDTH, this.tilemapManager.TILE_HEIGHT);
        graphics.stroke({ color: color, width: 3, alpha: 1.0 });

        container.addChild(graphics);

        // Add label text
        const text = new PIXI.Text({
            text: label,
            style: {
                fontSize: 9,
                fill: 0xffffff,
                align: 'center',
                fontWeight: 'bold',
                stroke: { color: 0x000000, width: 2 }
            }
        });
        text.x = this.tilemapManager.TILE_WIDTH / 2;
        text.y = this.tilemapManager.TILE_HEIGHT / 2;
        text.anchor.set(0.5);
        container.addChild(text);

        this.startingPositionContainer.addChild(container);
    }

    // Create sprite for an event
    createEventSprite(event) {
        const container = new PIXI.Container();
        container.x = event.x * this.tilemapManager.TILE_WIDTH;
        container.y = event.y * this.tilemapManager.TILE_HEIGHT;

        const isDragging = this.isDragging && this.draggedEvent && this.draggedEvent.id === event.id;
        const isSelected = this.selectedEvent && this.selectedEvent.id === event.id;

        // Always draw the black background box with white border (RPG Maker style)
        const graphics = new PIXI.Graphics();

        // Black background - more opaque - PIXI v8 API
        const bgAlpha = isDragging ? 0.9 : 0.75;
        graphics.rect(0, 0, this.tilemapManager.TILE_WIDTH, this.tilemapManager.TILE_HEIGHT);
        graphics.fill({ color: 0x000000, alpha: bgAlpha });

        // White border (or green if selected) - narrow border - PIXI v8 API
        const borderColor = isSelected ? 0x00ff00 : 0xffffff;
        graphics.rect(0, 0, this.tilemapManager.TILE_WIDTH, this.tilemapManager.TILE_HEIGHT);
        graphics.stroke({ width: 1, color: borderColor });

        container.addChild(graphics);

        // Check if event has a tileset graphic
        const tileId = event.pages && event.pages[0] && event.pages[0].image ? event.pages[0].image.tileId : 0;
        let hasGraphic = false;

        if (tileId > 0 && this.tilesetPaletteViewer && this.tilesetPaletteViewer.tilesetTextures) {
            // Render tileset graphic on top of the background
            const tileSprite = this.createTileSprite(tileId);
            if (tileSprite) {
                // Make sprite fit within the border (inset by 2px for the border)
                tileSprite.x = 2;
                tileSprite.y = 2;
                const maxSize = this.tilemapManager.TILE_WIDTH - 4;
                const scale = maxSize / 48;
                tileSprite.scale.set(scale);
                container.addChild(tileSprite);
                hasGraphic = true;
            }
        }

        // If no tileset graphic, check for character sprite
        if (!hasGraphic) {
            const image = event.pages && event.pages[0] && event.pages[0].image;
            if (image && image.characterName) {
                const characterSprite = this.createCharacterSprite(image);
                if (characterSprite) {
                    // Character sprite is already positioned and scaled, just add inset
                    characterSprite.x += 2;
                    characterSprite.y += 2;
                    container.addChild(characterSprite);
                    hasGraphic = true;
                }
            }
        }

        // Add event name text at the bottom of the tile
        const text = new PIXI.Text({
            text: event.name,
            style: {
                fontSize: 8,
                fill: 0xffffff,
                align: 'center',
                stroke: { color: 0x000000, width: 2 }
            }
        });
        text.x = this.tilemapManager.TILE_WIDTH / 2;
        text.y = this.tilemapManager.TILE_HEIGHT - 6; // Position near bottom
        text.anchor.set(0.5);
        container.addChild(text);

        return container;
    }

    // Create a PIXI sprite from a tileId
    createTileSprite(tileId) {
        if (!this.tilesetPaletteViewer || !this.tilesetPaletteViewer.tilesetTextures) {
            return null;
        }

        const textures = this.tilesetPaletteViewer.tilesetTextures;
        const TILE_SIZE = 48;

        // Determine which tileset image to use based on tileId
        let layer = null;
        let tileX = 0;
        let tileY = 0;

        if (tileId >= 2048) {
            // Autotiles A1-A4
            const kind = Math.floor((tileId - 2048) / 48);

            if (kind < 16) {
                // A1 (0-15)
                layer = 'A1';
                tileX = kind % 8;
                tileY = Math.floor(kind / 8);
            } else if (kind < 48) {
                // A2 (16-47)
                layer = 'A2';
                const localKind = kind - 16;
                tileX = localKind % 8;
                tileY = Math.floor(localKind / 8);
            } else if (kind < 80) {
                // A3 (48-79)
                layer = 'A3';
                const localKind = kind - 48;
                tileX = localKind % 8;
                tileY = Math.floor(localKind / 8);
            } else if (kind < 128) {
                // A4 (80-127)
                layer = 'A4';
                const localKind = kind - 80;
                tileX = localKind % 8;
                tileY = Math.floor(localKind / 8);
            }

            // For autotiles, extract the top-left preview tile (first 48x48 from the 2x3 or 2x2 block)
            const img = textures[layer];
            if (!img) return null;

            // Calculate source position in the original tileset image
            let srcX = tileX * TILE_SIZE * 2; // Each autotile block is 2 tiles (96px) wide
            let srcY;

            if (layer === 'A1') {
                // A1 has special layout
                srcY = tileY * TILE_SIZE * 3; // 3 tiles tall per row
            } else if (layer === 'A2') {
                srcY = tileY * TILE_SIZE * 3; // 3 tiles tall
            } else if (layer === 'A3') {
                srcY = tileY * TILE_SIZE * 2; // 2 tiles tall
            } else if (layer === 'A4') {
                // A4 alternates between floor (3 tall) and wall (2 tall)
                srcY = 0;
                for (let r = 0; r < tileY; r++) {
                    if (r % 2 === 0) {
                        srcY += TILE_SIZE * 3; // Floor type
                    } else {
                        srcY += TILE_SIZE * 2; // Wall type
                    }
                }
            }

            // Create sprite from texture
            const texture = PIXI.Texture.from(img.src);
            const rect = new PIXI.Rectangle(srcX, srcY, TILE_SIZE, TILE_SIZE);
            const croppedTexture = new PIXI.Texture(texture.baseTexture, rect);
            return new PIXI.Sprite(croppedTexture);

        } else if (tileId >= 1536) {
            // A5 tiles
            layer = 'A5';
            const localTileId = tileId - 1536;
            tileX = localTileId % 8;
            tileY = Math.floor(localTileId / 8);
        } else {
            // B-E tiles
            let localTileId = tileId;

            if (tileId >= 768) {
                layer = 'E';
                localTileId = tileId - 768;
            } else if (tileId >= 512) {
                layer = 'D';
                localTileId = tileId - 512;
            } else if (tileId >= 256) {
                layer = 'C';
                localTileId = tileId - 256;
            } else {
                layer = 'B';
            }

            tileX = localTileId % 8;
            tileY = Math.floor(localTileId / 8);
        }

        // Get the tileset image for this layer
        console.log('createTileSprite: layer =', layer, 'tileX =', tileX, 'tileY =', tileY);
        const img = textures[layer];
        console.log('createTileSprite: img for layer', layer, '=', img);
        if (!img) {
            console.log('createTileSprite: No image for layer', layer);
            return null;
        }

        // Calculate source position in the tileset image
        const srcX = tileX * TILE_SIZE;
        const srcY = tileY * TILE_SIZE;
        console.log('createTileSprite: srcX =', srcX, 'srcY =', srcY);

        // Convert Image to PIXI.Texture first, then create cropped texture
        // The tilesetTextures are stored as HTMLImageElement, not PIXI.Texture
        const baseTexture = PIXI.Texture.from(img);
        const croppedTexture = new PIXI.Texture({
            source: baseTexture.source,
            frame: new PIXI.Rectangle(srcX, srcY, TILE_SIZE, TILE_SIZE)
        });

        return new PIXI.Sprite(croppedTexture);
    }

    // Create a PIXI sprite from character image data
    createCharacterSprite(image) {
        if (!image || !image.characterName) {
            return null;
        }

        const currentProject = this.projectController.getCurrentProject ? this.projectController.getCurrentProject() : this.projectController.currentProject;
        if (!currentProject) {
            return null;
        }

        const path = require('path');
        // Add .png extension if not already present (RPG Maker stores names without extension)
        const filename = image.characterName.endsWith('.png') ? image.characterName : image.characterName + '.png';
        const filePath = path.join(currentProject.path, 'img', 'characters', filename);
        const imgPath = window.RPGReactorAssetUrl
            ? window.RPGReactorAssetUrl(filePath)
            : 'file://' + filePath.replace(/\\/g, '/');

        try {
            // Load as HTML Image element first, then convert to PIXI texture
            // This is more reliable than PIXI.Texture.from() for file:// URLs
            const htmlImg = new Image();
            htmlImg.src = imgPath;

            // Check if already loaded (cached)
            if (!htmlImg.complete || !htmlImg.width || !htmlImg.height) {
                // Set up a one-time listener to re-render when the image loads
                htmlImg.onload = () => {
                    this.renderEvents();
                };
                return null;
            }

            // Create PIXI texture from the loaded HTML image
            const baseTexture = PIXI.Texture.from(htmlImg);
            if (!baseTexture || !baseTexture.source) {
                return null;
            }

            const img = baseTexture.source;

            const isBigCharacter = image.characterName.includes('$');

            let characterWidth, characterHeight, baseX, baseY;

            // Direction mapping: 2=down, 4=left, 6=right, 8=up
            const directionRow = { 2: 0, 4: 1, 6: 2, 8: 3 };
            const dirRow = directionRow[image.direction || 2] || 0;

            if (isBigCharacter) {
                // Big characters: 3 frames x 4 directions
                characterWidth = img.width / 3;
                characterHeight = img.height / 4;
                baseX = 0;
                baseY = dirRow * characterHeight;
            } else {
                // Normal sprites: 8 characters (4x2 grid), 3 frames x 4 directions each
                characterWidth = img.width / 12; // 3 frames * 4 columns
                characterHeight = img.height / 8; // 4 directions * 2 rows

                const charCol = (image.characterIndex || 0) % 4;
                const charRow = Math.floor((image.characterIndex || 0) / 4);

                baseX = charCol * 3 * characterWidth;
                baseY = (charRow * 4 + dirRow) * characterHeight;
            }

            // Get the frame to display (pattern 0, 1, or 2)
            const pattern = image.pattern || 1; // Default to middle frame
            const sourceX = baseX + pattern * characterWidth;
            const sourceY = baseY;

            // Create cropped texture using PIXI v8 API
            const croppedTexture = new PIXI.Texture({
                source: img,
                frame: new PIXI.Rectangle(sourceX, sourceY, characterWidth, characterHeight)
            });

            const sprite = new PIXI.Sprite(croppedTexture);

            // Scale to fit tile size (will be inset in createEventSprite)
            const TILE_SIZE = 48;
            const maxSize = TILE_SIZE - 4; // Leave room for border
            const scale = Math.min(maxSize / characterWidth, maxSize / characterHeight);
            sprite.scale.set(scale);

            // Center in the available space (not including border)
            const scaledWidth = characterWidth * scale;
            const scaledHeight = characterHeight * scale;
            sprite.x = (maxSize - scaledWidth) / 2;
            sprite.y = (maxSize - scaledHeight) / 2;

            return sprite;
        } catch (error) {
            console.error('Error creating character sprite:', error);
            return null;
        }
    }

    // Clean up
    destroy() {
        this.hideContextMenu();
        if (this.findDialog) {
            this.findDialog.remove();
        }
        if (this.eventContainer) {
            this.eventContainer.destroy({ children: true });
            this.eventContainer = null;
        }
        if (this.hoverHighlight) {
            this.hoverHighlight.destroy();
            this.hoverHighlight = null;
        }
        if (this.selectionHighlight) {
            this.selectionHighlight.destroy();
            this.selectionHighlight = null;
        }
        if (this.startingPositionContainer) {
            this.startingPositionContainer.destroy({ children: true });
            this.startingPositionContainer = null;
        }
        this.eventSprites.clear();
    }
}
