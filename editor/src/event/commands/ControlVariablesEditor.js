/**
 * ControlVariablesEditor - Editor for Control Variables event command (code 122)
 *
 * Parameter layout (matches MZ Game_Interpreter.command122):
 *   params[0] startId
 *   params[1] endId
 *   params[2] operationType (0=Set, 1=Add, 2=Sub, 3=Mul, 4=Div, 5=Mod)
 *   params[3] operand       (0=Constant, 1=Variable, 2=Random, 3=Game Data, 4=Script, 5=Advanced Math)
 *   params[4] value         (constant | varId | random min | game-data type | script string)
 *   params[5] param1        (random max | game-data param1)
 *   params[6] param2        (game-data param2)
 */
class ControlVariablesEditor {
    constructor(databaseManager, projectController) {
        this.databaseManager = databaseManager;
        this.projectController = projectController;
        ControlVariablesEditor.nextInputScope = (ControlVariablesEditor.nextInputScope || 0) + 1;
        this.inputScope = `control-variables-${ControlVariablesEditor.nextInputScope}`;
        this.modal = null;
        this.callback = null;
        this.resetToDefaults();
    }

    show(command, callback) {
        this.callback = callback;
        this.previouslyFocused = document.activeElement;

        this.loadCommand(command);

        if (!this.modal) {
            this.createModal();
        }

        this.renderContent();
        this.modal.style.display = 'flex';
        setTimeout(() => {
            const target = this.modal && (
                this.modal.querySelector('input:checked') ||
                this.modal.querySelector('button, input, select')
            );
            if (target) target.focus();
        }, 0);
    }

    loadCommand(command) {
        if (command && command.code === 122) {
            const params = command.parameters;
            this.startId = params[0] || 1;
            this.endId = params[1] || 1;
            this.operationType = params[2] || 0;
            const advanced = ControlVariablesEditor.parseAdvancedExpressionCommand(command);
            this.operand = advanced ? 5 : (params[3] || 0);
            this.value = params[4] !== undefined ? params[4] : 0;
            this.param1 = params[5] !== undefined ? params[5] : 0;
            this.param2 = params[6] !== undefined ? params[6] : 0;
            this.advancedExpression = advanced || ControlVariablesEditor.defaultAdvancedExpression();
            this.scriptValue = !advanced && this.operand === 4 && typeof this.value === 'string'
                ? this.value
                : '';
            this.singleVariable = (this.startId === this.endId);
            return true;
        } else {
            this.resetToDefaults();
            return false;
        }
    }

    resetToDefaults() {
        this.startId = 1;
        this.endId = 1;
        this.operationType = 0;
        this.operand = 0;
        this.value = 0;
        this.param1 = 0;
        this.param2 = 0;
        this.advancedExpression = ControlVariablesEditor.defaultAdvancedExpression();
        this.scriptValue = '';
        this.singleVariable = true;
    }

    /** Reset operand value/param1/param2 to sensible defaults for the current operand type */
    resetOperandValues() {
        switch (this.operand) {
            case 0: // Constant
                this.value = 0;
                break;
            case 1: // Variable
                this.value = (typeof this.value === 'number' && this.value >= 1) ? this.value : 1;
                break;
            case 2: // Random
                this.value = 0;
                this.param1 = 1;
                break;
            case 3: // Game Data
                this.value = 0;   // type: 0 = Item
                this.param1 = 1;  // id/index
                this.param2 = 0;  // sub-param
                break;
            case 4: // Script
                this.value = this.scriptValue;
                break;
            case 5: // Advanced Expression
                break;
        }
    }

    static gameDataTypes() {
        return [
            { value: 0, label: 'Item' },
            { value: 1, label: 'Weapon' },
            { value: 2, label: 'Armor' },
            { value: 3, label: 'Actor' },
            { value: 4, label: 'Enemy' },
            { value: 5, label: 'Character' },
            { value: 6, label: 'Party' },
            { value: 7, label: 'Other' },
            { value: 8, label: 'Last Action Data' }
        ];
    }

    static actorGameDataParameters() {
        return ['Level', 'EXP', 'HP', 'MP', 'Max HP', 'Max MP', 'Attack', 'Defense',
            'M.Attack', 'M.Defense', 'Agility', 'Luck', 'TP'];
    }

    static enemyGameDataParameters() {
        return ['HP', 'MP', 'Max HP', 'Max MP', 'Attack', 'Defense', 'M.Attack',
            'M.Defense', 'Agility', 'Luck', 'TP'];
    }

    static lastActionGameDataParameters() {
        return ['Last Used Skill ID', 'Last Used Item ID', 'Last Actor ID to Act',
            'Last Enemy Index to Act', 'Last Target Actor ID', 'Last Target Enemy Index'];
    }

    static characterGameDataParameters() {
        return ['Map X', 'Map Y', 'Direction', 'Screen X', 'Screen Y'];
    }

    static otherGameDataParameters() {
        return ['Map ID', 'Party Size', 'Gold', 'Steps', 'Play Time', 'Timer',
            'Save Count', 'Battle Count', 'Win Count', 'Escape Count'];
    }

    createModal() {
        this.modal = document.createElement('div');
        this.modal.className = 'control-variables-editor-modal rr-modal-overlay rr-event-command-modal';
        this.modal.style.display = 'none';
        this.modal.setAttribute('role', 'dialog');
        this.modal.setAttribute('aria-modal', 'true');
        this.modal.setAttribute('aria-labelledby', `${this.inputScope}-title`);

        const container = document.createElement('div');
        container.className = 'control-variables-container rr-modal rr-event-command-dialog';

        this.modal.appendChild(container);

        this.modal.addEventListener('click', (e) => {
            if (e.target === this.modal) {
                this.close();
            }
        });
        this.modal.addEventListener('keydown', event => {
            if (event.key === 'Escape') this.close();
        });

        document.body.appendChild(this.modal);
    }

    renderContent() {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        const container = this.modal.querySelector('.control-variables-container');
        container.innerHTML = '';

        // Header
        const header = document.createElement('div');
        header.className = 'rr-modal-header';
        const title = document.createElement('div');
        title.className = 'rr-modal-title';
        title.id = `${this.inputScope}-title`;
        title.textContent = tt('Control Variables');
        const closeButton = document.createElement('button');
        closeButton.className = 'close-btn rr-modal-close';
        closeButton.setAttribute('aria-label', tt('Close'));
        closeButton.textContent = '×';
        header.appendChild(title);
        header.appendChild(closeButton);
        container.appendChild(header);
        closeButton.addEventListener('click', () => this.close());

        // Content (scroll body)
        const content = document.createElement('div');
        content.className = 'rr-modal-body';

        // Top row: Variable panel + Operation panel
        const topRow = document.createElement('div');
        topRow.className = 'rr-command-top-grid';
        topRow.appendChild(this.createVariablePanel());
        topRow.appendChild(this.createOperationPanel());
        content.appendChild(topRow);

        // Operand panel (full width)
        content.appendChild(this.createOperandPanel());

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

    // ------------------------------------------------------------------
    // Panels
    // ------------------------------------------------------------------

    _panelFrame(title) {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        const panel = document.createElement('div');
        panel.className = 'rr-command-card';
        const t = document.createElement('div');
        t.textContent = tt(title);
        t.className = 'rr-command-card-title';
        panel.appendChild(t);
        const body = document.createElement('div');
        body.className = 'rr-command-card-body';
        panel.appendChild(body);
        return panel;
    }

    createVariablePanel() {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        const panel = this._panelFrame('Variable');
        const body = panel.querySelector('.rr-command-card-body');
        const targetList = document.createElement('div');
        targetList.className = 'rr-command-target-list';

        const singleRadio = document.createElement('input');
        singleRadio.type = 'radio';
        singleRadio.name = `${this.inputScope}-mode`;
        singleRadio.id = `${this.inputScope}-single`;
        singleRadio.checked = this.singleVariable;
        singleRadio.addEventListener('change', () => {
            this.singleVariable = true;
            this.endId = this.startId;
            this.renderContent();
        });
        const singleRow = document.createElement('div');
        singleRow.className = 'rr-command-target-row';
        const singleLabel = document.createElement('label');
        singleLabel.htmlFor = singleRadio.id;
        singleLabel.textContent = tt('Single');
        singleRow.appendChild(singleRadio);
        singleRow.appendChild(singleLabel);
        singleRow.appendChild(this._variableReferenceControl(
            this.startId,
            !this.singleVariable,
            id => {
                this.startId = id;
                this.endId = id;
            }
        ));
        targetList.appendChild(singleRow);

        const batchRadio = document.createElement('input');
        batchRadio.type = 'radio';
        batchRadio.name = `${this.inputScope}-mode`;
        batchRadio.id = `${this.inputScope}-range`;
        batchRadio.checked = !this.singleVariable;
        batchRadio.addEventListener('change', () => {
            this.singleVariable = false;
            if (this.endId < this.startId) this.endId = this.startId;
            this.renderContent();
        });
        const rangeRow = document.createElement('div');
        rangeRow.className = 'rr-command-target-row';
        const batchLabel = document.createElement('label');
        batchLabel.htmlFor = batchRadio.id;
        batchLabel.textContent = tt('Range');
        rangeRow.appendChild(batchRadio);
        rangeRow.appendChild(batchLabel);
        rangeRow.appendChild(this._variableRangeControls(!this.singleVariable));
        targetList.appendChild(rangeRow);
        body.appendChild(targetList);

        return panel;
    }

    _variableReferenceControl(value, disabled, onChange) {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        const system = this.databaseManager && this.databaseManager.getSystem
            ? this.databaseManager.getSystem() || {}
            : {};
        const variableName = Array.isArray(system.variables) && typeof system.variables[value] === 'string'
            ? system.variables[value].trim()
            : '';
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'rr-variable-reference';
        button.disabled = disabled;
        const label = document.createElement('span');
        label.className = 'rr-variable-reference-label';
        label.textContent = `${String(value).padStart(4, '0')} ${variableName || `${tt('Variable')} ${value}`}`;
        const more = document.createElement('span');
        more.textContent = '...';
        button.appendChild(label);
        button.appendChild(more);
        button.addEventListener('click', () => {
            const picker = new SwitchVariablePicker(this.databaseManager, this.projectController);
            picker.show('variable', value, (selectedId) => {
                if (selectedId) {
                    onChange(selectedId);
                    this.renderContent();
                }
            });
        });
        return button;
    }

    _variableRangeControls(enabled) {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        const controls = document.createElement('div');
        controls.className = 'rr-command-range-controls';
        const start = document.createElement('input');
        start.type = 'number';
        start.min = 1;
        start.max = 9999;
        start.value = this.startId;
        start.disabled = !enabled;
        start.setAttribute('aria-label', `${tt('Variable')} 1`);
        start.addEventListener('input', event => {
            this.startId = Math.min(9999, Math.max(1, parseInt(event.target.value, 10) || 1));
            event.target.value = this.startId;
            if (this.endId < this.startId) {
                this.endId = this.startId;
                end.value = this.endId;
            }
        });
        const separator = document.createElement('span');
        separator.className = 'rr-command-range-separator';
        separator.textContent = '~';
        const end = document.createElement('input');
        end.type = 'number';
        end.min = 1;
        end.max = 9999;
        end.value = this.endId;
        end.disabled = !enabled;
        end.setAttribute('aria-label', `${tt('Variable')} 2`);
        end.addEventListener('input', event => {
            this.endId = Math.min(9999, Math.max(
                this.startId,
                parseInt(event.target.value, 10) || this.startId
            ));
            event.target.value = this.endId;
        });
        controls.appendChild(start);
        controls.appendChild(separator);
        controls.appendChild(end);
        return controls;
    }

    createOperationPanel() {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        const panel = this._panelFrame('Operation');
        const body = panel.querySelector('.rr-command-card-body');

        const operations = [
            { value: 0, label: tt('Set') },
            { value: 1, label: tt('Add') },
            { value: 2, label: tt('Subtract') },
            { value: 3, label: tt('Multiply') },
            { value: 4, label: tt('Divide') },
            { value: 5, label: tt('Remainder') },
        ];

        const grid = document.createElement('div');
        grid.className = 'rr-command-inline-options rr-variable-operations';

        operations.forEach(op => {
            const active = this.operationType === op.value;
            const radio = document.createElement('input');
            radio.type = 'radio';
            radio.name = `${this.inputScope}-operation`;
            radio.id = `${this.inputScope}-operation-${op.value}`;
            radio.checked = active;
            radio.addEventListener('change', () => {
                this.operationType = op.value;
            });
            const label = document.createElement('label');
            label.className = 'rr-command-inline-option';
            label.htmlFor = radio.id;
            label.appendChild(radio);
            label.appendChild(document.createTextNode(op.label));
            grid.appendChild(label);
        });

        body.appendChild(grid);
        return panel;
    }

    createOperandPanel() {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        const panel = this._panelFrame('Operand');
        const body = panel.querySelector('.rr-command-card-body');
        body.classList.add('rr-command-choice-list');

        const operands = [
            { value: 0, label: 'Constant' },
            { value: 1, label: 'Variable' },
            { value: 2, label: 'Random' },
            { value: 3, label: 'Game Data' },
            { value: 4, label: 'Script' },
            { value: 5, label: 'Advanced Math' },
        ];

        operands.forEach(opd => {
            const row = document.createElement('div');

            const radio = document.createElement('input');
            radio.type = 'radio';
            radio.name = `${this.inputScope}-operand`;
            radio.id = `${this.inputScope}-operand-${opd.value}`;
            radio.checked = this.operand === opd.value;
            radio.addEventListener('change', () => {
                if (this.operand === 4 && typeof this.value === 'string') {
                    this.scriptValue = this.value;
                }
                this.operand = opd.value;
                this.resetOperandValues();
                this.renderContent();
            });

            const active = this.operand === opd.value;
            row.className = `rr-command-choice-row${active ? ' is-active' : ''}`;
            const label = document.createElement('label');
            label.htmlFor = radio.id;
            label.textContent = tt(opd.label);

            const inputs = document.createElement('div');
            inputs.className = 'rr-command-control-group';
            this._populateOperandInputs(inputs, opd.value, !active);

            row.appendChild(radio);
            row.appendChild(label);
            row.appendChild(inputs);
            body.appendChild(row);
        });

        return panel;
    }

    _populateOperandInputs(container, opdType, disabled) {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;

        switch (opdType) {
            case 0: { // Constant
                const inp = document.createElement('input');
                inp.type = 'number';
                inp.value = (this.operand === 0 && typeof this.value === 'number') ? this.value : 0;
                inp.disabled = disabled;
                inp.addEventListener('input', (e) => { this.value = parseInt(e.target.value) || 0; });
                container.appendChild(inp);
                break;
            }
            case 1: { // Variable
                const inp = document.createElement('input');
                inp.type = 'number';
                inp.min = 1;
                inp.value = (this.operand === 1 && this.value >= 1) ? this.value : 1;
                inp.disabled = disabled;
                inp.addEventListener('input', (e) => { this.value = parseInt(e.target.value) || 1; });
                container.appendChild(inp);

                const browseBtn = document.createElement('button');
                browseBtn.textContent = '...';
                browseBtn.disabled = disabled;
                browseBtn.className = 'rr-btn-browse';
                browseBtn.setAttribute('aria-label', `${tt('Select')} ${tt('Variable')}`);
                browseBtn.addEventListener('click', () => {
                    if (disabled) return;
                    const picker = new SwitchVariablePicker(this.databaseManager, this.projectController);
                    picker.show('variable', this.value, (sid) => {
                        if (sid) { this.value = sid; this.renderContent(); }
                    });
                });
                container.appendChild(browseBtn);
                break;
            }
            case 2: { // Random
                const minInp = document.createElement('input');
                minInp.type = 'number';
                minInp.value = (this.operand === 2 && typeof this.value === 'number') ? this.value : 0;
                minInp.disabled = disabled;
                minInp.addEventListener('input', (e) => { this.value = parseInt(e.target.value) || 0; });
                const separator = document.createElement('span');
                separator.className = 'rr-command-range-separator';
                separator.textContent = '~';
                const maxInp = document.createElement('input');
                maxInp.type = 'number';
                maxInp.value = (this.operand === 2) ? (this.param1 || 0) : 0;
                maxInp.disabled = disabled;
                maxInp.addEventListener('input', (e) => { this.param1 = parseInt(e.target.value) || 0; });

                container.appendChild(minInp);
                container.appendChild(separator);
                container.appendChild(maxInp);
                break;
            }
            case 3: { // Game Data
                this._buildGameDataInputs(container, disabled);
                break;
            }
            case 4: { // Script
                const input = document.createElement('input');
                input.type = 'text';
                input.value = (this.operand === 4 && typeof this.value === 'string') ? this.value : '';
                input.disabled = disabled;
                input.placeholder = tt('Enter a JavaScript value...');
                input.className = 'rr-command-script-input';
                input.addEventListener('input', (e) => {
                    this.value = e.target.value;
                    this.scriptValue = e.target.value;
                });
                container.appendChild(input);
                break;
            }
            case 5: { // Advanced Expression
                if (!disabled) {
                    container.classList.add('rr-advanced-expression-controls');
                    this._buildAdvancedExpressionInputs(container);
                } else {
                    const summary = document.createElement('span');
                    summary.className = 'rr-command-help rr-command-help-inline';
                    summary.textContent = tt('Build a calculation from constants or variables.');
                    container.appendChild(summary);
                }
                break;
            }
        }
    }

    _buildAdvancedExpressionInputs(container) {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        const expression = this.advancedExpression || ControlVariablesEditor.defaultAdvancedExpression();
        const help = document.createElement('div');
        help.className = 'rr-command-help rr-advanced-expression-help';
        help.textContent = tt('Calculate a value with the formula below, then apply the selected operation to each target variable.');
        container.appendChild(help);

        const operatorRow = document.createElement('div');
        operatorRow.className = 'rr-expression-source rr-expression-operator';
        const operatorLabel = document.createElement('span');
        operatorLabel.className = 'rr-command-inline-label';
        operatorLabel.textContent = `${tt('Formula')}:`;
        const operatorSelect = document.createElement('select');
        ControlVariablesEditor.expressionOperators().forEach(operator => {
            const option = document.createElement('option');
            option.value = operator.value;
            option.textContent = operator.value === 'modulo'
                ? tt('Remainder after Division (Mod)')
                : tt(operator.label);
            option.selected = expression.operator === operator.value;
            operatorSelect.appendChild(option);
        });
        operatorSelect.addEventListener('change', (event) => {
            expression.operator = event.target.value;
            if (ControlVariablesEditor.isUnaryOperator(expression.operator)) {
                delete expression.right;
            } else if (!expression.right) {
                expression.right = { type: 'constant', value: 0 };
            }
            this.advancedExpression = expression;
            this.renderContent();
        });
        operatorRow.appendChild(operatorLabel);
        operatorRow.appendChild(operatorSelect);
        container.appendChild(operatorRow);

        const sources = document.createElement('div');
        sources.className = 'rr-expression-sources';
        sources.appendChild(this._buildExpressionSource(
            tt(ControlVariablesEditor.isUnaryOperator(expression.operator) ? 'Value' : 'Left'),
            expression.left,
            source => { expression.left = source; }
        ));
        if (!ControlVariablesEditor.isUnaryOperator(expression.operator)) {
            sources.appendChild(this._buildExpressionSource(
                tt('Right'),
                expression.right || { type: 'constant', value: 0 },
                source => { expression.right = source; }
            ));
        }
        container.appendChild(sources);
    }

    _buildExpressionSource(labelText, source, onChange) {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        const group = document.createElement('div');
        group.className = 'rr-expression-source';

        const label = document.createElement('span');
        label.textContent = `${labelText}:`;
        label.className = 'rr-command-inline-label';
        group.appendChild(label);

        const type = document.createElement('select');
        [{ value: 'constant', label: 'Constant' }, { value: 'variable', label: 'Variable' }].forEach(item => {
            const option = document.createElement('option');
            option.value = item.value;
            option.textContent = tt(item.label);
            option.selected = source.type === item.value;
            type.appendChild(option);
        });
        type.addEventListener('change', event => {
            onChange(event.target.value === 'variable'
                ? { type: 'variable', id: 1 }
                : { type: 'constant', value: 0 });
            this.renderContent();
        });
        group.appendChild(type);

        const value = document.createElement('input');
        value.type = 'number';
        value.value = source.type === 'variable' ? source.id : source.value;
        if (source.type === 'variable') value.min = 1;
        value.addEventListener('input', event => {
            if (source.type === 'variable') {
                source.id = Math.max(1, parseInt(event.target.value, 10) || 1);
            } else {
                const number = Number(event.target.value);
                source.value = Number.isFinite(number) ? number : 0;
            }
            onChange(source);
        });
        group.appendChild(value);

        if (source.type === 'variable') {
            const browse = document.createElement('button');
            browse.textContent = '...';
            browse.className = 'rr-btn-browse';
            browse.setAttribute('aria-label', `${tt('Select')} ${tt('Variable')}`);
            browse.addEventListener('click', () => {
                const picker = new SwitchVariablePicker(this.databaseManager, this.projectController);
                picker.show('variable', source.id, selectedId => {
                    if (selectedId) {
                        source.id = selectedId;
                        onChange(source);
                        this.renderContent();
                    }
                });
            });
            group.appendChild(browse);
        }
        return group;
    }

    _buildGameDataInputs(container, disabled) {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'rr-variable-reference rr-game-data-summary';
        button.disabled = disabled;
        const summary = document.createElement('span');
        summary.className = 'rr-variable-reference-label';
        summary.textContent = this._gameDataSummary(tt);
        const more = document.createElement('span');
        more.textContent = '...';
        button.appendChild(summary);
        button.appendChild(more);
        button.addEventListener('click', () => this._showGameDataDialog());
        container.appendChild(button);
    }

    static gameDataDefaults(type) {
        if (type === 4 || type === 6 || type === 7 || type === 8) {
            return { value: type, param1: 0, param2: 0 };
        }
        if (type === 5) return { value: type, param1: -1, param2: 0 };
        return { value: type, param1: 1, param2: 0 };
    }

    _databaseGameDataEntries(getterName) {
        try {
            const getter = this.databaseManager && this.databaseManager[getterName];
            return typeof getter === 'function' ? getter.call(this.databaseManager) || [] : [];
        } catch (_error) {
            return [];
        }
    }

    _databaseGameDataOptions(getterName, selectedId, tt = text => text) {
        const options = [];
        let hasSelected = false;
        for (const entry of this._databaseGameDataEntries(getterName)) {
            if (!entry || !Number.isInteger(Number(entry.id)) || Number(entry.id) < 1) continue;
            const id = Number(entry.id);
            options.push({
                value: id,
                label: `${String(id).padStart(4, '0')}: ${entry.name || tt('Unnamed')}`
            });
            if (id === selectedId) hasSelected = true;
        }
        if (!hasSelected) {
            options.push({
                value: selectedId,
                label: `${String(selectedId).padStart(4, '0')}: ${tt('Missing')}`
            });
        }
        return options;
    }

    _databaseGameDataName(getterName, id, tt = text => text) {
        const entry = this._databaseGameDataEntries(getterName)
            .find(candidate => candidate && Number(candidate.id) === id);
        return entry && entry.name
            ? `${String(id).padStart(4, '0')}: ${entry.name}`
            : `${String(id).padStart(4, '0')}: ${tt('Missing')}`;
    }

    _gameDataSummary(tt = text => text) {
        const type = this.operand === 3 && Number.isInteger(this.value) ? this.value : 0;
        const param1 = Number.isInteger(this.param1) ? this.param1 : 0;
        const param2 = Number.isInteger(this.param2) ? this.param2 : 0;
        const catalogs = ['getItems', 'getWeapons', 'getArmors'];
        if (type >= 0 && type <= 2) {
            const getterName = catalogs[type];
            return `${this._databaseGameDataName(getterName, Math.max(1, param1), tt)} · ${tt('Possession')} ${tt('Count')}`;
        }
        if (type === 3) {
            const property = ControlVariablesEditor.actorGameDataParameters()[param2] || 'Level';
            return `${tt(property)} · ${this._databaseGameDataName('getActors', Math.max(1, param1), tt)}`;
        }
        if (type === 4) {
            const property = ControlVariablesEditor.enemyGameDataParameters()[param2] || 'HP';
            return `${tt(property)} · ${tt('Enemy')} ${Math.max(0, param1) + 1}`;
        }
        if (type === 5) {
            const property = ControlVariablesEditor.characterGameDataParameters()[param2] || 'Map X';
            const character = this._characterGameDataOptions(tt).find(option => option.v === param1);
            return `${tt(property)} · ${character ? character.t : `${tt('Event')} ${param1}`}`;
        }
        if (type === 6) return `${tt('Actor ID')} · ${tt('Party Member')} ${Math.max(0, param1) + 1}`;
        if (type === 7) return tt(ControlVariablesEditor.otherGameDataParameters()[param1] || 'Map ID');
        if (type === 8) return tt(ControlVariablesEditor.lastActionGameDataParameters()[param1] || 'Last Used Skill ID');
        return tt('Game Data');
    }

    _gameDataSelect(options, selectedValue, disabled, onChange) {
        const select = document.createElement('select');
        select.disabled = disabled;
        for (const optionData of options) {
            const option = document.createElement('option');
            option.value = optionData.value;
            option.textContent = optionData.label;
            option.selected = optionData.value === selectedValue;
            select.appendChild(option);
        }
        select.addEventListener('change', event => onChange(parseInt(event.target.value, 10)));
        return select;
    }

    _showGameDataDialog() {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        const draft = {
            value: Number.isInteger(this.value) && this.value >= 0 && this.value <= 8 ? this.value : 0,
            param1: Number.isInteger(this.param1) ? this.param1 : 0,
            param2: Number.isInteger(this.param2) ? this.param2 : 0
        };
        const previouslyFocused = document.activeElement;
        const modal = document.createElement('div');
        modal.className = 'rr-modal-overlay rr-nested-picker-modal rr-game-data-modal';
        modal.style.display = 'flex';
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-modal', 'true');
        modal.setAttribute('aria-labelledby', `${this.inputScope}-game-data-title`);

        const dialog = document.createElement('div');
        dialog.className = 'rr-modal rr-event-command-dialog rr-game-data-dialog';
        const header = document.createElement('div');
        header.className = 'rr-modal-header';
        const title = document.createElement('div');
        title.className = 'rr-modal-title';
        title.id = `${this.inputScope}-game-data-title`;
        title.textContent = tt('Game Data');
        const closeButton = document.createElement('button');
        closeButton.className = 'close-btn rr-modal-close';
        closeButton.setAttribute('aria-label', tt('Close'));
        closeButton.textContent = '×';
        header.appendChild(title);
        header.appendChild(closeButton);
        dialog.appendChild(header);

        const body = document.createElement('div');
        body.className = 'rr-modal-body rr-game-data-body';
        dialog.appendChild(body);

        const footer = document.createElement('div');
        footer.className = 'rr-modal-footer';
        const cancelButton = document.createElement('button');
        cancelButton.className = 'rr-btn-secondary';
        cancelButton.textContent = tt('Cancel');
        const okButton = document.createElement('button');
        okButton.className = 'rr-button-primary';
        okButton.textContent = tt('OK');
        footer.appendChild(cancelButton);
        footer.appendChild(okButton);
        dialog.appendChild(footer);
        modal.appendChild(dialog);
        document.body.appendChild(modal);

        const close = () => {
            modal.remove();
            if (previouslyFocused && previouslyFocused.isConnected) previouslyFocused.focus();
        };
        const selectOptions = labels => labels.map((label, value) => ({ value, label: tt(label) }));
        const indexedOptions = (label, selectedValue) => {
            const options = Array.from({ length: 8 }, (_unused, index) => ({
                value: index,
                label: `${tt(label)} ${index + 1}`
            }));
            if (selectedValue >= options.length) {
                options.push({ value: selectedValue, label: `${tt(label)} ${selectedValue + 1}` });
            }
            return options;
        };
        const databaseRows = {
            0: 'getItems',
            1: 'getWeapons',
            2: 'getArmors',
            3: 'getActors'
        };

        const renderRows = () => {
            body.replaceChildren();
            const list = document.createElement('div');
            list.className = 'rr-game-data-list';
            for (const type of ControlVariablesEditor.gameDataTypes()) {
                const active = draft.value === type.value;
                const row = document.createElement('div');
                row.className = `rr-game-data-row${active ? ' is-active' : ''}`;
                const radio = document.createElement('input');
                radio.type = 'radio';
                radio.name = `${this.inputScope}-game-data-type`;
                radio.id = `${this.inputScope}-game-data-type-${type.value}`;
                radio.checked = active;
                radio.addEventListener('change', () => {
                    Object.assign(draft, ControlVariablesEditor.gameDataDefaults(type.value));
                    renderRows();
                });
                const label = document.createElement('label');
                label.htmlFor = radio.id;
                label.textContent = tt(type.label);
                const controls = document.createElement('div');
                controls.className = 'rr-game-data-controls';

                if (type.value >= 0 && type.value <= 2) {
                    const selected = active ? Math.max(1, draft.param1) : 1;
                    controls.appendChild(this._gameDataSelect(
                        this._databaseGameDataOptions(databaseRows[type.value], selected, tt),
                        selected,
                        !active,
                        value => { draft.param1 = value; }
                    ));
                    const hint = document.createElement('span');
                    hint.className = 'rr-game-data-hint';
                    hint.textContent = `(${tt('Possession')} ${tt('Count')})`;
                    controls.appendChild(hint);
                } else if (type.value === 3) {
                    const selected = active ? Math.max(1, draft.param1) : 1;
                    controls.appendChild(this._gameDataSelect(
                        this._databaseGameDataOptions('getActors', selected, tt),
                        selected,
                        !active,
                        value => { draft.param1 = value; }
                    ));
                    controls.appendChild(this._gameDataSelect(
                        selectOptions(ControlVariablesEditor.actorGameDataParameters()),
                        active ? draft.param2 : 0,
                        !active,
                        value => { draft.param2 = value; }
                    ));
                } else if (type.value === 4) {
                    const selected = active ? Math.max(0, draft.param1) : 0;
                    controls.appendChild(this._gameDataSelect(
                        indexedOptions('Enemy', selected),
                        selected,
                        !active,
                        value => { draft.param1 = value; }
                    ));
                    controls.appendChild(this._gameDataSelect(
                        selectOptions(ControlVariablesEditor.enemyGameDataParameters()),
                        active ? draft.param2 : 0,
                        !active,
                        value => { draft.param2 = value; }
                    ));
                } else if (type.value === 5) {
                    const characterOptions = this._characterGameDataOptions(tt)
                        .map(option => ({ value: option.v, label: option.t }));
                    controls.appendChild(this._gameDataSelect(
                        characterOptions,
                        active ? draft.param1 : -1,
                        !active,
                        value => { draft.param1 = value; }
                    ));
                    controls.appendChild(this._gameDataSelect(
                        selectOptions(ControlVariablesEditor.characterGameDataParameters()),
                        active ? draft.param2 : 0,
                        !active,
                        value => { draft.param2 = value; }
                    ));
                } else if (type.value === 6) {
                    const selected = active ? Math.max(0, draft.param1) : 0;
                    controls.appendChild(this._gameDataSelect(
                        indexedOptions('Party Member', selected),
                        selected,
                        !active,
                        value => { draft.param1 = value; }
                    ));
                    const hint = document.createElement('span');
                    hint.className = 'rr-game-data-hint';
                    hint.textContent = `(${tt('Actor ID')})`;
                    controls.appendChild(hint);
                } else if (type.value === 7) {
                    controls.appendChild(this._gameDataSelect(
                        selectOptions(ControlVariablesEditor.otherGameDataParameters()),
                        active ? draft.param1 : 0,
                        !active,
                        value => { draft.param1 = value; }
                    ));
                } else if (type.value === 8) {
                    controls.appendChild(this._gameDataSelect(
                        selectOptions(ControlVariablesEditor.lastActionGameDataParameters()),
                        active ? draft.param1 : 0,
                        !active,
                        value => { draft.param1 = value; }
                    ));
                }

                row.appendChild(radio);
                row.appendChild(label);
                row.appendChild(controls);
                list.appendChild(row);
            }
            body.appendChild(list);
            const selected = list.querySelector('input:checked');
            if (selected) selected.focus();
        };

        closeButton.addEventListener('click', close);
        cancelButton.addEventListener('click', close);
        okButton.addEventListener('click', () => {
            this.value = draft.value;
            this.param1 = draft.param1;
            this.param2 = draft.param2;
            close();
            this.renderContent();
        });
        modal.addEventListener('click', event => {
            if (event.target === modal) close();
        });
        modal.addEventListener('keydown', event => {
            if (event.key === 'Escape') close();
        });
        renderRows();
    }

    _currentMapEvents() {
        try {
            const tilemap = this.projectController && this.projectController.tilemapManager;
            const eventManager = this.projectController && this.projectController.eventManager;
            const map = (tilemap && tilemap.currentMap) || (eventManager && eventManager.currentMap);
            return map && Array.isArray(map.events) ? map.events : [];
        } catch (_error) {
            return [];
        }
    }

    _characterGameDataOptions(tt = text => text) {
        const options = [{ v: -1, t: tt('Player') }, { v: 0, t: tt('This Event') }];
        const included = new Set([-1, 0]);
        this._currentMapEvents().forEach((event, index) => {
            if (!event) return;
            const id = event.id !== undefined ? Number(event.id) : index;
            if (!Number.isInteger(id) || id <= 0 || included.has(id)) return;
            const name = typeof event.name === 'string' ? event.name.trim() : '';
            const label = `${tt('Event')} ${String(id).padStart(3, '0')}`;
            options.push({ v: id, t: name ? `${label}: ${name}` : label });
            included.add(id);
        });
        if (Number.isInteger(this.param1) && !included.has(this.param1)) {
            options.push({
                v: this.param1,
                t: `${tt('Event')} ${String(this.param1).padStart(3, '0')}: ${tt('Missing')}`
            });
        }
        return options;
    }

    static codec() {
        if (typeof globalThis !== 'undefined' && globalThis.ReactorEventCommandCodec) {
            return globalThis.ReactorEventCommandCodec;
        }
        if (typeof require === 'function') {
            const candidates = [];
            if (typeof __dirname === 'string') {
                candidates.push(`${__dirname}/ReactorEventCommandCodec.js`);
            }
            if (typeof process !== 'undefined' && typeof process.cwd === 'function') {
                candidates.push(`${process.cwd()}/src/event/commands/ReactorEventCommandCodec.js`);
            }
            for (const candidate of candidates) {
                try {
                    return require(candidate);
                } catch (_error) {
                    // Try the next environment-specific module location.
                }
            }
        }
        throw new Error('ReactorEventCommandCodec is not loaded');
    }

    static defaultAdvancedExpression() {
        return {
            operator: 'add',
            left: { type: 'constant', value: 0 },
            right: { type: 'constant', value: 0 }
        };
    }

    static expressionOperators() {
        return [
            { value: 'add', label: 'Add' },
            { value: 'subtract', label: 'Subtract' },
            { value: 'multiply', label: 'Multiply' },
            { value: 'divide', label: 'Divide' },
            { value: 'modulo', label: 'Remainder after Division (Mod)' },
            { value: 'power', label: 'Power (Exponent)' },
            { value: 'minimum', label: 'Minimum' },
            { value: 'maximum', label: 'Maximum' },
            { value: 'atan2', label: 'Angle (Atan2)' },
            { value: 'random', label: 'Random Integer' },
            { value: 'bitwiseAnd', label: 'Bitwise AND (&)' },
            { value: 'bitwiseOr', label: 'Bitwise OR (|)' },
            { value: 'bitwiseXor', label: 'Bitwise XOR (^)' },
            { value: 'leftShift', label: 'Shift Left (<<)' },
            { value: 'rightShift', label: 'Shift Right (>>)' },
            { value: 'absolute', label: 'Absolute Value' },
            { value: 'squareRoot', label: 'Square Root' },
            { value: 'sineDegrees', label: 'Sine (Degrees)' },
            { value: 'cosineDegrees', label: 'Cosine (Degrees)' }
        ];
    }

    static isUnaryOperator(operator) {
        return ['absolute', 'squareRoot', 'sineDegrees', 'cosineDegrees'].includes(operator);
    }

    static normalizeExpressionSource(source) {
        if (!source || typeof source !== 'object' || Array.isArray(source)) return null;
        if (source.type === 'constant' && Object.keys(source).length === 2 &&
            typeof source.value === 'number' && Number.isFinite(source.value)) {
            return { type: 'constant', value: source.value };
        }
        if (source.type === 'variable' && Object.keys(source).length === 2 &&
            Number.isInteger(source.id) && source.id >= 1) {
            return { type: 'variable', id: source.id };
        }
        return null;
    }

    static normalizeAdvancedExpression(data) {
        if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
        const known = new Set(this.expressionOperators().map(operator => operator.value));
        if (!known.has(data.operator)) return null;

        const unary = this.isUnaryOperator(data.operator);
        const expectedKeys = unary ? ['operator', 'left'] : ['operator', 'left', 'right'];
        if (Object.keys(data).length !== expectedKeys.length ||
            !expectedKeys.every(key => Object.prototype.hasOwnProperty.call(data, key))) {
            return null;
        }

        const left = this.normalizeExpressionSource(data.left);
        const right = unary ? null : this.normalizeExpressionSource(data.right);
        if (!left || (!unary && !right)) return null;

        const normalized = { operator: data.operator, left };
        if (!unary) normalized.right = right;
        return normalized;
    }

    static compileExpressionSource(source) {
        return source.type === 'variable'
            ? `Number($gameVariables.value(${source.id}))`
            : JSON.stringify(source.value);
    }

    static compileAdvancedExpressionBody(data) {
        const expression = this.normalizeAdvancedExpression(data);
        if (!expression) throw new TypeError('Invalid advanced variable expression');

        const left = this.compileExpressionSource(expression.left);
        const right = expression.right ? this.compileExpressionSource(expression.right) : null;
        switch (expression.operator) {
            case 'add': return `(${left} + ${right})`;
            case 'subtract': return `(${left} - ${right})`;
            case 'multiply': return `(${left} * ${right})`;
            case 'divide': return `(${left} / ${right})`;
            case 'modulo': return `(${left} % ${right})`;
            case 'power': return `Math.pow(${left}, ${right})`;
            case 'minimum': return `Math.min(${left}, ${right})`;
            case 'maximum': return `Math.max(${left}, ${right})`;
            case 'atan2': return `Math.atan2(${left}, ${right})`;
            case 'random':
                return `(function(a,b){a=Number(a);b=Number(b);if(!isFinite(a))a=0;if(!isFinite(b))b=0;var lo=Math.min(Math.floor(a),Math.floor(b));var hi=Math.max(Math.floor(a),Math.floor(b));return lo+Math.randomInt(hi-lo+1);})(${left},${right})`;
            case 'bitwiseAnd': return `(${left} & ${right})`;
            case 'bitwiseOr': return `(${left} | ${right})`;
            case 'bitwiseXor': return `(${left} ^ ${right})`;
            case 'leftShift': return `(${left} << ${right})`;
            case 'rightShift': return `(${left} >> ${right})`;
            case 'absolute': return `Math.abs(${left})`;
            case 'squareRoot': return `Math.sqrt(${left})`;
            case 'sineDegrees': return `Math.sin(${left} * Math.PI / 180)`;
            case 'cosineDegrees': return `Math.cos(${left} * Math.PI / 180)`;
            default: throw new TypeError('Unsupported advanced variable expression');
        }
    }

    static compileAdvancedExpression(data) {
        const expression = this.normalizeAdvancedExpression(data);
        if (!expression) throw new TypeError('Invalid advanced variable expression');
        return this.codec().createText(
            'control-variables-expression',
            expression,
            this.compileAdvancedExpressionBody(expression)
        );
    }

    static parseAdvancedExpression(text) {
        const parsed = this.codec().parseText(text, 'control-variables-expression');
        if (!parsed) return null;
        const expression = this.normalizeAdvancedExpression(parsed.data);
        if (!expression) return null;
        if (this.compileAdvancedExpression(expression) !== text) return null;
        return expression;
    }

    static parseAdvancedExpressionCommand(command) {
        if (!command || command.code !== 122 || !Array.isArray(command.parameters) ||
            command.parameters.length !== 7 || command.parameters[3] !== 4) {
            return null;
        }
        if (!this.codec().parseCommand(command, 'control-variables-expression')) return null;
        return this.parseAdvancedExpression(command.parameters[4]);
    }

    static buildAdvancedCommand(options) {
        const startId = options && options.startId;
        const endId = options && options.endId;
        const operationType = options && options.operationType;
        const indent = options && options.indent !== undefined ? options.indent : 0;
        if (!Number.isInteger(startId) || startId < 1 || startId > 9999 ||
            !Number.isInteger(endId) || endId < startId || endId > 9999 ||
            !Number.isInteger(operationType) || operationType < 0 || operationType > 5 ||
            !Number.isInteger(indent) || indent < 0) {
            throw new TypeError('Invalid Control Variables command options');
        }
        return {
            code: 122,
            indent,
            parameters: [
                startId,
                endId,
                operationType,
                4,
                this.compileAdvancedExpression(options.expression),
                0,
                0
            ]
        };
    }

    buildCommand() {
        const startId = Math.min(9999, Math.max(1, parseInt(this.startId, 10) || 1));
        const endId = this.singleVariable
            ? startId
            : Math.min(9999, Math.max(startId, parseInt(this.endId, 10) || startId));
        if (this.operand === 5) {
            return ControlVariablesEditor.buildAdvancedCommand({
                startId,
                endId,
                operationType: this.operationType,
                expression: this.advancedExpression
            });
        }
        return {
            code: 122,
            indent: 0,
            parameters: [
                startId,
                endId,
                this.operationType,
                this.operand,
                this.value,
                this.param1,
                this.param2
            ]
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
        if (this.previouslyFocused && this.previouslyFocused.isConnected) {
            this.previouslyFocused.focus();
        }
        this.previouslyFocused = null;
    }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ControlVariablesEditor;
}
