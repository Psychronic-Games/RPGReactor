/*:
 * @target MZ
 * @plugindesc Super Simple Mouse Script (VX Ace), for imported games
 * @author Shaz, Near Fantastica, SephirothSpawn, Amaranth Games; ported for RPG Reactor
 * @url https://github.com/Psychronic-Games/RPG-Reactor
 *
 * @help RR_ShazMouse.js
 *
 * The game's mouse: an icon from the icon set follows the pointer in place of
 * the system cursor, and over an event whose page has a comment
 *   <mouse icon [x y] [name]>
 * it turns into that icon (with the name beside it); a click on the event
 * walks the player to the tile x, y from it. <autoactivate> starts the event
 * on a click without walking to it. Clicking and window selection are the
 * engine's own.
 *
 * The mouse can be switched off (then the system cursor shows and clicks do
 * nothing); with the game's Mouse Switch scripts, a switch mirrors it.
 *   window.rrMouse.setEnabled(bool)   .isEnabled()
 *   window.rrMouse.position()         [x, y] on the screen
 *   window.rrMouse.trigger(button)    0 left, 1 right
 *   window.rrMouse.showSystemCursor(1 | 0)
 *
 * Installed by File › Import Project… when the imported game carried the
 * original script; its settings were read from the game's copy.
 *
 * @param icons
 * @type multiline_string
 * @default {"cursor":0}
 * @desc JSON: keyword → icon index. The keyword is what <mouse …> names.
 *
 * @param defaultIcon
 * @default cursor
 *
 * @param switchId
 * @text Mirroring switch
 * @type switch
 * @default 0
 */
(() => {
    'use strict';
    const params = PluginManager.parameters('RR_ShazMouse');
    let ICONS = {};
    try { ICONS = JSON.parse(params.icons || '{}') || {}; } catch (_) { ICONS = {}; }
    const DEFAULT = String(params.defaultIcon || 'cursor');
    const SWITCH = Number(params.switchId) || 0;

    let systemCursor = false;
    const applyCursor = () => {
        const canvas = document.querySelector('#gameCanvas') || (Graphics._app && Graphics._app.view);
        if (canvas) canvas.style.cursor = mouse.isEnabled() && !systemCursor ? 'none' : '';
    };
    const mouse = window.rrMouse = {
        isEnabled() { return !$gameSystem || $gameSystem._rrMouseEnabled !== false; },
        setEnabled(value) {
            if ($gameSystem) $gameSystem._rrMouseEnabled = !!value;
            if (SWITCH > 0 && $gameSwitches) $gameSwitches.setValue(SWITCH, !!value);
            applyCursor();
        },
        position() { return [TouchInput.x, TouchInput.y]; },
        trigger(button = 0) { return mouse.isEnabled() && (Number(button) === 1 ? _isCancelled.call(TouchInput) : Number(button) === 0 ? _isTriggered.call(TouchInput) : false); },
        repeat(button = 0) { return mouse.isEnabled() && Number(button) === 0 && _isRepeated.call(TouchInput); },
        showSystemCursor(show) { systemCursor = Number(show) === 1; applyCursor(); }
    };
    // The Options screen's Toggle Mouse, as the game's edited Yanfly script did it.
    mouse.toggleFromOptions = function() {
        if (SWITCH > 0 && $gameSwitches.value(SWITCH)) { mouse.setEnabled(true); mouse.showSystemCursor(0); $gameSwitches.setValue(SWITCH, false); }
        else { mouse.setEnabled(false); mouse.showSystemCursor(1); if (SWITCH > 0) $gameSwitches.setValue(SWITCH, true); }
    };

    // Switched off, the mouse does nothing at all.
    const _isTriggered = TouchInput.isTriggered, _isCancelled = TouchInput.isCancelled, _isRepeated = TouchInput.isRepeated;
    for (const name of ['isPressed', 'isTriggered', 'isRepeated', 'isLongPressed', 'isCancelled', 'isClicked', 'isMoved', 'isHovered', 'isReleased']) {
        const base = TouchInput[name];
        if (typeof base !== 'function') continue;
        TouchInput[name] = function() { return mouse.isEnabled() ? base.apply(this, arguments) : false; };
    }

    // A new game starts with the mouse on; a loaded one follows its switch, as Mouse Switch did.
    const _setupNewGame = DataManager.setupNewGame;
    DataManager.setupNewGame = function() {
        _setupNewGame.call(this);
        mouse.setEnabled(true);
    };
    const _extractSaveContents = DataManager.extractSaveContents;
    DataManager.extractSaveContents = function(contents) {
        _extractSaveContents.call(this, contents);
        if (SWITCH > 0) $gameSystem._rrMouseEnabled = $gameSwitches.value(SWITCH);
        applyCursor();
    };

    //-------------------------------------------------------------------------
    // Event pages: <mouse icon [x y] [name]> and <autoactivate>
    //-------------------------------------------------------------------------
    const _setupPageSettings = Game_Event.prototype.setupPageSettings;
    Game_Event.prototype.setupPageSettings = function() {
        _setupPageSettings.call(this);
        this._rrMouse = null;
        for (const c of this.list()) {
            if (c.code !== 108 && c.code !== 408) continue;
            const text = String(c.parameters[0]);
            const m = /<mouse (.*)>/i.exec(text);
            if (m) {
                const parts = m[1].split(' ').filter(Boolean);
                const icon = parts.shift();
                let offset = [0, 0];
                if (parts.length > 1 && /\d+/.test(parts[0]) && /\d+/.test(parts[1])) offset = [Number(parts.shift()), Number(parts.shift())];
                this._rrMouse = Object.assign(this._rrMouse || {}, { icon, offset, text: parts.length ? parts.join(' ') : null });
            } else if (/<autoactivate>/.test(text)) {
                this._rrMouse = Object.assign(this._rrMouse || { offset: [0, 0] }, { autoactivate: true });
            }
        }
    };
    const _clearPageSettings = Game_Event.prototype.clearPageSettings;
    Game_Event.prototype.clearPageSettings = function() {
        _clearPageSettings.call(this);
        this._rrMouse = null;
    };
    // The event under a tile: one standing there, or a tall one standing on the tile below.
    Game_Map.prototype.rrMouseEventAt = function(x, y) {
        const list = this.eventsXy(x, y).concat(this.eventsXy(x, y + 1)).sort((a, b) => b.y - a.y);
        return list.find(e => e.pos(x, y) || (e.pos(x, y + 1) && e.rrMouseTall && e.rrMouseTall())) || null;
    };
    Game_Event.prototype.rrMouseTall = function() {
        const bitmap = this.characterName() ? ImageManager.loadCharacter(this.characterName()) : null;
        if (!bitmap || !bitmap.isReady()) return false;
        const big = ImageManager.isBigCharacter(this.characterName());
        return (big ? bitmap.height / 4 : bitmap.height / 8) > 32;
    };

    const _processMapTouch = Scene_Map.prototype.processMapTouch;
    Scene_Map.prototype.processMapTouch = function() {
        if (mouse.isEnabled() && TouchInput.isTriggered() && $gameMap.isEventRunning() === false) {
            const x = $gameMap.canvasToMapX(TouchInput.x), y = $gameMap.canvasToMapY(TouchInput.y);
            const event = $gameMap.rrMouseEventAt(x, y);
            const m = event && event._rrMouse;
            if (m && m.autoactivate) { event.start(); return; }
            if (m && (m.offset[0] || m.offset[1])) {
                $gameTemp.setDestination(event.x + m.offset[0], event.y + m.offset[1]);
                return;
            }
        }
        _processMapTouch.call(this);
    };

    //-------------------------------------------------------------------------
    // The cursor
    //-------------------------------------------------------------------------
    function Sprite_RRMouse() { this.initialize(...arguments); }
    Sprite_RRMouse.prototype = Object.create(Sprite.prototype);
    Sprite_RRMouse.prototype.constructor = Sprite_RRMouse;
    Sprite_RRMouse.prototype.initialize = function() {
        Sprite.prototype.initialize.call(this, new Bitmap(24, 32));
        this._key = null;
        this.setIcon(DEFAULT, null);
    };
    Sprite_RRMouse.prototype.setIcon = function(icon, text) {
        const key = icon + '|' + (text || '');
        if (key === this._key) return;
        this._key = key;
        const index = Number(ICONS[String(icon).toLowerCase()] ?? ICONS[DEFAULT] ?? 0);
        const set = ImageManager.loadSystem('IconSet');
        const draw = () => {
            const iw = ImageManager.iconWidth, ih = ImageManager.iconHeight;
            const sx = (index % 16) * iw, sy = Math.floor(index / 16) * ih;
            if (!text) {
                this.bitmap = new Bitmap(iw, 32);
                this.bitmap.blt(set, sx, sy, iw, ih, 0, 0);
                return;
            }
            const measure = new Bitmap(1, 1);
            measure.fontFace = $gameSystem ? $gameSystem.mainFontFace() : measure.fontFace;
            measure.fontSize = $gameSystem ? $gameSystem.mainFontSize() : measure.fontSize;
            const w = Math.ceil(measure.measureTextWidth(text)), h = measure.fontSize;
            const b = new Bitmap(iw + 2 + w, Math.max(32, h + 2));
            b.fontFace = measure.fontFace;
            b.fontSize = measure.fontSize;
            // Near the right edge the name goes to the left of the icon.
            if (this.x + iw + 2 + w > Graphics.width) { b.drawText(text, 0, 0, w, h); b.blt(set, sx, sy, iw, ih, w, 0); }
            else { b.blt(set, sx, sy, iw, ih, 0, 0); b.drawText(text, iw + 2, 0, w, h); }
            this.bitmap = b;
        };
        if (set.isReady()) draw(); else set.addLoadListener(draw);
    };
    Sprite_RRMouse.prototype.update = function() {
        Sprite.prototype.update.call(this);
        this.visible = mouse.isEnabled() && !systemCursor && inside;
        if (!this.visible) return;
        let icon = DEFAULT, text = null;
        const scene = SceneManager._scene;
        if (scene instanceof Scene_Map && $gameMap) {
            const event = $gameMap.rrMouseEventAt($gameMap.canvasToMapX(TouchInput.x), $gameMap.canvasToMapY(TouchInput.y));
            if (event && event._rrMouse && (event._rrMouse.icon || event._rrMouse.text)) { icon = event._rrMouse.icon || DEFAULT; text = event._rrMouse.text; }
        }
        this.setIcon(icon, text);
        this.x = icon === DEFAULT ? TouchInput.x - 4 : Math.min(TouchInput.x - 4, Graphics.width - this.bitmap.width);
        this.y = TouchInput.y;
    };

    // The pointer counts as over the game only once it has moved there, and until it leaves; outside, the
    // original put it at (-20, -20), off the screen.
    let inside = false;
    document.addEventListener('mousemove', (e) => {
        const x = Graphics.pageToCanvasX(e.pageX), y = Graphics.pageToCanvasY(e.pageY);
        inside = Graphics.isInsideCanvas(x, y);
    });
    document.addEventListener('mouseleave', () => { inside = false; });

    let cursor = null;
    const _sceneUpdate = Scene_Base.prototype.update;
    Scene_Base.prototype.update = function() {
        _sceneUpdate.call(this);
        if (!cursor) cursor = new Sprite_RRMouse();
        if (cursor.parent !== this || this.children[this.children.length - 1] !== cursor) this.addChild(cursor);
        cursor.update();
        applyCursor();
    };
    // The cursor outlives scenes: it leaves one before the scene is destroyed with its children.
    const _destroy = Scene_Base.prototype.destroy;
    Scene_Base.prototype.destroy = function(options) {
        if (cursor && cursor.parent === this) this.removeChild(cursor);
        _destroy.call(this, options);
    };
})();
