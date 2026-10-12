'use strict';
// Plugin parameters for RR_TheoWindowBackground from the game's Theo::WindowList (commented lines left out).

function extract({ scripts = [] } = {}) {
    const text = scripts.find(s => /module Theo\b[\s\S]*WindowList\s*=\s*\{/.test(s));
    if (!text) return {};
    const body = (/WindowList\s*=\s*\{([\s\S]*?)\}/.exec(text) || [])[1] || '';
    const windows = {};
    for (const line of body.split('\n')) {
        const m = /^\s*(Window_\w+)\s*=>\s*['"]([^'"]+)['"]/.exec(line);
        if (m) windows[m[1]] = m[2];
    }
    return { windows: JSON.stringify(windows) };
}

module.exports = { extract };
