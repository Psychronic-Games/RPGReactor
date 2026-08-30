/**
 * RRTextCodes - the message text-code catalogue, and the one place that knows
 * which codes a given project actually understands.
 *
 * Three tiers, and they are not the same kind of fact:
 *
 *   1. The vanilla set is a property of the runtime on disk. Every entry below
 *      is implemented in `runtime/reactor_windows.js`: `convertEscapeCharacters`
 *      (:293) handles \V \N \P \G, `Window_Base.processEscapeCharacter` (:370)
 *      handles \C \I \PX \PY \FS \{ \}, and `Window_Message.processEscapeCharacter`
 *      (:5126) adds the message-only pacing codes \$ \. \| \! \> \< \^. The list
 *      is transcribed from those switch statements rather than from
 *      documentation, so it says what this engine does rather than what MZ's
 *      help says it does. (They agree today. That is worth knowing rather than
 *      assuming.)
 *
 *   2. The MessageCore set is a property of an installed plugin, and only real
 *      when that plugin is enabled. Everything here was verified present in
 *      VisuMZ_1_MessageCore v1.54 before being written down. It is static
 *      because these codes are compiled into the plugin's own handlers - no
 *      project can add or remove one.
 *
 *   3. The customizable set is a property of *this project's* plugin
 *      parameters. MessageCore builds \Class[x], \Skill[x], \LastGainObj and
 *      the rest out of the `TextCodeActions` and `TextCodeReplace` arraystructs,
 *      which a project can edit. Reading them (`readCustom`) is therefore the
 *      only correct answer; a hardcoded list would show codes a project deleted
 *      and hide ones it added.
 *
 * On translation: `label` is short UI chrome and is routed through I18n by the
 * callers, so those literals live in RR_TEXT_TRANSLATIONS. `detail` is
 * reference documentation quoted from the engine and plugin help, and is
 * rendered verbatim in English - the same treatment the Plugin Manager already
 * gives a plugin's @help text, which is likewise author prose the editor does
 * not translate. Keep `detail` out of any tt()/I18n.tText call: the i18n source
 * audit walks catalogue arrays that flow into those helpers and would demand
 * all seventeen locales for every sentence here.
 *
 * Entry shape:
 *   code    what the author ends up typing, with `n` for a numeric argument
 *   label   MZ's own shipped label where MZ has one (Dialog_ControlCharacterSelector)
 *   detail  one-line reference text, English, see above
 *   insert  text written at the caret; `{n}` marks a placeholder to select
 *   param   what to prompt with: 'variable'|'color'|'icon'|'number'|'text'|null
 *   scope   'global' (any window) | 'message' | 'choice' | 'namebox'
 */
(function (root) {
    'use strict';

    // ------------------------------------------------------------- tier one
    // Order follows MZ's own Dialog_ControlCharacterSelector, so an author who
    // knows that dialog finds the same codes in the same places. MZ omits \\
    // from its selector; it is included here because this editor's reference
    // panel is a list of what exists, not a copy of MZ's menu.
    const VANILLA = Object.freeze([
        { code: '\\V[n]', label: 'Variable', param: 'variable', insert: '\\V[{n}]', scope: 'global',
            detail: 'Replaced with the value of the nth variable.' },
        { code: '\\N[n]', label: 'Actor', param: 'number', insert: '\\N[{n}]', scope: 'global',
            detail: 'Replaced with the name of the nth actor.' },
        { code: '\\P[n]', label: 'Party Member', param: 'number', insert: '\\P[{n}]', scope: 'global',
            detail: 'Replaced with the name of the nth party member, in marching order.' },
        { code: '\\G', label: 'Currency', param: null, insert: '\\G', scope: 'global',
            detail: 'Replaced with the currency unit.' },
        { code: '\\C[n]', label: 'Text Color', param: 'color', insert: '\\C[{n}]', scope: 'global',
            detail: 'Draws the subsequent text in colour n, sampled from the windowskin.' },
        { code: '\\I[n]', label: 'Icon', param: 'icon', insert: '\\I[{n}]', scope: 'global',
            detail: 'Draws icon n from img/system/IconSet.png.' },
        { code: '\\{', label: 'Increase Font Size', param: null, insert: '\\{', scope: 'global',
            detail: 'Increases the text size by one step.' },
        { code: '\\}', label: 'Decrease Font Size', param: null, insert: '\\}', scope: 'global',
            detail: 'Decreases the text size by one step.' },
        { code: '\\FS[n]', label: 'Change Font Size', param: 'number', insert: '\\FS[{n}]', scope: 'global',
            detail: 'Changes the text size to exactly n.' },
        { code: '\\PX[n]', label: 'Set X Coordinate', param: 'number', insert: '\\PX[{n}]', scope: 'global',
            detail: 'Sets the X position, with the top left of the window as the origin.' },
        { code: '\\PY[n]', label: 'Set Y Coordinate', param: 'number', insert: '\\PY[{n}]', scope: 'global',
            detail: 'Sets the Y position, with the top left of the window as the origin.' },
        { code: '\\$', label: 'Gold Window', param: null, insert: '\\$', scope: 'message',
            detail: 'Opens the gold window.' },
        { code: '\\.', label: 'Wait 1/4 Second', param: null, insert: '\\.', scope: 'message',
            detail: 'Waits a quarter second before continuing.' },
        { code: '\\|', label: 'Wait 1 Second', param: null, insert: '\\|', scope: 'message',
            detail: 'Waits a full second before continuing.' },
        { code: '\\!', label: 'Wait for Button Input', param: null, insert: '\\!', scope: 'message',
            detail: 'Waits for button input before continuing.' },
        { code: '\\>', label: 'Momentary Display of Line', param: null, insert: '\\>', scope: 'message',
            detail: 'Displays the rest of the line all at once.' },
        { code: '\\<', label: 'Cancel Momentary Display', param: null, insert: '\\<', scope: 'message',
            detail: 'Cancels the display-all-at-once effect.' },
        { code: '\\^', label: 'Do Not Wait for Input', param: null, insert: '\\^', scope: 'message',
            detail: 'Moves on after displaying the text without waiting for input.' },
        { code: '\\\\', label: 'Backslash', param: null, insert: '\\\\', scope: 'global',
            detail: 'Prints a literal backslash character.' }
    ]);

    // ------------------------------------------------------------- tier two
    // VisuMZ_1_MessageCore v1.54, grouped the way the plugin's own help groups
    // them, because that is how an author who read the help will look for them.
    const MESSAGE_CORE = Object.freeze([
        { id: 'formatting', title: 'Formatting', scope: 'global', codes: Object.freeze([
            { code: '<b>', detail: 'Makes subsequent text bold.' },
            { code: '</b>', detail: 'Removes bold from subsequent text.' },
            { code: '<i>', detail: 'Makes subsequent text italic.' },
            { code: '</i>', detail: 'Removes italic from subsequent text.' },
            { code: '<ColorLock>', detail: "Prevents text codes from changing the text colour for subsequent text." },
            { code: '</ColorLock>', detail: 'Removes the colour lock.' }
        ]) },
        // Word wrap is message-only, and both exclusions are from source rather
        // than from the docs, which call these Global.
        //
        // The choice window refuses outright: MessageCore defines
        // `Window_ChoiceList.isWordWrapEnabled = () => false`.
        //
        // The name box accepts the flag (it inherits Window_Base's
        // `isWordWrapEnabled`) but can never act on it. Its own geometry makes
        // wrapping unreachable: `windowWidth()` is `textSizeEx(this._name).width`
        // plus padding, so the window is always exactly as wide as its text, and
        // `windowHeight()` is `fittingHeight(1)` - one line, so a `<br>`-forced
        // second line is drawn outside the contents entirely.
        // The help window too: MessageCore opts Window_Help in by name. Not
        // a battle log line, which is drawn one line tall.
        { id: 'wordwrap', title: 'Word Wrap', scope: ['message', 'help'], codes: Object.freeze([
            { code: '<WordWrap>', detail: 'Enables word wrap for this window. Cannot be combined with alignment codes.' },
            { code: '</WordWrap>', detail: 'Disables word wrap for this window.' },
            // A synonym for </WordWrap> that works; its closing form does not
            // (stripped only inside the alignment branch), so it is not offered.
            { code: '<NoWordWrap>', detail: 'Disables word wrap for this window; same effect as </WordWrap>.' },
            { code: '<br>', detail: 'Adds a line break. Requires word wrap.' },
            // MessageCore's regex is /<(?:BR|LINEBREAK)>/gi - no space. The
            // documented `<line break>` paints mangled literal text under
            // word wrap and prints as written without it.
            { code: '<linebreak>', detail: 'Adds a line break. Requires word wrap. The spaced form <line break> does not work.' }
        ]) },
        // Alignment is deliberately not global, and not merged into the name
        // box family either. MessageCore matches these case-insensitively
        // (`/<CENTER>/gi`), so `<Left>` and `<left>` are the *same token* -
        // what it means depends on which window converts it. The message
        // window reads it as text alignment; Window_NameBox reads it as the
        // name box's own position, and has its own entries for that. Offering
        // both on a name box would show one token twice with two meanings.
        { id: 'alignment', title: 'Text Alignment', scope: ['message', 'choice', 'help', 'battlelog'], codes: Object.freeze([
            { code: '<left>', detail: 'Left-aligns subsequent text. Use at line start; not compatible with word wrap.' },
            { code: '</left>', detail: 'Removes left alignment.' },
            { code: '<center>', detail: 'Centres subsequent text. Use at line start; not compatible with word wrap.' },
            { code: '</center>', detail: 'Removes centre alignment.' },
            { code: '<right>', detail: 'Right-aligns subsequent text. Use at line start; not compatible with word wrap.' },
            { code: '</right>', detail: 'Removes right alignment.' }
        ]) },
        { id: 'casing', title: 'Auto Casing', scope: 'global', codes: Object.freeze([
            { code: '<Caps>', detail: 'Capitalises all following text.' },
            { code: '</Caps>', detail: 'Turns off auto text-casing.' },
            { code: '<Upper>', detail: 'Capitalises the first letter of each word.' },
            { code: '</Upper>', detail: 'Turns off auto text-casing.' },
            { code: '<Lower>', detail: 'Lowercases all following text.' },
            { code: '</Lower>', detail: 'Turns off auto text-casing.' },
            { code: '<Alt>', detail: 'Alternates upper and lower case, "HeLlO".' },
            { code: '</Alt>', detail: 'Turns off auto text-casing.' },
            { code: '<Chaos>', detail: 'Randomises upper and lower case per character.' },
            { code: '</Chaos>', detail: 'Turns off auto text-casing.' }
        ]) },
        // `drawBackCenteredPicture` sizes against `this.innerWidth`, or against
        // `itemHeight()` for a list window - so the message and choice windows
        // both work. Not the name box: it is sized to the width of the name and
        // one line tall, so the picture is cropped to the speaker's name. The
        // plugin's own help says to prefer icons in any window whose contents
        // change, which a name box's do on every message.
        { id: 'pictures', title: 'Pictures', scope: ['message', 'choice', 'help'], codes: Object.freeze([
            { code: '\\picture<x>', param: 'text', insert: '\\picture<{n}>',
                detail: 'Draws picture x (a filename) at the current text position.' },
            { code: '\\CenterPicture<x>', param: 'text', insert: '\\CenterPicture<{n}>',
                detail: 'Draws picture x centred in the window.' }
        ]) },
        { id: 'message', title: 'Message Window', scope: 'message', codes: Object.freeze([
            { code: '\\CommonEvent[x]', param: 'number', insert: '\\CommonEvent[{n}]',
                detail: 'Runs common event x when the code is reached.' },
            { code: '\\Wait[x]', param: 'number', insert: '\\Wait[{n}]',
                detail: 'Waits x frames before continuing.' },
            { code: '<Next Page>', detail: 'Ends the current message page at this line. Used when the window has five or more rows.' },
            { code: '<Auto>', detail: 'Resizes the window to fit the text. Resets window settings; no word wrap.' },
            { code: '<Auto Width>', detail: 'Resizes the window width to fit the text.' },
            { code: '<Auto Height>', detail: 'Resizes the window height to fit the text.' },
            { code: '<Auto Actor: x>', param: 'number', insert: '<Auto Actor: {n}>',
                detail: 'Resizes and positions the window over actor x.' },
            { code: '<Auto Party: x>', param: 'number', insert: '<Auto Party: {n}>',
                detail: 'Resizes and positions the window over party member x.' },
            { code: '<Auto Player>', detail: 'Map only. Positions the window over the player sprite.' },
            { code: '<Auto Event: x>', param: 'number', insert: '<Auto Event: {n}>',
                detail: 'Map only. Positions the window over event x.' },
            { code: '<Auto Enemy: x>', param: 'number', insert: '<Auto Enemy: {n}>',
                detail: 'Battle only. Positions the window over enemy x.' }
        ]) },
        { id: 'position', title: 'Message Position', scope: 'message', codes: Object.freeze([
            { code: '<Position: x, y, width, height>', param: 'text', insert: '<Position: {n}>',
                detail: 'Forces exact coordinates and dimensions. Not compatible with word wrap.' },
            { code: '<Coordinates: x, y>', param: 'text', insert: '<Coordinates: {n}>',
                detail: 'Forces exact coordinates. Not compatible with word wrap.' },
            { code: '<Dimensions: width, height>', param: 'text', insert: '<Dimensions: {n}>',
                detail: 'Forces an exact window size. Not compatible with word wrap.' },
            { code: '<Offset: +x, +y>', param: 'text', insert: '<Offset: {n}>',
                detail: 'Adjusts the window offset, replacing any previous offset.' }
        ]) },
        // Not 'global' despite MessageCore's docs calling it that: outside
        // battle every one of these resolves to the empty string, so offering
        // them on a map event is offering codes that erase themselves. They
        // appear where the message can actually run in battle - see forScope.
        { id: 'battle', title: 'Battle Only', scope: 'battle', codes: Object.freeze([
            { code: '<Current Battle Target>', detail: "Replaced with the current action's target. Empty outside battle." },
            { code: '<Current Battle User>', detail: 'Replaced with the currently active battler. Empty outside battle.' },
            { code: '<Current Battle Action>', detail: "Replaced with the current action's name, with its icon." },
            { code: '<Current Battle Action Name>', detail: "Replaced with the current action's name, without an icon." }
        ]) },
        { id: 'choice', title: 'Choice Window', scope: 'choice', codes: Object.freeze([
            { code: '<Show>', detail: 'Choice is always shown.' },
            { code: '<Show Switch: x>', param: 'number', insert: '<Show Switch: {n}>',
                detail: 'Shown if switch x is ON.' },
            { code: '<Show All Switches: x,x>', param: 'text', insert: '<Show All Switches: {n}>',
                detail: 'Shown if all the listed switches are ON.' },
            { code: '<Show Any Switches: x,x>', param: 'text', insert: '<Show Any Switches: {n}>',
                detail: 'Shown if any listed switch is ON.' },
            { code: '<Hide>', detail: 'Choice is always hidden.' },
            { code: '<Hide Switch: x>', param: 'number', insert: '<Hide Switch: {n}>',
                detail: 'Hidden if switch x is ON.' },
            { code: '<Hide All Switches: x,x>', param: 'text', insert: '<Hide All Switches: {n}>',
                detail: 'Hidden if all the listed switches are ON.' },
            { code: '<Hide Any Switches: x,x>', param: 'text', insert: '<Hide Any Switches: {n}>',
                detail: 'Hidden if any listed switch is ON.' },
            { code: '<Enable>', detail: 'Choice is always enabled.' },
            { code: '<Enable Switch: x>', param: 'number', insert: '<Enable Switch: {n}>',
                detail: 'Enabled if switch x is ON.' },
            { code: '<Enable All Switches: x,x>', param: 'text', insert: '<Enable All Switches: {n}>',
                detail: 'Enabled if all the listed switches are ON.' },
            { code: '<Enable Any Switches: x,x>', param: 'text', insert: '<Enable Any Switches: {n}>',
                detail: 'Enabled if any listed switch is ON.' },
            { code: '<Disable>', detail: 'Choice is always disabled.' },
            { code: '<Disable Switch: x>', param: 'number', insert: '<Disable Switch: {n}>',
                detail: 'Disabled if switch x is ON.' },
            { code: '<Choice Width: x>', param: 'number', insert: '<Choice Width: {n}>',
                detail: 'Sets the minimum text area width for the whole choice window.' },
            { code: '<Choice Indent: x>', param: 'number', insert: '<Choice Indent: {n}>',
                detail: 'Sets the indent for this choice only.' },
            // The drawing side opens with `if (!Imported.VisuMZ_0_CoreEngine)
            // { return; }` - the code is stripped from the choice text either
            // way, so without CoreEngine it silently does nothing.
            { code: '<BgColor: x>', param: 'color', insert: '<BgColor: {n}>',
                requires: 'VisuMZ_0_CoreEngine',
                detail: "Sets this choice's background to text colour x." },
            { code: '<BgColor: #rrggbb>', param: 'text', insert: '<BgColor: {n}>',
                requires: 'VisuMZ_0_CoreEngine',
                detail: "Sets this choice's background to a hex colour." },
            { code: '<Help> text </Help>', param: 'text', insert: '<Help>{n}</Help>',
                detail: 'Shows a help window with the given text while this choice is selected.' },
            { code: '<Shuffle>', detail: 'Shuffles the order of all choices.' },
            { code: '<Shuffle: x>', param: 'number', insert: '<Shuffle: {n}>',
                detail: 'Shuffles all choices and shows only x of them.' },
            { code: '<BgImg: filename>', param: 'text', insert: '<BgImg: {n}>',
                detail: 'Background image from img/pictures/, stretched across the choice rect.' },
            { code: '<FgImg: filename>', param: 'text', insert: '<FgImg: {n}>',
                detail: 'Foreground image from img/pictures/, drawn under the text.' }
        ]) },
        { id: 'namebox', title: 'Name Box', scope: 'namebox', codes: Object.freeze([
            { code: '<Left>', detail: 'Positions the name box to the left.' },
            { code: '<Center>', detail: 'Positions the name box to the centre.' },
            { code: '<Right>', detail: 'Positions the name box to the right.' },
            { code: '<Position: x>', param: 'number', insert: '<Position: {n}>',
                detail: 'Positions the name box by a value from 0 to 10.' }
        ]) },
        // `convertButtonAssistEscapeCharacters` wraps every one of these in
        // `if (Imported.VisuMZ_0_CoreEngine)`, so without that plugin the codes
        // are never replaced and print as literal text. The whole family is
        // gated rather than described as conditional: once it is listed, it
        // works, and the descriptions no longer have to say "requires".
        { id: 'controls', title: 'Button Assist', scope: 'global', requires: 'VisuMZ_0_CoreEngine',
            codes: Object.freeze([
                { code: '<Up Button>', detail: "Shows the Up button's assist text from CoreEngine." },
                { code: '<Left Button>', detail: "Shows the Left button's assist text from CoreEngine." },
                { code: '<Right Button>', detail: "Shows the Right button's assist text from CoreEngine." },
                { code: '<Down Button>', detail: "Shows the Down button's assist text from CoreEngine." },
                { code: '<Ok Button>', detail: "Shows the OK button's assist text from CoreEngine." },
                { code: '<Cancel Button>', detail: "Shows the Cancel button's assist text from CoreEngine." },
                { code: '<Shift Button>', detail: "Shows the Shift button's assist text from CoreEngine." },
                { code: '<Menu Button>', detail: "Shows the Menu button's assist text from CoreEngine." },
                { code: '<Page Up Button>', detail: "Shows the Page Up button's assist text from CoreEngine." },
                { code: '<Page Down Button>', detail: "Shows the Page Down button's assist text from CoreEngine." }
            ]) }
    ]);

    /**
     * Codes the map-name display understands.
     *
     * Not reachable through `forScope` - no surface asks for them yet. Whoever
     * wires one up must gate it on `VisuMZ_0_CoreEngine` *and* on that plugin's
     * own "Map Name Text Code" parameter being enabled, which is a second
     * condition none of the other families have.
     */
    const MAP_NAME = Object.freeze([
        { code: '<left>', detail: 'Aligns the map name to the left of the screen.' },
        { code: '<center>', detail: 'Centres the map name horizontally.' },
        { code: '<right>', detail: 'Aligns the map name to the right of the screen.' },
        { code: '<top>', detail: 'Aligns the map name to the top of the screen.' },
        { code: '<middle>', detail: 'Centres the map name vertically.' },
        { code: '<bottom>', detail: 'Aligns the map name to the bottom of the screen.' },
        { code: '<X: +n>', param: 'text', insert: '<X: {n}>', detail: 'Adjusts the horizontal position of the map name.' },
        { code: '<Y: +n>', param: 'text', insert: '<Y: {n}>', detail: 'Adjusts the vertical position of the map name.' }
    ]);

    // ----------------------------------------------------------- tier three
    // MessageCore's customizable codes. `TextCodeActions` runs a routine when
    // the code is reached; `TextCodeReplace` swaps the code for a string. Both
    // are arraystructs of JSON strings, so each element needs a second parse -
    // and a project that never opened the parameter leaves it as "", which is
    // falsy but not nullish. `||` rather than `??` throughout for that reason.
    function parseArrayStruct(raw) {
        let outer;
        try {
            outer = JSON.parse(raw || '[]');
        } catch (error) {
            return [];
        }
        if (!Array.isArray(outer)) return [];
        const parsed = [];
        for (const element of outer) {
            if (element && typeof element === 'object') {
                parsed.push(element);
                continue;
            }
            try {
                const inner = JSON.parse(element || '{}');
                if (inner && typeof inner === 'object') parsed.push(inner);
            } catch (error) {
                // A single malformed element should not cost the whole list.
            }
        }
        return parsed;
    }

    /**
     * What each stock customizable code does.
     *
     * The parameters carry a name and a match pattern but no prose, so a
     * project-read entry would otherwise be a bare code with nothing beside it.
     * Keyed by MessageCore's own `Match` name; anything absent - a code this
     * project invented, like the `heart` in the sample data - falls back to
     * saying honestly that it is project-defined rather than inventing a
     * meaning for it.
     */
    const CUSTOM_DETAIL = Object.freeze({
        ChangeFace: 'Changes the message face to filename x, index y.',
        FaceIndex: 'Changes the message face index to x.',
        TextDelay: 'Sets the per-character delay to x frames.',
        NormalBG: 'Changes the window background to normal.',
        DimBG: 'Changes the window background to dim.',
        TransparentBG: 'Changes the window background to transparent.',
        FontChange: 'Changes the font face to font name x.',
        ResetFont: 'Resets font settings.',
        ResetColor: 'Resets colour settings.',
        HexColor: 'Changes text colour to hex value x, for example #123abc.',
        OutlineColor: 'Changes the outline colour to text colour x.',
        OutlineHexColor: 'Changes the outline colour to hex value x.',
        OutlineWidth: 'Changes the outline width to x.',
        WindowMoveTo: 'Moves the window to exact coordinates. Format: targetX, targetY[, width, height, duration, easing].',
        WindowMoveBy: 'Moves the window by relative values. Same argument format as WindowMoveTo.',
        WindowReset: 'Resets the window to its original position.',
        ActorFace: "Inserts actor x's face into the message window.",
        PartyFace: "Inserts party member x's face into the message window.",
        Class: "Draws class x's icon, if it has one, and its name.",
        ClassName: "Draws class x's name only.",
        Skill: "Draws skill x's icon, if it has one, and its name.",
        SkillName: "Draws skill x's name only.",
        Item: "Draws item x's icon, if it has one, and its name.",
        ItemName: "Draws item x's name only.",
        ItemQuantity: "Inserts how many of item x the party owns.",
        Weapon: "Draws weapon x's icon, if it has one, and its name.",
        WeaponName: "Draws weapon x's name only.",
        WeaponQuantity: "Inserts how many of weapon x the party owns.",
        Armor: "Draws armor x's icon, if it has one, and its name.",
        ArmorName: "Draws armor x's name only.",
        ArmorQuantity: "Inserts how many of armor x the party owns.",
        LastGainObj: 'Draws the icon and name of the last object the party gained.',
        LastGainObjName: 'Draws the name of the last object the party gained.',
        LastGainObjQuantity: 'Inserts the quantity of the last object the party gained.',
        State: "Draws state x's icon, if it has one, and its name.",
        StateName: "Draws state x's name only.",
        Enemy: "Draws enemy x's icon, if it has one, and its name.",
        EnemyName: "Draws enemy x's name only.",
        Troop: "Draws troop x's icon, if it has one, and its name.",
        TroopName: "Draws troop x's name only.",
        TroopMember: "Draws troop member x's icon, if it has one, and its name. Battle only.",
        TroopMemberName: "Draws troop member x's name only. Battle only."
    });

    /**
     * MessageCore's stock customizable codes, as a fallback only.
     *
     * These are not hard-coded in the plugin - they are the shipped *defaults*
     * of TextCodeActions and TextCodeReplace. A project that registered
     * MessageCore through the Plugin Manager has them written into the
     * manifest and `readCustom` reports the real, possibly edited, set. This
     * list exists for the project that left the parameter empty, where the
     * plugin falls back to its own @default and the manifest cannot say so.
     * Name and argument shape only; the prose comes from CUSTOM_DETAIL.
     */
    const CUSTOM_DEFAULTS = Object.freeze([
        ['ChangeFace', 'text'], ['FaceIndex', 'number'], ['TextDelay', 'number'],
        ['NormalBG', null], ['DimBG', null], ['TransparentBG', null],
        ['FontChange', 'text'], ['ResetFont', null], ['ResetColor', null],
        ['HexColor', 'text'], ['OutlineColor', 'color'], ['OutlineHexColor', 'text'],
        ['OutlineWidth', 'number'], ['WindowMoveTo', 'text'], ['WindowMoveBy', 'text'],
        ['WindowReset', null],
        ['ActorFace', 'number'], ['PartyFace', 'number'],
        ['Class', 'number'], ['ClassName', 'number'], ['Skill', 'number'], ['SkillName', 'number'],
        ['Item', 'number'], ['ItemName', 'number'], ['ItemQuantity', 'number'],
        ['Weapon', 'number'], ['WeaponName', 'number'], ['WeaponQuantity', 'number'],
        ['Armor', 'number'], ['ArmorName', 'number'], ['ArmorQuantity', 'number'],
        ['LastGainObj', null], ['LastGainObjName', null], ['LastGainObjQuantity', null],
        ['State', 'number'], ['StateName', 'number'],
        ['Enemy', 'number'], ['EnemyName', 'number'],
        ['Troop', 'number'], ['TroopName', 'number'],
        ['TroopMember', 'number'], ['TroopMemberName', 'number']
    ]);

    /**
     * Turn one `Type:str` into the bracket shape and prompt kind.
     *
     * `Type` is not a friendly token - it is the regex fragment MessageCore
     * appends to the code name when it builds the matcher, so the real values
     * are '', '\\[(\\d+)\\]' and '\\<(.*?)\\>'. Reading it as a literal '[x]'
     * silently produced "no argument" for every code in the project.
     */
    function describeType(type) {
        const raw = String(type || '');
        if (!raw.trim()) return { takesArg: false, open: '', close: '', param: null };
        if (raw.includes('<')) return { takesArg: true, open: '<', close: '>', param: 'text' };
        return { takesArg: true, open: '[', close: ']', param: 'number' };
    }

    /**
     * Customizable codes that act on the message window rather than on
     * whatever window is drawing the text.
     *
     * Read out of this project's own parameters rather than assumed: the
     * `ActionJS` / `TextJS` bodies of exactly these five reference
     * `$gameMessage` or the message's typing delay, so typing one into a name
     * field would reach past the name box and change the *message*. MessageCore
     * documents the same five under "Message Window Only"; the code and the
     * docs agree, which is why this list is safe to hold by name.
     *
     * Everything else in the tier is a text replacement or a font/colour change
     * that acts on the drawing window, and is genuinely global.
     */
    const CUSTOM_MESSAGE_ONLY = Object.freeze(
        new Set(['ChangeFace', 'FaceIndex', 'TextDelay', 'ActorFace', 'PartyFace']));

    function customEntry(name, shape, kind) {
        const detail = CUSTOM_DETAIL[name]
            || "Project-defined text code, from this project's MessageCore parameters.";
        const scope = CUSTOM_MESSAGE_ONLY.has(name) ? 'message' : 'global';
        if (!shape.takesArg) {
            return { code: `\\${name}`, insert: `\\${name}`, param: null, scope, kind, detail };
        }
        return {
            code: `\\${name}${shape.open}x${shape.close}`,
            insert: `\\${name}${shape.open}{n}${shape.close}`,
            param: shape.param,
            scope,
            kind,
            detail
        };
    }

    /**
     * The customizable codes this project actually defines.
     *
     * The struct keys carry VisuMZ's type suffixes - `Match:str`, `Type:str` -
     * rather than bare names, and each array element is itself a JSON string,
     * so both layers need parsing. Returns [] when the parameters are absent or
     * empty, which is the signal for `forScope` to fall back to the defaults.
     */
    function readCustom(parameters) {
        if (!parameters || typeof parameters !== 'object') return [];
        const entries = [];
        const seen = new Set();

        const add = (struct, kind) => {
            const name = String(struct['Match:str'] || struct.Match || '').trim();
            if (!name || seen.has(name)) return;
            seen.add(name);
            entries.push(customEntry(name, describeType(struct['Type:str'] || struct.Type), kind));
        };

        for (const struct of parseArrayStruct(parameters['TextCodeActions:arraystruct'])) add(struct, 'action');
        for (const struct of parseArrayStruct(parameters['TextCodeReplace:arraystruct'])) add(struct, 'replace');
        return entries;
    }

    /** The shipped defaults, in the same entry shape `readCustom` produces. */
    function defaultCustom() {
        return CUSTOM_DEFAULTS.map(([name, param]) => customEntry(
            name,
            param === null
                ? { takesArg: false, open: '', close: '', param: null }
                : { takesArg: true, open: param === 'text' ? '<' : '[', close: param === 'text' ? '>' : ']', param },
            'default'
        ));
    }

    // ------------------------------------------------------------- manifest
    /**
     * Whether a plugin is present *and* enabled.
     *
     * Presence on disk is not the question - about a third of this project's
     * plugin files are unregistered, and a registered one can sit at
     * status:false. Both cases mean its codes will not work in game, so both
     * must read as absent here.
     */
    function findPlugin(plugins, name) {
        if (!Array.isArray(plugins)) return null;
        return plugins.find(plugin => plugin && plugin.name === name && plugin.status === true) || null;
    }

    function isEnabled(plugins, name) {
        return Boolean(findPlugin(plugins, name));
    }

    // Parsed manifests, keyed by path and invalidated by mtime. The editor
    // rewrites this file whenever the Plugin Manager saves.
    const manifestCache = new Map();

    /**
     * The project's plugin manifest, read from disk.
     *
     * The obvious source is `pluginManager.plugins`, but that array is empty
     * until the Plugin Manager window has been opened at least once - its
     * `loadPlugins` runs on show. A dialog that asked it on a fresh editor got
     * an empty list, decided MessageCore was absent, and quietly offered only
     * the vanilla codes with a four-row window. Reading the file is the only
     * answer that does not depend on where the author has already clicked.
     *
     * `reactor_plugins.js` is the live manifest; `plugins.js` is the abandoned
     * MZ-era one, checked only as a fallback for a project that predates the
     * Reactor runtime.
     */
    function readManifest(projectPath) {
        if (!projectPath || typeof require !== 'function') return [];
        let fs;
        let path;
        try {
            fs = require('fs');
            path = require('path');
        } catch (error) {
            return [];
        }

        for (const name of ['reactor_plugins.js', 'plugins.js']) {
            const file = path.join(projectPath, 'js', name);
            let mtimeMs;
            try {
                if (!fs.existsSync(file)) continue;
                mtimeMs = fs.statSync(file).mtimeMs;
            } catch (error) {
                continue;
            }

            const cached = manifestCache.get(file);
            if (cached && cached.mtimeMs === mtimeMs) return cached.plugins;

            try {
                const text = fs.readFileSync(file, 'utf8');
                const match = text.match(/var\s+\$plugins\s*=\s*(\[[\s\S]*\]);/);
                const plugins = match ? JSON.parse(match[1]) : [];
                manifestCache.set(file, { mtimeMs, plugins });
                return plugins;
            } catch (error) {
                // A manifest mid-write, or hand-edited into invalid JSON. Say
                // nothing rather than throwing out of a dialog's constructor.
                return [];
            }
        }
        return [];
    }

    function readGeneralStruct(plugins) {
        const core = findPlugin(plugins, 'VisuMZ_1_MessageCore');
        const raw = core && core.parameters && core.parameters['General:struct'];
        if (!raw) return null;
        try {
            return typeof raw === 'string' ? JSON.parse(raw) : raw;
        } catch (error) {
            return null;
        }
    }

    /**
     * How many lines fit in one message box.
     *
     * MessageCore's General struct owns the row count once it is enabled, and a
     * project that raised it past four expects boxes of that height. Falling
     * back to four is the vanilla window, which is also what MZ's Batch Entry
     * assumes unconditionally.
     */
    function messageRows(plugins) {
        const general = readGeneralStruct(plugins);
        const rows = Number(general && general['MessageRows:num']);
        return Number.isFinite(rows) && rows >= 1 ? Math.floor(rows) : 4;
    }

    // Window_Base.itemPadding/padding and the face slab, as the runtime lays
    // them out. These decide where the editor's guide line belongs.
    const DEFAULT_MESSAGE_WIDTH = 816;
    const FACE_WIDTH = 144;
    const WINDOW_PADDING = 4;
    const TEXT_PADDING = 8;

    /**
     * The width, in pixels, that text actually gets inside the message window -
     * which is what the editor's guide line has to mark. A face eats a fixed
     * slab off the left, so the guide moves when one is set.
     */
    function messageTextWidth(plugins, hasFace) {
        const general = readGeneralStruct(plugins);
        const configured = Number(general && general['MessageWidth:num']);
        const width = Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_MESSAGE_WIDTH;
        let inner = width - (WINDOW_PADDING + TEXT_PADDING) * 2;
        if (hasFace) inner -= FACE_WIDTH + TEXT_PADDING;
        return Math.max(0, inner);
    }

    /** Word wrap makes a per-line width guide meaningless; say so explicitly. */
    function hasWordWrap(text) {
        return /<\s*WordWrap\s*>/i.test(String(text || ''));
    }

    /**
     * Everything that applies to one surface, in display order.
     *
     * `scope` filters the tiers: a Show Text field wants 'message', a name box
     * wants 'namebox', a choice field wants 'choice', and every surface wants
     * 'global'.
     *
     * `options.inBattle` additionally admits the battle-only codes. That is a
     * property of *where the event runs*, not of the field, so the host has to
     * say: a troop page always runs in battle, a map event page never does, and
     * a common event can be called from either - which is why common events get
     * them (a code that resolves to nothing is a smaller cost than a code an
     * author needs and cannot find).
     */
    /*
     * `%1`-style placeholders are not text codes: a skill or state message
     * is a format string, filled before drawTextEx sees a backslash, and how
     * many arguments it gets differs per field. Listed per field so that a
     * `%2` is never offered where it would print literally.
     */
    const FORMAT_ARGS = Object.freeze({
        skillMessage: Object.freeze([
            { code: '%1', detail: 'The name of the battler using the skill.' },
            { code: '%2', detail: 'The name of the skill being used.' }
        ]),
        stateMessage: Object.freeze([
            { code: '%1', detail: 'The name of the affected battler. %2 is not replaced here.' }
        ])
    });

    function forScope(scope, plugins, options) {
        const wanted = new Set(['global', scope]);
        if (options && options.inBattle) wanted.add('battle');
        const groups = [];
        const placeholders = options && options.formatArgs ? FORMAT_ARGS[options.formatArgs] : null;
        if (placeholders) {
            groups.push({ id: 'format', title: 'Placeholders', plugin: null, codes: placeholders });
        }
        groups.push({
            id: 'vanilla',
            title: 'Control Characters',
            plugin: null,
            codes: VANILLA.filter(entry => wanted.has(entry.scope))
        });

        // A family may name more than one scope - alignment applies to the
        // message and choice windows but not the name box.
        const applies = scopes => (Array.isArray(scopes)
            ? scopes.some(one => wanted.has(one))
            : wanted.has(scopes));

        // Some codes MessageCore documents are implemented behind a check for
        // another plugin, and do nothing without it - a whole family in the
        // case of button assist, two entries in the case of choice background
        // colours. `requires` names that plugin, at either level.
        const satisfied = name => !name || isEnabled(plugins, name);

        if (isEnabled(plugins, 'VisuMZ_1_MessageCore')) {
            for (const family of MESSAGE_CORE) {
                if (!applies(family.scope)) continue;
                if (!satisfied(family.requires)) continue;
                const codes = family.codes.filter(entry => satisfied(entry.requires));
                if (!codes.length) continue;
                groups.push({
                    id: family.id,
                    title: family.title,
                    plugin: 'VisuMZ_1_MessageCore',
                    codes
                });
            }
            const core = findPlugin(plugins, 'VisuMZ_1_MessageCore');
            const fromProject = readCustom(core && core.parameters);
            // Filtered per entry rather than per family: this tier is a mix,
            // and the five message-window ones must not reach a name field.
            const custom = (fromProject.length ? fromProject : defaultCustom())
                .filter(entry => applies(entry.scope) && satisfied(entry.requires));
            if (custom.length) {
                groups.push({
                    id: 'custom',
                    title: 'Project Text Codes',
                    plugin: 'VisuMZ_1_MessageCore',
                    fromProject: fromProject.length > 0,
                    codes: custom
                });
            }
        }

        return groups;
    }

    const api = {
        VANILLA,
        MESSAGE_CORE,
        FORMAT_ARGS,
        MAP_NAME,
        forScope,
        readCustom,
        defaultCustom,
        describeType,
        parseArrayStruct,
        isEnabled,
        findPlugin,
        readManifest,
        messageRows,
        messageTextWidth,
        hasWordWrap,
        DEFAULT_MESSAGE_WIDTH,
        FACE_WIDTH
    };

    root.RRTextCodes = api;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
})(typeof window !== 'undefined' ? window : globalThis);
