'use strict';
// The project every import starts from is made of files the repository and
// every release carry: src/legacy/skeleton, plus the system pictures, effects
// and fonts skeleton-shared.json names in the bundled Demo, and the editor's icon.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const editorRoot = path.resolve(__dirname, '..');
const legacy = path.join(editorRoot, 'src', 'legacy');
const EditorPaths = require(path.join(legacy, 'EditorPaths.js'));

test('every skeleton file exists in the repository', () => {
    const repo = path.resolve(editorRoot, '..');
    const files = EditorPaths.skeletonFiles();
    assert.ok(files.size > 150);
    for (const [rel, file] of files) {
        assert.ok(fs.existsSync(file), rel);
        assert.equal(path.relative(repo, file).startsWith('..'), false, `${rel} comes from inside the repository`);
    }
    const shared = JSON.parse(fs.readFileSync(path.join(legacy, 'skeleton-shared.json'), 'utf8'));
    for (const rel of shared.demo) assert.ok(fs.existsSync(path.join(repo, 'template', 'Demo', rel)), `Demo ${rel}`);
});

test('the skeleton is an empty project with the pictures every scene loads', () => {
    const dest = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-import-skeleton-'));
    try {
        EditorPaths.copySkeleton(dest, rel => rel.startsWith('js/'));
        for (const rel of ['index.html', 'package.json', 'icon/icon.png', 'data/System.json', 'data/MapInfos.json', 'data/Actors.json',
            'fonts/mplus-1m-regular.woff', 'fonts/mplus-2p-bold-sub.woff', 'effects/Absorb.efkefc']) {
            assert.ok(fs.existsSync(path.join(dest, rel)), rel);
        }
        for (const name of ['Balloon', 'ButtonSet', 'Damage', 'GameOver', 'IconSet', 'Shadow1', 'Shadow2', 'States', 'Weapons1', 'Weapons2', 'Weapons3', 'Window']) {
            assert.ok(fs.existsSync(path.join(dest, 'img', 'system', name + '.png')), name);
        }
        assert.equal(fs.existsSync(path.join(dest, 'js')), false, 'skipped files are left out');
        assert.deepEqual(fs.readdirSync(path.join(dest, 'img')), ['system']);
        assert.equal(fs.existsSync(path.join(dest, 'audio')), false);

        // The importers fill a game's terms over this base, so it carries every message the engine shows.
        const system = JSON.parse(fs.readFileSync(path.join(dest, 'data', 'System.json'), 'utf8'));
        for (const key of ['actorGain', 'enemyNoHit', 'counterAttack', 'bgmVolume', 'alwaysDash', 'levelUp', 'victory']) {
            assert.equal(typeof system.terms.messages[key], 'string', key);
        }
        assert.equal(system.sounds.length, 24);
        assert.equal(system.advanced.mainFontFilename, 'mplus-1m-regular.woff');
        assert.match(fs.readFileSync(path.join(dest, 'index.html'), 'utf8'), /js\/reactor_main\.js/);
    } finally {
        fs.rmSync(dest, { recursive: true, force: true });
    }
});

test('the importers read no folder outside the editor, the runtime and the bundled Demo', () => {
    for (const name of ['LegacyImporter.js', 'RgssImporter.js', 'VxImporter.js', 'XpImporter.js']) {
        const source = fs.readFileSync(path.join(legacy, name), 'utf8');
        assert.doesNotMatch(source, /Barebones/, name);
        assert.doesNotMatch(source, /__dirname, '\.\.', '\.\.', '\.\.'/, name);
    }
    assert.match(EditorPaths.skeletonFile('js/reactor_plugins.js'), /skeleton/);
    assert.throws(() => EditorPaths.skeletonFile('img/system/NoSuch.png'), /no img\/system\/NoSuch\.png/);
});
