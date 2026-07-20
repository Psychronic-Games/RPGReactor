/**
 * ControlTimerEditor - Editor for Control Timer event command (code 124)
 */
class ControlTimerEditor {
    constructor(databaseManager, projectController) {
        this.databaseManager = databaseManager;
        this.projectController = projectController;
        this.modal = null;
        this.callback = null;
        this.operation = 0; // 0=Start, 1=Stop
        this.seconds = 60; // Timer duration in seconds
    }

    /**
     * Show editor for a control timer command
     * @param {object} command - The command to edit (or null for new)
     * @param {function} callback - Callback when done editing
     */
    show(command, callback) {
        this.callback = callback;

        if (command && command.code === 124) {
            const params = command.parameters;
            this.operation = params[0] || 0;
            this.seconds = params[1] || 60;
        } else {
            this.operation = 0;
            this.seconds = 60;
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
        this.modal.className = 'control-timer-editor-modal';
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
        container.className = 'control-timer-container';
        container.style.cssText = `
            background-color: var(--color-bg-surface);
            border: 1px solid var(--color-border);
            border-radius: 6px;
            width: 400px;
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
        const container = this.modal.querySelector('.control-timer-container');
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
            <h3 style="margin: 0; color: var(--color-text-strong); font-size: 16px;">${tt('Control Timer')}</h3>
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
            gap: 16px;
        `;

        // Operation selection
        const operationSection = document.createElement('div');
        operationSection.style.cssText = 'display: flex; gap: 12px;';

        const startRadio = document.createElement('input');
        startRadio.type = 'radio';
        startRadio.name = 'timer-operation';
        startRadio.id = 'start-timer';
        startRadio.checked = (this.operation === 0);
        startRadio.addEventListener('change', () => {
            this.operation = 0;
            this.renderContent();
        });

        const startLabel = document.createElement('label');
        startLabel.htmlFor = 'start-timer';
        startLabel.textContent = tt('Start');
        startLabel.style.cssText = 'color: var(--color-text); cursor: pointer;';

        const stopRadio = document.createElement('input');
        stopRadio.type = 'radio';
        stopRadio.name = 'timer-operation';
        stopRadio.id = 'stop-timer';
        stopRadio.checked = (this.operation === 1);
        stopRadio.addEventListener('change', () => {
            this.operation = 1;
            this.renderContent();
        });

        const stopLabel = document.createElement('label');
        stopLabel.htmlFor = 'stop-timer';
        stopLabel.textContent = tt('Stop');
        stopLabel.style.cssText = 'color: var(--color-text); cursor: pointer;';

        operationSection.appendChild(startRadio);
        operationSection.appendChild(startLabel);
        operationSection.appendChild(stopRadio);
        operationSection.appendChild(stopLabel);
        content.appendChild(operationSection);

        // Duration input (only for Start)
        if (this.operation === 0) {
            const durationSection = document.createElement('div');
            durationSection.style.cssText = 'display: flex; flex-direction: column; gap: 8px; padding-top: 8px; border-top: 1px solid var(--color-border);';

            const label = document.createElement('span');
            label.textContent = tt('Duration:');
            label.style.cssText = 'color: var(--color-text); font-size: 13px; font-weight: bold;';
            durationSection.appendChild(label);

            const inputRow = document.createElement('div');
            inputRow.style.cssText = 'display: flex; align-items: center; gap: 8px;';

            const input = document.createElement('input');
            input.type = 'number';
            input.min = 1;
            input.max = 3600;
            input.value = this.seconds;
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
                this.seconds = parseInt(e.target.value) || 60;
            });

            const secondsLabel = document.createElement('span');
            secondsLabel.textContent = tt('seconds');
            secondsLabel.style.cssText = 'color: var(--color-text-muted); font-size: 12px;';

            // Time preview
            const minutes = Math.floor(this.seconds / 60);
            const secs = this.seconds % 60;
            const preview = document.createElement('span');
            preview.textContent = `(${minutes}:${String(secs).padStart(2, '0')})`;
            preview.style.cssText = 'color: var(--color-link); font-size: 12px; margin-left: 8px;';

            inputRow.appendChild(input);
            inputRow.appendChild(secondsLabel);
            inputRow.appendChild(preview);
            durationSection.appendChild(inputRow);

            content.appendChild(durationSection);
        }

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
     * Build command from current data
     */
    buildCommand() {
        return {
            code: 124,
            indent: 0,
            parameters: [
                this.operation,
                this.seconds
            ]
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
    module.exports = ControlTimerEditor;
}
