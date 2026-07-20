/**
 * SelectItemEditor - Editor for Select Item event command (code 104)
 */
class SelectItemEditor {
    constructor(databaseManager, projectController) {
        this.databaseManager = databaseManager;
        this.projectController = projectController;
        this.modal = null;
        this.callback = null;
        this.variableId = 1;
        this.itemType = 1;
    }

    /**
     * Show editor for a select item command
     * @param {object} command - The command to edit (or null for new)
     * @param {function} callback - Callback when done editing
     */
    show(command, callback) {
        this.callback = callback;

        if (command && command.code === 104) {
            const params = command.parameters;
            this.variableId = params[0] || 1;
            this.itemType = params[1] || 1;
        } else {
            this.variableId = 1;
            this.itemType = 1;
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
        this.modal.className = 'select-item-editor-modal';
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
        container.className = 'select-item-container';
        container.style.cssText = `
            background-color: var(--color-bg-surface);
            border: 1px solid var(--color-border);
            border-radius: 6px;
            width: 450px;
            display: flex;
            flex-direction: column;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
        `;

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
        const container = this.modal.querySelector('.select-item-container');
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
            <h3 style="margin: 0; color: var(--color-text-strong); font-size: 16px;">${t('Select Item')}</h3>
            <button class="close-btn" style="background: none; border: none; color: var(--color-text-strong); font-size: 20px; cursor: pointer; padding: 0; width: 24px; height: 24px;">\u00d7</button>
        `;
        container.appendChild(header);

        header.querySelector('.close-btn').addEventListener('click', () => this.close());

        // Content
        const content = document.createElement('div');
        content.style.cssText = `
            padding: 16px;
            display: flex;
            flex-direction: column;
            gap: 12px;
        `;

        // Variable picker row
        const variableRow = document.createElement('div');
        variableRow.style.cssText = 'display: flex; align-items: center; gap: 8px;';

        const variableLabel = document.createElement('span');
        variableLabel.textContent = t('Variable:');
        variableLabel.style.cssText = 'color: var(--color-text); font-size: 13px; min-width: 80px;';

        const variableInput = document.createElement('input');
        variableInput.type = 'number';
        variableInput.min = 1;
        variableInput.max = 9999;
        variableInput.value = this.variableId;
        variableInput.style.cssText = `
            padding: 6px 10px;
            background-color: var(--color-bg-input);
            color: var(--color-text);
            border: 1px solid var(--color-border-input);
            border-radius: 3px;
            font-size: 12px;
            width: 80px;
        `;
        variableInput.addEventListener('input', (e) => {
            this.variableId = parseInt(e.target.value) || 1;
        });

        const browseBtn = document.createElement('button');
        browseBtn.textContent = '...';
        browseBtn.className = 'rr-btn-browse';
        browseBtn.addEventListener('click', () => this.browseVariables());

        variableRow.appendChild(variableLabel);
        variableRow.appendChild(variableInput);
        variableRow.appendChild(browseBtn);
        content.appendChild(variableRow);

        // Item Type dropdown row
        const itemTypeRow = document.createElement('div');
        itemTypeRow.style.cssText = 'display: flex; align-items: center; gap: 8px;';

        const itemTypeLabel = document.createElement('span');
        itemTypeLabel.textContent = t('Item Type:');
        itemTypeLabel.style.cssText = 'color: var(--color-text); font-size: 13px; min-width: 80px;';

        const itemTypeSelect = document.createElement('select');
        itemTypeSelect.style.cssText = `
            padding: 6px 10px;
            background-color: var(--color-bg-input);
            color: var(--color-text);
            border: 1px solid var(--color-border-input);
            border-radius: 3px;
            font-size: 12px;
            width: 180px;
        `;
        itemTypeSelect.innerHTML = `
            <option value="1">${t('Regular Item')}</option>
            <option value="2">${t('Key Item')}</option>
            <option value="3">${t('Hidden Item A')}</option>
            <option value="4">${t('Hidden Item B')}</option>
        `;
        itemTypeSelect.value = this.itemType.toString();
        itemTypeSelect.addEventListener('change', (e) => {
            this.itemType = parseInt(e.target.value);
        });

        itemTypeRow.appendChild(itemTypeLabel);
        itemTypeRow.appendChild(itemTypeSelect);
        content.appendChild(itemTypeRow);

        container.appendChild(content);

        // Footer
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
        cancelBtn.textContent = t('Cancel');
        cancelBtn.className = 'rr-btn-secondary';
        cancelBtn.addEventListener('click', () => this.close());

        const okBtn = document.createElement('button');
        okBtn.textContent = t('OK');
        okBtn.style.cssText = `
            padding: 6px 20px;
            background-color: var(--color-accent);
            color: var(--color-bg-deep);
            border: none;
            border-radius: 3px;
            cursor: pointer;
            font-size: 12px;
            font-weight: bold;
        `;
        okBtn.addEventListener('click', () => this.save());

        footer.appendChild(cancelBtn);
        footer.appendChild(okBtn);
        container.appendChild(footer);
    }

    /**
     * Browse variables using SwitchVariablePicker
     */
    browseVariables() {
        const picker = new SwitchVariablePicker(this.databaseManager, this.projectController);
        picker.show('variable', this.variableId || 1, (selectedId) => {
            if (selectedId) {
                this.variableId = selectedId;
                this.renderContent();
            }
        });
    }

    /**
     * Build command from current data
     */
    buildCommand() {
        return {
            code: 104,
            indent: 0,
            parameters: [this.variableId, this.itemType]
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
    module.exports = SelectItemEditor;
}
