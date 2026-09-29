export {};

// Constructors and inheritance, with explicit database/world initialization preconditions.
const actor = new Game_Actor(1);
const enemy = new Game_Enemy(1, 100, 200);
const battler: Game_Battler = actor;
const base: Game_BattlerBase = enemy;
const action = new Game_Action(actor);
action.setSkill(1);
action.apply(enemy);
const result: Game_ActionResult = enemy.result();
if (result.isHit()) actor.gainHp(-result.hpDamage);
actor.addState(2);
actor.removeState(2);
actor.addBuff(2, 3);
actor.learnSkill(5);
actor.changeLevel(4, false);
actor.changeEquip(0, null);
const trait: number = Game_BattlerBase.TRAIT_ELEMENT_RATE;
const effect: number = Game_Action.EFFECT_RECOVER_HP;
const party: Game_Unit = new Game_Party();
party.randomTarget()?.gainHp(1);
const troop = new Game_Troop();
troop.setup(1);
const name: string | undefined = troop.members()[0]?.name();
const character = new Game_Character();
character.forceMoveRoute({list:[{code:Game_Character.ROUTE_MOVE_DOWN}], repeat:false, skippable:true, wait:false});
character.moveTowardCharacter(new Game_Player());
const event = new Game_Event(1, 2);
const map = new Game_Map();
map.setup(1);
map.event(2)?.start();
const interpreter = new Game_Interpreter();
interpreter.setup([{code:0, indent:0, parameters:[]}], 2);
interpreter.character(-1)?.setOpacity(200);
const eventPage: RPGReactor.EventPage | undefined = event.page();
const screen = new Game_Screen();
screen.showPicture(1, "Portrait", 0, 10, 20, 100, 100, 255, 0);
screen.picture(1)?.rotate(1);
const forced = new Game_Action(actor, true).isValid();
const truthy: boolean = Boolean(forced);

// @ts-expect-error Actors require an ID at construction.
new Game_Actor();
// @ts-expect-error Actions require a battler subject.
new Game_Action();
// @ts-expect-error Enemy screen coordinates are numeric.
new Game_Enemy(1, "100", 200);
// @ts-expect-error Computed battler parameters are getter-only.
actor.hp = 100;
// @ts-expect-error Items are not battler targets.
action.apply($dataItems?.[1]);
// @ts-expect-error A forced action may return its item, not a boolean.
const valid: boolean = action.isValid();
// @ts-expect-error An event can have no active page.
const definitePage: RPGReactor.EventPage = event.page();
// @ts-expect-error Random targeting can fail when nobody is alive.
const definiteTarget: Game_Battler = party.randomTarget();
// @ts-expect-error Arbitrary game variables remain unknown.
const hp: number = new Game_Variables().value(1);
