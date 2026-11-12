/**
 * AudioCommandEditor - Editor for audio-related event commands
 * Handles Play and Change BGM/ME, Play BGS/SE, Fadeout BGM/BGS, and Stop SE
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

    getCurrentChannel() {
        const player = this.getAudioPlayer();
        if (!player || !this.commandType || !this.commandType.folder) return null;
        return player.getChannel(this.commandType.folder);
    }

    stripAudioExtension(filename) {
        if (!filename) return '';
        const normalized = String(filename).replace(/\\/g, '/');
        const decodedName = (() => {
            try {
                return decodeURIComponent(normalized);
            } catch (error) {
                return normalized;
            }
        })();
        return decodedName.replace(/\.(ogg|m4a|mp3|wav)$/i, '');
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
            volume: Math.round((this.getAudioPlayer().getChannelVolume(channel) || 0) * 100),
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

    /**
     * Show editor for an audio command
     * @param {object} command - The command to edit (or null for new)
     * @param {number} code - Command code (241=BGM, 245=BGS, 249=ME, 250=SE, 242=Fadeout BGM, etc)
     * @param {function} callback - Callback when done editing
     */
    show(command, code, callback) {
        this.commandType = this.getCommandType(code);
        // Work on a clone: the sliders and track list mutate this.command
        // live for preview, and OK hands the clone back to the caller —
        // Cancel must leave the original command untouched.
        this.command = command ? JSON.parse(JSON.stringify(command)) : this.createDefaultCommand(code);
        // Only a new command starts on the track playing in the editor: an existing "(None)" (stop the music) stays none.
        if (!command) this.applyCurrentTrackDefaults();
        this.callback = callback;

        if (this.commandType.folder && !this.commandType.fadeout) {
            this.showPlayCommandPicker();
            return;
        }

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
            132: { name: 'Change Battle BGM', folder: 'bgm', hasParams: true },
            133: { name: 'Change Victory ME', folder: 'me', hasParams: true },
            139: { name: 'Change Defeat ME', folder: 'me', hasParams: true },
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
                // AudioManager.fadeOutBgm passes this straight to WebAudio's
                // linearRampToValueAtTime, which takes seconds.
                parameters: [1]
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
     * Audio-object commands use the same current browser/player as every other
     * audio surface. The preview-only loop toggle is not serialized.
     */
    showPlayCommandPicker() {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        const currentProject = this.projectController.getCurrentProject
            ? this.projectController.getCurrentProject()
            : this.projectController.currentProject;
        if (!currentProject || !currentProject.path) {
            RRDialog.alert(tt('No project loaded'), { title: tt(this.commandType.name), kind: 'warning' });
            return;
        }

        const path = require('path');
        const fs = require('fs');
        const folder = this.commandType.folder;
        const audioFolder = path.join(currentProject.path, 'audio', folder);
        const files = fs.existsSync(audioFolder)
            ? RRAssetFiles.listUnique(audioFolder, RRAssetFiles.AUDIO_EXTENSIONS)
            : [];
        const current = this.command.parameters[0] || {};
        // Change Battle BGM can name a music sequence; the track stays on the
        // command as the fallback the runtime plays if that entry is gone.
        const sequencePicker = this.command.code === 132 && typeof RRBattleMusic !== 'undefined'
            ? RRBattleMusic.sequenceRow(this.databaseManager, RRBattleMusic.sequenceId(current), tt) : null;

        RRAudioPickerModal.open({
            title: `${tt('Select')} ${folder.toUpperCase()} ${tt('File')}`,
            folderLabel: folder.toUpperCase(),
            files,
            selected: current.name || '',
            levels: {
                volume: current.volume !== undefined ? current.volume : 90,
                pitch: current.pitch !== undefined ? current.pitch : 100,
                pan: current.pan !== undefined ? current.pan : 0
            },
            loopDefault: folder !== 'se',
            zIndex: 10006,
            extraControls: sequencePicker ? sequencePicker.row : undefined,
            onOk: result => {
                const audio = {
                    name: result.name,
                    volume: result.volume,
                    pitch: result.pitch,
                    pan: result.pan
                };
                const sequenceId = sequencePicker ? Number(sequencePicker.select.value) || 0 : 0;
                if (sequenceId > 0) audio.sequence = `library:${sequenceId}`;
                this.command.parameters[0] = audio;
                const done = this.callback;
                this.callback = null;
                if (done) done(this.command);
            }
        });
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
        container.className = 'audio-command-container rr-modal';
        container.style.cssText = `width: min(900px, calc(100vw - 24px)); max-height: 92vh;`;

        this.modal.appendChild(container);

        // Close on background click
        this.modal.addEventListener('click', (e) => {
            // A click on the backdrop no longer closes the dialog: an accidental
            // click beside it must never cost in-progress work. Close deliberately.
        });

        document.body.appendChild(this.modal);
    }

    /**
     * Render modal content
     */
    renderContent() {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        const container = this.modal.querySelector('.audio-command-container');
        container.innerHTML = '';

        // Header
        const header = document.createElement('div');
        header.className = 'rr-modal-header';
        header.innerHTML = `
            <div class="rr-modal-title">${tt(this.commandType.name)}</div>
            <button class="rr-modal-close close-btn" type="button">×</button>
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
        } else {
            // Stop SE: no parameters. The play commands never reach this
            // dialog: show() hands them to the shared audio picker.
            content.innerHTML = `<div style="color: var(--color-text-muted); padding: 20px; text-align: center;">${tt('This command has no parameters.')}</div>`;
        }

        container.appendChild(content);

        // Footer with OK/Cancel
        const footer = document.createElement('div');
        footer.className = 'rr-modal-footer';

        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = tt('Cancel');
        cancelBtn.className = 'rr-btn-secondary';
        cancelBtn.addEventListener('click', () => this.close());

        const okBtn = document.createElement('button');
        okBtn.textContent = tt('OK');
        okBtn.className = 'rr-button-primary';
        okBtn.addEventListener('click', () => this.save());

        footer.appendChild(cancelBtn);
        footer.appendChild(okBtn);
        container.appendChild(footer);

        // Don't auto-load or auto-play when opening the editor
        // User must explicitly hit play to preview audio
    }

    /**
     * Create fadeout duration control
     */
    createFadeoutControls() {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        return this.createSliderControl(
            tt('Duration (seconds):'),
            this.command.parameters[0] ?? 1,
            0,
            60,
            0.1,
            's',
            (value) => {
                this.command.parameters[0] = parseFloat(value);
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
        if (this.modal) {
            this.modal.style.display = 'none';
        }
    }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AudioCommandEditor;
}
