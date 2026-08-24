/**
 * WaitCommandEditor - Editor for Wait event command (code 230)
 */
class WaitCommandEditor {
    constructor(databaseManager, projectController) {
        this.databaseManager = databaseManager;
        this.projectController = projectController;
        this.modal = null;
        this.callback = null;
        this.duration = 60; // Default 1 second (60 frames)
    }

    /**
     * Show editor for a wait command
     * @param {object} command - The command to edit (or null for new)
     * @param {function} callback - Callback when done editing
     */
    show(command, callback) {
        this.callback = callback;

        if (command && command.code === 230) {
            this.duration = command.parameters[0] || 60;
        } else {
            this.duration = 60;
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
        this.modal.className = 'wait-command-editor-modal';
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
        container.className = 'wait-command-container rr-modal';
        container.style.cssText = `width: min(400px, calc(100vw - 24px)); max-height: 92vh;`;

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
        const container = this.modal.querySelector('.wait-command-container');
        container.innerHTML = '';

        // Header
        const header = document.createElement('div');
        header.className = 'rr-modal-header';
        header.innerHTML = `
            <div class="rr-modal-title">${tt('Wait')}</div>
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
            gap: 12px;
            overflow-y: auto;
            min-height: 0;
        `;

        const label = document.createElement('div');
        label.textContent = tt('Duration (frames, 60 frames = 1 second):');
        label.style.cssText = 'font-weight: bold; font-size: 13px; color: var(--color-text);';

        const inputRow = document.createElement('div');
        inputRow.style.cssText = 'display: flex; gap: 8px; align-items: center;';

        const input = document.createElement('input');
        input.type = 'number';
        input.min = 1;
        input.max = 999;
        input.value = this.duration;
        input.className = 'duration-input';
        input.style.cssText = `
            padding: 6px 10px;
            background-color: var(--color-bg-input);
            color: var(--color-text);
            border: 1px solid var(--color-border-input);
            border-radius: 3px;
            font-size: 12px;
            width: 100px;
        `;
        input.addEventListener('input', (e) => {
            this.duration = parseInt(e.target.value) || 60;
        });

        const framesLabel = document.createElement('span');
        framesLabel.style.cssText = 'color: var(--color-text-muted); font-size: 12px;';
        framesLabel.textContent = tt('frames');

        const secondsLabel = document.createElement('span');
        secondsLabel.className = 'seconds-label';
        secondsLabel.style.cssText = 'color: var(--color-text-muted); font-size: 12px; margin-left: 8px;';
        secondsLabel.textContent = `(${(this.duration / 60).toFixed(2)}s)`;

        input.addEventListener('input', () => {
            secondsLabel.textContent = `(${(this.duration / 60).toFixed(2)}s)`;
        });

        inputRow.appendChild(input);
        inputRow.appendChild(framesLabel);
        inputRow.appendChild(secondsLabel);

        content.appendChild(label);
        content.appendChild(inputRow);

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
     * Build command from current data
     */
    buildCommand() {
        return {
            code: 230,
            indent: 0,
            parameters: [this.duration]
        };
    }

    /**
     * Save and return command
     */
    save() {
        if (this.callback) {
            const command = this.buildCommand();
            this.callback(command);
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
    module.exports = WaitCommandEditor;
}
