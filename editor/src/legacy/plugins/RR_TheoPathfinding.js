/*:
 * @target MZ
 * @plugindesc TheoAllen Pathfinding (VX Ace), for imported games
 * @author TheoAllen; ported for RPG Reactor
 * @url https://github.com/Psychronic-Games/RPG-Reactor
 *
 * @help RR_TheoPathfinding.js
 *
 * Walks a character to a tile along a found path (four directions).
 *
 * Move route Script (the moving character itself):
 *   this.rrFindPath(x, y, stepAway, clear)       path to tile (x, y)
 *   this.rrGotoCharacter(id, stepAway, clear)    path to a character's tile
 *                                                (-1 player, n event)
 * The steps are inserted into the running move route right after the Script
 * command; stepAway stops that many tiles short. clear = true replaces the
 * route with the path instead (not from inside a move route). No path, no
 * change.
 *
 * Installed by File › Import Project… when the imported game carried the
 * original script; the importer turns the game's Ruby calls into the calls
 * above. Turning the plugin off leaves those calls doing nothing.
 */
(() => {
    'use strict';
    PluginManager.parameters('RR_TheoPathfinding');

    const DIRS = [2, 4, 6, 8];
    const shuffled = () => {
        const a = DIRS.slice();
        for (let i = a.length - 1; i > 0; i--) { const j = Math.randomInt(i + 1); [a[i], a[j]] = [a[j], a[i]]; }
        return a;
    };

    /**
     * The original's search: breadth first, except that on a map without
     * looping a step that gets closer to the target jumps the queue, nearest
     * first. Returns MZ move command codes (1 down, 2 left, 3 right, 4 up) or null.
     */
    Game_Character.prototype.rrSearchPath = function(tx, ty) {
        const astar = !($gameMap.isLoopHorizontal() || $gameMap.isLoopVertical());
        const nodes = new Map();
        const key = (x, y) => x + ',' + y;
        const range = (n) => Math.sqrt((n.x - tx) ** 2 + (n.y - ty) ** 2);
        const passable = (x, y, d) => {
            const x2 = $gameMap.roundXWithDirection(x, d), y2 = $gameMap.roundYWithDirection(y, d);
            // The target tile is judged by the map alone: whoever stands there is where we're going.
            if (x2 === tx && y2 === ty) return this.isThrough() || this.isMapPassable(x, y, d);
            return this.canPass(x, y, d);
        };
        const expand = (node) => {
            for (const d of DIRS) {
                if (!passable(node.x, node.y, d)) continue;
                const x = $gameMap.roundXWithDirection(node.x, d), y = $gameMap.roundYWithDirection(node.y, d);
                let next = nodes.get(key(x, y));
                if (!next) { next = { x, y, parent: null, dir: 0, links: {}, visited: false, expanded: false }; nodes.set(key(x, y), next); }
                else if (next.visited) continue;
                next.parent = node;
                next.dir = d;
                node.links[d] = next;
            }
            node.expanded = true;
        };

        let front = [], back = [];
        const push = (node, parent) => {
            if (astar && range(node) < range(parent)) {
                front.push(node);
                front.sort((a, b) => range(a) - range(b));
            } else {
                back.push(node);
            }
        };

        const first = { x: this.x, y: this.y, parent: null, dir: 0, links: {}, visited: false, expanded: false };
        expand(first);
        first.visited = true;
        nodes.set(key(first.x, first.y), first);
        front.push(first);

        while (front.length || back.length) {
            const node = front.length ? front.shift() : back.shift();
            for (const d of shuffled()) {
                const next = node.links[d];
                if (!next || next.visited) continue;
                if (next.x === tx && next.y === ty) {
                    const codes = [];
                    for (let n = next; n.parent; n = n.parent) codes.unshift(n.dir / 2);
                    return codes;
                }
                if (!next.expanded) expand(next);
                next.visited = true;
                push(next, node);
            }
        }
        return null;
    };

    Game_Character.prototype.rrFindPath = function(tx, ty, stepAway = 0, clear = false) {
        tx = Number(tx);
        ty = Number(ty);
        if (this.x === tx && this.y === ty) return;
        if (!DIRS.some(d => this.canPass(tx, ty, d))) return;
        const codes = this.rrSearchPath(tx, ty);
        if (codes) codes.splice(Math.max(codes.length - Math.max(Number(stepAway) || 0, 0), 0), codes.length);
        const commands = codes && codes.map(code => ({ code, indent: null, parameters: [] }));
        if (clear) {
            // As in the original, clear with no path ends the current route.
            if (!commands) { this.processRouteEnd(); return; }
            // The end command the original left off: without it the forced route never finishes.
            commands.push({ code: 0, indent: null, parameters: [] });
            this.forceMoveRoute({ list: commands, repeat: false, skippable: false, wait: false });
        } else if (commands && this._moveRoute) {
            // A copy: the page's own route (shared with the map data) must stay untouched.
            const route = JsonEx.makeDeepCopy(this._moveRoute);
            route.list.splice(this._moveRouteIndex + 1, 0, ...commands);
            this._moveRoute = route;
        }
    };

    Game_Character.prototype.rrGotoCharacter = function(id, stepAway = 0, clear = false) {
        const target = Number(id) === -1 ? $gamePlayer : $gameMap.event(Number(id));
        if (!target) return;
        // The target stands on the goal; through keeps it from blocking its own tile.
        const lastThrough = target._through;
        target._through = true;
        try {
            this.rrFindPath(target.x, target.y, stepAway, clear);
        } finally {
            target._through = lastThrough;
        }
    };
})();
