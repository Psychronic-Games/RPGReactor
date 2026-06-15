/**
 * OptionsManager - User preferences modal (File > Options).
 *
 * Persists choices to localStorage and applies them on page load (the early-
 * apply block at the bottom of this file runs before the DOM is fully painted
 * so the user never sees a theme flash).
 *
 * Categories so far: Appearance (theme).
 *
 * Theme architecture: themes are <palette> × <mode>. The persisted theme key
 * is the string the CSS expects under `data-theme` on <html>:
 *   - 'dark'              = Gold Dark (default, no attribute)
 *   - 'light'             = Gold Light
 *   - '<palette>-<mode>'  = any other palette/mode combination
 * THEME_PALETTES below is the registry to extend when adding new palettes.
 */
const THEME_PALETTES = [
    { id: 'gold',       name: 'Default',             description: 'Classic gold-on-black premium editor' },
    { id: 'bubblegum',  name: 'Bubblegum',           description: 'Cute hot-pink palette' },
    { id: 'ocean',      name: 'Ocean',               description: 'Cool sky-blue palette' },
    { id: 'cascadia',   name: 'Cascadia',            description: 'Pacific NW evergreen forest green palette' },
    { id: 'underworld', name: 'Underworld',          description: 'Blood-red crimson palette' },
    { id: 'creamsicle', name: 'Orange Creamsicle',   description: 'Tangerine orange on warm cream' },
    { id: 'royalty',    name: 'Royalty',             description: 'Royal purple primary with gold trim' }
];

class OptionsManager {
    constructor() {
        this.modal = null;
        this.SETTINGS_KEY = 'rr-settings';
        this.settings = this._loadSettings();
    }

    /** Convert a saved theme key into its {palette, mode} pair. */
    _parseTheme(themeKey) {
        if (!themeKey || themeKey === 'dark') return { palette: 'gold', mode: 'dark' };
        if (themeKey === 'light') return { palette: 'gold', mode: 'light' };
        const dash = themeKey.lastIndexOf('-');
        if (dash < 0) return { palette: 'gold', mode: 'dark' };
        return { palette: themeKey.slice(0, dash), mode: themeKey.slice(dash + 1) };
    }

    /** Inverse of _parseTheme — returns the CSS-facing data-theme value. */
    _buildThemeKey(palette, mode) {
        if (palette === 'gold' && mode === 'dark') return 'dark';
        if (palette === 'gold' && mode === 'light') return 'light';
        return `${palette}-${mode}`;
    }

    /** Defaults; merged over whatever's saved. */
    _defaultSettings() {
        return { theme: 'dark' };
    }

    _loadSettings() {
        try {
            const raw = localStorage.getItem(this.SETTINGS_KEY);
            if (!raw) return this._defaultSettings();
            return { ...this._defaultSettings(), ...JSON.parse(raw) };
        } catch (e) {
            return this._defaultSettings();
        }
    }

    _saveSettings() {
        try {
            localStorage.setItem(this.SETTINGS_KEY, JSON.stringify(this.settings));
        } catch (e) { /* localStorage full or disabled — ignore */ }
    }

    /**
     * Apply a theme by name. 'dark' is the default `:root` block; any other
     * value sets `data-theme` on <html> so the matching block in theme.css wins.
     */
    applyTheme(themeName) {
        const html = document.documentElement;
        if (themeName === 'dark' || !themeName) {
            html.removeAttribute('data-theme');
        } else {
            html.setAttribute('data-theme', themeName);
        }
        this.settings.theme = themeName || 'dark';
        this._saveSettings();
    }

    show() {
        if (!this.modal) this._createModal();
        this._renderContent();
        this.modal.style.display = 'flex';
    }

    close() {
        if (this.modal) this.modal.style.display = 'none';
    }

    _createModal() {
        this.modal = document.createElement('div');
        this.modal.className = 'rr-modal-overlay options-modal-overlay';
        this.modal.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.6); display: none; align-items: center; justify-content: center; z-index: 10500;';

        this.modal.addEventListener('click', (e) => {
            if (e.target === this.modal) this.close();
        });

        document.body.appendChild(this.modal);
    }

    _renderContent() {
        const { palette: currentPalette, mode: currentMode } = this._parseTheme(this.settings.theme);

        const paletteOptionsHtml = THEME_PALETTES.map(p =>
            `<option value="${p.id}" ${p.id === currentPalette ? 'selected' : ''}>${p.name}</option>`
        ).join('');

        const currentPaletteMeta = THEME_PALETTES.find(p => p.id === currentPalette) || THEME_PALETTES[0];

        this.modal.innerHTML = `
            <div class="rr-modal" style="width: 520px; max-height: 80vh; background: var(--color-bg-surface); border: 1px solid var(--color-border); border-radius: 6px; display: flex; flex-direction: column; box-shadow: var(--shadow-modal);">
                <div class="rr-modal-header" style="padding: 14px 18px; border-bottom: 1px solid var(--color-border-subtle); display: flex; justify-content: space-between; align-items: center; background: var(--color-bg-panel);">
                    <div class="rr-modal-title" style="font-size: 16px; font-weight: 600; color: var(--color-text-strong);">Options</div>
                    <button class="rr-modal-close" style="background: none; border: none; color: var(--color-text-muted); font-size: 22px; cursor: pointer; line-height: 1; padding: 0 4px;">&times;</button>
                </div>

                <div class="rr-modal-body" style="padding: 18px; overflow-y: auto;">
                    <div style="font-size: 11px; font-weight: 700; color: var(--color-accent-bright); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 12px; padding-bottom: 4px; border-bottom: 1px solid var(--color-accent-border-mid);">Appearance</div>

                    <div style="display: grid; grid-template-columns: 120px 1fr; gap: 12px 16px; align-items: center; padding: 6px 4px;">
                        <label style="font-size: 12px; color: var(--color-text-muted);">Palette</label>
                        <select class="rr-opt-palette" style="width: 100%; padding: 6px 8px; font-size: 12px;">
                            ${paletteOptionsHtml}
                        </select>

                        <label style="font-size: 12px; color: var(--color-text-muted);">Mode</label>
                        <div class="rr-opt-mode-toggle" style="display: inline-flex; gap: 0; border: 1px solid var(--color-border-input); border-radius: 4px; overflow: hidden; align-self: start; justify-self: start; width: max-content;">
                            <button type="button" data-mode="dark" class="rr-opt-mode-btn" style="padding: 6px 16px; background: ${currentMode === 'dark' ? 'var(--color-bg-button-active)' : 'var(--color-bg-button)'}; color: var(--color-text-strong); border: none; cursor: pointer; font-size: 12px; font-weight: 600;">Dark</button>
                            <button type="button" data-mode="light" class="rr-opt-mode-btn" style="padding: 6px 16px; background: ${currentMode === 'light' ? 'var(--color-bg-button-active)' : 'var(--color-bg-button)'}; color: var(--color-text-strong); border: none; border-left: 1px solid var(--color-border-input); cursor: pointer; font-size: 12px; font-weight: 600;">Light</button>
                        </div>

                        <div style="grid-column: 2; font-size: 11px; color: var(--color-text-muted); margin-top: -4px;" class="rr-opt-palette-desc">${currentPaletteMeta.description}</div>
                    </div>

                    <div style="font-size: 10px; color: var(--color-text-muted); margin-top: 14px; padding: 8px 4px 0; border-top: 1px solid var(--color-border-subtle);">Theme applies immediately. Re-open any open editor tabs to refresh canvas-drawn elements.</div>
                </div>

                <div class="rr-modal-footer" style="padding: 12px 18px; border-top: 1px solid var(--color-border-subtle); background: var(--color-bg-panel); display: flex; justify-content: flex-end;">
                    <button class="rr-opt-done rr-btn-chip" style="padding: 6px 18px; color: var(--color-accent-bright);">Done</button>
                </div>
            </div>
        `;

        this.modal.querySelector('.rr-modal-close').addEventListener('click', () => this.close());
        this.modal.querySelector('.rr-opt-done').addEventListener('click', () => this.close());

        const paletteSelect = this.modal.querySelector('.rr-opt-palette');
        const modeButtons = this.modal.querySelectorAll('.rr-opt-mode-btn');
        const paletteDesc = this.modal.querySelector('.rr-opt-palette-desc');

        const applyCurrentSelection = () => {
            const palette = paletteSelect.value;
            const activeMode = this.modal.querySelector('.rr-opt-mode-btn[data-active="true"]')?.dataset.mode || currentMode;
            this.applyTheme(this._buildThemeKey(palette, activeMode));
        };

        // Init mode-button active state (matches the radio "checked" semantics)
        modeButtons.forEach(btn => {
            if (btn.dataset.mode === currentMode) btn.dataset.active = 'true';
        });

        paletteSelect.addEventListener('change', () => {
            const meta = THEME_PALETTES.find(p => p.id === paletteSelect.value);
            if (paletteDesc && meta) paletteDesc.textContent = meta.description;
            applyCurrentSelection();
        });

        modeButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                modeButtons.forEach(b => {
                    b.dataset.active = (b === btn) ? 'true' : 'false';
                    b.style.background = (b === btn) ? 'var(--color-bg-button-active)' : 'var(--color-bg-button)';
                });
                applyCurrentSelection();
            });
        });
    }
}

// Early theme apply — runs at script load, before any view paints.
// Reads the persisted theme so the user never sees a flash of the wrong theme.
(function () {
    try {
        const raw = localStorage.getItem('rr-settings');
        if (!raw) return;
        const parsed = JSON.parse(raw);
        if (parsed && parsed.theme && parsed.theme !== 'dark') {
            document.documentElement.setAttribute('data-theme', parsed.theme);
        }
    } catch (e) { /* ignore */ }
})();
