// RPG Reactor - Event Manager
// Handles event creation, editing, and management on maps

const EVENT_DOUBLE_CLICK_INTERVAL = 500;

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
        this._eventInteractionContainer = null;
        this._eventContextMenuCanvas = null;
        this._eventContextMenuHandler = null;
        this._lastMapClickTime = 0;
        this._lastMapClickX = null;
        this._lastMapClickY = null;

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
    // An event's 3D models live in the map sidecar (map.reactor3d.events),
    // keyed by event id — not in the event itself. Copy, paste, delete,
    // and undo must all carry that entry along or models silently detach.
    _eventModelStore(create = false) {
        const map = this.currentMap;
        if (!map) return null;
        if (!map.reactor3d || typeof map.reactor3d !== 'object') {
            if (!create) return null;
            map.reactor3d = { version: 1, mode: '3d' };
        }
        if (!map.reactor3d.events || typeof map.reactor3d.events !== 'object') {
            if (!create) return null;
            map.reactor3d.events = {};
        }
        return map.reactor3d.events;
    }

    _eventModels(eventId) {
        const store = this._eventModelStore();
        const entry = store && store[String(eventId)];
        return entry ? JSON.parse(JSON.stringify(entry)) : null;
    }

    _setEventModels(eventId, models) {
        const key = String(eventId);
        if (models && Object.keys(models).length) {
            this._eventModelStore(true)[key] = JSON.parse(JSON.stringify(models));
            return;
        }
        const store = this._eventModelStore();
        if (!store) return;
        delete store[key];
        if (!Object.keys(store).length) delete this.currentMap.reactor3d.events;
    }

    _eventModelsSnapshot() {
        const store = this._eventModelStore();
        return store ? JSON.parse(JSON.stringify(store)) : null;
    }

    _restoreEventModels(models) {
        const map = this.currentMap;
        if (!map) return;
        if (models && Object.keys(models).length) {
            if (!map.reactor3d || typeof map.reactor3d !== 'object') {
                map.reactor3d = { version: 1, mode: '3d' };
            }
            map.reactor3d.events = JSON.parse(JSON.stringify(models));
        } else if (map.reactor3d) {
            delete map.reactor3d.events;
        }
    }

    _eventHeightsSnapshot() {
        const heights = this.currentMap?.reactor3d?.eventZ;
        return heights ? JSON.parse(JSON.stringify(heights)) : null;
    }

    _restoreEventHeights(snapshot) {
        if (!Object.prototype.hasOwnProperty.call(snapshot, 'heights')) return;
        const map = this.currentMap;
        if (snapshot.heights && Object.keys(snapshot.heights).length) {
            map.reactor3d ||= { version: 1, mode: '3d' };
            map.reactor3d.eventZ = JSON.parse(JSON.stringify(snapshot.heights));
        } else if (map.reactor3d) delete map.reactor3d.eventZ;
    }

    /** The events' footprints (`reactor3d.eventSize`), for an undo step. */
    _eventSizesSnapshot() {
        const sizes = this.currentMap?.reactor3d?.eventSize;
        return sizes ? JSON.parse(JSON.stringify(sizes)) : null;
    }

    /** The footprints measured from events' models (`reactor3d.eventSizeAuto`), for an undo step. */
    _eventAutoSizesSnapshot() {
        const sizes = this.currentMap?.reactor3d?.eventSizeAuto;
        return sizes ? JSON.parse(JSON.stringify(sizes)) : null;
    }

    _restoreEventSizes(snapshot) {
        if (!snapshot || !Object.prototype.hasOwnProperty.call(snapshot, 'sizes')) return;
        const map = this.currentMap;
        if (Object.prototype.hasOwnProperty.call(snapshot, 'autoSizes')) {
            if (snapshot.autoSizes && Object.keys(snapshot.autoSizes).length) {
                map.reactor3d ||= { version: 1 };
                map.reactor3d.eventSizeAuto = JSON.parse(JSON.stringify(snapshot.autoSizes));
            } else if (map.reactor3d) delete map.reactor3d.eventSizeAuto;
        }
        if (snapshot.sizes && Object.keys(snapshot.sizes).length) {
            map.reactor3d ||= { version: 1 };
            map.reactor3d.eventSize = JSON.parse(JSON.stringify(snapshot.sizes));
        } else if (map.reactor3d) delete map.reactor3d.eventSize;
        if (map.reactor3d && typeof RRMapElevation !== 'undefined' && RRMapElevation.markEventSizes) RRMapElevation.markEventSizes(map);
    }

    _eventPlacement(eventId) {
        const sidecar = this.currentMap?.reactor3d;
        const size = sidecar?.eventSize?.[eventId];
        const auto = sidecar?.eventSizeAuto?.[eventId];
        return { height: Number(sidecar?.eventZ?.[eventId]) || 0, preview: sidecar?.eventPreviews?.[eventId] ?? null, size: Array.isArray(size) ? size.slice() : null, auto: Array.isArray(auto) ? auto.slice() : null };
    }

    _setEventPlacement(eventId, placement) {
        const map = this.currentMap;
        if (!map) return;
        // A copied event keeps its footprint; a removed one takes it with it.
        if (typeof RRMapElevation !== 'undefined' && RRMapElevation.setEventSize) RRMapElevation.setEventSize(map, eventId, placement?.size || [1, 1]);
        if (typeof RRMapElevation !== 'undefined' && RRMapElevation.setEventSizeAuto) RRMapElevation.setEventSizeAuto(map, eventId, placement?.auto || null);
        for (const [field, value] of [['eventZ', placement?.height], ['eventPreviews', placement?.preview]]) {
            const present = field === 'eventZ' ? Number.isFinite(value) && value > 0 : Number.isInteger(value) && value >= 0;
            if (present) {
                map.reactor3d ||= { version: 1, mode: '3d' };
                map.reactor3d[field] ||= {};
                map.reactor3d[field][String(eventId)] = value;
            } else if (map.reactor3d?.[field]) {
                delete map.reactor3d[field][String(eventId)];
                if (!Object.keys(map.reactor3d[field]).length) delete map.reactor3d[field];
            }
        }
    }

    _eventPreviewsSnapshot() {
        const previews = this.currentMap?.reactor3d?.eventPreviews;
        return previews ? JSON.parse(JSON.stringify(previews)) : null;
    }

    _restoreEventPreviews(snapshot) {
        if (!Object.prototype.hasOwnProperty.call(snapshot, 'previews')) return;
        const map = this.currentMap;
        if (snapshot.previews && Object.keys(snapshot.previews).length) {
            map.reactor3d ||= { version: 1, mode: '3d' };
            map.reactor3d.eventPreviews = JSON.parse(JSON.stringify(snapshot.previews));
        } else if (map.reactor3d) delete map.reactor3d.eventPreviews;
    }

    _restoreEventSelection() {
        if (!this.selectedEvent) return;
        this.selectedEvent = this.currentMap.events.find(e => e && e.id === this.selectedEvent.id) || null;
        this.selectedTileX = this.selectedEvent?.x ?? null;
        this.selectedTileY = this.selectedEvent?.y ?? null;
    }

    saveState() {
        if (!this.currentMap) return;

        // Save a deep copy of the current events array, with the sidecar
        // model entries that belong to those events.
        const eventsData = {
            events: JSON.parse(JSON.stringify(this.currentMap.events || [])),
            models: this._eventModelsSnapshot(),
            heights: this._eventHeightsSnapshot(),
            sizes: this._eventSizesSnapshot(),
            autoSizes: this._eventAutoSizesSnapshot(),
            previews: this._eventPreviewsSnapshot()
        };
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
        this.redoStack.push({
            events: JSON.parse(JSON.stringify(this.currentMap.events || [])),
            models: this._eventModelsSnapshot(),
            heights: this._eventHeightsSnapshot(),
            sizes: this._eventSizesSnapshot(),
            autoSizes: this._eventAutoSizesSnapshot(),
            previews: this._eventPreviewsSnapshot()
        });

        // Restore previous state
        const popped = this.undoStack.pop();
        const previousData = Array.isArray(popped)
            ? { events: popped, models: this._eventModelsSnapshot() }
            : popped;
        this.currentMap.events = previousData.events;
        this._restoreEventModels(previousData.models);
        this._restoreEventHeights(previousData);
        this._restoreEventSizes(previousData);
        this._restoreEventPreviews(previousData);

        // Undo restores cloned data, so the selection must follow that object.
        this._restoreEventSelection();

        // Re-render events
        this.renderEvents();

        // Notify about undo state change
        this.notifyUndoStateChange();
    }

    redo() {
        if (this.redoStack.length === 0) return;

        // Save current state to undo stack
        this.undoStack.push({
            events: JSON.parse(JSON.stringify(this.currentMap.events || [])),
            models: this._eventModelsSnapshot(),
            heights: this._eventHeightsSnapshot(),
            sizes: this._eventSizesSnapshot(),
            autoSizes: this._eventAutoSizesSnapshot(),
            previews: this._eventPreviewsSnapshot()
        });

        // Restore next state
        const popped = this.redoStack.pop();
        const nextData = Array.isArray(popped)
            ? { events: popped, models: this._eventModelsSnapshot() }
            : popped;
        this.currentMap.events = nextData.events;
        this._restoreEventModels(nextData.models);
        this._restoreEventHeights(nextData);
        this._restoreEventSizes(nextData);
        this._restoreEventPreviews(nextData);

        // Undo restores cloned data, so the selection must follow that object.
        this._restoreEventSelection();

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
            if (this.eventPreviewContainer?.parent) {
                this.eventPreviewContainer.parent.removeChild(this.eventPreviewContainer);
            }
            this.eventPreviewContainer = null;
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

        if (this.editingHighlight && this.editingHighlight.parent !== tilemapManager.container) {
            if (this.editingHighlight.parent) this.editingHighlight.parent.removeChild(this.editingHighlight);
            this.editingHighlight = null;
        }

        if (this.startingPositionContainer && this.startingPositionContainer.parent !== tilemapManager.container) {
            if (this.startingPositionContainer.parent) {
                this.startingPositionContainer.parent.removeChild(this.startingPositionContainer);
            }
            this.startingPositionContainer = null;
        }

        // Create event container if it doesn't exist
        if (!this.eventContainer) {
            this.eventPreviewContainer = new PIXI.Container();
            this.eventPreviewContainer.label = 'event previews';
            tilemapManager.container.addChild(this.eventPreviewContainer);
            this.eventContainer = new PIXI.Container();
            this.eventContainer.label = 'events';
            tilemapManager.container.addChild(this.eventContainer);
            console.debug('Event container created');
        }

        // Create hover highlight graphics for the cell under the event cursor.
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

        // The outline on the event whose editor window is open, in event and tile mode alike.
        if (!this.editingHighlight) {
            this.editingHighlight = new PIXI.Graphics();
            this.editingHighlight.label = 'editing event';
            this.editingHighlight.visible = false;
            tilemapManager.container.addChild(this.editingHighlight);
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
        this.selectedTileX = null;
        this.selectedTileY = null;
        this._lastMapClickTime = 0;
        this._lastMapClickX = null;
        this._lastMapClickY = null;
        if (this.selectionHighlight) this.selectionHighlight.visible = false;
        this.hideHoverHighlight();

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
        // Release media authoring and its gizmos before Event mode owns the map.
        if (enabled) {
            if (typeof window !== 'undefined' && window.reactor?.claimMapTool) window.reactor.claimMapTool('events');
            else this.projectController?.mediaSurfaceManager?.close();
        }
        this.eventMode = enabled;
        if (typeof window !== 'undefined') window.RRBattleSetup?.sync(this);
        this.projectController?.mediaSurfacePreviewManager?.syncToolInteraction?.();
        console.debug(`Event mode: ${enabled ? 'enabled' : 'disabled'}`);

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
            // What was picked up goes with the tool: an event left selected kept its model card and its arrows over the map.
            if (this.selectedEvent || Number.isInteger(this.selectedTileX)) this.selectEvent(null);
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
        if (this._eventInteractionContainer === container) return;
        if (this._eventInteractionContainer) this.removeEventInteraction();
        this._eventInteractionContainer = container;
        this._eventPointerHandlers = {};
        const on = (eventName, handler) => {
            this._eventPointerHandlers[eventName] = handler;
            container.on(eventName, handler);
        };

        // Make container interactive
        container.interactive = true;
        container.cursor = 'default';

        // Disable browser context menu on the canvas
        const canvasElement = container.view || document.querySelector('canvas');
        if (canvasElement && this._eventContextMenuCanvas !== canvasElement) {
            if (this._eventContextMenuCanvas && this._eventContextMenuHandler) {
                this._eventContextMenuCanvas.removeEventListener('contextmenu', this._eventContextMenuHandler);
            }
            this._eventContextMenuHandler = (e) => {
                e.preventDefault();
                return false;
            };
            this._eventContextMenuCanvas = canvasElement;
            canvasElement.addEventListener('contextmenu', this._eventContextMenuHandler);
        }

        // Mouse leave handler
        on('pointerleave', () => {
            this.hideHoverHighlight();
            // Selection highlight stays visible even when mouse leaves.
        });

        // Right-click handler
        on('rightdown', (event) => {
            event.stopPropagation();
            event.data.originalEvent.preventDefault();
            this.resetMapClickTracking();

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

        on('pointerdown', (event) => {
            this.handleMapPointerDown(event, container);
        });

        // Mouse move handler for dragging
        on('pointermove', (event) => {
            this.updateHoverHighlight(event, container);
            if (this.isDragging && this.draggedEvent) {
                this.updateDrag(event);
            }
        });

        // Mouse up handler for finishing drag
        on('pointerup', (event) => {
            if (this.isDragging) {
                this.finishDragging(event);
            }
        });

        on('pointerupoutside', (event) => {
            if (this.isDragging) {
                this.finishDragging(event);
            }
        });
    }

    // Remove event interaction
    removeEventInteraction() {
        const container = this._eventInteractionContainer;
        if (container) {
            for (const [eventName, handler] of Object.entries(this._eventPointerHandlers || {})) {
                container.off(eventName, handler);
            }
        }
        this._eventPointerHandlers = null;
        this._eventInteractionContainer = null;
        this.resetMapClickTracking();

        if (this._eventContextMenuCanvas && this._eventContextMenuHandler) {
            this._eventContextMenuCanvas.removeEventListener('contextmenu', this._eventContextMenuHandler);
            this._eventContextMenuCanvas = null;
            this._eventContextMenuHandler = null;
        }

        // Hide selection highlight when leaving event mode
        if (this.selectionHighlight) {
            this.selectionHighlight.visible = false;
        }
        this.hideHoverHighlight();

        // Clear selected tile
        this.selectedTileX = null;
        this.selectedTileY = null;

        // Cancel any ongoing drag
        this.isDragging = false;
        this.draggedEvent = null;
    }

    resetMapClickTracking() {
        this._lastMapClickTime = 0;
        this._lastMapClickX = null;
        this._lastMapClickY = null;
    }

    handleMapPointerDown(event, container = this.tilemapManager?.container) {
        if (!this.eventMode || !this.currentMap || !container ||
            event.data.button !== 0 || event.data.originalEvent?.shiftKey) {
            this.resetMapClickTracking();
            return;
        }

        const pos = event.data.getLocalPosition(container);
        const tileX = Math.floor(pos.x / this.tilemapManager.TILE_WIDTH);
        const tileY = Math.floor(pos.y / this.tilemapManager.TILE_HEIGHT);
        if (tileX < 0 || tileX >= this.currentMap.width || tileY < 0 || tileY >= this.currentMap.height) {
            this.resetMapClickTracking();
            return;
        }

        // Battle Setup has a unit or the battle start picked: the click stands it on an empty tile.
        if (typeof window !== 'undefined' && window.RRBattleSetup?.placeAt(this, tileX, tileY)) {
            this.resetMapClickTracking();
            return;
        }

        const currentTime = Date.now();
        const isDoubleClick = this.isMapDoubleClick(
            tileX, tileY, event.data.originalEvent, currentTime);

        if (isDoubleClick) {
            this.resetMapClickTracking();
            this.activateEventAt(tileX, tileY);
            return;
        }

        this._lastMapClickTime = currentTime;
        this._lastMapClickX = tileX;
        this._lastMapClickY = tileY;
        this.selectTile(tileX, tileY);

        const eventAtPos = this.getEventAt(tileX, tileY) || null;
        if (!eventAtPos && this.tilesetPaletteViewer) {
            const selectedTiles = this.tilesetPaletteViewer.getSelectedTiles();
            if (selectedTiles && selectedTiles.length > 0) {
                const tile = selectedTiles[0];
                const tileId = this.convertToTileId(tile.layer, tile.x, tile.y);
                if (tileId > 0) {
                    this.createNewEventWithTileset(tileX, tileY, tileId);
                    this.tilesetPaletteViewer.clearSelection();
                    return;
                }
            }
        }

        this.selectEvent(eventAtPos);
        if (eventAtPos) {
            this.startDragging(eventAtPos, event);
        } else {
            // Deselect the previous event without discarding the empty cell the
            // first click chose. That cell is the target of the second click
            // which opens a new event.
            this.selectTile(tileX, tileY);
        }
    }

    isMapDoubleClick(tileX, tileY, originalEvent, currentTime = Date.now()) {
        const sameTile = this._lastMapClickX === tileX && this._lastMapClickY === tileY;
        if (!sameTile) return false;
        return Number(originalEvent?.detail) >= 2 ||
            currentTime - this._lastMapClickTime <= EVENT_DOUBLE_CLICK_INTERVAL;
    }

    activateEventAt(tileX, tileY) {
        if (!this.eventMode || !this.currentMap ||
            !Number.isInteger(tileX) || !Number.isInteger(tileY) ||
            tileX < 0 || tileX >= this.currentMap.width ||
            tileY < 0 || tileY >= this.currentMap.height) return false;

        const eventAtPos = this.getEventAt(tileX, tileY);
        if (eventAtPos) this.editEvent(eventAtPos);
        else {
            const vehicle = EventManager.startingVehicles(this.currentMap).find(entry => entry.x === tileX && entry.y === tileY);
            if (vehicle) EventManager.openVehicle(vehicle);
            else this.createNewEvent(tileX, tileY);
        }
        return true;
    }

    activateEventSelection() {
        const tileX = Number.isInteger(this.selectedTileX)
            ? this.selectedTileX
            : this.selectedEvent?.x;
        const tileY = Number.isInteger(this.selectedTileY)
            ? this.selectedTileY
            : this.selectedEvent?.y;
        return this.activateEventAt(tileX, tileY);
    }

    updateHoverHighlight(pointerEvent, container = this.tilemapManager?.container) {
        if (!this.eventMode || !this.currentMap || !this.hoverHighlight || !container) {
            this.hideHoverHighlight();
            return;
        }

        const pos = pointerEvent.data.getLocalPosition(container);
        const tileX = Math.floor(pos.x / this.tilemapManager.TILE_WIDTH);
        const tileY = Math.floor(pos.y / this.tilemapManager.TILE_HEIGHT);
        // Battle Setup: a faint copy of what a click would place, on the tile it would land on.
        if (typeof window !== 'undefined' && window.RRBattleSetup) {
            const inside = tileX >= 0 && tileX < this.currentMap.width && tileY >= 0 && tileY < this.currentMap.height;
            window.RRBattleSetup.hover2D(this, inside ? { x: tileX, y: tileY } : null);
        }
        if (tileX < 0 || tileX >= this.currentMap.width ||
            tileY < 0 || tileY >= this.currentMap.height ||
            (tileX === this.selectedTileX && tileY === this.selectedTileY)) {
            this.hideHoverHighlight();
            return;
        }

        const tileWidth = this.tilemapManager.TILE_WIDTH;
        const tileHeight = this.tilemapManager.TILE_HEIGHT;
        // Every pointer move lands here, and most stay on the tile they were
        // on. Rebuilding the outline regardless re-tessellated it and
        // re-uploaded its geometry each time for an identical picture.
        // Over a sized event the whole footprint lights: any tile of it picks the event.
        const hovered = this.getEventAt(tileX, tileY);
        const [firstX, firstY, spanX, spanY] = hovered ? this._eventRect(hovered) : [tileX, tileY, 1, 1];
        const sized = spanX > 1 || spanY > 1;
        const key = `${tileX},${tileY},${tileWidth},${tileHeight}` + (sized ? `,${firstX},${firstY},${spanX},${spanY}` : '');
        if (this.hoverHighlight.visible && this.hoverHighlight._rrHoverKey === key) return;
        const color = 0xFFD700;
        this.hoverHighlight.clear();
        this.hoverHighlight.rect((sized ? firstX : tileX) * tileWidth, (sized ? firstY : tileY) * tileHeight, spanX * tileWidth, spanY * tileHeight);
        this.hoverHighlight.stroke({ color, width: 2, alpha: 0.9 });
        this.hoverHighlight.visible = true;
        this.hoverHighlight._rrHoverKey = key;
    }

    hideHoverHighlight() {
        if (this.hoverHighlight) this.hoverHighlight.visible = false;
    }

    moveEventSelection(deltaX, deltaY) {
        if (!this.eventMode || !this.currentMap) return false;
        const startX = Number.isInteger(this.selectedTileX)
            ? this.selectedTileX
            : this.selectedEvent?.x;
        const startY = Number.isInteger(this.selectedTileY)
            ? this.selectedTileY
            : this.selectedEvent?.y;
        if (!Number.isInteger(startX) || !Number.isInteger(startY)) return false;

        this._lastMapClickTime = 0;
        this._lastMapClickX = null;
        this._lastMapClickY = null;

        const tileX = Math.max(0, Math.min(this.currentMap.width - 1, startX + deltaX));
        const tileY = Math.max(0, Math.min(this.currentMap.height - 1, startY + deltaY));
        const eventAtPos = this.getEventAt(tileX, tileY) || null;
        this.selectEvent(eventAtPos);
        if (!eventAtPos) this.selectTile(tileX, tileY);
        this.hideHoverHighlight();
        return true;
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

        // Event-mode targets use the editor's gold selection color.
        const color = 0xFFD700;
        const alpha = eventAtPos ? 0.35 : 0.3;

        // A sized event is selected whole: every tile of its footprint.
        const [firstX, firstY, spanX, spanY] = eventAtPos ? this._eventRect(eventAtPos) : [this.selectedTileX, this.selectedTileY, 1, 1];
        const left = (spanX > 1 || spanY > 1 ? firstX : this.selectedTileX) * tileWidth;
        const top = (spanX > 1 || spanY > 1 ? firstY : this.selectedTileY) * tileHeight;

        // PIXI v8 API - draw filled rectangle
        this.selectionHighlight.rect(left, top, spanX * tileWidth, spanY * tileHeight);
        this.selectionHighlight.fill({ color: color, alpha: alpha });

        // Border (thicker for selection) - PIXI v8 API
        this.selectionHighlight.rect(left, top, spanX * tileWidth, spanY * tileHeight);
        this.selectionHighlight.stroke({ color: color, width: 3, alpha: 1.0 });

        this.selectionHighlight.visible = true;
    }

    /**
     * The event whose editor window is open stays outlined on the map while it is open, whatever
     * the mode (tile painting deselects events) and wherever the person is working: one look
     * tells which event the window holds.
     */
    updateEditingHighlight() {
        // The 3D view lights the same event's box, as it lights a selected one.
        const map3d = this.projectController?.mapEditor3D;
        if (map3d?.isEnabled?.()) map3d.syncEditingEvent?.();
        const outline = this.editingHighlight;
        if (!outline || !this.currentMap || !this.tilemapManager) return;
        const editor = this.eventEditor;
        const event = editor && editor.isOpen && editor.isOpen() ? editor.sourceEvent : null;
        if (!event || !Number.isInteger(event.x) || !Number.isInteger(event.y)) {
            outline.visible = false;
            return;
        }
        const tileWidth = this.tilemapManager.TILE_WIDTH, tileHeight = this.tilemapManager.TILE_HEIGHT;
        const [firstX, firstY, spanX, spanY] = this._eventRect(event);
        outline.clear();
        outline.rect(firstX * tileWidth, firstY * tileHeight, spanX * tileWidth, spanY * tileHeight);
        outline.fill({ color: 0xFFD700, alpha: 0.18 });
        outline.rect(firstX * tileWidth, firstY * tileHeight, spanX * tileWidth, spanY * tileHeight);
        outline.stroke({ color: 0xFFD700, width: 3, alpha: 1 });
        outline.visible = true;
        // Over the event sprites drawn since.
        if (outline.parent) outline.parent.addChild(outline);
    }

    // Show context menu
    showContextMenu(x, y, tileX, tileY, eventAtPos) {
        // Remove existing context menu if any
        this.hideContextMenu();
        // Battle Setup with something picked: a right-click takes a unit off the map.
        if (typeof window !== 'undefined' && window.RRBattleSetup?.removeAt(this, eventAtPos)) return;

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
            console.debug('createEventAction called!');
            console.debug('tilesetPaletteViewer exists?', !!this.tilesetPaletteViewer);

            // Check if tiles are selected from palette
            if (this.tilesetPaletteViewer) {
                const selectedTiles = this.tilesetPaletteViewer.getSelectedTiles();
                console.debug('Context menu - Selected tiles from palette:', selectedTiles);
                if (selectedTiles && selectedTiles.length > 0) {
                    const tile = selectedTiles[0];
                    console.debug('Context menu - First selected tile:', tile);
                    const tileId = this.convertToTileId(tile.layer, tile.x, tile.y);
                    console.debug('Context menu - Converted tileId:', tileId);
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
            // Asked for on a deck, a bridge or an upper floor in the 3D view: it stands there.
            const pick = this.projectController?.mapEditor3D?.lastPick;
            if (pick && pick.x === tileX && pick.y === tileY && typeof window !== 'undefined') window.RRBattleSetup?.standNewEvent?.(this, pick);
        };

        // Menu items
        const shortcutPrefix = typeof navigator !== 'undefined' &&
            /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent || '')
            ? 'Cmd' : 'Ctrl';
        const menuItems = [
            { label: this._t('eventCtx.newEvent'), shortcut: 'Enter', action: createEventAction, enabled: !eventAtPos },
            { label: this._t('eventCtx.editEvent'), shortcut: 'Enter', action: () => this.editEvent(eventAtPos), enabled: !!eventAtPos },
            { label: this._t('eventCtx.previewEvent'), enabled: !!eventAtPos, submenu: this._eventPreviewMenu(eventAtPos) },
            { label: this._t('quickEvent.title'), enabled: !eventAtPos, submenu: [
                { label: this._t('quickEvent.transfer'), action: () => this.showQuickEventDialog('transfer', tileX, tileY) },
                { label: this._t('quickEvent.door'), action: () => this.showQuickEventDialog('door', tileX, tileY) },
                { label: this._t('quickEvent.treasure'), action: () => this.showQuickEventDialog('treasure', tileX, tileY) },
                { label: this._t('quickEvent.inn'), action: () => this.showQuickEventDialog('inn', tileX, tileY) },
                { label: this._t('quickEvent.battleStart'), action: () => this.showQuickEventDialog('battleStart', tileX, tileY) }
            ] },
            { label: this._t('battleSetup.title'), action: () => window.RRBattleSetup?.open(this), enabled: typeof window !== 'undefined' && !!window.RRBattleSetup },
            { separator: true },
            { label: this._t('eventCtx.cutEvent'), shortcut: `${shortcutPrefix}+X`, action: () => this.cutEvent(eventAtPos), enabled: !!eventAtPos },
            { label: this._t('eventCtx.copyEvent'), shortcut: `${shortcutPrefix}+C`, action: () => this.copyEvent(eventAtPos), enabled: !!eventAtPos },
            { label: this._t('eventCtx.pasteEvent'), shortcut: `${shortcutPrefix}+V`, action: () => this.pasteEvent(tileX, tileY), enabled: true },
            { label: this._t('eventCtx.deleteEvent'), shortcut: 'Delete', action: () => this.deleteEvent(eventAtPos), enabled: !!eventAtPos },
            { separator: true },
            { label: this._t('eventCtx.findEvent'), shortcut: `${shortcutPrefix}+F`, action: () => this.showFindDialog(), enabled: true },
            { label: this._t('eventCtx.findNext'), action: () => this.findNext(), enabled: this.currentSearchResults.length > 0 },
            { label: this._t('eventCtx.findPrev'), action: () => this.findPrevious(), enabled: this.currentSearchResults.length > 0 },
            { separator: true },
            { label: this._t('eventCtx.setStart'), submenu: [
                { label: this._t('eventCtx.player'), action: () => this.setStartingPosition(tileX, tileY, 'player') },
                { label: this._t('eventCtx.boat'), action: () => this.setStartingPosition(tileX, tileY, 'boat') },
                { label: this._t('eventCtx.ship'), action: () => this.setStartingPosition(tileX, tileY, 'ship') },
                { label: this._t('eventCtx.airship'), action: () => this.setStartingPosition(tileX, tileY, 'airship') }
            ] },
            { label: this._t('eventCtx.playerFacing'), submenu: EventManager.DIRECTIONS.map(([direction, name]) => ({
                label: `${direction === this.playerStartDirection() ? '✓ ' : ''}${window.I18n ? window.I18n.tText(name) : name}`,
                action: () => this.setPlayerStartDirection(direction)
            })) }
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
                    cursor: ${item.enabled === false ? 'not-allowed' : 'pointer'};
                    font-size: 13px;
                    color: ${item.enabled === false ? 'var(--color-text-dim)' : 'var(--color-text)'};
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
                        if (item.enabled === false) return;
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
                menuItem.dataset.disabled = String(item.enabled === false);
                menuItem.setAttribute('role', 'menuitem');
                menuItem.setAttribute('aria-haspopup', 'true');

                const openSubmenu = () => {
                    if (item.enabled === false) return null;
                    menuItem.style.backgroundColor = 'var(--color-accent-tint-25)';
                    submenu.style.display = 'block';
                    // A submenu opened near the bottom or right edge would run
                    // off the window and be clipped to its first entry.
                    EventManager.keepSubmenuOnScreen(submenu, menuItem.getBoundingClientRect(),
                        { width: window.innerWidth, height: window.innerHeight });
                    return submenu;
                };
                menuItem._rrOpenSubmenu = () => {
                    const opened = openSubmenu();
                    return opened ? { element: opened, items: () => opened.children, close: () => { opened.style.display = 'none'; } } : null;
                };
                menuItem.addEventListener('mouseenter', openSubmenu);

                menuItem.addEventListener('mouseleave', () => {
                    menuItem.style.backgroundColor = 'transparent';
                    submenu.style.display = 'none';
                });

                this.contextMenu.appendChild(menuItem);
            } else {
                const menuItem = document.createElement('div');
                menuItem.className = 'context-menu-item';
                menuItem.dataset.disabled = String(!item.enabled);
                menuItem.setAttribute('role', 'menuitem');
                menuItem.style.cssText = `
                    padding: 8px 16px;
                    cursor: ${item.enabled ? 'pointer' : 'not-allowed'};
                    font-size: 13px;
                    color: ${item.enabled ? 'var(--color-text)' : 'var(--color-text-dim)'};
                    display: grid;
                    grid-template-columns: minmax(0, 1fr) auto;
                    gap: 24px;
                `;
                const label = document.createElement('span');
                label.textContent = item.label;
                menuItem.appendChild(label);
                if (item.shortcut) {
                    const shortcut = document.createElement('span');
                    shortcut.textContent = item.shortcut;
                    shortcut.style.cssText = 'color: var(--color-text-muted); font-size: 12px;';
                    menuItem.appendChild(shortcut);
                }

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

        this.contextMenu.setAttribute('role', 'menu');
        window.RRKeyboardNavigation?.menu(this.contextMenu, {
            items: () => this.contextMenu?.children || [],
            isDisabled: row => row.dataset.disabled === 'true',
            submenu: row => row._rrOpenSubmenu?.() || null,
            close: () => this.hideContextMenu()
        });

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
            this.contextMenu._rrMenuKeys?.dispose();
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

        // An event on the cell, else a sized event whose footprint covers it (the 3D view's box answers there too).
        return this.currentMap.events.find(event =>
            event && event.x === x && event.y === y
        ) || this.currentMap.events.find(event => {
            if (!event) return false;
            const [x0, y0, w, h] = this._eventRect(event);
            return (w > 1 || h > 1) && x >= x0 && x < x0 + w && y >= y0 && y < y0 + h;
        });
    }

    /**
     * An event's footprint on the map, `[x0, y0, w, h]`: centred on the event's own tile (a model's
     * measured one lies round the model). `at` asks about a tile it is not on yet, `size` a size it
     * does not have yet.
     */
    _eventRect(event, at = null, size = null) {
        const E = typeof RRMapElevation !== 'undefined' ? RRMapElevation : null;
        const [w, h] = size || this._eventFootprint(event.id);
        const [ox, oy] = E && E.eventFootprintOrigin && this.currentMap ? E.eventFootprintOrigin(this.currentMap, event.id, size) : [0, 0];
        return [(at ? at.x : event.x) + ox, (at ? at.y : event.y) + oy, w, h];
    }

    _eventFootprint(eventId) {
        const E = typeof RRMapElevation !== 'undefined' ? RRMapElevation : null;
        return E && E.eventSize && this.currentMap ? E.eventSize(this.currentMap, eventId) : [1, 1];
    }

    /** How far, in tiles, an event's own square stands from its tile: the middle of its footprint. */
    _eventMarkerOffset(eventId) {
        const E = typeof RRMapElevation !== 'undefined' ? RRMapElevation : null;
        return E && E.eventMarkerOffset && this.currentMap ? E.eventMarkerOffset(this.currentMap, eventId) : [0, 0];
    }

    /** Whether `event` can stand at (x, y): no other event on any cell of its footprint. */
    canPlaceEvent(event, x, y, size = null) {
        const [x0, y0, w, h] = this._eventRect(event, { x, y }, size);
        return !(this.currentMap?.events || []).some(other => {
            if (!other || other.id === event.id) return false;
            const [ox, oy, ow, oh] = this._eventRect(other);
            return ox < x0 + w && ox + ow > x0 && oy < y0 + h && oy + oh > y0;
        });
    }

    // Select an event
    selectEvent(event) {
        const previousEvent = this.selectedEvent;
        this.selectedEvent = event;
        this.notifyEventSelected(event);

        // Update selected tile coordinates for yellow highlight
        if (event) {
            this.selectedTileX = event.x;
            this.selectedTileY = event.y;
            this.updateSelectionHighlight(); // Update map highlight
        } else {
            // Deselecting has to take the highlight with it, or the square an
            // event used to be on stays marked with nothing selected.
            this.selectedTileX = null;
            this.selectedTileY = null;
            this.updateSelectionHighlight();
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
        if (!sprite) return;
        // A sized event's footprint takes the tone with its square.
        if (sprite._rrArea) this._drawEventFootprint(sprite._rrArea, this._eventFootprint(eventId), isSelected);
        if (sprite._rrSquare) this._drawEventSquare(sprite._rrSquare, isSelected, sprite._rrSquareAlpha ?? 0.75);
        // Its outline over a preview follows too.
        const outline = this.eventOutlines?.get(eventId);
        const event = outline && (this.currentMap?.events || []).find(e => e && e.id === eventId);
        if (outline && event) {
            const next = this.createEventOutline(event);
            const index = outline.parent ? outline.parent.getChildIndex(outline) : -1;
            if (index >= 0) { outline.parent.addChildAt(next, index); outline.parent.removeChild(outline); outline.destroy(); this.eventOutlines.set(eventId, next); }
            else next.destroy();
        }
    }

    // Select an event by ID
    /**
     * Announce the current selection.
     *
     * Announced rather than pushed at the 3D viewport directly: selection is
     * driven from the map, the events panel and the editor itself, and each of
     * those already funnels through `selectEvent`.
     */
    notifyEventSelected(event) {
        if (typeof document === 'undefined' || typeof CustomEvent !== 'function') return;
        document.dispatchEvent(new CustomEvent('rr-event-selected', {
            detail: { eventId: event ? event.id : null }
        }));
    }

    /** Event mode as the toolbar's event tool turns it on; nothing where it is on already. */
    enterEventMode() {
        if (this.eventMode) return;
        const app = typeof window !== 'undefined' ? window.reactor : null;
        if (app && app.eventManager === this && typeof app.toggleEventMode === 'function') app.toggleEventMode();
        else this.setEventMode(true);
    }

    /** A row of the Events list: the map goes to Event mode with that event selected and in view. */
    selectEventFromList(eventId) {
        if (!this.currentMap?.events?.some(entry => entry && entry.id === eventId)) return;
        this.enterEventMode();
        this.selectEventById(eventId, { reveal: true });
    }

    /** Selects an event of this map by its number; with `reveal`, the map view in use is brought to it as well (a row of the Events list). */
    selectEventById(eventId, { reveal = false } = {}) {
        if (!this.currentMap || !this.currentMap.events) return;

        const event = this.currentMap.events.find(e => e && e.id === eventId);
        if (event) {
            this.selectEvent(event);
            if (reveal) this.centerOnEvent(event);
        }
    }

    // Start dragging an event
    startDragging(event, pointerEvent) {
        // Undo state is captured lazily on the FIRST actual move — every
        // left-click on an event lands here, and an unconditional saveState
        // wiped the redo stack and pushed a full event-list snapshot even
        // when the event never moved.
        this._dragStateSaved = false;

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

        console.debug(`Started dragging event ${event.name} from (${event.x}, ${event.y})`);
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

                // No other event on any cell the dragged one's footprint would cover
                if (this.canPlaceEvent(this.draggedEvent, newTileX, newTileY)) {
                    // First real movement: capture the pre-drag state for
                    // undo (the event still holds its original position here)
                    if (!this._dragStateSaved) {
                        this._dragStateSaved = true;
                        this.resetMapClickTracking();
                        this.saveState();
                    }
                    // Update event position
                    this.draggedEvent.x = newTileX;
                    this.draggedEvent.y = newTileY;

                    // Update selection to follow the dragged event
                    this.selectTile(newTileX, newTileY);

                    // Move just the dragged sprite. A full renderEvents()
                    // per tile step rebuilt every event sprite and the
                    // sidebar list (resetting its scroll); the final
                    // renderEvents() happens once in finishDragging.
                    const sprite = this.eventSprites.get(this.draggedEvent.id);
                    if (sprite) {
                        sprite.x = newTileX * this.tilemapManager.TILE_WIDTH;
                        sprite.y = newTileY * this.tilemapManager.TILE_HEIGHT;
                        const outline = this.eventOutlines?.get(this.draggedEvent.id);
                        if (outline) { outline.x = sprite.x; outline.y = sprite.y; }
                        // What is drawn of the event at real size (its picture or model, its name, its ring) goes with it.
                        this.movePreviewWith(this.draggedEvent);
                        this.updateSelectionHighlight();
                        this.updateEditingHighlight();
                    } else {
                        this.renderEvents();
                    }
                }
            }
        }
    }

    // Finish dragging
    finishDragging(pointerEvent) {
        if (!this.isDragging || !this.draggedEvent) return;

        console.debug(`Finished dragging event ${this.draggedEvent.name} to (${this.draggedEvent.x}, ${this.draggedEvent.y})`);

        // Reset cursor
        if (this.tilemapManager.container) {
            this.tilemapManager.container.cursor = 'default';
        }

        // The event open in the window follows where it was dropped.
        this.eventEditor?.followMapMove?.(this.draggedEvent);

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
            // B-E sheets are 8 tiles wide but the palette shows them as a
            // 16-wide split, handing back x in 0..15 for the right half.
            // Fold that back the way MapEditor.getBaseTileIdFromPalettePosition
            // does, or every right-half tile resolves to a different tile's id.
            if (x >= 8) {
                x -= 8;
                y += 16;
            }
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
    getNextEventId() {
        const events = Array.isArray(this.currentMap?.events) ? this.currentMap.events : [];
        const occupiedIds = new Set(events.filter(Boolean).map(event => Number(event.id)));
        let nextId = 1;
        while (occupiedIds.has(nextId) || events[nextId]) nextId++;
        return nextId;
    }

    makeDefaultEventPage(overrides = {}) {
        const page = {
            conditions: {
                actorId: 1, actorValid: false, itemId: 1, itemValid: false,
                selfSwitchCh: 'A', selfSwitchValid: false,
                switch1Id: 1, switch1Valid: false,
                switch2Id: 1, switch2Valid: false,
                variableId: 1, variableValid: false, variableValue: 0
            },
            directionFix: false,
            image: { tileId: 0, characterName: '', direction: 2, pattern: 0, characterIndex: 0 },
            moveFrequency: 3,
            moveRoute: {
                list: [{ code: 0, indent: null, parameters: [] }],
                repeat: true, skippable: false, wait: false
            },
            moveSpeed: 3, moveType: 0, priorityType: 1,
            stepAnime: false, through: false, trigger: 0, walkAnime: true,
            list: [{ code: 0, indent: 0, parameters: [] }]
        };
        for (const [key, value] of Object.entries(overrides)) {
            if (key === 'conditions' || key === 'image' || key === 'moveRoute') {
                page[key] = { ...page[key], ...value };
            } else {
                page[key] = value;
            }
        }
        return page;
    }

    makeQuickEvent(x, y, name, pages) {
        const id = this.getNextEventId();
        return { id, name, note: '', pages, x, y };
    }

    quickEventMoveRoute(characterId, commands) {
        const list = commands.concat({ code: 0 });
        const route = { list, repeat: false, skippable: false, wait: true };
        return [
            { code: 205, indent: 0, parameters: [characterId, route] },
            ...commands.map(command => ({ code: 505, indent: 0, parameters: [command] }))
        ];
    }

    // The page keeps Direction Fix on so the closed graphic cannot turn toward the player,
    // which means the route has to release it (Direction Fix OFF, code 36) before its turns
    // can show the opening frames. Chests made by MZ's own Treasure quick event start with it too.
    quickEventOpenRoute(se) {
        const commands = [{ code: 36 }];
        if (se?.name) commands.push({ code: 44, parameters: [se] });
        commands.push(
            { code: 17 }, { code: 15, parameters: [3] },
            { code: 18 }, { code: 15, parameters: [3] },
            { code: 19 }, { code: 15, parameters: [3] }
        );
        return commands;
    }

    buildQuickEvent(kind, x, y, config = {}) {
        const destination = config.destination || { mapId: 1, x: 0, y: 0 };
        const image = {
            tileId: 0,
            characterName: config.characterName || '',
            characterIndex: Number(config.characterIndex) || 0,
            pattern: Number(config.pattern) || 0,
            direction: Number(config.imageDirection) || 2
        };
        const transfer = { code: 201, indent: 0, parameters: [
            0, destination.mapId, destination.x, destination.y,
            Number(config.direction) || 0, Number.isFinite(config.fadeType) ? config.fadeType : 0
        ] };
        const end = { code: 0, indent: 0, parameters: [] };

        if (kind === 'transfer') {
            const page = this.makeDefaultEventPage({
                image, priorityType: image.characterName ? 1 : 0,
                trigger: image.characterName ? 0 : 1,
                list: [transfer, end]
            });
            return this.makeQuickEvent(x, y, 'Transfer', [page]);
        }

        if (kind === 'door') {
            const routeCommands = this.quickEventOpenRoute(config.se);
            const page = this.makeDefaultEventPage({
                image: { ...image, pattern: 1, direction: 2 },
                directionFix: true,
                list: [...this.quickEventMoveRoute(0, routeCommands), transfer, end]
            });
            return this.makeQuickEvent(x, y, 'Door', [page]);
        }

        if (kind === 'treasure') {
            const rewardKind = config.rewardKind || 'item';
            const rewardId = Math.max(1, Number(config.rewardId) || 1);
            const amount = Math.max(1, Number(config.amount) || 1);
            const rewardCodes = { item: 126, weapon: 127, armor: 128 };
            const reward = rewardKind === 'gold'
                ? { code: 125, indent: 0, parameters: [0, 0, amount] }
                : { code: rewardCodes[rewardKind] || 126, indent: 0,
                    parameters: rewardKind === 'item'
                        ? [rewardId, 0, 0, amount]
                        : [rewardId, 0, 0, amount, false] };
            const routeCommands = this.quickEventOpenRoute(config.se);
            const page1 = this.makeDefaultEventPage({
                image: { ...image, pattern: 1, direction: 2 }, directionFix: true,
                list: [
                    ...this.quickEventMoveRoute(0, routeCommands), reward,
                    { code: 101, indent: 0, parameters: ['', 0, 0, 2, ''] },
                    { code: 401, indent: 0, parameters: [config.message || 'You found treasure!'] },
                    { code: 123, indent: 0, parameters: ['A', 0] }, end
                ]
            });
            const page2 = this.makeDefaultEventPage({
                conditions: { selfSwitchCh: 'A', selfSwitchValid: true },
                image: { ...image, pattern: 1, direction: 8 }, directionFix: true
            });
            return this.makeQuickEvent(x, y, 'Treasure', [page1, page2]);
        }

        if (kind === 'inn') {
            const price = Math.max(0, Number(config.price) || 0);
            const currency = config.currency || 'G';
            const page = this.makeDefaultEventPage({ image, list: [
                { code: 101, indent: 0, parameters: ['', 0, 0, 2, ''] },
                { code: 401, indent: 0, parameters: [config.offerMessage || `It is ${price} ${currency} per night. Would you like to stay?`] },
                { code: 102, indent: 0, parameters: [['Yes', 'No'], 1, 0, 2, 0] },
                { code: 402, indent: 0, parameters: [0, 'Yes'] },
                { code: 111, indent: 1, parameters: [7, price, 0] },
                { code: 125, indent: 2, parameters: [1, 0, price] },
                { code: 221, indent: 2, parameters: [] },
                { code: 230, indent: 2, parameters: [30] },
                { code: 314, indent: 2, parameters: [0, 0] },
                { code: 222, indent: 2, parameters: [] },
                { code: 411, indent: 1, parameters: [] },
                { code: 101, indent: 2, parameters: ['', 0, 0, 2, ''] },
                { code: 401, indent: 2, parameters: [config.failureMessage || `You do not have enough ${currency}.`] },
                { code: 412, indent: 1, parameters: [] },
                { code: 402, indent: 0, parameters: [1, 'No'] },
                { code: 404, indent: 0, parameters: [] }, end
            ] });
            return this.makeQuickEvent(x, y, 'Inn', [page]);
        }
        return null;
    }

    commitQuickEvent(event, targetMap = this.currentMap) {
        if (!event || !targetMap || this.currentMap !== targetMap) return false;
        if (event.x < 0 || event.x >= targetMap.width || event.y < 0 || event.y >= targetMap.height) return false;
        if (this.getEventAt(event.x, event.y)) return false;
        const events = targetMap.events || (targetMap.events = []);
        if (events[event.id] || events.some(entry => entry && entry.id === event.id)) return false;
        this.saveState();
        // An id is used again once its event is gone: what the map's 3D sidecar kept under it goes first.
        this._setEventModels(event.id, null);
        this._setEventPlacement(event.id, null);
        events[event.id] = event;
        this.renderEvents();
        this.selectEvent(event);
        return true;
    }

    quickEventAssetDefaults(kind) {
        const project = this.projectController.getCurrentProject?.() || this.projectController.currentProject;
        if (!project?.path || typeof RRAssetFiles === 'undefined') return {};
        const path = require('path');
        const names = RRAssetFiles.listImageReferences(path.join(project.path, 'img', 'characters'));
        const wanted = kind === 'door' ? /door/i : /chest|treasure/i;
        const characterName = names.find(name => wanted.test(RRAssetFiles.basename(name))) || '';
        return { characterName, characterIndex: 0, pattern: 1, imageDirection: 2 };
    }

    quickEventSeDefault(kind) {
        const project = this.projectController.getCurrentProject?.() || this.projectController.currentProject;
        if (!project?.path || typeof RRAssetFiles === 'undefined') return null;
        const path = require('path');
        const names = RRAssetFiles.listNames(path.join(project.path, 'audio', 'se'), RRAssetFiles.AUDIO_EXTENSIONS);
        const wanted = kind === 'door' ? /door|open/i : /treasure|chest|item|select|approve/i;
        const name = names.find(candidate => wanted.test(RRAssetFiles.basename(candidate)));
        return name ? { name, volume: 90, pitch: 100, pan: 0 } : null;
    }

    showQuickEventDialog(kind, x, y) {
        if (!this.currentMap || this.getEventAt(x, y)) return;
        // A battle start asks nothing: Start Battle on Map as its dialog writes a new one, on Player Touch, once.
        if (kind === 'battleStart') {
            const made = typeof window !== 'undefined' ? window.RRBattleSetup?.battleStartEvent?.(this, x, y) : null;
            // Made on a deck, a bridge or an upper floor in the 3D view: it stands there.
            if (made && this.commitQuickEvent(made)) window.RRBattleSetup?.standEvent?.(this, made, this.projectController?.mapEditor3D?.lastPick);
            return;
        }
        const tt = (text, replacements = {}) => {
            const translated = window.I18n ? window.I18n.tText(text) : text;
            return Object.entries(replacements).reduce((result, [key, value]) => (
                result.split(`{${key}}`).join(String(value))
            ), translated);
        };
        const targetMap = this.currentMap;
        const defaults = this.quickEventAssetDefaults(kind);
        const config = {
            ...defaults,
            destination: { mapId: this.currentMap.id || 1, x, y },
            direction: 0,
            fadeType: 0,
            rewardKind: 'item', rewardId: 1, amount: 1,
            price: 0,
            currency: this.databaseManager.getSystem()?.currencyUnit || 'G'
        };
        if (kind === 'door' || kind === 'treasure') config.se = this.quickEventSeDefault(kind);
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay quick-event-overlay';
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.75);z-index:10005;display:flex;align-items:center;justify-content:center;';
        const dialog = document.createElement('div');
        dialog.style.cssText = 'width:min(560px,calc(100vw - 32px));max-height:calc(100vh - 32px);overflow:auto;background:var(--color-bg-surface);border:1px solid var(--color-border);border-radius:8px;box-shadow:var(--shadow-modal);';
        const title = { transfer: 'Transfer', door: 'Door', treasure: 'Treasure', inn: 'Inn' }[kind];
        dialog.innerHTML = `
            <div style="padding:14px 16px;border-bottom:1px solid var(--color-border);font-weight:700;color:var(--color-text-strong);">${tt('Quick Event Creation')}: ${tt(title)}</div>
            <div class="quick-event-body" style="padding:16px;display:flex;flex-direction:column;gap:12px;"></div>
            <div style="padding:12px 16px;border-top:1px solid var(--color-border);display:flex;justify-content:flex-end;gap:8px;">
                <button class="quick-event-cancel rr-btn-secondary">${tt('Cancel')}</button>
                <button class="quick-event-create rr-btn-primary">${tt('Create')}</button>
            </div>`;
        const body = dialog.querySelector('.quick-event-body');
        const row = (label, control) => {
            const element = document.createElement('label');
            element.style.cssText = 'display:grid;grid-template-columns:150px minmax(0,1fr);align-items:center;gap:10px;color:var(--color-text);';
            const caption = document.createElement('span');
            caption.textContent = label;
            element.append(caption, control);
            body.appendChild(element);
            return element;
        };
        const select = options => {
            const control = document.createElement('select');
            control.className = 'database-field-value';
            for (const option of options) {
                const item = document.createElement('option');
                item.value = option.value;
                item.textContent = tt(option.label);
                control.appendChild(item);
            }
            return control;
        };
        const input = (type, value, min = null) => {
            const control = document.createElement('input');
            control.className = 'database-field-value';
            control.type = type;
            control.value = value;
            if (min !== null) control.min = min;
            return control;
        };

        let graphicName = null;
        if (kind !== 'transfer') {
            const group = document.createElement('div');
            group.style.cssText = 'display:flex;gap:8px;align-items:center;min-width:0;';
            graphicName = document.createElement('span');
            graphicName.style.cssText = 'flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--color-text);';
            graphicName.textContent = config.characterName || tt('(None)');
            const change = document.createElement('button');
            change.className = 'rr-btn-chip';
            change.textContent = tt('Change...');
            change.addEventListener('click', () => {
                new CharacterGraphicPicker(this.projectController).show(
                    config.characterName || '', config.characterIndex || 0,
                    config.pattern || 0, config.imageDirection || 2, result => {
                        Object.assign(config, result);
                        config.imageDirection = result.direction;
                        graphicName.textContent = result.characterName || tt('(None)');
                    });
            });
            group.append(graphicName, change);
            row(tt('Character Graphic:'), group);
        }

        if (kind === 'transfer' || kind === 'door') {
            const destinationGroup = document.createElement('div');
            destinationGroup.style.cssText = 'display:flex;gap:8px;align-items:center;';
            const destinationText = document.createElement('span');
            destinationText.style.flex = '1';
            const refreshDestination = () => {
                const d = config.destination;
                destinationText.textContent = tt('Map {id}: ({x}, {y})', {
                    id: d.mapId, x: d.x, y: d.y
                });
            };
            refreshDestination();
            const browse = document.createElement('button');
            browse.className = 'rr-btn-chip';
            browse.textContent = tt('Browse...');
            browse.addEventListener('click', () => {
                new TransferPlayerEditor(this.databaseManager, this.projectController).showMapPicker({
                    ...config.destination,
                    title: tt('Select Transfer Destination'),
                    onConfirm: location => { config.destination = location; refreshDestination(); }
                });
            });
            destinationGroup.append(destinationText, browse);
            row(tt('Destination:'), destinationGroup);
            const direction = select([
                { value: 0, label: 'Retain' }, { value: 2, label: 'Down' },
                { value: 4, label: 'Left' }, { value: 6, label: 'Right' }, { value: 8, label: 'Up' }
            ]);
            direction.addEventListener('change', () => { config.direction = Number(direction.value); });
            row(tt('Player Direction:'), direction);
            const fade = select([
                { value: 0, label: 'Black' }, { value: 1, label: 'White' }, { value: 2, label: 'None' }
            ]);
            fade.addEventListener('change', () => { config.fadeType = Number(fade.value); });
            row(tt('Fade:'), fade);
        }

        if (kind === 'treasure') {
            const rewardType = select([
                { value: 'gold', label: 'Gold' }, { value: 'item', label: 'Item' },
                { value: 'weapon', label: 'Weapon' }, { value: 'armor', label: 'Armor' }
            ]);
            rewardType.value = config.rewardKind;
            const rewardData = select([]);
            const amount = input('number', 1, 1);
            const message = input('text', tt('You found treasure!'));
            const populateRewards = () => {
                config.rewardKind = rewardType.value;
                rewardData.innerHTML = '';
                rewardData.disabled = config.rewardKind === 'gold';
                const getter = { item: 'getItems', weapon: 'getWeapons', armor: 'getArmors' }[config.rewardKind];
                for (const entry of getter ? (this.databaseManager[getter]?.() || []) : []) {
                    if (!entry?.id) continue;
                    const option = document.createElement('option');
                    option.value = entry.id;
                    option.textContent = `#${entry.id} ${entry.name || ''}`;
                    rewardData.appendChild(option);
                }
                config.rewardId = Number(rewardData.value) || 1;
            };
            rewardType.addEventListener('change', populateRewards);
            rewardData.addEventListener('change', () => { config.rewardId = Number(rewardData.value) || 1; });
            amount.addEventListener('input', () => { config.amount = Math.max(1, Number(amount.value) || 1); });
            message.addEventListener('input', () => { config.message = message.value; });
            row(tt('Reward Type:'), rewardType);
            row(tt('Reward:'), rewardData);
            row(tt('Amount:'), amount);
            row(tt('Message:'), message);
            populateRewards();
        }

        if (kind === 'inn') {
            const price = input('number', 0, 0);
            price.addEventListener('input', () => { config.price = Math.max(0, Number(price.value) || 0); });
            row(tt('Price ({currency}):', { currency: config.currency }), price);
        }

        overlay.appendChild(dialog);
        document.body.appendChild(overlay);
        const close = () => overlay.remove();
        dialog.querySelector('.quick-event-cancel').addEventListener('click', close);
        // A click on the backdrop no longer closes the dialog: close deliberately.
        overlay.addEventListener('keydown', event => { if (event.key === 'Escape') close(); });
        dialog.querySelector('.quick-event-create').addEventListener('click', () => {
            if ((kind === 'door' || kind === 'treasure') && !config.characterName) {
                RRDialog.alert(tt('Choose a character graphic.'), { title: this._t('quickEvent.title'), kind: 'warning' });
                return;
            }
            const event = this.buildQuickEvent(kind, x, y, config);
            if (this.commitQuickEvent(event, targetMap)) close();
        });
    }

    createNewEventWithTileset(x, y, tileId) {
        console.debug(`createNewEventWithTileset called: position (${x}, ${y}), tileId: ${tileId}`);

        if (!this.currentMap) {
            console.warn('No map loaded');
            return null;
        }
        if (x < 0 || x >= this.currentMap.width || y < 0 || y >= this.currentMap.height || this.getEventAt(x, y)) {
            return null;
        }

        // Imported maps are not always indexed by event ID, so require both
        // the ID and its target storage slot to be free.
        const nextId = this.getNextEventId();

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

        console.debug('Created event with image data:', JSON.stringify(newEvent.pages[0].image, null, 2));

        console.debug(`Created new tileset event ${newEvent.name} at (${x}, ${y}) with tileId ${tileId}`);

        // Show edit dialog
        this.editEvent(newEvent, { isNew: true, map: this.currentMap });
        return newEvent;
    }

    // Create new event
    createNewEvent(x, y) {
        if (!this.currentMap) {
            console.warn('No map loaded');
            return null;
        }
        if (x < 0 || x >= this.currentMap.width || y < 0 || y >= this.currentMap.height || this.getEventAt(x, y)) {
            return null;
        }

        const nextId = this.getNextEventId();

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

        console.debug(`Created new event ${newEvent.name} at (${x}, ${y})`);

        // Show edit dialog
        this.editEvent(newEvent, { isNew: true, map: this.currentMap });
        return newEvent;
    }

    // Setup event editor modal
    setupEventEditorModal() {
        const modal = document.getElementById('event-editor-modal');
        const closeBtn = document.getElementById('event-editor-close-btn');
        // Back from a pop-out window destroyed under it, the close button is wired again.
        if (!this._rewiresOnDock && typeof window !== 'undefined') {
            this._rewiresOnDock = true;
            window.addEventListener('rr-event-editor-docked', event => {
                if (event.detail && event.detail.windowGone) this.setupEventEditorModal();
            });
        }

        // The × and Escape close the window, asking first about edits not yet applied (Cancel too, in EventEditor).
        const requestClose = () => {
            if (this.eventEditor) this.eventEditor.requestClose();
            else if (modal) modal.style.display = 'none';
        };
        if (closeBtn) closeBtn.addEventListener('click', requestClose);
        if (modal && typeof window !== 'undefined' && window.RRKeyboardNavigation) {
            // Wired again after a destroyed pop-out window took the old listener with it.
            modal._rrModalKeys?.dispose?.();
            window.RRKeyboardNavigation.modal(modal, { onEscape: requestClose });
        }

        // Close modal when clicking outside
        if (modal) {
            modal.addEventListener('click', (e) => {
                // A click on the backdrop no longer closes the dialog: an accidental
                // click beside it must never cost in-progress work. Close deliberately.
            });
        }
    }

    // Edit event
    editEvent(event, session = {}) {
        if (!event) {
            console.warn('No event to edit');
            return;
        }

        // The window floats over a live map: opening another event leaves this one, asking first
        // about edits not yet applied; the open event itself just comes forward.
        const open = this.eventEditor && this.eventEditor.isOpen && this.eventEditor.isOpen();
        if (open && !session.pendingResolved) {
            if (this.eventEditor.sourceEvent === event) {
                if (typeof RREventEditorWindow !== 'undefined' && RREventEditorWindow.isPoppedOut()) RREventEditorWindow.showPopout();
                else document.querySelector('#event-editor-modal .rr-modal')?.focus?.();
                return;
            }
            if (this.eventEditor.hasUncommittedChanges()) {
                this.eventEditor.resolvePendingChanges().then(leave => {
                    if (leave) this.editEvent(event, { ...session, pendingResolved: true });
                });
                return;
            }
            // Nothing to apply: the window stays where it is and takes the new event.
            this.eventEditor.leaveEvent();
        }

        // Initialize event editor if not already created
        if (!this.eventEditor) {
            this.eventEditor = new EventEditor(
                this,
                this.databaseManager,
                this.projectController
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
        const targetMap = session.map || this.currentMap;
        let isNew = session.isNew === true;
        this.eventEditor.showEventEditor(content, event, {
            isNew,
            onCommit: (sourceEvent, committedEvent, changes = {}) => {
                if (this.currentMap !== targetMap) return false;
                const events = targetMap.events || (targetMap.events = []);

                if (isNew) {
                    if (events[sourceEvent.id] || events.some(entry => entry && entry.id === sourceEvent.id)) {
                        return false;
                    }
                    this.saveState();
                    this._replaceEventData(sourceEvent, committedEvent);
                    events[sourceEvent.id] = sourceEvent;
                    isNew = false;
                } else {
                    if (!changes.modelsChanged && JSON.stringify(sourceEvent) === JSON.stringify(committedEvent)) return true;
                    this.saveState();
                    this._replaceEventData(sourceEvent, committedEvent);
                }

                this.selectedEvent = sourceEvent;
                return true;
            },
            // Rebuild only after the event AND its model/elevation are committed.
            onAfterCommit: () => this.renderEvents(),
            onCancel: sourceEvent => {
                if (isNew && this.selectedEvent === sourceEvent) this.selectedEvent = null;
            }
        });

        // The editor opens in its own window, where it was left (the web editor: over the map, in the page)
        const shownBefore = modal.style.display === 'flex';
        if (typeof RREventEditorWindow !== 'undefined') RREventEditorWindow.install(modal);
        modal.style.display = 'flex';
        if (typeof RREventEditorWindow !== 'undefined') RREventEditorWindow.open(modal, { shownBefore });
        this.updateEditingHighlight();

        console.debug('Event editor opened for:', event.name);
    }

    _replaceEventData(target, source) {
        for (const key of Object.keys(target)) delete target[key];
        Object.assign(target, JSON.parse(JSON.stringify(source)));
    }

    // Cut event
    cutEvent(event) {
        if (!event) return;

        this.clipboard = JSON.parse(JSON.stringify(event));
        this.clipboard.cut = true;
        this.clipboardModels = this._eventModels(event.id);
        this.clipboardPlacement = this._eventPlacement(event.id);
        this._clipboardPlacementSource = this.clipboard;
        if (typeof ReactorClipboard !== 'undefined') {
            ReactorClipboard.write('event', { event: this.clipboard, cut: true, models: this.clipboardModels, placement: this.clipboardPlacement });
        }
        this.deleteEvent(event);
        console.debug('Event cut to clipboard');
    }

    // Copy event
    copyEvent(event) {
        if (!event) return;

        this.clipboard = JSON.parse(JSON.stringify(event));
        this.clipboard.cut = false;
        this.clipboardModels = this._eventModels(event.id);
        this.clipboardPlacement = this._eventPlacement(event.id);
        this._clipboardPlacementSource = this.clipboard;
        if (typeof ReactorClipboard !== 'undefined') {
            ReactorClipboard.write('event', { event: this.clipboard, cut: false, models: this.clipboardModels, placement: this.clipboardPlacement });
        }
        console.debug('Event copied to clipboard');
    }

    // Paste event
    async pasteEvent(x = this.selectedTileX, y = this.selectedTileY) {
        const tt = (text) => (typeof window !== 'undefined' && window.I18n) ? window.I18n.tText(text) : text;
        if (!this.currentMap) return;
        if (!Number.isInteger(x) || !Number.isInteger(y) ||
            x < 0 || x >= this.currentMap.width || y < 0 || y >= this.currentMap.height) return;
        const targetMap = this.currentMap;

        let eventData = null;
        let eventModels = null;
        let eventPlacement = null;
        if (typeof ReactorClipboard !== 'undefined') {
            const clipboardData = await ReactorClipboard.read('event');
            eventData = clipboardData?.payload?.event || null;
            eventModels = clipboardData?.payload?.models || null;
            eventPlacement = clipboardData?.payload?.placement || null;
        } else {
            eventData = this.clipboard;
            eventModels = this.clipboardModels || null;
            eventPlacement = this._clipboardPlacementSource === this.clipboard ? this.clipboardPlacement : null;
        }
        if (this.currentMap !== targetMap) return;

        if (!eventData) {
            RRDialog.alert(tt('No event in clipboard to paste.'), { title: this._t('eventCtx.pasteEvent'), kind: 'warning' });
            return;
        }

        // Check if there's already an event at this position, or under the pasted one's footprint
        const pastedSize = Array.isArray(eventPlacement?.size) ? eventPlacement.size : [1, 1];
        if (!this.canPlaceEvent({ id: null }, x, y, pastedSize)) {
            RRDialog.alert(tt('There is already an event at this position.'), { title: this._t('eventCtx.pasteEvent'), kind: 'warning' });
            return;
        }

        // Save state for undo
        this.saveState();

        const nextId = this.getNextEventId();

        // Create new event from clipboard
        const newEvent = JSON.parse(JSON.stringify(eventData));
        delete newEvent.cut;
        newEvent.id = nextId;
        newEvent.x = x;
        newEvent.y = y;
        // A named event keeps its name; one still wearing its default name takes the default for its new id.
        const defaultName = id => `EV${String(id).padStart(3, '0')}`;
        if (!newEvent.name || newEvent.name === defaultName(eventData.id)) newEvent.name = defaultName(nextId);

        // Add to map
        this.currentMap.events[nextId] = newEvent;
        // The clone keeps its 3D models, under its own id.
        this._setEventModels(nextId, eventModels);
        this._setEventPlacement(nextId, eventPlacement);

        // Clear clipboard if it was a cut operation
        if (this.clipboard && this.clipboard.cut) {
            this.clipboard = null;
        }

        this.renderEvents();
        this.selectEvent(newEvent);
        console.debug(`Event pasted at (${x}, ${y})`);
    }

    // Delete event
    deleteEvent(event) {
        if (!event || !this.currentMap) return;
        // Deleting the event the window has open closes the window: there is nothing left to apply to.
        if (this.eventEditor && this.eventEditor.isOpen && this.eventEditor.isOpen() && this.eventEditor.sourceEvent === event) {
            this.eventEditor.cancelChanges();
        }

        // No confirmation - just delete
        {
            // Save state for undo
            this.saveState();

            // Imported maps may contain compacted or otherwise mismatched
            // event arrays. Remove the actual object slot rather than assuming
            // its database ID is also the array index.
            const events = this.currentMap.events || [];
            let eventIndex = events.indexOf(event);
            if (eventIndex < 0) eventIndex = events.findIndex(entry => entry && entry.id === event.id);
            if (eventIndex >= 0) events[eventIndex] = null;
            this._setEventModels(event.id, null);
            this._setEventPlacement(event.id, null);

            if (this.selectedEvent === event) {
                this.selectedEvent = null;
            }

            this.renderEvents();
            console.debug(`Event ${event.name} deleted`);
        }
    }

    // Show find dialog
    _t(key, params) {
        return (typeof window !== 'undefined' && window.I18n) ? window.I18n.t(key, params) : key;
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
            <h3 style="margin-top: 0; color: var(--color-text-strong); font-size: 16px;" data-i18n="eventFind.title">Find Event</h3>
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
                <button id="event-search-find" class="rr-button-primary" data-i18n="eventFind.find">Find</button>
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
            console.debug(`Found ${this.currentSearchResults.length} events matching "${query}"`);
        } else {
            const tt = (text) => (typeof window !== 'undefined' && window.I18n) ? window.I18n.tText(text) : text;
            RRDialog.alert(`${tt('No events found matching')} "${query}"`, { title: tt('Find Event') });
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

    /**
     * Brings an event into the map view in use: the 3D view turns its
     * target to it and comes in until a tile is a working size; the 2D view
     * puts the event's tile in its middle, at the zoom it has.
     */
    centerOnEvent(event) {
        if (!event || !this.tilemapManager) return;
        const view = this.projectController && this.projectController.mapEditor3D;
        if (!(view && typeof view.frameEvent === 'function' && view.isEnabled?.() && view.frameEvent(event.id))) {
            this.centerOnTile(event.x, event.y);
        }

        // Update selection to this tile
        this.selectTile(event.x, event.y);
    }

    /** Puts the middle of a tile in the middle of the 2D map view (as near as the map's edges allow), at the zoom it has. */
    centerOnTile(x, y) {
        const tilemap = this.tilemapManager, container = tilemap && tilemap.container;
        if (!container || typeof tilemap.setViewportTransform !== 'function') return false;
        const size = typeof tilemap.viewportSize === 'function' ? tilemap.viewportSize() : null;
        if (!size || !(size.width > 0) || !(size.height > 0)) return false;
        const scale = (container.scale && container.scale.x) || 1;
        tilemap.setViewportTransform(
            size.width / 2 - (x + 0.5) * tilemap.TILE_WIDTH * scale,
            size.height / 2 - (y + 0.5) * tilemap.TILE_HEIGHT * scale,
            scale);
        tilemap.updateScrollbars?.();
        return true;
    }

    // Set starting position
    /** The facing the player starts with: System.json `startDirection`, down when unset. */
    playerStartDirection() {
        const system = this.databaseManager && this.databaseManager.getSystem ? this.databaseManager.getSystem() : null;
        const asked = Number(system && system.startDirection);
        return EventManager.DIRECTIONS.some(([direction]) => direction === asked) ? asked : 2;
    }

    /** Set the facing the player starts with, and save it with the start position. */
    async setPlayerStartDirection(direction) {
        const tt = (text) => (typeof window !== 'undefined' && window.I18n) ? window.I18n.tText(text) : text;
        const currentProject = this.projectController ? this.projectController.getCurrentProject() : null;
        const systemData = this.databaseManager ? this.databaseManager.getSystem() : null;
        if (!currentProject || !systemData) return;
        systemData.startDirection = EventManager.DIRECTIONS.some(([value]) => value === direction) ? direction : 2;
        try {
            await this.databaseManager.saveJSON(currentProject.path, 'System.json', systemData);
        } catch (error) {
            console.error('Error saving System.json:', error);
            RRDialog.alert(tt('Error saving starting position. Check console for details.'), { title: this._t('eventCtx.setStart'), kind: 'error' });
        }
        this.renderStartingPositions();
    }

    async setStartingPosition(x, y, type) {
        const tt = (text) => (typeof window !== 'undefined' && window.I18n) ? window.I18n.tText(text) : text;
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
                console.debug(`Player starting position set to (${x}, ${y}) on map ${mapId}`);
                RRDialog.alert(`${tt('Player')} ${tt('starting position set to')} (${x}, ${y}) ${tt('on Map')} ${mapId}`, { title: this._t('eventCtx.setStart') });
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
                console.debug(`Boat starting position set to (${x}, ${y}) on map ${mapId}`);
                RRDialog.alert(`${tt('Boat')} ${tt('starting position set to')} (${x}, ${y}) ${tt('on Map')} ${mapId}`, { title: this._t('eventCtx.setStart') });
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
                console.debug(`Ship starting position set to (${x}, ${y}) on map ${mapId}`);
                RRDialog.alert(`${tt('Ship')} ${tt('starting position set to')} (${x}, ${y}) ${tt('on Map')} ${mapId}`, { title: this._t('eventCtx.setStart') });
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
                console.debug(`Airship starting position set to (${x}, ${y}) on map ${mapId}`);
                RRDialog.alert(`${tt('Airship')} ${tt('starting position set to')} (${x}, ${y}) ${tt('on Map')} ${mapId}`, { title: this._t('eventCtx.setStart') });
                break;
        }

        // Save the System.json file
        try {
            const projectPath = currentProject.path;
            await this.databaseManager.saveJSON(projectPath, 'System.json', systemData);
            console.debug('System.json saved with new starting position');
        } catch (error) {
            console.error('Error saving System.json:', error);
            RRDialog.alert(tt('Error saving starting position. Check console for details.'), { title: this._t('eventCtx.setStart'), kind: 'error' });
        }

        // Re-render starting position markers for the current map
        // This will show the new marker if on this map, or hide it if moved to another map
        this.renderStartingPositions();
    }

    // Render events on the map
    /**
     * Whether any event on this map draws itself with a tile rather than a
     * character sheet.
     *
     * Those are the ones that depend on the tile palette's sheets, so they are
     * the ones worth re-rendering once it has finished loading. A map without
     * any is left alone: rebuilding every sprite costs real time on a map
     * carrying hundreds of events.
     */
    hasTileGraphicEvents() {
        const events = this.currentMap && this.currentMap.events;
        if (!Array.isArray(events)) return false;
        return events.some(event =>
            event && event.pages && event.pages[0] && event.pages[0].image
            && event.pages[0].image.tileId > 0);
    }

    /** Paths are only unique within one project, so a switch drops them. */
    forgetCharacterImages() {
        if (this._characterImages) this._characterImages.clear();
    }

    /**
     * Preview Event draws a page's graphic at its real size and position, the
     * way the game will, under the event marker. The choice is kept per
     * event in the map's Reactor sidecar so it survives reopening the project.
     */
    _eventPreviewMenu(event) {
        if (!event) return [{ label: this._t('eventCtx.hidePreview'), action: () => {} }];
        // The page chosen here: a battle unit is drawn without one, and has nothing to hide.
        const current = EventManager.chosenPreviewPage(this.currentMap, event);
        const pages = (event.pages || []).map((page, index) => ({
            label: `${current === index ? '\u2713 ' : ''}${this._t('eventCtx.previewPage', { n: index + 1 })}`,
            action: () => this.setEventPreview(event, index)
        }));
        pages.push({ label: this._t('eventCtx.hidePreview'), enabled: current !== null, action: () => this.setEventPreview(event, null) });
        return pages;
    }

    //-------------------------------------------------------------------------
    // Units on the map
    //
    // A battle unit is drawn as what it is in both map views, by the game's
    // look rule (ReactorFightLook): the event's own picture or model, else
    // its record's model, its character sheet or its battler picture, else a
    // plain figure in its side's color. The 3D view asks the same functions.

    // The sides' colors where the look rule is not loaded (the rule's own otherwise).
    static SIDE_COLORS = { ally: '#4aa8ff', enemy: '#ff5a4a', neutral: '#e6d15a' };
    // How long what the Database says of the units' looks is kept, in milliseconds.
    static LOOK_SOURCES_MS = 1000;
    // The longest side of a battler picture kept for drawing, and the width of the plain figure's picture, in pixels.
    static LOOK_ART_MAX = 512;
    static LOOK_FIGURE_WIDE = 256;
    // A ring's radius, as a part of the tiles its unit takes.
    static RING_REACH = 0.44;
    // How far over its tile's lower edge a character stands on the 2D map, in pixels.
    static CHARACTER_LIFT = 6;
    static _units = new WeakMap();
    static _lookSources = null;
    static _lookArts = new Map();
    static _databaseWatch = null;

    /** A side's color (`ally`, `enemy`, `neutral`), as the game draws it. */
    static sideColor(team) {
        const rule = typeof ReactorFightLook !== 'undefined' ? ReactorFightLook : null;
        return rule && typeof rule.color === 'function' ? rule.color(team) : EventManager.SIDE_COLORS[team] || EventManager.SIDE_COLORS.neutral;
    }

    /** Whether page `index` of an event is given a 3D model in the map's Reactor sidecar. */
    static pageHasModel(map, event, index) {
        const pages = map && map.reactor3d && map.reactor3d.events && event ? map.reactor3d.events[String(event.id)] : null;
        const spec = pages && typeof pages === 'object' ? pages[String(index)] : null;
        return !!(spec && spec.name);
    }

    /** The page of an event Preview Event chose; null when none is chosen. */
    static chosenPreviewPage(map, event) {
        const previews = map && map.reactor3d ? map.reactor3d.eventPreviews : null;
        const page = previews && event ? previews[String(event.id)] : undefined;
        return Number.isInteger(page) && event.pages && event.pages[page] ? page : null;
    }

    /**
     * The page of an event the map draws at real size: the one Preview Event
     * chose, else, for a battle unit, the page it is a unit on (its first
     * page for a row or a Note tag), else its first page when that page is
     * given a 3D model (the game stands the event as the model, as it stands
     * a page's character as its sprite). Null: the event is its square alone.
     */
    static previewPage(map, event) {
        const chosen = EventManager.chosenPreviewPage(map, event);
        if (chosen !== null) return chosen;
        const unit = EventManager.unitOf(event);
        if (!unit || !event.pages) {
            if (!event?.pages?.[0]) return null;
            if (typeof RRVehicles !== 'undefined' && RRVehicles.vehicleOf(event)) return 0;
            return EventManager.pageHasModel(map, event, 0) ? 0 : null;
        }
        const index = unit.page > 0 ? unit.page - 1 : 0;
        return event.pages[index] ? index : null;
    }

    /**
     * The unit an event is, as the game reads it: its In battle row, a
     * `<unit: …>` tag in its Note, or a `<unit: …>` or PTBS comment on a
     * page. `{ team, record, id, page }`, `page` counted from 1 for a
     * comment and 0 otherwise; null for any other event. Kept beside the
     * event until its row, its Note or its pages change: every redraw of
     * the map asks for every event.
     */
    static unitOf(event) {
        if (!event || typeof event !== 'object') return null;
        const kept = EventManager._units.get(event), row = event.rrUnit || null, pages = event.pages || null;
        let commands = 0;
        if (!row && pages) for (const page of pages) commands += page && page.list ? page.list.length : 0;
        if (kept && kept.row === row && kept.note === event.note && kept.pages === pages && kept.commands === commands
            && (!row || (kept.team === row.team && kept.record === row.record && kept.id === row.id))) return kept.unit;
        const check = typeof RRBattleCheck !== 'undefined' ? RRBattleCheck : null;
        const forms = typeof FightCommandEditor !== 'undefined' ? FightCommandEditor : null;
        const setup = typeof RRBattleSetup !== 'undefined' ? RRBattleSetup : null;
        const reader = check && typeof check.unitOf === 'function' ? check : forms && typeof forms.unitOf === 'function' ? forms
            : setup && typeof setup.unitOf === 'function' ? setup : null;
        let unit = null;
        try { unit = reader ? reader.unitOf(event) || null : null; } catch (error) { unit = null; }
        if (unit && !(unit.page > 0)) unit.page = 0;
        EventManager._units.set(event, { row, note: event.note, pages, commands, team: row && row.team, record: row && row.record, id: row && row.id, unit });
        return unit;
    }

    /**
     * What the look rule is told of the open project: the Database's actors
     * and enemies, its model bindings, the battle presentation's choice of
     * an enemy's graphic, side view, and whether a picture file is there.
     * Kept for a moment: every unit on the map asks on each redraw.
     */
    static lookSources() {
        const app = typeof window !== 'undefined' ? window.reactor : null;
        const controller = app && app.projectController;
        const project = controller ? (controller.getCurrentProject ? controller.getCurrentProject() : controller.currentProject) : null;
        const projectPath = (project && project.path) || '';
        const now = Date.now(), kept = EventManager._lookSources;
        if (kept && kept.projectPath === projectPath && now >= kept.at && now - kept.at < EventManager.LOOK_SOURCES_MS) return kept;
        // Another project's pictures can share a name: none of them is kept.
        if (kept && kept.projectPath !== projectPath) EventManager.forgetLookArts();
        const database = app && app.databaseManager;
        const data = (database && database.data) || {};
        let bindings = null;
        try {
            if (projectPath && typeof RRDatabase3DBindings !== 'undefined' && RRDatabase3DBindings.read) bindings = RRDatabase3DBindings.read(projectPath);
        } catch (error) { bindings = null; }
        const files = new Map();
        const exists = (folder, name) => {
            const key = folder + '/' + name;
            if (!files.has(key)) {
                let there = true;
                try {
                    if (projectPath && typeof RRAssetFiles !== 'undefined' && RRAssetFiles.findImage) there = !!RRAssetFiles.findImage(require('path').join(projectPath, 'img', folder), name);
                } catch (error) { there = true; }
                files.set(key, there);
            }
            return files.get(key);
        };
        const sources = {
            at: now, projectPath,
            actors: (database && database.getActors ? database.getActors() : data.actors) || [],
            enemies: (database && database.getEnemies ? database.getEnemies() : data.enemies) || [],
            system: (database && database.getSystem ? database.getSystem() : data.system) || null,
            bindings, presentation: data.battlePresentation || null, exists
        };
        EventManager._lookSources = sources;
        return sources;
    }

    /** The model the Database gives a unit's record, as the game resolves it: an actor's character slot, an enemy's entry or the graphic its battle presentation names. */
    static boundModel(unit, sources) {
        if (!unit || !unit.record || !(unit.id > 0) || !sources) return null;
        const actor = unit.record === 'actor';
        const section = sources.bindings && sources.bindings[actor ? 'actors' : 'enemies'];
        let entry = (section && section[String(unit.id)]) || null;
        if (actor) {
            if (entry && !entry.name) entry = entry.character || null;
        } else {
            const settings = sources.presentation && sources.presentation.enemies && sources.presentation.enemies[unit.id];
            const graphic = settings && settings.graphic;
            if (graphic && graphic.mode && graphic.mode !== 'auto') entry = graphic.mode === 'model' ? graphic.model || entry : null;
        }
        return entry && entry.name ? entry : null;
    }

    /**
     * What an event stands as on the page the map draws of it; null when it
     * is no unit there. `{ kind: 'own' | 'model' | 'character' | 'picture' |
     * 'figure', team, color, page, unit }` and, by kind, `spec`,
     * `characterName` and `characterIndex`, or `folder`, `name` and `hue`.
     * Battle Setup's `lookOf` gives the answer when it is loaded, so the
     * map and the card's tiles cannot differ.
     */
    static unitLook(event, map, sources = null) {
        const unit = EventManager.unitOf(event);
        if (!unit) return null;
        const page = EventManager.previewPage(map, event);
        // A unit made by a comment is one on that page only.
        if (page === null || (unit.page > 0 && unit.page - 1 !== page)) return null;
        const from = sources || EventManager.lookSources();
        const rule = typeof ReactorFightLook !== 'undefined' ? ReactorFightLook : null;
        const image = event.pages[page] && event.pages[page].image;
        const models = map && map.reactor3d && map.reactor3d.events ? map.reactor3d.events[String(event.id)] : null;
        const model = (models && models[String(page)]) || null;
        const noted = /<\s*r3d\b/i.test(String(event.note || ''));
        const own = noted || (rule ? rule.hasOwn(image, model) : !!((image && (image.tileId > 0 || image.characterName)) || (model && model.name)));
        const list = unit.record === 'actor' ? from.actors : unit.record === 'enemy' ? from.enemies : null;
        const record = (list && unit.id > 0 && (list[unit.id] && Number(list[unit.id].id) === unit.id ? list[unit.id] : list.find(entry => entry && Number(entry.id) === unit.id))) || null;
        const given = { own, record, model: own ? null : EventManager.boundModel(unit, from), sideView: !!(from.system && from.system.optSideView) };
        if (typeof from.exists === 'function') given.exists = from.exists;
        const setup = typeof RRBattleSetup !== 'undefined' ? RRBattleSetup : null;
        let look = null;
        try { look = setup && typeof setup.lookOf === 'function' ? setup.lookOf(unit, event, given) : null; } catch (error) { look = null; }
        if (!look || !look.kind) {
            look = rule ? rule.resolve(unit, given) : { kind: own ? 'own' : given.model ? 'model' : 'figure', team: unit.team, color: EventManager.sideColor(unit.team), spec: given.model };
        }
        return Object.assign({}, look, { page, unit });
    }

    /** A look as one line of text: two looks draw the same exactly when theirs are equal. */
    static lookKey(look) {
        if (!look) return '';
        return [look.kind, look.team, look.color, look.page, look.spec ? JSON.stringify(look.spec) : '', look.characterName || '', look.characterIndex || 0,
            look.folder || '', look.name || '', look.hue || 0].join('|');
    }

    /**
     * The side an event fights on, whatever page the map draws of it:
     * `{ team, color }`, the color its look carries where it has one. Null
     * for an event that is no unit. Its ring, its outline and its mark in
     * the Events list come from this; only its picture depends on the page.
     */
    static unitSide(event, map, sources = null) {
        const unit = EventManager.unitOf(event);
        if (!unit) return null;
        const look = EventManager.unitLook(event, map, sources);
        return { team: unit.team, color: look && look.color ? look.color : EventManager.sideColor(unit.team) };
    }

    /**
     * What the units stand as was said anew outside the map (a record's
     * picture or sheet in the Database, a file in the project's folders):
     * this map's units are drawn again from what is said now, in both views.
     */
    static looksChanged() {
        EventManager._lookSources = null;
        const app = typeof window !== 'undefined' ? window.reactor : null;
        const manager = app && app.eventManager;
        if (!manager || !manager.currentMap || !manager.eventContainer || typeof manager.renderEvents !== 'function') return false;
        manager.renderEvents();
        return true;
    }

    /**
     * The Database window lies over the map while a record is edited: when
     * it closes, the units are drawn again (`looksChanged`). One watch for
     * the editor, set when a map's events are first drawn; true once set.
     */
    static watchDatabase() {
        if (EventManager._databaseWatch) return true;
        if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') return false;
        const viewer = document.getElementById('database-viewer');
        if (!viewer || !viewer.classList) return false;
        let open = viewer.classList.contains('active');
        const watch = new MutationObserver(() => {
            const now = viewer.classList.contains('active');
            if (open && !now) EventManager.looksChanged();
            open = now;
        });
        watch.observe(viewer, { attributes: true, attributeFilter: ['class'] });
        EventManager._databaseWatch = watch;
        return true;
    }

    /** An image file under the project's img folder, decoded where its pixels can be read; null when it is not there. */
    static async readPicture(projectPath, folder, name) {
        if (!projectPath || typeof RRAssetFiles === 'undefined' || !RRAssetFiles.findImage) return null;
        const found = RRAssetFiles.findImage(require('path').join(projectPath, 'img', folder), name);
        if (!found || !found.absolutePath) return null;
        const reader = typeof RREncryptedAssets !== 'undefined' && RREncryptedAssets.readAssetBytesAsync ? RREncryptedAssets.readAssetBytesAsync : null;
        const bytes = reader ? await reader(found.absolutePath) : require('fs').readFileSync(found.absolutePath);
        if (!bytes) return null;
        // Through a blob: a canvas that drew a file's own address cannot be read back.
        const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: 'image/png' }));
        try {
            return await new Promise(resolve => {
                const image = new Image();
                image.onload = () => resolve(image);
                image.onerror = () => resolve(null);
                image.src = url;
            });
        } finally {
            URL.revokeObjectURL(url);
        }
    }

    /**
     * The picture a `picture` or `figure` look is drawn from, as the game
     * cuts it: a battler picture's art without its margin, its hue turned,
     * no side over LOOK_ART_MAX pixels; or the plain figure. `{ ready,
     * canvas, figure, color }`. A picture still being read has no canvas
     * yet: `onReady` is called once when it has (one that cannot be read
     * becomes the figure).
     */
    static lookArt(look, sources, onReady) {
        const rule = typeof ReactorFightLook !== 'undefined' ? ReactorFightLook : null;
        if (!rule || !look || typeof document === 'undefined') return null;
        const from = sources || EventManager.lookSources();
        const picture = look.kind === 'picture';
        const key = [from.projectPath || '', picture ? `${look.folder}/${look.name}:${look.hue || 0}` : 'figure', look.color].join('|');
        let art = EventManager._lookArts.get(key);
        if (!art) {
            art = { key, ready: false, canvas: null, figure: !picture, color: look.color, waiting: [], flats: new Map(), texture3D: null };
            EventManager._lookArts.set(key, art);
            const done = canvas => {
                art.canvas = canvas;
                art.ready = true;
                for (const call of art.waiting.splice(0)) { try { call(art); } catch (error) { console.warn('A unit\'s picture could not be drawn:', error); } }
            };
            const figure = () => {
                const wide = EventManager.LOOK_FIGURE_WIDE, tall = Math.round(wide * rule.TILES_TALL / rule.TILES_WIDE);
                const canvas = document.createElement('canvas');
                canvas.width = wide; canvas.height = tall;
                rule.drawFigure(canvas.getContext('2d'), 0, 0, wide, tall, look.color);
                art.figure = true;
                done(canvas);
            };
            if (!picture) figure();
            else {
                EventManager.readPicture(from.projectPath, look.folder, look.name).then(image => {
                    const width = image ? image.naturalWidth || image.width : 0, height = image ? image.naturalHeight || image.height : 0;
                    if (!(width > 0 && height > 0)) { figure(); return; }
                    const whole = document.createElement('canvas');
                    whole.width = width; whole.height = height;
                    const context = whole.getContext('2d', { willReadFrequently: true });
                    context.drawImage(image, 0, 0);
                    const pixels = context.getImageData(0, 0, width, height);
                    const box = rule.trim(pixels.data, width, height);
                    if (!box) { figure(); return; }
                    if (look.hue) { rule.rotateHue(pixels.data, look.hue); context.putImageData(pixels, 0, 0); }
                    // As the game cuts it: a creature drawn high over its shadow stands just over it.
                    const art = rule.art(pixels.data, width, box);
                    const scale = Math.min(1, EventManager.LOOK_ART_MAX / Math.max(art.width, art.height));
                    const canvas = document.createElement('canvas');
                    canvas.width = Math.max(1, Math.round(art.width * scale)); canvas.height = Math.max(1, Math.round(art.height * scale));
                    const target = canvas.getContext('2d');
                    target.imageSmoothingEnabled = true;
                    target.imageSmoothingQuality = 'high';
                    rule.drawArt(target, whole, box, art, canvas.width, canvas.height);
                    done(canvas);
                }).catch(() => figure());
            }
        }
        if (!art.ready && typeof onReady === 'function' && !art.waiting.includes(onReady)) art.waiting.push(onReady);
        return art;
    }

    /** The pictures kept for the units' looks are dropped, and the one each look's billboards in the 3D view share is given back to the graphics card. */
    static forgetLookArts() {
        for (const art of EventManager._lookArts.values()) {
            const card = art.texture3D;
            if (card && card.texture && typeof card.texture.dispose === 'function') card.texture.dispose();
        }
        EventManager._lookArts.clear();
    }

    /** A look's picture at `width` by `height` pixels: what its sprite on the 2D map shows. `{ canvas, texture }`. */
    static lookArtFlat(art, width, height) {
        const key = width * 8192 + height;
        let flat = art.flats.get(key);
        if (!flat) {
            const canvas = document.createElement('canvas');
            canvas.width = width; canvas.height = height;
            const context = canvas.getContext('2d');
            if (art.figure) ReactorFightLook.drawFigure(context, 0, 0, width, height, art.color);
            else {
                context.imageSmoothingEnabled = true;
                context.imageSmoothingQuality = 'high';
                context.drawImage(art.canvas, 0, 0, art.canvas.width, art.canvas.height, 0, 0, width, height);
            }
            flat = { canvas, texture: null };
            art.flats.set(key, flat);
        }
        return flat;
    }

    /** What this map's event stands as (`EventManager.unitLook`); null when it is no unit on the page drawn. */
    unitLook(event) {
        return EventManager.unitLook(event, this.currentMap);
    }

    /** The side this map's event fights on (`EventManager.unitSide`); null when it is no unit. */
    unitSide(event) {
        return EventManager.unitSide(event, this.currentMap);
    }

    // Event mode is switched from several places (the toolbar, another map
    // tool taking the map): the units' rings follow the value itself.
    get eventMode() {
        return this._eventMode === true;
    }

    set eventMode(on) {
        const next = !!on;
        if (this._eventMode === next) return;
        this._eventMode = next;
        this.syncUnitRings();
    }

    /** Whether the units' rings are drawn: Event mode is on, or Battle Setup is open. */
    unitRingsShown() {
        if (this.eventMode) return true;
        const setup = typeof RRBattleSetup !== 'undefined' ? RRBattleSetup : null;
        return !!(setup && typeof setup.isOpen === 'function' && setup.isOpen());
    }

    /** The rings appear and go where they stand, in both map views, without anything else being drawn again. */
    syncUnitRings() {
        this.renderUnitRings();
        const view = this.projectController && this.projectController.mapEditor3D;
        if (view && typeof view.syncUnitRings === 'function') view.syncUnitRings();
    }

    /** A layer of this manager's own on the 2D map (`unitRingLayer`, `unitLookLayer`, `eventNameLayer`): made with `make` when first asked for, and again on another map view. */
    _unitLayer(field, label, make) {
        const parent = this.tilemapManager && this.tilemapManager.container;
        if (!parent || typeof PIXI === 'undefined') return null;
        let layer = this[field];
        if (layer && (layer.destroyed || layer.parent !== parent)) {
            if (!layer.destroyed) { layer.parent?.removeChild(layer); layer.destroy({ children: true }); }
            layer = this[field] = null;
        }
        if (!layer && make) {
            layer = this[field] = make();
            layer.label = label;
            layer.eventMode = 'none';
            parent.addChild(layer);
            this._placeUnitLayers();
        }
        return layer || null;
    }

    /**
     * Where the units' layers lie among the map's: the rings directly over
     * the events' squares, the units' pictures directly over the placed
     * models (over the events' squares on a map with none), so a unit that
     * stands as a picture is seen over what is built there, as one that
     * stands as a model is.
     */
    _placeUnitLayers() {
        const parent = this.tilemapManager && this.tilemapManager.container;
        if (!parent) return;
        const inParent = layer => !!layer && !layer.destroyed && layer.parent === parent;
        const after = (layer, reference) => {
            if (!inParent(layer) || !inParent(reference)) return;
            if (parent.getChildIndex(layer) === parent.getChildIndex(reference) + 1) return;
            parent.removeChild(layer);
            parent.addChildAt(layer, parent.getChildIndex(reference) + 1);
        };
        const rings = this.unitRingLayer, looks = this.unitLookLayer;
        after(rings, this.eventContainer);
        const models = parent.children.find(child => child && child.label === 'model props') || null;
        after(looks, models || (inParent(rings) ? rings : this.eventContainer));
    }

    /**
     * A ring in its side's color under every unit on the 2D map, with a
     * notch the way it faces: over the events' squares and under what
     * stands on them. Drawn while Event mode is on or Battle Setup is open.
     */
    renderUnitRings() {
        const shown = this.unitRingsShown() && !!this.currentMap;
        const layer = this._unitLayer('unitRingLayer', 'unit rings', shown ? () => new PIXI.Graphics() : null);
        if (!layer) return;
        layer.clear();
        layer.visible = shown;
        if (shown) {
            const tw = this.tilemapManager.TILE_WIDTH, th = this.tilemapManager.TILE_HEIGHT;
            for (const event of this.currentMap.events || []) {
                // A unit has its ring on whatever page of it is drawn; the notch is that page's facing.
                const side = event ? this.unitSide(event) : null;
                if (!side) continue;
                const [firstX, firstY, w, h] = this._eventRect(event);
                const page = event.pages && event.pages[this.getEventPreviewPage(event) ?? 0];
                const facing = Number(page && page.image && page.image.direction) || 2;
                EventManager.drawUnitRing(layer, (firstX + w / 2) * tw, (firstY + h / 2) * th, tw * w * EventManager.RING_REACH, th * h * EventManager.RING_REACH,
                    EventManager.colorNumber(side.color, 0xe6d15a), facing);
            }
        }
        this.tilemapManager.requestRender?.();
    }

    /** One ring: a faint disc, its edge, and an arrowhead on the edge the way `direction` points (2 down, 4 left, 6 right, 8 up). */
    static drawUnitRing(graphics, cx, cy, rx, ry, color, direction) {
        graphics.ellipse(cx, cy, rx, ry);
        graphics.fill({ color, alpha: 0.16 });
        graphics.ellipse(cx, cy, rx, ry);
        graphics.stroke({ width: 3, color, alpha: 0.95 });
        const [dx, dy] = EventManager.facingStep(direction);
        const tipX = cx + dx * (rx + 7), tipY = cy + dy * (ry + 7), baseX = cx + dx * (rx - 2), baseY = cy + dy * (ry - 2), half = 7;
        graphics.poly([tipX, tipY, baseX - dy * half, baseY - dx * half, baseX + dy * half, baseY + dx * half]);
        graphics.fill({ color, alpha: 1 });
    }

    /** One tile the way a facing points: `[dx, dy]`, down for anything that is no facing. */
    static facingStep(direction) {
        return direction === 4 ? [-1, 0] : direction === 6 ? [1, 0] : direction === 8 ? [0, -1] : [0, 1];
    }

    /** A unit's battler picture or plain figure on the 2D map: fit to the tiles a unit's picture takes, its feet where a character's stand. Null while the picture is read. */
    createUnitPictureSprite(event, look) {
        if (typeof ReactorFightLook === 'undefined' || typeof PIXI === 'undefined') return null;
        if (!this._onLookArt) this._onLookArt = () => this.renderEventPreviews();
        const art = EventManager.lookArt(look, null, this._onLookArt);
        if (!art || !art.ready) return null;
        const tw = this.tilemapManager?.TILE_WIDTH || 48, th = this.tilemapManager?.TILE_HEIGHT || tw;
        const fit = ReactorFightLook.fit(art.canvas.width, art.canvas.height, tw, th, this._eventFootprint(event.id)[0]);
        const flat = EventManager.lookArtFlat(art, fit.width, fit.height);
        if (!flat.texture || flat.texture.destroyed) flat.texture = PIXI.Texture.from(flat.canvas);
        const sprite = new PIXI.Sprite(flat.texture);
        const [offsetX, offsetY] = this._eventMarkerOffset(event.id);
        sprite.anchor.set(0.5, 1);
        sprite.x = (event.x + offsetX + 0.5) * tw;
        sprite.y = (event.y + offsetY + 1) * th - EventManager.CHARACTER_LIFT;
        return sprite;
    }

    getEventPreviewPage(event) {
        return EventManager.previewPage(this.currentMap, event);
    }

    /** Read-only vehicle placements. Their IDs cannot collide with authored events. */
    static startingVehicles(map) {
        const app = typeof window !== 'undefined' ? window.reactor : null;
        const types = app?.databaseManager?.data?.vehicles;
        if (!map || !types) return [];
        const rules = typeof DatabaseVehicleEditor !== 'undefined' && app.projectManager
            ? DatabaseVehicleEditor.rules(app.projectManager) : typeof Reactor3D !== 'undefined' ? Reactor3D.Vehicles : null;
        return (rules?.startingEvents?.(types, Number(map.id)) || []).filter(event => event.x < map.width && event.y < map.height)
            .map(event => ({...event, id:-1000000-Number(String(event._rrVehicleIdentity).split(':')[1] || event._rrDatabaseVehicle)}));
    }

    static mapPreviewEvents(map) {
        return [...(map?.events || []), ...EventManager.startingVehicles(map)];
    }

    static openVehicle(event) {
        const app = typeof window !== 'undefined' ? window.reactor : null;
        const id = event?._rrDatabaseVehicle;
        if (!id || !app?.openDatabase) return false;
        app.eventManager?.selectEvent?.(null);
        app.openDatabase('vehicles');
        app.databaseEditorUI?.navigateToDatabaseEntry?.('vehicles', id);
        return true;
    }

    /** The model a previewed page inherits from its database record. */
    previewModelRaw(event, pageIndex) {
        const own = this.currentMap?.reactor3d?.events?.[String(event?.id)]?.[String(pageIndex)];
        if (own?.name) return own;
        if (event?._rrDatabaseVehicle && typeof RRVehicles !== 'undefined') return RRVehicles.modelOf(event, window.reactor?.databaseManager?.data?.vehicles);
        // An event with the Vehicle field whose page shows no picture wears its vehicle's model, as in the 3D view and the game.
        const image = event?.pages?.[pageIndex]?.image;
        if (typeof RRVehicles !== 'undefined' && !image?.characterName && !(image?.tileId > 0)) {
            const vehicle = RRVehicles.modelOf(event, typeof window !== 'undefined' ? window.reactor?.databaseManager?.data?.vehicles : null);
            if (vehicle?.name) return vehicle;
        }
        const look = this.unitLook(event);
        return look && look.kind === 'model' && look.page === pageIndex && look.spec && look.spec.name ? look.spec : null;
    }

    setEventPreview(event, pageIndex) {
        if (!event || !Number.isInteger(event.id) || !this.currentMap) return false;
        const map = this.currentMap;
        if (pageIndex === null || pageIndex === undefined) {
            if (map.reactor3d?.eventPreviews) delete map.reactor3d.eventPreviews[String(event.id)];
            if (map.reactor3d?.eventPreviews && !Object.keys(map.reactor3d.eventPreviews).length) delete map.reactor3d.eventPreviews;
        } else {
            map.reactor3d = map.reactor3d || {};
            map.reactor3d.eventPreviews = map.reactor3d.eventPreviews || {};
            map.reactor3d.eventPreviews[String(event.id)] = pageIndex;
        }
        this.renderEventPreviews();
        // The 3D view places the preview as a model or billboard of its own,
        // which only a rebuild adds; without it a preview chosen in 3D showed
        // up at the next project open and not before.
        this.projectController?.refreshMap3DView?.();
        return true;
    }

    /** Read-only render records: negative IDs keep event previews separate
     * from authored props while sharing their live surface-light renderer. */
    modelPreviewProps() {
        const map = this.currentMap;
        const previews = [];
        for (const event of EventManager.mapPreviewEvents(map)) {
            if (!event) continue;
            const pageIndex = this.getEventPreviewPage(event);
            if (pageIndex === null) continue;
            const spec = this.previewModelRaw(event, pageIndex);
            if (!spec?.name) continue;
            const vehicle = typeof RRVehicles !== 'undefined' ? RRVehicles.vehicleOf(event) : null;
            previews.push({ ...spec, id: event._rrDatabaseVehicle ? event.id : -event.id, x: event.x, y: event.y,
                size: Number(spec.size) > 0 ? Number(spec.size) : 2,
                scale: Number(spec.scale) > 0 ? Number(spec.scale) : 1,
                z: Number(map.reactor3d?.eventZ?.[event.id]) || 0,
                direction: event.pages[pageIndex].image?.direction || 2,
                // A vehicle stands at its heading along its model's own front, as in the 3D view and the game.
                ...(vehicle ? { vehicle: { type: vehicle.type, yaw: vehicle.yaw } } : null) });
        }
        // Battle Setup: the unit a click would place, on the tile under the pointer.
        const setup = typeof window !== 'undefined' ? window.RRBattleSetup : null;
        const ghost = setup && typeof setup.ghostProp === 'function' ? setup.ghostProp() : null;
        if (ghost) previews.push(ghost);
        return previews;
    }

    renderEventPreviews() {
        const container = this.eventPreviewContainer;
        if (!container || !this.currentMap) return;
        EventManager.watchDatabase();
        for (const child of container.removeChildren()) child.destroy({ children: true });
        // A unit stands over its event's square, where it is seen whole; a previewed page of any other event is drawn under it.
        const units = this._unitLayer('unitLookLayer', 'unit looks', () => new PIXI.Container());
        if (units) for (const child of units.removeChildren()) child.destroy({ children: true });
        this._previewAnimations = [];
        // Each preview with where it stands from its event's tile, for a drag (`movePreviewWith`).
        this._previewSprites = new Map();
        const tw = this.tilemapManager?.TILE_WIDTH || 48, th = this.tilemapManager?.TILE_HEIGHT || tw;
        for (const event of EventManager.mapPreviewEvents(this.currentMap)) {
            if (!event) continue;
            const pageIndex = this.getEventPreviewPage(event);
            if (pageIndex === null) continue;
            try {
                const sprite = this.createEventPreviewSprite(event, event.pages[pageIndex], pageIndex);
                if (!sprite) continue;
                (units && EventManager.unitOf(event) ? units : container).addChild(sprite);
                this._previewSprites.set(event.id, { sprite, dx: sprite.x - event.x * tw, dy: sprite.y - event.y * th });
            } catch (error) {
                console.warn(`Could not preview event ${event.id}:`, error);
            }
        }
        // Keep placements visible even when no sprite or model was selected.
        // The small marker opens the database entry, never an Event Editor.
        for (const vehicle of EventManager.startingVehicles(this.currentMap)) {
            const marker = new PIXI.Graphics();
            marker.rect(vehicle.x*tw, vehicle.y*th, tw, th).stroke({color:0xf0a040,width:2});
            marker.eventMode = 'static'; marker.cursor = 'pointer';
            marker.on('pointertap', () => { if (this.eventMode) EventManager.openVehicle(vehicle); });
            container.addChild(marker);
        }
        this._syncPreviewTicker();
        this.renderUnitRings();
        const props = this.projectController?.modelPropsManager;
        if (props?.currentMap === this.currentMap) props.render();
        // The models' layer is made by its first drawing: the units' layers take their places by it now.
        this._placeUnitLayers();
        this.renderEventOutlines();
    }

    /**
     * A dragged event's preview goes with it from tile to tile: its picture
     * or its model, its name over them, and its ring. Only what belongs to
     * that event moves; the whole map is drawn again when it is dropped.
     */
    movePreviewWith(event) {
        if (!event || !this.currentMap || !this.tilemapManager) return;
        const tw = this.tilemapManager.TILE_WIDTH, th = this.tilemapManager.TILE_HEIGHT;
        for (const kept of [this._previewSprites && this._previewSprites.get(event.id), this.eventNames && this.eventNames.get(event.id)]) {
            if (!kept || kept.sprite.destroyed) continue;
            kept.sprite.x = event.x * tw + kept.dx;
            kept.sprite.y = event.y * th + kept.dy;
        }
        // A model stands on the placed models' layer, which draws it where the event is now.
        const pageIndex = this.getEventPreviewPage(event);
        const props = this.projectController?.modelPropsManager;
        if (pageIndex !== null && props?.currentMap === this.currentMap && this.previewModelRaw(event, pageIndex)?.name) props.render();
        if (EventManager.unitOf(event)) this.renderUnitRings();
        else this.tilemapManager.requestRender?.();
    }

    /** Stepping animation runs at the game's cadence: (9 - move speed) * 3 frames per pattern. */
    static stepWaitFrames(page) {
        const speed = Number(page?.moveSpeed) || 3;
        return (9 - Math.min(6, Math.max(1, speed))) * 3;
    }

    _syncPreviewTicker() {
        const app = this.tilemapManager?.app;
        const wanted = this._previewAnimations?.length > 0;
        if (this._previewTicker && (this._previewTickerApp !== app || !wanted)) {
            try { this._previewTickerApp?.ticker?.remove(this._previewTicker); } catch (_) {}
            this._previewTicker = null;
            this._previewTickerApp = null;
        }
        if (!wanted || this._previewTicker || !app?.ticker) return;
        this._previewTicker = ticker => {
            for (const anim of this._previewAnimations || []) {
                anim.count += ticker.deltaTime;
                if (anim.count < anim.wait) continue;
                anim.count = 0;
                anim.pattern = (anim.pattern + 1) % 4;
                anim.sprite.texture = anim.frames[anim.pattern < 3 ? anim.pattern : 1];
            }
        };
        this._previewTickerApp = app;
        app.ticker.add(this._previewTicker);
    }

    createEventPreviewSprite(event, page, pageIndex = 0) {
        let image = page?.image;
        if (!image) return null;
        // Vehicles inherit their database sprite without changing the event page.
        if (!image.tileId && !image.characterName) {
            const row = typeof RRVehicles !== 'undefined' && RRVehicles.vehicleOf(event);
            const sheet = row && window.reactor?.databaseManager?.data?.vehicles?.[row.type]?.sheet;
            if (sheet?.characterName) image = {...image, ...sheet};
        }
        // A unit with no picture of its own on this page stands as its record gives it.
        const look = image.tileId > 0 || image.characterName ? null : this.unitLook(event);
        if (look && look.page === pageIndex) {
            if (look.kind === 'picture' || look.kind === 'figure') return this.createUnitPictureSprite(event, look);
            if (look.kind === 'character') image = Object.assign({}, image, { characterName: look.characterName, characterIndex: look.characterIndex });
        }
        const tw = this.tilemapManager?.TILE_WIDTH || 48;
        const th = this.tilemapManager?.TILE_HEIGHT || tw;
        // Live model previews are drawn with placed props above the floor
        // lighting; their textures already include ambient and surface lights.
        const props = this.projectController?.modelPropsManager;
        if (props?.currentMap === this.currentMap && this.previewModelRaw(event, pageIndex)?.name) return null;
        const modelSprite = this.createModelPreviewSprite(event, page, pageIndex);
        if (modelSprite) return modelSprite;
        if (image.tileId > 0) {
            const tile = this.createTileSprite(image.tileId);
            if (!tile) return null;
            tile.x = event.x * tw;
            tile.y = event.y * th;
            return tile;
        }
        if (!image.characterName) return null;
        const frame = this.characterFrame(image);
        if (!frame) return null;
        const sprite = new PIXI.Sprite(frame.texture);
        sprite.anchor.set(0.5, 1);
        // Sprite_Character: feet at the tile's bottom centre, lifted 6px unless
        // the sheet is an object ("!") sheet.
        const shift = /^!/.test(image.characterName) ? 0 : 6;
        sprite.x = (event.x + 0.5) * tw;
        sprite.y = (event.y + 1) * th - shift;
        if (page.stepAnime) {
            const frames = [0, 1, 2].map(pattern => this.characterFrame(image, pattern)?.texture || frame.texture);
            this._previewAnimations.push({
                sprite, frames, pattern: Number.isInteger(image.pattern) ? image.pattern : 1,
                count: 0, wait: EventManager.stepWaitFrames(page)
            });
        }
        return sprite;
    }

    /**
     * A page bound to a 3D model previews as a front-facing render of the
     * model at its footprint size, standing on the tile.
     */
    createModelPreviewSprite(event, page, pageIndex) {
        return this.modelSpriteAt(this.previewModelRaw(event, pageIndex), page?.image?.direction || 2, event.x, event.y);
    }

    /** A model drawn flat on the 2D map, its ground origin on the middle of tile (x, y); null while it loads. */
    modelSpriteAt(raw, direction, x, y) {
        if (typeof RREventPreviewModels === 'undefined') return null;
        if (!raw?.name) return null;
        // three.js and Reactor3D only load with the 3D view; a model preview
        // on the 2D canvas asks for them once and redraws when they arrive.
        if (typeof Reactor3D === 'undefined' || !Reactor3D.normalizeModelSpec) {
            const map3d = this.projectController?.mapEditor3D;
            if (map3d?.ensureLibraries && !this._loading3DLibraries) {
                this._loading3DLibraries = map3d.ensureLibraries().then(ready => {
                    this._loading3DLibraries = null;
                    if (ready) this.renderEventPreviews();
                }).catch(() => { this._loading3DLibraries = null; });
            }
            return null;
        }
        const spec = Reactor3D.normalizeModelSpec(raw);
        if (!spec) return null;
        const tw = this.tilemapManager?.TILE_WIDTH || 48;
        const th = this.tilemapManager?.TILE_HEIGHT || tw;
        const pixels = Math.round((spec.size > 0 ? spec.size : 2) * (spec.scale > 0 ? spec.scale : 1) * tw);
        const key = `${spec.name}|${spec.ext || ''}|${spec.file || ''}|${spec.variant || ''}@${pixels}:${direction}`;
        if (!this._modelPreviewTextures) this._modelPreviewTextures = new Map();
        let texture = this._modelPreviewTextures.get(key);
        if (texture === undefined) {
            this._modelPreviewTextures.set(key, null);
            const project = this.projectController.getCurrentProject ? this.projectController.getCurrentProject() : this.projectController.currentProject;
            RREventPreviewModels.thumbnail(project, spec, this.projectController.mapEditor3D, pixels, direction).then(result => {
                if (!result) {
                    // Textures still loading (or the file is gone): try again shortly.
                    this._modelPreviewTextures.delete(key);
                    setTimeout(() => this.renderEventPreviews(), 2000);
                    return;
                }
                const image = new Image();
                image.onload = () => {
                    this._modelPreviewTextures.set(key, { texture: PIXI.Texture.from(image), anchorX: result.anchorX, anchorY: result.anchorY });
                    this.renderEventPreviews();
                };
                image.src = result.url;
            });
        }
        if (!texture) return null;
        const sprite = new PIXI.Sprite(texture.texture);
        // Ground origin on the tile centre, as the game places it.
        sprite.anchor.set(texture.anchorX, texture.anchorY);
        sprite.x = (x + 0.5) * tw;
        sprite.y = (y + 0.5) * th;
        return sprite;
    }

    /** One character cell of a sheet at its natural size, or null while the sheet loads. */
    characterFrame(image, patternOverride) {
        const currentProject = this.projectController.getCurrentProject ? this.projectController.getCurrentProject() : this.projectController.currentProject;
        if (!currentProject || !image?.characterName) return null;
        const path = require('path');
        const imgPath = RRAssetFiles.imageUrlFor(path.join(currentProject.path, 'img', 'characters'), image.characterName);
        if (!this._characterImages) this._characterImages = new Map();
        let htmlImg = this._characterImages.get(imgPath);
        if (!htmlImg) {
            htmlImg = new Image();
            htmlImg.src = imgPath;
            this._characterImages.set(imgPath, htmlImg);
        }
        if (!htmlImg.complete || !htmlImg.width || !htmlImg.height) {
            htmlImg.onload = () => this.renderEvents();
            return null;
        }
        const source = PIXI.Texture.from(htmlImg)?.source;
        if (!source) return null;
        const big = RRAssetFiles.isBigCharacter(image.characterName);
        const frames = RRAssetFiles.characterFrameCount ? RRAssetFiles.characterFrameCount(image.characterName) : 3;
        const dirRow = { 2: 0, 4: 1, 6: 2, 8: 3 }[image.direction || 2] || 0;
        const width = big ? source.width / frames : source.width / (frames * 4);
        const height = big ? source.height / 4 : source.height / 8;
        const index = image.characterIndex || 0;
        const baseX = big ? 0 : (index % 4) * frames * width;
        const baseY = big ? dirRow * height : (Math.floor(index / 4) * 4 + dirRow) * height;
        const pattern = patternOverride !== undefined ? patternOverride : (image.pattern === undefined ? 1 : image.pattern);
        return {
            width, height,
            texture: new PIXI.Texture({ source, frame: new PIXI.Rectangle(baseX + pattern * width, baseY, width, height) })
        };
    }

    renderEvents() {
        if (!this.eventContainer || !this.currentMap) return;
        this.renderEventPreviews();
        this.updateEditingHighlight();
        // The 3D view draws the same events; without this an edited event
        // kept its old model there until the next full rebuild.
        const map3d = this.projectController?.mapEditor3D;
        if (map3d?.isEnabled?.()) map3d.refreshEvents?.();

        // Clear existing event sprites. Destroy them — removeChildren()
        // alone detaches, and each name label is a PIXI.Text that owns a
        // canvas texture which would leak per rebuild. Textures of plain
        // sprites are left alone (character sheets are shared).
        const removed = this.eventContainer.removeChildren();
        for (const child of removed) {
            child.destroy({ children: true });
        }
        this.eventSprites.clear();

        // Keep the data list available even if one malformed graphic fails to
        // construct a PIXI sprite.
        this.updateEventsList();

        // Render each event
        if (this.currentMap.events) {
            this.currentMap.events.forEach(event => {
                if (!event) return;

                try {
                    const sprite = this.createEventSprite(event);
                    this.eventContainer.addChild(sprite);
                    this.eventSprites.set(event.id, sprite);
                } catch (error) {
                    console.error(`Could not render event ${event.id}:`, error);
                }
            });
        }

        // Update selection highlight in case event status changed
        this.updateSelectionHighlight();

        // The 3D view builds its own copy of every event — and reads each
        // one's note for `<3d panel>` and the rest — so it has to hear about a
        // change here. Tile edits announce themselves through `rr-map-edited`;
        // events had nothing, so a note edited in the event window did not
        // reach the 3D canvas until it was switched off and on.
        if (typeof document !== 'undefined' && typeof CustomEvent === 'function') {
            document.dispatchEvent(new CustomEvent('rr-events-changed'));
        }

    }

    // Update the events list in the sidebar
    updateEventsList() {
        const tt = (text) => (typeof window !== 'undefined' && window.I18n) ? window.I18n.tText(text) : text;
        const eventsListEl = document.getElementById('events-list');
        const eventsSectionEl = document.getElementById('events-section');

        if (!eventsListEl || !eventsSectionEl) return;

        // Rebinding retires the previous handlers; rows can be rebuilt after edits.
        if (typeof RRPickerIndex !== 'undefined') {
            RRPickerIndex.bindListNavigation(eventsListEl, {
                items: () => eventsListEl.querySelectorAll('.event-list-item'),
                isSelected: item => Number(item.dataset.eventId) === this.selectedEvent?.id,
                select: item => this.selectEventFromList(Number(item.dataset.eventId))
            });
        }
        eventsListEl.onkeydown = event => {
            if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
            if (event.key !== 'Enter') return;
            event.preventDefault();
            event.stopPropagation();
            const selected = this.currentMap?.events?.find(entry => entry && entry.id === this.selectedEvent?.id);
            if (selected && !event.repeat) this.editEvent(selected);
        };

        // Show the events section when a map is loaded (use 'flex' explicitly for reliable layout)
        eventsSectionEl.style.display = 'flex';

        // Reset scroll position to prevent hidden headers (NW.js overflow:hidden scroll bug)
        eventsSectionEl.scrollTop = 0;
        const sidebar = document.getElementById('sidebar');
        if (sidebar) sidebar.scrollTop = 0;

        // Clear existing list, keeping the list's own scroll position so a
        // re-render doesn't jump back to the top of a long event list.
        const prevListScroll = eventsListEl.scrollTop;
        eventsListEl.innerHTML = '';

        const events = Array.isArray(this.currentMap?.events)
            ? this.currentMap.events.filter(Boolean)
            : [];
        if (events.length === 0) {
            eventsListEl.innerHTML = `<div class="tree-item" style="color: var(--color-text-muted); padding: 6px 8px;">${tt('No events on this map')}</div>`;
            return;
        }

        // Add each event to the list
        events.forEach(event => {
            const item = document.createElement('div');
            item.className = 'tree-item event-list-item';
            item.dataset.eventId = event.id;
            item.textContent = `${String(event.id).padStart(3, '0')}: ${event.name || tt('Unnamed Event')}`;
            // A battle unit's row carries a dot in its side's color (the stylesheet draws it).
            const side = this.unitSide(event);
            if (side) {
                item.dataset.side = side.team;
                item.style.setProperty('--rr-unit-side', side.color);
                item.title = tt(side.team === 'ally' ? 'Ally' : side.team === 'enemy' ? 'Enemy' : 'Bystander');
            }
            item.style.padding = '6px 8px';
            item.style.cursor = 'pointer';
            item.style.fontSize = '14px';
            item.style.borderRadius = '3px';
            item.style.margin = '2px 0';

            // Click handler - Event mode, with the event selected and brought into view
            item.addEventListener('click', (e) => {
                e.stopPropagation();
                this.selectEventFromList(event.id);
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

        eventsListEl.scrollTop = prevListScroll;

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
                selectedItem.scrollIntoView({ block: 'nearest', behavior: 'instant' });
            }
        }
    }

    // Render starting position markers
    renderStartingPositions() {
        const tt = (text) => (typeof window !== 'undefined' && window.I18n) ? window.I18n.tText(text) : text;
        if (!this.startingPositionContainer || !this.currentMap) return;

        // Clear existing markers
        this.startingPositionContainer.removeChildren();

        const systemData = this.databaseManager.getSystem();
        if (!systemData) return;

        const mapId = this.currentMap.id;
        console.debug(`Rendering starting positions for map ${mapId}`);
        console.debug(`Player start is on map ${systemData.startMapId} at (${systemData.startX}, ${systemData.startY})`);

        // Render player starting position
        if (systemData.startMapId === mapId) {
            console.debug(`Rendering player starting position marker at (${systemData.startX}, ${systemData.startY})`);
            this.createStartingPositionMarker(systemData.startX, systemData.startY, tt('Player'), 0x00ff00, this.playerStartDirection());
        }

        // Render boat starting position
        if (systemData.boat && systemData.boat.startMapId === mapId) {
            this.createStartingPositionMarker(systemData.boat.startX, systemData.boat.startY, tt('Boat'), 0x0088ff);
        }

        // Render ship starting position
        if (systemData.ship && systemData.ship.startMapId === mapId) {
            this.createStartingPositionMarker(systemData.ship.startX, systemData.ship.startY, tt('Ship'), 0xff8800);
        }

        // Render airship starting position
        if (systemData.airship && systemData.airship.startMapId === mapId) {
            this.createStartingPositionMarker(systemData.airship.startX, systemData.airship.startY, tt('Airship'), 0xff00ff);
        }

        // Make container visible
        this.startingPositionContainer.visible = true;
        // The 3D view draws the same markers.
        const map3d = this.projectController?.mapEditor3D;
        if (map3d && typeof map3d.refreshStartMarkers === 'function') map3d.refreshStartMarkers();
    }

    // Create a starting position marker
    createStartingPositionMarker(x, y, label, color, direction) {
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

        // The player's marker carries an arrow at the edge it faces.
        if (direction) {
            const w = this.tilemapManager.TILE_WIDTH, h = this.tilemapManager.TILE_HEIGHT;
            graphics.poly(EventManager.arrowPoints(direction, w, h));
            graphics.fill({ color: 0xffffff, alpha: 0.95 });
            graphics.poly(EventManager.arrowPoints(direction, w, h));
            graphics.stroke({ color: 0x000000, width: 1, alpha: 0.8 });
        }

        container.addChild(graphics);

        // Add label text
        const text = new PIXI.Text({
            text: label,
            resolution: this.labelResolution(),
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

    /**
     * The raster resolution a label needs to stay sharp at the current zoom:
     * a label is world-sized (8 px on a 16 px tile), so at 4× zoom it must be
     * drawn at 4× the pixels, or it is an 8 px raster magnified into a blur.
     */
    labelResolution() {
        const zoom = this.tilemapManager?.container?.scale?.x || 1;
        const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
        return Math.max(1, Math.min(8, Math.ceil(zoom * dpr)));
    }

    /** Re-rasterize every label for the zoom in effect; called when the zoom changes. */
    updateLabelResolution() {
        const resolution = this.labelResolution();
        const visit = (node) => {
            if (!node) return;
            if (node instanceof PIXI.Text && node.resolution !== resolution) node.resolution = resolution;
            for (const child of node.children || []) visit(child);
        };
        visit(this.eventContainer);
        visit(this.startingPositionContainer);
        visit(this.eventNameLayer);
    }

    // Create sprite for an event
    createEventSprite(event) {
        const container = new PIXI.Container();
        container.x = event.x * this.tilemapManager.TILE_WIDTH;
        container.y = event.y * this.tilemapManager.TILE_HEIGHT;

        const isDragging = this.isDragging && this.draggedEvent && this.draggedEvent.id === event.id;
        const isSelected = this.selectedEvent && this.selectedEvent.id === event.id;

        // A sized event: its whole footprint, faint, behind its own square.
        const footprint = this._eventFootprint(event.id);
        if (footprint[0] > 1 || footprint[1] > 1) {
            const area = new PIXI.Graphics();
            // Centred on the event's tile: it starts left of and above it.
            const [firstX, firstY] = this._eventRect(event);
            area.x = (firstX - event.x) * this.tilemapManager.TILE_WIDTH;
            area.y = (firstY - event.y) * this.tilemapManager.TILE_HEIGHT;
            this._drawEventFootprint(area, footprint, isSelected);
            container.addChild(area);
            container._rrArea = area;
        }

        // The event's own square (graphic, name) stands in the middle of its footprint.
        const marker = new PIXI.Container();
        const [offsetX, offsetY] = this._eventMarkerOffset(event.id);
        marker.x = offsetX * this.tilemapManager.TILE_WIDTH;
        marker.y = offsetY * this.tilemapManager.TILE_HEIGHT;
        container.addChild(marker);
        container._rrMarker = marker;

        // The black background box with white border (RPG Maker style). An event that stands as its
        // model is drawn under this box (with the placed models): there the box is faint, so the model shows.
        const graphics = new PIXI.Graphics();
        const previewPage = this.getEventPreviewPage(event);
        const asModel = previewPage !== null && !!this.previewModelRaw(event, previewPage)?.name;
        container._rrSquareAlpha = asModel ? 0.15 : (isDragging ? 0.9 : 0.75);
        this._drawEventSquare(graphics, isSelected, container._rrSquareAlpha);
        marker.addChild(graphics);
        container._rrSquare = graphics;

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
                // The sprite is one tile of the sheet, so it is already the
                // project's tile size; only the inset has to be taken off.
                const scale = maxSize / this.tilemapManager.TILE_WIDTH;
                tileSprite.scale.set(scale);
                marker.addChild(tileSprite);
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
                    marker.addChild(characterSprite);
                    hasGraphic = true;
                }
            }
        }

        // Add event name text at the bottom of the tile
        const text = new PIXI.Text({
            text: event.name,
            resolution: this.labelResolution(),
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
        marker.addChild(text);

        return container;
    }

    /** The colour an event is drawn in: the theme's accent when it is the selected one, white otherwise. */
    _eventTone(isSelected) {
        return isSelected ? EventManager.selectedTone() : 0xffffff;
    }

    /**
     * The selected event's colour in both map views: the theme's accent, lightened when it is a dark
     * one (a light theme's), since it is drawn over the map, which is as dark as its scene.
     */
    static selectedTone() {
        const css = typeof ThemeColors !== 'undefined' && ThemeColors.resolve ? ThemeColors.resolve('--color-accent') : null;
        return EventManager.readableTone(EventManager.colorNumber(css, 0xFFD700));
    }

    /** A colour bright enough to read over a dark picture: mixed toward white until it is. */
    static readableTone(color) {
        let r = (color >> 16) & 255, g = (color >> 8) & 255, b = color & 255;
        const luminance = () => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
        for (let i = 0; i < 6 && luminance() < 0.4; i++) { r = Math.round(r + (255 - r) * 0.3); g = Math.round(g + (255 - g) * 0.3); b = Math.round(b + (255 - b) * 0.3); }
        return (r << 16) | (g << 8) | b;
    }

    /** A CSS colour (`#rgb`, `#rrggbb`, `rgb(r, g, b)`) as a number, or the fallback. */
    static colorNumber(css, fallback) {
        const text = String(css || '').trim();
        let match = /^#([0-9a-f]{6})$/i.exec(text);
        if (match) return parseInt(match[1], 16);
        match = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(text);
        if (match) return parseInt(match[1] + match[1] + match[2] + match[2] + match[3] + match[3], 16);
        match = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/i.exec(text);
        if (match) return (Math.min(255, Number(match[1])) << 16) | (Math.min(255, Number(match[2])) << 8) | Math.min(255, Number(match[3]));
        return fallback;
    }

    /** A sized event's footprint: every tile it triggers and blocks on (the caller stands it round the event's tile). */
    _drawEventFootprint(area, footprint, isSelected) {
        const fw = footprint[0] * this.tilemapManager.TILE_WIDTH, fh = footprint[1] * this.tilemapManager.TILE_HEIGHT;
        const tone = this._eventTone(isSelected);
        area.clear();
        area.rect(0, 0, fw, fh);
        area.fill({ color: tone, alpha: 0.12 });
        area.rect(0.5, 0.5, fw - 1, fh - 1);
        area.stroke({ width: 1, color: tone, alpha: 0.7 });
    }

    /** An event's own square: dark behind its graphic, bordered in its tone. */
    _drawEventSquare(graphics, isSelected, alpha = 0.75) {
        const tileWidth = this.tilemapManager.TILE_WIDTH, tileHeight = this.tilemapManager.TILE_HEIGHT;
        graphics.clear();
        graphics.rect(0, 0, tileWidth, tileHeight);
        graphics.fill({ color: 0x000000, alpha });
        graphics.rect(0, 0, tileWidth, tileHeight);
        graphics.stroke({ width: 1, color: this._eventTone(isSelected) });
    }

    /**
     * An event's outline over whatever is drawn on it: its footprint and its own square, edges only,
     * dark under light so they read on any picture. Returned at the event's own tile.
     */
    createEventOutline(event) {
        const tw = this.tilemapManager.TILE_WIDTH, th = this.tilemapManager.TILE_HEIGHT;
        const isSelected = !!(this.selectedEvent && this.selectedEvent.id === event.id);
        const [w, h] = this._eventFootprint(event.id);
        const [offsetX, offsetY] = this._eventMarkerOffset(event.id);
        // A unit's outline is its side's color (the selected one keeps the accent).
        const side = isSelected ? null : this.unitSide(event);
        const tone = side ? EventManager.colorNumber(side.color, 0xffffff) : this._eventTone(isSelected);
        const outline = new PIXI.Graphics();
        const edge = (x, y, width, height) => {
            outline.rect(x + 0.5, y + 0.5, width - 1, height - 1);
            outline.stroke({ width: 3, color: 0x000000, alpha: 0.55 });
            outline.rect(x + 0.5, y + 0.5, width - 1, height - 1);
            outline.stroke({ width: 1, color: tone, alpha: 1 });
        };
        const [firstX, firstY] = this._eventRect(event);
        if (w > 1 || h > 1) edge((firstX - event.x) * tw, (firstY - event.y) * th, w * tw, h * th);
        edge(offsetX * tw, offsetY * th, tw, th);
        outline.x = event.x * tw;
        outline.y = event.y * th;
        outline.eventMode = 'none';
        return outline;
    }

    /**
     * Outlines for the events whose preview is drawn (a page's graphic or its model at real size can
     * cover the event's square entirely), kept above the model layer so what is selected stays seen.
     */
    renderEventOutlines() {
        const parent = this.tilemapManager?.container;
        if (!parent || !this.currentMap || typeof PIXI === 'undefined') return;
        if (this.eventOutlineContainer && this.eventOutlineContainer.parent !== parent) {
            this.eventOutlineContainer.parent?.removeChild(this.eventOutlineContainer);
            if (!this.eventOutlineContainer.destroyed) this.eventOutlineContainer.destroy({ children: true });
            this.eventOutlineContainer = null;
        }
        if (!this.eventOutlineContainer) {
            this.eventOutlineContainer = new PIXI.Container();
            this.eventOutlineContainer.label = 'event outlines';
            this.eventOutlineContainer.eventMode = 'none';
        }
        const container = this.eventOutlineContainer;
        for (const child of container.removeChildren()) child.destroy();
        this.eventOutlines = new Map();
        // What is drawn on an outlined event (a unit's picture and ring, a model) covers the name in its square: the name is written again over it.
        const names = this._unitLayer('eventNameLayer', 'event names', () => new PIXI.Container());
        if (names) for (const child of names.removeChildren()) child.destroy();
        this.eventNames = new Map();
        const tw = this.tilemapManager.TILE_WIDTH, th = this.tilemapManager.TILE_HEIGHT;
        for (const event of this.currentMap.events || []) {
            if (!event || this.getEventPreviewPage(event) === null) continue;
            const outline = this.createEventOutline(event);
            container.addChild(outline);
            this.eventOutlines.set(event.id, outline);
            if (!names || !event.name) continue;
            const name = this.createEventName(event);
            names.addChild(name);
            this.eventNames.set(event.id, { sprite: name, dx: name.x - event.x * tw, dy: name.y - event.y * th });
        }
        // Above the placed models, the previewed ones drawn with them and the units' pictures; under the editor's own overlays.
        if (container.parent === parent) parent.removeChild(container);
        const models = parent.children.find(child => child && child.label === 'model props');
        const looks = this.unitLookLayer && !this.unitLookLayer.destroyed && this.unitLookLayer.parent === parent ? this.unitLookLayer : null;
        const under = looks && (!models || parent.getChildIndex(looks) > parent.getChildIndex(models)) ? looks : models || this.eventContainer;
        const index = under && under.parent === parent ? parent.getChildIndex(under) + 1 : parent.children.length;
        parent.addChildAt(container, Math.min(index, parent.children.length));
        // The names directly over the outlines.
        if (names && names.parent === parent) {
            parent.removeChild(names);
            parent.addChildAt(names, parent.getChildIndex(container) + 1);
        }
    }

    /** An event's name where and as its square writes it (`createEventSprite`: the middle of the lower edge of its own tile), for the layer over what stands on the event. */
    createEventName(event) {
        const tw = this.tilemapManager.TILE_WIDTH, th = this.tilemapManager.TILE_HEIGHT;
        const [offsetX, offsetY] = this._eventMarkerOffset(event.id);
        const text = new PIXI.Text({
            text: event.name,
            resolution: this.labelResolution(),
            style: { fontSize: 8, fill: 0xffffff, align: 'center', stroke: { color: 0x000000, width: 2 } }
        });
        text.anchor.set(0.5);
        text.x = (event.x + offsetX) * tw + tw / 2;
        text.y = (event.y + offsetY) * th + th - 6;
        text.eventMode = 'none';
        return text;
    }

    // Create a PIXI sprite from a tileId
    createTileSprite(tileId) {
        if (!this.tilesetPaletteViewer || !this.tilesetPaletteViewer.tilesetTextures) {
            return null;
        }

        const textures = this.tilesetPaletteViewer.tilesetTextures;
        // A sheet is sampled in the project's own tile size. The 48s that
        // remain below are the format's shapes-per-autotile-kind.
        const TILE_SIZE = this.tilemapManager?.TILE_WIDTH || 48;

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

            // Create sprite from texture (from the loaded image element —
            // Texture.from(url) would kick off a second async load and
            // render blank until it finished)
            const texture = PIXI.Texture.from(img);
            const rect = new PIXI.Rectangle(srcX, srcY, TILE_SIZE, TILE_SIZE);
            const croppedTexture = new PIXI.Texture({ source: texture.source, frame: rect });
            return new PIXI.Sprite(croppedTexture);

        } else if (tileId >= 1536) {
            // A5 tiles
            layer = 'A5';
            const localTileId = tileId - 1536;
            tileX = localTileId % 8;
            tileY = Math.floor(localTileId / 8);
        } else {
            // B-E and the extended F-G sheets. The sheet a tile id belongs to
            // is one definition shared with the map canvas, so an event's
            // graphic and the same tile painted on the map cannot disagree.
            layer = RRTilesetSheets.keyFromIndex(
                RRTilesetSheets.setNumberForNormalTileId(tileId));

            // Each sheet is 256 tiles split into two halves of 128, the right
            // half drawn beside the left. Reading it as a plain 8-wide grid
            // put every tile past the 128th off the bottom of the sheet.
            const localTileId = tileId % 256;
            tileX = (Math.floor(localTileId / 128) % 2) * 8 + (localTileId % 8);
            tileY = Math.floor((localTileId % 256) / 8) % 16;
        }

        // Get the tileset image for this layer
        const img = textures[layer];
        if (!img) {
            return null;
        }

        // Calculate source position in the tileset image
        const srcX = tileX * TILE_SIZE;
        const srcY = tileY * TILE_SIZE;

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
        const imgPath = RRAssetFiles.imageUrlFor(
            path.join(currentProject.path, 'img', 'characters'), image.characterName);

        try {
            // Load as HTML Image element first, then convert to PIXI texture
            // This is more reliable than PIXI.Texture.from() for file:// URLs.
            //
            // Cached by path. A fresh Image every render meant a fresh source
            // for PIXI, so every rebuild of the event layer allocated a new GPU
            // texture per event and freed none of them — and a re-render is
            // triggered by each image that finishes loading.
            if (!this._characterImages) this._characterImages = new Map();
            let htmlImg = this._characterImages.get(imgPath);
            if (!htmlImg) {
                htmlImg = new Image();
                htmlImg.src = imgPath;
                this._characterImages.set(imgPath, htmlImg);
            }

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

            const isBigCharacter = RRAssetFiles.isBigCharacter(image.characterName);

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

            // Scale to fit tile size (will be inset in createEventSprite).
            // The box this lands in is drawn at the project's tile size, so a
            // fixed 48 here overflowed it by half on a 32-pixel project.
            const TILE_SIZE = this.tilemapManager?.TILE_WIDTH || 48;
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
        this.removeEventInteraction();
        this.hideContextMenu();
        this._previewAnimations = [];
        this._syncPreviewTicker();
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

/**
 * Shift a just-opened submenu back inside the viewport: up by however much
 * it overhangs the bottom, and to the item's left side when it overhangs the
 * right. Positions are relative to the item, which is the submenu's offset
 * parent. Returns the offsets applied, for tests.
 */
EventManager.keepSubmenuOnScreen = function(submenu, itemRect, viewport) {
    submenu.style.top = '0px';
    submenu.style.left = '100%';
    submenu.style.right = 'auto';
    const rect = submenu.getBoundingClientRect();
    const margin = 8;
    const applied = { top: 0, flipped: false };
    const overhang = rect.bottom - (viewport.height - margin);
    if (overhang > 0) {
        // No higher than the top of the window.
        applied.top = -Math.min(overhang, Math.max(0, itemRect.top - margin)) || 0;
        submenu.style.top = `${applied.top}px`;
    }
    if (rect.right > viewport.width - margin) {
        submenu.style.left = 'auto';
        submenu.style.right = '100%';
        applied.flipped = true;
    }
    return applied;
};

/** The four facings a player can start with, and the words the picker uses for them. */
EventManager.DIRECTIONS = [[2, 'Down'], [4, 'Left'], [6, 'Right'], [8, 'Up']];

/**
 * A small arrow at the edge of a tile-sized marker, pointing the way a
 * facing says: a down arrow at the bottom edge, turned about the centre for
 * the other three.
 */
EventManager.arrowPoints = function(direction, width, height) {
    const cx = width / 2, cy = height / 2;
    const base = [[-6, cy - 13], [6, cy - 13], [0, cy - 3]];
    const angle = { 2: 0, 4: Math.PI / 2, 6: -Math.PI / 2, 8: Math.PI }[direction] || 0;
    const cos = Math.cos(angle), sin = Math.sin(angle);
    const points = [];
    for (const [x, y] of base) points.push(cx + x * cos - y * sin, cy + x * sin + y * cos);
    return points;
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = EventManager;
}
