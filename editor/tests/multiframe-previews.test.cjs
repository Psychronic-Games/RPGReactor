const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const editor = path.resolve(__dirname, '..');

function previews({ name, width, height, system = {} }) {
    const draws = [], timers = [];
    const ctx = { clearRect() {}, drawImage(img, ...args) { draws.push(args.slice(0, 4)); } };
    const canvas = { isConnected: true, width: 160, height: 180 };
    class Image {
        constructor() { Object.assign(this, { width, height, complete: true }); }
        set src(value) { this.onload?.(); }
    }
    class Texture {
        constructor(options) { Object.assign(this, options); }
        static from(img) { return { source: img }; }
    }
    class Sprite {
        constructor(texture) { this.texture = texture; this.scale = { set() {} }; }
    }
    const projectController = { currentProject: { path: '/unused' } };
    const context = vm.createContext({
        window: { reactor: { databaseManager: { data: { system } } } }, require, Image,
        console: { log() {}, error() {} }, RRVehicles: { vehicleOf: () => null },
        PIXI: { Texture, Sprite, Rectangle: class { constructor(x, y, width, height) { Object.assign(this, { x, y, width, height }); } } },
        setInterval(fn) { timers.push(fn); return timers.length; }, clearInterval() {}
    });
    vm.runInContext(fs.readFileSync(path.join(editor, 'src/utils/AssetFiles.js'), 'utf8'), context);
    const Manager = vm.runInContext(fs.readFileSync(path.join(editor, 'src/EventManager.js'), 'utf8') + '\nEventManager;', context);
    const Page = vm.runInContext(fs.readFileSync(path.join(editor, 'src/event/EventPageEditor.js'), 'utf8') + '\nEventPageEditor;', context);
    const manager = Object.assign(Object.create(Manager.prototype), { projectController });
    const page = Object.assign(Object.create(Page.prototype), {
        projectController, parentEditor: { currentEvent: {}, currentMap: {} },
        _disposeModelPreview() {}, _redrawOnResize() {}, _fitPreviewCanvas: () => ctx,
        pageModelSpec: () => null, vehicleModelSpec: () => null, _showUnitLookNote() {}
    });
    return {
        marker(image) { return manager.createCharacterSprite({ characterName: name, ...image })?.texture.frame; },
        picture(image, animate = false) {
            draws.length = 0;
            page.renderCharacterPreview({ querySelector: () => canvas }, { image: { characterName: name, ...image }, stepAnime: animate });
            return draws;
        },
        tick() { timers.at(-1)(); }
    };
}

test('event dialog and map marker crop one tagged frame, including frame zero and later blocks', () => {
    const ui = previews({ name: '$Alien[8D][8F]', width: 4608, height: 1152 });
    for (const [index, pattern, direction, expected] of [
        [0, 0, 2, [0, 0, 144, 144]],
        [0, 7, 2, [1008, 0, 144, 144]],
        [5, 7, 6, [2160, 864, 144, 144]]
    ]) {
        const image = { characterIndex: index, pattern, direction };
        const frame = ui.marker(image);
        assert.deepEqual([frame.x, frame.y, frame.width, frame.height], expected);
        assert.deepEqual(ui.picture(image), [expected]);
    }
});

test('event previews preserve legacy opt-out, ordinary sheets, and single-direction prop rows', () => {
    for (const [options, expected] of [
        [{ name: '$Alien[8D][8F]', width: 4608, height: 1152, system: { rrMultiFrames: false } }, [768, 288, 384, 144]],
        [{ name: 'People', width: 576, height: 384 }, [96, 96, 48, 48]],
        [{ name: '!$Prop[1D][8F]', width: 512, height: 64 }, [128, 0, 64, 64]]
    ]) {
        const ui = previews(options), image = { characterIndex: 0, pattern: 2, direction: 6 };
        const frame = ui.marker(image);
        assert.deepEqual([frame.x, frame.y, frame.width, frame.height], expected);
        assert.deepEqual(ui.picture(image), [expected]);
    }
});

test('event dialog stepping previews all eight frames and retains stock back-and-forth stepping', () => {
    for (const [options, cycle] of [
        [{ name: '$Alien[8D][8F]', width: 4608, height: 1152 }, [0, 1, 2, 3, 4, 5, 6, 7, 0]],
        [{ name: 'People', width: 576, height: 384 }, [1, 0, 1, 2, 1]]
    ]) {
        const ui = previews(options), draws = ui.picture({ characterIndex: 0, pattern: 0, direction: 2 }, true);
        for (let i = 1; i < cycle.length; i++) ui.tick();
        assert.deepEqual(draws.map(frame => frame[0] / frame[2]), cycle);
    }
});
