/**
 * ControlVariablesEditor - Editor for Control Variables event command (code 122)
 *
 * Parameter layout (matches MZ Game_Interpreter.command122):
 *   params[0] startId
 *   params[1] endId
 *   params[2] operationType (0=Set, 1=Add, 2=Sub, 3=Mul, 4=Div, 5=Mod)
 *   params[3] operand       (0=Constant, 1=Variable, 2=Random, 3=Game Data, 4=Script)
 *   params[4] value         (constant | varId | random min | game-data type | script string)
 *   params[5] param1        (random max | game-data param1)
 *   params[6] param2        (game-data param2)
 */
class ControlVariablesEditor {
    constructor(databaseManager, projectController) {
        this.databaseManager = databaseManager;
        this.projectController = projectController;
        this.modal = null;
        this.callback = null;
        this.resetToDefaults();
    }

    show(command, callback) {
        this.callback = callback;

        if (command && command.code === 122) {
            const params = command.parameters;
            this.startId = params[0] || 1;
            this.endId = params[1] || 1;
            this.operationType = params[2] || 0;
            this.operand = params[3] || 0;
            this.value = params[4] !== undefined ? params[4] : 0;
            this.param1 = params[5] !== undefined ? params[5] : 0;
            this.param2 = params[6] !== undefined ? params[6] : 0;
            this.singleVariable = (this.startId === this.endId);
        } else {
            this.resetToDefaults();
        }

        if (!this.modal) {
            this.createModal();
        }

        this.renderContent();
        this.modal.style.display = 'flex';
    }

    resetToDefaults() {
        this.startId = 1;
        this.endId = 1;
        this.operationType = 0;
        this.operand = 0;
        this.value = 0;
        this.param1 = 0;
        this.param2 = 0;
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
                if (typeof this.value !== 'string') this.value = '';
                break;
        }
    }

    createModal() {
        this.modal = document.createElement('div');
        this.modal.className = 'control-variables-editor-modal';
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
        container.className = 'control-variables-container';
        container.style.cssText = `
            background-color: var(--color-bg-surface);
            border: 1px solid var(--color-border);
            border-radius: 6px;
            width: 720px;
            max-width: 95vw;
            max-height: 85vh;
            display: flex;
            flex-direction: column;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
            overflow: hidden;
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
        const container = this.modal.querySelector('.control-variables-container');
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
        `;
        header.innerHTML = `
            <h3 style="margin: 0; color: var(--color-text-strong); font-size: 16px;">Control Variables</h3>
            <button class="close-btn" style="background: none; border: none; color: var(--color-text-strong); font-size: 20px; cursor: pointer; padding: 0; width: 24px; height: 24px;">×</button>
        `;
        container.appendChild(header);
        header.querySelector('.close-btn').addEventListener('click', () => this.close());

        // Content (scroll body)
        const content = document.createElement('div');
        content.style.cssText = `
            padding: 16px;
            display: flex;
            flex-direction: column;
            gap: 14px;
            overflow-y: auto;
        `;

        // Top row: Variable panel + Operation panel
        const topRow = document.createElement('div');
        topRow.style.cssText = 'display: flex; gap: 12px; align-items: stretch;';
        topRow.appendChild(this.createVariablePanel());
        topRow.appendChild(this.createOperationPanel());
        content.appendChild(topRow);

        // Operand panel (full width)
        content.appendChild(this.createOperandPanel());

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

    // ------------------------------------------------------------------
    // Panels
    // ------------------------------------------------------------------

    _panelFrame(title) {
        const panel = document.createElement('div');
        panel.style.cssText = `
            border: 1px solid var(--color-border);
            border-radius: 4px;
            padding: 10px 12px;
            background-color: var(--color-bg-list-item);
            flex: 1;
            display: flex;
            flex-direction: column;
            gap: 10px;
            min-width: 0;
        `;
        const t = document.createElement('div');
        t.textContent = title;
        t.style.cssText = `color: var(--color-accent); font-size: 11px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.5px;`;
        panel.appendChild(t);
        return panel;
    }

    createVariablePanel() {
        const panel = this._panelFrame('Variable');

        // Mode toggle (Single/Batch)
        const modeRow = document.createElement('div');
        modeRow.style.cssText = 'display: flex; gap: 14px; align-items: center;';

        const singleRadio = document.createElement('input');
        singleRadio.type = 'radio';
        singleRadio.name = 'var-mode';
        singleRadio.id = 'single-var';
        singleRadio.checked = this.singleVariable;
        singleRadio.addEventListener('change', () => {
            this.singleVariable = true;
            this.endId = this.startId;
            this.renderContent();
        });
        const singleLabel = document.createElement('label');
        singleLabel.htmlFor = 'single-var';
        singleLabel.textContent = 'Single';
        singleLabel.style.cssText = 'color: var(--color-text); cursor: pointer; font-size: 12px;';

        const batchRadio = document.createElement('input');
        batchRadio.type = 'radio';
        batchRadio.name = 'var-mode';
        batchRadio.id = 'batch-var';
        batchRadio.checked = !this.singleVariable;
        batchRadio.addEventListener('change', () => {
            this.singleVariable = false;
            if (this.endId < this.startId) this.endId = this.startId;
            this.renderContent();
        });
        const batchLabel = document.createElement('label');
        batchLabel.htmlFor = 'batch-var';
        batchLabel.textContent = 'Batch';
        batchLabel.style.cssText = 'color: var(--color-text); cursor: pointer; font-size: 12px;';

        modeRow.appendChild(singleRadio);
        modeRow.appendChild(singleLabel);
        modeRow.appendChild(batchRadio);
        modeRow.appendChild(batchLabel);
        panel.appendChild(modeRow);

        if (this.singleVariable) {
            panel.appendChild(this._varInputRow('Variable:', this.startId, (id) => {
                this.startId = id;
                this.endId = id;
            }));
        } else {
            const dualRow = document.createElement('div');
            dualRow.style.cssText = 'display: flex; gap: 8px;';

            const fromBox = this._varInputRow('From:', this.startId, (id) => {
                this.startId = id;
                if (this.startId > this.endId) {
                    this.endId = this.startId;
                    this.renderContent();
                }
            });
            fromBox.style.flex = '1';

            const toBox = this._varInputRow('To:', this.endId, (id) => {
                this.endId = Math.max(id, this.startId);
            });
            toBox.style.flex = '1';

            dualRow.appendChild(fromBox);
            dualRow.appendChild(toBox);
            panel.appendChild(dualRow);
        }

        return panel;
    }

    _varInputRow(labelText, value, onChange) {
        const row = document.createElement('div');
        row.style.cssText = 'display: flex; align-items: center; gap: 6px;';

        const label = document.createElement('span');
        label.textContent = labelText;
        label.style.cssText = 'color: var(--color-text); font-size: 12px; min-width: 54px;';

        const input = document.createElement('input');
        input.type = 'number';
        input.min = 1;
        input.max = 9999;
        input.value = value;
        input.style.cssText = `
            padding: 6px 8px;
            background-color: var(--color-bg-input);
            color: var(--color-text);
            border: 1px solid var(--color-border-input);
            border-radius: 3px;
            font-size: 12px;
            flex: 1;
            min-width: 60px;
        `;
        input.addEventListener('input', (e) => {
            const v = parseInt(e.target.value) || 1;
            onChange(v);
        });

        const browseBtn = document.createElement('button');
        browseBtn.textContent = '...';
        browseBtn.className = 'rr-btn-browse';
        browseBtn.addEventListener('click', () => {
            const picker = new SwitchVariablePicker(this.databaseManager, this.projectController);
            picker.show('variable', value, (selectedId) => {
                if (selectedId) {
                    onChange(selectedId);
                    this.renderContent();
                }
            });
        });

        row.appendChild(label);
        row.appendChild(input);
        row.appendChild(browseBtn);
        return row;
    }

    createOperationPanel() {
        const panel = this._panelFrame('Operation');

        const operations = [
            { value: 0, label: 'Set' },
            { value: 1, label: 'Add' },
            { value: 2, label: 'Sub' },
            { value: 3, label: 'Mul' },
            { value: 4, label: 'Div' },
            { value: 5, label: 'Mod' },
        ];

        const grid = document.createElement('div');
        grid.style.cssText = 'display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 6px;';

        operations.forEach(op => {
            const btn = document.createElement('button');
            btn.textContent = op.label;
            const active = this.operationType === op.value;
            btn.style.cssText = `
                padding: 8px 10px;
                background-color: ${active ? 'var(--color-accent)' : 'var(--color-bg-input)'};
                color: ${active ? 'var(--color-bg-deep)' : 'var(--color-text)'};
                border: 1px solid ${active ? 'var(--color-accent)' : 'var(--color-border-input)'};
                border-radius: 3px;
                cursor: pointer;
                font-size: 12px;
                font-weight: ${active ? 'bold' : 'normal'};
            `;
            btn.addEventListener('click', () => {
                this.operationType = op.value;
                this.renderContent();
            });
            grid.appendChild(btn);
        });

        panel.appendChild(grid);
        return panel;
    }

    createOperandPanel() {
        const panel = this._panelFrame('Operand');

        const operands = [
            { value: 0, label: 'Constant' },
            { value: 1, label: 'Variable' },
            { value: 2, label: 'Random' },
            { value: 3, label: 'Game Data' },
            { value: 4, label: 'Script' },
        ];

        operands.forEach(opd => {
            const row = document.createElement('div');
            row.style.cssText = 'display: flex; align-items: center; gap: 8px; padding: 3px 0;';

            const radio = document.createElement('input');
            radio.type = 'radio';
            radio.name = 'operand-type';
            radio.id = `operand-${opd.value}`;
            radio.checked = this.operand === opd.value;
            radio.addEventListener('change', () => {
                this.operand = opd.value;
                this.resetOperandValues();
                this.renderContent();
            });

            const active = this.operand === opd.value;
            const label = document.createElement('label');
            label.htmlFor = `operand-${opd.value}`;
            label.textContent = opd.label;
            label.style.cssText = `
                color: ${active ? 'var(--color-text-strong)' : 'var(--color-text)'};
                cursor: pointer;
                font-size: 12px;
                min-width: 80px;
                font-weight: ${active ? 'bold' : 'normal'};
            `;

            const inputs = document.createElement('div');
            inputs.style.cssText = 'flex: 1; display: flex; align-items: center; gap: 6px; flex-wrap: wrap;';
            this._populateOperandInputs(inputs, opd.value, !active);

            row.appendChild(radio);
            row.appendChild(label);
            row.appendChild(inputs);
            panel.appendChild(row);
        });

        return panel;
    }

    _populateOperandInputs(container, opdType, disabled) {
        const inputStyle = `
            padding: 6px 8px;
            background-color: ${disabled ? 'var(--color-bg-surface)' : 'var(--color-bg-input)'};
            color: ${disabled ? 'var(--color-text-dim)' : 'var(--color-text)'};
            border: 1px solid var(--color-border-input);
            border-radius: 3px;
            font-size: 12px;
        `;
        const labelStyle = `color: ${disabled ? 'var(--color-text-dim)' : 'var(--color-text-muted)'}; font-size: 11px;`;

        switch (opdType) {
            case 0: { // Constant
                const inp = document.createElement('input');
                inp.type = 'number';
                inp.value = (this.operand === 0 && typeof this.value === 'number') ? this.value : 0;
                inp.disabled = disabled;
                inp.style.cssText = inputStyle + 'flex: 1; min-width: 120px;';
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
                inp.style.cssText = inputStyle + 'flex: 1; min-width: 80px;';
                inp.addEventListener('input', (e) => { this.value = parseInt(e.target.value) || 1; });
                container.appendChild(inp);

                const browseBtn = document.createElement('button');
                browseBtn.textContent = '...';
                browseBtn.disabled = disabled;
                browseBtn.className = 'rr-btn-browse';
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
                const minLbl = document.createElement('span');
                minLbl.textContent = 'Min:';
                minLbl.style.cssText = labelStyle;

                const minInp = document.createElement('input');
                minInp.type = 'number';
                minInp.value = (this.operand === 2 && typeof this.value === 'number') ? this.value : 0;
                minInp.disabled = disabled;
                minInp.style.cssText = inputStyle + 'width: 80px;';
                minInp.addEventListener('input', (e) => { this.value = parseInt(e.target.value) || 0; });

                const maxLbl = document.createElement('span');
                maxLbl.textContent = 'Max:';
                maxLbl.style.cssText = labelStyle;

                const maxInp = document.createElement('input');
                maxInp.type = 'number';
                maxInp.value = (this.operand === 2) ? (this.param1 || 0) : 0;
                maxInp.disabled = disabled;
                maxInp.style.cssText = inputStyle + 'width: 80px;';
                maxInp.addEventListener('input', (e) => { this.param1 = parseInt(e.target.value) || 0; });

                container.appendChild(minLbl);
                container.appendChild(minInp);
                container.appendChild(maxLbl);
                container.appendChild(maxInp);
                break;
            }
            case 3: { // Game Data
                this._buildGameDataInputs(container, disabled, inputStyle, labelStyle);
                break;
            }
            case 4: { // Script
                const ta = document.createElement('textarea');
                ta.value = (this.operand === 4 && typeof this.value === 'string') ? this.value : '';
                ta.disabled = disabled;
                ta.rows = 2;
                ta.placeholder = 'JavaScript expression...';
                ta.style.cssText = inputStyle + 'flex: 1; min-width: 200px; font-family: monospace; resize: vertical;';
                ta.addEventListener('input', (e) => { this.value = e.target.value; });
                container.appendChild(ta);
                break;
            }
        }
    }

    _buildGameDataInputs(container, disabled, inputStyle, labelStyle) {
        const gdType = (this.operand === 3 && typeof this.value === 'number') ? this.value : 0;

        // Type dropdown
        const typeSelect = document.createElement('select');
        typeSelect.disabled = disabled;
        typeSelect.style.cssText = inputStyle + 'min-width: 110px;';
        ['Item', 'Weapon', 'Armor', 'Actor', 'Enemy', 'Character', 'Party', 'Other'].forEach((t, i) => {
            const opt = document.createElement('option');
            opt.value = i;
            opt.textContent = t;
            if (i === gdType) opt.selected = true;
            typeSelect.appendChild(opt);
        });
        typeSelect.addEventListener('change', (e) => {
            this.value = parseInt(e.target.value);
            this.param1 = (this.value === 4 || this.value === 6) ? 0 : 1; // Enemy/Party use 0-based index
            if (this.value === 5) this.param1 = -1; // Character defaults to Player
            this.param2 = 0;
            this.renderContent();
        });
        container.appendChild(typeSelect);

        // Sub-inputs by subtype
        if (gdType === 0 || gdType === 1 || gdType === 2) {
            // Item/Weapon/Armor: id input
            const idInp = document.createElement('input');
            idInp.type = 'number';
            idInp.min = 1;
            idInp.value = this.param1 || 1;
            idInp.disabled = disabled;
            idInp.style.cssText = inputStyle + 'width: 80px;';
            idInp.addEventListener('input', (e) => { this.param1 = parseInt(e.target.value) || 1; });
            container.appendChild(idInp);
        } else if (gdType === 3) {
            // Actor: id + param
            const idInp = document.createElement('input');
            idInp.type = 'number';
            idInp.min = 1;
            idInp.value = this.param1 || 1;
            idInp.disabled = disabled;
            idInp.style.cssText = inputStyle + 'width: 70px;';
            idInp.addEventListener('input', (e) => { this.param1 = parseInt(e.target.value) || 1; });
            container.appendChild(idInp);

            const paramSelect = document.createElement('select');
            paramSelect.disabled = disabled;
            paramSelect.style.cssText = inputStyle + 'min-width: 100px;';
            const actorParams = ['Level', 'EXP', 'HP', 'MP', 'Max HP', 'Max MP', 'Attack', 'Defense', 'M.Attack', 'M.Defense', 'Agility', 'Luck'];
            actorParams.forEach((p, i) => {
                const opt = document.createElement('option');
                opt.value = i;
                opt.textContent = p;
                if (i === this.param2) opt.selected = true;
                paramSelect.appendChild(opt);
            });
            paramSelect.addEventListener('change', (e) => { this.param2 = parseInt(e.target.value); });
            container.appendChild(paramSelect);
        } else if (gdType === 4) {
            // Enemy: index + param
            const idxLbl = document.createElement('span');
            idxLbl.textContent = 'Index:';
            idxLbl.style.cssText = labelStyle;

            const idxInp = document.createElement('input');
            idxInp.type = 'number';
            idxInp.min = 0;
            idxInp.value = this.param1 || 0;
            idxInp.disabled = disabled;
            idxInp.style.cssText = inputStyle + 'width: 60px;';
            idxInp.addEventListener('input', (e) => { this.param1 = parseInt(e.target.value) || 0; });

            container.appendChild(idxLbl);
            container.appendChild(idxInp);

            const paramSelect = document.createElement('select');
            paramSelect.disabled = disabled;
            paramSelect.style.cssText = inputStyle + 'min-width: 100px;';
            const enemyParams = ['HP', 'MP', 'Max HP', 'Max MP', 'Attack', 'Defense', 'M.Attack', 'M.Defense', 'Agility', 'Luck'];
            enemyParams.forEach((p, i) => {
                const opt = document.createElement('option');
                opt.value = i;
                opt.textContent = p;
                if (i === this.param2) opt.selected = true;
                paramSelect.appendChild(opt);
            });
            paramSelect.addEventListener('change', (e) => { this.param2 = parseInt(e.target.value); });
            container.appendChild(paramSelect);
        } else if (gdType === 5) {
            // Character: select + prop
            const charSelect = document.createElement('select');
            charSelect.disabled = disabled;
            charSelect.style.cssText = inputStyle + 'min-width: 130px;';
            const charOpts = [{ v: -1, t: 'Player' }, { v: 0, t: 'This Event' }];
            for (let i = 1; i <= 20; i++) charOpts.push({ v: i, t: `Event ${i.toString().padStart(3, '0')}` });
            charOpts.forEach(co => {
                const opt = document.createElement('option');
                opt.value = co.v;
                opt.textContent = co.t;
                if (co.v === this.param1) opt.selected = true;
                charSelect.appendChild(opt);
            });
            charSelect.addEventListener('change', (e) => { this.param1 = parseInt(e.target.value); });
            container.appendChild(charSelect);

            const paramSelect = document.createElement('select');
            paramSelect.disabled = disabled;
            paramSelect.style.cssText = inputStyle + 'min-width: 100px;';
            ['Map X', 'Map Y', 'Direction', 'Screen X', 'Screen Y'].forEach((p, i) => {
                const opt = document.createElement('option');
                opt.value = i;
                opt.textContent = p;
                if (i === this.param2) opt.selected = true;
                paramSelect.appendChild(opt);
            });
            paramSelect.addEventListener('change', (e) => { this.param2 = parseInt(e.target.value); });
            container.appendChild(paramSelect);
        } else if (gdType === 6) {
            // Party member: index
            const idxLbl = document.createElement('span');
            idxLbl.textContent = 'Member #:';
            idxLbl.style.cssText = labelStyle;

            const idxInp = document.createElement('input');
            idxInp.type = 'number';
            idxInp.min = 0;
            idxInp.value = this.param1 || 0;
            idxInp.disabled = disabled;
            idxInp.style.cssText = inputStyle + 'width: 60px;';
            idxInp.addEventListener('input', (e) => { this.param1 = parseInt(e.target.value) || 0; });

            container.appendChild(idxLbl);
            container.appendChild(idxInp);
        } else if (gdType === 7) {
            // Other: select
            const otherSelect = document.createElement('select');
            otherSelect.disabled = disabled;
            otherSelect.style.cssText = inputStyle + 'min-width: 140px;';
            ['Map ID', 'Party Size', 'Gold', 'Steps', 'Play Time', 'Timer', 'Save Count', 'Battle Count', 'Win Count', 'Escape Count'].forEach((o, i) => {
                const opt = document.createElement('option');
                opt.value = i;
                opt.textContent = o;
                if (i === this.param1) opt.selected = true;
                otherSelect.appendChild(opt);
            });
            otherSelect.addEventListener('change', (e) => { this.param1 = parseInt(e.target.value); });
            container.appendChild(otherSelect);
        }
    }

    buildCommand() {
        return {
            code: 122,
            indent: 0,
            parameters: [
                this.startId,
                this.endId,
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
    }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ControlVariablesEditor;
}
