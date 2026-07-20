const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '..');
const hairEngine = require(path.join(repoRoot, 'src', 'forge', 'CharacterGenerator', 'procgen', 'hair_engine.js'));
const outfitEngine = require(path.join(repoRoot, 'src', 'forge', 'CharacterGenerator', 'procgen', 'outfit_engine.js'));

function loadRegistryPart(filePath) {
    const registry = [];
    const source = fs.readFileSync(filePath, 'utf8');

    new Function('RR_CHARACTER_REGISTRY', 'window', source)(registry, {});

    assert.equal(registry.length, 1, `${path.relative(repoRoot, filePath)} registers one part`);
    return registry[0];
}

function bodyPathForStyle(style, gender = 'male') {
    if (style === 'psychronic') {
        return path.join(repoRoot, 'src', 'forge', 'CharacterGenerator', 'styles', 'psychronic', 'parts', 'body', gender, `body-psychronic-psychronic-body-${gender}-01.js`);
    }
    throw new Error(`Unknown test style: ${style}`);
}

function frameBbox(frame) {
    let minX = Infinity, minY = Infinity, maxX = -1, maxY = -1;
    for (let y = 0; y < frame.length; y++) {
        const row = frame[y] || '';
        for (let x = 0; x < row.length; x++) {
            if (row[x] === ' ') continue;
            minX = Math.min(minX, x); minY = Math.min(minY, y);
            maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
        }
    }
    return { minX, minY, maxX, maxY };
}

function frameDiffCount(a, b) {
    let diffs = 0;
    for (let y = 0; y < a.length; y++) {
        const rowA = a[y] || '';
        const rowB = b[y] || '';
        for (let x = 0; x < Math.max(rowA.length, rowB.length); x++) {
            if (rowA[x] !== rowB[x]) diffs++;
        }
    }
    return diffs;
}

function hexLuma(hex) {
    const match = /^#?([0-9a-f]{6})$/i.exec(String(hex || ''));
    if (!match) return Infinity;
    const n = parseInt(match[1], 16);
    const r = (n >> 16) & 255;
    const g = (n >> 8) & 255;
    const b = n & 255;
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function visibleEyeY(bodyFrame, palette, anchors, half) {
    const cx = Math.round(anchors.face.cx);
    const startY = Math.round(anchors.face.eyeY);
    const endY = Math.round(anchors.face.bottom + 4);
    const eyeOffset = Math.max(3, Math.round(half * 0.28));
    let bestY = startY;
    let bestScore = -1;
    for (let y = startY; y <= endY; y++) {
        let score = 0;
        for (const eyeCx of [cx - eyeOffset, cx + eyeOffset]) {
            for (let x = eyeCx - 2; x <= eyeCx + 2; x++) {
                const ch = bodyFrame[y]?.[x] || ' ';
                if (ch === ' ') continue;
                const luma = hexLuma(palette[String(ch)] && palette[String(ch)].hex);
                if (luma < 110) score += 110 - luma;
            }
        }
        if (score > bestScore) {
            bestScore = score;
            bestY = y;
        }
    }
    return bestScore > 0 ? bestY : startY;
}

test('Hair Forge generates valid animated hair sheets for built-in styles', () => {
    for (const style of ['psychronic']) {
        const body = loadRegistryPart(bodyPathForStyle(style));
        const config = Object.assign(hairEngine.defaultConfig(style), { tags: [style, 'male', 'hair'] });
        const result = hairEngine.generateHair(config, body.template);

        assert.equal(Object.keys(result.palette).length, 5, `${style} hair palette has five shade letters`);
        assert.equal(result.sheet.length, 4, `${style} hair has four directions`);
        const paletteLetters = new Set(Object.keys(result.palette));
        const usedLetters = new Set(result.sheet.flat(2).join('').replace(/\s/g, '').split(''));
        assert.ok(usedLetters.size >= 4, `${style} hair uses multiple shade letters`);
        for (const letter of usedLetters) assert.ok(paletteLetters.has(letter), `${style} generated hair letter ${letter} exists in palette`);

        for (const [directionIndex, direction] of result.sheet.entries()) {
            assert.equal(direction.length, 3, `${style} direction ${directionIndex} has three frames`);
            for (const [frameIndex, frame] of direction.entries()) {
                assert.equal(frame.length, 144, `${style} direction ${directionIndex} frame ${frameIndex} has 144 rows`);
                for (const [rowIndex, row] of frame.entries()) {
                    assert.equal(row.length, 144, `${style} direction ${directionIndex} frame ${frameIndex} row ${rowIndex} has 144 columns`);
                }
            }
        }

        assert.notEqual(result.sheet[0][0].join('\n'), result.sheet[0][2].join('\n'), `${style} front hair varies across walk frames`);
        assert.ok(frameDiffCount(result.sheet[3][0], result.sheet[3][1]) >= 500, `${style} back hair has frame 0 flow variation`);
        assert.ok(frameDiffCount(result.sheet[3][1], result.sheet[3][2]) >= 500, `${style} back hair has frame 2 flow variation`);

        for (const [frameIndex, frame] of result.sheet[0].entries()) {
            const frontAnchors = outfitEngine.debugClassifyFrame({ style, tags: [style], zones: {} }, body.template.sheet[0][frameIndex], 0, body.template.palette || {}, frameIndex).anchors;
            const frontHalf = Math.max(8, Math.round((frontAnchors.head.halfWidth || 10) + 2));
            const frontCx = Math.round(frontAnchors.face.cx);
            const frontEyeY = visibleEyeY(body.template.sheet[0][frameIndex], body.template.palette || {}, frontAnchors, frontHalf);
            const frontEyeOffset = Math.max(3, Math.round(frontHalf * 0.28));
            let clearPixels = 0;
            let totalPixels = 0;
            for (const eyeCx of [frontCx - frontEyeOffset, frontCx + frontEyeOffset]) {
                for (let y = frontEyeY; y <= frontEyeY + 2; y++) {
                    const rel = y - frontEyeY;
                    const openHalf = rel === 1 ? 2 : 1;
                    for (let x = eyeCx - openHalf; x <= eyeCx + openHalf; x++) {
                        totalPixels++;
                        if (frame[y][x] === ' ') clearPixels++;
                    }
                }
            }
            assert.equal(clearPixels, totalPixels, `${style} front frame ${frameIndex} hair leaves the eye band visible`);
        }

        for (const directionIndex of [1, 2]) {
            const sideBboxes = result.sheet[directionIndex].map(frameBbox);
            assert.ok(Math.abs(sideBboxes[0].minX - sideBboxes[1].minX) <= 3, `${style} side ${directionIndex} frame 0 hair flow keeps horizontal silhouette near idle`);
            assert.ok(Math.abs(sideBboxes[2].minX - sideBboxes[1].minX) <= 3, `${style} side ${directionIndex} frame 2 hair flow keeps horizontal silhouette near idle`);
            assert.equal(sideBboxes[0].minY, sideBboxes[1].minY + 1, `${style} side ${directionIndex} frame 0 hair follows the lower side walk frame`);
            assert.equal(sideBboxes[2].minY, sideBboxes[1].minY + 1, `${style} side ${directionIndex} frame 2 hair follows the lower side walk frame`);
            assert.ok(frameDiffCount(result.sheet[directionIndex][0], result.sheet[directionIndex][1]) >= 300, `${style} side ${directionIndex} hair has frame 0 flow variation`);
            assert.ok(frameDiffCount(result.sheet[directionIndex][1], result.sheet[directionIndex][2]) >= 300, `${style} side ${directionIndex} hair has frame 2 flow variation`);
            if (directionIndex === 2) {
                const sideAnchors = outfitEngine.debugClassifyFrame({ style, tags: [style], zones: {} }, body.template.sheet[directionIndex][1], directionIndex, body.template.palette || {}, 1).anchors;
                const headCx = Math.round(sideAnchors.head.centreX);
                const sideHalf = Math.max(8, Math.round((sideAnchors.head.halfWidth || 10) + 2));
                assert.ok(sideBboxes[1].maxX - headCx <= sideHalf, `${style} right-facing side hair does not drift forward past the face-side head width`);
                assert.ok(headCx - sideBboxes[1].minX >= sideHalf + 2, `${style} right-facing side hair keeps rear scalp coverage`);
            }
        }

        for (const directionIndex of [1, 2]) {
            const anchors = outfitEngine.debugClassifyFrame({ style, tags: [style], zones: {} }, body.template.sheet[directionIndex][1], directionIndex, body.template.palette || {}, 1).anchors;
            const faceSign = directionIndex === 1 ? -1 : 1;
            const sway = directionIndex === 1 ? -2 : 0;
            const half = Math.max(8, Math.round((anchors.head.halfWidth || 10) + 2));
            const eyeY = Math.round(anchors.face.eyeY);
            const eyeCx = Math.round(anchors.face.cx + sway + faceSign * Math.round(half * 0.14));
            let clearPixels = 0;
            for (let y = eyeY - 1; y <= eyeY + 3; y++) {
                for (let x = eyeCx - 2; x <= eyeCx + 2; x++) {
                    if (result.sheet[directionIndex][1][y][x] === ' ') clearPixels++;
                }
            }
            assert.ok(clearPixels >= 18, `${style} side ${directionIndex} hair leaves the eye band visible`);
        }
    }
});

test('Hair Forge exposes extra colors and short spiky style', () => {
    const schema = hairEngine.UI_SCHEMA;
    assert.ok(schema.styles.some(style => style.value === 'short-spiky'), 'Hair Forge exposes Short Spiky style');
    assert.ok(schema.styles.some(style => style.value === 'center-part-long'), 'Hair Forge exposes Center Part Long style');
    for (const colorKey of ['auburn', 'platinum', 'rose', 'violet', 'navy', 'emerald']) {
        assert.ok(hairEngine.COLORS[colorKey], `Hair Forge exposes ${colorKey} hair color`);
        assert.ok(schema.colors.some(color => color.key === colorKey), `Hair Forge UI exposes ${colorKey} hair color`);
    }
});

test('Hair Forge center part long style creates orderly straight symmetric hair', () => {
    const style = 'psychronic';
    const body = loadRegistryPart(bodyPathForStyle(style));
    const baseConfig = Object.assign(hairEngine.defaultConfig(style), { tags: [style, 'male', 'hair'] });
    const bob = hairEngine.generateHair(Object.assign({}, baseConfig, { hairStyle: 'layered-bob' }), body.template);
    const straight = hairEngine.generateHair(Object.assign({}, baseConfig, {
        hairStyle: 'center-part-long',
        length: 'long',
        params: Object.assign({}, baseConfig.params, { bangs: true, sideLocks: true })
    }), body.template);

    const front = frameBbox(straight.sheet[0][1]);
    const side = frameBbox(straight.sheet[1][1]);
    const back = frameBbox(straight.sheet[3][1]);
    const bobFront = frameBbox(bob.sheet[0][1]);
    const anchors = outfitEngine.debugClassifyFrame({ style, tags: [style], zones: {} }, body.template.sheet[0][1], 0, body.template.palette || {}, 1).anchors;
    const cx = Math.round(anchors.face.cx);
    const eyeY = Math.round(anchors.face.eyeY);

    assert.ok(front.maxY >= bobFront.maxY + 12, 'center part long front falls much longer than layered bob');
    assert.ok(side.maxY >= eyeY + 35, 'center part long side has a long straight curtain');
    assert.ok(back.maxY >= front.maxY, 'center part long back keeps long rear curtain length');

    let centerSeam = 0;
    for (let y = front.minY + 3; y <= eyeY + 4; y++) {
        const ch = straight.sheet[0][1][y][cx];
        if (ch === 'O' || ch === 'S') centerSeam++;
    }
    assert.ok(centerSeam >= 8, 'center part long front has a visible middle part seam');

    let asymmetry = 0;
    let checked = 0;
    for (let y = front.minY; y <= Math.min(front.maxY, eyeY + 18); y++) {
        for (let d = 1; d <= 18; d++) {
            const left = straight.sheet[0][1][y][cx - d] || ' ';
            const right = straight.sheet[0][1][y][cx + d] || ' ';
            if ((left === ' ') !== (right === ' ')) asymmetry++;
            checked++;
        }
    }
    assert.ok(checked > 0 && asymmetry < checked * 0.12, 'center part long front silhouette stays broadly symmetrical');

    const sideAnchors = outfitEngine.debugClassifyFrame({ style, tags: [style], zones: {} }, body.template.sheet[1][1], 1, body.template.palette || {}, 1).anchors;
    const sideCx = Math.round(sideAnchors.face.cx);
    const sideEyeY = Math.round(sideAnchors.face.eyeY) + 3;
    const sideHalf = Math.max(8, Math.round((sideAnchors.head.halfWidth || 10) + 2));
    let foreheadHair = 0;
    for (let y = sideEyeY - 12; y <= sideEyeY - 2; y++) {
        for (let x = sideCx - sideHalf; x <= sideCx + sideHalf; x++) {
            if ((straight.sheet[1][1][y] || '')[x] !== ' ') foreheadHair++;
        }
    }
    assert.ok(foreheadHair >= 45, 'center part long side view has smooth front bang coverage');
    assert.ok(frameDiffCount(straight.sheet[1][0], straight.sheet[1][2]) >= 120, 'center part long side hair sways across walk frames');
});

test('Hair Forge short spiky style creates a shorter spiked silhouette', () => {
    const style = 'psychronic';
    const body = loadRegistryPart(bodyPathForStyle(style));
    const baseConfig = Object.assign(hairEngine.defaultConfig(style), { tags: [style, 'male', 'hair'] });
    const bob = hairEngine.generateHair(Object.assign({}, baseConfig, { hairStyle: 'layered-bob' }), body.template);
    const spiky = hairEngine.generateHair(Object.assign({}, baseConfig, {
        hairStyle: 'short-spiky',
        length: 'short',
        params: Object.assign({}, baseConfig.params, { bangs: true, sideLocks: true })
    }), body.template);

    const bobFront = frameBbox(bob.sheet[0][1]);
    const spikyFront = frameBbox(spiky.sheet[0][1]);
    const bobSide = frameBbox(bob.sheet[1][1]);
    const spikySide = frameBbox(spiky.sheet[1][1]);
    assert.ok(spikyFront.minY <= bobFront.minY + 3, 'short spiky front keeps a compact spiked crown');
    assert.ok(spikyFront.maxY <= bobFront.maxY - 6, 'short spiky front hair is shorter than layered bob');
    assert.ok(spikySide.maxY <= bobSide.maxY - 6, 'short spiky side hair is shorter than layered bob');
    assert.ok(frameDiffCount(bob.sheet[0][1], spiky.sheet[0][1]) >= 250, 'short spiky front differs visibly from layered bob');
});

test('Hair Forge short spiky style has style-specific controls and length scaling', () => {
    const style = 'psychronic';
    const body = loadRegistryPart(bodyPathForStyle(style));
    const baseConfig = Object.assign(hairEngine.defaultConfig(style), { tags: [style, 'male', 'hair'], hairStyle: 'short-spiky' });
    const shortSpiky = hairEngine.generateHair(Object.assign({}, baseConfig, {
        length: 'short',
        params: Object.assign({}, baseConfig.params, { bangs: true, sideLocks: true })
    }), body.template);
    const longSpiky = hairEngine.generateHair(Object.assign({}, baseConfig, {
        length: 'long',
        params: Object.assign({}, baseConfig.params, { bangs: true, sideLocks: true })
    }), body.template);
    const noBangs = hairEngine.generateHair(Object.assign({}, baseConfig, {
        length: 'short',
        params: Object.assign({}, baseConfig.params, { bangs: false, sideLocks: true })
    }), body.template);
    const noLocks = hairEngine.generateHair(Object.assign({}, baseConfig, {
        length: 'short',
        params: Object.assign({}, baseConfig.params, { bangs: true, sideLocks: false })
    }), body.template);

    const shortFront = frameBbox(shortSpiky.sheet[0][1]);
    const longFront = frameBbox(longSpiky.sheet[0][1]);
    const shortSide = frameBbox(shortSpiky.sheet[1][1]);
    const longSide = frameBbox(longSpiky.sheet[1][1]);
    const shortBack = frameBbox(shortSpiky.sheet[3][1]);
    const longBack = frameBbox(longSpiky.sheet[3][1]);
    assert.ok(longFront.minY <= shortFront.minY + 1, 'long short-spiky front keeps a controlled crown height');
    assert.ok((longFront.maxX - longFront.minX) >= (shortFront.maxX - shortFront.minX), 'long short-spiky front keeps compact spike reach');
    assert.ok(longSide.maxY <= shortSide.maxY + 5, 'long short-spiky side stays compact without a ponytail');
    assert.ok(longBack.maxY >= shortBack.maxY + 6, 'long short-spiky back grows spike-mullet nape pieces');
    assert.ok(frameDiffCount(shortSpiky.sheet[0][1], noBangs.sheet[0][1]) >= 20, 'short-spiky bangs toggle changes spiky fringe');
    assert.ok(frameDiffCount(shortSpiky.sheet[0][1], noLocks.sheet[0][1]) >= 25, 'short-spiky side locks toggle changes angular sideburn tufts');
});

test('Hair Forge short spiky front keeps the central face open', () => {
    const style = 'psychronic';
    const body = loadRegistryPart(bodyPathForStyle(style));
    const config = Object.assign(hairEngine.defaultConfig(style), {
        tags: [style, 'male', 'hair'],
        hairStyle: 'short-spiky',
        length: 'short'
    });
    const result = hairEngine.generateHair(config, body.template);
    const frameIndex = 1;
    const anchors = outfitEngine.debugClassifyFrame({ style, tags: [style], zones: {} }, body.template.sheet[0][frameIndex], 0, body.template.palette || {}, frameIndex).anchors;
    const cx = Math.round(anchors.face.cx);
    const half = Math.max(8, Math.round((anchors.head.halfWidth || 10) + 2));
    const eyeY = Math.round(anchors.face.eyeY);
    let blockedPixels = 0;
    let checkedPixels = 0;

    for (let y = eyeY; y <= eyeY + 14; y++) {
        const openT = Math.max(0, Math.min(1, (y - (eyeY - 2)) / 10));
        const openHalf = Math.round(half * (0.24 + openT * 0.24));
        for (let x = cx - openHalf; x <= cx + openHalf; x++) {
            checkedPixels++;
            if (result.sheet[0][frameIndex][y][x] !== ' ') blockedPixels++;
        }
    }

    assert.ok(checkedPixels > 0, 'short-spiky face opening checks pixels');
    assert.equal(blockedPixels, 0, 'short-spiky front hair does not cover the central face');
});

test('Hair Forge short spiky pattern sliders change triangular spike texture', () => {
    const style = 'psychronic';
    const body = loadRegistryPart(bodyPathForStyle(style));
    const baseConfig = Object.assign(hairEngine.defaultConfig(style), { tags: [style, 'male', 'hair'], hairStyle: 'short-spiky', length: 'short' });
    const smooth = hairEngine.generateHair(Object.assign({}, baseConfig, {
        params: Object.assign({}, baseConfig.params, { lowerBanding: 0, lowerScraggle: 0 })
    }), body.template);
    const broken = hairEngine.generateHair(Object.assign({}, baseConfig, {
        params: Object.assign({}, baseConfig.params, { lowerBanding: 5, lowerScraggle: 5 })
    }), body.template);

    for (const directionIndex of [0, 1, 3]) {
        assert.ok(frameDiffCount(smooth.sheet[directionIndex][1], broken.sheet[directionIndex][1]) >= 60, `short-spiky pattern sliders visibly change direction ${directionIndex}`);
    }
});

test('Hair Forge side bangs toggle changes side-view forelocks', () => {
    const style = 'psychronic';
    const body = loadRegistryPart(bodyPathForStyle(style));
    const baseConfig = Object.assign(hairEngine.defaultConfig(style), { tags: [style, 'male', 'hair'] });
    const withBangs = hairEngine.generateHair(Object.assign({}, baseConfig, {
        params: Object.assign({}, baseConfig.params, { bangs: true })
    }), body.template);
    const withoutBangs = hairEngine.generateHair(Object.assign({}, baseConfig, {
        params: Object.assign({}, baseConfig.params, { bangs: false })
    }), body.template);

    assert.ok(frameDiffCount(withBangs.sheet[1][1], withoutBangs.sheet[1][1]) >= 20, 'left side-view hair changes when bangs are disabled');
    assert.ok(frameDiffCount(withBangs.sheet[2][1], withoutBangs.sheet[2][1]) >= 20, 'right side-view hair changes when bangs are disabled');
});

test('Hair Forge protects Psychronic female front frame 2 eye zone without cutting bangs', () => {
    const style = 'psychronic';
    const body = loadRegistryPart(bodyPathForStyle(style, 'female'));
    const config = Object.assign(hairEngine.defaultConfig(style), { tags: [style, 'female', 'hair'] });
    const result = hairEngine.generateHair(config, body.template);
    const frameIndex = 2;
    const bodyFrame = body.template.sheet[0][frameIndex];
    const anchors = outfitEngine.debugClassifyFrame({ style, tags: [style, 'female'], zones: {} }, bodyFrame, 0, body.template.palette || {}, frameIndex).anchors;
    const half = Math.max(8, Math.round((anchors.head.halfWidth || 10) + 2));
    const params = config.params || {};
    const eyeCx = Math.round(anchors.face.cx) - Math.max(3, Math.round(half * 0.28)) - Math.round(Number(params.eyeZoneX || 0));
    const eyeY = Math.round(anchors.face.eyeY) + Math.round(Number(params.eyeZoneY || 0));
    const zoneWidth = Math.max(1, Math.min(6, Math.round(Number(params.eyeZoneWidth ?? 3))));
    const zoneHeight = Math.max(1, Math.min(8, Math.round(Number(params.eyeZoneHeight ?? 5))));
    for (let dy = 0; dy < zoneHeight; dy++) {
        const edge = dy === 0 || dy === zoneHeight - 1;
        const rowHalf = Math.max(1, zoneWidth - (edge ? 1 : 0));
        for (let x = eyeCx - rowHalf; x <= eyeCx + rowHalf; x++) {
            assert.equal(result.sheet[0][frameIndex][eyeY + dy][x], ' ', `female Psychronic frame 2 eye zone is clear at ${x},${eyeY + dy}`);
        }
    }

    let surroundingBangPixels = 0;
    for (let y = Math.round(anchors.face.eyeY) - 5; y <= Math.round(anchors.face.eyeY); y++) {
        for (let x = eyeCx - 7; x <= eyeCx + 1; x++) {
            if (result.sheet[0][frameIndex][y][x] !== ' ') surroundingBangPixels++;
        }
    }
    assert.ok(surroundingBangPixels >= 36, 'female Psychronic frame 2 keeps surrounding bangs filled instead of cutting a rectangle');
});

test('Hair Forge side bangs fill the forward forehead area', () => {
    const style = 'psychronic';
    const body = loadRegistryPart(bodyPathForStyle(style));
    const config = Object.assign(hairEngine.defaultConfig(style), {
        tags: [style, 'male', 'hair'],
        params: Object.assign({}, hairEngine.defaultConfig(style).params, { bangs: true })
    });
    const result = hairEngine.generateHair(config, body.template);

    for (const directionIndex of [1, 2]) {
        const anchors = outfitEngine.debugClassifyFrame({ style, tags: [style], zones: {} }, body.template.sheet[directionIndex][1], directionIndex, body.template.palette || {}, 1).anchors;
        const faceSign = directionIndex === 1 ? -1 : 1;
        const sway = directionIndex === 1 ? -2 : 0;
        const rowCx = Math.round(anchors.face.cx + sway);
        const half = Math.max(8, Math.round((anchors.head.halfWidth || 10) + 2));
        const eyeY = Math.round(anchors.face.eyeY);
        let bangPixels = 0;
        for (let y = eyeY - 5; y <= eyeY + 3; y++) {
            for (let d = Math.round(half * 0.58); d <= Math.round(half * 0.96); d++) {
                if (result.sheet[directionIndex][1][y][rowCx + faceSign * d] !== ' ') bangPixels++;
            }
        }
        assert.ok(bangPixels >= 24, `${style} side ${directionIndex} bangs fill the forward forehead area`);
    }
});

test('Hair Forge side locks toggle and keep side-view outlines', () => {
    const style = 'psychronic';
    const body = loadRegistryPart(bodyPathForStyle(style));
    const baseConfig = Object.assign(hairEngine.defaultConfig(style), { tags: [style, 'male', 'hair'] });
    const withLocks = hairEngine.generateHair(Object.assign({}, baseConfig, {
        params: Object.assign({}, baseConfig.params, { sideLocks: true })
    }), body.template);
    const withoutLocks = hairEngine.generateHair(Object.assign({}, baseConfig, {
        params: Object.assign({}, baseConfig.params, { sideLocks: false })
    }), body.template);

    for (const directionIndex of [1, 2]) {
        const anchors = outfitEngine.debugClassifyFrame({ style, tags: [style], zones: {} }, body.template.sheet[directionIndex][1], directionIndex, body.template.palette || {}, 1).anchors;
        const faceSign = directionIndex === 1 ? -1 : 1;
        const sway = directionIndex === 1 ? -2 : 0;
        const rowCx = Math.round(anchors.face.cx + sway);
        const half = Math.max(8, Math.round((anchors.head.halfWidth || 10) + 2));
        const eyeY = Math.round(anchors.face.eyeY);
        let outlinePixels = 0;
        for (let y = eyeY + 3; y <= eyeY + 30; y++) {
            for (let d = -Math.round(half * 0.30); d <= Math.round(half * 0.34); d++) {
                if (withLocks.sheet[directionIndex][1][y][rowCx + faceSign * d] === 'O') outlinePixels++;
            }
        }

        assert.ok(frameDiffCount(withLocks.sheet[directionIndex][1], withoutLocks.sheet[directionIndex][1]) >= 60, `${style} side ${directionIndex} hair changes when side locks are disabled`);
        assert.ok(outlinePixels >= 20, `${style} side ${directionIndex} sideburn-anchored side-lock area keeps an exterior outline`);
    }
});

test('Hair Forge lower hair pattern sliders change front, side, and back lower shading', () => {
    const style = 'psychronic';
    const body = loadRegistryPart(bodyPathForStyle(style));
    const baseConfig = Object.assign(hairEngine.defaultConfig(style), { tags: [style, 'male', 'hair'] });
    const smooth = hairEngine.generateHair(Object.assign({}, baseConfig, {
        params: Object.assign({}, baseConfig.params, { lowerBanding: 5, lowerScraggle: 0 })
    }), body.template);
    const scraggly = hairEngine.generateHair(Object.assign({}, baseConfig, {
        params: Object.assign({}, baseConfig.params, { lowerBanding: 0, lowerScraggle: 5 })
    }), body.template);
    const minBand = hairEngine.generateHair(Object.assign({}, baseConfig, {
        params: Object.assign({}, baseConfig.params, { lowerBanding: 0, lowerScraggle: 2 })
    }), body.template);
    const maxBand = hairEngine.generateHair(Object.assign({}, baseConfig, {
        params: Object.assign({}, baseConfig.params, { lowerBanding: 5, lowerScraggle: 2 })
    }), body.template);

    for (const directionIndex of [0, 1, 3]) {
        const anchors = outfitEngine.debugClassifyFrame({ style, tags: [style], zones: {} }, body.template.sheet[directionIndex][1], directionIndex, body.template.palette || {}, 1).anchors;
        const lowerStart = Math.round(anchors.face.eyeY) + 12;
        let lowerDiffs = 0;
        for (let y = lowerStart; y <= lowerStart + 30; y++) {
            const a = smooth.sheet[directionIndex][1][y] || '';
            const b = scraggly.sheet[directionIndex][1][y] || '';
            for (let x = 0; x < Math.max(a.length, b.length); x++) if (a[x] !== b[x]) lowerDiffs++;
        }
        const bandingDiffs = frameDiffCount(minBand.sheet[directionIndex][1], maxBand.sheet[directionIndex][1]);
        assert.ok(lowerDiffs >= 120, `lower hair pattern sliders visibly change direction ${directionIndex} lower shading`);
        // Side views have a narrower lower mass, so banding diffs are smaller than front/back.
        const bandFloor = directionIndex === 0 || directionIndex === 3 ? 100 : 50;
        assert.ok(bandingDiffs >= bandFloor, `lowerBanding 0 vs 5 visibly changes direction ${directionIndex} (${bandingDiffs})`);
    }
});
