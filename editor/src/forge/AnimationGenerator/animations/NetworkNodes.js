/**
 * Network Node Diagram — N nodes connected by edges, with light "pulses"
 * traveling along the edges from node to node. Each node has a level
 * indicator (pulsing brightness). Nodes can be laid out as a circle (ring
 * topology) or grid (mesh topology).
 *
 * Connections are deterministic per (i, j) pair so the topology is
 * stable across the loop. Pulses travel at integer cycles per loop.
 */
function renderNetworkNodesFrame(ctx, w, h, frameIdx, totalFrames, params) {
    ctx.clearRect(0, 0, w, h);
    const t = frameIdx / totalFrames;
    const cx = w * (params.centerX !== undefined ? params.centerX : 0.5);
    const cy = h * (params.centerY !== undefined ? params.centerY : 0.5);
    const minDim = Math.min(w, h);

    const { transform, project } = makeSymbol3DTransform(
        params, t, cx, cy, minDim * 0.5 * params.size
    );

    const W = 1, H = params.aspectRatio;
    const bgColor = params.bgColor;
    const borderColor = params.borderColor;
    const nodeColor = params.nodeColor;
    const activeNodeColor = params.activeNodeColor;
    const edgeColor = params.edgeColor;
    const pulseColor = params.pulseColor;
    const opacity = params.opacity;
    const borderThick = Math.max(0.5, minDim * 0.003 * params.borderThickness);

    const proj = (x, y) => project(transform([x, y, 0]));
    const fillRect = (x0, y0, x1, y1, color, alpha) => {
        ctx.fillStyle = hexWithAlpha(color, opacity * alpha);
        ctx.beginPath();
        const p0=proj(x0,y0), p1=proj(x1,y0), p2=proj(x1,y1), p3=proj(x0,y1);
        ctx.moveTo(p0.x,p0.y); ctx.lineTo(p1.x,p1.y);
        ctx.lineTo(p2.x,p2.y); ctx.lineTo(p3.x,p3.y); ctx.closePath();
        ctx.fill();
    };
    const strokeRect = (x0, y0, x1, y1, color, alpha, lw) => {
        ctx.strokeStyle = hexWithAlpha(color, opacity * alpha);
        ctx.lineWidth = lw;
        ctx.beginPath();
        const p0=proj(x0,y0), p1=proj(x1,y0), p2=proj(x1,y1), p3=proj(x0,y1);
        ctx.moveTo(p0.x,p0.y); ctx.lineTo(p1.x,p1.y);
        ctx.lineTo(p2.x,p2.y); ctx.lineTo(p3.x,p3.y); ctx.closePath();
        ctx.stroke();
    };
    const line = (x0, y0, x1, y1, color, alpha, lw) => {
        const p0 = proj(x0, y0), p1 = proj(x1, y1);
        ctx.strokeStyle = hexWithAlpha(color, opacity * alpha);
        ctx.lineWidth = lw;
        ctx.beginPath();
        ctx.moveTo(p0.x, p0.y); ctx.lineTo(p1.x, p1.y);
        ctx.stroke();
    };
    const dot = (x, y, r, color, alpha) => {
        const p = proj(x, y);
        ctx.fillStyle = hexWithAlpha(color, opacity * alpha);
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fill();
    };

    // Background + border.
    fillRect(-W, -H, W, H, bgColor, 1.0);
    strokeRect(-W, -H, W, H, borderColor, 1.0, borderThick * 1.4);

    // Node positions.
    const nodeCount = Math.max(2, Math.round(params.nodeCount));
    const layout = Math.round(params.layout); // 0 = circle, 1 = grid
    const nodes = [];
    if (layout === 0) {
        // Circle layout.
        const ringR = Math.min(W, H) * 0.78;
        for (let i = 0; i < nodeCount; i++) {
            const a = (i / nodeCount) * Math.PI * 2 - Math.PI / 2;
            nodes.push([ringR * Math.cos(a), ringR * Math.sin(a)]);
        }
    } else {
        // Grid layout — cols × rows ≥ nodeCount.
        const cols = Math.ceil(Math.sqrt(nodeCount * (W / H)));
        const rows = Math.ceil(nodeCount / cols);
        const xStep = (W * 1.7) / Math.max(1, cols - 1);
        const yStep = (H * 1.7) / Math.max(1, rows - 1);
        const startX = -W * 0.85;
        const startY = -H * 0.85;
        for (let i = 0; i < nodeCount; i++) {
            const r = Math.floor(i / cols);
            const c = i % cols;
            nodes.push([startX + c * xStep, startY + r * yStep]);
        }
    }

    // Edges: deterministic per (i, j). For ring: connect ring neighbors +
    // a few cross-chords. For grid: connect adjacent + diagonals.
    const edges = [];
    if (layout === 0) {
        // Ring neighbors
        for (let i = 0; i < nodeCount; i++) {
            edges.push([i, (i + 1) % nodeCount]);
        }
        // Cross-chords based on connection probability.
        const chordProb = params.edgeProbability;
        for (let i = 0; i < nodeCount; i++) {
            for (let j = i + 2; j < nodeCount; j++) {
                if (j === (i + nodeCount - 1) % nodeCount) continue;
                const seed = Math.sin(i * 91 + j * 23.7) * 0.5 + 0.5;
                if (seed < chordProb * 0.5) edges.push([i, j]);
            }
        }
    } else {
        // Grid: connect each node to nodes within distance threshold.
        const maxLink = (W + H) * 0.55;
        for (let i = 0; i < nodeCount; i++) {
            for (let j = i + 1; j < nodeCount; j++) {
                const dx = nodes[i][0] - nodes[j][0];
                const dy = nodes[i][1] - nodes[j][1];
                const dist = Math.hypot(dx, dy);
                if (dist > maxLink * 0.45) continue;
                const seed = Math.sin(i * 91 + j * 23.7) * 0.5 + 0.5;
                if (seed < params.edgeProbability) edges.push([i, j]);
            }
        }
    }

    // Draw edges (faint).
    for (const [i, j] of edges) {
        const [x0, y0] = nodes[i];
        const [x1, y1] = nodes[j];
        line(x0, y0, x1, y1, edgeColor, 0.5, borderThick * 0.5);
    }

    // Draw pulses traveling along edges.
    const pulseCycles = Math.max(1, Math.round(params.pulseCycles));
    const pulsesPerEdge = Math.max(0, Math.round(params.pulsesPerEdge));
    if (pulsesPerEdge > 0) {
        for (let e = 0; e < edges.length; e++) {
            const [i, j] = edges[e];
            const [x0, y0] = nodes[i];
            const [x1, y1] = nodes[j];
            // Edge-local seed for direction + offset variation.
            const seed = Math.sin(e * 17.7) * 0.5 + 0.5;
            const reverse = seed > 0.5;
            for (let p = 0; p < pulsesPerEdge; p++) {
                const phase = (e * 0.17 + p / pulsesPerEdge) % 1;
                let u = (t * pulseCycles + phase) % 1;
                if (reverse) u = 1 - u;
                const px = x0 + u * (x1 - x0);
                const py = y0 + u * (y1 - y0);
                // Pulse glow.
                dot(px, py, borderThick * 2.5, pulseColor, 0.4);
                dot(px, py, borderThick * 1.4, pulseColor, 1.0);
            }
        }
    }

    // Draw nodes.
    const nodeR = Math.max(borderThick * 1.5, minDim * 0.011 * params.nodeSize);
    for (let i = 0; i < nodes.length; i++) {
        // Per-node "level" (size pulse) using deterministic freq.
        const freq = Math.max(1, pulseCycles + (i % 3));
        const level = (Math.sin(t * Math.PI * 2 * freq + i * 1.3) + 1) * 0.5;
        const isActive = level > 0.65;
        const col = isActive ? activeNodeColor : nodeColor;
        // Halo (active nodes have a stronger halo).
        const haloR = nodeR * (1.8 + level * 1.5);
        dot(nodes[i][0], nodes[i][1], haloR, col, isActive ? 0.5 : 0.18);
        // Core.
        dot(nodes[i][0], nodes[i][1], nodeR, col, isActive ? 1.0 : 0.85);
    }
}

RR_ANIMATION_REGISTRY.push({
    categoryId:   'interface',
    id:           'networknodes',
    name:         'Network Nodes',
    description:  'Nodes connected by edges with light pulses traveling along them. Choose ring or grid topology. Edges generated deterministically.',
    defaultBlend: 'source-over',
    noRandomize: [...INTERFACE_NO_RANDOMIZE],
    params: [
        { key: 'bgColor', label: 'Background', type: 'color', default: '#02060c', randomColorRole: 'bg' },
        { key: 'borderColor', label: 'Border', type: 'color', default: '#306080', randomColorRole: 'fg' },
        { key: 'edgeColor', label: 'Edges', type: 'color', default: '#608090', randomColorRole: 'fg' },
        { key: 'nodeColor', label: 'Idle Node', type: 'color', default: '#80c0ff', randomColorRole: 'fg' },
        { key: 'activeNodeColor', label: 'Active Node', type: 'color', default: '#fff0a0', randomColorRole: 'fg' },
        { key: 'pulseColor', label: 'Pulse', type: 'color', default: '#80ffe0', randomColorRole: 'fg' },
        { key: 'size', label: 'Size', type: 'slider', min: 0.02, randomMin: 0.2, max: 1.5, step: 0.005, default: 0.85 },
        { key: 'aspectRatio', label: 'Aspect Ratio', type: 'slider', min: 0.3, max: 1.2, step: 0.02, default: 0.85 },
        ...SYMBOL3D_ROTATION_PARAMS,
        ...SYMBOL3D_POSITION_PARAMS,
        { key: 'layout', label: 'Layout',
            description: '0 = ring layout (nodes on a circle), 1 = grid layout (rectangular mesh).',
            type: 'slider', min: 0, max: 1, step: 1, default: 0 },
        { key: 'nodeCount', label: 'Node Count',
            description: 'Number of nodes in the network.',
            type: 'slider', min: 3, max: 24, step: 1, default: 8 },
        { key: 'nodeSize', label: 'Node Size',
            description: 'Visual size of each node dot.',
            type: 'slider', min: 0.3, max: 2.5, step: 0.05, default: 1.0 },
        { key: 'edgeProbability', label: 'Edge Density',
            description: 'Probability of optional cross-chord (ring) or distance-link (grid) edges. Ring topology always includes neighbor edges.',
            type: 'slider', min: 0, max: 1, step: 0.05, default: 0.35 },
        { key: 'pulsesPerEdge', label: 'Pulses Per Edge',
            description: 'Number of light pulses traveling along each edge simultaneously. 0 = static network.',
            type: 'slider', min: 0, max: 4, step: 1, default: 1 },
        { key: 'pulseCycles', label: 'Pulse Speed',
            description: 'How many full edge-traversals each pulse makes per loop. Integer for seamless loop.',
            type: 'slider', min: 1, max: 8, step: 1, default: 2 },
        { key: 'borderThickness', label: 'Line Thickness', type: 'slider', min: 0.3, max: 4, step: 0.1, default: 1.0 },
        ...SYMBOL3D_PULSE_PARAMS,
        { key: 'opacity', label: 'Opacity', type: 'slider', min: 0, max: 1, step: 0.05, default: 1.0 }
    ],
    render: renderNetworkNodesFrame
});
