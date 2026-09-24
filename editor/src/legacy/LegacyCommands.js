/**
 * LegacyCommands - RPG Maker 2000/2003 event command lists → Reactor (MZ
 * format) event command lists.
 *
 * Most commands have one MZ command; those are mapped straight. Where MZ
 * has a command with a different shape (a message with its face, choices
 * with their cancel branch, a battle with its handlers) the 2003 command
 * and its follow-up lines are folded together. Where MZ has no command at
 * all the runtime's equivalents are called through a Script command
 * (`this.rrCallMapEvent`, `this.rrKeyInput`, `this.rrWaitForAllMoves`,
 * …) or a Script operand on Control Variables, so behaviour is kept
 * rather than described. What cannot be carried at all becomes a comment
 * that names the original command, and every departure is counted in
 * `notes` so the import report can say what changed.
 *
 * Parameter layouts follow EasyRPG Player's interpreter, the reference
 * for the format. Ids of items, weapons and armors are the 2003 item ids
 * (each lives in one of the three MZ tables), so `$dataItems[id] ||
 * $dataWeapons[id] || $dataArmors[id]` resolves an id at runtime.
 */
(function (root) {
    'use strict';

    const DIR = { 0: 8, 1: 6, 2: 2, 3: 4 }; // 2003 up/right/down/left → MZ
    const MOVE = { 0: 4, 1: 3, 2: 1, 3: 2, 4: 8, 5: 6, 6: 5, 7: 7, 8: 9, 9: 10, 10: 11, 11: 12, 12: 19, 13: 18, 14: 16, 15: 17, 16: 20, 17: 21, 18: 22, 19: 23, 20: 24, 21: 25, 22: 26, 26: 35, 27: 36, 36: 37, 37: 38 };
    const STEP = { 0: [0, -1], 1: [1, 0], 2: [0, 1], 3: [-1, 0], 4: [1, -1], 5: [1, 1], 6: [-1, 1], 7: [-1, -1] };

    /** A 2003 character id → MZ: player -1, this event 0, event n; vehicles have no MZ id. */
    function charId(id) {
        if (id === 10001) return -1;
        if (id === 10005) return 0;
        if (id >= 10002 && id <= 10004) return null;
        return id;
    }
    const charExpr = (id) => (charId(id) === null ? `$gameMap.vehicle(${id - 10002})` : id === 10005 ? '$gameMap.event(this._eventId)' : id === 10001 ? '$gamePlayer' : `$gameMap.event(${id})`);

    function audio(name, volume, tempo, balance) {
        return { name: stem(name), volume: volume ?? 100, pitch: tempo ?? 100, pan: Math.max(-100, Math.min(100, ((balance ?? 50) - 50) * 2)) };
    }
    function charsetName(name) {
        if (!name) return '';
        let n = name.replace(/^\$/, '');
        return n.startsWith('!') ? n : '!' + n;
    }
    /** A name from the game's data without a media extension; other dots are part of the name. */
    function stem(name) { return String(name || '').replace(/\.(png|bmp|xyz|jpe?g|gif|wav|ogg|opus|mp3|midi?|wma|flac|m4a|avi|mpe?g|mp4|wmv|webm|ogv)$/i, ''); }
    /** 2003 message codes → MZ: \_ becomes \., \s[n] (speed) has no MZ code. */
    function text(s) {
        return String(s || '').replace(/\\_/g, '\\.').replace(/\\[sS]\[\d+\]/g, '');
    }
    const tone = (r, g, b, sat) => [Math.round(((r ?? 100) - 100) * 2.55), Math.round(((g ?? 100) - 100) * 2.55), Math.round(((b ?? 100) - 100) * 2.55), (sat ?? 100) < 100 ? Math.round((100 - sat) * 2.55) : 0];
    const frames = (tenths) => Math.max(1, Math.round((tenths || 0) * 6));
    const valueOrVar = (mode, v) => (mode ? `$gameVariables.value(${v})` : String(v));

    /**
     * Convert one command list. `ctx`:
     *   itemKind(id) → 'items' | 'weapons' | 'armors'
     *   actors[id] → { faceName, faceIndex, characterName, characterIndex }
     *   classOffset: MZ class id = 2003 class id + offset
     *   terms: the database terms (inn text), system: the database system (inn music)
     *   notes: an object counts are added to
     */
    function convertList(commands, ctx) {
        const out = [];
        const notes = ctx.notes || (ctx.notes = {});
        const note = (k, n = 1) => { notes[k] = (notes[k] || 0) + n; };
        const state = { face: { name: '', index: 0 }, background: 0, position: 2, timer: [0, 0], timerVar: [null, null] };
        const push = (code, parameters, indent) => out.push({ code, indent, parameters });
        const script = (code, indent) => push(355, [code], indent);
        const comment = (what, indent) => { push(108, [what], indent); note('comment'); };
        const scope = (t, id) => (t === 0 ? [0, 0] : t === 1 ? [0, id] : [1, id]); // 2003 target: party / actor / variable
        const itemTable = (id) => ({ items: '$dataItems', weapons: '$dataWeapons', armors: '$dataArmors' }[ctx.itemKind(id)] || '$dataItems');
        // 2003 picture effects: 1 rotation (power = 1/256 turn per frame), 2 wave (power = ripple depth). The
        // runtime's rrPictureEffect carries both; a picture that had one and is shown or moved without gets it cleared.
        const effects = ctx._pictureEffects || (ctx._pictureEffects = {});
        const pictureEffect = (id, mode, power, byVariable, indent) => {
            const key = byVariable ? 'v' + id : id;
            const had = effects[key] || 0;
            if (mode === 1 || mode === 2) { script(`$gameScreen.rrPictureEffect(${byVariable ? `$gameVariables.value(${id})` : id}, ${mode}, ${power || 0})`, indent); effects[key] = mode; note('pictureEffect'); }
            // a move without an effect stops one this list started, or one any list may have (ctx.effectPictures, from the importer's scan)
            else if (had || (ctx.effectPictures && (byVariable || ctx.effectPictures.has(id)))) { script(`$gameScreen.rrPictureEffect(${byVariable ? `$gameVariables.value(${id})` : id}, 0, 0)`, indent); effects[key] = 0; }
            else if (mode) note('pictureEffectUnknown');
        };

        for (let i = 0; i < commands.length; i++) {
            const c = commands[i], p = c.parameters, ind = c.indent, s = c.string;
            const next = () => commands[i + 1];
            switch (c.code) {
                case 0: case 10: break;

                // ---- messages ---------------------------------------------------
                case 10110: {
                    // a message box translates as a whole first (the translation files keep boxes together), then line by line
                    const lines = [s];
                    while (next() && next().code === 20110) { i++; lines.push(commands[i].string); }
                    // A translation may split the box (<easyrpg:new_page>) or remove it (<easyrpg:delete_page> as a
                    // box's first line); the last box keeps at most four lines (EasyRPG's RewriteEventCommandMessage).
                    const translated = ctx.translateLines ? ctx.translateLines(lines) : lines;
                    const boxes = [[]];
                    for (const line of translated) {
                        if (line === '<easyrpg:new_page>') { boxes.push([]); continue; }
                        boxes[boxes.length - 1].push(line);
                        if (line === '<easyrpg:delete_page>') break;
                    }
                    if (boxes[boxes.length - 1][0] === '<easyrpg:delete_page>') { note('translationDeletedMessage'); break; }
                    boxes[boxes.length - 1] = boxes[boxes.length - 1].slice(0, 4);
                    for (const box of boxes) {
                        push(101, [state.face.name, state.face.index, state.background, state.position, ''], ind);
                        for (const line of box.length ? box : ['']) push(401, [text(line)], ind);
                    }
                    break;
                }
                case 20110: push(401, [text(s)], ind); break;
                // Message options and the face are the system's, not the event's: they last until changed,
                // across events and common events (EasyRPG's Game_System), so the runtime holds them.
                case 10120: state.background = p[0] ? 2 : 0; state.position = Math.max(0, Math.min(2, p[1] ?? 2)); script(`this.rrMessageOptions(${state.background}, ${state.position})`, ind); break;
                case 10130: state.face = { name: s ? stem(s) : '', index: p[0] || 0 }; script(`this.rrMessageFace(${JSON.stringify(state.face.name)}, ${state.face.index})`, ind); break;
                case 10140: {
                    // the 2003 choice texts are '/'-separated on the command; a cancel type of 5 adds a branch of its own
                    // a translation keys the choices as one block, one choice per line (EasyRPG's BuildChoiceString)
                    const raw = s ? s.split('/') : [];
                    const labels = (ctx.translateLines ? ctx.translateLines(raw).slice(0, raw.length) : raw).map(l => text(l));
                    const cancel = p[0] === 0 ? -1 : p[0] === 5 ? -2 : Math.max(0, Math.min(labels.length - 1, p[0] - 1));
                    push(102, [labels, cancel, 0, 2, 0], ind);
                    (ctx._choiceCounts || (ctx._choiceCounts = {}))[ind] = labels.length;
                    (ctx._choiceLabels || (ctx._choiceLabels = {}))[ind] = labels;
                    break;
                }
                case 20140: {
                    const n = (ctx._choiceCounts && ctx._choiceCounts[ind]) ?? 4;
                    if (p[0] >= n) push(403, [6, null], ind); else push(402, [p[0], text((ctx._choiceLabels && ctx._choiceLabels[ind] && ctx._choiceLabels[ind][p[0]]) ?? s)], ind);
                    break;
                }
                case 20141: push(404, [], ind); break;
                case 10150: push(103, [p[1], p[0]], ind); break;

                // ---- switches, variables, timers -----------------------------------
                case 10210: {
                    const [mode, a, b, act] = p;
                    if (mode === 2) { script(`$gameSwitches.setValue($gameVariables.value(${a}), ${act === 2 ? `!$gameSwitches.value($gameVariables.value(${a}))` : act === 0})`, ind); note('indirectSwitch'); }
                    else if (act === 2) { const end = mode === 1 ? b : a; script(`for (let s = ${a}; s <= ${end}; s++) $gameSwitches.setValue(s, !$gameSwitches.value(s))`, ind); note('toggleSwitch'); }
                    else push(121, [a, mode === 1 ? b : a, act], ind);
                    break;
                }
                case 10220: {
                    const [mode, a, b, op, operand, p5, p6, p7] = p;
                    let mz = null, expr = null;
                    switch (operand) {
                        case 0: mz = [0, p5]; break;
                        case 1: mz = [1, p5]; break;
                        case 2: expr = `$gameVariables.value($gameVariables.value(${p5}))`; break;
                        case 3: mz = [2, Math.min(p5, p6), Math.max(p5, p6)]; break;
                        case 4: {
                            const kind = ctx.itemKind(p5);
                            if (p6 === 0 && kind) mz = [3, { items: 0, weapons: 1, armors: 2 }[kind], p5];   // MZ game data: 0 item, 1 weapon, 2 armor
                            else { expr = `$gameParty.members().reduce((n, a) => n + a.equips().filter(e => e && e.id === ${p5}).length, 0)`; }
                            break;
                        }
                        case 5: {
                            const stat = { 0: 0, 1: 1, 2: 2, 3: 3, 4: 4, 5: 5, 6: 6, 7: 7, 8: 8, 9: 10 }[p6];
                            if (stat !== undefined) mz = [3, 3, p5, stat];
                            else if (p6 >= 10 && p6 <= 14) expr = `(($gameActors.actor(${p5}) || { equips: () => [] }).equips()[${[0, 1, 3, 2, 4][p6 - 10]}] || { id: 0 }).id`;
                            else if (p6 === 15) mz = [0, p5];
                            else if (p6 === 17) expr = `$gameActors.actor(${p5}).nextRequiredExp()`;
                            else { expr = '0'; note('actorOperand'); }
                            break;
                        }
                        case 6: {
                            const ch = charId(p5);
                            const sub = { 1: 0, 2: 1, 3: 2, 4: 3, 5: 4 }[p6];
                            if (p6 === 0) mz = [3, 7, 0];
                            else if (sub !== undefined && ch !== null) mz = [3, 5, ch, sub];   // MZ game data 5 is a character (6 is a party member)
                            else if (p6 === 6) mz = [0, p5 === 10005 ? 0 : p5];
                            else expr = `(${charExpr(p5)} || { x: 0, y: 0, direction: () => 2, screenX: () => 0, screenY: () => 0 }).${['x', 'x', 'y', 'direction()', 'screenX()', 'screenY()'][p6] || 'x'}`;
                            break;
                        }
                        case 7: {
                            const sub = { 0: [3, 7, 2], 1: [3, 7, 5], 2: [3, 7, 1], 3: [3, 7, 6], 4: [3, 7, 7], 5: [3, 7, 8], 7: [3, 7, 9] }[p5];
                            if (sub) mz = sub;
                            else if (p5 === 6) expr = '($gameSystem._rrDefeatCount || 0)';
                            else if (p5 === 10) expr = '(() => { const d = new Date(); return (d.getFullYear() % 100) * 10000 + (d.getMonth() + 1) * 100 + d.getDate(); })()';
                            else if (p5 === 11) expr = '(() => { const d = new Date(); return d.getHours() * 10000 + d.getMinutes() * 100 + d.getSeconds(); })()';
                            else if (p5 === 12) expr = 'Graphics.frameCount';
                            else { expr = '0'; note('otherOperand'); }
                            break;
                        }
                        case 8: expr = `(($gameTroop.members()[${p5}] || { hp: 0, mp: 0, mhp: 0, mmp: 0, atk: 0, def: 0, mat: 0, agi: 0, enemyId: () => 0 }).${['hp', 'mp', 'mhp', 'mmp', 'atk', 'def', 'mat', 'agi', 'enemyId()'][p6] || 'hp'})`; break;
                        default: expr = '0'; note('variableOperand'); break;
                    }
                    if (mode === 2) {
                        const v = mz ? (mz[0] === 0 ? String(mz[1]) : mz[0] === 1 ? `$gameVariables.value(${mz[1]})` : mz[0] === 2 ? `(${mz[1]} + Math.randomInt(${mz[2] - mz[1] + 1}))` : null) : expr;
                        if (v !== null) {
                            const ops = ['=', '+=', '-=', '*=', '/=', '%='][op] || '=';
                            script(`{ const t = $gameVariables.value(${a}); let v = $gameVariables.value(t); v ${ops} (${v}); $gameVariables.setValue(t, Math.trunc(v)); }`, ind);
                        } else { const ops = ['=', '+=', '-=', '*=', '/=', '%='][op] || '='; script(`{ const t = $gameVariables.value(${a}); const g = (id) => $gameVariables.value(id); let v = g(t); v ${ops} (${expr}); $gameVariables.setValue(t, Math.trunc(v)); }`, ind); }
                        note('indirectVariable');
                    } else if (mz) push(122, [a, mode === 1 ? b : a, op, ...mz], ind);
                    else push(122, [a, mode === 1 ? b : a, op, 4, expr], ind);
                    break;
                }
                case 10230: {
                    const timer = p[5] || 0;
                    if (timer) note('secondTimer');
                    if (p[0] === 0) { state.timer[timer] = p[2]; state.timerVar[timer] = p[1] ? p[2] : null; }
                    else if (p[0] === 1) { if (state.timerVar[timer] !== null) script(`$gameTimer.start($gameVariables.value(${state.timerVar[timer]}) * 60)`, ind); else push(124, [0, state.timer[timer] || 0], ind); }
                    else push(124, [1], ind);
                    break;
                }

                // ---- party ----------------------------------------------------------
                case 10310: push(125, [p[0], p[1], p[2]], ind); break;
                case 10320: {
                    const [op, src, item, countSrc, count] = p;
                    if (src === 1) { script(`{ const id = $gameVariables.value(${item}); const it = $dataItems[id] || $dataWeapons[id] || $dataArmors[id]; if (it) $gameParty.gainItem(it, ${op ? '-' : ''}${valueOrVar(countSrc, count)}); }`, ind); note('indirectItem'); }
                    else push({ items: 126, weapons: 127, armors: 128 }[ctx.itemKind(item)] || 126, [item, op, countSrc, count, false], ind);
                    break;
                }
                case 10330: if (p[1]) { script(`{ const a = $gameVariables.value(${p[2]}); $gameParty.${p[0] ? 'removeActor' : 'addActor'}(a); }`, ind); } else push(129, [p[2], p[0], 0], ind); break;
                case 10410: push(315, [...scope(p[0], p[1]), p[2], p[3], p[4], !!p[5]], ind); break;
                case 10420: push(316, [...scope(p[0], p[1]), p[2], p[3], p[4], !!p[5]], ind); break;
                case 10430: { const param = [0, 1, 2, 3, 4, 6][p[3]] ?? 0; if (p[3] === 4) note('spiritParam'); push(317, [...scope(p[0], p[1]), param, p[2], p[4], p[5]], ind); break; }
                case 10440: if (p[3]) { script(`for (const a of ${p[0] === 0 ? '$gameParty.members()' : `[$gameActors.actor(${valueOrVar(p[0] === 2, p[1])})]`}) if (a) a.${p[2] ? 'forgetSkill' : 'learnSkill'}($gameVariables.value(${p[4]}))`, ind); } else push(318, [...scope(p[0], p[1]), p[2], p[4]], ind); break;
                case 10450: {
                    if (p[2] === 1) { const slot = p[3]; push(319, [p[1], slot, 0], ind); if (p[0] !== 1) note('equipTarget'); break; }
                    const item = p[4];
                    if (p[3] === 1) { script(`{ const id = $gameVariables.value(${item}); const it = $dataWeapons[id] || $dataArmors[id]; if (it) for (const a of ${p[0] === 0 ? '$gameParty.members()' : `[$gameActors.actor(${p[1]})]`}) if (a) a.changeEquipById(it.etypeId, id); }`, ind); note('indirectItem'); break; }
                    const type = ctx.itemType ? ctx.itemType(item) : 1;
                    const slot = { 1: 0, 2: 1, 3: 3, 4: 2, 5: 4 }[type] ?? 0;
                    if (p[0] === 1) push(319, [p[1], slot, item], ind);
                    else { script(`for (const a of ${p[0] === 0 ? '$gameParty.members()' : `[$gameActors.actor($gameVariables.value(${p[1]}))]`}) if (a) a.changeEquipById(${slot + 1}, ${item})`, ind); }
                    break;
                }
                case 10460: push(311, [...scope(p[0], p[1]), p[2], p[3], p[4], !!p[5]], ind); break;
                case 10470: push(312, [...scope(p[0], p[1]), p[2], p[3], p[4]], ind); break;
                case 10480: push(313, [...scope(p[0], p[1]), p[2], p[3]], ind); break;
                case 10490: push(314, [...scope(p[0], p[1])], ind); break;
                case 10500: {
                    const [t, id, atk, def, spi, variance, toVar, varId] = p;
                    script(`{ let last = 0; for (const a of ${t === 0 ? '$gameParty.members()' : `[$gameActors.actor(${valueOrVar(t === 2, id)})]`}) { if (!a) continue; let d = Math.max(0, Math.floor(${atk} / 2 - a.def / 4)); if (${variance} > 0) { const adj = Math.max(1, Math.floor(${variance} * d / 10)); d += Math.randomInt(adj + 1) - Math.floor(adj / 2); } a.gainHp(-d); last = d; } ${toVar ? `$gameVariables.setValue(${varId}, last);` : ''} }`, ind);
                    note('simulatedAttack');
                    break;
                }
                case 10610: push(320, [p[0], s], ind); break;
                case 10620: push(324, [p[0], s], ind); break;
                case 10630: { const a = ctx.actors[p[0]] || {}; push(322, [p[0], charsetName(s), p[1] || 0, a.faceName || '', a.faceIndex || 0], ind); if (p[2]) note('transparentActor'); break; }
                case 10640: { const a = ctx.actors[p[0]] || {}; push(322, [p[0], a.characterName || '', a.characterIndex || 0, s ? stem(s) : '', p[1] || 0], ind); break; }
                case 10650: push(323, [p[0], charsetName(s), p[1] || 0], ind); break;
                case 10660: {
                    const bgm = audio(s, p[2], p[3], p[4]);
                    const ctxId = p[0];
                    if (ctxId === 0) push(132, [bgm], ind); else if (ctxId === 1) push(133, [bgm], ind); else if (ctxId >= 3 && ctxId <= 5) push(140, [ctxId - 3, bgm], ind);
                    else if (ctxId === 6) script(`$dataSystem.gameoverMe = ${JSON.stringify(bgm)}`, ind);
                    else { script(`$dataSystem.rrInnBgm = ${JSON.stringify(bgm)}`, ind); }
                    break;
                }
                case 10670: { const slot = [0, 1, 2, 3, 7, 8, 9, 10, 13, 16, 11, 21][p[0]]; if (slot !== undefined) script(`$dataSystem.sounds[${slot}] = ${JSON.stringify(audio(s, p[1], p[2], p[3]))}`, ind); else note('systemSound'); break; }
                case 10680: comment(`2003: Change System Graphics "${s}"`, ind); note('systemGraphic'); break;
                case 10690: comment('2003: Change Screen Transitions', ind); note('transitions'); break;

                // ---- battles, shops, inns ------------------------------------------------
                case 10710: push(301, [p[0] ? 1 : 0, p[1], p[3] !== 0, p[4] === 1], ind); if (p[5]) note('firstStrike'); break;
                case 20710: push(601, [], ind); break;
                case 20711: push(602, [], ind); break;
                case 20712: push(603, [], ind); break;
                case 20713: push(604, [], ind); break;
                case 10720: {
                    const goods = p.slice(4).filter(id => id > 0);
                    const kindCode = (id) => ({ items: 0, weapons: 1, armors: 2 }[ctx.itemKind(id)] || 0);
                    const purchaseOnly = p[0] === 1;
                    if (!goods.length) push(302, [0, 1, 0, 0, purchaseOnly], ind);
                    else { push(302, [kindCode(goods[0]), goods[0], 0, 0, purchaseOnly], ind); for (const g of goods.slice(1)) push(605, [kindCode(g), g, 0, 0], ind); }
                    if (p[0] === 2) note('sellOnlyShop');
                    break;
                }
                case 20720: push(111, [12, '$gameTemp._rrShopTransaction'], ind); break;
                case 20721: push(411, [], ind); break;
                case 20722: push(412, [], ind); break;
                case 10730: {
                    const t = ctx.terms || {}, price = p[1] || 0, set = p[0] ? 'b' : 'a';
                    const g = (k) => t[`inn_${set}_${k}`] || '';
                    push(101, [state.face.name, state.face.index, state.background, state.position, ''], ind);
                    push(401, [`${g('greeting_1')} ${price} ${g('greeting_2')}`.replace(/\s+/g, ' ').trim()], ind);
                    if (g('greeting_3')) push(401, [g('greeting_3')], ind);
                    push(102, [[g('accept') || 'Stay', g('cancel') || 'Leave'], 1, 0, 2, 0], ind);
                    const stay = [[125, [1, 0, price]], [221, []], [249, [audio((ctx.system && ctx.system.inn_music && ctx.system.inn_music.name) || '', 100, 100, 50)]], [230, [90]], [314, [0, 0]], [222, []]];
                    if (p[2]) { ctx._inn = stay; }
                    else { push(402, [0, g('accept') || 'Stay'], ind); for (const [code, params] of stay) push(code, params, ind + 1); push(402, [1, g('cancel') || 'Leave'], ind); push(404, [], ind); }
                    note('inn');
                    break;
                }
                case 20730: push(402, [0, (ctx.terms && ctx.terms.inn_a_accept) || 'Stay'], ind); for (const [code, params] of (ctx._inn || [])) push(code, params, ind + 1); break;
                case 20731: push(402, [1, (ctx.terms && ctx.terms.inn_a_cancel) || 'Leave'], ind); break;
                case 20732: push(404, [], ind); break;
                case 10740: push(303, [p[0], 8], ind); break;

                // ---- movement and the map ---------------------------------------------
                case 10810: push(201, [0, p[0], p[1], p[2], p[3] ? DIR[p[3] - 1] || 0 : 0, 0], ind); break;
                case 10820: push(122, [p[0], p[0], 0, 3, 7, 0], ind); push(122, [p[1], p[1], 0, 3, 5, -1, 0], ind); push(122, [p[2], p[2], 0, 3, 5, -1, 1], ind); break;
                case 10830: push(201, [1, p[0], p[1], p[2], 0, 0], ind); break;
                case 10840: push(206, [], ind); break;
                case 10850: push(202, [p[0], p[1], p[2], p[3], p[4]], ind); break;
                case 10860: { const ch = charId(p[0]); if (ch === null) { script(`${charExpr(p[0])}.setPosition(${valueOrVar(p[1], p[2])}, ${valueOrVar(p[1], p[3])})`, ind); } else push(203, [ch, p[1] ? 1 : 0, p[2], p[3], p[4] ? DIR[p[4] - 1] || 0 : 0], ind); break; }
                case 10870: push(203, [charId(p[0]) ?? p[0], 2, charId(p[1]) ?? p[1], 0, 0], ind); break;
                case 10910: script(`$gameVariables.setValue(${p[3]}, this.rrTerrainId(${valueOrVar(p[0], p[1])}, ${valueOrVar(p[0], p[2])}))`, ind); break;
                case 10920: push(285, [p[3], 1, p[0] ? 1 : 0, p[1], p[2]], ind); break;

                // ---- screen -------------------------------------------------------------
                case 11010: push(221, [], ind); break;
                case 11020: push(222, [], ind); break;
                case 11030: push(223, [tone(p[0], p[1], p[2], p[3]), frames(p[4]), !!p[5]], ind); break;
                case 11040: if (p[6] === 2) { note('flashLoop'); break; } push(224, [[p[0] * 8, p[1] * 8, p[2] * 8, p[3] * 8], frames(p[4]), !!p[5]], ind); if (p[6] === 1) note('flashLoop'); break;
                case 11050: push(225, [p[0], p[1], frames(p[2]), !!p[3]], ind); if (p[4]) note('shakeLoop'); break;
                case 11060: {
                    // the old engine pans 2 << speed of a tile's 256ths a frame, twice MZ's 2^speed: one speed up
                    const speed = Math.max(1, Math.min(6, p[3] || 0)) + 1;
                    if (p[0] === 2) push(204, [DIR[p[1]] || 2, p[2], speed, !!p[4]], ind);
                    else if (p[0] === 3) { script(`this.rrPanReset(${speed}, ${!!p[4]})`, ind); }
                    else script(`$gameMap._rrPanLocked = ${p[0] === 0}`, ind);
                    break;
                }
                case 11070: { const type = { 0: 0, 1: 1, 2: 3, 3: 0, 4: 2 }[p[0]] ?? 0; if (p[0] === 3) note('fog'); push(236, [['none', 'rain', 'storm', 'snow'][type], [3, 6, 9][Math.min(2, p[1] || 0)], 1, false], ind); break; }
                case 11110: {
                    const [id, posMode, x, y, fixed, mag, top, transparentColor, r, g, b, sat, effect] = p;
                    const base = stem(s);
                    const name = ctx.pictureFile ? ctx.pictureFile(base, transparentColor > 0) : base;
                    const opacity = Math.round(255 * (100 - (top || 0)) / 100);
                    // 2003 1.12 can take the picture's number from a variable (parameter 17); MZ's command cannot
                    const byVar = p.length > 16 && (p[17] & 0xFF) === 1;
                    const idX = byVar ? `$gameVariables.value(${id})` : String(id);
                    const at = (v) => (posMode ? `$gameVariables.value(${v})` : String(v));
                    if (byVar) { script(`$gameScreen.showPicture(${idX}, ${JSON.stringify(name)}, 1, ${at(x)}, ${at(y)}, ${mag ?? 100}, ${mag ?? 100}, ${opacity}, 0)`, ind); note('pictureIdVariable'); }
                    else push(231, [id, name, 1, posMode ? 1 : 0, x, y, mag ?? 100, mag ?? 100, opacity, 0], ind);
                    const t = tone(r, g, b, sat);
                    if (t.some(v => v !== 0)) { if (byVar) script(`$gameScreen.tintPicture(${idX}, ${JSON.stringify(t)}, 1)`, ind); else push(234, [id, t, 1, false], ind); }
                    if (fixed) { script(`$gameScreen.rrPictureFixToMap(${idX})`, ind); note('pictureFixedToMap'); }
                    pictureEffect(id, effect, p[13], byVar ? 1 : 0, ind);
                    // 2003 1.12 spritesheet: 22 columns (0 = none), 23 rows, 24 2 = animate at speed 25 (26 once), else frame 25 (by variable when 24 is 1), counted from 1
                    if (p.length >= 30 && p[22] > 0) {
                        const frame = p[24] === 2 ? '0' : p[24] === 1 ? `$gameVariables.value(${p[25]}) - 1` : String((p[25] || 0) - 1);
                        script(`$gameScreen.rrPictureFrames(${idX}, ${p[22]}, ${p[23] || 1}, ${frame}, ${p[24] === 2 ? p[25] || 0 : 0}, ${p[24] === 2 && !!p[26]})`, ind);
                        note('pictureSpritesheet');
                    }
                    // 2003 1.12 map layer 27 and battle layer 28 (0 = not shown there; both 0 = map layer 7). An
                    // import's default is map 7, battle 0 (System.json rrPictureLayers), so only others are written.
                    if (p.length >= 30) {
                        const mapLayer = (p[27] || 0) === 0 && (p[28] || 0) === 0 ? 7 : (p[27] || 0), battleLayer = p[28] || 0;
                        if (mapLayer !== 7 || battleLayer !== 0) { script(`$gameScreen.rrPictureLayer(${idX}, ${mapLayer}, ${battleLayer})`, ind); note('pictureLayer'); }
                    }
                    // 2003 1.12's flags word (bit 0: erase on map change); older commands always erase
                    if (p.length > 16 && !((p[29] || 0) & 1)) { script(`$gameScreen.rrKeepPicture(${idX})`, ind); note('pictureKept'); }
                    break;
                }
                case 11120: {
                    const [id, posMode, x, y, , mag, top, , r, g, b, sat, effect, , tenths, wait] = p;
                    const opacity = Math.round(255 * (100 - (top || 0)) / 100), duration = frames(tenths);
                    const byVar = p.length > 17 && (p[17] & 0xFF) === 1;
                    if (byVar) {
                        const idX = `$gameVariables.value(${id})`, at = (v) => (posMode ? `$gameVariables.value(${v})` : String(v));
                        script(`$gameScreen.movePicture(${idX}, 1, ${at(x)}, ${at(y)}, ${mag ?? 100}, ${mag ?? 100}, ${opacity}, 0, ${duration}, 0)`, ind);
                        script(`$gameScreen.tintPicture(${idX}, ${JSON.stringify(tone(r, g, b, sat))}, ${duration})${wait ? `; this.wait(${duration})` : ''}`, ind);
                        note('pictureIdVariable');
                    } else {
                        // MZ's Move Picture: [id, (unused), origin, designation, x, y, scaleX, scaleY, opacity, blend, frames, wait, easing]
                        push(232, [id, 0, 1, posMode ? 1 : 0, x, y, mag ?? 100, mag ?? 100, opacity, 0, duration, !!wait, 0], ind);
                        // a move always restates the colour, so a tinted picture can come back to neutral
                        push(234, [id, tone(r, g, b, sat), duration, false], ind);
                    }
                    pictureEffect(id, effect, p[13], byVar ? 1 : 0, ind);
                    break;
                }
                case 11130: {
                    if (p.length > 1 && p[1] === 2) { for (let id = p[0]; id <= p[2]; id++) push(235, [id], ind); }
                    else if (p.length > 1 && p[1] === 1) script(`$gameScreen.erasePicture($gameVariables.value(${p[0]}))`, ind);
                    else push(235, [p[0]], ind);
                    break;
                }
                case 11210: { const ch = charId(p[1]); if (ch === null) { script(`${charExpr(p[1])}.requestAnimation(${p[0]})`, ind); } else push(212, [ch, p[0], !!p[2]], ind); break; }
                case 11310: push(211, [p[0] === 0 ? 0 : 1], ind); break;
                case 11320: script(`this.rrFlashCharacter(${charId(p[0]) ?? 0}, [${p[1] * 8}, ${p[2] * 8}, ${p[3] * 8}, ${p[4] * 8}], ${frames(p[5])}, ${!!p[6]})`, ind); break;
                case 11330: {
                    const ch = charId(p[0]);
                    const route = decodeRoute(p.slice(4), ctx, c);
                    route.repeat = !!(p[2] & 1); route.skippable = !!p[3]; route.wait = false;
                    if (ch === null) script(`${charExpr(p[0])}.forceMoveRoute(${JSON.stringify(route)})`, ind);
                    else push(205, [ch, route], ind);
                    break;
                }
                case 11340: script('this.rrWaitForAllMoves()', ind); break;
                case 11350: script('this.rrHaltAllMoves()', ind); break;
                case 11410: if (p.length > 1 && p[1] === 1) { script('this.rrKeyInput(0, [5], true, 0)', ind); note('waitForKey'); } else push(230, [frames(p[0])], ind); break;

                // ---- audio and video ---------------------------------------------------------
                case 11510: push(241, [audio(s, p[1], p[2], p[3])], ind); break;
                case 11520: push(242, [p[0] || 0], ind); break;
                case 11530: push(243, [], ind); break;
                case 11540: push(244, [], ind); break;
                case 11550: push(250, [audio(s, p[0], p[1], p[2])], ind); break;
                case 11560: push(261, [stem(s)], ind); break;
                case 11610: {
                    // Key Input Processing, by the engine and the length of its parameter list (EasyRPG's
                    // CommandKeyInputProc). Codes: 1-4 down/left/right/up, 5 decision, 6 cancel, 7 shift,
                    // 10 the number keys (10-19), 20 the operators + - * / . (20-24).
                    const keys = [];
                    const flag = (idx) => p.length > idx && (p[idx] & 1) !== 0;
                    const dirs = (down, left, right, up) => { if (flag(down)) keys.push(1); if (flag(left)) keys.push(2); if (flag(right)) keys.push(3); if (flag(up)) keys.push(4); };
                    let timeVariable = 0;
                    if (flag(3)) keys.push(5);
                    if (flag(4)) keys.push(6);
                    if (ctx.engine2000) {
                        if (p.length < 6) { if (p[2]) keys.push(1, 2, 3, 4); }
                        else { if (flag(5)) keys.push(7); dirs(6, 7, 8, 9); }
                    } else if (p.length === 10) {   // 2003 1.05 with a 2000 game's key list
                        if (flag(5)) keys.push(7); dirs(6, 7, 8, 9);
                    } else {
                        if (p.length < 10 && p[2]) keys.push(1, 2, 3, 4);
                        if (flag(5)) keys.push(10);
                        if (flag(6)) keys.push(20);
                        if (flag(8)) timeVariable = p[7] || 0;
                        if (p.length > 10) { if (flag(9)) keys.push(7); dirs(10, 11, 12, 13); }
                    }
                    script(`this.rrKeyInput(${p[0]}, ${JSON.stringify(Array.from(new Set(keys)))}, ${!!p[1]}, ${timeVariable})`, ind);
                    note('keyInput');
                    break;
                }
                case 11710: push(282, [p[0]], ind); break;
                case 11720: {
                    // speeds as the old engine runs them: 2^|speed| / 32 px a frame, positive to the right (down)
                    const sp = (v) => (v ? -Math.sign(v) * Math.pow(2, Math.abs(v)) / 8 : 0);
                    push(284, [stem(s), !!p[0], !!p[1], p[2] ? sp(p[3]) : 0, p[4] ? sp(p[5]) : 0], ind);
                    break;
                }
                case 11740: push(136, [p[0] ? 1 : 0], ind); if (p[0]) script(`$dataMap.encounterStep = ${p[0]}`, ind); break;
                case 11750: script(`$gameMap.rrTileSubstitute(${p[0] ? 1 : 0}, ${p[1] || 0}, ${p[2] || 0})`, ind); break;
                case 11810: case 11820: case 11830: case 11840: comment(`2003: ${['Teleport Targets', 'Change Teleport Access', 'Escape Target', 'Change Escape Access'][(c.code - 11810) / 10]}`, ind); note('teleportTargets'); break;
                case 11910: push(352, [], ind); break;
                case 11930: push(134, [p[0] ? 1 : 0], ind); break;
                case 11950: push(351, [], ind); break;
                case 11960: push(135, [p[0] ? 1 : 0], ind); break;

                // ---- flow -----------------------------------------------------------------------
                case 12010: push(111, branch(p, s, ctx, note, itemTable), ind); break;
                case 22010: push(411, [], ind); break;
                case 22011: push(412, [], ind); break;
                case 12110: push(118, [`L${p[0]}`], ind); break;
                case 12120: push(119, [`L${p[0]}`], ind); break;
                case 12210: push(112, [], ind); break;
                case 22210: push(413, [], ind); break;
                case 12220: push(113, [], ind); break;
                case 12310: push(115, [], ind); break;
                case 12320: push(214, [], ind); break;
                case 12330: {
                    if (p[0] === 0) push(117, [p[1]], ind);
                    else if (p[0] === 1) { script(`this.rrCallMapEvent(${p[1] === 10005 ? 'this._eventId' : p[1]}, ${p[2]})`, ind); note('callMapEvent'); }
                    else { script(`this.rrCallMapEvent($gameVariables.value(${p[1]}), $gameVariables.value(${p[2]}))`, ind); note('callMapEvent'); }
                    break;
                }
                case 12410: case 22410: {
                    // a DynRPG "@" command, on the first line or a continuation line, possibly continued on the lines that follow, becomes a Script call on the screen features
                    const dyn = root.RRLegacyDynRpg || (typeof require === 'function' ? require('./LegacyDynRpg.js') : null);
                    if (dyn && /^\s*@/.test(s)) {
                        const lines = [s];
                        while (next() && next().code === 22410 && !/^\s*@/.test(next().string)) { i++; lines.push(commands[i].string); }
                        // A translation file keys a write_text and the append_lines that follow it on the same id as one
                        // message, lines joined by newlines; translate the block whole and lay the lines back out.
                        if (ctx.translate) {
                            const quoted = (raw) => { const q = /^(["'])([\s\S]*)\1$/.exec(String(raw || '').trim()); return q ? q[2] : null; };
                            const head = dyn.parse(lines.join('\n'));
                            const headText = head && head.name === 'write_text' ? quoted(head.args[3]) : null;
                            if (headText !== null) {
                                const parts = [headText];
                                let j = i, count = 0;
                                for (;;) {
                                    const more = [];
                                    let k = j + 1;
                                    if (!commands[k] || (commands[k].code !== 12410 && commands[k].code !== 22410) || !/^\s*@/.test(commands[k].string)) break;
                                    more.push(commands[k].string);
                                    while (commands[k + 1] && commands[k + 1].code === 22410 && !/^\s*@/.test(commands[k + 1].string)) { k++; more.push(commands[k].string); }
                                    const a = dyn.parse(more.join('\n'));
                                    if (!a || a.name !== 'append_line' || a.args[0] !== head.args[0] || quoted(a.args[1]) === null) break;
                                    parts.push(quoted(a.args[1])); j = k; count++;
                                }
                                const whole = parts.join('\n'), translated = ctx.translate(whole);
                                if (count && translated !== whole) {
                                    const out = translated.split('\n');
                                    const first = dyn.convertComment(lines, () => out[0]);
                                    if (first && first.script) {
                                        script(first.script, ind); note('dynrpg:write_text');
                                        for (const line of out.slice(1)) { script(dyn.convert('append_line', [head.args[0], '""'], () => line), ind); note('dynrpg:append_line'); }
                                        i = j;
                                        break;
                                    }
                                }
                            }
                        }
                        const r = dyn.convertComment(lines, ctx.translate);
                        if (r && r.script) { script(r.script, ind); note('dynrpg:' + r.family); break; }
                        push(108, [lines[0]], ind); for (const l of lines.slice(1)) push(408, [l], ind);
                        note('dynrpgKept:' + (r ? r.family : 'unparsed'));
                        break;
                    }
                    push(c.code === 12410 ? 108 : 408, [s], ind);
                    break;
                }
                case 12420: push(353, [], ind); break;
                case 12510: push(354, [], ind); break;
                case 1005: push(117, [p[0]], ind); break;
                case 1006: push(340, [], ind); note('forceFlee'); break;
                case 1008: push(321, [p[1], p[2] ? p[2] + (ctx.classOffset || 0) : p[1], !p[3]], ind); if (p[0] !== 1) note('classTarget'); break;
                case 1009: comment('2003: Change Battle Commands', ind); note('battleCommands'); break;
                case 5001: script('SceneManager.push(Scene_Load)', ind); break;
                case 5002: script('SceneManager.exit()', ind); break;
                case 5003: case 5004: case 5005: comment(`2003: ${['Toggle ATB Mode', 'Toggle Fullscreen', 'Open Video Options'][c.code - 5003]}`, ind); note('videoOptions'); break;

                // ---- battle-only ----------------------------------------------------------------
                case 13110: if (p[2] === 2) script(`{ const e = $gameTroop.members()[${p[0]}]; if (e) e.gainHp(${p[1] ? '-' : ''}Math.floor(e.hp * ${p[3]} / 100)); }`, ind); else push(331, [p[0], p[1] ? 1 : 0, p[2], p[3], !!p[4]], ind); break;
                case 13120: push(332, [p[0], p[1] ? 1 : 0, p[2], p[3]], ind); break;
                case 13130: push(333, [p[0], p[1] ? 1 : 0, p[2]], ind); break;
                case 13150: push(335, [p[0]], ind); break;
                case 13210: push(283, [stem(s), ''], ind); break;
                case 13260: push(337, [p[1] ? 1 : 0, p[2] || 0, p[0]], ind); break;
                case 13310: push(111, battleBranch(p, note), ind); break;
                case 23310: push(411, [], ind); break;
                case 23311: push(412, [], ind); break;
                case 13410: push(340, [], ind); break;

                default:
                    if (c.code >= 3000 && c.code < 4000) { comment(`Maniac: command ${c.code}`, ind); note('maniac'); }
                    else { comment(`2003: unknown command ${c.code}`, ind); note('unknownCommand'); }
                    break;
            }
        }
        out.push({ code: 0, indent: 0, parameters: [] });
        return { list: out, notes };
    }

    /** Conditional Branch (12010) parameters → MZ 111 parameters. */
    function branch(p, s, ctx, note, itemTable) {
        switch (p[0]) {
            case 0: return [0, p[1], p[2] ? 1 : 0];
            case 1: return [1, p[1], p[2] ? 1 : 0, p[3], p[4]];
            case 2: return [2, p[1], p[2] ? 1 : 0];
            case 3: return [7, p[1], p[2] ? 1 : 0];
            case 4: return p[2] ? [12, `!$gameParty.hasItem(${itemTable(p[1])}[${p[1]}], true)`] : [12, `$gameParty.hasItem(${itemTable(p[1])}[${p[1]}], true)`];
            case 5: {
                const actor = p[1];
                switch (p[2]) {
                    case 0: return [4, actor, 0];
                    case 1: return [4, actor, 1, s];
                    case 2: return [12, `($gameActors.actor(${actor}) || { level: 0 }).level >= ${p[3]}`];
                    case 3: return [12, `($gameActors.actor(${actor}) || { hp: 0 }).hp >= ${p[3]}`];
                    case 4: return [4, actor, 3, p[3]];
                    case 5: return [4, actor, ctx.itemKind(p[3]) === 'weapons' ? 4 : 5, p[3]];
                    case 6: return [4, actor, 6, p[3]];
                    default: note('actorCondition'); return [12, 'false'];
                }
            }
            case 6: { const ch = charId(p[1]); if (ch === null) return [12, `${charExpr(p[1])}.direction() === ${DIR[p[2]] || 2}`]; return [6, ch, DIR[p[2]] || 2]; }
            case 7: return [13, p[1]];
            case 8: return [12, '(() => { const e = $gameMap.event(this._eventId); return !!e && e.isTriggerIn([0]); })()'];
            case 9: note('bgmLooped'); return [12, 'true'];
            case 10: note('secondTimer'); return [2, p[1], p[2] ? 1 : 0];
            case 11: return [12, ['DataManager.isAnySavefileExists()', "Utils.isOptionValid('test')", '$dataSystem.battleSystem === 2', 'Graphics._isFullScreen()'][p[1]] || 'false'];
            default: note('unknownCondition'); return [12, 'false'];
        }
    }

    /** Conditional Branch in battle (13310) → MZ 111. */
    function battleBranch(p, note) {
        switch (p[0]) {
            case 0: return [0, p[1], p[2] ? 1 : 0];
            case 1: return [1, p[1], p[2] ? 1 : 0, p[3], p[4]];
            case 2: return [12, `(() => { const a = $gameActors.actor(${p[1]}); return !!a && a.canMove(); })()`];
            case 3: return [12, `(() => { const e = $gameTroop.members()[${p[1]}]; return !!e && e.canMove(); })()`];
            case 4: return [12, `(() => { const e = $gameTroop.members()[${p[1]}]; return !!e && e.isSelected(); })()`];
            case 5: note('commandCondition'); return [12, 'false'];
            default: note('unknownCondition'); return [12, 'false'];
        }
    }

    /**
     * Move route commands packed after Move Event's fixed parameters:
     * code, then for switch on/off a switch id, for change graphic a
     * string (length, then characters) and an index, for play sound a
     * string and volume, tempo, balance.
     */
    function decodeRoute(params, ctx, command) {
        const codes = [];
        let i = 0;
        // integers inside the list are 7-bit continued (EasyRPG's DecodeInt); string bytes follow a length
        const int = () => { let v = 0; for (;;) { const x = params[i++]; v = v * 128 + (x & 0x7f); if (!(x & 0x80) || i >= params.length) return v; } };
        const str = () => { const len = int(); const bytes = []; for (let k = 0; k < len && i < params.length; k++) bytes.push(params[i++] & 0xff); return (ctx.decode ? ctx.decode(Uint8Array.from(bytes)) : String.fromCharCode(...bytes)); };
        while (i < params.length) {
            const code = params[i++];
            const move = { code };
            if (code === 32 || code === 33) move.parameter_a = int();
            else if (code === 34) { move.parameter_string = str(); move.parameter_a = int(); }
            else if (code === 35) { move.parameter_string = str(); move.parameter_a = int(); move.parameter_b = int(); move.parameter_c = int(); }
            codes.push(move);
        }
        return convertRoute(codes, ctx);
    }

    /** 2003 move commands → an MZ move route list. Jumps sum the steps between Begin and End Jump. */
    function convertRoute(codes, ctx) {
        const list = [];
        const note = (k) => { if (ctx.notes) ctx.notes[k] = (ctx.notes[k] || 0) + 1; };
        let jump = null;
        for (const m of codes) {
            const code = m.code;
            if (jump) {
                if (code === 25) { list.push({ code: 14, parameters: [jump[0], jump[1]] }); jump = null; continue; }
                if (STEP[code]) { jump[0] += STEP[code][0]; jump[1] += STEP[code][1]; continue; }
            }
            if (code === 24) { jump = [0, 0]; continue; }
            if (MOVE[code] !== undefined) { list.push({ code: MOVE[code], parameters: [] }); continue; }
            switch (code) {
                case 23: list.push({ code: 15, parameters: [20] }); break;
                // speed and frequency step from the character's own, as the old engine does
                case 28: list.push({ code: 45, parameters: ['this.setMoveSpeed(Math.min(6, this.moveSpeed() + 1))'] }); break;
                case 29: list.push({ code: 45, parameters: ['this.setMoveSpeed(Math.max(1, this.moveSpeed() - 1))'] }); break;
                case 30: list.push({ code: 45, parameters: ['this.setMoveFrequency(Math.min(5, this.moveFrequency() + 1))'] }); break;
                case 31: list.push({ code: 45, parameters: ['this.setMoveFrequency(Math.max(1, this.moveFrequency() - 1))'] }); break;
                case 32: list.push({ code: 27, parameters: [m.parameter_a] }); break;
                case 33: list.push({ code: 28, parameters: [m.parameter_a] }); break;
                // an empty name is a tile graphic: upper-layer tile parameter_a (MZ's C sheet starts at 256)
                case 34: list.push(m.parameter_string ? { code: 41, parameters: [charsetName(m.parameter_string), m.parameter_a || 0] } : { code: 45, parameters: [`this.setTileImage(${256 + (m.parameter_a || 0)})`] }); break;
                case 35: list.push({ code: 44, parameters: [audio(m.parameter_string, m.parameter_a, m.parameter_b, m.parameter_c)] }); break;
                // transparency steps from where the character is now, in the old engine's eight levels
                // Stop/Start Animation freeze every kind of stepping, walking or not (EasyRPG's anim_paused)
                case 38: list.push({ code: 45, parameters: ['this.rrAnimPause(true)'] }); break;
                case 39: list.push({ code: 45, parameters: ['this.rrAnimPause(false)'] }); break;
                case 40: list.push({ code: 45, parameters: ['this.rrTransparency(1)'] }); break;
                case 41: list.push({ code: 45, parameters: ['this.rrTransparency(-1)'] }); break;
                default: note('unknownMove'); break;
            }
        }
        list.push({ code: 0, parameters: [] });
        return { list, repeat: false, skippable: false, wait: false };
    }

    const api = { convertList, convertRoute, decodeRoute, branch, charId, text, tone, audio, charsetName, stripExt: stem, DIR, MOVE };
    root.RRLegacyCommands = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
