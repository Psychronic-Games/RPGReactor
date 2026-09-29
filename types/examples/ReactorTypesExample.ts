/// <reference path="../globals.d.ts" />
/*:
 * @target MZ
 * @plugindesc Type-check-only example for the Runtime declarations (not built/loaded).
 * @command OpenStatus
 * @text Open typed status menu
 * @command ToggleTorch
 * @text Toggle a map light
 * @arg target
 * @type string
 * @default #torches
 */

class ReactorTypesExampleCommands extends Window_Command {
    makeCommandList(): void {
        this.addCommand("Heal party leader", "heal");
        this.addCommand("Return", "cancel");
    }
}

class ReactorTypesExampleScene extends Scene_MenuBase {
    private commandsWindow?: ReactorTypesExampleCommands;
    private statusWindow?: Window_StatusBase;

    create(): void {
        // Scene_MenuBase.create already creates the window layer.
        super.create();
        this.commandsWindow = new ReactorTypesExampleCommands(new Rectangle(0, 0, 320, 180));
        this.commandsWindow.setHandler("heal", this.healLeader.bind(this));
        this.commandsWindow.setHandler("cancel", this.popScene.bind(this));
        this.addWindow(this.commandsWindow);
        this.statusWindow = new Window_StatusBase(new Rectangle(320, 0, 320, 180));
        this.addWindow(this.statusWindow);
        this.refreshLeader();
    }

    private refreshLeader(): void {
        const actor = $gameParty?.leader();
        if (!actor || !this.statusWindow) return;
        this.statusWindow.contents.clear();
        this.statusWindow.drawActorName(actor, 0, 0, 240);
        this.statusWindow.drawText(`HP ${actor.hp}/${actor.mhp}`, 0, 40, 240);
    }

    private healLeader(): void {
        $gameParty?.leader()?.gainHp(10);
        this.refreshLeader();
        this.commandsWindow?.activate();
    }
}

PluginManager.registerCommand("ReactorTypesExample", "OpenStatus", () => {
    SceneManager.push(ReactorTypesExampleScene);
});
PluginManager.registerCommand("ReactorTypesExample", "ToggleTorch", function(args) {
    Reactor3D.switchLight(args.target ?? "#torches", "toggle");
    this.wait(1);
});
