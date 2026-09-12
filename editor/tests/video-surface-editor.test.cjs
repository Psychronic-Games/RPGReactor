const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const editorRoot = path.resolve(__dirname, '..');
const read = relative => fs.readFileSync(path.join(editorRoot, relative), 'utf8');
const MediaSurfaceEditor = require(path.join(
    editorRoot, 'src', 'event', 'commands', 'MediaSurfaceEditor.js'));
const MediaSurfacePreviewManager = require(path.join(
    editorRoot, 'src', 'MediaSurfacePreviewManager.js'));

test('picker exposes all native Reactor video-surface commands', () => {
    const EventCommandPicker = require(path.join(editorRoot, 'src', 'event', 'EventCommandPicker.js'));
    const picker = new EventCommandPicker();
    const sections = picker.commandData.tab4.columns.flatMap(column => column.sections);
    const section = sections.find(candidate => candidate.title === 'Media Surfaces');
    assert.ok(section, 'Reactor has a Media Surfaces section');
    assert.deepEqual(section.commands.map(command => ({
        name: command.name, code: command.code, reactor: command.reactor
    })), [
        { name: 'Show Media Surface', code: 357, reactor: 'ShowVideoSurface' },
        { name: 'Transform Media Surface', code: 357, reactor: 'TransformVideoSurface' },
        { name: 'Stop Media Surface', code: 357, reactor: 'StopVideoSurface' }
    ]);
});

test('the editor script loads before EventCommandList', () => {
    const html = read('index.html');
    const editor = html.indexOf('src/event/commands/MediaSurfaceEditor.js');
    const previews = html.indexOf('src/MediaSurfacePreviewManager.js');
    const list = html.indexOf('src/event/EventCommandList.js');
    assert.ok(editor >= 0 && editor < previews && previews < list);
});

test('map preview scanning reduces sparse command sequences and retains exact source locations', () => {
    const show = {
        code: 357,
        indent: 0,
        parameters: ['RPGReactor', 'ShowVideoSurface', 'Show Video Surface', {
            id: 4, target: 'thisEvent', movie: 'panel.webm', width: 320, height: 180
        }]
    };
    const width = MediaSurfaceEditor.build('TransformVideoSurface', {
        ...MediaSurfaceEditor.defaults(), id: 4, width: 500
    }, 0, { changedFields: new Set(['width']) });
    const showCustom = MediaSurfaceEditor.build('ShowVideoSurface', {
        ...MediaSurfaceEditor.defaults(), id: 7, target: 'map', movie: 'warp.webm',
        corners: [{ x: -5, y: -4 }, { x: 6, y: -3 }, { x: 7, y: 5 }, { x: -8, y: 4 }]
    });
    const resizeCustom = MediaSurfaceEditor.build('TransformVideoSurface', {
        ...MediaSurfaceEditor.defaults(), id: 7, width: 640
    }, 0, { changedFields: new Set(['width']) });
    const stop = MediaSurfaceEditor.build('StopVideoSurface', { id: 4 });
    const map = {
        id: 12,
        events: [null, { id: 9, x: 2, y: 3, pages: [{ list: [show, width, showCustom, resizeCustom, stop, { code: 0 }] }] }]
    };
    const records = MediaSurfacePreviewManager.scanMap(map);
    assert.equal(records.length, 2);
    assert.deepEqual(records[0].source, { mapId: 12, eventId: 9, pageIndex: 0, commandIndex: 0 });
    assert.equal(records[0].state.target, 'event');
    assert.equal(records[0].state.eventId, 9);
    assert.equal(records[0].state.width, 500);
    assert.deepEqual(records[0].state.corners, [
        { x: -250, y: -90 }, { x: 250, y: -90 },
        { x: 250, y: 90 }, { x: -250, y: 90 }
    ]);
    assert.equal(records[0].stoppedAt, 4);
    assert.deepEqual(records[1].state.corners, [
        { x: -5, y: -4 }, { x: 6, y: -3 }, { x: 7, y: 5 }, { x: -8, y: 4 }
    ], 'size changes preserve explicitly authored corners');
});

test('live-map preview integration owns lifecycle, authoring, edge handles, and source navigation', () => {
    const manager = read('src/MediaSurfacePreviewManager.js');
    const main = read('src/main.js');
    const controller = read('src/ProjectController.js');
    const map3d = read('src/MapEditor3D.js');
    const editor = read('src/event/commands/MediaSurfaceEditor.js');
    assert.match(main, /new MediaSurfacePreviewManager/);
    assert.match(controller, /mediaSurfacePreviewManager\?\.beforeMapChange/);
    assert.match(map3d, /mediaSurfacePreviewManager\?\.attachThree/);
    assert.match(map3d, /mediaSurfacePreviewManager\?\.detachThree/);
    assert.match(manager, /new PIXI\.PerspectiveMesh/);
    assert.match(manager, /new THREE\.VideoTexture/);
    assert.match(manager, /Top media surface edge/);
    assert.match(manager, /_syncPixiAnchor/);
    assert.match(manager, /commandIndex/);
    assert.match(manager, /scrollIntoView/);
    assert.match(editor, /_beginLiveMapAuthoring/);
    assert.match(editor, /Drag the media surface on the map to move it/);
});

test('all three code-357 encodings round-trip and retain indent', () => {
    const data = {
        id: 17,
        target: 'event',
        movie: 'cutscenes/arrival.webm',
        eventId: 8,
        x: 123.5,
        y: 222.25,
        z: -3,
        width: 512,
        height: 288,
        opacity: 190,
        loop: false,
        muted: false,
        volume: 72,
        playbackRate: 1.25,
        corners: [
            { x: -251, y: -142 }, { x: 249, y: -139 },
            { x: 238, y: 136 }, { x: -243, y: 131 }
        ],
        rotationX: 12,
        rotationY: -34,
        rotationZ: 6,
        scaleX: 1.2,
        scaleY: 0.8,
        layer: 3,
        depth: 4.5,
        cullingDistance: 60,
        scanlines: 0.35,
        wait: true
    };

    for (const operation of Object.keys(MediaSurfaceEditor.OPERATIONS)) {
        const built = MediaSurfaceEditor.buildCommand(operation, data, 3);
        assert.equal(built.code, 357);
        assert.equal(built.indent, 3);
        assert.deepEqual(Array.from(built.parameters.slice(0, 3)), [
            'RPGReactor', operation, MediaSurfaceEditor.OPERATIONS[operation]
        ]);
        const parsed = MediaSurfaceEditor.parseCommand(built);
        const rebuilt = MediaSurfaceEditor.buildCommand(operation, parsed, built.indent);
        assert.deepEqual(rebuilt, built);
        assert.equal('placementMode' in built.parameters[3], false);
        if (operation !== 'StopVideoSurface') {
            assert.equal(built.parameters[3].scaleX, 1.2);
            assert.equal(built.parameters[3].scaleY, 0.8);
        }
        assert.equal('mapId' in built.parameters[3], false);
    }
});

test('2D coordinates use local corners and target-specific runtime anchors', () => {
    const defaults = MediaSurfaceEditor.defaults();
    assert.deepEqual(defaults.corners, [
        { x: -160, y: -90 }, { x: 160, y: -90 },
        { x: 160, y: 90 }, { x: -160, y: 90 }
    ]);
    assert.equal(defaults.x, 0);
    assert.equal(defaults.y, 0);

    const editor = Object.create(MediaSurfaceEditor.prototype);
    editor.context = { type: 'map', event: { id: 7, x: 2, y: 3 } };
    editor.snapshotMetrics = null;
    editor.databaseManager = null;
    editor._currentMap = () => ({ id: 1, events: [null, editor.context.event] });

    editor.data = { ...defaults, target: 'screen', x: 408, y: 312 };
    assert.deepEqual(editor._targetAnchor(), { x: 408, y: 312 });
    assert.deepEqual(editor._transformedCorners().map(point => ({
        x: point.x + 408, y: point.y + 312
    })), [
        { x: 248, y: 222 }, { x: 568, y: 222 },
        { x: 568, y: 402 }, { x: 248, y: 402 }
    ]);
    editor.data = { ...editor.data, scaleX: 2, scaleY: 0.5 };
    assert.deepEqual(editor._transformedCorners(), [
        { x: -320, y: -45 }, { x: 320, y: -45 },
        { x: 320, y: 45 }, { x: -320, y: 45 }
    ]);

    editor.data = { ...defaults, target: 'thisEvent', x: 10, y: -5 };
    assert.deepEqual(editor._targetAnchor(), { x: 130, y: 97 },
        'event screenX is tile center and screenY is tile foot, pixel offsets apply, and the surface stands on that point (half its height higher)');

    editor.data = { ...defaults, target: 'map', x: 4, y: 5 };
    assert.deepEqual(editor._targetAnchor(), { x: 216, y: 174 },
        'fixed map coordinates are tile centers the surface stands on');

    editor.snapshotMetrics = {
        sourceWidth: 816, sourceHeight: 624, tileSize: 48,
        mapX: -48, mapY: -96, mapScaleX: 2, mapScaleY: 2
    };
    assert.deepEqual(editor._targetAnchor(), { x: 384, y: 342 },
        'map anchors include the captured editor pan and zoom, then the standing lift');
});

test('Transform is a sparse alias-normalizing patch that preserves unknown args', () => {
    const command = {
        code: 357,
        indent: 2,
        parameters: ['RPGReactor', 'TransformVideoSurface', 'Transform Video Surface', {
            descriptor: { surfaceId: '9', xOffset: '4', vendorFlag: 'keep-me' },
            placementMode: '3d', scaleX: 2, mapId: 99
        }]
    };
    const parsed = MediaSurfaceEditor.parseCommand(command);
    assert.equal(parsed.id, 9);
    assert.equal(parsed.x, 4);
    parsed.x = 12.5;
    const built = MediaSurfaceEditor.buildCommand('TransformVideoSurface', parsed, 2, {
        changedFields: new Set(['x'])
    });
    assert.deepEqual(built.parameters[3], { scaleX: 2, vendorFlag: 'keep-me', id: 9, x: 12.5 });
    assert.equal(built.indent, 2);

    const fresh = MediaSurfaceEditor.defaults();
    fresh.id = 4;
    const idOnly = MediaSurfaceEditor.buildCommand('TransformVideoSurface', fresh, 0, {
        changedFields: new Set()
    });
    assert.deepEqual(idOnly.parameters[3], { id: 4 });

    const sparseWidth = MediaSurfaceEditor.parseCommand({
        code: 357, indent: 0,
        parameters: ['RPGReactor', 'TransformVideoSurface', 'Transform Video Surface', { id: 4, width: 500 }]
    });
    const widthPatch = MediaSurfaceEditor.buildCommand('TransformVideoSurface', sparseWidth, 0, {
        changedFields: new Set(['width'])
    });
    assert.deepEqual(widthPatch.parameters[3], { id: 4, width: 500 },
        'a size-only patch does not invent custom corners');

    const targetEditor = Object.create(MediaSurfaceEditor.prototype);
    targetEditor.operation = 'TransformVideoSurface';
    targetEditor.data = { ...MediaSurfaceEditor.defaults(), id: 4, target: 'event', eventId: 7 };
    targetEditor.context = { type: 'map', event: { id: 7 } };
    targetEditor.fields = { id: { value: '4' }, eventId: { value: '7' } };
    targetEditor.changedFields = new Set(['target']);
    targetEditor._resolveBinding();
    const targetPatch = MediaSurfaceEditor.buildCommand('TransformVideoSurface', targetEditor.data, 0, {
        changedFields: targetEditor.changedFields
    });
    assert.deepEqual(targetPatch.parameters[3], { id: 4, target: 'event', eventId: 7 });
});

test('runtime aliases and nested payloads normalize without losing behavior', () => {
    const parsed = MediaSurfaceEditor.parseCommand({
        code: 357,
        indent: 0,
        parameters: ['RPGReactor', 'ShowVideoSurface', 'Show Video Surface', JSON.stringify({
            data: {
                videoId: '6', file: 'nested/panel.mp4', bindTo: 'fixed-map',
                xOffset: '3', yOffset: '8', fourCorners: [[-2, -1], [2, -1], [2, 1], [-2, 1]],
                vendorFlag: 17
            }
        })]
    });
    assert.equal(parsed.id, 6);
    assert.equal(parsed.movie, 'nested/panel.mp4');
    assert.equal(parsed.target, 'map');
    assert.equal(parsed.x, 3);
    assert.deepEqual(parsed.corners[0], { x: -2, y: -1 });
    const rebuilt = MediaSurfaceEditor.buildCommand('ShowVideoSurface', parsed);
    assert.equal(rebuilt.parameters[3].vendorFlag, 17);
    assert.equal(rebuilt.parameters[3].movie, 'nested/panel.mp4');
    assert.equal(rebuilt.parameters[3].target, 'map');
});

test('legacy alpha, named layers, and audible aliases keep their runtime meaning', () => {
    const parsed = MediaSurfaceEditor.parseCommand({
        code: 357,
        indent: 0,
        parameters: ['RPGReactor', 'ShowVideoSurface', 'Show Video Surface', {
            id: 2, file: 'legacy.webm', target: 'map', alpha: 0.5,
            layer: 'above', audible: true
        }]
    });
    assert.equal(parsed.opacity, 127.5);
    assert.equal(parsed.layer, 5);
    assert.equal(parsed.muted, false);
    const rebuilt = MediaSurfaceEditor.build('ShowVideoSurface', parsed);
    assert.equal(rebuilt.parameters[3].opacity, 127.5);
    assert.equal(rebuilt.parameters[3].layer, 5);
    assert.equal(rebuilt.parameters[3].muted, false);
});

test('movie discovery is recursive, keeps extensions, and excludes symlinks', t => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-video-surfaces-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const movies = path.join(root, 'movies');
    fs.mkdirSync(path.join(movies, 'chapter 1'), { recursive: true });
    fs.writeFileSync(path.join(movies, 'intro.webm'), 'video');
    fs.writeFileSync(path.join(movies, 'clip#1.webm'), 'video');
    // Windows filenames cannot contain '?'; the lexical path check below
    // still exercises it on every platform, and POSIX also tests discovery.
    if (process.platform !== 'win32') fs.writeFileSync(path.join(movies, 'clip?take=1.mp4'), 'video');
    fs.writeFileSync(path.join(movies, 'clip%25.webm'), 'video');
    fs.writeFileSync(path.join(movies, 'chapter 1', 'arrival.mp4'), 'video');
    fs.writeFileSync(path.join(movies, 'chapter 1', 'ignore.txt'), 'text');

    try {
        fs.symlinkSync(path.join(movies, 'intro.webm'), path.join(movies, 'linked.webm'));
        fs.symlinkSync(path.join(movies, 'chapter 1'), path.join(movies, 'linked-folder'));
    } catch (error) {
        if (process.platform !== 'win32') throw error;
    }

    const editor = new MediaSurfaceEditor({ currentProject: { path: root } });
    const found = editor.discoverMovies().map(file => file.relativePath);
    assert.deepEqual(new Set(found), new Set([
        'chapter 1/arrival.mp4', 'clip#1.webm', 'clip%25.webm', 'intro.webm',
        ...(process.platform !== 'win32' ? ['clip?take=1.mp4'] : [])
    ]));
    assert.equal(MediaSurfaceEditor.safeMoviePath('../escape.webm'), false);
    assert.equal(MediaSurfaceEditor.safeMoviePath('https://example.test/a.webm'), false);
    assert.equal(MediaSurfaceEditor.safeMoviePath('ordinary#cut?100%.webm'), true);
});

test('validation blocks invalid Show data and enforces contexts and loop/wait exclusion', () => {
    const valid = {
        ...MediaSurfaceEditor.defaults(), id: 2, target: 'screen', x: 408, y: 312,
        movie: 'clips/intro.webm', loop: false, wait: true
    };
    assert.deepEqual(MediaSurfaceEditor.validate('ShowVideoSurface', valid, { type: 'map' }), []);
    assert.match(MediaSurfaceEditor.validate('ShowVideoSurface', {
        ...valid, id: 0, movie: '', width: 0
    }, { type: 'map' }).join('\n'), /Surface ID[\s\S]*Select a safe[\s\S]*Width/);
    assert.match(MediaSurfaceEditor.validate('ShowVideoSurface', {
        ...valid, target: 'event', eventId: 0
    }, { type: 'map' }).join('\n'), /positive event ID/);
    assert.match(MediaSurfaceEditor.validate('ShowVideoSurface', {
        ...valid, target: 'thisEvent'
    }, { type: 'common' }).join('\n'), /explicit target/);
    assert.match(MediaSurfaceEditor.validate('ShowVideoSurface', valid, { type: 'troop' }).join('\n'), /map-only/);
    assert.match(MediaSurfaceEditor.validate('ShowVideoSurface', {
        ...valid, loop: true, wait: true
    }, { type: 'map' }).join('\n'), /cannot both/);

    const editor = Object.create(MediaSurfaceEditor.prototype);
    editor.operation = 'ShowVideoSurface';
    editor.context = { type: 'common' };
    editor.data = { ...MediaSurfaceEditor.defaults(), id: 2, loop: true, wait: true };
    editor.fields = { id: { value: '2' }, loop: { checked: true }, wait: { checked: true } };
    editor.changedFields = new Set();
    editor._applyContextDefaults(null);
    assert.equal(editor.data.target, 'map');
    editor._resolveBinding();
    assert.equal(editor.data.loop, false);
    assert.equal(editor.data.wait, true);

    const source = read('src/event/commands/MediaSurfaceEditor.js');
    assert.match(source, /if \(errors\.length\)[\s\S]*?_showValidation\(errors\)[\s\S]*?return;/);
});

test('map/common contexts route safely and troop allows Stop only', () => {
    const list = read('src/event/EventCommandList.js');
    const common = read('src/database/DatabaseCommonEventEditor.js');
    const troop = read('src/database/DatabaseTroopEditor.js');

    assert.match(list, /MediaSurfaceEditor\.supports\(name\)/);
    assert.match(list, /_reactorCommandEditor\(command\.reactor\)/);
    assert.match(list, /_reactorCommandEditor\(command\.parameters\[1\]\)/);
    assert.match(list, /_videoSurfaceContext\(page, pageIndex, (?:insertIndex|index)\)/);
    assert.match(common, /MediaSurfaceEditor\.supports\(command\.reactor\)[\s\S]*?getEditor\('videoSurface'/);
    assert.match(common, /MediaSurfaceEditor\.supports\(command\.parameters\?\.\[1\]\)[\s\S]*?getEditor\('videoSurface'/);
    assert.match(common, /\{ type: 'common' \}/);
    assert.match(troop, /command\.reactor === 'StopVideoSurface'/);
    assert.match(troop, /\['ShowVideoSurface', 'TransformVideoSurface'\]\.includes\(command\.reactor\)/);
    assert.match(troop, /warnVideoSurfaceMapOnly\(\)/);
    assert.match(troop, /\{ type: 'troop' \}/);

    const commonSpecialized = common.indexOf("getEditor('videoSurface', MediaSurfaceEditor)", common.indexOf('// Plugin Command'));
    const commonGeneric = common.indexOf("getEditor('pluginCommand', PluginCommandEditor)", commonSpecialized);
    assert.ok(commonSpecialized >= 0 && commonSpecialized < commonGeneric);
    const troopSpecialized = troop.indexOf("getCommandEditor('videoSurface', MediaSurfaceEditor)", troop.indexOf("cmd.parameters?.[1] === 'StopVideoSurface'"));
    const troopGeneric = troop.indexOf("getCommandEditor('pluginCommand', PluginCommandEditor)", troopSpecialized);
    assert.ok(troopSpecialized >= 0 && troopSpecialized < troopGeneric);

    assert.match(common, /replaceContiguousBlock\(event\.list, idx, editedCommand, 357, 657\)/);
    assert.match(troop, /replaceContiguousBlock\(page\.list, idx, edited, 357, 657\)/);
});

test('troop display uses the Reactor human label', () => {
    // A troop page reads its summaries from EventCommandList, so the label a
    // Reactor plugin command shows is decided in one place for both hosts.
    const troop = read('src/database/DatabaseTroopEditor.js');
    assert.match(troop, /getCommandInfo\(cmd, page, index\)/);
    const list = read('src/event/EventCommandList.js');
    assert.match(list, /code === 357 && pluginName === 'RPGReactor' && commandName/);
});

test('visual tooling contains a true quad, event anchor, 3D controls, and deterministic cleanup', () => {
    const source = read('src/event/commands/MediaSurfaceEditor.js');
    assert.match(source, /video-surface-placement-workspace/);
    assert.match(source, /clipPath = `polygon\(/);
    assert.match(source, /vs-corner-handle/);
    assert.match(source, /vs-event-anchor/);
    assert.match(source, /vs-map-snapshot/);
    assert.match(source, /vs-3d-placement/);
    assert.match(source, /Z \/ Elevation/);
    assert.match(source, /schematic orientation/);
    assert.match(source, /rotateX\(/);
    assert.match(source, /pointercancel/);
    assert.match(source, /removeEventListener/);
    assert.match(source, /media\.pause\(\)/);
    assert.match(source, /media\.removeAttribute\('src'\)/);
    assert.doesNotMatch(source, /data\.placementMode|fields\.placementMode/);
    assert.match(source, /Scale X/);
    assert.match(source, /Scale Y/);

    let removed = 0;
    let paused = 0;
    let loaded = 0;
    const editor = new MediaSurfaceEditor();
    editor.cleanupHandlers.push(() => { removed += 1; });
    editor.video = {
        pause() { paused += 1; },
        removeAttribute(name) { assert.equal(name, 'src'); },
        load() { loaded += 1; }
    };
    editor.handles = [{}];
    editor.workspace = {};
    editor.close();
    assert.equal(removed, 1);
    assert.equal(paused, 1);
    assert.equal(loaded, 1);
    assert.equal(editor.handles, null);
    assert.equal(editor.workspace, null);
});

test('edge handles resize along the edge normal instead of shearing', () => {
    const original = [
        { x: -160, y: -90 }, { x: 160, y: -90 }, { x: 160, y: 90 }, { x: -160, y: 90 }
    ];
    const corners = original.map(corner => ({ ...corner }));
    // Right edge dragged diagonally: only the horizontal component applies.
    MediaSurfacePreviewManager.resizeEdge(corners, original, [1, 2], { x: 160, y: 0 }, { x: 200, y: 30 });
    assert.deepEqual(corners, [
        { x: -160, y: -90 }, { x: 200, y: -90 }, { x: 200, y: 90 }, { x: -160, y: 90 }
    ]);
    // Bottom edge dragged diagonally: only the vertical component applies.
    const snapshot = corners.map(corner => ({ ...corner }));
    MediaSurfacePreviewManager.resizeEdge(corners, snapshot, [2, 3], { x: 0, y: 90 }, { x: -20, y: 115 });
    assert.deepEqual(corners.slice(2), [{ x: 200, y: 115 }, { x: -160, y: 115 }]);
    // A rotated edge still moves along its own normal.
    const tilted = [{ x: 0, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 200 }, { x: -100, y: 100 }];
    const warped = tilted.map(corner => ({ ...corner }));
    MediaSurfacePreviewManager.resizeEdge(warped, tilted, [0, 1], { x: 50, y: 50 }, { x: 50 + 10, y: 50 - 10 });
    const shift = Math.hypot(warped[0].x, warped[0].y);
    assert.ok(Math.abs(shift - Math.SQRT2 * 10) < 1e-9, 'moves by the normal component only');
    assert.ok(Math.abs((warped[1].x - warped[0].x) - 100) < 1e-9 && Math.abs((warped[1].y - warped[0].y) - 100) < 1e-9,
        'the edge keeps its direction and length');
});

test('map previews keep the placeholder until a movie frame is decoded and let PIXI start playback', () => {
    const manager = read('src/MediaSurfacePreviewManager.js');
    const editor = read('src/event/commands/MediaSurfaceEditor.js');
    assert.match(manager, /autoLoad: false, autoPlay: true/, 'PIXI plays once our single load() call has finished');
    assert.doesNotMatch(manager, /autoPlay: false/, 'no preview calls play() before PIXI restarts the load');
    assert.match(manager, /return owner\.placeholderTexture;/, 'the mesh starts on the placeholder');
    assert.match(manager, /video\.addEventListener\('playing', showVideo\)/, 'and swaps once a frame exists');
    assert.match(manager, /_keepPlaying\(owner, owner\.video\)/, 'DOM and Three previews retry playback');
    assert.match(manager, /static resizeEdge\(/);
    assert.match(manager, /revealAuthoringSurface\(\) \{/);
    assert.match(editor, /_previewManager\(\)\?\.revealAuthoringSurface\?\.\(\)/, 'reveal happens after the live panel exists');
    assert.match(editor, /livePanelRect\(\) \{/);
    assert.match(editor, /_makePanelDraggable\(header, dialog, closeButton\)/);
    assert.match(editor, /edge handle to resize it/);
});

test('changing the target re-expresses the position so the surface stays put', () => {
    const manager = new MediaSurfacePreviewManager({}, { getSystem: () => ({ startMapId: 12, startX: 3, startY: 4 }) });
    manager.map = { id: 12, events: [null, { id: 1, x: 10, y: 5 }] };
    manager.tilemapManager = { TILE_WIDTH: 48, TILE_HEIGHT: 48, container: { x: -100, y: 20, scale: { x: 1 } } };
    manager.pixiOwners.set('__authoring__', {});
    const state = { target: 'screen', x: 0, y: 0, corners: [], height: 100, scaleY: 1 };
    // Bound to event 1 at offset (0, 0): the feet are at (10.5 * 48, 6 * 48) = (504, 288)
    // and the surface stands on them, so its centre is 50px higher.
    assert.deepEqual(manager.convertTargetPosition(state, 'thisEvent', 1), { x: 404, y: 258 },
        'screen pixels are the visual centre, including the map pan');
    state.target = 'map';
    assert.deepEqual(manager.convertTargetPosition(state, 'thisEvent', 1), { x: 10, y: 5.5 });
    state.target = 'player';
    assert.deepEqual(manager.convertTargetPosition(state, 'thisEvent', 1), { x: 336, y: 48 },
        'player start (3,4) anchors at (168, 240)');
    Object.assign(state, { target: 'thisEvent', x: 404, y: 258 });
    assert.deepEqual(manager.convertTargetPosition(state, 'screen', 1), { x: 0, y: 0 }, 'and back');
    assert.equal(manager.convertTargetPosition(state, 'thisEvent', 1), null, 'no-op for the same target');
    manager.pixiOwners.clear();
    assert.equal(manager.convertTargetPosition(state, 'screen', 1), null, 'only the 2D preview converts');
});

test('the live panel shows target-specific fields and can pop out to its own window', () => {
    const editor = read('src/event/commands/MediaSurfaceEditor.js');
    assert.match(editor, /_buildEventField\(identityGrid\)/, 'Event sits beside Target');
    assert.match(editor, /eventInput\.disabled = !editable;/);
    assert.match(editor, /target === 'player' \? '__player' : target === 'thisEvent' \? '__this' : '__none'/);
    assert.match(editor, /show\('cullingDistance', target !== 'screen'\)/);
    assert.match(editor, /X and Y are screen pixels\./);
    assert.match(editor, /nw\.Window\.open\('media-surface-panel\.html'/);
    assert.match(editor, /doc\.body\.appendChild\(dialog\)/, 'the dialog element is adopted, keeping its listeners');
    assert.match(editor, /this\._dockPanel\(\);\n        for \(const cleanup of this\.cleanupHandlers/, 'close() docks first');
    assert.ok(fs.existsSync(path.join(editorRoot, 'media-surface-panel.html')));
    assert.match(read('src/MediaSurfacePreviewManager.js'), /convertTargetPosition\(state, previousTarget, ownerEventId\) \{/);
});

test('saved surfaces open their Show command in Media Surface mode and list under their own name', () => {
    const manager = new MediaSurfacePreviewManager({mediaSurfaceManager:{panel:{}}}, {});
    manager.map = { id: 7, events: [] };
    const record = { source: { mapId: 7, eventId: 1, pageIndex: 0, commandIndex: 2 } };
    assert.equal(manager.canEdit(record), true);
    assert.equal(manager.canEdit({ ...record, authoring: true }), false);
    assert.equal(manager.canEdit({ source: { ...record.source, mapId: 8 } }), false, 'only the current map');
    manager.authoring = {};
    assert.equal(manager.canEdit(record), false, 'never while another surface is being authored');

    const source = read('src/MediaSurfacePreviewManager.js');
    assert.match(source, /mesh\.on\('pointertap', tap\)/, 'PIXI previews open on click');
    assert.match(source, /surface\.addEventListener\('click', click\)/, 'screen previews open on click');
    assert.match(source, /Math\.hypot\(upEvent\.clientX - startX, upEvent\.clientY - startY\) < 4\) this\.editRecord/, '3D previews open on click, not drag');
    assert.match(source, /context\?\.editing && editor\.operation === 'ShowVideoSurface'/, 'the saved preview hides while its command is edited');
    const editor = read('src/event/commands/MediaSurfaceEditor.js');
    assert.match(editor, /this\._button\('Go to Event'\)/);
    const list = read('src/event/EventCommandList.js');
    assert.match(list, /pluginName === 'RPGReactor' && commandName\) \{\n\s+\/\/ Reactor's own commands/, 'Reactor commands are not listed as Plugin Command');
    assert.match(list, /_videoSurfaceContext\(page, pageIndex, index, true\)/);
});

test('2D previews stack among the tile layers by layer, like the game sorts them', () => {
    const band = layer => MediaSurfacePreviewManager.pixiBandFor(layer);
    assert.equal(band(-1), 'under', 'negative layers sit below every tile');
    assert.equal(band(0), 'mid');
    assert.equal(band(3), 'mid', 'the default layer sits between lower and upper tiles, with characters');
    assert.equal(band(4), 'over', 'above the upper tiles');
    assert.equal(band(5), 'top', 'above characters');
    assert.equal(band(undefined), 'mid');
    const manager = read('src/MediaSurfacePreviewManager.js');
    assert.match(manager, /insert\(this\.pixiBands\.under, layers\.ground, layers\.parallax\)/);
    assert.match(manager, /insert\(this\.pixiBands\.mid, layers\.upper0, layers\.a1lower3\)/);
    assert.match(manager, /if \(root && owner\.container\.parent !== root\) root\.addChild\(owner\.container\);/, 'changing the layer re-parents live');
    const editor = read('src/event/commands/MediaSurfaceEditor.js');
    assert.match(editor, /'rr-number-stepper vs-stepper'/, 'numeric fields use the themed stepper');
    assert.match(editor, /input\.stepUp\(\) : input\.stepDown\(\)/);
});

test('previews show scanlines, stand on their anchor like the game, clamp typed values, and can be toggled', () => {
    const manager = read('src/MediaSurfacePreviewManager.js');
    const editor = read('src/event/commands/MediaSurfaceEditor.js');
    const runtime = fs.readFileSync(path.join(editorRoot, '..', 'runtime', 'reactor_media_surfaces.js'), 'utf8');
    assert.match(manager, /_syncPixiScanlines\(owner, corners\)/);
    assert.match(manager, /_syncThreeScanlines\(owner\)/);
    assert.match(manager, /repeating-linear-gradient\(rgba\(0,0,0,\$\{scan \* 0\.5\}\) 0 1px, transparent 1px 2px\)/, 'one dark line every other pixel, like PSYCHRONIC_VideoOverlay');
    assert.match(manager, /y \+= 2\) context\.fillRect\(0, y, width, 1\)/);
    assert.match(runtime, /y \+= 2\) context\.fillRect\(0, y, canvas\.width, 1\)/);
    assert.equal(MediaSurfacePreviewManager.scanlineAmount({ scanlines: 40 }), 1);
    assert.equal(MediaSurfacePreviewManager.standingLift({ target: 'thisEvent', height: 180, scaleY: -1 }), 90);
    assert.equal(MediaSurfacePreviewManager.standingLift({ target: 'map', height: 180, scaleY: 1, z: 2 }), 90, 'Z is 3D elevation only; it never moves the 2D placement');
    assert.match(runtime, /y -= descriptor\.height \* Math\.abs\(descriptor\.scaleY\) \/ 2;/);
    assert.doesNotMatch(runtime, /descriptor\.z \* th/);
    assert.equal(MediaSurfacePreviewManager.standingLift({ target: 'screen', height: 180, scaleY: 1 }), 0);
    assert.match(fs.readFileSync(path.join(editorRoot, '..', 'runtime', 'reactor_main.js'), 'utf8'), /runtime revision: 20260911\.6/);
    assert.match(editor, /if \(options\.max !== undefined && next > options\.max\) next = options\.max;/);
    assert.match(editor, /if \(final && options\.min !== undefined && next < options\.min\) next = options\.min;/);
    assert.match(manager, /setEnabled\(enabled\) \{/);
    assert.match(read('index.html'), /id="map-video-previews"/);
    assert.match(read('src/main.js'), /setShowVideoPreviews\(event\.currentTarget\.checked\)/);
    assert.match(read('src/OptionsManager.js'), /getShowVideoPreviews\(\) \{/);
});

test('Preview Event draws a page graphic in place and is remembered in the map sidecar', () => {
    const events = read('src/EventManager.js');
    assert.match(events, /'eventCtx\.previewEvent'\), enabled: !!eventAtPos, submenu: this\._eventPreviewMenu\(eventAtPos\)/);
    assert.match(events, /map\.reactor3d\.eventPreviews\[String\(event\.id\)\] = pageIndex;/);
    assert.match(events, /sprite\.anchor\.set\(0\.5, 1\);/, 'feet at the tile bottom like Sprite_Character');
    assert.match(events, /const shift = \/\^!\/\.test\(image\.characterName\) \? 0 : 6;/);
    assert.match(events, /this\.renderEventPreviews\(\);\n/);
    for (const locale of ['en', 'ja', 'ko', 'tr', 'th']) {
        const I18n = read('src/I18nManager.js');
        assert.ok(I18n.includes(`'eventCtx.previewEvent'`), locale);
    }
    // The sidecar is kept alive by previews alone.
    const RRMapElevation = require(path.join(editorRoot, 'src', 'utils', 'MapElevation.js'));
    const writes = [];
    const fakeFs = { existsSync: () => false, unlinkSync: () => { throw new Error('must not delete'); }, writeFileSync: (file, data) => writes.push([file, data]) };
    const fakePath = { join: (...parts) => parts.join('/') };
    const map = { id: 3, width: 2, height: 2, reactor3d: { eventPreviews: { '5': 1 } } };
    assert.equal(RRMapElevation.save(fakeFs, fakePath, '/proj', map), true);
    assert.equal(writes.length, 1);
    assert.deepEqual(JSON.parse(writes[0][1]).eventPreviews, { '5': 1 });
});

test('Depth pushes a surface toward the camera in 3D and leaves the 2D feet row alone', () => {
    const manager = new MediaSurfacePreviewManager({}, {});
    manager.map = { id: 1, width: 4, height: 4, events: [] };
    manager.tilemapManager = { TILE_SIZE: 48 };
    const base = { target: 'map', x: 2, y: 3, z: 0, depth: 0, height: 96, scaleY: 1 };
    assert.deepEqual(manager._worldPosition(base, 0), { x: 2.5, y: 1, z: 3.5 });
    assert.deepEqual(manager._worldPosition({ ...base, depth: 2.5 }, 0), { x: 2.5, y: 1, z: 6 }, 'positive depth is toward the camera');
    assert.equal(manager._anchor2d({ ...base, depth: 2.5 }, 0).y, manager._anchor2d(base, 0).y, '2D placement ignores depth');
    const runtime = fs.readFileSync(path.join(editorRoot, '..', 'runtime', 'reactor_media_surfaces.js'), 'utf8');
    assert.match(runtime, /z \+= descriptor\.depth;/);
});

test('3D previews composite layer 5+ surfaces over the map like the game overlay pass', () => {
    const manager = read('src/MediaSurfacePreviewManager.js');
    assert.match(manager, /return mapScene\.aboveBillboardsGroup\?\.\(\) \|\| mapScene\.aboveGroup\?\.\(\) \|\| null;/);
    assert.doesNotMatch(manager, /mapScene\.aboveGroup\?\.\(\)\n/, 'no surface joins the star-tile group directly');
    const map3d = read('src/MapEditor3D.js');
    assert.match(map3d, /this\.mapScene\.setPass\('overlay'\);/, 'the editor renders the overlay slot');
    assert.match(map3d, /this\.mapScene\.setPass\('above'\);\n\s+if \(overlay\) overlay\.visible = false;/, 'and keeps it out of the star-tile pass');
});

test('Preview Event animates stepping pages and previews 3D-model pages in both views', () => {
    const events = read('src/EventManager.js');
    const map3d = read('src/MapEditor3D.js');
    const html = read('index.html');
    assert.match(events, /return \(9 - Math\.min\(6, Math\.max\(1, speed\)\)\) \* 3;/, '(9 - speed) * 3 frames, as Game_CharacterBase');
    assert.match(events, /anim\.pattern = \(anim\.pattern \+ 1\) % 4;\n\s+anim\.sprite\.texture = anim\.frames\[anim\.pattern < 3 \? anim\.pattern : 1\];/, '2D cycles 0,1,2,1');
    assert.match(events, /RREventPreviewModels\.thumbnail\(project, spec, this\.projectController\.mapEditor3D, pixels, direction\)/);
    assert.match(map3d, /static previewPageIndex\(mapData, event\)/);
    assert.match(map3d, /this\.eventSprite\(event, sheets, page\?\.image, previewIndex !== null && page\?\.stepAnime \? page : null\)/, '3D draws the previewed page');
    assert.match(map3d, /RREventPreviewModels\.instance\(template, spec, page\?\.image\?\.direction \|\| 2\)/);
    assert.match(map3d, /this\.animateEventPreviews\(now\);/);
    assert.match(html, /src="src\/utils\/EventPreviewModels\.js"/);
    const models = require(path.join(editorRoot, 'src', 'utils', 'EventPreviewModels.js'));
    assert.deepEqual(Object.keys(models).sort(), ['animate', 'clear', 'instance', 'revision', 'templateFor', 'texturesDecoded', 'thumbnail']);
});

test('model-bound characters on flat maps render as sprites, the view the editor previews', () => {
    const r3d = fs.readFileSync(path.join(editorRoot, '..', 'runtime', 'reactor_3d.js'), 'utf8');
    const sprites = fs.readFileSync(path.join(editorRoot, '..', 'runtime', 'reactor_sprites.js'), 'utf8');
    assert.match(r3d, /Reactor3D\.updateMapModelSprite = function\(sprite\)/);
    assert.match(r3d, /Reactor3D\.MODEL_SPRITE_PITCH = 55;/, 'the map pitch the 3D view defaults to');
    assert.match(r3d, /const framing = this\.frameModelSprite\(object, state\.size, camera\);/, 'framed about the ground origin from that pitch');
    assert.match(r3d, /sprite\.anchor\.y = state\.anchorY \+ \(th \/ 2\) \/ state\.size;/, 'ground origin on the tile centre');
    assert.match(r3d, /state\.object\.rotation\.y = state\.smoothYaw;/, 'turns like the scene, smoothed');
    assert.match(r3d, /this\.paintModelSpriteCanvas\(state\);/, 'painted through the canvas on the standalone renderer');
    assert.ok(r3d.indexOf('Reactor3D.paintModelSpriteCanvas = function') < r3d.indexOf('Reactor3D.updateEnemyModelSprite = function'), 'defined ahead of the per-frame battler painters');
    assert.doesNotMatch(r3d.slice(r3d.indexOf('Reactor3D.updateMapModelSprite = function'), r3d.indexOf('Reactor3D.playActorBattlerAnimation')), /acquireViewport|paintBattlerFrame/, 'a flat map never acquires the shared viewport for a sprite');
    assert.match(sprites, /if \(inScene && Reactor3D\.hasCharacterModel\(character\)\) this\.visible = false;/, 'only a 3D scene hides the sprite');
    assert.match(sprites, /if \(!inScene && this\._reactorMapModel && this\._reactorMapModel\.ready\)/, 'a sheetless model character is not an empty character');
    assert.match(sprites, /if \(Reactor3D\.updateMapModelSprite\) Reactor3D\.updateMapModelSprite\(this\);/);
    const editorModels = read('src/utils/EventPreviewModels.js');
    assert.match(editorModels, /Reactor3D\.frameModelSprite\(object, Math\.round\(pixels\), thumbCamera\)/, 'the editor thumbnail uses the same framing');
    assert.match(read('src/EventManager.js'), /sprite\.anchor\.set\(texture\.anchorX, texture\.anchorY\);\n\s+sprite\.x = \(event\.x \+ 0\.5\) \* tw;\n\s+sprite\.y = \(event\.y \+ 0\.5\) \* th;/, 'and places the origin on the tile centre');
    assert.match(read('src/EventManager.js'), /map3d\.ensureLibraries\(\)\.then\(ready => \{/, '2D previews load three.js on demand');
    assert.match(read('css/styles.css'), /\.sidebar-header \{\n\s+background-color: var\(--color-bg-panel\);\n(?:.*\n){2}\s+border-left: 3px solid var\(--color-accent\);/);
});

test('the map note is the 3D switch, the sidecar always loads on disk, and flat-map model sprites animate like the scene', () => {
    const r3d = fs.readFileSync(path.join(editorRoot, '..', 'runtime', 'reactor_3d.js'), 'utf8');
    const managers = fs.readFileSync(path.join(editorRoot, '..', 'runtime', 'reactor_managers.js'), 'utf8');
    const video = fs.readFileSync(path.join(editorRoot, '..', 'runtime', 'reactor_media_surfaces.js'), 'utf8');
    const Reactor3D = require(path.join(editorRoot, '..', 'runtime', 'reactor_3d.js'));
    assert.equal(Reactor3D.mapMode({ note: '', reactor3d: { mode: '3d' } }), '2d', 'no <3d> in the note: flat, whatever the sidecar says');
    assert.equal(Reactor3D.mapMode({ note: '<3d>', reactor3d: { mode: '2d' } }), '2d', 'the sidecar can still downgrade');
    assert.equal(Reactor3D.mapMode({ note: '<3d>' }), '3d');
    assert.equal(Reactor3D.mapMode({ meta: { '3d': true } }), '3d');
    assert.doesNotMatch(managers, /if \(!mapData \|\| !mapData\.meta \|\| !mapData\.meta\["3d"\]\) return;/, 'the sidecar is fetched for flat maps too');
    assert.doesNotMatch(managers.slice(managers.indexOf('DataManager.loadMapSidecar = function')),
        /else if \(!\(mapData\.meta/,
        'no note designation gates the sidecar fetch — every map asks');
    assert.match(r3d, /this\.applyEventModelPose\(state\.object, spec, this\.characterModelDir8\(character\)\);/, 'sprite-mode pose matches the scene');
    assert.match(r3d, /dashing: typeof Game_Follower !== "undefined" && character instanceof Game_Follower\n\s+\? \$gamePlayer\.isDashing\(\)\n\s+: !!\(character\.isDashing && character\.isDashing\(\)\),\n\s+distance,\n\s+scale: state\.scale,/, 'and so does the animation driver');
    assert.match(video, /if \(this\.video\.readyState >= 1 && this\.video\.videoWidth > 0\) loadSource\(\);/, 'PIXI never restarts a load the element already started');
    assert.match(read('src/event/commands/MediaSurfaceEditor.js'), /return noted && map\?\.reactor3d\?\.mode !== '2d';/);
});

test('frameModelSprite looks down at the map pitch and frames the bounding sphere about the ground origin', () => {
    const Reactor3D = require(path.join(editorRoot, '..', 'runtime', 'reactor_3d.js'));
    const calls = {};
    const camera = {
        position: { set: (x, y, z) => { calls.position = [x, y, z]; } },
        lookAt: (...args) => { calls.lookAt = args; },
        updateProjectionMatrix: () => { calls.projected = true; },
        updateMatrixWorld: () => {}
    };
    const corners = [[-2, 0, -1], [2, 3, 1]];
    global.THREE = {
        Box3: class { setFromObject() { this.min = { x: corners[0][0], y: corners[0][1], z: corners[0][2] }; this.max = { x: corners[1][0], y: corners[1][1], z: corners[1][2] }; return this; } },
        Vector3: class { constructor(x, y, z) { this.x = x; this.y = y; this.z = z; } length() { return Math.hypot(this.x, this.y, this.z); } }
    };
    try {
        const framing = Reactor3D.frameModelSprite({ updateMatrixWorld() {} }, 100, camera);
        const radius = Math.hypot(2, 3, 1);
        assert.ok(Math.abs(framing.radius - radius) < 1e-9, 'the farthest corner from the ground origin');
        assert.equal(framing.pixels, Math.round(radius * 2 * 100));
        assert.deepEqual([framing.anchorX, framing.anchorY], [0.5, 0.5], 'origin at the frame centre, whatever the yaw');
        const [, y, z] = calls.position;
        assert.ok(Math.abs(Math.atan2(y, z) - 55 * Math.PI / 180) < 1e-9, 'pitched 55 degrees down');
        assert.deepEqual(calls.lookAt, [0, 0, 0]);
        assert.equal(camera.left, -radius);
        assert.equal(camera.top, radius);
        assert.ok(calls.projected);
    } finally {
        delete global.THREE;
    }
});

test('culled character sprites keep updating, three gets a clean unpack state, and v5 Graphics calls stay silent', () => {
    const sprites = fs.readFileSync(path.join(editorRoot, '..', 'runtime', 'reactor_sprites.js'), 'utf8');
    const r3d = fs.readFileSync(path.join(editorRoot, '..', 'runtime', 'reactor_3d.js'), 'utf8');
    const compat = fs.readFileSync(path.join(editorRoot, '..', 'runtime', 'libs', 'pixi_compat.js'), 'utf8');
    assert.match(sprites, /for \(const sprite of this\._rrCullHolder\.children\) \{\n\s+if \(typeof sprite\.update === "function"\) sprite\.update\(\);/, 'detached sprites are still updated');
    assert.match(sprites, /if \(this\._rrCulled\) \{\n\s+this\.visible = false;\n(?:\s+\/\/.*\n)*\s+this\.updatePosition\(\);\n\s+return;/, 'and a culled sprite keeps its position current for plugins that read it');
    assert.match(r3d, /Reactor3D\.clearUnpackState = function\(gl\)/);
    assert.match(r3d, /Reactor3D\.clearUnpackState\(pixi\.gl\);\n\s+this\._renderer = new THREE\.WebGLRenderer\(\{\n\s+canvas: pixi\.canvas/, 'cleared before three initialises on PIXI\'s context');
    assert.match(read('src/MapEditor3D.js'), /Reactor3D\.clearUnpackState\?\.\(context\);/);
    const shim = compat.slice(compat.indexOf('const quiet = {'), compat.indexOf('Object.defineProperty(proto, name'));
    for (const name of ['beginFill', 'endFill', 'lineStyle', 'drawRect', 'drawCircle', 'drawEllipse', 'drawPolygon', 'drawRoundedRect', 'drawStar']) {
        assert.match(shim, new RegExp(name + '\\('), name + ' is shimmed');
    }
    assert.doesNotMatch(shim, /deprecation|console\.warn/, 'without a nag');
    assert.doesNotMatch(compat, /burn the one-shots/, 'the warm-up that muted console.warn is gone');
});

test('priority 3 draws above the tile layers yet y-sorts against characters in front of it', () => {
    const objects = fs.readFileSync(path.join(editorRoot, '..', 'runtime', 'reactor_objects.js'), 'utf8');
    const sprites = fs.readFileSync(path.join(editorRoot, '..', 'runtime', 'reactor_sprites.js'), 'utf8');
    assert.match(objects, /if \(this\._priorityType === 3\) return 5;\n\s+return this\._priorityType \* 2 \+ 1;/, 'the above layer, not MZ\'s z 7');
    assert.match(objects, /Game_CharacterBase\.prototype\.isSortedAbovePriority = function\(\) \{\n\s+return this\._priorityType === 3;/);
    assert.match(sprites, /this\.z = this\.reactorSortedZ\(\);/);
    assert.match(sprites, /if \(cy <= oy\) continue;\s+\/\/ behind it/, 'behind: own layer, so the event covers the character');
    assert.match(sprites, /if \(top >= bottom\) continue;\s+\/\/ clear below it\n\s+return 5;/, 'in front and overlapping: lifted to the event\'s layer');
    assert.match(sprites, /const drawnWidth = sprite => \(\(sprite\._frame && sprite\._frame\.width\) \|\| sprite\.width \|\| 48\)/, 'measured from the frame, which is stable mid-update');
    assert.match(sprites, /this\._reactorSortedAbove = sorted;/, 'the spriteset lists them once per frame');
    const page = read('src/event/EventPageEditor.js');
    assert.match(page, /<option value="3" \$\{page\.priorityType === 3 \? 'selected' : ''\}>\$\{this\._t\('event\.aboveCharactersSorted'\)\}<\/option>/);
    const i18n = read('src/I18nManager.js');
    assert.equal((i18n.match(/'event\.aboveCharactersSorted': '/g) || []).length, 18, 'every dictionary names it');
});

test('the 3D view puts pose rings around the surface being authored', () => {
    const manager = read('src/MediaSurfacePreviewManager.js');
    assert.match(manager, /if \(record\.authoring\) this\._buildSurfaceRings\(owner, group\);/);
    assert.match(manager, /yaw: makeRing\(0x3ddc84, mesh => \{ mesh\.rotation\.x = Math\.PI \/ 2; \}\),\n\s+pitch: makeRing\(0xff5c5c, mesh => \{ mesh\.rotation\.y = Math\.PI \/ 2; \}\),\n\s+roll: makeRing\(0x5ca8ff, \(\) => \{\}\)/, 'the model picker\'s rings and colours');
    assert.match(manager, /rings\.roll\.group\.rotation\.order = 'YXZ';/, 'gimbal nesting');
    assert.match(manager, /const field = axis === 'yaw' \? 'rotationY' : axis === 'pitch' \? 'rotationX' : 'rotationZ';/, 'rings write the rotation fields');
    assert.match(manager, /if \(best && best\.d <= 12\) nearest\[key\] = best;/, 'picked by screen distance to the drawn circle');
    assert.match(manager, /surface\.addEventListener\('pointermove', this\._onThreePointerMove, true\);/, 'hover emphasis');
    assert.match(manager, /this\._disposeSurfaceRings\(owner\);/);
    assert.match(read('src/event/commands/MediaSurfaceEditor.js'), /Ctrl \+ right-drag: look around\./);
});

test('clearing the 3D scene survives previewed model groups among the event markers', () => {
    const map3d = read('src/MapEditor3D.js');
    assert.match(map3d, /if \(child\.userData\?\.modelPreview\) \{/, 'model previews are groups, not meshes');
    assert.match(map3d, /child\.geometry\?\.dispose\?\.\(\);/, 'and nothing assumes a geometry or a single material');
});

test('the editor accepts image files and lists pictures beside movies', () => {
    assert.equal(MediaSurfaceEditor.safeMoviePath('posters/launch.png'), true);
    assert.equal(MediaSurfaceEditor.safeMoviePath('decals/rust.WEBP'), true);
    assert.equal(MediaSurfaceEditor.safeMoviePath('anim/loop.gif'), false);
    assert.equal(MediaSurfaceEditor.isImageFile('posters/launch.png'), true);
    assert.equal(MediaSurfaceEditor.isImageFile('clips/intro.webm'), false);

    const errors = MediaSurfaceEditor.validate('ShowVideoSurface', Object.assign(
        MediaSurfaceEditor.defaults(), { movie: 'posters/launch.png', target: 'map' }));
    assert.deepEqual(errors, [], 'an image file passes Show validation');
});

test('mediaFiles merges the movies folder with img/pictures', () => {
    const fs = require('node:fs');
    const os = require('node:os');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-media-'));
    fs.mkdirSync(path.join(dir, 'movies', 'clips'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'img', 'pictures', 'posters'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'movies', 'clips', 'intro.webm'), 'x');
    fs.writeFileSync(path.join(dir, 'img', 'pictures', 'posters', 'launch.png'), 'x');
    try {
        const editor = new MediaSurfaceEditor(null, { currentProject: { path: dir } });
        const names = editor.mediaFiles().map(file => file.relativePath).sort();
        assert.deepEqual(names, ['clips/intro.webm', 'posters/launch.png']);
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

test('the dialog hides playback-only controls for a still', () => {
    const fs = require('node:fs');
    const source = fs.readFileSync(path.join(editorRoot, 'src', 'event', 'commands', 'MediaSurfaceEditor.js'), 'utf8');
    assert.match(source, /_syncMediaFields\(\) \{/);
    assert.match(source, /\['volume', 'playbackRate', 'loop', 'muted', 'wait'\]/);
    // The workspace previews a still in an <img> while the video stays dark.
    assert.match(source, /vs-image-preview/);
    assert.match(source, /MediaSurfaceEditor\.isImageFile\(this\.data\.movie\)/);
    // The live map preview manager grew the same branch in all backends.
    const preview = fs.readFileSync(path.join(editorRoot, 'src', 'MediaSurfacePreviewManager.js'), 'utf8');
    assert.match(preview, /_isImage\(file\)/);
    assert.match(preview, /img', 'pictures'/);
    assert.match(preview, /tagName === 'IMG'/);
});

test('the media file is chosen through the shared picker, per kind', () => {
    const fs = require('node:fs');
    const source = fs.readFileSync(
        path.join(editorRoot, 'src', 'event', 'commands', 'MediaSurfaceEditor.js'), 'utf8');
    // A kind selector (Video / Image) and a Browse button replace the flat
    // mixed list; each kind opens the shared picker on its own folder.
    assert.match(source, /vs-media-kind/);
    assert.match(source, /_browseMedia\(kind, onPick\) \{/);
    assert.match(source, /kind === 'image' \? this\.imageFiles\(project\) : this\.movieFiles\(project\)/);
    // The picker must stack above the dialog's own overlay (21000).
    assert.match(source, /zIndex: 21050/);
    // Movies keep the playing-video preview; pictures preview as images.
    assert.match(source, /mediaType: kind === 'image' \? undefined : 'video'/);
});

test('media surface move arrows map world height to Z and bound horizontal travel to pixels',()=>{
 const manager=new MediaSurfacePreviewManager({},{}),before=global.RRAxisArrows3D,oldThree=global.THREE;let axis='y';
 global.THREE={};global.RRAxisArrows3D={pick:()=>({axis,travel:()=>2})};manager.mapEditor3D={camera:{}};manager._threeInputRect=()=>({width:800,height:600});manager.tilemapManager={TILE_SIZE:32};manager._updateThreeOwner=()=>{};const changed=[];manager._authoringChanged=fields=>changed.push(...fields);
 try{for(const target of ['map','event','player','thisEvent'])for(const worldAxis of ['x','y','z']){
  axis=worldAxis;const owner={arrows:{},state:{target,x:10,y:20,z:3,rotationX:15}},grab=manager._pickSurfaceArrow(owner,0,0);manager._dragSurfaceArrow(owner,grab,20,20);
  const expected={target,x:10,y:20,z:3,rotationX:15},key={x:'x',y:'z',z:'y'}[worldAxis];expected[key]+=key==='z'||target==='map'?2:64;
  assert.deepEqual(owner.state,expected);assert.equal(changed.at(-1),key);
 }}finally{global.RRAxisArrows3D=before;global.THREE=oldThree;}
});
test('live position sliders retain precision, recenter after a gesture, follow typed values and hide for screen targets',()=>{
 const e=new MediaSurfaceEditor({},{});e.data={target:'map',x:24,y:18,z:2};e._usesThree=()=>e.data.target!=='screen';e.positionSliders=Object.fromEntries(['x','y','z'].map(k=>[k,{style:{},min:'',max:''}]));
 e._syncPositionSliders(true);assert.equal(e.positionSliders.x.min,16);assert.equal(e.positionSliders.x.max,32);assert.equal(e.positionSliders.z.min,-6);
 e.data.z=2.7;e._syncPositionSliders();assert.equal(e.positionSliders.z.value,2.7);assert.equal(e.positionSliders.z.max,10);
 e._syncPositionSliders(true);assert.equal(e.positionSliders.z.max,10.7);e.data.z=50;e._syncPositionSliders();assert.equal(e.positionSliders.z.value,50);assert.equal(e.positionSliders.z.min,42);
 e.data.target='event';e._syncPositionSliders();assert.equal(e.positionSliders.x.max,408);assert.equal(e.positionSliders.z.max,58);
 e.data.target='screen';e._syncPositionSliders();assert.equal(e.positionSliders.x.style.display,'none');
});

test('map-owned surfaces preview without events and hide only their own saved copy while editing', () => {
    const map={id:8,reactor3d:{mediaSurfaces:[{id:4,movie:'panel.png',x:3,y:5,z:2,target:'map'}]}};
    const records=MediaSurfacePreviewManager.scanMap(map);
    assert.equal(records.length,1);assert.equal(records[0].state.movie,'panel.png');
    assert.deepEqual(records[0].source,{mapId:8,surfaceId:4});
    const manager=new MediaSurfacePreviewManager({},null);manager.map=map;manager.tilemapManager={};manager.records=records;manager.refreshBackend=()=>{};
    manager.beginAuthoring({operation:'ShowVideoSurface'},records[0].state,{mapSurface:true,editing:true,source:{surfaceId:4}});
    assert.equal(manager.authoring.replacedKey,'map:8:4');
    assert.equal(manager._visibleRecords().length,1);assert.equal(manager._visibleRecords()[0].key,'__authoring__');
    manager.endAuthoring();assert.equal(manager._visibleRecords()[0].key,'map:8:4');
});

test('Shift corner resizing preserves the original quad about its opposite corner', () => {
    const original = [{x:0,y:0},{x:200,y:0},{x:200,y:100},{x:0,y:100}];
    for (const index of [0,1,2,3]) {
        const anchor=original[(index+2)%4],point=original[index],corners=[];
        for (const factor of [.5,1.8]) {
            MediaSurfaceEditor.resizeCorner(corners,original,index,{
                x:anchor.x+(point.x-anchor.x)*factor,
                y:anchor.y+(point.y-anchor.y)*factor
            },true);
            assert.deepEqual(corners[(index+2)%4],anchor);
            const width=Math.abs(corners[1].x-corners[0].x),height=Math.abs(corners[3].y-corners[0].y);
            assert.equal(width/height,2);assert.ok(Math.abs(width-200*factor)<1e-8);
        }
    }
});

test('releasing Shift restores free corner placement without retaining scaled neighbours', () => {
    const original=[{x:0,y:0},{x:200,y:0},{x:200,y:100},{x:0,y:100}],corners=[];
    MediaSurfaceEditor.resizeCorner(corners,original,2,{x:300,y:110},true);
    assert.equal(corners[2].x/corners[2].y,2);
    MediaSurfaceEditor.resizeCorner(corners,original,2,{x:300,y:110},false);
    assert.deepEqual(corners,[original[0],original[1],{x:300,y:110},original[3]]);
    assert.deepEqual(original[2],{x:200,y:100});
});

test('Shift preserves warped shape and does not invert or divide by a collapsed diagonal', () => {
    const original=[{x:0,y:0},{x:150,y:20},{x:180,y:100},{x:10,y:90}],corners=[];
    MediaSurfaceEditor.resizeCorner(corners,original,2,{x:360,y:200},true);
    assert.deepEqual(corners,original.map(p=>({x:p.x*2,y:p.y*2})));
    MediaSurfaceEditor.resizeCorner(corners,original,2,{x:-180,y:-100},true);
    assert.ok(corners[2].x>0&&corners[2].y>0);
    const flat=Array.from({length:4},()=>({x:0,y:0}));
    MediaSurfaceEditor.resizeCorner(corners,flat,2,{x:10,y:20},true);assert.deepEqual(corners,flat);
});

test('legacy editor imports and globals resolve to the canonical media surface classes', () => {
    assert.equal(require('../src/event/commands/VideoSurfaceEditor.js'), MediaSurfaceEditor);
    assert.equal(require('../src/VideoSurfacePreviewManager.js'), MediaSurfacePreviewManager);
    assert.equal(globalThis.MediaSurfaceEditor, globalThis.VideoSurfaceEditor);
    assert.equal(globalThis.MediaSurfacePreviewManager, globalThis.VideoSurfacePreviewManager);
});

test('live map corner drag keeps the anchor and three unselected projected corners stationary', () => {
    const previousWindow = global.window, listeners = new Map();
    global.window = {addEventListener(type, fn){listeners.set(type, fn);},removeEventListener(type){listeners.delete(type);}};
    try {
        for (const target of ['map','event','screen']) {
            for (const tilted of [false,true]) {
                const manager = new MediaSurfacePreviewManager({}, {});
                const state = {...MediaSurfaceEditor.defaults(),target,eventId:1,x:5,y:7,
                    rotationX:tilted?22:0,rotationY:tilted?-16:0,rotationZ:tilted?13:0};
                manager.tilemapManager={TILE_WIDTH:48,TILE_HEIGHT:48};manager.map={events:[null,{id:1,x:2,y:3}]};
                manager._clientToOwner=(_owner,x,y)=>({x,y});
                manager._updatePixiOwner=()=>{};
                const changed=[];manager._authoringChanged=fields=>changed.push(...fields);
                const owner={state,record:{ownerEventId:1}};
                const pixels=()=>{const a=manager._anchor2d(state,1);return manager._transformedCorners(state).map(p=>({x:p.x+a.x,y:p.y+a.y}));};
                const before=pixels(),anchor=manager._anchor2d(state,1),size=[state.width,state.height];
                manager._startPixiDrag({clientX:before[0].x,clientY:before[0].y,preventDefault(){}},owner,{corners:[0]});
                listeners.get('pointermove')({clientX:before[0].x-30,clientY:before[0].y-40,shiftKey:false});
                const after=pixels();
                assert.deepEqual(manager._anchor2d(state,1),anchor);
                assert.deepEqual([state.width,state.height],size);
                assert.deepEqual(after.slice(1),before.slice(1));
                assert.ok(Math.abs(after[0].x-before[0].x+30)<.02);
                assert.ok(Math.abs(after[0].y-before[0].y+40)<.02);
                assert.deepEqual(changed,['corners']);listeners.get('pointerup')();manager.destroy();
            }
        }
    } finally {global.window=previousWindow;}
});

test('independent 3D corners round-trip without reinterpreting a legacy 2D warp', () => {
    const data={...MediaSurfaceEditor.defaults(),movie:'display.png',target:'map'};
    const legacy=MediaSurfaceEditor.build('ShowVideoSurface',data);
    assert.equal(legacy.parameters[3].worldCorners,undefined);
    data.worldCorners=[{x:-.7,y:-.8},{x:.5,y:-.5},{x:.5,y:.5},{x:-.5,y:.5}];
    const command=MediaSurfaceEditor.build('ShowVideoSurface',data);
    const parsed=MediaSurfaceEditor.parse(command);assert.deepEqual(parsed.worldCorners,data.worldCorners);
    const transform=MediaSurfaceEditor.build('TransformVideoSurface',data,0,{changedFields:['worldCorners']});
    assert.deepEqual(transform.parameters[3].worldCorners,data.worldCorners);assert.equal(transform.parameters[3].width,undefined);
});
