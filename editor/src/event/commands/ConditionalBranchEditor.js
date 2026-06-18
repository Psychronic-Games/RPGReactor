/**
 * ConditionalBranchEditor - Editor for Conditional Branch event command (code 111)
 */
class ConditionalBranchEditor {
    constructor(databaseManager, projectController) {
        this.databaseManager = databaseManager;
        this.projectController = projectController;
        this.modal = null;
        this.callback = null;

        // Condition type: 0=switch, 1=variable, 2=self switch, 3=timer, 4=actor, 5=enemy, 6=character, 7=gold, 8=item, 9=weapon, 10=armor, 11=button, 12=script
        this.conditionType = 0;

        // Switch condition
        this.switchId = 1;
        this.switchValue = 0; // 0=ON, 1=OFF

        // Variable condition
        this.variableId = 1;
        this.variableComparison = 0; // 0=equal, 1=greater/equal, 2=less/equal, 3=greater, 4=less, 5=not equal
        this.variableValueType = 0; // 0=constant, 1=variable
        this.variableValue = 0;

        // Self switch condition
        this.selfSwitchCh = 'A'; // A, B, C, D
        this.selfSwitchValue = 0; // 0=ON, 1=OFF

        // Gold condition
        this.goldAmount = 0;
        this.goldComparison = 0; // 0=greater/equal, 1=less/equal, 2=less

        // Item/Weapon/Armor condition
        this.itemId = 1;

        // Script condition
        this.scriptText = '';
    }

    show(command, callback) {
        this.callback = callback;

        if (command && command.code === 111) {
            this.parseCommand(command);
        } else {
            this.resetToDefaults();
        }

        if (!this.modal) {
            this.createModal();
        }

        this.renderContent();
        this.modal.style.display = 'flex';
    }

    parseCommand(command) {
        const params = command.parameters;
        this.conditionType = params[0] || 0;

        switch (this.conditionType) {
            case 0: // Switch
                this.switchId = params[1] || 1;
                this.switchValue = params[2] || 0;
                break;
            case 1: // Variable
                this.variableId = params[1] || 1;
                this.variableComparison = params[4] || 0;
                this.variableValueType = params[2] || 0;
                this.variableValue = params[3] || 0;
                break;
            case 2: // Self Switch
                this.selfSwitchCh = params[1] || 'A';
                this.selfSwitchValue = params[2] || 0;
                break;
            case 7: // Gold
                this.goldAmount = params[1] || 0;
                this.goldComparison = params[2] || 0;
                break;
            case 8: // Item
            case 9: // Weapon
            case 10: // Armor
                this.itemId = params[1] || 1;
                break;
            case 12: // Script
                this.scriptText = params[1] || '';
                break;
        }
    }

    resetToDefaults() {
        this.conditionType = 0;
        this.switchId = 1;
        this.switchValue = 0;
    }

    createModal() {
        this.modal = document.createElement('div');
        this.modal.className = 'conditional-branch-editor-modal';
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
        container.className = 'conditional-branch-container';
        container.style.cssText = `
            background-color: var(--color-bg-surface);
            border: 1px solid var(--color-border);
            border-radius: 6px;
            width: 600px;
            max-height: 80vh;
            overflow-y: auto;
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
        const container = this.modal.querySelector('.conditional-branch-container');
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
            <h3 style="margin: 0; color: var(--color-text-strong); font-size: 16px;">Conditional Branch</h3>
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

        // Condition Type selector
        content.appendChild(this.createConditionTypeSelector());

        // Condition-specific controls
        content.appendChild(this.createConditionControls());

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
        cancelBtn.textContent = 'Cancel';
        cancelBtn.className = 'rr-btn-secondary';
        cancelBtn.addEventListener('click', () => this.close());

        const okBtn = document.createElement('button');
        okBtn.textContent = 'OK';
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

    createConditionTypeSelector() {
        const section = document.createElement('div');
        section.style.cssText = 'display: flex; flex-direction: column; gap: 8px;';

        const label = document.createElement('div');
        label.textContent = 'Condition Type:';
        label.style.cssText = 'color: var(--color-text); font-size: 13px; font-weight: bold;';
        section.appendChild(label);

        const select = document.createElement('select');
        select.style.cssText = `
            padding: 6px 10px;
            background-color: var(--color-bg-input);
            color: var(--color-text);
            border: 1px solid var(--color-border-input);
            border-radius: 3px;
            font-size: 12px;
        `;
        const t = text => window.I18n ? window.I18n.tText(text) : text;
        select.innerHTML = `
            <option value="0">${t('Switch')}</option>
            <option value="1">${t('Variable')}</option>
            <option value="2">${t('Self Switch')}</option>
            <option value="7">${t('Gold')}</option>
            <option value="8">${t('Item')}</option>
            <option value="9">${t('Weapon')}</option>
            <option value="10">${t('Armor')}</option>
            <option value="12">${t('Script')}</option>
        `;
        select.value = this.conditionType.toString();
        select.addEventListener('change', (e) => {
            this.conditionType = parseInt(e.target.value);
            this.renderContent();
        });

        section.appendChild(select);
        return section;
    }

    createConditionControls() {
        const section = document.createElement('div');
        section.style.cssText = 'display: flex; flex-direction: column; gap: 8px; padding-top: 8px; border-top: 1px solid var(--color-border);';

        switch (this.conditionType) {
            case 0: // Switch
                section.appendChild(this.createSwitchControls());
                break;
            case 1: // Variable
                section.appendChild(this.createVariableControls());
                break;
            case 2: // Self Switch
                section.appendChild(this.createSelfSwitchControls());
                break;
            case 7: // Gold
                section.appendChild(this.createGoldControls());
                break;
            case 8: // Item
            case 9: // Weapon
            case 10: // Armor
                section.appendChild(this.createItemControls());
                break;
            case 12: // Script
                section.appendChild(this.createScriptControls());
                break;
        }

        return section;
    }

    createSwitchControls() {
        const container = document.createElement('div');
        container.style.cssText = 'display: flex; flex-direction: column; gap: 8px;';

        // Switch selector
        const switchRow = document.createElement('div');
        switchRow.style.cssText = 'display: flex; align-items: center; gap: 8px;';

        const switchLabel = document.createElement('span');
        switchLabel.textContent = 'Switch:';
        switchLabel.style.cssText = 'color: var(--color-text); font-size: 13px; min-width: 80px;';

        const switchInput = document.createElement('input');
        switchInput.type = 'number';
        switchInput.min = 1;
        switchInput.max = 9999;
        switchInput.value = this.switchId;
        switchInput.style.cssText = `
            padding: 6px 10px;
            background-color: var(--color-bg-input);
            color: var(--color-text);
            border: 1px solid var(--color-border-input);
            border-radius: 3px;
            font-size: 12px;
            width: 100px;
        `;
        switchInput.addEventListener('input', (e) => {
            this.switchId = parseInt(e.target.value) || 1;
        });

        const browseBtn = document.createElement('button');
        browseBtn.textContent = '...';
        browseBtn.className = 'rr-btn-browse';
        browseBtn.addEventListener('click', () => this.browseSwitches());

        switchRow.appendChild(switchLabel);
        switchRow.appendChild(switchInput);
        switchRow.appendChild(browseBtn);
        container.appendChild(switchRow);

        // Value selector
        const valueRow = document.createElement('div');
        valueRow.style.cssText = 'display: flex; align-items: center; gap: 8px;';

        const valueLabel = document.createElement('span');
        valueLabel.textContent = 'is:';
        valueLabel.style.cssText = 'color: var(--color-text); font-size: 13px; min-width: 80px;';

        const onRadio = document.createElement('input');
        onRadio.type = 'radio';
        onRadio.name = 'switch-value';
        onRadio.id = 'switch-on';
        onRadio.checked = (this.switchValue === 0);
        onRadio.addEventListener('change', () => { this.switchValue = 0; });

        const onLabel = document.createElement('label');
        onLabel.htmlFor = 'switch-on';
        onLabel.textContent = 'ON';
        onLabel.style.cssText = 'color: var(--color-text); cursor: pointer;';

        const offRadio = document.createElement('input');
        offRadio.type = 'radio';
        offRadio.name = 'switch-value';
        offRadio.id = 'switch-off';
        offRadio.checked = (this.switchValue === 1);
        offRadio.addEventListener('change', () => { this.switchValue = 1; });

        const offLabel = document.createElement('label');
        offLabel.htmlFor = 'switch-off';
        offLabel.textContent = 'OFF';
        offLabel.style.cssText = 'color: var(--color-text); cursor: pointer;';

        valueRow.appendChild(valueLabel);
        valueRow.appendChild(onRadio);
        valueRow.appendChild(onLabel);
        valueRow.appendChild(offRadio);
        valueRow.appendChild(offLabel);
        container.appendChild(valueRow);

        return container;
    }

    createVariableControls() {
        const container = document.createElement('div');
        container.style.cssText = 'display: flex; flex-direction: column; gap: 8px;';

        // Variable selector
        const varRow = document.createElement('div');
        varRow.style.cssText = 'display: flex; align-items: center; gap: 8px;';

        const varLabel = document.createElement('span');
        varLabel.textContent = 'Variable:';
        varLabel.style.cssText = 'color: var(--color-text); font-size: 13px; min-width: 80px;';

        const varInput = document.createElement('input');
        varInput.type = 'number';
        varInput.min = 1;
        varInput.max = 9999;
        varInput.value = this.variableId;
        varInput.style.cssText = `
            padding: 6px 10px;
            background-color: var(--color-bg-input);
            color: var(--color-text);
            border: 1px solid var(--color-border-input);
            border-radius: 3px;
            font-size: 12px;
            width: 100px;
        `;
        varInput.addEventListener('input', (e) => {
            this.variableId = parseInt(e.target.value) || 1;
        });

        const browseBtn = document.createElement('button');
        browseBtn.textContent = '...';
        browseBtn.className = 'rr-btn-browse';
        browseBtn.addEventListener('click', () => this.browseVariables());

        varRow.appendChild(varLabel);
        varRow.appendChild(varInput);
        varRow.appendChild(browseBtn);
        container.appendChild(varRow);

        // Comparison
        const compRow = document.createElement('div');
        compRow.style.cssText = 'display: flex; align-items: center; gap: 8px;';

        const compLabel = document.createElement('span');
        compLabel.textContent = 'Comparison:';
        compLabel.style.cssText = 'color: var(--color-text); font-size: 13px; min-width: 80px;';

        const compSelect = document.createElement('select');
        compSelect.style.cssText = `
            padding: 6px 10px;
            background-color: var(--color-bg-input);
            color: var(--color-text);
            border: 1px solid var(--color-border-input);
            border-radius: 3px;
            font-size: 12px;
            width: 150px;
        `;
        const t = text => window.I18n ? window.I18n.tText(text) : text;
        compSelect.innerHTML = `
            <option value="0">${t('Equal to (==)')}</option>
            <option value="1">${t('Greater or Equal (>=)')}</option>
            <option value="2">${t('Less or Equal (<=)')}</option>
            <option value="3">${t('Greater than (>)')}</option>
            <option value="4">${t('Less than (<)')}</option>
            <option value="5">${t('Not Equal (!=)')}</option>
        `;
        compSelect.value = this.variableComparison.toString();
        compSelect.addEventListener('change', (e) => {
            this.variableComparison = parseInt(e.target.value);
        });

        compRow.appendChild(compLabel);
        compRow.appendChild(compSelect);
        container.appendChild(compRow);

        // Value
        const valueRow = document.createElement('div');
        valueRow.style.cssText = 'display: flex; align-items: center; gap: 8px;';

        const valueLabel = document.createElement('span');
        valueLabel.textContent = 'Value:';
        valueLabel.style.cssText = 'color: var(--color-text); font-size: 13px; min-width: 80px;';

        const constRadio = document.createElement('input');
        constRadio.type = 'radio';
        constRadio.name = 'var-value-type';
        constRadio.id = 'var-const';
        constRadio.checked = (this.variableValueType === 0);
        constRadio.addEventListener('change', () => {
            this.variableValueType = 0;
            this.renderContent();
        });

        const constLabel = document.createElement('label');
        constLabel.htmlFor = 'var-const';
        constLabel.textContent = 'Constant';
        constLabel.style.cssText = 'color: var(--color-text); cursor: pointer;';

        const varRadio = document.createElement('input');
        varRadio.type = 'radio';
        varRadio.name = 'var-value-type';
        varRadio.id = 'var-var';
        varRadio.checked = (this.variableValueType === 1);
        varRadio.addEventListener('change', () => {
            this.variableValueType = 1;
            this.renderContent();
        });

        const varVarLabel = document.createElement('label');
        varVarLabel.htmlFor = 'var-var';
        varVarLabel.textContent = 'Variable';
        varVarLabel.style.cssText = 'color: var(--color-text); cursor: pointer;';

        valueRow.appendChild(valueLabel);
        valueRow.appendChild(constRadio);
        valueRow.appendChild(constLabel);
        valueRow.appendChild(varRadio);
        valueRow.appendChild(varVarLabel);
        container.appendChild(valueRow);

        // Value input
        const valueInputRow = document.createElement('div');
        valueInputRow.style.cssText = 'display: flex; align-items: center; gap: 8px; margin-left: 80px;';

        const valueInput = document.createElement('input');
        valueInput.type = 'number';
        valueInput.value = this.variableValue;
        valueInput.style.cssText = `
            padding: 6px 10px;
            background-color: var(--color-bg-input);
            color: var(--color-text);
            border: 1px solid var(--color-border-input);
            border-radius: 3px;
            font-size: 12px;
            width: 150px;
        `;
        valueInput.addEventListener('input', (e) => {
            this.variableValue = parseInt(e.target.value) || 0;
        });

        valueInputRow.appendChild(valueInput);
        container.appendChild(valueInputRow);

        return container;
    }

    createSelfSwitchControls() {
        const container = document.createElement('div');
        container.style.cssText = 'display: flex; flex-direction: column; gap: 8px;';

        // Self Switch selector
        const switchRow = document.createElement('div');
        switchRow.style.cssText = 'display: flex; align-items: center; gap: 8px;';

        const switchLabel = document.createElement('span');
        switchLabel.textContent = 'Self Switch:';
        switchLabel.style.cssText = 'color: var(--color-text); font-size: 13px; min-width: 80px;';

        const switchSelect = document.createElement('select');
        switchSelect.style.cssText = `
            padding: 6px 10px;
            background-color: var(--color-bg-input);
            color: var(--color-text);
            border: 1px solid var(--color-border-input);
            border-radius: 3px;
            font-size: 12px;
            width: 100px;
        `;
        switchSelect.innerHTML = `
            <option value="A">A</option>
            <option value="B">B</option>
            <option value="C">C</option>
            <option value="D">D</option>
        `;
        switchSelect.value = this.selfSwitchCh;
        switchSelect.addEventListener('change', (e) => {
            this.selfSwitchCh = e.target.value;
        });

        switchRow.appendChild(switchLabel);
        switchRow.appendChild(switchSelect);
        container.appendChild(switchRow);

        // Value selector
        const valueRow = document.createElement('div');
        valueRow.style.cssText = 'display: flex; align-items: center; gap: 8px;';

        const valueLabel = document.createElement('span');
        valueLabel.textContent = 'is:';
        valueLabel.style.cssText = 'color: var(--color-text); font-size: 13px; min-width: 80px;';

        const onRadio = document.createElement('input');
        onRadio.type = 'radio';
        onRadio.name = 'self-switch-value';
        onRadio.id = 'self-switch-on';
        onRadio.checked = (this.selfSwitchValue === 0);
        onRadio.addEventListener('change', () => { this.selfSwitchValue = 0; });

        const onLabel = document.createElement('label');
        onLabel.htmlFor = 'self-switch-on';
        onLabel.textContent = 'ON';
        onLabel.style.cssText = 'color: var(--color-text); cursor: pointer;';

        const offRadio = document.createElement('input');
        offRadio.type = 'radio';
        offRadio.name = 'self-switch-value';
        offRadio.id = 'self-switch-off';
        offRadio.checked = (this.selfSwitchValue === 1);
        offRadio.addEventListener('change', () => { this.selfSwitchValue = 1; });

        const offLabel = document.createElement('label');
        offLabel.htmlFor = 'self-switch-off';
        offLabel.textContent = 'OFF';
        offLabel.style.cssText = 'color: var(--color-text); cursor: pointer;';

        valueRow.appendChild(valueLabel);
        valueRow.appendChild(onRadio);
        valueRow.appendChild(onLabel);
        valueRow.appendChild(offRadio);
        valueRow.appendChild(offLabel);
        container.appendChild(valueRow);

        return container;
    }

    createGoldControls() {
        const container = document.createElement('div');
        container.style.cssText = 'display: flex; flex-direction: column; gap: 8px;';

        const row = document.createElement('div');
        row.style.cssText = 'display: flex; align-items: center; gap: 8px;';

        const label = document.createElement('span');
        label.textContent = 'Amount:';
        label.style.cssText = 'color: var(--color-text); font-size: 13px; min-width: 80px;';

        const compSelect = document.createElement('select');
        compSelect.style.cssText = `
            padding: 6px 10px;
            background-color: var(--color-bg-input);
            color: var(--color-text);
            border: 1px solid var(--color-border-input);
            border-radius: 3px;
            font-size: 12px;
        `;
        compSelect.innerHTML = `
            <option value="0">>=</option>
            <option value="1"><=</option>
            <option value="2"><</option>
        `;
        compSelect.value = this.goldComparison.toString();
        compSelect.addEventListener('change', (e) => {
            this.goldComparison = parseInt(e.target.value);
        });

        const input = document.createElement('input');
        input.type = 'number';
        input.min = 0;
        input.value = this.goldAmount;
        input.style.cssText = `
            padding: 6px 10px;
            background-color: var(--color-bg-input);
            color: var(--color-text);
            border: 1px solid var(--color-border-input);
            border-radius: 3px;
            font-size: 12px;
            width: 150px;
        `;
        input.addEventListener('input', (e) => {
            this.goldAmount = parseInt(e.target.value) || 0;
        });

        row.appendChild(label);
        row.appendChild(compSelect);
        row.appendChild(input);
        container.appendChild(row);

        return container;
    }

    createItemControls() {
        const container = document.createElement('div');
        container.style.cssText = 'display: flex; align-items: center; gap: 8px;';

        const typeName = this.conditionType === 8 ? 'Item' :
                        this.conditionType === 9 ? 'Weapon' : 'Armor';

        const label = document.createElement('span');
        label.textContent = `${typeName}:`;
        label.style.cssText = 'color: var(--color-text); font-size: 13px; min-width: 80px;';

        const input = document.createElement('input');
        input.type = 'number';
        input.min = 1;
        input.value = this.itemId;
        input.style.cssText = `
            padding: 6px 10px;
            background-color: var(--color-bg-input);
            color: var(--color-text);
            border: 1px solid var(--color-border-input);
            border-radius: 3px;
            font-size: 12px;
            width: 100px;
        `;
        input.addEventListener('input', (e) => {
            this.itemId = parseInt(e.target.value) || 1;
        });

        container.appendChild(label);
        container.appendChild(input);

        return container;
    }

    createScriptControls() {
        const container = document.createElement('div');
        container.style.cssText = 'display: flex; flex-direction: column; gap: 8px;';

        const label = document.createElement('div');
        label.textContent = 'Script:';
        label.style.cssText = 'color: var(--color-text); font-size: 13px;';

        const textarea = document.createElement('textarea');
        textarea.value = this.scriptText;
        textarea.style.cssText = `
            padding: 8px;
            background-color: var(--color-bg-input);
            color: var(--color-text);
            border: 1px solid var(--color-border-input);
            border-radius: 3px;
            font-size: 12px;
            font-family: monospace;
            resize: vertical;
            min-height: 100px;
        `;
        textarea.addEventListener('input', (e) => {
            this.scriptText = e.target.value;
        });

        container.appendChild(label);
        container.appendChild(textarea);

        return container;
    }

    browseSwitches() {
        const picker = new SwitchVariablePicker(this.databaseManager, this.projectController);
        picker.show('switch', this.switchId, (selectedId) => {
            if (selectedId) {
                this.switchId = selectedId;
                this.renderContent();
            }
        });
    }

    browseVariables() {
        const picker = new SwitchVariablePicker(this.databaseManager, this.projectController);
        picker.show('variable', this.variableId, (selectedId) => {
            if (selectedId) {
                this.variableId = selectedId;
                this.renderContent();
            }
        });
    }

    buildCommands() {
        const commands = [];
        let parameters = [];

        switch (this.conditionType) {
            case 0: // Switch
                parameters = [this.conditionType, this.switchId, this.switchValue];
                break;
            case 1: // Variable
                parameters = [this.conditionType, this.variableId, this.variableValueType,
                             this.variableValue, this.variableComparison];
                break;
            case 2: // Self Switch
                parameters = [this.conditionType, this.selfSwitchCh, this.selfSwitchValue];
                break;
            case 7: // Gold
                parameters = [this.conditionType, this.goldAmount, this.goldComparison];
                break;
            case 8: // Item
            case 9: // Weapon
            case 10: // Armor
                parameters = [this.conditionType, this.itemId];
                break;
            case 12: // Script
                parameters = [this.conditionType, this.scriptText];
                break;
        }

        // Conditional Branch command
        commands.push({
            code: 111,
            indent: 0,
            parameters: parameters
        });

        // Else branch (optional placeholder)
        commands.push({
            code: 411,
            indent: 1,
            parameters: []
        });

        // End
        commands.push({
            code: 412,
            indent: 0,
            parameters: []
        });

        return commands;
    }

    save() {
        if (this.callback) {
            const commands = this.buildCommands();
            this.callback(commands);
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
    module.exports = ConditionalBranchEditor;
}
