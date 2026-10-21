const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const workspaceRoot = path.resolve(__dirname, '..', '..');
const runtimeRoot = path.join(workspaceRoot, 'runtime');

function readRuntimeManifest(mainPath) {
    const source = fs.readFileSync(mainPath, 'utf8');
    const scriptsMatch = source.match(/const\s+scriptUrls\s*=\s*(\[[\s\S]*?\]);/);
    const wasmMatch = source.match(/const\s+effekseerWasmUrl\s*=\s*(["'][^"']+["'])\s*;/);

    assert.ok(scriptsMatch, 'reactor_main.js declares scriptUrls');
    assert.ok(wasmMatch, 'reactor_main.js declares effekseerWasmUrl');

    return {
        scripts: Array.from(vm.runInNewContext(scriptsMatch[1])),
        wasm: vm.runInNewContext(wasmMatch[1])
    };
}

test('every reactor_main runtime manifest entry is tracked in the runtime bundle', () => {
    const manifest = readRuntimeManifest(path.join(runtimeRoot, 'reactor_main.js'));
    const references = [...manifest.scripts, manifest.wasm];

    assert.equal(new Set(references).size, references.length, 'runtime manifest entries are unique');
    for (const reference of references) {
        assert.match(reference, /^js\//, `${reference} is rooted under the generated js directory`);
        const runtimePath = path.join(runtimeRoot, reference.slice('js/'.length));
        assert.equal(fs.existsSync(runtimePath), true, `${reference} resolves to ${runtimePath}`);
    }

    const required = [
        'js/reactor_picture_extensions.js',
        'js/reactor_screen_fx.js',
        'js/reactor_media_surfaces.js',
        'js/reactor_mv_compat.js',
        'js/libs/effekseer.wasm',
        'js/libs/pako.min.js',
        'js/libs/lz-string.js',
        'js/libs/localforage.min.js',
        'js/libs/vorbisdecoder.js'
    ];
    for (const reference of required) {
        assert.equal(references.includes(reference), true, `${reference} is in the runtime manifest`);
    }
});

test('picture and video extensions load after sprites and before compatibility/plugins', () => {
    const { scripts } = readRuntimeManifest(path.join(runtimeRoot, 'reactor_main.js'));
    const spritesIndex = scripts.indexOf('js/reactor_sprites.js');
    const pictureIndex = scripts.indexOf('js/reactor_picture_extensions.js');
    const videoIndex = scripts.indexOf('js/reactor_media_surfaces.js');
    const compatIndex = scripts.indexOf('js/reactor_mv_compat.js');
    const pluginsIndex = scripts.indexOf('js/reactor_plugins.js');

    assert.ok(spritesIndex < pictureIndex, 'picture classes load before their aliases');
    assert.ok(pictureIndex < videoIndex, 'video surfaces load after picture extensions');
    assert.ok(videoIndex < compatIndex, 'video surfaces load before compatibility');
    assert.ok(pictureIndex < compatIndex, 'picture extensions load before compatibility');
    assert.ok(pictureIndex < pluginsIndex, 'picture extensions load before plugins');
});

test('MV compatibility loads before the plugin configuration', () => {
    const { scripts } = readRuntimeManifest(path.join(runtimeRoot, 'reactor_main.js'));
    const compatIndex = scripts.indexOf('js/reactor_mv_compat.js');
    const pluginsIndex = scripts.indexOf('js/reactor_plugins.js');

    assert.notEqual(compatIndex, -1, 'reactor_mv_compat.js is loaded');
    assert.notEqual(pluginsIndex, -1, 'reactor_plugins.js is loaded');
    assert.ok(compatIndex < pluginsIndex, 'MV compatibility loads before plugin setup');
});

test('the vehicle files boot where each must: the 3D pair with the 3D runtime, the five game files after every file they wrap', () => {
    const { scripts } = readRuntimeManifest(path.join(runtimeRoot, 'reactor_main.js'));
    const at = name => scripts.indexOf('js/' + name);

    // The two 3D extensions follow the last 3D file before them, in the order the core names them: the
    // vehicle file wraps the model readers, and the rider's pass runs outside the vehicle's.
    assert.equal(at('reactor_3d_vehicles.js'), at('reactor_3d_surround.js') + 1, 'reactor_3d_vehicles.js boots straight after reactor_3d_surround.js');
    assert.equal(at('reactor_3d_rider.js'), at('reactor_3d_vehicles.js') + 1, 'reactor_3d_rider.js boots straight after reactor_3d_vehicles.js');

    // The four game files boot back to back, in this order, and no file reads a later one at load time.
    const first = at('reactor_vehicles.js');
    assert.ok(first >= 0, 'reactor_vehicles.js is in the manifest');
    assert.deepEqual(scripts.slice(first, first + 5),
        ['js/reactor_vehicles.js', 'js/reactor_vehicles_drive.js', 'js/reactor_vehicles_feel.js', 'js/reactor_vehicles_hints.js', 'js/reactor_vehicles_mount.js']);
    // After everything they wrap: the map's objects and the followers, the physics, every battle file
    // (a battle's start is wrapped outermost, and the ride's camera is laid over the battle drivers').
    const battle = scripts.filter(url => /^js\/reactor_fight(_[a-z]+)?\.js$/.test(url));
    assert.ok(battle.length >= 8, 'the battle files are in the manifest');
    for (const wrapped of battle.map(url => url.slice(3)).concat(['reactor_objects_map.js', 'reactor_objects_interpreter.js', 'reactor_objects_followers.js',
        'reactor_scenes.js', 'reactor_sprites.js', 'reactor_physics.js', 'reactor_controls.js', 'reactor_battle_presentation.js'])) {
        assert.ok(at(wrapped) >= 0 && at(wrapped) < first, `${wrapped} boots before the vehicle files`);
    }
    // They are the last engine files: nothing stands between them and the plugin list. The speaker's
    // face boots before them; its boot hook stays the outermost of the engine's because no vehicle
    // file wraps the boot scene's start, the Show Text command, the interpreter's setup or the face
    // loaders (speaker-face.test.cjs reads every engine file listed after it for exactly those).
    assert.deepEqual(scripts.slice(first + 5, at('reactor_plugins.js')), [], 'the five vehicle files are the last entries before reactor_plugins.js');
    assert.equal(at('reactor_plugins.js'), scripts.length - 1, 'and the plugin list is the last script');
    assert.ok(at('reactor_speaker_face.js') >= 0 && at('reactor_speaker_face.js') < first, 'reactor_speaker_face.js boots before the vehicle files');
    for (const name of ['reactor_vehicles.js', 'reactor_vehicles_drive.js', 'reactor_vehicles_feel.js', 'reactor_vehicles_hints.js', 'reactor_vehicles_mount.js']) {
        const code = fs.readFileSync(path.join(runtimeRoot, name), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
        assert.doesNotMatch(code, /Scene_Boot\.prototype\.start\s*=|command101|Game_Interpreter\.prototype\.setup\s*=|ImageManager\.(loadFace|loadBitmap)\s*=/,
            `${name} leaves alone what the speaker's face hooks`);
    }
});

test('the six vehicle files load cleanly where the tests load them: the 3D pair by the core\'s own list, the four game files in boot order', () => {
    // The 3D runtime in Node: one require of the core brings every extension it names, the two vehicle files among them.
    const Reactor3D = require(path.join(runtimeRoot, 'reactor_3d.js'));
    assert.deepEqual(Reactor3D.EXTENSIONS.slice(-2).map(extension => [extension.file, extension.namespace]),
        [['reactor_3d_vehicles.js', 'Vehicles'], ['reactor_3d_rider.js', 'Rider']]);
    assert.ok(Reactor3D.Vehicles && Reactor3D.Rider, 'each has set its namespace');
    assert.equal(Reactor3D.extensionsLoaded(), true);

    // The battle tests' world loads the four game files after every battle file, in the manifest's order.
    const { fightWorld, VEHICLE_FILES } = require('./helpers/fight-world.cjs');
    const { scripts } = readRuntimeManifest(path.join(runtimeRoot, 'reactor_main.js'));
    assert.deepEqual(scripts.filter(url => /^js\/reactor_vehicles(_[a-z]+)?\.js$/.test(url)), VEHICLE_FILES.map(name => 'js/' + name));
    const plain = fightWorld({ tactical: true, action: true, classic: true });
    assert.equal(typeof plain.ReactorVehicles, 'undefined', 'not loaded unless a test asks');
    const world = fightWorld({ tactical: true, action: true, classic: true, vehicles: true });
    assert.equal(typeof world.ReactorVehicles, 'object');
    for (const part of ['Drive', 'Feel', 'Hints']) assert.equal(typeof world.ReactorVehicles[part], 'object', `ReactorVehicles.${part}`);
    // A project with no vehicle plays on: the map runs with all four loaded.
    assert.doesNotThrow(() => world.run(30));
    assert.equal(world.$gamePlayer.isInVehicle(), false);
});

test('MV LZString decoder loads before the compatibility layer', () => {
    const { scripts } = readRuntimeManifest(path.join(runtimeRoot, 'reactor_main.js'));
    const decoderIndex = scripts.indexOf('js/libs/lz-string.js');
    const compatIndex = scripts.indexOf('js/reactor_mv_compat.js');

    assert.notEqual(decoderIndex, -1, 'lz-string.js is loaded');
    assert.ok(decoderIndex < compatIndex, 'legacy save decoder loads before MV compatibility');
});

test('bundled LZString decodes a fixed stock-MV save payload', () => {
    const source = fs.readFileSync(path.join(runtimeRoot, 'libs', 'lz-string.js'), 'utf8');
    const context = {};
    vm.runInNewContext(source, context);
    const fixture = 'N4IgzgnmAuCmC2IBcoACBjZBGAvgGhAAcBDAJ2gmTUyQCYccgAA=';
    const json = context.LZString.decompressFromBase64(fixture);

    assert.equal(json, '{"system":{"@c":1},"party":{"@c":2}}');
    assert.equal(context.LZString.decompressFromBase64(context.LZString.compressToBase64(json)), json);
    assert.equal(context.LZString.decompressFromUTF16(context.LZString.compressToUTF16(json)), json);
    assert.equal(context.LZString.decompressFromEncodedURIComponent(context.LZString.compressToEncodedURIComponent(json)), json);

    const unicodeJson = '{"name":"颤前鿣䵅䚄㫢梴钅瓊遗肌頭掤鄅摰"}';
    const stockMvBase64 = 'N4IgdghgtgpiBcJAlGYWSVDH+YUVlAhYoI65AtFoKEpgUy6DqCYDEBgtBmAlxoKCJgDiYgC+QAA=';
    assert.equal(context.LZString.compressToBase64(unicodeJson), stockMvBase64);
    assert.equal(context.LZString.decompressFromBase64(stockMvBase64), unicodeJson);
});

test('the build preflights require every script the runtime actually boots', () => {
    // `scriptUrls` is what Main waits for, so a project missing any of them
    // fails to boot. A preflight that does not check for a file cannot warn
    // about it: `reactor_3d.js` was added to the manifest and to every project,
    // but not to these lists, so a project that lost it would have passed
    // validation and then died at load.
    const manifest = readRuntimeManifest(path.join(runtimeRoot, 'reactor_main.js'));
    const booted = manifest.scripts
        .filter(url => !url.startsWith('js/libs/'))
        .map(url => url.slice('js/'.length));

    const editorRoot = path.join(workspaceRoot, 'editor');
    for (const file of ['build.js', 'build-worker.js', 'dist-editor-worker.js']) {
        const source = fs.readFileSync(path.join(editorRoot, 'build-scripts', file), 'utf8');
        for (const script of booted) {
            assert.ok(source.includes(`'${script}'`),
                `${file} preflights ${script}`);
        }
    }
});

test('three.js is deliberately absent from the boot manifest', () => {
    // It is ~2 MB and only a 3D map needs it, so `Reactor3D.ensureLoaded`
    // fetches it on demand. Adding it here would charge every project for a
    // feature most never use.
    const manifest = readRuntimeManifest(path.join(runtimeRoot, 'reactor_main.js'));
    assert.equal(manifest.scripts.includes('js/libs/three.js'), false);
    assert.equal(fs.existsSync(path.join(runtimeRoot, 'libs', 'three.js')), true,
        'but it does ship in the runtime bundle');
});

// Two revisions are written in reactor_main.js and they mean different things:
// the comment is what ProjectManager compares to decide whether a project's own
// js/ copy is stale, and the global is what the running game reports. They
// drifted six days apart -- the global moved through 20260915.1, .16.1, .17.1
// and four 18s while the comment stayed at 20260912.2 -- because four feature
// tests pinned the comment's literal value, so bumping it meant editing them
// and the global got bumped alone instead. A project already refreshed under
// this engine version then read as current and never took another runtime.
test('the revision the updater compares and the revision the game reports are the same', () => {
    const main = fs.readFileSync(path.join(runtimeRoot, 'reactor_main.js'), 'utf8');
    const stated = main.match(/RPG Reactor runtime revision:\s*([\w.-]+)/)?.[1];
    const reported = main.match(/RPG_REACTOR_RUNTIME_REVISION\s*=\s*"([\w.-]+)"/)?.[1];
    assert.ok(stated, 'reactor_main.js states a runtime revision in its header');
    assert.ok(reported, 'reactor_main.js sets RPG_REACTOR_RUNTIME_REVISION');
    assert.equal(stated, reported,
        'the header comment decides whether a project refreshes; sync-runtime stamps it from the global');

    // The version comment has an executable twin too: the editor compares it
    // against editor/package.json, so a hand-typed copy that drifts either
    // refreshes every project on every open or stops refreshing them at all.
    const statedVersion = main.match(/RPG Reactor runtime version:\s*([\d.]+)/)?.[1];
    const packaged = JSON.parse(fs.readFileSync(path.join(workspaceRoot, 'editor', 'package.json'), 'utf8')).version;
    assert.equal(statedVersion, packaged, 'the header version is stamped from editor/package.json');

    // And the bundled projects carry that same runtime, or they are running an older engine.
    const templates = path.join(workspaceRoot, 'template');
    const behind = [];
    for (const name of fs.readdirSync(templates)) {
        const copy = path.join(templates, name, 'js', 'reactor_main.js');
        if (!fs.existsSync(copy)) continue;
        // Only projects that boot the runtime carry it (an imported MZ project may hold a stray copy).
        const page = path.join(templates, name, 'index.html');
        if (fs.existsSync(page) && !/js\/reactor_main\.js/.test(fs.readFileSync(page, 'utf8'))) continue;
        const source = fs.readFileSync(copy, 'utf8');
        if (source.match(/RPG Reactor runtime revision:\s*([\w.-]+)/)?.[1] !== stated) behind.push(name);
    }
    assert.deepEqual(behind, [], 'run editor/build-scripts/sync-runtime.cjs');
});
