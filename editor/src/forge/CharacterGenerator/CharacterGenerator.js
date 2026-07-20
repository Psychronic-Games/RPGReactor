/**
 * CharacterGenerator — dual-mode character sprite tool.
 *
 * TAB 1 — Procedural: draws characters from code using the part registry
 *   (CharacterRenderer + pixel/palette helpers + RR_CHARACTER_REGISTRY parts).
 *   Supports male/female human bodies for now; more types added over time.
 *   Exports a standard 3×4 walking sprite sheet at the configured cell size.
 *
 * TAB 2 — Parts (PNG): compositor that layers user-supplied PNG sprite sheets
 *   from the active style's forge/character_generator/styles/<style>/parts/ folder.
 *   Useful when artists hand-draw their own parts.
 *
 * ForgeManager owns the modal frame/close button; this class fills the inner
 * content area via renderInto().
 */
class CharacterGenerator {
    constructor() {
        this.root              = null;
        this.projectController = null;
        this.projectPath       = null;
        this.activeTab         = 'procedural';
        this.characterStyle    = 'psychronic';
        this._knownCharacterStyles = new Set(['psychronic']);

        // ── Procedural state ──────────────────────────────────────────────────
        this.gender    = 'male';
        this.direction = 0;        // 0=front 1=left 2=right 3=back
        this.walkFrame = 1;        // 0-2; 1 = idle centre
        this.proceduralAnimating = false;
        this._procAnimTimer = null;
        // Resolved on first render once the registry is populated; see
        // _findBodyId. Null here means "fall back to the first body part".
        this.selectedProceduralPartId = null;
        this.templateAlignX = 'center';
        this.templateAlignY = 'middle';
        // Per-part param overrides: { partId: { paramKey: value, paletteOverrides: { letter: hex } } }
        this.partParams = {};

        // Active parts (rendered in scene) and explicit layer order. The body
        // is always present as the bottom layer; users add/remove other parts.
        this.activePartIds = new Set();
        this.activeLayerOrder = [];
        this.hiddenPartIds = new Set();
        this.proceduralSearchQuery = '';
        this.collapsedCategories = new Set();

        // ── Parts (PNG compositor) state ──────────────────────────────────────
        this.frameWidth           = 144;
        this.frameHeight          = 144;
        this.categories           = [];
        this.imageCache           = new Map();
        this.activeCategoryIndex  = 0;
        this.previewDirection     = 2;
        this.previewWalkFrame     = 1;
        this.previewAnimating     = false;
        this._animTimer           = null;
        this.gridEnabled          = false;
        this.gridStep             = 16;
        this._savedLayerOrder     = [];
        this._savedLayerOrderByStyle = {};
        this._forgeCfgByStyle     = {};
        this._forgeDebugZones     = false;
        this._forgeDebugZone      = 'all';
        this._forgeZoneEditMode   = false;
        this._forgeZoneEditZone   = 'head';
        this._forgeZoneEditBrush  = 1;
        this._forgeZoneEditAction = 'paint';
        this._forgeZoneEdits      = {};
        this._forgePreviewZoom    = 3;
        this._forgePreviewCache   = new Map();
        this._forgePreviewCacheOwner = null;
        this._forgePreviewCacheDescriptor = null;
        this._forgePreviewRaf = 0;
        this._forgePreviewNeedsThumbnails = false;
        this._hairCfgByStyle     = {};
        this._hairPreviewZoom    = 4;
        this._hairPreviewCache   = new Map();
        this._hairPreviewCacheOwner = null;
        this._hairPreviewCacheDescriptor = null;
        this._projectPartDescriptors = new Set();

        if (typeof window !== 'undefined') {
            window.addEventListener('rr-language-changed', () => {
                if (!this.root) return;
                const project = this.projectController?.getCurrentProject?.() || this.projectController?.currentProject;
                if (!project) {
                    this.root.innerHTML = `<div style="padding:40px;text-align:center;color:var(--color-text-muted);font-size:12px;">${this._t('forge.openProject')}</div>`;
                    return;
                }
                this._render();
            });
        }
    }

    _t(key, params = {}) {
        return typeof window !== 'undefined' && window.I18n ? window.I18n.t(key, params) : key;
    }

    _escapeHtml(value) {
        if (typeof globalThis.rrEscapeHtml === 'function') return globalThis.rrEscapeHtml(value);
        return require('../../utils/HtmlEscape.js')(value);
    }

    get sheetWidth()  { return this.frameWidth  * 3; }
    get sheetHeight() { return this.frameHeight * 4; }

    renderInto(containerEl, projectController) {
        this.projectController = projectController;
        this.root = containerEl;
        if (!this._syncProjectPath()) {
            this.root.innerHTML = `<div style="padding:40px;text-align:center;color:var(--color-text-muted);font-size:12px;">${this._t('forge.openProject')}</div>`;
            return;
        }
        this._loadConfig();
        this._loadProceduralParts();
        this._render();
    }

    /** Re-read the open project path. Forge tools are cached across project switches. */
    _syncProjectPath() {
        const project = this.projectController?.getCurrentProject?.() || this.projectController?.currentProject;
        const next = project?.path || null;
        if (!next) {
            this.projectPath = null;
            return null;
        }
        if (next !== this.projectPath) {
            this._removeProjectParts();
            this.projectPath = next;
            if (this.imageCache && typeof this.imageCache.clear === 'function') this.imageCache.clear();
            this.categories = [];
            this.activeCategoryIndex = 0;
        }
        return this.projectPath;
    }

    _requireProjectPath() {
        const path = this._syncProjectPath();
        if (!path) {
            alert(this._t('forge.openProject'));
            return null;
        }
        return path;
    }

    _loadProceduralParts() {
        // Engine-bundled styles ship with the editor and load for every project
        // (new users get a baseline character roster out of the box). Project
        // styles live under <projectPath>/forge/character_generator/styles/ and
        // stack on top — ids already registered by the engine pass are kept on
        // the engine version, so project copies don't accidentally override
        // shipped parts unless the user removes them first.
        const path = require('path');
        const existingIds = new Set(RR_CHARACTER_REGISTRY.map(d => d.id));
        if (window.RPGReactorHost?.mode !== 'web') {
            this._loadPartsFromRoot(
                path.join(process.cwd(), 'src', 'forge', 'CharacterGenerator', 'styles'),
                existingIds,
                false
            );
        }
        if (this._isProjectCodeTrusted()) this._loadProjectProceduralParts(existingIds);
    }

    _loadProjectProceduralParts(existingIds = new Set(RR_CHARACTER_REGISTRY.map(d => d.id))) {
        if (!this.projectPath || !this._isProjectCodeTrusted()) return false;
        const path = require('path');
        this._loadPartsFromRoot(
            path.join(this.projectPath, 'forge', 'character_generator', 'styles'),
            existingIds,
            true
        );
        return true;
    }

    _projectCodeTrustKey() {
        if (!this.projectPath) return null;
        let canonical = this.projectPath;
        try { canonical = require('fs').realpathSync(this.projectPath); } catch (_) {}
        if (process.platform === 'win32') canonical = canonical.toLowerCase();
        return `rpg-reactor.trusted-project-code:${canonical}`;
    }

    _isProjectCodeTrusted(storage = globalThis.localStorage) {
        const key = this._projectCodeTrustKey();
        if (!key || !storage) return false;
        try { return storage.getItem(key) === 'true'; } catch (_) { return false; }
    }

    _setProjectCodeTrusted(trusted, storage = globalThis.localStorage) {
        const key = this._projectCodeTrustKey();
        if (!key || !storage) return false;
        try {
            if (trusted) storage.setItem(key, 'true');
            else storage.removeItem(key);
            return true;
        } catch (_) {
            return false;
        }
    }

    _removeProjectParts() {
        if (!this._projectPartDescriptors?.size || typeof RR_CHARACTER_REGISTRY === 'undefined') return;
        for (let i = RR_CHARACTER_REGISTRY.length - 1; i >= 0; i--) {
            if (this._projectPartDescriptors.has(RR_CHARACTER_REGISTRY[i])) RR_CHARACTER_REGISTRY.splice(i, 1);
        }
        this._projectPartDescriptors.clear();
        this.activePartIds = new Set([...this.activePartIds].filter(id => RR_CHARACTER_REGISTRY.some(d => d.id === id)));
        this.activeLayerOrder = this.activeLayerOrder.filter(id => RR_CHARACTER_REGISTRY.some(d => d.id === id));
    }

    _projectCodeTrustControlsHTML() {
        if (typeof window === 'undefined' || window.RPGReactorHost?.mode === 'web') return '';
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        const trusted = this._isProjectCodeTrusted();
        const message = trusted
            ? tt('Project JavaScript character parts are trusted and may execute with editor privileges.')
            : tt('Project JavaScript character parts are disabled. Only trust projects whose code you have reviewed.');
        const action = trusted ? tt('Revoke Project JS Trust') : tt('Trust and Load Project JS');
        return `<div class="rr-cg-project-code-trust" style="display:flex;align-items:center;gap:10px;padding:7px 16px;background:${trusted ? 'var(--color-bg-panel)' : 'var(--color-warning-bg, #3a2d12)'};border-bottom:1px solid var(--color-border);font-size:10px;color:var(--color-text-muted);">
            <span style="flex:1;">${this._escapeHtml(message)}</span>
            <button type="button" class="rr-cg-project-code-trust-action rr-btn-chip" style="padding:3px 9px;font-size:10px;">${this._escapeHtml(action)}</button>
        </div>`;
    }

    _wireProjectCodeTrustControls() {
        const button = this.root?.querySelector('.rr-cg-project-code-trust-action');
        if (!button) return;
        button.addEventListener('click', () => {
            const tt = text => window.I18n ? window.I18n.tText(text) : text;
            if (this._isProjectCodeTrusted()) {
                this._setProjectCodeTrusted(false);
                this._removeProjectParts();
                this._render();
                return;
            }
            const warning = tt('Project JavaScript runs with full editor and filesystem access. Trust and load it?');
            if (!window.confirm(warning) || !this._setProjectCodeTrusted(true)) return;
            this._loadProjectProceduralParts();
            this._render();
        });
    }

    _loadPartsFromRoot(root, existingIds, projectLocal = false) {
        const fs = require('fs');
        const path = require('path');
        if (!fs.existsSync(root)) return;
        const styles = fs.readdirSync(root, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name);
        for (const style of styles) {
            this._knownCharacterStyles.add(style.toLowerCase());
            const partsRoot = path.join(root, style, 'parts');
            if (!fs.existsSync(partsRoot)) continue;
            const categories = fs.readdirSync(partsRoot, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name);
            for (const cat of categories) {
                this._loadCategoryDir(path.join(partsRoot, cat), [style.toLowerCase()], existingIds, projectLocal);
            }
        }
    }

    _loadCategoryDir(dir, autoTags, existingIds, projectLocal = false) {
        // Walk a category directory recursively. Subdirectory names are added
        // as auto-tags on every descriptor loaded under them (e.g. a file in
        // parts/body/female/foo.js gets a 'female' tag), which lets the picker
        // gender-filter and the body lookup find them without the part author
        // having to remember to tag manually.
        const fs = require('fs');
        const path = require('path');
        let entries;
        try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
        catch (_) { return; }
        for (const e of entries) {
            const full = path.join(dir, e.name);
            if (e.isDirectory()) {
                this._loadCategoryDir(full, [...autoTags, e.name.toLowerCase()], existingIds, projectLocal);
                continue;
            }
            if (!e.name.endsWith('.js')) continue;
            try {
                const js = fs.readFileSync(full, 'utf8');
                const before = RR_CHARACTER_REGISTRY.length;
                (new Function(js))();
                const added = RR_CHARACTER_REGISTRY.slice(before);
                for (const a of added) {
                    if (existingIds.has(a.id)) {
                        const idx = RR_CHARACTER_REGISTRY.lastIndexOf(a);
                        if (idx >= 0) RR_CHARACTER_REGISTRY.splice(idx, 1);
                        continue;
                    }
                    // Merge autoTags into the descriptor (dedupe to avoid noise).
                    if (autoTags.length) {
                        const cur = new Set((a.tags || []).map(t => String(t).toLowerCase()));
                        for (const t of autoTags) cur.add(t);
                        a.tags = Array.from(cur);
                    }
                    existingIds.add(a.id);
                    if (projectLocal) this._projectPartDescriptors.add(a);
                }
            } catch (err) {
                console.warn('Failed to load part file', full, err);
            }
        }
    }

    detach() {
        if (this._animTimer) { clearInterval(this._animTimer); this._animTimer = null; }
        if (this._procAnimTimer) { clearInterval(this._procAnimTimer); this._procAnimTimer = null; }
        if (this._forgeAnimTimer) { clearInterval(this._forgeAnimTimer); this._forgeAnimTimer = null; }
        if (this._hairAnimTimer) { clearInterval(this._hairAnimTimer); this._hairAnimTimer = null; }
        this.previewAnimating = false;
        this.proceduralAnimating = false;
        this._forgeWalking = false;
        this._hairWalking = false;
    }
    close() { this.detach(); }

    // ── Shared layout ─────────────────────────────────────────────────────────

    _render() {
        const tt = (text) => (typeof window !== 'undefined' && window.I18n) ? window.I18n.tText(text) : text;
        // Capture scroll positions of every panel before we blow away the DOM,
        // then restore them once the new DOM is in place. Applied here so every
        // button that calls _render() gets scroll preservation for free.
        const scrolls = {};
        this.root?.querySelectorAll('[class*="-scroll"]').forEach(el => {
            const cls = Array.from(el.classList).find(c => c.endsWith('-scroll'));
            if (cls) scrolls[cls] = el.scrollTop;
        });
        this.root.innerHTML = `
            <div style="display:flex;flex-direction:column;height:100%;min-height:0;">
                ${this._projectCodeTrustControlsHTML()}
                <div style="display:flex;align-items:flex-end;gap:2px;padding:0 16px;background:var(--color-bg-panel);border-bottom:1px solid var(--color-border);flex-shrink:0;">
                    ${this._tabBtn('procedural', this._t('forge.tab.procedural'))}
                    ${this._tabBtn('forge',       this._t('forge.tab.outfit'))}
                    ${this._tabBtn('hair',        this._t('forge.tab.hair'))}
                    ${this._tabBtn('parts',       this._t('forge.tab.parts'))}
                    <div style="margin-left:auto;display:flex;align-items:center;gap:6px;padding:6px 0 5px;">
                        <label style="font-size:10px;color:var(--color-text-muted);">${this._t('forge.style')}</label>
                        <select class="rr-cg-style-select rr-input" style="padding:3px 8px;font-size:11px;min-width:120px;">
                            ${this._characterStyles().map(s => `<option value="${this._escapeHtml(s.id)}" ${this.characterStyle === s.id ? 'selected' : ''}>${this._escapeHtml(tt(s.name))}</option>`).join('')}
                        </select>
                    </div>
                </div>
                <div style="flex:1;min-height:0;overflow:hidden;display:flex;flex-direction:column;">
                    ${this.activeTab === 'procedural' ? this._proceduralHTML()
                        : this.activeTab === 'forge' ? this._forgeHTML()
                        : this.activeTab === 'hair' ? this._hairHTML()
                        : this._partsHTML()}
                </div>
            </div>`;
        this._wireProjectCodeTrustControls();
        this.root.querySelectorAll('.rr-cg-tab').forEach(btn => {
            btn.addEventListener('click', () => {
                if (this._procAnimTimer) {
                    clearInterval(this._procAnimTimer);
                    this._procAnimTimer = null;
                    this.proceduralAnimating = false;
                    this.walkFrame = 1;
                }
                if (this._forgeAnimTimer) {
                    clearInterval(this._forgeAnimTimer);
                    this._forgeAnimTimer = null;
                    this._forgeWalking = false;
                }
                if (this._hairAnimTimer) {
                    clearInterval(this._hairAnimTimer);
                    this._hairAnimTimer = null;
                    this._hairWalking = false;
                }
                this.activeTab = btn.dataset.tab;
                this._render();
            });
        });
        const styleSelect = this.root.querySelector('.rr-cg-style-select');
        if (styleSelect) {
            styleSelect.addEventListener('change', () => this._setCharacterStyle(styleSelect.value));
        }
        if (this.activeTab === 'procedural') {
            this._drawProceduralPreview();
            this._wireProceduralEvents();
        } else if (this.activeTab === 'forge') {
            this._wireForgeEvents();
            this._drawForgePreview();
        } else if (this.activeTab === 'hair') {
            this._wireHairEvents();
            this._drawHairPreview();
        } else {
            this._ensurePartsFolder();
            this._loadConfig();
            this._loadCategories();
            this._wirePartsEvents();
            this._renderPartsPreview();
        }
        // Restore captured scroll positions on the freshly-rendered DOM.
        Object.entries(scrolls).forEach(([cls, top]) => {
            const el = this.root?.querySelector('.' + cls);
            if (el) el.scrollTop = top;
        });
    }

    _tabBtn(id, label) {
        const on = this.activeTab === id;
        return `<button class="rr-cg-tab" data-tab="${id}" style="padding:7px 16px;cursor:pointer;font-size:12px;border-radius:4px 4px 0 0;border:1px solid ${on ? 'var(--color-border)' : 'transparent'};border-bottom:${on ? '1px solid var(--color-bg-base)' : 'none'};margin-bottom:${on ? '-1px' : '0'};background:${on ? 'var(--color-bg-base)' : 'transparent'};color:${on ? 'var(--color-text-strong)' : 'var(--color-text-muted)'};">${label}</button>`;
    }

    _characterStyles() {
        const ids = new Set(this._knownCharacterStyles || ['psychronic']);
        if (this.projectPath && typeof require === 'function') {
            try {
                const fs = require('fs');
                const path = require('path');
                const root = path.join(this.projectPath, 'forge', 'character_generator', 'styles');
                for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
                    if (entry.isDirectory()) ids.add(entry.name.toLowerCase());
                }
            } catch (_) {}
        }
        return [...ids]
            .sort((a, b) => a === 'psychronic' ? -1 : b === 'psychronic' ? 1 : a.localeCompare(b))
            .map(id => ({
                id,
                name: id === 'psychronic' ? 'Psychronic' : id.replace(/(^|[-_])([a-z])/g, (_m, sep, ch) => `${sep ? ' ' : ''}${ch.toUpperCase()}`)
            }));
    }

    _styleDisplayName(styleId = this.characterStyle) {
        return this._characterStyles().find(s => s.id === styleId)?.name || styleId;
    }

    _setCharacterStyle(styleId) {
        if (!this._characterStyles().some(s => s.id === styleId)) return;
        if (styleId === this.characterStyle) return;
        this.characterStyle = styleId;
        this.activeCategoryIndex = 0;
        this.categories = [];
        this.imageCache.clear();
        this.selectedProceduralPartId = null;
        this._forgeDescCache = null;
        this._hairDescCache = null;
        this._savedLayerOrder = this._savedLayerOrderByStyle[this.characterStyle] || [];
        this._saveConfig();
        this._render();
    }

    // ═══════════════════════════════════════════════════════════════════════════
    //  TAB — OUTFIT FORGE (procedural outfit generator)
    //  Builds full-outfit parts from a per-zone palette/style config using the
    //  shared engine (procgen/outfit_engine.js). Live preview + save-to-library.
    // ═══════════════════════════════════════════════════════════════════════════

    _outfitEngine() {
        if (this._engineCache !== undefined) return this._engineCache;
        if (typeof RR_OutfitEngine !== 'undefined') {
            this._engineCache = RR_OutfitEngine;
            return this._engineCache;
        }
        try {
            const path = require('path');
            const abs = path.join(process.cwd(), 'src', 'forge', 'CharacterGenerator', 'procgen', 'outfit_engine.js');
            this._engineCache = require(abs);
        } catch (e) {
            console.warn('Outfit Forge: failed to load engine', e);
            this._engineCache = null;
        }
        return this._engineCache;
    }

    _forgeSchema() {
        const eng = this._outfitEngine();
        if (!eng) return null;
        const styleId = this.characterStyle || 'psychronic';
        return Object.assign({}, eng.UI_SCHEMA, {
            partSets: (eng.UI_SCHEMA.partSets || []).filter(set => (set.style || 'psychronic') === styleId)
        });
    }

    _forgeDefaultConfigForStyle() {
        const eng = this._outfitEngine();
        const schema = this._forgeSchema();
        const styleId = this.characterStyle || 'psychronic';
        if (!eng || !schema) return { name: 'New Outfit', category: 'full outfits', tags: [], zones: {}, extensions: [] };
        if (typeof eng.defaultConfig === 'function') return eng.defaultConfig(styleId);

        const zones = {};
        for (const z of (schema.zones || [])) {
            const params = {};
            for (const p of z.params || []) params[p.key] = p.default;
            zones[z.key] = {
                enabled: true,
                layer: z.defaultLayer || 0,
                style: (z.styles && z.styles[0]) || '',
                family: 'steel',
                accent: 'cyan',
                params
            };
        }
        return {
            name: `${this._styleDisplayName(styleId)} Outfit`,
            category: 'full outfits',
            tags: [styleId, this.gender, 'procgen'],
            paletteTheme: 'nova-sentinel',
            zones,
            extensions: []
        };
    }

    _forgeBodyTemplate() {
        const id = this._activeBodyId();
        const d = RR_CHARACTER_REGISTRY.find(x => x.id === id);
        return d && d.template && d.template.sheet ? d.template : null;
    }

    _migrateForgeLayerDefaults(cfg) {
        if (!cfg) return cfg;
        const belt = cfg.zones && cfg.zones.belt;
        const torso = cfg.zones && cfg.zones.torso;
        if (!cfg._beltLayerMigrated && belt && torso && Number(belt.layer || 0) <= Number(torso.layer || 0)) {
            belt.layer = Number(torso.layer || 0) + 5;
            if (Array.isArray(cfg.layerOrder)) {
                const withoutBelt = cfg.layerOrder.filter(id => id !== 'zone:belt');
                const torsoIndex = withoutBelt.indexOf('zone:torso');
                if (torsoIndex >= 0) withoutBelt.splice(torsoIndex, 0, 'zone:belt');
                else withoutBelt.push('zone:belt');
                cfg.layerOrder = withoutBelt;
            }
        }
        const gauntlet = cfg.exts && cfg.exts.armGauntlet;
        const arms = cfg.zones && cfg.zones.arms;
        if (!cfg._gauntletLayerMigrated && gauntlet && arms && Number(gauntlet.layer || 0) <= Number(arms.layer || 0)) {
            gauntlet.layer = Number(arms.layer || 0) + 5;
            if (Array.isArray(cfg.layerOrder)) {
                const withoutGauntlet = cfg.layerOrder.filter(id => id !== 'ext:armGauntlet');
                const armsIndex = withoutGauntlet.indexOf('zone:arms');
                if (armsIndex >= 0) withoutGauntlet.splice(armsIndex, 0, 'ext:armGauntlet');
                else withoutGauntlet.push('ext:armGauntlet');
                cfg.layerOrder = withoutGauntlet;
            }
            this._forgeDescCache = null;
        }
        if (!cfg._gauntletBandedMigrated && gauntlet) {
            gauntlet.params = gauntlet.params || {};
            if (gauntlet.params.banded !== true) {
                gauntlet.params.banded = true;
                this._forgeDescCache = null;
            }
        }
        if (!cfg._beltLayerMigrated) Object.defineProperty(cfg, '_beltLayerMigrated', { value: true, enumerable: false, configurable: true });
        if (!cfg._gauntletLayerMigrated) Object.defineProperty(cfg, '_gauntletLayerMigrated', { value: true, enumerable: false, configurable: true });
        if (!cfg._gauntletBandedMigrated) Object.defineProperty(cfg, '_gauntletBandedMigrated', { value: true, enumerable: false, configurable: true });
        return cfg;
    }

    // Lazy-init the working config in a UI-friendly shape (extensions keyed by
    // type with an `enabled` flag so toggles don't reshuffle the DOM).
    _forgeConfig() {
        const styleId = this.characterStyle || 'psychronic';
        if (this._forgeCfgByStyle && this._forgeCfgByStyle[styleId]) return this._migrateForgeLayerDefaults(this._forgeCfgByStyle[styleId]);
        const eng = this._outfitEngine();
        const schema = this._forgeSchema();
        const base = eng ? this._forgeDefaultConfigForStyle() : { name: 'New Outfit', category: 'full outfits', tags: [], zones: {}, extensions: [] };
        const exts = {};
        for (const ex of (schema ? schema.extensions : [])) {
            const fromBase = (base.extensions || []).find(e => e.type === ex.type);
            const params = {};
            for (const p of ex.params) params[p.key] = fromBase ? fromBase.params[p.key] : p.default;
            exts[ex.type] = {
                enabled: !!fromBase,
                layer: fromBase && fromBase.layer != null ? fromBase.layer : (ex.defaultLayer || 55),
                family: fromBase ? fromBase.family : 'steel',
                accent: fromBase ? (fromBase.accent || '') : 'cyan',
                params
            };
        }
        const zones = {};
        for (const z of (schema ? schema.zones : [])) {
            const fromBase = (base.zones || {})[z.key] || {};
            const params = {};
            for (const p of z.params) params[p.key] = fromBase.params && fromBase.params[p.key] !== undefined ? fromBase.params[p.key] : p.default;
            zones[z.key] = {
                enabled: fromBase.enabled !== false,
                layer: fromBase.layer != null ? fromBase.layer : (z.defaultLayer || 0),
                style: fromBase.style || z.styles[0],
                family: fromBase.family || 'steel',
                accent: fromBase.accent || '',
                params
            };
        }
        const layerOrder = [];
        for (const z of (schema ? schema.zones : [])) layerOrder.push(`zone:${z.key}`);
        for (const ex of (schema ? schema.extensions : [])) layerOrder.push(`ext:${ex.type}`);
        layerOrder.sort((a, b) => {
            const layerOf = (id) => id.startsWith('zone:') ? (zones[id.slice(5)].layer || 0) : (exts[id.slice(4)].layer || 0);
            return layerOf(b) - layerOf(a);
        });
        const selectedParts = {};
        for (const set of (schema ? schema.partSets || [] : [])) for (const part of (set.parts || [])) {
            const id = `${part.kind}:${part.key}`;
            const active = part.kind === 'zone' ? zones[part.key] && zones[part.key].enabled !== false : exts[part.key] && !!exts[part.key].enabled;
            if (active && !selectedParts[id]) selectedParts[id] = { setKey: set.key, partId: part.id };
        }
        this._forgeCfgByStyle = this._forgeCfgByStyle || {};
        this._forgeCfgByStyle[styleId] = this._migrateForgeLayerDefaults({ name: base.name, category: base.category, tags: base.tags, paletteTheme: base.paletteTheme || 'nova-sentinel', customPalettes: base.customPalettes || {}, zones, layerOrder, exts, selectedParts });
        return this._forgeCfgByStyle[styleId];
    }

    _forgeSyncZoneLayers() {
        const cfg = this._forgeConfig();
        const order = cfg.layerOrder || Object.keys(cfg.zones || {}).map(k => `zone:${k}`);
        order.forEach((key, i) => {
            const layer = (order.length - i) * 10;
            if (key.startsWith('zone:') && cfg.zones[key.slice(5)]) cfg.zones[key.slice(5)].layer = layer;
            else if (key.startsWith('ext:') && cfg.exts[key.slice(4)]) cfg.exts[key.slice(4)].layer = layer;
        });
    }

    // Build the engine-shaped config and generate a live part descriptor.
    _forgeDescriptor() {
        const eng = this._outfitEngine();
        const body = this._forgeBodyTemplate();
        if (!eng || !body) return null;
        const cfg = this._forgeConfig();
        this._forgeSyncZoneLayers();
        const config = this._forgeEngineConfig(cfg);
        let result;
        try { result = eng.generateOutfit(config, body); }
        catch (e) { console.warn('Outfit Forge: generate failed', e); return null; }
        return {
            id: 'forge-preview', category: 'full outfits', name: cfg.name,
            tags: config.tags, params: [],
            template: { palette: result.palette, sheet: result.sheet },
            draw(buf, W, H, direction, frame, params) {
                RR_CG_drawTemplatePart(buf, W, H, direction, frame, params, this);
            }
        };
    }

    _forgeThemeSlot(layerId) {
        const cfg = this._forgeConfig();
        const schema = this._forgeSchema();
        if (!schema) return null;
        if (cfg.paletteTheme === 'custom') return cfg.customPalettes && cfg.customPalettes[layerId] ? cfg.customPalettes[layerId] : null;
        const theme = (schema.paletteThemes || []).find(t => t.key === (cfg.paletteTheme || 'nova-sentinel'));
        return theme && theme.slots && theme.slots[layerId] ? theme.slots[layerId] : null;
    }

    _forgeApplyThemeToPreviewSpec(spec, layerId) {
        const out = JSON.parse(JSON.stringify(spec || {}));
        const theme = this._forgeThemeSlot(layerId);
        if (theme) {
            out.family = theme.family;
            out.accent = theme.accent || '';
        }
        return out;
    }

    _forgePartPreviewDescriptor(layerId, spec) {
        const eng = this._outfitEngine();
        const body = this._forgeBodyTemplate();
        if (!eng || !body || !layerId || !spec) return null;
        const previewSpec = JSON.parse(JSON.stringify(spec));
        previewSpec.enabled = true;
        // Memoize by spec: a control change re-renders every part thumbnail
        // (~20), but only one layer's spec actually changed — and each miss
        // is a full 12-frame engine run.
        const memoKey = `${this.characterStyle || 'psychronic'}|${layerId}|${JSON.stringify(previewSpec)}`;
        if (!this._forgeThumbMemo) this._forgeThumbMemo = new Map();
        const memoized = this._forgeThumbMemo.get(memoKey);
        if (memoized) return memoized;
        const config = { name: 'Part Preview', category: 'full outfits', tags: [], zones: {}, extensions: [] };
        config.style = this.characterStyle || 'psychronic';
        if (layerId.startsWith('zone:')) {
            config.zones[layerId.slice(5)] = previewSpec;
        } else if (layerId.startsWith('ext:')) {
            const type = layerId.slice(4);
            config.extensions.push(Object.assign({ type }, previewSpec));
        } else {
            return null;
        }
        config.tags = this._forgeTags({ tags: [] });
        let result;
        try { result = eng.generateOutfit(config, body); }
        catch (e) { console.warn('Outfit Forge: thumbnail generation failed', e); return null; }
        const descriptor = { template: { palette: result.palette, sheet: result.sheet } };
        if (this._forgeThumbMemo.size > 200) this._forgeThumbMemo.clear();
        this._forgeThumbMemo.set(memoKey, descriptor);
        return descriptor;
    }

    _drawForgeTemplateThumbnail(canvas, descriptor) {
        const template = descriptor && descriptor.template;
        if (!canvas || !template || !template.sheet || !template.palette) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        const frame = (this._forgeFrame === undefined) ? 1 : this._forgeFrame;
        const dirFrames = template.sheet[0] || [];
        const rows = dirFrames[Math.min(frame, Math.max(0, dirFrames.length - 1))] || dirFrames[0] || [];
        const W = canvas.width || 40;
        const H = canvas.height || 40;
        ctx.clearRect(0, 0, W, H);

        let minX = Infinity, minY = Infinity, maxX = -1, maxY = -1;
        for (let y = 0; y < rows.length; y++) {
            const row = rows[y] || '';
            const rowW = this._templateRowWidth(row);
            for (let x = 0; x < rowW; x++) {
                const ch = this._templateRowAt(row, x);
                if (this._templateCellBlank(ch) || !template.palette[String(ch)]) continue;
                if (x < minX) minX = x;
                if (x > maxX) maxX = x;
                if (y < minY) minY = y;
                if (y > maxY) maxY = y;
            }
        }
        if (maxX < minX || maxY < minY) return;

        const srcW = maxX - minX + 1;
        const srcH = maxY - minY + 1;
        const src = document.createElement('canvas');
        src.width = srcW;
        src.height = srcH;
        const sctx = src.getContext('2d');
        sctx.clearRect(0, 0, srcW, srcH);
        for (let y = minY; y <= maxY; y++) {
            const row = rows[y] || '';
            for (let x = minX; x <= maxX; x++) {
                const ch = this._templateRowAt(row, x);
                const pal = template.palette[String(ch)];
                if (!pal || !pal.hex) continue;
                sctx.fillStyle = pal.hex;
                sctx.fillRect(x - minX, y - minY, 1, 1);
            }
        }

        const pad = 3;
        const scale = Math.min((W - pad * 2) / srcW, (H - pad * 2) / srcH);
        const drawW = Math.max(1, Math.round(srcW * scale));
        const drawH = Math.max(1, Math.round(srcH * scale));
        const dx = Math.floor((W - drawW) / 2);
        const dy = Math.floor((H - drawH) / 2);
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(src, 0, 0, srcW, srcH, dx, dy, drawW, drawH);
    }

    _templateRowWidth(row) {
        return (typeof row === 'string' || Array.isArray(row)) ? row.length : 0;
    }

    _templateRowAt(row, x) {
        if (typeof row === 'string' || Array.isArray(row)) return row[x];
        return null;
    }

    _templateCellBlank(ch) {
        return ch === undefined || ch === null || ch === '' || ch === ' ' || ch === '.' || ch === -1;
    }

    _padTemplateRow(row, width) {
        if (Array.isArray(row)) {
            const out = row.slice();
            while (out.length < width) out.push(null);
            return out;
        }
        return String(row || '').padEnd(width, ' ');
    }

    _formatTemplateRowLiteral(row, padWidth = null) {
        if (Array.isArray(row)) return JSON.stringify(padWidth ? this._padTemplateRow(row, padWidth) : row);
        const text = padWidth ? String(row || '').padEnd(padWidth, ' ') : String(row || '');
        return JSON.stringify(text);
    }

    _drawForgePartThumbnails() {
        if (!this.root) return;
        const canvases = this.root.querySelectorAll('.rr-forge-part-thumb');
        if (!canvases.length) return;
        const eng = this._outfitEngine();
        const cfg = this._forgeConfig();
        const schema = this._forgeSchema();
        if (!eng || !schema) return;
        const partSets = schema.partSets || [];
        canvases.forEach(canvas => {
            const layerId = canvas.getAttribute('data-forge-thumb-layer');
            let spec = null;
            if (canvas.getAttribute('data-forge-thumb-source') === 'active') {
                spec = layerId && layerId.startsWith('zone:') ? cfg.zones[layerId.slice(5)]
                    : layerId && layerId.startsWith('ext:') ? cfg.exts[layerId.slice(4)]
                    : null;
                if (spec) spec = JSON.parse(JSON.stringify(spec));
            } else {
                const setKey = canvas.getAttribute('data-forge-thumb-set');
                const partId = canvas.getAttribute('data-forge-thumb-id');
                const set = partSets.find(s => s.key === setKey);
                const part = set && (set.parts || []).find(p => p.id === partId);
                if (part && part.spec) spec = this._forgeApplyThemeToPreviewSpec(part.spec, layerId);
            }
            const descriptor = this._forgePartPreviewDescriptor(layerId, spec);
            this._drawForgeTemplateThumbnail(canvas, descriptor);
        });
    }

    _forgeHTML() {
        const tt = (text) => (typeof window !== 'undefined' && window.I18n) ? window.I18n.tText(text) : text;
        const eng = this._outfitEngine();
        const body = this._forgeBodyTemplate();
        if (!eng || !body) {
            return `<div style="padding:24px;color:var(--color-text-muted);font-size:12px;">
                ${tt('Outfit Forge needs the outfit engine and a body part loaded.')}
                ${!eng ? '<br>' + tt('Engine failed to load (see console).') : ''}
                ${!body ? '<br>' + tt('No body part found in the registry.') : ''}
            </div>`;
        }
        const cfg = this._forgeConfig();
        const schema = this._forgeSchema();
        const families = schema.families || [];
        const accents = schema.accents || [];
        const swatch = (hex) => hex ? `<span style="display:inline-block;width:10px;height:10px;border-radius:2px;border:1px solid var(--color-border-input);background:${hex};vertical-align:middle;margin-right:4px;"></span>` : '';
        const choiceMeta = (type, value) => {
            const list = type === 'family' ? families : accents;
            const found = list.find(item => item.name === (value || '')) || list[0] || { name: '', label: 'none', swatch: null };
            return { label: found.label || found.name || 'none', swatch: found.swatch || null };
        };
        const choiceButton = (type, value, attrs, width = '100%') => {
            const meta = choiceMeta(type, value);
            return `<button type="button" class="rr-forge-choice rr-input" data-forge-choice-type="${type}" data-forge-choice-value="${value || ''}" ${attrs}
                style="width:${width};display:flex;align-items:center;gap:6px;justify-content:space-between;font-size:12px;padding:4px 6px;text-align:left;cursor:pointer;">
                    <span style="min-width:0;display:flex;align-items:center;gap:6px;overflow:hidden;">
                        <span style="width:12px;height:12px;flex:0 0 auto;border-radius:2px;border:1px solid var(--color-border-input);background:${meta.swatch || 'transparent'};"></span>
                        <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${tt(meta.label)}</span>
                    </span>
                    <span style="font-size:9px;color:var(--color-text-dim);">▾</span>
                </button>`;
        };
        const numberControl = (attrs, value, min, max, step) => `<span class="rr-forge-number-wrap" style="display:inline-grid;grid-template-columns:18px 54px 18px;align-items:center;gap:2px;">
            <button type="button" class="rr-forge-num-step" data-delta="-1" style="height:20px;border:1px solid var(--color-border-input);border-radius:3px;background:var(--color-bg-button);color:var(--color-text-muted);font-size:12px;line-height:16px;cursor:pointer;padding:0;">−</button>
            <input type="number" class="rr-forge-input rr-input rr-forge-number" ${attrs} value="${value}" min="${min}" max="${max}" step="${step}" style="height:20px;width:54px;font-size:10px;padding:2px 4px;text-align:center;-moz-appearance:textfield;appearance:textfield;">
            <button type="button" class="rr-forge-num-step" data-delta="1" style="height:20px;border:1px solid var(--color-border-input);border-radius:3px;background:var(--color-bg-button);color:var(--color-text-muted);font-size:12px;line-height:16px;cursor:pointer;padding:0;">+</button>
        </span>`;
        const schemaZones = schema.zones;
        const schemaExts = schema.extensions;
        const debugZones = schemaZones.concat(schemaExts.map(ex => ({
            key: ex.type === 'pauldron' ? 'shoulders' : ex.type,
            label: ex.type === 'pauldron' ? 'Shoulders' : ex.label
        }))).concat([{ key: 'hands', label: 'Hands' }]);
        const partSets = schema.partSets || [];
        const allPresetParts = partSets.flatMap(set => (set.parts || []).map(part => ({ ...part, setKey: set.key, setLabel: set.label })));
        const layerActive = (id) => id.startsWith('zone:') ? cfg.zones[id.slice(5)] && cfg.zones[id.slice(5)].enabled !== false : cfg.exts[id.slice(4)] && !!cfg.exts[id.slice(4)].enabled;
        const selectedPartFor = (id) => {
            const sel = cfg.selectedParts && cfg.selectedParts[id];
            if (!sel) return null;
            return allPresetParts.find(p => p.setKey === sel.setKey && p.id === sel.partId) || null;
        };
        const paletteThemes = schema.paletteThemes || [];
        const activeTheme = paletteThemes.find(t => t.key === (cfg.paletteTheme || 'nova-sentinel'));
        const activeThemeLabel = cfg.paletteTheme === 'custom' ? 'Custom' : (activeTheme ? activeTheme.label : 'Nova Sentinel');
        const themeMini = (colors) => `<span style="display:flex;width:70px;height:22px;border-radius:4px;overflow:hidden;border:1px solid var(--color-border-input);flex:0 0 auto;">${(colors || ['#555']).map(c => `<span style="flex:1;background:${c};"></span>`).join('')}</span>`;
        const customColors = Object.values(cfg.customPalettes || {}).flatMap(p => [p.family && (schema.families.find(f => f.name === p.family) || {}).swatch, p.accent && (schema.accents.find(a => a.name === p.accent) || {}).swatch]).filter(Boolean);
        const partThumb = (part, source, size = 38) => {
            const layerId = `${part.kind}:${part.key}`;
            return `<canvas class="rr-forge-part-thumb" data-forge-thumb-source="${source}" data-forge-thumb-layer="${layerId}" data-forge-thumb-set="${part.setKey}" data-forge-thumb-id="${part.id}" width="${size}" height="${size}"
                style="width:${size}px;height:${size}px;flex:0 0 auto;border:1px solid var(--color-border-input);border-radius:5px;background:var(--color-bg-input-alt);image-rendering:pixelated;box-shadow:inset 0 0 0 1px rgba(255,255,255,.06);"></canvas>`;
        };
        const slotDefs = schemaZones.map(z => ({ id: `zone:${z.key}`, label: z.label, kind: 'zone', key: z.key }))
            .concat(schemaExts.map(ex => ({ id: `ext:${ex.type}`, label: ex.label, kind: 'ext', key: ex.type })));
        const themeOptions = [{ key: 'custom', label: 'Custom', colors: customColors.length ? customColors : ['#3a4250', '#5a6575', '#5dffff', '#ffdf6e'] }].concat(paletteThemes);
        const themePicker = `<details class="rr-forge-theme-dropdown" style="margin-bottom:10px;border:1px solid var(--color-border-subtle);border-radius:6px;background:var(--color-bg-panel);">
            <summary style="display:flex;align-items:center;gap:8px;cursor:pointer;padding:8px;font-size:12px;color:var(--color-text-strong);font-weight:800;">
                ${themeMini(cfg.paletteTheme === 'custom' ? customColors : (activeTheme && activeTheme.colors))}
                <span style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${tt(activeThemeLabel)}</span>
            </summary>
            <div style="padding:0 8px 8px;">
                <input class="rr-forge-theme-search rr-input" placeholder="${tt('Search palettes...')}" style="width:100%;font-size:12px;padding:5px 7px;margin-bottom:7px;">
                <div class="rr-forge-theme-options">
                    ${themeOptions.map(theme => {
                        const active = (cfg.paletteTheme || 'nova-sentinel') === theme.key;
                        return `<button type="button" class="rr-forge-palette-theme" data-forge-palette-theme="${theme.key}" data-forge-theme-label="${theme.label.toLowerCase()}"
                            style="width:100%;display:flex;align-items:center;gap:8px;margin-bottom:6px;padding:7px;border:1px solid ${active ? 'var(--color-accent-bright)' : 'var(--color-border-subtle)'};border-radius:5px;background:${active ? 'var(--color-bg-button-active)' : 'var(--color-bg-base)'};color:var(--color-text);font-size:12px;text-align:left;cursor:pointer;">
                            ${themeMini(theme.colors)}
                            <span style="font-weight:700;line-height:1.15;">${tt(theme.label)}</span>
                        </button>`;
                    }).join('')}
                </div>
            </div>
        </details>`;
        const partLibrary = slotDefs.map(slot => {
            const presets = allPresetParts.filter(part => `${part.kind}:${part.key}` === slot.id);
            const selected = layerActive(slot.id) && selectedPartFor(slot.id);
            const currentSpec = slot.kind === 'zone' ? cfg.zones[slot.key] : cfg.exts[slot.key];
            const themeSlot = activeTheme && activeTheme.slots && activeTheme.slots[slot.id];
            const customSlot = cfg.customPalettes && cfg.customPalettes[slot.id];
            const familyVal = (customSlot && customSlot.family) || (currentSpec && currentSpec.family) || (themeSlot && themeSlot.family) || 'steel';
            const accentVal = customSlot ? (customSlot.accent || '') : ((currentSpec && currentSpec.accent) || (themeSlot && themeSlot.accent) || '');
            const pill = selected ? `<div style="display:flex;align-items:center;gap:8px;max-width:100%;padding:6px;border-radius:6px;background:var(--color-bg-button-active);border:1px solid var(--color-border-input);color:var(--color-text-strong);font-size:11px;">
                ${partThumb(selected, 'active', 42)}
                <span style="min-width:0;display:flex;flex-direction:column;line-height:1.2;flex:1;">
                    <span style="font-weight:800;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${tt(selected.setLabel)}</span>
                    <span style="font-size:11px;color:var(--color-text-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${tt(selected.label)}</span>
                </span>
                <button type="button" data-forge-remove-layer="${slot.id}" title="${tt('Remove {part}').replace('{part}', tt(slot.label))}" style="border:0;background:transparent;color:var(--color-text-muted);cursor:pointer;padding:0 4px;font-size:15px;line-height:1;">×</button>
            </div>` : `<span style="font-size:11px;color:var(--color-text-muted);">${tt('No {part} selected').replace('{part}', tt(slot.label).toLowerCase())}</span>`;
            const familyOpts = families.map(f => `<option value="${f.name}" ${f.name === familyVal ? 'selected' : ''}>${tt(f.label || f.name)}</option>`).join('');
            const accentOpts = [`<option value="" ${!accentVal ? 'selected' : ''}>${tt('None')}</option>`]
                .concat(accents.map(a => `<option value="${a.name}" ${a.name === accentVal ? 'selected' : ''}>${tt(a.label || a.name)}</option>`)).join('');
            const presetSelect = `<label style="display:grid;grid-template-columns:58px 1fr;gap:5px 6px;align-items:center;margin-bottom:7px;">
                <span style="font-size:11px;color:var(--color-text-muted);">${tt('Part')}</span>
                <select class="rr-forge-preset-select rr-input" data-forge-slot-select="${slot.id}" style="width:100%;font-size:12px;padding:4px 6px;">
                    <option value="">${tt('(None)')}</option>
                    ${presets.map(part => {
                        const val = `${part.setKey}::${part.id}`;
                        const sel = selected && selected.setKey === part.setKey && selected.id === part.id ? 'selected' : '';
                        return `<option value="${val}" ${sel}>${tt(part.setLabel)} — ${tt(part.label)}</option>`;
                    }).join('')}
                </select>
            </label>`;
            const paletteControls = `<div style="display:grid;grid-template-columns:58px 1fr;gap:5px 6px;align-items:center;margin-bottom:8px;padding:6px;border:1px solid var(--color-border-subtle);border-radius:4px;background:var(--color-bg-base);">
                <span style="font-size:11px;color:var(--color-text-muted);">${tt('Material')}</span>
                <select class="rr-forge-palette-select rr-input" data-forge-slot-palette="${slot.id}" data-forge-palette-field="family" style="width:100%;font-size:12px;padding:4px 6px;">${familyOpts}</select>
                <span style="font-size:11px;color:var(--color-text-muted);">${tt('Accent')}</span>
                <select class="rr-forge-palette-select rr-input" data-forge-slot-palette="${slot.id}" data-forge-palette-field="accent" style="width:100%;font-size:12px;padding:4px 6px;">${accentOpts}</select>
            </div>`;
            return `<details class="rr-forge-slot" data-forge-slot="${slot.id}" open style="margin-bottom:8px;border:1px solid var(--color-border-subtle);border-radius:5px;background:var(--color-bg-panel);">
                <summary style="cursor:pointer;padding:8px 9px;font-size:12px;font-weight:800;color:var(--color-text-strong);text-transform:uppercase;letter-spacing:0.45px;">${tt(slot.label)}</summary>
                <div style="padding:0 9px 9px;">
                    ${presetSelect}
                    <input class="rr-forge-part-search rr-input" data-forge-slot-search="${slot.id}" placeholder="${tt('Search style or part...')}" style="width:100%;font-size:12px;padding:5px 7px;margin-bottom:7px;">
                    <div data-forge-slot-options="${slot.id}" style="display:block;max-height:190px;overflow-y:auto;padding:5px;margin:0 0 8px;border:1px solid var(--color-border-subtle);border-radius:5px;background:var(--color-bg-base);">
                        ${presets.map(part => {
                            const active = selected && selected.setKey === part.setKey && selected.id === part.id;
                            return `<button type="button" class="rr-forge-preset" data-forge-preset-set="${part.setKey}" data-forge-preset-id="${part.id}" data-forge-search-label="${(part.setLabel + ' ' + part.label + ' ' + slot.label + ' style').toLowerCase()}"
                            style="width:100%;display:flex;align-items:center;gap:8px;margin-bottom:6px;padding:7px;border:1px solid ${active ? 'var(--color-accent-bright)' : 'var(--color-border-subtle)'};border-radius:4px;background:${active ? 'var(--color-bg-button-active)' : 'var(--color-bg-base)'};color:var(--color-text);font-size:12px;text-align:left;cursor:pointer;">
                            ${partThumb(part, 'preset', 34)}
                            <span style="min-width:0;display:flex;flex-direction:column;line-height:1.2;">
                                <span style="font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${tt(part.setLabel)}</span>
                                <span style="font-size:11px;color:var(--color-text-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${tt(part.label)}</span>
                            </span>
                        </button>`;
                        }).join('') || `<div style="font-size:11px;color:var(--color-text-muted);padding:4px 0;">${tt('No presets yet.')}</div>`}
                        <div data-forge-slot-empty="${slot.id}" style="display:none;font-size:11px;color:var(--color-text-muted);padding:4px 0;">${tt('No matching style parts.')}</div>
                    </div>
                    <div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:7px;">${pill}</div>
                    ${paletteControls}
                </div>
            </details>`;
        }).join('');
        const renderZoneCard = (z) => {
            const zc = cfg.zones[z.key] || {};
            const famSwatch = (schema.families.find(f => f.name === zc.family) || {}).swatch;
            const accSwatch = (schema.accents.find(a => a.name === (zc.accent || '')) || {}).swatch;
            const activeStyle = zc.style || (z.styles && z.styles[0]) || '';
            const visibleParams = (z.params || []).filter(p => !p.styles || p.styles.includes(activeStyle));
            const paramRows = visibleParams.map(p => {
                if (p.type === 'bool') return `
                    <label style="display:flex;align-items:center;gap:6px;font-size:10px;color:var(--color-text);margin-top:4px;">
                        <input type="checkbox" class="rr-forge-input" data-forge-zone="${z.key}" data-forge-param="${p.key}" ${zc.params && zc.params[p.key] ? 'checked' : ''}>
                        ${tt(p.label)}
                    </label>`;
                if (p.type === 'choice') {
                    const val = zc.params && zc.params[p.key] != null ? zc.params[p.key] : p.default;
                    const opts = (p.options || []).map(o => `<option value="${o.value}" ${o.value === val ? 'selected' : ''}>${tt(o.label)}</option>`).join('');
                    return `
                        <label style="display:flex;align-items:center;justify-content:space-between;gap:6px;font-size:10px;color:var(--color-text);margin-top:4px;">
                            ${tt(p.label)}
                            <select class="rr-forge-input rr-input" data-forge-zone="${z.key}" data-forge-param="${p.key}" style="width:132px;font-size:10px;padding:2px 4px;">${opts}</select>
                        </label>`;
                }
                return `
                    <label style="display:flex;align-items:center;justify-content:space-between;gap:6px;font-size:10px;color:var(--color-text);margin-top:4px;">
                        ${tt(p.label)}
                        ${numberControl(`data-forge-zone="${z.key}" data-forge-param="${p.key}"`, zc.params && zc.params[p.key] != null ? zc.params[p.key] : p.default, p.min, p.max, p.step || (p.type === 'float' ? 0.1 : 1))}
                    </label>`;
            }).join('');
            return `<div draggable="true" data-forge-layer-card="zone:${z.key}" style="border:1px solid var(--color-border-subtle);border-radius:5px;padding:8px 10px;margin-bottom:8px;background:var(--color-bg-panel);opacity:${zc.enabled !== false ? 1 : 0.55};cursor:grab;">
                <label style="display:flex;align-items:center;gap:6px;font-size:11px;font-weight:700;color:var(--color-text-strong);text-transform:uppercase;letter-spacing:0.4px;margin-bottom:6px;">
                    <input type="checkbox" class="rr-forge-input" data-forge-zone="${z.key}" data-forge-zone-enabled="1" ${zc.enabled !== false ? 'checked' : ''}>
                    <span style="flex:1;">${tt(z.label)}</span>
                    <span title="${tt('Drag to change layer order')}" style="font-size:10px;color:var(--color-text-muted);letter-spacing:1px;">${tt('drag')}</span>
                    <button type="button" data-forge-remove-layer="zone:${z.key}" title="${tt('Remove {part}').replace('{part}', tt(z.label))}" style="border:1px solid var(--color-border-input);border-radius:3px;background:var(--color-bg-button);color:var(--color-text-muted);cursor:pointer;padding:0 5px;font-size:11px;line-height:16px;">×</button>
                </label>
                <div style="display:grid;grid-template-columns:auto 1fr;gap:6px 8px;align-items:center;">
                    <span style="font-size:10px;color:var(--color-text-muted);">${tt('Material')}</span>
                    ${choiceButton('family', zc.family, `data-forge-zone="${z.key}" data-forge-field="family"`)}
                    <span style="font-size:10px;color:var(--color-text-muted);">${tt('Accent')}</span>
                    ${choiceButton('accent', zc.accent, `data-forge-zone="${z.key}" data-forge-field="accent"`)}
                </div>
                <div data-forge-zone-summary="${z.key}" style="margin-top:2px;">${swatch(famSwatch)}${accSwatch ? swatch(accSwatch) : ''}<span style="font-size:9px;color:var(--color-text-muted);">${zc.family}${zc.accent ? ' + ' + zc.accent : ''}</span></div>
                ${paramRows}
            </div>`;
        };

        const renderExtCard = (ex) => {
            const ec = cfg.exts[ex.type] || { enabled: false, family: 'steel', accent: '', params: {} };
            const paramRows = ex.params.map(p => {
                if (p.type === 'bool') return `
                    <label style="display:flex;align-items:center;gap:6px;font-size:10px;color:var(--color-text);margin-top:4px;">
                        <input type="checkbox" class="rr-forge-input" data-forge-ext="${ex.type}" data-forge-param="${p.key}" ${ec.params[p.key] ? 'checked' : ''}>
                        ${tt(p.label)}
                    </label>`;
                return `
                    <label style="display:flex;align-items:center;justify-content:space-between;gap:6px;font-size:10px;color:var(--color-text);margin-top:4px;">
                        ${tt(p.label)}
                        ${numberControl(`data-forge-ext="${ex.type}" data-forge-param="${p.key}"`, ec.params[p.key], p.min, p.max, p.type === 'float' ? 0.1 : 1)}
                    </label>`;
            }).join('');
            return `<div draggable="true" data-forge-layer-card="ext:${ex.type}" style="border:1px solid var(--color-border-subtle);border-radius:5px;padding:8px 10px;margin-bottom:8px;background:var(--color-bg-panel);opacity:${ec.enabled ? 1 : 0.55};cursor:grab;">
                <label style="display:flex;align-items:center;gap:6px;font-size:11px;font-weight:700;color:var(--color-text-strong);text-transform:uppercase;letter-spacing:0.4px;margin-bottom:6px;">
                    <input type="checkbox" class="rr-forge-input" data-forge-ext="${ex.type}" data-forge-ext-enabled="1" ${ec.enabled ? 'checked' : ''}>
                    <span style="flex:1;">${tt(ex.label)}</span>
                    <span title="${tt('Drag to change layer order')}" style="font-size:10px;color:var(--color-text-muted);letter-spacing:1px;">${tt('drag')}</span>
                    <button type="button" data-forge-remove-layer="ext:${ex.type}" title="${tt('Remove {part}').replace('{part}', tt(ex.label))}" style="border:1px solid var(--color-border-input);border-radius:3px;background:var(--color-bg-button);color:var(--color-text-muted);cursor:pointer;padding:0 5px;font-size:11px;line-height:16px;">×</button>
                </label>
                <div style="display:grid;grid-template-columns:auto 1fr;gap:6px 8px;align-items:center;margin-top:6px;">
                    <span style="font-size:10px;color:var(--color-text-muted);">${tt('Material')}</span>
                    ${choiceButton('family', ec.family, `data-forge-ext="${ex.type}" data-forge-field="family"`)}
                    <span style="font-size:10px;color:var(--color-text-muted);">${tt('Accent')}</span>
                    ${choiceButton('accent', ec.accent, `data-forge-ext="${ex.type}" data-forge-field="accent"`)}
                </div>
                <div data-forge-ext-summary="${ex.type}" style="margin-top:2px;">${swatch((schema.families.find(f => f.name === ec.family) || {}).swatch)}${ec.accent ? swatch((schema.accents.find(a => a.name === ec.accent) || {}).swatch) : ''}<span style="font-size:9px;color:var(--color-text-muted);">${ec.family}${ec.accent ? ' + ' + ec.accent : ''}</span></div>
                ${paramRows}
            </div>`;
        };

        const defaultLayerOrder = schemaZones.map(z => `zone:${z.key}`).concat(schemaExts.map(ex => `ext:${ex.type}`));
        const layerOrder = ((cfg.layerOrder && cfg.layerOrder.length) ? cfg.layerOrder : defaultLayerOrder).filter(layerActive);
        const layerCards = layerOrder.map(id => {
            if (id.startsWith('zone:')) {
                const z = schemaZones.find(z => z.key === id.slice(5));
                return z ? renderZoneCard(z) : '';
            }
            const ex = schemaExts.find(ex => ex.type === id.slice(4));
            return ex ? renderExtCard(ex) : '';
        }).join('');

        const DIRS = ['Front', 'Left', 'Right', 'Back'];
        const zoom = this._forgePreviewZoom || 3;
        const cw = (this.frameWidth || 144) * zoom, ch = (this.frameHeight || 144) * zoom;
        const currentForgeFrame = (this._forgeFrame === undefined) ? 1 : this._forgeFrame;
        const debugZoneOptions = [{ key: 'all', label: 'All zones' }].concat(debugZones.map(z => ({ key: z.key, label: z.label })));
        const debugZoneColors = { head: '#50a0ff', torso: '#50ff8c', arms: '#ff5050', belt: '#ffdc46', legs: '#be5aff', boots: '#46e6ff', armGauntlet: '#ff8a3d', shoulders: '#ff7acc', hands: '#ffb36b', spikes: '#d6ff46' };
        const debugLegend = `<div class="rr-forge-debug-legend" style="display:${this._forgeDebugZones ? 'flex' : 'none'};flex-wrap:wrap;gap:6px 10px;align-items:center;justify-content:center;max-width:520px;font-size:10px;color:var(--color-text-muted);line-height:1.2;">
            ${debugZones.map(z => `<span style="display:inline-flex;align-items:center;gap:4px;"><span style="width:10px;height:10px;border-radius:2px;border:1px solid var(--color-border-input);background:${debugZoneColors[z.key] || '#ffffff'};"></span>${tt(z.label)}</span>`).join('')}
        </div>`;
        const editZoneOptions = debugZones.map(z => `<option value="${z.key}" ${this._forgeZoneEditZone === z.key ? 'selected' : ''}>${tt(z.label)}</option>`).join('');
        const zoneEditControls = `<div class="rr-forge-zone-edit-controls" style="display:${this._forgeDebugZones ? 'flex' : 'none'};flex-wrap:wrap;gap:8px;align-items:center;justify-content:center;max-width:720px;padding:7px 9px;border:1px solid var(--color-border-subtle);border-radius:6px;background:var(--color-bg-panel);">
            <label style="display:flex;align-items:center;gap:5px;font-size:11px;color:var(--color-text-muted);">
                <input type="checkbox" class="rr-forge-zone-edit-toggle" ${this._forgeZoneEditMode ? 'checked' : ''}>
                ${tt('Edit Mask')}
            </label>
            <select class="rr-forge-zone-edit-zone rr-input" style="font-size:11px;padding:3px 7px;" ${this._forgeZoneEditMode ? '' : 'disabled'}>${editZoneOptions}</select>
            <select class="rr-forge-zone-edit-frame rr-input" title="${tt('Walk frame to edit')}" style="font-size:11px;padding:3px 7px;" ${this._forgeZoneEditMode ? '' : 'disabled'}>
                ${[0,1,2].map(v => `<option value="${v}" ${currentForgeFrame === v ? 'selected' : ''}>${tt('Frame {number}').replace('{number}', v)}</option>`).join('')}
            </select>
            <select class="rr-forge-zone-edit-action rr-input" style="font-size:11px;padding:3px 7px;" ${this._forgeZoneEditMode ? '' : 'disabled'}>
                <option value="paint" ${this._forgeZoneEditAction === 'paint' ? 'selected' : ''}>${tt('Paint Brush')}</option>
                <option value="erase" ${this._forgeZoneEditAction === 'erase' ? 'selected' : ''}>${tt('Eraser')}</option>
            </select>
            <select class="rr-forge-zone-edit-brush rr-input" style="font-size:11px;padding:3px 7px;" ${this._forgeZoneEditMode ? '' : 'disabled'}>
                ${[1,3,5].map(v => `<option value="${v}" ${this._forgeZoneEditBrush === v ? 'selected' : ''}>${v}px</option>`).join('')}
            </select>
            <button type="button" class="rr-forge-zone-edit-clear rr-btn-chip" style="padding:4px 9px;font-size:11px;color:var(--color-text-muted);">${tt('Clear Edits')}</button>
            <button type="button" class="rr-forge-zone-edit-copy rr-btn-chip" style="padding:4px 9px;font-size:11px;color:var(--color-accent-bright);">${tt('Copy Zone JSON')}</button>
            <button type="button" class="rr-forge-zone-edit-copy-all rr-btn-chip" style="padding:4px 9px;font-size:11px;color:var(--color-text-muted);">${tt('Copy All Zones JSON')}</button>
            <span style="font-size:10px;color:var(--color-text-dim);">${tt('Edit mode loads the current zone mask, then paint or erase exact pixels.')}</span>
        </div>`;
        const canvases = DIRS.map((label, d) => `
            <div style="text-align:center;">
                <canvas class="rr-forge-canvas" data-dir="${d}" width="${this.frameWidth || 144}" height="${this.frameHeight || 144}"
                    style="width:${cw}px;height:${ch}px;image-rendering:pixelated;background:var(--color-checker,#1a1a2e);border:1px solid var(--color-border-input);border-radius:4px;"></canvas>
                <div style="font-size:9px;color:var(--color-text-muted);margin-top:2px;">${tt(label)}</div>
            </div>`).join('');

        return `<style>
            .rr-forge-number::-webkit-outer-spin-button,
            .rr-forge-number::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
        </style>
        <div style="display:flex;height:100%;min-height:0;">
            <div class="rr-forge-library-scroll" style="width:265px;flex-shrink:0;overflow-y:auto;padding:13px;border-right:1px solid var(--color-border);background:var(--color-bg-base);">
                <div style="font-size:12px;font-weight:800;color:var(--color-text-dim);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;">${tt('Palette Theme')}</div>
                ${themePicker}
                <div style="font-size:12px;font-weight:800;color:var(--color-text-dim);text-transform:uppercase;letter-spacing:0.5px;margin:14px 0 8px;">${tt('Style Parts')}</div>
                <div style="font-size:12px;color:var(--color-text-muted);line-height:1.35;margin-bottom:10px;">${tt('Search each outfit slot by style or part, then pick a layer preset.')}</div>
                ${partLibrary}
            </div>
            <div class="rr-forge-controls-scroll" style="width:330px;flex-shrink:0;overflow-y:auto;padding:12px;border-right:1px solid var(--color-border);">
                <div style="margin-bottom:10px;">
                    <label style="font-size:10px;color:var(--color-text-muted);display:block;margin-bottom:3px;">${tt('Outfit name')}</label>
                    <input type="text" class="rr-forge-name rr-input" value="${this._escapeHtml(cfg.name)}" style="width:100%;font-size:12px;padding:4px 8px;">
                </div>
                <div style="font-size:10px;font-weight:700;color:var(--color-text-dim);text-transform:uppercase;letter-spacing:0.5px;margin:8px 0 6px;">${tt('Layers')}</div>
                <div class="rr-forge-layers-list">${layerCards}</div>
            </div>
            <div style="flex:1;min-width:0;overflow-y:auto;padding:16px;display:flex;flex-direction:column;align-items:center;gap:12px;">
                <div style="display:flex;align-items:center;gap:12px;">
                    <button class="rr-forge-walk" style="padding:5px 12px;font-size:11px;cursor:pointer;border-radius:3px;border:1px solid var(--color-border-input);background:${this._forgeWalking ? 'var(--color-bg-button-active)' : 'var(--color-bg-button)'};color:var(--color-text-strong);">${this._forgeWalking ? tt('Stop Walk') : tt('Play Walk')}</button>
                    <label style="display:flex;align-items:center;gap:5px;font-size:11px;color:var(--color-text-muted);">
                        ${tt('Zoom')}
                        <select class="rr-forge-preview-zoom rr-input" style="font-size:11px;padding:3px 7px;">
                            ${[2,3,4,5,6,8].map(v => `<option value="${v}" ${zoom === v ? 'selected' : ''}>${v}x</option>`).join('')}
                        </select>
                    </label>
                    <label style="display:flex;align-items:center;gap:5px;font-size:11px;color:var(--color-text-muted);">
                        <input type="checkbox" class="rr-forge-debug-zones" ${this._forgeDebugZones ? 'checked' : ''}>
                        ${tt('Debug Zones')}
                    </label>
                    <select class="rr-forge-debug-zone rr-input" style="font-size:11px;padding:3px 7px;min-width:112px;" ${this._forgeDebugZones ? '' : 'disabled'}>
                        ${debugZoneOptions.map(z => `<option value="${z.key}" ${this._forgeDebugZone === z.key ? 'selected' : ''}>${tt(z.label)}</option>`).join('')}
                    </select>
                    <button class="rr-forge-save rr-btn" style="font-size:11px;padding:5px 14px;cursor:pointer;background:var(--color-accent-bright);color:var(--color-bg-base);border-radius:4px;font-weight:700;">${this._t('forge.generateSave')}</button>
                </div>
                ${debugLegend}
                ${zoneEditControls}
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">${canvases}</div>
                <div class="rr-forge-status" style="font-size:10px;color:var(--color-text-muted);min-height:14px;"></div>
            </div>
        </div>`;
    }

    _wireForgeEvents() {
        const tt = (text) => (typeof window !== 'undefined' && window.I18n) ? window.I18n.tText(text) : text;
        const rootEl = this.root;
        if (!rootEl) return;
        const cfg = this._forgeConfig();
        const eng = this._outfitEngine();
        const schema = this._forgeSchema();
        if (this._forgeChoiceCleanup) {
            this._forgeChoiceCleanup();
            this._forgeChoiceCleanup = null;
        }
        if (this._forgeZoneEditMouseupCleanup) {
            this._forgeZoneEditMouseupCleanup();
            this._forgeZoneEditMouseupCleanup = null;
        }
        const miniSwatch = (hex) => hex ? `<span style="display:inline-block;width:10px;height:10px;border-radius:2px;border:1px solid var(--color-border-input);background:${hex};vertical-align:middle;margin-right:4px;"></span>` : '';
        const updateSummary = (kind, key, item) => {
            if (!schema || !item) return;
            const fam = (schema.families.find(f => f.name === item.family) || {}).swatch;
            const acc = (schema.accents.find(a => a.name === (item.accent || '')) || {}).swatch;
            const el = rootEl.querySelector(`[data-forge-${kind}-summary="${key}"]`);
            if (el) el.innerHTML = `${miniSwatch(fam)}${acc ? miniSwatch(acc) : ''}<span style="font-size:9px;color:var(--color-text-muted);">${this._escapeHtml(item.family)}${item.accent ? ' + ' + this._escapeHtml(item.accent) : ''}</span>`;
        };
        const removeLayer = (layerId) => {
            cfg.layerOrder = (cfg.layerOrder || []).filter(id => id !== layerId);
            cfg.selectedParts = cfg.selectedParts || {};
            delete cfg.selectedParts[layerId];
            if (layerId.startsWith('zone:')) {
                const key = layerId.slice(5);
                if (cfg.zones[key]) cfg.zones[key].enabled = false;
            } else if (layerId.startsWith('ext:')) {
                const key = layerId.slice(4);
                if (cfg.exts[key]) cfg.exts[key].enabled = false;
            }
            this._forgeSyncZoneLayers();
            this._forgeDescCache = null;
            this._renderPreservingScroll();
        };
        const revealSlotOptions = (slot) => {
            const container = Array.from(rootEl.querySelectorAll('[data-forge-slot-options]'))
                .find(el => el.getAttribute('data-forge-slot-options') === slot);
            if (!container) return;
            container.style.display = 'block';
            container.querySelectorAll('[data-forge-search-label]').forEach(btn => { btn.style.display = 'flex'; });
            const empty = container.querySelector('[data-forge-slot-empty]');
            if (empty) empty.style.display = 'none';
        };
        const themeForLayer = (layerId) => {
            if (cfg.paletteTheme === 'custom') return cfg.customPalettes && cfg.customPalettes[layerId] ? cfg.customPalettes[layerId] : null;
            const theme = (schema && schema.paletteThemes || []).find(t => t.key === (cfg.paletteTheme || 'nova-sentinel'));
            return theme && theme.slots && theme.slots[layerId] ? theme.slots[layerId] : null;
        };
        const applyThemeToSpec = (spec, layerId) => {
            const theme = themeForLayer(layerId);
            if (!theme || !spec) return spec;
            spec.family = theme.family;
            spec.accent = theme.accent || '';
            return spec;
        };
        const applyThemeToActiveLayers = () => {
            for (const [key, spec] of Object.entries(cfg.zones || {})) {
                if (spec && spec.enabled !== false) applyThemeToSpec(spec, `zone:${key}`);
            }
            for (const [key, spec] of Object.entries(cfg.exts || {})) {
                if (spec && spec.enabled) applyThemeToSpec(spec, `ext:${key}`);
            }
        };
        const apply = (el) => {
            const zone = el.getAttribute('data-forge-zone');
            const ext  = el.getAttribute('data-forge-ext');
            const field = el.getAttribute('data-forge-field');
            const param = el.getAttribute('data-forge-param');
            if (zone) {
                const zc = cfg.zones[zone] = cfg.zones[zone] || { params: {} };
                if (el.getAttribute('data-forge-zone-enabled')) zc.enabled = el.checked;
                else if (field) zc[field] = el.type === 'number' ? parseFloat(el.value) : el.value;
                else if (param) {
                    zc.params = zc.params || {};
                    zc.params[param] = el.type === 'checkbox' ? el.checked : (el.tagName === 'SELECT' ? el.value : parseFloat(el.value));
                }
                if (field === 'family' || field === 'accent') updateSummary('zone', zone, zc);
            } else if (ext) {
                const ec = cfg.exts[ext];
                if (!ec) return;
                if (el.getAttribute('data-forge-ext-enabled')) ec.enabled = el.checked;
                else if (field) ec[field] = el.value;
                else if (param) {
                    if (el.type === 'checkbox') ec.params[param] = el.checked;
                    else ec.params[param] = parseFloat(el.value);
                }
                if (field === 'family' || field === 'accent') updateSummary('ext', ext, ec);
            }
            this._forgeDescCache = null;
            this._drawForgePreview();
            // Enable toggles change card opacity — refresh just the
            // opacity without a full re-render so focus/scroll survive.
            if (el.getAttribute('data-forge-ext-enabled') || el.getAttribute('data-forge-zone-enabled')) {
                const card = el.closest('[data-forge-layer-card]');
                if (card) card.style.opacity = el.checked ? '1' : '0.55';
            }
        };
        rootEl.querySelectorAll('.rr-forge-input').forEach(el => {
            el.addEventListener('change', () => apply(el));
            // Sliders (range) update live during drag; number fields update on
            // a short debounce. This keeps typing responsive but avoids the old
            // per-keystroke rebuild that made fields laggy and interrupted
            // in-progress values (e.g. typing "0.42" before the decimal lands).
            if (el.type === 'range') el.addEventListener('input', () => apply(el));
            if (el.type === 'number') {
                let numberInputTimer = 0;
                el.addEventListener('input', () => {
                    if (numberInputTimer) clearTimeout(numberInputTimer);
                    numberInputTimer = setTimeout(() => {
                        const raw = String(el.value || '').trim();
                        if (!raw || raw === '-' || raw === '.' || raw === '-.') return;
                        if (!Number.isFinite(parseFloat(raw))) return;
                        apply(el);
                    }, 180);
                });
            }
        });
        rootEl.querySelectorAll('.rr-forge-num-step').forEach(btn => {
            btn.addEventListener('click', e => {
                e.preventDefault();
                e.stopPropagation();
                const input = btn.closest('.rr-forge-number-wrap')?.querySelector('.rr-forge-number');
                if (!input) return;
                const step = parseFloat(input.step) || 1;
                const delta = (parseFloat(btn.getAttribute('data-delta')) || 0) * step;
                const min = input.min === '' ? -Infinity : parseFloat(input.min);
                const max = input.max === '' ? Infinity : parseFloat(input.max);
                const decimals = (String(input.step || '').split('.')[1] || '').length;
                const next = Math.max(min, Math.min(max, (parseFloat(input.value) || 0) + delta));
                input.value = decimals ? next.toFixed(decimals) : String(Math.round(next));
                // Spinner buttons should update live — dispatch `change` (not
                // `input`) so the apply handler runs once per click without
                // any per-keystroke input listener.
                input.dispatchEvent(new Event('change', { bubbles: true }));
            });
        });
        rootEl.querySelectorAll('[data-forge-layer-card] input, [data-forge-layer-card] select, [data-forge-layer-card] textarea, [data-forge-layer-card] button').forEach(el => {
            el.addEventListener('mousedown', e => e.stopPropagation());
        });
        rootEl.querySelectorAll('.rr-forge-palette-theme').forEach(btn => {
            btn.addEventListener('click', () => {
                cfg.paletteTheme = btn.getAttribute('data-forge-palette-theme') || 'nova-sentinel';
                if (cfg.paletteTheme !== 'custom') {
                    cfg.customPalettes = {};
                    applyThemeToActiveLayers();
                }
                this._forgeDescCache = null;
                this._renderPreservingScroll();
            });
        });
        const themeSearch = rootEl.querySelector('.rr-forge-theme-search');
        if (themeSearch) themeSearch.addEventListener('input', () => {
            const q = (themeSearch.value || '').trim().toLowerCase();
            rootEl.querySelectorAll('.rr-forge-palette-theme').forEach(btn => {
                btn.style.display = !q || (btn.getAttribute('data-forge-theme-label') || '').includes(q) ? 'flex' : 'none';
            });
        });
        let choiceMenu = null;
        let choiceDocHandler = null;
        const closeChoiceMenu = () => {
            if (choiceMenu) choiceMenu.remove();
            choiceMenu = null;
            if (choiceDocHandler) document.removeEventListener('mousedown', choiceDocHandler, true);
            choiceDocHandler = null;
        };
        this._forgeChoiceCleanup = closeChoiceMenu;
        const applyChoice = (btn, value) => {
            const slotLayerId = btn.getAttribute('data-forge-slot-palette');
            const paletteField = btn.getAttribute('data-forge-palette-field');
            if (slotLayerId && paletteField) {
                const familyBtn = rootEl.querySelector(`[data-forge-slot-palette="${slotLayerId}"][data-forge-palette-field="family"]`);
                const accentBtn = rootEl.querySelector(`[data-forge-slot-palette="${slotLayerId}"][data-forge-palette-field="accent"]`);
                const next = {
                    family: paletteField === 'family' ? value : (familyBtn ? familyBtn.getAttribute('data-forge-choice-value') : 'steel'),
                    accent: paletteField === 'accent' ? value : (accentBtn ? accentBtn.getAttribute('data-forge-choice-value') : '')
                };
                cfg.paletteTheme = 'custom';
                cfg.customPalettes = cfg.customPalettes || {};
                cfg.customPalettes[slotLayerId] = next;
                if (slotLayerId.startsWith('zone:')) {
                    const spec = cfg.zones[slotLayerId.slice(5)];
                    if (spec) { spec.family = next.family; spec.accent = next.accent; }
                } else if (slotLayerId.startsWith('ext:')) {
                    const spec = cfg.exts[slotLayerId.slice(4)];
                    if (spec) { spec.family = next.family; spec.accent = next.accent; }
                }
                this._forgeDescCache = null;
                this._renderPreservingScroll();
                return;
            }

            const zone = btn.getAttribute('data-forge-zone');
            const ext = btn.getAttribute('data-forge-ext');
            const field = btn.getAttribute('data-forge-field');
            if (zone && field) {
                const zc = cfg.zones[zone] = cfg.zones[zone] || { params: {} };
                zc[field] = value;
            } else if (ext && field) {
                const ec = cfg.exts[ext];
                if (ec) ec[field] = value;
            }
            this._forgeDescCache = null;
            this._renderPreservingScroll();
        };
        const openChoiceMenu = (btn) => {
            if (!schema) return;
            closeChoiceMenu();
            const type = btn.getAttribute('data-forge-choice-type');
            const value = btn.getAttribute('data-forge-choice-value') || '';
            const options = type === 'family'
                ? (schema.families || []).map(f => ({ value: f.name, label: f.label || f.name, swatch: f.swatch }))
                : (schema.accents || []).map(a => ({ value: a.name, label: a.label, swatch: a.swatch }));
            const rect = btn.getBoundingClientRect();
            const vw = window.innerWidth || document.documentElement.clientWidth || 900;
            const vh = window.innerHeight || document.documentElement.clientHeight || 700;
            const desiredH = Math.min(280, Math.max(150, options.length * 30 + 8));
            const below = vh - rect.bottom - 8;
            const above = rect.top - 8;
            const openUp = below < 170 && above > below;
            const maxH = Math.max(120, Math.min(desiredH, openUp ? above : below));
            const left = Math.max(8, Math.min(rect.left, vw - Math.max(rect.width, 190) - 8));
            const top = openUp ? Math.max(8, rect.top - maxH - 4) : Math.min(vh - maxH - 8, rect.bottom + 4);
            choiceMenu = document.createElement('div');
            choiceMenu.className = 'rr-forge-choice-menu';
            choiceMenu.style.cssText = `position:fixed;left:${left}px;top:${top}px;width:${Math.max(rect.width, 190)}px;max-height:${maxH}px;overflow-y:auto;padding:5px;z-index:100000;border:1px solid var(--color-accent-bright);border-radius:6px;background:var(--color-bg-base);box-shadow:0 8px 24px rgba(0,0,0,.45);`;
            options.forEach(opt => {
                const row = document.createElement('button');
                row.type = 'button';
                row.style.cssText = `width:100%;display:flex;align-items:center;gap:7px;margin-bottom:4px;padding:6px 7px;border:1px solid ${opt.value === value ? 'var(--color-accent-bright)' : 'var(--color-border-subtle)'};border-radius:4px;background:${opt.value === value ? 'var(--color-bg-button-active)' : 'var(--color-bg-panel)'};color:var(--color-text);font-size:12px;text-align:left;cursor:pointer;`;
                row.innerHTML = `<span style="width:14px;height:14px;flex:0 0 auto;border-radius:2px;border:1px solid var(--color-border-input);background:${opt.swatch || 'transparent'};"></span><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${tt(opt.label)}</span>`;
                row.addEventListener('click', e => {
                    e.preventDefault();
                    e.stopPropagation();
                    applyChoice(btn, opt.value);
                    closeChoiceMenu();
                });
                choiceMenu.appendChild(row);
            });
            choiceMenu.addEventListener('mousedown', e => e.stopPropagation());
            document.body.appendChild(choiceMenu);
            choiceDocHandler = (e) => {
                if (choiceMenu && !choiceMenu.contains(e.target) && e.target !== btn) closeChoiceMenu();
            };
            document.addEventListener('mousedown', choiceDocHandler, true);
        };
        rootEl.querySelectorAll('.rr-forge-choice').forEach(btn => {
            btn.addEventListener('click', e => {
                e.preventDefault();
                e.stopPropagation();
                openChoiceMenu(btn);
            });
        });
        rootEl.querySelectorAll('[data-forge-remove-layer]').forEach(btn => {
            btn.addEventListener('click', e => {
                e.preventDefault();
                e.stopPropagation();
                removeLayer(btn.getAttribute('data-forge-remove-layer'));
            });
        });
        rootEl.querySelectorAll('.rr-forge-part-search').forEach(input => {
            const runFilter = () => {
                const slot = input.getAttribute('data-forge-slot-search');
                const rawQ = (input.value || '').trim().toLowerCase();
                const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
                const q = norm(rawQ);
                const container = Array.from(rootEl.querySelectorAll('[data-forge-slot-options]'))
                    .find(el => el.getAttribute('data-forge-slot-options') === slot);
                if (container) container.style.display = 'block';
                const rows = container ? Array.from(container.querySelectorAll('[data-forge-search-label]')) : [];
                let visible = 0;
                rows.forEach(btn => {
                    const label = btn.getAttribute('data-forge-search-label') || '';
                    const show = !rawQ || label.includes(rawQ) || norm(label).includes(q);
                    btn.style.display = show ? 'flex' : 'none';
                    if (show) visible++;
                });
                const details = input.closest('details');
                if (details && q) details.open = true;
                const empty = container && container.querySelector('[data-forge-slot-empty]');
                if (empty) empty.style.display = visible ? 'none' : 'block';
            };
            input.addEventListener('input', () => {
                runFilter();
            });
            input.addEventListener('focus', runFilter);
            input.addEventListener('click', runFilter);
        });
        const applyPresetPart = (setKey, partId) => {
            if (!schema || !setKey || !partId) return;
            const set = (schema.partSets || []).find(s => s.key === setKey);
            const part = set && (set.parts || []).find(p => p.id === partId);
            if (!part || !part.spec) return;
            const spec = JSON.parse(JSON.stringify(part.spec));
            const layerId = `${part.kind}:${part.key}`;
            applyThemeToSpec(spec, layerId);
            cfg.selectedParts = cfg.selectedParts || {};
            cfg.selectedParts[layerId] = { setKey, partId };
            cfg.layerOrder = cfg.layerOrder || [];
            if (!cfg.layerOrder.includes(layerId)) cfg.layerOrder.unshift(layerId);
            if (part.kind === 'zone') {
                if (cfg.zones[part.key] && cfg.zones[part.key].layer != null) spec.layer = cfg.zones[part.key].layer;
                cfg.zones[part.key] = spec;
            } else if (part.kind === 'ext') {
                if (cfg.exts[part.key] && cfg.exts[part.key].layer != null) spec.layer = cfg.exts[part.key].layer;
                cfg.exts[part.key] = spec;
            }
            this._forgeSyncZoneLayers();
            this._forgeDescCache = null;
            this._renderPreservingScroll();
        };
        rootEl.querySelectorAll('.rr-forge-preset-select').forEach(sel => {
            sel.addEventListener('change', () => {
                const val = sel.value || '';
                if (!val) {
                    removeLayer(sel.getAttribute('data-forge-slot-select'));
                    return;
                }
                const sep = val.indexOf('::');
                if (sep < 0) return;
                applyPresetPart(val.slice(0, sep), val.slice(sep + 2));
            });
        });
        rootEl.querySelectorAll('.rr-forge-palette-select').forEach(sel => {
            sel.addEventListener('change', () => {
                const slotLayerId = sel.getAttribute('data-forge-slot-palette');
                const paletteField = sel.getAttribute('data-forge-palette-field');
                if (!slotLayerId || !paletteField) return;
                const familySel = rootEl.querySelector(`select[data-forge-slot-palette="${slotLayerId}"][data-forge-palette-field="family"]`);
                const accentSel = rootEl.querySelector(`select[data-forge-slot-palette="${slotLayerId}"][data-forge-palette-field="accent"]`);
                const next = {
                    family: familySel ? familySel.value : 'steel',
                    accent: accentSel ? accentSel.value : ''
                };
                cfg.paletteTheme = 'custom';
                cfg.customPalettes = cfg.customPalettes || {};
                cfg.customPalettes[slotLayerId] = next;
                if (slotLayerId.startsWith('zone:')) {
                    const spec = cfg.zones[slotLayerId.slice(5)];
                    if (spec) { spec.family = next.family; spec.accent = next.accent; }
                } else if (slotLayerId.startsWith('ext:')) {
                    const spec = cfg.exts[slotLayerId.slice(4)];
                    if (spec) { spec.family = next.family; spec.accent = next.accent; }
                }
                this._forgeDescCache = null;
                this._renderPreservingScroll();
            });
        });
        rootEl.querySelectorAll('.rr-forge-preset').forEach(btn => {
            btn.addEventListener('click', () => {
                applyPresetPart(btn.getAttribute('data-forge-preset-set'), btn.getAttribute('data-forge-preset-id'));
            });
        });
        let draggedLayerCard = null;
        rootEl.querySelectorAll('[data-forge-layer-card]').forEach(card => {
            card.addEventListener('dragstart', e => {
                if (e.target && e.target.closest('input, select, textarea, button')) {
                    e.preventDefault();
                    return;
                }
                draggedLayerCard = card;
                card.style.opacity = '0.35';
                if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
            });
            card.addEventListener('dragend', () => {
                if (draggedLayerCard) {
                    const id = draggedLayerCard.getAttribute('data-forge-layer-card');
                    const enabled = id.startsWith('zone:') ? cfg.zones[id.slice(5)].enabled !== false : !!cfg.exts[id.slice(4)].enabled;
                    draggedLayerCard.style.opacity = enabled ? '1' : '0.55';
                }
                draggedLayerCard = null;
                rootEl.querySelectorAll('[data-forge-layer-card]').forEach(el => { el.style.boxShadow = ''; });
            });
            card.addEventListener('dragover', e => {
                if (!draggedLayerCard || draggedLayerCard === card) return;
                e.preventDefault();
                if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
                const rect = card.getBoundingClientRect();
                const above = e.clientY < rect.top + rect.height / 2;
                card.style.boxShadow = above
                    ? 'inset 0 2px 0 var(--color-accent-bright)'
                    : 'inset 0 -2px 0 var(--color-accent-bright)';
            });
            card.addEventListener('dragleave', () => { card.style.boxShadow = ''; });
            card.addEventListener('drop', e => {
                if (!draggedLayerCard || draggedLayerCard === card) return;
                e.preventDefault();
                card.style.boxShadow = '';
                const list = card.parentElement;
                const rect = card.getBoundingClientRect();
                const after = e.clientY > rect.top + rect.height / 2;
                list.insertBefore(draggedLayerCard, after ? card.nextSibling : card);
                cfg.layerOrder = Array.from(list.querySelectorAll('[data-forge-layer-card]')).map(el => el.getAttribute('data-forge-layer-card'));
                this._forgeSyncZoneLayers();
                this._forgeDescCache = null;
                this._drawForgePreview();
            });
        });
        const nameEl = rootEl.querySelector('.rr-forge-name');
        if (nameEl) nameEl.addEventListener('input', () => { cfg.name = nameEl.value; });
        const walkBtn = rootEl.querySelector('.rr-forge-walk');
        if (walkBtn) walkBtn.addEventListener('click', () => this._toggleForgeWalk());
        const previewZoom = rootEl.querySelector('.rr-forge-preview-zoom');
        if (previewZoom) previewZoom.addEventListener('change', () => {
            this._forgePreviewZoom = Math.max(2, Math.min(8, parseInt(previewZoom.value, 10) || 3));
            this._renderPreservingScroll();
        });
        const debugZones = rootEl.querySelector('.rr-forge-debug-zones');
        const debugZone = rootEl.querySelector('.rr-forge-debug-zone');
        const zoneEditControls = rootEl.querySelector('.rr-forge-zone-edit-controls');
        const zoneEditToggle = rootEl.querySelector('.rr-forge-zone-edit-toggle');
        const zoneEditZone = rootEl.querySelector('.rr-forge-zone-edit-zone');
        const zoneEditFrame = rootEl.querySelector('.rr-forge-zone-edit-frame');
        const zoneEditAction = rootEl.querySelector('.rr-forge-zone-edit-action');
        const zoneEditBrush = rootEl.querySelector('.rr-forge-zone-edit-brush');
        const zoneEditClear = rootEl.querySelector('.rr-forge-zone-edit-clear');
        const zoneEditCopy = rootEl.querySelector('.rr-forge-zone-edit-copy');
        const zoneEditCopyAll = rootEl.querySelector('.rr-forge-zone-edit-copy-all');
        const setZoneEditEnabled = () => {
            [zoneEditZone, zoneEditFrame, zoneEditAction, zoneEditBrush].forEach(el => { if (el) el.disabled = !this._forgeZoneEditMode; });
        };
        if (debugZones) debugZones.addEventListener('change', () => {
            this._forgeDebugZones = !!debugZones.checked;
            if (debugZone) debugZone.disabled = !this._forgeDebugZones;
            const legend = rootEl.querySelector('.rr-forge-debug-legend');
            if (legend) legend.style.display = this._forgeDebugZones ? 'flex' : 'none';
            if (zoneEditControls) zoneEditControls.style.display = this._forgeDebugZones ? 'flex' : 'none';
            this._drawForgePreview();
        });
        if (debugZone) debugZone.addEventListener('change', () => {
            this._forgeDebugZone = debugZone.value || 'all';
            this._drawForgePreview();
        });
        if (zoneEditToggle) zoneEditToggle.addEventListener('change', () => {
            this._forgeZoneEditMode = !!zoneEditToggle.checked;
            if (this._forgeZoneEditMode && !this._forgeDebugZones && debugZones) {
                this._forgeDebugZones = true;
                debugZones.checked = true;
                if (debugZone) debugZone.disabled = false;
            }
            setZoneEditEnabled();
            this._drawForgePreview();
        });
        if (zoneEditZone) zoneEditZone.addEventListener('change', () => {
            this._forgeZoneEditZone = zoneEditZone.value || 'head';
            this._drawForgePreview();
        });
        if (zoneEditFrame) zoneEditFrame.addEventListener('change', () => {
            const nextFrame = Math.max(0, Math.min(2, parseInt(zoneEditFrame.value, 10) || 0));
            if (this._forgeAnimTimer) {
                clearInterval(this._forgeAnimTimer);
                this._forgeAnimTimer = null;
                this._forgeWalking = false;
                const walkBtn = rootEl.querySelector('.rr-forge-walk');
                if (walkBtn) {
                    walkBtn.textContent = tt('Play Walk');
                    walkBtn.style.background = 'var(--color-bg-button)';
                }
            }
            this._forgeFrame = nextFrame;
            this._drawForgePreview();
        });
        if (zoneEditAction) zoneEditAction.addEventListener('change', () => { this._forgeZoneEditAction = zoneEditAction.value || 'paint'; });
        if (zoneEditBrush) zoneEditBrush.addEventListener('change', () => { this._forgeZoneEditBrush = parseInt(zoneEditBrush.value, 10) || 1; });
        if (zoneEditClear) zoneEditClear.addEventListener('click', () => {
            const ok = window.confirm(tt('Clear all painted zone edits for this style? This cannot be undone.'));
            if (!ok) return;
            const scope = this._forgeZoneEditScopeKey();
            if (this._forgeZoneEdits) this._forgeZoneEdits[scope] = {};
            this._drawForgePreview();
        });
        const copyZoneEditText = async (text, successMsg) => {
            const status = rootEl.querySelector('.rr-forge-status');
            try {
                if (navigator.clipboard && navigator.clipboard.writeText) await navigator.clipboard.writeText(text);
                else if (typeof require === 'function') require('electron').clipboard.writeText(text);
                if (status) status.textContent = successMsg;
            } catch (e) {
                console.warn('Could not copy zone edit JSON', e);
                if (status) status.textContent = tt('Could not copy JSON; see console.');
                console.log(text);
            }
        };
        if (zoneEditCopy) zoneEditCopy.addEventListener('click', async () => {
            const zone = this._forgeZoneEditZone || 'head';
            this._ensureForgeZoneEditPayloadSeeded(zone);
            const text = JSON.stringify(this._forgeZoneEditPayload(zone), null, 2);
            await copyZoneEditText(text, tt('Copied {zone} zone JSON.').replace('{zone}', zone));
        });
        if (zoneEditCopyAll) zoneEditCopyAll.addEventListener('click', async () => {
            this._ensureForgeZoneEditPayloadSeeded();
            const text = JSON.stringify(this._forgeZoneEditPayload(), null, 2);
            await copyZoneEditText(text, tt('Copied all zone edit JSON.'));
        });
        let paintingZoneEdit = false;
        let lastZoneEditPaintKey = null;
        const paintFromEvent = (canvas, e) => {
            if (!this._forgeDebugZones || !this._forgeZoneEditMode) return;
            const rect = canvas.getBoundingClientRect();
            const x = Math.max(0, Math.min(canvas.width - 1, Math.floor((e.clientX - rect.left) * canvas.width / rect.width)));
            const y = Math.max(0, Math.min(canvas.height - 1, Math.floor((e.clientY - rect.top) * canvas.height / rect.height)));
            const dir = parseInt(canvas.getAttribute('data-dir'), 10) || 0;
            const frame = (this._forgeFrame === undefined) ? 1 : this._forgeFrame;
            const paintKey = `${dir}:${frame}:${x}:${y}:${this._forgeZoneEditZone}:${this._forgeZoneEditAction}:${this._forgeZoneEditBrush}`;
            if (paintKey === lastZoneEditPaintKey) return;
            lastZoneEditPaintKey = paintKey;
            this._paintForgeZoneEdit(dir, frame, x, y);
        };
        rootEl.querySelectorAll('.rr-forge-canvas').forEach(canvas => {
            canvas.addEventListener('mousedown', e => {
                if (!this._forgeDebugZones || !this._forgeZoneEditMode) return;
                e.preventDefault();
                paintingZoneEdit = true;
                lastZoneEditPaintKey = null;
                paintFromEvent(canvas, e);
            });
            canvas.addEventListener('mousemove', e => { if (paintingZoneEdit) paintFromEvent(canvas, e); });
            canvas.addEventListener('mouseleave', () => { paintingZoneEdit = false; });
        });
        const zoneEditMouseup = () => { paintingZoneEdit = false; lastZoneEditPaintKey = null; };
        window.addEventListener('mouseup', zoneEditMouseup);
        this._forgeZoneEditMouseupCleanup = () => window.removeEventListener('mouseup', zoneEditMouseup);
        const saveBtn = rootEl.querySelector('.rr-forge-save');
        if (saveBtn) saveBtn.addEventListener('click', () => this._saveForgeOutfit());
    }

    _previewWalkSpec(kind) {
        if (kind === 'hair') return {
            timerKey: '_hairAnimTimer', walkingKey: '_hairWalking', frameKey: '_hairFrame', buttonSelector: '.rr-hair-walk', draw: () => this._drawHairPreview()
        };
        return {
            timerKey: '_forgeAnimTimer', walkingKey: '_forgeWalking', frameKey: '_forgeFrame', buttonSelector: '.rr-forge-walk', draw: () => this._drawForgePreview()
        };
    }

    _setPreviewWalkButton(spec) {
        const tt = (text) => (typeof window !== 'undefined' && window.I18n) ? window.I18n.tText(text) : text;
        const btn = this.root && this.root.querySelector(spec.buttonSelector);
        if (!btn) return;
        btn.textContent = this[spec.walkingKey] ? tt('Stop Walk') : tt('Play Walk');
        btn.style.background = this[spec.walkingKey] ? 'var(--color-bg-button-active)' : 'var(--color-bg-button)';
    }

    _stopPreviewWalk(kind, redraw = true) {
        const spec = this._previewWalkSpec(kind);
        if (this[spec.timerKey]) clearInterval(this[spec.timerKey]);
        this[spec.timerKey] = null;
        this[spec.walkingKey] = false;
        if (redraw) {
            this[spec.frameKey] = 1;
            spec.draw();
        }
        this._setPreviewWalkButton(spec);
    }

    _togglePreviewWalk(kind) {
        const spec = this._previewWalkSpec(kind);
        if (this[spec.timerKey]) { this._stopPreviewWalk(kind, true); return; }
        this[spec.walkingKey] = true;
        const seq = [1, 0, 1, 2];
        let i = 0;
        this[spec.timerKey] = setInterval(() => {
            this[spec.frameKey] = seq[i % seq.length];
            i++;
            spec.draw();
        }, 180);
        this._setPreviewWalkButton(spec);
    }

    _toggleForgeWalk() { this._togglePreviewWalk('forge'); }

    _forgeTags(cfg = this._forgeConfig()) {
        const styleId = this.characterStyle || 'psychronic';
        const tags = new Set(Array.isArray(cfg && cfg.tags) ? cfg.tags : []);
        for (const style of this._characterStyles()) tags.delete(style.id);
        tags.delete('male');
        tags.delete('female');
        tags.add(styleId);
        tags.add(this.gender || 'male');
        return Array.from(tags);
    }

    _forgeEngineConfig(cfg = this._forgeConfig()) {
        return {
            style: this.characterStyle || 'psychronic',
            name: cfg.name,
            category: cfg.category,
            tags: this._forgeTags(cfg),
            paletteTheme: cfg.paletteTheme,
            customPalettes: cfg.customPalettes,
            zones: cfg.zones,
            extensions: Object.entries(cfg.exts || {}).filter(([, e]) => e.enabled)
                .map(([type, e]) => ({ type, layer: e.layer, family: e.family, accent: e.accent || undefined, params: e.params }))
        };
    }

    _forgeBodyTemplateShift(bodyTemplate, W, H) {
        if (typeof RR_CG_sheetContentBbox !== 'function' || typeof RR_CG_canonicalSheetDims !== 'function') return { x: 0, y: 0 };
        if (bodyTemplate && bodyTemplate.preserveCellPosition === true) return { x: 0, y: 0 };
        const bbox = RR_CG_sheetContentBbox(bodyTemplate.sheet);
        const dims = RR_CG_canonicalSheetDims(bodyTemplate.sheet);
        if (!bbox || !dims) return { x: 0, y: 0 };
        const scale = Math.min(1, W / dims.w, H / dims.h);
        const ox = Math.round((W - dims.w * scale) / 2);
        const oy = Math.round((H - dims.h * scale) / 2);
        const curMinX = ox + bbox.minX * scale;
        const curMaxX = ox + bbox.maxX * scale;
        const curMinY = oy + bbox.minY * scale;
        const curMaxY = oy + bbox.maxY * scale;
        return {
            x: Math.round((W - (curMaxX - curMinX)) / 2 - curMinX),
            y: Math.round((H - (curMaxY - curMinY)) / 2 - curMinY)
        };
    }

    _drawForgeZoneOverlay(ctx, W, H, dir, frame, bodyTemplate) {
        const eng = this._outfitEngine();
        if (!eng || typeof eng.debugClassifyFrame !== 'function' || !bodyTemplate?.sheet?.[dir]?.[frame]) return;
        const selected = this._forgeDebugZone || 'all';
        const colors = {
            head: 'rgba(80,160,255,0.42)',
            torso: 'rgba(80,255,140,0.38)',
            arms: 'rgba(255,80,80,0.42)',
            belt: 'rgba(255,220,70,0.45)',
            legs: 'rgba(190,90,255,0.40)',
            boots: 'rgba(70,230,255,0.42)',
            armGauntlet: 'rgba(255,138,61,0.45)',
            shoulders: 'rgba(255,122,204,0.42)',
            hands: 'rgba(255,179,107,0.45)',
            spikes: 'rgba(214,255,70,0.42)'
        };
        const authoredZones = this._drawForgeAuthoredZoneOverlay(ctx, W, H, dir, frame, selected, colors);
        let debug;
        try { debug = eng.debugClassifyFrame(this._forgeEngineConfig(), bodyTemplate.sheet[dir][frame], dir, bodyTemplate.palette, frame); }
        catch (e) { console.warn('Outfit Forge zone debug failed', e); return; }
        const zones = debug && debug.zones;
        if (!zones) return;
        const shift = this._forgeBodyTemplateShift(bodyTemplate, W, H);
        for (let y = 0; y < zones.length; y++) {
            const row = zones[y] || [];
            for (let x = 0; x < row.length; x++) {
                const zoneCell = row[x];
                const cellZones = Array.isArray(zoneCell) ? zoneCell : (zoneCell ? [zoneCell] : []);
                for (const zone of cellZones) {
                    if (authoredZones.has(zone)) continue;
                    if (!zone || (selected !== 'all' && selected !== zone)) continue;
                    if (this._forgeZoneEditMode && zone === (this._forgeZoneEditZone || 'head')) continue;
                    const dx = x + shift.x;
                    const dy = y + shift.y;
                    if (dx < 0 || dy < 0 || dx >= W || dy >= H) continue;
                    ctx.fillStyle = colors[zone] || 'rgba(255,255,255,0.35)';
                    ctx.fillRect(dx, dy, 1, 1);
                }
            }
        }
    }

    _drawForgeAuthoredZoneOverlay(ctx, W, H, dir, frame, selected, colors) {
        const drawn = new Set();
        const editZone = this._forgeZoneEditZone || 'head';
        const zones = selected === 'all' ? this._forgeZoneEditZoneKeys() : [selected];
        for (const zone of zones) {
            if (!zone || zone === 'all') continue;
            if (this._forgeZoneEditMode && zone === editZone) continue;
            const ranges = this._forgeBuiltInZoneEditRanges(dir, frame, zone);
            if (!ranges || !ranges.length) continue;
            ctx.fillStyle = colors[zone] || 'rgba(255,255,255,0.35)';
            for (const [y, x0, x1] of ranges) {
                for (let x = x0; x <= x1; x++) {
                    if (x >= 0 && y >= 0 && x < W && y < H) ctx.fillRect(x, y, 1, 1);
                }
            }
            drawn.add(zone);
        }
        return drawn;
    }

    _forgeZoneColors(alpha = 0.58) {
        return {
            head: `rgba(80,160,255,${alpha})`,
            torso: `rgba(80,255,140,${alpha})`,
            arms: `rgba(255,80,80,${alpha})`,
            belt: `rgba(255,220,70,${alpha})`,
            legs: `rgba(190,90,255,${alpha})`,
            boots: `rgba(70,230,255,${alpha})`,
            armGauntlet: `rgba(255,138,61,${alpha})`,
            shoulders: `rgba(255,122,204,${alpha})`,
            hands: `rgba(255,179,107,${alpha})`,
            spikes: `rgba(214,255,70,${alpha})`
        };
    }

    _forgeZoneEditScopeKey() {
        const style = this.characterStyle || 'psychronic';
        const gender = this.gender || 'male';
        const bodyId = this._activeBodyId ? (this._activeBodyId() || '') : '';
        return `${style}:${gender}:${bodyId}`;
    }

    _forgeZoneEditZoneKeys() {
        const schema = this._forgeSchema();
        const zones = schema && Array.isArray(schema.zones) ? schema.zones.map(z => z.key) : [];
        const exts = schema && Array.isArray(schema.extensions) ? schema.extensions.map(ex => ex.type === 'pauldron' ? 'shoulders' : ex.type) : [];
        return Array.from(new Set(zones.concat(exts)));
    }

    _forgeZoneEditFrame(dir, frame, create = false) {
        const scope = this._forgeZoneEditScopeKey();
        const key = `${dir}:${frame}`;
        if (!this._forgeZoneEdits) this._forgeZoneEdits = {};
        if (create) {
            this._forgeZoneEdits[scope] = this._forgeZoneEdits[scope] || {};
            this._forgeZoneEdits[scope][key] = this._forgeZoneEdits[scope][key] || {};
            const edit = this._forgeZoneEdits[scope][key];
            if (!Object.prototype.hasOwnProperty.call(edit, '_seededZones')) {
                Object.defineProperty(edit, '_seededZones', { value: new Set(), enumerable: false });
            }
            if (!Object.prototype.hasOwnProperty.call(edit, '_editedZones')) {
                Object.defineProperty(edit, '_editedZones', { value: new Set(), enumerable: false });
            }
            if (!Object.prototype.hasOwnProperty.call(edit, '_seedSources')) {
                Object.defineProperty(edit, '_seedSources', { value: new Map(), enumerable: false });
            }
        }
        return this._forgeZoneEdits[scope] && this._forgeZoneEdits[scope][key] ? this._forgeZoneEdits[scope][key] : null;
    }

    _forgeBuiltInZoneEditRanges(dir, frame, zone) {
        const eng = this._outfitEngine();
        if (!eng || typeof eng.builtInZoneEditPayload !== 'function') return null;
        const payload = eng.builtInZoneEditPayload(this._forgeEngineConfig(), zone);
        return payload && payload.frames && payload.frames[`${dir}:${frame}`] && payload.frames[`${dir}:${frame}`][zone] || null;
    }

    _forgeRangesToEditSet(ranges, W, H) {
        const next = new Set();
        for (const [y, x0, x1] of ranges || []) {
            for (let x = x0; x <= x1; x++) {
                if (x >= 0 && y >= 0 && x < W && y < H) next.add(`${x},${y}`);
            }
        }
        return next;
    }

    _ensureForgeZoneEditSeeded(dir, frame, zone, bodyTemplate, W, H) {
        if (!zone || !bodyTemplate?.sheet?.[dir]?.[frame]) return;
        const edit = this._forgeZoneEditFrame(dir, frame, true);
        if (!edit) return;
        if (!Object.prototype.hasOwnProperty.call(edit, '_seededZones')) {
            Object.defineProperty(edit, '_seededZones', { value: new Set(), enumerable: false });
        }
        if (!Object.prototype.hasOwnProperty.call(edit, '_editedZones')) {
            Object.defineProperty(edit, '_editedZones', { value: new Set(), enumerable: false });
        }
        if (!Object.prototype.hasOwnProperty.call(edit, '_seedSources')) {
            Object.defineProperty(edit, '_seedSources', { value: new Map(), enumerable: false });
        }
        const builtInRanges = this._forgeBuiltInZoneEditRanges(dir, frame, zone);
        if (builtInRanges && builtInRanges.length && !edit._editedZones.has(zone)) {
            edit[zone] = this._forgeRangesToEditSet(builtInRanges, W, H);
            edit._seededZones.add(zone);
            edit._seedSources.set(zone, 'built-in');
            return;
        }
        if (edit._seededZones.has(zone)) return;
        const previous = edit[zone] instanceof Set ? edit[zone] : null;
        const next = new Set();
        const eng = this._outfitEngine();
        if (eng && typeof eng.debugClassifyFrame === 'function') {
            try {
                const debug = eng.debugClassifyFrame(this._forgeEngineConfig(), bodyTemplate.sheet[dir][frame], dir, bodyTemplate.palette, frame);
                const zones = debug && debug.zones;
                const shift = this._forgeBodyTemplateShift(bodyTemplate, W, H);
                for (let y = 0; zones && y < zones.length; y++) {
                    const row = zones[y] || [];
                    for (let x = 0; x < row.length; x++) {
                        const zoneCell = row[x];
                        const cellZones = Array.isArray(zoneCell) ? zoneCell : (zoneCell ? [zoneCell] : []);
                        if (!cellZones.includes(zone)) continue;
                        const dx = x + shift.x;
                        const dy = y + shift.y;
                        if (dx >= 0 && dy >= 0 && dx < W && dy < H) next.add(`${dx},${dy}`);
                    }
                }
            } catch (e) { console.warn('Could not seed zone edit mask', e); }
        }
        if (previous) for (const key of previous) next.add(key);
        edit[zone] = next;
        edit._seededZones.add(zone);
        edit._seedSources.set(zone, 'debug');
    }

    _ensureForgeZoneEditPayloadSeeded(onlyZone = null) {
        const body = this._forgeBodyTemplate();
        if (!body || !body.sheet) return;
        const zones = onlyZone ? [onlyZone] : this._forgeZoneEditZoneKeys();
        const W = this.frameWidth || 144;
        const H = this.frameHeight || 144;
        for (let dir = 0; dir < 4; dir++) {
            const frames = body.sheet[dir] || [];
            const nFrames = Math.max(3, frames.length || 0);
            for (let frame = 0; frame < nFrames; frame++) {
                if (!frames[frame]) continue;
                for (const zone of zones) this._ensureForgeZoneEditSeeded(dir, frame, zone, body, W, H);
            }
        }
    }

    _paintForgeZoneEdit(dir, frame, x, y) {
        const zone = this._forgeZoneEditZone || 'head';
        const size = Math.max(1, parseInt(this._forgeZoneEditBrush, 10) || 1);
        const r = Math.floor(size / 2);
        const body = this._forgeBodyTemplate();
        this._ensureForgeZoneEditSeeded(dir, frame, zone, body, this.frameWidth || 144, this.frameHeight || 144);
        const edit = this._forgeZoneEditFrame(dir, frame, true);
        if (this._forgeZoneEditAction === 'paint') edit[zone] = edit[zone] || new Set();
        let changed = false;
        for (let yy = y - r; yy <= y + r; yy++) for (let xx = x - r; xx <= x + r; xx++) {
            if (xx < 0 || yy < 0 || xx >= (this.frameWidth || 144) || yy >= (this.frameHeight || 144)) continue;
            const key = `${xx},${yy}`;
            if (this._forgeZoneEditAction === 'erase') {
                for (const set of Object.values(edit)) if (set && typeof set.delete === 'function' && set.delete(key)) changed = true;
            } else {
                if (!edit[zone].has(key)) {
                    edit[zone].add(key);
                    changed = true;
                }
            }
        }
        if (changed) {
            if (!Object.prototype.hasOwnProperty.call(edit, '_editedZones')) {
                Object.defineProperty(edit, '_editedZones', { value: new Set(), enumerable: false });
            }
            edit._editedZones.add(zone);
            this._scheduleForgePreview({ skipThumbnails: true });
        }
    }

    _drawForgeZoneEdits(ctx, W, H, dir, frame) {
        const edit = this._forgeZoneEditFrame(dir, frame, false);
        if (!edit) return;
        const selected = this._forgeZoneEditMode ? (this._forgeZoneEditZone || 'head') : (this._forgeDebugZone || 'all');
        const colors = this._forgeZoneColors(0.70);
        for (const [zone, set] of Object.entries(edit)) {
            if (zone[0] === '_') continue;
            if (!set || (selected !== 'all' && selected !== zone)) continue;
            ctx.fillStyle = colors[zone] || 'rgba(255,255,255,0.65)';
            for (const key of set) {
                const [x, y] = key.split(',').map(Number);
                if (Number.isFinite(x) && Number.isFinite(y) && x >= 0 && y >= 0 && x < W && y < H) ctx.fillRect(x, y, 1, 1);
            }
        }
    }

    _forgeZoneEditPayload(onlyZone = null) {
        const style = this.characterStyle || 'psychronic';
        const scope = this._forgeZoneEditScopeKey();
        const edits = (this._forgeZoneEdits && this._forgeZoneEdits[scope]) || {};
        const frames = {};
        for (const [frameKey, zones] of Object.entries(edits)) {
            const outZones = {};
            for (const [zone, set] of Object.entries(zones || {})) {
                if (zone[0] === '_') continue;
                if (onlyZone && zone !== onlyZone) continue;
                const rows = {};
                for (const key of set || []) {
                    const [x, y] = key.split(',').map(Number);
                    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
                    rows[y] = rows[y] || [];
                    rows[y].push(x);
                }
                const ranges = [];
                for (const [yStr, xsRaw] of Object.entries(rows)) {
                    const xs = Array.from(new Set(xsRaw)).sort((a, b) => a - b);
                    let start = null, prev = null;
                    for (const x of xs) {
                        if (start === null) { start = prev = x; continue; }
                        if (x === prev + 1) { prev = x; continue; }
                        ranges.push([Number(yStr), start, prev]);
                        start = prev = x;
                    }
                    if (start !== null) ranges.push([Number(yStr), start, prev]);
                }
                if (ranges.length) outZones[zone] = ranges.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
            }
            if (Object.keys(outZones).length) frames[frameKey] = outZones;
        }
        return {
            style,
            cell: { width: this.frameWidth || 144, height: this.frameHeight || 144 },
            format: 'frames["dir:frame"].zone = [[y, xStart, xEnd], ...]',
            frames
        };
    }

    _scheduleForgePreview(options = {}) {
        const skipThumbnails = !!options.skipThumbnails;
        if (!skipThumbnails) this._forgePreviewNeedsThumbnails = true;
        if (this._forgePreviewRaf) return;
        const raf = (typeof requestAnimationFrame === 'function') ? requestAnimationFrame : (cb) => setTimeout(cb, 16);
        this._forgePreviewRaf = raf(() => {
            this._forgePreviewRaf = 0;
            const drawThumbnails = this._forgePreviewNeedsThumbnails;
            this._forgePreviewNeedsThumbnails = false;
            this._drawForgePreview({ drawThumbnails });
        });
    }

    _drawForgePreview(options = {}) {
        if (!this.root) return;
        const drawThumbnails = options.drawThumbnails !== false;
        const canvases = this.root.querySelectorAll('.rr-forge-canvas');
        if (!canvases.length) return;
        const body = this._forgeBodyTemplate();
        const bodyDesc = RR_CHARACTER_REGISTRY.find(x => x.id === this._activeBodyId());
        if (!body || !bodyDesc) return;
        if (!this._forgeDescCache) this._forgeDescCache = this._forgeDescriptor();
        const outfit = this._forgeDescCache;
        const frame = (this._forgeFrame === undefined) ? 1 : this._forgeFrame;
        const W = this.frameWidth || 144, H = this.frameHeight || 144;
        const drawDebugOverlays = this._forgeDebugZones && !this._forgeWalking;
        const cacheOwner = `${this.characterStyle || 'psychronic'}|${this.gender || 'male'}|${this._activeBodyId()}|${W}x${H}`;
        if (this._forgePreviewCacheOwner !== cacheOwner || this._forgePreviewCacheDescriptor !== outfit) {
            this._forgePreviewCacheOwner = cacheOwner;
            this._forgePreviewCacheDescriptor = outfit;
            this._forgePreviewCache.clear();
        }
        canvases.forEach(canvas => {
            const dir = parseInt(canvas.getAttribute('data-dir'), 10) || 0;
            const parts = [
                { descriptor: bodyDesc, params: CharacterRenderer.resolveParams(bodyDesc, { alignX: 'center', alignY: 'middle' }) }
            ];
            if (outfit) parts.push({ descriptor: outfit, params: {} });
            try {
                const cacheKey = `${dir}:${frame}`;
                let img = this._forgePreviewCache.get(cacheKey);
                if (!img) {
                    img = CharacterRenderer.render(W, H, dir, frame, parts);
                    this._forgePreviewCache.set(cacheKey, img);
                }
                const ctx = canvas.getContext('2d');
                ctx.clearRect(0, 0, W, H);
                ctx.putImageData(img, 0, 0);
                if (drawDebugOverlays && this._forgeZoneEditMode) this._ensureForgeZoneEditSeeded(dir, frame, this._forgeZoneEditZone || 'head', body, W, H);
                if (drawDebugOverlays) this._drawForgeZoneOverlay(ctx, W, H, dir, frame, body);
                if (drawDebugOverlays) this._drawForgeZoneEdits(ctx, W, H, dir, frame);
            } catch (e) { console.warn('Outfit Forge preview error', e); }
        });
        if (drawThumbnails && !this._forgeWalking) this._drawForgePartThumbnails();
    }

    async _saveForgeOutfit() {
        const tt = (text) => (typeof window !== 'undefined' && window.I18n) ? window.I18n.tText(text) : text;
        const status = this.root && this.root.querySelector('.rr-forge-status');
        const setStatus = (msg, ok) => { if (status) { status.textContent = msg; status.style.color = ok ? 'var(--color-accent-bright)' : 'var(--color-text-muted)'; } };
        const eng = this._outfitEngine();
        const body = this._forgeBodyTemplate();
        if (!eng || !body) { setStatus(tt('Engine or body unavailable.'), false); return; }
        const cfg = this._forgeConfig();
        this._forgeSyncZoneLayers();
        const slug = (cfg.name || 'outfit').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'outfit';
        const styleId = this.characterStyle || 'psychronic';
        const tags = this._forgeTags(cfg);
        const partId = `full-outfits-${styleId}-${slug}`;
        const config = Object.assign(this._forgeEngineConfig(cfg), { style: styleId, category: 'full outfits', tags });
        let result;
        try { result = eng.generateOutfit(config, body); }
        catch (e) { setStatus(tt('Generation failed: {error}').replace('{error}', e.message), false); return; }

        // Emit a registry-compatible part and save it under
        // the style's "full outfits" category so it loads on next launch too.
        const palLines = Object.entries(result.palette)
            .map(([letter, slot]) => `        ${JSON.stringify(letter)}: { hex: ${JSON.stringify(slot.hex)}, material: ${JSON.stringify(slot.material || '')} }`).join(',\n');
        const dirNames = ['Front', 'Left', 'Right', 'Back'];
        const sheetLines = result.sheet.map((dir, di) =>
            `        // ${dirNames[di]}\n        [\n` +
            dir.map((fr, fi) => `            // Frame ${fi}\n            [\n` +
                fr.map(r => `                ${this._formatTemplateRowLiteral(r, 144)}`).join(',\n') + `\n            ]`).join(',\n') +
            `\n        ]`).join(',\n');
        const js = `// Procedurally generated outfit "${cfg.name}" — built in the Outfit Forge.\n` +
`RR_CHARACTER_REGISTRY.push({\n    id: ${JSON.stringify(partId)},\n    category: "full outfits",\n    name: ${JSON.stringify(cfg.name)},\n    tags: ${JSON.stringify(tags)},\n    params: [],\n    template: {\n        palette: {\n${palLines}\n        },\n        sheet: [\n${sheetLines}\n        ]\n    },\n    draw(buf, W, H, direction, frame, params) {\n        RR_CG_drawTemplatePart(buf, W, H, direction, frame, params, this);\n    }\n});\n`;

        try {
            const fs = require('fs'), path = require('path');
            const webHost = window.RPGReactorHost?.mode === 'web' ? window.RPGReactorHost : null;
            if (webHost) {
                const projectPath = this._syncProjectPath();
                const result = await webHost.saveFile({
                    data: js,
                    projectPath: projectPath ? path.join(projectPath, 'forge', 'character_generator', 'styles', styleId, 'parts', 'full outfits', `${partId}.js`) : null,
                    suggestedName: `${partId}.js`,
                    mimeType: 'text/javascript',
                });
                if (!result) return;
            } else {
                // Save into the PROJECT's forge library (the loader already
                // scans it). Writing into process.cwd()/src/... targeted the
                // editor install tree: lost on packaged installs, stranded
                // whenever cwd differs.
                const projectPath = this._syncProjectPath();
                if (!projectPath) {
                    setStatus(tt("Open a project first — outfits save into the project's forge library."), false);
                    return;
                }
                const dir = path.join(projectPath, 'forge', 'character_generator', 'styles', styleId, 'parts', 'full outfits');
                fs.mkdirSync(dir, { recursive: true });
                const filePath = path.join(dir, `${partId}.js`);
                if (fs.existsSync(filePath) &&
                    !confirm(tt("{file} already exists in this project's outfit library. Overwrite it?").replace('{file}', `${partId}.js`))) {
                    return;
                }
                fs.writeFileSync(filePath, js, 'utf8');
            }
        } catch (e) { setStatus(tt('Could not write file: {error}').replace('{error}', e.message), false); return; }

        // Register/refresh in the live registry so it appears immediately.
        for (let k = RR_CHARACTER_REGISTRY.length - 1; k >= 0; k--) {
            if (RR_CHARACTER_REGISTRY[k].id === partId) RR_CHARACTER_REGISTRY.splice(k, 1);
        }
        const descriptor = {
            id: partId, category: 'full outfits', name: cfg.name, tags, params: [],
            template: { palette: result.palette, sheet: result.sheet },
            draw(buf, W, H, direction, frame, params) { RR_CG_drawTemplatePart(buf, W, H, direction, frame, params, this); }
        };
        RR_CHARACTER_REGISTRY.push(descriptor);
        setStatus(tt('Saved “{name}” → {file} (available in Procedural parts).').replace('{name}', cfg.name).replace('{file}', `${partId}.js`), true);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    //  TAB — HAIR FORGE (procedural hair generator)
    //  Generates a normal `hair` template part from the active body/head anchors.
    // ═══════════════════════════════════════════════════════════════════════════

    _hairEngine() {
        if (this._hairEngineCache !== undefined) return this._hairEngineCache;
        if (typeof RR_HAIR_ENGINE !== 'undefined') {
            this._hairEngineCache = RR_HAIR_ENGINE;
            return this._hairEngineCache;
        }
        try {
            const path = require('path');
            const abs = path.join(process.cwd(), 'src', 'forge', 'CharacterGenerator', 'procgen', 'hair_engine.js');
            this._hairEngineCache = require(abs);
        } catch (e) {
            console.warn('Hair Forge: failed to load engine', e);
            this._hairEngineCache = null;
        }
        return this._hairEngineCache;
    }

    _hairBodyTemplate() { return this._forgeBodyTemplate(); }

    _hairConfig() {
        const styleId = this.characterStyle || 'psychronic';
        const eng = this._hairEngine();
        const defaults = eng && typeof eng.defaultConfig === 'function' ? eng.defaultConfig(styleId) : {
            params: { bangs: true, sideLocks: true, backVolume: true, outline: true, eyeZoneX: 1, eyeZoneY: 7, eyeZoneWidth: 3, eyeZoneHeight: 5, lowerBanding: 3, lowerScraggle: 2 }
        };
        if (this._hairCfgByStyle && this._hairCfgByStyle[styleId]) {
            const cached = this._hairCfgByStyle[styleId];
            cached.params = Object.assign({}, defaults.params || {}, cached.params || {});
            return cached;
        }
        const cfg = eng && typeof eng.defaultConfig === 'function' ? eng.defaultConfig(styleId) : {
            name: 'Layered Bob', category: 'hair', style: styleId, tags: [styleId, 'hair', 'procgen'],
            hairStyle: 'layered-bob', length: 'medium', color: 'chestnut', params: defaults.params
        };
        cfg.params = Object.assign({}, defaults.params || {}, cfg.params || {});
        cfg.tags = Array.from(new Set([...(cfg.tags || []), styleId, this.gender || 'male', 'hair', 'procgen']));
        this._hairCfgByStyle = this._hairCfgByStyle || {};
        this._hairCfgByStyle[styleId] = cfg;
        return cfg;
    }

    _hairEngineConfig(cfg = this._hairConfig()) {
        const styleId = this.characterStyle || 'psychronic';
        return Object.assign({}, cfg, {
            style: styleId,
            category: 'hair',
            tags: Array.from(new Set([...(cfg.tags || []), styleId, this.gender || 'male', 'hair', 'procgen']))
        });
    }

    _hairDescriptor() {
        const eng = this._hairEngine();
        const body = this._hairBodyTemplate();
        if (!eng || !body) return null;
        const cfg = this._hairConfig();
        let result;
        try { result = eng.generateHair(this._hairEngineConfig(cfg), body); }
        catch (e) { console.warn('Hair Forge: generate failed', e); return null; }
        return {
            id: 'hair-forge-preview', category: 'hair', name: cfg.name,
            tags: this._hairEngineConfig(cfg).tags, params: [],
            template: { palette: result.palette, sheet: result.sheet },
            draw(buf, W, H, direction, frame, params) {
                RR_CG_drawTemplatePart(buf, W, H, direction, frame, params, this);
            }
        };
    }

    _hairHTML() {
        const tt = (text) => (typeof window !== 'undefined' && window.I18n) ? window.I18n.tText(text) : text;
        const eng = this._hairEngine();
        const body = this._hairBodyTemplate();
        if (!eng || !body) {
            return `<div style="padding:24px;color:var(--color-text-muted);font-size:12px;">
                ${tt('Hair Forge needs the hair engine and a body part loaded.')}
                ${!eng ? '<br>' + tt('Engine failed to load (see console).') : ''}
                ${!body ? '<br>' + tt('No body part found in the registry.') : ''}
            </div>`;
        }
        const cfg = this._hairConfig();
        const schema = eng.UI_SCHEMA || { styles: [], lengths: [], colors: [] };
        const zoom = this._hairPreviewZoom || 4;
        const cw = (this.frameWidth || 144) * zoom, ch = (this.frameHeight || 144) * zoom;
        const frame = this._hairFrame === undefined ? 1 : this._hairFrame;
        const esc = (s) => String(s ?? '').replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
        const opt = (items, value, valueKey = 'value') => (items || []).map(item => {
            const v = item[valueKey];
            return `<option value="${v}" ${v === value ? 'selected' : ''}>${tt(item.label)}</option>`;
        }).join('');
        const activeColor = (schema.colors || []).find(color => color.key === cfg.color) || (schema.colors || [])[0] || { key: cfg.color || '', label: cfg.color || 'Color', swatch: 'transparent' };
        const canvases = ['Front', 'Left', 'Right', 'Back'].map((label, d) => `
            <div style="text-align:center;">
                <canvas class="rr-hair-canvas" data-dir="${d}" width="${this.frameWidth || 144}" height="${this.frameHeight || 144}"
                    style="width:${cw}px;height:${ch}px;image-rendering:pixelated;background:var(--color-checker,#1a1a2e);border:1px solid var(--color-border-input);border-radius:4px;"></canvas>
                <div style="font-size:9px;color:var(--color-text-muted);margin-top:2px;">${tt(label)}</div>
            </div>`).join('');
        return `<div style="display:flex;height:100%;min-height:0;">
            <div class="rr-hair-controls-scroll" style="width:300px;flex-shrink:0;overflow-y:auto;padding:14px;border-right:1px solid var(--color-border);background:var(--color-bg-base);">
                <div style="font-size:12px;font-weight:800;color:var(--color-text-dim);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:10px;">${tt('Hair Forge')}</div>
                <div style="font-size:12px;color:var(--color-text-muted);line-height:1.35;margin-bottom:12px;">${tt('Procedural hair aligned to the active body head and eye-line anchors, with frame-aware walk bobbing.')}</div>
                <label style="font-size:10px;color:var(--color-text-muted);display:block;margin-bottom:3px;">${tt('Hair name')}</label>
                <input type="text" class="rr-hair-name rr-input" value="${this._escapeHtml(cfg.name || '')}" style="width:100%;font-size:12px;padding:5px 8px;margin-bottom:10px;">
                <label style="font-size:10px;color:var(--color-text-muted);display:block;margin-bottom:3px;">${tt('Style')}</label>
                <select class="rr-hair-input rr-input" data-hair-field="hairStyle" style="width:100%;font-size:12px;padding:5px 8px;margin-bottom:10px;">${opt(schema.styles, cfg.hairStyle)}</select>
                <label style="font-size:10px;color:var(--color-text-muted);display:block;margin-bottom:3px;">${tt('Length')}</label>
                <select class="rr-hair-input rr-input" data-hair-field="length" style="width:100%;font-size:12px;padding:5px 8px;margin-bottom:10px;">${opt(schema.lengths, cfg.length)}</select>
                <label style="font-size:10px;color:var(--color-text-muted);display:block;margin-bottom:3px;">${tt('Color')}</label>
                <button type="button" class="rr-hair-color-choice rr-input" data-hair-color-value="${esc(activeColor.key)}" style="width:100%;display:flex;align-items:center;gap:8px;font-size:12px;padding:5px 8px;margin-bottom:12px;text-align:left;cursor:pointer;">
                    <span style="width:14px;height:14px;flex:0 0 auto;border-radius:3px;border:1px solid var(--color-border-input);background:${activeColor.swatch || 'transparent'};"></span>
                    <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(tt(activeColor.label))}</span>
                </button>
                ${['bangs:Front Bangs', 'sideLocks:Side Locks', 'outline:Pixel Outline'].map(row => {
                    const [key, label] = row.split(':');
                    return `<label style="display:flex;align-items:center;gap:7px;font-size:12px;color:var(--color-text);margin-bottom:8px;"><input type="checkbox" class="rr-hair-input" data-hair-param="${key}" ${cfg.params && cfg.params[key] !== false ? 'checked' : ''}>${tt(label)}</label>`;
                }).join('')}
                <div style="margin:12px 0 10px;padding:10px;border:1px solid var(--color-border-subtle);border-radius:6px;background:var(--color-bg-panel);">
                    <div style="font-size:10px;font-weight:800;color:var(--color-text-dim);text-transform:uppercase;letter-spacing:.4px;margin-bottom:8px;">${tt('Eye Zone')}</div>
                    <div style="font-size:10px;color:var(--color-text-muted);line-height:1.3;margin-bottom:8px;">${tt('Front view only. Adjusts the protected eye window so bangs do not cover eyes.')}</div>
                    ${[
                        ['eyeZoneX', 'X Offset', -6, 6, 1],
                        ['eyeZoneY', 'Y Offset', -2, 10, 1],
                        ['eyeZoneWidth', 'Width', 1, 6, 1],
                        ['eyeZoneHeight', 'Height', 1, 8, 1]
                    ].map(([key, label, min, max, step]) => `
                        <label style="display:grid;grid-template-columns:78px 1fr 36px;gap:6px;align-items:center;font-size:11px;color:var(--color-text);margin-bottom:6px;">
                            <span>${tt(label)}</span>
                            <input type="range" class="rr-hair-input" data-hair-param="${key}" min="${min}" max="${max}" step="${step}" value="${cfg.params && cfg.params[key] != null ? cfg.params[key] : 0}">
                            <input type="number" class="rr-hair-input rr-input" data-hair-param="${key}" min="${min}" max="${max}" step="${step}" value="${cfg.params && cfg.params[key] != null ? cfg.params[key] : 0}" style="font-size:10px;padding:2px 4px;width:36px;">
                        </label>`).join('')}
                </div>
                <div style="margin:12px 0 10px;padding:10px;border:1px solid var(--color-border-subtle);border-radius:6px;background:var(--color-bg-panel);">
                    <div style="font-size:10px;font-weight:800;color:var(--color-text-dim);text-transform:uppercase;letter-spacing:.4px;margin-bottom:8px;">${tt('Hair Pattern')}</div>
                    <div style="font-size:10px;color:var(--color-text-muted);line-height:1.3;margin-bottom:8px;">${tt('Lower-hair banding density and edge scraggle. Higher values are much more visible on side/back frames.')}</div>
                    ${[
                        ['lowerBanding', 'Lower Banding', 0, 5, 1],
                        ['lowerScraggle', 'Scraggle', 0, 5, 1]
                    ].map(([key, label, min, max, step]) => `
                        <label style="display:grid;grid-template-columns:92px 1fr 36px;gap:6px;align-items:center;font-size:11px;color:var(--color-text);margin-bottom:6px;">
                            <span>${tt(label)}</span>
                            <input type="range" class="rr-hair-input" data-hair-param="${key}" min="${min}" max="${max}" step="${step}" value="${cfg.params && cfg.params[key] != null ? cfg.params[key] : 0}">
                            <input type="number" class="rr-hair-input rr-input" data-hair-param="${key}" min="${min}" max="${max}" step="${step}" value="${cfg.params && cfg.params[key] != null ? cfg.params[key] : 0}" style="font-size:10px;padding:2px 4px;width:36px;">
                        </label>`).join('')}
                </div>
                <button class="rr-hair-save rr-btn" style="width:100%;font-size:12px;padding:7px 14px;margin-top:10px;cursor:pointer;background:var(--color-accent-bright);color:var(--color-bg-base);border-radius:4px;font-weight:800;">${this._t('forge.generateSave')}</button>
                <div class="rr-hair-status" style="font-size:10px;color:var(--color-text-muted);min-height:16px;margin-top:10px;"></div>
            </div>
            <div style="flex:1;min-width:0;overflow-y:auto;padding:16px;display:flex;flex-direction:column;align-items:center;gap:12px;">
                <div style="display:flex;align-items:center;gap:12px;">
                    <button class="rr-hair-walk" style="padding:5px 12px;font-size:11px;cursor:pointer;border-radius:3px;border:1px solid var(--color-border-input);background:${this._hairWalking ? 'var(--color-bg-button-active)' : 'var(--color-bg-button)'};color:var(--color-text-strong);">${this._hairWalking ? tt('Stop Walk') : tt('Play Walk')}</button>
                    <label style="display:flex;align-items:center;gap:5px;font-size:11px;color:var(--color-text-muted);">${tt('Frame')}
                        <select class="rr-hair-frame rr-input" style="font-size:11px;padding:3px 7px;">${[0,1,2].map(v => `<option value="${v}" ${frame === v ? 'selected' : ''}>${v}</option>`).join('')}</select>
                    </label>
                    <label style="display:flex;align-items:center;gap:5px;font-size:11px;color:var(--color-text-muted);">${tt('Zoom')}
                        <select class="rr-hair-preview-zoom rr-input" style="font-size:11px;padding:3px 7px;">${[2,3,4,5,6,8].map(v => `<option value="${v}" ${zoom === v ? 'selected' : ''}>${v}x</option>`).join('')}</select>
                    </label>
                </div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">${canvases}</div>
            </div>
        </div>`;
    }

    _wireHairEvents() {
        const tt = (text) => (typeof window !== 'undefined' && window.I18n) ? window.I18n.tText(text) : text;
        const rootEl = this.root;
        if (!rootEl) return;
        const cfg = this._hairConfig();
        const invalidate = () => {
            this._hairDescCache = null;
            this._hairPreviewCache.clear();
            this._drawHairPreview();
        };
        const nameEl = rootEl.querySelector('.rr-hair-name');
        if (nameEl) nameEl.addEventListener('input', () => { cfg.name = nameEl.value; this._hairDescCache = null; });
        rootEl.querySelectorAll('.rr-hair-input').forEach(el => {
            el.addEventListener('change', () => {
                const field = el.getAttribute('data-hair-field');
                const param = el.getAttribute('data-hair-param');
                if (field) cfg[field] = el.value;
                if (param) {
                    cfg.params = cfg.params || {};
                    cfg.params[param] = el.type === 'checkbox' ? el.checked : (el.type === 'number' || el.type === 'range' ? parseFloat(el.value) : el.value);
                    rootEl.querySelectorAll(`.rr-hair-input[data-hair-param="${param}"]`).forEach(peer => {
                        if (peer !== el && peer.type !== 'checkbox') peer.value = el.value;
                    });
                }
                invalidate();
            });
        });
        let hairColorMenu = null;
        let hairColorDocHandler = null;
        const closeHairColorMenu = () => {
            if (hairColorMenu && hairColorMenu.parentNode) hairColorMenu.parentNode.removeChild(hairColorMenu);
            hairColorMenu = null;
            if (hairColorDocHandler) document.removeEventListener('mousedown', hairColorDocHandler, true);
            hairColorDocHandler = null;
        };
        const colorBtn = rootEl.querySelector('.rr-hair-color-choice');
        if (colorBtn) colorBtn.addEventListener('click', e => {
            e.preventDefault();
            e.stopPropagation();
            const schema = this._hairEngine()?.UI_SCHEMA || { colors: [] };
            const options = schema.colors || [];
            if (!options.length) return;
            closeHairColorMenu();
            const rect = colorBtn.getBoundingClientRect();
            const vw = window.innerWidth || document.documentElement.clientWidth || 900;
            const vh = window.innerHeight || document.documentElement.clientHeight || 700;
            const desiredH = Math.min(300, Math.max(150, options.length * 30 + 8));
            const below = vh - rect.bottom - 8;
            const above = rect.top - 8;
            const openUp = below < 170 && above > below;
            const maxH = Math.max(120, Math.min(desiredH, openUp ? above : below));
            const width = Math.max(rect.width, 210);
            const left = Math.max(8, Math.min(rect.left, vw - width - 8));
            const top = openUp ? Math.max(8, rect.top - maxH - 4) : Math.min(vh - maxH - 8, rect.bottom + 4);
            hairColorMenu = document.createElement('div');
            hairColorMenu.className = 'rr-hair-color-menu';
            hairColorMenu.style.cssText = `position:fixed;left:${left}px;top:${top}px;width:${width}px;max-height:${maxH}px;overflow-y:auto;padding:5px;z-index:100000;border:1px solid var(--color-accent-bright);border-radius:6px;background:var(--color-bg-base);box-shadow:0 8px 24px rgba(0,0,0,.45);`;
            options.forEach(opt => {
                const row = document.createElement('button');
                row.type = 'button';
                row.style.cssText = `width:100%;display:flex;align-items:center;gap:8px;margin-bottom:4px;padding:6px 7px;border:1px solid ${opt.key === cfg.color ? 'var(--color-accent-bright)' : 'var(--color-border-subtle)'};border-radius:4px;background:${opt.key === cfg.color ? 'var(--color-bg-button-active)' : 'var(--color-bg-panel)'};color:var(--color-text);font-size:12px;text-align:left;cursor:pointer;`;
                const swatch = document.createElement('span');
                swatch.style.cssText = `width:14px;height:14px;flex:0 0 auto;border-radius:3px;border:1px solid var(--color-border-input);background:${opt.swatch || 'transparent'};`;
                const label = document.createElement('span');
                label.style.cssText = 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
                label.textContent = tt(opt.label || opt.key);
                row.appendChild(swatch);
                row.appendChild(label);
                row.addEventListener('click', ev => {
                    ev.preventDefault();
                    ev.stopPropagation();
                    cfg.color = opt.key;
                    this._hairDescCache = null;
                    this._hairPreviewCache.clear();
                    closeHairColorMenu();
                    this._renderPreservingScroll();
                });
                hairColorMenu.appendChild(row);
            });
            hairColorMenu.addEventListener('mousedown', ev => ev.stopPropagation());
            document.body.appendChild(hairColorMenu);
            hairColorDocHandler = (ev) => {
                if (hairColorMenu && !hairColorMenu.contains(ev.target) && ev.target !== colorBtn) closeHairColorMenu();
            };
            document.addEventListener('mousedown', hairColorDocHandler, true);
        });
        const frameEl = rootEl.querySelector('.rr-hair-frame');
        if (frameEl) frameEl.addEventListener('change', () => {
            this._stopPreviewWalk('hair', false);
            const nextFrame = parseInt(frameEl.value, 10);
            this._hairFrame = Math.max(0, Math.min(2, Number.isFinite(nextFrame) ? nextFrame : 1));
            this._drawHairPreview();
        });
        const zoomEl = rootEl.querySelector('.rr-hair-preview-zoom');
        if (zoomEl) zoomEl.addEventListener('change', () => {
            this._hairPreviewZoom = Math.max(2, Math.min(8, parseInt(zoomEl.value, 10) || 4));
            this._renderPreservingScroll();
        });
        const walkBtn = rootEl.querySelector('.rr-hair-walk');
        if (walkBtn) walkBtn.addEventListener('click', () => this._togglePreviewWalk('hair'));
        const saveBtn = rootEl.querySelector('.rr-hair-save');
        if (saveBtn) saveBtn.addEventListener('click', () => this._saveHairPart());
    }

    _drawHairPreview() {
        if (!this.root) return;
        const canvases = this.root.querySelectorAll('.rr-hair-canvas');
        if (!canvases.length) return;
        const bodyDesc = RR_CHARACTER_REGISTRY.find(x => x.id === this._activeBodyId());
        if (!bodyDesc) return;
        if (!this._hairDescCache) this._hairDescCache = this._hairDescriptor();
        const hair = this._hairDescCache;
        const frame = this._hairFrame === undefined ? 1 : this._hairFrame;
        const W = this.frameWidth || 144, H = this.frameHeight || 144;
        const cacheOwner = `${this.characterStyle || 'psychronic'}|${this.gender || 'male'}|${this._activeBodyId()}|${W}x${H}`;
        if (this._hairPreviewCacheOwner !== cacheOwner || this._hairPreviewCacheDescriptor !== hair) {
            this._hairPreviewCacheOwner = cacheOwner;
            this._hairPreviewCacheDescriptor = hair;
            this._hairPreviewCache.clear();
        }
        canvases.forEach(canvas => {
            const dir = parseInt(canvas.getAttribute('data-dir'), 10) || 0;
            const parts = [{ descriptor: bodyDesc, params: CharacterRenderer.resolveParams(bodyDesc, { alignX: 'center', alignY: 'middle' }) }];
            if (hair) parts.push({ descriptor: hair, params: {} });
            try {
                const cacheKey = `${dir}:${frame}`;
                let img = this._hairPreviewCache.get(cacheKey);
                if (!img) {
                    img = CharacterRenderer.render(W, H, dir, frame, parts);
                    this._hairPreviewCache.set(cacheKey, img);
                }
                const ctx = canvas.getContext('2d');
                ctx.clearRect(0, 0, W, H);
                ctx.putImageData(img, 0, 0);
            } catch (e) { console.warn('Hair Forge preview error', e); }
        });
    }

    async _saveHairPart() {
        const tt = (text) => (typeof window !== 'undefined' && window.I18n) ? window.I18n.tText(text) : text;
        const status = this.root && this.root.querySelector('.rr-hair-status');
        const setStatus = (msg, ok) => { if (status) { status.textContent = msg; status.style.color = ok ? 'var(--color-accent-bright)' : 'var(--color-text-muted)'; } };
        const eng = this._hairEngine();
        const body = this._hairBodyTemplate();
        if (!eng || !body) { setStatus(tt('Engine or body unavailable.'), false); return; }
        const cfg = this._hairConfig();
        const styleId = this.characterStyle || 'psychronic';
        const slug = (cfg.name || 'hair').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'hair';
        const partId = `hair-${styleId}-${slug}`;
        const config = this._hairEngineConfig(cfg);
        let result;
        try { result = eng.generateHair(config, body); }
        catch (e) { setStatus(tt('Generation failed: {error}').replace('{error}', e.message), false); return; }
        const palLines = Object.entries(result.palette)
            .map(([letter, slot]) => `        ${JSON.stringify(letter)}: { hex: ${JSON.stringify(slot.hex)}, material: ${JSON.stringify(slot.material || '')} }`).join(',\n');
        const dirNames = ['Front', 'Left', 'Right', 'Back'];
        const sheetLines = result.sheet.map((dir, di) =>
            `        // ${dirNames[di]}\n        [\n` +
            dir.map((fr, fi) => `            // Frame ${fi}\n            [\n` +
                fr.map(r => `                ${this._formatTemplateRowLiteral(r, 144)}`).join(',\n') + `\n            ]`).join(',\n') +
            `\n        ]`).join(',\n');
        const js = `// Procedurally generated hair "${cfg.name}" — built in the Hair Forge.\n` +
`RR_CHARACTER_REGISTRY.push({\n    id: ${JSON.stringify(partId)},\n    category: "hair",\n    name: ${JSON.stringify(cfg.name)},\n    tags: ${JSON.stringify(config.tags)},\n    params: [],\n    template: {\n        palette: {\n${palLines}\n        },\n        sheet: [\n${sheetLines}\n        ]\n    },\n    draw(buf, W, H, direction, frame, params) {\n        RR_CG_drawTemplatePart(buf, W, H, direction, frame, params, this);\n    }\n});\n`;
        try {
            const fs = require('fs'), path = require('path');
            const webHost = window.RPGReactorHost?.mode === 'web' ? window.RPGReactorHost : null;
            if (webHost) {
                const projectPath = this._syncProjectPath();
                const result = await webHost.saveFile({
                    data: js,
                    projectPath: projectPath ? path.join(projectPath, 'forge', 'character_generator', 'styles', styleId, 'parts', 'hair', `${partId}.js`) : null,
                    suggestedName: `${partId}.js`,
                    mimeType: 'text/javascript',
                });
                if (!result) return;
            } else {
                // Project forge library, not the editor install tree (see
                // the Outfit Forge save above).
                const projectPath = this._syncProjectPath();
                if (!projectPath) {
                    setStatus(tt("Open a project first — hair parts save into the project's forge library."), false);
                    return;
                }
                const dir = path.join(projectPath, 'forge', 'character_generator', 'styles', styleId, 'parts', 'hair');
                fs.mkdirSync(dir, { recursive: true });
                const filePath = path.join(dir, `${partId}.js`);
                if (fs.existsSync(filePath) &&
                    !confirm(tt("{file} already exists in this project's hair library. Overwrite it?").replace('{file}', `${partId}.js`))) {
                    return;
                }
                fs.writeFileSync(filePath, js, 'utf8');
            }
        } catch (e) { setStatus(tt('Could not write file: {error}').replace('{error}', e.message), false); return; }
        for (let k = RR_CHARACTER_REGISTRY.length - 1; k >= 0; k--) {
            if (RR_CHARACTER_REGISTRY[k].id === partId) RR_CHARACTER_REGISTRY.splice(k, 1);
        }
        RR_CHARACTER_REGISTRY.push({
            id: partId, category: 'hair', name: cfg.name, tags: config.tags, params: [],
            template: { palette: result.palette, sheet: result.sheet },
            draw(buf, W, H, direction, frame, params) { RR_CG_drawTemplatePart(buf, W, H, direction, frame, params, this); }
        });
        setStatus(tt('Saved “{name}” → {file} (available in Procedural parts).').replace('{name}', cfg.name).replace('{file}', `${partId}.js`), true);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    //  TAB 1 — PROCEDURAL
    // ═══════════════════════════════════════════════════════════════════════════

    _proceduralHTML() {
        const tt = (text) => (typeof window !== 'undefined' && window.I18n) ? window.I18n.tText(text) : text;
        const DIRS = ['Front', 'Left', 'Right', 'Back'];
        const partId = this._activeBodyId();
        const selectedPartId = this._activeProceduralPartId();
        const descriptor = RR_CHARACTER_REGISTRY.find(d => d.id === selectedPartId);
        const currentParams = this.partParams[selectedPartId] || {};
        const autoZoom = Math.max(1, Math.min(8, Math.floor(432 / Math.max(this.frameWidth, this.frameHeight))));
        if (!this.proceduralZoom) this.proceduralZoom = autoZoom;
        const zoom = Math.max(1, Math.min(16, this.proceduralZoom));
        const prevW = this.frameWidth * zoom;
        const prevH = this.frameHeight * zoom;
        const sheetCellZoom = Math.max(1, Math.min(2, Math.floor(80 / Math.max(this.frameWidth, this.frameHeight))));
        const sheetW = this.frameWidth * 3 * sheetCellZoom;
        const sheetH = this.frameHeight * 4 * sheetCellZoom;
        const alignBtnStyle = (active) => `padding:3px 8px;font-size:10px;cursor:pointer;border-radius:3px;border:1px solid var(--color-border-input);background:${active ? 'var(--color-bg-button-active)' : 'var(--color-bg-button)'};color:var(--color-text-strong);`;

        const paramRows = (descriptor?.params || []).map(p => {
            if (p.type === 'color') {
                const val = currentParams[p.key] ?? p.default;
                return `<div style="display:grid;grid-template-columns:90px 1fr;gap:8px;align-items:center;margin-bottom:10px;">
                    <label style="font-size:11px;color:var(--color-text-muted);">${tt(p.label)}</label>
                    <button type="button" class="rr-color-swatch-btn rr-cgp-color-swatch" data-key="${p.key}"
                        style="background:${val};" title="${tt('Click to choose colour')}"></button>
                </div>`;
            }
            if (p.type === 'slider') {
                const val = currentParams[p.key] ?? p.default;
                return `<div style="padding:6px 0;border-bottom:1px solid var(--color-border-subtle);">
                    <div style="display:flex;justify-content:space-between;margin-bottom:3px;">
                        <label style="font-size:11px;color:var(--color-text);">${tt(p.label)}</label>
                        <span class="rr-cgp-val-${p.key}" style="font-size:10px;color:var(--color-text-muted);">${val}</span>
                    </div>
                    <input type="range" class="rr-cgp-param" data-key="${p.key}" min="${p.min}" max="${p.max}" step="${p.step}" value="${val}" style="width:100%;">
                </div>`;
            }
            return '';
        }).join('');

        // Dynamic per-letter palette rows for body parts with a new-format template.
        const templatePalette = this._activeBodyTemplatePalette(selectedPartId);
        const paletteOverrides = currentParams.paletteOverrides || {};
        const paletteRows = templatePalette
            ? Object.entries(templatePalette).map(([letter, entry], idx) => {
                const baseHex = (typeof entry === 'object' ? entry.hex : entry) || '#888888';
                const material = (typeof entry === 'object' ? entry.material : '') || '';
                const val = paletteOverrides[letter] || baseHex;
                const label = material
                    ? tt(material[0].toUpperCase() + material.slice(1))
                    : tt('Color {number}').replace('{number}', idx + 1);
                return `<div style="display:grid;grid-template-columns:auto 1fr auto;gap:6px;align-items:center;margin-bottom:6px;">
                    <span style="font:700 10px monospace;width:18px;text-align:center;color:var(--color-text-dim);">${letter}</span>
                    <label style="font-size:11px;color:var(--color-text-muted);">${label}</label>
                    <button type="button" class="rr-color-swatch-btn rr-cgp-color-swatch" data-key="palette:${letter}"
                        style="background:${val};width:28px;height:18px;" title="${tt('{letter}: click to choose colour').replace('{letter}', letter)}"></button>
                </div>`;
            }).join('')
            : '';
        const tintHex = currentParams.tintAll || this._averageTemplatePaletteHex(templatePalette) || '#888888';
        const tintRow = templatePalette
            ? `<div style="display:grid;grid-template-columns:auto 1fr auto auto;gap:6px;align-items:center;margin-bottom:8px;padding-bottom:8px;border-bottom:1px solid var(--color-border-subtle);">
                <span style="font:700 10px monospace;width:18px;text-align:center;color:var(--color-text-dim);">•</span>
                 <label style="font-size:11px;color:var(--color-accent-bright);font-weight:600;">${tt('Tint All')}</label>
                <button type="button" class="rr-cgp-tint-reset" title="${tt('Reset tint (use original palette colours)')}" style="padding:1px 6px;font-size:10px;cursor:pointer;border-radius:3px;border:1px solid var(--color-border-input);background:var(--color-bg-button);color:var(--color-text-strong);">↺</button>
                <button type="button" class="rr-color-swatch-btn rr-cgp-color-swatch" data-key="tintAll"
                    style="background:${tintHex};width:28px;height:18px;" title="${tt('Shift every palette colour toward this hue/saturation/lightness.')}"></button>
            </div>`
            : '';
        const paletteSection = paletteRows
            ? `<div>
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
                    <span style="font-size:9px;font-weight:700;color:var(--color-accent-bright);text-transform:uppercase;letter-spacing:0.4px;">${tt('Template Palette')}</span>
                    <button type="button" class="rr-cgp-palette-reset rr-btn-chip" title="${tt('Discard every per-letter override and tint on this layer, restoring the imported palette.')}"
                        style="padding:2px 8px;font-size:10px;color:var(--color-accent-bright);">${tt('Reset')}</button>
                </div>
                ${tintRow}
                ${paletteRows}
              </div>`
            : '';
        const offX = currentParams.offsetX || 0;
        const offY = currentParams.offsetY || 0;
        const nudgeSection = selectedPartId
            ? `<div style="margin-top:14px;padding-top:10px;border-top:1px solid var(--color-border-subtle);">
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">
                    <span style="font-size:9px;font-weight:700;color:var(--color-accent-bright);text-transform:uppercase;letter-spacing:0.4px;">${tt('Nudge Layer')}</span>
                    <button type="button" class="rr-cgp-nudge-reset rr-btn-chip" title="${tt("Clear this layer's nudge offset.")}"
                        style="padding:2px 8px;font-size:10px;color:var(--color-accent-bright);">${tt('Reset')}</button>
                </div>
                <div style="display:grid;grid-template-columns:auto 1fr auto;gap:6px;align-items:center;font-size:11px;color:var(--color-text-muted);">
                    <span>X</span>
                    <input type="number" class="rr-cgp-nudge-x rr-input" value="${offX}" step="1" style="padding:2px 6px;font-size:11px;width:100%;box-sizing:border-box;">
                    <span style="font-size:10px;color:var(--color-text-dim);">px</span>
                    <span>Y</span>
                    <input type="number" class="rr-cgp-nudge-y rr-input" value="${offY}" step="1" style="padding:2px 6px;font-size:11px;width:100%;box-sizing:border-box;">
                    <span style="font-size:10px;color:var(--color-text-dim);">px</span>
                </div>
                <div style="margin-top:6px;font-size:9px;color:var(--color-text-dim);line-height:1.35;">${tt("Manual offset for this layer only — useful when auto-align can't fully fix a misframed part.")}</div>
              </div>`
            : '';

        return `
        <div style="display:grid;grid-template-columns:220px 200px 1fr 240px;flex:1;min-height:0;height:100%;">

            <!-- Library column -->
            <div style="background:var(--color-bg-panel);border-right:1px solid var(--color-border);display:flex;flex-direction:column;min-height:0;">
                <div style="padding:8px 10px;border-bottom:1px solid var(--color-border-subtle);flex-shrink:0;">
                    <div style="display:flex;gap:4px;margin-bottom:6px;">
                        <button class="rr-cgp-gender" data-gender="male" style="flex:1;padding:4px;font-size:11px;cursor:pointer;border-radius:3px;border:1px solid var(--color-border-input);background:${this.gender === 'male' ? 'var(--color-bg-button-active)' : 'var(--color-bg-button)'};color:var(--color-text-strong);">${tt('Male')}</button>
                        <button class="rr-cgp-gender" data-gender="female" style="flex:1;padding:4px;font-size:11px;cursor:pointer;border-radius:3px;border:1px solid var(--color-border-input);background:${this.gender === 'female' ? 'var(--color-bg-button-active)' : 'var(--color-bg-button)'};color:var(--color-text-strong);">${tt('Female')}</button>
                    </div>
                    <input type="text" class="rr-cgp-search rr-input" placeholder="${tt('Search parts…')}" value="${this._escapeHtml(this.proceduralSearchQuery || '')}"
                        style="width:100%;padding:4px 8px;font-size:11px;box-sizing:border-box;">
                </div>
                <div class="rr-cgp-library-scroll" style="flex:1;min-height:0;overflow-y:auto;">
                    <div style="padding:6px 10px;font-size:9px;font-weight:700;color:var(--color-accent-bright);text-transform:uppercase;letter-spacing:0.5px;">${tt('Library')}</div>
                    ${this._renderPartsLibrary(selectedPartId)}
                </div>
            </div>

            <!-- Layers column -->
            <div style="background:var(--color-bg-deep);border-right:1px solid var(--color-border);display:flex;flex-direction:column;min-height:0;">
                <div style="padding:8px 10px;border-bottom:1px solid var(--color-border-subtle);flex-shrink:0;font-size:9px;font-weight:700;color:var(--color-accent-bright);text-transform:uppercase;letter-spacing:0.5px;">${tt('Layers (top→bottom)')}</div>
                <div class="rr-cgp-layers-scroll" style="flex:1;min-height:0;overflow-y:auto;">
                    ${this._renderActiveLayers(selectedPartId)}
                </div>
            </div>

            <!-- Centre: preview -->
            <div style="display:flex;flex-direction:column;align-items:center;justify-content:flex-start;padding:20px 16px;gap:12px;background:var(--color-bg-base);overflow-y:auto;">
                <!-- Direction buttons -->
                <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;justify-content:center;">
                    <span style="font-size:10px;color:var(--color-text-muted);">${this._t('forge.frame')}</span>
                    <input type="number" class="rr-cgp-fw rr-input" value="${this.frameWidth}" min="8" max="512" style="width:58px;padding:3px 6px;font-size:11px;">
                    <span style="font-size:10px;color:var(--color-text-muted);">×</span>
                    <input type="number" class="rr-cgp-fh rr-input" value="${this.frameHeight}" min="8" max="512" style="width:58px;padding:3px 6px;font-size:11px;">
                    <span style="width:1px;height:18px;background:var(--color-border-subtle);margin:0 4px;"></span>
                    <span style="font-size:10px;color:var(--color-text-muted);">${tt('Direction:')}</span>
                    ${DIRS.map((d, i) => `<button class="rr-cgp-dir" data-dir="${i}" style="padding:4px 10px;font-size:11px;cursor:pointer;border-radius:3px;border:1px solid var(--color-border-input);background:${this.direction === i ? 'var(--color-bg-button-active)' : 'var(--color-bg-button)'};color:var(--color-text-strong);">${tt(d)}</button>`).join('')}
                    <button class="rr-cgp-anim" style="padding:4px 10px;font-size:11px;cursor:pointer;border-radius:3px;border:1px solid var(--color-border-input);background:${this.proceduralAnimating ? 'var(--color-bg-button-active)' : 'var(--color-bg-button)'};color:var(--color-text-strong);">${this.proceduralAnimating ? tt('Stop Walk') : tt('Play Walk')}</button>
                </div>

                <!-- Zoom controls -->
                <div style="display:flex;gap:6px;align-items:center;font-size:10px;color:var(--color-text-muted);">
                    <span>${tt('Zoom:')}</span>
                    <button class="rr-cgp-zoom-out" style="padding:3px 8px;font-size:11px;cursor:pointer;border-radius:3px;border:1px solid var(--color-border-input);background:var(--color-bg-button);color:var(--color-text-strong);">−</button>
                    <span style="min-width:32px;text-align:center;">${zoom}×</span>
                    <button class="rr-cgp-zoom-in" style="padding:3px 8px;font-size:11px;cursor:pointer;border-radius:3px;border:1px solid var(--color-border-input);background:var(--color-bg-button);color:var(--color-text-strong);">+</button>
                    <button class="rr-cgp-zoom-fit" style="padding:3px 8px;font-size:10px;cursor:pointer;border-radius:3px;border:1px solid var(--color-border-input);background:var(--color-bg-button);color:var(--color-text-strong);">${tt('Fit')}</button>
                </div>

                <!-- Sheet thumbnail + Main canvas, side by side -->
                <div style="display:flex;gap:12px;align-items:flex-start;justify-content:center;flex-wrap:wrap;">
                    <div style="display:flex;flex-direction:column;align-items:center;gap:4px;">
                        <div style="font-size:9px;color:var(--color-text-dim);text-transform:uppercase;">${this._t('forge.sheet').replace(':', '')}</div>
                        <div style="background:var(--color-checker,#1a1a2e);border:1px solid var(--color-border-input);border-radius:4px;padding:4px;">
                            <canvas class="rr-cgp-sheet" width="${this.frameWidth * 3}" height="${this.frameHeight * 4}"
                                style="width:${sheetW}px;height:${sheetH}px;image-rendering:pixelated;display:block;cursor:pointer;"></canvas>
                        </div>
                    </div>
                    <div style="display:flex;flex-direction:column;align-items:center;gap:4px;">
                        <div style="font-size:9px;color:var(--color-text-dim);text-transform:uppercase;">${tt('Preview')}</div>
                        <div style="background:var(--color-checker,#1a1a2e);border:1px solid var(--color-border-input);border-radius:4px;padding:8px;overflow:auto;max-width:560px;max-height:560px;">
                            <canvas class="rr-cgp-canvas" width="${this.frameWidth}" height="${this.frameHeight}"
                                style="width:${prevW}px;height:${prevH}px;image-rendering:pixelated;display:block;"></canvas>
                        </div>
                    </div>
                </div>

                <div style="display:flex;gap:5px;align-items:center;font-size:10px;color:var(--color-text-muted);">
                    <span>${this._t('forge.frame')}</span>
                    ${[0, 1, 2].map(i => `<button class="rr-cgp-frame" data-frame="${i}" style="padding:3px 8px;font-size:10px;cursor:pointer;border-radius:3px;border:1px solid var(--color-border-input);background:${this.walkFrame === i ? 'var(--color-bg-button-active)' : 'var(--color-bg-button)'};color:var(--color-text-strong);">${i + 1}</button>`).join('')}
                </div>

                <div style="display:flex;gap:12px;align-items:center;justify-content:center;flex-wrap:wrap;font-size:10px;color:var(--color-text-muted);">
                    <span>${tt('Align X:')}</span>
                    ${['left', 'center', 'right'].map(v => `<button class="rr-cgp-align-x" data-align="${v}" style="${alignBtnStyle(this.templateAlignX === v)}">${tt(v[0].toUpperCase() + v.slice(1))}</button>`).join('')}
                    <span style="width:1px;height:18px;background:var(--color-border-subtle);"></span>
                    <span>${tt('Align Y:')}</span>
                    ${['top', 'middle', 'bottom'].map(v => `<button class="rr-cgp-align-y" data-align="${v}" style="${alignBtnStyle(this.templateAlignY === v)}">${tt(v[0].toUpperCase() + v.slice(1))}</button>`).join('')}
                </div>

                <div style="font-size:10px;color:var(--color-text-dim);text-align:center;">
                    ${tt('Native {nativeSize} · displayed at {zoom}× · 3×4 walking sheet {sheetSize}').replace('{nativeSize}', `${this.frameWidth}×${this.frameHeight}`).replace('{zoom}', zoom).replace('{sheetSize}', `${this.sheetWidth}×${this.sheetHeight}`)}
                </div>
            </div>

            <!-- Right: params -->
            <div style="background:var(--color-bg-panel);border-left:1px solid var(--color-border);overflow-y:auto;padding:12px;">
                <div style="font-size:10px;font-weight:700;color:var(--color-accent-bright);text-transform:uppercase;letter-spacing:0.4px;margin-bottom:10px;">${descriptor ? tt(descriptor.name) : tt('No Part')}</div>
                ${paletteSection
                    ? paletteSection
                    : (paramRows || `<div style="font-size:10px;color:var(--color-text-muted);">${tt('No parameters.')}</div>`)}
                ${nudgeSection}
            </div>
        </div>

        <!-- Footer -->
        <div style="padding:10px 18px;border-top:1px solid var(--color-border-subtle);background:var(--color-bg-panel);display:flex;align-items:center;gap:10px;flex-shrink:0;">
            <label style="font-size:12px;color:var(--color-text-muted);">${this._t('forge.saveAs')}</label>
            <input type="text" class="rr-cgp-name rr-input" placeholder="${tt('Hero')}" style="width:160px;padding:4px 8px;font-size:12px;">
            <span style="font-size:10px;color:var(--color-text-dim);">→ img/characters/$&lt;name&gt;.png (${this.sheetWidth}×${this.sheetHeight})</span>
            <button class="rr-cgp-bulk-import rr-btn-chip" style="padding:6px 12px;margin-left:auto;color:var(--color-accent-bright);">${tt('Import Parts...')}</button>
            <span class="rr-cgp-template-status" style="font-size:10px;color:var(--color-text-dim);min-width:120px;"></span>
            <div>
                <button class="rr-cgp-save rr-btn-chip" style="padding:6px 18px;color:var(--color-accent-bright);">${this._t('forge.saveSheet')}</button>
            </div>
        </div>`;
    }

    _findBodyId(gender = this.gender) {
        // Body parts are registered as regular template descriptors with
        // category='body'. We pick the one whose id contains the requested
        // gender keyword (matches the bulk-import naming convention), and
        // fall back to whatever body is present so the UI always has SOMETHING
        // to show even if the user removed one gender.
        const bodies = RR_CHARACTER_REGISTRY.filter(d => d.category === 'body');
        const styleId = this.characterStyle || 'psychronic';
        const hasStyle = (d) => Array.isArray(d.tags) && d.tags.map(t => String(t).toLowerCase()).includes(styleId);
        const styleBodies = bodies.filter(hasStyle);
        const pool = styleBodies.length ? styleBodies : bodies;
        // NB: the substring "male" is contained in "female", so a naive
        // includes('male') match also matches female bodies. Match male
        // explicitly as "not female" so the male tab never shows a female body.
        const wanted = pool.find(d => {
            const id = d.id.toLowerCase();
            return gender === 'male' ? (id.includes('male') && !id.includes('female')) : id.includes(gender);
        });
        return (wanted || pool[0] || bodies[0])?.id || null;
    }

    _activeBodyId() {
        return this._findBodyId();
    }



    _renderPartsLibrary(selectedPartId) {
        const tt = (text) => (typeof window !== 'undefined' && window.I18n) ? window.I18n.tText(text) : text;
        const query = (this.proceduralSearchQuery || '').toLowerCase();
        const all = this._proceduralPartDescriptors().filter(d => {
            if (!query) return true;
            return (d.name || '').toLowerCase().includes(query) ||
                   (d.category || '').toLowerCase().includes(query) ||
                   (d.id || '').toLowerCase().includes(query);
        });
        const byCategory = {};
        for (const d of all) {
            const cat = d.category || 'other';
            if (!byCategory[cat]) byCategory[cat] = [];
            byCategory[cat].push(d);
        }
        const cats = Object.keys(byCategory).sort();
        if (!cats.length) {
            return '<div style="padding:10px;font-size:10px;color:var(--color-text-muted);">' + tt('No parts match.') + '</div>';
        }
        return cats.map(cat => {
            const collapsed = this.collapsedCategories.has(cat);
            const items = byCategory[cat];
            const header = `<div class="rr-cgp-cat-header" data-cat="${cat}" style="display:flex;align-items:center;gap:4px;padding:4px 10px;font-size:10px;font-weight:700;color:var(--color-text-dim);text-transform:uppercase;letter-spacing:0.4px;cursor:pointer;background:var(--color-bg-panel);border-top:1px solid var(--color-border-subtle);">
                <span style="font-size:9px;">${collapsed ? '▶' : '▼'}</span>
                <span>${tt(cat)}</span>
                <span style="margin-left:auto;font-size:9px;color:var(--color-text-muted);">${items.length}</span>
            </div>`;
            if (collapsed) return header;
            const rows = items.map(d => {
                const isActive = this.activePartIds.has(d.id);
                const isSelected = d.id === selectedPartId;
                const thumb = this._renderPartThumbnail(d.id, 28, 28);
                return `<div class="rr-cgp-part-row" data-part-id="${d.id}" style="display:flex;align-items:center;gap:6px;padding:4px 10px 4px 14px;cursor:pointer;font-size:11px;color:var(--color-text);border-left:3px solid ${isSelected ? 'var(--color-accent-bright)' : 'transparent'};background:${isSelected ? 'var(--color-bg-hover)' : 'transparent'};">
                    <span style="flex:0 0 auto;width:28px;height:28px;background:var(--color-checker,#1a1a2e);border:1px solid var(--color-border-input);border-radius:3px;display:flex;align-items:center;justify-content:center;overflow:hidden;">
                        ${thumb ? `<img src="${thumb}" style="width:28px;height:28px;image-rendering:pixelated;display:block;">` : ''}
                    </span>
                    <span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${tt(d.name)}</span>
                    <button class="rr-cgp-toggle-part" data-part-id="${d.id}" title="${isActive ? tt('Remove from scene') : tt('Add to scene')}"
                        style="flex:0 0 auto;padding:1px 6px;font-size:11px;cursor:pointer;border-radius:3px;border:1px solid var(--color-border-input);background:${isActive ? 'var(--color-accent-bright)' : 'var(--color-bg-button)'};color:${isActive ? 'var(--color-bg-base)' : 'var(--color-text-strong)'};">${isActive ? '✓' : '+'}</button>
                </div>`;
            }).join('');
            return header + rows;
        }).join('');
    }

    _renderActiveLayers(selectedPartId) {
        const tt = (text) => (typeof window !== 'undefined' && window.I18n) ? window.I18n.tText(text) : text;
        if (!this.activeLayerOrder.length) {
            return '<div style="padding:8px 10px;font-size:10px;color:var(--color-text-muted);">' + tt('No active layers.') + '</div>';
        }
        // Top of list = topmost layer (drawn last). Iterate the underlying
        // array in reverse so the visual order matches the stack metaphor most
        // image editors use.
        const len = this.activeLayerOrder.length;
        const displayOrder = [...this.activeLayerOrder].reverse();
        return displayOrder.map((id, displayIdx) => {
            const i = len - 1 - displayIdx;
            const d = RR_CHARACTER_REGISTRY.find(x => x.id === id);
            if (!d) return '';
            const isSelected = id === selectedPartId;
            const isBody = d.category === 'body';
            // Up/down freely available for every layer — only disable at the
            // top/bottom of the list. Remove is always available too; the
            // user can re-add a body from the picker if they remove it.
            const upDisabled = displayIdx === 0;
            const downDisabled = displayIdx === len - 1;
            const removeDisabled = false;
            const thumb = this._renderPartThumbnail(id, 36, 36);
            const isHidden = this.hiddenPartIds.has(id);
            const draggable = true;
            const eyeSvg = isHidden
                ? `<svg viewBox="0 0 16 16" width="14" height="14" style="display:block;"><path d="M2 8C2 8 4.5 4 8 4S14 8 14 8 11.5 12 8 12 2 8 2 8z" fill="none" stroke="currentColor" stroke-width="1.2"/><circle cx="8" cy="8" r="1.6" fill="currentColor"/><line x1="2" y1="2" x2="14" y2="14" stroke="currentColor" stroke-width="1.5"/></svg>`
                : `<svg viewBox="0 0 16 16" width="14" height="14" style="display:block;"><path d="M2 8C2 8 4.5 4 8 4S14 8 14 8 11.5 12 8 12 2 8 2 8z" fill="none" stroke="currentColor" stroke-width="1.2"/><circle cx="8" cy="8" r="1.6" fill="currentColor"/></svg>`;
            return `<div class="rr-cgp-layer-row" data-part-id="${id}" data-layer-index="${i}" ${draggable ? 'draggable="true"' : ''}
                style="display:flex;align-items:flex-start;gap:6px;padding:6px 8px;cursor:${draggable ? 'grab' : 'pointer'};font-size:11px;color:var(--color-text);border-left:3px solid ${isSelected ? 'var(--color-accent-bright)' : 'transparent'};border-bottom:1px solid var(--color-border-subtle);background:${isSelected ? 'var(--color-bg-hover)' : 'transparent'};opacity:${isHidden ? '0.5' : '1'};">
                <span style="flex:0 0 auto;width:36px;height:36px;background:var(--color-checker,#1a1a2e);border:1px solid var(--color-border-input);border-radius:3px;display:flex;align-items:center;justify-content:center;overflow:hidden;">
                    ${thumb ? `<img src="${thumb}" style="width:36px;height:36px;image-rendering:pixelated;display:block;">` : ''}
                </span>
                <div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:4px;">
                    <div style="font-size:11px;line-height:1.2;color:var(--color-text);overflow:hidden;text-overflow:ellipsis;${isHidden ? 'text-decoration:line-through;' : ''}" title="${tt(d.name)}${isBody ? ' ' + tt('(base)') : ''}">${tt(d.name)}${isBody ? ' ' + tt('(base)') : ''}</div>
                    <div style="display:flex;gap:3px;align-items:center;">
                        <button class="rr-cgp-layer-eye" data-part-id="${id}"
                            title="${isHidden ? tt('Show layer') : tt('Hide layer')}" style="flex:0 0 auto;padding:1px 5px;cursor:pointer;border-radius:2px;border:1px solid var(--color-border-input);background:var(--color-bg-button);color:var(--color-text-strong);display:flex;align-items:center;">${eyeSvg}</button>
                        <button class="rr-cgp-layer-up" data-layer-index="${i}" ${upDisabled ? 'disabled' : ''}
                            title="${tt('Move up (drawn later, closer to top)')}" style="flex:0 0 auto;padding:1px 6px;font-size:10px;cursor:${upDisabled ? 'default' : 'pointer'};border-radius:2px;border:1px solid var(--color-border-input);background:var(--color-bg-button);color:var(--color-text-strong);opacity:${upDisabled ? '0.3' : '1'};">▲</button>
                        <button class="rr-cgp-layer-down" data-layer-index="${i}" ${downDisabled ? 'disabled' : ''}
                            title="${tt('Move down (drawn earlier, behind)')}" style="flex:0 0 auto;padding:1px 6px;font-size:10px;cursor:${downDisabled ? 'default' : 'pointer'};border-radius:2px;border:1px solid var(--color-border-input);background:var(--color-bg-button);color:var(--color-text-strong);opacity:${downDisabled ? '0.3' : '1'};">▼</button>
                        <button class="rr-cgp-layer-remove" data-part-id="${id}" ${removeDisabled ? 'disabled' : ''}
                            title="${tt('Remove from scene')}" style="flex:0 0 auto;padding:1px 6px;font-size:10px;cursor:${removeDisabled ? 'default' : 'pointer'};border-radius:2px;border:1px solid var(--color-border-input);background:var(--color-bg-button);color:var(--color-text-strong);opacity:${removeDisabled ? '0.3' : '1'};">×</button>
                    </div>
                </div>
            </div>`;
        }).join('');
    }

    _renderPreservingScroll() {
        const scrolls = {};
        this.root?.querySelectorAll('[class*="-scroll"]').forEach(el => {
            const cls = Array.from(el.classList).find(c => c.endsWith('-scroll'));
            if (cls) scrolls[cls] = el.scrollTop;
        });
        this._render();
        Object.entries(scrolls).forEach(([cls, top]) => {
            const el = this.root?.querySelector('.' + cls);
            if (el) el.scrollTop = top;
        });
    }

    _averageTemplatePaletteHex(palette) {
        if (!palette) return null;
        const hexes = Object.values(palette)
            .map(e => typeof e === 'string' ? e : (e && e.hex))
            .filter(Boolean);
        if (!hexes.length) return null;
        let r = 0, g = 0, b = 0;
        for (const h of hexes) {
            const n = parseInt(String(h).replace('#', ''), 16);
            r += (n >> 16) & 255;
            g += (n >> 8) & 255;
            b += n & 255;
        }
        const cnt = hexes.length;
        return '#' + ((1 << 24) | ((r / cnt | 0) << 16) | ((g / cnt | 0) << 8) | (b / cnt | 0)).toString(16).slice(1);
    }

    _renderPartThumbnail(partId, sizeW, sizeH) {
        if (!this._thumbnailCache) this._thumbnailCache = new Map();
        const key = `${partId}:${sizeW}x${sizeH}:${this.gender}:${this.characterStyle}:${JSON.stringify(this.partParams[partId] || {})}`;
        const cached = this._thumbnailCache.get(key);
        if (cached) return cached;
        const descriptor = RR_CHARACTER_REGISTRY.find(d => d.id === partId);
        if (!descriptor || typeof descriptor.draw !== 'function') return '';
        try {
            const userValues = {
                ...(this.partParams[partId] || {}),
                style: this.characterStyle,
                alignX: this.templateAlignX,
                alignY: this.templateAlignY
            };
            const params = CharacterRenderer.resolveParams(descriptor, userValues);
            const img = CharacterRenderer.render(sizeW, sizeH, 0, 1, [{ descriptor, params }]);
            const tmp = document.createElement('canvas');
            tmp.width = sizeW; tmp.height = sizeH;
            tmp.getContext('2d').putImageData(img, 0, 0);
            const url = tmp.toDataURL('image/png');
            this._thumbnailCache.set(key, url);
            return url;
        } catch (e) {
            return '';
        }
    }

    _activeBodyTemplatePalette(partId) {
        // Every part (body included) now carries its palette inline on the
        // descriptor.template — no special-case body lookup needed.
        const descriptor = RR_CHARACTER_REGISTRY.find(d => d.id === partId);
        return descriptor?.template?.palette || null;
    }

    _activeProceduralPartId() {
        const visible = this._proceduralPartDescriptors();
        if (!visible.some(d => d.id === this.selectedProceduralPartId)) {
            // Selection was filtered out (gender switch, style switch, part
            // removed, etc.). Fall back to the first visible part so the
            // picker always shows SOMETHING, without making any opinionated
            // pick like "always select the body".
            this.selectedProceduralPartId = visible[0]?.id || null;
        }
        return this.selectedProceduralPartId;
    }

    _partGender(d) {
        // Prefer the id substring (least likely to drift — the file name is
        // the source of truth) and fall back to tags. Returns 'male',
        // 'female', or null for gender-neutral.
        const id = (d.id || '').toLowerCase();
        if (id.includes('female')) return 'female';
        if (id.includes('male')) return 'male';
        const tags = Array.isArray(d.tags) ? d.tags : [];
        if (tags.includes('female')) return 'female';
        if (tags.includes('male')) return 'male';
        return null;
    }

    _proceduralPartDescriptors() {
        return RR_CHARACTER_REGISTRY.filter(d => this._isProceduralDescriptorCompatible(d));
    }

    _isProceduralDescriptorCompatible(descriptor) {
        const gender = this._partGender(descriptor);
        if (gender !== null && gender !== this.gender) return false;

        const styleIds = new Set(this._characterStyles().map(style => style.id));
        const tags = Array.isArray(descriptor.tags)
            ? descriptor.tags.map(tag => String(tag).toLowerCase())
            : [];
        const styleTags = tags.filter(tag => styleIds.has(tag));
        return styleTags.length === 0 || styleTags.includes(this.characterStyle);
    }

    _buildActiveParts() {
        const parts = [];
        for (const id of this.activeLayerOrder) {
            if (this.hiddenPartIds.has(id)) continue;
            const descriptor = RR_CHARACTER_REGISTRY.find(d => d.id === id);
            if (!descriptor) continue;
            if (!this._isProceduralDescriptorCompatible(descriptor)) continue;
            const userValues = {
                ...(this.partParams[id] || {}),
                style: this.characterStyle,
                alignX: this.templateAlignX,
                alignY: this.templateAlignY
            };
            const params = CharacterRenderer.resolveParams(descriptor, userValues);
            parts.push({ descriptor, params });
        }
        return parts;
    }

    _drawProceduralPreview() {
        if (!this.root) return;
        const activeParts = this._buildActiveParts();
        const FW = this.frameWidth, FH = this.frameHeight;

        // Compose all 12 cells ONCE per part spec into an offscreen sheet.
        // Walk ticks (170ms) and direction/frame switches only move within
        // the sheet — previously every tick re-rendered all 12 cells plus
        // the main preview.
        const cacheKey = JSON.stringify([FW, FH,
            activeParts.map(p => [p.descriptor.id, p.params])]);
        if (this._procSheetCacheKey !== cacheKey) {
            const sheet = this._procSheetCache || (this._procSheetCache = document.createElement('canvas'));
            sheet.width = FW * 3;
            sheet.height = FH * 4;
            const cacheCtx = sheet.getContext('2d');
            const cell = this._procCellScratch || (this._procCellScratch = document.createElement('canvas'));
            cell.width = FW;
            cell.height = FH;
            const cellCtx = cell.getContext('2d');
            for (let dir = 0; dir < 4; dir++) {
                for (let f = 0; f < 3; f++) {
                    const cellImg = CharacterRenderer.render(FW, FH, dir, f, activeParts);
                    cellCtx.putImageData(cellImg, 0, 0);
                    cacheCtx.drawImage(cell, f * FW, dir * FH);
                }
            }
            this._procSheetCacheKey = cacheKey;
        }

        const canvas = this.root.querySelector('.rr-cgp-canvas');
        if (canvas) {
            if (canvas.width !== FW) canvas.width = FW;
            if (canvas.height !== FH) canvas.height = FH;
            const ctx = canvas.getContext('2d');
            ctx.imageSmoothingEnabled = false;
            ctx.clearRect(0, 0, FW, FH);
            ctx.drawImage(this._procSheetCache,
                this.walkFrame * FW, this.direction * FH, FW, FH,
                0, 0, FW, FH);
        }

        const sheetCanvas = this.root.querySelector('.rr-cgp-sheet');
        if (sheetCanvas) {
            const sw = FW * 3, sh = FH * 4;
            if (sheetCanvas.width !== sw) sheetCanvas.width = sw;
            if (sheetCanvas.height !== sh) sheetCanvas.height = sh;
            const sctx = sheetCanvas.getContext('2d');
            sctx.clearRect(0, 0, sw, sh);
            sctx.drawImage(this._procSheetCache, 0, 0);
            // Active cell highlight
            sctx.strokeStyle = '#ffd54a';
            sctx.lineWidth = Math.max(1, Math.floor(Math.min(FW, FH) / 24));
            sctx.strokeRect(this.walkFrame * FW + 0.5, this.direction * FH + 0.5,
                FW - 1, FH - 1);
        }
    }

    _wireProceduralEvents() {
        // Gender buttons
        this.root.querySelectorAll('.rr-cgp-gender').forEach(btn => {
            btn.addEventListener('click', () => {
                this.gender = btn.dataset.gender;
                this._forgeDescCache = null;
                this._forgePreviewCache?.clear?.();
                this._forgePreviewCacheOwner = null;
                this._forgePreviewCacheDescriptor = null;
                // Tabs are pure filters — the layer list stays exactly as the
                // user arranged it. If the previously selected part is hidden
                // by the filter, the picker won't focus anything until the
                // user clicks something visible.
                this._render();
            });
        });

        // Direction buttons
        this.root.querySelectorAll('.rr-cgp-dir').forEach(btn => {
            btn.addEventListener('click', () => {
                this.direction = parseInt(btn.dataset.dir);
                this._render();
            });
        });

        this.root.querySelectorAll('.rr-cgp-frame').forEach(btn => {
            btn.addEventListener('click', () => {
                this.walkFrame = parseInt(btn.dataset.frame);
                this._render();
            });
        });

        const zoomIn = this.root.querySelector('.rr-cgp-zoom-in');
        const zoomOut = this.root.querySelector('.rr-cgp-zoom-out');
        const zoomFit = this.root.querySelector('.rr-cgp-zoom-fit');
        if (zoomIn) zoomIn.addEventListener('click', () => {
            this.proceduralZoom = Math.min(16, (this.proceduralZoom || 1) + 1);
            this._render();
        });
        if (zoomOut) zoomOut.addEventListener('click', () => {
            this.proceduralZoom = Math.max(1, (this.proceduralZoom || 1) - 1);
            this._render();
        });
        if (zoomFit) zoomFit.addEventListener('click', () => {
            this.proceduralZoom = null;
            this._render();
        });

        const sheetCanvas = this.root.querySelector('.rr-cgp-sheet');
        if (sheetCanvas) {
            sheetCanvas.addEventListener('click', (e) => {
                const rect = sheetCanvas.getBoundingClientRect();
                const cellW = rect.width / 3, cellH = rect.height / 4;
                const f = Math.max(0, Math.min(2, Math.floor((e.clientX - rect.left) / cellW)));
                const d = Math.max(0, Math.min(3, Math.floor((e.clientY - rect.top) / cellH)));
                this.walkFrame = f;
                this.direction = d;
                this._render();
            });
        }

        this.root.querySelectorAll('.rr-cgp-align-x').forEach(btn => {
            btn.addEventListener('click', () => {
                this.templateAlignX = btn.dataset.align;
                this._saveConfig();
                this._render();
            });
        });

        this.root.querySelectorAll('.rr-cgp-align-y').forEach(btn => {
            btn.addEventListener('click', () => {
                this.templateAlignY = btn.dataset.align;
                this._saveConfig();
                this._render();
            });
        });

        const animBtn = this.root.querySelector('.rr-cgp-anim');
        if (animBtn) animBtn.addEventListener('click', () => this._toggleProceduralWalkPreview());

        const procFw = this.root.querySelector('.rr-cgp-fw');
        const procFh = this.root.querySelector('.rr-cgp-fh');
        const commitFrameSize = () => {
            const w = parseInt(procFw.value) || this.frameWidth;
            const h = parseInt(procFh.value) || this.frameHeight;
            if (this._setFrameSize(w, h)) this._render();
        };
        if (procFw && procFh) {
            procFw.addEventListener('change', commitFrameSize);
            procFh.addEventListener('change', commitFrameSize);
        }

        // Part list rows: clicking the row body selects the part for editing.
        this.root.querySelectorAll('.rr-cgp-part-row').forEach(row => {
            row.addEventListener('click', (e) => {
                if (e.target.closest('.rr-cgp-toggle-part')) return;
                this.selectedProceduralPartId = row.dataset.partId;
                this._renderPreservingScroll();
            });
        });

        // Search
        const search = this.root.querySelector('.rr-cgp-search');
        if (search) {
            search.addEventListener('input', () => {
                this.proceduralSearchQuery = search.value;
                this._renderPreservingScroll();
                const newSearch = this.root.querySelector('.rr-cgp-search');
                if (newSearch) { newSearch.focus(); newSearch.setSelectionRange(search.value.length, search.value.length); }
            });
        }

        // Category collapse toggle
        this.root.querySelectorAll('.rr-cgp-cat-header').forEach(h => {
            h.addEventListener('click', () => {
                const cat = h.dataset.cat;
                if (this.collapsedCategories.has(cat)) this.collapsedCategories.delete(cat);
                else this.collapsedCategories.add(cat);
                this._renderPreservingScroll();
            });
        });

        // Add / remove part from active layers
        this.root.querySelectorAll('.rr-cgp-toggle-part').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = btn.dataset.partId;
                if (this.activePartIds.has(id)) {
                    this.activePartIds.delete(id);
                    this.activeLayerOrder = this.activeLayerOrder.filter(x => x !== id);
                } else {
                    this.activePartIds.add(id);
                    this.activeLayerOrder.push(id);
                    this.selectedProceduralPartId = id;
                }
                this._renderPreservingScroll();
            });
        });

        // Layer reorder + remove
        this.root.querySelectorAll('.rr-cgp-layer-row').forEach(row => {
            row.addEventListener('click', (e) => {
                if (e.target.tagName === 'BUTTON') return;
                this.selectedProceduralPartId = row.dataset.partId;
                this._renderPreservingScroll();
            });
        });
        // Up = move toward top of list = forward in render order = swap with i+1.
        this.root.querySelectorAll('.rr-cgp-layer-up').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (btn.disabled) return;
                const i = parseInt(btn.dataset.layerIndex);
                const arr = this.activeLayerOrder;
                if (i >= arr.length - 1) return;
                [arr[i + 1], arr[i]] = [arr[i], arr[i + 1]];
                this._renderPreservingScroll();
            });
        });
        // Down = move toward bottom of list = back in render order = swap with i-1.
        this.root.querySelectorAll('.rr-cgp-layer-down').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (btn.disabled) return;
                const i = parseInt(btn.dataset.layerIndex);
                if (i <= 0) return;
                const arr = this.activeLayerOrder;
                [arr[i - 1], arr[i]] = [arr[i], arr[i - 1]];
                this._renderPreservingScroll();
            });
        });
        this.root.querySelectorAll('.rr-cgp-layer-remove').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (btn.disabled) return;
                const id = btn.dataset.partId;
                this.activePartIds.delete(id);
                this.activeLayerOrder = this.activeLayerOrder.filter(x => x !== id);
                this._renderPreservingScroll();
            });
        });

        // Eye / visibility toggle
        this.root.querySelectorAll('.rr-cgp-layer-eye').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = btn.dataset.partId;
                if (this.hiddenPartIds.has(id)) this.hiddenPartIds.delete(id);
                else this.hiddenPartIds.add(id);
                this._thumbnailCache?.clear();
                this._renderPreservingScroll();
            });
        });

        // Drag-and-drop reordering of layer rows
        let dragFromIdx = -1;

        // Drop catcher on the layers scroll container so drops above the top
        // row or below the bottom row still register (the rows themselves only
        // accept drops over their own bounding box).
        const layersScroll = this.root.querySelector('.rr-cgp-layers-scroll');
        if (layersScroll) {
            layersScroll.addEventListener('dragover', (e) => {
                if (dragFromIdx < 0) return;
                e.preventDefault();
                if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
            });
            layersScroll.addEventListener('drop', (e) => {
                if (dragFromIdx < 0) return;
                if (e.target.closest('.rr-cgp-layer-row')) return; // row handled it
                e.preventDefault();
                const rows = Array.from(layersScroll.querySelectorAll('.rr-cgp-layer-row'));
                if (!rows.length) return;
                const firstRect = rows[0].getBoundingClientRect();
                const lastRect = rows[rows.length - 1].getBoundingClientRect();
                const arr = this.activeLayerOrder;
                const [item] = arr.splice(dragFromIdx, 1);
                let insertAt;
                if (e.clientY < firstRect.top) {
                    insertAt = arr.length; // very top of list = end of array
                } else if (e.clientY > lastRect.bottom) {
                    insertAt = 0; // very bottom of list = start of array
                } else {
                    arr.splice(dragFromIdx, 0, item); // put it back
                    dragFromIdx = -1;
                    return;
                }
                arr.splice(insertAt, 0, item);
                dragFromIdx = -1;
                this._renderPreservingScroll();
            });
        }
        this.root.querySelectorAll('.rr-cgp-layer-row').forEach(row => {
            row.addEventListener('dragstart', (e) => {
                dragFromIdx = parseInt(row.dataset.layerIndex);
                row.style.opacity = '0.5';
                if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
            });
            row.addEventListener('dragend', () => {
                row.style.opacity = '';
                dragFromIdx = -1;
                this.root.querySelectorAll('.rr-cgp-layer-row').forEach(r => { r.style.boxShadow = ''; });
            });
            row.addEventListener('dragover', (e) => {
                if (dragFromIdx < 0) return;
                e.preventDefault();
                if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
                const rect = row.getBoundingClientRect();
                const above = (e.clientY - rect.top) < rect.height / 2;
                row.style.boxShadow = above
                    ? 'inset 0 2px 0 var(--color-accent-bright)'
                    : 'inset 0 -2px 0 var(--color-accent-bright)';
            });
            row.addEventListener('dragleave', () => { row.style.boxShadow = ''; });
            row.addEventListener('drop', (e) => {
                e.preventDefault();
                row.style.boxShadow = '';
                if (dragFromIdx < 0) return;
                const targetIdx = parseInt(row.dataset.layerIndex);
                if (targetIdx === dragFromIdx) { dragFromIdx = -1; return; }
                const rect = row.getBoundingClientRect();
                // Above in the visual list = HIGHER real index (list is reversed).
                const above = (e.clientY - rect.top) < rect.height / 2;
                let insertAt = above ? targetIdx + 1 : targetIdx;
                const arr = this.activeLayerOrder;
                const [item] = arr.splice(dragFromIdx, 1);
                // Adjust for the index shift caused by the splice BEFORE clamp.
                if (dragFromIdx < insertAt) insertAt--;
                if (insertAt > arr.length) insertAt = arr.length;
                if (insertAt < 0) insertAt = 0;
                arr.splice(insertAt, 0, item);
                dragFromIdx = -1;
                this._renderPreservingScroll();
            });
        });

        // Color swatch buttons — open themed HSV picker
        this.root.querySelectorAll('.rr-cgp-color-swatch').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this._openColorPicker(btn);
            });
        });

        // Tint All reset
        this.root.querySelectorAll('.rr-cgp-tint-reset').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const partId = this._activeProceduralPartId();
                if (this.partParams[partId]) delete this.partParams[partId].tintAll;
                this._thumbnailCache?.clear();
                this._renderPreservingScroll();
            });
        });

        // Reset whole palette: clear per-letter overrides + tint for this part.
        this.root.querySelectorAll('.rr-cgp-palette-reset').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const partId = this._activeProceduralPartId();
                const p = this.partParams[partId];
                if (p) {
                    delete p.paletteOverrides;
                    delete p.tintAll;
                }
                this._thumbnailCache?.clear();
                this._renderPreservingScroll();
            });
        });

        // Per-layer nudge X/Y inputs
        const nudgeX = this.root.querySelector('.rr-cgp-nudge-x');
        const nudgeY = this.root.querySelector('.rr-cgp-nudge-y');
        const commitNudge = () => {
            const partId = this._activeProceduralPartId();
            if (!this.partParams[partId]) this.partParams[partId] = {};
            this.partParams[partId].offsetX = parseInt(nudgeX?.value || '0', 10) || 0;
            this.partParams[partId].offsetY = parseInt(nudgeY?.value || '0', 10) || 0;
            this._thumbnailCache?.clear();
            this._drawProceduralPreview();
        };
        if (nudgeX) nudgeX.addEventListener('input', commitNudge);
        if (nudgeY) nudgeY.addEventListener('input', commitNudge);
        const nudgeReset = this.root.querySelector('.rr-cgp-nudge-reset');
        if (nudgeReset) nudgeReset.addEventListener('click', (e) => {
            e.stopPropagation();
            const partId = this._activeProceduralPartId();
            if (this.partParams[partId]) {
                delete this.partParams[partId].offsetX;
                delete this.partParams[partId].offsetY;
            }
            this._thumbnailCache?.clear();
            this._renderPreservingScroll();
        });

        // Slider param inputs
        this.root.querySelectorAll('.rr-cgp-param[type="range"]').forEach(input => {
            const key = input.dataset.key;
            const partId = this._activeProceduralPartId();
            const update = () => {
                const val = parseFloat(input.value);
                if (!this.partParams[partId]) this.partParams[partId] = {};
                this.partParams[partId][key] = val;
                const label = this.root.querySelector(`.rr-cgp-val-${key}`);
                if (label) label.textContent = val;
                this._drawProceduralPreview();
            };
            input.addEventListener('input', update);
            input.addEventListener('change', update);
        });

        // Save
        const saveBtn = this.root.querySelector('.rr-cgp-save');
        if (saveBtn) saveBtn.addEventListener('click', () => this._saveProceduralSheet());

        const bulkBtn = this.root.querySelector('.rr-cgp-bulk-import');
        if (bulkBtn) bulkBtn.addEventListener('click', () => this._openBulkImportChooser());

        const normBtn = this.root.querySelector('.rr-cgp-normalize');
        if (normBtn) normBtn.addEventListener('click', () => this._normalizeAllTemplates());
    }

    _normalizeAllTemplates() {
        const tt = (text) => (typeof window !== 'undefined' && window.I18n) ? window.I18n.tText(text) : text;
        // Collect every sheet plus its category so we can anchor non-body parts
        // to the body's content landmarks AFTER padding (so padding can't shift
        // them back out of alignment).
        const sheetMeta = [];
        const bodySheets = (typeof window !== 'undefined' && window.RR_CG_BODY_TEMPLATE_SHEETS) || null;
        let bodyMeta = null;
        if (bodySheets) {
            for (const style in bodySheets) {
                for (const variant in bodySheets[style]) {
                    const entry = bodySheets[style][variant];
                    const sheet = entry && (Array.isArray(entry) ? entry : entry.sheet);
                    if (!sheet) continue;
                    const meta = { sheet, category: 'body' };
                    sheetMeta.push(meta);
                    if (style === this.characterStyle && variant === this.gender) bodyMeta = meta;
                }
            }
        }
        for (const d of RR_CHARACTER_REGISTRY) {
            if (d.template && d.template.sheet) sheetMeta.push({ sheet: d.template.sheet, category: d.category });
        }

        let w = 0, h = 0;
        for (const meta of sheetMeta) {
            const c = this._sheetMaxDims(meta.sheet);
            if (c.w > w) w = c.w;
            if (c.h > h) h = c.h;
        }
        if (!w || !h) { this._setTemplateStatus(tt('No templates to normalize.')); return; }

        // Pad each sheet to (w, h). Cross-part alignment is handled at RENDER
        // time by CharacterRenderer's shared body reference, which lets the
        // user's alignX/alignY changes work live without baking position into
        // the sheets here.
        for (const meta of sheetMeta) this._padSheetInPlace(meta.sheet, w, h, this.templateAlignX, this.templateAlignY);

        this._setTemplateStatus(tt('Normalized {count} sheet(s) to {size} (align {alignment}).')
            .replace('{count}', sheetMeta.length)
            .replace('{size}', `${w}×${h}`)
            .replace('{alignment}', `${this.templateAlignX}/${this.templateAlignY}`));
        this._render();
    }

    _sheetMaxDims(sheet) {
        let w = 0, h = 0;
        if (!Array.isArray(sheet)) return { w, h };
        for (const dir of sheet) {
            if (!Array.isArray(dir)) continue;
            for (const frame of dir) {
                if (!Array.isArray(frame)) continue;
                if (frame.length > h) h = frame.length;
                for (const row of frame) w = Math.max(w, this._templateRowWidth(row));
            }
        }
        return { w, h };
    }

    _padSheetInPlace(sheet, w, h /* alignX, alignY ignored — always symmetric */) {
        // Simple symmetric padding only. Every sheet ends up at (w, h) with
        // original content centered in the new bounds. Cross-template alignment
        // works because every sheet shares (w, h) and content positions within
        // them are preserved.
        if (!Array.isArray(sheet)) return;
        let sheetCurW = 0, sheetCurH = 0;
        for (const dir of sheet) {
            if (!Array.isArray(dir)) continue;
            for (const frame of dir) {
                if (!Array.isArray(frame)) continue;
                if (frame.length > sheetCurH) sheetCurH = frame.length;
                for (const row of frame) sheetCurW = Math.max(sheetCurW, this._templateRowWidth(row));
            }
        }
        const dx = Math.max(0, w - sheetCurW);
        const dy = Math.max(0, h - sheetCurH);
        const padLeft   = Math.floor(dx / 2);
        const padRight  = dx - padLeft;
        const padTop    = Math.floor(dy / 2);
        const padBottom = dy - padTop;
        for (const dir of sheet) {
            if (!Array.isArray(dir)) continue;
            for (const frame of dir) {
                if (!Array.isArray(frame)) continue;
                for (let i = 0; i < frame.length; i++) {
                    if (Array.isArray(frame[i])) frame[i] = new Array(padLeft).fill(null).concat(this._padTemplateRow(frame[i], sheetCurW), new Array(padRight).fill(null));
                    else if (typeof frame[i] === 'string') frame[i] = ' '.repeat(padLeft) + frame[i].padEnd(sheetCurW, ' ') + ' '.repeat(padRight);
                }
                const indexed = frame.some(row => Array.isArray(row));
                const blankRow = () => indexed ? new Array(w).fill(null) : ' '.repeat(w);
                for (let i = 0; i < padTop; i++) frame.unshift(blankRow());
                for (let i = 0; i < padBottom; i++) frame.push(blankRow());
            }
        }
    }

    _openBulkImportChooser() {
        const tt = (text) => (typeof window !== 'undefined' && window.I18n) ? window.I18n.tText(text) : text;
        const category = (window.prompt(tt('Category for these parts (e.g. {examples}):').replace('{examples}', 'hair, clothing, accessory'), 'hair') || '').trim().toLowerCase();
        if (!category) { this._setTemplateStatus(tt('Bulk import cancelled.')); return; }
        const input = document.createElement('input');
        input.type = 'file';
        input.multiple = true;
        input.accept = 'image/png,image/webp,image/jpeg,image/jpg';
        input.style.cssText = 'position:fixed;left:-10000px;top:-10000px;width:1px;height:1px;opacity:0;';
        const cleanup = () => setTimeout(() => input.remove(), 0);
        input.addEventListener('change', async () => {
            const files = Array.from(input.files || []);
            if (!files.length) { this._setTemplateStatus(tt('No files selected.')); cleanup(); return; }
            await this._bulkImportFiles(files, category);
            cleanup();
        }, { once: true });
        document.body.appendChild(input);
        input.click();
    }

    async _bulkImportFiles(files, category) {
        const tt = (text) => (typeof window !== 'undefined' && window.I18n) ? window.I18n.tText(text) : text;
        const projectPath = this._requireProjectPath();
        if (!projectPath) return;
        const fs = require('fs');
        const path = require('path');
        const outDir = path.join(projectPath, 'forge', 'character_generator', 'styles', this.characterStyle, 'parts', category);
        try { fs.mkdirSync(outDir, { recursive: true }); }
        catch (e) { alert(tt('Could not create folder: {error}').replace('{error}', e.message)); return; }

        let ok = 0, fail = 0;
        const summary = [];
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            this._setTemplateStatus(tt('Bulk: {current}/{total} · {file}')
                .replace('{current}', i + 1).replace('{total}', files.length).replace('{file}', file.name));
            try {
                const result = await this._imageFileToAsciiTemplate(file);
                const baseName = file.name.replace(/\.(png|webp|jpe?g)$/i, '');
                const partId = this._slugifyForId(`${category}-${this.characterStyle}-${baseName}`);
                const niceName = baseName.replace(/[_-]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
                const js = this._formatPartDescriptorJs(partId, category, niceName, result);
                const fullPath = path.join(outDir, `${partId}.js`);
                fs.writeFileSync(fullPath, js, 'utf8');
                // Drop any prior registry entry with the same id so a re-import
                // overwrites cleanly instead of stacking up duplicates.
                for (let k = RR_CHARACTER_REGISTRY.length - 1; k >= 0; k--) {
                    if (RR_CHARACTER_REGISTRY[k].id === partId) RR_CHARACTER_REGISTRY.splice(k, 1);
                }
                this.activePartIds.delete(partId);
                this.activeLayerOrder = this.activeLayerOrder.filter(x => x !== partId);
                try { (new Function(js))(); } catch (regErr) { console.warn('Live-register failed for', partId, regErr); }
                summary.push({ name: file.name, partId, ok: true, paletteSize: result.paletteSize || Object.keys(result.palette || {}).length });
                ok++;
            } catch (e) {
                console.error('Bulk import failed for', file.name, e);
                summary.push({ name: file.name, error: e.message, ok: false });
                fail++;
            }
        }
        // Auto-align after import so users don't have to press Fix Alignment.
        if (ok > 0) this._normalizeAllTemplates();
        this._setTemplateStatus(tt('Bulk: {imported} imported, {failed} failed.')
            .replace('{imported}', ok).replace('{failed}', fail), fail > 0);
        this._render();
        console.log('[CharacterGenerator] Bulk import wrote files to:', outDir);
        for (const s of summary) console.log('  ', s.ok ? `OK  ${s.partId}` : `FAIL ${s.name}: ${s.error}`);
        const lines = summary.map(s => s.ok
            ? `✓ ${s.name} → ${s.partId}${s.paletteSize > 90 ? ` (${tt('{count} Unicode symbols').replace('{count}', s.paletteSize)})` : ''}`
            : `✗ ${s.name}: ${s.error}`);
        alert(tt('Bulk import complete: {succeeded} succeeded, {failed} failed\n\nFiles written to:\n{directory}\n\n{details}')
            .replace('{succeeded}', ok).replace('{failed}', fail).replace('{directory}', outDir).replace('{details}', lines.join('\n')));
    }

    _slugifyForId(s) {
        return String(s).toLowerCase()
            .replace(/[^a-z0-9_-]+/g, '-')
            .replace(/^-+|-+$/g, '')
            .replace(/-+/g, '-');
    }

    _formatPartDescriptorJs(partId, category, niceName, result) {
        const paletteJs = result.palette
            ? Object.entries(result.palette).map(([letter, entry]) => {
                const hex = typeof entry === 'string' ? entry : entry.hex;
                const material = (typeof entry === 'object' && entry.material) ? entry.material : '';
                return `        ${JSON.stringify(letter)}: { hex: ${JSON.stringify(hex)}, material: ${JSON.stringify(material)} }`;
            }).join(',\n')
            : '';
        const dirNames = ['Front', 'Left', 'Right', 'Back'];
        const sheetJs = (result.sheetRows || [[result.rows]]).map((dir, di) =>
            `        // ${dirNames[di] || `Direction ${di}`}\n        [\n` +
            dir.map((frame, fi) =>
                `            // Frame ${fi}\n            [\n` +
                frame.map(row => `                ${this._formatTemplateRowLiteral(row)}`).join(',\n') +
                `\n            ]`
            ).join(',\n') +
            `\n        ]`
        ).join(',\n');
        const preserveCellPosition = String(category).toLowerCase() === 'body';
        return `// Auto-generated by Bulk Import. Edit colours/materials via the editor.
RR_CHARACTER_REGISTRY.push({
    id: ${JSON.stringify(partId)},
    category: ${JSON.stringify(category)},
    name: ${JSON.stringify(niceName)},
    tags: [${JSON.stringify(this.characterStyle)}, ${JSON.stringify(this.gender)}],
    params: [],
    template: {
        preserveCellPosition: ${preserveCellPosition ? 'true' : 'false'},
        palette: {
${paletteJs}
        },
        sheet: [
${sheetJs}
        ]
    },
    draw(buf, W, H, direction, frame, params) {
        RR_CG_drawTemplatePart(buf, W, H, direction, frame, params, this);
    }
});
`;
    }

    _setTemplateStatus(message, isError = false) {
        const status = this.root?.querySelector?.('.rr-cgp-template-status');
        if (!status) return;
        status.textContent = message || '';
        status.style.color = isError ? 'var(--color-danger, #ff6b6b)' : 'var(--color-text-dim)';
    }

    _openTemplateImageChooser() {
        const tt = (text) => (typeof window !== 'undefined' && window.I18n) ? window.I18n.tText(text) : text;
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/png,image/webp,image/jpeg,image/jpg';
        input.style.cssText = 'position:fixed;left:-10000px;top:-10000px;width:1px;height:1px;opacity:0;';
        let settled = false;
        const cleanup = () => {
            setTimeout(() => input.remove(), 0);
            window.removeEventListener('focus', onFocus);
        };
        const onFocus = () => {
            setTimeout(() => {
                if (!settled && !input.files?.length) this._setTemplateStatus(tt('No image selected.'));
                cleanup();
            }, 600);
        };
        input.addEventListener('change', () => {
            settled = true;
            const file = input.files?.[0];
            if (!file) {
                this._setTemplateStatus(tt('No image selected.'));
                cleanup();
                return;
            }
            this._setTemplateStatus(tt('Analyzing {file}...').replace('{file}', file.name));
            this._analyzeTemplateImage(file).finally(cleanup);
        }, { once: true });
        window.addEventListener('focus', onFocus);
        document.body.appendChild(input);
        input.click();
    }

    async _analyzeTemplateImage(file) {
        const tt = (text) => (typeof window !== 'undefined' && window.I18n) ? window.I18n.tText(text) : text;
        try {
            const result = await this._imageFileToAsciiTemplate(file);
            this._setTemplateStatus(tt('Analyzed {size}.').replace('{size}', `${result.targetSize.w}x${result.targetSize.h}`));
            this._showAsciiTemplateModal(result);
        } catch (e) {
            console.error('Character template analysis failed:', e);
            this._setTemplateStatus(tt('Analysis failed.'), true);
            alert(tt('Template analysis failed: {error}').replace('{error}', e.message));
        }
    }

    _imageFileToAsciiTemplate(file) {
        const tt = (text) => (typeof window !== 'undefined' && window.I18n) ? window.I18n.tText(text) : text;
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            const img = new Image();
            img.onload = () => {
                try {
                    const source = document.createElement('canvas');
                    source.width = img.naturalWidth || img.width;
                    source.height = img.naturalHeight || img.height;
                    const sctx = source.getContext('2d', { willReadFrequently: true });
                    sctx.imageSmoothingEnabled = false;
                    sctx.drawImage(img, 0, 0);

                    const crop = this._guessFirstTemplateCell(source.width, source.height, file.name);

                    // Collect cell crops (full sheet or single cell) once so we
                    // can build a single shared palette of EVERY unique colour.
                    const cellCrops = [];
                    if (crop.sheetCols === 3 && crop.sheetRows === 4) {
                        for (let dir = 0; dir < 4; dir++) {
                            for (let frame = 0; frame < 3; frame++) {
                                const x0 = Math.round(crop.x + frame * crop.cellW);
                                const y0 = Math.round(crop.y + dir * crop.cellH);
                                const x1 = Math.round(crop.x + (frame + 1) * crop.cellW);
                                const y1 = Math.round(crop.y + (dir + 1) * crop.cellH);
                                cellCrops.push({
                                    x: x0, y: y0,
                                    w: Math.max(1, Math.min(source.width - x0, x1 - x0)),
                                    h: Math.max(1, Math.min(source.height - y0, y1 - y0)),
                                    direction: dir, frame
                                });
                            }
                        }
                    } else {
                        cellCrops.push({ ...crop, direction: 0, frame: 0 });
                    }

                    // Read each cell's pixel data once, share between palette
                    // extraction and per-cell letter assignment.
                    const cellData = cellCrops.map(c => this._readCellData(source, c));
                    const dynamicPalette = this._extractDynamicPalette(cellData);

                    const analyzeCell = (cell) => {
                        const { imageData, targetSize, bg, bgMask } = cell;
                        const rows = [];
                        let opaque = 0;
                        for (let y = 0; y < targetSize.h; y++) {
                            let row = '';
                            for (let x = 0; x < targetSize.w; x++) {
                                const i = (y * targetSize.w + x) * 4;
                                if (bgMask[y * targetSize.w + x]) {
                                    row += ' ';
                                } else {
                                    const r = imageData[i], g = imageData[i + 1], b = imageData[i + 2];
                                    row += this._nearestDynamicLetter(r, g, b, dynamicPalette);
                                    opaque++;
                                }
                            }
                            // Preserve full cell width — do NOT trim trailing
                            // spaces. Every row stays exactly targetSize.w
                            // characters so the renderer's templateW is
                            // identical across all 12 frames and the per-frame
                            // alignment doesn't drift.
                            rows.push(row);
                        }
                        return { rows: this._fillAsciiPinholesAnalyzer(rows), opaque, targetSize };
                    };

                    const first = analyzeCell(cellData[0]);
                    let sheetRows = null;
                    if (cellCrops.length === 12) {
                        sheetRows = [[], [], [], []];
                        for (let i = 0; i < cellData.length; i++) {
                            const c = cellCrops[i];
                            sheetRows[c.direction][c.frame] = analyzeCell(cellData[i]).rows;
                        }
                    }
                    const paletteObj = {};
                    for (const [letter, color] of Object.entries(dynamicPalette)) {
                        paletteObj[letter] = { hex: color.hex, material: '' };
                    }
                    resolve({
                        fileName: file.name,
                        imageWidth: source.width,
                        imageHeight: source.height,
                        crop,
                        targetSize: first.targetSize,
                        rows: first.rows,
                        opaque: first.opaque,
                        sheetRows,
                        palette: paletteObj,
                        paletteSize: Object.keys(paletteObj).length
                    });
                } catch (e) {
                    reject(e);
                }
            };
            img.onerror = () => {
                reject(new Error(tt('Could not load image.')));
            };
            reader.onload = () => { img.src = reader.result; };
            reader.onerror = () => reject(new Error(tt('Could not read selected file.')));
            reader.readAsDataURL(file);
        });
    }

    _guessFirstTemplateCell(width, height, fileName = '') {
        const baseName = String(fileName).replace(/\.[^.]+$/, '');
        const isExplicitSingleCharacter = baseName.startsWith('$') || baseName.startsWith('!$');
        const ratio = width / Math.max(1, height);

        // RPG Maker's normal character sheet is 8 characters laid out as 12x8
        // animation cells: 4 character columns x 2 character rows, with each
        // character being a 3x4 walk sheet. If we let the generic 3x4 detector
        // catch these first, each imported frame becomes four characters wide
        // and the generated part appears horizontally offset.
        if (!isExplicitSingleCharacter && width >= 48 && height >= 32 && width % 12 === 0 && height % 8 === 0 && ratio >= 1.15 && ratio <= 1.85) {
            const cellW = width / 12;
            const cellH = height / 8;
            const characterW = cellW * 3;
            const characterH = cellH * 4;
            if (cellW >= 8 && cellH >= 8 && characterW <= 256 && characterH <= 256) {
                return { x: 0, y: 0, w: characterW, h: characterH, mode: 'first character from 12x8 RPG Maker sheet', sheetCols: 3, sheetRows: 4, cellW, cellH };
            }
        }

        if (width >= 3 && height >= 4 && width % 3 === 0 && height % 4 === 0) {
            const cellW = width / 3;
            const cellH = height / 4;
            if (cellW >= 8 && cellH >= 8 && cellW <= 256 && cellH <= 256) {
                return { x: 0, y: 0, w: cellW, h: cellH, mode: 'first 3x4 sheet cell', sheetCols: 3, sheetRows: 4, cellW, cellH };
            }
        }
        if (width >= 24 && height >= 32 && ratio >= 0.45 && ratio <= 0.90) {
            const cellW = width / 3;
            const cellH = height / 4;
            return {
                x: 0,
                y: 0,
                w: Math.max(8, Math.round(cellW)),
                h: Math.max(8, Math.round(cellH)),
                mode: 'first approximate 3x4 sheet cell',
                sheetCols: 3,
                sheetRows: 4,
                cellW,
                cellH
            };
        }
        return { x: 0, y: 0, w: width, h: height, mode: 'full image' };
    }

    _chooseTemplateAnalysisSize(sourceW, sourceH) {
        if (sourceW <= this.frameWidth && sourceH <= this.frameHeight) {
            return { w: Math.max(1, Math.round(sourceW)), h: Math.max(1, Math.round(sourceH)), mode: 'native cell size' };
        }
        const scale = Math.min(this.frameWidth / sourceW, this.frameHeight / sourceH);
        return {
            w: Math.max(1, Math.round(sourceW * scale)),
            h: Math.max(1, Math.round(sourceH * scale)),
            mode: `fit to ${this.frameWidth}x${this.frameHeight} frame`
        };
    }

    _estimateTemplateBackground(data, w, h) {
        const samples = [];
        const add = (x, y) => {
            const i = (y * w + x) * 4;
            samples.push({ r: data[i], g: data[i + 1], b: data[i + 2], a: data[i + 3] });
        };
        for (let x = 0; x < w; x++) { add(x, 0); add(x, h - 1); }
        for (let y = 1; y < h - 1; y++) { add(0, y); add(w - 1, y); }
        const transparentCount = samples.filter(p => p.a < 32).length;
        // Majority-transparent edges = transparent background. No color match needed.
        if (transparentCount > samples.length * 0.5) return { transparent: true };
        const opaque = samples.filter(p => p.a > 200);
        if (!opaque.length) return { transparent: true };
        const avg = opaque.reduce((acc, p) => {
            acc.r += p.r; acc.g += p.g; acc.b += p.b; acc.a += p.a;
            return acc;
        }, { r: 0, g: 0, b: 0, a: 0 });
        return {
            r: avg.r / opaque.length,
            g: avg.g / opaque.length,
            b: avg.b / opaque.length,
            a: avg.a / opaque.length,
            transparent: false
        };
    }

    _isTemplateBackground(r, g, b, a, bg) {
        // Only fully (or near-fully) transparent pixels are background. Anti-
        // aliased sprite edges sit at mid-alpha — keep them as foreground so
        // the analyzer doesn't pepper the imported sheet with pinholes.
        if (a < 6) return true;
        if (!bg) return false;
        if (bg.transparent) return a < 16;
        // Solid-color background. Require tight colour match AND mostly-opaque
        // alpha; anything semi-transparent or off-colour belongs to the sprite.
        if (a < 200) return false;
        const dr = r - bg.r, dg = g - bg.g, db = b - bg.b;
        return dr * dr + dg * dg + db * db < 16;
    }

    _buildTemplateBackgroundMask(data, w, h, bg) {
        // Any pixel with very low alpha is transparent regardless of where it
        // is — including interior pockets like the hole in an apron — so mark
        // them in a single pass. For solid-bg sprites, flood-fill is still used
        // to catch colour-matching edge bg pixels without eating interior
        // pixels that happen to share the bg colour.
        const mask = new Uint8Array(w * h);
        for (let idx = 0; idx < w * h; idx++) {
            const i = idx * 4;
            const a = data[i + 3];
            if (a < 16) mask[idx] = 1;
        }
        if (bg && !bg.transparent) {
            const queue = [];
            const enqueue = (x, y) => {
                if (x < 0 || y < 0 || x >= w || y >= h) return;
                const idx = y * w + x;
                if (mask[idx]) return;
                const i = idx * 4;
                if (!this._isTemplateBackground(data[i], data[i + 1], data[i + 2], data[i + 3], bg)) return;
                mask[idx] = 1;
                queue.push(idx);
            };
            for (let x = 0; x < w; x++) { enqueue(x, 0); enqueue(x, h - 1); }
            for (let y = 1; y < h - 1; y++) { enqueue(0, y); enqueue(w - 1, y); }
            for (let qi = 0; qi < queue.length; qi++) {
                const idx = queue[qi];
                const x = idx % w;
                const y = (idx / w) | 0;
                enqueue(x - 1, y); enqueue(x + 1, y);
                enqueue(x, y - 1); enqueue(x, y + 1);
            }
        }
        return mask;
    }

    _readCellData(source, crop) {
        const targetSize = this._chooseTemplateAnalysisSize(crop.w, crop.h);
        const target = document.createElement('canvas');
        target.width = targetSize.w;
        target.height = targetSize.h;
        const tctx = target.getContext('2d', { willReadFrequently: true });
        tctx.imageSmoothingEnabled = false;
        tctx.clearRect(0, 0, targetSize.w, targetSize.h);
        tctx.drawImage(source, crop.x, crop.y, crop.w, crop.h, 0, 0, targetSize.w, targetSize.h);
        const imageData = tctx.getImageData(0, 0, targetSize.w, targetSize.h).data;
        const bg = this._estimateTemplateBackground(imageData, targetSize.w, targetSize.h);
        const bgMask = this._buildTemplateBackgroundMask(imageData, targetSize.w, targetSize.h, bg);
        return { imageData, targetSize, bg, bgMask };
    }

    _extractDynamicPalette(cellData) {
        // Bucket every opaque foreground pixel by exact RGB, count frequencies.
        const counts = new Map();
        for (const cell of cellData) {
            const { imageData, targetSize, bgMask } = cell;
            for (let y = 0; y < targetSize.h; y++) {
                for (let x = 0; x < targetSize.w; x++) {
                    if (bgMask[y * targetSize.w + x]) continue;
                    const i = (y * targetSize.w + x) * 4;
                    const key = (imageData[i] << 16) | (imageData[i + 1] << 8) | imageData[i + 2];
                    counts.set(key, (counts.get(key) || 0) + 1);
                }
            }
        }
        // Sort distinct colours by frequency, then cluster anything within a
        // tight RGB distance into the more popular entry it sits near.
        const raw = [];
        for (const [key, count] of counts) {
            raw.push({
                r: (key >> 16) & 255,
                g: (key >> 8) & 255,
                b: key & 255,
                count
            });
        }
        raw.sort((a, b) => b.count - a.count);
        const clusters = [];
        // Only fold essentially-identical colours (within ~2 RGB units) so the
        // analyzer preserves every visually-distinct shade in the source PNG.
        const mergeDistSq = 4;
        for (const c of raw) {
            let merged = false;
            for (const k of clusters) {
                const dr = k.r - c.r, dg = k.g - c.g, db = k.b - c.b;
                if (dr * dr + dg * dg + db * db <= mergeDistSq) {
                    const tot = k.count + c.count;
                    k.r = Math.round((k.r * k.count + c.r * c.count) / tot);
                    k.g = Math.round((k.g * k.count + c.g * c.count) / tot);
                    k.b = Math.round((k.b * k.count + c.b * c.count) / tot);
                    k.count = tot;
                    merged = true;
                    break;
                }
            }
            if (!merged) clusters.push({ ...c });
        }
        clusters.sort((a, b) => {
            const aBlack = a.r + a.g + a.b <= 12;
            const bBlack = b.r + b.g + b.b <= 12;
            if (aBlack !== bBlack) return aBlack ? -1 : 1;
            return b.count - a.count;
        });
        // Symbol pool order matters: ASCII first for readable/common colours,
        // then BMP Unicode ranges so one string character still equals one pixel.
        const LETTERS = this._dynamicPaletteSymbols();
        const overflow = clusters.length > LETTERS.length;
        const palette = {};
        const limit = Math.min(clusters.length, LETTERS.length);
        for (let i = 0; i < limit; i++) {
            const c = clusters[i];
            const hex = '#' + ((1 << 24) | (c.r << 16) | (c.g << 8) | c.b).toString(16).slice(1);
            palette[LETTERS[i]] = { r: c.r, g: c.g, b: c.b, hex, count: c.count };
        }
        if (overflow) Object.defineProperty(palette, '_droppedColorCount', { value: clusters.length - limit, enumerable: false });
        return palette;
    }

    _dynamicPaletteSymbols() {
        const symbols = [];
        const seen = new Set([' ', '.']);
        const add = ch => {
            if (!ch || seen.has(ch)) return;
            seen.add(ch);
            symbols.push(ch);
        };
        for (const ch of 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!#$%&*+=?@^~<>/|:;_{}[]()-') add(ch);
        const addRange = (start, end, skip = new Set()) => {
            for (let cp = start; cp <= end; cp++) {
                if (skip.has(cp)) continue;
                add(String.fromCharCode(cp));
            }
        };
        addRange(0x00A1, 0x00FF, new Set([0x00A0, 0x00AD]));       // Latin-1 printable, no NBSP/soft hyphen.
        addRange(0x0100, 0x017F);                                   // Latin Extended-A.
        addRange(0x0370, 0x03FF, new Set([0x0378, 0x0379, 0x0380, 0x0381, 0x0382, 0x0383, 0x038B, 0x038D, 0x03A2]));
        addRange(0x0400, 0x04FF);                                   // Cyrillic.
        addRange(0x2500, 0x257F);                                   // Box drawing.
        addRange(0x2580, 0x259F);                                   // Block elements.
        addRange(0x4E00, 0x9FFF);                                   // CJK fallback for very high-colour sheets.
        return symbols.join('');
    }

    _fillAsciiPinholesAnalyzer(rows) {
        // Close single-cell transparent gaps surrounded on all four cardinal
        // sides by sprite pixels. Used during import so the saved template
        // doesn't carry quantization pinholes inside the silhouette.
        if (!Array.isArray(rows) || !rows.length) return rows;
        const H = rows.length;
        const indexed = rows.some(row => Array.isArray(row));
        const W = Math.max(...rows.map(r => this._templateRowWidth(r)), 1);
        const grid = rows.map(row => Array.isArray(row)
            ? this._padTemplateRow(row, W)
            : String(row || '').padEnd(W, ' ').split(''));
        const blank = (x, y) => y < 0 || y >= H || x < 0 || x >= W || this._templateCellBlank(grid[y][x]);
        const solid = (x, y) => !blank(x, y);
        const dominantAround = (x, y) => {
            const counts = new Map();
            for (let yy = y - 1; yy <= y + 1; yy++) {
                for (let xx = x - 1; xx <= x + 1; xx++) {
                    if (blank(xx, yy)) continue;
                    const ch = grid[yy][xx];
                    counts.set(ch, (counts.get(ch) || 0) + 1);
                }
            }
            let best = grid[y][x], bestCount = -1;
            for (const [ch, count] of counts) {
                if (count > bestCount) { best = ch; bestCount = count; }
            }
            return best;
        };
        // Two passes: first closes isolated 1-cell pinholes, second handles
        // pinholes that became fillable once their neighbours were closed.
        for (let pass = 0; pass < 2; pass++) {
            for (let y = 1; y < H - 1; y++) {
                for (let x = 1; x < W - 1; x++) {
                    if (solid(x, y)) continue;
                    if (!(solid(x - 1, y) && solid(x + 1, y) && solid(x, y - 1) && solid(x, y + 1))) continue;
                    grid[y][x] = dominantAround(x, y);
                }
            }
        }
        // Preserve full row width (no trim) so every frame in a sheet has the
        // same length and the renderer's per-frame centering doesn't drift.
        return indexed ? grid : grid.map(row => row.join(''));
    }

    _nearestDynamicLetter(r, g, b, palette) {
        let best = 'A';
        let bestD = Infinity;
        for (const [letter, c] of Object.entries(palette)) {
            const dr = r - c.r, dg = g - c.g, db = b - c.b;
            const d = dr * dr + dg * dg + db * db;
            if (d < bestD) { bestD = d; best = letter; }
        }
        return best;
    }

    _asciiAnalysisPalette() {
        return [
            // Uppercase A-Z: primary material slots.
            { ch: 'N', r: 12,  g: 8,   b: 6,   name: 'near-black outline' },
            { ch: 'Z', r: 18,  g: 12,  b: 10,  name: 'character outline / border' },
            { ch: 'K', r: 46,  g: 29,  b: 19,  name: 'eye deep / upper detail' },
            { ch: 'M', r: 116, g: 82,  b: 57,  name: 'eyebrow / hair' },
            { ch: 'O', r: 35,  g: 22,  b: 14,  name: 'skin outline' },
            { ch: 'D', r: 92,  g: 47,  b: 27,  name: 'skin outline warm' },
            { ch: 'A', r: 64,  g: 35,  b: 20,  name: 'skin deep' },
            { ch: 'S', r: 179, g: 105, b: 56,  name: 'skin deep warm' },
            { ch: 'T', r: 210, g: 132, b: 76,  name: 'skin shadow' },
            { ch: 'X', r: 176, g: 128, b: 92,  name: 'hair base / skin warm shadow' },
            { ch: 'B', r: 232, g: 157, b: 95,  name: 'skin base' },
            { ch: 'L', r: 255, g: 202, b: 148, name: 'skin light base' },
            { ch: 'H', r: 255, g: 222, b: 184, name: 'skin highlight' },
            { ch: 'C', r: 239, g: 218, b: 184, name: 'skin pale highlight' },
            { ch: 'P', r: 168, g: 139, b: 104, name: 'underwear deep' },
            { ch: 'Q', r: 211, g: 186, b: 145, name: 'underwear shadow' },
            { ch: 'E', r: 241, g: 226, b: 196, name: 'underwear base' },
            { ch: 'F', r: 255, g: 241, b: 218, name: 'underwear highlight' },
            { ch: 'V', r: 12,  g: 28,  b: 43,  name: 'eye outline / pupil' },
            { ch: 'J', r: 35,  g: 67,  b: 94,  name: 'iris shadow' },
            { ch: 'I', r: 74,  g: 121, b: 156, name: 'iris base' },
            { ch: 'U', r: 138, g: 190, b: 222, name: 'iris highlight' },
            { ch: 'Y', r: 235, g: 226, b: 204, name: 'eye white shadow' },
            { ch: 'W', r: 255, g: 244, b: 232, name: 'eye white highlight' },
            { ch: 'R', r: 204, g: 95,  b: 89,  name: 'mouth / blush' },
            { ch: 'G', r: 7,   g: 10,  b: 21,  name: 'transparent shadow' },
            // Lowercase a-z: extended shade slots for finer discrimination.
            { ch: 'n', r: 24,  g: 18,  b: 14,  name: 'extra dark outline' },
            { ch: 'k', r: 60,  g: 40,  b: 28,  name: 'mid eyebrow / hair shadow' },
            { ch: 'm', r: 142, g: 102, b: 74,  name: 'mid hair tone' },
            { ch: 'x', r: 200, g: 152, b: 108, name: 'hair highlight' },
            { ch: 'o', r: 50,  g: 30,  b: 22,  name: 'eye lash / dark eyelid' },
            { ch: 'd', r: 110, g: 60,  b: 36,  name: 'skin shadow warm mid' },
            { ch: 'a', r: 84,  g: 48,  b: 28,  name: 'skin deep mid' },
            { ch: 's', r: 158, g: 96,  b: 56,  name: 'skin shadow warm' },
            { ch: 't', r: 224, g: 152, b: 96,  name: 'skin shadow light' },
            { ch: 'b', r: 244, g: 180, b: 130, name: 'skin base bright' },
            { ch: 'l', r: 250, g: 215, b: 170, name: 'skin lit base' },
            { ch: 'h', r: 255, g: 232, b: 200, name: 'skin top highlight' },
            { ch: 'c', r: 248, g: 226, b: 196, name: 'skin pale rim' },
            { ch: 'p', r: 152, g: 118, b: 88,  name: 'cloth deep mid' },
            { ch: 'q', r: 192, g: 162, b: 124, name: 'cloth shadow mid' },
            { ch: 'e', r: 230, g: 210, b: 176, name: 'cloth base mid' },
            { ch: 'f', r: 248, g: 232, b: 208, name: 'cloth highlight mid' },
            { ch: 'v', r: 24,  g: 40,  b: 56,  name: 'iris deep / pupil rim' },
            { ch: 'j', r: 52,  g: 88,  b: 118, name: 'iris mid shadow' },
            { ch: 'i', r: 96,  g: 144, b: 180, name: 'iris mid' },
            { ch: 'u', r: 168, g: 208, b: 232, name: 'iris highlight bright' },
            { ch: 'y', r: 244, g: 232, b: 212, name: 'eye white mid' },
            { ch: 'w', r: 250, g: 248, b: 240, name: 'eye white bright' },
            { ch: 'r', r: 170, g: 70,  b: 70,  name: 'mouth deep / lip' },
            { ch: 'g', r: 36,  g: 32,  b: 40,  name: 'cast shadow on ground' }
        ];
    }

    _nearestAsciiColor(r, g, b, palette) {
        let best = palette[0];
        let bestD = Infinity;
        for (const p of palette) {
            const dr = r - p.r, dg = g - p.g, db = b - p.b;
            const d = dr * dr + dg * dg + db * db;
            if (d < bestD) { bestD = d; best = p; }
        }
        return best.ch;
    }

    _semanticizeAsciiTemplateRows(rows, context = {}) {
        if (!Array.isArray(rows) || !rows.length) return rows;
        const out = rows.map(row => row.split(''));
        const h = out.length;
        const w = Math.max(...out.map(r => r.length), 1);
        for (let y = 0; y < h; y++) while (out[y].length < w) out[y].push(' ');
        const isBlank = ch => ch === ' ' || ch === '.' || ch === undefined;
        const at = (x, y) => (y < 0 || y >= h || x < 0 || x >= w) ? ' ' : out[y][x];

        // 1. Flood-fill from the canvas border to mark every pixel that is
        // genuinely "outside" the character silhouette. Anything not reached is
        // either solid or an interior pocket (eyes between hair, mouth between
        // lips, etc) and must not be treated as outside background.
        const outside = new Uint8Array(w * h);
        const queue = [];
        const visit = (x, y) => {
            if (x < 0 || y < 0 || x >= w || y >= h) return;
            const idx = y * w + x;
            if (outside[idx]) return;
            if (!isBlank(at(x, y))) return;
            outside[idx] = 1;
            queue.push(idx);
        };
        for (let x = 0; x < w; x++) { visit(x, 0); visit(x, h - 1); }
        for (let y = 0; y < h; y++) { visit(0, y); visit(w - 1, y); }
        while (queue.length) {
            const idx = queue.pop();
            const x = idx % w;
            const y = (idx / w) | 0;
            visit(x - 1, y); visit(x + 1, y);
            visit(x, y - 1); visit(x, y + 1);
        }
        const isOutside = (x, y) => x < 0 || y < 0 || x >= w || y >= h || outside[y * w + x] === 1;
        const touchesOutside = (x, y) =>
            isOutside(x - 1, y) || isOutside(x + 1, y) ||
            isOutside(x, y - 1) || isOutside(x, y + 1);

        // 2. Find eye-white clusters in the upper portion of the sprite. These
        // anchor where eyebrows logically sit (the rows directly above) and
        // where the iris/eye material legitimately lives.
        const headLimit = context.direction === 3 ? Math.floor(h * 0.30) : Math.floor(h * 0.45);
        const eyeBoxes = [];
        const visitedEye = new Uint8Array(w * h);
        const eyeChars = new Set(['Y', 'W']);
        const grow = (sx, sy) => {
            const box = { x0: sx, x1: sx, y0: sy, y1: sy, cells: [] };
            const stack = [[sx, sy]];
            while (stack.length) {
                const [x, y] = stack.pop();
                if (x < 0 || y < 0 || x >= w || y >= h) continue;
                const i = y * w + x;
                if (visitedEye[i]) continue;
                if (!eyeChars.has(at(x, y))) continue;
                visitedEye[i] = 1;
                box.cells.push([x, y]);
                if (x < box.x0) box.x0 = x;
                if (x > box.x1) box.x1 = x;
                if (y < box.y0) box.y0 = y;
                if (y > box.y1) box.y1 = y;
                stack.push([x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]);
            }
            return box;
        };
        for (let y = 0; y < Math.min(headLimit, h); y++) {
            for (let x = 0; x < w; x++) {
                if (visitedEye[y * w + x] || !eyeChars.has(at(x, y))) continue;
                const box = grow(x, y);
                if (box.cells.length >= 2) eyeBoxes.push(box);
            }
        }

        // 3. Lower-body cleanup. Anything below the head limit that still
        // carries iris letters is almost certainly underwear/cloth picked up by
        // the colour quantiser.
        for (let y = headLimit; y < h; y++) {
            for (let x = 0; x < w; x++) {
                const ch = out[y][x];
                if (ch === 'I') out[y][x] = 'E';
                else if (ch === 'J') out[y][x] = 'Q';
                else if (ch === 'U') out[y][x] = 'F';
                else if (ch === 'V') out[y][x] = 'P';
            }
        }

        // 4. Eyebrow pass: for each eye cluster, dark non-silhouette pixels
        // sitting 1-3 rows above and within the eye's column range become
        // eyebrow material. Silhouette pixels are skipped because they belong
        // to the outline. The eye cluster itself (Y/W/I/J/K) is never touched.
        const browChars = new Set(['T', 'D', 'A', 'N']);
        const reserved = new Set(['Y', 'W', 'I', 'J', 'K', 'U', 'V', 'R', 'M', 'Z']);
        for (const box of eyeBoxes) {
            const yTop = Math.max(0, box.y0 - 3);
            const yBot = box.y0 - 1;
            const xLo = Math.max(0, box.x0 - 1);
            const xHi = Math.min(w - 1, box.x1 + 1);
            for (let y = yTop; y <= yBot; y++) {
                for (let x = xLo; x <= xHi; x++) {
                    const ch = out[y][x];
                    if (!browChars.has(ch)) continue;
                    if (touchesOutside(x, y)) continue;
                    out[y][x] = 'M';
                }
            }
        }

        // 5. Outline pass: any dark pixel on the silhouette boundary becomes Z
        // outline material. This separates body outline from eyebrows because
        // brows live in the interior (step 4), while outline lives at the edge.
        const darkOnEdge = new Set(['T', 'D', 'A', 'N', 'O']);
        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                const ch = out[y][x];
                if (!darkOnEdge.has(ch)) continue;
                if (!touchesOutside(x, y)) continue;
                if (reserved.has(ch)) continue;
                out[y][x] = 'Z';
            }
        }

        return out.map(row => row.join(''));
    }

    _formatAsciiRows(rows, indent) {
        const outputW = Math.max(...rows.map(row => this._templateRowWidth(row)), 1);
        return rows.map(row => `${indent}${this._formatTemplateRowLiteral(row, outputW)},`).join('\n');
    }

    _formatAsciiSheetTemplate(sheetRows, styleId = this.characterStyle, variant = this.gender, palette = null) {
        const names = ['Front', 'Left', 'Right', 'Back'];
        const styleKey = JSON.stringify(styleId || 'psychronic');
        const variantKey = JSON.stringify(variant || 'male');
        const lines = [
            'window.RR_CG_BODY_TEMPLATE_SHEETS = window.RR_CG_BODY_TEMPLATE_SHEETS || {};',
            `window.RR_CG_BODY_TEMPLATE_SHEETS[${styleKey}] = window.RR_CG_BODY_TEMPLATE_SHEETS[${styleKey}] || {};`,
            `window.RR_CG_BODY_TEMPLATE_SHEETS[${styleKey}][${variantKey}] = {`
        ];
        if (palette) {
            lines.push('    palette: {');
            const entries = Object.entries(palette);
            for (let i = 0; i < entries.length; i++) {
                const [letter, entry] = entries[i];
                const hex = typeof entry === 'string' ? entry : entry.hex;
                const material = (typeof entry === 'object' && entry.material) ? entry.material : '';
                const isLast = i === entries.length - 1;
                lines.push(`        ${JSON.stringify(letter)}: { hex: ${JSON.stringify(hex)}, material: ${JSON.stringify(material)} }${isLast ? '' : ','}`);
            }
            lines.push('    },');
        }
        lines.push('    sheet: [');
        for (let dir = 0; dir < sheetRows.length; dir++) {
            lines.push(`        // ${names[dir] || `Direction ${dir}`} frames: left step, idle, right step`);
            lines.push('        [');
            for (let frame = 0; frame < sheetRows[dir].length; frame++) {
                lines.push(`            // Frame ${frame}`);
                lines.push('            [');
                lines.push(this._formatAsciiRows(sheetRows[dir][frame], '                '));
                lines.push(frame === sheetRows[dir].length - 1 ? '            ]' : '            ],');
            }
            lines.push(dir === sheetRows.length - 1 ? '        ]' : '        ],');
        }
        lines.push('    ]');
        lines.push('};');
        return lines.join('\n');
    }

    _buildModalMaterials(result) {
        // If the analyzer produced a dynamic palette, that wins. Each letter is
        // its own material slot with an editable hex and material tag.
        if (result.palette && Object.keys(result.palette).length) {
            const items = [{
                ch: ' ',
                name: 'erase / transparent',
                color: 'transparent',
                material: ''
            }];
            for (const [letter, entry] of Object.entries(result.palette)) {
                const hex = typeof entry === 'string' ? entry : entry.hex;
                const material = typeof entry === 'object' && entry ? (entry.material || '') : '';
                items.push({
                    ch: letter,
                    name: material ? `${letter} (${material})` : `${letter}`,
                    color: hex,
                    material
                });
            }
            return items;
        }
        return this._asciiMaterialLegend();
    }

    _materialTagOptions() {
        return ['', 'skin', 'eye', 'eyebrow', 'hair', 'cloth', 'outline', 'shadow', 'lip', 'highlight'];
    }

    _asciiMaterialLegend() {
        const runtime = this._runtimeMaterialColors();
        return [
            { ch: ' ', name: 'Transparent', color: 'rgba(0,0,0,0)' },
            ...this._asciiAnalysisPalette().map(p => {
                const rt = runtime[p.ch];
                const r = rt ? rt.r : p.r;
                const g = rt ? rt.g : p.g;
                const b = rt ? rt.b : p.b;
                return {
                    ch: p.ch,
                    name: p.name,
                    color: `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`
                };
            })
        ];
    }

    _runtimeMaterialColors() {
        // Mirror the runtime body renderer so the editor's swatches match what
        // the player will actually see. We pull the current body params from
        // the selected gender so changes to skin/eye/hair flow through here.
        try {
            const partId = this._findBodyId();
            const params = (partId && this.partParams[partId]) || {};
            const skin = buildSkinPalette(params.skinColor || '#e8b48a');
            const eye = buildPalette(params.eyeColor || '#5aa7e8');
            const cloth = buildPalette(params.underwearColor || '#f1e2c4');
            const brow = buildHairPalette(params.eyebrowColor || params.hairColor || '#4a2f22');
            const hair = buildHairPalette(params.hairColor || params.eyebrowColor || '#4a2f22');
            const female = this.gender === 'female';
            const map = RR_CG_buildAsciiMaterialColors(skin, eye, cloth, brow, hair, female);
            // M is positional at runtime; show it as brow.base since that's the
            // tagged-as-eyebrow color and the most distinctive use of M.
            map.M = brow.base;
            map.m = brow.base;
            return map;
        } catch (e) {
            return {};
        }
    }

    _showAsciiTemplateModal(result) {
        const tt = (text) => (typeof window !== 'undefined' && window.I18n) ? window.I18n.tText(text) : text;
        const modal = document.createElement('div');
        modal.style.cssText = 'position:fixed;inset:0;z-index:11000;background:rgba(0,0,0,0.72);display:flex;align-items:center;justify-content:center;padding:24px;';

        const panel = document.createElement('div');
        panel.style.cssText = 'width:min(1120px,96vw);max-height:88vh;background:var(--color-bg-panel);border:1px solid var(--color-border);border-radius:6px;display:flex;flex-direction:column;box-shadow:0 12px 36px rgba(0,0,0,0.55);';
        modal.appendChild(panel);

        const header = document.createElement('div');
        header.style.cssText = 'padding:10px 14px;border-bottom:1px solid var(--color-border-subtle);background:var(--color-bg-toolbar);color:var(--color-text-strong);font-size:13px;font-weight:700;display:flex;align-items:center;gap:10px;';
        header.textContent = tt('ASCII Template Analysis');
        panel.appendChild(header);

        const body = document.createElement('div');
        body.style.cssText = 'padding:12px 14px;display:flex;flex-direction:column;gap:10px;min-height:0;';
        panel.appendChild(body);

        const meta = document.createElement('div');
        meta.style.cssText = 'font-size:11px;color:var(--color-text-muted);line-height:1.45;';
        const translateMode = (mode) => {
            const fit = /^fit to (.+) frame$/.exec(mode || '');
            return fit ? tt('fit to {size} frame').replace('{size}', fit[1]) : tt(mode);
        };
        meta.textContent = tt('{file} · {imageSize} · crop {cropSize} ({cropMode}) · output {outputSize} ({outputMode}) · {pixels} sampled pixels')
            .replace('{file}', result.fileName)
            .replace('{imageSize}', `${result.imageWidth}x${result.imageHeight}`)
            .replace('{cropSize}', `${result.crop.w}x${result.crop.h}`)
            .replace('{cropMode}', translateMode(result.crop.mode))
            .replace('{outputSize}', `${result.targetSize.w}x${result.targetSize.h}`)
            .replace('{outputMode}', translateMode(result.targetSize.mode))
            .replace('{pixels}', result.opaque);
        body.appendChild(meta);

        const help = document.createElement('div');
        help.style.cssText = 'font-size:11px;color:var(--color-text-dim);line-height:1.45;';
        help.textContent = result.sheetRows
            ? tt('Full 3x4 sheet detected. Paste this into a style body file such as {path}. The renderer uses A-Z material letters; hand-clean any pixels where color-only quantizing picked the wrong material.')
                .replace('{path}', `src/forge/CharacterGenerator/styles/${this.characterStyle}/parts/body/${this.characterStyle}_${this.gender}.js`)
            : tt('Single sprite detected. Paste these rows into a registered body sheet frame, then hand-clean any pixels where color-only quantizing picked the wrong material.');
        body.appendChild(help);

        const editor = document.createElement('div');
        editor.style.cssText = 'display:grid;grid-template-columns:minmax(260px,1fr) 300px;gap:10px;min-height:260px;';
        body.appendChild(editor);

        const gridPanel = document.createElement('div');
        gridPanel.style.cssText = 'min-width:0;display:flex;flex-direction:column;gap:6px;';
        editor.appendChild(gridPanel);

        const gridToolbar = document.createElement('div');
        gridToolbar.style.cssText = 'display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:11px;color:var(--color-text-muted);';
        gridPanel.appendChild(gridToolbar);

        const dirNames = ['Front', 'Left', 'Right', 'Back'];
        const dirSelect = document.createElement('select');
        dirSelect.className = 'rr-input';
        dirSelect.style.cssText = 'padding:3px 8px;font-size:11px;';
        dirSelect.innerHTML = dirNames.map((name, i) => `<option value="${i}">${tt(name)}</option>`).join('');
        const frameSelect = document.createElement('select');
        frameSelect.className = 'rr-input';
        frameSelect.style.cssText = 'padding:3px 8px;font-size:11px;';
        frameSelect.innerHTML = [0, 1, 2].map(i => `<option value="${i}">${tt('Frame {number}').replace('{number}', i)}</option>`).join('');
        if (result.sheetRows) {
            gridToolbar.appendChild(document.createTextNode(tt('Cell:')));
            gridToolbar.appendChild(dirSelect);
            gridToolbar.appendChild(frameSelect);
        }

        const activeLabel = document.createElement('div');
        activeLabel.style.cssText = 'margin-left:auto;font-size:11px;color:var(--color-accent-bright);font-weight:700;';
        gridToolbar.appendChild(activeLabel);

        const gridScroll = document.createElement('div');
        gridScroll.style.cssText = 'flex:1;min-height:220px;max-height:360px;overflow:auto;background:var(--color-bg-deep);border:1px solid var(--color-border-input);border-radius:4px;padding:8px;';
        gridPanel.appendChild(gridScroll);

        const canvas = document.createElement('canvas');
        canvas.style.cssText = 'display:block;image-rendering:pixelated;cursor:crosshair;';
        gridScroll.appendChild(canvas);

        const palettePanel = document.createElement('div');
        palettePanel.style.cssText = 'display:flex;flex-direction:column;gap:6px;min-width:0;';
        editor.appendChild(palettePanel);

        const paletteTitle = document.createElement('div');
        paletteTitle.style.cssText = 'font-size:10px;font-weight:700;color:var(--color-accent-bright);text-transform:uppercase;letter-spacing:0.4px;';
        paletteTitle.textContent = tt('Paint Material');
        palettePanel.appendChild(paletteTitle);

        const paletteHint = document.createElement('div');
        paletteHint.style.cssText = 'font-size:10px;color:var(--color-text-dim);line-height:1.35;';
        paletteHint.textContent = tt('Click a material, then click or drag pixels in the grid. The ASCII output updates live.');
        palettePanel.appendChild(paletteHint);

        const paletteGrid = document.createElement('div');
        paletteGrid.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:4px;overflow:auto;max-height:320px;padding-right:2px;';
        palettePanel.appendChild(paletteGrid);

        const addColorBtn = document.createElement('button');
        addColorBtn.type = 'button';
        addColorBtn.className = 'rr-btn-chip';
        addColorBtn.textContent = '+ ' + tt('Add Color Slot');
        addColorBtn.style.cssText = 'padding:5px 10px;font-size:11px;color:var(--color-accent-bright);align-self:flex-start;';
        palettePanel.appendChild(addColorBtn);

        const mutableRows = result.sheetRows
            ? result.sheetRows.map(dir => dir.map(frame => frame.slice()))
            : result.rows.slice();
        const materials = this._buildModalMaterials(result);
        const materialColors = new Map(materials.map(m => [m.ch, m.color]));
        let selectedMaterial = materials[0];
        let currentDir = 0;
        let currentFrame = result.sheetRows ? 1 : 0;
        frameSelect.value = String(currentFrame);
        let painting = false;

        const text = document.createElement('textarea');
        text.readOnly = true;
        text.spellcheck = false;
        text.style.cssText = 'width:100%;height:220px;resize:vertical;font:12px/1.2 monospace;background:var(--color-bg-input);color:var(--color-text);border:1px solid var(--color-border-input);border-radius:4px;padding:10px;white-space:pre;overflow:auto;box-sizing:border-box;';
        body.appendChild(text);

        const currentRows = () => result.sheetRows ? mutableRows[currentDir][currentFrame] : mutableRows;
        const updateText = () => {
            text.value = result.sheetRows
                ? this._formatAsciiSheetTemplate(mutableRows, this.characterStyle, this.gender, result.palette)
                : this._formatAsciiRows(mutableRows, '        ');
        };
        const setPixel = (x, y) => {
            const rows = currentRows();
            if (y < 0 || y >= rows.length) return false;
            const width = Math.max(...rows.map(row => row.length), 1);
            if (x < 0 || x >= width) return false;
            const row = rows[y].padEnd(width, ' ').split('');
            if (row[x] === selectedMaterial.ch) return false;
            row[x] = selectedMaterial.ch;
            // Keep the row at its full width so every cell in the sheet stays
            // aligned in the rendered preview.
            rows[y] = row.join('');
            updateText();
            drawGrid();
            return true;
        };
        const drawGrid = () => {
            const rows = currentRows();
            const width = Math.max(...rows.map(row => row.length), 1);
            const height = Math.max(rows.length, 1);
            const zoom = Math.max(5, Math.min(14, Math.floor(560 / Math.max(width, height))));
            canvas.width = width * zoom;
            canvas.height = height * zoom;
            canvas.dataset.zoom = String(zoom);
            const ctx = canvas.getContext('2d');
            ctx.imageSmoothingEnabled = false;
            ctx.fillStyle = '#11131c';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            for (let y = 0; y < height; y++) {
                const row = rows[y] || '';
                for (let x = 0; x < width; x++) {
                    const ch = row[x] || ' ';
                    if (ch !== ' ') {
                        const mat = materials.find(m => m.ch === ch);
                        ctx.fillStyle = (mat && mat.color !== 'transparent') ? mat.color : (materialColors.get(ch) || '#ff00ff');
                        ctx.fillRect(x * zoom, y * zoom, zoom, zoom);
                    } else if ((x + y) % 2 === 0) {
                        ctx.fillStyle = '#171a25';
                        ctx.fillRect(x * zoom, y * zoom, zoom, zoom);
                    }
                    if (zoom >= 8) {
                        ctx.strokeStyle = 'rgba(255,255,255,0.08)';
                        ctx.strokeRect(x * zoom + 0.5, y * zoom + 0.5, zoom, zoom);
                    }
                    if (zoom >= 10 && ch !== ' ') {
                        ctx.fillStyle = 'rgba(0,0,0,0.72)';
                        ctx.font = `${Math.max(8, zoom - 2)}px monospace`;
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'middle';
                        ctx.fillText(ch, x * zoom + zoom / 2 + 1, y * zoom + zoom / 2 + 1);
                        ctx.fillStyle = '#ffffff';
                        ctx.fillText(ch, x * zoom + zoom / 2, y * zoom + zoom / 2);
                    }
                }
            }
            activeLabel.textContent = `${selectedMaterial.ch === ' ' ? tt('Blank') : selectedMaterial.ch} · ${tt(selectedMaterial.name)}`;
        };
        const paintFromEvent = (e) => {
            const rect = canvas.getBoundingClientRect();
            const zoom = Number(canvas.dataset.zoom) || 1;
            const x = Math.floor((e.clientX - rect.left) * (canvas.width / rect.width) / zoom);
            const y = Math.floor((e.clientY - rect.top) * (canvas.height / rect.height) / zoom);
            setPixel(x, y);
        };
        const refreshPalette = () => {
            paletteGrid.querySelectorAll('[data-ch]').forEach(el => {
                const on = el.dataset.ch === selectedMaterial.ch;
                el.style.outline = on ? '2px solid var(--color-accent-bright)' : 'none';
                el.style.background = on ? 'var(--color-bg-button-active)' : 'var(--color-bg-button)';
            });
            drawGrid();
        };

        const tagOptions = this._materialTagOptions().filter(t => t);
        const hasDynamicPalette = !!(result.palette && Object.keys(result.palette).length);
        if (hasDynamicPalette && !document.getElementById('rr-cg-tag-suggestions')) {
            const dl = document.createElement('datalist');
            dl.id = 'rr-cg-tag-suggestions';
            dl.innerHTML = tagOptions.map(t => `<option value="${this._escapeHtml(t)}">`).join('');
            modal.appendChild(dl);
        }
        if (hasDynamicPalette) {
            // Single-column rows with hex picker + material tag dropdown.
            paletteGrid.style.gridTemplateColumns = '1fr';
        }
        const buildPaletteRow = (material) => {
            const row = document.createElement('div');
            row.dataset.ch = material.ch;
            row.style.cssText = 'display:flex;align-items:center;gap:6px;padding:3px 4px;border-radius:3px;background:var(--color-bg-button);min-width:0;cursor:pointer;';
            const swatch = material.ch === ' '
                ? 'repeating-linear-gradient(45deg,#222 0,#222 4px,#333 4px,#333 8px)'
                : material.color;
            const swatchEl = document.createElement('span');
            swatchEl.style.cssText = `flex:0 0 auto;width:16px;height:16px;border:1px solid rgba(255,255,255,0.25);background:${swatch};border-radius:2px;`;
            row.appendChild(swatchEl);
            const letterEl = document.createElement('span');
            letterEl.style.cssText = 'flex:0 0 auto;font:700 11px monospace;min-width:14px;text-align:center;';
            letterEl.textContent = material.ch === ' ' ? '·' : material.ch;
            row.appendChild(letterEl);

            if (hasDynamicPalette && material.ch !== ' ') {
                const colorInput = document.createElement('input');
                colorInput.type = 'color';
                colorInput.value = material.color;
                colorInput.style.cssText = 'flex:0 0 auto;width:26px;height:20px;padding:0;border:1px solid var(--color-border-input);background:transparent;cursor:pointer;';
                colorInput.addEventListener('input', (e) => {
                    e.stopPropagation();
                    const hex = colorInput.value;
                    material.color = hex;
                    swatchEl.style.background = hex;
                    if (result.palette[material.ch]) {
                        if (typeof result.palette[material.ch] === 'object') {
                            result.palette[material.ch].hex = hex;
                        } else {
                            result.palette[material.ch] = { hex, material: material.material || '' };
                        }
                    }
                    updateText();
                    drawGrid();
                });
                row.appendChild(colorInput);

                const tagInput = document.createElement('input');
                tagInput.type = 'text';
                tagInput.className = 'rr-input';
                tagInput.placeholder = tt('tag (e.g. {examples})').replace('{examples}', 'skin, hair, sash, scarf');
                tagInput.value = material.material || '';
                tagInput.setAttribute('list', 'rr-cg-tag-suggestions');
                tagInput.style.cssText = 'flex:1;min-width:0;padding:1px 4px;font-size:10px;';
                tagInput.addEventListener('input', (e) => e.stopPropagation());
                tagInput.addEventListener('change', (e) => {
                    e.stopPropagation();
                    const tag = tagInput.value.trim();
                    material.material = tag;
                    if (result.palette[material.ch]) {
                        if (typeof result.palette[material.ch] === 'object') {
                            result.palette[material.ch].material = tag;
                        } else {
                            result.palette[material.ch] = { hex: material.color, material: tag };
                        }
                    }
                    material.name = tag ? `${material.ch} (${tag})` : `${material.ch}`;
                    updateText();
                });
                row.appendChild(tagInput);
            } else {
                const nameEl = document.createElement('span');
                nameEl.style.cssText = 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:10px;';
                nameEl.textContent = tt(material.name);
                row.appendChild(nameEl);
            }

            row.addEventListener('click', (e) => {
                if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
                selectedMaterial = material;
                refreshPalette();
            });
            return row;
        };
        for (const material of materials) {
            paletteGrid.appendChild(buildPaletteRow(material));
        }

        const LETTER_POOL =
            'ABCDEFGHIJKLMNOPQRSTUVWXYZ' +
            'abcdefghijklmnopqrstuvwxyz' +
            '0123456789' +
            '!#$%&*+=?@^~<>/|:;_{}[]()-"';
        const nextUnusedLetter = () => {
            const used = new Set(materials.map(m => m.ch));
            for (const ch of LETTER_POOL) if (!used.has(ch)) return ch;
            return null;
        };
        addColorBtn.addEventListener('click', () => {
            const ch = nextUnusedLetter();
            if (!ch) { addColorBtn.textContent = tt('No letters left'); addColorBtn.disabled = true; return; }
            const hex = '#888888';
            const newMaterial = { ch, name: ch, color: hex, material: '' };
            materials.push(newMaterial);
            materialColors.set(ch, hex);
            result.palette = result.palette || {};
            result.palette[ch] = { hex, material: '' };
            paletteGrid.appendChild(buildPaletteRow(newMaterial));
            selectedMaterial = newMaterial;
            refreshPalette();
            updateText();
        });

        dirSelect.addEventListener('change', () => { currentDir = Number(dirSelect.value) || 0; drawGrid(); });
        frameSelect.addEventListener('change', () => { currentFrame = Number(frameSelect.value) || 0; drawGrid(); });
        const stopPainting = () => { painting = false; };
        canvas.addEventListener('mousedown', (e) => { painting = true; paintFromEvent(e); });
        canvas.addEventListener('mousemove', (e) => { if (painting) paintFromEvent(e); });
        window.addEventListener('mouseup', stopPainting);
        canvas.addEventListener('mouseleave', stopPainting);
        updateText();
        refreshPalette();

        const footer = document.createElement('div');
        footer.style.cssText = 'padding:10px 14px;border-top:1px solid var(--color-border-subtle);display:flex;justify-content:flex-end;gap:8px;';
        panel.appendChild(footer);

        const copy = document.createElement('button');
        copy.className = 'rr-btn-chip';
        copy.textContent = result.sheetRows ? tt('Copy Sheet JS') : tt('Copy Rows');
        copy.style.cssText = 'padding:6px 14px;color:var(--color-accent-bright);';
        copy.addEventListener('click', async () => {
            try {
                await navigator.clipboard.writeText(text.value);
                copy.textContent = tt('Copied');
            } catch (_) {
                text.focus();
                text.select();
                document.execCommand('copy');
                copy.textContent = tt('Copied');
            }
        });
        footer.appendChild(copy);

        const close = document.createElement('button');
        close.className = 'rr-btn-chip';
        close.textContent = tt('Close');
        close.style.cssText = 'padding:6px 14px;';
        const closeModal = () => {
            document.removeEventListener('keydown', escClose);
            window.removeEventListener('mouseup', stopPainting);
            modal.remove();
        };
        const escClose = (e) => { if (e.key === 'Escape') closeModal(); };

        close.addEventListener('click', closeModal);
        footer.appendChild(close);

        modal.addEventListener('mousedown', (e) => { if (e.target === modal) closeModal(); });
        document.addEventListener('keydown', escClose);
        document.body.appendChild(modal);
        text.focus();
        text.select();
    }

    _toggleProceduralWalkPreview() {
        this.proceduralAnimating = !this.proceduralAnimating;
        if (this.proceduralAnimating) {
            const seq = [0, 1, 2, 1];
            let i = seq.indexOf(this.walkFrame);
            if (i < 0) i = 0;
            this._procAnimTimer = setInterval(() => {
                this.walkFrame = seq[i++ % seq.length];
                this._drawProceduralPreview();
            }, 170);
        } else {
            clearInterval(this._procAnimTimer);
            this._procAnimTimer = null;
            this.walkFrame = 1;
            this._drawProceduralPreview();
        }
        this._render();
    }

    async _saveProceduralSheet() {
        const tt = (text) => (typeof window !== 'undefined' && window.I18n) ? window.I18n.tText(text) : text;
        const webHost = window.RPGReactorHost?.mode === 'web' ? window.RPGReactorHost : null;
        const projectPath = this._syncProjectPath();
        if (!projectPath && !webHost && !this._requireProjectPath()) return;
        const nameInput = this.root.querySelector('.rr-cgp-name');
        let name = (nameInput?.value || '').trim();
        if (!name) { alert(tt('Enter a name for the character sheet.')); return; }
        name = name.replace(/^[\$!]+/, '');

        // Render all 12 cells: 4 directions × 3 walk frames
        const FW = this.frameWidth, FH = this.frameHeight;
        const sheetCanvas = document.createElement('canvas');
        sheetCanvas.width  = FW * 3;
        sheetCanvas.height = FH * 4;
        const ctx = sheetCanvas.getContext('2d');
        ctx.imageSmoothingEnabled = false;

        const activeParts = this._buildActiveParts();
        for (let dir = 0; dir < 4; dir++) {
            for (let fr = 0; fr < 3; fr++) {
                const imgData = CharacterRenderer.render(FW, FH, dir, fr, activeParts);
                // Draw into temp canvas to place on sheet
                const tmp = document.createElement('canvas');
                tmp.width = FW; tmp.height = FH;
                tmp.getContext('2d').putImageData(imgData, 0, 0);
                ctx.drawImage(tmp, fr * FW, dir * FH);
            }
        }

        const fs   = require('fs');
        const path = require('path');
        // projectPath can be null in the browser edition — building the
        // output path unconditionally threw before the web download
        // fallback could run.
        const outDir  = projectPath ? path.join(projectPath, 'img', 'characters') : null;
        const outPath = outDir ? path.join(outDir, `$${name}.png`) : null;
        try {
            const dataUrl = sheetCanvas.toDataURL('image/png');
            if (webHost) {
                const result = await webHost.saveFile({
                    data: dataUrl,
                    projectPath: outPath,
                    suggestedName: `$${name}.png`,
                    mimeType: 'image/png',
                });
                if (result) alert(result.project
                    ? tt('Saved {file} to {path}').replace('{file}', `$${name}.png`).replace('{path}', 'img/characters/')
                    : tt('Saved → {path}').replace('{path}', result.path));
                return;
            }
            if (!outDir) { alert(tt('Open a project first.')); return; }
            fs.mkdirSync(outDir, { recursive: true });
            const base64 = dataUrl.replace(/^data:image\/png;base64,/, '');
            fs.writeFileSync(outPath, Buffer.from(base64, 'base64'));
            alert(tt('Saved {file} to {path}').replace('{file}', `$${name}.png`).replace('{path}', 'img/characters/'));
        } catch (e) {
            console.error('CharacterGenerator save error:', e);
            alert(tt('Save failed: {error}').replace('{error}', e.message));
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    //  TAB 2 — PARTS (PNG compositor — original tool)
    // ═══════════════════════════════════════════════════════════════════════════

    _partsHTML() {
        const tt = (text) => (typeof window !== 'undefined' && window.I18n) ? window.I18n.tText(text) : text;
        const sheetW = this.sheetWidth, sheetH = this.sheetHeight;
        const zoom = Math.max(1, Math.min(4, Math.floor(192 / this.frameWidth)));
        const prevW = this.frameWidth  * zoom;
        const prevH = this.frameHeight * zoom;
        const shDispW = Math.min(360, sheetW * 2);
        const shDispH = Math.round(shDispW * (sheetH / sheetW));

        return `
        <div style="display:flex;flex-direction:column;height:100%;min-height:0;">
            <!-- Toolbar -->
            <div style="padding:8px 16px;background:var(--color-bg-panel);border-bottom:1px solid var(--color-border-subtle);display:flex;align-items:center;gap:12px;flex-shrink:0;">
                <label style="font-size:11px;color:var(--color-text-muted);">${this._t('forge.frame')}</label>
                <input type="number" class="rr-cg-fw rr-input" value="${this.frameWidth}"  min="8" max="512" style="width:58px;padding:3px 6px;font-size:11px;">
                <span style="font-size:11px;color:var(--color-text-muted);">×</span>
                <input type="number" class="rr-cg-fh rr-input" value="${this.frameHeight}" min="8" max="512" style="width:58px;padding:3px 6px;font-size:11px;">
                <span style="font-size:10px;color:var(--color-text-dim);margin-left:6px;">${this._t('forge.sheet')} ${sheetW}×${sheetH}</span>
            </div>

            <div style="display:grid;grid-template-columns:200px 1fr 260px;flex:1;min-height:0;">
                <!-- Layers -->
                <div class="rr-cg-categories" style="background:var(--color-bg-panel);border-right:1px solid var(--color-border);overflow-y:auto;padding:8px 0;">
                    ${this._renderCategoryList()}
                </div>

                <!-- Preview -->
                <div style="display:flex;flex-direction:column;padding:18px;gap:14px;background:var(--color-bg-base);overflow-y:auto;">
                    <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
                        <span style="font-size:11px;color:var(--color-text-muted);">${tt('Direction:')}</span>
                        ${['Down','Left','Right','Up'].map((d, i) => `<button class="rr-cg-dir-btn" data-dir="${i}" style="padding:4px 10px;font-size:11px;cursor:pointer;border-radius:3px;border:1px solid var(--color-border-input);background:${this.previewDirection === i ? 'var(--color-bg-button-active)' : 'var(--color-bg-button)'};color:var(--color-text-strong);">${tt(d)}</button>`).join('')}
                        <button class="rr-cg-anim-btn" style="padding:4px 10px;font-size:11px;cursor:pointer;border-radius:3px;border:1px solid var(--color-border-input);background:${this.previewAnimating ? 'var(--color-bg-button-active)' : 'var(--color-bg-button)'};color:var(--color-text-strong);">${this.previewAnimating ? '⏸ ' + tt('Stop') : '▶ ' + tt('Walk')}</button>
                        <label style="display:flex;align-items:center;gap:5px;font-size:11px;color:var(--color-text);cursor:pointer;margin-left:auto;">
                            <input type="checkbox" class="rr-cg-grid-toggle" ${this.gridEnabled ? 'checked' : ''}> ${tt('Grid')}
                        </label>
                        <input type="number" class="rr-cg-grid-step rr-input" value="${this.gridStep}" min="1" max="512" style="width:52px;padding:3px 6px;font-size:11px;" ${this.gridEnabled ? '' : 'disabled'}>
                        <span style="font-size:10px;color:var(--color-text-dim);">px</span>
                    </div>
                    <div style="display:flex;gap:16px;align-items:flex-start;">
                        <div style="display:flex;flex-direction:column;align-items:center;gap:6px;">
                            <div style="font-size:10px;color:var(--color-text-muted);">${tt('Preview')}</div>
                            <div style="background:var(--color-bg-deep);border:1px solid var(--color-border-input);border-radius:4px;padding:8px;">
                                <canvas class="rr-cg-preview-canvas" width="${this.frameWidth}" height="${this.frameHeight}" style="width:${prevW}px;height:${prevH}px;image-rendering:pixelated;display:block;"></canvas>
                            </div>
                        </div>
                        <div style="display:flex;flex-direction:column;align-items:center;gap:6px;flex:1;">
                            <div style="font-size:10px;color:var(--color-text-muted);">${tt('Full Sheet')} (${sheetW}×${sheetH})</div>
                            <div style="background:var(--color-bg-deep);border:1px solid var(--color-border-input);border-radius:4px;padding:8px;">
                                <div style="position:relative;width:${shDispW}px;height:${shDispH}px;">
                                    <canvas class="rr-cg-sheet-canvas" width="${sheetW}" height="${sheetH}" style="width:100%;height:100%;image-rendering:pixelated;display:block;"></canvas>
                                    <canvas class="rr-cg-grid-canvas"  width="${shDispW}" height="${shDispH}" style="position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;display:${this.gridEnabled ? 'block' : 'none'};"></canvas>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div style="font-size:10px;color:var(--color-text-dim);padding:4px 0;border-top:1px solid var(--color-border-subtle);display:flex;flex-wrap:wrap;align-items:center;gap:8px;">
                        <span>${tt('Parts folders:')}
                            <code style="background:var(--color-bg-input-alt);padding:1px 5px;border-radius:2px;">styles/${this.characterStyle}/parts/</code>
                            + ${tt('legacy')} <code style="background:var(--color-bg-input-alt);padding:1px 5px;border-radius:2px;">parts/</code>
                        </span>
                        <button type="button" class="rr-cg-open-parts rr-btn-chip" style="padding:2px 8px;font-size:10px;">${tt('Open Folder')}</button>
                    </div>
                </div>

                <!-- Variations -->
                <div class="rr-cg-variations" style="background:var(--color-bg-panel);border-left:1px solid var(--color-border);overflow-y:auto;padding:8px;">
                    ${this._renderVariationList()}
                </div>
            </div>

            <div class="rr-modal-footer" style="padding:10px 18px;border-top:1px solid var(--color-border-subtle);background:var(--color-bg-panel);display:flex;align-items:center;gap:10px;flex-shrink:0;">
                <label style="font-size:12px;color:var(--color-text-muted);">${this._t('forge.saveAs')}</label>
                <input type="text" class="rr-cg-name-input rr-input" placeholder="${tt('MyHero')}" style="width:180px;padding:4px 8px;font-size:12px;">
                <span style="font-size:10px;color:var(--color-text-dim);">→ img/characters/$&lt;name&gt;.png</span>
                <div style="margin-left:auto;display:flex;gap:8px;">
                    <button class="rr-cg-refresh rr-btn-chip" style="padding:6px 14px;">↻ ${tt('Reload Parts')}</button>
                    <button class="rr-cg-save rr-btn-chip" style="padding:6px 18px;color:var(--color-accent-bright);">${this._t('forge.saveSheet')}</button>
                </div>
            </div>
        </div>`;
    }

    // ── Parts: filesystem ──────────────────────────────────────────────────────

    _configPath() {
        const projectPath = this._syncProjectPath();
        if (!projectPath) return null;
        return require('path').join(projectPath, 'forge', 'character_generator', 'config.json');
    }

    _setFrameSize(w, h) {
        const nextW = Math.max(8, Math.min(512, parseInt(w) || this.frameWidth));
        const nextH = Math.max(8, Math.min(512, parseInt(h) || this.frameHeight));
        if (nextW === this.frameWidth && nextH === this.frameHeight) return false;
        this.frameWidth = nextW;
        this.frameHeight = nextH;
        this._saveConfig();
        return true;
    }

    _loadConfig() {
        try {
            const configPath = this._configPath();
            if (!configPath) { this._savedLayerOrder = []; this._savedLayerOrderByStyle = {}; return; }
            const raw = require('fs').readFileSync(configPath, 'utf8');
            const cfg = JSON.parse(raw);
            if (cfg.frameWidth)  this.frameWidth  = parseInt(cfg.frameWidth)  || this.frameWidth;
            if (cfg.frameHeight) this.frameHeight = parseInt(cfg.frameHeight) || this.frameHeight;
            if (this._characterStyles().some(s => s.id === cfg.characterStyle)) this.characterStyle = cfg.characterStyle;
            if (typeof cfg.gridEnabled === 'boolean') this.gridEnabled = cfg.gridEnabled;
            if (cfg.gridStep) this.gridStep = parseInt(cfg.gridStep) || this.gridStep;
            if (['left', 'center', 'right'].includes(cfg.templateAlignX)) this.templateAlignX = cfg.templateAlignX;
            if (['top', 'middle', 'bottom'].includes(cfg.templateAlignY)) this.templateAlignY = cfg.templateAlignY;
            this._savedLayerOrderByStyle = cfg.layerOrderByStyle && typeof cfg.layerOrderByStyle === 'object' ? cfg.layerOrderByStyle : {};
            this._savedLayerOrder = this._savedLayerOrderByStyle[this.characterStyle] || (Array.isArray(cfg.layerOrder) ? cfg.layerOrder : []);
        } catch { this._savedLayerOrder = []; this._savedLayerOrderByStyle = {}; }
    }

    _saveConfig() {
        try {
            const fs = require('fs');
            const path = require('path');
            const configPath = this._configPath();
            if (!configPath) return;
            fs.mkdirSync(path.dirname(configPath), { recursive: true });
            fs.writeFileSync(configPath, JSON.stringify({
                characterStyle: this.characterStyle,
                frameWidth: this.frameWidth, frameHeight: this.frameHeight,
                templateAlignX: this.templateAlignX,
                templateAlignY: this.templateAlignY,
                gridEnabled: this.gridEnabled, gridStep: this.gridStep,
                layerOrderByStyle: {
                    ...(this._savedLayerOrderByStyle || {}),
                    [this.characterStyle]: this.categories.length ? this.categories.map(c => c.name) : (this._savedLayerOrder || [])
                }
            }, null, 2));
        } catch (e) { console.error('CharacterGenerator config save error:', e); }
    }

    /** Style-scoped parts root (write target for new PNGs / folder structure). */
    _partsRoot() {
        const projectPath = this._syncProjectPath();
        if (!projectPath) return null;
        return require('path').join(projectPath, 'forge', 'character_generator', 'styles', this.characterStyle, 'parts');
    }

    /** All roots scanned for PNG parts: style path first, then legacy project parts/. */
    _partsSearchRoots() {
        const path = require('path');
        const projectPath = this._syncProjectPath();
        if (!projectPath) return [];
        return [
            path.join(projectPath, 'forge', 'character_generator', 'styles', this.characterStyle, 'parts'),
            path.join(projectPath, 'forge', 'character_generator', 'parts')
        ];
    }

    _ensurePartsFolder() {
        const fs = require('fs'), path = require('path');
        const partsRoot = this._partsRoot();
        if (!partsRoot) return;
        try {
            fs.mkdirSync(partsRoot, { recursive: true });
            for (const c of ['accessories', 'armwear', 'body', 'eyes', 'footwear', 'full outfits', 'hair', 'handwear', 'heads', 'headwear', 'legwear', 'neckwear', 'shoulderwear', 'torso', 'waistwear']) {
                const dir = path.join(partsRoot, c);
                if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            }
            for (const g of ['female', 'male']) {
                const dir = path.join(partsRoot, 'body', g);
                if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            }
        } catch (e) { console.error('CharacterGenerator parts folder error:', e); }
    }

    _loadCategories() {
        const fs = require('fs'), path = require('path');
        const discovered = [];
        const seenNames = new Set();
        const walk = (partsRoot, rel) => {
            const abs = rel ? path.join(partsRoot, rel) : partsRoot;
            let entries = [];
            try { entries = fs.readdirSync(abs, { withFileTypes: true }); } catch { return; }
            if (entries.some(e => e.isFile() && /\.png$/i.test(e.name)) && rel) {
                const name = rel.replace(/\\/g, '/');
                if (!seenNames.has(name)) {
                    seenNames.add(name);
                    discovered.push({ name, abs });
                }
            }
            for (const e of entries) {
                if (e.isDirectory()) walk(partsRoot, rel ? path.join(rel, e.name) : e.name);
            }
        };
        for (const root of this._partsSearchRoots()) walk(root, '');
        if (!discovered.length) { this.categories = []; return; }
        const saved = this._savedLayerOrder || [];
        const byName = new Map(discovered.map(d => [d.name, d]));
        const seen = new Set();
        const ordered = [];
        for (const name of saved) {
            if (byName.has(name) && !seen.has(name)) { ordered.push(byName.get(name)); seen.add(name); }
        }
        const final = [...discovered.filter(d => !seen.has(d.name)).sort((a, b) => a.name.localeCompare(b.name)), ...ordered];
        this.categories = final.map(({ name, abs }) => {
            let files = [];
            try { files = require('fs').readdirSync(abs).filter(f => /\.png$/i.test(f)).sort(); } catch {}
            const displayName = name.split('/').map(s => s.replace(/[_-]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase())).join(' > ');
            return { name, displayName, folder: abs, variations: files.map(f => ({ name: f.replace(/\.png$/i, '').replace(/[_-]+/g, ' '), file: f, path: require('path').join(abs, f) })), selected: null };
        });
        this.activeCategoryIndex = Math.min(this.activeCategoryIndex, Math.max(0, this.categories.length - 1));
    }

    _moveCategory(idx, delta) {
        const target = idx + delta;
        if (target < 0 || target >= this.categories.length) return;
        this._reorderCategory(idx, target);
    }

    _reorderCategory(idx, target) {
        if (idx === target || idx < 0 || target < 0 || idx >= this.categories.length || target >= this.categories.length) return;
        const [moved] = this.categories.splice(idx, 1);
        this.categories.splice(target, 0, moved);
        if (this.activeCategoryIndex === idx) this.activeCategoryIndex = target;
        else if (this.activeCategoryIndex === target) this.activeCategoryIndex = idx;
        this._saveConfig();
    }

    // ── Parts: rendering ──────────────────────────────────────────────────────

    _renderCategoryList() {
        const tt = (text) => (typeof window !== 'undefined' && window.I18n) ? window.I18n.tText(text) : text;
        if (!this.categories.length) return `<div style="padding:20px;font-size:11px;color:var(--color-text-muted);text-align:center;line-height:1.45;">${tt('No PNG part categories found.')}<br>${tt('Add PNG folders under either:')}<br><span style="font-family:monospace;font-size:10px;color:var(--color-text-dim);">forge/character_generator/styles/${this.characterStyle}/parts/</span><br>${tt('or the legacy path')}<br><span style="font-family:monospace;font-size:10px;color:var(--color-text-dim);">forge/character_generator/parts/</span><br>${tt('then reload.')}<br><br><span style="color:var(--color-text-dim);">${tt('Procedural / Outfit / Hair Forge parts are JS templates and appear on the Procedural tab, not here.')}</span></div>`;
        const hdr = `<div style="padding:6px 10px 8px;font-size:9px;font-weight:700;color:var(--color-accent-bright);text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid var(--color-border-subtle);display:flex;justify-content:space-between;"><span>${tt('Layers')}</span><span style="font-size:8px;color:var(--color-text-dim);font-weight:400;text-transform:none;">${tt('top = front')}</span></div>`;
        return hdr + this.categories.map((cat, idx) => `
            <div class="rr-cg-cat-row" data-cat-idx="${idx}" draggable="true" title="${tt('Drag to reorder layers')}" style="display:grid;grid-template-columns:1fr auto;align-items:center;background:${idx === this.activeCategoryIndex ? 'var(--color-bg-hover)' : 'transparent'};border-left:3px solid ${idx === this.activeCategoryIndex ? 'var(--color-accent-bright)' : 'transparent'};">
                <div class="rr-cg-cat-item" style="padding:7px 10px;cursor:pointer;font-size:12px;color:var(--color-text);display:flex;justify-content:space-between;align-items:center;min-width:0;">
                    <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;"><span style="color:var(--color-text-dim);padding-right:5px;cursor:grab;">☰</span>${this._escapeHtml(tt(cat.displayName))}</span>
                    <span style="font-size:9px;color:var(--color-text-muted);flex-shrink:0;padding-left:6px;">${cat.selected != null ? '●' : '○'} ${cat.variations.length}</span>
                </div>
                <div style="display:flex;flex-direction:column;gap:1px;padding:2px 6px;">
                    <button class="rr-cg-cat-up" data-cat-idx="${idx}" ${idx === 0 ? 'disabled' : ''} style="background:var(--color-bg-button);border:1px solid var(--color-border-input);color:var(--color-text);border-radius:2px;font-size:9px;padding:1px 4px;cursor:${idx === 0 ? 'not-allowed' : 'pointer'};opacity:${idx === 0 ? 0.4 : 1};">▲</button>
                    <button class="rr-cg-cat-dn" data-cat-idx="${idx}" ${idx === this.categories.length - 1 ? 'disabled' : ''} style="background:var(--color-bg-button);border:1px solid var(--color-border-input);color:var(--color-text);border-radius:2px;font-size:9px;padding:1px 4px;cursor:${idx === this.categories.length - 1 ? 'not-allowed' : 'pointer'};opacity:${idx === this.categories.length - 1 ? 0.4 : 1};">▼</button>
                </div>
            </div>`).join('');
    }

    _renderVariationList() {
        const tt = (text) => (typeof window !== 'undefined' && window.I18n) ? window.I18n.tText(text) : text;
        const cat = this.categories[this.activeCategoryIndex];
        if (!cat) return '<div style="padding:16px;font-size:11px;color:var(--color-text-muted);">' + tt('Select a category.') + '</div>';
        const noneSelected = cat.selected == null;
        return `
            <div style="font-size:11px;font-weight:700;color:var(--color-accent-bright);text-transform:uppercase;letter-spacing:0.3px;margin-bottom:8px;">${this._escapeHtml(tt(cat.displayName))}</div>
            <div class="rr-cg-var-item" data-var-idx="none" style="padding:8px 10px;cursor:pointer;font-size:11px;color:var(--color-text);background:${noneSelected ? 'var(--color-accent-tint-25)' : 'var(--color-bg-list-item)'};border:1px solid ${noneSelected ? 'var(--color-accent-border-strong)' : 'var(--color-border-subtle)'};border-radius:3px;margin-bottom:6px;">${tt('(None)')}</div>
            ${cat.variations.map((v, i) => {
                const sel = cat.selected === i;
                return `<div class="rr-cg-var-item" data-var-idx="${i}" style="padding:8px 10px;cursor:pointer;font-size:11px;color:var(--color-text);background:${sel ? 'var(--color-accent-tint-25)' : 'var(--color-bg-list-item)'};border:1px solid ${sel ? 'var(--color-accent-border-strong)' : 'var(--color-border-subtle)'};border-radius:3px;margin-bottom:4px;display:flex;gap:8px;align-items:center;">
                    <div class="rr-cg-var-thumb" data-var-thumb="${i}" style="width:32px;height:32px;background:var(--color-bg-deep);border-radius:2px;flex-shrink:0;background-size:${this.sheetWidth}px ${this.sheetHeight}px;background-position:-${this.frameWidth}px 0;image-rendering:pixelated;"></div>
                    <div style="flex:1;word-break:break-word;">${this._escapeHtml(tt(v.name))}</div>
                </div>`;
            }).join('') || `<div style="font-size:10px;color:var(--color-text-muted);padding:8px 4px;">${tt('No variations. Drop PNGs into the folder and reload.')}</div>`}`;
    }

    _getImage(filePath) {
        if (this.imageCache.has(filePath)) return this.imageCache.get(filePath);
        const img = new Image();
        img.src = 'file://' + filePath.replace(/\\/g, '/');
        this.imageCache.set(filePath, img);
        img.addEventListener('load',  () => this._renderPartsPreview());
        img.addEventListener('error', () => console.warn('CharacterGenerator: failed to load', filePath));
        return img;
    }

    _renderPartsPreview() {
        if (!this.root) return;
        const sheetCanvas   = this.root.querySelector('.rr-cg-sheet-canvas');
        const previewCanvas = this.root.querySelector('.rr-cg-preview-canvas');
        if (!sheetCanvas || !previewCanvas) return;
        const sCtx = sheetCanvas.getContext('2d');
        sCtx.imageSmoothingEnabled = false;
        sCtx.clearRect(0, 0, this.sheetWidth, this.sheetHeight);
        for (let i = this.categories.length - 1; i >= 0; i--) {
            const cat = this.categories[i];
            if (cat.selected == null) continue;
            const v = cat.variations[cat.selected];
            if (!v) continue;
            const img = this._getImage(v.path);
            if (img.complete && img.naturalWidth > 0) sCtx.drawImage(img, 0, 0, this.sheetWidth, this.sheetHeight);
        }
        const fw = this.frameWidth, fh = this.frameHeight;
        const pCtx = previewCanvas.getContext('2d');
        pCtx.imageSmoothingEnabled = false;
        pCtx.clearRect(0, 0, fw, fh);
        pCtx.drawImage(sheetCanvas, this.previewWalkFrame * fw, this.previewDirection * fh, fw, fh, 0, 0, fw, fh);
        this._renderGrid();
    }

    _renderGrid() {
        const gridCanvas = this.root?.querySelector('.rr-cg-grid-canvas');
        if (!gridCanvas) return;
        const gCtx = gridCanvas.getContext('2d');
        gCtx.clearRect(0, 0, gridCanvas.width, gridCanvas.height);
        if (!this.gridEnabled) return;
        const sx = this.gridStep * gridCanvas.width / this.sheetWidth;
        const sy = this.gridStep * gridCanvas.height / this.sheetHeight;
        if (sx < 2 || sy < 2) return;
        const c = ThemeColors.resolve('--color-accent-bright', '#ffd700');
        gCtx.strokeStyle = c; gCtx.globalAlpha = 0.35; gCtx.lineWidth = 1;
        gCtx.beginPath();
        for (let x = 0; x <= gridCanvas.width;  x += sx) { gCtx.moveTo(Math.floor(x) + 0.5, 0); gCtx.lineTo(Math.floor(x) + 0.5, gridCanvas.height); }
        for (let y = 0; y <= gridCanvas.height; y += sy) { gCtx.moveTo(0, Math.floor(y) + 0.5); gCtx.lineTo(gridCanvas.width, Math.floor(y) + 0.5); }
        gCtx.stroke(); gCtx.globalAlpha = 1;
    }

    // ── Parts: events ─────────────────────────────────────────────────────────

    _wirePartsEvents() {
        const fw = this.root.querySelector('.rr-cg-fw');
        const fh = this.root.querySelector('.rr-cg-fh');
        const commit = () => {
            const w = parseInt(fw.value) || 48, h = parseInt(fh.value) || 48;
            if (this._setFrameSize(w, h)) this._render();
        };
        fw.addEventListener('change', commit); fh.addEventListener('change', commit);

        const gridToggle = this.root.querySelector('.rr-cg-grid-toggle');
        const gridStep   = this.root.querySelector('.rr-cg-grid-step');
        gridToggle.addEventListener('change', e => {
            this.gridEnabled = e.target.checked;
            gridStep.disabled = !this.gridEnabled;
            const gc = this.root.querySelector('.rr-cg-grid-canvas');
            if (gc) gc.style.display = this.gridEnabled ? 'block' : 'none';
            this._saveConfig(); this._renderGrid();
        });
        gridStep.addEventListener('change', () => {
            this.gridStep = Math.max(1, Math.min(512, parseInt(gridStep.value) || 16));
            gridStep.value = this.gridStep; this._saveConfig(); this._renderGrid();
        });

        this._wirePartsCategoryEvents();
        this._wirePartsVariationEvents();

        this.root.querySelectorAll('.rr-cg-dir-btn').forEach(el => {
            el.addEventListener('click', () => { this.previewDirection = parseInt(el.dataset.dir); this._render(); });
        });

        this.root.querySelector('.rr-cg-anim-btn').addEventListener('click', () => {
            this.previewAnimating = !this.previewAnimating;
            if (this.previewAnimating) {
                const seq = [0, 1, 2, 1]; let i = 0;
                this._animTimer = setInterval(() => { this.previewWalkFrame = seq[i++ % 4]; this._renderPartsPreview(); }, 180);
            } else {
                clearInterval(this._animTimer); this._animTimer = null;
                this.previewWalkFrame = 1; this._renderPartsPreview();
            }
            this._render();
        });

        this.root.querySelector('.rr-cg-refresh').addEventListener('click', () => {
            this._syncProjectPath();
            this.imageCache.clear(); this._loadCategories(); this._render();
        });

        const openParts = this.root.querySelector('.rr-cg-open-parts');
        if (openParts) openParts.addEventListener('click', () => {
            const root = this._partsRoot();
            if (!root) return;
            try {
                const fs = require('fs');
                fs.mkdirSync(root, { recursive: true });
                if (typeof nw !== 'undefined' && nw.Shell && typeof nw.Shell.openItem === 'function') {
                    nw.Shell.openItem(root);
                } else if (typeof require === 'function') {
                    const command = process.platform === 'win32' ? 'explorer'
                        : process.platform === 'darwin' ? 'open' : 'xdg-open';
                    require('child_process').execFile(command, [root]);
                }
            } catch (e) { console.warn('Open parts folder failed', e); }
        });

        this.root.querySelector('.rr-cg-save').addEventListener('click', () => this._savePartsSheet());
    }

    _refreshPartsLists() {
        const cb = this.root.querySelector('.rr-cg-categories');
        const vb = this.root.querySelector('.rr-cg-variations');
        if (cb) cb.innerHTML = this._renderCategoryList();
        if (vb) vb.innerHTML = this._renderVariationList();
        this._wirePartsCategoryEvents();
        this._wirePartsVariationEvents();
    }

    _wirePartsCategoryEvents() {
        this.root.querySelectorAll('.rr-cg-cat-row').forEach(row => {
            row.addEventListener('dragstart', e => {
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', row.dataset.catIdx);
                row.style.opacity = '0.55';
            });
            row.addEventListener('dragend', () => { row.style.opacity = ''; });
            row.addEventListener('dragover', e => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                row.style.boxShadow = 'inset 0 0 0 1px var(--color-accent-bright)';
            });
            row.addEventListener('dragleave', () => { row.style.boxShadow = ''; });
            row.addEventListener('drop', e => {
                e.preventDefault();
                row.style.boxShadow = '';
                const from = parseInt(e.dataTransfer.getData('text/plain'));
                const to = parseInt(row.dataset.catIdx);
                if (Number.isNaN(from) || Number.isNaN(to)) return;
                this._reorderCategory(from, to);
                this._refreshPartsLists();
                this._renderPartsPreview();
            });
        });
        this.root.querySelectorAll('.rr-cg-cat-row .rr-cg-cat-item').forEach(el => {
            el.addEventListener('click', () => {
                this.activeCategoryIndex = parseInt(el.closest('.rr-cg-cat-row').dataset.catIdx);
                this._refreshPartsLists();
            });
        });
        this.root.querySelectorAll('.rr-cg-cat-up').forEach(btn => {
            btn.addEventListener('click', e => { e.stopPropagation(); this._moveCategory(parseInt(btn.dataset.catIdx), -1); this._refreshPartsLists(); this._renderPartsPreview(); });
        });
        this.root.querySelectorAll('.rr-cg-cat-dn').forEach(btn => {
            btn.addEventListener('click', e => { e.stopPropagation(); this._moveCategory(parseInt(btn.dataset.catIdx), +1); this._refreshPartsLists(); this._renderPartsPreview(); });
        });
    }

    _wirePartsVariationEvents() {
        const category = this.categories[this.activeCategoryIndex];
        this.root.querySelectorAll('.rr-cg-var-thumb').forEach(el => {
            const variation = category?.variations[parseInt(el.dataset.varThumb)];
            if (variation) el.style.backgroundImage = `url("file://${variation.path.replace(/\\/g, '/')}")`;
        });
        this.root.querySelectorAll('.rr-cg-var-item').forEach(el => {
            el.addEventListener('click', () => {
                const cat = this.categories[this.activeCategoryIndex];
                if (!cat) return;
                const raw = el.dataset.varIdx;
                cat.selected = raw === 'none' ? null : parseInt(raw);
                this._refreshPartsLists();
                this._renderPartsPreview();
            });
        });
    }

    async _savePartsSheet() {
        const tt = (text) => (typeof window !== 'undefined' && window.I18n) ? window.I18n.tText(text) : text;
        const webHost = window.RPGReactorHost?.mode === 'web' ? window.RPGReactorHost : null;
        const projectPath = this._syncProjectPath();
        if (!projectPath && !webHost && !this._requireProjectPath()) return;
        const input = this.root.querySelector('.rr-cg-name-input');
        let name = (input?.value || '').trim();
        if (!name) { alert(tt('Enter a name for the character sheet.')); return; }
        name = name.replace(/^[\$!]+/, '');
        const sheetCanvas = this.root.querySelector('.rr-cg-sheet-canvas');
        if (!sheetCanvas) return;
        const fs = require('fs'), path = require('path');
        const outDir  = path.join(projectPath, 'img', 'characters');
        const outPath = path.join(outDir, `$${name}.png`);
        try {
            const dataUrl = sheetCanvas.toDataURL('image/png');
            if (webHost) {
                const result = await webHost.saveFile({
                    data: dataUrl,
                    projectPath: projectPath ? outPath : null,
                    suggestedName: `$${name}.png`,
                    mimeType: 'image/png',
                });
                if (result) alert(result.project
                    ? tt('Saved {file} to {path}').replace('{file}', `$${name}.png`).replace('{path}', 'img/characters/')
                    : tt('Saved → {path}').replace('{path}', result.path));
                return;
            }
            fs.mkdirSync(outDir, { recursive: true });
            const b64 = dataUrl.replace(/^data:image\/png;base64,/, '');
            fs.writeFileSync(outPath, Buffer.from(b64, 'base64'));
            alert(tt('Saved {file} to {path}').replace('{file}', `$${name}.png`).replace('{path}', 'img/characters/'));
        } catch (e) { console.error('CharacterGenerator parts save error:', e); alert(tt('Save failed: {error}').replace('{error}', e.message)); }
    }

    // ── Themed colour picker (ported from AnimationGenerator) ─────────────────

    _openColorPicker(swatchEl) {
        this._closeColorPicker();
        const key    = swatchEl.dataset.key;
        const partId = this._activeProceduralPartId();
        const isPaletteKey = key.startsWith('palette:');
        const paletteLetter = isPaletteKey ? key.slice('palette:'.length) : null;
        const isTintAll = key === 'tintAll';
        const readStored = () => {
            const params = this.partParams[partId] || {};
            if (isTintAll) {
                if (params.tintAll) return params.tintAll;
                const tpl = this._activeBodyTemplatePalette(partId);
                return this._averageTemplatePaletteHex(tpl) || '#888888';
            }
            if (isPaletteKey) {
                const ov = (params.paletteOverrides || {})[paletteLetter];
                if (ov) return ov;
                const tpl = this._activeBodyTemplatePalette(partId);
                if (tpl && tpl[paletteLetter]) {
                    const e = tpl[paletteLetter];
                    return (typeof e === 'object' ? e.hex : e) || '#888888';
                }
                return '#888888';
            }
            return params[key] || '#e8b48a';
        };
        const writeStored = (hex) => {
            if (!this.partParams[partId]) this.partParams[partId] = {};
            if (isTintAll) {
                this.partParams[partId].tintAll = hex;
            } else if (isPaletteKey) {
                if (!this.partParams[partId].paletteOverrides) this.partParams[partId].paletteOverrides = {};
                this.partParams[partId].paletteOverrides[paletteLetter] = hex;
            } else {
                this.partParams[partId][key] = hex;
            }
            // Thumbnails need to refresh on any colour change.
            this._thumbnailCache?.clear();
        };
        const initialColor = readStored().toUpperCase();

        const hexToRgb = (h) => { const s = h.replace('#',''); return [parseInt(s.substr(0,2),16),parseInt(s.substr(2,2),16),parseInt(s.substr(4,2),16)]; };
        const rgbToHex = (r,g,b) => '#'+[r,g,b].map(c=>Math.max(0,Math.min(255,Math.round(c))).toString(16).padStart(2,'0')).join('').toUpperCase();
        const rgbToHsv = (r,g,b) => {
            r/=255; g/=255; b/=255;
            const max=Math.max(r,g,b), min=Math.min(r,g,b), v=max, d=max-min, s=max===0?0:d/max;
            let h=0;
            if(d!==0){ if(max===r) h=((g-b)/d)%6; else if(max===g) h=(b-r)/d+2; else h=(r-g)/d+4; h*=60; if(h<0)h+=360; }
            return [h,s,v];
        };
        const hsvToRgb = (h,s,v) => {
            const c=v*s, x=c*(1-Math.abs(((h/60)%2)-1)), m=v-c;
            let r=0,g=0,b=0;
            if(h<60){r=c;g=x;}else if(h<120){r=x;g=c;}else if(h<180){g=c;b=x;}else if(h<240){g=x;b=c;}else if(h<300){r=x;b=c;}else{r=c;b=x;}
            return [Math.round((r+m)*255),Math.round((g+m)*255),Math.round((b+m)*255)];
        };

        let [r0,g0,b0] = hexToRgb(initialColor);
        let [curH,curS,curV] = rgbToHsv(r0,g0,b0);

        const popup = document.createElement('div');
        popup.className = 'rr-color-popup';
        popup.innerHTML = `
            <div class="rr-color-popup-row">
                <div class="rr-color-popup-preview" style="background:${initialColor};"></div>
                <input type="text" class="rr-color-popup-hex" value="${initialColor}" maxlength="7" spellcheck="false">
            </div>
            <div class="rr-color-popup-sv"><div class="rr-color-popup-sv-cursor"></div></div>
            <div class="rr-color-popup-hue"><div class="rr-color-popup-hue-cursor"></div></div>`;
        document.body.appendChild(popup);

        const hexInput  = popup.querySelector('.rr-color-popup-hex');
        const preview   = popup.querySelector('.rr-color-popup-preview');
        const svArea    = popup.querySelector('.rr-color-popup-sv');
        const svCursor  = popup.querySelector('.rr-color-popup-sv-cursor');
        const hueStrip  = popup.querySelector('.rr-color-popup-hue');
        const hueCursor = popup.querySelector('.rr-color-popup-hue-cursor');

        const refreshSv = () => { svArea.style.background=`linear-gradient(to bottom,transparent,#000),linear-gradient(to right,#fff,hsl(${curH},100%,50%))`; };
        const posCursors = () => { svCursor.style.left=`${curS*100}%`; svCursor.style.top=`${(1-curV)*100}%`; hueCursor.style.left=`${(curH/360)*100}%`; };

        const applyHsv = (src) => {
            const [r,g,b] = hsvToRgb(curH,curS,curV);
            const hex = rgbToHex(r,g,b);
            writeStored(hex);
            preview.style.background = hex;
            swatchEl.style.background = hex;
            if(src !== 'hex') hexInput.value = hex;
            this._drawProceduralPreview();
        };
        const applyHex = (hex) => {
            if(!/^#[0-9a-f]{6}$/i.test(hex)) return;
            hex = hex.toUpperCase();
            writeStored(hex);
            const [r,g,b] = hexToRgb(hex);
            const [h,s,v] = rgbToHsv(r,g,b);
            if(s>0.01) curH=h; curS=s; curV=v;
            preview.style.background=hex; swatchEl.style.background=hex;
            refreshSv(); posCursors(); this._drawProceduralPreview();
        };

        refreshSv(); posCursors();
        hexInput.addEventListener('input', () => { let v=hexInput.value.trim(); if(v&&v[0]!=='#') v='#'+v; applyHex(v); });

        const drag = (el, cb) => el.addEventListener('mousedown', (e) => {
            e.preventDefault(); cb(e);
            const mv=(e)=>cb(e), up=()=>{document.removeEventListener('mousemove',mv);document.removeEventListener('mouseup',up);};
            document.addEventListener('mousemove',mv); document.addEventListener('mouseup',up);
        });
        drag(svArea, (e) => { const rc=svArea.getBoundingClientRect(); curS=Math.max(0,Math.min(1,(e.clientX-rc.left)/rc.width)); curV=1-Math.max(0,Math.min(1,(e.clientY-rc.top)/rc.height)); posCursors(); applyHsv('sv'); });
        drag(hueStrip, (e) => { const rc=hueStrip.getBoundingClientRect(); curH=Math.max(0,Math.min(1,(e.clientX-rc.left)/rc.width))*360; refreshSv(); posCursors(); applyHsv('hue'); });

        const popW=popup.offsetWidth||232, popH=popup.offsetHeight||220;
        const rc=swatchEl.getBoundingClientRect();
        let px=rc.left+rc.width/2-popW/2, py=rc.bottom+6;
        px=Math.max(8,Math.min(px,window.innerWidth-popW-8));
        py=Math.max(8,Math.min(py,window.innerHeight-popH-8));
        popup.style.left=`${px}px`; popup.style.top=`${py}px`;

        const closeHandler=(e)=>{ if(popup.contains(e.target)||e.target===swatchEl) return; this._closeColorPicker(); };
        setTimeout(()=>document.addEventListener('click',closeHandler),0);
        popup._closeHandler=closeHandler;
        this._colorPopup=popup;
    }

    _closeColorPicker() {
        if(!this._colorPopup) return;
        if(this._colorPopup._closeHandler) document.removeEventListener('click',this._colorPopup._closeHandler);
        this._colorPopup.remove();
        this._colorPopup=null;
    }
}
