'use strict';
// Steam: Forge designs as Workshop items (src/steam/WorkshopItems.js), the bridge's "only when Steam started us"
// (src/steam/SteamBridge.js), the editor's achievements (src/steam/SteamAchievements.js) and their wiring.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const editorRoot = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(editorRoot, file), 'utf8');
const Items = require('../src/steam/WorkshopItems.js');
const Steam = require('../src/steam/SteamBridge.js');
const Achievements = require('../src/steam/SteamAchievements.js');

function scratch(t) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-workshop-'));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    return dir;
}

function project(root) {
    const chars = path.join(root, 'forge', 'character_3d', 'characters', 'Heroes');
    fs.mkdirSync(chars, { recursive: true });
    fs.writeFileSync(path.join(chars, 'Ada.json'), JSON.stringify({ builder: 'character3d', version: 2, recipe: { species: 'human', age: 30 } }));
    fs.writeFileSync(path.join(chars, 'Ada.png'), Buffer.from([137, 80, 78, 71, 1, 2, 3]));
    const props = path.join(root, 'forge', 'prop_3d', 'props');
    fs.mkdirSync(props, { recursive: true });
    fs.writeFileSync(path.join(props, 'Inn Sign.json'), JSON.stringify({ builder: 'prop3d', version: 1, recipe: { kind: 'picture', image: 'inn', mode: 'framed' } }));
    fs.mkdirSync(path.join(root, 'img', 'pictures'), { recursive: true });
    fs.writeFileSync(path.join(root, 'img', 'pictures', 'inn.png'), Buffer.from([137, 80, 78, 71, 9]));
    return root;
}

test('designs kept with Save Design are listed, by builder and group', t => {
    const root = project(scratch(t));
    const list = Items.listDesigns(root).map(d => [d.kind, d.group, d.name, !!d.picture]);
    assert.deepEqual(list, [['character3d', 'Heroes', 'Ada', true], ['prop3d', '', 'Inn Sign', false]]);
});

test('a shared design goes up as data: the record, its picture, and a picture prop\'s picture', t => {
    const root = project(scratch(t)), stage = scratch(t);
    const [ada, sign] = Items.listDesigns(root);
    const a = Items.stage(stage, root, ada);
    const item = JSON.parse(fs.readFileSync(path.join(a.contentPath, 'item.json'), 'utf8'));
    assert.equal(item.format, Items.FORMAT);
    assert.equal(item.kind, 'character3d');
    assert.equal(item.record.recipe.species, 'human');
    assert.ok(fs.existsSync(a.previewPath), 'the preview is sent beside the content');
    const s = Items.stage(stage, root, sign);
    assert.deepEqual(fs.readdirSync(s.contentPath).sort(), ['item.json', 'picture.png']);
    assert.equal(s.previewPath, '', 'no picture of its own: no preview');
});

test('a subscribed item comes into the project in the Workshop group, under a free name, its picture with it', t => {
    const root = project(scratch(t)), stage = scratch(t);
    const sign = Items.listDesigns(root)[1];
    const staged = Items.stage(stage, root, sign);
    const item = Items.readItem(staged.contentPath);
    assert.ok(!(item instanceof Error), item.message);
    const first = Items.importItem(root, item), second = Items.importItem(root, item);
    assert.deepEqual([first.group, first.name, second.name], ['Workshop', 'Inn Sign', 'Inn Sign 2']);
    const record = JSON.parse(fs.readFileSync(path.join(root, 'forge', 'prop_3d', 'props', 'Workshop', 'Inn Sign.json'), 'utf8'));
    assert.equal(record.builder, 'prop3d');
    assert.equal(record.recipe.image, 'inn 2', 'the picture is copied in beside the project\'s own "inn", not over it');
    assert.ok(fs.existsSync(path.join(root, 'img', 'pictures', 'inn 2.png')));
});

test('an item that is not a design, or is from a newer editor, is refused; no file outside its folder is read', t => {
    const dir = scratch(t);
    const write = item => fs.writeFileSync(path.join(dir, 'item.json'), JSON.stringify(item));
    assert.ok(Items.readItem(dir) instanceof Error, 'no item.json');
    write({ format: 'something-else' });
    assert.match(Items.readItem(dir).message, /not a Forge design/);
    write({ format: Items.FORMAT, version: 99, kind: 'character3d', name: 'x', record: { builder: 'character3d', recipe: {} } });
    assert.match(Items.readItem(dir).message, /newer RPG Reactor/);
    write({ format: Items.FORMAT, version: 1, kind: 'scripts', name: 'x', record: { builder: 'scripts', recipe: {} } });
    assert.match(Items.readItem(dir).message, /newer RPG Reactor/, 'a builder this editor lacks');
    write({ format: Items.FORMAT, version: 1, kind: 'prop3d', name: 'x', record: { builder: 'character3d', recipe: {} } });
    assert.match(Items.readItem(dir).message, /not a Forge design/, 'the record is the builder the item names');
    write({ format: Items.FORMAT, version: 1, kind: 'prop3d', name: '../../evil', picture: '../../../etc/passwd', record: { builder: 'prop3d', recipe: { kind: 'flag' } } });
    const ok = Items.readItem(dir);
    assert.equal(ok.name, 'evil', 'the name is a file name, no folders');
    assert.equal(ok.picture, '', 'only picture.png/.jpg/.webp beside item.json');
});

test('the projects\'s shared designs are noted by key, so sharing again updates the same item', t => {
    const root = project(scratch(t));
    const ada = Items.listDesigns(root)[0];
    Items.writePublished(root, ada, { id: '123', title: 'Ada' });
    assert.equal(Items.readPublished(root).items['character3d/Heroes/Ada'].id, '123');
    Items.writePublished(root, ada, null);
    assert.deepEqual(Items.readPublished(root).items, {});
});

test('Steam wakes only when Steam started the editor, never in tests or the web editor', () => {
    assert.equal(Steam.launchedBySteam({ SteamAppId: String(Steam.APP_ID) }), true);
    assert.equal(Steam.launchedBySteam({ SteamGameId: String(Steam.APP_ID) }), true);
    assert.equal(Steam.launchedBySteam({ SteamAppId: '480' }), false, 'another game\'s id');
    assert.equal(Steam.launchedBySteam({}), false);
    assert.equal(Steam.launchedBySteam({ RR_STEAM: '1' }), true);
    assert.equal(Steam.launchedBySteam({ SteamAppId: String(Steam.APP_ID), RR_STEAM: '0' }), false);
    assert.equal(Steam.available(), false, 'no nw here: nothing is loaded');
    assert.equal(Steam.reason(), 'not-desktop');
    assert.equal(Achievements.earn('NEW_PROJECT'), false, 'without Steam an achievement is a no-op');
    assert.doesNotMatch(read('src/steam/SteamBridge.js'), /restartAppIfNecessary\(/, 'the same editor ships outside Steam');
});

test('every achievement is earned somewhere in the editor, and set up from the list in docs/steam', () => {
    const ids = Achievements.LIST.map(a => a.id);
    assert.equal(new Set(ids).size, ids.length);
    const sources = ['src/ProjectController.js', 'src/PlaytestManager.js', 'src/main.js', 'src/LegacyImportDialog.js', 'src/BuildManager.js',
        'src/forge/Character3D/Character3DBuilder.js', 'src/forge/Props/PropBuilder.js', 'src/forge/SoundEffectGenerator/SoundEffectGenerator.js',
        'src/forge/Workshop/WorkshopTool.js', 'src/EventManager.js', 'src/MediaSurfaceManager.js', 'src/LightingManager.js', 'src/PieceBuilderManager.js',
        'src/TerrainManager.js'].map(read).join('\n');
    for (const id of ids) assert.ok(sources.includes(`RRAchievements?.earn('${id}')`), id);
    const doc = fs.readFileSync(path.join(editorRoot, '..', 'docs', 'steam', 'ACHIEVEMENTS.md'), 'utf8');
    for (const a of Achievements.LIST) assert.ok(doc.includes('`' + a.id + '`') && doc.includes(a.name) && doc.includes(a.description), a.id);
    // The files uploaded to Steamworks' bulk import: each achievement's definition, name, description and both icons.
    const dir = path.join(editorRoot, '..', 'docs', 'steam', 'achievements');
    const csv = name => fs.readFileSync(path.join(dir, name), 'utf8').trim().split('\n').slice(1);
    assert.deepEqual(csv('definitions.csv').map(line => line.split(',')[0]), ids);
    const words = csv('localization.csv');
    for (const a of Achievements.LIST) {
        assert.ok(words.includes(`${a.id},name,${a.name}`) && words.includes(`${a.id},description,${a.description}`), a.id);
        for (const icon of ['_ACHIEVED.png', '_UNACHIEVED.png']) assert.ok(fs.existsSync(path.join(dir, a.id + icon)), a.id + icon);
    }
});

test('the Forge lists the Workshop page, and the desktop packages carry steamworks.js', () => {
    assert.match(read('src/forge/ForgeManager.js'), /id: 'steam-workshop',[\s\S]{0,200}ctor: \(\) => new ForgeWorkshop\(\)/);
    const html = read('index.html');
    for (const file of ['src/steam/SteamBridge.js', 'src/steam/SteamAchievements.js', 'src/steam/WorkshopItems.js', 'src/forge/Workshop/WorkshopTool.js']) assert.ok(html.includes(`<script src="${file}"></script>`), file);
    assert.equal(JSON.parse(read('package.json')).dependencies['steamworks.js'], '0.4.0', 'an exact version');
    assert.match(read('build-scripts/dist-editor-worker.js'), /copyDirRecursive\(steamworksPath, path\.join\(stageRoot, 'node_modules', 'steamworks\.js'\)\)/);
});

test('a shared project is its data, assets and plugins (plugins come back off), never the engine, saves, links or programs', t => {
    const Projects = require('../src/steam/WorkshopProjects.js');
    const os = require('node:os');
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-workshop-project-'));
    t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
    const project = path.join(temp, 'Mine');
    const put = (rel, data) => { const file = path.join(project, rel); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, data); };
    put('data/System.json', '{"gameTitle":"Mine"}');
    put('data/Map001.json', '{}');
    put('img/pictures/Sky.png', 'sky');
    put('img/pictures/Listed.png', 'listed');
    put('js/plugins/Hello.js', '/* plugin */');
    put('js/plugins.js', 'var $plugins =\n[{"name":"Hello","status":true,"description":"","parameters":{}}];\n');
    put('js/rmmz_core.js', 'engine');
    put('js/reactor_main.js', 'engine');
    put('index.html', '<script>window.$reactorMvCompat = true;</script>');
    put('package.json', '{"main":"index.html"}');
    put('save/file1.rmmzsave', 'save');
    put('tools/run.exe', 'program');
    put('.git/config', 'x');
    put('reactor-builder/src/a.js', 'forge copy');
    put('project.rpgreactor', '{}');
    fs.symlinkSync('/etc', path.join(project, 'img', 'link'));
    const crypto = require('node:crypto');
    Projects.useStockHashes({ [crypto.createHash('sha256').update('listed').digest('hex').slice(0, 20)]: 'x' });
    const list = Projects.collect(project);
    assert.deepEqual(list.files.map(f => f.rel).sort(), ['data/Map001.json', 'data/System.json', 'img/pictures/Sky.png', 'js/plugins.js', 'js/plugins/Hello.js', 'project.rpgreactor']);
    assert.deepEqual(list.left.stock, ['img/pictures/Listed.png']);
    assert.deepEqual(list.plugins, ['Hello']);
    const staged = Projects.stage(path.join(temp, 'stage'), project, { title: 'Mine' });
    const manifest = JSON.parse(fs.readFileSync(path.join(staged.contentPath, Projects.MANIFEST), 'utf8'));
    assert.equal(manifest.mvCompat, true, 'MV rules kept from index.html, which itself stays behind');
    // An item made some other way is held to the same rules when it is opened.
    put('../item/' + Projects.MANIFEST, JSON.stringify({ format: Projects.FORMAT, version: 1, title: '../Escape' }));
    for (const rel of ['data/System.json', 'js/plugins.js', 'js/rmmz_managers.js', 'index.html', 'evil.exe', 'js/plugins/Hello.js']) {
        const file = path.join(temp, 'item', rel); fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, rel === 'js/plugins.js' ? fs.readFileSync(path.join(project, 'js', 'plugins.js')) : 'x');
    }
    const item = Projects.readItem(path.join(temp, 'item'));
    assert.equal(item.kind, 'project');
    assert.equal(item.name, 'Escape', 'no path in the name');
    assert.equal(Projects.readItem(path.join(project, 'data')), null, 'not a project: a design, or nothing');
    const opened = path.join(temp, 'Opened');
    Projects.copyInto(item, opened);
    assert.ok(fs.existsSync(path.join(opened, 'js', 'plugins', 'Hello.js')));
    for (const rel of ['js/rmmz_managers.js', 'index.html', 'evil.exe']) assert.ok(!fs.existsSync(path.join(opened, rel)), rel);
    assert.match(fs.readFileSync(path.join(opened, 'js', 'plugins.js'), 'utf8'), /"status":false/, 'every plugin off');
    assert.equal(Projects.pluginsOff('alert(1); var $plugins = [];'), null, 'a plugin list that is not plain data is not kept');
    assert.throws(() => Projects.copyInto(item, opened), /already there/);
    // The Forge page offers it: a project card first, Open as New Project for a subscribed one.
    const tool = read('src/forge/Workshop/WorkshopTool.js');
    assert.match(tool, /const designs = \[this\._projectEntry\(\)\]\.concat/);
    assert.match(tool, /data-act="open"/);
    assert.ok(read('index.html').includes('<script src="src/steam/WorkshopProjects.js"></script>'));
});
