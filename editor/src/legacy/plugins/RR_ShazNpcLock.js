/*:
 * @target MZ
 * @plugindesc Disable NPC Lock (VX Ace), for imported games
 * @author Shaz; ported for RPG Reactor
 * @url https://github.com/Psychronic-Games/RPG-Reactor
 *
 * @help RR_ShazNpcLock.js
 *
 * An event page whose opening comments (the comment lines before its first
 * other command) contain <nolock> is not stopped when it runs: it does not
 * turn to face the player and keeps walking its move route while its
 * commands play.
 *
 * Once a page has set it, the event keeps it when it changes to a page
 * without the comment; it is cleared only while no page is active (the
 * original script behaves this way).
 *
 * Installed by File › Import Project… when the imported game carried the
 * original script.
 */
(() => {
    'use strict';
    const TAG = /<nolock>/i;

    const _clear = Game_Event.prototype.clearPageSettings;
    Game_Event.prototype.clearPageSettings = function() {
        _clear.call(this);
        this._rrNoLock = false;
    };

    const _setup = Game_Event.prototype.setupPageSettings;
    Game_Event.prototype.setupPageSettings = function() {
        _setup.call(this);
        // Never cleared here: a page without the comment keeps <nolock> from an earlier page of the event;
        // only an event left with no active page (clearPageSettings) loses it.
        const list = this.list() || [];
        for (let i = 0; i < list.length && (list[i].code === 108 || list[i].code === 408); i++) {
            if (TAG.test(String(list[i].parameters[0]))) {
                this._rrNoLock = true;
                break;
            }
        }
    };

    const _lock = Game_Event.prototype.lock;
    Game_Event.prototype.lock = function() {
        if (!this._rrNoLock) _lock.call(this);
    };
})();
