/** Resolve an actor's equipment slots from class data and engine defaults. */
(function(root) {
    const parseClassSlots = (note, equipTypes) => {
        const slots = [];
        const lines = String(note || '').split(/[\r\n]+/);
        let readingNames = false;

        for (const line of lines) {
            const inline = line.match(/<(?:equip slot|equip slots):\s*(\d+(?:\s*,\s*\d+)*)>/i);
            if (inline) {
                slots.push(...(inline[1].match(/\d+/g) || []).map(Number));
                continue;
            }
            if (/<(?:equip slot|equip slots)>/i.test(line)) {
                readingNames = true;
                continue;
            }
            if (/<\/(?:equip slot|equip slots)>/i.test(line)) {
                readingNames = false;
                continue;
            }
            if (readingNames) {
                const id = (equipTypes || []).indexOf(line.trim());
                if (id >= 0) slots.push(id);
            }
        }
        return slots;
    };

    const defaultSlots = equipTypes => {
        const slots = [];
        for (let id = 1; id < (equipTypes || []).length; id++) slots.push(id);
        return slots;
    };

    const resolve = (databaseManager, project, actor, dualWield = false) => {
        const equipTypes = databaseManager.getSystem()?.equipTypes;
        if (!equipTypes) return [1, 2, 3, 4, 5];

        const actorClass = databaseManager.getClass(actor?.classId);
        const customSlots = parseClassSlots(actorClass?.note, equipTypes);
        const slots = customSlots.length > 0 ? customSlots : defaultSlots(equipTypes);

        // An explicit class list is authoritative. Without one, use the stock
        // engine's Dual Wield replacement for the second global slot.
        if (customSlots.length === 0 && slots.length >= 2 && dualWield) slots[1] = 1;
        return slots;
    };

    const resolveInitialBindings = (databaseManager, project, actor, dualWield = false) => {
        const equipTypes = databaseManager.getSystem()?.equipTypes;
        if (!equipTypes) {
            return [1, 2, 3, 4, 5].map((etypeId, slotIndex) => ({ etypeId, slotIndex }));
        }

        const slots = resolve(databaseManager, project, actor, dualWield);
        return slots.map((etypeId, slotIndex) => ({ etypeId, slotIndex }));
    };

    const api = { parseClassSlots, resolve, resolveInitialBindings };
    root.RREquipSlots = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
