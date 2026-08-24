/**
 * ShowScrollingTextEditor - Editor for Show Scrolling Text event command (code 105)
 * First command is 105, then subsequent text lines are code 405 continuations.
 */
class ShowScrollingTextEditor {
    constructor(databaseManager, projectController) {
        this.databaseManager = databaseManager;
        this.projectController = projectController;
        this.modal = null;
        this.callback = null;
        this.speed = 2;
        this.noFastForward = false;
        this.text = '';
    }

    /**
     * Show editor for a show scrolling text command
     * @param {object} command - The command to edit (or null for new)
     * @param {function} callback - Callback when done editing
     * @param {string[]} textLines - Array of text lines from 405 continuation commands
     */
    show(command, callback, textLines) {
        this.callback = callback;

        if (command && command.code === 105) {
            this.speed = command.parameters[0] || 2;
            this.noFastForward = command.parameters[1] || false;
            this.text = (textLines || []).join('\n');
        } else {
            this.speed = 2;
            this.noFastForward = false;
            this.text = '';
        }

        if (!this.modal) {
            this.createModal();
        }

        this.renderContent();
        this.modal.style.display = 'flex';
    }

    /**
     * Create modal structure
     */
    createModal() {
        this.modal = document.createElement('div');
        this.modal.className = 'show-scrolling-text-editor-modal';
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
        container.className = 'show-scrolling-text-container rr-modal';
        container.style.cssText = `width: min(450px, calc(100vw - 24px)); max-height: 92vh;`;

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
        const container = this.modal.querySelector('.show-scrolling-text-container');
        container.innerHTML = '';

        // Header
        const header = document.createElement('div');
        header.className = 'rr-modal-header';
        header.innerHTML = `
            <div class="rr-modal-title">${tt('Show Scrolling Text')}</div>
            <button class="rr-modal-close close-btn" type="button">\u00d7</button>
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
            overflow-y: auto;
            min-height: 0;
        `;

        // Speed row
        const speedRow = document.createElement('div');
        speedRow.style.cssText = 'display: flex; align-items: center; gap: 8px;';

        const speedLabel = document.createElement('span');
        speedLabel.textContent = tt('Speed:');
        speedLabel.style.cssText = 'color: var(--color-text); font-size: 13px; min-width: 80px;';

        const speedInput = document.createElement('input');
        speedInput.type = 'number';
        speedInput.min = 1;
        speedInput.max = 8;
        speedInput.value = this.speed;
        speedInput.style.cssText = `
            padding: 6px 10px;
            background-color: var(--color-bg-input);
            color: var(--color-text);
            border: 1px solid var(--color-border-input);
            border-radius: 3px;
            font-size: 12px;
            width: 80px;
        `;
        speedInput.addEventListener('input', (e) => {
            this.speed = parseInt(e.target.value) || 2;
        });

        speedRow.appendChild(speedLabel);
        speedRow.appendChild(speedInput);
        content.appendChild(speedRow);

        // No Fast Forward checkbox row
        const noFastRow = document.createElement('div');
        noFastRow.style.cssText = 'display: flex; align-items: center; gap: 8px;';

        const noFastCheckbox = document.createElement('input');
        noFastCheckbox.type = 'checkbox';
        noFastCheckbox.id = 'no-fast-forward';
        noFastCheckbox.checked = this.noFastForward;
        noFastCheckbox.addEventListener('change', (e) => {
            this.noFastForward = e.target.checked;
        });

        const noFastLabel = document.createElement('label');
        noFastLabel.htmlFor = 'no-fast-forward';
        noFastLabel.textContent = tt('No Fast Forward');
        noFastLabel.style.cssText = 'color: var(--color-text); font-size: 13px; cursor: pointer;';

        noFastRow.appendChild(noFastCheckbox);
        noFastRow.appendChild(noFastLabel);
        content.appendChild(noFastRow);

        // Text area
        const textLabel = document.createElement('span');
        textLabel.textContent = tt('Text:');
        textLabel.style.cssText = 'color: var(--color-text); font-size: 13px;';
        content.appendChild(textLabel);

        const textarea = document.createElement('textarea');
        textarea.value = this.text;
        textarea.rows = 8;
        textarea.style.cssText = `
            padding: 8px 10px;
            background-color: var(--color-bg-input);
            color: var(--color-text);
            border: 1px solid var(--color-border-input);
            border-radius: 3px;
            font-size: 13px;
            font-family: monospace;
            resize: vertical;
            min-height: 120px;
        `;
        textarea.addEventListener('input', (e) => {
            this.text = e.target.value;
        });
        content.appendChild(textarea);

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

    /**
     * Build command array from current data
     */
    buildCommand() {
        const commands = [];
        commands.push({ code: 105, indent: 0, parameters: [this.speed, this.noFastForward] });
        const lines = this.text.split('\n');
        lines.forEach(line => {
            commands.push({ code: 405, indent: 0, parameters: [line] });
        });
        return commands;
    }

    /**
     * Save and return commands
     */
    save() {
        if (this.callback) {
            const commands = this.buildCommand();
            this.callback(commands);
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
    module.exports = ShowScrollingTextEditor;
}
