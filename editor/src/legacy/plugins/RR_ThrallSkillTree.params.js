'use strict';
// Plugin parameters for RR_ThrallSkillTree from the game's copy of Deity's SkillTree (module Deity::SkillTree)
// and of the Respec System: the slot colours, terms and point rules, the branch names Window_SkillTree draws
// per class, and the skill ranges a respec forgets.

const { readLiteral } = require('./RR_VAnimatedTitle.params.js');

/** NAME = <literal> in the text (the first uncommented one), or undefined. */
function constant(text, name) {
    const m = new RegExp('^[ \\t]*' + name + '\\s*=\\s*', 'm').exec(text);
    if (!m) return undefined;
    try { return readLiteral(text, m.index + m[0].length)[0]; } catch (_) { return undefined; }
}
/** NAME = Color.new(r, g, b[, a]) as "r,g,b[,a]". */
function colour(text, name) {
    const m = new RegExp('^[ \\t]*' + name + '\\s*=\\s*Color\\.new\\(([^)]*)\\)', 'm').exec(text);
    return m ? m[1].split(',').map(s => String(parseInt(s, 10) || 0)).join(',') : undefined;
}
/** `case actor.class_id` / `when n` blocks of draw_text names, as { n: [names], other: [names] }. */
function branches(text) {
    const at = text.search(/#Draw Branch Names/);
    if (at < 0) return undefined;
    const body = text.slice(at, text.indexOf('\n    end', at));
    const out = {};
    for (const m of body.matchAll(/(when (\d+)|else)\s*\n([\s\S]*?)(?=\n\s*(?:when \d+|else)\s*\n|$)/g)) {
        const names = Array.from(m[3].matchAll(/text = "([^"]*)"/g), x => x[1]);
        if (names.length) out[m[2] || 'other'] = names;
    }
    return Object.keys(out).length ? out : undefined;
}
/** Respec's `case @actor.class_id` with `for i in a..b` forget loops. */
function respecRanges(text) {
    const at = text.search(/def respec\b/);
    if (at < 0) return undefined;
    const body = text.slice(at, text.indexOf('\n  end', at));
    const out = {};
    for (const m of body.matchAll(/(when (\d+)|else)[^\n]*\n\s*for i in (\d+)\.\.(\d+)/g)) out[m[2] || 'other'] = [Number(m[3]), Number(m[4])];
    return Object.keys(out).length ? out : undefined;
}

function extract({ scripts = [] } = {}) {
    const out = {};
    const tree = scripts.find(s => /module Deity\s*\n\s*module SkillTree\b/.test(String(s))) || '';
    if (tree) {
        for (const [name, key] of [['SLOT_COLOR1', 'slotColor1'], ['SLOT_COLOR2', 'slotColor2'], ['CURSOR_COLOR', 'cursorColor'], ['LEARNED_SKILL_COLOR', 'learnedColor']]) {
            const v = colour(tree, name); if (v) out[key] = v;
        }
        for (const [name, key] of [['SKILL_POINTS', 'skillPoints'], ['SKILL_COST', 'skillCost'], ['POINTS_LEVEL_RANGE', 'pointsLevelRange'], ['LEVEL_UP_POINTS', 'levelUpPoints']]) {
            const v = constant(tree, name); if (v !== undefined && v !== null) out[key] = String(v);
        }
        const b = branches(tree); if (b) out.branches = JSON.stringify(b);
        const pic = /x = 272 \* \$game_variables\[(\d+)\]/.exec(tree); if (pic) out.pictureVariable = pic[1];
        const menu = /def return_scene\s*\n\s*\$scene = Scene_Menu\.new\((\d+)\)/.exec(tree); if (menu) out.menuIndex = menu[1];
    }
    const respec = scripts.find(s => /class Scene_Respec < Scene_Base/.test(String(s))) || '';
    if (respec) {
        const r = respecRanges(respec); if (r) out.respecSkills = JSON.stringify(r);
        const gold = /(?:gold|cost) = \(\$game_party\.gold \+ \$game_variables\[(\d+)\]\) \/ 20/.exec(respec); if (gold) out.respecGoldVariable = gold[1];
        const se = /Audio\.se_play\("Audio\/SE\/([^"]+)"/.exec(respec); if (se) out.respecSe = se[1];
    }
    return out;
}

module.exports = { extract };
