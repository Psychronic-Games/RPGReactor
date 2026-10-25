/**
 * ModelVariantsPanel - the Look section of Database > 3D Models.
 *
 * A model can be worn several ways: `model.json › variants` is a list of
 * `{ name, color?, texture?, surface?, media? }`, and a use of the model (an
 * event page, a placed model, a Database binding) names one. The section
 * picks the look in view (the model's own, or a variant) and, for a variant,
 * edits what it changes: a color adjustment of the model's own picture
 * (Colorize, or Adjust), another texture, its surface, and what each media
 * surface shows. The section lists the looks as rows (the model's own
 * first); a row opens the look in the page's floating card, one tab at a
 * time, and the preview wears it while the card is open. The model's own
 * look is the model's Surface. What a variant does not say stays the
 * model's. Edits show on the preview at once and are written to model.json
 * a moment later; other saves of the sidecar leave `variants` as they are
 * in the file.
 */
class ModelVariantsPanel {
    constructor(host) {
        this.host = host;
        this._trail = [];
        this._pending = null;
    }

    _t(text, params) { return this.host._t(text, params); }

    // ---- The data (pure, testable) ---------------------------------------

    /** A variant as the file keeps it: its name and only what it says. */
    static trimVariant(raw) {
        if (!raw || typeof raw !== 'object' || typeof raw.name !== 'string' || !raw.name.trim()) return null;
        const out = { name: raw.name.trim() };
        const number = (value, fallback, low, high) => { const n = Number(value); return Number.isFinite(n) ? Math.max(low, Math.min(high, Math.round(n * 100) / 100)) : fallback; };
        const color = raw.color && typeof raw.color === 'object' ? raw.color : null;
        if (color && color.mode === 'colorize') {
            const strength = number(color.strength, 1, 0, 1);
            if (strength > 0) out.color = { mode: 'colorize', color: /^#[0-9a-f]{6}$/i.test(String(color.color)) ? String(color.color).toLowerCase() : '#ffffff', strength, lightness: number(color.lightness, 0, -1, 1) };
        } else if (color && color.mode === 'adjust') {
            const hue = number(color.hue, 0, -180, 180), saturation = number(color.saturation, 1, 0, 2), brightness = number(color.brightness, 1, 0, 2);
            if (hue || saturation !== 1 || brightness !== 1) out.color = { mode: 'adjust', hue, saturation, brightness };
        }
        if (typeof raw.texture === 'string' && raw.texture && !/[\\/]|\.\./.test(raw.texture)) out.texture = raw.texture;
        if (raw.surface === false) out.surface = false;
        else if (raw.surface && typeof raw.surface === 'object') out.surface = Object.assign({}, raw.surface);
        if (raw.media && typeof raw.media === 'object' && !Array.isArray(raw.media)) {
            const media = {};
            for (const [key, entry] of Object.entries(raw.media)) {
                if (entry === false) media[key] = false;
                else if (entry && typeof entry === 'object' && typeof entry.file === 'string' && entry.file) media[key] = { file: entry.file };
            }
            if (Object.keys(media).length) out.media = media;
        }
        return out;
    }

    /** The sidecar's text with its variants set (or the field gone when there are none); every other field as it was. */
    static mergeVariants(previousText, variants) {
        let json = {};
        if (previousText) {
            const parsed = JSON.parse(previousText);
            if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('model.json must contain a JSON object');
            json = parsed;
        }
        const seen = new Set(), list = [];
        for (const raw of variants || []) {
            const variant = ModelVariantsPanel.trimVariant(raw);
            if (!variant || seen.has(variant.name)) continue;
            seen.add(variant.name);
            list.push(variant);
        }
        if (list.length) json.variants = list;
        else delete json.variants;
        return (typeof RRJson !== 'undefined' && RRJson.stringify ? RRJson.stringify(json) : JSON.stringify(json, null, 2)) + '\n';
    }

    /** A name no other variant has: the wanted one, or it with a number. */
    static uniqueName(wanted, variants, except = null) {
        const base = String(wanted || '').trim() || 'Variant';
        const taken = new Set((variants || []).filter(v => v && v !== except).map(v => v.name));
        if (!taken.has(base)) return base;
        for (let n = 2; ; n++) if (!taken.has(`${base} ${n}`)) return `${base} ${n}`;
    }

    // ---- Which variants wear an effect (pure, testable) ------------------
    // An effect in model.json may carry `variants`: the names of the variants
    // that wear it, "" being the model's own look. With no list (or an empty
    // one) every variant wears it.

    /** An effect's list, tidy: each name once; null when it says every variant. */
    static trimWorn(list) {
        if (!Array.isArray(list)) return null;
        const names = [...new Set(list.filter(name => typeof name === 'string').map(name => name.trim()))];
        return names.length ? names : null;
    }

    /** Whether a variant ("" the model's own) wears an effect. A media surface a variant marks off (`media[name] === false`, the first way this was written) is not worn. */
    static wears(effect, name, variants) {
        if (!effect) return false;
        const list = ModelVariantsPanel.trimWorn(effect.variants);
        if (list && !list.includes(name || '')) return false;
        const variant = name ? (variants || []).find(v => v && v.name === name) : null;
        return !(variant && effect.type === 'video' && variant.media && variant.media[effect.name] === false);
    }

    /** The variants that wear an effect, of those the model has, the model's own ("") first. */
    static wornBy(effect, variants) {
        return [''].concat((variants || []).filter(Boolean).map(v => v.name)).filter(name => ModelVariantsPanel.wears(effect, name, variants));
    }

    /** Say which variants wear an effect. All of them, or none named, is every variant: the list goes. */
    static setWornBy(effect, names, variants) {
        const all = [''].concat((variants || []).filter(Boolean).map(v => v.name));
        const wanted = all.filter(name => (names || []).includes(name));
        if (!wanted.length || wanted.length === all.length) delete effect.variants;
        else effect.variants = wanted;
        return effect;
    }

    /** "Black only", "Model's own, Parade", "No variant", or '' when every variant wears it. */
    static wornSummary(effect, variants, own, only, none) {
        const by = ModelVariantsPanel.wornBy(effect, variants);
        if (by.length === 1 + (variants || []).filter(Boolean).length) return '';
        if (!by.length) return none;
        const names = by.map(name => name || own);
        return names.length === 1 ? only.replace('{name}', names[0]) : names.join(', ');
    }

    /** A variant was renamed: every effect that names it follows. True when any did. */
    static renameWorn(effects, from, to) {
        let changed = false;
        for (const effect of effects || []) {
            const at = effect && Array.isArray(effect.variants) ? effect.variants.indexOf(from) : -1;
            if (at < 0) continue;
            effect.variants[at] = to;
            changed = true;
        }
        return changed;
    }

    /**
     * A variant was deleted: it leaves every effect's list. An effect only
     * it wore keeps the name, so it shows in no variant ("No variant" on its
     * row) instead of turning up in all of them.
     */
    static removeWorn(effects, name) {
        let changed = false;
        for (const effect of effects || []) {
            const list = effect && Array.isArray(effect.variants) ? effect.variants : null;
            if (!list || list.length < 2 || !list.includes(name)) continue;
            effect.variants = list.filter(other => other !== name);
            changed = true;
        }
        return changed;
    }

    /** A new variant made from another ("" the model's own) wears what that one wears. True when any list changed. */
    static copyWorn(effects, from, to) {
        let changed = false;
        for (const effect of effects || []) {
            const list = effect && Array.isArray(effect.variants) && effect.variants.length ? effect.variants : null;
            if (!list || !list.includes(from || '') || list.includes(to)) continue;
            list.push(to);
            changed = true;
        }
        return changed;
    }

    /** The first way a variant left a media surface off (`media[name] === false`) becomes the effect's own list. True when anything changed. */
    static migrateOff(effects, variants) {
        let changed = false;
        for (const effect of effects || []) {
            if (!effect || effect.type !== 'video') continue;
            const off = (variants || []).filter(v => v && v.media && v.media[effect.name] === false);
            if (!off.length) continue;
            ModelVariantsPanel.setWornBy(effect, ModelVariantsPanel.wornBy(effect, variants), variants);
            // Every variant had it off: it keeps their names off by keeping a list none of them is in.
            if (!effect.variants && off.length) effect.variants = [''].concat((variants || []).map(v => v.name)).filter(name => !off.some(v => v.name === name));
            for (const variant of off) {
                delete variant.media[effect.name];
                if (!Object.keys(variant.media).length) delete variant.media;
            }
            changed = true;
        }
        return changed;
    }

    /** The names of a model's variants, for a use's Variant choice: read from its sidecar on disk. */
    static namesFor(projectPath, modelName) {
        if (!projectPath || !modelName || typeof require !== 'function') return [];
        try {
            const fs = require('fs'), path = require('path');
            const json = JSON.parse(fs.readFileSync(path.join(projectPath, '3d', modelName, 'model.json'), 'utf8'));
            const seen = new Set(), names = [];
            for (const raw of Array.isArray(json && json.variants) ? json.variants : []) {
                const name = raw && typeof raw.name === 'string' ? raw.name.trim() : '';
                if (name && !seen.has(name)) { seen.add(name); names.push(name); }
            }
            return names;
        } catch (error) {
            return [];
        }
    }

    /**
     * A Variant choice for a use of a model: a <select> with the model's own
     * look first, or '' when the model has no variants (nothing to choose).
     * A name the model no longer has stays listed so it is not lost silently.
     */
    static selectHtml(cls, names, current, ownLabel, attrs = '') {
        const escape = text => String(text ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
        const list = names.slice();
        if (current && !list.includes(current)) list.push(current);
        if (!list.length) return '';
        return `<select class="${escape(cls)}" ${attrs}><option value="">${escape(ownLabel)}</option>${list.map(name => `<option value="${escape(name)}"${name === current ? ' selected' : ''} data-rr-i18n-skip="1">${escape(name)}</option>`).join('')}</select>`;
    }

    /**
     * What a use of a model wears, as the game reads it from model.json: the
     * surface and the look (color, texture) of its variant, or the model's own
     * when no variant is named. Both null when the file says nothing.
     */
    static lookOf(projectPath, modelName, variant) {
        const none = { surface: null, look: null };
        if (!projectPath || !modelName || typeof require !== 'function' || typeof Reactor3D === 'undefined'
            || !Reactor3D.variantSurface || !Reactor3D.modelLook) return none;
        let json;
        try {
            const fs = require('fs'), path = require('path');
            json = JSON.parse(fs.readFileSync(path.join(projectPath, '3d', modelName, 'model.json'), 'utf8'));
        } catch (error) {
            return none;
        }
        const spec = variant ? { name: modelName, variant } : { name: modelName };
        return { surface: Reactor3D.variantSurface(json, spec) || null, look: Reactor3D.modelLook(json, spec) || null };
    }

    /** Text that differs for every different thing worn; '' when nothing is. */
    static lookStamp(worn) {
        return worn && (worn.surface || worn.look) ? JSON.stringify({ surface: worn.surface || null, look: worn.look || null }) : '';
    }

    /** Put what `lookOf` read on a model: its surface, color adjustment and texture. */
    static applyWorn(object, worn) {
        if (!object || typeof Reactor3D === 'undefined') return;
        if (Reactor3D.applyModelSurface) Reactor3D.applyModelSurface(object, (worn && worn.surface) || null);
        if (Reactor3D.applyModelLook) Reactor3D.applyModelLook(object, (worn && worn.look) || null);
    }

    /** Put a variant's surface, color and texture on a preview's model; the model's own when no variant is named. */
    static wear(object, projectPath, modelName, variant) {
        if (!object) return null;
        const worn = ModelVariantsPanel.lookOf(projectPath, modelName, variant);
        ModelVariantsPanel.applyWorn(object, worn);
        return worn;
    }

    // ---- The page -----------------------------------------------------------

    /** The variant in view, or null for the model's own look. */
    record() {
        const host = this.host;
        return host._variant ? (host.rawVariants || []).find(v => v && v.name === host._variant) || null : null;
    }

    /** The spec the preview wears: the model with the variant in view. */
    previewSpec() {
        const host = this.host;
        return host._variant && host.selectedName ? { name: host.selectedName, variant: host._variant } : null;
    }

    /** Write the variants to model.json, leaving everything else in the file as it is. */
    save() {
        const host = this.host, fs = require('fs');
        try {
            const previous = host._readSidecarForUpdate(fs);
            host._writeFileAtomic(fs, host.rulesPath(), ModelVariantsPanel.mergeVariants(previous, host.rawVariants));
        } catch (error) {
            host._reportModelSaveError(error);
            return;
        }
        const status = host._detail && host._detail.querySelector('.r3d-status');
        if (status) status.textContent = `${this._t('Saved')} — 3d/${host.selectedName}/model.json`;
        if (typeof RREventPreviewModels !== 'undefined' && RREventPreviewModels.clear) RREventPreviewModels.clear();
        // The "off" marks taken out of the variants on load are the effects' lists now: those are written with them.
        if (host._wornMigrated) {
            host._wornMigrated = false;
            host.saveRules();
        }
    }

    /** A change in view now, in the file a moment later. */
    changed() {
        const host = this.host;
        host._applyBaseTransform();
        clearTimeout(this._saveTimer);
        this._saveTimer = setTimeout(() => { this._saveTimer = null; this.save(); }, 300);
        this._syncUndo();
    }

    // One step back per gesture: a drag of a slider, a color chosen, a button.
    // A step holds the variants and which of them wear each effect.
    _snapshot() {
        const host = this.host;
        return JSON.stringify({ variants: host.rawVariants || [], worn: (host.rawEffects || []).map(effect => [effect && effect.name, (effect && effect.variants) || null]) });
    }

    /** A gesture starts: what the variants were is kept until it ends. */
    begin() {
        this.end();
        this._pending = { text: this._snapshot(), view: this.host._variant || '' };
    }

    /** The gesture is over: a step back, when it changed anything. */
    end() {
        if (this._pending && this._pending.text !== this._snapshot()) {
            this._trail.push(this._pending);
            if (this._trail.length > 40) this._trail.shift();
            this._redo = [];
        }
        this._pending = null;
        this._syncUndo();
    }

    undo() {
        this.end();
        this._step(this._trail, this._redo || (this._redo = []));
    }

    redo() {
        this.end();
        this._step(this._redo || (this._redo = []), this._trail);
    }

    /** Take a kept state off one trail, keep the present one on the other, and put the kept one back. */
    _step(from, to) {
        const last = from.pop();
        if (!last) return;
        const host = this.host;
        to.push({ text: this._snapshot(), view: host._variant || '' });
        const state = JSON.parse(last.text);
        host.rawVariants = state.variants;
        // The effects' lists go back with the variants they name.
        let lists = false;
        for (const [name, worn] of state.worn || []) {
            const effect = (host.rawEffects || []).find(raw => raw && raw.name === name);
            if (!effect || JSON.stringify(effect.variants || null) === JSON.stringify(worn)) continue;
            if (worn) effect.variants = worn; else delete effect.variants;
            lists = true;
        }
        // A variant brought back comes back in view; one that is gone again leaves the model's own.
        host._variant = (host.rawVariants || []).some(v => v && v.name === last.view) ? last.view : '';
        clearTimeout(this._saveTimer);
        this._saveTimer = null;
        this.save();
        if (lists) host.saveRules();
        host.renderEffectList();
        this.render();
        host.renderToolbar();
        host._applyBaseTransform();
        this.refreshMedia();
    }

    /** Write now what a moment's wait would have written. */
    flush() {
        this.end();
        if (!this._saveTimer) return;
        clearTimeout(this._saveTimer);
        this._saveTimer = null;
        this.save();
    }

    canUndo() {
        return !!(this._trail.length || (this._pending && this._pending.text !== this._snapshot()));
    }

    canRedo() {
        return !!(this._redo && this._redo.length);
    }

    _syncUndo() {
        const host = this.host;
        const card = host._cardMode === 'look' && host._detail ? host._detail.querySelector('.r3d-card') : null;
        const undo = card && card.querySelector('.r3d-card-undo'), redo = card && card.querySelector('.r3d-card-redo');
        if (undo) undo.disabled = !this.canUndo();
        if (redo) redo.disabled = !this.canRedo();
    }

    textures() {
        const host = this.host;
        try {
            const fs = require('fs'), path = require('path');
            const dir = path.join(host._project().path, '3d', host.selectedName, 'textures');
            return fs.readdirSync(dir).filter(name => /\.(png|jpe?g|webp)$/i.test(name)).sort();
        } catch (error) {
            return [];
        }
    }

    /** The model's media surfaces: its effects that show a picture or a movie. */
    mediaEffects() {
        return (this.host.rawEffects || []).filter(raw => raw && raw.name && raw.type === 'video');
    }

    /** What a look changes, for its row: "Colorize · Texture · Surface · Media". */
    summary(variant) {
        const host = this.host;
        if (!variant) return host.rawSurface && Number(host.rawSurface.reflect) > 0 ? this._t('Reflections') : '';
        const parts = [];
        if (variant.color) parts.push(this._t(variant.color.mode === 'colorize' ? 'Colorize' : 'Adjust'));
        if (variant.texture) parts.push(this._t('Texture'));
        if (variant.surface !== undefined) parts.push(this._t('Surface'));
        if (variant.media && Object.keys(variant.media).length) parts.push(this._t('Media'));
        return parts.join(' · ');
    }

    /** Whether the variant in view wears an effect. */
    shows(raw) {
        return ModelVariantsPanel.wears(raw, this.host._variant || '', this.host.rawVariants);
    }

    /** "Black only" for an effect's row; '' when every variant wears it. */
    wornNote(raw) {
        return ModelVariantsPanel.wornSummary(raw, this.host.rawVariants, this._t("Model's own"), this._t('{name} only'), this._t('No variant'));
    }

    /** The section and, when a look's card is open, the card. */
    render() {
        this.renderList();
        if (this.host._cardMode === 'look') this.host.renderEditCard();
    }

    /** The Look section's rows: the model's own look, then each variant. The row whose card is open is lit. */
    renderList() {
        const host = this.host, list = host._detail && host._detail.querySelector('.r3d-look-list');
        if (!list) return;
        const variants = host.rawVariants || [];
        if (this._trailFor !== host.selectedName) { this._trailFor = host.selectedName; this._trail = []; this._redo = []; this._pending = null; }
        if (host._variant && !this.record()) host._variant = '';
        host._sectionCount('look', variants.length);
        list.innerHTML = '';
        if (!host.selectedName) return;
        const open = host._cardMode === 'look';
        const own = host._row({ icon: 'model', name: this._t("Model's own"), note: this.summary(null), skip: false, selected: open && !host._variant });
        own.addEventListener('click', () => this.select(''));
        list.appendChild(own);
        for (const variant of variants) {
            const row = host._row({
                icon: 'look', name: variant.name, note: this.summary(variant), selected: open && variant.name === host._variant,
                actions: [{ icon: 'delete', title: this._t('Delete'), cls: 'is-danger', run: () => this.remove(variant.name) }]
            });
            row.addEventListener('click', () => this.select(variant.name));
            list.appendChild(row);
        }
        if (!variants.length) {
            const note = document.createElement('div');
            note.className = 'r3d-sec-note';
            note.textContent = this._t('A variant is the same model worn another way: recolored, retextured or shinier. + adds one.');
            list.appendChild(note);
        }
    }

    /** Open a variant's card (the model's own with ''). The preview wears it from then on. */
    async select(name) {
        const host = this.host;
        if (host.settlePending && !(await host.settlePending(['effect']))) return;
        if (host._cardMode === 'effect') host._leaveEffectMode();
        this.end();
        host._variant = name && (host.rawVariants || []).some(v => v && v.name === name) ? name : '';
        host._cardMode = 'look';
        host._cardCollapsed = false;
        this.worn();
        host.renderEditCard();
    }

    /** The preview wears a variant ("" the model's own) without its card: the chip beside the tools says which, and takes it off. */
    wear(name) {
        const host = this.host;
        this.end();
        host._variant = name && (host.rawVariants || []).some(v => v && v.name === name) ? name : '';
        this.worn();
        if (host._cardMode === 'look') host.renderEditCard();
    }

    /** What the preview wears changed: the model, its effects, the rows and the chip follow. */
    worn() {
        const host = this.host;
        this.renderList();
        host.renderEffectList();
        host.renderToolbar();
        host._applyBaseTransform();
        this.refreshMedia();
        host._lastInputAt = performance.now();
    }

    /** The variant's card closes. The preview goes on wearing it, so an effect can be placed on it. */
    closeCard() {
        const host = this.host;
        if (host._cardMode !== 'look') return;
        this.end();
        host._cardMode = 'part';
        this.renderList();
        host.renderEditCard();
    }

    /** Effects' own lists changed from a variant's card: written at once, as the variant is. */
    effectsChanged() {
        const host = this.host;
        host.saveRules();
        host.renderEffectList();
        this.refreshMedia();
        this._syncUndo();
        host._lastInputAt = performance.now();
    }

    /** Select an effect to place it, from the variant's card: the preview keeps wearing the variant, and closing the effect's card comes back here. */
    async place(index) {
        const host = this.host;
        this.end();
        await host.requestSelectEffect(index);
        if (host.selectedEffect !== index || host._cardMode !== 'effect') return;
        host._fxFromVariant = true;
        host._fxTab = 'offset';
        host.renderEditCard();
        host._lastInputAt = performance.now();
    }

    /** A new media surface that only the variant in view wears, straight into placing it on the model. */
    addEffect() {
        const host = this.host;
        if (!host.selectedName) return;
        this.end();
        const extra = { type: 'video' };
        if ((host.rawVariants || []).length) extra.variants = [host._variant || ''];
        host.addModelEffect(extra);
        host._fxFromVariant = true;
        host.setTool('fxanchor');
        host.renderEditCard();
    }

    /** A new look starts as the one in view, and opens. */
    add() {
        const host = this.host;
        if (!host.selectedName) return;
        const from = this.record();
        const name = ModelVariantsPanel.uniqueName(from ? from.name : this._t('Variant'), host.rawVariants);
        const variant = from ? JSON.parse(JSON.stringify(from)) : {};
        variant.name = name;
        this.begin();
        host.rawVariants.push(variant);
        const lists = ModelVariantsPanel.copyWorn(host.rawEffects, from ? from.name : '', name);
        this.end();
        this.save();
        if (lists) host.saveRules();
        this.select(name);
    }

    /** Delete a look (the one in view when none is named); false when there is none to delete. */
    remove(name = this.host._variant) {
        const host = this.host;
        const variant = (host.rawVariants || []).find(v => v && v.name === name);
        if (!variant) return false;
        this.begin();
        host.rawVariants.splice(host.rawVariants.indexOf(variant), 1);
        const lists = ModelVariantsPanel.removeWorn(host.rawEffects, name);
        if (host._effectWork) ModelVariantsPanel.removeWorn([host._effectWork], name);
        this.end();
        this.save();
        if (lists) host.saveRules();
        if (host._variant === name) { this.closeCard(); host._variant = ''; }
        this.worn();
        if (host._cardMode === 'effect') host.renderEditCard();
        return true;
    }

    rename(wanted) {
        const host = this.host, variant = this.record();
        if (!variant || !String(wanted || '').trim() || wanted.trim() === variant.name) return;
        this.begin();
        const before = variant.name;
        variant.name = ModelVariantsPanel.uniqueName(wanted, host.rawVariants, variant);
        const lists = ModelVariantsPanel.renameWorn(host.rawEffects, before, variant.name);
        this.end();
        this.save();
        if (lists) host.saveRules();
        host._variant = variant.name;
        host.renderEffectList();
        host.renderToolbar();
        this.render();
    }

    /** The card's tabs for the look in view: the model's own look is its Surface. */
    tabs() {
        const variant = this.record();
        const effects = { id: 'media', label: this.host._k('r3dfx.title') };
        if (!variant) return [{ id: 'surface', label: this._t('Surface') }, effects];
        // Texture is always there: a model with no other pictures yet is where one is added.
        return [{ id: 'color', label: this._t('Color') }, { id: 'texture', label: this._t('Texture') }, { id: 'surface', label: this._t('Surface') }, effects];
    }

    /**
     * The card of the look in view: its name in the title (renamed there),
     * then one tab at a time: Color, Texture, Surface and Media. The
     * model's own look is its Surface.
     */
    renderCard(card) {
        const host = this.host, variant = this.record();
        const tt = text => rrEscapeHtml(this._t(text));
        const tabs = this.tabs();
        if (!tabs.some(tab => tab.id === this.tab)) this.tab = tabs[0].id;
        const row = (label, body) => host._cardRow(label, body);
        let body = '';
        if (variant && this.tab === 'color') {
            const color = variant.color || null, mode = color ? color.mode : '';
            const chip = (value, label) => `<button type="button" class="r3d-look-mode" data-mode="${value}" aria-pressed="${mode === value}">${tt(label)}</button>`;
            const slider = (field, label, min, max, step, value) => row(tt(label), `<input type="range" class="r3d-look-slider" data-field="${field}" min="${min}" max="${max}" step="${step}" value="${value}"><span class="r3d-look-value r3d-fvalue" data-field="${field}">${value}</span>`);
            body = row(tt('Color'), `<div class="r3d-fseg">${chip('', 'Off')}${chip('colorize', 'Colorize')}${chip('adjust', 'Adjust')}</div>`);
            if (mode === 'colorize') {
                body += row(tt('Tint'), typeof RRColorPopup !== 'undefined' ? RRColorPopup.swatch('r3d-look-color', color.color) : `<input type="color" class="r3d-look-color" value="${rrEscapeHtml(color.color)}">`)
                    + slider('strength', 'Strength', 0, 1, 0.01, color.strength) + slider('lightness', 'Lightness', -1, 1, 0.01, color.lightness);
            } else if (mode === 'adjust') {
                body += slider('hue', 'Hue', -180, 180, 1, color.hue) + slider('saturation', 'Saturation', 0, 2, 0.01, color.saturation) + slider('brightness', 'Brightness', 0, 2, 0.01, color.brightness);
            }
        } else if (variant && this.tab === 'texture') {
            const names = this.textureNames(variant);
            const url = variant.texture && typeof globalThis.RRVariantTextureUrl === 'function' ? globalThis.RRVariantTextureUrl(host.selectedName, variant.texture) || '' : '';
            if (names.length) {
                body = row(tt('Texture'), typeof RRMaterialPopup !== 'undefined'
                    ? RRMaterialPopup.tile({ cls: 'r3d-look-texture', value: variant.texture || '', url, blank: this._t("Model's own") })
                    : `<select class="r3d-look-texture"><option value="">${tt("Model's own")}</option>${names.map(name => `<option value="${rrEscapeHtml(name)}"${name === variant.texture ? ' selected' : ''} data-rr-i18n-skip="1">${rrEscapeHtml(name)}</option>`).join('')}</select>`);
            } else {
                body = `<div class="r3d-fnote">${tt('This model has no other textures yet. Add a picture to use instead of its own.')}</div>`;
            }
            body += row('', `<button type="button" class="r3d-fbtn r3d-look-texture-add" style="text-align:center;">${tt('Add picture…')}</button>`);
        } else if (this.tab === 'media') {
            body = this.effectsRowsHtml(variant);
        }
        const grid = this.tab === 'surface' ? '<div class="r3d-surface-form r3d-fgrid"></div>' : `<div class="r3d-look-form r3d-fgrid">${body}</div>`;
        const head = host._cardHeadHtml(variant ? 'look' : 'model', variant ? variant.name : this._t("Model's own"), { rename: !!variant, undo: this.canUndo(), redo: this.canRedo() });
        card.innerHTML = `<div class="r3d-fcard">${head}${host._cardTabsHtml('r3d-look-tab', tabs, this.tab)}${grid}</div>`;
        card.querySelector('.r3d-card-close').addEventListener('click', () => this.closeCard());
        card.querySelector('.r3d-card-undo').addEventListener('click', () => this.undo());
        card.querySelector('.r3d-card-redo').addEventListener('click', () => this.redo());
        card.querySelector('.r3d-fcard-title').addEventListener('change', event => {
            this.rename(event.target.value);
            const now = this.record();
            if (now && event.target.isConnected) event.target.value = now.name;
        });
        card.querySelectorAll('.r3d-look-tab').forEach(tab => tab.addEventListener('click', () => { this.end(); this.tab = tab.dataset.tab; host.renderEditCard(); }));
        if (this.tab === 'surface') host.renderSurfaceForm();
        else if (this.tab === 'media') this.bindEffectsRows(card.querySelector('.r3d-look-form'), variant);
        else if (variant) this.bind(card.querySelector('.r3d-look-form'), variant);
    }

    /**
     * "Effects in this variant": every effect of the model as a row. A tick
     * says whether this variant wears it; a media surface has the picture
     * or movie this variant shows on it; Place selects the effect with its
     * handles on the model, this variant still worn; + adds a media surface
     * only this variant wears.
     */
    effectsRowsHtml(variant) {
        const host = this.host, tt = text => rrEscapeHtml(this._t(text));
        const name = variant ? variant.name : '';
        const effects = (host.rawEffects || []).map((raw, index) => ({ raw, index })).filter(entry => entry.raw && entry.raw.name);
        let html = `<div class="r3d-fhead"><span>${tt('Effects in this variant')}</span><button type="button" class="r3d-sec-add r3d-look-fx-add" title="${tt('Add a media surface to this variant only')}" aria-label="${tt('Add a media surface to this variant only')}">${host.constructor.icon('add')}</button></div>`;
        if (!effects.length) html += `<div class="r3d-fnote">${tt('Lights, screens and animations that ride on the model. + adds one.')}</div>`;
        for (const { raw, index } of effects) {
            const on = ModelVariantsPanel.wears(raw, name, host.rawVariants);
            const sole = on && ModelVariantsPanel.wornBy(raw, host.rawVariants).length === 1;
            const label = rrEscapeHtml(raw.name);
            const over = variant && variant.media && variant.media[raw.name] && variant.media[raw.name].file ? variant.media[raw.name].file : '';
            const what = raw.type === 'video'
                ? (variant
                    ? `<button type="button" class="r3d-fbtn r3d-look-media-pick${over ? '' : ' is-muted'}" data-effect="${label}" title="${rrEscapeHtml(host._k('r3dfx.chooseVideo'))}"${on ? '' : ' disabled'}${over ? ' data-rr-i18n-skip="1"' : ''}>${over ? rrEscapeHtml(over) : tt("Model's own")}</button>`
                        + (over ? `<button type="button" class="r3d-fbtn is-square r3d-look-media-own" data-effect="${label}" title="${tt("Use the model's")}" aria-label="${tt("Use the model's")}">&times;</button>` : '')
                    : `<span class="r3d-fwhat" data-rr-i18n-skip="1">${rrEscapeHtml((raw.video && raw.video.file) || '')}</span>`)
                : `<span class="r3d-fwhat">${rrEscapeHtml(host._k(raw.type === 'light' ? 'r3dfx.typeLight' : 'r3dfx.typeAnimation'))}</span>`;
            html += `<span class="r3d-flabel${on ? '' : ' is-dimmed'}" title="${label}" data-rr-i18n-skip="1">${label}</span><div class="r3d-ffield">
                <input type="checkbox" class="r3d-look-fx-on" data-index="${index}" title="${tt('Shown in this variant')}" aria-label="${tt('Shown in this variant')}"${on ? ' checked' : ''}${sole ? ' disabled' : ''}>
                ${what}
                <button type="button" class="r3d-fbtn is-square r3d-look-fx-place" data-index="${index}" title="${rrEscapeHtml(host._k('r3dfx.place'))}" aria-label="${rrEscapeHtml(host._k('r3dfx.place'))}">${host.constructor.icon('place')}</button></div>`;
        }
        return html;
    }

    bindEffectsRows(form, variant) {
        const host = this.host, name = variant ? variant.name : '';
        form.classList.add('is-list');
        form.querySelector('.r3d-look-fx-add')?.addEventListener('click', () => this.addEffect());
        form.querySelectorAll('.r3d-look-fx-on').forEach(box => box.addEventListener('change', () => {
            const raw = host.rawEffects[Number(box.dataset.index)];
            if (!raw) return;
            const by = ModelVariantsPanel.wornBy(raw, host.rawVariants).filter(other => other !== name);
            if (box.checked) by.push(name);
            this.begin();
            ModelVariantsPanel.setWornBy(raw, by, host.rawVariants);
            this.end();
            this.effectsChanged();
            this.render();
        }));
        form.querySelectorAll('.r3d-look-fx-place').forEach(button => button.addEventListener('click', () => this.place(Number(button.dataset.index))));
        if (!variant) return;
        form.querySelectorAll('.r3d-look-media-pick').forEach(button => button.addEventListener('click', () => {
            const effect = button.dataset.effect, current = variant.media && variant.media[effect] && variant.media[effect].file;
            host._pickMediaFile(current || undefined, file => {
                this.begin();
                variant.media = variant.media || {};
                variant.media[effect] = { file };
                this.end();
                this.changed();
                this.refreshMedia();
                this.render();
            });
        }));
        form.querySelectorAll('.r3d-look-media-own').forEach(button => button.addEventListener('click', () => {
            if (!variant.media) return;
            this.begin();
            delete variant.media[button.dataset.effect];
            if (!Object.keys(variant.media).length) delete variant.media;
            this.end();
            this.changed();
            this.refreshMedia();
            this.render();
        }));
    }

    /** The pictures a variant's texture can be. */
    static get TEXTURE_EXTENSIONS() { return ['.png', '.jpg', '.jpeg', '.webp']; }

    /** A model's textures folder, as the Resource Manager's import knows a folder. */
    static textureFolder(modelName) {
        return { id: 'model-textures', label: 'Textures', path: `3d/${String(modelName).replace(/\\/g, '/')}/textures`,
            extensions: ModelVariantsPanel.TEXTURE_EXTENSIONS, preview: 'image', keepExtension: true };
    }

    /**
     * Put a picture in a model's textures folder through the Resource
     * Manager's import: the same checks of the name and of the bytes, the
     * same refusal to write over a file nobody approved, the same whole-file
     * write. Returns its result ({ collision, existing } or { destination }).
     */
    static importTextureBytes({ importer, modelName, ...options }) {
        return importer.importBytes({ ...options, folder: ModelVariantsPanel.textureFolder(modelName) });
    }

    /** Add picture…: choose an image file, bring it into the model's textures folder, and wear it. */
    addTexture() {
        if (!this.record() || typeof document === 'undefined') return;
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = ModelVariantsPanel.TEXTURE_EXTENSIONS.join(',');
        input.className = 'r3d-look-texture-file';
        input.style.display = 'none';
        const cleanup = () => input.remove();
        input.addEventListener('cancel', cleanup);
        input.addEventListener('change', async () => {
            const file = (input.files || [])[0];
            cleanup();
            if (!file) return;
            // A file with no path (the browser build) is read through the page; one on disk through the import's own reader.
            await this.importTexture(file.name, file.path || null, file.path ? null : new Uint8Array(await file.arrayBuffer()));
        });
        document.body.appendChild(input);
        input.click();
    }

    async importTexture(sourceName, filePath, bytes = null) {
        const host = this.host, variant = this.record();
        if (!variant || typeof ResourceManager === 'undefined') return false;
        const fs = require('fs'), path = require('path');
        const reactor = typeof window !== 'undefined' ? window.reactor : null;
        const controller = reactor && reactor.projectController;
        const ownership = controller && controller.captureProjectOwnership ? controller.captureProjectOwnership() : null;
        const verify = () => { if (ownership) controller.verifyProjectOwnership(ownership, { requireWrite: true }); };
        try {
            verify();
            const options = {
                importer: ResourceManager, modelName: host.selectedName, fs, path, assetFiles: RRAssetFiles, projectRoot: host._project().path,
                sourceName, sourceBytes: bytes || ResourceManager.prototype.readImportFile.call({ fs }, filePath),
                writeAtomic: (typeof window !== 'undefined' && window.RRWriteFileAtomicSync) || ((io, file, data) => host._writeFileAtomic(io, file, data)),
                verifyOwnership: verify
            };
            let result = ModelVariantsPanel.importTextureBytes(options);
            if (result.collision) {
                const names = result.existing.map(item => item.physicalRelativePath).join(', ');
                const ask = reactor && reactor.uiManager && reactor.uiManager.showConfirm;
                const replace = ask ? await reactor.uiManager.showConfirm(this._t('Replace resource?'),
                    this._t('{file} has the same project name as {names}. Replace the existing resource?', { file: sourceName, names }), this._t('Replace'), this._t('Cancel'), { danger: true }) : false;
                if (!replace) return false;
                result = ModelVariantsPanel.importTextureBytes({ ...options, replaceRecords: result.existing });
                if (result.collision) throw new Error(this._t('The colliding resources changed; review them and retry the import.'));
            }
            if (!this.record() || this.record() !== variant) return false;
            this.begin();
            variant.texture = path.basename(result.destination);
            this.end();
            this.changed();
            this.render();
            return true;
        } catch (error) {
            host._setStatus(`${sourceName}: ${error.message}`);
            return false;
        }
    }

    textureNames(variant) {
        const textures = this.textures();
        return textures.includes(variant.texture) || !variant.texture ? textures : textures.concat([variant.texture]);
    }

    bind(form, variant) {
        const host = this.host, q = selector => form.querySelector(selector);
        form.querySelectorAll('.r3d-look-mode').forEach(button => button.addEventListener('click', () => {
            const mode = button.dataset.mode;
            this.begin();
            // Each mode keeps what it was last set to while the page is open.
            this._kept = this._kept || {};
            if (variant.color) this._kept[variant.color.mode] = variant.color;
            if (!mode) delete variant.color;
            else variant.color = this._kept[mode] || (mode === 'colorize' ? { mode, color: '#b03030', strength: 1, lightness: 0 } : { mode, hue: 0, saturation: 1, brightness: 1 });
            this.end();
            this.changed();
            this.render();
        }));
        // A drag is one step: it starts at the first movement and ends when the slider lets go.
        form.querySelectorAll('.r3d-look-slider').forEach(input => input.addEventListener('change', () => { this.end(); this.renderList(); }));
        form.querySelectorAll('.r3d-look-slider').forEach(input => input.addEventListener('input', () => {
            if (!variant.color) return;
            if (!this._pending) this.begin();
            variant.color[input.dataset.field] = Number(input.value);
            const label = form.querySelector(`.r3d-look-value[data-field="${input.dataset.field}"]`);
            if (label) label.textContent = input.value;
            this.changed();
        }));
        const swatch = q('.r3d-look-color');
        // The popup has no closing call: the color chosen is one step, ended by the next gesture.
        swatch?.addEventListener('click', () => this.begin());
        if (swatch && typeof RRColorPopup !== 'undefined' && swatch.tagName === 'BUTTON') RRColorPopup.bind(swatch, hex => { if (variant.color) { variant.color.color = hex; this.changed(); } });
        else swatch?.addEventListener('input', event => { if (variant.color) { variant.color.color = event.target.value; this.changed(); } });
        const setTexture = name => {
            this.begin();
            if (name) variant.texture = name; else delete variant.texture;
            this.end();
            this.changed();
            this.render();
        };
        q('.r3d-look-texture-add')?.addEventListener('click', () => this.addTexture());
        const texture = q('.r3d-look-texture');
        if (texture && texture.tagName === 'SELECT') texture.addEventListener('change', event => setTexture(event.target.value));
        else texture?.addEventListener('click', () => RRMaterialPopup.open(texture, {
            materials: this.textureNames(variant).map(name => ({ name, url: globalThis.RRVariantTextureUrl ? globalThis.RRVariantTextureUrl(host.selectedName, name) || '' : '' })),
            current: variant.texture || '', blank: this._t("Model's own"), onPick: setTexture
        }));
    }

    /** A variant's Surface row: the model's own until it is changed, with the way back. */
    surfaceOwnRow() {
        const host = this.host, variant = this.record();
        if (!variant) return '';
        const tt = text => rrEscapeHtml(this._t(text));
        return host._cardRow(tt('Surface'), variant.surface === undefined
            ? `<span class="r3d-flabel">${tt("Model's own")}</span>`
            : `<button type="button" class="r3d-fbtn r3d-look-surface-own" style="text-align:center;">${tt("Use the model's")}</button>`);
    }

    bindSurfaceOwn(form) {
        const variant = this.record();
        form.querySelector('.r3d-look-surface-own')?.addEventListener('click', () => {
            if (!variant) return;
            this.begin();
            delete variant.surface;
            this.end();
            this.changed();
            this.render();
        });
    }

    /** The surface the Surface section shows: the variant's own, else (a copy of) the model's. */
    surfaceInView() {
        const host = this.host, variant = this.record();
        if (!variant) return host.rawSurface;
        if (variant.surface === false) return null;
        if (variant.surface) return variant.surface;
        return host.rawSurface ? Object.assign({}, host.rawSurface) : null;
    }

    /** The Surface section changed its surface (an object, or null for none): the variant's own from now on. */
    setSurface(value) {
        const host = this.host, variant = this.record();
        if (!variant) { host.rawSurface = value; return; }
        variant.surface = value || false;
    }

    /** Whether the look in view leaves a media surface off. */
    mediaOff(raw) {
        if (!raw || raw === this.host._effectWork) return false;
        return !this.shows(raw);
    }

    /** The media surfaces on show follow the look in view. */
    refreshMedia() {
        const host = this.host;
        const previews = [host].concat(host._additionalEffectPreviews ? Array.from(host._additionalEffectPreviews.values()) : []);
        for (const preview of previews) if (preview._fxVideo) preview._playVideoPreview(preview._fxVideo.raw);
    }

    /** The file a media surface shows in the look in view. */
    mediaFileFor(raw) {
        const variant = this.record(), over = variant && variant.media && raw ? variant.media[raw.name] : undefined;
        return over && over.file ? over.file : (raw && raw.video ? raw.video.file : '');
    }
}

// The editor draws a project that is not its own page: a variant's texture is under the open project.
if (typeof globalThis !== 'undefined' && typeof globalThis.RRVariantTextureUrl !== 'function') {
    globalThis.RRVariantTextureUrl = (model, file) => {
        try {
            const project = typeof window !== 'undefined' && window.reactor && window.reactor.projectController && window.reactor.projectController.getCurrentProject && window.reactor.projectController.getCurrentProject();
            if (!project || !project.path || typeof require !== 'function') return null;
            const absolute = require('path').join(project.path, '3d', model, 'textures', file);
            return typeof RRAssetFiles !== 'undefined' && RRAssetFiles.toUrl ? RRAssetFiles.toUrl(absolute) : 'file://' + absolute;
        } catch (error) {
            return null;
        }
    };
}

if (typeof globalThis !== 'undefined') globalThis.ModelVariantsPanel = ModelVariantsPanel;
if (typeof module !== 'undefined' && module.exports) module.exports = ModelVariantsPanel;
