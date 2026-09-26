/*:
 * @target MZ
 * @plugindesc Mouse Enemy Select (VX Ace), for imported games
 * @author AwesomeCool; ported for RPG Reactor
 * @url https://github.com/Psychronic-Games/RPG-Reactor
 *
 * @help RR_MouseEnemySelect.js
 *
 * While an enemy is being chosen, pointing the mouse at an enemy chooses it
 * (with the cursor sound), checked every third frame after the mouse last
 * moved and until a direction key is pressed. An enemy's box is its image,
 * standing on its feet, or the size its note sets:
 *   <selectbox width: x>, <selectbox height: y>
 *   <selectbox offset x: x>, <selectbox offset y: y>
 * With the Area of Effect script in the game, its enemy notes (<hitbox
 * width: x>, <offset y: -x> …) take the place of these, as that script
 * overwrote the same settings when the game loaded.
 *
 * Works with the game's mouse (RR_ShazMouse): nothing happens while the
 * mouse is switched off.
 *
 * Installed by File › Import Project… when the imported game carried the
 * original script; its settings were read from the game's copy.
 *
 * @param offsetX
 * @type number
 * @min -9999
 * @default 0
 *
 * @param offsetY
 * @type number
 * @min -9999
 * @default -8
 */
(() => {
    'use strict';
    const params = PluginManager.parameters('RR_MouseEnemySelect');
    const num = (v, d) => (v === undefined || v === '' || isNaN(Number(v)) ? d : Number(v));
    const OFFSET_X = num(params.offsetX, 0), OFFSET_Y = num(params.offsetY, -8);

    const ownNotes = (enemy) => {
        if (enemy._rrSelectbox) return enemy._rrSelectbox;
        const n = { offsetX: OFFSET_X, offsetY: OFFSET_Y, width: null, height: null };
        for (const line of String(enemy.note || '').split(/[\r\n]+/)) {
            let m;
            if ((m = /<(?:selectbox offset x):[ ](\d+)>/i.exec(line))) n.offsetX = Number(m[1]);
            else if ((m = /<(?:selectbox offset y):[ ](\d+)>/i.exec(line))) n.offsetY = Number(m[1]);
            else if ((m = /<(?:selectbox width):[ ](\d+)>/i.exec(line))) n.width = Math.max(Number(m[1]), 1);
            else if ((m = /<(?:selectbox height):[ ](\d+)>/i.exec(line))) n.height = Math.max(Number(m[1]), 1);
        }
        return (enemy._rrSelectbox = n);
    };
    // Both scripts kept these on the enemy under the same names; the Area of Effect script read its notes
    // later, always setting the offsets and setting a size only where its own tag gave one.
    const boxNotes = (enemy) => {
        const own = ownNotes(enemy), aoe = window.RRYanflyAoe && window.RRYanflyAoe.enemyNotes(enemy);
        if (!aoe) return own;
        return { offsetX: aoe.offsetX, offsetY: aoe.offsetY, width: aoe.width ?? own.width, height: aoe.height ?? own.height };
    };
    const spriteFrame = (enemy) => {
        const scene = SceneManager._scene, set = scene && scene._spriteset;
        const sprite = set && (set._enemySprites || []).find(s => s._battler === enemy);
        const frame = sprite && sprite._frame;
        return frame ? { width: frame.width, height: frame.height } : { width: 0, height: 0 };
    };
    Game_Enemy.prototype.rrSelectbox = function() {
        const n = boxNotes(this.enemy()), frame = spriteFrame(this);
        const w = n.width ?? frame.width, h = n.height ?? frame.height;
        return { x: this.screenX() + n.offsetX - Math.floor(w / 2), y: this.screenY() + n.offsetY - h, width: w, height: h };
    };

    // The mouse leads from when it moves until a direction key is pressed.
    let method = 'keyboard', lastX = null, lastY = null;
    const _inputUpdate = Input.update;
    Input.update = function() {
        _inputUpdate.call(this);
        if (TouchInput.x !== lastX || TouchInput.y !== lastY) {
            if (lastX !== null) method = 'mouse';
            lastX = TouchInput.x;
            lastY = TouchInput.y;
        }
        if (this.dir4 !== 0 || this.dir8 !== 0) method = 'keyboard';
    };
    const mouseEnabled = () => !window.rrMouse || window.rrMouse.isEnabled();
    const mousePosition = () => (window.rrMouse ? window.rrMouse.position() : [TouchInput.x, TouchInput.y]);

    const _update = Window_BattleEnemy.prototype.update;
    Window_BattleEnemy.prototype.update = function() {
        _update.call(this);
        if (method === 'mouse') this.rrProcessMouseHandling();
    };
    // The window lists the living enemies left to right; the one under the pointer is chosen.
    Window_BattleEnemy.prototype.rrProcessMouseHandling = function() {
        if (!mouseEnabled() || !this.isCursorMovable()) return;
        this._rrMouseDelay = this._rrMouseDelay == null ? 0 : this._rrMouseDelay + 1;
        if (this._rrMouseDelay % 3 > 0) return;
        const [mx, my] = mousePosition();
        const alive = $gameTroop.aliveMembers().sort((a, b) => a.screenX() - b.screenX());
        for (let i = 0; i < alive.length; i++) {
            const rect = alive[i].rrSelectbox();
            if (mx >= rect.x && mx <= rect.x + rect.width && my >= rect.y && my <= rect.y + rect.height) {
                const last = this.index();
                this.select(i);
                if (this.index() !== last) SoundManager.playCursor();
                break;
            }
        }
    };
})();
