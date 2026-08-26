const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const editorRoot = path.resolve(__dirname, '..');
const css = fs.readFileSync(path.join(editorRoot, 'css', 'styles.css'), 'utf8');

test('database detail owns an inline-size container and narrow forms reflow within it', () => {
    assert.match(css, /\.database-detail\s*\{[^}]*container-type:\s*inline-size;[^}]*container-name:\s*database-detail;/s);

    const queryStart = css.indexOf('@container database-detail (max-width: 760px)');
    assert.ok(queryStart >= 0, 'database detail container query exists');
    const query = css.slice(queryStart, queryStart + 1200);
    assert.match(query, /\.database-sections-grid\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/s);
    assert.match(query, /\.db-form\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/s);
    assert.match(query, /\.db-form\s*>\s*\.db-row-pair,[\s\S]*\.db-form\s*>\s*\.db-row-cols\s*\{[^}]*grid-auto-flow:\s*row/s);
    assert.doesNotMatch(css, /@media\s*\(max-width:\s*1100px\)[\s\S]{0,1200}database-sections-grid/);
});

test('database labels wrap instead of truncating translated terminology', () => {
    for (const selector of ['.database-section-header', '.database-field-label', '.db-row-cols > .db-col > label']) {
        const start = css.indexOf(`${selector} {`);
        assert.ok(start >= 0, `${selector} rule exists`);
        const rule = css.slice(start, css.indexOf('}', start) + 1);
        assert.match(rule, /white-space:\s*normal/);
        assert.doesNotMatch(rule, /text-overflow:\s*ellipsis/);
    }
    assert.doesNotMatch(css, /:lang\(|\[lang(?:=|\^=|\*=)/, 'layout is not language-specific');
});

test('specialized actor, class, and enemy layouts participate in detail reflow', () => {
    assert.match(css, /\.database-class-columns,[\s\S]*\.database-actor-pair\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)\s*!important/s);
    assert.match(css, /@container database-detail \(max-width: 900px\)[\s\S]*\.database-enemy-top-row,[\s\S]*\.database-enemy-bottom-row\s*\{[^}]*flex-wrap:\s*wrap/s);

    const classSource = fs.readFileSync(path.join(editorRoot, 'src', 'database', 'DatabaseClassEditor.js'), 'utf8');
    assert.match(classSource, /database-class-parameter-grid/);
    assert.match(classSource, /repeat\(auto-fit, minmax\(140px, 1fr\)\)/);
});

test('the Enemies note textarea keeps the height its resize handle sets', () => {
    const enemySource = fs.readFileSync(path.join(editorRoot, 'src', 'database', 'DatabaseEnemyEditor.js'), 'utf8');
    const textarea = enemySource.match(/<textarea class="database-field-value" style="([^"]*)" data-field="note" data-enemy-id=/);
    assert.ok(textarea, 'enemy note textarea exists');
    // `flex: 1` is flex-basis 0%, which makes the flex algorithm discard the
    // inline height a drag on the resize handle writes; an auto basis keeps it.
    assert.match(textarea[1], /flex:\s*1 1 auto/);
    assert.doesNotMatch(textarea[1], /flex:\s*1\s*;/);
});
