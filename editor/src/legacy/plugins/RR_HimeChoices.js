/*:
 * @target MZ
 * @plugindesc Large Choices and Choice Options (VX Ace), for imported games
 * @author Hime; ported for RPG Reactor
 * @url https://github.com/Psychronic-Games/RPG-Reactor
 *
 * @help RR_HimeChoices.js
 *
 * Large Choices: Show Choices commands that follow one another (each after
 * the last one's branches) become one list, so a question can offer more
 * than one command's choices. Only the last set should have a cancel branch.
 *
 * Choice Options: before Show Choices, script calls change single choices
 * (numbered from 1 across the whole list); the import writes the game's
 * Ruby conditions as JavaScript, worked out when the call runs:
 *   this.rrChoiceOption("hidden", n, condition)      hide the choice
 *   this.rrChoiceOption("condition", n, condition)   disable it
 *   this.rrChoiceOption("color", n, textColor)
 *   this.rrChoiceOption("disable_color", n, textColor)
 *   this.rrChoiceOption("text", n, text, condition)  replace its text
 * The options last until the message closes.
 *
 * Installed by File › Import Project… when the imported game carried the
 * original scripts.
 *
 * @param largeChoices
 * @text Combine choice commands
 * @type boolean
 * @default true
 *
 * @param choiceOptions
 * @text Choice options
 * @type boolean
 * @default true
 */
(() => {
    'use strict';
    const params = PluginManager.parameters('RR_HimeChoices');
    const LARGE = String(params.largeChoices) !== 'false';
    const OPTIONS = String(params.choiceOptions) !== 'false';
    const BRANCH_CODES = [402, 403, 404];

    const options = () => {
        if (!$gameMessage._rrChoiceOptions) $gameMessage._rrChoiceOptions = { hidden: {}, condition: {}, color: {}, disable_color: {}, text: {} };
        return $gameMessage._rrChoiceOptions;
    };
    const _clear = Game_Message.prototype.clear;
    Game_Message.prototype.clear = function() {
        _clear.call(this);
        this._rrChoiceOptions = null;
        this._rrChoiceMap = null;
        this._rrChoiceEnabled = null;
    };

    Game_Interpreter.prototype.rrChoiceOption = function(type, n, value, condition) {
        const o = options();
        if (!o[type]) return;
        if (type === 'text') {
            (o.text[n] = o.text[n] || []).push([String(value).replace(/\n/g, ''), condition === undefined ? true : !!condition]);
        } else if (type === 'color' || type === 'disable_color') {
            o[type][n] = Number(value);
        } else {
            o[type][n] = !!value;
        }
    };

    // The following Show Choices at this indent, after the current one's branches, join it.
    Game_Interpreter.prototype.rrCombineChoices = function(params) {
        this._list = JSON.parse(JSON.stringify(this._list));
        const first = this._list[this._index];
        const merged = first.parameters[0].slice();
        let cancel = first.parameters[1];
        let search = this._index + 1;
        const skip = () => {
            while (this._list[search] && (BRANCH_CODES.includes(this._list[search].code) || this._list[search].indent !== this._indent)) search++;
        };
        for (skip(); this._list[search] && this._list[search].code === 102 && this._list[search].indent === this._indent; skip()) {
            const next = this._list[search];
            const offset = merged.length;
            merged.push(...next.parameters[0]);
            // Its When branches count on from the choices before it.
            for (let i = search + 1; this._list[i] && (BRANCH_CODES.includes(this._list[i].code) || this._list[i].indent !== this._indent); i++) {
                if (this._list[i].code === 402 && this._list[i].indent === this._indent) this._list[i].parameters[0] += offset;
            }
            const c = next.parameters[1];
            if (c === -2) cancel = -2;
            else if (c >= 0) cancel = c + offset;
            this._list.splice(search, 1);
        }
        first.parameters = [merged, cancel].concat(params.slice(2));
        return first.parameters;
    };

    const _setupChoices = Game_Interpreter.prototype.setupChoices;
    Game_Interpreter.prototype.setupChoices = function(params) {
        if (LARGE) params = this.rrCombineChoices(params);
        _setupChoices.call(this, params);
        if (OPTIONS) this.rrApplyChoiceOptions();
    };

    Game_Interpreter.prototype.rrApplyChoiceOptions = function() {
        const o = options();
        const original = $gameMessage._choices.slice();
        original.forEach((text, i) => {
            const texts = o.text[i + 1];
            if (!texts) return;
            for (const [t, met] of texts.slice().reverse()) if (met) { original[i] = t; break; }
        });
        const map = [], choices = [], enabled = [];
        original.forEach((text, i) => {
            if (o.hidden[i + 1]) return;
            map.push(i);
            choices.push(text);
            enabled.push(!o.condition[i + 1]);
        });
        let cancel = $gameMessage._choiceCancelType;
        // A cancel choice that is hidden or disabled leaves the list without a cancel.
        if (cancel >= 0) cancel = o.hidden[cancel + 1] || o.condition[cancel + 1] ? -1 : map.indexOf(cancel);
        $gameMessage._choices = choices;
        $gameMessage._choiceCancelType = cancel;
        $gameMessage._choiceDefaultType = Math.max(map.indexOf($gameMessage._choiceDefaultType), $gameMessage._choiceDefaultType < 0 ? -1 : 0);
        $gameMessage._rrChoiceMap = map;
        $gameMessage._rrChoiceEnabled = enabled;
        $gameMessage.setChoiceCallback(n => {
            this._branch[this._indent] = n >= 0 ? (map[n] ?? n) : n;
        });
    };

    const _makeCommandList = Window_ChoiceList.prototype.makeCommandList;
    Window_ChoiceList.prototype.makeCommandList = function() {
        const enabled = $gameMessage._rrChoiceEnabled;
        if (!enabled) return _makeCommandList.call(this);
        $gameMessage.choices().forEach((choice, i) => this.addCommand(choice, 'choice', enabled[i] !== false));
    };
    const _drawItem = Window_ChoiceList.prototype.drawItem;
    Window_ChoiceList.prototype.drawItem = function(index) {
        const map = $gameMessage._rrChoiceMap;
        if (!map) return _drawItem.call(this, index);
        const o = options(), n = map[index] + 1, on = this.isCommandEnabled(index);
        const color = on ? o.color[n] : o.disable_color[n];
        this._rrChoiceColor = color !== undefined ? ColorManager.textColor(color) : ColorManager.normalColor();
        this.changePaintOpacity(on);
        _drawItem.call(this, index);
        this.changePaintOpacity(true);
        this._rrChoiceColor = null;
    };
    // The choice's colour survives the text drawing's font reset, as the original's empty reset_font_settings kept it.
    const _resetTextColor = Window_ChoiceList.prototype.resetTextColor;
    Window_ChoiceList.prototype.resetTextColor = function() {
        _resetTextColor.call(this);
        if (this._rrChoiceColor) this.changeTextColor(this._rrChoiceColor);
    };
})();
