// A group collapse of one enemy kind: every shard texture of every collapse
// subscribes to the one ImageManager-cached source, and tearing one collapse
// down must neither rebuild the others' listeners per shard nor leave the
// source without the listeners that were only set aside (PR #67).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const read = p => fs.readFileSync(path.resolve(__dirname, '..', '..', p), 'utf8');

function loadTeardown() {
    const source = read('runtime/reactor_sprites.js');
    const grab = name => {
        const start = source.indexOf(`Sprite_Enemy.prototype.${name} = function`);
        const end = source.indexOf('\n};\n', start) + 4;
        assert.ok(start > 0 && end > start, name + ' is in the sprites file');
        return source.slice(start, end);
    };
    const context = { Sprite_Enemy: function() {} };
    vm.runInNewContext(grab('unhookParticleCollapseTextures') + grab('destroyParticleCollapse'), context);
    return context.Sprite_Enemy.prototype;
}

// The shape EventEmitter3 keeps: `_events[key]` is one listener bare, or an
// array of them; an event whose array empties is deleted and `_eventsCount`
// falls, and emptying the last one swaps `_events` for a fresh object.
function makeSource() {
    const source = { _events: {}, _eventsCount: 0 };
    source.on = (key, fn, context) => {
        const entry = { fn, context, once: false };
        if (!source._events[key]) { source._events[key] = entry; source._eventsCount++; }
        else if (Array.isArray(source._events[key])) source._events[key].push(entry);
        else source._events[key] = [source._events[key], entry];
    };
    source.rebuilds = 0;
    source.off = (key, fn, context) => {
        const listeners = source._events[key];
        if (!listeners) return;
        if (!Array.isArray(listeners)) { if (listeners.context === context) clear(key); return; }
        source.rebuilds++;
        const kept = listeners.filter(l => l.context !== context);
        if (kept.length === 0) clear(key);
        else source._events[key] = kept.length === 1 ? kept[0] : kept;
    };
    const clear = key => { if (--source._eventsCount === 0) source._events = {}; else delete source._events[key]; };
    return source;
}

function makeCollapse(source, shards) {
    const list = [];
    for (let i = 0; i < shards; i++) {
        const texture = { source, destroyed: false };
        texture.destroy = () => { texture.destroyed = true; source.off('resize', null, texture); };
        source.on('resize', () => {}, texture);
        list.push({ particle: { texture } });
    }
    return list;
}

test('a group collapse takes only its own listeners, once, and hands the rest back', () => {
    const proto = loadTeardown();
    const source = makeSource();
    const sprite = {};
    source.on('resize', () => {}, sprite);
    const a = makeCollapse(source, 40), b = makeCollapse(source, 40);
    assert.equal(source._events.resize.length, 81);
    // Tear down a: the survivors (the sprite and every shard of b) come back, and no shard of a rebuilt them.
    const restore = proto.unhookParticleCollapseTextures.call({}, a);
    assert.equal(typeof restore, 'function');
    assert.ok(Array.isArray(source._events.resize) && source._events.resize.length === 0, 'an empty array in place of the event, for the first off() to clear');
    const before = source.rebuilds;
    for (const shard of a) shard.particle.texture.destroy();
    assert.equal(source.rebuilds - before, 1, 'the first off() clears the emptied event; every later one returns at its first line');
    assert.equal(source._events.resize, undefined, 'and while the shards go, the event is gone');
    restore();
    assert.equal(source._events.resize.length, 41, 'the sprite and the other collapse are back');
    assert.equal(source._eventsCount, 1, 'counted once');
    assert.ok(source._events.resize.every(l => l.context !== a[0].particle.texture && !a.some(s => s.particle.texture === l.context)), 'none of the torn-down shards');
    // Tear down b: one survivor is put back bare, the shape EventEmitter3 stores one listener in.
    const restoreB = proto.unhookParticleCollapseTextures.call({}, b);
    for (const shard of b) shard.particle.texture.destroy();
    restoreB();
    assert.equal(Array.isArray(source._events.resize), false, 'a lone survivor is stored bare');
    assert.equal(source._events.resize.context, sprite);
    assert.equal(source._eventsCount, 1);
});

test('nothing to hold aside: no restore, and the source is left as found', () => {
    const proto = loadTeardown();
    const source = makeSource();
    const only = makeCollapse(source, 3);
    const restore = proto.unhookParticleCollapseTextures.call({}, only);
    assert.equal(typeof restore, 'function');
    for (const shard of only) shard.particle.texture.destroy();
    restore();
    assert.deepEqual(source._events, {}, 'no survivors: the event stays gone');
    assert.equal(source._eventsCount, 0);
    assert.equal(proto.unhookParticleCollapseTextures.call({}, [{ particle: { texture: { source } } }]), null, 'one shard is nothing to batch');
    assert.equal(proto.unhookParticleCollapseTextures.call({}, [{ particle: { texture: { source: null } } }, {}]), null, 'no source, nothing to do');
    // destroyParticleCollapse restores in a finally even when a texture's destroy throws.
    const source2 = makeSource();
    const sprite2 = {}; source2.on('resize', () => {}, sprite2);
    const shards = makeCollapse(source2, 4);
    shards[1].particle.texture.destroy = () => { throw new Error('boom'); };
    const self = { _particleCollapse: { shards, layers: [] }, removeChild() {}, children: [] };
    const src = read('runtime/reactor_sprites.js');
    const head = src.slice(src.indexOf('Sprite_Enemy.prototype.destroyParticleCollapse = function'), src.indexOf('const restoreListeners'));
    assert.match(head, /state/, 'the teardown reads its state first');
    assert.match(src, /\} finally \{\n[\s\S]{0,300}restoreListeners\(\);/, 'the survivors go back however the loop ends');
});
