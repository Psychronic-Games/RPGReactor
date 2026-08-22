const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const workspaceRoot = path.resolve(__dirname, '..', '..');

function loadAudioRuntime(overrides = {}) {
    const source = fs.readFileSync(path.join(workspaceRoot, 'runtime', 'reactor_core.js'), 'utf8');
    const utilsStart = source.indexOf('function Utils()');
    const utilsEnd = source.indexOf('function Graphics()');
    const webAudioStart = source.indexOf('function WebAudio()');
    const webAudioEnd = source.indexOf('function Video()');
    assert.ok(utilsStart >= 0 && utilsEnd > utilsStart);
    assert.ok(webAudioStart >= 0 && webAudioEnd > webAudioStart);
    const context = {
        console,
        TextDecoder,
        document: { addEventListener() {}, removeEventListener() {} },
        window: { addEventListener() {} },
        navigator: { userAgent: '' },
        performance,
        URL,
        ...overrides
    };
    vm.runInNewContext(
        source.slice(utilsStart, utilsEnd) + '\n' + source.slice(webAudioStart, webAudioEnd),
        context);
    return context;
}

/** A WebAudio instance skeleton: prototype methods over cleared fields. */
function bareBuffer(context) {
    const buffer = Object.create(context.WebAudio.prototype);
    buffer._sampleRate = 0;
    buffer._loopStart = 0;
    buffer._loopLength = 0;
    buffer._fetchedSize = 0;
    buffer._fetchedData = [];
    buffer._data = null;
    buffer._sourceNodes = [];
    return buffer;
}

function u32le(value) {
    const buf = Buffer.alloc(4);
    buf.writeUInt32LE(value >>> 0);
    return buf;
}

function u32be(value) {
    const buf = Buffer.alloc(4);
    buf.writeUInt32BE(value >>> 0);
    return buf;
}

function toArrayBuffer(buf) {
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

// ── Fixtures ─────────────────────────────────────────────────────────

function buildWav({ sampleRate = 44100, loop = null } = {}) {
    const fmt = Buffer.concat([
        Buffer.from('fmt '), u32le(16),
        Buffer.from([1, 0, 2, 0]), u32le(sampleRate), u32le(sampleRate * 4),
        Buffer.from([4, 0, 16, 0])
    ]);
    const chunks = [fmt];
    if (loop) {
        const body = Buffer.alloc(36 + 24);
        body.writeUInt32LE(1, 28);           // cSampleLoops
        body.writeUInt32LE(loop.start, 44);  // first loop dwStart
        body.writeUInt32LE(loop.end, 48);    // first loop dwEnd
        chunks.push(Buffer.concat([Buffer.from('smpl'), u32le(body.length), body]));
    }
    chunks.push(Buffer.concat([Buffer.from('data'), u32le(8), Buffer.alloc(8)]));
    const payload = Buffer.concat(chunks);
    return Buffer.concat([
        Buffer.from('RIFF'), u32le(4 + payload.length), Buffer.from('WAVE'), payload
    ]);
}

function syncsafe(value) {
    return Buffer.from([
        (value >> 21) & 0x7f, (value >> 14) & 0x7f, (value >> 7) & 0x7f, value & 0x7f
    ]);
}

function txxxFrame(name, value, { v4 = false } = {}) {
    const body = Buffer.concat([
        Buffer.from([0]), // latin1
        Buffer.from(name, 'ascii'), Buffer.from([0]),
        Buffer.from(value, 'ascii')
    ]);
    const size = v4 ? syncsafe(body.length) : u32be(body.length);
    return Buffer.concat([Buffer.from('TXXX'), size, Buffer.from([0, 0]), body]);
}

function buildMp3(frames, { v4 = false } = {}) {
    const body = Buffer.concat(frames);
    const header = Buffer.concat([
        Buffer.from('ID3'), Buffer.from([v4 ? 4 : 3, 0, 0]), syncsafe(body.length)
    ]);
    // An MPEG1 Layer III header at 44100 Hz right after the tag.
    const frame = Buffer.from([0xff, 0xfb, 0x90, 0x00, 0, 0, 0, 0]);
    return Buffer.concat([header, body, frame]);
}

function flacBlock(type, body, last = false) {
    return Buffer.concat([
        Buffer.from([(last ? 0x80 : 0) | type]),
        Buffer.from([(body.length >> 16) & 0xff, (body.length >> 8) & 0xff, body.length & 0xff]),
        body
    ]);
}

function buildFlac({ sampleRate = 48000, comments = [] } = {}) {
    const streamInfo = Buffer.alloc(34);
    // 20-bit sample rate starting at byte 10.
    streamInfo[10] = (sampleRate >> 12) & 0xff;
    streamInfo[11] = (sampleRate >> 4) & 0xff;
    streamInfo[12] = (sampleRate & 0x0f) << 4;
    const commentParts = [u32le(7), Buffer.from('rr-test'), u32le(comments.length)];
    for (const comment of comments) {
        const encoded = Buffer.from(comment, 'utf8');
        commentParts.push(u32le(encoded.length), encoded);
    }
    return Buffer.concat([
        Buffer.from('fLaC'),
        flacBlock(0, streamInfo),
        flacBlock(4, Buffer.concat(commentParts), true)
    ]);
}

// ── Loop metadata ────────────────────────────────────────────────────

test('WAV smpl chunk yields sample rate and loop points', () => {
    const context = loadAudioRuntime();
    const buffer = bareBuffer(context);
    buffer._readLoopComments(toArrayBuffer(buildWav({
        sampleRate: 22050, loop: { start: 1000, end: 5000 }
    })));
    assert.equal(buffer._sampleRate, 22050);
    assert.equal(buffer._loopStart, 1000);
    assert.equal(buffer._loopLength, 4000);
});

test('WAV without smpl keeps whole-track looping defaults', () => {
    const context = loadAudioRuntime();
    const buffer = bareBuffer(context);
    buffer._readLoopComments(toArrayBuffer(buildWav({ sampleRate: 44100 })));
    assert.equal(buffer._sampleRate, 44100);
    assert.equal(buffer._loopStart, 0);
    assert.equal(buffer._loopLength, 0);
});

test('WAV parsing tolerates a truncated streaming prefix', () => {
    const context = loadAudioRuntime();
    const buffer = bareBuffer(context);
    const wav = buildWav({ loop: { start: 10, end: 20 } });
    buffer._readLoopComments(toArrayBuffer(wav.subarray(0, 21)));
    assert.equal(buffer._loopLength, 0);
    buffer._readLoopComments(toArrayBuffer(wav));
    assert.equal(buffer._loopLength, 10);
});

test('MP3 ID3v2.3 TXXX loop tags and frame-header sample rate', () => {
    const context = loadAudioRuntime();
    const buffer = bareBuffer(context);
    buffer._readLoopComments(toArrayBuffer(buildMp3([
        txxxFrame('LOOPSTART', '2000'),
        txxxFrame('LOOPLENGTH', '8000')
    ])));
    assert.equal(buffer._loopStart, 2000);
    assert.equal(buffer._loopLength, 8000);
    assert.equal(buffer._sampleRate, 44100);
});

test('MP3 ID3v2.4 syncsafe frame sizes parse the same', () => {
    const context = loadAudioRuntime();
    const buffer = bareBuffer(context);
    buffer._readLoopComments(toArrayBuffer(buildMp3([
        txxxFrame('loopstart', '123', { v4: true }),
        txxxFrame('LOOPLENGTH', '456', { v4: true })
    ], { v4: true })));
    assert.equal(buffer._loopStart, 123);
    assert.equal(buffer._loopLength, 456);
});

test('MP3 without loop tags keeps defaults', () => {
    const context = loadAudioRuntime();
    const buffer = bareBuffer(context);
    buffer._readLoopComments(toArrayBuffer(buildMp3([txxxFrame('MOOD', 'epic')])));
    assert.equal(buffer._loopStart, 0);
    assert.equal(buffer._loopLength, 0);
});

test('FLAC STREAMINFO and vorbis comments yield rate and loop points', () => {
    const context = loadAudioRuntime();
    const buffer = bareBuffer(context);
    buffer._readLoopComments(toArrayBuffer(buildFlac({
        sampleRate: 48000,
        comments: ['ARTIST=Reactor', 'LOOPSTART=100', 'LOOPLENGTH=200']
    })));
    assert.equal(buffer._sampleRate, 48000);
    assert.equal(buffer._loopStart, 100);
    assert.equal(buffer._loopLength, 200);
});

// ── Extension resolution ─────────────────────────────────────────────

test('resolveAudioExtension finds the on-disk format, exact match first', () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-audio-ext-'));
    try {
        fs.mkdirSync(path.join(projectRoot, 'audio', 'bgm'), { recursive: true });
        fs.writeFileSync(path.join(projectRoot, 'audio', 'bgm', 'Theme.mp3'), 'x');
        fs.writeFileSync(path.join(projectRoot, 'audio', 'bgm', 'Both.ogg'), 'x');
        fs.writeFileSync(path.join(projectRoot, 'audio', 'bgm', 'Both.wav'), 'x');
        fs.writeFileSync(path.join(projectRoot, 'audio', 'bgm', 'Secret.flac_'), 'x');

        const context = loadAudioRuntime({
            require,
            process: { mainModule: { filename: path.join(projectRoot, 'index.html') } }
        });
        const utils = context.Utils;
        assert.equal(utils.resolveAudioExtension('audio/bgm/Theme.ogg', ''),
            'audio/bgm/Theme.mp3');
        // The requested extension outranks the fallback order when present.
        assert.equal(utils.resolveAudioExtension('audio/bgm/Both.ogg', ''),
            'audio/bgm/Both.ogg');
        // Encrypted candidates carry the suffix during the existence check.
        assert.equal(utils.resolveAudioExtension('audio/bgm/Secret.ogg', '_'),
            'audio/bgm/Secret.flac');
        // Nothing on disk: the URL passes through for the error path to report.
        assert.equal(utils.resolveAudioExtension('audio/bgm/Missing.ogg', ''),
            'audio/bgm/Missing.ogg');
        // Non-audio URLs are never touched.
        assert.equal(utils.resolveAudioExtension('img/pictures/Theme.png', ''),
            'img/pictures/Theme.png');
    } finally {
        fs.rmSync(projectRoot, { recursive: true, force: true });
    }
});

test('web error fallback walks the other extensions, then restores the URL', () => {
    const context = loadAudioRuntime();
    const buffer = bareBuffer(context);
    const attempts = [];
    buffer._startLoading = function() { attempts.push(this._url); };
    buffer._url = 'audio/bgm/Theme.ogg';
    buffer._triedCaseCorrection = true; // isolate the extension chain
    for (let i = 0; i < 6; i++) buffer._onError();
    assert.deepEqual(attempts, [
        'audio/bgm/Theme.mp3',
        'audio/bgm/Theme.wav',
        'audio/bgm/Theme.flac',
        'audio/bgm/Theme.m4a'
    ]);
    assert.equal(buffer._url, 'audio/bgm/Theme.ogg');
    assert.equal(buffer._isError, true);
});

test('data received means a decode problem, not a wrong extension', () => {
    const context = loadAudioRuntime();
    const buffer = bareBuffer(context);
    buffer._startLoading = () => assert.fail('must not retry another extension');
    buffer._url = 'audio/bgm/Theme.ogg';
    buffer._triedCaseCorrection = true;
    buffer._data = new Uint8Array([1, 2, 3]);
    buffer._onError();
    assert.equal(buffer._isError, true);
    assert.equal(buffer._url, 'audio/bgm/Theme.ogg');
});
