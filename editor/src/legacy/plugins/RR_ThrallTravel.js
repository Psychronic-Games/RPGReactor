/*:
 * @target MZ
 * @plugindesc Fast Travel (VX), for imported games
 * @author Strak; ported for RPG Reactor
 * @url https://github.com/Psychronic-Games/RPG-Reactor
 *
 * @help RR_ThrallTravel.js
 *
 * The world map the player travels from: img/pictures/$Map with every
 * region the game has opened painted on (the opened count is a variable,
 * the regions past the fifth depend on the party member another variable
 * names), and a highlight over the chosen destination. Up or left picks
 * the previous destination, down or right the next; the action button asks
 * "Travel to …?" with the jobs accepted for that place listed under Yes and
 * No. Yes stores the destination in a variable and returns to the map,
 * whose events do the travelling; No and Cancel go back to choosing.
 *
 * Script call (the importer translates the game's $scene = Scene_Travel.new):
 *   SceneManager.push(Scene_RRThrallTravel)
 * The job lines come from the game's job board ($gameSystem.rrAcceptedJobs()
 * and $gameSystem.rrJobDetail(id), from its own port).
 *
 * Installed by File › Import Project… when the imported game carried the
 * original script; its settings were read from the game's copy.
 *
 * @param destinations
 * @type multiline_string
 * @default {}
 * @desc JSON: { all: { index: { location, map, cursor } }, members: { member: { index: {…} } } } (pictures in img/pictures).
 *
 * @param baseMap
 * @default $Map
 *
 * @param homeMap
 * @default $Hollow
 *
 * @param regionVariable
 * @type variable
 * @default 118
 *
 * @param memberVariable
 * @type variable
 * @default 1
 *
 * @param resultVariable
 * @type variable
 * @default 73
 *
 * @param deliveryIcons
 * @default [145,158,164,165,166,167,144,148,159,168]
 * @desc JSON: icons drawn after delivery jobs 204–213.
 */
(() => {
    'use strict';
    const params = PluginManager.parameters('RR_ThrallTravel');
    const json = (v, d) => { try { const x = JSON.parse(v); return x == null ? d : x; } catch (_) { return d; } };
    const DEST = Object.assign({ all: {}, members: {} }, json(params.destinations, {}));
    const BASE_MAP = params.baseMap || '$Map';
    const HOME_MAP = params.homeMap || '$Hollow';
    const REGION_VARIABLE = Number(params.regionVariable || 118);
    const MEMBER_VARIABLE = Number(params.memberVariable || 1);
    const RESULT_VARIABLE = Number(params.resultVariable || 73);
    const DELIVERY_ICONS = json(params.deliveryIcons, [145, 158, 164, 165, 166, 167, 144, 148, 159, 168]);
    const WLH = 24;

    /** A destination's entry: the member's own for that index, or everyone's. */
    function destination(index) {
        const member = DEST.members[String($gameVariables.value(MEMBER_VARIABLE))] || {};
        const all = DEST.all[String(index)] || {};
        const own = member[String(index)] || {};
        return Object.assign({ location: 0 }, all, own);
    }

    const jobs = () => {
        const s = $gameSystem;
        const list = (s.rrAcceptedJobs && s.rrAcceptedJobs()) || s._acceptedJobs || s._accepted_jobs || [];
        return Array.isArray(list) ? list : [];
    };
    const jobDetail = (id) => String(($gameSystem.rrJobDetail && $gameSystem.rrJobDetail(id)) ?? '');

    //-------------------------------------------------------------------------
    // Window_Travel
    //-------------------------------------------------------------------------
    function Window_RRThrallTravel() { this.initialize(...arguments); }
    Window_RRThrallTravel.prototype = Object.create(Window_Selectable.prototype);
    Window_RRThrallTravel.prototype.constructor = Window_RRThrallTravel;
    Window_RRThrallTravel.prototype.initialize = function() {
        Window_Selectable.prototype.initialize.call(this, new Rectangle(0, 0, Graphics.width, Graphics.height));
        this.padding = 16;
        this._data = [];
        this.visible = false;
        this.deselect();
        this.deactivate();
    };
    Window_RRThrallTravel.prototype.lineHeight = function() { return WLH; };
    Window_RRThrallTravel.prototype.maxItems = function() { return 2; };
    Window_RRThrallTravel.prototype.maxCols = function() { return 1; };
    Window_RRThrallTravel.prototype.itemHeight = function() { return WLH; };
    // The choices sit one line down, under the question.
    Window_RRThrallTravel.prototype.itemRect = function(index) {
        return new Rectangle(0, WLH * (index + 1), this.innerWidth, WLH);
    };
    Window_RRThrallTravel.prototype.normal = function() {
        return this.rrVxNormalColor ? this.rrVxNormalColor() : ColorManager.normalColor();
    };
    Window_RRThrallTravel.prototype.icon = function(index, x, y) {
        if (this.rrVxDrawIcon) this.rrVxDrawIcon(index, x, y, true);
        else this.drawIcon(index, x, y);
    };
    Window_RRThrallTravel.prototype.refreshTravel = function(index) {
        const location = destination(index).location;
        const accepted = jobs();
        const height = 104 + WLH * accepted.filter(job => job[1] === location).length;
        this.move(0, 0, Graphics.width, height);
        this.createContents();
        this.contents.clear();
        this.resetTextColor();
        const question = location === 0 ? 'Return to Hollow Keep?' : 'Travel to ' + jobDetail(location) + '?';
        this.drawText(question, 0, 0, Graphics.width, 'left');
        let y = 72;
        for (const [from, to] of [[1, 100], [101, 200], [201, 300]]) {
            for (const job of accepted) {
                if (job[0] < from || job[0] > to || job[1] !== location) continue;
                this.changeTextColor(this.normal());
                if (job[0] < 101) this.icon(227, 0, y);   // story mission
                else if (job[0] < 201) this.icon(228, 0, y);   // side mission
                else if (job[5] !== false && job[5] !== null && job[5] !== undefined) {   // completed
                    this.changeTextColor(this.rrVxPowerUpColor ? this.rrVxPowerUpColor() : ColorManager.powerUpColor());
                    this.icon(226, 0, y);
                } else this.icon(225, 0, y);   // active
                let text = jobDetail(job[0]);
                this.drawText(text, 24, y, this.contents.width, 'left');
                let x = this.textWidth(text) + 24;
                if (job[0] >= 204 && job[0] <= 213) {   // deliveries
                    this.icon(DELIVERY_ICONS[job[0] - 204], x, y);
                    x += 24;
                }
                if (job[0] > 100) {
                    text = ' - ' + jobDetail(job[1]);
                    if (job[0] > 200) text += jobDetail(job[2]);
                    text += ' - ';
                    this.drawText(text, x, y, this.contents.width - x, 'left');
                    x += this.textWidth(text);
                    this.icon(job[3], x, y);
                }
                y += WLH;
            }
        }
        this._data = ['Yes', 'No'];
        for (let i = 0; i < this._data.length; i++) this.drawItem(i);
        this.visible = true;
        this.select(0);
        this.activate();
    };
    Window_RRThrallTravel.prototype.drawItem = function(index) {
        if (!this._data[index]) return;
        this.contents.clearRect(4, WLH * (index + 1), this.innerWidth - 4, WLH);
        this.changeTextColor(this.normal());
        this.drawText(this._data[index], 4, WLH * (index + 1), this.innerWidth - 4, 'left');
    };
    Window_RRThrallTravel.prototype.hideTravel = function() {
        this.contents.clear();
        this.visible = false;
        this.deselect();
        this.deactivate();
    };

    //-------------------------------------------------------------------------
    // Scene_Travel
    //-------------------------------------------------------------------------
    function Scene_RRThrallTravel() { this.initialize(...arguments); }
    Scene_RRThrallTravel.prototype = Object.create(Scene_Base.prototype);
    Scene_RRThrallTravel.prototype.constructor = Scene_RRThrallTravel;

    /** The pictures of the regions opened so far, in the order the original painted them. */
    Scene_RRThrallTravel.regionPictures = function() {
        const out = [HOME_MAP];
        const regions = $gameVariables.value(REGION_VARIABLE);
        for (let i = 0; i <= regions; i++) {
            const name = i > 0 ? destination(i).map : null;
            if (name) out.push(name);
        }
        return out;
    };

    Scene_RRThrallTravel.prototype.create = function() {
        Scene_Base.prototype.create.call(this);
        this._destination = 0;
        this._destMax = $gameVariables.value(REGION_VARIABLE);
        // Everything the scene can show, loaded before it starts.
        this._base = ImageManager.loadPicture(BASE_MAP);
        this._regions = Scene_RRThrallTravel.regionPictures().map(n => ImageManager.loadPicture(n));
        for (let i = 0; i <= this._destMax; i++) {
            const cursor = destination(i).cursor;
            if (cursor) ImageManager.loadPicture(cursor);
        }
        this._mapSprite = new Sprite();
        this.addChild(this._mapSprite);
        this._cursorSprite = new Sprite(new Bitmap(Graphics.width, Graphics.height));
        this.addChild(this._cursorSprite);
        this.createWindowLayer();
        this._travelWindow = new Window_RRThrallTravel();
        this.addWindow(this._travelWindow);
    };

    Scene_RRThrallTravel.prototype.start = function() {
        Scene_Base.prototype.start.call(this);
        // Map_Sprite: the world, with each opened region painted over it.
        const map = new Bitmap(this._base.width || Graphics.width, this._base.height || Graphics.height);
        map.blt(this._base, 0, 0, this._base.width, this._base.height, 0, 0);
        for (const region of this._regions) if (region.isReady() && !region.isError()) map.blt(region, 0, 0, region.width, region.height, 0, 0);
        this._mapSprite.bitmap = map;
        this.refreshCursor(0);
    };

    /** Travel_Sprite#refresh: the destination's highlight; one with no picture leaves the last. */
    Scene_RRThrallTravel.prototype.refreshCursor = function(index) {
        const name = destination(index).cursor;
        if (!name) return;
        const picture = ImageManager.loadPicture(name);
        const bitmap = this._cursorSprite.bitmap;
        picture.addLoadListener(() => {
            bitmap.clear();
            if (!picture.isError()) bitmap.blt(picture, 0, 0, picture.width, picture.height, 0, 0);
        });
    };

    Scene_RRThrallTravel.prototype.update = function() {
        Scene_Base.prototype.update.call(this);
        const travel = this._travelWindow;
        if (travel.active) {
            if (Input.isTriggered('cancel')) {
                SoundManager.playCancel();
                travel.hideTravel();
            } else if (Input.isTriggered('ok')) {
                if (travel.index() === 0) {
                    SoundManager.playOk();
                    this.returnScene();
                } else {
                    SoundManager.playCancel();
                    travel.hideTravel();
                }
            }
        } else if (Input.isTriggered('up') || Input.isTriggered('left')) {
            SoundManager.playCursor();
            this._destination--;
            if (this._destination < 0) this._destination = this._destMax;
            this.refreshCursor(this._destination);
        } else if (Input.isTriggered('down') || Input.isTriggered('right')) {
            SoundManager.playCursor();
            this._destination++;
            if (this._destination > this._destMax) this._destination = 0;
            this.refreshCursor(this._destination);
        } else if (Input.isTriggered('ok')) {
            SoundManager.playOk();
            travel.refreshTravel(this._destination);
        }
    };

    Scene_RRThrallTravel.prototype.returnScene = function() {
        $gameVariables.setValue(RESULT_VARIABLE, this._destination);
        SceneManager.goto(Scene_Map);
    };

    window.Scene_RRThrallTravel = Scene_RRThrallTravel;
    window.Window_RRThrallTravel = Window_RRThrallTravel;
})();
