'use strict';
// Plugin parameters for RR_ThrallJobBoard from Thrall's Game_System and Job Board: the job texts
// (Game_System#job_detail's case), the job generator's tables (generate_jobs) and the delivery icons
// (Window_Job_Details#refresh).

const text = (s) => String(s && typeof s === 'object' ? s.text || '' : s || '');

/** The body of `def name` (up to the `def` after it, or the end). */
function method(source, name) {
    const m = new RegExp('^\\s*def ' + name + '\\b[^\\n]*\\n', 'm').exec(source);
    if (!m) return '';
    const rest = source.slice(m.index + m[0].length);
    const next = /^\s*def \w/m.exec(rest);
    return next ? rest.slice(0, next.index) : rest;
}
const numbers = (body, name) => {
    const m = new RegExp('\\b' + name + '\\s*=\\s*\\[([\\d,\\s]*)\\]').exec(body);
    return m ? m[1].split(',').map(s => s.trim()).filter(Boolean).map(Number) : null;
};

/**
 * job_detail's `when` branches as [from, to, text]; a branch that builds its text instead of naming it
 * (the floors' "(x-400).to_s + "F"") is [from, to, null].
 */
function jobDetails(body) {
    const out = [];
    let current = null;
    for (const raw of body.split(/\r?\n/)) {
        const line = raw.replace(/#.*$/, '').trim();
        let m;
        if ((m = /^when\s+(\d+)(?:\s*\.\.\s*(\d+))?$/.exec(line))) {
            current = [Number(m[1]), Number(m[2] || m[1]), null];
            out.push(current);
        } else if (/^else\b/.test(line)) current = null;
        else if (current && (m = /^text\s*=\s*"([^"]*)"$/.exec(line))) current[2] = m[1];
    }
    return out;
}

function extract({ scripts = [] } = {}) {
    const all = scripts.map(text);
    const out = {};
    const system = all.find(s => /def job_detail\(x\)/.test(s));
    if (system) {
        out.jobDetails = JSON.stringify(jobDetails(method(system, 'job_detail')));
        const gen = method(system, 'generate_jobs');
        const floors = numbers(gen, 'max_floors'), levels = numbers(gen, 'dungeon_level'), rewards = numbers(gen, 'icons');
        if (floors) out.maxFloors = floors.join(',');
        if (levels) out.dungeonLevels = levels.join(',');
        if (rewards) out.rewardIcons = rewards.join(',');
    }
    const board = all.find(s => /class Window_Job_Details\b/.test(s));
    if (board) {
        const icons = numbers(board.slice(board.indexOf('class Window_Job_Details')), 'icons');
        if (icons) out.deliveryIcons = icons.join(',');
    }
    return out;
}

module.exports = { extract, jobDetails };
