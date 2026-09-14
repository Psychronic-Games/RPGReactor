const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '..', '..');
const demoRoot = path.join(repoRoot, 'template', 'Demo');
const mainPath = path.join(demoRoot, 'js', 'reactor_main.js');

/**
 * template/Demo is the one project directory the repository tracks, and
 * dist-editor-worker.js bundles it into the editor. Anything the Demo needs at
 * boot but that is only present on the author's disk ships as a missing file.
 */
function trackedUnder(relativeDirectory) {
    const output = execFileSync('git', ['ls-files', '-z', relativeDirectory], {
        cwd: repoRoot, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024
    });
    return new Set(output.split('\0').filter(Boolean));
}

function bootManifest() {
    const source = fs.readFileSync(mainPath, 'utf8');
    const block = source.match(/const scriptUrls = \[([\s\S]*?)\];/);
    assert.ok(block, 'reactor_main.js declares its script list');
    const urls = [...block[1].matchAll(/"([^"]+)"/g)].map(match => match[1]);
    assert.ok(urls.length >= 10, `the manifest is populated (${urls.length} entries)`);
    return urls;
}

test('every script the Demo boots is committed, not just present locally', () => {
    // A missing script never fires onScriptLoad, so loadCount never reaches
    // numScripts and onScriptsLoaded is never called: the Demo stops on the
    // loading spinner rather than degrading. A clean clone would ship that.
    const tracked = trackedUnder('template/Demo/js');
    const missing = [];
    for (const url of bootManifest()) {
        const relativePath = `template/Demo/${url}`;
        if (!fs.existsSync(path.join(repoRoot, url.replace(/^/, 'template/Demo/')))) {
            missing.push(`${url} (absent from the working tree)`);
        } else if (!tracked.has(relativePath)) {
            missing.push(`${url} (present locally but untracked — git add it)`);
        }
    }
    assert.deepEqual(missing, [],
        `the bundled Demo cannot boot from a clean checkout:\n${missing.join('\n')}`);
});

test('the boot failure is total, which is why the check has to be mechanical', () => {
    const source = fs.readFileSync(mainPath, 'utf8');
    assert.match(source, /onScriptLoad\(\)\s*\{\s*if \(\+\+this\.loadCount === this\.numScripts\)/,
        'the loader waits for every script');
    assert.match(source, /onScriptError\([\s\S]{0,120}printError\("Failed to load"/,
        'and an error only reports, it does not continue');
});

test('the effekseer wasm the loader names is committed too', () => {
    const source = fs.readFileSync(mainPath, 'utf8');
    const wasm = source.match(/const effekseerWasmUrl = "([^"]+)"/);
    assert.ok(wasm, 'the wasm url is declared');
    const tracked = trackedUnder('template/Demo/js');
    assert.ok(tracked.has(`template/Demo/${wasm[1]}`), `${wasm[1]} is tracked`);
});

test('the Demo runtime matches the canonical runtime it was copied from', () => {
    // runtime/ is the source of truth; the templates keep their own copies and
    // have drifted before. Compare the files that exist in both.
    const mismatched = [];
    for (const url of bootManifest()) {
        if (!url.startsWith('js/')) continue;
        const canonical = path.join(repoRoot, 'runtime', url.slice('js/'.length));
        const demo = path.join(demoRoot, url);
        if (!fs.existsSync(canonical) || !fs.existsSync(demo)) continue;
        // The plugin manifest is per-project by design.
        if (path.basename(url) === 'reactor_plugins.js') continue;
        if (!fs.readFileSync(canonical).equals(fs.readFileSync(demo))) mismatched.push(url);
    }
    assert.deepEqual(mismatched, [],
        `these have drifted from runtime/:\n${mismatched.join('\n')}`);
});

test('the Demo declares its engine mode without browser marker probes', () => {
    const index = fs.readFileSync(path.join(demoRoot, 'index.html'), 'utf8');
    assert.match(index, /window\.\$reactorMvCompat = false/,
        'the bundled MZ project must not probe for missing MV marker files on Web');
    assert.ok(index.indexOf('$reactorMvCompat') < index.indexOf('js/reactor_main.js'),
        'the runtime reads the mode while its compatibility layer loads');
});

test('the editor distribution bundles the Demo, which is what makes this ship', () => {
    const worker = fs.readFileSync(
        path.join(repoRoot, 'editor', 'build-scripts', 'dist-editor-worker.js'), 'utf8');
    assert.match(worker, /INCLUDE_REPOSITORY_DIRS = \[path\.join\('template', 'Demo'\)\]/);
});

test('every tracked Demo asset is present on disk', () => {
    // A tracked asset missing locally ships as a hole in the next build.
    // Intentional removals must be staged with git rm so the tracked set
    // and the disk agree; this catches the accidental kind.
    const missing = [];
    for (const relative of trackedUnder(path.join('template', 'Demo'))) {
        if (!fs.existsSync(path.join(repoRoot, relative))) missing.push(relative);
    }
    assert.deepEqual(missing, [], `tracked Demo files missing on disk: ${missing.slice(0, 5).join(', ')}`);
});

/**
 * Every audio name the Demo can play, with where it is named: animation sound
 * timings (MZ soundTimings and MV timings), System sounds, music and jingles,
 * event commands and move routes on maps, common events and troop pages,
 * sequence sound steps, and plugin parameters named like a sound.
 */
function demoAudioReferences() {
    const data = path.join(demoRoot, 'data');
    const read = name => JSON.parse(fs.readFileSync(path.join(data, name), 'utf8'));
    const refs = [];
    const note = (kind, name, where) => { if (typeof name === 'string' && name) refs.push({ kind, name, where }); };
    for (const animation of read('Animations.json')) {
        if (!animation) continue;
        for (const timing of animation.soundTimings || []) note('se', timing.se && timing.se.name, `animation ${animation.id} ${animation.name}`);
        for (const timing of animation.timings || []) note('se', timing.se && timing.se.name, `animation ${animation.id} ${animation.name} (MV timings)`);
    }
    const system = read('System.json');
    (system.sounds || []).forEach((sound, index) => note('se', sound && sound.name, `system sound ${index}`));
    for (const [key, kind] of [['titleBgm', 'bgm'], ['battleBgm', 'bgm'], ['boat', 'bgm'], ['ship', 'bgm'], ['airship', 'bgm'], ['victoryMe', 'me'], ['defeatMe', 'me'], ['gameoverMe', 'me']]) {
        const value = system[key];
        if (value && value.bgm) note('bgm', value.bgm.name, `system ${key}`);
        else if (value) note(kind, value.name, `system ${key}`);
    }
    const commandKinds = { 241: 'bgm', 245: 'bgs', 249: 'me', 250: 'se' };
    const walkList = (list, where) => {
        for (const command of list || []) {
            const p = command.parameters || [];
            if (commandKinds[command.code]) note(commandKinds[command.code], p[0] && p[0].name, `${where} command ${command.code}`);
            if (command.code === 205 && p[1] && p[1].list) for (const move of p[1].list) if (move.code === 44 && move.parameters && move.parameters[0]) note('se', move.parameters[0].name, `${where} route`);
            if (command.code === 132) note('bgm', p[0] && p[0].name, `${where} battle music`);
            if (command.code === 133) note('me', p[0] && p[0].name, `${where} victory jingle`);
            if (command.code === 139) note('me', p[0] && p[0].name, `${where} defeat jingle`);
            if (command.code === 140) note('bgm', p[1] && p[1].name, `${where} vehicle music`);
        }
    };
    for (const file of fs.readdirSync(data).filter(name => /^Map\d+\.json$/.test(name))) {
        const map = read(file);
        if (map.autoplayBgm && map.bgm) note('bgm', map.bgm.name, `${file} autoplay`);
        if (map.autoplayBgs && map.bgs) note('bgs', map.bgs.name, `${file} autoplay`);
        for (const event of map.events || []) {
            if (!event) continue;
            (event.pages || []).forEach((page, index) => {
                walkList(page.list, `${file} event ${event.id} page ${index}`);
                for (const move of (page.moveRoute && page.moveRoute.list) || []) if (move.code === 44 && move.parameters && move.parameters[0]) note('se', move.parameters[0].name, `${file} event ${event.id} autonomous route`);
            });
        }
    }
    for (const common of read('CommonEvents.json')) if (common) walkList(common.list, `common event ${common.id}`);
    for (const troop of read('Troops.json')) if (troop) (troop.pages || []).forEach((page, index) => walkList(page.list, `troop ${troop.id} page ${index}`));
    const sequences = fs.readFileSync(path.join(data, 'ActionSequences.json'), 'utf8');
    for (const match of sequences.matchAll(/"se":\s*(?:"([^"]+)"|\{[^}]*"name":\s*"([^"]+)")/g)) note('se', match[1] || match[2], 'action sequence');
    const pluginSource = fs.readFileSync(path.join(demoRoot, 'js', 'reactor_plugins.js'), 'utf8');
    const plugins = JSON.parse(pluginSource.slice(pluginSource.indexOf('['), pluginSource.lastIndexOf(']') + 1));
    const walkParams = (value, plugin, key) => {
        if (typeof value === 'string') {
            try { const parsed = JSON.parse(value); if (parsed && typeof parsed === 'object') return walkParams(parsed, plugin, key); } catch (error) { /* a plain string */ }
            if (/(^|[a-z_])(se|sound|sfx)$/i.test(key) && /^[A-Za-z0-9 _.-]{2,40}$/.test(value) && !/^\d+$/.test(value) && !/^(true|false|none|off|on)$/i.test(value)) note('se', value, `plugin ${plugin} ${key}`);
            return;
        }
        if (value && typeof value === 'object') for (const child of Object.keys(value)) walkParams(value[child], plugin, child);
    };
    for (const plugin of plugins) if (plugin.status) walkParams(plugin.parameters, plugin.name, '');
    return refs;
}

test('every sound, track and jingle the Demo names exists on disk with that exact spelling', () => {
    // A browser build cannot repair a name, and a missing file stops the game with a load error.
    const onDisk = {};
    for (const kind of ['se', 'bgm', 'bgs', 'me']) {
        const folder = path.join(demoRoot, 'audio', kind);
        onDisk[kind] = new Set(fs.existsSync(folder) ? fs.readdirSync(folder).map(file => file.replace(/\.[^.]+$/, '')) : []);
    }
    const refs = demoAudioReferences();
    assert.ok(refs.length > 400, `the audit sees the Demo's references (${refs.length})`);
    const missing = new Map();
    for (const ref of refs) if (!onDisk[ref.kind].has(ref.name)) missing.set(`${ref.kind}/${ref.name}`, (missing.get(`${ref.kind}/${ref.name}`) || []).concat(ref.where));
    assert.deepEqual([...missing].map(([name, where]) => `${name} (${[...new Set(where)].slice(0, 3).join('; ')})`), [], 'audio the Demo names but does not ship');
});
