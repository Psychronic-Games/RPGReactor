/**
 * Handling events in the 3D view: seeing them, and moving them.
 *
 * Three things the 2D canvas has and the 3D one did not.
 *
 * An event drawn from a character sheet is a picture standing on the map, and
 * nothing about it says "this is an event" — it reads as a painted tree until
 * you happen to click it. The 2D canvas borders every event for that reason,
 * so the 3D one draws a box round it.
 *
 * Where a click will land needs no explaining on a flat canvas: the cursor is
 * already on the map. Through a perspective camera it does — the tile under
 * the pointer is the answer to a raycast, not something you can eyeball — so
 * the cell that raycast found is outlined.
 *
 * And an event could be selected in 3D but not moved, which meant going back
 * to the 2D view to put anything anywhere.
 *
 * The file is checked as source rather than driven: it needs three.js, a
 * canvas and a project, none of which exist under `node --test`.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const editorRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(editorRoot, '..');
const source = fs.readFileSync(path.join(editorRoot, 'src', 'MapEditor3D.js'), 'utf8');
const Reactor3D = require(path.join(repoRoot, 'runtime', 'reactor_3d.js'));

/** The body of a method, up to the next one at the same indent. */
function methodBody(name) {
    const declaration = new RegExp(`\n    (?:async )?${name}\\(`);
    const start = source.search(declaration);
    assert.notEqual(start, -1, `${name} exists`);
    const rest = source.slice(start + 1);
    const end = rest.indexOf('\n    }\n');
    assert.notEqual(end, -1, `${name} is a whole method`);
    return rest.slice(0, end);
}

test('every event gets a box round it', () => {
    const body = (methodBody('buildEvents') + methodBody('_buildOneEvent'));
    assert.match(body, /this\.eventBox\(/, 'a box is built per event');
    assert.match(body, /mesh\.userData\.box = box/, 'and the event knows its own');
    assert.match(body, /this\.eventGroup\.add\(box\)/, 'and it is in the scene');
});

test('the box is edges only', () => {
    // A filled box would have to be transparent, and transparent boxes are
    // what sliced the name labels — they sort by distance and a nearer one
    // paints over a farther label whatever the depth buffer says.
    const body = methodBody('eventBox');
    assert.match(body, /EdgesGeometry/);
    assert.match(body, /LineSegments/);
    assert.doesNotMatch(body, /MeshBasicMaterial|MeshStandardMaterial/,
        'no filled faces');
});

test('the box is inset from the cell', () => {
    // Two events side by side would otherwise fight over the edge between
    // them, and z-fighting lines flicker as the camera turns.
    const body = methodBody('eventBox');
    const side = body.match(/const side = ([\d.]+)/);
    assert.ok(side, 'the box has a stated width');
    assert.ok(Number(side[1]) < 1, 'which is under a full cell');
    assert.ok(Number(side[1]) > 0.8, 'but still reads as the cell');
});

test('the box stands on the ground whatever the sprite height', () => {
    // A character sprite is taller than it is wide and a bare cube is squat;
    // the box takes the larger so it never sits inside the thing it marks.
    const body = (methodBody('buildEvents') + methodBody('_buildOneEvent'));
    assert.match(body, /Math\.max\(height, 0\.94\)/);
    const place = methodBody('placeEvent');
    assert.match(place, /elevation \+ mesh\.userData\.boxHeight \/ 2/,
        'centred on its own height, so its base is at ground level');
});

test('selecting an event carries the box with it', () => {
    const body = methodBody('highlight');
    assert.match(body, /userData\.box/);
    assert.match(body, /box\.material\.color\.setHex/, 'it brightens');
    // But it does not grow: the box says which cell the event is on, and a
    // box scaled to 1.25 covers its neighbours.
    assert.doesNotMatch(body, /box\.scale/);
});

test('one place decides where an event sits', () => {
    // Sprite, box and label are three objects that have to move together;
    // a drag that moved only the sprite would leave the other two behind.
    const place = methodBody('placeEvent');
    assert.match(place, /mesh\.position\.set/);
    assert.match(place, /userData\.box\?\.position\.set/);
    assert.match(place, /userData\.label\?\.position\.set/);
    // Read from the event, so moving the event is enough to move the pieces.
    assert.match(place, /elevationAt\(mapData, event\.x, event\.y\)/,
        'and the new cell decides the height, not the old one');
    assert.match((methodBody('buildEvents') + methodBody('_buildOneEvent')), /this\.placeEvent\(mesh\)/,
        'the build uses it too, so there is only one arrangement');
});

test('a flat event still lies down after being moved', () => {
    // The shape came from the note and was applied once at build time; the
    // drag has to know about it or a flat event stands up when you move it.
    assert.match((methodBody('buildEvents') + methodBody('_buildOneEvent')), /mesh\.userData\.flat = true/);
    assert.match(methodBody('placeEvent'), /userData\.flat \? elevation \+ 0\.01/);
});

test('the hover outline is scaled to the brush', () => {
    // A three-by-three stamp puts down nine tiles, so outlining one is a lie
    // about where the click lands.
    const body = methodBody('updateHoverCell');
    assert.match(body, /this\.brushSize\(\)/);
    assert.match(body, /scale\.set\(width, 1, height\)/);
});

test('the brush size comes from whatever is in hand', () => {
    const body = methodBody('brushSize');
    assert.match(body, /mapStamp/, 'a lifted stamp knows its own size');
    assert.match(body, /selectedTiles/, 'and a palette selection is measured');
    assert.match(body, /return \{ width: 1, height: 1 \}/, 'with a single cell as the floor');
});

test('the outline follows the ground', () => {
    const body = methodBody('updateHoverCell');
    assert.match(body, /elevationAt\(mapData, tile\.x, tile\.y\)/,
        'so it does not sink into a raised cell');
});

test('the outline is not cut by what it lies on', () => {
    // It is a cursor. Nothing can hide it wrongly either: a cell with
    // something in front of it is not a cell the raycast can reach.
    const body = methodBody('buildHoverCell');
    assert.match(body, /depthTest: false/);
    assert.match(body, /renderOrder = 998/, 'under the labels at 1000');
    assert.match(body, /visible = false/, 'and hidden until the cursor finds a cell');
});

test('the outline leaves with the cursor', () => {
    assert.match(source, /_onPointerLeave = \(\) => this\.updateHoverCell\(null\)/);
    assert.match(source, /addEventListener\('pointerleave', this\._onPointerLeave\)/);
    assert.match(source, /removeEventListener\('pointerleave', this\._onPointerLeave\)/);
});

test('the outline is thrown away with the scene', () => {
    // It is added to the scene, so a rebuild without a dispose leaks one per
    // edit — and edits are what rebuild the scene.
    assert.match(methodBody('clearScene'), /'grid', 'hoverCell'/);
});

test('a hover costs one raycast, not three', () => {
    // Every pointer move over the canvas runs this, and a raycast against the
    // ground meshes is not free.
    assert.match(source, /const tile = this\.tileAt\(event\.clientX, event\.clientY\);\n\s*this\.updateHover\(event\.clientX, event\.clientY, tile\)/);
    assert.match(methodBody('updateHover'),
        /updateHover\(clientX, clientY, tile = this\.tileAt\(clientX, clientY\)\)/,
        'and it still works when called without one');
});

test('dragging an event needs the event tool and an empty hand', () => {
    // The same rule as the 2D canvas, which only drags in event mode. And a
    // left drag with tiles selected paints, which must keep working.
    const body = methodBody('canDragEvents');
    assert.match(body, /this\.canSelectEvents\(\)/);
    assert.match(body, /!this\.canPaint\(\)/);
});

test('a drag only starts on an event', () => {
    // Starting anywhere else has to keep orbiting, or the camera is lost.
    assert.match(source, /const mesh = this\.eventAt\(event\.clientX, event\.clientY\);\n\s*if \(mesh\) \{\n\s*this\.pointer\.drag = mesh;/);
    assert.match(source, /!this\.pointer\.paint && !this\.pointer\.propHold && this\.canDragEvents\(\)/,
        'and never while a stroke is being painted or a prop is being held');
});

test('undo is captured on the first cell crossed, not on the press', () => {
    // Every click on an event begins a drag, and saving up front would push a
    // snapshot of the whole event list each time one was merely selected —
    // and wipe the redo stack with it.
    assert.match(methodBody('beginEventDrag'), /_eventDragSaved = false/);
    const body = methodBody('dragEventTo');
    assert.match(body, /if \(!this\._eventDragSaved\) \{[\s\S]*?saveState\?\.\(\)/);
});

test('an event cannot be dragged off the map or onto another', () => {
    const body = methodBody('dragEventTo');
    assert.match(body, /tile\.x >= mapData\.width \|\| tile\.y >= mapData\.height/);
    assert.match(body, /occupant && occupant\.id !== event\.id/);
    assert.match(body, /tile\.x === event\.x && tile\.y === event\.y/,
        'and moving onto its own cell is not a move');
});

test('a drag writes the event position and moves all its pieces', () => {
    const body = methodBody('dragEventTo');
    assert.match(body, /event\.x = tile\.x;\n\s*event\.y = tile\.y;/);
    assert.match(body, /this\.placeEvent\(mesh\)/);
    assert.match(body, /selectTile\?\.\(tile\.x, tile\.y\)/, 'the selection follows it');
});

test('dropping tells the 2D view, and only when something moved', () => {
    // renderEvents redraws the 2D sprites and announces the change, which is
    // what brings the two views back into agreement. Announcing a drag that
    // went nowhere would rebuild the whole 3D scene for nothing.
    const body = methodBody('finishEventDrag');
    assert.match(body, /if \(moved\) this\.eventManager\(\)\?\.renderEvents\?\.\(\)/);
    assert.match(body, /_eventDragMoved = false/, 'and the flag is cleared for the next drag');
});

test('a press that goes nowhere still selects', () => {
    // Clicking an event to select it and starting to drag one are the same
    // gesture until the pointer moves.
    assert.match(source, /if \(drag\.drag\) \{\n\s*this\.finishEventDrag\(\);[\s\S]*?if \(travel <= 4\) this\.handleClick/);
});

test('the cursor says whether an event can be picked up', () => {
    assert.match(methodBody('updateHover'), /this\.canDragEvents\(\) \? 'grab' : 'pointer'/);
    assert.match(methodBody('beginEventDrag'), /cursor = 'grabbing'/);
    assert.match(methodBody('finishEventDrag'), /cursor = 'default'/);
});

test('an event standing on stood-up art is drawn on it', () => {
    /*
     * The reported case: a town painted as upright art with an animated
     * lights event standing in it. The game draws the two together, because
     * `standingPlaceFor` asks `facadeAt` where the cell's art ended up. The
     * editor asked nothing, so the sprite sat on the ground a tile in front of
     * the wall and turned to follow the camera while the wall stood still —
     * rotate ninety degrees and the town appeared to be drawn twice.
     */
    const place = methodBody('placeEvent');
    assert.match(place, /this\.mapScene\?\.facadeAt\?\.\(event\.x, event\.y\)/);
    assert.match(place, /facade\.height \+ facade\.lift/,
        'the height it sits at up the wall');
    assert.match(place, /facade \? facade\.z : event\.y \+ 0\.5/,
        'and the depth of the wall plane, not of its own row');
});

test('an event standing against a wall stands still', () => {
    // Half the fix. Putting it in the right place but leaving it turning
    // would still swing it out of the wall as the camera came round.
    const body = (methodBody('buildEvents') + methodBody('_buildOneEvent'));
    // `loose` joined the condition: an event whose note says it stands on the
    // ground never joins the object painted over its cell — see
    // event-stays-on-ground.test.cjs.
    assert.match(body, /const onFacade = sprite && !asked && !loose\s*\n\s*&& !!this\.mapScene\?\.facadeAt\?\.\(event\.x, event\.y\)/);
    assert.match(body, /if \(sprite && !onFacade\) this\.billboards\.push\(mesh\)/);
});

test('a note still wins over the wall behind it', () => {
    // Someone who has said how an event stands has said it about this cell.
    assert.match((methodBody('buildEvents') + methodBody('_buildOneEvent')), /mesh\.userData\.asked = !!asked/);
    assert.match(methodBody('placeEvent'),
        /\(mesh\.userData\.asked \|\| mesh\.userData\.loose\)\s*\n\s*\? null/);
});

test('a scene can be asked about its own facade', () => {
    // The running game keeps one map's facade on Reactor3D; the editor holds a
    // scene without running a game, and rebuilds it on every edit.
    assert.equal(typeof Reactor3D.facadeIn, 'function');
    const table = {
        width: 3, height: 2,
        onFacade: Uint8Array.from([0, 1, 0, 0, 0, 0]),
        z: Float32Array.from([0, 4.5, 0, 0, 0, 0]),
        y: Float32Array.from([0, 2, 0, 0, 0, 0]),
        lift: Float32Array.from([0, 1, 0, 0, 0, 0])
    };
    assert.deepEqual(Reactor3D.facadeIn(table, 1, 0), { z: 4.5, height: 2, lift: 1 });
    assert.equal(Reactor3D.facadeIn(table, 0, 0), null, 'a cell that stayed on the ground');
    assert.equal(Reactor3D.facadeIn(table, 9, 9), null, 'and one off the map');
    assert.equal(Reactor3D.facadeIn(null, 0, 0), null, 'and a map with no facade at all');
});

test('events can only be picked with the event tool up', () => {
    // Reported: clicking an event worked while a tileset was selected, so a
    // click that looked like it was going to paint selected an event instead.
    // The 2D canvas has always refused outside event mode.
    assert.match(methodBody('canSelectEvents'), /eventMode/);
    assert.match(methodBody('handleClick'), /if \(!this\.canSelectEvents\(\)\) return/);
    assert.match(methodBody('updateHover'),
        /this\.canSelectEvents\(\) && this\.eventAt\(clientX, clientY\)/,
        'and the cursor does not offer what a click will not do');
    // The right-click menu and double-click-to-open go the same way. Stated as
    // the rule rather than as one spelling of it: the context menu asks the
    // question up front now, because it has a second thing to refuse — the
    // menu on bare ground, which offers to create an event and so has no more
    // business appearing outside event mode than the one on an event does.
    const doubleClick = source.slice(source.indexOf('this._onDoubleClick = event =>'));
    assert.match(doubleClick.slice(0, doubleClick.indexOf('this._onWheel')),
        /this\.canSelectEvents\(\) && this\.eventAt\(event\.clientX, event\.clientY\)/,
        'double-click to open');

    const contextMenu = source.slice(source.indexOf('this._onContextMenu = event =>'));
    const body = contextMenu.slice(0, contextMenu.indexOf('this._onPointerLeave'));
    assert.match(body, /if \(!this\.canSelectEvents\(\)\) return;/, 'the right-click menu');
    const gate = body.indexOf('canSelectEvents');
    assert.ok(gate < body.indexOf('this.eventAt('), 'before it looks for an event');
    assert.ok(gate < body.indexOf('this.tileAt('), 'and before it looks for a cell');
});

//-----------------------------------------------------------------------------
// Flying the camera
//
// Orbiting holds a point and circles it, which is how you inspect a thing.
// Flying is how you inspect a place — you go there. On a two-hundred tile map
// that is the difference between building a world you can look at and one you
// can move through.

test('WASD moves and QE rises', () => {
    const keys = require(path.join(editorRoot, 'src', 'MapEditor3D.js')).FLY_KEYS();
    assert.deepEqual(
        { w: keys.w, a: keys.a, s: keys.s, d: keys.d, q: keys.q, e: keys.e },
        { w: 'forward', a: 'left', s: 'back', d: 'right', q: 'down', e: 'up' });
    assert.equal(keys.arrowup, 'forward', 'and the arrows do the same');
});

test('the keys stand down for typing, dialogs and shortcuts', () => {
    // Ctrl+S is a save and Ctrl+D is the browser's; neither should launch the
    // camera across the map. Nor should typing a name into a field.
    const body = methodBody('acceptsFlyKey');
    assert.match(body, /event\.ctrlKey \|\| event\.altKey \|\| event\.metaKey/);
    assert.match(body, /tagName === 'INPUT' \|\| target\.tagName === 'TEXTAREA'/);
    assert.match(body, /modal-overlay/);
    assert.match(body, /!this\.isEnabled\(\)/, 'and they do nothing outside the 3D view');
});

test('movement is timed, not counted', () => {
    // Or the same press covers different ground on a slow machine.
    const body = methodBody('stepFly');
    assert.match(body, /\(now - last\) \/ 1000/);
    assert.match(body, /Math\.min\(0\.1,/, 'and coming back from a stall does not teleport');
    assert.match(source, /const tick = now => \{/, 'the frame clock reaches it');
    assert.match(source, /this\.stepFly\(now\);/);
});

test('speed rises with how far back the camera is', () => {
    // A step that reads as a stroll at three tiles is a crawl at two hundred.
    const body = methodBody('stepFly');
    assert.match(body, /this\.view\.distance \* 0\.55/);
    assert.match(body, /this\.flyFast \? 3 : 1/, 'and Shift hurries');
});

test('diagonals are not faster than straight lines', () => {
    // Which is exactly what adding two unit vectors gives.
    assert.match(methodBody('stepFly'), /move\.normalize\(\)\.multiplyScalar\(speed\)/);
});

test('a window that loses focus stops flying', () => {
    // It never sees the key come up, and the camera would sail on by itself.
    assert.match(methodBody('installFlyKeys'), /_onFlyBlur = \(\) => \{ this\.flyKeys\.clear\(\)/);
    assert.match(source, /window\.addEventListener\('blur', this\._onFlyBlur\)/);
    assert.match(methodBody('removeFlyKeys'), /removeEventListener\('blur', this\._onFlyBlur\)/);
});

test('the fly keys come and go with the rest of the input', () => {
    assert.match(source, /this\.installFlyKeys\(\);/);
    assert.match(methodBody('detachInput'), /this\.removeFlyKeys\(\);/);
});

test('forward is flattened onto the ground plane', () => {
    /*
     * Height belongs to Q and E.
     *
     * Following the true look direction was tried and taken back out. The
     * camera cannot hold level inside the pitch range a map reads well from —
     * at the five degree floor, flying forward sinks about nine tiles in every
     * hundred — so W flew itself into the ground. Opening the range up so it
     * could climb then let it leave the map behind entirely, with nothing on
     * screen to steer by and no way to tell which way was back. Flat is the
     * version that is usable.
     */
    const body = methodBody('stepFly');
    assert.match(body, /this\.camera\.getWorldDirection/, 'taken from the camera, not the yaw');
    assert.match(body, /forward\.y = 0/);
    assert.match(body, /new THREE\.Vector3\(-forward\.z, 0, forward\.x\)/, 'right is square to it');
});

test('the pivot sits on what is being looked at', () => {
    /*
     * The camera always looks straight at `view.target`, so the pivot is
     * already at the centre of the screen — but only as a direction. How far
     * along it the pivot sits is `view.distance`, and nothing kept that
     * honest: framing sets it to about the map's width, flying then moves the
     * camera without touching it, and turning in place moves the target to
     * match. After a flight the pivot could be hundreds of tiles past
     * everything on screen, so orbiting swung the whole visible map about a
     * point out in the distance.
     */
    const body = methodBody('seatPivot');
    assert.match(body, /setFromCamera\(new THREE\.Vector2\(0, 0\), this\.camera\)/,
        'the centre of the screen, in normalised device coordinates');
    assert.match(body, /intersectObjects\(this\.mapScene\._meshes, false\)/);
    assert.match(body, /this\.view\.distance = Math\.min\(400, Math\.max\(3, distance\)\)/,
        'the distance is corrected to the surface actually being looked at');
    assert.match(body, /x: point\.x - 0\.5, y: point\.y, z: point\.z - 0\.5/,
        'aimCamera aims half a tile on from the focus, so the target is half a tile back');
});

test('seating the pivot does not move the camera', () => {
    // The hit lies on the camera's own view ray, so its direction and angles
    // are unchanged and only the distance along that ray is corrected. Which
    // is why yaw and pitch are not touched here.
    const body = methodBody('seatPivot');
    assert.doesNotMatch(body, /this\.view\.yaw/);
    assert.doesNotMatch(body, /this\.view\.pitch/);
});

test('an empty view still gives an answer', () => {
    // Looking at the sky, or off the edge of the map. The ground plane says
    // something, and is better than a stale number.
    assert.match(methodBody('seatPivot'), /ray\.intersectPlane\(ground/);
});

test('the pivot is seated once a gesture, not once a frame', () => {
    // What is being looked at cannot change until the camera moves, and the
    // raycast is not free on a two-hundred-tile map.
    assert.match(source, /input\.setPointerCapture\?\.\(event\.pointerId\);\n\s*\/\/[\s\S]*?this\.seatPivot\(\);/);
    assert.match(source, /if \(this\.flyKeys\.size === 1\) this\.seatPivot\(\);/,
        'and once at the start of a flight, so its speed is judged against what is in front');
});

test('flying moves; the mouse still turns', () => {
    /*
     * Steering with the mouse while the keys moved was tried and taken back
     * out: two hands changing the view at once, one of them without a button
     * held, is hard to read — you cannot tell what you asked for from what the
     * camera decided. So the keys move and a drag turns, as it always did, and
     * neither surprises the other.
     *
     * The pointer lock went with it. It existed only so that steering would
     * not run out of screen, and nothing steers with a bare pointer now.
     */
    assert.doesNotMatch(source, /requestPointerLock|pointerLockElement/);
    assert.doesNotMatch(source, /lookAround/);
    assert.doesNotMatch(source, /_lookDelta/);
    // A bare pointer move goes back to being a hover, flying or not.
    assert.match(source, /if \(!this\.pointer\) \{\s*\n\s*\/\/ One raycast answers both questions\./);
    assert.match(methodBody('orbit'), /this\.view\.yaw -= dx \* 0\.4/, 'and a drag still turns');
});

test('the keys still move the camera', () => {
    const body = methodBody('stepFly');
    assert.match(body, /keys\.has\('forward'\)\) move\.add\(forward\)/);
    assert.match(body, /keys\.has\('up'\)\) move\.y \+= speed/);
    assert.match(body, /this\.view\.target\.x \+= move\.x/);
});

test('right-clicking bare ground offers a new event, as it does in 2D', () => {
    /*
     * The menu used to stop at the cube: a right-click that hit no event
     * returned, so the only cell you could open a menu on in 3D was one that
     * already had an event on it — and "New Event…" lives on the menu for a
     * cell that does not. Existing events could be edited and none could be
     * created, which reads as the tool half working rather than as a case
     * nobody had written.
     */
    const handler = source.slice(source.indexOf('this._onContextMenu = event =>'));
    const body = handler.slice(0, handler.indexOf('this._onPointerLeave'));

    // Still guarded the same way: event mode, and not at the end of a pan.
    assert.match(body, /if \(!this\.canSelectEvents\(\)\) return;/);
    assert.match(body, /Math\.hypot\(event\.clientX - drag\.startX/);

    // An event under the cursor keeps the menu it always had...
    assert.match(body, /this\.onEventContextMenu\(picked, event\.clientX, event\.clientY\)/);
    // ...and bare ground now gets one too, from the same raycast that draws
    // the hover outline, so the menu opens on the cell being pointed at.
    assert.match(body, /const tile = this\.tileAt\(event\.clientX, event\.clientY\);/);
    assert.match(body, /this\.onMapContextMenu\(tile, event\.clientX, event\.clientY\)/);
    // The old unconditional bail is gone.
    assert.doesNotMatch(body, /if \(!cube\) return;/);

    // And the controller routes it through the same three calls the 2D map
    // makes, so the cell is selected, the panel follows, and the menu is built
    // from what is actually on that cell.
    const main = fs.readFileSync(path.join(editorRoot, 'src', 'main.js'), 'utf8');
    const wiring = main.slice(main.indexOf('this.mapEditor3D.onMapContextMenu'));
    assert.match(wiring, /this\.eventManager\.selectTile\(tile\.x, tile\.y\)/);
    assert.match(wiring, /getEventAt\(tile\.x, tile\.y\)/);
});
