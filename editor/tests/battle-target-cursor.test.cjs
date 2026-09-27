/**
 * Targets picked on the battlefield (the HUD hides the enemy list): the list
 * runs left to right as the battlers stand, and every arrow steps round it.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..', '..');

function windowClass() {
    const source = fs.readFileSync(path.join(root, 'runtime', 'reactor_windows.js'), 'utf8');
    const start = source.indexOf('function Window_BattleEnemy()');
    const end = source.indexOf('Window_BattleEnemy.prototype.select = function');
    const context = { SceneManager: { _scene: null }, console };
    context.Window_Selectable = function() {};
    Object.assign(context.Window_Selectable.prototype, {
        initialize() {}, refresh() {}, index() { return this._index; }, maxItems() { return this._enemies.length; },
        smoothSelect(i) { this._index = i; }, cursorRight() { this._stock = 'right'; }, cursorLeft() { this._stock = 'left'; }, cursorDown() {}, cursorUp() {}
    });
    vm.createContext(context);
    vm.runInContext(source.slice(start, end) + '\nthis.Window_BattleEnemy = Window_BattleEnemy;', context);
    return context;
}

test('picked on the field, the targets run as they stand and the arrows wrap both ways', () => {
    const { Window_BattleEnemy } = windowClass();
    const battler = (name, x) => ({ name: () => name, screenX: () => x, screenY: () => 400 });
    const right = battler('right', 800), left = battler('left', 200), middle = battler('middle', 500);
    assert.deepEqual(Window_BattleEnemy.byScreenX([right, left, middle]).map(b => b.name()), ['left', 'middle', 'right']);
    const win = Object.create(Window_BattleEnemy.prototype);
    win._enemies = [left, middle, right]; win._index = 2; win._reactorVisualPick = true;
    win.cursorRight(false);
    assert.equal(win._index, 0, 'right past the last comes round to the first');
    win.cursorLeft(false);
    assert.equal(win._index, 2, 'left past the first comes round to the last');
    win.cursorDown(false); assert.equal(win._index, 0);
    win.cursorUp(false); assert.equal(win._index, 2);
    const stock = Object.create(Window_BattleEnemy.prototype);
    stock._enemies = [left, right]; stock._index = 0;
    stock.cursorRight(true);
    assert.equal(stock._stock, 'right', 'a visible list keeps the stock grid');
    assert.match(fs.readFileSync(path.join(root, 'runtime', 'reactor_ui.js'), 'utf8'), /if \(node\.hideWindow && \(node\.battleWindow === "enemy" \|\| node\.battleWindow === "actor"\)\) win\._reactorVisualPick = true;/, 'the HUD marks a hidden target list');
});
