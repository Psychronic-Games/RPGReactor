class DistEditorManager {
    constructor() {
        this.isBuilding = false;
        this.modal = null;
        this.worker = null;
        this.setupModal();
    }

    setupModal() {
        const modalHTML = `
            <div id="dist-editor-modal" style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background-color: rgba(0, 0, 0, 0.8); display: none; justify-content: center; align-items: center; z-index: 10001;">
                <div style="background-color: var(--color-bg-surface); border: 1px solid var(--color-border); border-radius: 8px; width: 90%; max-width: 1100px; height: 80vh; max-height: 700px; display: flex; flex-direction: column; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);">
                    <div style="background-color: var(--color-bg-panel); padding: 12px 16px; border-bottom: 1px solid var(--color-border); display: flex; justify-content: space-between; align-items: center; border-radius: 8px 8px 0 0;">
                        <div style="font-size: 16px; font-weight: 600; color: var(--color-text);">Deploy Editor</div>
                        <button id="dist-editor-close-btn" style="background: none; border: none; color: var(--color-text-muted); font-size: 24px; cursor: pointer; padding: 0; width: 30px; height: 30px; line-height: 1;">×</button>
                    </div>

                    <div style="flex: 1; display: flex; gap: 20px; padding: 20px; overflow: hidden; min-height: 0;">
                        <!-- Left Column: Build Options -->
                        <div style="flex: 0 0 392px; overflow-y: auto; padding-right: 12px; scrollbar-gutter: stable;">
                            <!-- Package Type -->
                            <div style="margin-bottom: 20px;">
                                <h3 style="color: var(--color-text); margin-bottom: 10px; font-size: 15px;">Package Type</h3>
                                <div style="display: flex; flex-direction: column; gap: 6px;">
                                    <label class="dist-option-label" style="display: flex; align-items: center; padding: 8px 10px; background: var(--color-bg-panel); border: 1px solid var(--color-border); border-radius: 4px; cursor: pointer; transition: all 0.2s;">
                                        <input type="radio" name="dist-package-type" value="platform" checked class="system-radio" style="margin-right: 10px;">
                                        <div style="flex: 1;">
                                            <div style="color: var(--color-text); font-weight: 600; font-size: 13px;">Platform-Specific</div>
                                            <div style="color: var(--color-text-muted); font-size: 11px;">One archive per platform with bundled NW.js runtime</div>
                                        </div>
                                    </label>
                                    <label class="dist-option-label" style="display: flex; align-items: center; padding: 8px 10px; background: var(--color-bg-panel); border: 1px solid var(--color-border); border-radius: 4px; cursor: pointer; transition: all 0.2s;">
                                        <input type="radio" name="dist-package-type" value="universal" class="system-radio" style="margin-right: 10px;">
                                        <div style="flex: 1;">
                                            <div style="color: var(--color-text); font-weight: 600; font-size: 13px;">Universal</div>
                                            <div style="color: var(--color-text-muted); font-size: 11px;">Single archive with all 3 platform runtimes included</div>
                                        </div>
                                    </label>
                                    <label class="dist-option-label" style="display: flex; align-items: center; padding: 8px 10px; background: var(--color-bg-panel); border: 1px solid var(--color-border); border-radius: 4px; cursor: pointer; transition: all 0.2s;">
                                        <input type="radio" name="dist-package-type" value="minimal" class="system-radio" style="margin-right: 10px;">
                                        <div style="flex: 1;">
                                            <div style="color: var(--color-text); font-weight: 600; font-size: 13px;">Minimal</div>
                                            <div style="color: var(--color-text-muted); font-size: 11px;">Editor only — NW.js downloads automatically on first launch</div>
                                        </div>
                                    </label>
                                </div>
                            </div>

                            <!-- Platform Selection (for platform type) -->
                            <div id="dist-platform-section" style="margin-bottom: 20px;">
                                <h3 style="color: var(--color-text); margin-bottom: 10px; font-size: 15px;">Select Platform(s)</h3>
                                <div style="display: flex; flex-direction: column; gap: 6px;">
                                    <label class="dist-option-label" style="display: flex; align-items: center; padding: 8px 10px; background: var(--color-bg-panel); border: 1px solid var(--color-border); border-radius: 4px; cursor: pointer; transition: all 0.2s;">
                                        <input type="checkbox" id="dist-platform-linux" value="linux" checked class="system-checkbox" style="margin-right: 10px;">
                                        <div style="flex: 1;">
                                            <div style="color: var(--color-text); font-weight: 600; font-size: 13px;">Linux (x64)</div>
                                            <div style="color: var(--color-text-muted); font-size: 11px;">ZIP archive for Linux 64-bit</div>
                                        </div>
                                    </label>
                                    <label class="dist-option-label" style="display: flex; align-items: center; padding: 8px 10px; background: var(--color-bg-panel); border: 1px solid var(--color-border); border-radius: 4px; cursor: pointer; transition: all 0.2s;">
                                        <input type="checkbox" id="dist-platform-win" value="win" class="system-checkbox" style="margin-right: 10px;">
                                        <div style="flex: 1;">
                                            <div style="color: var(--color-text); font-weight: 600; font-size: 13px;">Windows (x64)</div>
                                            <div style="color: var(--color-text-muted); font-size: 11px;">ZIP archive for Windows 64-bit</div>
                                        </div>
                                    </label>
                                    <label class="dist-option-label" style="display: flex; align-items: center; padding: 8px 10px; background: var(--color-bg-panel); border: 1px solid var(--color-border); border-radius: 4px; cursor: pointer; transition: all 0.2s;">
                                        <input type="checkbox" id="dist-platform-osx" value="osx" class="system-checkbox" style="margin-right: 10px;">
                                        <div style="flex: 1;">
                                            <div style="color: var(--color-text); font-weight: 600; font-size: 13px;">macOS (x64)</div>
                                            <div style="color: var(--color-text-muted); font-size: 11px;">ZIP archive for macOS 64-bit</div>
                                        </div>
                                    </label>
                                    <label id="dist-appimage-option" style="display: flex; align-items: flex-start; gap: 8px; padding: 8px 10px; background: var(--color-bg-panel); border: 1px solid var(--color-border); border-radius: 4px; cursor: pointer;">
                                        <input id="dist-create-linux-appimage" type="checkbox" class="system-checkbox" style="width: 16px; height: 16px; min-width: 16px; min-height: 16px; max-width: 16px; max-height: 16px; flex: 0 0 16px; margin: 1px 0 0;">
                                        <span>
                                            <span style="display: block; color: var(--color-text); font-weight: 600; font-size: 12px;">Also create Linux AppImage</span>
                                            <span id="dist-appimage-note" style="display: block; color: var(--color-text-muted); font-size: 10px; line-height: 1.35; margin-top: 2px;">Portable x86_64 file emitted beside the Linux ZIP.</span>
                                        </span>
                                    </label>
                                </div>
                            </div>

                            <!-- NW.js Edition -->
                            <div>
                                <h3 style="color: var(--color-text); margin-bottom: 10px; font-size: 15px;">NW.js Edition</h3>
                                <div style="display: flex; flex-direction: column; gap: 6px;">
                                    <label class="dist-option-label" style="display: flex; align-items: center; padding: 8px 10px; background: var(--color-bg-panel); border: 1px solid var(--color-border); border-radius: 4px; cursor: pointer; transition: all 0.2s;">
                                        <input type="radio" name="dist-edition" value="normal" checked class="system-radio" style="margin-right: 10px;">
                                        <div style="flex: 1;">
                                            <div style="color: var(--color-text); font-weight: 600; font-size: 13px;">Normal (Recommended)</div>
                                            <div style="color: var(--color-text-muted); font-size: 11px;">Standard NW.js runtime</div>
                                        </div>
                                    </label>
                                    <label class="dist-option-label" style="display: flex; align-items: center; padding: 8px 10px; background: var(--color-bg-panel); border: 1px solid var(--color-border); border-radius: 4px; cursor: pointer; transition: all 0.2s;">
                                        <input type="radio" name="dist-edition" value="sdk" class="system-radio" style="margin-right: 10px;">
                                        <div style="flex: 1;">
                                            <div style="color: var(--color-text); font-weight: 600; font-size: 13px;">SDK</div>
                                            <div style="color: var(--color-text-muted); font-size: 11px;">Includes DevTools — for development/debugging</div>
                                        </div>
                                    </label>
                                </div>
                                <div style="margin-top: 10px; display: grid; grid-template-columns: 130px minmax(0, 1fr); gap: 8px; align-items: center;">
                                    <label for="dist-nw-version-policy" style="color: var(--color-text-muted); font-size: 11px;">NW.js version</label>
                                    <select id="dist-nw-version-policy" class="rr-select" style="font-size: 12px; padding: 5px 7px;">
                                        <option value="stable" selected>Latest stable</option>
                                        <option value="editor">Same as editor</option>
                                        <option value="exact">Specific version</option>
                                    </select>
                                    <label for="dist-nw-version-exact" style="color: var(--color-text-muted); font-size: 11px;">Specific version</label>
                                    <input id="dist-nw-version-exact" class="rr-input" type="text" placeholder="Search versions..." autocomplete="off" spellcheck="false" disabled style="font-size: 12px; padding: 5px 7px;">
                                    <div id="dist-nw-version-list" class="nw-version-menu" role="listbox" hidden></div>
                                </div>
                                <div style="color: var(--color-text-muted); font-size: 10px; margin-top: 5px; line-height: 1.35;">Matching local bundles and every NW.js cache are checked before downloading.</div>
                                <label id="dist-codec-option" style="display: flex; align-items: center; gap: 8px; margin-top: 10px; padding: 8px 10px; background: var(--color-bg-panel); border: 1px solid var(--color-border); border-radius: 4px; cursor: pointer;">
                                    <input id="dist-include-proprietary-codecs" type="checkbox" class="system-checkbox" style="width: 16px; height: 16px; min-width: 16px; min-height: 16px; max-width: 16px; max-height: 16px; flex: 0 0 16px; margin: 0;">
                                    <span style="color: var(--color-text); font-weight: 600; font-size: 12px;">Include third-party H.264/AAC codec</span>
                                </label>
                            </div>
                        </div>

                        <!-- Right Column: Output, Log, Actions -->
                        <div style="flex: 1; display: flex; flex-direction: column; min-width: 0; min-height: 0;">
                            <!-- Output Directory -->
                            <div style="margin-bottom: 16px;">
                                <h3 style="color: var(--color-text); margin-bottom: 10px; font-size: 15px;">Output Directory</h3>
                                <div style="display: flex; gap: 8px; align-items: center;">
                                    <input type="text" id="dist-output-path" value="dist-editor" readonly style="flex: 1; padding: 6px 10px; background-color: var(--color-bg-surface); border: 1px solid var(--color-border-input); color: var(--color-text); border-radius: 2px; font-size: 13px; font-family: inherit; min-width: 0;">
                                    <button id="dist-select-output-btn" class="graphic-selector-button" style="padding: 6px 14px; font-size: 12px; flex-shrink: 0;">Choose...</button>
                                </div>
                            </div>

                            <!-- Progress -->
                            <div id="dist-progress-container" style="margin-bottom: 12px; display: none;">
                                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                                    <span id="dist-progress-status" style="color: var(--color-text); font-size: 13px;">Building...</span>
                                    <span id="dist-progress-percent" style="color: var(--color-text-muted); font-size: 12px;">0%</span>
                                </div>
                                <div style="background: var(--color-bg-panel); border: 1px solid var(--color-border); border-radius: 4px; height: 20px; overflow: hidden;">
                                    <div id="dist-progress-bar" style="height: 100%; width: 0%; background: linear-gradient(90deg, var(--color-accent-deep), var(--color-accent-hover)); transition: width 0.3s ease; border-radius: 3px;"></div>
                                </div>
                            </div>

                            <!-- Build Log -->
                            <div style="flex: 1; display: flex; flex-direction: column; min-height: 0; margin-bottom: 16px;">
                                <h3 style="color: var(--color-text); margin-bottom: 10px; font-size: 15px;">Build Log</h3>
                                <div id="dist-log" style="flex: 1; background: var(--color-bg-panel); border: 1px solid var(--color-border); border-radius: 4px; padding: 12px; overflow-y: auto; font-family: 'Consolas', 'Monaco', monospace; font-size: 12px; color: var(--color-text); white-space: pre-wrap; word-wrap: break-word;">
                                    <div style="color: var(--color-text-muted);">Ready. Select options and click "Start Build".</div>
                                </div>
                            </div>

                            <!-- Buttons -->
                            <div style="display: flex; gap: 12px; justify-content: flex-end; flex-shrink: 0;">
                                <button id="dist-start-btn" style="padding: 8px 20px; background: var(--color-bg-deep); border: 1px solid var(--color-border-input); color: var(--color-text); border-radius: 4px; font-size: 13px; cursor: pointer; font-weight: 500; transition: all 0.2s; box-shadow: 0 2px 4px rgba(0,0,0,0.2);">
                                    Start Build
                                </button>
                                <button id="dist-cancel-btn" style="padding: 8px 20px; background: var(--color-bg-deep); border: 1px solid var(--color-border-input); color: var(--color-text); border-radius: 4px; font-size: 13px; cursor: pointer; font-weight: 500; transition: all 0.2s; box-shadow: 0 2px 4px rgba(0,0,0,0.2); display: none;">
                                    Cancel Build
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHTML);
        this.modal = document.getElementById('dist-editor-modal');
        document.getElementById('dist-output-path').value =
            DeploymentPathPreferences.load('editor', 'dist-editor');
        this.versionPicker = new NwVersionPicker(
            document.getElementById('dist-nw-version-exact'),
            document.getElementById('dist-nw-version-list'));
        this.setupEventListeners();
    }

    setupEventListeners() {
        const closeBtn = document.getElementById('dist-editor-close-btn');
        const startBtn = document.getElementById('dist-start-btn');
        const cancelBtn = document.getElementById('dist-cancel-btn');
        const selectOutputBtn = document.getElementById('dist-select-output-btn');
        const versionPolicy = document.getElementById('dist-nw-version-policy');

        closeBtn.addEventListener('click', () => this.close());
        startBtn.addEventListener('click', () => this.startBuild());
        cancelBtn.addEventListener('click', () => this.cancelBuild());
        selectOutputBtn.addEventListener('click', () => this.selectOutputDirectory());
        versionPolicy.addEventListener('change', () => {
            this.versionPicker.setEnabled(versionPolicy.value === 'exact');
        });
        document.getElementById('dist-platform-linux').addEventListener('change', () => this.updatePlatformVisibility());

        // Close on background click
        this.modal.addEventListener('click', (e) => {
            if (e.target === this.modal) this.close();
        });

        // Show/hide platform section based on package type
        const typeRadios = this.modal.querySelectorAll('input[name="dist-package-type"]');
        typeRadios.forEach(radio => {
            radio.addEventListener('change', () => this.updatePlatformVisibility());
        });

        // Option label hover effects (gold theme)
        const labels = this.modal.querySelectorAll('.dist-option-label');
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

    updatePlatformVisibility() {
        const type = this.modal.querySelector('input[name="dist-package-type"]:checked').value;
        const section = document.getElementById('dist-platform-section');
        section.style.display = type === 'platform' ? 'block' : 'none';
        const codec = document.getElementById('dist-include-proprietary-codecs');
        const codecOption = document.getElementById('dist-codec-option');
        codec.disabled = type === 'minimal';
        if (codec.disabled) codec.checked = false;
        codecOption.style.opacity = codec.disabled ? '0.5' : '1';
        codecOption.style.cursor = codec.disabled ? 'not-allowed' : 'pointer';
        const appImageCheckbox = document.getElementById('dist-create-linux-appimage');
        const appImageOption = document.getElementById('dist-appimage-option');
        const appImageNote = document.getElementById('dist-appimage-note');
        const hostSupported = typeof process !== 'undefined' && process.platform === 'linux' && process.arch === 'x64';
        const linuxSelected = document.getElementById('dist-platform-linux').checked;
        appImageCheckbox.disabled = !hostSupported || type !== 'platform' || !linuxSelected;
        if (appImageCheckbox.disabled) appImageCheckbox.checked = false;
        appImageOption.style.opacity = appImageCheckbox.disabled ? '0.5' : '1';
        appImageOption.style.cursor = appImageCheckbox.disabled ? 'not-allowed' : 'pointer';
        appImageNote.textContent = !hostSupported
            ? 'Creation requires RPG Reactor running on Linux x86_64.'
            : type !== 'platform'
                ? 'Available for platform-specific Linux packages.'
                : linuxSelected
                    ? 'Portable x86_64 file emitted beside the Linux ZIP.'
                    : 'Select Linux to enable this additional artifact.';
    }

    open() {
        this.modal.style.display = 'flex';
        this.clearLog();
        this.resetProgress();
        this.updatePlatformVisibility();
        this.log('Ready. Select options and click "Start Build".', 'var(--color-text-muted)');
        this.versionPicker.load().catch(() => {});
    }

    close() {
        if (this.isBuilding) {
            if (!window.confirm('A build is in progress. Close anyway?')) return;
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
                const outputPath = document.getElementById('dist-output-path');
                outputPath.value = input.files[0].path;
                DeploymentPathPreferences.save('editor', outputPath.value);
            }
        });
        input.click();
    }

    clearLog() {
        document.getElementById('dist-log').innerHTML = '';
    }

    log(message, color = 'var(--color-text)') {
        const logDiv = document.getElementById('dist-log');
        const line = document.createElement('div');
        line.textContent = message;
        line.style.color = color;
        logDiv.appendChild(line);
        logDiv.scrollTop = logDiv.scrollHeight;
    }

    updateProgress(percent, status) {
        const container = document.getElementById('dist-progress-container');
        const bar = document.getElementById('dist-progress-bar');
        const pctLabel = document.getElementById('dist-progress-percent');
        const statusLabel = document.getElementById('dist-progress-status');

        container.style.display = 'block';
        bar.style.width = `${Math.min(100, Math.max(0, percent))}%`;
        pctLabel.textContent = `${Math.round(percent)}%`;
        if (status) statusLabel.textContent = status;

        if (percent >= 100) {
            bar.style.background = 'linear-gradient(90deg, #16825d, #1db954)';
        } else {
            bar.style.background = 'linear-gradient(90deg, var(--color-accent-deep), var(--color-accent-hover))';
        }
    }

    resetProgress() {
        const container = document.getElementById('dist-progress-container');
        const bar = document.getElementById('dist-progress-bar');
        container.style.display = 'none';
        bar.style.width = '0%';
        bar.style.background = 'linear-gradient(90deg, var(--color-accent-deep), var(--color-accent-hover))';
        document.getElementById('dist-progress-percent').textContent = '0%';
        document.getElementById('dist-progress-status').textContent = 'Building...';
    }

    async startBuild() {
        const packageType = this.modal.querySelector('input[name="dist-package-type"]:checked').value;
        const edition = this.modal.querySelector('input[name="dist-edition"]:checked').value;
        const includeProprietaryCodecs = document.getElementById('dist-include-proprietary-codecs').checked;
        const createLinuxAppImage = document.getElementById('dist-create-linux-appimage').checked;

        // Determine platforms
        let platforms;
        if (packageType === 'platform') {
            platforms = [];
            if (document.getElementById('dist-platform-linux').checked) platforms.push('linux');
            if (document.getElementById('dist-platform-win').checked) platforms.push('win');
            if (document.getElementById('dist-platform-osx').checked) platforms.push('osx');
            if (platforms.length === 0) {
                alert('Please select at least one platform.');
                return;
            }
        } else {
            // universal/minimal don't need platform selection from UI
            platforms = packageType === 'universal' ? ['linux', 'win', 'osx'] : [];
        }

        const pathModule = require('path');
        const fs = require('fs');
        const outputPath = document.getElementById('dist-output-path').value;

        // Resolve app root (same logic as BuildManager)
        let appRoot = __dirname;
        if (!fs.existsSync(pathModule.join(appRoot, 'build-scripts', 'dist-editor-worker.js'))) {
            appRoot = pathModule.resolve(__dirname, '..');
        }
        if (!fs.existsSync(pathModule.join(appRoot, 'build-scripts', 'dist-editor-worker.js'))) {
            appRoot = process.cwd();
        }

        const outputDir = pathModule.isAbsolute(outputPath)
            ? outputPath
            : pathModule.join(appRoot, outputPath);

        const editorNwVersion = process.versions.nw || process.versions['node-webkit'];
        if (!editorNwVersion) {
            alert('Could not determine the editor NW.js version.');
            return;
        }
        const nwVersionPolicy = document.getElementById('dist-nw-version-policy').value;
        const exactNwVersion = document.getElementById('dist-nw-version-exact').value.trim().replace(/^v/i, '');
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

        this.isBuilding = true;
        document.getElementById('dist-start-btn').style.display = 'none';
        document.getElementById('dist-cancel-btn').style.display = 'block';

        this.clearLog();
        this.log('Launching distribution worker...', 'var(--color-link)');
        this.log(`App root: ${appRoot}`, 'var(--color-text-muted)');

        try {
            const { Worker } = require('worker_threads');
            const workerPath = pathModule.join(appRoot, 'build-scripts', 'dist-editor-worker.js');
            if (!fs.existsSync(workerPath)) {
                throw new Error(`Worker not found at: ${workerPath}`);
            }

            this.worker = new Worker(workerPath, {
                workerData: {
                    appRoot,
                    platforms,
                    packageType,
                    edition,
                    nwVersion: nwVersionPolicy === 'exact' ? exactNwVersion : editorNwVersion,
                    nwVersionPolicy,
                    editorNwVersion,
                    editorExecPath: process.execPath,
                    includeProprietaryCodecs,
                    createLinuxAppImage,
                    outputDir,
                }
            });

            this.worker.on('message', (msg) => {
                if (msg.type === 'log') {
                    this.log(msg.message, msg.color || 'var(--color-text)');
                } else if (msg.type === 'progress') {
                    this.updateProgress(msg.percent, msg.status);
                } else if (msg.type === 'done') {
                    if (msg.success) {
                        this.log('', 'var(--color-text)');
                        this.log(`Output directory: ${outputDir}`, 'var(--color-text)');
                        this.updateProgress(100, 'Build complete!');
                    }
                }
            });

            this.worker.on('error', (err) => {
                this.log('', 'var(--color-text)');
                this.log('========================================', 'var(--color-danger-bright)');
                this.log('Worker error:', 'var(--color-danger-bright)');
                this.log(err.message || String(err), 'var(--color-danger-bright)');
                this.log('========================================', 'var(--color-danger-bright)');
                this.buildFinished();
            });

            this.worker.on('exit', (code) => {
                if (code !== 0 && this.isBuilding) {
                    this.log(`Worker exited with code ${code}`, 'var(--color-danger-bright)');
                }
                this.buildFinished();
            });

        } catch (error) {
            this.log('', 'var(--color-text)');
            this.log('========================================', 'var(--color-danger-bright)');
            this.log('Error starting build:', 'var(--color-danger-bright)');
            this.log(error.message, 'var(--color-danger-bright)');
            if (error.stack) this.log(error.stack, 'var(--color-danger-bright)');
            this.log('========================================', 'var(--color-danger-bright)');
            this.buildFinished();
        }
    }

    buildFinished() {
        this.isBuilding = false;
        this.worker = null;
        document.getElementById('dist-start-btn').style.display = 'block';
        document.getElementById('dist-cancel-btn').style.display = 'none';
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
