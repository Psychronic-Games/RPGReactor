/**
 * CommentEditor - Editor for Comment event command (code 108 + 408 continuation lines)
 */
class CommentEditor {
    constructor(databaseManager, projectController) {
        this.databaseManager = databaseManager;
        this.projectController = projectController;
        this.modal = null;
        this.callback = null;
        this.commentText = '';
    }

    /**
     * Show editor for a comment command
     * @param {object} command - The command to edit (or null for new)
     * @param {Array} fullCommands - All commands (to get continuation lines if editing)
     * @param {number} commandIndex - Index of the comment command in fullCommands
     * @param {function} callback - Callback when done editing
     */
    show(command, fullCommands, commandIndex, callback) {
        this.callback = callback;

        if (command && command.code === 108) {
            // Editing existing comment - gather all lines
            const lines = [];
            lines.push(command.parameters[0] || '');

            // Collect all 408 continuation lines
            if (fullCommands && commandIndex !== undefined) {
                for (let i = commandIndex + 1; i < fullCommands.length; i++) {
                    if (fullCommands[i].code === 408) {
                        lines.push(fullCommands[i].parameters[0] || '');
                    } else {
                        break; // Stop at first non-408 command
                    }
                }
            }

            this.commentText = lines.join('\n');
        } else {
            this.commentText = '';
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
        this.modal.className = 'comment-editor-modal';
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
        container.className = 'comment-container rr-modal';
        container.style.cssText = `width: min(600px, calc(100vw - 24px)); max-height: 92vh;`;

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
        const container = this.modal.querySelector('.comment-container');
        container.innerHTML = '';

        // Header
        const header = document.createElement('div');
        header.className = 'rr-modal-header';
        header.innerHTML = `
            <div class="rr-modal-title">${tt('Comment')}</div>
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
        `;

        const label = document.createElement('div');
        label.textContent = tt('Comment Text:');
        label.style.cssText = 'color: var(--color-text); font-size: 13px;';
        content.appendChild(label);

        const textarea = document.createElement('textarea');
        textarea.value = this.commentText;
        textarea.style.cssText = `
            padding: 8px;
            background-color: var(--color-bg-input);
            color: var(--color-text);
            border: 1px solid var(--color-border-input);
            border-radius: 3px;
            font-size: 12px;
            font-family: monospace;
            resize: vertical;
            min-height: 150px;
            max-height: 400px;
        `;
        textarea.addEventListener('input', (e) => {
            this.commentText = e.target.value;
        });

        content.appendChild(textarea);

        const hint = document.createElement('div');
        hint.textContent = tt('Comments are only visible in the event editor and are not shown during gameplay.');
        hint.style.cssText = 'color: var(--color-text-muted); font-size: 11px; font-style: italic;';
        content.appendChild(hint);

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

        // Focus the textarea
        setTimeout(() => textarea.focus(), 0);
    }

    /**
     * Build commands from current data (returns array with 108 + multiple 408s)
     */
    buildCommands() {
        const commands = [];
        const lines = this.commentText.split('\n');

        // First line is code 108
        commands.push({
            code: 108,
            indent: 0,
            parameters: [lines[0] || '']
        });

        // Remaining lines are code 408
        for (let i = 1; i < lines.length; i++) {
            commands.push({
                code: 408,
                indent: 0,
                parameters: [lines[i]]
            });
        }

        return commands;
    }

    /**
     * Save and return commands
     */
    save() {
        if (this.callback) {
            const commands = this.buildCommands();
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
    module.exports = CommentEditor;
}
