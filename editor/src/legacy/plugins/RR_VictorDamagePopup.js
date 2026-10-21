/*:
 * @target MZ
 * @plugindesc VE - Damage Popup (VX Ace), for imported games
 * @author Victor Sant; ported for RPG Reactor
 * @url https://github.com/Psychronic-Games/RPG-Reactor
 *
 * @help RR_VictorDamagePopup.js
 *
 * Damage, recovery, misses, criticals, weaknesses and state changes pop up
 * over a battler as text that moves the way Victor's script set for its kind
 * (hops for damage, zooms for criticals and healing, rises for states) and
 * fades. Each kind keeps its colour, size and movement from the game's copy.
 * A state's note can say <NO DISPLAY ADD>, <NO DISPLAY RMV>, <ADD COLOR: r,g,b>,
 * <REMOVE COLOR: r,g,b> or <DAMAGE BEHAVIOR: kind>; a skill's
 * <DAMAGE BEHAVIOR: kind> picks how its damage moves.
 *
 * In the game's ordinary battles the popups replace MZ's own. Other battle
 * systems ported for the game place them over their own sprites
 * (RRVictorDamage.Game_Damage).
 *
 * Installed by File › Import Project… when the imported game carried the
 * original script; its settings were read from the game's copy.
 *
 * @param settings
 * @text Settings
 * @desc The script's VE_ settings, as JSON (read from the game's copy).
 * @default {}
 *
 * @param defaultFontSize
 * @text Game's default font size
 * @desc The size the script's sizes are relative to (Font.default_size).
 * @type number
 * @default 24
 *
 * @param stockBattles
 * @text In ordinary battles
 * @type boolean
 * @default true
 */
(() => {
    'use strict';
    const params = PluginManager.parameters('RR_VictorDamagePopup');
    let VE = {};
    try { VE = JSON.parse(params.settings || '{}') || {}; } catch (_) { VE = {}; }
    const stock = params.stockBattles !== 'false';
    // RGSS sizes a font by its line; the project's font size stands for the game's default size.
    const fontPx = (size) => size * $gameSystem.mainFontSize() / (Number(params.defaultFontSize) || 24);
    const v = (name, fallback) => (VE[name] === undefined || VE[name] === null ? fallback : VE[name]);
    const text = (s) => (typeof s === 'string' && window.RRKeyedText ? window.RRKeyedText.resolve(s) : s);
    const fmt = (format, value) => String(format).replace(/%s/, String(value));
    const TEXTS = v('VE_DAMAGE_TEXTS', {});
    const MOVES = v('VE_DAMAGE_MOVE', {});
    const POP = v('VE_POP_BEHAVIOR', {});
    const defaultText = [0, 0, 0, 8, 50, true, false, null];

    // Game_Battler flags and Game_ActionResult fields the popups read.
    const _resultClear = Game_ActionResult.prototype.clear;
    Game_ActionResult.prototype.clear = function() {
        _resultClear.call(this);
        if (this.resist === undefined) this.resist = null;
        this.resist = null;
        this.tpDrain = 0;
    };
    Game_Battler.prototype.clearDamageFlags = Game_Battler.prototype.clearDamageFlags || function() {
        this._damaged = false; this._counter = false; this._reflect = false; this._covered = false; this._missed = false; this._noDmg = false;
    };

    //=========================================================================
    // Game_Damage: the popups of one battler sprite
    //=========================================================================
    class Game_Damage {
        constructor(container, battler, sprite) {
            this._container = container;
            this._battler = battler;
            this._sprite = sprite;
            this._damageSprites = [];
            this._exw = 0;
            this._rnd = 0;
        }
        result() { return this._battler.result(); }
        hpDamage() { return Math.abs(this.result().hpDamage); }
        mpDamage() { return Math.abs(this.result().mpDamage); }
        tpDamage() { return Math.abs(this.result().tpDamage); }
        showing() { return this._damageSprites.length > 0; }
        setDamage(battler) {
            this._battler = battler;
            this._dmgText = String(this.damageValue());
            this._dmgType = this.damageType();
            this.createDamageSprites();
        }
        damageValue() {
            const b = this._battler, r = this.result();
            if (b._counter) return v('VE_COUNTER_TEXT', 'Counter');
            if (b._reflect) return v('VE_REFLECT_TEXT', 'Reflect');
            if (b._covered) return v('VE_COVER_TEXT', 'Covered');
            const custom = this.customValue && this.customValue();
            if (custom != null) return custom;
            if (r.hpDamage > 0) return fmt(v('VE_HP_DAMAGE', '%s'), this.hpDamage());
            if (r.mpDamage > 0) return fmt(v('VE_MP_DAMAGE', '%s'), this.mpDamage());
            if (r.tpDamage > 0) return fmt(v('VE_TP_DAMAGE', '%s'), this.tpDamage());
            if (r.hpDamage < 0) return fmt(v('VE_HP_RECOVER', '%s'), this.hpDamage());
            if (r.mpDamage < 0) return fmt(v('VE_MP_RECOVER', '%s'), this.mpDamage());
            if (r.tpDamage < 0) return fmt(v('VE_TP_RECOVER', '%s'), this.tpDamage());
            if (r.missed) return v('VE_MISS_TEXT', 'Miss');
            if (r.evaded) return v('VE_EVADE_TEXT', 'Evade');
            if (b._noDmg) return '';
            return 0;
        }
        damageType() {
            const b = this._battler, r = this.result();
            if (b._counter) return 'counter';
            if (b._reflect) return 'reflect';
            if (b._covered) return 'covered';
            const custom = this.customType();
            if (custom) return custom;
            if (r.hpDamage > 0 && r.critical) return 'crt_damage';
            if (r.hpDamage > 0) return 'hp_damage';
            if (r.mpDamage > 0) return 'mp_damage';
            if (r.tpDamage > 0) return 'tp_damage';
            if (r.hpDamage < 0) return 'hp_recover';
            if (r.mpDamage < 0) return 'mp_recover';
            if (r.tpDamage < 0) return 'tp_recover';
            if (r.missed) return 'miss_text';
            if (r.evaded) return 'eva_text';
            return 'default';
        }
        customType() {
            const action = this._battler.currentAction && this._battler.currentAction();
            const item = action && action.item();
            if (!item) return null;
            const m = /<DAMAGE BEHAVIOR: ([^>< ]*)>/i.exec(item.note || '');
            return m ? m[1] : null;
        }
        createDamageSprites() {
            this._damageSprites = this._damageSprites.filter(Boolean);
            this.setNormalDamage();
            const r = this.result();
            if (r.critical && v('VE_CRT_POP', true)) this.setOne(v('VE_CRT_TEXT', 'Critical'), 'crt_text');
            if (r.resist && v('VE_RESIST_POP', true)) this.setOne(this.resistText(), r.resist);
            this.setStates();
        }
        setNormalDamage() {
            this._rnd = 2.0 - Math.floor(Math.random() * 400) / 100.0;
            this._exw = 0;
            const set = [];
            const numeric = typeof this.damageValue() === 'number';
            for (let i = 0; i < this._dmgText.length; i++) set.push(this.setSprite(this._dmgText, this._dmgType, i, numeric));
            for (const s of set) s.setPlus(this._exw);
            this._damageSprites.push(set);
            this._exw = 0; this._rnd = 0;
        }
        setOne(str, type, state = null) {
            const set = [this.setSprite(str, type, -1, false, state)];
            for (const s of set) s.setPosition();
            this._damageSprites.push(set);
        }
        resistText() {
            switch (this.result().resist) {
                case 'weakness': return v('VE_WEAK_TEXT', 'Weakness');
                case 'resist': return v('VE_RESIST_TEXT', 'Resist');
                case 'imune': return v('VE_IMUNE_TEXT', 'Imune');
                case 'absorb': return v('VE_ABSORB_TEXT', 'Absorb');
                default: return '';
            }
        }
        setStates() {
            const r = this.result();
            for (const id of r.addedStates) {
                if (this.noStateDisplay('state_add', id)) continue;
                this.setOne(fmt(v('VE_STATE_ADD', '+%s'), text($dataStates[id].name)), this.stateType(id, 'state_add'), id);
            }
            for (const id of r.removedStates) {
                if (this.noStateDisplay('state_rmv', id)) continue;
                this.setOne(fmt(v('VE_STATE_REMOVE', '-%s'), text($dataStates[id].name)), this.stateType(id, 'state_rmv'), id);
            }
            for (const id of r.addedBuffs) this.setOne(fmt(v('VE_BUFF_ADD', '%s up'), TextManager.param(id)), 'buff_add', id);
            for (const id of r.addedDebuffs) this.setOne(fmt(v('VE_DEBUFF_ADD', '%s down'), TextManager.param(id)), 'debuff_add', id);
            for (const id of r.removedBuffs) this.setOne(fmt(v('VE_BUFF_RMV', '%s'), TextManager.param(id)), 'buff_rmv', id);
        }
        noStateDisplay(type, id) {
            const note = ($dataStates[id] && $dataStates[id].note) || '';
            if (/<NO DISPLAY ADD>/i.test(note)) return true;
            if (type === 'state_rmv' && /<NO DISPLAY RMV>/i.test(note)) return true;
            return false;
        }
        stateType(id, type) {
            const m = /<DAMAGE[ _]*BEHAVIOR:? +([^>< ]*)>/i.exec(($dataStates[id] && $dataStates[id].note) || '');
            return m ? m[1] : type;
        }
        setSprite(str, type, index = 0, num = false, state = null) {
            str = text(String(str));
            const x = this._sprite.x;
            const y = this._sprite.y - (v('VE_HEIGHT_ADJ', true) ? this._sprite.centerY() : 64);
            const info = { i: index, text: str, type, x, y, size: this._damageSprites.length, num };
            const sprite = new Sprite_VeDamage(this._battler, this._exw, this._rnd, state, info);
            // Beside the battler's sprite, over everything else there (z 15000).
            const container = this._container || this._sprite.parent;
            sprite.z = 15000;
            if (container) container.addChild(sprite);
            if (index >= 0) this._exw += sprite.space();
            return sprite;
        }
        update() {
            for (const set of this._damageSprites) {
                for (const sprite of set.slice()) {
                    sprite.updatePop();
                    if (sprite.isDisposed()) set.splice(set.indexOf(sprite), 1);
                }
            }
            this._damageSprites = this._damageSprites.filter(set => set.length > 0);
        }
        dispose() {
            for (const set of this._damageSprites) for (const s of set) s.disposePop();
            this._damageSprites = [];
        }
    }

    //=========================================================================
    // Sprite_VeDamage: one popup
    //=========================================================================
    class Sprite_VeDamage extends Sprite {
        constructor(battler, exw, rnd, state, info) {
            super();
            this._battler = battler;
            this._exw = exw;
            this._rnd = rnd;
            this._state = state ? $dataStates[state] : null;
            this._index = info.i; this._text = info.text; this._type = info.type;
            this._posX = info.x; this._posY = info.y; this._dmgSize = info.size; this._numeric = info.num;
            this._wait = this.getText()[4];
            this._base = this.getText()[4];
            this._delay = v('VE_MULTI_POP', false) ? this._index * 4 : 1;
            this._adjust = v('VE_AUTO_ADJ', true);
            this._size = this._index < 0 ? 0.75 : this._text.length / 2.0 - this._index;
            this._move = MOVES[this._type] || MOVES.default || ['wait', 'wait', 'wait'];
            this._plus = 0;
            this._speed = 0.0;
            this._random = 1.0;
            this._dmgBitmap = this.createText(this._index);
            this.opacity = 0;
            this._disposed = false;
        }
        isDisposed() { return this._disposed; }
        disposePop() {
            if (this._disposed) return;
            this._disposed = true;
            if (this.parent) this.parent.removeChild(this);
            if (this._dmgBitmap) this._dmgBitmap.destroy();
            this.destroy();
        }
        getText() { return TEXTS[this._type] || TEXTS.default || defaultText; }
        fontSize() { return fontPx(this.getText()[3]); }
        createText(index) {
            const str = index < 0 ? this._text : this._text.charAt(index);
            const measure = new Bitmap(160, this.fontSize() + 2);
            this.setupFont(measure);
            const adjust = this.getText()[6] ? 4 : 2;
            const size = Math.max(1, Math.ceil(measure.measureTextWidth(str) + adjust));
            measure.destroy();
            const bitmap = new Bitmap(size, Math.max(1, this.fontSize()));
            this.setupFont(bitmap);
            const c = this.getColor();
            bitmap.textColor = `rgb(${c[0]},${c[1]},${c[2]})`;
            bitmap.drawText(str, 1, 0, size, this.fontSize(), 'left');
            return bitmap;
        }
        setupFont(bitmap) {
            const t = this.getText();
            bitmap.fontSize = fontPx(t[3]);
            if (t[7]) bitmap.fontFace = t[7];
            bitmap.fontBold = !!t[5];
            bitmap.fontItalic = !!t[6];
            // RGSS drew text with a 1px dark outline by default.
            bitmap.outlineWidth = 2;
            bitmap.outlineColor = 'rgba(0,0,0,0.6)';
        }
        getColor() {
            const note = (this._state && this._state.note) || '';
            const add = /<ADD COLOR: ((?:\d+,? *){3})>/i.exec(note), rmv = /<REMOVE COLOR: ((?:\d+,? *){3})>/i.exec(note);
            const parse = (s) => { const m = /(\d+) *,? *(\d+) *,? *(\d+)/.exec(s); return m ? [+m[1], +m[2], +m[3]] : [255, 255, 255]; };
            if (this._state && this._type === 'state_add' && add) return parse(add[1]);
            if (this._state && this._type === 'state_rmv' && rmv) return parse(rmv[1]);
            const t = this.getText();
            return [t[0], t[1], t[2]];
        }
        space() { return this._dmgBitmap.width + v('VE_DIGIT_SPACE', 0); }
        setPlus(plus) { this._plus = plus; this.setPosition(); }
        setPosition() {
            this.bitmap = this._dmgBitmap;
            this._baseX = this._dmgBitmap ? this._dmgBitmap.width / 2 : 0;
            this._baseY = this._dmgBitmap ? this._dmgBitmap.height / 2 : 0;
            const adjustX = this._index < 0 ? 0 : this._plus / 2 - this._baseX;
            const adjustY = (this._adjust && this._text !== '') ? this._dmgSize * 32 : 0;
            const move = POP[this._move[0]] || [1, 1, 0, 0, 0, 0, 0, false];
            this.scale.x = move[0];
            this.scale.y = move[1];
            this.x = this._posX + this._exw + move[2] - adjustX;
            this.y = this._posY + move[3] - adjustY;
        }
        updatePop() {
            this._delay -= 1;
            if (this._disposed || this._delay > 0) return;
            this._wait -= 1;
            this.bitmap = this._dmgBitmap;
            this.updateSpeed();
            this.updateDamageMove();
            this.updateZoom();
            this.updateMove();
            this.updateOpacity();
        }
        updateDamageMove() {
            const a = POP[this._move[0]] || [1, 1, 0, 0, 0, 0, 0, false];
            const b = POP[this._move[1]] || a, c = POP[this._move[2]] || b;
            if (this._wait > this._base * 2.0 / 3.0) this.setMoveValues(a[0], b[0], a[1], b[1], a[4], a[5], a[6], a[7]);
            else if (this._wait < this._base / 3.0) this.setMoveValues(b[0], c[0], b[1], c[1], c[4], c[5], c[6], c[7]);
            else this.setMoveValues(0, 0, 0, 0, b[4], b[5], b[6], b[7]);
        }
        setMoveValues(...args) {
            this._adjX = (args[0] - args[1]) / (this._base * 0.33);
            this._adjY = (args[2] - args[3]) / (this._base * 0.33);
            this._zoomMaxX = args[1];
            this._zoomMaxY = args[3];
            this._moveX = args[4] * (args[7] ? this._random : 1.0);
            this._moveY = args[5];
            this._gravity = -args[6];
        }
        updateZoom() {
            this.scale.x -= this._adjX;
            this.scale.y -= this._adjY;
            if (this._adjX > 0) { this.scale.x = Math.max(this.scale.x, this._zoomMaxX); this.scale.y = Math.max(this.scale.y, this._zoomMaxY); }
            if (this._adjX < 0) { this.scale.x = Math.min(this.scale.x, this._zoomMaxX); this.scale.y = Math.min(this.scale.y, this._zoomMaxY); }
        }
        updateSpeed() {
            const d = this._wait * 100.0 / this._base;
            if (d >= 66 && d < 100) this._speed = (d - 81) * 10 / this._base;
            else if (d >= 33 && d < 66) this._speed = (d - 50) * 10 / this._base;
            else if (d >= 0 && d < 33) this._speed = (d - 16) * 10 / this._base;
        }
        updateMove() {
            this.x += this._moveX;
            this.y += this._moveY + this._gravity * this._speed;
            const sizeValue = (this._exw / 4) * this._size * (this.scale.x - 1);
            const ox = this._baseX + (this.scale.x ? sizeValue / this.scale.x : 0);
            const oy = this._baseY + (this.scale.y ? (this._baseY - this._baseY / this.scale.y) / 2 : 0);
            if (this._dmgBitmap) { this.anchor.x = ox / this._dmgBitmap.width; this.anchor.y = oy / this._dmgBitmap.height; }
        }
        updateOpacity() {
            const w = this._wait;
            if (w >= 1 && w <= 10) this.opacity -= 25;
            else if (w >= this._base - 10 && w <= this._base) this.opacity += 25;
            else if (w === 0) this.disposePop();
            else this.opacity = 255;
        }
    }

    window.RRVictorDamage = { Game_Damage, Sprite_VeDamage, settings: VE };

    //=========================================================================
    // Ordinary battles: the popups instead of MZ's
    //=========================================================================
    if (stock) {
        const _apply = Game_Action.prototype.apply;
        Game_Action.prototype.apply = function(target) {
            _apply.call(this, target);
            const r = target.result();
            target._damaged = $gameParty.inBattle() && r.isHit();
            target._missed = $gameParty.inBattle() && target.isAlive() && !r.isHit();
            target._noDmg = !this.item() || this.item().damage.type === 0;
        };
        Sprite_Battler.prototype.centerY = function() { return (this.bitmap ? this.bitmap.height : 0) / 2; };
        Sprite_Battler.prototype.createDamageSprite = function() {};
        const _update = Sprite_Battler.prototype.update;
        Sprite_Battler.prototype.update = function() {
            _update.call(this);
            if (!this._battler || !this.parent) return;
            if (!this._veDamage) this._veDamage = new Game_Damage(this.parent, this._battler, this);
            if (this._battler._damaged || this._battler._missed) {
                this._veDamage.setDamage(this._battler);
                this._battler.clearDamageFlags();
            }
            this._veDamage.update();
        };
    }
})();
