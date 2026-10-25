/**
 * PropBuilder - Forge › 3D Prop Builder.
 *
 * One recipe (RRPropModel) describes the prop; its kind (Flag, From
 * picture) decides the tabs. Every control edits the recipe and the view
 * follows within a frame: a cloth runs live in the wind (RRPropCloth, on
 * the same bones the file carries), or plays the loop Save writes. Save to
 * Project writes <project>/3d/Props/<name>/: the GLB (pictures inside, the
 * loop as its "Wave" clip), model.json (the loop playing, the origin where
 * it is placed), prop.json (the recipe, for Open) and a thumbnail.
 */
class PropBuilder {
    constructor() {
        this.projectController = null;
        this.root = null;
        this.recipe = RRPropModel.normalize({ kind: 'flag' });
        this.name = '';
        this.cache = {};
        this.tab = null;
        this.motion = 'live';
        this.folded = {};
        this.randomScope = 'all';
        try { for (const k of JSON.parse(sessionStorage.getItem(PropBuilder.FOLDED_KEY) || '[]')) this.folded[k] = true; } catch (e) { /* nothing remembered */ }
        this._undo = [];
        this._redo = [];
        this._committed = JSON.stringify(this.recipe);
        this._view = null;
        this._pending = 0;
        this._images = {};
        this._minis = new Map();
    }

    _t(text, params) {
        let out = window.I18n ? window.I18n.tText(text) : text;
        if (params) for (const k in params) out = out.split('{' + k + '}').join(params[k]);
        return out;
    }

    _project() {
        const project = this.projectController?.getCurrentProject?.() || this.projectController?.currentProject;
        return project && project.path ? project : null;
    }

    holdsWork() { return false; }

    renderInto(containerEl, projectController) {
        this.projectController = projectController;
        this.root = containerEl;
        if (!this._project()) {
            this.root.innerHTML = `<div class="rr-c3d-empty">${this._t('Open a project to use Forge tools.')}</div>`;
            return;
        }
        this._renderPage();
        this._start();
    }

    detach() {
        const view = this._view;
        if (this._worker) { this._worker.terminate(); this._worker = null; }
        if (!view) return;
        cancelAnimationFrame(view.loop);
        cancelAnimationFrame(view.frame);
        view.resize?.disconnect();
        this._clearModel();
        for (const t of view.textures.values()) t.texture.dispose();
        for (const t of this._envTargets || []) t.dispose();
        this._envTargets = [];
        view.renderer.dispose();
        view.renderer.forceContextLoss?.();
        this._view = null;
    }

    get kind() { return this.recipe.kind; }

    // ── recipe editing ─────────────────────────────────────────────────────
    _get(path) { return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), this.recipe); }

    _set(path, value) {
        const next = JSON.parse(JSON.stringify(this.recipe));
        const keys = path.split('.');
        let o = next;
        for (let i = 0; i < keys.length - 1; i++) {
            if (o[keys[i]] == null) o[keys[i]] = /^\d+$/.test(keys[i + 1]) ? [] : {};
            o = o[keys[i]];
        }
        o[keys[keys.length - 1]] = value;
        // A height of its own makes the cloth's shape Custom.
        if (path === 'cloth.height') next.cloth.aspect = 'custom';
        this.recipe = RRPropModel.normalize(next);
    }

    _commit() {
        const now = JSON.stringify(this.recipe);
        if (now === this._committed) return;
        this._undo.push(this._committed);
        if (this._undo.length > 80) this._undo.shift();
        this._redo = [];
        this._committed = now;
        this._syncHistory();
    }

    _replace(recipe) {
        this.recipe = RRPropModel.normalize(recipe);
        this._commit();
        this._renderPanel();
        this._queueRebuild();
    }

    _history(direction) {
        const from = direction < 0 ? this._undo : this._redo, to = direction < 0 ? this._redo : this._undo;
        if (!from.length) return;
        to.push(this._committed);
        this._committed = from.pop();
        this.recipe = RRPropModel.normalize(JSON.parse(this._committed));
        this._syncHistory();
        this._renderPanel();
        this._queueRebuild();
    }

    _syncHistory() {
        if (!this.root) return;
        const undo = this.root.querySelector('.rr-prop-undo'), redo = this.root.querySelector('.rr-prop-redo');
        if (undo) undo.disabled = !this._undo.length;
        if (redo) redo.disabled = !this._redo.length;
    }

    // ── page ───────────────────────────────────────────────────────────────
    /** The page of the kind being made (RRPropCatalog.ui). */
    _ui() { return RRPropCatalog.UI[this.kind] || RRPropCatalog.UI.flag; }

    _renderPage() {
        this.root.innerHTML = `
            <div class="rr-c3d rr-prop">
                <div class="rr-c3d-toolbar">
                    <label class="rr-c3d-name"><span>${this._t('Name')}</span><input type="text" class="rr-c3d-name-input rr-input" maxlength="48" placeholder="${this._t(this._ui().placeholder)}" value="${rrEscapeHtml(this.name)}"></label>
                    <button class="rr-btn-chip rr-prop-undo" title="${this._t('Undo')}" disabled>↶</button>
                    <button class="rr-btn-chip rr-prop-redo" title="${this._t('Redo')}" disabled>↷</button>
                    <span class="rr-c3d-group rr-prop-randomgroup">
                        <button class="rr-btn-chip rr-prop-random" title="${this._t('Roll something new for the part chosen beside it')}">🎲 ${this._t('Randomize')}</button>
                        <select class="rr-c3d-random-scope rr-prop-random-scope rr-select" title="${this._t('What Randomize changes')}"></select>
                    </span>
                    <button class="rr-btn-chip rr-prop-reset">↻ ${this._t('Reset')}</button>
                    <button class="rr-btn-chip rr-prop-open">${this._t('Open…')}</button>
                    <span class="rr-c3d-spacer"></span>
                    <span class="rr-c3d-status" aria-live="polite"></span>
                    <button class="rr-btn-chip rr-c3d-save rr-prop-save">${this._t('Save to Project')}</button>
                </div>
                <div class="rr-c3d-body rr-prop-body">
                    <div class="rr-prop-types">
                        <input type="search" class="rr-input rr-prop-search" placeholder="${this._t('Search props')}" aria-label="${this._t('Search props')}">
                        <div class="rr-prop-typelist"></div>
                    </div>
                    <div class="rr-c3d-side">
                        <div class="rr-c3d-tabs" role="tablist"></div>
                        <div class="rr-c3d-panel"></div>
                    </div>
                    <div class="rr-c3d-view">
                        <canvas class="rr-c3d-canvas"></canvas>
                        <div class="rr-c3d-readout"></div>
                        <div class="rr-c3d-poses rr-prop-motion" role="group" aria-label="${this._t('Motion')}">
                            <div class="rr-c3d-poses-title">${this._t('Motion')}</div>
                            <div class="rr-c3d-pose-list">
                                <button class="rr-btn-chip rr-c3d-pose" data-motion="live">${this._t('Live wind')}</button>
                                <button class="rr-btn-chip rr-c3d-pose" data-motion="loop">${this._t('Saved loop')}</button>
                            </div>
                        </div>
                        <div class="rr-c3d-viewbar">
                            <button class="rr-btn-chip rr-c3d-frame" data-frame="all">${this._t('Whole prop')}</button>
                            <button class="rr-btn-chip rr-c3d-frame" data-frame="close">${this._t('Close-up')}</button>
                        </div>
                        <div class="rr-c3d-hint">${this._t('Drag to turn, wheel to zoom')}</div>
                        <div class="rr-c3d-gallery" hidden></div>
                    </div>
                </div>
            </div>`;
        const q = sel => this.root.querySelector(sel);
        q('.rr-c3d-name-input').addEventListener('input', e => { this.name = e.target.value; });
        q('.rr-prop-undo').addEventListener('click', () => this._history(-1));
        q('.rr-prop-redo').addEventListener('click', () => this._history(1));
        q('.rr-prop-random').addEventListener('click', () => this._randomize());
        q('.rr-prop-random-scope').addEventListener('change', e => { this.randomScope = e.target.value; });
        q('.rr-prop-reset').addEventListener('click', () => this._replace(this._ui().reset(this.recipe)));
        q('.rr-prop-open').addEventListener('click', () => this._showGallery());
        q('.rr-prop-save').addEventListener('click', () => this.save());
        q('.rr-prop-motion').addEventListener('click', e => { const b = e.target.closest('[data-motion]'); if (b) this._setMotion(b.dataset.motion); });
        this.root.querySelectorAll('.rr-c3d-frame').forEach(b => b.addEventListener('click', () => this._frame(b.dataset.frame)));
        q('.rr-c3d-tabs').addEventListener('click', e => { const b = e.target.closest('[data-tab]'); if (b) { this.tab = b.dataset.tab; this._renderPanel(); } });
        q('.rr-prop-search').addEventListener('input', e => { this.search = e.target.value; this._renderTypes(); });
        const list = q('.rr-prop-typelist');
        list.addEventListener('click', e => {
            const head = e.target.closest('[data-cat]');
            if (head) { this._foldCategory(head.dataset.cat); return; }
            const b = e.target.closest('[data-type]');
            const type = b && RRPropCatalog.TYPES.find(t => t.id === b.dataset.type);
            if (type && type !== RRPropCatalog.typeOf(this.recipe)) { this.tab = null; this._replace(type.start(this.recipe)); }
        });
        list.addEventListener('keydown', e => {
            const head = e.target.closest && e.target.closest('[data-cat]');
            if (head && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); this._foldCategory(head.dataset.cat); }
        });
        const panel = q('.rr-c3d-panel');
        panel.addEventListener('input', e => this._onInput(e, false));
        panel.addEventListener('change', e => this._onInput(e, true));
        panel.addEventListener('click', e => this._onClick(e));
        panel.addEventListener('keydown', e => {
            const head = e.target.closest && e.target.closest('.rr-c3d-sechead');
            if (head && (e.key === 'Enter' || e.key === ' ') && e.target === head) { e.preventDefault(); this._fold(head); }
        });
        this._renderPanel();
        this._syncHistory();
        this._syncMotion();
    }

    /**
     * The left column: every category (its header folds it) with its types;
     * a search shows only the types it matches, every category open.
     */
    _renderTypes() {
        const list = this.root && this.root.querySelector('.rr-prop-typelist');
        if (!list) return;
        const current = RRPropCatalog.typeOf(this.recipe), searching = !!String(this.search || '').trim();
        const groups = RRPropCatalog.grouped(this.search, s => this._t(s));
        const row = t => `<button class="rr-prop-type${t === current ? ' is-active' : ''}" data-type="${rrEscapeHtml(t.id)}" title="${rrEscapeHtml(this._t(t.label))}">${RRPropCatalog.icon(t.icon, 16)}<span>${rrEscapeHtml(this._t(t.label))}</span></button>`;
        list.innerHTML = groups.map(({ category, own, groups: subs, types }) => {
            const folded = !searching && !!this.folded['cat:' + category.id];
            return `<div class="lit-section rr-prop-cat${folded ? ' is-collapsed' : ''}">
                <div class="lit-section-header rr-prop-cathead" data-cat="${rrEscapeHtml(category.id)}" tabindex="0" role="button" aria-expanded="${!folded}">
                    <span class="r3d-sec-toggle">${folded ? '▸' : '▾'}</span><span class="r3d-sec-title">${rrEscapeHtml(this._t(category.label))}</span><span class="lit-section-meta">${types.length}</span></div>
                <div class="lit-section-body rr-prop-catbody">${own.map(row).join('')}${subs.map(g => `<div class="rr-prop-subhead">${rrEscapeHtml(this._t(g.category.label))}</div>${g.types.map(row).join('')}`).join('')}</div>
            </div>`;
        }).join('') || `<p class="rr-c3d-note rr-prop-none">${this._t('No props match.')}</p>`;
    }

    _foldCategory(id) {
        this.folded['cat:' + id] = !this.folded['cat:' + id];
        try { sessionStorage.setItem(PropBuilder.FOLDED_KEY, JSON.stringify(Object.keys(this.folded).filter(k => k.startsWith('cat:') && this.folded[k]))); } catch (e) { /* state stays for this window */ }
        this._renderTypes();
        const head = [...this.root.querySelectorAll('.rr-prop-cathead')].find(h => h.dataset.cat === id);
        if (head) head.focus();
    }

    _renderPanel() {
        if (!this.root) return;
        const ui = this._ui(), tabs = ui.tabs;
        if (!tabs.some(t => t[0] === this.tab)) this.tab = tabs[0][0];
        this._renderTypes();
        this.root.querySelector('.rr-c3d-tabs').innerHTML = tabs.map(([id, label]) =>
            `<button class="rr-c3d-tab${id === this.tab ? ' is-active' : ''}" role="tab" aria-selected="${id === this.tab}" data-tab="${id}">${this._t(label)}</button>`).join('');
        const panel = this.root.querySelector('.rr-c3d-panel'), top = panel.scrollTop;
        panel.innerHTML = ui.panel.call(this, this.tab);
        this._cardify(panel);
        panel.scrollTop = top;
        this._syncSliders();
        this._syncMotion();
        this._profileEditor();
        const kind = RRPropModel.kindOf(this.recipe), group = this.root.querySelector('.rr-prop-randomgroup');
        if (group) {
            group.hidden = !kind.random;
            const scopes = kind.randomScopes || [['all', 'Everything']];
            if (!scopes.some(s => s[0] === this.randomScope)) this.randomScope = 'all';
            const select = group.querySelector('select');
            select.innerHTML = scopes.map(([id, label]) => `<option value="${id}"${id === this.randomScope ? ' selected' : ''}>${this._t(label)}</option>`).join('');
            select.hidden = scopes.length < 2;
        }
        const type = RRPropCatalog.typeOf(this.recipe), input = this.root.querySelector('.rr-c3d-name-input');
        if (input) input.placeholder = this._t(type ? type.label : ui.placeholder);
    }

    // ── controls ───────────────────────────────────────────────────────────
    _section(label) { return `<div class="rr-c3d-section" data-title="${rrEscapeHtml(label)}"><span>${this._t(label)}</span></div>`; }

    _cardify(panel) {
        let body = null;
        for (const el of [...panel.children]) {
            if (!el.classList.contains('rr-c3d-section')) { if (body) body.appendChild(el); continue; }
            const key = this.kind + ':' + this.tab + ':' + el.dataset.title, folded = !!this.folded[key];
            const card = document.createElement('div');
            card.className = 'lit-section rr-c3d-card-sec' + (folded ? ' is-collapsed' : '');
            const head = document.createElement('div');
            head.className = 'lit-section-header rr-c3d-sechead';
            head.dataset.act = 'fold'; head.dataset.key = key; head.tabIndex = 0;
            head.setAttribute('role', 'button'); head.setAttribute('aria-expanded', String(!folded));
            head.innerHTML = `<span class="r3d-sec-toggle">${folded ? '▸' : '▾'}</span>`;
            for (const child of [...el.childNodes]) head.appendChild(child);
            if (head.children[1]) head.children[1].classList.add('r3d-sec-title');
            body = document.createElement('div');
            body.className = 'lit-section-body rr-c3d-secbody';
            card.append(head, body);
            panel.insertBefore(card, el);
            el.remove();
        }
    }

    _fold(head) {
        const key = head.dataset.key, card = head.parentElement;
        this.folded[key] = !this.folded[key];
        card.classList.toggle('is-collapsed', this.folded[key]);
        head.setAttribute('aria-expanded', String(!this.folded[key]));
        head.querySelector('.r3d-sec-toggle').textContent = this.folded[key] ? '▸' : '▾';
    }

    _slider(s) {
        const [min, max] = s.range, v = this._get(s.path);
        const ends = s.ends ? `<div class="rr-c3d-ends"><span>${this._t(s.ends[0])}</span><span>${this._t(s.ends[1])}</span></div>` : '';
        return `<label class="rr-c3d-row" title="${rrEscapeHtml(this._t(s.label))}"><span class="rr-c3d-label">${this._t(s.label)}</span>
            <input type="range" data-path="${s.path}" data-format="${s.format || ''}" min="${min}" max="${max}" step="${s.step || 0.01}" value="${v}" style="--rr-nat-lo:0%;--rr-nat-hi:100%">
            <span class="rr-c3d-value" data-value="${s.path}">${this._format(s.format, v)}</span>${ends}</label>`;
    }

    _format(f, v) {
        if (v == null || Number.isNaN(+v)) return '';
        if (f === 'm') return (+v).toFixed(2) + ' m';
        if (f === 'deg') return Math.round(v) + '°';
        if (f === 'wind') return this._t('{n} m/s', { n: RRFlagProp.windSpeed(+v).toFixed(1) });
        if (f === 'int') return String(Math.round(v));
        if (f === 'x') return '×' + (+v).toFixed(1);
        if (f === 'tiles') return this._t('{n} tiles', { n: (+v).toFixed(1) });
        return Math.round(v * 100) + '%';
    }

    _select(path, label, choices, value) {
        const v = value ?? this._get(path);
        const opts = choices.map(c => `<option value="${rrEscapeHtml(c[0])}"${c[0] === v ? ' selected' : ''}>${rrEscapeHtml(this._t(c[1]))}</option>`).join('');
        return `<label class="rr-c3d-row rr-c3d-choice"><span class="rr-c3d-label">${this._t(label)}</span><select class="rr-select" data-path="${path}">${opts}</select></label>`;
    }

    _color(path, label, swatches) {
        const v = this._get(path) || '';
        const sw = (swatches || []).map(c => `<button class="rr-c3d-swatch" data-act="swatch" data-path="${path}" data-color="${c}" style="background:${c}" title="${c}"></button>`).join('');
        return `<div class="rr-c3d-row rr-c3d-colorrow"><span class="rr-c3d-label">${this._t(label)}</span>
            <div class="rr-c3d-swatches">${sw}</div>
            <span class="rr-c3d-colorpick"><button type="button" class="rr-c3d-color" data-act="color" data-path="${path}" style="--rr-c3d-swatch:${v || 'transparent'}" title="${rrEscapeHtml(v)}"></button></span></div>`;
    }

    _check(path, label) {
        return `<label class="rr-c3d-row rr-c3d-check"><span class="rr-c3d-label">${this._t(label)}</span><input type="checkbox" data-path="${path}"${this._get(path) ? ' checked' : ''}></label>`;
    }

    /** A choice shown as pictures: `items` [{ id, label, picture (data URL) }]. */
    _tiles(act, items, current, columns) {
        return `<div class="rr-c3d-tiles${columns === 2 ? ' rr-prop-tiles2' : ''}">${items.map(it => `<button class="rr-c3d-tile rr-c3d-thumbtile${it.id === current ? ' is-active' : ''}" data-act="${act}" data-id="${rrEscapeHtml(it.id)}" title="${rrEscapeHtml(this._t(it.label))}">`
            + (it.picture !== undefined ? `<span class="rr-c3d-thumb rr-prop-mini">${it.picture ? `<img src="${it.picture}" alt="">` : ''}</span>` : '')
            + `<span class="rr-c3d-tile-label">${rrEscapeHtml(this._t(it.label))}</span></button>`).join('')}</div>`;
    }

    _onInput(event, committed) {
        const el = event.target, path = el.dataset && el.dataset.path;
        if (!path) return;
        let value = el.type === 'range' ? +el.value : el.type === 'checkbox' ? el.checked : el.value;
        if (el.tagName === 'SELECT' || el.type === 'checkbox') {
            if (!committed) return;
            const hook = this._ui().choose;
            if (hook && hook.call(this, path, value)) return;
            this._set(path, value);
            this._commit();
            this._renderPanel();
            this._queueRebuild();
            return;
        }
        this._set(path, value);
        this._syncSliders();
        if (committed) { this._commit(); if (path === 'cloth.height' || path === 'cloth.width' || path === 'marks.text') this._renderPanel(); }
        this._quick = !committed;
        this._queueRebuild();
    }

    _onClick(event) {
        const b = event.target.closest('button[data-act]') || event.target.closest('[data-act]');
        if (!b) return;
        event.preventDefault();
        const act = b.dataset.act;
        if (act === 'fold') { this._fold(b); return; }
        if (act === 'color') {
            const path = b.dataset.path;
            RRColorPopover.open(b, {
                value: this._get(path) || '#808080',
                onInput: hex => { this._set(path, hex); b.style.setProperty('--rr-c3d-swatch', hex); this._quick = true; this._queueRebuild(); },
                onChange: hex => { this._set(path, hex); b.style.setProperty('--rr-c3d-swatch', hex); b.title = hex; this._commit(); this._quick = false; this._renderPanel(); this._queueRebuild(); }
            });
            return;
        }
        if (act === 'swatch') { this._set(b.dataset.path, b.dataset.color); this._commit(); this._renderPanel(); this._queueRebuild(); return; }
        const hook = this._ui().act;
        if (hook) hook.call(this, act, b);
    }

    _syncSliders() {
        if (!this.root) return;
        this.root.querySelectorAll('.rr-c3d-panel input[type="range"]').forEach(input => {
            const v = this._get(input.dataset.path);
            if (v == null) return;
            if (+input.value !== v) input.value = v;
            input.style.setProperty('--rr-fill', ((Math.max(+input.min, Math.min(+input.max, v)) - input.min) / (input.max - input.min) * 100) + '%');
            const label = this.root.querySelector(`[data-value="${input.dataset.path}"]`);
            if (label) label.textContent = this._format(input.dataset.format, v);
        });
    }

    _randomize() {
        const kind = RRPropModel.kindOf(this.recipe);
        if (kind.random) this._replace(kind.random((Math.random() * 4294967296) >>> 0, this.recipe, this.randomScope || 'all'));
    }

    _status(text, kind) {
        const el = this.root && this.root.querySelector('.rr-c3d-status');
        if (!el) return;
        el.textContent = text || '';
        el.dataset.kind = kind || '';
    }

    // ── 3D view ────────────────────────────────────────────────────────────
    async _start() {
        this._status(this._t('Loading…'));
        const ready = window.THREE || (this.projectController?.mapEditor3D?.ensureLibraries && await this.projectController.mapEditor3D.ensureLibraries());
        if (!ready || !window.THREE) { this._status(this._t('The 3D libraries could not be loaded.'), 'error'); return; }
        if (!this.root || !this.root.querySelector('.rr-c3d-canvas')) return;
        this._makeView();
        this._renderPanel();
        this._rebuild();
        this._status('');
    }

    _makeView() {
        this.detach();
        const canvas = this.root.querySelector('.rr-c3d-canvas'), host = canvas.parentElement;
        const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
        this._weak = Character3DBuilder.weakGpu(renderer);
        renderer.setPixelRatio(this._weak ? 1 : Math.min(window.devicePixelRatio || 1, 2));
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.0;
        renderer.setClearColor(0x000000, 0);
        const scene = new THREE.Scene();
        scene.environment = Character3DBuilder.prototype._studio.call(this, renderer);
        scene.environmentIntensity = 0.7;
        const camera = new THREE.PerspectiveCamera(32, 1, 0.05, 200);
        scene.add(new THREE.HemisphereLight(0xeaf2ff, 0x3a3630, 0.55));
        // A sun from high to one side: the folds shade, and the cloth shades itself.
        const key = new THREE.DirectionalLight(0xfff1dc, 2.4);
        scene.add(key, key.target);
        if (!this._weak) {
            renderer.shadowMap.enabled = true;
            renderer.shadowMap.type = THREE.PCFSoftShadowMap;
            key.castShadow = true;
            key.shadow.mapSize.set(2048, 2048);
            key.shadow.bias = -0.0004;
            key.shadow.normalBias = 0.02;
        }
        const rim = new THREE.DirectionalLight(0xd8e4ff, 0.9);
        rim.position.set(-3, 4, -5);
        scene.add(rim);
        const floor = new THREE.Mesh(new THREE.CircleGeometry(1, 64), new THREE.MeshStandardMaterial({ color: 0x3a3d44, roughness: 0.95 }));
        floor.rotation.x = -Math.PI / 2;
        floor.receiveShadow = true;
        scene.add(floor);
        const blob = new THREE.Mesh(new THREE.CircleGeometry(1, 48), new THREE.MeshBasicMaterial({ map: Character3DBuilder.blobTexture(), transparent: true, depthWrite: false, opacity: 0.6 }));
        blob.rotation.x = -Math.PI / 2;
        blob.position.y = 0.002;
        scene.add(blob);
        const group = new THREE.Group();
        scene.add(group);
        // A wall behind what hangs on one (a painting on its hook, a flag on its bracket).
        const wall = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshStandardMaterial({ color: 0x4a4e57, roughness: 0.95 }));
        wall.receiveShadow = true;
        wall.visible = false;
        scene.add(wall);
        const view = this._view = { renderer, scene, camera, key, floor, blob, wall, group, meshes: [], bones: [], textures: new Map(), yaw: 0.5, pitch: 0.12, distance: 8, target: new THREE.Vector3(0, 3, 0), frame: 0, loop: 0, clock: new THREE.Clock(), extent: 6 };
        const size = () => {
            const w = Math.max(1, host.clientWidth), h = Math.max(1, host.clientHeight);
            renderer.setSize(w, h, false);
            camera.aspect = w / h;
            camera.updateProjectionMatrix();
            this._draw();
        };
        view.resize = new ResizeObserver(size);
        view.resize.observe(host);
        size();
        let drag = null;
        canvas.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY, yaw: view.yaw, pitch: view.pitch }; canvas.setPointerCapture(e.pointerId); });
        canvas.addEventListener('pointermove', e => {
            if (!drag) return;
            view.yaw = drag.yaw - (e.clientX - drag.x) * 0.01;
            view.pitch = Math.max(-0.5, Math.min(1.3, drag.pitch + (e.clientY - drag.y) * 0.006));
            this._draw();
        });
        const end = () => { drag = null; };
        canvas.addEventListener('pointerup', end);
        canvas.addEventListener('pointercancel', end);
        canvas.addEventListener('wheel', e => {
            e.preventDefault();
            view.distance = Math.max(view.minDistance || 0.01, Math.min(view.extent * 5 + 4, view.distance * (e.deltaY > 0 ? 1.1 : 0.9)));
            this._draw();
        }, { passive: false });
        this._tick();
    }

    /** The view's frame loop: the live cloth stepped by the time passed, or the saved loop played; a weak GPU draws at 30 a second. */
    _tick() {
        const view = this._view;
        if (!view) return;
        view.clock.getDelta();
        let carried = 0;
        const step = () => {
            if (!this._view) return;
            view.loop = requestAnimationFrame(step);
            const dt = Math.min(0.1, view.clock.getDelta());
            carried += dt;
            if (this._weak && carried < 1 / 32) return;
            const moving = this._advance(carried);
            carried = 0;
            if (moving) this._render();
        };
        view.loop = requestAnimationFrame(step);
    }

    _advance(dt) {
        const view = this._view, result = this._result;
        // Containers: a build's own clip (its lights) plays in the view as the game plays it.
        if (view && result && view.clipAction && !RRPropModel.moves(result)) { view.mixer.update(dt); return true; }
        if (!view || !result || !RRPropModel.moves(result) || !view.bones.length) return false;
        if (this.motion === 'loop' && view.mixer && view.action) { view.mixer.update(dt); return true; }
        if (!view.sims || !view.sims.length) return false;
        // At most a tenth of a second of cloth a frame: a slow frame slows the cloth instead of stalling.
        for (const sim of view.sims) {
            const c = sim.cloth, setup = c.setup;
            RRPropCloth.advance(sim.state, dt, Math.ceil(sim.state.rate * 0.1));
            RRPropCloth.posesFor(sim.state.pos, setup.rest, setup.nx, setup.ny, c.grid, sim.T, sim.Q, view.scratch);
            for (let b = 0; b < c.grid.count; b++) {
                const bone = view.bones[1 + c.offset + b];
                bone.position.set(sim.T[b * 3], sim.T[b * 3 + 1], sim.T[b * 3 + 2]);
                bone.quaternion.set(sim.Q[b * 4], sim.Q[b * 4 + 1], sim.Q[b * 4 + 2], sim.Q[b * 4 + 3]);
            }
        }
        // A rope swings with its banners, on the same clock.
        if (result.rope) {
            const t = view.sims[0] ? view.sims[0].state.time : 0, at = result.rope.at(t);
            for (let k = 0; k < at.length / 3; k++) view.bones[1 + result.rope.offset + k].position.set(at[k * 3], at[k * 3 + 1], at[k * 3 + 2]);
        }
        return true;
    }

    _frame(which) {
        const view = this._view;
        if (!view || !this._result) return;
        const box = new THREE.Box3();
        for (const p of this._result.parts) for (let i = 0; i < p.positions.length; i += 3) box.expandByPoint(new THREE.Vector3(p.positions[i], p.positions[i + 1], p.positions[i + 2]));
        const moving = this._result.parts.filter(p => p.moves && p.kind === 'cloth');
        if (which === 'close' && moving.length) {
            const c = new THREE.Box3();
            for (const cloth of moving) for (let i = 0; i < cloth.positions.length; i += 3) c.expandByPoint(new THREE.Vector3(cloth.positions[i], cloth.positions[i + 1], cloth.positions[i + 2]));
            view.target.copy(c.getCenter(new THREE.Vector3()));
            view.distance = Math.max(0.8, c.getSize(new THREE.Vector3()).length() * 1.5);
        } else {
            const size = box.getSize(new THREE.Vector3());
            view.target.copy(box.getCenter(new THREE.Vector3()));
            const halfY=THREE.MathUtils.degToRad(view.camera.fov)/2,halfX=Math.atan(Math.tan(halfY)*view.camera.aspect);
            view.distance=Math.max(.04,size.length()*.5/Math.sin(Math.min(halfX,halfY))*1.06);
        }
        this._draw();
    }

    _draw() {
        const view = this._view;
        if (!view || view.frame) return;
        view.frame = requestAnimationFrame(() => { view.frame = 0; this._render(); });
    }

    _render() {
        const view = this._view;
        if (!view) return;
        const c = view.camera, t = view.target;
        c.position.set(t.x + Math.sin(view.yaw) * Math.cos(view.pitch) * view.distance, t.y + Math.sin(view.pitch) * view.distance, t.z + Math.cos(view.yaw) * Math.cos(view.pitch) * view.distance);
        c.lookAt(t);
        view.renderer.render(view.scene, c);
    }

    _queueRebuild() {
        if (this._pending) return;
        this._pending = requestAnimationFrame(() => { this._pending = 0; this._rebuild(); });
    }

    /** What the meshes, bones and the running cloth are made of: changing any of it starts them over. */
    _structure(result) {
        // Where every vertex stands, summed: a reshaped part with as many vertices is still a new shape.
        const sum = (positions, colors) => { let s = 0; for (let i = 0; i < positions.length; i++) s += positions[i] * ((i % 7) + 1); if (colors) for (let i = 0; i < colors.length; i++) s += colors[i] * 7.31; return s.toFixed(5); };
        const materialLayout=p=>JSON.stringify([p.kind==='cloth',p.texture||'',p.normalTexture||'',p.metallicRoughnessTexture||'',p.emissiveTexture||'',!!p.doubleSided,!!p.blend]);
        return result.kind + '|' + result.bones.map(b => b.head.map(v => v.toFixed(4)).join(',')).join(';') + '|' + result.parts.map(p => [p.name, p.positions.length, p.index.length, p.cutout ? 1 : 0, materialLayout(p), sum(p.positions, p.colors)].join(':')).join(';')
            + '|' + RRPropModel.clothsOf(result).map(c => Array.from(c.setup.holes || []).join('')).join('/');
    }

    _rebuild() {
        const view = this._view;
        if (!view) return;
        const kind = RRPropModel.kindOf(this.recipe);
        if (this._loadingKind && (this._loadingKind !== kind.id || kind.ready?.())) {
            this._loadingKind = null;
            this._status('');
        }
        if (kind.prepare && !kind.ready()) {
            this._loadingKind = kind.id;
            this._result = null;
            if (view.group) view.group.visible = false;
            this._syncMotion();
            this._status(this._t('Loading equipment…'));
            if (this._preparing !== kind) {
                this._preparing = kind;
                kind.prepare().then(() => {
                    if (this._view && this.kind === kind.id) this._queueRebuild();
                }).catch(error => {
                    console.error('[PropBuilder] prepare', error);
                    if (this._view && this.kind === kind.id) this._status(this._t('This prop could not be built.'), 'error');
                }).finally(() => { if (this._preparing === kind) this._preparing = null; });
            }
            return;
        }
        let result;
        try {
            result = RRPropModel.build(this.recipe, this.cache, { textureSize: this._quick ? 512 : 1024, images: this._images });
        } catch (error) {
            console.error('[PropBuilder] build', error);
            this._status(this._t('This prop could not be built.'), 'error');
            return;
        }
        this._quick = false;
        view.group.visible = true;
        if (result.imageMissing) this._loadImage(result.imageName);
        const structure = this._structure(result), layout = structure.replace(/:-?[\d.]+(?=;|\|)/g, '');
        const same = view.structure === structure && view.meshes.length;
        this._result = result;
        if (same) {
            // A coating atlas can repack UV charts between drag and final
            // resolutions without changing vertex positions or material slots.
            result.parts.forEach((part,k)=>{const uv=view.meshes[k].geometry.getAttribute('uv');if(uv&&part.uvs){uv.array.set(part.uvs);uv.needsUpdate=true;}});
            this._swapTextures(result);
            this._applyMaterials(result);
        } else if (view.layout === layout && view.meshes.length === result.parts.length) {
            // Reshaped or recolored with as many vertices and the same bones (a profile dragged, a pole's color): the
            // same meshes take the new places and colors, and a cloth flies on.
            result.parts.forEach((part, k) => {
                const g = view.meshes[k].geometry;
                for (const [name, data] of [['position', part.positions], ['normal', part.normals], ['uv', part.uvs], ['color', part.colors]]) {
                    const at = g.getAttribute(name);
                    if (at && data && at.array.length === data.length) { at.array.set(data); at.needsUpdate = true; }
                }
                g.computeBoundingSphere();
            });
            view.structure = structure;
            this._swapTextures(result);
            this._applyMaterials(result);
        } else { this._show(result, structure); view.layout = layout; }
        if (!same) this._stage(result);
        this._playClip(result);
        // The running cloth takes a new wind or fabric as it flies.
        if (view.sims) RRPropModel.clothsOf(result).forEach((c, i) => { if (view.sims[i]) { view.sims[i].cloth = c; RRPropCloth.configure(view.sims[i].state, c.setup); } });
        this._loopFor = null;
        if (this.motion === 'loop') this._bakeLoop();
        const editor = this.root.querySelector('.rr-prop-profile-canvas');
        if (editor && editor._draw) editor._draw();
        const readout = this.root.querySelector('.rr-c3d-readout');
        if (readout) {
            const s = RRPropModel.stats(result);
            readout.textContent = this._t('{n} triangles', { n: s.triangles.toLocaleString() }) + (RRPropModel.moves(result) ? ' · ' + this._t('{n} bones', { n: s.bones }) : '') + (result.placeSize ? ' · ' + this._t('Place at size {n}', { n: result.placeSize }) : '');
        }
        this._syncMotion();
        this._draw();
    }

    _clearModel() {
        const view = this._view;
        if (!view) return;
        if (view.mixer) { view.mixer.stopAllAction(); view.mixer.uncacheRoot(view.group); }
        for (const m of view.meshes) { m.geometry.dispose(); m.material.dispose(); view.group.remove(m); }
        for (const b of view.bones) if (b.parent === view.group) view.group.remove(b);
        if (view.skeleton) view.skeleton.dispose();
        view.meshes = []; view.bones = []; view.skeleton = null; view.mixer = null; view.action = null; view.sim = null; view.structure = null;
        view.clipAction = null; view.clipKey = null;
    }

    _texture(name, tex, color) {
        const view = this._view, kept = view.textures.get(name);
        if (kept && kept.data === tex.data) return kept.texture;
        if (kept && kept.texture.image.width === tex.width && kept.texture.image.height === tex.height) {
            kept.texture.image.data = tex.data; kept.texture.needsUpdate = true; kept.data = tex.data;
            return kept.texture;
        }
        if (kept) kept.texture.dispose();
        const t = new THREE.DataTexture(tex.data, tex.width, tex.height, THREE.RGBAFormat);
        t.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
        t.flipY = false;
        if(tex.repeat)t.wrapS=t.wrapT=THREE.RepeatWrapping;
        t.generateMipmaps = true;
        t.minFilter = THREE.LinearMipmapLinearFilter;
        t.magFilter = THREE.LinearFilter;
        t.anisotropy = 8;
        t.needsUpdate = true;
        view.textures.set(name, { data: tex.data, texture: t });
        return t;
    }

    _swapTextures(result) {
        for (const [name, tex] of Object.entries(result.textures || {})) {
            if (!tex) continue;
            const kept = this._view.textures.get(name);
            const fresh = this._texture(name, tex, !/normal|surface/.test(name));
            if (kept && kept.texture !== fresh) for (const m of this._view.meshes) { if (m.material.map === kept.texture) m.material.map = fresh; if (m.material.normalMap === kept.texture) m.material.normalMap = fresh; if (m.material.emissiveMap === kept.texture) m.material.emissiveMap = fresh; if(m.material.roughnessMap===kept.texture)m.material.roughnessMap=fresh;if(m.material.metalnessMap===kept.texture)m.material.metalnessMap=fresh; m.material.needsUpdate = true; }
        }
    }

    /** Colors, roughness and how much cloth shines, on the materials already made. */
    _applyMaterials(result) {
        result.parts.forEach((part, k) => {
            const m = this._view.meshes[k] && this._view.meshes[k].material;
            if (!m) return;
            if (!part.texture && !part.colors) m.color.set(part.color || '#bbbbbb');
            m.roughness = part.roughness ?? 0.6;
            m.metalness = part.metalness ?? 0;
            m.opacity = part.opacity ?? 1;
            const transparent = m.opacity < 1 || !!part.blend;
            if (m.transparent !== transparent) { m.transparent = transparent; m.needsUpdate = true; }
            m.depthWrite = !transparent;
            this._view.meshes[k].castShadow = !transparent;
            if(m.emissive){m.emissive.set(part.emissive||'#000000');m.emissiveIntensity=part.emissiveIntensity??1.4;}
            if (m.sheen !== undefined && part.kind === 'cloth') m.sheen = result.recipe.cloth && result.recipe.cloth.fabric === 'silk' ? 0.6 : 0.25;
        });
    }

    _material(part, result) {
        const tex = part.texture && result.textures[part.texture];
        const cloth = part.kind === 'cloth';
        const Material = cloth && !this._weak ? THREE.MeshPhysicalMaterial : THREE.MeshStandardMaterial;
        const m = new Material({
            color: tex || part.colors ? 0xffffff : new THREE.Color(part.color || '#bbbbbb'),
            map: tex ? this._texture(part.texture, tex, true) : null,
            vertexColors: !!part.colors,
            roughness: part.roughness ?? 0.6, metalness: part.metalness ?? 0,
            opacity: part.opacity ?? 1, transparent: (part.opacity ?? 1) < 1, depthWrite: (part.opacity ?? 1) >= 1,
            side: part.doubleSided ? THREE.DoubleSide : THREE.FrontSide,
            alphaTest: part.cutout ? (part.alphaCutoff ?? 0.5) : 0
        });
        const normal = part.normalTexture && result.textures[part.normalTexture];
        if (normal) { m.normalMap = this._texture(part.normalTexture, normal, false); m.normalScale = new THREE.Vector2(part.normalScale ?? 1, part.normalScale ?? 1); }
        const surface=part.metallicRoughnessTexture&&result.textures[part.metallicRoughnessTexture];
        if(surface)m.roughnessMap=m.metalnessMap=this._texture(part.metallicRoughnessTexture,surface,false);
        if (part.cutout) m.alphaToCoverage = true;
        if (part.emissive) { m.emissive = new THREE.Color(part.emissive); m.emissiveIntensity = part.emissiveIntensity ?? 1.4; }
        // Containers: a glow drawn from its picture (lamps, a display), halos blended by their alpha.
        if (part.emissive && part.emissiveTexture && result.textures[part.emissiveTexture]) m.emissiveMap = this._texture(part.emissiveTexture, result.textures[part.emissiveTexture], true);
        if (part.blend) { m.transparent = true; m.depthWrite = false; }
        // Cloth: a soft sheen at grazing angles in its own colors; silk shines more.
        if (cloth && m.isMeshPhysicalMaterial) { m.sheen = result.recipe.cloth && result.recipe.cloth.fabric === 'silk' ? 0.6 : 0.25; m.sheenRoughness = 0.5; m.sheenColor = new THREE.Color(0.85, 0.85, 0.85); if (m.map) m.sheenColorMap = m.map; m.specularIntensity = 0.25; }
        return m;
    }

    _show(result, structure) {
        const view = this._view;
        this._clearModel();
        view.structure = structure;
        const bones = result.bones.map(b => { const bone = new THREE.Bone(); bone.name = b.name; return bone; });
        result.bones.forEach((b, i) => {
            const parent = b.parent >= 0 ? result.bones[b.parent].head : [0, 0, 0];
            bones[i].position.set(b.head[0] - parent[0], b.head[1] - parent[1], b.head[2] - parent[2]);
            if (b.parent >= 0) bones[b.parent].add(bones[i]); else view.group.add(bones[i]);
        });
        view.group.updateMatrixWorld(true);
        const skeleton = new THREE.Skeleton(bones);
        for (const part of result.parts) {
            const g = new THREE.BufferGeometry();
            g.setAttribute('position', new THREE.BufferAttribute(Float32Array.from(part.positions), 3));
            g.setAttribute('normal', new THREE.BufferAttribute(Float32Array.from(part.normals), 3));
            if (part.uvs) g.setAttribute('uv', new THREE.BufferAttribute(Float32Array.from(part.uvs), 2));
            if (part.colors) g.setAttribute('color', new THREE.BufferAttribute(Float32Array.from(part.colors), 3));
            g.setAttribute('skinIndex', new THREE.BufferAttribute(Uint16Array.from(part.joints), 4));
            g.setAttribute('skinWeight', new THREE.BufferAttribute(Float32Array.from(part.weights), 4));
            g.setIndex(new THREE.BufferAttribute(Uint32Array.from(part.index), 1));
            if (part.normalTexture) g.computeTangents?.();
            const mesh = new THREE.SkinnedMesh(g, this._material(part, result));
            mesh.frustumCulled = false;
            mesh.castShadow = (part.opacity ?? 1) >= 1 && !part.blend;
            mesh.receiveShadow = true;
            mesh.bind(skeleton);
            view.group.add(mesh);
            view.meshes.push(mesh);
        }
        view.bones = bones;
        view.skeleton = skeleton;
        view.mixer = new THREE.AnimationMixer(view.group);
        view.action = null;
        view.sims = RRPropModel.clothsOf(result).map(c => ({ cloth: c, state: RRPropCloth.create(c.setup), T: new Float32Array(c.grid.count * 3), Q: new Float32Array(c.grid.count * 4) }));
        view.scratch = new Float32Array(18);
        if (view.sims.length) {
            // A head start, so a new cloth is already flying when it shows.
            for (const sim of view.sims) RRPropCloth.advance(sim.state, 1.2);
            this._advance(0);
        }
    }

    /** Frame small equipment as well as large props, including edits that reuse the meshes. */
    _stage(result) {
        const view = this._view;
        // Framed afresh when the prop's size changes much.
        const h = result.height || 2, extent = Math.max(h, result.recipe.cloth ? result.recipe.cloth.width * 1.5 : 0);
        const type=RRPropCatalog.typeOf(result.recipe)?.id || result.kind;
        const selected=view.stagedType!==type;
        if(selected){view.pitch=['gun','sword'].includes(result.kind)?.92:.22;view.stagedType=type;}
        const first = selected || !view.framedFor || Math.abs(Math.log(extent / view.framedFor)) > 0.3;
        view.extent = extent;
        view.minDistance = Math.max(.01, Math.min(.4, extent * .25));
        view.camera.near = Math.max(.0005, Math.min(.05, view.minDistance * .1));
        view.camera.updateProjectionMatrix();
        view.floor.scale.setScalar(Math.max(1.2, extent * 0.45));
        // Walls behind or beside what hangs on them, at most two.
        const walls = result.walls || (result.wall ? [result.wall] : []);
        if (!view.wall2) { view.wall2 = view.wall.clone(); view.scene.add(view.wall2); }
        [view.wall, view.wall2].forEach((mesh, k) => {
            const w = walls[k];
            mesh.visible = !!w;
            if (!w) return;
            const span = Math.max(2.5, extent * 1.6), tall = Math.max(3, (result.height || 2) * 1.3);
            mesh.scale.set(span, tall, 1);
            if (w.normal[0]) { mesh.rotation.set(0, w.normal[0] > 0 ? Math.PI / 2 : -Math.PI / 2, 0); mesh.position.set(w.at - 0.002 * w.normal[0], tall / 2, 0); }
            else { mesh.rotation.set(0, 0, 0); mesh.position.set(0, tall / 2, w.at - 0.002); }
        });
        view.blob.scale.setScalar(Math.max(0.3, extent * 0.12));
        const box = new THREE.Box3();
        for (const p of result.parts) for (let i = 0; i < p.positions.length; i += 3) box.expandByPoint(new THREE.Vector3(p.positions[i], p.positions[i + 1], p.positions[i + 2]));
        const mid = box.getCenter(new THREE.Vector3()), r = box.getSize(new THREE.Vector3()).length() * 0.6 + 0.5;
        view.floor.position.y = result.kind === 'accessory' ? box.min.y - .001 : 0;
        view.blob.position.y = view.floor.position.y + .002;
        view.key.target.position.copy(mid);
        view.key.position.copy(mid).add(new THREE.Vector3(2.2, 4, 3).normalize().multiplyScalar(r * 3));
        if (view.key.castShadow) {
            view.key.shadow.normalBias = Math.min(.02, extent * .005);
            const c = view.key.shadow.camera;
            c.left = -r; c.right = r; c.top = r; c.bottom = -r; c.near = 0.1; c.far = r * 6;
            c.updateProjectionMatrix();
        }
        if (first) { view.framedFor = extent; this._frame('all'); }
    }

    /**
     * Containers: a build's own clip, when it has one and nothing simulated
     * moves it, played on the view's bones; made again when its keys change.
     */
    _playClip(result) {
        const view = this._view;
        const clip = !RRPropModel.moves(result) && result.clips && result.clips[0];
        const key = clip ? view.structure + '|' + clip.tracks.map(t => t.bone + t.path + Array.from(t.times || clip.times).join(',')).join('|') : null;
        if (view.clipKey === key && (view.clipAction || !clip)) return;
        if (view.clipAction) { view.clipAction.stop(); view.clipAction = null; }
        view.clipKey = key;
        if (!clip || !view.mixer) return;
        const tracks = clip.tracks.map(t => {
            const name = view.bones[t.bone].name, times = Array.from(t.times || clip.times), values = Array.from(t.values);
            if (t.path === 'translation') return new THREE.VectorKeyframeTrack(name + '.position', times, values);
            if (t.path === 'scale') return new THREE.VectorKeyframeTrack(name + '.scale', times, values);
            return new THREE.QuaternionKeyframeTrack(name + '.quaternion', times, values);
        });
        view.mixer.uncacheRoot(view.group);
        view.clipAction = view.mixer.clipAction(new THREE.AnimationClip(clip.name, -1, tracks));
        view.clipAction.play();
    }

    // ── the saved loop ─────────────────────────────────────────────────────
    _setMotion(motion) {
        this.motion = motion;
        this._syncMotion();
        const view = this._view;
        if (!view) return;
        if (motion === 'loop') this._bakeLoop();
        else if (view.action) { view.action.stop(); view.action = null; }
    }

    _syncMotion() {
        if (!this.root) return;
        const has = !!(this._result ? RRPropModel.moves(this._result) : this._ui().moves && this._ui().moves(this.recipe));
        const panel = this.root.querySelector('.rr-prop-motion');
        if (panel) panel.hidden = !has;
        this.root.querySelectorAll('[data-motion]').forEach(b => b.classList.toggle('is-active', b.dataset.motion === this.motion));
    }

    /** The loop Save writes, baked off the page, then played on the view's bones. */
    _bakeLoop() {
        const result = this._result;
        if (!result || !RRPropModel.moves(result)) return;
        const key = JSON.stringify([RRPropModel.clothsOf(result).map(c => [c.setup.wind, c.setup.fabric]), this._view.structure]);
        if (this._loopFor === key && this._view.action) return;
        this._loopFor = key;
        this._status(this._t('Baking the loop…'));
        this._bake(result).then(loop => {
            if (this._loopFor !== key || !this._view || this._result !== result) return;
            this._status('');
            this._playLoop(loop);
        }).catch(error => { console.error('[PropBuilder] bake', error); this._status(this._t('The loop could not be baked.'), 'error'); });
    }

    _playLoop(loop) {
        const view = this._view;
        if (view.action) view.action.stop();
        const tracks = [];
        for (let b = 0; b < loop.T.length; b++) {
            const name = view.bones[b + 1].name;
            tracks.push(new THREE.VectorKeyframeTrack(name + '.position', Array.from(loop.times), Array.from(loop.T[b])));
            tracks.push(new THREE.QuaternionKeyframeTrack(name + '.quaternion', Array.from(loop.times), Array.from(loop.Q[b])));
        }
        view.mixer.uncacheRoot(view.group);
        view.action = view.mixer.clipAction(new THREE.AnimationClip('Wave', -1, tracks));
        view.action.play();
    }

    /** A prop's loop: each cloth baked in a worker (the page never stops), or here when no worker can be made; then put together. */
    _bake(result) {
        const worker = this._bakeWorker();
        if (!worker) return Promise.resolve(RRPropModel.bake(result));
        const jobs = RRPropModel.clothsOf(result).map(c => new Promise((resolve, reject) => {
            const id = (this._job = (this._job || 0) + 1);
            this._waiting = this._waiting || new Map();
            this._waiting.set(id, { resolve, reject });
            worker.postMessage({ id, setup: c.setup, grid: { bi: c.grid.bi, bj: c.grid.bj, count: c.grid.count, lead: c.grid.lead } });
        }));
        return Promise.all(jobs).then(per => RRPropModel.assemble(result, per));
    }

    _bakeWorker() {
        if (this._worker !== undefined && this._worker !== null) return this._worker;
        try {
            const fs = require('fs'), path = require('path');
            const dir = path.join(path.dirname(decodeURIComponent(window.location.pathname)), 'src', 'forge', 'Props');
            const source = fs.readFileSync(path.join(dir, 'PropCloth.js'), 'utf8') + `
                self.onmessage = e => {
                    const C = self.RRPropCloth, { id, setup, grid } = e.data;
                    try {
                        const baked = C.bake(setup);
                        const t = C.tracks(baked, setup.rest, grid);
                        const buffers = [t.times.buffer].concat(t.T.map(a => a.buffer), t.Q.map(a => a.buffer));
                        self.postMessage({ id, times: t.times, T: t.T, Q: t.Q }, buffers);
                    } catch (error) { self.postMessage({ id, error: String(error && error.message || error) }); }
                };`;
            const worker = new Worker(URL.createObjectURL(new Blob([source.replace("typeof window !== 'undefined' ? window : globalThis", 'self')], { type: 'text/javascript' })));
            worker.onmessage = e => {
                const job = this._waiting && this._waiting.get(e.data.id);
                if (!job) return;
                this._waiting.delete(e.data.id);
                if (e.data.error) job.reject(new Error(e.data.error)); else job.resolve({ times: e.data.times, T: e.data.T, Q: e.data.Q });
            };
            this._worker = worker;
        } catch (error) {
            console.warn('[PropBuilder] bake worker', error);
            this._worker = null;
        }
        return this._worker;
    }

    // ── pictures from the project ──────────────────────────────────────────
    _picturesFolder() {
        const project = this._project();
        return project ? require('path').join(project.path, 'img', 'pictures') : null;
    }

    /** A picture from img/pictures chosen by looking at it; `onPick(name)`. */
    _choosePicture(current, onPick) {
        const folder = this._picturesFolder(), picker = window.reactor?.databaseEditorUI, assets = window.RRAssetFiles;
        if (!folder || !picker || typeof picker.showImagePicker !== 'function' || !assets) return;
        let files = [];
        try { files = assets.listImageReferences(folder); } catch (error) { files = []; }
        if (!files.length) { RRDialog.alert(this._t('No pictures in img/pictures yet. Add one there to use it here.'), { title: this._t('3D Prop Builder') }); return; }
        picker.showImagePicker(this._t('Choose a picture'), files, name => { if (name) onPick(name); }, name => assets.imageUrlFor(folder, name), current || undefined,
            { selectButtonLabel: this._t('Use This Picture'), zIndex: 10500 });
    }

    /** A picture's pixels, read once (at most 1024 on a side) and kept by name; the view is built again when it is in. */
    _loadImage(name) {
        if (!name || this._images[name] || (this._loadingImages || (this._loadingImages = new Set())).has(name)) return;
        const folder = this._picturesFolder(), url = folder && window.RRAssetFiles ? window.RRAssetFiles.imageUrlFor(folder, name) : '';
        if (!url) return;
        this._loadingImages.add(name);
        const img = new Image();
        img.onload = () => {
            this._loadingImages.delete(name);
            const scale = Math.min(1, 1024 / Math.max(img.naturalWidth, img.naturalHeight));
            const w = Math.max(1, Math.round(img.naturalWidth * scale)), h = Math.max(1, Math.round(img.naturalHeight * scale));
            const c = document.createElement('canvas');
            c.width = w; c.height = h;
            const g = c.getContext('2d');
            g.drawImage(img, 0, 0, w, h);
            this._images[name] = { width: w, height: h, data: new Uint8Array(g.getImageData(0, 0, w, h).data.buffer), version: Date.now() };
            this._renderPanel();
            this._queueRebuild();
        };
        img.onerror = () => { this._loadingImages.delete(name); this._status(this._t('{name} could not be opened.', { name }), 'error'); };
        img.src = url;
    }

    // ── files ──────────────────────────────────────────────────────────────
    _folderName(name) { return String(name || '').trim().replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, ' ').slice(0, 48); }

    _propsDir() {
        const project = this._project();
        return project ? require('path').join(project.path, '3d', 'Props') : null;
    }

    _savedNames() {
        const fs = require('fs'), path = require('path'), dir = this._propsDir();
        if (!dir || !fs.existsSync(dir)) return [];
        return fs.readdirSync(dir, { withFileTypes: true }).filter(e => e.isDirectory() && fs.existsSync(path.join(dir, e.name, 'prop.json'))).map(e => e.name).sort((a, b) => a.localeCompare(b));
    }

    _showGallery() {
        const fs = require('fs'), path = require('path');
        const box = this.root.querySelector('.rr-c3d-gallery');
        const cards = this._savedNames().map(name => {
            const thumb = path.join(this._propsDir(), name, 'thumbnail.png');
            const src = fs.existsSync(thumb) ? 'data:image/png;base64,' + fs.readFileSync(thumb).toString('base64') : '';
            return `<button class="rr-c3d-saved" data-name="${rrEscapeHtml(name)}">${src ? `<img src="${src}" alt="">` : '<span class="rr-c3d-nothumb">?</span>'}<span>${rrEscapeHtml(name)}</span></button>`;
        }).join('');
        box.innerHTML = `<div class="rr-c3d-gallery-head"><span>${this._t('Open a saved prop')}</span><button class="rr-c3d-remove" data-close title="${this._t('Close')}">✕</button></div>
            <div class="rr-c3d-gallery-grid">${cards || `<p class="rr-c3d-note">${this._t('No props saved in this project yet. Save to Project puts one here.')}</p>`}</div>`;
        box.hidden = false;
        const close = () => { box.hidden = true; document.removeEventListener('keydown', onKey, true); };
        const onKey = e => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
        document.addEventListener('keydown', onKey, true);
        box.onclick = e => {
            if (e.target.closest('[data-close]')) { close(); return; }
            const card = e.target.closest('.rr-c3d-saved');
            if (card) { close(); this._openSaved(card.dataset.name); }
        };
    }

    _openSaved(name) {
        const fs = require('fs'), path = require('path');
        try {
            const data = JSON.parse(fs.readFileSync(path.join(this._propsDir(), name, 'prop.json'), 'utf8'));
            this.name = name;
            const input = this.root.querySelector('.rr-c3d-name-input');
            if (input) input.value = name;
            this.tab = null;
            this._replace(data.recipe || data);
            this._status(this._t('Opened {name}.', { name }), 'ok');
        } catch (error) {
            console.error('[PropBuilder] open', error);
            this._status(this._t('{name} could not be opened.', { name }), 'error');
        }
    }

    _png(tex) {
        const c = document.createElement('canvas');
        c.width = tex.width; c.height = tex.height;
        c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(tex.data.buffer.slice(tex.data.byteOffset, tex.data.byteOffset + tex.data.byteLength)), tex.width, tex.height), 0, 0);
        return new Promise((resolve, reject) => c.toBlob(b => (b ? b.arrayBuffer().then(a => resolve(new Uint8Array(a)), reject) : reject(new Error('png'))), 'image/png'));
    }

    _thumbnail() {
        const view = this._view;
        if (!view) return null;
        this._render();
        const src = view.renderer.domElement, size = 256, c = document.createElement('canvas');
        c.width = c.height = size;
        const s = Math.min(src.width, src.height);
        c.getContext('2d').drawImage(src, (src.width - s) / 2, (src.height - s) / 2, s, s, 0, 0, size, size);
        return Buffer.from(c.toDataURL('image/png').split(',')[1], 'base64');
    }

    async save() {
        const project = this._project();
        if (!project) return;
        let name = this._folderName(this.name);
        if (!name) {
            name = this._folderName(await RRDialog.prompt(this._t('Name this prop:'), { title: this._t('Save to Project'), value: this._t(this._ui().placeholder) }));
            if (!name) return;
            this.name = name;
            const input = this.root.querySelector('.rr-c3d-name-input');
            if (input) input.value = name;
        }
        const fs = require('fs'), path = require('path');
        const folder = path.join(this._propsDir(), name), file = path.join(folder, 'source', name + '.glb');
        if (fs.existsSync(file) && !await RRDialog.confirm(this._t('Replace the saved prop {name}?', { name }), { title: this._t('Save to Project'), ok: this._t('Replace'), danger: true })) return;
        this._status(this._t('Saving…'));
        try {
            const recipe = JSON.parse(JSON.stringify(this.recipe));
            const kind = RRPropModel.kindOf(recipe);
            await kind.prepare?.();
            const stillCurrent = this._view && JSON.stringify(this.recipe) === JSON.stringify(recipe);
            if (kind.prepare && stillCurrent) this._rebuild();
            const thumb = stillCurrent ? this._thumbnail() : null;
            this._status(this._t('Saving…'));
            let result = RRPropModel.build(recipe, this.cache, { textureSize: 1024, images: this._images });
            if (RRPropModel.moves(result)) {
                const loop = await this._bake(result);
                result = RRPropModel.build(recipe, this.cache, { textureSize: 1024, images: this._images, loop });
            }
            const glb = await RRPropModel.toGlb(result, name, tex => this._png(tex));
            const atomic = window.RRWriteFileAtomicSync || ((io, target, data) => io.writeFileSync(target, data));
            fs.mkdirSync(path.dirname(file), { recursive: true });
            atomic(fs, file, glb);
            atomic(fs, path.join(folder, 'prop.json'), JSON.stringify({ builder: 'prop', version: 1, recipe }, null, 2) + '\n');
            if (thumb) atomic(fs, path.join(folder, 'thumbnail.png'), thumb);
            // The loop and the origin go in model.json; what else the 3D Models page keeps there stays.
            const sidecarFile = path.join(folder, 'model.json');
            let kept = {};
            try { kept = JSON.parse(fs.readFileSync(sidecarFile, 'utf8')); } catch (_) { kept = {}; }
            const own = RRPropModel.sidecar(result);
            if (!own.animations) delete kept.animations;
            atomic(fs, sidecarFile, JSON.stringify(Object.assign(kept, own, { transform: Object.assign({}, kept.transform || {}, own.transform) }), null, 2) + '\n');
            this._status(this._t('Saved to 3D Models › Props/{name}.', { name }), 'ok');
            window.dispatchEvent(new CustomEvent('rr-models-changed', { detail: { name: 'Props/' + name } }));
        } catch (error) {
            console.error('[PropBuilder] save', error);
            this._status(this._t('{name} could not be saved.', { name }), 'error');
        }
    }
}

/** A small picture of a flag design (64 x 40), for its tile. */
PropBuilder.designPicture = function(design, w, h, images) {
    const c = document.createElement('canvas');
    c.width = w || 64; c.height = h || 40;
    const g = c.getContext('2d'), img = g.createImageData(c.width, c.height), out = [0, 0, 0, 255];
    const P = RRFlagDesign.prepare(design, c.height / c.width, images || {});
    for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) {
        RRFlagDesign.colorAt(P, (x + 0.5) / c.width, (y + 0.5) / c.height, out);
        const o = (y * c.width + x) * 4;
        img.data[o] = out[0]; img.data[o + 1] = out[1]; img.data[o + 2] = out[2]; img.data[o + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    return c.toDataURL('image/png');
};

/** The pages of the Flag and From picture kinds (RRPropCatalog.ui). */
RRPropCatalog.ui('flag', {
        placeholder: 'Flag',
        tabs: [['pole', 'Pole'], ['cloth', 'Cloth'], ['design', 'Design'], ['wind', 'Wind']],
        reset: recipe => RRFlagProp.withForm(recipe.form),
        moves: () => true,
        panel(tab) {
            const F = RRFlagProp, r = this.recipe;
            if (tab === 'pole') {
                const def = F.POLE_BY_ID.get(r.pole.type);
                const tiles = this._tiles('pole', F.POLES.map(p => ({ id: p.id, label: p.label })), r.pole.type, 2);
                let html = this._section('Pole') + tiles
                    + this._slider({ path: 'pole.height', label: r.pole.type === 'bracket' ? 'Length' : 'Height', range: def.height, step: 0.05, format: 'm' })
                    + this._select('pole.finial', 'Finial', F.FINIALS);
                if (r.pole.type === 'metal') html += this._check('pole.rope', 'Halyard rope');
                if (r.pole.type === 'bracket') html += this._section('Placement') + this._slider({ path: 'pole.mount', label: 'Height', range: [0.3, 8], step: 0.05, format: 'm' });
                html += this._section('Colors') + this._color('pole.color', 'Pole', ['#c3c7cc', '#2a2a2e', '#7a5434', '#4a3020', '#e8e4dc'])
                    + this._color('pole.finialColor', 'Finial', ['#d4a940', '#b8b8be', '#2a2a2e', '#b06a3a']);
                return html;
            }
            if (tab === 'cloth') {
                const cap = F.clothCap(r.pole.type, r.pole.height);
                let html = this._section('Size') + this._select('cloth.aspect', 'Shape', F.ASPECTS.map(a => [a[0], a[1]]))
                    + this._slider({ path: 'cloth.width', label: 'Width', range: [0.15, 6], step: 0.05, format: 'm' })
                    + this._slider({ path: 'cloth.height', label: 'Height', range: [0.1, Math.max(0.2, Math.floor(Math.min(8, cap) * 20) / 20)], step: 0.05, format: 'm' })
                    + this._select('cloth.cut', 'Fly end', F.CUTS);
                html += this._section('Fabric') + this._tiles('fabric', F.FABRICS.map(([id, label]) => ({ id, label })), r.cloth.fabric, 2);
                if (r.cloth.fabric === 'tattered') html += this._slider({ path: 'cloth.wear', label: 'Wear', range: [0, 1] });
                return html;
            }
            if (tab === 'design') return this._designPanel('design');
            return this._section('Wind') + this._slider({ path: 'wind.strength', label: 'Strength', range: [0, 1], format: 'wind', ends: ['Calm', 'Storm'] })
                + this._slider({ path: 'wind.gust', label: 'Gusts', range: [0, 1], ends: ['Steady', 'Gusty'] })
                + this._slider({ path: 'wind.direction', label: 'Direction', range: [-90, 90], step: 1, format: 'deg', ends: ['Toward the back', 'Toward the front'] });
        },
        choose(path, value) {
            if (path !== 'cloth.aspect') return false;
            const preset = RRFlagProp.ASPECTS.find(a => a[0] === value);
            this._set('cloth.aspect', value);
            if (preset && preset[3]) this._set('cloth.cut', preset[3]);
            else if (preset && value !== 'custom' && this.recipe.cloth.cut !== 'straight' && RRFlagProp.ASPECTS.some(a => a[3] && a[3] === this.recipe.cloth.cut)) this._set('cloth.cut', 'straight');
            this._commit(); this._renderPanel(); this._queueRebuild();
            return true;
        },
        act(act, b) {
            const r = JSON.parse(JSON.stringify(this.recipe));
            if (act === 'pole') { if (b.dataset.id !== r.pole.type) this._replace(RRFlagProp.withPole(r, b.dataset.id)); return; }
            if (act === 'fabric') { r.cloth.fabric = b.dataset.id; this._replace(r); return; }
            if (this._designAct(act, b)) return;
        }
});

RRPropCatalog.ui('picture', {
    placeholder: 'Sign',
    tabs: [['picture', 'Picture'], ['shape', 'Shape']],
    reset: recipe => ({ kind: 'picture', image: recipe.image || '', mode: recipe.mode || 'cutout' }),
    moves: r => r.mode === 'framed' && r.framed.object === 'banner',
    panel(tab) {
        const P = RRPictureProp, r = this.recipe;
        const name = r.image;
        const img = name && this._images[name];
        const thumb = img ? this._mini('picture:' + name, () => PropBuilder.imagePicture(img, 80)) : '';
        if (tab === 'picture') {
            let html = this._section('Picture') + `<div class="rr-c3d-row rr-prop-picturerow"><span class="rr-c3d-label">${this._t('Picture')}</span>`
                + `<span class="rr-prop-picturename">${thumb ? `<img class="rr-prop-pictureimg" src="${thumb}" alt="">` : ''}${rrEscapeHtml(name || this._t('None'))}</span><button class="rr-btn-chip" data-act="image">${this._t('Choose…')}</button></div>`;
            if (r.mode === 'cutout' || (r.mode === 'turned' && r.turned.fromPicture)) {
                html += this._section('Outline') + this._select('cutout.outline', 'Outline from', P.OUTLINES);
                const usesColor = r.cutout.outline === 'color' || (r.cutout.outline === 'auto' && img && !PropBuilder.imageHasAlpha(img));
                if (usesColor) html += this._slider({ path: 'cutout.tolerance', label: 'Tolerance', range: [0, 1] });
            }
            return html;
        }
        if (r.mode === 'cutout') {
            return this._section('Shape') + this._slider({ path: 'cutout.size', label: 'Height', range: [0.1, 4], step: 0.05, format: 'm' })
                + this._slider({ path: 'cutout.thickness', label: 'Board thickness', range: [0.005, 0.3], step: 0.005, format: 'm' })
                + this._select('cutout.edge', 'Edge shape', P.EDGES) + this._select('cutout.back', 'Back side', P.BACKS)
                + (r.cutout.back === 'color' ? this._color('cutout.backColor', 'Back color', ['#5a4632', '#1b1b1f', '#f2efe6', '#8c1c1c']) : '')
                + this._select('cutout.stand', 'Stands on', P.STANDS)
                + (this._result && this._result.pieces > 1 ? this._select('cutout.backing', 'Backing', P.BACKINGS) : '');
        }
        if (r.mode === 'turned') {
            return this._section('Outline to turn') + `<div class="rr-prop-profile"><canvas class="rr-prop-profile-canvas" width="300" height="300"></canvas></div>`
                + this._check('turned.fromPicture', 'Follow the picture')
                + this._section('Shape') + this._slider({ path: 'turned.height', label: 'Height', range: [0.05, 4], step: 0.01, format: 'm' })
                + this._slider({ path: 'turned.segments', label: 'Segments', range: [8, 128], step: 1, format: 'int' })
                + this._select('turned.top', 'Opening', [['open', 'Open top'], ['closed', 'Closed top']])
                + this._slider({ path: 'turned.wall', label: 'Wall thickness', range: [0, 0.1], step: 0.002, format: 'm' })
                + this._section('Look') + this._select('turned.surface', 'Surface', P.SURFACES)
                + (r.turned.surface !== 'picture' ? this._color('turned.color', 'Color', ['#b86a44', '#3a6a8a', '#e8e2cf', '#7a5434', '#8a8e96', '#1b1b1f']) : '');
        }
        let html = this._section('Object') + this._tiles('object', P.OBJECTS.map(([id, label]) => ({ id, label })), r.framed.object, 2)
            + this._slider({ path: 'framed.size', label: 'Size', range: [0.1, 3], step: 0.05, format: 'm' });
        const F = RRFramedProp, f = r.framed;
        if (f.object === 'painting' || f.object === 'poster') {
            html += this._section('Picture frame') + this._tiles('frame-preset', F.PRESETS.map(p => ({ id: p.id, label: p.label })), null, 2)
                + this._select('framed.style', 'Style', F.STYLES);
            if (f.style !== 'none' && f.style !== 'clip') {
                html += this._slider({ path: 'framed.width', label: 'Width', range: [0.01, 0.3], step: 0.005, format: 'm' })
                    + this._slider({ path: 'framed.depth', label: 'Depth', range: [0.008, 0.15], step: 0.002, format: 'm' });
                if (f.style !== 'ornate' && f.style !== 'rustic') html += this._select('framed.edge', 'Edge shape', F.PROFILE_EDGES);
            }
            if (f.style !== 'none') html += this._select('framed.material', 'Material', F.MATERIALS) + (f.material === 'painted' ? this._color('framed.paint', 'Color', ['#f2f0ea', '#1b1b1f', '#2b3a55', '#5a2a22', '#3e5a32']) : '');
            if (f.style !== 'none' && f.style !== 'clip') {
                html += this._check('framed.mat', 'Mat board');
                if (f.mat) html += this._slider({ path: 'framed.matWidth', label: 'Mat width', range: [0.01, 0.4], step: 0.005, format: 'm' }) + this._color('framed.matColor', 'Mat color', ['#f7f5ef', '#e8e0cc', '#1b1b1f', '#2b3a55']);
            }
            if (f.style !== 'none') html += this._check('framed.glass', 'Glass');
            if (!(f.object === 'poster' && f.style === 'none')) html += this._select('framed.mount', 'Displayed on', F.MOUNTS);
            if (f.object === 'poster' && f.style === 'none') html += this._color('framed.color', 'Pins', ['#c8a040', '#1b1b1f', '#a51f2b', '#1f3c78']);
        } else if (f.object === 'crate') {
            html += this._section('Crate') + this._select('framed.wood', 'Wood', F.WOODS) + this._select('framed.banding', 'Banding', F.BANDINGS) + this._select('framed.faces', 'Picture on', F.FACES);
        } else if (f.object === 'book') {
            html += this._section('Book') + this._color('framed.color', 'Cover color', ['#5a2a22', '#1f3c78', '#1d5c34', '#1b1b1f', '#c8a040'])
                + this._slider({ path: 'framed.thickness', label: 'Thickness', range: [0.01, 0.25], step: 0.005, format: 'm' }) + this._check('framed.bands', 'Spine bands');
        }
        return html;
    },
    act(act, b) {
        const r = JSON.parse(JSON.stringify(this.recipe));
        if (act === 'mode') { r.mode = b.dataset.id; this._replace(r); return; }
        if (act === 'object') {
            r.framed.object = b.dataset.id;
            // A poster starts in a clip frame on the wall.
            if (b.dataset.id === 'poster') Object.assign(r.framed, RRFramedProp.PRESETS.find(p => p.id === 'clip').set);
            this._replace(r); return;
        }
        if (act === 'frame-preset') { const p = RRFramedProp.PRESETS.find(x => x.id === b.dataset.id); if (p) { Object.assign(r.framed, p.set); this._replace(r); } return; }
        if (act === 'image') this._choosePicture(r.image, name => { const n = JSON.parse(JSON.stringify(this.recipe)); n.image = name; this._replace(n); });
    }
});

/** A picture's small copy for its row, `size` on its long side. */
PropBuilder.imagePicture = function(img, size) {
    const s = size / Math.max(img.width, img.height), c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(img.width * s)); c.height = Math.max(1, Math.round(img.height * s));
    const full = document.createElement('canvas');
    full.width = img.width; full.height = img.height;
    full.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(img.data.buffer.slice(img.data.byteOffset, img.data.byteOffset + img.data.byteLength)), img.width, img.height), 0, 0);
    c.getContext('2d').drawImage(full, 0, 0, c.width, c.height);
    return c.toDataURL('image/png');
};

PropBuilder.imageHasAlpha = function(img) {
    let clear = 0;
    for (let i = 3; i < img.data.length; i += 4) if (img.data[i] < 128) clear++;
    return clear > img.data.length / 4 * 0.01;
};

/**
 * Turned's profile, drawn over the picture: the right half's points are
 * handles to drag; a double click adds a point, a right click takes one
 * away. Moving a point stops following the picture.
 */
PropBuilder.prototype._profileEditor = function() {
    const canvas = this.root && this.root.querySelector('.rr-prop-profile-canvas');
    if (!canvas || this.kind !== 'picture' || this.recipe.mode !== 'turned') return;
    const g = canvas.getContext('2d'), W = canvas.width, H = canvas.height, pad = 14;
    // What the view last built: the picture's own outline, once the picture is in.
    const guideNow = () => (this._result && this._result.guide) || null;
    const profile = () => { const guide = guideNow(); return this.recipe.turned.fromPicture && guide ? guide.profile : this.recipe.turned.profile; };
    // Height 1 fills the canvas; radius 0.6 reaches its right edge from the middle.
    const sx = (W / 2 - pad) / 0.6, sy = H - pad * 2;
    const toCanvas = ([rad, y]) => [W / 2 + rad * sx, H - pad - y * sy];
    const fromCanvas = (x, y) => [Math.max(0, Math.min(0.6, (x - W / 2) / sx)), Math.max(0, Math.min(1, (H - pad - y) / sy))];
    const css = getComputedStyle(this.root);
    const draw = () => {
        g.clearRect(0, 0, W, H);
        const img = this.recipe.image && this._images[this.recipe.image], guide = guideNow();
        if (img && guide) {
            // The picture under it, its silhouette's height on the canvas's, its middle on the axis.
            if (!canvas._picture || canvas._picture.src !== img) {
                const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
                c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(img.data.buffer.slice(img.data.byteOffset, img.data.byteOffset + img.data.byteLength)), img.width, img.height), 0, 0);
                canvas._picture = { src: img, canvas: c };
            }
            const span = (guide.bottom - guide.top) * img.height, scale = sy / span;
            g.globalAlpha = 0.45;
            g.drawImage(canvas._picture.canvas, W / 2 - guide.axis * img.width * scale, pad - guide.top * img.height * scale, img.width * scale, img.height * scale);
            g.globalAlpha = 1;
        }
        g.strokeStyle = css.getPropertyValue('--color-border-subtle') || '#555';
        g.setLineDash([4, 4]); g.beginPath(); g.moveTo(W / 2, pad / 2); g.lineTo(W / 2, H - pad / 2); g.stroke(); g.setLineDash([]);
        const pts = profile().map(toCanvas);
        const accent = (css.getPropertyValue('--color-accent-bright') || '#4fc3f7').trim();
        g.strokeStyle = accent; g.lineWidth = 2;
        for (const side of [1, -1]) {
            g.beginPath();
            pts.forEach(([x, y], i) => { const px = W / 2 + (x - W / 2) * side; if (i) g.lineTo(px, y); else g.moveTo(px, y); });
            g.globalAlpha = side > 0 ? 1 : 0.45; g.stroke(); g.globalAlpha = 1;
        }
        g.fillStyle = accent;
        for (const [x, y] of pts) { g.beginPath(); g.arc(x, y, 4.5, 0, Math.PI * 2); g.fill(); }
    };
    draw();
    if (canvas._wired) { canvas._draw = draw; return; }
    canvas._wired = true; canvas._draw = draw;
    const local = e => { const b = canvas.getBoundingClientRect(); return [(e.clientX - b.left) * W / b.width, (e.clientY - b.top) * H / b.height]; };
    const nearest = (x, y) => { let best = -1, bd = 12 * 12; profile().map(toCanvas).forEach(([px, py], i) => { const d = (px - x) ** 2 + (py - y) ** 2; if (d < bd) { bd = d; best = i; } }); return best; };
    const own = () => {
        // Moving a point: from here on the profile is the author's own.
        if (this.recipe.turned.fromPicture) { this._set('turned.profile', profile().map(p => p.slice())); this._set('turned.fromPicture', false); }
        return this.recipe.turned.profile.map(p => p.slice());
    };
    let drag = -1;
    canvas.addEventListener('pointerdown', e => {
        const [x, y] = local(e), i = nearest(x, y);
        if (e.button === 2) {
            e.preventDefault();
            if (i >= 0 && profile().length > 3) { const list = own(); list.splice(i, 1); this._set('turned.profile', list); this._commit(); this._renderPanel(); this._queueRebuild(); }
            return;
        }
        if (i >= 0) { drag = i; canvas.setPointerCapture(e.pointerId); }
    });
    canvas.addEventListener('pointermove', e => {
        if (drag < 0) return;
        const list = own(), p = fromCanvas(...local(e));
        // A point stays between its neighbors up the height.
        const lo = drag > 0 ? list[drag - 1][1] + 0.005 : 0, hi = drag < list.length - 1 ? list[drag + 1][1] - 0.005 : 1;
        list[drag] = [p[0], drag === 0 ? 0 : drag === list.length - 1 ? 1 : Math.max(lo, Math.min(hi, p[1]))];
        this._set('turned.profile', list);
        this._quick = true;
        this._queueRebuild();
        draw();
    });
    const end = () => { if (drag >= 0) { drag = -1; this._commit(); this._renderPanel(); this._queueRebuild(); } };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
    canvas.addEventListener('contextmenu', e => e.preventDefault());
    canvas.addEventListener('dblclick', e => {
        const p = fromCanvas(...local(e)), list = own();
        if (p[1] <= 0 || p[1] >= 1) return;
        list.push(p); list.sort((a, b) => a[1] - b[1]);
        this._set('turned.profile', list); this._commit(); this._renderPanel(); this._queueRebuild();
    });
};

/**
 * A design's controls (RRFlagDesign) for the design at `path`: presets, the
 * field and its colors, and the emblems as a short list with the chosen
 * one's settings under it. Its buttons are answered by _designAct.
 */
PropBuilder.prototype._designPanel = function(path) {
    this.designPath = path;
    const D = RRFlagDesign, g = this._get(path), f = g.field;
    const mini = (key, design) => this._mini(key, () => PropBuilder.designPicture(design, 64, 40, this._images));
    let html = this._section('Presets') + this._tiles('design-preset', D.PRESETS.map(p => ({ id: p.id, label: p.label, picture: mini('preset:' + p.id, p.design) })), null);
    html += this._section('Background pattern') + this._tiles('field', D.LAYOUTS.map(l => ({ id: l.id, label: l.label, picture: l.id === 'image' ? '' : mini('field:' + l.id, { field: Object.assign({}, f, { layout: l.id }), layers: [] }) })), f.layout);
    const orient = this._select(`${path}.field.orient`, 'Direction', [['h', 'Horizontal'], ['v', 'Vertical']]);
    if (f.layout === 'image') html += `<div class="rr-c3d-row rr-prop-picturerow"><span class="rr-c3d-label">${this._t('Picture')}</span><span class="rr-prop-picturename">${rrEscapeHtml(g.image || this._t('None'))}</span><button class="rr-btn-chip" data-act="field-image">${this._t('Choose…')}</button></div>`;
    if (f.layout === 'bands') {
        html += this._slider({ path: `${path}.field.count`, label: 'Bands', range: [2, 5], step: 1, format: 'int' }) + orient;
        for (let k = 0; k < f.count; k++) html += this._slider({ path: `${path}.field.sizes.${k}`, label: this._t('Band {n} size', { n: k + 1 }), range: [0.2, 5], step: 0.1, format: 'x' });
    }
    if (f.layout === 'stripes') html += this._slider({ path: `${path}.field.count`, label: 'Stripes', range: [2, 13], step: 1, format: 'int' }) + orient;
    if (f.layout === 'cross' || f.layout === 'saltire' || f.layout === 'bend') html += this._slider({ path: `${path}.field.arm`, label: 'Arm width', range: [0.04, 0.45], step: 0.01 });
    if (f.layout === 'cross') html += this._select(`${path}.field.offset`, 'Upright arm', [['center', 'Centered'], ['nordic', 'Toward the hoist']]) + this._slider({ path: `${path}.field.outline`, label: 'Outline', range: [0, 0.12], step: 0.005 });
    if (f.layout === 'checker') html += this._slider({ path: `${path}.field.cols`, label: 'Squares across', range: [2, 12], step: 1, format: 'int' });
    if (f.layout === 'canton') html += this._slider({ path: `${path}.field.canton`, label: 'Canton size', range: [0.2, 0.7], step: 0.01 }) + this._select(`${path}.field.corner`, 'Corner', D.CORNERS)
        + this._slider({ path: `${path}.field.rows`, label: 'Star rows', range: [0, 9], step: 1, format: 'int' }) + (f.rows ? this._slider({ path: `${path}.field.cols`, label: 'Stars across', range: [1, 12], step: 1, format: 'int' }) : '');
    if (f.layout === 'triangle') html += this._slider({ path: `${path}.field.depth`, label: 'Depth', range: [0.15, 1], step: 0.01 });
    if (f.layout === 'border') html += this._slider({ path: `${path}.field.border`, label: 'Border width', range: [0.02, 0.3], step: 0.005 });
    const regions = (D.LAYOUT_BY_ID.get(f.layout).regions || []).slice(0, f.layout === 'bands' ? f.count : 5).filter((_, k) => !(f.layout === 'canton' && k === 2 && !f.rows));
    const swatches = ['#8c1c1c', '#1f3c78', '#1d5c34', '#f2efe6', '#d9b23c', '#1b1b1f', '#5a2a6e', '#c8501e'];
    if (regions.length) html += this._section('Colors') + regions.map((label, k) => this._color(`${path}.field.colors.${k}`, label, swatches)).join('');
    // The emblems: a short list, the chosen one's settings under it.
    const layers = g.layers, sel = Math.max(0, Math.min(layers.length - 1, this.layer || 0));
    this.layer = sel;
    html += this._section('Emblems') + `<div class="rr-prop-layers">${layers.map((l, k) => {
        const name = l.source === 'picture' ? (l.image || this._t('Picture')) : this._t((D.SHAPES.find(x => x[0] === l.shape) || [0, l.shape])[1]);
        const thumb = mini('layer:' + k, { field: { layout: 'solid', colors: ['#3a3d44'] }, layers: [Object.assign({}, l, { place: 'center', size: 0.85, repeat: 'none' })] });
        return `<div class="rr-prop-layer${k === sel ? ' is-active' : ''}" data-act="layer-select" data-id="${k}"><img src="${thumb}" alt=""><span>${rrEscapeHtml(name)}${l.repeat !== 'none' ? ' ×' + l.count : ''}</span>`
            + `<button class="rr-c3d-clear" data-act="layer-up" data-id="${k}" title="${this._t('Move up')}"${k ? '' : ' disabled'}>▲</button><button class="rr-c3d-clear" data-act="layer-down" data-id="${k}" title="${this._t('Move down')}"${k < layers.length - 1 ? '' : ' disabled'}>▼</button><button class="rr-c3d-remove" data-act="layer-remove" data-id="${k}" title="${this._t('Remove')}">✕</button></div>`;
    }).join('')}</div><button class="rr-btn-chip rr-c3d-addbtn" data-act="layer-add"${layers.length >= D.MAX_LAYERS ? ' disabled' : ''}>＋ ${this._t('Add an emblem')}</button>`;
    if (layers.length) {
        const l = layers[sel], base = `${path}.layers.${sel}`;
        html += this._section('Emblem') + this._select(`${base}.source`, 'Source', [['shape', 'Shape'], ['picture', 'Picture']]);
        if (l.source === 'shape') html += `<div class="rr-c3d-tiles rr-prop-tiles5">${D.SHAPES.map(([id, label]) => `<button class="rr-c3d-tile rr-c3d-thumbtile${id === l.shape ? ' is-active' : ''}" data-act="layer-shape" data-id="${id}" title="${rrEscapeHtml(this._t(label))}"><span class="rr-c3d-thumb"><img src="${mini('shape:' + id + l.color, { field: { layout: 'solid', colors: ['#3a3d44'] }, layers: [{ shape: id, color: l.color, size: 0.9 }] })}" alt=""></span></button>`).join('')}</div>`;
        else html += `<div class="rr-c3d-row rr-prop-picturerow"><span class="rr-c3d-label">${this._t('Picture')}</span><span class="rr-prop-picturename">${rrEscapeHtml(l.image || this._t('None'))}</span><button class="rr-btn-chip" data-act="layer-picture">${this._t('Choose…')}</button></div>` + this._check(`${base}.recolor`, 'One color');
        if (l.source === 'shape' || l.recolor) html += this._color(`${base}.color`, 'Color', ['#d9b23c', '#f2efe6', '#1b1b1f', '#8c1c1c', '#1f3c78', '#1d5c34']);
        html += this._select(`${base}.place`, 'Place', D.PLACES);
        if (l.place === 'free') html += this._slider({ path: `${base}.x`, label: 'Across', range: [0, 1] }) + this._slider({ path: `${base}.y`, label: 'Down', range: [0, 1] });
        html += this._slider({ path: `${base}.size`, label: 'Size', range: [0.05, 1.2] }) + this._slider({ path: `${base}.rotate`, label: 'Turn', range: [-180, 180], step: 1, format: 'deg' })
            + this._check(`${base}.mirror`, 'Mirror') + this._select(`${base}.repeat`, 'Repeat as', D.REPEATS);
        if (l.repeat !== 'none') html += this._slider({ path: `${base}.count`, label: 'Copies', range: [2, 24], step: 1, format: 'int' }) + this._slider({ path: `${base}.spread`, label: 'Spread', range: [0.1, 2], step: 0.01 });
    }
    return html;
};

/** A design's buttons (from _designPanel), for the design being shown; true when the button was one of them. */
PropBuilder.prototype._designAct = function(act, b) {
    const D = RRFlagDesign, path = this.designPath || 'design', design = this._get(path), r = JSON.parse(JSON.stringify(this.recipe)), set = d => { const keys = path.split('.'); let o = r; for (const k2 of keys.slice(0, -1)) o = o[k2]; o[keys[keys.length - 1]] = d; }, d = JSON.parse(JSON.stringify(design)), layers = d.layers, k = +b.dataset.id;
    const at = n => path.split('.').reduce((o, k2) => o[k2], n);
    const pickFor = (current, apply) => this._choosePicture(current, name => { const n = JSON.parse(JSON.stringify(this.recipe)); apply(n, name); this._replace(n); });
    if (act === 'design-preset') { const p = D.PRESETS.find(x => x.id === b.dataset.id); if (p) { set(Object.assign({}, JSON.parse(JSON.stringify(p.design)), { image: d.image })); this.layer = 0; this._replace(r); } return true; }
    if (act === 'field') {
        d.field.layout = b.dataset.id; set(d);
        this._replace(r);
        if (b.dataset.id === 'image' && !d.image) pickFor('', (n, name) => { at(n).image = name; });
        return true;
    }
    if (act === 'field-image') { pickFor(d.image, (n, name) => { at(n).image = name; }); return true; }
    if (act === 'layer-add') {
        // A new emblem in a color the field does not have much of, in the middle.
        layers.push(D.normalizeLayer({ shape: 'star', color: d.field.colors[0] === '#f2efe6' ? '#1b1b1f' : '#f2efe6', size: 0.35 }));
        this.layer = layers.length - 1; set(d); this._replace(r); return true;
    }
    if (act === 'layer-select') { this.layer = k; this._renderPanel(); return true; }
    if (act === 'layer-remove') { layers.splice(k, 1); this.layer = Math.max(0, k - 1); set(d); this._replace(r); return true; }
    if (act === 'layer-up' && k > 0) { [layers[k - 1], layers[k]] = [layers[k], layers[k - 1]]; this.layer = k - 1; set(d); this._replace(r); return true; }
    if (act === 'layer-down' && k < layers.length - 1) { [layers[k + 1], layers[k]] = [layers[k], layers[k + 1]]; this.layer = k + 1; set(d); this._replace(r); return true; }
    if (act === 'layer-shape') { layers[this.layer].shape = b.dataset.id; layers[this.layer].source = 'shape'; set(d); this._replace(r); return true; }
    if (act === 'layer-picture') { pickFor(layers[this.layer].image, (n, name) => { Object.assign(at(n).layers[this.layer], { source: 'picture', image: name }); }); return true; }
    return false;
};

/** Small pictures for tiles, kept while what they show stays the same. */
PropBuilder.prototype._mini = function(key, make) {
    const sig = JSON.stringify(this.designPath ? this._get(this.designPath) : this.recipe.design) + '|' + Object.keys(this._images).length + '|' + key;
    const have = this._minis.get(key);
    if (have && have.sig === sig) return have.url;
    let url = '';
    try { url = make(); } catch (error) { url = ''; }
    this._minis.set(key, { sig, url });
    return url;
};

PropBuilder.FOLDED_KEY = 'rr.propBuilder.foldedCategories';
if (typeof window !== 'undefined') window.PropBuilder = PropBuilder;
