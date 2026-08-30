/**
 * RRMessageBoxes - reading and writing a run of Show Text commands.
 *
 * A "message" on disk is not one command. It is a `101` header carrying
 * [faceName, faceIndex, background, positionType, speakerName], followed by one
 * `401` per line of text. Several of those in a row is what the player sees as
 * consecutive message boxes, and each header is independent - adjacent boxes
 * can have different faces, positions and names, and in real authored data
 * they often do.
 *
 * Three editors each had their own copy of "walk forward over the 401s, splice,
 * put the new commands back": EventCommandList (twice, insert and edit) and
 * DatabaseCommonEventEditor. DatabaseTroopEditor had none, which is why a Show
 * Text inside a battle event could not be opened at all. One implementation
 * here, three callers.
 *
 * On splitting: MZ's Batch Entry divides overflow text into boxes of the
 * message window's height. That height is four in vanilla, but MessageCore's
 * `MessageRows` parameter owns it once that plugin is enabled, so the row count
 * is passed in rather than assumed - see RRTextCodes.messageRows.
 */
(function (root) {
    'use strict';

    const SHOW_TEXT = 101;
    const TEXT_LINE = 401;

    /** A header's parameters, defaulted the way the runtime reads them. */
    function readHeader(command) {
        const parameters = (command && command.parameters) || [];
        return {
            faceName: parameters[0] || '',
            faceIndex: parameters[1] || 0,
            background: parameters[2] || 0,
            // 0 is Top, which is falsy - `||` here would silently rewrite every
            // top-positioned message to Bottom.
            positionType: parameters[3] ?? 2,
            speakerName: parameters[4] || ''
        };
    }

    function headerParameters(header) {
        return [
            header.faceName || '',
            header.faceIndex || 0,
            header.background || 0,
            header.positionType ?? 2,
            header.speakerName || ''
        ];
    }

    function sameHeader(a, b) {
        return a.faceName === b.faceName
            && a.faceIndex === b.faceIndex
            && a.background === b.background
            && a.positionType === b.positionType
            && a.speakerName === b.speakerName;
    }

    /**
     * Read the whole run of consecutive Show Text boxes starting at `index`.
     *
     * Returns the boxes and the index of the last command belonging to the run,
     * so a caller can splice `endIndex - index + 1` commands out. Reading the
     * entire run - rather than only the first box - is what lets one dialog
     * edit several boxes at once without guessing whether they were meant to be
     * together: every header is carried along, so writing them back reproduces
     * whatever was there.
     */
    function collectRun(list, index) {
        const boxes = [];
        let cursor = index;

        while (cursor < list.length && list[cursor] && list[cursor].code === SHOW_TEXT) {
            const command = list[cursor];
            const lines = [];
            cursor++;
            while (cursor < list.length && list[cursor] && list[cursor].code === TEXT_LINE) {
                lines.push(list[cursor].parameters[0] || '');
                cursor++;
            }
            // `source` is what was on disk; an untouched box writes it back
            // as it was rather than re-split at the window height (see
            // buildCommands), so opening and OK-ing a run changes nothing.
            boxes.push({ header: readHeader(command), lines, indent: command.indent || 0, source: lines.slice() });
        }

        return { boxes, endIndex: cursor - 1, count: cursor - index };
    }

    /**
     * Read only the box at `index`, ignoring any that follow.
     * Kept for callers that deliberately want single-box behaviour.
     */
    function collectOne(list, index) {
        const run = collectRun(list, index);
        if (!run.boxes.length) return { boxes: [], endIndex: index, count: 0 };
        const first = run.boxes[0];
        return { boxes: [first], endIndex: index + first.lines.length, count: first.lines.length + 1 };
    }

    /**
     * Split a box's lines into as many boxes as the window height requires.
     *
     * Trailing blank lines are dropped before splitting so that a four-row
     * window does not turn "two lines and two stray newlines" into two boxes,
     * one of them empty. Interior blanks are kept - a deliberate blank line in
     * the middle of a message is content.
     */
    function splitLines(lines, rows) {
        const height = Math.max(1, Number(rows) || 4);
        const trimmed = lines.slice();
        while (trimmed.length && !String(trimmed[trimmed.length - 1]).length) trimmed.pop();
        if (!trimmed.length) return [[]];

        const chunks = [];
        for (let start = 0; start < trimmed.length; start += height) {
            chunks.push(trimmed.slice(start, start + height));
        }
        return chunks;
    }

    /**
     * Turn boxes back into commands.
     *
     * Each box emits its header and one 401 per line through the last non-empty
     * line, so an interior blank survives the round trip and a trailing one does
     * not. A box with no text at all still emits its header: an author who added
     * an empty box meant to add a box, and dropping it silently would be the
     * same class of bug as the four-line truncation this replaces.
     */
    function buildCommands(boxes, indent, rows) {
        const commands = [];
        const baseIndent = indent || 0;

        for (const box of boxes) {
            if (untouched(box)) {
                commands.push({ code: SHOW_TEXT, indent: baseIndent, parameters: headerParameters(box.header) });
                for (const line of box.source) {
                    commands.push({ code: TEXT_LINE, indent: baseIndent, parameters: [line] });
                }
                continue;
            }
            const chunks = rows ? splitLines(box.lines, rows) : [box.lines];
            for (const chunk of chunks) {
                commands.push({
                    code: SHOW_TEXT,
                    indent: baseIndent,
                    parameters: headerParameters(box.header)
                });

                let last = -1;
                for (let i = 0; i < chunk.length; i++) {
                    if (String(chunk[i]).length) last = i;
                }
                for (let i = 0; i <= last; i++) {
                    commands.push({
                        code: TEXT_LINE,
                        indent: baseIndent,
                        parameters: [chunk[i] || '']
                    });
                }
            }
        }

        return commands;
    }

    /** True when a box still holds exactly the lines it was read with. */
    function untouched(box) {
        const source = box && box.source;
        if (!Array.isArray(source) || !Array.isArray(box.lines)) return false;
        if (source.length !== box.lines.length) return false;
        return source.every((line, i) => String(line) === String(box.lines[i]));
    }

    /** A fresh box, inheriting a header so "add box" continues the conversation. */
    function newBox(header) {
        return {
            header: header
                ? { ...header }
                : { faceName: '', faceIndex: 0, background: 0, positionType: 2, speakerName: '' },
            lines: ['']
        };
    }

    const api = {
        SHOW_TEXT,
        TEXT_LINE,
        readHeader,
        headerParameters,
        sameHeader,
        collectRun,
        collectOne,
        splitLines,
        buildCommands,
        untouched,
        newBox
    };

    root.RRMessageBoxes = api;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
})(typeof window !== 'undefined' ? window : globalThis);
