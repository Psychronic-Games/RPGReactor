/**
 * Reads RAR archives of the RAR 1.5-4 container whose files are stored or
 * compressed with RAR 2.0's method (unpack version 20 or 26), solid or not,
 * as Don Miguel's English RTP (RTPE.exe, a self-extracting RAR) is. RAR 3's
 * method (29) and RAR 5 are refused with a message, never misread. Every
 * file's CRC32 is checked. Pure JavaScript, nothing run.
 */
(function(root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.RRRar2 = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
    'use strict';

    const MARKER = [0x52, 0x61, 0x72, 0x21, 0x1A, 0x07, 0x00];
    const NC20 = 298, DC20 = 48, RC20 = 28, BC20 = 19, MC20 = 257;
    const LDecode = [0, 1, 2, 3, 4, 5, 6, 7, 8, 10, 12, 14, 16, 20, 24, 28, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224];
    const LBits = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5];
    const DDecode = [0, 1, 2, 3, 4, 6, 8, 12, 16, 24, 32, 48, 64, 96, 128, 192, 256, 384, 512, 768, 1024, 1536, 2048, 3072, 4096, 6144, 8192, 12288, 16384, 24576, 32768, 49152, 65536, 98304, 131072, 196608, 262144, 327680, 393216, 458752, 524288, 589824, 655360, 720896, 786432, 851968, 917504, 983040];
    const DBits = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13, 14, 14, 15, 15, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16];
    const SDDecode = [0, 4, 8, 16, 32, 64, 128, 192];
    const SDBits = [2, 2, 3, 4, 5, 6, 6, 6];
    const WINDOW = 0x400000, MASK = WINDOW - 1;

    const CRC_TABLE = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
    function crc32(bytes) { let c = 0xFFFFFFFF; for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }

    /** Where the archive starts (RAR 1.5-4 or RAR 5): offset 0, or after a self-extractor's stub. -1 when there is none. */
    function findMarker(buf) {
        outer: for (let at = 0; at + 8 <= buf.length; at++) {
            if (buf[at] !== 0x52) continue;
            for (let i = 1; i < 6; i++) if (buf[at + i] !== MARKER[i]) continue outer;
            if (buf[at + 6] === 0x00 || (buf[at + 6] === 0x01 && buf[at + 7] === 0x00)) return at;
        }
        return -1;
    }

    /** RAR 5's marker (Rar!\x1a\x07\x01\x00): recognised only to say it is not read. */
    function isRar5(buf, at) { return buf[at + 6] === 0x01 && buf[at + 7] === 0x00; }

    // ---- bit input ----------------------------------------------------------
    function BitInput(data) { this.data = data; this.addr = 0; this.bit = 0; }
    BitInput.prototype.getbits = function() {
        const d = this.data, a = this.addr;
        const v = ((d[a] || 0) << 16) | ((d[a + 1] || 0) << 8) | (d[a + 2] || 0);
        return (v >>> (8 - this.bit)) & 0xFFFF;
    };
    BitInput.prototype.addbits = function(n) { this.bit += n; this.addr += this.bit >>> 3; this.bit &= 7; };

    // ---- Huffman tables (RAR's canonical layout) -----------------------------
    function makeTable(lengths, offset, size) {
        const count = new Uint32Array(16);
        for (let i = 0; i < size; i++) count[lengths[offset + i] & 0xF]++;
        count[0] = 0;
        const len = new Uint32Array(16), pos = new Uint32Array(16);
        let upper = 0;
        for (let i = 1; i < 16; i++) {
            upper += count[i];
            len[i] = (upper << (16 - i)) >>> 0;
            upper *= 2;
            pos[i] = pos[i - 1] + count[i - 1];
        }
        const copy = pos.slice(), num = new Uint16Array(size);
        for (let i = 0; i < size; i++) { const l = lengths[offset + i] & 0xF; if (l) num[copy[l]++] = i; }
        return { len, pos, num, max: size };
    }
    function decodeNumber(inp, t) {
        const field = inp.getbits() & 0xFFFE;
        let bits = 1;
        while (bits < 15 && field >= t.len[bits]) bits++;
        inp.addbits(bits);
        const dist = (field - t.len[bits - 1]) >>> (16 - bits);
        let p = t.pos[bits] + dist;
        if (p >= t.max) p = 0;
        return t.num[p];
    }

    // ---- RAR 2.0 decoder, its state kept across the files of a solid archive --
    function Unpack20() {
        this.window = new Uint8Array(WINDOW);
        this.ptr = 0;
        this.reset();
    }
    Unpack20.prototype.reset = function() {
        this.oldDist = [0, 0, 0, 0]; this.oldDistPtr = 0; this.lastDist = 0; this.lastLength = 0;
        this.oldTable = new Uint8Array(MC20 * 4);
        this.tablesRead = false; this.audio = false; this.channels = 1; this.curChannel = 0; this.channelDelta = 0;
        this.aud = [0, 1, 2, 3].map(() => ({ K1: 0, K2: 0, K3: 0, K4: 0, K5: 0, D1: 0, D2: 0, D3: 0, D4: 0, lastDelta: 0, dif: new Uint32Array(11), byteCount: 0, lastChar: 0 }));
        this.md = [];
    };
    Unpack20.prototype.readTables = function(inp) {
        const field = inp.getbits();
        this.audio = (field & 0x8000) !== 0;
        if (!(field & 0x4000)) this.oldTable.fill(0);
        inp.addbits(2);
        let size;
        if (this.audio) {
            this.channels = ((field >>> 12) & 3) + 1;
            if (this.curChannel >= this.channels) this.curChannel = 0;
            inp.addbits(2);
            size = MC20 * this.channels;
        } else size = NC20 + DC20 + RC20;
        const bitLength = new Uint8Array(BC20);
        for (let i = 0; i < BC20; i++) { bitLength[i] = inp.getbits() >>> 12; inp.addbits(4); }
        const bd = makeTable(bitLength, 0, BC20);
        const table = new Uint8Array(MC20 * 4);
        for (let i = 0; i < size;) {
            const n = decodeNumber(inp, bd);
            if (n < 16) { table[i] = (n + this.oldTable[i]) & 0xF; i++; }
            else if (n === 16) {
                let count = (inp.getbits() >>> 14) + 3; inp.addbits(2);
                if (i === 0) throw new Error('RAR: bad table');
                while (count-- > 0 && i < size) { table[i] = table[i - 1]; i++; }
            } else {
                let count;
                if (n === 17) { count = (inp.getbits() >>> 13) + 3; inp.addbits(3); }
                else { count = (inp.getbits() >>> 9) + 11; inp.addbits(7); }
                while (count-- > 0 && i < size) table[i++] = 0;
            }
        }
        this.tablesRead = true;
        if (this.audio) { this.md = []; for (let c = 0; c < this.channels; c++) this.md.push(makeTable(table, c * MC20, MC20)); }
        else { this.ld = makeTable(table, 0, NC20); this.dd = makeTable(table, NC20, DC20); this.rd = makeTable(table, NC20 + DC20, RC20); }
        this.oldTable.set(table);
    };
    Unpack20.prototype.decodeAudio = function(delta) {
        const v = this.aud[this.curChannel];
        v.byteCount++;
        v.D4 = v.D3; v.D3 = v.D2; v.D2 = (v.lastDelta - v.D1) | 0; v.D1 = v.lastDelta;
        let pch = (Math.imul(8, v.lastChar) + Math.imul(v.K1, v.D1) + Math.imul(v.K2, v.D2) + Math.imul(v.K3, v.D3) + Math.imul(v.K4, v.D4) + Math.imul(v.K5, this.channelDelta)) | 0;
        pch = (pch >> 3) & 0xFF;
        const ch = (pch - delta) >>> 0;
        const d = ((delta << 24) >> 24) << 3;
        const dif = v.dif;
        dif[0] += Math.abs(d);
        dif[1] += Math.abs(d - v.D1); dif[2] += Math.abs(d + v.D1);
        dif[3] += Math.abs(d - v.D2); dif[4] += Math.abs(d + v.D2);
        dif[5] += Math.abs(d - v.D3); dif[6] += Math.abs(d + v.D3);
        dif[7] += Math.abs(d - v.D4); dif[8] += Math.abs(d + v.D4);
        dif[9] += Math.abs(d - this.channelDelta); dif[10] += Math.abs(d + this.channelDelta);
        this.channelDelta = v.lastDelta = (((ch - v.lastChar) | 0) << 24) >> 24;
        v.lastChar = ch | 0;
        if ((v.byteCount & 0x1F) === 0) {
            let min = dif[0], which = 0;
            dif[0] = 0;
            for (let i = 1; i < 11; i++) { if (dif[i] < min) { min = dif[i]; which = i; } dif[i] = 0; }
            switch (which) {
                case 1: if (v.K1 >= -16) v.K1--; break;
                case 2: if (v.K1 < 16) v.K1++; break;
                case 3: if (v.K2 >= -16) v.K2--; break;
                case 4: if (v.K2 < 16) v.K2++; break;
                case 5: if (v.K3 >= -16) v.K3--; break;
                case 6: if (v.K3 < 16) v.K3++; break;
                case 7: if (v.K4 >= -16) v.K4--; break;
                case 8: if (v.K4 < 16) v.K4++; break;
                case 9: if (v.K5 >= -16) v.K5--; break;
                case 10: if (v.K5 < 16) v.K5++; break;
            }
        }
        return ch & 0xFF;
    };
    /** Decodes one file's packed data into `size` bytes, continuing a solid stream when asked. */
    Unpack20.prototype.file = function(packed, size, solid) {
        if (!solid) this.reset();
        const inp = new BitInput(packed);
        const out = new Uint8Array(size);
        let written = 0;
        const win = this.window;
        const put = (b) => { win[this.ptr] = b; this.ptr = (this.ptr + 1) & MASK; if (written < size) out[written] = b; written++; };
        const copy = (length, distance) => {
            this.oldDist[this.oldDistPtr++ & 3] = distance; this.oldDistPtr &= 3;
            this.lastDist = distance; this.lastLength = length;
            let src = (this.ptr - distance) & MASK;
            for (let i = 0; i < length; i++) { put(win[src]); src = (src + 1) & MASK; }
        };
        if (!solid || !this.tablesRead) this.readTables(inp);
        while (written < size) {
            if (inp.addr > packed.length + 4) throw new Error('RAR: the packed data ended early');
            if (this.audio) {
                const n = decodeNumber(inp, this.md[this.curChannel]);
                if (n === 256) { this.readTables(inp); continue; }
                put(this.decodeAudio(n));
                if (++this.curChannel === this.channels) this.curChannel = 0;
                continue;
            }
            let n = decodeNumber(inp, this.ld), bits;
            if (n < 256) { put(n); continue; }
            if (n > 269) {
                n -= 270;
                let length = LDecode[n] + 3;
                if ((bits = LBits[n]) > 0) { length += inp.getbits() >>> (16 - bits); inp.addbits(bits); }
                const dn = decodeNumber(inp, this.dd);
                let distance = DDecode[dn] + 1;
                if ((bits = DBits[dn]) > 0) { distance += inp.getbits() >>> (16 - bits); inp.addbits(bits); }
                if (distance >= 0x2000) { length++; if (distance >= 0x40000) length++; }
                copy(length, distance);
                continue;
            }
            if (n === 269) { this.readTables(inp); continue; }
            if (n === 256) { copy(this.lastLength, this.lastDist); continue; }
            if (n < 261) {
                const distance = this.oldDist[(this.oldDistPtr - (n - 256)) & 3];
                const ln = decodeNumber(inp, this.rd);
                let length = LDecode[ln] + 2;
                if ((bits = LBits[ln]) > 0) { length += inp.getbits() >>> (16 - bits); inp.addbits(bits); }
                if (distance >= 0x101) { length++; if (distance >= 0x2000) { length++; if (distance >= 0x40000) length++; } }
                copy(length, distance);
                continue;
            }
            n -= 261;
            let distance = SDDecode[n] + 1;
            if ((bits = SDBits[n]) > 0) { distance += inp.getbits() >>> (16 - bits); inp.addbits(bits); }
            copy(2, distance);
        }
        // A table change may sit after the file's last symbol (ReadLastTables).
        if (packed.length >= inp.addr + 5) {
            if (this.audio) { if (decodeNumber(inp, this.md[this.curChannel]) === 256) this.readTables(inp); }
            else if (decodeNumber(inp, this.ld) === 269) this.readTables(inp);
        }
        return out;
    };

    /**
     * The archive's entries, in order. `entry.read()` gives a file's bytes; in a
     * solid archive read them in order (readAll does).
     * @param {Uint8Array} buf the archive or a self-extractor holding one
     */
    function open(buf) {
        buf = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
        const start = findMarker(buf);
        if (start < 0) throw new Error('not a RAR archive');
        if (isRar5(buf, start)) throw new Error('a RAR 5 archive, which this reader does not open; unpack it with an archiver and choose the folder');
        const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
        const entries = [];
        let at = start + 7;
        while (at + 7 <= buf.length) {
            const type = buf[at + 2], flags = view.getUint16(at + 3, true), headSize = view.getUint16(at + 5, true);
            if (headSize < 7) break;
            const addSize = (flags & 0x8000) ? view.getUint32(at + 7, true) : 0;
            if (type === 0x74) {
                const packSize = view.getUint32(at + 7, true), unpSize = view.getUint32(at + 11, true);
                const crc = view.getUint32(at + 16, true), unpVer = buf[at + 24], method = buf[at + 25];
                const nameSize = view.getUint16(at + 26, true);
                const nameAt = at + 32 + ((flags & 0x100) ? 8 : 0);
                let name = '';
                for (let i = 0; i < nameSize && buf[nameAt + i] !== 0; i++) name += String.fromCharCode(buf[nameAt + i]);
                const dataAt = at + headSize;
                entries.push({
                    name: name.replace(/\\/g, '/'), size: unpSize, packSize, crc, unpVer, method,
                    directory: (flags & 0xE0) === 0xE0, encrypted: (flags & 0x04) !== 0, solid: (flags & 0x10) !== 0,
                    data: buf.subarray(dataAt, dataAt + packSize)
                });
            } else if (type === 0x7B) break;
            at += headSize + addSize;
        }
        return { entries };
    }

    /** Every file's bytes, decoded in order (a solid archive's files depend on the ones before). */
    function readAll(buf, onFile) {
        const { entries } = open(buf);
        const unpack = new Unpack20();
        const files = [];
        for (const e of entries) {
            if (e.directory) continue;
            if (e.encrypted) throw new Error(`RAR: ${e.name} is encrypted`);
            let bytes;
            if (e.method === 0x30) bytes = e.data.slice(0, e.size);
            else if (e.unpVer === 20 || e.unpVer === 26) bytes = unpack.file(e.data, e.size, e.solid);
            else throw new Error(`RAR: ${e.name} uses RAR ${(e.unpVer / 10).toFixed(1)}'s compression, which this reader does not open; unpack it with an archiver and choose the folder`);
            if (crc32(bytes) !== e.crc) throw new Error(`RAR: ${e.name} did not unpack correctly (checksum)`);
            files.push({ path: e.name, bytes });
            if (onFile) onFile(files.length, entries.length, e.name);
        }
        return files;
    }

    return { open, readAll, findMarker, crc32 };
});
