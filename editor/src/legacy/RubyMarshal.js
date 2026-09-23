/**
 * RubyMarshal - reads Ruby's Marshal format (version 4.8), which is what every
 * RPG Maker XP, VX and VX Ace data file is: `Marshal.dump` of the RPG::
 * objects. Pure: bytes in, plain JS values out.
 *
 *   RubyMarshal.load(bytes) → value
 *
 * Mapping:
 *   nil/true/false/Integer/Float → null/true/false/number
 *   String  → JS string when the bytes are UTF-8 (every RGSS text is), else a Uint8Array
 *             (Scripts.* holds zlib-compressed script bodies that way)
 *   Symbol  → JS string
 *   Array   → Array
 *   Hash    → a Map when a key is not a string or number, else a plain object
 *   Object  → { __class: 'RPG::Actor', name: …, … } (the '@' dropped from each ivar)
 *   User-defined (_dump) → RGSS's Table, Color, Tone and Rect decoded
 *             ({ __class: 'Table', xsize, ysize, zsize, data: Int16Array }, { __class: 'Color', red, … });
 *             anything else keeps its bytes as { __class, bytes }.
 */
(function (root) {
    'use strict';

    const utf8Decoder = typeof TextDecoder !== 'undefined' ? new TextDecoder('utf-8', { fatal: true }) : null;
    const latin = (bytes) => { let s = ''; for (const b of bytes) s += String.fromCharCode(b); return s; };
    const text = (bytes) => {
        if (!utf8Decoder) return latin(bytes);
        try { return utf8Decoder.decode(bytes); } catch (_) { return null; }
    };

    /** RGSS's own _dump formats. */
    const USER_TYPES = {
        Table(bytes) {
            const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
            const dims = view.getInt32(0, true), xsize = view.getInt32(4, true), ysize = view.getInt32(8, true), zsize = view.getInt32(12, true), size = view.getInt32(16, true);
            const data = new Int16Array(size);
            for (let i = 0; i < size && 20 + i * 2 + 1 < bytes.length; i++) data[i] = view.getInt16(20 + i * 2, true);
            return { __class: 'Table', dims, xsize, ysize, zsize, data };
        },
        Color(bytes) {
            const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
            return { __class: 'Color', red: view.getFloat64(0, true), green: view.getFloat64(8, true), blue: view.getFloat64(16, true), alpha: view.getFloat64(24, true) };
        },
        Tone(bytes) {
            const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
            return { __class: 'Tone', red: view.getFloat64(0, true), green: view.getFloat64(8, true), blue: view.getFloat64(16, true), gray: view.getFloat64(24, true) };
        },
        Rect(bytes) {
            const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
            return { __class: 'Rect', x: view.getInt32(0, true), y: view.getInt32(4, true), width: view.getInt32(8, true), height: view.getInt32(12, true) };
        }
    };

    function load(input) {
        const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
        if (bytes[0] !== 4 || bytes[1] !== 8) throw new Error(`Not Ruby Marshal 4.8 data (header ${bytes[0]}.${bytes[1]}).`);
        let pos = 2;
        const symbols = [];
        const objects = [];

        const byte = () => { if (pos >= bytes.length) throw new Error('Marshal: unexpected end of data.'); return bytes[pos++]; };
        const long = () => {
            const c = (byte() << 24) >> 24;   // signed
            if (c === 0) return 0;
            if (c >= 5) return c - 5;
            if (c <= -5) return c + 5;
            if (c > 0) { let n = 0; for (let i = 0; i < c; i++) n += byte() * 2 ** (8 * i); return n; }
            let n = 0; for (let i = 0; i < -c; i++) n += byte() * 2 ** (8 * i);
            return n - 2 ** (8 * -c);
        };
        const raw = () => { const n = long(); const out = bytes.subarray(pos, pos + n); pos += n; return out; };
        const symbol = () => {
            const t = byte();
            if (t === 0x3a) { const s = latin(raw()); const decoded = text(bytes.subarray(pos - s.length, pos)); const name = decoded !== null ? decoded : s; symbols.push(name); return name; }   // ':'
            if (t === 0x3b) return symbols[long()];   // ';'
            if (t === 0x49) { const name = symbol(); const n = long(); for (let i = 0; i < n; i++) { symbol(); value(); } return name; }   // 'I' around a symbol (encoding)
            throw new Error(`Marshal: expected a symbol at ${pos - 1}, found 0x${t.toString(16)}.`);
        };
        const register = (v) => { objects.push(v); return objects.length - 1; };
        const ivarName = (name) => (name.charCodeAt(0) === 64 ? name.slice(1) : name);

        function value() {
            const t = byte();
            switch (t) {
                case 0x30: return null;              // '0'
                case 0x54: return true;              // 'T'
                case 0x46: return false;             // 'F'
                case 0x69: return long();            // 'i'
                case 0x3a: case 0x3b: pos--; return symbol();
                case 0x40: return objects[long()];   // '@' link
                case 0x49: {                          // 'I' ivars follow the wrapped value
                    const index = objects.length;
                    let v = value();
                    const n = long();
                    for (let i = 0; i < n; i++) {
                        const key = symbol(), ivar = value();
                        if (v && typeof v === 'object' && !(v instanceof Uint8Array) && key !== 'E' && key !== 'encoding') v[ivarName(key)] = ivar;
                    }
                    if (objects[index] !== v && index < objects.length) objects[index] = v;
                    return v;
                }
                case 0x22: {                          // '"' string
                    const b = raw();
                    const s = text(b);
                    const v = s !== null ? s : b.slice();
                    register(v);
                    return v;
                }
                case 0x66: {                          // 'f' float
                    const s = latin(raw());
                    const v = s === 'inf' ? Infinity : s === '-inf' ? -Infinity : s === 'nan' ? NaN : parseFloat(s);
                    register(v);
                    return v;
                }
                case 0x6c: {                          // 'l' bignum
                    const sign = byte() === 0x2d ? -1 : 1;
                    const words = long();
                    let n = 0;
                    for (let i = 0; i < words * 2; i++) n += byte() * 2 ** (8 * i);
                    const v = sign * n;
                    register(v);
                    return v;
                }
                case 0x5b: {                          // '[' array
                    const n = long();
                    const arr = [];
                    register(arr);
                    for (let i = 0; i < n; i++) arr.push(value());
                    return arr;
                }
                case 0x7b: case 0x7d: {               // '{' hash, '}' hash with default
                    const n = long();
                    const entries = [];
                    const slot = register(null);
                    let plain = true;
                    const out = {};
                    objects[slot] = out;
                    for (let i = 0; i < n; i++) {
                        const k = value(), v = value();
                        entries.push([k, v]);
                        if (typeof k !== 'string' && typeof k !== 'number') plain = false;
                        else out[k] = v;
                    }
                    if (t === 0x7d) value();          // the default, unused
                    if (plain) return out;
                    const map = new Map(entries);
                    objects[slot] = map;
                    return map;
                }
                case 0x6f: {                          // 'o' object
                    const cls = symbol();
                    const obj = { __class: cls };
                    register(obj);
                    const n = long();
                    for (let i = 0; i < n; i++) { const key = symbol(); obj[ivarName(key)] = value(); }
                    return obj;
                }
                case 0x75: {                          // 'u' user-defined _dump
                    const cls = symbol();
                    const b = raw();
                    const decode = USER_TYPES[cls];
                    const v = decode ? decode(b) : { __class: cls, bytes: b.slice() };
                    register(v);
                    return v;
                }
                case 0x55: {                          // 'U' marshal_dump
                    const cls = symbol();
                    const slot = register(null);
                    const v = { __class: cls, data: value() };
                    objects[slot] = v;
                    return v;
                }
                case 0x53: {                          // 'S' struct
                    const cls = symbol();
                    const obj = { __class: cls };
                    register(obj);
                    const n = long();
                    for (let i = 0; i < n; i++) { const key = symbol(); obj[key] = value(); }
                    return obj;
                }
                case 0x63: case 0x6d: case 0x4d: {    // 'c' class, 'm' module, 'M' old module
                    const name = latin(raw());
                    const v = { __class: 'Class', name };
                    register(v);
                    return v;
                }
                case 0x2f: {                          // '/' regexp
                    const source = text(raw()) || '';
                    byte();                           // options
                    const v = { __class: 'Regexp', source };
                    register(v);
                    return v;
                }
                case 0x65: { symbol(); return value(); }   // 'e' extended by a module
                case 0x43: { const cls = symbol(); const v = value(); if (v && typeof v === 'object' && !(v instanceof Uint8Array)) v.__class = v.__class || cls; return v; }   // 'C' subclass of a builtin
                case 0x64: { const cls = symbol(); const v = { __class: cls, data: value() }; register(v); return v; }   // 'd' data
                default:
                    throw new Error(`Marshal: unknown type 0x${t.toString(16)} at ${pos - 1}.`);
            }
        }
        return value();
    }

    const api = { load, USER_TYPES };
    root.RRRubyMarshal = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
