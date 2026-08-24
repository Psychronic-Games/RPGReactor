const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const editorRoot = path.resolve(__dirname, '..');
const EncryptedAssets = require(path.join(editorRoot, 'src', 'utils', 'EncryptedAssets.js'));
const CoverArt = require(path.join(editorRoot, 'src', 'utils', 'AudioCoverArt.js'));

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

function oggPage(serial, sequence, headerType, laces, payload) {
    const header = Buffer.alloc(27 + laces.length);
    header.write('OggS', 0, 'ascii');
    header[5] = headerType;
    header.writeUInt32LE(serial, 14);
    header.writeUInt32LE(sequence, 18);
    header[26] = laces.length;
    for (let i = 0; i < laces.length; i++) header[27 + i] = laces[i];
    return Buffer.concat([header, payload]);
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

function flacPictureBlock(mime, imageBytes) {
    return Buffer.concat([
        u32be(3), // front cover
        u32be(mime.length), Buffer.from(mime, 'ascii'),
        u32be(0), // empty description
        Buffer.alloc(16), // width/height/depth/palette
        u32be(imageBytes.length), imageBytes
    ]);
}

function commentPacket(magic, comments) {
    const parts = [magic, u32le(7), Buffer.from('rr-test', 'ascii'), u32le(comments.length)];
    for (const comment of comments) {
        const encoded = Buffer.from(comment, 'utf8');
        parts.push(u32le(encoded.length), encoded);
    }
    parts.push(Buffer.from([0x01])); // vorbis framing bit
    return Buffer.concat(parts);
}

// A minimal vorbis stream: identification packet on its own page, then the
// comment packet deliberately split across two pages (continuation flag) to
// exercise cross-page packet reassembly, then a setup packet.
function buildOgg(comments, magic = Buffer.from('\x03vorbis', 'binary')) {
    const serial = 0x52524354;
    const identification = Buffer.concat([Buffer.from('\x01vorbis', 'binary'), Buffer.alloc(23)]);
    const comment = commentPacket(magic, comments);
    const setup = Buffer.concat([Buffer.from('\x05vorbis', 'binary'), Buffer.alloc(10)]);

    const pages = [oggPage(serial, 0, 0x02, lacing(identification.length), identification)];
    if (comment.length > 510) {
        const head = comment.subarray(0, 510);
        const tail = comment.subarray(510);
        pages.push(oggPage(serial, 1, 0x00, [255, 255], head));
        pages.push(oggPage(serial, 2, 0x01, lacing(tail.length).concat(lacing(setup.length)),
            Buffer.concat([tail, setup])));
    } else {
        pages.push(oggPage(serial, 1, 0x00, lacing(comment.length).concat(lacing(setup.length)),
            Buffer.concat([comment, setup])));
    }
    return Buffer.concat(pages);
}

const imageBytes = Buffer.from('PNG-PIXELS-FOR-TEST-' + 'x'.repeat(700));
const pictureB64 = flacPictureBlock('image/png', imageBytes).toString('base64');
const expectedUrl = 'data:image/png;base64,' + imageBytes.toString('base64');

test('extracts METADATA_BLOCK_PICTURE spanning multiple pages', () => {
    const ogg = buildOgg(['ARTIST=Reactor', 'METADATA_BLOCK_PICTURE=' + pictureB64]);
    assert.ok(ogg.length > 510 + 27, 'fixture must actually span pages');
    const result = CoverArt.extractFromBytes(new Uint8Array(ogg));
    assert.equal(result.url, expectedUrl);
    assert.equal(result.needMore, false);
});

test('reports needMore when the comment packet is cut off', () => {
    const ogg = buildOgg(['METADATA_BLOCK_PICTURE=' + pictureB64]);
    const result = CoverArt.extractFromBytes(new Uint8Array(ogg.subarray(0, ogg.length - 60)));
    assert.equal(result.url, null);
    assert.equal(result.needMore, true);
});

test('returns no art for comment headers without pictures', () => {
    const ogg = buildOgg(['ARTIST=Reactor', 'TITLE=Theme']);
    const result = CoverArt.extractFromBytes(new Uint8Array(ogg));
    assert.equal(result.url, null);
    assert.equal(result.needMore, false);
});

test('supports the legacy COVERART/COVERARTMIME pair and OpusTags', () => {
    const legacy = buildOgg([
        'COVERARTMIME=image/jpeg',
        'COVERART=' + imageBytes.toString('base64')
    ]);
    assert.equal(CoverArt.extractFromBytes(new Uint8Array(legacy)).url,
        'data:image/jpeg;base64,' + imageBytes.toString('base64'));

    const opus = buildOgg(['METADATA_BLOCK_PICTURE=' + pictureB64],
        Buffer.from('OpusTags', 'ascii'));
    assert.equal(CoverArt.extractFromBytes(new Uint8Array(opus)).url, expectedUrl);
});

function syncsafe(value) {
    return Buffer.from([
        (value >> 21) & 0x7f, (value >> 14) & 0x7f, (value >> 7) & 0x7f, value & 0x7f
    ]);
}

function apicFrame(mime, type, image, { v4 = false } = {}) {
    const body = Buffer.concat([
        Buffer.from([0]), // latin1
        Buffer.from(mime, 'ascii'), Buffer.from([0]),
        Buffer.from([type]),
        Buffer.from('cover', 'ascii'), Buffer.from([0]),
        image
    ]);
    return Buffer.concat([
        Buffer.from('APIC'), v4 ? syncsafe(body.length) : u32be(body.length),
        Buffer.from([0, 0]), body
    ]);
}

function buildMp3(frames, { v4 = false } = {}) {
    const body = Buffer.concat(frames);
    return Buffer.concat([
        Buffer.from('ID3'), Buffer.from([v4 ? 4 : 3, 0, 0]), syncsafe(body.length),
        body,
        Buffer.from([0xff, 0xfb, 0x90, 0x00]) // first MPEG frame
    ]);
}

test('extracts the front cover from an MP3 APIC frame (v2.3 and v2.4)', () => {
    const jpegUrl = 'data:image/jpeg;base64,' + imageBytes.toString('base64');
    const v3 = buildMp3([apicFrame('image/jpeg', 3, imageBytes)]);
    assert.deepEqual(CoverArt.extractFromBytes(new Uint8Array(v3)),
        { url: jpegUrl, needMore: false });
    const v4 = buildMp3([apicFrame('image/jpeg', 3, imageBytes, { v4: true })], { v4: true });
    assert.deepEqual(CoverArt.extractFromBytes(new Uint8Array(v4)),
        { url: jpegUrl, needMore: false });
});

test('MP3 front cover outranks other picture types; any art beats none', () => {
    const front = Buffer.from('FRONT-IMAGE-BYTES-' + 'f'.repeat(40));
    const icon = Buffer.from('ICON-IMAGE-BYTES-' + 'i'.repeat(40));
    const both = buildMp3([
        apicFrame('image/png', 1, icon), // file icon before the front cover
        apicFrame('image/jpeg', 3, front)
    ]);
    assert.equal(CoverArt.extractFromBytes(new Uint8Array(both)).url,
        'data:image/jpeg;base64,' + front.toString('base64'));
    const iconOnly = buildMp3([apicFrame('image/png', 1, icon)]);
    assert.equal(CoverArt.extractFromBytes(new Uint8Array(iconOnly)).url,
        'data:image/png;base64,' + icon.toString('base64'));
});

test('reports needMore when the ID3 tag is cut off, art or not', () => {
    const mp3 = buildMp3([apicFrame('image/jpeg', 3, imageBytes)]);
    const cut = CoverArt.extractFromBytes(new Uint8Array(mp3.subarray(0, 200)));
    assert.equal(cut.url, null);
    assert.equal(cut.needMore, true);
    const tagless = buildMp3([]);
    assert.deepEqual(CoverArt.extractFromBytes(new Uint8Array(tagless)),
        { url: null, needMore: false });
});

function flacBlock(type, body, last = false) {
    return Buffer.concat([
        Buffer.from([(last ? 0x80 : 0) | type]),
        Buffer.from([(body.length >> 16) & 0xff, (body.length >> 8) & 0xff, body.length & 0xff]),
        body
    ]);
}

function buildFlac(blocks) {
    return Buffer.concat([Buffer.from('fLaC'), ...blocks]);
}

test('extracts the PICTURE block from a native FLAC container', () => {
    const flac = buildFlac([
        flacBlock(0, Buffer.alloc(34)),
        flacBlock(6, flacPictureBlock('image/png', imageBytes), true)
    ]);
    assert.deepEqual(CoverArt.extractFromBytes(new Uint8Array(flac)),
        { url: expectedUrl, needMore: false });

    const cut = CoverArt.extractFromBytes(new Uint8Array(flac.subarray(0, 60)));
    assert.equal(cut.url, null);
    assert.equal(cut.needMore, true);

    const bare = buildFlac([flacBlock(0, Buffer.alloc(34), true)]);
    assert.deepEqual(CoverArt.extractFromBytes(new Uint8Array(bare)),
        { url: null, needMore: false });
});

test('non-ogg and tiny inputs yield no art and no retry', () => {
    assert.deepEqual(CoverArt.extractFromBytes(new Uint8Array(0)), { url: null, needMore: false });
    const junk = new Uint8Array(Buffer.from('RIFFxxxxWAVE' + 'z'.repeat(64), 'ascii'));
    assert.deepEqual(CoverArt.extractFromBytes(junk), { url: null, needMore: false });
});

test('placeholders are stable, name-specific, and cover the idle state', () => {
    const a = CoverArt.placeholderFor('Battle1.ogg');
    assert.equal(a, CoverArt.placeholderFor('Battle1.ogg'));
    assert.notEqual(a, CoverArt.placeholderFor('Theme6.ogg'));
    assert.match(a, /^data:image\/svg\+xml/);
    assert.match(CoverArt.placeholderFor(null), /^data:image\/svg\+xml/);
});

test('readAssetBytes serves plain and encrypted prefixes; extractFromFile rides it', () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-cover-art-'));
    try {
        const keyHex = '000102030405060708090a0b0c0d0e0f';
        fs.mkdirSync(path.join(projectRoot, 'data'), { recursive: true });
        fs.writeFileSync(path.join(projectRoot, 'data', 'System.json'),
            JSON.stringify({ encryptionKey: keyHex }));
        fs.mkdirSync(path.join(projectRoot, 'audio', 'bgm'), { recursive: true });

        const ogg = buildOgg(['METADATA_BLOCK_PICTURE=' + pictureB64]);
        const plainPath = path.join(projectRoot, 'audio', 'bgm', 'Plain.ogg');
        fs.writeFileSync(plainPath, ogg);

        const prefix = EncryptedAssets.readAssetBytes(plainPath, 16);
        assert.deepEqual(Buffer.from(prefix), ogg.subarray(0, 16));
        assert.equal(EncryptedAssets.readAssetBytes(plainPath, 1 << 20).length, ogg.length);
        assert.equal(CoverArt.extractFromFile(plainPath), expectedUrl);

        // Encrypted variant: 16-byte fake header, first 16 real bytes XOR key.
        const key = Buffer.from(keyHex, 'hex');
        const scrambled = Buffer.from(ogg);
        for (let i = 0; i < 16; i++) scrambled[i] ^= key[i];
        fs.writeFileSync(path.join(projectRoot, 'audio', 'bgm', 'Secret.ogg_'),
            Buffer.concat([Buffer.alloc(16), scrambled]));

        const secretPlainPath = path.join(projectRoot, 'audio', 'bgm', 'Secret.ogg');
        const decrypted = EncryptedAssets.readAssetBytes(secretPlainPath, 1 << 20);
        assert.deepEqual(Buffer.from(decrypted), ogg);
        assert.equal(CoverArt.extractFromFile(secretPlainPath), expectedUrl);

        assert.equal(EncryptedAssets.readAssetBytes(path.join(projectRoot, 'nope.ogg'), 64), null);
    } finally {
        fs.rmSync(projectRoot, { recursive: true, force: true });
    }
});

test('web mode extracts art over ranged fetch and caps the download', async () => {
    // No synchronous byte access in a browser: the same prefix walk must run
    // over fetches. The fake server ignores the Range header on purpose and
    // streams the whole 5MB track in 16KB chunks, so the byte cap has to
    // come from the reader cancelling — the exact itch.io-hosting shape.
    const track = path.join(editorRoot, '..', 'template', 'Demo', 'audio', 'bgm',
        'Psychronic - Darkstream Epoch.ogg');
    const whole = fs.readFileSync(track);
    let requestedRange = null;
    let served = 0;
    global.window = {
        RPGReactorWebHost: { mode: 'web' },
        RPGReactorAssetUrl: filePath => 'served://' + path.basename(filePath),
    };
    global.fetch = async (url, options) => {
        requestedRange = options && options.headers && options.headers.Range;
        let offset = 0;
        return {
            ok: true,
            body: {
                getReader() {
                    return {
                        async read() {
                            if (offset >= whole.length) return { done: true };
                            const chunk = new Uint8Array(whole.subarray(offset, offset + 16384));
                            offset += chunk.length;
                            served = offset;
                            return { done: false, value: chunk };
                        },
                        cancel: async () => {},
                    };
                },
            },
        };
    };
    try {
        const result = CoverArt.extractFromFile('/not/on/any/disk/Darkstream.ogg');
        assert.ok(result && typeof result.then === 'function', 'web mode returns a promise');
        const url = await result;
        assert.ok(url && url.startsWith('data:image/'), 'art extracted over fetch');
        assert.ok(served <= 131072 + 16384, `download capped at the first read step (served ${served})`);
        assert.match(String(requestedRange), /^bytes=0-/);
    } finally {
        delete global.window;
        delete global.fetch;
    }
});
