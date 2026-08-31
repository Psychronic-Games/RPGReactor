/**
 * ShowAnimationEditor - Editor for Show Animation event command (code 212)
 */
class ShowAnimationEditor {
    constructor(databaseManager, projectController) {
        this.databaseManager = databaseManager;
        this.projectController = projectController;
        this.modal = null;
        this.callback = null;
        this.characterId = -1; // -1=Player, 0=This Event, >0=Event ID
        this.animationId = 1;
        this.waitForCompletion = false;
    }

    /**
     * Show editor for a show animation command
     * @param {object} command - The command to edit (or null for new)
     * @param {function} callback - Callback when done editing
     */
    show(command, callback) {
        this.callback = callback;

        if (command && command.code === 212) {
            const params = command.parameters;
            this.characterId = params[0] !== undefined ? params[0] : -1;
            this.animationId = params[1] || 1;
            this.waitForCompletion = params[2] || false;
        } else {
            this.characterId = -1;
            this.animationId = 1;
            this.waitForCompletion = false;
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
        this.modal.className = 'show-animation-editor-modal';
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
        container.className = 'show-animation-container rr-modal';
        container.style.cssText = `width: min(450px, calc(100vw - 24px)); max-height: 92vh;`;

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
        const container = this.modal.querySelector('.show-animation-container');
        container.innerHTML = '';

        // Header
        const header = document.createElement('div');
        header.className = 'rr-modal-header';
        header.innerHTML = `
            <div class="rr-modal-title">${tt('Show Animation')}</div>
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
            gap: 16px;
            overflow-y: auto;
            min-height: 0;
        `;

        // Character selection
        const characterSection = document.createElement('div');
        characterSection.style.cssText = 'display: flex; flex-direction: column; gap: 8px;';

        const characterLabel = document.createElement('span');
        characterLabel.textContent = tt('Character:');
        characterLabel.style.cssText = 'color: var(--color-text); font-size: 13px; font-weight: bold;';
        characterSection.appendChild(characterLabel);

        const characterSelect = document.createElement('select');
        characterSelect.style.cssText = `
            padding: 6px 10px;
            background-color: var(--color-bg-input);
            color: var(--color-text);
            border: 1px solid var(--color-border-input);
            border-radius: 3px;
            font-size: 12px;
        `;

        // Add character options
        const playerOption = document.createElement('option');
        playerOption.value = '-1';
        playerOption.textContent = tt('Player');
        playerOption.selected = (this.characterId === -1);
        characterSelect.appendChild(playerOption);

        const thisEventOption = document.createElement('option');
        thisEventOption.value = '0';
        thisEventOption.textContent = tt('This Event');
        thisEventOption.selected = (this.characterId === 0);
        characterSelect.appendChild(thisEventOption);

        // Add events from current map
        let mapData = null;
        if (this.projectController && this.projectController.tilemapManager) {
            mapData = this.projectController.tilemapManager.currentMap;
        }

        if (mapData && mapData.events) {
            mapData.events.forEach((event, index) => {
                if (event && index > 0) {
                    const eventName = event.name || `${tt('Event')} ${String(index).padStart(3, '0')}`;
                    const option = document.createElement('option');
                    option.value = index.toString();
                    option.textContent = `${tt('Event')} ${String(index).padStart(3, '0')} - ${eventName}`;
                    option.selected = (this.characterId === index);
                    characterSelect.appendChild(option);
                }
            });
        }

        characterSelect.addEventListener('change', (e) => {
            this.characterId = parseInt(e.target.value);
        });

        characterSection.appendChild(characterSelect);
        content.appendChild(characterSection);

        // Animation selection
        const animationSection = document.createElement('div');
        animationSection.style.cssText = 'display: flex; flex-direction: column; gap: 8px;';

        const animationLabel = document.createElement('span');
        animationLabel.textContent = tt('Animation:');
        animationLabel.style.cssText = 'color: var(--color-text); font-size: 13px; font-weight: bold;';
        animationSection.appendChild(animationLabel);

        const animationRow = document.createElement('div');
        animationRow.style.cssText = 'display: flex; gap: 8px; align-items: center;';

        const animationInput = document.createElement('input');
        const animationLimit = globalThis.RR_LIMITS?.DATABASE_ENTRIES?.animations || 5000;
        animationInput.type = 'number';
        animationInput.min = 1;
        animationInput.max = animationLimit;
        animationInput.value = this.animationId;
        animationInput.style.cssText = `
            padding: 6px 10px;
            background-color: var(--color-bg-input);
            color: var(--color-text);
            border: 1px solid var(--color-border-input);
            border-radius: 3px;
            font-size: 12px;
            width: 80px;
        `;
        animationInput.addEventListener('input', (e) => {
            this.animationId = Math.max(1, Math.min(animationLimit, parseInt(e.target.value) || 1));
        });

        const browseBtn = document.createElement('button');
        browseBtn.textContent = '...';
        browseBtn.className = 'rr-btn-browse';
        browseBtn.addEventListener('click', () => {
            if (!this._animationPicker) {
                this._animationPicker = new AnimationPicker(this.databaseManager, this.projectController);
            }
            this._animationPicker.show(this.animationId, (selectedId) => {
                this.animationId = selectedId;
                animationInput.value = selectedId;
            });
        });

        animationRow.appendChild(animationInput);
        animationRow.appendChild(browseBtn);
        animationSection.appendChild(animationRow);
        content.appendChild(animationSection);

        // Wait for completion checkbox
        const waitSection = document.createElement('div');
        waitSection.style.cssText = 'display: flex; align-items: center; gap: 8px; padding-top: 8px; border-top: 1px solid var(--color-border);';

        const waitCheck = document.createElement('input');
        waitCheck.type = 'checkbox';
        waitCheck.id = 'wait-for-completion';
        waitCheck.checked = this.waitForCompletion;
        waitCheck.addEventListener('change', (e) => {
            this.waitForCompletion = e.target.checked;
        });

        const waitLabel = document.createElement('label');
        waitLabel.htmlFor = 'wait-for-completion';
        waitLabel.textContent = tt('Wait for Completion');
        waitLabel.style.cssText = 'color: var(--color-text); font-size: 12px; cursor: pointer;';

        waitSection.appendChild(waitCheck);
        waitSection.appendChild(waitLabel);
        content.appendChild(waitSection);

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
            code: 212,
            indent: 0,
            parameters: [
                this.characterId,
                this.animationId,
                this.waitForCompletion
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
    module.exports = ShowAnimationEditor;
}
