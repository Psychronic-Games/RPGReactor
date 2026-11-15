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

function opusFile(inputRate, comments) {
    const head = Buffer.alloc(19);
    head.write('OpusHead', 0, 'ascii');
    head[8] = 1; // version
    head[9] = 2; // channels
    head.writeUInt16LE(312, 10); // pre-skip
    head.writeUInt32LE(inputRate, 12);
    const tags = Buffer.concat([Buffer.from('OpusTags', 'ascii'), vorbisCommentBody(comments)]);
    return Buffer.concat([oggPage(0, head), oggPage(1, tags)]);
}

test('OGG Opus reads OpusTags at the source rate OpusHead records', () => {
    const bytes = opusFile(44100, ['ENCODER=opusenc', 'LOOPSTART=88200', 'LOOPLENGTH=132300']);
    assert.deepEqual(LoopTags.parseLoopTags(bytes), { loopStart: 88200, loopLength: 132300, sampleRate: 44100, opusInputRate: true, needMore: false });
    const points = LoopTags.loopPointsFromBytes(bytes);
    assert.deepEqual({ start: points.start, end: points.end }, { start: 2, end: 5 });
    assert.deepEqual(points.at48k, { start: 1.8375, end: 4.59375 });
});

test('fitLoopPoints reads an Opus loop at 48 kHz only when it overruns the track at the header rate', () => {
    // Header 44100, counted at 48 kHz: 7828363 samples is the whole 163.09 s track.
    const overrun = LoopTags.loopPointsFromBytes(opusFile(44100, ['LOOPSTART=96000', 'LOOPLENGTH=7732363']));
    assert.deepEqual(LoopTags.fitLoopPoints(overrun, 163.09), { start: 2, end: 7828363 / 48000 });
    // Length not known yet: the recorded rate holds until it is.
    assert.equal(LoopTags.fitLoopPoints(overrun, NaN), overrun);
    // Fits at the recorded rate: kept, even though it would fit at 48 kHz too.
    const fits = LoopTags.loopPointsFromBytes(opusFile(44100, ['LOOPSTART=88200', 'LOOPLENGTH=132300']));
    assert.equal(LoopTags.fitLoopPoints(fits, 6), fits);
    // Not Opus, or a 48 kHz header: nothing to choose between.
    const flac = LoopTags.loopPointsFromBytes(flacFile(44100, ['LOOPSTART=0', 'LOOPLENGTH=7828363']));
    assert.equal(LoopTags.fitLoopPoints(flac, 163.09), flac);
    assert.equal(LoopTags.loopPointsFromBytes(opusFile(48000, ['LOOPSTART=0', 'LOOPLENGTH=100'])).at48k, undefined);
});

test('OGG Opus with no recorded rate converts at 48 kHz, and reads LOOP_START/LOOP_END', () => {
    const bytes = opusFile(0, ['loop_end=5967968', 'loop_start=2895840']);
    const tags = LoopTags.parseLoopTags(bytes);
    assert.equal(tags.sampleRate, 48000);
    assert.equal(tags.loopStart, 2895840);
    assert.equal(tags.loopLength, 5967968 - 2895840);
});

test('a prefix that cuts the OpusTags packet off asks for more', () => {
    const bytes = opusFile(48000, ['LOOPSTART=48000', 'LOOPLENGTH=96000']);
    const cut = LoopTags.parseLoopTags(bytes.subarray(0, bytes.length - 8));
    assert.equal(cut.needMore, true);
    assert.equal(cut.loopLength, 0);
});

test('LOOP_START/LOOP_END count on FLAC and Vorbis only without a LOOPLENGTH', () => {
    assert.deepEqual(LoopTags.loopPointsFromBytes(flacFile(1000, ['LOOP_START=1000', 'LOOP_END=3000'])), { start: 1, end: 3 });
    assert.deepEqual(LoopTags.loopPointsFromBytes(flacFile(1000,
        ['LOOP_START=1000', 'LOOP_END=3000', 'LOOPSTART=2000', 'LOOPLENGTH=1000'])), { start: 2, end: 3 });
    // The runtime's Vorbis reader shares the FLAC/Opus comment reader, so the preview does too.
    assert.deepEqual(LoopTags.loopPointsFromBytes(oggFile(1000, ['loop_start=1000', 'loop_end=3000'])), { start: 1, end: 3 });
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
    // The one assignment is setChannelLoop's fallback for when the loop
    // controller is missing; nothing else may hand the media element a
    // whole-file loop behind the loop points.
    assert.equal(rawAssignments.length, 1);
    assert.match(source, /setChannelLoop\(channel, wanted\)[\s\S]*?loopPlayback\.setLoop\(channel\.loopWanted\)[\s\S]*?else channel\.audio\.loop = channel\.loopWanted/);
    assert.match(source, /loadLoopPoints\(currentChannel, track\)/);
    assert.match(source, /loadLoopPoints\(channel, channel\.currentTrack\)/);
    assert.match(source, /RRAudioLoopTags/);
});

// A media element stand-in for attachLoopPlayback: the properties and events
// the controller uses, with frames driven by hand.
function fakeAudio({ duration = 10 } = {}) {
    const listeners = new Map();
    const audio = {
        currentTime: 0, duration, paused: true, ended: false, loop: false, plays: 0,
        addEventListener(type, fn) { (listeners.get(type) || listeners.set(type, new Set()).get(type)).add(fn); },
        removeEventListener(type, fn) { listeners.get(type)?.delete(fn); },
        emit(type) { for (const fn of [...(listeners.get(type) || [])]) fn(); },
        listenerCount() { let n = 0; for (const set of listeners.values()) n += set.size; return n; },
        play() { this.paused = false; this.ended = false; this.plays++; this.emit('play'); return Promise.resolve(); }
    };
    return audio;
}

function withFrames(run) {
    const queue = [];
    const saved = { raf: globalThis.requestAnimationFrame, caf: globalThis.cancelAnimationFrame };
    globalThis.requestAnimationFrame = fn => { queue.push(fn); return queue.length; };
    globalThis.cancelAnimationFrame = id => { queue[id - 1] = null; };
    const frame = () => { const due = queue.splice(0); for (const fn of due) if (fn) fn(); };
    try {
        return run(frame);
    } finally {
        globalThis.requestAnimationFrame = saved.raf;
        globalThis.cancelAnimationFrame = saved.caf;
    }
}

test('loop playback wraps at the loop points, keeping the overshoot', () => withFrames(frame => {
    const audio = fakeAudio();
    const loop = LoopTags.attachLoopPlayback(audio, { loop: true });
    assert.equal(audio.loop, true, 'no points yet: the whole file loops');
    loop.setPoints({ start: 2, end: 6 });
    assert.equal(audio.loop, false, 'with points the controller wraps, not the element');
    audio.play();
    audio.currentTime = 5.9;
    frame();
    assert.equal(audio.currentTime, 5.9);
    audio.currentTime = 6.25;
    frame();
    assert.ok(Math.abs(audio.currentTime - 2.25) < 1e-9, `wrapped to ${audio.currentTime}`);
}));

test('loop playback off plays through, and a file without points loops whole only when on', () => withFrames(frame => {
    const audio = fakeAudio();
    const loop = LoopTags.attachLoopPlayback(audio, { loop: false });
    loop.setPoints({ start: 2, end: 6 });
    audio.play();
    audio.currentTime = 6.5;
    frame();
    assert.equal(audio.currentTime, 6.5, 'looping off: no wrap');
    audio.ended = true;
    audio.emit('ended');
    assert.equal(audio.plays, 1, 'looping off: an ended track stays ended');
    loop.setPoints(null);
    assert.equal(audio.loop, false);
    loop.setLoop(true);
    assert.equal(audio.loop, true);
    loop.setLoop(false);
    assert.equal(audio.loop, false);
}));

test('loop playback wraps a loop that ends with the file, and plays a seeked tail out', () => withFrames(frame => {
    const audio = fakeAudio({ duration: 6 });
    const loop = LoopTags.attachLoopPlayback(audio, { loop: true });
    loop.setPoints({ start: 2, end: 6 });
    audio.play();
    audio.currentTime = 6;
    audio.paused = true;
    audio.ended = true;
    audio.emit('ended');
    assert.equal(audio.currentTime, 2);
    assert.equal(audio.plays, 2, 'the wrap restarts playback');

    const tail = fakeAudio({ duration: 10 });
    const tailLoop = LoopTags.attachLoopPlayback(tail, { loop: true });
    tailLoop.setPoints({ start: 2, end: 6 });
    tail.play();
    tail.currentTime = 8;
    tail.emit('seeked');
    frame();
    assert.equal(tail.currentTime, 8, 'a seek past the loop end is not snapped back');
    tail.currentTime = 3;
    tail.emit('seeked');
    frame();
    tail.currentTime = 6.1;
    frame();
    assert.ok(Math.abs(tail.currentTime - 2.1) < 1e-9, 're-armed once before the end again');
}));

test('loop playback settles an Opus loop at 48 kHz once the track length is known', () => withFrames(() => {
    const audio = fakeAudio({ duration: NaN });
    const loop = LoopTags.attachLoopPlayback(audio, { loop: true });
    // 44.1 kHz header, but the counts only fit a 6.1 s track at 48 kHz.
    const points = { start: 2 * 48000 / 44100, end: 6 * 48000 / 44100, at48k: { start: 2, end: 6 } };
    loop.setPoints(points);
    assert.equal(loop.points.end, points.end, 'length unknown: the recorded rate holds');
    audio.duration = 6.1;
    audio.emit('loadedmetadata');
    assert.deepEqual(loop.points, { start: 2, end: 6 });
}));

test('loop playback disposes its listeners and its frame watch', () => withFrames(frame => {
    const audio = fakeAudio();
    const loop = LoopTags.attachLoopPlayback(audio, { loop: true });
    loop.setPoints({ start: 2, end: 6 });
    audio.play();
    loop.dispose();
    assert.equal(audio.listenerCount(), 0);
    audio.currentTime = 7;
    frame();
    assert.equal(audio.currentTime, 7);
}));

test('the Resource Manager previews audio through the loop controller and disposes it', () => {
    const source = fs.readFileSync(path.join(editorRoot, 'src', 'ResourceManager.js'), 'utf8');
    assert.match(source, /attachLoopPlayback\(audio, \{ loop: toggle\.checked \}\)/);
    assert.match(source, /loopPointsFromFile\(record\.physicalAbsolutePath\)/);
    assert.match(source, /clearPreview\(\) \{[\s\S]*?this\.audioLoop\?\.dispose\(\)/);
});

test('the Audio Player channels loop through the shared controller', async () => {
    const vm = require('node:vm');
    const source = fs.readFileSync(path.join(editorRoot, 'src', 'AudioPlayer.js'), 'utf8');
    const tags = { ...LoopTags, loopPointsFromFile: async file => (file === 'Tagged.ogg' ? { start: 2, end: 6 } : null) };
    const AudioPlayer = vm.runInNewContext(`${source}\nAudioPlayer;`, { console, Intl, Symbol, window: { RRAudioLoopTags: tags } });
    const player = Object.create(AudioPlayer.prototype);
    const queue = [];
    const saved = { raf: globalThis.requestAnimationFrame, caf: globalThis.cancelAnimationFrame };
    globalThis.requestAnimationFrame = fn => { queue.push(fn); return queue.length; };
    globalThis.cancelAnimationFrame = id => { queue[id - 1] = null; };
    const frame = () => { for (const fn of queue.splice(0)) if (fn) fn(); };
    const settle = () => new Promise(resolve => setTimeout(resolve, 0));
    try {
        const channel = { audio: fakeAudio(), loopWanted: true, loopPlayback: null, currentTrack: null, playing: false };
        const tagged = { absolutePath: 'Tagged.ogg' };
        channel.currentTrack = tagged;
        player.loadLoopPoints(channel, tagged);
        assert.equal(channel.audio.loop, true, 'until the tags are read, the whole file loops');
        await settle();
        assert.deepEqual(channel.loopPlayback.points, { start: 2, end: 6 });
        assert.equal(channel.audio.loop, false);
        assert.equal(player.channelWrapsAtLoopPoints(channel), true);

        channel.audio.play();
        channel.audio.currentTime = 6.5;
        frame();
        assert.ok(Math.abs(channel.audio.currentTime - 2.5) < 1e-9);

        player.setChannelLoop(channel, false);
        assert.equal(player.channelWrapsAtLoopPoints(channel), false);
        channel.audio.currentTime = 6.5;
        frame();
        assert.equal(channel.audio.currentTime, 6.5, 'the loop switch reaches the controller');
        player.setChannelLoop(channel, true);

        // A read that answers after the track changed is dropped.
        const plain = { absolutePath: 'Plain.ogg' };
        player.loadLoopPoints(channel, tagged);
        channel.currentTrack = plain;
        player.loadLoopPoints(channel, plain);
        await settle();
        assert.equal(channel.loopPlayback.points, null);
        assert.equal(channel.audio.loop, true, 'an untagged track loops whole');
    } finally {
        globalThis.requestAnimationFrame = saved.raf;
        globalThis.cancelAnimationFrame = saved.caf;
    }
});

test('loop playback wraps on timeupdate too, for a window whose frames have stopped', () => withFrames(() => {
    const audio = fakeAudio();
    const loop = LoopTags.attachLoopPlayback(audio, { loop: true });
    loop.setPoints({ start: 2, end: 6 });
    audio.play();
    audio.currentTime = 6.5;
    audio.emit('timeupdate');
    assert.ok(Math.abs(audio.currentTime - 2.5) < 1e-9);
}));

test('a seek past the loop end is not wrapped by the seek\'s own timeupdate', () => withFrames(frame => {
    const audio = fakeAudio();
    const loop = LoopTags.attachLoopPlayback(audio, { loop: true });
    loop.setPoints({ start: 2, end: 6 });
    audio.play();
    audio.currentTime = 4;
    frame();
    // Browsers fire seeking, then timeupdate, then seeked.
    audio.emit('seeking');
    audio.currentTime = 8;
    frame();
    audio.emit('timeupdate');
    assert.equal(audio.currentTime, 8, 'nothing wraps while the seek is in flight');
    audio.emit('seeked');
    audio.emit('timeupdate');
    frame();
    assert.equal(audio.currentTime, 8, 'the tail plays out after the seek');
    // A new source abandons a seek whose seeked never comes.
    audio.emit('seeking');
    audio.emit('loadstart');
    audio.currentTime = 5;
    frame();
    audio.currentTime = 6.5;
    frame();
    assert.ok(Math.abs(audio.currentTime - 2.5) < 1e-9);
}));
