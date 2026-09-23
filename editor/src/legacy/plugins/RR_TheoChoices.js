/*:
 * @target MZ
 * @plugindesc TheoAllen - VX Style Choices and Napoleon's Window ChoiceList Enhanced (VX Ace), for imported games
 * @author TheoAllen, Napoleon; ported for RPG Reactor
 * @url https://github.com/Psychronic-Games/RPG-Reactor
 *
 * @help RR_TheoChoices.js
 *
 * VX style choices: vx_choice(true/false). While on (the default for a new
 * game, kept in the save), Show Choices is drawn inside the message window
 * below the text, one line per choice, with a highlight bar moved by up/down.
 * When the text and the choices together pass the window's four lines, the
 * text waits for a key and the choices start on a fresh page. While off, the
 * ordinary choice list window appears.
 *
 * Choice list placement: $choicelist_options[:location], [:offset_x],
 * [:offset_y], [:z_index], [:auto_reset] move the ordinary choice list window.
 * Locations: default, center, top_left, top_center, top_right, center_left,
 * center_right, msg_left, msg_center, msg_right, bot_left, bot_center,
 * bot_right. With auto_reset on, the options return to the defaults below
 * each time the list closes. Kept on $gameTemp, so a save does not keep them.
 *
 * Installed by File › Import Project… when the imported game carried the
 * original script; the importer turns the game's Ruby calls into the calls
 * below. Turning the plugin off leaves those calls doing nothing.
 *
 *   $gameMessage._rrVxChoice = true / false
 *   $gameTemp.rrChoiceOptions().location = "center"   (and offset_x, ...)
 *
 * @param location
 * @text Choice list location
 * @type select
 * @option default
 * @option center
 * @option top_left
 * @option top_center
 * @option top_right
 * @option center_left
 * @option center_right
 * @option msg_left
 * @option msg_center
 * @option msg_right
 * @option bot_left
 * @option bot_center
 * @option bot_right
 * @default default
 *
 * @param offsetX
 * @text Offset X
 * @type number
 * @min -9999
 * @default 0
 *
 * @param offsetY
 * @text Offset Y
 * @type number
 * @min -9999
 * @default 0
 *
 * @param zIndex
 * @text Z index
 * @type number
 * @default 320
 * @desc Above 200 the list draws over the message window, 200 or less under it.
 *
 * @param autoReset
 * @text Reset after each list
 * @type boolean
 * @default true
 */
(() => {
    'use strict';
    const params = PluginManager.parameters('RR_TheoChoices');
    const int = (v, d) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : d; };
    const DEFAULTS = {
        location: String(params.location || 'default').replace(/^:/, ''),
        offset_x: int(params.offsetX, 0),
        offset_y: int(params.offsetY, 0),
        z_index: int(params.zIndex, 320),
        auto_reset: params.autoReset !== 'false'
    };
    // The original's z for the message window; the list is layered against it.
    const MESSAGE_Z = 200;

    //-------------------------------------------------------------------------
    // VX style choices
    //-------------------------------------------------------------------------

    const _rrVxGameMessageInit = Game_Message.prototype.initialize;
    Game_Message.prototype.initialize = function() {
        _rrVxGameMessageInit.call(this);
        this._rrVxChoice = true;
    };

    // Saves from before the plugin carry no flag; the original's default is on.
    const rrVxChoiceOn = () => $gameMessage._rrVxChoice !== false;

    const _rrVxStartInput = Window_Message.prototype.startInput;
    Window_Message.prototype.startInput = function() {
        if ($gameMessage.isChoice() && rrVxChoiceOn()) {
            this.rrStartVxChoice();
            return true;
        }
        return _rrVxStartInput.call(this);
    };

    Window_Message.prototype.rrVisibleLines = function() {
        return Math.max(1, Math.floor(this.innerHeight / this.lineHeight()));
    };

    Window_Message.prototype.rrStartVxChoice = function() {
        const ts = this._textState;
        // The line below the text. Choices with no text of their own start on an empty window.
        let y = ts ? ts.y + ts.height : 0;
        if (!ts) {
            this.contents.clear();
            if ($gameMessage.faceName()) this.drawMessageFace();
            y = 0;
        }
        this._rrVx = { phase: 'start', index: 0, drawn: 0, y };
        if (!this.isOpen()) {
            this.updatePlacement();
            this.updateBackground();
            this.open();
        }
    };

    const _rrVxUpdateInput = Window_Message.prototype.updateInput;
    Window_Message.prototype.updateInput = function() {
        if (this._rrVx) {
            this.rrUpdateVxChoice();
            return true;
        }
        return _rrVxUpdateInput.call(this);
    };

    // Frame waits go through _waitCount, which update() consumes before input.
    Window_Message.prototype.rrUpdateVxChoice = function() {
        const s = this._rrVx;
        const choices = $gameMessage.choices();
        const lh = this.lineHeight();
        if (s.phase === 'start') {
            if ($gameMessage._texts.length + choices.length > this.rrVisibleLines()) {
                this.pause = true;
                this._waitCount = 10;
                s.phase = 'pause';
                return;
            }
            s.phase = 'draw';
        }
        if (s.phase === 'pause') {
            if (!this.isTriggered()) return;
            Input.update();
            this.pause = false;
            this.contents.clear();
            if ($gameMessage.faceName()) this.drawMessageFace();
            s.y = 0;
            s.phase = 'draw';
        }
        if (s.phase === 'draw') {
            if (s.drawn < choices.length) {
                this.drawTextEx(choices[s.drawn], this.rrChoiceLineX() + 16, s.y + s.drawn * lh, this.innerWidth);
                s.drawn++;
                this._waitCount = 3;
                return;
            }
            this.rrRefreshVxCursor();
            this._waitCount = 10;
            s.phase = 'input';
            return;
        }
        const cancelType = $gameMessage.choiceCancelType();
        if (Input.isTriggered('ok')) return this.rrFinishVxChoice(s.index, true);
        if (Input.isTriggered('cancel') && cancelType !== -1) return this.rrFinishVxChoice(cancelType, false);
        if (TouchInput.isTriggered()) {
            const hit = this.rrVxChoiceHit(choices.length);
            if (hit >= 0) return this.rrFinishVxChoice(hit, true);
        }
        if (TouchInput.isCancelled() && cancelType !== -1) return this.rrFinishVxChoice(cancelType, false);
        if (Input.isRepeated('down')) this.rrMoveVxChoice(1, choices.length);
        if (Input.isRepeated('up')) this.rrMoveVxChoice(-1, choices.length);
        this.rrRefreshVxCursor();
    };

    Window_Message.prototype.rrChoiceLineX = function() {
        return this.newLineX({ rtl: false });
    };

    Window_Message.prototype.rrRefreshVxCursor = function() {
        const s = this._rrVx, x = this.rrChoiceLineX(), lh = this.lineHeight();
        this.setCursorRect(x, s.y + s.index * lh, this.innerWidth - x, lh);
    };

    Window_Message.prototype.rrMoveVxChoice = function(amount, count) {
        SoundManager.playCursor();
        const s = this._rrVx;
        s.index += amount;
        if (s.index > count - 1) s.index = 0;
        if (s.index < 0) s.index = count - 1;
    };

    // A click on a choice row picks it; the original was keyboard only.
    Window_Message.prototype.rrVxChoiceHit = function(count) {
        const local = this.worldTransform.applyInverse(new Point(TouchInput.x, TouchInput.y));
        const cx = local.x - this.padding, cy = local.y - this.padding;
        const s = this._rrVx, lh = this.lineHeight();
        if (cx < this.rrChoiceLineX() || cx >= this.innerWidth) return -1;
        const row = Math.floor((cy - s.y) / lh);
        return row >= 0 && row < count ? row : -1;
    };

    Window_Message.prototype.rrFinishVxChoice = function(n, ok) {
        if (ok) SoundManager.playOk();
        else SoundManager.playCancel();
        this.setCursorRect(0, 0, 0, 0);
        this._rrVx = null;
        $gameMessage.onChoice(n);
        Input.update();
        this.terminateMessage();
    };

    //-------------------------------------------------------------------------
    // Choice list placement
    //-------------------------------------------------------------------------

    Game_Temp.prototype.rrChoiceOptions = function() {
        if (!this._rrChoiceOptions) this._rrChoiceOptions = Object.assign({}, DEFAULTS);
        return this._rrChoiceOptions;
    };

    Game_Temp.prototype.rrResetChoiceOptions = function() {
        Object.assign(this.rrChoiceOptions(), DEFAULTS);
    };

    // The message window's y decides above/below; the list goes on the side away from it.
    Window_ChoiceList.prototype.rrBesideMessageY = function() {
        const mw = this._messageWindow;
        return mw.y >= Graphics.boxHeight / 2 ? mw.y - this.height : mw.y + mw.height;
    };

    Window_ChoiceList.prototype.rrPlace = function(location) {
        const W = Graphics.boxWidth, H = Graphics.boxHeight, w = this.width, h = this.height;
        const mh = this._messageWindow.height;
        const middleY = (H - mh) / 2 - h / 2;
        switch (location) {
            case 'default': return [W - w, this.rrBesideMessageY()];
            case 'center': return [W / 2 - w / 2, middleY];
            case 'top_left': return [0, 0];
            // The original computes this x from the heights; kept so the game's layout matches.
            case 'top_center': return [middleY, 0];
            case 'top_right': return [W - w, 0];
            case 'center_left': case 'left_center': return [0, middleY];
            case 'center_right': case 'right_center': return [W - w, middleY];
            case 'msg_left': return [0, this.rrBesideMessageY()];
            case 'msg_center': return [W / 2 - w / 2, this.rrBesideMessageY()];
            case 'msg_right': return [W - w, this.rrBesideMessageY()];
            case 'bot_left': return [0, H - h];
            case 'bot_center': return [W / 2 - w / 2, H - h];
            case 'bot_right': return [W - w, H - h];
            default: return null;
        }
    };

    const _rrChoiceUpdatePlacement = Window_ChoiceList.prototype.updatePlacement;
    Window_ChoiceList.prototype.updatePlacement = function() {
        _rrChoiceUpdatePlacement.call(this);
        const o = $gameTemp.rrChoiceOptions();
        // An unknown location keeps the stock placement (the original raised an error).
        const pos = this.rrPlace(String(o.location || 'default').replace(/^:/, ''));
        if (!pos) return;
        this.x = Math.floor(pos[0] + (Number(o.offset_x) || 0));
        this.y = Math.floor(pos[1] + (Number(o.offset_y) || 0));
        this.rrApplyZ(Number(o.z_index));
    };

    Window_ChoiceList.prototype.rrApplyZ = function(z) {
        const parent = this.parent, mw = this._messageWindow;
        if (!Number.isFinite(z) || !parent || !mw || mw.parent !== parent) return;
        const above = z > MESSAGE_Z;
        const mine = parent.children.indexOf(this), theirs = parent.children.indexOf(mw);
        if (above === mine > theirs) return;
        parent.removeChild(this);
        parent.addChildAt(this, parent.children.indexOf(mw) + (above ? 1 : 0));
    };

    const _rrChoiceClose = Window_ChoiceList.prototype.close;
    Window_ChoiceList.prototype.close = function() {
        _rrChoiceClose.call(this);
        if ($gameTemp && $gameTemp.rrChoiceOptions().auto_reset) $gameTemp.rrResetChoiceOptions();
    };
})();
