export {};

const actor = $gameActors?.actor(1);
if (actor) {
    const typedActor: Game_Actor = actor;
    actor.gainHp(10);
    const hp: number = actor.hp;
    const className: string = actor.currentClass().name;
}
// @ts-expect-error Game global is null before creation.
$gameActors.actor(1);
if ($gameActors) {
    // @ts-expect-error Invalid IDs return null even after globals are created.
    const missing: Game_Actor = $gameActors.actor(999);
}
const actorData = $dataActors?.[1];
if (actorData) {
    const name: string = actorData.name;
    const tag: string | true | undefined = actorData.meta?.Quest;
}
if ($dataActors) {
    // @ts-expect-error A loaded database can still have null or missing slots.
    const required: RPGReactor.ActorData = $dataActors[1];
}
const gameVariable: unknown = $gameVariables?.value(1);
if (typeof gameVariable === "number") $gameVariables?.setValue(1, gameVariable + 1);
// @ts-expect-error Arbitrary game variables must be narrowed.
const numericVariable: number = $gameVariables?.value(1);
$gameSwitches?.setValue(1, true);
$gameSelfSwitches?.setValue([1, 2, "A"], true);
// @ts-expect-error The event ID in a self-switch key is numeric.
$gameSelfSwitches?.setValue([1, "2", "A"], true);
const entries: Array<unknown> = [
    $dataClasses, $dataSkills, $dataItems, $dataWeapons, $dataArmors, $dataEnemies,
    $dataTroops, $dataStates, $dataAnimations, $dataTilesets, $dataCommonEvents,
    $dataMapInfos, $dataMap, $dataSystem, $testEvent,
    $gameTemp, $gameSystem, $gameScreen, $gameTimer, $gameMessage, $gameSwitches,
    $gameVariables, $gameSelfSwitches, $gameActors, $gameParty, $gameTroop, $gameMap, $gamePlayer,
];
$gameTemp?.reserveCommonEvent(2);
$gameSystem?.playtimeText();
$gameScreen?.startTint([0, 0, 0, 0], 60);
$gameTimer?.start(600);
$gameMessage?.add("Hello");
$gameParty?.leader()?.gainHp(10);
$gameTroop?.members()[0]?.gainHp(-10);
$gameMap?.event(2)?.erase();
$gamePlayer?.reserveTransfer(2, 4, 6, 2, 0);
const map: RPGReactor.MapData = {width:100, height:100, scrollType:3, data:[], events:[]};
// @ts-expect-error Empty maps created by DataManager have no displayName.
const mapName: string = map.displayName;
