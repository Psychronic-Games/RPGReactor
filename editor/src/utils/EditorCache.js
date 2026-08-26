/**
 * Per-machine cache folders for the editor: things rebuilt from a project
 * that belong beside the editor profile, not in the project (model
 * thumbnails, interface captures). Same platform rule as the editor
 * profiles.
 */
(function(root) {
    'use strict';

    function rootFor(proc, pathMod, osMod, leaf) {
        if (proc.platform === 'win32') {
            const localAppData = proc.env.LOCALAPPDATA || pathMod.join(osMod.homedir(), 'AppData', 'Local');
            return pathMod.join(localAppData, 'RPGReactor', leaf);
        }
        if (proc.platform === 'darwin') {
            return pathMod.join(osMod.homedir(), 'Library', 'Application Support', 'RPGReactor', leaf);
        }
        const cacheRoot = proc.env.XDG_CACHE_HOME || pathMod.join(osMod.homedir(), '.cache');
        return pathMod.join(cacheRoot, 'rpg-reactor', leaf.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase());
    }

    /** A stable folder name for a project path. */
    function projectKey(projectPath) {
        const crypto = require('crypto');
        return crypto.createHash('sha1').update(String(projectPath)).digest('hex').slice(0, 16);
    }

    function dir(leaf, projectPath, ...parts) {
        if (typeof require !== 'function' || typeof process === 'undefined') return null;
        const pathMod = require('path');
        return pathMod.join(rootFor(process, pathMod, require('os'), leaf), projectKey(projectPath), ...parts);
    }

    root.RREditorCache = { rootFor, projectKey, dir };
})(typeof window !== 'undefined' ? window : globalThis);
