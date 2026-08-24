/**
 * ChangePartyMemberEditor - Editor for Change Party Member event command (code 129)
 */
class ChangePartyMemberEditor {
    constructor(databaseManager, projectController) {
        this.databaseManager = databaseManager;
        this.projectController = projectController;
        this.modal = null;
        this.callback = null;

        // Parameters: [actorId, operation, initialize]
        // operation: 0=Add, 1=Remove
        // initialize: true/false (only for Add operation)
        this.actorId = 1;
        this.operation = 0; // 0=Add, 1=Remove
        this.initialize = true;
    }

    show(command, callback) {
        this.callback = callback;

        if (command && command.code === 129) {
            const params = command.parameters;
            this.actorId = params[0] || 1;
            this.operation = params[1] || 0;
            this.initialize = params[2] !== undefined ? params[2] : true;
        } else {
            this.actorId = 1;
            this.operation = 0;
            this.initialize = true;
        }

        if (!this.modal) {
            this.createModal();
        }

        this.renderContent();
        this.modal.style.display = 'flex';
    }

    createModal() {
        this.modal = document.createElement('div');
        this.modal.className = 'change-party-member-editor-modal';
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
        container.className = 'change-party-member-container rr-modal';
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
        const container = this.modal.querySelector('.change-party-member-container');
        container.innerHTML = '';

        // Header
        const header = document.createElement('div');
        header.className = 'rr-modal-header';
        header.innerHTML = `
            <div class="rr-modal-title">${tt('Change Party Member')}</div>
            <button class="rr-modal-close close-btn" type="button">×</button>
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

        // Actor selector
        const actorRow = document.createElement('div');
        actorRow.style.cssText = 'display: flex; align-items: center; gap: 8px;';

        const actorLabel = document.createElement('span');
        actorLabel.textContent = tt('Actor:');
        actorLabel.style.cssText = 'color: var(--color-text); font-size: 13px; min-width: 80px;';

        const actorSelect = document.createElement('select');
        actorSelect.style.cssText = `
            padding: 6px 10px;
            background-color: var(--color-bg-input);
            color: var(--color-text);
            border: 1px solid var(--color-border-input);
            border-radius: 3px;
            font-size: 12px;
            flex: 1;
        `;

        // Get actors from database
        const actors = this.getActors();
        actors.forEach(actor => {
            if (actor) {
                const option = document.createElement('option');
                option.value = actor.id;
                option.textContent = `#${actor.id.toString().padStart(4, '0')}: ${actor.name}`;
                actorSelect.appendChild(option);
            }
        });

        actorSelect.value = this.actorId;
        actorSelect.addEventListener('change', (e) => {
            this.actorId = parseInt(e.target.value);
        });

        actorRow.appendChild(actorLabel);
        actorRow.appendChild(actorSelect);
        content.appendChild(actorRow);

        // Operation selector
        const operationSection = document.createElement('div');
        operationSection.style.cssText = 'display: flex; flex-direction: column; gap: 8px; padding-top: 8px; border-top: 1px solid var(--color-border);';

        const operationLabel = document.createElement('div');
        operationLabel.textContent = tt('Operation:');
        operationLabel.style.cssText = 'color: var(--color-text); font-size: 13px; font-weight: bold;';
        operationSection.appendChild(operationLabel);

        const operationButtons = document.createElement('div');
        operationButtons.style.cssText = 'display: flex; gap: 8px;';

        const operations = [
            { value: 0, label: 'Add to Party' },
            { value: 1, label: 'Remove from Party' }
        ];

        operations.forEach(({ value, label }) => {
            const btn = document.createElement('button');
            btn.textContent = tt(label);
            btn.style.cssText = `
                flex: 1;
                padding: 8px;
                background-color: ${this.operation === value ? 'var(--color-link)' : 'var(--color-bg-input)'};
                color: var(--color-text-strong);
                border: 1px solid ${this.operation === value ? 'var(--color-link)' : 'var(--color-border-input)'};
                border-radius: 3px;
                cursor: pointer;
                font-size: 12px;
                transition: all 0.15s;
            `;

            btn.addEventListener('click', () => {
                this.operation = value;
                this.renderContent();
            });

            btn.addEventListener('mouseenter', () => {
                if (this.operation !== value) {
                    btn.style.backgroundColor = '#3d3d3d';
                }
            });

            btn.addEventListener('mouseleave', () => {
                if (this.operation !== value) {
                    btn.style.backgroundColor = 'var(--color-bg-input)';
                }
            });

            operationButtons.appendChild(btn);
        });

        operationSection.appendChild(operationButtons);
        content.appendChild(operationSection);

        // Initialize checkbox (only shown for Add operation)
        if (this.operation === 0) {
            const initSection = document.createElement('div');
            initSection.style.cssText = 'padding: 12px; background-color: var(--color-bg-list-item); border-radius: 3px;';

            const initRow = document.createElement('div');
            initRow.style.cssText = 'display: flex; align-items: center; gap: 8px;';

            const initCheckbox = document.createElement('input');
            initCheckbox.type = 'checkbox';
            initCheckbox.id = 'initialize-actor';
            initCheckbox.checked = this.initialize;
            initCheckbox.addEventListener('change', (e) => {
                this.initialize = e.target.checked;
            });

            const initLabel = document.createElement('label');
            initLabel.htmlFor = 'initialize-actor';
            initLabel.textContent = tt('Initialize (reset to starting level and equipment)');
            initLabel.style.cssText = 'color: var(--color-text); font-size: 12px; cursor: pointer;';

            initRow.appendChild(initCheckbox);
            initRow.appendChild(initLabel);
            initSection.appendChild(initRow);

            const noteDiv = document.createElement('div');
            noteDiv.textContent = tt('If unchecked, actor keeps current stats and equipment');
            noteDiv.style.cssText = 'color: var(--color-text-muted); font-size: 11px; font-style: italic; margin-top: 8px; margin-left: 24px;';
            initSection.appendChild(noteDiv);

            content.appendChild(initSection);
        } else {
            // Show note for Remove operation
            const noteSection = document.createElement('div');
            noteSection.style.cssText = 'padding: 12px; background-color: var(--color-bg-list-item); border-radius: 3px;';

            const noteDiv = document.createElement('div');
            noteDiv.textContent = tt('Note: If the actor is the party leader, the next member becomes the leader.');
            noteDiv.style.cssText = 'color: var(--color-text-muted); font-size: 11px; font-style: italic;';
            noteSection.appendChild(noteDiv);

            content.appendChild(noteSection);
        }

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

    getActors() {
        // Get actors from database manager
        if (this.databaseManager && this.databaseManager.data && this.databaseManager.data.actors) {
            return this.databaseManager.data.actors;
        }

        // Fallback: create dummy actors list
        const actors = [null]; // Index 0 is null
        for (let i = 1; i <= 20; i++) {
            actors.push({
                id: i,
                name: `Actor ${i.toString().padStart(3, '0')}`
            });
        }
        return actors;
    }

    buildCommand() {
        return {
            code: 129,
            indent: 0,
            parameters: [
                this.actorId,
                this.operation,
                this.initialize
            ]
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
    module.exports = ChangePartyMemberEditor;
}
