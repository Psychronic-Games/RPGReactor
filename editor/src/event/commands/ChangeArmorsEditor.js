/**
 * ChangeArmorsEditor - Editor for Change Armors event command (code 128)
 */
class ChangeArmorsEditor {
    constructor(databaseManager, projectController) {
        this.databaseManager = databaseManager;
        this.projectController = projectController;
        this.modal = null;
        this.callback = null;

        // Parameters: [armorId, operation, operandType, operand, includeEquipment]
        // operation: 0=Increase, 1=Decrease
        // operandType: 0=Constant, 1=Variable
        // includeEquipment: true/false (whether to include equipped armors when decreasing)
        this.armorId = 1;
        this.operation = 0; // 0=Increase, 1=Decrease
        this.operandType = 0; // 0=Constant, 1=Variable
        this.operand = 1;
        this.includeEquipment = true;
    }

    show(command, callback) {
        this.callback = callback;

        if (command && command.code === 128) {
            const params = command.parameters;
            this.armorId = params[0] || 1;
            this.operation = params[1] || 0;
            this.operandType = params[2] || 0;
            this.operand = params[3] || 1;
            this.includeEquipment = params[4] !== undefined ? params[4] : true;
        } else {
            this.armorId = 1;
            this.operation = 0;
            this.operandType = 0;
            this.operand = 1;
            this.includeEquipment = true;
        }

        if (!this.modal) {
            this.createModal();
        }

        this.renderContent();
        this.modal.style.display = 'flex';
    }

    createModal() {
        this.modal = document.createElement('div');
        this.modal.className = 'change-armors-editor-modal';
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
        container.className = 'change-armors-container';
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
        const container = this.modal.querySelector('.change-armors-container');
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
            <h3 style="margin: 0; color: var(--color-text-strong); font-size: 16px;">Change Armors</h3>
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

        // Armor selector
        const armorRow = document.createElement('div');
        armorRow.style.cssText = 'display: flex; align-items: center; gap: 8px;';

        const armorLabel = document.createElement('span');
        armorLabel.textContent = 'Armor:';
        armorLabel.style.cssText = 'color: var(--color-text); font-size: 13px; min-width: 80px;';

        const armorSelect = document.createElement('select');
        armorSelect.style.cssText = `
            padding: 6px 10px;
            background-color: var(--color-bg-input);
            color: var(--color-text);
            border: 1px solid var(--color-border-input);
            border-radius: 3px;
            font-size: 12px;
            flex: 1;
        `;

        // Get armors from database
        const armors = this.getArmors();
        armors.forEach(armor => {
            if (armor) {
                const option = document.createElement('option');
                option.value = armor.id;
                option.textContent = `#${armor.id.toString().padStart(4, '0')}: ${armor.name}`;
                armorSelect.appendChild(option);
            }
        });

        armorSelect.value = this.armorId;
        armorSelect.addEventListener('change', (e) => {
            this.armorId = parseInt(e.target.value);
        });

        armorRow.appendChild(armorLabel);
        armorRow.appendChild(armorSelect);
        content.appendChild(armorRow);

        // Operation selector
        const operationSection = document.createElement('div');
        operationSection.style.cssText = 'display: flex; flex-direction: column; gap: 8px; padding-top: 8px; border-top: 1px solid var(--color-border);';

        const operationLabel = document.createElement('div');
        operationLabel.textContent = 'Operation:';
        operationLabel.style.cssText = 'color: var(--color-text); font-size: 13px; font-weight: bold;';
        operationSection.appendChild(operationLabel);

        const operationButtons = document.createElement('div');
        operationButtons.style.cssText = 'display: flex; gap: 8px;';

        const operations = [
            { value: 0, label: 'Increase' },
            { value: 1, label: 'Decrease' }
        ];

        operations.forEach(({ value, label }) => {
            const btn = document.createElement('button');
            btn.textContent = label;
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

        // Operand type selector
        const operandTypeSection = document.createElement('div');
        operandTypeSection.style.cssText = 'display: flex; flex-direction: column; gap: 8px; padding-top: 8px; border-top: 1px solid var(--color-border);';

        const operandTypeLabel = document.createElement('div');
        operandTypeLabel.textContent = 'Amount Type:';
        operandTypeLabel.style.cssText = 'color: var(--color-text); font-size: 13px; font-weight: bold;';
        operandTypeSection.appendChild(operandTypeLabel);

        const operandTypeButtons = document.createElement('div');
        operandTypeButtons.style.cssText = 'display: flex; gap: 8px;';

        const operandTypes = [
            { value: 0, label: 'Constant' },
            { value: 1, label: 'Variable' }
        ];

        operandTypes.forEach(({ value, label }) => {
            const btn = document.createElement('button');
            btn.textContent = label;
            btn.style.cssText = `
                flex: 1;
                padding: 8px;
                background-color: ${this.operandType === value ? 'var(--color-link)' : 'var(--color-bg-input)'};
                color: var(--color-text-strong);
                border: 1px solid ${this.operandType === value ? 'var(--color-link)' : 'var(--color-border-input)'};
                border-radius: 3px;
                cursor: pointer;
                font-size: 12px;
                transition: all 0.15s;
            `;

            btn.addEventListener('click', () => {
                this.operandType = value;
                this.renderContent();
            });

            btn.addEventListener('mouseenter', () => {
                if (this.operandType !== value) {
                    btn.style.backgroundColor = '#3d3d3d';
                }
            });

            btn.addEventListener('mouseleave', () => {
                if (this.operandType !== value) {
                    btn.style.backgroundColor = 'var(--color-bg-input)';
                }
            });

            operandTypeButtons.appendChild(btn);
        });

        operandTypeSection.appendChild(operandTypeButtons);
        content.appendChild(operandTypeSection);

        // Operand input
        const operandSection = document.createElement('div');
        operandSection.style.cssText = 'padding: 12px; background-color: var(--color-bg-list-item); border-radius: 3px;';

        if (this.operandType === 0) {
            // Constant
            const operandRow = document.createElement('div');
            operandRow.style.cssText = 'display: flex; align-items: center; gap: 8px;';

            const operandLabel = document.createElement('span');
            operandLabel.textContent = 'Amount:';
            operandLabel.style.cssText = 'color: var(--color-text); font-size: 12px; min-width: 80px;';

            const operandInput = document.createElement('input');
            operandInput.type = 'number';
            operandInput.min = 1;
            operandInput.max = 99;
            operandInput.value = this.operand;
            operandInput.style.cssText = `
                padding: 6px 10px;
                background-color: var(--color-bg-input);
                color: var(--color-text);
                border: 1px solid var(--color-border-input);
                border-radius: 3px;
                font-size: 12px;
                width: 100px;
            `;
            operandInput.addEventListener('input', (e) => {
                this.operand = parseInt(e.target.value) || 1;
            });

            operandRow.appendChild(operandLabel);
            operandRow.appendChild(operandInput);
            operandSection.appendChild(operandRow);
        } else {
            // Variable
            const operandRow = document.createElement('div');
            operandRow.style.cssText = 'display: flex; align-items: center; gap: 8px;';

            const operandLabel = document.createElement('span');
            operandLabel.textContent = 'Variable:';
            operandLabel.style.cssText = 'color: var(--color-text); font-size: 12px; min-width: 80px;';

            const operandSelect = document.createElement('select');
            operandSelect.style.cssText = `
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
                operandSelect.appendChild(option);
            }

            operandSelect.value = this.operand;
            operandSelect.addEventListener('change', (e) => {
                this.operand = parseInt(e.target.value);
            });

            operandRow.appendChild(operandLabel);
            operandRow.appendChild(operandSelect);
            operandSection.appendChild(operandRow);
        }

        content.appendChild(operandSection);

        // Include equipment checkbox (only for Decrease operation)
        if (this.operation === 1) {
            const equipSection = document.createElement('div');
            equipSection.style.cssText = 'padding: 12px; background-color: var(--color-bg-list-item); border-radius: 3px; margin-top: 4px;';

            const equipRow = document.createElement('div');
            equipRow.style.cssText = 'display: flex; align-items: center; gap: 8px;';

            const equipCheckbox = document.createElement('input');
            equipCheckbox.type = 'checkbox';
            equipCheckbox.id = 'include-equipment';
            equipCheckbox.checked = this.includeEquipment;
            equipCheckbox.addEventListener('change', (e) => {
                this.includeEquipment = e.target.checked;
            });

            const equipLabel = document.createElement('label');
            equipLabel.htmlFor = 'include-equipment';
            equipLabel.textContent = 'Include equipped armors';
            equipLabel.style.cssText = 'color: var(--color-text); font-size: 12px; cursor: pointer;';

            equipRow.appendChild(equipCheckbox);
            equipRow.appendChild(equipLabel);
            equipSection.appendChild(equipRow);

            content.appendChild(equipSection);
        }

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

    getArmors() {
        // Get armors from database manager
        if (this.databaseManager && this.databaseManager.data && this.databaseManager.data.armors) {
            return this.databaseManager.data.armors;
        }

        // Fallback: create dummy armors list
        const armors = [null]; // Index 0 is null
        for (let i = 1; i <= 100; i++) {
            armors.push({
                id: i,
                name: `Armor ${i.toString().padStart(3, '0')}`
            });
        }
        return armors;
    }

    buildCommand() {
        return {
            code: 128,
            indent: 0,
            parameters: [
                this.armorId,
                this.operation,
                this.operandType,
                this.operand,
                this.includeEquipment
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
    module.exports = ChangeArmorsEditor;
}
