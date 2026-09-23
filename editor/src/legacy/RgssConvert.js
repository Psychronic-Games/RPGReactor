/**
 * RgssConvert - RPG Maker VX Ace data (as read by RubyMarshal) into RPG Maker
 * MZ data. Pure: plain objects in, MZ JSON records out, with a `notes` tally
 * of everything that did not carry over one for one.
 *
 * VX Ace is the generation MV and MZ were designed from: its records, trait
 * (feature) codes, effect codes, tile ids and event command codes are MZ's
 * own under snake_case names. What differs is small and handled here: audio,
 * tone and colour objects become MZ's arrays and objects; Show Choices counts
 * its cancel choice from 1; buttons and weather are Ruby symbols; the map's
 * fourth layer packs the shadow and the region; terms tables are shorter.
 * Ruby in Script commands and script operands cannot run: a small, strict
 * translator turns the common one-liners (variables, switches, gold, random
 * numbers) into JavaScript and keeps anything else as a comment.
 */
(function (root) {
    'use strict';

    const num = (v, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
    const str = (v) => (typeof v === 'string' ? v : '');
    const list = (v) => (Array.isArray(v) ? v : []);
    const round = (v) => Math.round(num(v));

    /** Audio, tones, colours and move routes, wherever they appear. */
    function plain(v, notes) {
        if (v === null || v === undefined) return v;
        if (Array.isArray(v)) return v.map(x => plain(x, notes));
        if (v instanceof Uint8Array) return '';
        if (typeof v !== 'object') return v;
        switch (v.__class) {
            case 'RPG::AudioFile': case 'RPG::BGM': case 'RPG::BGS': case 'RPG::ME': case 'RPG::SE':
                return audio(v);
            case 'Tone': return [round(v.red), round(v.green), round(v.blue), round(v.gray)];
            case 'Color': return [round(v.red), round(v.green), round(v.blue), round(v.alpha)];
            case 'RPG::MoveRoute': return moveRoute(v, notes);
            case 'RPG::MoveCommand': return moveCommand(v, notes);
            default: {
                const out = {};
                for (const [k, x] of Object.entries(v)) if (k !== '__class') out[k] = plain(x, notes);
                return out;
            }
        }
    }

    const audio = (a) => (a ? { name: str(a.name), volume: num(a.volume, 100), pitch: num(a.pitch, 100), pan: 0 } : { name: '', volume: 100, pitch: 100, pan: 0 });
    const tag = (notes, key, n = 1) => { if (notes) notes[key] = (notes[key] || 0) + n; };

    let activeContext = {};
    function moveCommand(c, notes) {
        const code = num(c.code);
        let parameters = list(c.parameters).map(p => plain(p, notes));
        if (code === 45) {   // Script, in Ruby
            const js = ruby(str(parameters[0]), 'statement', Object.assign({}, activeContext, { self: 'character' }));
            if (js !== null) { parameters = [js]; tag(notes, 'rubyTranslated'); }
            else { tag(notes, 'moveRouteScript'); parameters = ['/* Ruby: ' + str(parameters[0]).replace(/\*\//g, '* /') + ' */']; }
        }
        return { code, parameters, indent: null };
    }
    function moveRoute(r, notes) {
        return { list: list(r.list).map(c => moveCommand(c, notes)), repeat: !!r.repeat, skippable: !!r.skippable, wait: !!r.wait };
    }

    // ---- Ruby one-liners -------------------------------------------------------

    // ---- script families ----------------------------------------------------------

    /**
     * A call with literal arguments: name(1, "a", -2.5, true) or name 1, 2 or a bare
     * name. Returns { name, args: [JS literal text] } or null. Constants resolve.
     */
    function parseCall(s, constants) {
        const m = /^([a-z_][A-Za-z0-9_]*[?!]?)\s*(?:\((.*)\)|\s+(.+))?$/.exec(s);
        if (!m) return null;
        const body = m[2] !== undefined ? m[2] : m[3];
        if (body === undefined || !body.trim()) return { name: m[1], args: [] };
        const args = [];
        for (const part of body.match(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|[^,]+/g) || []) {
            const t = part.trim();
            if (!t) continue;
            if (/^-?\d+(\.\d+)?$/.test(t)) args.push(t);
            else if (/^"(?:[^"\\]|\\.)*"$/.test(t)) args.push(JSON.stringify(t.slice(1, -1).replace(/\\"/g, '"')));
            else if (/^'(?:[^'\\]|\\.)*'$/.test(t)) args.push(JSON.stringify(t.slice(1, -1)));
            else if (t === 'true' || t === 'false') args.push(t);
            else if (t === 'nil') args.push('null');
            else if (constants && Object.prototype.hasOwnProperty.call(constants, t) && typeof constants[t] !== 'object') args.push(JSON.stringify(constants[t]));
            else return null;
        }
        // A trailing comma or an unbalanced quote leaves a part the match above cannot account for.
        return args.length === body.split(/,(?=(?:[^"']*["'][^"']*["'])*[^"']*$)/).filter(x => x.trim()).length ? { name: m[1], args } : null;
    }

    /**
     * Published VX Ace scripts whose calls events make, as Reactor runtime calls.
     * `detect` is tested against the game's own scripts; a family's rules apply
     * only when the game carries it, so another game's same-named method is never
     * guessed at. `route` rules run with `this` the character (Set Move Route's
     * Script), `event` rules in a Script command. Each maps a call name to a JS
     * template (%0, %1… are the arguments; %* all of them) or a function.
     */
    const FAMILIES = [
        {
            key: 'galvMoveRouteExtras', detect: /galv_move_extras|Galv's Move Route Extras/i, plugin: 'RR_GalvMoveRouteExtras',
            route: {
                set_char: 'this.rrSetChar?.(%*)', restore_char: 'this.rrRestoreChar?.()', jump_to: 'this.rrJumpTo?.(%*)', jump_to_char: 'this.rrJumpToChar?.(%0)',
                jump_forward: 'this.rrJumpForward?.(%0)', move_toward_event: 'this.moveTowardCharacter($gameMap.event(%0))', move_toward_xy: 'this.rrMoveTowardXy?.(%0, %1)',
                turn_toward_event: 'this.turnTowardCharacter($gameMap.event(%0))', move_away_from_event: 'this.moveAwayFromCharacter($gameMap.event(%0))', move_away_from_xy: 'this.rrMoveAwayFromXy?.(%0, %1)',
                self_switch: 'this.rrSelfSwitch?.(%*)', fadeout: 'this.rrFadeOut?.(%0)', fadein: 'this.rrFadeIn?.(%0)', char_level: 'this.setPriorityType(%0)',
                anim: '$gameTemp.requestAnimation([this], %0)', balloon: '$gameTemp.requestBalloon(this, %0)', wait: 'this.rrWaitBetween?.(%0, %1)',
                repeat: 'this.rrRepeat?.(%0)', end_repeat: 'this.rrEndRepeat?.()', repeat_next: 'this.rrRepeatNext?.(%0)'
            }
        },
        {
            key: 'ozCharacterZ', detect: /ozzevent_screen_z|OZ Character Z/i, plugin: 'RR_OzCharacterZ',
            assign: { plus_z: 'this._rrPlusZ = %v' },
            event: { change_zmap: '$gameMap.rrChangeZ?.(%*)' }
        },
        { key: 'ozAnimationZ', detect: /OZ Animation Z|animation_z_offset/i, plugin: 'RR_OzCharacterZ', assign: { animation_z: 'this._rrAnimationZ = %v' } },
        {
            key: 'shazMultiFog', detect: /shaz_multi_fog|Multi Layer Fog/i, plugin: 'RR_ShazMultiFog',
            parameters: (constants) => ({ keepOnTransfer: String(constants.CLEAR_ON_TRANSFER === false), folder: 'img/Fogs/' }),
            event: { show_fog: '$gameScreen.rrShowFog?.(%*)', tint_fog: '$gameScreen.rrTintFog?.(%*)', fade_fog: '$gameScreen.rrFadeFog?.(%*)', erase_fog: '$gameScreen.rrEraseFog?.(%0)' }
        },
        {
            key: 'galvRespawn', detect: /Galv.{0,20}Respawn|do_respawn\?/i, plugin: 'RR_GalvRespawnEvents',
            event: { set_spawn: 'this.rrSetSpawn?.(%*)', do_all_respawn: 'this.rrDoAllRespawn?.(%*)', do_map_respawn: 'this.rrDoMapRespawn?.(%*)', do_e_respawn: 'this.rrDoEventRespawn?.(%*)',
                respawn_time: ['(this.rrRespawnTime?.(%*) ?? 0)', 'number'], purge_respawn_timers: '$gameSystem._rrSpawnTimers = {}', purge_timer: 'this.rrPurgeTimer?.(%*)' },
            route: { 'do_respawn?': 'this.rrDoRespawn?.(%*)' }
        },
        {
            key: 'theoFootsteps', detect: /Theo.{0,20}Footstep|def footstep|fsound/i, plugin: 'RR_TheoFootsteps',
            event: { footstep: ['($gameSystem.rrFootsteps ? $gameSystem.rrFootsteps?.() : {})', 'any'] }
        },
        {
            key: 'rokanSymbolEncounter', detect: /enable_symbol_encount/, plugin: 'RR_RokanSymbolEncounter',
            route: { enable_symbol_encount: 'this.rrEnableSymbolEncounter?.(%0)' },
            event: { reset_stealth: '$gamePlayer._rrStealthCount = 0' }
        },
        {
            key: 'theoPathfinding', detect: /def find_path|Pathfinding/i, plugin: 'RR_TheoPathfinding',
            route: { find_path: 'this.rrFindPath?.(%*)', goto_player: 'this.rrGotoCharacter?.(-1, %*)', goto_event: 'this.rrGotoCharacter?.(%*)' }
        },
        {
            // Woratana's Multiple Fog (VX): $fog is a staging object; the fogs are RR_ShazMultiFog's.
            key: 'woraMultipleFog', detect: /class Worale_Multiple_Fog/, plugin: 'RR_WoraFog', requires: ['RR_ShazMultiFog'],
            parameters: (constants) => ({ keepOnTransfer: constants['Worale_Multiple_Fog::CLEAR_FOG'] === false ? 'true' : 'false', folder: 'img/pictures/' }),
            globals: { $fog: ['$gameTemp.rrWoraFog?.()', 'woraFog'] },
            objects: { woraFog: { show: '$?.show()', clear: '$?.clear()', delete: '$?.delete(%0)', opacity: '$?.setOpacity(%*)', blend: '$?.setBlend(%*)', speed: '$?.speed(%*)', speed_plus: '$?.speedPlus(%*)', zoom: '$?.setZoom(%*)', tone: '$?.setTone(%*)' } },
            setters: { 'woraFog.id': '((f) => f && (f.id = %v))($)', 'woraFog.name': '((f) => f && (f.name = %v))($)', 'woraFog.opacity': '((f) => f && (f.opacity = %v))($)', 'woraFog.blend': '((f) => f && (f.blend = %v))($)',
                'woraFog.ox': '((f) => f && (f.ox = %v))($)', 'woraFog.oy': '((f) => f && (f.oy = %v))($)', 'woraFog.zoom': '((f) => f && (f.zoom = %v))($)', 'woraFog.tone': '((f) => f && (f.tone = %v))($)' }
        },
        {
            // Nechigawara's Skill Shop / Tech Shop (VX): goods in $skill_shop, then the scene.
            key: 'skillShop', detect: /module SKILL_SHOP\b[\s\S]*Window_Skill_ShopBuy/, plugin: 'RR_SkillShop',
            setters: { $skill_shop: '$gameTemp.rrSkillShopGoods = %v' },
            scenes: { Scene_Skill_Shop: '(typeof Scene_RRSkillShop !== "undefined" && SceneManager.push(Scene_RRSkillShop))' }
        },
        {
            // modern algebra's Editable Actor Options (VX): the options are traits the importer wrote.
            key: 'maActorOptions', detect: /def change_actor_options\b/, plugin: 'RR_ActorOptions',
            event: { change_actor_options: 'this.rrActorOption?.(%*)' }
        },
        {
            // Nicke's Simple Journal: its quests become Reactor's own (Database › Quests), its calls drive them.
            key: 'nickeSimpleJournal', detect: /NICKE-SIMPLE-JOURNAL/, plugin: 'RR_NickeJournal',
            event: { add_quest: 'this.rrNickeQuest?.("add", %0, %1)', complete_quest: 'this.rrNickeQuest?.("complete", %0, %1)', fail_quest: 'this.rrNickeQuest?.("fail", %0, %1)' },
            scenes: { Scene_Simple_Journal: 'SceneManager.push(Scene_Quest)' },
            quests: (scripts) => {
                const out = [];
                const text = scripts.join('\n');
                for (const [kind, category, header] of [['main', 'Main', 'MAIN_Q_HEADER'], ['side', 'Side', 'SIDE_Q_HEADER']]) {
                    const name = (new RegExp(header + '\\s*=\\s*"([^"]*)"').exec(text) || [, category])[1];
                    for (const m of text.matchAll(new RegExp(kind.toUpperCase() + '_QUESTS\\[(\\d+)\\]\\s*=\\s*\\[\\s*-?\\d+\\s*,\\s*"((?:[^"\\\\]|\\\\.)*)"\\s*,\\s*"((?:[^"\\\\]|\\\\.)*)"', 'g'))) {
                        out.push({ key: `${kind}-${m[1]}`, name: m[2], category: name, description: m[3] });
                    }
                }
                return out;
            }
        },
        {
            // A battleback kept on Game_System (DerVVulf's VX script and its kin); the per-map table is read by the importer.
            key: 'systemBattleback', detect: /attr_accessor\s+:battleback\b/, plugin: 'RR_VxCompat',
            setters: { 'system.battleback': '$gameSystem._rrBattleback = %v' }
        },
        {
            key: 'msEnhancedCamera', detect: /ms_pro_cam_center_at|ms_ecam/, plugin: 'RR_MsEnhancedCamera',
            event: { ms_pro_cam_center_at: 'this.rrCamCenterAt?.(%*)', ms_pro_cam_center_at_char: 'this.rrCamCenterAtChar?.(%*)', ms_pro_cam_wait_for_scrolling: 'this.rrCamWaitForScrolling?.()',
                ms_pro_cam_focus_on: 'this.rrCamFocusOn?.(%*)', ms_pro_cam_ignore_player: '$gameMap.rrCamIgnorePlayer?.(%0)', ms_pro_cam_lock_camera: '$gameMap.rrCamLock?.(true)', ms_pro_cam_unlock_camera: '$gameMap.rrCamLock?.(false)',
                ms_pro_cam_str: '$gameMap.rrCamStrength?.(%0)', ms_pro_cam_reset_str: '$gameMap.rrCamStrength?.()', 'ms_pro_cam_character_on_screen?': ['(this.rrCamOnScreen?.(%0) ?? true)', 'bool'] },
            setters: { 'system.cam_disabled': '$gameSystem._rrCamDisabled = %v' }
        },
        {
            key: 'theoNotif', detect: /stack_notif|add_notif/, plugin: 'RR_TheoNotifWindow',
            event: { add_notif: '$gameTemp.rrAddNotif?.(%0)' }
        },
        {
            key: 'theoChoices', detect: /vx_choice|\$choicelist_options/, plugin: 'RR_TheoChoices',
            event: { vx_choice: '($gameMessage._rrVxChoice = %0)' },
            globals: { $choicelist_options: ['($gameTemp.rrChoiceOptions ? $gameTemp.rrChoiceOptions?.() : {})', 'any'] }
        },
        {
            key: 'mogPictureEffects', detect: /MOG.{0,5}Picture.{0,3}Effects|def picture_effect\b/i, plugin: 'RR_MogPictureEffects',
            event: { picture_effect: '$gameScreen.rrPictureEffectEx?.(%*)', picture_position: '$gameScreen.rrPicturePosition?.(%*)', picture_effects_clear: '$gameScreen.rrPictureEffectsClear?.(%0)', set_picture_z: '$gameSystem._rrPictureScreenZ = %0' }
        },
        {
            key: 'mogBattlebackEx', detect: /MOG.{0,5}Battleback.{0,3}EX|def bb_clear/i, plugin: 'RR_MogBattlebackEx',
            event: { bb: '$gameSystem.rrBb?.(%*)', bb_name: '$gameSystem.rrBbName?.(%*)', bb_clear: '$gameSystem.rrBbClear?.()', bb_screen_z: '$gameSystem._rrBbScreenZ = %0' }
        },
        {
            key: 'theoInvisibleRegions', detect: /invisreg|visireg/i, plugin: 'RR_TheoInvisibleRegions',
            setters: { 'system.picture_front': '$gameSystem._rrPictureFront = %v' }
        },
        {
            key: 'khasLights', detect: /Khas.{0,20}Light|effect_surface/i, plugin: 'RR_KhasLights',
            members: { 'map.effect_surface': ['$gameMap.rrEffectSurface?.()', 'khasSurface'], 'map.lantern': ['$gameMap.rrLantern?.()', 'khasLantern'] },
            objects: {
                khasSurface: { set_color: '$?.setColor(%*)', set_alpha: '$?.setAlpha(%*)', change_color: '$?.changeColor(%*)', change_alpha: '$?.changeAlpha(%*)' },
                khasLantern: { set_opacity: '$?.setOpacity(%*)', set_graphic: '$?.setGraphic(%0)', change_owner: '$?.changeOwner(%0)', hide: '$?.hide()', show: '$?.show()', set_multiple_graphics: '$?.setMultipleGraphics(%0)' }
            }
        },
        {
            key: 'maQuestJournal', detect: /module QuestData\b/, plugin: 'RR_QuestJournal',
            event: { quest: ['$gameParty.rrQuest?.(%0)', 'maQuest'], reveal_objective: '$gameParty.rrQuest?.(%0)?.revealObjective(%r)', conceal_objective: '$gameParty.rrQuest?.(%0)?.concealObjective(%r)',
                complete_objective: '$gameParty.rrQuest?.(%0)?.completeObjective(%r)', uncomplete_objective: '$gameParty.rrQuest?.(%0)?.uncompleteObjective(%r)', fail_objective: '$gameParty.rrQuest?.(%0)?.failObjective(%r)',
                unfail_objective: '$gameParty.rrQuest?.(%0)?.unfailObjective(%r)', 'quest_revealed?': ['!!$gameParty.rrQuestRevealed?.(%0)', 'bool'], reveal_quest: '$gameParty.rrQuest?.(%0)?.reveal()', conceal_quest: '$gameParty.rrQuest?.(%0)?.conceal()',
                'quest_complete?': ['!!$gameParty.rrQuestIs?.(%0, "complete")', 'bool'], 'quest_failed?': ['!!$gameParty.rrQuestIs?.(%0, "failed")', 'bool'], 'quest_active?': ['!!$gameParty.rrQuestIs?.(%0, "active")', 'bool'] },
            members: { 'maQuest.objectives': ['($?.objectives || [])', 'array'] },
            objects: { maQuest: { reveal_objective: '$?.revealObjective(%*)', conceal_objective: '$?.concealObjective(%*)', complete_objective: '$?.completeObjective(%*)', uncomplete_objective: '$?.uncompleteObjective(%*)',
                fail_objective: '$?.failObjective(%*)', unfail_objective: '$?.unfailObjective(%*)', name: '$?.name', description: '$?.description', 'complete?': '$?.isComplete()', 'failed?': '$?.isFailed()' } },
            setters: { 'maQuest.name': '((q) => q && (q.name = %v))($)', 'maQuest.description': '((q) => q && (q.description = %v))($)', 'maQuest.client': '((q) => q && (q.client = %v))($)', 'maQuest.location': '((q) => q && (q.location = %v))($)',
                'maQuest.icon_index': '((q) => q && (q.iconIndex = %v))($)', 'maQuest.level': '((q) => q && (q.level = %v))($)' }
        }
    ];

    /** The families a game's scripts carry. */
    function scriptFamilies(sources) {
        const text = sources.join('\n');
        return new Set(FAMILIES.filter(f => f.detect.test(text)).map(f => f.key));
    }

    const T = root.RRRubyTranspiler || (typeof require === 'function' ? require('./RubyTranspiler.js') : null);

    /** The calls and instance variables the enabled families add, for one `self`. */
    function familyTables(context) {
        const calls = {}, ivars = {};
        const extra = { members: {}, objects: {}, globals: {}, setters: {}, scenes: {} };
        const self = context.self === 'character' ? 'character' : 'interpreter';
        for (const family of FAMILIES) {
            if (!context.families || !context.families.has(family.key)) continue;
            // Calls into a plugin are written with ?. so turning the plugin off leaves them doing nothing.
            Object.assign(calls, (self === 'character' ? family.route : family.event) || {});
            Object.assign(extra.members, family.members || {});
            Object.assign(extra.objects, family.objects || {});
            Object.assign(extra.globals, family.globals || {});
            Object.assign(extra.setters, family.setters || {});
            Object.assign(extra.scenes, family.scenes || {});
            if (self === 'character') for (const [name, template] of Object.entries(family.assign || {})) ivars[name] = template.replace(/\s*=\s*%v$/, '');
        }
        return { calls, ivars, extra };
    }

    /**
     * Ruby from an event as JS (RubyTranspiler, with the enabled families' calls),
     * or null. `kind` 'statement' for Script commands and move-route scripts,
     * 'expression' for conditions and operands.
     */
    function ruby(source, kind, context = {}) {
        if (!T) return null;
        const { calls, ivars, extra } = familyTables(context);
        const options = Object.assign({ self: context.self === 'character' ? 'character' : 'interpreter', constants: context.constants || {}, calls, ivars }, extra);
        return kind === 'expression' ? T.transpileExpression(source, options) : T.transpile(source, options);
    }

    /**
     * A Script command's lines as JS lines, or null. The whole program first;
     * failing that, line by line when every line is a whole statement on its own
     * (no block opens across lines), with the lines that cannot run kept as JS
     * comments in place. `partial` says whether any line was left behind.
     */
    function rubyProgram(lines, context) {
        const whole = ruby(lines.join('\n'), 'statement', context);
        if (whole !== null) return { code: whole.split('\n'), partial: false };
        if (!T) return null;
        const standalone = lines.every(line => { try { T.parse(line); return true; } catch (_) { return false; } });
        if (!standalone) return null;
        const out = [];
        let translated = 0;
        for (const line of lines) {
            const js = ruby(line, 'statement', context);
            if (js !== null) { out.push(...js.split('\n').filter(l => l !== '')); if (js) translated++; }
            else out.push('// Ruby (did not carry over): ' + line);
        }
        return translated ? { code: out, partial: true } : null;
    }

    /** A Ruby literal: an integer, true/false, a string or an array of strings. */
    function literal(text) {
        const t = String(text).trim();
        if (t === 'true' || t === 'false') return t === 'true';
        if (/^-?\d+$/.test(t)) return Number(t);
        if (/^["']/.test(t)) return t.slice(1, -1);
        if (/^\[/.test(t)) return Array.from(t.matchAll(/"([^"]*)"|'([^']*)'/g), m => (m[1] !== undefined ? m[1] : m[2]));
        return undefined;
    }

    /**
     * The game's default font as its scripts leave it: the last Font.default_name /
     * default_size / default_outline assignment in script order, each a literal or
     * a constant (YEA::CORE::FONT_NAME).
     */
    function fontDefaults(sources, constants) {
        const out = {};
        for (const source of sources) for (const m of String(source || '').matchAll(/^\s*Font\.default_(name|size|outline|shadow|bold)\s*=\s*(.+?)\s*(#.*)?$/gm)) {
            let value = literal(m[2]);
            if (value === undefined && constants && Object.prototype.hasOwnProperty.call(constants, m[2].trim())) value = constants[m[2].trim()];
            if (value !== undefined) out[m[1]] = value;
        }
        if (typeof out.name === 'string') out.name = [out.name];
        return out;
    }

    /**
     * The screen size the game's scripts set with Graphics.resize_screen(w, h)
     * (the last call in script order; literals or constants), or null when they
     * keep Ace's 544×416. A resolution script is how most Ace games reach 640×480.
     */
    function screenSize(sources, constants) {
        let size = null;
        const value = (arg) => { const t = arg.trim(); const v = literal(t); if (typeof v === 'number') return v; return constants && typeof constants[t] === 'number' ? constants[t] : null; };
        for (const source of sources) for (const m of String(source || '').matchAll(/^\s*Graphics\.resize_screen\(\s*([^,()]+?)\s*,\s*([^,()]+?)\s*\)/gm)) {
            const w = value(m[1]), h = value(m[2]);
            if (w > 0 && h > 0) size = [Math.min(w, 1920), Math.min(h, 1080)];
        }
        return size;
    }

    /**
     * The layers the GDS "Ultimate Parallax Control" script draws, as map image
     * layers: per map id, `<id>_Ground` over the tiles and under characters, and
     * `<id>_layer2` (sky), `<id>_light` and `<id>_shadow` over everything, each
     * optionally switched and given a variant by a variable ("4-1_Ground").
     * Returns null when the game does not carry the script.
     */
    function gdsParallaxLayers(sources) {
        const text = sources.find(t => /module\s+GDS_Parallax/.test(String(t || '')));
        if (!text) return null;
        const code = String(text).replace(/#.*$/gm, '');
        const ids = (name) => { const m = new RegExp('\\b' + name + '\\s*=\\s*\\[([\\s\\S]*?)\\]').exec(code); return m ? (m[1].match(/\d+/g) || []).map(Number) : []; };
        const id = (name) => { const m = new RegExp('\\b' + name + '\\s*=\\s*(\\d+|nil)').exec(code); return m && m[1] !== 'nil' ? Number(m[1]) : 0; };
        return [
            { key: 'ground', maps: ids('Ground'), suffix: '_Ground', layer: 'ground', variable: id('VARIABLE_GROUND'), switch: id('SWITCH_GROUND') },
            { key: 'shadow', maps: ids('Shadow'), suffix: '_shadow', layer: 'over', variable: id('VARIABLE_SHADOW'), switch: id('SWITCH_SHADOW') },
            { key: 'light', maps: ids('Light'), suffix: '_light', layer: 'over', variable: id('VARIABLE_LIGHT'), switch: id('SWITCH_LIGHT') },
            { key: 'sky', maps: ids('Parallax2'), suffix: '_layer2', layer: 'over', variable: id('VARIABLE_SKY'), switch: id('SWITCH_SKY') }
        ];
    }

    /**
     * The em size a browser needs to draw a font the size RGSS did. RGSS asks
     * Windows for a font by its cell height (winAscent + winDescent), a browser
     * by its em, so "24" in an Ace game is 24 × unitsPerEm / cell: Cardo 24 is
     * 17.7 px. Measured on The Seventh Warrior: at 17.7 px all 12,802 message
     * lines fit their windows, at 24 px 2,143 overflow. Null for an unreadable font.
     */
    function rgssFontScale(bytes) {
        try {
            const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
            const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
            const tables = {};
            for (let i = 0; i < view.getUint16(4); i++) { const o = 12 + i * 16; tables[String.fromCharCode(b[o], b[o + 1], b[o + 2], b[o + 3])] = view.getUint32(o + 8); }
            if (!tables.head || !tables['OS/2']) return null;
            const upm = view.getUint16(tables.head + 18), cell = view.getUint16(tables['OS/2'] + 74) + view.getUint16(tables['OS/2'] + 76);
            return upm > 0 && cell > 0 ? upm / cell : null;
        } catch (_) { return null; }
    }

    /** NAME = 12 / NAME = true / NAME = "x" / NAME = ["a", "b"] constants anywhere in the game's scripts, qualified by their modules too. */
    function scriptConstants(sources) {
        const out = {};
        for (const source of sources) {
            const stack = [];
            for (const line of String(source || '').split(/\r?\n/)) {
                const mod = /^\s*(module|class)\s+([A-Z][A-Za-z0-9_:]*)/.exec(line);
                if (mod) { stack.push(mod[2]); continue; }
                if (/^\s*end\b/.test(line) && stack.length && /^\s{0,2}end\b/.test(line)) stack.pop();
                const m = /^\s*([A-Z][A-Za-z0-9_]*)\s*=\s*(-?\d+|true|false|"[^"]*"|'[^']*'|\[\s*(?:(?:"[^"]*"|'[^']*')\s*,?\s*)*\])\s*(#.*)?$/.exec(line);
                if (!m) continue;
                const value = literal(m[2]);
                out[m[1]] = value;
                for (let i = 0; i < stack.length; i++) out[stack.slice(i).concat(m[1]).join('::')] = value;
            }
        }
        return out;
    }

    // ---- event commands --------------------------------------------------------

    const BUTTONS = { A: 'shift', B: 'cancel', C: 'ok', X: 'shift', Y: 'shift', Z: 'ok', L: 'pageup', R: 'pagedown', DOWN: 'down', LEFT: 'left', RIGHT: 'right', UP: 'up', CTRL: 'control', SHIFT: 'shift', ALT: 'shift' };

    /**
     * Message text codes from the game's message scripts, as MZ codes. Only the
     * codes the game's own scripts define are touched (context.messageCodes):
     * Yanfly's \\ii[n] / \\iw[n] / \\ia[n] / \\is[n] (icon and name, fixed per
     * id, so written out now) and Hime's \\MF[face, index] (a face change inside
     * a message, Reactor's \\RRFACE code). Yanfly's \\px[n] is MZ's own \\PX.
     */
    function messageText(line, notes) {
        const codes = activeContext.messageCodes || {};
        let out = String(line);
        if (codes.yeaIcons && activeContext.names) {
            out = out.replace(/\\i([iwas])\[(\d+)\]/gi, (m, kind, id) => {
                const table = activeContext.names[{ i: 'items', w: 'weapons', a: 'armors', s: 'skills' }[kind.toLowerCase()]] || [];
                const r = table[Number(id)];
                if (!r) return m;
                tag(notes, 'textCodeConverted');
                return `\\I[${r.icon}]${r.name}`;
            });
        }
        if (codes.messageFace) out = out.replace(/\\MF\[\s*([^,\]]*?)\s*,\s*(\d+)\s*\]/gi, (m, face, index) => { tag(notes, 'textCodeConverted'); return `\\RRFACE[${face},${index}]`; });
        return out;
    }

    /** One Ace event command list → MZ, with Ruby translated or kept as comments. */
    function commands(cmds, notes) {
        const out = [];
        const src = list(cmds);
        for (let i = 0; i < src.length; i++) {
            const c = src[i] || {};
            const code = num(c.code), indent = num(c.indent);
            let p = list(c.parameters).map(x => plain(x, notes));
            switch (code) {
                case 101: {
                    // Yanfly's name box, \\n<Name> (or \\nc<> / \\nr<>) anywhere in the message, is MZ's speaker name.
                    let speaker = '';
                    if ((activeContext.messageCodes || {}).nameBox) {
                        for (let j = i + 1; j < src.length && src[j] && src[j].code === 401; j++) {
                            const text = str(list(src[j].parameters)[0]);
                            const m = /\\n[cr]?<([^>]*)>/i.exec(text);
                            if (m && !speaker) speaker = m[1];
                            if (m) { src[j] = Object.assign({}, src[j], { parameters: [text.replace(/\\n[cr]?<[^>]*>/gi, '')] }); tag(notes, 'nameBox'); }
                        }
                    }
                    p = [str(p[0]), num(p[1]), num(p[2]), num(p[3], 2), speaker];
                    break;
                }
                case 401: case 405: p = [messageText(str(p[0]), notes)]; break;
                case 102: {
                    const choices = list(p[0]).map(x => messageText(str(x), notes)), cancel = num(p[1]);
                    const cancelType = cancel === 0 ? -1 : cancel > choices.length ? -2 : cancel - 1;
                    p = [choices, cancelType, 0, 2, 0];
                    break;
                }
                case 111:
                    if (p[0] === 11) { p = [11, BUTTONS[String(p[1]).toUpperCase()] || 'ok', 0]; tag(notes, 'buttonMapped'); }
                    else if (p[0] === 12) {
                        const js = ruby(str(p[1]), 'expression', activeContext);
                        if (js !== null) { p = [12, js]; tag(notes, 'rubyTranslated'); }
                        else { p = [12, 'false /* Ruby: ' + str(p[1]).replace(/\*\//g, '* /') + ' */']; tag(notes, 'rubyCondition'); }
                    }
                    break;
                case 122:
                    if (p[3] === 4) {
                        const js = ruby(str(p[4]), 'expression', activeContext);
                        if (js !== null) { p[4] = js; tag(notes, 'rubyTranslated'); }
                        else { p[4] = '0 /* Ruby: ' + str(p[4]).replace(/\*\//g, '* /') + ' */'; tag(notes, 'rubyOperand'); }
                    }
                    break;
                case 232: p = p.slice(0, 12); while (p.length < 12) p.push(p.length === 11 ? false : 0); p.push(0); break;   // + easing
                case 236: p = [String(p[0] || 'none').replace(/^:/, ''), num(p[1]), num(p[2]), !!p[3]]; break;
                case 319: p = [num(p[0]), num(p[1]) + 1, num(p[2])]; break;   // RGSS slot index 0 (weapon) … is MZ equipment type 1 …
                case 321: p = [num(p[0]), num(p[1]), false]; break;
                case 322: p = [num(p[0]), str(p[1]), num(p[2]), str(p[3]), num(p[4]), '']; break;
                case 355: {
                    // A Script command and its continuation lines are one program.
                    const lines = [str(p[0])];
                    while (i + 1 < src.length && src[i + 1] && src[i + 1].code === 655) lines.push(str(list(src[++i].parameters)[0]));
                    const program = rubyProgram(lines, activeContext);
                    if (program && program.code.some(l => l.trim())) {
                        out.push({ code: 355, indent, parameters: [program.code[0]] });
                        for (const line of program.code.slice(1)) out.push({ code: 655, indent, parameters: [line] });
                        tag(notes, program.partial ? 'rubyPartial' : 'rubyTranslated');
                    } else if (program) {
                        // Only comments and blank lines: nothing to run.
                        out.push({ code: 108, indent, parameters: ['Ruby script (comments only):'] });
                        for (const l of lines) out.push({ code: 408, indent, parameters: [l] });
                    } else {
                        out.push({ code: 108, indent, parameters: ['Ruby script (did not carry over):'] });
                        for (const l of lines) out.push({ code: 408, indent, parameters: [l] });
                        tag(notes, 'rubyScript');
                    }
                    continue;
                }
                case 505: p = [plain(list(c.parameters)[0], notes)]; break;
                default: break;
            }
            out.push({ code, indent, parameters: p });
        }
        if (!out.length || out[out.length - 1].code !== 0) out.push({ code: 0, indent: 0, parameters: [] });
        return out;
    }

    // ---- database --------------------------------------------------------------

    const traits = (features) => list(features).map(f => ({ code: num(f.code), dataId: num(f.data_id), value: num(f.value) }));
    const effects = (effs) => list(effs).map(e => ({ code: num(e.code), dataId: num(e.data_id), value1: num(e.value1), value2: num(e.value2) }));
    const damage = (d) => ({ type: num(d && d.type), elementId: num(d && d.element_id), formula: str(d && d.formula) || '0', variance: num(d && d.variance, 20), critical: !!(d && d.critical) });
    const byId = (records, convert) => { const out = [null]; for (const r of list(records)) if (r && r.id) out[r.id] = convert(r); for (let i = 1; i < out.length; i++) if (out[i] === undefined) out[i] = null; return out; };

    function database(ace, notes) {
        const usable = (r) => ({
            animationId: num(r.animation_id), damage: damage(r.damage), description: str(r.description), effects: effects(r.effects),
            hitType: num(r.hit_type), iconIndex: num(r.icon_index), name: str(r.name), note: str(r.note), occasion: num(r.occasion),
            repeats: num(r.repeats, 1), scope: num(r.scope), speed: num(r.speed), successRate: num(r.success_rate, 100), tpGain: num(r.tp_gain)
        });
        const actors = byId(ace.actors, a => ({
            id: a.id, battlerName: '', characterIndex: num(a.character_index), characterName: str(a.character_name), classId: num(a.class_id, 1),
            equips: list(a.equips).map(x => num(x)), faceIndex: num(a.face_index), faceName: str(a.face_name), traits: traits(a.features),
            initialLevel: num(a.initial_level, 1), maxLevel: num(a.max_level, 99), name: str(a.name), nickname: str(a.nickname), note: str(a.note), profile: str(a.description)
        }));
        const classes = byId(ace.classes, c => {
            const t = c.params, params = [];
            for (let p = 0; p < 8; p++) {
                const row = [];
                for (let lv = 0; lv < (t ? t.ysize : 100); lv++) row.push(t ? t.data[p + lv * t.xsize] : 1);
                params.push(row);
            }
            return { id: c.id, expParams: list(c.exp_params).map(x => num(x)), traits: traits(c.features), learnings: list(c.learnings).map(l => ({ level: num(l.level, 1), note: str(l.note), skillId: num(l.skill_id) })), name: str(c.name), note: str(c.note), params };
        });
        const skills = byId(ace.skills, s => Object.assign(usable(s), {
            id: s.id, message1: str(s.message1), message2: str(s.message2), mpCost: num(s.mp_cost), requiredWtypeId1: num(s.required_wtype_id1), requiredWtypeId2: num(s.required_wtype_id2),
            stypeId: num(s.stype_id), tpCost: num(s.tp_cost), messageType: 1
        }));
        const items = byId(ace.items, it => Object.assign(usable(it), { id: it.id, consumable: it.consumable !== false, itypeId: num(it.itype_id, 1), price: num(it.price) }));
        const equip = (e) => ({ description: str(e.description), etypeId: num(e.etype_id), traits: traits(e.features), iconIndex: num(e.icon_index), name: str(e.name), note: str(e.note), params: list(e.params).map(x => num(x)), price: num(e.price) });
        const weapons = byId(ace.weapons, w => Object.assign(equip(w), { id: w.id, animationId: num(w.animation_id), wtypeId: num(w.wtype_id) }));
        const armors = byId(ace.armors, a => Object.assign(equip(a), { id: a.id, atypeId: num(a.atype_id) }));
        const enemies = byId(ace.enemies, e => ({
            id: e.id, actions: list(e.actions).map(a => ({ conditionParam1: num(a.condition_param1), conditionParam2: num(a.condition_param2), conditionType: num(a.condition_type), rating: num(a.rating, 5), skillId: num(a.skill_id, 1) })),
            battlerHue: num(e.battler_hue), battlerName: str(e.battler_name), dropItems: list(e.drop_items).map(d => ({ dataId: num(d.data_id, 1), denominator: num(d.denominator, 1), kind: num(d.kind) })),
            exp: num(e.exp), traits: traits(e.features), gold: num(e.gold), name: str(e.name), note: str(e.note), params: list(e.params).map(x => num(x))
        }));
        const troops = byId(ace.troops, t => ({
            id: t.id, members: list(t.members).map(m => ({ enemyId: num(m.enemy_id), x: num(m.x), y: num(m.y), hidden: !!m.hidden })), name: str(t.name),
            pages: list(t.pages).map(pg => {
                const c = pg.condition || {};
                return { conditions: { actorHp: num(c.actor_hp, 50), actorId: num(c.actor_id, 1), actorValid: !!c.actor_valid, enemyHp: num(c.enemy_hp, 50), enemyIndex: num(c.enemy_index), enemyValid: !!c.enemy_valid, switchId: num(c.switch_id, 1), switchValid: !!c.switch_valid, turnA: num(c.turn_a), turnB: num(c.turn_b), turnEnding: !!c.turn_ending, turnValid: !!c.turn_valid }, list: commands(pg.list, notes), span: num(pg.span) };
            })
        }));
        const states = byId(ace.states, s => ({
            id: s.id, autoRemovalTiming: num(s.auto_removal_timing), chanceByDamage: num(s.chance_by_damage, 100), iconIndex: num(s.icon_index), maxTurns: num(s.max_turns, 1),
            message1: str(s.message1), message2: str(s.message2), message3: str(s.message3), message4: str(s.message4), minTurns: num(s.min_turns, 1), motion: 0, name: str(s.name), note: str(s.note), overlay: 0,
            priority: num(s.priority, 50), releaseByDamage: false, removeAtBattleEnd: !!s.remove_at_battle_end, removeByDamage: !!s.remove_by_damage, removeByRestriction: !!s.remove_by_restriction,
            removeByWalking: !!s.remove_by_walking, restriction: num(s.restriction), stepsToRemove: num(s.steps_to_remove, 100), traits: traits(s.features), messageType: 1
        }));
        const animations = byId(ace.animations, a => ({
            id: a.id, name: str(a.name), animation1Name: str(a.animation1_name), animation1Hue: num(a.animation1_hue), animation2Name: str(a.animation2_name), animation2Hue: num(a.animation2_hue), position: num(a.position, 1),
            frames: list(a.frames).slice(0, Math.max(1, num(a.frame_max, list(a.frames).length))).map(f => {
                const t = f && f.cell_data, cells = [];
                if (t) for (let i = 0; i < t.xsize; i++) {
                    const cell = []; for (let k = 0; k < 8; k++) cell.push(t.data[i + k * t.xsize]);
                    if (cell[0] >= 0) cells.push(cell);
                }
                return cells;
            }),
            timings: list(a.timings).map(t => ({ flashColor: plain(t.flash_color) || [255, 255, 255, 255], flashDuration: num(t.flash_duration, 5), flashScope: num(t.flash_scope), frame: num(t.frame), se: t.se ? audio(t.se) : null }))
        }));
        const commonEvents = byId(ace.commonEvents, ce => ({ id: ce.id, list: commands(ce.list, notes), name: str(ce.name), switchId: num(ce.switch_id, 1), trigger: num(ce.trigger) }));
        const tilesets = byId(ace.tilesets, t => ({ id: t.id, flags: t.flags ? Array.from(t.flags.data).map(v => v & 0xffff) : new Array(8192).fill(0), mode: num(t.mode, 1), name: str(t.name), note: str(t.note), tilesetNames: list(t.tileset_names).slice(0, 9).map(str).concat(new Array(9).fill('')).slice(0, 9) }));
        return { actors, classes, skills, items, weapons, armors, enemies, troops, states, animations, commonEvents, tilesets };
    }

    // ---- system ----------------------------------------------------------------

    /** System.json from Ace's RPG::System, on MZ's own `base` (the template's) for everything Ace has no field for. */
    function system(base, s, notes) {
        const out = JSON.parse(JSON.stringify(base));
        const t = s.terms || {};
        const fill = (mz, ace) => mz.map((d, i) => (typeof ace[i] === 'string' && ace[i] !== '' ? ace[i] : d));
        const vehicle = (v, d) => (v ? { bgm: audio(v.bgm), characterIndex: num(v.character_index), characterName: str(v.character_name), startMapId: num(v.start_map_id), startX: num(v.start_x), startY: num(v.start_y) } : d);
        Object.assign(out, {
            gameTitle: str(s.game_title), versionId: num(s.version_id, out.versionId), partyMembers: list(s.party_members).map(x => num(x)).filter(Boolean),
            currencyUnit: str(s.currency_unit) || out.currencyUnit,
            elements: list(s.elements).map(str), skillTypes: list(s.skill_types).map(str), weaponTypes: list(s.weapon_types).map(str), armorTypes: list(s.armor_types).map(str),
            switches: list(s.switches).map(x => str(x)), variables: list(s.variables).map(x => str(x)),
            boat: vehicle(s.boat, out.boat), ship: vehicle(s.ship, out.ship), airship: vehicle(s.airship, out.airship),
            title1Name: str(s.title1_name), title2Name: str(s.title2_name), optDrawTitle: !!s.opt_draw_title, optTransparent: !!s.opt_transparent, optFollowers: !!s.opt_followers,
            optSlipDeath: !!s.opt_slip_death, optFloorDeath: !!s.opt_floor_death, optDisplayTp: !!s.opt_display_tp, optExtraExp: !!s.opt_extra_exp,
            windowTone: s.window_tone ? plain(s.window_tone) : out.windowTone,
            titleBgm: audio(s.title_bgm), battleBgm: audio(s.battle_bgm), victoryMe: audio(s.battle_end_me), gameoverMe: audio(s.gameover_me),
            sounds: list(s.sounds).slice(0, 24).map(audio).concat(out.sounds.slice(list(s.sounds).length)),
            testBattlers: list(s.test_battlers).map(b => ({ actorId: num(b.actor_id, 1), equips: list(b.equips).map(x => num(x)), level: num(b.level, 1) })),
            testTroopId: num(s.test_troop_id, 1), startMapId: num(s.start_map_id, 1), startX: num(s.start_x), startY: num(s.start_y), editMapId: num(s.edit_map_id, num(s.start_map_id, 1)),
            battleback1Name: str(s.battleback1_name), battleback2Name: str(s.battleback2_name), battlerName: str(s.battler_name), battlerHue: num(s.battler_hue),
            optSideView: false
        });
        out.terms = {
            basic: fill(out.terms.basic, list(t.basic)),
            commands: out.terms.commands.map((d, i) => (i === 20 || i === 23 ? d : (typeof list(t.commands)[i] === 'string' && list(t.commands)[i] !== '' ? list(t.commands)[i] : d))),
            params: fill(out.terms.params, list(t.params)),
            messages: Object.assign({}, out.terms.messages)
        };
        // Ace stores equipment slot names in terms; MZ has them as a list of its own.
        if (list(t.etypes).length) out.equipTypes = [''].concat(list(t.etypes).map(str));
        // Ace's frame: a 544×416 screen, 32 px tiles, 24 px icons, 96 px faces.
        out.tileSize = 32; out.iconSize = 24; out.faceSize = 96;
        // Its windows: 24 px lines and font, 12 px padding, flush to the screen edge, a 1 px text outline (width 2 here).
        Object.assign(out.advanced, { screenWidth: 544, screenHeight: 416, uiAreaWidth: 544, uiAreaHeight: 416, fontSize: 24, lineHeight: 24, windowPadding: 12, windowMargin: 0, textOutlineWidth: 2, windowOpacity: 192 });
        out.locale = s.japanese ? 'ja_JP' : 'en_US';
        if (s.opt_use_midi) tag(notes, 'midiOption');
        return out;
    }

    /** Ace's Vocab script module, as far as its plain string constants go: MZ message terms. */
    const VOCAB_MESSAGES = {
        ShopBuy: null, ShopSell: null, PartyName: 'party', Emerge: 'emerge', Preemptive: 'preemptive', Surprise: 'surprise', EscapeStart: 'escapeStart', EscapeFailure: 'escapeFailure',
        Victory: 'victory', Defeat: 'defeat', ObtainExp: 'obtainExp', ObtainGold: 'obtainGold', ObtainItem: 'obtainItem', LevelUp: 'levelUp', ObtainSkill: 'obtainSkill',
        UseItem: 'useItem', CriticalToEnemy: 'criticalToEnemy', CriticalToActor: 'criticalToActor', ActorDamage: 'actorDamage', ActorRecovery: 'actorRecovery', ActorGain: 'actorGain',
        ActorLoss: 'actorLoss', ActorDrain: 'actorDrain', ActorNoDamage: 'actorNoDamage', ActorNoHit: 'actorNoHit', EnemyDamage: 'enemyDamage', EnemyRecovery: 'enemyRecovery',
        EnemyGain: 'enemyGain', EnemyLoss: 'enemyLoss', EnemyDrain: 'enemyDrain', EnemyNoDamage: 'enemyNoDamage', EnemyNoHit: 'enemyNoHit', Evasion: 'evasion', MagicEvasion: 'magicEvasion',
        MagicReflection: 'magicReflection', CounterAttack: 'counterAttack', Substitute: 'substitute', BuffAdd: 'buffAdd', DebuffAdd: 'debuffAdd', BuffRemove: 'buffRemove', ActionFailure: 'actionFailure',
        PlayerPosItems: 'possession', ExpTotal: 'expTotal', ExpNext: 'expNext', SaveMessage: 'saveMessage', LoadMessage: 'loadMessage', File: 'file', AutoSave: 'autosave'
    };
    function vocabMessages(source) {
        const out = {};
        for (const m of String(source || '').matchAll(/^\s*([A-Z][A-Za-z]+)\s*=\s*"((?:[^"\\]|\\.)*)"\s*$/gm)) {
            const key = VOCAB_MESSAGES[m[1]];
            if (!key) continue;
            // Ruby's %s placeholders are MZ's %1, %2, … in order.
            let n = 0;
            out[key] = m[2].replace(/\\"/g, '"').replace(/%s/g, () => `%${++n}`);
        }
        return out;
    }

    // ---- maps ------------------------------------------------------------------

    function mapInfos(infos) {
        const out = [null];
        const entries = infos instanceof Map ? Array.from(infos.entries()) : Object.entries(infos || {});
        for (const [id, i] of entries) {
            const n = Number(id);
            out[n] = { id: n, expanded: !!i.expanded, name: str(i.name), order: num(i.order, n), parentId: num(i.parent_id), scrollX: num(i.scroll_x), scrollY: num(i.scroll_y) };
        }
        for (let i = 1; i < out.length; i++) if (out[i] === undefined) out[i] = null;
        return out;
    }

    function map(m, notes) {
        const w = num(m.width), h = num(m.height), t = m.data;
        const data = new Array(w * h * 6).fill(0);
        if (t) {
            for (let z = 0; z < 3; z++) for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) data[(z * h + y) * w + x] = t.data[x + y * t.xsize + z * t.xsize * t.ysize] & 0xffff;
            if (t.zsize > 3) for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
                const v = t.data[x + y * t.xsize + 3 * t.xsize * t.ysize] & 0xffff;
                data[(4 * h + y) * w + x] = v & 0x0f;          // shadow
                data[(5 * h + y) * w + x] = (v >> 8) & 0xff;   // region
            }
        }
        const events = [null];
        const entries = m.events instanceof Map ? Array.from(m.events.values()) : Object.values(m.events || {});
        for (const e of entries) {
            if (!e || !e.id) continue;
            events[e.id] = {
                id: e.id, name: str(e.name), note: '', x: num(e.x), y: num(e.y),
                pages: list(e.pages).map(pg => {
                    const c = pg.condition || {}, g = pg.graphic || {};
                    return {
                        conditions: { actorId: num(c.actor_id, 1), actorValid: !!c.actor_valid, itemId: num(c.item_id, 1), itemValid: !!c.item_valid, selfSwitchCh: str(c.self_switch_ch) || 'A', selfSwitchValid: !!c.self_switch_valid, switch1Id: num(c.switch1_id, 1), switch1Valid: !!c.switch1_valid, switch2Id: num(c.switch2_id, 1), switch2Valid: !!c.switch2_valid, variableId: num(c.variable_id, 1), variableValid: !!c.variable_valid, variableValue: num(c.variable_value) },
                        directionFix: !!pg.direction_fix,
                        image: { characterIndex: num(g.character_index), characterName: str(g.character_name), direction: num(g.direction, 2), pattern: num(g.pattern), tileId: num(g.tile_id) },
                        list: commands(pg.list, notes),
                        moveFrequency: num(pg.move_frequency, 3), moveRoute: pg.move_route ? moveRoute(pg.move_route, notes) : { list: [{ code: 0, parameters: [] }], repeat: true, skippable: false, wait: false },
                        moveSpeed: num(pg.move_speed, 3), moveType: num(pg.move_type), priorityType: num(pg.priority_type, 1), stepAnime: !!pg.step_anime, through: !!pg.through, trigger: num(pg.trigger), walkAnime: pg.walk_anime !== false
                    };
                })
            };
        }
        for (let i = 1; i < events.length; i++) if (events[i] === undefined) events[i] = null;
        return {
            autoplayBgm: !!m.autoplay_bgm, autoplayBgs: !!m.autoplay_bgs, battleback1Name: str(m.battleback1_name), battleback2Name: str(m.battleback2_name), bgm: audio(m.bgm), bgs: audio(m.bgs),
            disableDashing: !!m.disable_dashing, displayName: str(m.display_name),
            encounterList: list(m.encounter_list).map(e => ({ regionSet: list(e.region_set).map(x => num(x)), troopId: num(e.troop_id, 1), weight: num(e.weight, 10) })),
            encounterStep: num(m.encounter_step, 30), height: h, note: str(m.note), parallaxLoopX: !!m.parallax_loop_x, parallaxLoopY: !!m.parallax_loop_y, parallaxName: str(m.parallax_name),
            parallaxShow: !!m.parallax_show, parallaxSx: num(m.parallax_sx), parallaxSy: num(m.parallax_sy), scrollType: num(m.scroll_type), specifyBattleback: !!m.specify_battleback,
            tilesetId: num(m.tileset_id, 1), width: w, data, events
        };
    }


    // ---- the window skin -------------------------------------------------------

    /**
     * An Ace Window.png (128×128) laid into an MZ one (192×192). Ace:
     * background (0,0) 64×64 and its pattern (0,64), frame (64,0) 64×64 with
     * 16 px corners and the scroll arrows in its middle, cursor (64,64) 32×32,
     * pause sign (96,64) as four 16 px frames, 32 text colours at (64,96) in
     * 8 px cells. The frame keeps its 16 px thickness inside MZ's 24 px corners;
     * background and cursor scale up, which MZ stretches over the window anyway.
     */
    function windowSkin(skin, base) {
        const K = root.RRLegacyConvert || (typeof require === 'function' ? require('./LegacyConvert.js') : null);
        const { blank, blit, scaleNearest } = K;
        const out = base ? { width: base.width, height: base.height, data: new Uint8Array(base.data) } : blank(192, 192);
        if (!skin || skin.width < 128 || skin.height < 128) return out;
        const region = (sx, sy, w, h) => { const r = blank(w, h); blit(r, skin, sx, sy, w, h, 0, 0); return r; };
        const clear = (x, y, w, h) => { for (let yy = y; yy < y + h; yy++) out.data.fill(0, (yy * out.width + x) * 4, (yy * out.width + x + w) * 4); };
        const stretch = (src, dw, dh) => { const d = blank(dw, dh); for (let y = 0; y < dh; y++) for (let x = 0; x < dw; x++) { const si = (Math.floor(y * src.height / dh) * src.width + Math.floor(x * src.width / dw)) * 4, di = (y * dw + x) * 4; for (let k = 0; k < 4; k++) d.data[di + k] = src.data[si + k]; } return d; };
        blit(out, scaleNearest(region(0, 0, 64, 64), 1.5), 0, 0, 96, 96, 0, 0);
        blit(out, scaleNearest(region(0, 64, 64, 64), 1.5), 0, 0, 96, 96, 0, 96);
        clear(96, 0, 96, 96);
        const F = (x, y, w, h) => region(64 + x, y, w, h);
        blit(out, F(0, 0, 16, 16), 0, 0, 16, 16, 96, 0); blit(out, F(48, 0, 16, 16), 0, 0, 16, 16, 176, 0);
        blit(out, F(0, 48, 16, 16), 0, 0, 16, 16, 96, 80); blit(out, F(48, 48, 16, 16), 0, 0, 16, 16, 176, 80);
        blit(out, stretch(F(16, 0, 32, 16), 80, 16), 0, 0, 80, 16, 104, 0); blit(out, stretch(F(16, 48, 32, 16), 80, 16), 0, 0, 80, 16, 104, 80);
        blit(out, stretch(F(0, 16, 16, 32), 16, 80), 0, 0, 16, 80, 96, 8); blit(out, stretch(F(48, 16, 16, 32), 16, 80), 0, 0, 16, 80, 176, 8);
        // The scroll arrows sit in the frame cell's middle in both engines: Ace's 16×8, centred in MZ's 24×12 slots.
        blit(out, F(24, 16, 16, 8), 0, 0, 16, 8, 136, 26); blit(out, F(24, 40, 16, 8), 0, 0, 16, 8, 136, 62);
        clear(96, 96, 96, 48);
        blit(out, scaleNearest(region(64, 64, 32, 32), 1.5), 0, 0, 48, 48, 96, 96);
        for (let i = 0; i < 4; i++) blit(out, region(96 + (i % 2) * 16, 64 + Math.floor(i / 2) * 16, 16, 16), 0, 0, 16, 16, 144 + (i % 2) * 24 + 4, 96 + Math.floor(i / 2) * 24 + 4);
        for (let i = 0; i < 32; i++) {
            const sx = 64 + (i % 8) * 8 + 4, sy = 96 + Math.floor(i / 8) * 8 + 4, si = (sy * skin.width + sx) * 4;
            const dx = 96 + (i % 8) * 12, dy = 144 + Math.floor(i / 8) * 12;
            for (let y = 0; y < 12; y++) for (let x = 0; x < 12; x++) { const di = ((dy + y) * out.width + dx + x) * 4; for (let k = 0; k < 4; k++) out.data[di + k] = skin.data[si + k]; }
        }
        return out;
    }

    // ---- audio aliases ---------------------------------------------------------

    /**
     * Games that override Game_System#bgm_play (bgs_play, me_play) with a
     * `case bgm.name / when "Name" … name = "Folder/file"` table play another
     * file than the one their events name. Read those tables so the imported
     * data names the real file: { bgm: Map(lower-case name → { name, volume }) }.
     * `volume` is a percentage of the event's; a table on RGSS's 0–1000 scale
     * (anything above 100) is read as tenths. `from` is the folder the file is
     * in (an ME table may play a BGM file); the importer copies it across.
     */
    function audioAliases(scriptTexts) {
        const out = { bgm: new Map(), bgs: new Map(), me: new Map() };
        for (const text of scriptTexts || []) {
            for (const def of String(text).matchAll(/^([ \t]*)def[ \t]+(bgm|bgs|me)_play\b[^\n]*\n([\s\S]*?)^\1end\b/gm)) {
                const kind = def[2], body = def[3];
                const whens = Array.from(body.matchAll(/^[ \t]*when[ \t]+((?:"[^"\n]*"[ \t]*,?[ \t]*)+)$/gm));
                whens.forEach((w, i) => {
                    const block = body.slice(w.index + w[0].length, i + 1 < whens.length ? whens[i + 1].index : body.length).split(/^[ \t]*(?:else|end)\b/m)[0];
                    // The file: a `name = "…"` the method plays later, or the first play call's path.
                    const named = /^[ \t]*name[ \t]*=[ \t]*"([^"\n]+)"/m.exec(block);
                    const called = /(?:Audio|\$game_audio)\.(bgm|bgs|me|se)_play\(\s*"([^"\n]+)"/.exec(block);
                    const raw = named ? named[1] : called ? called[2] : null;
                    if (!raw) return;
                    const vol = /^[ \t]*vol[ \t]*=[ \t]*(\d+)/m.exec(block);
                    let volume = vol ? Number(vol[1]) : 100;
                    if (volume > 100) volume = volume / 10;
                    // Which folder the file is in: the path's own Audio/<folder>/, else the playing call's kind.
                    const folder = /^Audio\/(BGM|BGS|ME|SE)\//i.exec(raw);
                    const from = folder ? folder[1].toLowerCase() : !named && called ? called[1] : kind;
                    const file = raw.replace(/^Audio\/(BGM|BGS|ME|SE)\//i, '').replace(/\.(ogg|mp3|wav|mid|midi|m4a|flac)$/i, '');
                    for (const key of w[1].matchAll(/"([^"\n]*)"/g)) out[kind].set(key[1].toLowerCase(), { name: file, volume: Math.min(100, volume), from });
                });
            }
        }
        return out;
    }

    /** Rewrite the audio an MZ record names through audioAliases' tables, in place. Returns how many changed. */
    function applyAudioAliases(value, aliases) {
        let changed = 0;
        const fix = (audioObj, kind) => {
            const hit = audioObj && typeof audioObj.name === 'string' && aliases[kind] && aliases[kind].get(audioObj.name.toLowerCase());
            if (!hit) return;
            audioObj.name = hit.name;
            audioObj.volume = Math.round((Number(audioObj.volume) || 100) * hit.volume / 100);
            changed++;
        };
        const CODES = { 241: 'bgm', 132: 'bgm', 245: 'bgs', 249: 'me', 133: 'me' };
        const walk = (v) => {
            if (Array.isArray(v)) { for (const x of v) walk(x); return; }
            if (!v || typeof v !== 'object') return;
            if (typeof v.code === 'number' && CODES[v.code] && Array.isArray(v.parameters)) fix(v.parameters[0], CODES[v.code]);
            for (const [k, x] of Object.entries(v)) {
                if (k === 'bgm' || k === 'titleBgm' || k === 'battleBgm') fix(x, 'bgm');
                else if (k === 'bgs') fix(x, 'bgs');
                else if (k === 'victoryMe' || k === 'gameoverMe' || k === 'defeatMe') fix(x, 'me');
                if (x && typeof x === 'object') walk(x);
            }
        };
        walk(value);
        return changed;
    }

    /** Script constants (from scriptConstants) that Ruby translation resolves while converting. */
    const setContext = (context) => { activeContext = context || {}; };

    const api = { audioAliases, applyAudioAliases, plain, audio, ruby, rubyProgram, parseCall, scriptFamilies, FAMILIES, scriptConstants, fontDefaults, screenSize, gdsParallaxLayers, rgssFontScale, setContext, windowSkin, commands, database, system, vocabMessages, mapInfos, map, BUTTONS };
    root.RRRgssConvert = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
