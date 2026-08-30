const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const editorRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(editorRoot, '..');
const Reactor3D = require(path.join(repoRoot, 'runtime', 'reactor_3d.js'));
global.ReactorEventCommandCodec = require(path.join(editorRoot, 'src', 'event', 'commands', 'ReactorEventCommandCodec.js'));

test('height is a coordinate: stored per event, risen to smoothly, capped by the room', () => {
    const map = {};
    Reactor3D.setEventZ(map, 7, 3.5);
    assert.equal(Reactor3D.eventZAt(map, 7), 3.5);
    Reactor3D.setEventZ(map, 7, 0);
    assert.equal(Reactor3D.eventZAt(map, 7), 0);
    assert.equal(map.reactor3d.eventZ, undefined, 'a height of zero leaves no record');

    // A little Game_CharacterBase to install onto.
    function Base() { this._realX = 0; this._x = 0; this._realY = 0; this._y = 0; }
    Base.prototype.isMoving = function() { return this._realX !== this._x || this._realY !== this._y; };
    Base.prototype.updateMove = function() {};
    Base.prototype.distancePerFrame = function() { return 0.25; };
    Base.prototype.isCollidedWithEvents = function() { return false; };
    global.Game_CharacterBase = Base;
    try {
        Reactor3D.installVerticalMotion();
        const c = new Base();
        assert.equal(c.reactorZ(), 0);
        c.reactorRise(1);
        assert.equal(c.isMoving(), true, 'a rise is a move: Wait for Completion holds for it');
        c.updateMove(); c.updateMove();
        assert.equal(c.reactorZ(), 0.5, 'half way after two quarter-tile frames');
        c.updateMove(); c.updateMove();
        assert.equal(c.reactorZ(), 1);
        assert.equal(c.isMoving(), false);
        c.reactorRise(-5);
        while (c.isMoving()) c.updateMove();
        assert.equal(c.reactorZ(), 0, 'never below the floor');
        c.reactorSetHeight(9999);
        assert.equal(c._reactorZTarget, Reactor3D.VERTICAL_CEILING, 'never above the ceiling');
    } finally {
        delete global.Game_CharacterBase;
    }
});

test('collision is by vertical overlap', () => {
    const at = z => ({ _reactorLift: z });
    assert.equal(Reactor3D.charactersOverlapVertically(at(0), at(0)), true, 'both on the ground: as before');
    assert.equal(Reactor3D.charactersOverlapVertically(at(0), at(12)), false, 'a scaffold overhead blocks nobody');
    assert.equal(Reactor3D.charactersOverlapVertically(at(12), at(12)), true, 'on the scaffold, the scaffold is there');
    assert.equal(Reactor3D.charactersOverlapVertically(at(1), at(2)), true, 'a tile apart, a character is taller than that');
});

test('Rise, Descend and Set Height ride a Script route step RPG Maker ignores', () => {
    const Editor = require(path.join(editorRoot, 'src', 'event', 'commands', 'SetMovementRouteEditor.js'));
    const rise = Editor.routeCommand('rise', 1);
    assert.equal(rise.code, 45);
    assert.match(rise.parameters[0], /typeof this\.reactorRise === "function" && this\.reactorRise\(1\);|if \(typeof this\.reactorRise === "function"\) this\.reactorRise\(1\);/);
    assert.deepEqual(Editor.parseRouteCommand(rise), { op: 'rise', n: 1 });
    const height = Editor.routeCommand('height', 6.5);
    assert.deepEqual(Editor.parseRouteCommand(height), { op: 'height', n: 6.5 });
    assert.equal(Editor.parseRouteCommand({ code: 45, parameters: ['$gameSwitches.setValue(1, true)'] }), null, 'a plain script stays a script');
    // The guarded body is safe where reactorRise does not exist.
    const bare = {};
    new Function(Editor.routeBody({ op: 'rise', n: 1 })).call(bare);

    // Poses and turns ride the same rails.
    for (const [op, n] of [['faceceiling', 1], ['faceground', 1], ['standup', 1], ['rotate', 90]]) {
        const step = Editor.routeCommand(op, n);
        assert.deepEqual(Editor.parseRouteCommand(step), { op, n }, op);
        new Function(Editor.routeBody({ op, n })).call({});
    }
});

test('Face Ceiling, Face Ground and Rotate reach the drawn character', () => {
    function Base() {}
    Base.prototype.isMoving = function() { return false; };
    Base.prototype.updateMove = function() {};
    Base.prototype.distancePerFrame = function() { return 0.25; };
    Base.prototype.isCollidedWithEvents = function() { return false; };
    global.Game_CharacterBase = Base;
    try {
        Reactor3D.installVerticalMotion();
        const c = new Base();
        c.reactorFacePose(1);
        assert.equal(c._reactorPosePitch, 1, 'ceiling is on the back');
        c.reactorFacePose(-5);
        assert.equal(c._reactorPosePitch, -1, 'any negative is face down');
        c.reactorFacePose(0);
        assert.equal(c._reactorPosePitch, 0, 'and standing clears it');
        c.reactorRotate(180);
        assert.equal(c._reactorSpin, 180);
    } finally {
        delete global.Game_CharacterBase;
    }
    const three = fs.readFileSync(path.join(repoRoot, 'runtime', 'reactor_3d.js'), 'utf8');
    assert.match(three, /if \(posePitch\) object\.rotateX\(-posePitch \* Math\.PI \/ 2\);/, 'a model falls about its own axes, after facing');
    assert.match(three, /if \(poseSpin\) object\.rotateZ\(-poseSpin \* Math\.PI \/ 180\);/, 'and rolls the way a sprite turns');
    const sprites = fs.readFileSync(path.join(repoRoot, 'runtime', 'reactor_sprites.js'), 'utf8');
    assert.match(sprites, /this\.rotation = \(\(posePitch \? posePitch \* 90 : 0\) \+ poseSpin\) \* Math\.PI \/ 180;/, 'sprites turn in 2D and stood-up 3D alike');
});

test('the event list names a route step; the dialog spreads them over its columns', () => {
    const list = fs.readFileSync(path.join(editorRoot, 'src', 'event', 'EventCommandList.js'), 'utf8');
    assert.match(list, /SetMovementRouteEditor\.parseRouteCommand\(params\[0\]\)/, 'the list asks the step what it is');
    assert.match(list, /description = tt\('Rise'\);/, 'and says so instead of showing the marker script');
    const dialog = fs.readFileSync(path.join(editorRoot, 'src', 'event', 'commands', 'SetMovementRouteEditor.js'), 'utf8');
    const columns = {};
    for (const name of ['column1', 'column2', 'column3']) {
        const at = dialog.indexOf(name + ': [');
        columns[name] = dialog.slice(at, dialog.indexOf('],', at));
    }
    assert.match(columns.column1, /reactor: 'rise'/, 'vertical steps sit under the moves');
    assert.match(columns.column2, /reactor: 'faceceiling'/, 'poses sit under the turns');
    assert.match(columns.column3, /reactor: 'rotate'/, 'rotate sits with Script');
    assert.doesNotMatch(columns.column3, /reactor: 'rise'/, 'no column carries them all');
});

test('the editor carries height: position fields, 3D placement, arrows, overlays', () => {
    const eventEditor = fs.readFileSync(path.join(editorRoot, 'src', 'event', 'EventEditor.js'), 'utf8');
    assert.match(eventEditor, /id="event-position-x"[\s\S]*?id="event-position-y"[\s\S]*?id="event-position-z"/, 'X, Y and Z are entered, not read');
    assert.match(eventEditor, /Reactor3D\.setEventZ\(map, event\.id, this\.pendingZ\)/);
    const map3d = fs.readFileSync(path.join(editorRoot, 'src', 'MapEditor3D.js'), 'utf8');
    assert.match(map3d, /const eventZ = Reactor3D\.eventZAt \? Reactor3D\.eventZAt\(mapData, event\.id\) : 0;/, 'events stand at their height');
    assert.match(map3d, /RRAxisArrows3D\.pick\(THREE, this\.eventArrows, this\.camera/, 'arrows are grabbed first');
    assert.match(map3d, /dragEventAlongAxis\(state, clientX, clientY\)/);
    assert.match(map3d, /syncGridLevel\(\)/, 'the grid shows the level in use');
    const tilemap = fs.readFileSync(path.join(editorRoot, 'src', 'TilemapManager.js'), 'utf8');
    assert.match(tilemap, /if \(placed\.z > 0\.5\) continue;/, 'a raised model has no ground footprint');
    const sprites = fs.readFileSync(path.join(repoRoot, 'runtime', 'reactor_sprites.js'), 'utf8');
    assert.match(sprites, /Reactor3D\.isEventProp\(this\._character\.eventId\(\)\)/, 'a flat map ignores an event\'s height');
});
