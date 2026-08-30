const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const srcDir = path.resolve(__dirname, '..', 'src');
const cssDir = path.resolve(__dirname, '..', 'css');

function source(...parts) {
    return fs.readFileSync(path.join(srcDir, ...parts), 'utf8');
}

const styles = fs.readFileSync(path.join(cssDir, 'styles.css'), 'utf8');
const theme = fs.readFileSync(path.join(cssDir, 'theme.css'), 'utf8');

test('the effect editor shares the trait modal chrome and grid rows', () => {
    const effectEditor = source('database', 'DatabaseEffectEditor.js');
    assert.match(effectEditor, /rr-modal-header/);
    assert.match(effectEditor, /rr-modal-footer/);
    assert.match(effectEditor, /rr-trait-row/);
    assert.match(effectEditor, /class="ok-btn rr-button-primary"/);
    assert.doesNotMatch(effectEditor, /#252525/);
});

test('the enemy action modal wears the standard chrome', () => {
    const enemyEditor = source('database', 'DatabaseEnemyEditor.js');
    assert.match(enemyEditor, /rr-modal-header[\s\S]{0,400}Action Pattern/);
    assert.match(enemyEditor, /btnRow\.className = 'rr-modal-footer'/);
    assert.match(enemyEditor, /okBtn\.className = 'rr-button-primary'/);
});

test('a dropdown-less trait or effect row fills the control column', () => {
    for (const name of ['DatabaseTraitEditor.js', 'DatabaseEffectEditor.js']) {
        const editor = source('database', name);
        assert.match(editor, /rr-trait-lone-value/, name);
    }
    assert.match(theme, /\.rr-trait-row \.rr-trait-lone-value \{/);
});

test('list-card action strips are CSS-classed and pin to filled cards', () => {
    // No editor carries the old inline strip style; the classes exist in CSS
    // with the bottom-pin variant for stretched pair layouts.
    const editors = fs.readdirSync(path.join(srcDir, 'database')).filter(f => f.endsWith('.js'));
    for (const name of editors) {
        const editor = source('database', name);
        assert.doesNotMatch(editor, /action-buttons" style="/, name);
    }
    assert.match(styles, /\.trait-action-buttons,[\s\S]{0,200}\.action-action-buttons \{[^}]*display: flex/);
    assert.match(styles, /\.database-actor-pair \.trait-action-buttons[\s\S]{0,400}margin-top: auto/);
});

test('actor pairs and class columns reflow through the detail container query', () => {
    // Layout lives in CSS (not inline styles), so the existing
    // @container database-detail collapse can reach it.
    const actorEditor = source('database', 'DatabaseActorEditor.js');
    const classEditor = source('database', 'DatabaseClassEditor.js');
    assert.doesNotMatch(actorEditor, /database-actor-pair';\s*\w+\.style\.cssText = '[^']*grid-template-columns/);
    assert.doesNotMatch(classEditor, /database-class-columns';\s*\w+\.style\.cssText/);
    assert.match(styles, /\.database-actor-pair \{[^}]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
    assert.match(styles, /\.database-class-columns \{[^}]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
});

test('filled pair cards flow the fill chain down to the grow row', () => {
    assert.match(styles, /\.database-actor-pair > \.database-section \{[\s\S]{0,200}flex-direction: column/);
    const growRule = styles.slice(styles.indexOf('.db-form.db-fill > .db-row-grow {'));
    assert.match(growRule.slice(0, 400), /align-items: stretch/);
});

test('rr-modal never exceeds the viewport', () => {
    assert.match(theme, /\.rr-modal \{[^}]*max-height: 88vh;[^}]*max-width: calc\(100vw - 16px\);[^}]*\}/s);
});

test('event command dialogs wear the shared chrome classes', () => {
    const commandsDir = path.join(srcDir, 'event', 'commands');
    const files = fs.readdirSync(commandsDir).filter(f => f.endsWith('.js'));
    let headers = 0;
    for (const name of files) {
        const editor = fs.readFileSync(path.join(commandsDir, name), 'utf8');
        assert.doesNotMatch(editor, /header\.style\.cssText = ['`][^'`]*bg-panel/, name);
        assert.doesNotMatch(editor, /footer\.style\.cssText = ['`][^'`]*border-top/, name);
        assert.doesNotMatch(editor, /<h3 style=/, name);
        if (/rr-modal-header/.test(editor)) headers++;
    }
    assert.ok(headers >= 75, `expected 75+ rr-modal-header dialogs, found ${headers}`);
});

test('troop, battle test, and animation dialogs are on the standard chrome', () => {
    const troop = source('database', 'DatabaseTroopEditor.js');
    assert.match(troop, /replacing \? tt\('Replace Enemy'\)[\s\S]{0,600}rr-modal-close/);
    assert.match(troop, /createSmallButton\(label, onclick\) \{[\s\S]{0,200}rr-btn-chip/);
    const battle = source('database', 'BattleTestConfigModal.js');
    assert.match(battle, /rr-modal-header battle-test-config-header/);
    const anim = source('database', 'DatabaseAnimationEditor.js');
    assert.doesNotMatch(anim, /#3a3a3a/);
    assert.match(anim, /effect-picker-ok" class="rr-button-primary"/);
    assert.match(anim, /RRAudioPickerModal\.open\(\{[\s\S]*?title: 'Select Sound Effect'/);
    assert.match(anim, /effect-picker-modal" class="rr-modal-overlay"/);
    assert.match(anim, /class="rr-modal rr-effect-picker-modal" role="dialog" aria-modal="true" aria-labelledby="effect-picker-title"/);
    assert.doesNotMatch(anim, /effect-browser-host[^\n]*<\/div>\s*<\/div>\s*\n\s*<!-- Right: Preview -->/,
        'the effect browser and preview remain in the same two-column body');
    assert.match(anim, /class="rr-effect-picker-preview"/,
        'the live effect preview occupies the right pane');
    assert.match(anim, /class="rr-number-stepper"[\s\S]*?data-timing-duration-step="1"[\s\S]*?data-timing-duration-step="-1"/);
});

test('event command dialogs use the shared footer buttons and stay responsive', () => {
    const commandsDir = path.join(srcDir, 'event', 'commands');
    const files = fs.readdirSync(commandsDir).filter(f => f.endsWith('.js'));
    const inlineAccentOk = /okBtn\.style\.cssText = [`'][^`']*background(?:-color)?: var\(--color-accent\)/;
    let primaries = 0;
    let responsive = 0;
    for (const name of files) {
        const editor = fs.readFileSync(path.join(commandsDir, name), 'utf8');
        assert.doesNotMatch(editor, inlineAccentOk, name);
        if (/okBtn\.className = 'rr-button-primary'/.test(editor)) primaries++;
        if (/width: min\(\d+px, calc\(100vw - 24px\)\)/.test(editor)) responsive++;
    }
    assert.ok(primaries >= 60, `expected 60+ primary OK buttons, found ${primaries}`);
    assert.ok(responsive >= 60, `expected 60+ responsive dialog widths, found ${responsive}`);
});
