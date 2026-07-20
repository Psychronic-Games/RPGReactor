/**
 * ChangeVehicleImageEditor - Editor for Change Vehicle Image event command (code 323)
 */
class ChangeVehicleImageEditor {
    constructor(databaseManager, projectController) {
        this.databaseManager = databaseManager;
        this.projectController = projectController;
        this.modal = null;
        this.callback = null;
        this.vehicleType = 0;
        this.charFile = '';
        this.charIdx = 0;
    }

    /**
     * Show editor for a change vehicle image command
     * @param {object} command - The command to edit (or null for new)
     * @param {function} callback - Callback when done editing
     */
    show(command, callback) {
        this.callback = callback;

        if (command && command.code === 323) {
            const params = command.parameters;
            this.vehicleType = params[0] || 0;
            this.charFile = params[1] || '';
            this.charIdx = params[2] || 0;
        } else {
            this.vehicleType = 0;
            this.charFile = '';
            this.charIdx = 0;
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
        this.modal.className = 'change-vehicle-image-editor-modal';
        this.modal.style.cssText = 'display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background-color: rgba(0,0,0,0.7); z-index: 10005; justify-content: center; align-items: center;';

        const container = document.createElement('div');
        container.className = 'change-vehicle-image-container';
        container.style.cssText = 'background-color: var(--color-bg-surface); border: 1px solid var(--color-border); border-radius: 6px; width: 450px; display: flex; flex-direction: column; box-shadow: 0 4px 20px rgba(0,0,0,0.5);';

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
        const t = text => window.I18n ? window.I18n.tText(text) : text;
        const container = this.modal.querySelector('.change-vehicle-image-container');
        container.innerHTML = '';

        // Header
        const header = document.createElement('div');
        header.style.cssText = 'padding: 12px 16px; background-color: var(--color-bg-panel); border-bottom: 1px solid var(--color-border); display: flex; justify-content: space-between; align-items: center; border-top-left-radius: 6px; border-top-right-radius: 6px;';
        header.innerHTML = `
            <h3 style="margin: 0; color: var(--color-text-strong); font-size: 16px;">${t('Change Vehicle Image')}</h3>
            <button class="close-btn" style="background: none; border: none; color: var(--color-text-strong); font-size: 20px; cursor: pointer; padding: 0; width: 24px; height: 24px;">\u00d7</button>
        `;
        container.appendChild(header);

        header.querySelector('.close-btn').addEventListener('click', () => this.close());

        // Content
        const content = document.createElement('div');
        content.style.cssText = 'padding: 16px; display: flex; flex-direction: column; gap: 12px; overflow-y: auto; flex: 1;';

        // Vehicle dropdown
        const vehicleRow = document.createElement('div');
        vehicleRow.style.cssText = 'display: flex; align-items: center; gap: 8px;';

        const vehicleLabel = document.createElement('span');
        vehicleLabel.textContent = t('Vehicle:');
        vehicleLabel.style.cssText = 'color: var(--color-text); font-size: 13px; min-width: 120px;';

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

        // Character filename input
        const charFileRow = document.createElement('div');
        charFileRow.style.cssText = 'display: flex; align-items: center; gap: 8px;';

        const charFileLabel = document.createElement('span');
        charFileLabel.textContent = t('Char File:');
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
        charIdxLabel.textContent = t('Char Index:');
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

        container.appendChild(content);

        // Footer
        const footer = document.createElement('div');
        footer.style.cssText = 'padding: 12px 16px; border-top: 1px solid var(--color-border); background-color: var(--color-bg-panel); display: flex; justify-content: flex-end; gap: 8px;';

        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = t('Cancel');
        cancelBtn.className = 'rr-btn-secondary';
        cancelBtn.addEventListener('click', () => this.close());

        const okBtn = document.createElement('button');
        okBtn.textContent = t('OK');
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
            code: 323,
            indent: 0,
            parameters: [this.vehicleType, this.charFile, this.charIdx]
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
    module.exports = ChangeVehicleImageEditor;
}
