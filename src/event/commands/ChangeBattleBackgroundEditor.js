/**
 * ChangeBattleBackgroundEditor - Editor for Change Battle Background event command (code 283)
 */
class ChangeBattleBackgroundEditor {
    constructor(databaseManager, projectController) {
        this.databaseManager = databaseManager;
        this.projectController = projectController;
        this.modal = null;
        this.callback = null;
        this.battleback1 = '';
        this.battleback2 = '';
    }

    /**
     * Show editor for a change battle background command
     * @param {object} command - The command to edit (or null for new)
     * @param {function} callback - Callback when done editing
     */
    show(command, callback) {
        this.callback = callback;

        if (command && command.code === 283) {
            const params = command.parameters;
            this.battleback1 = params[0] || '';
            this.battleback2 = params[1] || '';
        } else {
            this.battleback1 = '';
            this.battleback2 = '';
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
        this.modal.className = 'change-battle-background-editor-modal';
        this.modal.style.cssText = 'display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background-color: rgba(0,0,0,0.7); z-index: 10005; justify-content: center; align-items: center;';

        const container = document.createElement('div');
        container.className = 'change-battle-background-container';
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
        const container = this.modal.querySelector('.change-battle-background-container');
        container.innerHTML = '';

        // Header
        const header = document.createElement('div');
        header.style.cssText = 'padding: 12px 16px; background-color: var(--color-bg-panel); border-bottom: 1px solid var(--color-border); display: flex; justify-content: space-between; align-items: center; border-top-left-radius: 6px; border-top-right-radius: 6px;';
        header.innerHTML = `
            <h3 style="margin: 0; color: var(--color-text-strong); font-size: 16px;">Change Battle Background</h3>
            <button class="close-btn" style="background: none; border: none; color: var(--color-text-strong); font-size: 20px; cursor: pointer; padding: 0; width: 24px; height: 24px;">\u00d7</button>
        `;
        container.appendChild(header);

        header.querySelector('.close-btn').addEventListener('click', () => this.close());

        // Content
        const content = document.createElement('div');
        content.style.cssText = 'padding: 16px; display: flex; flex-direction: column; gap: 12px; overflow-y: auto; flex: 1;';

        // Battleback 1 input
        const bb1Row = document.createElement('div');
        bb1Row.style.cssText = 'display: flex; align-items: center; gap: 8px;';

        const bb1Label = document.createElement('span');
        bb1Label.textContent = 'Battleback 1:';
        bb1Label.style.cssText = 'color: var(--color-text); font-size: 13px; min-width: 120px;';

        const bb1Input = document.createElement('input');
        bb1Input.type = 'text';
        bb1Input.value = this.battleback1;
        bb1Input.style.cssText = 'padding: 6px 10px; background-color: var(--color-bg-input); color: var(--color-text); border: 1px solid var(--color-border-input); border-radius: 3px; font-size: 12px; flex: 1;';
        bb1Input.addEventListener('input', (e) => {
            this.battleback1 = e.target.value;
        });

        bb1Row.appendChild(bb1Label);
        bb1Row.appendChild(bb1Input);
        content.appendChild(bb1Row);

        // Battleback 2 input
        const bb2Row = document.createElement('div');
        bb2Row.style.cssText = 'display: flex; align-items: center; gap: 8px;';

        const bb2Label = document.createElement('span');
        bb2Label.textContent = 'Battleback 2:';
        bb2Label.style.cssText = 'color: var(--color-text); font-size: 13px; min-width: 120px;';

        const bb2Input = document.createElement('input');
        bb2Input.type = 'text';
        bb2Input.value = this.battleback2;
        bb2Input.style.cssText = 'padding: 6px 10px; background-color: var(--color-bg-input); color: var(--color-text); border: 1px solid var(--color-border-input); border-radius: 3px; font-size: 12px; flex: 1;';
        bb2Input.addEventListener('input', (e) => {
            this.battleback2 = e.target.value;
        });

        bb2Row.appendChild(bb2Label);
        bb2Row.appendChild(bb2Input);
        content.appendChild(bb2Row);

        container.appendChild(content);

        // Footer
        const footer = document.createElement('div');
        footer.style.cssText = 'padding: 12px 16px; border-top: 1px solid var(--color-border); background-color: var(--color-bg-panel); display: flex; justify-content: flex-end; gap: 8px;';

        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = 'Cancel';
        cancelBtn.className = 'rr-btn-secondary';
        cancelBtn.addEventListener('click', () => this.close());

        const okBtn = document.createElement('button');
        okBtn.textContent = 'OK';
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
            code: 283,
            indent: 0,
            parameters: [this.battleback1, this.battleback2]
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
    module.exports = ChangeBattleBackgroundEditor;
}
