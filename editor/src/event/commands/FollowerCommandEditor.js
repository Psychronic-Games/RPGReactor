/**
 * The Party Followers commands — Reactor commands stored as MZ plugin
 * commands (code 357, plugin "RPGReactor"), read by
 * runtime/reactor_objects_followers.js; a stock MZ runtime ignores them.
 *
 *   ChangeFollowerFormation  the formation, spacing and straggle from now on
 *   FollowerOrders           follow, stay, go to a tile, come back, hide, show:
 *                            to all followers, to one by its place in the
 *                            line, or to one by its actor
 *
 * How many followers a game has is one rule, `followerCount`: the game's
 * party size less the leader, as the game works it out. Every list of
 * followers (here, and Set Movement Route's targets) is made from it.
 *
 * `formOf` reads stored arguments into a plain form and `argsOf` writes a
 * form back; `summary` is the sentence the event list shows; `places` and
 * `picture` draw a formation as dots. None of them touches the DOM.
 */
class FollowerCommandEditor {
    static NAMES = ['ChangeFollowerFormation', 'FollowerOrders'];
    static LABELS = { ChangeFollowerFormation: 'Change Follower Formation', FollowerOrders: 'Follower Orders' };
    /**
     * A follower as Set Movement Route's character: this number plus its
     * place in the line (Game_Followers.CHARACTER_ID in the runtime). An
     * event id no map has, so a stock runtime finds no such event and skips
     * the command; -2, -3, ... (how plugins number followers) are read too.
     */
    static CHARACTER_ID = 1000000;
    static FORMATIONS = [['file', 'Single file'], ['loose', 'Loose'], ['rank', 'Side by side'], ['wedge', 'Wedge'], ['column', 'Column of two'], ['scattered', 'Scattered']];
    /** The sentence of each formation in a list line; `{n}` is the spacing ("2 tiles"). */
    static FORMATION_LINES = {
        file: 'Followers walk in single file, {n} apart', loose: 'Followers walk in a loose file, {n} apart', rank: 'Followers walk side by side, {n} apart',
        wedge: 'Followers walk in a wedge, {n} apart', column: 'Followers walk in a column of two, {n} apart', scattered: 'Followers walk scattered, {n} apart'
    };
    static ORDERS = [['follow', 'Follow'], ['stay', 'Stay here'], ['goto', 'Go to a tile'], ['come', 'Come to the leader'], ['hide', 'Hide'], ['show', 'Show']];
    /** Each order as a sentence, for one follower (`{who}`) and for all of them. */
    static ORDER_LINES = {
        follow: ['{who} follows the leader', 'All followers follow the leader'],
        stay: ['{who} stays here', 'All followers stay here'],
        goto: ['{who} goes to ({x}, {y})', 'All followers go to ({x}, {y})'],
        come: ['{who} comes to the leader', 'All followers come to the leader'],
        hide: ['{who} is hidden', 'All followers are hidden'],
        show: ['{who} is shown', 'All followers are shown']
    };
    static FACINGS = [[0, 'As it arrives'], [2, 'Down'], [4, 'Left'], [6, 'Right'], [8, 'Up']];
    static FACING_LINES = { 2: ', facing down', 4: ', facing left', 6: ', facing right', 8: ', facing up' };

    constructor(databaseManager, projectController) {
        this.databaseManager = databaseManager || null;
        this.projectController = projectController || null;
    }

    static supports(name) {
        return FollowerCommandEditor.NAMES.includes(name);
    }

    static _t(text, params) {
        if (typeof window === 'undefined' || !window.I18n) {
            return params ? String(text).replace(/\{(\w+)\}/g, (m, key) => (key in params ? String(params[key]) : m)) : text;
        }
        return params ? window.I18n.formatText(text, params) : window.I18n.tText(text);
    }

    _t(text, params) {
        return FollowerCommandEditor._t(text, params);
    }

    //-------------------------------------------------------------------------
    // How many followers the game has.

    /**
     * The game's party size, as Game_Party.maxBattleMembers answers it in a
     * running game: Database > System 1's Max Battle Members where it is set,
     * else the battle settings' party size, else a party plugin's, else four.
     */
    static partySize(system, plugins) {
        const members = system ? system.maxBattleMembers : undefined;
        if (Number.isInteger(members) && members >= 1 && members <= 99) return members;
        const size = Math.floor(Number(system && system.reactorBattle && system.reactorBattle.partySize) || 0);
        if (size > 0) return Math.min(size, 99);
        const data = typeof ReactorBattleData !== 'undefined' ? ReactorBattleData : null;
        return data && typeof data.maxBattleMembers === 'function' ? data.maxBattleMembers(system || {}, plugins || []) : 4;
    }

    /** The followers the game has: its party size less the leader. */
    static followerCount(system, plugins) {
        return Math.max(0, FollowerCommandEditor.partySize(system, plugins) - 1);
    }

    /** The place in the line (1 the first follower) a route's character id names; 0 for the player, an event, this event. */
    static placeOfCharacterId(id) {
        id = Number(id);
        if (id <= -2) return Math.floor(-id) - 1;
        if (id > FollowerCommandEditor.CHARACTER_ID) return Math.floor(id) - FollowerCommandEditor.CHARACTER_ID;
        return 0;
    }

    /** "Follower 3", or "Follower 6 (beyond the party's size)" for a place the game's party no longer has. */
    static followerLabel(place, count) {
        const t = FollowerCommandEditor._t;
        return place > count ? t("Follower {n} (beyond the party's size)", { n: place }) : t('Follower {n}', { n: place });
    }

    /**
     * Set Movement Route's follower targets as `{ value, label, place }`:
     * Follower 1 to Follower `count`, each under the id the editor writes.
     * The id the command holds now is kept as it is: one written the way
     * plugins number followers stands for its place, and one beyond `count`
     * is listed after the rest, marked.
     */
    static routeTargets(count, characterId) {
        const F = FollowerCommandEditor, stored = F.placeOfCharacterId(characterId);
        const targets = [];
        for (let place = 1; place <= count; place++) {
            targets.push({ value: place === stored ? Number(characterId) : F.CHARACTER_ID + place, label: F.followerLabel(place, count), place });
        }
        if (stored > count) targets.push({ value: Number(characterId), label: F.followerLabel(stored, count), place: stored });
        return targets;
    }

    /** The name of a route's target where it is a follower; '' for any other character. */
    static routeTargetName(characterId, count) {
        const place = FollowerCommandEditor.placeOfCharacterId(characterId);
        return place > 0 ? FollowerCommandEditor.followerLabel(place, count) : '';
    }

    /**
     * What the forms and the list lines look things up in: `{ system,
     * plugins, actors, map, count }`. Anything given in `overrides` wins;
     * the rest comes from the running editor.
     */
    static context(overrides) {
        const given = overrides || {};
        const app = typeof window !== 'undefined' && window.reactor ? window.reactor : null;
        const manager = given.databaseManager || (app && app.databaseManager) || null;
        const data = (manager && manager.data) || {};
        let plugins = [];
        try { plugins = manager && manager.getPluginManifest ? manager.getPluginManifest() : []; } catch (e) { plugins = []; }
        const context = {
            system: (manager && manager.getSystem ? manager.getSystem() : data.system) || null,
            plugins, actors: data.actors || null,
            map: app && app.eventManager ? app.eventManager.currentMap : null
        };
        for (const key of Object.keys(given)) if (key !== 'databaseManager' && given[key] !== undefined) context[key] = given[key];
        if (context.count === undefined) context.count = FollowerCommandEditor.followerCount(context.system, context.plugins);
        return context;
    }

    //-------------------------------------------------------------------------
    // Formations as pictures.

    /**
     * The places of a formation for `count` followers as `[row, right]`
     * pairs in units of the spacing, the leader at `[0, 0]`: the table the
     * game walks by (Game_Followers.places in the runtime).
     */
    static places(formation, count) {
        const list = [];
        const fillRow = (row, first, step, size, members, outer) => {
            const middle = size % 2 === 1 ? first + step * ((size - 1) / 2) : null;
            const pairs = Math.floor(size / 2);
            let left = members;
            if (members % 2 === 1 && middle !== null) { list.push([row, middle]); left--; }
            for (let n = 0; n < pairs && left > 0; n++) {
                const k = outer ? n : pairs - 1 - n;
                list.push([row, first + step * k]);
                left--;
                if (left > 0) { list.push([row, first + step * (size - 1 - k)]); left--; }
            }
        };
        if (formation === 'rank') {
            for (let row = 1, left = count; left > 0; row++, left -= 5) fillRow(row, -2, 1, 5, Math.min(5, left), false);
        } else if (formation === 'wedge') {
            for (let row = 1, left = count; left > 0; left -= row + 1, row++) fillRow(row, -row, 2, row + 1, Math.min(row + 1, left), true);
        } else if (formation === 'column') {
            for (let j = 0; j < count; j++) list.push([Math.floor((j + 1) / 2), (j + 1) % 2]);
        } else {
            for (let j = 0; j < count; j++) list.push([j + 1, 0]);
        }
        return list;
    }

    /** Where a picture puts the leader's three followers: the formation's places, a loose file's uneven gaps, a scatter. */
    static picturePlaces(formation) {
        if (formation === 'loose') return [[1.2, 0], [2.6, 0], [3.5, 0]];
        if (formation === 'scattered') return [[1.1, -1.2], [1.9, 0.9], [3, -0.3]];
        return FollowerCommandEditor.places(formation, 3);
    }

    /**
     * A formation as a small picture of dots: the leader (larger, with the
     * way it walks above it) and three followers. SVG markup; the colours
     * are the theme's.
     */
    static picture(formation, width = 56, height = 56) {
        const dots = FollowerCommandEditor.picturePlaces(formation);
        const step = 11, cx = width / 2 - (formation === 'column' ? step / 2 : 0), top = 13;
        const leader = `<path d="M ${cx} ${top - 9} l 4 5 h -8 z" fill="var(--color-accent-bright)"/><circle cx="${cx}" cy="${top}" r="4.2" fill="var(--color-accent-bright)"/>`;
        const followers = dots.map(([row, right]) => `<circle cx="${Math.round((cx + right * step) * 10) / 10}" cy="${Math.round((top + row * step) * 10) / 10}" r="3.2" fill="var(--color-text)"/>`).join('');
        return `<svg class="follower-formation-picture" data-formation="${formation}" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" aria-hidden="true">${leader}${followers}</svg>`;
    }

    //-------------------------------------------------------------------------
    // The forms.

    static _int(value) {
        return Math.floor(Number(value) || 0);
    }

    static _bool(value) {
        return value === true || value === 'true';
    }

    /** A command's arguments as its form. Missing arguments take the dialog's starting values. */
    static formOf(name, args) {
        const F = FollowerCommandEditor, a = args && typeof args === 'object' ? args : {};
        if (name === 'ChangeFollowerFormation') {
            const known = F.FORMATIONS.some(([key]) => key === a.formation);
            return {
                formation: known ? a.formation : (args ? 'default' : 'wedge'),
                spacing: Math.max(1, Math.min(4, F._int(a.spacing) || 1)),
                straggle: Math.max(0, Math.min(100, F._int(a.straggle)))
            };
        }
        const who = a.who === 'follower' || a.who === 'actor' ? a.who : 'all';
        const direction = F._int(a.direction);
        return {
            who,
            index: Math.max(1, F._int(a.index) || 1),
            actorId: Math.max(1, F._int(a.actorId) || 1),
            order: F.ORDERS.some(([key]) => key === a.order) ? a.order : 'follow',
            x: Math.max(0, F._int(a.x)), y: Math.max(0, F._int(a.y)),
            direction: [2, 4, 6, 8].includes(direction) ? direction : 0,
            wait: args ? F._bool(a.wait) : true
        };
    }

    /** A form as the arguments the command stores: only what its choices need. Arguments the form does not show are kept. */
    static argsOf(name, stored, form) {
        const F = FollowerCommandEditor, args = Object.assign({}, stored || {});
        if (name === 'ChangeFollowerFormation') {
            for (const key of ['formation', 'spacing', 'straggle']) delete args[key];
            if (!F.FORMATIONS.some(([key]) => key === form.formation)) return Object.assign(args, { formation: 'default' });
            return Object.assign(args, { formation: form.formation, spacing: Math.max(1, Math.min(4, F._int(form.spacing) || 1)), straggle: Math.max(0, Math.min(100, F._int(form.straggle))) });
        }
        for (const key of ['who', 'index', 'actorId', 'order', 'x', 'y', 'direction', 'wait']) delete args[key];
        args.who = form.who === 'follower' || form.who === 'actor' ? form.who : 'all';
        if (args.who === 'follower') args.index = Math.max(1, F._int(form.index) || 1);
        if (args.who === 'actor') args.actorId = Math.max(1, F._int(form.actorId) || 1);
        args.order = F.ORDERS.some(([key]) => key === form.order) ? form.order : 'follow';
        if (args.order === 'goto') {
            args.x = Math.max(0, F._int(form.x));
            args.y = Math.max(0, F._int(form.y));
            args.direction = [2, 4, 6, 8].includes(F._int(form.direction)) ? F._int(form.direction) : 0;
        }
        if (args.order === 'goto' || args.order === 'come') args.wait = !!form.wait;
        return args;
    }

    /** The command an argument object builds, for saving and for tests. */
    static build(name, args, indent = 0) {
        const F = FollowerCommandEditor;
        if (!F.supports(name)) return null;
        const saved = F.argsOf(name, args, F.formOf(name, args || {}));
        return { code: 357, indent: indent || 0, parameters: ['RPGReactor', name, F.LABELS[name], saved] };
    }

    /** "1 tile", "2 tiles". */
    static tiles(n) {
        return n === 1 ? FollowerCommandEditor._t('1 tile') : FollowerCommandEditor._t('{n} tiles', { n });
    }

    /** Who an order is for, as the list line names it. */
    static whoName(form, context) {
        const F = FollowerCommandEditor, t = F._t, c = context || {};
        if (form.who === 'follower') return F.followerLabel(form.index, c.count === undefined ? Infinity : c.count);
        const actor = (Array.isArray(c.actors) ? c.actors : []).find(entry => entry && Number(entry.id) === form.actorId);
        return actor && actor.name ? actor.name : t('Actor {id}', { id: String(form.actorId).padStart(4, '0') });
    }

    /** One sentence for the command list. */
    static summary(name, args, context) {
        const F = FollowerCommandEditor, t = F._t, form = F.formOf(name, args || {});
        if (name === 'ChangeFollowerFormation') {
            if (form.formation === 'default') return t("Followers walk in the game's own formation");
            const line = t(F.FORMATION_LINES[form.formation], { n: F.tiles(form.spacing) });
            return form.straggle > 0 ? line + t(', straggle {p}%', { p: form.straggle }) : line;
        }
        const all = form.who === 'all';
        let line = t(F.ORDER_LINES[form.order][all ? 1 : 0], { who: all ? '' : F.whoName(form, context || F.context()), x: form.x, y: form.y });
        if (form.order === 'goto' && F.FACING_LINES[form.direction]) line += t(F.FACING_LINES[form.direction]);
        if ((form.order === 'goto' || form.order === 'come') && form.wait) line += t(all ? ' and wait' : ' and waits');
        return line;
    }

    //-------------------------------------------------------------------------
    // The dialogs.

    _manager() {
        return this.databaseManager || (typeof window !== 'undefined' && window.reactor && window.reactor.databaseManager) || null;
    }

    _projectController() {
        return this.projectController || (typeof window !== 'undefined' && window.reactor && window.reactor.projectController) || null;
    }

    /**
     * `command` is the saved command when editing, or null for a new one
     * (the picker then passes the command's name as `nameHint`).
     */
    show(command, callback, nameHint) {
        const F = FollowerCommandEditor;
        const params = (command && command.parameters) || [];
        const name = F.supports(params[1]) ? params[1] : (F.supports(nameHint) ? nameHint : 'FollowerOrders');
        const stored = command && params[3] && typeof params[3] === 'object' ? params[3] : null;
        const context = F.context({ databaseManager: this._manager() });
        const form = F.formOf(name, stored);
        const t = (text, values) => this._t(text, values);
        const esc = value => String(value == null ? '' : value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
        const options = (list, current) => list.map(([value, label]) => `<option value="${esc(value)}"${String(value) === String(current) ? ' selected' : ''}>${esc(label)}</option>`).join('');
        const row = (label, inner, cls = '') => `<div class="fc-row${cls ? ' ' + cls : ''}"><span class="fc-label">${esc(label)}</span><div class="fc-field">${inner}</div></div>`;
        const hint = (text, cls = '') => `<div class="fc-hint${cls ? ' ' + cls : ''}">${esc(text)}</div>`;

        let body = '';
        if (name === 'ChangeFollowerFormation') {
            const tile = (key, label) => `<button type="button" class="fo-formation${key === form.formation ? ' is-on' : ''}" data-formation="${key}" title="${esc(label)}"
                style="display:flex;flex-direction:column;align-items:center;gap:2px;min-width:0;padding:6px 4px;background:var(--color-bg-deep);border:1px solid var(--color-border-input);border-radius:4px;color:var(--color-text);font-size:11px;cursor:pointer;">
                ${key === 'default' ? '<span style="display:flex;align-items:center;justify-content:center;width:56px;height:56px;color:var(--color-text-muted);font-size:22px;">&#8617;</span>' : F.picture(key)}
                <span style="text-align:center;line-height:1.2;">${esc(label)}</span></button>`;
            body += `<div class="fc-row"><span class="fc-label" style="align-self:start;line-height:28px;">${esc(t('Follower Formation'))}</span>
                <div class="fo-formations" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(78px,1fr));gap:6px;flex:1 1 0;min-width:0;">${tile('default', t("The game's default"))}${F.FORMATIONS.map(([key, label]) => tile(key, t(label))).join('')}</div></div>`;
            body += row(t('Spacing'), `<select class="fo-spacing database-field-value">${options([1, 2, 3, 4].map(n => [n, F.tiles(n)]), form.spacing)}</select>`, 'fo-when-own');
            body += row(t('Straggle'), `<input type="range" class="fo-straggle-slide" min="0" max="100" step="5" value="${form.straggle}" style="flex:1 1 0;min-width:0;">
                <input type="number" class="fo-straggle fc-number database-field-value" min="0" max="100" step="5" value="${form.straggle}"><span class="fc-words">%</span>`, 'fo-when-own');
            body += hint(t('Straggle: how late and how unevenly they follow.'), 'fo-when-own');
            body += hint(t('From now on; kept with the save.'));
        } else {
            const followers = [];
            for (let place = 1; place <= Math.max(context.count, form.who === 'follower' ? form.index : 0); place++) {
                if (place <= context.count || place === form.index) followers.push(['follower:' + place, F.followerLabel(place, context.count)]);
            }
            const who = form.who === 'follower' ? 'follower:' + form.index : form.who;
            const actors = (Array.isArray(context.actors) ? context.actors : []).filter(entry => entry && entry.id > 0)
                .map(entry => [String(entry.id), String(entry.id).padStart(4, '0') + (entry.name ? ': ' + entry.name : '')]);
            if (!actors.some(([id]) => Number(id) === form.actorId)) actors.push([String(form.actorId), String(form.actorId).padStart(4, '0')]);
            body += row(t('Who'), `<select class="fo-who database-field-value">${options([['all', t('All followers')]].concat(followers, [['actor', t('By actor')]]), who)}</select>`);
            body += row(t('Actor'), `<select class="fo-actor database-field-value">${options(actors, form.actorId)}</select>`, 'fo-when-actor');
            body += row(t('What to do'), `<select class="fo-order database-field-value">${options(F.ORDERS.map(([key, label]) => [key, t(label)]), form.order)}</select>`);
            body += row(t('Destination'), `<span class="fc-words">X</span><input type="number" class="fo-x fc-number database-field-value" min="0" max="9999" step="1" value="${form.x}">
                <span class="fc-words">Y</span><input type="number" class="fo-y fc-number database-field-value" min="0" max="9999" step="1" value="${form.y}">
                <button type="button" class="fo-pick rr-btn-browse">${esc(t('Pick on the Map...'))}</button>`, 'fo-when-goto');
            body += row(t('Facing'), `<select class="fo-direction database-field-value">${options(F.FACINGS.map(([key, label]) => [key, t(label)]), form.direction)}</select>`, 'fo-when-goto');
            body += `<label class="fc-check fc-wide fo-when-walk"><input type="checkbox" class="fo-wait"${form.wait ? ' checked' : ''}><span>${esc(t('Wait for the arrival'))}</span></label>`;
            body += hint('', 'fo-order-hint');
        }

        const modal = document.createElement('div');
        modal.className = 'rr-modal-overlay rr-command-editor-modal';
        // Over the event editor and the command picker, under the map picker this dialog opens.
        modal.style.zIndex = '10004';
        const title = window.I18n && window.I18n.tEventCommandName ? window.I18n.tEventCommandName(F.LABELS[name]) : F.LABELS[name];
        modal.innerHTML = `
            <div class="rr-modal fc-modal fo-modal fo-modal-${name}" style="width:min(${name === 'ChangeFollowerFormation' ? 800 : 480}px,94vw);display:flex;flex-direction:column;">
                <div class="rr-modal-header">
                    <div class="rr-modal-title">${esc(title)}</div>
                    <button type="button" class="rr-modal-close fo-cancel">&times;</button>
                </div>
                <div class="rr-modal-body fc-body">${body}</div>
                <div class="rr-modal-footer" style="display:flex;justify-content:flex-end;gap:8px;padding:10px 14px;">
                    <button type="button" class="rr-btn-secondary fo-cancel">${window.I18n ? window.I18n.t('common.cancel') : 'Cancel'}</button>
                    <button type="button" class="rr-button-primary fo-ok">${window.I18n ? window.I18n.t('common.ok') : 'OK'}</button>
                </div>
            </div>`;
        document.body.appendChild(modal);
        const $ = key => modal.querySelector('.fo-' + key);
        const all = selector => Array.from(modal.querySelectorAll(selector));
        const showWhen = (cls, on) => all('.fo-when-' + cls).forEach(element => { element.hidden = !on; });

        // What each order does, in a few words under the form.
        const ORDER_HINTS = {
            follow: 'Back into the line.', stay: 'Holds its tile and its facing until told to follow.',
            goto: 'Walks there by the shortest open way, then stays.', come: 'Walks back to the leader, then follows.',
            hide: 'Not seen; the party is unchanged.', show: 'Seen again.'
        };
        const read = () => {
            if (name === 'ChangeFollowerFormation') {
                const on = modal.querySelector('.fo-formation.is-on');
                form.formation = on ? on.dataset.formation : 'default';
                form.spacing = F._int($('spacing').value) || 1;
                form.straggle = F._int($('straggle').value);
            } else {
                const who = $('who').value;
                form.who = who.startsWith('follower:') ? 'follower' : who;
                if (form.who === 'follower') form.index = F._int(who.slice('follower:'.length)) || 1;
                form.actorId = F._int($('actor').value) || 1;
                form.order = $('order').value;
                form.x = F._int($('x').value);
                form.y = F._int($('y').value);
                form.direction = F._int($('direction').value);
                form.wait = $('wait').checked;
            }
        };
        const refresh = () => {
            read();
            if (name === 'ChangeFollowerFormation') {
                const own = form.formation !== 'default';
                all('.fo-when-own').forEach(element => { element.style.opacity = own ? '' : '0.45'; });
                all('.fo-spacing, .fo-straggle, .fo-straggle-slide').forEach(control => { control.disabled = !own; });
                all('.fo-formation').forEach(button => {
                    const on = button.classList.contains('is-on');
                    button.style.borderColor = on ? 'var(--color-accent-bright)' : 'var(--color-border-input)';
                    button.style.background = on ? 'var(--color-accent-tint-30)' : 'var(--color-bg-deep)';
                    button.setAttribute('aria-pressed', on ? 'true' : 'false');
                });
            } else {
                showWhen('actor', form.who === 'actor');
                showWhen('goto', form.order === 'goto');
                showWhen('walk', form.order === 'goto' || form.order === 'come');
                $('order-hint').textContent = t(ORDER_HINTS[form.order]);
            }
        };
        all('.fo-formation').forEach(button => button.addEventListener('click', () => {
            all('.fo-formation').forEach(other => other.classList.toggle('is-on', other === button));
            refresh();
        }));
        const slide = $('straggle-slide'), straggle = $('straggle');
        if (slide) {
            slide.addEventListener('input', () => { straggle.value = slide.value; });
            straggle.addEventListener('change', () => { straggle.value = String(Math.max(0, Math.min(100, F._int(straggle.value)))); slide.value = straggle.value; });
        }
        all('select, input').forEach(control => control.addEventListener('change', refresh));
        const pick = $('pick');
        if (pick) {
            const controller = this._projectController(), map = context.map;
            const mapId = Number(map && map.id) || Number(controller && controller.tilemapManager && controller.tilemapManager.currentMapId) || 0;
            pick.disabled = !(mapId > 0) || typeof TransferPlayerEditor === 'undefined' || !controller;
            pick.addEventListener('click', () => {
                // The picker Transfer Player uses, kept to this map: the same one Move to Tile opens.
                new TransferPlayerEditor(this._manager(), controller).showMapPicker({
                    mapId, x: F._int($('x').value), y: F._int($('y').value), title: t('Pick a tile'), thisMapOnly: true,
                    onConfirm: location => { $('x').value = String(location.x); $('y').value = String(location.y); refresh(); }
                });
            });
        }
        refresh();

        const close = () => { if (modal.parentNode) modal.parentNode.removeChild(modal); };
        all('.fo-cancel').forEach(button => button.addEventListener('click', () => { close(); callback(null); }));
        $('ok').addEventListener('click', () => {
            read();
            const args = F.argsOf(name, stored, form);
            close();
            callback({ code: 357, indent: (command && command.indent) || 0, parameters: ['RPGReactor', name, F.LABELS[name], args] });
        });
    }
}

if (typeof globalThis !== 'undefined') globalThis.FollowerCommandEditor = FollowerCommandEditor;
if (typeof module !== 'undefined' && module.exports) module.exports = FollowerCommandEditor;
