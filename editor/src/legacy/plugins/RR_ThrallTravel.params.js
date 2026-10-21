'use strict';
// Plugin parameters for RR_ThrallTravel from Thrall's Fast Travel: each destination's job location
// (Window_Travel#refresh), region picture (Map_Sprite#refresh) and highlight (Travel_Sprite#refresh), for
// everyone or by party member, read from the scripts' case blocks; and the variables the scene uses.

const text = (s) => String(s && typeof s === 'object' ? s.text || '' : s || '');

/** The body of `def name` inside `class owner`. */
function method(source, owner, name) {
    const cls = new RegExp('^class ' + owner + '\\b', 'm').exec(source);
    if (!cls) return '';
    const rest = source.slice(cls.index);
    const def = new RegExp('^\\s*def ' + name + '\\b[^\\n]*\\n([\\s\\S]*?)^  end\\b', 'm').exec(rest);
    return def ? def[1] : '';
}

/**
 * Walks case/when blocks, calling found(value, cases) for each line `pick` matches, where cases maps each
 * enclosing case's subject to the `when` values it is under.
 */
function walk(body, pick, found) {
    const stack = [];
    for (const raw of body.split('\n')) {
        const line = raw.replace(/#.*$/, '').trim();
        if (!line) continue;
        let m;
        if ((m = /^case\s+(.+)$/.exec(line))) { stack.push({ subject: m[1].trim(), values: null }); continue; }
        if ((m = /^when\s+(.+)$/.exec(line))) {
            const top = [...stack].reverse().find(s => s.subject);
            if (top) top.values = (m[1].match(/\d+/g) || []).map(Number);
            continue;
        }
        if (/^(for|if|unless|while|until|begin)\b/.test(line)) { stack.push({ subject: null }); continue; }
        if (line === 'end') { stack.pop(); continue; }
        if ((m = pick(line))) {
            const cases = {};
            for (const s of stack) if (s.subject && s.values) cases[s.subject] = s.values;
            found(m, cases);
        }
    }
}

function extract({ scripts = [] } = {}) {
    const source = scripts.map(text).find(s => /class Scene_Travel\b/.test(s) && /class Window_Travel\b/.test(s)) || '';
    const out = {};
    if (!source) return out;
    const dest = { all: {}, members: {} };
    const put = (cases, subject, field, value) => {
        for (const index of cases[subject] || []) {
            for (const m of cases.member || [null]) {
                const table = m === null ? dest.all : (dest.members[m] = dest.members[m] || {});
                table[index] = Object.assign(table[index] || {}, { [field]: value });
            }
        }
    };
    const refresh = method(source, 'Window_Travel', 'refresh').split(/\n\s*for job in jobs\b/)[0];
    walk(refresh, (l) => /^location\s*=\s*(\d+)$/.exec(l), (m, cases) => put(cases, 'destination', 'location', Number(m[1])));
    const picture = (l) => /^bitmap\s*=\s*Bitmap\.new\(folder\s*\+\s*"([^"]+)"\)$/.exec(l);
    walk(method(source, 'Map_Sprite', 'refresh'), picture, (m, cases) => put(cases, 'i', 'map', m[1]));
    walk(method(source, 'Travel_Sprite', 'refresh'), picture, (m, cases) => put(cases, 'index', 'cursor', m[1]));
    out.destinations = JSON.stringify(dest);
    const base = /self\.bitmap = Bitmap\.new\("Graphics\/Pictures\/([^"]+)"\)/.exec(method(source, 'Map_Sprite', 'initialize'));
    if (base) out.baseMap = base[1];
    const home = /Bitmap\.new\(folder \+ "([^"]+)"\)\s*\n\s*@bitmap\.blt/.exec(method(source, 'Map_Sprite', 'refresh'));
    if (home) out.homeMap = home[1];
    const regions = /regions = \$game_variables\[(\d+)\]/.exec(source);
    if (regions) out.regionVariable = regions[1];
    const member = /member = \$game_variables\[(\d+)\]/.exec(source);
    if (member) out.memberVariable = member[1];
    const result = /\$game_variables\[(\d+)\] = @destination/.exec(source);
    if (result) out.resultVariable = result[1];
    const icons = /icons = (\[[\d,\s]+\])/.exec(source);
    if (icons) out.deliveryIcons = JSON.stringify(JSON.parse(icons[1]));
    return out;
}

module.exports = { extract };
