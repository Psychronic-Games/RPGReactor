/**
 * Designs kept in the Forge (Save Design): a builder's settings and its picture, no model, in groups of the
 * author's own. They live under the project's forge/ folder (a group is a folder there), apart from 3d/, where
 * every folder is a model the 3D Models page lists. `base` is the builder's own designs folder.
 */
(function(root) {
    'use strict';
    const fs = () => require('fs'), path = () => require('path');
    const NEW = '\u0000new';

    /** A name that can be a file or folder name. */
    function folderName(name) { return String(name || '').trim().replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, ' ').slice(0, 48); }

    function dir(base, group = '') { return base && group ? path().join(base, group) : base; }

    /** The groups made so far, by name. */
    function groups(base) {
        if (!base || !fs().existsSync(base)) return [];
        return fs().readdirSync(base, { withFileTypes: true }).filter(e => e.isDirectory()).map(e => e.name).sort((a, b) => a.localeCompare(b));
    }

    function names(base, group = '') {
        const at = dir(base, group);
        if (!at || !fs().existsSync(at)) return [];
        return fs().readdirSync(at).filter(f => /\.json$/i.test(f)).map(f => f.replace(/\.json$/i, '')).sort((a, b) => a.localeCompare(b));
    }

    /** The toolbar's Group choice: no group, every group made (and the chosen one, not yet saved into), and a new one. */
    function renderGroups(select, base, current, t) {
        if (!select) return;
        const list = groups(base);
        if (current && !list.includes(current)) list.push(current);
        select.innerHTML = `<option value="">${rrEscapeHtml(t('No Group'))}</option>`
            + list.map(g => `<option value="${rrEscapeHtml(g)}">${rrEscapeHtml(g)}</option>`).join('')
            + `<option value="${NEW}">${rrEscapeHtml(t('New Group'))}</option>`;
        select.value = current || '';
    }

    /** The group a choice in that select means: a new one is asked for by name. */
    async function chooseGroup(value, current, t) {
        if (value !== NEW) return value || '';
        const name = folderName(await RRDialog.prompt(t('Name the new group:'), { title: t('New Group'), value: '' }));
        return name || current || '';
    }

    /**
     * Keep `record` under `name` in `group`, its picture beside it. `opened` is the design this one was opened
     * from ({ group, name }): saved under its own name, it is no question to replace it, and saved into another
     * group it moves rather than copies. Answers false when the author keeps the one already there.
     */
    async function save(base, group, name, record, picture, opened, t) {
        const io = fs(), p = path(), at = dir(base, group), file = p.join(at, name + '.json');
        const same = opened && opened.group === group && opened.name === name;
        if (io.existsSync(file) && !same && !await RRDialog.confirm(t('Replace the design {name}?', { name }), { title: t('Save Design'), ok: t('Replace'), danger: true })) return false;
        const atomic = root.RRWriteFileAtomicSync || ((fsm, target, data) => fsm.writeFileSync(target, data));
        io.mkdirSync(at, { recursive: true });
        atomic(io, file, JSON.stringify(record, null, 2) + '\n');
        if (picture) atomic(io, p.join(at, name + '.png'), picture);
        if (opened && opened.name === name && opened.group !== group) {
            for (const ext of ['.json', '.png']) io.rmSync(p.join(dir(base, opened.group), name + ext), { force: true });
        }
        return true;
    }

    function read(base, group, name) {
        return JSON.parse(fs().readFileSync(path().join(dir(base, group), name + '.json'), 'utf8'));
    }

    async function remove(base, group, name, t) {
        if (!await RRDialog.confirm(t('Delete the design {name}?', { name }), { title: t('Save Design'), ok: t('Delete'), danger: true })) return false;
        for (const ext of ['.json', '.png']) fs().rmSync(path().join(dir(base, group), name + ext), { force: true });
        return true;
    }

    /** A file's picture as a data URL, or '' when there is none. */
    function picture(file) { return file && fs().existsSync(file) ? 'data:image/png;base64,' + fs().readFileSync(file).toString('base64') : ''; }

    /** One picture to pick in the gallery; a design also gets its delete button. */
    function card(name, src, kind, group, t) {
        return `<div class="rr-c3d-saved-card"><button class="rr-c3d-saved" data-name="${rrEscapeHtml(name)}" data-kind="${kind}" data-group="${rrEscapeHtml(group || '')}">${src ? `<img src="${src}" alt="">` : '<span class="rr-c3d-nothumb">?</span>'}<span>${rrEscapeHtml(name)}</span></button>`
            + (kind === 'design' ? `<button class="rr-c3d-saved-delete" data-delete="${rrEscapeHtml(name)}" data-group="${rrEscapeHtml(group || '')}" title="${rrEscapeHtml(t('Delete'))}">✕</button>` : '') + '</div>';
    }

    /**
     * The gallery's sections: the designs with no group, each group's, then `models` (cards of what was
     * exported). `text` gives the builder's own wording: { noDesigns, noModels }.
     */
    function gallery(base, models, text, t) {
        const designs = group => names(base, group).map(name => card(name, picture(path().join(dir(base, group), name + '.png')), 'design', group, t)).join('');
        const loose = designs(''), byGroup = groups(base).map(group => ({ group, cards: designs(group) }));
        const section = (title, cards, empty) => `<div class="rr-c3d-gallery-sub">${rrEscapeHtml(title)}</div><div class="rr-c3d-gallery-grid">${cards || `<p class="rr-c3d-note">${empty}</p>`}</div>`;
        const none = !loose && !byGroup.some(g => g.cards);
        return (none ? section(t('Designs'), '', text.noDesigns)
            : (loose ? section(t('Designs'), loose) : '') + byGroup.filter(g => g.cards).map(g => section(g.group, g.cards)).join(''))
            + section(t('Exported Models'), models, text.noModels);
    }

    const api = { NEW, folderName, dir, groups, names, renderGroups, chooseGroup, save, read, remove, picture, card, gallery };
    root.RRForgeDesigns = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
