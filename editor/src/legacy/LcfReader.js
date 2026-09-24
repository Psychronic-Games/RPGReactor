/**
 * LcfReader - reads RPG Maker 2000/2003 project data (the LCF files) into
 * plain objects, the first stage of importing such a project into Reactor.
 *
 * The format: every file opens with a length-prefixed type name
 * ("LcfDataBase", "LcfMapTree", "LcfMapUnit"), then chunks. A chunk is a
 * BER-encoded id, a BER-encoded byte length and the bytes; id 0 ends a
 * struct. Integers inside chunks are BER (7 bits per byte, big-endian,
 * high bit means "more"); strings are length-prefixed bytes in the game's
 * code page; arrays of records are a BER count then, per record, its BER
 * id and its chunks. A few chunks are raw little-endian arrays (map
 * layers, actor parameter curves). Event commands are a packed list:
 * code, indent, string, parameter count, parameters, all BER.
 *
 * Chunk ids follow the documented format (the same tables EasyRPG's
 * liblcf uses). Unknown chunks are kept as `_unknown[id] = length` so a
 * report can say what a file carried that this reader did not name.
 *
 * Pure: no filesystem. `readProject` takes the file bytes it needs through
 * a `files` callback, so the same code runs in the editor and from a CLI.
 */
(function (root) {
    'use strict';

    // ---- primitives ------------------------------------------------------

    /** BER varint at `pos`; returns [value (uint32), nextPos]. */
    function ber(bytes, pos) {
        let value = 0;
        for (;;) {
            const b = bytes[pos++];
            if (b === undefined) throw new Error('LCF: unexpected end of data');
            value = (value * 128) + (b & 0x7f);
            if (!(b & 0x80)) return [value >>> 0, pos];
        }
    }

    /** BER value read as a signed 32-bit integer (the writer stores two's complement). */
    function berInt(bytes, pos) {
        const [v, next] = ber(bytes, pos);
        return [v | 0, next];
    }

    function makeDecoder(encoding) {
        const name = normalizeEncoding(encoding);
        if (typeof TextDecoder === 'undefined') return { name, decode: b => String.fromCharCode(...b) };
        try {
            const decoder = new TextDecoder(name);
            return { name, decode: b => decoder.decode(b) };
        } catch (_) {
            const latin = new TextDecoder('latin1');
            return { name: 'latin1', decode: b => latin.decode(b) };
        }
    }

    function normalizeEncoding(encoding) {
        const e = String(encoding || '').toLowerCase().replace(/[\s_-]/g, '');
        if (!e || e === 'auto') return 'windows-1252';
        if (e === '932' || e === 'cp932' || e === 'shiftjis' || e === 'sjis' || e === 'ms932') return 'shift_jis';
        if (e === '1252' || e === 'cp1252' || e === 'windows1252' || e === 'latin1' || e === 'iso88591') return 'windows-1252';
        if (e === '949' || e === 'cp949' || e === 'euckr') return 'euc-kr';
        if (e === '936' || e === 'cp936' || e === 'gbk' || e === 'gb2312') return 'gbk';
        if (e === '950' || e === 'cp950' || e === 'big5') return 'big5';
        if (e === '1251' || e === 'cp1251' || e === 'windows1251') return 'windows-1251';
        if (e === '1250' || e === 'cp1250' || e === 'windows1250') return 'windows-1250';
        if (e === 'utf8') return 'utf-8';
        return encoding;
    }

    /**
     * Guess the code page from the text a database carries. Japanese games
     * are Shift_JIS; Western ones Windows-1252. Decode both ways and prefer
     * the one that produces no replacement characters and, for a tie, the
     * one whose text is mostly ASCII plus Latin-1 letters.
     */
    function detectEncoding(samples) {
        if (typeof TextDecoder === 'undefined') return 'windows-1252';
        const bytes = concat(samples.filter(s => s && s.length));
        if (!bytes.some(b => b >= 0x80)) return 'windows-1252';
        const score = (name) => {
            let text;
            try { text = new TextDecoder(name, { fatal: false }).decode(bytes); } catch (_) { return -Infinity; }
            let bad = 0, kana = 0, latin = 0;
            for (const ch of text) {
                const c = ch.charCodeAt(0);
                if (c === 0xfffd) bad++;
                else if ((c >= 0x3040 && c <= 0x30ff) || (c >= 0x4e00 && c <= 0x9fff)) kana++;
                else if (c >= 0xc0 && c <= 0x17f) latin++;
            }
            return { bad, kana, latin };
        };
        const sjis = score('shift_jis'), west = score('windows-1252');
        if (sjis === -Infinity) return 'windows-1252';
        if (sjis.bad < west.bad) return 'shift_jis';
        if (west.bad < sjis.bad) return 'windows-1252';
        // Both decode cleanly: kana wins for Japanese, otherwise Latin letters.
        return sjis.kana > 0 && sjis.kana >= west.latin ? 'shift_jis' : 'windows-1252';
    }

    function concat(parts) {
        const total = parts.reduce((n, p) => n + p.length, 0);
        const out = new Uint8Array(total);
        let at = 0;
        for (const p of parts) { out.set(p, at); at += p.length; }
        return out;
    }

    function header(bytes) {
        const [len, pos] = ber(bytes, 0);
        const name = String.fromCharCode(...bytes.subarray(pos, pos + len));
        return { name, pos: pos + len };
    }

    /** Iterate chunks from `pos` to `end`; stops at id 0 or `end`. Yields {id, start, length}. */
    function* chunks(bytes, pos, end) {
        while (pos < end) {
            let id, length;
            [id, pos] = ber(bytes, pos);
            if (id === 0) return;
            [length, pos] = ber(bytes, pos);
            yield { id, start: pos, length, end: pos + length };
            pos += length;
        }
    }

    // ---- schema-driven decoding -----------------------------------------

    const readers = {
        int: (ctx, b, s, e) => (e > s ? berInt(b, s)[0] : 0),
        bool: (ctx, b, s, e) => (e > s ? berInt(b, s)[0] !== 0 : false),
        str: (ctx, b, s, e) => ctx.decode(b.subarray(s, e)),
        raw: (ctx, b, s, e) => b.slice(s, e),
        'u8[]': (ctx, b, s, e) => Array.from(b.subarray(s, e)),
        'bool[]': (ctx, b, s, e) => Array.from(b.subarray(s, e), v => v !== 0),
        'u16[]': (ctx, b, s, e) => { const out = []; for (let p = s; p + 1 < e; p += 2) out.push(b[p] | (b[p + 1] << 8)); return out; },
        'i16[]': (ctx, b, s, e) => { const out = []; for (let p = s; p + 1 < e; p += 2) { const v = b[p] | (b[p + 1] << 8); out.push(v >= 0x8000 ? v - 0x10000 : v); } return out; },
        'i32[]': (ctx, b, s, e) => { const out = []; for (let p = s; p + 3 < e; p += 4) out.push((b[p] | (b[p + 1] << 8) | (b[p + 2] << 16) | (b[p + 3] << 24)) | 0); return out; },
        'ber[]': (ctx, b, s, e) => { const out = []; let p = s; while (p < e) { let v; [v, p] = berInt(b, p); out.push(v); } return out; },
        commands: (ctx, b, s, e) => readCommands(ctx, b, s, e),
        moves: (ctx, b, s, e) => readMoveCommands(ctx, b, s, e)
    };

    function readStruct(ctx, schema, bytes, start, end) {
        const out = {};
        for (const c of chunks(bytes, start, end)) {
            const field = schema[c.id];
            if (!field) { (out._unknown || (out._unknown = {}))[c.id] = c.length; continue; }
            const [name, type] = field;
            if (type.startsWith('struct:')) out[name] = readStruct(ctx, SCHEMAS[type.slice(7)], bytes, c.start, c.end);
            else if (type.startsWith('array:')) out[name] = readArray(ctx, SCHEMAS[type.slice(6)], bytes, c.start, c.end);
            else out[name] = readers[type](ctx, bytes, c.start, c.end);
        }
        return out;
    }

    /** A record array: BER count, then per record its BER id and chunks. Returns a sparse array by id. */
    function readArray(ctx, schema, bytes, start, end) {
        let [count, pos] = ber(bytes, start);
        const out = [];
        for (let i = 0; i < count; i++) {
            let id;
            [id, pos] = ber(bytes, pos);
            const record = { id };
            const body = readStructAt(ctx, schema, bytes, pos, end);
            Object.assign(record, body.value);
            pos = body.next;
            out[id] = record;
        }
        return out;
    }

    /** Like readStruct but reports where the terminating 0 left the cursor. */
    function readStructAt(ctx, schema, bytes, pos, end) {
        const value = {};
        while (pos < end) {
            let id, length;
            [id, pos] = ber(bytes, pos);
            if (id === 0) break;
            [length, pos] = ber(bytes, pos);
            const field = schema[id];
            if (!field) (value._unknown || (value._unknown = {}))[id] = length;
            else {
                const [name, type] = field;
                if (type.startsWith('struct:')) value[name] = readStruct(ctx, SCHEMAS[type.slice(7)], bytes, pos, pos + length);
                else if (type.startsWith('array:')) value[name] = readArray(ctx, SCHEMAS[type.slice(6)], bytes, pos, pos + length);
                else value[name] = readers[type](ctx, bytes, pos, pos + length);
            }
            pos += length;
        }
        return { value, next: pos };
    }

    function readCommands(ctx, bytes, start, end) {
        const out = [];
        let pos = start;
        while (pos < end) {
            let code, indent, len, count;
            [code, pos] = ber(bytes, pos);
            [indent, pos] = ber(bytes, pos);
            [len, pos] = ber(bytes, pos);
            const string = ctx.decode(bytes.subarray(pos, pos + len));
            pos += len;
            [count, pos] = ber(bytes, pos);
            const parameters = [];
            for (let i = 0; i < count; i++) { let v; [v, pos] = berInt(bytes, pos); parameters.push(v); }
            out.push({ code, indent, string, parameters });
        }
        return out;
    }

    /**
     * A move route: one BER code per step; Switch On/Off (32, 33) carry a
     * switch id, Change Graphic (34) a name and an index, Play Sound (35) a
     * name, volume, tempo and balance.
     */
    function readMoveCommands(ctx, bytes, start, end) {
        const out = [];
        let pos = start;
        while (pos < end) {
            let code;
            [code, pos] = ber(bytes, pos);
            const move = { code };
            if (code === 32 || code === 33) [move.parameter_a, pos] = berInt(bytes, pos);
            else if (code === 34 || code === 35) {
                let len;
                [len, pos] = ber(bytes, pos);
                move.parameter_string = ctx.decode(bytes.subarray(pos, pos + len));
                pos += len;
                [move.parameter_a, pos] = berInt(bytes, pos);
                if (code === 35) { [move.parameter_b, pos] = berInt(bytes, pos); [move.parameter_c, pos] = berInt(bytes, pos); }
            }
            out.push(move);
        }
        return out;
    }

    // ---- schemas (chunk id -> [field, type]) ----------------------------

    const SCHEMAS = {
        Sound: { 1: ['name', 'str'], 3: ['volume', 'int'], 4: ['tempo', 'int'], 5: ['balance', 'int'] },
        Music: { 1: ['name', 'str'], 2: ['fadein', 'int'], 3: ['volume', 'int'], 4: ['tempo', 'int'], 5: ['balance', 'int'] },
        Learning: { 1: ['level', 'int'], 2: ['skill_id', 'int'] },
        Actor: {
            1: ['name', 'str'], 2: ['title', 'str'], 3: ['character_name', 'str'], 4: ['character_index', 'int'], 5: ['transparent', 'bool'],
            7: ['initial_level', 'int'], 8: ['final_level', 'int'], 9: ['critical_hit', 'bool'], 10: ['critical_hit_chance', 'int'],
            15: ['face_name', 'str'], 16: ['face_index', 'int'], 21: ['two_weapon', 'bool'], 22: ['lock_equipment', 'bool'],
            23: ['auto_battle', 'bool'], 24: ['super_guard', 'bool'], 31: ['parameters', 'i16[]'], 41: ['exp_base', 'int'],
            42: ['exp_inflation', 'int'], 43: ['exp_correction', 'int'], 51: ['initial_equipment', 'i16[]'], 56: ['unarmed_animation', 'int'],
            57: ['class_id', 'int'], 59: ['battle_x', 'int'], 60: ['battle_y', 'int'], 62: ['battler_animation', 'int'],
            63: ['skills', 'array:Learning'], 64: ['rename_skill', 'bool'], 65: ['skill_name', 'str'],
            71: ['state_ranks_size', 'int'], 72: ['state_ranks', 'u8[]'], 73: ['attribute_ranks_size', 'int'], 74: ['attribute_ranks', 'u8[]'],
            80: ['battle_commands', 'i32[]']
        },
        Class: {
            1: ['name', 'str'], 21: ['two_weapon', 'bool'], 22: ['lock_equipment', 'bool'], 23: ['auto_battle', 'bool'], 24: ['super_guard', 'bool'],
            31: ['parameters', 'i16[]'], 41: ['exp_base', 'int'], 42: ['exp_inflation', 'int'], 43: ['exp_correction', 'int'],
            56: ['unarmed_animation', 'int'], 62: ['battler_animation', 'int'], 63: ['skills', 'array:Learning'],
            71: ['state_ranks_size', 'int'], 72: ['state_ranks', 'u8[]'], 73: ['attribute_ranks_size', 'int'], 74: ['attribute_ranks', 'u8[]'],
            80: ['battle_commands', 'i32[]']
        },
        Skill: {
            1: ['name', 'str'], 2: ['description', 'str'], 3: ['using_message1', 'str'], 4: ['using_message2', 'str'], 7: ['failure_message', 'int'],
            8: ['type', 'int'], 9: ['sp_type', 'int'], 10: ['sp_percent', 'int'], 11: ['sp_cost', 'int'], 12: ['scope', 'int'],
            13: ['switch_id', 'int'], 14: ['animation_id', 'int'], 16: ['sound_effect', 'struct:Sound'], 18: ['occasion_field', 'bool'],
            19: ['occasion_battle', 'bool'], 20: ['reverse_state_effect', 'bool'], 21: ['physical_rate', 'int'], 22: ['magical_rate', 'int'],
            23: ['variance', 'int'], 24: ['power', 'int'], 25: ['hit', 'int'], 31: ['affect_hp', 'bool'], 32: ['affect_sp', 'bool'],
            33: ['affect_attack', 'bool'], 34: ['affect_defense', 'bool'], 35: ['affect_spirit', 'bool'], 36: ['affect_agility', 'bool'],
            37: ['absorb_damage', 'bool'], 38: ['ignore_defense', 'bool'], 41: ['state_effects_size', 'int'], 42: ['state_effects', 'bool[]'],
            43: ['attribute_effects_size', 'int'], 44: ['attribute_effects', 'bool[]'], 45: ['affect_attr_defence', 'bool'],
            49: ['battler_animation', 'int'], 50: ['battler_animation_data', 'raw']
        },
        Item: {
            1: ['name', 'str'], 2: ['description', 'str'], 3: ['type', 'int'], 5: ['price', 'int'], 6: ['uses', 'int'],
            11: ['atk_points1', 'int'], 12: ['def_points1', 'int'], 13: ['spi_points1', 'int'], 14: ['agi_points1', 'int'],
            15: ['two_handed', 'bool'], 16: ['sp_cost', 'int'], 17: ['hit', 'int'], 18: ['critical_hit', 'int'], 20: ['animation_id', 'int'],
            21: ['preemptive', 'bool'], 22: ['dual_attack', 'bool'], 23: ['attack_all', 'bool'], 24: ['ignore_evasion', 'bool'],
            25: ['prevent_critical', 'bool'], 26: ['raise_evasion', 'bool'], 27: ['half_sp_cost', 'bool'], 28: ['no_terrain_damage', 'bool'],
            29: ['cursed', 'bool'], 31: ['entire_party', 'bool'], 32: ['recover_hp_rate', 'int'], 33: ['recover_hp', 'int'],
            34: ['recover_sp_rate', 'int'], 35: ['recover_sp', 'int'], 37: ['occasion_field1', 'bool'], 38: ['ko_only', 'bool'],
            41: ['max_hp_points', 'int'], 42: ['max_sp_points', 'int'], 43: ['atk_points2', 'int'], 44: ['def_points2', 'int'],
            45: ['spi_points2', 'int'], 46: ['agi_points2', 'int'], 47: ['using_message', 'int'], 51: ['skill_id', 'int'],
            52: ['switch_id', 'int'], 53: ['occasion_field2', 'bool'], 54: ['occasion_battle', 'bool'],
            61: ['actor_set_size', 'int'], 62: ['actor_set', 'bool[]'], 63: ['state_set_size', 'int'], 64: ['state_set', 'bool[]'],
            65: ['attribute_set_size', 'int'], 66: ['attribute_set', 'bool[]'], 67: ['state_chance', 'int'], 69: ['state_effect', 'bool'],
            70: ['weapon_animation', 'int'], 72: ['use_skill', 'bool'], 73: ['class_set_size', 'int'], 74: ['class_set', 'bool[]'],
            75: ['ranged_trajectory', 'int'], 76: ['ranged_target', 'int']
        },
        EnemyAction: {
            1: ['kind', 'int'], 2: ['basic', 'int'], 3: ['skill_id', 'int'], 4: ['enemy_id', 'int'], 5: ['condition_type', 'int'],
            6: ['condition_param1', 'int'], 7: ['condition_param2', 'int'], 8: ['switch_id', 'int'], 9: ['switch_on', 'bool'],
            10: ['switch_on_id', 'int'], 11: ['switch_off', 'bool'], 12: ['switch_off_id', 'int'], 13: ['rating', 'int']
        },
        Enemy: {
            1: ['name', 'str'], 2: ['battler_name', 'str'], 3: ['battler_hue', 'int'], 4: ['max_hp', 'int'], 5: ['max_sp', 'int'],
            6: ['attack', 'int'], 7: ['defense', 'int'], 8: ['spirit', 'int'], 9: ['agility', 'int'], 10: ['transparent', 'bool'],
            11: ['exp', 'int'], 12: ['gold', 'int'], 13: ['drop_id', 'int'], 14: ['drop_prob', 'int'], 21: ['critical_hit', 'bool'],
            22: ['critical_hit_chance', 'int'], 26: ['miss', 'bool'], 28: ['levitate', 'bool'],
            31: ['state_ranks_size', 'int'], 32: ['state_ranks', 'u8[]'], 33: ['attribute_ranks_size', 'int'], 34: ['attribute_ranks', 'u8[]'],
            42: ['actions', 'array:EnemyAction']
        },
        TroopMember: { 1: ['enemy_id', 'int'], 2: ['x', 'int'], 3: ['y', 'int'], 4: ['invisible', 'bool'] },
        TroopPageCondition: {
            1: ['flags', 'int'], 2: ['switch_a_id', 'int'], 3: ['switch_b_id', 'int'], 4: ['variable_id', 'int'], 5: ['variable_value', 'int'],
            6: ['turn_a', 'int'], 7: ['turn_b', 'int'], 8: ['fatigue_min', 'int'], 9: ['fatigue_max', 'int'], 10: ['enemy_id', 'int'],
            11: ['enemy_hp_min', 'int'], 12: ['enemy_hp_max', 'int'], 13: ['actor_id', 'int'], 14: ['actor_hp_min', 'int'], 15: ['actor_hp_max', 'int'],
            16: ['turn_enemy_id', 'int'], 17: ['turn_enemy_a', 'int'], 18: ['turn_enemy_b', 'int'], 19: ['turn_actor_id', 'int'],
            20: ['turn_actor_a', 'int'], 21: ['turn_actor_b', 'int'], 22: ['command_actor_id', 'int'], 23: ['command_id', 'int']
        },
        TroopPage: { 2: ['condition', 'struct:TroopPageCondition'], 11: ['event_commands_size', 'int'], 12: ['event_commands', 'commands'] },
        Troop: {
            1: ['name', 'str'], 2: ['members', 'array:TroopMember'], 3: ['auto_alignment', 'bool'], 4: ['terrain_set_size', 'int'],
            5: ['terrain_set', 'bool[]'], 6: ['appear_randomly', 'bool'], 11: ['pages', 'array:TroopPage']
        },
        Terrain: {
            1: ['name', 'str'], 2: ['damage', 'int'], 3: ['encounter_rate', 'int'], 4: ['background_name', 'str'], 5: ['boat_pass', 'bool'],
            6: ['ship_pass', 'bool'], 7: ['airship_pass', 'bool'], 9: ['airship_land', 'bool'], 11: ['bush_depth', 'int'],
            15: ['footstep', 'struct:Sound'], 16: ['on_damage_se', 'bool'], 17: ['background_type', 'int'], 18: ['background_a_name', 'str'],
            19: ['background_a_scrollh', 'bool'], 20: ['background_a_scrollv', 'bool'], 21: ['background_a_scrollh_speed', 'int'],
            22: ['background_a_scrollv_speed', 'int'], 23: ['background_b', 'bool'], 24: ['background_b_name', 'str'],
            25: ['background_b_scrollh', 'bool'], 26: ['background_b_scrollv', 'bool'], 27: ['background_b_scrollh_speed', 'int'],
            28: ['background_b_scrollv_speed', 'int'], 40: ['special_flags', 'int'], 41: ['special_back_party', 'int'],
            42: ['special_back_enemies', 'int'], 43: ['special_lateral_party', 'int'], 44: ['special_lateral_enemies', 'int'],
            45: ['grid_location', 'int'], 46: ['grid_a', 'int'], 47: ['grid_b', 'int'], 48: ['grid_c', 'int']
        },
        Attribute: { 1: ['name', 'str'], 2: ['type', 'int'], 11: ['a_rate', 'int'], 12: ['b_rate', 'int'], 13: ['c_rate', 'int'], 14: ['d_rate', 'int'], 15: ['e_rate', 'int'] },
        State: {
            1: ['name', 'str'], 2: ['type', 'int'], 3: ['color', 'int'], 4: ['priority', 'int'], 5: ['restriction', 'int'],
            11: ['a_rate', 'int'], 12: ['b_rate', 'int'], 13: ['c_rate', 'int'], 14: ['d_rate', 'int'], 15: ['e_rate', 'int'],
            21: ['hold_turn', 'int'], 22: ['auto_release_prob', 'int'], 23: ['release_by_damage', 'int'], 24: ['affect_type', 'int'],
            31: ['affect_attack', 'bool'], 32: ['affect_defense', 'bool'], 33: ['affect_spirit', 'bool'], 34: ['affect_agility', 'bool'],
            35: ['reduce_hit_ratio', 'int'], 36: ['avoid_attacks', 'bool'], 37: ['reflect_magic', 'bool'], 38: ['cursed', 'bool'],
            39: ['battler_animation_id', 'int'], 41: ['restrict_skill', 'bool'], 42: ['restrict_skill_level', 'int'],
            43: ['restrict_magic', 'bool'], 44: ['restrict_magic_level', 'int'], 45: ['hp_change_type', 'int'], 46: ['sp_change_type', 'int'],
            51: ['message_actor', 'str'], 52: ['message_enemy', 'str'], 53: ['message_already', 'str'], 54: ['message_affected', 'str'],
            55: ['message_recovery', 'str'], 61: ['hp_change_max', 'int'], 62: ['hp_change_val', 'int'], 63: ['hp_change_map_steps', 'int'],
            64: ['hp_change_map_val', 'int'], 65: ['sp_change_max', 'int'], 66: ['sp_change_val', 'int'], 67: ['sp_change_map_steps', 'int'],
            68: ['sp_change_map_val', 'int']
        },
        AnimationTiming: { 1: ['frame', 'int'], 2: ['se', 'struct:Sound'], 3: ['flash_scope', 'int'], 4: ['flash_red', 'int'], 5: ['flash_green', 'int'], 6: ['flash_blue', 'int'], 7: ['flash_power', 'int'], 8: ['screen_shake', 'int'] },
        AnimationCellData: { 1: ['valid', 'bool'], 2: ['cell_id', 'int'], 3: ['x', 'int'], 4: ['y', 'int'], 5: ['zoom', 'int'], 6: ['tone_red', 'int'], 7: ['tone_green', 'int'], 8: ['tone_blue', 'int'], 9: ['tone_gray', 'int'], 10: ['transparency', 'int'] },
        AnimationFrame: { 1: ['cells', 'array:AnimationCellData'] },
        Animation: { 1: ['name', 'str'], 2: ['animation_name', 'str'], 3: ['large', 'bool'], 6: ['timings', 'array:AnimationTiming'], 9: ['scope', 'int'], 10: ['position', 'int'], 12: ['frames', 'array:AnimationFrame'] },
        Chipset: { 1: ['name', 'str'], 2: ['chipset_name', 'str'], 3: ['terrain_data', 'i16[]'], 4: ['passable_data_lower', 'u8[]'], 5: ['passable_data_upper', 'u8[]'], 11: ['animation_type', 'int'], 12: ['animation_speed', 'int'] },
        CommonEvent: { 1: ['name', 'str'], 11: ['trigger', 'int'], 12: ['switch_flag', 'bool'], 13: ['switch_id', 'int'], 21: ['event_commands_size', 'int'], 22: ['event_commands', 'commands'] },
        Named: { 1: ['name', 'str'] },
        BattleCommand: { 1: ['name', 'str'], 2: ['type', 'int'] },
        BattleCommands: { 1: ['placement', 'int'], 4: ['death_handler1', 'int'], 6: ['row', 'int'], 7: ['battle_type', 'int'], 9: ['unused_display_normal_parameters', 'bool'], 10: ['commands', 'array:BattleCommand'], 15: ['death_handler2', 'int'], 20: ['death_event', 'int'], 24: ['window_size', 'int'], 25: ['transparency', 'int'], 26: ['death_teleport', 'bool'], 27: ['death_teleport_id', 'int'], 28: ['death_teleport_x', 'int'], 29: ['death_teleport_y', 'int'], 30: ['death_teleport_face', 'int'] },
        BattlerAnimationPose: { 1: ['name', 'str'], 2: ['battler_name', 'str'], 3: ['battler_index', 'int'], 4: ['animation_type', 'int'], 5: ['battle_animation_id', 'int'] },
        BattlerAnimationWeapon: { 1: ['name', 'str'], 2: ['weapon_name', 'str'], 3: ['weapon_index', 'int'] },
        BattlerAnimation: { 1: ['name', 'str'], 2: ['speed', 'int'], 10: ['poses', 'array:BattlerAnimationPose'], 11: ['weapons', 'array:BattlerAnimationWeapon'] },
        Terms: {
            1: ['encounter', 'str'], 2: ['special_combat', 'str'], 3: ['escape_success', 'str'], 4: ['escape_failure', 'str'], 5: ['victory', 'str'],
            6: ['defeat', 'str'], 7: ['exp_received', 'str'], 8: ['gold_recieved_a', 'str'], 9: ['gold_recieved_b', 'str'], 10: ['item_recieved', 'str'],
            11: ['attacking', 'str'], 12: ['enemy_critical', 'str'], 13: ['actor_critical', 'str'], 14: ['defending', 'str'], 15: ['observing', 'str'],
            16: ['charging', 'str'], 17: ['selfdestruction', 'str'], 18: ['enemy_escape', 'str'], 19: ['enemy_transform', 'str'], 20: ['enemy_damaged', 'str'],
            21: ['enemy_undamaged', 'str'], 22: ['actor_damaged', 'str'], 23: ['actor_undamaged', 'str'], 24: ['skill_failure_a', 'str'], 25: ['skill_failure_b', 'str'],
            26: ['skill_failure_c', 'str'], 27: ['dodge', 'str'], 28: ['use_item', 'str'], 29: ['hp_recovery', 'str'], 30: ['parameter_increase', 'str'],
            31: ['parameter_decrease', 'str'], 32: ['actor_hp_absorbed', 'str'], 33: ['enemy_hp_absorbed', 'str'], 34: ['resistance_increase', 'str'], 35: ['resistance_decrease', 'str'],
            36: ['level_up', 'str'], 37: ['skill_learned', 'str'], 38: ['battle_start', 'str'], 39: ['miss', 'str'],
            41: ['shop_greeting1', 'str'], 42: ['shop_regreeting1', 'str'], 43: ['shop_buy1', 'str'], 44: ['shop_sell1', 'str'], 45: ['shop_leave1', 'str'],
            46: ['shop_buy_select1', 'str'], 47: ['shop_buy_number1', 'str'], 48: ['shop_purchased1', 'str'], 49: ['shop_sell_select1', 'str'], 50: ['shop_sell_number1', 'str'],
            51: ['shop_sold1', 'str'], 54: ['shop_greeting2', 'str'], 55: ['shop_regreeting2', 'str'], 56: ['shop_buy2', 'str'], 57: ['shop_sell2', 'str'],
            58: ['shop_leave2', 'str'], 59: ['shop_buy_select2', 'str'], 60: ['shop_buy_number2', 'str'], 61: ['shop_purchased2', 'str'], 62: ['shop_sell_select2', 'str'],
            63: ['shop_sell_number2', 'str'], 64: ['shop_sold2', 'str'], 67: ['shop_greeting3', 'str'], 68: ['shop_regreeting3', 'str'], 69: ['shop_buy3', 'str'],
            70: ['shop_sell3', 'str'], 71: ['shop_leave3', 'str'], 72: ['shop_buy_select3', 'str'], 73: ['shop_buy_number3', 'str'], 74: ['shop_purchased3', 'str'],
            75: ['shop_sell_select3', 'str'], 76: ['shop_sell_number3', 'str'], 77: ['shop_sold3', 'str'],
            80: ['inn_a_greeting_1', 'str'], 81: ['inn_a_greeting_2', 'str'], 82: ['inn_a_greeting_3', 'str'], 83: ['inn_a_accept', 'str'], 84: ['inn_a_cancel', 'str'],
            85: ['inn_b_greeting_1', 'str'], 86: ['inn_b_greeting_2', 'str'], 87: ['inn_b_greeting_3', 'str'], 88: ['inn_b_accept', 'str'], 89: ['inn_b_cancel', 'str'],
            92: ['possessed_items', 'str'], 93: ['equipped_items', 'str'], 95: ['gold', 'str'],
            101: ['battle_fight', 'str'], 102: ['battle_auto', 'str'], 103: ['battle_escape', 'str'], 104: ['command_attack', 'str'], 105: ['command_defend', 'str'],
            106: ['command_item', 'str'], 107: ['command_skill', 'str'], 108: ['menu_equipment', 'str'], 110: ['menu_save', 'str'], 112: ['menu_quit', 'str'],
            114: ['new_game', 'str'], 115: ['load_game', 'str'], 117: ['exit_game', 'str'], 118: ['status', 'str'], 119: ['row', 'str'], 120: ['order', 'str'],
            121: ['wait_on', 'str'], 122: ['wait_off', 'str'], 123: ['level', 'str'], 124: ['health_points', 'str'], 125: ['spirit_points', 'str'],
            126: ['normal_status', 'str'], 127: ['exp_short', 'str'], 128: ['lvl_short', 'str'], 129: ['hp_short', 'str'], 130: ['sp_short', 'str'],
            131: ['sp_cost', 'str'], 132: ['attack', 'str'], 133: ['defense', 'str'], 134: ['spirit', 'str'], 135: ['agility', 'str'],
            136: ['weapon', 'str'], 137: ['shield', 'str'], 138: ['armor', 'str'], 139: ['helmet', 'str'], 140: ['accessory', 'str'],
            146: ['save_game_message', 'str'], 147: ['load_game_message', 'str'], 148: ['file', 'str'], 151: ['exit_game_message', 'str'],
            152: ['yes', 'str'], 153: ['no', 'str']
        },
        System: {
            10: ['ldb_id', 'int'], 11: ['boat_name', 'str'], 12: ['ship_name', 'str'], 13: ['airship_name', 'str'], 14: ['boat_index', 'int'],
            15: ['ship_index', 'int'], 16: ['airship_index', 'int'], 17: ['title_name', 'str'], 18: ['gameover_name', 'str'], 19: ['system_name', 'str'],
            20: ['system2_name', 'str'], 21: ['party_size', 'int'], 22: ['party', 'i16[]'], 26: ['menu_commands_size', 'int'], 27: ['menu_commands', 'i16[]'],
            31: ['title_music', 'struct:Music'], 32: ['battle_music', 'struct:Music'], 33: ['battle_end_music', 'struct:Music'], 34: ['inn_music', 'struct:Music'],
            35: ['boat_music', 'struct:Music'], 36: ['ship_music', 'struct:Music'], 37: ['airship_music', 'struct:Music'], 38: ['gameover_music', 'struct:Music'],
            41: ['cursor_se', 'struct:Sound'], 42: ['decision_se', 'struct:Sound'], 43: ['cancel_se', 'struct:Sound'], 44: ['buzzer_se', 'struct:Sound'],
            45: ['battle_se', 'struct:Sound'], 46: ['escape_se', 'struct:Sound'], 47: ['enemy_attack_se', 'struct:Sound'], 48: ['enemy_damaged_se', 'struct:Sound'],
            49: ['actor_damaged_se', 'struct:Sound'], 50: ['dodge_se', 'struct:Sound'], 51: ['enemy_death_se', 'struct:Sound'], 52: ['item_se', 'struct:Sound'],
            61: ['transition_out', 'int'], 62: ['transition_in', 'int'], 63: ['battle_start_fadeout', 'int'], 64: ['battle_start_fadein', 'int'],
            65: ['battle_end_fadeout', 'int'], 66: ['battle_end_fadein', 'int'], 71: ['message_stretch', 'int'], 72: ['font_id', 'int'],
            81: ['selected_condition', 'int'], 82: ['selected_hero', 'int'], 83: ['battletest_background', 'str'], 84: ['battletest_data', 'raw'],
            85: ['save_count', 'int'], 91: ['battletest_terrain', 'int'], 92: ['battletest_formation', 'int'], 93: ['battletest_condition', 'int'],
            94: ['equipment_setting', 'int'], 95: ['battletest_alt_terrain', 'int'], 99: ['show_frame', 'bool'], 100: ['frame_name', 'str'],
            101: ['invert_animations', 'bool'], 111: ['show_title', 'bool']
        },
        Database: {
            11: ['actors', 'array:Actor'], 12: ['skills', 'array:Skill'], 13: ['items', 'array:Item'], 14: ['enemies', 'array:Enemy'],
            15: ['troops', 'array:Troop'], 16: ['terrains', 'array:Terrain'], 17: ['attributes', 'array:Attribute'], 18: ['states', 'array:State'],
            19: ['animations', 'array:Animation'], 20: ['chipsets', 'array:Chipset'], 21: ['terms', 'struct:Terms'], 22: ['system', 'struct:System'],
            23: ['switches', 'array:Named'], 24: ['variables', 'array:Named'], 25: ['commonevents', 'array:CommonEvent'], 26: ['version', 'int'],
            29: ['battlecommands', 'struct:BattleCommands'], 30: ['classes', 'array:Class'], 32: ['battleranimations', 'array:BattlerAnimation']
        },
        // Map tree
        Encounter: { 1: ['troop_id', 'int'] },
        MapInfo: {
            1: ['name', 'str'], 2: ['parent_map', 'int'], 3: ['indentation', 'int'], 4: ['type', 'int'], 5: ['scrollbar_x', 'int'], 6: ['scrollbar_y', 'int'],
            7: ['expanded_node', 'bool'], 11: ['music_type', 'int'], 12: ['music', 'struct:Music'], 21: ['background_type', 'int'], 22: ['background_name', 'str'],
            31: ['teleport', 'int'], 32: ['escape', 'int'], 33: ['save', 'int'], 41: ['encounters', 'array:Encounter'], 44: ['encounter_steps', 'int'],
            51: ['area_rect', 'i32[]']
        },
        Start: { 1: ['party_map_id', 'int'], 2: ['party_x', 'int'], 3: ['party_y', 'int'], 11: ['boat_map_id', 'int'], 12: ['boat_x', 'int'], 13: ['boat_y', 'int'], 21: ['ship_map_id', 'int'], 22: ['ship_x', 'int'], 23: ['ship_y', 'int'], 31: ['airship_map_id', 'int'], 32: ['airship_x', 'int'], 33: ['airship_y', 'int'] },
        // Map unit
        MoveCommand: {},
        MoveRoute: { 11: ['move_commands_size', 'int'], 12: ['move_commands', 'moves'], 21: ['repeat', 'bool'], 22: ['skippable', 'bool'] },
        EventPageCondition: {
            1: ['flags', 'int'], 2: ['switch_a_id', 'int'], 3: ['switch_b_id', 'int'], 4: ['variable_id', 'int'], 5: ['variable_value', 'int'],
            6: ['item_id', 'int'], 7: ['actor_id', 'int'], 8: ['timer_sec', 'int'], 9: ['timer2_sec', 'int'], 10: ['compare_operator', 'int']
        },
        EventPage: {
            2: ['condition', 'struct:EventPageCondition'], 21: ['character_name', 'str'], 22: ['character_index', 'int'], 23: ['character_direction', 'int'],
            24: ['character_pattern', 'int'], 25: ['translucent', 'bool'], 31: ['move_type', 'int'], 32: ['move_frequency', 'int'], 33: ['trigger', 'int'],
            34: ['layer', 'int'], 35: ['overlap_forbidden', 'bool'], 36: ['animation_type', 'int'], 37: ['move_speed', 'int'], 41: ['move_route', 'struct:MoveRoute'],
            51: ['event_commands_size', 'int'], 52: ['event_commands', 'commands']
        },
        Event: { 1: ['name', 'str'], 2: ['x', 'int'], 3: ['y', 'int'], 5: ['pages', 'array:EventPage'] },
        Map: {
            1: ['chipset_id', 'int'], 2: ['width', 'int'], 3: ['height', 'int'], 11: ['scroll_type', 'int'], 31: ['parallax_flag', 'bool'], 32: ['parallax_name', 'str'],
            33: ['parallax_loop_x', 'bool'], 34: ['parallax_loop_y', 'bool'], 35: ['parallax_auto_loop_x', 'bool'], 36: ['parallax_sx', 'int'],
            37: ['parallax_auto_loop_y', 'bool'], 38: ['parallax_sy', 'int'], 42: ['top_level', 'bool'],
            50: ['generator_flag', 'bool'], 51: ['generator_mode', 'int'], 52: ['generator_tiles', 'int'], 53: ['generator_width', 'int'], 54: ['generator_height', 'int'],
            55: ['generator_surround', 'bool'], 56: ['generator_upper_wall', 'bool'], 57: ['generator_floor_b', 'bool'], 58: ['generator_floor_c', 'bool'],
            59: ['generator_extra_b', 'bool'], 60: ['generator_extra_c', 'bool'], 61: ['generator_x', 'i32[]'], 62: ['generator_y', 'i32[]'], 63: ['generator_tile_ids', 'i32[]'],
            64: ['generator_ab', 'raw'], 65: ['generator_cd', 'raw'], 71: ['lower_layer', 'u16[]'], 72: ['upper_layer', 'u16[]'],
            81: ['events', 'array:Event'], 90: ['save_count_2k3e', 'int'], 91: ['save_count', 'int']
        }
    };

    // ---- file readers ----------------------------------------------------

    function makeContext(encoding) {
        const decoder = makeDecoder(encoding);
        return { encoding: decoder.name, decode: decoder.decode };
    }

    function readDatabase(bytes, encoding) {
        bytes = asBytes(bytes);
        const h = header(bytes);
        if (h.name !== 'LcfDataBase') throw new Error(`LCF: not a database (${h.name})`);
        const ctx = makeContext(encoding);
        const db = readStruct(ctx, SCHEMAS.Database, bytes, h.pos, bytes.length);
        db.encoding = ctx.encoding;
        db.engine = db.version === 2000 || (!db.classes && !db.battlecommands) ? 'RPG Maker 2000' : 'RPG Maker 2003';
        return db;
    }

    /** The map tree has no chunk wrapper: maps, tree order, active node, then the start block. */
    function readMapTree(bytes, encoding) {
        bytes = asBytes(bytes);
        const h = header(bytes);
        if (h.name !== 'LcfMapTree') throw new Error(`LCF: not a map tree (${h.name})`);
        const ctx = makeContext(encoding);
        let pos = h.pos;
        let count;
        [count, pos] = ber(bytes, pos);
        const maps = [];
        for (let i = 0; i < count; i++) {
            let id;
            [id, pos] = ber(bytes, pos);
            const body = readStructAt(ctx, SCHEMAS.MapInfo, bytes, pos, bytes.length);
            maps[id] = Object.assign({ id }, body.value);
            pos = body.next;
        }
        let orderCount;
        [orderCount, pos] = ber(bytes, pos);
        const treeOrder = [];
        for (let i = 0; i < orderCount; i++) { let v; [v, pos] = ber(bytes, pos); treeOrder.push(v); }
        let activeNode;
        [activeNode, pos] = ber(bytes, pos);
        const start = readStruct(ctx, SCHEMAS.Start, bytes, pos, bytes.length);
        return { maps, treeOrder, activeNode, start, encoding: ctx.encoding };
    }

    function readMap(bytes, encoding) {
        bytes = asBytes(bytes);
        const h = header(bytes);
        if (h.name !== 'LcfMapUnit') throw new Error(`LCF: not a map (${h.name})`);
        const ctx = makeContext(encoding);
        const map = readStruct(ctx, SCHEMAS.Map, bytes, h.pos, bytes.length);
        if (map.width === undefined) map.width = 20;
        if (map.height === undefined) map.height = 15;
        if (map.chipset_id === undefined) map.chipset_id = 1;
        return map;
    }

    function asBytes(b) {
        if (b instanceof Uint8Array) return b;
        if (b && b.buffer) return new Uint8Array(b.buffer, b.byteOffset || 0, b.byteLength);
        return new Uint8Array(b);
    }

    /** The strings a database carries, as raw bytes, for encoding detection. */
    function textSamples(bytes) {
        bytes = asBytes(bytes);
        const h = header(bytes);
        const out = [];
        const grab = (schema, start, end, depth) => {
            for (const c of chunks(bytes, start, end)) {
                const f = schema[c.id];
                if (!f) continue;
                if (f[1] === 'str') out.push(bytes.subarray(c.start, c.end));
                else if (f[1].startsWith('struct:') && depth < 3) grab(SCHEMAS[f[1].slice(7)], c.start, c.end, depth + 1);
                else if (f[1].startsWith('array:') && depth < 2) {
                    let [count, pos] = ber(bytes, c.start);
                    const inner = SCHEMAS[f[1].slice(6)];
                    for (let i = 0; i < count && pos < c.end; i++) {
                        [, pos] = ber(bytes, pos);
                        const s = pos;
                        // walk the record to find its end while grabbing strings
                        for (;;) {
                            let id, len;
                            [id, pos] = ber(bytes, pos);
                            if (id === 0) break;
                            [len, pos] = ber(bytes, pos);
                            const g = inner[id];
                            if (g && g[1] === 'str') out.push(bytes.subarray(pos, pos + len));
                            pos += len;
                        }
                        void s;
                    }
                }
            }
        };
        if (h.name === 'LcfDataBase') grab(SCHEMAS.Database, h.pos, bytes.length, 0);
        return out;
    }

    /**
     * Read a whole project. `files` is { read(relativePath) -> bytes|null, list(dir) -> names[] }.
     * Returns { ini, encoding, database, tree, maps: { id: map }, missing: [] }.
     */
    function readProject(files, options) {
        options = options || {};
        const iniBytes = files.read('RPG_RT.ini');
        const ini = iniBytes ? parseIni(new TextDecoder('latin1').decode(asBytes(iniBytes))) : {};
        const ldb = files.read('RPG_RT.ldb');
        if (!ldb) throw new Error('RPG_RT.ldb not found: not an RPG Maker 2000/2003 project');
        let encoding = options.encoding || ini.RPG_RT?.Encoding || (ini.EasyRPG && ini.EasyRPG.Encoding);
        if (!encoding || /^auto$/i.test(encoding)) encoding = detectEncoding(textSamples(ldb));
        const database = readDatabase(ldb, encoding);
        const lmt = files.read('RPG_RT.lmt');
        const tree = lmt ? readMapTree(lmt, encoding) : null;
        const maps = {};
        const missing = [];
        if (tree) {
            for (const info of tree.maps) {
                if (!info || info.type !== 1) continue; // 0 root, 1 map, 2 area
                const name = `Map${String(info.id).padStart(4, '0')}.lmu`;
                const bytes = files.read(name);
                if (!bytes) { missing.push(name); continue; }
                try { maps[info.id] = readMap(bytes, encoding); }
                catch (error) { missing.push(`${name}: ${error.message}`); }
            }
        }
        return { ini, encoding: database.encoding, database, tree, maps, missing };
    }

    function parseIni(text) {
        const out = {};
        let section = null;
        for (const raw of text.split(/\r?\n/)) {
            const line = raw.trim();
            if (!line || line.startsWith(';')) continue;
            const m = line.match(/^\[(.+)\]$/);
            if (m) { section = m[1]; out[section] = out[section] || {}; continue; }
            const eq = line.indexOf('=');
            if (eq > 0 && section) out[section][line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
        }
        return out;
    }

    // ---- event command names (2000/2003 codes) ---------------------------

    const COMMAND_NAMES = {
        0: 'End of List', 10: 'End', 1005: 'Call Common Event', 1006: 'Force Flee', 1007: 'Enable Combo', 1008: 'Change Class', 1009: 'Change Battle Commands',
        5001: 'Open Load Menu', 5002: 'Exit Game', 5003: 'Toggle ATB Mode', 5004: 'Toggle Fullscreen', 5005: 'Open Video Options',
        10110: 'Show Message', 10120: 'Message Options', 10130: 'Change Face Graphic', 10140: 'Show Choices', 10150: 'Input Number',
        10210: 'Control Switches', 10220: 'Control Variables', 10230: 'Timer Operation', 10310: 'Change Gold', 10320: 'Change Items',
        10330: 'Change Party Members', 10410: 'Change EXP', 10420: 'Change Level', 10430: 'Change Parameters', 10440: 'Change Skills',
        10450: 'Change Equipment', 10460: 'Change HP', 10470: 'Change MP', 10480: 'Change Condition', 10490: 'Full Heal',
        10500: 'Simulated Attack', 10610: 'Change Hero Name', 10620: 'Change Hero Title', 10630: 'Change Sprite Association',
        10640: 'Change Actor Face', 10650: 'Change Vehicle Graphic', 10660: 'Change System BGM', 10670: 'Change System SFX',
        10680: 'Change System Graphics', 10690: 'Change Screen Transitions', 10710: 'Enemy Encounter', 10720: 'Open Shop', 10730: 'Show Inn',
        10740: 'Enter Hero Name', 10810: 'Teleport', 10820: 'Memorize Location', 10830: 'Recall to Location', 10840: 'Enter/Exit Vehicle',
        10850: 'Set Vehicle Location', 10860: 'Change Event Location', 10870: 'Trade Event Locations', 10910: 'Store Terrain ID',
        10920: 'Store Event ID', 11010: 'Erase Screen', 11020: 'Show Screen', 11030: 'Tint Screen', 11040: 'Flash Screen', 11050: 'Shake Screen',
        11060: 'Pan Screen', 11070: 'Weather Effects', 11110: 'Show Picture', 11120: 'Move Picture', 11130: 'Erase Picture',
        11210: 'Show Battle Animation', 11310: 'Player Visibility', 11320: 'Flash Sprite', 11330: 'Move Event', 11340: 'Proceed With Movement',
        11350: 'Halt All Movement', 11410: 'Wait', 11510: 'Play BGM', 11520: 'Fade Out BGM', 11530: 'Memorize BGM', 11540: 'Play Memorized BGM',
        11550: 'Play Sound', 11560: 'Play Movie', 11610: 'Key Input Processing', 11710: 'Change Map Tileset', 11720: 'Change Parallax BG',
        11740: 'Change Encounter Steps', 11750: 'Tile Substitution', 11810: 'Teleport Targets', 11820: 'Change Teleport Access',
        11830: 'Escape Target', 11840: 'Change Escape Access', 11910: 'Open Save Menu', 11930: 'Change Save Access', 11950: 'Open Main Menu',
        11960: 'Change Main Menu Access', 12010: 'Conditional Branch', 12110: 'Label', 12120: 'Jump to Label', 12210: 'Loop', 12220: 'Break Loop',
        12310: 'End Event Processing', 12320: 'Erase Event', 12330: 'Call Event', 12410: 'Comment', 12420: 'Game Over', 12510: 'Return to Title Screen',
        13110: 'Change Monster HP', 13120: 'Change Monster MP', 13130: 'Change Monster Condition', 13150: 'Show Hidden Monster',
        13210: 'Change Battle BG', 13260: 'Show Battle Animation (battle)', 13310: 'Conditional Branch (battle)', 13410: 'Terminate Battle',
        20110: 'Show Message (line)', 20140: 'Show Choices (option)', 20141: 'Show Choices (end)', 20710: 'Victory Handler', 20711: 'Escape Handler',
        20712: 'Defeat Handler', 20713: 'End Battle', 20720: 'Transaction', 20721: 'No Transaction', 20722: 'End Shop', 20730: 'Stay', 20731: 'No Stay',
        20732: 'End Inn', 22010: 'Else', 22011: 'End Branch', 22210: 'End Loop', 22410: 'Comment (line)', 23310: 'Else (battle)', 23311: 'End Branch (battle)'
    };

    /**
     * What each 2003 command becomes in Reactor's (MZ-format) event data.
     * direct: one MZ command carries it; approx: an MZ command carries the
     * intent with a documented difference; structural: folded into another
     * command's data (message lines, choice branches); comment: kept as a
     * comment for a runtime shim or a person; none: nothing to carry.
     */
    const COMMAND_TARGETS = {
        0: 'none', 10: 'none', 1005: 'direct', 1006: 'approx', 1007: 'comment', 1008: 'direct', 1009: 'comment',
        5001: 'approx', 5002: 'direct', 5003: 'comment', 5004: 'comment', 5005: 'comment',
        10110: 'direct', 10120: 'direct', 10130: 'structural', 10140: 'direct', 10150: 'direct',
        10210: 'direct', 10220: 'direct', 10230: 'direct', 10310: 'direct', 10320: 'direct', 10330: 'direct',
        10410: 'direct', 10420: 'direct', 10430: 'direct', 10440: 'direct', 10450: 'direct', 10460: 'direct', 10470: 'direct',
        10480: 'direct', 10490: 'direct', 10500: 'approx', 10610: 'direct', 10620: 'direct', 10630: 'direct', 10640: 'direct',
        10650: 'direct', 10660: 'approx', 10670: 'approx', 10680: 'direct', 10690: 'comment', 10710: 'direct', 10720: 'direct',
        10730: 'approx', 10740: 'direct', 10810: 'direct', 10820: 'approx', 10830: 'approx', 10840: 'direct', 10850: 'direct',
        10860: 'direct', 10870: 'approx', 10910: 'direct', 10920: 'direct', 11010: 'direct', 11020: 'direct', 11030: 'direct',
        11040: 'direct', 11050: 'direct', 11060: 'direct', 11070: 'direct', 11110: 'approx', 11120: 'approx', 11130: 'direct',
        11210: 'direct', 11310: 'direct', 11320: 'approx', 11330: 'direct', 11340: 'direct', 11350: 'approx', 11410: 'direct',
        11510: 'direct', 11520: 'direct', 11530: 'direct', 11540: 'direct', 11550: 'direct', 11560: 'direct', 11610: 'approx',
        11710: 'direct', 11720: 'direct', 11740: 'approx', 11750: 'comment', 11810: 'comment', 11820: 'comment', 11830: 'comment',
        11840: 'comment', 11910: 'direct', 11930: 'direct', 11950: 'direct', 11960: 'direct', 12010: 'direct', 12110: 'direct',
        12120: 'direct', 12210: 'direct', 12220: 'direct', 12310: 'direct', 12320: 'direct', 12330: 'approx', 12410: 'direct',
        12420: 'direct', 12510: 'direct', 13110: 'direct', 13120: 'direct', 13130: 'direct', 13150: 'direct', 13210: 'direct',
        13260: 'direct', 13310: 'direct', 13410: 'direct', 20110: 'structural', 20140: 'structural', 20141: 'structural',
        20710: 'structural', 20711: 'structural', 20712: 'structural', 20713: 'structural', 20720: 'structural', 20721: 'structural',
        20722: 'structural', 20730: 'structural', 20731: 'structural', 20732: 'structural', 22010: 'structural', 22011: 'structural',
        22210: 'structural', 22410: 'structural', 23310: 'structural', 23311: 'structural'
    };

    /** The DynRPG / Maniac "@name" a comment carries, or null. */
    function dynCommand(text) {
        const m = /^\s*@(?:call\s+)?([A-Za-z_][A-Za-z0-9_]*)/.exec(text || '');
        return m ? m[1].toLowerCase() : null;
    }

    // Standard image cell sizes of the 2000/2003 engines, in pixels.
    const IMAGE_SPECS = {
        ChipSet: { width: 480, height: 256, tile: 16 },
        CharSet: { width: 288, height: 256, cols: 4, rows: 2, frame: [24, 32] },
        FaceSet: { width: 192, height: 192, cols: 4, rows: 4, cell: 48 },
        Battle: { width: 480, height: 480, cols: 5, rows: 5, cell: 96 },
        Battle2: { width: 640, height: 640, cols: 5, rows: 5, cell: 128 },
        BattleCharSet: { width: 144, height: 384, cols: 3, rows: 8, frame: [48, 48] },
        BattleWeapon: { width: 192, height: 512, cols: 3, rows: 8, frame: [64, 64] },
        Monster: { width: null, height: null },
        Backdrop: { width: 320, height: 160 },
        Panorama: { width: null, height: null },
        Picture: { width: null, height: null },
        System: { width: 160, height: 80 },
        System2: { width: 80, height: 96 },
        GameOver: { width: 320, height: 240 },
        Title: { width: 320, height: 240 },
        Frame: { width: 320, height: 240 }
    };

    /**
     * A gettext .po file (EasyRPG's Language folder) → { context: { msgid: msgstr } }
     * for entries whose msgstr is non-empty. The "" context holds messages.
     */
    function parsePo(text) {
        const out = {};
        let ctx = '', id = null, str = null, target = null;
        const unq = (line) => { const m = /^"([\s\S]*)"\s*$/.exec(line.trim()); return m ? m[1].replace(/\\(["\\nt])/g, (_, c) => ({ '"': '"', '\\': '\\', n: '\n', t: '\t' }[c])) : ''; };
        const flush = () => { if (id !== null && str !== null && id !== '' && str !== '') { (out[ctx] || (out[ctx] = {}))[id] = str; } ctx = ''; id = null; str = null; target = null; };
        for (const raw of String(text).split(/\r?\n/)) {
            const line = raw.trim();
            if (!line) { flush(); continue; }
            if (line.startsWith('#')) continue;
            if (line.startsWith('msgctxt ')) { flush(); ctx = unq(line.slice(8)); target = 'ctx'; }
            else if (line.startsWith('msgid ')) { if (id !== null) flush(); id = unq(line.slice(6)); target = 'id'; }
            else if (line.startsWith('msgstr ')) { str = unq(line.slice(7)); target = 'str'; }
            else if (line.startsWith('"')) { const v = unq(line); if (target === 'id') id += v; else if (target === 'str') str += v; else if (target === 'ctx') ctx += v; }
        }
        flush();
        return out;
    }

    const api = {
        ber, berInt, parsePo, header, chunks, readStruct, readArray, readCommands, readDatabase, readMapTree, readMap, readProject,
        detectEncoding, textSamples, normalizeEncoding, parseIni, dynCommand,
        SCHEMAS, COMMAND_NAMES, COMMAND_TARGETS, IMAGE_SPECS
    };
    root.RRLcf = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
