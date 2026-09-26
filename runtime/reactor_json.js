/* JSON file boundary: decode Unicode BOMs before parsing, without changing JSON.parse. */
(function(root) {
    'use strict';
    function decode(source) {
        if (typeof source === 'string') return source.replace(/^\uFEFF/, '');
        const bytes = ArrayBuffer.isView(source)
            ? new Uint8Array(source.buffer, source.byteOffset, source.byteLength)
            : source instanceof ArrayBuffer ? new Uint8Array(source) : null;
        if (!bytes) throw new TypeError('JSON input must be text or bytes.');
        let encoding = 'utf-8', offset = 0;
        if (bytes[0] === 0xff && bytes[1] === 0xfe) { encoding = 'utf-16le'; offset = 2; }
        else if (bytes[0] === 0xfe && bytes[1] === 0xff) { encoding = 'utf-16be'; offset = 2; }
        else if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) offset = 3;
        const Decoder = typeof TextDecoder !== 'undefined' ? TextDecoder : require('util').TextDecoder;
        // Malformed bytes must remain errors, rather than corrupting names or event text.
        return new Decoder(encoding, {fatal:true, ignoreBOM:true}).decode(bytes.subarray(offset));
    }
    function parse(source) { return JSON.parse(decode(source)); }
    function read(fs, filePath) { return parse(fs.readFileSync(filePath)); }
    /**
     * Data as a file: readable, and not three times its size. A list at the
     * top (a database file) is one record a line, the way RPG Maker writes
     * one; an object at the top has a field a line, its lists of records a
     * record a line, anything else compact. Indenting every field and every
     * number put a tileset's flags on eight thousand lines each.
     */
    function stringify(data) {
        const records = list => list.every(item => item === null || (item && typeof item === 'object'));
        if (Array.isArray(data)) {
            if (!data.length || !records(data)) return JSON.stringify(data);
            return '[\n' + data.map(item => JSON.stringify(item)).join(',\n') + '\n]';
        }
        if (!data || typeof data !== 'object') return JSON.stringify(data);
        const keys = Object.keys(data).filter(key => data[key] !== undefined);
        if (!keys.length) return '{}';
        const value = v => Array.isArray(v) && v.length && v.some(item => item && typeof item === 'object') && records(v)
            ? '[\n' + v.map(item => '    ' + JSON.stringify(item)).join(',\n') + '\n  ]'
            : JSON.stringify(v);
        return '{\n' + keys.map(key => '  ' + JSON.stringify(key) + ': ' + value(data[key])).join(',\n') + '\n}';
    }
    const api = {decode, parse, read, stringify};
    root.RRJson = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(globalThis);
