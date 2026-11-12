/**
 * Character3DBuilder - Forge › 3D Character Builder.
 *
 * One recipe (RRCharacterModel) describes the character: a human body with
 * its species, face, hair, outfit, accessories and colors, or a four-legged
 * creature. Every control edits the recipe; the view rebuilds from it,
 * skinned on its own skeleton, standing in its A-pose or playing its Idle.
 * Export Model To Project writes the GLB (pictures inside) to
 * <project>/3d/Characters/<name>/source/, the recipe beside it
 * (character.json) and a thumbnail, so Open lists it and edits it again, and
 * Database › 3D Models shows it like an imported model.
 */
class Character3DBuilder {
    constructor() {
        this.projectController = null;
        this.root = null;
        this.recipe = RRCharacterModel.normalize({});
        this.name = '';
        this.pack = null;
        this.cache = {};
        this.eyeSource = null;
        this.tab = 'species';
        this.extreme = false;
        this.pose = 'idle';
        this._view = null;
        this._pending = 0;
        this._undo = [];
        this._redo = [];
        this._committed = JSON.stringify(this.recipe);
        this.openPicker = null;
        this.folded = {};
        this._thumbs = new Map();
        this._thumbQueue = [];
        this._lastChange = 0;
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
        this._closeOutfitImport?.();
        this._stopThumbs();
        this.projectController = projectController;
        if (this._heldProject !== this._project()?.path) this._heldName = '';
        this._heldProject = this._project()?.path;
        if (this._outfitProjectPath !== this._project()?.path) this._outfitUndo = null;
        this._outfitProjectPath = this._project()?.path;
        this.root = containerEl;
        this._bindPreviewActivity();
        if (!this._project()) {
            this.root.innerHTML = `<div class="rr-c3d-empty">${this._t('Open a project to use Forge tools.')}</div>`;
            return;
        }
        this._renderPage();
        this._start();
    }

    detach() {
        this._rangeDrag = this._rangeSettle = null;
        clearTimeout(this._settle); this._settle = 0;
        if (this._pending) cancelAnimationFrame(this._pending);
        this._pending = 0;
        this._closeOutfitImport?.();
        this._stopThumbs();
        // The outfit store's listener holds this builder (its last build, its caches); `_start` registers it again.
        this._takenPictures?.(); this._takenPictures = null;
        this._galleryClose?.();
        const view = this._view;
        if (!view) return;
        this._dropHeldPreview();
        cancelAnimationFrame(view.frame);
        cancelAnimationFrame(view.loop);
        view.clock?.dispose?.();
        view.resize?.disconnect();
        this._clearModel();
        for (const t of view.textures.values()) t.texture.dispose();
        if (this._worker) { this._worker.terminate(); this._worker = undefined; }
        if (this._skinWorkerRef) { this._skinWorkerRef.terminate(); this._skinWorkerRef = undefined; this._painter = null; }
        if (this._shapeWorkerRef) { this._shapeWorkerRef.terminate(); this._shapeWorkerRef = undefined; this._shapeJob = null; }
        for (const t of this._envTargets || []) t.dispose();
        this._envTargets = [];
        if (this._thumbView) {
            const thumbnails = this._thumbView;
            thumbnails.disposed = true;
            this._thumbView = null;
            const release = () => {
                for (const material of thumbnails.materials || []) material.dispose();
                for (const material of thumbnails.kept ? thumbnails.kept.values() : []) material.dispose();
                thumbnails.kept = null; thumbnails.blank?.dispose(); thumbnails.blank = null;
                thumbnails.reflections?.dispose();
                thumbnails.renderer.dispose(); thumbnails.renderer.forceContextLoss?.();
            };
            if (thumbnails.pending) thumbnails.pending.then(release);
            else release();
        }
        clearTimeout(this._shadeTimer);
        view.renderer.dispose();
        view.renderer.forceContextLoss?.();
        this._view = null;
    }

    get human() { return this.recipe.plan !== 'quadruped'; }
    // Slimefolk hook: the goo body plan (RRSlimeBody) shows in the humanoid species list with controls of its own.
    get slime() { return this.recipe.plan === 'slime'; }

    // ── recipe editing ─────────────────────────────────────────────────────
    _get(path) {
        return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), this.recipe);
    }

    _set(path, value) {
        const next = JSON.parse(JSON.stringify(this.recipe));
        const keys = path.split('.');
        let o = next;
        for (let i = 0; i < keys.length - 1; i++) {
            if (o[keys[i]] == null) o[keys[i]] = /^\d+$/.test(keys[i + 1]) ? [] : {};
            o = o[keys[i]];
        }
        o[keys[keys.length - 1]] = value;
        // Ancestry is a mix: moving one slider rebalances the other two.
        if (keys[0] === 'ancestry') {
            const others = RRHumanBody.ANCESTRY.filter(a => a !== keys[1]);
            const rest = others.reduce((s, a) => s + next.ancestry[a], 0);
            others.forEach(a => { next.ancestry[a] = rest > 0 ? next.ancestry[a] / rest * (1 - value) : (1 - value) / 2; });
        }
        this.recipe = RRCharacterModel.normalize(next);
    }

    /** Remembers the recipe as a step to undo back to (after a slider is let go, a choice, an action). */
    _commit() {
        const now = JSON.stringify(this.recipe);
        if (now === this._committed) return;
        this._undo.push(this._committed);
        if (this._undo.length > 80) this._undo.shift();
        this._redo = [];
        this._committed = now;
        this._syncHistory();
    }

    _replace(recipe, rerender = true) {
        this._rangeDrag = this._rangeSettle = null;
        this.recipe = RRCharacterModel.normalize(recipe);
        if (this._openingDesign && this._openingDesign.recipe !== JSON.stringify(this.recipe)) this._openingDesign = null;
        this._commit();
        if (rerender) this._renderPanel();
        this._queueRebuild();
    }

    /** A catalog selection starts its own recipe and retires work from the previous body. */
    _selectPreset(recipe, extreme = false, keepView = false) {
        clearTimeout(this._settle); this._settle = 0;
        clearTimeout(this._shadeTimer);
        this._fast = null;
        // The shaper stays (it holds only the body pack, which no recipe changes, and starting one reads 13 MB on
        // this thread): with no job, `_shapeDone` drops whatever it was still shaping.
        this._shapeJob = null;
        this._shapeGen = (this._shapeGen || 0) + 1;
        this.cache = {};
        this.extreme = extreme;
        // Undo and Redo keep the pose and the weapon in the hand (`keepView`): they are the view's, not the recipe's.
        if (!keepView) { this.pose = 'idle'; this._heldName = ''; }
        this.openPicker = null;
        this._dropHeldPreview();
        if (this._view) { this._view.structure = null; this._view.height = 0; }
        this._replace(recipe);
    }

    _history(direction) {
        const from = direction < 0 ? this._undo : this._redo, to = direction < 0 ? this._redo : this._undo;
        if (!from.length) return;
        to.push(this._committed);
        // The step as `_replace` will take it: normalized once from the same text, so `_commit` finds nothing changed
        // (normalizing a second time can move an ancestry weight by one bit, which put the step back and emptied Redo).
        const step = from.pop();
        this.recipe = RRCharacterModel.normalize(JSON.parse(step));
        this._committed = JSON.stringify(this.recipe);
        this._syncHistory();
        this._selectPreset(JSON.parse(step), this.extreme, true);
    }

    _syncHistory() {
        if (!this.root) return;
        const undo = this.root.querySelector('.rr-c3d-undo'), redo = this.root.querySelector('.rr-c3d-redo');
        if (undo) undo.disabled = !this._undo.length;
        if (redo) redo.disabled = !this._redo.length;
    }

    // ── page ───────────────────────────────────────────────────────────────
    _tabs() {
        if (this.slime) return [['species', 'Species'], ['body', 'Body'], ['props', 'Accessories']];
        return this.human
            ? [['species', 'Species'], ['body', 'Body'], ['face', 'Face'], ['hair', 'Hair'], ['outfit', 'Outfit'], ['props', 'Accessories'], ['colors', 'Colors'], ...(this._bodyArtTab ? [['bodyart', 'Body art']] : [])]
            : [['species', 'Species'], ['body', 'Body'], ...(!this.recipe.morphology || this.recipe.morphology === 'quadruped' ? [['gear', 'Gear']] : []), ['colors', 'Colors']];
    }

    /**
     * The tabs in groups: what the character is (Species), its body and everything on it (Shape, Face,
     * Hair, Colors, Body art) and what it wears (Clothing, Accessories). The groups are the top row;
     * the chosen group's tabs sit under it. A group of one tab has no row of its own.
     */
    _tabGroups() {
        const groupOf = { species: 'species', body: 'body', face: 'body', hair: 'body', colors: 'body', bodyart: 'body', outfit: 'outfit', props: 'outfit', gear: 'gear' };
        const names = { species: 'Species', body: 'Body', outfit: 'Outfit', gear: 'Gear' };
        // Under Body and Outfit, their own first tabs are named for what they hold.
        const within = { body: 'Shape', outfit: 'Clothing' };
        const groups = [];
        for (const [id, label] of this._tabs()) {
            const key = groupOf[id] || id;
            let group = groups.find(g => g.id === key);
            if (!group) groups.push(group = { id: key, label: names[key] || label, tabs: [] });
            group.tabs.push([id, within[id] || label]);
        }
        return groups;
    }

    _renderPage() {
        this.root.innerHTML = `
            <div class="rr-c3d">
                <div class="rr-c3d-toolbar">
                    <label class="rr-c3d-name"><span>${this._t('Name')}</span><input type="text" class="rr-c3d-name-input rr-input" maxlength="48" placeholder="${this._t('Villager')}" value="${rrEscapeHtml(this.name)}"></label>
                    <button class="rr-btn-chip rr-c3d-undo" title="${this._t('Undo')}" disabled>↶</button>
                    <button class="rr-btn-chip rr-c3d-redo" title="${this._t('Redo')}" disabled>↷</button>
                    <span class="rr-c3d-group">
                        <button class="rr-btn-chip rr-c3d-random" title="${this._t('Roll something new for the parts ticked beside it')}">${RRRandomPartsMenu.icon()} ${this._t('Randomize')}</button>
                        ${RRRandomPartsMenu.html(t => this._t(t))}
                    </span>
                    <button class="rr-btn-chip rr-c3d-reset">↻ ${this._t('Reset')}</button>
                    <button class="rr-btn-chip rr-c3d-open">${this._t('Open')}</button>
                    <label class="rr-c3d-name rr-c3d-group-pick"><span>${this._t('Group')}</span><select class="rr-select rr-c3d-design-group" title="${this._t('Where Save Design keeps this character')}"></select></label>
                    <button class="rr-btn-chip rr-c3d-keep" title="${this._t('Keep this character\'s settings in the Forge to open and change later. No model is made.')}">${this._t('Save Design')}</button>
                    <span class="rr-c3d-spacer"></span>
                    <span class="rr-c3d-status" aria-live="polite"></span>
                    ${this.human && !this.slime ? `<button class="rr-btn-chip rr-c3d-crowd" title="${this._t('Many characters at once to one description: a town, an army, a people')}">${this._t('Generate Group')}</button>` : ''}
                    <button class="rr-btn-chip rr-c3d-sheet">${this._t('Export Sprite Sheet')}</button>
                    <button class="rr-btn-chip rr-c3d-save">${this._t('Export Model To Project')}</button>
                </div>
                <div class="rr-c3d-body">
                    <div class="rr-c3d-side">
                        <div class="rr-c3d-tabs"></div>
                        <div class="rr-c3d-panel"></div>
                    </div>
                    <div class="rr-c3d-view">
                        <canvas class="rr-c3d-canvas"></canvas>
                        <div class="rr-c3d-readout"></div>
                        <div class="rr-c3d-poses" role="group" aria-label="${this._t('Pose')}">
                            <label class="rr-c3d-poses-title" for="rr-c3d-pose-picker">${this._t('Pose')}</label>
                            <select id="rr-c3d-pose-picker" class="rr-select rr-c3d-pose-picker" data-rr-search="always" data-rr-group-headers="accent"></select>
                        </div>
                        <div class="rr-c3d-viewbar">
                            <button class="rr-btn-chip rr-c3d-frame" data-frame="body">${this._t('Whole Body')}</button>
                            <button class="rr-btn-chip rr-c3d-frame" data-frame="face">${this._t('Face')}</button>
                            <button class="rr-btn-chip rr-c3d-spritebtn">${this._t('Sprite')}</button>
                        </div>
                        <div class="rr-c3d-hint">${this._t('Drag to turn, wheel to zoom')}</div>
                        <div class="rr-c3d-gallery" hidden></div>
                    </div>
                </div>
            </div>`;
        const q = sel => this.root.querySelector(sel);
        q('.rr-c3d-name-input').addEventListener('input', e => { this.name = e.target.value; });
        q('.rr-c3d-undo').addEventListener('click', () => this._history(-1));
        q('.rr-c3d-redo').addEventListener('click', () => this._history(1));
        q('.rr-c3d-random').addEventListener('click', () => this._randomize());
        // Which parts Randomize rolls: any mix, ticked (RRRandomPartsMenu); remembered per kind of character.
        RRRandomPartsMenu.bind(this.root.querySelector('.rr-random-parts'), chosen => {
            this.randomParts = chosen;
            RRRandomPartsMenu.save(this._randomKey(), chosen, this._randomPartList());
            this.root.querySelector('.rr-c3d-random').disabled = !chosen.size;
        });
        // Reset: back to the species' (or the creature kind's) own starting point.
        q('.rr-c3d-reset').addEventListener('click', () => this._selectPreset(this.human ? RRCharacterModel.withSpecies({}, this.recipe.species) : this._creature(this.recipe.kind)));
        q('.rr-c3d-open').addEventListener('click', () => this._showGallery());
        q('.rr-c3d-keep').addEventListener('click', () => this.saveDesign());
        q('.rr-c3d-design-group').addEventListener('change', e => this._chooseDesignGroup(e.target.value));
        this._renderDesignGroups();
        q('.rr-c3d-save').addEventListener('click', () => this.save());
        // Export sprite sheet: the panel and the rendering live in RRCharacterSpriteSheet.
        // The sprite view's wording is the sheet module's, and English only for now (as its panel's).
        if (window.RRCharacterSpriteSheet && RRCharacterSpriteSheet.SPRITE_VIEW_HINT) q('.rr-c3d-spritebtn').title = this._t(RRCharacterSpriteSheet.SPRITE_VIEW_HINT);
        // One sprite workspace, from either button: the chip shows it or goes back to the model, Export Sprite Sheet shows it.
        const sprites = keep => {
            if (!window.RRCharacterSpriteSheet || !this._view) return;
            this.root.querySelector('.rr-c3d-gen:not([data-busy])')?.remove();
            if (this.root.querySelector('.rr-c3d-gen')) return;
            if (keep && this.root.querySelector('.rr-c3d-spriteview')) return;
            RRCharacterSpriteSheet.openPanel(this);
        };
        q('.rr-c3d-spritebtn').addEventListener('click', () => sprites(false));
        q('.rr-c3d-sheet').addEventListener('click', () => sprites(true));
        // The group's own page in the Forge, where there is one (this character is then whose outfit a uniform is);
        // a builder standing alone opens the panel over its view.
        q('.rr-c3d-crowd')?.addEventListener('click', () => {
            const forge = window.reactor?.forgeManager;
            if (forge && forge.character3dBuilder === this && typeof forge.openTool === 'function') forge.openTool('character-groups');
            else if (window.RRCharacterGroups && this._view) RRCharacterGroups.openPanel(this);
        });
        q('.rr-c3d-pose-picker').addEventListener('change', e => { this.pose = e.target.value; this._syncPose(); });
        this.root.querySelectorAll('.rr-c3d-frame').forEach(b => b.addEventListener('click', () => this._frame(b.dataset.frame)));
        this.root.querySelector('.rr-c3d-tabs').addEventListener('click', e => {
            const b = e.target.closest('[data-tab], [data-group]');
            if (!b) return;
            if (b.dataset.group) {
                // A group opens on the tab last used in it.
                const group = this._tabGroups().find(g => g.id === b.dataset.group);
                if (!group) return;
                const last = (this._groupTab || {})[group.id];
                this.tab = group.tabs.some(t => t[0] === last) ? last : group.tabs[0][0];
            } else this.tab = b.dataset.tab;
            this._renderPanel();
        });
        const panel = q('.rr-c3d-panel');
        panel.addEventListener('input', e => this._onInput(e, false));
        panel.addEventListener('change', e => this._onInput(e, true));
        panel.addEventListener('pointerdown', e => {
            const b = e.target.closest && e.target.closest('[data-act]');
            this._pressed = b ? { act: b.dataset.act, id: b.dataset.id, path: b.dataset.path, at: Date.now() } : null;
        }, true);
        panel.addEventListener('click', e => this._onClick(e));
        // Once a frame at most: each look measures every tile.
        panel.addEventListener('scroll', () => { if (this._scrollFrame) return; this._scrollFrame = requestAnimationFrame(() => { this._scrollFrame = 0; this._refreshThumbs(); }); }, { passive: true, capture: true });
        this._renderPanel();
        this._syncHistory();
    }

    _renderPanel() {
        this._shownSex = RRHumanBody.sexOf(this.recipe);
        if (!this.root) return;
        const tabs = this._tabs();
        if (!tabs.some(t => t[0] === this.tab)) this.tab = 'species';
        const groups = this._tabGroups(), current = groups.find(g => g.tabs.some(t => t[0] === this.tab)) || groups[0];
        (this._groupTab || (this._groupTab = {}))[current.id] = this.tab;
        this.root.querySelector('.rr-c3d-tabs').innerHTML =
            `<div class="rr-c3d-groups" role="tablist">${groups.map(g =>
                `<button class="rr-c3d-group-tab${g === current ? ' is-active' : ''}" role="tab" aria-selected="${g === current}" data-group="${g.id}">${this._t(g.label)}</button>`).join('')}</div>`
            + (current.tabs.length > 1 ? `<div class="rr-c3d-subtabs" role="tablist">${current.tabs.map(([id, label]) =>
                `<button class="rr-c3d-tab${id === this.tab ? ' is-active' : ''}" role="tab" aria-selected="${id === this.tab}" data-tab="${id}">${this._t(label)}</button>`).join('')}</div>` : '');
        {
            const parts = this._randomPartList(), key = this._randomKey();
            if (this._randomFor !== key) { this.randomParts = RRRandomPartsMenu.load(key, parts); this._randomFor = key; }
            RRRandomPartsMenu.render(this.root.querySelector('.rr-random-parts'), parts, this.randomParts, t => this._t(t));
            this.root.querySelector('.rr-c3d-random').disabled = !this.randomParts.size;
        }
        const panel = this.root.querySelector('.rr-c3d-panel');
        const top = panel.scrollTop;
        const make = {
            species: () => this._speciesTab(), body: () => this._bodyTab(), face: () => this._faceTab(), hair: () => this._hairTab(),
            outfit: () => this._outfitTab(), props: () => this._propsTab(), colors: () => this._colorsTab(), gear: () => this._gearTab(), bodyart: () => this._bodyArtTab()
        }[this.tab];
        panel.innerHTML = make();
        this._cardify(panel);
        panel.scrollTop = top;
        this._syncSliders();
        this._refreshThumbs();
    }

    // ── expressions (RRCharacterExpressions) ───────────────────────────────
    /** The Face tab's Expression choice and Talk preview, for a face that can make them. */
    _expressionRows() {
        const X = window.RRCharacterExpressions;
        if (!X || !this.human || !this._result || !X.supports(this.pack, this._result)) return '';
        // The character's own emotion (recipe.emotion): how far every expression goes, and its blush. The face
        // sheet's portraits and the saved model's expressions follow them.
        const R = X.EMOTION_RANGE;
        return this._section('Expression') + this._select('view.expression', 'Expression', X.EXPRESSIONS.map(e => [e.id, e.label]), this.expression || 'neutral')
            + `<div class="rr-c3d-row"><span class="rr-c3d-label"></span><button class="rr-btn-chip rr-c3d-talk" data-act="talk">${this._talk ? '■ ' + this._t('Stop') : '▶ ' + this._t('Talk')}</button></div>`
            + this._slider({ path: 'emotion.strength', label: 'Expressiveness', natural: R.strength, step: 0.05, ends: ['Subtle', 'Anime'] })
            + this._slider({ path: 'emotion.blush', label: 'Blushing', natural: R.blush, step: 0.05 })
            + this._color('emotion.blushColor', 'Blush color', ['#ee8a8a', '#f27a9a', '#e0604a', '#c8607a', '#9a4a8a']);
    }

    /**
     * An Emotion setting changed: the face shown again with it, nothing rebuilt. On the Normal face it shows an
     * expression the setting can be seen on (Happy for Expressiveness, Embarrassed for the blush).
     */
    _emotionChanged(path) {
        if (!this.expression || this.expression === 'neutral') {
            this.expression = path === 'emotion.strength' ? 'happy' : 'embarrassed';
            const select = this.root && this.root.querySelector('select[data-path="view.expression"]');
            if (select) select.value = this.expression;
        }
        this._showExpression();
    }

    /** The chosen expression on the view's face (neutral puts the face back as built). */
    _showExpression() {
        this._stopPreviewTween();
        const X = window.RRCharacterExpressions;
        if (!X || !this._view || !this._result) return;
        // The Face tab shows the choice once the face it fits is built (or hides it for one it does not fit).
        const can = this.human && X.supports(this.pack, this._result);
        if (this.tab === 'face' && this.root && !!this.root.querySelector('.rr-c3d-talk') !== can) this._renderPanel();
        if (X.applyToView(this._view, this._result, this.pack, can ? this.expression || 'neutral' : 'neutral', 1, THREE, X.emotionOf(this.recipe))) this._draw();
    }

    /** Talk: the face says a sample line, its mouth shaped letter by letter; again stops it. */
    _toggleTalk() {
        const X = window.RRCharacterExpressions;
        if (this._talk) { this._talk.stop(); return; }
        if (!this.human) {
            this._talk = this._talkJaw();
            const chip = this.root.querySelector('.rr-c3d-talk');
            if (chip && this._talk) chip.textContent = '■ ' + this._t('Stop');
            return;
        }
        if (!X || !this._view || !this._result) return;
        this._talk = X.talk(this._view, this._result, this.pack, THREE, { draw: () => this._draw(), done: () => { this._talk = null; const b = this.root && this.root.querySelector('.rr-c3d-talk'); if (b) b.textContent = '▶ ' + this._t('Talk'); } });
        const b = this.root.querySelector('.rr-c3d-talk');
        if (b && this._talk) b.textContent = '■ ' + this._t('Stop');
    }

    /** A creature talks with its jaw: the sample line's letters open it, as a Show Text's do in the game. */
    _talkJaw() {
        const view = this._view, M = window.RRCreatureMouth, id = this._result?.bones.findIndex(b => b.name === 'Jaw') ?? -1;
        if (!view || !M || id < 0 || !view.bones[id]) return null;
        const jaw = view.bones[id], rest = jaw.rotation.x;
        let frame = 0, open = 0, raf = 0, stopped = false;
        const handle = { stop: () => {
            if (stopped) return;
            stopped = true; cancelAnimationFrame(raf); jaw.rotation.x = rest; this._talk = null; this._draw();
            const chip = this.root?.querySelector('.rr-c3d-talk');
            if (chip) chip.textContent = this._t('Talk');
        } };
        const step = () => {
            if (stopped) return;
            const i = Math.floor(frame++ / 3);
            if (i > M.LINE.length) { handle.stop(); return; }
            open += (M.letterOpen(M.LINE[i]) - open) * 0.45;
            jaw.rotation.x = rest + open * M.TALK_RADIANS;
            this._draw();
            raf = requestAnimationFrame(step);
        };
        raf = requestAnimationFrame(step);
        return handle;
    }

    // ── controls ───────────────────────────────────────────────────────────
    _section(label) {
        return `<div class="rr-c3d-section" data-title="${rrEscapeHtml(label)}"><span>${this._t(label)}</span></div>`;
    }

    /**
     * Each section in a card of the app's own kind: the accent-strip header
     * (it folds the section; the fold is remembered per tab), the controls in
     * the card's body.
     */
    _cardify(panel) {
        let body = null;
        for (const el of [...panel.children]) {
            if (!el.classList.contains('rr-c3d-section')) { if (body) body.appendChild(el); continue; }
            const key = this.tab + ':' + el.dataset.title, folded = !!this.folded[key];
            const card = document.createElement('div');
            card.className = 'lit-section rr-c3d-card-sec' + (folded ? ' is-collapsed' : '');
            const head = document.createElement('div');
            head.className = 'lit-section-header rr-c3d-sechead';
            head.dataset.act = 'fold';
            head.dataset.key = key;
            head.tabIndex = 0;
            head.setAttribute('role', 'button');
            head.setAttribute('aria-expanded', String(!folded));
            head.innerHTML = `<span class="r3d-sec-toggle">${folded ? '▸' : '▾'}</span>`;
            for (const child of [...el.childNodes]) head.appendChild(child);
            const title = head.children[1];
            if (title) title.classList.add('r3d-sec-title');
            body = document.createElement('div');
            body.className = 'lit-section-body rr-c3d-secbody';
            card.append(head, body);
            panel.insertBefore(card, el);
            el.remove();
        }
        if (!panel._foldKeys) {
            panel._foldKeys = true;
            panel.addEventListener('keydown', e => {
                const head = e.target.closest && e.target.closest('.rr-c3d-sechead');
                if (head && (e.key === 'Enter' || e.key === ' ') && e.target === head) { e.preventDefault(); this._fold(head); }
            });
        }
    }

    _fold(head) {
        const key = head.dataset.key, card = head.parentElement;
        this.folded[key] = !this.folded[key];
        card.classList.toggle('is-collapsed', this.folded[key]);
        head.setAttribute('aria-expanded', String(!this.folded[key]));
        head.querySelector('.r3d-sec-toggle').textContent = this.folded[key] ? '▸' : '▾';
    }

    /**
     * A slider over a recipe path. `natural` is the everyday range; with
     * Extreme on the slider reaches `extreme`, the natural band shaded.
     */
    _slider(s) {
        if (this._rangeLog) this._rangeLog.set(s.path, s);
        const range = this.extreme && s.extreme ? s.extreme : s.natural;
        const [min, max] = range;
        const v = this._get(s.path);
        const lo = ((s.natural[0] - min) / (max - min)) * 100, hi = ((s.natural[1] - min) / (max - min)) * 100;
        const ends = s.ends ? `<div class="rr-c3d-ends"><span>${this._t(s.ends[0])}</span><span>${this._t(s.ends[1])}</span></div>` : '';
        return `<label class="rr-c3d-row" title="${rrEscapeHtml(this._t(s.label))}"><span class="rr-c3d-label">${this._t(s.label)}</span>
            <input type="range" data-path="${s.path}" data-format="${s.format || ''}" min="${min}" max="${max}" step="${s.step || 0.01}" value="${v}" style="--rr-nat-lo:${lo}%;--rr-nat-hi:${hi}%">
            <span class="rr-c3d-value" data-value="${s.path}">${this._format(s, v)}</span>${ends}</label>`;
    }

    _format(s, v) {
        const f = typeof s === 'string' ? s : s.format;
        if (v == null || Number.isNaN(+v)) return '';
        if (f === 'count') return String(Math.round(v));
        if (f === 'years') return this._t('{n} years', { n: Math.round(v) });
        if (f === 'signed') return (v > 0 ? '+' : '') + Math.round(v * 100);
        if (f === 'deg') return Math.round(v) + '°';
        if (f === 'm') return (+v).toFixed(2) + ' m';
        if (f === 'x') return '×' + (+v).toFixed(2);
        return Math.round(v * 100) + '%';
    }

    _select(path, label, choices, value) {
        const v = value ?? this._get(path);
        const symbols=window.RRCharacterMarks?.symbolChoices(choices);
        const opts = choices.map(c => {
            if (c.group) return `<optgroup label="${rrEscapeHtml(this._t(c.group))}">${c.items.map(([id, l]) => `<option value="${rrEscapeHtml(id)}"${id === v ? ' selected' : ''}>${rrEscapeHtml(this._t(l))}</option>`).join('')}</optgroup>`;
            return `<option value="${rrEscapeHtml(c[0])}"${symbols?` data-rr-symbol="${rrEscapeHtml(c[0])}"`:""}${c[0] === v ? ' selected' : ''}>${rrEscapeHtml(this._t(c[1]))}</option>`;
        }).join('');
        return `<label class="rr-c3d-row rr-c3d-choice"><span class="rr-c3d-label">${this._t(label)}</span><select class="rr-select" data-path="${path}">${opts}</select></label>`;
    }

    _color(path, label, swatches, clearable) {
        const v = this._get(path) || '';
        const sw = (swatches || []).map(c => `<button class="rr-c3d-swatch" data-act="swatch" data-path="${path}" data-color="${c}" style="background:${c}" title="${c}"></button>`).join('');
        const clear = clearable ? `<button class="rr-c3d-clear" data-act="clear" data-path="${path}" title="${this._t('None')}">✕</button>` : '';
        return `<div class="rr-c3d-row rr-c3d-colorrow"><span class="rr-c3d-label">${this._t(label)}</span>
            <div class="rr-c3d-swatches">${sw}</div>
            <span class="rr-c3d-colorpick"><button type="button" class="rr-c3d-color" data-act="color" data-path="${path}" style="--rr-c3d-swatch:${v || 'transparent'}"${v ? '' : ' data-empty="1"'} title="${rrEscapeHtml(v || this._t('None'))}"></button>${clear}</span></div>`;
    }

    _check(path, label) {
        return `<label class="rr-c3d-row rr-c3d-check"><span class="rr-c3d-label">${this._t(label)}</span><input type="checkbox" data-path="${path}"${this._get(path) ? ' checked' : ''}></label>`;
    }

    _cards(items, act) {
        return items.map(({ id, label, html }) => `<div class="rr-c3d-card"><div class="rr-c3d-card-head"><span>${this._t(label)}</span><button class="rr-c3d-remove" data-act="${act}" data-id="${id}" title="${this._t('Remove')}">✕</button></div>${html}</div>`).join('');
    }

    _onInput(event, committed) {
        const el = event.target;
        if (el.isConnected === false) return;
        const path = el.dataset && el.dataset.path;
        if (!path) return;
        if (path === 'morphology' && !this.human) return;
        let value;
        if (el.type === 'range') value = +el.value;
        else if (el.type === 'checkbox') value = el.checked;
        else if (el.type === 'color') { value = el.value; delete el.dataset.empty; }
        else value = el.value;
        // A select is a choice: committed once, and it may change which controls show.
        if (el.tagName === 'SELECT') {
            if (!committed) return;
            if (!this.human && RRCreatureBody.variantsFor(this.recipe).some(v => v.key === path)) { this._selectPreset(RRCreatureBody.withVariant(RRCreatureBody.kindRecipe(this.recipe.kind), path, value)); return; }
            if (path === 'previewWeapon') { this._heldName = value; this._heldCatalog = null; this._syncHeldPreview(); return; }
            if (path === 'eyeStyle') { this._applyEyeStyle(value); return; }
            if (path === 'skinLook') {
                const look = RRCharacterSkin.LOOKS.find(p => p.id === value);
                if (look) {
                    const recipe = JSON.parse(JSON.stringify(this.recipe));
                    recipe.skin = look.skin;
                    recipe.skinPattern = Object.assign({}, recipe.skinPattern, { type: 'none', color: RRCharacterSkin.DEFAULT_SKIN.color, amount: 1, scale: 1, belly: '' }, look.settings);
                    this._replace(recipe);
                }
                return;
            }
            // Expressions hook: the face shown (a view choice, not part of the recipe).
            if (path === 'view.expression') { this.expression = value; this._showExpression(); return; }
            // A people sets the blend and, on a species with skin of its own color, keeps that skin.
            if (path === 'ancestry.people') { this._replace(RRHumanBody.withPeople(this.recipe, value, !!(RRCharacterSpecies.BY_ID.get(this.recipe.species)?.recipe || {}).skin)); return; }
            // A body hair pattern sets every region to its own values.
            // On a woman, Natural and Light are a woman's own patterns.
            if (/^features\.\w+\.type$/.test(path) && /^cyber/.test(value) && !/^cyber/.test(this._get(path) || '')) { const key = path.split('.')[1]; this._set(`features.${key}.color`, ''); this._set(`features.${key}.color2`, ''); }
            if (path === 'bodyHair.pattern' && value !== 'custom') {
                const female = RRHumanBody.sexOf(this.recipe) === 'female', P = RRCharacterSkin.HAIR_PRESETS;
                this._set('bodyHair.regions', Object.assign({}, (female && P[value + 'Female']) || P[value]));
            }
            this._set(path, value);
            this._commit();
            this._renderPanel();
            this._queueRebuild();
            return;
        }
        if (el.type === 'color' && !committed && event.type === 'input') { this._set(path, value); this._queueRebuild(); return; }
        // A checkbox may show or hide controls under it (Anatomical detail): the panel follows.
        if (el.type === 'checkbox') {
            if (!committed) return;
            this._set(path, value);
            // Merfolk hook: without fin ears the person's own ears come back.
            if (path === 'merfolk.finEars' && !value) this._set('morph.earsAway', 0);
            this._commit();
            this._renderPanel();
            this._queueRebuild();
            return;
        }
        this._set(path, value);
        if (el.type === 'range') {
            if (committed) { this._rangeSettle = this._rangeDrag; this._rangeDrag = null; }
            else { this._rangeSettle = null; if (this._rangeDrag?.path !== path) this._rangeDrag = { path }; }
        }
        // Emotion: the face shown again, nothing rebuilt.
        if (path.startsWith('emotion.')) { this._syncSliders(); if (committed) this._commit(); this._emotionChanged(path); return; }
        // Bounce changes only animation keys, never the shape or its pictures.
        if (path === 'bustBounce' || path === 'buttBounce' || path === 'fatBounce') {
            this._rangeDrag = this._rangeSettle = null;
            this._syncSliders(); if (committed) this._commit();
            this._bounceChanged(path); return;
        }
        // Moving a region by hand makes the pattern Custom (the select says so once the slider is let go).
        if (path.startsWith('bodyHair.regions.')) {
            const was = this.recipe.bodyHair.pattern;
            if (was !== 'custom') this._set('bodyHair.pattern', 'custom');
            const select = this.root.querySelector('select[data-path="bodyHair.pattern"]');
            if (committed && select && select.value !== 'custom') this._renderPanel();
        }
        // While a slider is dragged, Slimefolk goo is rebuilt coarse and an animal's coat picture at half size; whole once it is let go.
        if (this.slime || !this.human) this._dragDraft = el.type === 'range' && !committed;
        if (el.type === 'range') this._syncSliders();
        if (committed) this._commit();
        if (committed && !this.human && ['eyeCount','limbPairs','appendages','jawOpen'].includes(path)) this._renderPanel();
        // Gender carried across the middle: the sex the body shows changes, and the controls for it (genitals,
        // a woman's own hair patterns) with it.
        if (committed && path === 'gender' && RRHumanBody.sexOf(this.recipe) !== this._shownSex) this._renderPanel();
        // A body slider moving: the fast path while the drag lasts, the whole character when it ends.
        if (el.type === 'range' && Character3DBuilder.bodyPath(path) && this.human) {
            if (!committed && this._fastShape()) { clearTimeout(this._settle); this._settle = setTimeout(() => { this._settle = 0; this._queueRebuild(); }, 220); return; }
            clearTimeout(this._settle); this._settle = 0;
            this._fast = null;
        }
        this._queueRebuild();
    }

    _onClick(event) {
        let b = event.target.closest('[data-act]');
        // A panel drawn again between the press and the release leaves the click on the panel itself, with the button
        // that was pressed gone: the click then belongs to the same choice's new button under the pointer.
        const pressed = this._pressed;
        if (!b && pressed && Date.now() - pressed.at < 1500 && event.clientX !== undefined) {
            const under = this.root.ownerDocument.elementFromPoint(event.clientX, event.clientY)?.closest('[data-act]');
            if (under && under.dataset.act === pressed.act && under.dataset.id === pressed.id && under.dataset.path === pressed.path) b = under;
        }
        this._pressed = null;
        if (!b || b.isConnected === false) return;
        event.preventDefault();
        const act = b.dataset.act, r = JSON.parse(JSON.stringify(this.recipe));
        if (act === 'fold') { this._fold(b); return; }
        if (act === 'talk') { this._toggleTalk(); return; }
        // Body art tab (CharacterBodyArtPanel.js): its own buttons.
        if (act.startsWith('art-') && this._bodyArtAct && this._bodyArtAct(act, b)) return;
        if (act === 'take-outfit') { this._showModels(); return; }
        if (act === 'garment-prop') {
            const item=this.recipe.outfit[+b.dataset.index],manager=window.reactor?.forgeManager;
            if(!item||!manager||!window.RRGarmentProp)return;
            const builder=manager.propBuilder||(manager.propBuilder=new PropBuilder());
            builder._undo.push(JSON.stringify(builder.recipe));if(builder._undo.length>80)builder._undo.shift();
            builder.recipe=RRGarmentProp.normalize({garment:item,body:this.recipe});
            builder.cache={emblemProject:this._project()?.path,emblemPictures:new Map(this.cache.wardrobe?.emblemPictures||[])};
            builder.name=RRCharacterWardrobe.BY_ID.get(item.id).label;
            builder.search='';builder.folded['cat:wearables']=false;
            builder.tab='garment';builder._redo=[];builder._committed=JSON.stringify(builder.recipe);
            manager.openTool('prop-builder');builder.root?.querySelector('.rr-prop-type.is-active')?.scrollIntoView({block:'nearest'});return;
        }
        if (act === 'extreme') { this.extreme = !this.extreme; this._renderPanel(); return; }
        if (act === 'plan') {
            if ((b.dataset.plan === 'quadruped') === !this.human) return;
            this._selectPreset(b.dataset.plan === 'quadruped' ? Object.assign({ plan: 'quadruped' }, RRCreatureBody.kindRecipe('dog')) : { plan: 'human' });
            return;
        }
        if (act === 'species') {
            // The explicit detail switch is a viewing/content preference,
            // rather than a body proportion brought by the old species.
            // Keep it between humanoids so changing species does not silently
            // replace the fine chest surfaces with the coarse base skin.
            const humanoid = this.human && !this.slime;
            const anatomy = { detail: humanoid && !!this.recipe.anatomy?.detail };
            this._selectPreset(RRCharacterModel.withSpecies({ anatomy, ...(humanoid ? { gender: this.recipe.gender } : {}) }, b.dataset.id)); return;
        }
        if (act === 'kind') { this._selectPreset(this._creature(b.dataset.id)); return; }
        if (act === 'gear-preset') { r.gear = RRCreatureGear.presetGear(b.dataset.id); this._replace(r); return; }
        if (act === 'add-gear') { r.gear = (r.gear || []).filter(g => (RRCreatureGear.ITEMS.find(i => i.id === g.id) || {}).slot !== (RRCreatureGear.ITEMS.find(i => i.id === b.dataset.id) || {}).slot).concat([{ id: b.dataset.id }]); this.openPicker = null; this._replace(r); return; }
        if (act === 'remove-gear') { r.gear = (r.gear || []).filter(g => g.id !== b.dataset.id); this._replace(r); return; }
        if (act === 'color') {
            // The editor's own color picker, live while dragging; one undo step when let go.
            const path = b.dataset.path;
            RRColorPopover.open(b, {
                value: this._get(path) || '#808080',
                onInput: hex => {
                    if (b.isConnected === false) return;
                    this._set(path, hex); b.style.setProperty('--rr-c3d-swatch', hex); delete b.dataset.empty;
                    // The skin while dragging: the body tinted at once from the painted skin toward the new color;
                    // the new skin is painted once the color rests.
                    if (path === 'skin' && this._tintSkin(hex)) return;
                    if (path.startsWith('emotion.')) { this._emotionChanged(path); return; }
                    this._queueRebuild();
                },
                onChange: hex => { if (b.isConnected === false) return; this._set(path, hex); b.style.setProperty('--rr-c3d-swatch', hex); b.title = hex; this._commit(); if (path.startsWith('emotion.')) this._emotionChanged(path); else this._queueRebuild(); }
            });
            return;
        }
        if (act === 'swatch') { this._set(b.dataset.path, b.dataset.color); this._commit(); this._renderPanel(); if (b.dataset.path.startsWith('emotion.')) this._emotionChanged(b.dataset.path); else this._queueRebuild(); return; }
        if (act === 'clear') { this._set(b.dataset.path, ''); this._commit(); this._renderPanel(); this._queueRebuild(); return; }
        if (act === 'dress') {
            const preset = RRCharacterWardrobe.PRESETS.find(p => p.id === b.dataset.id);
            if (preset) { r.outfit = JSON.parse(JSON.stringify(RRCharacterWardrobe.dressFor(preset.items, RRHumanBody.sexOf(r) === 'female'))); this._replace(r); }
            return;
        }
        if (act === 'remove-garment') { r.outfit = r.outfit.filter(i => i.id !== b.dataset.id); this._replace(r); return; }
        if(act==='mark-picture'){this._chooseMarkPicture(b.dataset.path);return;}
        if (act === 'remove-prop') { r.props = r.props.filter(i => i.id !== b.dataset.id); this._replace(r); return; }
        if (act === 'picker') { this.openPicker = this.openPicker === b.dataset.id ? null : b.dataset.id; this._renderPanel(); return; }
        if (act === 'pick') {
            // A new haircut comes with its own bangs.
            if (b.dataset.path === 'hair.style') this._set('hair', RRCharacterHair.withStyle(this.recipe.hair, b.dataset.id));
            else this._set(b.dataset.path, b.dataset.id);
            this._commit(); this._renderPanel(); this._queueRebuild(); return;
        }
        if (act === 'cyber-look') { r.props = RRCharacterCyberGear.wearLook(r.props, b.dataset.id); this.openPicker = null; this._replace(r); return; }
        if (act === 'add-garment' || act === 'add-prop') {
            const id = b.dataset.id;
            if (!id) return;
            if (act === 'add-garment') r.outfit = r.outfit.concat([{ id }]); else r.props = r.props.concat([{ id }]);
            this.openPicker = null;
        this.folded = {};
            this._replace(r);
        }
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

    // ── tabs ───────────────────────────────────────────────────────────────
    _speciesTab() {
        const plan = `<div class="rr-c3d-plan">
            <button class="rr-btn-chip${this.human ? ' is-active' : ''}" data-act="plan" data-plan="human">${this._t('Humanoid')}</button>
            <button class="rr-btn-chip${this.human ? '' : ' is-active'}" data-act="plan" data-plan="quadruped">${this._t('Non-humanoid')}</button></div>`;
        if (!this.human) {
            const groups = [...new Set(RRCreatureBody.KINDS.map(k => k.group || 'Land animals'))];
            const kinds = groups.map(group => this._section(group) + `<div class="rr-c3d-tiles">${RRCreatureBody.KINDS.filter(k => (k.group || 'Land animals') === group).map(k => this._tile('kind', k.kind, k.label || this._cap(k.kind), 'kind', k.kind === this.recipe.kind)).join('')}</div>`).join('');
            return plan + kinds;
        }
        const groups = [...new Set(RRCharacterSpecies.SPECIES.map(s => s.group))];
        const tiles = groups.map(g => `<div class="rr-c3d-subhead">${this._t(g)}</div><div class="rr-c3d-tiles">${RRCharacterSpecies.SPECIES.filter(s => s.group === g)
            .map(s => this._tile('species', s.id, s.label, 'species', s.id === this.recipe.species)).join('')}</div>`).join('');
        return plan + this._section('Species') + `<p class="rr-c3d-note">${this._t('A species sets the body, face, skin and features to start from. Everything stays editable.')}</p>` + tiles;
    }

    /** Keep a part's type, dimensions and colors together in Body settings. */
    _bodyFeature(key) {
        const def = RRCharacterSpecies.FEATURES[key], f = this.recipe.features[key];
        let html = this._select(`features.${key}.type`, def.label, def.types);
        if (f.type === 'none') return html;
        if (key !== 'machinery') html += this._slider({ path: `features.${key}.size`, label: 'Size', natural: [0.5, 1.6], extreme: [0.2, 3], format: 'x' });
        if (key === 'tail') html += this._slider({ path: 'features.tail.length', label: 'Length', natural: [0.5, 1.6], extreme: [0.2, 3], format: 'x' });
        // A cyber feature (RRCharacterBodyMods): its style, colors over the style's own, light and wear.
        if (/^cyber/.test(f.type) && window.RRCharacterBodyArt) {
            html += this._select(`features.${key}.style`, 'Style', RRCharacterBodyArt.CYBER_STYLES.map(s => [s.id, s.label]));
            if (key === 'tail') html += this._select('features.tail.tip', 'Tip', [['none', 'None'], ['blade', 'Blade'], ['stinger', 'Stinger']]);
            return html + this._color(`features.${key}.color`, 'Color', [], true) + this._color(`features.${key}.color2`, 'Second color', [], true) + this._color(`features.${key}.glow`, 'Glow color', ['#38e6ff', '#ff3df0', '#ff9a3a', '#7cff6a'], true)
                + this._slider({ path: `features.${key}.glowAmount`, label: 'Glow', natural: [0, 1] }) + this._slider({ path: `features.${key}.wear`, label: 'Wear', natural: [0, 1] });
        }
        html += this._color(`features.${key}.color`, 'Color', []);
        if (def.defaults.color2) html += this._color(`features.${key}.color2`, key === 'machinery' ? 'Light color' : key === 'arms' ? 'Trim' : key === 'tail' || key === 'wings' ? 'Underside' : 'Tip color', []);
        return html;
    }

    _creatureBodySettings() {
        const r = this.recipe, ordinary = !r.morphology || r.morphology === 'quadruped';
        const controls = RRCreatureBody.slidersFor(r).filter(s => s.section !== 'Coat');
        const sectionFor = key => ({hornSize:'Horns', tuskSize:'Head', maneSize:'Head', spines:'Body', wingSize:'Wings', wingSpread:'Wings', antennaLength:'Appendages', jawOpen:'Head', toothSize:'Head', dorsalHeight:'Fins', finSize:'Fins', finPairs:'Fins', appendages:'Appendages', appendageLength:'Appendages', limbPairs:'Legs and feet', segments:'Body', eyeCount:'Head', glow:'Body'})[key];
        const sections = new Map();
        const put = (section, html) => sections.set(section, (sections.get(section) || '') + html);
        for (const v of RRCreatureBody.variantsFor(r)) put('Body', this._select(v.key, v.label, v.choices));
        for (const o of RRCreatureBody.OPTIONS.filter(o => o.key !== 'pattern' && (ordinary || o.key === 'horns'))) {
            put(({ears:'Head',tail:'Tail',horns:'Horns',feet:'Legs and feet',wings:'Wings',mane:'Head'})[o.key], this._select(o.key, o.label, o.choices.map(c => [c.id, c.label])));
        }
        const absent = key => {
            if (key === 'headSize' && r.morphology === 'worm' && ['tapeworm','leech','roundworm'].includes(r.wormType)) return true;
            if (key === 'hornSize') return r.horns === 'none';
            if (key === 'toothSize') return r.jawOpen === 0;
            if (key === 'segments' && r.morphology === 'arthropod') return r.kind !== 'centipede';
            if (key === 'plantigrade') return r.feet === 'hoof';
            if (key === 'appendageLength') return ['cephalopod','jellyfish'].includes(r.morphology) && r.appendages === 0 || r.morphology === 'arthropod' && r.limbPairs === 0;
            if (!ordinary) return false;
            const part = ({earSize:'ears', earDroop:'ears', tailLength:'tail', tailThickness:'tail', tailCurl:'tail', maneSize:'mane', wingSize:'wings'})[key];
            return part && r[part] === 'none';
        };
        for (const s of controls.filter(s => !absent(s.key))) put(sectionFor(s.key) || s.section, this._slider({
            path: s.key, label: s.label, natural: s.natural || [s.min, s.max], extreme: [s.min, s.max], step: s.step, format: s.integer ? 'count' : s.unit === 'm' ? 'm' : s.unit === '°' || /Angle|Pitch/.test(s.key) ? 'deg' : 'x'
        }));
        // Talk tries the mouth out, as a Show Text will in the game.
        if (ordinary) put('Head', `<div class="rr-c3d-row"><span class="rr-c3d-label"></span><button class="rr-btn-chip rr-c3d-talk" data-act="talk">${this._talk ? '■ ' + this._t('Stop') : this._t('Talk')}</button></div>`);
        const anatomy = ordinary && r.anatomy.detail ? this._section('Anatomy') + this._select('anatomy.sex', 'Shown as', [['male', 'Male'], ['female', 'Female']]) + RRCreatureBody.anatomySliders(r).map(s => this._slider({path:'anatomy.' + s.key, label:s.label, natural:s.natural, extreme:[s.min,s.max],format:'x'})).join('') : '';
        return this._extremeToggle(ordinary) + [...sections].map(([section,html]) => this._section(section) + html).join('') + anatomy;
    }

    _cap(s) { return String(s).charAt(0).toUpperCase() + String(s).slice(1); }

    /** The tab's switches, above its sections: Extreme proportions, and on the Body tab Anatomical detail. */
    _extremeToggle(anatomy) {
        const extreme = `<label class="rr-c3d-extreme"><input type="checkbox" data-act="extreme"${this.extreme ? ' checked' : ''}><span>${this._t('Extreme proportions')}</span></label>`;
        const detail = anatomy ? `<label class="rr-c3d-extreme"><input type="checkbox" data-path="anatomy.detail"${this.recipe.anatomy.detail ? ' checked' : ''}><span>${this._t('Anatomical detail')}</span></label>` : '';
        return `<div class="rr-c3d-switches">${extreme}${detail}</div>`;
    }

    /** Each section with all its sliders (a section folds by its header); `extra` adds controls at a section's top or end. */
    _shapeSliders(sections, extra = {}) {
        return sections.map(section => {
            const list = RRHumanBody.SLIDERS.filter(s => s.section === section);
            const more = extra[section] || {};
            return this._section(section) + (more.before || '') + list.map(s => this._slider({
                path: `shapes.${s.key}`, label: s.label, natural: s.paired ? [-1, 1] : [0, 1], extreme: s.paired ? [-s.extreme, s.extreme] : [0, s.extreme], format: s.paired ? 'signed' : ''
            })).join('') + (more.after || '');
        }).join('');
    }

    _bodyTab() {
        if (this.slime) return RRSlimeBody.panel(this);
        if (!this.human) return this._creatureBodySettings();
        const M = RRHumanBody.MACRO_RANGES;
        const macro = [
            { path: 'gender', label: 'Gender', natural: [0, 1], ends: ['Female', 'Male'] },
            { path: 'age', label: 'Age', natural: [RRHumanBody.MIN_AGE, RRHumanBody.MAX_AGE], step: 1, format: 'years' },
            { path: 'height', label: 'Height', natural: M.height.natural, extreme: M.height.extreme },
            { path: 'weight', label: 'Weight', natural: M.weight.natural, extreme: M.weight.extreme, ends: ['Thin', 'Heavy'] },
            { path: 'fatBounce', label: 'Fat bounce', natural: M.fatBounce.natural, extreme: M.fatBounce.extreme, step: .01, ends: ['Off', 'Bouncy'] },
            { path: 'muscle', label: 'Muscle', natural: M.muscle.natural, extreme: M.muscle.extreme },
            { path: 'proportions', label: 'Proportions', natural: M.proportions.natural, extreme: M.proportions.extreme, ends: ['Average', 'Ideal'] },
            { path: 'headSize', label: 'Head size', natural: [0.8, 1.25], extreme: [0.5, 2.2], format: 'x' }
        ];
        const a = this.recipe.anatomy, detail = a.detail, male = RRHumanBody.sexOf(this.recipe) === 'male';
        const shownAs = detail ? this._select('anatomy.sex', 'Shown as', [['auto', 'By gender'], ['male', 'Male'], ['female', 'Female']]) : '';
        const bustTop = this._slider({ path: 'cup', label: 'Bust size', natural: M.cup.natural, extreme: M.cup.extreme })
            + this._slider({ path: 'firmness', label: 'Firmness', natural: M.firmness.natural, extreme: M.firmness.extreme })
            + this._slider({ path: 'bustBounce', label: 'Bust bounce', natural: M.bustBounce.natural, extreme: M.bustBounce.extreme, step: .01, ends: ['Off', 'Bouncy'] });
        const nipples = detail ? this._slider({ path: 'anatomy.areola', label: 'Areola size', natural: [0.6, 1.6], extreme: [0.4, 2.5], format: 'x' })
            + this._slider({ path: 'anatomy.nipple', label: 'Nipple size', natural: [0.3, 2], extreme: [0, 3], format: 'x' })
            + this._slider({ path: 'anatomy.nippleProjection', label: 'Nipple projection', natural: [0, 2], extreme: [0, 10], format: 'x', ends: ['Flat', 'Raised'] })
            + this._color('anatomy.areolaColor', 'Areola color', ['#c08070', '#a0605a', '#7a4a3a', '#4a2a22'], true) : '';
        const toes = this._slider({ path: 'morph.toes', label: 'Toe length', natural: [0.7, 1.5], extreme: [0.4, 3], format: 'x' });
        let genitals = '';
        if (detail) {
            genitals = this._section('Genitals') + (male
                ? this._check('anatomy.paired', 'Paired male anatomy')
                    + this._select('anatomy.foreskin', 'Foreskin', [['circumcised', 'Circumcised'], ['uncircumcised', 'Uncircumcised']])
                    + [['length', 'Length'], ['girth', 'Girth'], ['testicles', 'Testicles']].map(([k, label]) => this._slider({ path: `anatomy.${k}`, label, natural: [-1, 1], extreme: [-1, 2], format: 'signed' })).join('')
                : this._slider({ path: 'anatomy.mons', label: 'Mons', natural: [0, 2], extreme: [0, 3], format: 'x' })
                    + this._slider({ path: 'anatomy.labia', label: 'Labia', natural: [0, 2], extreme: [0, 3], format: 'x' })
                    + this._slider({ path: 'anatomy.innerLabia', label: 'Inner labia', natural: [0, 2], extreme: [0, 3], format: 'x' })
                    + this._slider({ path: 'anatomy.clitoris', label: 'Clitoris size', natural: [0, 2], extreme: [0, 3], format: 'x' })
                    + this._slider({ path: 'anatomy.fold', label: 'Fold depth', natural: [0, 2], format: 'x' }));
        }
        return this._extremeToggle(true) + this._section('Build') + macro.map(s => this._slider(s)).join('') + shownAs
            + this._shapeSliders(['Proportions', 'Torso', 'Bust', 'Arms and legs'], { Bust: { before: bustTop, after: nipples }, 'Arms and legs': { after: toes + this._bodyFeature('arms') }, Torso: { after: this._slider({ path: 'buttBounce', label: 'Butt bounce', natural: M.buttBounce.natural, extreme: M.buttBounce.extreme, step: .01, ends: ['Off', 'Bouncy'] }) + this._bodyFeature('spines') + this._bodyFeature('machinery') } })
            + this._section('Head') + this._select('headId', 'Head', RRCharacterSpecies.heads(), RRCharacterSpecies.headId(this.recipe.head))
            + ['horns','ears','antennae','fangs','beak','tusks','whiskers','alienEyes'].map(key => this._bodyFeature(key)).join('')
            // Centaur hook: the horse's coat and build in place of a tail of the person's own.
            + (this.recipe.species === 'centaur' && window.RRCharacterCentaur ? RRCharacterCentaur.panel(this) : this.recipe.species === 'merfolk' && window.RRMerfolkBody ? RRMerfolkBody.panel(this) : this._section('Tail') + this._bodyFeature('tail'))
            + this._section('Wings') + this._bodyFeature('wings') + genitals + this._bodyHairSection();
    }

    /** Body hair: how much, by pattern or region by region, its color, and fur over it. */
    _bodyHairSection() {
        const b = this.recipe.bodyHair, K = RRCharacterSkin;
        let html = this._section('Body hair') + this._slider({ path: 'bodyHair.amount', label: 'Amount', natural: [0, 1] })
            + this._select('bodyHair.pattern', 'Pattern', K.BODY_HAIR_PATTERNS)
            + K.HAIR_REGIONS.map(([key, label]) => this._slider({ path: `bodyHair.regions.${key}`, label, natural: [0, 1] })).join('');
        html += this._color('bodyHair.color', 'Color', ['#0e0c0b', '#2a1d15', '#6a4428', '#b8632a', '#d8b070', '#8a8a8a'], true)
            + this._slider({ path: 'bodyHair.fur', label: 'Fur', natural: [0, 1] });
        if (b.fur > 0) html += this._slider({ path: 'bodyHair.length', label: 'Fur length', natural: [0.5, 1.6], extreme: [0.3, 3], format: 'x' });
        return html;
    }

    /** Eye styles: a set of eye size, shape, iris, pupil and catchlights. */
    static get EYE_STYLES() {
        return {
            natural: { shapes: { eyeSize: 0 }, morph: { eyeWide: 1, eyeTall: 1 }, eyes: { size: 1.2, pupilSize: 1, catchlight: false } },
            anime: { shapes: { eyeSize: 1.1 }, morph: { eyeWide: 1.1, eyeTall: 1.3 }, eyes: { size: 1.45, pupilSize: 1.15, catchlight: true } },
            beady: { shapes: { eyeSize: -1.2 }, morph: { eyeWide: 0.85, eyeTall: 0.85 }, eyes: { size: 0.85, pupilSize: 1.3, catchlight: false } }
        };
    }

    _eyeStyle() {
        // Custom is a choice too: the select stays on it, with the eye sliders below it, until a preset is picked.
        if (this._eyeCustom) return 'custom';
        const r = this.recipe;
        for (const [id, st] of Object.entries(Character3DBuilder.EYE_STYLES)) {
            if (Math.abs(r.shapes.eyeSize - st.shapes.eyeSize) < 0.01 && Math.abs(r.morph.eyeWide - st.morph.eyeWide) < 0.01 && Math.abs(r.morph.eyeTall - st.morph.eyeTall) < 0.01
                && Math.abs(r.eyes.size - st.eyes.size) < 0.01 && !!r.eyes.catchlight === st.eyes.catchlight) return id;
        }
        return 'custom';
    }

    _applyEyeStyle(id) {
        const st = Character3DBuilder.EYE_STYLES[id];
        this._eyeCustom = !st;
        if (!st) { this._renderPanel(); return; }
        if (!this.extreme && (st.shapes.eyeSize > 1 || st.shapes.eyeSize < -1)) this.extreme = true;
        const r = JSON.parse(JSON.stringify(this.recipe));
        Object.assign(r.shapes, st.shapes); Object.assign(r.morph, st.morph); r.eyes = Object.assign({}, r.eyes, st.eyes);
        this._replace(r);
    }

    _faceTab() {
        const morph = [
            { path: 'morph.cranialRidges', label: 'Cranial ridges', natural: [0, 1.5], extreme: [0, 3] },
            { path: 'morph.noseFolds', label: 'Nose folds', natural: [0, 1.5], extreme: [0, 3] },
            { path: 'morph.cranialLobes', label: 'Cranial lobes', natural: [0, 1.5], extreme: [0, 3] },
            { path: 'morph.earBowls', label: 'Ear bowls', natural: [0, 1], extreme: [0, 2] },
            { path: 'morph.foreheadSpoon', label: 'Forehead spoon', natural: [0, 1.5], extreme: [0, 3] },
            { path: 'morph.facialRidges', label: 'Facial ridges', natural: [0, 1.5], extreme: [0, 3] },
            { path: 'morph.neckWebbing', label: 'Neck webbing', natural: [0, 1.5], extreme: [0, 3] },
            { path: 'morph.snout', label: 'Snout', natural: [0, 1], extreme: [0, 1.5] },
            { path: 'morph.muzzle', label: 'Muzzle narrow', natural: [0, 1] },
            { path: 'morph.flat', label: 'Flat face', natural: [0, 1] },
            { path: 'morph.earsAway', label: 'Hide ears', natural: [0, 1] }
        ].concat(this.recipe.morph.earsAway > 0.6 ? [{ path: 'morph.earHoles', label: 'Ear holes', natural: [0, 2] }] : []);
        const eyeStyle = this._select('eyeStyle', 'Eye style', [['natural', 'Natural'], ['anime', 'Anime'], ['beady', 'Small'], ['custom', 'Custom']], this._eyeStyle());
        const eyeShape = [
            { path: 'morph.eyeWide', label: 'Eye width', natural: [0.7, 1.4], extreme: [0.5, 2.5], format: 'x' },
            { path: 'morph.eyeTall', label: 'Eye tallness', natural: [0.7, 1.4], extreme: [0.5, 2.5], format: 'x' }
        ];
        // One choice of people; the blend under it fine-tunes the face.
        const ancestry = this._select('ancestry.people', 'Heritage', RRHumanBody.PEOPLES.map(p => [p.id, p.label]), this.recipe.ancestry.people || 'mixed')
            + RRHumanBody.ANCESTRY.map(a => this._slider({ path: `ancestry.${a}`, label: { african: 'African', asian: 'Asian', caucasian: 'European' }[a], natural: [0, 1] })).join('');
        return this._extremeToggle() + this._expressionRows() + this._section('Ancestry') + ancestry + this._shapeSliders(['Head and neck', 'Head shape', 'Forehead and brows', 'Eyes']) + eyeStyle + eyeShape.map(s => this._slider(s)).join('')
            + this._shapeSliders(['Nose', 'Mouth and jaw', 'Ears'])
            + this._section('Muzzle and face') + morph.map(s => this._slider(s)).join('');
    }

    _hairTab() {
        const H = RRCharacterHair;
        const colors = ['#0e0c0b', '#2a1d15', '#3b2a1e', '#6a4428', '#8a3a1c', '#b8632a', '#d8b070', '#efe2b8', '#8a8a8a', '#e8e8e8', '#2a4ab0', '#2a8a4a', '#d84a9a', '#7a3ab8', '#c02020'];
        const h = this.recipe.hair;
        const options = list => list.map(x => ({ id: x.id, label: x.label, group: x.group }));
        let out = this._section('Hair') + this._picker('hair.style', 'Style', options(H.STYLES), 'hair') + this._color('hair.color', 'Color', colors) + this._color('hair.tipColor', 'Tip color', [], true);
        if (h.style !== 'bald') {
            out += [
                { path: 'hair.length', label: 'Length', natural: [0.3, 2.5], format: 'x' },
                { path: 'hair.volume', label: 'Volume', natural: [0, 1] },
                { path: 'hair.curl', label: 'Curl', natural: [0, 1] },
                { path: 'hair.density', label: 'Density', natural: [0.3, 1.5], format: 'x' },
                { path: 'hair.frizz', label: 'Frizz', natural: [0, 1] },
                { path: 'hair.strandWidth', label: 'Lock thickness', natural: [0.5, 1.8], format: 'x' },
                { path: 'hair.fringe', label: 'Bangs', natural: [0, 1] },
                { path: 'hair.hairline', label: 'Receding', natural: [0, 1] },
                { path: 'hair.highlights', label: 'Highlights', natural: [0, 1] }
            ].map(s => this._slider(s)).join('') + this._select('hair.part', 'Part', (H.PARTS || ['center', 'left', 'right', 'none']).map(p => [p, this._cap(p === 'none' ? 'None' : p)]));
        }
        out += this._section('Facial hair') + this._picker('hair.facial.style', 'Style', options(H.FACIAL), 'facial');
        if (h.facial.style !== 'none') {
            out += this._color('hair.facial.color', 'Color', colors.slice(0, 10), true)
                + this._slider({ path: 'hair.facial.length', label: 'Length', natural: [0.3, 2.5], format: 'x' })
                + this._slider({ path: 'hair.facial.volume', label: 'Volume', natural: [0, 1] });
        }
        out += this._section('Brows and lashes') + this._picker('hair.brows.style', 'Brows', options(H.BROWS), 'brows');
        if (h.brows.style !== 'none') out += this._slider({ path: 'hair.brows.thickness', label: 'Thickness', natural: [0, 1] }) + this._slider({ path: 'hair.brows.height', label: 'Height', natural: [-0.5, 0.5], extreme: [-0.8, 0.8] }) + this._color('hair.brows.color', 'Color', colors.slice(0, 10), true);
        return out + this._check('hair.lashes', 'Eyelashes');
    }

    _garmentChoices() {
        const W = RRCharacterWardrobe;
        return [...new Set(W.GARMENTS.map(g => g.group))].map(group => ({ group, items: W.GARMENTS.filter(g => g.group === group).map(g => [g.id, g.label]) }));
    }

    /** A catalog animal starts with its own dimensions, anatomy and equipment defaults. */
    _creature(kind) {
        return Object.assign({ plan: 'quadruped' }, RRCreatureBody.kindRecipe(kind));
    }

    /** A four-legged creature's gear: a preset to start from, pieces one by one, each with its colors and material. */
    _gearTab() {
        const G = RRCreatureGear, r = this.recipe;
        const presets = `<div class="rr-c3d-tiles">${G.PRESETS.map(p => this._tile('gear-preset', p.id, p.label, 'gearset', false)).join('')}</div>`;
        const add = this._addPicker('gear', 'Add gear', G.ITEMS.filter(i => G.fits(i.id, r)).map(i => ({ id: i.id, label: i.label, group: i.group })), 'add-gear');
        const items = (r.gear || []).map((g, i) => {
            const def = G.ITEMS.find(x => x.id === g.id);
            if (!def) return null;
            let html = this._color(`gear.${i}.color`, 'Color', ['#8a2a22', '#2f4468', '#1f1f24', '#5a3d22', '#3e5a32', '#c9a35a', '#d8d8e0']);
            if (def.defaults.color2) html += this._color(`gear.${i}.color2`, 'Second color', []);
            if ((def.materials || []).length > 1) html += this._select(`gear.${i}.material`, 'Material', def.materials.map(m => [m, this._cap(m)]));
            return { id: g.id, label: def.label, html };
        }).filter(Boolean);
        return this._section('Dress as') + presets + this._section('Gear') + add
            + (items.length ? this._cards(items, 'remove-gear') : `<p class="rr-c3d-note">${this._t('Nothing worn. Pick a set above or add pieces one by one.')}</p>`);
    }

    _outfitTab() {
        const W = RRCharacterWardrobe;
        this._loadOutfitEmblems();
        if (this._outfitProjectPath !== this._project()?.path) this._outfitUndo = null;
        this._outfitProjectPath = this._project()?.path;
        this._bindOutfitActions();
        const order = ['Basics', 'Everyday', 'Workwear', 'Swimwear', 'Formal', 'Fantasy', 'Armor', 'Sci-fi'];
        const groups = [...new Set(W.PRESETS.map(p => p.group))].sort((a,b) => (order.includes(a)?order.indexOf(a):order.length) - (order.includes(b)?order.indexOf(b):order.length));
        const presets = groups.map(g => `<div class="rr-c3d-subhead">${this._t(g)}</div><div class="rr-c3d-tiles">${W.PRESETS.filter(p => p.group === g)
            .map(p => {
                const key = W.BY_ID.get(p.items[0]?.id)?.transfer;
                const tile = this._tile('dress', p.id, p.label, 'dress', false);
                return key?.startsWith('project:') ? `<div class="rr-c3d-import-preset" data-user-outfit="${rrEscapeHtml(key)}">${tile}<button class="rr-c3d-import-delete" data-outfit-delete="${rrEscapeHtml(key)}" title="${this._t('Delete outfit')}" aria-label="${this._t('Delete outfit')}">×</button></div>` : tile;
            }).join('')}</div>`).join('');
        // Merfolk hook: nothing for legs or feet on a tail.
        const fits = g => RRCharacterModel.fitsGarment(this.recipe,g.id)&&(!(window.RRMerfolkBody && this.recipe.species === 'merfolk') || RRMerfolkBody.fitsGarment(g.id))&&(!(window.RRCharacterCentaur && this.recipe.species === 'centaur') || RRCharacterCentaur.fitsGarment(g.id));
        const add = this._addPicker('garment', 'Add a garment', W.GARMENTS.filter(fits).map(g => ({ id: g.id, label: g.label, group: g.group })), 'add-garment');
        const knobs = { sleeves: ['Sleeves', [0, 1]], length: ['Length', [0, 1], [0, 1.4]], fit: ['Looseness', [0, 1], [0, 1.5]], flare: ['Flare', [0, 1], [0, 1.5]], bell: ['Bell sleeves', [0, 1]], open: ['Open front', [0, 1]], face: ['Covers face', [0, 1]], bulk: ['Bulk', [0, 1], [0, 1.5]] };
        const items = this.recipe.outfit.map((item, i) => {
            const g = W.BY_ID.get(item.id);
            const wearable=window.RRGarmentProp?.supports(g.id)?`<button class="rr-btn-chip" data-act="garment-prop" data-index="${i}">${this._t('Edit as wearable prop')}</button>`:'';
            const swatches = ['#f2f0ea', '#1f1f24', '#2f4468', '#7a3b3b', '#3e5a32', '#5a3d22', '#8a8e96', '#c9a35a'];
            // [outfit transfer] A garment taken from a model shows its own picture until a color is chosen
            // (cleared, it comes back); its main color, second color and trim each move on their own.
            if (g.transfer) {
                const html = this._color(`outfit.${i}.color`, 'Color', swatches, true) + this._color(`outfit.${i}.color2`, 'Second color', [], true) + this._color(`outfit.${i}.trim`, 'Trim', [], true);
                return { id: item.id, label: g.label, html:html+wearable };
            }
            // A modeled garment shows its own picture until a color is chosen (cleared, it comes back); its
            // pattern and trim are in the picture.
            if (g.modeled) {
                const fitted = this.pack && typeof RRCharacterClothes !== 'undefined' && RRCharacterClothes.load(this.pack).garments.get(item.id);
                let html = this._color(`outfit.${i}.color`, 'Color', swatches, true);
                if (fitted && (fitted.regions > 1 || item.id==='mh_viking_tunic')) html += this._color(`outfit.${i}.color2`, item.id==='mh_viking_tunic'?'Mail color':'Second color', [], true);
                if(item.id==='mh_viking_tunic')html+=this._color(`outfit.${i}.trim`,'Embroidery color',[],true)+this._slider({path:`outfit.${i}.textureContrast`,label:'Fabric contrast',natural:[.5,1.5],extreme:[.5,1.5]});
                return { id: item.id, label: g.label, html:html+wearable };
            }
            let html = this._color(`outfit.${i}.color`, 'Color', swatches);
            html += this._color(`outfit.${i}.color2`, 'Second color', []) + this._color(`outfit.${i}.trim`, 'Trim', [], true);
            html += this._select(`outfit.${i}.pattern`, 'Pattern', W.PATTERNS.concat(item.pattern && !W.PATTERNS.some(p => p[0] === item.pattern) ? [[item.pattern, this._cap(item.pattern)]] : []));
            if (item.pattern === 'emblem') html += `<div class="rr-c3d-row rr-c3d-emblem-row"><span class="rr-c3d-label">${this._t('Emblem picture')}</span><span class="rr-c3d-emblem-name" title="${rrEscapeHtml(item.emblemPicture || '')}"><img class="rr-c3d-emblem-thumb" src="${rrEscapeHtml(this._emblemThumb(item))}" alt=""><span>${rrEscapeHtml(item.emblemPicture || this._t('None'))}</span></span><button class="rr-btn-chip" data-outfit-emblem="${i}">${this._t('Choose…')}</button>${item.emblemPicture ? `<button class="rr-btn-chip" data-outfit-emblem-clear="${i}">${this._t('Clear')}</button>` : ''}</div>`;
            html += this._select(`outfit.${i}.material`, 'Material', Object.keys(W.MATERIAL).map(m => [m, this._cap(m)]));
            // Armor pieces: their plate or leather style (RRCharacterWardrobe garment `styles`).
            if (g.styles) html += this._select(`outfit.${i}.style`, 'Style', g.styles);
            // Construction details (RRCharacterWardrobe garment `details`): a few choices, each on by default.
            const chosen = W.detailsOf ? W.detailsOf(item) : {};
            for (const d of g.details || []) html += d.toggle
                ? `<label class="rr-c3d-row rr-c3d-check"><span class="rr-c3d-label">${this._t(d.label)}</span><input type="checkbox" data-path="outfit.${i}.${d.id}"${chosen[d.id] ? ' checked' : ''}></label>`
                : this._select(`outfit.${i}.${d.id}`, d.label, d.choices, chosen[d.id]);
            if (g.defaults.lightStyle != null) {
                html += this._select(`outfit.${i}.lightStyle`, 'Light layout', [['none', 'None'], ['badge', 'Badge'], ['strips', 'Light strips'], ['circuits', 'Circuit traces']]);
                html += this._color(`outfit.${i}.lightColor`, 'Light color', ['#70dfff', '#ffb65a', '#ef526c', '#7ce6ad', '#c39bff']);
                html += this._slider({ path: `outfit.${i}.lightIntensity`, label: 'Light brightness', natural: [0, 1] });
                html += this._slider({ path: `outfit.${i}.lightWidth`, label: 'Light width', natural: [0.4, 2.5], format: 'x' });
            }
            for (const k of g.knobs || Object.keys(knobs).filter(k => item[k] != null)) {
                if (k === 'neckline') { html += this._select(`outfit.${i}.neckline`, 'Neckline', W.NECKLINE_CHOICES); continue; }
                if (k === 'color2') continue;
                const [label, natural, extreme] = knobs[k] || [];
                if (label) html += this._slider({ path: `outfit.${i}.${k}`, label, natural, extreme: extreme || natural });
            }
            html += this._slider({ path: `outfit.${i}.trimWidth`, label: 'Trim width', natural: [0, 0.25] });
            // Wear and damage (RRCharacterWear): grime, fading, frayed hems, holes, patches and tape as it grows.
            html += this._slider({ path: `outfit.${i}.wear`, label: 'Wear', natural: [0, 1] });
            if(RRCharacterMarks.supports(g,item))html+=RRCharacterMarks.panel(this,`outfit.${i}.mark`,item.mark,{garment:true});
            return { id: item.id, label: g.label, html:html+wearable };
        });
        // [outfit transfer] An outfit taken off one of the project's own humanoid models.
        const take = window.RRCharacterOutfitTransfer && this._project() ? `<div class="rr-c3d-tiles"><button class="rr-c3d-tile rr-c3d-import-add" data-act="take-outfit"><span class="rr-c3d-nothumb">+</span><span class="rr-c3d-tile-label">${this._t('+ From model…')}</span></button></div>` : '';
        const undo = this._outfitUndo ? `<button class="rr-btn-chip" data-outfit-undo>${this._t('Undo')}</button>` : '';
        return this._section('Dress as') + take + undo + presets + this._section('Garments') + add
            + (items.length ? this._cards(items, 'remove-garment') : `<p class="rr-c3d-note">${this._t('Nothing worn. Pick an outfit above or add garments one by one.')}</p>`);
    }

    _propsTab() {
        this._loadOutfitEmblems();
        const P = RRCharacterProps;
        const add = this._addPicker('prop', 'Add an accessory', P.PROPS.filter(p => RRCharacterModel.fitsProp(this.recipe,p.id)&&(!this.slime || RRSlimeBody.fits(p.id))).map(p => ({ id: p.id, label: p.label, group: p.group })), 'add-prop');
        const knobs = { size: ['Size', [0.6, 1.5], [0.3, 3]], height: ['Height', [0.5, 1.6], [0.3, 3]], length: ['Length', [0, 1]], width: ['Width', [0.6, 1.5]], up: ['Raised', [0, 1]] };
        // Cyberware (RRCharacterCyberGear): whole looks to put on at once, one style each.
        const looks = window.RRCharacterCyberGear && this.human && !this.slime ? this._addPicker('cyberlook', 'Cyber looks', RRCharacterCyberGear.LOOKS.map(l => ({ id: l.id, label: l.label })), 'cyber-look') : '';
        const items = this.recipe.props.map((item, i) => {
            const def = P.BY_ID.get(item.id);
            // Cyberware: its style first, then its shape or side, its colors (cleared: the style's own), its glow and wear.
            if (def.cyber) {
                const path = k => `props.${i}.${k}`, labels = RRCharacterCyberGear.LABELS;
                let html = this._select(path('style'), labels.style, def.options.style);
                if (def.shapes) html += this._select(path('shape'), 'Shape', def.shapes);
                if (def.defaults.side) html += this._select(path('side'), 'Side', [['left', 'Left'], ['right', 'Right']]);
                for (const [key, spec] of Object.entries(def.options)) if (!['style', 'glow', 'wear'].includes(key)) html += spec === 'check' ? this._check(path(key), labels[key] || key) : this._select(path(key), labels[key] || key, spec);
                if(item.id==='earScouter')html+=`<label class="rr-c3d-row"><span class="rr-c3d-label">${this._t('Display readout')}</span><input class="rr-input" data-path="${path('displayText')}" maxlength="32" value="${rrEscapeHtml(item.displayText||'POWER 9000')}"></label>`;
                html += this._color(path('color'), def.labels.color, def.swatches, true) + this._color(path('color2'), def.labels.color2, def.swatches2, true);
                html += this._slider({ path: path('glow'), label: labels.glow, natural: [0, 1] }) + this._slider({ path: path('wear'), label: labels.wear, natural: [0, 1] });
                return { id: item.id, label: def.label, html };
            }
            let html = this._color(`props.${i}.color`, 'Color', ['#141414', '#e0b84a', '#d8d8e0', '#8a1a2a', '#2e3f8a', '#5a4a3a']);
            if (def.defaults.color2) html += this._color(`props.${i}.color2`, 'Second color', []);
            if (def.shapes) html += this._select(`props.${i}.shape`, 'Shape', def.shapes);
            if (def.defaults.side) html += this._select(`props.${i}.side`, 'Side', [['left', 'Left'], ['right', 'Right']]);
            for (const [k, [label, natural, extreme]] of Object.entries(knobs)) if (def.defaults[k] != null) html += this._slider({ path: `props.${i}.${k}`, label, natural, extreme: extreme || natural, format: k === 'length' || k === 'up' ? '' : 'x' });
            const optionLabels={charm:'Charm',studs:'Studs',thick:'Thickness',billLength:'Bill length',pockets:'Pockets',vents:'Vents',trimWidth:'Trim width',pattern:'Pattern',patternScale:'Pattern scale'};
            for(const [key,spec]of Object.entries(def.options||{})){
                const path=`props.${i}.${key}`,label=optionLabels[key]||key;
                if(spec==='check')html+=this._check(path,label);
                else if(Array.isArray(spec[0]))html+=this._select(path,label,spec);
                else html+=this._slider({path,label,natural:spec,extreme:spec,step:key==='pockets'||key==='vents'?1:.05});
            }
            if(['cape','scarf','jetpack'].includes(item.id))html+=RRCharacterMarks.panel(this,`props.${i}.mark`,item.mark);
            return { id: item.id, label: def.label, html };
        });
        const weapons = this.human && !this.slime ? this._heldModels() : [];
        const held = weapons.length ? this._section('Preview') + `<label class="rr-c3d-row rr-c3d-choice"><span class="rr-c3d-label">${this._t('Weapon')}</span><select class="rr-select" data-path="previewWeapon"><option value="">${this._t('None')}</option>${weapons.map(m => `<option value="${rrEscapeHtml(m.name)}"${m.name === this._heldName ? ' selected' : ''}>${rrEscapeHtml(m.name)}</option>`).join('')}</select></label>` : '';
        return this._section('Accessories') + add + looks + (items.length ? this._cards(items, 'remove-prop') : this.slime ? '' : `<p class="rr-c3d-note">${this._t('Glasses, hats, jewelry, capes and packs. Each fits the head and body as they are shaped.')}</p>`) + held;
    }

    /** Project weapons with explicit grip markers, offered only for pose preview. */
    _heldModels() {
        const project = this._project();
        if (!project || typeof ModelGraphicPicker === 'undefined' || typeof require !== 'function') return [];
        const now = Date.now();
        if (this._heldCatalog?.project === project.path && now - this._heldCatalog.at < 1000) return this._heldCatalog.models;
        const fs = require('fs'), path = require('path');
        const models = ModelGraphicPicker.listModels(project.path).filter(m => m.ext.toLowerCase() === '.glb').flatMap(m => {
            try {
                const sidecar = JSON.parse(fs.readFileSync(path.join(project.path, '3d', m.name, 'model.json'), 'utf8'));
                if (!['blade', 'gun'].includes(sidecar.rig?.template)) return [];
                return [Object.assign({}, m, { sidecar })];
            } catch (_) { return []; }
        });
        this._heldCatalog = { project: project.path, at: now, models };
        return models;
    }

    _dropHeldPreview() {
        const view = this._view;
        if (!view) return;
        view.heldRequest = (view.heldRequest || 0) + 1;
        if (view.held) Character3DBuilder.disposeHeldPreview(view.held);
        view.held = null; view.heldName = ''; view.heldLoading = '';
    }

    _attachHeldPreview() {
        const view = this._view, object = view?.held;
        if (!object) return;
        const id = view.boneDefs.findIndex(b => b.name === 'RightHand');
        const frame = window.RRCharacterPoses?.handFrames(view.boneDefs).Right;
        if (id < 0 || !frame || !this.human || this.slime) { object.removeFromParent(); return; }
        const shape = Reactor3D.heldShape(object);
        Character3DBuilder.fitHeldPreview(object, shape, frame, THREE);
        view.bones[id].add(object);
    }

    async _syncHeldPreview() {
        const view = this._view, project = this._project(), name = this._heldName || '';
        if (!view || !project) return;
        if (view.heldName === name && view.held) { this._attachHeldPreview(); return; }
        if (view.heldLoading === name && name) return;
        this._dropHeldPreview();
        if (!name || !this.human || this.slime) { this._draw(); return; }
        const model = this._heldModels().find(m => m.name === name);
        if (!model) return;
        const request = view.heldRequest, root = this.root;
        const current = () => this._view === view && this.root === root && this._project()?.path === project.path && this._heldName === name && view.heldRequest === request;
        view.heldLoading = name;
        let object;
        try {
            if (!window.Reactor3D?.readModelAsync) await this.projectController?.mapEditor3D?.ensureLibraries?.();
            if (!current()) return;
            const fs = require('fs'), path = require('path');
            const file = path.join(project.path, '3d', model.name, 'source', model.file + model.ext);
            const data = await fs.promises.readFile(file);
            if (!current()) return;
            object = await Reactor3D.readModelAsync(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength), model.ext, path.dirname(file) + '/', '', { beforeBuild: () => { if (!current()) throw new Error('Preview superseded'); } });
            if (!current()) { Character3DBuilder.disposeHeldPreview(object); return; }
            const rig = Reactor3D.readHeldRig(model.sidecar);
            if (!rig) throw new Error('Weapon grip markers are missing');
            object.userData.__heldRig = rig;
            // The builder uses studio PBR materials, independently of map lighting.
            const materials = new Map();
            object.traverse(node => {
                if (!node.isMesh) return;
                const convert = old => {
                    if (!materials.has(old)) materials.set(old, new THREE.MeshStandardMaterial({ color: old.color, map: old.map, vertexColors: !!node.geometry.attributes.color, side: old.side, transparent: old.transparent, opacity: old.opacity, alphaTest: old.alphaTest, normalMap: old.userData.rrNormalMap || null, normalScale: old.userData.rrNormalScale || new THREE.Vector2(1, 1), emissive: old.userData.rrEmissive || 0, emissiveMap: old.userData.rrEmissiveMap || null, roughness: 1 - (old.userData.glbShine?.gloss || 0.25), metalness: old.userData.glbShine?.metal || 0 }));
                    return materials.get(old);
                };
                node.material = Array.isArray(node.material) ? node.material.map(convert) : convert(node.material);
            });
            for (const old of materials.keys()) old.dispose();
            view.held = object; view.heldName = name;
            this._attachHeldPreview(); this._draw();
        } catch (error) {
            if (object && view.held !== object) Character3DBuilder.disposeHeldPreview(object);
            if (current()) this._status(this._t('{name} could not be opened.', { name }), 'error');
        } finally { if (current()) view.heldLoading = ''; }
    }

    _colorsTab() {
        if (!this.human) {
            const pattern = this.recipe.morphology === 'worm' && this.recipe.wormType === 'goauld' ? null : RRCreatureBody.OPTIONS.find(o => o.key === 'pattern');
            const specialized = this.recipe.morphology && this.recipe.morphology !== 'quadruped';
            return this._section(specialized ? 'Surface' : 'Coat') + (pattern ? this._select('pattern', pattern.label, pattern.choices.filter(c => !specialized || c.id !== 'socks').map(c => [c.id, c.label])) : '')
                + RRCreatureBody.SLIDERS.filter(s => s.section === 'Coat' && pattern && (s.key === 'patternScale' ? ['stripes','tabby','spots','rosettes','piebald','dapple','scales'].includes(this.recipe.pattern) || this.recipe.kind === 'shark' && this.recipe.sharkType === 'tiger' : this.recipe.pattern !== 'solid')).map(s => this._slider({ path: s.key, label: s.label, natural: s.natural || [s.min, s.max], extreme: [s.min, s.max], step: s.step, format: 'x' })).join('')
                + RRCreatureBody.COLORS.filter(c => !specialized || !['hoof', 'mane'].includes(c.key)).map(c => this._color(`colors.${c.key}`, specialized && c.key === 'light' ? 'Underside' : specialized && c.key === 'coat' ? 'Surface color' : c.label, [])).join('')
                // A worm's own band: an earthworm's saddle, a leech's side stripes.
                + (this.recipe.kind === 'worm' && ['earthworm', 'leech'].includes(this.recipe.wormType) ? this._color('colors.band', this.recipe.wormType === 'leech' ? 'Side stripes' : 'Saddle band', []) : '');
        }
        const S = RRCharacterSkin;
        const tones = [...RRCharacterSpecies.skinTones(this.recipe.species), '#f6e0d0', '#f1d3bd', '#e5b897', '#c69c7f', '#a8795a', '#8a5a3c', '#5e3b26', '#3f2618', '#6a8a4a', '#7a9a3a', '#b0463e', '#5e5470', '#9aa4a2', '#d8dce2'];
        const sp = this.recipe.skinPattern;
        let out = this._section('Skin') + this._select('skinLook', 'Apply skin look', [['', 'Choose…'], ...S.LOOKS.map(p => [p.id, p.label])])
            + this._color('skin', 'Skin color', tones) + this._select('skinPattern.type', 'Markings', S.PATTERNS);
        if (sp.type !== 'none') out += this._color('skinPattern.color', 'Marking color', []) + this._slider({ path: 'skinPattern.amount', label: 'Strength', natural: [0, 1] }) + this._slider({ path: 'skinPattern.scale', label: 'Scale', natural: [0.3, 3], format: 'x' });
        out += this._color('skinPattern.belly', 'Belly color', [], true);
        out += this._section('Skin surface')
            + this._select('skinSurface.finish', 'Finish', S.FINISHES.map(f => [f.id, f.label]));
        if (this.recipe.skinSurface.finish !== 'natural') out += this._slider({ path: 'skinSurface.strength', label: 'Finish strength', natural: [0, 1] });
        out += this._select('skinSurface.texture', 'Texture', S.SURFACE_TEXTURES);
        if (this.recipe.skinSurface.texture !== 'smooth') out += this._slider({ path: 'skinSurface.detail', label: 'Pore detail', natural: [0, 3], format: 'x' })
            + this._slider({ path: 'skinSurface.scale', label: 'Pore size', natural: [0.5, 2], format: 'x' });
        out += this._section('Makeup') + this._color('skinPattern.lips', 'Lips', ['#b02040', '#c8606a', '#8a2a4a', '#1a1a1a', '#6a3a8a'], true)
            + this._slider({ path: 'skinPattern.blush', label: 'Blush', natural: [0, 1] }) + this._color('skinPattern.eyeshadow', 'Eye shadow', ['#6a3a8a', '#2a4a8a', '#1a1a1a', '#8a5a3a'], true);
        if (sp.eyeshadow) out += this._slider({ path: 'skinPattern.shadowAmount', label: 'Shadow strength', natural: [0, 1] });
        out += this._section('Eyes') + this._color('eyes.color', 'Iris', ['#6a4a2a', '#3a2414', '#3a8ad8', '#4a8a4a', '#8a8a5a', '#5a6a7a', '#e0c030', '#d8302a', '#7a3ab8'])
            + this._select('eyes.pupil', 'Pupil', S.PUPILS) + this._slider({ path: 'eyes.size', label: 'Iris size', natural: [0.7, 1.3], extreme: [0.5, 1.6], format: 'x' })
            + this._slider({ path: 'eyes.pupilSize', label: 'Pupil size', natural: [0.5, 1.6], extreme: [0.3, 2.4], format: 'x' })
            + this._check('eyes.catchlight', 'Catchlights') + this._color('eyes.sclera', 'Whites', ['#1a0808', '#0a0a0e', '#f0e0a0'], true);
        return out;
    }

    // ── pickers with pictures ──────────────────────────────────────────────
    /** A tile with a picture of what it chooses (drawn on the character as it is), filled in when ready. */
    _tile(act, id, label, kind, active, extra = '') {
        const key = kind ? kind + ':' + id : '';
        if (kind) this._wantThumb(kind, id);
        const saved = key && this._thumbs.get(key);
        const url = saved && (saved.sig === this._thumbSig(kind) || saved.project === (this._project()?.path || '')) ? saved.url : '';
        return `<button class="rr-c3d-tile rr-c3d-thumbtile${active ? ' is-active' : ''}" data-act="${act}" data-id="${rrEscapeHtml(id)}"${extra} title="${rrEscapeHtml(this._t(label))}">`
            + `<span class="rr-c3d-thumb" data-thumb="${rrEscapeHtml(key)}">${url ? `<img src="${url}" alt="">` : ''}</span><span class="rr-c3d-tile-label">${rrEscapeHtml(this._t(label))}</span></button>`;
    }

    _grid(options, render) {
        const groups = [...new Set(options.map(o => o.group || ''))];
        return groups.map(g => (g && groups.length > 1 ? `<div class="rr-c3d-subhead">${this._t(g)}</div>` : '') + `<div class="rr-c3d-tiles">${options.filter(o => (o.group || '') === g).map(render).join('')}</div>`).join('');
    }

    /** One choice among pictures: the current one shown, the others opened under it. */
    _picker(path, label, options, kind) {
        const current = this._get(path), open = this.openPicker === path;
        const now = options.find(o => o.id === current) || options[0];
        this._wantThumb(kind, now.id);
        const saved = this._thumbs.get(kind + ':' + now.id);
        const url = saved && (saved.sig === this._thumbSig(kind) || saved.project === (this._project()?.path || '')) ? saved.url : '';
        let html = `<div class="rr-c3d-row rr-c3d-pickrow"><span class="rr-c3d-label">${this._t(label)}</span>
            <button class="rr-c3d-pickcurrent${open ? ' is-open' : ''}" data-act="picker" data-id="${path}">`
            + `<span class="rr-c3d-thumb" data-thumb="${kind}:${rrEscapeHtml(now.id)}">${url ? `<img src="${url}" alt="">` : ''}</span>`
            + `<span>${rrEscapeHtml(this._t(now.label))}</span><span class="rr-c3d-caret">${open ? '▴' : '▾'}</span></button></div>`;
        if (open) html += `<div class="rr-c3d-pickgrid">${this._grid(options, o => this._tile('pick', o.id, o.label, kind, o.id === current, ` data-path="${path}"`))}</div>`;
        return html;
    }

    /** Pictures of things to add (garments, accessories), opened by a button. */
    _addPicker(kind, label, options, act) {
        const open = this.openPicker === 'add:' + kind;
        let html = `<button class="rr-btn-chip rr-c3d-addbtn${open ? ' is-active' : ''}" data-act="picker" data-id="add:${kind}">＋ ${this._t(label)}</button>`;
        if (open) html += `<div class="rr-c3d-pickgrid">${this._grid(options, o => this._tile(act, o.id, o.label, kind, false))}</div>`;
        return html;
    }

    /**
     * Who wears a picture of clothes, hair or a prop: this species and gender, in this skin,
     * hair, eyes, head and body hair, at its default shape. Body and face sliders don't change it, so the pictures
     * stay made, and their files are found again for any character alike. The big view
     * shows the character exactly.
     */
    _thumbWearer(kind) {
        const r = this.recipe;
        if (!this.human || this.slime || r.plan === 'slime' || typeof RRCharacterModel === 'undefined') return r;
        // A mannequin, not the character: a tile's picture shows the choice, and the character shows it worn once it
        // is clicked. Drawn on the character, every tile was built again after each change to skin, hair, face or
        // species (2.5 s a tile on the desktop), and a page of outfits never caught up. On a mannequin a picture is
        // built once, kept on disk, and is the same in every project. One per sex (an outfit is cut differently);
        // grey for what is worn, so the garment is what is seen, and plain for hair, which needs a face under it.
        const female = this._thumbGender() < 0.5, plain = ['hair', 'facial', 'brows'].includes(kind);
        const key = (female ? 'f' : 'm') + (plain ? 'p' : 'g'), made = this._mannequins || (this._mannequins = {});
        if (!made[key]) {
            const m = RRCharacterModel.withSpecies({ gender: female ? 0.25 : 0.75, seed: 1 }, 'human');
            if (!plain) { m.skin = '#b7b4b2'; m.skinPattern = undefined; m.hair = Object.assign({}, m.hair, { style: 'bald' }); m.bodyHair = undefined; }
            made[key] = m;
        }
        return made[key];
    }

    /** A species tile is that species as a man or as a woman, not at the slider's exact place: two pictures, kept. */
    _thumbGender() {
        if (!this.human || this.slime) return 0.5;
        const r = this.recipe, sex = r.anatomy && r.anatomy.sex;
        return (sex === 'male' || sex === 'female' ? sex === 'female' : !(r.gender >= 0.5)) ? 0.25 : 0.75;
    }

    /** What a kind of picture depends on: the recipe, less what the picture itself varies. */
    _thumbSig(kind) {
        const project = this._project()?.path || '';
        if (this._thumbSignatures?.recipe !== this.recipe || this._thumbSignatures.project !== project) {
            this._thumbSignatures = { recipe: this.recipe, project, values: new Map() };
        }
        const values = this._thumbSignatures.values;
        if (!values.has(kind)) {
            const worn = ['hair', 'facial', 'brows', 'garment', 'prop', 'cyberlook', 'dress'].includes(kind);
            const r = Object.assign({}, worn ? this._thumbWearer(kind) : this.recipe);
            if (['hair', 'facial', 'brows', 'garment', 'prop', 'cyberlook'].includes(kind)) { delete r.outfit; delete r.props; }
            if (kind === 'dress') delete r.outfit;
            if (kind === 'gear' || kind === 'gearset') delete r.gear;
            // Species tiles use that species' defaults, with the selected
            // gender. Body/outfit edits therefore need no new catalog images.
            const shown = kind === 'kind' ? null : kind === 'species' ? { gender: this._thumbGender() } : r;
            values.set(kind, JSON.stringify([project, shown]));
        }
        return values.get(kind);
    }

    _wantThumb(kind, id) {
        if (!kind) return;
        const key = kind + ':' + id, sig = this._thumbSig(kind);
        const have = this._thumbs.get(key);
        if (have && have.sig === sig) return;
        const shipped = this._shippedThumb(key, sig);
        if (shipped) { this._thumbs.set(key, { url: shipped, sig, project: this._project()?.path || '' }); return; }
        if (this._thumbJob?.key === key && this._thumbJob.sig === sig) return;
        const queued = this._thumbQueue.find(q => q.key === key);
        if (queued) {
            if (queued.sig !== sig) { queued.sig = sig; queued.stored = false; }
        }
        else this._thumbQueue.push({ key, kind, id, sig });
        this._pumpThumbs();
    }

    /**
     * Pictures kept on disk, in the editor's data folder, named by a hash of
     * everything they show: opening the builder again reuses every one, and a
     * picture is drawn again only when what it shows changes.
     */
    _thumbDir() {
        if (this._thumbFolder !== undefined) return this._thumbFolder;
        try {
            const path = require('path'), fs = require('fs'), os = require('os');
            const base = (typeof nw !== 'undefined' && nw.App && nw.App.dataPath) || os.tmpdir();
            const dir = path.join(base, 'character-builder-previews');
            fs.mkdirSync(dir, { recursive: true });
            this._thumbFolder = dir;
        } catch (error) { this._thumbFolder = null; }
        return this._thumbFolder;
    }

    _thumbFile(key, sig) {
        const dir = this._thumbDir();
        if (!dir) return null;
        // The pictures' look changes with the builder: a new version draws them again.
        const name = require('crypto').createHash('sha1').update(Character3DBuilder.PREVIEW_VERSION + '|' + key + '|' + this._thumbShared(key, sig)).digest('hex');
        return require('path').join(dir, name + '.webp');
    }

    /**
     * What names a picture on disk. A mannequin's picture of something the builder ships with is the same in every
     * project, so the project is left out of its name: a new project opens with every picture already there. A
     * garment taken from a project's own 3D model keeps the project in its name.
     */
    _thumbShared(key, sig) {
        const at = key.indexOf(':'), kind = key.slice(0, at), id = key.slice(at + 1);
        if (kind !== 'kind' && kind !== 'species' && (!this.human || this.slime)) return sig;
        if (!['kind', 'species', 'hair', 'facial', 'brows', 'garment', 'prop', 'cyberlook', 'dress'].includes(kind)) return sig;
        const T = window.RRCharacterOutfitTransfer, W = typeof RRCharacterWardrobe === 'undefined' ? null : RRCharacterWardrobe;
        if (!W && (kind === 'garment' || kind === 'dress')) return sig;
        const own = garment => { const def = W.BY_ID.get(garment); return !def || (!!def.transfer && !(T && T.BUILT_IN.includes(def.transfer))); };
        if (kind === 'garment' && own(id)) return sig;
        if (kind === 'dress') { const preset = W.PRESETS.find(p => p.id === id); if (!preset || preset.items.some(i => own(i.id))) return sig; }
        try { return JSON.stringify(JSON.parse(sig).slice(1)); } catch (e) { return sig; }
    }

    /**
     * A picture that came with the editor (`previews/<kind>-<f|m|x>.json`, baked by
     * build-scripts/bake-character-previews.cjs): there on the first opening, with nothing built. Only for what
     * `_thumbShared` says is the same everywhere, and only while the pack is of this version of the pictures.
     */
    _shippedThumb(key, sig) {
        try {
            if (this._thumbShared(key, sig) === sig) return null;
            const at = key.indexOf(':'), kind = key.slice(0, at), id = key.slice(at + 1);
            const tag = kind === 'kind' || !this.human || this.slime ? 'x' : this._thumbGender() < 0.5 ? 'f' : 'm';
            return Character3DBuilder.shippedPicture(kind, tag, id);
        } catch (error) { return null; }
    }

    /** One baked picture as a data URL (`kind` 'garment', `tag` 'f', 'm' or 'x'), or null: for whoever shows one. */
    static shippedPicture(kind, tag, id) {
        try {
            const packs = Character3DBuilder._shippedPacks || (Character3DBuilder._shippedPacks = new Map()), name = kind + '-' + tag;
            if (!packs.has(name)) {
                let pack = null;
                try { pack = JSON.parse(require('fs').readFileSync(require('path').join(RRHumanBody.dataFolder(), '..', 'previews', name + '.json'), 'utf8')); } catch (error) { /* none shipped */ }
                packs.set(name, pack && pack.version === Character3DBuilder.PREVIEW_VERSION ? pack.pictures : null);
            }
            const picture = (packs.get(name) || {})[id];
            return picture ? 'data:image/webp;base64,' + picture : null;
        } catch (error) { return null; }
    }

    async _storedThumb(key, sig) {
        try {
            const file = this._thumbFile(key, sig);
            if (!file) return null;
            const fs = require('fs');
            const bytes = fs.promises ? await fs.promises.readFile(file) : fs.readFileSync(file);
            return 'data:image/webp;base64,' + Buffer.from(bytes).toString('base64');
        } catch (error) { return null; }
    }

    _storeThumb(key, sig, url) {
        try {
            const file = this._thumbFile(key, sig);
            if (!file || !url.startsWith('data:image/webp;base64,')) return;
            require('fs').writeFile(file, Buffer.from(url.slice(23), 'base64'), () => {});
        } catch (error) { /* a picture not kept is drawn again next time */ }
    }

    /** Stop background jobs even when the main view has not finished opening. */
    _stopThumbs() {
        clearTimeout(this._thumbTimer); this._thumbTimer = 0;
        this._thumbDocument?.removeEventListener('visibilitychange', this._thumbVisibility);
        this._thumbDocument = null; this._thumbVisibility = null;
        this._previewWorker?.dispose(); this._previewWorker = null;
        this._previewMarks = null;
        this._liveWorker?.dispose(); this._liveWorker = null; this._liveMarks = null; this._liveJob = null;
        this._thumbEpoch = (this._thumbEpoch || 0) + 1;
        this._thumbJob = null; this._thumbQueue = [];
        this._thumbReads = null;
        this._previewActivityOff?.(); this._previewActivityOff = null;
        this._startOwed = false;
    }

    _bindPreviewActivity() {
        this._previewActivityOff?.();
        this._previewActivityOff = window.RRDetachedWindow?.onPreviewActivity?.(() => this._syncPreviewActivity());
        this._syncPreviewActivity();
    }

    _syncPreviewActivity() {
        const paused = !!this.root?.ownerDocument?.hidden || window.RRDetachedWindow?.previewActive?.(this.root) === false;
        const changed = paused !== this._previewPaused;
        this._previewPaused = paused;
        this._talk?.pause?.(paused);
        const view = this._view;
        if (!paused && !view && this._startOwed) {
            this._startOwed = false;
            this._start();
        }
        if (view && changed) {
            if (paused) {
                cancelAnimationFrame(view.frame); cancelAnimationFrame(view.loop);
                view.frame = view.loop = 0;
            } else {
                if (this._rebuildOwed) this._queueRebuild();
                if (this._shadingOwed) this._queueShading();
                this._pumpPainter();
                if (view.resumeAnimation) view.resumeAnimation();
                else this._draw();
            }
        }
        this._refreshThumbs();
        if (!paused) this._resumeImportThumbnails?.();
    }

    /** Only tiles intersecting the panel's visible area compete for background work. */
    _visibleThumbs() {
        if (!this.root || this._previewPaused || this.root.isConnected === false || this.root.ownerDocument?.hidden) return [];
        const panel = this.root.querySelector('.rr-c3d-panel');
        if (!panel) return [];
        const clip = panel.getBoundingClientRect();
        const host = this.root.ownerDocument?.defaultView || window;
        const width = host.innerWidth || Infinity, height = host.innerHeight || Infinity;
        return [...panel.querySelectorAll('.rr-c3d-thumb[data-thumb]')].filter(el => {
            const r = el.getBoundingClientRect();
            return r.width > 0 && r.height > 0 && r.bottom > Math.max(0, clip.top) && r.top < Math.min(height, clip.bottom)
                && r.right > Math.max(0, clip.left) && r.left < Math.min(width, clip.right);
        });
    }

    _refreshThumbs() {
        const doc = this.root?.ownerDocument;
        if (doc && doc !== this._thumbDocument) {
            this._thumbDocument?.removeEventListener('visibilitychange', this._thumbVisibility);
            this._thumbDocument = doc;
            this._thumbVisibility = () => this._syncPreviewActivity();
            doc.addEventListener('visibilitychange', this._thumbVisibility);
        }
        if (doc?.hidden && this._previewWorker) {
            this._previewWorker.dispose(); this._previewWorker = null; this._previewMarks = null;
        }
        const visible = this._visibleThumbs();
        const keys = new Set(visible.map(el => el.dataset.thumb));
        if (this._thumbJob && (!keys.has(this._thumbJob.key) || this._thumbJob.sig !== this._thumbSig(this._thumbJob.kind))) {
            // Keep the one warmed worker. Repeatedly terminating and spawning
            // NW Node workers while switching models retains large native
            // allocations until the renderer runs out of memory. Cancel stale
            // results/queued jobs; the active computation finishes off-page
            // before the latest visible request. Teardown/hidden/timeout still
            // terminate the worker and release its bounded caches.
            this._previewWorker?.cancelAll();
            this._thumbEpoch = (this._thumbEpoch || 0) + 1;
            this._thumbJob = null;
        }
        for (const el of visible) {
            const key = el.dataset.thumb, at = key.indexOf(':');
            this._wantThumb(key.slice(0, at), key.slice(at + 1));
        }
        this._pumpThumbs();
    }

    _thumbCurrent(item) {
        return !!this._view && !this._previewPaused && this.root === item.root && this._thumbEpoch === item.epoch && item.sig === this._thumbSig(item.kind);
    }

    _showThumb(item, url) {
        this._thumbs.set(item.key, { url, sig: item.sig, project: this._project()?.path || '' });
        while (this._thumbs.size > 1024) this._thumbs.delete(this._thumbs.keys().next().value);
        this.root.querySelectorAll(`.rr-c3d-thumb[data-thumb="${CSS.escape(item.key)}"]`).forEach(el => { el.innerHTML = `<img src="${url}" alt="">`; });
    }

    async _readThumbs(items) {
        const root = this.root, epoch = this._thumbEpoch, token = {};
        this._thumbReads = token;
        try {
            await Promise.all(items.map(async item => {
                const sig = item.sig;
                let url;
                try { url = await this._storedThumb(item.key, sig); } catch (_) {}
                if (this.root !== root || epoch !== this._thumbEpoch || sig !== item.sig || sig !== this._thumbSig(item.kind)) return;
                item.stored = true;
                if (url) {
                    this._showThumb(item, url);
                    this._thumbQueue = this._thumbQueue.filter(queued => queued !== item);
                }
            }));
        } finally {
            if (this._thumbReads === token) {
                this._thumbReads = null;
            }
        }
    }

    /** One build off the page, followed by one small render; no polling of hidden tiles. */
    _pumpThumbs(wait = 16) {
        // A pump that is only waiting out a change (`wait` over 16) gives way to one asked for sooner.
        if ((this._thumbTimer && !(this._thumbWaiting && wait <= 16)) || this._thumbReads || !this._thumbQueue.length) return;
        clearTimeout(this._thumbTimer);
        this._thumbWaiting = wait > 16;
        this._thumbTimer = setTimeout(async () => {
            this._thumbTimer = 0;
            if (!this.root) return;
            const root = this.root, epoch = this._thumbEpoch;
            let keys = new Set(this._visibleThumbs().map(el => el.dataset.thumb));
            const present = new Set([...this.root.querySelectorAll('.rr-c3d-thumb[data-thumb]')].map(el => el.dataset.thumb));
            this._thumbQueue = this._thumbQueue.filter(q => present.has(q.key) && q.sig === this._thumbSig(q.kind) && this._thumbs.get(q.key)?.sig !== q.sig);
            const unread = this._thumbQueue.filter(item => keys.has(item.key) && !item.stored);
            if (unread.length) await this._readThumbs(unread);
            if (this.root !== root || this._thumbEpoch !== epoch) { this._pumpThumbs(); return; }
            if (this._thumbJob) return;
            keys = new Set(this._visibleThumbs().map(el => el.dataset.thumb));
            this._thumbQueue = this._thumbQueue.filter(item => item.sig === this._thumbSig(item.kind));
            if (this._thumbQueue.some(item => keys.has(item.key) && !item.stored)) { this._pumpThumbs(); return; }
            const index = this._thumbQueue.findIndex(q => keys.has(q.key));
            if (index < 0) return;
            if (!this._view || !this.pack || !this._result) { this._pumpThumbs(); return; }
            // A change under 350 ms ago (a slider being dragged): one timer for what is left of it, not one every 16 ms.
            const rest = 350 - (Date.now() - this._lastChange);
            if (rest > 0) { this._pumpThumbs(Math.max(17, rest)); return; }
            const item = this._thumbQueue.splice(index, 1)[0];
            item.root = this.root; item.epoch = this._thumbEpoch;
            this._thumbJob = item;
            try {
                const url = await this._makeThumb(item);
                if (!this._thumbCurrent(item)) return;
                if (url) {
                    this._storeThumb(item.key, item.sig, url);
                    this._showThumb(item, url);
                }
            } catch (error) {
                if (error.name !== 'AbortError' && this._thumbCurrent(item)) {
                    console.warn('[Character3DBuilder] preview', item.key, error);
                    if (item.tries) this._thumbs.set(item.key, { url: '', sig: item.sig });
                    else this._thumbQueue.push(Object.assign(item, { tries: 1 }));
                }
            } finally {
                if (this._thumbJob === item) { this._thumbJob = null; this._pumpThumbs(); }
            }
        }, 16);
    }

    _previewPool() {
        if (this._previewWorker) return this._previewWorker;
        let PreviewWorker;
        if (typeof process !== 'undefined' && process.versions?.node && typeof require === 'function') {
            try { PreviewWorker = require(require('path').join(RRHumanBody.dataFolder(), '..', 'CharacterPreviewWorker.cjs')).PreviewWorker; }
            catch (error) { console.warn('[Character3DBuilder] preview worker', error); }
        }
        PreviewWorker = PreviewWorker || window.RRCharacterPreviewWorker?.PreviewWorker;
        if (!PreviewWorker) throw new Error('Character preview workers are unavailable');
        this._previewWorker = new PreviewWorker();
        this._previewMarks = null;
        return this._previewWorker;
    }

    /** Pictures and imported garments are cloned once per resource revision, never per vertex. */
    async _configurePreview(pool, recipe, kept = '_previewMarks') {
        const T = window.RRCharacterOutfitTransfer;
        const keys = [...new Set((recipe.outfit || []).map(i => RRCharacterWardrobe.BY_ID.get(i.id)?.transfer).filter(Boolean))];
        if (T && keys.length) await T.preload(keys);
        await this._loadOutfitEmblems?.();
        const transfers = [], marks = [this._project()?.path, this.eyeSource];
        const seen = new Set();
        if (T) for (const g of RRCharacterWardrobe.GARMENTS) {
            const key = g.transfer;
            if (!key || seen.has(key)) continue;
            seen.add(key);
            const outfit = T.store.outfits.get(key), picture = T.store.pictures.get(key), folder = T.store.folders.get(key);
            transfers.push({ key, id: T.BUILT_IN.includes(key) ? undefined : g.id, label: g.label, outfit, picture, folder });
            marks.push(key, g.id, outfit, picture, folder);
        }
        const emblemPictures = this.cache.wardrobe?.emblemPictures || new Map();
        for (const [key, picture] of emblemPictures) marks.push(key, picture);
        if (!this[kept] || marks.length !== this[kept].length || marks.some((v, i) => v !== this[kept][i])) {
            pool.configure({ projectPath: this._project()?.path, eyeSource: this.eyeSource, emblemPictures, transfers });
            this[kept] = marks;
        }
    }

    /** The parts a picture shows, and how it is framed. */
    _thumbRecipe(item) {
        const r = this.recipe;
        // Body art tab: looks and cyber styles on the character as it is.
        const art = this._artThumbRecipe && this._artThumbRecipe(item);
        if (art) return art;
        if (item.kind === 'kind') return { recipe: Object.assign({ plan: 'quadruped' }, RRCreatureBody.kindRecipe(item.id)), frame: 'side' };
        if (item.kind === 'gear' || item.kind === 'gearset') {
            const gear = item.kind === 'gear' ? [{ id: item.id }] : RRCreatureGear.presetGear(item.id);
            return { recipe: Object.assign({}, r, { gear }), frame: 'side' };
        }
        if (item.kind === 'species') return { recipe: RRCharacterModel.withSpecies({ gender: this._thumbGender() }, item.id), frame: 'body' };
        const wearer = this._thumbWearer(item.kind);
        if (item.kind === 'dress') {
            const preset = RRCharacterWardrobe.PRESETS.find(p => p.id === item.id);
            return { recipe: Object.assign({}, wearer, { outfit: RRCharacterWardrobe.dressFor(preset.items, RRHumanBody.sexOf(r) === 'female') }), frame: 'body' };
        }
        // The rest show one thing on this species' stand-in, without its outfit or other accessories.
        const base = Object.assign({}, wearer, { outfit: [], props: [] });
        if (item.kind === 'hair') base.hair = RRCharacterHair.withStyle(wearer.hair, item.id);
        if (item.kind === 'facial') base.hair = Object.assign({}, wearer.hair, { facial: Object.assign({}, wearer.hair.facial, { style: item.id }) });
        if (item.kind === 'brows') base.hair = Object.assign({}, wearer.hair, { brows: Object.assign({}, wearer.hair.brows, { style: item.id }) });
        if (item.kind === 'garment') base.outfit = [{ id: item.id }];
        if (item.kind === 'prop') base.props = [{ id: item.id }];
        if (item.kind === 'cyberlook') base.props = ((window.RRCharacterCyberGear && RRCharacterCyberGear.LOOKS.find(l => l.id === item.id)) || { props: [] }).props;
        let frame = item.kind === 'cyberlook' ? 'head' : 'body';
        if (item.kind === 'hair' || item.kind === 'facial') frame = 'head';
        if (item.kind === 'brows') frame = 'face';
        if (item.kind === 'prop') { const def = RRCharacterProps.BY_ID.get(item.id), g = def.group; frame = this.slime ? 'body' : def.frame || (g === 'Back' ? 'back' : g === 'Jewelry' && item.id === 'bracelets' ? 'body' : 'head'); }
        if (item.kind === 'garment') { const slot = RRCharacterWardrobe.BY_ID.get(item.id).slot; frame = slot === 'head' ? 'head' : slot === 'feet' ? 'feet' : 'body'; }
        return { recipe: base, frame };
    }

    async _thumbParts(item) {
        const { recipe, frame } = this._thumbRecipe(item), pool = this._previewPool();
        const root = this.root, view = this._view;
        await this._configurePreview(pool, recipe);
        if (this.root !== root || this._view !== view || pool !== this._previewWorker) {
            const error = new Error('Character preview canceled'); error.name = 'AbortError'; throw error;
        }
        const result = await pool.build({ key: item.key + '|' + item.sig, recipe, cacheKey: item.kind,
            // (`thumb`: a picture's build, without what cannot be seen at this size: sewn details, the knuckle pass, the rigs.)
            options: { quality: 'preview', skinSize: ['head', 'face', 'hands'].includes(frame) ? 256 : 128,
                atlasSize: 256, hairBudget: 0.5, static: true, thumb: true } });
        return { result, frame };
    }

    async _makeThumb(item) {
        const root = this.root, view = this._view;
        const prepared = await this._thumbParts(item);
        // Yield the returned buffers to a frame; tab/recipe changes can discard them before a GPU upload.
        await new Promise(resolve => requestAnimationFrame(resolve));
        if (this.root !== root || this._view !== view || item.sig !== this._thumbSig(item.kind) || (item.root && !this._thumbCurrent(item))) {
            const error = new Error('Character preview canceled'); error.name = 'AbortError'; throw error;
        }
        return this._renderThumb(prepared, () => this.root === root && this._view === view && item.sig === this._thumbSig(item.kind) && (!item.root || this._thumbCurrent(item)));
    }

    _ensureThumbView() {
        if (!this._thumbView) {
            const size = 96, canvas = document.createElement('canvas');
            canvas.width = canvas.height = size;
            const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
            renderer.setPixelRatio(1);
            renderer.setSize(size, size, false);
            renderer.outputColorSpace = THREE.SRGBColorSpace;
            renderer.toneMapping = THREE.ACESFilmicToneMapping;
            renderer.toneMappingExposure = 1.05;
            renderer.setClearColor(0x000000, 0);
            const scene = new THREE.Scene();
            scene.add(new THREE.HemisphereLight(0xfff4e8, 0x756c65, 1.7));
            const key = new THREE.DirectionalLight(0xfff0e0, 2.4); key.position.set(1.6, 3.2, 2.4); scene.add(key);
            const rim = new THREE.DirectionalLight(0xc8d8ff, 1.4); rim.position.set(-1.2, 2.4, -2.8); scene.add(rim);
            this._thumbView = { renderer, scene, camera: new THREE.PerspectiveCamera(28, 1, 0.02, 60), canvas,
                reflections: this._thumbnailReflections(), materials: [] };
        }
        return this._thumbView;
    }

    /** NW's Node workers use a different JS realm; WebGL needs views from the page's realm. */
    _previewArray(value) {
        const types = { Float32Array, Float64Array, Uint32Array, Uint16Array, Uint8Array, Uint8ClampedArray, Int32Array, Int16Array, Int8Array };
        const Type = types[value.constructor.name] || Uint8Array;
        return value instanceof Type ? value : new Type(value.buffer, value.byteOffset, value.length);
    }

    _thumbnailReflections() {
        const size = 16;
        const faces = Array.from({ length: 6 }, (_, face) => {
            const data = new Uint8Array(size * size * 4);
            for (let row = 0; row < size; row++) for (let column = 0; column < size; column++) {
                const horizontal = 2 * (column + 0.5) / size - 1, vertical = 2 * (row + 0.5) / size - 1;
                const direction = [[1, -vertical, -horizontal], [-1, -vertical, horizontal], [horizontal, 1, vertical],
                    [horizontal, -1, -vertical], [horizontal, -vertical, 1], [-horizontal, -vertical, -1]][face];
                const length = Math.hypot(...direction);
                const upper = Math.max(0, direction[1] / length);
                const softbox = Math.max(0, (direction[0] * 0.4 + direction[1] * 0.65 + direction[2] * 0.65) / length) ** 12;
                const offset = (row * size + column) * 4;
                data[offset] = Math.min(255, 65 + upper * 80 + softbox * 110);
                data[offset + 1] = Math.min(255, 68 + upper * 84 + softbox * 103);
                data[offset + 2] = Math.min(255, 76 + upper * 92 + softbox * 90);
                data[offset + 3] = 255;
            }
            return new THREE.DataTexture(data, size, size);
        });
        const texture = new THREE.CubeTexture(faces);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.needsUpdate = true;
        return texture;
    }

    _thumbnailMaterial(part, result, textureFor, reflections) {
        const picture = part.texture && result.textures[part.texture];
        const kind = part.kind || (part.metalness > 0.5 ? 'metal' : 'prop');
        const metal = kind === 'metal' || part.metalness > 0.5;
        const glossy = metal || ['eye', 'glass', 'goo', 'bubble'].includes(kind) || part.wet
            || !!part.skinFinish && part.skinFinish.roughness < .5
            || !!part.metallicRoughnessTexture && (part.metalness > .15 || (part.roughness ?? .6) < .55);
        const opaque = kind !== 'goo' && !(part.opacity != null && part.opacity < 1);
        const material = new THREE.MeshPhongMaterial({
            color: picture || part.colors ? 0xffffff : new THREE.Color(part.color || '#bbbbbb'),
            map: picture ? textureFor(part.texture, picture) : null,
            vertexColors: !!part.colors,
            specular: glossy ? 0x666666 : kind === 'hair' ? 0x111111 : 0x181818,
            shininess: part.skinFinish ? Math.max(4, 110 * (1 - part.skinFinish.roughness) ** 2) : glossy ? 55 : 12,
            envMap: glossy ? reflections : null, combine: THREE.AddOperation, reflectivity: metal ? 0.65 : kind === 'goo' ? 0.4 : 0.12,
            side: part.doubleSided ? THREE.DoubleSide : THREE.FrontSide,
            transparent: !opaque, opacity: part.opacity ?? 1,
            alphaTest: part.cutout ? (part.alphaCutoff ?? 0.5) : 0, depthWrite: opaque
        });
        const relief = part.normalTexture && result.textures[part.normalTexture];
        if(relief){
            const normal=textureFor(part.normalTexture,relief);
            if(normal.colorSpace!==THREE.NoColorSpace){normal.colorSpace=THREE.NoColorSpace;normal.needsUpdate=true;}
            material.normalMap=normal;const scale=part.normalScale??1;
            material.normalScale=new THREE.Vector2(scale,-scale);
            // A cloth's tile rides the second coordinates; without them it would stretch over the whole outfit.
            if(part.normalTexCoord===1){if(part.uvs1)normal.channel=1;else material.normalMap=null;}
        }
        if (metal) material.color.multiplyScalar(0.3);
        if (part.cutout && kind === 'hair') {
            material.alphaToCoverage = !part.onSkin;
            material.alphaTest = Math.min(material.alphaTest, 0.3);
        }
        if (part.emissive || (part.emissiveTexture && result.textures[part.emissiveTexture])) {
            material.emissive.set(part.emissive || 0xffffff);
            material.emissiveIntensity = Number.isFinite(part.emissiveIntensity) ? Math.max(0,part.emissiveIntensity) : 1;
            if (part.emissiveTexture && result.textures[part.emissiveTexture]) material.emissiveMap = textureFor(part.emissiveTexture, result.textures[part.emissiveTexture]);
        }
        return material;
    }

    async _renderThumb({ result, frame }, current = () => true) {
        const tv = this._ensureThumbView();
        const previous = tv.pending;
        let release;
        tv.pending = new Promise(resolve => { release = resolve; });
        tv.jobs = (tv.jobs || 0) + 1;
        try {
            await previous;
            if (!current() || tv.disposed || this._previewPaused || (this._thumbView && this._thumbView !== tv)) {
                const error = new Error('Character preview canceled'); error.name = 'AbortError'; throw error;
            }
            return await this._drawThumb({ result, frame }, tv, current);
        } finally {
            if (!--tv.jobs) tv.pending = null;
            release();
        }
    }

    async _drawThumb({ result, frame }, tv, current) {
        const group = new THREE.Group(), made = [], textures = new Map();
        const textureFor = (name, tex) => {
            if (!textures.has(name)) {
                const t = new THREE.DataTexture(this._previewArray(tex.data), tex.width, tex.height, THREE.RGBAFormat);
                t.colorSpace = THREE.SRGBColorSpace; t.flipY = false; if(tex.repeat)t.wrapS=t.wrapT=THREE.RepeatWrapping; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.needsUpdate = true;
                textures.set(name, t);
            }
            return textures.get(name);
        };
        const box = new THREE.Box3();
        for (const part of result.parts) {
            const g = new THREE.BufferGeometry();
            g.setAttribute('position', new THREE.BufferAttribute(this._previewArray(part.positions), 3));
            g.setAttribute('normal', new THREE.BufferAttribute(this._previewArray(part.normals), 3));
            if (part.uvs) g.setAttribute('uv', new THREE.BufferAttribute(this._previewArray(part.uvs), 2));
            if (part.uvs1) g.setAttribute('uv1', new THREE.BufferAttribute(this._previewArray(part.uvs1), 2));
            if (part.colors) g.setAttribute('color', new THREE.BufferAttribute(this._previewArray(part.colors), 3));
            g.setIndex(new THREE.BufferAttribute(this._previewArray(part.index), 1));
            const mesh = new THREE.Mesh(g, this._thumbnailMaterial(part, result, textureFor, tv.reflections));
            group.add(mesh);
            made.push(mesh);
            g.computeBoundingBox();
            box.union(g.boundingBox);
        }
        tv.scene.add(group);
        // Framing: the head, the face, the feet, the back, the whole body, or a creature from its side.
        const h = result.bodyHeight || result.height, cam = tv.camera;
        let target, distance, yaw = 0.45, pitch = 0.05;
        const size = box.getSize(new THREE.Vector3());
        if (frame === 'head') { target = new THREE.Vector3(0, h * 0.92, 0); distance = h * 0.36; }
        else if (frame === 'face') { target = new THREE.Vector3(0, h * 0.935, 0.02); distance = h * 0.2; yaw = 0.25; }
        else if (frame === 'feet') { target = new THREE.Vector3(0, h * 0.12, 0); distance = h * 0.5; pitch = 0.25; }
        // Body art tab: the upper body, where most of the art is.
        else if (frame === 'torso') { target = new THREE.Vector3(0, h * 0.7, 0); distance = h * 0.75; yaw = 0.35; }
        else if (frame === 'hands') { target = new THREE.Vector3(h * 0.29, h * 0.55, h * 0.16); distance = h * 0.3; pitch = 0.4; }
        else if (frame === 'back') { target = new THREE.Vector3(0, h * 0.6, 0); distance = h * 1.7; yaw = Math.PI - 0.6; }
        // Cyberware: the side of the head, the nape and upper back, the chest.
        else if (frame === 'headSide') { target = new THREE.Vector3(0, h * 0.92, 0); distance = h * 0.36; yaw = 1.15; }
        else if (frame === 'nape') { target = new THREE.Vector3(0, h * 0.8, 0); distance = h * 0.55; yaw = Math.PI - 0.45; pitch = 0.15; }
        else if (frame === 'chest') { target = new THREE.Vector3(0, h * 0.74, 0.05); distance = h * 0.45; yaw = 0.3; }
        else if (frame === 'side') { target = box.getCenter(new THREE.Vector3()); distance = Math.max(size.x, size.y, size.z) * 1.9; yaw = 1.0; pitch = 0.15; }
        else { target = new THREE.Vector3(0, h * 0.52, 0); distance = Math.max(h, size.x) * 2.15; }
        const focus = result.focus && result.focus[frame];
        if (focus || ['body', 'back', 'side'].includes(frame)) {
            const bounds = focus || { min: box.min.toArray(), max: box.max.toArray() };
            const fitted = Character3DBuilder.fitThumbnailFrame(bounds, yaw, pitch, cam.fov, cam.aspect);
            target = new THREE.Vector3(...fitted.target); distance = fitted.distance;
        }
        cam.position.set(target.x + Math.sin(yaw) * Math.cos(pitch) * distance, target.y + Math.sin(pitch) * distance, target.z + Math.cos(yaw) * Math.cos(pitch) * distance);
        cam.lookAt(target);
        let rendered = false;
        try {
            if (tv.renderer.compileAsync) await tv.renderer.compileAsync(tv.scene, cam);
            if (!current() || tv.disposed || this._previewPaused || (this._thumbView && this._thumbView !== tv)) {
                const error = new Error('Character preview canceled'); error.name = 'AbortError'; throw error;
            }
            tv.renderer.render(tv.scene, cam);
            rendered = true;
            return tv.canvas.toDataURL('image/webp', 0.85);
        } finally {
            tv.scene.remove(group);
            for (const mesh of made) mesh.geometry.dispose();
            for (const texture of textures.values()) texture.dispose();
            // One material of each kind of shader stays for the session, its pictures swapped for a blank: a
            // material let go takes its compiled program with it once no other uses it, and the next picture of that
            // kind compiled it again (445 ms of every picture's 870 on the test display, 2026-11-10). The kinds are
            // few: with or without a picture, relief, a reflection, vertex colours, a cut-out, two sides, a glow.
            const kept = tv.kept || (tv.kept = new Map());
            const blank = tv.blank || (tv.blank = (() => { const t = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1, THREE.RGBAFormat); t.needsUpdate = true; return t; })());
            for (const mesh of made) {
                const m = mesh.material;
                const kind = rendered ? [!!m.map, !!m.normalMap, m.normalMap ? m.normalMap.channel : 0, !!m.envMap, !!m.vertexColors, m.alphaTest > 0, m.side, !!m.transparent, !!m.emissiveMap, !!m.alphaToCoverage, !!mesh.geometry.getAttribute('uv1'), mesh.geometry.getAttribute('uv') ? 1 : 0].join() : '';
                if (kind && !kept.has(kind) && kept.size < 96) {
                    if (m.map) m.map = blank; if (m.normalMap) m.normalMap = blank; if (m.emissiveMap) m.emissiveMap = blank;
                    kept.set(kind, m);
                } else m.dispose();
            }
            for (const material of tv.materials) material.dispose();
            tv.materials = [];
        }
    }

    // ── randomize ──────────────────────────────────────────────────────────
    /** The parts Randomize can roll for this character (a person's, or a creature's or slime's). */
    _randomPartList() {
        return this.human && !this.slime
            ? [['gender', 'Gender'], ['body', 'Body'], ['face', 'Face'], ['hair', 'Hair'], ['outfit', 'Outfit'], ['colors', 'Colors'], ...(window.RRCharacterBodyArt ? [['bodyart', 'Body art']] : [])]
            : [['shape', 'Shape'], ['colors', 'Colors']];
    }

    _randomKey() { return 'character-' + (this.slime ? 'slime' : this.human ? 'person' : 'creature'); }

    /** Roll the parts ticked beside Randomize: every one ticked rolls everything at once, else each ticked part in turn. */
    _randomize() {
        const parts = this._randomPartList(), chosen = this.randomParts || new Set(parts.map(p => p[0]));
        const scopes = RRRandomPartsMenu.scopesFor(parts, chosen);
        if (!scopes.length) return;
        let r = JSON.parse(JSON.stringify(this.recipe));
        // Gender unticked: every roll keeps the gender the character has (only women, or only men, run after run).
        this._heldGender = this.human && !this.slime && !chosen.has('gender') ? r.gender : undefined;
        const before = r;
        for (const scope of scopes) r = this._rollPart(r, scope);
        this._heldGender = undefined;
        this._replace(this._rollRanges(before, r, scopes));
    }

    /** Every slider the Body and Face tabs show for `r`, by path, with its natural and extreme ranges. */
    _sliderRanges(r) {
        const was = this.recipe, log = new Map();
        this.recipe = r; this._rangeLog = log;
        try { this._bodyTab(); if (this.human && !this.slime) this._faceTab(); } finally { this.recipe = was; this._rangeLog = null; }
        return log;
    }

    /**
     * A roll as the tab's switches say. Extreme proportions on: each rolled value is carried out from the middle
     * of its natural range toward the ends of its extreme one, by a share of its own, so the whole extreme range
     * turns up. Anatomical detail on: its sliders roll with the body (else they keep what they had).
     */
    _rollRanges(before, r, scopes) {
        if (this.slime) return r;
        const rollsBody = scopes.some(s => s === 'all' || s === 'body' || s === 'shape'), detail = !!(r.anatomy && r.anatomy.detail);
        if (!this.extreme && !(detail && rollsBody)) return r;
        const get = (o, path) => path.split('.').reduce((v, k) => v == null ? v : v[k], o);
        const set = (o, path, value) => { const keys = path.split('.'), last = keys.pop(); const at = keys.reduce((v, k) => v[k] == null ? (v[k] = {}) : v[k], o); at[last] = value; };
        r = JSON.parse(JSON.stringify(r));
        for (const [path, s] of this._sliderRanges(r)) {
            let v = get(r, path);
            if (typeof v !== 'number' || !s.natural) continue;
            const [lo, hi] = s.natural, anatomy = path.startsWith('anatomy.');
            if (anatomy) { if (!detail || !rollsBody) continue; v = lo + Math.random() * (hi - lo); }
            else if (v === get(before, path)) continue;
            if (this.extreme && s.extreme) {
                const mid = (lo + hi) / 2, share = Math.sqrt(Math.random());
                const reach = v >= mid ? (hi > mid ? (s.extreme[1] - mid) / (hi - mid) : 1) : (lo < mid ? (mid - s.extreme[0]) / (mid - lo) : 1);
                v = Math.min(s.extreme[1], Math.max(s.extreme[0], mid + (v - mid) * (1 + share * (reach - 1))));
            }
            if (s.step >= 1 || s.format === 'count') v = Math.round(v);
            set(r, path, Math.round(v * 1000) / 1000);
        }
        return r;
    }

    /** `r` with one part rolled anew ('all' for everything). */
    _rollPart(r, scope) {
        const seed = (Math.random() * 4294967296) >>> 0;
        r = JSON.parse(JSON.stringify(r));
        if (this.slime) {
            const n = RRSlimeBody.randomRecipe(seed, r, scope === 'shape' ? 'all' : scope);
            // Its shape alone: the colors it had come back (RRSlimeBody's colors are these five).
            if (scope === 'shape') Object.assign(n, { color: r.color, core: r.core, translucency: r.translucency, glow: r.glow, eyes: Object.assign({}, n.eyes, { color: r.eyes && r.eyes.color }) });
            return n;
        }
        if (!this.human) {
            const n = RRCreatureBody.randomRecipe(seed, r.kind);
            if (scope === 'colors') { r.colors = n.colors; r.pattern = n.pattern; return r; }
            if (scope === 'shape') return Object.assign(r, n, { plan: 'quadruped', colors: r.colors, pattern: r.pattern });
            return Object.assign(r, n, { plan: 'quadruped' });
        }
        const roll = RRCharacterModel.random(seed, { species: r.species, gender: this._heldGender });
        const faceSections = new Set(['Head and neck', 'Head shape', 'Forehead and brows', 'Eyes', 'Nose', 'Mouth and jaw', 'Ears']);
        switch (scope) {
            // Gender alone: a woman or a man, the rest as it is.
            case 'gender': r.gender = seed % 2 ? 1 : 0; break;
            case 'body':
                for (const k of ['gender', 'age', 'height', 'weight', 'muscle', 'cup', 'firmness']) r[k] = roll[k];
                for (const s of RRHumanBody.SLIDERS) if (!faceSections.has(s.section)) r.shapes[s.key] = roll.shapes[s.key];
                // Centaur hook: the horse's build rolls with the body.
                if (r.centaur && roll.centaur) for (const k of ['size', 'bodyLength', 'girth', 'legLength', 'legThickness', 'tailLength']) r.centaur[k] = roll.centaur[k];
                break;
            case 'face':
                for (const s of RRHumanBody.SLIDERS) if (faceSections.has(s.section)) r.shapes[s.key] = roll.shapes[s.key];
                r.ancestry = roll.ancestry;
                break;
            case 'hair': r.hair = RRCharacterHair.randomHair(seed, { gender: r.gender > 0.5 ? 'male' : 'female' }); break;
            case 'bodyart': if (window.RRCharacterBodyArt) r.bodyArt = RRCharacterBodyArt.random(seed); break;
            case 'outfit': r.outfit = roll.outfit; r.props = roll.props; break;
            case 'colors':
                // A tone from the chosen people's own range.
                if (r.species === 'human') { const tones = (RRHumanBody.PEOPLE_BY_ID.get(r.ancestry.people) || RRHumanBody.PEOPLE_BY_ID.get('mixed')).tones; r.skin = tones[seed % tones.length]; }
                else { const tones = RRCharacterSpecies.skinTones(r.species); if (tones.length) r.skin = tones[seed % tones.length]; }
                r.eyes = Object.assign({}, r.eyes, { color: roll.eyes.color });
                // Centaur hook: the horse's coat rolls with the colors.
                if (r.centaur && roll.centaur) for (const k of ['coat', 'marking', 'pattern']) r.centaur[k] = roll.centaur[k];
                r.hair = Object.assign({}, r.hair, { color: roll.hair.color, tipColor: roll.hair.tipColor });
                // A rolled garment that shows its own picture has no colour to give: the worn one keeps its own.
                r.outfit = r.outfit.map((item, k) => { const color = roll.outfit[k % Math.max(1, roll.outfit.length)]?.color; return color ? Object.assign({}, item, { color }) : item; });
                break;
            default: Object.assign(r, roll, { anatomy: r.anatomy });
        }
        return r;
    }

    _status(text, kind) {
        const el = this.root && this.root.querySelector('.rr-c3d-status');
        if (!el) return;
        el.textContent = text || '';
        el.dataset.kind = kind || '';
    }

    // ── 3D view ────────────────────────────────────────────────────────────
    async _start() {
        const root = this.root, epoch = this._thumbEpoch;
        this._status(this._t('Loading…'));
        const ready = (window.THREE) || (this.projectController?.mapEditor3D?.ensureLibraries && await this.projectController.mapEditor3D.ensureLibraries());
        if (this.root !== root || this._thumbEpoch !== epoch) return;
        if (!ready || !window.THREE) { this._status(this._t('The 3D libraries could not be loaded.'), 'error'); return; }
        try {
            if (!this.pack || !this.eyeSource) [this.pack, this.eyeSource] = await Promise.all([this.pack || RRHumanBody.loadPack(), this.eyeSource || this._loadEyeSource()]);
            await RRHumanBody.prepareAuthoring(this.pack);
            // [outfit transfer] The pictures of the outfits taken from models, decoded before the first build;
            // one that comes in later (a project's own) builds the view again.
            if (window.RRCharacterOutfitTransfer) {
                if (this._project()) RRCharacterOutfitTransfer.registerProject(RRCharacterWardrobe, this._project().path);
                if (!this._takenPictures) this._takenPictures = RRCharacterOutfitTransfer.onPicture(key => {
                    if ((this.recipe.outfit || []).some(item => RRCharacterWardrobe.BY_ID.get(item.id)?.transfer === key)) this._queueRebuild();
                });
                const selected = [...new Set((this.recipe.outfit || []).map(item => RRCharacterWardrobe.BY_ID.get(item.id)?.transfer).filter(Boolean))];
                await RRCharacterOutfitTransfer.preload(selected);
            }
        } catch (error) {
            console.error('[Character3DBuilder] body pack', error);
            this._status(this._t('The body data could not be loaded.'), 'error');
            return;
        }
        if (!this.root || this.root !== root || this._thumbEpoch !== epoch || !this.root.querySelector('.rr-c3d-canvas')) return;
        if (this._previewPaused) { this._startOwed = true; return; }
        this._makeView();
        this._status('');
        this._rebuild();
        if(this.tab==='outfit')this._renderPanel();
        this._refreshThumbs();
    }

    /** MakeHuman's eye picture as RGBA, at 512 (the eyes are small on screen and in a file). */
    _loadEyeSource() {
        return new Promise(resolve => {
            const img = new Image();
            img.onload = () => {
                const size = 512, c = document.createElement('canvas');
                c.width = c.height = size;
                const g = c.getContext('2d');
                g.drawImage(img, 0, 0, size, size);
                resolve({ width: size, height: size, data: new Uint8Array(g.getImageData(0, 0, size, size).data.buffer) });
            };
            img.onerror = () => resolve(null);
            img.src = RRHumanBody.DATA_PATH + '/eye-brown.png';
        });
    }

    _makeView() {
        const queued = this._thumbQueue;
        this.detach();
        this._thumbQueue = queued;
        const canvas = this.root.querySelector('.rr-c3d-canvas');
        const host = canvas.parentElement;
        const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
        // A weak GPU (integrated, software) draws simpler materials at one pixel per pixel, the Idle at 30 a second.
        this._weak = Character3DBuilder.weakGpu(renderer);
        renderer.setPixelRatio(this._weak ? 1 : Math.min(window.devicePixelRatio || 1, 2));
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        // A photographer's studio: filmic tone, a softbox environment, a warm key with soft shadows, a cool rim.
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.05;
        renderer.setClearColor(0x000000, 0);
        const scene = new THREE.Scene();
        scene.environment = this._studio(renderer);
        scene.environmentIntensity = 0.8;
        const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 80);
        // The ground bounces light back up: what faces down (a jaw, a full bust) stays a soft shade, not black.
        scene.add(new THREE.HemisphereLight(0xfff4e8, 0x8a8078, 0.72));
        // The key a little softer than the room, so its shadows shade rather than black out.
        const key = new THREE.DirectionalLight(0xfff0e0, this._weak ? 2.4 : 2.0);
        key.position.set(1.6, 3.2, 2.4);
        scene.add(key, key.target);
        // Soft shadows from the key (the nose on the cheek, the brow over the eyes, the jaw on the neck)
        // where the GPU can afford them; the box they cover follows the character.
        if (!this._weak) {
            renderer.shadowMap.enabled = true;
            renderer.shadowMap.type = THREE.PCFSoftShadowMap;
            key.castShadow = true;
            key.shadow.mapSize.set(2048, 2048);
            key.shadow.bias = -0.0003;
            key.shadow.normalBias = 0.035;
            // Shadows that soften rather than blacken: a hard terminator stepped along the body's facets.
            key.shadow.intensity = 0.36;
        }
        const fill = new THREE.DirectionalLight(0xdce8ff, 0.5);
        fill.position.set(-2.5, 1.4, 1.6);
        scene.add(fill);
        const rim = new THREE.DirectionalLight(0xdfe6f2, 1.3);
        rim.position.set(-1.2, 2.4, -2.8);
        scene.add(rim);
        // A stationary studio ground, independent of the character's bounds.
        // Resizing a bounded pedestal with each rebuild made body sliders
        // appear to deform the floor, especially on long, low creatures.
        const floor = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshStandardMaterial({ color: 0x34373e, roughness: 0.95 }));
        floor.rotation.x = -Math.PI / 2;
        scene.add(floor);
        // A soft contact shadow under the feet: a blurred disc, nearly free where a shadow map is not.
        const blob = new THREE.Mesh(new THREE.CircleGeometry(1, 48), new THREE.MeshBasicMaterial({ map: Character3DBuilder.blobTexture(), transparent: true, depthWrite: false, opacity: 0.75 }));
        blob.rotation.x = -Math.PI / 2;
        blob.position.y = 0.002;
        scene.add(blob);
        const group = new THREE.Group();
        scene.add(group);
        const view = this._view = { renderer, scene, camera, floor, blob, group, key, meshes: [], bones: [], textures: new Map(), yaw: 0.35, pitch: 0.08, distance: 4.2, target: new THREE.Vector3(0, 0.9, 0), frame: 0, loop: 0, clock: new THREE.Timer() };

        const size = () => {
            if (this._sheetExporting) { this._sheetResizeOwed = true; return; }
            const w = Math.max(1, host.clientWidth), h = Math.max(1, host.clientHeight);
            renderer.setSize(w, h, false);
            camera.aspect = w / h;
            camera.updateProjectionMatrix();
            if (this._result) this._faceFrame(this._result);
            this._draw();
        };
        view.resizeNow = size;
        view.resize = new ResizeObserver(size);
        view.resize.observe(host);
        size();

        let drag = null;
        canvas.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY, yaw: view.yaw, pitch: view.pitch }; canvas.setPointerCapture(e.pointerId); });
        canvas.addEventListener('pointermove', e => {
            if (!drag) return;
            view.yaw = drag.yaw - (e.clientX - drag.x) * 0.01;
            view.pitch = Math.max(-0.6, Math.min(1.2, drag.pitch + (e.clientY - drag.y) * 0.006));
            this._draw();
        });
        const end = () => { drag = null; };
        canvas.addEventListener('pointerup', end);
        canvas.addEventListener('pointercancel', end);
        canvas.addEventListener('wheel', e => {
            e.preventDefault();
            const h = view.height || 1.7;
            view.distance = Math.max(0.25 * h + 0.2, Math.min(h * 6 + 2, view.distance * (e.deltaY > 0 ? 1.1 : 0.9)));
            this._aim();
            this._draw();
        }, { passive: false });
        // Creating the studio tears down its predecessor via detach(), which
        // also removes activity listeners. Restore the resume path for this view.
        this._bindPreviewActivity();
    }

    _frame(which) {
        const view = this._view;
        if (!view) return;
        const h = view.bodyHeight || view.height || 1.7;
        // The whole body by its largest extent: a creature is longer than it is tall, and seen from its side.
        view.distance = which === 'face' ? (view.faceDistance || Math.max(0.5, h * 0.42)) : Math.max(1.2, (view.extent || view.height || h) * 2.4 + 0.2);
        if (which !== 'face' && !this.human) view.yaw = 1.0;
        this._aim();
        this._draw();
    }

    _aim() {
        const view = this._view;
        if (!view) return;
        const h = view.height || 1.7, body = view.bodyHeight || h;
        // Closer in, the view rises to the face (a creature's head is at its front, low).
        const far = Math.max(h * 1.9, (view.faceDistance || 0) * 2.5);
        const near = Math.max(0, Math.min(1, (far - view.distance) / Math.max(0.1, far - (view.faceDistance || h * 0.5))));
        if (this.human) {
            const face = view.faceCenter || [0, body * 0.93, 0];
            view.target.set(face[0] * near, h * 0.52 + (face[1] - h * 0.52) * near, face[2] * near);
        }
        else {
            const center = view.bodyCenter || [0, h * 0.5, 0];
            const face = view.faceCenter || [center[0],center[1],center[2]+((view.depth||0)-center[2])*.4];
            view.target.set(...center.map((v,k)=>v+(face[k]-v)*near));
        }
    }

    /** Use the actual head, including extreme proportions, for the Face button. */
    _faceFrame(result) {
        const view = this._view, head = result.bones.findIndex(b => b.name === 'Head');
        view.faceCenter = null; view.faceDistance = 0;
        const facialParts = result.plan === 'slime' || head < 0;
        const heads = new Set(result.bones.map((b,i)=>b.name==='Head'||/^Hydrata(?:Left|Right)Head$/.test(b.name)?i:-1).filter(i=>i>=0));
        const low = [Infinity, Infinity, Infinity], high = [-Infinity, -Infinity, -Infinity];
        for (const part of result.parts) {
            if (facialParts ? !['eye','mouth'].includes(part.kind) : !/^(Body|Alien eyes|Head(?: .*)?|Beak|Eye .*)$/.test(part.name)) continue;
            for (let v = 0; v < part.positions.length / 3; v++) {
                let weight = 0;
                for (let k = 0; k < 4; k++) if (heads.has(part.joints[v * 4 + k])) weight += part.weights[v * 4 + k];
                if (!facialParts && weight < 0.85) continue;
                for (let k = 0; k < 3; k++) { low[k] = Math.min(low[k], part.positions[v * 3 + k]); high[k] = Math.max(high[k], part.positions[v * 3 + k]); }
            }
        }
        if (!Number.isFinite(low[0])) return;
        // Tall updos and broad curls belong in the Face frame; long ends below the chin do not.
        const chin=low[1];
        for(const part of result.parts)if(part.name==='Hair')for(let v=0;v<part.positions.length;v+=3) {
            if(part.positions[v+1]<chin)continue;
            for(let k=0;k<3;k++){low[k]=Math.min(low[k],part.positions[v+k]);high[k]=Math.max(high[k],part.positions[v+k]);}
        }
        view.faceCenter = low.map((x, k) => (x + high[k]) * 0.5);
        // Fit a bounding sphere at any orbit angle, leaving room around the chin/crown.
        const radius = Math.hypot(...low.map((x, k) => (high[k] - x) * 0.5));
        const fov = (view.camera.fov || 35) * Math.PI / 180;
        const halfAngle = Math.atan(Math.tan(fov * 0.5) * Math.min(1, view.camera.aspect || 1));
        view.faceDistance = Math.max(0.5, radius * (facialParts?1.6:1.12) / Math.sin(halfAngle));
    }

    _draw() {
        const view = this._view;
        if (!view) return;
        view.needsDraw = true;
        if (this._previewPaused || this._sheetExporting?.drawing || view.frame || view.loop) return;
        view.frame = requestAnimationFrame(() => { view.frame = 0; this._render(); });
    }

    _render() {
        const view = this._view;
        if (!view) return;
        this._stepPreviewTween(performance.now());
        const c = view.camera, t = view.target;
        const aimed = view.aimed;
        if (!aimed || aimed.camera !== c || aimed.yaw !== view.yaw || aimed.pitch !== view.pitch || aimed.distance !== view.distance
            || aimed.x !== t.x || aimed.y !== t.y || aimed.z !== t.z || !c.up.equals(aimed.up)
            || !c.position.equals(aimed.position) || !c.quaternion.equals(aimed.quaternion)) {
            c.position.set(t.x + Math.sin(view.yaw) * Math.cos(view.pitch) * view.distance, t.y + Math.sin(view.pitch) * view.distance, t.z + Math.cos(view.yaw) * Math.cos(view.pitch) * view.distance);
            c.lookAt(t);
            const next = view.aimed || (view.aimed = { position: new THREE.Vector3(), quaternion: new THREE.Quaternion(), up: new THREE.Vector3() });
            next.camera = c; next.yaw = view.yaw; next.pitch = view.pitch; next.distance = view.distance;
            next.x = t.x; next.y = t.y; next.z = t.z; next.up.copy(c.up); next.position.copy(c.position); next.quaternion.copy(c.quaternion);
        }
        view.renderer.render(view.scene, c);
        view.needsDraw = false;
    }

    /**
     * The chosen pose plays (Idle or one of RRCharacterPoses, a creature has
     * Idle only); A-pose stands still, and the view draws only when asked.
     */
    _syncPose() {
        if (this._sheetExporting?.drawing) return;
        this._stopPreviewTween();
        const view = this._view;
        if (!this.root) return;
        // The poses the body plan has: a person's, or a four-legged creature's own (those its kind can take).
        const human = !view || view.plan !== 'quadruped';
        const slime = !!view && view.plan === 'slime';
        // Merfolk hook: a tail's own motions, and the humanoid poses of the upper body.
        const mer = human && !slime && !!window.RRMerfolkBody && !!view && !!view.boneDefs && RRMerfolkBody.hasTail(view.boneDefs);
        // Centaur hook: the horse's gaits and the humanoid poses of the upper body.
        const cen = human && !slime && !!window.RRCharacterCentaur && !!view && RRCharacterCentaur.hasHorse(view.boneDefs);
        const poses = slime ? RRSlimeBody.POSES : cen ? RRCharacterCentaur.POSES : mer ? RRMerfolkBody.POSES : human ? RRCharacterPoses.POSES : RRCreatureBody.posesFor(this.recipe).filter(p => !view.boneDefs || RRCreatureBody.poseClip(view.boneDefs, p.id, this.recipe));
        const list = [['apose', slime || !human ? 'Still' : 'A-pose'], ['idle', 'Idle']].concat(poses.map(p => [p.id, p.label]))
            .map(([id, label]) => [id, this._t(label)]).sort((a, b) => a[1].localeCompare(b[1]) || a[0].localeCompare(b[0]));
        if (!list.some(([id]) => id === this.pose)) this.pose = 'idle';
        const holder = this.root.querySelector('.rr-c3d-pose-picker'), sig = JSON.stringify(list);
        if (holder && holder.dataset.sig !== sig) {
            holder.dataset.sig = sig;
            const option = ([id, label]) => `<option value="${rrEscapeHtml(id)}">${rrEscapeHtml(label)}</option>`;
            // A person's poses under their groups (Move, Fight, Rest), each group in the same order; the still poses first.
            const groups = human && !slime && !mer && RRCharacterPoses.GROUPS, groupOf = new Map(poses.map(p => [p.id, p.group]));
            holder.innerHTML = groups
                ? list.filter(([id]) => !groupOf.get(id)).map(option).join('') + groups.map(g => {
                    const mine = list.filter(([id]) => groupOf.get(id) === g.id);
                    return mine.length ? `<optgroup label="${rrEscapeHtml(this._t(g.label))}">${mine.map(option).join('')}</optgroup>` : '';
                }).join('')
                : list.map(option).join('');
        }
        if (holder) holder.value = this.pose;
        if (!view) return;
        cancelAnimationFrame(view.loop);
        view.loop = 0;
        cancelAnimationFrame(view.frame);
        view.frame = 0;
        view.resumeAnimation = null;
        const time = view.action ? view.action.time : (view.resumeAt || 0);
        if (view.action) view.action.stop();
        for (const b of view.bones) { b.position.copy(b.userData.rest.p); b.quaternion.identity(); b.scale.set(1, 1, 1); }
        view.group.position.y = 0;
        view.action = this.pose === 'apose' ? null : this._poseAction(this.pose);
        view.poseMeta = view.action ? view.actions.get(this.pose).meta : null;
        // Merfolk hook: a rock under a pose sitting on one.
        if (window.RRMerfolkBody) RRMerfolkBody.viewRock(view, view.poseMeta && view.poseMeta.seat);
        if (view.action) {
            // A motion played once (a fall, a flip, a throw) plays through, holds its end a moment, then plays again.
            const once = view.poseMeta && view.poseMeta.once;
            view.action.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, once ? 1 : Infinity);
            view.action.clampWhenFinished = !!once;
            view.action.time = once ? 0 : time % (view.action.getClip().duration || 1);
            view.heldSince = 0;
            view.action.play();
            // A rebuilt clip must already be posed before its skin transition
            // can draw; waiting for the next tick flashes the rest pose.
            view.mixer.update(0);
            this._plant();
        }
        if (view.action && view.mixer) {
            let carried = 0;
            // Every frame is drawn while the view keeps up; one that cannot (the frames' middle gap over
            // 22 ms through half a second) draws every other frame, the animation's time kept whole, until the
            // pose changes.
            const gaps = [];
            view.halfRate = false;
            const tick = () => {
                view.loop = 0;
                if (this._previewPaused || this._view !== view) return;
                view.loop = requestAnimationFrame(tick);
                const dt = Math.min(0.1, view.clock.update().getDelta());
                carried += dt;
                if (!view.halfRate) {
                    gaps.push(dt);
                    if (gaps.length > 30) gaps.shift();
                    if (gaps.length === 30 && gaps.slice().sort((a, b) => a - b)[15] > 0.022) view.halfRate = true;
                }
                if (view.halfRate && carried < 1 / 32 && !view.needsDraw) return;
                this._restorePreviewRig();
                view.mixer.update(carried);
                if (view.poseMeta && view.poseMeta.once && view.action && !view.action.isRunning()) {
                    view.heldSince = (view.heldSince || 0) + carried;
                    if (view.heldSince > 1.2) { view.heldSince = 0; view.action.reset().play(); }
                }
                carried = 0;
                this._plant();
                this._render();
            };
            view.resumeAnimation = () => {
                if (view.loop || this._previewPaused || this._sheetExporting?.drawing || this._view !== view) return;
                carried = 0; gaps.length = 0;
                view.clock.reset();
                view.loop = requestAnimationFrame(tick);
            };
            view.resumeAnimation();
        } else this._draw();
    }

    _bounceChanged(path) {
        const result = this._result, view = this._view;
        if (!result || !view || !result.bones.some(b => b.softTissue)) { this._queueRebuild(); return; }
        for (const b of result.bones) if (b.softTissue) b.softTissue.amount = this.recipe[b.softTissue.kind + 'Bounce'];
        for (const b of view.boneDefs) if (b.softTissue) b.softTissue.amount = this.recipe[b.softTissue.kind + 'Bounce'];
        result.recipe[path] = this.recipe[path];
        result.clips = result.clips.map(c => RRCharacterPoses.withSoftTissueMotion(result.bones, c));
        view.idleClip = result.clips[0] || null;
        const source = this.pose !== 'idle' && view.actions.get(this.pose)?.source;
        view.bounceSource = source ? { id: this.pose, clip: source } : null;
        const old = [...view.actions.values()].map(a => a.action);
        view.actions.clear();
        this._syncPose();
        for (const a of old) if (a !== view.action) view.mixer.uncacheClip(a.getClip());
    }

    /** A pose's action on this build's skeleton: Idle from the build, the others from RRCharacterPoses. */
    _poseAction(id) {
        const view = this._view;
        if (!view || !view.mixer || !view.bones.length) return null;
        if (view.actions.has(id)) return view.actions.get(id).action;
        // Merfolk hook: a merfolk's skeleton plays the tail's own motions.
        const mer = !!window.RRMerfolkBody && RRMerfolkBody.hasTail(view.boneDefs);
        const cen = !!window.RRCharacterCentaur && RRCharacterCentaur.hasHorse(view.boneDefs);
        const cached = view.bounceSource; view.bounceSource = null;
        let made = cached?.id === id ? cached.clip : id === 'idle' ? view.idleClip : cen ? RRCharacterCentaur.poseClip(view.boneDefs, id, view.bodySkin, this.recipe) : view.plan === 'slime' ? RRSlimeBody.poseClip(view.boneDefs, id, this.recipe) : view.plan === 'quadruped' ? RRCreatureBody.poseClip(view.boneDefs, id, this.recipe) : mer ? RRMerfolkBody.poseClip(view.boneDefs, id, view.bodySkin, this.recipe) : RRCharacterPoses.clip(view.boneDefs, id, view.bodySkin);
        if (!made) return null;
        made = RRCharacterPoses.withSoftTissueMotion(view.boneDefs, made);
        const source = made;
        // Loose cloth worked out over the clip off the page (RRCharacterCloth, coarser in the view; kept per clip, body and
        // garment): until it is ready the cloth rides its anchor, then the pose takes it up where it is.
        const result = this._result;
        if (window.RRCharacterCloth && result && result.cloth && result.bones.length === view.bones.length) {
            const ready = RRCharacterCloth.baked(result, made, { quality: 'preview' });
            if (ready) made = ready;
            else RRCharacterCloth.bakeAsync(result, made, { quality: 'preview' })
                .then(() => this._clothReady(id, result))
                .catch(error => console.error('[Character3DBuilder] cloth preview', error));
        }
        // A track turns its bone, or with a path moves it ('translation') or squashes it ('scale').
        const tracks = made.tracks.map(t => new (t.path ? THREE.VectorKeyframeTrack : THREE.QuaternionKeyframeTrack)(view.bones[t.bone].name + (t.path === 'scale' ? '.scale' : t.path === 'translation' ? '.position' : '.quaternion'), Array.from(t.times || made.times), Array.from(t.values)));
        const action = view.mixer.clipAction(new THREE.AnimationClip(made.name || id, -1, tracks));
        view.actions.set(id, { action, source, meta: { plant: !!made.plant, lift: made.lift || null, skin: !!made.skin, once: !!made.once, seat: made.seat || null } });
        return action;
    }

    /** A pose's cloth is worked out: its action is made again with it, carrying on from the pose's own time. */
    _clothReady(id, result) {
        if (this._sheetExporting?.drawing) {
            (this._sheetExporting.clothReady ||= []).push({ id, result });
            return;
        }
        const view = this._view, entry = view && view.actions && view.actions.get(id);
        if (!entry || this._result !== result) return;
        const old = entry.action, playing = view.action === old;
        view.actions.delete(id);
        const action = this._poseAction(id);
        if (!action) { view.actions.set(id, entry); return; }
        if (playing) {
            const paused = old.paused;
            action.setLoop(old.loop, old.repetitions);
            action.clampWhenFinished = old.clampWhenFinished;
            action.time = old.time;
            action.setEffectiveTimeScale(old.timeScale);
            action.setEffectiveWeight(old.weight);
            action.enabled = old.enabled;
            action.paused = paused;
            old.stop();
            action.play();
            view.action = action; view.poseMeta = view.actions.get(id).meta;
            if (paused) { view.mixer.update(0); this._plant(); this._draw(); }
        }
        view.mixer.uncacheClip(old.getClip());
    }

    /** Where each joint stands at rest, for standing a pose on the floor; a new shape measures its skin again. */
    _restHeights(bones) {
        if (!this._view) return;
        this._view.boneRest = new Map(bones.map(b => [b.name, b.head[1]]));
        if (this._view.actions) for (const a of this._view.actions.values()) delete a.meta.skinFloor;
    }

    /**
     * Stands the pose on the floor: lowered or raised until the lowest of the
     * feet, knees, hips and seat is where it touches the floor (a foot at its
     * resting height, a knee or the seat a little above), then lifted by the
     * pose's own lift (a jump, a fall).
     */
    _plant() {
        const view = this._view, m = view && view.poseMeta;
        if (!view) return;
        view.group.position.y = 0;
        if (!m || (!m.plant && !m.lift)) return;
        let offset = 0;
        if (m.plant && view.boneRest) {
            const s = (view.bodyHeight || 1.7) / 1.7, at = new THREE.Vector3();
            const clear = { LeftLeg: 0.055 * s, RightLeg: 0.055 * s, LeftUpLeg: 0.09 * s, RightUpLeg: 0.09 * s, Hips: 0.1 * s };
            view.group.updateMatrixWorld(true);
            offset = -Infinity;
            for (const b of view.bones) {
                const c = clear[b.name] ?? (/^(Left|Right)(Foot|ToeBase)$/.test(b.name) ? view.boneRest.get(b.name) : undefined);
                if (c === undefined) continue;
                b.getWorldPosition(at);
                offset = Math.max(offset, c - at.y);
            }
            if (!Number.isFinite(offset)) offset = 0;
        }
        view.group.position.y = offset + (m.lift ? m.lift(view.action ? view.action.time : 0) : 0);
        // Body contacts change during a roll or fall. Measure the current skinned
        // surface so an offset from the first frame cannot bury a later contact.
        if (m.skin && view.meshes[0]) {
            const frame = view.action ? view.action.time : 0;
            if (m.skinFloor === undefined || m.skinFloorTime !== frame) {
                const mesh = view.meshes[0], at = new THREE.Vector3(), count = mesh.geometry.getAttribute('position').count;
                view.group.updateMatrixWorld(true);
                let low = Infinity;
                for (let i = 0; i < count; i += 7) { mesh.getVertexPosition(i, at); at.applyMatrix4(mesh.matrixWorld); low = Math.min(low, at.y); }
                m.skinFloor = Number.isFinite(low) ? -low : 0;
                m.skinFloorTime = frame;
            }
            view.group.position.y += m.skinFloor;
        }
    }

    /**
     * The drag's fast path: only the body is shaped again (its targets and
     * swellings, a few milliseconds), and every other vertex (clothes, hair,
     * eyes, accessories, features) moves with the skin vertex under it, the
     * skeleton with the body's joints. No garment is cut, no hair grown, no
     * picture painted; the whole character is built once the slider rests.
     */
    _fastShape() {
        const view = this._view, result = this._result, pack = this.pack;
        // The shared human sculpt refits its offsets, eyes, lids and scalp
        // with the recipe. Moving an earlier model by its old skin bindings
        // shows a different face until release. Use the same off-page full
        // build for input and change; the newest recipe is already coalesced.
        if (window.RRHeadMesh?.applies(this.recipe) || this.recipe.shapes?.abs > 1) return false;
        // These fitted features change their rest skeleton or the shared cranial rim.
        // Rebuild them with the new body rather than temporarily stretching old fittings.
        if (this.recipe.head?.heads===2 || this.recipe.features?.arms?.type === 'insect' || this.recipe.features?.machinery?.type === 'android') return false;
        if (!view || !result || result.plan !== 'human' || !result.built || !view.meshes.length || view.meshes.length !== result.parts.length) return false;
        if (!this._fast || this._fast.result !== result) this._fast = this._fastStart(result);
        // Shaped off the page when a shaper is at hand (a heavy shape takes longer than a frame): the newest
        // recipe waits while one is being shaped, and the view takes each shape as it comes back.
        const worker = this._shapeWorker();
        if (worker) {
            const job = this._shapeJob || (this._shapeJob = { busy: false, next: null });
            const recipe = JSON.parse(JSON.stringify(this.recipe));
            if (job.busy) { job.next = recipe; return true; }
            job.busy = true;
            worker.postMessage({ recipe, result: (this._shapeGen = (this._shapeGen || 0) + 1) });
            job.gen = this._shapeGen; job.result = result;
            return true;
        }
        const shaped = RRHumanBody.shape(pack, this.recipe);
        this._fastApply(shaped, RRHumanBody.normals(shaped, pack.body.source, pack.body.index, pack.vertexCount), RRHumanBody.joints(pack, shaped).map(j => j.head));
        return true;
    }

    /** A shape back from the shaper, laid on the view while the drag it was for still holds. */
    _shapeDone(data) {
        const job = this._shapeJob;
        if (!job || data.result !== job.gen) return;
        job.busy = false;
        if (this._fast && this._fast.result === job.result && this._result === job.result) {
            const heads = [];
            for (let i = 0; i < data.heads.length; i += 3) heads.push([data.heads[i], data.heads[i + 1], data.heads[i + 2]]);
            this._fastApply(new Float32Array(data.shaped), new Float32Array(data.normals), heads);
        }
        if (job.next && this._result === job.result) {
            const recipe = job.next;
            job.next = null;
            job.busy = true;
            this._shapeWorkerRef.postMessage({ recipe, result: job.gen });
        } else job.next = null;
    }

    /** The body's shaper: the body's own modules and data, loaded into a worker once (null where there are none). */
    _shapeWorker() {
        if (this._shapeWorkerRef !== undefined) return this._shapeWorkerRef;
        this._shapeWorkerRef = null;
        try {
            if (typeof Worker === 'undefined' || typeof require !== 'function' || !(typeof process !== 'undefined' && process.versions?.node)) return null;
            const fs = require('fs'), path = require('path');
            const dir = path.join(RRHumanBody.dataFolder(), '..');
            const code = ['HumanTargets', 'FaceFieldData', 'HeadMeshData', 'HumanBody', 'CharacterExpressions'].map(f => fs.readFileSync(path.join(dir, f + '.js'), 'utf8')).join('\n;\n') + `
                let pack = null;
                self.onmessage = e => {
                    if (e.data.init) {
                        pack = self.RRHumanBody.openPack(e.data.json, new Uint8Array(e.data.bin));
                        pack._expressionUnits = e.data.expressionUnits || null;
                        return;
                    }
                    const B = self.RRHumanBody, shaped = B.shape(pack, e.data.recipe);
                    const normals = B.gather(B.skinNormals(pack, shaped, e.data.recipe), pack.body.source, 3);
                    const joints = B.joints(pack, shaped), heads = new Float32Array(joints.length * 3);
                    joints.forEach((j, i) => heads.set(j.head, i * 3));
                    const out = Float32Array.from(shaped);
                    self.postMessage({ result: e.data.result, shaped: out.buffer, normals: normals.buffer, heads }, [out.buffer, normals.buffer]);
                };`;
            const worker = (() => { const url = URL.createObjectURL(new Blob([code], { type: 'text/javascript' })); const made = new Worker(url); URL.revokeObjectURL(url); return made; })();
            const data = RRHumanBody.dataFolder(), bin = fs.readFileSync(path.join(data, 'human.bin'));
            const buffer = bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength);
            const expressionUnits = window.RRCharacterExpressions?.units(this.pack) || null;
            worker.postMessage({ init: true, json: JSON.parse(fs.readFileSync(path.join(data, 'human.json'), 'utf8')), bin: buffer, expressionUnits }, [buffer]);
            worker.onmessage = e => this._shapeDone(e.data);
            worker.onerror = () => { worker.terminate(); this._shapeWorkerRef = null; this._shapeJob = null; };
            this._shapeWorkerRef = worker;
        } catch (error) {
            console.warn('[Character3DBuilder] shaper', error);
            this._shapeWorkerRef = null;
        }
        return this._shapeWorkerRef;
    }

    /** The fast path's shape laid on the view: every part's vertices by the skin under them, the skeleton by the body's joints. */
    _fastApply(shaped, normals, jointHeads) {
        const view = this._view, result = this._result, pack = this.pack, F = this._fast;
        if (!view || !F || F.result !== result) return;
        this._stopPreviewTween();
        const translated = new Set((view.action?.getClip().tracks || []).filter(t => t.name.endsWith('.position')).map(t => t.name.slice(0, -9)));
        const posed = view.bones.map(b => ({ position: b.position.clone(), quaternion: b.quaternion.clone(), scale: b.scale.clone() }));
        let floor = Infinity;
        for (const v of pack.body.source) floor = Math.min(floor, shaped[v * 3 + 1]);
        const lift = F.floor - floor;
        let chest = null;
        result.parts.forEach((part, k) => {
            const map = F.maps[k], base = F.bases[k], g = view.meshes[k].geometry, pos = g.getAttribute('position'), a = pos.array;
            if (part.chestDetail) {
                chest ||= RRCharacterDetail.chestParts(pack, { shaped }, this.recipe, result.parts[0], part.chestReach, true);
                const detail = part.decal ? chest.overlay : chest.base;
                const uv = g.getAttribute('uv');
                if (uv) { uv.array.set(detail.uvs); uv.needsUpdate = true; }
                a.set(detail.positions);
                for (let i = 1; i < a.length; i += 3) a[i] += lift + F.modelLift;
                pos.needsUpdate = true;
                g.getAttribute('normal').array.set(detail.normals); g.getAttribute('normal').needsUpdate = true;
                return;
            }
            if (part.name === 'Forehead detail') {
                const detail = RRCharacterDetail.cranialPart(pack, { shaped }, this.recipe, result.parts[0], part);
                if (detail) {
                    a.set(detail.positions);
                    for (let i = 1; i < a.length; i += 3) a[i] += lift + F.modelLift;
                    pos.needsUpdate = true;
                    g.getAttribute('normal').array.set(detail.normals); g.getAttribute('normal').needsUpdate = true;
                    return;
                }
            }
            if (part.anatomicalDetail) {
                const detail = RRCharacterDetail.genitalPart(pack, { shaped }, part, part.anatomicalDetail === 'female', { anatomy: this.recipe.anatomy });
                a.set(detail.positions);
                for (let i = 1; i < a.length; i += 3) a[i] += lift + F.modelLift;
                pos.needsUpdate = true;
                g.getAttribute('normal').array.set(detail.normals); g.getAttribute('normal').needsUpdate = true;
                return;
            }
            for (let i = 0; i < map.length; i++) {
                if (part.interpolation) {
                    const bind = part.interpolation;
                    for (let axis = 0; axis < 3; axis++) {
                        let move = 0;
                        for (let j = bind.offsets[i]; j < bind.offsets[i + 1]; j++) {
                            const v = bind.vertices[j] * 3 + axis;
                            move += (shaped[v] - F.shaped[v]) * bind.weights[j];
                        }
                        a[i * 3 + axis] = base[i * 3 + axis] + move + (axis === 1 ? lift : 0);
                    }
                    continue;
                }
                const v = map[i] * 3;
                a[i * 3] = base[i * 3] + shaped[v] - F.shaped[v];
                a[i * 3 + 1] = base[i * 3 + 1] + shaped[v + 1] - F.shaped[v + 1] + lift;
                a[i * 3 + 2] = base[i * 3 + 2] + shaped[v + 2] - F.shaped[v + 2];
            }
            pos.needsUpdate = true;
            if (k === 0) {
                g.getAttribute('normal').array.set(normals);
                g.getAttribute('normal').needsUpdate = true;
            } else if (part.interpolation) {
                if (part.headMesh && window.RRHeadMesh) {
                    g.getAttribute('normal').array.set(RRHeadMesh.posedNormals(part, a));
                    g.getAttribute('normal').needsUpdate = true;
                } else g.computeVertexNormals();
            }
        });
        // The skeleton: each joint by how far the body's own joint moved, bound again standing on the
        // floor, then the pose playing taken up again where it was (stopping it would start it over).
        view.group.position.y = 0;
        const heads = result.bones.map((b, i) => {
            const j = i < jointHeads.length ? jointHeads[i] : null, o = i < F.joints.length ? F.joints[i] : null;
            const hip = jointHeads[0], hip0 = F.joints[0];
            const d = j && o ? [j[0] - o[0], j[1] - o[1], j[2] - o[2]] : [hip[0] - hip0[0], hip[1] - hip0[1], hip[2] - hip0[2]];
            return [b.head[0] + d[0], b.head[1] + d[1] + lift, b.head[2] + d[2]];
        });
        result.bones.forEach((b, i) => {
            const parent = b.parent >= 0 ? heads[b.parent] : [0, 0, 0];
            view.bones[i].position.set(heads[i][0] - parent[0], heads[i][1] - parent[1], heads[i][2] - parent[2]);
            view.bones[i].quaternion.identity();
            view.bones[i].scale.set(1, 1, 1);
            view.bones[i].userData.rest.p.copy(view.bones[i].position);
        });
        view.group.updateMatrixWorld(true);
        view.skeleton.calculateInverses();
        // The mixer caches constant track values. update(0) alone will not
        // restore a floor pose's constant root turn after the bind calculation.
        // Preserve the displayed pose while unanimated positions use the new rig.
        view.bones.forEach((bone, i) => {
            if (translated.has(bone.name)) bone.position.copy(posed[i].position);
            bone.quaternion.copy(posed[i].quaternion);
            bone.scale.copy(posed[i].scale);
        });
        if (view.actions) for (const a of view.actions.values()) delete a.meta.skinFloor;
        this._resumePose();
        this._lastChange = Date.now();
        // The camera follows the body as it changes: it aims by the height, and left at the last whole build's it jumped when the
        // slider was let go, as if the body had snapped back.
        let tall = -Infinity;
        for (const v of pack.body.source) tall = Math.max(tall, shaped[v * 3 + 1]);
        tall -= floor;
        if (!F.aim) { let was = -Infinity; for (const v of pack.body.source) was = Math.max(was, F.shaped[v * 3 + 1]); F.aim = { tall: was - F.floor, height: view.height, body: view.bodyHeight, face: view.faceCenter ? [...view.faceCenter] : null }; }
        const grown = tall / F.aim.tall;
        view.height = F.aim.height * grown; view.bodyHeight = F.aim.body * grown;
        if (F.aim.face) view.faceCenter = [F.aim.face[0], F.aim.face[1] * grown, F.aim.face[2]];
        if (view.target) this._aim();
        this._draw();
    }

    /** What the fast path moves by: each part vertex's skin vertex, and where everything stood. */
    _fastStart(result) {
        const pack = this.pack, built = result.built, P = built.shaped;
        const body = [...new Set(pack.body.source)];
        // Cells keyed by one number (a string key per lookup made the first drag after a build hitch).
        const cell = 0.03, grid = new Map(), key = (x, y, z) => ((x + 1024) * 2048 + (y + 1024)) * 2048 + (z + 1024);
        for (const v of body) {
            const k = key(Math.floor(P[v * 3] / cell), Math.floor(P[v * 3 + 1] / cell), Math.floor(P[v * 3 + 2] / cell));
            if (!grid.has(k)) grid.set(k, []);
            grid.get(k).push(v);
        }
        // The model may stand higher than the body (boots): every part's own lift off the body.
        let floorModel = Infinity, floorBody = Infinity;
        for (const p of result.parts) for (let i = 1; i < p.positions.length; i += 3) floorModel = Math.min(floorModel, p.positions[i]);
        for (const v of pack.body.source) floorBody = Math.min(floorBody, P[v * 3 + 1]);
        const shift = Math.max(0, -floorModel);
        // The skin vertex nearest a point. Past a few cells (a gown's hem stands half a metre out from the legs) every
        // vertex is compared: the first vertex of the body stood in for them, so the hem rode on it and tore.
        const nearest = (x, y, z) => {
            const cx = Math.floor(x / cell), cy = Math.floor(y / cell), cz = Math.floor(z / cell);
            let best = body[0], bd = Infinity;
            for (let r = 1; r <= 6; r++) {
                for (let i = -r; i <= r; i++) for (let j = -r; j <= r; j++) for (let k = -r; k <= r; k++) {
                    if (Math.max(Math.abs(i), Math.abs(j), Math.abs(k)) !== r && r > 1) continue;
                    for (const u of grid.get(key(cx + i, cy + j, cz + k)) || []) {
                        const d = (P[u * 3] - x) ** 2 + (P[u * 3 + 1] - y) ** 2 + (P[u * 3 + 2] - z) ** 2;
                        if (d < bd) { bd = d; best = u; }
                    }
                }
                if (bd < Infinity) break;
            }
            if (bd === Infinity) {
                for (const u of body) {
                    const d = (P[u * 3] - x) ** 2 + (P[u * 3 + 1] - y) ** 2 + (P[u * 3 + 2] - z) ** 2;
                    if (d < bd) { bd = d; best = u; }
                }
            }
            return best;
        };
        const maps = result.parts.map((part, k) => {
            const n = part.positions.length / 3;
            if (k === 0) return Int32Array.from(pack.body.source);
            // Refined surfaces carry exact interpolation; this map only supplies their vertex count.
            if (part.interpolation) return Int32Array.from({ length: n }, (_, i) => part.interpolation.vertices[part.interpolation.offsets[i]]);
            if (part.name === 'Genitals') return Int32Array.from(pack.helpers.genital.source);
            // Parts that know the skin vertex each of theirs rides on (areolas, body hair).
            if (part.source && part.source.length === n) return Int32Array.from(part.source);
            const m = new Int32Array(n);
            for (let i = 0; i < n; i++) m[i] = nearest(part.positions[i * 3], part.positions[i * 3 + 1] - shift, part.positions[i * 3 + 2]);
            return m;
        });
        return {
            result, maps, shaped: Float32Array.from(P), floor: floorBody,
            modelLift: result.parts[0].positions[1] - P[pack.body.source[0] * 3 + 1],
            bases: result.parts.map(p => Float32Array.from(p.positions)),
            joints: RRHumanBody.joints(pack, P).map(j => j.head.slice())
        };
    }

    _queueRebuild() {
        this._rebuildOwed = true;
        if (this._previewPaused || this._sheetExporting) return;
        this._lastChange = Date.now();
        if (this._pending) return;
        this._pending = requestAnimationFrame(() => { this._pending = 0; this._rebuildOffPage(); });
    }

    /** A second worker of the view's own: thumbnails queue on theirs, and a drag must not wait behind them. */
    _livePool() {
        if (this._liveFailed || typeof process === 'undefined' || !process.versions?.node || typeof require !== 'function') return null;
        if (this._liveWorker) return this._liveWorker;
        try {
            const { PreviewWorker } = require(require('path').join(RRHumanBody.dataFolder(), '..', 'CharacterPreviewWorker.cjs'));
            this._liveWorker = new PreviewWorker({ arrays: window, timeoutMs: 120000, maxQueued: 1 });
            this._liveMarks = null;
        } catch (error) { console.warn('[Character3DBuilder] live worker', error); this._liveFailed = true; }
        return this._liveWorker || null;
    }

    /** A whole build costs a second or more, so it runs off the page: one at a time, showing completed drag samples and building the newest recipe next. */
    _rebuildOffPage() {
        if (this._previewPaused || this._sheetExporting) { this._rebuildOwed = true; return; }
        const pool = this._view && this.pack ? this._livePool() : null;
        if (!pool) { this._rebuild(); return; }
        const job = this._liveJob || (this._liveJob = { busy: false, owed: false });
        if (job.busy) { job.owed = true; return; }
        job.busy = true;
        this._rebuildOwed = false;
        const epoch = this._thumbEpoch, recipe = JSON.parse(JSON.stringify(this.recipe)), drag = this._rangeDrag;
        (async () => {
            this._loadOutfitEmblems?.();
            await this._configurePreview(pool, recipe, '_liveMarks');
            return pool.build({ key: 'live', cacheKey: 'live', recipe, options: { live: true, ...this._buildOptions() } });
        })().then(result => {
            // Free again whatever became of the result: a build left "busy" (the epoch moved on while it ran: a swatch,
            // a scroll) would hold every later live build back until the tool was opened again.
            job.busy = false;
            if (this._thumbEpoch !== epoch || !this._view) {
                if (this._view) { job.owed = false; this._queueRebuild(); }
                return;
            }
            // A complete sampled shape can be shown while the same slider is
            // still moving. Discarding every older sample starved continuous
            // drags until release. Other recipe edits and ended drags still
            // reject stale work; a settled value always gets its exact build.
            const current = JSON.stringify(this.recipe) === JSON.stringify(recipe);
            const moving = drag && this._rangeDrag === drag && Character3DBuilder.rangeContext(this.recipe, drag.path) === Character3DBuilder.rangeContext(recipe, drag.path);
            if (!current && !moving) { job.owed = false; this._queueRebuild(); return; }
            // A body drag came back while this was building: the drag's own shape stands until it rests.
            if (this._settle) return;
            this.cache.skinKey = result.skinKey;
            if (result.textures?.['skin.png']) this.cache.skin = result.textures['skin.png'];
            this._applyBuild(result, recipe);
            if (!current || job.owed) { job.owed = false; this._queueRebuild(); }
        }, error => {
            job.busy = false;
            if (this._thumbEpoch !== epoch || !this._view) return;
            const owed = job.owed; job.owed = false;
            if (error?.name === 'AbortError') { if (owed) this._queueRebuild(); return; }
            console.warn('[Character3DBuilder] live build, building on the page', error);
            this._liveFailed = true;
            this._rebuild();
        });
    }

    _buildOptions() {
        return { quality: 'preview', bodyArtPictures: this._artPictures, atlasSize: this._weak ? 1024 : undefined, hairBudget: this._weak ? 0.45 : 1, draft: !!((this.slime || !this.human) && this._dragDraft) };
    }

    _rebuild() {
        if (this._previewPaused || this._sheetExporting) { this._rebuildOwed = true; return; }
        this._rebuildOwed = false;
        const view = this._view;
        if (!view || !this.pack) return;
        let result;
        try {
            this._loadOutfitEmblems?.();
            result = RRCharacterModel.build(this.pack, this.recipe, this.cache, { ...this._buildOptions(), eyeSource: this.eyeSource, paintSkin: (key, args) => this._paintSkin(key, args) });
        } catch (error) {
            console.error('[Character3DBuilder] build', error);
            this._status(this._t('This character could not be built.'), 'error');
            return;
        }
        this._applyBuild(result, this.recipe);
    }

    /**
     * A finished build into the view, from the page or the live worker alike. `asked` is the recipe the build was
     * given: whether the view shows the builder's recipe is told by it (`_builtFor`), not by the result's own
     * recipe, which the build normalized once more (that can move an ancestry weight by one bit, for good).
     */
    _applyBuild(result, asked = result.recipe) {
        const previous = (this._rangeDrag || this._rangeSettle || this._previewTween) && this._previewSnapshot();
        this._result = result;
        this._builtFor = JSON.stringify(asked);
        const exact = this._builtFor === JSON.stringify(this.recipe);
        if (this._talk) this._talk.stop();
        this._show(result);
        // The drag's fast path made ready while the page is idle, so the first move of a slider does not wait on it.
        if (result.plan === 'human' && result.built && !(result.recipe?.shapes?.abs > 1) && !window.RRHeadMesh?.applies(result.recipe || this.recipe)) {
            const ready = () => { if (this._result === result && this._view && (!this._fast || this._fast.result !== result)) this._fast = this._fastStart(result); };
            if (typeof requestIdleCallback === 'function') requestIdleCallback(ready, { timeout: 1500 }); else setTimeout(ready, 400);
        }
        this._showExpression();
        if (previous) this._tweenPreview(previous);
        if (exact) this._rangeSettle = null;
        this._queueShading();
        const readout = this.root.querySelector('.rr-c3d-readout');
        if (readout) {
            // Triangles as the saved file holds them: hair's blended twin shares its core's (RRCharacterGlb.triangles).
            const count = window.RRCharacterGlb && RRCharacterGlb.triangles ? RRCharacterGlb.triangles(result.parts) : { total: result.parts.reduce((s, p) => s + p.index.length / 3, 0) };
            readout.textContent = this._t('Height {m} m', { m: result.height.toFixed(2) }) + ' · ' + this._t('{n} triangles', { n: Math.round(count.total).toLocaleString() });
            readout.title = count.outfit != null ? this._t('Outfit {outfit} · Hair {hair} · Body {body}', { outfit: count.outfit.toLocaleString(), hair: count.hair.toLocaleString(), body: count.body.toLocaleString() }) : '';
        }
        const opening = this._openingDesign;
        if (opening && exact && opening.recipe === this._builtFor) {
            this._openingDesign = null;
            this._status(this._t('Opened {name}.', { name: opening.name }), 'ok');
        }
    }

    /** Capture the displayed sample, including any unfinished transition. */
    _previewSnapshot() {
        const view = this._view, tween = this._previewTween;
        if (!view || !this._result) return null;
        const snapshot = { view, bones: (view.bones || []).map((bone, i) => ({ name: bone.name,
            rest: bone.userData.rest.p.clone().add(tween?.rig[i]?.offset || new THREE.Vector3()),
            inverse: view.skeleton.boneInverses[i].clone() })),
            camera: view.target && { target: view.target.clone(), distance: view.distance },
            parts: view.meshes.map((mesh, i) => ({ part: this._result.parts[i], name: this._result.parts[i]?.name,
            positions: Float32Array.from(mesh.geometry.getAttribute('position').array),
            normals: Float32Array.from(mesh.geometry.getAttribute('normal').array),
            attributes: Object.fromEntries(['uv', 'uv1', 'skinWeight', 'skinIndex'].flatMap(name => {
                const a = mesh.geometry.getAttribute(name); return a ? [[name, a.array.slice()]] : [];
            })), index: Uint32Array.from(mesh.geometry.index.array) })) };
        this._stopPreviewTween(false);
        return snapshot;
    }

    /** Remove the display offsets before animation evaluates its target rig. */
    _restorePreviewRig(tween = this._previewTween) {
        if (!tween) return;
        for (const r of tween.rig) {
            r.bone.position.sub(r.offset); r.offset.set(0, 0, 0);
            r.inverse.copy(r.toInverse);
        }
    }

    _stopPreviewTween(finish = true) {
        const tween = this._previewTween;
        if (!tween) return;
        cancelAnimationFrame(tween.frame);
        this._restorePreviewRig(tween);
        this._previewTween = null;
        if (finish) for (const part of tween.parts) {
            for (const a of part.attributes) { a.attribute.array.set(a.to); a.attribute.needsUpdate = true; }
        }
        if (finish && tween.camera) {
            tween.view.target.copy(tween.camera.to); tween.view.distance = tween.camera.toDistance;
        }
    }

    /** A small display-only transition between complete worker builds.
     * Skin and its bind rig travel together, including while Idle is playing.
     * Recipe and export buffers stay exact. */
    _tweenPreview(previous) {
        const view = this._view;
        if (!previous || previous.view !== view) return;
        if (previous.bones.length !== (view.bones || []).length || previous.bones.some((b, i) => b.name !== view.bones[i].name)) return;
        const equal = (a, b) => a === b || (!!a && !!b && a.length === b.length && a.every((v, i) => v === b[i]));
        const parts = [];
        view.meshes.forEach((mesh, i) => {
            const before = previous.parts[i], current = this._result.parts[i], g = mesh.geometry, position = g.getAttribute('position'), normal = g.getAttribute('normal');
            if (!before || before.name !== this._result.parts[i]?.name || before.positions.length !== position.array.length || before.normals.length !== normal.array.length || before.index.length !== g.index.array.length || before.index.some((v, k) => v !== g.index.array[k])) return;
            // Equal counts alone do not identify corresponding skin vertices
            // or procedurally resampled strands.
            if (!equal(before.part?.source, current.source) || !equal(before.part?.seamMap, current.seamMap)) return;
            if (current.kind === 'hair' && !current.source) return;
            if (!equal(before.attributes.skinIndex, g.getAttribute('skinIndex')?.array)) return;
            const attributes = [['position', before.positions], ['normal', before.normals], ...['uv', 'uv1', 'skinWeight'].map(name => [name, before.attributes[name]])]
                .flatMap(([name, from]) => {
                    const attribute = g.getAttribute(name);
                    return from && attribute && from.length === attribute.array.length ? [{ attribute, from, to: attribute.array.slice() }] : [];
                });
            if (attributes.some(a => !equal(a.from, a.to))) parts.push({ attributes });
        });
        if (!parts.length) return;
        const now = performance.now(), interval = this._lastPreviewSample ? now - this._lastPreviewSample : 140;
        this._lastPreviewSample = now;
        const rig = (view.bones || []).map((bone, i) => ({ bone, from: previous.bones[i].rest,
            to: bone.userData.rest.p.clone(), offset: new THREE.Vector3(), inverse: view.skeleton.boneInverses[i],
            fromInverse: previous.bones[i].inverse, toInverse: view.skeleton.boneInverses[i].clone() }));
        const camera = previous.camera && { from: previous.camera.target, to: view.target.clone(),
            fromDistance: previous.camera.distance, toDistance: view.distance, last: view.target.clone(), lastDistance: view.distance };
        const tween = this._previewTween = { parts, rig, camera, view, result: this._result, started: now, duration: Math.max(80, Math.min(200, interval)), frame: 0 };
        const tick = () => {
            if (this._previewTween !== tween || this._view !== view || this._result !== tween.result) return;
            if (this._previewPaused) { this._stopPreviewTween(); return; }
            this._render();
            if (this._previewTween === tween) tween.frame = requestAnimationFrame(tick);
        };
        this._stepPreviewTween(now);
        tween.frame = requestAnimationFrame(tick);
    }

    _stepPreviewTween(now) {
        const tween = this._previewTween;
        if (!tween) return;
        this._restorePreviewRig(tween);
        // A stream of samples must keep moving: restarting an ease-in for
        // every completed build repeatedly stopped the surface mid-drag.
        const t = Math.max(0, Math.min(1, (now - tween.started) / tween.duration));
        for (const part of tween.parts) for (const a of part.attributes) {
            const out = a.attribute.array;
            for (let k = 0; k < out.length; k++) out[k] = t === 1 ? a.to[k] : a.from[k] + (a.to[k] - a.from[k]) * t;
            a.attribute.needsUpdate = true;
        }
        for (const r of tween.rig) {
            r.offset.copy(r.from).sub(r.to).multiplyScalar(1 - t);
            r.bone.position.add(r.offset);
            for (let k = 0; k < 16; k++) r.inverse.elements[k] = r.fromInverse.elements[k] + (r.toInverse.elements[k] - r.fromInverse.elements[k]) * t;
        }
        const c = tween.camera, view = tween.view;
        if (c && (!view.target.equals(c.last) || view.distance !== c.lastDistance)) tween.camera = null;
        else if (c) {
            view.target.lerpVectors(c.from, c.to, t); view.distance = c.fromDistance + (c.toDistance - c.fromDistance) * t;
            c.last.copy(view.target); c.lastDistance = view.distance;
        }
        if (view.group) view.group.updateMatrixWorld(true);
        if (view.action) this._plant();
        if (t === 1) { cancelAnimationFrame(tween.frame); this._previewTween = null; }
    }

    /** New pictures into the materials that show them, in place: nothing else is made again. */
    _swapTextures(result) {
        const view = this._view;
        for (const [name, tex] of Object.entries(result.textures || {})) {
            const kept = view.textures.get(name);
            if (!kept || kept.data === tex.data) continue;
            const old = kept.texture;
            if (old.image.width === tex.width && old.image.height === tex.height) {
                old.image.data = tex.data;
                old.needsUpdate = true;
                kept.data = tex.data;
                continue;
            }
            view.textures.delete(name);
            const fresh = this._texture(name, tex);
            for (const m of view.meshes) {
                if (m.material.map === old) { m.material.map = fresh; m.material.needsUpdate = true; }
                if (m.material.sheenColorMap === old) { m.material.sheenColorMap = fresh; m.material.needsUpdate = true; }
                if (m.material.emissiveMap === old) { m.material.emissiveMap = fresh; m.material.needsUpdate = true; }
                for(const field of ['roughnessMap','metalnessMap','iridescenceThicknessMap']) if(m.material[field]===old){fresh.colorSpace=THREE.NoColorSpace;fresh.needsUpdate=true;m.material[field]=fresh;m.material.needsUpdate=true;}
                if (m.material.normalMap === old) { fresh.colorSpace = THREE.NoColorSpace; fresh.needsUpdate = true; m.material.normalMap = fresh; m.material.needsUpdate = true; }
            }
            old.dispose();
        }
        // The painted skin is in: no tint stands in for it any more.
        const body = view.meshes[0];
        if (body && body.material.userData.tinted && this.cache.skinKey !== body.material.userData.tintFrom) {
            body.material.color.set(0xffffff); body.material.userData.tinted = false;
        }
    }

    /** Whether the pictures a build shows are the ones the meshes already carry. */
    _sameTextures(result) {
        const view = this._view;
        for (const [name, tex] of Object.entries(result.textures || {})) {
            const kept = view.textures.get(name);
            if (!kept || kept.data !== tex.data) return false;
        }
        return true;
    }

    _clearModel() {
        this._stopPreviewTween(false);
        const view = this._view;
        if (!view) return;
        view.held?.removeFromParent();
        if (view.mixer) { view.mixer.stopAllAction(); view.mixer.uncacheRoot(view.group); }
        for (const m of view.meshes) { m.geometry.dispose(); m.material.dispose(); view.group.remove(m); }
        for (const b of view.bones) if (b.parent === view.group) view.group.remove(b);
        if (view.skeleton) view.skeleton.dispose();
        view.meshes = []; view.bones = []; view.skeleton = null; view.mixer = null; view.action = null;
        view.group.position.y = 0;
        view.structure = null;
    }

    _texture(name, tex) {
        const view = this._view;
        const kept = view.textures.get(name);
        if (kept && kept.data === tex.data) return kept.texture;
        if (kept) kept.texture.dispose();
        const t = new THREE.DataTexture(tex.data, tex.width, tex.height, THREE.RGBAFormat);
        t.colorSpace = THREE.SRGBColorSpace;
        t.flipY = false;
        if (tex.repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
        t.generateMipmaps = true;
        t.minFilter = THREE.LinearMipmapLinearFilter;
        t.magFilter = THREE.LinearFilter;
        t.anisotropy = 4;
        t.needsUpdate = true;
        view.textures.set(name, { data: tex.data, texture: t });
        return t;
    }

    /** A small studio, filtered into an environment light: two softboxes, a floor bounce, dark walls. */
    _studio(renderer) {
        const target = ModelPreview3D.studioEnvironment(renderer);
        (this._envTargets = this._envTargets || []).push(target);
        return target.texture;
    }

    /** The view's material for a part, by what it is: skin with a warm sheen, cloth, metal, hair, wet eyes, glass. */
    _material(part, result, textureFor, scene) {
        const tex = part.texture && result.textures[part.texture];
        const opaque = !(part.opacity != null && part.opacity < 1);
        const kind = part.kind || (part.metalness > 0.5 ? 'metal' : 'prop');
        const m = new (this._weak ? THREE.MeshStandardMaterial : THREE.MeshPhysicalMaterial)({
            color: tex || part.colors ? 0xffffff : new THREE.Color(part.color || '#bbbbbb'),
            map: tex ? (textureFor ? textureFor(part.texture, tex) : this._texture(part.texture, tex)) : null,
            vertexColors: !!part.colors,
            roughness: part.roughness ?? 0.6, metalness: part.metalness ?? 0,
            side: part.doubleSided ? THREE.DoubleSide : THREE.FrontSide,
            transparent: !opaque, opacity: part.opacity ?? 1,
            alphaTest: part.cutout ? (part.alphaCutoff ?? 0.5) : 0, depthWrite: opaque
        });
        const linearMap = name => {
            const pic = name && result.textures[name];
            if (!pic) return null;
            const t = textureFor ? textureFor(name,pic) : this._texture(name,pic);
            if(t.colorSpace !== THREE.NoColorSpace){t.colorSpace=THREE.NoColorSpace;t.needsUpdate=true;}
            return t;
        };
        // A map on the second coordinates (a cloth's tile) is drawn only where the part has them.
        const second = !!(part.uvs1 && part.uvs1.length === part.positions.length / 3 * 2);
        const onSet = (map, set) => { if (map && set === 1) { if (!second) return null; map.channel = 1; } return map; };
        if(part.metallicRoughnessTexture) m.roughnessMap = m.metalnessMap = onSet(linearMap(part.metallicRoughnessTexture), part.metallicRoughnessTexCoord);
        // The cloth's weave: its relief, and its hollows' occlusion, on the tile.
        if (part.normalTexCoord === 1 && part.normalTexture) {
            const relief = onSet(linearMap(part.normalTexture), 1);
            if (relief) { m.normalMap = relief; const k = part.normalScale ?? 1; m.normalScale = new THREE.Vector2(k, -k); }
        }
        if (part.occlusionTexture) {
            const occlusion = onSet(linearMap(part.occlusionTexture), part.occlusionTexCoord);
            if (occlusion) { m.aoMap = occlusion; m.aoMapIntensity = part.occlusionStrength ?? 1; }
        }
        if(!this._weak && part.iridescence){
            m.iridescence=part.iridescence; m.iridescenceIOR=part.iridescenceIOR ?? 1.3;
            const thickness=part.iridescenceThicknessRange || [100,400];
            m.iridescenceThicknessMinimum=thickness[0]; m.iridescenceThicknessMaximum=thickness[1];
            m.iridescenceThicknessMap=linearMap(part.iridescenceThicknessTexture);
        }
        if (part.emissive) {
            m.emissive.set(part.emissive);
            m.emissiveIntensity = Number.isFinite(part.emissiveIntensity) ? Math.max(0,part.emissiveIntensity) : 1;
            if (part.emissiveTexture && result.textures[part.emissiveTexture]) m.emissiveMap = textureFor ? textureFor(part.emissiveTexture, result.textures[part.emissiveTexture]) : this._texture(part.emissiveTexture, result.textures[part.emissiveTexture]);
        }
        // Cut-out strands (hair, lashes, fur) get soft edges from the antialiasing itself.
        if (part.cutout && kind === 'hair') { m.alphaToCoverage = !part.onSkin; m.alphaTest = Math.min(m.alphaTest, 0.3); }
        // Hair: matte, warm, hardly a reflection of the room.
        if (kind === 'hair') { m.roughness = Math.max(.78,part.roughness??0); m.metalness = 0; m.envMapIntensity = 0.55; }
        // Body hair and fur take the room's light as the skin under them does, so hair of the skin's tint
        // matches it instead of showing as dark specks.
        // Their hairs are finer than a pixel from afar: a low cut keeps them as the picture shrinks.
        // Alpha-to-coverage's derivative expansion exposes bright rectangular
        // patches on short tufts laid over skin. A stable cut matches export.
        if (kind === 'hair' && part.onSkin) { m.envMapIntensity = 0.85; if (part.cutout) m.alphaTest = 0.3; }
        // three gives every material the scene's own environment strength unless the material holds the map
        // itself: a part reflecting more or less of the room than the rest holds it.
        const ownRoom = () => {
            // A tile meant for the second coordinates is never drawn over the first (a part handed over without them).
            if (part.normalTexCoord === 1 && !second) m.normalMap = null;
            if (part.envMapIntensity != null) m.envMapIntensity = part.envMapIntensity;
            if (scene && scene.environment && m.envMapIntensity !== 1) { m.envMap = scene.environment; m.envMapIntensity *= scene.environmentIntensity; }
            return m;
        };
        // Slimefolk hook: goo blended over what is inside it, wet and glossy; bubbles glossy.
        if ((kind === 'goo' || kind === 'bubble') && window.RRSlimeBody) RRSlimeBody.viewMaterial(m, part, !!this._weak, name => result.textures[name] && (textureFor ? textureFor(name, result.textures[name]) : this._texture(name, result.textures[name])));
        // Merfolk hook: a part's own relief picture (the tail's scales), as the saved file carries it; wet hair glossy.
        const merfolk = () => window.RRMerfolkBody && RRMerfolkBody.viewMaterial(m, part, result, (name, tex) => (textureFor ? textureFor(name, tex) : this._texture(name, tex)));
        merfolk();
        // The same factors are written to the GLB (including clearcoat, skin/cloth sheen,
        // hair cutoffs and specular color); preview-only material tweaks must not change its look.
        const look = RRCharacterGlb.materialLook(part, !!this._weak);
        for (const [key, value] of Object.entries(look)) {
            if (key === 'sheenColor' || key === 'specularColor') m[key].setRGB(...value);
            else m[key] = value;
        }
        if (this._weak) return ownRoom();
        if (look.sheen && m.map) m.sheenColorMap = m.map;
        if (kind === 'skin' && m.map && !m.normalMap) {
            m.normalMap = Character3DBuilder.skinDetail(); m.normalScale = new THREE.Vector2(0.025, 0.025);
        }
        merfolk();
        // A part may hold how much of the room it reflects (a grey's black lenses, the floor kept out of them).
        return ownRoom();
    }

    /** The build in the view: a skeleton from its bones, a skinned mesh per part, its Idle ready to play. */
    /** What the meshes in the view are made of: the same structure can be updated in place. */
    _structure(result) {
        return result.plan + '|' + result.bones.map(b => b.name + ':' + b.parent).join(',') + '|' + result.parts.map(p => [p.name, p.positions.length, p.index.length, p.texture || '', p.normalTexture || '', p.emissiveTexture || '', p.metallicRoughnessTexture || '', p.iridescence || 0, p.iridescenceIOR || 0, String(p.iridescenceThicknessRange || ''), p.iridescenceThicknessTexture || '', p.roughness ?? .6, p.metalness ?? 0, JSON.stringify(p.skinFinish || null), p.normalScale ?? 1, p.kind || '', p.doubleSided ? 1 : 0, p.opacity ?? 1, !!p.uvs, !!p.uvs1, p.normalTexCoord || 0, p.occlusionTexture || '', p.fabric || '', p.sheen ? p.sheen.strength + '/' + p.sheen.roughness : '', !!p.colors, !!p.keepColors].join(':')).join(';');
    }

    /**
     * A slider moved and nothing was added or taken away: the same meshes take
     * the new positions and normals, the skeleton its new joints. No buffers,
     * materials or programs are made, so dragging stays smooth.
     */
    _update(result) {
        const view = this._view;
        const priorExtent = view.extent || view.height;
        view.group.position.y = 0;
        result.bones.forEach((b, i) => {
            const parent = b.parent >= 0 ? result.bones[b.parent].head : [0, 0, 0];
            const bone = view.bones[i];
            bone.position.set(b.head[0] - parent[0], b.head[1] - parent[1], b.head[2] - parent[2]);
            bone.quaternion.identity();
            bone.userData.rest.p.copy(bone.position);
        });
        view.group.updateMatrixWorld(true);
        view.skeleton.calculateInverses();
        result.parts.forEach((part, k) => {
            const mesh = view.meshes[k], g = mesh.geometry;
            if (part.emissive) {
                mesh.material.emissive.set(part.emissive);
                mesh.material.emissiveIntensity = Number.isFinite(part.emissiveIntensity) ? Math.max(0,part.emissiveIntensity) : 1;
            }
            g.getAttribute('position').array.set(part.positions); g.getAttribute('position').needsUpdate = true;
            g.getAttribute('normal').array.set(part.normals); g.getAttribute('normal').needsUpdate = true;
            // A new build may have the same counts with a different coat atlas, triangle order or
            // skinning. Keeping the old buffers scrambled pictures and left reused parts on old bones.
            for (const [name, data] of [['uv', part.uvs], ['uv1', part.uvs1], ['skinIndex', part.joints], ['skinWeight', part.weights]]) {
                const attribute = g.getAttribute(name);
                if (!attribute || !data) continue;
                if (attribute.array.some((q, i) => q !== data[i])) { attribute.array.set(data); attribute.needsUpdate = true; }
            }
            if (g.index.array.some((q, i) => q !== part.index[i])) { g.index.array.set(part.index); g.index.needsUpdate = true; }
            const c = g.getAttribute('color');
            // Shading worked out for the last shape stays until this one's comes: it hardly differs.
            if (c && part.colors && part.colors.length === c.array.length && (!part.texture || part.keepColors)) { c.array.set(part.colors); c.needsUpdate = true; }
            // A reused topology can change from a small fish to a whale. Both
            // BufferGeometry and SkinnedMesh cache bounds independently.
            g.boundingBox = null;
            if ('boundingBox' in mesh) mesh.boundingBox = null;
            if ('boundingSphere' in mesh) mesh.boundingSphere = null;
            g.computeBoundingSphere();
        });
        view.boneDefs = result.bones;
        view.idleClip = result.clips?.[0] || null;
        view.bodySkin = result.parts.find(p => p.name === 'Body') || null;
        this._restHeights(result.bones);
        const box = new THREE.Box3().setFromObject(view.group);
        view.height = Math.max(0.2, result.height);
        view.bodyHeight = result.bodyHeight || result.height;
        this._faceFrame(result);
        view.depth = box.max.z;
        view.bodyCenter = box.getCenter(new THREE.Vector3()).toArray();
        view.extent = Math.max(view.height, box.max.x - box.min.x, box.max.z - box.min.z);
        view.blob.scale.set(Math.max(0.25, (box.max.x - box.min.x) * 0.55), Math.max(0.25, (box.max.z - box.min.z) * 0.75 + 0.08), 1);
        view.blob.position.x = (box.max.x + box.min.x) / 2; view.blob.position.z = (box.max.z + box.min.z) / 2;
        // Motion keys, including human Idle, belong to the build's dimensions.
        // Rebind them before drawing: the old mixer can skip constant turns
        // after the temporary standing rig used to calculate inverse binds.
        if (view.actions?.size) {
            const old = [...view.actions.values()].map(a => a.action);
            view.actions.clear();
            this._syncPose();
            for (const a of old) if (a !== view.action) view.mixer.uncacheClip(a.getClip());
        } else this._resumePose();
        if (priorExtent && Math.abs(Math.log(view.extent / priorExtent)) > 0.35) this._frame('body');
        else { this._aim(); this._draw(); }
    }

    /** The pose playing laid on the skeleton at its current time and stood on the floor, before a draw. */
    _resumePose() {
        const view = this._view;
        if (!view || !view.action || !view.mixer) return;
        this._restorePreviewRig();
        view.mixer.update(0);
        this._plant();
        this._attachHeldPreview();
    }

    _show(result) {
        const view = this._view;
        // The same structure as what is shown: moved in place.
        const structure = this._structure(result);
        if (view.structure === structure && view.meshes.length) { this._swapTextures(result); this._update(result); return; }
        const time = view.action ? view.action.time : 0;
        this._clearModel();
        view.structure = structure;
        const bones = result.bones.map(b => { const bone = new THREE.Bone(); bone.name = b.name; return bone; });
        result.bones.forEach((b, i) => {
            const parent = b.parent >= 0 ? result.bones[b.parent].head : [0, 0, 0];
            bones[i].position.set(b.head[0] - parent[0], b.head[1] - parent[1], b.head[2] - parent[2]);
            bones[i].userData.rest = { p: bones[i].position.clone() };
            if (b.parent >= 0) bones[b.parent].add(bones[i]); else view.group.add(bones[i]);
        });
        view.group.updateMatrixWorld(true);
        const skeleton = new THREE.Skeleton(bones);
        for (const part of result.parts) {
            const g = new THREE.BufferGeometry();
            g.setAttribute('position', new THREE.BufferAttribute(Float32Array.from(part.positions), 3));
            g.setAttribute('normal', new THREE.BufferAttribute(Float32Array.from(part.normals), 3));
            if (part.uvs) g.setAttribute('uv', new THREE.BufferAttribute(Float32Array.from(part.uvs), 2));
            // A cloth's tiles (RRCharacterFabric) on their own coordinates, as the saved file's TEXCOORD_1.
            if (part.uvs1) g.setAttribute('uv1', new THREE.BufferAttribute(Float32Array.from(part.uvs1), 2));
            if (part.colors) g.setAttribute('color', new THREE.BufferAttribute(Float32Array.from(part.colors), 3));
            // The strand's direction, for highlights that run along the hair.
            if (part.tangents && part.tangents.length === part.positions.length) {
                const t4 = new Float32Array(part.positions.length / 3 * 4);
                for (let i = 0; i < t4.length / 4; i++) { t4[i * 4] = part.tangents[i * 3]; t4[i * 4 + 1] = part.tangents[i * 3 + 1]; t4[i * 4 + 2] = part.tangents[i * 3 + 2]; t4[i * 4 + 3] = 1; }
                g.setAttribute('tangent', new THREE.BufferAttribute(t4, 4));
            }
            g.setAttribute('skinIndex', new THREE.BufferAttribute(Uint16Array.from(part.joints), 4));
            g.setAttribute('skinWeight', new THREE.BufferAttribute(Float32Array.from(part.weights), 4));
            g.setIndex(new THREE.BufferAttribute(Uint32Array.from(part.index), 1));
            const mesh = new THREE.SkinnedMesh(g, this._material(part, result, null, view.scene));
            mesh.frustumCulled = false;
            // Hair finer than the shadow's own texels (body hair, brows, lashes) casts none.
            mesh.castShadow = !part.onSkin && part.name !== 'Lashes';
            mesh.receiveShadow = true;
            mesh.bind(skeleton);
            view.group.add(mesh);
            view.meshes.push(mesh);
        }
        view.bones = bones;
        view.skeleton = skeleton;
        // The poses' clips are made when first chosen (_poseAction); the one playing carries on from its time.
        view.mixer = new THREE.AnimationMixer(view.group);
        view.idleClip = (result.clips && result.clips[0]) || null;
        view.boneDefs = result.bones;
        // The body's skin at rest, so a pose's arms keep out of this body's trunk.
        view.bodySkin = result.parts.find(p => p.name === 'Body') || null;
        view.actions = new Map();
        view.resumeAt = time;
        this._restHeights(result.bones);
        // Frame what was built: its height, and for a creature its length.
        const box = new THREE.Box3().setFromObject(view.group);
        // A new body plan, or a body far bigger or smaller than the last, is framed afresh.
        const firstFrame = !view.height || view.plan !== result.plan || Math.abs(Math.log(Math.max(0.2, result.height) / view.height)) > 0.35;
        view.plan = result.plan;
        view.height = Math.max(0.2, result.height);
        view.bodyHeight = result.bodyHeight || result.height;
        this._faceFrame(result);
        view.depth = box.max.z;
        view.bodyCenter = box.getCenter(new THREE.Vector3()).toArray();
        view.extent = Math.max(view.height, box.max.x - box.min.x, box.max.z - box.min.z);
        if (firstFrame) this._frame('body');
        if (view.key.castShadow) {
            // Closed animal cloth shells are much thinner than a shadow texel.
            // Their two faces otherwise produce dark triangle bands on dense
            // coats. Keep the ordinary face/contact bias for other models.
            const tack=result.parts.some(p=>p.name.startsWith('Gear ')&&p.doubleSided);
            view.key.shadow.bias=tack?-.002:-.0003;
            view.key.shadow.normalBias=tack?.004:.035;
            const c = view.key.shadow.camera, r = view.extent * 0.75 + 0.2, mid = new THREE.Vector3(0, view.height / 2, 0);
            view.key.target.position.copy(mid);
            view.key.position.copy(mid).add(new THREE.Vector3(1.6, 3.2, 2.4).normalize().multiplyScalar(r * 3));
            c.left = -r; c.right = r; c.top = r; c.bottom = -r; c.near = 0.1; c.far = r * 6;
            c.updateProjectionMatrix();
        }
        // The contact shadow as wide as what stands on it.
        view.blob.scale.set(Math.max(0.25, (box.max.x - box.min.x) * 0.55), Math.max(0.25, (box.max.z - box.min.z) * 0.75 + 0.08), 1);
        view.blob.position.x = (box.max.x + box.min.x) / 2; view.blob.position.z = (box.max.z + box.min.z) / 2;
        this._aim();
        this._syncPose();
        this._syncHeldPreview();
    }

    /**
     * Shading (occlusion baked into the colors) waits until the sliders rest:
     * a fraction of a second, too long for every frame of a drag.
     */
    _queueShading() {
        clearTimeout(this._shadeTimer);
        this._shadingOwed = false;
        this._shadeTimer = setTimeout(() => {
            if (this._previewPaused) { this._shadingOwed = true; return; }
            const result = this._result, view = this._view;
            if (!result || !view || result.shaded) return;
            const apply = ao => {
                if (this._result !== result || !this._view) return;
                RRCharacterShading.chestFromBody(result.parts, ao, this.pack);
                RRCharacterShading.headFromBody(result.parts, ao, this.pack);
                result.parts.forEach((p, k) => { if (p.kind === 'eye' || p.name === 'Eyes') delete ao[k]; });
                const shaded = RRCharacterShading.applyOcclusion(result.parts, ao);
                shaded.forEach((part, k) => {
                    result.parts[k] = part;
                    const mesh = view.meshes[k];
                    if (!mesh || !part.colors) return;
                    mesh.geometry.setAttribute('color', new THREE.BufferAttribute(Float32Array.from(part.colors), 3));
                    if (!mesh.material.vertexColors) { mesh.material.vertexColors = true; mesh.material.needsUpdate = true; }
                });
                result.shaded = true;
                this._draw();
            };
            // In a worker, so the page never stops while the shading is worked out.
            const worker = this._shadingWorker();
            if (!worker) { apply(RRCharacterShading.ambientOcclusion(result.parts)); return; }
            const id = (this._shadeJob = (this._shadeJob || 0) + 1);
            const parts = result.parts.map(p => (p.noShade ? { positions: new Float32Array(0), normals: new Float32Array(0), index: new Uint32Array(0) } : { positions: Float32Array.from(p.positions), normals: Float32Array.from(p.normals), index: Uint32Array.from(p.index), doubleSided: !!p.doubleSided }));
            worker.onmessage = e => { if (e.data.id === id) apply(e.data.ao); };
            worker.postMessage({ id, parts });
        }, 300);
    }

    /** Tints the body's material from the skin it shows toward `hex`; false when there is nothing to tint. */
    _tintSkin(hex) {
        const view = this._view, mesh = view && view.meshes[0], painted = this._result && this._result.recipe.skin;
        if (!mesh || !painted || this.recipe.plan === 'quadruped') return false;
        const a = new THREE.Color(painted), b = new THREE.Color(hex);
        mesh.material.color.setRGB(Math.min(4, b.r / Math.max(0.02, a.r)), Math.min(4, b.g / Math.max(0.02, a.g)), Math.min(4, b.b / Math.max(0.02, a.b)));
        if (!mesh.material.userData.tinted) mesh.material.userData.tintFrom = this.cache.skinKey;
        mesh.material.userData.tinted = true;
        this._draw();
        return true;
    }

    /**
     * The skin is painted off the page: a picture is a second or more of work
     * at full size. Asked for a skin it has, the painter hands it over;
     * otherwise it starts on it (the latest asked for only) and the view is
     * built again when it is done.
     */
    _paintSkin(key, args) {
        const P = this._painter || (this._painter = { ready: new Map(), busy: null, next: null });
        if (P.ready.has(key)) return P.ready.get(key);
        const worker = this._skinWorker();
        if (!worker) return null;
        P.next = { key, args };
        this._pumpPainter();
        return null;
    }

    _pumpPainter() {
        if (this._previewPaused) return;
        const P = this._painter;
        if (!P || P.busy || !P.next) return;
        const worker = this._skinWorker();
        if (!worker) return;
        const job = P.busy = P.next;
        P.next = null;
        worker.onmessage = e => {
            const { key, width, height, data, normal } = e.data;
            P.busy = null;
            // Only the newest few are kept.
            P.ready.set(key, this._unpackSkin ? this._unpackSkin(e.data) : { width, height, data: new Uint8Array(data), name: 'skin.png',...(normal?{normal:{...normal,data:new Uint8Array(normal.data)}}:{}) });
            while (P.ready.size > 4) P.ready.delete(P.ready.keys().next().value);
            if (P.next) this._pumpPainter();
            else this._queueRebuild();
        };
        // A paint that throws answers nothing: the painter is freed (the skin keeps its tint) so the next ask is painted.
        worker.onerror = event => {
            console.warn('[Character3DBuilder] skin painter failed', event && event.message);
            if (P.busy === job) P.busy = null;
            if (P.next) this._pumpPainter();
        };
        worker.postMessage({ key: job.key, args: job.args });
    }

    /** One skin painted by a painter of its own, for Save (the view's painter keeps its queue). */
    _paintSkinNow(args) {
        return new Promise(resolve => {
            const keep = this._skinWorkerRef;
            this._skinWorkerRef = undefined;
            const worker = this._skinWorker();
            this._skinWorkerRef = keep;
            if (!worker) { resolve(null); return; }
            worker.onmessage = e => { const normal=e.data.normal;resolve(this._unpackSkin ? this._unpackSkin(e.data) : { width: e.data.width, height: e.data.height, data: new Uint8Array(e.data.data), name: 'skin.png',...(normal?{normal:{...normal,data:new Uint8Array(normal.data)}}:{}) }); worker.terminate(); };
            worker.onerror = () => { resolve(null); worker.terminate(); };
            worker.postMessage({ key: 'save', args });
        });
    }

    /** The skin painter: the body's own modules and data, loaded into a worker once. */
    _skinWorker() {
        if (this._skinWorkerRef !== undefined) return this._skinWorkerRef;
        if (!(typeof process !== 'undefined' && process.versions?.node)) return (this._skinWorkerRef = null);
        try {
            const fs = require('fs'), path = require('path');
            const dir = path.join(RRHumanBody.dataFolder(), '..');
            // Body art (CharacterBodyArtMotifs, CharacterBodyArt): tattoos, paint and scars painted with the skin, and their finer charts.
            const code = ['HumanTargets', 'FaceFieldData', 'HeadMeshData', 'HumanBody', 'CharacterOutfit', 'CharacterHair', 'CharacterBodyArtMotifs', 'CharacterBodyArt', 'CharacterSkin', 'CharacterExpressions'].filter(f => fs.existsSync(path.join(dir, f + '.js'))).map(f => fs.readFileSync(path.join(dir, f + '.js'), 'utf8')).join('\n;\n') + `
                let pack = null;
                self.onmessage = e => {
                    if (e.data.init) { pack = self.RRHumanBody.openPack(e.data.json, new Uint8Array(e.data.bin)); pack._expressionUnits = e.data.units; return; }
                    const a = e.data.args, t = self.RRCharacterSkin.paint(pack, a.skin, a.pattern, a.options), list = [];
                    const pk = q => { if (!q) return null; list.push(q.data.buffer); return { width: q.width, height: q.height, name: q.name, data: q.data.buffer }; };
                    const normal = pk(t.normal), emissive = pk(t.emissive);
                    const detail = t.detail ? Object.assign(pk(t.detail), { normal: pk(t.detail.normal), emissive: pk(t.detail.emissive), layout: t.detail.layout }) : null;
                    self.postMessage({ key: e.data.key, width: t.width, height: t.height, data: t.data.buffer, normal, emissive, detail }, [t.data.buffer, ...list]);
                };`;
            const worker = (() => { const url = URL.createObjectURL(new Blob([code], { type: 'text/javascript' })); const made = new Worker(url); URL.revokeObjectURL(url); return made; })();
            const data = RRHumanBody.dataFolder();
            const bin = fs.readFileSync(path.join(data, 'human.bin'));
            const buffer = bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength);
            // The painter's anatomical rest field must use the same closed
            // mouth and head schema as the page and full model worker.
            const units = window.RRCharacterExpressions?.units(this.pack);
            worker.postMessage({ init: true, json: JSON.parse(fs.readFileSync(path.join(data, 'human.json'), 'utf8')), bin: buffer, units }, [buffer]);
            this._skinWorkerRef = worker;
        } catch (error) {
            console.warn('[Character3DBuilder] skin painter', error);
            this._skinWorkerRef = null;
        }
        return this._skinWorkerRef;
    }

    /** The shading worker: CharacterShading.js itself, run off the page. */
    _shadingWorker() {
        if (this._worker !== undefined) return this._worker;
        if (!(typeof process !== 'undefined' && process.versions?.node)) return (this._worker = null);
        try {
            const fs = require('fs'), path = require('path');
            const file = [path.join(RRHumanBody.dataFolder(), '..', 'CharacterShading.js')].find(f => fs.existsSync(f));
            const source = fs.readFileSync(file, 'utf8') + `
                self.onmessage = e => { const ao = self.RRCharacterShading.ambientOcclusion(e.data.parts); self.postMessage({ id: e.data.id, ao }); };`;
            this._worker = (() => { const url = URL.createObjectURL(new Blob([source.replace("typeof window !== 'undefined' ? window : globalThis", 'self')], { type: 'text/javascript' })); const made = new Worker(url); URL.revokeObjectURL(url); return made; })();
        } catch (error) {
            console.warn('[Character3DBuilder] shading worker', error);
            this._worker = null;
        }
        return this._worker;
    }

    // ── files ──────────────────────────────────────────────────────────────
    _folderName(name) {
        return String(name || '').trim().replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, ' ').slice(0, 48);
    }

    _charactersDir() {
        const project = this._project();
        return project ? require('path').join(project.path, '3d', 'Characters') : null;
    }

    /**
     * Designs kept in the Forge (Save Design): a character's settings and its picture, no model, in groups of the
     * author's own. They live under forge/character_3d/characters/ (a group is a folder there), apart from 3d/,
     * where every folder is a model the 3D Models page lists.
     */
    _designsDir(group = '') {
        const project = this._project();
        if (!project) return null;
        const path = require('path'), base = path.join(project.path, 'forge', 'character_3d', 'characters');
        return group ? path.join(base, group) : base;
    }

    /** The groups made so far, by name. */
    _designGroups() {
        const fs = require('fs'), dir = this._designsDir();
        if (!dir || !fs.existsSync(dir)) return [];
        return fs.readdirSync(dir, { withFileTypes: true }).filter(e => e.isDirectory()).map(e => e.name).sort((a, b) => a.localeCompare(b));
    }

    _designNames(group = '') {
        const fs = require('fs'), dir = this._designsDir(group);
        if (!dir || !fs.existsSync(dir)) return [];
        return fs.readdirSync(dir).filter(f => /\.json$/i.test(f)).map(f => f.replace(/\.json$/i, '')).sort((a, b) => a.localeCompare(b));
    }

    /** The toolbar's Group choice: no group, every group made, and a new one. */
    _renderDesignGroups() {
        const select = this.root?.querySelector('.rr-c3d-design-group');
        if (!select) return;
        const groups = this._designGroups();
        if (this.designGroup && !groups.includes(this.designGroup)) groups.push(this.designGroup);
        select.innerHTML = `<option value="">${rrEscapeHtml(this._t('No Group'))}</option>`
            + groups.map(g => `<option value="${rrEscapeHtml(g)}">${rrEscapeHtml(g)}</option>`).join('')
            + `<option value="::new::">${rrEscapeHtml(this._t('New Group'))}</option>`;
        select.value = this.designGroup || '';
    }

    async _chooseDesignGroup(value) {
        // ("::new::": a value no group's folder can be named. It was a NUL character, which markup cannot carry: the
        // browser put U+FFFD there, this test never matched, and New Group made a group named "\uFFFDnew" unasked.)
        if (value === '::new::') {
            const name = this._folderName(await RRDialog.prompt(this._t('Name the new group:'), { title: this._t('New Group'), value: '' }));
            if (name) this.designGroup = name;
        } else this.designGroup = value || '';
        this._renderDesignGroups();
    }

    /** Keep the character's settings in the Forge under its name, in the chosen group: opened again from Open, nothing built. */
    async saveDesign() {
        if (!this._project()) return;
        // The design's picture is taken from the view, which a sheet being drawn holds in one of its own poses.
        if (this._sheetExporting) { this._status(this._t('The sprite sheet is being drawn. Try again in a moment.'), 'error'); return; }
        const fs = require('fs'), path = require('path');
        let name = this._folderName(this.name);
        if (!name) {
            name = this._folderName(await RRDialog.prompt(this._t('Name this character:'), { title: this._t('Save Design'), value: this._t('Villager') }));
            if (!name) return;
            this.name = name;
            const input = this.root.querySelector('.rr-c3d-name-input');
            if (input) input.value = name;
        }
        const group = this.designGroup || '', dir = this._designsDir(group), file = path.join(dir, name + '.json');
        if (fs.existsSync(file) && !(this._openedDesign && this._openedDesign.group === group && this._openedDesign.name === name)
            && !await RRDialog.confirm(this._t('Replace the design {name}?', { name }), { title: this._t('Save Design'), ok: this._t('Replace'), danger: true })) return;
        try {
            const atomic = window.RRWriteFileAtomicSync || ((io, target, data) => io.writeFileSync(target, data));
            fs.mkdirSync(dir, { recursive: true });
            atomic(fs, file, JSON.stringify({ builder: 'character3d', version: 2, recipe: this.recipe }, null, 2) + '\n');
            const thumb = this._thumbnail();
            if (thumb) atomic(fs, path.join(dir, name + '.png'), thumb);
            // Opened from another group (or under another name) and saved here: it moved, it isn't copied.
            const was = this._openedDesign;
            if (was && (was.group !== group || was.name !== name) && was.name === name) {
                for (const ext of ['.json', '.png']) fs.rmSync(path.join(this._designsDir(was.group), name + ext), { force: true });
            }
            this._openedDesign = { group, name };
            this._renderDesignGroups();
            this._status(this._t('Design {name} saved.', { name }), 'ok');
        } catch (error) {
            console.error('[Character3DBuilder] save design', error);
            this._status(this._t('{name} could not be saved.', { name }), 'error');
        }
    }

    _openDesign(group, name) {
        const fs = require('fs'), path = require('path');
        try {
            const data = JSON.parse(fs.readFileSync(path.join(this._designsDir(group), name + '.json'), 'utf8'));
            this._openRecord(name, data);
            this._openedDesign = { group, name };
            this.designGroup = group;
            this._renderDesignGroups();
        } catch (error) {
            console.error('[Character3DBuilder] open design', error);
            this._status(this._t('{name} could not be opened.', { name }), 'error');
        }
    }

    async _deleteDesign(group, name) {
        if (!await RRDialog.confirm(this._t('Delete the design {name}?', { name }), { title: this._t('Save Design'), ok: this._t('Delete'), danger: true })) return false;
        const fs = require('fs'), path = require('path');
        for (const ext of ['.json', '.png']) fs.rmSync(path.join(this._designsDir(group), name + ext), { force: true });
        if (this._openedDesign && this._openedDesign.group === group && this._openedDesign.name === name) this._openedDesign = null;
        return true;
    }

    _savedNames() {
        const fs = require('fs'), path = require('path');
        const dir = this._charactersDir();
        if (!dir || !fs.existsSync(dir)) return [];
        return fs.readdirSync(dir, { withFileTypes: true })
            .filter(e => e.isDirectory() && fs.existsSync(path.join(dir, e.name, 'character.json')))
            .map(e => e.name).sort((a, b) => a.localeCompare(b));
    }

    /** Saved characters as pictures to pick from: the designs kept in the Forge by group, then the models exported to the project. */
    _showGallery() {
        const fs = require('fs'), path = require('path');
        const box = this.root.querySelector('.rr-c3d-gallery');
        const picture = file => fs.existsSync(file) ? 'data:image/png;base64,' + fs.readFileSync(file).toString('base64') : '';
        const card = (name, src, kind, group = '') => `<div class="rr-c3d-saved-card"><button class="rr-c3d-saved" data-name="${rrEscapeHtml(name)}" data-kind="${kind}" data-group="${rrEscapeHtml(group)}">${src ? `<img src="${src}" alt="">` : '<span class="rr-c3d-nothumb">?</span>'}<span>${rrEscapeHtml(name)}</span></button>`
            + (kind === 'design' ? `<button class="rr-c3d-saved-delete" data-delete="${rrEscapeHtml(name)}" data-group="${rrEscapeHtml(group)}" title="${this._t('Delete')}">✕</button>` : '') + '</div>';
        const designs = group => this._designNames(group).map(name => card(name, picture(path.join(this._designsDir(group), name + '.png')), 'design', group)).join('');
        const loose = designs(''), groups = this._designGroups().map(group => ({ group, cards: designs(group) }));
        const models = this._savedNames().map(name => card(name, picture(path.join(this._charactersDir(), name, 'thumbnail.png')), 'model')).join('');
        const section = (title, cards, empty) => `<div class="rr-c3d-gallery-sub">${rrEscapeHtml(title)}</div><div class="rr-c3d-gallery-grid">${cards || `<p class="rr-c3d-note">${empty}</p>`}</div>`;
        const none = !loose && !groups.some(g => g.cards);
        box.innerHTML = `<div class="rr-c3d-gallery-head"><span>${this._t('Open a saved character')}</span><button class="rr-c3d-remove" data-close title="${this._t('Close')}">✕</button></div>
            <div class="rr-c3d-gallery-scroll">`
            + (none ? section(this._t('Designs'), '', this._t('No designs yet. Save Design keeps a character here without making a model.'))
                : (loose ? section(this._t('Designs'), loose) : '') + groups.filter(g => g.cards).map(g => section(g.group, g.cards)).join(''))
            + section(this._t('Exported Models'), models, this._t('No models exported from this project yet. Export Model To Project puts one here.'))
            + '</div>';
        // One Escape listener however often the gallery is shown: the one before goes first, and `detach` takes the last.
        this._galleryClose?.();
        box.hidden = false;
        const close = () => { box.hidden = true; document.removeEventListener('keydown', onKey, true); if (this._galleryClose === close) this._galleryClose = null; };
        const onKey = e => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
        document.addEventListener('keydown', onKey, true);
        this._galleryClose = close;
        box.onclick = e => {
            if (e.target.closest('[data-close]')) { close(); return; }
            const remove = e.target.closest('[data-delete]');
            if (remove) {
                this._deleteDesign(remove.dataset.group || '', remove.dataset.delete).then(done => {
                    if (!done || box.hidden) return;
                    // Only the deleted card goes; every picture is read again only when its section is left empty.
                    const gone = remove.closest('.rr-c3d-saved-card'), grid = gone && gone.parentElement;
                    if (grid && grid.children.length > 1) gone.remove(); else this._showGallery();
                });
                return;
            }
            const card = e.target.closest('.rr-c3d-saved');
            if (!card) return;
            close();
            if (card.dataset.kind === 'design') this._openDesign(card.dataset.group || '', card.dataset.name);
            else this._openSaved(card.dataset.name);
        };
    }

    /** Bind project-outfit deletion and undo within this builder's panel. */
    _bindOutfitActions() {
        if (!this.root || this._outfitActionRoot === this.root) return;
        this._outfitActionRoot = this.root;
        this.root.addEventListener('click', event => {
            const emblem = event.target.closest('[data-outfit-emblem]'), clear = event.target.closest('[data-outfit-emblem-clear]');
            if (emblem || clear) {
                event.preventDefault(); event.stopPropagation();
                if (emblem) this._chooseOutfitPicture(+emblem.dataset.outfitEmblem);
                else {
                    const r = JSON.parse(JSON.stringify(this.recipe));
                    if (r.outfit[+clear.dataset.outfitEmblemClear]) { delete r.outfit[+clear.dataset.outfitEmblemClear].emblemPicture; this._replace(r); }
                }
                return;
            }
            const remove = event.target.closest('[data-outfit-delete]');
            const undo = event.target.closest('[data-outfit-undo]');
            if (!remove && !undo) return;
            event.preventDefault(); event.stopPropagation();
            if (remove) this._deleteTakenOutfit(remove.dataset.outfitDelete);
            else this._undoTakenOutfit();
        });
        this.root.addEventListener('contextmenu', event => {
            const card = event.target.closest('[data-user-outfit]');
            if (!card) return;
            event.preventDefault(); event.stopPropagation();
            this._deleteTakenOutfit(card.dataset.userOutfit);
        });
    }

    /**
     * What an outfit emblem shows, for its row: the chosen project picture,
     * or the built-in shield with its star in the garment's second color and
     * trim (as RRCharacterAtlas paints it).
     */
    _emblemThumb(item) {
        const project = this._project(), assets = window.RRAssetFiles, name = item.emblemPicture;
        if (name && project && assets) { try { return assets.imageUrlFor(require('path').join(project.path, 'img', 'pictures'), name); } catch (error) { /* the built-in emblem instead */ } }
        const hex = (v, d) => (/^#[0-9a-f]{6}$/i.test(String(v || '')) ? v : d), field = hex(item.color2, '#3a3d44'), trim = hex(item.trim, '#d5b767');
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M4 3h16v9c0 5-4 8-8 10-4-2-8-5-8-10z" fill="${field}" stroke="${trim}" stroke-width="2"/><path d="M12 6.5l1.6 3.4 3.7.4-2.8 2.5.8 3.7-3.3-1.9-3.3 1.9.8-3.7-2.8-2.5 3.7-.4z" fill="${trim}"/></svg>`;
        return 'data:image/svg+xml,' + encodeURIComponent(svg);
    }

    /** Choose a validated project picture; recipes keep only its relative asset reference. */
    _chooseOutfitPicture(index) {
        const project = this._project(), item = this.recipe.outfit[index], assets = window.RRAssetFiles, picker = window.reactor?.databaseEditorUI;
        if (!project || !item || !assets || !picker?.showImagePicker) return;
        const folder = require('path').join(project.path, 'img', 'pictures');
        const files = assets.listImageReferences(folder);
        if (!files.length) { RRDialog.alert(this._t('No pictures in img/pictures yet. Add one there to use it here.'), { title: this._t('Emblem picture') }); return; }
        const before = JSON.stringify(item);
        picker.showImagePicker(this._t('Choose a picture'), files, reference => {
            if (!reference || this._project()?.path !== project.path || JSON.stringify(this.recipe.outfit[index]) !== before || !assets.findImage(folder, reference)) return;
            this._emblemFailed?.delete(reference);
            const r = JSON.parse(JSON.stringify(this.recipe));
            r.outfit[index].emblemPicture = reference;
            this._replace(r);
        }, reference => assets.imageUrlFor(folder, reference), item.emblemPicture || undefined, { selectButtonLabel: this._t('Use This Picture'), zIndex: 10500 });
    }

    _chooseMarkPicture(path) {
        const project=this._project(),assets=window.RRAssetFiles,picker=window.reactor?.databaseEditorUI;
        if(!project||!assets||!picker?.showImagePicker)return;
        const folder=require('path').join(project.path,'img','pictures'),files=assets.listImageReferences(folder);
        if(!files.length){RRDialog.alert(this._t('No pictures in img/pictures yet. Add one there to use it here.'),{title:this._t('Emblem picture')});return;}
        const before=JSON.stringify(this._get(path));
        picker.showImagePicker(this._t('Choose a picture'),files,reference=>{
            if(!reference||this._project()?.path!==project.path||JSON.stringify(this._get(path))!==before||!assets.findImage(folder,reference))return;
            this._emblemFailed?.delete(reference);this._set(path+'.picture',reference);this._commit();this._renderPanel();this._queueRebuild();
        },reference=>assets.imageUrlFor(folder,reference),this._get(path+'.picture')||undefined,{selectButtonLabel:this._t('Use This Picture'),zIndex:10500});
    }

    /** Decode small emblem rasters once per project, shared by preview and save atlases. */
    _loadOutfitEmblems(recipe = this.recipe) {
        const project = this._project(), assets = window.RRAssetFiles;
        if (!project || !assets) return Promise.resolve([]);
        if (this._emblemProject !== project.path) {
            this._emblemProject = project.path;
            this._emblemPictures = new Map(); this._emblemPending = new Map(); this._emblemFailed = new Set();
        }
        const pictures = this._emblemPictures;
        const share = () => {
            this.cache.wardrobe = this.cache.wardrobe || {};
            const cache = this.cache.wardrobe;
            if (cache.emblemPictures !== pictures) delete cache.atlas;
            cache.emblemPictures = pictures;
            return [cache];
        };
        share();
        const folder = require('path').join(project.path, 'img', 'pictures');
        const emblemItems=[...(recipe.outfit||[]),...(recipe.props||[])].flatMap(i=>[...(i.pattern==='emblem'?[{emblemPicture:i.emblemPicture}]:[]),...(i.mark?.shape==='picture'?[{emblemPicture:i.mark.picture}]:[])]);
        for (const item of emblemItems) {
            const name = item.emblemPicture;
            if (typeof name !== 'string' || !name || pictures.has(name) || this._emblemPending.has(name) || this._emblemFailed.has(name)) continue;
            if (/^(?:[a-z]+:|[\\/])/i.test(name) || name.replace(/\\/g, '/').split('/').includes('..') || !assets.findImage(folder, name)) { this._emblemFailed.add(name); continue; }
            const pending = this._emblemPending, failed = this._emblemFailed, img = new Image();
            let resolveReady, settled = false, watchdog;
            const ready = new Promise(resolve => { resolveReady = resolve; });
            const finish = value => { if (settled) return; settled = true; clearTimeout(watchdog); resolveReady(value); };
            pending.set(name, ready);
            img.onload = () => {
                if (settled) return;
                pending.delete(name);
                if (this._project()?.path !== project.path || this._emblemPictures !== pictures || !this._view) { finish(false); return; }
                try {
                    const scale = Math.min(1, 1024 / Math.max(img.naturalWidth, img.naturalHeight));
                    const width = Math.max(1, Math.round(img.naturalWidth * scale)), height = Math.max(1, Math.round(img.naturalHeight * scale));
                    const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
                    const context = canvas.getContext('2d'); context.drawImage(img, 0, 0, width, height);
                    pictures.set(name, { width, height, data: new Uint8Array(context.getImageData(0, 0, width, height).data.buffer) });
                    const active = new Set([...(this.recipe.outfit||[]),...(recipe.outfit||[]),...(this.recipe.props||[]),...(recipe.props||[])].flatMap(i=>[i.pattern==='emblem'?i.emblemPicture:'',i.mark?.shape==='picture'?i.mark.picture:'']).filter(Boolean));
                    for (const ref of pictures.keys()) { if (pictures.size <= 16) break; if (!active.has(ref)) pictures.delete(ref); }
                    for (const cache of share()) delete cache.atlas;
                    this._queueRebuild();
                    finish(true);
                } catch (error) { failed.add(name); this._status(this._t('{name} could not be opened.', { name }), 'error'); finish(false); }
            };
            img.onerror = () => { if (settled) return; pending.delete(name); failed.add(name); if (this._project()?.path === project.path) this._status(this._t('{name} could not be opened.', { name }), 'error'); finish(false); };
            watchdog = setTimeout(() => { img.onerror(); img.src = ''; }, 15000);
            try { img.src = assets.imageUrlFor(folder, name); } catch (error) { img.onerror(); }
        }
        return Promise.all(this._emblemPending.values());
    }

    async _deleteTakenOutfit(key) {
        const T = RRCharacterOutfitTransfer, W = RRCharacterWardrobe, project = this._project();
        const def = W.GARMENTS.find(g => g.transfer === key);
        if (!project || !def || !key.startsWith('project:')) return;
        const root = this.root;
        if (!await RRDialog.confirm(this._t('Delete {name}?', { name: def.label }), { title: this._t('Delete outfit'), ok: this._t('Delete'), danger: true })) return;
        if (this.root !== root || this._project()?.path !== project.path) return;
        try {
            const removed = this.recipe.outfit.map((item, index) => ({ item, index })).filter(({ item }) => W.BY_ID.get(item.id)?.transfer === key);
            const record = T.removeProject(W, project.path, key);
            this._outfitUndo = { record, removed, projectPath: project.path };
            const r = JSON.parse(JSON.stringify(this.recipe));
            const ids = new Set(removed.map(p => p.item.id));
            r.outfit = r.outfit.filter(item => !ids.has(item.id));
            this._replace(r);
            this._status(this._t('Deleted {name}.', { name: record.label }), 'ok');
        } catch (error) { console.error('[Character3DBuilder] delete outfit', error); this._status(error.message, 'error'); }
    }

    _undoTakenOutfit() {
        const undo = this._outfitUndo;
        if (!undo || undo.projectPath !== this._project()?.path) return;
        try {
            const id = undo.record.undo();
            if (!id) return;
            this._outfitUndo = null;
            const r = JSON.parse(JSON.stringify(this.recipe));
            for (const { item, index } of undo.removed) r.outfit.splice(Math.min(index, r.outfit.length), 0, Object.assign({}, item, { id }));
            this._replace(r);
            this._status(this._t('Restored {name}.', { name: undo.record.label }), 'ok');
        } catch (error) { console.error('[Character3DBuilder] restore outfit', error); this._status(error.message, 'error'); }
    }

    /** Fit an imported mesh in an expendable worker; closing the picker terminates it. */
    _computeOutfitImport(model, picture, recipe, parts, trackCancel) {
        return new Promise((resolve, reject) => {
            const fs = require('fs'), path = require('path');
            const dir = path.join(RRHumanBody.dataFolder(), '..');
            const code = ['HumanTargets', 'FaceFieldData', 'HumanBody', 'CharacterOutfit', 'CharacterSimplify', 'CharacterOutfitTransfer'].map(name => fs.readFileSync(path.join(dir, name + '.js'), 'utf8')).join('\n;\n') + `
                self.onmessage = e => {
                    try {
                        const a = e.data, pack = self.RRHumanBody.openPack(a.json, new Uint8Array(a.bin));
                        const outfit = self.RRCharacterOutfitTransfer.importModel(pack, a.model, a.picture, a.recipe, a.parts);
                        self.postMessage({ outfit });
                    } catch (error) { self.postMessage({ error: String(error && error.stack || error) }); }
                };`;
            const url = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
            let worker;
            const finish = (error, value) => { worker?.terminate(); URL.revokeObjectURL(url); trackCancel(null); error ? reject(error) : resolve(value); };
            try {
                worker = new Worker(url);
                trackCancel(() => finish(new Error('Outfit import canceled')));
                worker.onmessage = e => finish(e.data.error ? new Error(e.data.error) : null, e.data.outfit);
                worker.onerror = e => finish(new Error(e.message || 'Outfit worker failed'));
                const data = RRHumanBody.dataFolder(), bin = fs.readFileSync(path.join(data, 'human.bin'));
                const buffer = bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength);
                worker.postMessage({ json: JSON.parse(fs.readFileSync(path.join(data, 'human.json'), 'utf8')), bin: buffer, model, picture, recipe, parts }, [buffer]);
            } catch (error) { finish(error); }
        });
    }

    /** A model without a saved thumbnail is drawn once in the shared preview renderer. */
    async _importModelThumbnail(file) {
        const fs = require('fs'), projectPath = this._project()?.path, root = this.root;
        const key = file + ':' + fs.statSync(file).mtimeMs;
        const cache = this._importModelThumbs || (this._importModelThumbs = new Map());
        if (cache.has(key)) return cache.get(key);
        const model = RRCharacterOutfitTransfer.readModel(fs.readFileSync(file));
        if (!model?.image) return '';
        const bitmap = await createImageBitmap(new Blob([model.image.bytes], { type: model.image.mime }));
        if (this.root !== root || this._project()?.path !== projectPath || !this._view) { bitmap.close(); return ''; }
        const scale = Math.min(1, 512 / Math.max(bitmap.width, bitmap.height));
        const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale));
        const context = canvas.getContext('2d'); context.drawImage(bitmap, 0, 0, canvas.width, canvas.height); bitmap.close();
        const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
        const result = { height: 1, parts: [{ positions: model.positions, normals: RRCharacterOutfit.triangleNormals(model.positions, model.index),
            uvs: model.uvs, index: model.index, texture: 'model', doubleSided: true, roughness: model.roughness ?? 0.8 }],
            textures: { model: { width: canvas.width, height: canvas.height, data: new Uint8Array(pixels.data.buffer) } } };
        const view = this._view;
        const url = await this._renderThumb({ result, frame: 'body' }, () => this.root === root && this._project()?.path === projectPath && this._view === view);
        cache.set(key, url);
        while (cache.size > 24) cache.delete(cache.keys().next().value);
        return url;
    }

    /** Search the project's models and preview selected parts before keeping an outfit. */
    _showModels() {
        const T = RRCharacterOutfitTransfer, W = RRCharacterWardrobe, project = this._project();
        if (!project) return;
        this._closeOutfitImport?.();
        const importRoot = this.root;
        const box = this.root.querySelector('.rr-c3d-gallery');
        const models = T.listModels(project.path);
        const fs = require('fs');
        const cards = models.map((m, k) => {
            let src = '';
            if (m.thumbnail) { try { src = 'data:image/png;base64,' + fs.readFileSync(m.thumbnail).toString('base64'); } catch (error) { /* The model remains selectable without a thumbnail. */ } }
            return `<button class="rr-c3d-saved rr-c3d-import-model" data-model="${k}" title="${rrEscapeHtml(m.name)}">${src ? `<img src="${src}" alt="">` : '<span class="rr-c3d-nothumb">3D</span>'}<span>${rrEscapeHtml(m.name)}</span></button>`;
        }).join('');
        box.classList.add('rr-c3d-importer');
        box.innerHTML = `<div class="rr-c3d-gallery-head"><span>${this._t('Take outfit from a 3D model')}</span><button class="rr-c3d-remove" data-close title="${this._t('Close')}">✕</button></div>
            <input class="rr-c3d-import-search" type="search" placeholder="${this._t('Search models')}" aria-label="${this._t('Search models')}">
            <fieldset class="rr-c3d-import-parts"><legend>${this._t('Parts to take')}</legend>${T.IMPORT_PARTS.map(p => `<label><input type="checkbox" data-part="${p.id}" ${p.id === 'hands' ? '' : 'checked'}>${this._t(p.label)}</label>`).join('')}</fieldset>
            <div class="rr-c3d-gallery-grid">${cards || `<p class="rr-c3d-note">${this._t('No humanoid 3D models in this project.')}</p>`}</div>
            <div class="rr-c3d-import-progress" hidden><span></span><progress max="1" value="0"></progress></div>
            <div class="rr-c3d-import-actions" hidden><button class="rr-btn-chip" data-keep>${this._t('Keep outfit')}</button><button class="rr-btn-chip" data-discard>${this._t('Discard')}</button></div>`;
        box.hidden = false;
        const original = JSON.parse(JSON.stringify(this.recipe));
        let prepared = null, busy = false, closed = false, cancelCompute = null;
        const close = () => {
            if (closed) return;
            closed = true;
            cancelCompute?.();
            if (prepared?.state === 'prepared') {
                if (this.root === importRoot && this._project()?.path === project.path) this._replace(original);
                T.discardPrepared(W, prepared);
            }
            box.hidden = true;
            box.classList.remove('rr-c3d-importer', 'rr-c3d-import-ready');
            box.onclick = null; box.oninput = null; box.onchange = null;
            document.removeEventListener('keydown', onKey, true);
            if (this._closeOutfitImport === close) this._closeOutfitImport = null;
            if (this._resumeImportThumbnails === drawThumbnails) this._resumeImportThumbnails = null;
        };
        this._closeOutfitImport = close;
        const onKey = e => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
        document.addEventListener('keydown', onKey, true);
        box.oninput = e => {
            if (!e.target.matches('.rr-c3d-import-search')) return;
            const query = e.target.value.trim().toLocaleLowerCase();
            for (const card of box.querySelectorAll('[data-model]')) card.hidden = !models[+card.dataset.model].name.toLocaleLowerCase().includes(query);
        };
        box.onchange = () => {
            const any = [...box.querySelectorAll('[data-part]')].some(input => input.checked);
            for (const card of box.querySelectorAll('[data-model]')) card.disabled = busy || !any;
        };
        box.onclick = async e => {
            if (e.target.closest('[data-close], [data-discard]')) { close(); return; }
            if (e.target.closest('[data-keep]')) {
                if (!prepared || busy || this._project()?.path !== project.path) return;
                busy = true;
                const keep = box.querySelector('[data-keep]'); keep.disabled = true;
                try {
                    const thumb = await this._makeThumb({ key: 'dress:' + prepared.id, kind: 'dress', id: prepared.id, sig: this._thumbSig('dress') });
                    if (closed || this.root !== importRoot || this._project()?.path !== project.path) return;
                    const previewId = prepared.id;
                    const id = await T.keepPrepared(W, prepared, thumb);
                    if (closed || this.root !== importRoot || this._project()?.path !== project.path) { close(); return; }
                    const r = JSON.parse(JSON.stringify(this.recipe));
                    r.outfit = r.outfit.map(item => item.id === previewId ? Object.assign({}, item, { id }) : item);
                    this._replace(r);
                    this._status(this._t('Took the outfit off {name}.', { name: prepared.label }), 'ok');
                    close();
                } catch (error) {
                    if (closed || this.root !== importRoot || this._project()?.path !== project.path || error.name === 'AbortError') return;
                    console.error('[Character3DBuilder] keep outfit', error); this._status(error.message, 'error'); keep.disabled = false;
                }
                finally { busy = false; }
                return;
            }
            const card = e.target.closest('[data-model]');
            if (!card || busy) return;
            const parts = [...box.querySelectorAll('[data-part]')].filter(input => input.checked).map(input => input.dataset.part);
            if (!parts.length) return;
            busy = true;
            for (const input of box.querySelectorAll('input, [data-model]')) input.disabled = true;
            const progress = box.querySelector('.rr-c3d-import-progress'); progress.hidden = false;
            progress.querySelector('span').textContent = this._t('Preparing outfit…');
            const model = models[+card.dataset.model];
            try {
                prepared = await T.prepareFrom(this.pack, W, model.file, project.path, this.recipe, { parts,
                    compute: (model, picture, recipe, parts) => this._computeOutfitImport(model, picture, recipe, parts, cancel => { cancelCompute = cancel; }),
                    progress: (stage, value) => { progress.querySelector('progress').value = value; } });
                if (closed || this.root !== importRoot || this._project()?.path !== project.path) { T.discardPrepared(W, prepared); close(); return; }
                if (!prepared) { this._status(this._t('{name} has no outfit to take.', { name: model.name }), 'error'); close(); return; }
                const r = JSON.parse(JSON.stringify(original));
                r.outfit = (r.outfit || []).concat([{ id: prepared.id }]);
                this._replace(r);
                box.classList.add('rr-c3d-import-ready');
                progress.hidden = true;
                box.querySelector('.rr-c3d-import-actions').hidden = false;
                box.querySelector('.rr-c3d-gallery-head span').textContent = prepared.label;
            } catch (error) { if (!closed) { console.error('[Character3DBuilder] prepare outfit', error); this._status(this._t('The outfit could not be taken off {name}.', { name: model.name }), 'error'); close(); } }
            finally { busy = false; }
        };
        box.querySelector('.rr-c3d-import-search').focus();
        let thumbnailsRunning = false;
        const drawThumbnails = async () => {
            if (closed || busy || thumbnailsRunning || this._previewPaused) return;
            thumbnailsRunning = true;
            let retry = false;
            try {
                for (let index = 0; index < models.length; index++) {
                    if (closed || busy || this._previewPaused) return;
                    if (models[index].thumbnail || !box.querySelector(`[data-model="${index}"] .rr-c3d-nothumb`)) continue;
                    await new Promise(resolve => requestAnimationFrame(resolve));
                    if (closed || this._previewPaused) return;
                    const url = await this._importModelThumbnail(models[index].file);
                    if (closed || !url) return;
                    const placeholder = box.querySelector(`[data-model="${index}"] .rr-c3d-nothumb`);
                    if (placeholder) { const image = document.createElement('img'); image.src = url; image.alt = ''; placeholder.replaceWith(image); }
                }
            } catch (error) {
                if (error.name === 'AbortError') retry = true;
                else console.warn('[Character3DBuilder] model thumbnail', error);
            } finally {
                thumbnailsRunning = false;
                if (retry && !closed && !this._previewPaused) drawThumbnails();
            }
        };
        this._resumeImportThumbnails = drawThumbnails;
        drawThumbnails();
    }

    _openSaved(name) {
        const fs = require('fs'), path = require('path');
        try {
            this._openRecord(name, JSON.parse(fs.readFileSync(path.join(this._charactersDir(), name, 'character.json'), 'utf8')));
            // An exported model, not a design: a later Save Design must not take a design of the same name as this one's own.
            this._openedDesign = null;
        } catch (error) {
            console.error('[Character3DBuilder] open', error);
            this._status(this._t('{name} could not be opened.', { name }), 'error');
        }
    }

    /** A saved character's record (a model's character.json or a kept recipe) in the builder, under its name. */
    _openRecord(name, data) {
        this.name = name;
        const input = this.root.querySelector('.rr-c3d-name-input');
        if (input) input.value = name;
        const recipe = RRCharacterModel.normalize(data.recipe || data);
        // A recipe past the natural ranges opens with Extreme on, so its sliders reach its values.
        const extreme = this.extreme || JSON.stringify(RRHumanBody.naturalRecipe ? RRHumanBody.naturalRecipe(recipe) : recipe) !== JSON.stringify(RRHumanBody.normalizeRecipe(recipe));
        this._status(this._t('Opening {name}…', { name }));
        this._selectPreset(recipe, extreme);
        // Named by the recipe the builder took, so "Opened" is said when that one is shown (the build is a frame away).
        this._openingDesign = { name, recipe: JSON.stringify(this.recipe) };
    }

    /** A picture as PNG bytes. */
    _png(tex) {
        const c = document.createElement('canvas');
        c.width = tex.width; c.height = tex.height;
        c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(tex.data.buffer.slice(tex.data.byteOffset, tex.data.byteOffset + tex.data.byteLength)), tex.width, tex.height), 0, 0);
        return new Promise((resolve, reject) => c.toBlob(b => (b ? b.arrayBuffer().then(a => resolve(new Uint8Array(a)), reject) : reject(new Error('png'))), 'image/png'));
    }

    /** A square picture of the view as it stands now. */
    _thumbnail() {
        const view = this._view;
        if (!view) return null;
        this._render();
        const src = view.renderer.domElement, size = 256;
        const c = document.createElement('canvas');
        c.width = c.height = size;
        const s = Math.min(src.width, src.height);
        c.getContext('2d').drawImage(src, (src.width - s) / 2, (src.height - s) / 2, s, s, 0, 0, size, size);
        return Buffer.from(c.toDataURL('image/png').split(',')[1], 'base64');
    }

    async save() {
        this._stopPreviewTween();
        if (this._savingModel) return;
        if (this._sheetExporting) { this._status(this._t('The sprite sheet is being drawn. Try again in a moment.'), 'error'); return; }
        this._savingModel = true;
        try { await this._saveModel(); }
        finally { this._savingModel = false; }
    }

    async _saveModel() {
        const project = this._project();
        if (!project || !this.pack) return;
        const root = this.root, view = this._view, directory = this._charactersDir();
        const current = () => this.root === root && this._view === view && this._project()?.path === project.path;
        let name = this._folderName(this.name);
        if (!name) {
            name = this._folderName(await RRDialog.prompt(this._t('Name this character:'), { title: this._t('Export Model To Project'), value: this._t('Villager') }));
            if (!name || !current()) return;
            this.name = name;
            const input = this.root.querySelector('.rr-c3d-name-input');
            if (input) input.value = name;
        }
        const fs = require('fs'), path = require('path');
        const folder = path.join(directory, name);
        const file = path.join(folder, 'source', name + '.glb');
        if (fs.existsSync(file) && !await RRDialog.confirm(this._t('Replace the saved character {name}?', { name }), { title: this._t('Export Model To Project'), ok: this._t('Replace'), danger: true })) return;
        if (!current()) return;
        this._status(this._t('Saving…'));
        try {
            // One export describes one design, even if the controls change while
            // skin painting, cloth baking or PNG encoding yields to the editor.
            const recipe = JSON.parse(JSON.stringify(this.recipe)), motions = this.motions || 'useful';
            const eyeSource = this.eyeSource, bodyArtPictures = new Map(this._artPictures || []);
            const emblemPictures = new Map(this.cache?.wardrobe?.emblemPictures || []);
            const thumb = this._thumbnail();
            await this._loadOutfitEmblems?.(recipe);
            await this._loadArtPictures?.(recipe);
            if (!current()) return;
            for (const [name, picture] of this._artPictures || []) bodyArtPictures.set(name, picture);
            for (const [name, picture] of this.cache?.wardrobe?.emblemPictures || []) emblemPictures.set(name, picture);
            const requiredPictures=[...(recipe.outfit||[]),...(recipe.props||[])].flatMap(item=>[item.pattern==='emblem'?item.emblemPicture:'',item.mark?.shape==='picture'?item.mark.picture:'']).filter(Boolean);
            if(requiredPictures.some(name=>!emblemPictures.has(name)))throw new Error('Emblem picture could not be loaded.');
            const cache = { wardrobe: { emblemPictures } };
            // A full-quality build in its own cache, independent of later preview edits.
            // The full-size skin painted off the page first, then the file built with it.
            let wanted = null;
            RRCharacterModel.build(this.pack, recipe, cache, { quality: 'save', eyeSource, bodyArtPictures, paintSkin: (key, args) => { wanted = { key, args }; return null; } });
            const skin = wanted ? await this._paintSkinNow(wanted.args) : null;
            if (!current()) return;
            const result = RRCharacterModel.build(this.pack, recipe, cache, { quality: 'save', eyeSource, bodyArtPictures, paintSkin: skin ? () => skin : undefined });
            // A person saved ready to use: its poses and motions as clips, rigged, each motion where the game plays it.
            const ready = window.RRCharacterPoses && RRCharacterPoses.savedModel ? RRCharacterPoses.savedModel(result, motions) : null;
            if (ready) {
                const names = new Set((result.clips || []).map(clip => clip.name));
                result.clips = (result.clips || []).concat(ready.clips.filter(clip => !names.has(clip.name)));
            }
            const glb = await RRCharacterModel.toGlb(result, name, tex => this._png(tex));
            if (!current()) return;
            // Written whole or not at all: a save cut short leaves the last good file.
            const atomic = window.RRWriteFileAtomicSync || ((io, target, data) => io.writeFileSync(target, data));
            fs.mkdirSync(path.dirname(file), { recursive: true });
            atomic(fs, file, glb);
            atomic(fs, path.join(folder, 'character.json'), JSON.stringify({ builder: 'character3d', version: 2, recipe }, null, 2) + '\n');
            if (thumb) atomic(fs, path.join(folder, 'thumbnail.png'), thumb);
            if (result.sidecar || ready) {
                // A creature's rig, or a person's rig and motions, go in its model.json; what else the 3D Models page
                // keeps there stays, an animation edited there by hand among it.
                const sidecarFile = path.join(folder, 'model.json');
                let kept = {};
                try { kept = JSON.parse(fs.readFileSync(sidecarFile, 'utf8')); } catch (_) { kept = {}; }
                const next = Object.assign(kept, result.sidecar || {});
                if (ready) {
                    const own = Array.isArray(kept.animations) ? kept.animations.filter(a => a && typeof a === 'object') : [], have = new Set(own.map(a => a.name));
                    next.animations = own.concat(ready.sidecar.animations.filter(a => !have.has(a.name)));
                    if (ready.sidecar.rig) next.rig = ready.sidecar.rig;
                }
                atomic(fs, sidecarFile, JSON.stringify(next, null, 2) + '\n');
                if (ready && ready.rigBinary) atomic(fs, path.join(folder, 'model.rig.bin'), Buffer.from(ready.rigBinary));
            }
            await window.RPGReactorHost?.flush?.();
            this._status(this._t('Saved to 3D Models › Characters/{name}.', { name }), 'ok');
            window.dispatchEvent(new CustomEvent('rr-models-changed', { detail: { name: 'Characters/' + name } }));
        } catch (error) {
            console.error('[Character3DBuilder] save', error);
            if (current()) this._status(this._t('{name} could not be saved.', { name }), 'error');
        }
    }
}

/** Integrated and software GPUs, by the renderer's own name. */
Character3DBuilder.weakGpu = function(renderer) {
    try {
        const gl = renderer.getContext(), ext = gl.getExtension('WEBGL_debug_renderer_info');
        const name = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
        return /intel|llvmpipe|swiftshader|software|mali|adreno|apple gpu|radeon\(tm\) graphics|radeon graphics|vega \d+ graphics|ryzen/i.test(name)
            && !/nvidia|geforce|rtx|radeon rx|radeon pro/i.test(name);
    } catch (error) { return false; }
};

/** A soft round shadow, dark in the middle, gone at the edge. */
Character3DBuilder.blobTexture = function() {
    if (Character3DBuilder._blob) return Character3DBuilder._blob;
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d'), grad = g.createRadialGradient(64, 64, 4, 64, 64, 64);
    grad.addColorStop(0, 'rgba(0,0,0,0.75)'); grad.addColorStop(0.5, 'rgba(0,0,0,0.35)'); grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return (Character3DBuilder._blob = t);
};

/**
 * Skin's fine detail as a tiling normal map: pores (small soft pits, a few
 * to a millimeter's spacing at the tiling the skin uses) over a faint grain.
 */
Character3DBuilder.skinDetail = function() {
    if (Character3DBuilder._skinDetail) return Character3DBuilder._skinDetail;
    const n = 256, h = new Float32Array(n * n);
    let seed = 7;
    const rand = () => { seed ^= seed << 13; seed >>>= 0; seed ^= seed >> 17; seed ^= seed << 5; seed >>>= 0; return seed / 4294967296; };
    // The grain: a few octaves of value noise, wrapping at the edge so the tiles meet.
    for (const [cells, amp] of [[16, 0.35], [32, 0.25], [64, 0.15]]) {
        const g = Array.from({ length: cells * cells }, rand), at = (x, y) => g[((y + cells) % cells) * cells + (x + cells) % cells];
        for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
            const fx = x / n * cells, fy = y / n * cells, ix = Math.floor(fx), iy = Math.floor(fy), u = fx - ix, v = fy - iy;
            const a = at(ix, iy), b = at(ix + 1, iy), c = at(ix, iy + 1), d = at(ix + 1, iy + 1);
            h[y * n + x] += amp * (a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v);
        }
    }
    // The pores.
    for (let k = 0; k < 900; k++) {
        const cx = rand() * n, cy = rand() * n, r = 1.2 + rand() * 1.6, depth = 0.5 + rand() * 0.5;
        for (let y = Math.floor(cy - r - 1); y <= cy + r + 1; y++) for (let x = Math.floor(cx - r - 1); x <= cx + r + 1; x++) {
            const d = Math.hypot(x - cx, y - cy) / r;
            if (d < 1) h[((y + n) % n) * n + (x + n) % n] -= depth * (1 - d * d) ** 2;
        }
    }
    const data = new Uint8Array(n * n * 4);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
        const dx = h[y * n + (x + 1) % n] - h[y * n + (x + n - 1) % n], dy = h[((y + 1) % n) * n + x] - h[((y + n - 1) % n) * n + x];
        const l = Math.hypot(dx, dy, 0.5), o = (y * n + x) * 4;
        data[o] = Math.round((-dx / l * 0.5 + 0.5) * 255); data[o + 1] = Math.round((-dy / l * 0.5 + 0.5) * 255); data[o + 2] = Math.round((0.5 / l * 0.5 + 0.5) * 255); data[o + 3] = 255;
    }
    const t = new THREE.DataTexture(data, n, n, THREE.RGBAFormat);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(100, 100);
    t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true;
    t.needsUpdate = true;
    return (Character3DBuilder._skinDetail = t);
};

/** Fit every corner into the thumbnail's actual camera frustum, including tall or wide equipment. */
Character3DBuilder.fitThumbnailFrame = function(bounds, yaw, pitch, fov, aspect = 1) {
    const target = bounds.min.map((x, k) => (x + bounds.max[k]) * 0.5);
    const sy = Math.sin(yaw), cy = Math.cos(yaw), sp = Math.sin(pitch), cp = Math.cos(pitch);
    const forward = [sy * cp, sp, cy * cp], right = [cy, 0, -sy], up = [-sy * sp, cp, -cy * sp];
    const vertical = Math.tan(fov * Math.PI / 360), horizontal = vertical * aspect;
    let distance = 0.03;
    for (const x of [bounds.min[0], bounds.max[0]]) for (const y of [bounds.min[1], bounds.max[1]]) for (const z of [bounds.min[2], bounds.max[2]]) {
        const d = [x - target[0], y - target[1], z - target[2]];
        const dot = axis => d.reduce((sum, v, k) => sum + v * axis[k], 0);
        distance = Math.max(distance, dot(forward) + Math.max(Math.abs(dot(right)) / horizontal, Math.abs(dot(up)) / vertical) * 1.12);
    }
    return { target, distance };
};

/** Sliders that only reshape the body: the drag's fast path can follow them. */
Character3DBuilder.bodyPath = function(path) {
    return /^(shapes\.|morph\.|anatomy\.(length|girth|testicles|mons|labia|innerLabia|clitoris|fold|nipple|nippleProjection)$|gender$|age$|height$|weight$|muscle$|cup$|firmness$|proportions$|headSize$)/.test(path);
};

/** Everything except the one value being dragged must still match. */
Character3DBuilder.rangeContext = function(recipe, path) {
    const copy = JSON.parse(JSON.stringify(recipe)), keys = path.split('.');
    let owner = copy;
    for (const key of keys.slice(0, -1)) owner = owner?.[key];
    if (owner && typeof owner === 'object') delete owner[keys.at(-1)];
    return JSON.stringify(copy);
};

/** Bumped when the previews' look changes, so pictures kept on disk are drawn again. */
Character3DBuilder.PREVIEW_VERSION = 99;

/** Rigidly fit authored grip markers in the hand's rest frame; its bone carries every pose. */
Character3DBuilder.fitHeldPreview = function(object, shape, frame, T) {
    const v = a => new T.Vector3().fromArray(a);
    const gun = !!shape.handle;
    const forward = v(gun ? frame.along : frame.thumbward).normalize();
    const up = v(gun ? frame.thumbward : frame.along);
    up.addScaledVector(forward, -up.dot(forward)).normalize();
    const axis = v(shape.axis).normalize(), localUp = v(shape.up);
    localUp.addScaledVector(axis, -localUp.dot(axis)).normalize();
    const world = new T.Matrix4().makeBasis(forward, up, new T.Vector3().crossVectors(forward, up));
    const local = new T.Matrix4().makeBasis(axis, localUp, new T.Vector3().crossVectors(axis, localUp));
    object.quaternion.setFromRotationMatrix(world.multiply(local.transpose()));
    object.scale.setScalar(1);
    const radius = gun ? shape.handle.radius : shape.gripRadius;
    const target = v(frame.along).multiplyScalar(frame.length * 0.62).addScaledVector(v(frame.palm), frame.length * 0.126 + Math.min(0.04, radius || 0.015));
    const pivot = gun ? v(shape.handle.at) : v(shape.base).addScaledVector(axis, shape.marks?.handle ? shape.marks.handle * 0.65 : shape.length * shape.grip);
    object.position.copy(target).sub(pivot.applyQuaternion(object.quaternion));
    return target;
};

Character3DBuilder.disposeHeldPreview = function(object) {
    object.removeFromParent();
    const geometry = new Set(), materials = new Set(), textures = new Set(object.userData?.glbTextures || []);
    object.traverse(node => {
        if (node.geometry) geometry.add(node.geometry);
        if (node.skeleton) node.skeleton.dispose();
        for (const material of Array.isArray(node.material) ? node.material : node.material ? [node.material] : []) {
            materials.add(material);
            for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
            for (const value of Object.values(material.userData || {})) if (value?.isTexture) textures.add(value);
        }
    });
    for (const g of geometry) g.dispose();
    for (const m of materials) m.dispose();
    for (const t of textures) { t.dispose(); t.image?.close?.(); }
};

if (typeof window !== 'undefined') window.Character3DBuilder = Character3DBuilder;
