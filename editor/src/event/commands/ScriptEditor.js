/**
 * ScriptEditor - Editor for Script event command (code 355)
 * Multi-line script command with continuation lines (655)
 */
class ScriptEditor {
    constructor(databaseManager, projectController) {
        this.databaseManager = databaseManager;
        this.projectController = projectController;
        this.modal = null;
        this.callback = null;

        this.scriptText = '';
    }

    show(command, commandList, commandIndex, callback) {
        this.callback = callback;

        if (command && command.code === 355) {
            // Gather all script lines (355 + 655 continuation lines)
            const lines = [command.parameters[0] || ''];

            // If we have the command list, gather continuation lines
            if (commandList && commandIndex !== undefined) {
                for (let i = commandIndex + 1; i < commandList.length; i++) {
                    if (commandList[i].code === 655) {
                        lines.push(commandList[i].parameters[0] || '');
                    } else {
                        break;
                    }
                }
            }

            this.scriptText = lines.join('\n');
        } else {
            this.scriptText = '';
        }

        if (!this.modal) {
            this.createModal();
        }

        this.renderContent();
        this.modal.style.display = 'flex';
    }

    createModal() {
        this.modal = document.createElement('div');
        this.modal.className = 'script-editor-modal';
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
        container.className = 'script-container rr-modal';
        container.style.cssText = `width: min(700px, calc(100vw - 24px)); max-height: 80vh;`;

        this.modal.appendChild(container);

        this.modal.addEventListener('click', (e) => {
            // A click on the backdrop no longer closes the dialog: an accidental
            // click beside it must never cost in-progress work. Close deliberately.
        });

        document.body.appendChild(this.modal);
    }

    renderContent() {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        const container = this.modal.querySelector('.script-container');
        container.innerHTML = '';

        // Header
        const header = document.createElement('div');
        header.className = 'rr-modal-header';
        header.innerHTML = `
            <div class="rr-modal-title">${tt('Script')}</div>
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
            gap: 8px;
            flex: 1;
            overflow: hidden;
        `;

        // Info text
        const infoDiv = document.createElement('div');
        infoDiv.style.cssText = `
            color: var(--color-text-muted);
            font-size: 11px;
            padding: 8px 12px;
            background-color: var(--color-bg-list-item);
            border-radius: 3px;
            border-left: 3px solid var(--color-link);
        `;
        infoDiv.innerHTML = `
            <strong style="color: var(--color-text);">${tt('JavaScript Code')}</strong><br>
            ${tt('Enter JavaScript code to execute during the event. This runs in the game engine context.')}<br>
            ${tt('Example:')} <code style="color: var(--color-syntax-string);">$gameVariables.setValue(1, 100);</code>
        `;
        content.appendChild(infoDiv);

        // Script textarea
        const textareaContainer = document.createElement('div');
        textareaContainer.style.cssText = 'flex: 1; display: flex; flex-direction: column; overflow: hidden;';

        const textarea = document.createElement('textarea');
        textarea.className = 'script-textarea';
        textarea.value = this.scriptText;
        textarea.style.cssText = `
            flex: 1;
            padding: 12px;
            background-color: var(--color-bg-surface);
            color: #d4d4d4;
            border: 1px solid var(--color-border-input);
            border-radius: 3px;
            font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
            font-size: 13px;
            line-height: 1.6;
            resize: none;
            overflow-y: auto;
            min-height: 300px;
        `;
        textarea.addEventListener('input', (e) => {
            this.scriptText = e.target.value;
        });

        // Tab key support
        textarea.addEventListener('keydown', (e) => {
            if (e.key === 'Tab') {
                e.preventDefault();
                const start = textarea.selectionStart;
                const end = textarea.selectionEnd;
                const value = textarea.value;

                // Insert tab character
                textarea.value = value.substring(0, start) + '    ' + value.substring(end);
                textarea.selectionStart = textarea.selectionEnd = start + 4;

                this.scriptText = textarea.value;
            }
        });

        textareaContainer.appendChild(textarea);
        content.appendChild(textareaContainer);

        // Syntax highlighting hint
        const syntaxHint = document.createElement('div');
        syntaxHint.style.cssText = 'color: var(--color-text-dim); font-size: 10px; font-style: italic;';
        syntaxHint.textContent = tt('Tip: Use proper JavaScript syntax. Common objects: $gameVariables, $gameSwitches, $gameParty, $gameActors');
        content.appendChild(syntaxHint);

        container.appendChild(content);

        // Footer
        const footer = document.createElement('div');
        footer.className = 'rr-modal-footer';
        footer.style.justifyContent = 'space-between';

        // Line count info
        const lineCount = document.createElement('div');
        lineCount.style.cssText = 'color: var(--color-text-muted); font-size: 11px;';
        const lines = this.scriptText.split('\n').length;
        lineCount.textContent = `${lines} ${lines !== 1 ? tt('lines') : tt('line')}`;
        footer.appendChild(lineCount);

        // Buttons
        const buttonGroup = document.createElement('div');
        buttonGroup.style.cssText = 'display: flex; gap: 8px;';

        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = tt('Cancel');
        cancelBtn.className = 'rr-btn-secondary';
        cancelBtn.addEventListener('click', () => this.close());

        const okBtn = document.createElement('button');
        okBtn.textContent = tt('OK');
        okBtn.className = 'rr-button-primary';
        okBtn.addEventListener('click', () => this.save());

        buttonGroup.appendChild(cancelBtn);
        buttonGroup.appendChild(okBtn);
        footer.appendChild(buttonGroup);

        container.appendChild(footer);

        // Focus textarea
        setTimeout(() => textarea.focus(), 100);
    }

    buildCommands() {
        const commands = [];
        const lines = this.scriptText.split('\n');

        if (lines.length === 0 || (lines.length === 1 && lines[0] === '')) {
            // Empty script - create single command with empty string
            commands.push({
                code: 355,
                indent: 0,
                parameters: ['']
            });
        } else {
            // First line is 355
            commands.push({
                code: 355,
                indent: 0,
                parameters: [lines[0]]
            });

            // Subsequent lines are 655 (continuation)
            for (let i = 1; i < lines.length; i++) {
                commands.push({
                    code: 655,
                    indent: 0,
                    parameters: [lines[i]]
                });
            }
        }

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
    module.exports = ScriptEditor;
}
