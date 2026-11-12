/**
 * RRCharacterSpriteSheet - Forge › 3D Character Builder › Export sprite
 * sheet: the character drawn from fixed camera angles, frame by frame, into
 * a picture the game uses as it is.
 *
 *   LAYOUTS                   the sheets: '8d' (img/characters, $Name[8D]),
 *                             'mz' (img/characters, $Name), 'sv'
 *                             (img/sv_actors, Name), 'face' (img/faces, Name)
 *   plan(id, options)         every cell: { col, row, clip, at, yaw, kind,
 *                             upper, expression }
 *   fit(bounds, cell)         one scale for the whole sheet and each frame's
 *                             anchor (feet on the baseline, centered)
 *   fitFace(eye, cell, h)     a portrait's scale and anchor (eyes on one line)
 *   downsample / outline / blit   pixel helpers
 *   fileName(id, name, n)     the file the sheet is written as
 *   FRAME_CHOICES             frames per row a character sheet may have
 *   openPanel(builder)        the export panel over the builder's view
 *   render(builder, settings, progress)   the sheet as { width, height, data }
 *
 * The [8D] sheet: 12 × 8 frames, eight blocks of 3 frames × 4 rows.
 *   block 0 (cols 1-3, rows 1-4)   walk: down, left, right, up
 *   block 1 (cols 4-6, rows 1-4)   walk diagonals: down-left, down-right,
 *                                  up-left, up-right
 *   block 2 (cols 7-9, rows 1-4)   dash: down, left, right, up
 *   block 3 (cols 10-12, rows 1-4) dash diagonals
 *   block 4 (cols 1-3, rows 5-8)   carry (arms raised), four directions
 *   block 5 (cols 4-6, rows 5-8)   carry diagonals
 *   block 6 (cols 7-9, rows 5-8)   attack, four directions
 *   block 7 (cols 10-12, rows 5-8) poses facing down: jump, guard, cast, down
 * Each walk row is MZ's three frames: one step, standing, the other step.
 *
 * With n frames per row other than three ('8d' and 'mz' only), the sheet is
 * an [NF] sheet ($Name[8D][6F], $Name[6F]; frameTag): every block is n frames
 * wide, in the order the game plays them, 0 to n - 1 round again, resting on
 * 0. A walk or carry row samples the clip's full cycle in even steps from
 * its passing frame, including frame 0, with no unrelated idle pose at the
 * wrap. A dash row samples the run's full cycle the same way. Attack and
 * the poses spread their motion over the n frames. A [1F]
 * sheet is one frame a row: standing, the run's passing frame, each pose's key.
 * The side-view sheet is MZ's 9 × 6 cells, 18 motions down three columns in
 * Sprite_Actor.MOTIONS order; the face sheet MZ's 4 × 2 portraits.
 */
(function (root) {
    'use strict';

    const CARDINAL = [2, 4, 6, 8];
    const DIAGONAL = [1, 3, 7, 9];
    /** The body's turn (degrees about up) to face each direction; at 0 it faces the camera (down). */
    const YAW = { 2: 0, 4: -90, 6: 90, 8: 180, 1: -45, 3: 45, 7: -135, 9: 135 };
    /** A side-view actor faces left toward the enemies, turned a little toward the viewer; it escapes to the right. */
    const SV_YAW = -60, SV_ESCAPE_YAW = 120;

    const LAYOUTS = [
        { id: '8d', label: '8 directions [8D]', columns: 12, rows: 8, frame: 100, folder: 'characters', prefix: '$', tag: '[8D]', elevation: 30 },
        { id: 'mz', label: '4 directions', columns: 3, rows: 4, frame: 48, folder: 'characters', prefix: '$', tag: '', elevation: 30 },
        { id: 'sv', label: 'Side-view battler', columns: 9, rows: 6, frame: 64, folder: 'sv_actors', prefix: '', tag: '', elevation: 15 },
        { id: 'face', label: 'Face portraits', columns: 4, rows: 2, frame: 144, folder: 'faces', prefix: '', tag: '', elevation: 3 }
    ];
    const layout = id => LAYOUTS.find(l => l.id === id) || LAYOUTS[0];

    /** The clips each cell asks for, best first; the first one the character has is used, else Idle. */
    const CLIPS = {
        walk: ['walk'],
        run: ['run', 'trot', 'gallop'],
        lift: ['carry', 'lift', 'armsUp'],
        attack: ['sword', 'swordSwing', 'swing', 'slash', 'attack', 'punch', 'fight'],
        thrust: ['swordThrust', 'thrust', 'stab', 'spear', 'lunge', 'sword', 'fight'],
        missile: ['bow', 'bowShot', 'archery', 'shootBow', 'throw', 'shoot', 'pistol', 'rifle'],
        guard: ['defend', 'guard', 'block', 'fight'],
        cast: ['cast', 'spell', 'chant', 'armsUp'],
        spell: ['spell', 'cast', 'armsUp'],
        hit: ['hit', 'hurt', 'damage', 'flinch', 'fall'],
        dodge: ['dodge', 'evade', 'sidestep', 'backstep', 'backflip', 'jump'],
        skill: ['skill', 'special', 'throw', 'cast', 'fight'],
        item: ['item', 'use', 'drink', 'wave'],
        victory: ['victory', 'cheer', 'celebrate', 'armsUp', 'wave'],
        weak: ['weak', 'dying', 'tired', 'kneel', 'crouch'],
        abnormal: ['dizzy', 'abnormal', 'stagger', 'crouch', 'kneel'],
        sleep: ['sleep', 'lieSide', 'lieBack'],
        dead: ['death', 'dead', 'ko', 'lieBack', 'lieSide'],
        jump: ['jump'],
        kneel: ['kneel', 'crouch']
    };

    /** Sprite_Actor.MOTIONS: name and whether it loops, in index order (cells: column floor(i / 6) * 3, row i % 6). */
    const SV_MOTIONS = [
        ['walk', true], ['wait', true], ['chant', true], ['guard', true], ['damage', false], ['evade', false],
        ['thrust', false], ['swing', false], ['missile', false], ['skill', false], ['spell', false], ['item', false],
        ['escape', true], ['victory', true], ['dying', true], ['abnormal', true], ['sleep', true], ['dead', true]
    ];
    const SV_CLIPS = {
        walk: 'walk', wait: 'idle', chant: 'cast', guard: 'guard', damage: 'hit', evade: 'dodge', thrust: 'thrust', swing: 'attack',
        missile: 'missile', skill: 'skill', spell: 'spell', item: 'item', escape: 'run', victory: 'victory', dying: 'weak',
        abnormal: 'abnormal', sleep: 'sleep', dead: 'dead'
    };

    /**
     * The face sheet's expressions, by preset: RRCharacterExpressions.SHEETS
     * where the builder makes expressions, these otherwise. An expression the
     * character cannot make shows neutral.
     */
    const FACE_PRESETS = [
        { id: 'everyday', label: 'Everyday', expressions: ['neutral', 'happy', 'sad', 'angry', 'surprised', 'scared', 'thinking', 'embarrassed'] },
        { id: 'battle', label: 'Battle', expressions: ['neutral', 'determined', 'angry', 'pain', 'shouting', 'smirk', 'sleepy', 'worried'] },
        { id: 'story', label: 'Story', expressions: ['neutral', 'laugh', 'crying', 'worried', 'embarrassed', 'disgusted', 'sleepy', 'smirk'] }
    ];
    const facePresets = () => (root.RRCharacterExpressions && Array.isArray(root.RRCharacterExpressions.SHEETS) && root.RRCharacterExpressions.SHEETS.length ? root.RRCharacterExpressions.SHEETS : FACE_PRESETS);

    const WALK = [{ clip: 'walk', at: 'stepA' }, { clip: 'idle', at: 0 }, { clip: 'walk', at: 'stepB' }];
    const RUN = [{ clip: 'run', at: 'stepA' }, { clip: 'run', at: 'pass' }, { clip: 'run', at: 'stepB' }];
    /** A one-time motion's three frames: on the way to its key pose (the one furthest from its start), the key, after it. */
    const ONCE = ['rise', 'key', 'after'];
    /** A held motion's three frames, played 0, 1, 2, 1: about its key pose. */
    const HOLD = ['keyBefore', 'key', 'keyAfter'];
    /** Idle's three frames, out and back over half its loop. */
    const LOOP = [0, 0.25, 0.5];
    const frames = (clip, times) => times.map(at => ({ clip, at }));

    /** Frames per row a character sheet ('8d', 'mz') may have; 3 is MZ's own. */
    const FRAME_CHOICES = [1, 3, 4, 6, 8, 10, 12];
    /** The file-name tag for n frames per row: `[6F]`, number first like [8D]; none for MZ's 3 (RRAssetFiles.frameTag). */
    const frameTag = n => (root.RRAssetFiles && root.RRAssetFiles.frameTag ? root.RRAssetFiles.frameTag(n) : (Number(n) >= 1 && Number(n) !== 3 ? `[${Math.round(Number(n))}F]` : ''));
    /** A layout's frames per row: n where the layout takes a choice, else 3. */
    const framesOf = (id, n) => ((id === '8d' || id === 'mz') && FRAME_CHOICES.includes(Number(n)) ? Number(n) : 3);
    /** A layout's columns at n frames per row: every block n wide. */
    const columnsOf = (id, n) => { const l = layout(id), f = framesOf(id, n); return f === 3 ? l.columns : l.columns / 3 * f; };
    // n-frame rows ([NF] order: 0 to n - 1, resting on 0). `to` and `u` mean a time u of the way from `at` to `to`;
    // `shift` a time that much further round the clip.
    const cycleRow = (n, clip, stand) => Array.from({ length: n }, (_, i) => (n === 1 && stand ? { clip: 'idle', at: 0 } : { clip, at: 'pass', shift: i / n }));
    const spreadRow = (n, clip, from, to) => Array.from({ length: n }, (_, i) => ({ clip, at: from, to, u: n > 1 ? i / (n - 1) : 0.5 }));
    /** A one-time motion over n frames: from its start up to the key pose by the middle frame, then on after it. */
    const onceRow = (n, clip) => {
        if (n === 1) return [{ clip, at: 'key' }];
        const key = Math.max(1, Math.round((n - 1) / 2));
        return Array.from({ length: n }, (_, i) => (i <= key ? { clip, at: 'start', to: 'key', u: i / key } : { clip, at: 'key', to: 'after', u: (i - key) / (n - 1 - key) }));
    };

    /** The top-left frame of an eight-block sheet's block (0-7), blocks n frames wide (3 unless given). */
    const blockOrigin = (block, n = 3) => ({ col: (block % 4) * n, row: Math.floor(block / 4) * 4 });

    function plan(id, options = {}) {
        const cells = [], n = framesOf(id, options.frames), three = n === 3;
        const walk = three ? WALK : cycleRow(n, 'walk', true), run = three ? RUN : cycleRow(n, 'run', false);
        const block = (b, dirs, row, kind, extra) => {
            const o = blockOrigin(b, n);
            dirs.forEach((d, r) => row.forEach((f, c) => cells.push(Object.assign({ col: o.col + c, row: o.row + r, yaw: YAW[d], dir: d, kind }, f, extra))));
        };
        if (id === 'mz') block(0, CARDINAL, walk, 'move');
        else if (id === '8d') {
            block(0, CARDINAL, walk, 'move');
            block(1, DIAGONAL, walk, 'move');
            block(2, CARDINAL, run, 'move');
            block(3, DIAGONAL, run, 'move');
            block(4, CARDINAL, walk, 'move', { upper: 'lift', upperAt: 'overhead' });
            block(5, DIAGONAL, walk, 'move', { upper: 'lift', upperAt: 'overhead' });
            block(6, CARDINAL, three ? frames('attack', ONCE) : onceRow(n, 'attack'), 'pose');
            const o = blockOrigin(7, n);
            const rows = three ? [
                frames('jump', [0.45, 0.6, 0.72]),
                frames('guard', HOLD),
                frames('cast', ONCE),
                [{ clip: 'hit', at: 0.4 }, { clip: 'dead', at: 0.45 }, { clip: 'dead', at: 0.97 }]
            ] : [
                spreadRow(n, 'jump', 0.45, 0.72),
                spreadRow(n, 'guard', 'keyBefore', 'keyAfter'),
                onceRow(n, 'cast'),
                n === 1 ? [{ clip: 'dead', at: 0.97 }] : [{ clip: 'hit', at: 0.4 }].concat(spreadRow(n - 1, 'dead', 0.45, 0.97))
            ];
            rows.forEach((row, r) => row.forEach((f, c) => cells.push(Object.assign({ col: o.col + c, row: o.row + r, yaw: 0, dir: 2, kind: 'pose' }, f))));
        } else if (id === 'sv') {
            SV_MOTIONS.forEach(([motion, loop], i) => {
                const clip = SV_CLIPS[motion];
                const row = clip === 'walk' ? [{ clip: 'walk', at: 'stepA' }, { clip: 'walk', at: 'pass' }, { clip: 'walk', at: 'stepB' }]
                    : clip === 'run' ? RUN : motion === 'dead' ? frames(clip, [0.97, 0.97, 0.97]) : frames(clip, clip === 'idle' ? LOOP : loop ? HOLD : ONCE);
                const kind = clip === 'walk' || clip === 'run' || clip === 'idle' ? 'move' : 'pose';
                row.forEach((f, c) => cells.push(Object.assign({ col: Math.floor(i / 6) * 3 + c, row: i % 6, yaw: motion === 'escape' ? SV_ESCAPE_YAW : SV_YAW, kind, motion, loop }, f)));
            });
        } else if (id === 'face') {
            const list = options.expressions || facePresets()[0].expressions;
            // (`only`: the first so many portraits alone, for a sheet put together from several characters.)
            const count = Number.isInteger(options.only) ? Math.max(1, Math.min(8, options.only)) : 8;
            for (let i = 0; i < count; i++) cells.push({ col: i % 4, row: Math.floor(i / 4), clip: 'idle', at: 0, yaw: options.view === 'three' ? 22 : 0, kind: 'face', expression: list[i] || 'neutral' });
        }
        return cells;
    }

    /** The clip a cell plays: the first of its wanted clips the character has (`has(id)`), else Idle. */
    function resolveClip(name, has) {
        if (name === 'idle') return 'idle';
        for (const id of CLIPS[name] || [name]) if (has(id)) return id;
        return 'idle';
    }

    /**
     * The character sheets' world scale (pixels a metre): a 1.68 m character
     * standing in a `tile`-wide cell with its outline, as the 'mz' sheet
     * draws one (a 48 px cell: 44 px of room, about 26 px a metre). Props
     * drawn at it stand beside exported characters at their true size.
     */
    const STANDARD_HEIGHT = 1.68;
    function pixelsPerMeter(tile = 48) {
        const m = cellMetrics(tile, tile, true);
        return (m.baseline - m.top) / STANDARD_HEIGHT;
    }

    /** Where the feet stand and how much room a frame has in a cell w × h (pixels). */
    function cellMetrics(w, h, outline) {
        const pad = outline ? 1 : 0;
        return {
            w, h,
            side: Math.max(1, Math.round(w * 0.04)) + pad,
            top: Math.max(1, Math.round(h * 0.02)) + pad,
            baseline: h - Math.max(1, Math.round(h * 0.03)) - pad
        };
    }

    /**
     * One scale for every frame (pixels per meter) and each frame's anchor:
     * the pixel the character's origin (between its feet, on the floor)
     * lands on. `bounds` per frame: { minX, maxX, minY, maxY } on the camera's
     * plane (meters, y up, the origin at 0, 0) and `kind`. Every 'move' frame
     * shares one anchor, the lowest foot of them all on the baseline, so the
     * feet keep one line from frame to frame. A 'pose' frame shares it too,
     * unless it reaches lower (lying toward the camera) or stands off the
     * floor (a jump): then its own lowest point is on the baseline. A frame is
     * centered on its feet, a pose that would not fit so on itself.
     */
    function fit(bounds, m) {
        const halfRoom = m.w / 2 - m.side, wideRoom = m.w - 2 * m.side, tallRoom = m.baseline - m.top;
        let lowMove = 0;
        for (const b of bounds) if (b.kind !== 'pose' && b.minY < lowMove) lowMove = b.minY;
        const lowOf = b => (b.kind === 'pose' && (b.minY > 0 || b.minY < lowMove) ? b.minY : lowMove);
        let scale = Infinity;
        for (const b of bounds) {
            const tall = b.maxY - lowOf(b);
            if (tall > 0) scale = Math.min(scale, tallRoom / tall);
            const half = Math.max(-b.minX, b.maxX), wide = b.maxX - b.minX;
            if (b.kind === 'pose') { if (wide > 0) scale = Math.min(scale, wideRoom / wide); } else if (half > 0) scale = Math.min(scale, halfRoom / half);
        }
        if (!Number.isFinite(scale) || scale <= 0) scale = 1;
        const anchors = bounds.map(b => {
            let x = m.w / 2;
            if (b.kind === 'pose' && Math.max(-b.minX, b.maxX) * scale > halfRoom) {
                x = m.w / 2 - (b.minX + b.maxX) / 2 * scale;
                x = Math.min(m.w - m.side - b.maxX * scale, Math.max(m.side - b.minX * scale, x));
            }
            return { x, y: m.baseline + lowOf(b) * scale };
        });
        return { scale, anchors };
    }

    /** A portrait: the cell spans `span` meters top to bottom, the eyes on one line at 42% down, centered. */
    function fitFace(eye, m, span) {
        const scale = m.h / span;
        return { scale, anchor: { x: m.w / 2 - eye.x * scale, y: m.h * 0.42 + eye.y * scale } };
    }

    /** The orthographic camera's frustum (meters, camera plane) that draws `anchor` and `scale` into a cell w × h. */
    function frustum(anchor, scale, w, h) {
        return { left: -anchor.x / scale, right: (w - anchor.x) / scale, top: anchor.y / scale, bottom: (anchor.y - h) / scale };
    }

    /** A point on the camera's plane, for a camera raised `elevation` degrees, looking at the origin. */
    function project(x, y, z, elevation) {
        const e = elevation * Math.PI / 180;
        return [x, y * Math.cos(e) - z * Math.sin(e)];
    }

    /**
     * k × k pixels of a premultiplied RGBA picture (rows bottom-up when
     * `flip`, as WebGL reads them) into one straight-alpha pixel.
     */
    function downsample(src, sw, sh, k, flip) {
        const w = Math.floor(sw / k), h = Math.floor(sh / k), out = new Uint8ClampedArray(w * h * 4), n = k * k;
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
            let r = 0, g = 0, b = 0, a = 0;
            for (let j = 0; j < k; j++) {
                const sy = flip ? sh - 1 - (y * k + j) : y * k + j;
                let i = (sy * sw + x * k) * 4;
                for (let q = 0; q < k; q++, i += 4) { r += src[i]; g += src[i + 1]; b += src[i + 2]; a += src[i + 3]; }
            }
            const o = (y * w + x) * 4;
            if (a < 6 * n) continue;
            out[o] = Math.min(255, r * 255 / a); out[o + 1] = Math.min(255, g * 255 / a); out[o + 2] = Math.min(255, b * 255 / a);
            out[o + 3] = a / n;
        }
        return out;
    }

    /** A one-pixel dark line round the figure, in a darker shade of what it borders. */
    /** `dark`: how dark the ring is against the pixel inside it (0.28; a prop's foliage takes a lighter one). */
    function outline(px, w, h, dark) {
        const k = Number.isFinite(dark) ? dark : null;
        const src = px.slice();
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
            const o = (y * w + x) * 4;
            if (src[o + 3] >= 96) continue;
            let best = -1, ba = 0;
            for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                const nx = x + dx, ny = y + dy;
                if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
                const n = (ny * w + nx) * 4;
                if (src[n + 3] >= 96 && src[n + 3] > ba) { ba = src[n + 3]; best = n; }
            }
            if (best < 0) continue;
            px[o] = src[best] * (k ?? 0.28); px[o + 1] = src[best + 1] * (k ?? 0.25); px[o + 2] = src[best + 2] * (k ?? 0.28); px[o + 3] = 255;
        }
        return px;
    }

    /** A cell's pixels into the sheet at frame (col, row). */
    function blit(sheet, sheetWidth, cell, w, h, col, row) {
        for (let y = 0; y < h; y++) sheet.set(cell.subarray(y * w * 4, (y + 1) * w * 4), ((row * h + y) * sheetWidth + col * w) * 4);
    }

    /** The alpha bounds of the cell (col, row) of a sheet, in the cell's pixels, or null when it is empty. */
    function alphaBounds(sheet, sheetWidth, w, h, col, row) {
        let minX = Infinity, minY = Infinity, maxX = -1, maxY = -1;
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
            if (sheet[((row * h + y) * sheetWidth + col * w + x) * 4 + 3] < 8) continue;
            minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
        }
        return maxX < 0 ? null : { minX, minY, maxX, maxY };
    }

    /** The styles a sheet is drawn in; 'chibi' changes only the copy drawn, never the character. */
    const STYLES = [{ id: 'realistic', label: 'Realistic' }, { id: 'chibi', label: 'RPG chibi' }];
    const LOOKS = [{ id: 'smooth', label: 'Smooth' }, { id: 'pixel', label: 'Pixel art' }, { id: 'cel', label: 'Pixel art, drawn' }];

    /** The builder's anime eyes: large irises with a catchlight. */
    const ANIME_EYES = { shapes: { eyeSize: 1.1 }, morph: { eyeWide: 1.1, eyeTall: 1.3 }, eyes: { size: 1.45, pupilSize: 1.15, catchlight: true } };

    /**
     * A human recipe drawn as RPG art: short limbs and trunk, a broad build,
     * big hands and feet, a young soft face (round cheeks, a small jaw, nose
     * and mouth) and anime eyes. The head's size is set when drawing
     * (headScale), so the figure is about 2.7 heads tall.
     */
    function chibiRecipe(recipe) {
        const r = JSON.parse(JSON.stringify(recipe || {}));
        const sh = r.shapes = r.shapes || {};
        const add = (key, by, lo, hi) => { sh[key] = Math.max(lo, Math.min(hi, (Number(sh[key]) || 0) + by)); };
        const set = (key, to) => { sh[key] = to; };
        r.headSize = Math.min(2.2, Math.max(1, Number(r.headSize) || 1) * 1.25);
        r.age = Math.max(16, Math.min(20, Number(r.age) || 20));
        add('legLength', -2.2, -2.5, 2.5);
        add('armLength', -1.6, -2.5, 2.5);
        add('torsoLength', -0.8, -2.5, 2.5);
        add('neckLength', -1.8, -2.5, 2.5);
        add('handSize', 1, -3, 3);
        add('footSize', 1.2, -3, 3);
        add('shoulders', 1.2, -2.5, 2.5);
        add('chest', 0.4, -2.5, 2.5);
        add('hips', 0.3, -3, 3);
        // The face: round and young, its features small.
        add('headFat', 0.9, -3, 3);
        set('cheeks', 0.8); set('cheekBones', -0.4);
        set('jaw', -1); set('chin', -0.6); set('chinWidth', -0.4); set('chinPointed', 0); set('chinCleft', 0); set('underbite', 0);
        set('noseWidth', -0.8); set('noseLength', -0.9); set('noseDepth', -1); set('noseVolume', -0.6); set('noseHump', -0.5);
        set('mouthWidth', -0.8); set('headAge', -1); set('eyeBags', 0); set('doubleChin', 0);
        Object.assign(sh, ANIME_EYES.shapes);
        r.morph = Object.assign({}, r.morph, ANIME_EYES.morph);
        r.eyes = Object.assign({}, r.eyes, ANIME_EYES.eyes);
        return r;
    }

    /**
     * The head's scale that makes a figure `heads` heads tall, the head
     * grown up from its chin: the chin at `chin` above the feet, the head
     * `tall` from chin to crown.
     */
    function headScale(chin, tall, heads = 2.8) {
        if (!(chin > 0) || !(tall > 0)) return 1;
        return Math.max(1, Math.min(2.6, chin / ((heads - 1) * tall)));
    }

    /** A built human's head: its joint's height, its chin and its crown (the body's own skin, at rest). */
    function headMeasure(result) {
        const bi = result && result.bones ? result.bones.findIndex(b => b.name === 'Head') : -1;
        const body = result && result.parts && result.parts.find(p => p.name === 'Body');
        if (bi < 0 || !body) return null;
        const P = body.positions, J = body.joints, W = body.weights;
        let crown = -Infinity, chin = Infinity;
        for (let v = 0; v < P.length / 3; v++) {
            const y = P[v * 3 + 1];
            if (y > crown) crown = y;
            let w = 0;
            for (let k = 0; k < 4; k++) if (J[v * 4 + k] === bi) w += W[v * 4 + k];
            if (w > 0.95 && y < chin) chin = y;
        }
        return Number.isFinite(chin) ? { joint: result.bones[bi].head[1], chin, crown } : null;
    }

    /**
     * Stock-art values (the darkest tenth, the mean and the color of MZ's own
     * sheets): the darks opened up so a dark outfit keeps its folds, then
     * more contrast and color. Straight-alpha RGBA, in place.
     */
    /** `soft`: lift the darks without the contrast (a prop: dark foliage would go black). */
    function grade(px, soft) {
        const lut = new Uint8ClampedArray(256);
        for (let v = 0; v < 256; v++) {
            const x = Math.pow(v / 255, soft ? 0.72 : 0.82);
            lut[v] = Math.round(255 * Math.min(1, Math.max(0, soft ? x : (x - 0.36) * 1.38 + 0.36)));
        }
        for (let i = 0; i < px.length; i += 4) {
            if (!px[i + 3]) continue;
            const r = lut[px[i]], g = lut[px[i + 1]], b = lut[px[i + 2]], y = 0.299 * r + 0.587 * g + 0.114 * b;
            const k = 1.22 - 0.3 * skinLike(r, g, b);
            px[i] = y + (r - y) * k; px[i + 1] = y + (g - y) * k; px[i + 2] = y + (b - y) * k;
        }
        return px;
    }

    /** How much a color reads as skin (0..1): red over green over blue, an orange hue, neither gray nor vivid. */
    function skinLike(r, g, b) {
        if (!(r >= g && g >= b) || r - b < 8) return 0;
        const hue = 60 * (g - b) / (r - b), sat = (r - b) / r;
        const h = hue < 8 || hue > 52 ? 0 : hue < 14 ? (hue - 8) / 6 : hue > 42 ? (52 - hue) / 10 : 1;
        const s = sat < 0.1 || sat > 0.8 ? 0 : sat < 0.18 ? (sat - 0.1) / 0.08 : sat > 0.68 ? (0.8 - sat) / 0.12 : 1;
        return h * s;
    }

    /** Hard edges: every pixel fully drawn or empty. */
    function threshold(px) {
        for (let i = 3; i < px.length; i += 4) px[i] = px[i] >= 128 ? 255 : 0;
        return px;
    }

    /**
     * The sheet's colors cut to a palette of `count` (k-means over a 15-bit
     * histogram of its drawn pixels), so flat areas read as flat. In place.
     */
    function quantize(px, count) {
        const found = clusters(px, count);
        if (!found) return px;
        for (let i = 0; i < px.length; i += 4) {
            if (!px[i + 3]) continue;
            const c = found.centers[found.owner[((px[i] >> 3) << 10) | ((px[i + 1] >> 3) << 5) | (px[i + 2] >> 3)]];
            px[i] = c[0]; px[i + 1] = c[1]; px[i + 2] = c[2];
        }
        return px;
    }

    /** The drawn pixels of an RGBA picture as `count` colors: their centers, and each 15-bit color's center (`owner`). */
    function clusters(px, count) {
        const hist = new Float64Array(32768);
        for (let i = 0; i < px.length; i += 4) if (px[i + 3]) hist[((px[i] >> 3) << 10) | ((px[i + 1] >> 3) << 5) | (px[i + 2] >> 3)]++;
        const bins = [];
        for (let b = 0; b < 32768; b++) if (hist[b]) bins.push(b);
        if (!bins.length) return null;
        const colorOf = b => [((b >> 10) & 31) * 8 + 4, ((b >> 5) & 31) * 8 + 4, (b & 31) * 8 + 4];
        const k = Math.min(count, bins.length);
        // Seeds spread by brightness.
        bins.sort((a, b) => { const ca = colorOf(a), cb = colorOf(b); return (ca[0] + ca[1] + ca[2]) - (cb[0] + cb[1] + cb[2]); });
        let centers = Array.from({ length: k }, (_, i) => colorOf(bins[Math.floor((i + 0.5) / k * bins.length)]));
        const owner = new Int32Array(32768).fill(-1);
        for (let pass = 0; pass < 10; pass++) {
            const sum = centers.map(() => [0, 0, 0, 0]);
            for (const b of bins) {
                const c = colorOf(b);
                let best = 0, bd = Infinity;
                for (let j = 0; j < k; j++) { const d = (c[0] - centers[j][0]) ** 2 + (c[1] - centers[j][1]) ** 2 + (c[2] - centers[j][2]) ** 2; if (d < bd) { bd = d; best = j; } }
                owner[b] = best;
                const w = hist[b], t = sum[best];
                t[0] += c[0] * w; t[1] += c[1] * w; t[2] += c[2] * w; t[3] += w;
            }
            centers = centers.map((c, j) => (sum[j][3] ? [sum[j][0] / sum[j][3], sum[j][1] / sum[j][3], sum[j][2] / sum[j][3]] : c));
        }
        return { centers, owner };
    }

    // ── Pixel art, drawn ('cel') ──────────────────────────────────────────────────────────────────────────────
    // A small sprite a pixel artist draws is flat areas of a few chosen colors, each in two or three tones, with
    // hard edges. A render scaled down is none of that: every pixel is a blend of what lay under it. So the
    // character is drawn twice, lit and unlit. The unlit picture says what each pixel IS (the commonest surface
    // color under it, never a blend of two); the lit one says how bright that surface is there. The sheet's
    // surface colors are cut to a short list, and each is drawn in a few tones (shadow, base, light, and a glint on what shines) decided by
    // the light, the same list and tones on every frame.

    const luma = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;
    /** Shadow, base, light, glint. */
    const TONES = 4;

    /**
     * One frame's k × k samples (premultiplied RGBA, rows bottom-up) into what each of its w × h pixels is:
     * `albedo` its surface color (the commonest among its samples), `shown` that surface as the lit picture has
     * it, `light` how bright the lit picture is there against the surface color, `alpha` 255 where at least half the samples are drawn.
     */
    function celCell(lit, flat, sw, sh, k) {
        const w = Math.floor(sw / k), h = Math.floor(sh / k), n = k * k;
        const albedo = new Uint8ClampedArray(w * h * 3), shown = new Uint8ClampedArray(w * h * 3), light = new Float32Array(w * h), alpha = new Uint8Array(w * h);
        const bin = new Int32Array(n), at = new Int32Array(n);
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
            let count = 0;
            for (let j = 0; j < k; j++) {
                let i = ((sh - 1 - (y * k + j)) * sw + x * k) * 4;
                for (let q = 0; q < k; q++, i += 4) {
                    const a = flat[i + 3];
                    if (a < 128) continue;
                    bin[count] = ((flat[i] * 255 / a) >> 4 << 8) | ((flat[i + 1] * 255 / a) >> 4 << 4) | ((flat[i + 2] * 255 / a) >> 4);
                    at[count++] = i;
                }
            }
            if (count * 2 < n) continue;
            let best = bin[0], most = 0;
            for (let c = 0; c < count; c++) {
                let same = 0;
                for (let d = 0; d < count; d++) if (bin[d] === bin[c]) same++;
                if (same > most) { most = same; best = bin[c]; }
            }
            let r = 0, g = 0, b = 0, bright = 0, lr = 0, lg = 0, lb = 0;
            for (let c = 0; c < count; c++) {
                if (bin[c] !== best) continue;
                const i = at[c], a = flat[i + 3], la = Math.max(1, lit[i + 3]);
                r += flat[i] * 255 / a; g += flat[i + 1] * 255 / a; b += flat[i + 2] * 255 / a;
                bright += luma(lit[i], lit[i + 1], lit[i + 2]) * 255 / la;
                lr += lit[i] * 255 / la; lg += lit[i + 1] * 255 / la; lb += lit[i + 2] * 255 / la;
            }
            const o = y * w + x;
            albedo[o * 3] = r / most; albedo[o * 3 + 1] = g / most; albedo[o * 3 + 2] = b / most;
            shown[o * 3] = lr / most; shown[o * 3 + 1] = lg / most; shown[o * 3 + 2] = lb / most;
            light[o] = (bright / most) / Math.max(10, luma(r / most, g / most, b / most));
            alpha[o] = 255;
        }
        return { albedo, shown, light, alpha, w, h };
    }

    /**
     * Where the eyes are in a frame w pixels wide, for the ones turned toward the camera: a small sprite's
     * eyes are drawn, two or three dark pixels each, because at this size a rendered eye is a smudge or
     * nothing. Each `{ x, y }` is in the frame's pixels.
     */
    function eyeMarks(builder, camera, w, h) {
        const view = builder._view, THREE = root.THREE, parts = (builder._result && builder._result.parts) || [];
        const k = parts.findIndex(p => p.name === 'Eyes'), mesh = k >= 0 ? view.meshes[k] : null;
        const head = view.bones.find(b => b.name === 'Head');
        if (!mesh || !head || !mesh.geometry.getAttribute('position')) return [];
        const rest = mesh.geometry.getAttribute('position'), v = new THREE.Vector3();
        const sides = [{ sum: new THREE.Vector3(), n: 0, sign: -1 }, { sum: new THREE.Vector3(), n: 0, sign: 1 }];
        for (let i = 0; i < rest.count; i++) {
            const side = sides[rest.getX(i) < 0 ? 0 : 1];
            if (typeof mesh.getVertexPosition === 'function') mesh.getVertexPosition(i, v); else v.fromBufferAttribute(rest, i);
            side.sum.add(v.applyMatrix4(mesh.matrixWorld)); side.n++;
        }
        const q = head.getWorldQuaternion(new THREE.Quaternion());
        const toCamera = camera.getWorldDirection(new THREE.Vector3()).negate(), out = [];
        for (const side of sides) {
            if (!side.n) continue;
            // An eye looks a little outward of straight ahead: seen from the side, the near one shows and the far one does not.
            const facing = new THREE.Vector3(side.sign * 0.45, 0, 1).normalize().applyQuaternion(q);
            if (facing.dot(toCamera) < 0.28) continue;
            const at = side.sum.multiplyScalar(1 / side.n).project(camera);
            out.push({ x: (at.x * 0.5 + 0.5) * w, y: (1 - (at.y * 0.5 + 0.5)) * h });
        }
        return out;
    }

    /** A surface color's three tones: a shadow that leans cool and keeps its color, the color, a light that leans warm. */
    function celRamp(c) {
        const y = luma(c[0], c[1], c[2]), sat = v => y + (v - y) * 1.06;
        const base = [sat(c[0]), sat(c[1]), sat(c[2])];
        const shadow = base.map((v, i) => (v * 0.62) * 0.86 + [38, 30, 72][i] * 0.14 * (0.35 + y / 255));
        const lift = y < 60 ? 0.2 : 0.3;
        const lightTone = base.map((v, i) => v + ([255, 248, 226][i] - v) * lift);
        // A glint, for what shines: polished metal is its highlights.
        const glint = base.map((v, i) => v + ([255, 252, 240][i] - v) * 0.72);
        return [shadow, base, lightTone, glint].map(t => t.map(v => Math.max(0, Math.min(255, Math.round(v)))));
    }

    /**
     * The frames `celCell` read, drawn: the sheet's surface colors cut to `colors`, each pixel's tone from how its
     * light stands against the usual light on its color, lone pixels taken into what surrounds them. Returns one
     * straight-alpha RGBA picture per frame.
     */
    function celDraw(cells, colors = 12) {
        let total = 0;
        for (const c of cells) for (let o = 0; o < c.alpha.length; o++) if (c.alpha[o]) total++;
        const all = new Uint8ClampedArray(total * 4);
        let t = 0;
        for (const c of cells) for (let o = 0; o < c.alpha.length; o++) if (c.alpha[o]) { all[t] = c.albedo[o * 3]; all[t + 1] = c.albedo[o * 3 + 1]; all[t + 2] = c.albedo[o * 3 + 2]; all[t + 3] = 255; t += 4; }
        const found = clusters(all, colors);
        if (!found) return cells.map(c => new Uint8ClampedArray(c.w * c.h * 4));
        const baseOf = (c, o) => found.owner[((c.albedo[o * 3] >> 3) << 10) | ((c.albedo[o * 3 + 1] >> 3) << 5) | (c.albedo[o * 3 + 2] >> 3)];
        // The usual light on each color, over the whole sheet: a tone means the same thing on every frame.
        const lights = found.centers.map(() => []);
        for (const c of cells) for (let o = 0; o < c.alpha.length; o++) if (c.alpha[o]) lights[baseOf(c, o)].push(c.light[o]);
        const usual = lights.map(list => { list.sort((a, b) => a - b); return list.length ? list[list.length >> 1] : 1; });
        // Each color as the builder shows it: the lit picture's own color where the light on it is the usual one,
        // graded as every sheet is. The unlit picture only says which pixels are one surface.
        const seen = found.centers.map(() => [0, 0, 0, 0]);
        for (const c of cells) for (let o = 0; o < c.alpha.length; o++) {
            if (!c.alpha[o]) continue;
            const base = baseOf(c, o), rel = c.light[o] / Math.max(0.05, usual[base]);
            if (rel < 0.9 || rel > 1.1) continue;
            const t = seen[base];
            t[0] += c.shown[o * 3]; t[1] += c.shown[o * 3 + 1]; t[2] += c.shown[o * 3 + 2]; t[3]++;
        }
        const ramps = found.centers.map((center, j) => {
            const t = seen[j];
            if (!t[3]) return celRamp(center);
            const px = grade(new Uint8ClampedArray([t[0] / t[3], t[1] / t[3], t[2] / t[3], 255]));
            return celRamp([px[0], px[1], px[2]]);
        });
        return cells.map(c => {
            const key = new Int16Array(c.w * c.h).fill(-1);
            for (let o = 0; o < key.length; o++) {
                if (!c.alpha[o]) continue;
                const base = baseOf(c, o), rel = c.light[o] / Math.max(0.05, usual[base]);
                key[o] = base * TONES + (rel < 0.84 ? 0 : rel > 1.6 ? 3 : rel > 1.14 ? 2 : 1);
            }
            // A pixel alone among others is noise at this size: it joins the commonest of its neighbours.
            const clean = key.slice();
            for (let y = 0; y < c.h; y++) for (let x = 0; x < c.w; x++) {
                const o = y * c.w + x;
                if (key[o] < 0) continue;
                const near = [];
                for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                    const nx = x + dx, ny = y + dy;
                    if (nx >= 0 && ny >= 0 && nx < c.w && ny < c.h && key[ny * c.w + nx] >= 0) near.push(key[ny * c.w + nx]);
                }
                if (near.length < 3 || near.includes(key[o])) continue;
                near.sort((a, b) => a - b);
                let pick = near[0], run = 1, bestRun = 1;
                for (let i = 1; i < near.length; i++) { run = near[i] === near[i - 1] ? run + 1 : 1; if (run > bestRun) { bestRun = run; pick = near[i]; } }
                if (bestRun >= 2) clean[o] = pick;
            }
            const px = new Uint8ClampedArray(c.w * c.h * 4);
            for (let o = 0; o < clean.length; o++) {
                if (clean[o] < 0) continue;
                const tone = ramps[Math.floor(clean[o] / TONES)][clean[o] % TONES];
                px[o * 4] = tone[0]; px[o * 4 + 1] = tone[1]; px[o * 4 + 2] = tone[2]; px[o * 4 + 3] = 255;
            }
            // The eyes, drawn: dark pixels where each eye is, only on skin (hair over an eye hides it).
            const tall = Math.max(2, Math.round(c.h / 22)), wide = Math.max(1, Math.round(c.w / 34));
            for (const eye of c.eyes || []) {
                const x0 = Math.round(eye.x - wide / 2), y0 = Math.round(eye.y - tall / 2);
                for (let dy = 0; dy < tall; dy++) for (let dx = 0; dx < wide; dx++) {
                    const x = x0 + dx, y = y0 + dy, o = y * c.w + x;
                    if (x < 0 || y < 0 || x >= c.w || y >= c.h || !c.alpha[o]) continue;
                    if (skinLike(c.albedo[o * 3], c.albedo[o * 3 + 1], c.albedo[o * 3 + 2]) < 0.2) continue;
                    const dark = dy === 0 && tall > 2 ? [70, 52, 60] : [34, 26, 40];
                    px[o * 4] = dark[0]; px[o * 4 + 1] = dark[1]; px[o * 4 + 2] = dark[2];
                }
            }
            return px;
        });
    }

    /** The view drawn unlit for a moment: every surface in its own color, no shading, no reflections, no tone curve. */
    function flatLight(THREE, view, renderer) {
        const lights = [], materials = new Map();
        view.scene.traverse(node => {
            if (node.isLight) lights.push([node, node.visible]);
            for (const m of [node.material].flat().filter(Boolean)) if (!materials.has(m)) materials.set(m, m.envMapIntensity);
        });
        // Pi: an ambient light of 1 lights a surface to its color over pi (three's physical units).
        const ambient = new THREE.AmbientLight(0xffffff, Math.PI);
        ambient.visible = false;
        view.scene.add(ambient);
        let kept = null;
        return {
            on() {
                kept = { environment: view.scene.environment, tone: renderer.toneMapping, exposure: renderer.toneMappingExposure };
                for (const [light] of lights) light.visible = false;
                for (const m of materials.keys()) if (m.envMapIntensity !== undefined) m.envMapIntensity = 0;
                ambient.visible = true;
                view.scene.environment = null;
                renderer.toneMapping = THREE.NoToneMapping;
                renderer.toneMappingExposure = 1;
            },
            off() {
                if (!kept) return;
                for (const [light, visible] of lights) light.visible = visible;
                for (const [m, intensity] of materials) if (intensity !== undefined) m.envMapIntensity = intensity;
                ambient.visible = false;
                view.scene.environment = kept.environment;
                renderer.toneMapping = kept.tone;
                renderer.toneMappingExposure = kept.exposure;
                kept = null;
            },
            dispose() { this.off(); view.scene.remove(ambient); ambient.dispose(); }
        };
    }

    function safeName(name) {
        return String(name || '').trim().replace(/[\\/:*?"<>|$!\[\]]+/g, '').replace(/\s+/g, ' ').slice(0, 48);
    }

    /** The sheet's file name: `$Name[8D].png`, `$Name.png`, `Name.png`; at n frames other than 3, `$Name[8D][6F].png`, `$Name[6F].png`. */
    function fileName(id, name, n) {
        const l = layout(id);
        return l.prefix + safeName(name) + l.tag + frameTag(framesOf(l.id, n)) + '.png';
    }

    // ── rendering (in the builder, on its own view) ───────────────────────

    const STEP_SAMPLES = 24;

    /** The builder's pose `clip` at `at` (a fraction of the clip, or a step of a walk) on its skeleton, stood on the floor. */
    function poser(builder) {
        const view = builder._view, THREE = root.THREE, steps = new Map(), at = new THREE.Vector3(), ref = new THREE.Vector3();
        const bone = name => view.bones.find(b => b.name === name);
        const apply = (id, t) => {
            view.mixer.stopAllAction();
            for (const b of view.bones) { b.position.copy(b.userData.rest.p); b.quaternion.identity(); }
            const action = builder._poseAction(id);
            if (!action) { view.action = null; view.poseMeta = null; view.group.position.y = 0; view.group.updateMatrixWorld(true); return; }
            action.reset(); action.play();
            action.time = Math.min(t, 0.999) * (action.getClip().duration || 0);
            view.mixer.update(0);
            view.action = action;
            view.poseMeta = view.actions.get(id) ? view.actions.get(id).meta : null;
            builder._plant();
            view.group.updateMatrixWorld(true);
        };
        /**
         * A clip's marks, as fractions of it: a walk's two steps (each foot
         * furthest ahead) and its passing frame; the key pose (the joints
         * furthest from where the clip starts) and frames either side of it.
         */
        /** The top of the head standing at rest (world height). */
        let crown = null;
        const crownOf = () => {
            if (crown !== null) return crown;
            apply('idle', 0);
            crown = -Infinity;
            const v = new THREE.Vector3();
            for (const mesh of view.meshes) {
                const count = mesh.geometry.getAttribute('position').count, stride = Math.max(1, Math.floor(count / 2000));
                for (let i = 0; i < count; i += stride) { mesh.getVertexPosition(i, v); v.applyMatrix4(mesh.matrixWorld); if (v.y > crown) crown = v.y; }
            }
            return crown;
        };
        const marksOf = id => {
            if (steps.has(id)) return steps.get(id);
            const left = bone('LeftFoot'), right = bone('RightFoot'), hands = [bone('LeftHand'), bone('RightHand')].filter(Boolean);
            const found = { stepA: 0, pass: 0.25, stepB: 0.5, key: 0.5, overhead: -1 };
            const yaw = view.group.rotation.y;
            view.group.rotation.y = 0;
            // Hands held overhead stop at the brow: the frame keeps the head's height.
            const top = hands.length === 2 ? crownOf() - 0.14 * (view.bodyHeight || 1.7) : Infinity;
            let hi = -Infinity, lo = Infinity, mid = Infinity, far = -1, start = null, held = -Infinity;
            for (let i = 0; i < STEP_SAMPLES; i++) {
                const t = i / STEP_SAMPLES;
                apply(id, t);
                const q = view.bones.map(b => b.quaternion.clone());
                if (!start) start = q;
                let d = 0;
                for (let k = 0; k < q.length; k++) d += 1 - Math.abs(q[k].dot(start[k]));
                if (d > far) { far = d; found.key = t; }
                // Hands held overhead: as high as they go without reaching past the top of the head.
                if (hands.length === 2) {
                    hands[0].getWorldPosition(at); hands[1].getWorldPosition(ref);
                    const low = Math.min(at.y, ref.y), high = Math.max(at.y, ref.y);
                    if (high <= top && low > held) { held = low; found.overhead = t; }
                }
                if (left && right) {
                    left.getWorldPosition(at); right.getWorldPosition(ref);
                    const z = at.z - ref.z;
                    if (z > hi) { hi = z; found.stepA = t; }
                    if (z < lo) { lo = z; found.stepB = t; }
                    if (Math.abs(z) < mid) { mid = Math.abs(z); found.pass = t; }
                }
            }
            view.group.rotation.y = yaw;
            if (found.overhead < 0) found.overhead = found.key;
            found.rise = found.key * 0.55;
            found.start = found.key * 0.2;
            found.after = Math.min(0.97, found.key + (1 - found.key) * 0.35);
            found.keyBefore = Math.max(0, found.key - 0.05);
            found.keyAfter = Math.min(0.97, found.key + 0.05);
            steps.set(id, found);
            return found;
        };
        const timeOf = (id, t) => (typeof t === 'number' ? t : marksOf(id)[t]);
        // `more` (a cell): `to` and `u`, a time u of the way on to `to`; `shift`, that much further round the clip.
        return (id, t, yawDeg, more) => {
            view.group.rotation.y = (yawDeg || 0) * Math.PI / 180;
            let time = timeOf(id, t);
            if (more && more.to !== undefined) time += (timeOf(id, more.to) - time) * (more.u || 0);
            if (more && more.shift) time = (time + more.shift) % 1;
            apply(id, time);
        };
    }

    /** The posed character's extent on the camera's plane: a sample of every mesh's skinned vertices. */
    function measure(view, elevation) {
        const THREE = root.THREE, v = new THREE.Vector3();
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        for (const mesh of view.meshes) {
            if (!mesh.visible) continue;
            const count = mesh.geometry.getAttribute('position').count, stride = Math.max(1, Math.floor(count / 2500));
            for (let i = 0; i < count; i += stride) {
                mesh.getVertexPosition(i, v);
                v.applyMatrix4(mesh.matrixWorld);
                const [x, y] = project(v.x, v.y, v.z, elevation);
                if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
            }
        }
        return { minX, maxX, minY, maxY };
    }

    /** Where the eyes are, posed, on the camera's plane; the head's joint when there are no eyes. */
    function eyeLine(builder, elevation) {
        const view = builder._view, THREE = root.THREE, v = new THREE.Vector3(), sum = new THREE.Vector3();
        const parts = (builder._result && builder._result.parts) || [];
        const k = parts.findIndex(p => p.name === 'Eyes');
        let n = 0;
        if (k >= 0 && view.meshes[k]) {
            const mesh = view.meshes[k], count = mesh.geometry.getAttribute('position').count;
            for (let i = 0; i < count; i++) { mesh.getVertexPosition(i, v); v.applyMatrix4(mesh.matrixWorld); sum.add(v); n++; }
        }
        if (!n) {
            const head = view.bones.find(b => b.name === 'Head') || view.bones[view.bones.length - 1];
            head.getWorldPosition(sum);
            sum.y += 0.07 * (view.bodyHeight || 1.7) / 1.7;
            n = 1;
        }
        sum.divideScalar(n);
        const [x, y] = project(sum.x, sum.y, sum.z, elevation);
        return { x, y };
    }

    /** The expression a face cell asks for, on the character's face, when the builder can make expressions. */
    function setExpression(builder, id) {
        const X = root.RRCharacterExpressions;
        if (!X || typeof X.apply !== 'function') return false;
        try { X.apply(builder, id || 'neutral'); return true; } catch (error) { console.warn('[RRCharacterSpriteSheet] expression', id, error); return false; }
    }

    function expressionList() {
        const X = root.RRCharacterExpressions;
        const list = X && Array.isArray(X.EXPRESSIONS) ? X.EXPRESSIONS.filter(e => e && e.id) : [];
        return list.some(e => e.id === 'neutral') ? list : [{ id: 'neutral', label: 'Neutral' }].concat(list);
    }

    /**
     * The sheet, drawn on the builder's own renderer: each cell posed,
     * measured, then drawn larger and shrunk into its cell, so its edges
     * are smooth and nothing reaches the next cell. `progress(done, total)`
     * is told as it goes; the page stays live between frames.
     */
    /** The view's cached pose actions dropped, so the next pose is worked out for the skeleton now shown. */
    function dropActions(view) {
        if (!view.mixer || !view.actions) return;
        view.mixer.stopAllAction();
        for (const a of view.actions.values()) view.mixer.uncacheClip(a.action.getClip());
        view.actions.clear();
    }

    /**
     * The builder's view showing a chibi copy of the character until the
     * returned function puts the character back; the recipe is untouched.
     */
    function showChibi(builder) {
        const view = builder._view, original = builder._result;
        if (!original || original.plan !== 'human' || !root.RRCharacterModel || !builder.pack) return null;
        const copy = root.RRCharacterModel.build(builder.pack, chibiRecipe(builder.recipe), builder.cache, {
            quality: 'preview', eyeSource: builder.eyeSource, bodyArtPictures: builder._artPictures,
            paintSkin: (key, args) => builder._paintSkin(key, args), hairBudget: builder._weak ? 0.45 : 1
        });
        builder._result = copy;
        builder._show(copy);
        dropActions(view);
        cancelAnimationFrame(view.loop); view.loop = 0;
        return () => {
            if (builder._result === copy) builder._result = original;
            if (builder._view === view) { builder._show(builder._result); dropActions(view); }
        };
    }

    /** RPG proportions past the sliders' reach: the hands and feet grown on their joints, the head to 2.7 heads tall. */
    const CHIBI_BONES = { LeftHand: 1.3, RightHand: 1.3, LeftFoot: 1.3, RightFoot: 1.3 };
    function enlarge(view, result) {
        const scales = Object.assign({}, CHIBI_BONES), head = view.bones.find(b => b.name === 'Head'), m = headMeasure(result);
        let lift = null;
        if (head && m) {
            // The head grows up from its chin: its joint rises by what the head grows below it.
            scales.Head = headScale(m.chin, m.crown - m.chin);
            lift = head.userData.rest.p.clone();
            head.userData.rest.p.y += (scales.Head - 1) * (m.joint - m.chin);
            head.position.copy(head.userData.rest.p);
        }
        const grown = view.bones.filter(b => scales[b.name]);
        for (const b of grown) b.scale.setScalar(scales[b.name]);
        view.group.updateMatrixWorld(true);
        return () => {
            for (const b of grown) b.scale.setScalar(1);
            if (lift) { head.userData.rest.p.copy(lift); head.position.copy(lift); }
            view.group.updateMatrixWorld(true);
        };
    }

    async function render(builder, settings, progress) {
        if (builder._sheetExporting) throw new Error('A sprite sheet is already being rendered.');
        const view = builder._view;
        const framing = view && { yaw: view.yaw, pitch: view.pitch, distance: view.distance, target: view.target?.clone() };
        const pose = builder.pose, time = view?.action?.time || 0;
        // Painting a skin or finishing a background build can queue a rebuild
        // while this loop yields. Keep the temporary chibi model for the whole
        // sheet, then let those jobs update the editor again.
        const exportState = builder._sheetExporting = { drawing: false };
        try {
            return await renderSheet(builder, settings, progress);
        } finally {
            delete builder._sheetExporting;
            if (view && builder._view === view) {
                Object.assign(view, { yaw: framing.yaw, pitch: framing.pitch, distance: framing.distance });
                if (framing.target) view.target.copy(framing.target);
                if (builder.pose === pose) {
                    view.resumeAt = time;
                    if (view.action) view.action.time = time;
                }
            }
            builder._syncPose();
            for (const job of exportState.clothReady || []) builder._clothReady(job.id, job.result);
            if (builder._sheetResizeOwed) {
                builder._sheetResizeOwed = false;
                builder._view?.resizeNow?.();
            }
            if (builder._rebuildOwed && builder._view) builder._queueRebuild();
        }
    }

    async function renderSheet(builder, settings, progress) {
        const THREE = root.THREE, view = builder._view;
        const rootElement = builder.root;
        if (!THREE || !view || !view.meshes.length || !view.mixer) throw new Error('The character is not built yet.');
        const l = layout(settings.layout), size = Math.max(16, Math.min(512, Math.round(settings.frame || l.frame)));
        const restore = settings.style === 'chibi' && settings.layout !== 'face' ? showChibi(builder) : null;
        const shrink = restore ? enlarge(view, builder._result) : null;
        const elevation = settings.layout === 'face' ? l.elevation : Math.max(0, Math.min(75, Number.isFinite(settings.elevation) ? settings.elevation : l.elevation));
        const cells = plan(settings.layout, { expressions: settings.expressions, view: settings.view, frames: settings.frames, only: settings.only });
        const poses = view.plan === 'quadruped' ? (root.RRCreatureBody && root.RRCreatureBody.POSES) : (root.RRCharacterPoses && root.RRCharacterPoses.POSES);
        const ids = new Set((poses || []).map(p => p.id));
        const has = id => id === 'idle' || (ids.has(id) && !!builder._poseAction(id));
        for (const c of cells) { c.clipId = resolveClip(c.clip, has); if (c.upper) c.upperId = resolveClip(c.upper, has); }
        const m = cellMetrics(size, size, settings.outline && settings.layout !== 'face');
        const pixelArt = settings.look === 'pixel' && settings.layout !== 'face';
        const cel = settings.look === 'cel' && settings.layout !== 'face';
        const k = Math.max(2, Math.min(6, Math.floor(512 / size)));
        const renderer = view.renderer, canvas = renderer.domElement;
        const saved = { ratio: renderer.getPixelRatio(), size: renderer.getSize(new THREE.Vector2()), action: view.action, yaw: view.group.rotation.y, floor: view.floor.visible, blob: view.blob.visible, visibility: canvas.style.visibility, clear: renderer.getClearAlpha() };
        cancelAnimationFrame(view.loop); view.loop = 0;
        cancelAnimationFrame(view.frame); view.frame = 0;
        builder._sheetExporting.drawing = true;
        canvas.style.visibility = 'hidden';
        // A sprite is seen small, on a bright map: a soft fill from the front and a rim from behind on top
        // of the studio's lights, a little brighter; the grade after lifts the darks.
        saved.exposure = renderer.toneMappingExposure;
        const portrait = settings.layout === 'face';
        renderer.toneMappingExposure = saved.exposure * (portrait ? 1 : 1.25);
        const fill = new THREE.DirectionalLight(0xfff8f0, portrait ? 0 : 0.9), rim = new THREE.DirectionalLight(0xe8f0ff, portrait ? 0 : 0.9);
        fill.position.set(0, 1.4, 3); rim.position.set(0.6, 2.6, -3);
        // Drawn pixel art takes its tones from one clear light: the fill that flattens it is turned down.
        if (cel) { fill.intensity = 0.3; rim.intensity = 0.35; }
        view.scene.add(fill, rim);
        const flat = cel ? flatLight(THREE, view, renderer) : null, celCells = [];
        view.floor.visible = false; view.blob.visible = false;
        const pose = poser(builder);
        const upperBones = view.bones.filter(b => /^(Spine1|Spine2|Neck|Head|(Left|Right)(Shoulder|Arm|ForeArm|Hand))/.test(b.name));
        const posed = c => {
            if (c.upperId && c.upperId !== 'idle') {
                pose(c.upperId, c.upperAt, c.yaw);
                const held = upperBones.map(b => b.quaternion.clone());
                pose(c.clipId, c.at, c.yaw, c);
                upperBones.forEach((b, i) => b.quaternion.copy(held[i]));
                view.group.updateMatrixWorld(true);
            } else pose(c.clipId, c.at, c.yaw, c);
        };
        const total = cells.length * 2;
        let done = 0, budget = performance.now();
        const breathe = async () => {
            done++;
            if (performance.now() - budget > 14) { if (progress) progress(done, total); await new Promise(r => setTimeout(r, 0)); budget = performance.now(); }
            if (builder._view !== view || builder.root !== rootElement) throw new Error('The sprite sheet preview was closed.');
        };
        const width = columnsOf(l.id, settings.frames) * size, height = l.rows * size, sheet = new Uint8ClampedArray(width * height * 4);
        try {
            // Measure every frame first: one scale holds for the whole sheet.
            let fitted, faceSpan = 0;
            if (settings.layout === 'face') {
                // About 33 cm of the face down the cell, as an RPG Maker face sheet frames it: brow to chin fill it, so an expression reads at 144 px.
                faceSpan = 0.33 * (view.bodyHeight || view.height || 1.7) / 1.7;
                done += cells.length;
            } else {
                const bounds = [];
                for (const c of cells) { posed(c); const b = measure(view, elevation); b.kind = c.kind; bounds.push(b); await breathe(); }
                fitted = fit(bounds, m);
            }
            const e = elevation * Math.PI / 180;
            const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.05, 60);
            camera.up.set(0, Math.cos(e), -Math.sin(e));
            camera.position.set(0, Math.sin(e) * 20, Math.cos(e) * 20);
            camera.lookAt(0, 0, 0);
            renderer.setPixelRatio(1);
            renderer.setSize(size * k, size * k, false);
            renderer.setClearColor(0x000000, 0);
            const gl = renderer.getContext(), pixels = new Uint8Array(size * k * size * k * 4);
            for (let i = 0; i < cells.length; i++) {
                const c = cells[i];
                posed(c);
                let f;
                if (faceSpan) {
                    // Each portrait framed on its own eyes, so the eye line holds whatever the expression moves.
                    setExpression(builder, c.expression);
                    view.group.updateMatrixWorld(true);
                    const face = fitFace(eyeLine(builder, elevation), m, faceSpan);
                    f = frustum(face.anchor, face.scale, size, size);
                } else f = frustum(fitted.anchors[i], fitted.scale, size, size);
                camera.left = f.left; camera.right = f.right; camera.top = f.top; camera.bottom = f.bottom;
                camera.updateProjectionMatrix();
                renderer.setRenderTarget(null);
                renderer.render(view.scene, camera);
                gl.readPixels(0, 0, size * k, size * k, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
                if (cel) {
                    // The same frame again unlit; the two are drawn together once every frame is read.
                    const unlit = new Uint8Array(pixels.length);
                    flat.on();
                    try { renderer.render(view.scene, camera); gl.readPixels(0, 0, size * k, size * k, gl.RGBA, gl.UNSIGNED_BYTE, unlit); } finally { flat.off(); }
                    celCells.push(Object.assign(celCell(pixels, unlit, size * k, size * k, k), { col: c.col, row: c.row, eyes: eyeMarks(builder, camera, size, size) }));
                    await breathe();
                    continue;
                }
                let px = downsample(pixels, size * k, size * k, k, true);
                if (!portrait) px = grade(px);
                if (pixelArt) threshold(px);
                if (settings.outline && !faceSpan) px = outline(px, size, size);
                if (faceSpan && settings.background) px = onColor(px, settings.background);
                blit(sheet, width, px, size, size, c.col, c.row);
                await breathe();
            }
            if (faceSpan) setExpression(builder, 'neutral');
            if (pixelArt) quantize(sheet, 32);
            if (cel) {
                const drawn = celDraw(celCells, Math.max(4, Math.min(32, Math.round(settings.colors) || 12)));
                celCells.forEach((c, i) => blit(sheet, width, settings.outline ? outline(drawn[i], size, size) : drawn[i], size, size, c.col, c.row));
            }
        } finally {
            if (flat) flat.dispose();
            view.scene.remove(fill, rim);
            fill.dispose(); rim.dispose();
            if (builder._view === view) {
                renderer.toneMappingExposure = saved.exposure;
                renderer.setPixelRatio(saved.ratio);
                renderer.setSize(saved.size.x, saved.size.y, false);
                renderer.setClearColor(0x000000, saved.clear);
            }
            view.floor.visible = saved.floor; view.blob.visible = saved.blob;
            view.group.rotation.y = saved.yaw;
            view.mixer.stopAllAction();
            view.action = restore ? null : saved.action;
            canvas.style.visibility = saved.visibility;
            if (shrink) shrink();
            builder._sheetExporting.drawing = false;
            if (restore) restore();
        }
        if (progress) progress(total, total);
        return { width, height, data: sheet, frame: size, layout: l.id };
    }

    /** A cell laid on a solid color. */
    function onColor(px, hex) {
        const n = parseInt(String(hex).replace('#', ''), 16), br = (n >> 16) & 255, bg = (n >> 8) & 255, bb = n & 255;
        for (let i = 0; i < px.length; i += 4) {
            const a = px[i + 3] / 255;
            px[i] = px[i] * a + br * (1 - a); px[i + 1] = px[i + 1] * a + bg * (1 - a); px[i + 2] = px[i + 2] * a + bb * (1 - a); px[i + 3] = 255;
        }
        return px;
    }

    function toPng(sheet) {
        const c = document.createElement('canvas');
        c.width = sheet.width; c.height = sheet.height;
        c.getContext('2d').putImageData(new ImageData(sheet.data, sheet.width, sheet.height), 0, 0);
        return new Promise((resolve, reject) => c.toBlob(b => (b ? b.arrayBuffer().then(a => resolve(new Uint8Array(a)), reject) : reject(new Error('png'))), 'image/png'));
    }

    // ── the panel ─────────────────────────────────────────────────────────

    const esc = s => String(s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

    // ── The sprite workspace ──────────────────────────────────────────────────────────────────────────────────
    // The builder as a sprite maker: in place of the 3D model, the sheet the game will cut, every animation in it
    // moving, with everything about the sheet beside it (which sheet, the frame's size, frames per step, style,
    // camera, look, colors, outline; a face sheet's view, expressions and background) and Export. The character is
    // still shaped in the builder's own tabs; the sheet is drawn again whenever it or a setting changes. One set
    // of settings (`builder._exportSettings`), whichever button opened it.

    const SPRITE_VIEW_HINT = 'Work on the character as its sprite sheet: every animation as the game draws it, with the sheet\'s settings and Export';
    const QUICK_SIZES = [32, 48, 64, 96, 128];
    const GROUNDS = [{ id: 'grass', color: '#6a8f5a', label: 'Grass' }, { id: 'dark', color: '#22252c', label: 'Dark' }, { id: 'light', color: '#cfcabd', label: 'Light' }, { id: 'checker', color: '', label: 'Checkered' }];
    const DIRECTIONS = { '0': 'Down', '-90': 'Left', '90': 'Right', '180': 'Up', '-45': 'Down-left', '45': 'Down-right', '-135': 'Up-left', '135': 'Up-right' };

    /** What a sheet is drawn with, from the workspace's settings. */
    function settingsOf(state) {
        const l = layout(state.layout);
        return { layout: l.id, frame: state.frame, frames: framesOf(l.id, state.frames), elevation: state.elevation, outline: state.outline, view: state.view, background: state.background || '',
            expressions: state.expressions, style: state.style, look: state.look, colors: state.colors };
    }

    /**
     * A sheet as the animations in it: each `{ label, col, row, count, order }` is `count` frames from (col, row)
     * played in `order`. A walking sheet's three frames step 1, 0, 1, 2 as the game plays them; a face is one frame.
     */
    function strips(settings) {
        const l = layout(settings.layout), per = l.id === 'face' ? 1 : l.id === 'sv' ? 3 : framesOf(l.id, settings.frames);
        const found = new Map();
        for (const c of plan(l.id, { expressions: settings.expressions, view: settings.view, frames: settings.frames })) {
            const key = Math.floor(c.col / per) + '|' + c.row;
            if (!found.has(key)) found.set(key, { col: Math.floor(c.col / per) * per, row: c.row, count: per, cells: [] });
            found.get(key).cells.push(c);
        }
        return [...found.values()].map(strip => {
            const lead = strip.cells.find(c => c.clip !== 'idle') || strip.cells[0];
            const direction = DIRECTIONS[String(lead.yaw)] || '';
            const label = l.id === 'face' ? (lead.expression || '') : l.id === 'sv' ? (lead.motion || lead.clip) : (lead.clip === 'walk' || lead.clip === 'idle' ? direction : lead.clip + (direction && direction !== 'Down' ? ' · ' + direction : ''));
            const order = per === 3 && l.id !== 'sv' ? [1, 0, 1, 2] : Array.from({ length: per }, (_, i) => i);
            return { label, col: strip.col, row: strip.row, count: per, order, walk: lead.clip === 'walk' || lead.clip === 'idle' };
        });
    }

    /** The largest whole-pixel zoom at which `count` tiles of `frame` pixels (plus `label` under each) fit a stage. */
    function tileZoom(count, frame, width, height, label = 16, gap = 10) {
        for (let zoom = 8; zoom > 1; zoom--) {
            const columns = Math.floor((width + gap) / (frame * zoom + gap));
            if (columns >= 1 && Math.ceil(count / columns) * (frame * zoom + label + gap) <= height + gap) return zoom;
        }
        return 1;
    }

    function openPanel(builder) {
        const host = builder.root && builder.root.querySelector('.rr-c3d-view');
        if (!host) return null;
        const old = host.querySelector('.rr-c3d-spriteview');
        if (old) { if (old._close && !old.querySelector('.rr-c3d-export').dataset.busy) old._close(); return null; }
        const t = (text, params) => builder._t(text, params);
        const state = builder._exportSettings || (builder._exportSettings = { layout: '8d', frame: 100, frames: 3, elevation: 30, outline: true, view: 'three', preset: 'everyday', background: '', style: 'realistic', look: 'smooth' });
        if (!(state.colors >= 4)) state.colors = 12;
        if (!state.stage) state.stage = 'frames';
        if (!state.ground) state.ground = 'grass';
        const el = document.createElement('div');
        el.className = 'rr-c3d-spriteview';
        el.innerHTML = `<div class="rr-c3d-spriteview-main">
                <div class="rr-c3d-spriteview-bar">
                    <span class="rr-c3d-seg" role="group"><button class="rr-btn-chip" data-v="frames">${esc(t('Animations'))}</button><button class="rr-btn-chip" data-v="sheet">${esc(t('Whole sheet'))}</button></span>
                    <span class="rr-c3d-spriteview-grounds" title="${esc(t('What the sprite is shown on'))}">${GROUNDS.map(g => `<button class="rr-c3d-ground" data-ground="${g.id}" title="${esc(t(g.label))}" style="${g.color ? 'background:' + g.color : ''}"></button>`).join('')}</span>
                    <span class="rr-c3d-note" data-v="status" aria-live="polite"></span>
                </div>
                <div class="rr-c3d-spriteview-stage"></div>
            </div>`;
        const panel = document.createElement('div');
        panel.className = 'rr-c3d-export is-docked';
        panel.setAttribute('role', 'group');
        panel.setAttribute('aria-label', t('Sprite sheet'));
        el.appendChild(panel);
        host.appendChild(el);
        const chip = builder.root.querySelector('.rr-c3d-spritebtn');
        if (chip) chip.classList.add('is-active');
        const stage = el.querySelector('.rr-c3d-spriteview-stage');
        const live = { sheet: null, picture: null, settings: null, tiles: [], drawnFor: '', busy: false, steady: 0, timer: 0, frame: 0 };
        const note = text => { el.querySelector('[data-v="status"]').textContent = text; };

        const draw = () => {
            const l = layout(state.layout), face = l.id === 'face', exprs = expressionList();
            const name = safeName(builder.name) || t('Villager');
            const presets = facePresets();
            const frames = framesOf(l.id, state.frames), cols = columnsOf(l.id, frames), file = fileName(l.id, name, frames);
            const presetOptions = presets.map(p => `<option value="${p.id}"${p.id === state.preset ? ' selected' : ''}>${esc(t(p.label))}</option>`).join('');
            const keep = panel.scrollTop;
            panel.innerHTML = `
                <div class="rr-c3d-export-head"><span>${esc(t('Sprite sheet'))}</span><button class="rr-btn-chip" data-x="close" title="${esc(t('Back to the 3D model'))}">◂ ${esc(t('3D model'))}</button></div>
                <label class="rr-c3d-row rr-c3d-choice"><span class="rr-c3d-label">${esc(t('Sheet'))}</span><select class="rr-select" data-x="layout">${LAYOUTS.map(o => `<option value="${o.id}"${o.id === l.id ? ' selected' : ''}>${esc(t(o.label))}</option>`).join('')}</select></label>
                <label class="rr-c3d-row"><span class="rr-c3d-label">${esc(t('Frame size'))}</span><input type="number" class="rr-input" data-x="frame" min="16" max="512" step="1" value="${state.frame}"><span class="rr-c3d-value">${cols * state.frame} × ${l.rows * state.frame}</span></label>
                <div class="rr-c3d-row rr-c3d-export-sizes"><span class="rr-c3d-label"></span><span>${QUICK_SIZES.concat(face ? [144] : []).map(n => `<button class="rr-btn-chip${n === state.frame ? ' is-active' : ''}" data-x="size" data-n="${n}">${n}</button>`).join('')}</span></div>
                ${l.id === '8d' || l.id === 'mz' ? `<label class="rr-c3d-row rr-c3d-choice"><span class="rr-c3d-label">${esc(t('Frames'))}</span><select class="rr-select" data-x="frames">${FRAME_CHOICES.map(n => `<option value="${n}"${n === frames ? ' selected' : ''}>${esc(n === 3 ? t('3 (RPG Maker MZ)') : String(n))}</option>`).join('')}</select></label>` : ''}
                ${face ? `
                <label class="rr-c3d-row rr-c3d-choice"><span class="rr-c3d-label">${esc(t('View'))}</span><select class="rr-select" data-x="view"><option value="three"${state.view === 'three' ? ' selected' : ''}>${esc(t('Three-quarter'))}</option><option value="front"${state.view === 'front' ? ' selected' : ''}>${esc(t('Front'))}</option></select></label>
                ${exprs.length > 1 ? `<label class="rr-c3d-row rr-c3d-choice"><span class="rr-c3d-label">${esc(t('Expressions'))}</span><select class="rr-select" data-x="preset">${presetOptions}</select></label>
                <div class="rr-c3d-export-faces">${(state.expressions || presets[0].expressions).map((id, i) => `<select class="rr-select" data-x="expr" data-i="${i}">${exprs.map(e => `<option value="${esc(e.id)}"${e.id === id ? ' selected' : ''}>${esc(t(e.label || e.id))}</option>`).join('')}</select>`).join('')}</div>` : ''}
                <div class="rr-c3d-row rr-c3d-colorrow"><span class="rr-c3d-label">${esc(t('Background'))}</span><select class="rr-select" data-x="bgmode"><option value=""${state.background ? '' : ' selected'}>${esc(t('Transparent'))}</option><option value="color"${state.background ? ' selected' : ''}>${esc(t('Color'))}</option></select><button class="rr-c3d-color" data-x="bgcolor" style="--rr-c3d-swatch:${esc(state.background || '#3a3f4b')}" title="${esc(state.background || '')}"${state.background ? '' : ' hidden'}></button></div>`
                : `
                ${builder.human === false ? '' : `<label class="rr-c3d-row rr-c3d-choice"><span class="rr-c3d-label">${esc(t('Style'))}</span><select class="rr-select" data-x="style">${STYLES.map(o => `<option value="${o.id}"${o.id === state.style ? ' selected' : ''}>${esc(t(o.label))}</option>`).join('')}</select></label>`}
                <label class="rr-c3d-row"><span class="rr-c3d-label">${esc(t('Camera angle'))}</span><input type="range" data-x="elevation" min="0" max="60" step="1" value="${state.elevation}"><span class="rr-c3d-value">${state.elevation}°</span></label>
                <label class="rr-c3d-row rr-c3d-choice"><span class="rr-c3d-label">${esc(t('Look'))}</span><select class="rr-select" data-x="look">${LOOKS.map(o => `<option value="${o.id}"${o.id === state.look ? ' selected' : ''}>${esc(t(o.label))}</option>`).join('')}</select></label>
                ${state.look === 'cel' ? `<label class="rr-c3d-row" title="${esc(t('How many surface colors the whole sheet is drawn in; each has its own shadow and light.'))}"><span class="rr-c3d-label">${esc(t('Colors'))}</span><input type="range" data-x="colors" min="4" max="24" step="1" value="${state.colors}"><span class="rr-c3d-value">${state.colors}</span></label>` : ''}
                <label class="rr-c3d-row rr-c3d-check"><span class="rr-c3d-label">${esc(t('Outline'))}</span><input type="checkbox" data-x="outline"${state.outline ? ' checked' : ''}></label>`}
                <div class="rr-c3d-row"><span class="rr-c3d-label">${esc(t('File'))}</span><span class="rr-c3d-export-file" title="img/${l.folder}/${esc(file)}">img/${l.folder}/${esc(file)}</span></div>
                <p class="rr-c3d-note">${esc(t('The picture beside this is the sheet as it will be saved. Shape the character in the tabs on the left; it is drawn again as you go.'))}</p>
                <div class="rr-c3d-export-progress" hidden><div></div></div>
                <img class="rr-c3d-export-preview" data-x="sheet" alt="" hidden>
                <div class="rr-c3d-export-status" aria-live="polite"></div>
                <div class="rr-c3d-export-foot"><button class="rr-btn-chip rr-c3d-export-go" data-x="export">${esc(t('Export to the project'))}</button></div>`;
            for (const fill of panel.querySelectorAll('input[type="range"]')) fill.style.setProperty('--rr-fill', ((fill.value - fill.min) / (fill.max - fill.min) * 100) + '%');
            panel.scrollTop = keep;
            for (const b of el.querySelectorAll('[data-v="frames"], [data-v="sheet"]')) b.classList.toggle('is-active', b.dataset.v === state.stage);
            for (const b of el.querySelectorAll('[data-ground]')) b.classList.toggle('is-active', b.dataset.ground === state.ground);
            const ground = GROUNDS.find(g => g.id === state.ground) || GROUNDS[0];
            stage.dataset.ground = ground.id;
            stage.style.backgroundColor = ground.color || '';
        };

        /** The sheet last drawn, laid out on the stage: its animations as tiles, or the whole sheet. */
        const show = () => {
            const sheet = live.sheet;
            if (!sheet) return;
            const box = stage.getBoundingClientRect(), f = sheet.frame, width = Math.max(60, box.width - 24), height = Math.max(60, box.height - 24);
            live.tiles = [];
            if (state.stage === 'sheet') {
                const zoom = Math.max(1, Math.min(8, Math.floor(Math.min(width / sheet.width, height / sheet.height)))) || 1, fits = sheet.width <= width && sheet.height <= height;
                stage.innerHTML = `<canvas class="rr-c3d-sprite-whole" width="${sheet.width}" height="${sheet.height}" style="width:${fits ? sheet.width * zoom + 'px' : 'auto'};max-width:100%;max-height:100%"></canvas>`;
                stage.firstElementChild.getContext('2d').drawImage(live.picture, 0, 0);
                return;
            }
            const list = strips(live.settings), zoom = tileZoom(list.length, f, width, height);
            stage.innerHTML = `<div class="rr-c3d-sprite-tiles">${list.map(strip => `<figure class="rr-c3d-sprite-tile"><canvas width="${f}" height="${f}" style="width:${f * zoom}px;height:${f * zoom}px"></canvas><figcaption>${esc(t(strip.label))}</figcaption></figure>`).join('')}</div>`;
            const canvases = stage.querySelectorAll('canvas');
            live.tiles = list.map((strip, i) => ({ strip, g: canvases[i].getContext('2d') }));
        };
        const animate = time => {
            if (!el.isConnected) return;
            live.frame = requestAnimationFrame(animate);
            if (!live.picture || !live.tiles.length) return;
            const f = live.sheet.frame;
            for (const { strip, g } of live.tiles) {
                // A walk steps as the game steps it; anything else plays through and rests a moment on its last frame.
                const beat = Math.floor(time / (strip.walk ? 170 : 210)), at = strip.walk ? strip.order[beat % strip.order.length] : Math.min(strip.count - 1, beat % (strip.count + 2));
                if (strip.shown === at) continue;
                strip.shown = at;
                g.clearRect(0, 0, f, f);
                g.drawImage(live.picture, (strip.col + at) * f, strip.row * f, f, f, 0, 0, f, f);
            }
        };
        const idle = () => { const P = builder._painter; return !!(builder._result && builder._view && !builder._pending && !builder._rebuildOwed && !(builder._liveJob && builder._liveJob.busy) && !(P && (P.busy || P.next)) && !builder._settle && !builder._sheetExporting); };
        const tick = async () => {
            if (!el.isConnected) { clearInterval(live.timer); return; }
            if (live.busy || panel.dataset.busy) return;
            live.steady = idle() ? live.steady + 1 : 0;
            if (live.steady < 2) return;
            const settings = settingsOf(state), want = JSON.stringify([builder.recipe, settings]);
            if (want === live.drawnFor) return;
            live.busy = true;
            const started = performance.now();
            note(t('Drawing…'));
            try {
                const sheet = await render(builder, settings);
                if (!el.isConnected) return;
                live.sheet = sheet; live.settings = settings; live.drawnFor = want;
                live.picture = document.createElement('canvas');
                live.picture.width = sheet.width; live.picture.height = sheet.height;
                live.picture.getContext('2d').putImageData(new ImageData(sheet.data, sheet.width, sheet.height), 0, 0);
                show();
                note(t('{w} × {h}, drawn in {s} s', { w: sheet.width, h: sheet.height, s: ((performance.now() - started) / 1000).toFixed(1) }));
            } catch (error) {
                live.drawnFor = want;
                note(t('The sheet could not be drawn.'));
                console.warn('[RRCharacterSpriteSheet] live sheet', error);
            } finally { live.busy = false; live.steady = 0; }
        };
        live.timer = setInterval(tick, 250);
        live.frame = requestAnimationFrame(animate);
        const watch = typeof ResizeObserver === 'function' ? new ResizeObserver(() => show()) : null;
        if (watch) watch.observe(stage);
        el._close = () => {
            clearInterval(live.timer); cancelAnimationFrame(live.frame);
            if (watch) watch.disconnect();
            el.remove();
            if (chip) chip.classList.remove('is-active');
        };

        el.querySelector('.rr-c3d-spriteview-bar').addEventListener('click', e => {
            const view = e.target.closest('[data-v="frames"], [data-v="sheet"]'), ground = e.target.closest('[data-ground]');
            if (view) { state.stage = view.dataset.v; draw(); show(); }
            if (ground) { state.ground = ground.dataset.ground; draw(); }
        });
        const preview = panel => panel.querySelector('.rr-c3d-export-preview');
        panel.addEventListener('input', e => {
            const x = e.target.dataset.x;
            if (e.target.type === 'range') e.target.style.setProperty('--rr-fill', ((e.target.value - e.target.min) / (e.target.max - e.target.min) * 100) + '%');
            if (x === 'elevation') { state.elevation = Number(e.target.value); e.target.parentElement.querySelector('.rr-c3d-value').textContent = state.elevation + '°'; }
            if (x === 'colors') { state.colors = Number(e.target.value); e.target.parentElement.querySelector('.rr-c3d-value').textContent = String(state.colors); }
            if (x === 'frame') { const v = Math.round(Number(e.target.value)); if (v >= 16 && v <= 512) { state.frame = v; const l = layout(state.layout); e.target.parentElement.querySelector('.rr-c3d-value').textContent = `${columnsOf(l.id, state.frames) * v} × ${l.rows * v}`; } }
        });
        panel.addEventListener('change', e => {
            const x = e.target.dataset.x;
            if (x === 'layout') {
                state.layout = e.target.value;
                const l = layout(state.layout);
                state.frame = l.id === 'face' ? faceSize(builder) : l.frame;
                state.elevation = l.elevation;
                draw();
            } else if (x === 'outline') state.outline = e.target.checked;
            else if (x === 'style') state.style = e.target.value;
            else if (x === 'look') { state.look = e.target.value; draw(); }
            else if (x === 'view') state.view = e.target.value;
            else if (x === 'preset') { const presets = facePresets(); state.preset = e.target.value; state.expressions = (presets.find(p => p.id === state.preset) || presets[0]).expressions.slice(); draw(); }
            else if (x === 'expr') { state.expressions = (state.expressions || facePresets()[0].expressions).slice(); state.expressions[Number(e.target.dataset.i)] = e.target.value; }
            else if (x === 'bgmode') { state.background = e.target.value ? (state.background || '#3a3f4b') : ''; draw(); }
            else if (x === 'frame') draw();
            else if (x === 'frames') { state.frames = Number(e.target.value); draw(); }
        });
        panel.addEventListener('click', async e => {
            const b = e.target.closest('[data-x]');
            if (!b) return;
            if (b.dataset.x === 'close' && !panel.dataset.busy) el._close();
            else if (b.dataset.x === 'size') { state.frame = Number(b.dataset.n); draw(); }
            else if (b.dataset.x === 'bgcolor' && root.RRColorPopover) {
                root.RRColorPopover.open(b, { value: state.background || '#3a3f4b', onInput: hex => { state.background = hex; b.style.setProperty('--rr-c3d-swatch', hex); }, onChange: hex => { state.background = hex; b.style.setProperty('--rr-c3d-swatch', hex); b.title = hex; } });
            } else if (b.dataset.x === 'export' && !panel.dataset.busy) {
                // The picture being drawn is let finish; the sheet saved is drawn from the settings as they stand.
                for (let i = 0; i < 400 && live.busy; i++) await new Promise(done => setTimeout(done, 50));
                if (el.isConnected && !panel.dataset.busy) exportNow(builder, panel, state, preview);
            }
        });
        draw();
        return el;
    }

    /** The project's face size (System 2), else MZ's 144. */
    function faceSize(builder) {
        const sys = root.reactor && root.reactor.databaseManager && root.reactor.databaseManager.data && root.reactor.databaseManager.data.system;
        const n = Number(sys && sys.faceSize);
        return Number.isInteger(n) && n >= 16 && n <= 512 ? n : 144;
    }

    /** The sheet drawn and saved. */
    async function exportNow(builder, panel, state, preview) {
        const t = (text, params) => builder._t(text, params);
        const project = builder._project && builder._project();
        const rootElement = builder.root, view = builder._view;
        const current = () => builder.root === rootElement && builder._view === view && builder._project?.()?.path === project?.path;
        const status = panel.querySelector('.rr-c3d-export-status');
        if (!project) return;
        let name = safeName(builder.name);
        if (!name) {
            name = safeName(await root.RRDialog.prompt(t('Name this character:'), { title: t('Export Sprite Sheet'), value: t('Villager') }));
            if (!name || !current()) return;
            builder.name = name;
            const input = builder.root.querySelector('.rr-c3d-name-input');
            if (input) input.value = name;
        }
        const fs = require('fs'), path = require('path'), l = layout(state.layout);
        const frames = framesOf(l.id, state.frames);
        const file = path.join(project.path, 'img', l.folder, fileName(l.id, name, frames));
        if (fs.existsSync(file) && !await root.RRDialog.confirm(t('Replace {file}?', { file: 'img/' + l.folder + '/' + path.basename(file) }), { title: t('Export Sprite Sheet'), ok: t('Replace'), danger: true })) return;
        if (!current()) return;
        const bar = panel.querySelector('.rr-c3d-export-progress'), go = panel.querySelector('.rr-c3d-export-go');
        panel.dataset.busy = '1';
        builder.root.classList.add('is-exporting');
        bar.hidden = false; go.disabled = true;
        status.textContent = t('Rendering…');
        status.dataset.kind = '';
        const started = performance.now();
        try {
            const settings = settingsOf(state);
            const sheet = await render(builder, settings, (done, total) => { bar.firstElementChild.style.width = Math.round(done / total * 100) + '%'; });
            const png = await toPng(sheet);
            if (!current()) return;
            const seconds = ((performance.now() - started) / 1000).toFixed(1);
            const atomic = root.RRWriteFileAtomicSync || ((io, target, data) => io.writeFileSync(target, data));
            fs.mkdirSync(path.dirname(file), { recursive: true });
            atomic(fs, file, png);
            status.textContent = t('Saved img/{folder}/{file} ({s} s).', { folder: l.folder, file: path.basename(file), s: seconds });
            status.dataset.kind = 'ok';
            const img = preview(panel);
            // (The picture before this one is let go: each was kept for as long as the editor ran.)
            if (img.src && img.src.startsWith('blob:')) URL.revokeObjectURL(img.src);
            img.src = URL.createObjectURL(new Blob([png], { type: 'image/png' }));
            img.hidden = false;
            console.log(`[RRCharacterSpriteSheet] ${path.basename(file)} ${sheet.width}x${sheet.height} in ${seconds} s`);
        } catch (error) {
            console.error('[RRCharacterSpriteSheet] export', error);
            status.textContent = t('The sprite sheet could not be made.');
            status.dataset.kind = 'error';
        } finally {
            delete panel.dataset.busy;
            rootElement.classList.remove('is-exporting');
            bar.hidden = true; go.disabled = false;
        }
    }

    const api = {
        LAYOUTS, CLIPS, SV_MOTIONS, SV_CLIPS, FACE_PRESETS, YAW, SV_YAW, CARDINAL, DIAGONAL,
        STYLES, LOOKS, STANDARD_HEIGHT, pixelsPerMeter, FRAME_CHOICES, frameTag, framesOf, columnsOf, layout, plan, resolveClip, blockOrigin, cellMetrics, fit, fitFace, frustum, project,
        downsample, outline, grade, skinLike, threshold, quantize, clusters, celCell, celRamp, celDraw, SPRITE_VIEW_HINT, settingsOf, strips, tileZoom, chibiRecipe, headScale, headMeasure, blit, alphaBounds, fileName, safeName, measure, toPng, render, openPanel, expressionList
    };
    root.RRCharacterSpriteSheet = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
