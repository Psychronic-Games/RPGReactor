const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '..');
const engine = require(path.join(repoRoot, 'src', 'forge', 'CharacterGenerator', 'procgen', 'outfit_engine.js'));
const novaSentinel = require(path.join(repoRoot, 'src', 'forge', 'CharacterGenerator', 'procgen', 'outfits', 'nova_sentinel.js'));

function loadRegistryPart(filePath) {
    const registry = [];
    const source = fs.readFileSync(filePath, 'utf8');

    new Function('RR_CHARACTER_REGISTRY', 'window', source)(registry, {});

    assert.equal(registry.length, 1, `${path.relative(repoRoot, filePath)} registers one part`);
    return registry[0];
}

function bodyPathForStyle(style) {
    if (style === 'looseleaf') {
        return path.join(
            repoRoot,
            'src', 'forge', 'CharacterGenerator', 'styles', 'looseleaf', 'parts', 'body', 'male',
            'body-looseleaf-looseleaf-male-body-01.js'
        );
    }

    if (style === 'psychronic') {
        return path.join(
            repoRoot,
            'src', 'forge', 'CharacterGenerator', 'styles', 'psychronic', 'parts', 'body', 'male',
            'body-psychronic-psychronic-body-male-01.js'
        );
    }

    throw new Error(`Unknown test style: ${style}`);
}

function assertGeneratedSheet(result, style) {
    assert.equal(typeof result, 'object');
    assert.equal(Object.keys(result.palette).length, 34, `${style} palette uses the current Nova Sentinel palette size`);
    assert.equal(result.sheet.length, 4, `${style} has four directions`);

    for (const [directionIndex, direction] of result.sheet.entries()) {
        assert.equal(direction.length, 3, `${style} direction ${directionIndex} has three walk frames`);
        for (const [frameIndex, frame] of direction.entries()) {
            assert.equal(frame.length, 144, `${style} direction ${directionIndex} frame ${frameIndex} has 144 rows`);
            for (const [rowIndex, row] of frame.entries()) {
                assert.equal(row.length, 144, `${style} direction ${directionIndex} frame ${frameIndex} row ${rowIndex} has 144 columns`);
            }
        }
    }

    const paletteLetters = new Set(Object.keys(result.palette));
    const usedLetters = new Set(result.sheet.flat(2).join('').replace(/\s/g, '').split(''));
    assert.ok(usedLetters.size > 0, `${style} generated outfit is not blank`);
    for (const letter of usedLetters) {
        assert.ok(paletteLetters.has(letter), `${style} generated letter ${JSON.stringify(letter)} exists in palette`);
    }

    assert.ok(Array.isArray(result.skin), `${style} exposes detected skin letters`);
    assert.ok(result.skin.length > 0, `${style} detects skin letters from body palette`);
}

test('Nova Sentinel recipe exposes Looseleaf and Psychronic part sets', () => {
    assert.equal(novaSentinel.key, 'nova-sentinel');
    assert.equal(novaSentinel.label, 'Nova Sentinel');

    const styles = new Set(novaSentinel.partSets.map(set => set.style));
    assert.deepEqual(styles, new Set(['looseleaf', 'psychronic']));

    for (const style of styles) {
        const config = novaSentinel.defaultConfig(style);
        assert.equal(config.style, style);
        assert.equal(config.name, 'Nova Sentinel');
        assert.equal(config.category, 'full outfits');
        assert.ok(config.tags.includes(style));
        assert.ok(config.zones.head.enabled);
        assert.ok(config.zones.torso.enabled);
        assert.equal(config.extensions.length, 2);
    }
});

test('Outfit engine generates valid Nova Sentinel sheets for built-in styles', () => {
    for (const style of ['looseleaf', 'psychronic']) {
        const body = loadRegistryPart(bodyPathForStyle(style));
        const result = engine.generateOutfit(engine.defaultConfig(style), body.template);

        assertGeneratedSheet(result, style);
    }
});

test('Outfit palette builder reuses families and validates bad names', () => {
    const config = engine.defaultConfig('looseleaf');
    const built = engine.buildPalette(config);

    assert.equal(built.zonePalettes.head.outline, built.zonePalettes.torso.outline);
    assert.notEqual(built.zonePalettes.torso.outline, built.zonePalettes.arms.outline);
    assert.equal(built.zonePalettes.head.glow, built.zonePalettes.torso.glow);

    assert.throws(
        () => engine.buildPalette({ zones: { torso: { family: 'not-a-family' } } }),
        /Unknown family: not-a-family/
    );
    assert.throws(
        () => engine.buildPalette({ zones: { torso: { family: 'steel', accent: 'not-an-accent' } } }),
        /Unknown accent: not-an-accent/
    );
});
