/**
 * ChangeTransparencyEditor - Editor for Change Transparency event command (code 211)
 */
class ChangeTransparencyEditor {
    constructor(databaseManager, projectController) {
        this.databaseManager = databaseManager;
        this.projectController = projectController;
        this.modal = null;
        this.callback = null;
        this.transparent = 0; // 0=ON, 1=OFF
    }

    /**
     * Show editor for a change transparency command
     * @param {object} command - The command to edit (or null for new)
     * @param {function} callback - Callback when done editing
     */
    show(command, callback) {
        this.callback = callback;

        if (command && command.code === 211) {
            const params = command.parameters;
            this.transparent = params[0] || 0;
        } else {
            this.transparent = 0;
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
        this.modal.className = 'change-transparency-editor-modal';
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
        container.className = 'change-transparency-container rr-modal';
        container.style.cssText = `width: min(350px, calc(100vw - 24px)); max-height: 92vh;`;

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
        const container = this.modal.querySelector('.change-transparency-container');
        container.innerHTML = '';

        // Header
        const header = document.createElement('div');
        header.className = 'rr-modal-header';
        header.innerHTML = `
            <div class="rr-modal-title">${tt('Change Transparency')}</div>
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

        // Transparency toggle
        const toggleSection = document.createElement('div');
        toggleSection.style.cssText = 'display: flex; gap: 12px;';

        const onRadio = document.createElement('input');
        onRadio.type = 'radio';
        onRadio.name = 'transparency';
        onRadio.id = 'transparency-on';
        onRadio.checked = (this.transparent === 0);
        onRadio.addEventListener('change', () => {
            this.transparent = 0;
        });

        const onLabel = document.createElement('label');
        onLabel.htmlFor = 'transparency-on';
        onLabel.textContent = tt('Transparent ON');
        onLabel.style.cssText = 'color: var(--color-text); cursor: pointer;';

        const offRadio = document.createElement('input');
        offRadio.type = 'radio';
        offRadio.name = 'transparency';
        offRadio.id = 'transparency-off';
        offRadio.checked = (this.transparent === 1);
        offRadio.addEventListener('change', () => {
            this.transparent = 1;
        });

        const offLabel = document.createElement('label');
        offLabel.htmlFor = 'transparency-off';
        offLabel.textContent = tt('Transparent OFF');
        offLabel.style.cssText = 'color: var(--color-text); cursor: pointer;';

        toggleSection.appendChild(onRadio);
        toggleSection.appendChild(onLabel);
        toggleSection.appendChild(offRadio);
        toggleSection.appendChild(offLabel);
        content.appendChild(toggleSection);

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
            code: 211,
            indent: 0,
            parameters: [this.transparent]
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
    module.exports = ChangeTransparencyEditor;
}
