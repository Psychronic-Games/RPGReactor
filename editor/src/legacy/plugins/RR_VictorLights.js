/*:
 * @target MZ
 * @plugindesc Victor Engine Light Effects (VX Ace), for imported games
 * @author Victor Sant; ported for RPG Reactor
 * @url https://github.com/Psychronic-Games/RPG-Reactor
 *
 * @help RR_VictorLights.js
 *
 * A shade over the map with lights drawn into it, set up by tags in the map
 * note, in event comments on the active page, and in Comment commands as they
 * run. The shade covers pictures 1 to 100; higher pictures draw over it.
 *
 * Map note and Comment command:
 *   <create shade> opacity: o  red: r  green: g  blue: b  blend: n </create shade>
 *   <actor light> / <event light> / <vehicle light> / <map light>
 *     id: n  name: "file"  index: n  map x: n  map y: n  opacity: o
 *     pos x: n  pos y: n  var: n  speed: n  zoom: n
 *   </actor light> …
 *   <actor lantern i: o>  <event lantern i: o>  <vehicle lantern i: o>
 * Comment command only:
 *   <shade opacity: o, d>  <shade tone: r, g, b, d>
 *   <light opacity id: o, d>  <remove light: id>
 * Event page comments:
 *   <custom light> name: "file" … </custom light>
 *   <simple light|lamp|torch: o>  <simple window 1|2: o>
 *   <flash light|lamp|torch: o>   <flash window 1|2: o>
 *   <lantern: o>
 *
 * Blend 0 is normal, 1 add, 2 subtract (the default for a shade): the shade
 * colour is then 255 minus each tone value, taken away from the screen.
 * Light images are in img/Lights.
 *
 * Installed by File › Import Project… when the imported game carried the
 * original script.
 *
 * @param actorIndexFromZero
 * @text Actor light index from 0
 * @type boolean
 * @default false
 * @desc On when the game carried the "Fix light" patch: index 0 is the player, 1 the first follower.
 */
(() => {
    'use strict';
    const params = PluginManager.parameters('RR_VictorLights');
    const ACTOR_FROM_ZERO = String(params.actorIndexFromZero) === 'true';
    const FOLDER = 'img/Lights/';
    const FILENAME = '["\'“‘]([^"\'”‘”’]+)["\'”’]';
    const allValues = (tag) => new RegExp('<' + tag + '>((?:[^<]|<[^/])*)</' + tag + '>', 'gim');
    const num = (info, re, d) => { const m = re.exec(info); return m ? Number(m[1]) : d; };

    //-------------------------------------------------------------------------
    // State, kept on $gameScreen so it is saved
    //-------------------------------------------------------------------------
    function makeShade() {
        return { visible: false, opacity: 0, opacityTarget: 0, opacityDuration: 0, blend: 0, color: [0, 0, 0], colorTarget: [0, 0, 0], colorDuration: 0 };
    }
    const shadeColor = (shade, r, g, b) => (shade.blend === 2 ? [255 - r, 255 - g, 255 - b] : [r, g, b]);

    Game_Screen.prototype.rrVeState = function() {
        if (!this._rrVe) this.rrVeClear();
        return this._rrVe;
    };
    Game_Screen.prototype.rrVeClear = function() {
        this._rrVe = { shade: makeShade(), lights: {}, remove: [] };
    };

    function updateShade(shade) {
        if (shade.opacityDuration > 0) {
            const d = shade.opacityDuration;
            shade.opacity = (shade.opacity * (d - 1) + shade.opacityTarget) / d;
            shade.opacityDuration--;
        }
        if (shade.colorDuration > 0) {
            const d = shade.colorDuration;
            shade.color = shade.color.map((c, i) => (c * (d - 1) + shade.colorTarget[i]) / d);
            shade.colorDuration--;
        }
    }

    function makeLight(id, name, info, op = 0, x = 0, y = 0, v = 0, s = 0, z = 100) {
        return { id, name: String(name || ''), info, opacity: Number(op) || 0, x: Number(x) || 0, y: Number(y) || 0, variance: Number(v) || 0, speed: Number(s) || 0, zoom: Number(z) || 100, opacityTarget: 0, opacityDuration: 0 };
    }

    //-------------------------------------------------------------------------
    // Tags, as the original reads them
    //-------------------------------------------------------------------------
    const TYPES = { actor: 'ACTOR', event: 'EVENT', vehicle: 'VEHICLE', map: 'MAP' };

    Game_Map.prototype.rrVeActors = function() {
        return [$gamePlayer].concat($gamePlayer.followers().visibleFollowers());
    };
    Game_Map.prototype.rrVeVehicle = function(i) { return this._vehicles[i]; };
    Game_Map.prototype.rrVeFont = function(type, i) {
        if (type === 'actor') return this.rrVeActors()[i - 1];
        if (type === 'event') return this.event(i);
        if (type === 'vehicle') return this.rrVeVehicle(i);
        return null;
    };

    Game_Map.prototype.rrVeSetupShade = function(text) {
        const m = allValues('CREATE SHADE').exec(text);
        if (!m) return;
        const info = m[1];
        const shade = $gameScreen.rrVeState().shade;
        shade.visible = true;
        shade.opacity = num(info, /OPACITY: (\d+)/i, 192);
        shade.blend = num(info, /BLEND: (\d+)/i, 2);
        shade.color = shadeColor(shade, num(info, /RED: (\d+)/i, 0), num(info, /GREEN: (\d+)/i, 0), num(info, /BLUE: (\d+)/i, 0));
        shade.colorTarget = shade.color.slice();
    };

    Game_Map.prototype.rrVeReadLight = function(info, type) {
        const name = new RegExp('NAME: ' + FILENAME, 'i').exec(info);
        const word = /ID: (\w+)/i.exec(info), digits = /ID: (\d+)/i.exec(info);
        const light = makeLight(digits ? Number(digits[1]) : word ? word[1] : 0, name ? name[1] : '', null,
            num(info, /OPACITY: (\d+)/i, 192), num(info, /POS X: ([+-]?\d+)/i, 0), num(info, /POS Y: ([+-]?\d+)/i, 0),
            num(info, /VAR: (\d+)/i, 0), num(info, /SPEED: (\d+)/i, 0), num(info, /ZOOM: (\d+)/i, 100));
        light.info = type === 'map' ? { x: num(info, /MAP X: (\d+)/i, 0), y: num(info, /MAP Y: (\d+)/i, 0) } : { [type]: num(info, /INDEX: (\d+)/i, 0) };
        return light;
    };

    Game_Map.prototype.rrVeSetupLights = function(type, text) {
        const re = allValues(TYPES[type] + ' LIGHT');
        let m;
        while ((m = re.exec(text))) {
            const light = this.rrVeReadLight(m[1], type);
            if (light.id) $gameScreen.rrVeState().lights[light.id] = light;
        }
    };

    Game_Map.prototype.rrVeSetupLanterns = function(type, text) {
        const re = new RegExp('<' + TYPES[type] + ' LANTERN (\\d+): (\\d+)>', 'gi');
        let m;
        while ((m = re.exec(text))) {
            const target = this.rrVeFont(type, Number(m[1]));
            if (!target) continue;
            target._rrLantern = Number(m[2]);
            target.rrVeUpdateLantern();
        }
    };

    Game_Map.prototype.rrVeSetupAll = function(text) {
        this.rrVeSetupShade(text);
        for (const type of ['actor', 'event', 'vehicle', 'map']) this.rrVeSetupLights(type, text);
        for (const type of ['actor', 'event', 'vehicle']) this.rrVeSetupLanterns(type, text);
    };

    const _setup = Game_Map.prototype.setup;
    Game_Map.prototype.setup = function(mapId) {
        // A transfer to another map drops the old map's shade and lights.
        if (mapId !== this._mapId) $gameScreen.rrVeClear();
        _setup.call(this, mapId);
        this.rrVeSetupAll(($dataMap && $dataMap.note) || '');
    };

    //-------------------------------------------------------------------------
    // Lanterns
    //-------------------------------------------------------------------------
    const LANTERNS = {
        1: ['lantern_downleft', -48, 48], 3: ['lantern_downright', 48, 48], 2: ['lantern_down', 0, 64], 4: ['lantern_left', -64, 0],
        6: ['lantern_right', 64, 0], 7: ['lantern_upleft', -48, -48], 8: ['lantern_up', 0, -64], 9: ['lantern_upright', 48, -48]
    };
    Game_CharacterBase.prototype.rrVeId = function() {
        return this instanceof Game_Event ? this.eventId() : 0;
    };
    Game_CharacterBase.prototype.rrVeUpdateLantern = function(forced = false) {
        const lantern = this._rrLantern || 0;
        const isEvent = this instanceof Game_Event;
        const id = (isEvent ? 'EL' : 'AL') + this.rrVeId();
        if (lantern !== 0 && (this._rrLanternDirection !== this.direction() || forced)) {
            this._rrLanternDirection = this.direction();
            const shape = LANTERNS[this._rrLanternDirection];
            if (shape) $gameScreen.rrVeState().lights[id] = makeLight(id, shape[0], { [isEvent ? 'event' : 'actor']: this.rrVeId() }, lantern, shape[1], shape[2]);
        } else if (lantern === 0 && this._rrLanternDirection) {
            $gameScreen.rrVeState().remove.push(id);
            this._rrLanternDirection = null;
        }
    };
    const _update = Game_CharacterBase.prototype.update;
    Game_CharacterBase.prototype.update = function() {
        _update.apply(this, arguments);
        if (this._rrLantern || this._rrLanternDirection) this.rrVeUpdateLantern();
    };
    const _performTransfer = Game_Player.prototype.performTransfer;
    Game_Player.prototype.performTransfer = function() {
        const transferring = this.isTransferring();
        _performTransfer.call(this);
        if (transferring) for (const actor of $gameMap.rrVeActors()) actor.rrVeUpdateLantern(true);
    };

    //-------------------------------------------------------------------------
    // Event page lights
    //-------------------------------------------------------------------------
    Game_Event.prototype.rrVeNote = function() {
        const list = this.page() ? this.list() : null;
        if (!list) return '';
        return list.filter(c => c && (c.code === 108 || c.code === 408)).map(c => c.parameters[0]).join('\r\n');
    };
    Game_Event.prototype.rrVeSetLight = function(name, op = 255, v = 0, s = 0, x = 0, y = 0, z = 100) {
        const id = 'EV' + this.eventId();
        const state = $gameScreen.rrVeState();
        state.lights[id] = makeLight(id, name, { event: this.eventId() }, op, x, y, v, s, z);
        state.remove = state.remove.filter(r => r !== id);
    };
    Game_Event.prototype.rrVeRefreshLights = function() {
        const note = this.rrVeNote();
        let m;
        const opacity = (v) => (v === undefined ? 255 : Number(v));
        if ((m = /<SIMPLE LIGHT: (\d+)?>/i.exec(note))) this.rrVeSetLight('light', opacity(m[1]));
        else if ((m = /<SIMPLE LAMP: (\d+)?>/i.exec(note))) this.rrVeSetLight('lamp', opacity(m[1]));
        // The original passes nil here, and its argument list closes up round it: a torch with no number draws at 0.
        else if ((m = /<SIMPLE TORCH: (\d+)?>/i.exec(note))) this.rrVeSetLight('torch', m[1] === undefined ? 0 : Number(m[1]));
        else if ((m = /<SIMPLE WINDOW (\d+): (\d+)?>/i.exec(note))) this.rrVeSetLight('window', opacity(m[2]), 0, 0, 0, m[1] === '1' ? 0 : 14);
        else if ((m = /<FLASH LIGHT: (\d+)?>/i.exec(note))) this.rrVeSetLight('light', opacity(m[1]), 30, 1);
        else if ((m = /<FLASH LAMP: (\d+)?>/i.exec(note))) this.rrVeSetLight('lamp', opacity(m[1]), 30, 1);
        else if ((m = /<FLASH TORCH: (\d+)?>/i.exec(note))) this.rrVeSetLight('torch', opacity(m[1]), 30, 1);
        else if ((m = /<FLASH WINDOW (\d+): (\d+)?>/i.exec(note))) this.rrVeSetLight('window', opacity(m[2]), 30, 1, 0, m[1] === '1' ? 0 : 14);
        else if ((m = allValues('CUSTOM LIGHT').exec(note))) {
            const info = m[1];
            const name = new RegExp('NAME: ' + FILENAME, 'i').exec(info);
            this.rrVeSetLight(name ? name[1] : '', num(info, /OPACITY: (\d+)/i, 192), num(info, /VAR: (\d+)/i, 0), num(info, /SPEED: (\d+)/i, 0),
                num(info, /POS X: ([+-]?\d+)/i, 0), num(info, /POS Y: ([+-]?\d+)/i, 0), num(info, /ZOOM: (\d+)/i, 100));
        } else if ((m = /<LANTERN(?:: (\d+))?>/i.exec(note))) this._rrLantern = m[1] === undefined ? 255 : Number(m[1]);
    };
    const _clearStartingFlag = Game_Event.prototype.clearStartingFlag;
    Game_Event.prototype.clearStartingFlag = function() {
        _clearStartingFlag.call(this);
        if (!$gameScreen) return;
        this._rrLantern = 0;
        $gameScreen.rrVeState().remove.push('EV' + this.eventId());
        if (this.page()) this.rrVeRefreshLights();
    };

    //-------------------------------------------------------------------------
    // Comment commands
    //-------------------------------------------------------------------------
    const _command108 = Game_Interpreter.prototype.command108;
    Game_Interpreter.prototype.command108 = function(params) {
        const result = _command108.call(this, params);
        const note = (this._comments || []).join('\r\n');
        if (/</.test(note)) this.rrVeCommentCall(note);
        return result;
    };
    Game_Interpreter.prototype.rrVeCommentCall = function(note) {
        $gameMap.rrVeSetupAll(note);
        const state = $gameScreen.rrVeState(), shade = state.shade;
        let m;
        if (shade.visible) {
            const opacityRe = /<SHADE OPACITY: ((?:\d+,? *){2})>/gi;
            while ((m = opacityRe.exec(note))) {
                const v = /(\d+) *,? *(\d+)?/.exec(m[1]);
                if (!v) continue;
                shade.opacityTarget = Number(v[1]);
                shade.opacityDuration = Math.max(v[2] ? Number(v[2]) : 0, 0);
                if (shade.opacityDuration === 0) shade.opacity = shade.opacityTarget;
            }
            const toneRe = /<SHADE TONE: ((?:\d+,? *){4})>/gi;
            while ((m = toneRe.exec(note))) {
                const v = /(\d+) *, *(\d+) *, *(\d+) *, *(\d+)/.exec(m[1]);
                if (!v) continue;
                shade.colorTarget = shadeColor(shade, Number(v[1]), Number(v[2]), Number(v[3]));
                shade.colorDuration = Math.max(Number(v[4]), 0);
                if (shade.colorDuration === 0) shade.color = shade.colorTarget.slice();
            }
            const lightRe = /<LIGHT OPACITY (\d+): ((?:\d+,? *){2})>/gi;
            while ((m = lightRe.exec(note))) {
                const light = state.lights[Number(m[1])];
                const v = /(\d+) *,? *(\d+)?/.exec(m[2]);
                if (!light || !v) continue;
                light.opacityTarget = Number(v[1]);
                light.opacityDuration = Math.max(v[2] ? Number(v[2]) : 0, 0);
                if (light.opacityDuration === 0) light.opacity = light.opacityTarget;
            }
        }
        const removeRe = /<REMOVE LIGHT: (\d+)>/gi;
        while ((m = removeRe.exec(note))) state.remove.push(Number(m[1]));
    };

    //-------------------------------------------------------------------------
    // The shade sprite
    //-------------------------------------------------------------------------
    function Sprite_RRVeShade() { this.initialize(...arguments); }
    Sprite_RRVeShade.prototype = Object.create(Sprite.prototype);
    Sprite_RRVeShade.prototype.constructor = Sprite_RRVeShade;

    Sprite_RRVeShade.prototype.initialize = function() {
        Sprite.prototype.initialize.call(this, new Bitmap(Graphics.width, Graphics.height));
        this._lights = {};
    };
    Sprite_RRVeShade.prototype.target = function(light) {
        const info = light.info || {};
        if ('actor' in info) {
            const actors = $gameMap.rrVeActors();
            const i = Number(info.actor) || 0;
            return actors[ACTOR_FROM_ZERO ? i : i - 1] || null;
        }
        if ('event' in info) return $gameMap.event(Number(info.event)) || null;
        if ('vehicle' in info) return $gameMap.rrVeVehicle(Number(info.vehicle)) || null;
        return info;
    };
    Sprite_RRVeShade.prototype.makeEntry = function(light) {
        return { light, bitmap: ImageManager.loadBitmap(FOLDER, light.name), target: this.target(light), speed: light.speed, variance: 0, opacity: light.opacity };
    };
    Sprite_RRVeShade.prototype.syncLights = function() {
        const state = $gameScreen.rrVeState();
        for (const key of Object.keys(state.lights)) {
            if (state.remove.some(r => String(r) === key)) {
                delete this._lights[key];
                delete state.lights[key];
                continue;
            }
            const entry = this._lights[key];
            if (!entry || entry.light !== state.lights[key]) this._lights[key] = this.makeEntry(state.lights[key]);
        }
        state.remove = [];
    };
    Sprite_RRVeShade.prototype.redraw = function() {
        const shade = $gameScreen.rrVeState().shade;
        updateShade(shade);
        this.opacity = shade.opacity;
        this.blendMode = [0, 1, 'subtract'][shade.blend] ?? 0;
        const bitmap = this.bitmap;
        const [r, g, b] = shade.color.map(c => Math.round(Math.min(Math.max(c, 0), 255)));
        bitmap.fillRect(0, 0, bitmap.width, bitmap.height, `rgb(${r},${g},${b})`);
        const tw = $gameMap.tileWidth(), th = $gameMap.tileHeight();
        for (const entry of Object.values(this._lights)) {
            const { light, target } = entry;
            // Opacity eases toward its target, then swings by the variance.
            if (light.opacityDuration > 0) {
                const d = light.opacityDuration;
                light.opacity = (light.opacity * (d - 1) + light.opacityTarget) / d;
                light.opacityDuration--;
            }
            entry.variance += entry.speed;
            if (Math.abs(entry.variance) > Math.abs(light.variance)) entry.speed *= -1;
            entry.opacity = Math.min(Math.max(light.opacity + entry.variance, 0), 255);
            if (!target || !entry.bitmap.isReady()) continue;
            const w = entry.bitmap.width * light.zoom / 100, h = entry.bitmap.height * light.zoom / 100;
            const character = target instanceof Game_CharacterBase;
            const x = $gameMap.adjustX(character ? target._realX : target.x) * tw - w / 2 + light.x + tw / 2;
            const y = $gameMap.adjustY(character ? target._realY : target.y) * th - h / 2 + light.y + th / 2;
            if (x > bitmap.width || y > bitmap.height || x + w < 0 || y + h < 0) continue;
            bitmap.paintOpacity = entry.opacity;
            bitmap.blt(entry.bitmap, 0, 0, entry.bitmap.width, entry.bitmap.height, x, y, w, h);
        }
        bitmap.paintOpacity = 255;
    };

    const _createPictures = Spriteset_Base.prototype.createPictures;
    Spriteset_Base.prototype.createPictures = function() {
        _createPictures.call(this);
        if (!(this instanceof Spriteset_Map)) return;
        // Ace orders the picture viewport by z: picture n at n, the shade at 100.
        this._rrVeShade = new Sprite_RRVeShade();
        this._rrVeShade.visible = false;
        const container = this._pictureContainer;
        container.addChildAt(this._rrVeShade, Math.min(100, container.children.length));
        this._rrVeRefreshed = false;
    };

    const _update2 = Spriteset_Map.prototype.update;
    Spriteset_Map.prototype.update = function() {
        _update2.call(this);
        this.rrVeUpdateShade();
    };
    Spriteset_Map.prototype.rrVeUpdateShade = function() {
        const sprite = this._rrVeShade;
        if (!sprite || !$gameScreen) return;
        const shade = $gameScreen.rrVeState().shade;
        if (!shade.visible) {
            sprite.visible = false;
            this._rrVeRefreshed = false;
            return;
        }
        if (!this._rrVeRefreshed) {
            // A new shade (or a loaded game) re-reads every event's page lights, as the original does.
            this._rrVeRefreshed = true;
            sprite._lights = {};
            for (const event of $gameMap.events()) if (event.page()) event.rrVeRefreshLights();
        }
        sprite.visible = true;
        if (Graphics.frameCount % 2 === 0 || !sprite._drawn) {
            sprite.syncLights();
            sprite.redraw();
            sprite._drawn = true;
        }
    };
})();
