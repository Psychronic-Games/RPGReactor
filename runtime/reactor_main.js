//=============================================================================
// reactor_main.js — RPG Reactor runtime entry point
// RPG Reactor runtime version: 0.99.5
// RPG Reactor runtime revision: 20261107.15
// The same stamp, reachable from the F12 console: which engine is this
// window actually running? Type RPG_REACTOR_RUNTIME_REVISION to see.
globalThis.RPG_REACTOR_RUNTIME_REVISION = "20261107.15";
//=============================================================================

const scriptUrls = [
    "js/libs/pixi.js",
    "js/libs/pixi_compat.js",
    "js/libs/pako.min.js",
    "js/libs/lz-string.js",
    "js/libs/localforage.min.js",
    "js/libs/effekseer.min.js",
    "js/libs/vorbisdecoder.js",
    "js/reactor_json.js",
    "js/reactor_core.js",
    "js/reactor_core_display.js",
    "js/reactor_core_io.js",
    "js/reactor_features.js",
    // Small; declares the namespace and reads map mode. three.js itself is
    // ~2 MB and loads on demand from Reactor3D.ensureLoaded(), so a project
    // with no 3D maps never downloads it.
    "js/reactor_3d.js",
    "js/reactor_3d_lighting.js",
    "js/reactor_3d_models.js",
    "js/reactor_3d_effects.js",
    "js/reactor_3d_world.js",
    "js/reactor_3d_speech.js",
    "js/reactor_3d_foliage.js",
    "js/reactor_3d_doors.js",
    "js/reactor_3d_surround.js",
    "js/reactor_3d_vehicles.js",
    "js/reactor_3d_rider.js",
    "js/reactor_rig_motions.js",
    "js/reactor_battle_data.js",
    "js/reactor_battle_room.js",
    "js/reactor_managers.js",
    "js/reactor_hdr_overlay.js",
    "js/reactor_objects.js",
    "js/reactor_objects_actions.js",
    "js/reactor_objects_battlers.js",
    "js/reactor_objects_map.js",
    "js/reactor_objects_interpreter.js",
    "js/reactor_objects_followers.js",
    "js/reactor_objects_legacy.js",
    "js/reactor_scenes.js",
    "js/reactor_sprites.js",
    "js/reactor_picture_extensions.js",
    "js/reactor_screen_fx.js",
    "js/reactor_media_surfaces.js",
    "js/reactor_windows.js",
    "js/reactor_ui_victory.js",
    "js/reactor_ui_fight.js",
    "js/reactor_ui_action.js",
    "js/reactor_ui.js",
    "js/reactor_quests.js",
    "js/reactor_image_layers.js",
    "js/reactor_controls.js",
    "js/reactor_physics.js",
    "js/reactor_mv_compat.js",
    "js/reactor_battle_presentation.js",
    "js/reactor_battle_events.js",
    "js/reactor_fight_look.js",
    "js/reactor_fight.js",
    "js/reactor_fight_flow.js",
    "js/reactor_fight_tactical.js",
    "js/reactor_fight_stage.js",
    "js/reactor_fight_camera.js",
    "js/reactor_fight_action.js",
    "js/reactor_fight_menu.js",
    "js/reactor_fight_classic.js",
    "js/reactor_speaker_face.js",
    "js/reactor_character_creator.js",
    "js/reactor_online.js",
    "js/reactor_online_ui.js",
    "js/reactor_online_voice.js",
    "js/reactor_online_party.js",
    "js/reactor_online_battle.js",
    "js/reactor_online_classic.js",
    "js/reactor_online_action.js",
    // Vehicles: the last engine files, after every battle file, in this order (each wraps what the
    // files above left: a battle's start outermost, and the ride's camera laid over the battle
    // drivers'). None of them wraps the boot scene's start or the Show Text command, which the
    // speaker's face above keeps outermost.
    "js/reactor_vehicles.js",
    "js/reactor_vehicles_drive.js",
    "js/reactor_vehicles_feel.js",
    "js/reactor_vehicles_hints.js",
    "js/reactor_vehicles_mount.js",
    "js/reactor_plugins.js"
];
const effekseerWasmUrl = "js/libs/effekseer.wasm";

class Main {
    constructor() {
        this.xhrSucceeded = false;
        this.loadCount = 0;
        this.error = null;
    }

    run() {
        this.showLoadingSpinner();
        this.testXhr();
        this.hookNwjsClose();
        // Plugins check for WebGL as they load (UltraMode7 turns itself off without it), so the wait comes first.
        this.waitForWebGL(() => this.loadMainScripts());
    }

    /**
     * WebGL that is there in a moment: a graphics driver that refuses the GPU process for a second (it ran out of
     * GPU channels, a reset) left the game stopped at "Your browser does not support WebGL" while the next try
     * would have had it. Asked every half second for ten seconds, each test context given back at once; then one
     * reload of the page (a new page asks for a new GPU process); then on, to the usual message.
     */
    waitForWebGL(then) {
        const probe = () => {
            try {
                const canvas = document.createElement("canvas");
                const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
                if (!gl) return false;
                const lose = gl.getExtension("WEBGL_lose_context");
                if (lose) lose.loseContext();
                return true;
            } catch (error) {
                return false;
            }
        };
        if (probe()) { then(); return; }
        const key = "rrWebGLReloaded", started = Date.now();
        const retry = () => {
            if (probe()) {
                try { sessionStorage.removeItem(key); } catch (error) { /* none kept */ }
                console.warn("WebGL came back after " + (Date.now() - started) + " ms.");
                then();
                return;
            }
            if (Date.now() - started < 10000) { setTimeout(retry, 500); return; }
            let reloaded = false;
            try { reloaded = sessionStorage.getItem(key) === "1"; } catch (error) { reloaded = true; }
            if (!reloaded) {
                try { sessionStorage.setItem(key, "1"); } catch (error) { /* reload once regardless */ }
                location.reload();
                return;
            }
            try { sessionStorage.removeItem(key); } catch (error) { /* none kept */ }
            then();
        };
        console.warn("WebGL is not available yet; trying again for a few seconds.");
        setTimeout(retry, 500);
    }

    showLoadingSpinner() {
        const loadingSpinner = document.createElement("div");
        const loadingSpinnerImage = document.createElement("div");
        loadingSpinner.id = "loadingSpinner";
        loadingSpinnerImage.id = "loadingSpinnerImage";
        loadingSpinner.appendChild(loadingSpinnerImage);
        document.body.appendChild(loadingSpinner);
    }

    eraseLoadingSpinner() {
        const loadingSpinner = document.getElementById("loadingSpinner");
        if (loadingSpinner) {
            document.body.removeChild(loadingSpinner);
        }
    }

    testXhr() {
        const xhr = new XMLHttpRequest();
        xhr.open("GET", document.currentScript.src);
        xhr.onload = () => (this.xhrSucceeded = true);
        xhr.send();
    }

    hookNwjsClose() {
        // [Note] When closing the window, the NW.js process sometimes does
        //   not terminate properly. This code is a workaround for that.
        if (typeof nw === "object") {
            nw.Window.get().on("close", () => nw.App.quit());
        }
    }

    loadMainScripts() {
        for (const url of scriptUrls) {
            const script = document.createElement("script");
            script.type = "text/javascript";
            script.src = url;
            script.async = false;
            script.defer = true;
            script.onload = this.onScriptLoad.bind(this);
            script.onerror = this.onScriptError.bind(this);
            script._url = url;
            script._rrMain = true;
            document.body.appendChild(script);
        }
        this.numScripts = scriptUrls.length;
        // After a wait for WebGL the page's load event has already passed: the start follows the scripts instead.
        this.lateStart = document.readyState === "complete";
        if (!this.lateStart) window.addEventListener("load", this.onWindowLoad.bind(this));
        window.addEventListener("error", this.onWindowError.bind(this));
    }

    onScriptLoad() {
        if (++this.loadCount === this.numScripts) {
            PluginManager.setup($plugins);
            if (this.lateStart) this.afterPluginScripts(() => this.onWindowLoad());
        }
    }

    /** Once every plugin script just added has loaded or failed, as the load event would have waited. */
    afterPluginScripts(then) {
        const scripts = [...document.querySelectorAll("script")].filter(script => script._url && !script._rrMain && !script._rrSettled);
        let left = scripts.length;
        if (!left) { then(); return; }
        const settle = script => () => {
            if (script._rrSettled) return;
            script._rrSettled = true;
            if (--left === 0) then();
        };
        for (const script of scripts) {
            script.addEventListener("load", settle(script));
            script.addEventListener("error", settle(script));
        }
    }

    onScriptError(e) {
        this.printError("Failed to load", e.target._url);
    }

    printError(name, message) {
        this.eraseLoadingSpinner();
        if (!document.getElementById("errorPrinter")) {
            const errorPrinter = document.createElement("div");
            errorPrinter.id = "errorPrinter";
            errorPrinter.innerHTML = this.makeErrorHtml(name, message);
            document.body.appendChild(errorPrinter);
        }
    }

    makeErrorHtml(name, message) {
        const nameDiv = document.createElement("div");
        const messageDiv = document.createElement("div");
        nameDiv.id = "errorName";
        messageDiv.id = "errorMessage";
        nameDiv.innerHTML = name;
        messageDiv.innerHTML = message;
        return nameDiv.outerHTML + messageDiv.outerHTML;
    }

    onWindowLoad() {
        if (!this.xhrSucceeded) {
            const message = "Your browser does not allow to read local files.";
            this.printError("Error", message);
        } else if (this.isPathRandomized()) {
            const message = "Please move the Game.app to a different folder.";
            this.printError("Error", message);
        } else if (this.error) {
            this.printError(this.error.name, this.error.message);
        } else {
            this.initEffekseerRuntime();
        }
    }

    onWindowError(event) {
        if (!this.error) {
            this.error = event.error;
        }
    }

    isPathRandomized() {
        // [Note] We cannot save the game properly when Gatekeeper Path
        //   Randomization is in effect.
        return (
            typeof process === "object" &&
            process.mainModule.filename.startsWith("/private/var")
        );
    }

    initEffekseerRuntime() {
        const onLoad = this.onEffekseerLoad.bind(this);
        const onError = this.onEffekseerError.bind(this);
        effekseer.initRuntime(effekseerWasmUrl, onLoad, onError);
    }

    onEffekseerLoad() {
        this.eraseLoadingSpinner();
        // v8 only: auto-wrap all PIXI-extending classes so v8's real super
        // constructor runs on each instance (fixes dirty tracking, transforms,
        // animations). No-op on v5/v6/v7.
        if (typeof MZGlobalUpgrade === "function") {
            try { MZGlobalUpgrade(); } catch (e) {
                console.error("MZGlobalUpgrade failed:", e);
            }
        }
        // Project plugins are loaded by this point and may have replaced the
        // SceneManager methods ReactorUI routes. Wrap the final methods just
        // before boot, even when a plugin replaced Scene_Boot without aliasing.
        if (window.ReactorUI && window.ReactorUI.installSceneRouting) {
            window.ReactorUI.installSceneRouting();
        }
        window.ReactorBattlePresentation?.install();
        SceneManager.run(Scene_Boot);
    }

    onEffekseerError() {
        this.printError("Failed to load", effekseerWasmUrl);
    }
}

const main = new Main();
main.run();

//-----------------------------------------------------------------------------
