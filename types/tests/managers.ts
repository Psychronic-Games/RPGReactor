export {};

const picture: Bitmap = ImageManager.loadPicture("Test");
const music: RPGReactor.AudioFile = {name:"Theme", volume:80, pitch:100, pan:0};
AudioManager.playBgm(music);
AudioManager.replayBgm(AudioManager.saveBgm());
const audio: WebAudio = AudioManager.createBuffer("se/", "Bell");
audio.play(false);
const saving: Promise<number> = DataManager.saveGame(1);
const loading: Promise<number> = DataManager.loadGame(1);
const globalInfo: RPGReactor.Database<RPGReactor.SavefileInfo> | undefined = DataManager.loadGlobalInfo();
const save: RPGReactor.SaveContents = DataManager.makeSaveContents();
DataManager.extractSaveContents(save);
const item = $dataItems?.[1];
if (item && DataManager.isItem(item)) {
    const price: number = item.price;
    $gameParty?.gainItem(item, 1);
}
const nullItemResult: boolean | null | undefined = DataManager.isItem(null);
// @ts-expect-error Unloaded metadata cannot be assumed available.
const metadata: RPGReactor.Metadata = $dataActors![1]!.meta;
const noted = {note:"<Quest:begin>"};
DataManager.extractMetadata(noted);
PluginManager.registerCommand("Demo", "Heal", function(args) {
    const interpreter: Game_Interpreter = this;
    const eventId: number = this.eventId();
    const amount: string | undefined = args.amount;
    this.wait(10);
    $gameActors?.actor(1)?.gainHp(Number(amount ?? "10"));
    // @ts-expect-error Event interpreter has no actor HP property.
    this.hp;
});
const param: string | undefined = PluginManager.parameters("Demo").amount;
StorageManager.saveObject("settings", {musicVolume:80});
StorageManager.loadObject("settings").then(value => {
    // @ts-expect-error Stored JSON is unvalidated and returns unknown.
    const volume: number = value.musicVolume;
});
const json: Promise<unknown> = StorageManager.jsonToObject("{}");
const removed: void | Promise<number> = StorageManager.remove("settings");
BattleManager.setup(1, true, false);
BattleManager.setEventCallback(result => { const outcome: 0 | 1 | 2 = result; });
BattleManager.actor()?.gainHp(1);
const escaped: boolean = BattleManager.processEscape();
// Concrete scenes are Step 3; exercise the structural manager contract now.
class TestScene extends Stage implements RPGReactor.SceneLifecycle {
    create() {} start() {} stop() {} update() {} terminate() {}
    isReady() { return true; } isBusy() { return false; } isStarted() { return true; }
}
const starting: Promise<void> = SceneManager.run(TestScene);
SceneManager.push(TestScene);
SceneManager.goto(null);
const background: Bitmap | null = SceneManager.backgroundBitmap();

// @ts-expect-error Runtime StorageManager is a static manager, not the DOM constructor.
new StorageManager();
// @ts-expect-error SceneManager expects a scene constructor, not an instance.
SceneManager.push(new TestScene());
// @ts-expect-error BGM pitch is a number.
AudioManager.playBgm({name:"Theme", volume:80, pitch:"100"});
// @ts-expect-error Plugin parameter strings need parsing before numeric use.
const numericParam: number = PluginManager.parameters("Demo").amount;
// @ts-expect-error MZ plugin arguments are strings rather than numeric values.
PluginManager.callCommand({} as Game_Interpreter, "Demo", "Heal", {amount:10});
// @ts-expect-error saveGame resolves a number, not void.
const emptyResult: Promise<void> = DataManager.saveGame(1);
// @ts-expect-error First loadGlobalInfo call is not a Promise or an assured array.
const assumedInfo: RPGReactor.SavefileInfo[] = DataManager.loadGlobalInfo();
// @ts-expect-error Battle result is victory/escape/defeat (0/1/2).
BattleManager.endBattle(3);

// @ts-expect-error Browser saves resolve the key-refresh result (0), not void only.
const storageSaved: Promise<void> = StorageManager.saveObject("settings", {});

// @ts-expect-error Character classifiers return null when no prefix matches.
const bigCharacter: boolean = ImageManager.isBigCharacter("Actor1");
// @ts-expect-error Missing-image policy can turn this into a normal void return.
const alwaysThrows: never = ImageManager.throwLoadError(picture);
// @ts-expect-error Battle-log wait modes propagate as strings.
const booleanBusy: boolean = BattleManager.isBusy();

const mapBgm: RPGReactor.AudioFile = { name:"Theme", volume:80, pitch:100, sequence:1 };
AudioManager.playBgm(mapBgm);
AudioManager.playBgm({ ...mapBgm, sequence:"library:2" });
const bufferName: string = AudioManager.createBuffer("se/", "Bell").name;
const bufferFrame: number = AudioManager.createBuffer("se/", "Bell").frameCount;
// @ts-expect-error Raw WebAudio instances need not carry AudioManager metadata.
const rawName: string = audio.name;
