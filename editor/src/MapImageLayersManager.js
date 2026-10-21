/**
 * MapImageLayersManager - the Image Layers tool: a panel docked beside the map, and the layers drawn on it.
 *
 * The panel lists the map's image layers as a paint program does (the top row is drawn on top), adds one
 * from five ready-made kinds, and shows the selected layer's settings. Every change is on the map at once,
 * is a step of the map's undo history, and saves with the map. What a layer is and how the game draws it
 * come from the runtime's ReactorImageLayers (loaded here from the runtime folder, the way the 3D view
 * loads its scripts); the words and rules of the panel are RRMapImageLayers' (MapImageLayersEditor.js).
 *
 * The flat map view draws every layer at its depth, as the game does at the start of play: a picture locked
 * to the map lies on it, a repeating one is tiled across it and slides with the view by how far it follows
 * the map, one that fills the screen lies where the game's screen lies (around a map smaller than the screen,
 * else over the part of the map in view). Over the 3D view, the layers a 3D map draws lie over the canvas as
 * elements with the picture, its opacity and its blend. While the panel is open a repeating layer drifts;
 * closed, every layer rests where play starts.
 */
(function (root) {
    'use strict';
    const tt = (text) => (root.I18n ? root.I18n.tText(text) : text);
    const keyed = (key) => (root.I18n ? root.I18n.t(key) : key);
    const RUNTIME_FILE = 'reactor_image_layers.js';
    const TOOL = 'imageLayers';
    // The CSS blend closest to each of the game's.
    const CSS_BLEND = { normal: 'normal', add: 'plus-lighter', multiply: 'multiply', screen: 'screen' };
    const BLOCKED_COLOR = 0xff4040;
    const ICONS = {
        eye: '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8Z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><circle cx="8" cy="8" r="2" fill="currentColor"/></svg>',
        eyeOff: '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8Z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round" opacity="0.45"/><path d="M3 13 13 3" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
        up: '<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="M3.5 10 8 5.5l4.5 4.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
        down: '<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="M3.5 6 8 10.5 12.5 6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
        remove: '<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>'
    };

    class MapImageLayersManager {
        constructor(projectController, databaseManager) {
            this.projectController = projectController;
            this.databaseManager = databaseManager;
            this.session = new RRMapImageLayers.Session();
            this.session.onStep = () => this._afterHistory();
            this.panel = null;
            this.selectedId = 0;
            // Seconds the drift preview has run; 0 is the start of play.
            this.clock = 0;
            this._frame = null;
            this._flat = [];
            // What the flat view was last built from, entry for entry: an edit that leaves it standing sets its nodes and builds nothing.
            this._flatBuilt = null;
            this._flatToken = 0;
            this._screen = [];
            this._sizes = new Map();
            this._grids = new Map();
            this._origin = { x: 0, y: 0 };
            this._cam = { x: 0, y: 0 };
            this._shown = { width: 816, height: 624 };
            this._open = { shown: true, versions: null };
            // The control that takes the keyboard when the panel is next drawn (a picture or a switch was just chosen).
            this._wantFocus = null;
            this._tick = (now) => this._onFrame(now);
            // What waits to be drawn again ('panel', or 'words': the lines that quote a number) until the press or
            // the key that changed it is over. See _redrawSoon.
            this._due = null;
            this._settleTimer = null;
            // A mouse button is down: from the press until the click it makes has been handled.
            this._pressed = false;
            this._press = () => { this._pressed = true; };
            // A drag of a slider or a held arrow of a number field is one undo step: it ends when the button comes up.
            this._release = () => { this.session.endGesture(); this._pressed = false; if (this._due) this._settleSoon(); };
            this._keyUp = () => { if (this._due) this._settleSoon(); };
            // Opened over the Build bar, the tool leaves the bar up. A click on the bar or its panel is a return
            // to building: the tool closes first, so the builder has the map again when the click reaches its slot.
            this._handBack = (event) => {
                if (root.reactor?.mapTool === TOOL && event.target?.closest?.('#build-hotbar, #build-panel')) this.close();
            };
            if (projectController) projectController.mapImageLayersManager = this;
            if (typeof window !== 'undefined') {
                window.addEventListener('rr-language-changed', () => { if (this.panel) this.render(); });
                window.addEventListener('resize', () => { if (this._screen.length) this._placeScreen(); });
                document.addEventListener('visibilitychange', () => this._syncClock());
            }
        }

        //---------------------------------------------------------------------
        // The map, the project and the runtime

        tilemap() { return this.projectController?.tilemapManager || null; }
        map() { return this.tilemap()?.currentMap || null; }
        /** The 3D view's input surface: in the map's stage exactly while the 3D view is up. */
        view3DSurface() { return typeof document !== 'undefined' ? document.querySelector('#canvas-container > #map-3d-input') : null; }
        /** Whether the game draws this map in 3D. */
        is3DMap(map = this.map()) { return !!(map && typeof RRMapElevation !== 'undefined' && RRMapElevation.hasNote(map)); }
        system() { return this.databaseManager?.getSystem?.() || null; }
        names() { return RRMapImageLayers.namesFrom(this.system()); }
        tile() { const tm = this.tilemap(); return { width: tm?.TILE_WIDTH || 48, height: tm?.TILE_HEIGHT || tm?.TILE_WIDTH || 48 }; }
        mapSize(map = this.map()) { const tile = this.tile(); return { width: (map?.width || 0) * tile.width, height: (map?.height || 0) * tile.height }; }
        gameScreen() { const a = this.system()?.advanced || {}; return { width: Number(a.screenWidth) || 816, height: Number(a.screenHeight) || 624 }; }
        folder() { return this.projectController?.parallaxFolder?.() || null; }
        /**
         * The pictures in img/parallaxes. One edit asks several times, so the folder is read once per moment;
         * a drag of a slider or a held arrow lasts longer than that and reads nothing: it keeps the reading it began with.
         */
        files() {
            const folder = this.folder();
            if (!folder || typeof RRAssetFiles === 'undefined') return [];
            const now = typeof performance !== 'undefined' ? performance.now() : 0, kept = this._listing;
            if (kept && kept.folder === folder && (now - kept.at < 250 || this.session._gesture)) return kept.files;
            let files = [];
            try { files = RRAssetFiles.listImageReferences(folder); } catch (error) { console.error('Error reading parallaxes folder:', error); }
            this._listing = { folder, at: now, files, names: null, urls: new Map() };
            return files;
        }
        /** The names in img/parallaxes as a set, made once per reading of the folder. */
        have() {
            const files = this.files(), kept = this._listing;
            if (!kept || kept.files !== files) return new Set(files);
            return kept.names || (kept.names = new Set(files));
        }
        /**
         * The address of a picture. Finding it asks the disk several times, and every redraw asks for every
         * layer, so an address is found once per reading of the folder and nothing is asked while a layer scrolls.
         */
        urlOf(name) {
            const folder = this.folder();
            if (!folder || !name || typeof RRAssetFiles === 'undefined') return '';
            if (!this._listing || this._listing.folder !== folder) this.files();
            const kept = this._listing && this._listing.folder === folder ? this._listing : null;
            if (kept && kept.urls.has(name)) return kept.urls.get(name);
            const url = RRAssetFiles.imageUrlFor(folder, name);
            if (kept) kept.urls.set(name, url);
            return url;
        }

        /** The game's own image layer rules, loaded once from the runtime the editor ships with. */
        ensureRuntime() {
            if (root.ReactorImageLayers) return Promise.resolve(true);
            if (!this._runtime) this._runtime = this._loadRuntime().then(ok => { if (!ok) this._runtime = null; return ok; });
            return this._runtime;
        }

        async _loadRuntime() {
            const script = (url, label) => new Promise((resolve, reject) => {
                const element = document.createElement('script');
                element.src = url;
                element.dataset.rrSource = label;
                element.onload = resolve;
                element.onerror = () => { element.remove(); reject(new Error(`Could not load ${label}`)); };
                document.head.appendChild(element);
            });
            try {
                const host = root.RPGReactorWebHost;
                if (host?.mode === 'web' && host.projectRoot && typeof host.assetUrl === 'function') {
                    const url = `${String(host.projectRoot).replace(/\/+$/, '')}/js/${RUNTIME_FILE}`;
                    await script(host.assetUrl(url), url);
                } else {
                    const runtimePath = this.projectController?.projectManager?.getRuntimePath?.();
                    if (!runtimePath || typeof require !== 'function') return false;
                    const fs = require('fs'), full = require('path').join(runtimePath, RUNTIME_FILE);
                    if (!fs.existsSync(full)) return false;
                    const url = URL.createObjectURL(new Blob([fs.readFileSync(full, 'utf8') + '\n//# sourceURL=' + full], { type: 'text/javascript' }));
                    try { await script(url, full); } finally { URL.revokeObjectURL(url); }
                }
            } catch (error) {
                console.warn('Image layers:', error);
            }
            return !!root.ReactorImageLayers;
        }

        //---------------------------------------------------------------------
        // The tool

        toggle() { if (this.panel) this.close(); else this.open(); }

        async open() {
            const map = this.map();
            if (!map || this.panel || this._opening) return false;
            this._opening = true;
            let ready = false;
            try { ready = await this.ensureRuntime(); } finally { this._opening = false; }
            if (!ready || this.map() !== map) {
                if (!ready) this._alert(tt('Image Layers needs the runtime file reactor_image_layers.js.'));
                return false;
            }
            root.reactor?.claimMapTool?.(TOOL);
            this.session.bind(map);
            this._joinHistory();
            const panel = document.createElement('div');
            panel.className = 'lighting-panel rr-accent-scrollbar rr-image-layers-panel';
            panel.setAttribute('role', 'region');
            panel.setAttribute('aria-labelledby', 'rr-image-layers-title');
            if (!root.reactor?.mapSideDock?.()) panel.classList.add('is-floating');
            this.panel = panel;
            if (!root.reactor?.dockMapPanel?.(panel)) document.body.appendChild(panel);
            this._markButton(true);
            document.addEventListener('mousedown', this._press, true);
            document.addEventListener('mouseup', this._release, true);
            document.addEventListener('keyup', this._keyUp, true);
            document.addEventListener('click', this._handBack, true);
            if (!this.session.layer(this.selectedId)) this.selectedId = this._topId();
            this.render();
            // The keyboard starts in the panel, at the first thing to do there.
            this._focus('add');
            this.syncHistoryButtons();
            this.refreshMap();
            return true;
        }

        close() {
            if (!this.panel) return;
            this._closeMenu();
            if (typeof RRMaterialPopup !== 'undefined') RRMaterialPopup.close();
            const panel = this.panel;
            this.panel = null;
            this._wantFocus = null;
            this._due = null;
            this._pressed = false;
            if (this._settleTimer !== null) { clearTimeout(this._settleTimer); this._settleTimer = null; }
            document.removeEventListener('mousedown', this._press, true);
            document.removeEventListener('mouseup', this._release, true);
            document.removeEventListener('keyup', this._keyUp, true);
            document.removeEventListener('click', this._handBack, true);
            if (root.reactor?.undockMapPanel) root.reactor.undockMapPanel(panel); else panel.remove();
            this._markButton(false);
            this.session.endGesture();
            // A look at a version ends with the tool: the map shows the start of play again.
            this.session.looking.clear();
            this._syncClock();
            this._drawMarks();
            this.refreshMap();
            const mapEditor = root.reactor?.mapEditor;
            root.reactor?.uiManager?.updateUndoRedoButtons?.(!!mapEditor?.canUndo?.(), !!mapEditor?.canRedo?.());
            root.reactor?.releaseMapTool?.(TOOL);
        }

        /** Something the author must know before the tool can go on, said in the editor's own dialog. */
        _alert(text) {
            const ui = root.reactor?.uiManager;
            if (ui?.showAlert) ui.showAlert(keyed('menu.imageLayers'), text);
            else root.RRDialog?.alert?.(text, { title: keyed('menu.imageLayers') });
        }

        /** The toolbar button shows whether the tool is in hand. */
        _markButton(on) {
            const button = document.querySelector('.tool-button[data-action="image-layers"]');
            button?.classList.toggle('active', on);
            button?.setAttribute('aria-pressed', String(on));
        }

        /** The map's one undo history takes this tool's steps in the order they were made. */
        _joinHistory() {
            const history = root.reactor?.mapHistory;
            if (history?.register) history.register(TOOL, { object: this.session, label: () => 'Image Layer', settle: () => this.session.endGesture() });
        }

        syncHistoryButtons() {
            if (this.panel) root.reactor?.uiManager?.updateUndoRedoButtons?.(this.session.canUndo(), this.session.canRedo());
        }

        /** An undo or a redo changed the list, from this panel or from another tool's. */
        _afterHistory() {
            if (!this.session.layer(this.selectedId)) this.selectedId = this._topId();
            if (this.panel) this.render();
            this.syncHistoryButtons();
            this.refreshMap();
        }

        _topId() {
            const layers = this.session.layers(), first = root.ReactorImageLayers ? RRMapImageLayers.order(layers)[0] : undefined;
            return first === undefined ? 0 : this.session.idOf(layers[first]);
        }

        //---------------------------------------------------------------------
        // Edits

        /** Change the selected layer. A `gesture` name makes the changes of one drag a single step. */
        edit(patch, gesture = null) {
            if (!this.session.change(this.selectedId, patch, gesture)) return false;
            this.syncHistoryButtons();
            this.refreshMap();
            return true;
        }

        /** A one-shot change: on the map, and the panel shows what was kept. */
        commit(patch) {
            this.session.endGesture();
            if (!this.edit(patch)) return false;
            this.render();
            return true;
        }

        addLayer(key, picture) {
            if (!picture) return 0;
            const id = this.session.add(RRMapImageLayers.make(key, picture));
            if (!id) return 0;
            this.selectedId = id;
            // The picture grid had the keyboard and is gone: the new layer's row takes it.
            this._wantFocus = `pick-${id}`;
            this.render();
            this.syncHistoryButtons();
            this.refreshMap();
            return id;
        }

        removeLayer(id) {
            const listed = this._listedIds(), at = listed.indexOf(id);
            if (!this.session.remove(id)) return false;
            if (this.selectedId === id) this.selectedId = listed[at + 1] || listed[at - 1] || 0;
            this.render();
            this.syncHistoryButtons();
            this.refreshMap();
            return true;
        }

        moveLayer(id, direction) {
            if (!this.session.move(id, direction)) return false;
            this.render();
            this.syncHistoryButtons();
            this.refreshMap();
            return true;
        }

        select(id) {
            if (this.selectedId === id) return;
            this.session.endGesture();
            this.selectedId = id;
            this.render();
            this._drawMarks();
        }

        setHidden(id, hidden) {
            this.session.setHidden(id, hidden);
            this.render();
            this._drawMarks();
            this.refreshMap();
        }

        _listedIds() {
            const layers = this.session.layers();
            return RRMapImageLayers.order(layers).map(index => this.session.idOf(layers[index]));
        }

        //---------------------------------------------------------------------
        // The panel

        _el(tag, className, text) {
            const el = document.createElement(tag);
            if (className) el.className = className;
            if (text !== undefined) el.textContent = text;
            return el;
        }

        _iconButton(className, icon, label, onClick) {
            const button = this._el('button', `rr-image-layer-icon ${className}`);
            button.type = 'button';
            button.innerHTML = ICONS[icon];
            button.title = label;
            button.setAttribute('aria-label', label);
            button.addEventListener('click', (event) => { event.stopPropagation(); onClick(); });
            return button;
        }

        render() {
            const panel = this.panel;
            if (!panel) return;
            const R = root.ReactorImageLayers, map = this.map();
            if (!R || !map) return;
            if (typeof RRMaterialPopup !== 'undefined') RRMaterialPopup.close();
            this._closeMenu();
            this._due = null;
            // The control in hand keeps the keyboard when the panel is drawn again, unless another was named to take it.
            const active = document.activeElement, focusKey = this._wantFocus || (panel.contains(active) ? active.getAttribute('data-focus') : null);
            this._wantFocus = null;
            const scroll = panel.scrollTop;
            panel.replaceChildren();
            const is3D = this.is3DMap(map), files = this.files();

            const head = this._el('div', 'rr-image-layers-head');
            const title = this._el('div', 'rr-image-layers-title', keyed('menu.imageLayers'));
            title.id = 'rr-image-layers-title';
            const close = this._el('button', 'rr-btn-secondary rr-image-layers-close', '×');
            close.type = 'button';
            close.setAttribute('aria-label', tt('Close'));
            close.setAttribute('data-rr-i18n-skip', '');
            close.addEventListener('click', () => this.close());
            head.append(title, close);
            panel.append(head);
            panel.append(this._el('div', 'lit-note rr-image-layers-about', tt('Pictures drawn with this map: a painted map, fog, clouds, a far background, a screen overlay.')));

            const add = this._el('button', 'rr-button-primary rr-image-layer-add', tt('Add Layer…'));
            add.type = 'button';
            add.setAttribute('aria-haspopup', 'menu');
            add.setAttribute('data-focus', 'add');
            add.addEventListener('click', () => this._openMenu(add));
            panel.append(add);

            panel.append(this._listCard(map, is3D, files));
            const selected = this.session.layer(this.selectedId);
            if (selected) panel.append(this._settingsCard(selected, map, is3D, files));

            // The themed steppers wrap the number fields now, so the focus given back below is not lost to the wrapping.
            root.RRNumberSteppers?.enhanceAll?.(panel);
            panel.scrollTop = scroll;
            if (focusKey) this._focus(focusKey);
        }

        /** Give the keyboard to a control of the panel, by the name it carries. */
        _focus(key) {
            let target = this.panel ? this.panel.querySelector(`[data-focus="${key}"]`) : null;
            // A Move button that reached the end is disabled: the keyboard goes to the other one, else to its row.
            if (target?.disabled) {
                const row = target.closest('.rr-image-layer-item');
                target = row?.querySelector('.rr-image-layer-up:not(:disabled), .rr-image-layer-down:not(:disabled)') || row?.querySelector('.rr-image-layer-pick');
            }
            target?.focus({ preventScroll: true });
            return !!target;
        }

        /**
         * Something was chosen in a window or a grid that took the keyboard and is now gone: `key` names the
         * control that gets it back, whether or not the choice redrew the panel.
         */
        _after(key, choose) {
            this._wantFocus = key;
            choose();
            if (this._wantFocus === key) { this._wantFocus = null; this._focus(key); }
        }

        /**
         * Words into an element. A name the words quote (marked as one piece by RRMapImageLayers.ltr and .own)
         * becomes an element of its own: it reads in its own direction in a right-to-left language, and a
         * picture's name is not broken across two lines while it fits on one.
         */
        _say(element, text) {
            const parts = String(text).split(/([\u2066\u2068][^\u2069]*\u2069)/);
            if (parts.length === 1) { element.textContent = parts[0]; return element; }
            element.textContent = '';
            for (const part of parts) {
                if (!part) continue;
                const mark = part.charCodeAt(0);
                if (mark !== 0x2066 && mark !== 0x2068) { element.append(part); continue; }
                const name = this._el('bdi', mark === 0x2066 ? 'rr-image-layer-word is-file' : 'rr-image-layer-word', part.slice(1, -1));
                if (mark === 0x2066) name.setAttribute('dir', 'ltr');
                element.append(name);
            }
            return element;
        }

        /**
         * Draw again, later. A number is taken when its field is left, and the field is left by the press or
         * the key that goes to another control: while that is under way the page must stay as it is, or the
         * click lands on a control that is gone and the keyboard with it. So the number is put on the map at
         * once and shown where it stands, and what else quotes it is drawn when the press or key is over:
         * `what` is 'panel' (all of it) or 'words' (the lines that say a layer's conditions).
         */
        _redrawSoon(what) {
            if (what === 'panel' || !this._due) this._due = what;
            this._settleSoon();
        }

        _settleSoon() {
            if (this._settleTimer !== null) return;
            this._settleTimer = setTimeout(() => { this._settleTimer = null; this._settle(); }, 0);
        }

        /**
         * Draw what is due, unless a button is down or a list or a window of the tool's is open over the
         * panel: the release, or the key that closes it, tries again.
         */
        _settle() {
            const due = this._due;
            if (!due || !this.panel) { this._due = null; return; }
            if (this._pressed || this._busy()) return;
            this._due = null;
            if (due === 'panel') this.render(); else this._refreshWords();
        }

        /** Whether the Add menu, the picture grid, a list of the panel or the switch and variable window is open. */
        _busy() {
            return !!this._menu || (typeof RRMaterialPopup !== 'undefined' && RRMaterialPopup.isOpen())
                || !!document.querySelector('.rr-shim-popup, .switch-variable-picker-modal');
        }

        /**
         * The list and the Shown line say a layer's conditions in words. After a number in them changed, the
         * selected layer's are written again where they stand: no row and no button is put in another's place.
         */
        _refreshWords() {
            const panel = this.panel, layer = this.session.layer(this.selectedId);
            if (!panel || !layer) return;
            const names = this.names();
            const item = panel.querySelector(`.rr-image-layer-item[data-layer="${this.selectedId}"]`);
            const text = item ? item.querySelector('.rr-image-layer-text') : null;
            if (text) {
                const words = RRMapImageLayers.rowLines(layer, names, this.is3DMap());
                const lines = Array.from(text.children).filter(child => child.classList.contains('rr-image-layer-line'));
                const warning = lines.find(line => line.classList.contains('rr-image-layer-warning')) || null;
                const said = lines.filter(line => line !== warning);
                words.lines.forEach((line, at) => this._say(said[at] || text.insertBefore(this._el('span', 'rr-image-layer-line'), warning), line));
                for (const line of said.slice(words.lines.length)) line.remove();
                item.querySelector('.rr-image-layer-pick').title = [words.title, ...words.lines, warning ? warning.textContent : ''].filter(Boolean).join('\n');
            }
            const meta = panel.querySelector('.rr-image-layer-shown-meta');
            if (meta) {
                const shown = RRMapImageLayers.conditionWords(layer, names);
                this._say(meta, shown.length ? shown.join(' · ') : tt('Always'));
            }
        }

        _section(titleText, meta) {
            const section = this._el('div', 'lit-section');
            const header = this._el('div', 'lit-section-header');
            header.append(this._el('span', '', titleText));
            const metaHost = this._el('span', 'lit-section-meta', meta || '');
            metaHost.setAttribute('data-rr-i18n-skip', '');
            header.append(metaHost);
            const body = this._el('div', 'lit-section-body');
            section.append(header, body);
            return { section, body };
        }

        _listCard(map, is3D, files) {
            // The rows are the layers: an entry of the stored list that is no layer has none.
            const layers = this.session.layers(), names = this.names(), listed = RRMapImageLayers.order(layers);
            const card = this._section(tt('Layers'), String(listed.length));
            card.section.classList.add('rr-image-layer-list-card');
            if (!listed.length) {
                card.body.append(this._el('div', 'lit-empty', tt('No image layers on this map yet. Add Layer makes the first one.')));
                return card.section;
            }
            const list = this._el('div', 'rr-image-layer-list');
            const have = new Set(files);
            for (const index of listed) {
                const layer = layers[index], id = this.session.idOf(layer), hidden = this.session.isHidden(layer);
                const words = RRMapImageLayers.rowLines(layer, names, is3D);
                const item = this._el('div', 'rr-image-layer-item' + (id === this.selectedId ? ' is-selected' : '') + (hidden ? ' is-hidden' : ''));
                item.setAttribute('data-rr-i18n-skip', '');
                item.dataset.layer = String(id);
                item.append(this._iconButton('rr-image-layer-eye', hidden ? 'eyeOff' : 'eye',
                    hidden ? tt('Show on the map (in the editor only)') : tt('Hide on the map (in the editor only)'), () => this.setHidden(id, !hidden)));
                item.lastChild.setAttribute('aria-pressed', String(!hidden));
                item.lastChild.setAttribute('data-focus', `eye-${id}`);

                const pick = this._el('button', 'rr-image-layer-pick');
                pick.type = 'button';
                pick.setAttribute('data-focus', `pick-${id}`);
                if (id === this.selectedId) pick.setAttribute('aria-current', 'true');
                const thumb = this._el('span', 'rr-image-layer-thumb rr-dark-surface');
                this._showPicture(thumb, layer.name);
                const text = this._el('span', 'rr-image-layer-text');
                text.append(this._el('span', 'rr-image-layer-name' + (layer.name ? ' rr-image-layer-file' : ''), words.title));
                for (const line of words.lines) text.append(this._say(this._el('span', 'rr-image-layer-line'), line));
                const problem = words.warning || (layer.name && !have.has(layer.name) ? tt('This picture is not in img/parallaxes.') : '');
                if (problem) text.append(this._el('span', 'rr-image-layer-line rr-image-layer-warning', problem));
                pick.title = [words.title, ...words.lines, problem].filter(Boolean).join('\n');
                pick.append(thumb, text);
                pick.addEventListener('click', () => this.select(id));
                item.append(pick);

                const up = this._iconButton('rr-image-layer-up', 'up', tt('Move up'), () => this.moveLayer(id, -1));
                up.disabled = !this.session.canMove(id, -1);
                up.setAttribute('data-focus', `up-${id}`);
                const down = this._iconButton('rr-image-layer-down', 'down', tt('Move down'), () => this.moveLayer(id, 1));
                down.disabled = !this.session.canMove(id, 1);
                down.setAttribute('data-focus', `down-${id}`);
                const remove = this._iconButton('rr-image-layer-remove', 'remove', tt('Remove this layer'), () => this.removeLayer(id));
                item.append(up, down, remove);
                list.append(item);
            }
            card.body.append(list);
            card.body.append(this._el('div', 'lit-note', tt('The top row is drawn on top. Layers of the same depth stack in this order.')));
            return card.section;
        }

        /** A row on the label | field grid. */
        _row(label, ...controls) {
            const row = this._el('div', 'lit-row rr-image-layer-row');
            row.append(this._el('span', 'rr-image-layer-label', label));
            const field = this._el('div', 'rr-image-layer-field');
            field.append(...controls.filter(Boolean));
            row.append(field);
            return row;
        }

        /**
         * A row with one list. The list stands beside its label while the entry it shows fits there; a longer
         * entry (some languages' words are) puts the list under the label at the card's width, so it is read whole.
         */
        _listRow(label, focus, options, value, onChange) {
            const select = this._select(options, value, label, onChange);
            select.setAttribute('data-focus', focus);
            const row = this._row(label, select);
            row.classList.add('is-list');
            return row;
        }

        /** A line of plain words under a row, in the field column. */
        _hint(text, className = '') {
            const row = this._el('div', 'lit-row rr-image-layer-row');
            row.append(this._el('span', ''));
            const hint = this._el('div', 'rr-image-layer-hint ' + className, text);
            hint.setAttribute('data-rr-i18n-skip', '');
            row.append(hint);
            return row;
        }

        _select(options, value, label, onChange) {
            const select = this._el('select', 'lit-select');
            select.setAttribute('aria-label', label);
            // A fourth entry is a few words shown under the option in the list.
            for (const [optionValue, text, disabled, words] of options) {
                const option = this._el('option', '', text);
                option.value = String(optionValue);
                if (disabled) option.disabled = true;
                if (words) option.title = words;
                select.append(option);
            }
            select.value = String(value);
            select.addEventListener('change', () => onChange(select.value));
            return select;
        }

        /**
         * A number field: every keystroke shows on the map. One visit to the field is one undo step, and so is
         * one held arrow (the themed stepper sends a change for every repeat, so a change does not end the
         * step: leaving the field, Enter, the arrow key or the mouse button coming up does). A field left empty
         * takes back the number it had. Nothing on the panel is put in another's place when the field is left:
         * the click that left it lands on what it was aimed at.
         */
        _number(value, { min, max, step = 1, label, width = 60, focus }, read) {
            const input = this._el('input', 'lit-input');
            input.type = 'number';
            if (min !== undefined) input.min = String(min);
            if (max !== undefined) input.max = String(max);
            input.step = String(step);
            input.value = String(value);
            input.style.width = width + 'px';
            input.setAttribute('aria-label', label);
            if (focus) input.setAttribute('data-focus', focus);
            const gesture = focus || label;
            let kept = Number(value) || 0;
            /** The number in the field, inside its limits; null while the field holds none. */
            const typed = () => {
                const text = String(input.value).trim();
                let n = text === '' || text === '-' ? NaN : Number(text);
                if (!Number.isFinite(n)) return null;
                if (min !== undefined) n = Math.max(min, n);
                if (max !== undefined) n = Math.min(max, n);
                return n;
            };
            const apply = () => {
                const n = typed();
                if (n === null) return;
                kept = n;
                this.edit(read(n), gesture);
            };
            input.addEventListener('input', apply);
            // The field shows what was kept; the words that quote the number are written again once the press or the
            // key that left the field is over.
            input.addEventListener('change', () => { apply(); input.value = String(kept); this._redrawSoon('words'); });
            // Only this field's own step: the stepper of another field gives that field the keyboard after its first change.
            const done = () => this.session.endGesture(gesture);
            input.addEventListener('blur', done);
            input.addEventListener('keyup', (event) => { if (event.key === 'Enter' || event.key === 'ArrowUp' || event.key === 'ArrowDown') done(); });
            return input;
        }

        _unit(text) {
            const unit = this._el('span', 'rr-image-layer-unit', text);
            unit.setAttribute('data-rr-i18n-skip', '');
            return unit;
        }

        /**
         * The field of a chosen switch or variable: "0012: Chapter", or a muted None. It wears the look of the
         * panel's lists, and a click opens the editor's own switch and variable picker.
         */
        _reference(kind, id, onPick, focus) {
            const names = this.names();
            const button = this._el('button', 'rr-image-layer-reference' + (id ? '' : ' is-empty'));
            button.type = 'button';
            button.setAttribute('data-focus', focus);
            button.setAttribute('data-rr-i18n-skip', '');
            button.setAttribute('aria-haspopup', 'dialog');
            const text = id ? (kind === 'switch' ? names.switchLabel(id) : names.variableLabel(id)) : tt('None');
            const hint = kind === 'switch' ? tt('Choose a switch') : tt('Choose a variable');
            button.title = id ? `${text}\n${hint}` : hint;
            button.setAttribute('aria-label', `${hint}: ${text}`);
            const caret = this._el('span', 'rr-image-layer-reference-caret', '▼');
            caret.setAttribute('aria-hidden', 'true');
            button.append(this._el('span', 'rr-image-layer-reference-label' + (id ? ' rr-image-layer-own' : ''), text), caret);
            button.addEventListener('click', () => this._pick(kind, id, onPick, focus));
            return button;
        }

        /** The editor's own switch and variable window. What is chosen there lands in the field named by `focus`, and so does the keyboard. */
        _pick(kind, id, onPick, focus) {
            if (typeof SwitchVariablePicker === 'undefined') return;
            const picker = new SwitchVariablePicker(this.databaseManager, this.projectController);
            picker.show(kind, id || 1, (selectedId) => { if (selectedId) this._after(focus, () => onPick(selectedId)); });
        }

        /** A condition's tick box with its words: ticking it opens the picker, clearing it removes the condition. */
        _toggle(text, on, focus, onTick, onClear) {
            const label = this._el('label', 'rr-image-layer-toggle');
            const box = this._el('input', '');
            box.type = 'checkbox';
            box.checked = !!on;
            box.setAttribute('data-focus', focus);
            box.addEventListener('change', () => { if (box.checked) { box.checked = false; onTick(); } else onClear(); });
            label.append(box, this._el('span', '', text));
            return label;
        }

        /** A card that opens and closes. `sentence` says its state is a sentence: it gets a line of its own under the title, whole. */
        _group(titleText, meta, key, open, sentence = false) {
            const group = this._el('details', 'lit-group rr-image-layer-group');
            group.open = open;
            const summary = this._el('summary', 'lit-group-title');
            summary.append(this._el('span', '', titleText));
            const metaHost = this._say(this._el('span', `rr-image-layer-group-meta rr-image-layer-${key}-meta` + (sentence ? ' is-sentence' : '')), meta);
            metaHost.setAttribute('data-rr-i18n-skip', '');
            summary.append(metaHost);
            summary.setAttribute('data-focus', `group-${key}`);
            const body = this._el('div', 'lit-group-body');
            group.append(summary, body);
            group.addEventListener('toggle', () => { if (group.isConnected) this._open[key] = group.open; });
            return { group, body };
        }

        _settingsCard(layer, map, is3D, files) {
            const R = root.ReactorImageLayers, M = RRMapImageLayers, names = this.names();
            const record = R.normalize(layer), rows = M.rows(layer, is3D), has = (row) => rows.includes(row);
            const card = this._section(tt('Layer'), record.name);
            card.section.querySelector('.lit-section-meta').classList.add('rr-image-layer-file');
            const body = card.body;
            body.classList.add('rr-image-layer-settings');

            const note = M.note3D(layer, is3D);
            if (note) body.append(this._el('div', 'rr-image-layer-notice', note.text));

            // Picture: one large tile, chosen from a grid. Its name lies under the picture, whole.
            const holder = this._el('div', 'rr-image-layer-picture');
            holder.setAttribute('data-rr-i18n-skip', '');
            holder.innerHTML = RRMaterialPopup.tile({ cls: 'rr-image-layer-tile', value: record.name, url: this.urlOf(record.name), blank: tt('(None)'), attrs: 'data-focus="picture"' });
            const tile = holder.firstElementChild, face = tile.querySelector('.rr-material-tile-face');
            face.classList.add('rr-image-layer-face', 'rr-dark-surface');
            face.style.backgroundImage = '';
            this._showPicture(face, record.name);
            if (record.name) tile.querySelector('.rr-material-tile-name').classList.add('rr-image-layer-file');
            tile.setAttribute('aria-label', tt('Picture'));
            tile.title = record.name;
            tile.addEventListener('click', () => this._choosePicture(tile, record.name, record.fit === 'map', (name) => this._after('picture', () => this.commit({ name }))));
            body.append(this._row(tt('Picture'), holder));
            const size = this._sizeRow(layer, map);
            if (size) body.append(size);

            body.append(this._listRow(tt('Depth'), 'depth', R.POSITIONS.map(position => [position, M.depthLabel(position)]), record.layer, (value) => this.commit({ layer: value })));
            const ownDepth = M.depthNote(layer);
            if (ownDepth) body.append(this._hint(ownDepth));

            // Each placement says in a few words what it is for; one that this depth cannot take is disabled and says why.
            const placements = R.FITS.map(fit => { const allowed = M.fitAllowed(record.layer, fit); return [fit, M.fitLabel(fit), !allowed, allowed ? M.fitWords(fit) : M.fitBlocked()]; });
            body.append(this._listRow(tt('Placement'), 'placement', placements, record.fit, (value) => this.commit({ fit: value })));
            body.append(this._hint(M.fitHint(record.fit)));
            if (has('solid')) {
                body.append(this._hint(M.fill(tt('{depth} needs a picture locked to the map. Its solid parts stop movement, and the tiles it blocks are marked on the map.'), { depth: M.depthLabel('same') })));
                body.append(this._hint(tt('Draw what should block at least 3 pixels thick. A thinner line blocks in some places and not in others.')));
            }

            if (has('repeats')) {
                body.append(this._listRow(M.repeatsLabel(), 'repeats', R.REPEATS.map(repeat => [repeat, M.repeatLabel(repeat), false, M.repeatHint(repeat)]), record.repeat,
                    (value) => this.commit({ repeat: value })));
                body.append(this._hint(M.repeatHint(record.repeat)));
            }
            if (has('drift')) {
                // A layer scrolls only in a direction it repeats in: the other number has no field.
                const speed = (axis, word, focus) => this._number(record.drift[axis], { min: -999, max: 999, label: `${tt('Scroll Speed')}: ${word}`, width: 52, focus }, (n) => {
                    const drift = R.normalize(this.session.layer(this.selectedId)).drift.slice();
                    drift[axis] = n;
                    return { drift };
                });
                const across = record.repeat !== 'y' ? [this._unit('→'), speed(0, tt('Right'), 'drift-x')] : [];
                const down = record.repeat !== 'x' ? [this._unit('↓'), speed(1, tt('Down'), 'drift-y')] : [];
                body.append(this._row(tt('Scroll Speed'), ...across, ...down, this._unit('px/s')));
                body.lastChild.classList.add('rr-image-layer-scroll');
                body.append(this._hint(M.scrollHint(record.repeat)));
            }
            if (has('follow')) {
                body.append(this._row(tt('Moves with the map'),
                    this._number(Math.round(record.follow * 100), { min: 0, max: 400, step: 5, label: tt('Moves with the map'), width: 64, focus: 'follow' }, (n) => ({ follow: n / 100 })), this._unit('%')));
                body.append(this._hint(tt('100 lies on the map, 0 stays on the screen, 50 looks far away.')));
            }

            // Opacity: a slider with its percent, one undo step for the whole drag.
            const percent = Math.round(record.opacity / 255 * 100);
            const slider = this._el('div', 'lit-ambient-slider');
            const range = this._el('input', '');
            range.type = 'range'; range.min = '0'; range.max = '100'; range.step = '1'; range.value = String(percent);
            range.setAttribute('aria-label', tt('Opacity'));
            range.setAttribute('data-focus', 'opacity');
            const paint = () => range.style.setProperty('--rr-fill', range.value + '%');
            paint();
            const readout = this._unit(percent + '%');
            range.addEventListener('input', () => { paint(); readout.textContent = range.value + '%'; this.edit({ opacity: Math.round(Number(range.value) * 2.55) }, 'opacity'); });
            range.addEventListener('change', () => this.session.endGesture());
            slider.append(range, readout);
            body.append(this._row(tt('Opacity'), slider));

            body.append(this._listRow(tt('Blend Mode'), 'blend', R.BLENDS.map((name, index) => [index, M.blendLabel(name)]), record.blendMode, (value) => this.commit({ blendMode: Number(value) })));

            body.append(this._shownGroup(layer, record, names, has('fade')));
            body.append(this._versionsGroup(layer, record, names, files));
            return card.section;
        }

        /** The line under the picture of a layer locked to the map: the map's size, or both sizes when the picture's differs. */
        _sizeRow(layer, map) {
            const name = root.ReactorImageLayers.normalize(layer).name;
            const size = RRMapImageLayers.sizeNote(layer, this._sizeOf(name), this.mapSize(map));
            if (!size) return null;
            const row = this._hint(size.text, size.warning ? 'rr-image-layer-warning' : '');
            row.classList.add('rr-image-layer-size');
            return row;
        }

        /** A picture's size has just been read: only the line that quotes it is drawn again, so an open menu or grid stays open. */
        _refreshSize() {
            const layer = this.session.layer(this.selectedId), map = this.map();
            const old = this.panel ? this.panel.querySelector('.rr-image-layer-size') : null;
            const next = old && layer && map ? this._sizeRow(layer, map) : null;
            if (next) old.replaceWith(next);
        }

        /** One line of a condition: its tick box with its words, or (`under`) the fields that belong to it, set in under the words. */
        _conditionRow(under, ...controls) {
            const row = this._row('', ...controls);
            row.classList.add('rr-image-layer-condition');
            if (under) row.classList.add('is-under');
            return row;
        }

        /**
         * Shown: always, or while a switch is ON and a variable passes a test, as an event page's conditions
         * read. A condition's field has a line to itself, so a switch's or variable's name is read whole.
         */
        _shownGroup(layer, record, names, fade) {
            const R = root.ReactorImageLayers, M = RRMapImageLayers;
            const words = M.conditionWords(layer, names);
            const { group, body } = this._group(tt('Shown'), words.length ? words.join(' · ') : tt('Always'), 'shown', this._open.shown !== false, words.length > 0);
            const setSwitch = (id) => this.commit({ switch: id });
            body.append(this._conditionRow(false, this._toggle(tt('While this switch is ON'), record.switch, 'switch-on', () => this._pick('switch', record.switch, setSwitch, 'switch'), () => this.commit({ switch: 0 }))));
            body.append(this._conditionRow(true, this._reference('switch', record.switch, setSwitch, 'switch')));

            const when = record.when;
            // Read from the layer as it is now: the value beside it may have been typed since the panel was drawn.
            const setWhen = (patch) => this.commit({ when: Object.assign({ variable: 1, op: '>=', value: 1 }, R.normalize(this.session.layer(this.selectedId)).when, patch) });
            const setVariable = (id) => setWhen({ variable: id });
            body.append(this._conditionRow(false, this._toggle(tt('While this variable'), !!when, 'when-on', () => this._pick('variable', when ? when.variable : 0, setVariable, 'when'), () => this.commit({ when: null }))));
            body.append(this._conditionRow(true, this._reference('variable', when ? when.variable : 0, setVariable, 'when')));
            if (when) {
                const op = this._select(R.OPS.map(value => [value, M.opLabel(value)]), when.op, tt('While this variable'), (value) => setWhen({ op: value }));
                op.setAttribute('data-focus', 'when-op');
                const value = this._number(when.value, { min: -99999999, max: 99999999, label: tt('Value'), width: 72, focus: 'when-value' },
                    (n) => ({ when: Object.assign({}, R.normalize(this.session.layer(this.selectedId)).when, { value: Math.round(n) }) }));
                body.append(this._conditionRow(true, op, value));
            }
            if (fade) {
                body.append(this._row(tt('Fade'), this._number(record.fade, { min: 0, max: 60, step: 0.1, label: tt('Fade'), width: 64, focus: 'fade' }, (n) => ({ fade: Math.round(n * 100) / 100 })), this._unit(tt('seconds'))));
                body.append(this._hint(tt('How long the layer takes to appear and to disappear.')));
            }
            return group;
        }

        /**
         * Change the picture with a variable: a variable, then one row for each value that has a picture of
         * its own. Every other value shows the layer's own picture; it never hides the layer.
         */
        _versionsGroup(layer, record, names, files) {
            const M = RRMapImageLayers, on = !!record.variable;
            const open = this._open.versions === null ? on : this._open.versions;
            const { group, body } = this._group(tt('Change the picture with a variable'), on ? M.own(names.variableName(record.variable)) : tt('Off'), 'versions', open, on);
            body.append(this._el('div', 'lit-note', M.versionsIntro()));
            const setVariable = (id) => this.commit({ variable: id });
            body.append(this._conditionRow(false, this._toggle(tt('Variable'), on, 'versions-on', () => this._pick('variable', record.variable, setVariable, 'versions'), () => this.commit({ variable: 0 })),
                this._reference('variable', record.variable, setVariable, 'versions')));
            if (!on) return group;

            const rows = M.versionRows(layer), have = new Set(files), mapSized = record.fit === 'map';
            const list = this._el('div', 'rr-image-layer-version-list');
            list.setAttribute('data-rr-i18n-skip', '');
            for (const row of rows) list.append(this._versionRow(layer, row, have, mapSized));
            if (rows.length) body.append(list);

            const add = this._el('button', 'rr-btn-secondary rr-image-layer-version-add', tt('+ Add a picture'));
            add.type = 'button';
            add.setAttribute('data-focus', 'version-add');
            add.setAttribute('aria-haspopup', 'listbox');
            // The picture is chosen first; the row then has the next free number, which the author can change.
            add.addEventListener('click', () => this._choosePicture(add, '', mapSized,
                (name) => this._after('version-add', () => { const now = this.session.layer(this.selectedId); this.commit(M.setVersion(now, M.nextValue(now), name)); })));
            body.append(add);
            const rest = this._say(this._el('div', 'lit-note rr-image-layer-version-rest'), M.versionsRest(layer));
            rest.setAttribute('data-rr-i18n-skip', '');
            body.append(rest);

            // Numbered pictures that are not rows: an import's name pattern says them, and one button lists them.
            const found = M.found(layer, files), imported = M.importWords(layer);
            if (imported || (found && found.files.length)) {
                const box = this._el('div', 'rr-image-layer-versions');
                box.setAttribute('data-rr-i18n-skip', '');
                if (imported) box.append(this._say(this._el('div', ''), imported));
                if (found.words) box.append(this._say(this._el('div', found.files.length ? '' : 'rr-image-layer-warning'), found.words));
                if (found.files.length) {
                    const all = this._el('button', 'rr-btn-secondary rr-image-layer-version-listall', tt('List the pictures'));
                    all.type = 'button';
                    all.setAttribute('data-focus', 'version-listall');
                    all.title = tt('Makes a row for each of these pictures. After that the rows are all this layer shows.');
                    all.addEventListener('click', () => this._after('version-add', () => this.commit(M.listed(this.session.layer(this.selectedId), this.files()))));
                    box.append(all);
                }
                body.append(box);
            }

            // What the map shows while the tool is open: the layer's own picture, or the picture of a value.
            const choices = M.lookChoices(layer, files);
            if (!choices.some(choice => choice.value === this.session.lookAt(layer))) this.session.setLookAt(this.selectedId, 0);
            if (choices.length > 1) {
                // The layer's own picture is the entry "own" where value 0 has a row of its own.
                const entry = (value) => (value === null ? 'own' : String(value));
                const look = this._select(choices.map(choice => [entry(choice.value), choice.label]), entry(this.session.lookAt(layer)), tt('Look at'),
                    (value) => { this.session.setLookAt(this.selectedId, value === 'own' ? null : Number(value)); this.refreshMap(); });
                look.setAttribute('data-focus', 'look');
                look.setAttribute('data-rr-i18n-skip', '');
                // The list names pictures whole, so it has the card's width: its label stands over it.
                const row = this._row(tt('Look at'), look);
                row.classList.add('rr-image-layer-look');
                body.append(row);
                body.append(this._el('div', 'lit-note rr-image-layer-look-note', tt('Shows that picture on the map while this tool is open. It is not saved.')));
            }
            return group;
        }

        /**
         * One row of the pictures a variable chooses: "When it is [number] show", a button that takes the row
         * away, and under them the picture, as wide as the row. The words stand in the order the language has
         * them. A number is taken when the field is left or Enter is pressed, never while it is being typed: a
         * half-typed number must not land on another row's. An arrow of the field steps past the numbers
         * other rows have; a number typed onto another row's is refused, and the row says so.
         *
         * A number taken renumbers the row where it stands (`wear`): the field is left by the press or key
         * that goes to another control, and that control must still be there when the click arrives. The
         * rows' order and what else quotes the number are drawn when the press or key is over (_redrawSoon).
         */
        _versionRow(layer, row, have, mapSized) {
            const M = RRMapImageLayers;
            // The number the row is for now: everything the row does reads it here, so a renumbered row acts for its new number.
            let value = row.value;
            const item = this._el('div', 'rr-image-layer-version');
            const words = this._el('div', 'rr-image-layer-version-words');

            const number = this._el('input', 'lit-input rr-image-layer-version-value');
            number.type = 'number'; number.min = '-99999999'; number.max = '99999999'; number.step = '1';
            number.setAttribute('aria-label', tt('Value'));
            // As wide as its digits need (three at least) beside its arrows; the themed stepper around the field carries the width.
            const fit = () => {
                const box = number.parentNode && number.parentNode.classList.contains('rr-number-stepper') ? number.parentNode : number;
                box.style.width = `${34 + 7 * Math.max(3, String(number.value).trim().length)}px`;
            };

            const picture = this._el('button', 'rr-image-layer-version-picture');
            picture.type = 'button';
            picture.setAttribute('aria-haspopup', 'listbox');
            picture.setAttribute('aria-label', `${tt('Picture')}: ${row.name}`);
            const thumb = this._el('span', 'rr-image-layer-thumb rr-dark-surface');
            this._showPicture(thumb, row.name);
            const caret = this._el('span', 'rr-image-layer-reference-caret', '▼');
            caret.setAttribute('aria-hidden', 'true');
            picture.append(thumb, this._el('span', 'rr-image-layer-version-name rr-image-layer-file', row.name), caret);
            picture.addEventListener('click', () => this._choosePicture(picture, row.name, mapSized,
                (name) => this._after(`version-picture-${value}`, () => this.commit(M.setVersion(this.session.layer(this.selectedId), value, name)))));

            const remove = this._iconButton('rr-image-layer-version-remove', 'remove', tt('Remove this picture'),
                () => this._after('version-add', () => this.commit(M.removeVersion(this.session.layer(this.selectedId), value))));

            /** The row is for `next`: its number, its sentence, and the names the keyboard finds its controls by. */
            const wear = (next) => {
                value = next;
                item.dataset.value = String(value);
                item.title = M.plain(M.versionWords(value, row.name));
                number.value = String(value);
                number.setAttribute('data-focus', `version-${value}`);
                picture.setAttribute('data-focus', `version-picture-${value}`);
                remove.setAttribute('data-focus', `version-remove-${value}`);
                fit();
            };
            wear(value);

            // Typing and deleting say what they are; the field's arrows and the arrow keys change the number without either.
            let stepped = false;
            number.addEventListener('input', (event) => { stepped = !/^(insert|delete)/.test(event.inputType || ''); fit(); });
            // One visit to the field, or one held arrow, is one undo step, as for the panel's other number fields.
            const visit = Symbol('row number');
            const done = () => this.session.endGesture(visit);
            number.addEventListener('blur', done);
            number.addEventListener('keyup', (event) => { if (event.key === 'Enter' || event.key === 'ArrowUp' || event.key === 'ArrowDown') done(); });
            number.addEventListener('change', () => {
                const now = this.session.layer(this.selectedId), typed = M.versionValue(number.value);
                const moved = Number.isFinite(typed) ? M.moveVersion(now, value, typed, stepped) : null;
                stepped = false;
                let refused = item.querySelector('.rr-image-layer-version-refused');
                if (!moved) {
                    // Refused: the field takes its own number back, and the row says why, where the author is looking.
                    wear(value);
                    if (Number.isFinite(typed) && typed !== value) {
                        if (!refused) {
                            refused = this._el('div', 'rr-image-layer-version-problem rr-image-layer-version-refused rr-image-layer-warning');
                            refused.setAttribute('role', 'status');
                            item.append(refused);
                        }
                        refused.textContent = M.fill(tt('Another row already shows a picture for {value}.'), { value: typed });
                    }
                    return;
                }
                // The look follows the row it was on.
                if (this.session.lookAt(now) === value) this.session.setLookAt(this.selectedId, moved.value);
                if (!this.edit(moved.patch, visit)) return;
                if (refused) refused.remove();
                wear(moved.value);
                this._redrawSoon('panel');
            });

            for (const part of M.versionParts()) {
                if (part.slot === 'value') words.append(number);
                else if (part.text) words.append(this._el('span', 'rr-image-layer-version-word' + (part.mark ? ' is-mark' : ''), part.text));
            }
            // The picture comes after the words for the keyboard as for the eye; the stylesheet stands Remove at the end of the words' line.
            item.append(words, picture, remove);
            if (!have.has(row.name)) item.append(this._el('div', 'rr-image-layer-version-problem rr-image-layer-warning', tt('This picture is not in img/parallaxes.')));
            return item;
        }

        //---------------------------------------------------------------------
        // Add menu and picture popup

        _closeMenu() {
            const menu = this._menu;
            if (!menu) return;
            this._menu = null;
            document.removeEventListener('pointerdown', menu.away, true);
            document.removeEventListener('keydown', menu.key, true);
            menu.keys?.dispose?.();
            menu.element.remove();
            menu.anchor.setAttribute('aria-expanded', 'false');
        }

        /** The things Add makes; on a 3D map only those a 3D map draws. */
        _openMenu(anchor) {
            if (this._menu) { this._closeMenu(); return; }
            const map = this.map(), is3D = this.is3DMap(map), size = this.mapSize(map);
            const element = this._el('div', 'rr-image-layer-menu');
            element.setAttribute('role', 'menu');
            element.setAttribute('data-rr-i18n-skip', '');
            for (const choice of RRMapImageLayers.choices(is3D)) {
                const row = this._el('button', 'rr-image-layer-menu-row');
                row.type = 'button';
                row.setAttribute('role', 'menuitem');
                row.dataset.choice = choice.key;
                row.append(this._el('span', 'rr-image-layer-menu-label', choice.label), this._el('span', 'rr-image-layer-menu-hint', choice.hint));
                row.addEventListener('click', () => { this._closeMenu(); this._chooseForAdd(anchor, choice.key); });
                element.append(row);
            }
            const foot = is3D ? tt('A 3D map shows layers placed on the screen, above characters.')
                : RRMapImageLayers.fill(tt('A picture locked to the map must be as large as the map: {mw} × {mh} pixels.'), { mw: size.width, mh: size.height });
            element.append(this._el('div', 'rr-image-layer-menu-note', foot));
            document.body.appendChild(element);
            const rect = anchor.getBoundingClientRect(), box = element.getBoundingClientRect();
            element.style.left = Math.round(Math.max(8, Math.min(window.innerWidth - box.width - 8, rect.left))) + 'px';
            element.style.top = Math.round(Math.min(window.innerHeight - box.height - 8, rect.bottom + 4)) + 'px';
            anchor.setAttribute('aria-expanded', 'true');
            const menu = { element, anchor, away: null, key: null, keys: null };
            menu.away = (event) => { if (!element.contains(event.target) && !anchor.contains(event.target)) this._closeMenu(); };
            menu.key = (event) => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); this._closeMenu(); anchor.focus({ preventScroll: true }); } };
            this._menu = menu;
            menu.keys = root.RRKeyboardNavigation?.menu?.(element, { items: () => element.querySelectorAll('.rr-image-layer-menu-row'), close: () => this._closeMenu(), opener: anchor, activateFirst: true }) || null;
            setTimeout(() => { if (this._menu !== menu) return; document.addEventListener('pointerdown', menu.away, true); document.addEventListener('keydown', menu.key, true); }, 0);
        }

        /** Add: the picture is chosen first, then the layer is on the map. */
        _chooseForAdd(anchor, key) {
            const made = root.ReactorImageLayers.normalize(RRMapImageLayers.make(key, ''));
            this._choosePicture(anchor, '', made.fit === 'map', (name) => this.addLayer(key, name));
        }

        /** The pictures of img/parallaxes as a grid under `anchor`. */
        _choosePicture(anchor, current, mapSized, onPick) {
            const files = this.files();
            if (!files.length) {
                this._alert(tt('Put pictures into the img/parallaxes folder of the project first.'));
                return;
            }
            const size = this.mapSize();
            const note = mapSized ? RRMapImageLayers.fill(tt('A picture locked to the map must be as large as the map: {mw} × {mh} pixels.'), { mw: size.width, mh: size.height })
                : tt('Pictures are in the img/parallaxes folder of the project.');
            // The grid writes each address between single quotes: one inside a file's name would end it there.
            const grid = RRMaterialPopup.open(anchor, {
                materials: files.map(name => ({ name, url: this.urlOf(name).replace(/'/g, '%27') })), current, blank: null, note,
                onPick: (name) => { if (name) onPick(name); }
            });
            if (grid) this._gridKeys(grid, anchor);
        }

        /**
         * The grid was placed at the size it has for other tools; with this tool's wider tiles and whole names it
         * is larger. It is put again where such a grid goes: under the control it opened from, or over it when
         * there is more room there, never past the window. When it is taller than that room, its pictures
         * scroll inside it and the line under them stays in view.
         */
        _placeGrid(grid, anchor) {
            const rect = anchor.getBoundingClientRect(), pictures = grid.querySelector('.rr-material-options');
            let box = grid.getBoundingClientRect();
            const under = window.innerHeight - 8 - (rect.bottom + 4), over = rect.top - 4 - 8;
            const below = box.height <= under || under >= over, room = below ? under : over;
            if (box.height > room && pictures) {
                pictures.style.maxHeight = Math.max(96, Math.floor(pictures.getBoundingClientRect().height - (box.height - room))) + 'px';
                box = grid.getBoundingClientRect();
            }
            grid.style.left = Math.round(Math.max(8, Math.min(window.innerWidth - box.width - 8, rect.left))) + 'px';
            grid.style.top = Math.round(below ? rect.bottom + 4 : Math.max(8, rect.top - 4 - box.height)) + 'px';
        }

        /**
         * The picture grid for this tool: wider tiles with whole names, so numbered pictures can be told apart,
         * and the keyboard. The picture in use (or the first) has the keys, the arrows walk the grid row by row,
         * Enter chooses, and Tab leaves the grid for the control it opened from, as it leaves a menu.
         */
        _gridKeys(grid, anchor) {
            grid.classList.add('rr-image-layer-grid');
            // Where the pictures scroll, they do so under the editor's own scrollbar, as the panel does.
            grid.querySelector('.rr-material-options')?.classList.add('rr-accent-scrollbar');
            this._placeGrid(grid, anchor);
            const options = () => Array.from(grid.querySelectorAll('.rr-material-option'));
            const first = options();
            if (!first.length) return;
            const start = first.find(option => option.getAttribute('aria-selected') === 'true') || first[0];
            for (const option of first) option.tabIndex = option === start ? 0 : -1;
            start.focus({ preventScroll: true });
            start.scrollIntoView?.({ block: 'nearest' });
            grid.addEventListener('keydown', (event) => {
                if (event.altKey || event.ctrlKey || event.metaKey) return;
                if (event.key === 'Tab') {
                    RRMaterialPopup.close();
                    anchor.focus?.({ preventScroll: true });
                    return;
                }
                const all = options(), at = all.indexOf(document.activeElement);
                if (at < 0) return;
                // Pictures in a row: as many as stand beside the first one.
                let across = all.findIndex(option => option.offsetTop !== all[0].offsetTop);
                if (across < 1) across = all.length;
                const forward = typeof getComputedStyle === 'function' && getComputedStyle(grid).direction === 'rtl' ? -1 : 1;
                const to = { ArrowLeft: at - forward, ArrowRight: at + forward, ArrowUp: at - across, ArrowDown: at + across, Home: 0, End: all.length - 1 }[event.key];
                if (to === undefined) return;
                event.preventDefault();
                event.stopPropagation();
                if (to < 0 || to >= all.length || to === at) return;
                all[at].tabIndex = -1;
                all[to].tabIndex = 0;
                all[to].focus({ preventScroll: true });
                all[to].scrollIntoView?.({ block: 'nearest' });
            });
        }

        //---------------------------------------------------------------------
        // Pictures

        /** A small view of a picture: the stylesheet lays it over a checker, so see-through parts read as such. */
        _showPicture(element, name) {
            const url = this.urlOf(name);
            element.style.setProperty('--rr-image-layer-picture', url ? `url("${url.replace(/"/g, '%22')}")` : 'none');
        }

        /** A picture's size in pixels once it has been read; the line that quotes it is drawn again when it arrives. */
        _sizeOf(name) {
            const url = this.urlOf(name);
            if (!url || typeof Image === 'undefined') return null;
            if (this._sizes.has(url)) return this._sizes.get(url);
            this._sizes.set(url, null);
            const image = new Image();
            image.onload = () => {
                this._sizes.set(url, { width: image.naturalWidth, height: image.naturalHeight });
                this._refreshSize();
                if (this._screen.length) this._placeScreen();
            };
            image.src = url;
            return null;
        }

        async _texture(name) {
            const url = this.urlOf(name);
            if (!url) return null;
            try {
                const texture = await PIXI.Assets.load(url);
                if (texture?.source?.style) texture.source.style.scaleMode = 'nearest';
                return texture || null;
            } catch (error) {
                return null;
            }
        }

        /** The picture a layer shows now: the version looked at when its file is there, else the base picture. */
        _shownName(layer, record, have) {
            const wanted = root.ReactorImageLayers.pictureName(record, this.session.lookAt(layer));
            return wanted !== record.name && have.has(wanted) ? wanted : record.name;
        }

        //---------------------------------------------------------------------
        // The map

        /** Another map is in the view: its own steps, eyes and selection. */
        _bind(map) {
            if (!this.session.bind(map)) return;
            this.selectedId = this._topId();
            if (this.panel) this.render();
        }

        /** Draw both views again from the map's data. */
        refreshMap() {
            const tm = this.tilemap();
            if (tm) this.drawFlat(tm);
            else { this.syncScreen(); this._syncClock(); }
        }

        /** The 3D view coming up or going away is the moment its overlay is laid or lifted. */
        _watchView() {
            const host = typeof document !== 'undefined' ? document.getElementById('canvas-container') : null;
            if (this._viewWatch || !host || typeof MutationObserver === 'undefined') return;
            const surface = (nodes) => { for (const node of nodes) if (node.id === 'map-3d-input') return true; return false; };
            this._viewWatch = new MutationObserver((records) => {
                if (records.some(record => surface(record.addedNodes) || surface(record.removedNodes))) { this.syncScreen(); this._syncClock(); }
            });
            this._viewWatch.observe(host, { childList: true });
        }

        _clearFlat() {
            for (const node of this._flat) {
                if (!node || node.destroyed) continue;
                node.onRender = null;
                node.parent?.removeChild(node);
                node.destroy();
            }
            this._flat = [];
            this._flatBuilt = null;
        }

        /** The container of the flat view a depth is drawn in: behind the map, over the lower tiles, with the characters, over everything. */
        _flatHost(tm, depth) {
            const DEPTH = root.ReactorImageLayers.DEPTH, layers = tm.layers;
            const host = depth < 0 ? layers.imageBack : depth < DEPTH.same ? layers.imageGround : depth < 4 ? layers.imageSame : layers.imageOver;
            return host || layers.imageOver;
        }

        /**
         * What the flat view shows of a map, bottom first: every layer the game draws on it and the eye does
         * not hide, with the picture it shows now. The blocked tiles of a Same as Characters picture are asked for here.
         */
        _flatPlan(tm, map) {
            const R = root.ReactorImageLayers, is3D = this.is3DMap(map), have = this.have(), plan = [];
            (Array.isArray(map.rrImageLayers) ? map.rrImageLayers : []).forEach((layer, index) => {
                if (!layer || !layer.name) return;
                const record = R.normalize(layer);
                if (record.layer === 'same' && !is3D) this._gridOf(record.name, tm);
                if (this.session.isHidden(layer) || !R.drawn(record, is3D)) return;
                const depth = R.depth(record, index);
                plan.push({ record, depth, name: this._shownName(layer, record, have), host: this._flatHost(tm, depth), node: null });
            });
            return plan.sort((a, b) => a.depth - b.depth);
        }

        /** What a slider or a number changes on a node that stands: how see-through it is, how it blends, and the record its place is worked out from. */
        _dress(node, record) {
            node.rrRecord = record;
            node.alpha = record.opacity / 255;
            node.blendMode = root.ReactorImageLayers.BLENDS[record.blendMode] || 'normal';
        }

        /**
         * Whether the flat view already shows this plan's pictures in these places. If it does, each node takes
         * its layer's settings as they are now and nothing is built: a dragged slider reads no file and
         * makes no sprite. A picture that was missing when the view was built and is in the folder now is a reason to build.
         */
        _flatKept(tm, map, plan, is3D) {
            const built = this._flatBuilt;
            if (!built || built.map !== map || built.is3D !== is3D || built.width !== map.width || built.height !== map.height || built.entries.length !== plan.length) return false;
            const have = this.have();
            for (let i = 0; i < plan.length; i++) {
                const was = built.entries[i], now = plan[i];
                if (was.name !== now.name || was.host !== now.host || was.record.fit !== now.record.fit) return false;
                if (was.node ? was.node.destroyed || was.node.parent !== was.host : have.has(now.name)) return false;
            }
            for (let i = 0; i < plan.length; i++) {
                const was = built.entries[i];
                was.record = plan[i].record;
                if (!was.node) continue;
                this._dress(was.node, was.record);
                if (was.node.onRender) was.node.onRender();
            }
            return true;
        }

        /**
         * The flat map view: every layer the game draws on this map, at its depth, as at the start of play.
         * Called by TilemapManager.renderImageLayers on a map load and by every edit.
         */
        async drawFlat(tm = this.tilemap()) {
            if (!tm || !tm.layers || !tm.layers.imageOver || typeof PIXI === 'undefined') return;
            this._watchView();
            const token = ++this._flatToken, generation = tm._mapLoadGeneration, map = tm.currentMap;
            const stale = () => token !== this._flatToken || tm.destroyed || generation !== tm._mapLoadGeneration || tm.currentMap !== map;
            if (!map || !(await this.ensureRuntime()) || stale()) return;
            this._bind(map);
            this.syncScreen();
            this._syncClock();
            const is3D = this.is3DMap(map), plan = this._flatPlan(tm, map);
            this._shown = this.gameScreen();
            if (this._flatKept(tm, map, plan, is3D)) {
                this._drawMarks();
                tm.requestRender?.();
                return;
            }
            // The pictures first, so the map keeps what it shows until the new picture is ready.
            for (const entry of plan) entry.texture = await this._texture(entry.name);
            if (stale()) return;
            this._clearFlat();
            const size = this.mapSize(map);
            for (const entry of plan) {
                const texture = entry.texture;
                entry.texture = null;
                if (!texture) continue;
                let node;
                if (entry.record.fit === 'repeat') {
                    texture.source.style.addressMode = 'repeat';
                    node = new PIXI.TilingSprite({ texture, width: size.width, height: size.height });
                    node.onRender = () => this._placeRepeat(tm, node, node.rrRecord, texture, size, is3D);
                } else {
                    node = new PIXI.Sprite(texture);
                    if (entry.record.fit === 'fill') node.onRender = () => this._placeFill(tm, node, size);
                }
                node.eventMode = 'none';
                this._dress(node, entry.record);
                entry.host.addChild(node);
                if (node.onRender) node.onRender();
                entry.node = node;
                this._flat.push(node);
            }
            this._flatBuilt = { map, is3D, width: map.width, height: map.height, entries: plan };
            this._drawMarks();
            tm.requestRender?.();
        }

        /**
         * Where the game's camera stands for what the view shows, in map pixels. Along an axis on which the
         * map is no larger than the game's screen the game keeps the map centered, so the camera is fixed
         * there; along a larger one it is the view's own top left, kept inside the map as the game keeps it.
         */
        _camera(tm, size) {
            const c = tm.container, scale = c.scale.x || 1, shown = this._shown, cam = this._cam;
            cam.x = size.width <= shown.width ? (size.width - shown.width) / 2 : Math.max(0, Math.min(size.width - shown.width, -c.x / scale));
            cam.y = size.height <= shown.height ? (size.height - shown.height) / 2 : Math.max(0, Math.min(size.height - shown.height, -c.y / scale));
            return cam;
        }

        /**
         * A repeating layer in map pixels: where its tiling starts for the camera and the scrolling so far.
         * One that repeats in one direction only is as large as its picture in the other, and lies there
         * where the game puts it for that camera.
         */
        _placeRepeat(tm, node, record, texture, size, is3D) {
            const c = tm.container, tile = this.tile();
            if (!c || node.destroyed) return;
            const scale = c.scale.x || 1, one = record.repeat;
            // A 3D map draws it on the screen: here the view is the screen, and the map's scroll does not count.
            const left = is3D ? -c.x / scale : this._camera(tm, size).x, top = is3D ? -c.y / scale : this._cam.y;
            const o = root.ReactorImageLayers.origin(record, this.clock, is3D ? 0 : left / tile.width, is3D ? 0 : top / tile.height,
                tile.width, tile.height, texture.width, texture.height, this._origin);
            const width = one === 'y' ? texture.width : size.width, height = one === 'x' ? texture.height : size.height;
            if (node.width !== width) node.width = width;
            if (node.height !== height) node.height = height;
            node.position.set(one === 'y' ? Math.round(left - o.x) : 0, one === 'x' ? Math.round(top - o.y) : 0);
            node.tilePosition.set(one === 'y' ? 0 : Math.round(left - o.x), one === 'x' ? 0 : Math.round(top - o.y));
        }

        /**
         * A layer that fills the screen. On a map no larger than the game's screen it lies where the game's
         * screen lies around the centered map; on a larger map the part of the map in view stands for the screen.
         */
        _placeFill(tm, node, size) {
            const c = tm.container, screen = tm.app?.renderer?.screen;
            if (!c || !screen || node.destroyed) return;
            const scale = c.scale.x || 1, shown = this._shown;
            const small = size.width <= shown.width, low = size.height <= shown.height;
            const x0 = small ? (size.width - shown.width) / 2 : Math.max(0, -c.x / scale);
            const y0 = low ? (size.height - shown.height) / 2 : Math.max(0, -c.y / scale);
            const x1 = small ? x0 + shown.width : Math.min(size.width, (screen.width - c.x) / scale);
            const y1 = low ? y0 + shown.height : Math.min(size.height, (screen.height - c.y) / scale);
            node.position.set(x0, y0);
            node.width = Math.max(1, x1 - x0);
            node.height = Math.max(1, y1 - y0);
        }

        //---------------------------------------------------------------------
        // What blocks (Same as Characters)

        _gridKey(name, tm, map = tm.currentMap) { return `${this.folder() || ''}|${name}|${map.width}x${map.height}|${tm.TILE_WIDTH}x${tm.TILE_HEIGHT}`; }

        /** The tiles a picture blocks, by the game's own rule, worked out once per picture and map size. */
        async _gridOf(name, tm) {
            const key = this._gridKey(name, tm);
            if (this._grids.has(key)) return this._grids.get(key);
            this._grids.set(key, null);
            const map = tm.currentMap, texture = await this._texture(name);
            const image = texture?.source?.resource;
            const grid = image ? root.ReactorImageLayers.solidGrid(image, map.width, map.height, tm.TILE_WIDTH, tm.TILE_HEIGHT) : null;
            if (!grid) { this._grids.delete(key); return null; }
            this._grids.set(key, grid);
            if (tm === this.tilemap() && tm.currentMap === map) {
                this._drawMarks();
                tm.refreshPassage?.();
            }
            return grid;
        }

        /** For the passage overlay: whether an image layer blocks a tile at the start of play. Null when none can. */
        solidTest(map) {
            const R = root.ReactorImageLayers, tm = this.tilemap();
            if (!R || !tm || !map || map !== tm.currentMap || !Array.isArray(map.rrImageLayers) || this.is3DMap(map)) return null;
            const grids = [];
            for (const layer of map.rrImageLayers) {
                if (!layer || !layer.name) continue;
                const record = R.normalize(layer);
                if (record.layer !== 'same') continue;
                const grid = this._grids.get(this._gridKey(record.name, tm));
                if (grid) grids.push(grid);
            }
            if (!grids.length) return null;
            return (x, y) => grids.some(grid => R.isSolidAt(grid, map.width, map.height, x, y));
        }

        /** While a Same as Characters layer is selected, the tiles its picture blocks are marked on the map. */
        _drawMarks() {
            const tm = this.tilemap(), host = tm?.layers?.imageMarks, R = root.ReactorImageLayers;
            if (!host || host.destroyed || !R) return;
            host.removeChildren().forEach(child => child.destroy());
            const map = tm.currentMap, layer = this.panel ? this.session.layer(this.selectedId) : null;
            tm.requestRender?.();
            if (!layer || !map || this.is3DMap(map)) return;
            const record = R.normalize(layer);
            if (record.layer !== 'same' || this.session.isHidden(layer)) return;
            const name = this._shownName(layer, record, this.have());
            const grid = this._grids.get(this._gridKey(name, tm));
            if (!grid) { this._gridOf(name, tm); return; }
            const tw = tm.TILE_WIDTH, th = tm.TILE_HEIGHT, marks = new PIXI.Graphics();
            let any = false;
            for (let y = 0; y < map.height; y++) for (let x = 0; x < map.width; x++) {
                if (!R.isSolidAt(grid, map.width, map.height, x, y)) continue;
                marks.rect(x * tw + 1, y * th + 1, tw - 2, th - 2);
                any = true;
            }
            if (any) marks.fill({ color: BLOCKED_COLOR, alpha: 0.24 }).stroke({ width: 2, color: BLOCKED_COLOR, alpha: 0.9 });
            marks.eventMode = 'none';
            host.addChild(marks);
        }

        //---------------------------------------------------------------------
        // Over the 3D view

        _clearScreen() {
            for (const entry of this._screen) entry.element.remove();
            this._screen = [];
        }

        /**
         * The layers a 3D map draws, over the 3D view: one element each above the canvas and under the
         * view's own input surface, with the picture stretched or repeated, its opacity and its blend.
         */
        syncScreen() {
            const input = this.view3DSurface(), host = input?.parentElement, map = this.map(), R = root.ReactorImageLayers;
            if (!input || !map || !R || !Array.isArray(map.rrImageLayers)) { this._clearScreen(); return; }
            this._bind(map);
            const have = this.have();
            const plan = [];
            map.rrImageLayers.forEach((layer, index) => {
                if (!layer || !layer.name) return;
                const record = R.normalize(layer);
                if (this.session.isHidden(layer) || !R.drawnOn3D(record)) return;
                const name = this._shownName(layer, record, have), url = this.urlOf(name);
                if (url) plan.push({ record, depth: R.depth(record, index), name, url });
            });
            plan.sort((a, b) => a.depth - b.depth);
            // The same pictures in the same order keep their elements: a setting being dragged must not blink.
            const same = plan.length === this._screen.length && plan.every((entry, i) => this._screen[i].url === entry.url && this._screen[i].element.parentElement === host);
            if (!same) this._clearScreen();
            plan.forEach(({ record, name, url }, i) => {
                const element = same ? this._screen[i].element : this._el('div', 'rr-image-layer-screen');
                element.classList.toggle('is-repeating', record.fit === 'repeat');
                element.classList.toggle('is-across', record.fit === 'repeat' && record.repeat === 'x');
                element.classList.toggle('is-down', record.fit === 'repeat' && record.repeat === 'y');
                if (!same) element.style.backgroundImage = `url("${url.replace(/"/g, '%22')}")`;
                if (record.fit !== 'repeat') { element.style.backgroundSize = ''; element.style.backgroundPosition = ''; }
                element.style.opacity = String(record.opacity / 255);
                element.style.mixBlendMode = CSS_BLEND[R.BLENDS[record.blendMode]] || 'normal';
                // The picture's address and size stay with its element: a scrolling layer asks the disk nothing.
                if (same) this._screen[i].record = record;
                else { host.insertBefore(element, input); this._screen.push({ element, record, name, url, size: null }); }
                // Only a repeating layer is laid out by its picture's size; one that has just become repeating asks for it here.
                const entry = this._screen[i];
                if (record.fit === 'repeat' && !entry.size) entry.size = this._sizeOf(name);
            });
            this._placeScreen();
        }

        /** Size and start of each repeating layer over the 3D view, at the scale the game's screen has there. */
        _placeScreen() {
            const host = document.getElementById('canvas-container'), R = root.ReactorImageLayers;
            if (!host || !R) return;
            let scale = 0;
            for (const entry of this._screen) {
                if (entry.record.fit !== 'repeat') continue;
                // Read once; until the picture has been read the layer keeps the size the stylesheet gives it.
                const size = entry.size || (entry.size = this._sizes.get(entry.url) || null);
                if (!size) continue;
                if (!scale) scale = (host.clientWidth || 1) / this.gameScreen().width;
                const o = R.origin(entry.record, this.clock, 0, 0, 1, 1, size.width, size.height, this._origin);
                entry.element.style.backgroundSize = `${size.width * scale}px ${size.height * scale}px`;
                entry.element.style.backgroundPosition = `${-o.x * scale}px ${-o.y * scale}px`;
            }
        }

        //---------------------------------------------------------------------
        // The drift preview: one frame loop, only while the tool is open, the window shows and a layer drifts

        _drifts() {
            const R = root.ReactorImageLayers, map = this.map();
            if (!R || !map || !Array.isArray(map.rrImageLayers)) return false;
            const is3D = this.is3DMap(map);
            return map.rrImageLayers.some(layer => {
                if (!layer || !layer.name || this.session.isHidden(layer)) return false;
                const record = R.normalize(layer);
                return R.scrolls(record) && R.drawn(record, is3D);
            });
        }

        _syncClock() {
            const wanted = !!this.panel && !document.hidden && this._drifts();
            if (wanted && this._frame === null) {
                this._clockBase = performance.now() - this.clock * 1000;
                this._frame = requestAnimationFrame(this._tick);
            } else if (!wanted && this._frame !== null) {
                cancelAnimationFrame(this._frame);
                this._frame = null;
            }
            if (!this.panel && this.clock !== 0) {
                // Closed: the layers rest where play starts.
                this.clock = 0;
                this._placeScreen();
                this.tilemap()?.requestRender?.();
            }
        }

        /** One frame of the preview. Whether a layer still scrolls is asked by _syncClock when something changes, not here. */
        _onFrame(now) {
            this._frame = null;
            if (!this.panel || document.hidden) return;
            this.clock = (now - this._clockBase) / 1000;
            if (this._screen.length) this._placeScreen();
            else this.tilemap()?.requestRender?.();
            this._frame = requestAnimationFrame(this._tick);
        }
    }

    root.MapImageLayersManager = MapImageLayersManager;
    if (typeof module !== 'undefined' && module.exports) module.exports = MapImageLayersManager;
})(typeof window !== 'undefined' ? window : globalThis);
