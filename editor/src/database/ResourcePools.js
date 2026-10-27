/**
 * ResourcePools - the project's switches for the default resource pools and
 * the trait picker's list, both kept in System.json.
 *
 *   rrPoolsOff:     ["mp"], ["tp"] or ["mp", "tp"]. A pool that is off is
 *                   hidden on every runtime window and HUD, costs nothing and
 *                   (TP) gains nothing; the editor hides its fields. HP is
 *                   never off. Absent (the default) is today's behaviour.
 *   rrHiddenTraits: trait codes the trait picker leaves out, so a project's
 *                   list holds only the traits it uses. A trait already on a
 *                   record keeps its row when edited. Absent shows them all.
 *
 * The runtime reads the same keys (Game_BattlerBase.isPoolOn,
 * Window_Base.isPoolHidden, ReactorUI.isPoolHidden, ReactorFightHud.poolOff).
 */
class ResourcePools {
    /** The pools a project may turn off, with their place in System.json terms.basic (full name, abbreviation). */
    static POOLS = [
        { key: 'mp', label: 'Use MP', basic: [4, 5], fallback: 'MP' },
        { key: 'tp', label: 'Use TP', basic: [6, 7], fallback: 'TP' }
    ];

    /** The trait picker's tabs and every trait on them, by stored code, in picker order. */
    static TRAIT_TABS = [
        { id: 'rates', label: 'Rates', traits: [[11, 'Element Rate'], [12, 'Debuff Rate'], [15, 'Buff Rate'], [13, 'State Rate'], [14, 'State Resist']] },
        { id: 'param', label: 'Param', traits: [[21, 'Parameter'], [22, 'Ex-Parameter'], [23, 'Sp-Parameter']] },
        { id: 'attack', label: 'Attack', traits: [[31, 'Attack Element'], [32, 'Attack State'], [33, 'Attack Speed'], [34, 'Attack Times+'], [35, 'Attack Skill']] },
        { id: 'skill', label: 'Skill', traits: [[41, 'Add Skill Type'], [42, 'Seal Skill Type'], [43, 'Add Skill'], [44, 'Seal Skill']] },
        { id: 'equip', label: 'Equip', traits: [[51, 'Equip Weapon'], [52, 'Equip Armor'], [53, 'Lock Equip'], [54, 'Seal Equip'], [55, 'Slot Type']] },
        { id: 'other', label: 'Other', traits: [[61, 'Action Times+'], [62, 'Special Flag'], [63, 'Collapse Effect'], [64, 'Party Ability']] }
    ];

    /** Whether `key` (mp or tp) is turned off for the project. HP never is. */
    static isOff(system, key) {
        return !!system && Array.isArray(system.rrPoolsOff) && key !== 'hp' && system.rrPoolsOff.includes(key);
    }

    /** Turns a pool on or off; a project with every pool on keeps no key at all. */
    static setOff(system, key, off) {
        if (!system || key === 'hp') return;
        const list = new Set(Array.isArray(system.rrPoolsOff) ? system.rrPoolsOff : []);
        if (off) list.add(key); else list.delete(key);
        const kept = ResourcePools.POOLS.map(pool => pool.key).filter(k => list.has(k));
        if (kept.length) system.rrPoolsOff = kept; else delete system.rrPoolsOff;
    }

    /** The project's own name for a pool (Terms > Basic Status, abbreviation first), so a renamed MP reads as the project calls it. */
    static term(system, key) {
        const basic = system && system.terms && Array.isArray(system.terms.basic) ? system.terms.basic : [];
        const pool = key === 'hp' ? { basic: [2, 3], fallback: 'HP' } : ResourcePools.POOLS.find(p => p.key === key);
        if (!pool) return String(key || '').toUpperCase();
        return String(basic[pool.basic[1]] || basic[pool.basic[0]] || pool.fallback);
    }

    /**
     * A field label naming a pool by the project's term: "MP Cost" for a renamed MP reads "Mana Cost".
     * `translated` is the editor-language label; the pool's English abbreviation in it is swapped for the term.
     */
    static label(system, key, translated) {
        const fallback = key === 'hp' ? 'HP' : (ResourcePools.POOLS.find(p => p.key === key) || {}).fallback;
        const term = ResourcePools.term(system, key);
        if (!fallback || term === fallback) return translated;
        return translated.includes(fallback) ? translated.split(fallback).join(term) : `${translated} (${term})`;
    }

    /** The trait codes the picker leaves out. */
    static hiddenTraits(system) {
        return new Set(system && Array.isArray(system.rrHiddenTraits) ? system.rrHiddenTraits.map(Number).filter(Number.isFinite) : []);
    }

    static isTraitHidden(system, code) {
        return ResourcePools.hiddenTraits(system).has(Number(code));
    }

    /** Shows or hides traits in the picker; nothing hidden keeps no key. */
    static setTraitsHidden(system, codes, hidden) {
        if (!system) return;
        const set = ResourcePools.hiddenTraits(system);
        for (const code of codes) { if (hidden) set.add(Number(code)); else set.delete(Number(code)); }
        const order = ResourcePools.TRAIT_TABS.flatMap(tab => tab.traits.map(([code]) => code));
        const kept = order.filter(code => set.has(code)).concat([...set].filter(code => !order.includes(code)).sort((a, b) => a - b));
        if (kept.length) system.rrHiddenTraits = kept; else delete system.rrHiddenTraits;
    }

    /**
     * The picker's tabs as the project shows them: a tab whose every trait is hidden is left out,
     * unless `keepCode` (the trait being edited) is on it. Each tab carries `codes`, its shown codes.
     */
    static visibleTraitTabs(system, keepCode = null) {
        const hidden = ResourcePools.hiddenTraits(system);
        const tabs = ResourcePools.TRAIT_TABS.map(tab => ({
            id: tab.id, label: tab.label,
            codes: tab.traits.map(([code]) => code).filter(code => !hidden.has(code) || code === Number(keepCode))
        })).filter(tab => tab.codes.length > 0);
        // Everything hidden: the picker still opens on something rather than nothing.
        return tabs.length ? tabs : ResourcePools.TRAIT_TABS.map(tab => ({ id: tab.id, label: tab.label, codes: tab.traits.map(([code]) => code) }));
    }

    /** The first trait code a new trait starts on: the first one the project shows. */
    static firstShownCode(system) {
        return ResourcePools.visibleTraitTabs(system)[0].codes[0];
    }
}

if (typeof globalThis !== 'undefined') {
    globalThis.ResourcePools = ResourcePools;
}
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ResourcePools;
}
