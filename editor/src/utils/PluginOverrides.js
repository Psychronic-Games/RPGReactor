/**
 * PluginOverrides - which installed plugins replace which runtime methods.
 *
 * Help text in the editor describes the engine. A project with plugins is not
 * running the engine the help text describes: install VisuMZ_1_ElementStatusCore
 * and `Game_BattlerBase.prototype.elementRate` is a different function, so
 * "0% blocks the element outright" stops being true.
 *
 * The editor cannot know what a plugin changed a method into - it would have to
 * run it - but it can see, cheaply and exactly, THAT a method was replaced and
 * by whom. So that is all this claims: it names the plugins, and leaves the
 * reader to go and read them. Naming is useful on its own; guessing would not be.
 *
 * What it sees, and what it misses
 * --------------------------------
 * It matches `.prototype.<method> =`, which is how every alias in the RPG Maker
 * plugin convention is written. It does NOT see a method installed through
 * `Object.assign(X.prototype, {...})`, one built by string concatenation, or one
 * a plugin replaces at runtime from inside another function. A quiet result
 * therefore means "nothing found", not "nothing overrides this".
 *
 * Cost: the whole enabled plugin set of a large project measured 13 MB read and
 * scanned in 28 ms, so this runs synchronously on first use and is then cached
 * against the manifest's mtime.
 */
(function(root) {
    'use strict';

    // How many plugin names a note spells out before it starts counting.
    const NAME_LIMIT = 3;

    let cachedKey = '';
    let cachedMap = null;

    function currentProjectPath() {
        const controller = root.reactor && root.reactor.projectController;
        const project = controller && typeof controller.getCurrentProject === 'function'
            ? controller.getCurrentProject()
            : null;
        return (project && project.path) || '';
    }

    /**
     * The project's plugin manifest and a stamp that changes when it is saved; both '' when there is none.
     * Asked on every lookup (a Traits table asks per row and per choice), so it only stats the file.
     */
    function manifestStamp(fs, path, projectPath) {
        const usesReactor = fs.existsSync(path.join(projectPath, 'js', 'reactor_main.js'));
        const manifest = path.join(projectPath, 'js', usesReactor ? 'reactor_plugins.js' : 'plugins.js');
        try {
            return { manifest, stamp: `${manifest}|${fs.statSync(manifest).mtimeMs}` };
        } catch (error) {
            return { manifest: '', stamp: '' };
        }
    }

    /** The enabled plugin names from the project's manifest, in load order. */
    function enabledPlugins(fs, manifest) {
        let list;
        try {
            const match = fs.readFileSync(manifest, 'utf8').match(/var\s+\$plugins\s*=\s*(\[[\s\S]*\])\s*;/);
            list = match ? JSON.parse(match[1]) : [];
        } catch (error) {
            return [];
        }
        return (Array.isArray(list) ? list : [])
            .filter(entry => entry && entry.status && typeof entry.name === 'string')
            .map(entry => entry.name);
    }

    /**
     * Read every enabled plugin once and record which of them assign to
     * `.prototype.<method>`. One pass per file over a single alternation, so
     * the cost is the read rather than the match.
     */
    function build() {
        if (typeof require !== 'function') return new Map();
        const projectPath = currentProjectPath();
        if (!projectPath) return new Map();

        let fs;
        let path;
        try {
            fs = require('fs');
            path = require('path');
        } catch (error) {
            return new Map();
        }

        const { manifest, stamp } = manifestStamp(fs, path, projectPath);
        if (stamp && stamp === cachedKey && cachedMap) return cachedMap;
        const names = manifest ? enabledPlugins(fs, manifest) : [];

        const found = new Map();
        const pattern = /\.prototype\.([A-Za-z_$][\w$]*)\s*=(?!=)/g;
        for (const name of names) {
            let source;
            try {
                source = fs.readFileSync(path.join(projectPath, 'js', 'plugins', `${name}.js`), 'utf8');
            } catch (error) {
                continue;
            }
            pattern.lastIndex = 0;
            let match;
            while ((match = pattern.exec(source)) !== null) {
                const method = match[1];
                if (!found.has(method)) found.set(method, []);
                const owners = found.get(method);
                if (!owners.includes(name)) owners.push(name);
            }
        }

        cachedKey = stamp;
        cachedMap = found;
        return found;
    }

    /** Every enabled plugin that assigns to any of these methods, in load order. */
    function owners(methods) {
        const list = Array.isArray(methods) ? methods : [methods];
        if (list.length === 0) return [];
        let map;
        try {
            map = build();
        } catch (error) {
            return [];
        }
        const seen = [];
        for (const method of list) {
            for (const name of map.get(method) || []) {
                if (!seen.includes(name)) seen.push(name);
            }
        }
        return seen;
    }

    /**
     * The line appended under a help sentence, or '' when nothing overrides the
     * methods. Long lists are cut to the first few names and a count, so the
     * note stays one line whatever a project has installed.
     */
    function note(methods) {
        const tt = text => (root.I18n ? root.I18n.tText(text) : text);
        const names = owners(methods);
        if (names.length === 0) return '';
        const shown = names.slice(0, NAME_LIMIT).join(', ');
        const rest = names.length - NAME_LIMIT;
        return rest > 0
            ? `${tt('Changed by plugins:')} ${shown} ${tt('and %1 more').replace('%1', String(rest))}`
            : `${tt('Changed by plugins:')} ${shown}`;
    }

    /** Drop the cache, so the next note re-reads the manifest and the plugins. */
    function reset() {
        cachedKey = '';
        cachedMap = null;
    }

    const api = { owners, note, reset };
    root.RRPluginOverrides = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
