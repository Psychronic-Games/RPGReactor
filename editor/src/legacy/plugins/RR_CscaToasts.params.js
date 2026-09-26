'use strict';
// Plugin parameters for RR_CscaToasts from the game's CSCA Toast Manager (CSCA::TOASTS), Quest System
// (QUEST_COMPLETE_SOUND, SHOW_COMPLETE_TOAST, SYSTEM_TEXT_COLOR) and Quest Toast Extension (the other sounds,
// SHOW_* and COLOR_*). With both quest scripts, a completion is reserved by each.

const text = (s) => String(s && typeof s === 'object' ? s.text || '' : s || '');

function extract({ scripts = [], constants = {} } = {}) {
    const k = (name, d) => (constants['CSCA::QUESTS::' + name] === undefined ? d : constants['CSCA::QUESTS::' + name]);
    const t = (name, d) => (constants['CSCA::TOASTS::' + name] === undefined ? d : constants['CSCA::TOASTS::' + name]);
    const sources = scripts.map(text);
    const extension = sources.some(s => /csca_qsys_extended_refresh/.test(s));
    const system = sources.some(s => /class CSCA_Quest\b/.test(s) && /reserve_toast\(\[:quest_complete/.test(s));
    const quests = {};
    if (extension) {
        quests.started = { show: k('SHOW_START_TOAST', true) === true, me: k('QUEST_START_SOUND', null), color: k('COLOR_STARTED', 0) };
        quests.advanced = { show: k('SHOW_ADVANCE_TOAST', true) === true, me: k('QUEST_ADVANCE_SOUND', null), color: k('COLOR_ADVANCED', 0) };
        quests.failed = { show: k('SHOW_FAIL_TOAST', true) === true, me: k('QUEST_FAIL_SOUND', null), color: k('COLOR_FAILED', 0) };
    }
    if (system || extension) {
        quests.complete = { show: k('SHOW_COMPLETE_TOAST', true) === true, se: system ? k('QUEST_COMPLETE_SOUND', null) : null, color: extension ? k('COLOR_COMPLETED', 0) : k('SYSTEM_TEXT_COLOR', 0) };
        quests.completeTwice = system && extension;
    }
    return { showCount: String(Number(t('SHOW_COUNT', 160))), fadeSpeed: String(Number(t('FADE_SPEED', 16))), quests: JSON.stringify(quests) };
}

module.exports = { extract };
