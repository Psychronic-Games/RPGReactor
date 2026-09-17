/**
 * The parameter names a project actually uses.
 *
 * Database > Terms > Parameters edits `System.json`'s `terms.params`, and the
 * runtime hands exactly that array to `TextManager.param()`, so a project that
 * renames Attack to Strength says Strength everywhere in play. The editor that
 * authored the rename did not: every database surface carried its own hardcoded
 * copy of the English MZ names, so the Classes curve grid labelled the Strength
 * curve "Attack", the trait dropdown offered "M.Defense" for what the game calls
 * Spirit, and the Enemies page disagreed with the bestiary it feeds. Reading the
 * project's own answer in one place fixes all of them together.
 *
 * A slot the project has NOT renamed still gets the translated English default,
 * so a stock project opened in a Japanese editor keeps showing Japanese instead
 * of the English sitting in its data. Only a name the author actually chose
 * overrides the translation, because only that name is content rather than UI.
 *
 * Slots 8 and 9 are in the same array and on the same Terms page but are not
 * parameters: they name the first two ex-parameters, Hit and Evasion.
 */

// Stock names per slot, as shipped. Slots 0-7 are what `template/Demo`'s
// System.json carries and what ProjectManager writes into a new project; slots
// 8-9 differ between the two ("Hit"/"Evasion" in the Demo, "Hit Rate"/"Evasion
// Rate" for a new project), so both count as untouched.
const RR_STOCK_PARAM_TERMS = Object.freeze([
    ['Max HP'], ['Max MP'], ['Attack'], ['Defense'],
    ['M.Attack'], ['M.Defense'], ['Agility'], ['Luck'],
    ['Hit', 'Hit Rate'], ['Evasion', 'Evasion Rate']
]);

globalThis.RR_DEFAULT_PARAM_NAMES = Object.freeze([
    'Max HP', 'Max MP', 'Attack', 'Defense', 'M.Attack', 'M.Defense', 'Agility', 'Luck'
]);

/**
 * `terms.params` from the open project, or [] when no project is loaded — which
 * is the state the editor starts in, and the state every test sandbox is in.
 */
globalThis.rrParamTerms = function () {
    try {
        const system = globalThis.window?.reactor?.projectController?.databaseManager?.getSystem?.();
        const params = system?.terms?.params;
        return Array.isArray(params) ? params : [];
    } catch (error) {
        return [];
    }
};

/**
 * One slot of `terms.params`, or the translated fallback when the project has
 * not renamed it. `terms` defaults to the open project's.
 *
 * @param {number} slot - index into terms.params (0-7 params, 8 Hit, 9 Evasion)
 * @param {string} fallback - the English label this surface uses by default
 * @param {Function} [translate] - defaults to I18n.tText
 * @param {Array} [terms] - an explicit terms.params, for tests and callers that
 *   already hold the data
 */
globalThis.rrParamTermName = function (slot, fallback, translate, terms) {
    const t = typeof translate === 'function'
        ? translate
        : (text => (globalThis.window?.I18n ? globalThis.window.I18n.tText(text) : text));
    const list = Array.isArray(terms) ? terms : globalThis.rrParamTerms();
    const authored = typeof list[slot] === 'string' ? list[slot].trim() : '';
    if (!authored) return t(fallback);

    const stock = RR_STOCK_PARAM_TERMS[slot] || [];
    const isStock = stock.some(name => name.toLowerCase() === authored.toLowerCase());
    return isStock ? t(fallback) : authored;
};

/**
 * The eight base parameter names, in engine order (paramId 0-7).
 */
globalThis.rrParamNames = function (translate, terms) {
    return globalThis.RR_DEFAULT_PARAM_NAMES.map((fallback, slot) =>
        globalThis.rrParamTermName(slot, fallback, translate, terms));
};

/**
 * The Hit and Evasion names, for the first two entries of an ex-parameter list.
 * `fallbacks` is the pair of English labels the calling surface uses, which are
 * not the same across the editor ("Evasion" in one trait table, "Evasion Rate"
 * in another), so each caller keeps its own wording when nothing was renamed.
 */
globalThis.rrHitEvasionNames = function (fallbacks, translate, terms) {
    const pair = Array.isArray(fallbacks) ? fallbacks : ['Hit', 'Evasion'];
    return [
        globalThis.rrParamTermName(8, pair[0] ?? 'Hit', translate, terms),
        globalThis.rrParamTermName(9, pair[1] ?? 'Evasion', translate, terms)
    ];
};
