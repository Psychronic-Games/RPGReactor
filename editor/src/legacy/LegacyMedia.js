/**
 * LegacyMedia - movies an older engine played that Chromium cannot (AVI, MPEG,
 * WMV, Ogg Theora, Flash video) are converted to WebM beside the originals'
 * names, so the game's Play Movie commands find them unchanged. Node only;
 * runs after an import has written the project (the CLI and the editor's
 * import worker call it), because it spawns FFmpeg and waits.
 *
 * FFmpeg: `options.ffmpegPath`, else one on the PATH, else the pinned,
 * hash-verified build the asset optimizer downloads (asset-optimizer.js).
 *
 *   await convertMovies(projectDir, { log, progress })
 *     → { converted: [names], failed: [{ name, error }] }
 *
 * MIDI music (most 2000/2003 and many XP games) becomes Ogg Vorbis the same
 * way: FluidSynth renders it through a General MIDI soundfont, FFmpeg encodes
 * it, and RPG Maker's loop point (controller 111) becomes LOOPSTART and
 * LOOPLENGTH tags, so the track loops where the game's did and the synth's
 * release tail is never heard. Needs FluidSynth and a .sf2 soundfont
 * (`options.fluidsynthPath`, `options.soundFont`, else the system's).
 *
 * JPEG and BMP images (RGSS loaded both) become PNG, the only format the
 * runtime's image loader asks for.
 *
 *   await convertMedia(projectDir, { log, progress }) → { images, movies, music }
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const https = require('node:https');
const { execFile, execFileSync } = require('node:child_process');

const PLAYABLE = /\.(webm|mp4)$/i;
const CONVERTIBLE = /\.(avi|mpg|mpeg|wmv|ogv|flv|mov|mkv)$/i;

/** Movies in the project that the runtime cannot play yet, with no WebM beside them. */
function pendingMovies(projectDir) {
    const dir = path.join(projectDir, 'movies');
    if (!fs.existsSync(dir)) return [];
    const files = fs.readdirSync(dir);
    const playable = new Set(files.filter(f => PLAYABLE.test(f)).map(f => f.replace(/\.[^.]+$/, '').toLowerCase()));
    return files.filter(f => CONVERTIBLE.test(f) && !playable.has(f.replace(/\.[^.]+$/, '').toLowerCase()));
}

function systemFfmpeg() {
    try {
        execFileSync(process.platform === 'win32' ? 'where' : 'which', ['ffmpeg'], { stdio: 'pipe', windowsHide: true });
        return 'ffmpeg';
    } catch (_) { return null; }
}

function httpsDownload(url, destination, redirects = 0) {
    return new Promise((resolve, reject) => {
        https.get(url, { headers: { 'User-Agent': 'RPG-Reactor' } }, (response) => {
            if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location && redirects < 5) {
                response.resume();
                resolve(httpsDownload(new URL(response.headers.location, url).toString(), destination, redirects + 1));
                return;
            }
            if (response.statusCode !== 200) { response.resume(); reject(new Error(`HTTP ${response.statusCode} for ${url}`)); return; }
            const file = fs.createWriteStream(destination);
            response.pipe(file);
            file.on('finish', () => file.close(resolve));
            file.on('error', reject);
        }).on('error', reject);
    });
}

async function resolveFfmpeg(options) {
    if (options.ffmpegPath) return options.ffmpegPath;
    const onPath = systemFfmpeg();
    if (onPath) return onPath;
    const optimizer = require('../../build-scripts/asset-optimizer.js');
    let nativeDownload = null;
    try { nativeDownload = require('../../build-scripts/native-download.js'); } catch (_) { /* https fallback */ }
    return optimizer.acquireFfmpeg({
        appRoot: path.resolve(__dirname, '..', '..'),
        download: (url, destination) => (nativeDownload && nativeDownload.isAvailable()
            ? nativeDownload.download({ url, destPath: destination })
            : httpsDownload(url, destination))
    });
}

function run(executable, args) {
    return new Promise((resolve, reject) => {
        execFile(executable, args, { windowsHide: true, maxBuffer: 8 * 1024 * 1024, timeout: 60 * 60 * 1000, killSignal: 'SIGKILL' }, (error, stdout, stderr) => {
            if (error) reject(new Error(String(stderr || error.message).trim().split('\n').slice(-3).join(' ')));
            else resolve(stdout);
        });
    });
}

async function convertMovies(projectDir, options = {}) {
    const log = typeof options.log === 'function' ? options.log : () => {};
    const progress = typeof options.progress === 'function' ? options.progress : () => {};
    const pending = pendingMovies(projectDir);
    const result = { converted: [], failed: [] };
    if (!pending.length) return result;
    log(`Converting ${pending.length} movie${pending.length === 1 ? '' : 's'} to WebM…`, 'stage');
    let ffmpeg;
    try { ffmpeg = await resolveFfmpeg(options); }
    catch (error) {
        for (const name of pending) result.failed.push({ name, error: `FFmpeg is not available (${error.message})` });
        log(`  FFmpeg is not available (${error.message}); the movies stay as they are.`, 'warn');
        return result;
    }
    const dir = path.join(projectDir, 'movies');
    for (const [index, name] of pending.entries()) {
        progress(index / pending.length, `Movie ${index + 1} of ${pending.length}: ${name}`);
        const source = path.join(dir, name), target = path.join(dir, name.replace(/\.[^.]+$/, '') + '.webm');
        const temp = target + '.part.webm';
        try {
            // VP9 with constant quality and Opus audio: what Chromium plays everywhere NW.js runs.
            await run(ffmpeg, ['-y', '-hide_banner', '-loglevel', 'error', '-i', source, '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '32', '-row-mt', '1', '-deadline', 'good', '-cpu-used', '4', '-c:a', 'libopus', '-b:a', '128k', temp]);
            fs.renameSync(temp, target);
            // The original is not played by anything; keep it out of the project's size.
            fs.rmSync(source, { force: true });
            result.converted.push(name);
            log(`  ${name} → ${path.basename(target)}`, 'info');
        } catch (error) {
            fs.rmSync(temp, { force: true });
            result.failed.push({ name, error: error.message });
            log(`  ${name}: ${error.message}`, 'warn');
        }
    }
    progress(1, 'Movies done');
    // The project's import report says what became of its movies too.
    const reportPath = path.join(projectDir, 'import-report.json');
    try {
        if (fs.existsSync(reportPath)) {
            const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
            report.movies = result;
            fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
        }
    } catch (_) { /* the report is informational */ }
    return result;
}

// ---- MIDI --------------------------------------------------------------------

const MIDI = /\.(mid|midi)$/i;
const AUDIO_FOLDERS = ['bgm', 'bgs', 'me', 'se'];

/** MIDI files in the project's audio folders with no Ogg beside them (paths relative to the project). */
function pendingMusic(projectDir) {
    const out = [];
    for (const folder of AUDIO_FOLDERS) {
        const dir = path.join(projectDir, 'audio', folder);
        if (!fs.existsSync(dir)) continue;
        const walk = (abs, rel) => {
            for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
                const r = rel ? rel + '/' + e.name : e.name;
                if (e.isDirectory()) walk(path.join(abs, e.name), r);
                else if (MIDI.test(e.name) && !fs.existsSync(path.join(abs, e.name.replace(MIDI, '.ogg')))) out.push(`audio/${folder}/${r}`);
            }
        };
        walk(dir, '');
    }
    return out;
}

/**
 * Where a Standard MIDI File ends and where RPG Maker loops it from: the
 * first controller 111 event (0 when there is none), both in seconds, through
 * the file's tempo map.
 */
function midiLoop(bytes) {
    const b = Buffer.from(bytes);
    if (b.length < 14 || b.toString('latin1', 0, 4) !== 'MThd') return null;
    const tracks = b.readUInt16BE(10), division = b.readUInt16BE(12);
    if (division & 0x8000) return null;   // SMPTE time: no tempo map to follow
    const tempos = [], loops = [];
    let endTick = 0, pos = 8 + b.readUInt32BE(4);
    for (let t = 0; t < tracks && pos + 8 <= b.length; t++) {
        if (b.toString('latin1', pos, pos + 4) !== 'MTrk') break;
        const end = Math.min(b.length, pos + 8 + b.readUInt32BE(pos + 4));
        let p = pos + 8, tick = 0, status = 0;
        const vlq = () => { let v = 0, c; do { c = b[p++]; v = (v << 7) | (c & 0x7f); } while (c & 0x80 && p < end); return v; };
        while (p < end) {
            tick += vlq();
            let s = b[p];
            if (s & 0x80) { p++; status = s; } else s = status;
            if (s === 0xff) {
                const type = b[p++], len = vlq();
                if (type === 0x51 && len === 3) tempos.push([tick, (b[p] << 16) | (b[p + 1] << 8) | b[p + 2]]);
                p += len;
                if (type === 0x2f) break;
            } else if (s === 0xf0 || s === 0xf7) { p += vlq(); }
            else {
                const kind = s & 0xf0;
                if (kind === 0xc0 || kind === 0xd0) p += 1;
                else { if (kind === 0xb0 && b[p] === 111) loops.push(tick); p += 2; }
            }
        }
        endTick = Math.max(endTick, tick);
        pos = end;
    }
    tempos.sort((x, y) => x[0] - y[0]);
    const seconds = (target) => {
        let at = 0, tempo = 500000, sec = 0;
        for (const [tick, value] of tempos) {
            if (tick >= target) break;
            sec += (tick - at) * tempo / division / 1e6; at = tick; tempo = value;
        }
        return sec + (target - at) * tempo / division / 1e6;
    };
    return { loopStart: loops.length ? seconds(Math.min(...loops)) : 0, end: seconds(endTick) };
}

const SOUNDFONTS = ['/usr/share/soundfonts/FluidR3_GM.sf2', '/usr/share/soundfonts/default.sf2', '/usr/share/sounds/sf2/FluidR3_GM.sf2', '/usr/share/sounds/sf2/default-GM.sf2', '/usr/share/soundfonts/GeneralUser GS.sf2', '/opt/homebrew/share/soundfonts/default.sf2', '/usr/local/share/soundfonts/default.sf2', 'C:\\soundfonts\\default.sf2'];

function findTool(name) {
    try { execFileSync(process.platform === 'win32' ? 'where' : 'which', [name], { stdio: 'pipe', windowsHide: true }); return name; } catch (_) { return null; }
}

async function convertMusic(projectDir, options = {}) {
    const log = typeof options.log === 'function' ? options.log : () => {};
    const progress = typeof options.progress === 'function' ? options.progress : () => {};
    const pending = pendingMusic(projectDir);
    const result = { converted: [], failed: [] };
    if (!pending.length) return result;
    log(`Rendering ${pending.length} MIDI file${pending.length === 1 ? '' : 's'} to Ogg…`, 'stage');
    const fluidsynth = options.fluidsynthPath || findTool('fluidsynth');
    const soundFont = options.soundFont || SOUNDFONTS.find(f => fs.existsSync(f));
    if (!fluidsynth || !soundFont) {
        const why = !fluidsynth ? 'FluidSynth is not installed' : 'no General MIDI soundfont (.sf2) was found';
        for (const name of pending) result.failed.push({ name, error: why });
        log(`  ${why}; the MIDI files stay as they are (the runtime does not play MIDI).`, 'warn');
        return result;
    }
    let ffmpeg;
    try { ffmpeg = await resolveFfmpeg(options); }
    catch (error) {
        for (const name of pending) result.failed.push({ name, error: `FFmpeg is not available (${error.message})` });
        log(`  FFmpeg is not available (${error.message}); the MIDI files stay as they are.`, 'warn');
        return result;
    }
    const RATE = 44100;
    // FluidSynth renders one file on one core; several at once use the machine.
    const workers = Math.max(1, Math.min(4, (typeof os.availableParallelism === 'function' ? os.availableParallelism() : os.cpus().length) - 1));
    let next = 0, done = 0;
    const renderOne = async (rel) => {
        const source = path.join(projectDir, rel), target = source.replace(MIDI, '.ogg');
        const wav = target + '.part.wav', temp = target + '.part.ogg';
        try {
            await run(fluidsynth, ['-ni', '-g', '0.7', '-r', String(RATE), '-F', wav, soundFont, source]);
            const loop = midiLoop(fs.readFileSync(source));
            const args = ['-y', '-hide_banner', '-loglevel', 'error', '-i', wav, '-c:a', 'libvorbis', '-q:a', '5'];
            // Background music loops; a ME or SE plays once and keeps its release tail.
            if (loop && /^audio\/(bgm|bgs)\//i.test(rel)) {
                const start = Math.round(loop.loopStart * RATE), end = Math.round(loop.end * RATE);
                if (end > start) args.push('-metadata', `LOOPSTART=${start}`, '-metadata', `LOOPLENGTH=${end - start}`);
            }
            args.push(temp);
            await run(ffmpeg, args);
            fs.renameSync(temp, target);
            fs.rmSync(source, { force: true });
            result.converted.push(rel);
        } catch (error) {
            fs.rmSync(temp, { force: true });
            result.failed.push({ name: rel, error: error.message });
            log(`  ${rel}: ${error.message}`, 'warn');
        } finally { fs.rmSync(wav, { force: true }); }
        progress(++done / pending.length, `MIDI ${done} of ${pending.length}: ${path.basename(rel)}`);
    };
    await Promise.all(Array.from({ length: workers }, async () => { while (next < pending.length) await renderOne(pending[next++]); }));
    progress(1, 'Music done');
    log(`  ${result.converted.length} MIDI file${result.converted.length === 1 ? '' : 's'} rendered with ${path.basename(soundFont)}.`, 'info');
    return result;
}

// ---- images ------------------------------------------------------------------

const IMAGE = /\.(jpe?g|bmp)$/i;

/** JPEG and BMP images under img/ (RGSS loaded them; the runtime loads PNG) with no PNG beside them. */
function pendingImages(projectDir) {
    const out = [];
    const walk = (abs, rel) => {
        let entries = [];
        try { entries = fs.readdirSync(abs, { withFileTypes: true }); } catch (_) { return; }
        for (const e of entries) {
            const r = rel + '/' + e.name;
            if (e.isDirectory()) walk(path.join(abs, e.name), r);
            else if (IMAGE.test(e.name) && !fs.existsSync(path.join(abs, e.name.replace(IMAGE, '.png')))) out.push(r.slice(1));
        }
    };
    walk(path.join(projectDir, 'img'), '/img');
    return out;
}

async function convertImages(projectDir, options = {}) {
    const log = typeof options.log === 'function' ? options.log : () => {};
    const progress = typeof options.progress === 'function' ? options.progress : () => {};
    const pending = pendingImages(projectDir);
    const result = { converted: [], failed: [] };
    if (!pending.length) return result;
    log(`Converting ${pending.length} JPEG/BMP image${pending.length === 1 ? '' : 's'} to PNG…`, 'stage');
    let ffmpeg;
    try { ffmpeg = await resolveFfmpeg(options); }
    catch (error) {
        for (const name of pending) result.failed.push({ name, error: `FFmpeg is not available (${error.message})` });
        log(`  FFmpeg is not available (${error.message}); the images stay as they are.`, 'warn');
        return result;
    }
    for (const [index, rel] of pending.entries()) {
        if (index % 10 === 0) progress(index / pending.length, `Image ${index + 1} of ${pending.length}: ${path.basename(rel)}`);
        const source = path.join(projectDir, rel), target = source.replace(IMAGE, '.png'), temp = target + '.part.png';
        try {
            await run(ffmpeg, ['-y', '-hide_banner', '-loglevel', 'error', '-i', source, '-frames:v', '1', temp]);
            fs.renameSync(temp, target);
            fs.rmSync(source, { force: true });
            result.converted.push(rel);
        } catch (error) {
            fs.rmSync(temp, { force: true });
            result.failed.push({ name: rel, error: error.message });
            log(`  ${rel}: ${error.message}`, 'warn');
        }
    }
    progress(1, 'Images done');
    return result;
}

/** Everything an imported project holds that the runtime cannot show or play yet: images, movies, then MIDI. */
async function convertMedia(projectDir, options = {}) {
    const images = await convertImages(projectDir, options);
    const movies = await convertMovies(projectDir, options);
    const music = await convertMusic(projectDir, options);
    const reportPath = path.join(projectDir, 'import-report.json');
    try {
        if (fs.existsSync(reportPath) && (music.converted.length || music.failed.length || images.converted.length || images.failed.length)) {
            const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
            if (images.converted.length || images.failed.length) report.images = { converted: images.converted.length, failed: images.failed };
            if (music.converted.length || music.failed.length) report.music = music;
            // The MIDI files the import listed as unplayable are playable now.
            const done = new Set(music.converted.map(r => r.replace(/^audio\/[^/]+\//, '').toLowerCase()));
            if (Array.isArray(report.skipped)) report.skipped = report.skipped.filter(s => !/MIDI is not played/.test(s) || !Array.from(done).some(d => s.toLowerCase().includes(d)));
            fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
        }
    } catch (_) { /* the report is informational */ }
    return { images, movies, music };
}

const pendingMedia = (projectDir) => pendingImages(projectDir).length + pendingMovies(projectDir).length + pendingMusic(projectDir).length;

module.exports = { convertImages, convertMovies, convertMusic, convertMedia, pendingImages, pendingMovies, pendingMusic, pendingMedia, midiLoop, resolveFfmpeg };
