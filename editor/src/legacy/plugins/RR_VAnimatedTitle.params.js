'use strict';
// Plugin parameters for RR_VAnimatedTitle from the game's copy of V's Custom Animated Title Scene:
// the Specs module's Layers hash, audio arrays, command window constants and command images.

const ALIGN = ['left', 'center', 'right'];

/** A Ruby literal at `at`: hash, array, string, symbol, number, true/false/nil. Returns [value, next index]. */
function readLiteral(text, at) {
    const skip = (i) => {
        for (;;) {
            while (i < text.length && /\s/.test(text[i])) i++;
            if (text[i] !== '#') return i;
            while (i < text.length && text[i] !== '\n') i++;
        }
    };
    const value = (i) => {
        i = skip(i);
        const c = text[i];
        if (c === '{' || c === '[') {
            const hash = c === '{';
            const out = hash ? [] : [];
            i = skip(i + 1);
            while (text[i] !== (hash ? '}' : ']')) {
                if (i >= text.length) throw new Error('unclosed ' + c);
                let item;
                if (hash) {
                    let key;
                    const label = /^([A-Za-z_]\w*):(?!:)/.exec(text.slice(i, i + 64));
                    if (label) { key = label[1]; i += label[0].length; }
                    else { [key, i] = value(i); i = skip(i); if (text.slice(i, i + 2) !== '=>') throw new Error('expected => at ' + i); i += 2; }
                    let v; [v, i] = value(i);
                    item = [key, v];
                } else {
                    [item, i] = value(i);
                }
                out.push(item);
                i = skip(i);
                if (text[i] === ',') i = skip(i + 1);
            }
            // Ruby keeps a repeated hash key at its first place with its last value.
            if (hash) { const h = new Map(); for (const [k, v] of out) h.set(k, v); return [h, i + 1]; }
            return [out, i + 1];
        }
        if (c === '"' || c === "'") {
            // Double quotes read \n and \t as Ruby does; single quotes keep them. "a" + "b" is one string.
            const ESCAPES = { n: '\n', t: '\t', r: '\r', e: '\x1b', s: ' ', 0: '\0' };
            let j = i + 1, s = '';
            while (j < text.length && text[j] !== c) {
                if (text[j] === '\\') {
                    const e = text[j + 1];
                    // Single quotes escape only \\ and \'; any other backslash stays.
                    s += c === '"' ? (ESCAPES[e] !== undefined ? ESCAPES[e] : e) : (e === '\\' || e === "'" ? e : '\\' + e);
                    j += 2;
                } else s += text[j++];
            }
            let k = skip(j + 1);
            while (text[k] === '+') {
                k = skip(k + 1);
                if (text[k] !== '"' && text[k] !== "'") break;
                const [more, after] = value(k);
                s += more;
                j = after - 1;
                k = skip(after);
            }
            return [s, j + 1];
        }
        if (c === ':') { const m = /^:(\w+[?!]?)/.exec(text.slice(i)); if (m) return [m[1], i + m[0].length]; }
        const m = /^(-?\d+(?:\.\d+)?|true|false|nil)\b/.exec(text.slice(i));
        if (m) return [m[1] === 'true' ? true : m[1] === 'false' ? false : m[1] === 'nil' ? null : Number(m[1]), i + m[0].length];
        throw new Error('unreadable value at ' + i);
    };
    return value(at);
}

/** NAME = <literal> in the text (the first uncommented one), or undefined. */
function constant(text, name) {
    const re = new RegExp('^[ \\t]*' + name + '\\s*=\\s*', 'm');
    const m = re.exec(text);
    if (!m) return undefined;
    try { return readLiteral(text, m.index + m[0].length)[0]; } catch (_) { return undefined; }
}

const plain = (v) => v instanceof Map ? Object.fromEntries([...v].map(([k, x]) => [k, plain(x)])) : Array.isArray(v) ? v.map(plain) : v;
const sound = (v, fallback) => {
    const a = Array.isArray(v) ? v : fallback;
    return JSON.stringify({ name: String(a[0] ?? ''), volume: String(a[1] ?? 100), pitch: String(a[2] ?? 100) });
};

function extract({ scripts = [] } = {}) {
    const text = scripts.map(s => String(s && typeof s === 'object' ? s.text || '' : s || ''))
        .find(s => /V_Custom_Animated_Title_Scene/.test(s) && /\bLayers\s*=\s*\{/.test(s)) || '';
    const get = (name, fallback) => { const v = constant(text, name); return v === undefined || v === null ? fallback : v; };

    const layersHash = constant(text, 'Layers');
    const layers = layersHash instanceof Map
        ? [...layersHash].map(([name, spec]) => Object.assign({ name: String(name) }, plain(spec instanceof Map ? spec : new Map())))
        : [];
    const images = constant(text, 'Command_Window_Images');
    const commandImages = images instanceof Map ? [...images].map(([name, spec]) => ({ name: String(name), ox: (spec && spec.get('ox')) || 0, oy: (spec && spec.get('oy')) || 0 })) : [];
    const noSave = get('NO_SAVE_FILE_IMAGE', ['', 0, 0]);

    return {
        layers: JSON.stringify(layers),
        fadeSpeed: String(get('Fade_Speed', 60)),
        playSplashMovie: String(get('Play_Splash_Movie', false) === true),
        playOnNewGame: String(get('Play_On_New_Game', false) === true),
        movieName: String(get('Movie_Name', '')),
        bgm: sound(get('BGM'), ['', 100, 100]),
        bgs: sound(get('BGS'), ['', 100, 100]),
        newGameSe: sound(get('New_Game_SE'), ['Decision1', 100, 100]),
        continueSe: sound(get('Continue_SE'), ['Decision1', 100, 100]),
        shutdownSe: sound(get('Shutdown_SE'), ['Decision1', 100, 100]),
        cancelSe: sound(get('Cancel_SE'), ['Cancel1', 100, 100]),
        buzzerSe: sound(get('Buzzer_SE'), ['Buzzer1', 100, 100]),
        cursorSe: sound(get('Cursor_SE'), ['Cursor1', 100, 100]),
        activateTime: String(get('Command_Window_Activate_Time', 60)),
        horizontal: String(get('Use_Horizontal_Command_Window', false) === true),
        commandX: String(get('Command_Window_X', 0)),
        commandY: String(get('Command_Window_Y', 0)),
        commandZ: String(get('Command_Window_Z', 100)),
        commandWidth: String(get('Command_Window_Width', 175)),
        commandHeight: String(get('Command_Window_Height', 120)),
        commandOpacity: String(get('Command_Window_Opacity', 255)),
        commandBackOpacity: String(get('Command_Window_Back_Opacity', 192)),
        useTextCommands: String(get('Use_Text_Commands', true) !== false),
        commandAlign: ALIGN[get('Command_Alignment', 1)] || 'center',
        commandFont: String(get('Command_Window_Font', '')),
        commandTextSize: String(get('Command_Window_Text_Size', 24)),
        commandTextColor: String(get('Command_Window_Text_Color', 'normal_color')),
        rectWidth: String(get('Command_Window_Rect_Width', 170)),
        rectHeight: String(get('Command_Window_Rect_Height', 24)),
        rectSpacing: String(get('Command_Window_Rect_Spacing', 4)),
        cursorWidth: String(get('Command_Window_Cursor_Width', 170)),
        cursorHeight: String(get('Command_Window_Cursor_Height', 24)),
        cursorSpacing: String(get('Command_Window_Cursor_Spacing', 10)),
        commandImages: JSON.stringify(commandImages),
        noSaveImage: JSON.stringify({ name: String(noSave[0] ?? ''), ox: noSave[1] ?? 0, oy: noSave[2] ?? 0 })
    };
}

module.exports = { extract, readLiteral };
