'use strict';
// Plugin parameters for RR_TheoNotifWindow from the game's copy of the script (module Theo::Notif).

const DEFAULTS = { startFadein: 15, delayTime: 240, endFadeout: 15, colorStart: '0,0,0,180', colorEnd: '0,0,0,50', xPosition: -6 };
const KEYS = { startFadein: 'StartFadein', delayTime: 'DelayTime', endFadeout: 'EndFadeout', xPosition: 'XPosition' };

const text = (s) => String(s && typeof s === 'object' ? s.text || '' : s || '');

function color(source, name, fallback) {
    const m = new RegExp('^\\s*' + name + '\\s*=\\s*Color\\.new\\s*\\(([^)]*)\\)', 'm').exec(source);
    if (!m) return fallback;
    const parts = m[1].split(',').map(s => parseInt(s.trim(), 10));
    if (parts.length < 3 || parts.slice(0, 3).some(n => !Number.isFinite(n))) return fallback;
    return [parts[0], parts[1], parts[2], Number.isFinite(parts[3]) ? parts[3] : 255].join(',');
}

function extract({ scripts = [], constants = {} } = {}) {
    const source = scripts.map(text).find(s => /module\s+Notif\b/.test(s) && /stack_notif|Window_TypingNotif/.test(s)) || '';
    const out = {};
    for (const [param, name] of Object.entries(KEYS)) {
        const m = new RegExp('^\\s*' + name + '\\s*=\\s*(-?\\d+)', 'm').exec(source);
        const c = constants['Theo::Notif::' + name] ?? constants['Notif::' + name];
        out[param] = String(m ? parseInt(m[1], 10) : typeof c === 'number' ? c : DEFAULTS[param]);
    }
    out.colorStart = color(source, 'ColorStart', DEFAULTS.colorStart);
    out.colorEnd = color(source, 'ColorEnd', DEFAULTS.colorEnd);
    return out;
}

module.exports = { extract, DEFAULTS };
