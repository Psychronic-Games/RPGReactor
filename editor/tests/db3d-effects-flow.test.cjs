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
    assert.match(editor, /\|\| !!this\._fxVideo \|\| !!this\._fxLight \|\| !!\(this\._fxPreview && this\._fxPreview\.active\)/);
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
    const surfaces = fs.readFileSync(path.join(repoRoot, 'runtime', 'reactor_media_surfaces.js'), 'utf8');
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

test('a light is an effect type: the form edits it, the list names it, the preview draws it', () => {
    // The Type select offers Light, and a light effect gets the lighting
    // panel's own rows (kind, colour through the themed picker, reach, aim).
    assert.match(editor, /<option value="light"\$\{isLight \? ' selected' : ''\}>\$\{escape\(this\._k\('r3dfx\.typeLight'\)\)\}<\/option>/);
    assert.match(editor, /isLight \? this\._lightRowsHtml\(light, work, row, control, escape\)/);
    const rows = editor.slice(editor.indexOf('_lightRowsHtml(light, work, row, control, escape) {'), editor.indexOf('_bindLightRows(form, work, light) {'));
    for (const key of ['lit.type', 'lit.color', 'lit.intensity', 'lit.radius', 'lit.angle', 'lit.width', 'lit.yaw', 'lit.pitch', 'lit.flicker', 'lit.occlude', 'lit.shadow', 'r3dfx.lightDuration', 'r3dfx.lightBody']) {
        assert.ok(rows.includes(`this._k('${key}')`), key + ' is a row');
    }
    assert.match(rows, /light\.type === 'spot' \? slider\('angle'/, 'the cone angle is a spot row');
    assert.match(rows, /light\.type === 'beam' \? slider\('width'/, 'the beam width is a beam row');
    assert.match(rows, /\(work\.trigger \|\| 'action'\) === 'action'\s*\? row\(this\._k\('r3dfx\.lightDuration'\)/, 'duration only for a fired light');
    const bind = editor.slice(editor.indexOf('_bindLightRows(form, work, light) {'), editor.indexOf('_playLightPreview(raw) {'));
    assert.match(bind, /RRColourPopover\.swatch\(light\.color,/, 'the colour is the themed picker');
    assert.doesNotMatch(bind, /type="color"/, 'never the system dialog');
    assert.match(bind, /light\[range\.dataset\.key\] = Number\(range\.value\);/, 'sliders write the light');
    assert.match(bind, /light\[box\.dataset\.key\] = box\.checked;/, 'switches write the light');
    // Defaults the runtime would fill are filled on the work object the same way.
    const ensure = editor.slice(editor.indexOf('_ensureLightWork(work) {'), editor.indexOf('_lightRowsHtml(light, work, row, control, escape) {'));
    assert.match(ensure, /number\('radius', kind === 'spot' \? 6 : kind === 'beam' \? 8 : 3\);/);
    assert.match(ensure, /light\.shadow = light\.shadow === true;/);
    // The list names a light by what it is.
    assert.match(editor, /raw\.type === 'light' \? \{ name: this\._lightSummary\(raw\.light\) \}/);
    assert.match(editor, /return `\$\{this\._k\('r3dfx\.typeLight'\)\} \\u00b7 \$\{kind\} \\u00b7 \$\{colour\}`;/);
    // Selecting a light previews it, like a movie; playing one does too; stopping clears it.
    assert.match(editor, /else if \(this\._effectWork && this\._effectWork\.type === 'light'\) \{[\s\S]*?this\._playLightPreview\(this\._effectWork\);/);
    assert.match(editor, /if \(raw && raw\.type === 'light'\) \{[\s\S]*?this\._playLightPreview\(raw\);\s*return;/);
    assert.match(editor, /this\._stopVideoPreview\(\);\s*this\._stopLightPreview\(\);\s*this\._fxPreviewDef = null;/);
    // The body stands at the anchor the runtime resolves, aimed as the runtime aims it.
    const update = editor.slice(editor.indexOf('_updateLightPreview() {'), editor.indexOf('_stopLightPreview() {'));
    assert.match(update, /Reactor3D\.effectLight\(this\._object, def, 'preview'\)/);
    assert.match(update, /const x = light\.x \+ 0\.5, y = light\.height, z = light\.y \+ 1;/);
    assert.match(update, /body\.quaternion\.setFromUnitVectors\(new THREE\.Vector3\(0, -1, 0\), aim\);/);
    assert.match(update, /body\.scale\.set\(light\.width \* 0\.5, light\.radius, light\.width \* 0\.5\);/, 'a beam is a tube, width across');
    assert.match(editor, /if \(this\._fxLight\) this\._updateLightPreview\(\);/, 'kept on the anchor every frame');
    assert.match(editor, /\|\| !!this\._fxVideo \|\| !!this\._fxLight \|\|/, 'a light counts as activity');
});

test('placed models light the map view through their light effects', () => {
    const map3d = fs.readFileSync(path.join(editorRoot, 'src', 'MapEditor3D.js'), 'utf8');
    assert.match(map3d, /if \(effect\.type === 'light' && effect\.light\) \{[\s\S]*?push\(\{ object, effect, light: true,/, 'an always-on light effect is a play');
    assert.match(map3d, /Reactor3D\._editorEffectLights = lights;/, 'rebuilt each frame');
    assert.match(map3d, /const light = Reactor3D\.effectLight \? Reactor3D\.effectLight\(play\.object, play\.effect, play\.key\) : null;\s*if \(light\) \{\s*const animated = Reactor3D\.animateLight\(/);
    const lighting = fs.readFileSync(path.join(editorRoot, 'src', 'LightingManager.js'), 'utf8');
    assert.match(lighting, /const modelLights = Array\.isArray\(Reactor3D\._editorEffectLights\) \? Reactor3D\._editorEffectLights : \[\];/);
    assert.match(lighting, /\}\)\)\.concat\(modelLights\)\);/, 'the feed carries them with the map lights');
    assert.match(lighting, /if \(!this\.lights\(\)\.length && !modelLights\.length && ambient\.ambient === undefined\) \{/, 'a map lit only by its models still feeds');
    assert.match(lighting, /Reactor3D\._editorEffectLights\.length\) return true;/, 'and keeps the view drawing');
    const i18n = fs.readFileSync(path.join(editorRoot, 'src', 'I18nManager.js'), 'utf8');
    for (const key of ['r3dfx.typeLight', 'r3dfx.lightDuration', 'r3dfx.lightBody']) {
        assert.equal((i18n.match(new RegExp('"' + key.replace('.', '\\.') + '": "', 'g')) || []).length, 18, key + ' in every locale');
    }
});

test('a light effect previews the way the game lights: presets shared, a soft core, the model lit, and state triggers kept', () => {
    const repoRoot = path.resolve(editorRoot, '..');
    const lights = require(path.join(repoRoot, 'editor', 'src', 'utils', 'MapLights.js'));
    // One preset table for the Lighting tray and the effect form.
    assert.ok(lights.PRESETS.length >= 10, 'the tray presets live in MapLights');
    assert.equal(lights.presetTemplate('laser').type, 'beam');
    assert.notEqual(lights.presetTemplate('candle'), lights.presetTemplate('candle'), 'a fresh copy each time');
    const manager = fs.readFileSync(path.join(editorRoot, 'src', 'LightingManager.js'), 'utf8');
    assert.match(manager, /RRMapLights\.PRESETS/, 'the panel reads the shared table');
    assert.match(editor, /class="r3d-fx-lpreset"/, 'the form offers the presets');
    assert.match(editor, /\.filter\(preset => !preset\.template\.compound\)/, 'a compound is a map preset only');
    // The core is the runtime's soft dot, never a solid ball.
    assert.match(editor, /const core = new THREE\.Sprite\(new THREE\.SpriteMaterial\(\{\s*map: [^\n]*roundLightTexture/);
    assert.doesNotMatch(editor, /new THREE\.Mesh\(new THREE\.SphereGeometry\(1, 12, 10\)/);
    // The model takes the light through the game's shader injection, and the shared uniforms are put back after.
    assert.match(editor, /Reactor3D\.litMaterial\(material\);\s*material\.needsUpdate = true;/);
    assert.match(editor, /Reactor3D\.packLightUniforms\(packed, \{ intensity: this\.LIGHT_PREVIEW_AMBIENT/);
    assert.match(editor, /colour: 0xffffff }, this\._previewLighting\);/);
    assert.doesNotMatch(editor, /Reactor3D\.lightUniforms\(\)/, 'database preview never mutates the map lighting singleton');
    const three = fs.readFileSync(path.join(repoRoot, 'runtime', 'reactor_3d.js'), 'utf8');
    assert.match(three, /Reactor3D\.packLightUniforms = function\(lights, ambient, uniforms = this\.lightUniforms\(\)\) \{/);
    // Always / Moving / Idle keep a light on in the preview, like a movie.
    assert.match(editor, /: isLight \? true : Number\(raw\.animation\) > 0\);/);
    assert.match(editor, /if \(isLight\) \{\s*if \(!wantedLight \|\| index === this\.selectedEffect\)/, 'a light previews beside another Always effect');
    assert.match(editor, /if \(wantedLight\) \{\s*if \(this\._fxTriggeredLight !== wantedLightIndex \|\| !this\._fxLight\)/, 'the light has its own slot beside the animation or movie');
});

test('a light effect wears the prop gizmo in the database preview, and every control follows every edit', () => {
    // Rings and arrows on the anchor, picked before the anchor marker, dragged through the preview's own pointer path.
    assert.match(editor, /this\._fxGizmo = \{ rings, arrows \};/);
    assert.match(editor, /rings\.roll\.group\.visible = false;/, 'nothing rolls');
    assert.match(editor, /RRPoseRings3D\.sync\(gizmo\.rings, at, light\.yaw, -light\.pitch, light\.type !== 'point'\);/, 'a point light has no aim ring');
    const down = editor.slice(editor.indexOf("// A light's rings and arrows come first"), editor.indexOf('// The effect anchor drags in the camera plane'));
    assert.match(down, /mode = 'fxgizmo';/);
    assert.match(editor, /else if \(mode === 'fxgizmo' && this\._fxGizmoHold\) \{\s*this\._dragLightGizmo/);
    assert.match(editor, /else if \(mode === 'fxgizmo'\) \{\s*this\._endLightGizmoDrag\(\);/);
    // An arrow writes the anchor offset in the anchor's own frame; a ring writes the light's own yaw or pitch.
    assert.match(editor, /const local = frame\.worldToLocal\(world\);\s*work\.anchor\.offset = \[local\.x, local\.y, local\.z\]/);
    assert.match(editor, /light\.pitch = Math\.max\(-90, Math\.min\(90, Math\.round\(hold\.startPitch - delta\)\)\);/);
    // The card's Rotate and third tab are the light's own numbers; the form, card and gizmo stay in step.
    assert.match(editor, /label: isLight \? this\._k\('lit\.section\.light'\) : this\._t\('Scale'\)/);
    assert.match(editor, /_lightCardSlidersHtml\(work, this\._fxTab\)/);
    assert.match(editor, /class="r3d-fxcard-lslider" data-key="\$\{row\.key\}"/);
    assert.match(editor, /_syncLightControls\(\) \{/);
    assert.match(editor, /this\._disposeLightGizmo\(\);\s*this\._lightPreviewLit\(false\);/, 'the gizmo goes with the preview');
});

test('a click on a rigged model binds the anchor to a bone, and a beam body survives an edge-on view', () => {
    // The mascot's skinned mesh carried a collapsed cached box, so every
    // ray missed it and Place fell back to the model origin: the light
    // stood still while the character walked through it.
    const at = editor.indexOf('_raycastPointer(clientX, clientY) {');
    const raycast = editor.slice(at, editor.indexOf('_partUnderPointer', at));
    assert.match(raycast, /if \(!node\.isSkinnedMesh[^\n]*\) return;\s*node\.computeBoundingBox\(\);\s*node\.computeBoundingSphere\(\);/);
    // The sphere/cone body fades to nothing at its silhouette; a beam seen along its length is all silhouette.
    const three = fs.readFileSync(path.join(path.resolve(editorRoot, '..'), 'runtime', 'reactor_3d.js'), 'utf8');
    assert.match(three, /Reactor3D\.beamBodyMaterial = function\(\) \{/);
    assert.match(three, /float soft = mix\(0\.45, 1\.0, pow\(facing, 0\.5\)\);/, 'a floor of brightness at any angle');
    assert.match(three, /new THREE\.Mesh\(Reactor3D\.beamBodyGeometry\(\), Reactor3D\.beamBodyMaterial\(\)\)/, 'the game pool uses it');
    assert.match(editor, /kind === 'beam' \? beamMaterial : material/, 'and so does the database preview');
});
