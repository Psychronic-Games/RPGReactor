class BuildManager {
    constructor() {
        this.isBuilding = false;
        this.modal = null;
        this.worker = null;
        this.downloadProgressRows = new Map();
        this.setupModal();
    }

    setupModal() {
        // Create build modal HTML
        const modalHTML = `
            <div id="build-modal" style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background-color: rgba(0, 0, 0, 0.8); display: none; justify-content: center; align-items: center; z-index: 10001;">
                <div style="background-color: var(--color-bg-surface); border: 1px solid var(--color-border); border-radius: 8px; width: 90%; max-width: 1100px; height: 80vh; max-height: 700px; display: flex; flex-direction: column; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);">
                    <div style="background-color: var(--color-bg-panel); padding: 12px 16px; border-bottom: 1px solid var(--color-border); display: flex; justify-content: space-between; align-items: center; border-radius: 8px 8px 0 0;">
                        <div style="font-size: 16px; font-weight: 600; color: var(--color-text);">Deploy Game</div>
                        <button id="build-modal-close-btn" style="background: none; border: none; color: var(--color-text-muted); font-size: 24px; cursor: pointer; padding: 0; width: 30px; height: 30px; line-height: 1;">×</button>
                    </div>

                    <div style="flex: 1; display: flex; gap: 20px; padding: 20px; overflow: hidden; min-height: 0;">
                        <!-- Left Column: Build Options -->
                        <div style="flex: 0 0 380px; overflow-y: auto;">
                            <div style="margin-bottom: 20px;">
                                <h3 style="color: var(--color-text); margin-bottom: 10px; font-size: 15px;">Select Platform(s)</h3>
                                <div style="display: flex; flex-direction: column; gap: 6px;">
                                    <label class="build-option-label" style="display: flex; align-items: center; padding: 8px 10px; background: var(--color-bg-panel); border: 1px solid var(--color-border); border-radius: 4px; cursor: pointer; transition: all 0.2s;">
                                        <input type="checkbox" id="build-platform-win" value="win" class="system-checkbox" style="margin-right: 10px;">
                                        <div style="flex: 1;">
                                            <div style="color: var(--color-text); font-weight: 600; font-size: 13px;">Windows (x64)</div>
                                            <div style="color: var(--color-text-muted); font-size: 11px;">Build .exe for Windows 64-bit</div>
                                        </div>
                                    </label>

                                    <label class="build-option-label" style="display: flex; align-items: center; padding: 8px 10px; background: var(--color-bg-panel); border: 1px solid var(--color-border); border-radius: 4px; cursor: pointer; transition: all 0.2s;">
                                        <input type="checkbox" id="build-platform-mac" value="mac" class="system-checkbox" style="margin-right: 10px;">
                                        <div style="flex: 1;">
                                            <div style="color: var(--color-text); font-weight: 600; font-size: 13px;">macOS (x64)</div>
                                            <div style="color: var(--color-text-muted); font-size: 11px;">Build .app for macOS 64-bit</div>
                                        </div>
                                    </label>

                                    <label class="build-option-label" style="display: flex; align-items: center; padding: 8px 10px; background: var(--color-bg-panel); border: 1px solid var(--color-border); border-radius: 4px; cursor: pointer; transition: all 0.2s;">
                                        <input type="checkbox" id="build-platform-linux" value="linux" class="system-checkbox" style="margin-right: 10px;">
                                        <div style="flex: 1;">
                                            <div style="color: var(--color-text); font-weight: 600; font-size: 13px;">Linux (x64)</div>
                                            <div style="color: var(--color-text-muted); font-size: 11px;">Build executable for Linux 64-bit</div>
                                        </div>
                                    </label>
                                    <label id="build-appimage-option" style="display: none; align-items: flex-start; gap: 8px; margin-left: 28px; padding: 7px 9px; background: var(--color-bg-surface); border: 1px solid var(--color-border-subtle); border-left: 2px solid var(--color-accent-border); border-radius: 4px; cursor: pointer;">
                                        <input id="build-create-linux-appimage" type="checkbox" class="system-checkbox" style="width: 16px; height: 16px; min-width: 16px; min-height: 16px; max-width: 16px; max-height: 16px; flex: 0 0 16px; margin: 1px 0 0;">
                                        <span>
                                            <span style="display: block; color: var(--color-text); font-weight: 600; font-size: 12px;">Also create Linux AppImage</span>
                                            <span id="build-appimage-note" style="display: block; color: var(--color-text-muted); font-size: 10px; line-height: 1.35; margin-top: 2px;">Portable x86_64 file emitted beside the Linux folder.</span>
                                        </span>
                                    </label>

                                    <label class="build-option-label" style="display: flex; align-items: center; padding: 8px 10px; background: var(--color-bg-panel); border: 1px solid var(--color-border); border-radius: 4px; cursor: pointer; transition: all 0.2s;">
                                        <input type="checkbox" id="build-platform-web" value="web" class="system-checkbox" style="margin-right: 10px;">
                                        <div style="flex: 1;">
                                            <div style="color: var(--color-text); font-weight: 600; font-size: 13px;">Web (HTML5)</div>
                                            <div style="color: var(--color-text-muted); font-size: 11px;">Build for browser deployment</div>
                                        </div>
                                    </label>
                                </div>
                            </div>

                            <div>
                                <h3 style="color: var(--color-text); margin-bottom: 10px; font-size: 15px;">NW.js Runtime</h3>
                                <div style="display: flex; flex-direction: column; gap: 6px;">
                                    <label class="build-option-label" style="display: flex; align-items: center; padding: 8px 10px; background: var(--color-bg-panel); border: 1px solid var(--color-border); border-radius: 4px; cursor: pointer; transition: all 0.2s;">
                                        <input type="radio" name="build-runtime-source" value="bundled" checked class="system-radio" style="margin-right: 10px;">
                                        <div style="flex: 1;">
                                            <div style="color: var(--color-text); font-weight: 600; font-size: 13px;">Automatic: Bundled / Cache First</div>
                                            <div style="color: var(--color-text-muted); font-size: 11px;">Reuses RPG Reactor's runtime or a matching cached archive before downloading</div>
                                        </div>
                                    </label>

                                    <label class="build-option-label" style="display: flex; align-items: center; padding: 8px 10px; background: var(--color-bg-panel); border: 1px solid var(--color-border); border-radius: 4px; cursor: pointer; transition: all 0.2s;">
                                        <input type="radio" name="build-runtime-source" value="download" class="system-radio" style="margin-right: 10px;">
                                        <div style="flex: 1;">
                                            <div style="color: var(--color-text); font-weight: 600; font-size: 13px;">Official Download / Cache</div>
                                            <div style="color: var(--color-text-muted); font-size: 11px;">Uses a matching official cache, otherwise downloads from dl.nwjs.io</div>
                                        </div>
                                    </label>
                                </div>
                                <div style="color: var(--color-text-muted); font-size: 11px; margin-top: 4px;">Only applies to desktop platforms (Windows, macOS, Linux)</div>
                                <div style="margin-top: 10px; display: grid; grid-template-columns: 130px minmax(0, 1fr); gap: 8px; align-items: center;">
                                    <label for="build-nw-version-policy" style="color: var(--color-text-muted); font-size: 11px;">Fallback version</label>
                                    <select id="build-nw-version-policy" class="rr-select" style="font-size: 12px; padding: 5px 7px;">
                                        <option value="stable" selected>Latest stable</option>
                                        <option value="editor">Same as editor</option>
                                        <option value="exact">Specific version</option>
                                    </select>
                                    <label for="build-nw-version-exact" style="color: var(--color-text-muted); font-size: 11px;">Specific version</label>
                                    <input id="build-nw-version-exact" class="rr-input" type="text" placeholder="Search versions..." autocomplete="off" spellcheck="false" disabled style="font-size: 12px; padding: 5px 7px;">
                                    <div id="build-nw-version-list" class="nw-version-menu" role="listbox" hidden></div>
                                </div>
                                <div style="color: var(--color-text-muted); font-size: 10px; margin-top: 5px; line-height: 1.35;">Bundled and cached runtimes are checked before an official download.</div>
                                <label style="display: flex; align-items: center; gap: 8px; margin-top: 10px; padding: 8px 10px; background: var(--color-bg-panel); border: 1px solid var(--color-border); border-radius: 4px; cursor: pointer;">
                                    <input id="build-include-proprietary-codecs" type="checkbox" class="system-checkbox" style="width: 16px; height: 16px; min-width: 16px; min-height: 16px; max-width: 16px; max-height: 16px; flex: 0 0 16px; margin: 0;">
                                    <span style="color: var(--color-text); font-weight: 600; font-size: 12px;">Include third-party H.264/AAC codec</span>
                                </label>
                            </div>

                            <div style="margin-top: 10px;">
                                <label style="display: flex; align-items: center; gap: 8px; padding: 8px 10px; background: var(--color-bg-panel); border: 1px solid var(--color-border); border-radius: 4px; cursor: pointer;">
                                    <input id="build-filter-locales" type="checkbox" class="system-checkbox" style="width: 16px; height: 16px; min-width: 16px; min-height: 16px; max-width: 16px; max-height: 16px; flex: 0 0 16px; margin: 0;">
                                    <span style="color: var(--color-text); font-weight: 600; font-size: 12px;">Include selected locales only</span>
                                </label>
                                <div id="build-locale-selection" hidden style="margin-top: 8px; padding: 8px; background: var(--color-bg-panel); border: 1px solid var(--color-border); border-radius: 4px;">
                                    <div style="display: flex; gap: 6px; margin-bottom: 6px;">
                                        <button id="build-locales-all" type="button" class="graphic-selector-button" style="padding: 4px 8px; font-size: 10px;">Select All</button>
                                        <button id="build-locales-english" type="button" class="graphic-selector-button" style="padding: 4px 8px; font-size: 10px;">English Only</button>
                                    </div>
                                    <div id="build-locale-list" style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 3px 8px; max-height: 170px; overflow-y: auto; padding-right: 4px;"></div>
                                    <div style="color: var(--color-text-muted); font-size: 10px; line-height: 1.35; margin-top: 6px;">English (US) is always included as fallback. Desktop builds only.</div>
                                </div>
                            </div>

                            <div style="margin-top: 20px;">
                                <h3 style="color: var(--color-text); margin-bottom: 10px; font-size: 15px;">Asset Optimization</h3>
                                <div style="display: flex; flex-direction: column; gap: 6px;">
                                    <label style="display: flex; align-items: center; gap: 8px; padding: 8px 10px; background: var(--color-bg-panel); border: 1px solid var(--color-border); border-radius: 4px; cursor: pointer;">
                                        <input id="build-optimize-png" type="checkbox" class="system-checkbox" style="width: 16px; height: 16px; min-width: 16px; min-height: 16px; max-width: 16px; max-height: 16px; flex: 0 0 16px; margin: 0;">
                                        <span style="color: var(--color-text); font-weight: 600; font-size: 12px;">Losslessly optimize PNG files (Oxipng)</span>
                                    </label>
                                    <label style="display: flex; align-items: center; gap: 8px; padding: 8px 10px; background: var(--color-bg-panel); border: 1px solid var(--color-border); border-radius: 4px; cursor: pointer;">
                                        <input id="build-optimize-ogg" type="checkbox" class="system-checkbox" style="width: 16px; height: 16px; min-width: 16px; min-height: 16px; max-width: 16px; max-height: 16px; flex: 0 0 16px; margin: 0;">
                                        <span style="color: var(--color-text); font-weight: 600; font-size: 12px;">Re-encode OGG audio (lossy)</span>
                                    </label>
                                </div>
                                <div style="margin-top: 8px; display: grid; grid-template-columns: 130px minmax(0, 1fr); gap: 8px; align-items: center;">
                                    <label for="build-ogg-quality" style="color: var(--color-text-muted); font-size: 11px;">OGG quality</label>
                                    <select id="build-ogg-quality" class="rr-select" style="font-size: 12px; padding: 5px 7px;">
                                        <option value="3">3 - Standard / Smaller</option>
                                        <option value="5" selected>5 - High</option>
                                        <option value="7">7 - Very High</option>
                                        <option value="10">10 - Maximum</option>
                                    </select>
                                </div>
                                <div style="color: var(--color-text-muted); font-size: 10px; line-height: 1.35; margin-top: 6px;">Only smaller validated results replace staged assets.</div>
                            </div>
                        </div>

                        <!-- Right Column: Output, Log, Actions -->
                        <div style="flex: 1; display: flex; flex-direction: column; min-width: 0; min-height: 0;">
                            <!-- Output Directory -->
                            <div style="margin-bottom: 16px;">
                                <h3 style="color: var(--color-text); margin-bottom: 10px; font-size: 15px;">Output Directory</h3>
                                <div style="display: flex; gap: 8px; align-items: center;">
                                    <input type="text" id="build-output-path" value="dist" readonly style="flex: 1; padding: 6px 10px; background-color: var(--color-bg-surface); border: 1px solid var(--color-border-input); color: var(--color-text); border-radius: 2px; font-size: 13px; font-family: inherit; min-width: 0;">
                                    <button id="build-select-output-btn" class="graphic-selector-button" style="padding: 6px 14px; font-size: 12px; flex-shrink: 0;">Choose...</button>
                                </div>
                            </div>

                            <!-- Progress -->
                            <div id="build-progress-container" style="margin-bottom: 12px; display: none;">
                                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                                    <span id="build-progress-status" style="color: var(--color-text); font-size: 13px;">Building...</span>
                                    <span id="build-progress-percent" style="color: var(--color-text-muted); font-size: 12px;">0%</span>
                                </div>
                                <div style="background: var(--color-bg-panel); border: 1px solid var(--color-border); border-radius: 4px; height: 20px; overflow: hidden;">
                                    <div id="build-progress-bar" style="height: 100%; width: 0%; background: linear-gradient(90deg, var(--color-accent-deep), var(--color-accent-hover)); transition: width 0.3s ease; border-radius: 3px;"></div>
                                </div>
                            </div>

                            <!-- Build Log -->
                            <div style="flex: 1; display: flex; flex-direction: column; min-height: 0; margin-bottom: 16px;">
                                <h3 style="color: var(--color-text); margin-bottom: 10px; font-size: 15px;">Build Log</h3>
                                <div id="build-log" style="flex: 1; background: var(--color-bg-panel); border: 1px solid var(--color-border); border-radius: 4px; padding: 12px; overflow-y: auto; font-family: 'Consolas', 'Monaco', monospace; font-size: 12px; color: var(--color-text); white-space: pre-wrap; word-wrap: break-word;">
                                    <div style="color: var(--color-text-muted);">Ready to build. Select platforms and click "Start Build".</div>
                                </div>
                            </div>

                            <!-- Buttons -->
                            <div style="display: flex; gap: 12px; justify-content: flex-end; flex-shrink: 0;">
                                <button id="build-start-btn" style="padding: 8px 20px; background: var(--color-bg-deep); border: 1px solid var(--color-border-input); color: var(--color-text); border-radius: 4px; font-size: 13px; cursor: pointer; font-weight: 500; transition: all 0.2s; box-shadow: 0 2px 4px rgba(0,0,0,0.2);">
                                    Start Build
                                </button>
                                <button id="build-cancel-btn" style="padding: 8px 20px; background: var(--color-bg-deep); border: 1px solid var(--color-border-input); color: var(--color-text); border-radius: 4px; font-size: 13px; cursor: pointer; font-weight: 500; transition: all 0.2s; box-shadow: 0 2px 4px rgba(0,0,0,0.2); display: none;">
                                    Cancel Build
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHTML);
        this.modal = document.getElementById('build-modal');
        document.getElementById('build-output-path').value =
            DeploymentPathPreferences.load('game', 'dist');
        this.setupLocaleOptions();
        this.setupAssetOptimizationOptions();
        this.versionPicker = new NwVersionPicker(
            document.getElementById('build-nw-version-exact'),
            document.getElementById('build-nw-version-list'));

        // Set up event listeners
        this.setupEventListeners();
    }

    setupLocaleOptions() {
        const preference = DeploymentLocalePreferences.load();
        const toggle = document.getElementById('build-filter-locales');
        const selection = document.getElementById('build-locale-selection');
        const list = document.getElementById('build-locale-list');
        const selected = new Set(preference.locales);
        let displayNames = null;
        try { displayNames = new Intl.DisplayNames(['en'], { type: 'language' }); } catch {}
        const locales = DeploymentLocalePreferences.locales().map(locale => {
            let name = locale;
            try { name = (displayNames && displayNames.of(locale)) || locale; } catch {}
            return { locale, name };
        }).sort((a, b) => {
            if (a.locale === DeploymentLocalePreferences.FALLBACK_LOCALE) return -1;
            if (b.locale === DeploymentLocalePreferences.FALLBACK_LOCALE) return 1;
            return a.name.localeCompare(b.name);
        });

        for (const { locale, name } of locales) {
            const label = document.createElement('label');
            label.style.cssText = 'display:flex;align-items:center;gap:5px;min-width:0;padding:3px 2px;cursor:pointer;font-size:11px;color:var(--color-text);';
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.className = 'system-checkbox build-runtime-locale';
            checkbox.value = locale;
            checkbox.checked = selected.has(locale);
            checkbox.style.cssText = 'width:14px;height:14px;min-width:14px;min-height:14px;max-width:14px;max-height:14px;flex:0 0 14px;margin:0;';
            if (locale === DeploymentLocalePreferences.FALLBACK_LOCALE) {
                checkbox.checked = true;
                checkbox.disabled = true;
            }
            const text = document.createElement('span');
            text.textContent = `${name} (${locale})`;
            text.title = text.textContent;
            text.style.cssText = 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
            label.append(checkbox, text);
            list.appendChild(label);
            checkbox.addEventListener('change', () => this.saveLocaleOptions());
        }

        toggle.checked = preference.mode === 'selected';
        selection.hidden = !toggle.checked;
        toggle.addEventListener('change', () => {
            selection.hidden = !toggle.checked;
            this.saveLocaleOptions();
        });
        document.getElementById('build-locales-all').addEventListener('click', () => {
            list.querySelectorAll('input').forEach(checkbox => { checkbox.checked = true; });
            this.saveLocaleOptions();
        });
        document.getElementById('build-locales-english').addEventListener('click', () => {
            list.querySelectorAll('input').forEach(checkbox => {
                checkbox.checked = checkbox.value === DeploymentLocalePreferences.FALLBACK_LOCALE;
            });
            this.saveLocaleOptions();
        });
    }

    saveLocaleOptions() {
        DeploymentLocalePreferences.save({
            mode: document.getElementById('build-filter-locales').checked ? 'selected' : 'all',
            locales: [...document.querySelectorAll('.build-runtime-locale:checked')].map(input => input.value),
        });
    }

    selectedRuntimeLocales() {
        if (!document.getElementById('build-filter-locales').checked) return null;
        return DeploymentLocalePreferences.normalize(
            [...document.querySelectorAll('.build-runtime-locale:checked')].map(input => input.value));
    }

    setupAssetOptimizationOptions() {
        const preference = DeploymentAssetPreferences.load();
        const png = document.getElementById('build-optimize-png');
        const ogg = document.getElementById('build-optimize-ogg');
        const quality = document.getElementById('build-ogg-quality');
        png.checked = preference.png;
        ogg.checked = preference.ogg;
        quality.value = String(preference.oggQuality);
        quality.disabled = !ogg.checked;
        const save = () => {
            quality.disabled = !ogg.checked;
            DeploymentAssetPreferences.save(this.assetOptimizationSettings());
        };
        png.addEventListener('change', save);
        ogg.addEventListener('change', save);
        quality.addEventListener('change', save);
    }

    assetOptimizationSettings() {
        return DeploymentAssetPreferences.normalize({
            png: document.getElementById('build-optimize-png').checked,
            ogg: document.getElementById('build-optimize-ogg').checked,
            oggQuality: document.getElementById('build-ogg-quality').value,
        });
    }

    setupEventListeners() {
        const closeBtn = document.getElementById('build-modal-close-btn');
        const startBtn = document.getElementById('build-start-btn');
        const cancelBtn = document.getElementById('build-cancel-btn');
        const selectOutputBtn = document.getElementById('build-select-output-btn');
        const versionPolicy = document.getElementById('build-nw-version-policy');

        closeBtn.addEventListener('click', () => this.close());
        startBtn.addEventListener('click', () => this.startBuild());
        cancelBtn.addEventListener('click', () => this.cancelBuild());
        selectOutputBtn.addEventListener('click', () => this.selectOutputDirectory());
        versionPolicy.addEventListener('change', () => {
            this.versionPicker.setEnabled(versionPolicy.value === 'exact');
        });
        document.getElementById('build-platform-linux').addEventListener('change', () => this.updateAppImageAvailability());

        // Close on background click
        this.modal.addEventListener('click', (e) => {
            if (e.target === this.modal) {
                this.close();
            }
        });

        // Option label hover effects (gold theme)
        const labels = this.modal.querySelectorAll('.build-option-label');
        labels.forEach(label => {
            label.addEventListener('mouseenter', () => {
                label.style.borderColor = 'var(--color-accent-border-strong)';
                label.style.backgroundColor = 'var(--color-bg-base)';
            });
            label.addEventListener('mouseleave', () => {
                label.style.borderColor = 'var(--color-border)';
                label.style.backgroundColor = 'var(--color-bg-panel)';
            });
        });

        // Button hover effects (gold theme)
        [startBtn, cancelBtn].forEach(btn => {
            btn.addEventListener('mouseenter', () => {
                btn.style.background = 'var(--color-accent-tint-15)';
                btn.style.borderColor = 'var(--color-accent-border-strong)';
                btn.style.boxShadow = '0 3px 6px var(--color-accent-tint-30)';
            });
            btn.addEventListener('mouseleave', () => {
                btn.style.background = 'var(--color-bg-deep)';
                btn.style.borderColor = 'var(--color-border-input)';
                btn.style.boxShadow = '0 2px 4px rgba(0,0,0,0.2)';
            });
        });
    }

    updateAppImageAvailability() {
        const checkbox = document.getElementById('build-create-linux-appimage');
        const option = document.getElementById('build-appimage-option');
        const note = document.getElementById('build-appimage-note');
        const hostSupported = typeof process !== 'undefined' && process.platform === 'linux' && process.arch === 'x64';
        const linuxSelected = document.getElementById('build-platform-linux').checked;
        checkbox.disabled = !hostSupported || !linuxSelected;
        if (checkbox.disabled) checkbox.checked = false;
        option.style.display = linuxSelected ? 'flex' : 'none';
        option.style.opacity = checkbox.disabled ? '0.5' : '1';
        option.style.cursor = checkbox.disabled ? 'not-allowed' : 'pointer';
        note.textContent = !hostSupported
            ? 'Creation requires RPG Reactor running on Linux x86_64.'
            : 'Portable x86_64 file emitted beside the Linux folder.';
    }

    open() {
        this.modal.style.display = 'flex';
        this.clearLog();
        this.resetProgress();
        this.updateAppImageAvailability();
        this.log('Ready to build. Select platforms and click "Start Build".', 'var(--color-text-muted)');
        this.versionPicker.load().catch(() => {});
    }

    close() {
        if (this.isBuilding) {
            const confirm = window.confirm('A build is in progress. Are you sure you want to close?');
            if (!confirm) return;
            this.cancelBuild();
        }
        this.versionPicker.close();
        this.modal.style.display = 'none';
    }

    selectOutputDirectory() {
        const input = document.createElement('input');
        input.type = 'file';
        input.nwdirectory = true;
        input.addEventListener('change', () => {
            if (input.files.length > 0) {
                const outputPath = document.getElementById('build-output-path');
                outputPath.value = input.files[0].path;
                DeploymentPathPreferences.save('game', outputPath.value);
            }
        });
        input.click();
    }

    clearLog() {
        const logDiv = document.getElementById('build-log');
        logDiv.innerHTML = '';
        this.downloadProgressRows.clear();
    }

    log(message, color = 'var(--color-text)') {
        const logDiv = document.getElementById('build-log');
        const line = document.createElement('div');
        line.textContent = message;
        line.style.color = color;
        logDiv.appendChild(line);
        logDiv.scrollTop = logDiv.scrollHeight;
    }

    updateDownloadProgress(message) {
        const logDiv = document.getElementById('build-log');
        let entry = this.downloadProgressRows.get(message.id);
        if (!entry) {
            const row = document.createElement('div');
            row.className = 'rr-download-progress';
            const header = document.createElement('div');
            header.className = 'rr-download-progress-header';
            const label = document.createElement('span');
            label.className = 'rr-download-progress-label';
            const detail = document.createElement('span');
            detail.className = 'rr-download-progress-detail';
            header.append(label, detail);
            const track = document.createElement('div');
            track.className = 'rr-download-progress-track';
            track.setAttribute('role', 'progressbar');
            const fill = document.createElement('div');
            fill.className = 'rr-download-progress-fill';
            track.appendChild(fill);
            row.append(header, track);
            logDiv.appendChild(row);
            entry = { label, detail, track, fill };
            this.downloadProgressRows.set(message.id, entry);
        }

        const mib = bytes => `${(bytes / 1048576).toFixed(bytes >= 10485760 ? 1 : 2)} MiB`;
        const hasTotal = message.total > 0;
        const percent = hasTotal ? Math.min(100, (message.downloaded / message.total) * 100) : null;
        entry.label.textContent = message.label;
        entry.label.title = message.label;
        entry.fill.classList.toggle('is-indeterminate', !hasTotal && !['complete', 'failed'].includes(message.state));
        entry.fill.classList.toggle('is-failed', message.state === 'failed');
        entry.fill.style.width = message.state === 'complete' ? '100%' : hasTotal ? `${percent}%` : '38%';
        entry.track.setAttribute('aria-label', `Downloading ${message.label}`);
        if (percent === null) entry.track.removeAttribute('aria-valuenow');
        else entry.track.setAttribute('aria-valuenow', String(Math.round(percent)));

        if (message.state === 'complete') {
            entry.detail.textContent = `Complete - ${mib(message.downloaded)}`;
        } else if (message.state === 'failed') {
            entry.detail.textContent = `Failed after ${message.attempt} attempts`;
        } else if (message.state === 'retrying') {
            entry.detail.textContent = `Retrying ${message.attempt}/${message.maxAttempts} - ${mib(message.downloaded)}`;
        } else if (hasTotal) {
            entry.detail.textContent = `${Math.round(percent)}% - ${mib(message.downloaded)} / ${mib(message.total)}`;
        } else {
            entry.detail.textContent = `${mib(message.downloaded)} downloaded`;
        }
        logDiv.scrollTop = logDiv.scrollHeight;
    }

    updateProgress(percent, status) {
        const container = document.getElementById('build-progress-container');
        const bar = document.getElementById('build-progress-bar');
        const pctLabel = document.getElementById('build-progress-percent');
        const statusLabel = document.getElementById('build-progress-status');

        container.style.display = 'block';
        bar.style.width = `${Math.min(100, Math.max(0, percent))}%`;
        pctLabel.textContent = `${Math.round(percent)}%`;
        if (status) statusLabel.textContent = status;

        // Color transitions: gold → green at 100%
        if (percent >= 100) {
            bar.style.background = 'linear-gradient(90deg, #16825d, #1db954)';
        } else {
            bar.style.background = 'linear-gradient(90deg, var(--color-accent-deep), var(--color-accent-hover))';
        }
    }

    resetProgress() {
        const container = document.getElementById('build-progress-container');
        const bar = document.getElementById('build-progress-bar');
        const pctLabel = document.getElementById('build-progress-percent');
        const statusLabel = document.getElementById('build-progress-status');

        container.style.display = 'none';
        bar.style.width = '0%';
        bar.style.background = 'linear-gradient(90deg, var(--color-accent-deep), var(--color-accent-hover))';
        pctLabel.textContent = '0%';
        statusLabel.textContent = 'Building...';
    }

    getSelectedPlatforms() {
        const platforms = [];
        if (document.getElementById('build-platform-win').checked) platforms.push('win');
        if (document.getElementById('build-platform-mac').checked) platforms.push('mac');
        if (document.getElementById('build-platform-linux').checked) platforms.push('linux');
        if (document.getElementById('build-platform-web').checked) platforms.push('web');
        return platforms;
    }

    async startBuild() {
        const platforms = this.getSelectedPlatforms();

        if (platforms.length === 0) {
            alert('Please select at least one platform to build.');
            return;
        }

        // Validate that a project is loaded
        const project = window.reactor.projectController.getCurrentProject();
        if (!project || !project.path) {
            alert('No project is currently loaded. Please open a project before building.');
            return;
        }

        const path = require('path');
        const fs = require('fs');
        const outputPath = document.getElementById('build-output-path').value;

        // __dirname in NW.js <script> tags = HTML file's directory (app root).
        // Verify by checking for build-scripts/ — fall back to process.cwd().
        let appRoot = __dirname;
        if (!fs.existsSync(path.join(appRoot, 'build-scripts', 'build-worker.js'))) {
            appRoot = path.resolve(__dirname, '..');
        }
        if (!fs.existsSync(path.join(appRoot, 'build-scripts', 'build-worker.js'))) {
            appRoot = process.cwd();
        }

        const outputDir = path.isAbsolute(outputPath)
            ? outputPath
            : path.join(appRoot, outputPath);

        const editorNwVersion = process.versions.nw || process.versions['node-webkit'];
        if (!editorNwVersion) {
            alert('Could not determine the editor NW.js version.');
            return;
        }
        const nwVersionPolicy = document.getElementById('build-nw-version-policy').value;
        const exactNwVersion = document.getElementById('build-nw-version-exact').value.trim().replace(/^v/i, '');
        if (nwVersionPolicy === 'exact') {
            try { await this.versionPicker.load(); }
            catch {
                alert('NW.js versions are unavailable. Connect to the internet or choose Same as editor.');
                return;
            }
            if (!this.versionPicker.hasVersion(exactNwVersion)) {
                alert('Select an available NW.js version from the searchable list.');
                return;
            }
        }
        // Runtime source: local/cache first or official cache/download.
        const runtimeSource = document.querySelector('input[name="build-runtime-source"]:checked').value;
        const includeProprietaryCodecs = document.getElementById('build-include-proprietary-codecs').checked;
        const runtimeLocales = this.selectedRuntimeLocales();
        const assetOptimization = this.assetOptimizationSettings();
        const createLinuxAppImage = document.getElementById('build-create-linux-appimage').checked;

        this.isBuilding = true;
        document.getElementById('build-start-btn').style.display = 'none';
        document.getElementById('build-cancel-btn').style.display = 'block';

        this.clearLog();
        this.log('Launching build worker...', 'var(--color-link)');
        this.log(`App root: ${appRoot}`, 'var(--color-text-muted)');

        try {
            const { Worker } = require('worker_threads');

            const workerPath = path.join(appRoot, 'build-scripts', 'build-worker.js');
            if (!fs.existsSync(workerPath)) {
                throw new Error(`Build worker not found at: ${workerPath}`);
            }
            this.worker = new Worker(workerPath, {
                workerData: {
                    projectPath: project.path,
                    projectName: project.name,
                    platforms: platforms,
                    outputDir: outputDir,
                    nwVersion: nwVersionPolicy === 'exact' ? exactNwVersion : editorNwVersion,
                    nwVersionPolicy,
                    editorNwVersion,
                    runtimeSource: runtimeSource,
                    includeProprietaryCodecs,
                    runtimeLocales,
                    assetOptimization,
                    createLinuxAppImage,
                    appRoot: appRoot,
                    editorExecPath: process.execPath,
                }
            });

            // Log messages from worker
            this.worker.on('message', (msg) => {
                if (msg.type === 'log') {
                    this.log(msg.message, msg.color || 'var(--color-text)');
                } else if (msg.type === 'progress') {
                    this.updateProgress(msg.percent, msg.status);
                } else if (msg.type === 'download-progress') {
                    this.updateDownloadProgress(msg);
                } else if (msg.type === 'done') {
                    if (msg.success) {
                        this.log('', 'var(--color-text)');
                        this.log(`Output directory: ${outputDir}`, 'var(--color-text)');
                        this.updateProgress(100, 'Build complete!');
                    }
                }
            });

            // Worker threw an uncaught error
            this.worker.on('error', (err) => {
                this.log('', 'var(--color-text)');
                this.log('========================================', 'var(--color-danger-bright)');
                this.log('Build worker error:', 'var(--color-danger-bright)');
                this.log(err.message || String(err), 'var(--color-danger-bright)');
                this.log('========================================', 'var(--color-danger-bright)');
                this.buildFinished();
            });

            // Worker exited
            this.worker.on('exit', (code) => {
                if (code !== 0 && this.isBuilding) {
                    this.log(`Build worker exited with code ${code}`, 'var(--color-danger-bright)');
                }
                this.buildFinished();
            });

        } catch (error) {
            this.log('', 'var(--color-text)');
            this.log('========================================', 'var(--color-danger-bright)');
            this.log('Error starting build:', 'var(--color-danger-bright)');
            this.log(error.message, 'var(--color-danger-bright)');
            if (error.stack) {
                this.log(error.stack, 'var(--color-danger-bright)');
            }
            this.log('========================================', 'var(--color-danger-bright)');
            this.buildFinished();
        }
    }

    buildFinished() {
        this.isBuilding = false;
        this.worker = null;
        document.getElementById('build-start-btn').style.display = 'block';
        document.getElementById('build-cancel-btn').style.display = 'none';
    }

    cancelBuild() {
        if (this.worker) {
            this.worker.terminate();
            this.log('', 'var(--color-text)');
            this.log('Build cancelled by user.', '#ffaa00');
            this.buildFinished();
        }
    }
}
