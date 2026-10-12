/* Shared, side-effect-free Victory interface: node settings, pages, the fill animation, drawing on a 2D canvas, the stock layout. */
(function(root) {
    'use strict';

    /**
     * ReactorVictoryHud - what a won battle shows, the same in the game and
     * on the editor's canvas: who gained how much EXP (a bar that fills from
     * where it was to where it is, rolling over on a level-up), who gained a
     * level (the parameters and the skills learned), and what was found
     * (gold, items, weapons and armor with their descriptions).
     *
     * Four interface nodes: Party Experience, Level Up, Rewards and Victory
     * Text (a page title, the hint, the page count, the game's own EXP and
     * gold lines). Everything draws from a plain summary of the battle's
     * rewards on a canvas context, so the runtime (reactor_ui.js) and the
     * editor draw one picture. The summary is made from what each actor was
     * before the rewards were given and is after: nothing here works out a
     * reward, and nothing here needs a game global.
     */
    const V = {};
    const pick = name => { try { return require(name); } catch (error) { return null; } };
    // The Tactical HUD's shared half lends its pen and its portraits. It is looked up when something is first
    // drawn, so the two files may load in either order.
    let F = null;
    let write = function() {}, rounded = function() {};
    function pen() {
        if (F) return;
        F = root.ReactorFightHud || (typeof require === 'function' ? pick('./reactor_ui_fight.js') || pick('./FightHud.js') : null);
        if (F) { write = F.text; rounded = F.roundedPath; }
    }

    V.NODE_TYPES = ['victoryParty', 'victoryLevels', 'victoryRewards', 'victoryText'];
    // The presentation of a Victory record, its role and its System field.
    V.MODE = 'victory';
    V.ROLE = 'victory';
    V.FIELD = 'reactorVictoryInterfaceId';
    V.PAGES = ['exp', 'levelUp', 'rewards'];
    /** The page a node belongs to by its type ('' for one that shows on every page unless it says otherwise). */
    V.PAGE_OF = { victoryParty: 'exp', victoryLevels: 'levelUp', victoryRewards: 'rewards', victoryText: '' };
    V.TEXTS = ['title', 'hint', 'page', 'exp', 'gold'];
    V.KINDS = ['item', 'keyItem', 'weapon', 'armor'];
    /** Every word the interface writes that Terms does not have; a node's `victoryLabels` replaces any of them. */
    V.LABELS = {
        title: 'Victory!', levelUpTitle: 'Level Up', rewardsTitle: 'Rewards',
        levelUp: 'Level Up!', gained: '+%1 %2', max: 'MAX',
        learned: 'New skills', more: '+%1 more',
        gold: 'Gold found', item: 'Item', keyItem: 'Key Item', weapon: 'Weapon', armor: 'Armor',
        continue: 'Continue', close: 'Close', page: '%1 / %2'
    };
    /** The words each node writes (the editor lists them under Words). */
    V.NODE_LABELS = {
        victoryParty: ['levelUp', 'gained', 'max'],
        victoryLevels: ['learned', 'more'],
        victoryRewards: ['gold', 'item', 'keyItem', 'weapon', 'armor'],
        victoryText: { title: ['title', 'levelUpTitle', 'rewardsTitle'], hint: ['continue', 'close'], page: ['page'], exp: [], gold: [] }
    };
    // Frames the Level Up mark takes to settle after a level is gained.
    V.POP_FRAMES = 24;
    // Frames a page stays before a held key moves on.
    V.HOLD_FRAMES = 24;
    // Frames in which no key is heard after a page opens, or after a press cut its fill short: the key that ended
    // the battle turns no page, and a player who presses fast still sees every page.
    V.LOCK_FRAMES = 20;
    // How many times faster a held key runs the fill.
    V.FAST = 4;

    const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
    const finite = (value, fallback) => (Number.isFinite(Number(value)) && value !== '' && value !== null ? Number(value) : fallback);
    const isHex = value => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);
    const oneOf = (value, options, fallback) => (options.includes(value) ? value : fallback);

    V.isVictoryNode = type => V.NODE_TYPES.includes(type);

    /** The id System binds as the Victory interface (0: none in use, the game's own message lines play). */
    V.boundId = function(system) {
        const id = system ? Math.floor(Number(system[V.FIELD]) || 0) : 0;
        return id > 0 ? id : 0;
    };

    const PAGE_OPTIONS = [['', 'Every page'], ['exp', 'Experience'], ['levelUp', 'Level Up'], ['rewards', 'Rewards']];
    /**
     * Every setting of every node, as the editor lists it and `normalizeProps`
     * reads it: `[key, kind, label, default, ...]` with kind `select`
     * (options as [value, label]), `check`, `number` (min, max) or `color`.
     */
    V.SETTINGS = {
        victoryParty: [
            ['showPortrait', 'check', 'Portrait', true],
            ['showLevel', 'check', 'Level', true],
            ['showGain', 'check', 'EXP gained', true],
            ['showBar', 'check', 'EXP bar', true],
            ['showBarNumbers', 'check', 'Numbers on the bar', true],
            ['showReserve', 'check', 'Reserve members who gained EXP', true],
            ['columns', 'number', 'Columns', 0, 0, 8],
            ['barColor1', 'color', 'Bar color 1', '#44ff88'],
            ['barColor2', 'color', 'Bar color 2', '#44aaff'],
            ['levelUpColor', 'color', 'Level up color', '#ffe14a'],
            ['fillFrames', 'number', 'Fill time (frames)', 90, 10, 600],
            ['levelUpSound', 'check', 'Level up sound', true]
        ],
        victoryLevels: [
            ['showPortrait', 'check', 'Portrait', true],
            ['showParams', 'check', 'Parameters', true],
            ['showSkills', 'check', 'Skills learned', true],
            ['levelUpColor', 'color', 'Level up color', '#ffe14a'],
            ['gainColor', 'color', 'Gain color', '#44ff88']
        ],
        victoryRewards: [
            ['columns', 'number', 'Columns', 0, 0, 4],
            ['showDescription', 'check', 'Descriptions', true],
            ['showKind', 'check', 'Kind', true],
            ['descriptionSize', 'number', 'Description size', 0, 0, 48],
            ['goldIcon', 'number', 'Gold icon', 0, 0, 99999],
            ['goldColor', 'color', 'Gold color', '#ffd700'],
            ['itemColor', 'color', 'Item color', '#44ff88'],
            ['keyItemColor', 'color', 'Key item color', '#ffaa44'],
            ['weaponColor', 'color', 'Weapon color', '#ff6644'],
            ['armorColor', 'color', 'Armor color', '#4488ff']
        ],
        victoryText: [
            ['victoryText', 'select', 'Shows', 'title', [['title', 'Page title'], ['hint', 'What OK does'], ['page', 'Page number'], ['exp', 'EXP received'], ['gold', 'Gold found']]],
            ['victoryPage', 'select', 'Shown on', '', PAGE_OPTIONS]
        ]
    };
    /** The setting any other node of a Victory record takes: the page it shows on. */
    V.PAGE_SETTING = ['victoryPage', 'select', 'Shown on', '', PAGE_OPTIONS];
    V.SIZES = { victoryParty: [720, 300], victoryLevels: [720, 300], victoryRewards: [720, 300], victoryText: [320, 36] };

    /** What a new node of a type starts as. */
    V.defaultProps = function(type) {
        const out = {};
        if (!V.isVictoryNode(type)) return out;
        for (const [key, , , value] of V.SETTINGS[type]) out[key] = value;
        out.width = V.SIZES[type][0]; out.height = V.SIZES[type][1];
        out.fill = 'none';
        out.victoryLabels = {};
        if (type === 'victoryText') Object.assign(out, { align: 'center', fontSize: 0, textColor: 0, fontBold: false });
        return out;
    };

    /** A stored node's own settings, every value in range (missing ones at their defaults). */
    V.normalizeProps = function(source, type) {
        const out = {};
        if (!V.isVictoryNode(type)) return out;
        source = source && typeof source === 'object' ? source : {};
        for (const [key, kind, , value, a, b] of V.SETTINGS[type]) {
            if (kind === 'check') out[key] = source[key] === undefined ? value : !!source[key];
            else if (kind === 'number') out[key] = clamp(Math.round(finite(source[key], value)), a, b);
            else if (kind === 'color') out[key] = isHex(source[key]) ? source[key] : value;
            else out[key] = oneOf(source[key], a.map(option => option[0]), value);
        }
        const labels = {};
        if (source.victoryLabels && typeof source.victoryLabels === 'object') {
            for (const key of Object.keys(V.LABELS)) if (typeof source.victoryLabels[key] === 'string' && source.victoryLabels[key]) labels[key] = source.victoryLabels[key];
        }
        out.victoryLabels = labels;
        return out;
    };

    /** The page a stored value names, '' for every page. */
    V.normalizePage = value => oneOf(value, V.PAGES, '');

    /** The key a word has in System.json `reactorBattle.terms`. */
    V.termKey = key => 'victory' + key.charAt(0).toUpperCase() + key.slice(1);

    /** A word: the node's own, else the project's (System.json `reactorBattle.terms`), else the stock one. */
    V.label = function(node, key, theme) {
        const own = theme && theme.own ? theme.own[V.termKey(key)] : '';
        return (node && node.victoryLabels && node.victoryLabels[key]) || (typeof own === 'string' && own) || V.LABELS[key] || '';
    };

    /** The page a node shows on ('' for every page): by its type, else by its Shown on setting. */
    V.pageOf = function(node) {
        if (!node) return '';
        return V.PAGE_OF[node.type] || V.normalizePage(node.victoryPage);
    };

    //-------------------------------------------------------------------------
    // The summary: what a battle's rewards did, as plain values.
    //
    //   { exp, gold,
    //     members: [{ actorId, name, faceName, faceIndex, characterName, characterIndex, model, reserve, dead,
    //                 level0, level1, exp0, exp1, floors, capped, params0, params1, skills: [{ id, name, iconIndex }] }],
    //     items: [{ kind, id, name, iconIndex, description, count }] }
    //
    // `floors[i]` is the total EXP at which level `level0 + i` begins, up to
    // the level after `level1`; `capped` says the actor is at the last level.

    /** What a reward is: 'weapon', 'armor', 'keyItem' or 'item'. */
    V.itemKind = function(item) {
        if (!item) return 'item';
        if (item.wtypeId !== undefined) return 'weapon';
        if (item.atypeId !== undefined) return 'armor';
        return Number(item.itypeId) === 2 ? 'keyItem' : 'item';
    };

    /** The rewards' items, one entry per kind of thing with how many of it, in the order they were made. */
    V.groupItems = function(items) {
        const out = [], seen = new Map();
        for (const item of Array.isArray(items) ? items : []) {
            if (!item) continue;
            const kind = V.itemKind(item), key = kind + ':' + item.id;
            let entry = seen.get(key);
            if (!entry) {
                entry = { kind, id: Number(item.id) || 0, name: String(item.name || ''), iconIndex: Number(item.iconIndex) || 0, description: String(item.description || ''), count: 0 };
                seen.set(key, entry);
                out.push(entry);
            }
            entry.count++;
        }
        return out;
    };

    /**
     * One actor before and after the rewards, as a summary member. `before`
     * and `after` are snapshots `{ actorId, name, level, exp, params, skills,
     * dead, reserve, faceName, ... }`; `expForLevel(level)` is the actor's own
     * EXP curve and `capped` whether it stands at its last level.
     */
    V.member = function(before, after, expForLevel, capped) {
        const level0 = Math.max(1, Math.floor(Number(before.level) || 1));
        const level1 = Math.max(level0, Math.floor(Number(after.level) || level0));
        const floors = [];
        for (let level = level0; level <= level1 + 1; level++) floors.push(Math.max(0, Number(expForLevel(level)) || 0));
        const known = new Set((before.skills || []).map(skill => skill.id));
        const exp0 = Math.max(0, Number(before.exp) || 0);
        return {
            actorId: after.actorId, name: String(after.name || ''), faceName: after.faceName || '', faceIndex: Number(after.faceIndex) || 0,
            characterName: after.characterName || '', characterIndex: Number(after.characterIndex) || 0, model: after.model || null,
            reserve: !!after.reserve, dead: !!after.dead,
            level0, level1, exp0, exp1: Math.max(exp0, Number(after.exp) || 0), floors, capped: !!capped,
            params0: (before.params || []).slice(0, 8), params1: (after.params || []).slice(0, 8),
            skills: level1 > level0 ? (after.skills || []).filter(skill => !known.has(skill.id)).map(skill => ({ id: skill.id, name: String(skill.name || ''), iconIndex: Number(skill.iconIndex) || 0 })) : []
        };
    };

    /** A member part of the way through the fill (`t` 0 to 1), written into `out`: the level it shows, how full its bar is, the EXP gained so far. */
    V.memberAt = function(member, t, out) {
        const exp = Math.round(member.exp0 + (member.exp1 - member.exp0) * clamp(t, 0, 1));
        const floors = member.floors;
        let index = 0;
        while (index < floors.length - 2 && exp >= floors[index + 1]) index++;
        const floor = floors[index], next = floors[index + 1];
        const last = member.capped && member.level0 + index >= member.level1;
        out.level = member.level0 + index;
        out.exp = exp;
        out.gained = exp - member.exp0;
        out.max = last;
        out.into = Math.max(0, exp - floor);
        out.need = Math.max(1, next - floor);
        out.rate = last ? 1 : clamp(out.into / out.need, 0, 1);
        return out;
    };

    /** The members the Experience page shows: the battle members, then (where the node says so) reserve members who gained EXP. */
    V.shownMembers = function(summary, node) {
        const all = (summary && summary.members) || [];
        return all.filter(member => !member.reserve || ((!node || node.showReserve !== false) && member.exp1 > member.exp0));
    };

    V.leveled = summary => ((summary && summary.members) || []).filter(member => member.level1 > member.level0);

    /** How many reward cards there are: the gold, when there is any, and one per kind of thing found. */
    V.rewardCount = summary => (summary && summary.gold > 0 ? 1 : 0) + ((summary && summary.items) || []).length;

    //-------------------------------------------------------------------------
    // Pages. One page kind per victory node the record has: Experience always,
    // Level Up when someone gained a level, Rewards when something was found.
    // A kind takes as many pages as its node needs to show everything.

    /**
     * The pages of a summary under a record's nodes: `[{ kind, from, count,
     * frames }]`. `sizeOf(node)` gives a node's contents `{ width, height }`.
     * A record with none of the three nodes still has one page.
     */
    V.pages = function(nodes, summary, sizeOf) {
        const out = [];
        const first = type => (nodes || []).find(node => node && node.type === type) || null;
        const split = (kind, total, per, frames) => {
            per = Math.max(1, per);
            for (let from = 0; from < total; from += per) out.push({ kind, from, count: Math.min(per, total - from), frames });
        };
        const party = first('victoryParty'), levels = first('victoryLevels'), rewards = first('victoryRewards');
        if (party) {
            const members = V.shownMembers(summary, party), size = sizeOf(party);
            const grid = V.partyGrid(party, size.width, size.height, members.length);
            const before = out.length;
            split('exp', members.length, grid.per, 0);
            // A page whose members all gained nothing has nothing to fill.
            for (let i = before; i < out.length; i++) {
                const page = out[i];
                if (members.slice(page.from, page.from + page.count).some(member => member.exp1 > member.exp0)) page.frames = party.fillFrames;
            }
        }
        if (levels) {
            const size = sizeOf(levels);
            split('levelUp', V.leveled(summary).length, V.levelsGrid(levels, size.width, size.height, V.leveled(summary).length).per, 0);
        }
        if (rewards) {
            const size = sizeOf(rewards);
            split('rewards', V.rewardCount(summary), V.rewardsGrid(rewards, size.width, size.height).per, 0);
        }
        if (!out.length) out.push({ kind: 'exp', from: 0, count: 0, frames: 0 });
        return out;
    };

    //-------------------------------------------------------------------------
    // A run: where the player is in the pages, and how far the fill has come.
    // `step` is one frame of it.

    V.EVENT_LEVEL = 1;
    V.EVENT_PAGE = 2;
    V.EVENT_CLOSE = 4;
    V.EVENT_SKIP = 8;

    V.newRun = function(summary, pages, node) {
        const members = V.shownMembers(summary, node);
        return {
            summary, pages, members, index: 0, frame: 0, rest: 0, lock: V.LOCK_FRAMES, closed: false,
            // The level each member was last shown at, and the frame its Level Up mark began.
            levels: members.map(member => member.level0), pops: members.map(() => -1), scratch: {}
        };
    };

    V.page = run => run.pages[run.index];
    V.isLastPage = run => run.index >= run.pages.length - 1;
    /** Whether the page's bars are still filling (a key finishes that before it moves on). */
    V.isFilling = run => run.frame < V.page(run).frames;
    /** Whether the page still has something moving, so it must be drawn again: the fill, or a Level Up mark settling. */
    V.isAnimating = function(run) {
        const page = V.page(run);
        if (run.frame < page.frames) return true;
        if (page.kind !== 'exp') return false;
        for (let i = page.from; i < page.from + page.count; i++) if (run.pops[i] >= 0 && run.frame - run.pops[i] < V.POP_FRAMES) return true;
        return false;
    };
    /** How far the page's fill has come, 0 to 1: it starts gently and settles into place. */
    V.progress = function(run) {
        const page = V.page(run);
        if (!(page.frames > 0)) return 1;
        const t = clamp(run.frame / page.frames, 0, 1);
        return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    };

    /** The levels the members on the page show now; a member that shows a higher one than before starts its mark. Returns whether any did. */
    function announce(run) {
        const page = V.page(run);
        if (page.kind !== 'exp') return false;
        const t = V.progress(run);
        let any = false;
        for (let i = page.from; i < page.from + page.count; i++) {
            const level = V.memberAt(run.members[i], t, run.scratch).level;
            if (level > run.levels[i]) { run.levels[i] = level; run.pops[i] = run.frame; any = true; }
        }
        return any;
    }

    function openPage(run, index) {
        run.index = clamp(index, 0, run.pages.length - 1);
        run.frame = 0;
        run.rest = 0;
        run.lock = V.LOCK_FRAMES;
    }

    function finishPage(run) {
        const page = V.page(run);
        // The marks of a fill that was cut short are shown settled.
        run.frame = Math.max(run.frame, page.frames + V.POP_FRAMES);
        let any = false;
        if (page.kind === 'exp') {
            for (let i = page.from; i < page.from + page.count; i++) {
                const member = run.members[i];
                if (member.level1 > run.levels[i]) { run.levels[i] = member.level1; any = true; }
                if (member.level1 > member.level0 && run.pops[i] < 0) run.pops[i] = 0;
            }
        }
        return any;
    }

    /**
     * One frame. `input` is `{ ok, cancel, held }`: OK finishes a fill that
     * is running and otherwise moves on (closing after the last page), Cancel
     * goes straight to the last page and closes from there, and a held key
     * runs the fill faster and moves on by itself. A press in the first
     * moments of a page, or just after one cut a fill short, is not heard.
     * Returns the EVENT_ bits of what happened: a level gained (its sound),
     * a page turned, the close.
     */
    V.step = function(run, input) {
        if (run.closed) return 0;
        let events = 0;
        const ok = !!(input && input.ok), cancel = !!(input && input.cancel), held = !!(input && input.held);
        if (run.lock > 0) { run.lock--; }
        else if (cancel) {
            if (V.isLastPage(run) && !V.isFilling(run)) { run.closed = true; return V.EVENT_CLOSE; }
            // Every page passed over still gives what it would have announced.
            let any = false;
            for (let index = run.index; index < run.pages.length; index++) { run.index = index; any = finishPage(run) || any; }
            run.rest = 0;
            run.lock = V.LOCK_FRAMES;
            return V.EVENT_PAGE | V.EVENT_SKIP | (any ? V.EVENT_LEVEL : 0);
        } else if (ok || (held && !V.isAnimating(run) && run.rest >= V.HOLD_FRAMES)) {
            if (V.isFilling(run)) { run.lock = V.LOCK_FRAMES; return V.EVENT_SKIP | (finishPage(run) ? V.EVENT_LEVEL : 0); }
            if (V.isLastPage(run)) { run.closed = true; return V.EVENT_CLOSE; }
            openPage(run, run.index + 1);
            return V.EVENT_PAGE;
        }
        if (V.isAnimating(run)) {
            const page = V.page(run);
            // A held key runs the fill faster, never past its end in one step.
            const speed = held && run.frame < page.frames ? Math.min(V.FAST, page.frames - run.frame) : 1;
            run.frame += Math.max(1, speed);
            if (announce(run)) events |= V.EVENT_LEVEL;
        } else {
            run.rest++;
        }
        return events;
    };

    //-------------------------------------------------------------------------
    // Drawing. A theme is the Tactical HUD's (fonts, colors, pictures) with
    //   terms: { level, exp (abbreviated), expName, currency, params: [8 names], obtainExp, obtainGold }
    //   own: the project's System.json `reactorBattle.terms`

    function rgba(hex, alpha) {
        if (!isHex(hex)) return 'rgba(255,255,255,' + alpha + ')';
        return 'rgba(' + parseInt(hex.slice(1, 3), 16) + ',' + parseInt(hex.slice(3, 5), 16) + ',' + parseInt(hex.slice(5, 7), 16) + ',' + alpha + ')';
    }
    V.rgba = rgba;

    /** A panel a member, a level-up or a reward stands on: a soft fill in its color and a thin border. */
    function card(ctx, x, y, w, h, radius, color, strong) {
        const fill = ctx.createLinearGradient(x, y, x, y + h);
        fill.addColorStop(0, rgba(color, strong ? 0.3 : 0.2));
        fill.addColorStop(1, rgba(color, 0.05));
        rounded(ctx, x, y, w, h, radius);
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.fill();
        ctx.fillStyle = fill;
        ctx.fill();
        rounded(ctx, x + 0.5, y + 0.5, w - 1, h - 1, radius);
        ctx.strokeStyle = rgba(color, strong ? 0.9 : 0.4);
        ctx.lineWidth = strong ? 2 : 1;
        ctx.stroke();
    }

    function icon(ctx, theme, index, x, y, size) {
        const sheet = theme.icons ? theme.icons() : false;
        if (!sheet || !(index > 0)) return sheet !== null;
        const cell = theme.iconSize || 32;
        const smooth = ctx.imageSmoothingEnabled;
        ctx.imageSmoothingEnabled = size % cell !== 0;
        ctx.drawImage(sheet, (index % 16) * cell, Math.floor(index / 16) * cell, cell, cell, x, y, size, size);
        ctx.imageSmoothingEnabled = smooth;
        return true;
    }

    /** A coin, for a project whose icon sheet has none chosen for gold. */
    function coin(ctx, x, y, size, color) {
        const r = size / 2;
        ctx.save();
        ctx.beginPath();
        ctx.arc(x + r, y + r, r * 0.86, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
        ctx.lineWidth = Math.max(1, size * 0.08);
        ctx.strokeStyle = 'rgba(0,0,0,0.45)';
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(x + r, y + r, r * 0.52, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255,255,255,0.55)';
        ctx.stroke();
        ctx.restore();
    }

    /** Text with its codes taken out, its spaces kept. */
    V.strip = function(value) {
        return String(value == null ? '' : value).replace(/\\[A-Za-z]+\[[^\]]*\]/g, '').replace(/\\[{}.|!><^$]/g, '').replace(/\\\\/g, '\\');
    };

    /** Text as plain words on one line (a description may color a word or draw an icon; here it is the words alone). */
    V.plain = function(value) {
        return V.strip(value).replace(/\s*\n\s*/g, ' ').trim();
    };

    const ICON_CODE = /\\i\[(\d+)\]/gi;
    const pieces = [], widths = [];
    /**
     * One line that may carry the game's icon code (a project's EXP term may
     * be `\i[305] Knowledge`): each icon is drawn in line at the text's
     * height, any other code is dropped. Text with no code is written as it is.
     */
    function rich(ctx, theme, value, x, y, w, h, align, color, size, bold) {
        value = String(value == null ? '' : value);
        if (value.indexOf('\\') < 0) { write(ctx, theme, value, x, y, w, h, align, color, size, bold); return; }
        pieces.length = 0;
        widths.length = 0;
        ICON_CODE.lastIndex = 0;
        let last = 0;
        for (let match = ICON_CODE.exec(value); match; match = ICON_CODE.exec(value)) {
            pieces.push(V.strip(value.slice(last, match.index)), Number(match[1]));
            last = ICON_CODE.lastIndex;
        }
        pieces.push(V.strip(value.slice(last)));
        ctx.font = theme.font(size, !!bold);
        const side = Math.round(size * 1.2);
        let total = 0;
        for (let i = 0; i < pieces.length; i++) {
            const width = typeof pieces[i] === 'number' ? side : pieces[i] ? ctx.measureText(pieces[i]).width : 0;
            widths.push(width);
            total += width;
        }
        // Too long for its room: every part gives way alike.
        const squeeze = total > w && total > 0 ? w / total : 1;
        let cx = align === 'center' ? x + (w - total * squeeze) / 2 : align === 'right' ? x + w - total * squeeze : x;
        for (let i = 0; i < pieces.length; i++) {
            const width = widths[i] * squeeze;
            if (typeof pieces[i] === 'number') icon(ctx, theme, pieces[i], Math.round(cx), Math.round(y + (h - side * squeeze) / 2), Math.round(side * squeeze));
            else if (pieces[i]) write(ctx, theme, pieces[i], cx, y, width + 1, h, 'left', color, size, bold);
            cx += width;
        }
    }
    V.rich = rich;

    /** Words broken into at most `max` lines that fit `width`, the last one cut with an ellipsis. `ctx.font` is set by the caller. */
    V.wrap = function(ctx, value, width, max, out) {
        out = out || [];
        out.length = 0;
        const words = V.plain(value).split(' ').filter(Boolean);
        let line = '';
        for (let i = 0; i < words.length; i++) {
            const next = line ? line + ' ' + words[i] : words[i];
            if (!line || ctx.measureText(next).width <= width) { line = next; continue; }
            if (out.length === max - 1) {
                // No room for another line: the rest is cut.
                let cut = line + ' ' + words[i];
                while (cut.length > 1 && ctx.measureText(cut + '…').width > width) cut = cut.slice(0, -1).trimEnd();
                out.push(cut + '…');
                return out;
            }
            out.push(line);
            line = words[i];
        }
        if (line) out.push(line);
        return out;
    };

    const portraitView = { faceName: '', faceIndex: 0, characterName: '', characterIndex: 0, model: null, battlerName: '', name: '' };
    /** A member's picture: its face, else a portrait of its model, else its map sprite, else its initials. False while it loads. */
    function portrait(ctx, x, y, size, member, theme, color, dim) {
        if (!F) return true;
        portraitView.faceName = member.faceName; portraitView.faceIndex = member.faceIndex;
        portraitView.characterName = member.characterName; portraitView.characterIndex = member.characterIndex;
        portraitView.model = member.model; portraitView.name = member.name;
        ctx.save();
        // A fallen member's picture is gray.
        if (dim && 'filter' in ctx) ctx.filter = 'grayscale(1) brightness(0.7)';
        const ready = F.drawPortrait(ctx, x, y, size, portraitView, theme, color, Math.max(1, Math.round(size / 48)), null);
        ctx.restore();
        return ready;
    }

    //--- Party Experience ----------------------------------------------------

    // A member's card at its base size, and how far its parts may grow on a node this tall.
    const CARD_WIDTH = 190, CARD_HEIGHT = 250;
    const cardGrowth = height => clamp(height / 340, 1.6, 2);
    let partyDefaults = null;

    /**
     * How the members are laid out in `width` x `height`: `{ cols, rows, per
     * (members a page holds), cellWidth, cellHeight, gap, most (how far a
     * card's parts may grow) }`, written into `out` when one is given. Of
     * the numbers of rows that hold everyone, the one that shows a card
     * largest: three members stand side by side, eight in two rows of four.
     * More pages where no number of rows holds them. A card is no taller
     * than its parts need, so the rows stand in the middle of the node.
     */
    V.partyGrid = function(node, width, height, count, out) {
        out = out || {};
        const gap = Math.round(clamp(width * 0.014, 6, 16));
        const minWidth = 132, minHeight = 128;
        const fit = Math.max(1, Math.floor((width + gap) / (minWidth + gap)));
        const maxRows = Math.max(1, Math.floor((height + gap) / (minHeight + gap)));
        const total = Math.max(1, count);
        const most = cardGrowth(height);
        let cols, rows;
        if (node && node.columns > 0) {
            cols = Math.min(node.columns, fit);
            rows = Math.min(maxRows, Math.ceil(total / cols));
        } else {
            // From the fewest rows that hold everyone: another row only where it shows the cards clearly larger.
            rows = Math.min(maxRows, Math.ceil(total / fit));
            let best = 0;
            for (let r = rows; r <= Math.min(maxRows, total); r++) {
                const c = Math.min(fit, Math.ceil(total / r));
                const h = Math.floor((height - gap * (r - 1)) / r);
                const w = Math.min(Math.floor((width - gap * (c - 1)) / c), Math.round(h * 1.15));
                const unit = Math.min(w / CARD_WIDTH, Math.min(h, Math.round(w * 1.5)) / CARD_HEIGHT, most);
                if (unit > best * 1.05) { best = unit; rows = r; }
            }
            cols = Math.min(fit, Math.ceil(Math.min(total, fit * rows) / rows));
        }
        const per = cols * rows;
        rows = Math.min(rows, Math.max(1, Math.ceil(Math.min(total, per) / cols)));
        let cellHeight = Math.floor((height - gap * (rows - 1)) / rows);
        // A card is never much wider than it is tall, nor much taller than it is wide: the row is centered instead.
        let cellWidth = Math.min(Math.floor((width - gap * (cols - 1)) / cols), Math.round(cellHeight * 1.15));
        cellHeight = Math.min(cellHeight, Math.round(cellWidth * 1.5));
        // Nor taller than its parts need with room round them (a portrait is only drawn so large).
        const card = V.partyCard(node || partyDefaults || (partyDefaults = V.defaultProps('victoryParty')), cellWidth, cellHeight, cardAt, most);
        cellHeight = Math.min(cellHeight, card.block + card.pad * 4);
        cellWidth = Math.min(cellWidth, Math.round(cellHeight * 1.15));
        out.cols = cols; out.rows = rows; out.per = per; out.cellWidth = cellWidth; out.cellHeight = cellHeight; out.gap = gap; out.most = most;
        return out;
    };

    /** Where the `index`-th of `count` cards on a page sits, written into `out` (`x`, `y`): rows centered, the block centered top to bottom. */
    V.gridCell = function(grid, width, height, index, count, out) {
        const rows = Math.max(1, Math.ceil(count / grid.cols));
        const row = Math.floor(index / grid.cols), col = index % grid.cols;
        const inRow = row === rows - 1 ? count - row * grid.cols : grid.cols;
        const rowWidth = inRow * grid.cellWidth + (inRow - 1) * grid.gap;
        const blockHeight = rows * grid.cellHeight + (rows - 1) * grid.gap;
        out.x = Math.round((width - rowWidth) / 2) + col * (grid.cellWidth + grid.gap);
        out.y = Math.round((height - blockHeight) / 2) + row * (grid.cellHeight + grid.gap);
        return out;
    };

    /**
     * Where a member card's parts sit inside `w` x `h`, written into `out`;
     * `block` is the height they take together. `most` is how far they may
     * grow past their base size (the grid's, for the node's height).
     */
    V.partyCard = function(node, w, h, out, most) {
        most = most > 0 ? most : 1.6;
        const unit = clamp(Math.min(w / CARD_WIDTH, h / CARD_HEIGHT), 0.6, most);
        const pad = Math.round(10 * unit);
        const name = Math.max(12, Math.round(20 * unit)), small = Math.max(11, Math.round(16 * unit)), tiny = Math.max(10, Math.round(12 * unit));
        const nameLine = Math.round(name * 1.4), smallLine = Math.round(small * 1.45), bar = Math.max(12, Math.round(18 * unit));
        const text = nameLine + (node.showLevel ? smallLine : 0) + (node.showGain ? smallLine : 0) + (node.showBar ? bar + Math.round(6 * unit) : 0);
        // A face is drawn at most half again as large as its picture on a small screen, twice on a large one.
        let face = node.showPortrait ? Math.min(w - pad * 2, h - pad * 3 - text, Math.round(135 * Math.min(1, unit) * most)) : 0;
        if (face < 32) face = 0;
        const block = face + (face ? pad : 0) + text;
        let y = Math.max(pad, Math.round((h - block) / 2));
        out.pad = pad; out.unit = unit; out.name = name; out.small = small; out.tiny = tiny; out.block = block;
        out.face = face; out.faceX = Math.round((w - face) / 2); out.faceY = y;
        if (face) y += face + pad;
        out.nameY = y; out.nameLine = nameLine; y += nameLine;
        out.levelY = y; out.smallLine = smallLine; if (node.showLevel) y += smallLine;
        out.gainY = y; if (node.showGain) y += smallLine;
        out.barX = pad; out.barY = y + Math.round(3 * unit); out.barWidth = w - pad * 2; out.barHeight = bar;
        return out;
    };

    const cellAt = { x: 0, y: 0 }, cardAt = {}, gridAt = {}, shown = {};

    /**
     * The Experience page: the members of `page` (`{ from, count }` into
     * `run.members`) at the run's point in the fill. `part` is 'static' (the
     * cards, pictures and names), 'moving' (levels, numbers, bars and marks,
     * what a frame of the fill changes) or 'all'. Returns false while a
     * picture is still loading.
     */
    V.drawParty = function(ctx, width, height, node, run, page, theme, part) {
        pen();
        const members = run.members, count = page.count;
        const grid = V.partyGrid(node, width, height, members.length, gridAt);
        const w = grid.cellWidth, h = grid.cellHeight;
        // Every card of the page is laid out alike.
        const c = V.partyCard(node, w, h, cardAt, grid.most);
        const t = V.page(run) === page ? V.progress(run) : 1;
        const fixed = part !== 'moving', moving = part !== 'static';
        let ready = true;
        for (let i = 0; i < count; i++) {
            const index = page.from + i, member = members[index];
            V.gridCell(grid, width, height, i, count, cellAt);
            const x = cellAt.x, y = cellAt.y;
            V.memberAt(member, t, shown);
            const up = shown.level > member.level0;
            const accent = member.dead ? '#8a8f9a' : node.barColor2;
            if (fixed) {
                card(ctx, x, y, w, h, Math.round(8 * c.unit), accent, false);
                if (c.face) ready = portrait(ctx, x + c.faceX, y + c.faceY, c.face, member, theme, accent, member.dead) && ready;
                write(ctx, theme, member.name, x + c.pad, y + c.nameY, w - c.pad * 2, c.nameLine, 'center', member.dead ? theme.deathColor : theme.textColor, c.name, true);
            }
            if (!moving) continue;
            if (up) {
                rounded(ctx, x + 1, y + 1, w - 2, h - 2, Math.round(8 * c.unit));
                ctx.strokeStyle = node.levelUpColor;
                ctx.lineWidth = 2;
                ctx.stroke();
            }
            if (node.showLevel) {
                rich(ctx, theme, theme.terms.level + ' ' + shown.level, x + c.pad, y + c.levelY, w - c.pad * 2, c.smallLine, 'center', up ? node.levelUpColor : theme.systemColor, c.small, up);
            }
            if (node.showGain) {
                const gain = V.label(node, 'gained', theme).replace('%1', shown.gained).replace('%2', theme.terms.exp);
                ctx.save();
                if (member.exp1 <= member.exp0) ctx.globalAlpha *= 0.5;
                rich(ctx, theme, gain, x + c.pad, y + c.gainY, w - c.pad * 2, c.smallLine, 'center', node.barColor1, c.small, false);
                ctx.restore();
            }
            if (node.showBar) {
                const bx = x + c.barX, by = y + c.barY, bw = c.barWidth, bh = c.barHeight, r = Math.round(bh / 2);
                rounded(ctx, bx, by, bw, bh, r);
                ctx.fillStyle = 'rgba(0,0,0,0.55)';
                ctx.fill();
                const fw = Math.round(bw * shown.rate);
                if (fw > 0) {
                    ctx.save();
                    rounded(ctx, bx, by, bw, bh, r);
                    ctx.clip();
                    const fill = ctx.createLinearGradient(bx, by, bx + bw, by);
                    fill.addColorStop(0, node.barColor1);
                    fill.addColorStop(1, node.barColor2);
                    ctx.fillStyle = fill;
                    ctx.fillRect(bx, by, fw, bh);
                    ctx.fillStyle = 'rgba(255,255,255,0.22)';
                    ctx.fillRect(bx, by, fw, Math.max(1, Math.round(bh * 0.35)));
                    ctx.restore();
                }
                rounded(ctx, bx + 0.5, by + 0.5, bw - 1, bh - 1, r);
                ctx.strokeStyle = 'rgba(255,255,255,0.4)';
                ctx.lineWidth = 1;
                ctx.stroke();
                if (node.showBarNumbers && bh >= 12) {
                    write(ctx, theme, shown.max ? V.label(node, 'max', theme) : shown.into + ' / ' + shown.need, bx, by, bw, bh, 'center', '#ffffff', Math.min(c.tiny, bh - 2), false);
                }
            }
            // The Level Up mark: a plate over the picture's lower edge, large as it lands and then at rest.
            if (up) {
                const since = run.pops[index] >= 0 ? run.frame - run.pops[index] : V.POP_FRAMES;
                const k = clamp(since / V.POP_FRAMES, 0, 1);
                const scale = 1 + 0.6 * (1 - k) * (1 - k);
                const label = V.label(node, 'levelUp', theme);
                const size = Math.max(11, Math.round(c.small * 0.95));
                ctx.save();
                ctx.font = theme.font(size, true);
                const pw = Math.min(w - 4, Math.round(ctx.measureText(label).width + size * 1.4)), ph = Math.round(size * 1.6);
                const cx = x + w / 2, cy = c.face ? y + c.faceY + c.face - ph * 0.35 : y + c.nameY - ph * 0.6;
                ctx.translate(cx, cy);
                ctx.scale(scale, scale);
                rounded(ctx, -pw / 2, -ph / 2, pw, ph, ph / 2);
                ctx.fillStyle = node.levelUpColor;
                ctx.fill();
                ctx.strokeStyle = 'rgba(0,0,0,0.5)';
                ctx.lineWidth = 1.5;
                ctx.stroke();
                ctx.textAlign = 'center';
                ctx.textBaseline = 'alphabetic';
                ctx.fillStyle = '#1b1b1f';
                ctx.fillText(label, 0, Math.round(size * 0.36), pw - 6);
                ctx.restore();
            }
        }
        return ready;
    };

    //--- Level Up ------------------------------------------------------------

    /** How the Level Up rows are laid out: `{ per (rows a page holds), rowHeight, gap, font, line, pad }`. */
    V.levelsGrid = function(node, width, height, count) {
        const unit = clamp(Math.min(width / 760, height / 420), 0.72, 1.5);
        const font = clamp(Math.round(17 * unit), 12, 26), line = Math.round(font * 1.5), pad = Math.round(10 * unit), gap = Math.round(8 * unit);
        // Four lines hold eight parameters in two columns; fewer are needed with them off.
        const textLines = node && node.showParams === false ? 3 : 4;
        const minimum = pad * 2 + line * textLines;
        const per = Math.max(1, Math.floor((height + gap) / (minimum + gap)));
        const rows = Math.max(1, Math.min(per, count || 1));
        const rowHeight = Math.min(Math.floor((height - gap * (rows - 1)) / rows), Math.round(minimum * 1.6));
        return { per, rows, rowHeight, gap, font, line, pad, unit };
    };

    const lines = [];

    /** The Level Up page: one row per actor of `page` among those who gained a level. */
    V.drawLevels = function(ctx, width, height, node, summary, page, theme) {
        pen();
        const all = V.leveled(summary);
        const count = Math.min(page.count, Math.max(0, all.length - page.from));
        if (count <= 0) return true;
        const g = V.levelsGrid(node, width, height, count);
        const block = count * g.rowHeight + (count - 1) * g.gap;
        let y = Math.round((height - block) / 2), ready = true;
        const params = (theme.terms && theme.terms.params) || [];
        // Every row of the page is laid out alike: the skills' column is there when any of them learned one.
        const showParams = node.showParams !== false;
        let anySkills = false;
        if (node.showSkills !== false) for (let i = 0; i < count; i++) if (all[page.from + i].skills.length) anySkills = true;
        for (let i = 0; i < count; i++, y += g.rowHeight + g.gap) {
            const member = all[page.from + i], h = g.rowHeight, pad = g.pad;
            card(ctx, 0, y, width, h, Math.round(8 * g.unit), node.levelUpColor, false);
            // Left: the picture, the name, the level before and after.
            const left = showParams || anySkills ? Math.round(clamp(width * 0.27, 120, 300)) : width;
            const face = node.showPortrait ? Math.max(0, Math.min(left - pad * 2, h - pad * 2 - g.line * 2)) : 0;
            const stack = (face >= 32 ? face + Math.round(pad / 2) : 0) + g.line * 2;
            let ty = y + Math.round((h - stack) / 2);
            if (face >= 32) {
                ready = portrait(ctx, Math.round((left - face) / 2), ty, face, member, theme, node.levelUpColor, false) && ready;
                ty += face + Math.round(pad / 2);
            }
            write(ctx, theme, member.name, pad, ty, left - pad * 2, g.line, 'center', theme.textColor, g.font, true);
            rich(ctx, theme, theme.terms.level + ' ' + member.level0 + '  →  ' + member.level1, pad, ty + g.line, left - pad * 2, g.line, 'center', node.levelUpColor, g.font, true);
            if (left >= width) continue;
            const rest = width - left - pad;
            const skillsWidth = anySkills ? (showParams ? Math.round(clamp(rest * 0.36, 110, 320)) : rest) : 0;
            const paramsWidth = showParams ? rest - skillsWidth - (anySkills ? pad : 0) : 0;
            const rule = at => { ctx.fillStyle = 'rgba(255,255,255,0.14)'; ctx.fillRect(at, y + pad, 1, h - pad * 2); };
            // Middle: each parameter, what it is now and what it gained, in two columns no wider than read well.
            if (showParams) {
                rule(left);
                const top = y + Math.round((h - g.line * 4) / 2);
                const used = Math.min(paramsWidth - pad, Math.round(520 * g.unit));
                const colGap = Math.round(pad * 1.8), col = Math.floor((used - colGap) / 2);
                const x0 = left + pad + Math.round((paramsWidth - pad - used) / 2);
                const small = Math.max(11, g.font - 2);
                for (let p = 0; p < 8; p++) {
                    const cx = x0 + (p % 2) * (col + colGap), cy = top + Math.floor(p / 2) * g.line;
                    const now = Number(member.params1[p]) || 0, gain = now - (Number(member.params0[p]) || 0);
                    const valueWidth = Math.round(col * 0.24), gainWidth = Math.round(col * 0.26);
                    rich(ctx, theme, params[p] || '', cx, cy, col - valueWidth - gainWidth - 4, g.line, 'left', theme.systemColor, small, false);
                    write(ctx, theme, String(now), cx + col - valueWidth - gainWidth, cy, valueWidth, g.line, 'right', theme.textColor, small, false);
                    if (gain !== 0) write(ctx, theme, (gain > 0 ? '+' : '') + gain, cx + col - gainWidth, cy, gainWidth, g.line, 'right', gain > 0 ? node.gainColor : theme.deathColor, small, true);
                }
            }
            // Right: the skills learned, each with its icon.
            if (anySkills) {
                const sx0 = left + paramsWidth + (showParams ? pad : 0);
                rule(sx0);
                if (!member.skills.length) continue;
                const sx = sx0 + pad, sw = skillsWidth - pad;
                const fit = Math.max(1, Math.floor((h - pad * 2) / g.line) - 1);
                const listed = member.skills.length > fit ? fit - 1 : member.skills.length;
                const top = y + Math.round((h - g.line * (Math.min(member.skills.length, fit) + 1)) / 2);
                write(ctx, theme, V.label(node, 'learned', theme), sx, top, sw, g.line, 'left', theme.systemColor, Math.max(11, g.font - 2), false);
                const size = Math.min(theme.iconSize || 32, g.line - 2);
                for (let k = 0; k < listed; k++) {
                    const skill = member.skills[k], sy = top + g.line * (k + 1);
                    if (!icon(ctx, theme, skill.iconIndex, sx, sy + Math.round((g.line - size) / 2), size)) ready = false;
                    write(ctx, theme, V.plain(skill.name), sx + size + 6, sy, sw - size - 6, g.line, 'left', theme.textColor, g.font, false);
                }
                if (listed < member.skills.length) {
                    write(ctx, theme, V.label(node, 'more', theme).replace('%1', member.skills.length - listed), sx, top + g.line * (listed + 1), sw, g.line, 'left', theme.systemColor, Math.max(11, g.font - 2), false);
                }
            }
        }
        return ready;
    };

    //--- Rewards -------------------------------------------------------------

    /** How the reward cards are laid out: `{ cols, per (cards a page holds), cardWidth, cardHeight, gap, font, line, small, smallLine, pad }`. */
    V.rewardsGrid = function(node, width, height) {
        const cols = node && node.columns > 0 ? node.columns : width >= 520 ? 2 : 1;
        const unit = clamp(Math.min(width / cols / 420, height / 400), 0.72, 1.5);
        const font = clamp(Math.round(19 * unit), 13, 26), line = Math.round(font * 1.45);
        const small = node && node.descriptionSize > 0 ? node.descriptionSize : Math.max(11, Math.round(font * 0.76)), smallLine = Math.round(small * 1.4);
        const pad = Math.round(9 * unit), gap = Math.round(8 * unit);
        const described = !node || node.showDescription !== false;
        const cardHeight = pad * 2 + line + (described ? smallLine * 2 : 0);
        const rows = Math.max(1, Math.floor((height + gap) / (cardHeight + gap)));
        return { cols, rows, per: rows * cols, cardWidth: Math.floor((width - gap * (cols - 1)) / cols), cardHeight, gap, font, line, small, smallLine, pad, unit, described };
    };

    /** The reward at `index` of the page list, written into `out`: the gold first where there is any, then the things found. */
    V.rewardAt = function(summary, index, out) {
        const gold = summary.gold > 0 ? 1 : 0;
        out.gold = gold === 1 && index === 0;
        out.item = out.gold ? null : summary.items[index - gold] || null;
        return out;
    };

    const reward = { gold: false, item: null };

    /** The Rewards page: the gold and what was found, each on a card in its kind's color. */
    V.drawRewards = function(ctx, width, height, node, summary, page, theme) {
        pen();
        const g = V.rewardsGrid(node, width, height);
        let ready = true;
        // The cards stand in the middle of their room, top to bottom; fewer than fill a row stand in its middle too.
        const rows = Math.max(1, Math.ceil(page.count / g.cols));
        const top = Math.max(0, Math.round((height - rows * g.cardHeight - (rows - 1) * g.gap) / 2));
        const shift = page.count < g.cols ? Math.round((g.cols - page.count) * (g.cardWidth + g.gap) / 2) : 0;
        for (let i = 0; i < page.count; i++) {
            V.rewardAt(summary, page.from + i, reward);
            if (!reward.gold && !reward.item) continue;
            const x = shift + (i % g.cols) * (g.cardWidth + g.gap), y = top + Math.floor(i / g.cols) * (g.cardHeight + g.gap);
            const w = g.cardWidth, h = g.cardHeight, pad = g.pad;
            const kind = reward.gold ? 'gold' : reward.item.kind;
            const color = node[kind + 'Color'] || '#ffffff';
            // The card: its kind's color fading to the right, a bar of it down the left edge.
            ctx.save();
            rounded(ctx, x, y, w, h, Math.round(6 * g.unit));
            ctx.clip();
            ctx.fillStyle = 'rgba(0,0,0,0.38)';
            ctx.fillRect(x, y, w, h);
            const fill = ctx.createLinearGradient(x, y, x + w, y);
            fill.addColorStop(0, rgba(color, 0.26));
            fill.addColorStop(0.6, rgba(color, 0.08));
            fill.addColorStop(1, rgba(color, 0.02));
            ctx.fillStyle = fill;
            ctx.fillRect(x, y, w, h);
            ctx.fillStyle = color;
            ctx.fillRect(x, y, Math.max(3, Math.round(4 * g.unit)), h);
            ctx.restore();
            rounded(ctx, x + 0.5, y + 0.5, w - 1, h - 1, Math.round(6 * g.unit));
            ctx.strokeStyle = rgba(color, 0.4);
            ctx.lineWidth = 1;
            ctx.stroke();
            const size = Math.min(theme.iconSize || 32, h - pad * 2, Math.round(32 * Math.max(1, g.unit)));
            const ix = x + pad + Math.round(4 * g.unit), iy = y + pad + Math.max(0, Math.round((g.line - size) / 2));
            if (reward.gold) {
                if (node.goldIcon > 0) { if (!icon(ctx, theme, node.goldIcon, ix, iy, size)) ready = false; }
                else coin(ctx, ix, iy, size, color);
            } else if (!icon(ctx, theme, reward.item.iconIndex, ix, iy, size)) ready = false;
            const tx = ix + size + Math.round(8 * g.unit), tw = x + w - pad - tx;
            // Right of the name: how many, and what kind of thing it is.
            let right = 0;
            if (!reward.gold && reward.item.count > 1) {
                const many = '×' + reward.item.count;
                ctx.font = theme.font(g.font, true);
                right = Math.ceil(ctx.measureText(many).width) + 8;
                write(ctx, theme, many, tx + tw - right, y + pad, right, g.line, 'right', theme.textColor, g.font, true);
            }
            if (node.showKind && !reward.gold) {
                const tag = V.label(node, kind, theme);
                ctx.font = theme.font(g.small, false);
                const tagWidth = Math.min(Math.ceil(ctx.measureText(tag).width) + 8, Math.round(tw * 0.4));
                ctx.save();
                ctx.globalAlpha *= 0.85;
                write(ctx, theme, tag, tx + tw - right - tagWidth, y + pad, tagWidth, g.line, 'right', color, g.small, false);
                ctx.restore();
                right += tagWidth + 6;
            }
            if (reward.gold) rich(ctx, theme, summary.gold + ' ' + theme.terms.currency, tx, y + pad, tw - right, g.line, 'left', color, g.font, true);
            else write(ctx, theme, V.plain(reward.item.name), tx, y + pad, tw - right, g.line, 'left', color, g.font, true);
            if (g.described) {
                const text = reward.gold ? V.label(node, 'gold', theme) : reward.item.description;
                ctx.font = theme.font(g.small, false);
                V.wrap(ctx, text, tw, 2, lines);
                ctx.save();
                ctx.globalAlpha *= 0.88;
                for (let l = 0; l < lines.length; l++) write(ctx, theme, lines[l], tx, y + pad + g.line + l * g.smallLine, tw, g.smallLine, 'left', theme.textColor, g.small, false);
                ctx.restore();
            }
        }
        return ready;
    };

    //--- Victory Text --------------------------------------------------------

    /** What a Victory Text node says on the run's page. */
    V.textOf = function(node, run, theme) {
        const page = V.page(run), summary = run.summary;
        switch (node.victoryText) {
            case 'title': return V.label(node, page.kind === 'levelUp' ? 'levelUpTitle' : page.kind === 'rewards' ? 'rewardsTitle' : 'title', theme);
            case 'hint': return V.isFilling(run) ? '' : V.label(node, V.isLastPage(run) ? 'close' : 'continue', theme);
            case 'page': return run.pages.length > 1 ? V.label(node, 'page', theme).replace('%1', run.index + 1).replace('%2', run.pages.length) : '';
            // The game's own line, with the word it uses there (Terms' EXP, not its abbreviation).
            case 'exp': return summary.exp > 0 ? String(theme.terms.obtainExp || '%1 %2').replace('%1', summary.exp).replace('%2', theme.terms.expName || theme.terms.exp) : '';
            case 'gold': return summary.gold > 0 ? String(theme.terms.obtainGold || '%1').replace('%1', summary.gold).replace(/\\G/gi, theme.terms.currency) : '';
            default: return '';
        }
    };

    V.drawText = function(ctx, width, height, node, value, theme) {
        if (!value) return;
        pen();
        const size = node.fontSize > 0 ? node.fontSize : clamp(Math.round(height * 0.62), 12, 72);
        const color = isHex(node.textColor) ? node.textColor : theme.paletteColor ? theme.paletteColor(Number(node.textColor) || 0) : theme.textColor;
        rich(ctx, theme, value, 0, 0, width, height, node.align || 'center', color, size, !!node.fontBold);
    };

    //-------------------------------------------------------------------------
    // The stock layout: the screen dimmed, one panel in its middle with the
    // page's title on top, the page's own node in its body and what OK does
    // under it. Sizes follow the screen.

    V.stockNodes = function(metrics) {
        const width = Number(metrics && metrics.width) || 816, height = Number(metrics && metrics.height) || 624;
        const k = clamp(height / 720, 0.72, 1.5);
        const px = value => Math.round(value * k);
        const visible = { type: 'always', id: 1, on: true, op: '==', value: 0, script: '' };
        let id = 0;
        const node = (type, name, props) => Object.assign({ id: ++id, type, name, parent: 0, anchor: 'topLeft', x: 0, y: 0, opacity: 255, visible: Object.assign({}, visible) },
            V.defaultProps(type), props);
        const surface = { color: '#000000', color2: '#000000', vertical: true, borderWidth: 0, borderColor: '#ffffff', radius: 0 };
        const panelWidth = Math.min(width - px(32), px(1080)), panelHeight = Math.min(height - px(32), px(600));
        const side = px(24), titleY = px(14), titleHeight = px(48), subHeight = px(28), footer = px(52);
        const bodyWidth = panelWidth - side * 2;
        const backdrop = node('box', 'Backdrop', Object.assign({ width, height, fill: 'color', fillOpacity: 200 }, surface));
        const panel = node('box', 'Panel', Object.assign({ anchor: 'center', width: panelWidth, height: panelHeight, fill: 'window', fillOpacity: 160 }, surface));
        const inPanel = (type, name, props) => node(type, name, Object.assign({ parent: panel.id }, props));
        const expTop = titleY + titleHeight + subHeight + px(8), pageTop = titleY + titleHeight + px(10);
        return [
            backdrop, panel,
            inPanel('victoryText', 'Title', { anchor: 'top', y: titleY, width: bodyWidth, height: titleHeight, victoryText: 'title', fontSize: Math.max(22, px(36)), fontBold: true, textColor: 16 }),
            inPanel('victoryText', 'EXP received', { anchor: 'top', y: titleY + titleHeight, width: bodyWidth, height: subHeight, victoryText: 'exp', victoryPage: 'exp', fontSize: Math.max(13, px(20)) }),
            inPanel('victoryParty', 'Party Experience', { x: side, y: expTop, width: bodyWidth, height: panelHeight - expTop - footer }),
            inPanel('victoryLevels', 'Level Up', { x: side, y: pageTop, width: bodyWidth, height: panelHeight - pageTop - footer }),
            inPanel('victoryRewards', 'Rewards', { x: side, y: pageTop, width: bodyWidth, height: panelHeight - pageTop - footer }),
            inPanel('victoryText', 'What OK does', { anchor: 'bottom', y: -px(12), width: bodyWidth - px(240), height: px(30), victoryText: 'hint', fontSize: Math.max(13, px(18)), textColor: 6 }),
            inPanel('victoryText', 'Page', { anchor: 'bottomRight', x: -side, y: -px(12), width: px(110), height: px(30), victoryText: 'page', align: 'right', fontSize: Math.max(12, px(16)) })
        ];
    };

    /** The stock interface as a whole record (what Stock Layout builds). */
    V.stockRecord = function(metrics) {
        return {
            name: 'Victory', mode: V.MODE, background: 'none', cancel: { type: 'none' }, firstFocus: 0,
            openTransition: 'fade', closeTransition: 'fade', transitionDuration: 14, coordinateSpace: 'screen',
            nodes: V.stockNodes(metrics), stock: V.ROLE, roles: [V.ROLE],
            note: 'Baseline victory screen: the EXP each member gained with a bar that fills, a Level Up page for those who gained a level, and the gold and items found. Bind it as Victory in System 2 or Use As.'
        };
    };

    //-------------------------------------------------------------------------
    // A stand-in battle's rewards from a project's database: what the editor's
    // canvas shows, and what the tests draw.

    /** An actor's total EXP at the start of a level, by its class's curve (the game's own formula). */
    V.expForLevel = function(klass, level) {
        const p = (klass && klass.expParams) || [30, 20, 30, 30];
        const basis = Number(p[0]) || 30, extra = Number(p[1]) || 0, a = Number(p[2]) || 30, b = Number(p[3]) || 30;
        return Math.round(basis * Math.pow(level - 1, 0.9 + a / 250) * level * (level + 1) / (6 + Math.pow(level, 2) / 50 / b) + (level - 1) * extra);
    };

    V.sampleSummary = function(data, options) {
        data = data || {};
        options = options || {};
        const system = data.system || {};
        let actors = (options.party || (Array.isArray(system.partyMembers) ? system.partyMembers.map(id => data.actors && data.actors[id]) : [])).filter(Boolean).slice(0, 8);
        if (!actors.length) actors = [{ id: 1, name: 'Hero', classId: 0, initialLevel: 1 }];
        const named = list => (list || []).filter(entry => entry && entry.name && /^[^\s\-=_#*]/.test(entry.name));
        const classOf = actor => (data.classes && data.classes[actor.classId]) || null;
        const paramsAt = (actor, level) => {
            const klass = classOf(actor);
            return Array.from({ length: 8 }, (_, id) => Number(klass && klass.params && klass.params[id] && klass.params[id][level]) || (id < 2 ? 100 + level * 20 : 10 + level * 2));
        };
        // The first two members gain a level, so the Level Up page has rows to show; the rest gain EXP alone.
        const members = actors.map((actor, index) => {
            const klass = classOf(actor);
            const level = clamp(Math.floor(Number(actor.initialLevel) || 1), 1, 98);
            const floor = V.expForLevel(klass, level), next = V.expForLevel(klass, level + 1), after = V.expForLevel(klass, level + 2);
            const up = index < 2;
            const exp0 = floor + Math.round((next - floor) * (up ? 0.7 : 0.15 + 0.1 * index));
            const exp1 = up ? next + Math.round((after - next) * 0.35) : Math.min(next - 1, exp0 + Math.round((next - floor) * 0.4));
            const learned = up ? ((klass && klass.learnings) || []).filter(entry => entry.level === level + 1).map(entry => data.skills && data.skills[entry.skillId]).filter(Boolean) : [];
            if (up && !learned.length) {
                const later = ((klass && klass.learnings) || []).find(entry => entry.level > level && data.skills && data.skills[entry.skillId]);
                const stand = later ? data.skills[later.skillId] : named(data.skills).find(skill => skill.id > 2 && skill.stypeId > 0);
                if (stand && index === 0) learned.push(stand);
            }
            const snapshot = (lv, exp, skills) => ({
                actorId: actor.id, name: actor.name, level: lv, exp, params: paramsAt(actor, lv), skills, dead: false, reserve: false,
                faceName: actor.faceName || '', faceIndex: Number(actor.faceIndex) || 0, characterName: actor.characterName || '', characterIndex: Number(actor.characterIndex) || 0,
                model: options.modelOf ? options.modelOf(actor) || null : null
            });
            return V.member(snapshot(level, exp0, []), snapshot(up ? level + 1 : level, exp1, learned), lv => V.expForLevel(klass, lv), false);
        });
        const items = [];
        const add = (entry, count) => { for (let i = 0; entry && i < count; i++) items.push(entry); };
        add(named(data.items).find(item => Number(item.itypeId) !== 2), 2);
        add(named(data.weapons)[0], 1);
        add(named(data.armors)[0], 1);
        add(named(data.items).find(item => Number(item.itypeId) === 2), 1);
        if (!items.length) add({ id: 1, name: 'Potion', iconIndex: 0, description: 'Restores HP.', itypeId: 1 }, 2);
        const first = members[0];
        return { exp: Math.max(1, first.exp1 - first.exp0), gold: 120, members, items: V.groupItems(items) };
    };

    root.ReactorVictoryHud = V;
    if (typeof module !== 'undefined' && module.exports) module.exports = V;
})(typeof window !== 'undefined' ? window : globalThis);
