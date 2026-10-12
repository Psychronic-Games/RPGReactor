/*:
 * @target MZ
 * @plugindesc Pinnacle's menus and windows (VX Ace), for imported games
 * @author Zoro (Pinnacle - The Five Kingdoms); ported for RPG Reactor
 * @url https://github.com/Psychronic-Games/RPG-Reactor
 *
 * @help RR_PinnacleWindows.js
 *
 * The windows of Pinnacle - The Five Kingdoms as its edits to VX Ace's drew
 * them:
 *   Menu       Item, Skill, Equip, Status, Guide, Story (and, with the armies
 *              out, Create army, Reinforce, Disband, Rename), each row with
 *              a line over it; the party in eight short rows with their map
 *              sprite (an army as five troop icons, with its commander),
 *              level and experience bar, affection (an army's troop count),
 *              class and skills learned out of the most allowed. The gold
 *              shows with its coin icon.
 *   Status     the portrait, a growth bar under HP and MP, affection,
 *              critical, evasion and accuracy rates and Move; an enemy's
 *              page turns with Left and Right through its skills.
 *   Help       three lines in the item, skill and shop screens; an item or
 *              skill shows its range, power and accuracy under a line.
 *   Items      Gear (weapons and armor), Resources, Important and Troops.
 *   Skills     one column, the range beside each; locked skill types show
 *              greyed; Passives last.
 *   Equipment  all eight parameters, the rates and Move, compared.
 *   Shops      the price of a kingdom's coin depends on the hero's homeland;
 *              some stalls take a resource instead of gold; the status shows
 *              the item's bonuses and who can use it.
 *   Save       the hero's name and every member's sprite on each file.
 * Text in windows reads the game's keys; \R[n]<a|b|c> picks by actor n's
 * gender, \G puts a space before the currency, \S{…} shows how many of an
 * item the party has.
 *
 * Window_Base gains the game's drawing as rrPinnacle methods (portraits,
 * centred sprites, affection, ranges, lines, separators …) and replaces the
 * rrAce ones the game changed (name, nickname, level, icons, HP, simple
 * status, parameters, item names). Ranges and Move come from the battle
 * system's port (RR_PinnacleGtbs): rrPinnacleRange(item, actor) and
 * rrPinnacleMoveRange(actor) ask it.
 *
 * Installed by File › Import Project… when the imported game carried the
 * original script; its settings were read from the game's copy.
 *
 * @param commonEvents
 * @text Menu common events
 * @desc JSON: { story, create, disband, expand } common event ids.
 * @default {"story":170,"create":8,"disband":9,"expand":10}
 *
 * @param renameLength
 * @text Rename length
 * @type number
 * @default 12
 *
 * @param troopIcon
 * @text Skills icon
 * @type number
 * @default 368
 *
 * @param homelandPrices
 * @text Coin prices by homeland
 * @desc JSON: { homelands: [...], coins: { itemId: [price per homeland] } }.
 * @default {}
 */
(() => {
    'use strict';
    const P = PluginManager.parameters('RR_PinnacleWindows');
    const json = (s, d) => { try { return s ? JSON.parse(s) : d; } catch (_) { return d; } };
    const EVENTS = Object.assign({ story: 170, create: 8, disband: 9, expand: 10 }, json(P.commonEvents, {}));
    const RENAME_LENGTH = Number(P.renameLength) || 12;
    const SKILLS_ICON = Number(P.troopIcon) || 368;
    const PRICES = json(P.homelandPrices, {});
    const RGSS_SIZE = 22;   // Font.default_size: the sizes the scripts set are on this scale

    const W = Window_Base.prototype;
    const key = (t) => (window.RRKeyedText ? RRKeyedText.resolve(t) : t);
    const named = (o, name) => !!o && !!o.constructor && o.constructor.name === name;
    const rgba = (r, g, b, a = 255) => `rgba(${r},${g},${b},${a / 255})`;
    const ALIGN = ['left', 'center', 'right'];

    //=========================================================================
    // What the windows read from battlers
    //=========================================================================
    const U = {
        isArmy: (b) => !!(b && (b.isArmy ? b.isArmy() : b.isPreserveTp && b.isPreserveTp())),
        isActor: (b) => !!(b && b.isActor && b.isActor()),
        isEnemy: (b) => !!(b && b.isEnemy && b.isEnemy()),
        /** Ruby's param_plus: what level-ups added (the equipment is apart). */
        growth: (a, id) => (a && a._paramPlus ? a._paramPlus[id] || 0 : 0),
        /** Game_BattlerBase#param_cap. */
        cap: (a, id) => {
            if (!U.isActor(a)) return 1000;
            const skills = a.skills();
            let bonus = 0;
            if (skills.includes($dataSkills[id + 51])) bonus += 8;
            if (skills.includes($dataSkills[id + 59])) bonus -= 8;
            const cls = a.currentClass();
            return 5 + Math.floor(((cls && cls.params[id] && cls.params[id][1]) || 0) / 2) + bonus;
        },
        affection: (a) => (a && a.rrAffection ? a.rrAffection() : (a && a._affection) || 0),
        maxAffection: (a) => (a && a.rrMaxAffection ? a.rrMaxAffection() : a && a._maxaffection != null ? a._maxaffection : 100),
        homeland: (a) => (a && a.rrHomeland ? a.rrHomeland() : (a && a._homeland) || ''),
        /** Game_Actor#gender: set by the events, else the note's first line ("male" 1, "female" 2, anything else 3). */
        gender: (a) => {
            if (!a) return 3;
            if (a.rrGender) return a.rrGender();
            if (a._gender != null) return a._gender;
            const actor = a.actor ? a.actor() : null;
            const first = actor && actor.note ? actor.note.split('\n')[0] : '';
            return first === 'male' ? 1 : first === 'female' ? 2 : 3;
        },
        /** Game_BattlerBase#state_turn_numbers: the turns left of each state with an icon. */
        stateTurns: (b) => (b && b.states ? b.states().filter(s => s.iconIndex !== 0).map(s => (b._stateTurns ? b._stateTurns[s.id] : undefined)) : []),
        addedSkills: (a) => (a && a.addedSkills ? a.addedSkills() : []),
        addedSkillTypes: (a) => (a && a.addedSkillTypes ? a.addedSkillTypes() : []),
        /** The skills an actor learned for themselves (not passives, not the class's): Window_Base#draw_actor_skills. */
        learnedCount: (a) => {
            const added = U.addedSkills(a);
            return a.skills().filter(s => s.stypeId !== 8 && !added.includes(s.id)).length;
        },
        xparam: (b, id) => {
            const x = b.xparam(id), agi = b.agi, luk = b.luk;
            return [x + agi * 0.02 + 0.8 + luk * 0.01, x + agi * 0.02 + luk * 0.01, x + luk * 0.01 + agi * 0.0025, x + luk * 0.01 + agi * 0.0025][id];
        },
        isDrain: (item) => !!(item && item.damage && (item.damage.type === 5 || item.damage.type === 6)),
        isKeyItem: (item) => !!(item && DataManager.isItem(item) && item.itypeId === 2),
        /** A troop item's class: the Troop table's first column. */
        troopClass: (item) => {
            const data = window.RRPinnacleKingdom ? RRPinnacleKingdom.troopData() : {};
            const row = item && data[item.id];
            return row ? $dataClasses[row[0]] : null;
        },
        /** The troop item whose class an army has (Window_Base#draw_actor_graphic). */
        troopItemOf: (actor) => {
            const data = window.RRPinnacleKingdom ? RRPinnacleKingdom.troopData() : {};
            let id = null;
            for (const [k, v] of Object.entries(data)) if (v[0] === actor._classId) id = Number(k);
            return id ? $dataItems[id] : null;
        }
    };
    window.RRPinnacleUI = U;

    //=========================================================================
    // Ace window skins (128 × 128) laid out as MZ's
    //=========================================================================
    const skins = new Map();
    /** A system image as a window skin; an Ace one is laid out as MZ's (192 × 192) once it has loaded. */
    ImageManager.rrAceWindowskin = function(name) {
        const source = this.loadSystem(name);
        if (skins.has(name)) return skins.get(name);
        const skin = new Bitmap(192, 192);
        const lay = () => {
            if (source.width >= 192) { skin.blt(source, 0, 0, 192, 192, 0, 0); return; }
            const blt = (sx, sy, sw, sh, dx, dy, dw, dh) => skin.blt(source, sx, sy, sw, sh, dx, dy, dw, dh);
            skin.context.imageSmoothingEnabled = false;
            blt(0, 0, 64, 64, 0, 0, 96, 96);
            blt(0, 64, 64, 64, 0, 96, 96, 96);
            blt(80, 0, 32, 16, 104, 0, 80, 16); blt(80, 48, 32, 16, 104, 80, 80, 16);
            blt(64, 16, 16, 32, 96, 8, 16, 80); blt(112, 16, 16, 32, 176, 8, 16, 80);
            blt(64, 0, 16, 16, 96, 0); blt(112, 0, 16, 16, 176, 0); blt(64, 48, 16, 16, 96, 80); blt(112, 48, 16, 16, 176, 80);
            blt(88, 16, 16, 8, 136, 26); blt(88, 40, 16, 8, 136, 62);
            blt(64, 64, 32, 32, 96, 96, 48, 48);
            for (let i = 0; i < 4; i++) blt(96 + (i % 2) * 16, 64 + Math.floor(i / 2) * 16, 16, 16, 144 + (i % 2) * 24 + 4, 96 + Math.floor(i / 2) * 24 + 4);
            for (let i = 0; i < 32; i++) blt(64 + (i % 8) * 8 + 4, 96 + Math.floor(i / 8) * 8 + 4, 1, 1, 96 + (i % 8) * 12, 144 + Math.floor(i / 8) * 12, 12, 12);
        };
        // The skin reads as loading until it is laid out, so a window that takes it refreshes then.
        if (!source.isReady()) skin._loadingState = 'loading';
        source.addLoadListener(() => {
            lay();
            if (skin._loadingState === 'loading') {
                skin._loadingState = 'loaded';
                skin._callLoadListeners();
            }
        });
        skins.set(name, skin);
        return skin;
    };

    //=========================================================================
    // Window_Base: VX Ace's drawing as the game changed it
    //=========================================================================
    Object.assign(W, {
        /** RGSS draw_text(x, y, w, h, text, align): the text centred in the rect's height, its key read. */
        rrPinnacleText(x, y, width, height, text, align = 0) {
            const t = text === null || text === undefined ? '' : String(text);
            this.contents.drawText(key(t), x, y, width, height, typeof align === 'number' ? ALIGN[align] : align);
        },
        rrPinnacleFontSize(size) { return size * $gameSystem.mainFontSize() / RGSS_SIZE; },
        /** Refresh once a picture still loading has arrived (RGSS loaded them before drawing). */
        rrPinnacleLater(bitmap) {
            if (bitmap.isReady()) return false;
            if (!this._rrPinnacleWaiting) {
                this._rrPinnacleWaiting = true;
                bitmap.addLoadListener(() => {
                    this._rrPinnacleWaiting = false;
                    if (!this._destroyed && this.contents && this.refresh) this.refresh();
                });
            }
            return true;
        },
        rrPinnacleLineColor() { return rgba(255, 255, 255, 48).replace('255,255,255', this.rrPinnacleNormalRgb()); },
        rrPinnacleNormalRgb() {
            const c = ColorManager.normalColor();
            const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i.exec(c);
            return m ? [m[1], m[2], m[3]].map(h => parseInt(h, 16)).join(',') : '255,255,255';
        },
        rrPinnacleDrawHorzLine(y, color) {
            this.contents.fillRect(0, y + Math.floor(this.lineHeight() / 2) - 1, this.innerWidth, 2, color || this.rrPinnacleLineColor());
        },
        rrPinnacleDrawVertLine(x, y, height) { this.contents.fillRect(x, y, 2, height, this.rrPinnacleLineColor()); },
        /** The window frame's bottom edge stretched across the contents (Window_Base#draw_separation). */
        rrPinnacleDrawSeparation(y) {
            const skin = ImageManager.loadSystem('Window');
            if (this.rrPinnacleLater(skin)) return;
            const ace = skin.width < 192;
            this.contents.blt(skin, ace ? 64 : 96, ace ? 60 : 92, ace ? 64 : 96, 4, 0, y, this.innerWidth, 4);
        },
        rrPinnacleReverseGauge(x, y, width, rate, color1, color2) {
            const fill = Math.floor(width * (rate || 0));
            const gy = y + this.lineHeight() - 8;
            this.contents.fillRect(x, gy, width, 6, ColorManager.gaugeBackColor());
            this.contents.gradientFillRect(x + width - fill, gy, fill, 6, color1, color2);
        },
        rrPinnacleDrawPortrait(faceName, faceIndex, x, y, enabled = true) {
            if (!faceName) return;
            const bitmap = ImageManager.loadFace(faceName + 'Portrait');
            if (this.rrPinnacleLater(bitmap)) return;
            const opacity = this.contents.paintOpacity;
            this.contents.paintOpacity = enabled ? 255 : this.translucentOpacity();
            this.contents.blt(bitmap, 200 * (faceIndex % 4), 200 * Math.floor(faceIndex / 4), 200, 200, x, y);
            this.contents.paintOpacity = opacity;
        },
        rrPinnacleDrawActorPortrait(actor, x, y, enabled = true) { this.rrPinnacleDrawPortrait(actor.faceName(), actor.faceIndex(), x - 10, y, enabled); },
        rrPinnacleDrawFaceScaled(faceName, faceIndex, x, y, scale, enabled = true) {
            const bitmap = ImageManager.loadFace(faceName);
            if (this.rrPinnacleLater(bitmap)) return;
            const opacity = this.contents.paintOpacity;
            this.contents.paintOpacity = enabled ? 255 : this.translucentOpacity();
            this.contents.blt(bitmap, (faceIndex % 4) * 96, Math.floor(faceIndex / 4) * 96, 96, 96, x, y, 96 * scale, 96 * scale);
            this.contents.paintOpacity = opacity;
        },
        rrPinnacleDrawActorFaceScaled(actor, x, y, scale, enabled = true) { this.rrPinnacleDrawFaceScaled(actor.faceName(), actor.faceIndex(), x, y, scale, enabled); },
        /** A whole system image with its origin at (ox, oy) of its size; returns the rect it covers (Molegato's draw_system). */
        rrPinnacleDrawSystem(name, x, y, ox = 0, oy = 0) {
            const bitmap = ImageManager.loadSystem(name);
            const left = x - bitmap.width * ox, top = y - bitmap.height * oy;
            if (!this.rrPinnacleLater(bitmap)) this.contents.blt(bitmap, 0, 0, bitmap.width, bitmap.width, left, top);
            return [left, top, left + bitmap.width, top + bitmap.height];
        },
        rrPinnacleInstantClose() { this.openness = 0; this._opening = this._closing = false; },
        rrPinnacleInstantOpen() { this.openness = 255; this._opening = this._closing = false; },
        /** draw_character with the enabled flag: a disabled one at opacity 100. */
        rrPinnacleDrawCharacter(name, index, x, y, enabled = true) {
            if (!name) return;
            const bitmap = ImageManager.loadCharacter(name);
            if (this.rrPinnacleLater(bitmap)) return;
            const big = ImageManager.isBigCharacter(name);
            const pw = bitmap.width / (big ? 3 : 12), ph = bitmap.height / (big ? 4 : 8);
            const n = big ? 0 : index;
            const opacity = this.contents.paintOpacity;
            this.contents.paintOpacity = enabled ? 255 : 100;
            this.contents.blt(bitmap, ((n % 4) * 3 + 1) * pw, Math.floor(n / 4) * 4 * ph, pw, ph, x - pw / 2, y - ph);
            this.contents.paintOpacity = opacity;
        },
        /**
         * A sprite centred on (x, y), from the battlers' folder (the game looked for the file without its
         * extension, so never found it among the characters).
         */
        rrPinnacleDrawCenteredCharacter(name, index, x, y, enabled = true) {
            if (!name) return;
            const bitmap = ImageManager.loadEnemy(name);
            if (this.rrPinnacleLater(bitmap)) return;
            const big = /^[!$]./.test(name) && name.slice(0, 2).includes('$');
            const cw = bitmap.width / (big ? 3 : 12), ch = bitmap.height / (big ? 4 : 8);
            const n = index;
            const opacity = this.contents.paintOpacity;
            this.contents.paintOpacity = enabled ? 255 : 100;
            this.contents.blt(bitmap, ((n % 4) * 3 + 1) * cw, Math.floor(n / 4) * 4 * ch, cw, ch, x - cw / 2, y - ch / 2);
            this.contents.paintOpacity = opacity;
        },
        /** An army as five of its troop item's icon. */
        rrPinnacleDrawTroopIcons(actor, x, y) {
            const item = U.troopItemOf(actor);
            if (!item) return;
            for (const [dx, dy] of [[-12, -24], [12, -24], [0, -12], [12, 0], [-12, 0]]) this.drawIcon(item.iconIndex, x + dx, y + dy);
        },
        rrPinnacleDrawActorGraphic(actor, x, y) {
            if (U.isArmy(actor)) this.rrPinnacleDrawTroopIcons(actor, x, y - 16);
            else this.rrPinnacleDrawCharacter(actor.characterName(), actor.characterIndex(), x, y);
        },
        rrPinnacleDrawCenteredActorGraphic(actor, x, y) {
            if (!actor) return;
            if (U.isArmy(actor)) this.rrPinnacleDrawTroopIcons(actor, x, y + 4);
            else this.rrPinnacleDrawCenteredCharacter(actor.characterName(), actor.characterIndex(), x, y);
        },
        /** Affection as a red-to-green bar with a mark, or an army's troop count. */
        rrPinnacleDrawActorAffection(actor, x, y, width = 124, small = false) {
            if (!U.isActor(actor) || actor.actorId() === 1) return;
            const lh = this.lineHeight();
            if (U.isArmy(actor)) {
                this.rrPinnacleText(x, y, width, lh, key('[201') + ' ' + actor.level);
                return;
            }
            const w = small ? 125 : 150, half = small ? 62 : 75, step = small ? 0.625 : 0.75;
            this.contents.fillRect(x - 1, y + 15, w + 2, 8, rgba(125, 125, 125, 95));
            this.rrAceGauge(x, y, w, 1, rgba(255, 0, 0), rgba(0, 255, 0));
            this.changeTextColor(ColorManager.systemColor());
            this.rrPinnacleText(x, y + 8, w, lh, 'I', 1);
            this.drawIcon(125, x - 25, y + 8);
            const max = U.maxAffection(actor);
            if (max < 100) this.contents.fillRect(x + half + max * step, y + 16, half - max * step + 1, 6, rgba(0, 0, 0, 95));
            this.resetTextColor();
            this.rrPinnacleText(x + half + U.affection(actor) * step, y + 8, 30, lh, '|');
            if (small) {
                const a = U.affection(actor);
                const text = a > 79 ? 'Devoted' : a > 59 ? 'Trusted' : a > 29 ? 'Friend' : a > -31 ? 'Acquainted' : a > -61 ? 'Skeptical' : 'Distrustful';
                this.rrPinnacleText(x, y + 24, 124, lh, text, 1);
            }
        },
        rrPinnacleDrawActorAffectionSmall(actor, x, y, width = 124) { this.rrPinnacleDrawActorAffection(actor, x, y, width, true); },
        /** The skills an actor has learned out of the most their level allows. */
        rrPinnacleDrawActorSkills(actor, x, y) {
            this.drawIcon(SKILLS_ICON, x, y);
            this.rrPinnacleText(x + 32, y, 100, this.lineHeight(), `${U.learnedCount(actor)}/${Math.floor(1 + actor.level / 3)}`);
        },
        rrPinnacleDrawActorXparam(actor, x, y, paramId) {
            const lh = this.lineHeight();
            this.changeTextColor(ColorManager.systemColor());
            this.rrPinnacleText(x, y, 120, lh, TextManager.rrPinnacleXparam ? TextManager.rrPinnacleXparam(paramId) : ['Hit', 'Evasion', 'Critical', 'Crit. Evasion'][paramId]);
            this.resetTextColor();
            this.rrPinnacleText(x + 124, y, 56, lh, `${Math.trunc(U.xparam(actor, paramId) * 100)}%`, 2);
        },
        /** The range data of a skill, weapon or item as GTBS keeps it (RR_PinnacleGtbs's lookups), or null. */
        rrPinnacleRange(item, actor) {
            if (!item) return null;
            const GT = window.RRGtbs && RRGtbs.GT;
            if (DataManager.isSkill(item)) return actor && actor.tbsSkillRange ? actor.tbsSkillRange(item.id) : GT ? GT.skillRange(item.id) : null;
            if (DataManager.isWeapon(item)) return GT ? GT.weaponRange(item.id) : null;
            if (DataManager.isItem(item)) return actor && actor.tbsItemRange ? actor.tbsItemRange(item.id) : GT ? GT.itemRange(item.id) : null;
            return null;
        },
        rrPinnacleMoveRange(actor) { return actor && actor.tbsBaseMoveRange ? actor.tbsBaseMoveRange() : ''; },
        /** Window_Base#draw_range: the range icon and reach, and the area icon and size. */
        rrPinnacleDrawRange(item, x, y, actor = this._actor) {
            let range = this.rrPinnacleRange(item, actor);
            if (!range) return;
            range = Array.from(range);
            let icon = 0;
            if (DataManager.isWeapon(item)) range = [range[0], range[4], range[2], true, range[1]];
            if (DataManager.isItem(item)) range = [range[0], range[1], false, true, range[2], 0, range[6]];
            if (DataManager.isWeapon(item)) {
                icon = range[2] ? 576 : 580;
                range[2] = !range[2];
            } else {
                const friend = [7, 8, 9, 10, 11].includes(item.scope);
                icon = friend ? 577 : 576;
                if (range[2]) icon = friend ? 579 : 580;
                if (item.scope === 11) icon = 578;
            }
            const hidden = DataManager.isSkill(item) && item.stypeId === 7;
            let numbers = range[0] > 0 ? String(range[0]) : '';
            const adj = range[2] ? 1 : 0;
            if (range[4] > 1 - adj) numbers = `${range[4] + adj}-${range[0]}`;
            if (!hidden) this.rrPinnacleDrawTextEx(`\\i[${icon}] ${numbers}`, x + 80, y);
            if (range[1] > 0) {
                const area = { 0: 584, 1: 583, 2: 585 }[range[6]] || 584;
                if (!hidden) this.rrPinnacleDrawTextEx(`\\i[${area}] ${range[1]}`, x + 124, y);
            }
        },
        /** draw_text_ex keeping the font the caller set (the game's notl calls). */
        rrPinnacleDrawTextEx(text, x, y) {
            const face = this.contents.fontFace, size = this.contents.fontSize, color = this.contents.textColor;
            const state = this.createTextState(text, x, y, 0);
            this.processAllText(state);
            this.contents.fontFace = face; this.contents.fontSize = size; this.contents.textColor = color;
            return state.outputWidth;
        }
    });

    // A gauge with no rate is empty.
    const _gauge = W.rrAceGauge;
    W.rrAceGauge = function(x, y, width, rate, color1, color2) { _gauge.call(this, x, y, width, rate == null ? 0 : rate, color1, color2); };

    // An actor's name: the hero's and an army's as set, the others' from the database.
    W.rrAceDrawActorName = function(actor, x, y, width = 112) {
        this.changeTextColor(this.rrAceHpColor(actor));
        const own = U.isArmy(actor) || U.isEnemy(actor) || (U.isActor(actor) && actor.actorId() === 1);
        const name = own ? actor.name() : ($dataActors[actor.actorId()] || {}).name || actor.name();
        this.rrPinnacleText(x, y, width, this.lineHeight(), name);
    };
    W.rrAceDrawActorClass = function(actor, x, y, width = 112) {
        this.resetTextColor();
        this.rrPinnacleText(x, y, width, this.lineHeight(), actor.currentClass().name);
    };
    // The nickname is the species: a label, and the database's nickname on the right.
    W.rrAceDrawActorNickname = function(actor, x, y, width = 160) {
        this.changeTextColor(ColorManager.systemColor());
        this.rrPinnacleText(x, y, width, this.lineHeight(), '[2647');
        this.resetTextColor();
        this.rrPinnacleText(x, y, width, this.lineHeight(), ($dataActors[actor.actorId()] || {}).nickname || '', 2);
    };
    // The level over a yellow bar of the way to the next (100 experience each); an army has none.
    W.rrAceDrawActorLevel = function(actor, x, y) {
        if (U.isArmy(actor)) return;
        const exp = actor.currentExp ? actor.currentExp() : 0;
        this.rrAceGauge(x, y, 80, (exp % 100) * 0.01, rgba(200, 200, 0), rgba(150, 150, 0));
        this.changeTextColor(ColorManager.systemColor());
        this.rrPinnacleText(x, y, 32, this.lineHeight(), TextManager.levelA);
        this.resetTextColor();
        this.rrPinnacleText(x + 32, y, 24, this.lineHeight(), actor.level, 2);
    };
    // State icons with the turns each has left over them.
    W.rrAceDrawActorIcons = function(actor, x, y, width = 96) {
        const icons = actor.allIcons().slice(0, Math.floor(width / 24));
        icons.forEach((n, i) => this.drawIcon(n, x + 24 * i, y));
        U.stateTurns(actor).forEach((n, i) => this.rrPinnacleText(x + 24 * i, y + 6, 24, 18, n == null ? '' : n));
    };
    // HP: green while above 70%, then orange, red under 40%; the label spans the bar.
    W.rrAceDrawActorHp = function(actor, x, y, width = 124) {
        const rate = actor.hpRate();
        const colors = rate < 0.4 ? [18, 10] : rate < 0.7 ? [14, 17] : [11, 3];
        this.rrAceGauge(x, y, width, rate, ColorManager.textColor(colors[0]), ColorManager.textColor(colors[1]));
        this.changeTextColor(ColorManager.systemColor());
        this.rrPinnacleText(x, y, width - 8, this.lineHeight(), TextManager.hpA);
        this.rrAceDrawCurrentAndMaxValues(x, y, width, actor.hp, actor.mhp, this.rrAceHpColor(actor), ColorManager.normalColor());
    };
    // Name, level, states; class, affection (or troops) and skills instead of HP and MP.
    W.rrAceDrawActorSimpleStatus = function(actor, x, y) {
        const lh = this.lineHeight();
        this.rrAceDrawActorName(actor, x, y);
        this.rrAceDrawActorLevel(actor, x, y + lh);
        this.rrAceDrawActorIcons(actor, x, y + lh * 2);
        this.rrAceDrawActorClass(actor, x + 120, y);
        this.rrPinnacleDrawActorAffection(actor, x + 120, y + lh);
        if (!U.isArmy(actor)) this.rrPinnacleDrawActorSkills(actor, x + 120, y + lh * 2);
    };
    // A parameter over its growth bar (gold when it reached the cap), with buffs in green or red.
    W.rrAceDrawActorParam = function(actor, x, y, paramId) {
        const lh = this.lineHeight();
        if (U.isActor(actor)) {
            const growth = U.growth(actor, paramId), cap = U.cap(actor, paramId);
            const full = growth === cap;
            this.rrAceGauge(x, y, 100, cap ? growth / cap : 0, ColorManager.textColor(full ? 0 : 20), ColorManager.textColor(full ? 17 : 21));
        }
        const rate = actor.paramRate ? actor.paramRate(paramId) : 1;
        const adjustment = rate * 10 - 10;
        this.changeTextColor(ColorManager.systemColor());
        this.rrPinnacleText(x, y, 120, lh, TextManager.param(paramId));
        const buff = (actor._buffs ? actor._buffs[paramId] || 0 : 0) + adjustment;
        let text;
        if (buff > 0) { this.changeTextColor(rgba(0, 255, 0)); text = `${actor.param(paramId)} (+${Math.trunc(buff)})`; }
        else if (buff < 0) { this.changeTextColor(rgba(255, 0, 0)); text = `${actor.param(paramId)} (${Math.trunc(buff)})`; }
        else { this.resetTextColor(); text = String(actor.param(paramId)); }
        this.rrPinnacleText(x + 100, y, 76, lh, text, 2);
    };
    // An item's name read through its key and escape codes; a commander (no icon) as their sprite.
    W.rrAceDrawItemName = function(item, x, y, enabled = true, width = 172) {
        if (!item) return;
        this.changePaintOpacity(enabled);
        if (item.iconIndex === 0 && item.id > 100 && DataManager.isArmor(item)) {
            this.rrPinnacleDrawCenteredActorGraphic($gameActors.actor(item.id - 100), x + 12, y + 12);
        } else {
            this.drawIcon(item.iconIndex, x, y, enabled);
        }
        this.resetTextColor();
        this.changePaintOpacity(enabled);
        const text = this.convertEscapeCharacters(key(item.name)).replace(/\x1b./g, '');
        this.rrPinnacleText(x + 24, y, width, this.lineHeight(), text);
        this.changePaintOpacity(true);
    };

    //-------------------------------------------------------------------------
    // Escape codes the game added
    //-------------------------------------------------------------------------
    /** \S{…}: the Ruby the messages carry, which counts an item the party has. */
    const evalS = (code) => {
        const m = /^\s*\$game_party\.item_number\(\s*\$data_(items|weapons|armors)\[(\d+)\]\s*\)\s*$/.exec(code);
        if (!m) return code;
        const table = { items: $dataItems, weapons: $dataWeapons, armors: $dataArmors }[m[1]];
        return String($gameParty.numItems(table[Number(m[2])]));
    };
    const _convert = W.convertEscapeCharacters;
    W.convertEscapeCharacters = function(text) {
        let t = String(text ?? '');
        t = t.replace(/\\G/gi, ' ' + key(TextManager.currencyUnit));
        t = _convert.call(this, t);
        t = t.replace(/\x1bR\[(\d+)\]<(.*)\|(.*)\|(.*)>/gi, (m, n, a, b, c) => {
            const g = U.gender($gameActors.actor(Number(n)));
            return g === 1 ? a : g === 2 ? b : c;
        });
        t = t.replace(/\x1bS\{(.+)\}/gi, (m, code) => evalS(code));
        return t;
    };

    //=========================================================================
    // Command lists: a separator line over every row (not on the title)
    //=========================================================================
    const _commandDrawItem = Window_Command.prototype.drawItem;
    Window_Command.prototype.drawItem = function(index) {
        _commandDrawItem.call(this, index);
        if (!named(this, 'Window_TitleCommand') && !named(SceneManager._scene, 'Scene_Title')) this.rrPinnacleDrawSeparation(this.itemHeight() * index);
    };

    //=========================================================================
    // Window_Help: three lines in the item, skill and shop screens; an item or
    // skill shows its range, power and accuracy
    //=========================================================================
    const H = Window_Help.prototype;
    const _setText = H.setText;
    H.setText = function(text) { _setText.call(this, typeof text === 'string' ? text.replace(/\r/g, '') : text); };
    H.setItem = function(item) {
        this.setText(item ? item.description : '');
        this.rrPinnacleDrawItemInfo(item);
    };
    const _helpRefresh = H.refresh;
    H.refresh = function() {
        _helpRefresh.call(this);
        if (this._rrItem !== undefined) this.rrPinnacleDrawItemInfo(this._rrItem, true);
    };
    H.rrPinnacleDrawItemInfo = function(item, redraw) {
        if (!redraw) this._rrItem = item;
        if (!item || named(SceneManager._scene, 'Scene_Options') || named(SceneManager._scene, 'Scene_RRH87Options')) return;
        if (!DataManager.isItem(item) && !DataManager.isSkill(item)) return;
        if (!(item.occasion === 0 || item.occasion === 1 || item.occasion === 2)) return;
        const actor = $gameActors.actor(67);
        const lh = this.lineHeight();
        const lines = this.height > this.fittingHeight(2) ? 2 : 1;
        const formula = String((item.damage && item.damage.formula) || '').replace(/ /g, '');
        let subject = item;
        const m = /v\[3\]=(\d+)/.exec(formula);
        if (m) subject = $dataSkills[Number(m[1])] || item;
        if (!(subject.occasion === 0 || subject.occasion === 1)) return;
        this.rrPinnacleDrawHorzLine(lh * lines - 12);
        this.changeTextColor(ColorManager.systemColor());
        this.rrPinnacleText(4, lh * lines, 200, lh, '[148');
        this.rrPinnacleDrawRange(subject, this.x - 20, lh * lines, actor);
        this.rrPinnacleDrawPower(this.width / 2 - 100, lh * lines, subject);
        this.rrPinnacleDrawAccuracy(this.width - 125, lh * lines, subject);
    };
    H.rrPinnacleDrawAccuracy = function(x, y, item) {
        if (item.hitType === 0) return;
        const lh = this.lineHeight();
        this.changeTextColor(ColorManager.systemColor());
        this.rrPinnacleText(x, y, 100, lh, '[34');
        this.resetTextColor();
        const hit = item.successRate - 80;
        this.rrPinnacleText(x, y, 100, lh, (hit >= 0 ? '+' : '') + hit + '%', 2);
    };
    H.rrPinnacleDrawPower = function(x, y, item) {
        if (!item.damage || item.damage.type === 0 || !item.damage.formula) return;
        const lh = this.lineHeight();
        const damage = String(item.damage.formula).replace(/ /g, '');
        const factor = (stat) => {
            let f = null;
            if (new RegExp(`a\\.${stat}`).test(damage)) f = 'x1';
            let mm = new RegExp(`a\\.${stat}\\*(\\d+)`).exec(damage); if (mm) f = 'x' + mm[1];
            mm = new RegExp(`a\\.${stat}\\/(\\d+)`).exec(damage); if (mm) f = '/' + mm[1];
            return f;
        };
        const atk = factor('atk'), mat = factor('mat');
        let fixed = (/([+-]\d+)/.exec(damage) || [])[1] || null;
        if (!atk && !mat) fixed = (/\d+/.exec(damage) || [])[0] || null;
        this.changeTextColor(ColorManager.systemColor());
        this.rrPinnacleText(x, y, 200, lh, '[79');
        this.resetTextColor();
        let text = '';
        if (atk) text += key('[59') + atk;
        if (text !== '' && (mat || (fixed && parseInt(fixed, 10) > 0))) text += '+';
        if (mat) text += key('[61') + mat;
        if (text !== '' && fixed && parseInt(fixed, 10) > 0) text += '+';
        if (fixed) text += fixed;
        this.rrPinnacleText(x + 68, y, 200, lh, text);
    };

    //=========================================================================
    // Window_Gold: the value and the coin's icon (or a paying resource's)
    //=========================================================================
    Window_Gold.prototype.refresh = function(currency = this._rrCurrency || 0) {
        this._rrCurrency = currency;
        this.contents.clear();
        const item = currency ? $dataItems[currency] : null;
        this.drawIcon(item ? item.iconIndex : 141, this.innerWidth - 24, 0);
        this.rrAceDrawCurrencyValue(this.value(currency), '', 4, 0, this.innerWidth - 32);
    };
    Window_Gold.prototype.value = function(currency = this._rrCurrency || 0) {
        return currency ? $gameParty.numItems($dataItems[currency]) : $gameParty.gold();
    };
    Window_Gold.prototype.currencyUnit = function(currency = this._rrCurrency || 0) {
        return currency ? '' : TextManager.currencyUnit;
    };

    //=========================================================================
    // Main menu
    //=========================================================================
    const troops = () => $gameParty.rrIsTroopsMode && $gameParty.rrIsTroopsMode();
    const MC = Window_MenuCommand.prototype;
    MC.rrPinnacleHeight = function() { return this.lineHeight() * 16 - 10; };
    MC.itemHeight = function() { return Math.floor(this.rrPinnacleHeight() / ((this._list ? this._list.length : 0) + 1)); };
    MC.makeCommandList = function() {
        this.addMainCommands();
        this.addFormationCommand();
        this.addOriginalCommands();
        if (!troops()) {
            this.addSaveCommand();
            this.addGameEndCommand();
        }
    };
    MC.addMainCommands = function() {
        const enabled = this.areMainCommandsEnabled();
        if (!troops()) this.addCommand(TextManager.item, 'item', enabled);
        this.addCommand(TextManager.skill, 'skill', enabled);
        this.addCommand(TextManager.equip, 'equip', enabled);
        this.addCommand(TextManager.status, 'status', enabled);
        this.addCommand('[1141', 'journal', true);
        this.addCommand('[1147', 'story', true);
        if (troops()) {
            this.addCommand('[1143', 'create', true);
            this.addCommand('[1144', 'expand', enabled);
            this.addCommand('[1145', 'disband', enabled);
            this.addCommand('[1146', 'rename', enabled);
        }
    };
    MC.addFormationCommand = function() {};
    MC.addOriginalCommands = function() {};
    MC.addSaveCommand = function() { this.addCommand(TextManager.save, 'save', this.isSaveEnabled()); };
    MC.addGameEndCommand = function() { this.addCommand(TextManager.gameEnd, 'gameEnd', true); };
    MC.itemTextAlign = function() { return 'left'; };

    const SM = Scene_Menu.prototype;
    SM.commandWindowRect = function() {
        return new Rectangle(0, 0, 160, Window_MenuCommand.prototype.lineHeight.call({}) * 16 - 10);
    };
    const _smCreateCommandWindow = SM.createCommandWindow;
    SM.createCommandWindow = function() {
        _smCreateCommandWindow.call(this);
        const w = this._commandWindow;
        w.height = w.rrPinnacleHeight();
        w.createContents();
        w.refresh();
        w.setHandler('journal', () => SceneManager.push(window.Scene_RRMolegatoQuests || Scene_Menu));
        w.setHandler('story', () => this.rrPinnacleCommonEvent(EVENTS.story));
        w.setHandler('create', () => this.rrPinnacleCommonEvent(EVENTS.create));
        for (const s of ['rename', 'expand', 'disband']) w.setHandler(s, this.commandPersonal.bind(this));
    };
    SM.rrPinnacleCommonEvent = function(id) {
        $gameTemp.reserveCommonEvent(id);
        this.popScene();
    };
    const _onPersonalOk = SM.onPersonalOk;
    SM.onPersonalOk = function() {
        const actor = $gameParty.members()[this._statusWindow.index()];
        switch (this._commandWindow.currentSymbol()) {
            case 'disband':
                $gameVariables.setValue(1, actor.actorId());
                this.rrPinnacleCommonEvent(EVENTS.disband);
                return;
            case 'expand':
                $gameVariables.setValue(1, actor.actorId());
                this.rrPinnacleCommonEvent(EVENTS.expand);
                return;
            case 'rename':
                SceneManager.push(Scene_Name);
                SceneManager.prepareNextScene(actor.actorId(), RENAME_LENGTH);
                return;
        }
        _onPersonalOk.call(this);
    };

    const MS = Window_MenuStatus.prototype;
    MS.numVisibleRows = function() { return 8; };
    MS.itemHeight = function() { return Math.floor(this.innerHeight / 8); };
    MS.drawItem = function(index) {
        const actor = $gameParty.members()[index];
        if (!actor) return;
        const rect = this.itemRect(index);
        this.drawPendingItemBackground(index);
        this.rrPinnacleDrawCenteredActorGraphic(actor, rect.x + 24, rect.y + 20);
        const commander = U.isArmy(actor) && actor.equips()[0];
        if (commander) this.rrPinnacleDrawCenteredActorGraphic($gameActors.actor(commander.id - 100), rect.x + 36, rect.y + 36);
        this.rrPinnacleDrawMenuSimpleStatus(actor, rect.x + 68, rect.y + Math.floor(this.lineHeight() / 2) - 16);
    };
    MS.rrPinnacleDrawMenuSimpleStatus = function(actor, x, y) {
        const lh = this.lineHeight();
        this.rrAceDrawActorName(actor, x, y);
        this.rrAceDrawActorLevel(actor, x, y + lh);
        this.rrAceDrawActorIcons(actor, x, y + lh * 2);
        this.rrAceDrawActorClass(actor, x + 120, y);
        this.rrPinnacleDrawActorAffection(actor, x + 120, y + lh);
        if (!U.isArmy(actor)) this.rrPinnacleDrawActorSkills(actor, x + 220, y + lh - 16);
    };
    MS.drawItemBackground = function() {};

    //=========================================================================
    // Status: one window over the whole screen, on its own skin
    //=========================================================================
    const ST = Window_Status.prototype;
    const _stInitialize = ST.initialize;
    ST.initialize = function(rect) {
        _stInitialize.call(this, rect);
        this._rrPage = 0;
    };
    ST.loadWindowskin = function() { this.windowskin = ImageManager.rrAceWindowskin('WindowOpaque'); };
    ST.update = function() {
        Window_StatusBase.prototype.update.call(this);
        this.rrPinnacleUpdateInput();
    };
    ST.rrPinnacleUpdateInput = function() {
        if (!U.isEnemy(this._actor)) return;
        const max = this.rrPinnacleMaxPages();
        if (Input.isTriggered('right')) { this._rrPage = this._rrPage + 1 > max ? 0 : this._rrPage + 1; SoundManager.playCursor(); this.refresh(); }
        if (Input.isTriggered('left')) { this._rrPage = this._rrPage - 1 < 0 ? max : this._rrPage - 1; SoundManager.playCursor(); this.refresh(); }
    };
    ST.rrPinnacleMaxPages = function() { return Math.floor((this.rrPinnacleSkills().length + 1) / 2); };
    ST.rrPinnacleSkills = function() { return this._actor && this._actor.skills ? this._actor.skills() : []; };
    ST.refresh = function() {
        this.contents.clear();
        if (!this._actor) return;
        const lh = this.lineHeight();
        this.resetFontSettings();
        this.rrPinnacleBlock1(0);
        this.rrPinnacleDrawHorzLine(lh);
        this.rrPinnacleBlock2(lh * 2);
        this.rrPinnacleDrawHorzLine(lh * 9);
        this.rrPinnacleBlock3(lh * 10);
    };
    ST.rrPinnacleBlock1 = function(y) {
        const a = this._actor;
        this.rrAceDrawActorName(a, 4, y, 300);
        if (!U.isEnemy(a)) this.rrPinnacleDrawVertLine(126, 0, 37);
        if (U.isActor(a)) this.rrPinnacleDrawClassname(a, 305, y);
        if (U.isActor(a) && !U.isArmy(a) && a.nickname() !== '') {
            this.rrPinnacleDrawVertLine(299, 0, 228);
            this.rrAceDrawActorNickname(a, 130, y);
        }
    };
    ST.rrPinnacleDrawClassname = function(actor, x, y, width = 180) {
        const cls = actor.currentClass();
        if (!cls || cls.name === '') return;
        this.changeTextColor(ColorManager.systemColor());
        this.rrPinnacleText(x, y, width, this.lineHeight(), '[614');
        this.resetTextColor();
        this.rrPinnacleText(x, y, width, this.lineHeight(), cls.name, 2);
    };
    ST.rrPinnacleBlock2 = function(y) {
        const lh = this.lineHeight();
        this.rrPinnacleDrawActorPortrait(this._actor, 0, y - 18);
        this.rrPinnacleBasicInfo(166, y);
        this.rrPinnacleExpInfo(304, y);
        this.rrPinnacleExtraInfo(304, y + lh * 3);
    };
    ST.rrPinnacleBasicInfo = function(x, y) {
        const a = this._actor, lh = this.lineHeight();
        this.rrAceDrawActorLevel(a, x, y);
        this.rrAceDrawActorIcons(a, x, y + lh);
        if (U.isActor(a)) {
            for (const id of [0, 1]) {
                const growth = U.growth(a, id), cap = U.cap(a, id), full = growth === cap;
                this.rrAceGauge(x, y + lh * (2 + id) + 4, 124, cap ? growth / cap : 0, ColorManager.textColor(full ? 0 : 20), ColorManager.textColor(full ? 17 : 21));
            }
        }
        this.rrAceDrawActorHp(a, x, y + lh * 2);
        this.rrAceDrawActorMp(a, x, y + lh * 3);
        this.rrPinnacleDrawActorAffectionSmall(a, x, y + lh * 4);
    };
    ST.rrPinnacleExpInfo = function(x, y) {
        const a = this._actor, lh = this.lineHeight();
        if (U.isArmy(a) || !U.isActor(a)) return;
        const max = a.isMaxLevel();
        const s1 = max ? '-------' : (a.currentExp() % 100), s2 = max ? '-------' : 100;
        this.changeTextColor(ColorManager.systemColor());
        this.rrPinnacleText(x, y, 180, lh, TextManager.expTotal.format(TextManager.exp));
        this.resetTextColor();
        this.rrPinnacleText(x, y + lh, 180, lh, `${s1}/${s2}`, 2);
    };
    ST.rrPinnacleExtraInfo = function(x, y) {
        const lh = this.lineHeight();
        for (const i of [0, 1, 2, 3]) this.rrPinnacleDrawActorXparam(this._actor, x, y + lh * (i - 1), i);
        this.changeTextColor(ColorManager.systemColor());
        this.rrPinnacleText(x, y + lh * 3, 120, lh, '[65');
        this.resetTextColor();
        this.rrPinnacleText(x + 124, y + lh * 3, 56, lh, this.rrPinnacleMoveRange(this._actor), 2);
    };
    ST.rrPinnacleBlock3 = function(y) {
        const a = this._actor, lh = this.lineHeight();
        if (this._rrPage === 0) for (let i = 0; i < 6; i++) this.rrAceDrawActorParam(a, 32, y + lh * i, i + 2);
        if (U.isActor(a)) {
            a.equips().forEach((item, i) => this.rrAceDrawItemName(item, 288, y + lh * i));
        } else if (U.isEnemy(a)) {
            this.drawIcon(581, 0, y + 50);
            this.drawIcon(582, this.innerWidth - 24, y + 50);
            this.rrPinnacleDrawSkills(this._rrPage === 0 ? 300 : 110, y);
        }
    };
    ST.rrPinnacleDrawSkills = function(x, y) {
        const a = this._actor, lh = this.lineHeight();
        // Skill 1 shows the enemy's weapon (GTBS's Enemy_Weapon).
        const weapon = (item) => {
            if (!item || item.id !== 1) return item;
            const w = ((window.RRGtbs && RRGtbs.G && RRGtbs.G.Enemy_Weapon) || {})[a._enemyId];
            return $dataWeapons[Array.isArray(w) ? w[0] : w || 0] || item;
        };
        if (this._rrPage === 0) {
            this.rrPinnacleSkills().forEach((skill, i) => {
                const item = weapon(skill);
                this.contents.fontSize = this.rrPinnacleFontSize(24);
                this.rrAceDrawItemName(item, x - 80, y + lh * i);
                if (item && (item.occasion === 0 || item.occasion === 1)) this.rrPinnacleDrawRange(item, x + 30, y + lh * i, a);
                this.resetFontSettings();
            });
        } else {
            this.rrPinnacleSkills().slice((this._rrPage - 1) * 2, (this._rrPage - 1) * 2 + 2).forEach((skill, i) => {
                const item = weapon(skill);
                this.contents.fontSize = this.rrPinnacleFontSize(24);
                this.rrAceDrawItemName(item, x - 80, y + lh * i * 3);
                this.contents.fontSize = this.rrPinnacleFontSize(20);
                if (DataManager.isSkill(item) && (item.occasion === 0 || item.occasion === 1)) this.rrPinnacleDrawRange(item, x + 50, y + lh * i * 3, a);
                String(item.description || '').replace(/\r/g, '').split('\n').forEach((line, l) => this.drawTextEx(line, x - 80, y + lh * (i * 3 + l + 1)));
                this.resetFontSettings();
            });
        }
    };

    const SS = Scene_Status.prototype;
    SS.create = function() {
        Scene_MenuBase.prototype.create.call(this);
        const rect = new Rectangle(0, 0, Graphics.boxWidth, Graphics.boxHeight);
        this._statusWindow = new Window_Status(rect);
        this._statusWindow.setHandler('cancel', this.popScene.bind(this));
        this._statusWindow.setHandler('pagedown', this.nextActor.bind(this));
        this._statusWindow.setHandler('pageup', this.previousActor.bind(this));
        this.addWindow(this._statusWindow);
        this._statusParamsWindow = this._statusEquipWindow = this._profileWindow = null;
    };
    SS.needsPageButtons = function() { return false; };
    SS.refreshActor = function() {
        this._statusWindow.setActor(this.actor());
        this._statusWindow.refresh();
    };
    SS.onActorChange = function() {
        Scene_MenuBase.prototype.onActorChange.call(this);
        this.refreshActor();
        this._statusWindow.activate();
    };
    SS.start = function() {
        Scene_MenuBase.prototype.start.call(this);
        this.refreshActor();
    };
    SS.helpAreaHeight = function() { return 0; };

    //=========================================================================
    // Items: Gear (weapons and armor), Resources, Important, Troops
    //=========================================================================
    const helpRect3 = () => new Rectangle(0, 0, Graphics.boxWidth, Window_Base.prototype.fittingHeight(3));
    Scene_Item.prototype.helpWindowRect = helpRect3;
    Scene_Item.prototype.categoryWindowRect = function() {
        return new Rectangle(0, this._helpWindow.y + this._helpWindow.height, Graphics.boxWidth, this.calcWindowHeight(1, true));
    };
    Window_ItemCategory.prototype.maxCols = function() { return 5; };
    const _categoryCommands = Window_ItemCategory.prototype.makeCommandList;
    Window_ItemCategory.prototype.makeCommandList = function() {
        _categoryCommands.call(this);
        this.addCommand('[191', 'troops');
    };
    const isTroopItem = (item) => U.isKeyItem(item) && item.consumable && U.isDrain(item);
    Window_ItemList.prototype.includes = function(item) {
        if (!item) return false;
        if (DataManager.isItem(item) && item.tpGain === 10) return false;
        if (item.iconIndex === 0) return false;
        switch (this._category) {
            case 'item': return DataManager.isItem(item) && item.itypeId !== 2;
            case 'weapon': return (DataManager.isWeapon(item) || DataManager.isArmor(item)) && item.iconIndex !== 0;
            case 'armor': return U.isKeyItem(item) && item.consumable && !U.isDrain(item);
            case 'troops': return isTroopItem(item);
            case 'keyItem': return U.isKeyItem(item) && !item.consumable && !U.isDrain(item);
            default: return false;
        }
    };
    // Select Key Item picks a troop: every troop item, all of them choosable.
    Window_EventItem.prototype.includes = function(item) { return DataManager.isItem(item) && U.isDrain(item); };
    Window_EventItem.prototype.isEnabled = function() { return true; };

    //=========================================================================
    // Skills: types down the left to the bottom, the list in one column with
    // each skill's range
    //=========================================================================
    Scene_Skill.prototype.helpWindowRect = helpRect3;
    Scene_Skill.prototype.skillTypeWindowRect = function() {
        const y = this._helpWindow.height;
        return new Rectangle(0, y, 160, Graphics.boxHeight - y);
    };
    Scene_Skill.prototype.statusWindowRect = function() {
        return new Rectangle(160, this._helpWindow.height, Graphics.boxWidth - 160, this.calcWindowHeight(4, false));
    };
    Scene_Skill.prototype.itemWindowRect = function() {
        const y = this._statusWindow.y + this._statusWindow.height;
        return new Rectangle(160, y, Graphics.boxWidth - 160, Graphics.boxHeight - y);
    };
    Window_SkillType.prototype.makeCommandList = function() {
        const actor = this._actor;
        if (!actor) return;
        const added = U.addedSkillTypes(actor).slice().sort((a, b) => a - b);
        for (const t of added) this.addCommand($dataSystem.skillTypes[t], 'skill', true, t);
        const all = actor.skills().concat(U.addedSkills(actor).map(id => $dataSkills[id])).filter(Boolean).map(s => s.stypeId);
        const extra = [...new Set(all)].filter(t => !added.includes(t) && t !== 7 && t !== 8).sort((a, b) => a - b);
        for (const t of extra) this.addCommand($dataSystem.skillTypes[t], 'skill', false, t);
        this.addCommand(key('[44'), 'skill', true, 7);
    };
    Window_SkillStatus.prototype.refresh = function() {
        this.contents.clear();
        if (!this._actor) return;
        this.drawActorFace(this._actor, 0, 0);
        this.rrAceDrawActorSimpleStatus(this._actor, 108, Math.floor(this.lineHeight() / 2));
    };
    Window_SkillList.prototype.maxCols = function() { return 1; };
    Window_SkillList.prototype.drawItem = function(index) {
        const skill = this.itemAt(index);
        if (!skill) return;
        const rect = this.itemRect(index);
        rect.width -= 4;
        this.rrAceDrawItemName(skill, rect.x, rect.y, true);
        const enabled = this.isEnabled(skill);
        const tp = this._actor.skillTpCost(skill), mp = this._actor.skillMpCost(skill);
        if (tp > 0 || mp > 0) {
            this.changeTextColor(tp > 0 ? ColorManager.tpCostColor() : ColorManager.mpCostColor());
            this.changePaintOpacity(enabled);
            this.rrPinnacleText(rect.x, rect.y, rect.width, rect.height, tp > 0 ? tp : mp, 2);
            this.changePaintOpacity(true);
        }
        if (skill.occasion === 0 || skill.occasion === 1) this.rrPinnacleDrawRange(skill, rect.x + 150, rect.y, this._actor);
    };

    //=========================================================================
    // Equipment: the status to the bottom on the left, everything else on the
    // right; no Optimize
    //=========================================================================
    Scene_Equip.prototype.helpWindowRect = function() { return new Rectangle(0, 0, Graphics.boxWidth, this.calcWindowHeight(2, false)); };
    Scene_Equip.prototype.statusWindowRect = function() {
        const y = this._helpWindow.height;
        return new Rectangle(0, y, 208, Graphics.boxHeight - y);
    };
    Scene_Equip.prototype.commandWindowRect = function() {
        return new Rectangle(208, this._helpWindow.height, Graphics.boxWidth - 208, this.calcWindowHeight(1, true));
    };
    Scene_Equip.prototype.slotWindowRect = function() {
        return new Rectangle(208, this._commandWindow.y + this._commandWindow.height, Graphics.boxWidth - 208, this.calcWindowHeight(5, true));
    };
    Scene_Equip.prototype.itemWindowRect = function() {
        const y = this._slotWindow.y + this._slotWindow.height;
        return new Rectangle(208, y, Graphics.boxWidth - 208, Graphics.boxHeight - y);
    };
    const _equipCreateItemWindow = Scene_Equip.prototype.createItemWindow;
    Scene_Equip.prototype.createItemWindow = function() {
        _equipCreateItemWindow.call(this);
        // MZ lays the list over the slots; Ace kept it under them, always shown.
        const rect = this.itemWindowRect();
        this._itemWindow.move(rect.x, rect.y, rect.width, rect.height);
        this._itemWindow.createContents();
        this._itemWindow.show();
    };
    Scene_Equip.prototype.hideItemWindow = function() {
        this._slotWindow.show();
        this._slotWindow.activate();
        this._itemWindow.deselect();
    };
    Scene_Equip.prototype.onSlotOk = function() {
        this._itemWindow.activate();
        this._itemWindow.select(0);
    };
    Window_EquipCommand.prototype.maxCols = function() { return 3; };
    Window_EquipCommand.prototype.makeCommandList = function() {
        this.addCommand(TextManager.equip2, 'equip');
        this.addCommand(TextManager.clear, 'clear');
    };
    Window_EquipSlot.prototype.drawItem = function(index) {
        if (!this._actor) return;
        const rect = this.itemRectWithPadding(index);
        const enabled = this.isEnabled(index);
        this.changeTextColor(ColorManager.systemColor());
        this.changePaintOpacity(enabled);
        const name = U.isArmy(this._actor) ? ['[307', '[308', '[308', '[308', '[308'][index] : this.actorSlotName(this._actor, index);
        this.rrPinnacleText(rect.x, rect.y, 92, this.lineHeight(), name || '');
        this.changePaintOpacity(true);
        this.rrAceDrawItemName(this._actor.equips()[index], rect.x + 92, rect.y, enabled);
    };
    Window_EquipItem.prototype.maxCols = function() { return 1; };
    Window_EquipItem.prototype.includes = function(item) {
        if (item === null) return true;
        if (!(DataManager.isWeapon(item) || DataManager.isArmor(item))) return false;
        if (!this._actor) return false;
        if (item.iconIndex === 0 && !U.isArmy(this._actor)) return false;
        if (this._slotId < 0) return false;
        if (item.etypeId !== this._actor.equipSlots()[this._slotId]) return false;
        return this._actor.canEquip(item);
    };
    Window_EquipItem.prototype.isEnabled = function() { return true; };
    Window_EquipItem.prototype.drawItem = function(index) {
        const item = this.itemAt(index);
        if (!item) return;
        const rect = this.itemRect(index);
        rect.width -= 4;
        this.rrAceDrawItemName(item, rect.x, rect.y, true);
        this.rrPinnacleDrawRange(item, rect.x + 100, rect.y, this._actor);
        this.rrAceDrawItemNumber(rect, item);
    };

    const ES = Window_EquipStatus.prototype;
    ES.lineHeight = function() { return 22; };
    ES.refresh = function() {
        this.contents.clear();
        const lh = this.lineHeight(), a = this._actor, t = this._tempActor;
        this.resetFontSettings();
        if (a) this.rrAceDrawActorName(a, 4, 0);
        for (let i = 0; i < 8; i++) this.rrPinnacleEquipParam(0, lh * (1 + i), i);
        this.contents.fillRect(0, lh * 9 + Math.floor(lh / 2) - 1, this.innerWidth, 2, ColorManager.normalColor());
        const rate = (b, id) => (b ? U.xparam(b, id) : 0);
        this.rrPinnacleEquipOther(0, lh * 10, '[34', rate(a, 0), rate(t, 0));
        this.rrPinnacleEquipOther(0, lh * 11, '[35', rate(a, 1), rate(t, 1));
        this.rrPinnacleEquipOther(0, lh * 12, '[36', rate(a, 2), rate(t, 2));
        this.rrPinnacleEquipOther(0, lh * 13, '[65', a ? this.rrPinnacleMoveRange(a) : 0, t ? this.rrPinnacleMoveRange(t) : 0, false);
    };
    ES.rrPinnacleEquipParam = function(x, y, paramId) {
        const lh = this.lineHeight();
        this.changeTextColor(ColorManager.systemColor());
        this.rrPinnacleText(x + 4, y, 80, lh, TextManager.param(paramId));
        if (this._actor) { this.resetTextColor(); this.rrPinnacleText(x + 94, y, 32, lh, this._actor.param(paramId), 2); }
        this.changeTextColor(ColorManager.systemColor());
        this.rrPinnacleText(x + 126, y, 22, lh, '→', 1);
        if (this._tempActor && this._actor) {
            const value = this._tempActor.param(paramId);
            this.changeTextColor(ColorManager.paramchangeTextColor(value - this._actor.param(paramId)));
            this.rrPinnacleText(x + 146, y, 32, lh, value, 2);
        }
    };
    ES.rrPinnacleEquipOther = function(x, y, name, oldValue, newValue, rate = true) {
        const lh = this.lineHeight();
        this.changeTextColor(ColorManager.systemColor());
        this.rrPinnacleText(x + 4, y, 80, lh, name);
        this.resetTextColor();
        const show = (v) => (rate ? `${Math.trunc(v * 100)}%` : v);
        if (this._actor) this.rrPinnacleText(x + 78, y, 48, lh, show(oldValue), 2);
        this.changeTextColor(ColorManager.systemColor());
        this.rrPinnacleText(x + 126, y, 22, lh, '→', 1);
        this.changeTextColor(ColorManager.paramchangeTextColor((Number(newValue) || 0) - (Number(oldValue) || 0)));
        if (this._tempActor) this.rrPinnacleText(x + 136, y, 48, lh, show(newValue), 2);
    };

    //=========================================================================
    // Shops: three-line help; a stall may take a resource for coin; a
    // kingdom's coin costs what the hero's homeland pays for it
    //=========================================================================
    const SH = Scene_Shop.prototype;
    const _shopPrepare = SH.prepare;
    SH.prepare = function(goods, purchaseOnly, currency = 0) {
        _shopPrepare.call(this, goods, purchaseOnly);
        this._rrCurrency = Number(currency) || 0;
    };
    // A stall whose goods the event could not hand over opens empty rather than failing.
    const _shopCreate = SH.create;
    SH.create = function() {
        if (!this._goods) this._goods = [];
        _shopCreate.call(this);
    };
    SH.helpWindowRect = helpRect3;
    SH.mainAreaTop = function() { return this._helpWindow ? this._helpWindow.height : Window_Base.prototype.fittingHeight(3); };
    SH.goldWindowRect = function() {
        return new Rectangle(Graphics.boxWidth - 160, this._helpWindow.height, 160, this.calcWindowHeight(1, true));
    };
    SH.commandWindowRect = function() {
        return new Rectangle(0, this._helpWindow.height, this._goldWindow.x, this.calcWindowHeight(1, true));
    };
    const below = (scene) => scene._commandWindow.y + scene._commandWindow.height;
    SH.dummyWindowRect = function() { const y = below(this); return new Rectangle(0, y, Graphics.boxWidth, Graphics.boxHeight - y); };
    SH.numberWindowRect = function() { const y = below(this); return new Rectangle(0, y, 304, Graphics.boxHeight - y); };
    SH.statusWindowRect = function() { const y = below(this); return new Rectangle(304, y, Graphics.boxWidth - 304, Graphics.boxHeight - y); };
    SH.buyWindowRect = function() { const y = below(this); return new Rectangle(0, y, 304, Graphics.boxHeight - y); };
    SH.categoryWindowRect = function() { return new Rectangle(0, below(this), Graphics.boxWidth, this.calcWindowHeight(1, true)); };
    SH.sellWindowRect = function() {
        const y = this._categoryWindow.y + this._categoryWindow.height;
        return new Rectangle(0, y, Graphics.boxWidth, Graphics.boxHeight - y);
    };
    const _createGoldWindow = SH.createGoldWindow;
    SH.createGoldWindow = function() {
        _createGoldWindow.call(this);
        this._goldWindow.refresh(this._rrCurrency || 0);
    };
    SH.money = function() { return this._goldWindow.value(this._rrCurrency || 0); };
    SH.currencyUnit = function() { return this._goldWindow.currencyUnit(this._rrCurrency || 0); };
    SH.doBuy = function(number) {
        if (this._rrCurrency) $gameParty.loseItem($dataItems[this._rrCurrency], number * this.buyingPrice());
        else $gameParty.loseGold(number * this.buyingPrice());
        $gameParty.gainItem(this._item, number);
    };
    const _onNumberOk = SH.onNumberOk;
    SH.onNumberOk = function() {
        _onNumberOk.call(this);
        this._goldWindow.refresh(this._rrCurrency || 0);
    };
    SH.needsCancelButton = function() { return false; };

    const _price = Window_ShopBuy.prototype.price;
    Window_ShopBuy.prototype.price = function(item) {
        const coins = PRICES.coins || {};
        const homes = PRICES.homelands || [];
        if (item && DataManager.isItem(item) && coins[item.id]) {
            // (With no homeland set the game failed here; the database's price is used.)
            const home = homes.indexOf(U.homeland($gameActors.actor(1)));
            if (home >= 0 && coins[item.id][home] !== undefined) return coins[item.id][home];
        }
        return _price.call(this, item);
    };

    const SS2 = Window_ShopStatus.prototype;
    SS2.refresh = function() {
        this.contents.clear();
        this._rrPage = this._rrPage || 0;
        if (!this._item) return;
        const lh = this.lineHeight();
        this.resetFontSettings();
        this.changeTextColor(ColorManager.systemColor());
        this.rrPinnacleText(4, 0, this.innerWidth - 8, lh, TextManager.possession);
        this.resetTextColor();
        this.rrPinnacleText(4, 0, this.innerWidth - 8, lh, $gameParty.numItems(this._item), 2);
        if (DataManager.isWeapon(this._item) || DataManager.isArmor(this._item)) {
            this.rrPinnacleItemInfo(4, lh * 2);
            this.rrPinnacleEquipInfo(16, lh * 9);
        }
    };
    SS2.rrPinnacleItemInfo = function(x, y) {
        const lh = this.lineHeight(), item = this._item;
        const data = [];
        for (let i = 0; i < 8; i++) data.push([TextManager.param(i), item.params[i]]);
        for (const t of item.traits || []) if (t.code === 22 && t.dataId <= 2) data.push([['[34', '[35', '[36'][t.dataId], Math.trunc(t.value * 100)]);
        let line = 0;
        for (const [name, value] of data) {
            if (value === 0) continue;
            this.changeTextColor(ColorManager.systemColor());
            this.rrPinnacleText(x, y + lh * line, this.innerWidth - 4 - x, lh, name);
            this.resetTextColor();
            this.rrPinnacleText(x, y + lh * line, this.innerWidth - 4 - x, lh, value, 2);
            line++;
        }
    };
    SS2.rrPinnacleEquipInfo = function(x, y) {
        const lh = this.lineHeight();
        const members = $gameParty.members().slice(this._rrPage * 40, this._rrPage * 40 + 40);
        members.forEach((actor, i) => this.rrPinnacleDrawCharacter(actor.characterName(), actor.characterIndex(), x + (i % 10) * 20, y + lh * Math.floor(i / 10), actor.canEquip(this._item)));
    };
    SS2.isPageChangeEnabled = function() { return false; };
    const _shopStatusUpdate = SS2.update;
    SS2.update = function() {
        _shopStatusUpdate.call(this);
        const pages = Math.ceil($gameParty.members().length / 40);
        if (this.visible && Input.isTriggered('shift') && pages > 1) {
            this._rrPage = ((this._rrPage || 0) + 1) % pages;
            this.refresh();
        }
    };

    //=========================================================================
    // Game End: the game's word for shutting down
    //=========================================================================
    Window_GameEnd.prototype.makeCommandList = function() {
        this.addCommand(TextManager.toTitle, 'toTitle');
        this.addCommand('[239', 'shutdown');
        this.addCommand(TextManager.cancel, 'cancel');
    };
    Scene_GameEnd.prototype.commandWindowRect = function() {
        const w = 160, h = this.calcWindowHeight(3, true);
        return new Rectangle(Math.floor((Graphics.boxWidth - w) / 2), Math.floor((Graphics.boxHeight - h) / 2), w, h);
    };

    //=========================================================================
    // Save and load: a window a file, four to a screen, with the hero's name
    // and every member's sprite
    //=========================================================================
    class Window_RRPinnacleSaveFile extends Window_Base {
        initialize(rect, savefileId) {
            this._savefileId = savefileId;
            this._selected = false;
            super.initialize(rect);
            this.active = true;
            this.refresh();
        }
        refresh() {
            this.contents.clear();
            this.resetFontSettings();
            const lh = this.lineHeight();
            const info = DataManager.savefileInfo(this._savefileId);
            this.resetTextColor();
            // The engine's autosave (the game had none) shows as such in the first window.
            const name = this._savefileId === 0 ? TextManager.autosave : TextManager.file;
            this.rrPinnacleText(4, 0, 100, lh, name);
            if (info) this.rrPinnacleText(4, lh, 100, lh, info.rrName || '');
            if (this._savefileId !== 0) this.rrPinnacleText(4, 0, 100, lh, ' ' + this._savefileId, 2);
            this._nameWidth = this.textWidth(name);
            if (info) {
                (info.characters || []).forEach((c, i) => this.rrPinnacleDrawCharacter(c[0], c[1], 152 + (i % 20) * 16, 48 + 16 * Math.floor(i / 20)));
                this.rrPinnacleText(0, this.innerHeight - lh, this.innerWidth - 4, lh, info.playtime || '', 2);
            }
            this.updateCursor();
        }
        setSelected(on) { this._selected = on; this.updateCursor(); }
        updateCursor() {
            if (this._selected) this.setCursorRect(0, 0, (this._nameWidth || 0) + 8, this.lineHeight());
            else this.setCursorRect(0, 0, 0, 0);
        }
    }
    window.Window_RRPinnacleSaveFile = Window_RRPinnacleSaveFile;

    const SF = Scene_File.prototype;
    SF.helpWindowRect = function() { return new Rectangle(0, 0, Graphics.boxWidth, this.calcWindowHeight(1, false)); };
    SF.listWindowRect = function() {
        const y = this.calcWindowHeight(1, false);
        return new Rectangle(0, y, Graphics.boxWidth, Graphics.boxHeight - y);
    };
    SF.needsCancelButton = function() { return false; };
    const _createListWindow = SF.createListWindow;
    SF.createListWindow = function() {
        _createListWindow.call(this);
        const list = this._listWindow;
        const rowHeight = Math.floor((Graphics.boxHeight - this._helpWindow.height) / 4);
        // The list keeps the choosing; the files' own windows show it.
        list.itemHeight = () => rowHeight;
        list.numVisibleRows = () => 4;
        list.drawItem = () => {};
        list.drawItemBackground = () => {};
        list.refreshCursor = function() { this.setCursorRect(0, 0, 0, 0); };
        list.opacity = 0;
        list.backOpacity = 0;
        list.updateArrows = function() { this.downArrowVisible = false; this.upArrowVisible = false; };
        list.createContents();
        list.refresh();
        this._rrFiles = [];
        for (let i = 0; i < list.maxItems(); i++) {
            const w = new Window_RRPinnacleSaveFile(new Rectangle(0, 0, Graphics.boxWidth, rowHeight), list.indexToSavefileId(i));
            this._rrFiles.push(w);
            this.addWindow(w);
        }
        this._rrRowHeight = rowHeight;
        this.rrPinnacleUpdateFiles();
    };
    SF.rrPinnacleUpdateFiles = function() {
        const list = this._listWindow;
        if (!this._rrFiles) return;
        const top = list.topRow(), y0 = this._helpWindow.y + this._helpWindow.height;
        this._rrFiles.forEach((w, i) => {
            const row = i - top;
            w.visible = row >= 0 && row < 4;
            w.y = y0 + row * this._rrRowHeight;
            const on = i === list.index();
            if (w._selected !== on) w.setSelected(on);
        });
    };
    const _fileUpdate = SF.update;
    SF.update = function() {
        _fileUpdate.call(this);
        this.rrPinnacleUpdateFiles();
    };
})();
