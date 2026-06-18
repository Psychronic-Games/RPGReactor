/**
 * OptionsManager - User preferences modal (File > Options).
 *
 * Persists choices to localStorage and applies them on page load (the early-
 * apply block at the bottom of this file runs before the DOM is fully painted
 * so the user never sees a theme flash).
 *
 * Categories so far: Appearance (theme + language).
 *
 * Theme architecture: themes are <palette> × <mode>. The persisted theme key
 * is the string the CSS expects under `data-theme` on <html>:
 *   - 'dark'              = Gold Dark (default, no attribute)
 *   - 'light'             = Gold Light
 *   - '<palette>-<mode>'  = any other palette/mode combination
 * THEME_PALETTES below is the registry to extend when adding new palettes.
 */
const THEME_PALETTES = [
    { id: 'gold',       nameKey: 'theme.gold.name',       descriptionKey: 'theme.gold.description',       colors: ['#d4af37', '#1b1b1b', '#f5e6a8'] },
    { id: 'bubblegum',  nameKey: 'theme.bubblegum.name',  descriptionKey: 'theme.bubblegum.description',  colors: ['#ff4fb8', '#2a1024', '#ffd1ec'] },
    { id: 'ocean',      nameKey: 'theme.ocean.name',      descriptionKey: 'theme.ocean.description',      colors: ['#2ea8ff', '#0d2438', '#bfe8ff'] },
    { id: 'cascadia',   nameKey: 'theme.cascadia.name',   descriptionKey: 'theme.cascadia.description',   colors: ['#4aa96c', '#10251b', '#c6f0d3'] },
    { id: 'underworld', nameKey: 'theme.underworld.name', descriptionKey: 'theme.underworld.description', colors: ['#c92535', '#1b080b', '#ffb3b9'] },
    { id: 'creamsicle', nameKey: 'theme.creamsicle.name', descriptionKey: 'theme.creamsicle.description', colors: ['#ff9f1c', '#fff0d6', '#6f3d00'] },
    { id: 'royalty',    nameKey: 'theme.royalty.name',    descriptionKey: 'theme.royalty.description',    colors: ['#7b4dff', '#21123f', '#f4c95d'] }
];

class OptionsManager {
    constructor() {
        this.modal = null;
        this.SETTINGS_KEY = 'rr-settings';
        this.settings = this._loadSettings();
        window.addEventListener('rr-language-changed', () => {
            if (this.modal && this.modal.style.display !== 'none') this._renderContent();
        });
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
        return { theme: 'dark', language: 'en' };
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

    applyLanguage(language) {
        const next = language || 'en';
        this.settings.language = next;
        this._saveSettings();
        if (window.I18n) window.I18n.setLanguage(next);
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
        const t = (key) => window.I18n ? window.I18n.t(key) : key;

        const swatchesHtml = (palette) => palette.colors.map(color =>
            `<span class="rr-opt-palette-swatch" style="background: ${color};"></span>`
        ).join('');

        const paletteOptionsHtml = THEME_PALETTES.map(p => `
            <button type="button" class="rr-opt-palette-item${p.id === currentPalette ? ' is-selected' : ''}" data-palette="${p.id}">
                <span class="rr-opt-palette-swatches">${swatchesHtml(p)}</span>
                <span>${t(p.nameKey)}</span>
            </button>
        `).join('');

        const languageOptionsHtml = (window.I18n ? window.I18n.languages() : [{ id: 'en', nativeName: 'English' }]).map(lang =>
            `<option value="${lang.id}" ${lang.id === (this.settings.language || 'en') ? 'selected' : ''}>${lang.flag ? lang.flag + ' ' : ''}${lang.nativeName}</option>`
        ).join('');

        const currentPaletteMeta = THEME_PALETTES.find(p => p.id === currentPalette) || THEME_PALETTES[0];
        const currentPaletteSwatches = swatchesHtml(currentPaletteMeta);

        this.modal.innerHTML = `
            <div class="rr-modal" style="width: 520px; max-height: 80vh; background: var(--color-bg-surface); border: 1px solid var(--color-border); border-radius: 6px; display: flex; flex-direction: column; box-shadow: var(--shadow-modal);">
                <div class="rr-modal-header" style="padding: 14px 18px; border-bottom: 1px solid var(--color-border-subtle); display: flex; justify-content: space-between; align-items: center; background: var(--color-bg-panel);">
                    <div class="rr-modal-title" style="font-size: 16px; font-weight: 600; color: var(--color-text-strong);">${t('options.title')}</div>
                    <button class="rr-modal-close" style="background: none; border: none; color: var(--color-text-muted); font-size: 22px; cursor: pointer; line-height: 1; padding: 0 4px;">&times;</button>
                </div>

                <div class="rr-modal-body" style="padding: 18px; overflow: visible;">
                    <div style="font-size: 11px; font-weight: 700; color: var(--color-accent-bright); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 12px; padding-bottom: 4px; border-bottom: 1px solid var(--color-accent-border-mid);">${t('options.appearance')}</div>

                    <div style="display: grid; grid-template-columns: 120px 1fr; gap: 12px 16px; align-items: center; padding: 6px 4px;">
                        <label style="font-size: 12px; color: var(--color-text-muted);">${t('options.language')}</label>
                        <select class="rr-opt-language" style="width: 100%; padding: 6px 8px; font-size: 12px;">
                            ${languageOptionsHtml}
                        </select>

                        <div style="grid-column: 2; font-size: 11px; color: var(--color-text-muted); margin-top: -4px;">${t('options.languageNote')}</div>

                        <label style="font-size: 12px; color: var(--color-text-muted);">${t('options.palette')}</label>
                        <div class="rr-opt-palette-wrap" data-rr-i18n-skip="true">
                            <input type="hidden" class="rr-opt-palette" value="${currentPalette}">
                            <button type="button" class="rr-opt-palette-trigger">
                                <span class="rr-opt-palette-trigger-content">
                                    <span class="rr-opt-palette-trigger-swatches">${currentPaletteSwatches}</span>
                                    <span class="rr-opt-palette-trigger-label">${t(currentPaletteMeta.nameKey)}</span>
                                </span>
                                <span class="rr-opt-palette-caret">▼</span>
                            </button>
                            <div class="rr-opt-palette-menu">
                                ${paletteOptionsHtml}
                            </div>
                        </div>

                        <label style="font-size: 12px; color: var(--color-text-muted);">${t('options.mode')}</label>
                        <div class="rr-opt-mode-toggle" style="display: inline-flex; gap: 0; border: 1px solid var(--color-border-input); border-radius: 4px; overflow: hidden; align-self: start; justify-self: start; width: max-content;">
                            <button type="button" data-mode="dark" class="rr-opt-mode-btn" style="padding: 6px 16px; background: ${currentMode === 'dark' ? 'var(--color-bg-button-active)' : 'var(--color-bg-button)'}; color: var(--color-text-strong); border: none; cursor: pointer; font-size: 12px; font-weight: 600;">${t('options.dark')}</button>
                            <button type="button" data-mode="light" class="rr-opt-mode-btn" style="padding: 6px 16px; background: ${currentMode === 'light' ? 'var(--color-bg-button-active)' : 'var(--color-bg-button)'}; color: var(--color-text-strong); border: none; border-left: 1px solid var(--color-border-input); cursor: pointer; font-size: 12px; font-weight: 600;">${t('options.light')}</button>
                        </div>

                        <div style="grid-column: 2; font-size: 11px; color: var(--color-text-muted); margin-top: -4px;" class="rr-opt-palette-desc">${t(currentPaletteMeta.descriptionKey)}</div>
                    </div>

                    <div style="font-size: 10px; color: var(--color-text-muted); margin-top: 14px; padding: 8px 4px 0; border-top: 1px solid var(--color-border-subtle);">${t('options.themeNote')}</div>
                </div>

                <div class="rr-modal-footer" style="padding: 12px 18px; border-top: 1px solid var(--color-border-subtle); background: var(--color-bg-panel); display: flex; justify-content: flex-end;">
                    <button class="rr-opt-done rr-btn-chip" style="padding: 6px 18px; color: var(--color-accent-bright);">${t('common.done')}</button>
                </div>
            </div>
        `;

        this.modal.querySelector('.rr-modal-close').addEventListener('click', () => this.close());
        this.modal.querySelector('.rr-opt-done').addEventListener('click', () => this.close());

        const paletteSelect = this.modal.querySelector('.rr-opt-palette');
        const paletteTrigger = this.modal.querySelector('.rr-opt-palette-trigger');
        const paletteMenu = this.modal.querySelector('.rr-opt-palette-menu');
        const paletteTriggerSwatches = this.modal.querySelector('.rr-opt-palette-trigger-swatches');
        const paletteTriggerLabel = this.modal.querySelector('.rr-opt-palette-trigger-label');
        const languageSelect = this.modal.querySelector('.rr-opt-language');
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

        languageSelect.addEventListener('change', () => {
            this.applyLanguage(languageSelect.value);
        });

        paletteTrigger.addEventListener('click', () => {
            paletteMenu.style.display = paletteMenu.style.display === 'block' ? 'none' : 'block';
        });

        this.modal.querySelectorAll('.rr-opt-palette-item').forEach(item => {
            item.addEventListener('click', () => {
                const meta = THEME_PALETTES.find(p => p.id === item.dataset.palette) || THEME_PALETTES[0];
                paletteSelect.value = meta.id;
                paletteTriggerSwatches.innerHTML = swatchesHtml(meta);
                paletteTriggerLabel.textContent = t(meta.nameKey);
                this.modal.querySelectorAll('.rr-opt-palette-item').forEach(btn => {
                    btn.classList.toggle('is-selected', btn === item);
                });
                if (paletteDesc) paletteDesc.textContent = t(meta.descriptionKey);
                paletteMenu.style.display = 'none';
                applyCurrentSelection();
            });
        });

        this.modal.querySelector('.rr-modal').addEventListener('click', (e) => {
            if (!e.target.closest('.rr-opt-palette-wrap')) paletteMenu.style.display = 'none';
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
        if (parsed && parsed.language && window.I18n) window.I18n.setLanguage(parsed.language, { persist: false, force: true });
        if (parsed && parsed.theme && parsed.theme !== 'dark') {
            document.documentElement.setAttribute('data-theme', parsed.theme);
        }
    } catch (e) { /* ignore */ }
})();
