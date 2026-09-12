const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const editorRoot = path.join(__dirname, '..');

/**
 * Just enough PIXI for createTilemapContainer() and renderPreviewBackground():
 * containers that destroy their children, and a Graphics whose drawing
 * context is gone once destroyed, the way v8 throws on a destroyed object.
 */
function createPixiStub() {
    let graphicsMade = 0;
    class Container {
        constructor() { this.children = []; this.parent = null; this.destroyed = false; }
        addChild(child) { if (child.parent) child.parent.removeChild(child); child.parent = this; this.children.push(child); return child; }
        removeChild(child) { const at = this.children.indexOf(child); if (at >= 0) this.children.splice(at, 1); child.parent = null; return child; }
        removeChildren() { const removed = this.children; for (const child of removed) child.parent = null; this.children = []; return removed; }
        destroy(options) {
            this.destroyed = true;
            if (options?.children) for (const child of this.children) child.destroy(options);
            this.children = [];
        }
    }
    class Graphics extends Container {
        constructor() { super(); graphicsMade++; this.context = {}; }
        clear() { if (!this.context) throw new TypeError("Cannot read properties of null (reading 'clear')"); return this; }
        rect() { return this; }
        fill() { return this; }
        destroy(options) { super.destroy(options); this.context = null; }
    }
    return { Container, Graphics, made: () => graphicsMade };
}

function loadTilemapManager(PIXI) {
    const source = fs.readFileSync(path.join(editorRoot, 'src', 'TilemapManager.js'), 'utf8');
    const stage = new PIXI.Container();
    const app = { stage, renderer: {} };
    const TilemapManager = vm.runInNewContext(`${source}\nTilemapManager;`, { console, window: {}, PIXI, app, Map, Set });
    return { TilemapManager, app };
}

test('the preview underlay survives the tilemap container being rebuilt for the next map', () => {
    const PIXI = createPixiStub();
    const { TilemapManager, app } = loadTilemapManager(PIXI);
    const manager = new TilemapManager(app, '/project', {});
    manager.TILE_WIDTH = manager.TILE_HEIGHT = 48;
    // Panning wires DOM listeners onto #canvas-container; there is no DOM here.
    manager.setupPanning = () => {};

    manager.createTilemapContainer();
    manager.renderPreviewBackground(10, 8);
    const first = manager._previewBackground;
    assert.equal(first.parent, manager.layers.checkerboard);
    assert.equal(PIXI.made(), 1);

    // Loading another map destroys the container and everything in it.
    manager.createTilemapContainer();
    assert.equal(first.destroyed, true, 'the old container took the underlay down with it');
    assert.doesNotThrow(() => manager.renderPreviewBackground(12, 12));
    assert.notEqual(manager._previewBackground, first, 'a destroyed Graphics is replaced, not reused');
    assert.equal(manager._previewBackground.parent, manager.layers.checkerboard);
    assert.equal(PIXI.made(), 2);

    // A repaint on the same map reuses the live Graphics.
    manager.renderPreviewBackground(12, 12);
    assert.equal(PIXI.made(), 2);
});
