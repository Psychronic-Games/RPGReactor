/**
 * ChangeParallaxEditor - Editor for Change Parallax event command (code 284)
 */
class ChangeParallaxEditor {
    constructor(databaseManager, projectController) {
        this.databaseManager = databaseManager;
        this.projectController = projectController;
        this.modal = null;
        this.callback = null;
        this.filename = '';
        this.loopX = false;
        this.loopY = false;
        this.scrollX = 0;
        this.scrollY = 0;
    }

    /**
     * Show editor for a change parallax command
     * @param {object} command - The command to edit (or null for new)
     * @param {function} callback - Callback when done editing
     */
    show(command, callback) {
        this.callback = callback;

        if (command && command.code === 284) {
            const params = command.parameters;
            this.filename = params[0] || '';
            this.loopX = params[1] || false;
            this.loopY = params[2] || false;
            this.scrollX = params[3] || 0;
            this.scrollY = params[4] || 0;
        } else {
            this.filename = '';
            this.loopX = false;
            this.loopY = false;
            this.scrollX = 0;
            this.scrollY = 0;
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
        this.modal.className = 'change-parallax-editor-modal';
        this.modal.style.cssText = 'display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background-color: rgba(0,0,0,0.7); z-index: 10005; justify-content: center; align-items: center;';

        const container = document.createElement('div');
        container.className = 'change-parallax-container';
        container.style.cssText = 'background-color: var(--color-bg-surface); border: 1px solid var(--color-border); border-radius: 6px; width: 500px; display: flex; flex-direction: column; box-shadow: 0 4px 20px rgba(0,0,0,0.5);';

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
        const container = this.modal.querySelector('.change-parallax-container');
        container.innerHTML = '';

        // Header
        const header = document.createElement('div');
        header.style.cssText = 'padding: 12px 16px; background-color: var(--color-bg-panel); border-bottom: 1px solid var(--color-border); display: flex; justify-content: space-between; align-items: center; border-top-left-radius: 6px; border-top-right-radius: 6px;';
        header.innerHTML = `
            <h3 style="margin: 0; color: var(--color-text-strong); font-size: 16px;">${tt('Change Parallax')}</h3>
            <button class="close-btn" style="background: none; border: none; color: var(--color-text-strong); font-size: 20px; cursor: pointer; padding: 0; width: 24px; height: 24px;">\u00d7</button>
        `;
        container.appendChild(header);

        header.querySelector('.close-btn').addEventListener('click', () => this.close());

        // Content
        const content = document.createElement('div');
        content.style.cssText = 'padding: 16px; display: flex; flex-direction: column; gap: 12px; overflow-y: auto; flex: 1;';

        // Filename input
        const filenameRow = document.createElement('div');
        filenameRow.style.cssText = 'display: flex; align-items: center; gap: 8px;';

        const filenameLabel = document.createElement('span');
        filenameLabel.textContent = tt('Filename:');
        filenameLabel.style.cssText = 'color: var(--color-text); font-size: 13px; min-width: 120px;';

        const filenameInput = document.createElement('input');
        filenameInput.type = 'text';
        filenameInput.value = this.filename;
        filenameInput.style.cssText = 'padding: 6px 10px; background-color: var(--color-bg-input); color: var(--color-text); border: 1px solid var(--color-border-input); border-radius: 3px; font-size: 12px; flex: 1;';
        filenameInput.addEventListener('input', (e) => {
            this.filename = e.target.value;
        });

        filenameRow.appendChild(filenameLabel);
        filenameRow.appendChild(filenameInput);
        content.appendChild(filenameRow);

        // Loop X checkbox
        const loopXRow = document.createElement('div');
        loopXRow.style.cssText = 'display: flex; align-items: center; gap: 8px;';

        const loopXCheckbox = document.createElement('input');
        loopXCheckbox.type = 'checkbox';
        loopXCheckbox.id = 'parallax-loop-x';
        loopXCheckbox.checked = this.loopX;
        loopXCheckbox.addEventListener('change', (e) => {
            this.loopX = e.target.checked;
            this.renderContent();
        });

        const loopXLabel = document.createElement('label');
        loopXLabel.htmlFor = 'parallax-loop-x';
        loopXLabel.textContent = tt('Loop X');
        loopXLabel.style.cssText = 'color: var(--color-text); font-size: 13px; cursor: pointer;';

        loopXRow.appendChild(loopXCheckbox);
        loopXRow.appendChild(loopXLabel);
        content.appendChild(loopXRow);

        // Scroll X input (shown when loopX is true)
        if (this.loopX) {
            const scrollXRow = document.createElement('div');
            scrollXRow.style.cssText = 'display: flex; align-items: center; gap: 8px; padding-left: 24px;';

            const scrollXLabel = document.createElement('span');
            scrollXLabel.textContent = tt('Scroll X:');
            scrollXLabel.style.cssText = 'color: var(--color-text); font-size: 13px; min-width: 96px;';

            const scrollXInput = document.createElement('input');
            scrollXInput.type = 'number';
            scrollXInput.value = this.scrollX;
            scrollXInput.style.cssText = 'padding: 6px 10px; background-color: var(--color-bg-input); color: var(--color-text); border: 1px solid var(--color-border-input); border-radius: 3px; font-size: 12px; width: 100px;';
            scrollXInput.addEventListener('input', (e) => {
                this.scrollX = parseInt(e.target.value) || 0;
            });

            scrollXRow.appendChild(scrollXLabel);
            scrollXRow.appendChild(scrollXInput);
            content.appendChild(scrollXRow);
        }

        // Loop Y checkbox
        const loopYRow = document.createElement('div');
        loopYRow.style.cssText = 'display: flex; align-items: center; gap: 8px;';

        const loopYCheckbox = document.createElement('input');
        loopYCheckbox.type = 'checkbox';
        loopYCheckbox.id = 'parallax-loop-y';
        loopYCheckbox.checked = this.loopY;
        loopYCheckbox.addEventListener('change', (e) => {
            this.loopY = e.target.checked;
            this.renderContent();
        });

        const loopYLabel = document.createElement('label');
        loopYLabel.htmlFor = 'parallax-loop-y';
        loopYLabel.textContent = tt('Loop Y');
        loopYLabel.style.cssText = 'color: var(--color-text); font-size: 13px; cursor: pointer;';

        loopYRow.appendChild(loopYCheckbox);
        loopYRow.appendChild(loopYLabel);
        content.appendChild(loopYRow);

        // Scroll Y input (shown when loopY is true)
        if (this.loopY) {
            const scrollYRow = document.createElement('div');
            scrollYRow.style.cssText = 'display: flex; align-items: center; gap: 8px; padding-left: 24px;';

            const scrollYLabel = document.createElement('span');
            scrollYLabel.textContent = tt('Scroll Y:');
            scrollYLabel.style.cssText = 'color: var(--color-text); font-size: 13px; min-width: 96px;';

            const scrollYInput = document.createElement('input');
            scrollYInput.type = 'number';
            scrollYInput.value = this.scrollY;
            scrollYInput.style.cssText = 'padding: 6px 10px; background-color: var(--color-bg-input); color: var(--color-text); border: 1px solid var(--color-border-input); border-radius: 3px; font-size: 12px; width: 100px;';
            scrollYInput.addEventListener('input', (e) => {
                this.scrollY = parseInt(e.target.value) || 0;
            });

            scrollYRow.appendChild(scrollYLabel);
            scrollYRow.appendChild(scrollYInput);
            content.appendChild(scrollYRow);
        }

        container.appendChild(content);

        // Footer
        const footer = document.createElement('div');
        footer.style.cssText = 'padding: 12px 16px; border-top: 1px solid var(--color-border); background-color: var(--color-bg-panel); display: flex; justify-content: flex-end; gap: 8px;';

        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = tt('Cancel');
        cancelBtn.className = 'rr-btn-secondary';
        cancelBtn.addEventListener('click', () => this.close());

        const okBtn = document.createElement('button');
        okBtn.textContent = tt('OK');
        okBtn.style.cssText = 'padding: 6px 20px; background-color: var(--color-accent); color: var(--color-bg-deep); border: none; border-radius: 3px; cursor: pointer; font-size: 12px; font-weight: bold;';
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
            code: 284,
            indent: 0,
            parameters: [this.filename, this.loopX, this.loopY, this.scrollX, this.scrollY]
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
    module.exports = ChangeParallaxEditor;
}
