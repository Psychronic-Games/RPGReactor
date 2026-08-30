/**
 * PluginCommandEditor - Editor for Plugin Command event command (code 357)
 * Dynamically loads plugins from reactor_plugins.js and parses @command annotations
 */
class PluginCommandEditor {
    constructor(databaseManager, projectController) {
        console.log('PluginCommandEditor constructor called');
        this.databaseManager = databaseManager;
        this.projectController = projectController;
        this.modal = null;
        this.callback = null;
        this.pluginName = '';
        this.commandName = '';
        this.commandText = ''; // Display label stored in params[2]
        this.args = {};
        this.existingArgumentCommands = [];

        // Cached plugin data
        this.availablePlugins = [];
        this.pluginCommands = {}; // pluginName -> array of command definitions
        this.selectedPlugin = null;
        this.selectedCommand = null;

        const host = typeof window !== 'undefined' ? window.RPGReactorHost : null;
        if (host?.fs && host?.path) {
            this.fs = host.fs;
            this.path = host.path;
        }

        // Node.js modules for file reading (NW.js environment)
        if (!this.fs && typeof nw !== 'undefined') {
            this.fs = require('fs');
            this.path = require('path');
        }
    }

    /**
     * Show editor for a plugin command
     * @param {object} command - The command to edit (or null for new)
     * @param {function} callback - Callback when done editing
     */
    show(command, callback, context = null) {
        console.log('PluginCommandEditor.show() called with command:', command);
        this.callback = callback;
        this.selectedPlugin = null;
        this.selectedCommand = null;
        this.existingArgumentCommands = Array.isArray(context?.continuationCommands)
            ? context.continuationCommands.filter(row => row?.code === 657 &&
                typeof row.parameters?.[0] === 'string')
            : [];

        if (command && (command.code === 356 || command.code === 357)) {
            const params = command.parameters;
            // Classic MV-style: code 356 with only a text string (no structured command name)
            if (command.code === 356 && (params.length <= 1 || !params[1])) {
                this.classicMode = true;
                this.classicText = params[0] || '';
                this.pluginName = '';
                this.commandName = '';
                this.args = {};
            } else {
                this.classicMode = false;
                this.classicText = '';
                this.pluginName = params[0] || '';
                this.commandName = params[1] || '';
                // params[2] is the command's display label, taken from the
                // plugin's @text annotation. Keep whatever the command already
                // carries so reopening it cannot blank the label.
                this.commandText = typeof params[2] === 'string' ? params[2] : '';
                const loadedArgs = params[3] && typeof params[3] === 'object'
                    ? JSON.parse(JSON.stringify(params[3]))
                    : {};
                this.args = Object.fromEntries(Object.entries(loadedArgs).map(([key, value]) =>
                    [key, this.storedArgumentValue(value)]
                ));
            }
        } else {
            this.classicMode = false;
            this.classicText = '';
            this.pluginName = '';
            this.commandName = '';
            this.commandText = '';
            this.args = {};
        }

        if (!this.modal) {
            console.log('Creating modal for first time');
            this.createModal();
        }

        console.log('Showing modal with loading state');
        // Show modal immediately with loading state
        this.modal.style.display = 'flex';
        this.showLoadingState();

        // Load available plugins asynchronously
        console.log('Starting to load plugins...');
        this.loadAvailablePlugins().then(() => {
            console.log('Plugins loaded, rendering content');
            this.renderContent();
        }).catch(err => {
            console.error('Error loading plugins:', err);
            this.showErrorState(err);
        });
    }

    /**
     * Show loading state while plugins are being loaded
     */
    showLoadingState() {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        const container = this.modal.querySelector('.plugin-command-container');
        container.innerHTML = '';

        // Header
        const header = document.createElement('div');
        header.className = 'rr-modal-header';
        header.innerHTML = `
            <div class="rr-modal-title">${tt('Plugin Command')}</div>
            <button class="rr-modal-close close-btn" type="button">×</button>
        `;
        container.appendChild(header);

        header.querySelector('.close-btn').addEventListener('click', () => this.close());

        // Loading content
        const content = document.createElement('div');
        content.style.cssText = `
            padding: 40px 16px;
            display: flex;
            flex-direction: column;
            gap: 16px;
            align-items: center;
            justify-content: center;
            color: var(--color-text);
        `;
        content.innerHTML = `
            <div style="font-size: 14px;">${tt('Loading plugins...')}</div>
        `;
        container.appendChild(content);
    }

    /**
     * Show error state if plugin loading fails
     */
    showErrorState(err) {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        const container = this.modal.querySelector('.plugin-command-container');
        container.innerHTML = '';

        // Header
        const header = document.createElement('div');
        header.className = 'rr-modal-header';
        header.innerHTML = `
            <div class="rr-modal-title">${tt('Plugin Command')}</div>
            <button class="rr-modal-close close-btn" type="button">×</button>
        `;
        container.appendChild(header);

        header.querySelector('.close-btn').addEventListener('click', () => this.close());

        // Error content
        const content = document.createElement('div');
        content.style.cssText = `
            padding: 40px 16px;
            display: flex;
            flex-direction: column;
            gap: 16px;
            color: #ff6666;
        `;
        const heading = document.createElement('div');
        heading.style.cssText = 'font-size: 14px; font-weight: bold;';
        heading.textContent = tt('Error loading plugins');
        const detail = document.createElement('div');
        detail.style.cssText = 'font-size: 12px; color: var(--color-text);';
        detail.textContent = tt(err.message || String(err));
        const hint = document.createElement('div');
        hint.style.cssText = 'font-size: 11px; color: var(--color-text-muted);';
        hint.textContent = tt('Make sure your project has a plugins file (reactor_plugins.js or plugins.js).');
        content.append(heading, detail, hint);
        container.appendChild(content);

        // Footer
        const footer = document.createElement('div');
        footer.className = 'rr-modal-footer';

        const closeBtn = document.createElement('button');
        closeBtn.textContent = tt('Close');
        closeBtn.className = 'rr-btn-secondary';
        closeBtn.addEventListener('click', () => this.close());

        footer.appendChild(closeBtn);
        container.appendChild(footer);
    }

    /**
     * Load available plugins from reactor_plugins.js
     */
    async loadAvailablePlugins() {
        // If already loaded, skip
        if (this.availablePlugins.length > 0) {
            console.log('Plugins already loaded, using cached data');
            return;
        }

        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        try {
            const currentProject = this.projectController.getCurrentProject();
            console.log('Current project:', currentProject);

            if (!currentProject || !currentProject.path) {
                throw new Error(tt('No project loaded'));
            }

            const projectPath = currentProject.path;
            console.log('Project path:', projectPath);

            // Determine plugins file based on corescript type
            const usesReactorCorescript = this.fs.existsSync(this.path.join(projectPath, 'js', 'reactor_main.js'));
            const pluginsFile = usesReactorCorescript ? 'reactor_plugins.js' : 'plugins.js';
            const pluginsPath = this.path.join(projectPath, 'js', pluginsFile);
            console.log('Loading plugins from:', pluginsPath);

            if (!this.fs.existsSync(pluginsPath)) {
                throw new Error(`${tt('Plugins file not found:')} ${pluginsFile}`);
            }

            const text = this.fs.readFileSync(pluginsPath, 'utf8');

            // Extract the $plugins array
            const pluginsMatch = text.match(/var\s+\$plugins\s*=\s*(\[[\s\S]*\]);/);
            if (!pluginsMatch) {
                throw new Error(tt('Could not parse plugins file - no $plugins array found'));
            }

            const pluginsArray = JSON.parse(pluginsMatch[1]);
            console.log('Found plugins:', pluginsArray.length);

            // Filter to enabled plugins only
            this.availablePlugins = pluginsArray.filter(p => p.status === true);
            console.log('Enabled plugins:', this.availablePlugins.length);

            // Load command definitions for each plugin
            for (const plugin of this.availablePlugins) {
                await this.loadPluginCommands(plugin.name, projectPath);
            }

            console.log('Plugins loaded successfully');
        } catch (err) {
            console.error('Error loading plugins:', err);
            throw err;
        }
    }

    /**
     * Load and parse command definitions from a plugin file
     */
    async loadPluginCommands(pluginName, projectPath) {
        try {
            const pluginPath = this.path.join(projectPath, 'js', 'plugins', `${pluginName}.js`);

            if (!this.fs.existsSync(pluginPath)) {
                console.warn(`Plugin file not found: ${pluginPath}`);
                this.pluginCommands[pluginName] = [];
                return;
            }

            const text = this.fs.readFileSync(pluginPath, 'utf8');

            // Parse @command annotations
            const commands = this.parsePluginCommands(text);
            this.pluginCommands[pluginName] = commands;
        } catch (err) {
            console.error(`Error loading plugin ${pluginName}:`, err);
            this.pluginCommands[pluginName] = [];
        }
    }

    /**
     * Parse @command annotations from plugin source code
     */
    parsePluginCommands(pluginSource) {
        const commands = [];
        const structDefinitions = RRPluginAnnotations.parseStructDefinitions(pluginSource);

        // Split into comment blocks
        const commentBlocks = pluginSource.match(/\/\*:[\s\S]*?\*\//g) || [];

        for (const block of commentBlocks) {
            const lines = block.split('\n');
            let currentCommand = null;
            let currentArg = null;

            for (const line of lines) {
                const tokens = RRPluginAnnotations.splitLine(RRPluginAnnotations.normalizeLine(line));
                for (const token of tokens) {
                    if (token.tag === 'command') {
                        if (currentCommand) commands.push(currentCommand);
                        currentCommand = token.value ? {
                            name: token.value,
                            text: '',
                            desc: '',
                            args: []
                        } : null;
                        currentArg = null;
                        continue;
                    }
                    if (!currentCommand) continue;
                    if (token.tag === 'arg') {
                        currentArg = token.value
                            ? { ...RRPluginAnnotations.blankSchema(), name: token.value, default: '', dir: '' }
                            : null;
                        if (currentArg) currentCommand.args.push(currentArg);
                        continue;
                    }
                    if (currentArg) {
                        RRPluginAnnotations.applyToSchema(currentArg, token.tag, token.value);
                    } else if (token.tag === 'text') {
                        currentCommand.text = token.value;
                    } else if (token.tag === 'desc') {
                        currentCommand.desc = currentCommand.desc
                            ? `${currentCommand.desc} ${token.value}`
                            : token.value;
                    }
                }
            }

            if (currentCommand) {
                commands.push(currentCommand);
            }
        }

        for (const command of commands) command.structDefinitions = structDefinitions;
        console.log('Parsed commands:', commands);
        return commands;
    }

    /**
     * Create modal structure
     */
    createModal() {
        this.modal = document.createElement('div');
        this.modal.className = 'plugin-command-editor-modal';
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
        container.className = 'plugin-command-container rr-modal';
        container.style.cssText = `width: min(650px, calc(100vw - 24px)); max-height: 90vh;`;

        this.modal.appendChild(container);

        document.body.appendChild(this.modal);
    }

    /**
     * Render modal content
     */
    renderContent() {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        const container = this.modal.querySelector('.plugin-command-container');
        container.innerHTML = '';

        // Header
        const header = document.createElement('div');
        header.className = 'rr-modal-header';
        header.innerHTML = `
            <div class="rr-modal-title">${tt('Plugin Command')}</div>
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
            gap: 16px;
            overflow-y: auto;
            flex: 1;
        `;

        // Classic mode checkbox
        const classicRow = document.createElement('label');
        classicRow.style.cssText = `
            display: flex;
            align-items: center;
            gap: 8px;
            color: var(--color-text);
            font-size: 13px;
            cursor: pointer;
            user-select: none;
        `;
        const classicCheckbox = document.createElement('input');
        classicCheckbox.type = 'checkbox';
        classicCheckbox.checked = this.classicMode;
        classicCheckbox.style.cssText = 'cursor: pointer;';
        classicCheckbox.addEventListener('change', (e) => {
            this.classicMode = e.target.checked;
            if (this.classicMode) {
                this.classicText = this.classicText || '';
            }
            this.renderContent();
        });
        classicRow.appendChild(classicCheckbox);
        classicRow.appendChild(document.createTextNode(tt('Classic Plugin Command (MV-style text command)')));
        content.appendChild(classicRow);

        if (this.classicMode) {
            // Classic mode: single textarea for raw command text
            const classicSection = document.createElement('div');
            classicSection.style.cssText = 'display: flex; flex-direction: column; gap: 8px;';

            const classicLabel = document.createElement('div');
            classicLabel.textContent = tt('Command Text:');
            classicLabel.style.cssText = 'color: var(--color-text); font-size: 13px; font-weight: bold;';
            classicSection.appendChild(classicLabel);

            const classicTextarea = document.createElement('textarea');
            classicTextarea.rows = 3;
            classicTextarea.value = this.classicText;
            classicTextarea.placeholder = 'PluginName arg1 arg2 ...';
            classicTextarea.style.cssText = `
                padding: 8px 10px;
                background-color: var(--color-bg-input);
                color: var(--color-text);
                border: 1px solid var(--color-border-input);
                border-radius: 3px;
                font-size: 13px;
                font-family: monospace;
                resize: vertical;
                width: 100%;
                box-sizing: border-box;
            `;
            classicTextarea.addEventListener('input', (e) => {
                this.classicText = e.target.value;
            });
            classicSection.appendChild(classicTextarea);

            const hint = document.createElement('div');
            hint.style.cssText = 'color: var(--color-text-muted); font-size: 11px; line-height: 1.4;';
            hint.textContent = tt('Enter the full plugin command as a single line, e.g. FogEffect 1 Fog_Image 80 100 3 3');
            classicSection.appendChild(hint);

            content.appendChild(classicSection);
            container.appendChild(content);

            // Footer (reused below)
            this._appendFooter(container);
            return;
        }

        // MZ mode: Plugin dropdown
        const pluginSection = document.createElement('div');
        pluginSection.style.cssText = 'display: flex; flex-direction: column; gap: 8px;';

        const pluginLabel = document.createElement('div');
        pluginLabel.textContent = tt('Plugin:');
        pluginLabel.style.cssText = 'color: var(--color-text); font-size: 13px; font-weight: bold;';
        pluginSection.appendChild(pluginLabel);

        const pluginSelect = document.createElement('select');
        pluginSelect.style.cssText = `
            padding: 8px 12px;
            background-color: var(--color-bg-input);
            color: var(--color-text);
            border: 1px solid var(--color-border-input);
            border-radius: 3px;
            font-size: 13px;
            cursor: pointer;
        `;

        const pluginDefaultOption = document.createElement('option');
        pluginDefaultOption.value = '';
        pluginDefaultOption.textContent = tt('-- Select Plugin --');
        pluginSelect.appendChild(pluginDefaultOption);

        const sortedPlugins = this.availablePlugins.slice().sort((a, b) =>
            a.name.toLowerCase().localeCompare(b.name.toLowerCase())
        );

        for (const plugin of sortedPlugins) {
            const option = document.createElement('option');
            option.value = plugin.name;
            option.textContent = `${plugin.name} - ${plugin.description}`;
            if (plugin.name === this.pluginName) {
                option.selected = true;
                this.selectedPlugin = plugin;
            }
            pluginSelect.appendChild(option);
        }

        pluginSelect.addEventListener('change', (e) => {
            this.pluginName = e.target.value;
            this.commandName = '';
            this.commandText = '';
            this.args = {};
            this.selectedPlugin = this.availablePlugins.find(p => p.name === this.pluginName);
            this.selectedCommand = null;
            this.renderContent();
        });

        pluginSection.appendChild(pluginSelect);
        content.appendChild(pluginSection);

        // Command dropdown (only if plugin selected)
        if (this.pluginName && this.pluginCommands[this.pluginName]) {
            const commandSection = document.createElement('div');
            commandSection.style.cssText = 'display: flex; flex-direction: column; gap: 8px;';

            const commandLabel = document.createElement('div');
            commandLabel.textContent = tt('Command:');
            commandLabel.style.cssText = 'color: var(--color-text); font-size: 13px; font-weight: bold;';
            commandSection.appendChild(commandLabel);

            const commandSelect = document.createElement('select');
            commandSelect.style.cssText = `
                padding: 8px 12px;
                background-color: var(--color-bg-input);
                color: var(--color-text);
                border: 1px solid var(--color-border-input);
                border-radius: 3px;
                font-size: 13px;
                cursor: pointer;
            `;

            const commandDefaultOption = document.createElement('option');
            commandDefaultOption.value = '';
            commandDefaultOption.textContent = tt('-- Select Command --');
            commandSelect.appendChild(commandDefaultOption);

            const commands = this.pluginCommands[this.pluginName];
            for (const cmd of commands) {
                const option = document.createElement('option');
                option.value = cmd.name;
                option.textContent = cmd.text || cmd.name;
                if (cmd.name === this.commandName) {
                    option.selected = true;
                    this.selectedCommand = cmd;
                }
                commandSelect.appendChild(option);
            }

            commandSelect.addEventListener('change', (e) => {
                this.commandName = e.target.value;
                this.selectedCommand = commands.find(c => c.name === this.commandName);
                this.commandText = (this.selectedCommand && this.selectedCommand.text) || '';

                // Initialize args with defaults
                this.args = {};
                if (this.selectedCommand) {
                    for (const arg of this.selectedCommand.args) {
                        this.args[arg.name] = this.convertArgValue(arg.default, arg.type);
                    }
                }

                this.renderContent();
            });

            commandSection.appendChild(commandSelect);
            content.appendChild(commandSection);

            // Command description
            if (this.selectedCommand && this.selectedCommand.desc) {
                const descSection = document.createElement('div');
                descSection.style.cssText = `
                    padding: 10px;
                    background-color: var(--color-bg-list-item);
                    border-left: 3px solid var(--color-link);
                    border-radius: 3px;
                    color: var(--color-text-muted);
                    font-size: 12px;
                    line-height: 1.4;
                `;
                descSection.textContent = this.selectedCommand.desc;
                content.appendChild(descSection);
            }

            // Argument inputs (only if command selected)
            if (this.selectedCommand && this.selectedCommand.args.length > 0) {
                const argsContainer = document.createElement('div');
                argsContainer.style.cssText = 'display: flex; flex-direction: column; gap: 12px;';

                for (const arg of this.selectedCommand.args) {
                    const argSection = this.createArgumentInput(arg);
                    argsContainer.appendChild(argSection);
                }

                content.appendChild(argsContainer);
            }
        }

        container.appendChild(content);

        this._appendFooter(container);
    }

    /**
     * Append OK/Cancel footer to the container
     */
    _appendFooter(container) {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
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
     * Create input field for a command argument
     */
    complexParameterEditor() {
        if (this._complexParameterEditor) return this._complexParameterEditor;
        if (typeof window !== 'undefined' && window.reactor?.pluginManager) {
            return window.reactor.pluginManager;
        }
        if (typeof PluginManager !== 'undefined') {
            this._complexParameterEditor = new PluginManager(this.projectController);
            return this._complexParameterEditor;
        }
        return null;
    }

    pluginWidgetContext(tt) {
        const options = {
            projectController: this.projectController,
            database: this.databaseManager,
            fs: this.fs,
            path: this.path,
            tt,
            zIndex: 10010
        };
        return typeof RRPluginParamWidgets !== 'undefined' && RRPluginParamWidgets.buildContext
            ? RRPluginParamWidgets.buildContext(options)
            : options;
    }

    createArgumentInput(arg) {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        const section = document.createElement('div');
        section.style.cssText = 'display: flex; flex-direction: column; gap: 6px;';

        const label = document.createElement('div');
        label.style.cssText = 'color: var(--color-text); font-size: 12px; font-weight: bold;';
        label.textContent = arg.text || arg.name;

        if (arg.desc) {
            const desc = document.createElement('div');
            desc.style.cssText = 'color: var(--color-text-muted); font-size: 11px; margin-top: 2px;';
            desc.textContent = arg.desc;
            label.appendChild(desc);
        }

        section.appendChild(label);

        let input;
        const argType = String(arg.type || 'string');
        const rawValue = this.args[arg.name] !== undefined ? this.args[arg.name] : arg.default;
        const currentValue = ['boolean', 'number'].includes(argType)
            ? this.convertArgValue(rawValue, argType)
            : rawValue;
        if (['boolean', 'number'].includes(argType)) this.args[arg.name] = currentValue;

        const choiceWidget = typeof RRPluginParamWidgets !== 'undefined'
            ? RRPluginParamWidgets.create({
                schema: arg,
                value: currentValue,
                onChange: newValue => { this.args[arg.name] = newValue; },
                context: this.pluginWidgetContext(tt)
            })
            : null;
        if (choiceWidget) {
            section.appendChild(choiceWidget);
            return section;
        }

        if (argType.includes('struct<') || argType.includes('[]')) {
            const row = document.createElement('div');
            row.className = 'plugin-command-complex-argument';
            row.style.cssText = 'display:flex;gap:6px;align-items:center;min-width:0;';
            const rawInput = document.createElement('input');
            rawInput.type = 'text';
            rawInput.value = String(currentValue ?? '');
            rawInput.style.cssText = 'flex:1;min-width:0;padding:6px 10px;background-color:var(--color-bg-input);color:var(--color-text);border:1px solid var(--color-border-input);border-radius:3px;font-size:12px;';
            rawInput.addEventListener('input', event => {
                this.args[arg.name] = event.target.value;
            });
            const editButton = document.createElement('button');
            editButton.type = 'button';
            editButton.className = 'rr-btn-browse plugin-command-complex-edit';
            editButton.textContent = tt('Edit...');
            editButton.addEventListener('click', () => {
                const editor = this.complexParameterEditor();
                if (!editor) {
                    console.error('PluginManager is unavailable for complex command arguments.');
                    return;
                }
                editor.showComplexParameterEditor({
                    key: arg.name,
                    value: this.args[arg.name] ?? rawInput.value,
                    schema: arg,
                    structDefinitions: this.selectedCommand?.structDefinitions || {},
                    onCommit: serialized => {
                        const stored = String(serialized ?? '');
                        this.args[arg.name] = stored;
                        rawInput.value = stored;
                    }
                });
            });
            row.appendChild(rawInput);
            row.appendChild(editButton);
            section.appendChild(row);
            return section;
        }

        switch (arg.type) {
            case 'boolean':
                input = document.createElement('select');
                input.style.cssText = `
                    padding: 6px 10px;
                    background-color: var(--color-bg-input);
                    color: var(--color-text);
                    border: 1px solid var(--color-border-input);
                    border-radius: 3px;
                    font-size: 12px;
                    cursor: pointer;
                `;

                const trueOption = document.createElement('option');
                trueOption.value = 'true';
                trueOption.textContent = arg.on ?? tt('True');
                trueOption.selected = currentValue === 'true' || currentValue === true;

                const falseOption = document.createElement('option');
                falseOption.value = 'false';
                falseOption.textContent = arg.off ?? tt('False');
                falseOption.selected = currentValue === 'false' || currentValue === false;

                input.appendChild(trueOption);
                input.appendChild(falseOption);

                input.addEventListener('change', (e) => {
                    this.args[arg.name] = e.target.value;
                });
                break;

            case 'number':
                input = document.createElement('input');
                input.type = 'number';
                input.value = String(currentValue ?? '') || '0';
                if (arg.min !== null) input.min = arg.min;
                if (arg.max !== null) input.max = arg.max;
                if (arg.decimals !== null) input.step = Math.pow(10, -parseInt(arg.decimals));
                input.style.cssText = `
                    padding: 6px 10px;
                    background-color: var(--color-bg-input);
                    color: var(--color-text);
                    border: 1px solid var(--color-border-input);
                    border-radius: 3px;
                    font-size: 12px;
                `;
                input.addEventListener('input', (e) => {
                    this.args[arg.name] = e.target.value;
                });
                break;

            case 'note':
            case 'multiline_string':
                input = document.createElement('textarea');
                input.rows = 5;
                input.value = String(currentValue ?? '');
                input.style.cssText = `
                    min-height: 88px;
                    padding: 6px 10px;
                    background-color: var(--color-bg-input);
                    color: var(--color-text);
                    border: 1px solid var(--color-border-input);
                    border-radius: 3px;
                    box-sizing: border-box;
                    font-size: 12px;
                    line-height: 1.4;
                    resize: vertical;
                    width: 100%;
                `;
                input.addEventListener('input', event => {
                    this.args[arg.name] = event.target.value;
                });
                break;

            case 'icon': {
                const project = this.projectController && this.projectController.getCurrentProject
                    ? this.projectController.getCurrentProject() : null;
                const iconSetPath = project && project.path && window.RRIconPicker
                    ? window.RRIconPicker.iconSetPathFor(project.path) : null;
                if (!window.RRIconPicker) {
                    input = document.createElement('input');
                    input.type = 'text';
                    input.value = currentValue || '';
                    input.addEventListener('input', (e) => { this.args[arg.name] = e.target.value; });
                    break;
                }
                section.appendChild(window.RRIconPicker.createField({
                    value: currentValue,
                    iconSetPath,
                    onChange: newValue => { this.args[arg.name] = newValue; },
                    inputStyle: 'padding:6px 10px;background-color:var(--color-bg-input);color:var(--color-text);border:1px solid var(--color-border-input);border-radius:3px;font-size:12px;',
                    zIndex: 10010
                }));
                return section;
            }

            case 'file': {
                // File picker with browse button
                const fileRow = document.createElement('div');
                fileRow.style.cssText = 'display: flex; gap: 6px; align-items: center;';

                input = document.createElement('input');
                input.type = 'text';
                input.value = currentValue || '';
                input.style.cssText = `
                    padding: 6px 10px;
                    background-color: var(--color-bg-input);
                    color: var(--color-text);
                    border: 1px solid var(--color-border-input);
                    border-radius: 3px;
                    font-size: 12px;
                    flex: 1;
                `;
                input.addEventListener('input', (e) => {
                    this.args[arg.name] = e.target.value;
                });

                const browseBtn = document.createElement('button');
                browseBtn.textContent = tt('Browse...');
                browseBtn.className = 'rr-btn-browse';
                browseBtn.addEventListener('click', () => {
                    if (!this.showAudioPicker(arg, input)) this.showFilePicker(arg, input);
                });

                fileRow.appendChild(input);
                fileRow.appendChild(browseBtn);

                section.appendChild(fileRow);
                return section;
            }

            default: // string
                input = document.createElement('input');
                input.type = 'text';
                input.value = String(currentValue ?? '');
                input.style.cssText = `
                    padding: 6px 10px;
                    background-color: var(--color-bg-input);
                    color: var(--color-text);
                    border: 1px solid var(--color-border-input);
                    border-radius: 3px;
                    font-size: 12px;
                `;
                input.addEventListener('input', (e) => {
                    this.args[arg.name] = e.target.value;
                });
                break;
        }

        section.appendChild(input);
        return section;
    }

    /**
     * Convert argument value based on type
     */
    convertArgValue(value, type) {
        if (value === null || value === undefined || value === '') {
            if (type === 'boolean') return 'false';
            if (type === 'number') return '0';
        }
        return String(value ?? '');
    }

    /**
     * `@type file` under `@dir audio/...` opens the shared audio picker so
     * the argument can be auditioned. Returns false when the argument is
     * not an audio one, so the generic file picker handles it.
     */
    showAudioPicker(arg, inputElement) {
        if (typeof RRAudioPickerModal === 'undefined') return false;
        if (!/^\.?[\\/]?audio([\\/]|$)/i.test(String(arg.dir || '').trim())) return false;
        const currentProject = this.projectController.getCurrentProject();
        if (!currentProject || !currentProject.path) return false;
        let files = [];
        try {
            const browseDir = this.path.join(currentProject.path, arg.dir);
            if (this.fs.existsSync(browseDir)) {
                files = RRAssetFiles.listUnique(browseDir, RRAssetFiles.AUDIO_EXTENSIONS);
            }
        } catch (e) {
            console.warn('Could not scan directory:', arg.dir, e);
        }
        const folder = String(arg.dir).match(/audio[\\/]+([A-Za-z]+)/);
        const folderName = folder ? folder[1].toLowerCase() : '';
        RRAudioPickerModal.open({
            title: 'Select Audio File',
            folderLabel: folder ? folder[1].toUpperCase() : '',
            files,
            selected: inputElement.value || '',
            levels: null,
            previewLevels: { volume: 90, pitch: 100, pan: 0 },
            loopDefault: ['bgm', 'bgs', 'me'].includes(folderName),
            zIndex: 10010,
            onOk: result => {
                inputElement.value = result.name;
                this.args[arg.name] = result.name;
            }
        });
        return true;
    }

    /**
     * Show file picker for @type file arguments
     */
    showFilePicker(arg, inputElement) {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        const currentProject = this.projectController.getCurrentProject();
        if (!currentProject || !currentProject.path) return;

        // Determine directory to browse - use @dir if specified, otherwise project root
        let browseDir;
        if (arg.dir) {
            browseDir = this.path.join(currentProject.path, arg.dir);
        } else {
            browseDir = currentProject.path;
        }

        if (!this.fs.existsSync(browseDir)) {
            alert(tt('Directory not found:') + ' ' + (arg.dir || browseDir));
            return;
        }

        // Only the kinds of file the argument's folder holds: an image folder
        // lists images, an audio folder audio, movies videos; a folder that
        // says nothing (or none at all) lists every kind.
        const files = RRAssetFiles.listNames(browseDir, PluginCommandEditor.extensionsForDir(arg.dir),
            { recursive: Boolean(arg.dir) });

        if (files.length === 0) {
            alert(tt('No files found in:') + ' ' + (arg.dir || browseDir));
            return;
        }

        // Build picker modal
        const picker = document.createElement('div');
        picker.style.cssText = `
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background-color: rgba(0, 0, 0, 0.8); z-index: 10008;
            display: flex; justify-content: center; align-items: center;
        `;

        const container = document.createElement('div');
        container.className = 'rr-modal';
        container.style.cssText = `width: min(500px, calc(100vw - 24px)); max-height: 70vh;`;

        // Header
        const header = document.createElement('div');
        header.className = 'rr-modal-header';
        header.innerHTML = `
            <div class="rr-modal-title">${tt('Select File')}${arg.dir ? ' — ' + arg.dir : ''}</div>
            <button class="close-picker" style="background: none; border: none; color: var(--color-text-strong); font-size: 20px; cursor: pointer;">×</button>
        `;

        // Search bar
        const searchBox = document.createElement('input');
        searchBox.type = 'text';
        searchBox.placeholder = tt('Search files...');
        searchBox.style.cssText = `
            margin: 8px 16px; padding: 8px 12px; background-color: var(--color-bg-input); color: var(--color-text);
            border: 1px solid var(--color-border-input); border-radius: 3px; font-size: 13px;
        `;

        // File list
        const listContainer = document.createElement('div');
        listContainer.style.cssText = 'flex: 1; overflow-y: auto; padding: 8px;';

        let selectedFile = inputElement.value || '';

        const renderList = (filter = '') => {
            listContainer.innerHTML = '';
            const lowerFilter = filter.toLowerCase();
            const filtered = files.filter(f => f.toLowerCase().includes(lowerFilter));

            // Add "(None)" option
            const noneItem = document.createElement('div');
            noneItem.textContent = tt('(None)');
            const isNoneSelected = !selectedFile;
            noneItem.style.cssText = `
                padding: 8px 12px; margin-bottom: 2px; cursor: pointer; font-size: 12px; border-radius: 3px;
                background-color: ${isNoneSelected ? 'var(--color-accent)' : 'var(--color-bg-input)'};
                color: ${isNoneSelected ? 'var(--color-bg-deep)' : 'var(--color-text-muted)'}; font-style: italic;
            `;
            noneItem.addEventListener('click', () => { selectedFile = ''; renderList(filter); });
            noneItem.addEventListener('dblclick', () => { selectAndClose(''); });
            listContainer.appendChild(noneItem);

            for (const file of filtered) {
                const item = document.createElement('div');
                item.textContent = file;
                const isSelected = file === selectedFile;
                item.style.cssText = `
                    padding: 8px 12px; margin-bottom: 2px; cursor: pointer; font-size: 12px; border-radius: 3px;
                    background-color: ${isSelected ? 'var(--color-accent)' : 'var(--color-bg-input)'};
                    color: ${isSelected ? 'var(--color-bg-deep)' : 'var(--color-text)'};
                `;
                item.addEventListener('mouseenter', () => { if (file !== selectedFile) item.style.backgroundColor = '#3d3d3d'; });
                item.addEventListener('mouseleave', () => { if (file !== selectedFile) item.style.backgroundColor = 'var(--color-bg-input)'; });
                item.addEventListener('click', () => { selectedFile = file; renderList(filter); });
                item.addEventListener('dblclick', () => { selectAndClose(file); });
                listContainer.appendChild(item);
            }
        };

        searchBox.addEventListener('input', (e) => renderList(e.target.value));

        const selectAndClose = (file) => {
            inputElement.value = file;
            this.args[arg.name] = file;
            picker.remove();
        };

        // Footer
        const footer = document.createElement('div');
        footer.className = 'rr-modal-footer';

        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = tt('Cancel');
        cancelBtn.className = 'rr-btn-secondary';
        cancelBtn.addEventListener('click', () => picker.remove());

        const okBtn = document.createElement('button');
        okBtn.textContent = tt('OK');
        okBtn.className = 'rr-button-primary';
        okBtn.addEventListener('click', () => selectAndClose(selectedFile));

        footer.appendChild(cancelBtn);
        footer.appendChild(okBtn);

        container.appendChild(header);
        container.appendChild(searchBox);
        container.appendChild(listContainer);
        container.appendChild(footer);
        picker.appendChild(container);

        header.querySelector('.close-picker').addEventListener('click', () => picker.remove());

        document.body.appendChild(picker);
        renderList();
        setTimeout(() => searchBox.focus(), 100);
    }

    /**
     * Build command from current data
     */
    /**
     * The label shown for this command in the event list. The plugin's own
     * @text annotation wins, since the user may have picked a different command
     * than the one that was loaded; the label already on the command is the
     * fallback for plugins whose source is missing or unannotated.
     */
    displayLabel() {
        const annotated = this.selectedCommand && this.selectedCommand.name === this.commandName
            ? this.selectedCommand.text
            : '';
        return annotated || this.commandText || '';
    }

    storedArgumentValue(value) {
        if (Array.isArray(value) || (value && typeof value === 'object')) {
            return JSON.stringify(value);
        }
        return String(value ?? '');
    }

    readableArgumentValue(arg, value) {
        const choiceLabel = (schema, stored) => {
            const options = Array.isArray(schema.options) ? schema.options : [];
            const values = Array.isArray(schema.values) ? schema.values : [];
            const index = options.findIndex((option, i) =>
                String(i in values ? values[i] : option) === stored);
            if (index >= 0 && options[index]) return options[index];
            if (schema.type === 'boolean') {
                if (stored === 'true' && schema.on) return schema.on;
                if (stored === 'false' && schema.off) return schema.off;
            }
            return stored;
        };

        const stored = this.storedArgumentValue(value);
        if (String(arg.type || '').endsWith('[]')) {
            try {
                const values = JSON.parse(stored);
                if (Array.isArray(values)) {
                    const scalar = { ...arg, type: String(arg.type).slice(0, -2) };
                    return values.map(item => choiceLabel(scalar, String(item ?? ''))).join(', ');
                }
            } catch (_error) {
                // Keep malformed authored text visible rather than replacing it.
            }
        }
        return choiceLabel(arg, stored);
    }

    buildCommand() {
        if (this.classicMode) {
            return [{
                code: 356,
                indent: 0,
                parameters: [this.classicText]
            }];
        }
        const args = {};
        for (const [key, value] of Object.entries(this.args || {})) {
            args[key] = this.storedArgumentValue(value);
        }
        const commands = [{
            code: 357,
            indent: 0,
            parameters: [
                this.pluginName,
                this.commandName,
                this.displayLabel(),
                args
            ]
        }];

        const definition = this.selectedCommand?.name === this.commandName
            ? this.selectedCommand : null;
        if (definition) {
            const knownPrefixes = new Set();
            for (const arg of definition.args || []) {
                const prefix = `${arg.text || arg.name} = `;
                knownPrefixes.add(prefix);
                const value = args[arg.name] ?? '';
                if (value === '') continue;
                commands.push({
                    code: 657,
                    indent: 0,
                    parameters: [`${prefix}${this.readableArgumentValue(arg, value)}`]
                });
            }
            for (const row of this.existingArgumentCommands) {
                const text = row.parameters[0];
                if ([...knownPrefixes].some(prefix => text.startsWith(prefix))) continue;
                commands.push({ code: 657, indent: 0, parameters: [text] });
            }
        } else {
            for (const row of this.existingArgumentCommands) {
                commands.push({ code: 657, indent: 0, parameters: [row.parameters[0]] });
            }
        }
        return commands;
    }

    /**
     * Save and return command
     */
    save() {
        if (this.callback) {
            this.callback(this.buildCommand());
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
/** The file extensions a plugin argument's `@dir` folder can hold. */
PluginCommandEditor.extensionsForDir = function(dir) {
    const folder = String(dir || '').trim().replace(/^\.?[\\/]+/, '').replace(/[\\/]+$/, '').toLowerCase();
    const root = folder.split(/[\\/]/)[0];
    const images = RRAssetFiles.IMAGE_EXTENSIONS || ['.png', '.jpg', '.jpeg', '.webp'];
    const audio = RRAssetFiles.AUDIO_EXTENSIONS || ['.ogg', '.mp3', '.wav', '.flac', '.m4a'];
    if (root === 'img') return images.slice();
    if (root === 'audio') return audio.slice();
    if (root === 'movies') return ['.webm', '.mp4'];
    if (root === 'fonts') return ['.woff', '.woff2', '.ttf', '.otf'];
    if (root === 'effects') return ['.efkefc'];
    return [...images, '.bmp', ...audio, '.webm', '.mp4'];
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = PluginCommandEditor;
}
