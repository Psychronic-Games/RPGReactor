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
            this.launchPlaytestWindow(projectPath);
            return true;
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
            this.launchPlaytestWindow(projectPath, 'btest');
            return true;
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
        const { spawn } = require('child_process');

        console.log(`Launching ${mode} as separate NW.js process:`, projectPath);

        // Get the NW.js executable path
        // In NW.js, process.execPath points to the nw executable
        const nwPath = process.execPath;

        console.log('NW.js executable path:', nwPath);
        console.log('Project path:', projectPath);

        // Launch NW.js pointing to the project directory
        // This will load the package.json from that directory
        // Pass mode parameter ('test' for playtest, 'btest' for battle test)
        this.playtestProcess = spawn(nwPath, [projectPath, mode], {
            stdio: 'inherit',
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
