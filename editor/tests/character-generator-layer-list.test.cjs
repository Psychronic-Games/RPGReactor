const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const editorRoot = path.resolve(__dirname, '..');

function descriptor(id, category, tags) {
    return { id, name: id, category, tags, params: [], draw() {} };
}

function makeGenerator(registry) {
    const source = fs.readFileSync(path.join(editorRoot, 'src', 'forge', 'CharacterGenerator', 'CharacterGenerator.js'), 'utf8');
    const CharacterGenerator = vm.runInNewContext(`${source}\nCharacterGenerator;`, {
        console, process, require,
        RR_CHARACTER_REGISTRY: registry,
        CharacterRenderer: { resolveParams: (_descriptor, values) => ({ ...values }) }
    });
    const generator = new CharacterGenerator();
    generator._renderPartThumbnail = () => '';
    generator._saveConfig = () => {};
    generator._render = () => {};
    return generator;
}

const rows = html => [...html.matchAll(/class="rr-cgp-layer-row" data-part-id="([^"]+)"/g)].map(m => m[1]);
const swap = (html, id, dir) => {
    const row = html.slice(html.indexOf(`data-part-id="${id}"`));
    return Number(new RegExp(`rr-cgp-layer-${dir}" data-layer-index="\\d+" data-swap-index="(-?\\d+)"`).exec(row)[1]);
};

test('the Layers column lists only the layers the preview draws and Save writes', () => {
    const registry = [
        descriptor('body-psychronic', 'body', ['male', 'psychronic']),
        descriptor('body-looseleaf', 'body', ['male', 'looseleaf']),
        descriptor('hair-looseleaf', 'hair', ['male', 'looseleaf']),
        descriptor('dress-looseleaf', 'torso', ['female', 'looseleaf'])
    ];
    const generator = makeGenerator(registry);
    generator.activeLayerOrder = registry.map(part => part.id);
    generator.activePartIds = new Set(generator.activeLayerOrder);

    generator._setCharacterStyle('looseleaf');
    const drawn = Array.from(generator._buildActiveParts(), part => part.descriptor.id);
    const html = generator._renderActiveLayers(null);
    assert.deepEqual(rows(html), [...drawn].reverse());
    assert.deepEqual(rows(html), ['hair-looseleaf', 'body-looseleaf']);

    // Moving a layer swaps it with its listed neighbor, never with a part of another style.
    assert.equal(swap(html, 'hair-looseleaf', 'down'), 1);
    assert.equal(swap(html, 'body-looseleaf', 'up'), 2);

    generator.gender = 'female';
    assert.deepEqual(rows(generator._renderActiveLayers(null)), ['dress-looseleaf']);

    generator.gender = 'male';
    generator._setCharacterStyle('psychronic');
    assert.deepEqual(rows(generator._renderActiveLayers(null)), ['body-psychronic']);

    generator.activeLayerOrder = ['body-looseleaf'];
    assert.match(generator._renderActiveLayers(null), /No active layers\./);
});
