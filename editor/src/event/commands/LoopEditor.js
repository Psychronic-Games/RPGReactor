/**
 * LoopEditor builds structured loops entirely from stock RPG Maker commands.
 * Body command indents are stored relative to the outer loop (1 or greater).
 * The game has no reader of its own for the made kinds (a number of times,
 * while a variable, a range): it runs the stock commands `build` writes.
 */
class LoopEditor {
    constructor(databaseManager, projectController) {
        this.databaseManager = databaseManager;
        this.projectController = projectController;
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

    static clone(value) {
        return JSON.parse(JSON.stringify(value));
    }

    static source(type, value) {
        return type === 'variable'
            ? { type: 'variable', id: value }
            : { type: 'constant', value };
    }

    static normalizeSource(source) {
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

    static normalizeConfig(config) {
        if (!config || typeof config !== 'object' || Array.isArray(config)) return null;
        if (config.mode === 'forever' && Object.keys(config).length === 1) {
            return { mode: 'forever' };
        }
        if (config.mode === 'repeatCount' && Object.keys(config).length === 3) {
            const count = this.normalizeSource(config.count);
            const aliasesCounter = count?.type === 'variable' && count.id === config.counterVariable;
            if (Number.isInteger(config.counterVariable) && config.counterVariable >= 1 && count && !aliasesCounter) {
                return { mode: 'repeatCount', counterVariable: config.counterVariable, count };
            }
        }
        if (config.mode === 'whileVariable' && Object.keys(config).length === 4) {
            const right = this.normalizeSource(config.right);
            const comparisons = ['equal', 'notEqual', 'greater', 'greaterEqual', 'less', 'lessEqual'];
            if (Number.isInteger(config.variableId) && config.variableId >= 1 &&
                comparisons.includes(config.comparison) && right) {
                return {
                    mode: 'whileVariable',
                    variableId: config.variableId,
                    comparison: config.comparison,
                    right
                };
            }
        }
        if (config.mode === 'variableRange' && Object.keys(config).length === 5) {
            const start = this.normalizeSource(config.start);
            const end = this.normalizeSource(config.end);
            const aliasesEnd = end?.type === 'variable' && end.id === config.variableId;
            if (Number.isInteger(config.variableId) && config.variableId >= 1 && start && end &&
                !aliasesEnd && Number.isInteger(config.step) && config.step !== 0) {
                return {
                    mode: 'variableRange',
                    variableId: config.variableId,
                    start,
                    end,
                    step: config.step
                };
            }
        }
        return null;
    }

    static compileSource(source) {
        return source.type === 'variable'
            ? `Number($gameVariables.value(${source.id}))`
            : JSON.stringify(source.value);
    }

    static compileGuard(config) {
        const normalized = this.normalizeConfig(config);
        if (!normalized || normalized.mode === 'forever') {
            throw new TypeError('A generated loop guard requires a finite loop mode');
        }

        let body;
        if (normalized.mode === 'repeatCount') {
            body = `Number($gameVariables.value(${normalized.counterVariable})) >= Math.max(0, Math.floor(${this.compileSource(normalized.count)}))`;
        } else if (normalized.mode === 'whileVariable') {
            const operators = {
                equal: '===',
                notEqual: '!==',
                greater: '>',
                greaterEqual: '>=',
                less: '<',
                lessEqual: '<='
            };
            body = `!(Number($gameVariables.value(${normalized.variableId})) ${operators[normalized.comparison]} ${this.compileSource(normalized.right)})`;
        } else {
            const comparison = normalized.step > 0 ? '>' : '<';
            body = `Number($gameVariables.value(${normalized.variableId})) ${comparison} ${this.compileSource(normalized.end)}`;
        }
        return this.codec().createText('loop-control', normalized, body);
    }

    static command(code, indent, parameters) {
        return { code, indent, parameters: parameters || [] };
    }

    static controlVariable(variableId, operation, source, indent) {
        const operand = source.type === 'variable' ? 1 : 0;
        const value = source.type === 'variable' ? source.id : source.value;
        return this.command(122, indent, [variableId, variableId, operation, operand, value, 0, 0]);
    }

    static build(config, body, indent) {
        const normalized = this.normalizeConfig(config);
        const baseIndent = indent === undefined ? 0 : indent;
        const relativeBody = body === undefined ? [] : body;
        if (!normalized) throw new TypeError('Invalid loop configuration');
        if (!Number.isInteger(baseIndent) || baseIndent < 0) throw new TypeError('Invalid loop indent');
        if (!Array.isArray(relativeBody)) throw new TypeError('Loop body must be an array');

        const rebasedBody = relativeBody.map(command => {
            if (!command || typeof command !== 'object' || !Number.isInteger(command.code) ||
                !Number.isInteger(command.indent) || command.indent < 1 || !Array.isArray(command.parameters)) {
                throw new TypeError('Loop body commands must use relative indents of 1 or greater');
            }
            const copy = this.clone(command);
            copy.indent += baseIndent;
            return copy;
        });

        if (normalized.mode === 'forever') {
            return [
                this.command(112, baseIndent),
                ...rebasedBody,
                this.command(413, baseIndent)
            ];
        }

        const commands = [];
        if (normalized.mode === 'repeatCount') {
            commands.push(this.controlVariable(
                normalized.counterVariable,
                0,
                { type: 'constant', value: 0 },
                baseIndent
            ));
        } else if (normalized.mode === 'variableRange') {
            commands.push(this.controlVariable(normalized.variableId, 0, normalized.start, baseIndent));
        }

        commands.push(this.command(112, baseIndent));
        commands.push(this.command(111, baseIndent + 1, [12, this.compileGuard(normalized)]));
        commands.push(this.command(113, baseIndent + 2));
        commands.push(this.command(412, baseIndent + 1));
        commands.push(...rebasedBody);

        if (normalized.mode === 'repeatCount') {
            commands.push(this.controlVariable(
                normalized.counterVariable,
                1,
                { type: 'constant', value: 1 },
                baseIndent + 1
            ));
        } else if (normalized.mode === 'variableRange') {
            commands.push(this.controlVariable(
                normalized.variableId,
                normalized.step > 0 ? 1 : 2,
                { type: 'constant', value: Math.abs(normalized.step) },
                baseIndent + 1
            ));
        }
        commands.push(this.command(413, baseIndent));
        return commands;
    }

    static buildLoop(config, body, indent) {
        return this.build(config, body, indent);
    }

    static parse(input) {
        if (input && !Array.isArray(input) && (input.code === 112 || input.code === 413)) {
            const indent = Number.isInteger(input.indent) && input.indent >= 0 ? input.indent : 0;
            return { config: { mode: 'forever' }, body: [], indent, generated: false };
        }
        if (!Array.isArray(input) || input.length < 2) return null;

        const commands = this.clone(input);
        const loopIndex = commands[0].code === 122 ? 1 : 0;
        const loop = commands[loopIndex];
        if (!loop || loop.code !== 112 || !Number.isInteger(loop.indent) || loop.indent < 0) return null;
        const baseIndent = loop.indent;
        const condition = commands[loopIndex + 1];
        const marker = this.codec().parseCommand(condition, 'loop-control');

        if (marker) {
            const config = this.normalizeConfig(marker.data);
            if (config && config.mode !== 'forever') {
                let empty;
                try {
                    empty = this.build(config, [], baseIndent);
                } catch (_error) {
                    empty = null;
                }
                if (empty) {
                    const prefixLength = empty.findIndex(command => command.code === 412) + 1;
                    const suffixLength = empty.length - prefixLength;
                    const bodyEnd = commands.length - suffixLength;
                    const prefixMatches = JSON.stringify(commands.slice(0, prefixLength)) ===
                        JSON.stringify(empty.slice(0, prefixLength));
                    const suffixMatches = bodyEnd >= prefixLength &&
                        JSON.stringify(commands.slice(bodyEnd)) === JSON.stringify(empty.slice(prefixLength));
                    if (prefixMatches && suffixMatches) {
                        const absoluteBody = commands.slice(prefixLength, bodyEnd);
                        if (absoluteBody.every(command => Number.isInteger(command.indent) &&
                            command.indent > baseIndent && Array.isArray(command.parameters))) {
                            const body = absoluteBody.map(command => {
                                const copy = this.clone(command);
                                copy.indent -= baseIndent;
                                return copy;
                            });
                            if (JSON.stringify(this.build(config, body, baseIndent)) === JSON.stringify(commands)) {
                                return { config, body, indent: baseIndent, generated: true };
                            }
                        }
                    }
                }
            }
        }

        if (loopIndex !== 0 || commands[commands.length - 1].code !== 413 ||
            commands[commands.length - 1].indent !== baseIndent) {
            return null;
        }
        const absoluteBody = commands.slice(1, -1);
        if (!absoluteBody.every(command => Number.isInteger(command.indent) &&
            command.indent > baseIndent && Array.isArray(command.parameters))) {
            return null;
        }
        const body = absoluteBody.map(command => {
            const copy = this.clone(command);
            copy.indent -= baseIndent;
            return copy;
        });
        return { config: { mode: 'forever' }, body, indent: baseIndent, generated: false };
    }

    static parseLoop(input) {
        return this.parse(input);
    }

    static findBlockRange(commands, index) {
        if (!Array.isArray(commands) || !Number.isInteger(index) || index < 0 || index >= commands.length) {
            return null;
        }
        const stack = [];
        const ranges = [];
        commands.forEach((command, commandIndex) => {
            if (command && command.code === 112) {
                stack.push(commandIndex);
            } else if (command && command.code === 413 && stack.length) {
                ranges.push({ start: stack.pop(), end: commandIndex });
            }
        });
        const containing = ranges.filter(range => range.start <= index && index <= range.end);
        containing.sort((a, b) => (a.end - a.start) - (b.end - b.start));
        return containing[0] || null;
    }

    // ---- The dialog: the four kinds of loop ----

    static modes() {
        return [
            { value: 'forever', label: 'Until Break Loop' },
            { value: 'repeatCount', label: 'A number of times' },
            { value: 'whileVariable', label: 'While a variable' },
            { value: 'variableRange', label: 'Count a variable from one value to another' }
        ];
    }

    static comparisons() {
        return [
            { value: 'equal', label: '=' },
            { value: 'notEqual', label: '≠' },
            { value: 'greater', label: '>' },
            { value: 'greaterEqual', label: '≥' },
            { value: 'less', label: '<' },
            { value: 'lessEqual', label: '≤' }
        ];
    }

    /** What each kind starts with when the author picks it. */
    static defaultConfig(mode) {
        if (mode === 'repeatCount') {
            return { mode, counterVariable: 1, count: { type: 'constant', value: 5 } };
        }
        if (mode === 'whileVariable') {
            return { mode, variableId: 1, comparison: 'less', right: { type: 'constant', value: 10 } };
        }
        if (mode === 'variableRange') {
            return { mode, variableId: 1, start: { type: 'constant', value: 1 }, end: { type: 'constant', value: 10 }, step: 1 };
        }
        return { mode: 'forever' };
    }

    /** Why `config` cannot be written, in words for the author; '' when it can. */
    static configProblem(config) {
        if (this.normalizeConfig(config)) return '';
        if (config && config.mode === 'repeatCount' && config.count && config.count.type === 'variable' &&
            config.count.id === config.counterVariable) {
            return 'The counter cannot be the same variable as the number of times.';
        }
        if (config && config.mode === 'variableRange' && config.end && config.end.type === 'variable' &&
            config.end.id === config.variableId) {
            return 'The variable that counts cannot also be the value it counts to.';
        }
        if (config && config.mode === 'variableRange' && !(Number.isInteger(config.step) && config.step !== 0)) {
            return 'Step must be a whole number other than 0.';
        }
        return 'This loop is not filled in completely.';
    }

    /**
     * The list's words for the row that ends a made loop (the Conditional
     * Branch right under Loop). `variable(id)` and `format(text, params)`
     * come from the list; null when the row is not such a guard.
     */
    static guardText(command, variable, format) {
        let marker = null;
        try {
            marker = this.codec().parseCommand(command, 'loop-control');
        } catch (_error) {
            marker = null;
        }
        const config = marker ? this.normalizeConfig(marker.data) : null;
        if (!config || config.mode === 'forever') return null;
        const value = source => source.type === 'variable' ? variable(source.id) : String(source.value);
        if (config.mode === 'repeatCount') {
            return format('Loop ends after {count} times (counted in {variable})',
                { count: value(config.count), variable: variable(config.counterVariable) });
        }
        if (config.mode === 'whileVariable') {
            const sign = this.comparisons().find(item => item.value === config.comparison).label;
            return format('Loop goes on while {variable} {comparison} {value}',
                { variable: variable(config.variableId), comparison: sign, value: value(config.right) });
        }
        return format('Loop counts {variable} from {start} to {end}, step {step}', {
            variable: variable(config.variableId), start: value(config.start), end: value(config.end),
            step: config.step
        });
    }

    /**
     * Take in the loop to edit (its block of commands), or null for a new
     * one. False when the block cannot be read as a loop: it is then left alone.
     */
    open(command) {
        const parsed = command == null ? null : LoopEditor.parse(command);
        if (command != null && !parsed) return false;
        this.isNew = command == null;
        this.config = LoopEditor.clone(parsed ? parsed.config : { mode: 'forever' });
        this.originalMode = this.config.mode;
        this.body = parsed ? parsed.body : [];
        this.indent = parsed ? parsed.indent : 0;
        // Each kind keeps what was typed for it while the author tries another.
        this.drafts = { [this.config.mode]: this.config };
        return true;
    }

    setMode(mode) {
        if (!this.drafts[mode]) this.drafts[mode] = LoopEditor.defaultConfig(mode);
        this.config = this.drafts[mode];
    }

    /** The commands for what the dialog holds, or null (with a notice) when it cannot be written. */
    buildCommands() {
        const tt = text => (typeof window !== 'undefined' && window.I18n ? window.I18n.tText(text) : text);
        const problem = LoopEditor.configProblem(this.config);
        if (problem) {
            if (typeof RRDialog !== 'undefined') RRDialog.alert(tt(problem), { title: tt('Loop'), kind: 'warning' });
            return null;
        }
        let body = this.body;
        const isEmptyRow = command => !!command && command.code === 0 && command.indent === 1;
        const stepsAfterBody = mode => mode === 'repeatCount' || mode === 'variableRange';
        if (this.isNew && this.config.mode === 'forever') {
            // A new plain loop holds the empty row RPG Maker MZ writes in a
            // body. The made kinds do not: their body is followed by the
            // row that steps the variable, and an empty row cannot sit before it.
            body = [{ code: 0, indent: 1, parameters: [] }];
        } else if (stepsAfterBody(this.config.mode) && !stepsAfterBody(this.originalMode) &&
            isEmptyRow(body[body.length - 1])) {
            // For the same reason a body's empty last row goes when a loop
            // is changed to a kind that steps a variable after the body.
            body = body.slice(0, -1);
        }
        return LoopEditor.build(this.config, body, this.indent);
    }

    show(command, callback) {
        this.callback = callback;
        if (!this.open(command)) return;
        if (!this.modal) this.createModal();
        this.renderContent();
        this.modal.style.display = 'flex';
    }

    createModal() {
        this.modal = document.createElement('div');
        this.modal.className = 'loop-editor-modal';
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
        container.className = 'loop-editor-container rr-modal';
        container.style.cssText = 'width: min(460px, calc(100vw - 24px)); max-height: 92vh;';
        this.modal.appendChild(container);
        document.body.appendChild(this.modal);
    }

    renderContent() {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        const container = this.modal.querySelector('.loop-editor-container');
        container.innerHTML = '';

        const header = document.createElement('div');
        header.className = 'rr-modal-header';
        header.innerHTML = `
            <div class="rr-modal-title">${tt('Loop')}</div>
            <button class="rr-modal-close close-btn" type="button">×</button>
        `;
        container.appendChild(header);
        header.querySelector('.close-btn').addEventListener('click', () => this.close());

        const content = document.createElement('div');
        content.style.cssText = `
            padding: 16px;
            display: flex;
            flex-direction: column;
            gap: 12px;
            overflow-y: auto;
            min-height: 0;
        `;

        const config = this.config;
        const modeSelect = document.createElement('select');
        LoopEditor.modes().forEach(mode => {
            const option = document.createElement('option');
            option.value = mode.value;
            option.textContent = tt(mode.label);
            option.selected = config.mode === mode.value;
            modeSelect.appendChild(option);
        });
        modeSelect.addEventListener('change', event => {
            this.setMode(event.target.value);
            this.renderContent();
        });
        content.appendChild(this._row(tt('Repeat'), [modeSelect]));

        const help = text => {
            const note = document.createElement('div');
            note.className = 'rr-command-help';
            note.textContent = tt(text);
            content.appendChild(note);
        };
        if (config.mode === 'forever') {
            help('The commands inside repeat until a Break Loop command runs.');
        } else if (config.mode === 'repeatCount') {
            content.appendChild(this._row(tt('Times'), this._sourceControls(config.count, source => { config.count = source; })));
            content.appendChild(this._row(tt('Counter'), this._variableControls(config.counterVariable, id => { config.counterVariable = id; })));
            help('The counter is a variable this loop uses to count: it is set to 0 before the loop and goes up by 1 after each time round.');
        } else if (config.mode === 'whileVariable') {
            const comparison = document.createElement('select');
            LoopEditor.comparisons().forEach(item => {
                const option = document.createElement('option');
                option.value = item.value;
                option.textContent = item.label;
                option.selected = config.comparison === item.value;
                comparison.appendChild(option);
            });
            comparison.addEventListener('change', event => { config.comparison = event.target.value; });
            content.appendChild(this._row(tt('Variable'), this._variableControls(config.variableId, id => { config.variableId = id; })));
            content.appendChild(this._row(tt('Is'), [comparison, ...this._sourceControls(config.right, source => { config.right = source; })]));
            help('Checked before each time round. The commands inside must change the variable, or the loop never ends.');
        } else {
            const step = document.createElement('input');
            step.type = 'number';
            step.step = 1;
            step.value = config.step;
            step.addEventListener('input', event => {
                const typed = Number(event.target.value);
                config.step = event.target.value !== '' && Number.isFinite(typed) ? typed : 0;
            });
            content.appendChild(this._row(tt('Variable'), this._variableControls(config.variableId, id => { config.variableId = id; })));
            content.appendChild(this._row(tt('From'), this._sourceControls(config.start, source => { config.start = source; })));
            content.appendChild(this._row(tt('To'), this._sourceControls(config.end, source => { config.end = source; })));
            content.appendChild(this._row(tt('Step'), [step]));
            help('The variable is set to From before the loop and changes by Step after each time round. The loop ends once it has passed To. Use a negative Step to count down.');
        }
        container.appendChild(content);

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

    _row(labelText, controls) {
        const row = document.createElement('div');
        row.className = 'rr-expression-source';
        row.style.cssText = 'display: flex; align-items: center; gap: 8px;';
        const label = document.createElement('span');
        label.className = 'rr-command-inline-label';
        label.style.minWidth = '70px';
        label.textContent = `${labelText}:`;
        row.appendChild(label);
        controls.forEach(control => row.appendChild(control));
        return row;
    }

    /** A variable's number with the "..." that opens the variable picker. */
    _variableControls(id, onChange) {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        const input = document.createElement('input');
        input.type = 'number';
        input.min = 1;
        input.step = 1;
        input.value = id;
        input.addEventListener('input', event => {
            onChange(Math.max(1, parseInt(event.target.value, 10) || 1));
        });
        const browse = document.createElement('button');
        browse.type = 'button';
        browse.textContent = '...';
        browse.className = 'rr-btn-browse';
        browse.setAttribute('aria-label', `${tt('Select')} ${tt('Variable')}`);
        browse.addEventListener('click', () => {
            const picker = new SwitchVariablePicker(this.databaseManager, this.projectController);
            picker.show('variable', Math.max(1, parseInt(input.value, 10) || 1), selectedId => {
                if (selectedId) {
                    onChange(selectedId);
                    this.renderContent();
                }
            });
        });
        return [input, browse];
    }

    /** A number or a variable: the kind, then its value. */
    _sourceControls(source, onChange) {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        const type = document.createElement('select');
        [{ value: 'constant', label: 'Constant' }, { value: 'variable', label: 'Variable' }].forEach(item => {
            const option = document.createElement('option');
            option.value = item.value;
            option.textContent = tt(item.label);
            option.selected = source.type === item.value;
            type.appendChild(option);
        });
        type.addEventListener('change', event => {
            onChange(event.target.value === 'variable' ? { type: 'variable', id: 1 } : { type: 'constant', value: 0 });
            this.renderContent();
        });
        if (source.type === 'variable') {
            return [type, ...this._variableControls(source.id, id => { source.id = id; onChange(source); })];
        }
        const value = document.createElement('input');
        value.type = 'number';
        value.value = source.value;
        value.addEventListener('input', event => {
            const typed = Number(event.target.value);
            source.value = event.target.value !== '' && Number.isFinite(typed) ? typed : 0;
        });
        return [type, value];
    }

    save() {
        if (this.callback) {
            const commands = this.buildCommands();
            // Refused (after the notice): the dialog stays open with what was typed.
            if (!commands) return;
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

if (typeof module !== 'undefined' && module.exports) {
    module.exports = LoopEditor;
}
