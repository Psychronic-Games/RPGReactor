/**
 * ForceActionEditor - Editor for Force Action event command (code 339)
 */
class ForceActionEditor {
    constructor(databaseManager, projectController) {
        this.databaseManager = databaseManager;
        this.projectController = projectController;
        this.modal = null;
        this.callback = null;

        // Parameters: [battlerType, battlerId, skillId, targetIndex]
        this.battlerType = 0; // 0=Enemy, 1=Actor
        this.battlerId = 0; // enemy index (0-7) or actor ID
        this.skillId = 1;
        this.targetIndex = -1; // -2=Last Target, -1=Random, 0+=specific index
    }

    show(command, callback) {
        this.callback = callback;

        if (command && command.code === 339) {
            const params = command.parameters;
            this.battlerType = params[0] || 0;
            this.battlerId = params[1] || 0;
            this.skillId = params[2] || 1;
            this.targetIndex = params[3] !== undefined ? params[3] : -1;
        } else {
            this.battlerType = 0;
            this.battlerId = 0;
            this.skillId = 1;
            this.targetIndex = -1;
        }

        if (!this.modal) {
            this.createModal();
        }

        this.renderContent();
        this.modal.style.display = 'flex';
    }

    createModal() {
        this.modal = document.createElement('div');
        this.modal.className = 'force-action-editor-modal';
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
        container.className = 'force-action-container';
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

    renderContent() {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        const container = this.modal.querySelector('.force-action-container');
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
            <h3 style="margin: 0; color: var(--color-text-strong); font-size: 16px;">${tt('Force Action')}</h3>
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

        // Battler Type radios (Enemy/Actor)
        content.appendChild(this.createBattlerTypeSection());

        // Battler selector (depends on type)
        content.appendChild(this.createBattlerSelector());

        // Skill dropdown
        content.appendChild(this.createSkillSelector());

        // Target dropdown
        content.appendChild(this.createTargetSelector());

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
        cancelBtn.textContent = tt('Cancel');
        cancelBtn.className = 'rr-btn-secondary';
        cancelBtn.addEventListener('click', () => this.close());

        const okBtn = document.createElement('button');
        okBtn.textContent = tt('OK');
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

    createBattlerTypeSection() {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        const section = document.createElement('div');
        section.style.cssText = 'display: flex; gap: 12px;';

        const enemyRadio = document.createElement('input');
        enemyRadio.type = 'radio';
        enemyRadio.name = 'battler-type-339';
        enemyRadio.id = 'battler-enemy-339';
        enemyRadio.checked = (this.battlerType === 0);
        enemyRadio.addEventListener('change', () => {
            this.battlerType = 0;
            this.battlerId = 0;
            this.renderContent();
        });

        const enemyLabel = document.createElement('label');
        enemyLabel.htmlFor = 'battler-enemy-339';
        enemyLabel.textContent = tt('Enemy');
        enemyLabel.style.cssText = 'color: var(--color-text); cursor: pointer;';

        const actorRadio = document.createElement('input');
        actorRadio.type = 'radio';
        actorRadio.name = 'battler-type-339';
        actorRadio.id = 'battler-actor-339';
        actorRadio.checked = (this.battlerType === 1);
        actorRadio.addEventListener('change', () => {
            this.battlerType = 1;
            this.battlerId = 1;
            this.renderContent();
        });

        const actorLabel = document.createElement('label');
        actorLabel.htmlFor = 'battler-actor-339';
        actorLabel.textContent = tt('Actor');
        actorLabel.style.cssText = 'color: var(--color-text); cursor: pointer;';

        section.appendChild(enemyRadio);
        section.appendChild(enemyLabel);
        section.appendChild(actorRadio);
        section.appendChild(actorLabel);
        return section;
    }

    createBattlerSelector() {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        const section = document.createElement('div');
        section.style.cssText = 'display: flex; align-items: center; gap: 8px; padding-top: 8px; border-top: 1px solid var(--color-border);';

        if (this.battlerType === 0) {
            // Enemy mode - enemy index dropdown (0-7)
            const label = document.createElement('span');
            label.textContent = tt('Enemy:');
            label.style.cssText = 'color: var(--color-text); font-size: 13px; min-width: 100px;';

            const select = document.createElement('select');
            select.style.cssText = 'padding:6px 10px; background-color:var(--color-bg-input); color:var(--color-text); border:1px solid var(--color-border-input); border-radius:3px; font-size:12px; flex:1;';
            for (let i = 0; i <= 7; i++) {
                const option = document.createElement('option');
                option.value = i;
                option.textContent = `#${i + 1}`;
                option.selected = (this.battlerId === i);
                select.appendChild(option);
            }
            select.addEventListener('change', (e) => { this.battlerId = parseInt(e.target.value); });

            section.appendChild(label);
            section.appendChild(select);
        } else {
            // Actor mode - actor dropdown
            const label = document.createElement('span');
            label.textContent = tt('Actor:');
            label.style.cssText = 'color: var(--color-text); font-size: 13px; min-width: 100px;';

            const select = document.createElement('select');
            select.style.cssText = 'padding:6px 10px; background-color:var(--color-bg-input); color:var(--color-text); border:1px solid var(--color-border-input); border-radius:3px; font-size:12px; flex:1;';

            const actors = this.databaseManager.data.actors || [];
            for (let i = 1; i < actors.length; i++) {
                if (!actors[i]) continue;
                const option = document.createElement('option');
                option.value = i;
                option.textContent = `${i.toString().padStart(4, '0')}: ${actors[i].name || tt('Unnamed')}`;
                option.selected = (this.battlerId === i);
                select.appendChild(option);
            }
            select.addEventListener('change', (e) => { this.battlerId = parseInt(e.target.value); });

            section.appendChild(label);
            section.appendChild(select);
        }

        return section;
    }

    createSkillSelector() {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        const section = document.createElement('div');
        section.style.cssText = 'display: flex; align-items: center; gap: 8px; padding-top: 8px; border-top: 1px solid var(--color-border);';

        const label = document.createElement('span');
        label.textContent = tt('Skill:');
        label.style.cssText = 'color: var(--color-text); font-size: 13px; min-width: 100px;';

        const select = document.createElement('select');
        select.style.cssText = 'padding:6px 10px; background-color:var(--color-bg-input); color:var(--color-text); border:1px solid var(--color-border-input); border-radius:3px; font-size:12px; flex:1;';

        const skills = this.databaseManager.data.skills || [];
        for (let i = 1; i < skills.length; i++) {
            if (!skills[i]) continue;
            const option = document.createElement('option');
            option.value = i;
            option.textContent = `${i.toString().padStart(4, '0')}: ${skills[i].name || tt('Unnamed')}`;
            option.selected = (this.skillId === i);
            select.appendChild(option);
        }

        select.addEventListener('change', (e) => { this.skillId = parseInt(e.target.value); });

        section.appendChild(label);
        section.appendChild(select);
        return section;
    }

    createTargetSelector() {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        const section = document.createElement('div');
        section.style.cssText = 'display: flex; align-items: center; gap: 8px; padding-top: 8px; border-top: 1px solid var(--color-border);';

        const label = document.createElement('span');
        label.textContent = tt('Target:');
        label.style.cssText = 'color: var(--color-text); font-size: 13px; min-width: 100px;';

        const select = document.createElement('select');
        select.style.cssText = 'padding:6px 10px; background-color:var(--color-bg-input); color:var(--color-text); border:1px solid var(--color-border-input); border-radius:3px; font-size:12px; flex:1;';

        // Last Target option
        const lastTargetOption = document.createElement('option');
        lastTargetOption.value = -2;
        lastTargetOption.textContent = tt('Last Target');
        lastTargetOption.selected = (this.targetIndex === -2);
        select.appendChild(lastTargetOption);

        // Random option
        const randomOption = document.createElement('option');
        randomOption.value = -1;
        randomOption.textContent = tt('Random');
        randomOption.selected = (this.targetIndex === -1);
        select.appendChild(randomOption);

        // Specific targets (1-8)
        for (let i = 1; i <= 8; i++) {
            const option = document.createElement('option');
            option.value = i - 1;
            option.textContent = `${tt('Index')} ${i}`;
            option.selected = (this.targetIndex === i - 1);
            select.appendChild(option);
        }

        select.addEventListener('change', (e) => { this.targetIndex = parseInt(e.target.value); });

        section.appendChild(label);
        section.appendChild(select);
        return section;
    }

    buildCommand() {
        return {
            code: 339,
            indent: 0,
            parameters: [this.battlerType, this.battlerId, this.skillId, this.targetIndex]
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
    module.exports = ForceActionEditor;
}
