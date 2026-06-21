/**
 * icon-helpers.js — CommonJS module for icon operations during builds.
 * No npm dependencies — uses only Node.js built-ins.
 *
 * Exports:
 *   readPngDimensions(buf)              — parse PNG IHDR for width/height
 *   createIcoFromPng(pngBuf)            — create ICO (PNG-inside-ICO, Vista+)
 *   createIcnsFromPng(pngBuf)           — create ICNS wrapping PNG data
 *   replaceAppIcon(appBundlePath, pngBuf, log) — replace .icns in macOS .app
 *   embedExeIcon(exePath, icoBuf, log)  — embed icon in Windows .exe (PE)
 */
'use strict';

const fs = require('fs');
const path = require('path');

// ── PNG helpers ─────────────────────────────────────────────────────

/**
 * Read width/height from a PNG buffer's IHDR chunk.
 * PNG layout: 8-byte signature, then IHDR chunk (4 len + 4 "IHDR" + 4 w + 4 h).
 */
function readPngDimensions(buf) {
    if (buf.length < 24) throw new Error('Too small to be a PNG');
    if (buf[0] !== 0x89 || buf[1] !== 0x50 || buf[2] !== 0x4E || buf[3] !== 0x47) {
        throw new Error('Not a PNG file');
    }
    return {
        width:  buf.readUInt32BE(16),
        height: buf.readUInt32BE(20),
    };
}

// ── ICO creation (PNG-inside-ICO, Vista+ format) ────────────────────

/**
 * Create a .ico file containing a single PNG entry.
 * Format: 6-byte header + 16-byte directory entry + raw PNG data.
 */
function createIcoFromPng(pngBuf) {
    const { width, height } = readPngDimensions(pngBuf);

    // ICO header (6 bytes)
    const header = Buffer.alloc(6);
    header.writeUInt16LE(0, 0);     // reserved
    header.writeUInt16LE(1, 2);     // type: 1 = icon
    header.writeUInt16LE(1, 4);     // count: 1 entry

    // Directory entry (16 bytes)
    const entry = Buffer.alloc(16);
    entry[0] = width >= 256 ? 0 : width;       // width  (0 means 256+)
    entry[1] = height >= 256 ? 0 : height;     // height (0 means 256+)
    entry[2] = 0;                               // color palette count
    entry[3] = 0;                               // reserved
    entry.writeUInt16LE(1, 4);                  // color planes
    entry.writeUInt16LE(32, 6);                 // bits per pixel
    entry.writeUInt32LE(pngBuf.length, 8);      // data size
    entry.writeUInt32LE(22, 12);                // data offset (6 + 16 = 22)

    return Buffer.concat([header, entry, pngBuf]);
}

// ── ICNS creation (PNG-inside-ICNS) ─────────────────────────────────

/**
 * Create a .icns file containing a single PNG entry.
 * Type codes: ic07=128, ic08=256, ic09=512, ic10=1024.
 */
function createIcnsFromPng(pngBuf) {
    const { width } = readPngDimensions(pngBuf);

    let typeCode;
    if (width <= 128)       typeCode = 'ic07';  // 128x128
    else if (width <= 256)  typeCode = 'ic08';  // 256x256
    else if (width <= 512)  typeCode = 'ic09';  // 512x512
    else                    typeCode = 'ic10';  // 1024x1024

    const entrySize = 8 + pngBuf.length;    // type(4) + size(4) + data
    const totalSize = 8 + entrySize;        // magic(4) + fileSize(4) + entry

    const buf = Buffer.alloc(totalSize);
    buf.write('icns', 0, 4, 'ascii');       // magic
    buf.writeUInt32BE(totalSize, 4);        // file size
    buf.write(typeCode, 8, 4, 'ascii');     // entry type
    buf.writeUInt32BE(entrySize, 12);       // entry size (incl. 8-byte header)
    pngBuf.copy(buf, 16);                  // PNG data

    return buf;
}

// ── macOS: replace .icns in .app bundle ─────────────────────────────

/**
 * Replace all .icns files in a macOS .app bundle with a new ICNS
 * generated from the provided PNG buffer.
 */
function replaceAppIcon(appBundlePath, pngBuf, log) {
    try {
        const resourcesDir = path.join(appBundlePath, 'Contents', 'Resources');
        if (!fs.existsSync(resourcesDir)) {
            log('  [icon] No Contents/Resources/ in app bundle — skipping');
            return;
        }

        const icnsFiles = fs.readdirSync(resourcesDir).filter(f => f.endsWith('.icns'));
        if (icnsFiles.length === 0) {
            log('  [icon] No .icns files found in Resources/ — skipping');
            return;
        }

        const icnsBuf = createIcnsFromPng(pngBuf);

        for (const icnsFile of icnsFiles) {
            const icnsPath = path.join(resourcesDir, icnsFile);
            fs.writeFileSync(icnsPath, icnsBuf);
            log(`  [icon] Replaced ${icnsFile} (${icnsBuf.length} bytes)`);
        }
    } catch (err) {
        log(`  [icon] Warning: could not replace macOS icon: ${err.message}`);
    }
}

// ── Windows: embed icon in PE executable ────────────────────────────

/**
 * Replace the icon in a Windows .exe with the provided ICO buffer.
 * Parses the PE resource section, finds the largest RT_ICON slot,
 * writes the new icon data in-place, and updates RT_GROUP_ICON.
 * Gracefully skips if anything goes wrong.
 */
function embedExeIcon(exePath, icoBuf, log) {
    try {
        const exe = fs.readFileSync(exePath);
        const result = _replaceExeIcon(exe, icoBuf);
        if (result) {
            fs.writeFileSync(exePath, result);
            log(`  [icon] Embedded icon in ${path.basename(exePath)}`);
        } else {
            log('  [icon] Could not embed icon — no suitable slot found');
        }
    } catch (err) {
        log(`  [icon] Warning: could not embed Windows icon: ${err.message}`);
    }
}

/**
 * Internal: replace icon data inside a PE buffer.
 * Returns modified Buffer, or null if replacement not possible.
 */
function _replaceExeIcon(exe, icoBuf) {
    // ── Parse ICO buffer ────────────────────────────────────────────
    if (icoBuf.length < 22) return null;
    const icoEntryCount = icoBuf.readUInt16LE(4);
    if (icoEntryCount < 1) return null;

    const icoEntries = [];
    for (let i = 0; i < icoEntryCount; i++) {
        const entryOff = 6 + i * 16;
        const width = icoBuf[entryOff] || 256;
        const height = icoBuf[entryOff + 1] || 256;
        const dataSize = icoBuf.readUInt32LE(entryOff + 8);
        const dataOff = icoBuf.readUInt32LE(entryOff + 12);
        if (dataOff + dataSize <= icoBuf.length) {
            icoEntries.push({
                rawWidth: icoBuf[entryOff],
                rawHeight: icoBuf[entryOff + 1],
                width,
                height,
                bpp: icoBuf.readUInt16LE(entryOff + 6),
                dataSize,
                data: icoBuf.slice(dataOff, dataOff + dataSize),
            });
        }
    }
    if (icoEntries.length === 0) return null;

    // ── Parse PE headers ────────────────────────────────────────────
    if (exe.length < 64) return null;
    if (exe[0] !== 0x4D || exe[1] !== 0x5A) return null; // Not MZ

    const peOffset = exe.readUInt32LE(0x3C);
    if (peOffset + 24 > exe.length) return null;
    if (exe[peOffset] !== 0x50 || exe[peOffset + 1] !== 0x45) return null;

    const coffOffset   = peOffset + 4;
    const numSections  = exe.readUInt16LE(coffOffset + 2);
    const optHdrSize   = exe.readUInt16LE(coffOffset + 16);
    const optOffset    = coffOffset + 20;

    // PE32 vs PE32+
    const optMagic = exe.readUInt16LE(optOffset);
    const is64     = optMagic === 0x20B;

    // Data directories: resource table is entry #2
    const ddBase      = optOffset + (is64 ? 112 : 96);
    const resourceRVA = exe.readUInt32LE(ddBase + 2 * 8);
    if (resourceRVA === 0) return null;

    // ── Find .rsrc section ──────────────────────────────────────────
    const secTableOff = optOffset + optHdrSize;
    let rsrc = null;

    for (let i = 0; i < numSections; i++) {
        const so = secTableOff + i * 40;
        const name = exe.slice(so, so + 8).toString('ascii').replace(/\0+$/, '');
        if (name === '.rsrc') {
            rsrc = {
                va:     exe.readUInt32LE(so + 12),  // VirtualAddress
                rawSz:  exe.readUInt32LE(so + 16),  // SizeOfRawData
                rawPtr: exe.readUInt32LE(so + 20),  // PointerToRawData
            };
            break;
        }
    }
    if (!rsrc) return null;

    const rsrcBase = rsrc.rawPtr; // file offset of .rsrc section start

    // Convert RVA → file offset (for data within .rsrc)
    const rva2fo = (rva) => rva - rsrc.va + rsrc.rawPtr;

    // ── Parse resource directory tree ───────────────────────────────
    // Offsets in directory entries are relative to section start.

    function readDir(foff) {
        const numNamed = exe.readUInt16LE(foff + 12);
        const numId    = exe.readUInt16LE(foff + 14);
        const entries  = [];
        for (let i = 0; i < numNamed + numId; i++) {
            const eo      = foff + 16 + i * 8;
            const nameId  = exe.readUInt32LE(eo);
            const offVal  = exe.readUInt32LE(eo + 4);
            const isSub   = (offVal & 0x80000000) !== 0;
            entries.push({
                id:       nameId & 0x7FFFFFFF,
                isNamed:  (nameId & 0x80000000) !== 0,
                isSub,
                childFO:  rsrcBase + (offVal & 0x7FFFFFFF),
                entryFO:  eo,
            });
        }
        return entries;
    }

    function readDataEntry(foff) {
        return {
            dataRVA:  exe.readUInt32LE(foff),
            dataSize: exe.readUInt32LE(foff + 4),
            foff,     // file offset of this IMAGE_RESOURCE_DATA_ENTRY
        };
    }

    // Level 1: resource types
    const level1 = readDir(rsrcBase);

    let iconTypeEntry = null;
    let groupTypeEntry = null;
    for (const e of level1) {
        if (e.id === 3  && e.isSub && !e.isNamed) iconTypeEntry  = e; // RT_ICON
        if (e.id === 14 && e.isSub && !e.isNamed) groupTypeEntry = e; // RT_GROUP_ICON
    }
    if (!iconTypeEntry || !groupTypeEntry) return null;

    // Collect all RT_ICON data entries: { id, dataEntry }
    const iconSlots = [];
    for (const l2 of readDir(iconTypeEntry.childFO)) {
        if (!l2.isSub) continue;
        for (const l3 of readDir(l2.childFO)) {
            if (l3.isSub) continue;
            iconSlots.push({ id: l2.id, de: readDataEntry(l3.childFO) });
        }
    }
    if (iconSlots.length === 0) return null;

    // Sort PE slots by data size descending and choose the largest ICO entry
    // that fits. Multi-size .ico files often put a 256px entry last; using only
    // the first entry can leave Windows builds with the default/blank icon.
    iconSlots.sort((a, b) => b.de.dataSize - a.de.dataSize);
    icoEntries.sort((a, b) => (b.width * b.height) - (a.width * a.height));

    let target = null;
    let icoEntry = null;
    for (const entry of icoEntries) {
        target = iconSlots.find(s => s.de.dataSize >= entry.data.length);
        if (target) {
            icoEntry = entry;
            break;
        }
    }
    if (!target || !icoEntry) return null; // new icon too large for any slot

    // ── Write new icon data ─────────────────────────────────────────
    const result = Buffer.from(exe);

    const dataFO = rva2fo(target.de.dataRVA);
    icoEntry.data.copy(result, dataFO);

    // Zero-pad remaining space in the slot
    if (icoEntry.data.length < target.de.dataSize) {
        result.fill(0, dataFO + icoEntry.data.length, dataFO + target.de.dataSize);
    }

    // Update the data entry's size field
    result.writeUInt32LE(icoEntry.data.length, target.de.foff + 4);

    // ── Update RT_GROUP_ICON ────────────────────────────────────────
    // Set count=1 and point the single entry to our replaced icon.
    for (const l2 of readDir(groupTypeEntry.childFO)) {
        if (!l2.isSub) continue;
        for (const l3 of readDir(l2.childFO)) {
            if (l3.isSub) continue;
            const gde = readDataEntry(l3.childFO);
            const gfo = rva2fo(gde.dataRVA);

            // GRPICONDIR: reserved(2) + type(2) + count(2) + entries(14 each)
            // Set count to 1
            result.writeUInt16LE(1, gfo + 4);

            // Write single GRPICONDIRENTRY at offset +6 (14 bytes)
            result[gfo + 6]  = icoEntry.rawWidth;    // bWidth  (0 = 256+)
            result[gfo + 7]  = icoEntry.rawHeight;   // bHeight (0 = 256+)
            result[gfo + 8]  = 0;           // bColorCount
            result[gfo + 9]  = 0;           // bReserved
            result.writeUInt16LE(1, gfo + 10);              // wPlanes
            result.writeUInt16LE(icoEntry.bpp, gfo + 12);   // wBitCount
            result.writeUInt32LE(icoEntry.data.length, gfo + 14); // dwBytesInRes
            result.writeUInt16LE(target.id, gfo + 18);      // nID

            // Update the GROUP_ICON data entry size (6 header + 14 entry = 20)
            result.writeUInt32LE(20, gde.foff + 4);
        }
    }

    return result;
}

module.exports = {
    readPngDimensions,
    createIcoFromPng,
    createIcnsFromPng,
    replaceAppIcon,
    embedExeIcon,
};
