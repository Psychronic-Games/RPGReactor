/*:
 * @target MZ
 * @plugindesc Icon for Attack (VX Ace), for imported games
 * @author Unknown; ported for RPG Reactor
 * @url https://github.com/Psychronic-Games/RPG-Reactor
 *
 * @help RR_AttackIcon.js
 *
 * The battle Attack command shows the icon of the actor's first weapon
 * before its name (the name moves right by the icon's width; with no weapon
 * the name stays in place). The icon is drawn at full strength even when
 * Attack cannot be chosen; only the name turns faint.
 *
 * Installed by File › Import Project… when the imported game carried the
 * original script.
 */
(() => {
    'use strict';
    const _drawItem = Window_ActorCommand.prototype.drawItem;
    Window_ActorCommand.prototype.drawItem = function(index) {
        if (this.commandSymbol(index) !== 'attack') return _drawItem.call(this, index);
        const rect = this.itemLineRect(index);
        const weapon = this._actor ? this._actor.weapons()[0] : null;
        const iconId = weapon ? weapon.iconIndex : 0;
        this.resetTextColor();
        this.changePaintOpacity(true);
        this.drawIcon(iconId, rect.x, rect.y);
        if (iconId > 0) {
            rect.x += 24;
            rect.width -= 24;
        }
        this.changePaintOpacity(this.isCommandEnabled(index));
        this.drawText(this.commandName(index), rect.x, rect.y, rect.width, this.itemTextAlign());
        this.changePaintOpacity(true);
    };
})();
