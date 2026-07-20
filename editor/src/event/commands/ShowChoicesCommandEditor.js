/**
 * ShowChoicesCommandEditor - Editor for Show Choices event command (code 102)
 */
class ShowChoicesCommandEditor {
    constructor(databaseManager, projectController) {
        this.databaseManager = databaseManager;
        this.projectController = projectController;
        this.modal = null;
        this.callback = null;
        this.choices = ['', '', '', '']; // Up to 6 choices, start with 4
        this.cancelType = -1; // -2=disallow, -1=branch, 0-5=choice index
        this.defaultType = 0; // Default selected choice
        this.positionType = 2; // 0=left, 1=middle, 2=right
        this.background = 0; // 0=window, 1=dim, 2=transparent
    }

    /**
     * Show editor for a choices command
     * @param {object} command - The command to edit (or null for new)
     * @param {function} callback - Callback when done editing
     */
    show(command, callback) {
        this.callback = callback;

        if (command && command.code === 102) {
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

    /**
     * Parse existing choices command
     */
    parseCommand(command) {
        const params = command.parameters;
        this.choices = params[0] ? [...params[0]] : ['', ''];
        this.cancelType = params[1] !== undefined ? params[1] : -1;
        this.defaultType = params[2] !== undefined ? params[2] : 0;
        this.positionType = params[3] !== undefined ? params[3] : 2;
        this.background = params[4] !== undefined ? params[4] : 0;

        // Ensure at least 2 choices
        while (this.choices.length < 2) {
            this.choices.push('');
        }
    }

    /**
     * Reset to default values
     */
    resetToDefaults() {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        this.choices = [tt('Choice 1'), tt('Choice 2'), '', ''];
        this.cancelType = -1;
        this.defaultType = 0;
        this.positionType = 2;
        this.background = 0;
    }

    /**
     * Create modal structure
     */
    createModal() {
        this.modal = document.createElement('div');
        this.modal.className = 'choices-command-editor-modal';
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
        container.className = 'choices-command-container';
        container.style.cssText = `
            background-color: var(--color-bg-surface);
            border: 1px solid var(--color-border);
            border-radius: 6px;
            width: 600px;
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

    /**
     * Render modal content
     */
    renderContent() {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        const container = this.modal.querySelector('.choices-command-container');
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
            <h3 style="margin: 0; color: var(--color-text-strong); font-size: 16px;">${tt('Show Choices')}</h3>
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

        // Choices section
        content.appendChild(this.createChoicesSection());

        // Settings section
        content.appendChild(this.createSettingsSection());

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

    /**
     * Create choices input section
     */
    createChoicesSection() {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        const section = document.createElement('div');
        section.style.cssText = 'display: flex; flex-direction: column; gap: 8px;';

        const label = document.createElement('div');
        label.textContent = tt('Choices:');
        label.style.cssText = 'font-weight: bold; font-size: 13px; color: var(--color-text);';
        section.appendChild(label);

        // Create input for each choice (up to 6)
        for (let i = 0; i < 6; i++) {
            const row = document.createElement('div');
            row.style.cssText = 'display: flex; align-items: center; gap: 8px;';

            const choiceLabel = document.createElement('span');
            choiceLabel.textContent = `${i + 1}:`;
            choiceLabel.style.cssText = 'color: var(--color-text-muted); min-width: 20px;';

            const input = document.createElement('input');
            input.type = 'text';
            input.className = `choice-input-${i}`;
            input.value = this.choices[i] || '';
            input.placeholder = i < 2 ? tt('Required') : tt('Optional');
            input.style.cssText = `
                flex: 1;
                padding: 6px 10px;
                background-color: var(--color-bg-input);
                color: var(--color-text);
                border: 1px solid var(--color-border-input);
                border-radius: 3px;
                font-size: 12px;
            `;
            input.addEventListener('input', (e) => {
                this.choices[i] = e.target.value;
            });

            row.appendChild(choiceLabel);
            row.appendChild(input);
            section.appendChild(row);
        }

        return section;
    }

    /**
     * Create settings section
     */
    createSettingsSection() {
        const t = text => window.I18n ? window.I18n.tText(text) : text;
        const section = document.createElement('div');
        section.style.cssText = `
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 12px;
            padding-top: 12px;
            border-top: 1px solid var(--color-border);
        `;

        // Cancel dropdown
        const cancelGroup = document.createElement('div');
        cancelGroup.style.cssText = 'display: flex; flex-direction: column; gap: 4px;';

        const cancelLabel = document.createElement('label');
        cancelLabel.textContent = t('When Cancel:');
        cancelLabel.style.cssText = 'color: var(--color-text); font-size: 12px;';

        const cancelSelect = document.createElement('select');
        cancelSelect.className = 'cancel-select';
        cancelSelect.style.cssText = `
            padding: 6px 10px;
            background-color: var(--color-bg-input);
            color: var(--color-text);
            border: 1px solid var(--color-border-input);
            border-radius: 3px;
            font-size: 12px;
        `;
        cancelSelect.innerHTML = `
            <option value="-2">${t('Disallow')}</option>
            <option value="-1">${t('Branch')}</option>
            <option value="0">${t('Choice 1')}</option>
            <option value="1">${t('Choice 2')}</option>
            <option value="2">${t('Choice 3')}</option>
            <option value="3">${t('Choice 4')}</option>
            <option value="4">${t('Choice 5')}</option>
            <option value="5">${t('Choice 6')}</option>
        `;
        cancelSelect.value = this.cancelType.toString();
        cancelSelect.addEventListener('change', (e) => {
            this.cancelType = parseInt(e.target.value);
        });

        cancelGroup.appendChild(cancelLabel);
        cancelGroup.appendChild(cancelSelect);

        // Default dropdown
        const defaultGroup = document.createElement('div');
        defaultGroup.style.cssText = 'display: flex; flex-direction: column; gap: 4px;';

        const defaultLabel = document.createElement('label');
        defaultLabel.textContent = t('Default:');
        defaultLabel.style.cssText = 'color: var(--color-text); font-size: 12px;';

        const defaultSelect = document.createElement('select');
        defaultSelect.className = 'default-select';
        defaultSelect.style.cssText = `
            padding: 6px 10px;
            background-color: var(--color-bg-input);
            color: var(--color-text);
            border: 1px solid var(--color-border-input);
            border-radius: 3px;
            font-size: 12px;
        `;
        defaultSelect.innerHTML = `
            <option value="0">${t('Choice 1')}</option>
            <option value="1">${t('Choice 2')}</option>
            <option value="2">${t('Choice 3')}</option>
            <option value="3">${t('Choice 4')}</option>
            <option value="4">${t('Choice 5')}</option>
            <option value="5">${t('Choice 6')}</option>
        `;
        defaultSelect.value = this.defaultType.toString();
        defaultSelect.addEventListener('change', (e) => {
            this.defaultType = parseInt(e.target.value);
        });

        defaultGroup.appendChild(defaultLabel);
        defaultGroup.appendChild(defaultSelect);

        // Window Position dropdown
        const posGroup = document.createElement('div');
        posGroup.style.cssText = 'display: flex; flex-direction: column; gap: 4px;';

        const posLabel = document.createElement('label');
        posLabel.textContent = t('Window Position:');
        posLabel.style.cssText = 'color: var(--color-text); font-size: 12px;';

        const posSelect = document.createElement('select');
        posSelect.className = 'position-select';
        posSelect.style.cssText = `
            padding: 6px 10px;
            background-color: var(--color-bg-input);
            color: var(--color-text);
            border: 1px solid var(--color-border-input);
            border-radius: 3px;
            font-size: 12px;
        `;
        posSelect.innerHTML = `
            <option value="0">${t('Left')}</option>
            <option value="1">${t('Middle')}</option>
            <option value="2">${t('Right')}</option>
        `;
        posSelect.value = this.positionType.toString();
        posSelect.addEventListener('change', (e) => {
            this.positionType = parseInt(e.target.value);
        });

        posGroup.appendChild(posLabel);
        posGroup.appendChild(posSelect);

        // Background dropdown
        const bgGroup = document.createElement('div');
        bgGroup.style.cssText = 'display: flex; flex-direction: column; gap: 4px;';

        const bgLabel = document.createElement('label');
        bgLabel.textContent = t('Background:');
        bgLabel.style.cssText = 'color: var(--color-text); font-size: 12px;';

        const bgSelect = document.createElement('select');
        bgSelect.className = 'background-select';
        bgSelect.style.cssText = `
            padding: 6px 10px;
            background-color: var(--color-bg-input);
            color: var(--color-text);
            border: 1px solid var(--color-border-input);
            border-radius: 3px;
            font-size: 12px;
        `;
        bgSelect.innerHTML = `
            <option value="0">${t('Window')}</option>
            <option value="1">${t('Dim')}</option>
            <option value="2">${t('Transparent')}</option>
        `;
        bgSelect.value = this.background.toString();
        bgSelect.addEventListener('change', (e) => {
            this.background = parseInt(e.target.value);
        });

        bgGroup.appendChild(bgLabel);
        bgGroup.appendChild(bgSelect);

        section.appendChild(cancelGroup);
        section.appendChild(defaultGroup);
        section.appendChild(posGroup);
        section.appendChild(bgGroup);

        return section;
    }

    /**
     * Build commands array (includes branching structure)
     */
    buildCommands() {
        // Filter out empty choices and ensure at least 2. Cancel/default
        // reference choices BY INDEX, so removing a blank choice must remap
        // them to the surviving positions — otherwise they shift onto the
        // wrong choice (or off the end of the list).
        const filteredChoices = [];
        const indexMap = new Map();
        this.choices.forEach((choice, i) => {
            if (choice.trim() !== '') {
                indexMap.set(i, filteredChoices.length);
                filteredChoices.push(choice);
            }
        });
        if (filteredChoices.length < 2) {
            const tt = text => window.I18n ? window.I18n.tText(text) : text;
            alert(tt('You must have at least 2 choices.'));
            return null;
        }

        // Negative values (Disallow/Branch) pass through; an index pointing
        // at a removed blank choice falls back to Disallow / Choice 1.
        const cancelType = this.cancelType >= 0
            ? (indexMap.has(this.cancelType) ? indexMap.get(this.cancelType) : -2)
            : this.cancelType;
        const defaultType = this.defaultType >= 0
            ? (indexMap.has(this.defaultType) ? indexMap.get(this.defaultType) : 0)
            : this.defaultType;

        const commands = [];

        // Main Show Choices command
        commands.push({
            code: 102,
            indent: 0,
            parameters: [
                filteredChoices,
                cancelType,
                defaultType,
                this.positionType,
                this.background
            ]
        });

        // Create branches for each choice
        for (let i = 0; i < filteredChoices.length; i++) {
            // When [Choice N]
            // Branch markers sit at the SAME indent as the 102 header (MZ
            // format); the interpreter keys its branch state by indent, so a
            // 402 at indent 1 checked _branch[1] (never set) and skipped the
            // picked choice's body every time.
            commands.push({
                code: 402,
                indent: 0,
                parameters: [i]
            });

            // Placeholder for commands under this choice (empty for now)

            // If this is the last choice and cancel is set to branch, add cancel branch
            if (i === filteredChoices.length - 1 && cancelType === -1) {
                commands.push({
                    code: 403,
                    indent: 0,
                    parameters: []
                });
            }
        }

        // End
        commands.push({
            code: 404,
            indent: 0,
            parameters: []
        });

        return commands;
    }

    /**
     * Save and return commands
     */
    save() {
        if (this.callback) {
            const commands = this.buildCommands();
            if (commands) {
                this.callback(commands);
            }
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
    module.exports = ShowChoicesCommandEditor;
}
