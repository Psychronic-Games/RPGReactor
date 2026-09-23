/*:
 * @target MZ
 * @plugindesc RPG Maker VX rules for imported VX games
 * @author RPG Reactor
 * @url https://github.com/Psychronic-Games/RPG-Reactor
 *
 * @help RR_VxCompat.js
 *
 * Installed by File › Import Project… with every RPG Maker VX game.
 *
 * Battle background: VX drew no battleback images. A battle took the map as
 * it looked when the battle began, blurred it, and laid the BattleFloor image
 * (img/system) over its lower half. A map or battle that names a battleback
 * (Map Properties, Change Battle Back) shows that instead, as in MZ.
 *
 * A battleback the game's script kept on the system ($gameSystem._rrBattleback,
 * set by the importer's translation of `$game_system.battleback = "…"`)
 * overrides every map's until it is cleared, as the script did.
 *
 * Turning it off leaves MZ's battlebacks, which an imported VX game has none of.
 *
 * @param floorOpacity
 * @text BattleFloor opacity
 * @type number
 * @max 255
 * @default 128
 *
 * @param blur
 * @text Blur the map
 * @type boolean
 * @default true
 */
(() => {
    'use strict';
    const params = PluginManager.parameters('RR_VxCompat');
    const FLOOR_OPACITY = Number(params.floorOpacity || 128);
    const BLUR = params.blur !== 'false';

    const _battleback1Name = Game_Map.prototype.battleback1Name;
    Game_Map.prototype.battleback1Name = function() {
        const kept = $gameSystem && $gameSystem._rrBattleback;
        return kept ? String(kept) : _battleback1Name.call(this);
    };
    const _battleback2Name = Game_Map.prototype.battleback2Name;
    Game_Map.prototype.battleback2Name = function() {
        return $gameSystem && $gameSystem._rrBattleback ? '' : _battleback2Name.call(this);
    };

    const namesBattleback = () => !!(($gameMap && ($gameMap.battleback1Name() || $gameMap.battleback2Name())) || BattleManager.isBattleTest() && ($dataSystem.battleback1Name || $dataSystem.battleback2Name));

    const _createBattleback = Spriteset_Battle.prototype.createBattleback;
    Spriteset_Battle.prototype.createBattleback = function() {
        if (namesBattleback()) { _createBattleback.call(this); return; }
        const snap = SceneManager.backgroundBitmap();
        const w = Graphics.width, h = Graphics.height;
        const back = new Bitmap(w, h);
        if (snap) {
            back.blt(snap, 0, 0, snap.width, snap.height, 0, 0, w, h);
            if (BLUR) { back.blur(); back.blur(); }
        } else back.fillAll('#000000');
        this._rrVxBack = new Sprite(back);
        this._baseSprite.addChild(this._rrVxBack);
        // BattleFloor sits at y 192 of VX's 544×416 screen, scaled with the screen.
        const floor = new Sprite(ImageManager.loadSystem('BattleFloor'));
        floor.y = Math.round(h * 192 / 416);
        floor.opacity = FLOOR_OPACITY;
        floor.scale.set(w / 544, w / 544);
        this._rrVxFloor = floor;
        this._baseSprite.addChild(floor);
        // Empty stand-ins for the stock battleback sprites, for code that looks for them
        // (a Sprite_Battleback would load MZ's default battleback, which the game does not have).
        this._back1Sprite = new Sprite();
        this._back2Sprite = new Sprite();
        this._baseSprite.addChild(this._back1Sprite);
        this._baseSprite.addChild(this._back2Sprite);
    };
})();
