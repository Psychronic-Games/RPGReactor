/**
 * Reads the files out of an NSIS 2 installer (non-solid, LZMA or stored), as
 * RPG Maker's 2000 and 2003 RTP installers are, without running it: the
 * installer's script names each file and the folder it goes to, and the data
 * block holds them one by one. Paths come back relative to the folder the
 * installer installs into (the variable a path starts with: $INSTDIR, or the
 * installer's own, as the RTP installers use), with forward slashes; files
 * for the installer itself ($PLUGINSDIR, $TEMP) are skipped.
 */
(function(root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory(require('./Lzma.js'));
    else root.RRNsisArchive = factory(root.RRLzma);
})(typeof globalThis !== 'undefined' ? globalThis : this, function(Lzma) {
    'use strict';

    const SIGNATURE = [0xEF, 0xBE, 0xAD, 0xDE, 0x4E, 0x75, 0x6C, 0x6C, 0x73, 0x6F, 0x66, 0x74, 0x49, 0x6E, 0x73, 0x74];   // 0xDEADBEEF "NullsoftInst"
    const EW_CREATEDIR = 11, EW_EXTRACTFILE = 20;
    const NS_SKIP = 252, NS_VAR = 253, NS_SHELL = 254, NS_LANG = 255;
    const VAR_OUTDIR = 22, VAR_TEMP = 25, VAR_PLUGINSDIR = 26;

    const u32 = (b, o) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;

    /** Where the first header starts (on a 512-byte boundary after the stub), or -1. */
    function findHeader(buf) {
        for (let at = 0; at + 28 <= buf.length; at += 512) {
            let ok = true;
            for (let i = 0; i < SIGNATURE.length; i++) if (buf[at + 4 + i] !== SIGNATURE[i]) { ok = false; break; }
            if (ok) return at;
        }
        return -1;
    }

    /** A block of the archive: a 4-byte size (top bit: compressed) and the data. */
    function block(buf, at, outSize) {
        const word = u32(buf, at);
        const compressed = (word & 0x80000000) !== 0;
        const size = word & 0x7FFFFFFF;
        const data = buf.subarray(at + 4, at + 4 + size);
        return { next: at + 4 + size, data: compressed ? Lzma.decode(data, outSize) : data };
    }

    /**
     * The archive's file list. `file.read()` decodes one file's bytes.
     * @param {Uint8Array} buf the whole installer
     */
    function open(buf) {
        buf = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
        const first = findHeader(buf);
        if (first < 0) throw new Error('not an NSIS installer');
        const flags = u32(buf, first);
        const headerLength = u32(buf, first + 20);
        if (flags & 1) throw new Error('an NSIS uninstaller, not an installer');
        // Solid archives compress header and files as one stream; RPG Maker's installers are not solid.
        const headerBlock = block(buf, first + 28, headerLength);
        const header = headerBlock.data;
        if (header.length !== headerLength) throw new Error('NSIS: the header did not decode (a solid or newer installer)');
        const dataStart = headerBlock.next;
        const entriesAt = u32(header, 4 + 2 * 8), entryCount = u32(header, 4 + 2 * 8 + 4);
        const stringsAt = u32(header, 4 + 3 * 8);

        const decoder = new TextDecoder('windows-1252');
        // A variable becomes `\u0001<index>\u0001`; a shell folder or language string `\u0003`.
        const string = (offset) => {
            let at = stringsAt + offset, text = '';
            const bytes = [];
            const flush = () => { if (bytes.length) { text += decoder.decode(Uint8Array.from(bytes)); bytes.length = 0; } };
            for (;;) {
                const c = header[at++];
                if (c === 0 || c === undefined) break;
                if (c === NS_SKIP) { bytes.push(header[at++]); continue; }
                if (c === NS_VAR || c === NS_SHELL || c === NS_LANG) {
                    const index = (header[at] & 0x7F) | ((header[at + 1] & 0x7F) << 7);
                    at += 2;
                    flush();
                    text += c === NS_VAR ? `\u0001${index}\u0001` : '\u0003';
                    continue;
                }
                bytes.push(c);
            }
            flush();
            return text;
        };

        const files = [];
        // The output folder relative to the install root, or null for the installer's own folders.
        const relative = (p) => {
            const m = /^\u0001(\d+)\u0001(?:\/(.*))?$/.exec(p);
            if (!m || [VAR_OUTDIR, VAR_TEMP, VAR_PLUGINSDIR].includes(Number(m[1])) || /[\u0001\u0003]/.test(m[2] || '')) return null;
            return m[2] || '';
        };
        let outdir = null;
        for (let i = 0; i < entryCount; i++) {
            const at = entriesAt + i * 28;
            const which = u32(header, at);
            const parm = (n) => u32(header, at + 4 + n * 4);
            if (which === EW_CREATEDIR && parm(1) !== 0) {
                outdir = relative(string(parm(0)).replace(/\\/g, '/'));
            } else if (which === EW_EXTRACTFILE) {
                let name = string(parm(1)).replace(/\\/g, '/');
                if (name.startsWith('\u0001')) { const r = relative(name); if (r === null) continue; name = r; }
                else if (outdir === null || /[\u0001\u0003]/.test(name)) continue;
                const rel = string(parm(1)).startsWith('\u0001') ? name : (outdir ? outdir + '/' : '') + name;
                if (rel.split('/').some(part => part === '..' || part === '')) continue;
                const dataAt = dataStart + parm(2);
                if (dataAt + 4 > buf.length) throw new Error(`NSIS: ${rel} lies beyond the installer`);
                files.push({ path: rel, read: () => block(buf, dataAt).data });
            }
        }
        if (!files.length) throw new Error('NSIS: no files found (an installer layout this reader does not know)');
        return { files };
    }

    return { open, findHeader };
});
