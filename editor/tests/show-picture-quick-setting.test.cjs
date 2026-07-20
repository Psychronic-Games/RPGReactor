const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const editorRoot = path.resolve(__dirname, '..');
const ShowPictureEditor = require(path.join(editorRoot, 'src', 'event', 'commands', 'ShowPictureEditor.js'));
const MovePictureEditor = require(path.join(editorRoot, 'src', 'event', 'commands', 'MovePictureEditor.js'));
const EventCommandList = require(path.join(editorRoot, 'src', 'event', 'EventCommandList.js'));

function makeEditor(advanced = {}) {
    return new ShowPictureEditor(
        { getSystem: () => ({ advanced }) },
        { getCurrentProject: () => ({ path: '/project' }) }
    );
}

test('Show Picture Quick Setting uses the project screen proportions', () => {
    const editor = makeEditor({ screenWidth: 1280, screenHeight: 720 });

    assert.deepEqual(editor.getGameResolution(), { width: 1280, height: 720 });
    assert.deepEqual(
        editor.pointerToQuickCoordinates(500, 250, { left: 100, top: 50, width: 800, height: 450 }),
        { x: 640, y: 320 }
    );
    assert.deepEqual(
        editor.pointerToQuickCoordinates(50, 600, { left: 100, top: 50, width: 800, height: 450 }),
        { x: 0, y: 720 },
        'drag coordinates stay on the game screen'
    );

    const bounds = editor.getQuickWorkspaceBounds();
    assert.deepEqual(bounds, { minX: -1280, maxX: 2560, minY: -720, maxY: 1440 });
    assert.deepEqual(
        editor.pointerToQuickCoordinates(100, 50, { left: 100, top: 50, width: 900, height: 506.25 }, bounds),
        { x: -1280, y: -720 },
        'the visual workspace exposes a full screen beyond the top and left edges'
    );
    assert.deepEqual(
        editor.pointerToQuickCoordinates(1000, 556.25, { left: 100, top: 50, width: 900, height: 506.25 }, bounds),
        { x: 2560, y: 1440 },
        'dragging can place a picture beyond the bottom and right screen edges'
    );
    assert.deepEqual(
        editor.pointerToQuickCoordinates(1225, 682.8125, { left: 100, top: 50, width: 900, height: 506.25 }, bounds, false),
        { x: 3520, y: 1980 },
        'pointer capture can continue changing coordinates beyond the visible workspace'
    );
});

test('Show Picture Quick Setting scales naturally with the app window', () => {
    const editor = makeEditor({ screenWidth: 1280, screenHeight: 720 });
    const compact = editor.calculateQuickDialogWidth(800, 600, 260);
    const expanded = editor.calculateQuickDialogWidth(1920, 1080, 220);

    assert.ok(compact <= 752, 'the dialog leaves room around a compact window');
    assert.ok(expanded > compact, 'the workspace grows on a larger monitor');
    assert.ok(expanded <= 1872, 'the dialog never exceeds the available viewport width');
    assert.equal(editor.calculateQuickDialogWidth(1000, 800, 320), 800);
});

test('Show Picture Quick Setting previews origin, scale, and opacity', () => {
    const editor = makeEditor({ screenWidth: 1280, screenHeight: 720 });
    editor.origin = 1;
    editor.scaleX = 50;
    editor.scaleY = 50;
    editor.opacity = 128;

    const geometry = editor.calculateQuickPreviewGeometry(400, 200, 640, 360, {
        origin: 1, x: 640, y: 360, scaleX: 50, scaleY: 50, opacity: 128
    });
    assert.deepEqual(geometry, {
        width: 100,
        height: 50,
        left: 270,
        top: 155,
        anchorX: 320,
        anchorY: 180,
        opacity: 128 / 255
    });
});

test('Show Picture Quick Setting keeps negative scale geometry usable', () => {
    const editor = makeEditor({ screenWidth: 640, screenHeight: 360 });
    const geometry = editor.calculateQuickPreviewGeometry(100, 50, 640, 360, {
        origin: 1,
        x: 320,
        y: 180,
        scaleX: -100,
        scaleY: -200,
        opacity: 255
    });

    assert.equal(geometry.width, 100);
    assert.equal(geometry.height, 100);
    assert.equal(geometry.left, 270);
    assert.equal(geometry.top, 130);

    const upperLeft = editor.calculateQuickPreviewGeometry(100, 50, 640, 360, {
        origin: 0,
        x: 320,
        y: 180,
        scaleX: -100,
        scaleY: -100,
        opacity: 255
    });
    assert.equal(upperLeft.left, 220);
    assert.equal(upperLeft.top, 130);
});

test('Show Picture Quick Setting commits all visual values as a direct position', () => {
    const editor = makeEditor({ screenWidth: 1280, screenHeight: 720 });
    editor.designationType = 1;
    editor.x = 3;
    editor.y = 4;

    editor.applyQuickSettingValues({
        origin: 1,
        x: 960,
        y: 900,
        scaleX: 75,
        scaleY: 125,
        opacity: 160
    });

    assert.equal(editor.designationType, 0);
    assert.equal(editor.origin, 1);
    assert.equal(editor.x, 960);
    assert.equal(editor.y, 900);
    assert.equal(editor.scaleX, 75);
    assert.equal(editor.scaleY, 125);
    assert.equal(editor.opacity, 160);
    assert.deepEqual(editor.buildCommand().parameters.slice(2, 9), [1, 0, 960, 900, 75, 125, 160]);
});

test('Move Picture preview resolves the latest preceding visible state', () => {
    const editor = new MovePictureEditor({ getSystem: () => ({}) }, {});
    const commands = [
        { code: 231, parameters: [1, 'UI/Portrait', 0, 0, -300, 360, 100, 100, 255, 0] },
        { code: 231, parameters: [2, 'Other', 0, 0, 20, 30, 100, 100, 255, 0] },
        { code: 232, parameters: [1, 0, 1, 0, 640, 360, 80, 90, 180, 0, 60, true, 0] },
        { code: 230, parameters: [30] }
    ];

    assert.deepEqual(editor.findPreviousPictureState(commands, 4, 1), {
        pictureName: 'UI/Portrait',
        origin: 1,
        designationType: 0,
        x: 640,
        y: 360,
        scaleX: 80,
        scaleY: 90,
        opacity: 180,
        blendMode: 0
    });

    commands.push({ code: 235, parameters: [1] });
    assert.equal(editor.findPreviousPictureState(commands, 5, 1), null);
    assert.equal(editor.findPreviousPictureState(commands, 4, 9), null);
});

test('Move Picture preview interpolates position, scale, and opacity with easing', () => {
    const editor = makeEditor({ screenWidth: 1280, screenHeight: 720 });
    const start = { origin: 0, x: -200, y: 100, scaleX: 50, scaleY: 50, opacity: 0 };
    const target = { origin: 1, x: 600, y: 500, scaleX: 100, scaleY: 150, opacity: 200 };

    assert.deepEqual(editor.interpolateQuickPreviewState(start, target, 0.5, 1), {
        origin: 1,
        x: 0,
        y: 200,
        scaleX: 62.5,
        scaleY: 75,
        opacity: 50
    });
});

test('Move Picture Quick Setting commits its live duration in frames', () => {
    const editor = new MovePictureEditor({ getSystem: () => ({}) }, {});
    editor.applyQuickSettingValues({
        origin: 0,
        x: 1200,
        y: 360,
        scaleX: 100,
        scaleY: 100,
        opacity: 255,
        duration: 180
    });

    assert.equal(editor.duration, 180);
    assert.equal(editor.buildCommand().parameters[10], 180);
});

test('event command editing gives Move Picture its preceding command context', () => {
    const list = Object.create(EventCommandList.prototype);
    const page = { list: [
        { code: 231, indent: 0, parameters: [1, 'Portrait', 0, 0, 0, 0, 100, 100, 255, 0] },
        { code: 232, indent: 0, parameters: [1, 0, 0, 0, 300, 200, 100, 100, 255, 0, 60, true, 0] }
    ] };
    let context;
    list.movePictureEditor = {
        show(command, callback, receivedContext) {
            context = receivedContext;
            callback(command);
        }
    };
    list.refreshCommandList = () => {};

    list.editCommand(1, page, 0);

    assert.equal(context.commands, page.list);
    assert.equal(context.index, 1);
});

test('Show Picture editor exposes the draggable Quick Setting screen', () => {
    const source = fs.readFileSync(path.join(editorRoot, 'src', 'event', 'commands', 'ShowPictureEditor.js'), 'utf8');
    assert.match(source, /show-picture-quick-setting-btn/);
    assert.match(source, /aspect-ratio: \$\{resolution\.width\} \/ \$\{resolution\.height\}/);
    assert.match(source, /sprite\.addEventListener\('pointerdown', startDrag\)/);
    assert.match(source, /left: 33\.333333%/);
});
