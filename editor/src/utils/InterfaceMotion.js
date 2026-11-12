/**
 * InterfaceMotion - pictures as a User Interfaces element's look, and motion for an element.
 *
 * `interfaceMotionApi` is the game's own function (runtime/reactor_ui.js; the text between the markers is
 * identical, and a test pins it), so the Database canvas draws a picture fill, a sheet's frame and a moving
 * element from the numbers the game uses: the settings and their ranges, the pose at a given update, the frame
 * of a sheet, where a picture's pieces go.
 */
(function(root) {
    'use strict';

    // <interface-motion>
    // The same text stands in editor/src/utils/InterfaceMotion.js (a test pins the two), so the editor's canvas
    // draws a picture fill, a frame and a moving element with the numbers the game uses.
    /**
     * Pictures as an element's look, and motion for an element: the settings, and the maths the game and the
     * editor's canvas both draw from. Nothing here touches a window, a sprite or a canvas.
     *
     * A node's `motion` is absent when nothing moves; else it holds any of the keys of DEFAULTS. Time is `age`,
     * the game updates (60 a second) since the element was shown.
     */
    function interfaceMotionApi() {
        /** Nodes that can move: the ones drawn in a window of their own. */
        const MOTION_TYPES = ["box", "image", "text", "button", "list", "gauge", "input"];
        /** Nodes that can also grow and turn about their center (a list's rows are cut to its frame, which does not turn). */
        const TURN_TYPES = ["box", "image", "text", "button", "gauge", "input"];
        /** Nodes that take focus, so can react to it. */
        const FOCUS_TYPES = ["button", "input"];
        /** Image sources that are one whole picture, which frames cut up and drift scrolls. */
        const FRAME_SOURCES = ["picture", "system", "title1", "title2"];
        /** Nodes whose background can be a picture. */
        const FILL_TYPES = ["box", "button", "list", "input"];
        const FILL_FITS = ["stretch", "contain", "tile", "slice"];
        const FRAME_MODES = ["loop", "once", "pingpong"];
        const TAU = Math.PI * 2;
        /** Each setting: [default, least, most]. A setting at its default does nothing. */
        const RANGES = {
            cols: [1, 1, 64], rows: [1, 1, 64], frameCount: [0, 0, 4096], fps: [8, 1, 60],
            floatX: [0, -2000, 2000], floatY: [0, -2000, 2000], floatPeriod: [120, 2, 3600], floatOffset: [0, 0, 3600],
            pulseFrom: [100, 10, 400], pulseTo: [100, 10, 400], pulsePeriod: [120, 2, 3600], pulseOffset: [0, 0, 3600],
            spin: [0, -1440, 1440],
            swayAngle: [0, -180, 180], swayPeriod: [120, 2, 3600], swayOffset: [0, 0, 3600],
            fadeFrom: [255, 0, 255], fadeTo: [255, 0, 255], fadePeriod: [120, 2, 3600], fadeOffset: [0, 0, 3600],
            driftX: [0, -2000, 2000], driftY: [0, -2000, 2000],
            appearX: [0, -4000, 4000], appearY: [0, -4000, 4000], appearScale: [100, 0, 400], appearOpacity: [255, 0, 255],
            appearDuration: [20, 1, 600], appearDelay: [0, 0, 600],
            focusScale: [100, 50, 200], focusX: [0, -200, 200], focusY: [0, -200, 200]
        };
        const KEYS = Object.keys(RANGES);
        const DEFAULTS = { frameMode: "loop" };
        for (const key of KEYS) DEFAULTS[key] = RANGES[key][0];

        /** What a motion does, as flags: read once when an element is made. */
        function traits(m) {
            const frames = !!m && m.cols * m.rows > 1;
            const drift = !!m && !frames && (m.driftX !== 0 || m.driftY !== 0);
            const turns = !!m && (m.pulseFrom !== 100 || m.pulseTo !== 100 || m.spin !== 0 || m.swayAngle !== 0);
            const idle = !!m && (turns || m.floatX !== 0 || m.floatY !== 0 || m.fadeFrom !== 255 || m.fadeTo !== 255);
            const appear = !!m && (m.appearX !== 0 || m.appearY !== 0 || m.appearScale !== 100 || m.appearOpacity !== 255);
            const focus = !!m && (m.focusScale !== 100 || m.focusX !== 0 || m.focusY !== 0);
            return { frames, drift, idle, appear, focus, centered: turns || (!!m && (m.appearScale !== 100 || m.focusScale !== 100)),
                // Whether the node itself is moved, grown, turned or faded (a sheet's frames and a drift happen inside it).
                moves: idle || appear || focus };
        }

        /**
         * Carrying. A node's motion and its Angle carry every node placed inside it, at any depth: moved with it,
         * grown and turned about its center, faded by its opacity. A carry is the sum of a node's ancestors, written
         * as one transform: a point (x, y) of the layout lands at (a*x - b*y + tx, b*x + a*y + ty), and what stands
         * there is `scale` times its size, turned by `turn` degrees and `alpha` times as opaque.
         */
        function newCarry() {
            return { a: 1, b: 0, tx: 0, ty: 0, scale: 1, turn: 0, alpha: 1 };
        }

        /** A carry that moves nothing. */
        function carryStart(out) {
            out.a = 1; out.b = 0; out.tx = 0; out.ty = 0; out.scale = 1; out.turn = 0; out.alpha = 1;
            return out;
        }

        /**
         * Adds one ancestor to a carry, outermost first: the ancestor's center (cx, cy) in the layout, and its
         * own offset, size, turn (its Angle and its motion's, in degrees) and opacity.
         */
        function carryInto(out, cx, cy, dx, dy, scale, turn, alpha) {
            const r = turn * Math.PI / 180, la = scale * Math.cos(r), lb = scale * Math.sin(r);
            const lx = cx + dx - (la * cx - lb * cy), ly = cy + dy - (lb * cx + la * cy);
            const a = out.a, b = out.b;
            out.tx += a * lx - b * ly;
            out.ty += b * lx + a * ly;
            out.a = a * la - b * lb;
            out.b = b * la + a * lb;
            out.scale *= scale;
            out.turn += turn;
            out.alpha *= alpha;
            return out;
        }

        /** Where a point of the layout is drawn under a carry. */
        function carryPoint(carry, x, y, out) {
            out.x = carry.a * x - carry.b * y + carry.tx;
            out.y = carry.b * x + carry.a * y + carry.ty;
            return out;
        }

        /** The point of the layout that is drawn at (x, y): carryPoint undone. */
        function carryBack(carry, x, y, out) {
            const d = carry.a * carry.a + carry.b * carry.b || 1, px = x - carry.tx, py = y - carry.ty;
            out.x = (carry.a * px + carry.b * py) / d;
            out.y = (carry.a * py - carry.b * px) / d;
            return out;
        }

        /** A movement on the screen as a movement in the layout under a carry (a drag of a carried node). */
        function carryDeltaBack(carry, dx, dy, out) {
            const d = carry.a * carry.a + carry.b * carry.b || 1;
            out.x = (carry.a * dx + carry.b * dy) / d;
            out.y = (carry.a * dy - carry.b * dx) / d;
            return out;
        }

        /**
         * A carried node as it is drawn: its ancestors' carry, then its own offset, size, turn and opacity about
         * its own center (cx, cy). Written into `out` as x, y (where its center is drawn), scale, turn and alpha.
         */
        function carried(carry, cx, cy, dx, dy, scale, turn, alpha, out) {
            carryPoint(carry, cx + dx, cy + dy, out);
            out.scale = carry.scale * scale;
            out.turn = carry.turn + turn;
            out.alpha = carry.alpha * alpha;
            return out;
        }

        /** Whether a node with this Angle and motion carries what is inside it anywhere but where the layout put it. */
        function carries(angle, m) {
            return !!angle || (!!m && traits(m).moves);
        }

        /**
         * A node's motion with every setting in range, or null when nothing would move. `type` is the node's
         * type and `source` an Image node's source: what a node of that kind cannot do is switched off.
         */
        function normalize(raw, type, source) {
            if (!raw || typeof raw !== "object" || !MOTION_TYPES.includes(type)) return null;
            const m = {};
            for (const key of KEYS) {
                const range = RANGES[key], value = Number(raw[key]);
                m[key] = Number.isFinite(value) ? Math.min(range[2], Math.max(range[1], Math.round(value))) : range[0];
            }
            m.frameMode = FRAME_MODES.includes(raw.frameMode) ? raw.frameMode : "loop";
            const off = keys => { for (const key of keys) m[key] = DEFAULTS[key]; };
            if (type !== "image" || !FRAME_SOURCES.includes(source || "picture")) off(["cols", "rows", "frameCount", "fps", "frameMode", "driftX", "driftY"]);
            if (!TURN_TYPES.includes(type)) off(["pulseFrom", "pulseTo", "spin", "swayAngle", "appearScale", "focusScale"]);
            if (!FOCUS_TYPES.includes(type)) off(["focusScale", "focusX", "focusY"]);
            m.frameCount = Math.min(m.frameCount, m.cols * m.rows);
            const t = traits(m);
            return t.frames || t.drift || t.idle || t.appear || t.focus ? m : null;
        }

        /** A motion as it is stored: only the settings that are not at their default; null when there are none. */
        function compact(m) {
            if (!m) return null;
            const stored = {};
            for (const key of Object.keys(DEFAULTS)) if (m[key] !== undefined && m[key] !== DEFAULTS[key]) stored[key] = m[key];
            return Object.keys(stored).length ? stored : null;
        }

        /** Which frame of `count` shows after `age` updates, each frame held for `hold` updates. */
        function frameAt(age, count, hold, mode) {
            if (!(count > 1)) return 0;
            const step = Math.floor(Math.max(0, age) / Math.max(hold, 1e-6));
            if (mode === "once") return Math.min(step, count - 1);
            if (mode === "pingpong") {
                const turn = step % (2 * (count - 1));
                return turn < count ? turn : 2 * (count - 1) - turn;
            }
            return step % count;
        }

        /** How many frames a sheet plays: its count, or every cell. */
        function frameTotal(m) {
            return m.frameCount > 0 ? Math.min(m.frameCount, m.cols * m.rows) : m.cols * m.rows;
        }

        /** The cell of frame `index` in a sheet of `cols` by `rows`, read left to right, top to bottom. */
        function frameRect(index, cols, rows, width, height, out) {
            const fw = Math.floor(width / cols), fh = Math.floor(height / rows);
            out.x = (index % cols) * fw;
            out.y = Math.floor(index / cols) * fh;
            out.width = fw;
            out.height = fh;
            return out;
        }

        /** Where an Image node's picture of sw x sh stands in its box of dw x dh, by its Fit. */
        function fitRect(fit, sw, sh, dw, dh, out) {
            out.x = 0; out.y = 0; out.width = sw; out.height = sh;
            if (fit === "stretch") { out.width = dw; out.height = dh; }
            else if (fit === "contain" && sw > 0 && sh > 0) {
                const scale = Math.min(dw / sw, dh / sh);
                out.width = Math.round(sw * scale);
                out.height = Math.round(sh * scale);
                out.x = Math.floor((dw - out.width) / 2);
                out.y = Math.floor((dh - out.height) / 2);
            }
            return out;
        }

        const wave = (age, period, offset) => Math.sin((age + offset) / period * TAU);
        /** From 0 up to 1 and back, starting at 0. */
        const swing = (age, period, offset) => 0.5 - 0.5 * Math.cos((age + offset) / period * TAU);

        /**
         * Where an element is after `age` updates: written into `out` as dx, dy (pixels from its place), scale
         * (1 is its size), turn (degrees added to its Angle), alpha (0-1, times its opacity), frame (the sheet
         * frame) and driftX, driftY (how far its picture has scrolled). `focus` is 0-1, how far it has gone
         * toward its focused look; `leave` is how far the interface has closed, 0 to 1 (below 0: it is not
         * closing), which runs Appear backward over the interface's own closing transition.
         */
        function pose(m, age, focus, leave, out) {
            let dx = 0, dy = 0, scale = 1, turn = 0, alpha = 1;
            if (m.floatX !== 0 || m.floatY !== 0) {
                const w = wave(age, m.floatPeriod, m.floatOffset);
                dx += m.floatX * w;
                dy += m.floatY * w;
            }
            if (m.pulseFrom !== 100 || m.pulseTo !== 100) scale *= (m.pulseFrom + (m.pulseTo - m.pulseFrom) * swing(age, m.pulsePeriod, m.pulseOffset)) / 100;
            if (m.spin !== 0) turn += m.spin * age / 60 % 360;
            if (m.swayAngle !== 0) turn += m.swayAngle * wave(age, m.swayPeriod, m.swayOffset);
            if (m.fadeFrom !== 255 || m.fadeTo !== 255) alpha *= (m.fadeFrom + (m.fadeTo - m.fadeFrom) * swing(age, m.fadePeriod, m.fadeOffset)) / 255;
            if (m.appearX !== 0 || m.appearY !== 0 || m.appearScale !== 100 || m.appearOpacity !== 255) {
                let t = (age - m.appearDelay) / m.appearDuration;
                if (leave >= 0) t = Math.min(t, 1 - leave);
                t = t < 0 ? 0 : t > 1 ? 1 : t;
                // Ease out: fast at first, settling into place.
                const rest = (1 - t) * (1 - t) * (1 - t), come = 1 - rest;
                dx += m.appearX * rest;
                dy += m.appearY * rest;
                scale *= (m.appearScale + (100 - m.appearScale) * come) / 100;
                alpha *= (m.appearOpacity + (255 - m.appearOpacity) * come) / 255;
            }
            if (focus > 0) {
                const f = focus * focus * (3 - 2 * focus);
                scale *= 1 + (m.focusScale / 100 - 1) * f;
                dx += m.focusX * f;
                dy += m.focusY * f;
            }
            // Whole pixels (and never a negative zero), so text and edges stay sharp.
            out.dx = Math.round(dx) || 0;
            out.dy = Math.round(dy) || 0;
            out.scale = scale;
            out.turn = turn;
            out.alpha = alpha < 0 ? 0 : alpha > 1 ? 1 : alpha;
            out.frame = m.cols * m.rows > 1 ? frameAt(age, frameTotal(m), 60 / m.fps, m.frameMode) : 0;
            out.driftX = m.driftX * age / 60;
            out.driftY = m.driftY * age / 60;
            return out;
        }

        /** A pose to write into. */
        function newPose() {
            return { dx: 0, dy: 0, scale: 1, turn: 0, alpha: 1, frame: 0, driftX: 0, driftY: 0 };
        }

        /**
         * The pieces that draw a picture of sw x sh over a box of dw x dh: stretched over it, whole inside it,
         * repeated across it, or nine-sliced (`nineSlice` is the function that cuts the nine). Each piece is
         * { sx, sy, sw, sh, dx, dy, dw, dh }.
         */
        function pictureSegments(sw, sh, dw, dh, fit, insets, nineSlice) {
            if (!(sw > 0 && sh > 0 && dw > 0 && dh > 0)) return [];
            if (fit === "slice" && nineSlice) return nineSlice(sw, sh, dw, dh, insets);
            if (fit === "contain") {
                const scale = Math.min(dw / sw, dh / sh);
                const w = Math.round(sw * scale), h = Math.round(sh * scale);
                return [{ sx: 0, sy: 0, sw, sh, dx: Math.floor((dw - w) / 2), dy: Math.floor((dh - h) / 2), dw: w, dh: h }];
            }
            // A picture so small that it would repeat thousands of times is stretched instead.
            if (fit === "tile" && Math.ceil(dw / sw) * Math.ceil(dh / sh) <= 4096) {
                const segments = [];
                for (let y = 0; y < dh; y += sh) {
                    for (let x = 0; x < dw; x += sw) {
                        const w = Math.min(sw, dw - x), h = Math.min(sh, dh - y);
                        segments.push({ sx: 0, sy: 0, sw: w, sh: h, dx: x, dy: y, dw: w, dh: h });
                    }
                }
                return segments;
            }
            return [{ sx: 0, sy: 0, sw, sh, dx: 0, dy: 0, dw, dh }];
        }

        /**
         * The picture a control shows in a state ("base", "focused", "pressed", "disabled"): its own, else the
         * one it falls back to (pressed to selected, every one to the normal picture).
         */
        function statePicture(node, state) {
            const normal = node.fillImage || "";
            if (state === "disabled") return node.disabledImage || normal;
            if (state === "pressed") return node.pressedImage || node.focusedImage || normal;
            if (state === "focused") return node.focusedImage || normal;
            return normal;
        }

        /** The picture under a list's row in a state, or "" when it has none. */
        function rowPicture(node, state) {
            const normal = node.rowImage || "";
            if (state === "disabled") return node.disabledImage || normal;
            if (state === "focused") return node.focusedImage || normal;
            return normal;
        }

        return { MOTION_TYPES, TURN_TYPES, FOCUS_TYPES, FRAME_SOURCES, FILL_TYPES, FILL_FITS, FRAME_MODES, RANGES, DEFAULTS,
            normalize, compact, traits, frameAt, frameTotal, frameRect, fitRect, pose, newPose, pictureSegments, statePicture, rowPicture,
            newCarry, carryStart, carryInto, carryPoint, carryBack, carryDeltaBack, carried, carries };
    }
    // </interface-motion>

    const api = interfaceMotionApi();
    root.RRInterfaceMotion = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
