/**
 * ToggleCommandEditor - Reusable editor for simple toggle event commands
 * Shared for codes 134, 135, 136, 137, 216, 281
 */
class ToggleCommandEditor {
    constructor(databaseManager, projectController) {
        this.databaseManager = databaseManager;
        this.projectController = projectController;
        this.modal = null;
        this.callback = null;
        this.mode = 0;
        this.config = null;
    }

    /**
     * Show editor for a toggle command
     * @param {object} command - The command to edit (or null for new)
     * @param {function} callback - Callback when done editing
     * @param {object} config - { code, title, option0, option1 }
     */
    show(command, callback, config) {
        this.callback = callback;
        this.config = config;

        if (command && command.code === config.code) {
            const params = command.parameters;
            this.mode = params[0] || 0;
        } else {
            this.mode = 0;
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
        this.modal.className = 'toggle-command-editor-modal';
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
        container.className = 'toggle-command-container';
        container.style.cssText = `
            background-color: var(--color-bg-surface);
            border: 1px solid var(--color-border);
            border-radius: 6px;
            width: 350px;
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
        const container = this.modal.querySelector('.toggle-command-container');
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
            <h3 style="margin: 0; color: var(--color-text-strong); font-size: 16px;">${tt(this.config.title)}</h3>
            <button class="close-btn" style="background: none; border: none; color: var(--color-text-strong); font-size: 20px; cursor: pointer; padding: 0; width: 24px; height: 24px;">\u00d7</button>
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

        // Toggle radio buttons
        const toggleSection = document.createElement('div');
        toggleSection.style.cssText = 'display: flex; gap: 12px;';

        const radioName = `toggle-${this.config.code}`;

        const option0Radio = document.createElement('input');
        option0Radio.type = 'radio';
        option0Radio.name = radioName;
        option0Radio.id = `${radioName}-option0`;
        option0Radio.checked = (this.mode === 0);
        option0Radio.addEventListener('change', () => {
            this.mode = 0;
        });

        const option0Label = document.createElement('label');
        option0Label.htmlFor = `${radioName}-option0`;
        option0Label.textContent = tt(this.config.option0);
        option0Label.style.cssText = 'color: var(--color-text); cursor: pointer;';

        const option1Radio = document.createElement('input');
        option1Radio.type = 'radio';
        option1Radio.name = radioName;
        option1Radio.id = `${radioName}-option1`;
        option1Radio.checked = (this.mode === 1);
        option1Radio.addEventListener('change', () => {
            this.mode = 1;
        });

        const option1Label = document.createElement('label');
        option1Label.htmlFor = `${radioName}-option1`;
        option1Label.textContent = tt(this.config.option1);
        option1Label.style.cssText = 'color: var(--color-text); cursor: pointer;';

        toggleSection.appendChild(option0Radio);
        toggleSection.appendChild(option0Label);
        toggleSection.appendChild(option1Radio);
        toggleSection.appendChild(option1Label);
        content.appendChild(toggleSection);

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
            code: this.config.code,
            indent: 0,
            parameters: [this.mode]
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
    module.exports = ToggleCommandEditor;
}
