const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const editorRoot = path.resolve(__dirname, '..');

function loadOptionsManager(savedSettings = null) {
    const store = new Map();
    const events = [];
    if (savedSettings) store.set('rr-settings', JSON.stringify(savedSettings));

    const sandbox = {
        window: {
            I18n: null,
            addEventListener() {},
            dispatchEvent(event) { events.push(event); }
        },
        document: {
            documentElement: {
                setAttribute() {},
                removeAttribute() {}
            }
        },
        localStorage: {
            getItem(key) { return store.get(key) || null; },
            setItem(key, value) { store.set(key, String(value)); }
        },
        CustomEvent: class CustomEvent {
            constructor(type, init) {
                this.type = type;
                this.detail = init && init.detail;
            }
        }
    };
    const source = fs.readFileSync(path.join(editorRoot, 'src', 'OptionsManager.js'), 'utf8');
    const OptionsManager = vm.runInNewContext(`${source}\nOptionsManager;`, sandbox);
    return { OptionsManager, events, store };
}

function loadTilemapManager(app) {
    const source = fs.readFileSync(path.join(editorRoot, 'src', 'TilemapManager.js'), 'utf8');
    return vm.runInNewContext(`${source}\nTilemapManager;`, {
        console,
        window: {},
        app
    });
}

test('autotile animation preference defaults on, persists, and uses the map-info strip', () => {
    const { OptionsManager, events, store } = loadOptionsManager();
    const manager = new OptionsManager();

    assert.equal(manager.getAnimateAutotiles(), true);
    manager.setAnimateAutotiles(false);

    assert.equal(JSON.parse(store.get('rr-settings')).animateAutotiles, false);
    assert.equal(events.length, 1);
    assert.equal(events[0].type, 'rr-autotile-animation-changed');
    assert.equal(events[0].detail.enabled, false);

    const reloaded = loadOptionsManager({ animateAutotiles: false });
    assert.equal(new reloaded.OptionsManager().getAnimateAutotiles(), false);

    const indexSource = fs.readFileSync(path.join(editorRoot, 'index.html'), 'utf8');
    const mapInfoStart = indexSource.indexOf('<div id="map-info-right">');
    const zoomStart = indexSource.indexOf('data-i18n="workspace.zoom"', mapInfoStart);
    const checkboxStart = indexSource.indexOf('id="map-autotile-animation"', mapInfoStart);
    assert.ok(mapInfoStart >= 0 && checkboxStart > mapInfoStart && checkboxStart < zoomStart,
        'compact A1 checkbox sits beside the map zoom and coordinates');
    assert.doesNotMatch(indexSource, /id="autotile-animation-btn"/,
        'A1 animation does not consume a full toolbar button');
});

test('disabling A1 animation removes the ticker and restores frame zero', () => {
    const added = [];
    const removed = [];
    const app = {
        ticker: {
            add(callback) { added.push(callback); },
            remove(callback) { removed.push(callback); }
        }
    };
    const TilemapManager = loadTilemapManager(app);
    const manager = new TilemapManager(app, '/project', {});
    let textureUpdates = 0;
    manager.currentMap = {};
    manager.currentTileset = {};
    manager.updateA1Tiles = () => { textureUpdates++; };

    manager.startA1Animation();
    assert.equal(added.length, 1);
    for (let frame = 0; frame < 30; frame++) added[0]();
    assert.equal(textureUpdates, 1);
    assert.equal(manager.waterAnimationFrame, 1);

    manager.setA1AnimationEnabled(false);
    assert.deepEqual(removed, [added[0]]);
    assert.equal(manager.animationTicker, null);
    assert.equal(manager.waterAnimationFrame, 0);
    assert.equal(manager.waterfallAnimationFrame, 0);
    assert.equal(textureUpdates, 2, 'visible A1 textures return to their first frame');

    manager.startA1Animation();
    assert.equal(added.length, 1, 'disabled renders do not register another ticker');

    manager.setA1AnimationEnabled(true);
    assert.equal(added.length, 2, 're-enabling resumes animation on the loaded map');
});
