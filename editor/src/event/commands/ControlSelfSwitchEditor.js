/**
 * ControlSelfSwitchEditor - Editor for Control Self Switch event command (code 123)
 */
class ControlSelfSwitchEditor {
    constructor(databaseManager, projectController) {
        this.databaseManager = databaseManager;
        this.projectController = projectController;
        this.modal = null;
        this.callback = null;
        this.selfSwitchId = 'A'; // A, B, C, or D
        this.value = 0; // 0=ON, 1=OFF
    }

    /**
     * Show editor for a control self switch command
     * @param {object} command - The command to edit (or null for new)
     * @param {function} callback - Callback when done editing
     */
    show(command, callback) {
        this.callback = callback;

        if (command && command.code === 123) {
            const params = command.parameters;
            this.selfSwitchId = params[0] || 'A';
            this.value = params[1] || 0;
        } else {
            this.selfSwitchId = 'A';
            this.value = 0;
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
        this.modal.className = 'control-self-switch-editor-modal';
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
        container.className = 'control-self-switch-container';
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
        const container = this.modal.querySelector('.control-self-switch-container');
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
            <h3 style="margin: 0; color: var(--color-text-strong); font-size: 16px;">${tt('Control Self Switch')}</h3>
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

        // Self Switch selection
        const switchSection = document.createElement('div');
        switchSection.style.cssText = 'display: flex; flex-direction: column; gap: 8px;';

        const switchLabel = document.createElement('div');
        switchLabel.textContent = tt('Self Switch:');
        switchLabel.style.cssText = 'color: var(--color-text); font-size: 13px; font-weight: bold;';
        switchSection.appendChild(switchLabel);

        const switchButtons = document.createElement('div');
        switchButtons.style.cssText = 'display: flex; gap: 8px;';

        ['A', 'B', 'C', 'D'].forEach(letter => {
            const btn = document.createElement('button');
            btn.textContent = letter;
            btn.style.cssText = `
                padding: 8px 16px;
                background-color: ${this.selfSwitchId === letter ? 'var(--color-link)' : 'var(--color-bg-panel)'};
                color: ${this.selfSwitchId === letter ? 'var(--color-text-strong)' : 'var(--color-text)'};
                border: 1px solid ${this.selfSwitchId === letter ? 'var(--color-link)' : 'var(--color-border-input)'};
                border-radius: 3px;
                cursor: pointer;
                font-size: 13px;
                flex: 1;
            `;
            btn.addEventListener('click', () => {
                this.selfSwitchId = letter;
                this.renderContent();
            });
            switchButtons.appendChild(btn);
        });

        switchSection.appendChild(switchButtons);
        content.appendChild(switchSection);

        // Value selection (ON/OFF)
        const valueSection = document.createElement('div');
        valueSection.style.cssText = 'display: flex; flex-direction: column; gap: 8px;';

        const valueLabel = document.createElement('div');
        valueLabel.textContent = tt('Set to:');
        valueLabel.style.cssText = 'color: var(--color-text); font-size: 13px; font-weight: bold;';
        valueSection.appendChild(valueLabel);

        const valueButtons = document.createElement('div');
        valueButtons.style.cssText = 'display: flex; gap: 8px;';

        const onBtn = document.createElement('button');
        onBtn.textContent = tt('ON');
        onBtn.style.cssText = `
            padding: 8px 16px;
            background-color: ${this.value === 0 ? 'var(--color-link)' : 'var(--color-bg-panel)'};
            color: ${this.value === 0 ? 'var(--color-text-strong)' : 'var(--color-text)'};
            border: 1px solid ${this.value === 0 ? 'var(--color-link)' : 'var(--color-border-input)'};
            border-radius: 3px;
            cursor: pointer;
            font-size: 13px;
            flex: 1;
        `;
        onBtn.addEventListener('click', () => {
            this.value = 0;
            this.renderContent();
        });

        const offBtn = document.createElement('button');
        offBtn.textContent = tt('OFF');
        offBtn.style.cssText = `
            padding: 8px 16px;
            background-color: ${this.value === 1 ? 'var(--color-link)' : 'var(--color-bg-panel)'};
            color: ${this.value === 1 ? 'var(--color-text-strong)' : 'var(--color-text)'};
            border: 1px solid ${this.value === 1 ? 'var(--color-link)' : 'var(--color-border-input)'};
            border-radius: 3px;
            cursor: pointer;
            font-size: 13px;
            flex: 1;
        `;
        offBtn.addEventListener('click', () => {
            this.value = 1;
            this.renderContent();
        });

        valueButtons.appendChild(onBtn);
        valueButtons.appendChild(offBtn);
        valueSection.appendChild(valueButtons);
        content.appendChild(valueSection);

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
            code: 123,
            indent: 0,
            parameters: [
                this.selfSwitchId,
                this.value
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
    module.exports = ControlSelfSwitchEditor;
}
