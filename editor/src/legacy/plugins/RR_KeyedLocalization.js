/*:
 * @target MZ
 * @plugindesc Text keys from the game's language files, for imported games
 * @author RPG Reactor
 * @url https://github.com/Psychronic-Games/RPG-Reactor
 *
 * @help RR_KeyedLocalization.js
 *
 * Some games keep their text in language files and put keys in their data:
 * "[12" is line 12 of the language's file, "{3" line 3 of the current map's.
 * The import wrote the chosen language into the project's data; this plugin
 * resolves the keys the game only puts together while it runs: text kept in
 * variables (\V[n] and messages built from them), keys in plugins' and
 * scripts' strings, and common events that read whichever map they run on.
 * The language's lines are in data/RRLocalization.json.
 *
 * In script calls: RRKeyedText.resolve(text) returns the text with its key
 * resolved, RRKeyedText.language() the language the import chose.
 *
 * Installed by File › Import Project… when the imported game kept its text
 * this way.
 *
 * @param language
 * @text Language
 * @desc The language the import wrote into the data.
 * @default Eng
 */
(() => {
    'use strict';
    const params = PluginManager.parameters('RR_KeyedLocalization');
    const GLOBAL_KEY = /^\[(\d+)/, MAP_KEY = /^\{(\d+)/;

    DataManager._databaseFiles.push({ name: '$dataRrLocalization', src: 'RRLocalization.json' });

    const table = () => window.$dataRrLocalization || { lines: [], maps: {} };
    const mapLines = () => {
        const id = window.$gameMap && $gameMap.mapId ? $gameMap.mapId() : 0;
        return (table().maps || {})[id] || null;
    };
    /** The text with its leading key replaced by its line; anything after the key stays. */
    const resolve = (text) => {
        if (typeof text !== 'string' || !(GLOBAL_KEY.test(text) || MAP_KEY.test(text))) return text;
        const t = table();
        let out = text.replace(GLOBAL_KEY, (m, n) => { const line = t.lines[Number(n) - 1]; return line === undefined ? m : line; });
        const map = mapLines();
        if (map) out = out.replace(MAP_KEY, (m, n) => { const line = map[Number(n) - 1]; return line === undefined ? m : line; });
        return out;
    };
    window.RRKeyedText = { resolve, language: () => (table().language || String(params.language || '')) };

    // Messages and choices: the text itself, and a variable's text shown with \V[n].
    const _convert = Window_Base.prototype.convertEscapeCharacters;
    Window_Base.prototype.convertEscapeCharacters = function(text) {
        text = resolve(String(text ?? ''));
        text = text.replace(/\\V\[(\d+)\]/gi, (m, n) => {
            const v = $gameVariables.value(Number(n));
            return typeof v === 'string' && v !== resolve(v) ? resolve(v) : m;
        });
        return _convert.call(this, text);
    };
    const _drawText = Window_Base.prototype.drawText;
    Window_Base.prototype.drawText = function(text, ...rest) {
        return _drawText.call(this, typeof text === 'string' ? resolve(text) : text, ...rest);
    };
    const _add = Game_Message.prototype.add;
    Game_Message.prototype.add = function(text) {
        _add.call(this, resolve(text));
    };
})();
