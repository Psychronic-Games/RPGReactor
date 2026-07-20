/**
 * ChangeTPEditor - Editor for Change TP event command (code 326)
 */
class ChangeTPEditor {
    constructor(databaseManager, projectController) {
        this.databaseManager = databaseManager;
        this.projectController = projectController;
        this.modal = null;
        this.callback = null;

        // Parameters: [actorSelect, actorId, operation, operandType, operand]
        this.actorSelect = 0; // 0=Fixed, 1=Variable
        this.actorId = 1;
        this.operation = 0; // 0=Increase, 1=Decrease
        this.operandType = 0; // 0=Constant, 1=Variable
        this.operand = 0;
    }

    show(command, callback) {
        this.callback = callback;

        if (command && command.code === 326) {
            const params = command.parameters;
            this.actorSelect = params[0] || 0;
            this.actorId = params[1] || 1;
            this.operation = params[2] || 0;
            this.operandType = params[3] || 0;
            this.operand = params[4] || 0;
        } else {
            this.actorSelect = 0;
            this.actorId = 1;
            this.operation = 0;
            this.operandType = 0;
            this.operand = 0;
        }

        if (!this.modal) {
            this.createModal();
        }

        this.renderContent();
        this.modal.style.display = 'flex';
    }

    createModal() {
        this.modal = document.createElement('div');
        this.modal.className = 'change-tp-editor-modal';
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
        container.className = 'change-tp-container';
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

    renderContent() {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        const container = this.modal.querySelector('.change-tp-container');
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
            <h3 style="margin: 0; color: var(--color-text-strong); font-size: 16px;">${tt('Change TP')}</h3>
            <button class="close-btn" style="background: none; border: none; color: var(--color-text-strong); font-size: 20px; cursor: pointer; padding: 0; width: 24px; height: 24px;">×</button>
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

        // Actor selector
        content.appendChild(this.createActorSelector());

        // Operation (Increase/Decrease)
        content.appendChild(this.createOperationSection());

        // Operand (Constant/Variable)
        content.appendChild(this.createOperandSection());

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
        cancelBtn.textContent = tt('Cancel');
        cancelBtn.className = 'rr-btn-secondary';
        cancelBtn.addEventListener('click', () => this.close());

        const okBtn = document.createElement('button');
        okBtn.textContent = tt('OK');
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

    createActorSelector() {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        const section = document.createElement('div');
        section.style.cssText = 'display: flex; flex-direction: column; gap: 8px; padding-bottom: 8px; border-bottom: 1px solid var(--color-border);';

        // Fixed actor radio
        const fixedRow = document.createElement('div');
        fixedRow.style.cssText = 'display: flex; align-items: center; gap: 8px;';
        const fixedRadio = document.createElement('input');
        fixedRadio.type = 'radio'; fixedRadio.name = 'actor-select-326'; fixedRadio.id = 'actor-fixed-326';
        fixedRadio.checked = (this.actorSelect === 0);
        fixedRadio.addEventListener('change', () => { this.actorSelect = 0; this.renderContent(); });
        const fixedLabel = document.createElement('label');
        fixedLabel.htmlFor = 'actor-fixed-326'; fixedLabel.textContent = tt('Fixed');
        fixedLabel.style.cssText = 'color: var(--color-text); cursor: pointer; min-width: 60px;';
        fixedRow.appendChild(fixedRadio); fixedRow.appendChild(fixedLabel);

        if (this.actorSelect === 0) {
            const select = document.createElement('select');
            select.style.cssText = 'padding:6px 10px; background-color:var(--color-bg-input); color:var(--color-text); border:1px solid var(--color-border-input); border-radius:3px; font-size:12px; flex:1;';
            const actors = this.databaseManager.data.actors || [];
            for (let i = 1; i < actors.length; i++) {
                if (!actors[i]) continue;
                const option = document.createElement('option');
                option.value = i; option.textContent = `${i.toString().padStart(4, '0')}: ${actors[i].name || tt('Unnamed')}`;
                option.selected = (this.actorId === i);
                select.appendChild(option);
            }
            select.addEventListener('change', (e) => { this.actorId = parseInt(e.target.value); });
            fixedRow.appendChild(select);
        }
        section.appendChild(fixedRow);

        // Variable radio
        const varRow = document.createElement('div');
        varRow.style.cssText = 'display: flex; align-items: center; gap: 8px;';
        const varRadio = document.createElement('input');
        varRadio.type = 'radio'; varRadio.name = 'actor-select-326'; varRadio.id = 'actor-variable-326';
        varRadio.checked = (this.actorSelect === 1);
        varRadio.addEventListener('change', () => { this.actorSelect = 1; this.renderContent(); });
        const varLabel = document.createElement('label');
        varLabel.htmlFor = 'actor-variable-326'; varLabel.textContent = tt('Variable');
        varLabel.style.cssText = 'color: var(--color-text); cursor: pointer; min-width: 60px;';
        varRow.appendChild(varRadio); varRow.appendChild(varLabel);

        if (this.actorSelect === 1) {
            const varInput = document.createElement('input');
            varInput.type = 'number'; varInput.min = 1; varInput.max = 9999; varInput.value = this.actorId || 1;
            varInput.style.cssText = 'padding:6px 10px; background-color:var(--color-bg-input); color:var(--color-text); border:1px solid var(--color-border-input); border-radius:3px; font-size:12px; width:80px;';
            varInput.addEventListener('input', (e) => { this.actorId = parseInt(e.target.value) || 1; });
            varRow.appendChild(varInput);
            const browseBtn = document.createElement('button');
            browseBtn.textContent = '...';
            browseBtn.className = 'rr-btn-browse';
            browseBtn.addEventListener('click', () => this.browseVariables('actorId'));
            varRow.appendChild(browseBtn);
        }
        section.appendChild(varRow);
        return section;
    }

    createOperationSection() {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        const section = document.createElement('div');
        section.style.cssText = 'display: flex; gap: 12px;';

        const increaseRadio = document.createElement('input');
        increaseRadio.type = 'radio';
        increaseRadio.name = 'operation-326';
        increaseRadio.id = 'increase-326';
        increaseRadio.checked = (this.operation === 0);
        increaseRadio.addEventListener('change', () => { this.operation = 0; });

        const increaseLabel = document.createElement('label');
        increaseLabel.htmlFor = 'increase-326';
        increaseLabel.textContent = tt('Increase');
        increaseLabel.style.cssText = 'color: var(--color-text); cursor: pointer;';

        const decreaseRadio = document.createElement('input');
        decreaseRadio.type = 'radio';
        decreaseRadio.name = 'operation-326';
        decreaseRadio.id = 'decrease-326';
        decreaseRadio.checked = (this.operation === 1);
        decreaseRadio.addEventListener('change', () => { this.operation = 1; });

        const decreaseLabel = document.createElement('label');
        decreaseLabel.htmlFor = 'decrease-326';
        decreaseLabel.textContent = tt('Decrease');
        decreaseLabel.style.cssText = 'color: var(--color-text); cursor: pointer;';

        section.appendChild(increaseRadio);
        section.appendChild(increaseLabel);
        section.appendChild(decreaseRadio);
        section.appendChild(decreaseLabel);
        return section;
    }

    createOperandSection() {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        const section = document.createElement('div');
        section.style.cssText = 'display: flex; flex-direction: column; gap: 8px; padding-top: 8px; border-top: 1px solid var(--color-border);';

        // Constant radio row
        const constRow = document.createElement('div');
        constRow.style.cssText = 'display: flex; align-items: center; gap: 8px;';

        const constRadio = document.createElement('input');
        constRadio.type = 'radio';
        constRadio.name = 'operand-type-326';
        constRadio.id = 'constant-326';
        constRadio.checked = (this.operandType === 0);
        constRadio.addEventListener('change', () => { this.operandType = 0; this.renderContent(); });

        const constLabel = document.createElement('label');
        constLabel.htmlFor = 'constant-326';
        constLabel.textContent = tt('Constant');
        constLabel.style.cssText = 'color: var(--color-text); cursor: pointer; min-width: 60px;';

        constRow.appendChild(constRadio);
        constRow.appendChild(constLabel);

        if (this.operandType === 0) {
            const input = document.createElement('input');
            input.type = 'number'; input.min = 0; input.max = 99999999; input.value = this.operand;
            input.style.cssText = 'padding:6px 10px; background-color:var(--color-bg-input); color:var(--color-text); border:1px solid var(--color-border-input); border-radius:3px; font-size:12px; width:120px;';
            input.addEventListener('input', (e) => { this.operand = parseInt(e.target.value) || 0; });
            constRow.appendChild(input);
        }
        section.appendChild(constRow);

        // Variable radio row
        const varRow = document.createElement('div');
        varRow.style.cssText = 'display: flex; align-items: center; gap: 8px;';

        const varRadio = document.createElement('input');
        varRadio.type = 'radio';
        varRadio.name = 'operand-type-326';
        varRadio.id = 'variable-326';
        varRadio.checked = (this.operandType === 1);
        varRadio.addEventListener('change', () => { this.operandType = 1; this.renderContent(); });

        const varLabel = document.createElement('label');
        varLabel.htmlFor = 'variable-326';
        varLabel.textContent = tt('Variable');
        varLabel.style.cssText = 'color: var(--color-text); cursor: pointer; min-width: 60px;';

        varRow.appendChild(varRadio);
        varRow.appendChild(varLabel);

        if (this.operandType === 1) {
            const varInput = document.createElement('input');
            varInput.type = 'number'; varInput.min = 1; varInput.max = 9999; varInput.value = this.operand || 1;
            varInput.style.cssText = 'padding:6px 10px; background-color:var(--color-bg-input); color:var(--color-text); border:1px solid var(--color-border-input); border-radius:3px; font-size:12px; width:80px;';
            varInput.addEventListener('input', (e) => { this.operand = parseInt(e.target.value) || 1; });
            varRow.appendChild(varInput);

            const browseBtn = document.createElement('button');
            browseBtn.textContent = '...';
            browseBtn.className = 'rr-btn-browse';
            browseBtn.addEventListener('click', () => this.browseVariables('operand'));
            varRow.appendChild(browseBtn);
        }
        section.appendChild(varRow);

        return section;
    }

    browseVariables(property) {
        const picker = new SwitchVariablePicker(this.databaseManager, this.projectController);
        picker.show('variable', this[property] || 1, (selectedId) => {
            if (selectedId) { this[property] = selectedId; this.renderContent(); }
        });
    }

    buildCommand() {
        return {
            code: 326,
            indent: 0,
            parameters: [this.actorSelect, this.actorId, this.operation, this.operandType, this.operand]
        };
    }

    save() {
        if (this.callback) {
            const command = this.buildCommand();
            this.callback(command);
        }
        this.close();
    }

    close() {
        if (this.modal) {
            this.modal.style.display = 'none';
        }
    }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ChangeTPEditor;
}
