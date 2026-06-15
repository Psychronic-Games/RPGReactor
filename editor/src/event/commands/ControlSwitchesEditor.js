/**
 * ControlSwitchesEditor - Editor for Control Switches event command (code 121)
 */
class ControlSwitchesEditor {
    constructor(databaseManager, projectController) {
        this.databaseManager = databaseManager;
        this.projectController = projectController;
        this.modal = null;
        this.callback = null;
        this.startId = 1;
        this.endId = 1;
        this.value = 0; // 0=ON, 1=OFF
        this.singleSwitch = true;
    }

    /**
     * Show editor for a control switches command
     * @param {object} command - The command to edit (or null for new)
     * @param {function} callback - Callback when done editing
     */
    show(command, callback) {
        this.callback = callback;

        if (command && command.code === 121) {
            const params = command.parameters;
            this.startId = params[0] || 1;
            this.endId = params[1] || 1;
            this.value = params[2] || 0;
            this.singleSwitch = (this.startId === this.endId);
        } else {
            this.startId = 1;
            this.endId = 1;
            this.value = 0;
            this.singleSwitch = true;
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
        this.modal.className = 'control-switches-editor-modal';
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
        container.className = 'control-switches-container';
        container.style.cssText = `
            background-color: var(--color-bg-surface);
            border: 1px solid var(--color-border);
            border-radius: 6px;
            width: 500px;
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
        const container = this.modal.querySelector('.control-switches-container');
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
            <h3 style="margin: 0; color: var(--color-text-strong); font-size: 16px;">Control Switches</h3>
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
            gap: 12px;
        `;

        // Single/Batch toggle
        const toggleRow = document.createElement('div');
        toggleRow.style.cssText = 'display: flex; gap: 12px;';

        const singleRadio = document.createElement('input');
        singleRadio.type = 'radio';
        singleRadio.name = 'switch-mode';
        singleRadio.id = 'single-switch';
        singleRadio.checked = this.singleSwitch;
        singleRadio.addEventListener('change', () => {
            this.singleSwitch = true;
            this.endId = this.startId;
            this.renderContent();
        });

        const singleLabel = document.createElement('label');
        singleLabel.htmlFor = 'single-switch';
        singleLabel.textContent = 'Single';
        singleLabel.style.cssText = 'color: var(--color-text); cursor: pointer;';

        const batchRadio = document.createElement('input');
        batchRadio.type = 'radio';
        batchRadio.name = 'switch-mode';
        batchRadio.id = 'batch-switch';
        batchRadio.checked = !this.singleSwitch;
        batchRadio.addEventListener('change', () => {
            this.singleSwitch = false;
            this.renderContent();
        });

        const batchLabel = document.createElement('label');
        batchLabel.htmlFor = 'batch-switch';
        batchLabel.textContent = 'Batch';
        batchLabel.style.cssText = 'color: var(--color-text); cursor: pointer;';

        toggleRow.appendChild(singleRadio);
        toggleRow.appendChild(singleLabel);
        toggleRow.appendChild(batchRadio);
        toggleRow.appendChild(batchLabel);
        content.appendChild(toggleRow);

        // Switch selection
        if (this.singleSwitch) {
            content.appendChild(this.createSingleSwitchSelector());
        } else {
            content.appendChild(this.createBatchSwitchSelector());
        }

        // Operation (ON/OFF)
        content.appendChild(this.createOperationSelector());

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
     * Create single switch selector
     */
    createSingleSwitchSelector() {
        const section = document.createElement('div');
        section.style.cssText = 'display: flex; align-items: center; gap: 8px;';

        const label = document.createElement('span');
        label.textContent = 'Switch:';
        label.style.cssText = 'color: var(--color-text); font-size: 13px; min-width: 60px;';

        const input = document.createElement('input');
        input.type = 'number';
        input.min = 1;
        input.max = 9999;
        input.value = this.startId;
        input.style.cssText = `
            padding: 6px 10px;
            background-color: var(--color-bg-input);
            color: var(--color-text);
            border: 1px solid var(--color-border-input);
            border-radius: 3px;
            font-size: 12px;
            width: 80px;
        `;
        input.addEventListener('input', (e) => {
            this.startId = parseInt(e.target.value) || 1;
            this.endId = this.startId;
        });

        const browseBtn = document.createElement('button');
        browseBtn.textContent = '...';
        browseBtn.className = 'rr-btn-browse';
        browseBtn.addEventListener('click', () => this.browseSwitches());

        section.appendChild(label);
        section.appendChild(input);
        section.appendChild(browseBtn);

        return section;
    }

    /**
     * Create batch switch selector
     */
    createBatchSwitchSelector() {
        const section = document.createElement('div');
        section.style.cssText = 'display: flex; flex-direction: column; gap: 8px;';

        // Start switch
        const startRow = document.createElement('div');
        startRow.style.cssText = 'display: flex; align-items: center; gap: 8px;';

        const startLabel = document.createElement('span');
        startLabel.textContent = 'From:';
        startLabel.style.cssText = 'color: var(--color-text); font-size: 13px; min-width: 60px;';

        const startInput = document.createElement('input');
        startInput.type = 'number';
        startInput.min = 1;
        startInput.max = 9999;
        startInput.value = this.startId;
        startInput.style.cssText = `
            padding: 6px 10px;
            background-color: var(--color-bg-input);
            color: var(--color-text);
            border: 1px solid var(--color-border-input);
            border-radius: 3px;
            font-size: 12px;
            width: 80px;
        `;
        startInput.addEventListener('input', (e) => {
            this.startId = parseInt(e.target.value) || 1;
            if (this.startId > this.endId) {
                this.endId = this.startId;
                this.renderContent();
            }
        });

        startRow.appendChild(startLabel);
        startRow.appendChild(startInput);

        // End switch
        const endRow = document.createElement('div');
        endRow.style.cssText = 'display: flex; align-items: center; gap: 8px;';

        const endLabel = document.createElement('span');
        endLabel.textContent = 'To:';
        endLabel.style.cssText = 'color: var(--color-text); font-size: 13px; min-width: 60px;';

        const endInput = document.createElement('input');
        endInput.type = 'number';
        endInput.min = this.startId;
        endInput.max = 9999;
        endInput.value = this.endId;
        endInput.style.cssText = `
            padding: 6px 10px;
            background-color: var(--color-bg-input);
            color: var(--color-text);
            border: 1px solid var(--color-border-input);
            border-radius: 3px;
            font-size: 12px;
            width: 80px;
        `;
        endInput.addEventListener('input', (e) => {
            this.endId = parseInt(e.target.value) || this.startId;
            if (this.endId < this.startId) {
                this.endId = this.startId;
            }
        });

        endRow.appendChild(endLabel);
        endRow.appendChild(endInput);

        section.appendChild(startRow);
        section.appendChild(endRow);

        return section;
    }

    /**
     * Create operation selector (ON/OFF)
     */
    createOperationSelector() {
        const section = document.createElement('div');
        section.style.cssText = 'display: flex; align-items: center; gap: 8px; padding-top: 8px; border-top: 1px solid var(--color-border);';

        const label = document.createElement('span');
        label.textContent = 'Operation:';
        label.style.cssText = 'color: var(--color-text); font-size: 13px; min-width: 80px;';

        const onRadio = document.createElement('input');
        onRadio.type = 'radio';
        onRadio.name = 'switch-value';
        onRadio.id = 'switch-on';
        onRadio.checked = (this.value === 0);
        onRadio.addEventListener('change', () => {
            this.value = 0;
        });

        const onLabel = document.createElement('label');
        onLabel.htmlFor = 'switch-on';
        onLabel.textContent = 'ON';
        onLabel.style.cssText = 'color: var(--color-text); cursor: pointer;';

        const offRadio = document.createElement('input');
        offRadio.type = 'radio';
        offRadio.name = 'switch-value';
        offRadio.id = 'switch-off';
        offRadio.checked = (this.value === 1);
        offRadio.addEventListener('change', () => {
            this.value = 1;
        });

        const offLabel = document.createElement('label');
        offLabel.htmlFor = 'switch-off';
        offLabel.textContent = 'OFF';
        offLabel.style.cssText = 'color: var(--color-text); cursor: pointer;';

        section.appendChild(label);
        section.appendChild(onRadio);
        section.appendChild(onLabel);
        section.appendChild(offRadio);
        section.appendChild(offLabel);

        return section;
    }

    /**
     * Browse switches using SwitchVariablePicker
     */
    browseSwitches() {
        // Use the existing SwitchVariablePicker
        const picker = new SwitchVariablePicker(this.databaseManager, this.projectController);
        picker.show('switch', this.startId, (selectedId) => {
            if (selectedId) {
                this.startId = selectedId;
                if (this.singleSwitch) {
                    this.endId = selectedId;
                }
                this.renderContent();
            }
        });
    }

    /**
     * Build command from current data
     */
    buildCommand() {
        return {
            code: 121,
            indent: 0,
            parameters: [
                this.startId,
                this.endId,
                this.value
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
    module.exports = ControlSwitchesEditor;
}
