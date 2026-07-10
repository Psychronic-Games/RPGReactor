(function (root, factory) {
    if (typeof module !== 'undefined' && module.exports) module.exports = factory();
    else root.RR_HAIR_ENGINE = factory();
})(typeof self !== 'undefined' ? self : this, function () {
'use strict';

function loadOutfitEngine() {
    if (typeof require !== 'function') return null;
    try { return require('./outfit_engine.js'); }
    catch (_) { return null; }
}

const OUTFIT_ENGINE = loadOutfitEngine();

const COLORS = {
    raven:    { label: 'Raven',    outline: '#120b10', shadow: '#241723', base: '#3a283b', lit: '#5b4263', highlight: '#846890' },
    chestnut: { label: 'Chestnut', outline: '#20100b', shadow: '#4b2415', base: '#7a3f24', lit: '#a9663a', highlight: '#d49a5c' },
    auburn:   { label: 'Auburn',   outline: '#230b07', shadow: '#5b1d12', base: '#8e351d', lit: '#bf5b2e', highlight: '#e78a4b' },
    blonde:   { label: 'Blonde',   outline: '#33200c', shadow: '#8f6427', base: '#c9973d', lit: '#e4bd62', highlight: '#ffe39a' },
    platinum: { label: 'Platinum', outline: '#27252b', shadow: '#8a8792', base: '#c7c3cc', lit: '#e6e1ea', highlight: '#fff8ff' },
    silver:   { label: 'Silver',   outline: '#1b1d24', shadow: '#636978', base: '#9ba3b4', lit: '#c4ccd9', highlight: '#f1f5ff' },
    crimson:  { label: 'Crimson',  outline: '#25060b', shadow: '#641321', base: '#9d2637', lit: '#d44758', highlight: '#ff7f89' },
    rose:     { label: 'Rose',     outline: '#2a0c18', shadow: '#7d2947', base: '#bd4a72', lit: '#ea78a0', highlight: '#ffc0d5' },
    violet:   { label: 'Violet',   outline: '#180b2b', shadow: '#3d216d', base: '#6740a4', lit: '#9270d2', highlight: '#c9b5ff' },
    navy:     { label: 'Navy',     outline: '#061022', shadow: '#10294d', base: '#214b7c', lit: '#3f78b6', highlight: '#84b8ee' },
    emerald:  { label: 'Emerald',  outline: '#061a12', shadow: '#16422b', base: '#2d7047', lit: '#4fa66a', highlight: '#9ce5a8' },
    cyan:     { label: 'Cyan',     outline: '#061d25', shadow: '#135063', base: '#21859d', lit: '#4cc2d6', highlight: '#a3f5ff' }
};

const STYLE_OPTIONS = [
    { value: 'layered-bob', label: 'Layered Bob' },
    { value: 'long-layered', label: 'Long Layered' },
    { value: 'short-shag', label: 'Short Shag' },
    { value: 'center-part-long', label: 'Center Part Long' },
    { value: 'short-spiky', label: 'Short Spiky' }
];

const LENGTH_OPTIONS = [
    { value: 'short', label: 'Short' },
    { value: 'medium', label: 'Medium' },
    { value: 'long', label: 'Long' }
];

function mat(h, w, v) { return Array.from({ length: h }, () => new Array(w).fill(v)); }
function rowWidth(row) { return (typeof row === 'string' || Array.isArray(row)) ? row.length : 0; }
function rowAt(row, x) { return (typeof row === 'string' || Array.isArray(row)) ? row[x] : null; }
function blank(ch) { return ch === undefined || ch === null || ch === '' || ch === ' ' || ch === '.' || ch === -1; }
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function hexLuma(hex) {
    const match = /^#?([0-9a-f]{6})$/i.exec(String(hex || ''));
    if (!match) return Infinity;
    const n = parseInt(match[1], 16);
    const r = (n >> 16) & 255;
    const g = (n >> 8) & 255;
    const b = n & 255;
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function fallbackSkinLetters(palette) {
    if (OUTFIT_ENGINE && typeof OUTFIT_ENGINE.detectSkinLetters === 'function') return OUTFIT_ENGINE.detectSkinLetters(palette || {});
    return new Set(Object.keys(palette || {}).filter(k => /skin|flesh/i.test((palette[k] && palette[k].material) || '')));
}

function fallbackAnalyze(frame) {
    let minX = Infinity, minY = Infinity, maxX = -1, maxY = -1;
    for (let y = 0; y < frame.length; y++) {
        const row = frame[y] || '';
        for (let x = 0; x < rowWidth(row); x++) {
            if (blank(rowAt(row, x))) continue;
            minX = Math.min(minX, x); maxX = Math.max(maxX, x);
            minY = Math.min(minY, y); maxY = Math.max(maxY, y);
        }
    }
    if (maxX < 0) { minX = minY = 0; maxX = maxY = 143; }
    const cx = Math.round((minX + maxX) / 2);
    const height = maxY - minY + 1;
    const headBottom = minY + Math.round(height * 0.24);
    return {
        bodyBbox: { minX, maxX, minY, maxY, centreX: cx, height },
        head: { minY, maxY: headBottom, centreX: cx, halfWidth: Math.max(8, Math.round((maxX - minX) * 0.22)) },
        face: { top: minY + 6, bottom: headBottom, cx, eyeY: minY + Math.round((headBottom - minY) * 0.45) },
        bands: { headBottom }
    };
}

function classifyAnchorsForFrame(config, bodyTemplate, direction, frameIndex) {
    const dirFrames = bodyTemplate.sheet[direction] || [];
    const frame = dirFrames[frameIndex];
    if (OUTFIT_ENGINE && typeof OUTFIT_ENGINE.debugClassifyFrame === 'function') {
        const style = config.style || 'looseleaf';
        const debugConfig = { style, tags: config.tags || [style], zones: {} };
        try {
            const debug = OUTFIT_ENGINE.debugClassifyFrame(debugConfig, frame, direction, bodyTemplate.palette || {}, frameIndex);
            if (debug && debug.anchors) return debug.anchors;
        } catch (_) {}
    }
    const anchors = fallbackAnalyze(frame);
    const skin = fallbackSkinLetters(bodyTemplate.palette || {});
    let top = Infinity, bottom = -1, sumX = 0, n = 0;
    for (let y = anchors.head.minY; y <= anchors.head.maxY; y++) {
        const row = frame[y] || '';
        for (let x = 0; x < rowWidth(row); x++) {
            if (!skin.has(String(rowAt(row, x)))) continue;
            top = Math.min(top, y); bottom = Math.max(bottom, y); sumX += x; n++;
        }
    }
    if (n) anchors.face = { top, bottom, cx: Math.round(sumX / n), eyeY: top + Math.round((bottom - top) * 0.42) };
    return anchors;
}

function anchorsFor(config, bodyTemplate, direction, frameIndex) {
    const current = classifyAnchorsForFrame(config, bodyTemplate, direction, frameIndex);
    const dirFrames = bodyTemplate.sheet[direction] || [];
    if ((direction !== 1 && direction !== 2) || !dirFrames[1] || frameIndex === 1) return current;

    const stable = classifyAnchorsForFrame(config, bodyTemplate, direction, 1);
    const merged = {
        ...current,
        bodyBbox: { ...(current.bodyBbox || {}), centreX: stable.bodyBbox && stable.bodyBbox.centreX },
        head: { ...(current.head || {}), centreX: stable.head && stable.head.centreX, halfWidth: stable.head && stable.head.halfWidth },
        face: { ...(current.face || {}), cx: stable.face && stable.face.cx }
    };
    for (const key of ['torso', 'belt', 'legs', 'boots']) {
        if (!current[key]) continue;
        merged[key] = {
            ...current[key],
            centreX: stable[key] && stable[key].centreX,
            halfWidth: stable[key] && stable[key].halfWidth,
            shoulderHalfWidth: key === 'torso' ? stable[key] && stable[key].shoulderHalfWidth : current[key].shoulderHalfWidth
        };
    }
    return merged;
}

function defaultConfig(style = 'looseleaf') {
    return {
        name: 'Layered Bob',
        category: 'hair',
        style,
        tags: [style, 'hair', 'procgen'],
        hairStyle: 'layered-bob',
        length: 'medium',
        color: 'chestnut',
        params: {
            bangs: true,
            sideLocks: true,
            backVolume: true,
            outline: true,
            eyeZoneX: 1,
            eyeZoneY: 7,
            eyeZoneWidth: 3,
            eyeZoneHeight: 5,
            lowerBanding: 3,
            lowerScraggle: 2
        }
    };
}

function paramNumber(config, key, fallback, min, max) {
    const value = Number(config && config.params && config.params[key]);
    return clamp(Number.isFinite(value) ? value : fallback, min, max);
}

function paletteFor(config = {}) {
    const color = COLORS[config.color] || COLORS.chestnut;
    return {
        O: { hex: color.outline, material: 'hair outline' },
        S: { hex: color.shadow, material: 'hair shadow' },
        B: { hex: color.base, material: 'hair base' },
        L: { hex: color.lit, material: 'hair light' },
        H: { hex: color.highlight, material: 'hair highlight' }
    };
}

function addPixel(pixels, x, y, letter) {
    pixels.set(`${Math.round(x)},${Math.round(y)}`, letter);
}

function erasePixel(pixels, x, y) {
    pixels.delete(`${Math.round(x)},${Math.round(y)}`);
}

function addSpan(pixels, x0, x1, y, letter) {
    const a = Math.round(Math.min(x0, x1));
    const b = Math.round(Math.max(x0, x1));
    for (let x = a; x <= b; x++) addPixel(pixels, x, y, letter);
}

function eraseSpan(pixels, x0, x1, y) {
    const a = Math.round(Math.min(x0, x1));
    const b = Math.round(Math.max(x0, x1));
    for (let x = a; x <= b; x++) erasePixel(pixels, x, y);
}

function addShapeStroke(pixels) {
    const keys = Array.from(pixels.keys());
    if (!keys.length) return;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const key of keys) {
        const [x, y] = key.split(',').map(Number);
        minX = Math.min(minX, x); minY = Math.min(minY, y);
        maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
    }
    minX -= 2; minY -= 2; maxX += 2; maxY += 2;
    const occupied = new Set(keys);
    const outside = new Set();
    const queue = [[minX, minY]];
    outside.add(`${minX},${minY}`);
    for (let qi = 0; qi < queue.length; qi++) {
        const [x, y] = queue[qi];
        for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
            const nx = x + dx, ny = y + dy;
            if (nx < minX || nx > maxX || ny < minY || ny > maxY) continue;
            const nk = `${nx},${ny}`;
            if (outside.has(nk) || occupied.has(nk)) continue;
            outside.add(nk);
            queue.push([nx, ny]);
        }
    }
    for (const key of keys) {
        const [x, y] = key.split(',').map(Number);
        for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
            const k = `${x + dx},${y + dy}`;
            if (occupied.has(k) || !outside.has(k)) continue;
            pixels.set(k, 'O');
            occupied.add(k);
        }
    }
}

function shadeLetter(localX, half, rowT, direction, backView) {
    const side = half ? Math.abs(localX) / half : 0;
    if (side > 0.82) return 'S';
    if (backView && Math.abs(localX) <= 1 && rowT > 0.16) return 'S';
    if (!backView && localX < -half * 0.35 && direction !== 2) return 'L';
    if (!backView && localX > half * 0.35 && direction !== 1) return 'S';
    if (rowT < 0.18 && side < 0.42) return 'H';
    if (side < 0.28 && rowT < 0.55) return 'L';
    return 'B';
}

function strandLetter(stepT, sideT, paletteShift = 0) {
    if (sideT > 0.76) return 'S';
    if (sideT < 0.20 && stepT < 0.34 && paletteShift % 2 === 0) return 'H';
    if (sideT < 0.46) return 'L';
    if (stepT > 0.74 && sideT > 0.48) return 'S';
    return 'B';
}

function addTaperedStrand(pixels, x0, y0, x1, y1, w0, w1, opts = {}) {
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))));
    const bow = Number(opts.bow || 0);
    const phase = Number(opts.phase || 0);
    for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const curve = Math.sin(t * Math.PI) * bow;
        const x = x0 + (x1 - x0) * t + curve;
        const y = y0 + (y1 - y0) * t;
        const w = Math.max(0, Math.round(w0 + (w1 - w0) * t));
        for (let dx = -w; dx <= w; dx++) {
            const sideT = Math.abs(dx) / Math.max(1, w + 0.5);
            addPixel(pixels, x + dx, y, strandLetter(t, sideT, phase + dx));
        }
        if (opts.tip && i === steps) addPixel(pixels, x, y + 1, 'S');
    }
}

function addTaperedSpike(pixels, x0, y0, x1, y1, w0, opts = {}) {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy))));
    const len = Math.max(1, Math.hypot(dx, dy));
    const nx = -dy / len;
    const ny = dx / len;
    const bow = Number(opts.bow || 0);
    const phase = Number(opts.phase || 0);
    for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const curve = Math.sin(t * Math.PI) * bow;
        const x = x0 + dx * t + nx * curve;
        const y = y0 + dy * t + ny * curve;
        const w = Math.max(0, Math.round(w0 * (1 - t)));
        for (let n = -w; n <= w; n++) {
            const sideT = Math.abs(n) / Math.max(1, w + 0.5);
            addPixel(pixels, x + nx * n, y + ny * n, strandLetter(t, sideT, phase + n));
        }
    }
    if (opts.tip) addPixel(pixels, x1, y1, 'S');
}

function spikyLengthScale(config = {}) {
    if (config.length === 'long') return 1.55;
    if (config.length === 'medium') return 1.18;
    return 0.88;
}

function addShortSpikyTufts(pixels, cx, top, eyeY, half, direction, frameIndex, side, back, sway = 0, config = {}) {
    const tipSway = frameIndex === 0 ? -1 : frameIndex === 2 ? 1 : 0;
    const walkSway = frameIndex === 0 ? -1 : frameIndex === 2 ? 1 : 0;
    const spikeScale = spikyLengthScale(config);
    const crownScale = config.length === 'long' ? 0.90 : config.length === 'medium' ? 0.86 : 0.82;
    const scaled = (rootU, tipU, rootDy, tipDy) => [
        rootU + (tipU - rootU) * crownScale,
        rootDy + (tipDy - rootDy) * crownScale
    ];
    if (side) {
        const faceSign = direction === 1 ? -1 : 1;
        const rowCx = cx + sway;
        const spikes = [
            [-0.82, -1.10, 6, -3, 3],
            [-0.50, -0.72, 3, -6, 4],
            [-0.14, -0.22, 1, -6, 5],
            [0.22, 0.36, 4, -2, 2]
        ];
        for (const [rootU, tipU, rootDy, tipDy, phase] of spikes) {
            const [scaledTipU, scaledTipDy] = scaled(rootU, tipU, rootDy, tipDy);
            addTaperedSpike(pixels, rowCx + faceSign * Math.round(half * rootU), top + rootDy, rowCx + faceSign * Math.round(half * scaledTipU) + faceSign * tipSway, top + Math.round(scaledTipDy), 3, { bow: faceSign * 0.8 * crownScale, phase, tip: true });
        }
        addClippedHighlightLane(pixels, rowCx - faceSign * Math.round(half * 0.30), top + 3, rowCx - faceSign * Math.round(half * 0.58), eyeY + 2, -faceSign * 0.7, 1);
        return;
    }

    const spikes = back
        ? [[-0.80, -1.02, 6, -1, 1], [-0.48, -0.64, 3, -6, 2], [-0.14, -0.18, 1, -7, 3], [0.18, 0.24, 1, -7, 4], [0.52, 0.70, 3, -6, 5], [0.84, 1.08, 6, -1, 6]]
        : [[-0.82, -1.04, 6, -1, 1], [-0.54, -0.68, 3, -6, 2], [-0.22, -0.26, 1, -7, 3], [0.12, 0.16, 1, -7, 4], [0.44, 0.58, 3, -6, 5], [0.74, 0.96, 6, -1, 6]];
    for (const [rootU, tipU, rootDy, tipDy, phase] of spikes) {
        const [scaledTipU, scaledTipDy] = scaled(rootU, tipU, rootDy, tipDy);
        addTaperedSpike(pixels, cx + Math.round(half * rootU), top + rootDy, cx + Math.round(half * scaledTipU) + tipSway, top + Math.round(scaledTipDy), 3, { bow: (tipU - rootU) * 1.8 * crownScale, phase, tip: true });
    }
    addClippedHighlightLane(pixels, cx - Math.round(half * 0.36), top + 4, cx - Math.round(half * 0.62), eyeY - 1, -0.8, 1);
    addClippedHighlightLane(pixels, cx + Math.round(half * 0.30), top + 4, cx + Math.round(half * 0.54), eyeY - 2, 0.8, 3);
}

function addShortSpikyEdgeTeeth(pixels, cx, top, eyeY, massBottom, half, direction, side, back, sway, config = {}) {
    const lengthScale = spikyLengthScale(config);
    const faceSign = direction === 1 ? -1 : 1;
    const signs = side ? [-faceSign, faceSign] : [-1, 1];
    const y0 = top + 7;
    const y1 = massBottom;

    for (let y = y0; y <= y1; y++) {
        const local = y - y0;
        const depth = local % 6 === 0 ? 3 : local % 6 === 1 || local % 6 === 5 ? 2 : local % 6 === 2 || local % 6 === 4 ? 1 : 0;
        if (!depth) continue;
        for (const sign of signs) {
            if (side && sign === faceSign && y > eyeY + 4) continue;
            const edge = rowOuterEdge(pixels, y, sign);
            if (edge == null) continue;
            for (let d = 0; d < depth; d++) erasePixel(pixels, edge - sign * d, y);
        }
    }

    for (const sign of signs) {
        const startY = top + (side && sign === faceSign ? 8 : 10);
        const endY = side && sign === faceSign ? Math.min(eyeY + 4, massBottom - 3) : massBottom - 3;
        for (let y = startY; y <= endY; y += 5) {
            const edge = rowOuterEdge(pixels, y, sign);
            if (edge == null) continue;
            const tipLen = Math.round((2.5 + lengthScale * 2.2) * (y < eyeY ? 1.0 : 0.75));
            const tipY = y + ((y + sign) % 2 === 0 ? -2 : 2);
            addTaperedStrand(pixels, edge - sign, y, edge + sign * tipLen, tipY, 2, 0, { bow: sign * 0.7, phase: y, tip: true });
        }
    }

    void lengthScale;
}

function carveShortSpikyLowerSeparations(pixels, cx, eyeY, massBottom, half, direction, side, back, sway) {
    const faceSign = direction === 1 ? -1 : 1;
    if (side) {
        const backSign = -faceSign;
        for (const offset of [0.34, 0.58]) {
            const baseX = cx + sway + backSign * Math.round(half * offset);
            for (let y = eyeY + 7; y <= massBottom + 2; y++) {
                const t = clamp((y - (eyeY + 7)) / Math.max(1, massBottom - eyeY - 5), 0, 1);
                const gap = Math.round(1 + t * 2);
                for (let d = 0; d <= gap; d++) erasePixel(pixels, baseX + backSign * d, y);
            }
        }
        return;
    }

    const gaps = back ? [-0.58, -0.30, 0, 0.30, 0.58] : [-0.72, -0.52, 0.52, 0.72];
    for (const pos of gaps) {
        const gx = cx + Math.round(half * pos);
        for (let y = eyeY + 5; y <= massBottom + 2; y++) {
            const t = clamp((y - (eyeY + 5)) / Math.max(1, massBottom - eyeY - 3), 0, 1);
            const gap = Math.round(t * (back ? 2.4 : 1.8));
            for (let d = -gap; d <= gap; d++) erasePixel(pixels, gx + d, y);
        }
    }
}

function carveShortSpikyBrowTeeth(pixels, cx, eyeY, half) {
    for (const pos of [-0.68, -0.48, -0.28, -0.10, 0.10, 0.28, 0.48, 0.68]) {
        const gx = cx + Math.round(half * pos);
        for (let y = eyeY - 3; y <= eyeY + 2; y++) {
            const t = clamp((y - (eyeY - 3)) / 5, 0, 1);
            const gap = Math.round(t * 2);
            for (let d = -gap; d <= gap; d++) erasePixel(pixels, gx + d, y);
        }
    }
}

function trimShortSpikyExcessLength(pixels, eyeY, direction, config = {}) {
    const side = direction === 1 || direction === 2;
    const back = direction === 3;
    const allowance = config.length === 'long' ? 15 : config.length === 'medium' ? 12 : 9;
    const maxY = eyeY + allowance + (side ? 3 : back ? 2 : 0);
    for (const key of Array.from(pixels.keys())) {
        const [, y] = key.split(',').map(Number);
        if (y > maxY) pixels.delete(key);
    }
}

function removeIsolatedShortSpikyPixels(pixels) {
    const original = new Map(pixels);
    for (const key of original.keys()) {
        const [x, y] = key.split(',').map(Number);
        let neighbours = 0;
        for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
                if (dx === 0 && dy === 0) continue;
                if (original.has(`${x + dx},${y + dy}`)) neighbours++;
            }
        }
        if (neighbours <= 1) pixels.delete(key);
    }
}

function removeSmallShortSpikyComponents(pixels) {
    const remaining = new Set(pixels.keys());
    const components = [];
    while (remaining.size) {
        const start = remaining.values().next().value;
        const stack = [start];
        const component = [];
        remaining.delete(start);
        while (stack.length) {
            const key = stack.pop();
            component.push(key);
            const [x, y] = key.split(',').map(Number);
            for (let dy = -1; dy <= 1; dy++) {
                for (let dx = -1; dx <= 1; dx++) {
                    if (dx === 0 && dy === 0) continue;
                    const nkey = `${x + dx},${y + dy}`;
                    if (!remaining.has(nkey)) continue;
                    remaining.delete(nkey);
                    stack.push(nkey);
                }
            }
        }
        components.push(component);
    }
    if (components.length <= 1) return;
    components.sort((a, b) => b.length - a.length);
    const largest = components[0].length;
    for (const component of components.slice(1)) {
        if (component.length > Math.max(10, largest * 0.08)) continue;
        for (const key of component) pixels.delete(key);
    }
}

function carveShortSpikyClumpSeparations(pixels, cx, top, eyeY, massBottom, half, direction, side, back, sway, config = {}) {
    const scraggle = Math.round(paramNumber(config, 'lowerScraggle', 2, 0, 5));
    const edgeLetter = scraggle >= 3 ? 'O' : 'S';
    if (side) {
        const faceSign = direction === 1 ? -1 : 1;
        const backSign = -faceSign;
        const rowCx = cx + sway;
        for (const [sign, rows] of [[backSign, [top + 6, top + 10, top + 14, eyeY + 2, eyeY + 6, massBottom - 4].slice(0, 2 + scraggle)], [faceSign, [top + 8, top + 13, eyeY + 1].slice(0, Math.max(1, scraggle - 1))]]) {
            for (const y of rows) {
                const edge = rowOuterEdge(pixels, y, sign);
                if (edge == null) continue;
                const depth = sign === backSign ? 3 : 2;
                for (let d = 0; d <= depth; d++) erasePixel(pixels, edge - sign * d, y);
                for (let d = 0; d < depth; d++) erasePixel(pixels, edge - sign * d, y + 1);
                setIfHair(pixels, edge - sign * (depth + 1), y, edgeLetter);
                setIfHair(pixels, edge - sign * depth, y + 1, edgeLetter);
            }
        }
        return;
    }

    for (const pos of [-0.42, 0, 0.42].slice(0, 1 + Math.ceil(scraggle / 2))) {
        const gx = cx + Math.round(half * pos);
        for (let i = 0; i < 3 + scraggle; i++) setIfHair(pixels, gx, top + 3 + i, edgeLetter);
    }

    if (back) {
        for (const sign of [-1, 1]) {
            for (const y of [top + 12, top + 16, top + 20, eyeY + 4, eyeY + 8, massBottom - 4].slice(0, 2 + scraggle)) {
                const edge = rowOuterEdge(pixels, y, sign);
                if (edge == null) continue;
                const depth = 3;
                for (let d = 0; d <= depth; d++) erasePixel(pixels, edge - sign * d, y);
                for (let d = 0; d < depth; d++) erasePixel(pixels, edge - sign * d, y + 1);
                setIfHair(pixels, edge - sign * (depth + 1), y, edgeLetter);
                setIfHair(pixels, edge - sign * depth, y + 1, edgeLetter);
            }
        }

        for (const pos of [-0.50, -0.24, 0.24, 0.50].slice(0, Math.max(1, scraggle))) {
            const gx = cx + Math.round(half * pos);
            for (let y = massBottom - 4; y <= massBottom + Math.min(2, scraggle); y++) setIfHair(pixels, gx, y, edgeLetter);
        }
    }
}

function addShortSpikySurfaceTexture(pixels, cx, top, eyeY, massBottom, half, direction, side, back, sway, config = {}) {
    const banding = Math.round(paramNumber(config, 'lowerBanding', 3, 0, 5));
    const scraggle = Math.round(paramNumber(config, 'lowerScraggle', 2, 0, 5));
    const seamLetter = scraggle >= 2 ? 'O' : 'S';
    const accentLetter = scraggle >= 2 ? 'O' : 'S';

    if (side) {
        const faceSign = direction === 1 ? -1 : 1;
        const backSign = -faceSign;
        const rowCx = cx + sway;
        const rearTriangles = [[top + 9, 7, 4], [top + 13, 9, 5], [eyeY + 1, 10, 5], [eyeY + 5, 8, 4], [eyeY + 8, 6, 3]];
        for (const [tipY, depth, height] of rearTriangles.slice(0, 2 + scraggle)) {
            const edge = rowOuterEdge(pixels, tipY, backSign);
            if (edge == null) continue;
            const tipX = edge - backSign;
            const baseX = edge - backSign * depth;
            addClippedCurvedLine(pixels, baseX, tipY - height, tipX, tipY, seamLetter, backSign * 0.2, 0);
            addClippedCurvedLine(pixels, baseX, tipY + height, tipX, tipY, seamLetter, -backSign * 0.2, 0);
            if (banding > 1) addClippedCurvedLine(pixels, baseX - backSign * 2, tipY - Math.round(height * 0.35), tipX - backSign, tipY + Math.round(height * 0.25), banding > 3 ? 'H' : 'L', backSign * 0.15, 2);
        }
        const faceTriangles = [[top + 10, 4, 3], [top + 15, 5, 3], [eyeY + 2, 4, 3]];
        for (const [tipY, depth, height] of faceTriangles.slice(0, Math.max(1, scraggle - 1))) {
            const edge = rowOuterEdge(pixels, tipY, faceSign);
            if (edge == null) continue;
            const tipX = edge - faceSign;
            const baseX = edge - faceSign * depth;
            addClippedCurvedLine(pixels, baseX, tipY - height, tipX, tipY, seamLetter, faceSign * 0.2, 0);
            addClippedCurvedLine(pixels, baseX, tipY + height, tipX, tipY, seamLetter, -faceSign * 0.2, 0);
        }
        for (const [rootDy, tipDy, reach, width] of [[5, -2, 0.30, 2], [9, 1, 0.26, 2], [13, 3, 0.20, 1]]) {
            const rootX = rowCx + faceSign * Math.round(half * 0.02);
            const rootY = top + rootDy;
            addTaperedSpike(pixels, rootX, rootY, rowCx + faceSign * Math.round(half * reach), rootY + tipDy, width, { bow: faceSign * 0.25, phase: rootDy, tip: true });
        }
        const capTriangles = [
            [top + 10, 0.16, 0.58, -3, 4],
            [top + 15, 0.10, 0.72, -1, 5],
            [eyeY + 1, 0.04, 0.78, 2, 5],
            [eyeY + 5, 0.14, 0.66, 4, 4]
        ];
        for (const [baseY, baseU, tipU, tipDy, height] of capTriangles.slice(0, 2 + scraggle)) {
            const baseX = rowCx + backSign * Math.round(half * baseU);
            const tipX = rowCx + backSign * Math.round(half * tipU);
            const tipY = baseY + tipDy;
            addClippedCurvedLine(pixels, baseX, baseY - height, tipX, tipY, seamLetter, backSign * 0.35, 0);
            addClippedCurvedLine(pixels, baseX, baseY + height, tipX, tipY, seamLetter, -backSign * 0.25, 0);
            if (banding > 2) addClippedCurvedLine(pixels, baseX + backSign * 2, baseY, tipX - backSign * 2, tipY, banding > 3 ? 'H' : 'L', backSign * 0.2, 2);
        }
        if (banding > 0) {
            for (const [tipY, depth, height] of rearTriangles.slice(0, Math.min(rearTriangles.length, banding))) {
                const edge = rowOuterEdge(pixels, tipY, backSign);
                if (edge == null) continue;
                const rootX = edge - backSign * Math.max(3, Math.round(depth * 0.55));
                addClippedCurvedLine(pixels, rootX, tipY - Math.round(height * 0.35), rootX - backSign * 3, tipY + Math.round(height * 0.45), banding > 3 ? 'H' : 'L', backSign * 0.2, 2);
            }
        }
        return;
    }

    if (back) {
        const sideTriangles = [[top + 10, 6, 4], [top + 15, 8, 5], [eyeY + 1, 9, 5], [eyeY + 6, 8, 4]];
        for (const sign of [-1, 1]) {
            for (const [tipY, depth, height] of sideTriangles.slice(0, 1 + scraggle)) {
                const edge = rowOuterEdge(pixels, tipY, sign);
                if (edge == null) continue;
                const tipX = edge - sign;
                const baseX = edge - sign * depth;
                addClippedCurvedLine(pixels, baseX, tipY - height, tipX, tipY, seamLetter, sign * 0.2, 0);
                addClippedCurvedLine(pixels, baseX, tipY + height, tipX, tipY, seamLetter, -sign * 0.2, 0);
            }
        }
        const crownTriangles = [-0.54, -0.28, 0, 0.28, 0.54].slice(0, 3 + Math.min(2, scraggle));
        for (const pos of crownTriangles) {
            const x = cx + Math.round(half * pos);
            const sign = pos === 0 ? 1 : Math.sign(pos);
            addClippedCurvedLine(pixels, x - sign * 3, top + 8, x, top + 3, accentLetter, sign * 0.2, 0);
            addClippedCurvedLine(pixels, x + sign * 3, top + 8, x, top + 3, accentLetter, -sign * 0.2, 0);
            if (scraggle > 1) addClippedCurvedLine(pixels, x - sign * 4, eyeY + 4, x, eyeY - 1, seamLetter, sign * 0.2, 1);
            if (scraggle > 3) addClippedCurvedLine(pixels, x + sign * 4, eyeY + 4, x, eyeY - 1, seamLetter, -sign * 0.2, 1);
        }
        for (const pos of [-0.40, -0.14, 0.14, 0.40]) {
            if (scraggle < 2 && Math.abs(pos) < 0.2) continue;
            const x = cx + Math.round(half * pos);
            const sign = Math.sign(pos);
            addClippedCurvedLine(pixels, x - sign * 3, eyeY + 8, x, eyeY + 1, seamLetter, sign * 0.2, 0);
            if (scraggle > 2) addClippedCurvedLine(pixels, x + sign * 2, eyeY + 8, x, eyeY + 1, seamLetter, -sign * 0.2, 0);
            if (scraggle > 3) addClippedCurvedLine(pixels, x - sign * 2, massBottom - 1, x, eyeY + 5, seamLetter, sign * 0.2, 1);
        }
        if (banding > 0) {
            const accents = [-0.56, -0.32, -0.08, 0.18, 0.42, 0.62].slice(0, Math.min(6, banding + 1));
            for (const pos of accents) {
                const x = cx + Math.round(half * pos);
                const sign = pos < 0 ? -1 : 1;
                addClippedCurvedLine(pixels, x, top + 8, x + sign * 2, eyeY + 2, banding > 3 ? 'H' : 'L', sign * 0.25, 2);
                if (banding > 3) addClippedCurvedLine(pixels, x + sign * 2, eyeY + 5, x + sign * 4, massBottom - 3, 'L', sign * 0.2, 3);
            }
        }
        return;
    }

    const frontTriangles = [-0.62, -0.36, -0.10, 0.16, 0.42, 0.66].slice(0, 3 + scraggle);
    for (const pos of frontTriangles) {
        const x0 = cx + Math.round(half * pos);
        const sign = pos < 0 ? -1 : 1;
        addClippedCurvedLine(pixels, x0 - sign * 3, top + 9, x0, top + 3, accentLetter, sign * 0.2, 0);
        addClippedCurvedLine(pixels, x0 + sign * 3, top + 9, x0, top + 3, accentLetter, -sign * 0.2, 0);
        if (scraggle > 1) addClippedCurvedLine(pixels, x0 - sign * 4, eyeY - 1, x0, top + 6, seamLetter, sign * 0.2, 2);
    }
    if (banding > 0) {
        const accents = [-0.58, -0.34, -0.12, 0.16, 0.40, 0.62].slice(0, Math.min(6, banding + 1));
        for (const pos of accents) {
            const x = cx + Math.round(half * pos);
            const sign = pos < 0 ? -1 : 1;
            addClippedCurvedLine(pixels, x, top + 7, x + sign * 2, eyeY - 2, banding > 3 ? 'H' : 'L', sign * 0.25, 2);
        }
    }
}

function fillShortSpikyCrownBase(pixels, cx, top, eyeY, half, side, back) {
    const y0 = top + 2;
    const y1 = side ? eyeY + 2 : eyeY - 1;
    for (let y = y0; y <= y1; y++) {
        const bounds = rowHairBounds(pixels, y);
        if (!bounds) continue;
        const inset = side ? 1 : Math.max(1, Math.round(half * 0.08));
        for (let x = bounds.minX + inset; x <= bounds.maxX - inset; x++) {
            const key = `${x},${y}`;
            if (!pixels.has(key)) pixels.set(key, back && Math.abs(x - cx) < half * 0.28 ? 'B' : 'L');
        }
    }
}

function addShortSpikyPerimeterSpikes(pixels, cx, top, eyeY, massBottom, half, direction, side, back, sway, config = {}) {
    const sideReach = config.length === 'long' ? 6 : config.length === 'medium' ? 5 : 4;
    const lowerReach = config.length === 'long' ? 8 : config.length === 'medium' ? 3 : 0;
    if (back) {
        const sideSpikes = [
            [top + 11, -5, sideReach - 1],
            [top + 15, -3, sideReach],
            [top + 19, -1, sideReach + 1],
            [eyeY + 4, 2, sideReach],
            [massBottom - 5, 4, Math.max(3, sideReach - 1)]
        ];
        for (const sign of [-1, 1]) {
            for (const [y, tipDy, reach] of sideSpikes) {
                const edge = rowOuterEdge(pixels, y, sign);
                if (edge == null) continue;
                addTaperedSpike(pixels, edge - sign, y, edge + sign * reach, y + tipDy, 2, { bow: sign * 0.25, phase: y, tip: true });
            }

            for (const y of [top + 15, top + 21, eyeY + 5, massBottom - 7, massBottom - 3]) {
                const edge = rowOuterEdge(pixels, y, sign);
                if (edge == null) continue;
                for (let notch = 0; notch <= 2; notch++) {
                    erasePixel(pixels, edge - sign * notch, y);
                    if (notch < 2 && y < massBottom - 2) erasePixel(pixels, edge - sign * notch, y + 1);
                }
            }
        }

        const napeReach = config.length === 'long' ? lowerReach : config.length === 'medium' ? 5 : 3;
        const lowerValleys = [-0.48, -0.18, 0.18, 0.48];
        for (const pos of lowerValleys) {
            const gx = cx + Math.round(half * pos);
            for (let y = massBottom - 3; y <= massBottom + Math.min(4, napeReach); y++) {
                erasePixel(pixels, gx, y);
                if (y > massBottom - 1) erasePixel(pixels, gx + Math.sign(pos), y);
            }
        }

        for (const pos of [-0.62, -0.34, 0, 0.34, 0.62]) {
            const rootX = cx + Math.round(half * pos);
            const lean = pos === 0 ? 0 : Math.sign(pos) * Math.max(1, Math.round(napeReach * 0.28));
            addTaperedSpike(pixels, rootX, massBottom - 5, rootX + lean, massBottom + napeReach, 3, { bow: lean * 0.15, phase: Math.round(pos * 10), tip: true });
        }
        return;
    }

    if (side) {
        const faceSign = direction === 1 ? -1 : 1;
        const backSign = -faceSign;
        const rearFan = [
            [top + 7, -6, Math.max(3, sideReach - 1)],
            [top + 11, -4, sideReach],
            [top + 15, -2, sideReach],
            [eyeY + 3, 3, Math.max(3, sideReach - 1)],
            [massBottom - 5, 5, Math.max(2, sideReach - 2)]
        ];
        for (const [y, tipDy, reach] of rearFan) {
            const edge = rowOuterEdge(pixels, y, backSign);
            if (edge == null) continue;
            addTaperedSpike(pixels, edge - backSign, y, edge + backSign * reach, y + tipDy, 2, { bow: backSign * 0.25, phase: y, tip: true });
        }

        for (const y of [top + 10, top + 15, eyeY + 3, eyeY + 7, massBottom - 3]) {
            const edge = rowOuterEdge(pixels, y, backSign);
            if (edge == null) continue;
            erasePixel(pixels, edge, y);
            erasePixel(pixels, edge - backSign, y + 1);
        }

    }
}

function shortSpikySilhouetteProfile(y, top, eyeY, massBottom, side, back) {
    const local = y - top;
    if (side) {
        const rear = [0, 1, 3, 2, -1, 2, 4, 1, -2, 2, 3, 0, -1, 2, 1, -1, 0, 1][Math.abs(local) % 18];
        const face = local < 12 ? [0, 1, 0, -1, 1, 0][Math.abs(local) % 6] : 0;
        return { rear, face };
    }
    if (back) {
        const rear = [0, 1, 3, 2, -1, 2, 4, 1, -2, 2, 3, 1, -1, 2, 1, -1, 0, 1][Math.abs(local) % 18];
        const face = [1, 0, 2, 3, 0, -1, 2, 1, -2, 2, 3, 0, -1, 2, 1, 0][Math.abs(local + 5) % 16];
        return { rear, face };
    }
    return { rear: 0, face: 0 };
}

function addShortSpikyStyleHairMass(pixels, anchors, config, direction, frameIndex) {
    const head = anchors.head || {};
    const face = anchors.face || {};
    const side = direction === 1 || direction === 2;
    const back = direction === 3;
    const faceSign = direction === 1 ? -1 : 1;
    const cx = Math.round(Number.isFinite(face.cx) ? face.cx : head.centreX || 72);
    const eyeY = Math.round(Number.isFinite(face.eyeY) ? face.eyeY : (face.top || head.minY || 24) + 8) + (side ? 3 : 0);
    const top = Math.round((head.minY || 18) - 1 + (side ? 2 : 0));
    const half = Math.max(7, Math.round((head.halfWidth || 10) + (side ? 3 : 1)));
    const lengthScale = spikyLengthScale(config);
    const lengthExtra = config.length === 'long' ? 4 : config.length === 'medium' ? 2 : 0;
    const massBottom = eyeY + (side ? 6 : back ? 8 : 5) + lengthExtra;
    const sway = side ? (direction === 1 ? -2 : 0) : 0;
    const rowCx = cx + sway;

    for (let y = top; y <= massBottom; y++) {
        const t = (y - top) / Math.max(1, massBottom - top);
        const crown = t < 0.24 ? 0.48 + t * 2.15 : 1;
        let backHalf;
        let faceHalf;
        if (side) {
            backHalf = Math.round(half * (0.94 - Math.max(0, t - 0.48) * 0.48) * crown);
            faceHalf = Math.round(half * (0.30 - Math.max(0, t - 0.22) * 0.82) * crown);
        } else {
            const base = Math.round(half * (0.88 - Math.max(0, t - 0.46) * 0.54) * crown);
            backHalf = base;
            faceHalf = base;
        }
        const profile = shortSpikySilhouetteProfile(y, top, eyeY, massBottom, side, back);
        backHalf += profile.rear;
        faceHalf += profile.face;
        backHalf = Math.max(2, backHalf);
        faceHalf = Math.max(side ? -1 : 2, faceHalf);
        for (let u = -backHalf; u <= faceHalf; u++) {
            const x = side ? rowCx + faceSign * u : rowCx + u;
            const local = side ? u : x - rowCx;
            const width = side ? backHalf + Math.max(1, faceHalf) : Math.max(backHalf, faceHalf);
            if (!side && !back && y >= eyeY - 2) {
                const openT = clamp((y - (eyeY - 2)) / 8, 0, 1);
                const openHalf = Math.round(half * (0.32 + openT * 0.30));
                if (Math.abs(local) <= openHalf) continue;
            }
            if (side && y >= eyeY - 2 && local > Math.round(half * 0.08)) continue;
            if (side && y >= eyeY + 2 && local > -Math.round(half * 0.18)) continue;
            if (side && y >= eyeY + 5 && local > -Math.round(half * 0.34)) continue;
            const edge = u <= -backHalf + 1 || u >= faceHalf - 1 || t > 0.82;
            let letter = shadeLetter(local, width, t, direction, back);
            if (edge) letter = 'S';
            else if (t < 0.30 && Math.abs(local) < width * 0.34) letter = 'H';
            else if (Math.abs(local) < width * 0.58) letter = 'L';
            addPixel(pixels, x, y, letter);
        }
    }

    addShortSpikyTufts(pixels, cx, top, eyeY, half, direction, frameIndex, side, back, sway, config);

    if (!back && (!config.params || config.params.bangs !== false)) {
        if (side) {
            const sideFringe = [
                [0.02, 0.54, 5, -4, 3, 1],
                [-0.06, 0.42, 8, -1, 2, 2],
                [0.10, 0.62, 10, 2, 2, 3]
            ];
            for (const [rootU, tipU, rootDy, tipDy, width, phase] of sideFringe) {
                addTaperedSpike(pixels, rowCx + faceSign * Math.round(half * rootU), top + rootDy, rowCx + faceSign * Math.round(half * tipU), top + tipDy, width, { bow: faceSign * 0.35, phase, tip: true });
            }
            addClippedCurvedLine(pixels, rowCx + faceSign * Math.round(half * 0.04), top + 8, rowCx + faceSign * Math.round(half * 0.50), eyeY - 3, 'O', faceSign * 0.35, 0);
        } else {
            const fringe = [
                [-0.42, -0.52, 7, -1, -0.7, 1],
                [-0.12, -0.18, 6, -2, -0.4, 2],
                [0.18, 0.26, 6, -2, 0.4, 3],
                [0.48, 0.60, 8, 0, 0.7, 4]
            ];
            for (const [rootU, tipU, rootDy, tipDy, bow, phase] of fringe) {
                addTaperedStrand(pixels, rowCx + Math.round(half * rootU), top + rootDy, rowCx + Math.round(half * tipU), eyeY + tipDy, 3, 0, { bow, phase, tip: true });
            }
        }
    }

    if (!back && (!config.params || config.params.sideLocks !== false)) {
        if (side) {
            const rootX = rowCx - faceSign * Math.round(half * 0.68);
            addTaperedSpike(pixels, rootX, eyeY - 2, rootX - faceSign * Math.round(half * 0.30), eyeY + 1, 2, { bow: -faceSign * 0.25, phase: 5, tip: true });
        } else {
            for (const sideSign of [-1, 1]) {
                const rootX = rowCx + sideSign * Math.round(half * 0.76);
                addTaperedStrand(pixels, rootX, eyeY - 2, rootX + sideSign * Math.round(half * (0.16 + lengthScale * 0.08)), eyeY + Math.round(3 + lengthScale * 2), 2, 0, { bow: sideSign * 0.7, phase: sideSign < 0 ? 2 : 5, tip: true });
            }
        }
    }

    addShortSpikyPerimeterSpikes(pixels, cx, top, eyeY, massBottom, half, direction, side, back, sway, config);

    if (!side && !back) {
        for (let y = eyeY - 1; y <= massBottom + 1; y++) {
            const t = clamp((y - (eyeY - 1)) / Math.max(1, massBottom - eyeY + 2), 0, 1);
            const openHalf = Math.round(half * (0.34 + t * 0.34));
            for (let x = rowCx - openHalf; x <= rowCx + openHalf; x++) erasePixel(pixels, x, y);
        }
    }

    fillSmallInteriorHairGaps(pixels);
    fillShortSpikyCrownBase(pixels, cx, top, eyeY, half, side, back);
    softenHairNoise(pixels);
    carveShortSpikyClumpSeparations(pixels, cx, top, eyeY, massBottom, half, direction, side, back, sway, config);
    addShortSpikySurfaceTexture(pixels, cx, top, eyeY, massBottom, half, direction, side, back, sway, config);
    if (!side && !back && (!config.params || config.params.bangs !== false)) {
        for (const [rootU, tipU, rootDy, tipDy, phase] of [[-0.48, -0.58, 8, -2, 1], [-0.18, -0.24, 7, -3, 2], [0.18, 0.24, 7, -3, 3], [0.48, 0.58, 8, -2, 4]]) {
            addTaperedSpike(pixels, rowCx + Math.round(half * rootU), top + rootDy, rowCx + Math.round(half * tipU), eyeY + tipDy, 2, { bow: (tipU - rootU) * 1.2, phase, tip: true });
        }
    }
    removeIsolatedShortSpikyPixels(pixels);
    removeSmallShortSpikyComponents(pixels);
    trimShortSpikyExcessLength(pixels, eyeY, direction, config);
}

function addBrokenHighlight(pixels, x0, y0, x1, y1, phase = 0) {
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))));
    for (let i = 0; i <= steps; i++) {
        if ((i + phase) % 3 === 1) continue;
        const t = i / steps;
        addPixel(pixels, x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, (i + phase) % 5 === 0 ? 'H' : 'L');
    }
}

function addCurvedLine(pixels, x0, y0, x1, y1, letter, bow = 0, skip = 0) {
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))));
    for (let i = 0; i <= steps; i++) {
        if (skip && i % skip === skip - 1) continue;
        const t = i / steps;
        const x = x0 + (x1 - x0) * t + Math.sin(t * Math.PI) * bow;
        const y = y0 + (y1 - y0) * t;
        addPixel(pixels, x, y, letter);
    }
}

function addHighlightLane(pixels, x0, y0, x1, y1, bow = 0, phase = 0) {
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))));
    for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const x = x0 + (x1 - x0) * t + Math.sin(t * Math.PI) * bow;
        const y = y0 + (y1 - y0) * t;
        addPixel(pixels, x, y, (i + phase) % 7 === 0 ? 'H' : 'L');
    }
}

function setIfHair(pixels, x, y, letter) {
    const key = `${Math.round(x)},${Math.round(y)}`;
    if (pixels.has(key)) pixels.set(key, letter);
}

function addClippedCurvedLine(pixels, x0, y0, x1, y1, letter, bow = 0, skip = 0) {
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))));
    for (let i = 0; i <= steps; i++) {
        if (skip && i % skip === skip - 1) continue;
        const t = i / steps;
        const x = x0 + (x1 - x0) * t + Math.sin(t * Math.PI) * bow;
        const y = y0 + (y1 - y0) * t;
        setIfHair(pixels, x, y, letter);
    }
}

function addClippedHighlightLane(pixels, x0, y0, x1, y1, bow = 0, phase = 0) {
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))));
    for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const x = x0 + (x1 - x0) * t + Math.sin(t * Math.PI) * bow;
        const y = y0 + (y1 - y0) * t;
        setIfHair(pixels, x, y, (i + phase) % 7 === 0 ? 'H' : 'L');
    }
}

function addMirroredLanes(pixels, cx, y0, y1, startOffset, endOffset, letter, bow = 0) {
    addCurvedLine(pixels, cx - startOffset, y0, cx - endOffset, y1, letter, -Math.abs(bow), 0);
    addCurvedLine(pixels, cx + startOffset, y0, cx + endOffset, y1, letter, Math.abs(bow), 0);
}

function addMirroredHighlightLanes(pixels, cx, y0, y1, startOffset, endOffset, bow = 0, phase = 0) {
    addHighlightLane(pixels, cx - startOffset, y0, cx - endOffset, y1, -Math.abs(bow), phase);
    addHighlightLane(pixels, cx + startOffset, y0, cx + endOffset, y1, Math.abs(bow), phase + 2);
}

function softenHairNoise(pixels) {
    const original = new Map(pixels);
    for (const [key, letter] of original) {
        if (letter !== 'H' && letter !== 'L' && letter !== 'S') continue;
        const [x, y] = key.split(',').map(Number);
        let sameOrRelated = 0;
        for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
            const n = original.get(`${x + dx},${y + dy}`);
            if (n === letter || (letter !== 'S' && (n === 'H' || n === 'L'))) sameOrRelated++;
        }
        if (sameOrRelated === 0) pixels.set(key, letter === 'S' ? 'B' : 'B');
    }
}

function fillSmallInteriorHairGaps(pixels) {
    const original = new Map(pixels);
    for (const [key] of original) {
        const [x, y] = key.split(',').map(Number);
        for (const [gx, gy] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
            const gkey = `${gx},${gy}`;
            if (pixels.has(gkey)) continue;
            const up = original.get(`${gx},${gy - 1}`);
            const down = original.get(`${gx},${gy + 1}`);
            const left = original.get(`${gx - 1},${gy}`);
            const right = original.get(`${gx + 1},${gy}`);
            const diagA = original.get(`${gx - 1},${gy - 1}`) || original.get(`${gx + 1},${gy + 1}`);
            const diagB = original.get(`${gx + 1},${gy - 1}`) || original.get(`${gx - 1},${gy + 1}`);
            if ((up && down && (left || right)) || (left && right && (up || down)) || (up && down && diagA && diagB)) {
                pixels.set(gkey, 'B');
            }
        }
    }
}

function removeDisconnectedHairIslands(pixels, scalpYLimit) {
    const seen = new Set();
    const keep = new Set();
    const dirs = [[0, -1], [1, 0], [0, 1], [-1, 0], [-1, -1], [1, -1], [-1, 1], [1, 1]];
    for (const key of pixels.keys()) {
        if (seen.has(key)) continue;
        const component = [];
        let touchesScalp = false;
        const queue = [key];
        seen.add(key);
        for (let qi = 0; qi < queue.length; qi++) {
            const cur = queue[qi];
            component.push(cur);
            const [x, y] = cur.split(',').map(Number);
            if (y <= scalpYLimit) touchesScalp = true;
            for (const [dx, dy] of dirs) {
                const nk = `${x + dx},${y + dy}`;
                if (seen.has(nk) || !pixels.has(nk)) continue;
                seen.add(nk);
                queue.push(nk);
            }
        }
        if (touchesScalp) for (const cur of component) keep.add(cur);
    }
    for (const key of Array.from(pixels.keys())) {
        if (!keep.has(key)) pixels.delete(key);
    }
}

function addRibbonLock(pixels, x0, y0, x1, y1, w0, w1, sideLight, opts = {}) {
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))));
    const bow = Number(opts.bow || 0);
    for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const x = x0 + (x1 - x0) * t + Math.sin(t * Math.PI) * bow;
        const y = y0 + (y1 - y0) * t;
        const w = Math.max(0, Math.round(w0 + (w1 - w0) * t));
        for (let dx = -w; dx <= w; dx++) {
            const sideT = Math.abs(dx) / Math.max(1, w + 0.5);
            let letter = 'B';
            if (sideT > 0.78) letter = 'S';
            else if (sideLight < 0 ? dx < -Math.max(0, w - 1) : dx > Math.max(0, w - 1)) letter = 'H';
            else if (sideLight < 0 ? dx < 0 : dx > 0) letter = 'L';
            else if (sideT > 0.48) letter = 'S';
            addPixel(pixels, x + dx, y, letter);
        }
    }
    if (opts.tip) addPixel(pixels, x1, y1 + 1, 'S');
}

function addPanelRibbon(pixels, x0, y0, x1, y1, w0, w1, lightSide, opts = {}) {
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))));
    const bow = Number(opts.bow || 0);
    const seamSide = opts.seamSide || -lightSide;
    for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const x = x0 + (x1 - x0) * t + Math.sin(t * Math.PI) * bow;
        const y = y0 + (y1 - y0) * t;
        const w = Math.max(1, Math.round(w0 + (w1 - w0) * t));
        for (let dx = -w; dx <= w; dx++) {
            const edge = Math.abs(dx) / Math.max(1, w);
            let letter = 'B';
            if (edge >= 0.92) letter = 'S';
            else if (dx * seamSide > w * 0.48) letter = 'S';
            else if (dx * lightSide > w * 0.45) letter = 'H';
            else if (dx * lightSide > 0) letter = 'L';
            addPixel(pixels, x + dx, y, letter);
        }
    }
}

function addWavyPanelRibbon(pixels, x0, y0, x1, y1, w0, w1, lightSide, opts = {}) {
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))));
    const bow = Number(opts.bow || 0);
    const wave = Number(opts.wave || 0);
    const phase = Number(opts.phase || 0);
    const seamSide = opts.seamSide || -lightSide;
    for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const x = x0 + (x1 - x0) * t
            + Math.sin(t * Math.PI) * bow
            + Math.sin(t * Math.PI * 2 + phase) * wave * (1 - t * 0.22);
        const y = y0 + (y1 - y0) * t;
        const w = Math.max(0, Math.round(w0 + (w1 - w0) * t));
        for (let dx = -w; dx <= w; dx++) {
            const edge = Math.abs(dx) / Math.max(1, w || 1);
            let letter = 'B';
            if (edge >= 0.92) letter = 'S';
            else if (dx * seamSide > Math.max(1, w) * 0.48) letter = 'S';
            else if (dx * lightSide > Math.max(1, w) * 0.38) letter = (i + Math.round(phase)) % 6 === 0 ? 'H' : 'L';
            else if (dx * lightSide > 0) letter = 'L';
            addPixel(pixels, x + dx, y, letter);
        }
    }
    if (opts.tip) addPixel(pixels, x1, y1 + 1, 'S');
}

function simulateHairChain(rootX, rootY, opts = {}) {
    const count = Math.max(2, Math.round(opts.count || 6));
    const segmentLength = Number(opts.segmentLength || 5);
    const dirX = Number(opts.dirX || 0);
    const dirY = Number(opts.dirY || 1);
    const dirLen = Math.max(0.001, Math.hypot(dirX, dirY));
    const nx = dirX / dirLen;
    const ny = dirY / dirLen;
    const wave = Number(opts.wave || 0);
    const phase = Number(opts.phase || 0);
    const points = [];
    const old = [];
    for (let i = 0; i < count; i++) {
        const t = i / Math.max(1, count - 1);
        const side = Math.sin(t * Math.PI + phase) * wave;
        const x = rootX + nx * segmentLength * i - ny * side;
        const y = rootY + ny * segmentLength * i + nx * side;
        points.push({ x, y });
        old.push({ x: x - Number(opts.initialVX || 0), y: y - Number(opts.initialVY || 0) });
    }

    const gravity = Number(opts.gravity || 0.18);
    const wind = Number(opts.wind || 0);
    const damping = Number(opts.damping || 0.72);
    const steps = Math.max(1, Math.round(opts.steps || 8));
    const iterations = Math.max(1, Math.round(opts.iterations || 5));
    for (let step = 0; step < steps; step++) {
        points[0].x = rootX;
        points[0].y = rootY;
        for (let i = 1; i < points.length; i++) {
            const p = points[i];
            const ox = old[i].x;
            const oy = old[i].y;
            old[i] = { x: p.x, y: p.y };
            p.x = p.x + (p.x - ox) * damping + wind;
            p.y = p.y + (p.y - oy) * damping + gravity;
        }
        for (let iter = 0; iter < iterations; iter++) {
            points[0].x = rootX;
            points[0].y = rootY;
            for (let i = 0; i < points.length - 1; i++) {
                const a = points[i];
                const b = points[i + 1];
                const dx = b.x - a.x;
                const dy = b.y - a.y;
                const dist = Math.max(0.001, Math.hypot(dx, dy));
                const correction = (dist - segmentLength) / dist;
                if (i === 0) {
                    b.x -= dx * correction;
                    b.y -= dy * correction;
                } else {
                    a.x += dx * correction * 0.5;
                    a.y += dy * correction * 0.5;
                    b.x -= dx * correction * 0.5;
                    b.y -= dy * correction * 0.5;
                }
            }
        }
    }
    return points;
}

function addChainClump(pixels, nodes, opts = {}) {
    if (!nodes || nodes.length < 2) return;
    const lightSide = Number(opts.lightSide || 1);
    const w0 = Number(opts.w0 || 3);
    const w1 = Number(opts.w1 || 1);
    const phase = Number(opts.phase || 0);
    for (let i = 0; i < nodes.length - 1; i++) {
        const a = nodes[i];
        const b = nodes[i + 1];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const len = Math.max(0.001, Math.hypot(dx, dy));
        const px = -dy / len;
        const py = dx / len;
        const steps = Math.max(1, Math.ceil(len * 1.2));
        for (let s = 0; s <= steps; s++) {
            const localT = s / steps;
            const t = (i + localT) / Math.max(1, nodes.length - 1);
            const cx = a.x + dx * localT;
            const cy = a.y + dy * localT;
            const width = Math.max(0, Math.round(w0 + (w1 - w0) * t));
            for (let o = -width; o <= width; o++) {
                const edge = Math.abs(o) / Math.max(1, width || 1);
                const lit = (o * lightSide) / Math.max(1, width || 1);
                let letter = 'B';
                if (edge >= 0.86) letter = 'S';
                else if (lit > 0.48 && t < 0.34 && Math.round(i + s + phase) % 5 === 0) letter = 'H';
                else if (lit > 0.16 && t < 0.78) letter = 'L';
                addPixel(pixels, cx + px * o, cy + py * o, letter);
            }
        }
    }
}

function addSideLowerBandShading(pixels, px, eyeY, curtainBottom, half, faceSign, tipSway, amount) {
    if (amount <= 0) return;
    const intensity = amount / 5;
    const y0 = eyeY + 9;
    const y1 = curtainBottom - 5;
    const bow = -faceSign * (0.35 + intensity * 0.55);
    addClippedHighlightLane(pixels, px(-half * 0.70), y0, px(-half * 0.58) + tipSway * 0.35, y1, bow, 1);
    addClippedCurvedLine(pixels, px(-half * 0.48), y0 + 1, px(-half * 0.40) + tipSway * 0.25, y1 + 1, 'S', bow * 0.8, amount >= 4 ? 0 : 5);
    if (amount >= 3) addClippedHighlightLane(pixels, px(-half * 0.88), y0 + 3, px(-half * 0.78) + tipSway * 0.25, y1 - 1, bow * 0.6, 3);
    if (amount >= 5) addClippedCurvedLine(pixels, px(-half * 0.30), y0 + 2, px(-half * 0.24) + tipSway * 0.2, y1 - 2, 'L', bow * 0.5, 4);
}

function addClippedWavyLine(pixels, x0, y0, x1, y1, letter, opts = {}) {
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))));
    const bow = Number(opts.bow || 0);
    const wave = Number(opts.wave || 0);
    const phase = Number(opts.phase || 0);
    const skip = Number(opts.skip || 0);
    for (let i = 0; i <= steps; i++) {
        if (skip && i % skip === skip - 1) continue;
        const t = i / steps;
        const x = x0 + (x1 - x0) * t
            + Math.sin(t * Math.PI) * bow
            + Math.sin(t * Math.PI * 2 + phase) * wave * (1 - t * 0.25);
        const y = y0 + (y1 - y0) * t;
        setIfHair(pixels, x, y, letter);
    }
}

function addSweptFrontBangFan(pixels, cx, top, eyeY, half) {
    const partX = cx - Math.round(half * 0.14);
    const bangTop = top + 4;
    addWavyPanelRibbon(pixels, partX, bangTop, cx - half * 0.58, eyeY + 5, 4, 0, -1, { bow: -2.2, wave: 0.9, phase: 0.3, seamSide: 1, tip: true });
    addWavyPanelRibbon(pixels, partX + 3, bangTop + 1, cx - half * 0.24, eyeY + 7, 3, 0, -1, { bow: -0.7, wave: 0.7, phase: 2.1, seamSide: 1, tip: true });
    addWavyPanelRibbon(pixels, partX + 5, bangTop + 2, cx + half * 0.20, eyeY + 5, 3, 0, 1, { bow: 0.8, wave: 0.7, phase: 1.4, seamSide: -1, tip: true });
    addWavyPanelRibbon(pixels, cx + half * 0.36, bangTop + 2, cx + half * 0.58, eyeY + 4, 3, 0, 1, { bow: 1.6, wave: 0.6, phase: 2.8, seamSide: -1, tip: true });
    addClippedWavyLine(pixels, partX - 1, bangTop, cx - half * 0.50, eyeY + 4, 'S', { bow: -1.5, wave: 0.6 });
    addClippedWavyLine(pixels, partX + 4, bangTop + 1, cx + half * 0.22, eyeY + 4, 'S', { bow: 0.8, wave: 0.5, phase: 1.2 });
    addHighlightLane(pixels, cx - half * 0.34, bangTop + 2, cx - half * 0.50, eyeY + 2, -1.0, 0);
    addHighlightLane(pixels, cx + half * 0.24, bangTop + 3, cx + half * 0.48, eyeY + 1, 0.9, 2);
}

function addFlowingFrontSideLocks(pixels, cx, eyeY, massBottom, half, config, tipSway) {
    const longish = config.length === 'long' || config.hairStyle === 'long-layered';
    const lower = massBottom + (longish ? 1 : -1);
    for (const sideSign of [-1, 1]) {
        const temple = cx + sideSign * Math.round(half * 0.82);
        const outerRoot = cx + sideSign * Math.round(half * 1.24);
        addWavyPanelRibbon(pixels, temple, eyeY - 4, cx + sideSign * Math.round(half * 1.42) + tipSway, lower - 5, 4, longish ? 2 : 1, sideSign, { bow: sideSign * 3.8, wave: sideSign * 2.2, phase: sideSign < 0 ? 0.4 : 2.2, seamSide: -sideSign, tip: true });
        addWavyPanelRibbon(pixels, cx + sideSign * Math.round(half * 0.62), eyeY + 2, cx + sideSign * Math.round(half * 1.08) + tipSway, lower, 3, 0, sideSign, { bow: sideSign * 4.6, wave: sideSign * 2.2, phase: sideSign < 0 ? 1.7 : 3.4, seamSide: -sideSign, tip: true });
        addWavyPanelRibbon(pixels, outerRoot, eyeY + 7, cx + sideSign * Math.round(half * 0.84) + tipSway, lower - 2, 2, 0, -sideSign, { bow: -sideSign * 3.2, wave: sideSign * 1.7, phase: sideSign < 0 ? 2.5 : 0.9, seamSide: sideSign, tip: true });
        addHighlightLane(pixels, temple - sideSign, eyeY - 1, cx + sideSign * Math.round(half * 1.22) + tipSway, lower - 9, sideSign * 2.1, sideSign < 0 ? 0 : 2);
        addClippedWavyLine(pixels, cx + sideSign * Math.round(half * 0.50), eyeY + 1, cx + sideSign * Math.round(half * 0.98) + tipSway, lower - 3, 'S', { bow: sideSign * 3.0, wave: sideSign * 1.5, phase: sideSign < 0 ? 0.6 : 2.1 });
        addClippedWavyLine(pixels, outerRoot + sideSign, eyeY + 9, cx + sideSign * Math.round(half * 0.96) + tipSway, lower - 7, 'L', { bow: -sideSign * 2.4, wave: sideSign * 1.2, phase: sideSign < 0 ? 1.4 : 3.0, skip: 4 });
    }
}

function clearFrontFaceOpening(pixels, cx, eyeY, massBottom, half) {
    for (let y = eyeY + 2; y <= massBottom - 4; y++) {
        const t = (y - (eyeY + 2)) / Math.max(1, massBottom - eyeY - 6);
        const openHalf = Math.round(half * (0.34 + t * 0.16));
        for (let x = cx - openHalf; x <= cx + openHalf; x++) erasePixel(pixels, x, y);
    }
}

function clearFrontEyeWindow(pixels, cx, eyeY, half) {
    const eyeOffset = Math.max(3, Math.round(half * 0.28));
    for (const eyeCx of [cx - eyeOffset, cx + eyeOffset]) {
        for (let y = eyeY; y <= eyeY + 2; y++) {
            const rel = y - eyeY;
            const openHalf = rel === 0 ? 2 : rel === 1 ? 2 : 1;
            for (let x = eyeCx - openHalf; x <= eyeCx + openHalf; x++) erasePixel(pixels, x, y);
        }
    }
}

function clearShortSpikyFrontFaceOpening(pixels, cx, eyeY, half, config = {}) {
    const drop = config.length === 'long' ? 20 : config.length === 'medium' ? 16 : 12;
    const bottom = eyeY + drop + 1;
    for (let y = eyeY - 1; y <= bottom; y++) {
        const t = clamp((y - (eyeY - 1)) / Math.max(1, bottom - eyeY + 1), 0, 1);
        const openHalf = Math.round(half * (0.30 + t * 0.36));
        for (let x = cx - openHalf; x <= cx + openHalf; x++) erasePixel(pixels, x, y);
    }
}

function frontVisibleEyeY(bodyFrame, bodyPalette, anchors, half) {
    const face = anchors.face || {};
    const cx = Math.round(Number.isFinite(face.cx) ? face.cx : (anchors.head && anchors.head.centreX) || 72);
    const startY = Math.round(Number.isFinite(face.eyeY) ? face.eyeY : (face.top || 24) + 4);
    const endY = Math.round((Number.isFinite(face.bottom) ? face.bottom : startY + 5) + 4);
    const eyeOffset = Math.max(3, Math.round(half * 0.28));
    let bestY = startY;
    let bestScore = -1;
    for (let y = startY; y <= endY; y++) {
        let score = 0;
        for (const eyeCx of [cx - eyeOffset, cx + eyeOffset]) {
            for (let x = eyeCx - 2; x <= eyeCx + 2; x++) {
                const ch = rowAt(bodyFrame[y] || '', x);
                if (blank(ch)) continue;
                const luma = hexLuma(bodyPalette && bodyPalette[String(ch)] && bodyPalette[String(ch)].hex);
                if (luma < 110) score += 110 - luma;
            }
        }
        if (score > bestScore) {
            bestScore = score;
            bestY = y;
        }
    }
    return bestScore > 0 ? bestY : startY;
}

function clearFrontAnchorEyeZone(pixels, anchors, half, params = {}) {
    const face = anchors.face || {};
    const cx = Math.round(Number.isFinite(face.cx) ? face.cx : (anchors.head && anchors.head.centreX) || 72);
    const baseY = Math.round(Number.isFinite(face.eyeY) ? face.eyeY : (face.top || 24) + 5) + Math.round(Number(params.eyeZoneY || 0));
    const eyeOffset = Math.max(3, Math.round(half * 0.28)) + Math.round(Number(params.eyeZoneX || 0));
    const zoneWidth = clamp(Math.round(Number(params.eyeZoneWidth ?? 3)), 1, 6);
    const zoneHeight = clamp(Math.round(Number(params.eyeZoneHeight ?? 5)), 1, 8);
    for (const sideSign of [-1, 1]) {
        const eyeCx = cx + sideSign * eyeOffset;
        for (let dy = 0; dy < zoneHeight; dy++) {
            const edge = dy === 0 || dy === zoneHeight - 1;
            const rowHalf = Math.max(1, zoneWidth - (edge ? 1 : 0));
            const y = baseY + dy;
            for (let x = eyeCx - rowHalf; x <= eyeCx + rowHalf; x++) erasePixel(pixels, x, y);
        }
    }
}

function addCoherentHairPattern(pixels, cx, top, eyeY, crownBottom, massBottom, half, direction, sway, tipSway, side, back) {
    if (back) {
        addPanelRibbon(pixels, cx - half * 0.36, crownBottom - 2, cx - half * 0.48 + tipSway, massBottom - 1, 3, 2, -1, { bow: -2.0, seamSide: 1 });
        addPanelRibbon(pixels, cx + half * 0.36, crownBottom - 2, cx + half * 0.48 + tipSway, massBottom - 1, 3, 2, 1, { bow: 2.0, seamSide: -1 });
        addPanelRibbon(pixels, cx, top + 5, cx, massBottom - 6, 2, 1, 1, { bow: 0, seamSide: -1 });
        addMirroredLanes(pixels, cx, top + 9, massBottom - 3, Math.round(half * 0.18), Math.round(half * 0.28), 'S', 0.8);
        addMirroredHighlightLanes(pixels, cx, top + 8, massBottom - 8, Math.round(half * 0.34), Math.round(half * 0.45), 1.2, 1);
        return;
    }

    if (side) {
        const faceSign = direction === 1 ? -1 : 1;
        const backSign = -faceSign;
        const rootX = cx + sway + backSign * Math.round(half * 0.34);
        addPanelRibbon(pixels, rootX, top + 5, rootX + backSign * 8 + tipSway, massBottom + 1, 3, 1, backSign, { bow: backSign * 2.4, seamSide: -backSign });
        addPanelRibbon(pixels, cx + sway + backSign * Math.round(half * 0.62), top + 7, cx + sway + backSign * Math.round(half * 0.96) + tipSway, massBottom - 4, 2, 1, backSign, { bow: backSign * 1.8, seamSide: -backSign });
        addHighlightLane(pixels, rootX + backSign, top + 8, rootX + backSign * 8 + tipSway, massBottom - 5, backSign * 1.5, 0);
        addCurvedLine(pixels, rootX - backSign * 2, top + 10, rootX + backSign * 5 + tipSway, massBottom - 1, 'S', backSign * 1.0, 0);
        addPanelRibbon(pixels, cx + sway + faceSign * Math.round(half * 0.32), top + 6, cx + sway + faceSign * Math.round(half * 0.52), eyeY + 3, 2, 0, faceSign, { bow: faceSign * 0.8, seamSide: -faceSign });
        return;
    }

    addCurvedLine(pixels, cx, top + 3, cx, eyeY + 3, 'S', 0, 0);
    addPanelRibbon(pixels, cx - half * 0.58, top + 6, cx - half * 0.86 + tipSway, massBottom - 1, 3, 1, -1, { bow: -2.0, seamSide: 1 });
    addPanelRibbon(pixels, cx + half * 0.58, top + 6, cx + half * 0.86 + tipSway, massBottom - 1, 3, 1, 1, { bow: 2.0, seamSide: -1 });
    addPanelRibbon(pixels, cx - half * 0.24, top + 6, cx - half * 0.46, eyeY + 5, 2, 0, -1, { bow: -1.0, seamSide: 1 });
    addPanelRibbon(pixels, cx + half * 0.24, top + 6, cx + half * 0.46, eyeY + 5, 2, 0, 1, { bow: 1.0, seamSide: -1 });
    addMirroredHighlightLanes(pixels, cx, top + 7, massBottom - 7, Math.round(half * 0.42), Math.round(half * 0.68), 1.6, 0);
    addMirroredLanes(pixels, cx, top + 9, massBottom - 3, Math.round(half * 0.70), Math.round(half * 0.92), 'S', 1.8);
}

function addPolishedBangPanels(pixels, cx, top, eyeY, half, direction, sway, side) {
    if (side) {
        const faceSign = direction === 1 ? -1 : 1;
        const rootX = cx + sway + faceSign * Math.round(half * 0.20);
        addClippedCurvedLine(pixels, rootX - faceSign * 2, top + 7, rootX + faceSign * 2, eyeY - 1, 'S', faceSign * 0.7, 0);
        addClippedHighlightLane(pixels, rootX, top + 8, rootX + faceSign * 2, eyeY - 2, faceSign * 0.4, 1);
        return;
    }

    const bangTop = top + 5;
    addPanelRibbon(pixels, cx - half * 0.46, bangTop, cx - half * 0.62, eyeY + 6, 3, 0, -1, { bow: -1.2, seamSide: 1 });
    addPanelRibbon(pixels, cx + half * 0.46, bangTop, cx + half * 0.62, eyeY + 6, 3, 0, 1, { bow: 1.2, seamSide: -1 });
    addPanelRibbon(pixels, cx, bangTop - 1, cx, eyeY + 3, 2, 0, 1, { bow: 0, seamSide: -1 });
    addHighlightLane(pixels, cx - half * 0.34, bangTop + 2, cx - half * 0.52, eyeY + 4, -0.8, 1);
    addHighlightLane(pixels, cx + half * 0.34, bangTop + 2, cx + half * 0.52, eyeY + 4, 0.8, 3);
    addCurvedLine(pixels, cx, bangTop, cx, eyeY + 3, 'S', 0, 0);
}

function addTempleConnectors(pixels, cx, top, eyeY, massBottom, half, direction, sway, tipSway, side, back) {
    if (back) return;
    if (side) {
        const faceSign = direction === 1 ? -1 : 1;
        const backSign = -faceSign;
        const templeX = cx + sway + backSign * Math.round(half * 0.42);
        addPanelRibbon(pixels, templeX, top + 8, templeX + backSign * 5 + tipSway, massBottom - 2, 3, 1, backSign, { bow: backSign * 1.8, seamSide: -backSign });
        addHighlightLane(pixels, templeX + backSign, top + 10, templeX + backSign * 5 + tipSway, massBottom - 5, backSign * 1.2, 2);
        return;
    }
    for (const sideSign of [-1, 1]) {
        const templeX = cx + sideSign * Math.round(half * 0.62);
        addWavyPanelRibbon(pixels, templeX, eyeY - 1, templeX + sideSign * 6 + tipSway, massBottom - 2, 3, 1, sideSign, { bow: sideSign * 2.4, wave: sideSign * 1.0, phase: sideSign < 0 ? 0.5 : 2.5, seamSide: -sideSign });
        addHighlightLane(pixels, templeX + sideSign, eyeY + 1, templeX + sideSign * 6 + tipSway, massBottom - 6, sideSign * 1.2, sideSign < 0 ? 0 : 2);
    }
}

function addSideFrontHairlineTufts(pixels, cx, top, eyeY, half, direction, sway) {
    const faceSign = direction === 1 ? -1 : 1;
    const root = cx + sway;
    addTaperedStrand(pixels, root - faceSign * 2, top + 5, root + faceSign * Math.round(half * 0.74), eyeY - 1, 5, 1, { bow: faceSign * 2.4, phase: 1, tip: true });
    addTaperedStrand(pixels, root + faceSign * Math.round(half * 0.06), top + 8, root + faceSign * Math.round(half * 0.62), eyeY - 4, 3, 0, { bow: faceSign * 1.7, phase: 3, tip: true });
    addTaperedStrand(pixels, root - faceSign * Math.round(half * 0.18), top + 10, root + faceSign * Math.round(half * 0.36), eyeY + 2, 3, 0, { bow: faceSign * 1.2, phase: 2, tip: true });

    addClippedCurvedLine(pixels, root + faceSign * Math.round(half * 0.02), top + 7, root + faceSign * Math.round(half * 0.66), eyeY - 1, 'S', faceSign * 2.2, 0);
    addClippedCurvedLine(pixels, root + faceSign * Math.round(half * 0.26), top + 10, root + faceSign * Math.round(half * 0.60), eyeY - 3, 'S', faceSign * 1.2, 0);
    addClippedHighlightLane(pixels, root - faceSign * Math.round(half * 0.06), top + 8, root + faceSign * Math.round(half * 0.40), eyeY - 3, faceSign * 1.0, 1);
}

function addSideCranialCap(pixels, cx, top, eyeY, half, direction, sway) {
    const faceSign = direction === 1 ? -1 : 1;
    const rowCx = cx + sway;
    const y0 = top + 1;
    const y1 = eyeY + 7;
    for (let y = y0; y <= y1; y++) {
        const t = (y - y0) / Math.max(1, y1 - y0);
        const crownScale = t < 0.22 ? 0.50 + t * 2.25 : 1;
        const backLimit = Math.round(half * (1.02 - Math.max(0, t - 0.62) * 0.18) * crownScale);
        const faceLimit = Math.round(half * (0.70 - t * 0.18) * crownScale);
        for (let s = -backLimit; s <= faceLimit; s++) {
            const edge = s <= -backLimit + 1 || s >= faceLimit - 1;
            const sideT = (s + backLimit) / Math.max(1, backLimit + faceLimit);
            let letter = 'B';
            if (edge) letter = 'S';
            else if (t < 0.20 && sideT > 0.34 && sideT < 0.70) letter = 'H';
            else if (sideT > 0.28 && sideT < 0.72) letter = 'L';
            addPixel(pixels, rowCx + faceSign * s, y, letter);
        }
    }
    addClippedCurvedLine(pixels, rowCx + faceSign * Math.round(half * -0.78), top + 5, rowCx + faceSign * Math.round(half * -0.64), eyeY + 8, 'S', -faceSign * 1.3, 0);
    addClippedCurvedLine(pixels, rowCx + faceSign * Math.round(half * 0.38), top + 7, rowCx + faceSign * Math.round(half * 0.22), eyeY + 9, 'S', faceSign * 0.9, 0);
    addClippedHighlightLane(pixels, rowCx + faceSign * Math.round(half * -0.18), top + 5, rowCx + faceSign * Math.round(half * -0.34), eyeY + 7, -faceSign * 1.0, 1);
}

function addSideRearScalpFill(pixels, cx, top, eyeY, half, direction, sway) {
    const faceSign = direction === 1 ? -1 : 1;
    const backSign = -faceSign;
    const rowCx = cx + sway;
    const y0 = top + 4;
    const y1 = eyeY + 8;
    for (let y = y0; y <= y1; y++) {
        const t = (y - y0) / Math.max(1, y1 - y0);
        const start = Math.round(half * (0.08 + t * 0.10));
        const end = Math.round(half * (0.96 - t * 0.12));
        for (let d = start; d <= end; d++) {
            const sideT = (d - start) / Math.max(1, end - start);
            let letter = 'B';
            if (sideT > 0.78) letter = 'S';
            else if (t < 0.20 && sideT < 0.42) letter = 'H';
            else if (sideT < 0.44) letter = 'L';
            addPixel(pixels, rowCx + backSign * d, y, letter);
        }
    }
    addClippedHighlightLane(pixels, rowCx + backSign * Math.round(half * 0.18), top + 6, rowCx + backSign * Math.round(half * 0.55), eyeY + 5, backSign * 1.2, 1);
    addClippedCurvedLine(pixels, rowCx + backSign * Math.round(half * 0.72), top + 7, rowCx + backSign * Math.round(half * 0.82), eyeY + 7, 'S', backSign * 1.2, 0);
}

function addSideTempleFill(pixels, cx, top, eyeY, half, direction, sway) {
    const faceSign = direction === 1 ? -1 : 1;
    const rowCx = cx + sway;
    const y0 = top + 6;
    const y1 = eyeY + 8;
    for (let y = y0; y <= y1; y++) {
        const t = (y - y0) / Math.max(1, y1 - y0);
        const start = Math.round(half * (0.04 + t * 0.04));
        const end = Math.round(half * (0.70 - t * 0.22));
        for (let d = start; d <= end; d++) {
            const sideT = (d - start) / Math.max(1, end - start);
            let letter = 'B';
            if (sideT > 0.82) letter = 'S';
            else if (sideT < 0.36 && t < 0.45) letter = 'L';
            addPixel(pixels, rowCx + faceSign * d, y, letter);
        }
    }
    addClippedCurvedLine(pixels, rowCx + faceSign * Math.round(half * 0.08), top + 8, rowCx + faceSign * Math.round(half * 0.34), eyeY + 8, 'S', faceSign * 0.9, 0);
    addClippedHighlightLane(pixels, rowCx + faceSign * Math.round(half * 0.18), top + 9, rowCx + faceSign * Math.round(half * 0.44), eyeY + 5, faceSign * 0.8, 2);
}

function clearSideEyeWindow(pixels, cx, eyeY, half, direction, sway) {
    const faceSign = direction === 1 ? -1 : 1;
    const eyeCx = cx + sway + faceSign * Math.round(half * 0.14);
    erasePixel(pixels, eyeCx, eyeY - 1);
    erasePixel(pixels, eyeCx + faceSign, eyeY - 1);
    for (let y = eyeY; y <= eyeY + 3; y++) {
        const rel = y - eyeY;
        const frontPad = rel <= 2 ? 4 : 2;
        const backPad = 1;
        const minX = faceSign < 0 ? eyeCx - frontPad : eyeCx - backPad;
        const maxX = faceSign < 0 ? eyeCx + backPad : eyeCx + frontPad;
        for (let x = minX; x <= maxX; x++) {
            erasePixel(pixels, x, y);
        }
    }
    addClippedCurvedLine(pixels, cx + sway - faceSign * Math.round(half * 0.04), eyeY - 4, cx + sway + faceSign * Math.round(half * 0.42), eyeY - 2, 'S', faceSign * 0.8, 0);
}

function clearSideFaceFromBody(pixels, bodyFrame, bodyPalette, anchors, direction) {
    const face = anchors.face || {};
    const head = anchors.head || {};
    const faceSign = direction === 1 ? -1 : 1;
    const eyeY = Math.round(Number.isFinite(face.eyeY) ? face.eyeY : (face.top || head.minY || 24) + 8);
    const faceCx = Math.round(Number.isFinite(face.cx) ? face.cx : head.centreX || 72);
    const top = eyeY;
    const bottom = Math.round((Number.isFinite(face.bottom) ? face.bottom : eyeY + 7) + 3);
    const skin = fallbackSkinLetters(bodyPalette || {});
    for (let y = top; y <= bottom; y++) {
        const row = bodyFrame[y] || '';
        for (let x = 0; x < rowWidth(row); x++) {
            const ch = rowAt(row, x);
            if (blank(ch)) continue;
            const isSkin = skin.size ? skin.has(String(ch)) : true;
            if (!isSkin) continue;
            const frontness = (x - faceCx) * faceSign;
            if (frontness < -1) continue;
            erasePixel(pixels, x, y);
            erasePixel(pixels, x + faceSign, y);
            if (y >= eyeY + 1 && frontness > 1) erasePixel(pixels, x + faceSign * 2, y);
        }
    }
}

function addSideForeheadScalpFill(pixels, cx, top, eyeY, half, direction, sway) {
    const faceSign = direction === 1 ? -1 : 1;
    const rowCx = cx + sway;
    const y0 = top + 2;
    const y1 = eyeY - 1;
    for (let y = y0; y <= y1; y++) {
        const t = (y - y0) / Math.max(1, y1 - y0);
        const limit = Math.round(half * (0.72 - t * 0.22));
        for (let d = 0; d <= limit; d++) {
            const edge = d >= limit - 1;
            let letter = 'B';
            if (edge) letter = 'S';
            else if (d < limit * 0.38 && t < 0.35) letter = 'L';
            addPixel(pixels, rowCx + faceSign * d, y, letter);
        }
    }
    addClippedCurvedLine(pixels, rowCx + faceSign * Math.round(half * 0.18), top + 4, rowCx + faceSign * Math.round(half * 0.48), eyeY - 1, 'S', faceSign * 0.5, 0);
}

function addSideRearTempleFill(pixels, cx, eyeY, half, direction, sway) {
    const faceSign = direction === 1 ? -1 : 1;
    const eyeCx = cx + sway + faceSign * Math.round(half * 0.14);
    const backSign = -faceSign;
    for (let y = eyeY - 2; y <= eyeY + 7; y++) {
        const t = (y - (eyeY - 2)) / 9;
        const width = y < eyeY ? 2 : 3;
        for (let i = 0; i < width; i++) {
            const x = eyeCx + backSign * (4 + i);
            let letter = 'B';
            if (i === width - 1) letter = 'S';
            else if (t < 0.35) letter = 'L';
            addPixel(pixels, x, y, letter);
        }
    }
    addClippedCurvedLine(pixels, eyeCx + backSign * 5, eyeY - 2, eyeCx + backSign * 5, eyeY + 7, 'S', backSign * 0.25, 0);
}

function addSideFrontBangs(pixels, cx, top, eyeY, half, direction, sway) {
    const faceSign = direction === 1 ? -1 : 1;
    const rowCx = cx + sway;
    const front = (offset) => rowCx + faceSign * Math.round(offset);

    // Direction 1 faces left and direction 2 faces right. Place these locks on
    // that face/front side only, after face clearing, so they read as bangs.
    addPanelRibbon(pixels, front(half * 0.05), top + 4, front(half * 0.42), eyeY - 2, 3, 0, faceSign, { bow: faceSign * 0.55, seamSide: -faceSign });
    addPanelRibbon(pixels, front(half * 0.26), top + 6, front(half * 0.56), eyeY - 1, 2, 0, faceSign, { bow: faceSign * 0.35, seamSide: -faceSign });
    addClippedCurvedLine(pixels, front(half * 0.18), top + 6, front(half * 0.48), eyeY - 1, 'S', faceSign * 0.35, 0);
    addClippedHighlightLane(pixels, front(half * 0.10), top + 6, front(half * 0.34), eyeY - 3, faceSign * 0.25, 1);

    const teeth = [
        { root: 0.24, tip: 0.82, y0: top + 4, y1: eyeY + 1, w0: 2, w1: 0, phase: 0 },
        { root: 0.06, tip: 0.70, y0: top + 6, y1: eyeY + 3, w0: 2, w1: 0, phase: 1.7 },
        { root: 0.36, tip: 0.92, y0: top + 7, y1: eyeY + 2, w0: 1, w1: 0, phase: 3.1 }
    ];
    for (const tooth of teeth) {
        for (let y = tooth.y0; y <= tooth.y1; y++) {
            const t = (y - tooth.y0) / Math.max(1, tooth.y1 - tooth.y0);
            const offset = half * (tooth.root + (tooth.tip - tooth.root) * t);
            const center = front(offset) + Math.round(Math.sin(t * Math.PI + tooth.phase) * faceSign);
            const width = Math.max(0, Math.round(tooth.w0 + (tooth.w1 - tooth.w0) * t));
            for (let i = -width; i <= width; i++) {
                const edge = Math.abs(i) === width;
                const frontEdge = i * faceSign < 0;
                let letter = 'B';
                if (edge || t > 0.78) letter = 'S';
                else if (frontEdge && t < 0.55) letter = 'L';
                addPixel(pixels, center + i, y, letter);
            }
        }
    }

    const wedgeTop = top + 7;
    const wedgeBottom = eyeY + 3;
    for (let y = wedgeTop; y <= wedgeBottom; y++) {
        const t = (y - wedgeTop) / Math.max(1, wedgeBottom - wedgeTop);
        const inner = Math.round(half * (0.55 + t * 0.18));
        const outer = Math.round(half * (0.88 - t * 0.12));
        for (let d = inner; d <= outer; d++) {
            if ((y + d) % 5 === 0 && t > 0.35) continue;
            const frontEdge = d >= outer - 1;
            const backEdge = d <= inner;
            let letter = 'B';
            if (frontEdge || t > 0.82) letter = 'S';
            else if (backEdge && t < 0.55) letter = 'L';
            addPixel(pixels, front(d), y, letter);
        }
    }

    const y0 = top + 4;
    const y1 = eyeY - 1;
    for (let y = y0; y <= y1; y++) {
        const t = (y - y0) / Math.max(1, y1 - y0);
        const center = front(half * (0.16 + t * 0.34));
        const width = Math.max(1, Math.round(3 - t * 2));
        for (let i = -width; i <= width; i++) {
            const edge = Math.abs(i) === width;
            let letter = 'B';
            if (edge) letter = 'S';
            else if (i * faceSign < 0 && t < 0.55) letter = 'L';
            addPixel(pixels, center + i, y, letter);
        }
    }
    addPixel(pixels, front(half * 0.82), eyeY + 1, 'S');
}

function addSideVisibleSideLock(pixels, cx, eyeY, headBottom, half, direction, sway, config) {
    const faceSign = direction === 1 ? -1 : 1;
    const rowCx = cx + sway;
    const longish = config.length === 'long' || config.hairStyle === 'long-layered';
    const lockBottom = Math.min(headBottom + (longish ? 28 : 15), eyeY + (longish ? 38 : 22));
    const rootX = rowCx - faceSign * Math.round(half * 0.24);
    const tipX = rowCx + faceSign * Math.round(half * 0.18);

    addRibbonLock(pixels, rootX, eyeY + 3, tipX, lockBottom, 2, longish ? 1 : 0, faceSign, { bow: faceSign * 1.3, tip: true });
    addHighlightLane(pixels, rootX - faceSign, eyeY + 5, tipX - faceSign, lockBottom - 3, faceSign * 0.7, direction === 1 ? 0 : 2);
    addCurvedLine(pixels, rootX + faceSign * 2, eyeY + 6, tipX + faceSign * 2, lockBottom - 1, 'S', faceSign * 0.6, 0);

    if (longish) {
        addRibbonLock(pixels, rootX - faceSign * 2, eyeY + 8, tipX + faceSign, lockBottom + 9, 1, 0, faceSign, { bow: faceSign * 1.0, tip: true });
    }
}

function smoothPatternContinuity(pixels) {
    const original = new Map(pixels);
    for (const [key, letter] of original) {
        if (letter !== 'L' && letter !== 'H' && letter !== 'S') continue;
        const [x, y] = key.split(',').map(Number);
        const verticalA = original.get(`${x},${y - 1}`);
        const verticalB = original.get(`${x},${y + 1}`);
        const diagonalA = original.get(`${x - 1},${y - 1}`) || original.get(`${x + 1},${y - 1}`);
        const diagonalB = original.get(`${x - 1},${y + 1}`) || original.get(`${x + 1},${y + 1}`);
        const relatedUp = verticalA === letter || (letter !== 'S' && (verticalA === 'L' || verticalA === 'H')) || diagonalA === letter;
        const relatedDown = verticalB === letter || (letter !== 'S' && (verticalB === 'L' || verticalB === 'H')) || diagonalB === letter;
        if (relatedUp || relatedDown) continue;
        if (letter === 'H') pixels.set(key, 'L');
        else pixels.set(key, 'B');
    }
}

function sculptNaturalHairSilhouette(pixels, cx, top, eyeY, crownBottom, massBottom, half, direction, sway, side, back) {
    if (side) {
        const faceSign = direction === 1 ? -1 : 1;
        const backSign = -faceSign;

        // Side bangs should slope across the forehead, not form a square block.
        const bangStart = top + 4;
        const bangEnd = eyeY + 5;
        for (let y = bangStart; y <= bangEnd; y++) {
            const t = (y - bangStart) / Math.max(1, bangEnd - bangStart);
            const faceLimit = Math.round(half * (0.84 - t * 0.36));
            for (let d = faceLimit + 1; d <= half + 9; d++) erasePixel(pixels, cx + sway + faceSign * d, y);
        }

        // Keep only a tapered face opening. Do not erase from the scalp edge or
        // the side-view hair reads as a bald patch instead of a side part.
        for (let y = eyeY + 4; y <= massBottom + 2; y++) {
            const t = (y - (eyeY + 4)) / Math.max(1, massBottom - eyeY - 2);
            const start = Math.round(half * (0.46 + t * 0.12));
            for (let d = start; d <= half + 9; d++) erasePixel(pixels, cx + sway + faceSign * d, y);
        }

        // Taper the rear curtain so it narrows toward the tips instead of ending
        // as a rectangular slab.
        for (let y = crownBottom; y <= massBottom + 3; y++) {
            const t = (y - crownBottom) / Math.max(1, massBottom + 3 - crownBottom);
            const backLimit = Math.round(half * (1.02 - t * 0.34));
            for (let d = backLimit + 1; d <= half + 12; d++) erasePixel(pixels, cx + sway + backSign * d, y);
        }
        return;
    }

    if (back) {
        // Give the back curtain a soft arched lower edge rather than a straight
        // horizontal cutoff.
        for (let y = massBottom - 7; y <= massBottom + 2; y++) {
            const t = (y - (massBottom - 7)) / 9;
            const edgeLimit = Math.round(half * (0.94 - t * 0.28));
            for (let d = edgeLimit + 1; d <= half + 10; d++) {
                erasePixel(pixels, cx - d, y);
                erasePixel(pixels, cx + d, y);
            }
        }
        for (const notch of [-0.42, 0, 0.42]) {
            const nx = cx + Math.round(half * notch);
            erasePixel(pixels, nx, massBottom + 1);
            erasePixel(pixels, nx, massBottom);
        }
    }
}

function rowOuterEdge(pixels, y, sign) {
    let edge = sign > 0 ? -Infinity : Infinity;
    for (const key of pixels.keys()) {
        const [x, py] = key.split(',').map(Number);
        if (py !== y) continue;
        edge = sign > 0 ? Math.max(edge, x) : Math.min(edge, x);
    }
    return Number.isFinite(edge) ? edge : null;
}

function rowHairBounds(pixels, y) {
    let minX = Infinity, maxX = -Infinity;
    for (const key of pixels.keys()) {
        const [x, py] = key.split(',').map(Number);
        if (py !== y) continue;
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
    }
    return Number.isFinite(minX) ? { minX, maxX } : null;
}

function addLowerBandRows(pixels, y0, y1, amount, phase = 0) {
    if (amount <= 0) return;
    // Stronger response: amount 1 = sparse stripes, 5 = dense multi-row bands.
    const spacing = Math.max(2, 10 - amount * 1.5);
    const bandWidth = Math.max(1, Math.round(amount * 0.85));
    for (let y = y0; y <= y1; y++) {
        const local = y - y0 + phase;
        const bandT = local % spacing;
        if (bandT >= bandWidth) continue;
        const bounds = rowHairBounds(pixels, y);
        if (!bounds) continue;
        const width = bounds.maxX - bounds.minX + 1;
        if (width < 6) continue;
        const margin = Math.max(1, Math.round(width * (0.14 - amount * 0.01)));
        const step = amount >= 3 ? 1 : 2;
        const letter = bandT === 0 ? 'L' : (bandT === 1 ? 'H' : 'S');
        for (let x = bounds.minX + margin; x <= bounds.maxX - margin; x += step) {
            if ((x + y + phase) % (amount >= 3 ? 2 : 3) !== 0) setIfHair(pixels, x, y, letter);
        }
    }
}

function fillLowerEdgeGaps(pixels, y0, y1) {
    const original = new Map(pixels);
    for (let y = y0; y <= y1; y++) {
        const bounds = rowHairBounds(original, y);
        if (!bounds) continue;
        for (let x = bounds.minX + 1; x <= bounds.maxX - 1; x++) {
            const key = `${x},${y}`;
            if (original.has(key)) continue;
            if (original.has(`${x - 1},${y}`) && original.has(`${x + 1},${y}`)) pixels.set(key, 'B');
        }
    }
}

function addLowerPatternControls(pixels, cx, eyeY, massBottom, half, direction, sway, tipSway, side, back, config = {}) {
    const banding = Math.round(paramNumber(config, 'lowerBanding', 3, 0, 5));
    const scraggle = Math.round(paramNumber(config, 'lowerScraggle', 2, 0, 5));
    const y0 = Math.round(eyeY + (side ? 6 : back ? 8 : 7));
    const y1 = Math.round(massBottom - 1);
    if (y1 <= y0) return;

    addLowerBandRows(pixels, y0, y1, banding, direction * 2);

    if (banding >= 1) {
        const laneCount = Math.min(6, Math.max(1, banding + 1));
        for (let i = 0; i < laneCount; i++) {
            const t = laneCount === 1 ? 0.5 : i / (laneCount - 1);
            const offset = Math.round(half * (-0.72 + t * 1.44));
            const bow = (t - 0.5) * (side ? 2.6 : 1.8) + tipSway * 0.2;
            addClippedHighlightLane(pixels, cx + sway + offset, y0 + 1, cx + sway + Math.round(offset * 0.72) + Math.round(tipSway * 0.4), y1, bow, i * 2);
        }
    }
    if (banding >= 3) {
        addClippedCurvedLine(pixels, cx + sway - Math.round(half * 0.4), y0 + 1, cx + sway - Math.round(half * 0.16) + tipSway, y1, 'S', -1.4, 5 - banding);
        addClippedCurvedLine(pixels, cx + sway + Math.round(half * 0.4), y0 + 1, cx + sway + Math.round(half * 0.16) + tipSway, y1, 'S', 1.4, 5 - banding);
    }
    if (banding >= 5) {
        addClippedCurvedLine(pixels, cx + sway - Math.round(half * 0.18), y0 + 2, cx + sway - Math.round(half * 0.06) + tipSway, y1 - 1, 'H', -0.8, 0);
        addClippedCurvedLine(pixels, cx + sway + Math.round(half * 0.18), y0 + 2, cx + sway + Math.round(half * 0.06) + tipSway, y1 - 1, 'H', 0.8, 0);
    }

    if (scraggle <= 0) {
        fillLowerEdgeGaps(pixels, Math.max(y0, y1 - 12), y1 + 1);
    } else {
        // Depth scales hard: 1→1px, 3→3px, 5→5px edge bites.
        const depth = Math.max(1, scraggle);
        const spacing = Math.max(3, 11 - scraggle * 1.4);
        const span = Math.max(y0, y1 - (10 + scraggle * 2));
        carveScallopedEdge(pixels, -1, span, y1 + 1, spacing, depth);
        carveScallopedEdge(pixels, 1, span, y1 + 1, spacing, depth);
        if (scraggle >= 3) {
            for (const notch of [-0.58, -0.32, -0.1, 0.1, 0.32, 0.58]) {
                const nx = cx + sway + Math.round(half * notch);
                erasePixel(pixels, nx, y1 + 1);
                if (scraggle >= 4) erasePixel(pixels, nx, y1);
                if (scraggle >= 5) erasePixel(pixels, nx + 1, y1 + 1);
            }
        }
    }
}

function carveScallopedEdge(pixels, sign, y0, y1, spacing = 7, maxDepth = 2) {
    for (let y = y0; y <= y1; y++) {
        const phase = ((y - y0) % spacing + spacing) % spacing;
        const peak = spacing / 2;
        // Full maxDepth at the scallop peak so high scraggle values bite hard.
        const depth = Math.max(0, Math.min(maxDepth, Math.round(maxDepth * (1 - Math.abs(phase - peak) / Math.max(1, peak)))));
        if (depth <= 0) continue;
        const edge = rowOuterEdge(pixels, y, sign);
        if (edge == null) continue;
        for (let d = 0; d < depth; d++) erasePixel(pixels, edge - sign * d, y);
    }
}

function addFurStyleTuftLayer(pixels, cx, top, eyeY, crownBottom, massBottom, half, direction, sway, tipSway, side, back, config = {}) {
    if (side) {
        const faceSign = direction === 1 ? -1 : 1;
        const backSign = -faceSign;
        const scraggle = paramNumber(config, 'lowerScraggle', 2, 0, 5);
        carveScallopedEdge(pixels, backSign, top + 5, massBottom + 1, 9, Math.max(0, Math.round(scraggle / 2)));
        carveScallopedEdge(pixels, faceSign, top + 7, eyeY + 4, 5, 1);

        const root = cx + sway + backSign * Math.round(half * 0.18);
        addClippedCurvedLine(pixels, root, top + 6, cx + sway + backSign * Math.round(half * 0.64) + tipSway, massBottom - 4, 'S', backSign * 2.2, 0);
        addClippedCurvedLine(pixels, root + backSign * 4, top + 9, cx + sway + backSign * Math.round(half * 0.88) + tipSway, massBottom - 9, 'S', backSign * 1.8, 0);
        addClippedHighlightLane(pixels, root + backSign * 1, top + 8, cx + sway + backSign * Math.round(half * 0.54) + tipSway, massBottom - 8, backSign * 1.6, 1);
        addClippedHighlightLane(pixels, root + backSign * 5, top + 11, cx + sway + backSign * Math.round(half * 0.78) + tipSway, massBottom - 13, backSign * 1.2, 3);
        return;
    }

    if (back) {
        carveScallopedEdge(pixels, -1, top + 8, massBottom, 8, 2);
        carveScallopedEdge(pixels, 1, top + 8, massBottom, 8, 2);
        addClippedCurvedLine(pixels, cx - half * 0.62, crownBottom - 1, cx - half * 0.18, massBottom - 7, 'S', -2.4, 0);
        addClippedCurvedLine(pixels, cx + half * 0.62, crownBottom - 1, cx + half * 0.18, massBottom - 7, 'S', 2.4, 0);
        addClippedCurvedLine(pixels, cx - half * 0.28, top + 8, cx, massBottom - 5, 'S', -1.2, 0);
        addClippedCurvedLine(pixels, cx + half * 0.28, top + 8, cx, massBottom - 5, 'S', 1.2, 0);
        addClippedHighlightLane(pixels, cx - half * 0.42, top + 9, cx - half * 0.30, massBottom - 10, -1.4, 0);
        addClippedHighlightLane(pixels, cx + half * 0.42, top + 9, cx + half * 0.30, massBottom - 10, 1.4, 2);
        addClippedHighlightLane(pixels, cx, top + 7, cx, massBottom - 11, 0, 1);
        return;
    }

    carveScallopedEdge(pixels, -1, top + 7, Math.min(massBottom, eyeY + 12), 7, 1);
    carveScallopedEdge(pixels, 1, top + 7, Math.min(massBottom, eyeY + 12), 7, 1);
    addClippedCurvedLine(pixels, cx - half * 0.52, top + 7, cx - half * 0.18, eyeY + 6, 'S', -1.8, 0);
    addClippedCurvedLine(pixels, cx + half * 0.52, top + 7, cx + half * 0.18, eyeY + 6, 'S', 1.8, 0);
    addClippedCurvedLine(pixels, cx - half * 0.16, top + 5, cx - half * 0.48, eyeY + 7, 'S', -0.8, 0);
    addClippedCurvedLine(pixels, cx + half * 0.16, top + 5, cx + half * 0.48, eyeY + 7, 'S', 0.8, 0);
    addClippedHighlightLane(pixels, cx - half * 0.34, top + 8, cx - half * 0.54, eyeY + 5, -1.0, 0);
    addClippedHighlightLane(pixels, cx + half * 0.34, top + 8, cx + half * 0.54, eyeY + 5, 1.0, 2);
}

function addCleanSideHairMass(pixels, cx, top, eyeY, headBottom, massBottom, half, direction, frameIndex, config, sway) {
    const faceSign = direction === 1 ? -1 : 1;
    const rowCx = cx + sway;
    const tipSway = frameIndex === 0 ? -2 : frameIndex === 2 ? 2 : 0;
    const lowerBanding = paramNumber(config, 'lowerBanding', 3, 0, 5);
    const lowerScraggle = paramNumber(config, 'lowerScraggle', 2, 0, 5);
    const scraggleScale = 0.45 + lowerScraggle * 0.15;
    const longish = config.length === 'long' || config.hairStyle === 'long-layered';
    const capBottom = eyeY + 8;
    const curtainBottom = Math.min(massBottom - 6, headBottom + (longish ? 22 : 13));
    const px = (u) => rowCx + faceSign * Math.round(u);

    // Side-view hair uses a clean cap plus a few chain-driven clumps. This
    // keeps the profile readable and avoids noisy texture pasted over a blob.
    for (let y = top; y <= capBottom; y++) {
        const t = (y - top) / Math.max(1, capBottom - top);
        const crown = t < 0.22 ? 0.48 + t * 2.35 : 1;
        const back = Math.round(half * (0.92 - Math.max(0, t - 0.58) * 0.16) * crown);
        const face = y >= eyeY - 2
            ? -Math.round(half * 0.08)
            : Math.round(half * Math.max(0.10, 0.46 - t * 0.64) * crown);
        for (let u = -back; u <= face; u++) {
            const edge = u <= -back + 1 || u >= face - 1;
            const band = (u + back) / Math.max(1, back + face);
            let letter = 'B';
            if (edge) letter = 'S';
            else if (band > 0.35 && band < 0.58 && t < 0.36) letter = 'H';
            else if (band > 0.25 && band < 0.66) letter = 'L';
            addPixel(pixels, px(u), y, letter);
        }
    }

    const rearChain = simulateHairChain(px(-half * 0.66), eyeY + 1, {
        count: longish ? 6 : 5,
        segmentLength: Math.max(4, Math.round((curtainBottom - eyeY) / (longish ? 5 : 4))),
        dirX: -faceSign * 0.20,
        dirY: 1,
        gravity: 0.16,
        wind: (-faceSign * 0.05 + tipSway * 0.08) * scraggleScale,
        wave: 1.35 * scraggleScale,
        phase: (direction === 1 ? 0.5 : 2.4) + tipSway * 0.18,
        damping: 0.74 - lowerScraggle * 0.03
    });
    addChainClump(pixels, rearChain, { w0: 5, w1: 1, lightSide: -faceSign, phase: 0 });

    const outerChain = simulateHairChain(px(-half * 0.98), eyeY + 4, {
        count: longish ? 5 : 4,
        segmentLength: Math.max(4, Math.round((curtainBottom - eyeY - 4) / (longish ? 4 : 3))),
        dirX: -faceSign * 0.10,
        dirY: 1,
        gravity: 0.14,
        wind: (-faceSign * 0.04 + tipSway * 0.07) * scraggleScale,
        wave: 0.9 * scraggleScale,
        phase: 1.7 + tipSway * 0.22,
        damping: 0.76 - lowerScraggle * 0.03
    });
    if (lowerScraggle > 0) addChainClump(pixels, outerChain, { w0: Math.max(1, Math.round(1 + lowerScraggle * 0.35)), w1: 0, lightSide: -faceSign, phase: 2 });

    addPanelRibbon(pixels, px(-half * 0.58), eyeY + 8, px(-half * 0.50) + tipSway, curtainBottom - 2, 2, 0, -faceSign, { bow: -faceSign * 0.8 + tipSway * 0.35, seamSide: faceSign });
    addClippedHighlightLane(pixels, px(-half * 0.50), eyeY + 10, px(-half * 0.42) + tipSway, curtainBottom - 8, -faceSign * 0.5 + tipSway * 0.25, 2);
    addSideLowerBandShading(pixels, px, eyeY, curtainBottom, half, faceSign, tipSway, lowerBanding);

    addSideForeheadScalpFill(pixels, cx, top, eyeY - 2, half, direction, sway);

    if (!config.params || config.params.bangs !== false) {
        // Side bangs should echo the front view: swept locks hang over the
        // forehead, but stop above the eye instead of becoming a face curtain.
        const forelock = simulateHairChain(px(-half * 0.18), top + 4, {
            count: 4,
            segmentLength: Math.max(2.5, Math.round(half * 0.22)),
            dirX: faceSign * 0.66,
            dirY: 0.44,
            gravity: 0.09,
            wind: faceSign * 0.02,
            wave: 0.35,
            phase: 0.4,
            damping: 0.64
        });
        addChainClump(pixels, forelock, { w0: 4, w1: 1, lightSide: faceSign, phase: 3 });
        addClippedCurvedLine(pixels, px(-half * 0.02), top + 7, px(half * 0.42), eyeY - 2, 'S', faceSign * 0.35, 0);
        addPanelRibbon(pixels, px(-half * 0.05), top + 5, px(half * 0.18), eyeY - 2, 3, 0, faceSign, { bow: faceSign * 0.35, seamSide: -faceSign });
        addPanelRibbon(pixels, px(half * 0.16), top + 7, px(half * 0.38), eyeY - 1, 3, 0, faceSign, { bow: faceSign * 0.25, seamSide: -faceSign });
        addClippedHighlightLane(pixels, px(half * 0.02), top + 7, px(half * 0.20), eyeY - 3, faceSign * 0.25, 1);
    }

    addClippedCurvedLine(pixels, px(-half * 0.86), top + 6, px(-half * 0.82), curtainBottom - 4, 'S', -faceSign * 0.40, 0);
    addClippedCurvedLine(pixels, px(-half * 0.42), eyeY + 4, px(-half * 0.54), curtainBottom - 7, 'S', -faceSign * 0.30, 0);
    addClippedHighlightLane(pixels, px(-half * 0.18), top + 7, px(-half * 0.30), Math.min(curtainBottom - 12, eyeY + 16), -faceSign * 0.25, 1);
    addLowerPatternControls(pixels, cx, eyeY, curtainBottom, half, direction, sway, tipSway, true, false, config);

    removeDisconnectedHairIslands(pixels, eyeY + 9);
}

function addCenterPartLongHairMass(pixels, anchors, config, direction, frameIndex) {
    const head = anchors.head || {};
    const face = anchors.face || {};
    const side = direction === 1 || direction === 2;
    const back = direction === 3;
    const faceSign = direction === 1 ? -1 : 1;
    const cx = Math.round(Number.isFinite(face.cx) ? face.cx : head.centreX || 72);
    const eyeY = Math.round(Number.isFinite(face.eyeY) ? face.eyeY : (face.top || head.minY || 24) + 8) + (side ? 3 : 0);
    const top = Math.round((head.minY || 18) - 2 + (side ? 3 : 0));
    const headBottom = Math.round(head.maxY || eyeY + 12) + (side ? 3 : 0);
    const half = Math.max(8, Math.round((head.halfWidth || 10) + (side ? 2 : 1)));
    const bottom = headBottom + (back ? 34 : side ? 30 : 36);
    const sway = side ? (direction === 1 ? -1 : 0) : 0;
    const rowCx = cx + sway;
    const tipSway = frameIndex === 0 ? -1 : frameIndex === 2 ? 1 : 0;
    const walkSway = frameIndex === 0 ? -1 : frameIndex === 2 ? 1 : 0;
    const banding = Math.round(paramNumber(config, 'lowerBanding', 3, 0, 5));

    if (side) {
        const px = (u) => rowCx + faceSign * Math.round(u);
        const capBottom = eyeY + 8;
        for (let y = top; y <= capBottom; y++) {
            const t = (y - top) / Math.max(1, capBottom - top);
            const crown = t < 0.24 ? 0.45 + t * 2.30 : 1;
            const rear = Math.round(half * (0.88 - Math.max(0, t - 0.48) * 0.20) * crown);
            const front = y < eyeY - 1 ? Math.round(half * (0.56 - t * 0.30) * crown) : -Math.round(half * 0.08);
            for (let u = -rear; u <= front; u++) {
                const edge = u <= -rear + 1 || u >= front - 1;
                const band = (u + rear) / Math.max(1, rear + front);
                let letter = 'B';
                if (edge) letter = 'S';
                else if (band > 0.34 && band < 0.58 && t < 0.38) letter = 'H';
                else if (band > 0.22 && band < 0.68) letter = 'L';
                addPixel(pixels, px(u), y, letter);
            }
        }
        for (let y = eyeY + 3; y <= bottom; y++) {
            const t = (y - (eyeY + 3)) / Math.max(1, bottom - eyeY - 3);
            const rear = Math.round(half * (0.72 - t * 0.14));
            const front = -Math.round(half * (0.24 + t * 0.06));
            const swayOffset = Math.round(walkSway * t * 1.2);
            for (let u = -rear; u <= front; u++) {
                const edge = u <= -rear + 1 || u >= front - 1 || y > bottom - 3;
                const band = (u + rear) / Math.max(1, rear + front);
                let letter = edge ? 'S' : band > 0.32 && band < 0.58 ? 'L' : 'B';
                if (banding > 3 && band > 0.42 && band < 0.50 && y % 5 !== 0) letter = 'H';
                addPixel(pixels, px(u + swayOffset), y, letter);
            }
        }
        addClippedCurvedLine(pixels, px(-half * 0.12), top + 4, px(-half * 0.20 + walkSway * 0.08), bottom - 2, 'S', -faceSign * 0.18, 0);
        addClippedCurvedLine(pixels, px(-half * 0.48), top + 7, px(-half * 0.52 + walkSway * 0.08), bottom - 4, 'S', -faceSign * 0.12, 0);
        addClippedHighlightLane(pixels, px(-half * 0.30), top + 6, px(-half * 0.34 + walkSway * 0.08), bottom - 8, -faceSign * 0.10, 1);
        if (!config.params || config.params.bangs !== false) {
            for (let y = top + 2; y <= eyeY + 2; y++) {
                const t = (y - (top + 2)) / Math.max(1, eyeY - top);
                const rearU = -half * (0.28 - t * 0.08);
                const frontU = half * (0.82 - t * 0.16);
                for (let u = Math.round(rearU); u <= Math.round(frontU); u++) {
                    const edge = u <= Math.round(rearU) + 1 || u >= Math.round(frontU) - 1;
                    const band = (u - rearU) / Math.max(1, frontU - rearU);
                    let letter = edge ? 'S' : band > 0.40 && band < 0.62 && t < 0.60 ? 'H' : band > 0.22 && band < 0.74 ? 'L' : 'B';
                    addPixel(pixels, px(u), y, letter);
                }
            }
            addPanelRibbon(pixels, px(-half * 0.26), top + 3, px(half * 0.72), eyeY - 2, 5, 1, faceSign, { bow: faceSign * 0.24, seamSide: -faceSign });
            addPanelRibbon(pixels, px(-half * 0.12), top + 6, px(half * 0.70), eyeY + 1, 4, 0, faceSign, { bow: faceSign * 0.18, seamSide: -faceSign });
            addPanelRibbon(pixels, px(half * 0.06), top + 9, px(half * 0.58), eyeY + 3, 3, 0, faceSign, { bow: faceSign * 0.10, seamSide: -faceSign });
            addClippedCurvedLine(pixels, px(-half * 0.20), top + 5, px(half * 0.62), eyeY - 1, 'S', faceSign * 0.14, 0);
            addClippedHighlightLane(pixels, px(-half * 0.10), top + 6, px(half * 0.48), eyeY - 2, faceSign * 0.10, 1);
        }
        clearSideEyeWindow(pixels, cx, eyeY, half, direction, sway);
        removeDisconnectedHairIslands(pixels, eyeY + 10);
        return;
    }

    if (back) {
        for (let y = top; y <= bottom; y++) {
            const t = (y - top) / Math.max(1, bottom - top);
            const crown = t < 0.18 ? 0.35 + t * 3.60 : 1;
            const lowerT = clamp((y - (eyeY + 10)) / Math.max(1, bottom - eyeY - 10), 0, 1);
            const rowHalf = Math.max(2, Math.round(half * (0.98 - lowerT * 0.30) * crown));
            const swayOffset = Math.round(walkSway * t * 1.2);
            for (let x = cx - rowHalf; x <= cx + rowHalf; x++) {
                const local = x - cx;
                if (y > bottom - 5 && Math.abs(local) > rowHalf - (bottom - y + 1)) continue;
                const sideT = Math.abs(local) / Math.max(1, rowHalf);
                let letter = sideT > 0.86 || y > bottom - 2 ? 'S' : sideT < 0.18 && y > top + 8 ? 'S' : sideT < 0.46 ? 'L' : 'B';
                if (banding > 3 && Math.abs(local) > rowHalf * 0.34 && Math.abs(local) < rowHalf * 0.54 && y % 6 !== 0) letter = 'H';
                addPixel(pixels, x + swayOffset, y, letter);
            }
        }
        addClippedCurvedLine(pixels, cx, top + 4, cx + walkSway, bottom - 2, 'O', 0, 0);
        for (const sideSign of [-1, 1]) {
            addClippedCurvedLine(pixels, cx + sideSign * Math.round(half * 0.24), top + 8, cx + sideSign * Math.round(half * 0.20) + walkSway, bottom - 4, 'S', sideSign * 0.14, 0);
            addClippedCurvedLine(pixels, cx + sideSign * Math.round(half * 0.58), top + 10, cx + sideSign * Math.round(half * 0.62) + walkSway, bottom - 5, 'S', sideSign * 0.16, 0);
            addClippedHighlightLane(pixels, cx + sideSign * Math.round(half * 0.38), top + 8, cx + sideSign * Math.round(half * 0.36) + walkSway, bottom - 8, sideSign * 0.10, sideSign < 0 ? 0 : 2);
        }
        return;
    }

    for (let y = top; y <= bottom; y++) {
        const t = (y - top) / Math.max(1, bottom - top);
        const crown = t < 0.18 ? 0.35 + t * 3.60 : 1;
        const lowerT = clamp((y - (eyeY + 6)) / Math.max(1, bottom - eyeY - 6), 0, 1);
        const rowHalf = Math.max(2, Math.round(half * (0.96 - lowerT * 0.22) * crown));
        const openT = clamp((y - (eyeY - 2)) / Math.max(1, bottom - eyeY + 2), 0, 1);
        const centerOpen = y < eyeY - 2 ? 0 : Math.round(half * (0.44 + openT * 0.30));
        const swayOffset = Math.round(walkSway * t * 1.1);
        for (let x = cx - rowHalf; x <= cx + rowHalf; x++) {
            const local = x - cx;
            if (y >= eyeY - 2 && Math.abs(local) < centerOpen) continue;
            if (y > bottom - 5 && Math.abs(local) > rowHalf - (bottom - y + 1)) continue;
            const sideT = Math.abs(local) / Math.max(1, rowHalf);
            let letter = sideT > 0.84 || y > bottom - 2 ? 'S' : sideT < 0.42 ? 'L' : 'B';
            if (banding > 3 && sideT > 0.48 && sideT < 0.62 && y % 6 !== 0) letter = 'H';
            addPixel(pixels, x + swayOffset, y, letter);
        }
    }
    addClippedCurvedLine(pixels, cx, top + 3, cx, eyeY + 4, 'O', 0, 0);
    for (const sideSign of [-1, 1]) {
        addClippedCurvedLine(pixels, cx + sideSign * Math.round(half * 0.14), top + 5, cx + sideSign * Math.round(half * 0.48), eyeY + 5, 'S', sideSign * 0.35, 0);
        addClippedCurvedLine(pixels, cx + sideSign * Math.round(half * 0.58), eyeY - 2, cx + sideSign * Math.round(half * 0.72) + walkSway, bottom - 3, 'S', sideSign * 0.10, 0);
        addClippedHighlightLane(pixels, cx + sideSign * Math.round(half * 0.30), top + 7, cx + sideSign * Math.round(half * 0.58) + walkSway, bottom - 8, sideSign * 0.16, sideSign < 0 ? 0 : 2);
    }
    clearFrontEyeWindow(pixels, cx, eyeY, half);
    clearFrontAnchorEyeZone(pixels, anchors, half, config.params || {});
    addClippedCurvedLine(pixels, cx, top + 1, cx, eyeY - 2, 'O', 0, 0);
}

function addHairMass(pixels, anchors, config, direction, frameIndex) {
    const head = anchors.head || {};
    const face = anchors.face || {};
    const cx = Math.round(Number.isFinite(face.cx) ? face.cx : head.centreX || 72);
    const eyeY = Math.round(Number.isFinite(face.eyeY) ? face.eyeY : (face.top || head.minY || 24) + 8);
    const side = direction === 1 || direction === 2;
    const back = direction === 3;
    const sideDrop = side ? 3 : 0;
    const hairEyeY = eyeY + sideDrop;
    const top = Math.round((head.minY || 18) - 3 + sideDrop);
    const headBottom = Math.round(head.maxY || eyeY + 12) + sideDrop;
    const half = Math.max(8, Math.round((head.halfWidth || 10) + 2));
    const spiky = config.hairStyle === 'short-spiky';
    if (spiky) {
        addShortSpikyStyleHairMass(pixels, anchors, config, direction, frameIndex);
        return;
    }
    if (config.hairStyle === 'center-part-long') {
        addCenterPartLongHairMass(pixels, anchors, config, direction, frameIndex);
        return;
    }
    const longDrop = spiky ? 3 : config.length === 'long' || config.hairStyle === 'long-layered' ? 30 : config.length === 'short' || config.hairStyle === 'short-shag' ? 6 : 16;
    const bottom = headBottom + longDrop;
    const sway = side ? (direction === 1 ? -2 : 0) : 0;
    const tipSway = frameIndex === 0 ? -2 : frameIndex === 2 ? (side || back ? 2 : 0) : 0;
    const massBottom = back ? bottom + 3 : bottom;

    const crownBottom = back ? Math.min(massBottom, hairEyeY + 9) : Math.min(massBottom, hairEyeY + 6);

    if (side) {
        addCleanSideHairMass(pixels, cx, top, hairEyeY, headBottom, massBottom, half, direction, frameIndex, config, sway);
        if (spiky) addShortSpikyTufts(pixels, cx, top, hairEyeY, half, direction, frameIndex, true, false, sway);
        return;
    }

    for (let y = top; y <= crownBottom; y++) {
        const t = (y - top) / Math.max(1, massBottom - top);
        let rowHalf;
        if (t < 0.20) rowHalf = Math.round(half * (0.30 + t * 3.5));
        else if (back) rowHalf = Math.round(half * (1.12 - Math.max(0, t - 0.45) * 0.32));
        else if (side) rowHalf = Math.round(half * (0.98 - Math.max(0, t - 0.42) * 0.28));
        else rowHalf = Math.round(half * (1.03 - Math.max(0, t - 0.42) * 0.35));
        rowHalf = Math.max(3, rowHalf);

        const rowCx = cx + sway;
        const leftBias = side && direction === 1 ? 3 : 0;
        const rightBias = side && direction === 2 ? 3 : 0;
        for (let x = rowCx - rowHalf - leftBias; x <= rowCx + rowHalf + rightBias; x++) {
            const local = x - rowCx;
            const edgeTaper = Math.abs(local) / Math.max(1, rowHalf + Math.max(leftBias, rightBias));
            if (edgeTaper > 1.02) continue;
            if (!back && !side && y > hairEyeY + 1 && Math.abs(local) < rowHalf * 0.46) continue;
            addPixel(pixels, x, y, shadeLetter(local, rowHalf, t, direction, back));
        }
    }

    // Break the cap into clumps so it reads like layered hair rather than a helmet.
    // Use dark seam pixels, not transparent cuts, so the outline pass does not
    // create black holes inside the hairstyle.
    const partSide = side ? (direction === 1 ? -1 : 1) : -1;
    const partX = cx + partSide * Math.round(half * 0.16) + sway;
    for (let y = top + 3; y <= crownBottom; y += 3) {
        const t = (y - top) / Math.max(1, crownBottom - top);
        const gap = Math.round(1 + t * 2);
        addSpan(pixels, partX - gap, partX, y, 'S');
        if (gap > 1) addPixel(pixels, partX - gap - 1, y, 'L');
    }
    if (spiky) addShortSpikyTufts(pixels, cx, top, hairEyeY, half, direction, frameIndex, false, back, sway);
    if (back) {
        addMirroredHighlightLanes(pixels, cx + sway, top + 5, crownBottom + 3, Math.round(half * 0.18), Math.round(half * 0.30), 1.0, 1);
        addMirroredLanes(pixels, cx + sway, top + 7, crownBottom + 5, Math.round(half * 0.42), Math.round(half * 0.54), 'S', 1.2);
    } else if (side) {
        const faceSign = direction === 1 ? -1 : 1;
        addHighlightLane(pixels, cx + sway - faceSign * Math.round(half * 0.18), top + 4, cx + sway + faceSign * Math.round(half * 0.18), crownBottom + 2, faceSign * 1.4, 1);
        addCurvedLine(pixels, cx + sway - faceSign * Math.round(half * 0.46), top + 7, cx + sway - faceSign * Math.round(half * 0.68), crownBottom + 5, 'S', -faceSign * 1.5, 0);
    } else {
        addCurvedLine(pixels, partX, top + 3, cx, crownBottom + 2, 'S', 0.6, 0);
        addMirroredHighlightLanes(pixels, cx, top + 5, crownBottom + 4, Math.round(half * 0.16), Math.round(half * 0.42), 1.5, 0);
        addMirroredLanes(pixels, cx, top + 7, crownBottom + 8, Math.round(half * 0.48), Math.round(half * 0.72), 'S', 1.8);
    }

    if (config.params && config.params.bangs !== false && !back && !spiky) {
        addPolishedBangPanels(pixels, cx, top, hairEyeY, half, direction, sway, side);
        if (!side) addSweptFrontBangFan(pixels, cx, top, hairEyeY, half);
    }

    if (config.params && config.params.sideLocks !== false && !back && !spiky) {
        const lockBottom = bottom + (config.length === 'long' ? 8 : 0);
        for (const sideSign of [-1, 1]) {
            const faceSign = direction === 1 ? -1 : direction === 2 ? 1 : 0;
            if (side && sideSign === faceSign) continue;
            if (!side && config.length !== 'short') continue;
            const lx = cx + sideSign * (half + 1) + sway;
            addRibbonLock(pixels, lx, hairEyeY - 4, lx + sideSign * 4 + tipSway, lockBottom, 2, 0, sideSign < 0 ? -1 : 1, { bow: sideSign * 2.4, tip: true });
            addHighlightLane(pixels, lx - sideSign, hairEyeY - 1, lx + sideSign * 3 + tipSway, lockBottom - 2, sideSign * 1.4, sideSign < 0 ? 0 : 2);
            addCurvedLine(pixels, lx + sideSign * 2, hairEyeY + 3, lx + sideSign * 4 + tipSway, lockBottom - 1, 'S', sideSign * 1.3, 0);
            if (config.length !== 'short') addRibbonLock(pixels, lx - sideSign * 3, hairEyeY + 1, lx + sideSign * 1 + tipSway, lockBottom - 5, 1, 0, sideSign < 0 ? -1 : 1, { bow: sideSign * 1.8, tip: true });
        }
        if (!side && config.length !== 'short') addFlowingFrontSideLocks(pixels, cx, hairEyeY, massBottom, half, config, tipSway);
    }

    if (back) {
        for (let y = crownBottom + 1; y <= massBottom; y++) {
            const t = (y - crownBottom) / Math.max(1, massBottom - crownBottom);
            const rowHalf = Math.round(half * (1.02 - t * 0.36));
            for (let x = cx - rowHalf; x <= cx + rowHalf; x++) {
                const local = x - cx;
                addPixel(pixels, x, y, shadeLetter(local, rowHalf, t, direction, true));
            }
        }
        addMirroredLanes(pixels, cx, crownBottom + 1, massBottom - 2, Math.round(half * 0.20), Math.round(half * 0.28), 'S', 1.2);
        addMirroredHighlightLanes(pixels, cx, crownBottom + 2, massBottom - 5, Math.round(half * 0.34), Math.round(half * 0.44), 1.6, 2);
        addMirroredLanes(pixels, cx, crownBottom + 4, massBottom - 1, Math.round(half * 0.60), Math.round(half * 0.76), 'S', 2.0);
        addHighlightLane(pixels, cx, top + 8, cx, massBottom - 8, 0, 0);
    } else if (!spiky && (config.length === 'long' || config.hairStyle === 'long-layered')) {
        for (const sideSign of [-1, 1]) {
            const faceSign = direction === 1 ? -1 : direction === 2 ? 1 : 0;
            if (side && sideSign === faceSign) continue;
            if (!side) continue;
            const startX = cx + sideSign * Math.round(half * 0.82) + sway;
            const endX = startX + sideSign * 5 + tipSway;
            addRibbonLock(pixels, startX, hairEyeY + 5, endX, massBottom + 3, 2, 0, sideSign < 0 ? -1 : 1, { bow: sideSign * 3.2, tip: true });
            addHighlightLane(pixels, startX - sideSign, hairEyeY + 7, endX - sideSign, massBottom, sideSign * 1.2, sideSign < 0 ? 1 : 3);
        }
    }
    addCoherentHairPattern(pixels, cx, top, hairEyeY, crownBottom, massBottom, half, direction, sway, tipSway, side, back);
    addTempleConnectors(pixels, cx, top, hairEyeY, massBottom, half, direction, sway, tipSway, side, back);
    smoothPatternContinuity(pixels);
    softenHairNoise(pixels);
    fillSmallInteriorHairGaps(pixels);
    if (!side && !back) {
        clearFrontFaceOpening(pixels, cx, hairEyeY, massBottom, half);
    }
    sculptNaturalHairSilhouette(pixels, cx, top, hairEyeY, crownBottom, massBottom, half, direction, sway, side, back);
    if (side) addSideCranialCap(pixels, cx, top, hairEyeY, half, direction, sway);
    if (side) addSideFrontHairlineTufts(pixels, cx, top, hairEyeY, half, direction, sway);
    if (side) addSideRearScalpFill(pixels, cx, top, hairEyeY, half, direction, sway);
    if (side) addSideTempleFill(pixels, cx, top, hairEyeY, half, direction, sway);
    addFurStyleTuftLayer(pixels, cx, top, hairEyeY, crownBottom, massBottom, half, direction, sway, tipSway, side, back, config);
    addLowerPatternControls(pixels, cx, hairEyeY, massBottom, half, direction, sway, tipSway, side, back, config);
    if (side) clearSideEyeWindow(pixels, cx, eyeY, half, direction, sway);
    removeDisconnectedHairIslands(pixels, hairEyeY + 10);
}

function composeFrame(config, bodyTemplate, direction, frameIndex) {
    const bodyFrame = bodyTemplate.sheet[direction][frameIndex];
    const H = Math.max(bodyFrame.length, 144);
    const W = Math.max(144, ...bodyFrame.map(rowWidth));
    const pixels = new Map();
    const anchors = anchorsFor(config, bodyTemplate, direction, frameIndex);
    addHairMass(pixels, anchors, config, direction, frameIndex);
    if (direction === 1 || direction === 2) {
        const head = anchors.head || {};
        const face = anchors.face || {};
        const cx = Math.round(Number.isFinite(face.cx) ? face.cx : head.centreX || 72);
        const eyeY = Math.round(Number.isFinite(face.eyeY) ? face.eyeY : (face.top || head.minY || 24) + 8);
        const top = Math.round((head.minY || 18) - 3 + 3);
        const headBottom = Math.round(head.maxY || eyeY + 12) + 3;
        const half = Math.max(8, Math.round((head.halfWidth || 10) + 2));
        const sway = direction === 1 ? -2 : 0;
        clearSideFaceFromBody(pixels, bodyFrame, bodyTemplate.palette || {}, anchors, direction);
        clearSideEyeWindow(pixels, cx, eyeY, half, direction, sway);
        addSideRearTempleFill(pixels, cx, eyeY, half, direction, sway);
        if (config.hairStyle !== 'short-spiky' && config.hairStyle !== 'center-part-long' && (!config.params || config.params.bangs !== false)) addSideFrontBangs(pixels, cx, top, eyeY, half, direction, sway);
        if (config.hairStyle !== 'short-spiky' && config.hairStyle !== 'center-part-long' && (!config.params || config.params.sideLocks !== false)) addSideVisibleSideLock(pixels, cx, eyeY, headBottom, half, direction, sway, config);
    }
    if (!config.params || config.params.outline !== false) addShapeStroke(pixels);
    if (direction === 1 || direction === 2) {
        const head = anchors.head || {};
        const face = anchors.face || {};
        const cx = Math.round(Number.isFinite(face.cx) ? face.cx : head.centreX || 72);
        const eyeY = Math.round(Number.isFinite(face.eyeY) ? face.eyeY : (face.top || head.minY || 24) + 8);
        const half = Math.max(8, Math.round((head.halfWidth || 10) + 2));
        const sway = direction === 1 ? -2 : 0;
        clearSideEyeWindow(pixels, cx, eyeY, half, direction, sway);
    } else if (direction === 0) {
        const head = anchors.head || {};
        const face = anchors.face || {};
        const cx = Math.round(Number.isFinite(face.cx) ? face.cx : head.centreX || 72);
        const half = Math.max(8, Math.round((head.halfWidth || 10) + 2));
        if (config.hairStyle === 'short-spiky') clearShortSpikyFrontFaceOpening(pixels, cx, Math.round(Number.isFinite(face.eyeY) ? face.eyeY : (face.top || 24) + 5), half, config);
        clearFrontEyeWindow(pixels, cx, frontVisibleEyeY(bodyFrame, bodyTemplate.palette || {}, anchors, half), half);
        clearFrontAnchorEyeZone(pixels, anchors, half, config.params || {});
    }
    const rows = mat(H, W, ' ');
    for (const [key, letter] of pixels) {
        const [x, y] = key.split(',').map(Number);
        if (x < 0 || y < 0 || x >= W || y >= H) continue;
        rows[y][x] = letter;
    }
    return rows.map(row => row.join('').padEnd(W, ' '));
}

function generateHair(config = {}, bodyTemplate) {
    if (!bodyTemplate || !bodyTemplate.sheet) throw new Error('Hair Forge requires a body template sheet.');
    const cfg = Object.assign(defaultConfig(config.style || 'looseleaf'), config || {});
    cfg.params = Object.assign({}, defaultConfig(cfg.style).params, config.params || {});
    const sheet = [];
    for (let d = 0; d < 4; d++) {
        const frames = [];
        const dirFrames = bodyTemplate.sheet[d] || [];
        const nFrames = dirFrames.length || 3;
        for (let f = 0; f < nFrames; f++) frames.push(composeFrame(cfg, bodyTemplate, d, f));
        sheet.push(frames);
    }
    return { palette: paletteFor(cfg), sheet };
}

const UI_SCHEMA = {
    styles: STYLE_OPTIONS,
    lengths: LENGTH_OPTIONS,
    colors: Object.entries(COLORS).map(([key, color]) => ({ key, label: color.label, swatch: color.base }))
};

return { COLORS, UI_SCHEMA, defaultConfig, paletteFor, generateHair, composeFrame };
});
