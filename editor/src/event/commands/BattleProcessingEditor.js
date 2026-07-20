/**
 * BattleProcessingEditor - Editor for Battle Processing event command (code 301)
 */
class BattleProcessingEditor {
    constructor(databaseManager, projectController) {
        this.databaseManager = databaseManager;
        this.projectController = projectController;
        this.modal = null;
        this.callback = null;
        this.designation = 0;
        this.troopId = 1;
        this.canEscape = false;
        this.canLose = false;
    }

    /**
     * Show editor for a battle processing command
     * @param {object} command - The command to edit (or null for new)
     * @param {function} callback - Callback when done editing
     */
    show(command, callback) {
        this.callback = callback;

        if (command && command.code === 301) {
            const params = command.parameters;
            this.designation = params[0] || 0;
            this.troopId = params[1] || 1;
            this.canEscape = params[2] || false;
            this.canLose = params[3] || false;
        } else {
            this.designation = 0;
            this.troopId = 1;
            this.canEscape = false;
            this.canLose = false;
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
        this.modal.className = 'battle-processing-editor-modal';
        this.modal.style.cssText = 'display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background-color: rgba(0,0,0,0.7); z-index: 10005; justify-content: center; align-items: center;';

        const container = document.createElement('div');
        container.className = 'battle-processing-container';
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
     * Browse variables using SwitchVariablePicker
     */
    browseVariables(property) {
        const picker = new SwitchVariablePicker(this.databaseManager, this.projectController);
        picker.show('variable', this[property] || 1, (selectedId) => {
            if (selectedId) {
                this[property] = selectedId;
                this.renderContent();
            }
        });
    }

    /**
     * Render modal content
     */
    renderContent() {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        const container = this.modal.querySelector('.battle-processing-container');
        container.innerHTML = '';

        // Header
        const header = document.createElement('div');
        header.style.cssText = 'padding: 12px 16px; background-color: var(--color-bg-panel); border-bottom: 1px solid var(--color-border); display: flex; justify-content: space-between; align-items: center; border-top-left-radius: 6px; border-top-right-radius: 6px;';
        header.innerHTML = `
            <h3 style="margin: 0; color: var(--color-text-strong); font-size: 16px;">${tt('Battle Processing')}</h3>
            <button class="close-btn" style="background: none; border: none; color: var(--color-text-strong); font-size: 20px; cursor: pointer; padding: 0; width: 24px; height: 24px;">\u00d7</button>
        `;
        container.appendChild(header);

        header.querySelector('.close-btn').addEventListener('click', () => this.close());

        // Content
        const content = document.createElement('div');
        content.style.cssText = 'padding: 16px; display: flex; flex-direction: column; gap: 12px; overflow-y: auto; flex: 1;';

        // Designation radio buttons
        const designSection = document.createElement('div');
        designSection.style.cssText = 'display: flex; flex-direction: column; gap: 8px;';

        const designLabel = document.createElement('span');
        designLabel.textContent = tt('Troop Designation:');
        designLabel.style.cssText = 'color: var(--color-text); font-size: 13px; font-weight: bold;';
        designSection.appendChild(designLabel);

        const radioRow = document.createElement('div');
        radioRow.style.cssText = 'display: flex; gap: 16px;';

        // Direct radio
        const directRadio = document.createElement('input');
        directRadio.type = 'radio';
        directRadio.name = 'battle-designation';
        directRadio.value = '0';
        directRadio.checked = this.designation === 0;
        directRadio.addEventListener('change', () => {
            this.designation = 0;
            this.renderContent();
        });

        const directLabel = document.createElement('label');
        directLabel.textContent = tt('Direct');
        directLabel.style.cssText = 'color: var(--color-text); font-size: 13px; cursor: pointer;';
        directLabel.addEventListener('click', () => { directRadio.checked = true; directRadio.dispatchEvent(new Event('change')); });

        // Variable radio
        const varRadio = document.createElement('input');
        varRadio.type = 'radio';
        varRadio.name = 'battle-designation';
        varRadio.value = '1';
        varRadio.checked = this.designation === 1;
        varRadio.addEventListener('change', () => {
            this.designation = 1;
            this.renderContent();
        });

        const varLabel = document.createElement('label');
        varLabel.textContent = tt('Variable');
        varLabel.style.cssText = 'color: var(--color-text); font-size: 13px; cursor: pointer;';
        varLabel.addEventListener('click', () => { varRadio.checked = true; varRadio.dispatchEvent(new Event('change')); });

        // Random radio
        const randomRadio = document.createElement('input');
        randomRadio.type = 'radio';
        randomRadio.name = 'battle-designation';
        randomRadio.value = '2';
        randomRadio.checked = this.designation === 2;
        randomRadio.addEventListener('change', () => {
            this.designation = 2;
            this.renderContent();
        });

        const randomLabel = document.createElement('label');
        randomLabel.textContent = tt('Random Encounter');
        randomLabel.style.cssText = 'color: var(--color-text); font-size: 13px; cursor: pointer;';
        randomLabel.addEventListener('click', () => { randomRadio.checked = true; randomRadio.dispatchEvent(new Event('change')); });

        radioRow.appendChild(directRadio);
        radioRow.appendChild(directLabel);
        radioRow.appendChild(varRadio);
        radioRow.appendChild(varLabel);
        radioRow.appendChild(randomRadio);
        radioRow.appendChild(randomLabel);
        designSection.appendChild(radioRow);
        content.appendChild(designSection);

        // Designation-specific inputs
        if (this.designation === 0) {
            // Direct - Troop dropdown
            const troopRow = document.createElement('div');
            troopRow.style.cssText = 'display: flex; align-items: center; gap: 8px;';

            const troopLabel = document.createElement('span');
            troopLabel.textContent = tt('Troop:');
            troopLabel.style.cssText = 'color: var(--color-text); font-size: 13px; min-width: 120px;';

            const troopSelect = document.createElement('select');
            troopSelect.style.cssText = 'padding: 6px 10px; background-color: var(--color-bg-input); color: var(--color-text); border: 1px solid var(--color-border-input); border-radius: 3px; font-size: 12px; flex: 1;';

            const troops = this.databaseManager.data.troops;
            if (troops) {
                for (let i = 1; i < troops.length; i++) {
                    const troop = troops[i];
                    if (troop) {
                        const option = document.createElement('option');
                        option.value = i;
                        option.textContent = `${i.toString().padStart(4, '0')}: ${troop.name || tt('Unnamed')}`;
                        if (i === this.troopId) {
                            option.selected = true;
                        }
                        troopSelect.appendChild(option);
                    }
                }
            }

            troopSelect.addEventListener('change', (e) => {
                this.troopId = parseInt(e.target.value);
            });

            troopRow.appendChild(troopLabel);
            troopRow.appendChild(troopSelect);
            content.appendChild(troopRow);
        } else if (this.designation === 1) {
            // Variable - variable input + browse
            const varRow = document.createElement('div');
            varRow.style.cssText = 'display: flex; align-items: center; gap: 8px;';

            const varRowLabel = document.createElement('span');
            varRowLabel.textContent = tt('Variable:');
            varRowLabel.style.cssText = 'color: var(--color-text); font-size: 13px; min-width: 120px;';

            const varInput = document.createElement('input');
            varInput.type = 'number';
            varInput.min = 1;
            varInput.value = this.troopId;
            varInput.style.cssText = 'padding: 6px 10px; background-color: var(--color-bg-input); color: var(--color-text); border: 1px solid var(--color-border-input); border-radius: 3px; font-size: 12px; width: 80px;';
            varInput.addEventListener('input', (e) => {
                this.troopId = parseInt(e.target.value) || 1;
            });

            const varBrowse = document.createElement('button');
            varBrowse.textContent = '...';
            varBrowse.className = 'rr-btn-browse';
            varBrowse.addEventListener('click', () => this.browseVariables('troopId'));

            varRow.appendChild(varRowLabel);
            varRow.appendChild(varInput);
            varRow.appendChild(varBrowse);
            content.appendChild(varRow);
        }
        // Random encounter - no extra input needed

        // Separator
        const separator = document.createElement('div');
        separator.style.cssText = 'border-top: 1px solid var(--color-border); padding-top: 8px;';

        // Can Escape checkbox
        const escapeRow = document.createElement('div');
        escapeRow.style.cssText = 'display: flex; align-items: center; gap: 8px;';

        const escapeCheckbox = document.createElement('input');
        escapeCheckbox.type = 'checkbox';
        escapeCheckbox.id = 'battle-can-escape';
        escapeCheckbox.checked = this.canEscape;
        escapeCheckbox.addEventListener('change', (e) => {
            this.canEscape = e.target.checked;
        });

        const escapeLabel = document.createElement('label');
        escapeLabel.htmlFor = 'battle-can-escape';
        escapeLabel.textContent = tt('Can Escape');
        escapeLabel.style.cssText = 'color: var(--color-text); font-size: 13px; cursor: pointer;';

        escapeRow.appendChild(escapeCheckbox);
        escapeRow.appendChild(escapeLabel);
        separator.appendChild(escapeRow);

        // Can Lose checkbox
        const loseRow = document.createElement('div');
        loseRow.style.cssText = 'display: flex; align-items: center; gap: 8px; margin-top: 8px;';

        const loseCheckbox = document.createElement('input');
        loseCheckbox.type = 'checkbox';
        loseCheckbox.id = 'battle-can-lose';
        loseCheckbox.checked = this.canLose;
        loseCheckbox.addEventListener('change', (e) => {
            this.canLose = e.target.checked;
        });

        const loseLabel = document.createElement('label');
        loseLabel.htmlFor = 'battle-can-lose';
        loseLabel.textContent = tt('Can Lose');
        loseLabel.style.cssText = 'color: var(--color-text); font-size: 13px; cursor: pointer;';

        loseRow.appendChild(loseCheckbox);
        loseRow.appendChild(loseLabel);
        separator.appendChild(loseRow);

        content.appendChild(separator);
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
            code: 301,
            indent: 0,
            parameters: [this.designation, this.troopId, this.canEscape, this.canLose]
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
    module.exports = BattleProcessingEditor;
}
