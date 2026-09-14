// A web build carries an index of its files so the runtime can correct filename
// casing in a browser, where no directory can be read.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '..', '..');
const { INDEX_PATH, listFiles, writeWebFileIndex } = require(path.join(repoRoot, 'editor', 'build-scripts', 'web-file-index.cjs'));

/** The runtime's index helpers, lifted from the source onto a bare Utils object. */
function runtimeUtils() {
    const source = fs.readFileSync(path.join(repoRoot, 'runtime', 'reactor_core.js'), 'utf8');
    const lift = name => {
        const at = source.indexOf(`Utils.${name} = function(`);
        assert.ok(at >= 0, `${name} is in the runtime`);
        return source.slice(at, source.indexOf('\n};', at) + 3);
    };
    const Utils = { isNwjs: () => false };
    new Function('Utils', [lift('setWebFileIndex'), lift('loadWebFileIndex'), lift('correctFileCaseFromIndex'), lift('correctFileCase')].join('\n'))(Utils);
    return Utils;
}

test('the build writes every file path, forward-slashed and sorted, and leaves itself out', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-web-index-'));
    try {
        fs.mkdirSync(path.join(root, 'audio', 'se'), { recursive: true });
        fs.mkdirSync(path.join(root, 'js'), { recursive: true });
        fs.writeFileSync(path.join(root, 'audio', 'se', 'slash1.ogg'), 'x');
        fs.writeFileSync(path.join(root, 'index.html'), 'x');
        fs.writeFileSync(path.join(root, 'js', 'main.js'), 'x');
        assert.equal(writeWebFileIndex(root), 3);
        const written = JSON.parse(fs.readFileSync(path.join(root, INDEX_PATH), 'utf8'));
        assert.deepEqual(written.files, ['audio/se/slash1.ogg', 'index.html', 'js/main.js']);
        assert.deepEqual(listFiles(root), written.files, 'a second listing does not count the index');
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('in a browser the runtime corrects casing from the index, and only casing', () => {
    const Utils = runtimeUtils();
    assert.equal(Utils.correctFileCase('audio/se/Slash1.ogg'), null, 'nothing to say before the index arrives');
    Utils.setWebFileIndex(['audio/se/slash1.ogg', 'img/pictures/Title.png']);
    assert.equal(Utils.correctFileCase('audio/se/Slash1.ogg'), 'audio/se/slash1.ogg');
    assert.equal(Utils.correctFileCase('./audio/se/SLASH1.ogg?v=3'), 'audio/se/slash1.ogg', 'dots and queries are ignored');
    assert.equal(Utils.correctFileCase('img/pictures/Title.png'), null, 'an exact match needs no correction');
    assert.equal(Utils.correctFileCase('audio/se/missing.ogg'), null, 'a file the build does not have stays missing');
    assert.equal(Utils.correctFileCase('../audio/se/slash1.ogg'), null, 'traversal is refused');
    assert.equal(Utils.correctFileCase('https://example.com/slash1.ogg'), null, 'absolute URLs are refused');
});

test('both web builds write the index after the project is staged', () => {
    for (const worker of ['build-worker.js', 'dist-editor-worker.js']) {
        const source = fs.readFileSync(path.join(repoRoot, 'editor', 'build-scripts', worker), 'utf8');
        assert.match(source, /require\('\.\/web-file-index\.cjs'\)/, `${worker} loads the writer`);
        assert.match(source, /writeWebFileIndex\(/, `${worker} writes the index`);
    }
});
