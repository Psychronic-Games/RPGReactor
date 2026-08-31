/**
 * InputNumberEditor - Editor for Input Number event command (code 103)
 */
class InputNumberEditor {
    constructor(databaseManager, projectController) {
        this.databaseManager = databaseManager;
        this.projectController = projectController;
        this.modal = null;
        this.callback = null;
        this.variableId = 1;
        this.maxDigits = 1;
    }

    /**
     * Show editor for an input number command
     * @param {object} command - The command to edit (or null for new)
     * @param {function} callback - Callback when done editing
     */
    show(command, callback) {
        this.callback = callback;

        if (command && command.code === 103) {
            const params = command.parameters;
            this.variableId = params[0] || 1;
            this.maxDigits = params[1] || 1;
        } else {
            this.variableId = 1;
            this.maxDigits = 1;
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
        this.modal.className = 'input-number-editor-modal';
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
        container.className = 'input-number-container rr-modal';
        container.style.cssText = `width: min(450px, calc(100vw - 24px)); max-height: 92vh;`;

        this.modal.appendChild(container);

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
        const container = this.modal.querySelector('.input-number-container');
        container.innerHTML = '';

        // Header
        const header = document.createElement('div');
        header.className = 'rr-modal-header';
        header.innerHTML = `
            <div class="rr-modal-title">${tt('Input Number')}</div>
            <button class="rr-modal-close close-btn" type="button">\u00d7</button>
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
            overflow-y: auto;
            min-height: 0;
        `;

        // Variable picker row
        const variableRow = document.createElement('div');
        variableRow.style.cssText = 'display: flex; align-items: center; gap: 8px;';

        const variableLabel = document.createElement('span');
        variableLabel.textContent = tt('Variable:');
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

        // Max Digits row
        const digitsRow = document.createElement('div');
        digitsRow.style.cssText = 'display: flex; align-items: center; gap: 8px;';

        const digitsLabel = document.createElement('span');
        digitsLabel.textContent = tt('Max Digits:');
        digitsLabel.style.cssText = 'color: var(--color-text); font-size: 13px; min-width: 80px;';

        const digitsInput = document.createElement('input');
        digitsInput.type = 'number';
        digitsInput.min = 1;
        digitsInput.max = 8;
        digitsInput.value = this.maxDigits;
        digitsInput.style.cssText = `
            padding: 6px 10px;
            background-color: var(--color-bg-input);
            color: var(--color-text);
            border: 1px solid var(--color-border-input);
            border-radius: 3px;
            font-size: 12px;
            width: 80px;
        `;
        digitsInput.addEventListener('input', (e) => {
            this.maxDigits = parseInt(e.target.value) || 1;
        });

        digitsRow.appendChild(digitsLabel);
        digitsRow.appendChild(digitsInput);
        content.appendChild(digitsRow);

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
            code: 103,
            indent: 0,
            parameters: [this.variableId, this.maxDigits]
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
    module.exports = InputNumberEditor;
}
