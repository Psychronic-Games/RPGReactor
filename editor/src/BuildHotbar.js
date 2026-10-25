/**
 * BuildHotbar - building in the world, the way a survival game does it.
 *
 * A bar along the bottom of the 3D view: Select, then one slot per thing
 * you can put down (floor, wall, doorway, window, glass, stairs, ramp,
 * roof, pillar, fence, block, a shape, a screen, a light), an eraser that
 * takes things away, and a blueprint slot that stamps a saved building.
 * A panel at the side holds the specs of whatever is in hand or selected:
 * which way it faces, its material, its size and settings, a stair run's
 * steps, a screen's media, a light's colour, the blueprint to stamp.
 * Number keys pick slots, R turns, Q and E move the level, right-click
 * removes, a right-drag turns the view, Ctrl-drag lays a box, Ctrl+Z
 * undoes, Escape in Select with nothing selected leaves. Select picks a placed
 * piece up again: the panel then edits it, a drag moves it, a shape wears
 * handles to move, turn and size it, Delete removes it.
 *
 * The PieceBuilderManager stays the model (kind, mode, material, level,
 * strokes, selection, undo); this is its face.
 *
 * The bar has four groups, switched at its left end: Build (the above),
 * Terrain (the ground's brushes, dunes, the grounds painted over the floor
 * and the steep ground's material, rock, the water: pour, river, drain and a
 * sheet's look, the map's biome, and the land past its border), whose model
 * is the TerrainManager (rock is a shape the
 * PieceBuilderManager lays, shown here because it is ground), Foliage (grass, flowers, ferns and reeds painted on, and
 * bushes stood: the TerrainManager's foliage modes), and Models (3D models stood on the map: Select, Remove,
 * the Library, then the models in hand this session and on this map), whose
 * model is the ModelPropsManager. The panel shows the settings of whichever
 * is in hand; for Models it is the prop's own panel (placement, transform,
 * playback). Build's Select picks a placed model too, turning to Models.
 */
class BuildHotbar {
    constructor(projectController) {
        this.projectController = projectController;
        this.root = null;
        this.panel = null;
        this.visible = false;
        this._onKeyDown = event => this.handleKey(event);
        // The map view's Surroundings tick changed: Beyond the Border says whether the land is shown.
        this._onSurroundView = () => { if (this.visible && this.group() === 'terrain' && this.activeSlot() === 'surround') this.renderTerrainPanel(); };
    }

    static PIECES = ['floor', 'wall', 'doorway', 'door', 'window', 'glass', 'stair', 'ladder', 'ramp', 'roof', 'pillar', 'fence', 'block'];
    static EXTRA = ['shape', 'screen', 'light', 'hammer', 'blueprint'];
    /** Rock sizes to start from, [w, h, d] in tiles: pick one, click, stack. */
    /** A placed shape's panel tabs. */
    static SHAPE_TABS = ['size', 'offset', 'rotate'];
    static ROCK_PRESETS = { boulder: [3, 2, 3], rock: [4, 4, 4], cliff: [4, 8, 4], spire: [2, 8, 2], ledge: [6, 2, 3], slab: [6, 1, 6] };
    static SLOTS = ['select'].concat(BuildHotbar.PIECES, BuildHotbar.EXTRA);
    /** The Terrain group: the ground's brushes, the water, then the whole map's look and the land past its border. Each is a TerrainManager mode. */
    static TERRAIN = ['raise', 'lower', 'smooth', 'flatten', 'dunes', 'ground', 'terase', 'rock', 'pour', 'river', 'drain', 'look', 'biome', 'sky', 'surround'];
    static TERRAIN_MODE = { raise: 'raise', lower: 'lower', smooth: 'smooth', flatten: 'flatten', dunes: 'dunes', ground: 'ground', terase: 'ground', pour: 'fill', river: 'river', drain: 'drain', look: 'look', biome: 'biome', sky: 'sky', surround: 'surround' };
    /** The Models group's fixed slots; the models themselves follow as model0, model1... */
    static MODELS = ['mselect', 'mremove', 'library'];
    /** The Foliage group: four kinds painted as a density, then bushes. Each is a TerrainManager mode of the same name. */
    static FOLIAGE = ['grass', 'flowers', 'fern', 'reeds', 'bulbs', 'tendrils', 'crystals', 'bush', 'ferase'];
    /** Each group's eraser: the Build group's takes pieces away, the Terrain group's the painted ground, the Foliage group's every plant, the Models group's a model. */
    static ERASERS = ['hammer', 'terase', 'ferase', 'mremove'];
    /** The foliage kinds that are not Earth's, and their names. */
    static ALIEN_FOLIAGE = { bulbs: 'Bulbs', tendrils: 'Fronds', crystals: 'Crystals' };
    static GROUPS = ['build', 'terrain', 'foliage', 'models'];
    /** The Build group's keys, as Build binds them (PieceBuilderManager.handleKey, MapEditor3D's pointer). */
    static KEYS_HINT = 'click to place · drag a row · Ctrl-drag a box · right-click removes · right-drag turns the view · R turns the piece · Q/E level · Ctrl+Z undo';
    /**
     * How long after the last change a run of them (arrow keys on a slider, a number's arrows held, a color moved) is
     * kept as one undo step, in ms: longer than the wait before a held key or a held arrow starts to repeat.
     */
    static GATHER_MS = 800;
    /** The kinds whose facing matters: they climb, slope, open or run one way. */
    /** The longest stair run or ladder: as high as a piece may stand. */
    static get MAX_RUN() { return (typeof Reactor3D !== 'undefined' && Reactor3D.PIECE_MAX_LEVEL) || 240; }
    static FACING = ['stair', 'ladder', 'ramp', 'doorway', 'door', 'window', 'fence', 'roof', 'glass'];
    /** A door's choices, value and label. */
    static DOOR_STYLES = [['plank', 'Plank'], ['panelled', 'Paneled'], ['arched', 'Arched'], ['double', 'Double'], ['gate', 'Gate']];
    static DOOR_OPENS = [['auto', 'On approach'], ['action', 'OK button'], ['locked', 'Locked']];
    static WINDOW_FRAMES = [['', 'None'], ['cottage', 'Cottage'], ['two', 'Two panes'], ['arched', 'Arched'], ['plain', 'Plain']];

    _t(key, params) { return window.I18n ? window.I18n.t(key, params) : key; }
    _tt(text) { return window.I18n ? window.I18n.tText(text) : text; }
    manager() { return this.projectController?.pieceBuilderManager || window.reactor?.pieceBuilderManager || null; }
    terrain() { return this.projectController?.terrainManager || window.reactor?.terrainManager || null; }
    props() { return this.projectController?.modelPropsManager || window.reactor?.modelPropsManager || null; }
    /** Which group the bar shows: Terrain or Models while that tool holds the map. */
    group() {
        const tool = this.tool();
        if (tool === 'terrain') return BuildHotbar.FOLIAGE.includes(this.terrain()?.mode) ? 'foliage' : 'terrain';
        if (tool === 'models') return 'models';
        // Rock is laid by the builder and kept with the ground it is.
        return this.rockInHand() ? 'terrain' : 'build';
    }
    /** Whose tool holds the map: the terrain's, the models', else the builder's. */
    tool() { const tool = window.reactor?.mapTool; return tool === 'terrain' || tool === 'models' ? tool : 'build'; }
    /** Whether the builder holds a rock to lay (the Terrain group's Rock slot). */
    rockInHand() {
        const manager = this.manager();
        return !!manager && this.tool() === 'build' && !this.docked() && manager.mode === 'place' && manager.kind === 'rock';
    }
    slots() {
        const group = this.group();
        if (group === 'terrain') return BuildHotbar.TERRAIN;
        if (group === 'foliage') return BuildHotbar.FOLIAGE;
        if (group === 'models') return BuildHotbar.MODELS.concat((this.props()?.libraryModels() || []).map((_, i) => 'model' + i));
        return BuildHotbar.SLOTS;
    }
    currentMap() { return this.projectController?.getTilemapManager?.()?.currentMap || null; }
    is3D() { const map = this.currentMap(); const E = typeof RRMapElevation !== 'undefined' ? RRMapElevation : null; return !!(map && E && E.hasNote(map)); }

    /** The bar and the panel live over the map canvas; made once, shown when building. */
    mount(container) {
        if (this.root || !container) return;
        this.root = document.createElement('div');
        this.root.id = 'build-hotbar';
        this.root.className = 'rr-build-hotbar';
        this.root.style.display = 'none';
        container.appendChild(this.root);
        this.panel = document.createElement('div');
        this.panel.id = 'build-panel';
        this.panel.className = 'rr-build-panel rr-accent-scrollbar';
        this.panel.style.display = 'none';
        container.appendChild(this.panel);
        // The view and the bar change size (a window resized, a sidebar dragged, the slots wrapping): the layout follows.
        if (typeof ResizeObserver !== 'undefined') {
            this._resize = new ResizeObserver(() => this.layout());
            this._resize.observe(container);
            this._resize.observe(this.root);
        }
        this.render();
    }

    show() {
        const manager = this.manager();
        if (!this.root || !manager) return;
        const opening = !this.visible;
        this.visible = true;
        this.root.style.display = 'flex';
        this.panel.style.display = 'flex';
        manager.activate();
        // Opened, the bar starts in Select: a click picks up, nothing is laid by accident.
        if (opening && manager.mode !== 'select') manager.setMode('select');
        document.addEventListener('keydown', this._onKeyDown, true);
        document.addEventListener('rr-surround-view', this._onSurroundView);
        this.render();
    }

    hide(release = true) {
        if (!this.root) return;
        this.visible = false;
        this.root.style.display = 'none';
        this.panel.style.display = 'none';
        document.removeEventListener('keydown', this._onKeyDown, true);
        document.removeEventListener('rr-surround-view', this._onSurroundView);
        if (release) { this.manager()?.deactivate(); window.reactor?.claimMapTool?.('paint'); }
    }

    toggle(on) { if (on === undefined ? !this.visible : on) this.show(); else this.hide(); }

    /** The slot the manager's state names. */
    /** Whether Lighting or Media Surfaces holds the map while the bar is up. */
    docked() { const owner = window.reactor?.mapTool; return owner === 'lighting' ? 'light' : owner === 'media' ? 'screen' : null; }

    activeSlot() {
        const manager = this.manager();
        if (!manager) return 'wall';
        if (this.rockInHand()) return 'rock';
        if (this.group() === 'terrain') {
            const mode = this.terrain()?.mode;
            // (The ground's brush is two slots: Ground paints, the Eraser takes the paint away.)
            if (mode === 'ground') return this.terrain().groundErase ? 'terase' : 'ground';
            return BuildHotbar.TERRAIN.find(slot => BuildHotbar.TERRAIN_MODE[slot] === mode) || 'raise';
        }
        if (this.group() === 'foliage') return BuildHotbar.FOLIAGE.includes(this.terrain()?.mode) ? this.terrain().mode : 'grass';
        if (this.group() === 'models') {
            const props = this.props();
            if (!props || props.tool === 'erase') return 'mremove';
            if (!props.placing()) return 'mselect';
            const index = props.libraryModels().findIndex(entry => entry.name === props.model.name);
            return index >= 0 ? 'model' + index : 'mselect';
        }
        const docked = this.docked();
        if (docked) return docked;
        if (manager.mode === 'select') return 'select';
        if (manager.mode === 'erase') return 'hammer';
        if (manager.mode === 'stamp' || manager.mode === 'move') return 'blueprint';
        if (manager.kind === 'wedge') return 'ramp';
        if (manager.kind === 'rock') return 'rock';
        return BuildHotbar.PIECES.includes(manager.kind) ? manager.kind : 'shape';
    }

    /** The models tool takes the map (the bar stays), its panel in the bar's side panel. */
    enterModels() {
        const props = this.props();
        if (!props) return null;
        if (!props.active) {
            this._modelsBody = null;
            props.activate();
            window.reactor?.eventManager?.eventMode && window.reactor.eventManager.setEventMode(false);
        }
        return props;
    }

    /** Pick up a placed model (or just turn to Models in Select, with no id). */
    selectModel(id) {
        const props = this.enterModels();
        if (!props) return;
        props.tool = 'select';
        if (id) props.select(id);
        this._lastModels = 'mselect';
        this.render();
    }

    /** Pick up a water sheet (a Select click on it from any group): the bar turns to Terrain, its Look panel on that sheet, the sheet outlined. */
    selectWater(region) {
        const terrain = this.terrain();
        if (!terrain || !region) return false;
        if (!terrain.active) terrain.activate();
        terrain.setMode('look');
        this._lastTerrain = 'look';
        // Renders the bar and the panel with the sheet's look.
        terrain.selectWater(region);
        return true;
    }

    /** Pick up the piece under a point of the 3D view (a Select click on a building from another group): the bar turns to Build in Select with it selected. */
    selectPiece(clientX, clientY) {
        const manager = this.manager(), view = window.reactor?.mapEditor3D;
        if (!manager || !view?.pieceTargetAt) return false;
        this.pick('select');
        const piece = manager.selectAt(view.pieceTargetAt(clientX, clientY, { erase: true }));
        this.render();
        return !!piece;
    }

    /** Pick a slot: pieces place, the Eraser takes away, Select picks up, the rest open their specs. */
    pick(slot) {
        const manager = this.manager();
        if (!manager) return;
        // A models slot: Select picks up, Remove takes away, the Library opens the picker, a model is placed.
        if (BuildHotbar.MODELS.includes(slot) || /^model\d+$/.test(slot)) {
            const props = this.enterModels();
            if (!props) return;
            if (slot === 'library') { props.openModelPicker(); this.render(); return; }
            this._lastModels = slot;
            if (slot === 'mselect') props.tool = 'select';
            else if (slot === 'mremove') { props.tool = 'erase'; props.select(null); }
            else {
                const entry = props.libraryModels()[Number(slot.slice(5))];
                if (entry) props.chooseModel(entry);
            }
            this.render();
            return;
        }
        // A foliage slot: the terrain tool takes the map in that kind's mode.
        if (BuildHotbar.FOLIAGE.includes(slot)) {
            const terrain = this.terrain();
            if (!terrain) return;
            if (!terrain.active) terrain.activate();
            terrain.setMode(slot);
            this._lastFoliage = slot;
            this.render();
            return;
        }
        // A terrain slot: the terrain tool takes the map (the bar stays) in that mode.
        if (BuildHotbar.TERRAIN.includes(slot) && slot !== 'rock') {
            const terrain = this.terrain();
            if (!terrain) return;
            if (!terrain.active) terrain.activate();
            terrain.setMode(BuildHotbar.TERRAIN_MODE[slot]);
            if (slot === 'ground' || slot === 'terase') { terrain.editGroundType?.({}, 'commit'); terrain.groundErase = slot === 'terase'; }
            this._lastTerrain = slot;
            this.render();
            return;
        }
        if (this.tool() !== 'build') manager.activate();
        // Screens and lights have their own editors: the slot opens the one for the map, and the bar stays.
        if (slot === 'screen') { if (this.docked() !== 'screen') window.reactor?.mediaSurfaceManager?.open?.(); return; }
        if (slot === 'light') { if (this.docked() !== 'light') window.reactor?.lightingManager?.setActive?.(true); return; }
        if (this.docked()) manager.activate();
        if (slot === 'rock') this._lastTerrain = slot; else this._lastBuild = slot;
        if (slot === 'select') manager.setMode('select');
        else if (slot === 'ramp') manager.setKind('wedge');
        else if (BuildHotbar.PIECES.includes(slot)) manager.setKind(slot);
        else if (slot === 'hammer') manager.setMode('erase');
        else if (slot === 'rock') {
            // The first rock of a session wears the project's Rock material when it has one.
            if (!manager._rockPicked && manager.materials?.().some(m => m.name === 'Rock')) manager.material = 'Rock';
            manager._rockPicked = true;
            manager.setKind('rock');
        }
        else if (slot === 'shape') { const kinds = this.shapeKinds(); if (!kinds.includes(manager.kind) || manager.kind === 'wedge') manager.setKind(manager.lastShape || 'cylinder'); else manager.setMode('place'); }
        else if (slot === 'blueprint') { const plans = manager.structures(true); if (plans.length) { if (!plans.some(plan => plan.file === manager.structure)) manager.structure = plans[0].file; manager.setMode('stamp'); } }
        this.render();
        // After the render, which rebuilds the bar: a Blueprint with no plans to stamp says so.
        if (slot === 'blueprint' && !manager.structures().length) this.flash(this._t('pieces.noStructures'));
    }

    shapeKinds() { return (typeof DatabaseStructureEditor !== 'undefined' ? DatabaseStructureEditor.SHAPE_KINDS : (this.manager()?.kinds() || []).filter(k => !BuildHotbar.PIECES.includes(k))).filter(k => k !== 'rock'); }

    icon(name, size = 26) {
        const M = typeof PieceBuilderManager !== 'undefined' ? PieceBuilderManager.ICONS : {};
        const own = {
            select: 'M5 3l14 9-6 1.5L10 20z',
            shape: 'M4 17a8 8 0 0 1 16 0 M4 17h16v3H4z',
            screen: 'M3 5h18v11H3z M9 20h6 M10 9l5 2.5-5 2.5z',
            light: 'M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1M12 8a4 4 0 1 0 0 8a4 4 0 1 0 0-8',
            // The eraser, the same in every group.
            hammer: 'M4 15l9-9 6 6-7 7H7z M9 10l6 6 M13 19h7',
            terase: 'M4 15l9-9 6 6-7 7H7z M9 10l6 6 M13 19h7',
            ferase: 'M4 15l9-9 6 6-7 7H7z M9 10l6 6 M13 19h7',
            blueprint: 'M4 4h16v16H4z M8 8h8v8H8z M12 4v4M4 12h4M12 16v4M16 12h4',
            move: 'M12 3v18M3 12h18M12 3l-3 3M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3',
            turn: 'M19 12a7 7 0 1 1-2-4.9M17 3v4h4',
            size: 'M4 20v-7M4 20h7M4 20l6-6M20 4v7M20 4h-7M20 4l-6 6',
            ramp: 'M4 18h16l-16-9z',
            // The terrain group.
            raise: 'M3 20h18 M5 20c2-5 12-5 14 0 M12 13V4 M9 7l3-3 3 3',
            lower: 'M3 12h4c1 6 9 6 10 0h4 M12 3v7 M9 7l3 3 3-3',
            smooth: 'M3 9c3-4 6 4 9 0s6 4 9 0 M3 16c3-1.5 6 1.5 9 0s6 1.5 9 0',
            flatten: 'M3 18h18 M3 13h18 M8 8l4-4 4 4',
            pour: 'M12 3c3 5 6 8 6 11a6 6 0 0 1-12 0c0-3 3-6 6-11z',
            river: 'M3 7c3-2 5 2 8 0s5-2 8 0 M3 12c3-2 5 2 8 0s5-2 8 0 M3 17c3-2 5 2 8 0s5-2 8 0',
            drain: 'M12 3c3 5 6 8 6 11a6 6 0 0 1-12 0c0-3 3-6 6-11z M4 4l16 16',
            look: 'M12 3l2 5 5 2-5 2-2 5-2-5-5-2 5-2z M18 15l1 2 2 1-2 1-1 2-1-2-2-1 2-1z',
            dunes: 'M2 18c3-7 6-7 8-2 2-6 6-8 12 2z M2 21h20',
            ground: 'M3 20h18 M3 15c3-2 6 2 9 0s6-2 9 0 M7 10l2-5 2 5z M14 10c0-3 5-3 5 0z',
            biome: 'M12 3a9 9 0 1 0 0.01 0z M3 12h18 M12 3c-3 3-3 15 0 18 M12 3c3 3 3 15 0 18',
            // Room and Sky: a cloud under the sun.
            sky: 'M6 19h11a4 4 0 0 0 .4-7.98A5.5 5.5 0 0 0 6.6 12.2 3.4 3.4 0 0 0 6 19z M17 3v2 M21 7h-2 M13.5 4.5l1.2 1.2',
            // Beyond the border: a far ridge on the horizon, the map's edge in front.
            surround: 'M2 14h20 M6 14l4-6 3 4 2-2.5 3 4.5 M5 21v-3h14v3',
            undo: 'M9 14L4 9l5-5 M4 9h10a6 6 0 0 1 0 12h-3',
            redo: 'M15 14l5-5-5-5 M20 9H10a6 6 0 0 0 0 12h3',
            level: 'M3 16h18 M5 12h14 M4 8h16',
            build: 'M4 20V10l8-6 8 6v10z M9 20v-6h6v6',
            terrain: 'M2 19l6-9 4 5 3-3 7 7z',
            // The models group: a cube; Select, Remove and the Library within it.
            models: 'M12 3l8 4.5v9L12 21l-8-4.5v-9z M4 7.5l8 4.5 8-4.5 M12 12v9',
            mselect: 'M5 3l14 9-6 1.5L10 20z',
            mremove: 'M4 15l9-9 6 6-7 7H7z M9 10l6 6 M13 19h7',
            library: 'M4 4h6v6H4z M14 4h6v6h-6z M4 14h6v6H4z M14 14h6v6h-6z',
            // The foliage group: a tuft, then each kind.
            foliage: 'M12 20c0-6-2-10-6-13 M12 20c0-6 2-10 6-13 M12 20V6 M4 20h16',
            grass: 'M4 20c1-5 0-9-2-12 M8 20c0-6 1-10 3-13 M12 20c0-5-1-9-3-11 M16 20c0-6 1-9 4-12 M20 20c0-4 0-7-1-9 M2 20h20',
            flowers: 'M12 21v-9 M12 12c-2-4 2-4 0 0 M12 8a2 2 0 1 0 0.01 0 M8 8c-2 0-2-3 0-3s2 3 0 3z M16 8c2 0 2-3 0-3s-2 3 0 3z M12 4c0-2 3-2 3 0s-3 2-3 0z M9 21c0-3-2-5-4-6 M15 21c0-3 2-5 4-6',
            fern: 'M12 21C12 13 9 7 3 4 M12 21c0-8 3-14 9-17 M7 9l2-3 M6 12l3-2 M17 9l-2-3 M18 12l-3-2 M12 21V9',
            reeds: 'M8 21V7 M12 21V4 M16 21V8 M11 4h2v5h-2z M7 7h2v4H7z M4 21h16',
            bush: 'M4 18a5 5 0 0 1 3-8 5 5 0 0 1 10 0 5 5 0 0 1 3 8z M12 18v3',
            bulbs: 'M8 21c0-5 1-8 3-10 M11 8a3 3 0 1 0 0.01 0 M16 21c0-3 0-5 1-7 M17.5 11.5a2 2 0 1 0 0.01 0 M4 21h16',
            tendrils: 'M7 21c0-7 1-11 4-13a3 3 0 1 1 0 5 M15 21c0-5 1-8 3-9a2.2 2.2 0 1 1 0 3.6 M4 21h16',
            crystals: 'M6 21l1-9 2-3 2 3 1 9z M13 21l1.5-12 2-4 2 4 1.5 12z M3 21h18'
        };
        const path = own[name] || M[name] || '';
        return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true"><path d="${path}" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
    }

    label(slot) {
        if (BuildHotbar.PIECES.includes(slot) || slot === 'rock') return this._t('pieces.kind.' + slot);
        if (slot === 'mselect') return this._t('build.select');
        if (slot === 'mremove' || slot === 'terase' || slot === 'ferase') return this._t('build.hammer');
        if (slot === 'library') return this._t('build.library');
        if (/^model\d+$/.test(slot)) return (this.props()?.libraryModels()[Number(slot.slice(5))]?.name || '').split('/').pop();
        if (slot === 'dunes' || slot === 'ground' || slot === 'biome' || slot === 'sky' || slot === 'surround') return this._tt({ dunes: 'Dunes', ground: 'Ground', biome: 'Biome', sky: 'Room and Sky', surround: 'Beyond the Border' }[slot]);
        if (BuildHotbar.TERRAIN.includes(slot)) return this._t({ pour: 'terrain.waterPour', drain: 'terrain.drain', look: 'terrain.lookShort' }[slot] || 'terrain.' + slot);
        if (BuildHotbar.ALIEN_FOLIAGE[slot]) return this._tt(BuildHotbar.ALIEN_FOLIAGE[slot]);
        if (BuildHotbar.FOLIAGE.includes(slot)) return this._t('foliage.' + slot);
        return this._t('build.' + slot);
    }

    render() {
        const root = this.root, manager = this.manager();
        if (!root || !manager) return;
        const active = this.activeSlot();
        const group = this.group(), terrain = group === 'terrain' && !this.rockInHand();
        const slots = this.slots();
        const escape = text => String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
        const face = slot => {
            if (!/^model\d+$/.test(slot)) return this.icon(slot === 'shape' && active === 'shape' ? manager.kind : slot);
            const url = this.modelThumb(this.props()?.libraryModels()[Number(slot.slice(5))]);
            return url ? `<img class="rr-build-slot-thumb" src="${url}" alt="">` : this.icon('models');
        };
        const button = slot => `<button type="button" class="rr-build-slot${/^model\d+$/.test(slot) ? ' rr-build-slot-model' : ''}" data-slot="${slot}" aria-pressed="${slot === active}" title="${escape(this.label(slot))}">
            ${face(slot)}<span class="rr-build-slot-label">${escape(this.label(slot))}</span></button>`;
        root.innerHTML = `
            ${this.is3D() ? '' : `<div class="rr-build-note">${this._t('build.needs3D')}</div>`}
            <div class="rr-build-row rr-build-slots">
                <div class="rr-build-groups" role="radiogroup">${BuildHotbar.GROUPS.map(g => `<button type="button" class="rr-build-group" data-group="${g}" role="radio" aria-checked="${g === group}" title="${this._t('build.group.' + g)}">${this.icon(g, 18)}<span>${this._t('build.group.' + g)}</span></button>`).join('')}</div>
                ${slots.map(button).join('')}</div>
            <div class="rr-build-hint">${terrain || group === 'foliage' ? `<span class="rr-build-keys">${this._t('terrain.keys')}</span>` : group === 'models' ? `<span class="rr-build-keys">${this._t('build.modelKeys')}</span>` : `${this._t('build.level')} <b class="rr-build-level">${manager.level}</b><span class="rr-build-keys"> · ${this._tt(BuildHotbar.KEYS_HINT)}</span>`}</div>`;
        this._slotsKey = slots.join('|');
        root.querySelectorAll('.rr-build-slot').forEach(el => el.addEventListener('click', () => this.pick(el.dataset.slot)));
        root.querySelectorAll('.rr-build-group').forEach(el => el.addEventListener('click', () => {
            const to = el.dataset.group;
            if (to === group) return;
            const last = this._lastModels && this.slots().includes(this._lastModels) ? this._lastModels : 'mselect';
            this.pick(to === 'terrain' ? (this._lastTerrain || 'raise') : to === 'foliage' ? (this._lastFoliage || 'grass') : to === 'models' ? (/^model/.test(last) && !this.props()?.libraryModels().length ? 'mselect' : last) : (this._lastBuild || 'select'));
        }));
        if (this.panel && this.visible) this.panel.style.display = this.docked() ? 'none' : 'flex';
        this.renderPanel();
        this.layout();
    }

    /** A model's picture for its slot, or null while it is drawn (the bar redraws when it lands). */
    modelThumb(entry) {
        if (!entry || typeof RREventPreviewModels === 'undefined' || typeof Reactor3D === 'undefined' || !Reactor3D.normalizeModelSpec) return null;
        const project = this.projectController?.getCurrentProject?.() || this.projectController?.currentProject;
        // Pictures by name, so per project: another project's model of the same name is another model.
        if (!this._thumbs || this._thumbsProject !== project?.path) { this._thumbs = new Map(); this._thumbsProject = project?.path; }
        const thumbs = this._thumbs;
        const known = thumbs.get(entry.name);
        if (known !== undefined) return known;
        thumbs.set(entry.name, null);
        const spec = Reactor3D.normalizeModelSpec({ name: entry.name, ext: entry.ext, file: entry.file, texture: entry.texture, size: 1, scale: 1 });
        if (!spec || !project) return null;
        Promise.resolve(RREventPreviewModels.thumbnail(project, spec, window.reactor?.mapEditor3D || this.projectController?.mapEditor3D, 64, 2)).then(result => {
            if (!result?.url) { thumbs.delete(entry.name); return; }
            thumbs.set(entry.name, result.url);
            if (this.visible && this.group() === 'models' && thumbs === this._thumbs) this.render();
        }).catch(() => thumbs.delete(entry.name));
        return null;
    }

    /** The Models group's panel: the prop panel itself, mounted once and kept (it syncs itself). */
    renderModelsPanel() {
        const panel = this.panel, props = this.props();
        if (!panel || !props) return;
        if (this._modelsBody && panel.contains(this._modelsBody) && props.panel === this._modelsBody) { props._syncPanel?.(); return; }
        this.setPanel('models', this._t('build.group.models'), '', '');
        panel.querySelector('.rr-build-panel-body').classList.add('rr-build-models-body');
        this._modelsBody = panel.querySelector('.rr-build-models-body');
        // With the room of the side panel, the transform card opens first.
        if (!props._activeSection) props._activeSection = 'transform';
        props.initializeUI(this._modelsBody);
    }

    // ---- The specs panel ------------------------------------------------------

    /** What the panel edits: the selected piece when there is one, else what the slot will place. */
    subject() {
        const manager = this.manager();
        if (manager.mode === 'select' && manager.selectionIds().length > 1) return { kind: 'many', placed: true, count: manager.selectionIds().length };
        const piece = manager.mode === 'select' ? manager.selectedPiece() : null;
        if (piece) return { piece, kind: piece.kind, shape: manager.isShape(piece.kind), placed: true };
        const active = this.activeSlot();
        if (active === 'select' || active === 'hammer' || active === 'blueprint') return { kind: active, placed: false };
        return { kind: manager.kind, shape: manager.isShape(manager.kind), placed: false };
    }

    renderPanel() {
        const panel = this.panel, manager = this.manager();
        if (!panel || !manager) return;
        if (this.group() === 'terrain' && !this.rockInHand()) { this._modelsBody = null; this.renderTerrainPanel(); return; }
        if (this.group() === 'foliage') { this._modelsBody = null; this.renderFoliagePanel(); return; }
        if (this.group() === 'models') { this.renderModelsPanel(); return; }
        this._modelsBody = null;
        const s = this.subject();
        const tt = text => this._tt(text);
        const escape = text => String(text ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
        // The dock's convention (Lighting, Media Surfaces): a card per group, its header on an accent strip, what is chosen at its right.
        const section = (title, body, meta) => body ? `<div class="lit-section rr-build-section"><div class="lit-section-header">${title}${meta ? `<span class="lit-section-meta">${escape(meta)}</span>` : ''}</div><div class="lit-section-body">${body}</div></div>` : '';
        // What a beginner needs is in view; the rest waits under Advanced, open or shut as it was last left for this kind.
        const more = (key, body) => body ? `<details class="lit-section rr-build-section rr-build-more" data-more="${key}"${this.moreOpen(key) ? ' open' : ''}><summary class="lit-section-header">${tt('Advanced')}</summary><div class="lit-section-body">${body}</div></details>` : '';
        const lead = text => `<div class="rr-build-note rr-build-wrap rr-build-lead">${text}</div>`;
        let foot = '';
        const num = (cls, label, value, min, max, step, key, axis) => `<label class="rr-build-field${axis ? ' mp-axis-' + axis : ''}"><span${axis ? ' class="mp-axis-label"' : ''}>${label}</span><input type="number" class="database-field-value ${cls}" data-key="${key}" value="${value}" min="${min}" max="${max}" step="${step}"></label>`;
        // A row with a slider: the slider edits live (one undo step per drag), the number when it is typed.
        const slide = (cls, label, value, min, max, step, key, axis, span) => {
            const lo = span ? Math.max(min, Math.floor(value - span)) : min, hi = span ? Math.min(max, Math.ceil(value + span)) : max;
            return `<div class="mp-transform-row rr-build-slide mp-axis-${axis}"><span class="mp-axis-label">${label}</span><input type="range" class="rr-build-slider" data-for="${cls}" data-key="${key}" min="${lo}" max="${hi}" step="${step}" value="${value}" data-no-stepper><input type="number" class="database-field-value ${cls}" data-key="${key}" value="${value}" min="${min}" max="${max}" step="${step}" data-no-stepper></div>`;
        };
        // The material in use, large; a click opens the project's materials to swap it for another.
        const materialUrl = name => (manager.materials().find(entry => entry.name === name) || {}).url || '';
        const swatches = current => RRMaterialPopup.tile({ cls: 'rr-build-material-tile', value: current || '', url: materialUrl(current), blank: this._t('pieces.plain'), attrs: `title="${escape(this._t('pieces.material'))}"` });
        const materialCard = current => section(this._t('pieces.material'), swatches(current));
        const FINISHES = ['', 'mirror', 'chrome', 'polished', 'glossy', 'gold'];
        const PRESETS = (typeof Reactor3D !== 'undefined' && Reactor3D.PIECE_FINISHES) || {};
        const surfaceOf = p => p ? (p.surface || (p.finish && PRESETS[p.finish]) || null) : null;
        const sameSurface = (a, b) => (!a && !b) || (!!a && !!b && ['reflect', 'gloss', 'metal', 'texture'].every(k => Math.abs((a[k] || 0) - (b[k] || 0)) < 1e-6) && String(a.tint || '#ffffff').toLowerCase() === String(b.tint || '#ffffff').toLowerCase());
        // The finishes as presets; the surface's own sliders (as a 3D model's Surface has) under Custom, or open when no preset matches.
        // `differ`: the pieces read wear different surfaces, so no preset is pressed and the sliders stay shut until asked for.
        const finishes = (holder, differ = false) => {
            const current = surfaceOf(holder);
            const preset = differ ? null : FINISHES.find(f => sameSurface(current, f ? PRESETS[f] : null));
            const custom = preset === undefined || !!this._finishCustom;
            const chips = `<div class="rr-build-finishes">${FINISHES.map(f => `<button type="button" class="rr-build-chip rr-build-finish" data-finish="${f}" aria-pressed="${!custom && preset === f}">${f === 'mirror' ? this._t('build.finish.mirror') : tt(f ? f[0].toUpperCase() + f.slice(1) : 'Plain')}</button>`).join('')}`
                + `<button type="button" class="rr-build-chip rr-build-finish-custom" aria-pressed="${custom}">${tt('Custom')}</button></div>`;
            const v = current || { reflect: 0, gloss: 0.8, metal: 0, texture: 0, tint: '#ffffff' };
            // The rest show only through the reflection: dimmed while it is 0, their values kept.
            const dim = key => key !== 'reflect' && !(v.reflect > 0) ? ' is-dimmed' : '';
            const row = (key, label) => `<div class="mp-transform-row rr-build-slide rr-surface-row${dim(key)}" data-surface="${key}"><span class="mp-axis-label">${label}</span><input type="range" class="rr-build-slider" data-for="rr-build-surface" data-key="${key}" min="0" max="1" step="0.01" value="${v[key] || 0}" data-no-stepper><input type="number" class="database-field-value rr-build-surface" data-key="${key}" value="${Math.round((v[key] || 0) * 100)}" min="0" max="100" step="1" data-no-stepper></div>`;
            return chips + `<div class="rr-build-surface-rows"${custom ? '' : ' hidden'}>` + row('reflect', tt('Reflection')) + row('gloss', tt('Gloss')) + row('metal', tt('Metal')) + row('texture', tt('Texture'))
                + `<div class="mp-transform-row rr-surface-row${dim('tint')}" data-surface="tint"><span class="mp-axis-label">${tt('Tint')}</span>${typeof RRColorPopup !== 'undefined' ? RRColorPopup.swatch('rr-build-surface-tint', v.tint || '#ffffff') : ''}</div></div>`;
        };
        const facing = rot => `<div class="rr-build-facing">${[[2, '↑'], [3, '→'], [0, '↓'], [1, '←']].map(([r, arrow]) => `<button type="button" class="rr-build-chip rr-build-rot" data-rot="${r}" aria-pressed="${r === rot}">${arrow}</button>`).join('')}<span class="rr-build-note" title="${escape(this._t('pieces.turn'))}">R</span></div>`;
        let head, body = '';
        if (s.kind === 'many') {
            head = this._t('build.selectedMany', { count: s.count });
            // Keep it: the selection as a structure, stamped again anywhere from the Blueprint slot.
            const keep = `<button type="button" class="rr-btn-secondary rr-build-save-structure rr-build-wide-button">${this.icon('blueprint', 16)}<span>${escape(tt('Save as structure…'))}</span></button>`
                + `<div class="rr-build-note rr-build-wrap">${escape(tt('Reuse it anywhere from the Blueprint slot.'))}</div>`;
            // The parts of what is selected, a material each: a row per part, then one for them all. One part alone is the plain card.
            const pieces = manager.selectionPieces ? manager.selectionPieces() : [];
            const parts = manager.selectionParts ? manager.selectionParts() : [];
            const whole = this.wholePart(parts, s.count);
            this.keepPartsView(parts);
            const hand = this.partInHand(parts);
            const materials = parts.length > 1 ? section(tt('Materials'), this.partRows(parts, whole, hand, materialUrl))
                : section(this._t('pieces.material'), this.partTile(whole, this._t('pieces.material'), materialUrl));
            // The Finish card reads the part in hand (every selected piece when none is): pieces that differ press no preset.
            const inHand = hand ? new Set(hand.ids) : null, held = inHand ? pieces.filter(piece => inHand.has(piece.id)) : pieces;
            const differ = held.some(piece => !sameSurface(surfaceOf(piece), surfaceOf(held[0])));
            body = lead(this._t(parts.length > 1 ? 'build.parts.hint' : 'build.manyHint')) + section(tt('Structure'), keep) + materials
                + section(this._t('build.finish'), finishes(held[0] || null, differ), parts.length > 1 ? (hand ? this.partName(hand.key) : this._t('build.parts.all')) : '');
            foot = `<button type="button" class="rr-btn-secondary rr-build-turn-all">${this.icon('turn', 16)}<span>${tt('Turn')}</span></button><button type="button" class="rr-btn-secondary rr-build-remove">${this._t('build.remove')}</button>`;
        } else if (s.kind === 'select') {
            head = this._t('build.select');
            body = lead(this._t('build.nothingSelected')) + lead(this._t('build.boxHint'));
        } else if (s.kind === 'hammer') {
            head = this._t('build.hammer');
            body = lead(this._t('build.hammerHint'));
        } else if (s.kind === 'blueprint') {
            const plans = manager.structures(true);
            head = this._t('build.blueprint');
            // A building picked up in move mode that came from a plan can be laid again from it.
            const map = this.currentMap(), E = manager.elevation();
            const record = manager.mode === 'move' && manager.selectedGroup && E && map ? E.structureOf(map, manager.selectedGroup) : null;
            if (record) foot = `<button type="button" class="rr-btn-secondary rr-build-relay" title="${tt('Lay this building again from its plan as the plan is now.')}">${tt('Rebuild from plan')}</button>`;
            body = plans.length
                ? lead(this._t('build.blueprintHint')) + section(tt('Name'), `<select class="database-field-value rr-build-plan">${plans.map(plan => `<option value="${plan.file}" ${manager.structure === plan.file ? 'selected' : ''}>${plan.name}</option>`).join('')}</select>`)
                : lead(this._t('build.noBlueprints'));
        } else {
            // A piece or a shape, in hand or placed: what a click does, then its sizes or shape, facing, material and
            // its own cards; the finish and the rarer settings under Advanced.
            const piece = s.piece || null;
            const kind = s.kind;
            head = (s.placed ? this._t('build.selected') + ': ' : '') + (kind === 'wedge' ? this._t('pieces.kind.ramp') : this._t('pieces.kind.' + kind));
            const rot = piece ? (s.shape ? Math.round(((piece.angle || 0) / 90) % 4) : piece.rot) : (s.shape ? 0 : manager.rot);
            let advanced = '';
            body += lead(piece ? this._t('build.hint.edit') : kind === 'rock' ? this._t('build.rock.hint') : this._t('build.hint.place'));
            // A rock: sizes to start from, the one in use lit; in hand, whether each rock of a drag varies.
            let rockPresets = '';
            if (kind === 'rock') {
                const size = (piece ? piece.size : manager.sizeFor(kind)).join(',');
                const named = Object.entries(BuildHotbar.ROCK_PRESETS).find(([, dims]) => dims.join(',') === size);
                rockPresets = `<div class="rr-build-shapes">${Object.entries(BuildHotbar.ROCK_PRESETS).map(([name, dims]) => `<button type="button" class="rr-build-chip rr-build-rockpreset" data-preset="${name}" aria-pressed="${dims.join(',') === size}" title="${dims.join(' × ')}">${this.icon('rock', 20)}<span>${this._t('build.rock.' + name)}</span></button>`).join('')}</div>`;
                // In hand the presets lead; a placed rock has them on its Size tab.
                if (!piece) body += section(tt('Size'), rockPresets + `<label class="rr-build-check"><input type="checkbox" class="rr-build-rockvary"${manager.rockVary ? ' checked' : ''}> ${this._t('build.rock.vary')}</label>`, named ? this._t('build.rock.' + named[0]) : size.split(',').join(' × '));
            }
            // Which shape: every one as an icon, its name on hover and in the card's corner (a placed one changes kind and keeps its size and place).
            const shapeGrid = s.shape && kind !== 'wedge' && kind !== 'rock' ? `<div class="rr-build-shape-grid">${this.shapeKinds().filter(k => k !== 'wedge').map(k => `<button type="button" class="rr-build-chip rr-build-shape" data-shape="${k}" aria-pressed="${k === kind}" title="${escape(this._t('pieces.kind.' + k))}" aria-label="${escape(this._t('pieces.kind.' + k))}">${this.icon(k, 20)}</button>`).join('')}</div>` : '';
            if (shapeGrid && !piece) body += section(tt('Shape'), shapeGrid, this._t('pieces.kind.' + kind));
            if (!s.shape && (BuildHotbar.FACING.includes(kind) || s.placed)) body += section(this._t('build.direction'), facing(rot));
            // A rock's sides and top share one card: the same swatches, a tab each (its top: nothing, the map's own ground, or any material).
            if (kind === 'rock') {
                const material = piece ? piece.material : manager.material;
                const cap = piece ? (piece.cap || '') : manager.rockCap;
                const capChip = (value, label) => `<button type="button" class="rr-build-chip rr-build-rockcap" data-cap="${value}" aria-pressed="${cap === value}">${label}</button>`;
                const top = `<div class="rr-build-rockcaps">${capChip('', this._t('build.rock.capNone'))}${capChip('ground', this._t('build.rock.capGround'))}</div>`
                    + RRMaterialPopup.tile({ cls: 'rr-build-rockcap-tile', value: cap && cap !== 'ground' ? cap : '', url: materialUrl(cap), blank: this._t('pieces.material'), attrs: `title="${escape(this._t('build.rock.top'))}"` });
                const capName = cap === '' ? this._t('build.rock.capNone') : cap === 'ground' ? this._t('build.rock.capGround') : cap;
                body += `<div class="lit-section rr-build-section">` + this.paneTabs('rockmat', [['sides', `${this._t('pieces.material')} · ${escape(material || this._t('pieces.plain'))}`, swatches(material)], ['top', `${this._t('build.rock.top')} · ${escape(capName)}`, top]]) + '</div>';
            } else body += materialCard(piece ? piece.material : manager.material);
            if (kind === 'door') body += this.doorSections(piece, section);
            if (kind === 'window') body += this.windowSections(piece, section);
            // A rock's tint under Advanced.
            if (kind === 'rock') {
                const tint = (piece ? piece.tint : manager.rockTint) || '#ffffff';
                advanced += `<div class="rr-build-field rr-build-wide"><span>${this._t('build.rock.tint')}</span><div class="rr-build-rocktint-row"><input type="color" class="rr-build-rocktint" value="${tint}"><button type="button" class="rr-btn-secondary rr-build-rocktint-reset"${tint === '#ffffff' ? ' disabled' : ''}>${this._t('build.rock.tintReset')}</button></div></div>`;
            }
            // A flight's steps and width, in hand or placed (a placed flight is laid again from its foot).
            const flight = kind === 'stair' && s.placed && manager.stairFlight ? manager.stairFlight(piece) : null;
            if (kind === 'stair') body += section(tt('Size'), num('rr-build-steps', this._t('build.steps'), flight ? flight.steps : manager.stairSteps, 1, BuildHotbar.MAX_RUN, 1, 'steps')
                + num('rr-build-stairwidth', this._t('build.stairWidth'), flight ? flight.width : manager.stairWidth, 1, 20, 1, 'width'));
            // A ladder's height and width, in hand or placed (a placed one is laid again from its foot).
            const ladder = kind === 'ladder' && piece && manager.ladderFlight ? manager.ladderFlight(piece) : null;
            if (kind === 'ladder') body += section(tt('Size'), num('rr-build-ladderheight', tt('Height'), ladder ? ladder.height : manager.ladderHeight, 0.5, BuildHotbar.MAX_RUN, 0.1, 'height')
                + num('rr-build-ladderwidth', tt('Width'), ladder ? ladder.width : manager.ladderWidth, 0.5, 20, 0.1, 'width'));
            if (s.shape) {
                const size = piece ? piece.size : manager.sizeFor(kind);
                const labels = kind === 'wedge' ? [tt('Width'), tt('Height'), tt('Length')] : [tt('Width'), tt('Height'), tt('Depth')];
                const sizeRows = [0, 1, 2].map(i => slide('rr-build-size', labels[i], size[i], 0.25, 60, 0.05, String(i), ['x', 'y', 'z'][i], Math.max(4, size[i]))).join('');
                const own = (typeof DatabaseStructureEditor !== 'undefined' && DatabaseStructureEditor.SHAPE_PARAMS[kind]) || {};
                let settings = '';
                if ('sides' in own) settings += num('rr-build-param', tt('Sides'), piece?.sides ?? manager.params?.[kind]?.sides ?? own.sides, 3, 32, 1, 'sides');
                if ('taper' in own) settings += num('rr-build-param', tt('Top') + ' %', Math.round((piece?.taper ?? manager.params?.[kind]?.taper ?? own.taper) * 100), 0, 100, 5, 'taper');
                if ('sweep' in own) settings += num('rr-build-param', tt('Around') + ' °', piece?.sweep ?? manager.params?.[kind]?.sweep ?? own.sweep, 15, 360, 15, 'sweep');
                if ('thick' in own) settings += num('rr-build-param', tt('Wall') + ' %', Math.round((piece?.thick ?? manager.params?.[kind]?.thick ?? own.thick) * 100), 2, 100, 2, 'thick');
                if ('rough' in own) settings += num('rr-build-param', tt('Rough') + ' %', Math.round((piece?.rough ?? manager.params?.[kind]?.rough ?? own.rough) * 100), 0, 100, 5, 'rough');
                if (piece) {
                    // A placed shape's size, place and turn as tabs (as the event model panel's), one pane at a time.
                    const tabIds = shapeGrid ? ['shape'].concat(BuildHotbar.SHAPE_TABS) : BuildHotbar.SHAPE_TABS;
                    const tab = tabIds.includes(this._shapeTab) ? this._shapeTab : 'size';
                    const shapeAt = [piece.x + 0.5 + (piece.offset ? piece.offset[0] || 0 : 0), piece.y + 0.5 + (piece.offset ? piece.offset[1] || 0 : 0)];
                    // In the handles' colours: red X, green up, blue Z; the rings alike (tilt about red, turn about green, roll about blue).
                    const pane = tab === 'shape' ? shapeGrid : tab === 'offset'
                        ? slide('rr-build-pos', 'X', shapeAt[0], 0, 999, 0.05, 'x', 'x', 4) + slide('rr-build-pos', tt('Up'), piece.z, 0, 120, 0.05, 'z', 'y', 6) + slide('rr-build-pos', 'Z', shapeAt[1], 0, 999, 0.05, 'y', 'z', 4)
                        : tab === 'rotate'
                            ? slide('rr-build-turn', tt('Tilt'), piece.tilt || 0, 0, 359, 1, 'tilt', 'x') + slide('rr-build-turn', tt('Turn'), piece.angle || 0, 0, 359, 1, 'angle', 'y') + slide('rr-build-turn', tt('Roll'), piece.roll || 0, 0, 359, 1, 'roll', 'z')
                            : rockPresets + sizeRows + (settings ? `<div class="rr-build-subhead">${this._t('build.settings')}</div>${settings}` : '');
                    const tabs = [['shape', tt('Shape')], ['size', tt('Size')], ['offset', tt('Offset')], ['rotate', tt('Rotate')]].filter(([id]) => tabIds.includes(id))
                        .map(([id, label]) => `<button type="button" role="tab" class="map-props-btn rr-build-tab${id === tab ? ' primary' : ''}" aria-selected="${id === tab}" data-tab="${id}">${label}</button>`).join('');
                    body += `<div class="lit-section rr-build-section"><div class="rr-build-tabs" role="tablist">${tabs}</div><div class="lit-section-body">${pane}</div></div>`;
                } else if (kind === 'rock') {
                    // A rock in hand starts from its preset sizes; the exact sizes wait under Advanced.
                    advanced += `<div class="rr-build-subhead">${tt('Size')}</div>${sizeRows}` + (settings ? `<div class="rr-build-subhead">${this._t('build.settings')}</div>${settings}` : '');
                } else {
                    body += section(tt('Size'), sizeRows);
                    if (settings) advanced += `<div class="rr-build-subhead">${this._t('build.settings')}</div>${settings}`;
                }
            }
            advanced += `<div class="rr-build-subhead">${this._t('build.finish')}</div>` + finishes(piece || { finish: manager.finish, surface: manager.surface });
            body += more(kind, advanced);
            // A placed piece: the whole building it belongs to is a click away (a double-click on the map does the same).
            if (s.placed) foot = `<button type="button" class="rr-btn-secondary rr-build-select-whole" title="${escape(tt('Double-click a piece to do the same.'))}">${this.icon('select', 16)}<span>${escape(tt('Select whole building'))}</span></button>`
                + `<button type="button" class="rr-btn-secondary rr-build-remove">${this._t('build.remove')}</button>`;
        }
        this.setPanel(s.kind === 'wedge' ? 'ramp' : s.kind === 'many' ? 'select' : s.kind, head, body, foot);
        this.bindPanel(s);
    }

    // ---- Several pieces selected: the parts of the building, a material each ----

    /** What each part is called: the bar's own word for its pieces where it has one (a window's frame as its own card names it). */
    static PART_NAMES = {
        wall: 'pieces.kind.wall', inner: 'build.parts.inner', floor: 'pieces.kind.floor', ceiling: 'build.parts.ceiling', roof: 'pieces.kind.roof',
        stair: 'pieces.kind.stair', ramp: 'pieces.kind.ramp', ladder: 'pieces.kind.ladder', pillar: 'pieces.kind.pillar', door: 'pieces.kind.door',
        glass: 'pieces.kind.glass', fence: 'pieces.kind.fence', path: 'build.parts.path', block: 'pieces.kind.block', shape: 'build.shape', rock: 'pieces.kind.rock'
    };

    partName(key) { return key === 'frame' ? this._tt('Window frame') : this._t(BuildHotbar.PART_NAMES[key] || 'build.parts.all'); }

    /** Every part as one, for the row that paints them all: its materials are theirs, a window's frame left out (a pick here leaves frames be). */
    wholePart(parts, count) {
        const materials = [];
        for (const part of parts) if (part.key !== 'frame') for (const name of part.materials) if (!materials.includes(name)) materials.push(name);
        return { key: '', count, materials, mixed: materials.length > 1, material: materials.length === 1 ? materials[0] : materials.length ? null : '' };
    }

    /** The part whose name is pressed, which the Finish card edits; null is every part. A frame has no finish of its own. */
    partInHand(parts) {
        const part = parts.length > 1 ? parts.find(entry => entry.key === this._partInHand && entry.key !== 'frame') || null : null;
        if (!part) this._partInHand = '';
        return part;
    }

    /**
     * Called as the rows are drawn again: another selection starts from every part, and the same one keeps
     * its place (how far the panel was scrolled, which row's control had the keyboard), which bindParts puts back.
     */
    keepPartsView(parts) {
        const manager = this.manager(), panel = this.panel;
        const same = !!manager && this._partsFor === manager.selectedIds && !!panel.querySelector('.rr-build-part-tile');
        if (!same) this._partInHand = '';
        const active = same && typeof document !== 'undefined' ? document.activeElement : null;
        const held = active && panel.contains(active) && active.closest ? active : null;
        this._partsKeep = same ? {
            scroll: panel.querySelector('.rr-build-panel-body')?.scrollTop || 0,
            focus: held && held.classList.contains('rr-build-part-name') ? `.rr-build-part-name[data-part="${held.dataset.part}"]`
                : held && held.classList.contains('rr-build-finish') ? `.rr-build-finish[data-finish="${held.dataset.finish}"]` : ''
        } : null;
        this._partsFor = manager ? manager.selectedIds : null;
        this._partsShown = parts;
    }

    /** The rows of the Materials card: each part's name (pressed when it is the one in hand), how many pieces, its material; the last row is all of them. */
    partRows(parts, whole, hand, urlOf) {
        const escape = text => String(text ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
        const row = (part, name) => {
            const label = `<span class="rr-build-part-label">${escape(name)}</span><span class="rr-build-part-count">${part.count}</span>`;
            const pressed = hand ? hand.key === part.key : part.key === '';
            const title = part.key === 'frame' ? `<span class="rr-build-part-name">${label}</span>`
                : `<button type="button" class="rr-build-part-name" data-part="${part.key}" aria-pressed="${pressed}" title="${escape(this._t('build.parts.pick'))}">${label}</button>`;
            return `<div class="rr-build-part${part.key ? '' : ' rr-build-part-all'}" data-part="${part.key}" role="listitem">${title}${this.partTile(part, name, urlOf)}</div>`;
        };
        return `<div class="rr-build-parts" role="list">${parts.map(part => row(part, this.partName(part.key))).join('')}${row(whole, this._t('build.parts.all'))}</div>`;
    }

    /** A part's material as the tile that swaps it: its picture and name, or "Mixed" over the pictures of all it holds (bindParts lays those in). */
    partTile(part, name, urlOf) {
        const escape = text => String(text ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
        const value = part.mixed ? '' : part.material || '';
        const shown = part.mixed ? this._t('build.parts.mixed') : value || this._t('pieces.plain');
        if (typeof RRMaterialPopup === 'undefined') return '';
        return RRMaterialPopup.tile({ cls: 'rr-build-part-tile' + (part.mixed ? ' is-mixed' : ''), value, url: urlOf(value), blank: shown,
            attrs: `data-part="${part.key}" title="${escape(this._t('pieces.material'))}" aria-label="${escape(name + ': ' + shown)}"` });
    }

    /** The rows' controls: a tile swaps its part's material (one undo step), a name takes its part in hand for Finish, pointing at a row lights its part in the view. */
    bindParts() {
        const panel = this.panel, manager = this.manager();
        if (!panel || !manager || !panel.querySelector('.rr-build-part-tile')) return;
        const parts = this._partsShown || [];
        const partOf = key => parts.find(part => part.key === key) || null;
        const urlOf = name => (manager.materials().find(entry => entry.name === name) || {}).url || '';
        // A mixed part shows what it holds: up to four of its materials as quarters of the tile's face.
        panel.querySelectorAll('.rr-build-part-tile.is-mixed').forEach(el => {
            const face = el.querySelector('.rr-material-tile-face'), part = partOf(el.dataset.part) || this.wholePart(parts, 0);
            const names = part.materials.slice(0, 4);
            if (!face || names.length < 2) return;
            const picture = name => { const url = urlOf(name); return url ? `url("${String(url).replace(/["\\]/g, '\\$&')}")` : 'linear-gradient(var(--color-bg-deep), var(--color-bg-deep))'; };
            const quarters = names.length === 2 ? [names[0], names[1], names[1], names[0]] : [names[0], names[1], names[2], names[3] || names[0]];
            face.classList.remove('is-plain');
            face.style.backgroundImage = quarters.map(picture).join(', ');
            face.style.backgroundPosition = '0 0, 100% 0, 0 100%, 100% 100%';
            face.style.backgroundSize = '50% 50%';
            face.style.backgroundRepeat = 'no-repeat';
        });
        panel.querySelectorAll('.rr-build-part-tile').forEach(el => el.addEventListener('click', () => {
            const key = el.dataset.part, part = partOf(key);
            // While its materials are open the part stays lit, wherever the pointer goes.
            this._partPin = el;
            this.showPart(part, el);
            RRMaterialPopup.open(el, {
                materials: manager.materials(), current: el.classList.contains('is-mixed') ? null : el.dataset.value,
                // A window frame with no material named wears the default wood: it has no plain.
                blank: key === 'frame' ? null : this._t('pieces.plain'),
                onHover: name => { if (name === null && this._partPin === el) { this._partPin = null; this.showPart(null); } },
                onPick: name => {
                    if (key) manager.paintSelectionPart(key, name); else manager.updateSelection({ material: name });
                    this.refreshParts();
                }
            });
        }));
        panel.querySelectorAll('button.rr-build-part-name').forEach(el => el.addEventListener('click', () => {
            this._partInHand = el.dataset.part;
            this._finishCustom = false;
            this.renderPanel();
        }));
        panel.querySelectorAll('.rr-build-part').forEach(row => {
            const part = partOf(row.dataset.part);
            const leave = () => { if (!this._partPin) this.showPart(null); };
            row.addEventListener('pointerenter', () => { if (!this._partPin) this.showPart(part, row); });
            row.addEventListener('pointerleave', leave);
            row.addEventListener('focusin', () => { if (!this._partPin) this.showPart(part, row); });
            row.addEventListener('focusout', event => { if (!row.contains(event.relatedTarget)) leave(); });
        });
        // Drawn again for the same selection: back where the panel was scrolled, the keyboard on the control it was on.
        const keep = this._partsKeep;
        this._partsKeep = null;
        if (keep) {
            const body = panel.querySelector('.rr-build-panel-body');
            if (body && keep.scroll) body.scrollTop = keep.scroll;
            if (keep.focus) panel.querySelector(keep.focus)?.focus({ preventScroll: true });
        }
        // An undo, a redo or any other edit of the pieces while the rows are up: they show the pieces as they are now.
        if (!this._onPartsEdited && typeof document !== 'undefined') {
            this._onPartsEdited = event => { if (event?.detail?.pieces) this.refreshParts(); };
            document.addEventListener('rr-map-edited', this._onPartsEdited);
        }
    }

    /** The rows drawn again when the pieces they show have changed; left alone while a field of the panel is being typed in or dragged. */
    refreshParts() {
        const panel = this.panel, manager = this.manager();
        if (!panel || !manager || !this.visible || !panel.querySelector('.rr-build-part-tile')) return false;
        const active = typeof document !== 'undefined' ? document.activeElement : null;
        if (active && active.tagName === 'INPUT' && panel.contains(active)) return false;
        if (manager.mode !== 'select' || manager.selectionIds().length < 2 || this._partsShown === manager.selectionParts()) return false;
        this.renderPanel();
        return true;
    }

    /**
     * A part of the selection lit in the 3D view while its row is pointed at: its pieces keep the
     * selection's outline at full strength and the rest of the selection dims. `part` null (or the row
     * for all of them) puts the outline back. The part's boxes are the selection outline's own, so it
     * is drawn on the next frame and costs nothing between; the selection itself never changes.
     * `from` is the row or tile pointing: when it leaves the page the light goes with it.
     */
    showPart(part, from) {
        const view = (typeof window !== 'undefined' && window.reactor?.mapEditor3D) || null;
        const outline = view ? view.selectionOutline : null;
        const lit = this._partLit || (this._partLit = { line: null, dimmed: null, from: null, watch: null });
        const source = part && outline && outline.visible && typeof THREE !== 'undefined' ? outline.geometry.getAttribute('position') : null;
        // The outline holds twelve edges a selected piece, in the selection's order: anything else is not this selection's.
        const count = source ? source.count / 24 : 0;
        if (!source || !part.at.length || count !== this.manager()?.selectionIds().length || part.at.some(index => index >= count)) {
            if (lit.line) lit.line.visible = false;
            if (lit.dimmed !== null && outline) outline.material.opacity = lit.dimmed;
            lit.dimmed = null; lit.from = null;
            if (lit.watch) lit.watch.disconnect();
            view?.requestRender?.();
            return false;
        }
        const positions = new Float32Array(part.at.length * 72);
        part.at.forEach((index, i) => positions.set(source.array.subarray(index * 72, index * 72 + 72), i * 72));
        if (!lit.line) {
            lit.line = new THREE.LineSegments(new THREE.BufferGeometry(), outline.material.clone());
            lit.line.renderOrder = outline.renderOrder + 1;
            lit.line.userData.__reactorOverlay = true;
        }
        // A child of the selection's outline: hidden whenever that is, with nothing to remember.
        if (lit.line.parent !== outline) outline.add(lit.line);
        lit.line.geometry.dispose();
        lit.line.geometry = new THREE.BufferGeometry();
        lit.line.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        lit.line.geometry.computeBoundingSphere();
        lit.line.material.opacity = 1;
        lit.line.visible = true;
        if (lit.dimmed === null) { lit.dimmed = outline.material.opacity; outline.material.opacity = BuildHotbar.PART_DIM; }
        // The row can go without the pointer leaving it (the panel drawn again, the bar put away): the light goes then too.
        lit.from = from || null;
        if (lit.from && this.panel && typeof MutationObserver !== 'undefined') {
            if (!lit.watch) lit.watch = new MutationObserver(() => { const row = this._partLit.from; if (row && (!row.isConnected || row.offsetParent === null)) { this._partPin = null; this.showPart(null); } });
            lit.watch.observe(this.panel, { childList: true, attributes: true, attributeFilter: ['style', 'class'] });
        }
        view.requestRender?.();
        return true;
    }

    /** How strong the rest of the selection's outline stays while one part is lit. */
    static PART_DIM = 0.16;

    /** The panel's frame: its head (with the collapse toggle), the body and the foot; collapsed, the head alone. */
    setPanel(icon, head, body, foot) {
        const collapsed = this.collapsed();
        this.panel.innerHTML = `<div class="rr-build-panel-head">${this.icon(icon, 20)}<span class="rr-build-panel-title">${head}</span>`
            + `<button type="button" class="rr-build-collapse" aria-expanded="${!collapsed}" title="${this._tt('Collapse')}" aria-label="${this._tt('Collapse')}"><svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="${collapsed ? 'M6 9l6 6 6-6' : 'M6 15l6-6 6 6'}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></button></div>`
            + `<div class="rr-build-panel-body">${body}</div>` + (foot ? `<div class="lit-section-footer rr-build-panel-foot">${foot}</div>` : '');
        this.panel.classList.toggle('is-collapsed', collapsed);
        this.bindChrome();
        this.layout();
    }

    /** What every panel shares: the collapse toggle, Advanced remembered open or shut, and tab strips that switch panes in place. */
    bindChrome() {
        const panel = this.panel;
        if (!panel) return;
        panel.querySelector('.rr-build-collapse')?.addEventListener('click', () => {
            this.setStored('rr-build-panel-collapsed', !this.collapsed());
            this.panel.classList.toggle('is-collapsed', this.collapsed());
            this._modelsBody = null;
            this.renderPanel();
        });
        panel.querySelectorAll('details.rr-build-more').forEach(el => el.addEventListener('toggle', () => {
            const open = Object.assign({}, this.stored('rr-build-more') || {});
            open[el.dataset.more] = el.open;
            this.setStored('rr-build-more', open);
        }));
        panel.querySelectorAll('[data-pane-tabs]').forEach(strip => strip.querySelectorAll('[data-pane]').forEach(button => button.addEventListener('click', () => {
            const key = strip.dataset.paneTabs, id = button.dataset.pane;
            this._paneTab = Object.assign({}, this._paneTab, { [key]: id });
            strip.querySelectorAll('[data-pane]').forEach(b => { const on = b === button; b.classList.toggle('primary', on); b.setAttribute('aria-selected', String(on)); });
            panel.querySelectorAll(`[data-pane-of="${key}"]`).forEach(pane => { pane.hidden = pane.dataset.paneId !== id; });
        })));
    }

    /** The pane a tab strip shows: the last one picked this session, else its first. */
    paneTab(key, ids) { const id = this._paneTab && this._paneTab[key]; return ids.includes(id) ? id : ids[0]; }

    /** A tab strip and its panes, every pane in the page (hidden but the one shown). */
    paneTabs(key, panes) {
        const shown = this.paneTab(key, panes.map(p => p[0]));
        return `<div class="rr-build-tabs" role="tablist" data-pane-tabs="${key}">${panes.map(([id, label]) => `<button type="button" role="tab" class="map-props-btn${id === shown ? ' primary' : ''}" aria-selected="${id === shown}" data-pane="${id}">${label}</button>`).join('')}</div>`
            + panes.map(([id, , body]) => `<div class="lit-section-body rr-build-pane" data-pane-of="${key}" data-pane-id="${id}"${id === shown ? '' : ' hidden'}>${body}</div>`).join('');
    }

    collapsed() { return this.stored('rr-build-panel-collapsed') === true; }
    moreOpen(key) { const open = this.stored('rr-build-more'); return !!(open && open[key]); }
    /** The editor's own preferences in local storage; nothing kept when storage is out of reach. */
    stored(key) { try { const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null; return raw ? JSON.parse(raw) : null; } catch (error) { return null; } }
    setStored(key, value) { try { if (typeof localStorage !== 'undefined') localStorage.setItem(key, JSON.stringify(value)); } catch (error) { /* kept for this session only */ } }

    /**
     * Fit the bar and the panel to the view: the bar across the bottom (compact slots that wrap
     * on a narrow view), the panel at the right above it and never over it, narrower on a narrow view.
     */
    layout() {
        const root = this.root, panel = this.panel, container = root && root.parentElement;
        if (!root || !panel || !container) return;
        const width = container.clientWidth || 0;
        if (!width) return;
        const compact = width < 1300, narrow = width < 760, short = (container.clientHeight || 0) < 560;
        root.classList.toggle('is-compact', compact);
        root.classList.toggle('is-narrow', narrow);
        root.classList.toggle('is-short', short);
        panel.classList.toggle('is-compact', compact);
        panel.classList.toggle('is-narrow', narrow);
        panel.style.width = (width >= 1100 ? 300 : width >= 760 ? 268 : Math.max(200, Math.min(248, width - 40))) + 'px';
        // As tall as what it holds, never past the bar: a short panel leaves the view free under it.
        const bar = root.style.display === 'none' ? 0 : root.getBoundingClientRect().height;
        panel.style.bottom = 'auto';
        panel.style.maxHeight = Math.max(120, Math.round((container.clientHeight || 0) - 12 - bar - 24)) + 'px';
    }

    // ---- Doors and window frames ------------------------------------------

    /** The settings a door in hand or selected shows. */
    doorOf(piece) {
        const manager = this.manager();
        return piece || Object.assign({}, manager.door, { material: manager.material });
    }

    /** A door's card: how it looks, how it opens and its sounds, on tabs. */
    doorSections(piece, section) {
        const tt = text => this._tt(text), d = this.doorOf(piece);
        const escape = text => String(text ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
        const select = (key, options, value) => `<select class="database-field-value rr-build-door" data-key="${key}">${options.map(([v, label]) => `<option value="${v}"${v === value ? ' selected' : ''}>${escape(tt(label))}</option>`).join('')}</select>`;
        const row = (label, control) => `<label class="rr-build-field rr-build-setting"><span>${escape(label)}</span>${control}</label>`;
        let look = row(tt('Style'), select('style', BuildHotbar.DOOR_STYLES, d.style || 'plank'));
        if (piece) look += row(tt('Width'), `<input type="number" class="database-field-value rr-build-door" data-key="width" value="${d.width || 1}" min="1" max="6" step="1">`);
        look += row(tt('Hinge'), select('hinge', [['left', 'Left'], ['right', 'Right']], d.hinge || 'left'))
            + row(tt('Opens'), select('swing', [['away', 'Away from the opener'], ['in', 'Inward'], ['out', 'Outward']], d.swing || 'away'));
        let opening = row(tt('Opening'), select('opens', BuildHotbar.DOOR_OPENS, d.opens || 'auto'));
        if ((d.opens || 'auto') === 'locked') {
            const by = d.lock && d.lock.switch ? 'switch' : d.lock && d.lock.item ? 'item' : '';
            opening += row(tt('Unlocked by'), select('lockBy', [['', 'Script'], ['switch', 'Switch'], ['item', 'Item']], by));
            if (by) opening += row(tt(by === 'switch' ? 'Switch' : 'Item'), `<input type="number" class="database-field-value rr-build-door" data-key="lockId" value="${d.lock[by]}" min="1" max="9999" step="1">`);
            opening += row(tt('Message'), `<input type="text" class="database-field-value rr-build-door" data-key="message" value="${escape(d.message ?? '')}" placeholder="${escape(typeof Reactor3D !== 'undefined' && Reactor3D.DOOR_LOCKED_TEXT || "It's locked.")}">`);
        }
        opening += row(tt('Tag'), `<input type="text" class="database-field-value rr-build-door" data-key="tag" value="${escape(d.tag || '')}">`);
        // Each sound: its file (the door's own, else the style's), a preview, and back to the default.
        const R = typeof Reactor3D !== 'undefined' ? Reactor3D : null;
        const sounds = [['open', 'Open'], ['close', 'Close'], ['locked', 'Locked']].map(([key, label]) => {
            const own = d.sound && d.sound[key];
            const shown = R && R.doorSound ? R.doorSound(d, key) : own;
            const name = shown ? shown.name : '';
            return `<div class="rr-build-field rr-build-sound"><span>${escape(tt(label))}</span><div class="rr-build-sound-row">`
                + `<button type="button" class="rr-btn-secondary rr-build-door-sound" data-sound="${key}" title="${escape(name)}">${escape(name || tt('None'))}${own ? '' : ' · ' + escape(tt('Default'))}</button>`
                + `<button type="button" class="rr-btn-secondary rr-build-door-play" data-sound="${key}" title="${escape(tt('Preview'))}"${name ? '' : ' disabled'}>▶</button>`
                + `<button type="button" class="rr-btn-secondary rr-build-door-reset" data-sound="${key}" title="${escape(tt('Default'))}"${own ? '' : ' disabled'}>↺</button></div></div>`;
        }).join('');
        return `<div class="lit-section rr-build-section">`
            + this.paneTabs('door', [['look', tt('Door'), look], ['opening', tt('Opening'), opening], ['sounds', tt('Sounds'), sounds]]) + '</div>';
    }

    /** A window's frame card: its style, shutters and flower box. */
    windowSections(piece, section) {
        const manager = this.manager(), tt = text => this._tt(text);
        const frame = piece ? (piece.frame || null) : manager.windowFrame;
        const style = frame ? frame.style || 'cottage' : '';
        const row = (label, control) => `<label class="rr-build-field rr-build-setting"><span>${tt(label)}</span>${control}</label>`;
        let body = row('Style', `<select class="database-field-value rr-build-frame" data-key="style">${BuildHotbar.WINDOW_FRAMES.map(([v, label]) => `<option value="${v}"${v === style ? ' selected' : ''}>${tt(label)}</option>`).join('')}</select>`);
        if (frame) {
            const shutters = frame.shutters || '';
            body += `<label class="rr-build-check"><input type="checkbox" class="rr-build-frame" data-key="shutters"${shutters ? ' checked' : ''}> ${tt('Shutters')}</label>`;
            if (shutters) body += `<div class="rr-build-rocktint-row"><input type="color" class="rr-build-frame" data-key="shutterColour" value="${shutters}"><label class="rr-build-check"><input type="checkbox" class="rr-build-frame" data-key="closed"${frame.closed ? ' checked' : ''}> ${tt('Closed')}</label></div>`;
            body += `<label class="rr-build-check"><input type="checkbox" class="rr-build-frame" data-key="flowerBox"${frame.flowerBox ? ' checked' : ''}> ${tt('Flower box')}</label>`;
        }
        return section(tt('Window frame'), body);
    }

    /** The door and window cards' controls: a placed piece is edited (one undo step), the one in hand remembered. */
    bindDoorPanel(s, edit) {
        const panel = this.panel, manager = this.manager();
        if (!panel || !manager) return;
        const piece = s.piece || null;
        const door = () => this.doorOf(piece ? manager.selectedPiece() : null);
        const setDoor = patch => edit(patch, () => { for (const [key, value] of Object.entries(patch)) { if (value === undefined) delete manager.door[key]; else manager.door[key] = value; } manager._ghostChanged(); });
        panel.querySelectorAll('.rr-build-door').forEach(el => el.addEventListener('change', () => {
            const key = el.dataset.key, value = el.value, d = door();
            if (key === 'width') { const n = Math.max(1, Math.min(6, Math.floor(Number(value)) || 1)); setDoor({ width: n }); return; }
            if (key === 'lockBy') { setDoor({ lock: value ? { [value]: 1 } : undefined }); return; }
            if (key === 'lockId') { const by = d.lock && d.lock.switch ? 'switch' : 'item'; setDoor({ lock: { [by]: Math.max(1, Math.floor(Number(value)) || 1) } }); return; }
            if (key === 'message' || key === 'tag') { setDoor({ [key]: value.trim() ? value : undefined }); return; }
            setDoor({ [key]: value });
        }));
        const soundOf = key => { const d = door(); return Object.assign({}, d.sound || {}); };
        panel.querySelectorAll('.rr-build-door-reset').forEach(el => el.addEventListener('click', () => {
            const sound = soundOf(); delete sound[el.dataset.sound];
            setDoor({ sound: Object.keys(sound).length ? sound : undefined });
        }));
        panel.querySelectorAll('.rr-build-door-sound').forEach(el => el.addEventListener('click', () => {
            const key = el.dataset.sound, files = this.seFiles();
            if (!files || typeof RRAudioPickerModal === 'undefined') return;
            const R = typeof Reactor3D !== 'undefined' ? Reactor3D : null;
            const current = R && R.doorSound ? R.doorSound(door(), key) : null;
            RRAudioPickerModal.open({
                title: this._tt('Sounds'), folderLabel: 'SE', files, selected: current ? current.name : '',
                levels: { volume: current ? current.volume ?? 80 : 80, pitch: current ? current.pitch ?? 100 : 100, pan: 0 }, loopDefault: false, zIndex: 21000,
                onOk: result => {
                    const sound = soundOf();
                    sound[key] = { name: result && result.name ? result.name : '', volume: result ? result.volume : 80, pitch: result ? result.pitch : 100 };
                    setDoor({ sound });
                }
            });
        }));
        panel.querySelectorAll('.rr-build-door-play').forEach(el => el.addEventListener('click', () => {
            const R = typeof Reactor3D !== 'undefined' ? Reactor3D : null;
            const sound = R && R.doorSound ? R.doorSound(door(), el.dataset.sound) : null;
            if (sound) this.previewSe(sound);
        }));
        const frameNow = () => { const p = piece ? manager.selectedPiece() : null; return p ? (p.frame ? Object.assign({}, p.frame) : null) : (manager.windowFrame ? Object.assign({}, manager.windowFrame) : null); };
        // A placed window's frame is its whole run's (the windows framed as one with it), one undo step.
        const setFrame = frame => {
            const placed = piece ? manager.selectedPiece() : null;
            const run = placed && manager.windowRun ? manager.windowRun(placed) : [];
            if (run.length > 1) {
                const keep = manager.selected;
                manager.selectedIds = run.map(p => p.id);
                manager.updateSelection({ frame: frame || undefined });
                manager.selectedIds = []; manager.selected = keep; manager._syncPanel();
                this.renderPanel();
                return;
            }
            edit({ frame: frame || undefined }, () => { manager.windowFrame = frame; manager._ghostChanged(); });
        };
        panel.querySelectorAll('.rr-build-frame').forEach(el => el.addEventListener('change', () => {
            const key = el.dataset.key, frame = frameNow() || { style: 'cottage' };
            if (key === 'style') { setFrame(el.value ? Object.assign(frame, { style: el.value }) : null); return; }
            if (key === 'shutters') { if (el.checked) frame.shutters = (typeof Reactor3D !== 'undefined' && Reactor3D.SHUTTER_COLOUR) || '#3f5f3a'; else { delete frame.shutters; delete frame.closed; } setFrame(frame); return; }
            if (key === 'shutterColour') { frame.shutters = el.value; setFrame(frame); return; }
            if (key === 'closed' || key === 'flowerBox') { if (el.checked) frame[key] = true; else delete frame[key]; setFrame(frame); }
        }));
    }

    /** The project's sound effects, for a door's sounds; null without a project. */
    seFiles() {
        const manager = this.manager(), root = manager && manager.projectPath ? manager.projectPath() : null;
        if (!root || typeof RRAssetFiles === 'undefined') return null;
        try { return RRAssetFiles.listUnique(require('path').join(root, 'audio', 'se'), RRAssetFiles.AUDIO_EXTENSIONS); } catch (error) { return null; }
    }

    /** Play a sound effect of the project once, at its volume and pitch. */
    previewSe(sound) {
        const files = this.seFiles() || [];
        const file = files.find(entry => entry.name === sound.name);
        if (!file || !file.absolutePath) return;
        try {
            if (this._preview) this._preview.pause();
            const audio = this._preview = new Audio(require('url').pathToFileURL(file.absolutePath).href);
            audio.volume = Math.max(0, Math.min(1, (sound.volume ?? 80) / 100));
            audio.playbackRate = Math.max(0.5, Math.min(1.5, (sound.pitch ?? 100) / 100));
            audio.preservesPitch = false;
            audio.play().catch(() => {});
        } catch (error) { /* no preview without a file */ }
    }

    bindPanel(s) {
        const panel = this.panel, manager = this.manager();
        const placed = !!s.piece || s.kind === 'many';
        // Many selected: the Finish card edits the part in hand, every selected piece when none is.
        const hand = s.kind === 'many' ? this.partInHand(this._partsShown || []) : null;
        const editMany = (patch, record) => (hand ? manager.updateSelectionPart(hand.ids, patch, record) : manager.updateSelection(patch, record));
        const edit = (patch, pending) => { if (s.kind === 'many') editMany(patch); else if (placed) manager.updateSelected(patch); else pending(); this.renderPanel(); };
        panel.querySelectorAll('.rr-build-shape').forEach(el => el.addEventListener('click', () => {
            const kind = el.dataset.shape;
            if (s.piece) {
                // Changing a placed shape keeps its place and size but takes the new shape's own settings.
                const own = (typeof DatabaseStructureEditor !== 'undefined' && DatabaseStructureEditor.SHAPE_PARAMS[kind]) || {};
                const patch = Object.assign({ kind }, own);
                manager.updateSelected(patch);
            } else { manager.lastShape = kind; manager.setKind(kind); }
            this.render();
        }));
        panel.querySelectorAll('.rr-build-rockcap').forEach(el => el.addEventListener('click', () => {
            const cap = el.dataset.cap || '';
            edit({ cap }, () => { manager.rockCap = cap; manager._ghostChanged(); });
        }));
        const setTint = value => { const tint = String(value).toLowerCase() === '#ffffff' ? '' : value; edit({ tint }, () => { manager.rockTint = tint; manager._ghostChanged(); }); };
        panel.querySelector('.rr-build-rocktint')?.addEventListener('change', event => setTint(event.target.value));
        panel.querySelector('.rr-build-rocktint-reset')?.addEventListener('click', () => setTint('#ffffff'));
        panel.querySelector('.rr-build-rockvary')?.addEventListener('change', event => { manager.rockVary = event.target.checked; manager._ghostChanged(); });
        panel.querySelectorAll('.rr-build-rockpreset').forEach(el => el.addEventListener('click', () => {
            const size = BuildHotbar.ROCK_PRESETS[el.dataset.preset];
            if (!size) return;
            if (s.piece) manager.updateSelected({ size: size.slice() }); else manager.setSize('rock', size);
            this.renderPanel();
        }));
        panel.querySelectorAll('.rr-build-tab').forEach(el => el.addEventListener('click', () => { this._shapeTab = el.dataset.tab; this.renderPanel(); }));
        panel.querySelector('.rr-build-save-structure')?.addEventListener('click', () => this.openSaveStructureDialog());
        panel.querySelector('.rr-build-select-whole')?.addEventListener('click', () => { manager.selectConnectedAt(null); this.renderPanel(); });
        panel.querySelector('.rr-build-relay')?.addEventListener('click', () => { manager.relayFromPlan(); this.renderPanel(); });
        this.bindDoorPanel(s, edit);
        if (s.kind === 'many') this.bindParts();
        panel.querySelector('.rr-build-turn-all')?.addEventListener('click', () => { manager.turnSelection(); this.renderPanel(); });
        // A preset chip sets the surface to the preset's (the sliders then start from it).
        const presets = (typeof Reactor3D !== 'undefined' && Reactor3D.PIECE_FINISHES) || {};
        panel.querySelectorAll('.rr-build-finish').forEach(el => el.addEventListener('click', () => {
            const f = el.dataset.finish, surface = f && presets[f] ? Object.assign({}, presets[f]) : null;
            this._finishCustom = false;
            edit({ finish: f, surface }, () => { manager.finish = f; manager.surface = surface; });
        }));
        panel.querySelector('.rr-build-finish-custom')?.addEventListener('click', event => {
            const rows = panel.querySelector('.rr-build-surface-rows');
            if (!rows) return;
            this._finishCustom = rows.hidden;
            rows.hidden = !rows.hidden;
            event.currentTarget.setAttribute('aria-pressed', String(!rows.hidden));
        });
        // The surface's own values: sliders live (one undo step a drag), numbers in percent, the tint by the colour popup.
        const currentSurface = () => {
            // Many selected: they start from the surface of the first of the part in hand (gold stays gold while a slider moves).
            const first = () => { const all = manager.selectionPieces(); return (hand ? all.find(piece => hand.ids.includes(piece.id)) : all[0]) || null; };
            const holder = s.kind === 'many' ? first() : (placed ? manager.selectedPiece() : { finish: manager.finish, surface: manager.surface });
            const base = holder ? (holder.surface || (holder.finish && presets[holder.finish])) : null;
            return Object.assign({ reflect: 0, gloss: 0.8, metal: 0, texture: 0, tint: '#ffffff' }, base || {});
        };
        const setSurface = (patch, record) => {
            const surface = Object.assign(currentSurface(), patch);
            // Kept whatever the reflection: at 0 it shows nothing, and raising it again brings the rest back.
            const plain = !surface.reflect && !surface.metal && !surface.texture && Math.abs(surface.gloss - 0.8) < 1e-6 && String(surface.tint).toLowerCase() === '#ffffff';
            const value = { finish: '', surface: plain ? null : surface };
            if (patch.reflect !== undefined) panel.querySelectorAll('.rr-surface-row:not([data-surface="reflect"])').forEach(row => row.classList.toggle('is-dimmed', !(surface.reflect > 0)));
            if (s.kind === 'many') editMany(value, record);
            else if (placed) manager.updateSelected(value, record);
            else { manager.finish = ''; manager.surface = value.surface; }
        };
        panel.querySelectorAll('input.rr-build-surface').forEach(el => el.addEventListener('change', () => {
            const n = Number(el.value); if (!Number.isFinite(n)) { this.renderPanel(); return; }
            setSurface({ [el.dataset.key]: Math.max(0, Math.min(100, n)) / 100 }, true); this.renderPanel();
        }));
        const surfaceTint = panel.querySelector('.rr-build-surface-tint');
        if (surfaceTint && typeof RRColorPopup !== 'undefined') {
            // One undo step each time the popup is opened, however long the colour is dragged about.
            let recorded = false;
            surfaceTint.addEventListener('click', () => { recorded = false; });
            RRColorPopup.bind(surfaceTint, hex => { setSurface({ tint: hex }, !recorded); recorded = true; });
        }
        panel.querySelectorAll('.rr-build-material-tile').forEach(el => el.addEventListener('click', () => RRMaterialPopup.open(el, {
            materials: manager.materials(), current: el.dataset.value, blank: this._t('pieces.plain'),
            onPick: name => edit({ material: name }, () => manager.setMaterial(name))
        })));
        panel.querySelectorAll('.rr-build-rockcap-tile').forEach(el => el.addEventListener('click', () => RRMaterialPopup.open(el, {
            materials: manager.materials(), current: el.dataset.value,
            onPick: cap => edit({ cap }, () => { manager.rockCap = cap; manager._ghostChanged(); })
        })));
        panel.querySelectorAll('.rr-build-rot').forEach(el => el.addEventListener('click', () => { const r = Number(el.dataset.rot); edit(s.shape ? { angle: r * 90 } : { rot: r }, () => { manager.rot = r; manager._syncPanel(); manager._ghostChanged(); }); }));
        panel.querySelectorAll('.rr-build-size').forEach(el => el.addEventListener('change', () => {
            const i = Number(el.dataset.key), v = Number(el.value);
            if (!Number.isFinite(v) || v <= 0) { this.renderPanel(); return; }
            const size = (placed ? s.piece.size : manager.sizeFor(s.kind)).slice(); size[i] = Math.max(0.25, Math.min(60, Math.round(v * 20) / 20));
            edit({ size }, () => manager.setSize(s.kind, size));
        }));
        panel.querySelectorAll('.rr-build-pos').forEach(el => el.addEventListener('change', () => {
            const v = Number(el.value); if (!Number.isFinite(v) || !placed) { this.renderPanel(); return; }
            const cx = s.piece.x + 0.5 + (s.piece.offset ? s.piece.offset[0] || 0 : 0), cy = s.piece.y + 0.5 + (s.piece.offset ? s.piece.offset[1] || 0 : 0);
            if (el.dataset.key === 'z') manager.updateSelected({ z: Math.max(0, Math.round(v * 20) / 20) }); else manager.moveSelectedPieceTo(el.dataset.key === 'x' ? v : cx, el.dataset.key === 'y' ? v : cy);
            this.renderPanel();
        }));
        panel.querySelectorAll('.rr-build-turn').forEach(el => el.addEventListener('change', () => { const v = ((Math.round(Number(el.value)) || 0) % 360 + 360) % 360; if (placed) manager.updateSelected({ [el.dataset.key]: v }); this.renderPanel(); }));
        // Sliders: live while dragged, the number beside them following, one undo step on release.
        panel.querySelectorAll('.rr-build-slider').forEach(el => {
            const number = el.parentElement.querySelector('input[type=number]');
            let snapshot = null;
            el.addEventListener('pointerdown', () => { snapshot = placed || s.kind === 'many' ? manager._snapshot(manager.currentMap()) : null; });
            el.addEventListener('input', () => {
                // An arrow key on a focused slider comes with no press: its undo step is taken here.
                if (!snapshot && (placed || s.kind === 'many')) snapshot = manager._snapshot(manager.currentMap());
                const v = Number(el.value), key = el.dataset.key, kind = el.dataset.for;
                number.value = kind === 'rr-build-surface' ? Math.round(v * 100) : el.value;
                if (kind === 'rr-build-surface') { if (placed || !s.piece) setSurface({ [key]: v }, false); return; }
                if (kind === 'rr-build-size') {
                    const size = (placed ? manager.selectedPiece().size : manager.sizeFor(s.kind)).slice(); size[Number(key)] = v;
                    if (placed) manager.updateSelected({ size }, false); else manager.setSize(s.kind, size);
                } else if (!placed) return;
                else if (kind === 'rr-build-turn') manager.updateSelected({ [key]: v }, false);
                else if (key === 'z') manager.updateSelected({ z: v }, false);
                else {
                    const now = manager.selectedPiece();
                    const cx = now.x + 0.5 + (now.offset ? now.offset[0] || 0 : 0), cy = now.y + 0.5 + (now.offset ? now.offset[1] || 0 : 0);
                    manager.moveSelectedPieceTo(key === 'x' ? v : cx, key === 'y' ? v : cy, undefined, false);
                }
            });
            el.addEventListener('change', () => {
                if (snapshot) { manager.undoStack.push(snapshot); if (manager.undoStack.length > 50) manager.undoStack.shift(); manager.redoStack.length = 0; manager.syncHistoryButtons?.(); }
                snapshot = null;
                el.blur();
                this.renderPanel();
            });
        });
        panel.querySelectorAll('.rr-build-param').forEach(el => el.addEventListener('change', () => {
            const key = el.dataset.key; let v = Number(el.value); if (!Number.isFinite(v)) { this.renderPanel(); return; }
            if (key === 'taper' || key === 'thick' || key === 'rough') v = Math.max(0, Math.min(1, Math.round(v) / 100)); else if (key === 'sides') v = Math.max(3, Math.min(32, Math.round(v))); else v = Math.max(15, Math.min(360, Math.round(v)));
            edit({ [key]: v }, () => { manager.params = manager.params || {}; manager.params[s.kind] = Object.assign({}, manager.params[s.kind], { [key]: v }); manager._ghostChanged(); });
        }));
        panel.querySelector('.rr-build-steps')?.addEventListener('change', event => {
            const steps = Math.max(1, Math.min(BuildHotbar.MAX_RUN, Math.round(Number(event.target.value)) || 1));
            if (s.piece && s.piece.kind === 'stair' && manager.setStairFlight) { const f = manager.stairFlight(s.piece); manager.setStairFlight(s.piece, steps, f ? f.width : 1); }
            else manager.stairSteps = steps;
            this.renderPanel();
        });
        // A ladder's size in tiles, fractions allowed (1.5 wide, 5.5 tall).
        const ladderSize = (key, value) => {
            const size = manager.constructor.clampLadderSize(value, key === 'height' ? BuildHotbar.MAX_RUN : 20);
            if (s.piece) { const f = manager.ladderFlight(s.piece); manager.setLadderSize(s.piece, key === 'height' ? size : (f ? f.height : 1), key === 'width' ? size : (f ? f.width : 1)); }
            else if (key === 'height') manager.ladderHeight = size; else manager.ladderWidth = size;
            manager._ghostChanged?.();
            this.renderPanel();
        };
        panel.querySelector('.rr-build-ladderheight')?.addEventListener('change', event => ladderSize('height', event.target.value));
        panel.querySelector('.rr-build-ladderwidth')?.addEventListener('change', event => ladderSize('width', event.target.value));
        panel.querySelector('.rr-build-stairwidth')?.addEventListener('change', event => {
            const width = Math.max(1, Math.min(20, Math.round(Number(event.target.value)) || 1));
            if (s.piece && s.piece.kind === 'stair' && manager.setStairFlight) { const f = manager.stairFlight(s.piece); manager.setStairFlight(s.piece, f ? f.steps : 1, width); }
            else manager.stairWidth = width;
            this.renderPanel();
        });
        panel.querySelectorAll('.rr-build-mode').forEach(el => el.addEventListener('click', () => { manager.gizmoMode = el.dataset.mode; manager._ghostChanged(); this.renderPanel(); }));
        panel.querySelector('.rr-build-remove')?.addEventListener('click', () => { manager.removeSelection(); this.renderPanel(); });
        panel.querySelector('.rr-build-plan')?.addEventListener('change', event => { manager.structure = event.target.value; manager.setMode('stamp'); });
    }

    /**
     * The Terrain group's panel: a brush's size and strength, how to pour or
     * drain, or a water sheet's look; undo, redo and flattening the whole map
     * as icons along the foot.
     */
    renderTerrainPanel() {
        const panel = this.panel, terrain = this.terrain();
        if (!panel || !terrain) return;
        const slot = this.activeSlot(), t = key => this._t(key);
        const section = (title, body, meta) => `<div class="lit-section rr-build-section"><div class="lit-section-header">${title}${meta ? `<span class="lit-section-meta">${meta}</span>` : ''}</div><div class="lit-section-body">${body}</div></div>`;
        const range = (cls, label, value, min, max, step, shown) => `<label class="rr-build-range"><span>${label}</span><input type="range" class="${cls}" min="${min}" max="${max}" step="${step}" value="${value}" data-no-stepper><b class="${cls}-value">${shown}</b></label>`;
        // What a click does comes first, as on every panel.
        const note = key => `<div class="rr-build-note rr-build-wrap rr-build-lead">${t(key)}</div>`;
        let body = '';
        const tt = text => this._tt(text);
        const escape = text => String(text ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
        const lead = text => `<div class="rr-build-note rr-build-wrap rr-build-lead">${text}</div>`;
        const swatchOf = (cls, value) => typeof RRColorPopup !== 'undefined' ? RRColorPopup.swatch(cls, value) : `<input type="color" class="${cls}" value="${value}">`;
        const chipOf = (cls, data, label, on) => `<button type="button" class="rr-build-chip ${cls}" data-value="${escape(data)}" aria-pressed="${on}"><span>${escape(label)}</span></button>`;
        if (['raise', 'lower', 'smooth', 'flatten'].includes(slot)) {
            body = note('terrain.hint.brush') + section(t('terrain.brush'), range('rr-build-tradius', t('terrain.radius'), terrain.radius, 1, 12, 0.5, terrain.radius)
                + range('rr-build-tstrength', t('terrain.strength'), terrain.strength, 0.05, 1, 0.05, terrain.strength));
        } else if (slot === 'dunes') {
            const d = terrain.dunes, limit = typeof RRMapElevation !== 'undefined' && RRMapElevation.duneSettings ? RRMapElevation.duneSettings(d).height : d.height;
            body = lead(tt('Drag to raise dunes: long ridges across the wind, gentle on one side, steep on the other.'))
                + section(t('terrain.brush'), range('rr-build-tradius', t('terrain.radius'), terrain.radius, 1, 12, 0.5, terrain.radius)
                    + range('rr-build-tstrength', t('terrain.strength'), terrain.strength, 0.05, 1, 0.05, terrain.strength))
                + section(tt('Dunes'), range('rr-build-ddir', tt('Wind direction'), d.dir, 0, 359, 1, Math.round(d.dir) + '°')
                    + range('rr-build-dsize', tt('Ridge spacing'), d.size, 4, 40, 1, d.size)
                    + range('rr-build-dheight', tt('Height'), Math.min(d.height, limit), 0.2, d.walkable ? Math.max(0.2, Math.round(0.55 * 0.3 * d.size * 10) / 10) : 12, 0.1, Math.round(Math.min(d.height, limit) * 10) / 10))
                + `<details class="lit-section rr-build-section rr-build-more" data-more="dunes"${this.moreOpen('dunes') ? ' open' : ''}><summary class="lit-section-header">${tt('Advanced')}</summary><div class="lit-section-body">`
                + `<label class="rr-build-check"><input type="checkbox" class="rr-build-dwalk"${d.walkable ? ' checked' : ''}> ${tt('Keep slopes walkable')}</label>`
                + `<div class="rr-build-actions"><button type="button" class="rr-btn-secondary rr-build-dseed">${tt('Another dune field')}</button></div></div></details>`;
        } else if (slot === 'ground' || slot === 'terase') {
            // Ground paints one of the map's grounds; the Eraser beside it takes the paint away. What is painted with
            // comes first, then the brush; what changes a ground everywhere it lies, and what changes the whole map,
            // are folded away under their own names.
            const erasing = slot === 'terase';
            const types = terrain.groundTypes(), inHand = terrain.groundTypeInHand(), manager = this.manager();
            const urlOf = name => ((manager?.materials?.() || []).find(entry => entry.name === name) || {}).url || '';
            const tile = inHand && typeof RRMaterialPopup !== 'undefined'
                ? RRMaterialPopup.tile({ cls: 'rr-build-gmaterial', value: inHand.material, url: urlOf(inHand.material), blank: tt('None') }) : '';
            const list = types.map((type, i) => `<button type="button" class="rr-build-chip rr-build-gtype" data-index="${i}" aria-pressed="${i === terrain.groundType && !terrain.groundErase}"><i class="rr-build-gdot" style="background:${escape(type.tint || '#ffffff')}"></i><span>${escape(type.name || type.material)}</span></button>`).join('');
            const presets = TerrainManager.GROUND_PRESETS.map((preset, i) => `<button type="button" class="rr-build-chip rr-build-gpreset" data-index="${i}"><i class="rr-build-gdot" style="background:${escape(preset.tint)}"></i><span>${escape(tt(preset.name))}</span></button>`).join('');
            // A map with no floor has nothing for a ground to lie over: say so, and offer one.
            const floors = terrain.hasGroundFloor() || !this.is3D() ? [] : this.groundFloors();
            const noFloor = terrain.hasGroundFloor() ? '' : `<div class="rr-build-note rr-build-wrap rr-build-gnofloor">${tt('This map has no floor to paint over.')}</div>`
                + (floors.length ? `<div class="rr-build-actions"><button type="button" class="rr-btn-secondary rr-build-gsetfloor" data-floor="${escape(floors[0])}">${tt('Set a floor')}</button></div>` : `<div class="rr-build-note rr-build-wrap">${tt('Choose one in Room and Sky.')}</div>`);
            const fold = (key, title, meta, inner) => `<details class="lit-section rr-build-section rr-build-more" data-more="${key}"${this.moreOpen(key) ? ' open' : ''}><summary class="lit-section-header">${title}${meta ? `<span class="lit-section-meta">${meta}</span>` : ''}</summary><div class="lit-section-body">${inner}</div></details>`;
            const brushRows = range('rr-build-tradius', t('terrain.radius'), terrain.radius, 1, 12, 0.5, terrain.radius)
                + range('rr-build-tstrength', t('terrain.strength'), terrain.strength, 0.05, 1, 0.05, terrain.strength)
                + range('rr-build-gsoft', tt('Soft edge'), terrain.groundSoft, 0, 1, 0.05, Math.round(terrain.groundSoft * 100) + '%')
                + (erasing ? '' : range('rr-build-glevel', tt('Coverage'), terrain.groundLevel, 1, 9, 1, terrain.groundLevel));
            // The ground in hand, changed everywhere it lies: shut until it is asked for, and it says so.
            const edit = inHand && !erasing ? fold('ground-edit', tt('Edit this ground'), escape(inHand.name || inHand.material),
                `<div class="rr-build-note rr-build-wrap rr-build-gedit-note">${tt('Changes every place this ground is painted.')}</div>` + tile
                + `<div class="rr-build-range"><span>${tt('Tint')}</span>${swatchOf('rr-build-gtint', inHand.tint || '#ffffff')}</div>`
                + range('rr-build-gscale', tt('Scale'), inHand.scale || 4, 0.5, 16, 0.5, inHand.scale || 4)
                + `<label class="rr-build-check"><input type="checkbox" class="rr-build-gbare"${inHand.bare ? ' checked' : ''}> ${tt('Nothing grows here')}</label>`
                + `<label class="rr-build-field"><span>${tt('Name')}</span><input type="text" class="database-field-value rr-build-gname" value="${escape(inHand.name || inHand.material)}" maxlength="40"></label>`
                + `<div class="rr-build-actions"><button type="button" class="rr-btn-secondary rr-build-gremove">${tt('Remove this ground')}</button></div>`) : '';
            const whole = fold('ground-map', tt('Whole map'), '',
                `<div class="rr-build-actions"><button type="button" class="rr-btn-secondary rr-build-gfill">${erasing ? tt('Clear the whole map') : tt('Fill the whole map')}</button></div>`
                + (erasing ? '' : this.steepSection(terrain, section, urlOf)));
            body = lead(erasing ? tt('Erase painted ground under the brush: back to the map\'s own ground.') : tt('Paint a ground over the floor: sand, dirt, snow, or one of your own. Erase goes back to the map\'s own ground.')) + noFloor
                + `<div class="rr-build-finishes rr-build-pair">${chipOf('rr-build-gshape', 'brush', t('terrain.brush'), terrain.groundShape !== 'rect')}${chipOf('rr-build-gshape', 'rect', tt('Rectangle'), terrain.groundShape === 'rect')}</div>`
                + (erasing ? '' : section(tt('Paint with'), (types.length ? `<div class="rr-build-finishes rr-build-gtypes">${list}</div>` : `<div class="rr-build-note rr-build-wrap">${tt('This map has no ground types yet. Pick one to start.')}</div>`)
                    + `<details class="rr-build-gadd"${types.length ? '' : ' open'}><summary class="rr-btn-secondary rr-build-gaddbtn">+ ${tt('Add a ground')}</summary><div class="rr-build-finishes rr-build-pair">${presets}</div></details>`,
                    inHand ? escape(inHand.name || inHand.material) : ''))
                + section(t('terrain.brush'), brushRows)
                + edit + whole;
        } else if (slot === 'biome') {
            const names = { temperate: 'Temperate', desert: 'Desert', snow: 'Snow', volcanic: 'Volcanic', alienViolet: 'Alien violet', alienFungal: 'Alien fungal' };
            body = lead(tt('A starting look for the whole map: its ground, cliffs, plant colors and water together. Heights stay as they are.'))
                + section(tt('Biome'), `<div class="rr-build-finishes">${Object.keys(TerrainManager.BIOMES).map(key => chipOf('rr-build-biome', key, tt(names[key]), terrain.biome === key)).join('')}</div>`
                    + `<label class="rr-build-check"><input type="checkbox" class="rr-build-breplace"${terrain.biomeReplace ? ' checked' : ''}> ${tt('Also clear the ground already painted')}</label>`);
        } else if (slot === 'sky') {
            body = this.roomBody(terrain, section, range);
        } else if (slot === 'surround') {
            body = this.surroundBody(terrain, section);
        } else if (slot === 'pour') {
            body = note('terrain.hint.pour');
        } else if (slot === 'river') {
            const count = terrain._river ? terrain._river.points.length : 0;
            body = note('terrain.hint.river') + section(t('terrain.river'), range('rr-build-rwidth', t('terrain.riverWidth'), terrain.riverWidth, 1, 8, 0.5, terrain.riverWidth)
                + range('rr-build-rdepth', t('terrain.riverDepth'), terrain.riverDepth, 0.3, 4, 0.1, terrain.riverDepth))
                + (count ? `<div class="rr-build-note rr-build-wrap">${this._t('terrain.riverPoints', { count })}</div>`
                    + `<div class="rr-build-actions"><button type="button" class="rr-btn-secondary rr-build-rfinish"${count < 2 ? ' disabled' : ''}>${t('terrain.riverLay')}</button><button type="button" class="rr-btn-secondary rr-build-rcancel">${t('terrain.riverCancel')}</button></div>` : '');
        } else if (slot === 'drain') {
            body = note('terrain.hint.drain');
        } else {
            const look = terrain.waterLook;
            const keys = ['reflect', 'gloss', 'tint', 'colour', 'clear', 'waves', 'glow'];
            // Without a reflection the gloss and tint are not kept (lava read back is still lava).
            const plain = preset => !(Number(preset.reflect) > 0) && !(Number(look.reflect) > 0);
            const same = preset => keys.every(key => (preset[key] ?? '') === (look[key] ?? '') || ((key === 'gloss' || key === 'tint') && plain(preset)));
            const swatch = (cls, value) => typeof RRColorPopup !== 'undefined' ? RRColorPopup.swatch(cls, value) : `<input type="color" class="${cls}" value="${value}">`;
            // The liquid (what it is) in view; its colour, clearness, waves, glow and reflection on tabs.
            const preset = Object.keys(TerrainManager.WATER_LOOKS).find(p => same(TerrainManager.WATER_LOOKS[p]));
            body = section(t('terrain.liquid'), `<div class="rr-build-finishes">${Object.keys(TerrainManager.WATER_LOOKS).map(p => `<button type="button" class="rr-build-chip rr-build-look" data-preset="${p}" aria-pressed="${same(TerrainManager.WATER_LOOKS[p])}"><span>${t('terrain.look.' + p)}</span></button>`).join('')}</div>`, preset ? t('terrain.look.' + preset) : '')
                + `<div class="lit-section rr-build-section">` + this.paneTabs('waterlook', [
                    // No colour of its own is water's depth blue, shown as such.
                    ['liquid', t('terrain.look.colour'), `<div class="rr-build-range"><span>${t('terrain.look.colour')}</span>${swatch('rr-build-tcolour', look.colour || '#2a5f96')}</div>`
                        + range('rr-build-tclarity', t('terrain.look.clear'), look.clear ?? 0.6, 0, 1, 0.01, Math.round((look.clear ?? 0.6) * 100) + '%')
                        + range('rr-build-twaves', t('terrain.look.waves'), look.waves ?? 1, 0, 2, 0.01, Math.round((look.waves ?? 1) * 100) + '%')
                        + range('rr-build-tglow', t('terrain.look.glow'), look.glow ?? 0, 0, 1, 0.01, Math.round((look.glow ?? 0) * 100) + '%')],
                    ['reflect', t('terrain.look.reflect'), range('rr-build-treflect', t('terrain.look.reflect'), look.reflect, 0, 1, 0.01, Math.round(look.reflect * 100) + '%')
                        + range('rr-build-tgloss', t('terrain.look.gloss'), look.gloss, 0, 1, 0.01, Math.round(look.gloss * 100) + '%')
                        + `<div class="rr-build-range"><span>${t('terrain.look.tint')}</span>${swatch('rr-build-ttint', look.tint)}</div>`]]) + '</div>';
            // Which sheet these change: the one clicked in the 3D view, outlined there.
            const chosen = terrain.selectedRegion ? terrain.selectedRegion() : null;
            body = (chosen ? `<div class="rr-build-note rr-build-wrap rr-build-tselected">${t('terrain.look.selected').replace('{w}', chosen.x1 - chosen.x0 + 1).replace('{h}', chosen.y1 - chosen.y0 + 1)}</div>` : note('terrain.look.pick')) + body;
        }
        const status = this.terrainStatus(terrain.statusText ? terrain.statusText() : '');
        const iconButton = (cls, icon, key) => `<button type="button" class="rr-btn-secondary rr-build-icon-btn ${cls}" title="${t(key)}" aria-label="${t(key)}">${this.icon(icon, 16)}</button>`;
        this.setPanel(slot, this.label(slot), `${body}<div class="rr-build-note rr-build-wrap rr-build-tstatus"${status ? '' : ' hidden'}>${status}</div>`,
            `${iconButton('rr-build-tundo', 'undo', 'terrain.undo')}${iconButton('rr-build-tredo', 'redo', 'terrain.redo')}${['raise', 'lower', 'smooth', 'flatten', 'dunes'].includes(slot) ? iconButton('rr-build-tclear', 'level', 'terrain.clear') : ''}`);
        const bindRange = (cls, apply, show) => panel.querySelector('.' + cls)?.addEventListener('input', event => {
            apply(Number(event.target.value));
            panel.querySelector('.' + cls + '-value').textContent = show(Number(event.target.value));
        });
        bindRange('rr-build-tradius', v => { terrain.radius = v; }, v => v);
        bindRange('rr-build-rwidth', v => { terrain.riverWidth = v; }, v => v);
        bindRange('rr-build-rdepth', v => { terrain.riverDepth = v; }, v => v);
        panel.querySelector('.rr-build-rfinish')?.addEventListener('click', () => terrain.finishRiver());
        panel.querySelector('.rr-build-rcancel')?.addEventListener('click', () => terrain.cancelRiver());
        bindRange('rr-build-tstrength', v => { terrain.strength = v; }, v => v);
        // Dunes: the field in hand.
        bindRange('rr-build-ddir', v => { terrain.dunes.dir = v; }, v => Math.round(v) + '°');
        bindRange('rr-build-dheight', v => { terrain.dunes.height = v; }, v => v);
        panel.querySelector('.rr-build-dsize')?.addEventListener('input', event => { terrain.dunes.size = Number(event.target.value); panel.querySelector('.rr-build-dsize-value').textContent = event.target.value; });
        panel.querySelector('.rr-build-dsize')?.addEventListener('change', () => this.renderTerrainPanel());
        panel.querySelector('.rr-build-dwalk')?.addEventListener('change', event => { terrain.dunes.walkable = event.target.checked; this.renderTerrainPanel(); });
        panel.querySelector('.rr-build-dseed')?.addEventListener('click', () => { terrain.dunes.seed = 1 + Math.floor(Math.random() * 9999); this.flash(this._tt('Another dune field')); });
        // Ground: the type in hand, its look, the brush.
        panel.querySelectorAll('.rr-build-gmode').forEach(el => el.addEventListener('click', () => { terrain.groundErase = el.dataset.value === 'erase'; this.renderTerrainPanel(); }));
        panel.querySelectorAll('.rr-build-gshape').forEach(el => el.addEventListener('click', () => { terrain.groundShape = el.dataset.value; this.renderTerrainPanel(); }));
        panel.querySelector('.rr-build-gsetfloor')?.addEventListener('click', event => { if (terrain.setGroundFloor(event.currentTarget.dataset.floor)) this.renderTerrainPanel(); });
        panel.querySelectorAll('.rr-build-gtype').forEach(el => el.addEventListener('click', () => { terrain.editGroundType({}, 'commit'); terrain.groundType = Number(el.dataset.index); terrain.groundErase = false; this.renderTerrainPanel(); }));
        panel.querySelectorAll('.rr-build-gpreset').forEach(el => el.addEventListener('click', () => {
            const preset = TerrainManager.GROUND_PRESETS[Number(el.dataset.index)];
            if (preset && terrain.addGroundType(Object.assign({}, preset, { name: this._tt(preset.name) })) !== -1) this.renderTerrainPanel();
        }));
        bindRange('rr-build-gsoft', v => { terrain.groundSoft = v; }, v => Math.round(v * 100) + '%');
        bindRange('rr-build-glevel', v => { terrain.groundLevel = v; }, v => v);
        this.gestureRange(panel.querySelector('.rr-build-gscale'), v => { terrain.editGroundType({ scale: v }, 'live'); panel.querySelector('.rr-build-gscale-value').textContent = v; }, () => terrain.editGroundType({}, 'commit'));
        panel.querySelector('.rr-build-gbare')?.addEventListener('change', event => { terrain.editGroundType({ bare: event.target.checked }, 'commit'); terrain.announceFoliage(null); });
        panel.querySelector('.rr-build-gname')?.addEventListener('change', event => { terrain.editGroundType({ name: event.target.value }, 'commit'); this.renderTerrainPanel(); });
        panel.querySelector('.rr-build-gremove')?.addEventListener('click', () => { terrain.removeGroundType(); this.renderTerrainPanel(); });
        panel.querySelector('.rr-build-gfill')?.addEventListener('click', () => { terrain.fillGround(); this.renderTerrainPanel(); });
        const groundTint = panel.querySelector('.rr-build-gtint');
        const tintInput = hex => {
            terrain.editGroundType({ tint: hex }, 'live');
            const dot = panel.querySelector(`.rr-build-gtype[data-index="${terrain.groundType}"] .rr-build-gdot`);
            if (dot) dot.style.background = hex;
            clearTimeout(this._groundCommit);
            this._groundCommit = setTimeout(() => terrain.editGroundType({}, 'commit'), 450);
        };
        if (groundTint && groundTint.tagName === 'BUTTON') RRColorPopup.bind(groundTint, tintInput);
        else groundTint?.addEventListener('input', event => tintInput(event.target.value));
        const groundTile = panel.querySelector('.rr-build-gmaterial');
        groundTile?.addEventListener('click', () => {
            const manager = this.manager();
            if (typeof RRMaterialPopup === 'undefined' || !manager) return;
            if (RRMaterialPopup.isOpen()) { RRMaterialPopup.close(); return; }
            RRMaterialPopup.open(groundTile, {
                materials: manager.materials?.() || [],
                current: groundTile.dataset.value,
                onPick: name => { if (name) { terrain.editGroundType({ material: name }, 'commit'); this.renderTerrainPanel(); } }
            });
        });
        this.bindSteepSection(terrain);
        this.bindRoomBody(terrain);
        this.bindSurroundBody(terrain);
        // Biome: one click sets the map's look.
        panel.querySelector('.rr-build-breplace')?.addEventListener('change', event => { terrain.biomeReplace = event.target.checked; });
        panel.querySelectorAll('.rr-build-biome').forEach(el => el.addEventListener('click', () => {
            if (terrain.applyBiome(el.dataset.value, !!terrain.biomeReplace)) { terrain.biome = el.dataset.value; this.renderTerrainPanel(); }
        }));
        // The look's sliders edit the selected sheet as they move (one undo step a drag or a run of arrow keys), else only the look in hand.
        const lookRange = (cls, key) => this.gestureRange(panel.querySelector('.' + cls), v => {
            if (terrain.editLook) terrain.editLook({ [key]: v }, 'live'); else terrain.waterLook[key] = v;
            panel.querySelector('.' + cls + '-value').textContent = Math.round(v * 100) + '%';
        }, () => terrain.editLook?.({}, 'commit'));
        lookRange('rr-build-treflect', 'reflect');
        lookRange('rr-build-tgloss', 'gloss');
        lookRange('rr-build-tclarity', 'clear');
        lookRange('rr-build-twaves', 'waves');
        lookRange('rr-build-tglow', 'glow');
        // A colour from the popup: live as it moves, kept a moment after the last change.
        const colourInput = key => hex => {
            if (terrain.editLook) terrain.editLook({ [key]: hex }, 'live'); else terrain.waterLook[key] = hex;
            clearTimeout(this._lookCommit);
            this._lookCommit = setTimeout(() => terrain.editLook?.({}, 'commit'), 450);
        };
        const colour = panel.querySelector('.rr-build-tcolour');
        if (colour && colour.tagName === 'BUTTON') RRColorPopup.bind(colour, colourInput('colour'));
        else colour?.addEventListener('input', event => colourInput('colour')(event.target.value));
        const tint = panel.querySelector('.rr-build-ttint');
        if (tint && tint.tagName === 'BUTTON') RRColorPopup.bind(tint, colourInput('tint'));
        else tint?.addEventListener('input', event => colourInput('tint')(event.target.value));
        panel.querySelectorAll('.rr-build-look').forEach(el => el.addEventListener('click', () => {
            const preset = TerrainManager.WATER_LOOKS[el.dataset.preset];
            if (terrain.editLook) terrain.editLook(Object.assign({}, preset), 'commit'); else Object.assign(terrain.waterLook, preset);
            this.renderTerrainPanel();
        }));
        panel.querySelector('.rr-build-tundo')?.addEventListener('click', () => { terrain.undo(); this.renderTerrainPanel(); });
        panel.querySelector('.rr-build-tredo')?.addEventListener('click', () => { terrain.redo(); this.renderTerrainPanel(); });
        panel.querySelector('button.rr-build-tclear')?.addEventListener('click', () => { terrain.clear(); this.renderTerrainPanel(); });
    }

    /**
     * One undo step for a run of changes on a control: `keep()` closes the step. `now()` closes it at once (a drag
     * let go), `soon()` a moment after the last change (arrow keys, a number's arrows held); losing focus closes it too.
     */
    gesture(el, keep) {
        let timer = 0;
        const now = () => { clearTimeout(timer); timer = 0; keep(); };
        const soon = () => { clearTimeout(timer); timer = setTimeout(now, BuildHotbar.GATHER_MS); };
        el.addEventListener('blur', () => { if (timer) now(); });
        return { now, soon };
    }

    /** A slider that edits the map as it moves (`live(value)`): one undo step a drag, one a run of arrow keys (`keep()`). */
    gestureRange(el, live, keep) {
        if (!el) return;
        const step = this.gesture(el, keep);
        let keyed = false;
        el.addEventListener('keydown', () => { keyed = true; });
        el.addEventListener('pointerdown', () => { keyed = false; });
        el.addEventListener('input', () => live(Number(el.value)));
        el.addEventListener('change', () => (keyed ? step.soon() : step.now()));
    }

    /**
     * The Ground panel's Steep Ground card: the material the map's steep ground turns to (none
     * allowed), its tint and the angle it starts at; with no material, the tint and the angle are off.
     * On a map whose ground is flat, a line saying so.
     */
    steepSection(terrain, section, urlOf) {
        const tt = text => this._tt(text);
        const escape = text => String(text ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
        const cliff = terrain.cliff();
        if (!terrain.hasSlopes()) return section(tt('Steep Ground'), `<div class="rr-build-note rr-build-wrap rr-build-steep-flat">${escape(tt('This map\'s ground is flat: nothing on it is steep.'))}</div>`);
        const off = !cliff.name;
        const tile = typeof RRMaterialPopup !== 'undefined'
            ? RRMaterialPopup.tile({ cls: 'rr-build-cmaterial', value: cliff.name, url: urlOf(cliff.name), blank: tt('None'), attrs: `title="${escape(this._t('pieces.material'))}"` }) : '';
        const swatch = typeof RRColorPopup !== 'undefined' ? RRColorPopup.swatch('rr-build-ctint', cliff.tint || '#ffffff', off) : `<input type="color" class="rr-build-ctint" value="${cliff.tint || '#ffffff'}"${off ? ' disabled' : ''}>`;
        return section(tt('Steep Ground'), tile
            + `<div class="rr-build-range${off ? ' is-off' : ''}"><span>${tt('Tint')}</span>${swatch}</div>`
            + `<label class="rr-build-range${off ? ' is-off' : ''}"><span>${tt('Starts At')}</span><input type="range" class="rr-build-cslope" min="10" max="80" step="1" value="${cliff.slope}"${off ? ' disabled' : ''} data-no-stepper><b class="rr-build-cslope-value">${cliff.slope}°</b></label>`
            + `<div class="rr-build-note rr-build-wrap">${escape(tt('Ground steeper than this angle turns to this material, on the map and past its border.'))}</div>`,
            escape(cliff.name || tt('None')));
    }

    /** The Steep Ground card's controls: a material picked is one undo step, the slider one a drag or a run of arrow keys, a color one a moment after it stops moving. */
    bindSteepSection(terrain) {
        const panel = this.panel;
        const tile = panel.querySelector('.rr-build-cmaterial');
        tile?.addEventListener('click', () => {
            const manager = this.manager();
            if (typeof RRMaterialPopup === 'undefined' || !manager) return;
            if (RRMaterialPopup.isOpen()) { RRMaterialPopup.close(); return; }
            RRMaterialPopup.open(tile, {
                materials: manager.materials?.() || [], current: tile.dataset.value, blank: this._tt('None'),
                onPick: name => { terrain.setCliff({ name }, 'commit'); this.renderTerrainPanel(); }
            });
        });
        const keep = () => terrain.setCliff({}, 'commit');
        // A change on another control than the one still gathering closes that one's step first.
        const live = (el, patch) => {
            if (this._cliffOwner !== el) { keep(); this._cliffOwner = el; }
            terrain.setCliff(patch, 'live');
        };
        const slope = panel.querySelector('.rr-build-cslope');
        this.gestureRange(slope, value => {
            live(slope, { slope: value });
            panel.querySelector('.rr-build-cslope-value').textContent = value + '°';
        }, keep);
        // A color from the popup: live as it moves, kept a moment after the last change.
        const tint = panel.querySelector('.rr-build-ctint');
        const tintInput = hex => {
            live(tint, { tint: hex });
            clearTimeout(this._cliffCommit);
            this._cliffCommit = setTimeout(keep, BuildHotbar.GATHER_MS);
        };
        if (tint && tint.tagName === 'BUTTON') RRColorPopup.bind(tint, tintInput);
        else tint?.addEventListener('input', event => tintInput(event.target.value));
    }

    /** The pictures under img/parallaxes the room and the sky are chosen from, and where each is read. */
    parallaxFolder() {
        const project = this.projectController?.getCurrentProject?.() || this.projectController?.currentProject;
        if (!project?.path || typeof require !== 'function') return '';
        return require('path').join(project.path, 'img', 'parallaxes');
    }

    /**
     * Room and Sky: the sky's picture and its drift, the room's height and its floor, walls and ceiling
     * pictures. Each picture is a tile showing it; a click opens the parallax pictures to choose from.
     */
    roomBody(terrain, section, range) {
        const tt = text => this._tt(text);
        const escape = text => String(text ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
        const room = terrain.roomLook();
        if (!room || !this.is3D()) return `<div class="rr-build-note rr-build-wrap">${escape(this._t('build.needs3D'))}</div>`;
        const folder = this.parallaxFolder(), assets = typeof RRAssetFiles !== 'undefined' ? RRAssetFiles : null;
        const urlOf = name => { try { return name && folder && assets?.imageUrlFor ? assets.imageUrlFor(folder, name) : ''; } catch (error) { return ''; } };
        const tile = (piece, label) => `<div class="rr-build-field rr-build-setting"><span>${escape(tt(label))}</span>`
            + (typeof RRMaterialPopup !== 'undefined' ? RRMaterialPopup.tile({ cls: 'rr-build-roomimg', value: room[piece], url: urlOf(room[piece]), blank: tt('None'), attrs: `data-piece="${piece}"` })
                : `<button type="button" class="rr-btn-secondary rr-build-roomimg" data-piece="${piece}">${escape(room[piece] || tt('None'))}</button>`) + '</div>';
        const drift = value => (Math.round(value * 100) / 100).toString();
        return `<div class="rr-build-note rr-build-wrap rr-build-lead">${escape(tt('The sky over the map and the room around it, from the pictures in img/parallaxes. Changes show at once.'))}</div>`
            + section(tt('Sky'), tile('sky', 'Picture')
                + range('rr-build-skysx', tt('Drift X'), room.skyScrollX, -8, 8, 0.05, drift(room.skyScrollX))
                + range('rr-build-skysy', tt('Drift Y'), room.skyScrollY, -8, 8, 0.05, drift(room.skyScrollY)))
            + section(tt('Room'), range('rr-build-roomh', tt('Height (tiles)'), room.height, 1, Math.max(64, room.height), 1, room.height)
                + tile('floor', 'Floor') + tile('walls', 'Walls') + tile('ceiling', 'Ceiling')
                + `<div class="rr-build-note rr-build-wrap">${escape(tt('The walls and the ceiling face inward: the camera looks past them into the room.'))}</div>`);
    }

    /** Room and Sky's controls: a picture picked is one undo step, a slider one a drag or a run of arrow keys. */
    bindRoomBody(terrain) {
        const panel = this.panel;
        if (!panel || !panel.querySelector('.rr-build-roomh')) return;
        const keep = () => terrain.setRoomLook({}, 'commit');
        const live = (el, patch) => {
            if (this._roomOwner !== el) { keep(); this._roomOwner = el; }
            terrain.setRoomLook(patch, 'live');
        };
        const slider = (cls, key, show) => {
            const el = panel.querySelector('.' + cls);
            this.gestureRange(el, value => { live(el, { [key]: value }); panel.querySelector('.' + cls + '-value').textContent = show(value); }, keep);
        };
        slider('rr-build-skysx', 'skyScrollX', v => Math.round(v * 100) / 100);
        slider('rr-build-skysy', 'skyScrollY', v => Math.round(v * 100) / 100);
        slider('rr-build-roomh', 'height', v => v);
        panel.querySelectorAll('.rr-build-roomimg').forEach(el => el.addEventListener('click', () => {
            const piece = el.dataset.piece, folder = this.parallaxFolder();
            const picker = window.reactor?.databaseEditorUI, assets = typeof RRAssetFiles !== 'undefined' ? RRAssetFiles : null;
            if (!folder || !assets || !picker?.showImagePicker) return;
            let files = [];
            try { files = assets.listImageReferences(folder); } catch (error) { files = []; }
            if (!files.length) { this.flash(this._tt('No parallax images found in img/parallaxes folder')); return; }
            const title = { sky: 'mapProps.pickSky', floor: 'mapProps.pickFloor', walls: 'mapProps.pickWalls', ceiling: 'mapProps.pickCeiling' }[piece] || 'mapProps.pickFloor';
            picker.showImagePicker(this._t(title), files,
                name => { keep(); if (terrain.setRoomLook({ [piece]: name || '' }, 'commit')) this.renderTerrainPanel(); },
                name => assets.imageUrlFor(folder, name), terrain.roomLook()?.[piece] || undefined,
                { selectButtonLabel: this._tt('Use This Parallax'), allowNone: true });
        }));
    }

    /**
     * Beyond the Border: what is seen past the map's border. The six styles as pictures, how far the
     * land reaches and how hilly it is; the map past each side (walking off that side enters it); under
     * Advanced a style per side, the seed, the numbers the chosen styles read and a neighbor's shift along
     * the border. A setting no chosen style reads is disabled or left out, and every control is off on a
     * map that is not 3D. The form's rules are RRMapEdges', the steps the TerrainManager's.
     */
    surroundBody(terrain, section) {
        const edges = typeof RRMapEdges !== 'undefined' ? RRMapEdges : null;
        if (!edges) return '';
        const tt = text => this._tt(text);
        const escape = text => String(text ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
        const view = edges.read(this.currentMap()), uses = edges.uses(view), reach = edges.reach();
        const on = this.is3D(), no = ok => (ok && on ? '' : ' disabled');
        const lead = `<div class="rr-build-note rr-build-wrap rr-build-lead">${escape(tt('What is seen past the map\'s border. Nobody walks there.'))}</div>`;
        // The land is laid from the map's floor: without one there is nothing to lay.
        const bare = on && !terrain.hasGroundFloor(), floors = bare ? this.groundFloors() : [];
        const noFloor = !bare ? '' : `<div class="rr-build-note rr-build-wrap rr-build-gnofloor">${escape(tt('Nothing shows past the border of a map with no floor.'))}</div>`
            + (floors.length ? `<div class="rr-build-actions"><button type="button" class="rr-btn-secondary rr-build-gsetfloor" data-floor="${escape(floors[0])}">${tt('Set a floor')}</button></div>` : `<div class="rr-build-note rr-build-wrap">${tt('Choose one in Room and Sky.')}</div>`);
        // The map view's Surroundings tick is off: the land is laid and not shown.
        const hidden = !on || edges.visible() ? '' : `<div class="rr-build-note rr-build-wrap rr-build-shidden">${escape(tt('The land past the border is hidden in this view.'))}</div>`
            + `<div class="rr-build-actions"><button type="button" class="rr-btn-secondary rr-build-sshow">${escape(tt('Show Surroundings'))}</button></div>`;
        const tiles = `<div class="rr-build-shapes">${edges.STYLES.map(style => `<button type="button" class="rr-build-chip rr-build-sstyle" data-style="${style.id}" aria-pressed="${style.id === view.style}" title="${escape(tt(style.label))}"${no(true)}>${edges.icon(style.id)}<span>${escape(tt(style.label))}</span></button>`).join('')}</div>`;
        const picked = edges.STYLES.find(style => style.id === view.style) || edges.STYLES[0];
        // The distance says Automatic until it is set; the chip is the way back. Weak graphics show less than the slider's far end.
        const auto = view.distance === null;
        const distance = `<div class="rr-build-stack${uses.distance && on ? '' : ' is-off'}"><span>${escape(tt('Distance (tiles)'))}</span>`
            + `<span class="rr-build-stack-value"><b class="rr-build-sdistance-value"${auto ? ' hidden' : ''}>${auto ? '' : view.distance}</b>`
            + `<button type="button" class="rr-build-chip rr-build-sauto" aria-pressed="${auto}"${no(uses.distance)}>${escape(tt('Automatic'))}</button></span>`
            + `<input type="range" class="rr-build-sdistance" min="${reach.min}" max="${reach.max}" step="8" value="${auto ? reach.auto : view.distance}" aria-label="${escape(tt('Distance (tiles)'))}"${no(uses.distance)} data-no-stepper>`
            + `<div class="rr-build-note rr-build-wrap rr-build-sreach" data-shown="${reach.shown}"${uses.distance && !auto && view.distance > reach.shown ? '' : ' hidden'}>${escape(tt('This computer shows {count} tiles. Stronger graphics show the rest.').replace('{count}', reach.shown))}</div></div>`;
        const hills = `<div class="rr-build-stack${uses.rough && on ? '' : ' is-off'}"><span>${escape(tt('Hills'))}</span>`
            + `<span class="rr-build-stack-value"><b class="rr-build-srough-value">${Math.round(view.rough * 100)}%</b></span>`
            + `<input type="range" class="rr-build-srough" min="0" max="1" step="0.05" value="${view.rough}" aria-label="${escape(tt('Hills'))}"${no(uses.rough)} data-no-stepper></div>`;
        // Each side's own style: any but the map's own (that is "Same as the map") and a floating island (the whole map is one or is not).
        const sideOptions = current => `<option value="">${escape(tt('Same as the map'))}</option>`
            + edges.STYLES.filter(style => style.id !== 'void' && style.id !== view.style).map(style => `<option value="${style.id}"${style.id === current ? ' selected' : ''}>${escape(tt(style.label))}</option>`).join('');
        const sides = edges.SIDES.map(side => `<label class="rr-build-field rr-build-sfield${uses.sides && on ? '' : ' is-off'}"><span>${escape(tt(edges.SIDE_LABEL[side]))}</span>`
            + `<select class="database-field-value rr-build-sside" data-side="${side}"${no(uses.sides)}>${sideOptions(view.edges[side])}</select></label>`).join('');
        // A number shows the value in use, so its arrows step from it; the sea level alone has none until it is set.
        const numbers = edges.NUMBERS.filter(field => uses[field.use]).map(field => `<label class="rr-build-field rr-build-sfield"><span>${escape(tt(field.label))}</span>`
            + `<input type="number" class="database-field-value rr-build-snumber" data-key="${field.key}" value="${edges.shown(view, field)}" min="${field.min}" max="${field.max}" step="${field.step}"${field.key === 'level' ? ` placeholder="${escape(tt('Automatic'))}"` : ''}${no(true)}></label>`).join('');
        // The map past each side: any map of the project but this one. A map since deleted shows as its number.
        const here = this.currentMap()?.id, maps = (window.reactor?.projectController?.getCurrentProject?.()?.maps || []).filter(entry => entry && entry.id !== here);
        const mapName = id => { const entry = maps.find(m => m.id === id); return String(id).padStart(3, '0') + (entry && entry.name ? ': ' + entry.name : ''); };
        const mapOptions = current => `<option value="">${escape(tt('None'))}</option>`
            + (current && !maps.some(m => m.id === current.map) ? `<option value="${current.map}" selected>${escape(mapName(current.map))}</option>` : '')
            + maps.map(m => `<option value="${m.id}"${current && current.map === m.id ? ' selected' : ''}>${escape(mapName(m.id))}</option>`).join('');
        // Where a neighbor lies along its border is set right under it: its shift.
        const shiftOf = side => (!view.neighbors[side] ? '' : `<label class="rr-build-field rr-build-sfield rr-build-nshift-row"><span>${escape(tt('Shift (tiles)'))}</span>`
            + `<input type="number" class="database-field-value rr-build-nshift" data-side="${side}" value="${view.neighbors[side].shift}" min="-9999" max="9999" step="1"></label>`);
        const neighbors = `<div class="rr-build-note rr-build-wrap">${escape(tt('Walk past the border on a side to enter the map chosen there.'))}</div>`
            // (Live on a 2D map as well: only the land past the border needs a 3D one.)
            + `<div class="rr-build-sgrid">${edges.SIDES.map(side => `<label class="rr-build-field rr-build-sfield"><span>${escape(tt(edges.SIDE_LABEL[side]))}</span>`
                + `<select class="database-field-value rr-build-nmap" data-side="${side}">${mapOptions(view.neighbors[side])}</select></label>` + shiftOf(side)).join('')}</div>`
            + (edges.SIDES.some(side => view.neighbors[side]) ? `<div class="rr-build-note rr-build-wrap rr-build-nshift-note">${escape(tt('Shift slides a neighbor along its border: down on East and West, right on North and South.'))}</div>` : '');
        return lead + noFloor + hidden
            + section(tt('Style'), tiles, escape(tt(picked.label)))
            + section(this._t('build.settings'), distance + hills)
            // Folded until a side has a map or the author opens it: the panel fits a small window without it.
            + `<details class="lit-section rr-build-section rr-build-more" data-more="neighbors"${this.moreOpen('neighbors') || edges.SIDES.some(side => view.neighbors[side]) ? ' open' : ''}><summary class="lit-section-header">${tt('Neighboring Maps')}</summary><div class="lit-section-body">${neighbors}</div></details>`
            + `<details class="lit-section rr-build-section rr-build-more" data-more="surround"${this.moreOpen('surround') ? ' open' : ''}><summary class="lit-section-header">${tt('Advanced')}</summary><div class="lit-section-body"><div class="rr-build-sgrid">${sides}${numbers}</div></div></details>`;
    }

    /**
     * Beyond the Border's controls: a tile or a side is one undo step; a slider one a drag or a run of arrow keys; a
     * number one a moment after its last change (typed, or its arrows held). A slider and a number show their value
     * in place, so the keyboard keeps them; a tile or a side draws the panel again (which numbers it shows may change).
     */
    bindSurroundBody(terrain) {
        const panel = this.panel, edges = typeof RRMapEdges !== 'undefined' ? RRMapEdges : null;
        if (!edges || !panel.querySelector('.rr-build-sstyle')) return;
        // A style picked after Nothing starts from the numbers the map last had.
        const set = (change, phase = 'commit') => terrain.setSurround(edges.patch(terrain.surroundBase(), change), phase);
        const commit = change => { set(change); this.renderTerrainPanel(); };
        const keep = () => terrain.setSurround(terrain.surround(), 'commit');
        // A change on another control than the one still gathering closes that one's step first.
        const live = (el, change) => {
            if (this._surroundOwner !== el) { keep(); this._surroundOwner = el; }
            set(change, 'live');
        };
        panel.querySelector('.rr-build-sshow')?.addEventListener('click', () => edges.setVisible(true));
        panel.querySelectorAll('.rr-build-sstyle').forEach(el => el.addEventListener('click', () => commit({ style: el.dataset.style })));
        panel.querySelector('.rr-build-sauto')?.addEventListener('click', () => commit({ distance: null }));
        panel.querySelectorAll('.rr-build-sside').forEach(el => el.addEventListener('change', () => {
            commit({ edges: { [el.dataset.side]: el.value } });
            // The list drawn in its place takes the focus, once the themed list has wrapped it (which moves it, and a moved element loses the focus).
            setTimeout(() => this.panel.querySelector(`.rr-build-sside[data-side="${el.dataset.side}"]`)?.focus({ preventScroll: true }), 0);
        }));
        panel.querySelectorAll('.rr-build-snumber').forEach(el => {
            const field = edges.NUMBERS.find(entry => entry.key === el.dataset.key), step = this.gesture(el, keep);
            // Ctrl+Z and Ctrl+Y in the field are the map's, as on a slider, unless text typed there is still the field's own to undo.
            let typed = false;
            el.addEventListener('input', event => { if (event.isTrusted && event.inputType) typed = true; });
            el.addEventListener('keydown', event => {
                const key = String(event.key || '').toLowerCase();
                if (typed || !(event.ctrlKey || event.metaKey) || event.altKey || (key !== 'z' && key !== 'y')) return;
                event.preventDefault();
                if (key === 'z' && !event.shiftKey) terrain.undo(); else terrain.redo();
                this.renderTerrainPanel();
            });
            el.addEventListener('change', () => {
                typed = false;
                live(el, { [field.key]: el.value });
                // The field shows what was kept: a number held to its range, the default when it was cleared.
                el.value = edges.shown(edges.read(this.currentMap()), field);
                step.soon();
            });
        });
        // The map past a side: picking one is a step; its shift gathers like the numbers.
        const neighborOf = side => edges.read(this.currentMap()).neighbors[side];
        panel.querySelectorAll('.rr-build-nmap').forEach(el => el.addEventListener('change', () => {
            const side = el.dataset.side, was = neighborOf(side);
            commit({ neighbors: { [side]: el.value ? { map: Number(el.value), shift: was ? was.shift : 0 } : null } });
            setTimeout(() => this.panel.querySelector(`.rr-build-nmap[data-side="${side}"]`)?.focus({ preventScroll: true }), 0);
        }));
        panel.querySelectorAll('.rr-build-nshift').forEach(el => {
            const step = this.gesture(el, keep), side = el.dataset.side;
            const slide = () => {
                const now = neighborOf(side);
                if (!now) return false;
                live(el, { neighbors: { [side]: { map: now.map, shift: el.value } } });
                step.soon();
                return true;
            };
            // The neighbor slides in the view as the number is typed or stepped: a whole number so far is its shift.
            let typed = false;
            el.addEventListener('input', event => {
                if (event.isTrusted && event.inputType) typed = true;
                if (/^-?\d+$/.test(el.value.trim())) slide();
            });
            // Ctrl+Z and Ctrl+Y in the field are the map's, as on the numbers, unless text typed there is still the field's own to undo.
            el.addEventListener('keydown', event => {
                const key = String(event.key || '').toLowerCase();
                if (typed || !(event.ctrlKey || event.metaKey) || event.altKey || (key !== 'z' && key !== 'y')) return;
                event.preventDefault();
                if (key === 'z' && !event.shiftKey) terrain.undo(); else terrain.redo();
                this.renderTerrainPanel();
            });
            el.addEventListener('change', () => {
                typed = false;
                // The field shows what was kept: a whole number, held to its range.
                if (slide()) el.value = (neighborOf(side) || { shift: 0 }).shift;
            });
        });
        // The sliders: the land follows as they move.
        const slider = (cls, key, show) => {
            const el = panel.querySelector('.' + cls);
            this.gestureRange(el, value => { live(el, { [key]: value }); show(value); }, keep);
        };
        slider('rr-build-sdistance', 'distance', value => {
            const shown = panel.querySelector('.rr-build-sdistance-value');
            shown.textContent = value; shown.hidden = false;
            panel.querySelector('.rr-build-sauto')?.setAttribute('aria-pressed', 'false');
            const reach = panel.querySelector('.rr-build-sreach');
            if (reach) reach.hidden = !(value > Number(reach.dataset.shown));
        });
        slider('rr-build-srough', 'rough', value => { panel.querySelector('.rr-build-srough-value').textContent = Math.round(value * 100) + '%'; });
    }

    /** The Foliage group's Eraser: every plant under the brush goes, grass to bushes. The brush's size, and undo and redo. */
    renderFoliageEraser() {
        const panel = this.panel, terrain = this.terrain(), t = key => this._t(key);
        if (!panel || !terrain) return;
        const body = `<div class="rr-build-note rr-build-wrap rr-build-lead">${this._tt('Erase every plant under the brush.')}</div>`
            + `<div class="lit-section rr-build-section"><div class="lit-section-header">${t('terrain.brush')}</div><div class="lit-section-body">`
            + `<label class="rr-build-range"><span>${t('terrain.radius')}</span><input type="range" class="rr-build-fradius" min="1" max="12" step="0.5" value="${terrain.radius}" data-no-stepper><b class="rr-build-fradius-value">${terrain.radius}</b></label></div></div>`;
        const iconButton = (cls, icon, key) => `<button type="button" class="rr-btn-secondary rr-build-icon-btn ${cls}" title="${t(key)}" aria-label="${t(key)}">${this.icon(icon, 16)}</button>`;
        this.setPanel('ferase', this.label('ferase'), body, `${iconButton('rr-build-tundo', 'undo', 'terrain.undo')}${iconButton('rr-build-tredo', 'redo', 'terrain.redo')}`);
        panel.querySelector('.rr-build-fradius')?.addEventListener('input', event => {
            terrain.radius = Number(event.target.value);
            const shown = panel.querySelector('.rr-build-fradius-value');
            if (shown) shown.textContent = event.target.value;
        });
        panel.querySelector('.rr-build-tundo')?.addEventListener('click', () => { terrain.undo(); this.renderFoliagePanel(); });
        panel.querySelector('.rr-build-tredo')?.addEventListener('click', () => { terrain.redo(); this.renderFoliagePanel(); });
    }

    /**
     * The Foliage group's panel: paint or erase, the brush, the kind's look in
     * hand (height and colours; a bush's size, leaves and blossom), and the
     * map's wind. Undo and redo along the foot.
     */
    renderFoliagePanel() {
        const panel = this.panel, terrain = this.terrain();
        if (!panel || !terrain) return;
        const slot = this.activeSlot(), t = key => this._t(key), bush = slot === 'bush';
        if (slot === 'ferase') { this.renderFoliageEraser(); return; }
        const section = (title, body, meta) => `<div class="lit-section rr-build-section"><div class="lit-section-header">${title}${meta ? `<span class="lit-section-meta">${meta}</span>` : ''}</div><div class="lit-section-body">${body}</div></div>`;
        const range = (cls, label, value, min, max, step, shown) => `<label class="rr-build-range"><span>${label}</span><input type="range" class="${cls}" min="${min}" max="${max}" step="${step}" value="${value}" data-no-stepper><b class="${cls}-value">${shown}</b></label>`;
        const swatch = (cls, value) => typeof RRColorPopup !== 'undefined' ? RRColorPopup.swatch(cls, value) : `<input type="color" class="${cls}" value="${value}">`;
        const chip = (cls, data, label, on) => `<button type="button" class="rr-build-chip ${cls}" data-value="${data}" aria-pressed="${on}"><span>${label}</span></button>`;
        const map = this.currentMap(), wind = map && typeof RRMapFoliage !== 'undefined' ? RRMapFoliage.wind(map) : { dir: 30, strength: 0.6 };
        let body = `<div class="rr-build-note rr-build-wrap rr-build-lead">${t(bush ? 'foliage.hint.bush' : 'foliage.hint.paint')}</div>`
            + `<div class="rr-build-finishes rr-build-pair">${chip('rr-build-fmode', 'paint', t('foliage.paint'), !terrain.foliageErase)}${chip('rr-build-fmode', 'erase', t('foliage.erase'), !!terrain.foliageErase)}</div>`;
        const brush = range('rr-build-fradius', t('terrain.radius'), terrain.radius, 1, 12, 0.5, terrain.radius)
            + (bush ? '' : range('rr-build-fstrength', t('terrain.strength'), terrain.strength, 0.05, 1, 0.05, terrain.strength)
                + range('rr-build-flevel', t('foliage.density'), terrain.foliageLevel, 1, 9, 1, terrain.foliageLevel));
        let look;
        if (bush) {
            const leaves = terrain.bushColour || ((typeof Reactor3D !== 'undefined' && Reactor3D.BUSH_LOOK && Reactor3D.BUSH_LOOK.colour) || '#3f6b2b');
            look = range('rr-build-fbushsize', t('foliage.bushSize'), terrain.bushSize, 0.5, 6, 0.1, terrain.bushSize)
                + `<label class="rr-build-check"><input type="checkbox" class="rr-build-fvary"${terrain.bushVary ? ' checked' : ''}> ${t('foliage.vary')}</label>`
                + `<div class="rr-build-range"><span>${t('foliage.leaves')}</span>${swatch('rr-build-fleaves', leaves)}</div>`
                + `<div class="rr-build-range"><span>${t('foliage.blossom')}</span>${swatch('rr-build-fbloom', terrain.bushBloom || '#f2c4d8')}</div>`
                + `<div class="rr-build-finishes">${chip('rr-build-fbloomnone', '', t('foliage.none'), !terrain.bushBloom)}</div>`;
        } else {
            const own = terrain.foliageLookOf(slot);
            const headed = slot === 'flowers' || slot === 'bulbs';
            const petals = headed ? ((terrain.foliageLook[slot] && terrain.foliageLook[slot].colours) || null) : null;
            look = range('rr-build-fheight', t('foliage.height'), own.height, 0.1, 5, 0.05, own.height)
                + `<div class="rr-build-range"><span>${t('foliage.colour')}</span>${swatch('rr-build-fcolour', own.colour)}</div>`
                + `<div class="rr-build-range"><span>${t('foliage.tip')}</span>${swatch('rr-build-ftip', own.tip)}</div>`
                + range('rr-build-fglow', this._tt('Glow'), own.glow || 0, 0, 1, 0.05, Math.round((own.glow || 0) * 100) + '%')
                + (headed ? `<div class="rr-build-range rr-build-fpetal-row"><span>${t('foliage.petals')}</span><span class="rr-build-fpetal-list">${(petals || []).map((c, i) => swatch('rr-build-fpetal rr-build-fpetal-' + i, c)).join('')}`
                    + `<button type="button" class="rr-btn-secondary rr-build-icon-btn rr-build-fpetaladd" title="${this._tt('Add a petal color')}" aria-label="${this._tt('Add a petal color')}">+</button>`
                    + (petals && petals.length ? `<button type="button" class="rr-btn-secondary rr-build-icon-btn rr-build-fpetaldel" title="${this._tt('Remove the last petal color')}" aria-label="${this._tt('Remove the last petal color')}">&minus;</button>` : '')
                    + `</span></div><div class="rr-build-finishes">${chip('rr-build-fmixed', '', t('foliage.mixed'), !petals)}</div>` : '')
                + `<div class="rr-build-finishes">${chip('rr-build-fnatural', '', t('foliage.natural'), !terrain.foliageLook[slot])}</div>`;
        }
        const windRows = range('rr-build-fwinddir', t('foliage.windDir'), wind.dir, 0, 359, 1, Math.round(wind.dir) + '°')
            + range('rr-build-fwindstr', t('foliage.windStrength'), wind.strength, 0, 2, 0.05, Math.round(wind.strength * 100) + '%');
        // Plant colors for the whole map in one click: every kind in hand, and what is already planted.
        const paletteNames = { meadow: 'Meadow', autumn: 'Autumn', dry: 'Dry', snow: 'Snow-dusted', violet: 'Alien violet', teal: 'Alien teal', crimson: 'Alien crimson', glow: 'Glowing' };
        const palettes = `<div class="rr-build-note rr-build-wrap">${this._tt('Recolors every plant on the map, and what you paint next.')}</div><div class="rr-build-finishes rr-build-pair">${Object.keys(TerrainManager.FOLIAGE_PALETTES).map(key => `<button type="button" class="rr-build-chip rr-build-fpalette" data-value="${key}" aria-pressed="${terrain.foliagePalette === key}"><i class="rr-build-gdot" style="background:${TerrainManager.FOLIAGE_PALETTES[key].grass[1]}"></i><span>${this._tt(paletteNames[key])}</span></button>`).join('')}</div>`;
        body += `<div class="lit-section rr-build-section">` + this.paneTabs('foliage', [['brush', t('terrain.brush'), brush], ['look', t('foliage.look'), look], ['colors', this._tt('Colors'), palettes], ['wind', t('foliage.wind'), windRows]]) + '</div>';
        const iconButton = (cls, icon, key) => `<button type="button" class="rr-btn-secondary rr-build-icon-btn ${cls}" title="${t(key)}" aria-label="${t(key)}">${this.icon(icon, 16)}</button>`;
        this.setPanel(slot, this.label(slot), body, `${iconButton('rr-build-tundo', 'undo', 'terrain.undo')}${iconButton('rr-build-tredo', 'redo', 'terrain.redo')}`);
        const bindRange = (cls, apply, show) => panel.querySelector('.' + cls)?.addEventListener('input', event => {
            apply(Number(event.target.value));
            const label = panel.querySelector('.' + cls + '-value');
            if (label) label.textContent = show(Number(event.target.value));
        });
        const setLook = patch => { terrain.foliageLook[slot] = Object.assign({}, terrain.foliageLook[slot] || {}, patch); };
        panel.querySelectorAll('.rr-build-fmode').forEach(el => el.addEventListener('click', () => { terrain.foliageErase = el.dataset.value === 'erase'; this.renderFoliagePanel(); }));
        bindRange('rr-build-fradius', v => { terrain.radius = v; }, v => v);
        bindRange('rr-build-fstrength', v => { terrain.strength = v; }, v => v);
        bindRange('rr-build-flevel', v => { terrain.foliageLevel = v; }, v => v);
        bindRange('rr-build-fbushsize', v => { terrain.bushSize = v; }, v => v);
        bindRange('rr-build-fheight', v => setLook({ height: v }), v => v);
        panel.querySelector('.rr-build-fvary')?.addEventListener('change', event => { terrain.bushVary = event.target.checked; });
        const colour = (cls, apply) => {
            const el = panel.querySelector('.' + cls);
            if (!el) return;
            if (el.tagName === 'BUTTON' && typeof RRColorPopup !== 'undefined') RRColorPopup.bind(el, hex => apply(hex));
            else el.addEventListener('input', event => apply(event.target.value));
        };
        colour('rr-build-fcolour', hex => setLook({ colour: hex }));
        colour('rr-build-ftip', hex => setLook({ tip: hex }));
        // The petals: each color its own swatch, one added or the last taken away.
        const petalList = () => ((terrain.foliageLook[slot] && terrain.foliageLook[slot].colours) || []).slice();
        bindRange('rr-build-fglow', v => setLook({ glow: v }), v => Math.round(v * 100) + '%');
        petalList().forEach((_, i) => colour('rr-build-fpetal-' + i, hex => { const list = petalList(); list[i] = hex; setLook({ colours: list }); }));
        panel.querySelector('.rr-build-fpetaladd')?.addEventListener('click', () => { const list = petalList(); list.push(['#f4d54a', '#ffffff', '#e86a8c', '#8f7fe8', '#ff9a4a'][list.length % 5]); setLook({ colours: list.slice(0, 8) }); this.renderFoliagePanel(); });
        panel.querySelector('.rr-build-fpetaldel')?.addEventListener('click', () => { const list = petalList(); list.pop(); if (list.length) setLook({ colours: list }); else if (terrain.foliageLook[slot]) delete terrain.foliageLook[slot].colours; this.renderFoliagePanel(); });
        panel.querySelectorAll('.rr-build-fpalette').forEach(el => el.addEventListener('click', () => { terrain.applyFoliagePalette(el.dataset.value); this.renderFoliagePanel(); }));
        colour('rr-build-fleaves', hex => { terrain.bushColour = hex; });
        colour('rr-build-fbloom', hex => { terrain.bushBloom = hex; panel.querySelector('.rr-build-fbloomnone')?.setAttribute('aria-pressed', 'false'); });
        panel.querySelector('.rr-build-fbloomnone')?.addEventListener('click', () => { terrain.bushBloom = ''; this.renderFoliagePanel(); });
        panel.querySelector('.rr-build-fmixed')?.addEventListener('click', () => { if (terrain.foliageLook[slot]) delete terrain.foliageLook[slot].colours; this.renderFoliagePanel(); });
        panel.querySelector('.rr-build-fnatural')?.addEventListener('click', () => { delete terrain.foliageLook[slot]; this.renderFoliagePanel(); });
        // The wind is the map's: kept as one step when a slider lets go.
        const windRange = (cls, key, show) => {
            bindRange(cls, () => {}, show);
            panel.querySelector('.' + cls)?.addEventListener('change', event => { terrain.setWind?.({ [key]: Number(event.target.value) }); });
        };
        windRange('rr-build-fwinddir', 'dir', v => Math.round(v) + '°');
        windRange('rr-build-fwindstr', 'strength', v => Math.round(v * 100) + '%');
        panel.querySelector('.rr-build-tundo')?.addEventListener('click', () => { terrain.undo(); this.renderFoliagePanel(); });
        panel.querySelector('.rr-build-tredo')?.addEventListener('click', () => { terrain.redo(); this.renderFoliagePanel(); });
    }

    /** Ground pictures a map could take as its floor (img/parallaxes, the `!` ones first, grass before the rest). */
    groundFloors() {
        try {
            const project = this.projectController?.getCurrentProject?.() || this.projectController?.currentProject;
            if (!project?.path || typeof require !== 'function') return [];
            const fs = require('fs'), path = require('path'), dir = path.join(project.path, 'img', 'parallaxes');
            const names = fs.readdirSync(dir).filter(file => /\.(png|png_|jpg|webp)$/i.test(file)).map(file => file.replace(/\.[^.]+$/, ''));
            const rank = name => (/grass/i.test(name) ? 0 : 2) + (name.startsWith('!') ? 0 : 1);
            return names.filter(name => name.startsWith('!') || /grass|ground|floor/i.test(name)).sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
        } catch (error) { return []; }
    }

    /** The status line a Terrain panel shows: the ground's and its water's; on Beyond the Border, only that the map is not 3D. */
    terrainStatus(text) { return this.activeSlot() === 'surround' && this.is3D() ? '' : (text || ''); }

    /** The Terrain panel's line about the ground and its water, kept in step without redrawing the panel. */
    refreshTerrainStatus(text) {
        const line = this.visible && this.group() === 'terrain' ? this.panel?.querySelector('.rr-build-tstatus') : null;
        if (!line) return;
        // The Ground panel's Steep Ground card follows the ground gaining or losing its slopes (an undo from the keyboard).
        const terrain = this.terrain();
        if (terrain?.hasSlopes && this.activeSlot() === 'ground' && !!this.panel.querySelector('.rr-build-steep-flat') === terrain.hasSlopes()) { this.renderTerrainPanel(); return; }
        const shown = this.terrainStatus(text);
        line.textContent = shown;
        line.hidden = !shown;
    }

    /** The manager changed: the bar and the panel follow. */
    sync() {
        if (!this.visible || !this.root) return;
        if (this.tool() !== 'build') {
            // Terrain and Models: redraw when the slot in hand or the models on offer change.
            const shown = this.root.querySelector('.rr-build-slot[aria-pressed="true"]')?.dataset.slot;
            const groupShown = this.root.querySelector('.rr-build-group[aria-checked="true"]')?.dataset.group;
            if (shown !== this.activeSlot() || groupShown !== this.group() || this._slotsKey !== this.slots().join('|')) this.render();
            return;
        }
        const active = this.activeSlot();
        const wasActive = this.root.querySelector('.rr-build-slot[aria-pressed="true"]')?.dataset.slot;
        // A rock taken up or put down turns the bar to Terrain or back.
        if (wasActive !== active || this.root.querySelector('.rr-build-group[aria-checked="true"]')?.dataset.group !== this.group()) { this.render(); return; }
        const manager = this.manager();
        const level = this.root.querySelector('.rr-build-level');
        if (level) level.textContent = String(manager.level);
        // A selection change or a live drag redraws the panel, without stealing a field being typed in.
        if (document.activeElement && this.panel.contains(document.activeElement) && document.activeElement.tagName === 'INPUT') return;
        const piece = manager.selectedPiece?.();
        // A flight's steps and a ladder's size are its other pieces (an undo can change them under the same foot).
        const flight = piece && piece.kind === 'stair' ? manager.stairFlight?.(piece) : piece && piece.kind === 'ladder' ? manager.ladderFlight?.(piece) : null;
        const shape = JSON.stringify([manager.selected, manager.selectedIds, manager.selectedGroup, manager.mode, manager.kind, manager.material, manager.rot, manager.gizmoMode, piece && piece.kind, piece && piece.material, piece && piece.rot, flight && [flight.steps, flight.width, flight.height]]);
        const key = shape + JSON.stringify(piece || null);
        if (key === this._panelKey) return;
        // The same piece moved, turned or sized (a handle drag): the numbers follow in place.
        // Rebuilding the whole panel on every pointer move made the drag stutter.
        if (shape === this._panelShape && piece && this.refreshPanelValues(piece)) { this._panelKey = key; return; }
        this._panelKey = key; this._panelShape = shape;
        this.renderPanel();
    }

    /** Put a placed shape's place, turns and size into the panel's fields; false when the panel has none to take them. */
    refreshPanelValues(piece) {
        const panel = this.panel;
        if (!panel || !panel.querySelector('.rr-build-pos, .rr-build-size')) return false;
        const round = n => Math.round(n * 100) / 100;
        const values = {
            'rr-build-pos': { x: round(piece.x + 0.5 + (piece.offset ? piece.offset[0] || 0 : 0)), y: round(piece.y + 0.5 + (piece.offset ? piece.offset[1] || 0 : 0)), z: piece.z },
            'rr-build-turn': { angle: piece.angle || 0, tilt: piece.tilt || 0, roll: piece.roll || 0 },
            'rr-build-size': { 0: (piece.size || [])[0], 1: (piece.size || [])[1], 2: (piece.size || [])[2] }
        };
        for (const [cls, byKey] of Object.entries(values)) {
            for (const input of panel.querySelectorAll(`input.${cls}, input.rr-build-slider[data-for="${cls}"]`)) {
                const value = byKey[input.dataset.key];
                if (value === undefined || input === document.activeElement) continue;
                if (input.type === 'range') { if (value > Number(input.max)) input.max = Math.ceil(value); if (value < Number(input.min)) input.min = Math.floor(value); }
                input.value = value;
            }
        }
        return true;
    }

    /** A line that shows for a moment over the bar: why a click did nothing, what just happened. */
    /**
     * Save the selection as a structure: a name, an optional note, what comes with it (people,
     * and whether the selection itself becomes one building), a picture of it from the view.
     */
    openSaveStructureDialog() {
        const manager = this.manager();
        if (!manager || manager.selectionIds().length < 1 || document.getElementById('rr-save-structure-dialog')) return;
        const result = manager.captureSelection({ name: 'Structure' });
        if (!result) return;
        const tt = (text, params) => { let value = this._tt(text); for (const [k, v] of Object.entries(params || {})) value = value.split(`{${k}}`).join(String(v)); return value; };
        const escape = text => String(text ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
        const map = this.currentMap(), E = manager.elevation();
        // A picture of it from the view: the box it covers, from its lowest ground to its top.
        let low = Infinity;
        for (const piece of manager.selectionPieces()) low = Math.min(low, typeof Reactor3D !== 'undefined' && Reactor3D.pieceBaseAt ? Reactor3D.pieceBaseAt(map, piece.x, piece.y) : 0);
        if (!Number.isFinite(low)) low = 0;
        const thumb = window.reactor?.mapEditor3D?.snapshotBox?.(Object.assign({}, result.box, { low, high: low + result.plan.height * result.plan.storey })) || '';
        const counts = result.counts;
        const parts = [];
        if (counts.pieces) parts.push(tt('{count} pieces', { count: counts.pieces }));
        if (counts.lights) parts.push(tt('{count} lights', { count: counts.lights }));
        if (counts.props) parts.push(tt('{count} models', { count: counts.props }));
        if (counts.surfaces) parts.push(tt('{count} screens', { count: counts.surfaces }));
        if (counts.water) parts.push(tt('{count} water areas', { count: counts.water }));
        const people = manager.eventsInSelection();
        const record = (() => { const groups = new Set(manager.selectionPieces().map(p => p.group).filter(Boolean)); return groups.size === 1 && E && map ? E.structureOf(map, [...groups][0]) : null; })();
        const suggested = record ? String(record.plan || '').replace(/\.json$/i, '') + ' 2' : tt('New structure');
        const overlay = document.createElement('div');
        overlay.className = 'rr-modal-overlay';
        overlay.id = 'rr-save-structure-dialog';
        overlay.innerHTML = `<div class="rr-modal rr-save-structure" role="dialog" aria-modal="true" aria-labelledby="rr-save-structure-title">
            <div class="rr-modal-header"><div class="rr-modal-title" id="rr-save-structure-title">${escape(tt('Save as structure'))}</div><button type="button" class="rr-modal-close" aria-label="${escape(tt('Close'))}">×</button></div>
            <div class="rr-modal-body">
                <div class="rr-save-structure-top">
                    ${thumb ? `<img class="rr-save-structure-thumb" src="${thumb}" alt="">` : ''}
                    <div class="rr-save-structure-what">${escape(parts.join(' · '))}<div class="rr-build-note rr-build-wrap">${escape(tt('{w} × {d} cells', { w: result.plan.size[0], d: result.plan.size[1] }))}</div></div>
                </div>
                <div class="db-form rr-save-structure-form">
                    <label for="rr-save-structure-name">${escape(tt('Name'))}</label><input type="text" id="rr-save-structure-name" class="database-field-value" value="${escape(suggested)}" maxlength="80">
                    <label for="rr-save-structure-note">${escape(tt('Note'))}</label><input type="text" id="rr-save-structure-note" class="database-field-value" placeholder="${escape(tt('Optional'))}" maxlength="200">
                    ${people ? `<label class="rr-build-check db-full"><input type="checkbox" class="rr-save-structure-events"> ${escape(tt('Bring the events inside as its people'))} (${people})</label>` : ''}
                    <label class="rr-build-check db-full" title="${escape(tt('It then moves and turns as one, and Rebuild from plan updates it.'))}"><input type="checkbox" class="rr-save-structure-replace"> ${escape(tt('Make the selection one building of it'))}</label>
                </div>
                <div class="rr-save-structure-error" role="alert"></div>
            </div>
            <div class="rr-modal-footer"><button type="button" class="rr-btn-secondary rr-save-structure-cancel">${escape(tt('Cancel'))}</button><button type="button" class="rr-button-primary rr-save-structure-save">${escape(tt('Save'))}</button></div>
        </div>`;
        document.body.appendChild(overlay);
        const name = overlay.querySelector('#rr-save-structure-name'), error = overlay.querySelector('.rr-save-structure-error');
        const close = () => { document.removeEventListener('keydown', onKey, true); overlay.remove(); };
        const save = async () => {
            const value = name.value.trim();
            if (!value) { error.textContent = tt('Give it a name.'); name.focus(); return; }
            const existing = manager.structureNamed(value);
            if (existing) {
                const replace = await RRDialog.confirm(tt('A structure named “{name}” already exists. Replace it?', { name: existing.name || value }),
                    { title: tt('Save as structure'), ok: tt('Replace'), danger: true });
                // Closed while the question was up: nothing to save into.
                if (!overlay.isConnected) return;
                if (!replace) { name.focus(); name.select(); return; }
            }
            const saved = manager.saveSelectionAsStructure({ name: value, description: overlay.querySelector('#rr-save-structure-note').value.trim(),
                events: !!overlay.querySelector('.rr-save-structure-events')?.checked, replace: !!overlay.querySelector('.rr-save-structure-replace')?.checked, overwrite: !!existing });
            if (!saved) { error.textContent = tt('The structure could not be saved.'); return; }
            // Its picture beside it, for the lists that show one.
            if (thumb && typeof require === 'function') {
                try { const fs = require('fs'), path = require('path'); fs.writeFileSync(path.join(manager.projectPath(), '3d', 'Structures', saved.file.replace(/\.json$/i, '.png')), Buffer.from(thumb.split(',')[1], 'base64')); } catch (_) { /* a picture is a nicety */ }
            }
            close();
            this.flash(tt('Saved as a structure: {name}', { name: value }));
            this.render();
        };
        const onKey = event => {
            if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); }
            else if (event.key === 'Enter' && event.target?.tagName === 'INPUT' && event.target.type === 'text') { event.preventDefault(); save(); }
        };
        document.addEventListener('keydown', onKey, true);
        overlay.querySelector('.rr-modal-close').addEventListener('click', close);
        overlay.querySelector('.rr-save-structure-cancel').addEventListener('click', close);
        overlay.querySelector('.rr-save-structure-save').addEventListener('click', save);
        name.focus(); name.select();
    }

    flash(text) {
        if (!this.root || !this.visible) return;
        let note = this.root.querySelector('.rr-build-flash');
        if (!note) { note = document.createElement('div'); note.className = 'rr-build-flash'; this.root.prepend(note); }
        note.textContent = text;
        note.classList.add('is-shown');
        clearTimeout(this._flashTimer);
        this._flashTimer = setTimeout(() => note.classList.remove('is-shown'), 2400);
    }

    /** Number keys pick slots. */
    handleKey(event) {
        if (!this.visible) return;
        const target = event.target;
        if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
        if (target?.isContentEditable || event.ctrlKey || event.metaKey || event.altKey) return;
        if (window.reactor?.uiManager?.isEditorModalOpenForGlobalShortcuts?.()) return;
        // A river being clicked out: Enter lays it, Escape drops the course.
        if (this.group() === 'terrain' && this.terrain()?.handleRiverKey?.(event)) { event.preventDefault(); event.stopPropagation(); return; }
        // Escape lets go of the sheet the Look panel holds.
        if (event.key === 'Escape' && this.group() === 'terrain' && this.terrain()?.mode === 'look' && this.terrain().selectedWater) {
            event.preventDefault(); event.stopPropagation();
            this.terrain().selectWater(null);
            return;
        }
        if (/^[0-9]$/.test(event.key)) {
            const index = event.key === '0' ? 9 : Number(event.key) - 1;
            const slots = this.slots();
            if (slots[index]) { event.preventDefault(); event.stopPropagation(); this.pick(slots[index]); }
        }
    }
}

if (typeof module !== 'undefined' && module.exports) module.exports = BuildHotbar;
