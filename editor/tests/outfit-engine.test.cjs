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

function bodyPathForStyle(style, gender = 'male') {
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
            'src', 'forge', 'CharacterGenerator', 'styles', 'psychronic', 'parts', 'body', gender,
            `body-psychronic-psychronic-body-${gender}-01.js`
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

function syntheticFrame(points) {
    const rows = Array.from({ length: 144 }, () => ' '.repeat(144).split(''));
    for (const [x, y] of points) rows[y][x] = 'A';
    return rows.map(row => row.join(''));
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
        assert.equal(config.zones.belt.family, 'gold');
        assert.equal(config.zones.belt.accent, 'gold');
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

test('Outfit engine keeps side-view pants and boots visibly shaded', () => {
    for (const style of ['looseleaf', 'psychronic']) {
        const config = engine.defaultConfig(style);
        const built = engine.buildPalette(config);
        const body = loadRegistryPart(bodyPathForStyle(style));
        const result = engine.generateOutfit(config, body.template);
        const sideIdle = result.sheet[1][1].join('');

        for (const zone of ['legs', 'boots']) {
            const zoneLetters = new Set(Object.values(built.zonePalettes[zone] || {}).filter(Boolean));
            const usedZoneLetters = new Set(sideIdle.split('').filter(ch => zoneLetters.has(ch)));
            assert.ok(usedZoneLetters.size >= 4, `${style} side-view ${zone} uses multiple shade letters`);
        }

        const legLetters = new Set(Object.values(built.zonePalettes.legs || {}).filter(Boolean));
        let transparentPantsCracks = 0;
        for (const direction of result.sheet) {
            for (const frame of direction) {
                for (const row of frame) {
                    for (let x = 1; x < row.length - 1; x++) {
                        if (legLetters.has(row[x - 1]) && row[x] === ' ' && legLetters.has(row[x + 1])) transparentPantsCracks++;
                    }
                }
            }
        }
        assert.equal(transparentPantsCracks, 0, `${style} pants do not leave transparent cracks between leg pixels`);
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

test('Outfit engine exposes eye-line anchors for helmet placement', () => {
    for (const style of ['looseleaf', 'psychronic']) {
        const body = loadRegistryPart(bodyPathForStyle(style));
        const debug = engine.debugClassifyFrame(
            engine.defaultConfig(style),
            body.template.sheet[0][1],
            0,
            body.template.palette,
            1
        );
        assert.equal(Number.isFinite(debug.anchors.face.eyeY), true, `${style} exposes face.eyeY`);
        assert.equal(Number.isFinite(debug.anchors.face.eyeBand.top), true, `${style} exposes face.eyeBand.top`);
        assert.equal(Number.isFinite(debug.anchors.face.eyeBand.bottom), true, `${style} exposes face.eyeBand.bottom`);
    }
});

test('Psychronic female masks are scoped by gender tags', () => {
    const body = loadRegistryPart(bodyPathForStyle('psychronic', 'female'));
    const config = {
        style: 'psychronic',
        zones: {
            head: { enabled: true, style: 'helmet' },
            torso: { enabled: true, style: 'plated' }
        }
    };

    const rawX = 67; // preview x 68 after Psychronic preview/raw coordinate shift
    const rawY = 44; // preview y 37 after Psychronic preview/raw coordinate shift
    const femaleDebug = engine.debugClassifyFrame(
        Object.assign({}, config, { tags: ['psychronic', 'female'] }),
        body.template.sheet[0][0],
        0,
        body.template.palette,
        0
    );
    const maleDebug = engine.debugClassifyFrame(
        Object.assign({}, config, { tags: ['psychronic', 'male'] }),
        body.template.sheet[0][0],
        0,
        body.template.palette,
        0
    );

    assert.ok([femaleDebug.zones[rawY][rawX]].flat().includes('head'));
    assert.ok(![maleDebug.zones[rawY][rawX]].flat().includes('head'));

    const femalePayload = engine.builtInZoneEditPayload({ style: 'psychronic', tags: ['psychronic', 'female'] }, 'head');
    const malePayload = engine.builtInZoneEditPayload({ style: 'psychronic', tags: ['psychronic', 'male'] }, 'head');
    assert.deepEqual(femalePayload.frames['0:1'].head[0], [19, 69, 74]);
    assert.deepEqual(femalePayload.frames['0:1'].head.at(-1), [44, 69, 74]);
    assert.equal(malePayload.frames['0:1'], undefined);

    const femaleTorsoPayload = engine.builtInZoneEditPayload({ style: 'psychronic', tags: ['psychronic', 'female'] }, 'torso');
    assert.deepEqual(femaleTorsoPayload.frames['0:1'].torso[0], [45, 62, 66]);
    assert.deepEqual(femaleTorsoPayload.frames['0:0'].torso.at(-1), [78, 71, 76]);
    assert.ok(femaleTorsoPayload.frames['0:0'].torso.some(row => row[0] === 75 && row[1] === 61 && row[2] === 83));
    assert.ok(femaleTorsoPayload.frames['0:1'].torso.some(row => row[0] === 74 && row[1] === 61 && row[2] === 82));
    assert.deepEqual(femaleTorsoPayload.frames['0:1'].torso.at(-1), [78, 65, 77]);
    assert.ok(femaleTorsoPayload.frames['0:2'].torso.some(row => row[0] === 62 && row[1] === 61 && row[2] === 80));
    assert.deepEqual(femaleTorsoPayload.frames['0:2'].torso.at(-1), [78, 68, 74]);
    assert.deepEqual(femaleTorsoPayload.frames['1:2'].torso[0], [48, 74, 76]);
    assert.ok(femaleTorsoPayload.frames['1:2'].torso.some(row => row[0] === 77 && row[1] === 65 && row[2] === 79));
    assert.ok(femaleTorsoPayload.frames['2:0'].torso.some(row => row[0] === 77 && row[1] === 61 && row[2] === 76));
    assert.ok(femaleTorsoPayload.frames['2:2'].torso.some(row => row[0] === 73 && row[1] === 62 && row[2] === 70));
    assert.deepEqual(femaleTorsoPayload.frames['3:1'].torso.at(-1), [76, 74, 74]);
    assert.deepEqual(femaleTorsoPayload.frames['3:2'].torso[0], [46, 66, 67]);
    assert.ok(femaleTorsoPayload.frames['3:2'].torso.some(row => row[0] === 61 && row[1] === 63 && row[2] === 82));
    assert.deepEqual(femaleTorsoPayload.frames['3:2'].torso.at(-1), [78, 69, 76]);
    assert.ok(!femaleTorsoPayload.frames['0:1'].torso.some(row => row[0] === 86));

    const femaleArmsPayload = engine.builtInZoneEditPayload({ style: 'psychronic', tags: ['psychronic', 'female'] }, 'arms');
    assert.deepEqual(femaleArmsPayload.frames['0:1'].arms[0], [44, 61, 67]);
    assert.ok(femaleArmsPayload.frames['0:0'].arms.some(row => row[0] === 79 && row[1] === 50 && row[2] === 55));
    assert.ok(femaleArmsPayload.frames['0:2'].arms.some(row => row[0] === 80 && row[1] === 88 && row[2] === 93));
    assert.ok(femaleArmsPayload.frames['1:0'].arms.some(row => row[0] === 62 && row[1] === 68 && row[2] === 84));
    assert.ok(femaleArmsPayload.frames['2:2'].arms.some(row => row[0] === 83 && row[1] === 54 && row[2] === 56));
    assert.deepEqual(femaleArmsPayload.frames['2:2'].arms.at(-1), [84, 81, 84]);

    const femaleShouldersPayload = engine.builtInZoneEditPayload({ style: 'psychronic', tags: ['psychronic', 'female'] }, 'shoulders');
    const maleShouldersPayload = engine.builtInZoneEditPayload({ style: 'psychronic', tags: ['psychronic', 'male'] }, 'shoulders');
    assert.deepEqual(femaleShouldersPayload.frames['0:1'].shoulders[0], [44, 62, 67]);
    assert.ok(femaleShouldersPayload.frames['1:2'].shoulders.some(row => row[0] === 47 && row[1] === 74 && row[2] === 77));
    assert.ok(femaleShouldersPayload.frames['2:0'].shoulders.some(row => row[0] === 49 && row[1] === 62 && row[2] === 67));
    assert.deepEqual(femaleShouldersPayload.frames['2:2'].shoulders[0], [48, 65, 65]);
    assert.ok(femaleShouldersPayload.frames['3:0'].shoulders.some(row => row[0] === 46 && row[1] === 77 && row[2] === 80));
    assert.notDeepEqual(maleShouldersPayload.frames['0:1'].shoulders[0], [44, 62, 67]);

    const femaleLegsPayload = engine.builtInZoneEditPayload({ style: 'psychronic', tags: ['psychronic', 'female'] }, 'legs');
    const maleLegsPayload = engine.builtInZoneEditPayload({ style: 'psychronic', tags: ['psychronic', 'male'] }, 'legs');
    assert.deepEqual(femaleLegsPayload.frames['0:1'].legs[0], [77, 60, 62]);
    assert.deepEqual(femaleLegsPayload.frames['0:0'].legs[0], [75, 61, 61]);
    assert.deepEqual(femaleLegsPayload.frames['3:1'].legs[0], [74, 62, 63]);
    assert.deepEqual(femaleLegsPayload.frames['3:2'].legs[0], [75, 61, 62]);
    assert.ok(femaleLegsPayload.frames['3:2'].legs.some(row => row[0] === 77 && row[1] === 79 && row[2] === 84));
    assert.deepEqual(femaleLegsPayload.frames['3:2'].legs.at(-1), [134, 76, 80]);
    assert.ok(femaleLegsPayload.frames['1:0'].legs.some(row => row[0] === 91 && row[1] === 69 && row[2] === 84));
    assert.ok(femaleLegsPayload.frames['1:0'].legs.some(row => row[0] === 102 && row[1] === 56 && row[2] === 70));
    assert.deepEqual(femaleLegsPayload.frames['1:2'].legs[0], [77, 80, 80]);
    assert.ok(femaleLegsPayload.frames['1:2'].legs.some(row => row[0] === 80 && row[1] === 72 && row[2] === 83));
    assert.ok(femaleLegsPayload.frames['1:2'].legs.some(row => row[0] === 104 && row[1] === 59 && row[2] === 73));
    assert.ok(femaleLegsPayload.frames['2:2'].legs.some(row => row[0] === 99 && row[1] === 70 && row[2] === 83));
    assert.ok(femaleLegsPayload.frames['2:2'].legs.some(row => row[0] === 106 && row[1] === 52 && row[2] === 65));
    assert.ok(femaleLegsPayload.frames['2:0'].legs.some(row => row[0] === 83 && row[1] === 57 && row[2] === 75));
    assert.ok(femaleLegsPayload.frames['2:0'].legs.some(row => row[0] === 84 && row[1] === 57 && row[2] === 76));
    assert.ok(femaleLegsPayload.frames['2:0'].legs.some(row => row[0] === 89 && row[1] === 57 && row[2] === 77));
    assert.ok(femaleLegsPayload.frames['2:0'].legs.some(row => row[0] === 92 && row[1] === 62 && row[2] === 78));
    assert.notDeepEqual(maleLegsPayload.frames['0:1'].legs[0], [77, 60, 62]);

    const femaleBootsPayload = engine.builtInZoneEditPayload({ style: 'psychronic', tags: ['psychronic', 'female'] }, 'boots');
    const maleBootsPayload = engine.builtInZoneEditPayload({ style: 'psychronic', tags: ['psychronic', 'male'] }, 'boots');
    assert.deepEqual(femaleBootsPayload.frames['0:0'].boots[0], [116, 62, 71]);
    assert.deepEqual(femaleBootsPayload.frames['0:1'].boots[0], [115, 62, 70]);
    assert.deepEqual(femaleBootsPayload.frames['3:2'].boots.at(-1), [142, 73, 79]);
    assert.notDeepEqual(maleBootsPayload.frames['0:1'] && maleBootsPayload.frames['0:1'].boots && maleBootsPayload.frames['0:1'].boots[0], [115, 62, 70]);

    const femaleGauntletPayload = engine.builtInZoneEditPayload({ style: 'psychronic', tags: ['psychronic', 'female'] }, 'armGauntlet');
    const maleGauntletPayload = engine.builtInZoneEditPayload({ style: 'psychronic', tags: ['psychronic', 'male'] }, 'armGauntlet');
    assert.deepEqual(femaleGauntletPayload.frames['0:1'].armGauntlet[0], [66, 88, 90]);
    assert.ok(femaleGauntletPayload.frames['0:0'].armGauntlet.some(row => row[0] === 69 && row[1] === 51 && row[2] === 61));
    assert.ok(femaleGauntletPayload.frames['0:2'].armGauntlet.some(row => row[0] === 77 && row[1] === 50 && row[2] === 59));
    assert.ok(femaleGauntletPayload.frames['2:0'].armGauntlet.some(row => row[0] === 69 && row[1] === 78 && row[2] === 80));
    assert.ok(femaleGauntletPayload.frames['3:2'].armGauntlet.some(row => row[0] === 77 && row[1] === 86 && row[2] === 94));
    assert.notDeepEqual(maleGauntletPayload.frames['0:1'].armGauntlet[0], [66, 88, 90]);

    const femaleHandsPayload = engine.builtInZoneEditPayload({ style: 'psychronic', tags: ['psychronic', 'female'] }, 'hands');
    const maleHandsPayload = engine.builtInZoneEditPayload({ style: 'psychronic', tags: ['psychronic', 'male'] }, 'hands');
    assert.deepEqual(femaleHandsPayload.frames['0:1'].hands[0], [85, 51, 54]);
    assert.deepEqual(femaleHandsPayload.frames['1:1'].hands[0], [87, 67, 70]);
    assert.deepEqual(femaleHandsPayload.frames['2:1'].hands.at(-1), [96, 69, 71]);
    assert.deepEqual(femaleHandsPayload.frames['3:2'].hands.at(-1), [95, 52, 55]);
    assert.notDeepEqual(maleHandsPayload.frames['0:1'].hands[0], [85, 51, 54]);

    const femaleBeltPayload = engine.builtInZoneEditPayload({ style: 'psychronic', tags: ['psychronic', 'female'] }, 'belt');
    const maleBeltPayload = engine.builtInZoneEditPayload({ style: 'psychronic', tags: ['psychronic', 'male'] }, 'belt');
    assert.deepEqual(femaleBeltPayload.frames['0:1'].belt[0], [75, 60, 63]);
    assert.deepEqual(femaleBeltPayload.frames['1:1'].belt[0], [74, 78, 80]);
    assert.deepEqual(femaleBeltPayload.frames['2:1'].belt.at(-1), [85, 74, 74]);
    assert.deepEqual(femaleBeltPayload.frames['3:2'].belt.at(-1), [80, 67, 77]);
    assert.notDeepEqual(maleBeltPayload.frames['0:1'].belt[0], [75, 60, 63]);

    const frame = syntheticFrame([[70, 0], [80, 45], [70, 100]]);
    const femaleArmDebug = engine.debugClassifyFrame(
        Object.assign({}, config, { tags: ['psychronic', 'female'], zones: { arms: { enabled: true, style: 'gauntlet' }, torso: { enabled: true, style: 'plated' } } }),
        frame,
        0,
        { A: { hex: '#f0c090' } },
        1
    );
    const maleArmDebug = engine.debugClassifyFrame(
        Object.assign({}, config, { tags: ['psychronic', 'male'], zones: { arms: { enabled: true, style: 'gauntlet' }, torso: { enabled: true, style: 'plated' } } }),
        frame,
        0,
        { A: { hex: '#f0c090' } },
        1
    );
    assert.ok([femaleArmDebug.zones[45][80]].flat().includes('arms'));
    assert.ok(![maleArmDebug.zones[45][80]].flat().includes('arms'));

    const shoulderFrame = syntheticFrame([[76, 45]]);
    const femaleShoulderDebug = engine.debugClassifyFrame(
        Object.assign({}, config, { tags: ['psychronic', 'female'] }),
        shoulderFrame,
        0,
        { A: { hex: '#f0c090' } },
        1
    );
    const maleShoulderDebug = engine.debugClassifyFrame(
        Object.assign({}, config, { tags: ['psychronic', 'male'] }),
        shoulderFrame,
        0,
        { A: { hex: '#f0c090' } },
        1
    );
    assert.ok([femaleShoulderDebug.zones[45][76]].flat().includes('shoulders'));
    assert.ok(![maleShoulderDebug.zones[45][76]].flat().includes('shoulders'));

    const handFrame = syntheticFrame([[86, 93]]);
    const femaleHandDebug = engine.debugClassifyFrame(
        Object.assign({}, config, { tags: ['psychronic', 'female'] }),
        handFrame,
        0,
        { A: { hex: '#f0c090' } },
        1
    );
    const maleHandDebug = engine.debugClassifyFrame(
        Object.assign({}, config, { tags: ['psychronic', 'male'] }),
        handFrame,
        0,
        { A: { hex: '#f0c090' } },
        1
    );
    assert.ok([femaleHandDebug.zones[93][86]].flat().includes('hands'));
    assert.ok(![maleHandDebug.zones[93][86]].flat().includes('hands'));

    const beltFrame = syntheticFrame([[61, 78]]);
    const femaleBeltDebug = engine.debugClassifyFrame(
        Object.assign({}, config, { tags: ['psychronic', 'female'] }),
        beltFrame,
        0,
        { A: { hex: '#f0c090' } },
        1
    );
    const maleBeltDebug = engine.debugClassifyFrame(
        Object.assign({}, config, { tags: ['psychronic', 'male'] }),
        beltFrame,
        0,
        { A: { hex: '#f0c090' } },
        1
    );
    assert.ok([femaleBeltDebug.zones[78][61]].flat().includes('belt'));
    assert.ok(![maleBeltDebug.zones[78][61]].flat().includes('belt'));
});

test('Psychronic female helmet stamps authored mask outer outline', () => {
    const config = engine.defaultConfig('psychronic');
    config.tags = ['psychronic', 'female'];
    config.extensions = [];
    config.zones = {
        head: { enabled: true, layer: 60, style: 'helmet', family: 'steel', accent: 'cyan', params: { visor: true, openFace: false } }
    };

    const frame = syntheticFrame([
        [69, 19], [70, 19], [71, 19],
        [70, 20]
    ]);
    const bodyTemplate = {
        palette: { A: { hex: '#f0c090' } },
        sheet: [[frame, frame, frame], [frame, frame, frame], [frame, frame, frame], [frame, frame, frame]]
    };
    const result = engine.generateOutfit(config, bodyTemplate);
    const headOutline = engine.buildPalette(config).zonePalettes.head.outline;

    assert.equal(result.sheet[0][1][18][70], headOutline);
});
