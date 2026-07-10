const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const editorRoot = path.resolve(__dirname, '..');

function descriptor(id, category, tags) {
    return { id, category, tags, params: [], draw() {} };
}

test('switching character styles excludes old-style active layers without deleting them', () => {
    const registry = [
        descriptor('body-looseleaf', 'body', ['male', 'looseleaf']),
        descriptor('hair-looseleaf', 'hair', ['male', 'looseleaf']),
        descriptor('shared-accessory', 'accessory', ['neutral']),
        descriptor('body-psychronic', 'body', ['male', 'psychronic']),
        descriptor('hair-psychronic', 'hair', ['male', 'psychronic'])
    ];
    const source = fs.readFileSync(
        path.join(editorRoot, 'src', 'forge', 'CharacterGenerator', 'CharacterGenerator.js'),
        'utf8'
    );
    const CharacterGenerator = vm.runInNewContext(`${source}\nCharacterGenerator;`, {
        console,
        RR_CHARACTER_REGISTRY: registry,
        CharacterRenderer: {
            resolveParams: (_descriptor, values) => ({ ...values })
        }
    });

    const generator = new CharacterGenerator();
    generator.activePartIds = new Set(registry.map(part => part.id));
    generator.activeLayerOrder = registry.map(part => part.id);
    generator._saveConfig = () => {};
    generator._render = () => {};

    generator._setCharacterStyle('psychronic');
    assert.deepEqual(
        Array.from(generator._buildActiveParts(), part => part.descriptor.id),
        ['shared-accessory', 'body-psychronic', 'hair-psychronic']
    );
    assert.equal(generator.activeLayerOrder.includes('body-looseleaf'), true);

    generator._setCharacterStyle('looseleaf');
    assert.deepEqual(
        Array.from(generator._buildActiveParts(), part => part.descriptor.id),
        ['body-looseleaf', 'hair-looseleaf', 'shared-accessory']
    );
    assert.equal(generator.activeLayerOrder.includes('body-psychronic'), true);
});
