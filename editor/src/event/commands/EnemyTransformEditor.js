/**
 * EnemyTransformEditor - Editor for Enemy Transform event command (code 336)
 */
class EnemyTransformEditor {
    constructor(databaseManager, projectController) {
        this.databaseManager = databaseManager;
        this.projectController = projectController;
        this.modal = null;
        this.callback = null;

        // Parameters: [enemyIndex, newEnemyId]
        this.enemyIndex = 0; // 0-7 (enemy member index)
        this.newEnemyId = 1;
    }

    show(command, callback) {
        this.callback = callback;

        if (command && command.code === 336) {
            const params = command.parameters;
            this.enemyIndex = params[0] || 0;
            this.newEnemyId = params[1] || 1;
        } else {
            this.enemyIndex = 0;
            this.newEnemyId = 1;
        }

        if (!this.modal) {
            this.createModal();
        }

        this.renderContent();
        this.modal.style.display = 'flex';
    }

    createModal() {
        this.modal = document.createElement('div');
        this.modal.className = 'enemy-transform-editor-modal';
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
        container.className = 'enemy-transform-container rr-modal';
        container.style.cssText = `width: min(450px, calc(100vw - 24px)); max-height: 92vh;`;

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
        const container = this.modal.querySelector('.enemy-transform-container');
        container.innerHTML = '';

        // Header
        const header = document.createElement('div');
        header.className = 'rr-modal-header';
        header.innerHTML = `
            <div class="rr-modal-title">${tt('Enemy Transform')}</div>
            <button class="rr-modal-close close-btn" type="button">\u00d7</button>
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

        // Enemy index selector
        content.appendChild(this.createEnemyIndexSelector());

        // New enemy dropdown
        content.appendChild(this.createNewEnemySelector());

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

    createEnemyIndexSelector() {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        const section = document.createElement('div');
        section.style.cssText = 'display: flex; align-items: center; gap: 8px;';
        const label = document.createElement('span');
        label.textContent = tt('Enemy:');
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

    createNewEnemySelector() {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        const section = document.createElement('div');
        section.style.cssText = 'display: flex; align-items: center; gap: 8px; padding-top: 8px; border-top: 1px solid var(--color-border);';

        const label = document.createElement('span');
        label.textContent = tt('Transform Into:');
        label.style.cssText = 'color: var(--color-text); font-size: 13px; min-width: 100px;';

        const select = document.createElement('select');
        select.style.cssText = 'padding:6px 10px; background-color:var(--color-bg-input); color:var(--color-text); border:1px solid var(--color-border-input); border-radius:3px; font-size:12px; flex:1;';

        const enemies = this.databaseManager.data.enemies || [];
        for (let i = 1; i < enemies.length; i++) {
            if (!enemies[i]) continue;
            const option = document.createElement('option');
            option.value = i;
            option.textContent = `${i.toString().padStart(4, '0')}: ${enemies[i].name || tt('Unnamed')}`;
            option.selected = (this.newEnemyId === i);
            select.appendChild(option);
        }

        select.addEventListener('change', (e) => { this.newEnemyId = parseInt(e.target.value); });

        section.appendChild(label);
        section.appendChild(select);
        return section;
    }

    buildCommand() {
        return {
            code: 336,
            indent: 0,
            parameters: [this.enemyIndex, this.newEnemyId]
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
    module.exports = EnemyTransformEditor;
}
