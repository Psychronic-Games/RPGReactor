/**
 * GetLocationInfoEditor - Editor for Get Location Info event command (code 285)
 */
class GetLocationInfoEditor {
    constructor(databaseManager, projectController) {
        this.databaseManager = databaseManager;
        this.projectController = projectController;
        this.modal = null;
        this.callback = null;
        this.variableId = 1;
        this.infoType = 0;
        this.designType = 0;
        this.x = 0;
        this.y = 0;
    }

    /**
     * Show editor for a get location info command
     * @param {object} command - The command to edit (or null for new)
     * @param {function} callback - Callback when done editing
     */
    show(command, callback) {
        this.callback = callback;

        if (command && command.code === 285) {
            const params = command.parameters;
            this.variableId = params[0] || 1;
            this.infoType = params[1] || 0;
            this.designType = params[2] || 0;
            this.x = params[3] || 0;
            this.y = params[4] || 0;
        } else {
            this.variableId = 1;
            this.infoType = 0;
            this.designType = 0;
            this.x = 0;
            this.y = 0;
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
        this.modal.className = 'get-location-info-editor-modal';
        this.modal.style.cssText = 'display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background-color: rgba(0,0,0,0.7); z-index: 10005; justify-content: center; align-items: center;';

        const container = document.createElement('div');
        container.className = 'get-location-info-container';
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
     * Browse variables using SwitchVariablePicker
     */
    browseVariables(property) {
        const picker = new SwitchVariablePicker(this.databaseManager, this.projectController);
        picker.show('variable', this[property] || 1, (selectedId) => {
            if (selectedId) {
                this[property] = selectedId;
                this.renderContent();
            }
        });
    }

    /**
     * Render modal content
     */
    renderContent() {
        const container = this.modal.querySelector('.get-location-info-container');
        container.innerHTML = '';

        // Header
        const header = document.createElement('div');
        header.style.cssText = 'padding: 12px 16px; background-color: var(--color-bg-panel); border-bottom: 1px solid var(--color-border); display: flex; justify-content: space-between; align-items: center; border-top-left-radius: 6px; border-top-right-radius: 6px;';
        header.innerHTML = `
            <h3 style="margin: 0; color: var(--color-text-strong); font-size: 16px;">Get Location Info</h3>
            <button class="close-btn" style="background: none; border: none; color: var(--color-text-strong); font-size: 20px; cursor: pointer; padding: 0; width: 24px; height: 24px;">\u00d7</button>
        `;
        container.appendChild(header);

        header.querySelector('.close-btn').addEventListener('click', () => this.close());

        // Content
        const content = document.createElement('div');
        content.style.cssText = 'padding: 16px; display: flex; flex-direction: column; gap: 12px; overflow-y: auto; flex: 1;';

        // Variable picker for result variable
        const varRow = document.createElement('div');
        varRow.style.cssText = 'display: flex; align-items: center; gap: 8px;';

        const varLabel = document.createElement('span');
        varLabel.textContent = 'Variable:';
        varLabel.style.cssText = 'color: var(--color-text); font-size: 13px; min-width: 120px;';

        const varInput = document.createElement('input');
        varInput.type = 'number';
        varInput.min = 1;
        varInput.value = this.variableId;
        varInput.style.cssText = 'padding: 6px 10px; background-color: var(--color-bg-input); color: var(--color-text); border: 1px solid var(--color-border-input); border-radius: 3px; font-size: 12px; width: 80px;';
        varInput.addEventListener('input', (e) => {
            this.variableId = parseInt(e.target.value) || 1;
        });

        const varBrowse = document.createElement('button');
        varBrowse.textContent = '...';
        varBrowse.className = 'rr-btn-browse';
        varBrowse.addEventListener('click', () => this.browseVariables('variableId'));

        varRow.appendChild(varLabel);
        varRow.appendChild(varInput);
        varRow.appendChild(varBrowse);
        content.appendChild(varRow);

        // Info type dropdown
        const infoRow = document.createElement('div');
        infoRow.style.cssText = 'display: flex; align-items: center; gap: 8px;';

        const infoLabel = document.createElement('span');
        infoLabel.textContent = 'Info Type:';
        infoLabel.style.cssText = 'color: var(--color-text); font-size: 13px; min-width: 120px;';

        const infoSelect = document.createElement('select');
        infoSelect.style.cssText = 'padding: 6px 10px; background-color: var(--color-bg-input); color: var(--color-text); border: 1px solid var(--color-border-input); border-radius: 3px; font-size: 12px; flex: 1;';
        infoSelect.innerHTML = `
            <option value="0" ${this.infoType === 0 ? 'selected' : ''}>Terrain Tag</option>
            <option value="1" ${this.infoType === 1 ? 'selected' : ''}>Event ID</option>
            <option value="2" ${this.infoType === 2 ? 'selected' : ''}>Tile ID (Layer 1)</option>
            <option value="3" ${this.infoType === 3 ? 'selected' : ''}>Tile ID (Layer 2)</option>
            <option value="4" ${this.infoType === 4 ? 'selected' : ''}>Tile ID (Layer 3)</option>
            <option value="5" ${this.infoType === 5 ? 'selected' : ''}>Tile ID (Layer 4)</option>
            <option value="6" ${this.infoType === 6 ? 'selected' : ''}>Region ID</option>
        `;
        infoSelect.addEventListener('change', (e) => {
            this.infoType = parseInt(e.target.value);
        });

        infoRow.appendChild(infoLabel);
        infoRow.appendChild(infoSelect);
        content.appendChild(infoRow);

        // Designation radio buttons
        const designRow = document.createElement('div');
        designRow.style.cssText = 'display: flex; align-items: center; gap: 16px;';

        const designLabel = document.createElement('span');
        designLabel.textContent = 'Designation:';
        designLabel.style.cssText = 'color: var(--color-text); font-size: 13px; min-width: 120px;';
        designRow.appendChild(designLabel);

        const directRadio = document.createElement('input');
        directRadio.type = 'radio';
        directRadio.name = 'location-info-design';
        directRadio.value = '0';
        directRadio.checked = this.designType === 0;
        directRadio.addEventListener('change', () => {
            this.designType = 0;
            this.renderContent();
        });

        const directLabel = document.createElement('label');
        directLabel.textContent = 'Direct';
        directLabel.style.cssText = 'color: var(--color-text); font-size: 13px; cursor: pointer;';
        directLabel.addEventListener('click', () => { directRadio.checked = true; directRadio.dispatchEvent(new Event('change')); });

        const varRadio = document.createElement('input');
        varRadio.type = 'radio';
        varRadio.name = 'location-info-design';
        varRadio.value = '1';
        varRadio.checked = this.designType === 1;
        varRadio.addEventListener('change', () => {
            this.designType = 1;
            this.renderContent();
        });

        const varRadioLabel = document.createElement('label');
        varRadioLabel.textContent = 'Variable';
        varRadioLabel.style.cssText = 'color: var(--color-text); font-size: 13px; cursor: pointer;';
        varRadioLabel.addEventListener('click', () => { varRadio.checked = true; varRadio.dispatchEvent(new Event('change')); });

        designRow.appendChild(directRadio);
        designRow.appendChild(directLabel);
        designRow.appendChild(varRadio);
        designRow.appendChild(varRadioLabel);
        content.appendChild(designRow);

        if (this.designType === 0) {
            // Direct mode - X, Y number inputs
            const xRow = document.createElement('div');
            xRow.style.cssText = 'display: flex; align-items: center; gap: 8px;';

            const xLabel = document.createElement('span');
            xLabel.textContent = 'X:';
            xLabel.style.cssText = 'color: var(--color-text); font-size: 13px; min-width: 120px;';

            const xInput = document.createElement('input');
            xInput.type = 'number';
            xInput.min = 0;
            xInput.max = 999;
            xInput.value = this.x;
            xInput.style.cssText = 'padding: 6px 10px; background-color: var(--color-bg-input); color: var(--color-text); border: 1px solid var(--color-border-input); border-radius: 3px; font-size: 12px; width: 100px;';
            xInput.addEventListener('input', (e) => {
                this.x = parseInt(e.target.value) || 0;
            });

            xRow.appendChild(xLabel);
            xRow.appendChild(xInput);
            content.appendChild(xRow);

            const yRow = document.createElement('div');
            yRow.style.cssText = 'display: flex; align-items: center; gap: 8px;';

            const yLabel = document.createElement('span');
            yLabel.textContent = 'Y:';
            yLabel.style.cssText = 'color: var(--color-text); font-size: 13px; min-width: 120px;';

            const yInput = document.createElement('input');
            yInput.type = 'number';
            yInput.min = 0;
            yInput.max = 999;
            yInput.value = this.y;
            yInput.style.cssText = 'padding: 6px 10px; background-color: var(--color-bg-input); color: var(--color-text); border: 1px solid var(--color-border-input); border-radius: 3px; font-size: 12px; width: 100px;';
            yInput.addEventListener('input', (e) => {
                this.y = parseInt(e.target.value) || 0;
            });

            yRow.appendChild(yLabel);
            yRow.appendChild(yInput);
            content.appendChild(yRow);
        } else {
            // Variable mode - variable pickers for X, Y
            const xVarRow = document.createElement('div');
            xVarRow.style.cssText = 'display: flex; align-items: center; gap: 8px;';

            const xVarLabel = document.createElement('span');
            xVarLabel.textContent = 'X Var:';
            xVarLabel.style.cssText = 'color: var(--color-text); font-size: 13px; min-width: 120px;';

            const xVarInput = document.createElement('input');
            xVarInput.type = 'number';
            xVarInput.min = 1;
            xVarInput.value = this.x;
            xVarInput.style.cssText = 'padding: 6px 10px; background-color: var(--color-bg-input); color: var(--color-text); border: 1px solid var(--color-border-input); border-radius: 3px; font-size: 12px; width: 80px;';
            xVarInput.addEventListener('input', (e) => {
                this.x = parseInt(e.target.value) || 0;
            });

            const xVarBrowse = document.createElement('button');
            xVarBrowse.textContent = '...';
            xVarBrowse.className = 'rr-btn-browse';
            xVarBrowse.addEventListener('click', () => this.browseVariables('x'));

            xVarRow.appendChild(xVarLabel);
            xVarRow.appendChild(xVarInput);
            xVarRow.appendChild(xVarBrowse);
            content.appendChild(xVarRow);

            const yVarRow = document.createElement('div');
            yVarRow.style.cssText = 'display: flex; align-items: center; gap: 8px;';

            const yVarLabel = document.createElement('span');
            yVarLabel.textContent = 'Y Var:';
            yVarLabel.style.cssText = 'color: var(--color-text); font-size: 13px; min-width: 120px;';

            const yVarInput = document.createElement('input');
            yVarInput.type = 'number';
            yVarInput.min = 1;
            yVarInput.value = this.y;
            yVarInput.style.cssText = 'padding: 6px 10px; background-color: var(--color-bg-input); color: var(--color-text); border: 1px solid var(--color-border-input); border-radius: 3px; font-size: 12px; width: 80px;';
            yVarInput.addEventListener('input', (e) => {
                this.y = parseInt(e.target.value) || 0;
            });

            const yVarBrowse = document.createElement('button');
            yVarBrowse.textContent = '...';
            yVarBrowse.className = 'rr-btn-browse';
            yVarBrowse.addEventListener('click', () => this.browseVariables('y'));

            yVarRow.appendChild(yVarLabel);
            yVarRow.appendChild(yVarInput);
            yVarRow.appendChild(yVarBrowse);
            content.appendChild(yVarRow);
        }

        container.appendChild(content);

        // Footer
        const footer = document.createElement('div');
        footer.style.cssText = 'padding: 12px 16px; border-top: 1px solid var(--color-border); background-color: var(--color-bg-panel); display: flex; justify-content: flex-end; gap: 8px;';

        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = 'Cancel';
        cancelBtn.className = 'rr-btn-secondary';
        cancelBtn.addEventListener('click', () => this.close());

        const okBtn = document.createElement('button');
        okBtn.textContent = 'OK';
        okBtn.style.cssText = 'padding: 6px 20px; background-color: var(--color-accent); color: var(--color-bg-deep); border: none; border-radius: 3px; cursor: pointer; font-size: 12px; font-weight: bold;';
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
            code: 285,
            indent: 0,
            parameters: [this.variableId, this.infoType, this.designType, this.x, this.y]
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
    module.exports = GetLocationInfoEditor;
}
