/**
 * sync-runtime copies runtime/ only into projects that boot it. An imported
 * project still running RPG Maker's corescript (js/main.js → rmmz_*.js) had its
 * js/libs/pixi.js replaced by the runtime's PIXI v8 and its js/ filled with
 * reactor_*.js.
 */
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const script = path.resolve(__dirname, '..', 'build-scripts', 'sync-runtime.cjs');

test('a project on its own corescript is left alone; a Reactor project is synced', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-sync-audit-'));
    try {
        const write = (rel, text) => {
            fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
            fs.writeFileSync(path.join(root, rel), text);
        };
        write('editor/package.json', JSON.stringify({ version: '1.0.0' }));
        write('editor/build-scripts/sync-runtime.cjs', fs.readFileSync(script, 'utf8'));
        write('runtime/reactor_main.js', '// RPG Reactor runtime version: 1.0.0\n// RPG Reactor runtime revision: 1\nglobalThis.RPG_REACTOR_RUNTIME_REVISION = "1";\n');
        write('runtime/libs/pixi.js', 'v8');
        write('template/Game/index.html', '<script src="js/reactor_main.js"></script>');
        write('template/Game/js/libs/pixi.js', 'old');
        write('template/Corescript/index.html', '<script src="js/main.js"></script>');
        write('template/Corescript/js/main.js', 'rmmz');
        write('template/Corescript/js/libs/pixi.js', 'v5');
        execFileSync(process.execPath, [path.join(root, 'editor', 'build-scripts', 'sync-runtime.cjs')], { stdio: 'pipe' });
        assert.equal(fs.readFileSync(path.join(root, 'template/Game/js/libs/pixi.js'), 'utf8'), 'v8');
        assert.equal(fs.readFileSync(path.join(root, 'template/Corescript/js/libs/pixi.js'), 'utf8'), 'v5');
        assert.equal(fs.existsSync(path.join(root, 'template/Corescript/js/reactor_main.js')), false);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});
