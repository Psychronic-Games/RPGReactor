//=============================================================================
// main.js - RPG Reactor Game Runtime
//=============================================================================

const scriptUrls = [
    "js/libs/pixi.js",
    "js/libs/effekseer.min.js",
    "js/reactor_core.js",
    "js/reactor_managers.js",
    "js/reactor_objects.js",
    "js/reactor_sprites.js",
    "js/reactor_scenes.js",
    "js/reactor_windows.js",
    "js/reactor_plugins.js"
];
const effekseerWasmUrl = null; // Not using Effekseer for now

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
        this.loadMainScripts();
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
            document.body.appendChild(script);
        }
        this.numScripts = scriptUrls.length;
        window.addEventListener("load", this.onWindowLoad.bind(this));
        window.addEventListener("error", this.onWindowError.bind(this));
    }

    onScriptLoad() {
        if (++this.loadCount === this.numScripts) {
            // All scripts loaded, proceed to setup
            this.onAllScriptsLoaded();
        }
    }

    async onAllScriptsLoaded() {
        console.log('All scripts loaded, initializing game...');
        console.log('=== RPG Reactor Initialization ===');
        console.log('If window size is incorrect, try:');
        console.log('1. Close the game completely');
        console.log('2. Delete: ~/.config/rmmz-game/ (Linux) or AppData folder (Windows)');
        console.log('3. Restart the game');

        // Verify required classes are defined
        if (typeof SceneManager === 'undefined') {
            console.error('SceneManager is not defined! Check reactor_managers.js for errors.');
            return;
        }
        if (typeof Scene_Boot === 'undefined') {
            console.error('Scene_Boot is not defined! Check reactor_scenes.js for errors.');
            return;
        }

        await Graphics.setup();
        SceneManager.run(Scene_Boot);
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
        // Skip XHR check for NW.js - we use Node.js fs module instead
        if (typeof nw !== 'undefined') {
            if (this.error) {
                this.printError(this.error.name, this.error.message);
            } else {
                this.initEffekseerRuntime();
            }
            return;
        }

        // Browser mode checks
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
        // Skipping Effekseer for now
        this.eraseLoadingSpinner();
    }

    onEffekseerLoad() {
        // Not used
    }

    onEffekseerError() {
        // Not used
    }
}

const main = new Main();
main.run();

//-----------------------------------------------------------------------------
