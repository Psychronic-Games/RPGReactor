/**
 * ChangeSkillEditor - Editor for Change Skill event command (code 318)
 */
class ChangeSkillEditor {
    constructor(databaseManager, projectController) {
        this.databaseManager = databaseManager;
        this.projectController = projectController;
        this.modal = null;
        this.callback = null;

        // Parameters: [actorSelect, actorId, operation, skillId]
        this.actorSelect = 0; // 0=Fixed, 1=Variable
        this.actorId = 1;
        this.operation = 0; // 0=Learn, 1=Forget
        this.skillId = 1;
    }

    show(command, callback) {
        this.callback = callback;

        if (command && command.code === 318) {
            const params = command.parameters;
            this.actorSelect = params[0] || 0;
            this.actorId = params[1] || 1;
            this.operation = params[2] || 0;
            this.skillId = params[3] || 1;
        } else {
            this.actorSelect = 0;
            this.actorId = 1;
            this.operation = 0;
            this.skillId = 1;
        }

        if (!this.modal) {
            this.createModal();
        }

        this.renderContent();
        this.modal.style.display = 'flex';
    }

    createModal() {
        this.modal = document.createElement('div');
        this.modal.className = 'change-skill-editor-modal';
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
        container.className = 'change-skill-container';
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
        const container = this.modal.querySelector('.change-skill-container');
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
            <h3 style="margin: 0; color: var(--color-text-strong); font-size: 16px;">Change Skill</h3>
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

        // Operation (Learn/Forget)
        const operationRow = document.createElement('div');
        operationRow.style.cssText = 'display: flex; gap: 12px;';

        const learnRadio = document.createElement('input');
        learnRadio.type = 'radio';
        learnRadio.name = 'operation-318';
        learnRadio.id = 'learn-318';
        learnRadio.checked = (this.operation === 0);
        learnRadio.addEventListener('change', () => { this.operation = 0; });

        const learnLabel = document.createElement('label');
        learnLabel.htmlFor = 'learn-318';
        learnLabel.textContent = 'Learn';
        learnLabel.style.cssText = 'color: var(--color-text); cursor: pointer;';

        const forgetRadio = document.createElement('input');
        forgetRadio.type = 'radio';
        forgetRadio.name = 'operation-318';
        forgetRadio.id = 'forget-318';
        forgetRadio.checked = (this.operation === 1);
        forgetRadio.addEventListener('change', () => { this.operation = 1; });

        const forgetLabel = document.createElement('label');
        forgetLabel.htmlFor = 'forget-318';
        forgetLabel.textContent = 'Forget';
        forgetLabel.style.cssText = 'color: var(--color-text); cursor: pointer;';

        operationRow.appendChild(learnRadio);
        operationRow.appendChild(learnLabel);
        operationRow.appendChild(forgetRadio);
        operationRow.appendChild(forgetLabel);
        content.appendChild(operationRow);

        // Skill selector
        const skillRow = document.createElement('div');
        skillRow.style.cssText = 'display: flex; align-items: center; gap: 8px; padding-top: 8px; border-top: 1px solid var(--color-border);';

        const skillLabel = document.createElement('span');
        skillLabel.textContent = 'Skill:';
        skillLabel.style.cssText = 'color: var(--color-text); font-size: 13px; min-width: 100px;';

        const skillSelect = document.createElement('select');
        skillSelect.style.cssText = 'padding:6px 10px; background-color:var(--color-bg-input); color:var(--color-text); border:1px solid var(--color-border-input); border-radius:3px; font-size:12px; flex:1;';

        const skills = this.databaseManager.data.skills || [];
        for (let i = 1; i < skills.length; i++) {
            if (!skills[i]) continue;
            const option = document.createElement('option');
            option.value = i;
            option.textContent = `${i.toString().padStart(4, '0')}: ${skills[i].name || 'Unnamed'}`;
            option.selected = (this.skillId === i);
            skillSelect.appendChild(option);
        }
        skillSelect.addEventListener('change', (e) => { this.skillId = parseInt(e.target.value); });

        skillRow.appendChild(skillLabel);
        skillRow.appendChild(skillSelect);
        content.appendChild(skillRow);

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
        fixedRadio.type = 'radio'; fixedRadio.name = 'actor-select-318'; fixedRadio.id = 'actor-fixed-318';
        fixedRadio.checked = (this.actorSelect === 0);
        fixedRadio.addEventListener('change', () => { this.actorSelect = 0; this.renderContent(); });
        const fixedLabel = document.createElement('label');
        fixedLabel.htmlFor = 'actor-fixed-318'; fixedLabel.textContent = 'Fixed';
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
        varRadio.type = 'radio'; varRadio.name = 'actor-select-318'; varRadio.id = 'actor-variable-318';
        varRadio.checked = (this.actorSelect === 1);
        varRadio.addEventListener('change', () => { this.actorSelect = 1; this.renderContent(); });
        const varLabel = document.createElement('label');
        varLabel.htmlFor = 'actor-variable-318'; varLabel.textContent = 'Variable';
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
            code: 318,
            indent: 0,
            parameters: [this.actorSelect, this.actorId, this.operation, this.skillId]
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
    module.exports = ChangeSkillEditor;
}
