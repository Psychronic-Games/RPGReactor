/**
 * LoopEditor builds structured loops entirely from stock RPG Maker commands.
 * Body command indents are stored relative to the outer loop (1 or greater).
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

    show(command, callback) {
        const parsed = LoopEditor.parse(command);
        const config = parsed?.config || { mode: 'forever' };
        const body = parsed?.body || [];
        const indent = parsed?.indent || 0;
        if (callback) callback(LoopEditor.build(config, body, indent));
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = LoopEditor;
}
