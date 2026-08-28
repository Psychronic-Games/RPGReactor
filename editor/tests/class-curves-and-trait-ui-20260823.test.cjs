const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const srcDir = path.resolve(__dirname, '..', 'src');
const databaseDir = path.join(srcDir, 'database');

function source(...parts) {
    return fs.readFileSync(path.join(srcDir, ...parts), 'utf8');
}

require(path.join(srcDir, 'utils', 'DataLimits.js'));

const classEditorSource = source('database', 'DatabaseClassEditor.js');
const DatabaseClassEditor = new Function(`${classEditorSource}\nreturn DatabaseClassEditor;`)();
const editor = Object.create(DatabaseClassEditor.prototype);

test('parameter curves generate across the full 1..999 level domain', () => {
    const cap = globalThis.RR_LIMITS.ACTOR_LEVEL;
    assert.equal(cap, 999);

    const curve = editor._generateParamCurve(50, 8000, 1.4, cap + 1);
    assert.equal(curve.length, cap + 1);
    assert.equal(curve[0], curve[1]); // placeholder mirrors Lv1
    assert.equal(curve[1], 50);
    assert.equal(curve[cap], 8000);
    for (let level = 2; level <= cap; level++) {
        assert.ok(curve[level] >= curve[level - 1], `curve dips at level ${level}`);
    }

    // The runtime reads the stored value exactly at every level of the domain.
    assert.equal(globalThis.rrClassParamAtLevel(curve, cap), 8000);
    assert.equal(globalThis.rrClassParamAtLevel(curve, 500), curve[500]);
});

test('legacy 100-entry MZ arrays still extrapolate linearly to the cap', () => {
    const legacy = new Array(100);
    for (let level = 1; level <= 99; level++) legacy[level] = 100 + level * 10;
    legacy[0] = legacy[1];

    const atCap = globalThis.rrClassParamAtLevel(legacy, 999);
    assert.equal(atCap, legacy[99] + 10 * (999 - 99));
});

test('exponent inference reads whatever domain the array stores', () => {
    const cap = globalThis.RR_LIMITS.ACTOR_LEVEL;
    for (const exponent of [0.6, 1.0, 1.8]) {
        const full = editor._generateParamCurve(10, 5000, exponent, cap + 1);
        const inferred = editor._inferCurveExponent(full);
        assert.ok(Math.abs(inferred - exponent) < 0.1,
            `full-domain inference drifted: ${inferred} vs ${exponent}`);

        const legacy = editor._generateParamCurve(10, 5000, exponent, 100);
        const legacyInferred = editor._inferCurveExponent(legacy);
        assert.ok(Math.abs(legacyInferred - exponent) < 0.1,
            `legacy inference drifted: ${legacyInferred} vs ${exponent}`);
    }
});

test('curve graphs plot the runtime series to the cap and mark extrapolation', () => {
    assert.match(classEditorSource, /const capLevel = globalThis\.RR_LIMITS\?\.ACTOR_LEVEL \|\| 999;[\s\S]*?rrClassParamAtLevel/);
    assert.match(classEditorSource, /setLineDash\(\[5, 4\]\)/); // extrapolated tail draws dashed
    assert.match(classEditorSource, /_generateParamCurve\(lv1, lvMax, exponent, capLevel \+ 1\)/);
    assert.match(classEditorSource, /Level 999 value/);
    assert.doesNotMatch(classEditorSource, /rr-pc-lv99-slider/);
});

test('class modals wear the standard modal chrome', () => {
    // Generate Curve, EXP Curve, and Learnable Skill modals all carry the
    // header/body/footer bars and the secondary/primary footer pair.
    const headerCount = (classEditorSource.match(/rr-modal-header/g) || []).length;
    const footerCount = (classEditorSource.match(/rr-modal-footer/g) || []).length;
    assert.ok(headerCount >= 3, `expected 3+ rr-modal-header uses, found ${headerCount}`);
    assert.ok(footerCount >= 3, `expected 3+ rr-modal-footer uses, found ${footerCount}`);
    assert.match(classEditorSource, /class="learning-edit-ok rr-button-primary"/);
    assert.match(classEditorSource, /class="rr-pc-apply rr-button-primary"/);
    assert.match(classEditorSource, /class="ok-btn rr-button-primary"/);
    assert.doesNotMatch(classEditorSource, /#252525/);
});

test('trait editor modal uses the standard chrome and symmetric grid rows', () => {
    const traitEditor = source('database', 'DatabaseTraitEditor.js');
    assert.match(traitEditor, /rr-modal-header/);
    assert.match(traitEditor, /rr-modal-footer/);
    assert.match(traitEditor, /class="cancel-btn rr-btn-secondary"/);
    assert.match(traitEditor, /class="ok-btn rr-button-primary"/);
    assert.match(traitEditor, /rr-trait-row/);
    assert.match(traitEditor, /database-field-value/);
    assert.doesNotMatch(traitEditor, /#252525/);

    const theme = fs.readFileSync(path.resolve(__dirname, '..', 'css', 'theme.css'), 'utf8');
    assert.match(theme, /\.rr-trait-row \{/);
});

test('every trait section uses the shared chip buttons', () => {
    const editors = ['DatabaseClassEditor.js', 'DatabaseActorEditor.js', 'DatabaseWeaponEditor.js',
        'DatabaseArmorEditor.js', 'DatabaseStateEditor.js', 'DatabaseEnemyEditor.js'];
    for (const name of editors) {
        const editorSource = source('database', name);
        assert.match(editorSource, /<th colspan="2">\$\{tt\('Type'\)\}<\/th>/, name);
        assert.doesNotMatch(editorSource, /<th style="width: [34]px;[^>]*><\/th>\s*<th>\$\{tt\('Type'\)\}<\/th>/, name);
        assert.match(editorSource, /class="trait-btn-add rr-btn-chip">/, name);
        assert.match(editorSource, /class="trait-btn-edit rr-btn-chip" disabled>/, name);
        assert.match(editorSource, /class="trait-btn-copy rr-btn-chip" disabled>/, name);
        assert.match(editorSource, /class="trait-btn-paste rr-btn-chip">/, name);
        assert.match(editorSource, /class="trait-btn-delete rr-btn-chip" disabled>/, name);
        assert.doesNotMatch(editorSource, /trait-btn-\w+" style="/, name);
    }
});

test('state messages explain their format token and duration controls align on the left', () => {
    const state = source('database', 'DatabaseStateEditor.js');
    const styles = source('..', 'css', 'styles.css');
    assert.match(state, /class="state-message-help"><code>%1<\/code>/);
    assert.match(state, /= \$\{tt\('Actor'\)\} \/ \$\{tt\('Enemy'\)\} \$\{tt\('Name'\)\}/);
    assert.match(state, /class="state-duration-row state-duration-check-row">\s*<input type="checkbox"/);
    assert.match(styles, /\.state-duration-row\s*\{[^}]*grid-template-columns: 130px minmax\(0, 1fr\)/s);
    assert.match(styles, /\.state-message-row\s*\{[^}]*grid-template-columns: minmax\(0, 1fr\) 140px/s);
});

test('the Level 999 value label is translated in every locale', () => {
    const catalog = source('I18nDeepTranslations.js');
    const count99 = (catalog.match(/"Level 99 value":/g) || []).length;
    const count999 = (catalog.match(/"Level 999 value":/g) || []).length;
    assert.equal(count999, count99);
});
