/**
 * LZMA decoding, the "LZMA1" stream as NSIS installers store it: five
 * property bytes (lc/lp/pb, dictionary size) and the range-coded data, ending
 * at the end marker, at a known output size, or when the input runs out.
 * Pure JavaScript, so an installer is read without running it or any tool.
 */
(function(root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.RRLzma = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
    'use strict';

    const kNumStates = 12, kEndPosModelIndex = 14, kNumFullDistances = 128, kNumAlignBits = 4, kMatchMinLen = 2;

    /**
     * Decodes `input` (properties first) into a Uint8Array.
     * @param {Uint8Array} input
     * @param {number} [outSize] the decoded size when known; decoding stops there
     */
    function decode(input, outSize) {
        if (input.length < 5) throw new Error('LZMA: truncated properties');
        let d = input[0];
        if (d >= 9 * 5 * 5) throw new Error('LZMA: bad properties');
        const lc = d % 9; d = (d / 9) | 0;
        const lp = d % 5, pb = (d / 5) | 0;
        let inPos = 5;

        // range decoder
        let range = 0xFFFFFFFF, code = 0;
        const next = () => (inPos < input.length ? input[inPos++] : 0);
        if (next() !== 0) throw new Error('LZMA: bad stream start');
        for (let i = 0; i < 4; i++) code = ((code << 8) | next()) >>> 0;
        const normalize = () => { if (range < 0x1000000) { range = (range << 8) >>> 0; code = ((code << 8) | next()) >>> 0; } };
        const bit = (probs, i) => {
            const p = probs[i];
            const bound = (range >>> 11) * p >>> 0;
            let b;
            if (code < bound) { range = bound; probs[i] = p + ((2048 - p) >>> 5); b = 0; }
            else { range = (range - bound) >>> 0; code = (code - bound) >>> 0; probs[i] = p - (p >>> 5); b = 1; }
            normalize();
            return b;
        };
        const tree = (probs, base, bits) => { let m = 1; for (let i = 0; i < bits; i++) m = (m << 1) | bit(probs, base + m); return m - (1 << bits); };
        const reverse = (probs, base, bits) => { let m = 1, sym = 0; for (let i = 0; i < bits; i++) { const b = bit(probs, base + m); m = (m << 1) | b; sym |= b << i; } return sym; };
        const direct = (bits) => {
            let res = 0;
            for (let i = 0; i < bits; i++) {
                range = range >>> 1;
                let b = 0;
                if (code >= range) { code = (code - range) >>> 0; b = 1; }
                res = ((res << 1) | b) >>> 0;
                normalize();
            }
            return res;
        };
        const probs = (n) => new Uint16Array(n).fill(1024);

        const posStates = 1 << pb;
        const isMatch = probs(kNumStates << 4), isRep = probs(kNumStates), isRepG0 = probs(kNumStates), isRepG1 = probs(kNumStates), isRepG2 = probs(kNumStates), isRep0Long = probs(kNumStates << 4);
        const posSlot = probs(4 << 6), posSpecial = probs(kNumFullDistances - kEndPosModelIndex), align = probs(1 << kNumAlignBits);
        const literal = probs(0x300 << (lc + lp));
        const lenCoder = () => ({ choice: probs(2), low: probs(posStates << 3), mid: probs(posStates << 3), high: probs(256) });
        const lenMain = lenCoder(), lenRep = lenCoder();
        const length = (c, ps) => {
            if (bit(c.choice, 0) === 0) return tree(c.low, ps << 3, 3);
            if (bit(c.choice, 1) === 0) return 8 + tree(c.mid, ps << 3, 3);
            return 16 + tree(c.high, 0, 8);
        };

        let out = new Uint8Array(outSize !== undefined ? outSize : Math.max(1024, input.length * 4));
        let outPos = 0;
        const put = (b) => {
            if (outPos >= out.length) { const grown = new Uint8Array(out.length * 2); grown.set(out); out = grown; }
            out[outPos++] = b;
        };
        let state = 0, rep0 = 0, rep1 = 0, rep2 = 0, rep3 = 0;
        const lpMask = (1 << lp) - 1, pbMask = posStates - 1;
        while (outSize === undefined || outPos < outSize) {
            if (inPos >= input.length + 4) break;   // input exhausted
            const ps = outPos & pbMask;
            if (bit(isMatch, (state << 4) + ps) === 0) {
                const prev = outPos > 0 ? out[outPos - 1] : 0;
                const base = 0x300 * (((outPos & lpMask) << lc) + (prev >>> (8 - lc)));
                let sym = 1;
                if (state >= 7) {
                    let matchByte = out[outPos - rep0 - 1];
                    while (sym < 0x100) {
                        const mb = (matchByte >>> 7) & 1; matchByte <<= 1;
                        const b = bit(literal, base + ((1 + mb) << 8) + sym);
                        sym = (sym << 1) | b;
                        if (mb !== b) break;
                    }
                }
                while (sym < 0x100) sym = (sym << 1) | bit(literal, base + sym);
                put(sym & 0xff);
                state = state < 4 ? 0 : state < 10 ? state - 3 : state - 6;
                continue;
            }
            let len;
            if (bit(isRep, state)) {
                if (outPos === 0) throw new Error('LZMA: data error');
                if (bit(isRepG0, state) === 0) {
                    if (bit(isRep0Long, (state << 4) + ps) === 0) {
                        state = state < 7 ? 9 : 11;
                        put(out[outPos - rep0 - 1]);
                        continue;
                    }
                } else {
                    let dist;
                    if (bit(isRepG1, state) === 0) dist = rep1;
                    else { if (bit(isRepG2, state) === 0) dist = rep2; else { dist = rep3; rep3 = rep2; } rep2 = rep1; }
                    rep1 = rep0; rep0 = dist;
                }
                len = length(lenRep, ps);
                state = state < 7 ? 8 : 11;
            } else {
                rep3 = rep2; rep2 = rep1; rep1 = rep0;
                len = length(lenMain, ps);
                state = state < 7 ? 7 : 10;
                const slot = tree(posSlot, (len < 4 ? len : 3) << 6, 6);
                if (slot < 4) rep0 = slot;
                else {
                    const directBits = (slot >>> 1) - 1;
                    let dist = ((2 | (slot & 1)) << directBits) >>> 0;
                    if (slot < kEndPosModelIndex) dist += reverse(posSpecial, dist - slot - 1, directBits);
                    else { dist = (dist + (direct(directBits - kNumAlignBits) << kNumAlignBits)) >>> 0; dist = (dist + reverse(align, 0, kNumAlignBits)) >>> 0; }
                    rep0 = dist >>> 0;
                    if (rep0 === 0xFFFFFFFF) break;   // end marker
                }
                if (rep0 >= outPos) throw new Error('LZMA: distance beyond the data');
            }
            len += kMatchMinLen;
            for (let i = 0; i < len && (outSize === undefined || outPos < outSize); i++) put(out[outPos - rep0 - 1]);
        }
        return out.subarray(0, outPos);
    }

    return { decode };
});
