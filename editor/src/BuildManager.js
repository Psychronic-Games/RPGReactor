class BuildManager {
    constructor() {
        this.isBuilding = false;
        this.modal = null;
        this.worker = null;
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

                                    <label class="build-option-label" style="display: flex; align-items: center; padding: 8px 10px; background: var(--color-bg-panel); border: 1px solid var(--color-border); border-radius: 4px; cursor: pointer; transition: all 0.2s;">
                                        <input type="checkbox" id="build-platform-web" value="web" class="system-checkbox" style="margin-right: 10px;">
                                        <div style="flex: 1;">
                                            <div style="color: var(--color-text); font-weight: 600; font-size: 13px;">Web (HTML5)</div>
                                            <div style="color: var(--color-text-muted); font-size: 11px;">Build for browser deployment (itch.io, web hosting)</div>
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
                                            <div style="color: var(--color-text); font-weight: 600; font-size: 13px;">Use Bundled (Recommended)</div>
                                            <div style="color: var(--color-text-muted); font-size: 11px;">Uses the NW.js included with RPG Reactor (includes FFMPEG with proprietary codecs)</div>
                                        </div>
                                    </label>

                                    <label class="build-option-label" style="display: flex; align-items: center; padding: 8px 10px; background: var(--color-bg-panel); border: 1px solid var(--color-border); border-radius: 4px; cursor: pointer; transition: all 0.2s;">
                                        <input type="radio" name="build-runtime-source" value="download" class="system-radio" style="margin-right: 10px;">
                                        <div style="flex: 1;">
                                            <div style="color: var(--color-text); font-weight: 600; font-size: 13px;">Download from Web</div>
                                            <div style="color: var(--color-text-muted); font-size: 11px;">Downloads NW.js from dl.nwjs.io (may lack proprietary codec support)</div>
                                        </div>
                                    </label>
                                </div>
                                <div style="color: var(--color-text-muted); font-size: 11px; margin-top: 4px;">Only applies to desktop platforms (Windows, macOS, Linux)</div>
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

        // Set up event listeners
        this.setupEventListeners();
    }

    setupEventListeners() {
        const closeBtn = document.getElementById('build-modal-close-btn');
        const startBtn = document.getElementById('build-start-btn');
        const cancelBtn = document.getElementById('build-cancel-btn');
        const selectOutputBtn = document.getElementById('build-select-output-btn');

        closeBtn.addEventListener('click', () => this.close());
        startBtn.addEventListener('click', () => this.startBuild());
        cancelBtn.addEventListener('click', () => this.cancelBuild());
        selectOutputBtn.addEventListener('click', () => this.selectOutputDirectory());

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

    open() {
        this.modal.style.display = 'flex';
        this.clearLog();
        this.resetProgress();
        this.log('Ready to build. Select platforms and click "Start Build".', 'var(--color-text-muted)');
    }

    close() {
        if (this.isBuilding) {
            const confirm = window.confirm('A build is in progress. Are you sure you want to close?');
            if (!confirm) return;
            this.cancelBuild();
        }
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
            }
        });
        input.click();
    }

    clearLog() {
        const logDiv = document.getElementById('build-log');
        logDiv.innerHTML = '';
    }

    log(message, color = 'var(--color-text)') {
        const logDiv = document.getElementById('build-log');
        const line = document.createElement('div');
        line.textContent = message;
        line.style.color = color;
        logDiv.appendChild(line);
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

        // Detect NW.js version for downloading matching binaries
        const nwVersion = process.versions.nw || process.versions['node-webkit'] || '0.92.0';
        // Runtime source: 'bundled' (includes proprietary codecs) or 'download'
        const runtimeSource = document.querySelector('input[name="build-runtime-source"]:checked').value;

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
                    nwVersion: nwVersion,
                    runtimeSource: runtimeSource,
                    appRoot: appRoot,
                }
            });

            // Log messages from worker
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
