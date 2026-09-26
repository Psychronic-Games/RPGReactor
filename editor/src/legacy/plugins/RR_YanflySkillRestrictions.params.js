'use strict';
// Plugin parameters for RR_YanflySkillRestrictions from the game's copy of Yanfly's Skill Restrictions
// (YEA::SKILL_RESTRICT), whether its Reload and Mag Size add-ons are live (not inside =begin … =end), the game's
// Font.default_size, and its skills' <restrict eval> blocks translated to JavaScript (from Data/Skills.rvdata2).

const C = require('../RgssConvert.js');
const { setting, live, translate, aceRecords } = require('./RR_YanflySkillCost.params.js');

const text = (s) => String(s && typeof s === 'object' ? s.text || '' : s || '');

// The script's skill tags, in the order it tries them; a line matching one is not part of a <restrict eval> block.
const TAGS = [/<(?:COOL_DOWN|cooldown):[ ](\d+)>/i, /<(?:WARM_UP|warmup):[ ](\d+)>/i, /<(?:LIMITED_USES|limited uses):[ ](\d+)>/i,
    /<(?:CHANGE_COOL_DOWN|change cooldown):[ ]([+-]\d+)>/i, /<(?:STYPE_COOL_DOWN|stype cooldown)[ ](\d+):[ ]([+-]\d+)>/i, /<(?:SKILL_COOL_DOWN|skill cooldown)[ ](\d+):[ ]([+-]\d+)>/i,
    /<(?:RESTRICT_IF_SWITCH|restrict if switch):[ ](\d+)>/i, /<(?:RESTRICT_ANY_SWITCH|restrict any switch):[ ]*(\d+(?:\s*,\s*\d+)*)>/i,
    /<(?:RESTRICT_ALL_SWITCH|restrict all switch):[ ]*(\d+(?:\s*,\s*\d+)*)>/i, /<\/(?:RESTRICT_EVAL|restrict eval)>/i];
const EVAL_ON = /<(?:RESTRICT_EVAL|restrict eval)>/i;

/**
 * A skill's <restrict eval> text as the script reads it: every line after the opening tag that is not one of its
 * tags, joined with nothing between. The closing tag sets a flag the script never reads, so the block runs to the
 * note's end. Null when the note has no block.
 */
function restrictEval(note) {
    let on = false, body = '';
    for (const line of String(note || '').split(/[\r\n]+/)) {
        if (TAGS.some(re => re.test(line))) continue;
        if (EVAL_ON.test(line)) { on = true; continue; }
        if (on) body += line;
    }
    return on ? body : null;
}

/** { skill id: JavaScript } for each skill with a <restrict eval> block, or { skill id: { ruby } } when untranslatable. */
function restrictEvals(skills, constants = {}) {
    const out = {};
    for (const skill of skills) {
        const ruby = restrictEval(skill.note);
        if (ruby === null) continue;
        const js = translate(ruby, constants);
        out[skill.id] = js === null ? { ruby } : js;
    }
    return out;
}

function extract({ scripts = [], constants = {}, read } = {}) {
    const sources = scripts.map(text);
    const source = sources.find(s => /\$imported\["YEA-SkillRestrictions"\]\s*=\s*true/.test(s)) || '';
    const get = (name, d) => setting(source, name, d);
    const size = C.fontDefaults(sources, constants).size;
    const liveText = sources.map(live).join('\n');
    return {
        cooldownColour: String(get('COOLDOWN_COLOUR', 0)), cooldownSize: String(get('COOLDOWN_SIZE', 20)), cooldownSuffix: String(get('COOLDOWN_SUFFIX', '%sCD')), cooldownIcon: String(get('COOLDOWN_ICON', 0)),
        warmupColour: String(get('WARMUP_COLOUR', 0)), warmupSize: String(get('WARMUP_SIZE', 20)), warmupSuffix: String(get('WARMUP_SUFFIX', '%sWU')), warmupIcon: String(get('WARMUP_ICON', 0)),
        limitedColour: String(get('LIMITED_COLOUR', 0)), limitedSize: String(get('LIMITED_SIZE', 20)), limitedText: String(get('LIMITED_TEXT', 'Used')), limitedIcon: String(get('LIMITED_ICON', 0)),
        doppelganger: String(/\$imported\["YEA-Doppelganger"\]\s*=\s*true/.test(liveText)),
        reloadAddon: String(/RELOAD_SKILLS\s*=/.test(liveText)),
        magSizeAddon: String(/MAG_SIZE\s*=\s*\//.test(liveText) && /def mag_bonus\b/.test(liveText)),
        rgssFontSize: String(typeof size === 'number' ? size : 24),
        restrictEvals: JSON.stringify(restrictEvals(aceRecords(read, 'Skills'), constants))
    };
}

module.exports = { extract, restrictEval, restrictEvals };
