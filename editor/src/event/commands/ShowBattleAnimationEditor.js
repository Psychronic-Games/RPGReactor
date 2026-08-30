/**
 * ShowBattleAnimationEditor - Editor for Show Battle Animation event command (code 337)
 */
class ShowBattleAnimationEditor {
    constructor(databaseManager, projectController) {
        this.databaseManager = databaseManager;
        this.projectController = projectController;
        this.modal = null;
        this.callback = null;

        // Parameters: [enemyIndex, animationId, targetAll]
        this.enemyIndex = 0; // 0-7 (enemy member index)
        this.animationId = 1;
        this.targetAll = false;
    }

    show(command, callback) {
        this.callback = callback;

        if (command && command.code === 337) {
            const params = command.parameters;
            this.enemyIndex = params[0] !== undefined ? params[0] : 0;
            this.animationId = params[1] || 1;
            this.targetAll = params[2] || false;
            // If enemyIndex is -1, that means target all was checked
            if (this.enemyIndex === -1) {
                this.targetAll = true;
                this.enemyIndex = 0;
            }
        } else {
            this.enemyIndex = 0;
            this.animationId = 1;
            this.targetAll = false;
        }

        if (!this.modal) {
            this.createModal();
        }

        this.renderContent();
        this.modal.style.display = 'flex';
    }

    createModal() {
        this.modal = document.createElement('div');
        this.modal.className = 'show-battle-animation-editor-modal';
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
        container.className = 'show-battle-animation-container rr-modal';
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
        const container = this.modal.querySelector('.show-battle-animation-container');
        container.innerHTML = '';

        // Header
        const header = document.createElement('div');
        header.className = 'rr-modal-header';
        header.innerHTML = `
            <div class="rr-modal-title">${tt('Show Battle Animation')}</div>
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

        // Animation dropdown
        content.appendChild(this.createAnimationSelector());

        // Entire Troop checkbox
        const troopRow = document.createElement('div');
        troopRow.style.cssText = 'display: flex; align-items: center; gap: 8px; padding-top: 8px; border-top: 1px solid var(--color-border);';

        const troopCheckbox = document.createElement('input');
        troopCheckbox.type = 'checkbox';
        troopCheckbox.id = 'target-all-337';
        troopCheckbox.checked = this.targetAll;
        troopCheckbox.addEventListener('change', (e) => {
            this.targetAll = e.target.checked;
        });

        const troopLabel = document.createElement('label');
        troopLabel.htmlFor = 'target-all-337';
        troopLabel.textContent = tt('Entire Troop');
        troopLabel.style.cssText = 'color: var(--color-text); font-size: 13px; cursor: pointer;';

        troopRow.appendChild(troopCheckbox);
        troopRow.appendChild(troopLabel);
        content.appendChild(troopRow);

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

    createAnimationSelector() {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        const section = document.createElement('div');
        section.style.cssText = 'display: flex; align-items: center; gap: 8px; padding-top: 8px; border-top: 1px solid var(--color-border);';

        const label = document.createElement('span');
        label.textContent = tt('Animation:');
        label.style.cssText = 'color: var(--color-text); font-size: 13px; min-width: 100px;';

        const animations = this.databaseManager.getAnimations
            ? this.databaseManager.getAnimations()
            : this.databaseManager.data.animations || [];
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'database-field-value';
        button.style.cssText = 'padding:6px 10px; background-color:var(--color-bg-input); color:var(--color-text); border:1px solid var(--color-border-input); border-radius:3px; font-size:12px; flex:1; text-align:left; cursor:pointer;';
        const refresh = () => {
            button.textContent = typeof AnimationPickerModal !== 'undefined'
                ? AnimationPickerModal.label(animations, this.animationId)
                : `#${this.animationId}`;
        };
        refresh();
        button.addEventListener('click', () => {
            if (typeof AnimationPickerModal === 'undefined') return;
            AnimationPickerModal.open({
                databaseManager: this.databaseManager,
                projectManager: this.projectController,
                currentId: this.animationId,
                allowNormalAttack: false,
                onPick: id => {
                    if (!(Number(id) > 0)) return;
                    this.animationId = Number(id);
                    refresh();
                }
            });
        });

        section.appendChild(label);
        section.appendChild(button);
        return section;
    }

    buildCommand() {
        return {
            code: 337,
            indent: 0,
            parameters: [this.targetAll ? -1 : this.enemyIndex, this.animationId, this.targetAll]
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
    module.exports = ShowBattleAnimationEditor;
}
