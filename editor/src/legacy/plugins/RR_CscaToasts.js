/*:
 * @target MZ
 * @plugindesc CSCA Toast Manager and Quest Toast Extension (VX Ace), for imported games
 * @author Casper Gaming; ported for RPG Reactor
 * @url https://github.com/Psychronic-Games/RPG-Reactor
 *
 * @help RR_CscaToasts.js
 *
 * Short notices that fade in over the middle of the screen, three at most at
 * a time (top, middle, bottom slots), each shown for a while and faded out;
 * more wait their turn. None appear on the title, save, load, name entry,
 * game end and game over screens.
 *   window.rrCscaToast("text", line1, line2)
 *   window.rrCscaToast("quest_started" | "quest_advanced" | "quest_complete" | "quest_failed", questKey)
 * Quest notices name the quest (and the next step when it advances), in the
 * game's colours and with its sounds.
 *
 * Installed by File › Import Project… when the imported game carried the
 * original scripts; their settings were read from the game's copies.
 *
 * @param showCount
 * @type number
 * @default 160
 *
 * @param fadeSpeed
 * @type number
 * @default 16
 *
 * @param quests
 * @type multiline_string
 * @default {}
 * @desc JSON: { started|advanced|complete|failed: { show, me, se, color }, completeTwice }. A completion is reserved twice when both scripts reserve it.
 */
(() => {
    'use strict';
    const params = PluginManager.parameters('RR_CscaToasts');
    const SHOW = Number(params.showCount) || 160;
    const FADE = Number(params.fadeSpeed) || 16;
    let QUESTS = {};
    try { QUESTS = JSON.parse(params.quests || '{}') || {}; } catch (_) { QUESTS = {}; }

    const queue = () => {
        const csca = $gameSystem.rrCsca ? $gameSystem.rrCsca() : ($gameSystem._rrCsca = $gameSystem._rrCsca || {});
        if (!csca.toasts) csca.toasts = [];
        return csca.toasts;
    };
    const quiet = () => {
        const s = SceneManager._scene;
        return !s || [Scene_Title, Scene_Gameover, Scene_Debug, Scene_File, Scene_Save, Scene_Load, Scene_GameEnd, Scene_Name].some(c => typeof c === 'function' && s instanceof c);
    };
    window.rrCscaToast = function(kind, ...args) {
        if (!$gameSystem || quiet()) return;
        queue().push([kind, ...args]);
    };
    // The quest scripts reserve their notices here; a completion also reserved one in the base script.
    window.rrCscaQuestToast = function(kind, key) {
        const q = QUESTS[kind];
        if (!q || !q.show) return;
        window.rrCscaToast('quest_' + kind, key);
        if (kind === 'complete' && QUESTS.completeTwice) window.rrCscaToast('quest_' + kind, key);
    };

    const quest = (key) => (window.ReactorQuests && ReactorQuests.find ? ReactorQuests.find(String(key)) : null);
    const playMe = (name) => { if (name) AudioManager.playMe({ name: String(name), volume: 100, pitch: 100, pan: 0 }); };
    // A sound effect from the ME folder, as the quest script played its completion sound: it does not stop the music.
    const playSeFrom = (folder, name) => {
        if (!name) return;
        const se = { name: String(name), volume: 100, pitch: 100, pan: 0 };
        const buffer = AudioManager.createBuffer(folder, se.name);
        AudioManager.updateSeParameters(buffer, se);
        buffer.play(false);
        AudioManager._seBuffers.push(buffer);
    };

    function Window_RRToast() { this.initialize(...arguments); }
    Window_RRToast.prototype = Object.create(Window_Base.prototype);
    Window_RRToast.prototype.constructor = Window_RRToast;
    Window_RRToast.prototype.initialize = function(order) {
        const lh = Window_Base.prototype.lineHeight.call(this);
        const width = Math.floor(Graphics.boxWidth / 2), height = lh * 3;
        const y = Math.floor((Graphics.boxHeight - height * 2) / 2) + lh * order;
        Window_Base.prototype.initialize.call(this, new Rectangle(Math.floor(Graphics.boxWidth / 4), y, width, height));
        this.opacity = 0;
        this.contentsOpacity = 0;
        this._showCount = 0;
        this.gone = true;
    };
    Window_RRToast.prototype.update = function() {
        Window_Base.prototype.update.call(this);
        if (this._showCount > 0) {
            this.opacity += FADE;
            this.contentsOpacity += FADE;
            this._showCount--;
        } else if (!this.gone) {
            this.opacity -= FADE;
            this.contentsOpacity -= FADE;
            if (this.opacity <= 0 && this.contentsOpacity <= 0) this.gone = true;
        }
    };
    Window_RRToast.prototype.show = function(params) {
        this.refresh(params);
        this._showCount = SHOW;
        this.gone = false;
    };
    Window_RRToast.prototype.header = function(text, color) {
        this.contents.clear();
        this.contents.fontBold = true;
        this.changeTextColor(ColorManager.textColor(Number(color) || 0));
        this.drawText(text, 0, 0, this.innerWidth, 'center');
        this.contents.fontBold = false;
        this.resetTextColor();
    };
    Window_RRToast.prototype.refresh = function(params) {
        this.contents.clear();
        this.resetFontSettings();
        const [kind, a, b] = params;
        const lh = this.lineHeight(), w = this.innerWidth;
        if (kind === 'text') {
            this.drawText(String(a ?? ''), 0, 0, w, 'center');
            this.drawText(String(b ?? ''), 0, lh, w, 'center');
            return;
        }
        const q = quest(a);
        const name = q ? q.name : String(a);
        const titles = { quest_started: 'Quest Started!', quest_advanced: 'Quest Advanced!', quest_complete: 'Quest Complete!', quest_failed: 'Quest Failed!' };
        const setting = QUESTS[kind.replace('quest_', '')];
        if (!titles[kind] || !setting) return;
        playMe(setting.me);
        playSeFrom('me/', setting.se);
        this.header(titles[kind], setting.color);
        this.drawText(name, 0, lh, w, 'center');
        if (kind === 'quest_advanced' && q) {
            const csca = $gameSystem.rrCsca ? $gameSystem.rrCsca() : {};
            const progress = csca.quests && csca.quests[q.key] ? csca.quests[q.key].progress : 0;
            const step = (q.objectives || [])[progress];
            // Drawn on the third line, which the window's size cuts off, as it did in the original.
            if (step) this.drawText('Next: ' + step.text, 0, lh * 2, w, 'center');
        }
    };

    const _start = Scene_Base.prototype.start;
    Scene_Base.prototype.start = function() {
        _start.call(this);
        if (quiet() || !$gameSystem) return;
        this._rrToasts = [6, 3, 0].map(order => new Window_RRToast(order));
        for (const w of this._rrToasts) this.addChild(w);
    };
    const _update = Scene_Base.prototype.update;
    Scene_Base.prototype.update = function() {
        _update.call(this);
        if (!this._rrToasts) return;
        const q = queue();
        while (q.length && this._rrToasts.some(w => w.gone)) this._rrToasts.find(w => w.gone).show(q.shift());
    };
})();
