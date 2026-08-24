/**
 * PlayMovieEditor - Editor for Play Movie event command (code 261)
 */
class PlayMovieEditor {
    constructor(databaseManager, projectController) {
        this.databaseManager = databaseManager;
        this.projectController = projectController;
        this.modal = null;
        this.callback = null;
        this.filename = '';
    }

    /**
     * Show editor for a play movie command
     * @param {object} command - The command to edit (or null for new)
     * @param {function} callback - Callback when done editing
     */
    show(command, callback) {
        this.callback = callback;

        if (command && command.code === 261) {
            const params = command.parameters;
            this.filename = params[0] || '';
        } else {
            this.filename = '';
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
        this.modal.className = 'play-movie-editor-modal';
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
        container.className = 'play-movie-container rr-modal';
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
        const container = this.modal.querySelector('.play-movie-container');
        container.innerHTML = '';

        // Header
        const header = document.createElement('div');
        header.className = 'rr-modal-header';
        header.innerHTML = `
            <div class="rr-modal-title">${tt('Play Movie')}</div>
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

        // Filename row
        const filenameRow = document.createElement('div');
        filenameRow.style.cssText = 'display: flex; align-items: center; gap: 8px;';

        const filenameLabel = document.createElement('span');
        filenameLabel.textContent = tt('File:');
        filenameLabel.style.cssText = 'color: var(--color-text); font-size: 13px; min-width: 50px;';

        const filenameInput = document.createElement('input');
        filenameInput.type = 'text';
        filenameInput.value = this.filename;
        filenameInput.style.cssText = `
            padding: 6px 10px;
            background-color: var(--color-bg-input);
            color: var(--color-text);
            border: 1px solid var(--color-border-input);
            border-radius: 3px;
            font-size: 12px;
            flex: 1;
        `;
        filenameInput.addEventListener('input', (e) => {
            this.filename = e.target.value;
        });

        filenameRow.appendChild(filenameLabel);
        filenameRow.appendChild(filenameInput);
        content.appendChild(filenameRow);

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
            code: 261,
            indent: 0,
            parameters: [this.filename]
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
    module.exports = PlayMovieEditor;
}
