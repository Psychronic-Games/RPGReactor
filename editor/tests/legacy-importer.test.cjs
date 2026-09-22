'use strict';
// The importer module the editor's File › Import Project… and the CLI share,
// and the dialog's project detection. A real import runs on Deep 8 when the
// project is present: two maps, no assets, into a temp folder.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const I = require('../src/legacy/LegacyImporter.js');
const Dialog = require('../src/LegacyImportDialog.js');

const editorRoot = path.resolve(__dirname, '..');
const deep8 = path.resolve(editorRoot, '..', 'template', 'DEEP 8');

test('the module exposes report, printReport and importProject, and the CLI and worker use it', () => {
    assert.deepEqual(Object.keys(I).sort(), ['importProject', 'languages', 'open', 'printReport', 'probe', 'report']);
    const cli = fs.readFileSync(path.join(editorRoot, 'build-scripts', 'import-legacy-project.cjs'), 'utf8');
    assert.match(cli, /LegacyImporter\.js/);
    assert.match(cli, /I\.importProject\(/);
    const worker = fs.readFileSync(path.join(editorRoot, 'build-scripts', 'legacy-import-worker.js'), 'utf8');
    assert.match(worker, /worker_threads/);
    assert.match(worker, /I\.importProject\(source, destination/);
    assert.match(fs.readFileSync(path.join(editorRoot, 'build-scripts', 'import-legacy-project.cjs'), 'utf8'), /--language/);
    const dialog = fs.readFileSync(path.join(editorRoot, 'src', 'LegacyImportDialog.js'), 'utf8');
    assert.match(dialog, /\.probe\(folder\)/, 'the dialog identifies the folder through the importer');
    assert.match(dialog, /fillLanguages\(probed\.languages\)/, 'the dialog lists the languages a project ships');
    assert.match(dialog, /language: languageSelect\.value \|\| undefined/);
});

test('the dialog tells 2000/2003, XP, VX and VX Ace folders apart by their marker files', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-legacy-detect-'));
    try {
        assert.equal(Dialog.detect(fs, path, dir), null);
        fs.writeFileSync(path.join(dir, 'RPG_RT.ldb'), '');
        assert.equal(Dialog.detect(fs, path, dir), '2003');
        fs.unlinkSync(path.join(dir, 'RPG_RT.ldb'));
        fs.writeFileSync(path.join(dir, 'Game.rxproj'), '');
        assert.equal(Dialog.detect(fs, path, dir), 'xp');
        fs.unlinkSync(path.join(dir, 'Game.rxproj'));
        fs.writeFileSync(path.join(dir, 'Game.rvproj2'), '');
        assert.equal(Dialog.detect(fs, path, dir), 'ace');
        assert.equal(Dialog.detect(fs, path, path.join(dir, 'missing')), null);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('the editor reaches the importer: File menu entry, dispatch, callback, controller and the dialog script', () => {
    const html = fs.readFileSync(path.join(editorRoot, 'index.html'), 'utf8');
    assert.match(html, /data-action="import-project"[^>]*>\s*<span data-i18n="menu\.importProject"/);
    assert.match(html, /<script src="src\/LegacyImportDialog\.js"><\/script>/);
    assert.match(fs.readFileSync(path.join(editorRoot, 'src', 'UIManager.js'), 'utf8'), /case 'import-project':[\s\S]{0,80}importProject\(\)/);
    assert.match(fs.readFileSync(path.join(editorRoot, 'src', 'main.js'), 'utf8'), /importProject: \(\) => this\.projectController\.importLegacyProject\(\)/);
    const controller = fs.readFileSync(path.join(editorRoot, 'src', 'ProjectController.js'), 'utf8');
    assert.match(controller, /async importLegacyProject\(\)[\s\S]{0,400}RRLegacyImportDialog[\s\S]{0,300}openProjectAtPath\(destination\)/);
    assert.match(controller, /if \(projectPath\) await this\.openProjectAtPath\(projectPath\);/, 'Open Project uses the same path-based open');
});

test('a two-map Deep 8 import through the module writes an openable project', { skip: !fs.existsSync(path.join(deep8, 'RPG_RT.ldb')) }, () => {
    const dest = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-legacy-import-'));
    try {
        const lines = [];
        const summary = I.importProject(deep8, dest, { maps: [3, 12], skipAssets: true, force: true, log: (l) => lines.push(l) });
        assert.equal(summary.maps, 2);
        assert.equal(summary.tilesets, 100);
        assert.ok(lines.some(l => /Converting the database/.test(l)) && lines.some(l => /^Wrote /.test(l)), 'the log narrates the stages');
        for (const f of ['project.rpgreactor', 'index.html', 'package.json', 'import-report.json', 'data/System.json', 'data/Actors.json', 'data/Classes.json', 'data/Tilesets.json', 'data/MapInfos.json', 'data/Map003.json', 'data/Map012.json', 'data/CommonEvents.json', 'js/reactor_main.js', 'img/tilesets/chip001_A1.png', 'img/system/IconSet.png', 'img/system/Balloon.png', 'img/system/Window.png', 'fonts/RM2000.ttf']) assert.ok(fs.existsSync(path.join(dest, f)), f);
        const project = JSON.parse(fs.readFileSync(path.join(dest, 'project.rpgreactor'), 'utf8'));
        assert.equal(project.importedFrom, 'RPG Maker 2003');
        const system = JSON.parse(fs.readFileSync(path.join(dest, 'data', 'System.json'), 'utf8'));
        assert.deepEqual([system.tileSize, system.advanced.screenWidth, system.advanced.screenHeight, system.startMapId], [16, 320, 240, 3]);
        assert.deepEqual([system.advanced.mainFontFilename, system.advanced.numberFontFilename, system.advanced.fontSize, system.advanced.lineHeight, system.advanced.windowPadding, system.advanced.textOutlineWidth, system.advanced.pixelatedRendering, system.advanced.windowMargin, system.advanced.windowOpacity], ['RM2000.ttf', 'RM2000.ttf', 13, 16, 8, 1, true, 0, 255], 'the game font drawn at its pixel size on 16 px lines, scaled without a blur');
        assert.equal(system.rrLanguage, undefined);
        assert.deepEqual(system.terms.commands.slice(2, 4), ['Attack', 'Guard'], 'Japanese default terms give way to the stock words');
        assert.equal(system.terms.commands[0], 'Kämpfen');
        assert.throws(() => I.importProject(deep8, dest, { maps: [3], skipAssets: true }), /not empty/);
    } finally { fs.rmSync(dest, { recursive: true, force: true }); }
});

test('a language the game ships is baked into every text: messages, choices, plugin texts, records and terms', { skip: !fs.existsSync(path.join(deep8, 'RPG_RT.ldb')) }, () => {
    assert.deepEqual(I.languages(deep8), ['english']);
    const dest = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-legacy-lang-'));
    try {
        I.importProject(deep8, dest, { maps: [3, 97], skipAssets: true, force: true, language: 'english', log: () => {} });
        const system = JSON.parse(fs.readFileSync(path.join(dest, 'data', 'System.json'), 'utf8'));
        assert.equal(system.rrLanguage, 'english');
        assert.equal(system.terms.commands[25], 'Sell');
        const items = JSON.parse(fs.readFileSync(path.join(dest, 'data', 'Items.json'), 'utf8'));
        assert.equal(items[1].name, 'Small Pluz stone');
        const title = JSON.parse(fs.readFileSync(path.join(dest, 'data', 'Map097.json'), 'utf8'));
        const scripts = title.events.filter(Boolean).flatMap(e => e.pages.flatMap(p => p.list)).filter(c => c.code === 355).map(c => c.parameters[0]);
        assert.ok(scripts.some(s => /rrWriteText\("1".*"New Game"/.test(s)), 'the German title text is written in English');
        assert.ok(!scripts.some(s => /Neues Spiel/.test(s)));
        const common = JSON.parse(fs.readFileSync(path.join(dest, 'data', 'CommonEvents.json'), 'utf8'));
        const texts = common.filter(Boolean).flatMap(e => e.list).filter(c => c.code === 401).map(c => c.parameters[0]);
        const german = texts.filter(t => /\b(und|nicht|ist)\b/.test(t));
        assert.ok(texts.length > 1000 && german.length < texts.length / 50, `German lines left: ${german.length} of ${texts.length} (the game's own untranslated placeholders)`);
    } finally { fs.rmSync(dest, { recursive: true, force: true }); }
});

test('the import worker has a TextDecoder before the importer loads (NW.js workers get none)', () => {
    const fs = require('node:fs'), path = require('node:path');
    const source = fs.readFileSync(path.join(__dirname, '..', 'build-scripts', 'legacy-import-worker.js'), 'utf8');
    const install = source.indexOf("globalThis.TextDecoder = require('node:util').TextDecoder");
    assert.ok(install > 0 && install < source.indexOf("require(path.join(__dirname, '..', 'src', 'legacy', 'LegacyImporter.js'))"));
});

test('probe names the engine of a folder without reading its maps', () => {
    const os = require('node:os');
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-probe-'));
    const make = (name, files) => { const dir = path.join(root, name); for (const [file, text] of Object.entries(files)) { fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true }); fs.writeFileSync(path.join(dir, file), text); } return dir; };
    try {
        const xp = I.probe(make('xp', { 'Game.rgssad': '', 'Game.ini': '[Game]\r\nLibrary=RGSS104E.dll\r\nTitle=Old Tale\r\n' }));
        assert.deepEqual([xp.kind, xp.engine, xp.title, xp.packed], ['xp', 'RPG Maker XP', 'Old Tale', true]);
        const ace = I.probe(make('ace', { 'Data/Map001.rvdata2': '', 'Data/Map002.rvdata2': '', 'Game.ini': '[Game]\nLibrary=System\\RGSS301.dll\n' }));
        assert.deepEqual([ace.kind, ace.maps, ace.packed], ['ace', 2, false]);
        assert.equal(I.probe(make('vx', { 'Game.rgss2a': '' })).kind, 'vx');
        assert.equal(I.probe(make('mz', { 'data/System.json': '{}', 'js/rmmz_core.js': '' })).kind, 'mz');
        assert.equal(I.probe(make('mv', { 'data/System.json': '{}', 'js/rpg_core.js': '' })).kind, 'mv');
        assert.equal(I.probe(make('reactor', { 'project.rpgreactor': '{}', 'data/System.json': '{}', 'js/reactor_main.js': '' })).kind, 'reactor');
        assert.equal(I.probe(make('empty', { 'readme.txt': '' })).kind, null);
        assert.equal(I.probe(path.join(root, 'missing')).kind, null);
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
    const deep8 = path.resolve(editorRoot, '..', 'template', 'DEEP 8');
    if (fs.existsSync(deep8)) {
        const found = I.probe(deep8);
        assert.deepEqual([found.kind, found.engine, found.title, found.maps, found.languages], ['2003', 'RPG Maker 2003', 'Deep 8', 266, ['english']]);
    }
});
