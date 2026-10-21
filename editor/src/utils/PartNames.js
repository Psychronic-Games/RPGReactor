/**
 * A model part's name as the editor shows it. Some files carry names their exporter damaged: where a letter
 * could not be written it left U+FFFD, which every font draws as a box (a Sketchfab export of a model whose
 * materials were named in Vietnamese: "Mesh_0007.rip_V���t Li���u.004_0"). The stored name is the part's
 * identity and is never changed; what is shown leaves the damaged words out and keeps what still tells two
 * parts apart ("Mesh_0007.rip_004_0").
 */
const RRPartNames = {
    LOST: '�',
    readable(name) {
        const text = String(name ?? '');
        if (!text.includes(RRPartNames.LOST)) return text;
        const kept = [];
        for (const token of text.split('_')) {
            if (!token.includes(RRPartNames.LOST)) { kept.push(token); continue; }
            // What follows the damaged words in their own token: the number an exporter appended after a dot.
            const after = token.slice(token.lastIndexOf(RRPartNames.LOST) + 1), dot = after.indexOf('.');
            if (dot >= 0 && after.length > dot + 1) kept.push(after.slice(dot + 1));
        }
        const shown = kept.join('_').replace(/^_+|_+$/g, '');
        return shown || text.split(RRPartNames.LOST).join('').trim() || text;
    }
};
if (typeof globalThis !== 'undefined') globalThis.RRPartNames = RRPartNames;
if (typeof module !== 'undefined' && module.exports) module.exports = RRPartNames;
