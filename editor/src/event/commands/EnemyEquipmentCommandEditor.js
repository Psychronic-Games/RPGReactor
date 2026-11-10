/**
 * EnemyEquipmentCommandEditor - Change Enemy Equipment.
 *
 * Saved as a stock plugin command (code 357, plugin "RPGReactor") so the data
 * stays loadable everywhere:
 *
 *   ChangeEnemyEquipment { enemyIndex, slotIndex, kind, itemId }
 *
 * `enemyIndex` and `slotIndex` are stored from zero and shown from one. `kind`
 * is 2 for a weapon, 3 for an armor; `itemId` 0 empties the slot. One troop
 * member changes, and the party's inventory is not involved.
 *
 * A troop page knows its members, so the dialog can name their slots and offer
 * only what fits. A map or common event has no troop: the slot is a number and
 * every weapon and armor is offered. The game ignores a target that turns out
 * not to exist or an item that does not fit.
 */
class EnemyEquipmentCommandEditor {
    static NAME = 'ChangeEnemyEquipment';
    static LABEL = 'Change Enemy Equipment';
    static OPEN_SLOTS = 12;

    constructor(databaseManager) {
        this.databaseManager = databaseManager;
    }

    static supports(name) {
        return String(name || '') === EnemyEquipmentCommandEditor.NAME;
    }

    static _index(value) {
        return String(Math.max(0, Math.floor(Number(value)) || 0));
    }

    /** The command an argument object builds, for saving and for tests. */
    static build(args, indent = 0) {
        const input = args || {};
        const itemId = Math.max(0, Math.floor(Number(input.itemId)) || 0);
        const kind = Number(input.kind) === 2 || Number(input.kind) === 3 ? Number(input.kind) : 0;
        const saved = {
            enemyIndex: EnemyEquipmentCommandEditor._index(input.enemyIndex),
            slotIndex: EnemyEquipmentCommandEditor._index(input.slotIndex),
            kind: String(kind && itemId ? kind : 0),
            itemId: String(kind ? itemId : 0)
        };
        return { code: 357, indent: indent || 0, parameters: ['RPGReactor', EnemyEquipmentCommandEditor.NAME, EnemyEquipmentCommandEditor.LABEL, saved] };
    }

    static _text(text) {
        return typeof window !== 'undefined' && window.I18n ? window.I18n.tText(text) : text;
    }

    static _item(kind, id, databaseManager) {
        const list = Number(kind) === 2 ? databaseManager?.getWeapons?.() : Number(kind) === 3 ? databaseManager?.getArmors?.() : null;
        return (list || []).find(entry => entry && entry.id === Number(id)) || null;
    }

    /** One readable line for the command list: "#1, Slot 2 → Short Sword". */
    static summary(args, databaseManager) {
        const tt = EnemyEquipmentCommandEditor._text;
        const a = args || {};
        const itemId = Number(a.itemId) || 0;
        const item = EnemyEquipmentCommandEditor._item(a.kind, itemId, databaseManager);
        const shown = !itemId ? tt('None') : item ? item.name : `#${itemId}`;
        return `#${(Number(a.enemyIndex) || 0) + 1}, ${tt('Slot')} ${(Number(a.slotIndex) || 0) + 1} → ${shown}`;
    }

    /** The authored slots of the enemy in a troop position, or null when unknown. */
    _memberRows(enemyIndex, context) {
        if (typeof RREnemySlotOptions === 'undefined' || typeof RREnemyEquipment === 'undefined') return null;
        const member = RREnemySlotOptions.members(context)[enemyIndex];
        const enemy = member ? RREnemySlotOptions.enemy(member.enemyId, this.databaseManager) : null;
        return enemy ? RREnemyEquipment.rows(enemy) : null;
    }

    _slotChoices(enemyIndex, context, selected) {
        const tt = EnemyEquipmentCommandEditor._text;
        const system = this.databaseManager?.getSystem?.() || {};
        const rows = this._memberRows(enemyIndex, context);
        const choices = rows && rows.length
            ? rows.map((row, index) => ({ value: index, label: `${tt('Slot')} ${index + 1}: ${RREnemyEquipment.typeName(system, row.etypeId)}`, etypeId: row.etypeId }))
            : Array.from({ length: EnemyEquipmentCommandEditor.OPEN_SLOTS }, (_, index) => ({ value: index, label: `${tt('Slot')} ${index + 1}`, etypeId: null }));
        // A saved slot beyond what is listed (the enemy changed since) stays visible and kept.
        if (!choices.some(choice => choice.value === selected)) choices.push({ value: selected, label: `${tt('Slot')} ${selected + 1}`, etypeId: null });
        return choices;
    }

    _itemGroups(etypeId) {
        const tt = EnemyEquipmentCommandEditor._text;
        const group = (label, kind, list) => ({
            label,
            items: (list || [])
                .filter(entry => entry && entry.id > 0 && String(entry.name || '').trim() && (etypeId === null || entry.etypeId === etypeId))
                .map(entry => ({ id: `${kind}:${entry.id}`, label: `#${entry.id} ${entry.name || ''}` }))
        });
        return [
            { label: tt('Empty'), items: [{ id: '0:0', label: tt('None') }] },
            group(tt('Weapon'), 2, this.databaseManager?.getWeapons?.()),
            group(tt('Armor'), 3, this.databaseManager?.getArmors?.())
        ].filter(entry => entry.items.length);
    }

    /**
     * `command` is the saved command when editing, or null for a new one.
     * `context.troop` names the enemy slots on a troop page.
     */
    show(command, callback, nameHint, context) {
        const tt = EnemyEquipmentCommandEditor._text;
        const args = (command && command.parameters && command.parameters[3]) || {};
        const startEnemy = Math.max(0, Math.floor(Number(args.enemyIndex)) || 0);
        const startSlot = Math.max(0, Math.floor(Number(args.slotIndex)) || 0);
        let value = `${Number(args.kind) || 0}:${Number(args.itemId) || 0}`;

        const escape = text => String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
        const labelStyle = 'display:flex;align-items:center;gap:8px;font-size:12px;color:var(--color-text);';
        const title = window.I18n && window.I18n.tEventCommandName
            ? window.I18n.tEventCommandName(EnemyEquipmentCommandEditor.LABEL) : EnemyEquipmentCommandEditor.LABEL;

        const modal = document.createElement('div');
        modal.className = 'rr-modal-overlay rr-command-editor-modal';
        modal.style.zIndex = '21000';
        modal.innerHTML = `
            <div class="rr-modal" style="width:min(460px,92vw);display:flex;flex-direction:column;overflow:visible;">
                <div class="rr-modal-header">
                    <div class="rr-modal-title">${escape(title)}</div>
                    <button type="button" class="rr-modal-close eec-cancel">&times;</button>
                </div>
                <div class="rr-modal-body" style="display:flex;flex-direction:column;gap:8px;overflow:visible;">
                    <label style="${labelStyle}"><span style="flex:0 0 90px;">${escape(tt('Enemy'))}</span><select class="eec-enemy" style="flex:1;min-width:0;"></select></label>
                    <label style="${labelStyle}"><span style="flex:0 0 90px;">${escape(tt('Slot'))}</span><select class="eec-slot" style="flex:1;min-width:0;"></select></label>
                    <div style="${labelStyle}"><span style="flex:0 0 90px;">${escape(tt('Item'))}</span><div class="eec-item" style="flex:1;min-width:0;display:flex;"></div></div>
                </div>
                <div class="rr-modal-footer">
                    <button type="button" class="rr-btn-secondary eec-cancel">${escape(tt('Cancel'))}</button>
                    <button type="button" class="rr-button-primary eec-ok">${escape(tt('OK'))}</button>
                </div>
            </div>`;
        document.body.appendChild(modal);

        const q = selector => modal.querySelector(selector);
        const enemySelect = q('.eec-enemy');
        const slotSelect = q('.eec-slot');
        RREnemySlotOptions.fill(enemySelect, startEnemy, context || {}, this.databaseManager);

        const picker = RRSearchSelect.create({
            groups: [],
            value,
            placeholder: tt('None'),
            onChange: id => { value = String(id); }
        });
        q('.eec-item').appendChild(picker.element);

        let choices = [];
        const syncItems = () => {
            const chosen = choices.find(choice => choice.value === Number(slotSelect.value));
            const groups = this._itemGroups(chosen ? chosen.etypeId : null);
            picker.setGroups(groups);
            if (!groups.some(group => group.items.some(item => item.id === value))) value = '0:0';
            picker.setValue(value);
        };
        const syncSlots = selected => {
            choices = this._slotChoices(Number(enemySelect.value), context || {}, selected);
            slotSelect.innerHTML = choices.map(choice => `<option value="${choice.value}"${choice.value === selected ? ' selected' : ''}>${escape(choice.label)}</option>`).join('');
            syncItems();
        };
        enemySelect.addEventListener('change', () => syncSlots(Number(slotSelect.value)));
        slotSelect.addEventListener('change', syncItems);
        syncSlots(startSlot);

        const keys = typeof RRKeyboardNavigation !== 'undefined' && RRKeyboardNavigation.modal
            ? RRKeyboardNavigation.modal(modal, { onEscape: () => { close(); callback(null); } }) : null;
        const close = () => { keys?.leave?.(); if (modal.parentNode) modal.parentNode.removeChild(modal); };
        modal.querySelectorAll('.eec-cancel').forEach(button => button.addEventListener('click', () => { close(); callback(null); }));
        q('.eec-ok').addEventListener('click', () => {
            const [kind, itemId] = value.split(':');
            const result = EnemyEquipmentCommandEditor.build({
                enemyIndex: enemySelect.value, slotIndex: slotSelect.value, kind, itemId
            }, (command && command.indent) || 0);
            close();
            callback(result);
        });
        enemySelect.focus();
    }
}

if (typeof window !== 'undefined') window.EnemyEquipmentCommandEditor = EnemyEquipmentCommandEditor;
if (typeof module !== 'undefined' && module.exports) {
    module.exports = EnemyEquipmentCommandEditor;
}
