const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const editorRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(editorRoot, '..');
const read = (...parts) => fs.readFileSync(path.join(editorRoot, ...parts), 'utf8');
const AnimationPickerModal = require(path.join(
    editorRoot, 'src', 'database', 'AnimationPickerModal.js'));
const PreviewBackdrop = require(path.join(
    editorRoot, 'src', 'utils', 'ThemeColors.js'));
const DatabaseAnimationEditor = require(path.join(
    editorRoot, 'src', 'database', 'DatabaseAnimationEditor.js'));
const ShowBattleAnimationEditor = require(path.join(
    editorRoot, 'src', 'event', 'commands', 'ShowBattleAnimationEditor.js'));

test('animation picker resolves direct and manager-backed project roots safely', () => {
    const projectManager = { getCurrentProject: () => ({ path: '/manager-project' }) };
    assert.equal(AnimationPickerModal.projectRootOf({
        projectPath: '/direct-project', projectManager
    }), '/direct-project');
    assert.equal(AnimationPickerModal.projectRootOf({ projectManager }), '/manager-project');
    assert.equal(AnimationPickerModal.projectRootOf({}), '');
});

test('preview backdrop exposes light, mid, and dark colors with WebGL channels', () => {
    assert.deepEqual(PreviewBackdrop.CHOICES.map(entry => entry.id), ['light', 'mid', 'dark']);
    assert.equal(PreviewBackdrop.choice('mid').color, '#6b6b6b');
    assert.equal(PreviewBackdrop.choice('invalid').id, 'dark');
    assert.deepEqual(PreviewBackdrop.rgb01(), [0, 0, 0]);
});

function fakeGl() {
    const calls = [];
    let id = 0;
    const gl = {
        VERTEX_SHADER: 1, FRAGMENT_SHADER: 2, LINK_STATUS: 3,
        ARRAY_BUFFER: 4, STATIC_DRAW: 5, FLOAT: 6, TEXTURE0: 7,
        TEXTURE_2D: 8, TEXTURE_MIN_FILTER: 9, TEXTURE_MAG_FILTER: 10,
        TEXTURE_WRAP_S: 11, TEXTURE_WRAP_T: 12, LINEAR: 13,
        CLAMP_TO_EDGE: 14, UNPACK_FLIP_Y_WEBGL: 15, DEPTH_TEST: 16,
        BLEND: 17, ONE: 18, ONE_MINUS_SRC_ALPHA: 19, RGBA: 20,
        UNSIGNED_BYTE: 21, TRIANGLES: 22,
        createShader: type => ({ type, id: ++id }),
        shaderSource() {}, compileShader() {},
        createProgram: () => (calls.push('createProgram'), { id: ++id }),
        attachShader() {}, linkProgram() {}, getProgramParameter: () => true,
        createBuffer: () => ({ id: ++id }), bindBuffer() {}, bufferData() {},
        getAttribLocation: () => 0, getUniformLocation: () => 0,
        createTexture: () => ({ id: ++id }), useProgram() {},
        enableVertexAttribArray() {}, vertexAttribPointer() {}, activeTexture() {},
        bindTexture() {}, texParameteri() {}, uniform1i() {},
        pixelStorei: (key, value) => calls.push(['flip', key, value]),
        disable: value => calls.push(['disable', value]),
        enable: value => calls.push(['enable', value]), blendFunc() {},
        texImage2D: (...args) => calls.push(['upload', args.at(-1)]),
        drawArrays: () => calls.push('draw')
    };
    return { gl, calls };
}

test('preview background blits once per frame and caches resources per GL context', () => {
    const editor = Object.create(DatabaseAnimationEditor.prototype);
    const a = fakeGl();
    const b = fakeGl();
    const source = { width: 960, height: 540 };

    assert.equal(editor._blitPreviewBackground(a.gl, source), true);
    assert.equal(editor._blitPreviewBackground(a.gl, source), true);
    assert.equal(editor._blitPreviewBackground(b.gl, source), true);
    assert.equal(a.calls.filter(call => call === 'createProgram').length, 1);
    assert.equal(b.calls.filter(call => call === 'createProgram').length, 1);
    assert.equal(a.calls.filter(call => call === 'draw').length, 2);
    assert.equal(a.calls.filter(call => Array.isArray(call) && call[0] === 'upload').length, 1);
    editor._previewBackgroundRevision = 1;
    assert.equal(editor._blitPreviewBackground(a.gl, source), true);
    assert.equal(a.calls.filter(call => Array.isArray(call) && call[0] === 'upload').length, 2);
    assert.deepEqual(a.calls.filter(call => Array.isArray(call) && call[0] === 'flip').at(-1),
        ['flip', a.gl.UNPACK_FLIP_Y_WEBGL, false]);
});

class FakeElement {
    constructor(tag) {
        this.tagName = tag;
        this.children = [];
        this.listeners = {};
        this.style = {};
        this.textContent = '';
    }
    appendChild(child) { this.children.push(child); return child; }
    addEventListener(type, listener) { this.listeners[type] = listener; }
    click() { this.listeners.click?.({ target: this }); }
}

test('Show Battle Animation uses the preview picker and rejects None', () => {
    const previousDocument = global.document;
    const previousModal = global.AnimationPickerModal;
    const previousWindow = global.window;
    const opens = [];
    global.document = { createElement: tag => new FakeElement(tag) };
    global.window = {};
    global.AnimationPickerModal = {
        label: (animations, id) => animations[id]?.name || `#${id}`,
        open: options => opens.push(options)
    };
    try {
        const animations = [null, { id: 1, name: 'Hit' }, null, { id: 3, name: 'Burst' }];
        const projectController = {};
        const editor = new ShowBattleAnimationEditor({ getAnimations: () => animations }, projectController);
        const section = editor.createAnimationSelector();
        const button = section.children[1];
        button.click();
        assert.equal(opens.length, 1);
        assert.equal(opens[0].projectManager, projectController);
        assert.equal(opens[0].allowNormalAttack, false);
        opens[0].onPick(0);
        assert.equal(editor.animationId, 1);
        opens[0].onPick(3);
        assert.equal(editor.animationId, 3);
        assert.equal(button.textContent, 'Burst');
        assert.equal(editor.buildCommand().parameters[1], 3);
    } finally {
        global.document = previousDocument;
        global.AnimationPickerModal = previousModal;
        global.window = previousWindow;
    }
});

test('all Effekseer surfaces use authored X rotation and aspect-neutral positive Y projection', () => {
    const modal = read('src', 'database', 'AnimationPickerModal.js');
    const database = read('src', 'database', 'DatabaseAnimationEditor.js');
    const event = read('src', 'event', 'AnimationPicker.js');
    const forge = read('src', 'forge', 'EffekseerGenerator', 'EffekseerGenerator.js');
    const sprites = fs.readFileSync(path.join(repoRoot, 'runtime', 'reactor_sprites.js'), 'utf8');
    const core = fs.readFileSync(path.join(repoRoot, 'runtime', 'reactor_core.js'), 'utf8');

    for (const source of [modal, database, event, forge, sprites, core]) {
        assert.doesNotMatch(source, /180\s*-\s*(?:rot|rotation|this\._animation)/);
    }
    assert.match(modal, /const ax = fxCanvas\.height \/ fxCanvas\.width;[\s\S]{0,180}?0, 1, 0, 0/);
    assert.match(event, /const x = canvas\.height \/ canvas\.width;[\s\S]{0,180}?0, 1, 0, 0/);
    assert.match(database, /const x = previewCanvas\.height \/ previewCanvas\.width;\s*const y = 1/);
    assert.match(database, /const x = canvas\.height \/ canvas\.width;[^]*?const y = 1/);
    assert.match(forge, /setProjectionMatrix\(\[1, 0, 0, 0, 0, 1,/);
    assert.match(sprites, /const y = q;/);
    assert.match(core, /setProjectionMatrix\(\[1, 0, 0, 0,\s*0, 1,/);
});

test('modal loading is synchronous-safe, standalone output is opaque, and scene blit precedes draw', () => {
    const modal = read('src', 'database', 'AnimationPickerModal.js');
    const database = read('src', 'database', 'DatabaseAnimationEditor.js');
    assert.match(modal, /let effect = null;\s*let syncLoaded = false;/);
    assert.match(modal, /effect = RR_loadEffekseerEffectFromFile/);
    assert.match(modal, /if \(syncLoaded\) install\(\)/);
    assert.match(modal, /getContext\('webgl', \{ premultipliedAlpha: false, alpha: false \}\)/);
    assert.match(modal, /gl\.clearColor\(backdropRgb\[0\], backdropRgb\[1\], backdropRgb\[2\], 1\)/);
    assert.match(modal, /playbackGeneration/);
    assert.match(modal, /fx\.waiters/);
    assert.match(modal, /fx\.effects\.delete\(anim\.effectName\)/);
    assert.match(modal, /effect && !loadFailed/);
    const blitAt = database.indexOf('editorSelf._blitPreviewBackground');
    const clearAt = database.lastIndexOf('gl.clear(', blitAt);
    const captureAt = database.indexOf('effekseerContext.captureBackground', blitAt);
    const drawAt = database.indexOf('effekseerContext.beginDraw()', captureAt);
    assert.ok(clearAt >= 0 && clearAt < blitAt);
    assert.ok(blitAt < captureAt && captureAt < drawAt);
    assert.doesNotMatch(database, /mix-blend-mode/);
});

test('effect-file preview applies the animation transform, scale, speed, and offsets', () => {
    const database = read('src', 'database', 'DatabaseAnimationEditor.js');
    assert.match(database, /previewHandle\.setLocation\(\(animation\.offsetX \|\| 0\) \* offsetScale/);
    assert.match(database, /previewHandle\.setRotation\(\(rotation\.x \* Math\.PI\) \/ 180/);
    assert.match(database, /previewHandle\.setScale\(scale, scale, scale\)/);
    assert.match(database, /previewHandle\.setSpeed\(speed\)/);
    assert.match(database, /requestId !== previewRequestId/,
        'repeated A-B-A selections cannot install an older same-name load');
});
