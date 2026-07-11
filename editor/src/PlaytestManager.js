// RPG Reactor - Playtest Manager
// Handles launching and managing game playtesting

class PlaytestManager {
    constructor() {
        this.playtestProcess = null;
        this.lastResolveDebug = null;
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

    battleTest(projectPath) {
        if (!projectPath) {
            console.error('No project loaded');
            return false;
        }
        console.log('Starting battle test for project:', projectPath);
        if (typeof window !== 'undefined' && window.RPGReactorHost?.mode === 'web') {
            window.RPGReactorHost.openPlaytest('btest');
            return true;
        }
        if (typeof nw !== 'undefined') {
            return this.launchPlaytestWindow(projectPath, 'btest');
        } else {
            console.error('NW.js not available - cannot launch battle test');
            return false;
        }
    }

    launchPlaytestWindow(projectPath, mode) {
        if (mode === undefined) mode = 'test';

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
        const userDataDir = this.resolvePlaytestUserDataDir(path, fs, projectPath);
        if (userDataDir) {
            launchArgs.unshift(`--user-data-dir=${userDataDir}`);
            console.log('Playtest user data dir:', userDataDir);
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
        const userDataDir = path.join(baseDir, 'RPGReactor', 'PlaytestProfile', versionDir, projectId);

        try {
            fs.mkdirSync(userDataDir, { recursive: true });
            return userDataDir;
        } catch (error) {
            console.warn('Could not create isolated playtest profile directory:', error);
            const fallbackDir = path.join(os.tmpdir(), 'rpg-reactor-playtest-profile', versionDir, projectId);
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

    stopPlaytest() {
        if (this.playtestProcess) {
            console.log('Stopping playtest...');
            try {
                this.playtestProcess.kill();
            } catch (e) {
                console.error('Error stopping playtest:', e);
            }
            this.playtestProcess = null;
        }
    }

    isPlaytesting() {
        return this.playtestProcess !== null;
    }
}

if (typeof module !== 'undefined' && module.exports) module.exports = PlaytestManager;
