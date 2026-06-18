/**
 * ChangeEquipmentEditor - Editor for Change Equipment event command (code 319)
 */
class ChangeEquipmentEditor {
    constructor(databaseManager, projectController) {
        this.databaseManager = databaseManager;
        this.projectController = projectController;
        this.modal = null;
        this.callback = null;

        // Parameters: [actorId, equipSlot, equipId]
        this.actorId = 1;
        this.equipSlot = 0; // 0=Weapon, 1=Shield, 2=Head, 3=Body, 4=Accessory
        this.equipId = 0; // 0=None
    }

    show(command, callback) {
        this.callback = callback;

        if (command && command.code === 319) {
            const params = command.parameters;
            this.actorId = params[0] || 1;
            this.equipSlot = params[1] || 0;
            this.equipId = params[2] || 0;
        } else {
            this.actorId = 1;
            this.equipSlot = 0;
            this.equipId = 0;
        }

        if (!this.modal) {
            this.createModal();
        }

        this.renderContent();
        this.modal.style.display = 'flex';
    }

    createModal() {
        this.modal = document.createElement('div');
        this.modal.className = 'change-equipment-editor-modal';
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
        container.className = 'change-equipment-container';
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
        const container = this.modal.querySelector('.change-equipment-container');
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
            <h3 style="margin: 0; color: var(--color-text-strong); font-size: 16px;">Change Equipment</h3>
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

        // Actor selector (fixed dropdown only)
        const actorRow = document.createElement('div');
        actorRow.style.cssText = 'display: flex; align-items: center; gap: 8px;';

        const actorLabel = document.createElement('span');
        actorLabel.textContent = 'Actor:';
        actorLabel.style.cssText = 'color: var(--color-text); font-size: 13px; min-width: 100px;';

        const actorSelect = document.createElement('select');
        actorSelect.style.cssText = 'padding:6px 10px; background-color:var(--color-bg-input); color:var(--color-text); border:1px solid var(--color-border-input); border-radius:3px; font-size:12px; flex:1;';

        const actors = this.databaseManager.data.actors || [];
        for (let i = 1; i < actors.length; i++) {
            if (!actors[i]) continue;
            const option = document.createElement('option');
            option.value = i;
            option.textContent = `${i.toString().padStart(4, '0')}: ${actors[i].name || 'Unnamed'}`;
            option.selected = (this.actorId === i);
            actorSelect.appendChild(option);
        }
        actorSelect.addEventListener('change', (e) => { this.actorId = parseInt(e.target.value); });

        actorRow.appendChild(actorLabel);
        actorRow.appendChild(actorSelect);
        content.appendChild(actorRow);

        // Slot selector
        const slotRow = document.createElement('div');
        slotRow.style.cssText = 'display: flex; align-items: center; gap: 8px; padding-top: 8px; border-top: 1px solid var(--color-border);';

        const slotLabel = document.createElement('span');
        slotLabel.textContent = 'Slot:';
        slotLabel.style.cssText = 'color: var(--color-text); font-size: 13px; min-width: 100px;';

        const slotSelect = document.createElement('select');
        slotSelect.style.cssText = 'padding:6px 10px; background-color:var(--color-bg-input); color:var(--color-text); border:1px solid var(--color-border-input); border-radius:3px; font-size:12px; flex:1;';

        const slots = [
            { value: 0, label: 'Weapon' },
            { value: 1, label: 'Shield' },
            { value: 2, label: 'Head' },
            { value: 3, label: 'Body' },
            { value: 4, label: 'Accessory' }
        ];

        slots.forEach(slot => {
            const option = document.createElement('option');
            option.value = slot.value;
            option.textContent = window.I18n ? window.I18n.tText(slot.label) : slot.label;
            option.selected = (this.equipSlot === slot.value);
            slotSelect.appendChild(option);
        });

        slotSelect.addEventListener('change', (e) => {
            this.equipSlot = parseInt(e.target.value);
            this.equipId = 0;
            this.renderContent();
        });

        slotRow.appendChild(slotLabel);
        slotRow.appendChild(slotSelect);
        content.appendChild(slotRow);

        // Equipment selector
        const equipRow = document.createElement('div');
        equipRow.style.cssText = 'display: flex; align-items: center; gap: 8px; padding-top: 8px; border-top: 1px solid var(--color-border);';

        const equipLabel = document.createElement('span');
        equipLabel.textContent = 'Equipment:';
        equipLabel.style.cssText = 'color: var(--color-text); font-size: 13px; min-width: 100px;';

        const equipSelect = document.createElement('select');
        equipSelect.style.cssText = 'padding:6px 10px; background-color:var(--color-bg-input); color:var(--color-text); border:1px solid var(--color-border-input); border-radius:3px; font-size:12px; flex:1;';

        // None option
        const noneOption = document.createElement('option');
        noneOption.value = 0;
        noneOption.textContent = window.I18n ? window.I18n.tText('None') : 'None';
        noneOption.selected = (this.equipId === 0);
        equipSelect.appendChild(noneOption);

        if (this.equipSlot === 0) {
            // Weapons
            const weapons = this.databaseManager.data.weapons || [];
            for (let i = 1; i < weapons.length; i++) {
                if (!weapons[i]) continue;
                const option = document.createElement('option');
                option.value = i;
                option.textContent = `${i.toString().padStart(4, '0')}: ${weapons[i].name || 'Unnamed'}`;
                option.selected = (this.equipId === i);
                equipSelect.appendChild(option);
            }
        } else {
            // Armors (for slots 1-4)
            const armors = this.databaseManager.data.armors || [];
            for (let i = 1; i < armors.length; i++) {
                if (!armors[i]) continue;
                const option = document.createElement('option');
                option.value = i;
                option.textContent = `${i.toString().padStart(4, '0')}: ${armors[i].name || 'Unnamed'}`;
                option.selected = (this.equipId === i);
                equipSelect.appendChild(option);
            }
        }

        equipSelect.addEventListener('change', (e) => { this.equipId = parseInt(e.target.value); });

        equipRow.appendChild(equipLabel);
        equipRow.appendChild(equipSelect);
        content.appendChild(equipRow);

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

    buildCommand() {
        return {
            code: 319,
            indent: 0,
            parameters: [this.actorId, this.equipSlot, this.equipId]
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
    module.exports = ChangeEquipmentEditor;
}
