/**
 * RubyTranspiler - the Ruby that RPG Maker XP/VX/VX Ace events carry (Script
 * commands, script conditions and operands, Set Move Route scripts), turned
 * into JavaScript for MZ's interpreter. Pure.
 *
 *   transpile(source, { self, constants, calls }) → JS text, or null
 *
 * It parses the subset events use (literals, locals, globals, instance
 * variables, operators, calls with or without parentheses, indexing, blocks,
 * ranges, if/unless/elsif/else, modifiers, while/until, case/when, `;` and
 * newlines) and generates JS only through a table of what each RGSS object
 * and method is in MZ. Anything the table does not know makes the whole
 * translation fail, so a script either runs as it did or stays a comment:
 * nothing is guessed.
 *
 * `self` is 'interpreter' (a Script command: `this` is the Game_Interpreter)
 * or 'character' (a move route: `this` is the character). `calls` maps bare
 * method names a game's scripts define (see RgssConvert FAMILIES) to JS
 * templates for this `self`.
 */
(function (root) {
    'use strict';

    class Fail extends Error {}
    const fail = (why) => { throw new Fail(why); };

    // ---- tokens -----------------------------------------------------------------

    const KEYWORDS = new Set(['if', 'unless', 'elsif', 'else', 'end', 'then', 'while', 'until', 'do', 'case', 'when', 'and', 'or', 'not', 'true', 'false', 'nil', 'self', 'return', 'break', 'next', 'in', 'loop', 'begin', 'rescue', 'def', 'class', 'module', 'yield']);
    const OPERATORS = ['**=', '<=>', '===', '...', '&&=', '||=', '<<=', '>>=', '**', '==', '!=', '>=', '<=', '&&', '||', '<<', '>>', '+=', '-=', '*=', '/=', '%=', '|=', '&=', '=~', '..', '::', '=>', '+', '-', '*', '/', '%', '=', '<', '>', '!', '&', '|', '^', '~', '?', ':', '.', ',', '(', ')', '[', ']', '{', '}', ';'];

    function tokenize(src) {
        const out = [];
        let i = 0, spaceBefore = false;
        const push = (type, value) => { out.push({ type, value, space: spaceBefore }); spaceBefore = false; };
        while (i < src.length) {
            const c = src[i];
            if (c === ' ' || c === '\t' || c === '\r') { i++; spaceBefore = true; continue; }
            if (c === '\\' && src[i + 1] === '\n') { i += 2; spaceBefore = true; continue; }
            if (c === '\n') { push('nl', '\n'); i++; continue; }
            if (c === '#') { while (i < src.length && src[i] !== '\n') i++; continue; }
            if (/[0-9]/.test(c)) {
                const m = /^(\d[\d_]*(?:\.\d+)?(?:e[+-]?\d+)?)/i.exec(src.slice(i));
                push('num', Number(m[1].replace(/_/g, ''))); i += m[1].length; continue;
            }
            if (c === '"' || c === "'") {
                let j = i + 1, text = '', parts = [];
                while (j < src.length && src[j] !== c) {
                    if (src[j] === '\\') {
                        const n = src[j + 1];
                        text += c === "'" ? (n === "'" || n === '\\' ? n : '\\' + n) : ({ n: '\n', t: '\t', '"': '"', '\\': '\\', e: '\x1b' }[n] ?? n);
                        j += 2; continue;
                    }
                    if (c === '"' && src[j] === '#' && src[j + 1] === '{') {
                        let depth = 1, k = j + 2;
                        while (k < src.length && depth) { if (src[k] === '{') depth++; else if (src[k] === '}') depth--; k++; }
                        parts.push(text, { code: src.slice(j + 2, k - 1) }); text = ''; j = k; continue;
                    }
                    text += src[j++];
                }
                if (j >= src.length) fail('unterminated string');
                parts.push(text);
                push('str', parts.length === 1 ? parts[0] : parts); i = j + 1; continue;
            }
            if (c === ':' && /[A-Za-z_]/.test(src[i + 1] || '') && src[i - 1] !== ':') {
                const m = /^:([A-Za-z_][A-Za-z0-9_]*[?!]?)/.exec(src.slice(i));
                push('sym', m[1]); i += m[0].length; continue;
            }
            const word = /^(\$[A-Za-z_][A-Za-z0-9_]*|@@?[A-Za-z_][A-Za-z0-9_]*|[A-Za-z_][A-Za-z0-9_]*[?!]?)/.exec(src.slice(i));
            if (word) {
                let w = word[1];
                // `x ? a : b` must not read x? as a predicate name.
                if (/[?!]$/.test(w) && /^[ \t]/.test(src[i + w.length] || '') && !/^[a-z_]/.test(w)) w = w.slice(0, -1);
                const type = w[0] === '$' ? 'gvar' : w[0] === '@' ? 'ivar' : /^[A-Z]/.test(w) ? 'const' : KEYWORDS.has(w) ? 'kw' : 'id';
                push(type, w); i += w.length; continue;
            }
            const op = OPERATORS.find(o => src.startsWith(o, i));
            if (!op) fail('unexpected ' + c);
            push('op', op); i += op.length;
        }
        push('eof', null);
        return out;
    }

    // ---- parser -----------------------------------------------------------------

    function parse(src) {
        const toks = tokenize(src);
        let p = 0;
        const peek = (o = 0) => toks[p + o];
        const next = () => toks[p++];
        const is = (type, value) => peek().type === type && (value === undefined || peek().value === value);
        const isOp = (v) => is('op', v);
        const isKw = (v) => is('kw', v);
        const expect = (type, value) => { if (!is(type, value)) fail(`expected ${value || type}`); return next(); };
        const skipTerms = () => { while (is('nl') || isOp(';')) next(); };

        function body(...stops) {
            const out = [];
            skipTerms();
            while (!is('eof') && !(is('kw') && stops.includes(peek().value)) && !(is('op') && stops.includes(peek().value))) {
                out.push(statement());
                skipTerms();
            }
            return out;
        }

        function statement() {
            let node = simpleStatement();
            // Modifiers: `x if cond`, `x unless cond`, `x while cond`.
            for (;;) {
                if (isKw('if')) { next(); node = { t: 'if', cond: expression(), then: [node], else: [] }; }
                else if (isKw('unless')) { next(); node = { t: 'if', cond: { t: 'not', e: expression() }, then: [node], else: [] }; }
                else if (isKw('while')) { next(); node = { t: 'while', cond: expression(), body: [node] }; }
                else break;
            }
            return node;
        }

        function simpleStatement() {
            if (isKw('if') || isKw('unless')) {
                const negate = next().value === 'unless';
                let cond = expression(); if (negate) cond = { t: 'not', e: cond };
                if (isKw('then')) next();
                const node = { t: 'if', cond, then: body('elsif', 'else', 'end'), else: [] };
                let tail = node;
                while (isKw('elsif')) { next(); const c = expression(); if (isKw('then')) next(); const n = { t: 'if', cond: c, then: body('elsif', 'else', 'end'), else: [] }; tail.else = [n]; tail = n; }
                if (isKw('else')) { next(); tail.else = body('end'); }
                expect('kw', 'end');
                return node;
            }
            if (isKw('while') || isKw('until')) {
                const negate = next().value === 'until';
                let cond = expression(); if (negate) cond = { t: 'not', e: cond };
                if (isKw('do')) next();
                const node = { t: 'while', cond, body: body('end') };
                expect('kw', 'end');
                return node;
            }
            if (isKw('case')) {
                next();
                const subject = expression();
                skipTerms();
                const whens = [];
                let otherwise = [];
                while (isKw('when')) {
                    next();
                    const values = [expression()];
                    while (isOp(',')) { next(); values.push(expression()); }
                    if (isKw('then')) next();
                    whens.push({ values, body: body('when', 'else', 'end') });
                }
                if (isKw('else')) { next(); otherwise = body('end'); }
                expect('kw', 'end');
                return { t: 'case', subject, whens, otherwise };
            }
            if (isKw('break')) { next(); return { t: 'break' }; }
            if (isKw('next')) { next(); return { t: 'continue' }; }
            if (isKw('return')) { next(); return { t: 'return', e: is('nl') || isOp(';') || is('eof') ? null : expression() }; }
            // `name (a, b)`: Ruby reads a spaced parenthesised list after a method name as its arguments.
            if (is('id') && peek(1).type === 'op' && peek(1).value === '(' && peek(1).space && !isAssignmentAhead()) {
                const name = next().value;
                next();
                return { t: 'call', recv: null, name, args: args(')'), block: null };
            }
            // A bare call with arguments and no parentheses: `rotate 30`, `wait 60`.
            if (is('id') && !peek().space && peek(1).space && canStartArgument(peek(1)) && !isAssignmentAhead()) {
                const name = next().value;
                const args = [expression()];
                while (isOp(',')) { next(); args.push(expression()); }
                return { t: 'call', recv: null, name, args, block: null };
            }
            return expression();
        }

        function isAssignmentAhead() { return peek(1).type === 'op' && /^(=|\+=|-=|\*=|\/=|%=|\|\|=|&&=)$/.test(peek(1).value); }
        function canStartArgument(tok) {
            if (['num', 'str', 'sym', 'gvar', 'ivar', 'const'].includes(tok.type)) return true;
            if (tok.type === 'id') return true;
            if (tok.type === 'kw') return ['true', 'false', 'nil', 'self', 'not'].includes(tok.value);
            return tok.type === 'op' && ['[', '!', '('].includes(tok.value);
        }

        function expression() { return notExpr(); }
        function notExpr() { if (isKw('not')) { next(); return { t: 'not', e: notExpr() }; } return andOr(); }
        function andOr() {
            let left = assignment();
            while (isKw('and') || isKw('or')) { const op = next().value === 'and' ? '&&' : '||'; left = { t: 'bin', op, l: left, r: notExprInner() }; }
            return left;
        }
        function notExprInner() { if (isKw('not')) { next(); return { t: 'not', e: notExprInner() }; } return assignment(); }

        function assignment() {
            const left = ternary();
            if (is('op') && /^(=|\+=|-=|\*=|\/=|%=|\|\|=|&&=)$/.test(peek().value)) {
                const op = next().value;
                if (!['var', 'gvar', 'ivar', 'index', 'call'].includes(left.t)) fail('bad assignment target');
                while (is('nl')) next();   // Ruby continues a statement that ends with an operator on the next line
                return { t: 'assign', op, target: left, value: assignment() };
            }
            return left;
        }

        function ternary() {
            const cond = range();
            if (isOp('?')) { next(); const a = ternary(); expect('op', ':'); return { t: 'cond', cond, a, b: ternary() }; }
            return cond;
        }
        function range() {
            const left = binary(0);
            if (isOp('..') || isOp('...')) { const exclusive = next().value === '...'; return { t: 'range', from: left, to: binary(0), exclusive }; }
            return left;
        }
        const LEVELS = [['||'], ['&&'], ['==', '!=', '=~', '==='], ['<', '>', '<=', '>='], ['|', '^'], ['&'], ['<<', '>>'], ['+', '-'], ['*', '/', '%']];
        function binary(level) {
            if (level >= LEVELS.length) return unary();
            let left = binary(level + 1);
            while (is('op') && LEVELS[level].includes(peek().value)) {
                const op = next().value;
                skipNl();
                left = { t: 'bin', op, l: left, r: binary(level + 1) };
            }
            return left;
        }
        function skipNl() { while (is('nl')) next(); }
        function unary() {
            if (isOp('!')) { next(); return { t: 'not', e: unary() }; }
            if (isOp('-')) { next(); return { t: 'neg', e: unary() }; }
            if (isOp('+')) { next(); return unary(); }
            return power();
        }
        function power() {
            const base = postfix(primary());
            if (isOp('**')) { next(); return { t: 'bin', op: '**', l: base, r: unary() }; }
            return base;
        }

        function args(close) {
            const out = [];
            skipNl();
            while (!isOp(close)) {
                out.push(expression());
                skipNl();
                if (isOp(',')) { next(); skipNl(); } else break;
            }
            expect('op', close);
            return out;
        }
        function block() {
            if (isOp('{')) {
                next();
                const params = blockParams();
                const b = body('}');
                expect('op', '}');
                return { params, body: b };
            }
            if (isKw('do')) {
                next();
                const params = blockParams();
                const b = body('end');
                expect('kw', 'end');
                return { params, body: b };
            }
            return null;
        }
        function blockParams() {
            const params = [];
            if (isOp('|')) {
                next();
                while (!isOp('|')) { params.push(expect('id').value); if (isOp(',')) next(); }
                next();
            }
            return params;
        }

        function postfix(node) {
            for (;;) {
                if (isOp('.')) {
                    next();
                    const name = next();
                    if (!['id', 'const', 'kw'].includes(name.type)) fail('bad method name');
                    let callArgs = [];
                    if (isOp('(') && !peek().space) { next(); callArgs = args(')'); }
                    // `foo.bar = x` is a setter; leave it to assignment.
                    node = { t: 'call', recv: node, name: name.value, args: callArgs, block: null };
                    const b = block(); if (b) node.block = b;
                } else if (isOp('::')) {
                    next();
                    node = { t: 'const', name: node.name + '::' + expect('const').value };
                } else if (isOp('[') && !peek().space) {
                    next();
                    node = { t: 'index', recv: node, args: args(']') };
                } else return node;
            }
        }

        function primary() {
            const tok = next();
            switch (tok.type) {
                case 'num': return { t: 'num', v: tok.value };
                case 'str': return typeof tok.value === 'string' ? { t: 'str', v: tok.value } : { t: 'interp', parts: tok.value.map(x => (typeof x === 'string' ? x : parse(x.code))) };
                case 'sym': return { t: 'sym', v: tok.value };
                case 'gvar': return { t: 'gvar', name: tok.value };
                case 'ivar': return { t: 'ivar', name: tok.value.replace(/^@+/, '') };
                case 'const': return { t: 'const', name: tok.value };
                case 'kw':
                    if (tok.value === 'true' || tok.value === 'false') return { t: 'bool', v: tok.value === 'true' };
                    if (tok.value === 'nil') return { t: 'nil' };
                    if (tok.value === 'self') return { t: 'self' };
                    fail('keyword ' + tok.value);
                    break;
                case 'id': {
                    if (isOp('(') && !peek().space) { next(); const a = args(')'); const node = { t: 'call', recv: null, name: tok.value, args: a, block: null }; const b = block(); if (b) node.block = b; return node; }
                    const b = block();
                    if (b) return { t: 'call', recv: null, name: tok.value, args: [], block: b };
                    return { t: 'var', name: tok.value };
                }
                case 'op':
                    if (tok.value === '(') { const e = body(')'); expect('op', ')'); return e.length === 1 ? e[0] : { t: 'seq', body: e }; }
                    if (tok.value === '[') return { t: 'array', items: args(']') };
                    if (tok.value === '{') {
                        // A hash literal: { key => value, sym: value }.
                        const pairs = [];
                        skipNl();
                        while (!isOp('}')) {
                            let key;
                            if (is('id') && peek(1).type === 'op' && peek(1).value === ':') { key = { t: 'sym', v: next().value }; next(); }
                            else { key = ternary(); expect('op', '=>'); }
                            pairs.push([key, expression()]);
                            skipNl();
                            if (isOp(',')) { next(); skipNl(); } else break;
                        }
                        expect('op', '}');
                        return { t: 'hash', pairs };
                    }
                    fail('unexpected ' + tok.value);
                    break;
                default: fail('unexpected ' + tok.type);
            }
            return null;
        }

        const program = body();
        if (!is('eof')) fail('trailing ' + peek().value);
        return program;
    }

    // ---- generation ---------------------------------------------------------------

    const ITEM_TABLES = { $data_items: '$dataItems', $data_weapons: '$dataWeapons', $data_armors: '$dataArmors', $data_skills: '$dataSkills', $data_states: '$dataStates', $data_actors: '$dataActors', $data_classes: '$dataClasses', $data_enemies: '$dataEnemies', $data_troops: '$dataTroops', $data_animations: '$dataAnimations', $data_system: '$dataSystem', $data_tilesets: '$dataTilesets', $data_common_events: '$dataCommonEvents' };
    const INPUT = { A: 'shift', B: 'cancel', C: 'ok', X: 'rgssX', Y: 'rgssY', Z: 'rgssZ', L: 'pageup', R: 'pagedown', DOWN: 'down', LEFT: 'left', RIGHT: 'right', UP: 'up', CTRL: 'control', SHIFT: 'shift', ALT: 'shift' };
    const camel = (s) => s.replace(/[?!]$/, '').replace(/_([a-z])/g, (m, c) => c.toUpperCase());

    // Methods every kind of value has in both languages.
    const COMMON = {
        to_i: (r) => `Math.trunc(Number(${r}))`, to_f: (r) => `Number(${r})`, to_s: (r) => `String(${r})`, round: (r, a) => (a.length ? `Number(Number(${r}).toFixed(${a[0]}))` : `Math.round(${r})`),
        floor: (r) => `Math.floor(${r})`, ceil: (r) => `Math.ceil(${r})`, abs: (r) => `Math.abs(${r})`, zero: (r) => `(${r} === 0)`, 'nil?': (r) => `(${r} == null)`,
        between: (r, a) => `((v) => v >= ${a[0]} && v <= ${a[1]})(${r})`, 'between?': (r, a) => `((v) => v >= ${a[0]} && v <= ${a[1]})(${r})`,
        size: (r) => `${r}.length`, length: (r) => `${r}.length`, count: (r, a, b) => (b ? `${r}.filter(${b}).length` : a.length ? `${r}.filter(x => x === ${a[0]}).length` : `${r}.length`),
        'empty?': (r) => `(${r}.length === 0)`, 'include?': (r, a) => `${r}.includes(${a[0]})`, first: (r) => `${r}[0]`, last: (r) => `${r}[${r}.length - 1]`,
        sample: (r) => `((a) => a[Math.randomInt(a.length)])(${r})`, shuffle: (r) => `((a) => a.slice().sort(() => Math.random() - 0.5))(${r})`,
        downcase: (r) => `String(${r}).toLowerCase()`, upcase: (r) => `String(${r}).toUpperCase()`, strip: (r) => `String(${r}).trim()`, 'start_with?': (r, a) => `String(${r}).startsWith(${a[0]})`, 'end_with?': (r, a) => `String(${r}).endsWith(${a[0]})`,
        max: (r) => `Math.max(...${r})`, min: (r) => `Math.min(...${r})`, sum: (r) => `${r}.reduce((s, x) => s + x, 0)`, reverse: (r) => `${r}.slice().reverse()`, sort: (r) => `${r}.slice().sort((a, b) => a - b)`,
        uniq: (r) => `[...new Set(${r})]`, compact: (r) => `${r}.filter(x => x != null)`, index: (r, a) => `${r}.indexOf(${a[0]})`, push: (r, a) => `${r}.push(${a.join(', ')})`, join: (r, a) => `${r}.join(${a.length ? a[0] : "''"})`,
        'odd?': (r) => `(${r} % 2 !== 0)`, 'even?': (r) => `(${r} % 2 === 0)`, clone: (r) => `(Array.isArray(${r}) ? ${r}.slice() : ${r})`, dup: (r) => `(Array.isArray(${r}) ? ${r}.slice() : ${r})`
    };
    const BLOCK_METHODS = { each: 'forEach', map: 'map', collect: 'map', select: 'filter', 'find_all': 'filter', reject: '!filter', 'any?': 'some', 'all?': 'every', 'none?': '!some', find: 'find', detect: 'find', each_with_index: 'forEach', times: 'times', upto: 'upto', 'sort_by': 'sortBy', 'count': 'count', 'max_by': 'maxBy', 'min_by': 'minBy', 'sum': 'sumBy' };

    // Objects of the RGSS game state: what a method on each is in MZ.
    const OBJECTS = {
        party: { members: '$.members()', battle_members: '$.battleMembers()', leader: '$.leader()', gold: '$.gold()', steps: '$.steps()', size: '$.size()', gain_gold: '$.gainGold(%0)', lose_gold: '$.loseGold(%0)',
            gain_item: '$.gainItem(%0, %1, %2)', lose_item: '$.loseItem(%0, %1, %2)', item_number: '$.numItems(%0)', 'has_item?': '$.hasItem(%0, %1)', add_actor: '$.addActor(%0)', remove_actor: '$.removeActor(%0)',
            items: '$.items()', weapons: '$.weapons()', armors: '$.armors()', 'include?': '$.members().includes(%0)', highest_level: '$.highestLevel()', 'all_dead?': '$.isAllDead()', actors: '$._actors' },
        actor: { hp: '$.hp', mp: '$.mp', tp: '$.tp', mhp: '$.mhp', mmp: '$.mmp', level: '$.level', exp: '$.currentExp()', name: '$.name()', nickname: '$.nickname()', id: '$.actorId()', actor_id: '$.actorId()', class_id: '$._classId',
            'state?': '$.isStateAffected(%0)', add_state: '$.addState(%0)', remove_state: '$.removeState(%0)', 'dead?': '$.isDead()', 'alive?': '$.isAlive()', weapons: '$.weapons()', armors: '$.armors()', equips: '$.equips()',
            'skill_learn?': '$.isLearnedSkill(%0.id)', learn_skill: '$.learnSkill(%0)', forget_skill: '$.forgetSkill(%0)', recover_all: '$.recoverAll()', change_level: '$.changeLevel(%0, %1)', gain_exp: '$.gainExp(%0)',
            atk: '$.atk', def: '$.def', mat: '$.mat', mdf: '$.mdf', agi: '$.agi', luk: '$.luk', character_name: '$.characterName()', face_name: '$.faceName()', set_graphic: '$.setCharacterImage(%0, %1); $.setFaceImage(%2, %3)' },
        character: { x: '$.x', y: '$.y', real_x: '$._realX', real_y: '$._realY', direction: '$.direction()', 'moving?': '$.isMoving()', erase: '$.erase()', moveto: '$.locate(%0, %1)', id: '$.eventId()',
            screen_x: '$.screenX()', screen_y: '$.screenY()', opacity: '$.opacity()', transparent: '$.isTransparent()', turn_toward_player: '$.turnTowardPlayer()', 'dash?': '$.isDashing()', refresh: '$.refresh()',
            animation_id: '$._animationId', character_name: '$.characterName()', 'through': '$.isThrough()', start: '$.start()', followers: '$.followers()', 'normal_walk?': '$.isNormal()' },
        map: { map_id: '$.mapId()', width: '$.width()', height: '$.height()', display_x: '$.displayX()', display_y: '$.displayY()', region_id: '$.regionId(%0, %1)', terrain_tag: '$.terrainTag(%0, %1)',
            'passable?': '$.isPassable(%0, %1, %2)', autoplay: '$.autoplay()', refresh: '$.requestRefresh()', need_refresh: '$._needsRefresh', event_id_xy: '$.eventIdXy(%0, %1)', events_xy: '$.eventsXy(%0, %1)', name_display: '$._nameDisplay',
            display_name: '$.displayName()', 'scrolling?': '$.isScrolling()', start_scroll: '$.startScroll(%0, %1, %2)', parallax_name: '$._parallaxName', tileset_id: '$.tilesetId()' },
        system: { save_disabled: '!$.isSaveEnabled()', menu_disabled: '!$.isMenuEnabled()', encounter_disabled: '!$.isEncounterEnabled()', playtime: '$.playtime()', save_count: '$.saveCount()', battle_count: '$.battleCount()',
            playtime_s: '$.playtimeText()', battle_bgm: '$.battleBgm()' },
        followers: { visible: '$.isVisible()', 'visible?': '$.isVisible()', gather: '$.gather()', 'gather?': '$.areGathering()' },
        timer: { sec: '$.seconds()', start: '$.start(%0 * 60)', stop: '$.stop()', 'working?': '$.isWorking()' },
        screen: { start_tone_change: '$.startTint(%0, %1)', start_flash: '$.startFlash(%0, %1)', start_shake: '$.startShake(%0, %1, %2)', pictures: '$._pictures', weather: '$.changeWeather(%0, %1, %2)' },
        message: { 'busy?': '$.isBusy()', add: '$.add(%0)', face_name: '$._faceName', background: '$._background', position: '$._positionType' }
    };
    /** Globals and what kind of object each is. */
    const GLOBALS = { $game_party: ['$gameParty', 'party'], $game_player: ['$gamePlayer', 'character'], $game_map: ['$gameMap', 'map'], $game_system: ['$gameSystem', 'system'], $game_timer: ['$gameTimer', 'timer'], $game_troop: ['$gameTroop', 'party'], $game_message: ['$gameMessage', 'message'], $game_temp: ['$gameTemp', 'temp'], $game_screen: ['$gameScreen', 'screen'] };

    function generate(program, options) {
        const self = options.self || 'interpreter';
        const constants = options.constants || {};
        const calls = options.calls || {};
        const locals = new Set();
        const blockParamsKinds = new Map();

        const gen = (n) => expr(n).code;
        const js = (code, kind = 'any') => ({ code, kind });
        const fill = (template, recv, a) => template.replace(/\$(?![A-Za-z_])/g, recv).replace(/%(\d)/g, (m, i) => (a[Number(i)] !== undefined ? a[Number(i)] : 'undefined')).replace(/, undefined\)/g, ')').replace(/\(undefined\)/g, '()').replace(/%\*/g, a.join(', '));

        function literal(v) { return JSON.stringify(v); }

        function expr(n) {
            switch (n.t) {
                case 'num': return js(String(n.v), 'number');
                case 'str': return js(literal(n.v), 'string');
                case 'interp': return js('`' + n.parts.map(p => (typeof p === 'string' ? p.replace(/[`\\$]/g, c => '\\' + c) : '${' + p.map(gen).join('; ') + '}')).join('') + '`', 'string');
                case 'sym': return js(literal(n.v), 'string');
                case 'bool': return js(String(n.v), 'bool');
                case 'nil': return js('null', 'nil');
                case 'self': return self === 'character' ? js('this', 'character') : fail('self in an interpreter');
                case 'array': return js('[' + n.items.map(gen).join(', ') + ']', 'array');
                case 'hash': return js('{ ' + n.pairs.map(([k, v]) => `[${gen(k)}]: ${gen(v)}`).join(', ') + ' }', 'any');
                case 'range': { const a = gen(n.from), b = gen(n.to); return js(`Array.from({ length: (${b}) - (${a})${n.exclusive ? '' : ' + 1'} }, (_, i) => (${a}) + i)`, 'array'); }
                case 'not': return js('!(' + gen(n.e) + ')', 'bool');
                case 'neg': return js('-(' + gen(n.e) + ')', 'number');
                case 'cond': return js(`(${gen(n.cond)} ? ${gen(n.a)} : ${gen(n.b)})`);
                case 'seq': return js('(' + n.body.map(gen).join(', ') + ')');
                case 'bin': {
                    if (n.op === '=~') fail('regexp');
                    const op = n.op === '==' ? '===' : n.op === '!=' ? '!==' : n.op === '===' ? '===' : n.op;
                    // Ruby's == compares numbers and strings by value, as JS's == would with mixed types; keep === for like types.
                    const l = expr(n.l), r = expr(n.r);
                    const loose = (n.op === '==' || n.op === '!=') && (l.kind === 'nil' || r.kind === 'nil');
                    return js(`(${l.code} ${loose ? n.op : op} ${r.code})`, ['==', '!=', '<', '>', '<=', '>=', '&&', '||'].includes(n.op) ? 'bool' : 'number');
                }
                case 'const': {
                    if (Object.prototype.hasOwnProperty.call(constants, n.name) && typeof constants[n.name] !== 'object') return js(literal(constants[n.name]));
                    const last = n.name.split('::').pop();
                    if (Object.prototype.hasOwnProperty.call(constants, last) && typeof constants[last] !== 'object') return js(literal(constants[last]));
                    if (options.classes && options.classes[n.name]) return js(`(typeof ${options.classes[n.name]} === "function" ? ${options.classes[n.name]} : null)`, 'scene');
                    if (/^Scene_[A-Za-z]+$/.test(n.name)) return js(n.name, 'scene');
                    if (['Input', 'Audio', 'SceneManager', 'Graphics', 'Color', 'Tone', 'RPG::SE', 'RPG::BGM', 'RPG::ME', 'RPG::BGS', 'Math', 'DataManager', 'BattleManager'].includes(n.name)) return js(n.name, 'module:' + n.name);
                    return fail('unknown constant ' + n.name);
                }
                case 'gvar': {
                    if (ITEM_TABLES[n.name]) return js(ITEM_TABLES[n.name], 'table');
                    if (GLOBALS[n.name]) return js(GLOBALS[n.name][0], GLOBALS[n.name][1]);
                    if (n.name === '$game_variables' || n.name === '$game_switches' || n.name === '$game_self_switches' || n.name === '$game_actors') return js(n.name, n.name);
                    if (options.globals && options.globals[n.name]) return js(options.globals[n.name][0], options.globals[n.name][1] || 'any');
                    return fail('unknown global ' + n.name);
                }
                case 'ivar': {
                    if (self === 'character') {
                        const map = { x: 'this.x', y: 'this.y', direction: 'this._direction', move_speed: 'this._moveSpeed', move_frequency: 'this._moveFrequency', opacity: 'this._opacity', through: 'this._through', id: 'this._eventId',
                            pattern: 'this._pattern', blend_type: 'this._blendMode', transparent: 'this._transparent', priority_type: 'this._priorityType', walk_anime: 'this._walkAnime', step_anime: 'this._stepAnime',
                            direction_fix: 'this._directionFix', character_name: 'this._characterName', character_index: 'this._characterIndex', move_route_index: 'this._moveRouteIndex', wait_count: 'this._waitCount',
                            animation_id: 'this._animationId', balloon_id: 'this._balloonId', map_id: '$gameMap.mapId()', real_x: 'this._realX', real_y: 'this._realY', jump_count: 'this._jumpCount' };
                        if (map[n.name]) return js(map[n.name], 'number');
                        if (options.ivars && options.ivars[n.name]) return js(options.ivars[n.name]);
                        return fail('unknown instance variable @' + n.name);
                    }
                    if (n.name === 'event_id') return js('this._eventId', 'number');
                    if (n.name === 'map_id') return js('this._mapId', 'number');
                    return fail('unknown instance variable @' + n.name);
                }
                case 'var': {
                    if (locals.has(n.name)) return js(n.name, blockParamsKinds.get(n.name) || 'any');
                    return callNode({ t: 'call', recv: null, name: n.name, args: [], block: null });
                }
                case 'index': return index(n);
                case 'call': return callNode(n);
                case 'assign': return assign(n);
                default: return fail('statement in expression: ' + n.t);
            }
        }

        function index(n) {
            const recv = expr(n.recv);
            const a = n.args.map(gen);
            if (recv.kind === '$game_variables') return js(`$gameVariables.value(${a[0]})`, 'number');
            if (recv.kind === '$game_switches') return js(`$gameSwitches.value(${a[0]})`, 'bool');
            if (recv.kind === '$game_self_switches') return js(`$gameSelfSwitches.value(${a[0]})`, 'bool');
            if (recv.kind === '$game_actors') return js(`$gameActors.actor(${a[0]})`, 'actor');
            if (recv.kind === 'events') return js(`$gameMap.event(${a[0]})`, 'character');
            if (recv.kind === 'table') return js(`${recv.code}[${a[0]}]`, 'record');
            if (recv.kind === 'pictures') return js(`$gameScreen.picture(${a[0]})`, 'picture');
            if ((recv.kind.startsWith('array') || ['any', 'string'].includes(recv.kind)) && a.length === 1) return js(`${recv.code}[${a[0]}]`, recv.kind.startsWith('array:') ? recv.kind.slice(6) : 'any');
            return fail('index on ' + recv.kind);
        }

        function blockFn(b, arity = 1, elementKind = null) {
            const params = b.params.length ? b.params : ['_'];
            params.forEach((p, i) => { locals.add(p); if (i === 0 && elementKind) blockParamsKinds.set(p, elementKind); });
            const statements = b.body.map(stmt);
            const last = statements.length ? b.body[b.body.length - 1] : null;
            const lastIsExpr = last && !['if', 'while', 'case', 'assign', 'break', 'continue', 'return'].includes(last.t);
            const text = lastIsExpr && statements.length === 1 ? statements[0].replace(/;$/, '') : null;
            return `(${params.slice(0, Math.max(arity, params.length)).join(', ')}) => ${text !== null ? text : '{ ' + statements.slice(0, -1).join(' ') + (lastIsExpr ? ' return ' + statements[statements.length - 1] : ' ' + (statements[statements.length - 1] || '')) + ' }'}`;
        }

        function callNode(n) {
            const a = n.args.map(gen);
            // A method the game's scripts define (a family), called on self.
            if (!n.recv && calls[n.name] !== undefined) {
                const entry = calls[n.name];
                const t = Array.isArray(entry) ? entry[0] : entry;
                const kind = Array.isArray(entry) ? entry[1] : 'any';
                return js(typeof t === 'function' ? t(a) : t.replace('%*', a.join(', ')).replace('%r', a.slice(1).join(', ')).replace(/%(\d)/g, (m, i) => (a[Number(i)] !== undefined ? a[Number(i)] : 'undefined')).replace(/, undefined\)/g, ')').replace(/\(undefined\)/g, '()'), kind);
            }
            if (!n.recv) return bareCall(n, a);
            const recv = expr(n.recv);
            if (recv.kind.startsWith('module:')) return moduleCall(recv.kind.slice(7), n, a);
            if (n.block && BLOCK_METHODS[n.name]) {
                const how = BLOCK_METHODS[n.name];
                const element = recv.kind.startsWith('array:') ? recv.kind.slice(6) : null;
                const blockFnOf = (b) => blockFn(b, 1, element);
                if (how === 'times') return js(`for (let ${n.block.params[0] || '_i'} = 0; ${n.block.params[0] || '_i'} < ${recv.code}; ${n.block.params[0] || '_i'}++) (${blockFnOf(n.block)})(${n.block.params[0] || '_i'})`);
                if (how.startsWith('!')) return js(`!${recv.code}.${how.slice(1)}(${blockFnOf(n.block)})`, 'bool');
                if (how === 'count') return js(`${recv.code}.filter(${blockFnOf(n.block)}).length`, 'number');
                if (how === 'sortBy') return js(`${recv.code}.slice().sort((a, b) => ((f) => f(a) - f(b))(${blockFnOf(n.block)}))`, 'array');
                if (how === 'sumBy') return js(`${recv.code}.reduce((s, x) => s + (${blockFnOf(n.block)})(x), 0)`, 'number');
                if (how === 'maxBy' || how === 'minBy') return js(`${recv.code}.reduce((best, x) => ((f) => best === undefined || f(x) ${how === 'maxBy' ? '>' : '<'} f(best) ? x : best)(${blockFnOf(n.block)}), undefined)`);
                const kind = ['map', 'filter'].includes(how) ? 'array' : ['some', 'every'].includes(how) ? 'bool' : 'any';
                return js(`${recv.code}.${how}(${blockFnOf(n.block)})`, kind);
            }
            if (n.block) fail('block on ' + n.name);
            if (recv.kind === 'events' || (recv.kind === 'map' && n.name === 'events')) return js('$gameMap', 'events');
            const member = options.members && options.members[recv.kind + '.' + n.name];
            if (member) return js(fill(member[0], recv.code, a), member[1] || 'any');
            const extra = options.objects && options.objects[recv.kind];
            if (extra && extra[n.name] !== undefined) return js(fill(extra[n.name], recv.code, a), 'any');
            const table = OBJECTS[recv.kind];
            if (table && table[n.name]) return js(fill(table[n.name], recv.code, a), kindOf(recv.kind, n.name));
            if (recv.kind === 'map' && n.name === 'events') return js('$gameMap', 'events');
            if (recv.kind === 'map' && n.name === 'screen') return js('$gameScreen', 'screen');
            if (recv.kind === 'screen' && n.name === 'pictures') return js('$gameScreen', 'pictures');
            if (recv.kind === 'record') {
                const fields = { id: 'id', name: 'name', icon_index: 'iconIndex', price: 'price', description: 'description', note: 'note' };
                if (fields[n.name] && !a.length) return js(`${recv.code}.${fields[n.name]}`);
            }
            if (recv.kind === 'picture') {
                const pics = { x: '$.x()', y: '$.y()', opacity: '$.opacity()', name: '$.name()', erase: '$.erase()', zoom_x: '$.scaleX()', zoom_y: '$.scaleY()', angle: '$.angle()' };
                if (pics[n.name]) return js(fill(pics[n.name], recv.code, a));
            }
            if (COMMON[n.name] && (recv.kind.startsWith('array') || ['any', 'number', 'string', 'bool'].includes(recv.kind))) {
                const element = recv.kind.startsWith('array:') ? recv.kind.slice(6) : 'any';
                return js(COMMON[n.name](recv.code, a), ['first', 'last', 'sample'].includes(n.name) ? element : 'any');
            }
            return fail(`unknown method ${n.name} on ${recv.kind}`);
        }

        function kindOf(kind, name) {
            if (kind === 'party' && ['members', 'battle_members'].includes(name)) return 'array:actor';
            if (kind === 'party' && ['items', 'weapons', 'armors'].includes(name)) return 'array:record';
            if (kind === 'actor' && ['weapons', 'armors', 'equips'].includes(name)) return 'array:record';
            if (kind === 'party' && name === 'leader') return 'actor';
            if (kind === 'character' && name === 'followers') return 'followers';
            if (['hp', 'mp', 'tp', 'level', 'gold', 'x', 'y', 'map_id', 'direction', 'steps'].includes(name)) return 'number';
            return 'any';
        }

        function moduleCall(mod, n, a) {
            const key = a.map(x => x);
            if (mod === 'Input') {
                const button = (x) => { const m = /^"([A-Z0-9_]+)"$/.exec(x); if (!m) return fail('input symbol'); if (!INPUT[m[1]]) return fail('input ' + m[1]); return literal(INPUT[m[1]]); };
                if (n.name === 'trigger?') return js(`Input.isTriggered(${button(key[0])})`, 'bool');
                if (n.name === 'press?') return js(`Input.isPressed(${button(key[0])})`, 'bool');
                if (n.name === 'repeat?') return js(`Input.isRepeated(${button(key[0])})`, 'bool');
                if (n.name === 'dir4') return js('Input.dir4', 'number');
                if (n.name === 'dir8') return js('Input.dir8', 'number');
            }
            if (mod === 'Audio') {
                const file = (x) => `String(${x}).replace(/^Audio\\/[A-Za-z]+\\//, '')`;
                const sound = { se_play: 'playSe', me_play: 'playMe', bgm_play: 'playBgm', bgs_play: 'playBgs' }[n.name];
                if (sound) return js(`AudioManager.${sound}({ name: ${file(a[0])}, volume: ${a[1] || 100}, pitch: ${a[2] || 100}, pan: 0 })`);
                const stop = { bgm_stop: 'stopBgm()', bgs_stop: 'stopBgs()', me_stop: 'stopMe()', se_stop: 'stopSe()', bgm_fade: `fadeOutBgm(${a[0]} / 1000)`, bgs_fade: `fadeOutBgs(${a[0]} / 1000)` }[n.name];
                if (stop) return js(`AudioManager.${stop}`);
            }
            if (mod === 'SceneManager') {
                // A game's own scene that a family ports may be off with its plugin: then the call does nothing.
                const ported = n.args && n.args[0] && n.args[0].t === 'const' && options.classes && options.classes[n.args[0].name];
                if (n.name === 'call') return js(ported ? `((s) => s && SceneManager.push(s))(${a[0]})` : `SceneManager.push(${a[0]})`);
                if (n.name === 'goto') return js(ported ? `((s) => s && SceneManager.goto(s))(${a[0]})` : `SceneManager.goto(${a[0]})`);
                if (n.name === 'return') return js('SceneManager.pop()');
                if (n.name === 'exit') return js('SceneManager.exit()');
            }
            if (mod === 'Graphics' && ['width', 'height', 'frame_count'].includes(n.name)) return js(`Graphics.${camel(n.name)}`, 'number');
            if ((mod === 'Color' || mod === 'Tone') && n.name === 'new') return js('[' + [a[0], a[1], a[2], a[3] !== undefined ? a[3] : (mod === 'Color' ? 255 : 0)].join(', ') + ']', 'array');
            if (/^RPG::(SE|ME|BGM|BGS)$/.test(mod) && n.name === 'new') return js(`{ name: ${a[0] || '""'}, volume: ${a[1] || 100}, pitch: ${a[2] || 100}, pan: 0 }`, 'audio');
            if (mod === 'DataManager' && n.name === 'save_file_exists?') return js('DataManager.isAnySavefileExists()', 'bool');
            if (mod === 'Math' && ['sqrt', 'sin', 'cos', 'atan2', 'hypot'].includes(n.name)) return js(`Math.${n.name}(${a.join(', ')})`, 'number');
            return fail(`unknown ${mod}.${n.name}`);
        }

        function bareCall(n, a) {
            const name = n.name;
            if (name === 'rand') return js(a.length ? `Math.randomInt(${a[0]})` : 'Math.random()', 'number');
            if (name === 'p' || name === 'print' || name === 'puts' || name === 'msgbox') return js(`console.log(${a.join(', ')})`);
            if (name === 'loop' && n.block) return js(`while (true) (${blockFn(n.block)})()`);
            if (self === 'interpreter') {
                const interp = {
                    get_character: `this.character(%0)`, wait: `this.wait(%0)`, map_id: '$gameMap.mapId()', event_id: 'this._eventId', 'screen': '$gameScreen',
                    get_actor: `$gameActors.actor(%0)`, set_self_switch: `$gameSelfSwitches.setValue([$gameMap.mapId(), this._eventId, %0], %1)`
                };
                if (interp[name] !== undefined) return js(fill(interp[name], '', a), name === 'get_character' ? 'character' : name === 'screen' ? 'screen' : 'any');
            } else {
                const own = {
                    x: 'this.x', y: 'this.y', direction: 'this.direction()', move_down: 'this.moveStraight(2)', move_left: 'this.moveStraight(4)', move_right: 'this.moveStraight(6)', move_up: 'this.moveStraight(8)',
                    move_random: 'this.moveRandom()', move_toward_player: 'this.moveTowardPlayer()', move_away_from_player: 'this.moveAwayFromPlayer()', move_forward: 'this.moveForward()', move_backward: 'this.moveBackward()',
                    jump: 'this.jump(%0, %1)', turn_down: 'this.setDirection(2)', turn_left: 'this.setDirection(4)', turn_right: 'this.setDirection(6)', turn_up: 'this.setDirection(8)', turn_toward_player: 'this.turnTowardPlayer()',
                    turn_away_from_player: 'this.turnAwayFromPlayer()', set_direction: 'this.setDirection(%0)', moveto: 'this.locate(%0, %1)', erase: 'this.erase()', 'moving?': 'this.isMoving()', 'jumping?': 'this.isJumping()',
                    'dash?': 'this.isDashing()', screen_x: 'this.screenX()', screen_y: 'this.screenY()', set_graphic: 'this.setImage(%0, %1)', map_id: '$gameMap.mapId()', distance_x_from: 'this.deltaXFrom(%0)', distance_y_from: 'this.deltaYFrom(%0)',
                    move_straight: 'this.moveStraight(%0)', move_diagonal: 'this.moveDiagonally(%0, %1)'
                };
                if (own[name] !== undefined) return js(fill(own[name], '', a), ['x', 'y', 'direction'].includes(name) ? 'number' : 'any');
            }
            return fail('unknown call ' + name);
        }

        function assign(n) {
            // $scene = Scene_X.new: the stock scenes MZ has under the same or a close name.
            if (n.target.t === 'gvar' && n.target.name === '$scene' && n.op === '=' && n.value.t === 'call' && n.value.name === 'new' && n.value.recv && n.value.recv.t === 'const') {
                const scene = n.value.recv.name;
                const SCENES = { Scene_Map: 'SceneManager.goto(Scene_Map)', Scene_Title: 'SceneManager.goto(Scene_Title)', Scene_Gameover: 'SceneManager.goto(Scene_Gameover)',
                    Scene_Menu: 'SceneManager.push(Scene_Menu)', Scene_Item: 'SceneManager.push(Scene_Item)', Scene_Skill: 'SceneManager.push(Scene_Skill)', Scene_Equip: 'SceneManager.push(Scene_Equip)',
                    Scene_Status: 'SceneManager.push(Scene_Status)', Scene_Save: 'SceneManager.push(Scene_Save)', Scene_Load: 'SceneManager.push(Scene_Load)', Scene_End: 'SceneManager.push(Scene_GameEnd)',
                    Scene_Debug: 'SceneManager.push(Scene_Debug)' };
                if (!n.value.args.length && SCENES[scene]) return js(SCENES[scene]);
                if (options.scenes && options.scenes[scene]) return js(options.scenes[scene].replace(/%(\d)/g, (m, i) => (n.value.args[i] ? gen(n.value.args[i]) : 'undefined')));
                return fail('scene ' + scene);
            }
            const valueNode = expr(n.value);
            const value = valueNode.code;
            const t = n.target;
            const op = n.op;
            const combine = (current) => (op === '=' ? value : op === '||=' ? `(${current} || ${value})` : op === '&&=' ? `(${current} && ${value})` : `${current} ${op.slice(0, -1)} (${value})`);
            if (t.t === 'index') {
                const recv = expr(t.recv), a = t.args.map(gen);
                if (recv.kind === '$game_variables') return js(`$gameVariables.setValue(${a[0]}, ${combine(`$gameVariables.value(${a[0]})`)})`);
                if (recv.kind === '$game_switches') return js(`$gameSwitches.setValue(${a[0]}, ${combine(`$gameSwitches.value(${a[0]})`)})`);
                if (recv.kind === '$game_self_switches') return js(`$gameSelfSwitches.setValue(${a[0]}, ${combine(`$gameSelfSwitches.value(${a[0]})`)})`);
                if (options.setters && options.setters[recv.kind + '.[]']) return js(options.setters[recv.kind + '.[]'].replace(/\$(?![A-Za-z_])/g, recv.code).replace('%k', a[0]).replace('%v', value));
                if (recv.kind.startsWith('array') || recv.kind === 'any') return js(`${recv.code}[${a[0]}] = ${combine(`${recv.code}[${a[0]}]`)}`);
                return fail('assignment into ' + recv.kind);
            }
            // A game script's own global ($skill_shop = [...]), where a family says where it lives now.
            if (t.t === 'gvar' && options.setters && options.setters[t.name] && op === '=') return js(options.setters[t.name].replace('%v', value));
            if (t.t === 'var') {
                if (locals.has(t.name)) return js(`${t.name} = ${combine(t.name)}`);
                if (op !== '=') fail('compound assignment to an undeclared local');
                locals.add(t.name);
                if (valueNode.kind !== 'any') blockParamsKinds.set(t.name, valueNode.kind);
                return js(`var ${t.name} = ${value}`);
            }
            if (t.t === 'ivar' || (t.t === 'call' && t.recv && t.recv.t === 'self' && !t.args.length)) {
                const name = t.t === 'ivar' ? t.name : t.name;
                if (self === 'character') {
                    const setters = {
                        move_speed: 'this.setMoveSpeed(%v)', move_frequency: 'this.setMoveFrequency(%v)', through: 'this.setThrough(%v)', direction_fix: 'this.setDirectionFix(%v)', walk_anime: 'this.setWalkAnime(%v)',
                        step_anime: 'this.setStepAnime(%v)', opacity: 'this.setOpacity(%v)', blend_type: 'this.setBlendMode(%v)', transparent: 'this.setTransparent(%v)', priority_type: 'this.setPriorityType(%v)',
                        pattern: 'this.setPattern(%v)', direction: 'this._direction = %v', animation_id: '$gameTemp.requestAnimation([this], %v)', balloon_id: '$gameTemp.requestBalloon(this, %v)',
                        character_name: 'this._characterName = %v', character_index: 'this._characterIndex = %v', wait_count: 'this._waitCount = %v', x: 'this._x = %v', y: 'this._y = %v',
                        move_route_index: 'this._moveRouteIndex = %v'
                    };
                    const current = { opacity: 'this.opacity()', move_speed: 'this.moveSpeed()', x: 'this.x', y: 'this.y', direction: 'this.direction()', pattern: 'this.pattern()', wait_count: 'this._waitCount', move_route_index: 'this._moveRouteIndex' }[name];
                    if (setters[name]) return js(setters[name].replace('%v', op === '=' ? value : current ? combine(current) : fail('compound on ' + name)));
                    if (options.ivars && options.ivars[name] && op === '=') return js(`${options.ivars[name]} = ${value}`);
                }
                return fail('assignment to @' + name);
            }
            if (t.t === 'call' && t.recv) {
                const recv = expr(t.recv);
                if (recv.kind === 'map' && t.name === 'name_display') return js(`$gameMap._nameDisplay = ${value}`);
                if (recv.kind === 'map' && t.name === 'need_refresh') return js(`if (${value}) $gameMap.requestRefresh()`);
                if (recv.kind === 'system' && ['save_disabled', 'menu_disabled', 'encounter_disabled'].includes(t.name)) {
                    const which = { save_disabled: 'Save', menu_disabled: 'Menu', encounter_disabled: 'Encounter' }[t.name];
                    return js(`(${value} ? $gameSystem.disable${which}() : $gameSystem.enable${which}())`);
                }
                if (recv.kind === 'character' && ['opacity', 'transparent', 'through', 'direction_fix', 'move_speed', 'blend_type'].includes(t.name)) {
                    const set = { opacity: 'setOpacity', transparent: 'setTransparent', through: 'setThrough', direction_fix: 'setDirectionFix', move_speed: 'setMoveSpeed', blend_type: 'setBlendMode' }[t.name];
                    return js(`${recv.code}.${set}(${value})`);
                }
                if (recv.kind === 'followers' && t.name === 'visible') return js(`(${value} ? $gamePlayer.showFollowers() : $gamePlayer.hideFollowers()); $gamePlayer.refresh()`);
                if (recv.kind === 'actor' && ['hp', 'mp', 'tp'].includes(t.name)) return js(`${recv.code}.set${t.name.toUpperCase()[0]}${t.name.slice(1)}(${value})`);
                if (recv.kind === 'actor' && t.name === 'name') return js(`${recv.code}.setName(${value})`);
                if (recv.kind === 'party' && t.name === 'gold') return js(`$gameParty.gainGold((${value}) - $gameParty.gold())`);
                if (options.setters && options.setters[recv.kind + '.' + t.name]) return js(options.setters[recv.kind + '.' + t.name].replace(/\$(?![A-Za-z_])/g, recv.code).replace('%v', value));
                return fail(`assignment to ${recv.kind}.${t.name}`);
            }
            return fail('assignment target');
        }

        function stmt(n) {
            switch (n.t) {
                case 'if': return `if (${gen(n.cond)}) { ${n.then.map(stmt).join(' ')} }${n.else.length ? ` else { ${n.else.map(stmt).join(' ')} }` : ''}`;
                case 'while': return `while (${gen(n.cond)}) { ${n.body.map(stmt).join(' ')} }`;
                case 'case': {
                    const subject = gen(n.subject);
                    const branches = n.whens.map(w => `(${w.values.map(v => (v.t === 'range' ? `((v) => v >= ${gen(v.from)} && v <${v.exclusive ? '' : '='} ${gen(v.to)})(_c)` : `_c === ${gen(v)}`)).join(' || ')}) { ${w.body.map(stmt).join(' ')} }`);
                    return `{ const _c = ${subject}; if ${branches.join(' else if ')}${n.otherwise.length ? ` else { ${n.otherwise.map(stmt).join(' ')} }` : ''} }`;
                }
                case 'break': return 'break;';
                case 'continue': return 'continue;';
                case 'return': return n.e ? `return ${gen(n.e)};` : 'return;';
                default: return gen(n) + ';';
            }
        }

        return program.map(stmt).join('\n');
    }

    /** Ruby → JS, or null when any part of it is not in the table. */
    function transpile(source, options = {}) {
        try {
            const program = parse(String(source || ''));
            if (!program.length) return '';
            const code = generate(program, options);
            // eslint-disable-next-line no-new, no-new-func
            new Function(code);
            return code;
        } catch (error) {
            if (error instanceof Fail || error instanceof SyntaxError) return null;
            throw error;
        }
    }

    /** The same, as an expression (a condition or operand), or null. */
    function transpileExpression(source, options = {}) {
        try {
            const program = parse(String(source || ''));
            if (program.length !== 1 || ['if', 'while', 'case', 'break', 'continue', 'return'].includes(program[0].t)) return null;
            const code = generate(program, options).replace(/;$/, '');
            // eslint-disable-next-line no-new, no-new-func
            new Function('return (' + code + ')');
            return code;
        } catch (error) {
            if (error instanceof Fail || error instanceof SyntaxError) return null;
            throw error;
        }
    }

    const api = { tokenize, parse, transpile, transpileExpression };
    root.RRRubyTranspiler = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
