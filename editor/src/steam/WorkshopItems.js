/**
 * Forge designs as Steam Workshop items, on disk: what goes into an item's folder when a design is shared, what is
 * read back from a subscribed item's folder, and the record of which designs this project has published.
 *
 * An item is data, never code: item.json (a design record of a known builder, as Save Design writes it), its
 * picture (preview.png), and for a picture prop the picture it shows (picture.png / .jpg / .webp). Reading an
 * item checks every one of those and refuses anything else, so a subscribed item can't put a file outside the
 * designs folder, run anything, or bring in a builder the editor doesn't have.
 */
(function(root) {
    'use strict';
    const fs = () => require('fs'), path = () => require('path');

    const FORMAT = 'rpg-reactor-forge-design';
    const VERSION = 1;
    /** The builders whose designs can be shared, where Save Design keeps them, and their Workshop tag. */
    const KINDS = {
        character3d: { tag: 'Character', label: 'Character', folder: ['forge', 'character_3d', 'characters'] },
        prop3d: { tag: 'Prop', label: 'Prop', folder: ['forge', 'prop_3d', 'props'] }
    };
    const IMPORT_GROUP = 'Workshop';
    const MAX_ITEM_JSON = 4 * 1024 * 1024;
    // Steam refuses a preview over 1 MB.
    const MAX_PREVIEW = 1024 * 1024;
    const MAX_PICTURE = 8 * 1024 * 1024;
    const PICTURE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp'];
    const PUBLISHED_FILE = ['forge', 'workshop.json'];

    /** A name that can be a file or folder name (as the Forge's own folderName). */
    function cleanName(name) { return String(name || '').trim().replace(/[\\/:*?"<>|\x00-\x1f]+/g, '').replace(/\s+/g, ' ').replace(/^\.+/, '').slice(0, 48); }

    function designsDir(projectPath, kind) { return path().join(projectPath, ...KINDS[kind].folder); }

    /** Every design Save Design has kept in this project: loose ones and one level of groups, each builder's. */
    function listDesigns(projectPath) {
        const io = fs(), p = path(), out = [];
        for (const kind of Object.keys(KINDS)) {
            const base = designsDir(projectPath, kind);
            if (!io.existsSync(base)) continue;
            const scan = group => {
                const at = group ? p.join(base, group) : base;
                for (const entry of io.readdirSync(at, { withFileTypes: true })) {
                    if (!entry.isFile() || !/\.json$/i.test(entry.name)) continue;
                    const name = entry.name.replace(/\.json$/i, ''), png = p.join(at, name + '.png');
                    out.push({ kind, group, name, file: p.join(at, entry.name), picture: io.existsSync(png) ? png : '' });
                }
            };
            scan('');
            for (const entry of io.readdirSync(base, { withFileTypes: true })) if (entry.isDirectory()) scan(entry.name);
        }
        return out.sort((a, b) => a.kind.localeCompare(b.kind) || a.group.localeCompare(b.group) || a.name.localeCompare(b.name));
    }

    /** The key a published design is known by in workshop.json (the project itself is 'project', whatever its title). */
    function designKey(design) { return design.kind === 'project' ? 'project' : [design.kind, design.group || '', design.name].join('/'); }

    function readPublished(projectPath) {
        try {
            const data = JSON.parse(fs().readFileSync(path().join(projectPath, ...PUBLISHED_FILE), 'utf8'));
            return data && typeof data.items === 'object' && data.items ? data : { items: {} };
        } catch (_) { return { items: {} }; }
    }

    /** Note (or forget, with entry null) the Workshop item a design went up as. */
    function writePublished(projectPath, design, entry) {
        const io = fs(), p = path(), file = p.join(projectPath, ...PUBLISHED_FILE);
        const data = readPublished(projectPath);
        if (entry) data.items[designKey(design)] = entry; else delete data.items[designKey(design)];
        io.mkdirSync(p.dirname(file), { recursive: true });
        const atomic = root.RRWriteFileAtomicSync || ((fsm, target, text) => fsm.writeFileSync(target, text));
        atomic(io, file, JSON.stringify(data, null, 2) + '\n');
    }

    /** The project picture a picture prop shows, if it is a plain image file in img/pictures. */
    function propPicture(projectPath, record) {
        const name = record && record.recipe && typeof record.recipe.image === 'string' ? record.recipe.image : '';
        if (!name || /[\\/]|\.\./.test(name)) return '';
        const io = fs(), p = path();
        for (const ext of PICTURE_EXTENSIONS) {
            const file = p.join(projectPath, 'img', 'pictures', name + ext);
            if (io.existsSync(file) && io.statSync(file).size <= MAX_PICTURE) return file;
        }
        return '';
    }

    /**
     * Lay a design out as a Workshop item in a fresh folder under `stageRoot`: the content folder Steam uploads,
     * and the preview beside it (a preview is sent apart from the content). Answers { contentPath, previewPath }.
     */
    function stage(stageRoot, projectPath, design) {
        const io = fs(), p = path();
        const record = JSON.parse(io.readFileSync(design.file, 'utf8'));
        if (!record || record.builder !== design.kind || typeof record.recipe !== 'object') throw new Error('This design could not be read.');
        const folder = p.join(stageRoot, `${design.kind}-${Date.now().toString(36)}`), content = p.join(folder, 'content');
        io.mkdirSync(content, { recursive: true });
        const item = { format: FORMAT, version: VERSION, kind: design.kind, name: design.name, record };
        const picture = design.kind === 'prop3d' ? propPicture(projectPath, record) : '';
        if (picture) {
            const ext = p.extname(picture).toLowerCase();
            io.copyFileSync(picture, p.join(content, 'picture' + ext));
            item.picture = 'picture' + ext;
        }
        io.writeFileSync(p.join(content, 'item.json'), JSON.stringify(item, null, 2) + '\n');
        let previewPath = '';
        if (design.picture && io.statSync(design.picture).size <= MAX_PREVIEW) {
            io.copyFileSync(design.picture, p.join(content, 'preview.png'));
            previewPath = p.join(folder, 'preview.png');
            io.copyFileSync(design.picture, previewPath);
        }
        return { contentPath: content, previewPath, folder };
    }

    /** A plain file directly in `folder` (no link, no folder), at most `max` bytes; else null. */
    function plainFile(folder, name, max) {
        const io = fs(), file = path().join(folder, name);
        let stat;
        try { stat = io.lstatSync(file); } catch (_) { return null; }
        if (!stat.isFile() || stat.isSymbolicLink() || stat.size > max) return null;
        return file;
    }

    /**
     * A subscribed item's folder, read and checked: { kind, name, record, preview, picture } or an Error whose
     * message says (in English, for the caller to translate) why it isn't a design this editor can use.
     */
    function readItem(folder) {
        const file = plainFile(folder, 'item.json', MAX_ITEM_JSON);
        if (!file) return new Error('This Workshop item is not a Forge design.');
        let item;
        try { item = JSON.parse(fs().readFileSync(file, 'utf8')); } catch (_) { return new Error('This Workshop item is not a Forge design.'); }
        if (!item || item.format !== FORMAT) return new Error('This Workshop item is not a Forge design.');
        if (!(item.version >= 1)) return new Error('This Workshop item is not a Forge design.');
        if (item.version > VERSION) return new Error('This design needs a newer RPG Reactor.');
        if (!KINDS[item.kind]) return new Error('This design needs a newer RPG Reactor.');
        const record = item.record;
        if (!record || typeof record !== 'object' || record.builder !== item.kind || !record.recipe || typeof record.recipe !== 'object' || Array.isArray(record.recipe)) {
            return new Error('This Workshop item is not a Forge design.');
        }
        const name = cleanName(item.name) || KINDS[item.kind].label;
        const preview = plainFile(folder, 'preview.png', MAX_PREVIEW) || '';
        let picture = '';
        if (typeof item.picture === 'string' && /^picture\.(png|jpe?g|webp)$/i.test(item.picture)) picture = plainFile(folder, item.picture, MAX_PICTURE) || '';
        return { kind: item.kind, name, record, preview, picture };
    }

    /** A name not yet taken among `taken` (lower-cased): "Name", "Name 2", "Name 3"... */
    function freeName(name, taken) {
        for (let n = 1; ; n++) {
            const candidate = n === 1 ? name : `${name.slice(0, 44)} ${n}`;
            if (!taken.has(candidate.toLowerCase())) return candidate;
        }
    }

    /**
     * Put a checked item into the project as a design of its builder, in the Workshop group, under a name not yet
     * used there (a picture prop's picture goes into img/pictures the same way). Answers { kind, group, name }.
     */
    function importItem(projectPath, item) {
        const io = fs(), p = path();
        const at = p.join(designsDir(projectPath, item.kind), IMPORT_GROUP);
        io.mkdirSync(at, { recursive: true });
        const record = JSON.parse(JSON.stringify(item.record));
        if (item.picture && item.kind === 'prop3d') {
            const folder = p.join(projectPath, 'img', 'pictures'), ext = p.extname(item.picture).toLowerCase();
            io.mkdirSync(folder, { recursive: true });
            const taken = new Set(io.readdirSync(folder).map(f => f.replace(/\.[^.]+$/, '').toLowerCase()));
            const stem = cleanName(typeof record.recipe.image === 'string' ? record.recipe.image : '') || 'Picture';
            const name = freeName(stem, taken);
            io.copyFileSync(item.picture, p.join(folder, name + ext));
            record.recipe.image = name;
        }
        const taken = new Set(io.readdirSync(at).filter(f => /\.json$/i.test(f)).map(f => f.replace(/\.json$/i, '').toLowerCase()));
        const name = freeName(item.name, taken);
        const atomic = root.RRWriteFileAtomicSync || ((fsm, target, data) => fsm.writeFileSync(target, data));
        atomic(io, p.join(at, name + '.json'), JSON.stringify(record, null, 2) + '\n');
        if (item.preview) io.copyFileSync(item.preview, p.join(at, name + '.png'));
        return { kind: item.kind, group: IMPORT_GROUP, name };
    }

    const api = { FORMAT, VERSION, KINDS, IMPORT_GROUP, MAX_PREVIEW, cleanName, designsDir, listDesigns, designKey, readPublished, writePublished, propPicture, stage, readItem, importItem };
    root.RRWorkshopItems = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
