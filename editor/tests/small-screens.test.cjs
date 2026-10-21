'use strict';
// Small and odd screens: the stock interface layouts stay on the screen at every game resolution a project
// is likely to use, and the editor's small-window rules are in the stylesheet.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const Stock = require('../src/utils/StockInterfaces.js');
const SIZES = [[640, 480], [816, 624], [960, 720], [1024, 576], [1280, 720], [1920, 1080], [2560, 1080]];
const system = (width, height) => ({
    advanced: { screenWidth: width, screenHeight: height, uiAreaWidth: width, uiAreaHeight: height },
    terms: { commands: [] }, menuCommands: [true, true, true, true, true, true],
    title1Name: 'FixtureTitle', title2Name: 'FixtureFrame', gameTitle: 'Fixture RPG', optDrawTitle: true
});
const ANCHORS = { topLeft: [0, 0], top: [0.5, 0], topRight: [1, 0], left: [0, 0.5], center: [0.5, 0.5], right: [1, 0.5], bottomLeft: [0, 1], bottom: [0.5, 1], bottomRight: [1, 1] };
/** A node's rectangle on the screen, as ReactorUI.resolveRect places it under its parents. */
function rectOf(record, node, width, height) {
    const parent = node.parent ? record.nodes.find(other => other.id === node.parent) : null;
    const within = parent ? rectOf(record, parent, width, height) : { x: 0, y: 0, width, height };
    const [ax, ay] = ANCHORS[node.anchor] || [0, 0];
    const w = node.width || 0, h = node.height || 0;
    return { x: Math.round(within.x + within.width * ax - w * ax + (node.x || 0)), y: Math.round(within.y + within.height * ay - h * ay + (node.y || 0)), width: w, height: h };
}
const overlaps = (a, b) => Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x) > 0 && Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y) > 0;

test('no stock layout puts a top-level node off the screen, from 640x480 to 2560x1080', () => {
    for (const [width, height] of SIZES) {
        for (const record of Stock.build({ system: system(width, height) })) {
            for (const node of record.nodes) {
                // A window that follows the acting actor is placed from that actor's slot (and kept on screen) in play.
                if (node.parent || node.followActor || !(node.width > 0 && node.height > 0)) continue;
                const rect = rectOf(record, node, width, height);
                assert.ok(rect.x >= 0 && rect.y >= 0 && rect.x + rect.width <= width && rect.y + rect.height <= height,
                    `${width}x${height}: ${record.name} › ${node.name} leaves the screen ${JSON.stringify(rect)}`);
            }
        }
    }
});

test('the stock Battle HUD keeps its help over its lists and its party commands on the screen at small sizes; from 720 high it is as it was', () => {
    const battle = (width, height) => { const record = Stock.build({ system: system(width, height) }).find(r => r.name === 'Battle'); const named = name => rectOf(record, record.nodes.find(node => node.name === name), width, height); return { record, named }; };
    for (const [width, height] of SIZES) {
        const { named } = battle(width, height);
        for (const list of ['Skills', 'Items', 'Enemy Target']) assert.ok(!overlaps(named('Help'), named(list)), `${width}x${height}: Help covers ${list}`);
        for (const list of ['Skills', 'Items']) assert.ok(named(list).y + named(list).height <= named('Party HUD').y, `${width}x${height}: ${list} runs into the party panels`);
        assert.ok(named('Skills').height >= 108, `${width}x${height}: the skill list keeps three rows`);
    }
    const hd = battle(1280, 720).named, full = battle(1920, 1080).named;
    assert.deepStrictEqual([hd('Help').y, hd('Skills').y, hd('Skills').height, hd('Party Command').x, hd('Party Command').y], [64, 181, 250, 696, 134]);
    assert.deepStrictEqual([full('Help').y, full('Skills').y, full('Skills').height, full('Party Command').x, full('Party Command').y], [64, 541, 250, 1016, 134]);
    // The window that follows the acting actor is clamped to the screen where it is placed.
    const ui = read('runtime/reactor_ui.js');
    assert.match(ui, /x = Math\.max\(0, Math\.min\(x, Graphics\.width - Math\.round\(win\.width \* state\.scale\)\)\);\s+y = Math\.max\(0, Math\.min\(y, Graphics\.height - Math\.round\(win\.height \* state\.scale\)\)\);/);
});

test('the stock Name Input leaves room for the character grid under its box on every screen', () => {
    const grid = 9 * 44 + 24;   // Window_NameInput: nine selectable rows
    for (const [width, height] of SIZES) {
        const record = Stock.build({ system: system(width, height) }).find(r => r.name === 'Name Input');
        const box = rectOf(record, record.nodes.find(node => node.name === 'Name'), width, height);
        assert.ok(box.y >= 0 && box.y + box.height + 8 + grid <= height, `${width}x${height}: the grid would cover the Name box ${JSON.stringify(box)}`);
        const field = record.nodes.find(node => node.name === 'Name field');
        assert.ok(field.x + field.width <= box.width && field.y + field.height <= box.height, `${width}x${height}: the field leaves its box`);
        assert.equal(!!record.nodes.find(node => node.name === 'Face'), box.height > 100, 'the face shows only where the box has room for it');
    }
    const hd = Stock.build({ system: system(1280, 720) }).find(r => r.name === 'Name Input').nodes.find(node => node.name === 'Name');
    assert.deepStrictEqual([hd.y, hd.height], [52, 168], 'from 720 high the stock placement is unchanged');
    // In play the grid stands under the box the field is in, not under the field alone.
    assert.match(read('runtime/reactor_ui.js'), /under = Math\.max\(under, holder\.y \+ holder\.height \* ReactorUI\.shownScale\(holder\)\);[\s\S]{0,200}const y = Math\.min\(under \+ 8, Graphics\.boxHeight - height\);/);
});

test('the stock Main Menu gives the actors room on a narrow screen and keeps its measures from 760 wide', () => {
    const menu = (width, height) => Stock.build({ system: system(width, height) }).find(r => r.name === 'Main Menu');
    const parts = record => ({ commands: record.nodes.find(node => node.name === 'Commands'), panel: record.nodes.find(node => node.rowLayout === 'actorPanel') });
    const small = parts(menu(640, 480)), hd = parts(menu(1280, 720));
    assert.deepStrictEqual([small.commands.width, small.panel.portraitSize, small.panel.rowHeight, small.panel.width], [200, 96, 208, 440]);
    assert.deepStrictEqual([hd.commands.width, hd.panel.portraitSize, hd.panel.rowHeight], [240, 144, 256]);
    assert.equal(small.commands.x + small.commands.width, 640);
});

test('the editor has its small-window rules: the map header wraps, User Interfaces and Action Sequences scroll, the Tilesets column scrolls', () => {
    const css = read('editor/css/styles.css');
    assert.match(css, /@media \(max-width: 1180px\) \{\s+#workspace-tabs \{ height: auto; \}\s+#map-info-content \{ flex-wrap: wrap; height: auto; min-height: 35px;/);
    assert.match(css, /\.rr-ui-workspace > \.database-section\.rr-ui-tree-panel > \.database-section-content \{ overflow-y: auto; \}/);
    assert.match(css, /@container database-detail \(max-width: 620px\) \{\s+\.rr-ui-editor \{ overflow-y: auto; \}/);
    assert.match(css, /@container database-detail \(max-width: 760px\) \{\s+\.rr-sequence-editor \{ overflow-y: auto; \}[\s\S]{0,900}\.rr-sequence-inspector-card \{ grid-column: 2; grid-row: 2; \}/);
    assert.match(css, /@media \(max-height: 700px\) \{\s+\.rr-sequence-editor \{ overflow-y: auto; \}/);
    const tilesets = read('editor/src/database/DatabaseTilesetEditor.js');
    assert.match(tilesets, /class="rr-tileset-side" style="[^"]*min-height: 0; overflow-y: auto;"/);
    assert.match(tilesets, /<div style="flex: 1 0 auto; display: flex; flex-direction: column;">/);
});

test('the Action Sequence preview stands its camera back on a narrow stage and leaves a wide one alone', () => {
    const source = read('editor/src/database/DatabaseActionSequenceEditor.js');
    const body = source.match(/stageFit\(view\)\{([^\n]+)\}\n/);
    assert.ok(body, 'stageFit is there');
    const stageFit = new Function('view', body[1]);
    assert.equal(stageFit({ width: 886, height: 560, camera: {} }), 1, 'the stage of a 1920x1080 editor is unchanged');
    assert.equal(stageFit({ width: 1280, height: 720, camera: {} }), 1);
    assert.ok(Math.abs(stageFit({ width: 360, height: 500, camera: {} }) - 1.5 / 0.72) < 1e-9, 'a narrow stage stands back by its aspect');
    assert.equal(stageFit({ width: 100, height: 900, camera: {} }), 4, 'bounded');
    assert.equal(stageFit({ width: 360, height: 500, camera: { isOrthographicCamera: true } }), 1, 'the layout view fits by its own rule');
    assert.match(source, /distance:this\.controls\.distance\*this\.stageFit\(view\)/);
});
