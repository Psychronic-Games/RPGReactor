/*:
 * @target MZ
 * @plugindesc Special Window Effects (VX Ace), for imported games
 * @author V.M of D.T (Vlue); ported for RPG Reactor
 * @url https://github.com/Psychronic-Games/RPG-Reactor
 *
 * @help RR_VlueWindowEffects.js
 *
 * Every screen's windows arrive and leave with an effect. With slide, each
 * window starts off the nearest edge (a tall window off the left or right,
 * any other off the top or bottom) and slides into place over the next six
 * frames once the screen has faded in; when the screen closes they slide
 * back out the same way before the next screen appears. Fade brings the
 * windows' contents up from nothing (and down again); book opens the
 * windows as they open in messages.
 *
 * While windows move nothing else on the screen runs, and keys wait.
 *
 * Kept from the original: a window in the lower half of the screen that is
 * wider than tall leaves at a speed worked out from its left edge rather
 * than its top, so it overshoots and settles off the bottom; the close slide
 * only happens when the open style is slide too.
 *
 * Installed by File › Import Project… when the imported game carried the
 * original script; its settings were read from the game's copy.
 *
 * @param openStyle
 * @type select
 * @option none
 * @option fade
 * @option slide
 * @option book
 * @option book_oat
 * @default slide
 *
 * @param closeStyle
 * @type select
 * @option none
 * @option fade
 * @option slide
 * @option book
 * @option book_oat
 * @default slide
 *
 * @param speed
 * @type number
 * @min 1
 * @default 5
 * @desc Frames of a slide (one more is taken), or the opacity step of a fade.
 */
(() => {
    'use strict';
    const params = PluginManager.parameters('RR_VlueWindowEffects');
    const OPEN = String(params.openStyle || 'slide');
    const CLOSE = String(params.closeStyle || 'slide');
    const SPEED = Math.max(1, Number(params.speed) || 5);

    /** The scene's own windows (its properties), as the original took the scene's instance variables. */
    const sceneWindows = (scene) => {
        const out = [];
        for (const key of Object.keys(scene)) {
            const v = scene[key];
            if (v instanceof Window && !out.includes(v)) out.push(v);
        }
        return out;
    };

    //-------------------------------------------------------------------------
    // One window's slide
    //-------------------------------------------------------------------------
    const W = Window.prototype;
    W.rrWeffPrepareSlideIn = function() {
        this._rrTargetX = this._rrTargetY = null;
        const sw = Graphics.boxWidth, sh = Graphics.boxHeight;
        if (this.height > this.width) {
            this._rrTargetX = this.x;
            if (this.x < sw / 2) { this.x = -this.width; this._rrSlideSpeed = Math.floor((this._rrTargetX - this.x) / SPEED); }
            else { this.x = sw; this._rrSlideSpeed = Math.floor((this.x - this._rrTargetX) / SPEED); }
        } else {
            this._rrTargetY = this.y;
            if (this.y < sh / 2) { this.y = -this.height; this._rrSlideSpeed = Math.floor((this._rrTargetY - this.y) / SPEED); }
            else { this.y = sh; this._rrSlideSpeed = Math.floor((this.y - this._rrTargetY) / SPEED); }
        }
    };
    W.rrWeffPrepareSlideOut = function() {
        this._rrTargetX = this._rrTargetY = null;
        const sw = Graphics.boxWidth, sh = Graphics.boxHeight;
        if (this.height > this.width) {
            if (this.x < sw / 2) { this._rrTargetX = -this.width; this._rrSlideSpeed = Math.floor((this.x - this._rrTargetX) / SPEED); }
            else { this._rrTargetX = sw; this._rrSlideSpeed = Math.floor((this._rrTargetX - this.x) / SPEED); }
        } else if (this.y < sh / 2) {
            this._rrTargetY = -this.height;
            this._rrSlideSpeed = Math.floor((this.y - this._rrTargetY) / SPEED);
        } else {
            this._rrTargetY = sh;
            // The original measures this one from x.
            this._rrSlideSpeed = Math.floor((this._rrTargetY - this.x) / SPEED);
        }
    };
    W.rrWeffUpdateSlide = function() {
        const s = this._rrSlideSpeed || 0;
        if (this._rrTargetX !== null && this._rrTargetX !== undefined) {
            if (this.x < this._rrTargetX) this.x += s;
            if (this.x > this._rrTargetX) this.x -= s;
        } else if (this._rrTargetY !== null && this._rrTargetY !== undefined) {
            if (this.y < this._rrTargetY) this.y += s;
            if (this.y > this._rrTargetY) this.y -= s;
        }
    };
    W.rrWeffFinishSlide = function() {
        if (this._rrTargetX !== null && this._rrTargetX !== undefined) this.x = this._rrTargetX;
        if (this._rrTargetY !== null && this._rrTargetY !== undefined) this.y = this._rrTargetY;
    };
    // Book: a window showing when the screen starts opens again from nothing.
    W.rrWeffPrepareOpen = function() {
        if (this.openness > 0 && this.visible) { this.openness = 0; this._rrSetToOpen = true; }
    };

    //-------------------------------------------------------------------------
    // The effect a screen is running: frames during which it waits
    //-------------------------------------------------------------------------
    const slideSteps = (windows, onDone) => {
        const steps = [];
        for (let i = 0; i <= SPEED; i++) steps.push(() => windows.forEach(w => w.rrWeffUpdateSlide()));
        return { steps, done: onDone ? () => onDone(windows) : null };
    };
    const fadeSteps = (windows, dir) => {
        const steps = [];
        for (let i = 0; i < Math.floor(255 / SPEED); i++) steps.push(() => windows.forEach(w => { w.contentsOpacity += dir * SPEED; }));
        return { steps, done: null };
    };
    // One window after another, six frames each.
    const bookSteps = (windows, closing) => {
        const steps = [];
        for (const w of windows) {
            if (!w._rrSetToOpen) continue;
            steps.push(() => { closing ? w.close() : w.open(); w.openness += closing ? -48 : 48; });
            for (let i = 1; i < 6; i++) steps.push(() => { w.openness += closing ? -48 : 48; });
        }
        return { steps, done: null };
    };

    function startOpen(scene) {
        const windows = sceneWindows(scene);
        if (OPEN === 'slide') windows.forEach(w => w.rrWeffPrepareSlideIn());
        else if (OPEN === 'fade') windows.forEach(w => { w.contentsOpacity = 0; });
        else if (OPEN === 'book' || OPEN === 'book_oat') windows.forEach(w => w.rrWeffPrepareOpen());
        let effect = null;
        if (OPEN === 'slide') effect = slideSteps(windows, ws => ws.forEach(w => w.rrWeffFinishSlide()));
        else if (OPEN === 'fade') effect = fadeSteps(windows, 1);
        else if (OPEN === 'book') windows.forEach(w => { if (w._rrSetToOpen) w.open(); });
        else if (OPEN === 'book_oat') effect = bookSteps(windows, false);
        if (effect && effect.steps.length) scene._rrWeff = Object.assign(effect, { opening: true, at: 0 });
    }
    function startClose(scene) {
        const windows = sceneWindows(scene);
        if (OPEN === 'slide') windows.forEach(w => w.rrWeffPrepareSlideOut());
        let effect = null;
        // The last slide frame is the one left on screen; the finished positions are never drawn.
        if (CLOSE === 'slide') effect = slideSteps(windows, null);
        else if (CLOSE === 'fade') effect = fadeSteps(windows, -1);
        else if (CLOSE === 'book_oat') effect = bookSteps(windows, true);
        if (effect && effect.steps.length) scene._rrWeff = Object.assign(effect, { opening: false, at: 0 });
    }
    /** One frame of the running effect; false once it has ended (the frame is then the scene's own). */
    function step(scene) {
        const e = scene._rrWeff;
        if (e.at < e.steps.length) { e.steps[e.at++](); return true; }
        if (e.done) e.done();
        scene._rrWeff = null;
        return false;
    }

    const _onSceneStart = SceneManager.onSceneStart;
    SceneManager.onSceneStart = function() {
        _onSceneStart.call(this);
        if (this._scene) startOpen(this._scene);
    };
    const _updateScene = SceneManager.updateScene;
    SceneManager.updateScene = function() {
        const scene = this._scene;
        // The windows come in once the screen has faded in.
        if (scene && scene._rrWeff && !(scene._rrWeff.opening && scene.isFading && scene.isFading())) {
            if (step(scene)) return;
        }
        _updateScene.call(this);
    };
    const _isCurrentSceneBusy = SceneManager.isCurrentSceneBusy;
    SceneManager.isCurrentSceneBusy = function() {
        const scene = this._scene;
        if (scene && scene._rrWeff && !scene._rrWeff.opening) {
            if (scene._rrWeff.at < scene._rrWeff.steps.length) return true;
            scene._rrWeff = null;
            return false;
        }
        if (_isCurrentSceneBusy.call(this)) return true;
        // Leaving: the screen's own fade or effect first, then the windows go.
        if (scene && scene.isStarted() && !scene._rrWeffClosed) {
            scene._rrWeffClosed = true;
            scene._rrWeff = null;
            startClose(scene);
            if (scene._rrWeff) return true;
        }
        return false;
    };
})();
