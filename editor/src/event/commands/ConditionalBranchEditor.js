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

        this._troop = options.troop || null;
        this.activeTab = this._tabFor(this.conditionType);

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

    /**
     * RPG Maker's Conditional Branch layout: four numbered tabs of
     * radio-selected conditions with every control on screen and only the
     * chosen condition's controls enabled. A fifth tab holds the Reactor-only
     * input conditions (keyboard/mouse/wheel/pointer), which still serialize
     * as a Script condition the runtime and RPG Maker both accept.
     */
    static get TABS() {
        return [
            { label: '1', types: [0, 1, 2, 3] },
            { label: '2', types: [4] },
            { label: '3', types: [5, 6, 13] },
            { label: '4', types: [7, 8, 9, 10, 11, 12] },
            { label: 'Reactor', types: [14, 15, 16, 17] }
        ];
    }

    _tabFor(type) {
        const index = ConditionalBranchEditor.TABS.findIndex(tab => tab.types.includes(type));
        return index < 0 ? 0 : index;
    }

    createModal() {
        this.modal = document.createElement('div');
        this.modal.className = 'conditional-branch-editor-modal rr-modal-overlay rr-event-command-modal';
        this.modal.style.display = 'none';

        const container = document.createElement('div');
        container.className = 'conditional-branch-container rr-modal rr-event-command-dialog rr-conditional-branch-dialog';
        this.modal.appendChild(container);

        this.modal.addEventListener('click', (e) => {
            // A click on the backdrop no longer closes the dialog: an accidental
            // click beside it must never cost in-progress work. Close deliberately.
        });

        document.body.appendChild(this.modal);
    }

    renderContent() {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        const container = this.modal.querySelector('.conditional-branch-container');
        container.innerHTML = '';
        if (!this._scope) {
            ConditionalBranchEditor._instances = (ConditionalBranchEditor._instances || 0) + 1;
            this._scope = `rr-cb-${ConditionalBranchEditor._instances}`;
        }
        if (this.activeTab == null) this.activeTab = this._tabFor(this.conditionType);

        // Header
        const header = document.createElement('div');
        header.className = 'rr-modal-header';
        const title = document.createElement('div');
        title.className = 'rr-modal-title';
        title.textContent = tt('Conditional Branch');
        const closeButton = document.createElement('button');
        closeButton.className = 'rr-modal-close close-btn';
        closeButton.type = 'button';
        closeButton.setAttribute('aria-label', tt('Close'));
        closeButton.textContent = '×';
        closeButton.addEventListener('click', () => this.close());
        header.appendChild(title);
        header.appendChild(closeButton);
        container.appendChild(header);

        // Body: tab strip + the active page
        const content = document.createElement('div');
        content.className = 'rr-modal-body rr-cb-body';

        const tabs = document.createElement('div');
        tabs.className = 'rr-cb-tabs';
        tabs.setAttribute('role', 'tablist');
        ConditionalBranchEditor.TABS.forEach((tab, index) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'rr-cb-tab' + (index === this.activeTab ? ' is-active' : '');
            button.setAttribute('role', 'tab');
            button.setAttribute('aria-selected', index === this.activeTab ? 'true' : 'false');
            button.textContent = tab.label === 'Reactor' ? tt('Reactor') : tab.label;
            if (tab.types.includes(this.conditionType)) button.classList.add('has-condition');
            button.addEventListener('click', () => {
                this.activeTab = index;
                this.renderContent();
            });
            tabs.appendChild(button);
        });
        content.appendChild(tabs);

        const page = document.createElement('div');
        page.className = 'rr-cb-page';
        page.setAttribute('role', 'tabpanel');
        const builders = [
            () => this.createPageOne(page),
            () => this.createPageTwo(page),
            () => this.createPageThree(page),
            () => this.createPageFour(page),
            () => this.createPageReactor(page)
        ];
        builders[this.activeTab]();
        content.appendChild(page);
        container.appendChild(content);

        // Footer
        const footer = document.createElement('div');
        footer.className = 'rr-modal-footer';

        const elseLabel = document.createElement('label');
        elseLabel.className = 'rr-cb-else';
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
        okBtn.className = 'rr-button-primary';
        okBtn.addEventListener('click', () => this.save());

        footer.appendChild(cancelBtn);
        footer.appendChild(okBtn);
        container.appendChild(footer);
    }

    // ---- Row and control helpers -------------------------------------------

    _selectType(type) {
        this.conditionType = type;
        this.renderContent();
    }

    /**
     * A condition row: radio, label, controls. The controls are live only
     * while this row's condition is the chosen one.
     */
    _conditionRow(type, labelText, controls) {
        const active = this.conditionType === type;
        const row = document.createElement('div');
        row.className = 'rr-cb-row' + (active ? '' : ' is-off');
        const radio = document.createElement('input');
        radio.type = 'radio';
        radio.name = `${this._scope}-type`;
        radio.id = `${this._scope}-type-${type}`;
        radio.checked = active;
        radio.addEventListener('change', () => this._selectType(type));
        const label = document.createElement('label');
        label.htmlFor = radio.id;
        label.textContent = labelText;
        row.appendChild(radio);
        row.appendChild(label);
        row.appendChild(this._controls(controls, !active));
        return row;
    }

    /**
     * An indented choice under a condition row (Constant / Variable, an
     * actor's sub-condition). Its radio is live while the parent condition
     * is chosen; its controls only while it is the chosen choice too.
     */
    _choiceRow(parentType, checked, labelText, onSelect, controls) {
        const parentActive = this.conditionType === parentType;
        const active = parentActive && checked;
        const row = document.createElement('div');
        row.className = 'rr-cb-row is-sub' + (active ? '' : ' is-off');
        const radio = document.createElement('input');
        radio.type = 'radio';
        radio.name = `${this._scope}-choice-${parentType}`;
        radio.id = `${this._scope}-choice-${parentType}-${labelText.replace(/\W+/g, '')}`;
        radio.checked = checked;
        radio.disabled = !parentActive;
        radio.addEventListener('change', () => {
            onSelect();
            this.renderContent();
        });
        const label = document.createElement('label');
        label.htmlFor = radio.id;
        label.textContent = labelText;
        row.appendChild(radio);
        row.appendChild(label);
        row.appendChild(this._controls(controls, !active));
        return row;
    }

    /** An indented checkbox under a condition row (Include Equipment). */
    _checkRow(parentType, checked, labelText, onChange) {
        const active = this.conditionType === parentType;
        const row = document.createElement('div');
        row.className = 'rr-cb-row is-sub is-check' + (active ? '' : ' is-off');
        const spacer = document.createElement('span');
        const box = document.createElement('input');
        box.type = 'checkbox';
        box.id = `${this._scope}-check-${parentType}`;
        box.checked = checked;
        box.disabled = !active;
        box.addEventListener('change', e => onChange(e.target.checked));
        const label = document.createElement('label');
        label.htmlFor = box.id;
        label.textContent = labelText;
        row.appendChild(spacer);
        row.appendChild(box);
        row.appendChild(label);
        return row;
    }

    _controls(controls, disabled) {
        const box = document.createElement('div');
        box.className = 'rr-cb-controls';
        for (const control of controls || []) {
            if (!control) continue;
            if (disabled && 'disabled' in control) control.disabled = true;
            box.appendChild(control);
        }
        return box;
    }

    _word(text) {
        const span = document.createElement('span');
        span.className = 'rr-cb-word';
        span.textContent = text;
        return span;
    }

    _select(options, value, onChange, narrow = false) {
        const select = document.createElement('select');
        if (narrow) select.classList.add('is-narrow');
        let hasCurrent = false;
        for (const optionData of options) {
            const option = document.createElement('option');
            option.value = String(optionData.value);
            option.textContent = optionData.label;
            select.appendChild(option);
            if (String(optionData.value) === String(value)) hasCurrent = true;
        }
        if (!hasCurrent && value != null) {
            const option = document.createElement('option');
            option.value = String(value);
            option.textContent = String(value);
            select.appendChild(option);
        }
        select.value = String(value);
        select.addEventListener('change', e => onChange(e.target.value));
        return select;
    }

    _number(value, onChange, { min = null, max = null, narrow = false } = {}) {
        const input = document.createElement('input');
        input.type = 'number';
        if (narrow) input.classList.add('is-narrow');
        if (min !== null) input.min = min;
        if (max !== null) input.max = max;
        input.value = value;
        input.addEventListener('input', e => {
            const parsed = parseInt(e.target.value, 10);
            if (!Number.isNaN(parsed)) onChange(parsed);
        });
        return input;
    }

    _text(value, onChange) {
        const input = document.createElement('input');
        input.type = 'text';
        input.value = value;
        input.addEventListener('input', e => onChange(e.target.value));
        return input;
    }

    _entryLabel(id, name, fallback) {
        return `${String(id).padStart(4, '0')} ${name || fallback}`;
    }

    _systemNames(kind) {
        try {
            const system = this.databaseManager && typeof this.databaseManager.getSystem === 'function'
                ? this.databaseManager.getSystem() || {} : {};
            const names = kind === 'switch' ? system.switches : system.variables;
            return Array.isArray(names) ? names : [];
        } catch (e) {
            return [];
        }
    }

    /** The "0001 Name ..." button that opens the switch/variable picker. */
    _reference(kind, id, onPick) {
        const names = this._systemNames(kind);
        const name = typeof names[id] === 'string' ? names[id].trim() : '';
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'rr-variable-reference';
        const label = document.createElement('span');
        label.className = 'rr-variable-reference-label';
        label.textContent = this._entryLabel(id, name,
            `${kind === 'switch' ? this._tt('Switch') : this._tt('Variable')} ${id}`);
        const more = document.createElement('span');
        more.textContent = '...';
        button.appendChild(label);
        button.appendChild(more);
        button.addEventListener('click', () => {
            const picker = new SwitchVariablePicker(this.databaseManager, this.projectController);
            picker.show(kind, id, selectedId => {
                if (selectedId) {
                    onPick(selectedId);
                    this.renderContent();
                }
            });
        });
        return button;
    }

    _databaseEntries(getterName) {
        try {
            const getter = this.databaseManager && this.databaseManager[getterName];
            return typeof getter === 'function' ? getter.call(this.databaseManager) || [] : [];
        } catch (e) {
            return [];
        }
    }

    _databaseSelect(getterName, value, onChange) {
        const options = [];
        let hasCurrent = false;
        for (const entry of this._databaseEntries(getterName)) {
            if (!entry || entry.id == null) continue;
            options.push({ value: entry.id, label: this._entryLabel(entry.id, entry.name, this._tt('Unnamed')) });
            if (entry.id === value) hasCurrent = true;
        }
        if (!hasCurrent) {
            options.push({ value, label: this._entryLabel(value, '', this._tt('Missing')) });
        }
        return this._select(options, value, v => onChange(parseInt(v, 10)));
    }

    _onOffSelect(value, onChange) {
        return this._select([
            { value: 0, label: this._tt('ON') },
            { value: 1, label: this._tt('OFF') }
        ], value, v => onChange(parseInt(v, 10)), true);
    }

    // ---- Tab 1: Switch, Variable, Self Switch, Timer -----------------------

    createPageOne(page) {
        page.appendChild(this._conditionRow(0, this._tt('Switch'), [
            this._reference('switch', this.switchId, id => { this.switchId = id; }),
            this._word(this._tt('is')),
            this._onOffSelect(this.switchValue, v => { this.switchValue = v; })
        ]));

        page.appendChild(this._conditionRow(1, this._tt('Variable'), [
            this._reference('variable', this.variableId, id => { this.variableId = id; }),
            this._select([
                { value: 0, label: '=' },
                { value: 1, label: '≥' },
                { value: 2, label: '≤' },
                { value: 3, label: '>' },
                { value: 4, label: '<' },
                { value: 5, label: '≠' }
            ], this.variableComparison, v => { this.variableComparison = parseInt(v, 10); }, true)
        ]));
        page.appendChild(this._choiceRow(1, this.variableValueType === 0, this._tt('Constant'),
            () => { this.variableValueType = 0; }, [
                this._number(this.variableValue, v => { this.variableValue = v; })
            ]));
        page.appendChild(this._choiceRow(1, this.variableValueType === 1, this._tt('Variable'),
            () => { this.variableValueType = 1; if (!(this.variableValue >= 1)) this.variableValue = 1; }, [
                this._reference('variable', Math.max(1, this.variableValue), id => { this.variableValue = id; })
            ]));

        page.appendChild(this._conditionRow(2, this._tt('Self Switch'), [
            this._select(['A', 'B', 'C', 'D'].map(ch => ({ value: ch, label: ch })),
                this.selfSwitchCh, v => { this.selfSwitchCh = v; }, true),
            this._word(this._tt('is')),
            this._onOffSelect(this.selfSwitchValue, v => { this.selfSwitchValue = v; })
        ]));

        const minutes = Math.floor(this.timerSeconds / 60);
        const seconds = this.timerSeconds % 60;
        const setTimer = (m, s) => { this.timerSeconds = Math.max(0, m) * 60 + Math.min(59, Math.max(0, s)); };
        let currentMinutes = minutes;
        let currentSeconds = seconds;
        page.appendChild(this._conditionRow(3, this._tt('Timer'), [
            this._select([
                { value: 0, label: '≥' },
                { value: 1, label: '≤' }
            ], this.timerComparison, v => { this.timerComparison = parseInt(v, 10); }, true),
            this._number(minutes, v => { currentMinutes = v; setTimer(currentMinutes, currentSeconds); }, { min: 0, max: 99 }),
            this._word(this._tt('min')),
            this._number(seconds, v => { currentSeconds = v; setTimer(currentMinutes, currentSeconds); }, { min: 0, max: 59 }),
            this._word(this._tt('sec'))
        ]));
    }

    // ---- Tab 2: Actor ------------------------------------------------------

    createPageTwo(page) {
        page.appendChild(this._conditionRow(4, this._tt('Actor'), [
            this._databaseSelect('getActors', this.actorId, v => { this.actorId = v; })
        ]));
        const choose = (condition) => () => {
            this.actorCondition = condition;
            if (condition === 1) {
                if (typeof this.actorValue !== 'string') this.actorValue = '';
            } else if (condition >= 2) {
                if (!(Number.isInteger(this.actorValue) && this.actorValue >= 1)) this.actorValue = 1;
            }
        };
        const choice = (condition, labelText, controls) =>
            this._choiceRow(4, this.actorCondition === condition, labelText, choose(condition), controls);
        const entry = getter => this.actorCondition >= 2 && typeof this.actorValue === 'number' ? this.actorValue : 1;

        page.appendChild(choice(0, this._tt('Is in the party'), []));
        page.appendChild(choice(1, this._tt('Name'), [
            this._text(typeof this.actorValue === 'string' ? this.actorValue : '', v => { this.actorValue = v; })
        ]));
        page.appendChild(choice(2, this._tt('Class'), [
            this._databaseSelect('getClasses', this.actorCondition === 2 ? entry() : 1, v => { this.actorValue = v; })
        ]));
        page.appendChild(choice(3, this._tt('Skill'), [
            this._databaseSelect('getSkills', this.actorCondition === 3 ? entry() : 1, v => { this.actorValue = v; })
        ]));
        page.appendChild(choice(4, this._tt('Weapon'), [
            this._databaseSelect('getWeapons', this.actorCondition === 4 ? entry() : 1, v => { this.actorValue = v; })
        ]));
        page.appendChild(choice(5, this._tt('Armor'), [
            this._databaseSelect('getArmors', this.actorCondition === 5 ? entry() : 1, v => { this.actorValue = v; })
        ]));
        page.appendChild(choice(6, this._tt('State'), [
            this._databaseSelect('getStates', this.actorCondition === 6 ? entry() : 1, v => { this.actorValue = v; })
        ]));
    }

    // ---- Tab 3: Enemy, Character, Vehicle ----------------------------------

    // Naming a troop slot is now shared with every battle command dialog, which
    // used to print a bare "#3" where this one already printed "#3 Goblin".
    // RREnemySlotOptions is that one implementation; this keeps the name it is
    // called by here.
    _troopMemberOptions() {
        return RREnemySlotOptions.list({ troop: this._troop }, this.databaseManager);
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

    _characterOptions() {
        const options = [
            { value: -1, label: this._tt('Player') },
            { value: 0, label: this._tt('This Event') }
        ];
        let hasCurrent = this.characterId <= 0;
        this._currentMapEvents().forEach((event, index) => {
            if (!event) return;
            const id = event.id ?? index;
            if (id <= 0) return;
            options.push({ value: id, label: `EV${String(id).padStart(3, '0')} ${event.name || ''}`.trim() });
            if (id === this.characterId) hasCurrent = true;
        });
        if (!hasCurrent) {
            options.push({ value: this.characterId, label: `EV${String(this.characterId).padStart(3, '0')} ${this._tt('Missing')}` });
        }
        return options;
    }

    createPageThree(page) {
        page.appendChild(this._conditionRow(5, this._tt('Enemy'), [
            this._select(this._troopMemberOptions(), this.enemyIndex, v => { this.enemyIndex = parseInt(v, 10); })
        ]));
        page.appendChild(this._choiceRow(5, this.enemyCondition === 0, this._tt('Appeared'),
            () => { this.enemyCondition = 0; }, []));
        page.appendChild(this._choiceRow(5, this.enemyCondition === 1, this._tt('State'),
            () => { this.enemyCondition = 1; }, [
                this._databaseSelect('getStates', this.enemyStateId, v => { this.enemyStateId = v; })
            ]));

        page.appendChild(this._conditionRow(6, this._tt('Character'), [
            this._select(this._characterOptions(), this.characterId, v => { this.characterId = parseInt(v, 10); })
        ]));
        const facing = document.createElement('div');
        facing.className = 'rr-cb-row is-sub is-plain' + (this.conditionType === 6 ? '' : ' is-off');
        facing.appendChild(document.createElement('span'));
        const facingLabel = document.createElement('span');
        facingLabel.className = 'rr-cb-word';
        facingLabel.textContent = this._tt('is facing');
        facing.appendChild(facingLabel);
        facing.appendChild(this._controls([
            this._select([
                { value: 2, label: this._tt('Down') },
                { value: 4, label: this._tt('Left') },
                { value: 6, label: this._tt('Right') },
                { value: 8, label: this._tt('Up') }
            ], this.characterDirection, v => { this.characterDirection = parseInt(v, 10); }, true)
        ], this.conditionType !== 6));
        page.appendChild(facing);

        page.appendChild(this._conditionRow(13, this._tt('Vehicle'), [
            this._select([
                { value: 0, label: this._tt('Boat') },
                { value: 1, label: this._tt('Ship') },
                { value: 2, label: this._tt('Airship') }
            ], this.vehicleType, v => { this.vehicleType = parseInt(v, 10); }, true),
            this._word(this._tt('is being driven'))
        ]));
    }

    // ---- Tab 4: Gold, Item, Weapon, Armor, Button, Script ------------------

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

    createPageFour(page) {
        page.appendChild(this._conditionRow(7, this._tt('Gold'), [
            this._select([
                { value: 0, label: '≥' },
                { value: 1, label: '≤' },
                { value: 2, label: '<' }
            ], this.goldComparison, v => { this.goldComparison = parseInt(v, 10); }, true),
            this._number(this.goldAmount, v => { this.goldAmount = v; }, { min: 0 })
        ]));

        const itemId = type => this.conditionType === type ? this.itemId : 1;
        page.appendChild(this._conditionRow(8, this._tt('Item'), [
            this._databaseSelect('getItems', itemId(8), v => { this.itemId = v; })
        ]));
        page.appendChild(this._conditionRow(9, this._tt('Weapon'), [
            this._databaseSelect('getWeapons', itemId(9), v => { this.itemId = v; })
        ]));
        page.appendChild(this._checkRow(9, this.includeEquipped, this._tt('Include Equipment'),
            v => { this.includeEquipped = v; }));
        page.appendChild(this._conditionRow(10, this._tt('Armor'), [
            this._databaseSelect('getArmors', itemId(10), v => { this.itemId = v; })
        ]));
        page.appendChild(this._checkRow(10, this.includeEquipped, this._tt('Include Equipment'),
            v => { this.includeEquipped = v; }));

        page.appendChild(this._conditionRow(11, this._tt('Button'), [
            this._select(this._logicalButtonOptions(), this.buttonName, v => { this.buttonName = v; }),
            this._word(this._tt('is')),
            this._select([
                { value: 0, label: this._tt('Pressed') },
                { value: 1, label: this._tt('Triggered') },
                { value: 2, label: this._tt('Repeated') }
            ], this.buttonMode, v => { this.buttonMode = parseInt(v, 10); })
        ]));

        const script = document.createElement('textarea');
        script.className = 'rr-cb-script';
        script.rows = 1;
        script.spellcheck = false;
        script.value = this.scriptText;
        script.addEventListener('input', e => { this.scriptText = e.target.value; });
        page.appendChild(this._conditionRow(12, this._tt('Script'), [script]));
    }

    // ---- Tab Reactor: Keyboard, Mouse Button, Mouse Wheel, Pointer ---------

    createPageReactor(page) {
        page.appendChild(this._conditionRow(14, this._tt('Keyboard'), [
            this._select(this._logicalButtonOptions(), this.extendedButtonName, v => { this.extendedButtonName = v; }),
            this._word(this._tt('is')),
            this._select([
                { value: 'released', label: this._tt('Released') },
                { value: 'held', label: this._tt('Held') }
            ], this.extendedButtonMode, v => { this.extendedButtonMode = v; })
        ]));

        page.appendChild(this._conditionRow(15, this._tt('Mouse Button'), [
            this._select([
                { value: 0, label: this._tt('Left') },
                { value: 1, label: this._tt('Middle') },
                { value: 2, label: this._tt('Right') }
            ], this.mouseButton, v => { this.mouseButton = parseInt(v, 10); }),
            this._word(this._tt('is')),
            this._select([
                { value: 'pressed', label: this._tt('Pressed') },
                { value: 'triggered', label: this._tt('Triggered') },
                { value: 'released', label: this._tt('Released') },
                { value: 'held', label: this._tt('Held') }
            ], this.mouseButtonMode, v => { this.mouseButtonMode = v; })
        ]));

        page.appendChild(this._conditionRow(16, this._tt('Mouse Wheel'), [
            this._select([
                { value: 'up', label: this._tt('Up') },
                { value: 'down', label: this._tt('Down') },
                { value: 'left', label: this._tt('Left') },
                { value: 'right', label: this._tt('Right') }
            ], this.wheelDirection, v => { this.wheelDirection = v; })
        ]));

        page.appendChild(this._conditionRow(17, this._tt('Pointer'), [
            this._select([
                { value: 'x', label: 'X' },
                { value: 'y', label: 'Y' }
            ], this.pointerAxis, v => { this.pointerAxis = v; }, true),
            this._select(['==', '!=', '>=', '<=', '>', '<'].map(op => ({ value: op, label: op })),
                this.pointerComparison, v => { this.pointerComparison = v; }, true)
        ]));
        page.appendChild(this._choiceRow(17, this.pointerValueType === 'constant', this._tt('Constant'),
            () => { this.pointerValueType = 'constant'; }, [
                this._number(this.pointerValue, v => { this.pointerValue = v; })
            ]));
        page.appendChild(this._choiceRow(17, this.pointerValueType === 'variable', this._tt('Variable'),
            () => { this.pointerValueType = 'variable'; if (!(this.pointerValue >= 1)) this.pointerValue = 1; }, [
                this._reference('variable', Math.max(1, this.pointerValue), id => { this.pointerValue = id; })
            ]));
    }

    _tt(text) {
        return typeof window !== 'undefined' && window.I18n ? window.I18n.tText(text) : text;
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
