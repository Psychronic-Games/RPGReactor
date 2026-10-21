/*:
 * @target MZ
 * @plugindesc SkillTree v1.0 and Respec System (VX), for imported games
 * @author Deity (SkillTree); Strak (Respec System); ported for RPG Reactor
 * @url https://github.com/Psychronic-Games/RPG-Reactor
 *
 * @help RR_ThrallSkillTree.js
 *
 * The skill tree the menu's Skills command opens. On the left, the actor's
 * class tree: its skills' icons over the SkillTree picture (img/system),
 * framed green once learned, light when they can be learned, dark when not,
 * with the branch names under them; a red frame marks the chosen skill.
 * Below, the actor (walking graphic, face, level), the skill points and the
 * chosen skill's cost (red when there are too few points). On the right,
 * the skill's page: its picture (img/pictures, named in the skill's first
 * battle message), the column the font setting (a variable) picks.
 *
 * Arrows move between skills as Thrall laid out its three-branch trees; the
 * action button learns the chosen skill when one of the skills it needs is
 * known and the points cover its cost; page up and page down change actor.
 *
 * Skills take their place in the tree from their notes:
 *   <coords> x,y <coords_end>   <costs> n <costs_end>   <skills> a,b <skills_end>
 * (cost 1 when there is none; with <skills>, knowing any one of them is
 * enough). Actors start with no skills and the skill points their level
 * gives; each level up gives more.
 *
 * Respec (the game's event: $scene = Scene_Respec.new(1)): the first party
 * member's tree, the gold, and "Respec Skills?". A respec costs (gold +
 * a variable) / 20, gives back one point per level and forgets the class's
 * tree skills; page up and page down change actor.
 *
 * Scenes: Scene_ThrallSkills (the menu's Skills: the menu actor, or
 * SceneManager.prepareNextScene(index)), Scene_RRThrallSkillTree,
 * Scene_RRThrallRespec. Script calls: actor.rrSkillPoints(),
 * actor.rrSetSkillPoints(n).
 *
 * Kept as the original behaves: the <locked> note is never checked, and
 * moving up or down follows the game's index arithmetic, made for its
 * 32- and 33-skill trees.
 *
 * Installed by File › Import Project… when the imported game carried the
 * original script; its settings were read from the game's copy.
 *
 * @param slotColor1
 * @text Slot edge colour
 * @default 224,224,224
 *
 * @param slotColor2
 * @text Slot background colour
 * @default 16,16,16
 *
 * @param cursorColor
 * @text Cursor colour
 * @default 255,0,0
 *
 * @param learnedColor
 * @text Learned skill colour
 * @default 64,224,64
 *
 * @param skillPoints
 * @text Skill points term
 * @default Skillpoints
 *
 * @param skillCost
 * @text Cost term
 * @default Cost
 *
 * @param pointsLevelRange
 * @text Levels per skill point award
 * @type number
 * @default 1
 *
 * @param levelUpPoints
 * @text Points per award
 * @type number
 * @default 1
 *
 * @param branches
 * @text Branch names
 * @desc JSON { vxClassId: [left, middle, right] }; "other" for every other class.
 * @default {"1":["Witch","Mage","Monk"],"2":["Rogue","Stalker","Assassin"],"3":["Barbarian","Ogre","Warrior"],"other":["Soldier","Medic","Paladin"]}
 *
 * @param pictureVariable
 * @text Picture column variable
 * @type variable
 * @default 87
 *
 * @param respecGoldVariable
 * @text Respec gold variable
 * @type variable
 * @default 28
 *
 * @param respecSkills
 * @text Respec skill ranges
 * @desc JSON { vxClassId: [first, last] }; "other" for every other class.
 * @default {"1":[62,94],"2":[127,158],"3":[159,190],"other":[95,126]}
 *
 * @param respecSe
 * @text Respec sound
 * @default Saint6
 *
 * @param menuIndex
 * @text Menu command on return
 * @desc The menu opens on this command when the tree closes (Scene_Menu.new(n)).
 * @type number
 * @default 2
 */
(() => {
    'use strict';
    const params = PluginManager.parameters('RR_ThrallSkillTree');
    const json = (v, d) => { try { const x = JSON.parse(v); return x == null ? d : x; } catch (_) { return d; } };
    const color = (text, fallback) => {
        const c = String(text || fallback).split(/[,\s]+/).map(Number);
        return `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${(c[3] === undefined ? 255 : c[3]) / 255})`;
    };
    const SLOT_COLOR1 = color(params.slotColor1, '224,224,224');
    const SLOT_COLOR2 = color(params.slotColor2, '16,16,16');
    const CURSOR_COLOR = color(params.cursorColor, '255,0,0');
    const LEARNED_COLOR = color(params.learnedColor, '64,224,64');
    const LOCKED_EDGE = color('48,48,48');
    const LEARNED_BACK = color('16,16,16');
    const SKILL_POINTS = params.skillPoints ?? 'Skillpoints';
    const SKILL_COST = params.skillCost ?? 'Cost';
    const RANGE = Number(params.pointsLevelRange || 1);
    const LEVEL_UP_POINTS = Number(params.levelUpPoints ?? 1);
    const BRANCHES = json(params.branches, { 1: ['Witch', 'Mage', 'Monk'], 2: ['Rogue', 'Stalker', 'Assassin'], 3: ['Barbarian', 'Ogre', 'Warrior'], other: ['Soldier', 'Medic', 'Paladin'] });
    const PICTURE_VARIABLE = Number(params.pictureVariable || 87);
    const RESPEC_GOLD_VARIABLE = Number(params.respecGoldVariable || 28);
    const RESPEC_SKILLS = json(params.respecSkills, { 1: [62, 94], 2: [127, 158], 3: [159, 190], other: [95, 126] });
    const RESPEC_SE = params.respecSe ?? 'Saint6';
    const MENU_INDEX = Number(params.menuIndex ?? 2);
    const LOCK_VARIABLES = { 1: 121, 2: 122, 3: 123, other: 124 };
    const WLH = 24;
    const idiv = (a, b) => (b === 0 ? 0 : Math.floor(a / b));
    /** Ruby Array#[]: a negative index counts from the end. */
    const at = (array, i) => array[i < 0 ? array.length + i : i];
    const vxClassId = (actor) => {
        if (actor.rrVxClassId) return actor.rrVxClassId();
        const m = /<rrVxClass:\s*(\d+)>/.exec(actor.actor().note || '');
        return m ? Number(m[1]) : actor._classId;
    };
    const byClass = (table, actor) => table[vxClassId(actor)] || table.other;
    const learnings = (actor) => (actor.currentClass() && actor.currentClass().learnings) || [];
    /** Config.read_input_L / _R: the icon of the key the page buttons use. */
    const inputIcon = (i) => ($gameSystem.rrReadInput ? $gameSystem.rrReadInput(i) : 854);
    const tokens = (note) => String(note || '').split(/\s+/).filter(Boolean);
    /** The tokens from `open` (+skip) up to `close`, joined as the script joins them. */
    const between = (notes, open, close, skip) => {
        const from = notes.indexOf(open), to = notes.indexOf(close);
        let s = '';
        for (let i = from + skip; i < to; i++) s += notes[i];
        return s;
    };
    const toI = (s) => { const m = /^\s*([+-]?\d+)/.exec(String(s)); return m ? Number(m[1]) : 0; };

    //-------------------------------------------------------------------------
    // Game_Actor: skill points
    //-------------------------------------------------------------------------
    const A = Game_Actor.prototype;
    const _initialize = A.initialize;
    A.initialize = function(actorId) {
        _initialize.call(this, actorId);
        this._skills = [];
        this._rrSkillPoints = Math.trunc(idiv(this._level, RANGE));
        this._rrSkillPointRange = this._level - Math.trunc(this._rrSkillPoints * RANGE);
    };
    A.levelUp = function() {
        this._level += 1;
        this._rrSkillPointRange = (this._rrSkillPointRange || 0) + 1;
        if (this._rrSkillPointRange === RANGE) {
            this._rrSkillPointRange = 0;
            this._rrSkillPoints = this.rrSkillPoints() + LEVEL_UP_POINTS;
        }
    };
    A.rrSkillPoints = function() { return this._rrSkillPoints || 0; };
    A.rrSetSkillPoints = function(n) { this._rrSkillPoints = Number(n) || 0; };

    //-------------------------------------------------------------------------
    // SkillTree_Skill
    //-------------------------------------------------------------------------
    class SkillTreeSkill {
        constructor(skillId, actorId, level) {
            this._skillId = skillId;
            this._level = level;
            this._actorId = actorId;
        }
        get skill() { return $dataSkills[this._skillId]; }
        get actor() { return $gameActors.actor(this._actorId); }
        get id() { return this._skillId; }
        get level() { return this._level; }
        notes() { return tokens(this.skill ? this.skill.note : ''); }
        /** Any one of the skills it needs is known (or it needs none). */
        conditionsSuffused() {
            let state = true;
            for (const i of this.conditions()) {
                if (!this.actor.isLearnedSkill(toI(i))) state = false;
                else return true;
            }
            return state;
        }
        locked() {
            const notes = this.notes();
            let lock = 0;
            if (notes.includes('<locked>')) lock = toI(between(notes, '<locked>', '<locked_end>', 0).replace(/<locked>/g, '').replace(/<locked_end>/g, ''));
            return lock > $gameVariables.value(byClass(LOCK_VARIABLES, this.actor));
        }
        costs() {
            const notes = this.notes();
            if (!notes.includes('<costs>')) return 1;
            return toI(between(notes, '<costs>', '<costs_end>', 0).replace(/<costs>/g, '').replace(/<costs_end>/g, ''));
        }
        conditions() {
            const notes = this.notes();
            if (!notes.includes('<skills>')) return [];
            return tokens(between(notes, '<skills>', '<skills_end>', 1).replace(/,/g, ' '));
        }
        place() {
            const notes = this.notes();
            if (!notes.includes('<coords>')) return [10, 10];
            const c = tokens(between(notes, '<coords>', '<coords_end>', 1).replace(/,/g, ' '));
            return [toI(c[0]), toI(c[1])];
        }
    }
    const treeSkills = (actor) => learnings(actor).map(l => new SkillTreeSkill(l.skillId, actor.actorId(), l.level));
    window.RRThrallSkillTree = { SkillTreeSkill, treeSkills };

    //-------------------------------------------------------------------------
    // Windows: VX windows by (x, y, width, height)
    //-------------------------------------------------------------------------
    function vxWindow(name, base, init) {
        const Cls = function() { this.initialize(...arguments); };
        Cls.prototype = Object.create(base.prototype);
        Cls.prototype.constructor = Cls;
        Cls.prototype.initialize = init;
        window[name] = Cls;
        return Cls;
    }
    const color0 = (win) => win.changeTextColor(win.rrVxNormalColor());

    /** Window_SkillTree: the class tree. */
    const Window_SkillTree = vxWindow('Window_RRThrallSkillTree', Window_Base, function(actorId, skills) {
        Window_Base.prototype.initialize.call(this, new Rectangle(0, 0, 304, 376));
        this.refresh(actorId, skills);
    });
    Window_SkillTree.prototype.refresh = function(actorId, skills) {
        const actor = $gameActors.actor(actorId);
        this.contents.clear();
        const back = ImageManager.loadSystem('SkillTree');
        // The slots paint over the picture: wait for it, as RGSS's blt did.
        if (!back.isReady()) {
            const contents = this.contents;
            back.addLoadListener(() => { if (this.contents === contents) this.refresh(actorId, skills); });
            return;
        }
        this.contents.blt(back, 0, 0, 272, 312, 0, 0);
        const list = learnings(actor);
        for (let i = 0; i < list.length; i++) {
            const skill = $dataSkills[list[i].skillId];
            const tree = skills[i];
            if (!skill || !tree) continue;
            const [x, y] = tree.place();
            const learned = actor.isLearnedSkill(skill.id);
            if (learned) {
                this.contents.fillRect(x - 1, y - 1, 28, 28, LEARNED_COLOR);
                this.contents.fillRect(x + 1, y + 1, 24, 24, LEARNED_BACK);
            } else if (!tree.conditionsSuffused()) {
                this.contents.fillRect(x - 1, y - 1, 28, 28, LOCKED_EDGE);
                this.contents.fillRect(x + 1, y + 1, 24, 24, SLOT_COLOR2);
            } else {
                this.contents.fillRect(x - 1, y - 1, 28, 28, SLOT_COLOR1);
                this.contents.fillRect(x + 1, y + 1, 24, 24, SLOT_COLOR2);
            }
            this.rrVxDrawIcon(skill.iconIndex, x + 1, y + 1, learned);
        }
        color0(this);
        const names = byClass(BRANCHES, actor);
        for (let b = 0; b < 3; b++) this.rrVxDrawText(96 * b, 274, 80, WLH, names[b] || '', 1);
    };

    /** Window_SkillTreeInformationSmall: actor, skill points, cost. */
    const Window_SkillTreeInfoSmall = vxWindow('Window_RRThrallSkillTreeInfoSmall', Window_Base, function(skillId, skills, actorId) {
        Window_Base.prototype.initialize.call(this, new Rectangle(0, 376, 304, 104));
        this.refresh(skillId, skills, actorId);
    });
    Window_SkillTreeInfoSmall.prototype.refresh = function(skillId, skills, actorId) {
        const actor = $gameActors.actor(actorId);
        this.contents.clear();
        color0(this);
        this.rrVxDrawIcon(inputIcon(3), 0, 0);
        this.rrVxDrawIcon(inputIcon(4), 108, 0);
        this.rrVxDrawText(0, 0, 132, WLH, actor.name(), 1);
        this.rrVxDrawActorGraphic(actor, 16, 72);
        this.rrVxDrawActorFace(actor, 36, 52);
        this.rrVxDrawActorLevel(actor, 36, 24);
        const tree = skills.find(s => s.id === skillId);
        const cost = tree ? tree.costs() : 0;
        color0(this);
        this.rrVxDrawIcon(173, 140, 24);
        this.rrVxDrawText(168, 24, 100, WLH, SKILL_POINTS + ': ' + actor.rrSkillPoints(), 0);
        if (actor.rrSkillPoints() < cost) this.changeTextColor(this.rrVxTextColor(14));
        this.rrVxDrawIcon(174, 140, 48);
        this.rrVxDrawText(168, 48, 128, WLH, SKILL_COST + ': ' + cost, 0);
    };

    /** Window_SkillTreeInfoLarge: the skill's page, a picture. */
    const Window_SkillTreeInfoLarge = vxWindow('Window_RRThrallSkillTreeInfoLarge', Window_Base, function(skillId) {
        Window_Base.prototype.initialize.call(this, new Rectangle(304, 0, 304, 480));
        this.refresh(skillId);
    });
    Window_SkillTreeInfoLarge.prototype.refresh = function(skillId) {
        const skill = skillId != null ? $dataSkills[skillId] : null;
        if (!skill) return;
        this.contents.clear();
        const picture = ImageManager.loadPicture(skill.message1 || '');
        const token = (this._rrPictureToken = {});
        const draw = () => {
            if (this._rrPictureToken !== token) return;
            const x = 272 * $gameVariables.value(PICTURE_VARIABLE);
            if (this.contents) this.contents.destroy();
            this.contents = new Bitmap(this.innerWidth, Math.max(picture.height, 1));
            this.contents.blt(picture, x, 0, 272, picture.height, 0, 0);
        };
        if (picture.isReady()) draw(); else picture.addLoadListener(draw);
    };

    /** Window_Skill_Cursor: a red frame, the window itself unseen. */
    const Window_SkillCursor = vxWindow('Window_RRThrallSkillCursor', Window_Base, function(x, y) {
        Window_Base.prototype.initialize.call(this, new Rectangle(0, 0, 304, 376));
        this.opacity = 0;
        this.refresh(x, y);
    });
    Window_SkillCursor.prototype.refresh = function(x, y) {
        x -= 16;
        y -= 16;
        this.contents.clear();
        this.contents.fillRect(x, y, 28, 28, CURSOR_COLOR);
        this.contents.clearRect(x + 2, y + 2, 24, 24);
    };

    /** Window_Gold, VX's: 160 wide. */
    const Window_VxGold = vxWindow('Window_RRThrallVxGold', Window_Base, function(x, y) {
        Window_Base.prototype.initialize.call(this, new Rectangle(x, y, 160, WLH + 32));
        this.refresh();
    });
    Window_VxGold.prototype.refresh = function() {
        this.contents.clear();
        this.rrVxDrawCurrencyValue($gameParty.gold(), 4, 0, 120);
    };

    //-------------------------------------------------------------------------
    // Scene_SkillTree
    //-------------------------------------------------------------------------
    const Sound = {
        cursor: () => SoundManager.playCursor(), cancel: () => SoundManager.playCancel(), buzzer: () => SoundManager.playBuzzer(),
        decision: () => SoundManager.playOk(), useSkill: () => SoundManager.playUseSkill()
    };
    const trig = (name) => Input.isTriggered(name);

    function Scene_RRThrallSkillTree() { this.initialize(...arguments); }
    Scene_RRThrallSkillTree.prototype = Object.create(Scene_MenuBase.prototype);
    Scene_RRThrallSkillTree.prototype.constructor = Scene_RRThrallSkillTree;
    Scene_RRThrallSkillTree.prototype.initialize = function() {
        Scene_MenuBase.prototype.initialize.call(this);
        this._actorIndex = null;
    };
    Scene_RRThrallSkillTree.prototype.prepare = function(actorIndex) { this._actorIndex = Number(actorIndex) || 0; };
    Scene_RRThrallSkillTree.prototype.createButtons = function() {};
    Scene_RRThrallSkillTree.prototype.create = function() {
        Scene_MenuBase.prototype.create.call(this);
        if (this._actorIndex === null) {
            const i = $gameParty.members().indexOf($gameParty.menuActor());
            this._actorIndex = i < 0 ? 0 : i;
        }
        this._rrActor = $gameParty.members()[this._actorIndex];
        this._index = 0;
        this._skills = treeSkills(this._rrActor);
        const first = this._skills[0] ? this._skills[0].id : null;
        this._skilltree = new Window_SkillTree(this._rrActor.actorId(), this._skills);
        this._infoSmall = new Window_SkillTreeInfoSmall(first, this._skills, this._rrActor.actorId());
        this._infoLarge = new Window_SkillTreeInfoLarge(first);
        this._cursor = new Window_SkillCursor(this.startCursorX(), 16);
        for (const w of [this._skilltree, this._infoSmall, this._infoLarge, this._cursor]) this.addWindow(w);
    };
    Scene_RRThrallSkillTree.prototype.startCursorX = function() { return vxClassId(this._rrActor) === 1 ? 102 : 120; };
    Scene_RRThrallSkillTree.prototype.current = function() { return at(this._skills, this._index); };
    Scene_RRThrallSkillTree.prototype.refreshAll = function() {
        this._rrActor = $gameParty.members()[this._actorIndex];
        this._index = 0;
        this._skills = treeSkills(this._rrActor);
        const first = this._skills[0] ? this._skills[0].id : null;
        this._skilltree.refresh(this._rrActor.actorId(), this._skills);
        this._infoSmall.refresh(first, this._skills, this._rrActor.actorId());
        this._infoLarge.refresh(first);
        this._cursor.refresh(this.startCursorX(), 16);
    };
    Scene_RRThrallSkillTree.prototype.refreshCursor = function(place) {
        if (place) this._cursor.refresh(place[0] + 15, place[1] + 15);
        else this._cursor.refresh(25, 81);
    };
    Scene_RRThrallSkillTree.prototype.moved = function() {
        Sound.cursor();
        const skill = this.current();
        if (!skill) return;   // Ruby raises here (nil.id); no tree the game ships reaches it
        this._infoLarge.refresh(skill.id);
        this._infoSmall.refresh(skill.id, this._skills, this._rrActor.actorId());
        this.refreshCursor(skill.place());
    };
    Scene_RRThrallSkillTree.prototype.cursorUp = function() {
        const ind = vxClassId(this._rrActor) === 1 ? 2 : 1;
        const minus3 = [15 + ind, 16 + ind, 30 + ind];
        const minus4 = [4 + ind, 14 + ind, 17 + ind, 18 + ind, 29 + ind];
        const minus5 = [5 + ind, 13 + ind, 19 + ind, 20 + ind, 28 + ind];
        let i = this._index;
        if ((i < 3 && ind === 2) || (i < 2 && ind === 1)) i = this._skills.length - ((idiv(ind, 2) + 2) - i);
        else if (i === 1 + ind) i -= ind === 2 ? 3 : 2;
        else if (i === 2 + ind) i -= ind === 2 ? 4 : 3;
        else if (i === 3 + ind) i -= 4;
        else if (minus3.includes(i)) i -= 3;
        else if (minus4.includes(i)) i -= 4;
        else if (minus5.includes(i)) i -= 5;
        else i -= 6;
        this._index = i;
    };
    Scene_RRThrallSkillTree.prototype.cursorDown = function() {
        const ind = vxClassId(this._rrActor) === 1 ? 2 : 1;
        const plus3 = [0, 12 + ind, 13 + ind, 27 + ind];
        const plus4 = [10 + ind, 11 + ind, 14 + ind, 25 + ind, 26 + ind];
        const plus5 = [8 + ind, 9 + ind, 15 + ind, 23 + ind, 24 + ind];
        let i = this._index;
        if ((i < 3 && ind === 2) || (i < 2 && ind === 1)) i += 4;
        else if (plus3.includes(i)) i += 3;
        else if (plus4.includes(i)) i += 4;
        else if (plus5.includes(i)) i += 5;
        else if (i > 27 + ind) i = ind === 2 ? i - 30 : 0;
        else i += 6;
        this._index = i;
    };
    Scene_RRThrallSkillTree.prototype.learnCurrent = function() {
        const tree = this.current();
        const actor = this._rrActor;
        if (tree && tree.conditionsSuffused() && !actor.isLearnedSkill(tree.id) && tree.costs() <= actor.rrSkillPoints()) {
            actor.learnSkill(tree.id);
            actor.rrSetSkillPoints(actor.rrSkillPoints() - tree.costs());
            this._skilltree.refresh(actor.actorId(), this._skills);
            this._infoSmall.refresh(tree.id, this._skills, actor.actorId());
            Sound.useSkill();
        } else Sound.buzzer();
    };
    Scene_RRThrallSkillTree.prototype.changeActor = function(step) {
        Sound.cursor();
        const n = $gameParty.members().length;
        this._actorIndex += step;
        if (this._actorIndex > n - 1) this._actorIndex = 0;
        if (this._actorIndex < 0) this._actorIndex = n - 1;
        this.refreshAll();
    };
    Scene_RRThrallSkillTree.prototype.update = function() {
        Scene_MenuBase.prototype.update.call(this);
        if (!this._rrActor || !this._skills.length) { if (trig('cancel')) { Sound.cancel(); this.returnScene(); } return; }
        const n = this._skills.length;
        if (trig('ok')) this.learnCurrent();
        else if (trig('left')) { this._index -= 1; if (this._index < 0) this._index = n - 1; this.moved(); }
        else if (trig('right')) { this._index += 1; if (this._index > n - 1) this._index = 0; this.moved(); }
        else if (trig('up')) { this.cursorUp(); this.moved(); }
        else if (trig('down')) { this.cursorDown(); this.moved(); }
        else if (trig('pagedown')) this.changeActor(1);
        else if (trig('pageup')) this.changeActor(-1);
        else if (trig('cancel')) { Sound.cancel(); this.returnScene(); }
    };
    /** return_scene: $scene = Scene_Menu.new(2), the menu on its third command (Thrall's Skills). */
    Scene_RRThrallSkillTree.prototype.returnScene = function() {
        const Menu = typeof window.Scene_ThrallMenu === 'function' ? window.Scene_ThrallMenu : Scene_Menu;
        SceneManager.goto(Menu);
        const next = SceneManager._nextScene;
        if (next && typeof next.prepare === 'function') next.prepare(MENU_INDEX);
    };
    window.Scene_RRThrallSkillTree = Scene_RRThrallSkillTree;
    window.Scene_ThrallSkills = Scene_RRThrallSkillTree;

    /** $scene = Scene_Map.new: back to the map under this scene, or a new one. */
    const toMap = () => {
        const stack = SceneManager._stack || [];
        if (stack.length && stack[stack.length - 1] === Scene_Map) SceneManager.pop();
        else SceneManager.goto(Scene_Map);
    };
    //-------------------------------------------------------------------------
    // Respec System
    //-------------------------------------------------------------------------
    /** Window_Respec: a question on the first line, the choices under it. */
    const Window_Respec = vxWindow('Window_RRThrallRespec', Window_Selectable, function() {
        Window_Selectable.prototype.initialize.call(this, new Rectangle(304, 156, 304, 104));
        this._data = [];
        this._text = '';
        this.refreshChoice(0);
        this.activate();
    });
    Window_Respec.prototype.maxItems = function() { return this._data.length; };
    Window_Respec.prototype.maxCols = function() { return 1; };
    Window_Respec.prototype.itemHeight = function() { return WLH; };
    Window_Respec.prototype.itemRect = function(index) { return new Rectangle(0, (index + 1) * WLH - this.scrollBaseY(), this.innerWidth, WLH); };
    Window_Respec.prototype.refreshChoice = function(choice, name = '') {
        if (choice === 0) { this._text = 'Respec Skills?'; this._data = ['Yes', 'No']; }
        else if (choice === 1) { this._text = 'A Respec will cost ' + respecCost() + 'G.'; this._data = ['Confirm', 'Cancel']; }
        else if (choice === 2) { this._text = 'You do not have enough gold.'; this._data = ['Cancel']; }
        else { this._text = name + ' does not need a Respec.'; this._data = ['Cancel']; }
        this.paint();
        this.select(0);
    };
    Window_Respec.prototype.paint = function() {
        if (!this.contents) return;
        this.contents.clear();
        color0(this);
        this.rrVxDrawText(0, 0, 272, WLH, this._text, 1);
        for (let i = 0; i < this._data.length; i++) this.drawItem(i);
    };
    Window_Respec.prototype.drawItem = function(index) {
        const r = this.itemRect(index);
        color0(this);
        this.rrVxDrawText(r.x + 4, r.y, r.width - 8, WLH, this._data[index], 1);
    };
    Window_Respec.prototype.refresh = function() { this.paint(); };
    const respecCost = () => idiv($gameParty.gold() + $gameVariables.value(RESPEC_GOLD_VARIABLE), 20);

    function Scene_RRThrallRespec() { this.initialize(...arguments); }
    Scene_RRThrallRespec.prototype = Object.create(Scene_MenuBase.prototype);
    Scene_RRThrallRespec.prototype.constructor = Scene_RRThrallRespec;
    Scene_RRThrallRespec.prototype.prepare = function() {};
    Scene_RRThrallRespec.prototype.createButtons = function() {};
    Scene_RRThrallRespec.prototype.create = function() {
        Scene_MenuBase.prototype.create.call(this);
        this._actorIndex = 0;
        this._decision = 0;
        this._rrActor = $gameParty.members()[0];
        this._skills = treeSkills(this._rrActor);
        this._skilltree = new Window_SkillTree(this._rrActor.actorId(), this._skills);
        this._infoSmall = new Window_SkillTreeInfoSmall(this._skills[0] ? this._skills[0].id : null, this._skills, this._rrActor.actorId());
        this._goldWindow = new Window_VxGold(448, 0);
        this._choiceWindow = new Window_Respec();
        for (const w of [this._skilltree, this._infoSmall, this._goldWindow, this._choiceWindow]) this.addWindow(w);
    };
    Scene_RRThrallRespec.prototype.refreshAll = function() {
        this._rrActor = $gameParty.members()[this._actorIndex];
        this._skills = treeSkills(this._rrActor);
        this._skilltree.refresh(this._rrActor.actorId(), this._skills);
        this._infoSmall.refresh(this._skills[0] ? this._skills[0].id : null, this._skills, this._rrActor.actorId());
    };
    Scene_RRThrallRespec.prototype.respec = function() {
        const actor = this._rrActor;
        actor.rrSetSkillPoints(actor.level);
        const [from, to] = byClass(RESPEC_SKILLS, actor);
        for (let i = from; i <= to; i++) actor.forgetSkill(i);
    };
    Scene_RRThrallRespec.prototype.backToQuestion = function() { this._decision = 0; this._choiceWindow.refreshChoice(0); };
    Scene_RRThrallRespec.prototype.update = function() {
        Scene_MenuBase.prototype.update.call(this);
        const choice = this._choiceWindow;
        if (trig('ok')) {
            if (choice.index() === 0) {
                if (this._decision === 0) {
                    if (this._rrActor.rrSkillPoints() === this._rrActor.level) { this._decision = 3; choice.refreshChoice(3, this._rrActor.name()); }
                    else { this._decision = 1; choice.refreshChoice(1); }
                    Sound.decision();
                } else if (this._decision === 1) {
                    const cost = respecCost();
                    if ($gameParty.gold() < cost) { this._decision = 2; choice.refreshChoice(2); Sound.decision(); }
                    else {
                        $gameParty.gainGold(-cost);
                        this._decision = 0;
                        this.respec();
                        this.refreshAll();
                        this._goldWindow.refresh();
                        choice.refreshChoice(0);
                        if (RESPEC_SE) AudioManager.playSe({ name: RESPEC_SE, volume: 80, pitch: 100, pan: 0 });
                    }
                } else { this.backToQuestion(); Sound.decision(); }
            } else {
                Sound.cancel();
                if (this._decision === 0) toMap(); else this.backToQuestion();
            }
        } else if (trig('cancel')) {
            Sound.cancel();
            if (this._decision === 0) toMap(); else this.backToQuestion();
        } else if (trig('pagedown') && this._decision === 0) {
            Sound.cursor();
            this._actorIndex += 1;
            if (this._actorIndex > $gameParty.members().length - 1) this._actorIndex = 0;
            this.refreshAll();
        } else if (trig('pageup') && this._decision === 0) {
            Sound.cursor();
            this._actorIndex -= 1;
            if (this._actorIndex < 0) this._actorIndex = $gameParty.members().length - 1;
            this.refreshAll();
        }
    };
    window.Scene_RRThrallRespec = Scene_RRThrallRespec;
})();
