/*:
 * @target MZ
 * @plugindesc Hospital (VX Ace), for imported games
 * @author Yami (Yami Engine Symphony, with its Hospital Prizes add-on); ported for RPG Reactor
 * @url https://github.com/Psychronic-Games/RPG-Reactor
 *
 * @help RR_YamiHospital.js
 *
 * A hospital screen where the party pays to be healed. The commands (Heal
 * One, Heal All, the prizes, Exit) are at the top left beside the nurse's
 * face and one of her greetings; the party is listed under them with their
 * states, HP, MP and what healing each costs; the help and the gold are at
 * the bottom. Healing restores HP and MP and removes every state, for gold
 * per HP and MP lost and per state. Heal All is disabled when no one needs
 * healing or the party cannot pay for everyone.
 *
 * With the Hospital Prizes add-on, the HP, MP and states healed are counted,
 * and items, weapons and armours whose notes ask for them are given out
 * under the prizes command:
 *   <prize hp: n>  one for every n HP healed
 *   <prize mp: n>  one for every n MP healed
 *   <prize state 3: n>  one for every n times state 3 was removed
 *   <prize max: n>  never more than n in all
 * The counts and what was received are kept with the save. <prize states: n>
 * does nothing: the original read it under the wrong tag, and it is kept.
 *
 * Script calls:
 *   SceneManager.push(Scene_RRHospital)   (YES.hospital,
 *                                          SceneManager.call(Scene_Hospital))
 *
 * Installed by File › Import Project… when the imported game carried the
 * original script; its settings were read from the game's copy.
 *
 * @param hpCost
 * @text Gold per HP
 * @type number
 * @default 1
 *
 * @param mpCost
 * @text Gold per MP
 * @type number
 * @default 2
 *
 * @param stateCost
 * @text Gold per state
 * @type number
 * @default 10
 *
 * @param nurseFace
 * @desc JSON ["FaceSet", index].
 * @default ["Actor4",0]
 *
 * @param nurseMessages
 * @type multiline_string
 * @desc JSON: greetings, one chosen each time the screen opens (text codes allowed).
 * @default ["Hello!"]
 *
 * @param helpText
 * @type multiline_string
 * @desc JSON: heal_one, heal_all_treat (%d the fee), heal_all_healthy, prize, exit, actor_treat and actor_healthy (%s the name).
 * @default {}
 *
 * @param commandText
 * @type multiline_string
 * @desc JSON: heal_one, heal_all, prize, exit.
 * @default {"heal_one":"Heal One","heal_all":"Heal All","prize":"Prizes","exit":"Exit"}
 *
 * @param commands
 * @desc JSON: the commands in order.
 * @default ["heal_one","heal_all","exit"]
 *
 * @param prizes
 * @text Hospital Prizes add-on
 * @type boolean
 * @default false
 */
(() => {
    'use strict';
    const params = PluginManager.parameters('RR_YamiHospital');
    const json = (text, fallback) => { try { const v = JSON.parse(text); return v === null || v === undefined ? fallback : v; } catch (_) { return fallback; } };
    const num = (v, d) => (v === undefined || v === '' || !Number.isFinite(Number(v)) ? d : Number(v));
    const P = {
        hpCost: num(params.hpCost, 1),
        mpCost: num(params.mpCost, 2),
        stateCost: num(params.stateCost, 10),
        face: json(params.nurseFace, ['Actor4', 0]),
        messages: json(params.nurseMessages, ['Hello!']),
        help: json(params.helpText, {}),
        commandText: json(params.commandText, {}),
        commands: json(params.commands, ['heal_one', 'heal_all', 'exit']),
        prizes: String(params.prizes) === 'true'
    };
    const W = Window_Base.prototype;
    const fit = (lines) => W.fittingHeight.call(W, lines);
    // Ruby's format: %s and %d take the next value.
    const format = (template, ...args) => { let i = 0; return String(template ?? '').replace(/%(?:[-+ 0#]*\d*)([sd%])/g, (m, k) => (k === '%' ? '%' : String(args[i++] ?? ''))); };
    const helpText = (key) => (P.help[key] === undefined || P.help[key] === null ? '' : String(P.help[key]));

    //-------------------------------------------------------------------------
    // Fees and healing
    //-------------------------------------------------------------------------
    const A = Game_Actor.prototype;
    A.rrHospitalStates = function() { return this.states(); };
    A.rrHospitalFee = function() {
        const fee = (this.mhp - this._hp) * P.hpCost + (this.mmp - this._mp) * P.mpCost;
        return this.rrHospitalStates().reduce((f) => f + P.stateCost, fee);
    };
    A.rrHospitalNeed = function() { return this._hp < this.mhp || this._mp < this.mmp || this.rrHospitalStates().length > 0; };
    // HP and MP are set straight to full; each state is then removed (K.O. with them, which revives).
    A.rrHospitalRecover = function() {
        if ($gameParty.gold() < this.rrHospitalFee()) return SoundManager.playBuzzer();
        SoundManager.playRecovery();
        $gameParty.loseGold(this.rrHospitalFee());
        this._hp = this.mhp;
        this._mp = this.mmp;
        for (const state of this.rrHospitalStates()) this.removeState(state.id);
    };

    const G = Game_Party.prototype;
    G.rrHospitalFee = function() { return this.members().reduce((f, m) => f + m.rrHospitalFee(), 0); };
    G.rrHospitalNeed = function() { return this.members().some(m => m.rrHospitalNeed()); };
    G.rrHospitalAvailable = function() { return this.rrHospitalNeed() && this.gold() >= this.rrHospitalFee(); };
    // Each member pays for themselves in turn, each with its own sound.
    G.rrHospitalRecover = function() {
        if (!this.rrHospitalAvailable()) return SoundManager.playBuzzer();
        SoundManager.playRecovery();
        for (const m of this.members()) m.rrHospitalRecover();
    };

    //-------------------------------------------------------------------------
    // Windows
    //-------------------------------------------------------------------------
    const subclass = (base, methods) => {
        const C = function() { this.initialize(...arguments); };
        C.prototype = Object.create(base.prototype);
        C.prototype.constructor = C;
        Object.assign(C.prototype, methods);
        return C;
    };

    const Window_RRHospitalCommand = subclass(Window_Command, {
        makeCommandList() {
            for (const c of P.commands) this.addCommand(String(P.commandText[c] ?? c), c, c === 'heal_all' ? $gameParty.rrHospitalAvailable() : true);
        },
        itemTextAlign() { return 'center'; }
    });

    const Window_RRHospitalHelp = subclass(Window_Base, {
        initialize(rect) {
            Window_Base.prototype.initialize.call(this, rect);
            this._text = '';
        },
        setText(text) {
            if (text === this._text) return;
            this._text = text;
            this.refresh();
        },
        refresh() {
            this.contents.clear();
            this.drawTextEx(this._text, 4, 0, this.innerWidth - 4);
        }
    });

    const Window_RRHospitalNurse = subclass(Window_Base, {
        initialize(rect) {
            Window_Base.prototype.initialize.call(this, rect);
            this.refresh();
        },
        refresh() {
            this.contents.clear();
            const [name, index] = P.face;
            const text = P.messages.length ? String(P.messages[Math.randomInt(P.messages.length)]) : '';
            const bitmap = ImageManager.loadFace(String(name || ''));
            const draw = () => {
                this.drawFace(String(name || ''), Number(index) || 0, 0, 0);
                this.drawTextEx(text, 100, 0, this.innerWidth - 100);
            };
            if (bitmap.isReady()) draw();
            else bitmap.addLoadListener(() => { if (!this._destroyed) draw(); });
        }
    });

    const Window_RRHospitalActors = subclass(Window_Selectable, {
        initialize(rect) {
            Window_Selectable.prototype.initialize.call(this, rect);
            this._rrLastIndex = 0;
            this.refresh();
        },
        maxItems() { return $gameParty.members().length; },
        actor() { return $gameParty.members()[this.index()]; },
        drawItem(index) {
            const actor = $gameParty.members()[index];
            if (!actor) return;
            const rect = this.itemRect(index);
            this.rrAceDrawActorName(actor, rect.x + 4, rect.y);
            this.rrAceDrawActorIcons(actor, rect.x + 120, rect.y, 72);
            const gauge = this.innerWidth - 332, half = Math.floor(gauge / 2);
            this.rrAceDrawActorHp(actor, rect.x + 196, rect.y, half - 2);
            this.rrAceDrawActorMp(actor, rect.x + 200 + half, rect.y, half - 2);
            this.rrAceDrawCurrencyValue(actor.rrHospitalFee(), TextManager.currencyUnit, this.innerWidth - 136, rect.y, 136);
        },
        // The cursor leaves while the list is not in use and comes back to the same row.
        deactivate() {
            this._rrLastIndex = this.index();
            this.select(-1);
            Window_Selectable.prototype.deactivate.call(this);
        },
        activate() {
            this.select(this._rrLastIndex);
            Window_Selectable.prototype.activate.call(this);
        }
    });

    //-------------------------------------------------------------------------
    // The scene
    //-------------------------------------------------------------------------
    function Scene_RRHospital() { this.initialize(...arguments); }
    Scene_RRHospital.prototype = Object.create(Scene_MenuBase.prototype);
    Scene_RRHospital.prototype.constructor = Scene_RRHospital;
    window.Scene_RRHospital = Scene_RRHospital;
    const H = Scene_RRHospital.prototype;

    H.create = function() {
        Scene_MenuBase.prototype.create.call(this);
        ImageManager.loadFace(String(P.face[0] || ''));
        const gw = Graphics.boxWidth, gh = Graphics.boxHeight;
        this._goldWindow = new Window_Gold(new Rectangle(gw - 160, gh - fit(1), 160, fit(1)));
        this.addWindow(this._goldWindow);
        this._helpWindow = new Window_RRHospitalHelp(new Rectangle(0, this._goldWindow.y, gw - this._goldWindow.width, fit(1)));
        this.addWindow(this._helpWindow);
        this.rrCreateCommandWindow();
        const cmd = this._commandWindow;
        this._nurseWindow = new Window_RRHospitalNurse(new Rectangle(cmd.width, 0, gw - cmd.width, fit(4)));
        this.addWindow(this._nurseWindow);
        this._actorsWindow = new Window_RRHospitalActors(new Rectangle(0, cmd.height, gw, gh - this._goldWindow.height - cmd.height));
        this._actorsWindow.setHandler('ok', this.rrActorOk.bind(this));
        this._actorsWindow.setHandler('cancel', this.rrActorCancel.bind(this));
        this.addWindow(this._actorsWindow);
        this.rrUpdateHelp();
        if (P.prizes) this.rrCreatePrizeWindows();
    };
    H.rrCreateCommandWindow = function() {
        this._commandWindow = new Window_RRHospitalCommand(new Rectangle(0, 0, 160, fit(4)));
        this._commandWindow.setHandler('heal_one', this.rrCommandHealOne.bind(this));
        this._commandWindow.setHandler('heal_all', this.rrCommandHealAll.bind(this));
        this._commandWindow.setHandler('exit', this.popScene.bind(this));
        this._commandWindow.setHandler('cancel', this.popScene.bind(this));
        if (P.prizes) this._commandWindow.setHandler('prize', this.rrCommandPrize.bind(this));
        this.addWindow(this._commandWindow);
    };
    // The help follows the command under the cursor, or the actor under it.
    H.rrUpdateHelp = function() {
        if (this._commandWindow.active) {
            const symbol = this._commandWindow.currentSymbol();
            let text = helpText(symbol);
            if (symbol === 'heal_all') {
                const need = $gameParty.rrHospitalNeed();
                text = helpText(need ? 'heal_all_treat' : 'heal_all_healthy');
                if (need) text = format(text, $gameParty.rrHospitalFee());
            }
            this._helpWindow.setText(text);
        } else if (this._actorsWindow.active && this._actorsWindow.actor()) {
            const actor = this._actorsWindow.actor();
            this._helpWindow.setText(format(helpText(actor.rrHospitalNeed() ? 'actor_treat' : 'actor_healthy'), actor.name()));
        }
    };
    H.update = function() {
        Scene_MenuBase.prototype.update.call(this);
        this.rrUpdateHelp();
        if (P.prizes) this.rrUpdatePrizes();
    };
    H.rrCommandHealOne = function() { this._actorsWindow.activate(); };
    H.rrCommandHealAll = function() {
        $gameParty.rrHospitalRecover();
        this._commandWindow.refresh();
        this._commandWindow.activate();
        this._actorsWindow.refresh();
        this._goldWindow.refresh();
        if (P.prizes) this._prizeWindow.refresh();
    };
    H.rrActorOk = function() {
        this._actorsWindow.activate();
        this._actorsWindow.actor().rrHospitalRecover();
        this._actorsWindow.redrawCurrentItem();
        this._commandWindow.refresh();
        this._goldWindow.refresh();
        if (P.prizes) this._prizeWindow.refresh();
    };
    H.rrActorCancel = function() {
        this._actorsWindow.deactivate();
        this._commandWindow.activate();
    };

    //-------------------------------------------------------------------------
    // Hospital Prizes
    //-------------------------------------------------------------------------
    if (P.prizes) {
        const kindOf = (obj) => (DataManager.isItem(obj) ? 'item' : DataManager.isWeapon(obj) ? 'weapon' : DataManager.isArmor(obj) ? 'armor' : null);
        const reqs = new Map();
        /** An item's prize needs: [limit, hp, mp, { state: count }, states]; one line, one tag, first match. */
        const req = (obj) => {
            if (reqs.has(obj)) return reqs.get(obj);
            const r = { max: 0, hp: 0, mp: 0, state: {}, states: 0, prize: false };
            for (const line of String(obj.note || '').split(/[\r\n]+/)) {
                let m;
                if ((m = /<(?:PRIZE_MAX|prize max):[ ]*(\d+)>/i.exec(line))) r.max = Number(m[1]);
                else if ((m = /<(?:PRIZE_HP|prize hp):[ ]*(\d+)>/i.exec(line))) { r.prize = true; r.hp = Number(m[1]); }
                else if ((m = /<(?:PRIZE_MP|prize mp):[ ]*(\d+)>/i.exec(line))) { r.prize = true; r.mp = Number(m[1]); }
                else if ((m = /<(?:PRIZE_STATE|prize state)[ ]*(\d+):[ ]*(\d+)>/i.exec(line))) { r.prize = true; r.state[m[1]] = Number(m[2]); }
            }
            reqs.set(obj, r);
            return r;
        };
        const store = () => {
            if (!$gameParty._rrHospitalPrize) $gameParty._rrHospitalPrize = { hp: 0, mp: 0, state: {}, states: 0, received: { item: {}, weapon: {}, armor: {} } };
            return $gameParty._rrHospitalPrize;
        };
        const received = (obj) => (obj && kindOf(obj) ? Number(store().received[kindOf(obj)][obj.id] || 0) : 0);
        // A zero count divides to zero (Ruby's integer division); an item with no need gives nothing.
        const total = (obj) => {
            const r = req(obj), s = store();
            let n = null;
            const take = (m) => { n = n === null ? m : Math.min(m, n); };
            if (r.hp > 0) take(Math.floor(s.hp / r.hp));
            if (r.mp > 0) take(Math.floor(s.mp / r.mp));
            for (const [id, count] of Object.entries(r.state)) take(Math.floor(Number(s.state[id] || 0) / count));
            if (r.states > 0) take(Math.floor(s.states / r.states));
            return n === null ? 0 : n;
        };
        const limit = (obj) => (req(obj).max > 0 ? req(obj).max : $gameParty.maxItems(obj));
        const available = (obj) => Math.max(Math.min(total(obj) - received(obj), limit(obj) - received(obj)), 0);
        const prizes = () => [$dataItems, $dataWeapons, $dataArmors].flatMap(t => t.filter(o => o && req(o).prize));

        // What each healing took away is counted when it is paid for.
        const _recover = A.rrHospitalRecover;
        A.rrHospitalRecover = function() {
            if ($gameParty.gold() >= this.rrHospitalFee()) {
                const s = store(), states = this.rrHospitalStates();
                s.hp += Math.max(this.mhp - this._hp, 0);
                s.mp += Math.max(this.mmp - this._mp, 0);
                for (const state of states) s.state[state.id] = (s.state[state.id] || 0) + 1;
                s.states += states.length;
            }
            _recover.call(this);
        };
        G.rrClaimPrize = function(obj) {
            if (!obj) return SoundManager.playBuzzer();
            const max = this.maxItems(obj), have = this.numItems(obj);
            if (have >= max) return SoundManager.playBuzzer();
            const amount = Math.min(max - have, available(obj));
            this.gainItem(obj, amount);
            const table = store().received[kindOf(obj)];
            table[obj.id] = (table[obj.id] || 0) + amount;
        };

        const Window_RRHospitalPrizes = subclass(Window_Selectable, {
            initialize(rect) {
                this._data = [];
                Window_Selectable.prototype.initialize.call(this, rect);
                this.refresh();
                this.hide();
            },
            refresh() {
                this._data = prizes().filter(p => available(p) > 0);
                Window_Selectable.prototype.refresh.call(this);
            },
            maxCols() { return 2; },
            maxItems() { return this._data ? this._data.length : 0; },
            item() { return this._data[this.index()] || null; },
            drawItem(index) {
                const item = this._data[index];
                if (!item) return;
                const rect = this.itemRect(index);
                rect.width -= 4;
                this.rrAceDrawItemName(item, rect.x, rect.y);
                this.drawText('x' + String(available(item)).padStart(2, ' '), rect.x, rect.y, rect.width, 'right');
            },
            activate() {
                if (this.index() < 0) this.select(0);
                Window_Selectable.prototype.activate.call(this);
            }
        });

        H.rrCreatePrizeWindows = function() {
            const gh = Graphics.boxHeight, cmd = this._commandWindow;
            this._prizeHelpWindow = new Window_Help(new Rectangle(0, gh - fit(2), Graphics.boxWidth, fit(2)));
            this._prizeHelpWindow.hide();
            this.addWindow(this._prizeHelpWindow);
            this._prizeWindow = new Window_RRHospitalPrizes(new Rectangle(0, cmd.height, Graphics.boxWidth, gh - this._goldWindow.height - cmd.height));
            this._prizeWindow.setHandler('ok', this.rrPrizeOk.bind(this));
            this._prizeWindow.setHandler('cancel', this.rrPrizeCancel.bind(this));
            this.addWindow(this._prizeWindow);
        };
        // The prizes command shows its list in place of the party while the cursor is on it.
        H.rrUpdatePrizes = function() {
            if (this._commandWindow.active) {
                const onPrize = this._commandWindow.currentSymbol() === 'prize';
                this._actorsWindow.visible = !onPrize;
                this._prizeWindow.visible = onPrize;
            }
            if (this._prizeWindow.active) this._prizeHelpWindow.setItem(this._prizeWindow.item());
        };
        H.rrCommandPrize = function() {
            this._prizeWindow.height = Graphics.boxHeight - this._prizeHelpWindow.height - this._commandWindow.height;
            this._prizeWindow.refresh();
            this._prizeWindow.show(); this._prizeWindow.activate();
            this._prizeHelpWindow.show();
            this._helpWindow.hide();
            this._goldWindow.hide();
        };
        H.rrPrizeOk = function() {
            $gameParty.rrClaimPrize(this._prizeWindow.item());
            this._prizeWindow.activate();
            this._prizeWindow.refresh();
        };
        H.rrPrizeCancel = function() {
            this._prizeWindow.height = Graphics.boxHeight - this._goldWindow.height - this._commandWindow.height;
            this._prizeWindow.deactivate();
            this._commandWindow.activate();
            this._prizeHelpWindow.hide();
            this._helpWindow.show();
            this._goldWindow.show();
        };
        // For the tests.
        Scene_RRHospital.prizeAvailable = available;
    }

    //-------------------------------------------------------------------------
    // Script calls
    //-------------------------------------------------------------------------
    Game_Interpreter.prototype.rrHospital = function() { SceneManager.push(Scene_RRHospital); };
})();
