/**
 * FadeScreenEditor - Editor for Fadeout/Fadein Screen event commands (codes 221/222)
 */
class FadeScreenEditor {
    constructor(databaseManager, projectController) {
        this.databaseManager = databaseManager;
        this.projectController = projectController;
        this.modal = null;
        this.callback = null;
        this.fadeType = 221; // 221=Fadeout, 222=Fadein
    }

    /**
     * Show editor for a fade screen command
     * @param {object} command - The command to edit (or null for new)
     * @param {function} callback - Callback when done editing
     */
    show(command, callback) {
        this.callback = callback;

        if (command && (command.code === 221 || command.code === 222)) {
            this.fadeType = command.code;
        } else {
            this.fadeType = 221; // Default to fadeout
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
        this.modal.className = 'fade-screen-editor-modal';
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
        container.className = 'fade-screen-container rr-modal';
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
        const container = this.modal.querySelector('.fade-screen-container');
        container.innerHTML = '';

        // Header
        const header = document.createElement('div');
        header.className = 'rr-modal-header';
        header.innerHTML = `
            <div class="rr-modal-title">${tt('Fade Screen')}</div>
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

        // Fade type selection
        const fadeSection = document.createElement('div');
        fadeSection.style.cssText = 'display: flex; gap: 12px;';

        const fadeoutRadio = document.createElement('input');
        fadeoutRadio.type = 'radio';
        fadeoutRadio.name = 'fade-type';
        fadeoutRadio.id = 'fadeout';
        fadeoutRadio.checked = (this.fadeType === 221);
        fadeoutRadio.addEventListener('change', () => {
            this.fadeType = 221;
        });

        const fadeoutLabel = document.createElement('label');
        fadeoutLabel.htmlFor = 'fadeout';
        fadeoutLabel.textContent = tt('Fadeout');
        fadeoutLabel.style.cssText = 'color: var(--color-text); cursor: pointer;';

        const fadeinRadio = document.createElement('input');
        fadeinRadio.type = 'radio';
        fadeinRadio.name = 'fade-type';
        fadeinRadio.id = 'fadein';
        fadeinRadio.checked = (this.fadeType === 222);
        fadeinRadio.addEventListener('change', () => {
            this.fadeType = 222;
        });

        const fadeinLabel = document.createElement('label');
        fadeinLabel.htmlFor = 'fadein';
        fadeinLabel.textContent = tt('Fadein');
        fadeinLabel.style.cssText = 'color: var(--color-text); cursor: pointer;';

        fadeSection.appendChild(fadeoutRadio);
        fadeSection.appendChild(fadeoutLabel);
        fadeSection.appendChild(fadeinRadio);
        fadeSection.appendChild(fadeinLabel);
        content.appendChild(fadeSection);

        // Info text
        const info = document.createElement('div');
        info.textContent = tt('Duration is automatically set to the default fade speed.');
        info.style.cssText = 'color: var(--color-text-muted); font-size: 11px; padding: 8px; background-color: var(--color-bg-list-item); border-radius: 3px;';
        content.appendChild(info);

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
            code: this.fadeType,
            indent: 0,
            parameters: []
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
    module.exports = FadeScreenEditor;
}
