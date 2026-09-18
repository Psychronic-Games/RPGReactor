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

test('curve graphs plot the runtime series and mark extrapolation', () => {
    assert.match(classEditorSource, /const capLevel = globalThis\.RR_LIMITS\?\.ACTOR_LEVEL \|\| 999;[\s\S]*?rrClassParamAtLevel/);
    assert.match(classEditorSource, /setLineDash\(\[5, 4\]\)/); // extrapolated tail draws dashed
    assert.match(classEditorSource, /_generateParamCurve\(lv1, lvMax, exponent, capLevel \+ 1, targetLevel, maxAllowed\)/);
    assert.doesNotMatch(classEditorSource, /rr-pc-lv99-slider/);
});

test('the curve dialog anchors on a target level, not the engine cap', () => {
    // The second anchor asks for the value at a level the game will reach.
    assert.match(classEditorSource, /tt\('Target level'\)/);
    assert.match(classEditorSource, /tt\('Value at target level'\)/);
    assert.doesNotMatch(classEditorSource, /Level 999 value/);
    // The mini-curve thumbnails and the preview both plot the target domain.
    assert.match(classEditorSource, /drawParameterCurve\(canvas, params\[idx\] \|\| \[\], paramColors\[idx\], \{ maxLevel: targetLevel \}\)/);
    assert.match(classEditorSource, /const plotLevel = Math\.max\(2, Math\.min\(capLevel, Math\.floor\(Number\(options\?\.maxLevel\) \|\| capLevel\)\)\)/);
    // The EXP table enumerates the target domain rather than all 999 levels.
    assert.match(classEditorSource, /const maxLevel = targetLevel;/);
    assert.match(classEditorSource, /class="exp-target-input"/);
});

test('the EXP graph box fits the dialog instead of asserting a height', () => {
    // It was a hardcoded 420px inside a flex area that is 194px tall at the
    // modal's own 88vh cap, so the table ran 226px under the sliders with no
    // bottom edge and the graph was drawn for twice its visible height.
    assert.doesNotMatch(classEditorSource, /border-radius: 4px; height: 420px; overflow-y: auto;/);
    assert.match(classEditorSource, /flex: 1 1 420px;[^"]*min-height: 140px;[^"]*overflow: hidden;/,
        'the box takes what is left, down to a floor, and clips its own content');
    // The tab area has to be a column, or flex sizing applies to the wrong axis
    // and the box collapses to its floor whatever room the dialog has.
    assert.match(classEditorSource, /flex-direction: column;\s*\n\s*flex: 1 1 auto;\s*\n\s*min-height: 0;/);

    // The canvas is sized when the table is built, so a box that follows the
    // window needs a redraw on resize — and the listener has to go again.
    assert.match(classEditorSource, /window\.addEventListener\('resize', onWindowResize\)/);
    assert.match(classEditorSource, /window\.removeEventListener\('resize', onWindowResize\)/);
    // Both on the close path and if the dialog is dismissed by its owner.
    assert.match(classEditorSource, /if \(!overlay\.isConnected\) \{\s*\n\s*window\.removeEventListener\('resize', onWindowResize\);/);
    assert.match(classEditorSource, /cancelAnimationFrame\(updateFrame\)/, 'a pending frame must not outlive the dialog');
    assert.doesNotMatch(classEditorSource, /'\.close-btn'\)\.addEventListener\('click', \(\) => overlay\.remove\(\)\)/,
        'the close buttons go through closeExpModal so the listener is removed');
});

test('the target level comes from the actors that use the class', () => {
    const actors = [
        null,
        { id: 1, classId: 1, maxLevel: 60 },
        { id: 2, classId: 1, maxLevel: 75 },
        { id: 3, classId: 2, maxLevel: 120 }
    ];
    const withActors = Object.create(DatabaseClassEditor.prototype);
    withActors.databaseManager = { getActors: () => actors };

    // Highest maxLevel among the actors assigned to this class.
    assert.equal(withActors._targetLevelFor({ id: 1 }), 75);
    assert.equal(withActors._targetLevelFor({ id: 2 }), 120);
    // A class nobody uses falls back to the highest cap in the database...
    assert.equal(withActors._targetLevelFor({ id: 9 }), 120);
    // ...and an empty database falls back to the MZ default.
    const bare = Object.create(DatabaseClassEditor.prototype);
    bare.databaseManager = { getActors: () => [] };
    assert.equal(bare._targetLevelFor({ id: 1 }), 99);
    // No database manager at all must not throw (the dialog still has to open).
    const orphan = Object.create(DatabaseClassEditor.prototype);
    assert.equal(orphan._targetLevelFor({ id: 1 }), 99);
    // Out-of-range caps clamp into the engine domain.
    const silly = Object.create(DatabaseClassEditor.prototype);
    silly.databaseManager = { getActors: () => [{ id: 1, classId: 1, maxLevel: 999999 }] };
    assert.equal(silly._targetLevelFor({ id: 1 }), globalThis.RR_LIMITS.ACTOR_LEVEL);
});

test('a targeted curve hits its anchor at the target level and keeps rising past it', () => {
    const cap = globalThis.RR_LIMITS.ACTOR_LEVEL;
    const curve = editor._generateParamCurve(50, 800, 1.2, cap + 1, 60);

    assert.equal(curve.length, cap + 1);
    assert.equal(curve[1], 50);
    assert.equal(curve[60], 800, 'the anchor lands on the target level');
    // The array still covers the whole engine domain, and past the target the
    // same curve continues instead of flat-lining, so raising an actor's
    // maxLevel later finds sensible values already there.
    assert.ok(curve[61] > curve[60], 'curve flat-lines past the target');
    assert.ok(curve[cap] > curve[60]);
    for (let level = 2; level <= cap; level++) {
        assert.ok(curve[level] >= curve[level - 1], `curve dips at level ${level}`);
    }
    // The runtime reads the stored value exactly at the target.
    assert.equal(globalThis.rrClassParamAtLevel(curve, 60), 800);
});

test('the tail past a near target is capped at the dialog ceiling', () => {
    // t reaches ~25 by Lv999 when the target is 40; cubed, an uncapped curve
    // would write millions into the array for a stat the dialog caps at 9999.
    const cap = globalThis.RR_LIMITS.ACTOR_LEVEL;
    const uncapped = editor._generateParamCurve(10, 500, 3, cap + 1, 40);
    assert.ok(uncapped[cap] > 1e6, 'test premise: an uncapped tail really does explode');

    const capped = editor._generateParamCurve(10, 500, 3, cap + 1, 40, 9999);
    assert.equal(capped[40], 500, 'the anchor still lands on the target');
    assert.equal(capped[cap], 9999, 'the tail settles at the ceiling');
    for (let level = 1; level <= cap; level++) {
        assert.ok(capped[level] <= 9999, `level ${level} broke the ceiling`);
    }
});

test('moving the target level re-anchors the view without moving the curve', () => {
    // The dialog reads the working curve at the new target and regenerates from
    // it. Because the generator is a pure power curve, that has to be a no-op on
    // every stored value — otherwise changing the target silently rebalances the
    // class. This is the property the dialog's syncTarget relies on.
    for (const exponent of [0.6, 1.0, 1.8]) {
        const cap = globalThis.RR_LIMITS.ACTOR_LEVEL;
        const original = editor._generateParamCurve(40, 900, exponent, cap + 1, 99);
        const reanchored = editor._generateParamCurve(
            40, globalThis.rrClassParamAtLevel(original, 60), exponent, cap + 1, 60);

        for (let level = 1; level <= 200; level++) {
            assert.ok(Math.abs(reanchored[level] - original[level]) <= 1,
                `exponent ${exponent} drifted at level ${level}: ${reanchored[level]} vs ${original[level]}`);
        }
    }
});

test('exponent inference reads the target domain when given one', () => {
    const cap = globalThis.RR_LIMITS.ACTOR_LEVEL;
    // Even targets are the case the old fit got wrong: it sampled the level at
    // t = 0.508 and solved as if t were 0.5, so reopening the dialog on an
    // even-capped class and pressing Apply shifted every value.
    for (const target of [40, 60, 61, 99, 120]) {
        for (const exponent of [0.6, 1.0, 1.8]) {
            const curve = editor._generateParamCurve(10, 5000, exponent, cap + 1, target);
            const inferred = editor._inferCurveExponent(curve, target);
            assert.ok(Math.abs(inferred - exponent) < 0.02,
                `target ${target} inference drifted: ${inferred} vs ${exponent}`);
        }
    }
});

test('reopening the dialog and applying leaves the curve where it was', () => {
    // Open -> Apply with nothing touched is the single most common interaction,
    // and it must be a no-op. It reads the stored curve, re-fits the exponent,
    // and regenerates: any bias in the fit shows up here as silent rebalancing.
    const cap = globalThis.RR_LIMITS.ACTOR_LEVEL;
    for (const target of [40, 60, 99]) {
        const stored = editor._generateParamCurve(544, 4870, 1.15, cap + 1, target, 99999);

        const refitted = editor._generateParamCurve(
            stored[1],
            globalThis.rrClassParamAtLevel(stored, target),
            editor._inferCurveExponent(stored, target),
            cap + 1, target, 99999);

        for (let level = 1; level <= target; level++) {
            const drift = Math.abs(refitted[level] - stored[level]);
            assert.ok(drift <= 2,
                `target ${target}: reopening shifted Lv${level} by ${drift} (${stored[level]} -> ${refitted[level]})`);
        }
    }
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
        assert.match(editorSource, /<th class="trait-indicator-heading" aria-hidden="true"><\/th><th scope="col">\$\{tt\('Type'\)\}<\/th>/, name);
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
    assert.match(styles, /\.state-duration-row\s*\{[^}]*grid-template-columns: minmax\(0, 1fr\) minmax\(100px, 150px\)/s);
    assert.match(styles, /\.state-message-row\s*\{[^}]*grid-template-columns: 140px minmax\(0, 1fr\)/s);
});

test('the curve dialog labels are translated in every locale', () => {
    const catalog = source('I18nDeepTranslations.js');
    const count99 = (catalog.match(/"Level 99 value":/g) || []).length;
    assert.ok(count99 > 0, 'no locale baseline to compare against');
    // Every label in the Generate Curve dialog carries the same locale coverage
    // as the sibling phrase it sits beside.
    for (const phrase of ['Level 999 value', 'Target level', 'Value at target level']) {
        const count = (catalog.match(new RegExp(`"${phrase}":`, 'g')) || []).length;
        assert.equal(count, count99, `${phrase} is missing from ${count99 - count} locale(s)`);
    }
});
