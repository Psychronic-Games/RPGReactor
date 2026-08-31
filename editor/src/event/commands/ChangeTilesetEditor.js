/**
 * ChangeTilesetEditor - Editor for Change Tileset event command (code 282)
 */
class ChangeTilesetEditor {
    constructor(databaseManager, projectController) {
        this.databaseManager = databaseManager;
        this.projectController = projectController;
        this.modal = null;
        this.callback = null;
        this.tilesetId = 1;
    }

    /**
     * Show editor for a change tileset command
     * @param {object} command - The command to edit (or null for new)
     * @param {function} callback - Callback when done editing
     */
    show(command, callback) {
        this.callback = callback;

        if (command && command.code === 282) {
            const params = command.parameters;
            this.tilesetId = params[0] || 1;
        } else {
            this.tilesetId = 1;
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
        this.modal.className = 'change-tileset-editor-modal';
        this.modal.style.cssText = 'display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background-color: rgba(0,0,0,0.7); z-index: 10005; justify-content: center; align-items: center;';

        const container = document.createElement('div');
        container.className = 'change-tileset-container';
        container.style.cssText = 'background-color: var(--color-bg-surface); border: 1px solid var(--color-border); border-radius: 6px; width: 400px; display: flex; flex-direction: column; box-shadow: 0 4px 20px rgba(0,0,0,0.5);';

        this.modal.appendChild(container);

        this.modal.addEventListener('click', (e) => {
            // A click on the backdrop no longer closes the dialog: an accidental
            // click beside it must never cost in-progress work. Close deliberately.
        });

        document.body.appendChild(this.modal);
    }

    /**
     * Render modal content
     */
    renderContent() {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        const container = this.modal.querySelector('.change-tileset-container');
        container.innerHTML = '';

        // Header
        const header = document.createElement('div');
        header.className = 'rr-modal-header';
        header.innerHTML = `
            <div class="rr-modal-title">${tt('Change Tileset')}</div>
            <button class="rr-modal-close close-btn" type="button">\u00d7</button>
        `;
        container.appendChild(header);

        header.querySelector('.close-btn').addEventListener('click', () => this.close());

        // Content
        const content = document.createElement('div');
        content.style.cssText = 'padding: 16px; display: flex; flex-direction: column; gap: 12px; overflow-y: auto; flex: 1;';

        // Tileset dropdown
        const tilesetRow = document.createElement('div');
        tilesetRow.style.cssText = 'display: flex; align-items: center; gap: 8px;';

        const tilesetLabel = document.createElement('span');
        tilesetLabel.textContent = tt('Tileset:');
        tilesetLabel.style.cssText = 'color: var(--color-text); font-size: 13px; min-width: 120px;';

        const tilesetSelect = document.createElement('select');
        tilesetSelect.style.cssText = 'padding: 6px 10px; background-color: var(--color-bg-input); color: var(--color-text); border: 1px solid var(--color-border-input); border-radius: 3px; font-size: 12px; flex: 1;';

        // Populate tileset dropdown from database
        const tilesets = this.databaseManager.data.tilesets;
        if (tilesets) {
            for (let i = 1; i < tilesets.length; i++) {
                const tileset = tilesets[i];
                if (tileset) {
                    const option = document.createElement('option');
                    option.value = i;
                    option.textContent = `${i.toString().padStart(4, '0')}: ${tileset.name || tt('Unnamed')}`;
                    if (i === this.tilesetId) {
                        option.selected = true;
                    }
                    tilesetSelect.appendChild(option);
                }
            }
        }

        tilesetSelect.addEventListener('change', (e) => {
            this.tilesetId = parseInt(e.target.value);
        });

        tilesetRow.appendChild(tilesetLabel);
        tilesetRow.appendChild(tilesetSelect);
        content.appendChild(tilesetRow);

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
            code: 282,
            indent: 0,
            parameters: [this.tilesetId]
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
    module.exports = ChangeTilesetEditor;
}
