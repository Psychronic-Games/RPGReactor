/**
 * ForgeManager - Top-level controller for the Forge tool suite.
 *
 * UI shape (modeled on the Database editor): a single workspace modal with a
 * left sidebar listing every Forge tool and a main content area where the
 * active tool's UI renders. Clicking a sidebar entry swaps the active tool.
 *
 * Tools follow a small contract:
 *   class MyTool {
 *     renderInto(contentEl, projectController) { ... }   // build UI inside contentEl
 *     detach() { ... }                                    // optional: cleanup timers, etc.
 *   }
 *
 * Project-side data layout (under <projectPath>/forge/):
 *   forge/
 *     character_generator/
 *       styles/<style>/parts/<category>/*.{png,js}
 *       parts/<category>/*.png   (legacy Complex-template path; still scanned)
 *       config.json
 *     ... (future tools)
 *
 * Adding a tool: drop a class in src/forge/<ToolName>/, register an entry in
 * FORGE_TOOLS below. The launcher picks it up; the sidebar shows it; the
 * tool gets its own project-side data subfolder.
 */

// ─── Forge icon set (inline SVG, currentColor) ───────────────────────────────
// Each entry returns icon markup at the requested pixel size. Tool glyphs
// inherit currentColor; brand marks keep the luminous editor palette.
const FORGE_ICONS = {
    // A large gold anvil and curved four-point spark remain clear at 22px.
    forge: (size) => `<img src="images/icon-forge.svg" width="${size}" height="${size}" style="display: block;" alt="">`,

    // Person silhouette (head + shoulders).
    characterGenerator: (size) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" style="display: block;" aria-hidden="true"><circle cx="12" cy="7.5" r="4"/><path d="M4.5 21v-1a6 6 0 0 1 6-6h3a6 6 0 0 1 6 6v1"/></svg>`,

    // Clapperboard — universal "animation" symbol.
    // A figure in front of a cube's edges: a body built in 3D.
    character3dBuilder: (size) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" style="display: block;" aria-hidden="true"><path d="M3 7.5 L9 4.5 L15 7.5"/><path d="M3 7.5 V15"/><circle cx="15" cy="9" r="2.6"/><path d="M10.5 21v-1.5a4.5 4.5 0 0 1 9 0V21"/><path d="M15 13.5v3"/></svg>`,

    // A flag flying from its pole.
    propBuilder: (size) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" style="display: block;" aria-hidden="true"><path d="M5 21V3"/><path d="M5 4c3-1.5 5 1.5 8 0s4.5-.5 6 .5v8c-1.5-1-3-1.5-6 0s-5-1.5-8 0"/></svg>`,

    animationGenerator: (size) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" style="display: block;" aria-hidden="true"><rect x="2.5" y="9" width="19" height="11.5" rx="1"/><path d="M2.5 9 L6 4 L22.5 4 L22.5 9 Z"/><line x1="8" y1="9" x2="11.5" y2="4"/><line x1="14" y1="9" x2="17.5" y2="4"/><line x1="20" y1="9" x2="22.2" y2="6.5"/></svg>`,

    // Speaker with two sound waves.
    soundEffectGenerator: (size) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" style="display: block;" aria-hidden="true"><path d="M11 5 L7 9 H3 V15 H7 L11 19 Z" fill="currentColor"/><path d="M15 9c1.6 1.6 1.6 4.4 0 6"/><path d="M18 6c3.2 3.2 3.2 8.8 0 12"/></svg>`,

    // Particle burst — core dot with radiating sparks of varied length.
    effekseerGenerator: (size) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" style="display: block;" aria-hidden="true"><circle cx="12" cy="12" r="2.4" fill="currentColor" stroke="none"/><line x1="12" y1="7.5" x2="12" y2="3.5"/><line x1="12" y1="16.5" x2="12" y2="20.5"/><line x1="7.5" y1="12" x2="3.5" y2="12"/><line x1="16.5" y1="12" x2="20.5" y2="12"/><line x1="8.8" y1="8.8" x2="6.6" y2="6.6"/><line x1="15.2" y1="15.2" x2="17.4" y2="17.4"/><line x1="15.2" y1="8.8" x2="16.8" y2="7.2"/><line x1="8.8" y1="15.2" x2="7.2" y2="16.8"/></svg>`,

    // Wrench over a document — a tool that comes from the project, not the editor.
    projectTools: (size) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" style="display: block;" aria-hidden="true"><path d="M13.5 3.5H6.5A1.5 1.5 0 0 0 5 5v14a1.5 1.5 0 0 0 1.5 1.5h6"/><path d="M13.5 3.5 18 8v3"/><path d="M13.5 3.5V8H18"/><path d="M20.2 14.1a2.6 2.6 0 0 1-3.3 3.3l-2.6 2.6a1.1 1.1 0 0 1-1.6-1.6l2.6-2.6a2.6 2.6 0 0 1 3.3-3.3l-1.5 1.5 1.6 1.6z"/></svg>`
};

const FORGE_TOOLS = [
    {
        id: 'character-generator',
        nameKey: 'menu.characterGenerator',
        descriptionKey: 'forge.characterGenerator.description',
        icon: FORGE_ICONS.characterGenerator,
        ctor: () => new CharacterGenerator(),
        getter: 'characterGenerator'
    },
    {
        id: 'character-3d-builder',
        nameKey: 'menu.character3dBuilder',
        descriptionKey: 'forge.character3dBuilder.description',
        icon: FORGE_ICONS.character3dBuilder,
        ctor: () => new Character3DBuilder(),
        getter: 'character3dBuilder'
    },
    {
        id: 'prop-builder',
        nameKey: 'menu.propBuilder',
        descriptionKey: 'forge.propBuilder.description',
        icon: FORGE_ICONS.propBuilder,
        ctor: () => new PropBuilder(),
        getter: 'propBuilder'
    },
    {
        id: 'animation-generator',
        nameKey: 'menu.animationGenerator',
        descriptionKey: 'forge.animationGenerator.description',
        icon: FORGE_ICONS.animationGenerator,
        ctor: () => new AnimationGenerator(),
        getter: 'animationGenerator'
    },
    {
        id: 'effekseer-generator',
        nameKey: 'menu.effekseerGenerator',
        descriptionKey: 'forge.effekseerGenerator.description',
        icon: FORGE_ICONS.effekseerGenerator,
        ctor: () => new EffekseerGenerator(),
        getter: 'effekseerGenerator'
    },
    {
        id: 'sound-effect-generator',
        nameKey: 'menu.soundEffectGenerator',
        descriptionKey: 'forge.soundEffectGenerator.description',
        icon: FORGE_ICONS.soundEffectGenerator,
        ctor: () => new SoundEffectGenerator(),
        getter: 'soundEffectGenerator'
    },
    {
        id: 'project-tools',
        nameKey: 'menu.projectTools',
        descriptionKey: 'forge.projectTools.description',
        icon: FORGE_ICONS.projectTools,
        ctor: () => new ProjectTools(),
        getter: 'projectTools'
    }
    // Future tools register here.
];

class ForgeManager {
    constructor(projectController) {
        this.projectController = projectController;
        this.workspaceModal = null;
        this.activeToolId = null;
        this._mountedTool = null;
        window.addEventListener('rr-forge-docked', () => {
            // A destroyed native window loses its DOM listeners. Rebuild the shell before reopening.
            const shown = this.workspaceModal && this.workspaceModal.style.display !== 'none';
            this._detachTool();
            this.workspaceModal?.remove();
            this.workspaceModal = null;
            if (shown) this._open();
        });
        // Tool instances are lazy-cached on this object via tool.getter.
        window.addEventListener('rr-language-changed', () => {
            if (!this.workspaceModal || this.workspaceModal.style.display === 'none') return;
            // A tool with work in hand that a re-mount would throw away (a running project tool) keeps
            // its page: only the workspace's own words change.
            const tool = FORGE_TOOLS.find(t => t.id === this.activeToolId), instance = tool && this[tool.getter];
            if (instance && typeof instance.holdsWork === 'function' && instance.holdsWork()) this._relabelWorkspace();
            else this._renderWorkspace();
        });
    }

    _t(key) {
        return window.I18n ? window.I18n.t(key) : key;
    }

    /** Open the workspace (called by toolbar button + File>Forge>Forge Launcher). */
    showLauncher() {
        this._open();
    }

    /** Open the workspace and activate a specific tool by id. */
    openTool(toolId) {
        if (FORGE_TOOLS.some(tool => tool.id === toolId)) this._open(toolId);
    }

    _open(toolId = this.activeToolId) {
        // The sidebar is the one list of tools: the Forge opens on the last tool used, else the first.
        if (!FORGE_TOOLS.some(tool => tool.id === toolId)) toolId = FORGE_TOOLS[0].id;
        if (!this.workspaceModal) this._createWorkspace();
        const shownBefore = this.workspaceModal.style.display !== 'none';
        if (!shownBefore || toolId !== this.activeToolId) {
            this.activeToolId = toolId;
            this._renderWorkspace();
        }
        this.workspaceModal.style.display = 'flex';
        if (typeof RRForgeWindow !== 'undefined') RRForgeWindow.open(this.workspaceModal, { shownBefore });
    }

    _detachTool() {
        if (this._mountedTool && typeof this._mountedTool.detach === 'function') this._mountedTool.detach();
        this._mountedTool = null;
    }

    close() {
        this._detachTool();
        if (this.workspaceModal) this.workspaceModal.style.display = 'none';
        if (typeof RRForgeWindow !== 'undefined') RRForgeWindow.hidePopout();
    }

    /**
     * Escape, the × and the window's own close: the Forge closes, first asking
     * whether to drop the work a tool holds unsaved. Resolves whether it closed.
     */
    async requestClose() {
        if (!this.workspaceModal || this.workspaceModal.style.display === 'none') return false;
        const tool = FORGE_TOOLS.find(entry => entry.id === this.activeToolId);
        const instance = tool && this[tool.getter];
        if (instance && typeof instance.holdsWork === 'function' && instance.holdsWork()) {
            const tt = text => (window.I18n ? window.I18n.tText(text) : text);
            const discard = typeof RRDialog === 'undefined' ? false : await RRDialog.confirm(
                `${tt('Discard the unsaved changes in')} ${this._t(tool.nameKey)}?`,
                { title: tt('Unsaved Changes'), ok: tt('Discard Changes'), danger: true });
            if (!discard) return false;
        }
        this.close();
        return true;
    }

    /**
     * Drop cached tool state when the open project changes so saves/loads
     * never target a previous project's path.
     */
    onProjectChanged() {
        for (const tool of FORGE_TOOLS) {
            const instance = this[tool.getter];
            if (!instance) continue;
            if (typeof instance.detach === 'function') instance.detach();
            if ('projectPath' in instance) instance.projectPath = null;
            if (instance.imageCache && typeof instance.imageCache.clear === 'function') instance.imageCache.clear();
        }
        this._mountedTool = null;
        if (this.workspaceModal && this.workspaceModal.style.display !== 'none') {
            this._renderWorkspace();
        }
    }

    _createWorkspace() {
        this.workspaceModal = document.createElement('div');
        this.workspaceModal.id = 'forge-workspace';
        this.workspaceModal.className = 'rr-modal-overlay forge-workspace-overlay';
        this.workspaceModal.style.display = 'none';
        // Keep the frame itself mounted: its drag handlers, size observer and native window
        // belong to this panel, even when a tool or the language changes inside it.
        this.workspaceModal.innerHTML = `
            <div class="rr-modal rr-forge-window">
                <div class="rr-modal-header">
                    <div class="rr-forge-heading">
                        <span class="rr-forge-brand">${FORGE_ICONS.forge(22)}</span>
                        <div class="rr-modal-title"></div>
                    </div>
                    <button type="button" class="rr-forge-close" aria-label="${this._t('common.close')}">&times;</button>
                </div>
                <div class="rr-forge-workspace-body"></div>
            </div>`;
        this.workspaceModal.querySelector('.rr-forge-close').addEventListener('click', () => this.requestClose());
        document.body.appendChild(this.workspaceModal);
        if (typeof RRForgeWindow !== 'undefined') RRForgeWindow.install(this.workspaceModal);
        window.RRKeyboardNavigation?.modal(this.workspaceModal, { onEscape: () => this.requestClose() });
    }

    _renderWorkspace() {
        this._detachTool();
        const sidebarHtml = FORGE_TOOLS.map(tool => {
            const active = tool.id === this.activeToolId;
            const name = this._t(tool.nameKey);
            return `
                <div class="rr-forge-sidebar-item" data-tool-id="${tool.id}" title="${this._t(tool.descriptionKey).replace(/"/g, '&quot;')}" style="padding: 10px 14px; cursor: pointer; font-size: 12px; color: var(--color-text); background: ${active ? 'var(--color-bg-hover)' : 'transparent'}; border-left: 3px solid ${active ? 'var(--color-accent-bright)' : 'transparent'}; display: flex; align-items: center; gap: 8px;">
                    <span style="line-height: 1; color: var(--color-accent-bright); flex-shrink: 0; width: 18px; height: 18px; display: inline-flex; align-items: center; justify-content: center;">${tool.icon(18)}</span>
                    <span class="rr-forge-sidebar-name">${name}</span>
                </div>
            `;
        }).join('');

        const activeTool = FORGE_TOOLS.find(t => t.id === this.activeToolId);
        const titleSuffix = activeTool ? ` | ${this._t(activeTool.nameKey)}` : '';

        this.workspaceModal.querySelector('.rr-modal-title').textContent = this._t('menu.forge') + titleSuffix;
        this.workspaceModal.querySelector('.rr-forge-close').setAttribute('aria-label', this._t('common.close'));
        this.workspaceModal.querySelector('.rr-forge-workspace-body').innerHTML = `
                    <div class="rr-forge-sidebar" style="background: var(--color-bg-panel); border-right: 1px solid var(--color-border); overflow-y: auto; padding: 8px 0;">
                        <div style="padding: 6px 14px 8px; font-size: 9px; font-weight: 700; color: var(--color-accent-bright); text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 1px solid var(--color-border-subtle);">${this._t('forge.tools')}</div>
                        ${sidebarHtml}
                    </div>
                    <div class="rr-forge-content" style="overflow: hidden; min-width: 0; display: flex; flex-direction: column;"></div>
        `;

        this.workspaceModal.querySelectorAll('.rr-forge-sidebar-item').forEach(el => {
            el.addEventListener('mouseenter', () => {
                if (el.dataset.toolId !== this.activeToolId) el.style.background = 'var(--color-bg-hover)';
            });
            el.addEventListener('mouseleave', () => {
                if (el.dataset.toolId !== this.activeToolId) el.style.background = 'transparent';
            });
            el.addEventListener('click', () => this._activateTool(el.dataset.toolId));
        });

        // Re-mount the active tool's UI if there was one (e.g. after a re-render).
        if (this.activeToolId) {
            const contentEl = this.workspaceModal.querySelector('.rr-forge-content');
            const tool = FORGE_TOOLS.find(t => t.id === this.activeToolId);
            if (tool && contentEl) {
                if (!this[tool.getter]) this[tool.getter] = tool.ctor();
                this[tool.getter].renderInto(contentEl, this.projectController);
                this._mountedTool = this[tool.getter];
            }
        }
    }

    /** The workspace's own words in the language now set, leaving the active tool's page as it is. */
    _relabelWorkspace() {
        const activeTool = FORGE_TOOLS.find(t => t.id === this.activeToolId);
        const title = this.workspaceModal.querySelector('.rr-modal-title');
        if (title) title.textContent = this._t('menu.forge') + (activeTool ? ` | ${this._t(activeTool.nameKey)}` : '');
        this.workspaceModal.querySelectorAll('.rr-forge-sidebar-item').forEach(el => {
            const tool = FORGE_TOOLS.find(t => t.id === el.dataset.toolId), name = el.querySelector('.rr-forge-sidebar-name');
            if (tool && name) name.textContent = this._t(tool.nameKey);
        });
    }

    _activateTool(toolId) {
        const tool = FORGE_TOOLS.find(t => t.id === toolId);
        if (!tool || this.activeToolId === toolId) return;

        if (!this[tool.getter]) this[tool.getter] = tool.ctor();
        this.activeToolId = toolId;
        this._renderWorkspace();
    }
}
