'use strict';
// Plugin parameters for RR_PmmStealth from the settings at the top of the game's copy of the Trace Stealth
// System (module Trace). A setting the game's copy does not state keeps the script's own default.

const text = (s) => String(s && typeof s === 'object' ? s.text || '' : s || '');

// param name → [Trace constant, the script's default]
const SETTINGS = {
    alertSwitch: ['ALERT_SWITCH', 1], alertCountdown: ['ALERT_COUNTDOWN', 1800], traceRange: ['TRACE_RANGE_DEFAULT', 5],
    hideOpacity: ['HIDE_OPACITY', 50], hideSwitch: ['HIDE_SWITCH', 2], cautionSelfSwitch: ['CAUTION_SELF_SWITCH', 'C'],
    sprintNoise: ['DEFAULT_SPRINT_NOISE', 6], allowDisabling: ['ALLOW_SELF_SWITCH_DISABLING', true], disablingSelfSwitch: ['DISABLING_SELF_SWITCH', 'D'],
    showAlert: ['SHOW_ALERT', true], playAlert: ['PLAY_ALERT', true], alertMe: ['ALERT_ME', ''], alertVolume: ['ALERT_VOLUME', 100], alertPitch: ['ALERT_PITCH', 100],
    showQuit: ['SHOW_QUIT', true], showCaution: ['SHOW_CAUTION', true], playCaution: ['PLAY_CAUTION', true], cautionMe: ['CAUTION_ME', ''],
    cautionVolume: ['CAUTION_VOLUME', 100], cautionPitch: ['CAUTION_PITCH', 100]
};

function extract({ scripts = [], constants = {} } = {}) {
    const source = scripts.map(text).find(s => /module\s+Trace\b/.test(s) && /def\s+tss_trace\b/.test(s)) || '';
    const out = {};
    for (const [param, [name, fallback]] of Object.entries(SETTINGS)) {
        let value = constants['Trace::' + name];
        if (value === undefined) {
            const m = new RegExp('^\\s*' + name + '\\s*=\\s*(-?\\d+|true|false|"[^"]*"|\'[^\']*\')', 'm').exec(source);
            if (m) value = /^["']/.test(m[1]) ? m[1].slice(1, -1) : m[1] === 'true' ? true : m[1] === 'false' ? false : Number(m[1]);
        }
        out[param] = String(value === undefined ? fallback : value);
    }
    return out;
}

module.exports = { extract };
