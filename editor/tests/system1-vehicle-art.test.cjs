const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const editorRoot = path.resolve(__dirname, '..');
const source = fs.readFileSync(
    path.join(editorRoot, 'src', 'database', 'DatabaseSystem1Editor.js'), 'utf8');

/** The stub Image carries no dimensions until the test supplies them. */
function drawWith(system, vehicleKey, width, height) {
    const draws = [];
    const context = {
        clearRect() {}, drawImage(...args) { draws.push(args); }, imageSmoothingEnabled: true
    };
    const canvas = { width: 40, height: 40, getContext: () => context };
    let pending = null;
    const sandbox = {
        console,
        require,
        Image: class {
            constructor() { this.width = width; this.height = height; }
            set src(value) { this._src = value; pending = () => this.onload && this.onload(); }
            get src() { return this._src; }
        },
        RRAssetFiles: {
            isBigCharacter: name => path.basename(String(name)).startsWith('$'),
            urlFor: (dir, name) => `file:///${name}.png`
        },
        rrEscapeHtml: value => String(value),
        document: { getElementById: () => null, createElement: () => ({ style: {}, appendChild() {} }) },
        window: {}
    };
    const Editor = vm.runInNewContext(`${source}\nDatabaseSystem1Editor;`, sandbox);
    const editor = Object.create(Editor.prototype);
    editor.projectManager = { getCurrentProject: () => ({ path: 'C:/Project' }) };
    editor.renderVehiclePreview({
        querySelector: selector => (selector.includes(`data-vehicle="${vehicleKey}"`) ? canvas : null)
    }, system, vehicleKey);
    if (pending) pending();
    return draws;
}

test('a vehicle row draws the sheet cell its stored index names', () => {
    // An eight-character sheet is 12 columns by 8 rows; index 5 is the second
    // character of the second block row, and the row shows it facing down,
    // mid-step -- column 1 of its own 3x4 block.
    const system = { boat: { characterName: 'Vehicle', characterIndex: 5 } };
    const draws = drawWith(system, 'boat', 576, 384);
    assert.equal(draws.length, 1, 'one cell is drawn');
    const [, sx, sy, sw, sh] = draws[0];
    assert.equal(sw, 48, 'a frame is a twelfth of the sheet width');
    assert.equal(sh, 48, 'and an eighth of its height');
    assert.equal(sx, ((5 % 4) * 3 + 1) * 48, 'the middle column of block 5');
    assert.equal(sy, Math.floor(5 / 4) * 4 * 48, 'on the second block row');
});

test('a $ sheet holds one character, so its index is ignored', () => {
    // `$Vehicle` is 3 columns by 4 rows and holds one character. A stored index
    // would otherwise read a cell that is not there.
    const system = { airship: { characterName: '$Vehicle', characterIndex: 6 } };
    const draws = drawWith(system, 'airship', 144, 192);
    assert.equal(draws.length, 1);
    const [, sx, sy, sw, sh] = draws[0];
    assert.equal(sw, 48);
    assert.equal(sh, 48);
    assert.equal(sx, 48, 'the middle of the only block');
    assert.equal(sy, 0, 'and its top row');
});

test('an unset vehicle draws nothing rather than guessing a sheet', () => {
    assert.deepEqual(drawWith({ ship: { characterName: '', characterIndex: 0 } }, 'ship', 576, 384), []);
    assert.deepEqual(drawWith({}, 'ship', 576, 384), []);
});

test('the vehicle picker stores the cell that was clicked, not a typed number', () => {
    // It used to be a prompt() asking for a number 0-7, against a sheet whose
    // dialog had already closed.
    assert.equal(/prompt\(tt\('Enter character index/.test(source), false,
        'the typed index is gone');
    assert.match(source, /new CharacterGraphicPicker\(this\.projectManager\)\.show\(/);

    let picked = null;
    const sandbox = {
        console,
        require,
        CharacterGraphicPicker: class {
            constructor(projectManager) { this.projectManager = projectManager; }
            show(name, index, pattern, direction, callback) {
                picked = { name, index, pattern, direction };
                callback({ characterName: 'Vehicle', characterIndex: 3, pattern: 2, direction: 8 });
            }
        },
        rrEscapeHtml: value => String(value),
        document: { getElementById: () => null },
        window: {}
    };
    const Editor = vm.runInNewContext(`${source}\nDatabaseSystem1Editor;`, sandbox);
    const editor = Object.create(Editor.prototype);
    editor.projectManager = { getCurrentProject: () => ({ path: 'C:/Project' }) };

    const system = { boat: { characterName: 'Old', characterIndex: 1, startMapId: 4, startX: 5, startY: 6 } };
    editor.showVehicleImagePicker(system, 'boat');

    assert.deepEqual(picked, { name: 'Old', index: 1, pattern: 1, direction: 2 },
        'the picker opens on the cell the vehicle already uses');
    assert.equal(system.boat.characterName, 'Vehicle');
    assert.equal(system.boat.characterIndex, 3, 'the clicked cell is stored');
    assert.equal(system.boat.startMapId, 4, 'the start position is left alone');
});

test('a vehicle with no entry at all is created rather than thrown on', () => {
    const sandbox = {
        console,
        require,
        CharacterGraphicPicker: class {
            show(name, index, pattern, direction, callback) {
                callback({ characterName: 'Ship', characterIndex: 2 });
            }
        },
        rrEscapeHtml: value => String(value),
        document: { getElementById: () => null },
        window: {}
    };
    const Editor = vm.runInNewContext(`${source}\nDatabaseSystem1Editor;`, sandbox);
    const editor = Object.create(Editor.prototype);
    editor.projectManager = { getCurrentProject: () => ({ path: 'C:/Project' }) };

    const system = {};
    editor.showVehicleImagePicker(system, 'ship');
    assert.equal(system.ship.characterName, 'Ship');
    assert.equal(system.ship.characterIndex, 2);
    assert.equal(system.ship.startMapId, 0, 'the rest of the vehicle record is scaffolded');
});

test('every vehicle row carries a canvas for its own sprite', () => {
    assert.match(source, /class="vehicle-sprite-preview" data-vehicle="\$\{key\}"/);
    assert.match(source, /\['boat', 'ship', 'airship'\]\.forEach\(key => this\.renderVehiclePreview\(/);
});
