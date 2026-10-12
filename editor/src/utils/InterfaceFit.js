/**
 * InterfaceFit - a User Interfaces record designed for one screen, laid out for another.
 *
 * `fitInterfaceNodes` is the game's own function (runtime/reactor_ui.js; the text between the markers is
 * identical, and a test pins it), so the Database canvas previews a record at another size exactly as the game
 * shows it. `refit` bakes that layout into a record's numbers and re-stamps its design size.
 */
(function(root) {
    'use strict';

    // <interface-fit>
    // The same text stands in editor/src/utils/InterfaceFit.js (a test pins the two), so the editor's canvas
    // previews a record at another screen size exactly as the game lays it out.
    /**
     * A record designed for one screen, laid out for another. Returns null when the sizes are the same (nothing
     * changes), else { scale, width, height, nodes }: `scale` is the one factor everything is shown at (the
     * smaller of the two ratios, so nothing leaves the screen), `width` x `height` is the screen in the record's
     * own units (the design frame, wider or taller where the screen's shape differs), and `nodes` are the nodes
     * placed in that frame. Sizes are not stretched: in a scene the design frame stands in the middle of the
     * screen; in a HUD each node keeps to the edge or the middle it stood at. A node that covers its frame from
     * side to side keeps covering it.
     */
    function fitInterfaceNodes(nodes, design, screen, mode, anchors, mainFontSize) {
        const dw = Math.round(Number(design && design.width) || 0), dh = Math.round(Number(design && design.height) || 0);
        const sw = Math.round(Number(screen && screen.width) || 0), sh = Math.round(Number(screen && screen.height) || 0);
        if (!(dw > 0 && dh > 0 && sw > 0 && sh > 0) || (dw === sw && dh === sh)) return null;
        const base = Math.min(sw / dw, sh / dh);
        const SPAN = 0.05, NEAR = 0.02;
        const list = Array.isArray(nodes) ? nodes : [];
        const byId = new Map(list.map(node => [node.id, node]));
        // Text that would show smaller than is easy to read (12 px on a screen 480 high, 14 px from 720 up) is
        // shown at that size instead, when every layer still stands on the screen clear of its neighbours.
        const main = Number(mainFontSize) > 0 ? Number(mainFontSize) : 0;
        const sizes = main ? list.filter(node => node && !["box", "image", "battleCursor"].includes(node.type)).map(node => Number(node.fontSize) > 0 ? Number(node.fontSize) : main) : [];
        const floor = Math.max(12, Math.min(14, 12 + (sh - 480) / 120));
        const larger = sizes.length ? [floor / Math.min(...sizes), floor / main].map(f => Math.min(1, f)).filter((f, i, all) => f > base + 0.001 && all.indexOf(f) === i).sort((p, q) => q - p) : [];
        for (const scale of larger) {
            const fit = layoutAt(scale, Math.round(sw / scale), Math.round(sh / scale), true);
            if (fit) return fit;
        }
        return layoutAt(base, Math.max(dw, Math.round(sw / base)), Math.max(dh, Math.round(sh / base)), false);

      function layoutAt(scale, width, height, strict) {
        const before = new Map(), after = new Map();
        const designFrame = { x: 0, y: 0, width: dw, height: dh }, screenFrame = { x: 0, y: 0, width, height };
        const spans = (m0, m1, size, frame) => size > 0 && frame > 0 && Math.abs(m0) <= frame * SPAN && Math.abs(m1) <= frame * SPAN;
        // One axis of one node: where it starts and how long it is in the new frame.
        const place = (p0, size, f0, fsize, F0, Fsize, framed) => {
            const m0 = p0 - f0, m1 = f0 + fsize - (p0 + size);
            if (framed) return [F0 + (Fsize - fsize) / 2 + m0, size];
            if (!(fsize > 0)) return [F0 + m0, size];
            if (spans(m0, m1, size, fsize)) return [F0 + m0, Math.max(0, Fsize - m0 - m1)];
            if (Math.abs(m0 - m1) <= Math.max(2, fsize * NEAR)) return [F0 + (Fsize - size) / 2 + (m0 - m1) / 2, size];
            return m0 <= m1 ? [F0 + m0, size] : [F0 + Fsize - m1 - size, size];
        };
        const solve = (node, trail) => {
            if (after.has(node.id)) return;
            const parent = byId.get(node.parent);
            let from = designFrame, to = screenFrame, root = true;
            if (parent && parent !== node && !trail.has(node.id)) {
                trail.add(node.id);
                solve(parent, trail);
                from = before.get(parent.id); to = after.get(parent.id); root = false;
            }
            const a = anchors[node.anchor] || [0, 0];
            const w = Math.max(0, Number(node.width) || 0), h = Math.max(0, Number(node.height) || 0);
            const rect = { x: from.x + from.width * a[0] - w * a[0] + (Number(node.x) || 0), y: from.y + from.height * a[1] - h * a[1] + (Number(node.y) || 0), width: w, height: h };
            before.set(node.id, rect);
            // An offset from something that moves (the acting actor's row, a battler) is not a place on the screen.
            if (node.type === "battleCursor" || (node.type === "battleWindow" && node.followActor)) {
                after.set(node.id, { x: to.x + rect.x - from.x, y: to.y + rect.y - from.y, width: w, height: h, keep: true });
                return;
            }
            const wide = spans(rect.x - from.x, from.x + from.width - rect.x - w, w, from.width);
            const tall = spans(rect.y - from.y, from.y + from.height - rect.y - h, h, from.height);
            const framed = root && mode === "scene" && !(wide && tall);
            const [x, fw] = place(rect.x, w, from.x, from.width, to.x, to.width, framed);
            const [y, fh] = place(rect.y, h, from.y, from.height, to.y, to.height, framed);
            after.set(node.id, { x, y, width: fw, height: fh, to, a });
        };
        for (const node of list) solve(node, new Set());
        if (strict) {
            // Nothing that stood inside its parent leaves it, and no two neighbours that stood apart now touch.
            const inside = (r, f) => r.x >= f.x - 1 && r.y >= f.y - 1 && r.x + r.width <= f.x + f.width + 1 && r.y + r.height <= f.y + f.height + 1;
            const apart = (p, q) => p.x + p.width <= q.x + 1 || q.x + q.width <= p.x + 1 || p.y + p.height <= q.y + 1 || q.y + q.height <= p.y + 1;
            const frameOf = (node, map, whole) => { const parent = byId.get(node.parent); return parent && parent !== node && map.has(parent.id) ? map.get(parent.id) : whole; };
            for (let i = 0; i < list.length; i++) {
                const node = list[i], was = before.get(node.id), now = after.get(node.id);
                if (!now || now.keep) continue;
                if (inside(was, frameOf(node, before, designFrame)) && !inside(now, frameOf(node, after, screenFrame))) return null;
                for (let j = i + 1; j < list.length; j++) {
                    const other = list[j], then = after.get(other.id);
                    if (!then || then.keep || (other.parent || 0) !== (node.parent || 0)) continue;
                    if (apart(was, before.get(other.id)) && !apart(now, then)) return null;
                }
            }
        }
        const fitted = list.map(node => {
            const rect = after.get(node.id);
            if (!rect || rect.keep) return node;
            const w = node.width > 0 ? Math.round(rect.width) : 0, h = node.height > 0 ? Math.round(rect.height) : 0;
            return Object.assign({}, node, {
                x: Math.round(rect.x - (rect.to.x + rect.to.width * rect.a[0] - rect.width * rect.a[0])),
                y: Math.round(rect.y - (rect.to.y + rect.to.height * rect.a[1] - rect.height * rect.a[1])),
                width: w, height: h
            });
        });
        return { scale, width, height, nodes: fitted };
      }
    }
    // </interface-fit>

    const ANCHORS = {
        topLeft: [0, 0], top: [0.5, 0], topRight: [1, 0],
        left: [0, 0.5], center: [0.5, 0.5], right: [1, 0.5],
        bottomLeft: [0, 1], bottom: [0.5, 1], bottomRight: [1, 1]
    };
    /** The screen sizes the Preview at control offers. */
    const SIZES = [[640, 480], [816, 624], [1024, 576], [1280, 720], [1366, 768], [1920, 1080], [2560, 1080]];
    /** Lengths a node stores in pixels, besides its place and size. */
    const LENGTHS = ['fontSize', 'rowHeight', 'gaugeHeight', 'portraitSize', 'actorPadding', 'actorGap', 'borderWidth', 'radius', 'letterSpacing',
        'slideX', 'slideY', 'imageX', 'imageY', 'floatRange', 'enemyOffsetX', 'enemyOffsetY', 'actorOffsetX', 'actorOffsetY', 'cellSize', 'cellGap'];
    const ELEMENT_LENGTHS = ['x', 'y', 'width', 'height', 'fontSize', 'corner', 'thickness', 'iconSize', 'iconGap'];

    const designOf = raw => {
        const width = Math.round(Number(raw && raw.width) || 0), height = Math.round(Number(raw && raw.height) || 0);
        return width >= 160 && height >= 120 && width <= 16384 && height <= 16384 ? { width, height } : null;
    };

    /** The record as the game lays it out on `screen`: { scale, width, height, nodes }, or null when it is shown as authored. */
    function fit(record, screen, mainFontSize) {
        const design = designOf(record && record.design);
        // A Victory record keeps its layers together in the middle of the screen, as a scene does.
        return design ? fitInterfaceNodes(record.nodes || [], design, screen, record.mode === 'victory' ? 'scene' : record.mode || 'scene', ANCHORS, mainFontSize || 26) : null;
    }

    /**
     * The record rewritten for `screen`: places and sizes as the game would show them, every stored length times
     * the same factor, and `design` set to that screen. A node on the project's own font size gets the size it
     * would be shown at (`mainFontSize`). Returns the record itself when there is nothing to change.
     */
    function refit(record, screen, mainFontSize) {
        const fitted = fit(record, screen, mainFontSize);
        const width = Math.round(Number(screen && screen.width) || 0), height = Math.round(Number(screen && screen.height) || 0);
        if (!fitted) return record && width > 0 && height > 0 && !designOf(record.design) ? Object.assign({}, record, { design: { width, height } }) : record;
        const s = fitted.scale, main = Number(mainFontSize) > 0 ? Number(mainFontSize) : 26;
        const times = value => Math.round(Number(value) * s);
        const nodes = fitted.nodes.map(node => {
            const next = Object.assign({}, node, { x: times(node.x), y: times(node.y), width: node.width > 0 ? Math.max(1, times(node.width)) : 0, height: node.height > 0 ? Math.max(1, times(node.height)) : 0 });
            for (const key of LENGTHS) if (Number.isFinite(Number(node[key])) && Number(node[key]) !== 0) next[key] = times(node[key]);
            if (!(Number(node.fontSize) > 0) && ['text', 'button', 'list', 'gauge', 'textInput'].includes(node.type)) next.fontSize = Math.max(8, Math.round(main * s));
            if (next.fontSize > 0) next.fontSize = Math.max(8, next.fontSize);
            if (next.rowHeight > 0) next.rowHeight = Math.max(24, next.rowHeight);
            if (node.actorElements && typeof node.actorElements === 'object') {
                next.actorElements = {};
                for (const [name, element] of Object.entries(node.actorElements)) {
                    const copy = Object.assign({}, element);
                    for (const key of ELEMENT_LENGTHS) if (Number.isFinite(Number(copy[key])) && Number(copy[key]) !== 0) copy[key] = times(copy[key]);
                    next.actorElements[name] = copy;
                }
            }
            return next;
        });
        return Object.assign({}, record, { nodes, design: { width, height } });
    }

    /** The smallest text still easy to read on a screen this high: 12 px at 480, 14 px from 720 up. */
    const readableFloor = height => Math.max(12, Math.min(14, 12 + (Number(height) - 480) / 120));

    /** The smallest text a fitted layout shows, in screen pixels. */
    function smallestText(nodes, mainFontSize, scale) {
        let smallest = 0;
        for (const node of nodes || []) {
            if (!node || ['box', 'image', 'battleCursor'].includes(node.type)) continue;
            const size = (Number(node.fontSize) > 0 ? Number(node.fontSize) : Number(mainFontSize) || 26) * scale;
            if (!smallest || size < smallest) smallest = size;
        }
        return Math.round(smallest);
    }

    const api = { fitInterfaceNodes, fit, refit, designOf, readableFloor, smallestText, ANCHORS, SIZES };
    root.RRInterfaceFit = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
