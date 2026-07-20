/**
 * ControlSwitchesEditor - Editor for Control Switches event command (code 121)
 */
class ControlSwitchesEditor {
    constructor(databaseManager, projectController) {
        this.databaseManager = databaseManager;
        this.projectController = projectController;
        ControlSwitchesEditor.nextInputScope = (ControlSwitchesEditor.nextInputScope || 0) + 1;
        this.inputScope = `control-switches-${ControlSwitchesEditor.nextInputScope}`;
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
        this.previouslyFocused = document.activeElement;

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
        setTimeout(() => {
            const target = this.modal && (
                this.modal.querySelector('input:checked') ||
                this.modal.querySelector('button, input')
            );
            if (target) target.focus();
        }, 0);
    }

    /**
     * Create modal structure
     */
    createModal() {
        this.modal = document.createElement('div');
        this.modal.className = 'control-switches-editor-modal rr-modal-overlay rr-event-command-modal';
        this.modal.style.display = 'none';
        this.modal.setAttribute('role', 'dialog');
        this.modal.setAttribute('aria-modal', 'true');
        this.modal.setAttribute('aria-labelledby', `${this.inputScope}-title`);

        const container = document.createElement('div');
        container.className = 'control-switches-container rr-modal rr-event-command-dialog rr-switch-command-dialog';

        this.modal.appendChild(container);

        this.modal.addEventListener('click', (e) => {
            if (e.target === this.modal) {
                this.close();
            }
        });
        this.modal.addEventListener('keydown', event => {
            if (event.key === 'Escape') this.close();
        });

        document.body.appendChild(this.modal);
    }

    /**
     * Render modal content
     */
    renderContent() {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        const container = this.modal.querySelector('.control-switches-container');
        container.innerHTML = '';

        // Header
        const header = document.createElement('div');
        header.className = 'rr-modal-header';
        const title = document.createElement('div');
        title.className = 'rr-modal-title';
        title.id = `${this.inputScope}-title`;
        title.textContent = tt('Control Switches');
        const closeButton = document.createElement('button');
        closeButton.className = 'close-btn rr-modal-close';
        closeButton.setAttribute('aria-label', tt('Close'));
        closeButton.textContent = '×';
        header.appendChild(title);
        header.appendChild(closeButton);
        container.appendChild(header);

        closeButton.addEventListener('click', () => this.close());

        // Content
        const content = document.createElement('div');
        content.className = 'rr-modal-body';

        const targetPanel = this.createPanel('Switch');
        const targetBody = targetPanel.querySelector('.rr-command-card-body');

        const targetList = document.createElement('div');
        targetList.className = 'rr-command-target-list';

        const singleRadio = document.createElement('input');
        singleRadio.type = 'radio';
        singleRadio.name = `${this.inputScope}-mode`;
        singleRadio.id = `${this.inputScope}-single`;
        singleRadio.checked = this.singleSwitch;
        singleRadio.addEventListener('change', () => {
            this.singleSwitch = true;
            this.endId = this.startId;
            this.renderContent();
        });
        const singleRow = document.createElement('div');
        singleRow.className = 'rr-command-target-row';
        const singleLabel = document.createElement('label');
        singleLabel.htmlFor = singleRadio.id;
        singleLabel.textContent = tt('Single');
        singleRow.appendChild(singleRadio);
        singleRow.appendChild(singleLabel);
        singleRow.appendChild(this.createSwitchReferenceControl(!this.singleSwitch));
        targetList.appendChild(singleRow);

        const batchRadio = document.createElement('input');
        batchRadio.type = 'radio';
        batchRadio.name = `${this.inputScope}-mode`;
        batchRadio.id = `${this.inputScope}-range`;
        batchRadio.checked = !this.singleSwitch;
        batchRadio.addEventListener('change', () => {
            this.singleSwitch = false;
            if (this.endId < this.startId) this.endId = this.startId;
            this.renderContent();
        });
        const rangeRow = document.createElement('div');
        rangeRow.className = 'rr-command-target-row';
        const batchLabel = document.createElement('label');
        batchLabel.htmlFor = batchRadio.id;
        batchLabel.textContent = tt('Range');
        rangeRow.appendChild(batchRadio);
        rangeRow.appendChild(batchLabel);
        rangeRow.appendChild(this.createSwitchRangeControls(!this.singleSwitch));
        targetList.appendChild(rangeRow);
        targetBody.appendChild(targetList);
        content.appendChild(targetPanel);

        // Operation (ON/OFF)
        const operationPanel = this.createPanel('Operation');
        operationPanel.querySelector('.rr-command-card-body').appendChild(this.createOperationSelector());
        content.appendChild(operationPanel);

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

    createPanel(title) {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        const panel = document.createElement('div');
        panel.className = 'rr-command-card';
        const heading = document.createElement('div');
        heading.className = 'rr-command-card-title';
        heading.textContent = tt(title);
        const body = document.createElement('div');
        body.className = 'rr-command-card-body';
        panel.appendChild(heading);
        panel.appendChild(body);
        return panel;
    }

    createSwitchReferenceControl(disabled) {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        const system = this.databaseManager && this.databaseManager.getSystem
            ? this.databaseManager.getSystem() || {}
            : {};
        const switchName = Array.isArray(system.switches) && typeof system.switches[this.startId] === 'string'
            ? system.switches[this.startId].trim()
            : '';
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'rr-variable-reference';
        button.disabled = disabled;
        const label = document.createElement('span');
        label.className = 'rr-variable-reference-label';
        label.textContent = `${String(this.startId).padStart(4, '0')} ${switchName || `${tt('Switch')} ${this.startId}`}`;
        const more = document.createElement('span');
        more.textContent = '...';
        button.appendChild(label);
        button.appendChild(more);
        button.addEventListener('click', () => {
            const picker = new SwitchVariablePicker(this.databaseManager, this.projectController);
            picker.show('switch', this.startId, selectedId => {
                if (selectedId) {
                    this.startId = selectedId;
                    this.endId = selectedId;
                    this.renderContent();
                }
            });
        });
        return button;
    }

    createSwitchRangeControls(enabled) {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        const controls = document.createElement('div');
        controls.className = 'rr-command-range-controls';
        const start = document.createElement('input');
        start.type = 'number';
        start.min = 1;
        start.max = 9999;
        start.value = this.startId;
        start.disabled = !enabled;
        start.setAttribute('aria-label', `${tt('Switch')} 1`);
        start.addEventListener('input', event => {
            this.startId = Math.min(9999, Math.max(1, parseInt(event.target.value, 10) || 1));
            event.target.value = this.startId;
            if (this.endId < this.startId) {
                this.endId = this.startId;
                end.value = this.endId;
            }
        });
        const separator = document.createElement('span');
        separator.className = 'rr-command-range-separator';
        separator.textContent = '~';
        const end = document.createElement('input');
        end.type = 'number';
        end.min = 1;
        end.max = 9999;
        end.value = this.endId;
        end.disabled = !enabled;
        end.setAttribute('aria-label', `${tt('Switch')} 2`);
        end.addEventListener('input', event => {
            this.endId = Math.min(9999, Math.max(
                this.startId,
                parseInt(event.target.value, 10) || this.startId
            ));
            event.target.value = this.endId;
        });
        controls.appendChild(start);
        controls.appendChild(separator);
        controls.appendChild(end);
        return controls;
    }

    /**
     * Create operation selector (ON/OFF)
     */
    createOperationSelector() {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        const section = document.createElement('div');
        section.className = 'rr-command-inline-options';

        const onRadio = document.createElement('input');
        onRadio.type = 'radio';
        onRadio.name = `${this.inputScope}-value`;
        onRadio.id = `${this.inputScope}-on`;
        onRadio.checked = (this.value === 0);
        onRadio.addEventListener('change', () => {
            this.value = 0;
        });

        const onLabel = document.createElement('label');
        onLabel.className = 'rr-command-inline-option';
        onLabel.htmlFor = onRadio.id;
        onLabel.appendChild(onRadio);
        onLabel.appendChild(document.createTextNode(tt('ON')));

        const offRadio = document.createElement('input');
        offRadio.type = 'radio';
        offRadio.name = `${this.inputScope}-value`;
        offRadio.id = `${this.inputScope}-off`;
        offRadio.checked = (this.value === 1);
        offRadio.addEventListener('change', () => {
            this.value = 1;
        });

        const offLabel = document.createElement('label');
        offLabel.className = 'rr-command-inline-option';
        offLabel.htmlFor = offRadio.id;
        offLabel.appendChild(offRadio);
        offLabel.appendChild(document.createTextNode(tt('OFF')));

        section.appendChild(onLabel);
        section.appendChild(offLabel);

        return section;
    }

    /**
     * Browse switches using SwitchVariablePicker
     */
    browseSwitches() {
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
        const startId = Math.min(9999, Math.max(1, parseInt(this.startId, 10) || 1));
        const endId = this.singleSwitch
            ? startId
            : Math.min(9999, Math.max(startId, parseInt(this.endId, 10) || startId));
        return {
            code: 121,
            indent: 0,
            parameters: [
                startId,
                endId,
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
        if (this.previouslyFocused && this.previouslyFocused.isConnected) {
            this.previouslyFocused.focus();
        }
        this.previouslyFocused = null;
    }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ControlSwitchesEditor;
}
