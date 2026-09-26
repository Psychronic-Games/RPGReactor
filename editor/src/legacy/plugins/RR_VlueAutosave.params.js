'use strict';
// Plugin parameters for RR_VlueAutosave from the game's copy of Vlue's Basic Autosave (its top-level constants
// AUTOSAVE_ON_MAP, AUTOSAVE_AFTER_BATTLE, NAME_AUTOSAVE_FILE, AUTOSAVE_FILE_NAME and the $auto_save it starts with).

const text = (s) => String(s && typeof s === 'object' ? s.text || '' : s || '');
// Ruby truth: only false and nil are false.
const truthy = (v, d) => (v === undefined ? d : v !== false && v !== null);

function extract({ scripts = [], constants = {} } = {}) {
    const source = scripts.map(text).find(s => /AUTOSAVE_ON_MAP\s*=/.test(s) && /def post_transfer\b/.test(s)) || '';
    const start = /^\s*\$auto_save\s*=\s*(\w+)/m.exec(source);
    return {
        onMap: String(truthy(constants.AUTOSAVE_ON_MAP, true)),
        afterBattle: String(truthy(constants.AUTOSAVE_AFTER_BATTLE, false)),
        autoSave: String(start ? !['false', 'nil'].includes(start[1]) : true),
        nameFile: String(truthy(constants.NAME_AUTOSAVE_FILE, true)),
        fileName: String(constants.AUTOSAVE_FILE_NAME ?? 'Autosave')
    };
}

module.exports = { extract };
