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
// Each entry returns an SVG string at the requested pixel size. Stroke-based
// outline style with rounded joins; uses `currentColor` so the icon inherits
// the surrounding text color (typically var(--color-accent-bright)).
const FORGE_ICONS = {
    // Hammer-and-sickle, scaled directly from the canonical Soviet flag
    // emblem geometry. Combined bbox (57,20)→(521,522) in 550-canvas units
    // mapped to 22×22 with offset (+1.84, +1.00) — scale factor 0.0438.
    // Both shapes are filled silhouettes (currentColor); the sickle's coiled
    // grip detail is simplified to a stroke since it isn't visible at icon size.
    forge: (size) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" style="display: block;" aria-hidden="true"><path d="M 11 3 C 16 3, 21 7, 21 12 C 21 16, 18 20, 14 20 C 12 20, 10 19, 10 17 C 13 17, 16 16, 17 13 C 18 9, 15 5, 11 3 Z" fill="#ffd700"/><path d="M 11 18 L 8 22 L 6 21 L 10 17 Z" fill="#ffd700"/><ellipse cx="6" cy="21.5" rx="2" ry="1.3" fill="#ffd700"/><path d="M 7.03 4.43 L 6.29 5.18 L 4.31 7.16 L 1.83 9.64 L 4.55 12.36 L 7.03 9.88 L 20.16 23.01 A 1.40 1.40 0 0 0 22.15 23.01 A 1.40 1.40 0 0 0 22.15 21.03 L 9.01 7.90 L 9.76 7.16 L 12.00 4.93 Z" fill="#ffd700"/><path d="M 2.5 -0.5 Q 3.0 2.0 5.5 2.5 Q 3.0 3.0 2.5 5.5 Q 2.0 3.0 -0.5 2.5 Q 2.0 2.0 2.5 -0.5 Z" fill="#fff066"/></svg>`,

    // Person silhouette (head + shoulders).
    characterGenerator: (size) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" style="display: block;" aria-hidden="true"><circle cx="12" cy="7.5" r="4"/><path d="M4.5 21v-1a6 6 0 0 1 6-6h3a6 6 0 0 1 6 6v1"/></svg>`,

    // Clapperboard — universal "animation" symbol.
    animationGenerator: (size) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" style="display: block;" aria-hidden="true"><rect x="2.5" y="9" width="19" height="11.5" rx="1"/><path d="M2.5 9 L6 4 L22.5 4 L22.5 9 Z"/><line x1="8" y1="9" x2="11.5" y2="4"/><line x1="14" y1="9" x2="17.5" y2="4"/><line x1="20" y1="9" x2="22.2" y2="6.5"/></svg>`,

    // Speaker with two sound waves.
    soundEffectGenerator: (size) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" style="display: block;" aria-hidden="true"><path d="M11 5 L7 9 H3 V15 H7 L11 19 Z" fill="currentColor"/><path d="M15 9c1.6 1.6 1.6 4.4 0 6"/><path d="M18 6c3.2 3.2 3.2 8.8 0 12"/></svg>`,

    // Particle burst — core dot with radiating sparks of varied length.
    effekseerGenerator: (size) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" style="display: block;" aria-hidden="true"><circle cx="12" cy="12" r="2.4" fill="currentColor" stroke="none"/><line x1="12" y1="7.5" x2="12" y2="3.5"/><line x1="12" y1="16.5" x2="12" y2="20.5"/><line x1="7.5" y1="12" x2="3.5" y2="12"/><line x1="16.5" y1="12" x2="20.5" y2="12"/><line x1="8.8" y1="8.8" x2="6.6" y2="6.6"/><line x1="15.2" y1="15.2" x2="17.4" y2="17.4"/><line x1="15.2" y1="8.8" x2="16.8" y2="7.2"/><line x1="8.8" y1="15.2" x2="7.2" y2="16.8"/></svg>`
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
    }
    // Future tools register here.
];

class ForgeManager {
    constructor(projectController) {
        this.projectController = projectController;
        this.workspaceModal = null;
        this.activeToolId = null;
        // Tool instances are lazy-cached on this object via tool.getter.
        window.addEventListener('rr-language-changed', () => {
            if (this.workspaceModal && this.workspaceModal.style.display !== 'none') this._renderWorkspace();
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
        this._open();
        this._activateTool(toolId);
    }

    _open() {
        if (!this.workspaceModal) this._createWorkspace();
        this._renderWorkspace();
        this.workspaceModal.style.display = 'flex';
    }

    close() {
        if (this.activeToolId) {
            const tool = FORGE_TOOLS.find(t => t.id === this.activeToolId);
            const instance = tool && this[tool.getter];
            if (instance && typeof instance.detach === 'function') instance.detach();
        }
        if (this.workspaceModal) this.workspaceModal.style.display = 'none';
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
        if (this.workspaceModal && this.workspaceModal.style.display !== 'none') {
            this._renderWorkspace();
        }
    }

    _createWorkspace() {
        this.workspaceModal = document.createElement('div');
        this.workspaceModal.className = 'rr-modal-overlay forge-workspace-overlay';
        this.workspaceModal.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.7); display: none; align-items: center; justify-content: center; z-index: 10400;';
        // Intentionally NO click-outside-to-close: Forge tools hold in-progress
        // work (character composites, future canvas edits, etc.) so the user
        // closes via the [×] button. Don't risk an accidental click on the
        // dimmed area discarding work.
        document.body.appendChild(this.workspaceModal);
    }

    _renderWorkspace() {
        const sidebarHtml = FORGE_TOOLS.map(tool => {
            const active = tool.id === this.activeToolId;
            const name = this._t(tool.nameKey);
            return `
                <div class="rr-forge-sidebar-item" data-tool-id="${tool.id}" style="padding: 10px 14px; cursor: pointer; font-size: 12px; color: var(--color-text); background: ${active ? 'var(--color-bg-hover)' : 'transparent'}; border-left: 3px solid ${active ? 'var(--color-accent-bright)' : 'transparent'}; display: flex; align-items: center; gap: 8px;">
                    <span style="line-height: 1; color: var(--color-accent-bright); flex-shrink: 0; width: 18px; height: 18px; display: inline-flex; align-items: center; justify-content: center;">${tool.icon(18)}</span>
                    <span>${name}</span>
                </div>
            `;
        }).join('');

        const activeTool = FORGE_TOOLS.find(t => t.id === this.activeToolId);
        const titleSuffix = activeTool ? ` | ${this._t(activeTool.nameKey)}` : '';

        this.workspaceModal.innerHTML = `
            <div class="rr-modal" style="width: 98vw; height: 96vh; background: var(--color-bg-surface); border: 1px solid var(--color-border); border-radius: 8px; display: flex; flex-direction: column; box-shadow: var(--shadow-modal); overflow: hidden;">
                <div class="rr-modal-header" style="padding: 12px 18px; border-bottom: 1px solid var(--color-border-subtle); background: var(--color-bg-toolbar); display: flex; justify-content: space-between; align-items: center; border-radius: 8px 8px 0 0; flex-shrink: 0;">
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <span style="color: var(--color-accent-bright); line-height: 1; display: inline-flex;">${FORGE_ICONS.forge(22)}</span>
                        <div class="rr-modal-title" style="font-size: 15px; font-weight: 700; color: var(--color-text-strong);">${this._t('menu.forge')}${titleSuffix}</div>
                    </div>
                    <button class="rr-forge-close" style="background: none; border: none; color: var(--color-text-muted); font-size: 22px; cursor: pointer; line-height: 1;">&times;</button>
                </div>

                <div style="display: grid; grid-template-columns: 200px 1fr; flex: 1; min-height: 0;">
                    <div class="rr-forge-sidebar" style="background: var(--color-bg-panel); border-right: 1px solid var(--color-border); overflow-y: auto; padding: 8px 0;">
                        <div style="padding: 6px 14px 8px; font-size: 9px; font-weight: 700; color: var(--color-accent-bright); text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 1px solid var(--color-border-subtle);">${this._t('forge.tools')}</div>
                        ${sidebarHtml}
                    </div>
                    <div class="rr-forge-content" style="overflow: hidden; min-width: 0; display: flex; flex-direction: column;">
                        ${this.activeToolId ? '' : this._renderWelcome()}
                    </div>
                </div>
            </div>
        `;

        this.workspaceModal.querySelector('.rr-forge-close').addEventListener('click', () => this.close());

        this.workspaceModal.querySelectorAll('.rr-forge-sidebar-item').forEach(el => {
            el.addEventListener('mouseenter', () => {
                if (el.dataset.toolId !== this.activeToolId) el.style.background = 'var(--color-bg-hover)';
            });
            el.addEventListener('mouseleave', () => {
                if (el.dataset.toolId !== this.activeToolId) el.style.background = 'transparent';
            });
            el.addEventListener('click', () => this._activateTool(el.dataset.toolId));
        });

        // Welcome-screen tile clicks (only present when no tool is active).
        this.workspaceModal.querySelectorAll('.rr-forge-tile').forEach(tile => {
            tile.addEventListener('mouseenter', () => {
                tile.style.borderColor = 'var(--color-accent-border-strong)';
                tile.style.background = 'var(--color-bg-hover)';
            });
            tile.addEventListener('mouseleave', () => {
                tile.style.borderColor = 'var(--color-border)';
                tile.style.background = 'var(--color-bg-panel)';
            });
            tile.addEventListener('click', () => this._activateTool(tile.dataset.toolId));
        });

        // Re-mount the active tool's UI if there was one (e.g. after a re-render).
        if (this.activeToolId) {
            const contentEl = this.workspaceModal.querySelector('.rr-forge-content');
            const tool = FORGE_TOOLS.find(t => t.id === this.activeToolId);
            if (tool && contentEl) {
                if (!this[tool.getter]) this[tool.getter] = tool.ctor();
                this[tool.getter].renderInto(contentEl, this.projectController);
            }
        }
    }

    _renderWelcome() {
        const tilesHtml = FORGE_TOOLS.map(tool => `
            <button class="rr-forge-tile" data-tool-id="${tool.id}" style="display: flex; flex-direction: column; gap: 8px; align-items: center; padding: 18px; background: var(--color-bg-panel); border: 1px solid var(--color-border); border-radius: 6px; cursor: pointer; transition: border-color var(--ease-base), background var(--ease-base); width: 200px; text-align: center;">
                <div style="line-height: 1; color: var(--color-accent-bright); display: inline-flex;">${tool.icon(40)}</div>
                <div style="font-size: 13px; font-weight: 700; color: var(--color-text-strong);">${this._t(tool.nameKey)}</div>
                <div style="font-size: 11px; color: var(--color-text-muted); line-height: 1.4;">${this._t(tool.descriptionKey)}</div>
            </button>
        `).join('');

        // Inline script not used — wire events after innerHTML in _renderWorkspace.
        // We return the welcome HTML and wire tile handlers in a postprocess hook.
        return `
            <div class="rr-forge-welcome" style="padding: 40px; display: flex; flex-direction: column; gap: 20px; align-items: center; justify-content: flex-start;">
                <div style="text-align: center; display: flex; flex-direction: column; align-items: center;">
                    <div style="color: var(--color-accent-bright); margin-bottom: 8px; display: inline-flex;">${FORGE_ICONS.forge(44)}</div>
                    <div style="font-size: 18px; font-weight: 700; color: var(--color-text-strong);">${this._t('menu.forge')}</div>
                    <div style="font-size: 12px; color: var(--color-text-muted); margin-top: 4px;">${this._t('forge.welcome')}</div>
                </div>
                <div class="rr-forge-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 16px; max-width: 700px; width: 100%;">
                    ${tilesHtml}
                </div>
            </div>
        `;
    }

    _activateTool(toolId) {
        const tool = FORGE_TOOLS.find(t => t.id === toolId);
        if (!tool) return;

        // Detach the previously-active tool (stop timers etc.) before swapping.
        if (this.activeToolId && this.activeToolId !== toolId) {
            const prev = FORGE_TOOLS.find(t => t.id === this.activeToolId);
            const prevInstance = prev && this[prev.getter];
            if (prevInstance && typeof prevInstance.detach === 'function') prevInstance.detach();
        }

        if (!this[tool.getter]) this[tool.getter] = tool.ctor();
        this.activeToolId = toolId;
        this._renderWorkspace();
    }
}
