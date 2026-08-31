const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const editorRoot = path.resolve(__dirname, '..');
const system1Path = path.join(editorRoot, 'src', 'database', 'DatabaseSystem1Editor.js');
const system1Source = fs.readFileSync(system1Path, 'utf8');

function loadEditor(extras = {}) {
    const sandbox = Object.assign({
        console,
        require,
        window: {},
        document: {},
        requestAnimationFrame() {}
    }, extras);
    return vm.runInNewContext(`${system1Source}\nDatabaseSystem1Editor;`, sandbox);
}

function fakeElement(tag) {
    return {
        tagName: tag,
        style: {},
        children: [],
        appendChild(child) { this.children.push(child); }
    };
}

function fakeProjectManager(projectPath = 'C:\\proj') {
    return { getCurrentProject: () => ({ path: projectPath }) };
}

test('both title screen layers are editable and reach their own System field', () => {
    // The lower layer is img/titles1 and the upper layer is img/titles2; a row
    // and a picker button exist for each, tagged with the layer they edit.
    assert.equal((system1Source.match(/data-title-layer="\$\{layer\}"/g) || []).length, 1);
    assert.match(system1Source, /titleLayerRow\(1, tt\('Lower Layer:'\), system\.title1Name \|\| ''\)/);
    assert.match(system1Source, /titleLayerRow\(2, tt\('Upper Layer:'\), system\.title2Name \|\| ''\)/);
    assert.match(
        system1Source,
        /this\.showTitleImagePicker\(system, Number\(button\.dataset\.titleLayer\) \|\| 1\)/
    );

    // The picker writes the layer it was opened for rather than title1Name.
    assert.match(system1Source, /showTitleImagePicker\(system, layer = 1\) \{/);
    assert.match(system1Source, /const field = `title\$\{edited\}Name`/);
    assert.match(system1Source, /const folder = `titles\$\{edited\}`/);
    assert.match(system1Source, /system\[field\] = selectedFile;/);
    assert.equal(system1Source.includes('system.title1Name = selectedFile'), false);

    // Either layer may be cleared: Scene_Title loads an empty name as the
    // empty bitmap, so (None) has to be reachable.
    assert.match(system1Source, /leadingItem: \{\s*\n\s*label: tt\('\(None\)'\),/);

    // A project with no img/titles2 is an ordinary project. The picker must
    // not turn a missing folder into an alert and a dead end.
    assert.equal(/titles1 folder not found/.test(system1Source), false);
});

test('the title preview stacks titles2 over titles1 at the game resolution', () => {
    const created = [];
    const DatabaseSystem1Editor = loadEditor({
        document: { createElement: tag => { const el = fakeElement(tag); created.push(el); return el; } },
        RRAssetFiles: {
            imageUrlFor: (rootDir, name) => `file:///${path.basename(rootDir)}/${name}.png`
        }
    });

    const editor = Object.create(DatabaseSystem1Editor.prototype);
    editor.projectManager = fakeProjectManager();

    const box = Object.assign(fakeElement('div'), { replaceChildren() { this.children = []; } });
    const container = { querySelector: selector => (selector === '.system-title-preview' ? box : null) };
    const system = {
        title1Name: 'CUSTOM/Backdrop',
        title2Name: 'CUSTOM/Frame',
        advanced: { screenWidth: 1280, screenHeight: 720 }
    };

    editor.renderTitlePreview(container, system);

    assert.equal(box.style.aspectRatio, '1280 / 720');
    assert.deepEqual(
        box.children.map(child => child.src),
        ['file:///titles1/CUSTOM/Backdrop.png', 'file:///titles2/CUSTOM/Frame.png'],
        'titles1 is appended first so titles2 paints over it, as Scene_Title draws them'
    );

    // An unset upper layer simply is not drawn.
    box.replaceChildren();
    editor.renderTitlePreview(container, { title1Name: 'Backdrop', title2Name: '' });
    assert.deepEqual(box.children.map(child => child.src), ['file:///titles1/Backdrop.png']);
    assert.equal(box.style.aspectRatio, '816 / 624', 'falls back to the default resolution');
});
