// RPG Reactor - Playtest Manager
// Handles launching and managing game playtesting

class PlaytestManager {
    // Battle test = playtest + battle test. See battleTest() for why both.
    static BATTLE_TEST_MODE = 'test&btest';

    /**
     * On Windows a weak GPU (integrated graphics through Direct3D 11) runs the game's WebGL through D3D11-on-12:
     * Chromium's GPU process translates every call on the same few cores, and on the Iris Xe laptop (i5-1145G7) the
     * game's frames waited on it. With D3D11-on-12 its main thread did half the work per frame and ran 35-50% faster
     * (North Haven 29-33 -> 45-50 fps, the Reactor Room 39-40 -> 50-60, the same picture; 2026-11-09). A project
     * opts out with "reactorAngle": "default" in its package.json; any other GPU, or another system, is left alone.
     */
    static WEAK_ANGLE_ARGS = Object.freeze(['--use-angle=d3d11on12']);
    static WEAK_GPU_PATTERN = /\b(Intel|UHD|Iris|HD Graphics|Radeon\(TM\) Graphics|Radeon Graphics|Vega \d+ Graphics)\b/i;
    static weakAngleArgs(platform, rendererDescription, packageData) {
        if (platform !== 'win32' || !rendererDescription) return [];
        if (packageData && packageData.reactorAngle === 'default') return [];
        const description = String(rendererDescription);
        // Plain Direct3D 11 only: already another backend (or a project's own --use-angle) is not touched.
        if (!/Direct3D11 /.test(description) || /Direct3D11on12/.test(description)) return [];
        if (packageData && typeof packageData['chromium-args'] === 'string' && /--use-angle=/.test(packageData['chromium-args'])) return [];
        return PlaytestManager.WEAK_GPU_PATTERN.test(description) ? PlaytestManager.WEAK_ANGLE_ARGS.slice() : [];
    }

    /**
     * The backend a playtest starts on: this machine's own plan where the game has learned one by playing
     * (runtime/reactor_main.js, ReactorBackend: %LOCALAPPDATA%\RPGReactor\graphics-backend.json, per graphics
     * card), else the guess above for a weak GPU. The game is told which it was started on and that the editor
     * started it (`--rr-angle`, `--rr-angle-host=editor`): it records how that backend does and writes the plan for
     * the next playtest, and never starts itself again, since the editor watches this process.
     */
    static BACKENDS = Object.freeze(['d3d11', 'd3d11on12', 'gl']);
    /** As ReactorBackend.gpuKey: the card a renderer string names, whatever backend it is reached through. */
    static gpuKey(rendererDescription) {
        const s = String(rendererDescription || '').trim().replace(/^ANGLE \(/i, '').replace(/\)$/, '');
        const comma = s.indexOf(',');
        const vendor = comma >= 0 ? s.slice(0, comma).trim() : '';
        let device = comma >= 0 ? s.slice(comma + 1).trim() : s;
        device = device.replace(/\s*\(0x[0-9a-f]+\).*$/i, '').replace(/\s+Direct3D.*$/i, '').replace(/,\s*(OpenGL|Vulkan|Metal|D3D).*$/i, '').trim();
        return (vendor + '|' + device).toLowerCase();
    }
    /** The plan the game left for this card, or null (none yet, another version's file, nothing readable). */
    static backendPlan(rendererDescription, fs, path, env = (typeof process !== 'undefined' ? process.env : {})) {
        try {
            const base = env.LOCALAPPDATA || env.APPDATA;
            if (!base || !rendererDescription) return null;
            const store = JSON.parse(fs.readFileSync(path.join(base, 'RPGReactor', 'graphics-backend.json'), 'utf8'));
            const entry = store && store.version === 1 && store.gpus ? store.gpus[PlaytestManager.gpuKey(rendererDescription)] : null;
            if (!entry || !PlaytestManager.BACKENDS.includes(entry.plan)) return null;
            if (Array.isArray(entry.failed) && entry.failed.includes(entry.plan)) return null;
            return entry.plan;
        } catch (error) { return null; }
    }
    /**
     * What the editor's launcher should be told for its next start: a backend name ("gl", "d3d11on12"), "" for the
     * browser's own, or null to leave what it was told alone. The browser takes its backend from its command line
     * before any of the editor runs, so the editor cannot change its own: it leaves a note in the user's folder
     * (`EDITOR_ANGLE_FILE`) and the launcher (RPGReactor.bat) starts the next session with it, on the right backend
     * from the first frame. The editor draws the same maps through the same engine as the game, and where the game
     * found by playing that this card runs it better on another backend than the browser's Direct3D 11
     * (backendPlan), the editor's 3D view does too: North Haven's whole map on the Iris Xe laptop turned at 36-38
     * frames a second on OpenGL and 3-21 on Direct3D 11, with stops of seconds (2026-11-11). Windows only; never
     * under automation; a backend someone named on the command line or in the package is theirs; localStorage
     * `rr.editorBackend` = "default" keeps the browser's own. `args`: nw.App.fullArgv.
     */
    static EDITOR_ANGLE_FILE = 'editor-angle.txt';
    static editorBackend(platform, rendererDescription, args, plan, packageData, automated, choice) {
        if (platform !== 'win32' || automated || !rendererDescription) return null;
        const list = (args || []).map(String);
        if (list.some(a => /^--use-angle=/.test(a)) && PlaytestManager.editorHop(list) === null) return null;
        if (packageData && typeof packageData['chromium-args'] === 'string' && /--use-angle=/.test(packageData['chromium-args'])) return null;
        if (choice === 'default') return '';
        return plan === 'gl' || plan === 'd3d11on12' ? plan : '';
    }
    /** The backend the launcher started this editor on from that note (its marker among the arguments), or null. */
    static editorHop(args) {
        for (const a of (args || []).map(String)) { const m = /^--rr-editor-angle=(.+)$/.exec(a); if (m) return m[1]; }
        return null;
    }
    static backendArgs(platform, rendererDescription, packageData, plan, ownHop = false) {
        if (platform !== 'win32' || !rendererDescription) return [];
        if (packageData && packageData.reactorAngle === 'default') return [];
        if (packageData && typeof packageData['chromium-args'] === 'string' && /--use-angle=/.test(packageData['chromium-args'])) return [];
        const description = String(rendererDescription);
        // The editor itself on another backend than plain Direct3D 11: someone set this machine up by hand. Not when
        // the editor put itself there from the game's own record (editorBackend): the playtest follows the same plan.
        if (!ownHop && (!/Direct3D11 /.test(description) || /Direct3D11on12/.test(description))) return [];
        const host = '--rr-angle-host=editor';
        if (PlaytestManager.BACKENDS.includes(plan)) return plan === 'd3d11' ? ['--rr-angle=d3d11', host] : [`--use-angle=${plan}`, `--rr-angle=${plan}`, host];
        const guess = PlaytestManager.weakAngleArgs(platform, rendererDescription, packageData);
        return guess.length ? [...guess, '--rr-angle=d3d11on12', host] : ['--rr-angle=d3d11', host];
    }

    /** The editor's own WebGL renderer, as the game will see it on this machine ("" when it will not say). */
    static rendererDescription() {
        if (PlaytestManager._renderer !== undefined) return PlaytestManager._renderer;
        let description = '';
        try {
            const canvas = typeof document !== 'undefined' ? document.createElement('canvas') : null;
            const gl = canvas && (canvas.getContext('webgl2') || canvas.getContext('webgl'));
            if (gl) {
                const info = gl.getExtension('WEBGL_debug_renderer_info');
                description = String((info && gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) || gl.getParameter(gl.RENDERER) || '');
                const lose = gl.getExtension('WEBGL_lose_context');
                if (lose) lose.loseContext();
            }
        } catch (error) { description = ''; }
        PlaytestManager._renderer = description;
        return description;
    }

    constructor(projectManager = null) {
        this.projectManager = projectManager;
        this.playtestProcess = null;
        this.lastResolveDebug = null;
        this.lastLaunchError = null;
    }

    /** Whether a playtest window is open. */
    isRunning() {
        return !!this.playtestProcess;
    }

    /**
     * Whether the playtest has the machine: open, and the editor window not
     * focused. The editor's map views stop drawing meanwhile (MapEditor3D's
     * loop, the 2D map's render scheduler) and pick up again the moment the
     * editor is clicked back into: on an integrated GPU the game and the
     * editor shared it, and the game's frame rate paid for a view nobody was
     * looking at.
     */
    ownsGpu() {
        if (!this.isRunning()) return false;
        return !(typeof document !== 'undefined' && typeof document.hasFocus === 'function' && document.hasFocus());
    }

    playtest(projectPath) {
        if (!projectPath) {
            console.error('No project loaded');
            return false;
        }

        console.log('Starting playtest for project:', projectPath);

        if (typeof window !== 'undefined' && window.RPGReactorHost?.mode === 'web') {
            window.RPGReactorHost.openPlaytest('test');
            return true;
        }

        if (typeof nw !== 'undefined') {
            return this.launchPlaytestWindow(projectPath);
        } else {
            console.error('NW.js not available - cannot launch playtest window');
            return false;
        }
    }

    /**
     * Previews one user interface: the mode token carries `rrui=<id>` beside
     * `test`, which the runtime reads the same way it reads `test` itself,
     * and boots the interface over a black screen with no title or map;
     * closing it ends the playtest.
     */
    playtestInterface(projectPath, interfaceId) {
        const id = Math.floor(Number(interfaceId));
        if (!projectPath || !(id > 0)) return false;
        const mode = `test&rrui=${id}`;
        if (typeof window !== 'undefined' && window.RPGReactorHost?.mode === 'web') {
            window.RPGReactorHost.openPlaytest(mode);
            return true;
        }
        if (typeof nw !== 'undefined') {
            return this.launchPlaytestWindow(projectPath, mode);
        }
        console.error('NW.js not available - cannot launch playtest window');
        return false;
    }

    /**
     * Plays a battle on the map at once: `fight` starts a tactical battle on
     * the first map scene (the map's own units, or the test troop round the
     * party; a map that starts its own battle keeps it), and `fightat` puts
     * a new game on that map and cell with the title skipped.
     */
    playtestFight(projectPath, at) {
        if (!projectPath) return false;
        const mode = PlaytestManager.fightMode(at);
        if (typeof window !== 'undefined' && window.RPGReactorHost?.mode === 'web') {
            window.RPGReactorHost.openPlaytest(mode);
            return true;
        }
        if (typeof nw !== 'undefined') {
            return this.launchPlaytestWindow(projectPath, mode);
        }
        console.error('NW.js not available - cannot launch playtest window');
        return false;
    }

    static fightMode(at) {
        const whole = value => Math.max(0, Math.floor(Number(value) || 0));
        return at && whole(at.mapId) > 0 ? `test&fight&fightat=${whole(at.mapId)},${whole(at.x)},${whole(at.y)}` : 'test&fight';
    }

    /**
     * Battle Setup's Play this battle: a new game on a map with the title
     * skipped, the party on a tile and facing a way (`at`: `{ mapId, x, y,
     * direction }`). No battle is asked for: the game starts one when the
     * map's own start rule fires.
     */
    playtestAt(projectPath, at, options = {}) {
        if (!projectPath) return false;
        const mode = PlaytestManager.playMode(at, options);
        if (typeof window !== 'undefined' && window.RPGReactorHost?.mode === 'web') {
            window.RPGReactorHost.openPlaytest(mode);
            return true;
        }
        if (typeof nw !== 'undefined') {
            return this.launchPlaytestWindow(projectPath, mode);
        }
        console.error('NW.js not available - cannot launch playtest window');
        return false;
    }

    /**
     * The launch line of Play this battle: `test&playat=<mapId>,<x>,<y>,<direction>`
     * and nothing else. For a game whose runtime does not read `playat`
     * (`options.playat` false) it is the Test battle line instead, with
     * the on-map mode in force named (`options.mode`), so the button still
     * opens a battle there.
     */
    static playMode(at, options = {}) {
        const whole = value => Math.max(0, Math.floor(Number(value) || 0));
        if (!at || !(whole(at.mapId) > 0)) return 'test';
        if (options.playat === false) {
            const named = ['tactical', 'action', 'firstPerson'].includes(options.mode) ? `&fightmode=${options.mode}` : '';
            return PlaytestManager.fightMode(at) + named;
        }
        const direction = [2, 4, 6, 8].includes(Number(at.direction)) ? Number(at.direction) : 2;
        return `test&playat=${whole(at.mapId)},${whole(at.x)},${whole(at.y)},${direction}`;
    }

    /**
     * What of a launch line names the playtest's profile folder (on
     * Windows, where the game reads its flags from that folder's name):
     * its flags (`test`, `btest`, `fight`). A token with a value
     * (`playat=5,80,60,4`) is read from the launch line itself, so every
     * tile played from shares one profile.
     */
    static profileToken(mode) {
        return String(mode || '').split('&').filter(token => token && !token.includes('=')).join('&');
    }

    /**
     * Boot the game into a stock scene and have it write what is on screen
     * to `dir` for the User Interfaces tab's reference layer, then exit.
     * The runtime reads `rrcapture` / `rrcapturedir` off the launch line.
     */
    captureScene(projectPath, sceneKey, dir) {
        if (!projectPath || !sceneKey || !dir) return false;
        const mode = PlaytestManager.captureMode(sceneKey, dir);
        if (typeof nw !== 'undefined') {
            return this.launchPlaytestWindow(projectPath, mode);
        }
        console.error('NW.js not available - cannot capture a scene');
        return false;
    }

    static captureMode(sceneKey, dir) {
        return `test&rrcapture=${encodeURIComponent(sceneKey)}&rrcapturedir=${encodeURIComponent(dir)}`;
    }

    battleTest(projectPath) {
        if (!projectPath) {
            console.error('No project loaded');
            return false;
        }
        console.log('Starting battle test for project:', projectPath);
        // `btest` alone is not a playtest: `Utils.isOptionValid("test")` stays
        // false, so `$gameTemp.isPlaytest()` is false and every plugin gated on
        // it (VisuStella's Debugger declares its window classes only under
        // `test`) never runs its declarations while its unconditional tail
        // still references them - the game dies on the boot error screen
        // before Scene_Boot. RPG Maker launches battle tests as `test btest`;
        // one ampersand-delimited token is how this launcher spells that.
        const mode = PlaytestManager.BATTLE_TEST_MODE;
        if (typeof window !== 'undefined' && window.RPGReactorHost?.mode === 'web') {
            window.RPGReactorHost.openPlaytest(mode);
            return true;
        }
        if (typeof nw !== 'undefined') {
            return this.launchPlaytestWindow(projectPath, mode);
        } else {
            console.error('NW.js not available - cannot launch battle test');
            return false;
        }
    }

    /**
     * Character Creation builds with the Forge's own files, which a deployed game carries.
     * A playtest runs from the project's folder, so they go there first. A failure here
     * still lets the game start; its creator then says it could not load them.
     */
    stageCharacterBuilder(projectPath) {
        try {
            const path = require('path'), fs = require('fs');
            const appRoot = [__dirname, path.resolve(__dirname, '..'), process.cwd()]
                .find(root => fs.existsSync(path.join(root, 'build-scripts', 'online-deploy.cjs')));
            if (appRoot) require(path.join(appRoot, 'build-scripts', 'online-deploy.cjs')).stagePlaytestCharacterBuilder(projectPath, appRoot);
        } catch (error) {
            console.error('Could not make the character builder ready for this playtest:', error);
        }
    }

    /** Said where it is seen: the status bar this used to write to is gone, so a failed launch did nothing visible. */
    _tellLaunchFailed(message) {
        // The reason is technical and stays in English (an install problem, or the system's own error text).
        const tt = text => (typeof window !== 'undefined' && window.I18n ? window.I18n.tText(text) : text);
        if (typeof RRDialog !== 'undefined' && RRDialog.alert) RRDialog.alert(String(message), { title: tt('Playtest'), kind: 'error' });
    }

    launchPlaytestWindow(projectPath, mode) {
        if (mode === undefined) mode = 'test';
        const tt = text => (typeof window !== 'undefined' && window.I18n) ? window.I18n.tText(text) : text;

        this.lastLaunchError = null;
        if (this.projectManager?.ensureProjectPackageMetadata) {
            const packageResult = this.projectManager.ensureProjectPackageMetadata(projectPath);
            if (!packageResult.ok) {
                this.lastLaunchError = packageResult.error;
                console.error('Cannot start playtest:', packageResult.error);
                if (typeof RRDialog !== 'undefined') {
                    RRDialog.alert(`${tt('Cannot start playtest.')}\n\n${packageResult.error}`, { title: tt('Playtest'), kind: 'error' });
                }
                return false;
            }
        }

        this.stageCharacterBuilder(projectPath);

        // Close existing playtest process if any
        if (this.playtestProcess) {
            try {
                this.playtestProcess.kill();
            } catch (e) {
                console.error('Error killing playtest process:', e);
            }
            this.playtestProcess = null;
        }

        const path = require('path');
        const fs = require('fs');
        const { spawn } = require('child_process');

        console.log(`Launching ${mode} as separate NW.js process:`, projectPath);

        const nwPath = this.resolveNwExecutable(path, fs);
        if (!nwPath) {
            console.error('Could not find an NW.js executable for playtest. Packaged editor builds must include nw.exe/nw, a macOS app executable, or an nwjs-* runtime folder.');
            if (this.lastResolveDebug) {
                console.error('NW.js playtest resolver diagnostics:', this.lastResolveDebug);
            }
            this._tellLaunchFailed('No NW.js program was found to run the game. A packaged editor needs nw.exe or nw beside it, or an nwjs-* folder.');
            return false;
        }

        console.log('NW.js executable path:', nwPath);
        console.log('Project path:', projectPath);

        // Launch NW.js from the project directory. Windows uses "." to avoid
        // app-path parsing issues with spaces; macOS passes the absolute path
        // so a bundled editor app can still launch an external project.
        // Pass mode parameter ('test' for playtest, 'btest' for battle test)
        const appPathArg = process.platform === 'darwin' ? projectPath : '.';
        const launchArgs = [appPathArg, mode];
        // Windows NW.js keeps --user-data-dir in nw.App.argv[0]. RPG Maker
        // checks only that first argument for test/btest, so preserve the mode
        // as an ampersand-delimited option in the profile path. Argument arrays
        // avoid shell interpretation, and ampersands are valid in Windows paths.
        const userDataDir = this.resolvePlaytestUserDataDir(path, fs, projectPath, {
            optionToken: process.platform === 'win32' ? mode : null
        });
        if (userDataDir) {
            launchArgs.unshift(`--user-data-dir=${userDataDir}`);
            console.log('Playtest user data dir:', userDataDir);
        }
        // A weak GPU on Windows: the faster WebGL backend for this machine (WEAK_ANGLE_ARGS), after the profile path.
        let packageData = null;
        try { packageData = JSON.parse(fs.readFileSync(path.join(projectPath, 'package.json'), 'utf8')); } catch (error) { packageData = null; }
        // This machine's own backend where the game has learned one (backendPlan), else the weak-GPU guess.
        const renderer = PlaytestManager.rendererDescription();
        const ownHop = typeof nw !== 'undefined' && nw.App ? PlaytestManager.editorHop(nw.App.fullArgv) : null;
        const angle = PlaytestManager.backendArgs(process.platform, renderer, packageData, PlaytestManager.backendPlan(renderer, fs, path), !!ownHop && ownHop !== 'default');
        if (angle.length) {
            launchArgs.splice(userDataDir ? 1 : 0, 0, ...angle);
            console.log('Playtest WebGL backend:', angle.join(' '));
        }

        const child = spawn(nwPath, launchArgs, {
            cwd: projectPath,
            stdio: 'ignore',
            detached: false,
            windowsHide: false
        });
        this.playtestProcess = child;

        child.on('error', (err) => {
            console.error('Failed to launch playtest:', err);
            if (this.playtestProcess === child) this.playtestProcess = null;
            this._tellLaunchFailed(`The game could not be started: ${err && err.message ? err.message : err}`);
        });

        child.on('exit', (code, signal) => {
            console.log('Playtest process exited:', code, signal);
            if (this.playtestProcess === child) this.playtestProcess = null;
        });

        console.log('Playtest process launched with PID:', child.pid);
        return true;
    }

    resolvePlaytestUserDataDir(path, fs, projectPath, options = {}) {
        const os = require('os');
        const crypto = require('crypto');
        const platform = options.platform || process.platform;
        const env = options.env || process.env;
        const homeDir = options.homeDir || os.homedir();
        const baseDir = options.baseDir || (platform === 'win32'
            ? (env.LOCALAPPDATA || env.APPDATA || path.join(homeDir, 'AppData', 'Local'))
            : platform === 'darwin'
                ? path.join(homeDir, 'Library', 'Application Support')
                : (env.XDG_CONFIG_HOME || path.join(homeDir, '.config')));
        const nwVersion = options.nwVersion ||
            ((process.versions && (process.versions.nw || process.versions['node-webkit'])) || 'unknown');
        const versionDir = `nwjs-${this.slugifyPathSegment(nwVersion)}`;
        let canonicalProjectPath = path.resolve(projectPath);
        try { canonicalProjectPath = fs.realpathSync(projectPath); } catch {}
        if (platform === 'win32') canonicalProjectPath = canonicalProjectPath.toLowerCase();
        const projectId = crypto.createHash('sha256').update(canonicalProjectPath).digest('hex').slice(0, 16);
        // A mode may carry several options (`test&btest`); the ampersand is
        // what the runtime splits on, so it must survive into the profile name.
        // Its flags alone name the profile: a token with a value is read from
        // the launch line itself.
        const optionToken = PlaytestManager.profileToken(options.optionToken).replace(/[^A-Za-z0-9_&-]/g, '')
            .split('&').filter(Boolean).join('&');
        const profileName = optionToken ? `${projectId}&${optionToken}` : projectId;
        const userDataDir = path.join(baseDir, 'RPGReactor', 'PlaytestProfile', versionDir, profileName);

        try {
            fs.mkdirSync(userDataDir, { recursive: true });
            return userDataDir;
        } catch (error) {
            console.warn('Could not create isolated playtest profile directory:', error);
            const fallbackDir = path.join(os.tmpdir(), 'rpg-reactor-playtest-profile', versionDir, profileName);
            try {
                fs.mkdirSync(fallbackDir, { recursive: true });
                return fallbackDir;
            } catch (fallbackError) {
                console.warn('Could not create fallback playtest profile directory:', fallbackError);
                return null;
            }
        }
    }

    slugifyPathSegment(value) {
        const slug = String(value || 'unknown')
            .toLowerCase()
            .replace(/[^a-z0-9._-]+/g, '-')
            .replace(/^-+|-+$/g, '');
        return slug || 'unknown';
    }

    resolveNwExecutable(path, fs) {
        const execPath = process.execPath;
        const execDir = path.dirname(execPath);
        const appRoot = this.resolveAppRoot(path, fs);
        const macAppBundleRoots = process.platform === 'darwin'
            ? this.resolveMacAppBundleRoots(path, fs, execPath, appRoot)
            : [];
        const macHasEmbeddedAppNw = macAppBundleRoots.some(root => fs.existsSync(path.join(root, 'Contents', 'Resources', 'app.nw')));
        const candidates = [];
        this.lastResolveDebug = {
            platform: process.platform,
            execPath,
            execDir,
            appRoot,
            cwd: typeof process !== 'undefined' ? process.cwd() : null,
            dirname: typeof __dirname !== 'undefined' ? __dirname : null,
            nwAppStartPath: typeof nw !== 'undefined' && nw.App ? nw.App.startPath : null,
            macAppBundleRoots,
            candidates,
        };

        const addCandidate = (candidate) => {
            if (candidate && !candidates.includes(candidate)) {
                candidates.push(candidate);
            }
        };

        if (process.platform === 'win32') {
            if (!fs.existsSync(path.join(execDir, 'package.nw'))) {
                addCandidate(path.join(execDir, 'nw.exe'));
            }
            addCandidate(path.join(execDir, 'nwjs-win', 'nw.exe'));
            addCandidate(path.join(appRoot, 'nwjs-win', 'nw.exe'));
            addCandidate(path.join(appRoot, '..', 'nwjs-win', 'nw.exe'));
        } else if (process.platform === 'darwin') {
            for (const appBundleRoot of macAppBundleRoots) {
                addCandidate(path.join(appBundleRoot, 'Contents', 'Resources', 'playtest-runtime', 'nwjs.app', 'Contents', 'MacOS', 'nwjs'));
                if (!fs.existsSync(path.join(appBundleRoot, 'Contents', 'Resources', 'app.nw'))) {
                    addCandidate(path.join(appBundleRoot, 'Contents', 'MacOS', 'nwjs'));
                }
            }
            if (path.basename(execPath) === 'nwjs' && !macHasEmbeddedAppNw) {
                addCandidate(execPath);
            } else if (!macHasEmbeddedAppNw) {
                addCandidate(path.join(execDir, 'nwjs'));
            }
            const packageRoot = path.resolve(execDir, '..', '..', '..');
            addCandidate(path.join(packageRoot, 'nwjs-mac', 'nwjs.app', 'Contents', 'MacOS', 'nwjs'));
            addCandidate(path.join(execDir, 'nwjs-mac', 'nwjs.app', 'Contents', 'MacOS', 'nwjs'));
            addCandidate(path.join(appRoot, 'nwjs-mac', 'nwjs.app', 'Contents', 'MacOS', 'nwjs'));
            addCandidate(path.join(appRoot, '..', 'nwjs-mac', 'nwjs.app', 'Contents', 'MacOS', 'nwjs'));
        } else {
            addCandidate(path.join(execDir, 'nwjs-linux', 'nw'));
            addCandidate(path.join(appRoot, 'nwjs-linux', 'nw'));
            addCandidate(path.join(appRoot, '..', 'nwjs-linux', 'nw'));
            if (!fs.existsSync(path.join(execDir, 'package.nw'))) {
                addCandidate(path.join(execDir, 'nw'));
            }
        }

        for (const candidate of candidates) {
            if (fs.existsSync(candidate)) {
                return candidate;
            }
        }

        // In source/dev launchers process.execPath is already the generic NW binary.
        const basename = path.basename(execPath).toLowerCase();
        if ((process.platform === 'win32' && basename === 'nw.exe') ||
            (process.platform === 'darwin' && basename === 'nwjs' && !macHasEmbeddedAppNw) ||
            (process.platform !== 'win32' && process.platform !== 'darwin' && basename === 'nw')) {
            return execPath;
        }

        console.warn('Checked NW.js playtest candidates:', candidates);
        return null;
    }

    resolveMacAppBundleRoots(path, fs, execPath, appRoot) {
        const roots = [];
        const addRoot = (candidate) => {
            if (!candidate || roots.includes(candidate)) return;
            if (path.basename(candidate).endsWith('.app') && fs.existsSync(path.join(candidate, 'Contents'))) {
                roots.push(candidate);
            }
        };
        const walkFrom = (start) => {
            if (!start) return;
            let current = start;
            try {
                if (!fs.existsSync(current) || !fs.statSync(current).isDirectory()) {
                    current = path.dirname(current);
                }
            } catch (_) {
                current = path.dirname(current);
            }

            while (current && current !== path.dirname(current)) {
                addRoot(current);
                current = path.dirname(current);
            }
        };

        walkFrom(execPath);
        walkFrom(typeof __dirname !== 'undefined' ? __dirname : null);
        walkFrom(typeof process !== 'undefined' ? process.cwd() : null);
        walkFrom(appRoot);
        if (typeof nw !== 'undefined' && nw.App && nw.App.startPath) {
            walkFrom(nw.App.startPath);
        }

        const scanForApps = (start) => {
            if (!start) return;
            let dir = start;
            try {
                if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
                    dir = path.dirname(dir);
                }
            } catch (_) {
                dir = path.dirname(dir);
            }

            for (let depth = 0; dir && dir !== path.dirname(dir) && depth < 8; depth++) {
                try {
                    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
                        if (entry.isDirectory() && entry.name.endsWith('.app')) {
                            addRoot(path.join(dir, entry.name));
                        }
                    }
                } catch (_) {}
                dir = path.dirname(dir);
            }
        };

        scanForApps(execPath);
        scanForApps(typeof __dirname !== 'undefined' ? __dirname : null);
        scanForApps(typeof process !== 'undefined' ? process.cwd() : null);
        scanForApps(appRoot);

        return roots;
    }

    resolveAppRoot(path, fs) {
        const candidates = [
            typeof __dirname !== 'undefined' ? __dirname : null,
            typeof process !== 'undefined' ? process.cwd() : null,
            typeof __dirname !== 'undefined' ? path.resolve(__dirname, '..') : null
        ].filter(Boolean);

        for (const candidate of candidates) {
            if (fs.existsSync(path.join(candidate, 'package.json')) ||
                fs.existsSync(path.join(candidate, 'build-scripts'))) {
                return candidate;
            }
        }

        return path.dirname(process.execPath);
    }
}

if (typeof module !== 'undefined' && module.exports) module.exports = PlaytestManager;
