/**
 * AudioCommandEditor - Editor for audio-related event commands
 * Handles Play BGM, Play BGS, Play ME, Play SE, Fadeout BGM, Fadeout BGS, Stop SE
 * Uses the global audio player for synchronized playback
 */
class AudioCommandEditor {
    constructor(databaseManager, projectController) {
        this.databaseManager = databaseManager;
        this.projectController = projectController;
        this.modal = null;
        this.callback = null;
        this.command = null;
        this.commandType = null;
    }

    /**
     * Get the global audio player instance
     */
    getAudioPlayer() {
        return window.reactor && window.reactor.audioPlayer ? window.reactor.audioPlayer : null;
    }

    /**
     * Get the audio element for the correct channel (based on command type)
     */
    getAudioElement() {
        const player = this.getAudioPlayer();
        if (!player || !this.commandType) return null;
        return player.getChannelAudio(this.commandType.folder);
    }

    /**
     * Get the Web Audio API nodes for the correct channel
     */
    getAudioNodes() {
        const player = this.getAudioPlayer();
        if (!player || !this.commandType) return null;
        const channel = player.getChannel(this.commandType.folder);
        if (!channel) return null;
        return { gainNode: channel.gainNode, panNode: channel.panNode };
    }

    getCurrentChannel() {
        const player = this.getAudioPlayer();
        if (!player || !this.commandType || !this.commandType.folder) return null;
        return player.getChannel(this.commandType.folder);
    }

    stripAudioExtension(filename) {
        if (!filename) return '';
        const basename = filename.split('/').pop().split('\\').pop();
        const decodedName = (() => {
            try {
                return decodeURIComponent(basename);
            } catch (error) {
                return basename;
            }
        })();
        return decodedName.replace(/\.(ogg|m4a|mp3)$/i, '');
    }

    getCurrentTrackName() {
        const channel = this.getCurrentChannel();
        if (!channel || !channel.currentTrack) return '';
        return this.stripAudioExtension(channel.currentTrack.name || channel.currentTrack.path || '');
    }

    getCurrentChannelParameters() {
        const channel = this.getCurrentChannel();
        if (!channel) return null;

        return {
            volume: Math.round((channel.audio.volume || 0) * 100),
            pitch: Math.round((channel.audio.playbackRate || 1) * 100),
            pan: channel.panNode && channel.panNode.pan ? Math.round(channel.panNode.pan.value * 100) : 0
        };
    }

    applyCurrentTrackDefaults() {
        if (!this.commandType || !this.commandType.hasParams || this.commandType.fadeout || !this.commandType.folder) return;
        if (!this.command.parameters || !this.command.parameters[0]) return;

        const audioParams = this.command.parameters[0];
        if (audioParams.name) return;

        const currentTrackName = this.getCurrentTrackName();
        if (!currentTrackName) return;

        const currentParams = this.getCurrentChannelParameters();
        audioParams.name = currentTrackName;
        if (currentParams) {
            audioParams.volume = currentParams.volume;
            audioParams.pitch = currentParams.pitch;
            audioParams.pan = currentParams.pan;
        }
    }

    getProjectAudioFiles() {
        const currentProject = this.projectController.getCurrentProject ?
            this.projectController.getCurrentProject() :
            this.projectController.currentProject;

        if (!currentProject || !currentProject.path || !this.commandType || !this.commandType.folder) {
            return [];
        }

        const fs = require('fs');
        const path = require('path');
        const audioFolder = path.join(currentProject.path, 'audio', this.commandType.folder);

        if (!fs.existsSync(audioFolder)) {
            return [];
        }

        return fs.readdirSync(audioFolder)
            .filter(file => file.endsWith('.ogg') || file.endsWith('.m4a') || file.endsWith('.mp3'))
            .map(file => file.replace(/\.(ogg|m4a|mp3)$/i, ''))
            .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
    }

    refreshInlineSelection(container, selectedFile) {
        const selectedText = container.querySelector('.audio-command-selected-track');
        if (selectedText) {
            selectedText.textContent = selectedFile ? `[${this.commandType.folder.toUpperCase()}] ${selectedFile}` : 'No Track Selected';
        }

        container.querySelectorAll('.audio-track-item').forEach(item => {
            const isSelected = item.dataset.track === selectedFile;
            item.classList.toggle('playing', isSelected);
            item.style.backgroundColor = isSelected ? 'var(--color-accent-shadow)' : 'transparent';
            item.style.color = isSelected ? 'var(--color-accent-hover)' : 'var(--color-text)';
        });
    }

    /**
     * Show editor for an audio command
     * @param {object} command - The command to edit (or null for new)
     * @param {number} code - Command code (241=BGM, 245=BGS, 249=ME, 250=SE, 242=Fadeout BGM, etc)
     * @param {function} callback - Callback when done editing
     */
    show(command, code, callback) {
        this.commandType = this.getCommandType(code);
        this.command = command || this.createDefaultCommand(code);
        this.applyCurrentTrackDefaults();
        this.callback = callback;

        if (!this.modal) {
            this.createModal();
        }

        this.renderContent();
        this.modal.style.display = 'flex';
    }

    /**
     * Get command type info from code
     */
    getCommandType(code) {
        const types = {
            241: { name: 'Play BGM', folder: 'bgm', hasParams: true },
            245: { name: 'Play BGS', folder: 'bgs', hasParams: true },
            249: { name: 'Play ME', folder: 'me', hasParams: true },
            250: { name: 'Play SE', folder: 'se', hasParams: true },
            242: { name: 'Fadeout BGM', folder: null, hasParams: true, fadeout: true },
            246: { name: 'Fadeout BGS', folder: null, hasParams: true, fadeout: true },
            251: { name: 'Stop SE', folder: null, hasParams: false }
        };
        return types[code] || types[241];
    }

    /**
     * Create default command structure
     */
    createDefaultCommand(code) {
        const type = this.getCommandType(code);

        if (type.fadeout) {
            // Fadeout commands: just duration
            return {
                code: code,
                indent: 0,
                parameters: [60] // 60 frames = 1 second
            };
        } else if (!type.hasParams) {
            // Stop SE has no parameters
            return {
                code: code,
                indent: 0,
                parameters: []
            };
        } else {
            // Play commands: audio object
            return {
                code: code,
                indent: 0,
                parameters: [{
                    name: '',
                    volume: 90,
                    pitch: 100,
                    pan: 0
                }]
            };
        }
    }

    /**
     * Create modal structure
     */
    createModal() {
        this.modal = document.createElement('div');
        this.modal.className = 'audio-command-editor-modal';
        this.modal.style.cssText = `
            display: none;
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background-color: rgba(0, 0, 0, 0.7);
            z-index: 10005;
            justify-content: center;
            align-items: center;
        `;

        const container = document.createElement('div');
        container.className = 'audio-command-container';
        container.style.cssText = `
            background-color: var(--color-bg-surface);
            border: 1px solid var(--color-border);
            border-radius: 6px;
            width: 900px;
            max-width: 95vw;
            max-height: 92vh;
            display: flex;
            flex-direction: column;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
        `;

        this.modal.appendChild(container);

        // Close on background click
        this.modal.addEventListener('click', (e) => {
            if (e.target === this.modal) {
                this.close();
            }
        });

        document.body.appendChild(this.modal);
    }

    /**
     * Render modal content
     */
    renderContent() {
        const container = this.modal.querySelector('.audio-command-container');
        container.innerHTML = '';

        // Header
        const header = document.createElement('div');
        header.style.cssText = `
            padding: 12px 16px;
            background-color: var(--color-bg-panel);
            border-bottom: 1px solid var(--color-border);
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-top-left-radius: 6px;
            border-top-right-radius: 6px;
        `;
        header.innerHTML = `
            <h3 style="margin: 0; color: var(--color-text-strong); font-size: 16px;">${this.commandType.name}</h3>
            <button class="close-btn" style="background: none; border: none; color: var(--color-text-strong); font-size: 20px; cursor: pointer; padding: 0; width: 24px; height: 24px;">×</button>
        `;
        container.appendChild(header);

        header.querySelector('.close-btn').addEventListener('click', () => this.close());

        // Content area
        const content = document.createElement('div');
        content.style.cssText = `
            padding: 16px;
            display: flex;
            flex-direction: column;
            gap: 12px;
            overflow: hidden;
            min-height: 0;
        `;

        if (this.commandType.fadeout) {
            // Fadeout commands: just duration
            content.appendChild(this.createFadeoutControls());
        } else if (!this.commandType.hasParams) {
            // Stop SE: no parameters
            content.innerHTML = '<div style="color: var(--color-text-muted); padding: 20px; text-align: center;">This command has no parameters.</div>';
        } else {
            // Play commands: full audio browser/player matching the main Audio Player UI
            content.appendChild(this.createInlineAudioPlayer());
        }

        container.appendChild(content);

        // Footer with OK/Cancel
        const footer = document.createElement('div');
        footer.style.cssText = `
            padding: 12px 16px;
            border-top: 1px solid var(--color-border);
            background-color: var(--color-bg-panel);
            display: flex;
            justify-content: flex-end;
            gap: 8px;
        `;

        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = 'Cancel';
        cancelBtn.className = 'rr-btn-secondary';
        cancelBtn.addEventListener('click', () => this.close());

        const okBtn = document.createElement('button');
        okBtn.textContent = 'OK';
        okBtn.style.cssText = `
            padding: 6px 20px;
            background-color: var(--color-accent);
            color: var(--color-bg-deep);
            border: 1px solid var(--color-accent);
            border-radius: 3px;
            cursor: pointer;
            font-size: 12px;
            font-weight: bold;
            transition: background-color 0.15s;
        `;
        okBtn.addEventListener('click', () => this.save());
        okBtn.addEventListener('mouseenter', () => { okBtn.style.backgroundColor = 'var(--color-accent-tint-25)'; });
        okBtn.addEventListener('mouseleave', () => { okBtn.style.backgroundColor = 'var(--color-accent)'; });

        footer.appendChild(cancelBtn);
        footer.appendChild(okBtn);
        container.appendChild(footer);

        // Don't auto-load or auto-play when opening the editor
        // User must explicitly hit play to preview audio
    }

    /**
     * Create file selector for audio file
     */
    createInlineAudioPlayer() {
        const wrapper = document.createElement('div');
        wrapper.style.cssText = `
            display: flex;
            flex-direction: column;
            gap: 12px;
            min-height: 0;
        `;

        const selectedName = this.command.parameters[0]?.name || '';

        const info = document.createElement('div');
        info.className = 'audio-player-info';
        info.style.cssText = `
            background: var(--color-bg-panel);
            border: 1px solid var(--color-bg-button);
            border-radius: 4px;
            padding: 12px;
            text-align: center;
        `;
        info.innerHTML = `
            <div class="current-track audio-command-selected-track" style="color: var(--color-accent-hover); font-size: 15px; font-weight: 600; margin-bottom: 4px;">${selectedName ? `[${this.commandType.folder.toUpperCase()}] ${selectedName}` : 'No Track Selected'}</div>
            <div class="track-time audio-command-track-time" style="color: var(--color-text-muted); font-size: 12px;">0:00 / 0:00</div>
        `;
        wrapper.appendChild(info);

        const seekRow = document.createElement('div');
        seekRow.style.cssText = 'display: flex; align-items: center; gap: 8px;';

        const currentTimeLabel = document.createElement('span');
        currentTimeLabel.className = 'audio-current-time';
        currentTimeLabel.textContent = '0:00';
        currentTimeLabel.style.cssText = 'color: var(--color-text); font-size: 11px; min-width: 35px;';

        const seekSlider = document.createElement('input');
        seekSlider.type = 'range';
        seekSlider.min = 0;
        seekSlider.max = 100;
        seekSlider.value = 0;
        seekSlider.className = 'audio-seek-slider audio-control-slider';
        seekSlider.style.cssText = 'flex: 1; cursor: pointer;';

        const durationLabel = document.createElement('span');
        durationLabel.className = 'audio-duration';
        durationLabel.textContent = '0:00';
        durationLabel.style.cssText = 'color: var(--color-text); font-size: 11px; min-width: 35px;';

        seekRow.appendChild(currentTimeLabel);
        seekRow.appendChild(seekSlider);
        seekRow.appendChild(durationLabel);
        wrapper.appendChild(seekRow);

        const controls = document.createElement('div');
        controls.className = 'audio-player-controls';
        controls.style.cssText = `
            display: flex;
            gap: 8px;
            justify-content: center;
            align-items: center;
        `;

        const createTransportButton = (title, svgPath, onClick) => {
            const btn = document.createElement('button');
            btn.className = 'audio-player-button';
            btn.title = title;
            btn.innerHTML = `<svg viewBox="0 0 24 24"><path d="${svgPath}"/></svg>`;
            btn.style.cssText = `
                width: 36px;
                height: 32px;
                background: var(--color-bg-panel);
                border: 1px solid var(--color-border-input);
                border-radius: 4px;
                color: var(--color-text);
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
            `;
            const svg = btn.querySelector('svg');
            svg.style.cssText = 'width: 18px; height: 18px; fill: currentColor;';
            btn.addEventListener('click', onClick);
            btn.addEventListener('mouseenter', () => {
                btn.style.backgroundColor = 'var(--color-accent-tint-25)';
                btn.style.borderColor = 'var(--color-accent)';
            });
            btn.addEventListener('mouseleave', () => {
                const loopActive = btn.classList.contains('active-toggle');
                btn.style.backgroundColor = loopActive ? 'var(--color-accent-hover)' : 'var(--color-bg-panel)';
                btn.style.borderColor = loopActive ? 'var(--color-accent-hover)' : 'var(--color-border-input)';
            });
            return btn;
        };

        const playBtn = createTransportButton('Play', 'M8 5v14l11-7z', () => this.playPreview());
        const pauseBtn = createTransportButton('Pause', 'M6 19h4V5H6v14zm8-14v14h4V5h-4z', () => {
            const audioElement = this.getAudioElement();
            const channel = this.getCurrentChannel();
            if (audioElement) audioElement.pause();
            if (channel) channel.playing = false;
        });
        const stopBtn = createTransportButton('Stop', 'M6 6h12v12H6z', () => this.stopPreview());
        const loopBtn = createTransportButton('Loop: On', 'M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z', () => {
            loopBtn.classList.toggle('active-toggle');
            const loopActive = loopBtn.classList.contains('active-toggle');
            loopBtn.title = loopActive ? 'Loop: On' : 'Loop: Off';
            loopBtn.style.backgroundColor = loopActive ? 'var(--color-accent-hover)' : 'var(--color-bg-panel)';
            loopBtn.style.borderColor = loopActive ? 'var(--color-accent-hover)' : 'var(--color-border-input)';
            loopBtn.style.color = loopActive ? 'var(--color-bg-deep)' : 'var(--color-text)';
            const audioElement = this.getAudioElement();
            if (audioElement) audioElement.loop = loopActive;
        });
        loopBtn.classList.add('audio-loop-button');

        if (this.commandType.folder !== 'se') {
            loopBtn.classList.add('active-toggle');
            loopBtn.style.backgroundColor = 'var(--color-accent-hover)';
            loopBtn.style.borderColor = 'var(--color-accent-hover)';
            loopBtn.style.color = 'var(--color-bg-deep)';
        } else {
            loopBtn.title = 'Loop: Off';
        }

        controls.appendChild(playBtn);
        controls.appendChild(pauseBtn);
        controls.appendChild(stopBtn);
        controls.appendChild(loopBtn);
        wrapper.appendChild(controls);

        const controlsGrid = document.createElement('div');
        controlsGrid.style.cssText = `
            display: grid;
            grid-template-columns: 1fr 1fr 1fr;
            gap: 16px;
            padding: 12px;
            background: var(--color-bg-panel);
            border-radius: 4px;
            border: 1px solid var(--color-bg-button);
        `;
        controlsGrid.appendChild(this.createCompactSliderControl('Volume', this.command.parameters[0]?.volume || 90, 0, 100, 1, '%', (value) => {
            this.command.parameters[0].volume = parseInt(value);
            this.updateAudioVolume(parseInt(value));
        }));
        controlsGrid.appendChild(this.createCompactSliderControl('Pitch', this.command.parameters[0]?.pitch || 100, 50, 150, 1, '%', (value) => {
            this.command.parameters[0].pitch = parseInt(value);
            this.updateAudioPitch(parseInt(value));
        }));
        controlsGrid.appendChild(this.createCompactSliderControl('Pan', this.command.parameters[0]?.pan || 0, -100, 100, 1, '', (value, valueDisplay) => {
            const pan = parseInt(value);
            this.command.parameters[0].pan = pan;
            this.updateAudioPan(pan);
            valueDisplay.textContent = pan === 0 ? 'Center' : (pan > 0 ? `R${Math.abs(pan)}` : `L${Math.abs(pan)}`);
        }, (value) => value === 0 ? 'Center' : (value > 0 ? `R${Math.abs(value)}` : `L${Math.abs(value)}`)));
        wrapper.appendChild(controlsGrid);

        const browser = this.createInlineTrackBrowser(wrapper);
        wrapper.appendChild(browser);

        const updateSeekBar = () => {
            const audioElement = this.getAudioElement();
            if (!audioElement) return;

            const current = audioElement.currentTime || 0;
            const duration = audioElement.duration || 0;
            currentTimeLabel.textContent = this.formatTime(current);
            durationLabel.textContent = this.formatTime(duration);
            wrapper.querySelector('.audio-command-track-time').textContent = `${this.formatTime(current)} / ${this.formatTime(duration)}`;

            if (!seekSlider.dataset.seeking && duration > 0) {
                seekSlider.value = (current / duration) * 100;
            }
        };

        if (this.seekUpdateInterval) {
            clearInterval(this.seekUpdateInterval);
        }
        this.seekUpdateInterval = setInterval(updateSeekBar, 100);
        setTimeout(updateSeekBar, 0);

        seekSlider.addEventListener('mousedown', () => {
            seekSlider.dataset.seeking = 'true';
        });
        seekSlider.addEventListener('mouseup', () => {
            delete seekSlider.dataset.seeking;
        });
        seekSlider.addEventListener('input', (e) => {
            const audioElement = this.getAudioElement();
            if (!audioElement || !audioElement.duration) return;
            const time = (e.target.value / 100) * audioElement.duration;
            audioElement.currentTime = time;
            currentTimeLabel.textContent = this.formatTime(time);
        });

        return wrapper;
    }

    createCompactSliderControl(labelText, defaultValue, min, max, step, suffix, onChange, formatValue = null) {
        const div = document.createElement('div');

        const label = document.createElement('label');
        label.textContent = labelText;
        label.style.cssText = 'display: block; font-size: 12px; color: var(--color-text); margin-bottom: 4px;';

        const row = document.createElement('div');
        row.style.cssText = 'display: flex; align-items: center; gap: 8px;';

        const slider = document.createElement('input');
        slider.type = 'range';
        slider.min = min;
        slider.max = max;
        slider.step = step;
        slider.value = defaultValue;
        slider.className = 'audio-control-slider';
        slider.style.cssText = 'flex: 1;';

        const valueDisplay = document.createElement('span');
        valueDisplay.textContent = formatValue ? formatValue(defaultValue) : defaultValue + suffix;
        valueDisplay.style.cssText = 'font-size: 12px; color: var(--color-text); min-width: 40px;';

        slider.addEventListener('input', (e) => {
            const value = e.target.value;
            valueDisplay.textContent = formatValue ? formatValue(parseInt(value)) : value + suffix;
            onChange(value, valueDisplay);
        });

        row.appendChild(slider);
        row.appendChild(valueDisplay);
        div.appendChild(label);
        div.appendChild(row);

        return div;
    }

    createInlineTrackBrowser(wrapper) {
        const files = this.getProjectAudioFiles();
        const browser = document.createElement('div');
        browser.style.cssText = `
            display: flex;
            height: 360px;
            min-height: 220px;
            max-height: 50vh;
            border: 1px solid var(--color-border-input);
            border-radius: 4px;
            overflow: hidden;
            resize: vertical;
        `;

        const tabBar = document.createElement('div');
        tabBar.style.cssText = `
            width: 52px;
            background-color: var(--color-bg-list-item);
            border-right: 1px solid var(--color-border);
            display: flex;
            flex-direction: column;
            gap: 0;
            overflow-y: auto;
            padding: 2px;
        `;

        const trackList = document.createElement('div');
        trackList.style.cssText = 'background: var(--color-bg-surface); flex: 1; overflow-y: auto; padding: 0;';

        if (files.length === 0) {
            trackList.innerHTML = `<p style="color: var(--color-text-muted); padding: 20px; text-align: center;">No ${this.commandType.folder.toUpperCase()} files found</p>`;
            browser.appendChild(tabBar);
            browser.appendChild(trackList);
            return browser;
        }

        const firstLetters = new Set();
        files.forEach(name => {
            const firstChar = name.charAt(0).toUpperCase();
            firstLetters.add(/[A-Z]/.test(firstChar) ? firstChar : '#');
        });

        const sortedLetters = Array.from(firstLetters).sort((a, b) => {
            if (a === '#') return -1;
            if (b === '#') return 1;
            return a.localeCompare(b);
        });

        let currentActiveTab = null;
        const setActiveTab = (letter) => {
            if (!letter || letter === currentActiveTab) return;
            currentActiveTab = letter;
            tabBar.querySelectorAll('button').forEach(tab => {
                const active = tab.dataset.letter === letter;
                tab.classList.toggle('active', active);
                tab.style.backgroundColor = active ? 'var(--color-accent-hover)' : 'var(--color-bg-input-alt)';
                tab.style.color = active ? 'var(--color-bg-deep)' : 'var(--color-text-strong)';
            });
        };

        sortedLetters.forEach((letter, index) => {
            const tab = document.createElement('button');
            tab.textContent = letter;
            tab.dataset.letter = letter;
            tab.style.cssText = `
                padding: 1px 4px;
                background-color: var(--color-bg-input-alt);
                color: var(--color-text-strong);
                border: none;
                border-radius: 3px;
                cursor: pointer;
                font-size: 10px;
                transition: background-color 0.15s;
                text-align: center;
                min-height: 17px;
                height: 17px;
                font-weight: bold;
                line-height: 15px;
                margin-bottom: ${index < sortedLetters.length - 1 ? '1px' : '0'};
            `;

            tab.addEventListener('click', () => this.scrollToLetter(trackList, letter));
            tab.addEventListener('mouseenter', () => {
                if (!tab.classList.contains('active')) {
                    tab.style.backgroundColor = 'var(--color-accent-shadow)';
                    tab.style.color = 'var(--color-accent-hover)';
                }
            });
            tab.addEventListener('mouseleave', () => {
                if (!tab.classList.contains('active')) {
                    tab.style.backgroundColor = 'var(--color-bg-input-alt)';
                    tab.style.color = 'var(--color-text-strong)';
                }
            });

            tabBar.appendChild(tab);
        });

        let currentLetter = null;
        const selectedName = this.command.parameters[0]?.name || '';

        files.forEach(name => {
            const firstChar = name.charAt(0).toUpperCase();
            const letter = /[A-Z]/.test(firstChar) ? firstChar : '#';

            if (letter !== currentLetter) {
                currentLetter = letter;
                const letterHeader = document.createElement('div');
                letterHeader.className = 'letter-section';
                letterHeader.dataset.letter = letter;
                letterHeader.textContent = letter;
                letterHeader.style.cssText = `
                    font-weight: bold;
                    font-size: 14px;
                    color: var(--color-accent-hover);
                    margin-top: 12px;
                    margin-bottom: 6px;
                    padding: 0 12px 4px 12px;
                    border-bottom: 1px solid var(--color-border);
                `;
                trackList.appendChild(letterHeader);
            }

            const item = document.createElement('div');
            const selected = name === selectedName;
            item.className = `audio-track-item ${selected ? 'playing' : ''}`;
            item.dataset.track = name;
            item.textContent = name;
            item.style.cssText = `
                padding: 7px 12px;
                cursor: pointer;
                color: ${selected ? 'var(--color-accent-hover)' : 'var(--color-text)'};
                background: ${selected ? 'var(--color-accent-shadow)' : 'transparent'};
                border-bottom: 1px solid rgba(62, 62, 66, 0.35);
                font-size: 12px;
            `;

            item.addEventListener('mouseenter', () => {
                if (item.dataset.track !== this.command.parameters[0]?.name) {
                    item.style.backgroundColor = 'var(--color-accent-shadow)';
                    item.style.color = 'var(--color-accent-hover)';
                }
            });
            item.addEventListener('mouseleave', () => {
                const isSelected = item.dataset.track === this.command.parameters[0]?.name;
                item.style.backgroundColor = isSelected ? 'var(--color-accent-shadow)' : 'transparent';
                item.style.color = isSelected ? 'var(--color-accent-hover)' : 'var(--color-text)';
            });
            item.addEventListener('click', () => {
                this.command.parameters[0].name = name;
                this.refreshInlineSelection(wrapper, name);
                this.playPreview();
            });

            trackList.appendChild(item);
        });

        trackList.addEventListener('scroll', () => {
            const sections = trackList.querySelectorAll('.letter-section');
            const containerTop = trackList.getBoundingClientRect().top;
            let activeLetter = null;

            sections.forEach(section => {
                const sectionTop = section.getBoundingClientRect().top;
                if (sectionTop - containerTop <= 100) {
                    activeLetter = section.dataset.letter;
                }
            });

            if (activeLetter) {
                setActiveTab(activeLetter);
            }
        });

        browser.appendChild(tabBar);
        browser.appendChild(trackList);

        if (selectedName) {
            setTimeout(() => {
                const selectedItem = Array.from(trackList.querySelectorAll('.audio-track-item'))
                    .find(item => item.dataset.track === selectedName);
                if (selectedItem) {
                    selectedItem.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            }, 100);
        }

        return browser;
    }

    createFileSelector() {
        const div = document.createElement('div');
        div.style.cssText = 'display: flex; flex-direction: column; gap: 6px;';

        const label = document.createElement('div');
        label.textContent = 'Audio File:';
        label.style.cssText = 'font-weight: bold; font-size: 13px; color: var(--color-text);';

        const row = document.createElement('div');
        row.style.cssText = 'display: flex; gap: 8px; align-items: center;';

        const fileDisplay = document.createElement('input');
        fileDisplay.type = 'text';
        fileDisplay.value = this.command.parameters[0]?.name || '(None)';
        fileDisplay.readOnly = true;
        fileDisplay.className = 'audio-file-display';
        fileDisplay.style.cssText = `
            flex: 1;
            padding: 6px 10px;
            background-color: var(--color-bg-input);
            color: var(--color-text);
            border: 1px solid var(--color-border-input);
            border-radius: 3px;
            font-size: 12px;
        `;

        const browseBtn = document.createElement('button');
        browseBtn.textContent = 'Browse...';
        browseBtn.style.cssText = `
            padding: 6px 16px;
            background-color: var(--color-accent);
            color: var(--color-bg-deep);
            border: 1px solid var(--color-accent);
            border-radius: 3px;
            cursor: pointer;
            font-size: 12px;
            font-weight: bold;
        `;
        browseBtn.addEventListener('click', () => {
            this.browseAudioFiles((filename) => {
                if (filename) {
                    this.command.parameters[0].name = filename;
                    fileDisplay.value = filename;
                    // Don't auto-play when selecting from browse - user must hit Play button
                }
            });
        });

        row.appendChild(fileDisplay);
        row.appendChild(browseBtn);
        div.appendChild(label);
        div.appendChild(row);

        // Add preview controls
        const previewRow = document.createElement('div');
        previewRow.style.cssText = 'display: flex; gap: 8px; align-items: center; margin-top: 4px;';

        const playBtn = document.createElement('button');
        playBtn.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14"><path d="M8 5v14l11-7z" fill="currentColor"/></svg> Play';
        playBtn.className = 'audio-play-btn';
        playBtn.style.cssText = `
            padding: 6px 16px;
            background-color: var(--color-bg-panel);
            color: var(--color-text);
            border: 1px solid var(--color-border-input);
            border-radius: 3px;
            cursor: pointer;
            font-size: 12px;
            display: flex;
            align-items: center;
            gap: 4px;
            transition: background-color 0.15s;
        `;
        playBtn.addEventListener('click', () => this.playPreview());
        playBtn.addEventListener('mouseenter', () => { playBtn.style.backgroundColor = 'var(--color-accent-tint-25)'; });
        playBtn.addEventListener('mouseleave', () => { playBtn.style.backgroundColor = 'var(--color-bg-panel)'; });

        const stopBtn = document.createElement('button');
        stopBtn.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14"><path d="M6 6h12v12H6z" fill="currentColor"/></svg> Stop';
        stopBtn.className = 'audio-stop-btn';
        stopBtn.style.cssText = `
            padding: 6px 16px;
            background-color: var(--color-bg-panel);
            color: var(--color-text);
            border: 1px solid var(--color-border-input);
            border-radius: 3px;
            cursor: pointer;
            font-size: 12px;
            display: flex;
            align-items: center;
            gap: 4px;
            transition: background-color 0.15s;
        `;
        stopBtn.addEventListener('click', () => this.stopPreview());
        stopBtn.addEventListener('mouseenter', () => { stopBtn.style.backgroundColor = 'var(--color-accent-tint-25)'; });
        stopBtn.addEventListener('mouseleave', () => { stopBtn.style.backgroundColor = 'var(--color-bg-panel)'; });

        const loopCheckbox = document.createElement('input');
        loopCheckbox.type = 'checkbox';
        // SE should default to no loop, others should loop
        loopCheckbox.checked = (this.commandType.folder !== 'se');
        loopCheckbox.className = 'audio-loop-checkbox';
        loopCheckbox.style.cssText = 'margin-left: 8px;';
        loopCheckbox.addEventListener('change', (e) => {
            const audioElement = this.getAudioElement();
            if (audioElement) {
                audioElement.loop = e.target.checked;
            }
        });

        const loopLabel = document.createElement('label');
        loopLabel.textContent = 'Loop';
        loopLabel.style.cssText = 'color: var(--color-text); font-size: 12px; cursor: pointer;';
        loopLabel.addEventListener('click', () => loopCheckbox.click());

        previewRow.appendChild(playBtn);
        previewRow.appendChild(stopBtn);
        previewRow.appendChild(loopCheckbox);
        previewRow.appendChild(loopLabel);
        div.appendChild(previewRow);

        // Add seek slider
        const seekRow = document.createElement('div');
        seekRow.style.cssText = 'display: flex; gap: 8px; align-items: center; margin-top: 8px;';

        const currentTimeLabel = document.createElement('span');
        currentTimeLabel.className = 'audio-current-time';
        currentTimeLabel.textContent = '0:00';
        currentTimeLabel.style.cssText = 'color: var(--color-text); font-size: 11px; min-width: 35px;';

        const seekSlider = document.createElement('input');
        seekSlider.type = 'range';
        seekSlider.min = 0;
        seekSlider.max = 100;
        seekSlider.value = 0;
        seekSlider.className = 'audio-seek-slider audio-control-slider';
        seekSlider.style.cssText = 'flex: 1;';

        const durationLabel = document.createElement('span');
        durationLabel.className = 'audio-duration';
        durationLabel.textContent = '0:00';
        durationLabel.style.cssText = 'color: var(--color-text); font-size: 11px; min-width: 35px;';

        // Update seek slider as audio plays
        const updateSeekBar = () => {
            const audioElement = this.getAudioElement();
            if (!audioElement) return;

            if (!seekSlider.dataset.seeking) {
                const percent = (audioElement.currentTime / audioElement.duration) * 100;
                seekSlider.value = percent || 0;
                currentTimeLabel.textContent = this.formatTime(audioElement.currentTime);
            }
        };

        // Store the interval ID for cleanup
        if (!this.seekUpdateInterval) {
            this.seekUpdateInterval = setInterval(updateSeekBar, 100);
        }

        // Update duration when loaded
        const updateDuration = () => {
            const audioElement = this.getAudioElement();
            if (audioElement && audioElement.duration) {
                durationLabel.textContent = this.formatTime(audioElement.duration);
            }
        };
        setTimeout(updateDuration, 100);

        // Seeking
        seekSlider.addEventListener('mousedown', () => {
            seekSlider.dataset.seeking = 'true';
        });

        seekSlider.addEventListener('mouseup', () => {
            delete seekSlider.dataset.seeking;
        });

        seekSlider.addEventListener('input', (e) => {
            const audioElement = this.getAudioElement();
            if (!audioElement) return;

            const percent = e.target.value;
            const time = (percent / 100) * audioElement.duration;
            audioElement.currentTime = time;
            currentTimeLabel.textContent = this.formatTime(time);
        });

        seekRow.appendChild(currentTimeLabel);
        seekRow.appendChild(seekSlider);
        seekRow.appendChild(durationLabel);
        div.appendChild(seekRow);

        return div;
    }

    /**
     * Format time in MM:SS format
     */
    formatTime(seconds) {
        if (isNaN(seconds)) return '0:00';
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }

    /**
     * Create volume control slider
     */
    createVolumeControl() {
        return this.createSliderControl(
            'Volume:',
            this.command.parameters[0]?.volume || 90,
            0,
            100,
            1,
            '%',
            (value) => {
                this.command.parameters[0].volume = parseInt(value);
                this.updateAudioVolume(parseInt(value));
            }
        );
    }

    /**
     * Create pitch control slider
     */
    createPitchControl() {
        return this.createSliderControl(
            'Pitch:',
            this.command.parameters[0]?.pitch || 100,
            50,
            150,
            1,
            '%',
            (value) => {
                this.command.parameters[0].pitch = parseInt(value);
                this.updateAudioPitch(parseInt(value));
            }
        );
    }

    /**
     * Create pan control slider
     */
    createPanControl() {
        return this.createSliderControl(
            'Pan:',
            this.command.parameters[0]?.pan || 0,
            -100,
            100,
            1,
            '',
            (value) => {
                this.command.parameters[0].pan = parseInt(value);
                this.updateAudioPan(parseInt(value));
            }
        );
    }

    /**
     * Create fadeout duration control
     */
    createFadeoutControls() {
        return this.createSliderControl(
            'Duration (seconds):',
            (this.command.parameters[0] || 60) / 60,
            0,
            10,
            0.1,
            's',
            (value) => {
                this.command.parameters[0] = Math.round(parseFloat(value) * 60);
            }
        );
    }

    /**
     * Generic slider control creator
     */
    createSliderControl(labelText, defaultValue, min, max, step, suffix, onChange) {
        const div = document.createElement('div');
        div.style.cssText = 'display: flex; flex-direction: column; gap: 6px;';

        const label = document.createElement('div');
        label.textContent = labelText;
        label.style.cssText = 'font-weight: bold; font-size: 13px; color: var(--color-text);';

        const row = document.createElement('div');
        row.style.cssText = 'display: flex; gap: 8px; align-items: center;';

        const slider = document.createElement('input');
        slider.type = 'range';
        slider.min = min;
        slider.max = max;
        slider.step = step;
        slider.value = defaultValue;
        slider.className = 'audio-control-slider';
        slider.style.cssText = 'flex: 1;';

        const valueDisplay = document.createElement('span');
        valueDisplay.textContent = defaultValue + suffix;
        valueDisplay.style.cssText = 'min-width: 50px; color: var(--color-text); font-size: 12px;';

        slider.addEventListener('input', (e) => {
            const value = e.target.value;
            valueDisplay.textContent = value + suffix;
            onChange(value);
        });

        row.appendChild(slider);
        row.appendChild(valueDisplay);
        div.appendChild(label);
        div.appendChild(row);

        return div;
    }

    /**
     * Browse for audio files
     */
    browseAudioFiles(callback) {
        const currentProject = this.projectController.getCurrentProject ?
            this.projectController.getCurrentProject() :
            this.projectController.currentProject;

        if (!currentProject || !currentProject.path) {
            alert('No project loaded');
            return;
        }

        const fs = require('fs');
        const path = require('path');
        const audioFolder = path.join(currentProject.path, 'audio', this.commandType.folder);

        // Check if folder exists
        if (!fs.existsSync(audioFolder)) {
            alert(`Audio folder not found: ${audioFolder}`);
            return;
        }

        // Read audio files
        const files = fs.readdirSync(audioFolder).filter(file => {
            return file.endsWith('.ogg') || file.endsWith('.m4a') || file.endsWith('.mp3');
        });

        if (files.length === 0) {
            alert('No audio files found in folder');
            return;
        }

        // Get currently selected file
        const currentSelection = this.command.parameters[0]?.name || null;

        // Show file picker dialog
        this.showFilePicker(files, currentSelection, callback);
    }

    /**
     * Show file picker dialog
     */
    showFilePicker(files, currentSelection, callback) {
        let selectedFile = currentSelection;
        const picker = document.createElement('div');
        picker.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background-color: rgba(0, 0, 0, 0.8);
            z-index: 10006;
            display: flex;
            justify-content: center;
            align-items: center;
        `;

        const container = document.createElement('div');
        container.style.cssText = `
            background-color: var(--color-bg-surface);
            border: 1px solid var(--color-border);
            border-radius: 6px;
            width: 650px;
            height: 85vh;
            max-height: 850px;
            display: flex;
            flex-direction: column;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
        `;

        // Header
        const header = document.createElement('div');
        header.style.cssText = `
            padding: 12px 16px;
            background-color: var(--color-bg-panel);
            border-bottom: 1px solid var(--color-border);
            display: flex;
            flex-direction: column;
            gap: 8px;
        `;

        // Title row
        const titleRow = document.createElement('div');
        titleRow.style.cssText = `
            display: flex;
            justify-content: space-between;
            align-items: center;
        `;
        titleRow.innerHTML = `
            <h3 style="margin: 0; color: var(--color-text-strong); font-size: 16px;">Select Audio File</h3>
            <button class="close-picker" style="background: none; border: none; color: var(--color-text-strong); font-size: 20px; cursor: pointer;">×</button>
        `;
        header.appendChild(titleRow);

        // Preview controls row
        const previewRow = document.createElement('div');
        previewRow.style.cssText = `
            display: flex;
            gap: 8px;
            align-items: center;
        `;

        const playPreviewBtn = document.createElement('button');
        playPreviewBtn.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14"><path d="M8 5v14l11-7z" fill="currentColor"/></svg> Preview';
        playPreviewBtn.style.cssText = `
            padding: 6px 16px;
            background-color: var(--color-bg-panel);
            color: var(--color-text);
            border: 1px solid var(--color-border-input);
            border-radius: 3px;
            cursor: pointer;
            font-size: 12px;
            display: flex;
            align-items: center;
            gap: 4px;
            transition: background-color 0.15s;
        `;
        playPreviewBtn.addEventListener('mouseenter', () => { playPreviewBtn.style.backgroundColor = 'var(--color-accent-tint-25)'; });
        playPreviewBtn.addEventListener('mouseleave', () => { playPreviewBtn.style.backgroundColor = 'var(--color-bg-panel)'; });

        const stopPreviewBtn = document.createElement('button');
        stopPreviewBtn.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14"><path d="M6 6h12v12H6z" fill="currentColor"/></svg> Stop';
        stopPreviewBtn.style.cssText = `
            padding: 6px 16px;
            background-color: var(--color-bg-panel);
            color: var(--color-text);
            border: 1px solid var(--color-border-input);
            border-radius: 3px;
            cursor: pointer;
            font-size: 12px;
            display: flex;
            align-items: center;
            gap: 4px;
            transition: background-color 0.15s;
        `;
        stopPreviewBtn.addEventListener('mouseenter', () => { stopPreviewBtn.style.backgroundColor = 'var(--color-accent-tint-25)'; });
        stopPreviewBtn.addEventListener('mouseleave', () => { stopPreviewBtn.style.backgroundColor = 'var(--color-bg-panel)'; });

        const previewLabel = document.createElement('span');
        previewLabel.className = 'preview-filename';
        previewLabel.textContent = selectedFile ? selectedFile : 'No file selected';
        previewLabel.style.cssText = `
            color: var(--color-text);
            font-size: 12px;
            flex: 1;
        `;

        previewRow.appendChild(playPreviewBtn);
        previewRow.appendChild(stopPreviewBtn);
        previewRow.appendChild(previewLabel);
        header.appendChild(previewRow);

        // Main content area with tabs and list
        const mainContent = document.createElement('div');
        mainContent.style.cssText = `
            display: flex;
            flex: 1;
            overflow: hidden;
        `;

        // Sort files alphabetically
        const sortedFiles = files.map(file => file.replace(/\.(ogg|m4a|mp3)$/, '')).sort();

        // Create alphabet tabs
        const tabBar = document.createElement('div');
        tabBar.className = 'alphabet-tabs';
        tabBar.style.cssText = `
            width: 60px;
            background-color: var(--color-bg-list-item);
            border-right: 1px solid var(--color-border);
            display: flex;
            flex-direction: column;
            gap: 1px;
            overflow-y: auto;
            padding: 6px 4px;
        `;

        // Get first letters that exist in the file list
        const firstLetters = new Set();
        sortedFiles.forEach(name => {
            const firstChar = name.charAt(0).toUpperCase();
            if (/[A-Z]/.test(firstChar)) {
                firstLetters.add(firstChar);
            } else {
                firstLetters.add('#'); // For numbers and special chars
            }
        });

        const sortedLetters = Array.from(firstLetters).sort((a, b) => {
            if (a === '#') return -1;
            if (b === '#') return 1;
            return a.localeCompare(b);
        });

        // Create tabs for available letters
        sortedLetters.forEach(letter => {
            const tab = document.createElement('button');
            tab.textContent = letter;
            tab.dataset.letter = letter;
            tab.style.cssText = `
                padding: 4px 6px;
                background-color: var(--color-bg-input-alt);
                color: var(--color-text-strong);
                border: none;
                border-radius: 3px;
                cursor: pointer;
                font-size: 11px;
                transition: background-color 0.15s;
                text-align: center;
                min-height: 22px;
                font-weight: bold;
            `;

            tab.addEventListener('click', () => {
                this.scrollToLetter(fileList, letter);
            });

            tab.addEventListener('mouseenter', () => {
                if (currentActiveTab !== letter) {
                    tab.style.backgroundColor = 'var(--color-link)';
                }
            });

            tab.addEventListener('mouseleave', () => {
                if (currentActiveTab !== letter) {
                    tab.style.backgroundColor = 'var(--color-bg-input-alt)';
                }
            });

            tabBar.appendChild(tab);
        });

        mainContent.appendChild(tabBar);

        // File list
        const fileList = document.createElement('div');
        fileList.className = 'audio-file-list';
        fileList.style.cssText = `
            flex: 1;
            overflow-y: auto;
            padding: 8px;
            background-color: var(--color-bg-surface);
        `;

        // Group files by first letter
        let currentLetter = null;

        sortedFiles.forEach(displayName => {
            const firstChar = displayName.charAt(0).toUpperCase();
            const letter = /[A-Z]/.test(firstChar) ? firstChar : '#';

            // Add letter header if it's a new letter
            if (letter !== currentLetter) {
                currentLetter = letter;
                const letterHeader = document.createElement('div');
                letterHeader.className = 'letter-section';
                letterHeader.dataset.letter = letter;
                letterHeader.textContent = letter;
                letterHeader.style.cssText = `
                    font-weight: bold;
                    font-size: 14px;
                    color: var(--color-link);
                    margin-top: 12px;
                    margin-bottom: 6px;
                    padding-bottom: 4px;
                    border-bottom: 1px solid var(--color-border);
                `;
                fileList.appendChild(letterHeader);
            }

            const fileBtn = document.createElement('button');
            fileBtn.textContent = displayName;
            fileBtn.dataset.filename = displayName;
            fileBtn.className = 'audio-file-btn';

            const isSelected = displayName === selectedFile;
            fileBtn.style.cssText = `
                width: 100%;
                padding: 8px 12px;
                margin-bottom: 4px;
                background-color: ${isSelected ? 'var(--color-bg-selected)' : 'var(--color-bg-input)'};
                color: var(--color-text);
                border: 1px solid ${isSelected ? 'var(--color-link)' : 'var(--color-border-input)'};
                border-radius: 3px;
                cursor: pointer;
                font-size: 12px;
                text-align: left;
                transition: background-color 0.15s;
            `;

            fileBtn.addEventListener('mouseenter', () => {
                if (displayName !== selectedFile) {
                    fileBtn.style.backgroundColor = 'var(--color-link)';
                }
            });

            fileBtn.addEventListener('mouseleave', () => {
                if (displayName !== selectedFile) {
                    fileBtn.style.backgroundColor = 'var(--color-bg-input)';
                }
            });

            fileBtn.addEventListener('click', () => {
                // Update selection
                selectedFile = displayName;
                previewLabel.textContent = displayName;

                // Update all file buttons
                fileList.querySelectorAll('.audio-file-btn').forEach(btn => {
                    const btnName = btn.dataset.filename;
                    const isNowSelected = btnName === selectedFile;
                    btn.style.backgroundColor = isNowSelected ? 'var(--color-bg-selected)' : 'var(--color-bg-input)';
                    btn.style.borderColor = isNowSelected ? 'var(--color-link)' : 'var(--color-border-input)';
                });
            });

            // Double-click to play preview
            fileBtn.addEventListener('dblclick', () => {
                selectedFile = displayName;
                previewLabel.textContent = displayName;
                loadPreviewFile(displayName);
            });

            fileList.appendChild(fileBtn);
        });

        // Scroll detection for active letter tab
        let currentActiveTab = null;
        fileList.addEventListener('scroll', () => {
            const sections = fileList.querySelectorAll('.letter-section');
            const scrollTop = fileList.scrollTop;
            const containerTop = fileList.getBoundingClientRect().top;

            let activeTabLetter = null;
            sections.forEach(section => {
                const sectionTop = section.getBoundingClientRect().top;
                if (sectionTop - containerTop <= 100) {
                    activeTabLetter = section.dataset.letter;
                }
            });

            if (activeTabLetter && activeTabLetter !== currentActiveTab) {
                currentActiveTab = activeTabLetter;
                // Update tab highlighting
                tabBar.querySelectorAll('button').forEach(tab => {
                    if (tab.dataset.letter === activeTabLetter) {
                        tab.style.backgroundColor = 'var(--color-link)';
                    } else {
                        tab.style.backgroundColor = 'var(--color-bg-input-alt)';
                    }
                });
            }
        });

        mainContent.appendChild(fileList);

        // Footer with OK/Cancel buttons
        const footer = document.createElement('div');
        footer.style.cssText = `
            padding: 12px 16px;
            border-top: 1px solid var(--color-border);
            background-color: var(--color-bg-panel);
            display: flex;
            justify-content: flex-end;
            gap: 8px;
        `;

        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = 'Cancel';
        cancelBtn.className = 'rr-btn-secondary';

        const okBtn = document.createElement('button');
        okBtn.textContent = 'OK';
        okBtn.style.cssText = `
            padding: 6px 20px;
            background-color: var(--color-accent);
            color: var(--color-bg-deep);
            border: 1px solid var(--color-accent);
            border-radius: 3px;
            cursor: pointer;
            font-size: 12px;
            font-weight: bold;
            transition: background-color 0.15s;
        `;
        okBtn.addEventListener('mouseenter', () => { okBtn.style.backgroundColor = 'var(--color-accent-tint-25)'; });
        okBtn.addEventListener('mouseleave', () => { okBtn.style.backgroundColor = 'var(--color-accent)'; });

        footer.appendChild(cancelBtn);
        footer.appendChild(okBtn);

        container.appendChild(header);
        container.appendChild(mainContent);
        container.appendChild(footer);
        picker.appendChild(container);

        // Preview functionality
        const loadPreviewFile = (filename) => {
            if (!filename) return;

            const currentProject = this.projectController.getCurrentProject ?
                this.projectController.getCurrentProject() :
                this.projectController.currentProject;

            if (!currentProject) return;

            const path = require('path');
            const fs = require('fs');
            const audioFolder = path.join(currentProject.path, 'audio', this.commandType.folder);

            const extensions = ['.ogg', '.m4a', '.mp3'];
            let audioPath = null;

            for (const ext of extensions) {
                const testPath = path.join(audioFolder, filename + ext);
                if (fs.existsSync(testPath)) {
                    audioPath = testPath;
                    break;
                }
            }

            if (audioPath) {
                const player = this.getAudioPlayer();
                if (player) {
                    const fileUrl = 'file://' + audioPath.replace(/\\/g, '/');
                    // SE shouldn't loop by default in preview
                    const shouldLoop = (this.commandType.folder !== 'se');
                    player.playExternal(fileUrl, {
                        volume: 90,
                        pitch: 100,
                        pan: 0,
                        loop: shouldLoop,
                        audioType: this.commandType.folder // bgm, bgs, me, or se
                    });
                }
            }
        };

        playPreviewBtn.addEventListener('click', () => {
            if (selectedFile) {
                loadPreviewFile(selectedFile);
            } else {
                alert('Please select a file to preview');
            }
        });

        stopPreviewBtn.addEventListener('click', () => {
            const player = this.getAudioPlayer();
            if (player) {
                player.stopExternal();
            }
        });

        // OK button
        okBtn.addEventListener('click', () => {
            // Don't stop audio - let it continue playing
            if (selectedFile) {
                callback(selectedFile);
            }
            document.body.removeChild(picker);
        });

        // Cancel button
        cancelBtn.addEventListener('click', () => {
            // Don't stop audio when canceling
            document.body.removeChild(picker);
        });

        // Close button
        titleRow.querySelector('.close-picker').addEventListener('click', () => {
            // Don't stop audio when closing
            document.body.removeChild(picker);
        });

        // Close on background click
        picker.addEventListener('click', (e) => {
            if (e.target === picker) {
                // Don't stop audio when closing
                document.body.removeChild(picker);
            }
        });

        document.body.appendChild(picker);

        // Auto-scroll to selected file if one exists
        if (selectedFile) {
            setTimeout(() => {
                const selectedBtn = fileList.querySelector(`[data-filename="${selectedFile}"]`);
                if (selectedBtn) {
                    selectedBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            }, 100);
        }
    }

    /**
     * Scroll to specific letter section in file list
     */
    scrollToLetter(fileList, letter) {
        const letterSection = fileList.querySelector(`.letter-section[data-letter="${letter}"]`);
        if (letterSection) {
            letterSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }

    /**
     * Load audio file for preview
     */
    loadAudioFile(filename) {
        if (!filename) return;

        const currentProject = this.projectController.getCurrentProject ?
            this.projectController.getCurrentProject() :
            this.projectController.currentProject;

        if (!currentProject || !currentProject.path) return;

        const path = require('path');
        const fs = require('fs');
        const audioFolder = path.join(currentProject.path, 'audio', this.commandType.folder);

        // Try different extensions
        const extensions = ['.ogg', '.m4a', '.mp3'];
        let audioPath = null;

        for (const ext of extensions) {
            const testPath = path.join(audioFolder, filename + ext);
            if (fs.existsSync(testPath)) {
                audioPath = testPath;
                break;
            }
        }

        if (audioPath) {
            const player = this.getAudioPlayer();
            if (!player) return;

            // Convert to file:// URL for NW.js
            const fileUrl = 'file://' + audioPath.replace(/\\/g, '/');

            // Get loop control value
            const loopCheckbox = document.querySelector('.audio-loop-checkbox');
            const loopButton = this.modal ? this.modal.querySelector('.audio-loop-button') : null;
            const shouldLoop = loopCheckbox ? loopCheckbox.checked :
                (loopButton ? loopButton.classList.contains('active-toggle') : (this.commandType.folder !== 'se'));

            // Use the global audio player
            player.playExternal(fileUrl, {
                volume: this.command.parameters[0]?.volume || 90,
                pitch: this.command.parameters[0]?.pitch || 100,
                pan: this.command.parameters[0]?.pan || 0,
                loop: shouldLoop,
                audioType: this.commandType.folder // bgm, bgs, me, or se
            });
        }
    }

    /**
     * Play audio preview
     */
    playPreview() {
        const filename = this.command.parameters[0]?.name;
        if (filename) {
            this.loadAudioFile(filename);
        } else {
            alert('Please select an audio file first');
        }
    }

    /**
     * Stop audio preview
     */
    stopPreview() {
        const player = this.getAudioPlayer();
        if (player) {
            player.stopExternal();
        }
    }

    /**
     * Update audio volume in real-time
     */
    updateAudioVolume(volume) {
        const audioElement = this.getAudioElement();
        if (!audioElement) return;

        const normalizedVolume = volume / 100;
        audioElement.volume = normalizedVolume;

        const nodes = this.getAudioNodes();
        if (nodes && nodes.gainNode) {
            nodes.gainNode.gain.value = normalizedVolume;
        }
    }

    /**
     * Update audio pitch in real-time
     */
    updateAudioPitch(pitch) {
        const audioElement = this.getAudioElement();
        if (!audioElement) return;

        const normalizedPitch = pitch / 100;

        // Set playback rate with a smooth transition to reduce glitching
        // Use requestAnimationFrame to ensure smooth updates
        if (this.pitchUpdateTimer) {
            cancelAnimationFrame(this.pitchUpdateTimer);
        }

        this.pitchUpdateTimer = requestAnimationFrame(() => {
            audioElement.playbackRate = normalizedPitch;
            // Preserve playback quality
            audioElement.preservesPitch = false; // This allows pitch to change with speed
        });
    }

    /**
     * Update audio pan in real-time
     */
    updateAudioPan(pan) {
        const normalizedPan = pan / 100;
        const nodes = this.getAudioNodes();
        if (nodes && nodes.panNode) {
            nodes.panNode.pan.value = normalizedPan;
        }
    }

    /**
     * Save and return command
     */
    save() {
        // Don't stop audio - let it continue playing
        if (this.callback) {
            this.callback(this.command);
        }
        this.close();
    }

    /**
     * Close modal
     */
    close() {
        // Don't stop audio - let it continue playing

        // Clear the seek update interval
        if (this.seekUpdateInterval) {
            clearInterval(this.seekUpdateInterval);
            this.seekUpdateInterval = null;
        }

        if (this.modal) {
            this.modal.style.display = 'none';
        }
    }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AudioCommandEditor;
}
