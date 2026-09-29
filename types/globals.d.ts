/// <reference path="./reactor-data.d.ts" />
/// <reference path="./reactor-core.d.ts" />
/// <reference path="./reactor-managers.d.ts" />
/// <reference path="./reactor-objects.d.ts" />
/// <reference path="./reactor-scenes.d.ts" />
/// <reference path="./reactor-sprites.d.ts" />
/// <reference path="./reactor-windows.d.ts" />
/// <reference path="./reactor-3d.d.ts" />

// reactor_managers.js initializes these globals to null. Narrow at use sites.
// Database slot 0 and missing records remain nullable even after loading.
declare var $dataActors: RPGReactor.Database<RPGReactor.ActorData> | null;
declare var $dataClasses: RPGReactor.Database<RPGReactor.ClassData> | null;
declare var $dataSkills: RPGReactor.Database<RPGReactor.SkillData> | null;
declare var $dataItems: RPGReactor.Database<RPGReactor.ItemData> | null;
declare var $dataWeapons: RPGReactor.Database<RPGReactor.WeaponData> | null;
declare var $dataArmors: RPGReactor.Database<RPGReactor.ArmorData> | null;
declare var $dataEnemies: RPGReactor.Database<RPGReactor.EnemyData> | null;
declare var $dataTroops: RPGReactor.Database<RPGReactor.TroopData> | null;
declare var $dataStates: RPGReactor.Database<RPGReactor.StateData> | null;
declare var $dataAnimations: RPGReactor.Database<RPGReactor.AnimationData> | null;
declare var $dataTilesets: RPGReactor.Database<RPGReactor.TilesetData> | null;
declare var $dataCommonEvents: RPGReactor.Database<RPGReactor.CommonEventData> | null;
declare var $dataMapInfos: RPGReactor.Database<RPGReactor.MapInfoData> | null;
declare var $dataSystem: RPGReactor.SystemData | null;
declare var $dataMap: RPGReactor.MapData | null;
declare var $testEvent: RPGReactor.EventCommand[] | null;

declare var $gameTemp: Game_Temp | null;
declare var $gameSystem: Game_System | null;
declare var $gameScreen: Game_Screen | null;
declare var $gameTimer: Game_Timer | null;
declare var $gameMessage: Game_Message | null;
declare var $gameSwitches: Game_Switches | null;
declare var $gameVariables: Game_Variables | null;
declare var $gameSelfSwitches: Game_SelfSwitches | null;
declare var $gameActors: Game_Actors | null;
declare var $gameParty: Game_Party | null;
declare var $gameTroop: Game_Troop | null;
declare var $gameMap: Game_Map | null;
declare var $gamePlayer: Game_Player | null;
