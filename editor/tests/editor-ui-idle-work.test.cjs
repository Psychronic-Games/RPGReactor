// Work the editor's chrome did on every event whether or not anything needed
// it: the method profiler wrapped the tile renderers in every session, a
// window drag re-measured the toolbar and re-read the sidebar sizes once per
// resize event, and the database list rebuilt itself on every keystroke of a
// search.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const read = (...parts) => fs.readFileSync(path.resolve(__dirname, '..', 'src', ...parts), 'utf8');

function method(source, signature) {
    const start = source.indexOf(signature);
    assert.ok(start >= 0, `${signature} not found`);
    let depth = 0;
    for (let i = source.indexOf('{', start); i < source.length; i++) {
        if (source[i] === '{') depth++;
        else if (source[i] === '}' && --depth === 0) return source.slice(start, i + 1);
    }
    throw new Error(`${signature} is not closed`);
}

test('the method profiler exists only when asked for', () => {
    const main = read('main.js');
    assert.match(main, /if \(RPGReactor\.perfProfilerRequested\(\)\) window\.perfProfiler = new PerformanceProfiler\(\);/);
    assert.doesNotMatch(main, /^\s*window\.perfProfiler = new PerformanceProfiler\(\);/m);
    // Every consumer checks for it before wrapping.
    for (const file of ['main.js', 'ProjectController.js']) {
        const source = read(file);
        const uses = source.match(/perfProfiler\.wrapMethod/g) || [];
        const guards = source.match(/if \(window\.perfProfiler\) \{/g) || [];
        assert.ok(uses.length === 0 || guards.length > 0, `${file} wraps without checking for the profiler`);
    }
    const requested = method(main, 'static perfProfilerRequested() {').replace(/^static /, '');
    const run = (stored, env) => vm.runInNewContext(`({ ${requested} }).perfProfilerRequested()`, {
        localStorage: { getItem: key => (key === 'rr.perfProfiler' ? stored : null) },
        process: { env }
    });
    assert.equal(run(null, {}), false);
    assert.equal(run('1', {}), true);
    assert.equal(run(null, { RR_PERF_PROFILER: '1' }), true);
    assert.equal(vm.runInNewContext(`({ ${requested} }).perfProfilerRequested()`, {
        localStorage: { getItem() { throw new Error('denied'); } }
    }), false, 'no storage and no process is off, not an error');
});

test('a window resize lays the chrome out once a frame, and the toolbar only when the width moved', () => {
    const main = read('main.js');
    const start = main.indexOf("window.addEventListener('resize', () => {");
    const handler = main.slice(start, main.indexOf("window.addEventListener('rr-language-changed'", start));
    assert.match(handler, /if \(this\._resizeFrame\) return;/);
    assert.match(handler, /this\._resizeFrame = requestAnimationFrame\(\(\) => \{/);
    assert.match(handler, /if \(window\.innerWidth !== this\._toolbarScaledWidth\) this\.scaleToolbarIcons\(\);/);
    assert.match(method(main, 'scaleToolbarIcons() {'), /this\._toolbarScaledWidth = window\.innerWidth;/);

    // Run the handler against a stub window: three resize events in one
    // frame lay out once; a height-only resize leaves the toolbar alone.
    const listeners = {};
    const frames = [];
    const calls = { refresh: 0, reset: 0, scale: 0 };
    const window = { innerWidth: 1280, addEventListener: (type, fn) => { listeners[type] = fn; } };
    const self = {
        sidebarResizer: { refresh: () => calls.refresh++ },
        resetSidebarScroll: () => calls.reset++,
        scaleToolbarIcons() { calls.scale++; this._toolbarScaledWidth = window.innerWidth; }
    };
    vm.runInNewContext(`(function () { ${handler.slice(0, handler.lastIndexOf('});') + 3)} }).call(self)`, {
        self, window, requestAnimationFrame: fn => { frames.push(fn); return frames.length; }
    });
    listeners.resize(); listeners.resize(); listeners.resize();
    assert.equal(frames.length, 1);
    frames.shift()();
    assert.deepEqual(calls, { refresh: 1, reset: 1, scale: 1 });
    listeners.resize();
    frames.shift()();
    assert.deepEqual(calls, { refresh: 2, reset: 2, scale: 1 }, 'the width did not move');
    window.innerWidth = 1100;
    listeners.resize();
    frames.shift()();
    assert.equal(calls.scale, 2);
});

test('the database list search waits for a pause in typing, and Enter filters at once', () => {
    const ui = read('DatabaseEditorUI.js');
    const start = ui.indexOf('let searchTimer = null;');
    assert.ok(start > 0);
    const block = ui.slice(start, ui.indexOf('if (this._listKeyHandler) document.removeEventListener', start));
    assert.match(block, /searchInput\.addEventListener\('input', \(\) => \{\s*clearTimeout\(searchTimer\);\s*searchTimer = setTimeout\(runSearch, 150\);/);
    assert.match(block, /if \(event\.key === 'Enter' && searchTimer !== null\) runSearch\(\);/);
    // A search that lands after the list was rebuilt for another tab is dropped.
    assert.match(block, /if \(this\._activeDatabaseList !== listSession\) return;/);
    assert.match(block, /populateList\(searchInput\.value, false, \{ resetSelection: true \}\);/);
});
