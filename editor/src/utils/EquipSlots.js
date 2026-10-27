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

    // Slot layouts (System `rrSlotLayouts`): [{ name, slots: [etypeId, ...] }], a type as many times as the
    // layout has slots of it. The Slot Type trait (code 55) picks one: dataId 0 Normal, 1 Dual Wield,
    // LAYOUT_BASE + i the layout at i. The highest Slot Type a battler has wins, as in the runtime.
    const LAYOUT_BASE = 2;
    // Database › Reactor Features (ReactorFeatures.js) may leave slots to a plugin, as the game does
    // (Game_Actor.classEquipSlots, Game_BattlerBase.slotLayouts): what is stored then is kept, unused.
    const featureOn = (id, system) => {
        const features = root.ReactorFeatures;
        return !features || typeof features.on !== 'function' || features.on(id, system || {});
    };
    /** The project's slot layouts in force: none while Equipment Slot Layouts is off. */
    const layouts = system => (system && Array.isArray(system.rrSlotLayouts) && featureOn('equipSlotLayouts', system) ? system.rrSlotLayouts : []);
    /** The layouts as stored, whether or not they are in force (for editing and removing them). */
    const storedLayouts = system => (system && Array.isArray(system.rrSlotLayouts) ? system.rrSlotLayouts : []);
    const layoutAt = (system, slotType) => {
        const layout = slotType >= LAYOUT_BASE ? layouts(system)[slotType - LAYOUT_BASE] : null;
        return layout && Array.isArray(layout.slots) ? layout : null;
    };
    const slotTypeOf = (record, classEntry) => {
        let best = 0;
        for (const owner of [record, classEntry]) for (const trait of (owner && owner.traits) || []) if (trait && trait.code === 55 && Number(trait.dataId) > best) best = Number(trait.dataId);
        return best;
    };
    /** The layout an actor (or vehicle) and its class pick with a Slot Type trait, or null. */
    const layoutFor = (system, record, classEntry) => layoutAt(system, slotTypeOf(record, classEntry));
    /** A layout as stored: a name and whole positive type ids. */
    const cleanLayout = layout => ({
        name: String((layout && layout.name) || ''),
        slots: ((layout && layout.slots) || []).map(Number).filter(id => Number.isInteger(id) && id > 0)
    });
    const traitOwners = data => ['actors', 'classes', 'weapons', 'armors', 'states', 'enemies', 'vehicles']
        .flatMap(key => (data && Array.isArray(data[key]) ? data[key] : [])).filter(record => record && Array.isArray(record.traits));
    /** How many Slot Type traits pick the layout at `index`. */
    const layoutUses = (data, index) => traitOwners(data).reduce((count, record) => count + record.traits.filter(trait => trait && trait.code === 55 && trait.dataId === LAYOUT_BASE + index).length, 0);
    /**
     * Remove the layout at `index`. A Slot Type trait that picked it goes back to Normal, and one that
     * picked a later layout follows it down, so every trait still names the layout it named.
     */
    const removeLayout = (data, index) => {
        const list = storedLayouts(data && data.system);
        if (!(index >= 0 && index < list.length)) return false;
        list.splice(index, 1);
        for (const record of traitOwners(data)) for (const trait of record.traits) {
            if (!trait || trait.code !== 55) continue;
            if (trait.dataId === LAYOUT_BASE + index) trait.dataId = 0;
            else if (trait.dataId > LAYOUT_BASE + index) trait.dataId -= 1;
        }
        return true;
    };

    const resolve = (databaseManager, project, actor, dualWield = false) => {
        const system = databaseManager.getSystem();
        const equipTypes = system?.equipTypes;
        if (!equipTypes) return [1, 2, 3, 4, 5];

        const actorClass = databaseManager.getClass(actor?.classId);
        // A layout the Slot Type picks comes first, before the class's own list.
        const layout = layoutFor(system, actor, actorClass);
        if (layout) return layout.slots.slice();
        // The class's own list is the whole answer: a type as many times as it has slots of it.
        const own = classSlots(actorClass, system);
        if (own) return own.slice();
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

    // A class's equipment slots: its own list, `rrEquipSlots` (the equipment type of each slot, in order; a type
    // twice is two slots of it). A class with no list has one slot per equipment type, as stock data expects.
    /** The named equipment types. */
    const named = system => (system && system.equipTypes || []).map((name, id) => ({ name, id })).filter(type => type.id > 0 && String(type.name || '').trim()).map(type => type.id);
    /** The slots a new class starts with: the first five types a new project comes with (Weapon, Shield, Head, Body, Accessory), where still named. */
    const standard = system => named(system).filter(id => id <= 5);
    /** A class's own list of slots, or null (also while Class Equipment Slots is off in `system`). */
    const classSlots = (classEntry, system) => (classEntry && Array.isArray(classEntry.rrEquipSlots) && featureOn('classEquipSlots', system) ? classEntry.rrEquipSlots : null);
    const isDualWield = (record, classEntry) => [record, classEntry].some(owner => (owner && owner.traits || []).some(trait => trait && trait.code === 55 && trait.dataId === 1));
    /**
     * Starting equipment carried from one list of slots to another: each new slot takes the first thing
     * not yet placed that sat in a slot of its type. What no new slot has room for is left out.
     */
    const remapEquips = (from, to, equips) => {
        const held = (equips || []).map((id, i) => ({ id: Number(id) || 0, type: from[i] }));
        return to.map(type => {
            const at = held.findIndex(entry => entry && entry.id > 0 && entry.type === type);
            if (at < 0) return 0;
            const id = held[at].id;
            held[at] = null;
            return id;
        });
    };
    /** A list with the slot at `from` moved to stand at `to`; the same list back when nothing moves. */
    const moveSlot = (slots, from, to) => {
        const count = slots.length;
        if (!(from >= 0 && from < count)) return slots;
        const place = Math.max(0, Math.min(count - 1, to));
        if (place === from) return slots;
        const next = slots.slice(), [moved] = next.splice(from, 1);
        next.splice(place, 0, moved);
        return next;
    };
    /**
     * Give a class its slots. The starting equipment of every actor and vehicle of the class moves with its
     * slot's type (their `equips` is one entry per slot). `slotsOf(record)` answers a record's slots as they are now.
     */
    const setClassSlots = (data, classEntry, slots, slotsOf) => {
        const members = [];
        // (One whose Slot Type picks a layout keeps the layout's slots, and its equipment with them.)
        for (const list of [data.actors, data.vehicles]) for (const record of list || []) if (record && record.classId === classEntry.id && Array.isArray(record.equips) && !layoutFor(data.system, record, classEntry)) members.push([record, slotsOf(record)]);
        classEntry.rrEquipSlots = slots.slice();
        for (const [record, was] of members) record.equips = remapEquips(was, slots, record.equips);
        return classEntry.rrEquipSlots;
    };
    /**
     * Before a save: a type named since the last one (`known`: the types named then) is a slot of no
     * class until it is added there. Every class still without a list is given its slots as they were, as
     * its own: one per type known before (a second weapon in place of the second under Dual Wield). Left as
     * it is: a class whose slots a note tag gives, and one where an actor has Dual Wield of its own.
     * Returns the types named now.
     */
    const settle = (data, known) => {
        const now = named(data.system), before = new Set(known || []);
        if (!known || now.every(id => before.has(id))) return now;
        // Class Equipment Slots off: the game gives every class one slot per type, so nothing to keep.
        if (!featureOn('classEquipSlots', data.system)) return now;
        const equipTypes = data.system.equipTypes || [], stock = [];
        for (let id = 1; id < equipTypes.length; id++) stock.push(id);
        for (const classEntry of data.classes || []) {
            if (!classEntry || Array.isArray(classEntry.rrEquipSlots) || parseClassSlots(classEntry.note, equipTypes).length) continue;
            const members = [];
            for (const list of [data.actors, data.vehicles]) for (const record of list || []) if (record && record.classId === classEntry.id && !layoutFor(data.system, record, classEntry)) members.push(record);
            const twoWeapons = isDualWield(null, classEntry);
            if (!twoWeapons && members.some(record => isDualWield(record, null))) continue;
            const was = stock.slice();
            if (twoWeapons && was.length >= 2) was[1] = 1;
            const slots = was.filter((id, index) => (index === 1 && twoWeapons) || before.has(id));
            classEntry.rrEquipSlots = slots;
            for (const record of members) if (Array.isArray(record.equips)) record.equips = remapEquips(was, slots, record.equips);
        }
        return now;
    };

    const api = { LAYOUT_BASE, featureOn, layouts, storedLayouts, layoutAt, slotTypeOf, layoutFor, cleanLayout, layoutUses, removeLayout, parseClassSlots, resolve, resolveInitialBindings, named, standard, classSlots, isDualWield, remapEquips, moveSlot, setClassSlots, settle };
    root.RREquipSlots = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
