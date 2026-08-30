const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const editorRoot = path.resolve(__dirname, '..');
const animationSource = fs.readFileSync(
    path.join(editorRoot, 'src', 'database', 'DatabaseAnimationEditor.js'), 'utf8');
const uiSource = fs.readFileSync(path.join(editorRoot, 'src', 'DatabaseEditorUI.js'), 'utf8');

const DatabaseAnimationEditor = vm.runInNewContext(
    `${animationSource}\nDatabaseAnimationEditor;`,
    {
        console, process, require, nw: {}, window: {},
        document: { createElement: () => ({ style: {} }), getElementById: () => null }
    }
);
const plain = value => JSON.parse(JSON.stringify(value));

function defaultTemplates() {
    const at = uiSource.indexOf('getDefaultTemplates()');
    const open = uiSource.indexOf('return {', at);
    let depth = 0;
    let quote = null;
    let i = open + 'return '.length;
    const start = i;
    while (i < uiSource.length) {
        const char = uiSource[i];
        if (quote) {
            if (char === '\\') { i += 2; continue; }
            if (char === quote) quote = null;
        } else if (char === '"' || char === "'" || char === '`') quote = char;
        else if ('([{'.includes(char)) depth++;
        else if (')]}'.includes(char)) {
            depth--;
            if (depth === 0) { i++; break; }
        }
        i++;
    }
    return new Function(`return ${uiSource.slice(start, i)};`)();
}

test('new records remain MZ format and can become immediately editable MV records', () => {
    const blank = defaultTemplates().animations;
    assert.equal(DatabaseAnimationEditor.isSpriteAnimation(blank), false);
    assert.equal(blank.effectName, '');
    assert.equal(blank.displayType, 0);

    DatabaseAnimationEditor.convertAnimationFormat(blank, 'sprite');
    assert.equal(DatabaseAnimationEditor.isSpriteAnimation(blank), true);
    assert.equal(blank.animation1Name, '');
    assert.deepEqual(plain(blank.frames), [[]]);
    assert.deepEqual(plain(blank.timings), []);
    assert.equal(blank.position, 1);

    assert.equal(DatabaseAnimationEditor.isSpriteAnimation({ frames: [] }), true,
        'an imported zero-frame MV record remains sprite format');
    assert.equal(DatabaseAnimationEditor.isSpriteAnimation({ animation1Name: 'Sheet' }), false,
        'a name alone does not define the data format');
});

test('MZ to MV conversion creates a one-frame blank and maps stock flash fields', () => {
    const animation = {
        id: 7,
        effectName: 'Hit',
        displayType: 0,
        flashTimings: [
            { frame: 3, color: [12, 34, 56, 78], duration: 9 },
            { frame: 8 }
        ],
        soundTimings: [{ frame: 3, se: { name: 'Bell', pan: 0, pitch: 100, volume: 90 } }]
    };

    DatabaseAnimationEditor.convertAnimationFormat(animation, 'sprite');

    assert.deepEqual(plain(animation.frames), [[]]);
    assert.equal(animation.animation1Name, '');
    assert.equal(animation.effectName, undefined);
    assert.equal(animation.flashTimings, undefined);
    assert.equal(animation.soundTimings, undefined);
    assert.deepEqual(plain(animation.timings), [
        {
            frame: 3,
            se: { name: 'Bell', pan: 0, pitch: 100, volume: 90 },
            flashScope: 1,
            flashColor: [12, 34, 56, 78],
            flashDuration: 9
        },
        {
            frame: 8,
            se: { name: '', pan: 0, pitch: 100, volume: 90 },
            flashScope: 1,
            flashColor: [0, 0, 0, 0],
            flashDuration: 0
        }
    ]);
});

test('MV to MZ conversion writes only frame/color/duration flash fields', () => {
    const animation = {
        frames: [[]],
        timings: [{
            frame: 4,
            se: { name: 'Slash', pan: 0, pitch: 100, volume: 80 },
            flashScope: 2,
            flashColor: [255, 128],
            flashDuration: undefined
        }]
    };

    DatabaseAnimationEditor.convertAnimationFormat(animation, 'effekseer');

    assert.equal(animation.frames, undefined);
    assert.deepEqual(plain(animation.flashTimings), [{
        frame: 4,
        color: [255, 128, 0, 0],
        duration: 0,
        scope: 2
    }]);
    assert.deepEqual(Array.from(Object.keys(animation.flashTimings[0])).sort(), ['color', 'duration', 'frame', 'scope']);
    assert.equal(JSON.stringify(animation).includes('undefined'), false);
});

test('MV cells stop at the runtime limit of 16', () => {
    assert.equal(DatabaseAnimationEditor.canAddMVCell(new Array(15).fill(null)), true);
    assert.equal(DatabaseAnimationEditor.canAddMVCell(new Array(16).fill(null)), false);
    assert.equal(DatabaseAnimationEditor.canAddMVCell(null), false);

    const guards = animationSource.match(/DatabaseAnimationEditor\.canAddMVCell\(/g) || [];
    assert.ok(guards.length >= 6, 'the helper plus sheet, duplicate, and paste paths are guarded');
    assert.match(animationSource, /frameData\.slice\(0, 16\)\.forEach/,
        'preview rendering cannot show cells the MV runtime omits');
    assert.match(animationSource, /frameClipboard[\s\S]{0,300}f\.slice\(0, 16\)/,
        'whole-frame paste also respects the cell limit');
});

test('conversion is persisted and empty-frame MV controls are initialized', () => {
    assert.match(animationSource,
        /convertAnimationFormat\(animation, newType\);\s*this\.databaseManager\?\.updateAnimation\?\.\(animation\.id, animation\);/);
    assert.match(animationSource,
        /if \(isSpriteAnimation\) \{\s*this\.setupSpriteAnimationPlayback\(animation\);/);
    assert.doesNotMatch(animationSource,
        /isSpriteAnimation && animation\.frames && animation\.frames\.length > 0/);
    assert.match(animationSource, /id="anim\$\{slot\}-pick-btn"/);
    assert.match(animationSource, /id="add-frame-btn"/);
});

test('pattern -1 remains an editable hidden MV cell value', () => {
    assert.match(animationSource, /id="cell-pattern"[^>]+min="-1"/);
    assert.match(animationSource, /clamp\(intOr\('cell-pattern', pattern\), -1, 199\)/);
    assert.match(animationSource, /if \(pattern < 0\) return;/);
});
