/**
 * ChangeActorImagesEditor - Editor for Change Actor Images event command (code 322)
 */
class ChangeActorImagesEditor {
    constructor(databaseManager, projectController) {
        this.databaseManager = databaseManager;
        this.projectController = projectController;
        this.modal = null;
        this.callback = null;
        this.actorId = 1;
        this.charFile = '';
        this.charIdx = 0;
        this.faceFile = '';
        this.faceIdx = 0;
        this.battlerFile = '';
    }

    /**
     * Show editor for a change actor images command
     * @param {object} command - The command to edit (or null for new)
     * @param {function} callback - Callback when done editing
     */
    show(command, callback) {
        this.callback = callback;

        if (command && command.code === 322) {
            const params = command.parameters;
            this.actorId = params[0] || 1;
            this.charFile = params[1] || '';
            this.charIdx = params[2] || 0;
            this.faceFile = params[3] || '';
            this.faceIdx = params[4] || 0;
            this.battlerFile = params[5] || '';
        } else {
            this.actorId = 1;
            this.charFile = '';
            this.charIdx = 0;
            this.faceFile = '';
            this.faceIdx = 0;
            this.battlerFile = '';
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
        this.modal.className = 'change-actor-images-editor-modal';
        this.modal.style.cssText = 'display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background-color: rgba(0,0,0,0.7); z-index: 10005; justify-content: center; align-items: center;';

        const container = document.createElement('div');
        container.className = 'change-actor-images-container';
        container.style.cssText = 'background-color: var(--color-bg-surface); border: 1px solid var(--color-border); border-radius: 6px; width: 500px; display: flex; flex-direction: column; box-shadow: 0 4px 20px rgba(0,0,0,0.5);';

        this.modal.appendChild(container);

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
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        const container = this.modal.querySelector('.change-actor-images-container');
        container.innerHTML = '';

        // Header
        const header = document.createElement('div');
        header.className = 'rr-modal-header';
        header.innerHTML = `
            <div class="rr-modal-title">${tt('Change Actor Images')}</div>
            <button class="rr-modal-close close-btn" type="button">\u00d7</button>
        `;
        container.appendChild(header);

        header.querySelector('.close-btn').addEventListener('click', () => this.close());

        // Content
        const content = document.createElement('div');
        content.style.cssText = 'padding: 16px; display: flex; flex-direction: column; gap: 12px; overflow-y: auto; flex: 1;';

        // Actor dropdown
        const actorRow = document.createElement('div');
        actorRow.style.cssText = 'display: flex; align-items: center; gap: 8px;';

        const actorLabel = document.createElement('span');
        actorLabel.textContent = tt('Actor:');
        actorLabel.style.cssText = 'color: var(--color-text); font-size: 13px; min-width: 120px;';

        const actorSelect = document.createElement('select');
        actorSelect.style.cssText = 'padding: 6px 10px; background-color: var(--color-bg-input); color: var(--color-text); border: 1px solid var(--color-border-input); border-radius: 3px; font-size: 12px; flex: 1;';

        const actors = this.databaseManager.data.actors;
        if (actors) {
            for (let i = 1; i < actors.length; i++) {
                const actor = actors[i];
                if (actor) {
                    const option = document.createElement('option');
                    option.value = i;
                    option.textContent = `${i.toString().padStart(4, '0')}: ${actor.name || tt('Unnamed')}`;
                    if (i === this.actorId) {
                        option.selected = true;
                    }
                    actorSelect.appendChild(option);
                }
            }
        }

        actorSelect.addEventListener('change', (e) => {
            this.actorId = parseInt(e.target.value);
        });

        actorRow.appendChild(actorLabel);
        actorRow.appendChild(actorSelect);
        content.appendChild(actorRow);

        // Separator
        const sep1 = document.createElement('div');
        sep1.style.cssText = 'border-top: 1px solid var(--color-border);';
        content.appendChild(sep1);

        const browse = DatabaseEditorUI.imageBrowser(this.projectController);

        // Character filename input
        const charFileRow = document.createElement('div');
        charFileRow.style.cssText = 'display: flex; align-items: center; gap: 8px;';

        const charFileLabel = document.createElement('span');
        charFileLabel.textContent = tt('Char File:');
        charFileLabel.style.cssText = 'color: var(--color-text); font-size: 13px; min-width: 120px;';

        const charFileInput = document.createElement('input');
        charFileInput.type = 'text';
        charFileInput.value = this.charFile;
        charFileInput.style.cssText = 'padding: 6px 10px; background-color: var(--color-bg-input); color: var(--color-text); border: 1px solid var(--color-border-input); border-radius: 3px; font-size: 12px; flex: 1;';
        charFileInput.addEventListener('input', (e) => {
            this.charFile = e.target.value;
        });

        charFileRow.appendChild(charFileLabel);
        charFileRow.appendChild(charFileInput);
        content.appendChild(charFileRow);

        // Character index input
        const charIdxRow = document.createElement('div');
        charIdxRow.style.cssText = 'display: flex; align-items: center; gap: 8px;';

        const charIdxLabel = document.createElement('span');
        charIdxLabel.textContent = tt('Char Index:');
        charIdxLabel.style.cssText = 'color: var(--color-text); font-size: 13px; min-width: 120px;';

        const charIdxInput = document.createElement('input');
        charIdxInput.type = 'number';
        charIdxInput.min = 0;
        charIdxInput.max = 7;
        charIdxInput.value = this.charIdx;
        charIdxInput.style.cssText = 'padding: 6px 10px; background-color: var(--color-bg-input); color: var(--color-text); border: 1px solid var(--color-border-input); border-radius: 3px; font-size: 12px; width: 80px;';
        charIdxInput.addEventListener('input', (e) => {
            this.charIdx = parseInt(e.target.value) || 0;
        });

        charIdxRow.appendChild(charIdxLabel);
        charIdxRow.appendChild(charIdxInput);
        content.appendChild(charIdxRow);

        if (browse) {
            charFileRow.appendChild(browse.picker.createImageBrowseButton(charFileInput, {
                projectPath: browse.projectPath,
                folder: 'characters',
                title: tt('Select Character Sprite'),
                sheetType: 'character',
                indexInput: charIdxInput,
                zIndex: 10007
            }));
        }

        // Separator
        const sep2 = document.createElement('div');
        sep2.style.cssText = 'border-top: 1px solid var(--color-border);';
        content.appendChild(sep2);

        // Face filename input
        const faceFileRow = document.createElement('div');
        faceFileRow.style.cssText = 'display: flex; align-items: center; gap: 8px;';

        const faceFileLabel = document.createElement('span');
        faceFileLabel.textContent = tt('Face File:');
        faceFileLabel.style.cssText = 'color: var(--color-text); font-size: 13px; min-width: 120px;';

        const faceFileInput = document.createElement('input');
        faceFileInput.type = 'text';
        faceFileInput.value = this.faceFile;
        faceFileInput.style.cssText = 'padding: 6px 10px; background-color: var(--color-bg-input); color: var(--color-text); border: 1px solid var(--color-border-input); border-radius: 3px; font-size: 12px; flex: 1;';
        faceFileInput.addEventListener('input', (e) => {
            this.faceFile = e.target.value;
            updateFaceIndexLimit();
        });

        faceFileRow.appendChild(faceFileLabel);
        faceFileRow.appendChild(faceFileInput);
        content.appendChild(faceFileRow);

        // Face index input
        const faceIdxRow = document.createElement('div');
        faceIdxRow.style.cssText = 'display: flex; align-items: center; gap: 8px;';

        const faceIdxLabel = document.createElement('span');
        faceIdxLabel.textContent = tt('Face Index:');
        faceIdxLabel.style.cssText = 'color: var(--color-text); font-size: 13px; min-width: 120px;';

        const faceIdxInput = document.createElement('input');
        faceIdxInput.type = 'number';
        faceIdxInput.min = 0;
        faceIdxInput.value = this.faceIdx;
        faceIdxInput.style.cssText = 'padding: 6px 10px; background-color: var(--color-bg-input); color: var(--color-text); border: 1px solid var(--color-border-input); border-radius: 3px; font-size: 12px; width: 80px;';
        faceIdxInput.addEventListener('input', (e) => {
            this.faceIdx = parseInt(e.target.value) || 0;
        });

        const updateFaceIndexLimit = () => {
            faceIdxInput.removeAttribute('max');
            if (!this.faceFile) {
                return;
            }
            const project = this.projectController.getCurrentProject
                ? this.projectController.getCurrentProject()
                : this.projectController.currentProject;
            if (!project || !project.path) return;
            const path = require('path');
            const image = new Image();
            const expectedFile = this.faceFile;
            image.onload = () => {
                if (this.faceFile !== expectedFile) return;
                const maxIndex = RRFaceSheet.metrics(image).count - 1;
                if (maxIndex >= 0) faceIdxInput.max = maxIndex;
            };
            image.src = RRAssetFiles.imageUrlFor(
                path.join(project.path, 'img', 'faces'), expectedFile);
        };

        faceIdxRow.appendChild(faceIdxLabel);
        faceIdxRow.appendChild(faceIdxInput);
        content.appendChild(faceIdxRow);
        updateFaceIndexLimit();

        if (browse) {
            faceFileRow.appendChild(browse.picker.createImageBrowseButton(faceFileInput, {
                projectPath: browse.projectPath,
                folder: 'faces',
                title: tt('Select Face Graphic'),
                sheetType: 'face',
                indexInput: faceIdxInput,
                zIndex: 10007
            }));
        }

        // Separator
        const sep3 = document.createElement('div');
        sep3.style.cssText = 'border-top: 1px solid var(--color-border);';
        content.appendChild(sep3);

        // Battler filename input
        const battlerRow = document.createElement('div');
        battlerRow.style.cssText = 'display: flex; align-items: center; gap: 8px;';

        const battlerLabel = document.createElement('span');
        battlerLabel.textContent = tt('Battler File:');
        battlerLabel.style.cssText = 'color: var(--color-text); font-size: 13px; min-width: 120px;';

        const battlerInput = document.createElement('input');
        battlerInput.type = 'text';
        battlerInput.value = this.battlerFile;
        battlerInput.style.cssText = 'padding: 6px 10px; background-color: var(--color-bg-input); color: var(--color-text); border: 1px solid var(--color-border-input); border-radius: 3px; font-size: 12px; flex: 1;';
        battlerInput.addEventListener('input', (e) => {
            this.battlerFile = e.target.value;
        });

        battlerRow.appendChild(battlerLabel);
        battlerRow.appendChild(battlerInput);
        if (browse) {
            battlerRow.appendChild(browse.picker.createImageBrowseButton(battlerInput, {
                projectPath: browse.projectPath,
                folder: 'sv_actors',
                title: tt('Select SV Battler'),
                zIndex: 10007
            }));
        }
        content.appendChild(battlerRow);

        container.appendChild(content);

        // Footer
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
    }

    /**
     * Build command from current data
     */
    buildCommand() {
        return {
            code: 322,
            indent: 0,
            parameters: [this.actorId, this.charFile, this.charIdx, this.faceFile, this.faceIdx, this.battlerFile]
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
    module.exports = ChangeActorImagesEditor;
}
