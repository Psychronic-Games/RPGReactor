/**
 * RPG Maker 2000/2003 RTPs without installing them: which one a game uses,
 * downloading RPG Maker's official free RTP and unpacking the installer's
 * contents into a folder of the user's own, and a view of an official RTP that
 * also answers to the names Don Miguel's English translation gave its files.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const NAMES = require('./RtpNames.js');
const NSIS = require('./NsisArchive.js');
const RAR = require('./Rar2.js');

/** RPG Maker's official free RTPs (https://www.rpgmakerweb.com/run-time-package). */
const SOURCES = {
    2000: { url: 'https://assets.rpgmakerweb.com/rpg2000_rtp_installer.exe', name: 'RPG Maker 2000 RTP' },
    2003: { url: 'https://assets.rpgmakerweb.com/rpg2003_rtp_installer.zip', name: 'RPG Maker 2003 RTP' }
};

const yearOf = (engine) => (/2003/.test(String(engine || '')) ? 2003 : 2000);

/**
 * Where a downloaded RTP is kept: EasyRPG's own RTP folder on Linux (so its
 * player finds it too), the user's application data elsewhere.
 */
function downloadFolder(engine, env = process.env, platform = process.platform) {
    const year = yearOf(engine);
    const home = env.HOME || env.USERPROFILE || os.homedir();
    if (platform === 'win32') return path.join(env.APPDATA || path.join(home, 'AppData', 'Roaming'), 'RPG Reactor', 'RTP', String(year));
    if (platform === 'darwin') return path.join(home, 'Library', 'Application Support', 'RPG Reactor', 'RTP', String(year));
    return path.join(env.XDG_DATA_HOME || path.join(home, '.local', 'share'), 'rtp', String(year));
}

/** The RTP files a 2000/2003 database names that the game does not ship, by RTP folder. */
function referencedNames(db, tree, has) {
    const out = {};
    const add = (folder, name) => {
        if (!name || typeof name !== 'string') return;
        name = name.replace(/\.[^.]{3}$/, '');
        if (/^\(off\)$/i.test(name) || (has && has(folder, name))) return;
        (out[folder] = out[folder] || new Set()).add(name);
    };
    const sys = db.system || {};
    for (const c of db.chipsets || []) if (c) add('ChipSet', c.chipset_name);
    for (const a of db.actors || []) if (a) { add('CharSet', a.character_name); add('FaceSet', a.face_name); }
    for (const e of db.enemies || []) if (e) add('Monster', e.battler_name);
    for (const a of db.animations || []) if (a) add('Battle', a.animation_name);
    for (const t of db.terrains || []) if (t) add('Backdrop', t.background_name);
    add('System', sys.system_name); add('Title', sys.title_name); add('GameOver', sys.gameover_name);
    for (const k of Object.keys(sys)) {
        const v = sys[k];
        if (v && typeof v === 'object' && typeof v.name === 'string') add(/_se$/.test(k) ? 'Sound' : 'Music', v.name);
    }
    for (const node of (tree && tree.maps) || []) if (node && node.music && node.music_type === 2) add('Music', node.music.name);
    for (const k of Object.keys(out)) out[k] = Array.from(out[k]);
    return out;
}

/**
 * Which RTP a game's names belong to: 'official' (RPG Maker's own English
 * names), 'donMiguel' (his translation, which the official RTP covers under
 * other names) or 'donMiguelAddon' (it also uses files only his Addon has),
 * else 'unknown' (another translation, or the Japanese RTP). `addon` lists
 * the Addon files it names; `unknown` the names no table knows.
 */
function classify(engine, referenced) {
    const year = yearOf(engine);
    const table = NAMES[year] || {};
    const lower = (list) => new Set((list || []).map(n => n.toLowerCase()));
    let official = 0, renamed = 0;
    const addon = [], unknown = [];
    for (const [folder, names] of Object.entries(referenced)) {
        const off = lower((table.official || {})[folder]);
        const dmRenamed = new Set(Object.keys(((table.donMiguel || {}).renamed || {})[folder] || {}).map(n => n.toLowerCase()));
        const dmAddon = lower(((table.donMiguel || {}).addon || {})[folder]);
        for (const name of names) {
            const n = name.toLowerCase();
            if (dmRenamed.has(n)) renamed++;
            else if (dmAddon.has(n)) addon.push(`${folder}/${name}`);
            else if (off.has(n)) official++;
            else unknown.push(`${folder}/${name}`);
        }
    }
    const variant = addon.length ? 'donMiguelAddon' : renamed ? 'donMiguel' : (official || !unknown.length) ? 'official' : 'unknown';
    return { year, variant, addon, unknown, official, renamed };
}

/** Whether a folder holds RPG Maker's official English RTP of that year (its own chipset names). */
function isOfficial(dir, engine) {
    const year = yearOf(engine);
    const chips = ((NAMES[year] || {}).official || {}).ChipSet || [];
    let names;
    try { names = fs.readdirSync(path.join(dir, 'ChipSet')).map(n => n.replace(/\.[^.]+$/, '').toLowerCase()); } catch (_) { return false; }
    return chips.length > 0 && chips.every(c => names.includes(c.toLowerCase()));
}

/**
 * Names another RTP gives the same file (Don Miguel's for an official file and
 * the reverse), by folder: { folder: { lowercased name: [other names] } }.
 */
function aliasesOf(engine) {
    const renamed = ((NAMES[yearOf(engine)] || {}).donMiguel || {}).renamed || {};
    const out = {};
    for (const [folder, map] of Object.entries(renamed)) {
        const f = out[folder] = out[folder] || {};
        for (const [theirs, ours] of Object.entries(map)) {
            (f[theirs.toLowerCase()] = f[theirs.toLowerCase()] || []).push(ours);
            (f[ours.toLowerCase()] = f[ours.toLowerCase()] || []).push(theirs);
        }
    }
    return out;
}

/** The file stems a folder holds, lowercased, by RTP folder. */
function stems(dir) {
    const out = {};
    let folders = [];
    try { folders = fs.readdirSync(dir, { withFileTypes: true }).filter(e => e.isDirectory()).map(e => e.name); } catch (_) { return out; }
    for (const folder of folders) {
        try { out[folder.toLowerCase()] = { name: folder, files: fs.readdirSync(path.join(dir, folder)) }; } catch (_) { /* unreadable */ }
    }
    return out;
}

/** How many of the names a game uses an RTP folder answers to, under its own names or another RTP's. */
function coverage(dir, engine, referenced) {
    const have = stems(dir), alias = aliasesOf(engine);
    let hits = 0;
    for (const [folder, names] of Object.entries(referenced || {})) {
        const files = new Set(((have[folder.toLowerCase()] || {}).files || []).map(f => f.replace(/\.[^.]+$/, '').toLowerCase()));
        for (const name of names) {
            const n = name.toLowerCase();
            if (files.has(n) || ((alias[folder] || {})[n] || []).some(a => files.has(a.toLowerCase()))) hits++;
        }
    }
    return hits;
}

/**
 * An RTP that answers to every name another RTP gives its files: a temporary
 * copy holding each file also under the other names (an official RTP under
 * Don Miguel's, his under the official ones). Returns the folder to import
 * from and a cleanup; the RTP itself when it has nothing to add.
 */
function translatedView(rtp, engine) {
    const alias = aliasesOf(engine);
    const have = stems(rtp);
    const copies = [];
    for (const [folder, names] of Object.entries(alias)) {
        const entry = have[folder.toLowerCase()];
        if (!entry) continue;
        const byStem = new Map(entry.files.map(f => [f.replace(/\.[^.]+$/, '').toLowerCase(), f]));
        for (const [name, others] of Object.entries(names)) {
            if (byStem.has(name)) continue;
            const source = others.map(o => byStem.get(o.toLowerCase())).find(Boolean);
            if (source) copies.push([entry.name, source, reverseName(engine, folder, name)]);
        }
    }
    if (!copies.length) return { folder: rtp, cleanup() {} };
    const view = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-rtp-'));
    fs.cpSync(rtp, view, { recursive: true });
    for (const [folder, source, name] of copies) {
        const target = path.join(view, folder, name + path.extname(source));
        if (!fs.existsSync(target)) fs.copyFileSync(path.join(view, folder, source), target);
    }
    return { folder: view, cleanup() { fs.rmSync(view, { recursive: true, force: true }); } };
}

/** A name as its RTP spells it (the table's case), from its lowercased form. */
function reverseName(engine, folder, lower) {
    const table = NAMES[yearOf(engine)] || {};
    const renamed = ((table.donMiguel || {}).renamed || {})[folder] || {};
    for (const [theirs, ours] of Object.entries(renamed)) {
        if (theirs.toLowerCase() === lower) return theirs;
        if (ours.toLowerCase() === lower) return ours;
    }
    return lower;
}

// ---- archives: what an RTP comes in -------------------------------------------

/** A zip's files ({ path, read() }), stored or deflated. */
function zipFiles(buf) {
    let end = -1;
    for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) if (buf.readUInt32LE(i) === 0x06054b50) { end = i; break; }
    if (end < 0) throw new Error('not a zip archive');
    let at = buf.readUInt32LE(end + 16);
    const count = buf.readUInt16LE(end + 10);
    const files = [];
    for (let n = 0; n < count; n++) {
        if (buf.readUInt32LE(at) !== 0x02014b50) throw new Error('zip: bad central directory');
        const flags = buf.readUInt16LE(at + 8), method = buf.readUInt16LE(at + 10), size = buf.readUInt32LE(at + 20);
        const nameLen = buf.readUInt16LE(at + 28), extraLen = buf.readUInt16LE(at + 30), commentLen = buf.readUInt16LE(at + 32);
        const local = buf.readUInt32LE(at + 42);
        const name = buf.toString((flags & 0x800) ? 'utf8' : 'latin1', at + 46, at + 46 + nameLen).replace(/\\/g, '/');
        at += 46 + nameLen + extraLen + commentLen;
        if (name.endsWith('/')) continue;
        if (flags & 1) throw new Error(`zip: ${name} is encrypted`);
        files.push({ path: name, read() {
            const dataAt = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
            const data = buf.subarray(dataAt, dataAt + size);
            if (method === 0) return data;
            if (method === 8) return zlib.inflateRawSync(data);
            throw new Error(`zip: ${name} uses compression method ${method}`);
        } });
    }
    return files;
}

/** The installer inside RPG Maker's 2003 zip. */
function installerFromZip(buf) {
    const exe = zipFiles(buf).find(f => /\.exe$/i.test(f.path));
    if (!exe) throw new Error('zip: no installer inside');
    return exe.read();
}

/** What kind of archive a file is: 'zip', 'nsis', 'rar', or null. */
function archiveKind(buf) {
    if (buf.length >= 4 && buf.readUInt32LE(0) === 0x04034b50) return 'zip';
    if (NSIS.findHeader(buf) >= 0) return 'nsis';
    if (RAR.findMarker(buf) >= 0) return 'rar';
    return null;
}

/**
 * The files of an RTP installer or archive ({ path, read() }): RPG Maker's
 * NSIS installers, a self-extracting or plain RAR (RAR 2.0's compression, as
 * Don Miguel's RTPE.exe), a zip, and a zip or RAR around an installer.
 */
function archiveFiles(buf, depth = 0) {
    buf = Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
    const kind = archiveKind(buf);
    let files;
    if (kind === 'zip') files = zipFiles(buf);
    else if (kind === 'nsis') files = NSIS.open(buf).files;
    else if (kind === 'rar') files = RAR.readAll(buf).map(f => ({ path: f.path, read: () => f.bytes }));
    else throw new Error('not an RTP installer or archive this can read (an RPG Maker installer, .zip or .rar)');
    // An archive around an installer (RPG Maker's 2003 zip): read the installer instead.
    if (depth === 0 && !locateRoot(files)) {
        const inner = files.find(f => /\.(exe|zip|rar)$/i.test(f.path));
        if (inner) return archiveFiles(Buffer.from(inner.read()), depth + 1);
    }
    return files;
}

/** The folder inside a list of paths that holds CharSet and ChipSet ('' for the top), or null. */
function locateRoot(files) {
    const roots = new Map();
    for (const f of files) {
        const m = /^(.*?)(?:^|\/)(charset|chipset)\/[^/]+$/i.exec(f.path);
        if (!m) continue;
        const r = roots.get(m[1]) || new Set();
        r.add(m[2].toLowerCase());
        roots.set(m[1], r);
    }
    for (const [root, kinds] of roots) if (kinds.size === 2) return { prefix: root ? root + '/' : '' };
    return null;
}

/** Which engine an RTP's files belong to: 2003 has battle charsets. */
function yearOfFiles(paths) { return paths.some(p => /(^|\/)battlecharset\//i.test(p)) ? 2003 : 2000; }

/**
 * The folder an RTP is unpacked into: the official RTP into the download
 * folder, another (Don Miguel's) beside it under its own name.
 */
function unpackFolder(year, chipsets, env, platform) {
    const base = downloadFolder(year === 2003 ? 'RPG Maker 2003' : 'RPG Maker 2000', env, platform);
    const official = ((NAMES[year] || {}).official || {}).ChipSet || [];
    const lower = new Set(chipsets.map(c => c.toLowerCase()));
    if (official.length && official.every(c => lower.has(c.toLowerCase()))) return base;
    const dm = Object.keys((((NAMES[year] || {}).donMiguel || {}).renamed || {}).ChipSet || {});
    if (dm.length && dm.every(c => lower.has(c.toLowerCase()))) return base + '-donmiguel';
    return base + '-other';
}

/** The file an unpacked RTP folder carries: unpack replaces only folders that have it. */
const MARKER = 'rpg-reactor-rtp.json';

/**
 * Where an unpack may write: `folder` when it is absent, empty or an earlier unpack's (its marker);
 * otherwise the first free `folder-2`, `folder-3`…, so an RTP the user keeps there is never replaced.
 */
function freeFolder(folder) {
    for (let n = 1; ; n++) {
        const candidate = n === 1 ? folder : `${folder}-${n}`;
        let entries;
        try { entries = fs.readdirSync(candidate); } catch (_) { return candidate; }
        if (!entries.length || entries.includes(MARKER)) return candidate;
    }
}

/**
 * Unpacks an RTP installer or archive into `folder` (or, when it is omitted,
 * the user's RTP folder for what it holds): the RTP's own folders, and any
 * RM2000/RMG2000 font it carries beside them. Returns { folder, files, year }.
 */
function unpack(buf, folder, onProgress) {
    // An entry naming a parent, an absolute path or a drive (../../x, /etc/x, C:/x) is never written.
    const all = archiveFiles(buf).filter(f => String(f.path).split('/').every(p => p && p !== '.' && p !== '..' && !/[\\:]/.test(p)));
    const root = locateRoot(all);
    if (!root) throw new Error('no RTP inside (no CharSet and ChipSet folders)');
    const files = all.filter(f => f.path.startsWith(root.prefix) && f.path.slice(root.prefix.length).includes('/') && !/\.(exe|dll|ico|txt|log)$/i.test(f.path))
        .map(f => ({ rel: f.path.slice(root.prefix.length), read: f.read }));
    const fonts = all.filter(f => /(^|\/)rmg?2000\.fon$/i.test(f.path)).map(f => ({ rel: f.path.split('/').pop(), read: f.read }));
    const rels = files.map(f => f.rel);
    const year = yearOfFiles(rels);
    if (!folder) folder = unpackFolder(year, rels.filter(r => /^chipset\//i.test(r)).map(r => r.split('/')[1].replace(/\.[^.]+$/, '')));
    folder = freeFolder(folder);
    const staging = folder + '.part';
    fs.rmSync(staging, { recursive: true, force: true });
    const out = files.concat(fonts);
    out.forEach((f, i) => {
        const target = path.join(staging, ...f.rel.split('/'));
        if (path.relative(staging, target).split(path.sep)[0] === '..') throw new Error(`${f.rel} lies outside the RTP folder`);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, f.read());
        if (onProgress) onProgress((i + 1) / out.length, f.rel);
    });
    fs.rmSync(folder, { recursive: true, force: true });
    fs.mkdirSync(path.dirname(folder), { recursive: true });
    fs.renameSync(staging, folder);
    fs.writeFileSync(path.join(folder, MARKER), JSON.stringify({ unpacked: new Date().toISOString() }, null, 2));
    return { folder, files: files.length, year };
}

/**
 * An RTP from whatever the user points at: an RTP folder, a folder holding one
 * a few levels down (Don Miguel's Data/RTP, an install folder), a folder
 * holding an installer or archive, or the installer or archive itself (.exe,
 * .zip, .rar), which is unpacked. Resolves to the RTP folder.
 */
async function rtpFrom(target, progress = () => {}) {
    const stat = fs.statSync(target);
    if (stat.isFile()) {
        progress(0, 'Unpacking the RTP…');
        return unpack(fs.readFileSync(target), undefined, (f) => progress(f, 'Unpacking the RTP…')).folder;
    }
    const found = findRtpFolder(target, 3);
    if (found) return found;
    // A folder with an installer or archive in it (a download folder, a game's extras).
    for (const entry of fs.readdirSync(target)) {
        if (!/\.(exe|zip|rar)$/i.test(entry)) continue;
        const file = path.join(target, entry);
        try {
            const buf = fs.readFileSync(file);
            if (!archiveKind(buf)) continue;
            progress(0, 'Unpacking the RTP…');
            return unpack(buf, undefined, (f) => progress(f, 'Unpacking the RTP…')).folder;
        } catch (_) { /* not an RTP: try the next */ }
    }
    throw new Error('no CharSet and ChipSet folders, and no RTP installer or archive');
}

/**
 * A folder holding CharSet and ChipSet: `dir` itself or one up to `depth`
 * levels inside, nearest first and a folder named RTP before others at the
 * same depth. A game's own folder (RPG_RT.ldb beside them) is not an RTP.
 */
function findRtpFolder(dir, depth) {
    let level = [dir];
    for (let d = 0; d <= depth && level.length; d++) {
        const next = [], hits = [];
        for (const folder of level) {
            let entries;
            try { entries = fs.readdirSync(folder, { withFileTypes: true }); } catch (_) { continue; }
            const subs = entries.filter(e => e.isDirectory()).map(e => e.name);
            const lower = subs.map(n => n.toLowerCase());
            const isGame = entries.some(e => e.isFile() && /^rpg_rt\.ldb$/i.test(e.name));
            if (!isGame && lower.includes('charset') && lower.includes('chipset')) hits.push(folder);
            if (!isGame) for (const sub of subs) next.push(path.join(folder, sub));
        }
        if (hits.length) return hits.find(h => /rtp/i.test(path.basename(h))) || hits[0];
        level = next;
    }
    return null;
}

/** Downloads a URL into a Buffer, following redirects. onProgress(fraction) when the size is known. */
function download(url, onProgress, redirects = 5) {
    const https = require(url.startsWith('http:') ? 'http' : 'https');
    return new Promise((resolve, reject) => {
        https.get(url, { headers: { 'User-Agent': 'RPG Reactor' } }, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirects > 0) {
                res.resume();
                return resolve(download(new URL(res.headers.location, url).toString(), onProgress, redirects - 1));
            }
            if (res.statusCode !== 200) { res.resume(); return reject(new Error(`download failed: HTTP ${res.statusCode}`)); }
            const total = Number(res.headers['content-length']) || 0;
            const chunks = []; let got = 0;
            res.on('data', (c) => { chunks.push(c); got += c.length; if (total && onProgress) onProgress(got / total); });
            res.on('end', () => resolve(Buffer.concat(chunks)));
            res.on('error', reject);
        }).on('error', reject);
    });
}

/**
 * Downloads RPG Maker's official RTP for the engine and unpacks it into its
 * download folder. progress(fraction, status) runs 0..0.7 downloading, then
 * 0.7..1 unpacking. Resolves to the folder.
 */
async function fetchOfficial(engine, progress = () => {}, folder = downloadFolder(engine)) {
    const source = SOURCES[yearOf(engine)];
    const buf = await download(source.url, (f) => progress(f * 0.7, `Downloading the ${source.name}…`));
    progress(0.7, `Unpacking the ${source.name}…`);
    const unpacked = unpack(buf, folder, (f) => progress(0.7 + f * 0.3, `Unpacking the ${source.name}…`)).folder;
    fs.writeFileSync(path.join(unpacked, MARKER), JSON.stringify({ source: source.url, unpacked: new Date().toISOString() }, null, 2));
    return unpacked;
}

module.exports = { SOURCES, downloadFolder, referencedNames, classify, isOfficial, coverage, translatedView, archiveFiles, archiveKind, installerFromZip, unpack, rtpFrom, findRtpFolder, download, fetchOfficial };
