const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const workspaceRoot = path.resolve(__dirname, '..', '..');

function source(file) {
    return fs.readFileSync(path.join(workspaceRoot, file), 'utf8');
}

test('MOG Treasure Popup contents bypass only its incompatible MZ client clip', () => {
    const compat = source('runtime/reactor_mv_compat.js');
    const start = compat.indexOf('    function installFinalTreasurePopupCompatibility()');
    const end = compat.indexOf('\n    function installFinalAnimationCompatibility()', start);
    assert.ok(start >= 0 && end > start);

    function Window_DragonTreasure() {}
    Window_DragonTreasure.prototype.initialize = function() {
        const window = this;
        this._clientArea = {
            removeChild(child) {
                child.parent = null;
            }
        };
        this._windowContentsSprite = {
            parent: this._clientArea,
            move(x, y) {
                this.x = x;
                this.y = y;
            }
        };
        this.addChild = function(child) {
            child.parent = window;
        };
    };
    const context = {
        Imported: { MOG_TreasurePopup: true },
        Window_DragonTreasure
    };
    const install = vm.runInNewContext(`(function() {
        const global = globalThis;
        ${compat.slice(start, end)}
        return installFinalTreasurePopupCompatibility;
    })()`, context);
    install();

    const popup = new Window_DragonTreasure();
    popup.initialize(0, 0, 192, 32);
    assert.equal(popup._windowContentsSprite.parent, popup);
    assert.equal(popup._windowContentsSprite.x, 0);
    assert.equal(popup._windowContentsSprite.y, 0);
    assert.equal(Window_DragonTreasure.prototype.initialize.__reactorTreasureContents, true);
});

test('PIXI 8 tiling sprites accept legacy parallax children without warning state', () => {
    const compat = source('runtime/libs/pixi_compat.js');
    const start = compat.indexOf('    if (PIXI.TilingSprite && PIXI.TilingSprite.prototype && PIXI.TextureSource)');
    const end = compat.indexOf('\n\n    // -------------------------------------------------------------------------', start);
    assert.ok(start >= 0 && end > start);

    class TilingSprite {
        constructor() {
            this.allowChildren = false;
        }
    }
    const PIXI = { TilingSprite, TextureSource: function TextureSource() {} };
    vm.runInNewContext(compat.slice(start, end), { PIXI, console, compatLog() {} });

    const parallax = new TilingSprite();
    assert.equal(parallax.allowChildren, true);
    assert.equal(Object.hasOwn(parallax, 'allowChildren'), false);
});

test('VideoSource ignores intentional empty-src teardown but logs real media failures', () => {
    const compat = source('runtime/libs/pixi_compat.js');
    const start = compat.indexOf('    if (PIXI.Texture && PIXI.VideoSource && !PIXI.Texture.__videoFromWrapped)');
    const end = compat.indexOf('\n\n    // -------------------------------------------------------------------------', start);
    assert.ok(start >= 0 && end > start);

    class HTMLVideoElement {
        constructor(src) {
            this.srcAttribute = src;
            this.error = { code: 4 };
        }
        getAttribute(name) {
            return name === 'src' ? this.srcAttribute : null;
        }
        querySelector() {
            return null;
        }
    }
    class VideoSource {
        constructor(options) {
            this.resource = options.resource;
        }
        on(name, handler) {
            if (name === 'error') this.errorHandler = handler;
        }
    }
    class Texture {
        constructor(options) {
            this.source = options.source;
        }
        static from() {
            return { original: true };
        }
    }
    const errors = [];
    const PIXI = { Texture, VideoSource };
    vm.runInNewContext(compat.slice(start, end), {
        PIXI,
        HTMLVideoElement,
        console: { error: (...args) => errors.push(args) }
    });

    const teardownVideo = new HTMLVideoElement('');
    PIXI.Texture.from(teardownVideo).source.errorHandler({ type: 'error' });
    assert.equal(errors.length, 0);

    const missingVideo = new HTMLVideoElement('movies/missing.mp4');
    PIXI.Texture.from(missingVideo).source.errorHandler({ type: 'error' });
    assert.equal(errors.length, 1);
});

test('MOG actors delegate side-view damage popups to the final Victor path', () => {
    const compat = source('runtime/reactor_mv_compat.js');
    const start = compat.indexOf('    function installFinalDamagePopupCompatibility()');
    const end = compat.indexOf('\n    function installFinalLeTBSAiPerformance()', start);
    assert.ok(start >= 0 && end > start);

    let baseCalls = 0;
    let mogCalls = 0;
    function Sprite_Battler() {}
    Sprite_Battler.prototype.setupDamagePopup = function() {
        baseCalls++;
    };
    function Sprite_Actor() {}
    Sprite_Actor.prototype = Object.create(Sprite_Battler.prototype);
    Sprite_Actor.prototype.constructor = Sprite_Actor;
    const _alias_mog_bhud_sprt_actor_setupDamagePopup = function() {};
    Sprite_Actor.prototype.setupDamagePopup = function() {
        // Keep MOG's alias name in the function fingerprint used by the shim.
        void _alias_mog_bhud_sprt_actor_setupDamagePopup;
        mogCalls++;
    };

    const context = {
        Imported: { MOG_BattleHud: true, 'VE - Damge Popup': '2.04' },
        Sprite_Actor,
        Sprite_Battler,
        $gameSystem: { isSideView: () => true }
    };
    const install = vm.runInNewContext(`(function() {
        const global = globalThis;
        ${compat.slice(start, end)}
        return installFinalDamagePopupCompatibility;
    })()`, context);
    install();

    const actor = new Sprite_Actor();
    actor._sprite_face = {};
    actor.setupDamagePopup();
    assert.equal(baseCalls, 1);
    assert.equal(mogCalls, 0);

    context.$gameSystem.isSideView = () => false;
    actor.setupDamagePopup();
    assert.equal(baseCalls, 1);
    assert.equal(mogCalls, 1);
    assert.equal(Sprite_Actor.prototype.setupDamagePopup.__mvCompatDynamicDamagePopup, true);
});

test('shipped runtime contains the visual compatibility fixes', () => {
    const projectCompat = source('runtime/reactor_mv_compat.js');
    const projectPixiCompat = source('runtime/libs/pixi_compat.js');

    assert.match(projectCompat, /installFinalTreasurePopupCompatibility\(\)/);
    assert.match(projectCompat, /installFinalDamagePopupCompatibility\(\)/);
    assert.match(projectPixiCompat, /PIXI\.TilingSprite\.prototype, "allowChildren"/);
    assert.match(projectPixiCompat, /directSource === null \|\| directSource === ""/);
});
