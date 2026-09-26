'use strict';
// Plugin parameters for RR_YanflySaveEngine from the game's copy of Yanfly's Ace Save Engine (YEA::SAVE), Galv's
// confirmation add-on (its CONFIRM_* texts, when the game carried it), a later Window_FileList#draw_item that names
// the first slot AUTOSAVE_FILE_NAME (the autosave file-name add-on), and the game's Font.default_size.

const { readLiteral } = require('./RR_VAnimatedTitle.params.js');
const C = require('../RgssConvert.js');

const text = (s) => String(s && typeof s === 'object' ? s.text || '' : s || '');
const literal = (source, name) => {
    const m = new RegExp('^\\s*' + name + '\\s*=\\s*', 'm').exec(source);
    if (!m) return null;
    try { return readLiteral(source, m.index + m[0].length)[0]; } catch (_) { return null; }
};

function extract({ scripts = [], constants = {} } = {}) {
    const sources = scripts.map(text);
    const source = sources.find(s => /\$imported\["YEA-SaveEngine"\]\s*=\s*true/.test(s)) || '';
    const k = (name, d) => (constants['YEA::SAVE::' + name] === undefined ? d : constants['YEA::SAVE::' + name]);
    const str = (name, d) => String(k(name, d) ?? '');
    const ids = (name) => (Array.isArray(literal(source, name)) ? literal(source, name).map(Number).filter(Number.isFinite) : []);
    const se = /^\s*DELETE_SOUND\s*=\s*RPG::SE\.new\(\s*(?:"([^"]*)"|'([^']*)')\s*(?:,\s*(\d+))?\s*(?:,\s*(\d+))?/m.exec(source);
    const deleteSound = { name: se ? (se[1] ?? se[2] ?? '') : '', volume: se && se[3] ? Number(se[3]) : 100, pitch: se && se[4] ? Number(se[4]) : 100 };
    const later = sources.slice(sources.indexOf(source) + 1);
    const confirm = later.some(s => /def confirm_choice\b/.test(s) && /class Window_Confirm\b/.test(s));
    // The add-on that names the first slot redefines the list's draw_item with Vlue's AUTOSAVE_FILE_NAME.
    let autosaveName = '';
    for (const s of later) {
        if (/class Window_FileList\b[\s\S]*?def draw_item\b[\s\S]*?AUTOSAVE_FILE_NAME/.test(s)) autosaveName = String(constants.AUTOSAVE_FILE_NAME ?? 'Autosave');
    }
    const size = C.fontDefaults(sources, constants).size;
    return {
        maxFiles: String(Number(k('MAX_FILES', 16)) || 16), slotName: str('SLOT_NAME', 'Save %s'), autosaveName,
        saveIcon: String(Number(k('SAVE_ICON', 368)) || 0), emptyIcon: String(Number(k('EMPTY_ICON', 375)) || 0),
        actionLoad: str('ACTION_LOAD', 'Load'), actionSave: str('ACTION_SAVE', 'Save'), actionDelete: str('ACTION_DELETE', 'Delete'),
        deleteSound: JSON.stringify(deleteSound),
        selectHelp: str('SELECT_HELP', ''), loadHelp: str('LOAD_HELP', ''), saveHelp: str('SAVE_HELP', ''), deleteHelp: str('DELETE_HELP', ''),
        emptyText: str('EMPTY_TEXT', ''), playtime: str('PLAYTIME', ''), totalSave: str('TOTAL_SAVE', ''), totalGold: str('TOTAL_GOLD', ''), location: str('LOCATION', ''),
        column1: JSON.stringify(ids('COLUMN1_VARIABLES')), column2: JSON.stringify(ids('COLUMN2_VARIABLES')),
        confirm: String(confirm),
        confirmDelete: str('CONFIRM_DELETE', ''), confirmSave: str('CONFIRM_SAVE', ''), confirmLoad: str('CONFIRM_LOAD', ''),
        rgssFontSize: String(typeof size === 'number' ? size : 24)
    };
}

module.exports = { extract };
