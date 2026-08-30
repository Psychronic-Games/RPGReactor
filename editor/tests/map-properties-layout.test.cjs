const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const editorRoot = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(editorRoot, 'index.html'), 'utf8');
const controller = fs.readFileSync(path.join(editorRoot, 'src', 'ProjectController.js'), 'utf8');

function modalMarkup() {
    const start = html.indexOf('<div id="map-properties-modal"');
    const end = html.indexOf('id="map-properties-cancel-btn"', start);
    assert.ok(start >= 0 && end > start, 'map properties modal is locatable');
    return html.slice(start, end);
}

test('every map property control still exists exactly once after the layout pass', () => {
    const modal = modalMarkup();
    const ids = [
        'map-name-input', 'map-display-name-input', 'map-tileset-select',
        'map-scroll-type-select', 'map-width-input', 'map-height-input',
        'map-encounter-steps-input', 'map-resize-anchor', 'map-resize-anchor-row',
        'map-resize-anchor-hint', 'map-autoplay-bgm-checkbox', 'map-bgm-picker',
        'map-autoplay-bgs-checkbox', 'map-bgs-picker', 'map-specify-battleback-checkbox',
        'map-battleback-picker', 'map-battleback1-select', 'map-battleback2-select',
        'map-disable-dashing-checkbox', 'map-parallax-image-select',
        'map-parallax-loop-x-checkbox', 'map-parallax-loop-y-checkbox',
        'map-parallax-sx-input', 'map-parallax-sy-input', 'map-parallax-show-checkbox',
        'map-encounters-list', 'map-note-textarea',
        'map-bgm-track', 'map-bgm-choose-btn', 'map-bgm-levels',
        'map-bgs-track', 'map-bgs-choose-btn', 'map-bgs-levels',
        'map-3d-checkbox', 'map-3d-options', 'map-3d-height-input',
        'map-3d-floor-select', 'map-3d-walls-select', 'map-3d-ceiling-select',
        'map-3d-floor-browse-btn', 'map-3d-walls-browse-btn', 'map-3d-ceiling-browse-btn'
    ];
    for (const id of ids) {
        const matches = modal.split(`id="${id}"`).length - 1;
        assert.equal(matches, 1, `${id} appears exactly once`);
    }
    // The track's levels are chosen in the audio picker, not in the form.
    for (const type of ['bgm', 'bgs']) {
        for (const field of ['volume', 'pitch', 'pan', 'select', 'play-btn']) {
            assert.equal(modal.includes(`id="map-${type}-${field}"`), false, `map-${type}-${field} is gone`);
        }
    }
    // Every number field wears the themed stepper rather than the browser spinner.
    for (const id of ['map-width-input', 'map-height-input', 'map-encounter-steps-input', 'map-3d-height-input',
        'map-3d-camera-pitch', 'map-3d-camera-yaw', 'map-3d-camera-distance', 'map-3d-camera-fov']) {
        assert.match(modal, new RegExp(`class="rr-number-stepper"><input class="rr-number-stepper-input"[^>]+id="${id}"`), id);
        assert.equal((modal.match(new RegExp(`data-target="${id}"`, 'g')) || []).length, 2, id);
    }
    assert.doesNotMatch(modal, /rr-number-stepper-compact/);
    assert.match(controller, /data-map-props-step/);
    assert.match(controller, /input\.stepUp\(\)/);
    assert.match(controller, /input\.stepDown\(\)/);
});

test('collapsible pickers declare display only once, so the checkbox governs them', () => {
    const modal = modalMarkup();
    // A second `display` in the same style attribute silently overrides the
    // first: the battleback picker declared `display: none; … display: grid;`
    // and was therefore always visible regardless of its checkbox.
    for (const id of ['map-bgm-picker', 'map-bgs-picker', 'map-battleback-picker']) {
        const at = modal.indexOf(`id="${id}"`);
        const style = modal.slice(at).match(/style="([^"]*)"/)[1];
        const declarations = style.split(';').filter(part => /^\s*display\s*:/.test(part));
        assert.equal(declarations.length, 1, `${id} declares display once, got: ${style}`);
        assert.match(declarations[0], /display:\s*none/, `${id} starts hidden`);
    }
});

test('a toggled picker is shown with the display mode its own styles expect', () => {
    // Showing a grid-template-columns element as `flex` drops its column sizing.
    assert.doesNotMatch(controller, /map-battleback-picker'\)\.style\.display = [^;]*'flex'/);
    assert.match(controller, /battlebackPicker\.style\.display = battlebackCheckbox\.checked \? 'grid' : 'none'/);
});

test('the body sizes to its content and reflows with the window', () => {
    const start = html.indexOf('<div id="map-properties-modal"');
    const box = html.slice(start, start + 1200);

    // A fixed height left empty space below short content; capping instead lets
    // the dialog shrink to fit and only scroll when it genuinely overflows.
    assert.doesNotMatch(box, /height:\s*85vh/);
    assert.match(box, /max-height:\s*92vh/);
    assert.match(box, /width:\s*min\(96vw, 1150px\)/);

    // Panels are direct children of one column container, not nested inside
    // hand-built left/right wrappers that could not rebalance.
    assert.match(html, /<div class="map-props-columns">/);
    assert.doesNotMatch(modalMarkup(), /<!-- Left Column -->|<!-- Right Column -->/);

    const css = fs.readFileSync(path.join(editorRoot, 'css', 'styles.css'), 'utf8');
    const rule = css.slice(css.indexOf('.map-props-columns {'));
    // Capped at two: General Settings is one indivisible tall panel, so a
    // third column strands a short panel beside a gap instead of balancing.
    assert.match(rule, /columns:\s*340px 2/, 'at most two columns, dropping to one when narrow');
    assert.match(rule, /break-inside:\s*avoid/, 'a panel is never split across columns');
});
