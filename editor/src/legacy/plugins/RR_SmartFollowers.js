/*:
 * @target MZ
 * @plugindesc Smart(er) Followers (VX Ace), for imported games
 * @author Neon Black; ported for RPG Reactor
 * @url https://github.com/Psychronic-Games/RPG-Reactor
 *
 * @help RR_SmartFollowers.js
 *
 * Followers retrace the leader's steps instead of chasing: every step,
 * diagonal step and jump the leader makes goes into a queue, and each
 * follower replays it one entry behind the character ahead of it, in the
 * leader's facing. A follower does not bump into the one ahead: it waits
 * while that one is still walking. Transfers and "Gather Followers" work as
 * before (a transfer clears the queue; gathering replays what is left).
 *
 * Followers keep their own facing: their direction is fixed every frame and
 * only changes with the queue, so a move route given to a follower moves it
 * but cannot turn it. Move speed, opacity, blend, animation and transparency
 * still come from the leader each frame, before the follower moves.
 *
 * Installed by File › Import Project… when the imported game carried the
 * original script; its settings were read from the game's copy.
 *
 * @param moveDelay
 * @text Displacement delay
 * @desc Frames a follower must wait behind a moving character before it may close a gap early (MoveDelay).
 * @type number
 * @default 100
 */
(() => {
    'use strict';
    const params = PluginManager.parameters('RR_SmartFollowers');
    const MOVE_DELAY = Number(params.moveDelay ?? 100);

    const queueOf = (followers) => followers._rrSmartQueue || (followers._rrSmartQueue = []);
    // The player's place in the queue is its end; a follower's is the next entry it will replay.
    const indexOf = (c) => (c === $gamePlayer ? queueOf(c._followers).length : c._rrSmartIndex || 0);

    //-------------------------------------------------------------------------
    // The leader records its moves; input is read after the frame's movement,
    // so the followers see a new step in the frame it starts.

    const _playerUpdate = Game_Player.prototype.update;
    Game_Player.prototype.update = function(sceneActive) {
        this._rrSmartDefer = true;
        try {
            _playerUpdate.call(this, sceneActive);
        } finally {
            this._rrSmartDefer = false;
        }
        // Dashing is decided when a step starts, and a step now starts here.
        this.updateDashing();
        if (sceneActive) this.moveByInput();
        this._followers.update();
    };

    const _moveByInput = Game_Player.prototype.moveByInput;
    Game_Player.prototype.moveByInput = function() {
        if (!this._rrSmartDefer) _moveByInput.call(this);
    };

    Game_Player.prototype.moveStraight = function(d) {
        const forefront = this.canPass(this.x, this.y, d);
        Game_Character.prototype.moveStraight.call(this, d);
        if (forefront) this._followers.rrSmartPush([d, null, this.direction(), 'str']);
    };

    Game_Player.prototype.moveDiagonally = function(horz, vert) {
        const forefront = this.canPassDiagonally(this.x, this.y, horz, vert);
        Game_Character.prototype.moveDiagonally.call(this, horz, vert);
        if (forefront) this._followers.rrSmartPush([horz, vert, this.direction(), 'dia']);
    };

    // Every jump is queued, even one onto the spot it started from.
    Game_Player.prototype.jump = function(xPlus, yPlus) {
        Game_Character.prototype.jump.call(this, xPlus, yPlus);
        this._followers.rrSmartPush([xPlus, yPlus, this.direction(), 'jum']);
    };

    //-------------------------------------------------------------------------
    // Game_Followers

    Game_Followers.prototype.rrSmartPush = function(command) {
        queueOf(this).push(command);
    };

    Game_Followers.prototype.update = function() {
        if ($gamePlayer._rrSmartDefer) return;
        this.rrSmartUpdateMovement(this.areGathering());
        if (this.areGathering() && this.areGathered()) this._gathering = false;
        for (const follower of this._data) follower.update();
    };

    // Walks the line front to back; `lastFollow` is the character a follower may not pass. Gathering
    // (`force`) skips the spacing rules, so everyone replays the rest of the queue up to the leader.
    Game_Followers.prototype.rrSmartUpdateMovement = function(force) {
        const queue = queueOf(this);
        let lastFollow = null;
        for (const f of this._data) {
            const index = indexOf(f);
            if (!force) {
                let last = lastFollow === null ? $gamePlayer : lastFollow;
                if (indexOf(last) <= 1) last = f;
                if (lastFollow === null && queue[index + 1] === undefined) lastFollow = f;
                if (lastFollow && index + 1 >= indexOf(lastFollow)) lastFollow = f;
                f.rrSmartDisplace(last !== f && last.isMoving());
                if (last.isMoving() || index + 1 >= indexOf(last)) {
                    if (!f.rrSmartDisplaced()) lastFollow = f;
                }
            }
            if (f.isMoving()) lastFollow = f;
            const command = queue[index];
            if (!command) lastFollow = f;
            if (lastFollow === f) continue;
            f._direction = command[2];
            if (command[3] === 'str') f.moveStraight(command[0]);
            else if (command[3] === 'dia') f.moveDiagonally(command[0], command[1]);
            else if (command[3] === 'jum') f.jump(command[0], command[1]);
            f._rrSmartIndex = index + 1;
            lastFollow = f;
        }
        const tail = this._data[this._data.length - 1];
        if (tail && indexOf(tail) > 1) {
            for (const f of this._data) f._rrSmartIndex = indexOf(f) - 1;
            queue.shift();
        }
    };

    const _synchronize = Game_Followers.prototype.synchronize;
    Game_Followers.prototype.synchronize = function(x, y, d) {
        _synchronize.call(this, x, y, d);
        this.rrSmartClearQueue();
    };

    Game_Followers.prototype.rrSmartClearQueue = function() {
        for (const f of this._data) {
            f._rrSmartIndex = 0;
            f._jumpCount = 0;
        }
        this._rrSmartQueue = [];
    };

    //-------------------------------------------------------------------------
    // Game_Follower

    Game_Follower.prototype.update = function() {
        this.setDirectionFix(true);
        this.setMoveSpeed($gamePlayer.realMoveSpeed());
        this.setTransparent($gamePlayer.isTransparent());
        this.setWalkAnime($gamePlayer.hasWalkAnime());
        this.setStepAnime($gamePlayer.hasStepAnime());
        this.setOpacity($gamePlayer.opacity());
        this.setBlendMode($gamePlayer.blendMode());
        Game_Character.prototype.update.call(this);
    };

    // Counts frames spent standing behind a moving character, up to the delay; counts down otherwise.
    Game_Follower.prototype.rrSmartDisplace = function(count) {
        const n = this._rrSmartDispl || 0;
        if (count) {
            if (!this.isMoving() && n < MOVE_DELAY) this._rrSmartDispl = n + 1;
        } else if (n > 0) {
            this._rrSmartDispl = n - 1;
        }
    };

    Game_Follower.prototype.rrSmartDisplaced = function() {
        return (this._rrSmartDispl || 0) >= MOVE_DELAY;
    };
})();
