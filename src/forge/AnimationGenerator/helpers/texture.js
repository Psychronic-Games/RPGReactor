/**
 * Texture loading + 2D texture-mapped triangle drawing.
 *
 * Globals exposed:
 *   TEXTURE_CACHE        — Map<absPath, HTMLImageElement | AnimatedTexture>
 *   getTextureImage(p, onLoad?)  — lazily-cached image / GIF / video loader
 *   drawTexturedTriangle(ctx, image, s, d)  — affine UV-mapped triangle
 *   gifFrameAt(gif, tFrac)        — pick the right GIF frame canvas
 *   animatedFrameAt(tex, tFrac)   — pick the right frame for GIF *or* video
 *
 * Animated texture support: GIFs (.gif) are parsed with gifuct-js;
 * videos (.mp4/.webm/.mov/.m4v/.ogv) are decoded by seeking an offscreen
 * HTMLVideoElement frame-by-frame. Both return a uniform object:
 *   { isGif|isVideo: true, ready: bool, frames: HTMLCanvasElement[],
 *     delays: ms[], totalDuration: ms, width, height }
 * Each frame canvas is decorated with `complete`, `naturalWidth`, and
 * `naturalHeight` so existing animation code that checks those keeps
 * working — the canvas IS the texture image for the current frame.
 * Video decode is asynchronous; the stub is returned immediately and
 * `frames` populates as seek-and-capture completes, after which the
 * caller's `onLoad` fires to trigger a redraw.
 */

// ─── Texture cache (filename → HTMLImageElement | gif object) ──────────────
const TEXTURE_CACHE = new Map();

/**
 * Internal: parse an animated GIF synchronously from a file path and
 * build per-frame composited canvases (handling disposal types 1/2/3).
 * Returns the AnimatedGifTexture object or null on failure.
 */
function _loadGifTexture(absPath) {
    let parseGIF, decompressFrames;
    try {
        const gifuct = require('gifuct-js');
        parseGIF         = gifuct.parseGIF;
        decompressFrames = gifuct.decompressFrames;
    } catch (e) {
        console.error('gifuct-js unavailable, falling back to static image:', e);
        return null;
    }
    const fs = require('fs');
    let buf;
    try {
        buf = fs.readFileSync(absPath);
    } catch (e) {
        console.error('GIF read failed:', e);
        return null;
    }
    let gif, frames;
    try {
        gif    = parseGIF(buf.buffer.slice(buf.byteOffset,
                                           buf.byteOffset + buf.byteLength));
        frames = decompressFrames(gif, true);  // buildImagePatches = true
    } catch (e) {
        console.error('GIF parse failed:', e);
        return null;
    }
    if (!frames || frames.length === 0) return null;

    const W = gif.lsd.width;
    const H = gif.lsd.height;

    // Working canvas — accumulates the composited frame.
    const work = document.createElement('canvas');
    work.width = W; work.height = H;
    const wCtx = work.getContext('2d');

    // Previous-snapshot canvas — used by disposal type 3 (restore prev).
    const prevSnap = document.createElement('canvas');
    prevSnap.width = W; prevSnap.height = H;
    const psCtx = prevSnap.getContext('2d');

    const composites = [];
    const delays = [];

    for (let i = 0; i < frames.length; i++) {
        const f = frames[i];
        const { dims, patch, disposalType, delay } = f;

        // Save current state in case the NEXT frame is disposal-type 3.
        psCtx.clearRect(0, 0, W, H);
        psCtx.drawImage(work, 0, 0);

        // Apply the patch (frame's pixel data, RGBA, at dims.left/top).
        const patchCanvas = document.createElement('canvas');
        patchCanvas.width  = dims.width;
        patchCanvas.height = dims.height;
        const patchData = new ImageData(
            new Uint8ClampedArray(patch),
            dims.width,
            dims.height
        );
        patchCanvas.getContext('2d').putImageData(patchData, 0, 0);
        wCtx.drawImage(patchCanvas, dims.left, dims.top);

        // Snapshot the composited result for this frame.
        const composite = document.createElement('canvas');
        composite.width = W; composite.height = H;
        composite.getContext('2d').drawImage(work, 0, 0);

        // Decorate so callers' `complete && naturalWidth > 0` checks pass.
        Object.defineProperty(composite, 'complete',     { value: true });
        Object.defineProperty(composite, 'naturalWidth', { value: W });
        Object.defineProperty(composite, 'naturalHeight',{ value: H });

        composites.push(composite);
        // GIF delays are in centiseconds; gifuct-js exposes them in ms.
        // Treat missing/zero delays as 100ms (the de-facto browser default).
        delays.push(Math.max(20, delay || 100));

        // Handle disposal AFTER recording this frame.
        if (disposalType === 2) {
            // Restore to background — clear the patch area to transparent.
            wCtx.clearRect(dims.left, dims.top, dims.width, dims.height);
        } else if (disposalType === 3) {
            // Restore to the previous (saved) state of the whole canvas.
            wCtx.clearRect(0, 0, W, H);
            wCtx.drawImage(prevSnap, 0, 0);
        }
        // Disposal 0 / 1: don't dispose — the current state persists.
    }

    const totalDuration = Math.max(1, delays.reduce((a, b) => a + b, 0));

    return {
        isGif:        true,
        width:        W,
        height:       H,
        frames:       composites,
        delays:       delays,
        totalDuration
    };
}

/**
 * Internal: decode a video file into per-frame canvases by seeking an
 * offscreen HTMLVideoElement. Returns a stub object IMMEDIATELY with
 * empty `frames`; once decoding completes (async), `frames`/`delays`/
 * `totalDuration` populate, `ready` flips true, and `onLoad` fires.
 *
 * Frame rate is fixed at 24 FPS of source video, capped at 240 frames
 * (10 seconds at 24fps) to bound memory + decode time. The source's
 * full duration is preserved in `totalDuration`, so `animatedFrameAt`
 * still maps loop fractions to the right moment.
 */
function _loadVideoTexture(absPath, onLoad) {
    const stub = {
        isVideo:        true,
        ready:          false,
        width:          0,
        height:         0,
        frames:         [],
        delays:         [],
        totalDuration:  1
    };
    const video = document.createElement('video');
    video.muted        = true;
    video.playsInline  = true;
    video.preload      = 'auto';

    const onError = (e) => {
        console.error('Video texture load failed:', absPath, e);
    };
    video.addEventListener('error', onError);

    video.addEventListener('loadedmetadata', () => {
        const W   = video.videoWidth;
        const H   = video.videoHeight;
        const dur = video.duration;
        if (!isFinite(dur) || dur <= 0 || W === 0 || H === 0) {
            console.error('Video metadata invalid:', absPath, { dur, W, H });
            return;
        }
        const FPS_TARGET = 24;
        const MAX_FRAMES = 240;
        const nFrames    = Math.min(MAX_FRAMES,
                                    Math.max(1, Math.round(dur * FPS_TARGET)));
        const dt         = dur / nFrames;
        const delayMs    = dt * 1000;

        stub.width  = W;
        stub.height = H;

        // Sequentially seek + capture. The browser only fires one
        // `seeked` event per `currentTime` write, so chaining via
        // promises keeps the decode deterministic.
        let i = 0;
        const captureNext = () => {
            if (i >= nFrames) {
                stub.totalDuration = nFrames * delayMs;
                stub.ready = true;
                // Drop the source so the underlying decoder releases.
                try { video.removeAttribute('src'); video.load(); } catch (e) {}
                if (typeof onLoad === 'function') onLoad();
                return;
            }
            const onSeeked = () => {
                video.removeEventListener('seeked', onSeeked);
                const c = document.createElement('canvas');
                c.width  = W;
                c.height = H;
                c.getContext('2d').drawImage(video, 0, 0, W, H);
                Object.defineProperty(c, 'complete',     { value: true });
                Object.defineProperty(c, 'naturalWidth', { value: W });
                Object.defineProperty(c, 'naturalHeight',{ value: H });
                stub.frames.push(c);
                stub.delays.push(delayMs);
                i++;
                captureNext();
            };
            video.addEventListener('seeked', onSeeked);
            // Sample at the MIDDLE of each interval so we don't lock on
            // a black first frame or end-of-stream EOF.
            video.currentTime = Math.min(dur - 1e-3, (i + 0.5) * dt);
        };
        captureNext();
    }, { once: true });

    video.src = 'file://' + absPath.replace(/\\/g, '/');
    video.load();

    return stub;
}

/**
 * Return the AnimatedGifTexture frame canvas that should be visible at
 * a given loop fraction `tFrac` in [0, 1). The GIF plays exactly once
 * per loop — `tFrac * totalDuration` maps to a position inside the
 * gif's native timeline; whichever frame's accumulated delay contains
 * that position wins.
 */
function gifFrameAt(gif, tFrac) {
    if (!gif || !gif.isGif) return null;
    if (gif.frames.length === 1) return gif.frames[0];
    const time = (((tFrac % 1) + 1) % 1) * gif.totalDuration;
    let acc = 0;
    for (let i = 0; i < gif.delays.length; i++) {
        acc += gif.delays[i];
        if (time < acc) return gif.frames[i];
    }
    return gif.frames[gif.frames.length - 1];
}

/**
 * Generic frame picker — works on GIF *or* video texture objects.
 * Returns null if the texture hasn't decoded any frames yet (video
 * during async decode); callers should treat that the same as a
 * not-yet-loaded image.
 */
function animatedFrameAt(tex, tFrac) {
    if (!tex || !(tex.isGif || tex.isVideo)) return null;
    if (!tex.frames || tex.frames.length === 0) return null;
    if (tex.frames.length === 1) return tex.frames[0];
    const time = (((tFrac % 1) + 1) % 1) * tex.totalDuration;
    let acc = 0;
    for (let i = 0; i < tex.delays.length; i++) {
        acc += tex.delays[i];
        if (time < acc) return tex.frames[i];
    }
    return tex.frames[tex.frames.length - 1];
}

function getTextureImage(absPath, onLoad) {
    if (!absPath) return null;
    if (TEXTURE_CACHE.has(absPath)) return TEXTURE_CACHE.get(absPath);

    // Animated GIFs are parsed once and stored as a frame-array object.
    // Detection by extension is fine here — texture files always live in
    // the project's img/textures/ folder where the user picks them.
    if (/\.gif$/i.test(absPath)) {
        const gif = _loadGifTexture(absPath);
        if (gif) {
            TEXTURE_CACHE.set(absPath, gif);
            // GIFs are loaded synchronously; fire the onLoad callback
            // on next tick so the caller's preview/sheet redraw triggers.
            if (typeof onLoad === 'function') setTimeout(onLoad, 0);
            return gif;
        }
        // Fall through to static-image path on parse failure.
    }

    // Video files: cache the stub object immediately so subsequent
    // lookups don't re-trigger the seek-and-capture decode. The decoder
    // mutates the stub in place when frames are ready.
    if (/\.(mp4|webm|mov|m4v|ogv|ogg)$/i.test(absPath)) {
        const vid = _loadVideoTexture(absPath, onLoad);
        TEXTURE_CACHE.set(absPath, vid);
        return vid;
    }

    const img = new Image();
    img.src = 'file://' + absPath.replace(/\\/g, '/');
    if (typeof onLoad === 'function') img.addEventListener('load', onLoad);
    TEXTURE_CACHE.set(absPath, img);
    return img;
}

/**
 * Canvas 2D textured triangle: map a triangle of the source image to a
 * triangle on the destination canvas using an affine transform + clip.
 * Standard 2D-canvas texture-mapping technique.
 *
 * Destination triangle is dilated outward from its centroid by ~0.6px to
 * make adjacent triangles in a tessellated mesh overlap slightly, hiding
 * the 1px seams that anti-aliased clip edges leave between neighbors. The
 * affine transform is recomputed with the dilated destination, so the
 * texture stretches by a sub-pixel amount across the overlap (invisible to
 * the eye but the seam disappears).
 */
function drawTexturedTriangle(ctx, image, s, d) {
    // s = [sx0, sy0, sx1, sy1, sx2, sy2] (source UV)
    // d = [dx0, dy0, dx1, dy1, dx2, dy2] (destination)
    const [sx0, sy0, sx1, sy1, sx2, sy2] = s;
    let [dx0, dy0, dx1, dy1, dx2, dy2] = d;
    // Dilation hides clip-edge seams. In nearest/sharp mode use minimal
    // dilation so the texture stays crisp; in linear/smooth mode use more
    // for full seam coverage between adjacent triangles in a mesh.
    const sharp = !ctx.imageSmoothingEnabled;
    const DILATE = sharp ? 0.5 : 1.1;
    const ccx = (dx0 + dx1 + dx2) / 3;
    const ccy = (dy0 + dy1 + dy2) / 3;
    const push = (x, y) => {
        const ddx = x - ccx, ddy = y - ccy;
        const len = Math.hypot(ddx, ddy);
        if (len < 0.001) return [x, y];
        return [x + ddx / len * DILATE, y + ddy / len * DILATE];
    };
    [dx0, dy0] = push(dx0, dy0);
    [dx1, dy1] = push(dx1, dy1);
    [dx2, dy2] = push(dx2, dy2);
    const sx1m0 = sx1 - sx0, sy1m0 = sy1 - sy0;
    const sx2m0 = sx2 - sx0, sy2m0 = sy2 - sy0;
    const det = sx1m0 * sy2m0 - sx2m0 * sy1m0;
    if (Math.abs(det) < 1e-9) return;
    const inv = 1 / det;
    const a = (sy2m0 * (dx1 - dx0) - sy1m0 * (dx2 - dx0)) * inv;
    const b = (sx1m0 * (dx2 - dx0) - sx2m0 * (dx1 - dx0)) * inv;
    const c = (sy2m0 * (dy1 - dy0) - sy1m0 * (dy2 - dy0)) * inv;
    const d2 = (sx1m0 * (dy2 - dy0) - sx2m0 * (dy1 - dy0)) * inv;
    const e = dx0 - a * sx0 - b * sy0;
    const f = dy0 - c * sx0 - d2 * sy0;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(dx0, dy0);
    ctx.lineTo(dx1, dy1);
    ctx.lineTo(dx2, dy2);
    ctx.closePath();
    ctx.clip();
    ctx.setTransform(a, c, b, d2, e, f);
    // Re-assert smoothing inside the save block in case the caller's save/
    // restore state churn dropped it. This is what actually controls how
    // drawImage samples the texture pixels during the affine warp.
    ctx.imageSmoothingEnabled = !sharp;
    if (ctx.imageSmoothingQuality !== undefined) {
        ctx.imageSmoothingQuality = sharp ? 'low' : 'high';
    }
    ctx.drawImage(image, 0, 0);
    ctx.restore();
}
