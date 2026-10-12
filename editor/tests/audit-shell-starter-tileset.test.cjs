/**
 * A new project's starter tileset marks tile 0 as a star (0x10), as RPG Maker
 * writes it. With 0 there, an empty upper layer counted as passable in every
 * direction and every wall on a map using the tileset could be walked through.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

test('the starter tileset\'s tile 0 is a star and nothing else is flagged', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'ProjectManager.js'), 'utf8');
    const ProjectManager = vm.runInNewContext(`${source}\nProjectManager;`, { console, process, require, nw: {} });
    const tileset = Object.create(ProjectManager.prototype).getStarterTileset();
    assert.equal(tileset.flags.length, 8192);
    assert.equal(tileset.flags[0], 0x10);
    assert.ok(tileset.flags.slice(1).every(flag => flag === 0));
});
