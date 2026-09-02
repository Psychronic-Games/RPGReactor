/**
 * EnemySlotOptions - the enemy slots a battle command addresses, named where
 * they can be named.
 *
 * Every battle event command picks its target the same way: one of eight troop
 * slots. A troop page knows its own members, so slot 3 can read "#3 Goblin"; a
 * map event has no troop and the slot number is the whole answer. Whoever opens
 * the dialog passes the page's troop through as `context.troop`, and every
 * dialog shares this one resolution rather than each printing a bare "#3".
 *
 * `context.enemyName` is an optional resolver, so a caller that knows about
 * editor names (Database.names.json) can hand back the same primary name its
 * own lists show instead of the game name.
 */
const RREnemySlotOptions = {
    SLOTS: 8,

    /** Every slot as `{ value, label }`, in troop order. */
    list(context, databaseManager) {
        const members = this.members(context);
        const count = Math.max(this.SLOTS, members.length);
        const options = [];
        for (let index = 0; index < count; index++) {
            options.push({ value: index, label: this.label(index, context, databaseManager) });
        }
        return options;
    },

    /** One slot: "#3 Goblin" when the troop fills it, "#3" when it does not. */
    label(index, context, databaseManager) {
        const number = `#${index + 1}`;
        const member = this.members(context)[index];
        if (!member) return number;
        const enemy = this.enemy(member.enemyId, databaseManager);
        if (!enemy) return number;
        const resolve = context && typeof context.enemyName === 'function' ? context.enemyName : null;
        const name = String((resolve ? resolve(enemy) : enemy.name) || enemy.name || '').trim();
        return name ? `${number} ${name}` : number;
    },

    members(context) {
        const troop = context && context.troop;
        return troop && Array.isArray(troop.members) ? troop.members : [];
    },

    enemy(enemyId, databaseManager) {
        try {
            const enemies = databaseManager && typeof databaseManager.getEnemies === 'function'
                ? databaseManager.getEnemies() : null;
            return Array.isArray(enemies) ? (enemies.find(entry => entry && entry.id === enemyId) || null) : null;
        } catch (error) {
            return null;
        }
    },

    /**
     * Append the slots to a `<select>`, marking `selected`. Options already in
     * the element (an "Entire Troop" entry, say) are left where they are.
     */
    fill(select, selected, context, databaseManager) {
        for (const slot of this.list(context, databaseManager)) {
            const option = document.createElement('option');
            option.value = slot.value;
            option.textContent = slot.label;
            option.selected = (selected === slot.value);
            select.appendChild(option);
        }
        return select;
    }
};

if (typeof window !== 'undefined') window.RREnemySlotOptions = RREnemySlotOptions;
if (typeof module !== 'undefined' && module.exports) module.exports = RREnemySlotOptions;
