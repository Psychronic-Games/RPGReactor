/**
 * SetEventLocationEditor - Editor for Set Event Location event command (code 203)
 */
class SetEventLocationEditor {
    constructor(databaseManager, projectController) {
        this.databaseManager = databaseManager;
        this.projectController = projectController;
        this.modal = null;
        this.callback = null;

        // Parameters: [characterId, type, x/mapId, y/eventId, direction]
        // type: 0=Direct designation, 1=Designation with variables, 2=Exchange with another event
        this.characterId = -1; // -1=Player, 0=This Event, 1+=Event ID
        this.type = 0;
        this.x = 0;
        this.y = 0;
        this.xVariable = 1;
        this.yVariable = 1;
        this.mapId = 1;
        this.eventId = 1;
        this.direction = 0; // 0=Retain, 2=Down, 4=Left, 6=Right, 8=Up
    }

    show(command, callback) {
        this.callback = callback;

        if (command && command.code === 203) {
            const params = command.parameters;
            this.characterId = params[0] !== undefined ? params[0] : -1;
            this.type = params[1] || 0;

            if (this.type === 0) {
                // Direct designation
                this.x = params[2] || 0;
                this.y = params[3] || 0;
                this.direction = params[4] || 0;
            } else if (this.type === 1) {
                // Variable designation
                this.xVariable = params[2] || 1;
                this.yVariable = params[3] || 1;
                this.direction = params[4] || 0;
            } else if (this.type === 2) {
                // Exchange with event
                this.mapId = params[2] || 1;
                this.eventId = params[3] || 1;
            }
        } else {
            this.characterId = -1;
            this.type = 0;
            this.x = 0;
            this.y = 0;
            this.xVariable = 1;
            this.yVariable = 1;
            this.mapId = 1;
            this.eventId = 1;
            this.direction = 0;
        }

        if (!this.modal) {
            this.createModal();
        }

        this.renderContent();
        this.modal.style.display = 'flex';
    }

    createModal() {
        this.modal = document.createElement('div');
        this.modal.className = 'set-event-location-editor-modal';
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
        container.className = 'set-event-location-container';
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
        const container = this.modal.querySelector('.set-event-location-container');
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
            <h3 style="margin: 0; color: var(--color-text-strong); font-size: 16px;">Set Event Location</h3>
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

        // Character selector
        const charRow = document.createElement('div');
        charRow.style.cssText = 'display: flex; align-items: center; gap: 8px;';

        const charLabel = document.createElement('span');
        charLabel.textContent = 'Character:';
        charLabel.style.cssText = 'color: var(--color-text); font-size: 13px; min-width: 100px;';

        const charSelect = document.createElement('select');
        charSelect.style.cssText = `
            padding: 6px 10px;
            background-color: var(--color-bg-input);
            color: var(--color-text);
            border: 1px solid var(--color-border-input);
            border-radius: 3px;
            font-size: 12px;
            flex: 1;
        `;
        charSelect.innerHTML = `
            <option value="-1">Player</option>
            <option value="0">This Event</option>
        `;
        // Add event IDs 1-20 (can be extended)
        for (let i = 1; i <= 20; i++) {
            charSelect.innerHTML += `<option value="${i}">Event ${i.toString().padStart(3, '0')}</option>`;
        }
        charSelect.value = this.characterId.toString();
        charSelect.addEventListener('change', (e) => {
            this.characterId = parseInt(e.target.value);
        });

        charRow.appendChild(charLabel);
        charRow.appendChild(charSelect);
        content.appendChild(charRow);

        // Type selector
        const typeRow = document.createElement('div');
        typeRow.style.cssText = 'display: flex; flex-direction: column; gap: 8px; padding-top: 8px; border-top: 1px solid var(--color-border);';

        const typeLabel = document.createElement('div');
        typeLabel.textContent = 'Location Type:';
        typeLabel.style.cssText = 'color: var(--color-text); font-size: 13px; font-weight: bold;';
        typeRow.appendChild(typeLabel);

        const typeButtons = document.createElement('div');
        typeButtons.style.cssText = 'display: flex; gap: 8px;';

        const types = [
            { value: 0, label: 'Direct' },
            { value: 1, label: 'Variables' },
            { value: 2, label: 'Exchange' }
        ];

        types.forEach(({ value, label }) => {
            const btn = document.createElement('button');
            btn.textContent = label;
            btn.style.cssText = `
                flex: 1;
                padding: 8px;
                background-color: ${this.type === value ? 'var(--color-link)' : 'var(--color-bg-input)'};
                color: var(--color-text-strong);
                border: 1px solid ${this.type === value ? 'var(--color-link)' : 'var(--color-border-input)'};
                border-radius: 3px;
                cursor: pointer;
                font-size: 12px;
                transition: all 0.15s;
            `;

            btn.addEventListener('click', () => {
                this.type = value;
                this.renderContent();
            });

            btn.addEventListener('mouseenter', () => {
                if (this.type !== value) {
                    btn.style.backgroundColor = '#3d3d3d';
                }
            });

            btn.addEventListener('mouseleave', () => {
                if (this.type !== value) {
                    btn.style.backgroundColor = 'var(--color-bg-input)';
                }
            });

            typeButtons.appendChild(btn);
        });

        typeRow.appendChild(typeButtons);
        content.appendChild(typeRow);

        // Type-specific inputs
        const inputSection = document.createElement('div');
        inputSection.style.cssText = 'display: flex; flex-direction: column; gap: 8px; padding: 12px; background-color: var(--color-bg-list-item); border-radius: 3px;';

        if (this.type === 0) {
            // Direct designation
            const xRow = this.createNumberInput('X:', this.x, (value) => { this.x = value; });
            const yRow = this.createNumberInput('Y:', this.y, (value) => { this.y = value; });
            const dirRow = this.createDirectionSelector();

            inputSection.appendChild(xRow);
            inputSection.appendChild(yRow);
            inputSection.appendChild(dirRow);
        } else if (this.type === 1) {
            // Variable designation
            const xVarRow = this.createVariableInput('X Variable:', this.xVariable, (value) => { this.xVariable = value; });
            const yVarRow = this.createVariableInput('Y Variable:', this.yVariable, (value) => { this.yVariable = value; });
            const dirRow = this.createDirectionSelector();

            inputSection.appendChild(xVarRow);
            inputSection.appendChild(yVarRow);
            inputSection.appendChild(dirRow);
        } else if (this.type === 2) {
            // Exchange with event
            const mapRow = this.createNumberInput('Map ID:', this.mapId, (value) => { this.mapId = value; }, 1, 999);
            const eventRow = this.createNumberInput('Event ID:', this.eventId, (value) => { this.eventId = value; }, 1, 999);

            const noteDiv = document.createElement('div');
            noteDiv.textContent = 'Exchange positions with another event';
            noteDiv.style.cssText = 'color: var(--color-text-muted); font-size: 11px; font-style: italic;';

            inputSection.appendChild(mapRow);
            inputSection.appendChild(eventRow);
            inputSection.appendChild(noteDiv);
        }

        content.appendChild(inputSection);
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

    createNumberInput(label, value, onChange, min = 0, max = 999) {
        const row = document.createElement('div');
        row.style.cssText = 'display: flex; align-items: center; gap: 8px;';

        const labelSpan = document.createElement('span');
        labelSpan.textContent = label;
        labelSpan.style.cssText = 'color: var(--color-text); font-size: 12px; min-width: 80px;';

        const input = document.createElement('input');
        input.type = 'number';
        input.min = min;
        input.max = max;
        input.value = value;
        input.style.cssText = `
            padding: 6px 10px;
            background-color: var(--color-bg-input);
            color: var(--color-text);
            border: 1px solid var(--color-border-input);
            border-radius: 3px;
            font-size: 12px;
            width: 100px;
        `;
        input.addEventListener('input', (e) => {
            onChange(parseInt(e.target.value) || 0);
        });

        row.appendChild(labelSpan);
        row.appendChild(input);

        return row;
    }

    createVariableInput(label, value, onChange) {
        const row = document.createElement('div');
        row.style.cssText = 'display: flex; align-items: center; gap: 8px;';

        const labelSpan = document.createElement('span');
        labelSpan.textContent = label;
        labelSpan.style.cssText = 'color: var(--color-text); font-size: 12px; min-width: 80px;';

        const select = document.createElement('select');
        select.style.cssText = `
            padding: 6px 10px;
            background-color: var(--color-bg-input);
            color: var(--color-text);
            border: 1px solid var(--color-border-input);
            border-radius: 3px;
            font-size: 12px;
            flex: 1;
        `;

        // Add first 100 variables
        for (let i = 1; i <= 100; i++) {
            const option = document.createElement('option');
            option.value = i;
            option.textContent = `#${i.toString().padStart(4, '0')}`;
            select.appendChild(option);
        }

        select.value = value;
        select.addEventListener('change', (e) => {
            onChange(parseInt(e.target.value));
        });

        row.appendChild(labelSpan);
        row.appendChild(select);

        return row;
    }

    createDirectionSelector() {
        const row = document.createElement('div');
        row.style.cssText = 'display: flex; align-items: center; gap: 8px;';

        const labelSpan = document.createElement('span');
        labelSpan.textContent = 'Direction:';
        labelSpan.style.cssText = 'color: var(--color-text); font-size: 12px; min-width: 80px;';

        const select = document.createElement('select');
        select.style.cssText = `
            padding: 6px 10px;
            background-color: var(--color-bg-input);
            color: var(--color-text);
            border: 1px solid var(--color-border-input);
            border-radius: 3px;
            font-size: 12px;
            flex: 1;
        `;
        select.innerHTML = `
            <option value="0">Retain</option>
            <option value="2">Down ▼</option>
            <option value="4">Left ◄</option>
            <option value="6">Right ►</option>
            <option value="8">Up ▲</option>
        `;
        select.value = this.direction.toString();
        select.addEventListener('change', (e) => {
            this.direction = parseInt(e.target.value);
        });

        row.appendChild(labelSpan);
        row.appendChild(select);

        return row;
    }

    buildCommand() {
        const params = [this.characterId, this.type];

        if (this.type === 0) {
            // Direct designation
            params.push(this.x, this.y, this.direction);
        } else if (this.type === 1) {
            // Variable designation
            params.push(this.xVariable, this.yVariable, this.direction);
        } else if (this.type === 2) {
            // Exchange with event
            params.push(this.mapId, this.eventId);
        }

        return {
            code: 203,
            indent: 0,
            parameters: params
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
    module.exports = SetEventLocationEditor;
}
