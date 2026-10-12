/**
 * Packs a web build's files into a few zip archives, for hosts that limit how many files a build may have and
 * how large it may be.
 *
 * `packFolder(root)` moves the files under root into `packs/pack-N-<hash>.zip` (ordinary zip archives: any tool
 * opens them) and writes `packs/index.json`, which says where each file lies in them. In the browser a service
 * worker (src/web/pack-reader.js) answers a request for a packed file from the archive, by byte range, so the
 * game or editor asks for its files by the paths it always used and nothing is downloaded before it is wanted.
 *
 * A file that shrinks is deflated (data, scripts, models); pictures, music and video are already compressed and
 * are kept as they are, which also lets the browser seek in them. No archive grows past `maxPackBytes`.
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');

const PACK_DIR = 'packs';
const INDEX_NAME = 'index.json';
const WORKER_NAME = 'reactor_pack_worker.js';
// Under the 200 MB a storefront allows one file, with room to spare.
const MAX_PACK_BYTES = 150 * 1048576;
// Already compressed: deflating these again saves nothing and costs the browser its byte ranges.
const STORED = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif', 'apng', 'ogg', 'm4a', 'mp3', 'flac', 'opus', 'mp4', 'webm', 'mkv',
    'woff', 'woff2', 'zip', 'gz', 'br', 'ktx2', 'basis', 'png_', 'ogg_', 'm4a_', 'mp3_', 'webp_', 'jpg_']);
// A deflated copy is used only when it is this much smaller than the file.
const WORTH = 0.9;
const SOURCE_DIR = path.join(__dirname, '..', 'src', 'web');

let crcTable = null;
/** CRC-32 of a buffer (zlib's own where this Node has it). */
function crc32(buffer) {
    if (typeof zlib.crc32 === 'function') return zlib.crc32(buffer) >>> 0;
    if (!crcTable) {
        crcTable = new Uint32Array(256);
        for (let n = 0; n < 256; n++) {
            let c = n;
            for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
            crcTable[n] = c >>> 0;
        }
    }
    let crc = 0xffffffff;
    for (let i = 0; i < buffer.length; i++) crc = crcTable[(crc ^ buffer[i]) & 0xff] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
}

/** Every file under root as a sorted, forward-slashed relative path. */
function listFiles(root) {
    const files = [];
    const walk = (dir, relative) => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const inner = relative ? `${relative}/${entry.name}` : entry.name;
            if (entry.isDirectory()) walk(path.join(dir, entry.name), inner);
            else if (entry.isFile()) files.push(inner);
        }
    };
    walk(root, '');
    return files.sort();
}

/** One file as it goes into an archive: deflated when that is worth it, else as it is. */
function encode(relativePath, data) {
    const extension = relativePath.split('.').pop().toLowerCase();
    if (data.length && !STORED.has(extension)) {
        const deflated = zlib.deflateRawSync(data, { level: 9 });
        if (deflated.length <= data.length * WORTH) return { method: 8, body: deflated };
    }
    return { method: 0, body: data };
}

/** A zip archive written entry by entry; `add` returns where the entry's bytes begin in it. */
class ZipWriter {
    constructor(filePath) {
        this.filePath = filePath;
        this.fd = fs.openSync(filePath, 'w');
        this.offset = 0;
        this.entries = [];
        this.hash = crypto.createHash('sha256');
    }
    write(buffer) {
        fs.writeSync(this.fd, buffer);
        this.hash.update(buffer);
        this.offset += buffer.length;
    }
    add(name, data, encoded) {
        const nameBytes = Buffer.from(name, 'utf8');
        const entry = { nameBytes, crc: crc32(data), size: data.length, stored: encoded.body.length, method: encoded.method, at: this.offset };
        const header = Buffer.alloc(30);
        header.writeUInt32LE(0x04034b50, 0);
        header.writeUInt16LE(20, 4);            // version needed
        header.writeUInt16LE(0x0800, 6);        // names are UTF-8
        header.writeUInt16LE(entry.method, 8);
        header.writeUInt16LE(0, 10);            // time: every build of the same files is the same archive
        header.writeUInt16LE(0x21, 12);         // date: 1980-01-01
        header.writeUInt32LE(entry.crc, 14);
        header.writeUInt32LE(entry.stored, 18);
        header.writeUInt32LE(entry.size, 22);
        header.writeUInt16LE(nameBytes.length, 26);
        header.writeUInt16LE(0, 28);
        this.write(header);
        this.write(nameBytes);
        const dataOffset = this.offset;
        this.write(encoded.body);
        this.entries.push(entry);
        return dataOffset;
    }
    /** Writes the directory and closes the file; returns the first 8 hex digits of its hash. */
    close() {
        const start = this.offset;
        for (const entry of this.entries) {
            const record = Buffer.alloc(46);
            record.writeUInt32LE(0x02014b50, 0);
            record.writeUInt16LE(0x0314, 4);        // made on Unix: unzip tools then take the name as written (UTF-8)
            record.writeUInt16LE(20, 6);
            record.writeUInt16LE(0x0800, 8);
            record.writeUInt16LE(entry.method, 10);
            record.writeUInt16LE(0, 12);
            record.writeUInt16LE(0x21, 14);
            record.writeUInt32LE(entry.crc, 16);
            record.writeUInt32LE(entry.stored, 20);
            record.writeUInt32LE(entry.size, 24);
            record.writeUInt16LE(entry.nameBytes.length, 28);
            record.writeUInt32LE(0o100644 * 65536, 38);  // an ordinary file anyone may read
            record.writeUInt32LE(entry.at, 42);
            this.write(record);
            this.write(entry.nameBytes);
        }
        const end = Buffer.alloc(22);
        end.writeUInt32LE(0x06054b50, 0);
        end.writeUInt16LE(this.entries.length, 8);
        end.writeUInt16LE(this.entries.length, 10);
        end.writeUInt32LE(this.offset - start, 12);
        end.writeUInt32LE(start, 16);
        this.write(end);
        fs.closeSync(this.fd);
        return this.hash.digest('hex').slice(0, 8);
    }
}

/**
 * Packs the files under root. `keep(relativePath)` says which stay as loose files (the page itself, what it names
 * before its service worker is up). Returns what was done: `{ packs, files, before, after }` (bytes), or null
 * when nothing was packed. The packed files are removed from root, and folders left empty with them.
 */
function packFolder(root, options = {}) {
    const keep = options.keep || (() => false);
    const maxPackBytes = options.maxPackBytes || MAX_PACK_BYTES;
    const packRoot = path.join(root, PACK_DIR);
    fs.rmSync(packRoot, { recursive: true, force: true });
    const wanted = listFiles(root).filter(file => !keep(file));
    if (!wanted.length) return null;
    fs.mkdirSync(packRoot, { recursive: true });
    const index = { version: 1, packs: [], files: {} };
    let writer = null, before = 0, after = 0, temporary = '';
    const finish = () => {
        if (!writer) return;
        const hash = writer.close();
        const name = `pack-${index.packs.length + 1}-${hash}.zip`;
        fs.renameSync(temporary, path.join(packRoot, name));
        after += fs.statSync(path.join(packRoot, name)).size;
        index.packs.push(name);
        writer = null;
    };
    for (const file of wanted) {
        const source = path.join(root, ...file.split('/'));
        const data = fs.readFileSync(source);
        const encoded = encode(file, data);
        const cost = 30 + 46 + 2 * Buffer.byteLength(file) + encoded.body.length;
        // (A zip without the 64-bit extension names at most 65,535 files: the next archive takes the rest.)
        if (writer && (writer.offset + cost > maxPackBytes || writer.entries.length >= 65535)) finish();
        if (!writer) {
            temporary = path.join(packRoot, `pack-${index.packs.length + 1}.part`);
            writer = new ZipWriter(temporary);
        }
        index.files[file] = [index.packs.length, writer.add(file, data, encoded), encoded.body.length, data.length, encoded.method];
        before += data.length;
        fs.rmSync(source);
    }
    finish();
    const indexText = JSON.stringify(index);
    fs.writeFileSync(path.join(packRoot, INDEX_NAME), indexText);
    after += Buffer.byteLength(indexText);
    removeEmptyFolders(root);
    return { packs: index.packs.length, files: wanted.length, before, after };
}

function removeEmptyFolders(root) {
    const visit = dir => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) if (entry.isDirectory()) visit(path.join(dir, entry.name));
        if (dir !== root && !fs.readdirSync(dir).length) fs.rmdirSync(dir);
    };
    visit(root);
}

/** The pack reader, as a service worker's source: alone (to put in front of a worker that has its own handler) or with the game's handler. */
function readerSource() {
    return fs.readFileSync(path.join(SOURCE_DIR, 'pack-reader.js'), 'utf8');
}
function workerSource() {
    return `${readerSource()}\n${fs.readFileSync(path.join(SOURCE_DIR, 'pack-worker.js'), 'utf8')}`;
}

// What a deployed game's page runs first. Under its service worker the page loads as it was written. On a first
// visit (or a forced refresh) nothing packed can be read yet: the worker is brought up and the page loaded again,
// once. (The page's own scripts are not run from here: a game starts on the window's load event, which a page that
// waited for its worker would already have had.)
const GATE = `<script>
(function() {
    var KEY = 'rr-pack-reload';
    function flag(value) {
        try {
            if (value === undefined) return sessionStorage.getItem(KEY);
            if (value) sessionStorage.setItem(KEY, '1'); else sessionStorage.removeItem(KEY);
        } catch (error) {}
        return null;
    }
    function fail() {
        var say = function() {
            document.body.insertAdjacentHTML('beforeend', '<p style="color:#fff;font:16px sans-serif;padding:24px">This game cannot read its files in this window. Open it in a normal (not private) browser window with site data allowed.</p>');
        };
        if (document.body) say(); else document.addEventListener('DOMContentLoaded', say);
    }
    if (!('serviceWorker' in navigator)) return fail();
    if (navigator.serviceWorker.controller) return flag(false);
    navigator.serviceWorker.register('${WORKER_NAME}').then(function() { return navigator.serviceWorker.ready; }).then(function() {
        var done = false;
        function again() {
            if (done) return;
            done = true;
            if (flag()) return fail();
            flag(true);
            location.reload();
        }
        if (navigator.serviceWorker.controller) return again();
        navigator.serviceWorker.addEventListener('controllerchange', again, { once: true });
        setTimeout(again, 3000);
    }).catch(fail);
})();
</script>`;

/** A page with the gate as the first thing in its head. Returns the page's new text. */
function gatePage(html) {
    if (html.includes(`register('${WORKER_NAME}')`)) return html;
    const head = /<head[^>]*>/i.exec(html);
    if (head) return `${html.slice(0, head.index + head[0].length)}\n        ${GATE}${html.slice(head.index + head[0].length)}`;
    const body = /<body[^>]*>/i.exec(html);
    return body ? `${html.slice(0, body.index)}${GATE}\n${html.slice(body.index)}` : `${GATE}\n${html}`;
}

/** What stays loose in a deployed game: the page, what the page names at once (styles, icons), and the worker. */
function keepsLooseInGame(file) {
    return !file.includes('/') || file.startsWith('css/') || file.startsWith('icon/') || file.startsWith(`${PACK_DIR}/`);
}

/**
 * Packs a deployed web game in place: its files into packs, the service worker beside its page, and the gate
 * at the top of the page. Returns `packFolder`'s report, or null when there was nothing to pack.
 */
function packGame(root, options = {}) {
    const page = path.join(root, 'index.html');
    if (!fs.existsSync(page)) throw new Error('A web game needs its index.html to be packed.');
    const report = packFolder(root, Object.assign({ keep: keepsLooseInGame }, options));
    if (!report) return null;
    fs.writeFileSync(path.join(root, WORKER_NAME), workerSource());
    fs.writeFileSync(page, gatePage(fs.readFileSync(page, 'utf8')));
    return report;
}

const megabytes = bytes => (bytes / 1048576).toFixed(0);
/** One line saying what a packing did. */
function describe(report) {
    return `Packed ${report.files} files into ${report.packs} ${report.packs === 1 ? 'archive' : 'archives'}: ${megabytes(report.before)} MB to ${megabytes(report.after)} MB.`;
}

module.exports = { PACK_DIR, INDEX_NAME, WORKER_NAME, MAX_PACK_BYTES, crc32, listFiles, encode, packFolder, packGame, gatePage, keepsLooseInGame, readerSource, workerSource, describe };
