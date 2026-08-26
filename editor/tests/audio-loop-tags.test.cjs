const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const editorRoot = path.resolve(__dirname, '..');
require(path.join(editorRoot, 'src', 'utils', 'EncryptedAssets.js'));
const LoopTags = require(path.join(editorRoot, 'src', 'utils', 'AudioLoopTags.js'));

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

function vorbisCommentBody(comments) {
    const parts = [u32le(7), Buffer.from('rr-test', 'ascii'), u32le(comments.length)];
    for (const comment of comments) {
        const encoded = Buffer.from(comment, 'utf8');
        parts.push(u32le(encoded.length), encoded);
    }
    return Buffer.concat(parts);
}

function lacing(length) {
    const laces = [];
    let remaining = length;
    while (remaining >= 255) {
        laces.push(255);
        remaining -= 255;
    }
    laces.push(remaining);
    return laces;
}

function oggPage(sequence, payload) {
    const laces = lacing(payload.length);
    const header = Buffer.alloc(27 + laces.length);
    header.write('OggS', 0, 'ascii');
    header.writeUInt32LE(0x1234, 14);
    header.writeUInt32LE(sequence, 18);
    header[26] = laces.length;
    laces.forEach((lace, i) => { header[27 + i] = lace; });
    return Buffer.concat([header, payload]);
}

function oggFile(sampleRate, comments) {
    const ident = Buffer.alloc(30);
    ident[0] = 1;
    ident.write('vorbis', 1, 'ascii');
    ident.writeUInt32LE(0, 7); // version
    ident[11] = 2; // channels
    ident.writeUInt32LE(sampleRate, 12);
    const comment = Buffer.concat([
        Buffer.from([3]), Buffer.from('vorbis', 'ascii'),
        vorbisCommentBody(comments), Buffer.from([1])
    ]);
    return Buffer.concat([oggPage(0, ident), oggPage(1, comment)]);
}

function flacBlock(type, body, last) {
    const header = Buffer.alloc(4);
    header[0] = type | (last ? 0x80 : 0);
    header[1] = (body.length >> 16) & 0xff;
    header[2] = (body.length >> 8) & 0xff;
    header[3] = body.length & 0xff;
    return Buffer.concat([header, body]);
}

function flacFile(sampleRate, comments) {
    const streamInfo = Buffer.alloc(34);
    // 20-bit sample rate, 3-bit channels-1, 5-bit bps-1 packed from byte 10.
    streamInfo[10] = (sampleRate >> 12) & 0xff;
    streamInfo[11] = (sampleRate >> 4) & 0xff;
    streamInfo[12] = ((sampleRate & 0x0f) << 4) | (1 << 1);
    return Buffer.concat([
        Buffer.from('fLaC', 'ascii'),
        flacBlock(0, streamInfo, false),
        flacBlock(4, vorbisCommentBody(comments), true)
    ]);
}

function id3Frame(id, body) {
    return Buffer.concat([Buffer.from(id, 'ascii'), u32be(body.length), Buffer.alloc(2), body]);
}

function txxx(name, value) {
    return id3Frame('TXXX', Buffer.concat([
        Buffer.from([0]), Buffer.from(name, 'latin1'), Buffer.from([0]), Buffer.from(value, 'latin1')
    ]));
}

function mp3File(frames, mpegHeader) {
    const body = Buffer.concat(frames);
    const size = body.length;
    const header = Buffer.from([
        0x49, 0x44, 0x33, 3, 0, 0,
        (size >> 21) & 0x7f, (size >> 14) & 0x7f, (size >> 7) & 0x7f, size & 0x7f
    ]);
    return Buffer.concat([header, body, mpegHeader, Buffer.alloc(64)]);
}

function wavFile(sampleRate, dataBytes, loop) {
    const fmt = Buffer.alloc(16);
    fmt.writeUInt16LE(1, 0);
    fmt.writeUInt16LE(2, 2);
    fmt.writeUInt32LE(sampleRate, 4);
    const chunks = [
        Buffer.from('fmt ', 'ascii'), u32le(16), fmt,
        Buffer.from('data', 'ascii'), u32le(dataBytes), Buffer.alloc(dataBytes)
    ];
    if (loop) {
        const smpl = Buffer.alloc(60);
        smpl.writeUInt32LE(1, 28); // one loop
        smpl.writeUInt32LE(loop.start, 44);
        smpl.writeUInt32LE(loop.end, 48);
        chunks.push(Buffer.from('smpl', 'ascii'), u32le(60), smpl);
    }
    const body = Buffer.concat(chunks);
    return Buffer.concat([Buffer.from('RIFF', 'ascii'), u32le(body.length + 4), Buffer.from('WAVE', 'ascii'), body]);
}

test('OGG vorbis comments give loop points in seconds', () => {
    const bytes = oggFile(48000, ['TITLE=Test', 'LOOPSTART=48000', 'LOOPLENGTH=96000']);
    assert.deepEqual(LoopTags.parseLoopTags(bytes), { loopStart: 48000, loopLength: 96000, sampleRate: 48000, needMore: false });
    assert.deepEqual(LoopTags.loopPointsFromBytes(bytes), { start: 1, end: 3 });
});

test('tag names are matched case-insensitively and a picture ahead of them is skipped', () => {
    const picture = 'METADATA_BLOCK_PICTURE=' + 'A'.repeat(4000);
    const bytes = oggFile(44100, [picture, 'loopstart=44100', 'LoopLength=44100']);
    assert.deepEqual(LoopTags.loopPointsFromBytes(bytes), { start: 1, end: 2 });
});

test('a track without loop tags, or with a zero loop length, has no loop points', () => {
    assert.equal(LoopTags.loopPointsFromBytes(oggFile(48000, ['TITLE=Plain'])), null);
    assert.equal(LoopTags.loopPointsFromBytes(oggFile(48000, ['LOOPSTART=100', 'LOOPLENGTH=0'])), null);
    assert.equal(LoopTags.loopPointsFromBytes(Buffer.from('not audio at all')), null);
});

test('a prefix that cuts the OGG comment packet off asks for more', () => {
    const bytes = oggFile(48000, ['LOOPSTART=48000', 'LOOPLENGTH=96000']);
    const cut = LoopTags.parseLoopTags(bytes.subarray(0, bytes.length - 8));
    assert.equal(cut.needMore, true);
    assert.equal(cut.loopLength, 0);
    assert.equal(LoopTags.parseLoopTags(bytes).needMore, false);
});

test('FLAC reads the STREAMINFO sample rate and the same vorbis comments', () => {
    const bytes = flacFile(44100, ['LOOPSTART=22050', 'LOOPLENGTH=44100']);
    assert.deepEqual(LoopTags.parseLoopTags(bytes), { loopStart: 22050, loopLength: 44100, sampleRate: 44100, needMore: false });
    assert.deepEqual(LoopTags.loopPointsFromBytes(bytes), { start: 0.5, end: 1.5 });
});

test('MP3 reads LOOPSTART/LOOPLENGTH TXXX frames and the MPEG frame sample rate', () => {
    const mpeg1 = Buffer.from([0xff, 0xfb, 0x90, 0x00]); // MPEG 1 Layer III, 44100 Hz
    const bytes = mp3File([id3Frame('TIT2', Buffer.from('\0Song')), txxx('LOOPSTART', '44100'), txxx('LOOPLENGTH', '88200')], mpeg1);
    assert.deepEqual(LoopTags.parseLoopTags(bytes), { loopStart: 44100, loopLength: 88200, sampleRate: 44100, needMore: false });
    assert.deepEqual(LoopTags.loopPointsFromBytes(bytes), { start: 1, end: 3 });

    const mpeg2 = Buffer.from([0xff, 0xf3, 0x90, 0x00]); // MPEG 2 Layer III, 22050 Hz
    assert.deepEqual(LoopTags.loopPointsFromBytes(mp3File([txxx('LOOPSTART', '22050'), txxx('LOOPLENGTH', '22050')], mpeg2)), { start: 1, end: 2 });
});

test('WAV reads the sampler chunk loop and the format chunk rate', () => {
    const bytes = wavFile(48000, 1000, { start: 24000, end: 72000 });
    assert.deepEqual(LoopTags.parseLoopTags(bytes), { loopStart: 24000, loopLength: 48000, sampleRate: 48000, needMore: false });
    assert.deepEqual(LoopTags.loopPointsFromBytes(bytes), { start: 0.5, end: 1.5 });
    assert.equal(LoopTags.loopPointsFromBytes(wavFile(48000, 1000, null)), null);
});

test('loop points read off the disk, including a WAV whose sampler chunk trails the audio data', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-loop-tags-'));
    try {
        const ogg = path.join(dir, 'Loop.ogg');
        fs.writeFileSync(ogg, oggFile(48000, ['LOOPSTART=96000', 'LOOPLENGTH=48000']));
        assert.deepEqual(await LoopTags.loopPointsFromFile(ogg), { start: 2, end: 3 });

        // Larger than the first prefix read, so the smpl chunk is only
        // reachable by reading the whole file.
        const wav = path.join(dir, 'Big.wav');
        fs.writeFileSync(wav, wavFile(44100, 300000, { start: 44100, end: 88200 }));
        assert.deepEqual(await LoopTags.loopPointsFromFile(wav), { start: 1, end: 2 });

        // Case-insensitive resolution, as every other asset read.
        assert.deepEqual(await LoopTags.loopPointsFromFile(path.join(dir, 'loop.OGG')), { start: 2, end: 3 });
        assert.equal(await LoopTags.loopPointsFromFile(path.join(dir, 'Missing.ogg')), null);
        assert.equal(await LoopTags.loopPointsFromFile(''), null);
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

test('the editor loads the loop-tag reader after the asset reader it depends on', () => {
    const html = fs.readFileSync(path.join(editorRoot, 'index.html'), 'utf8');
    const assets = html.indexOf('src/utils/EncryptedAssets.js');
    const loopTags = html.indexOf('src/utils/AudioLoopTags.js');
    const player = html.indexOf('src/AudioPlayer.js');
    assert.ok(assets >= 0 && loopTags > assets, 'AudioLoopTags.js follows EncryptedAssets.js');
    assert.ok(player > loopTags, 'AudioPlayer.js follows AudioLoopTags.js');
});

test('the Audio Player routes every loop switch through the loop-point aware setter', () => {
    const source = fs.readFileSync(path.join(editorRoot, 'src', 'AudioPlayer.js'), 'utf8');
    const rawAssignments = source.match(/audio\.loop\s*=/g) || [];
    // The one assignment lives inside setChannelLoop; nothing else may
    // hand the media element a whole-file loop behind the loop points.
    assert.equal(rawAssignments.length, 1);
    assert.match(source, /setChannelLoop\(channel, wanted\)[\s\S]*channel\.audio\.loop = channel\.loopWanted && !channel\.loopPoints/);
    assert.match(source, /loadLoopPoints\(currentChannel, track\)/);
    assert.match(source, /loadLoopPoints\(channel, channel\.currentTrack\)/);
    assert.match(source, /RRAudioLoopTags/);
});
