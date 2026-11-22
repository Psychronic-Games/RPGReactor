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
    /**
     * The builders whose designs can be shared: where Save Design keeps them, their Workshop tag (the Type tags set
     * up in Steamworks › Workshop › Tags), the Forge tool that opens them, its menu name, and the ForgeManager property
 * that holds the tool (`getter`; the tool opens a design by `openDesign(group, name)`, or the builders' `_openDesign`).
     */
    const KINDS = {
        character3d: { tag: 'Character', label: 'Character', folder: ['forge', 'character_3d', 'characters'], tool: 'character-3d-builder', menu: 'menu.character3dBuilder', getter: 'character3dBuilder' },
        prop3d: { tag: 'Prop', label: 'Prop', folder: ['forge', 'prop_3d', 'props'], tool: 'prop-builder', menu: 'menu.propBuilder', getter: 'propBuilder' },
        animation: { tag: 'Animation', label: 'Animation', folder: ['forge', 'animation_generator', 'designs'], tool: 'animation-generator', menu: 'menu.animationGenerator', getter: 'animationGenerator' },
        effekseer: { tag: 'Effect', label: 'Effect', folder: ['forge', 'effekseer_generator', 'designs'], tool: 'effekseer-generator', menu: 'menu.effekseerGenerator', getter: 'effekseerGenerator' },
        sound: { tag: 'Sound', label: 'Sound', folder: ['forge', 'sound_effect_generator', 'designs'], tool: 'sound-effect-generator', menu: 'menu.soundEffectGenerator', getter: 'soundEffectGenerator' }
    };
    const IMPORT_GROUP = 'Workshop';
    const MAX_ITEM_JSON = 4 * 1024 * 1024;
    // Steam refuses a preview over 1 MB.
    const MAX_PREVIEW = 1024 * 1024;
    const MAX_PICTURE = 8 * 1024 * 1024;
    const PICTURE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp'];
    const PUBLISHED_FILE = ['forge', 'workshop.json'];
    // The project files a design's recipe names, carried in the item's textures/ folder: an animation's textures
    // (forge/animation_generator/textures) and an effect's custom textures (effects/Texture). Pictures (and, for an
    // animation, short videos) only, each a plain file of at most 8 MB, at most 16 of them. `slots` finds every place
    // the recipe names one, as [object, key] pairs; `list` is the recipe's own summary of them.
    const MAX_TEXTURE = 8 * 1024 * 1024;
    const MAX_TEXTURES = 16;
    const TEXTURE_FOLDER = ['forge', 'animation_generator', 'textures'];
    const CARRIED = {
        animation: {
            folder: TEXTURE_FOLDER, list: 'textures', copyName: (stem, n, ext) => `${stem} ${n}${ext}`,
            extensions: ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.mp4', '.webm'],
            slots(recipe) {
                const slots = [];
                const visit = params => { if (params && typeof params === 'object' && typeof params.texture === 'string' && params.texture) slots.push([params, 'texture']); };
                for (const layer of Array.isArray(recipe.layers) ? recipe.layers : []) {
                    for (const kf of Array.isArray(layer && layer.keyframes) ? layer.keyframes : []) visit(kf && kf.params);
                }
                if (recipe.previewSingle) visit(recipe.previewSingle.params);
                return slots;
            }
        },
        effekseer: {
            folder: ['effects', 'Texture'], list: 'textureFiles', copyName: (stem, n, ext) => `${stem}-${n}${ext}`,
            extensions: ['.png', '.jpg', '.jpeg'],
            // The Effekseer generator's own rule (EffekseerGenerator.designTextureName): no spaces.
            rule: /^[A-Za-z0-9_-][A-Za-z0-9_.-]*\.(?:png|jpe?g)$/i,
            // Custom Texture (customTex) and the Interface's planet textures (p1tex, p2tex...).
            slots(recipe) {
                const slots = [];
                for (const layer of Array.isArray(recipe.layers) ? recipe.layers : []) {
                    for (const kf of Array.isArray(layer && layer.keyframes) ? layer.keyframes : []) {
                        const values = kf && kf.values;
                        if (!values || typeof values !== 'object') continue;
                        for (const key of Object.keys(values)) if ((key === 'customTex' || /^p\d+tex$/.test(key)) && typeof values[key] === 'string' && values[key]) slots.push([values, key]);
                    }
                }
                return slots;
            }
        }
    };
    /** A file name as a recipe may hold one: plain (the generators' own rule), no leading dot, of a carried kind. */
    function textureName(name, kind = 'animation') {
        const spec = CARRIED[kind];
        if (!spec || typeof name !== 'string' || !name || name.length > 128 || name.trim() !== name) return '';
        if (/[\\/:*?"<>|\u0000-\u001f]/.test(name) || name.startsWith('.')) return '';
        if (spec.rule && (!spec.rule.test(name) || name.includes('..') || name.length > 120)) return '';
        return spec.extensions.includes(path().extname(name).toLowerCase()) ? name : '';
    }

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
        const spec = CARRIED[design.kind];
        if (spec) {
            const names = [...new Set(spec.slots(record.recipe).map(([o, k]) => textureName(o[k], design.kind)).filter(Boolean))];
            const carried = [];
            for (const name of names.slice(0, MAX_TEXTURES)) {
                const file = p.join(projectPath, ...spec.folder, name);
                if (!io.existsSync(file) || !io.statSync(file).isFile() || io.statSync(file).size > MAX_TEXTURE) continue;
                io.mkdirSync(p.join(content, 'textures'), { recursive: true });
                io.copyFileSync(file, p.join(content, 'textures', name));
                carried.push(name);
            }
            if (carried.length) item.textures = carried;
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
        // The files its recipe names (CARRIED): only names a recipe may hold, each a plain file in the item's textures/.
        const textures = [];
        if (CARRIED[item.kind] && Array.isArray(item.textures)) {
            for (const raw of item.textures.slice(0, MAX_TEXTURES)) {
                const name = textureName(raw, item.kind);
                const file = name && plainFile(path().join(folder, 'textures'), name, MAX_TEXTURE);
                if (file && !textures.some(t => t.name === name)) textures.push({ name, file });
            }
        }
        return { kind: item.kind, name, record, preview, picture, textures };
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
        const spec = CARRIED[item.kind];
        if (spec && item.textures && item.textures.length) {
            // Into the project's folder for them: a file of that name with the same bytes is the same texture; one
            // that differs is never overwritten: the next free name ("Name 2.png") holding the same bytes, or a new
            // one, and the recipe follows it.
            const folder = p.join(projectPath, ...spec.folder);
            io.mkdirSync(folder, { recursive: true });
            const renamed = new Map();
            for (const texture of item.textures) {
                const incoming = io.readFileSync(texture.file);
                const ext = p.extname(texture.name), stem = texture.name.slice(0, -ext.length);
                let target = texture.name;
                for (let n = 2; ; n++) {
                    const at = p.join(folder, target);
                    if (!io.existsSync(at)) { io.writeFileSync(at, incoming); break; }
                    if (io.statSync(at).isFile() && io.readFileSync(at).equals(incoming)) break;
                    target = spec.copyName(stem.slice(0, 100), n, ext);
                }
                if (target !== texture.name) renamed.set(texture.name, target);
            }
            for (const [obj, key] of spec.slots(record.recipe)) if (renamed.has(obj[key])) obj[key] = renamed.get(obj[key]);
            if (Array.isArray(record.recipe[spec.list])) record.recipe[spec.list] = record.recipe[spec.list].map(n => renamed.get(n) || n);
        }
        const taken = new Set(io.readdirSync(at).filter(f => /\.json$/i.test(f)).map(f => f.replace(/\.json$/i, '').toLowerCase()));
        const name = freeName(item.name, taken);
        const atomic = root.RRWriteFileAtomicSync || ((fsm, target, data) => fsm.writeFileSync(target, data));
        atomic(io, p.join(at, name + '.json'), JSON.stringify(record, null, 2) + '\n');
        if (item.preview) io.copyFileSync(item.preview, p.join(at, name + '.png'));
        return { kind: item.kind, group: IMPORT_GROUP, name };
    }

    const api = { FORMAT, VERSION, KINDS, IMPORT_GROUP, MAX_PREVIEW, TEXTURE_FOLDER, cleanName, textureName, designsDir, listDesigns, designKey, readPublished, writePublished, propPicture, stage, readItem, importItem };
    root.RRWorkshopItems = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
