/**
 * LegacyDynRpg - DynRPG comment commands (`@name arg, arg, …` in a 2003
 * Comment) → Script calls on Reactor's screen features.
 *
 * Three plugin families convert: the text plugin (write_text, append_line,
 * append_text, change_text, change_position, remove_text, remove_all), the
 * sprite plugin (add_sprite, set_sprite_*, move_*_sprite_*, scale_*_sprite_to,
 * rotate_sprite_*, shift_sprite_*, bind_sprite_to, get_sprite_position,
 * remove_sprite) and the particle-effects plugin (pfx_*). Each becomes one
 * `$gameScreen.rr…` call in a Script command; an argument written `Vn` reads
 * variable n at run time. Anything else stays a comment and is counted.
 *
 * The text plugin's arguments are EasyRPG Player's (its native
 * implementation); the particle plugin's are its published reference; the
 * sprite plugin's are read from how they are used and settled against
 * Deep 8's shipped player: add_sprite takes name, image, blend, a flag
 * (always 1), z order (lower in front), x, y, scale percent, angle; a
 * sprite is over everything until set_sprite_layer puts it on one of 2003
 * 1.12's picture map layers (1-10); set_sprite_z reorders it within its
 * layer. Times are milliseconds, easing names such as "quadratic in/out".
 */
(function (root) {
    'use strict';

    /** `@name a, "b", V3` → { name, args: [ {raw} ] }; quotes are kept on the raw text. */
    function parse(text) {
        const m = /^\s*@(?:call\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*,?\s*([\s\S]*)$/.exec(text || '');
        if (!m) return null;
        const args = [];
        let cur = '', quote = null;
        for (const ch of m[2]) {
            if (quote) { cur += ch; if (ch === quote) quote = null; continue; }
            if (ch === '"' || ch === "'") { quote = ch; cur += ch; continue; }
            if (ch === ',') { args.push(cur.trim()); cur = ''; continue; }
            cur += ch;
        }
        if (cur.trim() !== '' || args.length) args.push(cur.trim());
        return { name: m[1].toLowerCase(), args };
    }

    /** A raw argument as a JavaScript expression: "text" → string literal, Vn → variable read, number → number, bare word → string. */
    function expr(raw) {
        if (raw === undefined || raw === null || raw === '') return 'undefined';
        const s = String(raw).trim();
        const q = /^(["'])([\s\S]*)\1$/.exec(s);
        if (q) return JSON.stringify(q[2]);   // plugin strings have no escapes: \v[n] and \c[n] are text codes the runtime reads
        const v = /^[Vv](\d+)$/.exec(s);
        if (v) return `$gameVariables.value(${v[1]})`;
        if (/^-?\d+(\.\d+)?$/.test(s)) return String(Number(s));
        return JSON.stringify(s);
    }
    const num = (raw, fallback) => (raw === undefined || raw === null || String(raw).trim() === '' ? String(fallback) : expr(raw));
    const isEnd = (raw) => /^["']?end["']?$/i.test(String(raw || '').trim());

    /** The Script text for one DynRPG command, or null when it is not one this knows. */
    function convert(name, a, translate) {
        const S = '$gameScreen.';
        // a quoted text argument, translated when the import bakes a language in
        const txt = (raw) => { const q = /^(["'])([\s\S]*)\1$/.exec(String(raw || '').trim()); return q && translate ? JSON.stringify(translate(q[2])) : expr(raw); };
        switch (name) {
            // ---- text plugin ---------------------------------------------------------
            case 'write_text': return `${S}rrWriteText(${expr(a[0])}, ${num(a[1], 0)}, ${num(a[2], 0)}, ${txt(a[3])}, ${/fixed/i.test(String(a[4] || '')) ? 'true' : 'false'}, ${isEnd(a[5]) ? 0 : num(a[5], 0)}, ${isEnd(a[6]) ? 0 : num(a[6], 0)})`;
            case 'append_line': return `${S}rrAppendLine(${expr(a[0])}, ${txt(a[1])})`;
            case 'append_text': return `${S}rrAppendText(${expr(a[0])}, ${txt(a[1])})`;
            case 'change_text': return `${S}rrChangeText(${expr(a[0])}, ${txt(a[1])}, ${isEnd(a[2]) || a[2] === undefined ? 'null' : num(a[2], 0)})`;
            case 'change_position': return `${S}rrMoveText(${expr(a[0])}, ${num(a[1], 0)}, ${num(a[2], 0)})`;
            case 'remove_text': return `${S}rrRemoveText(${expr(a[0])})`;
            case 'remove_all': return `${S}rrRemoveAllTexts()`;
            case 'set_text_alignment': return `${S}rrTextAlign(${expr(a[0])}, ${expr(a[1] || '"left"')})`;

            // ---- sprite plugin --------------------------------------------------------
            case 'add_sprite': return `${S}rrSpriteAdd(${expr(a[0])}, ${expr(a[1])}, ${expr(a[2] || '"mix"')}, 0, ${num(a[5], 0)}, ${num(a[6], 0)}, ${num(a[7], 100)}, ${num(a[8], 0)}, ${num(a[4], 0)})`;
            case 'set_sprite_z': return `${S}rrSpriteZ(${expr(a[0])}, ${num(a[1], 0)})`;
            case 'remove_sprite': return `${S}rrSpriteRemove(${expr(a[0])})`;
            case 'remove_all_sprites': return `${S}rrSpriteRemoveAll()`;
            case 'bind_sprite_to': return `${S}rrSpriteBind(${expr(a[0])}, ${expr(a[1] || '"screen"')})`;
            case 'set_sprite_layer': return `${S}rrSpriteLayer(${expr(a[0])}, ${num(a[1], 5)})`;
            case 'set_sprite_image': return `${S}rrSpriteImage(${expr(a[0])}, ${expr(a[1])})`;
            case 'set_sprite_opacity': return `${S}rrSpriteOpacity(${expr(a[0])}, ${num(a[1], 255)})`;
            case 'shift_sprite_opacity_to': return `${S}rrSpriteOpacityTo(${expr(a[0])}, ${num(a[1], 255)}, ${num(a[2], 0)}, ${expr(a[3] || '"linear"')})`;
            case 'move_sprite_to': return `${S}rrSpriteMoveTo(${expr(a[0])}, ${num(a[1], 0)}, ${num(a[2], 0)}, ${num(a[3], 0)}, ${expr(a[4] || '"linear"')})`;
            case 'move_sprite_by': return `${S}rrSpriteMoveBy(${expr(a[0])}, ${num(a[1], 0)}, ${num(a[2], 0)}, ${num(a[3], 0)}, ${expr(a[4] || '"linear"')})`;
            case 'move_x_sprite_by': return `${S}rrSpriteMoveBy(${expr(a[0])}, ${num(a[1], 0)}, 0, ${num(a[2], 0)}, ${expr(a[3] || '"linear"')})`;
            case 'move_y_sprite_by': return `${S}rrSpriteMoveBy(${expr(a[0])}, 0, ${num(a[1], 0)}, ${num(a[2], 0)}, ${expr(a[3] || '"linear"')})`;
            case 'move_x_sprite_to': return `${S}rrSpriteMoveTo(${expr(a[0])}, ${num(a[1], 0)}, null, ${num(a[2], 0)}, ${expr(a[3] || '"linear"')})`;
            case 'move_y_sprite_to': return `${S}rrSpriteMoveTo(${expr(a[0])}, null, ${num(a[1], 0)}, ${num(a[2], 0)}, ${expr(a[3] || '"linear"')})`;
            case 'scale_sprite_to': return `${S}rrSpriteScaleTo(${expr(a[0])}, ${num(a[1], 100)}, ${num(a[1], 100)}, ${num(a[2], 0)}, ${expr(a[3] || '"linear"')})`;
            case 'scale_x_sprite_to': return `${S}rrSpriteScaleTo(${expr(a[0])}, ${num(a[1], 100)}, null, ${num(a[2], 0)}, ${expr(a[3] || '"linear"')})`;
            case 'scale_y_sprite_to': return `${S}rrSpriteScaleTo(${expr(a[0])}, null, ${num(a[1], 100)}, ${num(a[2], 0)}, ${expr(a[3] || '"linear"')})`;
            case 'rotate_sprite_by': return `${S}rrSpriteRotateBy(${expr(a[0])}, ${num(a[1], 0)}, ${num(a[2], 0)}, ${expr(a[3] || '"linear"')})`;
            case 'rotate_sprite_forever': return `${S}rrSpriteRotateForever(${expr(a[0])}, ${expr(a[1] || '"cw"')}, ${num(a[2], 1000)})`;
            case 'stop_sprite_rotation': return `${S}rrSpriteRotateStop(${expr(a[0])})`;
            case 'set_sprite_color': return `${S}rrSpriteColor(${expr(a[0])}, ${num(a[1], 255)}, ${num(a[2], 255)}, ${num(a[3], 255)}, ${num(a[4], 100)})`;
            case 'shift_sprite_color_to': return `${S}rrSpriteColorTo(${expr(a[0])}, ${num(a[1], 255)}, ${num(a[2], 255)}, ${num(a[3], 255)}, ${num(a[4], 100)}, ${num(a[5], 0)})`;
            case 'set_sprite_position': return `${S}rrSpriteMoveTo(${expr(a[0])}, ${num(a[1], 0)}, ${num(a[2], 0)}, 0, "linear")`;
            case 'rotate_sprite_to': return `${S}rrSpriteRotateTo(${expr(a[0])}, ${expr(a[1] || '"cw"')}, ${num(a[2], 0)}, ${num(a[3], 0)}, ${expr(a[4] || '"linear"')})`;
            case 'set_sprite_blend_mode': return `${S}rrSpriteBlend(${expr(a[0])}, ${expr(a[1] || '"mix"')})`;
            case 'get_sprite_position': return `${S}rrSpritePosition(${expr(a[0])}, ${num(a[1], 0)}, ${num(a[2], 0)})`;

            // ---- particle effects --------------------------------------------------------
            case 'pfx_create_effect': return `${S}rrPfxCreate(${expr(a[0])}, ${expr(a[1] || '"burst"')})`;
            case 'pfx_destroy_effect': return `${S}rrPfxDestroy(${expr(a[0])})`;
            case 'pfx_destroy_all': return `${S}rrPfxDestroyAll()`;
            case 'pfx_does_effect_exist': return `${S}rrPfxExists(${expr(a[0])}, ${num(a[1], 0)})`;
            case 'pfx_burst': return `${S}rrPfxBurst(${expr(a[0])}, ${num(a[1], 0)}, ${num(a[2], 0)})`;
            case 'pfx_start': return `${S}rrPfxStart(${expr(a[0])}, ${expr(a[1])}, ${num(a[2], 0)}, ${num(a[3], 0)})`;
            case 'pfx_stop': return `${S}rrPfxStop(${expr(a[0])}, ${expr(a[1])})`;
            case 'pfx_stopall': return `${S}rrPfxStopAll(${expr(a[0])})`;
            case 'pfx_set_position': return `${S}rrPfxSetPosition(${expr(a[0])}, ${expr(a[1])}, ${num(a[2], 0)}, ${num(a[3], 0)})`;
            case 'pfx_set_texture': return `${S}rrPfxSet(${expr(a[0])}, "texture", ${expr(a[1])})`;
            case 'pfx_unload_texture': return `${S}rrPfxSet(${expr(a[0])}, "texture", "")`;
            case 'pfx_set_amount': return `${S}rrPfxSet(${expr(a[0])}, "amount", ${num(a[1], 50)})`;
            case 'pfx_set_simul_effects': return `${S}rrPfxSet(${expr(a[0])}, "simul", ${num(a[1], 2)})`;
            case 'pfx_set_velocity': return `${S}rrPfxSet(${expr(a[0])}, "velocity", ${num(a[1], 30)}, ${num(a[2], 30)})`;
            case 'pfx_set_angle': return `${S}rrPfxSet(${expr(a[0])}, "angle", ${num(a[1], 0)}, ${num(a[2], 360)})`;
            case 'pfx_set_secondary_angle': return `${S}rrPfxSet(${expr(a[0])}, "secondaryAngle", ${num(a[1], 0)})`;
            case 'pfx_set_initial_color': return `${S}rrPfxSet(${expr(a[0])}, "color0", ${num(a[1], 255)}, ${num(a[2], 255)}, ${num(a[3], 255)})`;
            case 'pfx_set_final_color': return `${S}rrPfxSet(${expr(a[0])}, "color1", ${num(a[1], 255)}, ${num(a[2], 255)}, ${num(a[3], 255)})`;
            case 'pfx_set_growth': return `${S}rrPfxSet(${expr(a[0])}, "growth", ${num(a[1], 1)}, ${num(a[2], 1)})`;
            case 'pfx_set_random_position': return `${S}rrPfxSet(${expr(a[0])}, "randomPos", ${num(a[1], 0)}, ${num(a[2], 0)})`;
            case 'pfx_set_timeout': return `${S}rrPfxSet(${expr(a[0])}, "timeout", ${num(a[1], 30)}, ${num(a[2], 0)})`;
            case 'pfx_set_layer': return `${S}rrPfxSet(${expr(a[0])}, "layer", ${num(a[1], 5)})`;
            case 'pfx_set_gravity_direction': return `${S}rrPfxSet(${expr(a[0])}, "gravity", ${num(a[1], 0)}, ${num(a[2], 0)})`;
            case 'pfx_set_generating_function': return `${S}rrPfxSet(${expr(a[0])}, "generating", ${expr(a[1] || '"standard"')})`;
            case 'pfx_set_radius': return `${S}rrPfxSet(${expr(a[0])}, "radius", ${num(a[1], 30)})`;
            case 'pfx_set_random_radius': return `${S}rrPfxSet(${expr(a[0])}, "randomRadius", ${num(a[1], 0)})`;
            case 'pfx_use_screen_relative': return `${S}rrPfxSet(${expr(a[0])}, "screenRelative", ${/true/i.test(String(a[1] || '')) ? 'true' : 'false'})`;
            case 'pfx_set_acceleration_point': return `${S}rrPfxSet(${expr(a[0])}, "acceleration", ${num(a[1], 0)}, ${num(a[2], 0)}, ${num(a[3], 0)})`;
            case 'pfx_set_z': return `${S}rrPfxSet(${expr(a[0])}, "layer", ${num(a[1], 5)})`;
            case 'pfx_set_interval': return `${S}rrPfxSet(${expr(a[0])}, "interval", ${num(a[1], 1)})`;
            // ---- EasyRPG's language switch (RR_Language.js, installed with the game's language packs)
            case 'easyrpg_set_language': return `if (this.rrSetLanguage) this.rrSetLanguage(${expr(a[0])})`;
            default: return null;
        }
    }

    /**
     * Convert the comment lines of one 2003 Comment command (the first line
     * and its continuations). Returns { script } or { comment } with the
     * family name, so the caller can count what it did.
     */
    function convertComment(lines, translate) {
        const text = lines.join('\n');
        const parsed = parse(text);
        if (!parsed) return null;
        const script = convert(parsed.name, parsed.args, translate);
        return script ? { script, family: parsed.name } : { comment: text, family: parsed.name };
    }

    const api = { parse, expr, convert, convertComment };
    root.RRLegacyDynRpg = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
