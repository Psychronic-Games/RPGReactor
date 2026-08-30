const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const editorRoot = path.resolve(__dirname, '..');
const editor = fs.readFileSync(path.join(editorRoot, 'src', 'database', 'Database3DEditor.js'), 'utf8');

test('a selected video effect shows its movie, smoothly, and keeps its card', () => {
    // Selecting is previewing: no Play press needed for a video surface.
    assert.match(editor, /this\._playVideoPreview\(this\._effectWork\);/, 'selection starts the movie');
    // The movie counts as activity, or the preview throttles to the idle
    // rate the moment the mouse rests and plays as a slideshow.
    assert.match(editor, /\|\| !!this\._fxVideo \|\| !!\(this\._fxPreview && this\._fxPreview\.active\);/);
    // A click on the model must not swap the effect card for a part card —
    // with a whole-object part, every click was a dismissal.
    const at = editor.indexOf('_pickPart(event) {');
    const pick = editor.slice(at, editor.indexOf('_updateHover()', at));
    assert.match(pick, /if \(this\._cardMode === 'effect'\) return;/);
});

test('a video anchored to a part turns with the part', () => {
    const repoRoot = path.resolve(editorRoot, '..');
    const three = fs.readFileSync(path.join(repoRoot, 'runtime', 'reactor_3d.js'), 'utf8');
    assert.match(three, /child\.userData\.__restQuaternion = child\.quaternion\.clone\(\);/, 'the rest turn rides the node');
    assert.match(three, /Reactor3D\.effectAnchorQuaternion = function/, 'the pose delta is one shared helper');
    const surfaces = fs.readFileSync(path.join(repoRoot, 'runtime', 'reactor_video_surfaces.js'), 'utf8');
    assert.match(surfaces, /if \(poseTurn\) mesh\.quaternion\.premultiply\(poseTurn\);/, 'the game surface takes it');
    assert.match(editor, /const pose = Reactor3D\.effectAnchorQuaternion\(this\._object, def, new THREE\.Quaternion\(\)\);/, 'so does the database preview');
    const map3d = fs.readFileSync(path.join(editorRoot, 'src', 'MapEditor3D.js'), 'utf8');
    assert.match(map3d, /Reactor3D\.effectAnchorQuaternion\(play\.object, play\.effect/, 'and the map view');
});

test('placing an anchor binds it to the part under the click', () => {
    const at = editor.indexOf('_placeEffectAnchor(event) {');
    const place = editor.slice(at, editor.indexOf('_pointerNearMarker', at));
    assert.match(place, /partName = hit\.object\.userData\.parts\[0\]\.name;/, 'a carved part claims the anchor');
    assert.match(place, /this\._dominantBoneName\(hit\.object, hit\.face\)/, 'a bone claims it on a rigged model');
    assert.match(place, /part: frame === this\._object \? '' : partName/, 'no part under the click stays origin');
    // And swapping the part in the dropdown converts the offset instead of jumping.
    const sw = editor.indexOf('const syncWork = () => {');
    const sync = editor.slice(sw, editor.indexOf('.r3d-fx-type', sw));
    assert.match(sync, /const world = from\.localToWorld\(new THREE\.Vector3/, 'old frame out');
    assert.match(sync, /const local = to\.worldToLocal\(world\);/, 'new frame in');
});

test('renaming a part carries its rules AND its effect anchors', () => {
    const at = editor.indexOf("Rules aimed at the old name follow the rename");
    const rename = editor.slice(at, editor.indexOf('r3d-part-reselect', at));
    assert.match(rename, /raw\.anchor\.part === oldName\) raw\.anchor\.part = name;/, 'anchors follow');
    assert.match(rename, /this\._effectWork\.anchor\.part = name;/, 'the open card follows too');
    assert.match(rename, /renderEffectForm\(\);/, 'and the effect form redraws');
});

test('prop pose rings sit on the axes the drag will turn', () => {
    const map3d = fs.readFileSync(path.join(editorRoot, 'src', 'MapEditor3D.js'), 'utf8');
    assert.match(map3d, /RRPoseRings3D\.sync\(this\.propRings, centre,\n\s*object\.rotation\.y \* 180 \/ Math\.PI, object\.rotation\.x \* 180 \/ Math\.PI, true\);/,
        'ring orientation is the placed object\u2019s real rotation, facing included');
});

test('keyframes stay available on every trigger; carving and deleting parts carry effects', () => {
    assert.match(editor, /\+ \(work\.motion === 'pose' \? this\._keysHtml\(\) : ''\)/, 'the timeline is not an on-demand-only feature');
    assert.match(editor, /if \(\(work\.keys \|\| \[\]\)\.length && !triggerOverride\)/, 'only the live slider stand-in goes without keys');
    assert.match(editor, /this\._healAllAnchorBindings\(\);/, 'a fresh carve claims the effects sitting on it');
    const at = editor.indexOf('deletePart() {');
    const del = editor.slice(at, editor.indexOf('enterSelectMode() {', at));
    assert.match(del, /anchor\.part = '';/, 'a deleted part hands its effects back to the model');
    assert.match(del, /this\._object\.worldToLocal\(world\)/, 'without moving them');
});

test('the database calls the section 3D Models', () => {
    const ui = fs.readFileSync(path.join(editorRoot, 'src', 'DatabaseEditorUI.js'), 'utf8');
    assert.match(ui, /\{ name: '3D Models', type: 'reactor3d' \}/);
    assert.match(ui, /this\._dbTitle\('reactor3d', '3D Models'\)/);
    assert.doesNotMatch(ui, /name: '3D',/, 'no bare 3D left in the nav');
});
