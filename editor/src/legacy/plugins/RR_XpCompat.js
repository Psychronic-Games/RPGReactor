/*:
 * @target MZ
 * @plugindesc RPG Maker XP rules for imported XP games
 * @author RPG Reactor
 * @url https://github.com/Psychronic-Games/RPG-Reactor
 *
 * @help RR_XpCompat.js
 *
 * Installed by File › Import Project… with every RPG Maker XP game. It keeps
 * the rules XP games were made for, where MZ's differ:
 *
 * - Map fog: a map note <rrFog: name, hue, opacity, blend, zoom, sx, sy>
 *   shows a fog over the map (the importer writes it from the XP tileset).
 *   Drawn by RR_ShazMultiFog as fog 0.
 * - Event opacity, blend and hue: a comment first on an event page,
 *   <rrOpacity: n> <rrBlend: n> <rrHue: n>.
 * - Prepare / Execute Transition, Button Input Processing and Wait for
 *   Move's Completion (XP event commands MZ does not have).
 * - Change Windowskin: skins under img/windowskins.
 * - XP battle arithmetic: skills and attacks computed as XP did, from each
 *   weapon's and enemy's <rrXpAtk: n> note and the stats the importer mapped
 *   (MZ Attack ← STR, Defense ← PDEF, M.Attack ← INT, M.Defense ← MDEF,
 *   Luck ← DEX).
 * - Walking pace: XP ran at 40 frames a second; characters cover the same
 *   ground per second here.
 *
 * Turning it off leaves the calls the importer wrote doing nothing.
 *
 * @param movePace
 * @text Walking pace
 * @type number
 * @decimals 3
 * @default 1.333
 * @desc Move speed multiplier. 1.333 walks as far per second as XP did; 1 uses MZ's pace.
 *
 * @param xpBattle
 * @text XP battle formulas
 * @type boolean
 * @default true
 * @desc Compute imported skills and attacks with XP's damage rules.
 */
(() => {
    'use strict';
    const params = PluginManager.parameters('RR_XpCompat');
    const PACE = Number(params.movePace || 1.333) || 1;
    const XP_BATTLE = params.xpBattle !== 'false';

    // ---- walking pace ----------------------------------------------------------
    const _distancePerFrame = Game_CharacterBase.prototype.distancePerFrame;
    Game_CharacterBase.prototype.distancePerFrame = function() {
        return _distancePerFrame.call(this) * PACE;
    };

    // ---- fog -------------------------------------------------------------------
    // XP drifted fog sx/8 px per frame at 40 fps.
    const DRIFT = 2 / 3;
    Game_Map.prototype.rrXpFog = function(name, hue, opacity, blend, zoom, sx, sy) {
        if (!$gameScreen.rrShowFog) return;
        if (!name) { $gameScreen.rrEraseFog(0); return; }
        $gameScreen.rrShowFog(0, name, Number(hue) || 0, Number(opacity) || 0, Number(blend) || 0, Number(zoom) || 100, (Number(sx) || 0) * DRIFT, (Number(sy) || 0) * DRIFT, 0);
    };
    const _mapSetup = Game_Map.prototype.setup;
    Game_Map.prototype.setup = function(mapId) {
        _mapSetup.call(this, mapId);
        const fog = $dataMap && $dataMap.meta && $dataMap.meta.rrFog;
        if (typeof fog === 'string') {
            const [name, ...rest] = fog.split(',').map(s => s.trim());
            this.rrXpFog(name, ...rest.map(Number));
        }
    };

    // ---- event opacity, blend, hue -------------------------------------------------
    const tagOf = (page, key) => {
        const first = page && page.list && page.list[0];
        if (!first || first.code !== 108) return null;
        const m = new RegExp(`<${key}:\\s*(-?\\d+)>`, 'i').exec(String(first.parameters[0] || ''));
        return m ? Number(m[1]) : null;
    };
    const _setupPageSettings = Game_Event.prototype.setupPageSettings;
    Game_Event.prototype.setupPageSettings = function() {
        _setupPageSettings.call(this);
        const page = this.page();
        const opacity = tagOf(page, 'rrOpacity'), blend = tagOf(page, 'rrBlend'), hue = tagOf(page, 'rrHue');
        this.setOpacity(opacity === null ? 255 : opacity);
        // XP blends normal, add and subtract; MZ has no subtract, multiply darkens the same way.
        this.setBlendMode(blend === 1 ? 1 : blend === 2 ? 2 : 0);
        this._rrHue = hue || 0;
    };
    const _clearPageSettings = Game_Event.prototype.clearPageSettings;
    Game_Event.prototype.clearPageSettings = function() {
        _clearPageSettings.call(this);
        this._rrHue = 0;
    };
    const _updateSpriteCharacter = Sprite_Character.prototype.update;
    Sprite_Character.prototype.update = function() {
        _updateSpriteCharacter.call(this);
        const hue = (this._character && this._character._rrHue) || 0;
        if (hue !== (this._rrHue || 0)) { this._rrHue = hue; this.setHue(hue); }
    };

    // ---- interpreter commands XP has -------------------------------------------
    const XP_KEYS = [['down', 2], ['left', 4], ['right', 6], ['up', 8], ['shift', 11], ['cancel', 12], ['ok', 13], ['pageup', 17], ['pagedown', 18]];
    Game_Interpreter.prototype.rrKeyInput = function(variableId) {
        this._rrKeyVariable = variableId;
        this.setWaitMode('rrKeyInput');
    };
    Game_Interpreter.prototype.rrWaitForAllMoves = function() {
        this.setWaitMode('rrAllMoves');
    };
    Game_Interpreter.prototype.rrPrepareTransition = function() {
        const scene = SceneManager._scene;
        if (!scene || !scene.rrFreeze) return;
        scene.rrFreeze();
    };
    Game_Interpreter.prototype.rrExecuteTransition = function(name, frames) {
        const scene = SceneManager._scene;
        if (!scene || !scene.rrTransition) return;
        scene.rrTransition(name, frames);
        this.wait(frames);
    };
    const _updateWaitMode = Game_Interpreter.prototype.updateWaitMode;
    Game_Interpreter.prototype.updateWaitMode = function() {
        if (this._waitMode === 'rrKeyInput') {
            const hit = XP_KEYS.find(([key]) => Input.isTrigger(key));
            if (!hit) return true;
            $gameVariables.setValue(this._rrKeyVariable, hit[1]);
            this._waitMode = '';
            return false;
        }
        if (this._waitMode === 'rrAllMoves') {
            if ($gamePlayer.isMoveRouteForcing() || $gameMap.events().some(e => e.isMoveRouteForcing())) return true;
            this._waitMode = '';
            return false;
        }
        return _updateWaitMode.call(this);
    };

    // ---- transitions: freeze the frame, then wipe to the new one ----------------------
    Scene_Map.prototype.rrFreeze = function() {
        if (this._rrFrozen) this.removeChild(this._rrFrozen);
        const sprite = new Sprite(SceneManager.snap());
        this._rrFrozen = sprite;
        this.addChild(sprite);
    };
    /** XP wipes through a grayscale image (dark pixels first), with a 40-level soft edge; no image is a fade. */
    Scene_Map.prototype.rrTransition = function(name, frames) {
        const frozen = this._rrFrozen;
        if (!frozen) return;
        const duration = Math.max(1, frames | 0);
        const snap = frozen.bitmap;
        let rule = null, still = null;
        if (name) {
            const image = ImageManager.loadBitmap('img/transitions/', name);
            image.addLoadListener(() => {
                const w = snap.width, h = snap.height;
                const scaled = new Bitmap(w, h);
                scaled.blt(image, 0, 0, image.width, image.height, 0, 0, w, h);
                const src = scaled.context.getImageData(0, 0, w, h).data;
                rule = new Uint8Array(w * h);
                for (let i = 0; i < rule.length; i++) rule[i] = src[i * 4];
                still = snap.context.getImageData(0, 0, w, h);
                scaled.destroy();
            });
        }
        let t = 0;
        frozen.update = function() {
            t++;
            const progress = Math.min(1, t / duration);
            if (rule && still) {
                const out = snap.context.createImageData(still.width, still.height);
                const level = progress * (255 + 40);
                for (let i = 0; i < rule.length; i++) {
                    const a = Math.max(0, Math.min(1, (rule[i] - level + 40) / 40));
                    const j = i * 4;
                    out.data[j] = still.data[j]; out.data[j + 1] = still.data[j + 1]; out.data[j + 2] = still.data[j + 2]; out.data[j + 3] = still.data[j + 3] * a;
                }
                snap.context.putImageData(out, 0, 0);
                if (snap._baseTexture) snap._baseTexture.update();
            } else this.opacity = 255 * (1 - progress);
            if (progress >= 1 && this.parent) { this.parent.removeChild(this); snap.destroy(); }
        };
        this._rrFrozen = null;
    };

    // ---- window skins ------------------------------------------------------------
    Game_System.prototype.rrSetWindowskin = function(name) {
        this._rrWindowskin = String(name || '');
    };
    const _loadWindowskin = Window_Base.prototype.loadWindowskin;
    Window_Base.prototype.loadWindowskin = function() {
        const name = $gameSystem && $gameSystem._rrWindowskin;
        if (name) this.windowskin = ImageManager.loadBitmap('img/windowskins/', name);
        else _loadWindowskin.call(this);
    };
    const _windowBaseUpdate = Window_Base.prototype.update;
    Window_Base.prototype.update = function() {
        _windowBaseUpdate.call(this);
        const name = ($gameSystem && $gameSystem._rrWindowskin) || '';
        if (this._rrSkinName === undefined) this._rrSkinName = name;
        else if (this._rrSkinName !== name) { this._rrSkinName = name; this.loadWindowskin(); }
    };

    // ---- XP battle arithmetic ------------------------------------------------------
    const noteAtk = (item) => (item && item.meta && Number(item.meta.rrXpAtk)) || 0;
    /** XP's attack power: the weapons' (actors) or the enemy's own. */
    Game_BattlerBase.prototype.rrXpAtk = function() {
        if (this.isEnemy()) return noteAtk(this.enemy());
        return this.weapons().reduce((n, w) => n + noteAtk(w), 0);
    };
    /** Game_Battler#attack_effect: max(atk − pdef/2, 0) × (20 + STR) / 20. */
    Game_BattlerBase.prototype.rrXpAttack = function(target) {
        if (!XP_BATTLE) return this.atk * 4 - target.def * 2;
        const atk = Math.max(this.rrXpAtk() - target.def / 2, 0);
        return atk * (20 + this.atk) / 20;
    };
    /**
     * Game_Battler#skill_effect. `f` = [power, atk_f, str_f, dex_f, agi_f, int_f, pdef_f, mdef_f].
     * Recovery skills (negative power) return the amount healed.
     */
    Game_BattlerBase.prototype.rrXpSkill = function(target, f) {
        const [power0, atkF, strF, dexF, agiF, intF, pdefF, mdefF] = f;
        if (!XP_BATTLE) return Math.abs(power0) + this.mat * 2 - (power0 > 0 ? target.mdf : 0);
        let power = power0 + this.rrXpAtk() * atkF / 100;
        if (power > 0) {
            power -= target.def * pdefF / 200;
            power -= target.mdf * mdefF / 200;
            power = Math.max(power, 0);
        }
        const rate = 20 + this.atk * strF / 100 + this.luk * dexF / 100 + this.agi * agiF / 100 + this.mat * intF / 100;
        return Math.abs(power * rate / 20);
    };
})();
