const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const workspaceRoot = path.resolve(__dirname, '..', '..');

// The stale-event guard drops save-restored events whose map data is gone,
// but must never touch the runtime events action/spawner plugins add at ids
// beyond the authored map (Hendrix item drops, template events): those carry
// their own data through an overridden event().
function loadGuard() {
    const source = fs.readFileSync(path.join(workspaceRoot, 'runtime', 'reactor_mv_compat.js'), 'utf8');
    const start = source.indexOf('    function installStaleEventGuard()');
    const end = source.indexOf('\n    function installBoxSizeCompatibility()', start);
    assert.ok(start >= 0 && end > start, 'installStaleEventGuard source exists');

    const dataMap = { events: [null, { id: 1, name: 'authored' }] };
    function makeEvent(id, eventFn) {
        return { _eventId: id, event: eventFn };
    }
    const events = [
        null,
        makeEvent(1, function() { return dataMap.events[this._eventId]; }),   // authored
        makeEvent(2, function() { return dataMap.events[this._eventId]; }),   // stale save artifact
        makeEvent(50, function() { return { id: 50, note: '<item drop>' }; }),// plugin-spawned
        makeEvent(51, function() { return dataMap.events[51].pages; }),       // stale, data access throws
    ];
    const context = {
        console: { warn: () => {} },
        $gameMap: { _events: events, mapId: () => 69, refreshTileEvents: () => {} },
        $dataMap: dataMap,
        Game_Map: { prototype: { refresh: function() {} } },
        Scene_Map: { prototype: { onMapLoaded: function() { this._transfer = this._transfer; } } },
    };
    context.global = context;
    vm.runInNewContext(source.slice(start, end) + '\ninstallStaleEventGuard();', context);
    return { context, events };
}

test('map refresh drops stale save events but keeps plugin-spawned dynamic events', () => {
    const { context, events } = loadGuard();
    context.Game_Map.prototype.refresh.call(context.$gameMap);
    assert.ok(events[1], 'the authored event survives');
    assert.equal(events[2], null, 'the stale save artifact is dropped');
    assert.ok(events[3], 'a dynamic event serving its own data survives');
    assert.equal(events[4], null, 'an event whose data access throws is dropped');
});
