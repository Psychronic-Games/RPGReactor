const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const editorRoot = path.resolve(__dirname, '..');

test('the plugin command file picker lists only what the argument folder holds (GitHub #7)', () => {
    const source = fs.readFileSync(path.join(editorRoot, 'src', 'event', 'commands', 'PluginCommandEditor.js'), 'utf8');
    const start = source.indexOf('PluginCommandEditor.extensionsForDir = function');
    const end = source.indexOf('\n};\n', start) + 4;
    assert.ok(start >= 0, 'the helper exists');
    const context = {
        PluginCommandEditor: {},
        RRAssetFiles: { IMAGE_EXTENSIONS: ['.png', '.jpg', '.jpeg', '.webp', '.svg', '.gif'], AUDIO_EXTENSIONS: ['.ogg', '.mp3', '.wav', '.flac', '.m4a'] }
    };
    vm.runInNewContext(source.slice(start, end), context);
    const ext = context.PluginCommandEditor.extensionsForDir;
    assert.deepEqual(Array.from(ext('img/pictures/')), ['.png', '.jpg', '.jpeg', '.webp', '.svg', '.gif']);
    assert.deepEqual(Array.from(ext('audio/se')), ['.ogg', '.mp3', '.wav', '.flac', '.m4a']);
    assert.deepEqual(Array.from(ext('./movies')), ['.webm', '.mp4']);
    assert.deepEqual(Array.from(ext('fonts')), ['.woff', '.woff2', '.ttf', '.otf']);
    assert.ok(ext('').includes('.png') && ext('').includes('.ogg') && ext('').includes('.webm'), 'no folder: every kind');
    assert.ok(ext('data').includes('.png'), 'an unknown folder lists every kind too');
});
