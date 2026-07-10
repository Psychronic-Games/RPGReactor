const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const editorRoot = path.resolve(__dirname, '..');
const DeploymentPathPreferences = require(path.join(editorRoot, 'src', 'DeploymentPathPreferences.js'));

function memoryStorage() {
    const values = new Map();
    return {
        getItem: key => values.has(key) ? values.get(key) : null,
        setItem: (key, value) => values.set(key, String(value)),
    };
}

test('deployment output paths persist independently across manager instances', () => {
    const storage = memoryStorage();
    assert.equal(DeploymentPathPreferences.load('game', 'dist', storage), 'dist');
    assert.equal(DeploymentPathPreferences.load('editor', 'dist-editor', storage), 'dist-editor');

    const gamePath = '/mnt/Exports/My "Game"';
    const editorPath = '/mnt/Editor Releases';
    assert.equal(DeploymentPathPreferences.save('game', gamePath, storage), true);
    assert.equal(DeploymentPathPreferences.save('editor', editorPath, storage), true);

    assert.equal(DeploymentPathPreferences.load('game', 'dist', storage), gamePath);
    assert.equal(DeploymentPathPreferences.load('editor', 'dist-editor', storage), editorPath);
});

test('deployment output paths safely fall back when storage is unavailable', () => {
    const unavailable = {
        getItem() { throw new Error('storage unavailable'); },
        setItem() { throw new Error('storage unavailable'); },
    };
    assert.equal(DeploymentPathPreferences.load('game', 'dist', unavailable), 'dist');
    assert.equal(DeploymentPathPreferences.save('game', '/tmp/export', unavailable), false);
    assert.equal(DeploymentPathPreferences.save('game', '   ', memoryStorage()), false);
});

test('deployment managers restore and save their respective output paths', () => {
    const indexSource = fs.readFileSync(path.join(editorRoot, 'index.html'), 'utf8');
    const buildSource = fs.readFileSync(path.join(editorRoot, 'src', 'BuildManager.js'), 'utf8');
    const distSource = fs.readFileSync(path.join(editorRoot, 'src', 'DistEditorManager.js'), 'utf8');

    assert.match(indexSource, /DeploymentPathPreferences\.js[\s\S]*?BuildManager\.js/);
    assert.match(buildSource, /DeploymentPathPreferences\.load\('game', 'dist'\)/);
    assert.match(buildSource, /DeploymentPathPreferences\.save\('game', outputPath\.value\)/);
    assert.match(distSource, /DeploymentPathPreferences\.load\('editor', 'dist-editor'\)/);
    assert.match(distSource, /DeploymentPathPreferences\.save\('editor', outputPath\.value\)/);
});
