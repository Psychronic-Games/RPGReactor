import type { ApplicationOptions, Container } from "pixi.js";

const nativeWindow: Window = window;
const browserConfig: Partial<ApplicationOptions> = {resizeTo:window};
const event = new UIEvent("test", {view:window});
const legacy = new Window();
const windowType: RPGReactor.RuntimeWindow = legacy;
const engineWindow: InstanceType<typeof Window> = legacy;
const optionalName: string | undefined = legacy.name;
const tick: void = legacy.updateTransform();
legacy.origin.set(10, 20);
const rect = new Rectangle(0, 0, 320, 180);
const panel = new Window_Base(rect);
panel.contents.drawText("Hello", 0, 0, 320, 36);
panel.drawTextEx("\\C[2]Hello", 0, 0, 320);
const stage = new Stage();
stage.addChild(panel);
stage.addChildAt(legacy, 0);
stage.removeChild(panel);
const nativeContainer: Container = stage;
const scene = new Scene_MenuBase();
scene.createWindowLayer();
scene.addWindow(panel);
SceneManager.push(Scene_Map);
SceneManager.goto(Scene_Battle);
const states: Scene_Base[] = [new Scene_Boot(), new Scene_Title(), new Scene_Map(), new Scene_Battle()];

class TestCommands extends Window_Command {
    makeCommandList(): void { this.addCommand("Heal", "heal", true, {actorId:1}); }
}
const commands = new TestCommands(rect);
commands.setHandler("heal", () => $gameActors?.actor(1)?.gainHp(10));
const ext: unknown = commands.currentExt();
const command = commands.currentData();
if (command) { const symbol: string = command.symbol; }
const status = new Window_StatusBase(rect);
const actor = $gameActors?.actor(1);
if (actor) status.drawActorFace(actor, 0, 0);
const message = new Window_Message(rect);
message.startWait(15);

// @ts-expect-error Browser Window and game window are different instance contracts.
const wrongBrowser: Window = legacy;
// @ts-expect-error Runtime window has no browser location.
legacy.location.href;
// @ts-expect-error The compatibility layer removes Pixi's name accessor; a name is optional.
const requiredName: string = legacy.name;
// @ts-expect-error Pixi's resizeTo still requires the browser, not a game window.
const badResize: Partial<ApplicationOptions> = {resizeTo:panel};
// @ts-expect-error Browser APIs cannot receive a game window as an event view.
new UIEvent("test", {view:panel});
// @ts-expect-error MZ window updateTransform returns void, not fluent this.
legacy.updateTransform().move(0, 0, 1, 1);
// @ts-expect-error Window_Base takes a Rectangle, not the MV positional signature.
new Window_Base(0, 0, 320, 180);
// @ts-expect-error No current selection is guaranteed.
const selected: RPGReactor.WindowCommand = commands.currentData();
// @ts-expect-error Scene constructors are required, not scene instances.
SceneManager.push(scene);
// @ts-expect-error Missing game-window methods on the browser window.
scene.addWindow(window);
// @ts-expect-error RuntimeWindow is an instance type, not a fabricated namespace constructor.
new RPGReactor.RuntimeWindow();

if (SceneManager._scene instanceof Scene_Map) {
    SceneManager._scene.addWindow(new Window_Base(new Rectangle(0, 0, 120, 60)));
}
const fromGlobalWindow: RPGReactor.RuntimeWindow = new window.Window();
