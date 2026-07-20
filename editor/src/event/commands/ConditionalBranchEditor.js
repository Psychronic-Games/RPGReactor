/**
 * ConditionalBranchEditor - Editor for Conditional Branch event command (code 111)
 */
class ConditionalBranchEditor {
    constructor(databaseManager, projectController) {
        this.databaseManager = databaseManager;
        this.projectController = projectController;
        this.modal = null;
        this.callback = null;

        // MZ condition types 0 through 13.
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

        // Timer condition
        this.timerSeconds = 0;
        this.timerComparison = 0; // 0=greater/equal, 1=less/equal

        // Actor condition
        this.actorId = 1;
        this.actorCondition = 0; // 0=party, 1=name, 2=class, 3=skill, 4=weapon, 5=armor, 6=state
        this.actorValue = 0;

        // Enemy condition
        this.enemyIndex = 0; // zero-based troop member index
        this.enemyCondition = 0; // 0=appeared, 1=state
        this.enemyStateId = 1;

        // Character condition
        this.characterId = -1;
        this.characterDirection = 2;

        // Gold condition
        this.goldAmount = 0;
        this.goldComparison = 0; // 0=greater/equal, 1=less/equal, 2=less

        // Item/Weapon/Armor condition
        this.itemId = 1;
        this.includeEquipped = false;

        // Button condition
        this.buttonName = 'ok';
        this.buttonMode = 0; // 0=pressed, 1=triggered, 2=repeated

        // Script condition
        this.scriptText = '';

        // Editor-only advanced input conditions (serialized as Script).
        this.extendedButtonName = 'ok';
        this.extendedButtonMode = 'released';
        this.mouseButton = 0;
        this.mouseButtonMode = 'pressed';
        this.wheelDirection = 'up';
        this.pointerAxis = 'x';
        this.pointerComparison = '==';
        this.pointerValueType = 'constant';
        this.pointerValue = 0;

        // Vehicle condition: 0=boat, 1=ship, 2=airship
        this.vehicleType = 0;

        // Existing arrays are reused while their parsed UI state is unchanged.
        this.originalParameters = null;
        this.originalState = null;

        // Whether to emit the 411 Else marker on save
        this.createElse = true;
    }

    show(command, callback, options = {}) {
        this.callback = callback;

        if (command && command.code === 111) {
            this.parseCommand(command);
            // Editing an existing If: mirror its current shape so saving
            // without touching the checkbox never adds or removes an Else.
            this.createElse = !!options.hasElse;
        } else {
            this.resetToDefaults();
            this.createElse = true;
        }

        if (!this.modal) {
            this.createModal();
        }

        this.renderContent();
        this.modal.style.display = 'flex';
    }

    parseCommand(command) {
        const params = Array.isArray(command.parameters) ? command.parameters : [];
        this.resetToDefaults();
        this.conditionType = params[0] ?? 0;

        if (this.conditionType === 12 && this._parseAdvancedInput(params[1])) {
            this.originalParameters = params.slice();
            this.originalState = this.conditionState();
            return;
        }

        switch (this.conditionType) {
            case 0: // Switch
                this.switchId = params[1] ?? 1;
                this.switchValue = params[2] ?? 0;
                break;
            case 1: // Variable
                this.variableId = params[1] ?? 1;
                this.variableComparison = params[4] ?? 0;
                this.variableValueType = params[2] ?? 0;
                this.variableValue = params[3] ?? 0;
                break;
            case 2: // Self Switch
                this.selfSwitchCh = params[1] ?? 'A';
                this.selfSwitchValue = params[2] ?? 0;
                break;
            case 3: // Timer
                this.timerSeconds = params[1] ?? 0;
                this.timerComparison = params[2] ?? 0;
                break;
            case 4: // Actor
                this.actorId = params[1] ?? 1;
                this.actorCondition = params[2] ?? 0;
                this.actorValue = params[3] ?? (this.actorCondition === 1 ? '' : 0);
                break;
            case 5: // Enemy
                this.enemyIndex = params[1] ?? 0;
                this.enemyCondition = params[2] ?? 0;
                this.enemyStateId = params[3] ?? 1;
                break;
            case 6: // Character
                this.characterId = params[1] ?? -1;
                this.characterDirection = params[2] ?? 2;
                break;
            case 7: // Gold
                this.goldAmount = params[1] ?? 0;
                this.goldComparison = params[2] ?? 0;
                break;
            case 8: // Item
                this.itemId = params[1] ?? 1;
                break;
            case 9: // Weapon
            case 10: // Armor
                this.itemId = params[1] ?? 1;
                this.includeEquipped = params[2] ?? false;
                break;
            case 11: // Button
                this.buttonName = params[1] ?? 'ok';
                // MV/early arrays have no mode; MZ's safe equivalent is Pressed.
                this.buttonMode = params[2] ?? 0;
                break;
            case 12: // Script
                this.scriptText = params[1] ?? '';
                break;
            case 13: // Vehicle
                this.vehicleType = params[1] ?? 0;
                break;
        }

        this.originalParameters = params.slice();
        this.originalState = this.conditionState();
    }

    resetToDefaults() {
        this.conditionType = 0;
        this.switchId = 1;
        this.switchValue = 0;
        this.variableId = 1;
        this.variableComparison = 0;
        this.variableValueType = 0;
        this.variableValue = 0;
        this.selfSwitchCh = 'A';
        this.selfSwitchValue = 0;
        this.timerSeconds = 0;
        this.timerComparison = 0;
        this.actorId = 1;
        this.actorCondition = 0;
        this.actorValue = 0;
        this.enemyIndex = 0;
        this.enemyCondition = 0;
        this.enemyStateId = 1;
        this.characterId = -1;
        this.characterDirection = 2;
        this.goldAmount = 0;
        this.goldComparison = 0;
        this.itemId = 1;
        this.includeEquipped = false;
        this.buttonName = 'ok';
        this.buttonMode = 0;
        this.scriptText = '';
        this.extendedButtonName = 'ok';
        this.extendedButtonMode = 'released';
        this.mouseButton = 0;
        this.mouseButtonMode = 'pressed';
        this.wheelDirection = 'up';
        this.pointerAxis = 'x';
        this.pointerComparison = '==';
        this.pointerValueType = 'constant';
        this.pointerValue = 0;
        this.vehicleType = 0;
        this.originalParameters = null;
        this.originalState = null;
    }

    conditionState() {
        switch (this.conditionType) {
            case 0: return [0, this.switchId, this.switchValue];
            case 1: return [1, this.variableId, this.variableValueType, this.variableValue, this.variableComparison];
            case 2: return [2, this.selfSwitchCh, this.selfSwitchValue];
            case 3: return [3, this.timerSeconds, this.timerComparison];
            case 4: return [4, this.actorId, this.actorCondition, this.actorValue];
            case 5: return [5, this.enemyIndex, this.enemyCondition, this.enemyStateId];
            case 6: return [6, this.characterId, this.characterDirection];
            case 7: return [7, this.goldAmount, this.goldComparison];
            case 8: return [8, this.itemId];
            case 9: return [9, this.itemId, this.includeEquipped];
            case 10: return [10, this.itemId, this.includeEquipped];
            case 11: return [11, this.buttonName, this.buttonMode];
            case 12: return [12, this.scriptText];
            case 13: return [13, this.vehicleType];
            case 14: return [14, this.extendedButtonName, this.extendedButtonMode];
            case 15: return [15, this.mouseButton, this.mouseButtonMode];
            case 16: return [16, this.wheelDirection];
            case 17: return [17, this.pointerAxis, this.pointerComparison,
                this.pointerValueType, this.pointerValue];
            default: return [this.conditionType];
        }
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
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
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
            <h3 style="margin: 0; color: var(--color-text-strong); font-size: 16px;">${tt('Conditional Branch')}</h3>
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

        const elseLabel = document.createElement('label');
        elseLabel.style.cssText = `
            margin-right: auto;
            display: flex;
            align-items: center;
            gap: 6px;
            color: var(--color-text);
            font-size: 12px;
            cursor: pointer;
        `;
        const elseCheckbox = document.createElement('input');
        elseCheckbox.type = 'checkbox';
        elseCheckbox.checked = this.createElse;
        elseCheckbox.addEventListener('change', () => {
            this.createElse = elseCheckbox.checked;
        });
        elseLabel.appendChild(elseCheckbox);
        elseLabel.appendChild(document.createTextNode(tt('Create Else Branch')));
        footer.appendChild(elseLabel);

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

    createConditionTypeSelector() {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        const section = document.createElement('div');
        section.style.cssText = 'display: flex; flex-direction: column; gap: 8px;';

        const label = document.createElement('div');
        label.textContent = tt('Condition Type:');
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
        select.innerHTML = `
            <option value="0">${tt('Switch')}</option>
            <option value="1">${tt('Variable')}</option>
            <option value="2">${tt('Self Switch')}</option>
            <option value="3">${tt('Timer')}</option>
            <option value="4">${tt('Actor')}</option>
            <option value="5">${tt('Enemy')}</option>
            <option value="6">${tt('Character')}</option>
            <option value="7">${tt('Gold')}</option>
            <option value="8">${tt('Item')}</option>
            <option value="9">${tt('Weapon')}</option>
            <option value="10">${tt('Armor')}</option>
            <option value="11">${tt('Button')}</option>
            <option value="12">${tt('Script')}</option>
            <option value="13">${tt('Vehicle')}</option>
            <option value="14">${tt('Keyboard Extended')}</option>
            <option value="15">${tt('Mouse Button')}</option>
            <option value="16">${tt('Mouse Wheel')}</option>
            <option value="17">${tt('Pointer Position')}</option>
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
            case 3: // Timer
                section.appendChild(this.createTimerControls());
                break;
            case 4: // Actor
                section.appendChild(this.createActorControls());
                break;
            case 5: // Enemy
                section.appendChild(this.createEnemyControls());
                break;
            case 6: // Character
                section.appendChild(this.createCharacterControls());
                break;
            case 7: // Gold
                section.appendChild(this.createGoldControls());
                break;
            case 8: // Item
            case 9: // Weapon
            case 10: // Armor
                section.appendChild(this.createItemControls());
                break;
            case 11: // Button
                section.appendChild(this.createButtonControls());
                break;
            case 12: // Script
                section.appendChild(this.createScriptControls());
                break;
            case 13: // Vehicle
                section.appendChild(this.createVehicleControls());
                break;
            case 14: // Keyboard Extended
                section.appendChild(this.createExtendedKeyboardControls());
                break;
            case 15: // Mouse Button
                section.appendChild(this.createMouseButtonControls());
                break;
            case 16: // Mouse Wheel
                section.appendChild(this.createMouseWheelControls());
                break;
            case 17: // Pointer Position
                section.appendChild(this.createPointerPositionControls());
                break;
        }

        return section;
    }

    createSwitchControls() {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        const container = document.createElement('div');
        container.style.cssText = 'display: flex; flex-direction: column; gap: 8px;';

        // Switch selector
        const switchRow = document.createElement('div');
        switchRow.style.cssText = 'display: flex; align-items: center; gap: 8px;';

        const switchLabel = document.createElement('span');
        switchLabel.textContent = tt('Switch:');
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
        valueLabel.textContent = tt('is:');
        valueLabel.style.cssText = 'color: var(--color-text); font-size: 13px; min-width: 80px;';

        const onRadio = document.createElement('input');
        onRadio.type = 'radio';
        onRadio.name = 'switch-value';
        onRadio.id = 'switch-on';
        onRadio.checked = (this.switchValue === 0);
        onRadio.addEventListener('change', () => { this.switchValue = 0; });

        const onLabel = document.createElement('label');
        onLabel.htmlFor = 'switch-on';
        onLabel.textContent = tt('ON');
        onLabel.style.cssText = 'color: var(--color-text); cursor: pointer;';

        const offRadio = document.createElement('input');
        offRadio.type = 'radio';
        offRadio.name = 'switch-value';
        offRadio.id = 'switch-off';
        offRadio.checked = (this.switchValue === 1);
        offRadio.addEventListener('change', () => { this.switchValue = 1; });

        const offLabel = document.createElement('label');
        offLabel.htmlFor = 'switch-off';
        offLabel.textContent = tt('OFF');
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
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        const container = document.createElement('div');
        container.style.cssText = 'display: flex; flex-direction: column; gap: 8px;';

        // Variable selector
        const varRow = document.createElement('div');
        varRow.style.cssText = 'display: flex; align-items: center; gap: 8px;';

        const varLabel = document.createElement('span');
        varLabel.textContent = tt('Variable:');
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
        compLabel.textContent = tt('Comparison:');
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
        compSelect.innerHTML = `
            <option value="0">${tt('Equal to (==)')}</option>
            <option value="1">${tt('Greater or Equal (>=)')}</option>
            <option value="2">${tt('Less or Equal (<=)')}</option>
            <option value="3">${tt('Greater than (>)')}</option>
            <option value="4">${tt('Less than (<)')}</option>
            <option value="5">${tt('Not Equal (!=)')}</option>
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
        valueLabel.textContent = tt('Value:');
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
        constLabel.textContent = tt('Constant');
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
        varVarLabel.textContent = tt('Variable');
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
        if (this.variableValueType === 1) {
            const browseValueBtn = document.createElement('button');
            browseValueBtn.textContent = '...';
            browseValueBtn.className = 'rr-btn-browse';
            browseValueBtn.addEventListener('click', () => this.browseVariables('variableValue'));
            valueInputRow.appendChild(browseValueBtn);
        }
        container.appendChild(valueInputRow);

        return container;
    }

    createSelfSwitchControls() {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        const container = document.createElement('div');
        container.style.cssText = 'display: flex; flex-direction: column; gap: 8px;';

        // Self Switch selector
        const switchRow = document.createElement('div');
        switchRow.style.cssText = 'display: flex; align-items: center; gap: 8px;';

        const switchLabel = document.createElement('span');
        switchLabel.textContent = tt('Self Switch:');
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
        valueLabel.textContent = tt('is:');
        valueLabel.style.cssText = 'color: var(--color-text); font-size: 13px; min-width: 80px;';

        const onRadio = document.createElement('input');
        onRadio.type = 'radio';
        onRadio.name = 'self-switch-value';
        onRadio.id = 'self-switch-on';
        onRadio.checked = (this.selfSwitchValue === 0);
        onRadio.addEventListener('change', () => { this.selfSwitchValue = 0; });

        const onLabel = document.createElement('label');
        onLabel.htmlFor = 'self-switch-on';
        onLabel.textContent = tt('ON');
        onLabel.style.cssText = 'color: var(--color-text); cursor: pointer;';

        const offRadio = document.createElement('input');
        offRadio.type = 'radio';
        offRadio.name = 'self-switch-value';
        offRadio.id = 'self-switch-off';
        offRadio.checked = (this.selfSwitchValue === 1);
        offRadio.addEventListener('change', () => { this.selfSwitchValue = 1; });

        const offLabel = document.createElement('label');
        offLabel.htmlFor = 'self-switch-off';
        offLabel.textContent = tt('OFF');
        offLabel.style.cssText = 'color: var(--color-text); cursor: pointer;';

        valueRow.appendChild(valueLabel);
        valueRow.appendChild(onRadio);
        valueRow.appendChild(onLabel);
        valueRow.appendChild(offRadio);
        valueRow.appendChild(offLabel);
        container.appendChild(valueRow);

        return container;
    }

    _tt(text) {
        return typeof window !== 'undefined' && window.I18n ? window.I18n.tText(text) : text;
    }

    _styleControl(control) {
        control.style.cssText = `
            padding: 6px 10px;
            background-color: var(--color-bg-input);
            color: var(--color-text);
            border: 1px solid var(--color-border-input);
            border-radius: 3px;
            font-size: 12px;
            flex: 1;
            min-width: 0;
        `;
        return control;
    }

    _createRow(labelText, control) {
        const row = document.createElement('div');
        row.style.cssText = 'display: flex; align-items: center; gap: 8px;';
        const label = document.createElement('span');
        label.textContent = labelText;
        label.style.cssText = 'color: var(--color-text); font-size: 13px; min-width: 130px;';
        row.appendChild(label);
        row.appendChild(control);
        return row;
    }

    _createSelect(labelText, options, value, onChange) {
        const select = this._styleControl(document.createElement('select'));
        for (const optionData of options) {
            const option = document.createElement('option');
            option.value = String(optionData.value);
            option.textContent = optionData.label;
            select.appendChild(option);
        }
        select.value = String(value);
        select.addEventListener('change', e => onChange(e.target.value));
        return this._createRow(labelText, select);
    }

    _databaseEntries(getterName) {
        try {
            const getter = this.databaseManager && this.databaseManager[getterName];
            return typeof getter === 'function' ? getter.call(this.databaseManager) || [] : [];
        } catch (e) {
            return [];
        }
    }

    _createDatabaseSelect(labelText, getterName, value, onChange) {
        const select = this._styleControl(document.createElement('select'));
        let hasCurrent = false;
        for (const entry of this._databaseEntries(getterName)) {
            if (!entry || entry.id == null) continue;
            const option = document.createElement('option');
            option.value = String(entry.id);
            option.textContent = `#${String(entry.id).padStart(4, '0')}: ${entry.name || this._tt('Unnamed')}`;
            select.appendChild(option);
            if (entry.id === value) hasCurrent = true;
        }
        if (!hasCurrent) {
            const fallback = document.createElement('option');
            fallback.value = String(value);
            fallback.textContent = `#${String(value).padStart(4, '0')}: ${this._tt('Missing')}`;
            select.appendChild(fallback);
        }
        select.value = String(value);
        select.addEventListener('change', e => onChange(parseInt(e.target.value, 10)));
        return this._createRow(labelText, select);
    }

    _createNumberRow(labelText, value, onChange, min = null) {
        const input = this._styleControl(document.createElement('input'));
        input.type = 'number';
        if (min !== null) input.min = min;
        input.value = value;
        input.addEventListener('input', e => {
            const parsed = parseInt(e.target.value, 10);
            if (!Number.isNaN(parsed)) onChange(parsed);
        });
        return this._createRow(labelText, input);
    }

    createTimerControls() {
        const container = document.createElement('div');
        container.style.cssText = 'display: flex; flex-direction: column; gap: 8px;';
        container.appendChild(this._createSelect(this._tt('Comparison:'), [
            { value: 0, label: this._tt('Greater or Equal (>=)') },
            { value: 1, label: this._tt('Less or Equal (<=)') }
        ], this.timerComparison, value => { this.timerComparison = parseInt(value, 10); }));
        container.appendChild(this._createNumberRow(this._tt('Seconds:'), this.timerSeconds,
            value => { this.timerSeconds = value; }, 0));
        return container;
    }

    createActorControls() {
        const container = document.createElement('div');
        container.style.cssText = 'display: flex; flex-direction: column; gap: 8px;';
        container.appendChild(this._createDatabaseSelect(this._tt('Actor:'), 'getActors', this.actorId,
            value => { this.actorId = value; }));
        container.appendChild(this._createSelect(this._tt('Condition:'), [
            { value: 0, label: this._tt('In the Party') },
            { value: 1, label: this._tt('Name') },
            { value: 2, label: this._tt('Class') },
            { value: 3, label: this._tt('Skill') },
            { value: 4, label: this._tt('Weapon') },
            { value: 5, label: this._tt('Armor') },
            { value: 6, label: this._tt('State') }
        ], this.actorCondition, value => {
            this.actorCondition = parseInt(value, 10);
            this.actorValue = this.actorCondition === 1 ? '' : 1;
            this.renderContent();
        }));

        if (this.actorCondition === 1) {
            const input = this._styleControl(document.createElement('input'));
            input.type = 'text';
            input.value = this.actorValue;
            input.addEventListener('input', e => { this.actorValue = e.target.value; });
            container.appendChild(this._createRow(this._tt('Name:'), input));
        } else {
            const actorGetters = {
                2: [this._tt('Class:'), 'getClasses'],
                3: [this._tt('Skill:'), 'getSkills'],
                4: [this._tt('Weapon:'), 'getWeapons'],
                5: [this._tt('Armor:'), 'getArmors'],
                6: [this._tt('State:'), 'getStates']
            };
            const target = actorGetters[this.actorCondition];
            if (target) {
                container.appendChild(this._createDatabaseSelect(target[0], target[1], this.actorValue,
                    value => { this.actorValue = value; }));
            }
        }
        return container;
    }

    createEnemyControls() {
        const container = document.createElement('div');
        container.style.cssText = 'display: flex; flex-direction: column; gap: 8px;';
        container.appendChild(this._createNumberRow(this._tt('Troop Member Index:'), this.enemyIndex,
            value => { this.enemyIndex = value; }, 0));
        container.appendChild(this._createSelect(this._tt('Condition:'), [
            { value: 0, label: this._tt('Appeared') },
            { value: 1, label: this._tt('State') }
        ], this.enemyCondition, value => {
            this.enemyCondition = parseInt(value, 10);
            this.renderContent();
        }));
        if (this.enemyCondition === 1) {
            container.appendChild(this._createDatabaseSelect(this._tt('State:'), 'getStates', this.enemyStateId,
                value => { this.enemyStateId = value; }));
        }
        return container;
    }

    _currentMapEvents() {
        try {
            const tilemap = this.projectController && this.projectController.tilemapManager;
            const eventManager = this.projectController && this.projectController.eventManager;
            const map = (tilemap && tilemap.currentMap) || (eventManager && eventManager.currentMap);
            return map && Array.isArray(map.events) ? map.events : [];
        } catch (e) {
            return [];
        }
    }

    createCharacterControls() {
        const container = document.createElement('div');
        container.style.cssText = 'display: flex; flex-direction: column; gap: 8px;';
        const options = [
            { value: -1, label: this._tt('Player') },
            { value: 0, label: this._tt('This Event') }
        ];
        let hasCurrent = this.characterId <= 0;
        this._currentMapEvents().forEach((event, index) => {
            if (!event) return;
            const id = event.id ?? index;
            if (id <= 0) return;
            options.push({ value: id, label: `${this._tt('Event')} ${String(id).padStart(3, '0')}: ${event.name || this._tt('Unnamed')}` });
            if (id === this.characterId) hasCurrent = true;
        });
        if (this.characterId > 0 && !hasCurrent) {
            options.push({ value: this.characterId, label: `${this._tt('Event')} ${String(this.characterId).padStart(3, '0')}: ${this._tt('Missing')}` });
        }
        container.appendChild(this._createSelect(this._tt('Character:'), options, this.characterId,
            value => { this.characterId = parseInt(value, 10); }));
        container.appendChild(this._createSelect(this._tt('Direction:'), [
            { value: 2, label: this._tt('Down') },
            { value: 4, label: this._tt('Left') },
            { value: 6, label: this._tt('Right') },
            { value: 8, label: this._tt('Up') }
        ], this.characterDirection, value => { this.characterDirection = parseInt(value, 10); }));
        return container;
    }

    createGoldControls() {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        const container = document.createElement('div');
        container.style.cssText = 'display: flex; flex-direction: column; gap: 8px;';

        const row = document.createElement('div');
        row.style.cssText = 'display: flex; align-items: center; gap: 8px;';

        const label = document.createElement('span');
        label.textContent = tt('Amount:');
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
        container.style.cssText = 'display: flex; flex-direction: column; gap: 8px;';
        const config = this.conditionType === 8 ? [this._tt('Item:'), 'getItems'] :
            this.conditionType === 9 ? [this._tt('Weapon:'), 'getWeapons'] : [this._tt('Armor:'), 'getArmors'];
        container.appendChild(this._createDatabaseSelect(config[0], config[1], this.itemId,
            value => { this.itemId = value; }));

        if (this.conditionType === 9 || this.conditionType === 10) {
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.checked = this.includeEquipped;
            checkbox.addEventListener('change', e => { this.includeEquipped = e.target.checked; });
            const label = document.createElement('label');
            label.style.cssText = 'display: flex; align-items: center; gap: 8px; color: var(--color-text); font-size: 13px; cursor: pointer;';
            label.appendChild(checkbox);
            label.appendChild(document.createTextNode(this._tt('Include Equipped')));
            container.appendChild(label);
        }

        return container;
    }

    createButtonControls() {
        const container = document.createElement('div');
        container.style.cssText = 'display: flex; flex-direction: column; gap: 8px;';
        container.appendChild(this._createSelect(this._tt('Button:'), [
            { value: 'ok', label: this._tt('OK') },
            { value: 'cancel', label: this._tt('Cancel') },
            { value: 'shift', label: this._tt('Shift') },
            { value: 'down', label: this._tt('Down') },
            { value: 'left', label: this._tt('Left') },
            { value: 'right', label: this._tt('Right') },
            { value: 'up', label: this._tt('Up') },
            { value: 'pageup', label: this._tt('Page Up') },
            { value: 'pagedown', label: this._tt('Page Down') }
        ], this.buttonName, value => { this.buttonName = value; }));
        container.appendChild(this._createSelect(this._tt('Button Mode:'), [
            { value: 0, label: this._tt('Pressed') },
            { value: 1, label: this._tt('Triggered') },
            { value: 2, label: this._tt('Repeated') }
        ], this.buttonMode, value => { this.buttonMode = parseInt(value, 10); }));
        return container;
    }

    _logicalButtonOptions() {
        return [
            { value: 'ok', label: this._tt('OK') },
            { value: 'cancel', label: this._tt('Cancel') },
            { value: 'shift', label: this._tt('Shift') },
            { value: 'down', label: this._tt('Down') },
            { value: 'left', label: this._tt('Left') },
            { value: 'right', label: this._tt('Right') },
            { value: 'up', label: this._tt('Up') },
            { value: 'pageup', label: this._tt('Page Up') },
            { value: 'pagedown', label: this._tt('Page Down') }
        ];
    }

    createExtendedKeyboardControls() {
        const container = document.createElement('div');
        container.style.cssText = 'display: flex; flex-direction: column; gap: 8px;';
        container.appendChild(this._createSelect(this._tt('Button:'), this._logicalButtonOptions(),
            this.extendedButtonName, value => { this.extendedButtonName = value; }));
        container.appendChild(this._createSelect(this._tt('Button Mode:'), [
            { value: 'released', label: this._tt('Released') },
            { value: 'held', label: this._tt('Held') }
        ], this.extendedButtonMode, value => { this.extendedButtonMode = value; }));
        return container;
    }

    createMouseButtonControls() {
        const container = document.createElement('div');
        container.style.cssText = 'display: flex; flex-direction: column; gap: 8px;';
        container.appendChild(this._createSelect(this._tt('Mouse Button:'), [
            { value: 0, label: this._tt('Left') },
            { value: 1, label: this._tt('Middle') },
            { value: 2, label: this._tt('Right') }
        ], this.mouseButton, value => { this.mouseButton = parseInt(value, 10); }));
        container.appendChild(this._createSelect(this._tt('Button Mode:'), [
            { value: 'pressed', label: this._tt('Pressed') },
            { value: 'triggered', label: this._tt('Triggered') },
            { value: 'released', label: this._tt('Released') },
            { value: 'held', label: this._tt('Held') }
        ], this.mouseButtonMode, value => { this.mouseButtonMode = value; }));
        return container;
    }

    createMouseWheelControls() {
        const container = document.createElement('div');
        container.appendChild(this._createSelect(this._tt('Direction:'), [
            { value: 'up', label: this._tt('Up') },
            { value: 'down', label: this._tt('Down') },
            { value: 'left', label: this._tt('Left') },
            { value: 'right', label: this._tt('Right') }
        ], this.wheelDirection, value => { this.wheelDirection = value; }));
        return container;
    }

    createPointerPositionControls() {
        const container = document.createElement('div');
        container.style.cssText = 'display: flex; flex-direction: column; gap: 8px;';
        container.appendChild(this._createSelect(this._tt('Axis:'), [
            { value: 'x', label: 'X' },
            { value: 'y', label: 'Y' }
        ], this.pointerAxis, value => { this.pointerAxis = value; }));
        container.appendChild(this._createSelect(this._tt('Comparison:'), [
            { value: '==', label: '==' },
            { value: '!=', label: '!=' },
            { value: '>=', label: '>=' },
            { value: '<=', label: '<=' },
            { value: '>', label: '>' },
            { value: '<', label: '<' }
        ], this.pointerComparison, value => { this.pointerComparison = value; }));
        container.appendChild(this._createSelect(this._tt('Value Type:'), [
            { value: 'constant', label: this._tt('Constant') },
            { value: 'variable', label: this._tt('Variable') }
        ], this.pointerValueType, value => {
            this.pointerValueType = value;
            this.renderContent();
        }));
        const valueRow = this._createNumberRow(
            this.pointerValueType === 'variable' ? this._tt('Variable:') : this._tt('Value:'),
            this.pointerValue, value => { this.pointerValue = value; },
            this.pointerValueType === 'variable' ? 1 : null
        );
        if (this.pointerValueType === 'variable') {
            const browseButton = document.createElement('button');
            browseButton.textContent = '...';
            browseButton.className = 'rr-btn-browse';
            browseButton.addEventListener('click', () => this.browseVariables('pointerValue'));
            valueRow.appendChild(browseButton);
        }
        container.appendChild(valueRow);
        return container;
    }

    createVehicleControls() {
        const container = document.createElement('div');
        container.appendChild(this._createSelect(this._tt('Vehicle:'), [
            { value: 0, label: this._tt('Boat') },
            { value: 1, label: this._tt('Ship') },
            { value: 2, label: this._tt('Airship') }
        ], this.vehicleType, value => { this.vehicleType = parseInt(value, 10); }));
        return container;
    }

    createScriptControls() {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        const container = document.createElement('div');
        container.style.cssText = 'display: flex; flex-direction: column; gap: 8px;';

        const label = document.createElement('div');
        label.textContent = tt('Script:');
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

    browseVariables(target = 'variableId') {
        const picker = new SwitchVariablePicker(this.databaseManager, this.projectController);
        picker.show('variable', this[target], (selectedId) => {
            if (selectedId) {
                this[target] = selectedId;
                this.renderContent();
            }
        });
    }

    buildCommands() {
        const commands = [];
        let parameters;

        if (this.originalParameters && this.originalParameters.length > 0 &&
            JSON.stringify(this.conditionState()) === JSON.stringify(this.originalState)) {
            parameters = this.originalParameters.slice();
        } else {
            parameters = this.buildParameters();
        }

        // Conditional Branch command
        commands.push({
            code: 111,
            indent: 0,
            parameters: parameters
        });

        // Else branch. The 411 marker sits at the SAME indent as the 111
        // header (MZ format): at indent 1 the runtime's skipBranch never
        // swallowed it, so the Else body ran even when the condition was
        // true.
        if (this.createElse) {
            commands.push({
                code: 411,
                indent: 0,
                parameters: []
            });
        }

        // End
        commands.push({
            code: 412,
            indent: 0,
            parameters: []
        });

        return commands;
    }

    buildParameters() {
        let parameters;

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
            case 3: // Timer
                parameters = [this.conditionType, this.timerSeconds, this.timerComparison];
                break;
            case 4: // Actor
                parameters = [this.conditionType, this.actorId, this.actorCondition];
                if (this.actorCondition !== 0) parameters.push(this.actorValue);
                break;
            case 5: // Enemy
                parameters = [this.conditionType, this.enemyIndex, this.enemyCondition];
                if (this.enemyCondition === 1) parameters.push(this.enemyStateId);
                break;
            case 6: // Character
                parameters = [this.conditionType, this.characterId, this.characterDirection];
                break;
            case 7: // Gold
                parameters = [this.conditionType, this.goldAmount, this.goldComparison];
                break;
            case 8: // Item
                parameters = [this.conditionType, this.itemId];
                break;
            case 9: // Weapon
            case 10: // Armor
                parameters = [this.conditionType, this.itemId, !!this.includeEquipped];
                break;
            case 11: // Button
                parameters = [this.conditionType, this.buttonName, this.buttonMode];
                break;
            case 12: // Script
                parameters = [this.conditionType, this.scriptText];
                break;
            case 13: // Vehicle
                parameters = [this.conditionType, this.vehicleType];
                break;
            case 14: // Keyboard Extended
            case 15: // Mouse Button
            case 16: // Mouse Wheel
            case 17: // Pointer Position
                parameters = [12, this._buildAdvancedInputText()];
                break;
            default:
                parameters = [this.conditionType];
                break;
        }
        return parameters;
    }

    _parseAdvancedInput(text) {
        const codec = this._codec();
        if (!codec || typeof text !== 'string') return false;
        let parsed;
        try {
            parsed = codec.parseText(text, 'inputCondition');
        } catch (e) {
            return false;
        }
        const data = parsed && parsed.data;
        if (!this._isValidAdvancedInputData(data)) return false;
        if (parsed.body !== this._advancedInputExpression(data)) return false;

        if (data.type === 'keyboard') {
            this.conditionType = 14;
            this.extendedButtonName = data.button;
            this.extendedButtonMode = data.mode;
        } else if (data.type === 'mouse') {
            this.conditionType = 15;
            this.mouseButton = data.button;
            this.mouseButtonMode = data.mode;
        } else if (data.type === 'wheel') {
            this.conditionType = 16;
            this.wheelDirection = data.direction;
        } else {
            this.conditionType = 17;
            this.pointerAxis = data.axis;
            this.pointerComparison = data.comparison;
            this.pointerValueType = data.valueType;
            this.pointerValue = data.value;
        }
        return true;
    }

    _isValidAdvancedInputData(data) {
        if (!data) return false;
        const buttons = this._logicalButtonOptions().map(option => option.value);
        if (data.type === 'keyboard') {
            return buttons.includes(data.button) && ['released', 'held'].includes(data.mode);
        }
        if (data.type === 'mouse') {
            return [0, 1, 2].includes(data.button) &&
                ['pressed', 'triggered', 'released', 'held'].includes(data.mode);
        }
        if (data.type === 'wheel') {
            return ['up', 'down', 'left', 'right'].includes(data.direction);
        }
        if (data.type === 'pointer') {
            return ['x', 'y'].includes(data.axis) &&
                ['==', '!=', '>=', '<=', '>', '<'].includes(data.comparison) &&
                ['constant', 'variable'].includes(data.valueType) &&
                Number.isFinite(data.value) &&
                (data.valueType !== 'variable' || Number.isInteger(data.value) && data.value > 0);
        }
        return false;
    }

    _advancedInputData() {
        switch (this.conditionType) {
            case 14:
                return { type: 'keyboard', button: this.extendedButtonName,
                    mode: this.extendedButtonMode };
            case 15:
                return { type: 'mouse', button: this.mouseButton, mode: this.mouseButtonMode };
            case 16:
                return { type: 'wheel', direction: this.wheelDirection };
            case 17:
                return { type: 'pointer', axis: this.pointerAxis,
                    comparison: this.pointerComparison, valueType: this.pointerValueType,
                    value: this.pointerValue };
        }
        return null;
    }

    _buildAdvancedInputText() {
        const codec = this._codec();
        if (!codec) throw new Error('ReactorEventCommandCodec is unavailable');
        const data = this._advancedInputData();
        return codec.createText('inputCondition', data, this._advancedInputExpression(data));
    }

    _advancedInputExpression(data) {
        if (data.type === 'keyboard') {
            const method = data.mode === 'released' ? 'isReleased' : 'isLongPressed';
            return `(typeof Input.${method} === "function" && Input.${method}(${JSON.stringify(data.button)}))`;
        }
        if (data.type === 'mouse') {
            const methods = {
                pressed: 'isMouseButtonPressed',
                triggered: 'isMouseButtonTriggered',
                released: 'isMouseButtonReleased',
                held: 'isMouseButtonLongPressed'
            };
            const shortMethods = {
                pressed: 'isMousePressed',
                triggered: 'isMouseTriggered',
                released: 'isMouseReleased',
                held: 'isMouseLongPressed'
            };
            const stockFallbacks = {
                '0:pressed': 'TouchInput.isPressed()',
                '0:triggered': 'TouchInput.isTriggered()',
                '0:released': 'TouchInput.isReleased()',
                '0:held': 'TouchInput.isLongPressed()',
                '2:triggered': 'TouchInput.isCancelled()'
            };
            const method = methods[data.mode];
            const shortMethod = shortMethods[data.mode];
            const fallback = stockFallbacks[`${data.button}:${data.mode}`] || 'false';
            return `(typeof TouchInput.${method} === "function" ? ` +
                `TouchInput.${method}(${data.button}) : ` +
                `typeof TouchInput.${shortMethod} === "function" ? ` +
                `TouchInput.${shortMethod}(${data.button}) : ${fallback})`;
        }
        if (data.type === 'wheel') {
            const expressions = {
                up: 'TouchInput.wheelY < 0',
                down: 'TouchInput.wheelY > 0',
                left: 'TouchInput.wheelX < 0',
                right: 'TouchInput.wheelX > 0'
            };
            return expressions[data.direction];
        }
        const right = data.valueType === 'variable' ?
            `$gameVariables.value(${data.value})` : String(data.value);
        return `TouchInput.${data.axis} ${data.comparison} ${right}`;
    }

    _codec() {
        if (typeof globalThis !== 'undefined' && globalThis.ReactorEventCommandCodec) {
            return globalThis.ReactorEventCommandCodec;
        }
        if (typeof require === 'function') {
            try {
                return require('./ReactorEventCommandCodec.js');
            } catch (e) {
                return null;
            }
        }
        return null;
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
