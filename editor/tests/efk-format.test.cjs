const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

const formatRoot = path.join(__dirname, '..', 'src', 'forge', 'EffekseerGenerator', 'format');
const fmt = require(path.join(formatRoot, 'efk_format.js'));
const builder = require(path.join(formatRoot, 'efk_builder.js'));

function generatedEffect() {
    return builder.makeEffect({
        textures: ['Texture/generated.png'],
        nodes: [builder.makeNode(fmt.NODE_TYPE.SPRITE)],
    });
}

test('generated effect parses to the exact end of its BIN_ chunk', () => {
    const parsed = fmt.parseEfkefc(fmt.writeEfkefc(generatedEffect()));
    assert.equal(parsed.header.version, 1500);
    assert.equal(parsed.root.children.length, 1);
});

test('generated effect re-emits byte-identical INFO and BIN_ chunks', () => {
    const bytes = fmt.writeEfkefc(generatedEffect());
    const container = fmt.parseContainer(bytes);
    const parsed = fmt.parseEfkefc(bytes);
    assert.deepEqual(fmt.writeBinChunk(parsed), container.chunks.find(chunk => chunk.forcc === 'BIN_').data);
    assert.deepEqual(fmt.writeInfoChunk(parsed.info), container.chunks.find(chunk => chunk.forcc === 'INFO').data);
});

test('generated INFO resource lists match BIN_ header lists', () => {
    const parsed = fmt.parseEfkefc(fmt.writeEfkefc(generatedEffect()));
    assert.deepEqual(parsed.info.colorImages, parsed.header.colorImages);
    assert.deepEqual(parsed.info.sounds, parsed.header.sounds);
});
