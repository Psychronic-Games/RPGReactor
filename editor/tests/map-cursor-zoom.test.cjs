const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const source = fs.readFileSync(path.join(__dirname, '../src/TilemapManager.js'), 'utf8');

function fixture() {
    const viewport = { width: 800, height: 600 };
    const Manager = vm.runInNewContext(source + '\nTilemapManager', {
        console, document: { getElementById: () => ({ getBoundingClientRect: () => viewport }) }
    });
    const manager = Object.create(Manager.prototype);
    manager.currentMap = { width: 25, height: 25 };
    manager.TILE_SIZE = manager.TILE_WIDTH = manager.TILE_HEIGHT = 48;
    manager.container = { x: 0, y: 0, scale: { x: 1, y: 1, set(x, y) { this.x = x; this.y = y; } } };
    manager.app = { screen: { width: 800, height: 600 }, renderer: {
        resize(width, height) { manager.app.screen = { width, height }; }
    } };
    manager.usesVirtualViewport = () => false;
    return manager;
}

test('zoom preserves cursor coordinates at either map edge and through contain-fit', () => {
    for (const offset of [0, -400]) for (const x of [50, 400, 750]) {
        const m = fixture();
        m.setViewportTransform(offset, offset, 1);
        const world = { x: x - m.container.x, y: 250 - m.container.y };
        for (const scale of [0.9, 0.7, 0.5, 0.7, 1, 1.5]) {
            m.setViewportTransform(x - world.x * scale, 250 - world.y * scale, scale, { preserveAnchor: true });
            m.clampContainerToMap();
            assert.ok(Math.abs((x - m.container.x) / scale - world.x) < 1e-8);
            assert.ok(Math.abs((250 - m.container.y) / scale - world.y) < 1e-8);
        }
    }
});

test('panning is bounded by the margins required by the latest zoom', () => {
    const m = fixture();
    m.setViewportTransform(100, 75, 0.5, { preserveAnchor: true });
    const bounds = m.panBounds();
    m.setViewportTransform(9999, 9999);
    assert.equal(m.container.x, bounds.maxX);
    assert.equal(m.container.y, bounds.maxY);
    m.setViewportTransform(-9999, -9999);
    assert.equal(m.container.x, bounds.minX);
    assert.equal(m.container.y, bounds.minY);
    assert.equal(m.app.screen.width, 600, 'canvas crop follows panning back to the map origin');
    m.setViewportTransform(-100, -100, 1, { preserveAnchor: true });
    assert.equal(m.panBounds().maxX, 0, 'a later interior zoom releases unneeded margins');
    assert.equal(m.panBounds().minX, -400);
});
