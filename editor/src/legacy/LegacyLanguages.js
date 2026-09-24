/**
 * LegacyLanguages - the language packs an imported game switches between.
 *
 * An EasyRPG game can ship translations (Language/<name>/*.po) and change
 * language while it plays (`@easyrpg_set_language`). The import bakes one
 * language into the data; every other one becomes a pack of the texts that
 * differ, found by converting the game again with that translation and
 * comparing the two results. RR_Language.js applies a pack when the game
 * switches.
 *
 * A pack is { language, files: { "Map003.json": [op, ...], ... } }, where an
 * op is [path, value] (set the value at a path of keys) or
 * [path, index, removeCount, items] (splice a command list, for a message
 * whose translation has a different number of lines). Sets use the indices
 * of the baked data and come first; splices follow, highest index first per
 * list, so every index is still valid when its op runs.
 */
(function(root) {
    'use strict';

    // Text that a translation may lengthen or shorten: Show Text (header and lines), scrolling-text
    // lines, and a screen text's appended lines. A run of these is compared as one block.
    const RUN_CODES = new Set([101, 401, 405]);
    const isRun = (c) => c && (RUN_CODES.has(c.code) || (c.code === 355 && /^\$gameScreen\.rrAppendLine\(/.test(String(c.parameters[0]))));
    const isCommandList = (v) => Array.isArray(v) && v.length > 0 && v.every(c => c && typeof c === 'object' && typeof c.code === 'number' && Array.isArray(c.parameters));

    function diffValue(a, b, path, ops, splices, stats) {
        if (a === b) return;
        if (Array.isArray(a) && Array.isArray(b)) {
            if (isCommandList(a) || isCommandList(b)) return diffList(a, b, path, ops, splices, stats);
            if (a.length === b.length) { for (let i = 0; i < a.length; i++) diffValue(a[i], b[i], path.concat(i), ops, splices, stats); return; }
            ops.push([path, b]);
            return;
        }
        if (a && b && typeof a === 'object' && typeof b === 'object' && !Array.isArray(a) && !Array.isArray(b)) {
            for (const key of Object.keys(b)) diffValue(a[key], b[key], path.concat(key), ops, splices, stats);
            for (const key of Object.keys(a)) if (!(key in b)) ops.push([path.concat(key), null]);
            return;
        }
        if (JSON.stringify(a) !== JSON.stringify(b)) ops.push([path, b === undefined ? null : b]);
    }

    /** Commands align one for one, except runs of message lines, which may change length. */
    function diffList(a, b, path, ops, splices, stats) {
        const localOps = [], localSplices = [];
        let i = 0, j = 0, aligned = true;
        while (i < a.length || j < b.length) {
            const ca = a[i], cb = b[j];
            if (isRun(ca) && isRun(cb) && ca.code === cb.code) {
                let i2 = i; while (isRun(a[i2]) && a[i2].indent === ca.indent) i2++;
                let j2 = j; while (isRun(b[j2]) && b[j2].indent === cb.indent) j2++;
                if (i2 - i === j2 - j) for (let k = 0; k < i2 - i; k++) diffValue(a[i + k], b[j + k], path.concat(i + k), localOps, localSplices, stats);
                else localSplices.push([path, i, i2 - i, b.slice(j, j2)]);
                i = i2; j = j2;
                continue;
            }
            if (ca && cb && ca.code === cb.code) { diffValue(ca, cb, path.concat(i), localOps, localSplices, stats); i++; j++; continue; }
            aligned = false;
            break;
        }
        if (!aligned) { ops.push([path, b]); stats.wholeLists++; return; }
        ops.push(...localOps);
        splices.push(...localSplices);
    }

    /** The ops that turn `base` (one data file's JSON) into `other`. */
    function diff(base, other, stats) {
        const ops = [], splices = [];
        stats = stats || { wholeLists: 0 };
        diffValue(base, other, [], ops, splices, stats);
        // Highest index first within each list, so an earlier splice never moves a later one.
        const byList = new Map();
        for (const s of splices) { const key = JSON.stringify(s[0]); if (!byList.has(key)) byList.set(key, []); byList.get(key).push(s); }
        const ordered = [];
        for (const group of byList.values()) ordered.push(...group.sort((x, y) => y[1] - x[1]));
        return ops.concat(ordered);
    }

    /** Apply a file's ops to its loaded JSON; returns the ops that undo them, in the order to run them. */
    function apply(target, ops) {
        const undo = [];
        const walk = (path) => { let o = target; for (const k of path) o = o == null ? o : o[k]; return o; };
        for (const op of ops || []) {
            if (op.length === 2) {
                const [path, value] = op;
                if (!path.length) continue;
                const owner = walk(path.slice(0, -1)), key = path[path.length - 1];
                if (owner == null || typeof owner !== 'object') continue;
                undo.push([path, owner[key]]);
                owner[key] = value == null ? value : JSON.parse(JSON.stringify(value));
            } else {
                const [path, index, remove, items] = op;
                const list = walk(path);
                if (!Array.isArray(list)) continue;
                const removed = list.splice(index, remove, ...JSON.parse(JSON.stringify(items)));
                undo.push([path, index, items.length, removed]);
            }
        }
        return undo.reverse();
    }

    const api = { diff, apply, isCommandList };
    root.RRLegacyLanguages = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
