/**
 * ChangeEnemyStateEditor - Editor for Change Enemy State event command (code 333)
 */
class ChangeEnemyStateEditor {
    constructor(databaseManager, projectController) {
        this.databaseManager = databaseManager;
        this.projectController = projectController;
        this.modal = null;
        this.callback = null;

        // Parameters: [enemyIndex, operation, stateId]
        this.enemyIndex = 0; // 0-7 (enemy member index)
        this.operation = 0; // 0=Add, 1=Remove
        this.stateId = 1;
    }

    show(command, callback) {
        this.callback = callback;

        if (command && command.code === 333) {
            const params = command.parameters;
            this.enemyIndex = params[0] || 0;
            this.operation = params[1] || 0;
            this.stateId = params[2] || 1;
        } else {
            this.enemyIndex = 0;
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
        this.modal.className = 'change-enemy-state-editor-modal';
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
        container.className = 'change-enemy-state-container';
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
        const container = this.modal.querySelector('.change-enemy-state-container');
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
            <h3 style="margin: 0; color: var(--color-text-strong); font-size: 16px;">Change Enemy State</h3>
            <button class="close-btn" style="background: none; border: none; color: var(--color-text-strong); font-size: 20px; cursor: pointer; padding: 0; width: 24px; height: 24px;">\u00d7</button>
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

        // Enemy index selector
        content.appendChild(this.createEnemyIndexSelector());

        // Operation (Add/Remove)
        content.appendChild(this.createOperationSection());

        // State dropdown
        content.appendChild(this.createStateSelector());

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

    createEnemyIndexSelector() {
        const section = document.createElement('div');
        section.style.cssText = 'display: flex; align-items: center; gap: 8px;';
        const label = document.createElement('span');
        label.textContent = 'Enemy:';
        label.style.cssText = 'color: var(--color-text); font-size: 13px; min-width: 100px;';
        const select = document.createElement('select');
        select.style.cssText = 'padding:6px 10px; background-color:var(--color-bg-input); color:var(--color-text); border:1px solid var(--color-border-input); border-radius:3px; font-size:12px; flex:1;';
        for (let i = 0; i <= 7; i++) {
            const option = document.createElement('option');
            option.value = i;
            option.textContent = `#${i + 1}`;
            option.selected = (this.enemyIndex === i);
            select.appendChild(option);
        }
        select.addEventListener('change', (e) => { this.enemyIndex = parseInt(e.target.value); });
        section.appendChild(label);
        section.appendChild(select);
        return section;
    }

    createOperationSection() {
        const section = document.createElement('div');
        section.style.cssText = 'display: flex; gap: 12px;';

        const addRadio = document.createElement('input');
        addRadio.type = 'radio';
        addRadio.name = 'operation-333';
        addRadio.id = 'add-333';
        addRadio.checked = (this.operation === 0);
        addRadio.addEventListener('change', () => { this.operation = 0; });

        const addLabel = document.createElement('label');
        addLabel.htmlFor = 'add-333';
        addLabel.textContent = 'Add';
        addLabel.style.cssText = 'color: var(--color-text); cursor: pointer;';

        const removeRadio = document.createElement('input');
        removeRadio.type = 'radio';
        removeRadio.name = 'operation-333';
        removeRadio.id = 'remove-333';
        removeRadio.checked = (this.operation === 1);
        removeRadio.addEventListener('change', () => { this.operation = 1; });

        const removeLabel = document.createElement('label');
        removeLabel.htmlFor = 'remove-333';
        removeLabel.textContent = 'Remove';
        removeLabel.style.cssText = 'color: var(--color-text); cursor: pointer;';

        section.appendChild(addRadio);
        section.appendChild(addLabel);
        section.appendChild(removeRadio);
        section.appendChild(removeLabel);
        return section;
    }

    createStateSelector() {
        const section = document.createElement('div');
        section.style.cssText = 'display: flex; align-items: center; gap: 8px; padding-top: 8px; border-top: 1px solid var(--color-border);';

        const label = document.createElement('span');
        label.textContent = 'State:';
        label.style.cssText = 'color: var(--color-text); font-size: 13px; min-width: 100px;';

        const select = document.createElement('select');
        select.style.cssText = 'padding:6px 10px; background-color:var(--color-bg-input); color:var(--color-text); border:1px solid var(--color-border-input); border-radius:3px; font-size:12px; flex:1;';

        const states = this.databaseManager.data.states || [];
        for (let i = 1; i < states.length; i++) {
            if (!states[i]) continue;
            const option = document.createElement('option');
            option.value = i;
            option.textContent = `${i.toString().padStart(4, '0')}: ${states[i].name || 'Unnamed'}`;
            option.selected = (this.stateId === i);
            select.appendChild(option);
        }

        select.addEventListener('change', (e) => { this.stateId = parseInt(e.target.value); });

        section.appendChild(label);
        section.appendChild(select);
        return section;
    }

    buildCommand() {
        return {
            code: 333,
            indent: 0,
            parameters: [this.enemyIndex, this.operation, this.stateId]
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
    module.exports = ChangeEnemyStateEditor;
}
