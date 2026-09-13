const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const Export = require(path.join(__dirname, '..', 'src', 'forge', 'SoundEffectGenerator', 'AudioExport.js'));

function tone(seconds = 0.2, sampleRate = 44100, channels = 1) {
    const length = Math.round(seconds * sampleRate), data = [];
    for (let c = 0; c < channels; c++) { const ch = new Float32Array(length); for (let i = 0; i < length; i++) ch[i] = Math.sin(i * 440 * 2 * Math.PI / sampleRate) * 0.5; data.push(ch); }
    return { sampleRate, length, numberOfChannels: channels, getChannelData: c => data[c] };
}

test('the Ogg page checksum and page layout follow the Ogg specification', () => {
    // The CRC of the ASCII page "OggS" header alone is deterministic; a one-byte change alters it.
    const a = Export.oggCrc(new Uint8Array([1, 2, 3, 4])), b = Export.oggCrc(new Uint8Array([1, 2, 3, 5]));
    assert.notEqual(a, b);
    assert.equal(Export.oggCrc(new Uint8Array(0)), 0);
    const page = Export.oggPage([new Uint8Array(300), new Uint8Array(10)], { serial: 7, sequence: 3, granule: 960, flags: 4 });
    assert.equal(String.fromCharCode(...page.subarray(0, 4)), 'OggS');
    assert.equal(page[5], 4, 'last-page flag');
    const view = new DataView(page.buffer);
    assert.equal(view.getBigInt64(6, true), 960n);
    assert.equal(view.getUint32(14, true), 7);
    assert.equal(view.getUint32(18, true), 3);
    assert.equal(page[26], 3, 'a 300-byte packet is two lacing values (255 + 45), the 10-byte one a third');
    assert.deepEqual(Array.from(page.subarray(27, 30)), [255, 45, 10]);
    assert.equal(page.length, 27 + 3 + 310);
    // The stored checksum is the checksum of the page with that field zeroed.
    const stored = view.getUint32(22, true), copy = page.slice(); new DataView(copy.buffer).setUint32(22, 0, true);
    assert.equal(stored, Export.oggCrc(copy));
});

test('an Ogg Opus file opens with OpusHead and OpusTags pages and ends on a last-page flag with the total granule', () => {
    const packets = [{ data: new Uint8Array([1, 2, 3]), samples: 960 }, { data: new Uint8Array([4]), samples: 960 }];
    const file = new Uint8Array(Export.oggOpusFile(packets, { channels: 2, preSkip: 312, inputSampleRate: 44100 }));
    const pages = []; for (let i = 0; i + 4 <= file.length; i++) if (file[i] === 0x4f && file[i + 1] === 0x67 && file[i + 2] === 0x67 && file[i + 3] === 0x53) pages.push(i);
    assert.equal(pages.length, 3);
    const head = file.subarray(pages[0] + 28, pages[0] + 28 + 19);
    assert.equal(String.fromCharCode(...head.subarray(0, 8)), 'OpusHead');
    assert.equal(head[9], 2, 'channel count');
    assert.equal(new DataView(head.buffer, head.byteOffset).getUint16(10, true), 312, 'pre-skip');
    assert.equal(new DataView(head.buffer, head.byteOffset).getUint32(12, true), 44100, 'original rate');
    assert.equal(file[pages[0] + 5], 2, 'first page flagged as the stream start');
    assert.equal(String.fromCharCode(...file.subarray(pages[1] + 28, pages[1] + 36)), 'OpusTags');
    const last = new DataView(file.buffer, pages[2]);
    assert.equal(file[pages[2] + 5], 4, 'the audio page is the last page');
    assert.equal(last.getBigInt64(6, true), 312n + 1920n, 'granule counts pre-skip and both packets');
});

test('WAV keeps both channels and MP3 through lamejs yields MPEG frames sized by the quality step', () => {
    const stereo = tone(0.05, 44100, 2), wav = new DataView(Export.encodeWav(stereo));
    assert.equal(wav.getUint16(22, true), 2, 'two channels');
    assert.equal(wav.getUint32(40, true), stereo.length * 4, 'data size covers both channels at 16 bits');
    const lame = Export.loadLame(require);
    const low = new Uint8Array(Export.encodeMp3(tone(0.5), Export.bitrateFor('mp3', 1), lame)), high = new Uint8Array(Export.encodeMp3(tone(0.5), Export.bitrateFor('mp3', 10), lame));
    assert.equal(low[0], 0xff, 'frame sync');
    assert.equal(low[1] & 0xe0, 0xe0);
    assert.ok(high.length > low.length * 3, 'a higher quality step spends more bits');
    assert.equal(Export.bitrateFor('ogg', 10), 192);
    assert.equal(Export.bitrateFor('wav', 5), 0);
});
