/**
 * ChangeEquipmentEditor - Editor for Change Equipment event command (code 319)
 */
class ChangeEquipmentEditor {
    constructor(databaseManager, projectController) {
        this.databaseManager = databaseManager;
        this.projectController = projectController;
        this.modal = null;
        this.callback = null;

        // Parameters: [actorId, equipment type id (System equipTypes, 1 = Weapon), item id (0 = none)]
        this.actorId = 1;
        this.equipSlot = 1;
        this.equipId = 0;
    }

    show(command, callback) {
        this.callback = callback;

        if (command && command.code === 319) {
            const params = command.parameters;
            this.actorId = params[0] || 1;
            // Equipment type ids start at 1; a 0 (written by this dialog before it used the ids) meant Weapon.
            this.equipSlot = params[1] || 1;
            this.equipId = params[2] || 0;
        } else {
            this.actorId = 1;
            this.equipSlot = 1;
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
        container.className = 'change-equipment-container rr-modal';
        container.style.cssText = `width: min(450px, calc(100vw - 24px)); max-height: 92vh;`;

        this.modal.appendChild(container);

        this.modal.addEventListener('click', (e) => {
            // A click on the backdrop no longer closes the dialog: an accidental
            // click beside it must never cost in-progress work. Close deliberately.
        });

        document.body.appendChild(this.modal);
    }

    renderContent() {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        const container = this.modal.querySelector('.change-equipment-container');
        container.innerHTML = '';

        // Header
        const header = document.createElement('div');
        header.className = 'rr-modal-header';
        header.innerHTML = `
            <div class="rr-modal-title">${tt('Change Equipment')}</div>
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

        // Actor selector (fixed dropdown only)
        const actorRow = document.createElement('div');
        actorRow.style.cssText = 'display: flex; align-items: center; gap: 8px;';

        const actorLabel = document.createElement('span');
        actorLabel.textContent = tt('Actor:');
        actorLabel.style.cssText = 'color: var(--color-text); font-size: 13px; min-width: 100px;';

        const actorSelect = document.createElement('select');
        actorSelect.style.cssText = 'padding:6px 10px; background-color:var(--color-bg-input); color:var(--color-text); border:1px solid var(--color-border-input); border-radius:3px; font-size:12px; flex:1;';

        const actors = this.databaseManager.data.actors || [];
        for (let i = 1; i < actors.length; i++) {
            if (!actors[i]) continue;
            const option = document.createElement('option');
            option.value = i;
            option.textContent = `${i.toString().padStart(4, '0')}: ${actors[i].name || tt('Unnamed')}`;
            option.selected = (this.actorId === i);
            actorSelect.appendChild(option);
        }
        actorSelect.addEventListener('change', (e) => {
            this.actorId = parseInt(e.target.value);
            // An actor whose Slot Type picks a slot layout lists that layout's types.
            if (ChangeEquipmentEditor.layoutTypes(this.databaseManager, this.actorId) || this._layoutListed) this.renderContent();
        });

        actorRow.appendChild(actorLabel);
        actorRow.appendChild(actorSelect);
        content.appendChild(actorRow);

        // Slot selector
        const slotRow = document.createElement('div');
        slotRow.style.cssText = 'display: flex; align-items: center; gap: 8px; padding-top: 8px; border-top: 1px solid var(--color-border);';

        const slotLabel = document.createElement('span');
        slotLabel.textContent = tt('Slot:');
        slotLabel.style.cssText = 'color: var(--color-text); font-size: 13px; min-width: 100px;';

        const slotSelect = document.createElement('select');
        slotSelect.style.cssText = 'padding:6px 10px; background-color:var(--color-bg-input); color:var(--color-text); border:1px solid var(--color-border-input); border-radius:3px; font-size:12px; flex:1;';

        this._layoutListed = !!ChangeEquipmentEditor.layoutTypes(this.databaseManager, this.actorId);
        ChangeEquipmentEditor.equipTypes(this.databaseManager, this.equipSlot, this.actorId).forEach(slot => {
            const option = document.createElement('option');
            option.value = slot.value;
            option.textContent = slot.label;
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
        equipLabel.textContent = tt('Equipment:');
        equipLabel.style.cssText = 'color: var(--color-text); font-size: 13px; min-width: 100px;';

        const equipSelect = document.createElement('select');
        equipSelect.style.cssText = 'padding:6px 10px; background-color:var(--color-bg-input); color:var(--color-text); border:1px solid var(--color-border-input); border-radius:3px; font-size:12px; flex:1;';

        // None option
        const noneOption = document.createElement('option');
        noneOption.value = 0;
        noneOption.textContent = window.I18n ? window.I18n.tText('None') : 'None';
        noneOption.selected = (this.equipId === 0);
        equipSelect.appendChild(noneOption);

        if (this.equipSlot === 1) {
            // Weapons
            const weapons = this.databaseManager.data.weapons || [];
            for (let i = 1; i < weapons.length; i++) {
                if (!weapons[i]) continue;
                const option = document.createElement('option');
                option.value = i;
                option.textContent = `${i.toString().padStart(4, '0')}: ${weapons[i].name || tt('Unnamed')}`;
                option.selected = (this.equipId === i);
                equipSelect.appendChild(option);
            }
        } else {
            // Armors of the chosen equipment type
            const armors = this.databaseManager.data.armors || [];
            for (let i = 1; i < armors.length; i++) {
                if (!armors[i] || (armors[i].etypeId && armors[i].etypeId !== this.equipSlot)) continue;
                const option = document.createElement('option');
                option.value = i;
                option.textContent = `${i.toString().padStart(4, '0')}: ${armors[i].name || tt('Unnamed')}`;
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

    /**
     * The project's equipment types as { value: id, label }, ids from 1 (Weapon), with the
     * stock five when System has none. A saved id the list lacks stays selectable. For an actor
     * whose Slot Type picks a slot layout, only the types that layout has a slot of (the command
     * changes the first slot of its type).
     */
    static equipTypes(databaseManager, current, actorId = 0) {
        const tt = text => (typeof window !== 'undefined' && window.I18n) ? window.I18n.tText(text) : text;
        let names = null;
        try {
            const system = databaseManager && typeof databaseManager.getSystem === 'function' ? databaseManager.getSystem() : null;
            names = system && Array.isArray(system.equipTypes) ? system.equipTypes : null;
        } catch (error) { names = null; }
        const types = names && names.length > 1
            ? names.slice(1).map((name, index) => ({ value: index + 1, label: String(name || '') || `#${index + 1}` }))
            : ['Weapon', 'Shield', 'Head', 'Body', 'Accessory'].map((name, index) => ({ value: index + 1, label: tt(name) }));
        const own = ChangeEquipmentEditor.layoutTypes(databaseManager, actorId);
        const listed = own ? types.filter(type => own.has(type.value) || type.value === current) : types;
        if (current > 0 && !listed.some(type => type.value === current)) listed.push({ value: current, label: `#${current}` });
        return listed;
    }

    /** The equipment types of the slot layout an actor's Slot Type picks, or null (no layout). */
    static layoutTypes(databaseManager, actorId) {
        const slots = typeof globalThis !== 'undefined' ? globalThis.RREquipSlots : null;
        if (!slots || !slots.layoutFor || !(actorId > 0)) return null;
        try {
            const actor = databaseManager.data && databaseManager.data.actors ? databaseManager.data.actors[actorId] : null;
            const actorClass = actor && typeof databaseManager.getClass === 'function' ? databaseManager.getClass(actor.classId) : null;
            const layout = actor ? slots.layoutFor(databaseManager.getSystem(), actor, actorClass) : null;
            return layout ? new Set(layout.slots) : null;
        } catch (error) { return null; }
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
