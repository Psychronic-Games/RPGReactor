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
        container.className = 'show-animation-container';
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
        const container = this.modal.querySelector('.show-animation-container');
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
            <h3 style="margin: 0; color: var(--color-text-strong); font-size: 16px;">Show Animation</h3>
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

        // Character selection
        const characterSection = document.createElement('div');
        characterSection.style.cssText = 'display: flex; flex-direction: column; gap: 8px;';

        const characterLabel = document.createElement('span');
        characterLabel.textContent = 'Character:';
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
        playerOption.textContent = 'Player';
        playerOption.selected = (this.characterId === -1);
        characterSelect.appendChild(playerOption);

        const thisEventOption = document.createElement('option');
        thisEventOption.value = '0';
        thisEventOption.textContent = 'This Event';
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
                    const eventName = event.name || `Event ${String(index).padStart(3, '0')}`;
                    const option = document.createElement('option');
                    option.value = index.toString();
                    option.textContent = `Event ${String(index).padStart(3, '0')} - ${eventName}`;
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
        animationLabel.textContent = 'Animation:';
        animationLabel.style.cssText = 'color: var(--color-text); font-size: 13px; font-weight: bold;';
        animationSection.appendChild(animationLabel);

        const animationRow = document.createElement('div');
        animationRow.style.cssText = 'display: flex; gap: 8px; align-items: center;';

        const animationInput = document.createElement('input');
        animationInput.type = 'number';
        animationInput.min = 1;
        animationInput.max = 999;
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
            this.animationId = parseInt(e.target.value) || 1;
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
        waitLabel.textContent = 'Wait for Completion';
        waitLabel.style.cssText = 'color: var(--color-text); font-size: 12px; cursor: pointer;';

        waitSection.appendChild(waitCheck);
        waitSection.appendChild(waitLabel);
        content.appendChild(waitSection);

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
