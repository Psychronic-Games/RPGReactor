/**
 * NameInputProcessingEditor - Editor for Name Input Processing event command (code 303)
 */
class NameInputProcessingEditor {
    constructor(databaseManager, projectController) {
        this.databaseManager = databaseManager;
        this.projectController = projectController;
        this.modal = null;
        this.callback = null;
        this.actorId = 1;
        this.maxChars = 8;
    }

    /**
     * Show editor for a name input processing command
     * @param {object} command - The command to edit (or null for new)
     * @param {function} callback - Callback when done editing
     */
    show(command, callback) {
        this.callback = callback;

        if (command && command.code === 303) {
            const params = command.parameters;
            this.actorId = params[0] || 1;
            this.maxChars = params[1] || 8;
        } else {
            this.actorId = 1;
            this.maxChars = 8;
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
        this.modal.className = 'name-input-processing-editor-modal';
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
        container.className = 'name-input-processing-container';
        container.style.cssText = `
            background-color: var(--color-bg-surface);
            border: 1px solid var(--color-border);
            border-radius: 6px;
            width: 450px;
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
        const container = this.modal.querySelector('.name-input-processing-container');
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
            <h3 style="margin: 0; color: var(--color-text-strong); font-size: 16px;">Name Input Processing</h3>
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

        // Actor dropdown row
        const actorRow = document.createElement('div');
        actorRow.style.cssText = 'display: flex; align-items: center; gap: 8px;';

        const actorLabel = document.createElement('span');
        actorLabel.textContent = 'Actor:';
        actorLabel.style.cssText = 'color: var(--color-text); font-size: 13px; min-width: 80px;';

        const actorSelect = document.createElement('select');
        actorSelect.style.cssText = `
            padding: 6px 10px;
            background-color: var(--color-bg-input);
            color: var(--color-text);
            border: 1px solid var(--color-border-input);
            border-radius: 3px;
            font-size: 12px;
            flex: 1;
        `;

        // Populate from databaseManager.data.actors (skip null index 0)
        const actors = this.databaseManager.data.actors || [];
        for (let i = 1; i < actors.length; i++) {
            const actor = actors[i];
            if (actor) {
                const option = document.createElement('option');
                option.value = i;
                option.textContent = `${String(i).padStart(4, '0')}: ${actor.name || ''}`;
                actorSelect.appendChild(option);
            }
        }

        actorSelect.value = this.actorId.toString();
        actorSelect.addEventListener('change', (e) => {
            this.actorId = parseInt(e.target.value);
        });

        actorRow.appendChild(actorLabel);
        actorRow.appendChild(actorSelect);
        content.appendChild(actorRow);

        // Max Characters row
        const maxCharsRow = document.createElement('div');
        maxCharsRow.style.cssText = 'display: flex; align-items: center; gap: 8px;';

        const maxCharsLabel = document.createElement('span');
        maxCharsLabel.textContent = 'Max Chars:';
        maxCharsLabel.style.cssText = 'color: var(--color-text); font-size: 13px; min-width: 80px;';

        const maxCharsInput = document.createElement('input');
        maxCharsInput.type = 'number';
        maxCharsInput.min = 1;
        maxCharsInput.max = 16;
        maxCharsInput.value = this.maxChars;
        maxCharsInput.style.cssText = `
            padding: 6px 10px;
            background-color: var(--color-bg-input);
            color: var(--color-text);
            border: 1px solid var(--color-border-input);
            border-radius: 3px;
            font-size: 12px;
            width: 80px;
        `;
        maxCharsInput.addEventListener('input', (e) => {
            this.maxChars = parseInt(e.target.value) || 8;
        });

        maxCharsRow.appendChild(maxCharsLabel);
        maxCharsRow.appendChild(maxCharsInput);
        content.appendChild(maxCharsRow);

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
        cancelBtn.textContent = 'Cancel';
        cancelBtn.className = 'rr-btn-secondary';
        cancelBtn.addEventListener('click', () => this.close());

        const okBtn = document.createElement('button');
        okBtn.textContent = 'OK';
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
            code: 303,
            indent: 0,
            parameters: [this.actorId, this.maxChars]
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
    module.exports = NameInputProcessingEditor;
}
