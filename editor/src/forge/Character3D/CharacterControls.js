/**
 * The controls of a character, described from the Forge's own data, for anything
 * that shapes a character outside the Builder's page: the game's Character Creation.
 * Nothing here lists a slider, hairstyle, outfit or species by hand, so what the
 * Forge gains, the game gains with its next build.
 *
 *   tabs(rules)                 [{ id, label, controls }] as `rules` allows them
 *   enforce(recipe, rules)      a recipe held to those rules: the worker's and server's last word
 *
 * A control is { kind: 'slider', path, label, min, max, step, ends? },
 * { kind: 'select', path, label, options: [{ id, label, group }] } or
 * { kind: 'color', path, label }. `path` is the recipe's own (hair.color).
 */
(function (root) {
    'use strict';
    const load = (name, file) => root[name] || (typeof require === 'function' ? require(file) : null);
    const Body = () => load('RRHumanBody', './HumanBody.js');
    const Targets = () => load('RRHumanTargets', './HumanTargets.js');
    const Hair = () => load('RRCharacterHair', './CharacterHair.js');
    const Wardrobe = () => load('RRCharacterWardrobe', './CharacterWardrobe.js');
    const Species = () => load('RRCharacterSpecies', './CharacterSpecies.js');

    const TABS = [['species', 'Species'], ['body', 'Body'], ['face', 'Face'], ['hair', 'Hair'], ['outfit', 'Outfit'], ['colors', 'Colors']];
    /** Everything a player may change unless the project says otherwise. */
    const DEFAULT_RULES = Object.freeze({ species: 'human', body: true, face: true, hair: true, outfit: true, colors: true, extreme: false, anatomy: false });

    const rulesOf = rules => Object.assign({}, DEFAULT_RULES, rules);
    const allowedSpecies = rules => {
        const all = Species().SPECIES.map(s => s.id), wanted = rulesOf(rules).species;
        if (wanted === 'all') return all;
        const list = Array.isArray(wanted) ? wanted : [wanted];
        return list.filter(id => all.includes(id));
    };

    function range(key, extreme) {
        const ranges = Body().MACRO_RANGES[key];
        return extreme ? ranges.extreme : ranges.natural;
    }

    function bodyControls(rules) {
        const extreme = rulesOf(rules).extreme, macro = (path, label, ends) => {
            const [min, max] = range(path, extreme);
            return { kind: 'slider', path, label, min, max, step: 0.01, ends };
        };
        return [
            { kind: 'slider', path: 'gender', label: 'Gender', min: 0, max: 1, step: 0.01, ends: ['Female', 'Male'] },
            { kind: 'slider', path: 'age', label: 'Age', min: 18, max: 90, step: 1 },
            macro('height', 'Height'), macro('weight', 'Weight', ['Thin', 'Heavy']), macro('muscle', 'Muscle'), macro('cup', 'Bust'),
            ...shapeControls(rules, section => !FACE_SECTIONS.has(section))
        ];
    }

    const FACE_SECTIONS = new Set(['Head and neck', 'Forehead and brows', 'Eyes', 'Nose', 'Mouth and jaw', 'Ears', 'Head shape']);

    function shapeControls(rules, wanted) {
        const span = rulesOf(rules).extreme ? slider => slider.extreme || 1 : () => 1;
        return Targets().SLIDERS.filter(slider => wanted(slider.section)).map(slider => ({
            kind: 'slider', path: 'shapes.' + slider.key, label: slider.label, group: slider.section,
            min: slider.paired ? -span(slider) : 0, max: span(slider), step: 0.01
        }));
    }

    function hairControls() {
        const hair = Hair();
        return [
            { kind: 'select', path: 'hair.style', label: 'Hairstyle', options: hair.STYLES.map(s => ({ id: s.id, label: s.label, group: s.group })) },
            { kind: 'slider', path: 'hair.length', label: 'Length', min: 0, max: 2, step: 0.01 },
            { kind: 'slider', path: 'hair.volume', label: 'Volume', min: 0, max: 1, step: 0.01 },
            { kind: 'slider', path: 'hair.curl', label: 'Curl', min: 0, max: 1, step: 0.01 },
            { kind: 'color', path: 'hair.color', label: 'Hair color' },
            { kind: 'select', path: 'hair.facial.style', label: 'Facial hair', options: hair.FACIAL.map(s => ({ id: s.id, label: s.label, group: s.group })) }
        ];
    }

    function outfitControls() {
        return [{ kind: 'select', path: 'outfitPreset', label: 'Outfit', options: Wardrobe().PRESETS.map(p => ({ id: p.id, label: p.label, group: p.group })) }];
    }

    const COLORS = [['skin', 'Skin'], ['eyes.color', 'Eyes'], ['lips', 'Lips']];

    function speciesControls(rules) {
        const allowed = new Set(allowedSpecies(rules));
        return [{ kind: 'select', path: 'species', label: 'Species', options: Species().SPECIES.filter(s => allowed.has(s.id)).map(s => ({ id: s.id, label: s.label, group: s.group })) }];
    }

    function tabs(rules) {
        const r = rulesOf(rules), made = {
            species: () => allowedSpecies(r).length > 1 ? speciesControls(r) : [],
            body: () => r.body ? bodyControls(r) : [],
            face: () => r.face ? shapeControls(r, section => FACE_SECTIONS.has(section)) : [],
            hair: () => r.hair ? hairControls() : [],
            outfit: () => r.outfit ? outfitControls() : [],
            colors: () => r.colors ? COLORS.map(([path, label]) => ({ kind: 'color', path, label })) : []
        };
        return TABS.map(([id, label]) => ({ id, label, controls: made[id]() })).filter(tab => tab.controls.length);
    }

    /** The recipe's fields a player could not have reached are set back, whatever sent them. */
    function enforce(recipe, rules) {
        const r = rulesOf(rules), allowed = allowedSpecies(r);
        const out = JSON.parse(JSON.stringify(recipe || {}));
        if (!allowed.includes(out.species || 'human')) out.species = allowed[0] || 'human';
        if (!r.anatomy) { out.anatomy = Object.assign({}, out.anatomy, { detail: false }); }
        if (!r.extreme) {
            for (const key of Object.keys(Body().MACRO_RANGES)) {
                if (typeof out[key] === 'number') { const [low, high] = range(key, false); out[key] = Math.max(low, Math.min(high, out[key])); }
            }
            if (out.shapes) for (const slider of Targets().SLIDERS) {
                if (typeof out.shapes[slider.key] === 'number') out.shapes[slider.key] = Math.max(slider.paired ? -1 : 0, Math.min(1, out.shapes[slider.key]));
            }
        }
        if (typeof out.age === 'number') out.age = Math.max(18, Math.min(90, out.age));
        // A game that has not allowed anatomical detail starts its players dressed, and keeps them so.
        if (!r.anatomy && !(Array.isArray(out.outfit) && out.outfit.length) && out.species !== 'slimefolk') {
            const everyday = Wardrobe().PRESETS.find(preset => preset.group === 'Everyday') || Wardrobe().PRESETS[0];
            out.outfit = JSON.parse(JSON.stringify(everyday.items));
        }
        return out;
    }

    const api = { DEFAULT_RULES, tabs, enforce, allowedSpecies };
    root.RRCharacterControls = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
