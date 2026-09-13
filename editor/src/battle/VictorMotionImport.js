/* Victor Engine Battle Motions and Battler Graphic Setup notetags, read into
 * native action sequences, battler states and battler graphics.
 *
 * Victor queues each motion line on the battle log and drains the queue every
 * frame until a wait: a move, motion, pose, jump or opacity line holds one
 * frame, `wait: user, N` holds N, `wait: user, move` holds until the
 * battler's moves end, and everything else is instant. Moves are given a
 * speed (frames per 120 px), not a duration. The steps written here keep
 * that shape: instant lines are 0-frame steps, one-frame lines are 1-frame
 * steps, tweens run concurrently with a speed in frames per tile, and the
 * waits become blocking steps, so a converted sequence plays on the same
 * frames the notetag did. Side-effect free; shared by the editor and tests.
 */
(function(root) {
    'use strict';
    const B = root.ReactorBattleData || (typeof require === 'function' ? require('../../../runtime/reactor_battle_data.js') : null);
    const V = {};
    const TILE = 48;
    const number = (v, fallback = 0) => Number.isFinite(Number(v)) ? Number(v) : fallback;
    const tiles = px => Math.round(number(px) / TILE * 1000) / 1000;

    // ----- Notes -----------------------------------------------------------
    V.PHASES = ['prepare', 'movement', 'execute', 'effect', 'return', 'finish'];
    // Victor's non-active sequences and the battler state each one plays as.
    V.STATES = { entry: 'entry', inputing: 'input', inputed: 'ready', damage: 'damage', collapse: 'collapse', victory: 'victory', evasion: 'evade', 'magic evasion': 'magicEvade', 'escape sucess': 'escape', 'escape success': 'escape', escape: 'escape', 'escape fail': 'escapeFail' };
    V.SYSTEM_SOUNDS = ['cursor', 'ok', 'cancel', 'buzzer', 'equip', 'save', 'load', 'battle start', 'escape', 'enemy attack', 'enemy damage', 'enemy collapse', 'boss collapse 1', 'boss collapse 2', 'actor damage', 'actor collapse', 'recovery', 'miss', 'evasion', 'magic evasion', 'reflection', 'shop', 'use item', 'use skill'];

    V.parseBlocks = note => [...String(note || '').matchAll(/<action sequence:\s*([^>]+)>([\s\S]*?)<\/action sequence>/gi)]
        .map(m => ({ kind: m[1].trim().toLowerCase(), motions: V.parseMotions(m[2]) }));
    V.parseMotions = text => String(text || '').split(/\r?\n|;/).map(l => l.trim()).filter(l => l && !l.startsWith('#')).map(line => {
        const m = line.match(/^([a-z][a-z ]*?)\s*:\s*(.*)$/i);
        if (!m) return { name: line.toLowerCase().replace(/\s+/g, ' '), args: [], raw: '' };
        return { name: m[1].trim().toLowerCase().replace(/\s+/g, ' '), args: m[2].split(',').map(s => s.trim()), raw: m[2].trim() };
    });
    V.parseThrows = note => [...String(note || '').matchAll(/<throw object:?\s*([^>]*)>([\s\S]*?)<\/throw object>/gi)].map(m => {
        const spec = { timing: (m[1] || 'before').trim().toLowerCase() || 'before' };
        for (const line of m[2].split(/\r?\n/)) {
            const t = line.trim(), kv = t.match(/^([a-z]+)\s*:\s*(.*)$/i);
            if (!kv) { if (/^return$/i.test(t)) spec.return = true; continue; }
            const key = kv[1].toLowerCase(), value = kv[2].trim();
            if (key === 'image') {
                const img = value.match(/^(weapon|icon|picture|animation)\s*(.*)$/i);
                spec.image = img ? { kind: img[1].toLowerCase(), value: img[2].replace(/^['"]|['"]$/g, '').trim() } : { kind: 'icon', value: value };
            } else if (key === 'start' || key === 'end') { const xy = value.split(/[,\s]+/).map(Number); spec[key] = { x: xy[0] || 0, y: xy[1] || 0 }; }
            else spec[key] = Number(value);
        }
        return spec;
    });
    V.parseSpriteMotion = note => {
        const result = {};
        for (const m of String(note || '').matchAll(/<sprite motion:\s*['"]?([^'">]*)['"]?>([\s\S]*?)<\/sprite motion>/gi)) {
            const motions = {};
            for (const line of m[2].split(/\r?\n/)) {
                const mm = line.trim().match(/^([a-z]+)\s*:\s*(.*)$/i); if (!mm) continue;
                const setup = {};
                for (const part of mm[2].split(',')) { const kv = part.trim().match(/^([a-z]+)\s*:\s*(.*)$/i); if (kv) setup[kv[1].toLowerCase()] = kv[2].trim(); }
                const entry = {};
                if (setup.loop !== undefined) entry.loop = setup.loop === 'true' ? true : setup.loop === 'once' ? 'once' : false;
                if (setup.speed !== undefined) entry.speed = Math.max(1, number(setup.speed, 12));
                if (setup.frames !== undefined) entry.frames = Math.max(1, number(setup.frames, 3));
                if (setup.index !== undefined) entry.index = Math.max(0, number(setup.index, 1) - 1);
                if (setup.direction !== undefined) entry.direction = { down: 2, left: 4, right: 6, up: 8 }[setup.direction.toLowerCase()] || undefined;
                motions[mm[1].toLowerCase()] = entry;
            }
            result[m[1].trim()] = motions;
        }
        return result;
    };

    // ----- Subjects --------------------------------------------------------
    V.subject = (text, reaction = false) => {
        const t = String(text || 'user').toLowerCase().replace(/\s+/g, ' ').trim();
        if (reaction) return { role: 'user' };
        if (t === 'user') return { role: 'user' };
        if (t === 'subject' || t === 'subjects') return { role: 'subject' };
        if (t === 'target') return { role: 'target' };
        const groups = { target: 'allTargets', targets: 'allTargets', actor: 'actors', actors: 'actors', enemy: 'enemies', enemies: 'enemies', enemie: 'enemies', battler: 'battlers', battlers: 'battlers', friend: 'friends', friends: 'friends', opponent: 'opponents', opponents: 'opponents' };
        let m = t.match(/^(all|alive|dead|active|inactive|movable|moved|other|random)\s+(targets?|actors?|enemies|enemy|enemie|battlers?|friends?|opponents?)$/);
        if (m) {
            const role = groups[m[2]], out = { role };
            if (['alive', 'dead', 'active', 'inactive', 'movable', 'moved', 'random'].includes(m[1])) out.filter = m[1];
            if (m[1] === 'other') out.excludeUser = true;
            return out;
        }
        m = t.match(/^(other\s+)?(target|actor|party|enemy|friend|opponent)\s+(\d+)$/);
        if (m) {
            const n = Math.max(0, Number(m[3]) - 1);
            if (m[2] === 'target') return { role: 'target', targetIndex: n };
            if (m[2] === 'actor') return { role: 'actors', actorId: Number(m[3]) };
            return { role: { party: 'actors', enemy: 'enemies', friend: 'friends', opponent: 'opponents' }[m[2]], memberIndex: n, ...(m[1] ? { excludeUser: true } : {}) };
        }
        return { role: 'user' };
    };

    // ----- Motions to steps --------------------------------------------------
    /**
     * Convert one notetag block. `options`: reaction (roles collapse to the
     * user), vertical (the formation stands top and bottom, so "front" of a
     * target is a sprite height away rather than a third of two widths),
     * distance (tiles a to-target or to-home move is guessed to cover when a
     * duration must be shown before the battle knows), animations (the
     * project's animation list, to size a wait for a fixed animation).
     */
    V.convertBlock = (motions, options = {}) => {
        const reaction = !!options.reaction, steps = [], notes = [];
        const pendingMove = {}, pendingAnimation = {}, facing = {};
        let hold = 0, sinceMove = 0, depth = 0;
        const roleKey = step => B.roleKey(step);
        const est = tilesAway => Math.max(1, Math.round(tilesAway));
        const flushHold = () => { if (hold > 0) { const last = steps.at(-1); if (last && last.type === 'wait' && !last.waitFor) last.duration += hold; else steps.push(B.step('wait', { duration: hold })); hold = 0; } };
        const push = (type, extra) => { flushHold(); const step = B.step(type, { duration: 0, ...extra }); steps.push(step); sinceMove++; return step; };
        const subjectOf = arg => { const s = V.subject(arg, reaction); return s; };
        // The way a battler faces when a move is read: the last Face Direction given to it in this block, else the record's default (actors look left in side view, up in a top-and-bottom formation; enemies the reverse).
        const facingOf = key => facing[key] || options.facing || (options.vertical ? 'up' : 'left');
        const numeric = v => /^[+-]?\d+(\.\d+)?$/.test(String(v || '').trim());
        for (const motion of motions) {
            const { name, args, raw } = motion;
            const subject = subjectOf(args[0]);
            const key = roleKey(subject);
            switch (name) {
                case 'wait': {
                    const what = (args[1] || '').toLowerCase();
                    if (!what) break;
                    if (numeric(what)) { const n = Math.max(0, Math.round(Number(what))); const last = steps.at(-1); if (last && last.type === 'wait' && !last.waitFor && hold === 0) last.duration += n; else { hold += n; flushHold(); } break; }
                    if (what === 'move' || what === 'jump') {
                        const pending = pendingMove[key];
                        if (pending && steps.at(-1) === pending.step) { delete pending.step.concurrent; hold = 0; }
                        else if (pending) { hold = 0; push('wait', { role: subject.role, targetIndex: subject.targetIndex, waitFor: 'move', duration: 0 }); }
                        delete pendingMove[key];
                        break;
                    }
                    if (what === 'animation') {
                        const pending = pendingAnimation[key];
                        if (pending && steps.at(-1) === pending) { pending.waitForCompletion = true; hold = 0; }
                        else { const length = pending?.animationId ? V.animationLength(options.animations, pending.animationId) : 0; hold = 0; push('wait', { waitFor: length ? undefined : 'animation', duration: length }); }
                        delete pendingAnimation[key];
                        break;
                    }
                    if (what === 'popup' || what === 'effecting' || what === 'motion') { hold = 0; push('wait', { waitFor: what, duration: 0 }); break; }
                    // 'action' waits for called sequences: the effect is inlined, nothing to wait for.
                    break;
                }
                case 'move': {
                    const type = (args[1] || '').toLowerCase(), speed = number(args[2]), distance = (args[3] || '').toLowerCase(), offset = number(args[4]);
                    const step = { role: subject.role, targetIndex: subject.targetIndex, easing: 'linear', anchor: 'home', moveMode: 'anchor', x: 0, y: 0, z: 0, duration: 0 };
                    let guess = options.distance ?? 7;
                    if (type === 'to target' || type === 'close to target' || type === 'to home') {
                        if (type === 'to home') { step.anchor = 'home'; }
                        else {
                            const front = /front/.test(distance), behind = /behind/.test(distance), amount = number((distance.match(/([+-]?\d+)/) || [])[1]), plain = /^[+-]?\d+$/.test(distance);
                            // Victor measured 'front' as a sprite height (facing up or down) or a third of two widths (left or right) from the target, plus a number
                            // laid along the screen axis: it grows the gap for a battler facing up or left and shrinks it for one facing down or right.
                            const f = facingOf(key), vertical = f === 'up' || f === 'down', base = vertical ? TILE : Math.round(TILE * 2 / 3), sign = f === 'up' || f === 'left' ? 1 : -1;
                            const before = base + amount * sign, beyond = base - amount * sign;
                            if (front || behind) {
                                if (vertical) { step.anchor = 'target'; step.x = tiles(offset); step.y = tiles((f === 'up' ? 1 : -1) * (front ? before : -beyond)); }
                                else { step.anchor = 'approach'; step.x = tiles(front ? -before : beyond); step.y = tiles(offset); }
                            }
                            else if (type === 'close to target') { step.anchor = 'approach'; step.x = -tiles(number(distance)); step.y = tiles(offset); }
                            else { step.anchor = 'target'; step.x = plain ? tiles(amount) : 0; step.y = tiles(offset); }
                        }
                    } else if (type === 'forward' || type === 'backward') { step.moveMode = type; step.x = tiles(distance); step.y = tiles(offset); guess = Math.abs(step.x); }
                    else if (type === 'to position' || type === 'close to position') { step.moveMode = 'position'; step.x = tiles(distance); step.y = tiles(offset); }
                    else { notes.push('move type "' + type + '" is not supported'); break; }
                    if (speed > 0) { step.speed = Math.round(speed * TILE / 120 * 1000) / 1000; step.duration = est(step.speed * guess); step.concurrent = true; }
                    else step.duration = 0;
                    const made = push('move', step);
                    if (made.concurrent) { pendingMove[key] = { step: made }; sinceMove = 0; hold += 1; }
                    else delete pendingMove[key];
                    break;
                }
                case 'motion': {
                    const value = (args[1] || 'idle').toLowerCase();
                    const step = { role: subject.role, targetIndex: subject.targetIndex, duration: 1 };
                    if (numeric(value)) {
                        step.motion = 'idle'; step.motionIndex = Math.max(1, Number(value));
                        if (args[2] !== undefined && numeric(args[2])) step.motionFrames = Math.max(1, Number(args[2]));
                        if (args[3] !== undefined && numeric(args[3])) step.motionSpeed = Math.max(1, Number(args[3]));
                        const loop = args.slice(2).map(a => String(a).toLowerCase()).find(a => a === 'loop' || a === 'once');
                        if (loop) step.motionLoop = loop === 'loop' ? 'loop' : 'hold';
                    } else step.motion = { reset: 'idle', clear: 'idle', action: 'attack', attack: 'attack', move: 'walk', gaurd: 'guard' }[value] || value;
                    push('motion', step);
                    break;
                }
                case 'direction': {
                    const value = (args[1] || 'targets').toLowerCase();
                    const step = { role: subject.role, targetIndex: subject.targetIndex, duration: 0 };
                    if (numeric(value)) { step.direction = 'position'; step.position = Number(value); }
                    else step.direction = { back: 'behind', behing: 'behind', target: 'targets', opponent: 'opponents' }[value] || value;
                    if (!B.commands.direction.fields[0].options.includes(step.direction)) { notes.push('direction "' + value + '" is not supported'); break; }
                    if (['up', 'down', 'left', 'right'].includes(step.direction)) facing[key] = step.direction;
                    push('direction', step);
                    break;
                }
                case 'animation': {
                    const value = (args[1] || 'action').toLowerCase();
                    const step = { role: subject.role, targetIndex: subject.targetIndex, duration: 0 };
                    if (numeric(value)) step.animationId = Number(value); else if (value === 'action' || value === 'weapon') { step.animationSource = value; step.animationId = 0; } else { notes.push('animation "' + value + '" is not supported'); break; }
                    pendingAnimation[key] = push('animation', step);
                    break;
                }
                case 'icon': case 'picture': case 'weapon': {
                    const step = { role: subject.role, targetIndex: subject.targetIndex, duration: 0, operation: 'show', space: args[0] && args[0].toLowerCase() === 'screen' ? 'screen' : 'battler' };
                    let rest = args.slice(1);
                    if (name === 'weapon') { if ((rest[0] || '').toLowerCase() === 'clear') { push('icon', { ...step, operation: 'clear', index: number(rest[1], 1), source: 'equip' }); break; } step.source = 'equip'; step.equipIndex = 1; rest = rest.slice(1); }
                    else if ((rest[0] || '').toLowerCase() === 'clear') { push(name, { ...step, operation: 'clear', index: number(rest[1], 1) }); break; }
                    else if (name === 'icon') {
                        const kind = (rest[0] || '').toLowerCase().match(/^(icon|equip|shield|action)\s*(\d+)?$/);
                        if (!kind) { notes.push('icon type "' + rest[0] + '" is not supported'); break; }
                        step.source = kind[1]; if (kind[1] === 'icon') step.iconIndex = number(kind[2]); if (kind[1] === 'equip') step.equipIndex = Math.max(1, number(kind[2], 1));
                        if (step.source === 'icon' && options.record && options.record.iconIndex > 0 && step.iconIndex === options.record.iconIndex) { step.source = 'action'; delete step.iconIndex; }
                        rest = rest.slice(1);
                    } else {
                        if ((rest[0] || '').toLowerCase() === 'move') { push('picture', { ...step, operation: 'move', index: number(rest[1], 1), x: number(rest[2]), y: number(rest[3]), opacity: number(rest[4], 255), duration: Math.max(0, number(rest[5])) }); break; }
                        step.name = rest[0] || ''; rest = rest.slice(1);
                    }
                    const above = rest.length && /^above$/i.test(rest.at(-1)); if (above) rest = rest.slice(0, -1);
                    step.index = number(rest[0], 1); step.x = number(rest[1]); step.y = number(rest[2]); step.opacity = number(rest[3], 255); step.angle = number(rest[4]); step.spin = number(rest[5]);
                    step.layer = above ? 'above' : 'below';
                    push(name === 'weapon' ? 'icon' : name, step);
                    break;
                }
                case 'se': {
                    const type = (args[0] || '').toLowerCase();
                    if (type === 'stop') { push('se', { operation: 'stop', duration: 0 }); break; }
                    if (type === 'play') { push('se', { operation: 'play', name: args[1] || '', volume: number(args[2], 90), pitch: number(args[3], 100), pan: number(args[4]), duration: 0 }); break; }
                    const system = type.replace(/^play\s+/, ''), index = V.SYSTEM_SOUNDS.indexOf(system);
                    if (index >= 0) push('se', { operation: 'system', soundId: index, duration: 0 }); else notes.push('se "' + raw + '" is not supported');
                    break;
                }
                case 'jump': case 'leap': case 'float': case 'fall': {
                    const height = (args[1] || '').toLowerCase() === 'to ground' ? 0 : tiles(number(args[1])), when = (args[2] || '').toLowerCase();
                    const pending = pendingMove[key];
                    if (when === 'movement' && pending && name === 'jump') { pending.step.arc = height; break; }
                    const duration = when === 'movement' ? (pending ? pending.step.duration : 0) : Math.max(0, number(args[2]));
                    push(name, { role: subject.role, targetIndex: subject.targetIndex, height, duration, concurrent: duration > 0 ? true : undefined });
                    hold += 1;
                    break;
                }
                case 'opacity': {
                    const when = (args[2] || '').toLowerCase(), pending = pendingMove[key];
                    const duration = when === 'movement' ? (pending ? pending.step.duration : 0) : Math.max(0, number(args[2]));
                    push('opacity', { role: subject.role, targetIndex: subject.targetIndex, opacity: Math.max(0, Math.min(255, number(args[1], 255))), duration, concurrent: duration > 0 ? true : undefined });
                    hold += 1;
                    break;
                }
                case 'pose': {
                    const value = (args[1] || 'clear').toLowerCase();
                    if (value === 'clear') push('pose', { role: subject.role, targetIndex: subject.targetIndex, operation: 'clear', duration: 1 });
                    else push('pose', { role: subject.role, targetIndex: subject.targetIndex, operation: 'hold', motion: numeric(value) ? value : value, frame: Math.max(1, number(args[2], 1)), duration: 1 });
                    break;
                }
                case 'flash': push('flash', { red: number(args[0]), green: number(args[1]), blue: number(args[2]), alpha: number(args[3], 160), duration: Math.max(0, number(args[4], 20)), concurrent: true }); break;
                case 'shake': push('shake', { power: number(args[0], 5), speed: number(args[1], 5), duration: Math.max(0, number(args[2], 30)), concurrent: true }); break;
                case 'balloon': push('balloon', { role: subject.role, targetIndex: subject.targetIndex, balloonId: Math.max(1, number(args[1], 1)), duration: 0 }); break;
                case 'whiten': push('whiten', { role: subject.role, targetIndex: subject.targetIndex, duration: 0 }); break;
                case 'tint': {
                    const first = (args[0] || '').toLowerCase(), space = first === 'upper' || first === 'lower' ? first : 'battler', presets = { black: [-255, -255, -255, 0], dark: [-68, -68, -68, 0], sepia: [34, -34, -68, 170], sunset: [68, -34, -34, 0], night: [-68, -68, 0, 68], clear: [0, 0, 0, 0] };
                    const preset = presets[(args[1] || '').toLowerCase()], tone = preset || [number(args[1]), number(args[2]), number(args[3]), number(args[4])], duration = Math.max(0, number(preset ? args[2] : args[5]));
                    push('tint', { role: space === 'battler' ? subject.role : 'user', targetIndex: subject.targetIndex, space, red: tone[0], green: tone[1], blue: tone[2], gray: tone[3], duration, concurrent: duration > 0 ? true : undefined });
                    break;
                }
                case 'action': {
                    if ((args[1] || '').toLowerCase() === 'effect') push('effect', { role: subject.role === 'user' ? 'allTargets' : subject.role, targetIndex: subject.targetIndex, duration: 0 });
                    else notes.push('action "' + raw + '" calls a sequence that is not imported');
                    break;
                }
                case 'effect': push('impact', { role: subject.role === 'subject' && reaction ? 'user' : subject.role, targetIndex: subject.targetIndex, rate: number(String(args[1] || '100').replace('%', ''), 100), duration: 0 }); hold += 1; break;
                // Victor ignored an else or end with no if open, and closed what was left open at the end of the block.
                case 'if': depth++; push('branch', { condition: raw || 'true', duration: 0 }); break;
                case 'else if': if (depth) push('elseIf', { condition: raw || 'true', duration: 0 }); break;
                case 'else': if (depth) push('else', { duration: 0 }); break;
                case 'end': if (depth) { depth--; push('end', { duration: 0 }); } break;
                case 'eval': push('eval', { code: raw, duration: 0 }); break;
                case 'event': push('event', { eventId: Math.max(1, number(args[0], 1)), duration: 0 }); break;
                case 'formula': push('formula', { operation: (raw || '').toLowerCase() === 'clear' ? 'clear' : 'set', formula: raw, duration: 0 }); break;
                case 'element': push('element', { operation: (raw || '').toLowerCase() === 'clear' ? 'clear' : 'set', elements: raw, duration: 0 }); break;
                case 'hp': case 'mp': case 'tp': push(name, { role: subject.role, targetIndex: subject.targetIndex, amount: String(args[1] || '0').replace(/^\+/, ''), percent: 'points', show: args[2] ? 'show' : 'silent', duration: 0 }); break;
                case 'buff': push('buff', { role: subject.role, targetIndex: subject.targetIndex, operation: (args[1] || 'increase').toLowerCase(), param: (args[2] || 'atk').toLowerCase() === 'hp' ? 'mhp' : (args[2] || 'atk').toLowerCase() === 'mp' ? 'mmp' : (args[2] || 'atk').toLowerCase(), turns: number(args[3], 3), show: args[4] ? 'show' : 'silent', duration: 0 }); break;
                case 'state': push('state', { role: subject.role, targetIndex: subject.targetIndex, operation: (args[1] || 'add').toLowerCase(), stateId: Math.max(1, number(args[2], 1)), show: args[3] ? 'show' : 'silent', duration: 0 }); break;
                case 'kill': push('kill', { role: subject.role, targetIndex: subject.targetIndex, duration: 0 }); break;
                case 'home': push('home', { role: subject.role, targetIndex: subject.targetIndex, operation: (args[1] || '').toLowerCase() === 'here' ? 'here' : 'position', x: tiles(number(args[1])), y: tiles(number(args[2])), duration: 0 }); break;
                case 'switch': push('switch', { switchId: Math.max(1, number(args[0], 1)), operation: (args[1] || 'on').toLowerCase(), duration: 0 }); break;
                case 'variable': { const m = String(args[1] || '').match(/^([=+\-*/%])?\s*(.*)$/); push('variable', { variableId: Math.max(1, number(args[0], 1)), operation: { '+': 'add', '-': 'subtract', '*': 'multiply', '/': 'divide', '%': 'modulo' }[m[1]] || 'set', amount: m[2], duration: 0 }); break; }
                case 'item': { const kind = (args[0] || 'item').toLowerCase(); push('item', { kind: kind === 'gold' ? 'gold' : kind + 's', itemId: kind === 'gold' ? 1 : Math.max(1, number(args[1], 1)), amount: String(kind === 'gold' ? args[1] : args[2] || '1').replace(/^\+/, ''), duration: 0 }); break; }
                case 'target': push((args[0] || '').toLowerCase() === 'clear' ? 'target' : 'target', { operation: (args[0] || '').toLowerCase() === 'clear' ? 'clear' : 'select', role: subject.role, targetIndex: subject.targetIndex, filter: subject.filter, duration: 0 }); break;
                case 'clear targets': push('clearTargets', { duration: 0 }); break;
                case 'battleback': push('battleback', { operation: ['save', 'restore'].includes((args[0] || '').toLowerCase()) ? args[0].toLowerCase() : 'change', floor: args[0] || '', background: args[1] || '', duration: 0 }); break;
                case 'battlestatus': push('battlestatus', { operation: (args[0] || 'show').toLowerCase(), duration: 0 }); break;
                case 'battlelog': push('battlelog', { operation: (args[0] || 'clear').toLowerCase(), text: args.slice(1).join(', '), duration: 0 }); break;
                case 'bgm': case 'bgs': { const op = (args[0] || 'play').toLowerCase().replace(/\s+/g, ''); push(name, { operation: ['fadein', 'fadeout', 'stop', 'save', 'resume'].includes(op) ? op.replace('fadein', 'fadeIn').replace('fadeout', 'fadeOut') : 'play', name: op === 'play' ? args[1] || '' : '', volume: number(args[2], 90), pitch: number(args[3], 100), pan: number(args[4]), fade: number(args[1], 60), duration: 0 }); break; }
                case 'movie': push('movie', { name: raw, duration: 0 }); break;
                case 'plane': notes.push('plane "' + raw + '" is not imported'); break;
                case 'throw': notes.push('throw "' + raw + '" is handled by the throw object tag'); break;
                default: notes.push('motion "' + name + '" is not supported');
            }
        }
        flushHold();
        while (depth-- > 0) steps.push(B.step('end', { duration: 0 }));
        return { steps: V.collapseIconRuns(steps), notes };
    };

    // Victor swung a weapon by redrawing its icon at a new offset and angle
    // every frame. A run of those icon lines, one wait apart, becomes one
    // weapon Show followed by Move steps that tween offset and rotation over
    // the same frames; frames whose per-frame change is the same fold into
    // one Move, so a straight swing is a single editable step. A later clear
    // of that icon index hides the weapon. Icon flip-books (a different icon
    // each frame at one spot) stay icons.
    V.collapseIconRuns = steps => {
        const out = [], held = new Set();
        const same = (a, b) => a.role === b.role && a.targetIndex === b.targetIndex && a.index === b.index && a.source === b.source && (a.iconIndex || 0) === (b.iconIndex || 0) && (a.equipIndex || 1) === (b.equipIndex || 1) && a.space === b.space;
        const shown = s => s.type === 'icon' && s.operation === 'show' && s.space !== 'screen' && ['icon', 'equip', 'action', 'shield'].includes(s.source);
        const pose = s => ({ x: tiles(s.x), y: 0, z: -tiles(s.y), rotation: number(s.angle), scale: 1 });
        const source = s => s.source === 'equip' ? 'weapon' : s.source;
        let i = 0;
        while (i < steps.length) {
            const first = steps[i];
            if (!shown(first)) {
                const key = first.type === 'icon' && first.operation === 'clear' ? first.role + '/' + first.index : null;
                if (key && held.has(key)) { held.delete(key); out.push(B.step('weapon', { role: first.role, targetIndex: first.targetIndex, mode: 'hide', visible: false, duration: 0 })); i++; continue; }
                out.push(first); i++; continue;
            }
            // Gather icon, wait, icon, wait… with the same icon at a changing offset or angle.
            const run = [{ step: first, wait: 0 }]; let j = i + 1;
            while (j + 1 < steps.length && steps[j].type === 'wait' && !steps[j].waitFor && steps[j].duration >= 1 && shown(steps[j + 1]) && same(first, steps[j + 1])) { run.push({ step: steps[j + 1], wait: steps[j].duration }); j += 2; }
            const moves = run.some(r => r.step.x !== first.x || r.step.y !== first.y || r.step.angle !== first.angle);
            if (run.length < 2 || !moves) { out.push(first); i++; continue; }
            const key = first.role + '/' + first.index; held.add(key);
            const start = pose(first);
            out.push(B.step('weapon', { role: first.role, targetIndex: first.targetIndex, mode: 'show', iconSource: source(first), iconIndex: first.iconIndex || 0, equipIndex: first.equipIndex || 1, attachment: 'offset', ...start, duration: 0 }));
            let previous = start, segment = null;
            for (const entry of run.slice(1)) {
                const next = pose(entry.step), frames = Math.max(1, entry.wait), rate = { x: (next.x - previous.x) / frames, z: (next.z - previous.z) / frames, rotation: (next.rotation - previous.rotation) / frames };
                // Rotation must match exactly; the offset may wander by a pixel or two a frame, the way a hand-placed icon does.
                const close = (a, b, tolerance = 1e-6) => Math.abs(a - b) <= tolerance;
                if (segment && close(segment.rate.x, rate.x, 0.06) && close(segment.rate.z, rate.z, 0.06) && close(segment.rate.rotation, rate.rotation)) { segment.step.duration += frames; Object.assign(segment.step, { x: next.x, z: next.z, rotation: next.rotation }); }
                else { const step = B.step('weapon', { role: first.role, targetIndex: first.targetIndex, mode: 'move', ...next, easing: 'linear', duration: frames }); out.push(step); segment = { step, rate }; }
                previous = next;
            }
            i = j;
        }
        return out;
    };
    V.animationLength = (animations, id) => { const a = animations?.[id]; if (!a) return 0; if (Array.isArray(a.frames)) return a.frames.length * 4; return 0; };

    // A throw object as a projectile step: what flies, how long, how high.
    // A throw that shows the record's own icon is the action's icon: read that way, every item or skill thrown the same way shares one sequence.
    V.throwStep = (spec, options = {}, record = null) => {
        const step = { role: 'user', destination: 'allTargets', attachment: 'offset', duration: Math.max(1, Math.round(spec.duration || (options.distance ?? 7) * TILE * 5 / (spec.speed || 100))), arc: spec.arc !== undefined ? tiles(spec.arc) : 0, spin: number(spec.spin), flight: spec.return ? 'return' : 'oneWay', iconSource: 'icon', iconIndex: 0, easing: 'linear' };
        const image = spec.image || { kind: 'weapon' };
        if (image.kind === 'icon' && record && number(image.value) === record.iconIndex && record.iconIndex > 0) step.iconSource = 'action';
        else if (image.kind === 'icon') { step.iconSource = 'icon'; step.iconIndex = number(image.value); }
        else if (image.kind === 'picture') { step.iconSource = 'picture'; step.name = image.value; }
        else if (image.kind === 'animation') { step.iconSource = 'animation'; step.animationId = number(image.value); }
        else step.iconSource = 'weapon';
        if (spec.start) { step.x = tiles(spec.start.x); step.z = Math.round((0.5 - spec.start.y / TILE) * 1000) / 1000; }
        if (spec.end) { step.endHeight = Math.round((0.5 - spec.end.y / TILE) * 1000) / 1000; }
        if (spec.delay) step.delay = spec.delay;
        return step;
    };

    // ----- Records -----------------------------------------------------------
    /** Everything one database record's note says, in native terms. */
    V.convertRecord = (record, options = {}) => {
        const blocks = V.parseBlocks(record.note), throws = V.parseThrows(record.note), phases = {}, states = {}, notes = [];
        for (const block of blocks) {
            if (V.PHASES.includes(block.kind)) { const out = V.convertBlock(block.motions, { ...options, record }); phases[block.kind] = out.steps; notes.push(...out.notes.map(n => block.kind + ': ' + n)); }
            else if (V.STATES[block.kind]) { const out = V.convertBlock(block.motions, { ...options, reaction: true }); states[V.STATES[block.kind]] = out.steps; notes.push(...out.notes.map(n => block.kind + ': ' + n)); }
            else notes.push('sequence "' + block.kind + '" is not a phase or state');
        }
        // A throw needs an Execute to fly in: the record's own, else Victor's default (the action motion, then the effect).
        if (throws.length && !phases.execute && (options.throwsNeedExecute ?? true)) phases.execute = [B.step('motion', { motion: 'attack', duration: 1 }), B.step('wait', { duration: 8 }), B.step('effect', { role: 'allTargets', duration: 0 })];
        for (const spec of throws) {
            const step = V.throwStep(spec, options, record), list = phases.execute, at = list.findIndex(s => s.type === 'effect');
            if (spec.timing === 'after') list.splice(at >= 0 ? at + 1 : list.length, 0, B.step('projectile', step));
            else list.splice(at >= 0 ? at : list.length, 0, B.step('projectile', { ...step, ...(spec.timing === 'during' ? { concurrent: true } : {}) }));
        }
        // Victor's Effect, when the record drives Execute: the action animation, the hit once it has played, the popups.
        if (phases.execute && !phases.effect && (options.defaultEffect ?? true)) phases.effect = [B.step('animation', { animationSource: 'action', animationId: 0, role: 'allTargets', duration: 0, waitForCompletion: true }), B.step('impact', { role: 'allTargets', duration: 0 }), B.step('wait', { waitFor: 'popup', duration: 0 })];
        return { phases, states, notes };
    };

    V.IMPORT_NOTE = 'Imported from Victor Engine Battle Motions notetags.';
    V.isImported = sequence => !!sequence && typeof sequence.note === 'string' && sequence.note.startsWith('Imported from Victor Engine');
    V.sequenceFromPhases = (phases, name) => {
        const provided = V.PHASES.filter(p => phases[p]), steps = [];
        for (const phase of provided) for (const step of phases[phase]) steps.push({ ...step, phase });
        const sequence = { id: 0, version: 1, name, note: V.IMPORT_NOTE, phases: provided, steps };
        if (steps.filter(s => s.type === 'impact').length > 1) sequence.hitPolicy = 'authored';
        return sequence;
    };
    V.stateSequence = (steps, name) => ({ id: 0, version: 1, name, purpose: 'motion', note: V.IMPORT_NOTE, steps: steps.map(s => ({ ...s, role: 'user' })) });

    // ----- Graphics ----------------------------------------------------------
    // Victor's default charset motions: still on the standing column, walking
    // in place for walk and wait, a beat of the damage column when hit.
    V.defaultSheetMotions = () => ({ idle: { loop: false, speed: 9999 }, walk: { loop: true, speed: 8 }, wait: { loop: true, speed: 6 }, damage: { loop: false, speed: 6 } });
    V.actorGraphic = (actor, mode = 'charset') => {
        if (mode !== 'charset' || !actor.characterName) return null;
        const motions = V.defaultSheetMotions(), sheet = V.parseSpriteMotion(actor.note)[actor.characterName];
        if (sheet) for (const [k, v] of Object.entries(sheet)) motions[k] = { ...motions[k], ...v };
        return { mode: 'character', name: actor.characterName, index: actor.characterIndex || 0, motions, ...(/<hide shadows?>/i.test(actor.note) ? { hideShadow: true } : {}) };
    };
    V.enemyGraphic = (enemy, mode = 'charset') => {
        const name = enemy.battlerName || '';
        if (!(name.startsWith('!') || (mode === 'charset' && name && !name.startsWith('$') && !name.startsWith('%')))) return null;
        if (!name.startsWith('!')) return null;
        const motions = V.defaultSheetMotions(), sheet = V.parseSpriteMotion(enemy.note)[name];
        if (sheet) for (const [k, v] of Object.entries(sheet)) motions[k] = { ...motions[k], ...v };
        const index = enemy.note.match(/<charset index:\s*(\d+)>/i);
        return { mode: 'character', name, index: index ? Number(index[1]) : 0, motions, ...(/<hide shadows?>/i.test(enemy.note) ? { hideShadow: true } : {}) };
    };

    // ----- Whole project -----------------------------------------------------
    /**
     * Read every note in the database tables into sequences and assignments.
     * Identical results share one sequence, named after the first record that
     * produced it. `existing` sequences are kept in place and extended.
     */
    // Two sequences are near enough to be one when every step matches in
    // kind and only hand-tuned numbers differ a little: an offset by a few
    // pixels, a swing angle by a few degrees, a wait by a few frames. Records
    // of one kind (and, for weapons, one weapon type) that convert to such
    // near-twins share the first one, the way Victor's author meant one
    // choreography per kind of weapon and tuned it per icon.
    V.NEAR = { tiles: 1, pixels: 24, degrees: 45, frames: 30, speed: 6, rate: 0 };
    V.similar = (a, b) => {
        if (!a || !b || (a.purpose || 'action') !== (b.purpose || 'action') || (a.hitPolicy || 'once') !== (b.hitPolicy || 'once') || a.steps.length !== b.steps.length) return false;
        if (JSON.stringify(a.phases || null) !== JSON.stringify(b.phases || null)) return false;
        const tile = ['x', 'y', 'z', 'arc', 'height', 'startHeight', 'endHeight'], pixels = ['position'], degrees = ['rotation', 'rotateX', 'rotateY', 'rotateZ', 'angle', 'spin'], frames = ['duration', 'fade', 'turns', 'frame', 'motionFrames', 'motionSpeed'], speed = ['speed'];
        for (let i = 0; i < a.steps.length; i++) {
            const x = a.steps[i], y = b.steps[i];
            const keys = new Set([...Object.keys(x), ...Object.keys(y)].filter(k => k !== 'id'));
            for (const k of keys) {
                const u = x[k], v = y[k];
                if (u === v || (u == null && v == null)) continue;
                if (typeof u !== 'number' || typeof v !== 'number') return false;
                const pixel = (x.type === 'icon' || x.type === 'picture' || x.type === 'plane') && (k === 'x' || k === 'y');
                const limit = pixel || pixels.includes(k) ? V.NEAR.pixels : tile.includes(k) ? V.NEAR.tiles : degrees.includes(k) ? V.NEAR.degrees : frames.includes(k) ? V.NEAR.frames : speed.includes(k) ? V.NEAR.speed : k === 'opacity' ? 32 : V.NEAR.rate;
                if (Math.abs(u - v) > limit) return false;
            }
        }
        return true;
    };
    V.importDatabase = (data, options = {}) => {
        // An earlier import is replaced, not stacked: its sequences go, hand-made ones keep their ids.
        const sequences = Array.isArray(options.existing) && options.existing.length ? options.existing.map(s => s && !V.isImported(s) ? JSON.parse(JSON.stringify(s)) : null) : [null];
        while (sequences.length > 1 && sequences.at(-1) === null) sequences.pop();
        const settings = { version: 1, troops: options.troops || {}, skills: {}, items: {}, weapons: {}, actors: {}, enemies: {}, classes: {}, states: {} };
        const shared = new Map(), groups = new Map(), report = { records: 0, sequences: 0, states: 0, graphics: 0, notes: [] };
        const clean = name => String(name || '').replace(/\\i\[\d+\]/g, '').trim();
        const key = s => JSON.stringify({ purpose: s.purpose || 'action', phases: s.phases, hitPolicy: s.hitPolicy, steps: s.steps.map(({ id, ...rest }) => rest) });
        let kindLabel = 'records', groupKey = '', groupLabel = '';
        const intern = (sequence, label) => {
            const k = key(sequence);
            const join = id => { const found = sequences[id]; found.sharedBy = (found.sharedBy || 1) + 1; if (found.sharedKind !== kindLabel) found.sharedKind = found.sharedKind ? 'records' : kindLabel; (found.sharedGroups ||= new Set()).add(groupLabel); return id; };
            if (shared.has(k)) return join(shared.get(k));
            for (const id of groups.get(groupKey) || []) if (V.similar(sequences[id], sequence)) { shared.set(k, id); return join(id); }
            const id = sequences.length; sequence.id = id; sequence.name = label; sequence.steps = sequence.steps.map((s, i) => ({ ...s, id: 'v-' + id + '-' + i })); sequences.push(sequence); shared.set(k, id); (groups.get(groupKey) || groups.set(groupKey, []).get(groupKey)).push(id); sequence.sharedGroups = new Set([groupLabel]); report.sequences++; return id;
        };
        const tables = [['actors', data.actors], ['classes', data.classes], ['enemies', data.enemies], ['weapons', data.weapons], ['armors', data.armors], ['skills', data.skills], ['items', data.items]];
        // One choreography per weapon type: weapons of a type were tuned one by
        // one from the same idea, so with byType every weapon of the type takes
        // the sequence most of them share, and the odd ones out are not kept.
        const canonical = new Map();
        if (options.byType !== false && Array.isArray(data.weapons)) {
            const groups = new Map();
            for (const record of data.weapons) { if (!record) continue; const out = V.convertRecord(record, { ...options, facing: options.facing || (options.vertical ? 'up' : 'left') }); if (!Object.keys(out.phases).length) continue; const sequence = V.sequenceFromPhases(out.phases, ''); (groups.get(record.wtypeId) || groups.set(record.wtypeId, []).get(record.wtypeId)).push({ record, sequence }); }
            for (const [type, entries] of groups) {
                const clusters = [];
                for (const entry of entries) { const cluster = clusters.find(c => V.similar(c[0].sequence, entry.sequence)); if (cluster) cluster.push(entry); else clusters.push([entry]); }
                clusters.sort((a, b) => b.length - a.length);
                if (clusters.length > 1) { canonical.set(type, clusters[0][0].record.id); for (const cluster of clusters.slice(1)) for (const entry of cluster) report.notes.push('weapons ' + entry.record.id + ' ' + clean(entry.record.name) + ': uses the ' + (data.system?.weaponTypes?.[type] || 'type ' + type) + ' choreography of ' + clean(clusters[0][0].record.name)); }
            }
        }
        for (const [kind, list] of tables) {
            if (!Array.isArray(list)) continue;
            for (const record of list) {
                if (!record) continue;
                kindLabel = kind;
                const typeName = kind === 'weapons' ? (data.system?.weaponTypes?.[record.wtypeId] || '') : kind === 'items' ? 'Item' : '';
                groupKey = kind + (kind === 'weapons' ? ':' + record.wtypeId : ''); groupLabel = typeName ? typeName + (kind === 'weapons' ? ' attack' : '') : '';
                const out = V.convertRecord(record, { ...options, facing: options.facing || (options.vertical ? (kind === 'enemies' ? 'down' : 'up') : (kind === 'enemies' ? 'right' : 'left')) });
                for (const note of out.notes) report.notes.push(kind + ' ' + record.id + ' ' + clean(record.name) + ': ' + note);
                const provided = Object.keys(out.phases), stateNames = Object.keys(out.states);
                if (!provided.length && !stateNames.length && kind !== 'actors' && kind !== 'enemies') continue;
                if (kind === 'armors') { report.notes.push('armors ' + record.id + ': action sequences on armor are not assignable'); continue; }
                report.records++;
                const binding = {};
                if (provided.length) {
                    const standIn = kind === 'weapons' && canonical.has(record.wtypeId) && canonical.get(record.wtypeId) !== record.id ? data.weapons[canonical.get(record.wtypeId)] : null;
                    const source = standIn ? V.convertRecord(standIn, { ...options, facing: options.facing || (options.vertical ? 'up' : 'left') }).phases : out.phases, sourceName = clean((standIn || record).name);
                    binding.mode = 'sequence'; binding.sequenceId = intern(V.sequenceFromPhases(source, sourceName), sourceName);
                }
                if (stateNames.length) { binding.states = {}; for (const state of stateNames) { binding.states[state] = { mode: 'sequence', sequenceId: intern(V.stateSequence(out.states[state], clean(record.name) + ' · ' + state), clean(record.name) + ' · ' + state) }; report.states++; } }
                if (kind === 'actors') { const graphic = V.actorGraphic(record, options.actorMode ?? 'charset'); if (graphic) { binding.graphic = graphic; report.graphics++; } }
                if (kind === 'enemies') { const graphic = V.enemyGraphic(record, options.enemyMode ?? 'charset'); if (graphic) { binding.graphic = graphic; report.graphics++; } }
                if (!binding.mode && !binding.states && !binding.graphic) continue;
                if (!binding.mode) binding.mode = 'inherit';
                settings[kind][record.id] = binding;
            }
        }
        // A sequence shared by a whole weapon type is named for the type; otherwise after its first record and how many more share it.
        for (const sequence of sequences) if (sequence) { const groupsOf = sequence.sharedGroups ? [...sequence.sharedGroups].filter(Boolean) : []; if (sequence.sharedBy && groupsOf.length === 1 && groupsOf[0].endsWith(' attack')) sequence.name = groupsOf[0] + ' (' + sequence.sharedBy + ' weapons)'; else if (sequence.sharedBy) sequence.name = sequence.name + ' (+' + (sequence.sharedBy - 1) + ' more ' + (sequence.sharedKind || 'records') + ')'; delete sequence.sharedBy; delete sequence.sharedKind; delete sequence.sharedGroups; }
        return { sequences, settings, report };
    };

    root.ReactorVictorImport = V;
    if (typeof module !== 'undefined' && module.exports) module.exports = V;
})(typeof globalThis !== 'undefined' ? globalThis : this);
