const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const editorRoot = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(editorRoot, 'src', name), 'utf8');

test('a facing dot lands square on the model axis the click meant', () => {
    const picker = read(path.join('event', 'ModelGraphicPicker.js'));
    const place = picker.slice(picker.indexOf('_placeFaceAt(event) {'), picker.indexOf('_rebuildFaceMarkers() {'));
    assert.match(place, /Math\.round\(angle \/ step\) \* step/, 'the click snaps to the nearest 45-degree step');
    assert.match(place, /15 \* Math\.PI \/ 180/, 'only within tolerance — an oddly exported model keeps a deliberate off-axis mark');
    assert.match(place, /local\.x = Math\.sin\(snapped\) \* reach/, 'the stored mark is the snapped direction at the clicked reach');

    // The snap arithmetic itself: 4 degrees off the +Z front lands on +Z.
    const step = Math.PI / 4;
    for (const [deg, expected] of [[4, 0], [-11, 0], [49, 45], [176, 180], [-137, -135]]) {
        const angle = deg * Math.PI / 180;
        const snapped = Math.round(angle / step) * step;
        assert.equal(Math.round(snapped * 180 / Math.PI) || 0, expected, `${deg} degrees`);
    }
    // 20 degrees off is outside tolerance and must stay put.
    const off = 20 * Math.PI / 180 - Math.round(20 * Math.PI / 180 / step) * step;
    assert.ok(Math.abs(off) > 15 * Math.PI / 180);
});

test('the picker does its per-move work at frame rate, not pointer rate', () => {
    const picker = read(path.join('event', 'ModelGraphicPicker.js'));
    assert.match(picker, /const move = e => \{\s*queuedMove = e;/, 'the raw handler only queues');
    assert.match(picker, /this\._moveFrame = requestAnimationFrame\(/, 'one frame, one apply');
    assert.match(picker, /const applyMove = e => \{/, 'the old body still runs, once per frame');
});

test('editing an event refreshes the 3D view without a restart', () => {
    const map3d = read('MapEditor3D.js');
    const body = map3d.slice(map3d.indexOf('refreshEvents() {'), map3d.indexOf('disposeProps() {'));
    assert.match(body, /await this\.buildEvents\(mapData\);/, 'events are rebuilt from the current data');
    assert.match(body, /disposeEffectPlays\(play => play\.object\.userData\.propId === undefined\)/, 'the old previews’ effects stop');
    assert.doesNotMatch(body, /buildStartMarkers/, 'buildEvents draws the start markers itself; a second call would double them');
    assert.match(body, /this\._eventsRefresh = requestAnimationFrame/, 'commits coalesce; renderEvents fires in bursts');
    const events = read('EventManager.js');
    assert.match(events, /if \(map3d\?\.isEnabled\?\.\(\)\) map3d\.refreshEvents\?\.\(\);/, 'every event commit reaches the 3D view');
});

test('turning 3D off gives the 2D view its full size back', () => {
    const map3d = read('MapEditor3D.js');
    const at = map3d.indexOf('teardown() {');
    const body = map3d.slice(at, map3d.indexOf('this.mapScene = null', at) + 20 || at + 4000);
    assert.match(body, /tilemap\?\.applyViewportCrop\?\.\(\);/, 'the renderer is re-cropped from the live layout');
    assert.match(body, /tilemap\?\.renderMap\?\.\(\{ preserveScroll: true \}\);/, 'and redrawn, scroll kept');
    assert.match(body, /setTimeout\(\(\) => \{\n\s*const tilemap/, 'after the 3D surfaces have left the DOM');
});

test('clicking a previewed model selects its event and breaks nothing', () => {
    const map3d = read('MapEditor3D.js');
    assert.match(map3d, /if \(!child\.userData\.modelPreview \|\| !child\.userData\.event \|\| !child\.userData\.pickBox\) continue;/, 'preview models are picked by their box');
    assert.match(map3d, /if \(mesh\.userData\.modelPreview\) return;/, 'highlight leaves material-less roots alone');
    assert.match(map3d, /if \(!mesh\.material\) return;/, 'and cannot crash on anything else either');
});

test('editing one event rebuilds one event, and Delete means the prop', () => {
    const map3d = read('MapEditor3D.js');
    assert.match(map3d, /this\._onEventsChanged = \(\) => this\.refreshEvents\(\);/, 'event edits never rebuild the world');
    assert.match(map3d, /_buildOneEvent\(event, sheets, mapData, request\)/, 'one event builds alone');
    assert.match(map3d, /if \(!affected\.size && !added\.length\) \{ this\.refreshPassage\(\); return; \}/, 'an untouched view is left alone entirely');
    assert.match(map3d, /this\.animatedEvents = \(this\.animatedEvents \|\| \[\]\)\.filter\(entry => !affected\.has\(entry\.eventId\)\);/, 'sheet animations follow their event out');
    const ui = fs.readFileSync(path.join(editorRoot, 'src', 'UIManager.js'), 'utf8');
    assert.match(ui, /propsManager\?\.active && propsManager\.selectedId/, 'a selected prop owns the Delete key');
    assert.match(ui, /propsManager\.remove\(propsManager\.selectedId\);/, 'and goes through the undoable removal');
});

test('a selected map model drags along axis arrows, height included', () => {
    const map3d = read('MapEditor3D.js');
    assert.match(map3d, /this\.propArrows = RRAxisArrows3D\.create\(THREE, radius \* 1\.15, 'prop-arrows'\);/, 'arrows stand with the rings');
    const body = map3d.slice(map3d.indexOf('dragPropAlongAxis(state'), map3d.indexOf('dragPropTo(id'));
    assert.match(body, /\{ x: Math\.max\(0, round\(state\.startX \+ travel\)\) \}/, 'X slides freely — props are not tile-bound');
    assert.match(body, /RRMapElevation\.PROP_MAX_LIFT/, 'height stops at the sidecar ceiling');
    assert.match(map3d, /const ring = arrow \? null : this\.pickPropRing/, 'a grabbed arrow is never also a ring');
    const card = read('ModelPropsManager.js');
    assert.match(card, /\[\['offset', this\._tx\('Coordinates'\)\]/, 'the card calls the place a place, not an offset');
    const i18n = read('I18nManager.js');
    assert.match(i18n, /'Coordinates': '座標'/, 'and the word is translated');
});
