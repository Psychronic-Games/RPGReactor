/**
 * Ctrl+Z, Ctrl+Y and the toolbar's Undo/Redo step the history of the tool
 * holding the map: Lighting and Media Surfaces kept their own stacks that no
 * key or toolbar button reached (the global handler took the key first and
 * undid a tile paint instead).
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const editorRoot = path.resolve(__dirname, '..');
const read = relative => fs.readFileSync(path.join(editorRoot, relative), 'utf8');
const MapLights = require(path.join(editorRoot, 'src', 'utils', 'MapLights.js'));
const LightingManager = require(path.join(editorRoot, 'src', 'LightingManager.js'));
const MediaSurfaceManager = require(path.join(editorRoot, 'src', 'MediaSurfaceManager.js'));

function withWindow(reactor, run) {
    const previous = { window: global.window, lights: global.RRMapLights };
    global.window = { reactor, addEventListener() {}, removeEventListener() {} };
    global.RRMapLights = MapLights;
    try { return run(); } finally { global.window = previous.window; global.RRMapLights = previous.lights; }
}

function buttonsSpy() {
    const calls = [];
    return { calls, updateUndoRedoButtons: (undo, redo) => calls.push([undo, redo]), last: () => calls[calls.length - 1] };
}

test('the toolbar history follows the tool holding the map', () => {
    const main = read('src/main.js');
    const body = main.match(/getBuildHistory: (\(\) => \([\s\S]*?: null\)),/);
    assert.ok(body, 'getBuildHistory is one expression');
    const media = { panel: null, historyOwner: () => 'media history' };
    const self = { pieceBuilderManager: { active: false }, terrainManager: { active: false }, lightingManager: { active: false }, mediaSurfaceManager: media };
    const pick = new Function('return ' + body[1]).call(self);
    assert.equal(pick(), null, 'painting: the map editor');
    self.lightingManager.active = true;
    assert.equal(pick(), self.lightingManager, 'Lighting up: its own history');
    self.lightingManager.active = false; media.panel = {};
    assert.equal(pick(), 'media history', 'Media Surfaces open: its history');
    self.terrainManager.active = true;
    assert.equal(pick(), self.terrainManager);
});

test('lighting undo and redo are reachable and keep the toolbar buttons honest', () => {
    const ui = buttonsSpy();
    withWindow({ uiManager: ui, mapEditor: { canUndo: () => true, canRedo: () => false } }, () => {
        const map = { id: 1, width: 10, height: 10 };
        const manager = new LightingManager({ tilemapManager: { currentMap: map } });
        manager.render = manager._syncPanel = manager._sync3D = manager._syncAmbientControls = () => {};
        manager.active = true;
        manager.place('point', 2, 3);
        assert.equal(MapLights.list(map).length, 1);
        assert.deepEqual(ui.last(), [true, false], 'a placed light enables Undo');
        manager._drag3d = { id: 'light1' };
        manager.undo();
        assert.equal(MapLights.list(map).length, 0);
        assert.ok(!manager._drag3d, 'an undo mid-drag ends the drag');
        assert.deepEqual(ui.last(), [false, true]);
        manager.redo();
        assert.equal(MapLights.list(map).length, 1);
        assert.deepEqual(ui.last(), [true, false]);
        manager.active = false;
        manager.syncHistoryButtons();
        assert.deepEqual(ui.last(), [true, false], 'put down, the buttons are the map editor\'s');
    });
});

test('media surface history steps from the shortcut and syncs the buttons while the panel is open', () => {
    const ui = buttonsSpy();
    withWindow({ uiManager: ui }, () => {
        const map = { id: 2, width: 3, height: 3 };
        const manager = new MediaSurfaceManager({ tilemapManager: { currentMap: map }, mediaSurfacePreviewManager: { rescan() {} } }, null);
        manager.boundMap = map; manager.panel = {}; manager.render = () => {};
        manager.change([{ id: 1, movie: 'a.png', target: 'map' }]);
        assert.deepEqual(ui.last(), [true, false]);
        const history = manager.historyOwner();
        history.undo();
        assert.equal(map.reactor3d.mediaSurfaces, undefined);
        assert.deepEqual(ui.last(), [false, true]);
        history.redo();
        assert.equal(map.reactor3d.mediaSurfaces[0].id, 1);
    });
});

test('tool buttons light in the toolbar, not on the Tools menu entries of the same action', () => {
    const html = read('index.html');
    for (const action of ['build-tool']) {
        assert.ok(html.indexOf(`html-menu-option" data-action="${action}"`) >= 0 && html.indexOf(`html-menu-option" data-action="${action}"`) < html.indexOf(`tool-button" data-action="${action}"`), `the menu entry for ${action} comes first, so a bare selector finds it`);
    }
    assert.doesNotMatch(read('src/main.js'), /\['\[data-action=/);
    assert.doesNotMatch(read('src/LightingManager.js'), /querySelector\('\[data-action="lighting-tool"\]'\)/);
    assert.doesNotMatch(read('src/MediaSurfaceManager.js'), /querySelector\('\[data-action="media-surfaces"\]'\)/);
});

test('a map switch keeps the Build bar up with the tool in hand', () => {
    const main = read('src/main.js');
    assert.match(main, /else if \(this\.lightingManager\?\.active\) this\.claimMapTool\('lighting'\);\s*\/\/[^\n]*\n\s*else if \(this\.buildHotbar\?\.visible && \['pieces', 'terrain', 'models'\]\.includes\(this\.mapTool\)\) this\.claimMapTool\(this\.mapTool\);\s*else if \(this\.buildHotbar\?\.visible\) this\.buildHotbar\.show\(\);/);
});

test('Escape in Lighting claims the key only when the tool let go of something', () => {
    withWindow({ uiManager: { isEditorModalOpenForGlobalShortcuts: () => false } }, () => {
        global.document = { activeElement: { tagName: 'BODY' } };
        try {
            const manager = new LightingManager({ tilemapManager: { currentMap: { id: 1, width: 5, height: 5 } } });
            manager.render = manager._syncPanel = manager._sync3D = manager._syncAddButtons = () => {};
            manager.active = true;
            const escape = () => { const event = { key: 'Escape', defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } }; manager._keyDown(event); return event.defaultPrevented; };
            manager.selectedId = 'light1';
            assert.equal(escape(), true, 'a selected light goes first');
            assert.equal(manager.selectedId, null);
            assert.equal(escape(), false, 'nothing held: the map\'s own selection is next');
            manager.armPlacement('point');
            assert.equal(escape(), true);
            assert.equal(manager.placing, null);
        } finally { delete global.document; }
    });
});
