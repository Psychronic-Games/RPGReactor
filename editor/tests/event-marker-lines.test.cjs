'use strict';
// Event borders in the 2D map view at any zoom (owner, 2026-11-17: "the borders only draw on some of the sides
// depending on the zoom levels"). A width-1 line in map space is a third of a screen pixel at 33% and a quarter at
// 25%, and which sides still drew depended on where they fell between pixels. Measured in the editor on the Demo's
// map 1 (`~/.cache/rr-tests/event-zoom.cjs`, `--old` for the lines as they were): at 33% four events drew one side
// each, at 20% and 25% most drew none; with pixelLine every side draws at 20% to 200%. The grid already did this.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'EventManager.js'), 'utf8');
const body = name => {
    const at = source.indexOf('\n    ' + name + '(');
    assert.ok(at >= 0, name);
    return source.slice(at, source.indexOf('\n    }\n', at));
};

test('every thin line of an event marker is one screen pixel at every zoom', () => {
    for (const name of ['_drawEventSquare', '_drawEventFootprint', 'createEventOutline']) {
        const strokes = body(name).match(/\.stroke\(\{[^}]*\}\)/g) || [];
        assert.ok(strokes.length, name + ' strokes');
        for (const stroke of strokes) {
            if (/width: 1\b/.test(stroke)) assert.match(stroke, /pixelLine: true/, name + ': ' + stroke);
        }
    }
    // The square's edge stands inside its tile, as the outline's and the footprint's do, so neighbours do not share a line.
    assert.match(body('_drawEventSquare'), /graphics\.rect\(0\.5, 0\.5, tileWidth - 1, tileHeight - 1\);\n\s*graphics\.stroke/);
});

// Event names fitted to their tile (owner, 2026-11-17: short names sat small in an empty strip, long ones were cut
// off however far the view was zoomed in). Seen in the editor on the Demo's map 7: "Raider" at 11 filling the strip,
// "Raider Marksman" whole at 5.4, readable from 200%.
function fitName() {
    const at = source.indexOf('    static fitName(');
    const end = source.indexOf('\n    }\n', at) + 6;
    const constants = {};
    for (const [, key, value] of source.matchAll(/static (NAME_[A-Z]+) = ([\d.]+);/g)) constants[key] = Number(value);
    const EventManager = new Function('constants', 'return class EventManager { static ' + source.slice(at + 11, end) + ' };')();
    Object.assign(EventManager, constants);
    return EventManager.fitName.bind(EventManager);
}
// A stand-in measure: 0.55 of the size a character, plus an outline of a quarter of the size.
const measure = (text, size) => Array.from(text).length * size * 0.55 + size * 0.25;

test('an event name is as large as its tile allows, shrinks to fit, and is shortened only past the smallest size', () => {
    const fit = fitName();
    const room = 48 - 4;
    const short = fit('Door', 48, measure);
    assert.equal(short.size, 11, 'a short name at the largest size');
    assert.equal(short.text, 'Door');
    for (const name of ['Raider Bruiser', 'Raider Marksman', 'Psychronic Mascot']) {
        const got = fit(name, 48, measure);
        assert.equal(got.text, name, name + ' whole');
        assert.ok(got.size < 11 && got.size >= 4.4, name + ' smaller: ' + got.size);
        assert.ok(measure(got.text, got.size) <= room, name + ' inside the tile');
    }
    const long = fit('A very long event name that will never fit at all', 48, measure);
    assert.match(long.text, /…$/);
    assert.equal(long.size, 4.4, 'at the smallest size');
    assert.ok(measure(long.text, long.size) <= room);
    assert.ok(long.text.length > 12, 'as much of it as fits: ' + long.text);
    // On a smaller tile the sizes follow it.
    assert.equal(fit('Door', 32, measure).size, 7);
    assert.deepEqual(fit('', 48, measure), { text: '', size: 11 });
});

test('the square and the names layer draw the same fitted label at the same place', () => {
    assert.equal((source.match(/this\.eventNameText\(event\.name\)/g) || []).length, 2);
    assert.match(source, /text\.y = this\.tilemapManager\.TILE_HEIGHT - EventManager\.NAME_BOTTOM;/);
    assert.match(source, /text\.y = \(event\.y \+ offsetY\) \* th \+ th - EventManager\.NAME_BOTTOM;/);
    assert.doesNotMatch(source, /text: event\.name,/, 'no name drawn at a fixed size any more');
});
