/*:
 * @target MZ
 * @plugindesc V's Custom Animated Title Scene (VX Ace), for imported games
 * @author V; ported for RPG Reactor
 * @url https://github.com/Psychronic-Games/RPG-Reactor
 *
 * @help RR_VAnimatedTitle.js
 *
 * A layered, animated title screen. Each layer is an image from
 * img/titles1/ placed at x, y with its origin at ox, oy, drawn by z (over the
 * command window from Command window Z up), and animated by its list of
 * animation types. The System title images and drawn game title are not
 * shown.
 *
 * Animation types (the layer keys each one reads):
 *   0  none
 *   1  rotate clockwise: rotation_speed degrees every rotation_frame_rate frames
 *   2  rotate counter-clockwise by rotation_speed (every update; the
 *      frame rate does not slow it)
 *   3  scroll right   ┐ scroll_speed pixels every scroll_frame_rate frames,
 *   4  scroll left    │ wrapping at the screen edge
 *   5  scroll down    │
 *   6  scroll up      ┘
 *   7  fade out and back in: fade_speed every fade_frame_rate frames,
 *      between fade_min_opacity (25) and fade_max_opacity (255)
 *   8  hour hand of the computer clock
 *   9  minute hand of the computer clock
 *   10 wave: the rows bend sideways, the bend growing to wave_strength and
 *      back by 1 every wave_frame_rate frames
 *   11 blend: normal → add → subtract → add → … every blend_frame_rate frames
 *      (subtract is drawn as multiply, the nearest blend this engine has)
 *   12 frames: name_0 … name_<max_variable_frames>, one every
 *      variable_frame_rate frames
 *   13 cursor: follows the selected command
 *   14 fade out once: from start_fade_out frames, fade_out_speed every
 *      fade_out_frame_rate frames
 *
 * Opening animations run first, from initialize_time frames, until each is
 * done: 1 / 2 rotate to initialize_rotation_final_angle, 3 / 4 move to
 * initialize_move_final_x, 5 / 6 to initialize_move_final_y (right, left,
 * down, up), 7 fade in to fade_max_opacity (255); each steps by its
 * initialize_*_speed every initialize_*_frame_rate frames. Optional
 * starting keys: angle, blend (0 normal, 1 add, 2 subtract).
 *
 * Frames count from the end of the fade-in, as they did in the original.
 * The command window opens inactive and takes input after Command window
 * activate time. The first three commands play their own sound (New Game,
 * Continue, and the third command, which was Shutdown in the original);
 * later commands play none. The cursor sound stays until New Game or
 * Continue is chosen. A missing image draws nothing.
 *
 * Installed by File › Import Project… when the imported game carried the
 * original script; its settings were read from the game's copy.
 *
 * @param layers
 * @text Layers
 * @type multiline_string
 * @default []
 * @desc JSON: [{"name":"image","x":0,"y":0,"z":1,"ox":0,"oy":0,"opacity":255,"animation_types":[0], …}] with the keys above.
 *
 * @param fadeSpeed
 * @text Fade-in frames
 * @type number
 * @default 60
 *
 * @param playSplashMovie
 * @text Play splash movie
 * @type boolean
 * @default false
 *
 * @param playOnNewGame
 * @text Movie after New Game
 * @type boolean
 * @default false
 * @desc On: the movie plays after New Game instead of before the title.
 *
 * @param movieName
 * @text Movie
 * @desc A file in movies/, without extension.
 * @default
 *
 * @param bgm
 * @text Title BGM
 * @type struct<Sound>
 * @default {"name":"","volume":"100","pitch":"100"}
 *
 * @param bgs
 * @text Title BGS
 * @type struct<Sound>
 * @default {"name":"","volume":"100","pitch":"100"}
 *
 * @param newGameSe
 * @text First command SE
 * @type struct<Sound>
 * @default {"name":"Decision1","volume":"100","pitch":"100"}
 *
 * @param continueSe
 * @text Second command SE
 * @type struct<Sound>
 * @default {"name":"Decision1","volume":"100","pitch":"100"}
 *
 * @param shutdownSe
 * @text Third command SE
 * @type struct<Sound>
 * @default {"name":"Decision1","volume":"100","pitch":"100"}
 *
 * @param cancelSe
 * @text Cancel SE
 * @type struct<Sound>
 * @default {"name":"Cancel1","volume":"100","pitch":"100"}
 *
 * @param buzzerSe
 * @text Buzzer SE
 * @type struct<Sound>
 * @default {"name":"Buzzer1","volume":"100","pitch":"100"}
 *
 * @param cursorSe
 * @text Cursor SE
 * @type struct<Sound>
 * @default {"name":"Cursor1","volume":"100","pitch":"100"}
 *
 * @param activateTime
 * @text Command window activate time
 * @type number
 * @default 60
 * @desc Frames after the fade-in before the commands take input.
 *
 * @param horizontal
 * @text Horizontal commands
 * @type boolean
 * @default false
 *
 * @param commandX
 * @text Command window X
 * @type number
 * @min -9999
 * @default 0
 *
 * @param commandY
 * @text Command window Y
 * @type number
 * @min -9999
 * @default 0
 *
 * @param commandZ
 * @text Command window Z
 * @type number
 * @min -9999
 * @default 100
 *
 * @param commandWidth
 * @text Command window width
 * @type number
 * @default 175
 *
 * @param commandHeight
 * @text Command window height
 * @type number
 * @default 120
 *
 * @param commandOpacity
 * @text Command window opacity
 * @type number
 * @max 255
 * @default 255
 *
 * @param commandBackOpacity
 * @text Command window back opacity
 * @type number
 * @max 255
 * @default 192
 *
 * @param useTextCommands
 * @text Text commands
 * @type boolean
 * @default true
 * @desc Off: the commands are the Command images instead of text.
 *
 * @param commandAlign
 * @text Text alignment
 * @type select
 * @option left
 * @option center
 * @option right
 * @default center
 *
 * @param commandFont
 * @text Font
 * @desc Font name; the game's main font stands in when it is not installed.
 * @default
 *
 * @param commandTextSize
 * @text Text size
 * @type number
 * @default 24
 *
 * @param commandTextColor
 * @text Text colour
 * @type select
 * @option normal_color
 * @option system_color
 * @option crisis_color
 * @option knockout_color
 * @option gauge_back_color
 * @option power_up_color
 * @option power_down_color
 * @option hp_gauge_color1
 * @option hp_gauge_color2
 * @option mp_gauge_color1
 * @option mp_gauge_color2
 * @option mp_cost_color
 * @option tp_gauge_color1
 * @option tp_gauge_color2
 * @option tp_cost_color
 * @default normal_color
 *
 * @param rectWidth
 * @text Command width
 * @type number
 * @default 170
 *
 * @param rectHeight
 * @text Command height
 * @type number
 * @default 24
 *
 * @param rectSpacing
 * @text Command spacing
 * @type number
 * @default 4
 *
 * @param cursorWidth
 * @text Cursor layer step width
 * @type number
 * @default 170
 *
 * @param cursorHeight
 * @text Cursor layer step height
 * @type number
 * @default 24
 *
 * @param cursorSpacing
 * @text Cursor layer spacing
 * @type number
 * @default 10
 *
 * @param commandImages
 * @text Command images
 * @type multiline_string
 * @default []
 * @desc JSON: [{"name":"image","ox":0,"oy":0}], one per command, used when Text commands is off.
 *
 * @param noSaveImage
 * @text No save files image
 * @type multiline_string
 * @default {"name":"","ox":0,"oy":0}
 * @desc JSON: the second command image while there is no save to continue.
 */
/*~struct~Sound:
 * @param name
 * @text Name
 * @default
 *
 * @param volume
 * @text Volume
 * @type number
 * @max 100
 * @default 100
 *
 * @param pitch
 * @text Pitch
 * @type number
 * @min 50
 * @max 150
 * @default 100
 */
(() => {
    'use strict';
    const params = PluginManager.parameters('RR_VAnimatedTitle');
    const num = (v, d) => (v === undefined || v === '' || isNaN(Number(v)) ? d : Number(v));
    const json = (v, d) => { try { return v ? JSON.parse(v) : d; } catch (_) { return d; } };
    const sound = (v) => { const s = json(v, {}) || {}; return { name: String(s.name || ''), volume: num(s.volume, 100), pitch: num(s.pitch, 100), pan: 0 }; };

    const LAYERS = (Array.isArray(json(params.layers, [])) ? json(params.layers, []) : []).filter(l => l && l.name);
    const FADE_SPEED = num(params.fadeSpeed, 60);
    const MOVIE = params.playSplashMovie === 'true' ? String(params.movieName || '') : '';
    const MOVIE_ON_NEW_GAME = params.playOnNewGame === 'true';
    const BGM = sound(params.bgm), BGS = sound(params.bgs);
    const COMMAND_SE = [sound(params.newGameSe), sound(params.continueSe), sound(params.shutdownSe)];
    const CANCEL_SE = sound(params.cancelSe), BUZZER_SE = sound(params.buzzerSe), CURSOR_SE = sound(params.cursorSe);
    const ACTIVATE_TIME = num(params.activateTime, 60);
    const HORIZONTAL = params.horizontal === 'true';
    const CMD = {
        x: num(params.commandX, 0), y: num(params.commandY, 0), z: num(params.commandZ, 100),
        width: num(params.commandWidth, 175), height: num(params.commandHeight, 120),
        opacity: num(params.commandOpacity, 255), backOpacity: num(params.commandBackOpacity, 192),
        text: params.useTextCommands !== 'false', align: ['left', 'center', 'right'].includes(params.commandAlign) ? params.commandAlign : 'center',
        font: String(params.commandFont || ''), size: num(params.commandTextSize, 24), color: String(params.commandTextColor || 'normal_color'),
        rectW: num(params.rectWidth, 170), rectH: num(params.rectHeight, 24), spacing: num(params.rectSpacing, 4),
        cursorW: num(params.cursorWidth, 170), cursorH: num(params.cursorHeight, 24), cursorSpacing: num(params.cursorSpacing, 10)
    };
    const COMMAND_IMAGES = (Array.isArray(json(params.commandImages, [])) ? json(params.commandImages, []) : []).filter(i => i && typeof i.name === 'string');
    const NO_SAVE_IMAGE = json(params.noSaveImage, {}) || {};

    // The colour names the original accepted. Its mp_gauge_color2 matched the hp_gauge_color2 line first.
    const COLORS = {
        normal_color: 'normalColor', system_color: 'systemColor', crisis_color: 'crisisColor', knockout_color: 'deathColor',
        gauge_back_color: 'gaugeBackColor', power_up_color: 'powerUpColor', power_down_color: 'powerDownColor',
        hp_gauge_color1: 'hpGaugeColor1', hp_gauge_color2: 'hpGaugeColor2', mp_gauge_color1: 'mpGaugeColor1', mp_gauge_color2: 'hpGaugeColor2',
        mp_cost_color: 'mpCostColor', tp_gauge_color1: 'tpGaugeColor1', tp_gauge_color2: 'tpGaugeColor2', tp_cost_color: 'tpCostColor'
    };
    const BLEND_MODES = [0, 1, 2];   // normal, add, subtract (multiply stands in)
    const WAVE_STRIP = 4;            // rows per wave strip
    const WAVE_LENGTH = 180;         // the original never changed the sprite's wave length or phase

    // The original's $title: its cursor sound plays until New Game or Continue closes the title.
    let titleCursor = true;

    // ---- images --------------------------------------------------------------

    /** Title images outside ImageManager's cache, so a missing one draws nothing instead of stopping the game. */
    const bitmaps = new Map();
    function titleBitmap(name) {
        if (!name) return null;
        let url = 'img/titles1/' + Utils.encodeURI(name);
        if (!ImageManager._imageExtensions.some(e => url.toLowerCase().endsWith(e))) url += '.png';
        if (bitmaps.has(url)) return bitmaps.get(url);
        let actual = url;
        try { actual = (Utils.correctFileCase && Utils.correctFileCase(url)) || url; } catch (_) { actual = url; }
        const bitmap = Bitmap.load(actual);
        bitmaps.set(url, bitmap);
        return bitmap;
    }
    const settled = (b) => !b || b.isReady() || b.isError();
    const usable = (b) => b && !b.isError() && b.isReady() ? b : null;

    // ---- one layer: the original's sprite and its @layers_info entry ----------

    function makeLayer(def, order) {
        const info = {
            animation_types: Array.isArray(def.animation_types) ? def.animation_types.slice() : [0],
            rotation_frame: 0, scroll_frame: 0, fade_frame: 0, fade_out_frame: 0, fade_out_time: 0, wave_frame: 0, blend_frame: 0,
            variable_frame: 0, variable_id: 0, initialize_rotation_frame: 0, initialize_move_frame: 0, initialize_fade_in_frame: 0,
            fade_switch: true, wave_switch: true, blend_switch: true, initialize_frame: 0, initialize_switch: true,
            initialize_time: def.initialize_time !== undefined ? def.initialize_time : 0,
            initialize_animations: Array.isArray(def.initialize_animations) ? def.initialize_animations.slice() : [0]
        };
        for (const key of ['rotation_speed', 'scroll_speed', 'fade_speed', 'rotation_frame_rate', 'scroll_frame_rate', 'fade_frame_rate',
            'start_fade_out', 'fade_out_frame_rate', 'fade_out_speed', 'fade_max_opacity', 'fade_min_opacity', 'wave_frame_rate',
            'blend_frame_rate', 'variable_frame_rate', 'max_variable_frames', 'initialize_rotation_frame_rate', 'initialize_rotation_speed',
            'initialize_rotation_final_angle', 'initialize_move_frame_rate', 'initialize_move_speed', 'initialize_move_final_x',
            'initialize_move_final_y', 'initialize_fade_in_frame_rate', 'initialize_fade_in_speed']) {
            if (def[key] !== undefined && def[key] !== null) info[key] = def[key];
        }
        if (def.wave_frame_rate !== undefined) info.wave_strength = def.wave_strength;

        // Frame layers (name_0, name_1, …) are all loaded up front.
        const frames = info.max_variable_frames !== undefined
            ? Array.from({ length: Math.max(0, Math.floor(info.max_variable_frames)) + 1 }, (_, i) => titleBitmap(def.name + '_' + i))
            : [titleBitmap(def.name)];

        const holder = new Sprite();
        const image = new Sprite(frames[0]);
        holder.addChild(image);
        const layer = {
            name: def.name, z: num(def.z, 0), order, info, frames, holder, image, strips: null, stripsFor: null, bitmap: frames[0],
            _x: 0, _y: 0, _opacity: 255, _blend: 0, _wave: 0, angle: num(def.angle, 0),
            ox: num(def.ox, 0), oy: num(def.oy, 0),
            // Integer fields, as the original sprite kept them (fractions dropped, opacity 0..255).
            get x() { return this._x; }, set x(v) { this._x = Math.trunc(Number(v) || 0); },
            get y() { return this._y; }, set y(v) { this._y = Math.trunc(Number(v) || 0); },
            get opacity() { return this._opacity; }, set opacity(v) { this._opacity = Math.min(255, Math.max(0, Math.trunc(Number(v) || 0))); },
            get blend_type() { return this._blend; }, set blend_type(v) { this._blend = Math.min(2, Math.max(0, Math.trunc(Number(v) || 0))); },
            get wave_amp() { return this._wave; }, set wave_amp(v) { this._wave = Math.max(0, Math.trunc(Number(v) || 0)); },
            get width() { const b = usable(this.bitmap); return b ? b.width : 0; },
            get height() { const b = usable(this.bitmap); return b ? b.height : 0; }
        };
        layer.x = def.x === undefined || def.x === null ? CMD.x : def.x;
        layer.y = def.y === undefined || def.y === null ? CMD.y : def.y;
        layer.opacity = num(def.opacity, 255);
        if (def.blend !== undefined) layer.blend_type = def.blend;
        applyLayer(layer);
        return layer;
    }

    /** The layer's state onto its sprites: origin at ox, oy, angles counter-clockwise. */
    function applyLayer(layer) {
        const holder = layer.holder;
        holder.x = layer.x;
        holder.y = layer.y;
        holder.rotation = -layer.angle * Math.PI / 180;
        holder.opacity = layer.opacity;
        const blend = BLEND_MODES[layer.blend_type] || 0;
        const bitmap = usable(layer.bitmap);
        if (layer.wave_amp > 0 && bitmap) {
            if (layer.stripsFor !== bitmap) buildStrips(layer, bitmap);
            layer.image.visible = false;
            for (const strip of layer.strips) {
                strip.x = -layer.ox + layer.wave_amp * Math.sin((strip._rrRow / WAVE_LENGTH) * Math.PI * 2);
                if (strip.blendMode !== blend) strip.blendMode = blend;
            }
        } else {
            if (layer.strips) for (const strip of layer.strips) strip.visible = false;
            layer.image.visible = true;
            const shown = layer.bitmap && !layer.bitmap.isError() ? layer.bitmap : null;
            if (layer.image.bitmap !== shown) layer.image.bitmap = shown;
            layer.image.x = -layer.ox;
            layer.image.y = -layer.oy;
            if (layer.image.blendMode !== blend) layer.image.blendMode = blend;
        }
    }

    /** Wave: the image cut into horizontal strips, each pushed sideways by its row. */
    function buildStrips(layer, bitmap) {
        if (layer.strips) for (const strip of layer.strips) layer.holder.removeChild(strip);
        layer.strips = [];
        for (let row = 0; row < bitmap.height; row += WAVE_STRIP) {
            const strip = new Sprite(bitmap);
            strip.setFrame(0, row, bitmap.width, Math.min(WAVE_STRIP, bitmap.height - row));
            strip.y = -layer.oy + row;
            strip._rrRow = row;
            layer.holder.addChild(strip);
            layer.strips.push(strip);
        }
        layer.stripsFor = bitmap;
    }

    // ---- scene ---------------------------------------------------------------

    const _createBackground = Scene_Title.prototype.createBackground;
    Scene_Title.prototype.createBackground = function() {
        // The layers take the System title images' place; those are not drawn.
        this._rrBack = new Sprite();
        this.addChild(this._rrBack);
        if (!LAYERS.length && !COMMAND_IMAGES.length) _createBackground.call(this);
    };

    const _createForeground = Scene_Title.prototype.createForeground;
    Scene_Title.prototype.createForeground = function() {
        if (!LAYERS.length && !COMMAND_IMAGES.length) _createForeground.call(this);
        else this._gameTitleSprite = null;
    };

    const _adjustBackground = Scene_Title.prototype.adjustBackground;
    Scene_Title.prototype.adjustBackground = function() {
        if (this._backSprite1) _adjustBackground.call(this);
    };

    const _create = Scene_Title.prototype.create;
    Scene_Title.prototype.create = function() {
        _create.call(this);
        // Layers from Command window Z up draw over the windows, the rest under them.
        this._rrFront = new Sprite();
        this.addChild(this._rrFront);
        this._rrTimer = 0;
        this._rrHour = null;
        this._rrMinute = null;
        this._rrLayers = LAYERS.map((def, i) => makeLayer(def, i));
        const placed = this._rrLayers.map(l => ({ sprite: l.holder, z: l.z, order: l.order }));
        if (!CMD.text) placed.push(...this.rrCommandImages());
        placed.sort((a, b) => a.z - b.z || a.order - b.order);
        for (const p of placed) (p.z >= CMD.z ? this._rrFront : this._rrBack).addChild(p.sprite);
    };

    /** Command images: one per command, placed from the command window's position. */
    Scene_Title.prototype.rrCommandImages = function() {
        const continueEnabled = this._commandWindow && this._commandWindow.isContinueEnabled();
        const stepX = CMD.rectW + CMD.spacing, stepY = CMD.rectH + CMD.spacing;
        return COMMAND_IMAGES.map((image, index) => {
            const use = index !== 1 || continueEnabled ? image : NO_SAVE_IMAGE;
            const holder = new Sprite();
            const sprite = new Sprite(titleBitmap(String(use.name || '')));
            sprite.x = -num(use.ox, 0);
            sprite.y = -num(use.oy, 0);
            holder.addChild(sprite);
            holder.x = HORIZONTAL ? CMD.x + stepX * index : CMD.x;
            holder.y = HORIZONTAL ? CMD.y : CMD.y + stepY * index;
            (this._rrImages = this._rrImages || []).push(sprite);
            // Made with the window, before any layer of the same z.
            return { sprite: holder, z: CMD.z, order: -1 };
        });
    };

    const _isReady = Scene_Title.prototype.isReady;
    Scene_Title.prototype.isReady = function() {
        if (!_isReady.call(this)) return false;
        const pending = (this._rrLayers || []).some(l => !l.frames.every(settled)) || (this._rrImages || []).some(s => !settled(s.bitmap));
        if (pending) return false;
        for (const sprite of this._rrImages || []) if (sprite.bitmap && sprite.bitmap.isError()) sprite.bitmap = null;
        // Sizes are known now: wave strips and first frames can be built.
        for (const layer of this._rrLayers || []) applyLayer(layer);
        return true;
    };

    const _createCommandWindow = Scene_Title.prototype.createCommandWindow;
    Scene_Title.prototype.createCommandWindow = function() {
        _createCommandWindow.call(this);
        const w = this._commandWindow;
        w.opacity = CMD.opacity;
        w.backOpacity = CMD.backOpacity;
        this._rrActive = true;
        if (ACTIVATE_TIME > 0) { w.deactivate(); this._rrActive = false; }
    };

    Scene_Title.prototype.commandWindowRect = function() {
        return new Rectangle(CMD.x, CMD.y, CMD.width, CMD.height);
    };

    const _start = Scene_Title.prototype.start;
    Scene_Title.prototype.start = function() {
        const skipped = $dataSystem && $dataSystem.rrSkipTitle;
        // The splash movie plays before the title appears: black and silent until it ends.
        if (!skipped && !MOVIE_ON_NEW_GAME && playMovie()) this._rrMovie = 'intro';
        _start.call(this);
        if (skipped) return;
        titleCursor = true;
        if (this._rrMovie) {
            this._fadeDuration = 0;
            this._fadeOpacity = 255;
            this.updateColorFilter();
        } else {
            this.startFadeIn(FADE_SPEED, false);
        }
    };

    function playMovie() {
        if (!MOVIE || typeof Video === 'undefined') return false;
        try {
            const ext = Game_Interpreter.prototype.videoFileExt ? Game_Interpreter.prototype.videoFileExt() : (Utils.canPlayWebm() ? '.webm' : '.mp4');
            Video.play('movies/' + MOVIE + ext);
            return true;
        } catch (_) { return false; }
    }

    Scene_Title.prototype.playTitleMusic = function() {
        if (this._rrMovie) return;
        AudioManager.playBgm(BGM);
        AudioManager.playBgs(BGS);
    };

    const _isBusy = Scene_Title.prototype.isBusy;
    Scene_Title.prototype.isBusy = function() {
        return !!this._rrMovie || _isBusy.call(this);
    };

    const _update = Scene_Title.prototype.update;
    Scene_Title.prototype.update = function() {
        if (this._rrLayers) {
            this.rrUpdateMovie();
            // Nothing moves while the scene fades or a movie plays, as the original's transition held it.
            if (!this.isFading() && !this._rrMovie) {
                if (ACTIVATE_TIME > 0 && !this._rrActive) this.rrCommandUpdate();
                this.rrAnimateLayers();
            }
        }
        _update.call(this);
    };

    Scene_Title.prototype.rrUpdateMovie = function() {
        if (this._rrMovie === 'intro' && !Video.isPlaying()) {
            this._rrMovie = null;
            this.playTitleMusic();
            this.startFadeIn(FADE_SPEED, false);
        } else if (this._rrMovie === 'newGameFade' && !this.isFading()) {
            this._rrMovie = playMovie() ? 'newGame' : null;
            if (!this._rrMovie) SceneManager.goto(Scene_Map);
        } else if (this._rrMovie === 'newGame' && !Video.isPlaying()) {
            this._rrMovie = null;
            SceneManager.goto(Scene_Map);
        }
    };

    Scene_Title.prototype.rrCommandUpdate = function() {
        if (this._rrTimer >= ACTIVATE_TIME) {
            this._commandWindow.activate();
            this._rrActive = true;
        }
    };

    const _commandNewGame = Scene_Title.prototype.commandNewGame;
    Scene_Title.prototype.commandNewGame = function() {
        titleCursor = false;
        if (!(MOVIE && MOVIE_ON_NEW_GAME)) return _commandNewGame.call(this);
        // The movie plays after the fade-out, then the map starts.
        DataManager.setupNewGame();
        this._commandWindow.close();
        this.fadeOutAll();
        this._rrMovie = 'newGameFade';
    };

    const _commandContinue = Scene_Title.prototype.commandContinue;
    Scene_Title.prototype.commandContinue = function() {
        titleCursor = false;
        _commandContinue.call(this);
    };

    /** Other plugins' title commands that start the game end the title cursor sound too. */
    Scene_Title.prototype.rrEndTitleCursor = function() { titleCursor = false; };

    // ---- animation, in the original's order ------------------------------------

    Scene_Title.prototype.rrAnimateLayers = function() {
        this.rrUpdateLayerFrames();
        this.rrProcessLayerAnimations();
        for (const layer of this._rrLayers) applyLayer(layer);
    };

    const COUNTERS = ['rotation_frame', 'scroll_frame', 'fade_frame', 'fade_out_frame', 'fade_out_time', 'wave_frame', 'blend_frame',
        'variable_frame', 'initialize_frame', 'initialize_fade_in_frame', 'initialize_move_frame', 'initialize_rotation_frame'];

    Scene_Title.prototype.rrUpdateLayerFrames = function() {
        this._rrTimer++;
        for (const layer of this._rrLayers) for (const key of COUNTERS) layer.info[key]++;
    };

    // Each layer past its initialize_time runs every layer's step (opening or
    // regular), so the steps run once per such layer each frame; frame rates
    // of 1 or more keep that to one step.
    Scene_Title.prototype.rrProcessLayerAnimations = function() {
        for (const layer of this._rrLayers) {
            if (layer.info.initialize_frame >= layer.info.initialize_time) {
                if (layer.info.initialize_switch) this.rrUpdateInitializeAnimations();
                else this.rrUpdateLayerAnimations();
            }
        }
    };

    Scene_Title.prototype.rrUpdateInitializeAnimations = function() {
        for (const layer of this._rrLayers) {
            const list = layer.info.initialize_animations;
            for (let i = 0; i < list.length; i++) {
                const step = INITIALIZE[list[i]];
                if (step) step(layer, i);
            }
        }
    };

    Scene_Title.prototype.rrUpdateLayerAnimations = function() {
        for (const layer of this._rrLayers) {
            for (const type of layer.info.animation_types) {
                const step = ANIMATIONS[type];
                if (step) step.call(this, layer);
            }
        }
    };

    function initializeComplete(layer, index) {
        const list = layer.info.initialize_animations;
        list[index] = 0;
        if (list.every(a => a === 0)) layer.info.initialize_switch = false;
    }

    const INITIALIZE = {
        0: initializeComplete,
        1(layer, index) {           // rotate clockwise to the final angle
            const info = layer.info;
            if (info.initialize_rotation_frame >= info.initialize_rotation_frame_rate) {
                if (layer.angle > info.initialize_rotation_final_angle) layer.angle -= info.initialize_rotation_speed;
                else if (layer.angle === info.initialize_rotation_final_angle) initializeComplete(layer, index);
                info.initialize_rotation_frame = 0;
            }
        },
        2(layer, index) {           // rotate counter-clockwise to the final angle
            const info = layer.info;
            if (info.initialize_rotation_frame >= info.initialize_rotation_frame_rate) {
                if (layer.angle < info.initialize_rotation_final_angle) layer.angle += info.initialize_rotation_speed;
                else if (layer.angle >= info.initialize_rotation_final_angle) initializeComplete(layer, index);
                info.initialize_rotation_frame = 0;
            }
        },
        3(layer, index) { moveTo(layer, index, 'x', 1); },
        4(layer, index) { moveTo(layer, index, 'x', -1); },
        5(layer, index) { moveTo(layer, index, 'y', 1); },
        6(layer, index) { moveTo(layer, index, 'y', -1); },
        7(layer, index) {           // fade in to the max opacity
            const info = layer.info;
            if (info.initialize_fade_in_frame >= info.initialize_fade_in_frame_rate) {
                const max = info.fade_max_opacity !== undefined ? info.fade_max_opacity : 255;
                if (layer.opacity < max) layer.opacity += info.initialize_fade_in_speed;
                if (layer.opacity >= max) initializeComplete(layer, index);
                info.initialize_fade_in_frame = 0;
            }
        }
    };

    function moveTo(layer, index, axis, sign) {
        const info = layer.info;
        if (info.initialize_move_frame >= info.initialize_move_frame_rate) {
            const target = axis === 'x' ? info.initialize_move_final_x : info.initialize_move_final_y;
            if (sign > 0 ? layer[axis] < target : layer[axis] > target) layer[axis] += sign * info.initialize_move_speed;
            else if (sign > 0 ? layer[axis] >= target : layer[axis] <= target) initializeComplete(layer, index);
            info.initialize_move_frame = 0;
        }
    }

    const ANIMATIONS = {
        1(layer) {                  // clockwise
            const info = layer.info;
            if (info.rotation_frame >= info.rotation_frame_rate) { layer.angle -= info.rotation_speed; info.rotation_frame = 0; }
        },
        2(layer) {                  // counter-clockwise: the original tested <=, so every update steps
            const info = layer.info;
            if (info.rotation_frame <= info.rotation_frame_rate) { layer.angle += info.rotation_speed; info.rotation_frame = 0; }
        },
        3(layer) {                  // scroll right
            const info = layer.info;
            if (info.scroll_frame >= info.scroll_frame_rate) {
                layer.x += info.scroll_speed;
                if (layer.x >= Graphics.width) layer.x = Graphics.width - layer.width * 2;
                info.scroll_frame = 0;
            }
        },
        4(layer) {                  // scroll left
            const info = layer.info;
            if (info.scroll_frame >= info.scroll_frame_rate) {
                layer.x -= info.scroll_speed;
                if (layer.x <= -layer.width) layer.x = Graphics.width;
                info.scroll_frame = 0;
            }
        },
        5(layer) {                  // scroll down
            const info = layer.info;
            if (info.scroll_frame >= info.scroll_frame_rate) {
                layer.y += info.scroll_speed;
                if (layer.y >= Graphics.height) layer.y = Graphics.height - (layer.height * 2 + 5);
                info.scroll_frame = 0;
            }
        },
        6(layer) {                  // scroll up
            const info = layer.info;
            if (info.scroll_frame >= info.scroll_frame_rate) {
                layer.y -= info.scroll_speed;
                if (layer.y <= -Graphics.height) layer.y = Graphics.height;
                info.scroll_frame = 0;
            }
        },
        7(layer) {                  // fade out to the min, back in to the max
            const info = layer.info;
            if (info.fade_frame >= info.fade_frame_rate) {
                if (info.fade_switch) {
                    layer.opacity -= info.fade_speed;
                    if (layer.opacity <= (info.fade_min_opacity !== undefined ? info.fade_min_opacity : 25)) info.fade_switch = false;
                } else {
                    layer.opacity += info.fade_speed;
                    if (layer.opacity >= (info.fade_max_opacity !== undefined ? info.fade_max_opacity : 255)) info.fade_switch = true;
                }
                info.fade_frame = 0;
            }
        },
        8(layer) {                  // hour hand (one clock for the whole scene)
            let hour = new Date().getHours();
            if (hour > 12) hour -= 12;
            if (this._rrHour !== hour) { layer.angle = -(30 * hour); this._rrHour = hour; }
        },
        9(layer) {                  // minute hand
            const minute = new Date().getMinutes();
            if (this._rrMinute !== minute) { layer.angle = -(6 * minute); this._rrMinute = minute; }
        },
        10(layer) {                 // wave grows to its strength and back
            const info = layer.info;
            if (info.wave_frame >= info.wave_frame_rate) {
                if (info.wave_switch) {
                    layer.wave_amp += 1;
                    if (layer.wave_amp >= info.wave_strength) info.wave_switch = false;
                } else {
                    layer.wave_amp -= 1;
                    if (layer.wave_amp <= 0) info.wave_switch = true;
                }
                info.wave_frame = 0;
            }
        },
        11(layer) {                 // blend: normal → add → subtract and back
            const info = layer.info;
            if (info.blend_frame >= info.blend_frame_rate) {
                if (info.blend_switch) {
                    layer.blend_type += 1;
                    if (layer.blend_type >= 2) info.blend_switch = false;
                } else {
                    layer.blend_type -= 1;
                    if (layer.blend_type <= 0) info.blend_switch = true;
                }
                info.blend_frame = 0;
            }
        },
        12(layer) {                 // frames name_0 … name_max
            const info = layer.info;
            if (info.variable_frame >= info.variable_frame_rate) {
                info.variable_id = info.variable_id >= info.max_variable_frames ? 0 : info.variable_id + 1;
                layer.bitmap = layer.frames[info.variable_id] || null;
                info.variable_frame = 0;
            }
        },
        13(layer) {                 // follows the selected command
            const index = this._commandWindow ? this._commandWindow.index() : -1;
            if (index < 0 || index > 2) return;
            if (HORIZONTAL) layer.x = CMD.x + (CMD.cursorW + CMD.cursorSpacing) * index;
            else layer.y = CMD.y + (CMD.cursorH + CMD.cursorSpacing) * index;
        },
        14(layer) {                 // fade out once, from start_fade_out
            const info = layer.info;
            if (info.fade_out_time >= info.start_fade_out && info.fade_out_frame >= info.fade_out_frame_rate) {
                if (layer.opacity > 0) layer.opacity -= info.fade_out_speed;
                info.fade_out_frame = 0;
            }
        }
    };

    // ---- command window ------------------------------------------------------

    Window_TitleCommand.prototype.maxCols = function() {
        return HORIZONTAL ? Math.max(1, this.maxItems()) : 1;
    };

    Window_TitleCommand.prototype.itemWidth = function() {
        return CMD.rectW;
    };

    Window_TitleCommand.prototype.itemHeight = function() {
        return CMD.rectH;
    };

    /** Commands CMD.rectW wide, CMD.rectH tall, side by side CMD.spacing apart; no inner padding. */
    Window_TitleCommand.prototype.itemRect = function(index) {
        const cols = this.maxCols();
        const x = (index % cols) * (CMD.rectW + CMD.spacing) - this.scrollBaseX();
        const y = Math.floor(index / cols) * CMD.rectH - this.scrollBaseY();
        return new Rectangle(x, y, CMD.rectW, CMD.rectH);
    };

    Window_TitleCommand.prototype.drawItem = function(index) {
        if (!CMD.text) return;
        const rect = this.itemRect(index);
        this.resetFontSettings();
        // An uninstalled font falls back to the game's main font.
        if (CMD.font) this.contents.fontFace = '"' + CMD.font.replace(/"/g, '') + '", ' + $gameSystem.mainFontFace();
        this.contents.fontSize = CMD.size;
        const color = ColorManager[COLORS[CMD.color]];
        this.changeTextColor(typeof color === 'function' ? color.call(ColorManager) : ColorManager.normalColor());
        this.changePaintOpacity(this.isCommandEnabled(index));
        this.contents.drawText(this.commandName(index), rect.x, rect.y, rect.width, rect.height, CMD.align);
        this.resetFontSettings();
        this.changePaintOpacity(true);
    };

    /** The first three commands each have a sound; the rest play none. */
    Window_TitleCommand.prototype.playOkSound = function() {
        const se = COMMAND_SE[this.index()];
        if (se) AudioManager.playSe(se);
    };

    Window_TitleCommand.prototype.playBuzzerSound = function() {
        AudioManager.playSe(BUZZER_SE);
    };

    Window_TitleCommand.prototype.processCancel = function() {
        AudioManager.playSe(CANCEL_SE);
        this.updateInputData();
        this.deactivate();
        this.callCancelHandler();
    };

    const _playCursor = SoundManager.playCursor;
    SoundManager.playCursor = function() {
        if (titleCursor) AudioManager.playSe(CURSOR_SE);
        else _playCursor.call(this);
    };
})();
