const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const editorRoot = path.resolve(__dirname, '..');

function descriptor(id, category, tags) {
    return { id, category, tags, params: [], draw() {} };
}

test('Psychronic is the built-in default and project styles remain selectable', () => {
    const registry = [
        descriptor('body-project', 'body', ['male', 'project-style']),
        descriptor('hair-project', 'hair', ['male', 'project-style']),
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
        process,
        require,
        RR_CHARACTER_REGISTRY: registry,
        CharacterRenderer: {
            resolveParams: (_descriptor, values) => ({ ...values })
        }
    });

    const generator = new CharacterGenerator();
    assert.equal(generator.characterStyle, 'psychronic');
    generator._knownCharacterStyles.add('project-style');
    generator.activePartIds = new Set(registry.map(part => part.id));
    generator.activeLayerOrder = registry.map(part => part.id);
    generator._saveConfig = () => {};
    generator._render = () => {};

    generator._setCharacterStyle('psychronic');
    assert.deepEqual(
        Array.from(generator._buildActiveParts(), part => part.descriptor.id),
        ['shared-accessory', 'body-psychronic', 'hair-psychronic']
    );
    assert.equal(generator.activeLayerOrder.includes('body-project'), true);

    generator._setCharacterStyle('project-style');
    assert.deepEqual(
        Array.from(generator._buildActiveParts(), part => part.descriptor.id),
        ['body-project', 'hair-project', 'shared-accessory']
    );
    assert.equal(generator.activeLayerOrder.includes('body-psychronic'), true);
});

test('project character JavaScript remains disabled until per-project trust is granted', () => {
    const source = fs.readFileSync(
        path.join(editorRoot, 'src', 'forge', 'CharacterGenerator', 'CharacterGenerator.js'),
        'utf8'
    );
    const CharacterGenerator = vm.runInNewContext(`${source}\nCharacterGenerator;`, {
        console,
        process,
        require,
        RR_CHARACTER_REGISTRY: []
    });
    const values = new Map();
    const storage = {
        getItem: key => values.get(key) ?? null,
        setItem: (key, value) => values.set(key, value),
        removeItem: key => values.delete(key)
    };
    const generator = new CharacterGenerator();
    generator.projectPath = '/untrusted/project';

    assert.equal(generator._isProjectCodeTrusted(storage), false);
    assert.equal(generator._setProjectCodeTrusted(true, storage), true);
    assert.equal(generator._isProjectCodeTrusted(storage), true);
    assert.equal(generator._setProjectCodeTrusted(false, storage), true);
    assert.equal(generator._isProjectCodeTrusted(storage), false);
});
