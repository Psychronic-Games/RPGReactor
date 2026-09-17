/**
 * Every script index.html loads must parse as a classic script.
 *
 * The suite reads editor sources constantly, but almost always as text: a test
 * asserts that some line is present, or matches a shape, and text matching is
 * happy with a file that will not run. A duplicate `const` in one method of
 * ChangeParameterEditor.js made the whole file a SyntaxError, so the class was
 * simply absent at runtime and the Change Parameter dialog could not open --
 * and every assertion about that file still passed, because the string it
 * looked for was right there in the broken source.
 *
 * Parsing is not running, so this does not prove the editor works. It proves
 * the far cheaper thing that had no guard at all: that each file the browser
 * is told to load can be loaded.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const editorRoot = path.resolve(__dirname, '..');

/** Every `<script src="...">` in index.html that points at a local file. */
function referencedScripts() {
    const html = fs.readFileSync(path.join(editorRoot, 'index.html'), 'utf8');
    const refs = [...html.matchAll(/<script[^>]*\ssrc=["']([^"']+)["']/gi)]
        .map(match => match[1])
        .filter(src => !/^(?:https?:)?\/\//.test(src));
    return [...new Set(refs)];
}

test('every script index.html loads parses as a classic script', () => {
    const scripts = referencedScripts();
    assert.ok(scripts.length > 100, `expected the full script list, found ${scripts.length}`);

    const failures = [];
    for (const src of scripts) {
        const file = path.join(editorRoot, src);
        if (!fs.existsSync(file)) continue; // its own test owns missing files
        try {
            new vm.Script(fs.readFileSync(file, 'utf8'), { filename: src });
        } catch (error) {
            failures.push(`${src}: ${error.message}`);
        }
    }

    assert.deepEqual(failures, [], `scripts that cannot be parsed:\n  ${failures.join('\n  ')}`);
});

test('the parse check is actually looking at the files', () => {
    // A guard that silently checks nothing is worse than no guard: if the
    // src attribute pattern ever stops matching, the test above passes empty.
    const scripts = referencedScripts();
    assert.ok(scripts.includes('src/event/commands/ChangeParameterEditor.js'));
    assert.ok(scripts.includes('src/utils/ParamNames.js'));

    // And it has to reject a file that genuinely cannot be parsed.
    assert.throws(() => new vm.Script('const tt = 1; const tt = 2;'), /already been declared/);
});
