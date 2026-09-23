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
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
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

module.exports = { convertMovies, pendingMovies, resolveFfmpeg };
