/**
 * ChangeGoldEditor - Editor for Change Gold event command (code 125)
 */
class ChangeGoldEditor {
    constructor(databaseManager, projectController) {
        this.databaseManager = databaseManager;
        this.projectController = projectController;
        this.modal = null;
        this.callback = null;
        this.operation = 0; // 0=Increase, 1=Decrease
        this.operandType = 0; // 0=Constant, 1=Variable
        this.operand = 0; // Value or variable ID
    }

    /**
     * Show editor for a change gold command
     * @param {object} command - The command to edit (or null for new)
     * @param {function} callback - Callback when done editing
     */
    show(command, callback) {
        this.callback = callback;

        if (command && command.code === 125) {
            const params = command.parameters;
            this.operation = params[0] || 0;
            this.operandType = params[1] || 0;
            this.operand = params[2] || 0;
            // Random (operand type 2): params[3] is the top of the range.
            this.operandMax = params[3] ?? this.operand;
        } else {
            this.operation = 0;
            this.operandType = 0;
            this.operand = 0;
            this.operandMax = 0;
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
        this.modal.className = 'change-gold-editor-modal';
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
        container.className = 'change-gold-container rr-modal';
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
        const container = this.modal.querySelector('.change-gold-container');
        container.innerHTML = '';

        // Header
        const header = document.createElement('div');
        header.className = 'rr-modal-header';
        header.innerHTML = `
            <div class="rr-modal-title">${tt('Change Gold')}</div>
            <button class="rr-modal-close close-btn" type="button">×</button>
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

        // Operation (Increase/Decrease)
        const operationRow = document.createElement('div');
        operationRow.style.cssText = 'display: flex; gap: 12px;';

        const increaseRadio = document.createElement('input');
        increaseRadio.type = 'radio';
        increaseRadio.name = 'gold-operation';
        increaseRadio.id = 'increase-gold';
        increaseRadio.checked = (this.operation === 0);
        increaseRadio.addEventListener('change', () => {
            this.operation = 0;
        });

        const increaseLabel = document.createElement('label');
        increaseLabel.htmlFor = 'increase-gold';
        increaseLabel.textContent = tt('Increase');
        increaseLabel.style.cssText = 'color: var(--color-text); cursor: pointer;';

        const decreaseRadio = document.createElement('input');
        decreaseRadio.type = 'radio';
        decreaseRadio.name = 'gold-operation';
        decreaseRadio.id = 'decrease-gold';
        decreaseRadio.checked = (this.operation === 1);
        decreaseRadio.addEventListener('change', () => {
            this.operation = 1;
        });

        const decreaseLabel = document.createElement('label');
        decreaseLabel.htmlFor = 'decrease-gold';
        decreaseLabel.textContent = tt('Decrease');
        decreaseLabel.style.cssText = 'color: var(--color-text); cursor: pointer;';

        operationRow.appendChild(increaseRadio);
        operationRow.appendChild(increaseLabel);
        operationRow.appendChild(decreaseRadio);
        operationRow.appendChild(decreaseLabel);
        content.appendChild(operationRow);

        // Operand Type (Constant/Variable)
        const operandTypeRow = document.createElement('div');
        operandTypeRow.style.cssText = 'display: flex; gap: 12px; padding-top: 8px; border-top: 1px solid var(--color-border);';

        const constantRadio = document.createElement('input');
        constantRadio.type = 'radio';
        constantRadio.name = 'gold-operand-type';
        constantRadio.id = 'constant-gold';
        constantRadio.checked = (this.operandType === 0);
        constantRadio.addEventListener('change', () => {
            this.operandType = 0;
            this.renderContent();
        });

        const constantLabel = document.createElement('label');
        constantLabel.htmlFor = 'constant-gold';
        constantLabel.textContent = tt('Constant');
        constantLabel.style.cssText = 'color: var(--color-text); cursor: pointer;';

        const variableRadio = document.createElement('input');
        variableRadio.type = 'radio';
        variableRadio.name = 'gold-operand-type';
        variableRadio.id = 'variable-gold';
        variableRadio.checked = (this.operandType === 1);
        variableRadio.addEventListener('change', () => {
            this.operandType = 1;
            this.renderContent();
        });

        const variableLabel = document.createElement('label');
        variableLabel.htmlFor = 'variable-gold';
        variableLabel.textContent = tt('Variable');
        variableLabel.style.cssText = 'color: var(--color-text); cursor: pointer;';

        const randomRadio = document.createElement('input');
        randomRadio.type = 'radio';
        randomRadio.name = 'gold-operand-type';
        randomRadio.id = 'random-gold';
        randomRadio.checked = (this.operandType === 2);
        randomRadio.addEventListener('change', () => {
            this.operandType = 2;
            this.renderContent();
        });

        const randomLabel = document.createElement('label');
        randomLabel.htmlFor = 'random-gold';
        randomLabel.textContent = tt('Random');
        randomLabel.style.cssText = 'color: var(--color-text); cursor: pointer;';

        operandTypeRow.appendChild(constantRadio);
        operandTypeRow.appendChild(constantLabel);
        operandTypeRow.appendChild(variableRadio);
        operandTypeRow.appendChild(variableLabel);
        operandTypeRow.appendChild(randomRadio);
        operandTypeRow.appendChild(randomLabel);
        content.appendChild(operandTypeRow);

        // Operand input
        if (this.operandType === 0) {
            // Constant
            content.appendChild(this.createConstantInput());
        } else if (this.operandType === 2) {
            content.appendChild(this.createRandomInput());
        } else {
            // Variable
            content.appendChild(this.createVariableInput());
        }

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
     * Create constant input field
     */
    createConstantInput() {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        const section = document.createElement('div');
        section.style.cssText = 'display: flex; align-items: center; gap: 8px;';

        const label = document.createElement('span');
        label.textContent = tt('Amount:');
        label.style.cssText = 'color: var(--color-text); font-size: 13px; min-width: 80px;';

        const input = document.createElement('input');
        input.type = 'number';
        input.min = 0;
        input.max = 9999999999;
        input.value = this.operand;
        input.style.cssText = `
            padding: 6px 10px;
            background-color: var(--color-bg-input);
            color: var(--color-text);
            border: 1px solid var(--color-border-input);
            border-radius: 3px;
            font-size: 12px;
            width: 120px;
        `;
        input.addEventListener('input', (e) => {
            this.operand = parseInt(e.target.value) || 0;
        });

        section.appendChild(label);
        section.appendChild(input);

        return section;
    }

    /**
     * Random: a whole number of gold between the two ends, rolled when the
     * command runs (Game_Interpreter.operateValue, operand type 2).
     */
    createRandomInput() {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        const section = document.createElement('div');
        section.className = 'rr-random-range';
        section.style.cssText = 'display: flex; align-items: center; gap: 8px;';

        const label = document.createElement('span');
        label.textContent = tt('Amount:');
        label.style.cssText = 'color: var(--color-text); font-size: 13px; min-width: 80px;';
        section.appendChild(label);

        const field = (value, onInput) => {
            const input = document.createElement('input');
            input.type = 'number'; input.min = 0; input.max = 9999999999; input.value = value;
            input.style.cssText = 'padding:6px 10px; background-color:var(--color-bg-input); color:var(--color-text); border:1px solid var(--color-border-input); border-radius:3px; font-size:12px; width:110px;';
            input.addEventListener('input', onInput);
            return input;
        };
        section.appendChild(field(this.operand, e => { this.operand = parseInt(e.target.value) || 0; }));
        const dash = document.createElement('span');
        dash.textContent = '–';
        dash.style.cssText = 'color: var(--color-text-muted);';
        section.appendChild(dash);
        section.appendChild(field(this.operandMax, e => { this.operandMax = parseInt(e.target.value) || 0; }));
        return section;
    }

    /**
     * Create variable input field
     */
    createVariableInput() {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        const section = document.createElement('div');
        section.style.cssText = 'display: flex; align-items: center; gap: 8px;';

        const label = document.createElement('span');
        label.textContent = tt('Variable:');
        label.style.cssText = 'color: var(--color-text); font-size: 13px; min-width: 80px;';

        const input = document.createElement('input');
        input.type = 'number';
        input.min = 1;
        input.max = 9999;
        input.value = this.operand || 1;
        input.style.cssText = `
            padding: 6px 10px;
            background-color: var(--color-bg-input);
            color: var(--color-text);
            border: 1px solid var(--color-border-input);
            border-radius: 3px;
            font-size: 12px;
            width: 80px;
        `;
        input.addEventListener('input', (e) => {
            this.operand = parseInt(e.target.value) || 1;
        });

        const browseBtn = document.createElement('button');
        browseBtn.textContent = '...';
        browseBtn.className = 'rr-btn-browse';
        browseBtn.addEventListener('click', () => this.browseVariables());

        section.appendChild(label);
        section.appendChild(input);
        section.appendChild(browseBtn);

        return section;
    }

    /**
     * Browse variables using SwitchVariablePicker
     */
    browseVariables() {
        const picker = new SwitchVariablePicker(this.databaseManager, this.projectController);
        picker.show('variable', this.operand || 1, (selectedId) => {
            if (selectedId) {
                this.operand = selectedId;
                this.renderContent();
            }
        });
    }

    /**
     * Build command from current data
     */
    buildCommand() {
        return {
            code: 125,
            indent: 0,
            // MZ command 125 contract: [operation, operandType, operand] —
            // the runtime calls operateValue(params[0], params[1], params[2])
            // Random (operand type 2) adds the top of the range; any other
            // amount keeps RPG Maker MZ's own parameter list.
            parameters: this.operandType === 2
                ? [this.operation, this.operandType, this.operand, this.operandMax]
                : [this.operation, this.operandType, this.operand]
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
    module.exports = ChangeGoldEditor;
}
