'use strict';
// Build › Online Server: only the files that changed go to the server's folder.
//
// The folder is often a web server mounted over the network, where copying the whole game again took 13 minutes for
// a one-line fix (the Demo, 1,400 files, 2026-11-15). Each deploy leaves a record in the folder of what it put there
// (MANIFEST: every file's size and SHA-1, taken from the build, never read back from the server). The next deploy
// copies a file only when the build's copy differs from that record, or the server's file is missing or another
// size; and removes the files the earlier deploy put there that the build no longer has. Files the record does not
// name are never touched: the folder can hold other things, and players' data.
//
// The record is written last, so a deploy that stops halfway (the server restarted under it) leaves the old record
// and the next one sends again whatever differs from it. A folder with no record is sent whole, once.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const MANIFEST = '.rr-deploy.json';
const VERSION = 1;

function hashFile(file) {
    const hash = crypto.createHash('sha1'), buffer = Buffer.allocUnsafe(1 << 20), fd = fs.openSync(file, 'r');
    try { for (let read; (read = fs.readSync(fd, buffer, 0, buffer.length, null)) > 0;) hash.update(buffer.subarray(0, read)); }
    finally { fs.closeSync(fd); }
    return hash.digest('hex');
}

/** Every file under `root`, as paths with forward slashes: { rel, abs, link } (link: a symbolic link's target). */
function listFiles(root, rel = '', out = []) {
    for (const entry of fs.readdirSync(path.join(root, rel), { withFileTypes: true })) {
        const at = rel ? rel + '/' + entry.name : entry.name;
        if (entry.isDirectory()) listFiles(root, at, out);
        else out.push({ rel: at, abs: path.join(root, at), link: entry.isSymbolicLink() ? fs.readlinkSync(path.join(root, at)) : null });
    }
    return out;
}

function readManifest(dest) {
    try {
        const data = JSON.parse(fs.readFileSync(path.join(dest, MANIFEST), 'utf8'));
        return data && data.version === VERSION && data.files && typeof data.files === 'object' ? data : null;
    } catch (error) { return null; }
}

/**
 * Bring `dest` up to `src`. Options: `full` copies every file whatever the record says; `trustExisting`, for a
 * folder with no record that a whole copy of this same build has just filled, takes a file of the right size as
 * sent. Returns { total, copied, copiedBytes, kept, removed, first } (first: there was no record).
 */
function syncFolder(src, dest, options = {}) {
    const full = !!options.full, before = full ? null : readManifest(dest), known = (before && before.files) || {};
    const trust = !before && !full && !!options.trustExisting;
    const files = {}, report = { total: 0, copied: 0, copiedBytes: 0, kept: 0, removed: 0, first: !before };
    fs.mkdirSync(dest, { recursive: true });
    const made = new Set();
    for (const file of listFiles(src)) {
        if (file.rel === MANIFEST) continue;
        report.total++;
        const to = path.join(dest, file.rel);
        if (file.link !== null) {
            files[file.rel] = { link: file.link };
            let there = null;
            try { there = fs.readlinkSync(to); } catch (error) { /* not there, or not a link */ }
            if (there === file.link) { report.kept++; continue; }
            fs.mkdirSync(path.dirname(to), { recursive: true });
            try { fs.rmSync(to, { force: true }); } catch (error) { /* made below, or the error is its own */ }
            fs.symlinkSync(file.link, to);
            report.copied++;
            continue;
        }
        const size = fs.statSync(file.abs).size, hash = hashFile(file.abs), was = known[file.rel];
        files[file.rel] = { size, hash };
        if (trust || (was && was.hash === hash && was.size === size)) {
            let there = -1;
            try { there = fs.statSync(to).size; } catch (error) { /* missing: sent */ }
            if (there === size) { report.kept++; continue; }
        }
        const folder = path.dirname(to);
        if (!made.has(folder)) { fs.mkdirSync(folder, { recursive: true }); made.add(folder); }
        fs.copyFileSync(file.abs, to);
        report.copied++; report.copiedBytes += size;
        if (typeof options.onCopy === 'function') options.onCopy(file.rel, size);
    }
    // What the earlier deploy put there and this build no longer has. Nothing else in the folder is looked at.
    for (const rel of Object.keys(known)) {
        if (files[rel] || rel === MANIFEST || rel.split('/').includes('..') || path.isAbsolute(rel)) continue;
        try { fs.rmSync(path.join(dest, rel), { force: true }); report.removed++; } catch (error) { /* left: named again next time */ files[rel] = known[rel]; }
    }
    const record = path.join(dest, MANIFEST), draft = record + '.new';
    fs.writeFileSync(draft, JSON.stringify({ version: VERSION, files }));
    fs.renameSync(draft, record);
    return report;
}

/** One line for the build log. */
function describe(report) {
    const mb = bytes => (bytes / 1048576).toFixed(bytes < 10485760 ? 1 : 0) + ' MB';
    if (report.first && report.copied === report.total) return `Every file sent (${report.total} files, ${mb(report.copiedBytes)}): this folder had no record of an earlier deploy. The next deploy sends only what changed.`;
    return `${report.copied} of ${report.total} files sent (${mb(report.copiedBytes)}); ${report.kept} unchanged` + (report.removed ? `; ${report.removed} no longer in the game removed` : '') + '.';
}

module.exports = { MANIFEST, syncFolder, describe, hashFile, listFiles, readManifest };
