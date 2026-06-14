/**
 * ChangeStateEditor - Editor for Change State event command (code 313)
 */
class ChangeStateEditor {
    constructor(databaseManager, projectController) {
        this.databaseManager = databaseManager;
        this.projectController = projectController;
        this.modal = null;
        this.callback = null;

        // Parameters: [actorSelect, actorId, operation, stateId]
        this.actorSelect = 0; // 0=Fixed, 1=Variable
        this.actorId = 1;
        this.operation = 0; // 0=Add, 1=Remove
        this.stateId = 1;
    }

    show(command, callback) {
        this.callback = callback;

        if (command && command.code === 313) {
            const params = command.parameters;
            this.actorSelect = params[0] || 0;
            this.actorId = params[1] || 1;
            this.operation = params[2] || 0;
            this.stateId = params[3] || 1;
        } else {
            this.actorSelect = 0;
            this.actorId = 1;
            this.operation = 0;
            this.stateId = 1;
        }

        if (!this.modal) {
            this.createModal();
        }

        this.renderContent();
        this.modal.style.display = 'flex';
    }

    createModal() {
        this.modal = document.createElement('div');
        this.modal.className = 'change-state-editor-modal';
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
        container.className = 'change-state-container';
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

    renderContent() {
        const container = this.modal.querySelector('.change-state-container');
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
            <h3 style="margin: 0; color: var(--color-text-strong); font-size: 16px;">Change State</h3>
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

        // Actor selector
        content.appendChild(this.createActorSelector());

        // Operation (Add/Remove)
        const operationRow = document.createElement('div');
        operationRow.style.cssText = 'display: flex; gap: 12px;';

        const addRadio = document.createElement('input');
        addRadio.type = 'radio';
        addRadio.name = 'operation-313';
        addRadio.id = 'add-313';
        addRadio.checked = (this.operation === 0);
        addRadio.addEventListener('change', () => { this.operation = 0; });

        const addLabel = document.createElement('label');
        addLabel.htmlFor = 'add-313';
        addLabel.textContent = 'Add';
        addLabel.style.cssText = 'color: var(--color-text); cursor: pointer;';

        const removeRadio = document.createElement('input');
        removeRadio.type = 'radio';
        removeRadio.name = 'operation-313';
        removeRadio.id = 'remove-313';
        removeRadio.checked = (this.operation === 1);
        removeRadio.addEventListener('change', () => { this.operation = 1; });

        const removeLabel = document.createElement('label');
        removeLabel.htmlFor = 'remove-313';
        removeLabel.textContent = 'Remove';
        removeLabel.style.cssText = 'color: var(--color-text); cursor: pointer;';

        operationRow.appendChild(addRadio);
        operationRow.appendChild(addLabel);
        operationRow.appendChild(removeRadio);
        operationRow.appendChild(removeLabel);
        content.appendChild(operationRow);

        // State selector
        const stateRow = document.createElement('div');
        stateRow.style.cssText = 'display: flex; align-items: center; gap: 8px; padding-top: 8px; border-top: 1px solid var(--color-border);';

        const stateLabel = document.createElement('span');
        stateLabel.textContent = 'State:';
        stateLabel.style.cssText = 'color: var(--color-text); font-size: 13px; min-width: 100px;';

        const stateSelect = document.createElement('select');
        stateSelect.style.cssText = 'padding:6px 10px; background-color:var(--color-bg-input); color:var(--color-text); border:1px solid var(--color-border-input); border-radius:3px; font-size:12px; flex:1;';

        const states = this.databaseManager.data.states || [];
        for (let i = 1; i < states.length; i++) {
            if (!states[i]) continue;
            const option = document.createElement('option');
            option.value = i;
            option.textContent = `${i.toString().padStart(4, '0')}: ${states[i].name || 'Unnamed'}`;
            option.selected = (this.stateId === i);
            stateSelect.appendChild(option);
        }
        stateSelect.addEventListener('change', (e) => { this.stateId = parseInt(e.target.value); });

        stateRow.appendChild(stateLabel);
        stateRow.appendChild(stateSelect);
        content.appendChild(stateRow);

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

    createActorSelector() {
        const section = document.createElement('div');
        section.style.cssText = 'display: flex; flex-direction: column; gap: 8px; padding-bottom: 8px; border-bottom: 1px solid var(--color-border);';

        // Fixed actor radio
        const fixedRow = document.createElement('div');
        fixedRow.style.cssText = 'display: flex; align-items: center; gap: 8px;';
        const fixedRadio = document.createElement('input');
        fixedRadio.type = 'radio'; fixedRadio.name = 'actor-select-313'; fixedRadio.id = 'actor-fixed-313';
        fixedRadio.checked = (this.actorSelect === 0);
        fixedRadio.addEventListener('change', () => { this.actorSelect = 0; this.renderContent(); });
        const fixedLabel = document.createElement('label');
        fixedLabel.htmlFor = 'actor-fixed-313'; fixedLabel.textContent = 'Fixed';
        fixedLabel.style.cssText = 'color: var(--color-text); cursor: pointer; min-width: 60px;';
        fixedRow.appendChild(fixedRadio); fixedRow.appendChild(fixedLabel);

        if (this.actorSelect === 0) {
            const select = document.createElement('select');
            select.style.cssText = 'padding:6px 10px; background-color:var(--color-bg-input); color:var(--color-text); border:1px solid var(--color-border-input); border-radius:3px; font-size:12px; flex:1;';
            const actors = this.databaseManager.data.actors || [];
            for (let i = 1; i < actors.length; i++) {
                if (!actors[i]) continue;
                const option = document.createElement('option');
                option.value = i; option.textContent = `${i.toString().padStart(4, '0')}: ${actors[i].name || 'Unnamed'}`;
                option.selected = (this.actorId === i);
                select.appendChild(option);
            }
            select.addEventListener('change', (e) => { this.actorId = parseInt(e.target.value); });
            fixedRow.appendChild(select);
        }
        section.appendChild(fixedRow);

        // Variable radio
        const varRow = document.createElement('div');
        varRow.style.cssText = 'display: flex; align-items: center; gap: 8px;';
        const varRadio = document.createElement('input');
        varRadio.type = 'radio'; varRadio.name = 'actor-select-313'; varRadio.id = 'actor-variable-313';
        varRadio.checked = (this.actorSelect === 1);
        varRadio.addEventListener('change', () => { this.actorSelect = 1; this.renderContent(); });
        const varLabel = document.createElement('label');
        varLabel.htmlFor = 'actor-variable-313'; varLabel.textContent = 'Variable';
        varLabel.style.cssText = 'color: var(--color-text); cursor: pointer; min-width: 60px;';
        varRow.appendChild(varRadio); varRow.appendChild(varLabel);

        if (this.actorSelect === 1) {
            const varInput = document.createElement('input');
            varInput.type = 'number'; varInput.min = 1; varInput.max = 9999; varInput.value = this.actorId || 1;
            varInput.style.cssText = 'padding:6px 10px; background-color:var(--color-bg-input); color:var(--color-text); border:1px solid var(--color-border-input); border-radius:3px; font-size:12px; width:80px;';
            varInput.addEventListener('input', (e) => { this.actorId = parseInt(e.target.value) || 1; });
            varRow.appendChild(varInput);
            const browseBtn = document.createElement('button');
            browseBtn.textContent = '...';
            browseBtn.className = 'rr-btn-browse';
            browseBtn.addEventListener('click', () => this.browseVariables('actorId'));
            varRow.appendChild(browseBtn);
        }
        section.appendChild(varRow);
        return section;
    }

    browseVariables(property) {
        const picker = new SwitchVariablePicker(this.databaseManager, this.projectController);
        picker.show('variable', this[property] || 1, (selectedId) => {
            if (selectedId) { this[property] = selectedId; this.renderContent(); }
        });
    }

    buildCommand() {
        return {
            code: 313,
            indent: 0,
            parameters: [this.actorSelect, this.actorId, this.operation, this.stateId]
        };
    }

    save() {
        if (this.callback) {
            const command = this.buildCommand();
            this.callback(command);
        }
        this.close();
    }

    close() {
        if (this.modal) {
            this.modal.style.display = 'none';
        }
    }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ChangeStateEditor;
}
