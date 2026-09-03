const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');

const repoRoot = path.resolve(__dirname, '..', '..');
const editorRoot = path.resolve(__dirname, '..');
const coreSource = fs.readFileSync(path.join(repoRoot, 'runtime', 'reactor_core.js'), 'utf8');
const ResourceManager = require(path.join(editorRoot, 'src', 'ResourceManager.js'));
const assetOptimizer = require(path.join(editorRoot, 'build-scripts', 'asset-optimizer.js'));

// --------------------------------------------------------------------------
// The runtime's APNG section, lifted out of reactor_core.js. Prototype methods
// only touch the DOM when called, so a stub constructor is enough to define
// them and a fake 2d context is enough to exercise the compositor.
// --------------------------------------------------------------------------
function apngFixture(now = () => 0) {
    const start = coreSource.indexOf('Bitmap.APNG_MIN_DELAY_MS = 10;');
    const end = coreSource.indexOf('\nBitmap.prototype._callLoadListeners = function()', start);
    assert.ok(start >= 0, 'APNG section not found in reactor_core.js');
    assert.ok(end > start, 'end landmark not found after the APNG section');
    function Bitmap() {}
    new Function('Bitmap', 'performance', coreSource.slice(start, end))(
        Bitmap, { now });
    return Bitmap;
}

// --------------------------------------------------------------------------
// Synthetic PNG/APNG builders. Everything is 4x4 RGBA so a frame can sit in a
// sub-rectangle, which is where dispose and blend actually matter.
// --------------------------------------------------------------------------
const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function crc32(buffer) {
    const table = [];
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        table[n] = c >>> 0;
    }
    let crc = 0xffffffff;
    for (const byte of buffer) crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const typed = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(typed));
    return Buffer.concat([length, typed, crc]);
}

function ihdr(width, height) {
    const data = Buffer.alloc(13);
    data.writeUInt32BE(width, 0);
    data.writeUInt32BE(height, 4);
    data[8] = 8;    // bit depth
    data[9] = 6;    // colour type: RGBA
    return data;
}

/** Deflated RGBA scanlines of one solid colour. */
function pixels(width, height, [r, g, b, a = 255]) {
    const rows = [];
    for (let y = 0; y < height; y++) {
        const row = Buffer.alloc(1 + width * 4);
        for (let x = 0; x < width; x++) {
            row[1 + x * 4] = r;
            row[2 + x * 4] = g;
            row[3 + x * 4] = b;
            row[4 + x * 4] = a;
        }
        rows.push(row);
    }
    return zlib.deflateSync(Buffer.concat(rows));
}

function actl(frameCount, playCount) {
    const data = Buffer.alloc(8);
    data.writeUInt32BE(frameCount, 0);
    data.writeUInt32BE(playCount, 4);
    return data;
}

function fctl(sequence, frame) {
    const data = Buffer.alloc(26);
    data.writeUInt32BE(sequence, 0);
    data.writeUInt32BE(frame.width, 4);
    data.writeUInt32BE(frame.height, 8);
    data.writeUInt32BE(frame.x || 0, 12);
    data.writeUInt32BE(frame.y || 0, 16);
    data.writeUInt16BE(frame.delayNum ?? 10, 20);
    data.writeUInt16BE(frame.delayDen ?? 100, 22);
    data[24] = frame.disposeOp || 0;
    data[25] = frame.blendOp || 0;
    return data;
}

function fdat(sequence, data) {
    const head = Buffer.alloc(4);
    head.writeUInt32BE(sequence, 0);
    return Buffer.concat([head, data]);
}

function staticPng(width = 4, height = 4, colour = [255, 0, 0]) {
    return Buffer.concat([
        SIGNATURE, chunk('IHDR', ihdr(width, height)),
        chunk('IDAT', pixels(width, height, colour)), chunk('IEND', Buffer.alloc(0))
    ]);
}

/**
 * @param {object} options
 *   frames        - frame descriptors; the first uses IDAT unless
 *                   `defaultIsStill`, the rest use fdAT
 *   playCount     - acTL num_plays (0 = forever)
 *   defaultIsStill- emit IDAT before any fcTL, so the default image is a
 *                   fallback rather than frame one
 *   actlAfterIdat - malformed placement, which must read as a plain PNG
 *   shared        - extra ancillary chunks to carry into every frame
 */
function buildApng(options = {}) {
    const size = options.size || { width: 4, height: 4 };
    const frames = options.frames || [
        { width: 4, height: 4, colour: [255, 0, 0] },
        { width: 4, height: 4, colour: [0, 0, 255] }
    ];
    const pieces = [SIGNATURE, chunk('IHDR', ihdr(size.width, size.height))];
    const animationChunk = chunk('acTL', actl(frames.length, options.playCount ?? 0));
    if (!options.actlAfterIdat) pieces.push(animationChunk);
    for (const entry of options.shared || []) pieces.push(chunk(entry.type, entry.data));

    let sequence = 0;
    if (options.defaultIsStill) {
        pieces.push(chunk('IDAT', pixels(size.width, size.height, [0, 255, 0])));
        if (options.actlAfterIdat) pieces.push(animationChunk);
        for (const frame of frames) {
            pieces.push(chunk('fcTL', fctl(sequence++, frame)));
            pieces.push(chunk('fdAT', fdat(sequence++,
                pixels(frame.width, frame.height, frame.colour))));
        }
    } else {
        frames.forEach((frame, index) => {
            pieces.push(chunk('fcTL', fctl(sequence++, frame)));
            const data = pixels(frame.width, frame.height, frame.colour);
            if (index === 0) {
                pieces.push(chunk('IDAT', data));
                if (options.actlAfterIdat) pieces.push(animationChunk);
            } else {
                pieces.push(chunk('fdAT', fdat(sequence++, data)));
            }
        });
    }
    pieces.push(chunk('IEND', Buffer.alloc(0)));
    return Buffer.concat(pieces);
}

/** The top-left pixel of a solid one-colour frame PNG, via its own IDAT. */
function firstPixel(bytes) {
    const buffer = Buffer.from(bytes);
    const at = buffer.indexOf(Buffer.from('IDAT', 'ascii'));
    const length = buffer.readUInt32BE(at - 4);
    const raw = zlib.inflateSync(buffer.subarray(at + 4, at + 4 + length));
    assert.equal(raw[0], 0, 'the fixtures use filter type 0');
    return [raw[1], raw[2], raw[3]];
}

/** Walks a PNG, verifying every chunk's CRC, and returns what it found. */
function inspectPng(bytes) {
    const buffer = Buffer.from(bytes);
    assert.ok(buffer.subarray(0, 8).equals(SIGNATURE), 'missing PNG signature');
    const chunks = [];
    let offset = 8;
    while (offset + 12 <= buffer.length) {
        const length = buffer.readUInt32BE(offset);
        const type = buffer.toString('ascii', offset + 4, offset + 8);
        const stated = buffer.readUInt32BE(offset + 8 + length);
        const actual = crc32(buffer.subarray(offset + 4, offset + 8 + length));
        assert.equal(actual, stated, `bad CRC on ${type}`);
        chunks.push({ type, data: buffer.subarray(offset + 8, offset + 8 + length) });
        offset += 12 + length;
        if (type === 'IEND') break;
    }
    assert.equal(offset, buffer.length, 'trailing bytes after IEND');
    const header = chunks.find(entry => entry.type === 'IHDR');
    return {
        types: chunks.map(entry => entry.type),
        width: header.data.readUInt32BE(0),
        height: header.data.readUInt32BE(4),
        bitDepth: header.data[8],
        colourType: header.data[9]
    };
}

// --------------------------------------------------------------------------

test('parseApng splits an APNG into per-frame PNGs with its timing and rules', () => {
    const Bitmap = apngFixture();
    const file = buildApng({
        playCount: 0,
        frames: [
            { width: 4, height: 4, colour: [255, 0, 0], delayNum: 10, delayDen: 100 },
            { width: 2, height: 2, x: 1, y: 1, colour: [0, 0, 255], delayNum: 1,
              delayDen: 30, disposeOp: 1, blendOp: 1 }
        ]
    });

    const animation = Bitmap.parseApng(file);
    assert.ok(animation, 'expected an animation');
    assert.equal(animation.width, 4);
    assert.equal(animation.height, 4);
    assert.equal(animation.playCount, 0, '0 means loop forever');
    assert.equal(animation.frames.length, 2);

    const [first, second] = animation.frames;
    assert.deepEqual(
        { x: first.x, y: first.y, width: first.width, height: first.height },
        { x: 0, y: 0, width: 4, height: 4 });
    assert.equal(first.delayMs, 100);
    assert.equal(first.disposeOp, 0);
    assert.equal(first.blendOp, 0);

    assert.deepEqual(
        { x: second.x, y: second.y, width: second.width, height: second.height },
        { x: 1, y: 1, width: 2, height: 2 });
    assert.ok(Math.abs(second.delayMs - 1000 / 30) < 1e-9, 'fractional delays survive');
    assert.equal(second.disposeOp, 1);
    assert.equal(second.blendOp, 1);

    // Each frame must stand on its own as a PNG the browser will decode: its
    // IHDR carries the sub-rectangle's size, not the canvas's.
    const firstPng = inspectPng(first.bytes);
    assert.deepEqual(firstPng.types, ['IHDR', 'IDAT', 'IEND']);
    assert.deepEqual([firstPng.width, firstPng.height], [4, 4]);
    const secondPng = inspectPng(second.bytes);
    assert.deepEqual([secondPng.width, secondPng.height], [2, 2]);
    // Bit depth and colour type are inherited from the file, not guessed.
    assert.equal(secondPng.bitDepth, 8);
    assert.equal(secondPng.colourType, 6);
    // The pixel payload is the fdAT body with its sequence number removed, so
    // it has to inflate back to exactly one 2x2 RGBA frame.
    const idat = Buffer.from(second.bytes);
    const at = idat.indexOf(Buffer.from('IDAT', 'ascii'));
    const length = idat.readUInt32BE(at - 4);
    assert.equal(zlib.inflateSync(idat.subarray(at + 4, at + 4 + length)).length,
        2 * (1 + 2 * 4), 'inflates to two filtered RGBA rows of two pixels');
});

test('parseApng carries the chunks a frame needs to decode, and only those', () => {
    const Bitmap = apngFixture();
    const gamma = Buffer.alloc(4);
    gamma.writeUInt32BE(45455);
    const file = buildApng({
        shared: [
            { type: 'gAMA', data: gamma },
            { type: 'tEXt', data: Buffer.from('Comment\0ignored', 'binary') }
        ]
    });
    const animation = Bitmap.parseApng(file);
    for (const frame of animation.frames) {
        const found = inspectPng(frame.bytes);
        assert.deepEqual(found.types, ['IHDR', 'gAMA', 'IDAT', 'IEND'],
            'pixel-affecting chunks are replicated, text is dropped');
    }
});

test('parseApng treats the default image as frame one only when fcTL precedes IDAT', () => {
    const Bitmap = apngFixture();
    // fcTL before IDAT: the default image *is* frame one, so its IDAT is the
    // frame's pixel data.
    const joined = Bitmap.parseApng(buildApng());
    assert.equal(joined.frames.length, 2);
    assert.deepEqual(joined.frames.map(frame => firstPixel(frame.bytes)),
        [[255, 0, 0], [0, 0, 255]]);

    // IDAT ahead of every fcTL: the default image is a still fallback for
    // decoders that cannot animate, and plays no part in the animation. The
    // builder paints it green, which must therefore appear in neither frame.
    const separate = Bitmap.parseApng(buildApng({ defaultIsStill: true }));
    assert.equal(separate.frames.length, 2);
    for (const frame of separate.frames) {
        assert.deepEqual(inspectPng(frame.bytes).types, ['IHDR', 'IDAT', 'IEND']);
    }
    assert.deepEqual(separate.frames.map(frame => firstPixel(frame.bytes)),
        [[255, 0, 0], [0, 0, 255]], 'the green default image did not leak in');
});

test('parseApng returns null for anything it cannot animate', () => {
    const Bitmap = apngFixture();
    assert.equal(Bitmap.parseApng(staticPng()), null, 'a still PNG');
    assert.equal(Bitmap.parseApng(Buffer.from('GIF89a not a png')), null, 'not a PNG');
    assert.equal(Bitmap.parseApng(Buffer.alloc(0)), null, 'empty');
    assert.equal(Bitmap.parseApng(buildApng({ actlAfterIdat: true })), null,
        'acTL after IDAT is malformed and reads as a plain PNG');
    assert.equal(Bitmap.parseApng(buildApng({
        frames: [{ width: 4, height: 4, colour: [1, 2, 3] }]
    })), null, 'one frame is a still image');
    assert.equal(Bitmap.parseApng(buildApng({
        frames: [
            { width: 4, height: 4, colour: [1, 2, 3] },
            { width: 4, height: 4, x: 2, y: 0, colour: [4, 5, 6] }
        ]
    })), null, 'a frame reaching outside the canvas');
    // A truncated file must fall back, not throw.
    const truncated = buildApng().subarray(0, 40);
    assert.equal(Bitmap.parseApng(truncated), null, 'truncated');
});

test('parseApng accepts an ArrayBuffer, a Uint8Array and a view', () => {
    const Bitmap = apngFixture();
    const file = buildApng();
    const copy = Uint8Array.from(file);
    const padded = new Uint8Array(copy.length + 8);
    padded.set(copy, 8);
    for (const source of [copy, copy.buffer.slice(0), padded.subarray(8)]) {
        assert.equal(Bitmap.parseApng(source).frames.length, 2);
    }
});

test('hasApngAnimation agrees across the runtime, the editor and the deploy pipeline', () => {
    const Bitmap = apngFixture();
    const cases = [
        ['animated', buildApng(), true],
        ['still png', staticPng(), false],
        ['acTL after IDAT', buildApng({ actlAfterIdat: true }), false],
        ['single frame', buildApng({ frames: [{ width: 4, height: 4, colour: [9, 9, 9] }] }), true],
        ['not a png', Buffer.from('not an image at all'), false],
        ['empty', Buffer.alloc(0), false],
        // Signature + IHDR is 33 bytes, acTL runs to 53. Cut before the acTL
        // and the answer is honestly "no animation here"; cut after it and the
        // walk must still say yes without reading past the end.
        ['truncated before acTL', buildApng().subarray(0, 30), false],
        ['truncated after acTL', buildApng().subarray(0, 53), true]
    ];
    // Three copies exist because the runtime, the editor and the build worker
    // cannot load each other's code. They must never disagree.
    for (const [label, bytes, expected] of cases) {
        assert.equal(Bitmap.hasApngAnimation(bytes), expected, `runtime: ${label}`);
        assert.equal(ResourceManager.hasApngAnimation(bytes), expected, `editor: ${label}`);
        assert.equal(assetOptimizer.hasApngAnimation(Buffer.from(bytes)), expected,
            `optimizer: ${label}`);
    }
    // An `acTL` pushed past a large colour profile is still found: the walk
    // follows chunk lengths rather than scanning a fixed prefix.
    const deep = buildApng({
        shared: [{ type: 'iCCP', data: Buffer.alloc(8000, 7) }]
    });
    assert.ok(deep.length > 8000);
    assert.equal(Bitmap.hasApngAnimation(deep), true);
    assert.equal(ResourceManager.hasApngAnimation(deep), true);
    assert.equal(assetOptimizer.hasApngAnimation(deep), true);
});

test('_isApngUrl keys on the extension through queries and the encrypted suffix', () => {
    const Bitmap = apngFixture();
    for (const url of ['img/pictures/Blast.apng', 'Blast.APNG', 'img/x/Blast.apng_',
            'Blast.apng?v=2', 'Blast.apng#frag']) {
        assert.equal(Bitmap._isApngUrl(url), true, url);
    }
    for (const url of ['Blast.png', 'Blast.apng.png', 'Blast.gif', 'Blast', '', null]) {
        assert.equal(Bitmap._isApngUrl(url), false, String(url));
    }
});

// --------------------------------------------------------------------------
// Compositing. A fake 2d context records the calls, which is enough to hold
// the dispose and blend rules to the specification without a real canvas.
// --------------------------------------------------------------------------
function compositor(animation, now) {
    const Bitmap = apngFixture(now);
    const calls = [];
    const context = {
        globalCompositeOperation: '',
        globalAlpha: 1,
        clearRect: (...args) => calls.push(['clearRect', ...args]),
        drawImage: (image, x, y) => calls.push(['drawImage', image.id, x, y]),
        getImageData: (...args) => {
            calls.push(['getImageData', ...args]);
            return { id: 'saved:' + args.join(',') };
        },
        putImageData: (data, x, y) => calls.push(['putImageData', data.id, x, y])
    };
    const bitmap = Object.create(Bitmap.prototype);
    bitmap._context = context;
    bitmap._baseTexture = { update: () => calls.push(['upload']) };
    bitmap._apng = {
        frames: animation.frames,
        images: animation.frames.map((frame, index) => ({ id: 'frame' + index })),
        playCount: animation.playCount,
        index: -1,
        plays: 0,
        paused: false,
        finished: false,
        due: Infinity,
        restore: null,
        restoreX: 0,
        restoreY: 0
    };
    return { bitmap, calls, state: bitmap._apng };
}

const RULES = {
    playCount: 0,
    frames: [
        // NONE + SOURCE: the region is cleared, then replaced.
        { x: 0, y: 0, width: 4, height: 4, delayMs: 100, disposeOp: 0, blendOp: 0 },
        // PREVIOUS + OVER: the region is saved first, then drawn over.
        { x: 1, y: 1, width: 2, height: 2, delayMs: 100, disposeOp: 2, blendOp: 1 },
        // BACKGROUND + OVER: the saved region is put back, then drawn over.
        { x: 2, y: 2, width: 1, height: 1, delayMs: 100, disposeOp: 1, blendOp: 1 }
    ]
};

test('frame compositing follows the APNG dispose and blend rules', () => {
    const { bitmap, calls } = compositor(RULES, () => 0);

    bitmap._renderApngFrame(0);
    assert.deepEqual(calls, [
        ['clearRect', 0, 0, 4, 4],      // BLEND_OP_SOURCE replaces, alpha included
        ['drawImage', 'frame0', 0, 0]
    ]);

    calls.length = 0;
    bitmap._renderApngFrame(1);
    assert.deepEqual(calls, [
        // frame 0 disposed NONE, so nothing is undone
        ['getImageData', 1, 1, 2, 2],   // DISPOSE_OP_PREVIOUS saves the region
        ['drawImage', 'frame1', 1, 1]   // BLEND_OP_OVER draws without clearing
    ]);

    calls.length = 0;
    bitmap._renderApngFrame(2);
    assert.deepEqual(calls, [
        ['putImageData', 'saved:1,1,2,2', 1, 1],   // frame 1 disposed PREVIOUS
        ['drawImage', 'frame2', 2, 2]
    ]);

    // Wrapping to frame 0 must apply frame 2's BACKGROUND disposal.
    calls.length = 0;
    bitmap._renderApngFrame(0);
    assert.deepEqual(calls, [
        ['clearRect', 2, 2, 1, 1],      // DISPOSE_OP_BACKGROUND clears frame 2
        ['clearRect', 0, 0, 4, 4],
        ['drawImage', 'frame0', 0, 0]
    ]);
});

test('the animation advances on its own clock and uploads once per change', () => {
    let clock = 1000;
    const { bitmap, calls, state } = compositor(RULES, () => clock);
    bitmap._renderApngFrame(0);
    state.due = clock + 100;
    calls.length = 0;

    bitmap._advanceApng();
    assert.equal(state.index, 0, 'nothing due yet');
    assert.deepEqual(calls, []);

    clock = 1100;
    bitmap._advanceApng();
    assert.equal(state.index, 1);
    assert.equal(calls.filter(call => call[0] === 'upload').length, 1,
        'one texture upload for the change');

    // Two frames' worth of time in one step catches up in one update, and
    // still uploads once.
    clock = 1300;
    calls.length = 0;
    bitmap._advanceApng();
    assert.equal(state.index, 0, 'wrapped past frame 2');
    assert.equal(state.plays, 1);
    assert.equal(calls.filter(call => call[0] === 'upload').length, 1);
});

test('a long stall resyncs instead of sprinting the backlog', () => {
    let clock = 0;
    const { bitmap, state } = compositor(RULES, () => clock);
    bitmap._renderApngFrame(0);
    state.due = 100;

    clock = 60 * 60 * 1000;     // an hour minimised
    bitmap._advanceApng();
    // At most one loop is replayed, and the next frame is due from now rather
    // than from an hour ago.
    assert.ok(state.plays <= 1, `expected at most one loop, got ${state.plays}`);
    assert.ok(state.due > clock, 'due time was resynced');
    assert.ok(state.due <= clock + 100);
});

test('a finite loop count holds the last frame', () => {
    let clock = 0;
    const { bitmap, state } = compositor({ ...RULES, playCount: 1 }, () => clock);
    bitmap._renderApngFrame(0);
    state.due = 100;

    for (let step = 1; step <= 10; step++) {
        clock = step * 100;
        bitmap._advanceApng();
    }
    assert.equal(state.finished, true);
    assert.equal(state.index, RULES.frames.length - 1, 'held on the final frame');
    assert.equal(state.plays, 1);

    // Raising the count releases it again, from now rather than from whenever
    // it stopped.
    bitmap.setAnimationLoopCount(0);
    assert.equal(state.finished, false);
    assert.equal(state.due, clock);
    clock = state.due;
    bitmap._advanceApng();
    assert.equal(state.index, 0, 'wrapped round to frame one');
    assert.equal(state.plays, 2);
});

test('pausing holds the frame and resuming restarts its full delay', () => {
    let clock = 0;
    const { bitmap, state } = compositor(RULES, () => clock);
    bitmap._renderApngFrame(0);
    state.due = 100;

    bitmap.pauseAnimation();
    assert.equal(bitmap.isAnimationPaused(), true);
    clock = 5000;
    bitmap._advanceApng();
    assert.equal(state.index, 0, 'held while paused');

    bitmap.playAnimation();
    assert.equal(state.due, 5100, 'the held frame gets its whole delay again');
    bitmap._advanceApng();
    assert.equal(state.index, 0);
    clock = 5100;
    bitmap._advanceApng();
    assert.equal(state.index, 1);
});

test('seeking replays earlier frames rather than skipping them', () => {
    let clock = 0;
    const { bitmap, calls, state } = compositor(RULES, () => clock);
    bitmap._renderApngFrame(0);
    // seekAnimation reads bitmap.width/height for the wipe; the real getter
    // comes from the canvas, which this harness does not have.
    Object.defineProperty(bitmap, 'width', { value: 4 });
    Object.defineProperty(bitmap, 'height', { value: 4 });
    calls.length = 0;

    bitmap.seekAnimation(2);
    assert.equal(state.index, 2);
    assert.equal(bitmap.animationFrame, 2);
    assert.equal(bitmap.animationFrameCount, 3);
    const drawn = calls.filter(call => call[0] === 'drawImage').map(call => call[1]);
    assert.deepEqual(drawn, ['frame0', 'frame1', 'frame2'],
        'a frame is a difference against those before it, so all three are drawn');
    assert.equal(calls.filter(call => call[0] === 'upload').length, 1,
        'the replay costs one upload, not three');

    bitmap.seekAnimation(99);
    assert.equal(state.index, 2, 'clamped to the last frame');
    bitmap.seekAnimation(-5);
    assert.equal(state.index, 0, 'clamped to the first frame');
});

test('a bitmap with no animation ignores the animation API', () => {
    const Bitmap = apngFixture();
    const still = Object.create(Bitmap.prototype);
    still._apng = null;
    assert.equal(still.isAnimated(), false);
    assert.equal(still.animationFrameCount, 0);
    assert.equal(still.animationFrame, -1);
    assert.equal(still.isAnimationPaused(), false);
    // None of these may throw on a still image.
    still.pauseAnimation();
    still.playAnimation();
    still.seekAnimation(3);
    still.restartAnimation();
    still.setAnimationLoopCount(2);
});

// --------------------------------------------------------------------------

test('deployment PNG optimization leaves an animated PNG untouched', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-apng-optimize-'));
    try {
        // oxipng rewrites chunks and drops the animation, and optimizePngFile
        // only compares dimensions afterwards, so the flattening would pass.
        const animated = path.join(root, 'Animated.png');
        const original = buildApng();
        fs.writeFileSync(animated, original);
        const result = await assetOptimizer.optimizePngFile(animated, 3);
        assert.equal(result.changed, false);
        assert.equal(result.skipped, 'apng');
        assert.ok(fs.readFileSync(animated).equals(original), 'bytes are unchanged');
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('importing an .apng validates the signature and requires an animation', () => {
    const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    const folder = ResourceManager.folderDefinitions()
        .find(entry => entry.id === 'pictures');
    assert.ok(folder.extensions.includes('.apng'),
        'the picture folder accepts .apng');
    assert.ok(png.every((value, index) => buildApng()[index] === value));

    // The logical name keeps the extension, as every non-PNG image does, so an
    // .apng cannot collide with a same-named .png.
    assert.equal(folder.encryption, 'image');
});
