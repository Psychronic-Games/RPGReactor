// RPG Reactor - Playtest Manager
// Handles launching and managing game playtesting

class PlaytestManager {
    constructor() {
        this.playtestProcess = null;
    }

    playtest(projectPath) {
        if (!projectPath) {
            console.error('No project loaded');
            return false;
        }

        console.log('Starting playtest for project:', projectPath);

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
            console.error('Could not find a plain NW.js executable for playtest. Packaged editor builds must include nw.exe/nw or an nwjs-* runtime folder.');
            return false;
        }

        console.log('NW.js executable path:', nwPath);
        console.log('Project path:', projectPath);

        // Launch NW.js from the project directory. Using "." avoids app-path
        // parsing issues with spaces in Windows paths.
        // Pass mode parameter ('test' for playtest, 'btest' for battle test)
        this.playtestProcess = spawn(nwPath, ['.', mode], {
            cwd: projectPath,
            stdio: 'ignore',
            detached: false
        });

        this.playtestProcess.on('error', (err) => {
            console.error('Failed to launch playtest:', err);
            this.playtestProcess = null;
        });

        this.playtestProcess.on('exit', (code, signal) => {
            console.log('Playtest process exited:', code, signal);
            this.playtestProcess = null;
        });

        console.log('Playtest process launched with PID:', this.playtestProcess.pid);
        return true;
    }

    resolveNwExecutable(path, fs) {
        const execPath = process.execPath;
        const execDir = path.dirname(execPath);
        const appRoot = this.resolveAppRoot(path, fs);
        const candidates = [];

        const addCandidate = (candidate) => {
            if (candidate && !candidates.includes(candidate)) {
                candidates.push(candidate);
            }
        };

        if (process.platform === 'win32') {
            addCandidate(path.join(execDir, 'nwjs-win', 'nw.exe'));
            addCandidate(path.join(appRoot, 'nwjs-win', 'nw.exe'));
            addCandidate(path.join(appRoot, '..', 'nwjs-win', 'nw.exe'));
            if (!fs.existsSync(path.join(execDir, 'package.nw'))) {
                addCandidate(path.join(execDir, 'nw.exe'));
            }
        } else if (process.platform === 'darwin') {
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
            (process.platform === 'darwin' && basename === 'nwjs') ||
            (process.platform !== 'win32' && process.platform !== 'darwin' && basename === 'nw')) {
            return execPath;
        }

        return null;
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
