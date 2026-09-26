/*:
 * @target MZ
 * @plugindesc Lemony's Sound Emitting Events (VX Ace), for imported games
 * @author Lemony; ported for RPG Reactor
 * @url https://github.com/Psychronic-Games/RPG-Reactor
 *
 * @help RR_LemonySoundEmitter.js
 *
 * An event whose current page has a comment
 *   LSEE BGS range pitch volume file           (BGM works the same)
 *   LSEE SE  range pitch volume file delay random   (ME works the same)
 * plays that sound while the player is within `range` tiles of it (straight
 * line), louder the closer the player is: volume × (range + 1 − distance) /
 * range, so it is at full volume within a tile. There is no panning.
 *
 * A BGS/BGM is replayed every frame at the new volume (the running track only
 * changes volume). An SE/ME plays every delay + (0 to random − 1) frames,
 * or every delay + 1 frames when random is 0 or left out; the count runs in
 * and out of range, and a sound plays only on its beat. Out of range, the last volume drops by 1 every
 * frame and the sound keeps being played at it until it reaches 0 (a BGS is
 * left playing at the last step, near silent). A page without the comment
 * fades the event's sound out the same way.
 *
 * Only one BGS plays at a time, so overlapping BGS emitters take turns at
 * the volume: the last event updated in a frame wins.
 * No script calls.
 *
 * Installed by File › Import Project… when the imported game carried the
 * original script.
 */
(() => {
    'use strict';

    const rubyRand = (n) => {
        const max = Math.trunc(Math.abs(Number(n) || 0));
        return max === 0 ? Math.random() : Math.floor(Math.random() * max);
    };
    const toI = (s) => parseInt(s, 10) || 0;   // Ruby String#to_i
    const REPEATING = ['ME', 'SE'];
    const PLAY = { SE: 'playSe', ME: 'playMe', BGS: 'playBgs', BGM: 'playBgm' };

    const play = (kind, sound) => {
        const method = PLAY[kind];
        if (!method || !sound.name) return;
        // Audio takes a whole volume from 0 to 100.
        const volume = Math.max(0, Math.min(100, Math.trunc(sound.volume)));
        AudioManager[method]({ name: sound.name, volume, pitch: sound.pitch, pan: 0 });
    };

    // The page's first comment line holding "LSEE", read on every refresh. A page without one keeps the old
    // settings and marks them for fading out; no page (every condition false) changes nothing.
    const _refresh = Game_Event.prototype.refresh;
    Game_Event.prototype.refresh = function() {
        _refresh.apply(this, arguments);
        const page = this.page();
        if (!page || !page.list) return;
        const s = (this._rrLsee = this._rrLsee || { data: null, out: false, timer: null });
        for (const command of page.list) {
            const b = command.parameters && command.parameters[0];
            const words = typeof b === 'string' ? b.split(/\s+/).filter(Boolean) : [];
            s.out = false;
            if ((command.code === 108 || command.code === 408) && b.includes('LSEE')) {
                // A new settings list drops the sound object the old one held.
                s.data = [words[1], words[2], toI(words[3]), words[4], words[5], toI(words[6]), toI(words[7]), null];
                break;
            }
            s.out = true;
        }
    };

    const _update = Game_Event.prototype.update;
    Game_Event.prototype.update = function() {
        _update.apply(this, arguments);
        if (this._rrLsee && this._rrLsee.data) this.rrUpdateLsee();
    };

    Game_Event.prototype.rrUpdateLsee = function() {
        const s = this._rrLsee, data = s.data;
        const kind = data[0];
        const xx = this._realX - $gamePlayer._realX, yy = this._realY - $gamePlayer._realY;
        const d = Math.sqrt(xx * xx + yy * yy);
        const r = toI(data[1]);
        const close = d <= r;
        // (r - (d - 1 % r)): Ruby's % binds tighter, so this is r - d + 1 (r - d when the range is 1).
        const v = ((r - (d - (1 % r))) * toI(data[3])) / r;
        let go = true;
        if (!s.out) {
            if (REPEATING.includes(kind)) {
                if (s.timer == null) s.timer = data[5] + rubyRand(data[6]);
                s.timer = Math.max(s.timer - 1, 0);
                go = s.timer <= 0;
                if (go) s.timer = null;
            }
            const out = data[7] != null && data[7].volume > 0 && !close && go;
            if (data[7] == null && close && go) data[7] = { name: data[4], volume: v, pitch: data[2] };
            if (data[7] != null && close) data[7].volume = v;
            if ((data[7] != null && close && go) || out) play(kind, data[7]);
            if (data[7] != null && !close) data[7].volume -= 1;
            if (data[7] != null && data[7].volume <= 0) data[7] = null;
        } else {
            if (data[7] != null) data[7].volume -= 1;
            if (data[7] != null && !REPEATING.includes(kind)) play(kind, data[7]);
            if (data[7] != null && data[7].volume <= 0) {
                s.data = null;
                s.out = false;
            }
        }
    };
})();
