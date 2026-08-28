const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const editorRoot = path.resolve(__dirname, '..');

function loadOptionsManager(savedSettings = null, language = null) {
    const store = new Map();
    const events = [];
    const listeners = new Map();
    const languageCode = { textContent: '' };
    if (savedSettings) store.set('rr-settings', JSON.stringify(savedSettings));

    const sandbox = {
        window: {
            I18n: language ? { currentLanguage: () => language } : null,
            addEventListener(type, listener) { listeners.set(type, listener); },
            dispatchEvent(event) { events.push(event); }
        },
        document: {
            getElementById(id) { return id === 'language-button-code' ? languageCode : null; },
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
    return { OptionsManager, events, languageCode, listeners, sandbox, store };
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

test('a persisted 3D view is cleared before a new process can open a project', () => {
    const loaded = loadOptionsManager({
        theme: 'ocean-dark',
        language: 'ja',
        map3DView: true
    });
    const manager = new loaded.OptionsManager();

    assert.equal(manager.getMap3DView(), false);
    assert.deepEqual(JSON.parse(loaded.store.get('rr-settings')), {
        theme: 'ocean-dark',
        language: 'ja',
        animateAutotiles: true,
        map3DView: false,
        databaseListLabels: 'editorFirst'
    }, 'recovery preserves unrelated preferences while durably failing closed');

    manager.setMap3DView(true);
    assert.equal(manager.getMap3DView(), true, '3D remains active across maps in this session');
    assert.equal(JSON.parse(loaded.store.get('rr-settings')).map3DView, true);

    const nextLaunch = loadOptionsManager(JSON.parse(loaded.store.get('rr-settings')));
    assert.equal(new nextLaunch.OptionsManager().getMap3DView(), false,
        'the next process requires an explicit 3D opt-in');
});

test('database list label preference validates, persists, dispatches, and exposes all three modes', () => {
    const loaded = loadOptionsManager();
    const manager = new loaded.OptionsManager();

    assert.equal(manager.getDatabaseListLabels(), 'editorFirst');
    manager.setDatabaseListLabels('gameFirst');
    assert.equal(manager.getDatabaseListLabels(), 'gameFirst');
    assert.equal(JSON.parse(loaded.store.get('rr-settings')).databaseListLabels, 'gameFirst');
    assert.equal(loaded.events.at(-1).type, 'rr-database-list-labels-changed');
    assert.equal(loaded.events.at(-1).detail.value, 'gameFirst');

    manager.setDatabaseListLabels('unsupported');
    assert.equal(manager.getDatabaseListLabels(), 'editorFirst');
    assert.equal(loaded.events.at(-1).detail.value, 'editorFirst');

    const invalid = loadOptionsManager({ databaseListLabels: 'unsupported' });
    assert.equal(new invalid.OptionsManager().getDatabaseListLabels(), 'editorFirst');

    const source = fs.readFileSync(path.join(editorRoot, 'src', 'OptionsManager.js'), 'utf8');
    for (const value of ['editorFirst', 'gameFirst', 'gameOnly']) {
        assert.match(source, new RegExp(`data-value="${value}"`), `${value} toggle button is rendered`);
    }
    assert.match(source, /options\.databaseListLabelsNote/);
});

test('the menu bar language control stays at the far edge and follows the active locale', () => {
    const loaded = loadOptionsManager({ language: 'zh-Hant' }, 'zh-Hant');
    new loaded.OptionsManager();
    assert.equal(loaded.languageCode.textContent, 'ZH');

    loaded.sandbox.window.I18n.currentLanguage = () => 'ja';
    loaded.listeners.get('rr-language-changed')();
    assert.equal(loaded.languageCode.textContent, 'JA');

    const index = fs.readFileSync(path.join(editorRoot, 'index.html'), 'utf8');
    const css = fs.readFileSync(path.join(editorRoot, 'css', 'styles.css'), 'utf8');
    assert.match(index, /id="language-button"[\s\S]*id="language-button-code"/);
    assert.match(css, /#language-button\s*\{[\s\S]*?margin:\s*3px 8px 3px auto;/);
    assert.match(css, /@media \(max-width: 900px\)[\s\S]*?#language-button-code\s*\{\s*display:\s*none;/);
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
