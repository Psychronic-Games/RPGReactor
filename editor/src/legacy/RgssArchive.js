/**
 * RgssArchive - the packed archive a released RPG Maker XP, VX or VX Ace
 * game ships its Data (and often Graphics) in: Game.rgssad (XP), Game.rgss2a
 * (VX), Game.rgss3a (VX Ace). The contents are XOR-scrambled, not encrypted:
 * reading them is what every RGSS player (the stock Game.exe, mkxp) does to
 * run the game, and what an import has to do to reach its data.
 *
 * Pure: takes the archive's bytes, returns an index whose entries are read on
 * demand. Paths are normalised to forward slashes and matched without regard
 * to case, as the Windows engines did.
 *
 *   const archive = RgssArchive.open(bytes);
 *   archive.list()            → ['Data/Actors.rxdata', 'Graphics/Characters/001-Fighter01.png', …]
 *   archive.read('data/actors.rxdata') → Uint8Array | null
 */
(function (root) {
    'use strict';

    const MAGIC = [0x52, 0x47, 0x53, 0x53, 0x41, 0x44, 0x00];   // "RGSSAD\0"
    const next = (key) => (Math.imul(key, 7) + 3) >>> 0;

    const u32 = (bytes, pos) => (bytes[pos] | (bytes[pos + 1] << 8) | (bytes[pos + 2] << 16) | (bytes[pos + 3] << 24)) >>> 0;
    const utf8 = (bytes) => (typeof TextDecoder !== 'undefined' ? new TextDecoder('utf-8').decode(bytes) : String.fromCharCode(...bytes));

    /** The data of one entry, unscrambled from `key` on, four bytes at a time. */
    function unscramble(bytes, offset, size, key) {
        const out = new Uint8Array(size);
        let k = key >>> 0;
        for (let i = 0; i < size; i += 4) {
            for (let j = 0; j < 4 && i + j < size; j++) out[i + j] = bytes[offset + i + j] ^ ((k >>> (8 * j)) & 0xff);
            k = next(k);
        }
        return out;
    }

    /** RGSSAD version 1 (XP and VX): names and sizes scrambled by one running key. */
    function indexV1(bytes) {
        const entries = [];
        let pos = 8, key = 0xDEADCAFE;
        while (pos + 4 <= bytes.length) {
            const nameLength = (u32(bytes, pos) ^ key) >>> 0; pos += 4; key = next(key);
            if (nameLength === 0 || nameLength > 4096 || pos + nameLength > bytes.length) break;
            const name = new Uint8Array(nameLength);
            for (let i = 0; i < nameLength; i++) { name[i] = bytes[pos + i] ^ (key & 0xff); key = next(key); }
            pos += nameLength;
            const size = (u32(bytes, pos) ^ key) >>> 0; pos += 4; key = next(key);
            if (pos + size > bytes.length) break;
            entries.push({ name: utf8(name), offset: pos, size, key });
            pos += size;
        }
        return entries;
    }

    /** RGSSAD version 3 (VX Ace): a table of offsets, each file with its own key. */
    function indexV3(bytes) {
        const entries = [];
        const key = (Math.imul(u32(bytes, 8), 9) + 3) >>> 0;
        let pos = 12;
        while (pos + 16 <= bytes.length) {
            const offset = (u32(bytes, pos) ^ key) >>> 0;
            if (offset === 0) break;
            const size = (u32(bytes, pos + 4) ^ key) >>> 0;
            const fileKey = (u32(bytes, pos + 8) ^ key) >>> 0;
            const nameLength = (u32(bytes, pos + 12) ^ key) >>> 0;
            pos += 16;
            if (nameLength > 4096 || pos + nameLength > bytes.length) break;
            const name = new Uint8Array(nameLength);
            for (let i = 0; i < nameLength; i++) name[i] = bytes[pos + i] ^ ((key >>> (8 * (i % 4))) & 0xff);
            pos += nameLength;
            if (offset + size > bytes.length) continue;
            entries.push({ name: utf8(name), offset, size, key: fileKey });
        }
        return entries;
    }

    function open(input) {
        const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
        for (let i = 0; i < MAGIC.length; i++) if (bytes[i] !== MAGIC[i]) throw new Error('Not an RGSS archive (no RGSSAD header).');
        const version = bytes[7];
        if (version !== 1 && version !== 3) throw new Error(`RGSS archive version ${version} is not one this reader knows.`);
        const entries = version === 3 ? indexV3(bytes) : indexV1(bytes);
        const byPath = new Map();
        for (const entry of entries) {
            entry.path = entry.name.replace(/\\/g, '/');
            byPath.set(entry.path.toLowerCase(), entry);
        }
        return {
            version,
            list: () => entries.map(e => e.path),
            has: (path) => byPath.has(String(path).replace(/\\/g, '/').toLowerCase()),
            size: (path) => { const e = byPath.get(String(path).replace(/\\/g, '/').toLowerCase()); return e ? e.size : -1; },
            read: (path) => {
                const e = byPath.get(String(path).replace(/\\/g, '/').toLowerCase());
                return e ? unscramble(bytes, e.offset, e.size, e.key) : null;
            }
        };
    }

    const api = { open };
    root.RRRgssArchive = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
