const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const editorRoot = path.resolve(__dirname, '..');
const source = fs.readFileSync(
    path.join(editorRoot, 'src', 'database', 'DatabaseAnimationEditor.js'), 'utf8');

function loadEditor() {
    return vm.runInNewContext(`${source}\nDatabaseAnimationEditor;`, {
        console: { log() {}, debug() {}, warn() {}, error() {} },
        RRAssetFiles: {
            basename: value => path.basename(String(value)),
            isBigCharacter: value => /^\$/.test(path.basename(String(value)))
        }
    });
}

function preview() {
    const DatabaseAnimationEditor = loadEditor();
    const editor = Object.create(DatabaseAnimationEditor.prototype);
    editor._resetPreviewFlash();
    return editor;
}

test('MV preview flashes multiply duration by four and decay on the firing tick', () => {
    const editor = preview();
    assert.equal(editor._firePreviewFlashTiming({
        flashScope: 1,
        flashColor: [255, 32, 16, 255],
        flashDuration: 5
    }, 4), true);
    assert.equal(editor._previewFlash.targetDuration, 20);

    editor._stepPreviewFlash();
    assert.equal(editor._previewFlash.targetDuration, 19);
    assert.equal(editor._previewFlash.target[3], 255 * 19 / 20);
    for (let tick = 0; tick < 19; tick++) editor._stepPreviewFlash();
    assert.equal(editor._previewFlash.targetDuration, 0);
    assert.equal(editor._previewFlash.target[3], 0);
    assert.equal(editor._previewFlashActive(), false);
});

test('screen and hide flashes use independent state while MZ duration stays unscaled', () => {
    const editor = preview();
    editor._firePreviewFlashTiming({
        flashScope: 2, flashColor: [1, 2, 3, 200], flashDuration: 2
    }, 4);
    editor._firePreviewFlashTiming({ flashScope: 3, flashDuration: 3 }, 4);
    assert.equal(editor._previewFlash.screenDuration, 8);
    assert.equal(editor._previewFlash.hideDuration, 12);

    editor._resetPreviewFlash();
    editor._firePreviewFlashTiming({ color: [5, 6, 7, 180], duration: 60 }, 1);
    assert.equal(editor._previewFlash.targetDuration, 60);
    assert.deepEqual(Array.from(editor._previewFlash.target), [5, 6, 7, 180]);
});

test('static sprite-frame flashes are visible at full authored intensity', () => {
    const editor = preview();
    editor._seedSpritePreviewFlash({ timings: [{
        frame: 3, flashScope: 1, flashColor: [10, 20, 30, 220], flashDuration: 4
    }] }, 3);
    assert.equal(editor._previewFlash.targetDuration, 16);
    assert.deepEqual(Array.from(editor._previewFlash.target), [10, 20, 30, 220]);

    editor._seedSpritePreviewFlash({ timings: [] }, 4);
    assert.equal(editor._previewFlashActive(), false);
});

test('preview anchors follow target head, center, feet, and screen positions', () => {
    const editor = preview();
    editor._previewTargetEnabled = true;
    editor._previewTargetBattlerName = 'Slime';
    editor._previewTargetImg = { complete: true, naturalWidth: 200, naturalHeight: 100 };
    const canvas = { width: 960, height: 540 };

    assert.deepEqual({ ...editor._previewAnchor({ position: 0 }, canvas) }, { x: 480, y: 301 });
    assert.deepEqual({ ...editor._previewAnchor({ position: 1 }, canvas) }, { x: 480, y: 351 });
    assert.deepEqual({ ...editor._previewAnchor({ position: 2 }, canvas) }, { x: 480, y: 401 });
    assert.deepEqual({ ...editor._previewAnchor({ position: 3 }, canvas) }, { x: 480, y: 270 });

    editor._previewTargetEnabled = false;
    assert.deepEqual({ ...editor._previewAnchor({ position: 0 }, canvas) }, { x: 480, y: 270 });
});

test('screen flash draws as a normal full-canvas overlay', () => {
    const editor = preview();
    editor._previewFlash.screen = [255, 128, 0, 128];
    editor._previewFlash.screenDuration = 1;
    const calls = [];
    const ctx = {
        save: () => calls.push('save'),
        restore: () => calls.push('restore'),
        set globalCompositeOperation(value) { calls.push(['blend', value]); },
        set fillStyle(value) { calls.push(['fill', value]); },
        fillRect: (...args) => calls.push(['rect', ...args])
    };
    editor._drawPreviewScreenFlash(ctx, { width: 960, height: 540 });
    assert.deepEqual(calls[1], ['blend', 'source-over']);
    assert.deepEqual(calls[3], ['rect', 0, 0, 960, 540]);
});

test('renderer source applies blend modes, anchored interaction, crisp strips, and 60 Hz flashes', () => {
    assert.match(source, /const canvasBlendOperations = \['source-over', 'lighter', 'multiply', 'screen'\]/);
    assert.match(source, /ctx\.globalCompositeOperation = canvasBlendOperations\[blendMode\] \|\| 'source-over'/);
    assert.match(source, /const anchor = editorSelf\._previewAnchor\(animation, canvas\)/);
    assert.match(source, /const anchor = this\._previewAnchor\(animation, previewCanvas\)/);
    assert.match(source, /canvas\.height = displayCellSize;\s*ctx\.imageSmoothingEnabled = false/g);
    assert.match(source, /const STEP = 1000 \/ 60/);
    assert.match(source, /_firePreviewFlashTiming\(timing, 4\)/);
    assert.match(source, /_drawPreviewScreenFlash\(ctx, canvas\)/);
});

test('Effekseer preview consumes target flashes and always balances beginDraw/endDraw', () => {
    assert.match(source, /for \(const timing of animation\.flashTimings \|\| \[\]\)/);
    assert.match(source, /_firePreviewFlashTiming\(\{\s*flashScope: 1,/);
    assert.match(source, /effekseerContext\.beginDraw\(\);[\s\S]*try \{[\s\S]*finally \{\s*effekseerContext\.endDraw\(\)/);
    assert.match(source, /lastTime = Date\.now\(\);\s*accumulator = 0;\s*editorSelf\._resetPreviewFlash\(\)/);
    assert.match(source, /currentFrame > maxTimingFrames\s*&& !editorSelf\._previewFlashActive\(\)/);
    assert.match(source, /const redrawBackground = advanceEffekseerTick\(\);[\s\S]*render\(\)/);
    assert.match(source, /const tickNeedsRedraw = advanceEffekseerTick\(\);\s*redrawBackground = redrawBackground \|\| tickNeedsRedraw/);
    assert.doesNotMatch(source, /redrawBackground \|\|= advanceEffekseerTick/);
    // Screen and Hide Target used to be greyed out for Effekseer animations;
    // the scope now rides the saved timing and the runtime honours it.
    assert.doesNotMatch(source, /radio\.disabled = true/);
});

test('timing edits, position changes, and delayed setup keep the active detail coherent', () => {
    // editTiming reads its row from the shared builder rather than rebuilding a
    // frame-keyed map of its own, which is what lets two sounds on one frame be
    // edited separately instead of collapsing into one row.
    assert.match(source, /editTiming\(animation, index\)[\s\S]{0,400}?DatabaseAnimationEditor\.timingRows\(animation\)/);
    assert.match(source, /static timingRows\(animation\)/);
    assert.match(source, /animation\.position = parseInt\(opt\.value\);[\s\S]{0,300}?_currentSpriteRenderFrame/);
    assert.match(source, /_currentSpriteRenderStaticFrame = renderStaticFrame/);
    assert.match(source, /_refreshStaticAnimationPreview\(animation\)/);
    assert.match(source, /expectedGeneration !== this\._previewSetupGeneration/);
    assert.match(source, /_registerDetailCleanup\(\(\) => clearTimeout\(retryTimer\)\)/);
});
