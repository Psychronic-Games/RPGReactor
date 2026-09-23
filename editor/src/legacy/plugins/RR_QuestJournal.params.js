'use strict';
// RR_QuestJournal settings from the game's own scripts: every quest in
// QuestData.setup_quest ("when N" followed by q[:key] = value lines), the
// VOCAB / ICONS / CATEGORY_VOCAB / SORT_TYPE hashes and the menu constants.
// Values are read by a small Ruby literal reader (strings across lines,
// adjacent or +-joined strings, numbers, symbols, nested arrays).

// ---- tokens ----------------------------------------------------------------

const ESCAPES = { n: '\n', t: '\t', s: ' ', e: '\x1b', r: '\r', 0: '\0', a: '\x07', b: '\b', f: '\f', v: '\v' };

function tokenize(text) {
    const tokens = [];
    let i = 0;
    const n = text.length;
    while (i < n) {
        const c = text[i];
        if (c === '#') { while (i < n && text[i] !== '\n') i++; continue; }
        if (c === '\n') { tokens.push({ t: 'nl' }); i++; continue; }
        if (/\s/.test(c)) { i++; continue; }
        if (c === '=' && text.startsWith('=begin', i) && (i === 0 || text[i - 1] === '\n')) {
            const end = text.indexOf('\n=end', i);
            i = end < 0 ? n : end + 5;
            continue;
        }
        if (c === '"' || c === "'") {
            let s = '';
            i++;
            while (i < n && text[i] !== c) {
                if (text[i] === '\\' && i + 1 < n) {
                    const e = text[i + 1];
                    if (c === "'") s += (e === "'" || e === '\\') ? e : '\\' + e;
                    else s += e in ESCAPES ? ESCAPES[e] : e;
                    i += 2;
                } else s += text[i++];
            }
            i++;
            tokens.push({ t: 'str', v: s });
            continue;
        }
        if (c === ':' && /[A-Za-z_]/.test(text[i + 1] || '')) {
            const m = /^:([A-Za-z_][A-Za-z0-9_]*[?!]?)/.exec(text.slice(i, i + 80));
            tokens.push({ t: 'sym', v: m[1] });
            i += m[0].length;
            continue;
        }
        const num = /^-?\d[\d_]*(\.\d+)?/.exec(text.slice(i, i + 40));
        if (num && (c !== '-' || !tokens.length || ['=', ',', '[', '(', '=>', 'nl'].includes(tokens[tokens.length - 1].v || tokens[tokens.length - 1].t))) {
            tokens.push({ t: 'num', v: Number(num[0].replace(/_/g, '')) });
            i += num[0].length;
            continue;
        }
        const word = /^[A-Za-z_][A-Za-z0-9_]*[?!]?/.exec(text.slice(i, i + 80));
        if (word) { tokens.push({ t: 'id', v: word[0] }); i += word[0].length; continue; }
        if (text.startsWith('=>', i)) { tokens.push({ t: 'p', v: '=>' }); i += 2; continue; }
        if (text.startsWith('==', i)) { tokens.push({ t: 'p', v: '==' }); i += 2; continue; }
        tokens.push({ t: 'p', v: c });
        i++;
    }
    return tokens;
}

// ---- values ----------------------------------------------------------------

const UNSET = Symbol('unset');

/** One Ruby literal from tokens[at]; returns [value, next index] or [UNSET, at]. */
function readValue(tokens, at) {
    const skipNl = k => { while (tokens[k] && tokens[k].t === 'nl') k++; return k; };
    let [value, i] = readPrimary(tokens, at, skipNl);
    if (value === UNSET) return [UNSET, at];
    // "a" "b", "a" + "b", "a" \ newline "b"
    while (typeof value === 'string') {
        let k = i;
        if (tokens[k] && tokens[k].v === '\\') k = skipNl(k + 1);
        else if (tokens[k] && tokens[k].v === '+') k = skipNl(k + 1);
        if (!tokens[k] || tokens[k].t !== 'str') break;
        value += tokens[k].v;
        i = k + 1;
    }
    return [value, i];
}

function readPrimary(tokens, at, skipNl) {
    const tok = tokens[at];
    if (!tok) return [UNSET, at];
    if (tok.t === 'str' || tok.t === 'num') return [tok.v, at + 1];
    if (tok.t === 'sym') return [tok.v, at + 1];
    if (tok.t === 'id') {
        if (tok.v === 'true') return [true, at + 1];
        if (tok.v === 'false') return [false, at + 1];
        if (tok.v === 'nil') return [null, at + 1];
        return [UNSET, at];
    }
    if (tok.v === '[') {
        const out = [];
        let i = skipNl(at + 1);
        while (tokens[i] && tokens[i].v !== ']') {
            const [v, next] = readValue(tokens, i);
            if (v === UNSET) return [UNSET, at];
            out.push(v);
            i = skipNl(next);
            if (tokens[i] && tokens[i].v === ',') i = skipNl(i + 1);
        }
        return [out, i + 1];
    }
    if (tok.v === '{') {
        const out = {};
        let i = skipNl(at + 1);
        while (tokens[i] && tokens[i].v !== '}') {
            let key;
            if (tokens[i].t === 'id' && tokens[i + 1] && tokens[i + 1].v === ':') { key = tokens[i].v; i += 2; }
            else {
                const [k, next] = readValue(tokens, i);
                if (k === UNSET || !tokens[next] || tokens[next].v !== '=>') return [UNSET, at];
                key = k;
                i = next + 1;
            }
            const [v, next] = readValue(tokens, skipNl(i));
            if (v === UNSET) return [UNSET, at];
            out[key] = v;
            i = skipNl(next);
            if (tokens[i] && tokens[i].v === ',') i = skipNl(i + 1);
        }
        return [out, i + 1];
    }
    return [UNSET, at];
}

// ---- quests ----------------------------------------------------------------

const KEYS = { name: 'name', level: 'level', icon_index: 'iconIndex', description: 'description', banner: 'banner', banner_hue: 'bannerHue',
    prime_objectives: 'primeObjectives', custom_categories: 'customCategories', client: 'client', location: 'location',
    rewards: 'rewards', common_event_id: 'commonEventId', priority: 'priority' };

/** Quests from the setup_quest method: [{ id, name, objectives: [...], ... }]. */
function questsFrom(source) {
    const start = source.search(/def\s+self\.setup_quest\b/);
    if (start < 0) return [];
    const tokens = tokenize(source.slice(start));
    const quests = new Map();
    let current = null;
    let depth = 0;
    for (let i = 0; i < tokens.length; i++) {
        const tok = tokens[i];
        // The method ends at the 'end' that closes the def (case, if, etc. nest).
        if (tok.t === 'id') {
            const prev = tokens[i - 1];
            const lineStart = !prev || prev.t === 'nl' || prev.v === ';';
            if (lineStart && /^(def|case|if|unless|while|until|begin|for)$/.test(tok.v)) depth++;
            else if (tok.v === 'do') depth++;
            else if (tok.v === 'end') { depth--; if (depth <= 0) break; }
        }
        if (tok.t === 'id' && tok.v === 'when' && tokens[i + 1] && tokens[i + 1].t === 'num') {
            // "when 3, 4" sets up both quests the same way.
            current = [];
            let k = i + 1;
            while (tokens[k] && tokens[k].t === 'num') {
                const id = tokens[k].v;
                if (!quests.has(id)) quests.set(id, { id, objectives: [] });
                current.push(quests.get(id));
                k += tokens[k + 1] && tokens[k + 1].v === ',' ? 2 : 1;
            }
            continue;
        }
        // q[:key] = value   /   q[:objectives][n] = value
        if (!current || tok.t !== 'id' || tok.v !== 'q' || !tokens[i + 1] || tokens[i + 1].v !== '[' || !tokens[i + 2] || tokens[i + 2].t !== 'sym') continue;
        const key = tokens[i + 2].v;
        let k = i + 4;
        let index = null;
        if (tokens[k] && tokens[k].v === '[' && tokens[k + 1] && tokens[k + 1].t === 'num') { index = tokens[k + 1].v; k += 3; }
        if (!tokens[k] || tokens[k].v !== '=') continue;
        const [value, next] = readValue(tokens, k + 1);
        if (value === UNSET) continue;
        i = next - 1;
        for (const quest of current) {
            if (key === 'objectives') {
                if (index !== null) quest.objectives[index] = value == null ? '' : String(value);
                else if (Array.isArray(value)) quest.objectives = value.map(v => v == null ? '' : String(v));
            } else if (index === null) {
                quest[KEYS[key] || key] = JSON.parse(JSON.stringify(value));
            }
        }
    }
    const out = [...quests.values()].sort((a, b) => a.id - b.id);
    for (const quest of out) for (let j = 0; j < quest.objectives.length; j++) if (quest.objectives[j] == null) quest.objectives[j] = '';
    return out;
}

// ---- settings --------------------------------------------------------------

/** A constant's literal value (hash, array, number, string) inside source. */
function constantValue(source, name) {
    const re = new RegExp('^[ \\t]*' + name + '\\s*=', 'm');
    const m = re.exec(source);
    if (!m) return undefined;
    const tokens = tokenize(source.slice(m.index + m[0].length, m.index + m[0].length + 20000));
    const [value] = readValue(tokens, 0);
    return value === UNSET ? undefined : value;
}

const DEFAULTS = {
    menuName: 'Quests', menuIndex: 4, menuAccess: true, sceneLabel: 'Quest Journal', listWidth: 192, basicDataWidth: 240,
    categories: ['all', 'active', 'complete', 'failed'],
    categoryLabels: { all: 'All Quests', active: 'Active Quests', complete: 'Complete Quests', failed: 'Failed Quests' },
    sortTypes: { all: 'id', active: 'change', complete: 'complete', failed: 'failed' },
    icons: { all: 226, active: 236, complete: 238, failed: 227, client: 121, location: 231, reward_gold: 262, reward_exp: 117 },
    vocab: { description: 'Description', objectives: 'Objectives', objective_bullet: '♦', rewards: 'Rewards', reward_amount: 'x%d',
        reward_gold: '', reward_exp: '', level: 'Rank: ', location: '', client: '' },
    levelIcon: 125, levelIconSpace: 16, levelSignals: ['F', 'E', 'D', 'C', 'B', 'A', 'S'], failedColor: 10
};

function extract({ scripts = [], constants = {} } = {}) {
    const source = scripts.find(s => /module\s+QuestData\b/.test(s) && /def\s+self\.setup_quest\b/.test(s)) || '';
    const quests = questsFrom(source);
    // The Theo priority add-on only changes the list order; its default is 50.
    const value = (name, fallback, ok = v => v !== undefined) => { const v = constantValue(source, name); return ok(v) ? v : fallback; };
    const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
    const vocab = Object.assign({}, DEFAULTS.vocab, value('VOCAB', {}, isObj));
    const icons = Object.assign({}, DEFAULTS.icons, value('ICONS', {}, isObj));
    const colours = value('COLOURS', {}, isObj);
    // A later patch in the same script draws fixed status icons for objectives (failed, complete, other).
    const patch = /def\s+draw_objective[\s\S]*?when\s+:failed\s+draw_icon\((\d+)[\s\S]*?when\s+:complete\s+draw_icon\((\d+)[\s\S]*?else\s+draw_icon\((\d+)/.exec(source);
    const levelIcon = value('LEVEL_ICON', DEFAULTS.levelIcon, v => typeof v === 'number' || Array.isArray(v));
    return {
        quests: JSON.stringify(quests),
        menuName: String(vocab.menu_label || DEFAULTS.menuName),
        menuIndex: String(value('MENU_INDEX', DEFAULTS.menuIndex, v => typeof v === 'number')),
        menuAccess: String(value('MENU_ACCESS', DEFAULTS.menuAccess, v => typeof v === 'boolean')),
        sceneLabel: String(vocab.scene_label !== undefined ? vocab.scene_label : DEFAULTS.sceneLabel),
        manualReveal: String(value('MANUAL_REVEAL', false, v => typeof v === 'boolean')),
        openToLastRevealed: String(value('OPEN_TO_LAST_REVEALED_QUEST', true, v => typeof v === 'boolean')),
        openToLastChanged: String(value('OPEN_TO_LAST_CHANGED_QUEST', true, v => typeof v === 'boolean')),
        listWidth: String(value('LIST_WINDOW_WIDTH', DEFAULTS.listWidth, v => typeof v === 'number')),
        basicDataWidth: String(value('BASIC_DATA_WIDTH', DEFAULTS.basicDataWidth, v => typeof v === 'number')),
        categories: JSON.stringify(value('CATEGORIES', DEFAULTS.categories, v => Array.isArray(v) && v.length)),
        categoryLabels: JSON.stringify(Object.assign({}, DEFAULTS.categoryLabels, value('CATEGORY_VOCAB', {}, isObj))),
        sortTypes: JSON.stringify(Object.assign({}, DEFAULTS.sortTypes, value('SORT_TYPE', {}, isObj))),
        icons: JSON.stringify(icons),
        vocab: JSON.stringify(vocab),
        levelIcon: JSON.stringify(levelIcon),
        levelIconSpace: String(value('LEVEL_ICONS_SPACE', DEFAULTS.levelIconSpace, v => typeof v === 'number')),
        levelSignals: JSON.stringify(value('LEVEL_SIGNALS', DEFAULTS.levelSignals, Array.isArray)),
        failedColor: String(typeof colours.failed === 'number' ? colours.failed : DEFAULTS.failedColor),
        descriptionInBox: String(value('DESCRIPTION_IN_BOX', true, v => typeof v === 'boolean')),
        objectiveIcons: JSON.stringify(patch ? { failed: +patch[1], complete: +patch[2], active: +patch[3] } : {})
    };
}

module.exports = { extract, questsFrom, tokenize };
