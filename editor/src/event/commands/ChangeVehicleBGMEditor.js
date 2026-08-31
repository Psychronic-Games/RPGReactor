/**
 * ChangeVehicleBGMEditor - Editor for Change Vehicle BGM event command (code 140)
 */
class ChangeVehicleBGMEditor {
    constructor(databaseManager, projectController) {
        this.databaseManager = databaseManager;
        this.projectController = projectController;
        this.modal = null;
        this.callback = null;
        this.vehicleType = 0;
        this.audioName = '';
        this.volume = 90;
        this.pitch = 100;
        this.pan = 0;
    }

    /**
     * Show editor for a change vehicle BGM command
     * @param {object} command - The command to edit (or null for new)
     * @param {function} callback - Callback when done editing
     */
    show(command, callback) {
        this.callback = callback;

        if (command && command.code === 140) {
            const params = command.parameters;
            this.vehicleType = params[0] || 0;
            const audio = params[1] || {};
            this.audioName = audio.name || '';
            this.volume = audio.volume !== undefined ? audio.volume : 90;
            this.pitch = audio.pitch !== undefined ? audio.pitch : 100;
            this.pan = audio.pan !== undefined ? audio.pan : 0;
        } else {
            this.vehicleType = 0;
            this.audioName = '';
            this.volume = 90;
            this.pitch = 100;
            this.pan = 0;
        }

        if (!this.modal) {
            this.createModal();
        }

        this.renderContent();
        this.modal.style.display = 'flex';
    }

    /**
     * Create modal structure
     */
    createModal() {
        this.modal = document.createElement('div');
        this.modal.className = 'change-vehicle-bgm-editor-modal';
        this.modal.style.cssText = 'display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background-color: rgba(0,0,0,0.7); z-index: 10005; justify-content: center; align-items: center;';

        const container = document.createElement('div');
        container.className = 'change-vehicle-bgm-container';
        container.style.cssText = 'background-color: var(--color-bg-surface); border: 1px solid var(--color-border); border-radius: 6px; width: 500px; display: flex; flex-direction: column; box-shadow: 0 4px 20px rgba(0,0,0,0.5);';

        this.modal.appendChild(container);

        this.modal.addEventListener('click', (e) => {
            // A click on the backdrop no longer closes the dialog: an accidental
            // click beside it must never cost in-progress work. Close deliberately.
        });

        document.body.appendChild(this.modal);
    }

    /**
     * Create a labeled slider + number input
     */
    createSliderInput(label, value, min, max, onChange) {
        const section = document.createElement('div');
        section.style.cssText = 'display: flex; align-items: center; gap: 8px;';

        const labelEl = document.createElement('span');
        labelEl.textContent = label;
        labelEl.style.cssText = 'color: var(--color-text); font-size: 13px; min-width: 80px;';

        const slider = document.createElement('input');
        slider.type = 'range';
        slider.min = min;
        slider.max = max;
        slider.value = value;
        slider.style.cssText = 'flex: 1;';

        const numInput = document.createElement('input');
        numInput.type = 'number';
        numInput.min = min;
        numInput.max = max;
        numInput.value = value;
        numInput.style.cssText = 'padding:4px 6px; background-color:var(--color-bg-input); color:var(--color-text); border:1px solid var(--color-border-input); border-radius:3px; font-size:12px; width:60px;';

        slider.addEventListener('input', (e) => {
            numInput.value = e.target.value;
            onChange(parseInt(e.target.value));
        });

        numInput.addEventListener('input', (e) => {
            slider.value = e.target.value;
            onChange(parseInt(e.target.value) || 0);
        });

        section.appendChild(labelEl);
        section.appendChild(slider);
        section.appendChild(numInput);
        return section;
    }

    /**
     * Render modal content
     */
    renderContent() {
        const t = text => window.I18n ? window.I18n.tText(text) : text;
        const container = this.modal.querySelector('.change-vehicle-bgm-container');
        container.innerHTML = '';

        // Header
        const header = document.createElement('div');
        header.className = 'rr-modal-header';
        header.innerHTML = `
            <div class="rr-modal-title">${t('Change Vehicle BGM')}</div>
            <button class="rr-modal-close close-btn" type="button">\u00d7</button>
        `;
        container.appendChild(header);

        header.querySelector('.close-btn').addEventListener('click', () => this.close());

        // Content
        const content = document.createElement('div');
        content.style.cssText = 'padding: 16px; display: flex; flex-direction: column; gap: 12px; overflow-y: auto; flex: 1;';

        // Vehicle type dropdown
        const vehicleRow = document.createElement('div');
        vehicleRow.style.cssText = 'display: flex; align-items: center; gap: 8px;';

        const vehicleLabel = document.createElement('span');
        vehicleLabel.textContent = t('Vehicle:');
        vehicleLabel.style.cssText = 'color: var(--color-text); font-size: 13px; min-width: 80px;';

        const vehicleSelect = document.createElement('select');
        vehicleSelect.style.cssText = 'padding: 6px 10px; background-color: var(--color-bg-input); color: var(--color-text); border: 1px solid var(--color-border-input); border-radius: 3px; font-size: 12px; flex: 1;';
        vehicleSelect.innerHTML = `
            <option value="0" ${this.vehicleType === 0 ? 'selected' : ''}>${t('Boat')}</option>
            <option value="1" ${this.vehicleType === 1 ? 'selected' : ''}>${t('Ship')}</option>
            <option value="2" ${this.vehicleType === 2 ? 'selected' : ''}>${t('Airship')}</option>
        `;
        vehicleSelect.addEventListener('change', (e) => {
            this.vehicleType = parseInt(e.target.value);
        });

        vehicleRow.appendChild(vehicleLabel);
        vehicleRow.appendChild(vehicleSelect);
        content.appendChild(vehicleRow);

        // The vehicle is unique to this command; the audio object itself uses
        // the same searchable, previewable picker as Play BGM.
        const nameRow = document.createElement('div');
        nameRow.style.cssText = 'display: flex; align-items: center; gap: 8px;';

        const nameLabel = document.createElement('span');
        nameLabel.textContent = t('BGM:');
        nameLabel.style.cssText = 'color: var(--color-text); font-size: 13px; min-width: 80px;';

        const selected = document.createElement('span');
        selected.textContent = this.audioName || t('(None)');
        selected.style.cssText = 'color: var(--color-text); font-size: 12px; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;';
        const browse = document.createElement('button');
        browse.type = 'button';
        browse.className = 'rr-btn-secondary';
        browse.textContent = t('Browse...');
        browse.addEventListener('click', () => this.openAudioPicker());

        nameRow.appendChild(nameLabel);
        nameRow.appendChild(selected);
        nameRow.appendChild(browse);
        content.appendChild(nameRow);

        container.appendChild(content);

        // Footer
        const footer = document.createElement('div');
        footer.className = 'rr-modal-footer';

        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = t('Cancel');
        cancelBtn.className = 'rr-btn-secondary';
        cancelBtn.addEventListener('click', () => this.close());

        const okBtn = document.createElement('button');
        okBtn.textContent = t('OK');
        okBtn.className = 'rr-button-primary';
        okBtn.addEventListener('click', () => this.save());

        footer.appendChild(cancelBtn);
        footer.appendChild(okBtn);
        container.appendChild(footer);
    }

    openAudioPicker() {
        const project = this.projectController.getCurrentProject
            ? this.projectController.getCurrentProject()
            : this.projectController.currentProject;
        if (!project?.path || typeof RRAudioPickerModal === 'undefined') return;
        const fs = require('fs');
        const path = require('path');
        const audioFolder = path.join(project.path, 'audio', 'bgm');
        const files = fs.existsSync(audioFolder)
            ? RRAssetFiles.listUnique(audioFolder, RRAssetFiles.AUDIO_EXTENSIONS)
            : [];
        RRAudioPickerModal.open({
            title: `${window.I18n ? window.I18n.tText('Select') : 'Select'} BGM ${window.I18n ? window.I18n.tText('File') : 'File'}`,
            folderLabel: 'BGM',
            files,
            selected: this.audioName,
            levels: { volume: this.volume, pitch: this.pitch, pan: this.pan },
            loopDefault: true,
            zIndex: 10006,
            onOk: result => {
                this.audioName = result.name;
                this.volume = result.volume;
                this.pitch = result.pitch;
                this.pan = result.pan;
                this.renderContent();
            }
        });
    }

    /**
     * Build command from current data
     */
    buildCommand() {
        return {
            code: 140,
            indent: 0,
            parameters: [this.vehicleType, {name: this.audioName, volume: this.volume, pitch: this.pitch, pan: this.pan}]
        };
    }

    /**
     * Save and return command
     */
    save() {
        if (this.callback) {
            const command = this.buildCommand();
            this.callback(command);
        }
        this.close();
    }

    /**
     * Close modal
     */
    close() {
        if (this.modal) {
            this.modal.style.display = 'none';
        }
    }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ChangeVehicleBGMEditor;
}
