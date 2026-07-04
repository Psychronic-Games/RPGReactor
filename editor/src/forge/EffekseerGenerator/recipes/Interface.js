/**
 * Interface family — sci-fi console/HUD panels, mirroring the standard
 * Animation Generator's Interface category 1:1.
 *
 * These animations are 2D by nature (scrolling text, waveforms, radar
 * sweeps), so instead of approximating them with particles, each recipe
 * BAKES the AG's actual canvas render into a sprite-sheet texture (see
 * EffekseerGenerator._bakedSheet) and plays it back on a fixed quad via
 * Effekseer's UV animation — pixel parity with the 2D originals, in a
 * file the engine plays natively.
 *
 * The exported .efkefc references Texture/rr_bake_<id>.png, which export
 * writes alongside it (rendered from the current parameter values).
 */
(function () {
    const LONG = 36000;
    const FRAMES = 64, CELL = 128, COLS = 8;

    const PANELS = [
        { id: 'lcars', agId: 'lcars', name: 'LCARS', aspect: 0.65,
          colors: [
              { key: 'elbowColor', label: 'Elbow Color', def: '#ff9900' },
              { key: 'barColor', label: 'Bar Color', def: '#cc99cc' },
              { key: 'textColor', label: 'Text Color', def: '#f8fbdb' },
          ],
          knobs: [
              { key: 'spineButtons', label: 'Spine Buttons', def: 3, min: 2, max: 7 },
              { key: 'textRows', label: 'Text Rows', def: 5, min: 2, max: 20 },
              { key: 'scrollSpeed', label: 'Scroll Speed', def: 2, min: 0, max: 6 },
          ] },
        { id: 'bootscreen', agId: 'bootscreen', name: 'Boot Screen', aspect: 0.7,
          colors: [
              { key: 'textColor', label: 'Text Color', def: '#80f0d0' },
              { key: 'accentColor', label: 'Accent Color', def: '#ff7050' },
              { key: 'successColor', label: 'Success Color', def: '#80ff60' },
          ],
          knobs: [
              { key: 'logRows', label: 'Log Rows', def: 8, min: 3, max: 18 },
              { key: 'scrollSpeed', label: 'Scroll Speed', def: 3, min: 1, max: 8 },
          ] },
        { id: 'hexdump', agId: 'hexdump', name: 'Hex Memory Dump', aspect: 0.7,
          colors: [
              { key: 'byteColor', label: 'Byte Color', def: '#80ffa0' },
              { key: 'offsetColor', label: 'Offset Color', def: '#a070ff' },
              { key: 'highlightColor', label: 'Hot Byte Color', def: '#ff5060' },
          ],
          knobs: [
              { key: 'rows', label: 'Rows', def: 14, min: 4, max: 32 },
              { key: 'charsPerRow', label: 'Bytes / Row', def: 12, min: 4, max: 32 },
              { key: 'scrollSpeed', label: 'Update Rate', def: 4, min: 0, max: 12 },
          ] },
        { id: 'networknodes', agId: 'networknodes', name: 'Network Nodes', aspect: 0.85,
          colors: [
              { key: 'nodeColor', label: 'Node Color', def: '#80c0ff' },
              { key: 'pulseColor', label: 'Pulse Color', def: '#80ffe0' },
              { key: 'edgeColor', label: 'Edge Color', def: '#608090' },
          ],
          knobs: [
              { key: 'nodeCount', label: 'Nodes', def: 8, min: 3, max: 24 },
              { key: 'layout', label: 'Layout (0 ring / 1 grid)', def: 0, min: 0, max: 1 },
              { key: 'pulsesPerEdge', label: 'Pulses / Edge', def: 1, min: 0, max: 4 },
          ] },
        { id: 'powerlevels', agId: 'powerlevels', name: 'Power Levels', aspect: 0.6,
          colors: [
              { key: 'color1', label: 'Primary Data', def: '#50ffd0' },
              { key: 'color2', label: 'Secondary Data', def: '#ffc040' },
              { key: 'borderColor', label: 'Border Color', def: '#40d0ff' },
          ],
          knobs: [
              { key: 'barCount', label: 'Bars', def: 8, min: 1, max: 24 },
              { key: 'textRows', label: 'Text Rows', def: 5, min: 0, max: 12 },
              { key: 'waveFreq', label: 'Wave Frequency', def: 3, min: 0, max: 16 },
          ] },
        { id: 'vitalsigns', agId: 'vitalsigns', name: 'Vital Signs Monitor', aspect: 0.7,
          colors: [
              { key: 'heartColor', label: 'Heartbeat Color', def: '#ff6080' },
              { key: 'breathColor', label: 'Respiration Color', def: '#60c0ff' },
              { key: 'alertColor', label: 'Alert Color', def: '#ffa040' },
          ],
          knobs: [
              { key: 'rowCount', label: 'Waveform Rows', def: 3, min: 1, max: 8 },
              { key: 'heartRate', label: 'Heart Rate', def: 3, min: 1, max: 8 },
          ] },
        { id: 'radarsweep', agId: 'radarsweep', name: 'Radar Sweep',
          colors: [
              { key: 'sweepColor', label: 'Sweep Color', def: '#80ff80' },
              { key: 'ringColor', label: 'Ring Color', def: '#40b070' },
              { key: 'enemyColor', label: 'Hostile Color', def: '#ff5050' },
          ],
          knobs: [
              { key: 'blipCount', label: 'Blips', def: 12, min: 0, max: 40 },
              { key: 'rangeRings', label: 'Range Rings', def: 4, min: 1, max: 8 },
              { key: 'sweepCycles', label: 'Sweep Cycles', def: 1, min: 1, max: 6 },
          ] },
        { id: 'tacticalmap', agId: 'tacticalmap', name: 'Tactical Map', aspect: 0.7,
          colors: [
              { key: 'gridColor', label: 'Grid Color', def: '#3080a0' },
              { key: 'friendlyColor', label: 'Friendly Color', def: '#60ff80' },
              { key: 'hostileColor', label: 'Hostile Color', def: '#ff4040' },
          ],
          knobs: [
              { key: 'unitCount', label: 'Units', def: 10, min: 0, max: 32 },
              { key: 'gridDivisions', label: 'Grid Divisions', def: 8, min: 2, max: 16 },
          ] },
        { id: 'targetlock', agId: 'targetlock', name: 'Target Lock',
          colors: [
              { key: 'reticleColor', label: 'Reticle Color', def: '#40d0ff' },
              { key: 'lockColor', label: 'Lock Color', def: '#ff4040' },
              { key: 'scanColor', label: 'Scan Color', def: '#80ffe0' },
          ],
          knobs: [
              { key: 'lockCycles', label: 'Lock Cycles', def: 1, min: 1, max: 6 },
              { key: 'scanLines', label: 'Scan Lines', def: 2, min: 0, max: 6 },
          ] },
        { id: 'static', agId: 'static', name: 'Static', aspect: 0.75,
          colors: [
              { key: 'color1', label: 'Bright Color', def: '#ffffff' },
              { key: 'color2', label: 'Dark Color', def: '#000000' },
              { key: 'tintColor', label: 'Tint Color', def: '#a0c0ff' },
          ],
          knobs: [
              { key: 'speed', label: 'Change Speed', def: 30, min: 1, max: 60 },
              { key: 'scanlineCount', label: 'Scanlines', def: 30, min: 2, max: 80 },
          ] },
    ];

    // djb2 — the bake hash makes the texture PATH change with the params.
    // The WASM core caches textures by path across effects, so a re-baked
    // sheet at a constant path would silently keep showing the OLD pixels.
    const hash = (s) => {
        let h = 5381;
        for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
        return h.toString(36);
    };

    for (const def of PANELS) {
        const mapParams = (p) => {
            const out = {};
            for (const c of def.colors) out[c.key] = p[c.key];
            for (const k of def.knobs) out[k.key] = p[k.key];
            if (def.aspect !== undefined) out.aspectRatio = p.aspect;
            return out;
        };
        const texPath = (p) => `Texture/rr_bake_ui_${def.id}_${hash(JSON.stringify(mapParams(p)))}.png`;

        RR_EFK_RECIPE_REGISTRY.push({
            id: `ui-${def.id}`,
            name: def.name,
            category: 'Interface',
            continuous: true,
            bake: {
                animationId: def.agId,
                frames: FRAMES,
                cell: CELL,
                cols: COLS,
                map: mapParams,
            },
            textures: (p) => [texPath(p)],
            params: [
                { key: 'size', label: 'Size', type: 'range', default: 7, min: 2, max: 16, step: 1 },
                { key: 'playback', label: 'Playback Speed', type: 'range', default: 3, min: 1, max: 4, step: 1 },
                ...(def.aspect !== undefined
                    ? [{ key: 'aspect', label: 'Aspect Ratio', type: 'range', default: def.aspect, min: 0.4, max: 1.4, step: 0.05 }]
                    : []),
                ...def.colors.map(c => ({ key: c.key, label: c.label, type: 'color', default: c.def })),
                ...def.knobs.map(k => ({ key: k.key, label: k.label, type: 'range', default: k.def, min: k.min, max: k.max, step: k.step || 1 })),
            ],

            build(p) {
                const B = RR_EfkBuilder;
                const U = RR_EfkRecipeUtil;
                const { rf, v3 } = B;
                const bindAlways = { translationBindType: 2, rotationBindType: 2, scalingBindType: 2 };

                const panel = B.makeNode(RR_EfkFormat.NODE_TYPE.SPRITE, {
                    commonValues: { ...bindAlways, maxGeneration: 1, life: rf(LONG) },
                    scaling: { type: 0, refEq: -1, scale: v3(p.size, p.size, 1) },
                    rendererCommon: {
                        colorTextureIndex: 0,
                        alphaBlend: 1,   // true panel colors, opaque backdrop
                        uv: {
                            type: 2,     // sprite-sheet playback
                            // Frame rect is NORMALIZED (corpus-verified:
                            // stock 4-frame strips use w = 0.25, not pixels).
                            position: { x: 0, y: 0, w: 1 / COLS, h: 1 / Math.ceil(FRAMES / COLS) },
                            frameLength: 5 - p.playback,
                            frameCountX: COLS,
                            frameCountY: Math.ceil(FRAMES / COLS),
                            loopType: 1,
                            startFrame: { max: 0, min: 0 },
                        },
                    },
                    rendererParams: {
                        billboard: 2,    // fixed — the 3D gizmo can tilt it
                        allColor: U.fixedColor({ r: 255, g: 255, b: 255, a: 255 }),
                    },
                });

                return [B.makeNode(RR_EfkFormat.NODE_TYPE.NONE, {
                    commonValues: { ...bindAlways, maxGeneration: 1, life: rf(LONG) },
                    children: [panel],
                })];
            },
        });
    }
})();
