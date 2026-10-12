/* Shared, side-effect-free Action battle HUD: node settings, drawing on a 2D canvas, the two stock layouts. */
(function(root) {
    'use strict';

    /**
     * ReactorActionHud - the HUD of the real-time map battles (Action, in
     * third person, and First Person), the same in the game and on the
     * editor's canvas. It belongs to those two modes alone: a Tactical battle
     * has its own HUD (reactor_ui_fight.js) and a Classic battle its own
     * Battle HUD records; none of this is read by either.
     *
     * Eight interface nodes: Crosshair, Vitals (the player's HP, MP, TP and
     * states), Weapon (name, magazine, reload, melee combo), Hotbar (skills
     * and items on their keys), Target (the aimed or locked opponent), Enemy
     * Bars (bars over opponents in the world, the lock marker), Damage
     * (where a hit came from, the low-HP edge) and Action Text (objective,
     * notices). Everything draws from the battle's own HUD object
     * (`$gameFight.actionHud()`) on a canvas context, with the pen, frames
     * and clipped gauges of the Tactical HUD, so a game that changes mode
     * keeps one look.
     */
    const A = {};
    const pick = name => { try { return require(name); } catch (error) { return null; } };
    const F = root.ReactorFightHud || (typeof require === 'function' ? pick('./reactor_ui_fight.js') || pick('./FightHud.js') : null);

    A.NODE_TYPES = ['actionCrosshair', 'actionVitals', 'actionWeapon', 'actionHotbar', 'actionTarget', 'actionBars', 'actionDamage', 'actionInfo'];
    /** The presentations (one per map battle mode), each with its role and System field. */
    A.MODES = {
        action: { role: 'action', field: 'reactorActionInterfaceId', name: 'Action Battle' },
        firstPerson: { role: 'firstPerson', field: 'reactorFirstPersonInterfaceId', name: 'First Person Battle' }
    };
    A.isMode = mode => Object.prototype.hasOwnProperty.call(A.MODES, mode);
    A.isActionNode = type => A.NODE_TYPES.includes(type);
    A.CROSS_STYLES = ['cross', 'dot', 'circle', 'chevrons'];
    A.INFOS = ['objective', 'feed'];
    A.LABELS = { reloading: 'Reloading', defeated: '%1 defeated', locked: 'Locked' };
    // A magazine of this many rounds or fewer is drawn round by round.
    A.MAGAZINE_PIPS = 12;
    A.PLAYER_COLOR = '#4aa8ff';
    A.ENEMY_COLOR = '#ff5a4a';

    const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
    const finite = (value, fallback) => (Number.isFinite(Number(value)) && value !== '' && value !== null ? Number(value) : fallback);
    const isHex = value => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);
    const oneOf = (value, options, fallback) => (options.includes(value) ? value : fallback);

    /**
     * Every setting of every node, as the editor lists it and `normalizeProps`
     * reads it: `[key, kind, label, default, ...]` with kind `select`
     * (options as [value, label]), `check`, `number` (min, max) or `color`.
     */
    A.SETTINGS = {
        actionCrosshair: [
            ['crossStyle', 'select', 'Style', 'cross', [['cross', 'Cross'], ['dot', 'Dot'], ['circle', 'Circle'], ['chevrons', 'Chevrons']]],
            ['crossColor', 'color', 'Color', '#ffffff'],
            ['targetColor', 'color', 'Over a target', A.ENEMY_COLOR],
            ['crossLength', 'number', 'Tick length', 9, 2, 40],
            ['crossThickness', 'number', 'Thickness', 2, 1, 8],
            ['hitMarker', 'check', 'Hit and kill markers', true],
            ['hideSprinting', 'check', 'Hide while dashing', true],
            ['reloadRing', 'check', 'Reload ring', true]
        ],
        actionVitals: [
            ['showPortrait', 'check', 'Portrait', false],
            ['showName', 'check', 'Name', true],
            ['showMp', 'check', 'MP', true],
            ['showTp', 'check', 'TP', true],
            ['showStates', 'check', 'States', true],
            ['gaugeStyle', 'select', 'Gauges', 'clipped', [['clipped', 'Clipped corners'], ['bar', 'Thin bar']]],
            ['accentColor', 'color', 'Color', A.PLAYER_COLOR],
            ['damageFlash', 'check', 'Flash when hurt', true]
        ],
        actionWeapon: [
            ['showWeaponName', 'check', 'Weapon name', true],
            ['showWeaponPicture', 'check', 'Weapon picture', true],
            ['showReserve', 'check', 'Reserve', true],
            ['showCombo', 'check', 'Melee combo steps', true],
            ['showCarried', 'check', 'Carried weapons on a switch', true],
            ['accentColor', 'color', 'Color', A.PLAYER_COLOR]
        ],
        actionHotbar: [
            ['slotSize', 'number', 'Slot size', 0, 0, 128],
            ['slotGap', 'number', 'Gap', 6, 0, 32],
            ['showKeys', 'check', 'Key labels', true],
            ['showCost', 'check', 'Cost', true],
            ['accentColor', 'color', 'Color', A.PLAYER_COLOR]
        ],
        actionTarget: [
            ['showNumbers', 'check', 'HP numbers', true],
            ['enemyColor', 'color', 'Color', A.ENEMY_COLOR]
        ],
        actionBars: [
            ['barWidth', 'number', 'Bar width', 64, 16, 240],
            ['barHeight', 'number', 'Bar height', 8, 3, 32],
            ['barFrames', 'number', 'Shown after a hit (frames)', 180, 10, 1200],
            ['lockMarker', 'check', 'Mark the locked target', true],
            ['enemyColor', 'color', 'Color', A.ENEMY_COLOR]
        ],
        actionDamage: [
            ['showDirection', 'check', 'Where a hit came from', true],
            ['showVignette', 'check', 'Low HP edge', true],
            ['lowHp', 'number', 'Low HP (%)', 30, 0, 100],
            ['enemyColor', 'color', 'Color', '#d82828']
        ],
        actionInfo: [
            ['actionInfo', 'select', 'Shows', 'objective', [['objective', 'Objective'], ['feed', 'Notices']]],
            ['feedLines', 'number', 'Most lines', 4, 1, 12],
            ['feedFrames', 'number', 'A line stays (frames)', 240, 30, 1800]
        ]
    };
    A.SIZES = { actionCrosshair: [96, 96], actionVitals: [320, 84], actionWeapon: [240, 84], actionHotbar: [440, 56], actionTarget: [360, 48],
        actionBars: [64, 24], actionDamage: [320, 320], actionInfo: [320, 32] };

    /** What a new node of a type starts as. */
    A.defaultProps = function(type) {
        const out = {};
        if (!A.isActionNode(type)) return out;
        for (const [key, , , value] of A.SETTINGS[type]) out[key] = value;
        out.width = A.SIZES[type][0]; out.height = A.SIZES[type][1];
        out.fill = type === 'actionVitals' || type === 'actionWeapon' ? 'window' : 'none';
        out.actionLabels = {};
        if (type === 'actionInfo') Object.assign(out, { align: 'left', fontSize: 0, textColor: 0, fontBold: false });
        return out;
    };

    /** A stored node's own settings, every value in range (missing ones at their defaults). */
    A.normalizeProps = function(source, type) {
        const out = {};
        if (!A.isActionNode(type)) return out;
        source = source && typeof source === 'object' ? source : {};
        for (const [key, kind, , value, a, b] of A.SETTINGS[type]) {
            if (kind === 'check') out[key] = source[key] === undefined ? value : !!source[key];
            else if (kind === 'number') out[key] = clamp(Math.round(finite(source[key], value)), a, b);
            else if (kind === 'color') out[key] = isHex(source[key]) ? source[key] : value;
            else out[key] = oneOf(source[key], a.map(option => option[0]), value);
        }
        const labels = {};
        if (source.actionLabels && typeof source.actionLabels === 'object') {
            for (const key of Object.keys(A.LABELS)) if (typeof source.actionLabels[key] === 'string' && source.actionLabels[key]) labels[key] = source.actionLabels[key];
        }
        out.actionLabels = labels;
        return out;
    };

    A.label = (node, key) => (node && node.actionLabels && node.actionLabels[key]) || A.LABELS[key] || '';

    /** The id System binds as a mode's HUD (0: none of its own, the mode's stock layout plays). */
    A.boundId = function(system, mode) {
        const id = system && A.isMode(mode) ? Math.floor(Number(system[A.MODES[mode].field]) || 0) : 0;
        return id > 0 ? id : 0;
    };

    /** A 32-bit mix of whole numbers: what a node shows, folded into one number to compare against the last drawing. */
    A.mix = (hash, value) => (Math.imul(hash, 31) + (value | 0)) | 0;

    //-------------------------------------------------------------------------
    // Drawing. `theme` is the Tactical HUD's (fonts, colors, terms, pictures).

    /** The crosshair's state as whole numbers: `{ gap, onTarget, hit, kill, aiming, reload (0-12, 0 none), sprinting, ranged }`. */
    A.crossState = function(hud, sprinting, out) {
        const c = hud.crosshair;
        out.gap = clamp(Math.round(c.spread / 2) * 2, 2, 40);
        out.onTarget = c.onTarget ? 1 : 0;
        out.hit = c.hit > 0 ? 1 : 0;
        out.kill = c.kill > 0 ? 1 : 0;
        out.aiming = c.aiming ? 1 : 0;
        out.reload = hud.ammo.reload > 0 ? 1 + Math.min(11, Math.floor(hud.ammo.reload * 12)) : 0;
        out.sprinting = sprinting ? 1 : 0;
        out.ranged = hud.weapon.ranged ? 1 : 0;
        return out;
    };
    A.crossKey = state => state.gap + state.onTarget * 64 + state.hit * 128 + state.kill * 256 + state.aiming * 512 + state.reload * 1024 + state.sprinting * 16384 + state.ranged * 32768;

    /** The crosshair at the middle of a `size` square. */
    A.drawCrosshair = function(ctx, size, node, state) {
        const m = size / 2, gap = state.gap, length = node.crossLength, thick = node.crossThickness;
        const color = state.onTarget ? node.targetColor : node.crossColor;
        const stroke = (width, style) => { ctx.lineWidth = width; ctx.strokeStyle = style; ctx.stroke(); };
        // A dark edge two pixels wide all round each stroke, its ends too: pale ticks alone are lost on lit stone.
        const both = draw => { ctx.lineCap = 'square'; draw(); stroke(thick + 4, 'rgba(0,0,0,0.8)'); ctx.lineCap = 'butt'; draw(); stroke(thick, color); };
        ctx.save();
        ctx.lineCap = 'butt';
        const hidden = node.hideSprinting && state.sprinting;
        // Reloading (or dashing) leaves the middle dot: the weapon is not ready to be aimed.
        if (state.reload || hidden) ctx.globalAlpha *= state.reload ? 0.35 : 0;
        if (!state.ranged) {
            // A blade has no spread: a dot, and brackets round it over something it can reach.
            if (state.onTarget) both(() => { ctx.beginPath(); ctx.arc(m, m, 9, Math.PI * 0.75, Math.PI * 1.25); ctx.moveTo(m + 9 * Math.cos(-Math.PI / 4), m + 9 * Math.sin(-Math.PI / 4)); ctx.arc(m, m, 9, -Math.PI / 4, Math.PI / 4); });
        } else if (node.crossStyle === 'cross') {
            both(() => {
                ctx.beginPath();
                ctx.moveTo(m - gap - length, m); ctx.lineTo(m - gap, m);
                ctx.moveTo(m + gap, m); ctx.lineTo(m + gap + length, m);
                ctx.moveTo(m, m - gap - length); ctx.lineTo(m, m - gap);
                ctx.moveTo(m, m + gap); ctx.lineTo(m, m + gap + length);
            });
        } else if (node.crossStyle === 'chevrons') {
            both(() => {
                ctx.beginPath();
                const h = length * 0.6;
                for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                    const x = m + dx * gap, y = m + dy * gap;
                    ctx.moveTo(x + dx * h - dy * h, y + dy * h + dx * h); ctx.lineTo(x, y); ctx.lineTo(x + dx * h + dy * h, y + dy * h - dx * h);
                }
            });
        } else {
            // Dot and Circle: the spread is the ring.
            both(() => { ctx.beginPath(); ctx.arc(m, m, gap + (node.crossStyle === 'circle' ? 2 : 0), 0, Math.PI * 2); });
        }
        ctx.restore();
        ctx.save();
        if (!hidden || state.reload) {
            if (node.crossStyle !== 'cross' || !state.ranged || state.aiming || state.reload) {
                ctx.beginPath(); ctx.arc(m, m, thick + 0.5, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(0,0,0,0.65)'; ctx.fill();
                ctx.beginPath(); ctx.arc(m, m, thick - 0.5, 0, Math.PI * 2);
                ctx.fillStyle = color; ctx.fill();
            }
        }
        if (state.reload && node.reloadRing) {
            const r = Math.min(m - 4, 22);
            ctx.beginPath(); ctx.arc(m, m, r, 0, Math.PI * 2);
            stroke(4, 'rgba(0,0,0,0.5)');
            ctx.beginPath(); ctx.arc(m, m, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (state.reload - 1) / 11);
            stroke(3, node.crossColor);
        }
        if (node.hitMarker && (state.hit || state.kill)) {
            // A hit: four slanted ticks. A kill: the same, longer, in red, closed by a ring.
            const inner = state.kill ? 8 : 6, outer = state.kill ? 20 : 13, tint = state.kill ? node.targetColor : '#ffffff';
            const ticks = () => { ctx.beginPath(); for (const [dx, dy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) { ctx.moveTo(m + dx * inner, m + dy * inner); ctx.lineTo(m + dx * outer, m + dy * outer); } };
            ticks(); stroke(thick + 3, 'rgba(0,0,0,0.65)');
            ticks(); stroke(thick + 1, tint);
            if (state.kill) { ctx.beginPath(); ctx.arc(m, m, outer + 6, 0, Math.PI * 2); stroke(2, tint); }
        }
        ctx.restore();
    };

    /** Vitals: `[portrait]`, the name with the states beside it, HP large, MP and TP side by side under it. */
    A.vitalsLayout = function(node, width, height) {
        const size = node.showPortrait ? Math.min(height, Math.floor(width * 0.3)) : 0;
        const gap = size ? Math.round(height * 0.1) : 0;
        const x = size + gap, w = Math.max(1, width - x);
        const minor = node.showMp || node.showTp;
        const parts = (node.showName || node.showStates ? 0.8 : 0) + 1.25 + (minor ? 0.8 : 0);
        const unit = clamp(Math.floor(height / parts), 12, 48);
        const top = Math.max(0, Math.floor((height - Math.round(parts * unit)) / 2));
        const layout = { unit, small: clamp(Math.round(unit * 0.52), 9, 20), font: clamp(Math.round(unit * 0.62), 10, 24), portrait: size ? { x: 0, y: Math.floor((height - size) / 2), size } : null,
            header: null, hp: null, mp: null, tp: null, icon: 0 };
        let y = top;
        if (node.showName || node.showStates) {
            const h = Math.round(unit * 0.8);
            layout.header = { x, y, width: w, height: h };
            layout.icon = clamp(h - 2, 12, 32);
            y += h;
        }
        layout.hp = { key: 'hp', x, y, width: w, height: Math.round(unit * 1.25) };
        y += layout.hp.height;
        if (minor) {
            const h = Math.round(unit * 0.8), both = node.showMp && node.showTp, half = both ? Math.floor((w - 12) / 2) : w;
            if (node.showMp) layout.mp = { key: 'mp', x, y, width: half, height: h };
            if (node.showTp) layout.tp = { key: 'tp', x: both ? x + half + 12 : x, y, width: half, height: h };
        }
        return layout;
    };

    /**
     * Vitals at the origin. `unit` is a unit view of the player (the Tactical
     * HUD's: face, model, state icons). Returns false while a picture loads.
     */
    A.drawVitals = function(ctx, width, height, node, hud, unit, theme) {
        const layout = A.vitalsLayout(node, width, height);
        let ready = true;
        if (layout.portrait && unit) ready = F.drawPortrait(ctx, 0, layout.portrait.y, layout.portrait.size, unit, theme, node.accentColor, 2);
        if (layout.header) {
            const r = layout.header;
            let right = r.x + r.width;
            if (node.showStates && unit && unit.icons.length) {
                const sheet = theme.icons();
                if (sheet) {
                    const cell = theme.iconSize || 32, count = Math.min(unit.icons.length, 6);
                    right -= count * (layout.icon + 2);
                    for (let i = 0; i < count; i++) ctx.drawImage(sheet, (unit.icons[i] % 16) * cell, Math.floor(unit.icons[i] / 16) * cell, cell, cell, right + i * (layout.icon + 2), r.y, layout.icon, layout.icon);
                } else if (sheet === null) ready = false;
            }
            if (node.showName) F.text(ctx, theme, hud.name, r.x, r.y, Math.max(1, right - r.x - 6), r.height, 'left', theme.textColor, layout.font, true);
        }
        const gauge = { clipped: node.gaugeStyle !== 'bar', unit: layout.unit, small: layout.small };
        const low = hud.mhp > 0 && hud.hp / hud.mhp < 0.25;
        F.drawGauge(ctx, layout.hp, Object.assign(gauge, { small: clamp(Math.round(layout.unit * 0.66), 10, 24) }), theme.terms.hp, hud.hp + '/' + hud.mhp, hud.mhp > 0 ? hud.hp / hud.mhp : 0, theme.gauge.hp, theme.gauge.back, theme,
            hud.hp <= 0 ? theme.deathColor : low ? theme.crisisColor : theme.textColor, null, '');
        gauge.small = layout.small;
        if (layout.mp) F.drawGauge(ctx, layout.mp, gauge, theme.terms.mp, hud.mmp > 0 ? String(hud.mp) : '', hud.mmp > 0 ? hud.mp / hud.mmp : 0, theme.gauge.mp, theme.gauge.back, theme, theme.textColor, null, '');
        if (layout.tp) F.drawGauge(ctx, layout.tp, gauge, theme.terms.tp, String(hud.tp), hud.tp / 100, theme.gauge.tp, theme.gauge.back, theme, theme.textColor, null, '');
        return ready;
    };

    /**
     * The weapon at the origin: its picture and name above, the magazine's
     * count large over the magazine drawn as a bar (round by round when it
     * is small), a reserve beside the count where the battle keeps one, and
     * for a blade its combo's steps. While it reloads the bar fills. `extra`: `{ steps, picture,
     * carried: [iconIndex], switching }`.
     */
    A.drawWeapon = function(ctx, width, height, node, hud, theme, extra) {
        const top = Math.round(height * 0.36), big = clamp(Math.round((height - top) * 0.8), 14, 64), small = clamp(Math.round(top * 0.66), 9, 22);
        const weapon = hud.weapon, ammo = hud.ammo;
        let ready = true;
        const sheet = theme.icons(), cell = theme.iconSize || 32, icon = clamp(top - 2, 12, 40);
        if (sheet === null) ready = false;
        if (extra && extra.switching && node.showCarried && extra.carried && extra.carried.length > 1) {
            // The weapons carried, the one in hand framed: shown for a moment after a switch.
            const count = extra.carried.length, step = icon + 6, x0 = width - count * step + 6;
            for (let i = 0; i < count; i++) {
                const x = x0 + i * step;
                if (i === weapon.index) { F.roundedPath(ctx, x - 2, 0, icon + 4, icon + 2, 4); ctx.strokeStyle = node.accentColor; ctx.lineWidth = 2; ctx.stroke(); }
                else ctx.globalAlpha *= 0.5;
                if (sheet) ctx.drawImage(sheet, (extra.carried[i] % 16) * cell, Math.floor(extra.carried[i] / 16) * cell, cell, cell, x, 1, icon, icon);
                if (i !== weapon.index) ctx.globalAlpha /= 0.5;
            }
        } else {
            let right = width;
            if (weapon.count > 1) {
                const tag = (weapon.index + 1) + '/' + weapon.count;
                F.text(ctx, theme, tag, width - small * 2.2, 0, small * 2.2, top, 'right', theme.systemColor, small, false);
                right -= small * 2.6;
            }
            let left = 0;
            if (node.showWeaponPicture) {
                const picture = extra && extra.picture;
                if (picture) { ctx.drawImage(picture, 0, 0, icon, icon); left = icon + 6; }
                else if (sheet && weapon.iconIndex > 0) { ctx.drawImage(sheet, (weapon.iconIndex % 16) * cell, Math.floor(weapon.iconIndex / 16) * cell, cell, cell, 0, Math.round((top - icon) / 2), icon, icon); left = icon + 6; }
            }
            if (node.showWeaponName) F.text(ctx, theme, weapon.name, left, 0, Math.max(1, right - left), top, 'left', theme.textColor, small, true);
        }
        const bar = clamp(Math.round(height * 0.09), 5, 12);
        const y = top, h = height - top - (ammo.capacity > 0 ? bar + 4 : 0);
        if (ammo.capacity > 0) {
            // The magazine: its count large, and under it the magazine itself, one pip a round (a long one as a bar).
            // A reserve is written beside the count only when the battle keeps one.
            const counted = node.showReserve && ammo.reserve !== null && ammo.reserve !== undefined;
            const reserve = counted ? '/ ' + ammo.reserve : '';
            const reserveWidth = reserve ? Math.round(big * 1.7) : 0;
            const color = ammo.magazine <= 0 ? theme.deathColor : ammo.magazine <= ammo.capacity * 0.25 ? theme.crisisColor : theme.textColor;
            const reloading = ammo.reload > 0;
            if (reloading) F.text(ctx, theme, A.label(node, 'reloading'), 0, y, width * 0.5, h, 'left', theme.crisisColor, clamp(Math.round(big * 0.42), 9, 22), false);
            F.text(ctx, theme, String(ammo.magazine), 0, y, width - reserveWidth - (reserve ? 4 : 0), h, 'right', color, big, true);
            if (reserve) F.text(ctx, theme, reserve, width - reserveWidth, y + h * 0.18, reserveWidth, h * 0.82, 'left', theme.systemColor, clamp(Math.round(big * 0.5), 9, 28), false);
            const by = height - bar, rate = reloading ? clamp(ammo.reload, 0, 1) : clamp(ammo.magazine / ammo.capacity, 0, 1);
            const fill = reloading ? node.accentColor : ammo.magazine <= ammo.capacity * 0.25 ? theme.crisisColor : theme.textColor;
            if (!reloading && ammo.capacity <= A.MAGAZINE_PIPS) {
                const space = 3, pip = (width - (ammo.capacity - 1) * space) / ammo.capacity;
                for (let i = 0; i < ammo.capacity; i++) {
                    ctx.fillStyle = i < ammo.magazine ? fill : theme.gauge.back;
                    ctx.fillRect(Math.round(i * (pip + space)), by, Math.max(1, Math.round(pip)), bar);
                }
            } else {
                F.clippedPath(ctx, 0, by, width, bar, bar * 0.5);
                ctx.fillStyle = theme.gauge.back; ctx.fill();
                ctx.save(); ctx.clip();
                ctx.fillStyle = fill;
                ctx.fillRect(0, by, Math.round(width * rate), bar);
                ctx.restore();
            }
        } else if (!weapon.ranged && node.showCombo && extra && extra.steps > 1) {
            // The combo: one clipped pip per step, lit up to the one being swung.
            const steps = extra.steps, pip = clamp(Math.floor(width * 0.6 / steps) - 6, 10, 44), ph = clamp(Math.round(h * 0.42), 6, 18);
            const x0 = width - steps * (pip + 6) + 6, py = y + Math.round((h - ph) / 2);
            for (let i = 0; i < steps; i++) {
                F.clippedPath(ctx, x0 + i * (pip + 6), py, pip, ph, ph * 0.5);
                ctx.fillStyle = i < hud.combo ? node.accentColor : theme.gauge.back;
                ctx.fill();
            }
        }
        return ready;
    };

    /** Where the hotbar's slots sit: `out.size`, `out.x0`, `out.y`, `out.step`. */
    A.hotbarLayout = function(node, width, height, count, out) {
        const gap = node.slotGap;
        const size = Math.max(16, Math.min(node.slotSize > 0 ? node.slotSize : 9999, height, Math.floor((width + gap) / Math.max(1, count)) - gap));
        out.size = size; out.step = size + gap;
        out.x0 = Math.floor((width - (count * (size + gap) - gap)) / 2);
        out.y = Math.floor((height - size) / 2);
        return out;
    };

    const hotOut = {};

    /**
     * The hotbar at the origin: one framed slot per skill or item, its icon,
     * its key at the top left, its cost at the bottom right, a shade that
     * drains from the top while it cools down; one that cannot be used is
     * dimmed. `extra`: `{ keys: [text], costs: [text], costColors: [css] }`.
     */
    A.drawHotbar = function(ctx, width, height, node, hud, theme, extra) {
        const slots = hud.hotbar, count = slots.length;
        if (!count) return true;
        const layout = A.hotbarLayout(node, width, height, count, hotOut), size = layout.size;
        const sheet = theme.icons(), cell = theme.iconSize || 32;
        // The icon at its own size, or one and a half or two times it where the slot has the room.
        const icon = size >= cell * 2 + 10 ? cell * 2 : size >= cell * 1.5 + 8 ? cell * 1.5 : size >= cell + 6 ? cell : size - 8, small = clamp(Math.round(size * 0.27), 9, 16);
        for (let i = 0; i < count; i++) {
            const slot = slots[i], x = layout.x0 + i * layout.step, y = layout.y;
            F.roundedPath(ctx, x + 1, y + 1, size - 2, size - 2, 4);
            ctx.fillStyle = 'rgba(8,10,20,0.72)'; ctx.fill();
            ctx.strokeStyle = slot.usable ? node.accentColor : 'rgba(150,156,170,0.6)'; ctx.lineWidth = 2; ctx.stroke();
            if (sheet && slot.iconIndex > 0) {
                if (!slot.usable) ctx.globalAlpha *= 0.35;
                ctx.drawImage(sheet, (slot.iconIndex % 16) * cell, Math.floor(slot.iconIndex / 16) * cell, cell, cell, x + Math.round((size - icon) / 2), y + Math.round((size - icon) / 2), icon, icon);
                if (!slot.usable) ctx.globalAlpha /= 0.35;
            }
            if (slot.cooldown > 0) {
                ctx.save();
                F.roundedPath(ctx, x + 2, y + 2, size - 4, size - 4, 3);
                ctx.clip();
                ctx.fillStyle = 'rgba(0,0,0,0.66)';
                ctx.fillRect(x, y + (size - Math.round(size * clamp(slot.cooldown, 0, 1))), size, size);
                ctx.restore();
            }
            if (node.showKeys && extra && extra.keys && extra.keys[i]) F.text(ctx, theme, extra.keys[i], x + 4, y + 2, size - 8, small + 4, 'left', theme.textColor, small, true);
            if (node.showCost && extra && extra.costs && extra.costs[i]) F.text(ctx, theme, extra.costs[i], x + 4, y + size - small - 6, size - 8, small + 4, 'right', extra.costColors[i] || theme.systemColor, small, false);
        }
        return sheet !== null;
    };

    /** The aimed or locked opponent at the origin: its name over its HP bar; a locked one sits between brackets. */
    A.drawTarget = function(ctx, width, height, node, hud, theme) {
        const target = hud.target;
        if (!target) return;
        const row = Math.round(height * 0.5), font = clamp(Math.round(row * 0.8), 10, 26), bar = clamp(Math.round(height * 0.3), 6, 22);
        const color = target.team === 'ally' ? A.PLAYER_COLOR : node.enemyColor;
        F.text(ctx, theme, target.locked ? '[ ' + target.name + ' ]' : target.name, 0, 0, width, row, 'center', target.locked ? theme.crisisColor : theme.textColor, font, true);
        const by = row + Math.round((height - row - bar) / 2), rate = target.mhp > 0 ? clamp(target.hp / target.mhp, 0, 1) : 0;
        F.clippedPath(ctx, 0, by, width, bar, bar * 0.5);
        ctx.fillStyle = theme.gauge.back; ctx.fill();
        if (rate > 0) { F.clippedPath(ctx, 0, by, Math.max(Math.round(width * rate), bar), bar, bar * 0.5); ctx.fillStyle = color; ctx.fill(); }
        if (node.showNumbers) F.text(ctx, theme, target.hp + '/' + target.mhp, bar, by, width - bar * 2, bar + 1, 'right', theme.textColor, clamp(Math.round(bar * 0.86), 9, 18), false);
    };

    /** One bar over an opponent in the world, at the origin (`rate` 0 to 1); an alerted one wears a mark above its left end. */
    A.drawWorldBar = function(ctx, width, height, node, rate, alerted) {
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(0, 0, width, height);
        ctx.fillStyle = node.enemyColor;
        ctx.fillRect(1, 1, Math.round((width - 2) * clamp(rate, 0, 1)), height - 2);
        if (alerted) { ctx.fillStyle = '#ffd34a'; ctx.fillRect(0, 0, 2, height); }
    };

    /** The mark on the locked opponent: four corners of a square `size` wide. */
    A.drawLockMarker = function(ctx, size, color) {
        const arm = Math.round(size * 0.28);
        ctx.beginPath();
        for (const [x, dx] of [[2, 1], [size - 2, -1]]) for (const [y, dy] of [[2, 1], [size - 2, -1]]) { ctx.moveTo(x + dx * arm, y); ctx.lineTo(x, y); ctx.lineTo(x, y + dy * arm); }
        ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.stroke();
        ctx.lineWidth = 2; ctx.strokeStyle = color; ctx.stroke();
    };

    /** Where a hit came from: an arc on a ring `size` wide, drawn pointing up (the game turns it toward the hit). */
    A.drawDamageArc = function(ctx, size, color) {
        const m = size / 2, r = m - 10, gradient = ctx.createLinearGradient(0, 0, 0, m);
        gradient.addColorStop(0, color);
        gradient.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.beginPath();
        ctx.arc(m, m, r, -Math.PI / 2 - 0.5, -Math.PI / 2 + 0.5);
        ctx.arc(m, m, r - 16, -Math.PI / 2 + 0.34, -Math.PI / 2 - 0.34, true);
        ctx.closePath();
        ctx.fillStyle = gradient;
        ctx.fill();
    };

    /** The low-HP edge: the screen's rim tinted, its middle clear. Drawn small once and stretched. */
    A.drawVignette = function(ctx, width, height, color) {
        const gradient = ctx.createRadialGradient(width / 2, height / 2, Math.min(width, height) * 0.38, width / 2, height / 2, Math.max(width, height) * 0.72);
        gradient.addColorStop(0, 'rgba(0,0,0,0)');
        gradient.addColorStop(1, color);
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, width, height);
    };

    /** How strong the low-HP edge is (0 to 1) at an HP rate, for a node's threshold. */
    A.vignetteAlpha = function(node, hp, mhp) {
        const low = node.lowHp / 100;
        if (!node.showVignette || !(mhp > 0) || !(low > 0) || hp <= 0) return 0;
        const rate = hp / mhp;
        return rate >= low ? 0 : clamp(0.25 + 0.6 * (1 - rate / low), 0, 0.85);
    };

    /** Action Text at the origin: the objective, or the notices newest first (`lines`: `[{ text, color }]`). */
    A.drawInfo = function(ctx, width, height, node, hud, theme, lines) {
        const color = isHex(node.textColor) ? node.textColor : theme.paletteColor ? theme.paletteColor(Number(node.textColor) || 0) : theme.textColor;
        if (node.actionInfo === 'objective') {
            const size = node.fontSize > 0 ? node.fontSize : clamp(Math.round(height * 0.62), 10, 72);
            if (hud.objective) F.text(ctx, theme, hud.objective, 4, 0, width - 8, height, node.align || 'left', color, size, !!node.fontBold);
            return;
        }
        const count = Math.min(node.feedLines, lines ? lines.length : 0);
        const row = Math.floor(height / node.feedLines), size = node.fontSize > 0 ? node.fontSize : clamp(Math.round(row * 0.7), 10, 28);
        for (let i = 0; i < count; i++) F.text(ctx, theme, lines[i].text, 4, i * row, width - 8, row, node.align || 'left', lines[i].color || color, size, !!node.fontBold);
    };

    /** A key as a key cap shows it: the digit or letter, or the key's short name. */
    A.keyName = function(code) {
        code = Number(code);
        if (code >= 48 && code <= 57) return String(code - 48);
        if (code >= 65 && code <= 90) return String.fromCharCode(code);
        if (code >= 96 && code <= 105) return 'N' + (code - 96);
        if (code >= 112 && code <= 123) return 'F' + (code - 111);
        return { 9: 'Tab', 13: 'Enter', 16: 'Shift', 17: 'Ctrl', 18: 'Alt', 32: 'Space', 27: 'Esc' }[code] || '';
    };

    /** The key each hotbar slot answers to, from a key map (`{ code: name }`, the game's `Input.keyMapper`). */
    A.hotbarKeys = function(mapper, count, out) {
        out = out || [];
        out.length = 0;
        for (let i = 0; i < count; i++) out.push('');
        for (const code of Object.keys(mapper || {})) {
            const match = /^hotbar(\d+)$/.exec(mapper[code]);
            if (match && Number(match[1]) <= count && !out[Number(match[1]) - 1]) out[Number(match[1]) - 1] = A.keyName(code);
        }
        return out;
    };

    //-------------------------------------------------------------------------
    // The stock layouts. First person: small and against the edges. Third
    // person (Action): the same pieces, the vitals and the weapon larger with
    // the player's portrait, the locked opponent marked in the world. Nothing
    // but the crosshair near the middle of the screen.

    A.stockNodes = function(mode, metrics) {
        const width = Number(metrics && metrics.width) || 816, height = Number(metrics && metrics.height) || 624;
        const third = mode !== 'firstPerson';
        const k = clamp(height / 720, 0.8, 1.6);
        const px = value => Math.round(value * k);
        const margin = px(12);
        const visible = { type: 'always', id: 1, on: true, op: '==', value: 0, script: '' };
        let id = 0;
        const node = (type, name, props) => Object.assign({ id: ++id, type, name, parent: 0, anchor: 'topLeft', x: 0, y: 0, opacity: 255, visible: Object.assign({}, visible) },
            A.defaultProps(type), props);
        const vitals = third ? [px(330), px(112)] : [px(280), px(88)], weapon = third ? [px(240), px(112)] : [px(200), px(88)];
        const slot = px(third ? 52 : 46), hot = 8 * (slot + 6);
        const side = Math.floor((width - margin * 2) * 0.3);
        return [
            node('actionDamage', 'Damage', { anchor: 'topLeft', x: 0, y: 0, width, height }),
            node('actionBars', 'Enemy Bars', { anchor: 'top', x: 0, y: Math.round(height * 0.28), width: px(64), height: px(8) + 16, barWidth: px(64), barHeight: Math.max(5, px(7)), lockMarker: third }),
            node('actionCrosshair', 'Crosshair', { anchor: 'center', x: 0, y: 0, width: 96, height: 96 }),
            node('actionInfo', 'Objective', { anchor: 'topLeft', x: margin, y: margin, width: side, height: px(28), actionInfo: 'objective' }),
            node('actionInfo', 'Notices', { anchor: 'topRight', x: -margin, y: margin, width: side, height: px(22) * 4, actionInfo: 'feed', align: 'right' }),
            node('actionTarget', 'Target', { anchor: 'top', x: 0, y: margin, width: Math.min(px(360), width - side * 2 - margin * 4), height: px(50) }),
            node('actionVitals', 'Vitals', { anchor: 'bottomLeft', x: margin, y: -margin, width: vitals[0], height: vitals[1], showPortrait: third }),
            node('actionWeapon', 'Weapon', { anchor: 'bottomRight', x: -margin, y: -margin, width: weapon[0], height: weapon[1] }),
            node('actionHotbar', 'Hotbar', { anchor: 'bottom', x: 0, y: -margin, width: Math.min(hot, width - (Math.max(vitals[0], weapon[0]) + margin * 2) * 2), height: slot, slotSize: slot })
        ];
    };

    /** A mode's stock HUD as a whole record (what a project with none of its own gets, and what Stock Layout builds). */
    A.stockRecord = function(mode, metrics) {
        mode = A.isMode(mode) ? mode : 'action';
        return {
            name: A.MODES[mode].name, mode, background: 'none', cancel: { type: 'none' }, firstFocus: 0,
            openTransition: 'fade', closeTransition: 'fade', transitionDuration: 12, coordinateSpace: 'screen',
            nodes: A.stockNodes(mode, metrics), stock: mode, roles: [mode],
            note: mode === 'firstPerson' ? 'Baseline First Person battle HUD: a crosshair, the vitals lower left, the weapon and its magazine lower right, the hotbar between them, the target on top.'
                : 'Baseline Action battle HUD (third person): as First Person, with the player\'s portrait, larger vitals and weapon, and the locked opponent marked in the world.'
        };
    };

    //-------------------------------------------------------------------------
    // A stand-in HUD object from a project's database, in the battle's own
    // shape: what the editor's canvas shows and what the tests draw.

    A.sampleHud = function(data, options) {
        data = data || {};
        options = options || {};
        const system = data.system || {};
        const actor = (options.party && options.party[0]) || (data.actors || []).find(entry => entry && entry.name) || { id: 1, name: 'Hero', classId: 0, initialLevel: 1 };
        const klass = (data.classes && data.classes[actor.classId]) || null;
        const param = id => Number(klass && klass.params && klass.params[id] && klass.params[id][Number(actor.initialLevel) || 1]) || 0;
        const weapon = (data.weapons && data.weapons[(actor.equips || [])[0]]) || (data.weapons || []).find(entry => entry && entry.name) || { id: 0, name: 'Rifle', iconIndex: 0 };
        const enemy = (data.enemies || []).find(entry => entry && entry.name) || { name: 'Enemy', params: [120] };
        const skills = (data.skills || []).filter(entry => entry && entry.id > 2 && entry.stypeId > 0 && entry.iconIndex > 0 && /^[^\s\-=_#*]/.test(entry.name || '')).slice(0, 4);
        const items = (data.items || []).filter(entry => entry && entry.name && entry.itypeId === 1 && entry.iconIndex > 0).slice(0, 2);
        const mhp = param(0) || 100, mmp = param(1) || 30, ehp = Number(enemy.params && enemy.params[0]) || 120;
        const melee = !!options.melee;
        const hotbar = [...skills.map(skill => ({ kind: 'skill', record: skill })), ...items.map(item => ({ kind: 'item', record: item }))].map((entry, index) => ({
            slot: index + 1, kind: entry.kind, id: entry.record.id, name: entry.record.name, iconIndex: entry.record.iconIndex, key: (entry.kind === 'skill' ? 's' : 'i') + entry.record.id,
            cooldown: index === 1 ? 0.6 : 0, usable: index !== 2 }));
        const hud = {
            unitId: 1, name: actor.name, hp: Math.round(mhp * 0.72), mhp, mp: Math.round(mmp * 0.8), mmp, tp: 35,
            weapon: { id: weapon.id, name: weapon.name, iconIndex: weapon.iconIndex || 0, ranged: !melee, index: 0, count: 3 },
            ammo: { magazine: melee ? 0 : 7, capacity: melee ? 0 : 10, reserve: null, reload: 0 },
            crosshair: { x: 0, y: 0, spread: 12, aiming: false, onTarget: true, hit: 0, kill: 0 },
            target: { unitId: 2, name: enemy.name, hp: Math.round(ehp * 0.6), mhp: ehp, team: 'enemy', locked: !!options.locked },
            hotbar, enemies: [{ unitId: 2, hp: Math.round(ehp * 0.6), mhp: ehp, x: 0, y: 0, visible: true, alerted: true }],
            damage: { pulse: 0.7, angle: 130 }, combo: melee ? 2 : 0, guarding: false, dodging: false,
            objective: 'Defeat all enemies'
        };
        const unit = F ? F.newUnitView() : { icons: [] };
        Object.assign(unit, { name: actor.name, team: 'ally', faceName: actor.faceName || '', faceIndex: Number(actor.faceIndex) || 0,
            characterName: actor.characterName || '', characterIndex: Number(actor.characterIndex) || 0, model: options.modelOf ? options.modelOf(actor, true) || null : null });
        for (const state of (data.states || []).filter(entry => entry && entry.iconIndex > 0).slice(0, 2)) unit.icons.push(state.iconIndex);
        const skillCost = skill => (skill.tpCost > 0 ? String(skill.tpCost) : skill.mpCost > 0 ? String(skill.mpCost) : '');
        return {
            hud, unit,
            extra: {
                steps: melee ? 3 : 0, picture: null, switching: false, carried: [weapon.iconIndex || 0],
                keys: hotbar.map((slot, index) => String(index + 1)),
                costs: hotbar.map(slot => (slot.kind === 'skill' ? skillCost((data.skills || [])[slot.id] || {}) : '')),
                costKinds: hotbar.map(slot => (slot.kind === 'skill' && ((data.skills || [])[slot.id] || {}).tpCost > 0 ? 'tp' : 'mp')),
                costColors: []
            },
            feed: [{ text: A.LABELS.defeated.replace('%1', enemy.name), color: '' }]
        };
    };

    root.ReactorActionHud = A;
    if (typeof module !== 'undefined' && module.exports) module.exports = A;
})(typeof window !== 'undefined' ? window : globalThis);
