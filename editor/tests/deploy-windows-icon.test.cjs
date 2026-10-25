'use strict';
// A Windows game build carries the project's icon: icon/icon.png is often
// 1024 px (the bundled projects' is), larger than an ICO entry can name and
// than the executable's icon slots hold, so it is scaled down to fit.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { PNG } = require('pngjs');
const icons = require('../build-scripts/icon-helpers.js');

function noisePng(side) {
    const png = new PNG({ width: side, height: side });
    let seed = 12345;
    for (let i = 0; i < png.data.length; i++) {
        seed = (seed * 1103515245 + 12345) >>> 0;
        png.data[i] = (i & 3) === 3 ? 255 : seed >>> 24;
    }
    return PNG.sync.write(png);
}

/** A minimal PE32+ whose .rsrc holds one RT_ICON slot of `slotSize` bytes and one RT_GROUP_ICON. */
function fakeExe(slotSize) {
    const rawPtr = 0x400, va = 0x1000;
    const rsrcSize = 160 + slotSize + 20;
    const exe = Buffer.alloc(rawPtr + rsrcSize);
    exe.write('MZ', 0, 'ascii');
    exe.writeUInt32LE(0x80, 0x3C);
    exe.write('PE\0\0', 0x80, 'binary');
    const coff = 0x84, opt = coff + 20;
    exe.writeUInt16LE(0x8664, coff);
    exe.writeUInt16LE(1, coff + 2);
    exe.writeUInt16LE(240, coff + 16);
    exe.writeUInt16LE(0x20B, opt);
    exe.writeUInt32LE(va, opt + 112 + 16);
    exe.writeUInt32LE(rsrcSize, opt + 112 + 20);
    const section = opt + 240;
    exe.write('.rsrc', section, 'ascii');
    exe.writeUInt32LE(rsrcSize, section + 8);
    exe.writeUInt32LE(va, section + 12);
    exe.writeUInt32LE(rsrcSize, section + 16);
    exe.writeUInt32LE(rawPtr, section + 20);
    const dir = (at, entries) => {
        exe.writeUInt16LE(entries.length, rawPtr + at + 14);
        entries.forEach(([id, offset], i) => {
            exe.writeUInt32LE(id, rawPtr + at + 16 + i * 8);
            exe.writeUInt32LE(offset >>> 0, rawPtr + at + 20 + i * 8);
        });
    };
    const sub = 0x80000000;
    dir(0, [[3, sub | 32], [14, sub | 96]]);
    dir(32, [[1, sub | 56]]);
    dir(56, [[0x409, 80]]);
    exe.writeUInt32LE(va + 160, rawPtr + 80);
    exe.writeUInt32LE(slotSize, rawPtr + 84);
    dir(96, [[1, sub | 120]]);
    dir(120, [[0x409, 144]]);
    exe.writeUInt32LE(va + 160 + slotSize, rawPtr + 144);
    exe.writeUInt32LE(20, rawPtr + 148);
    return exe;
}

test('an icon larger than 256 px goes into the ICO at 256 px', () => {
    const ico = icons.createIcoFromPng(noisePng(1024));
    assert.equal(ico.readUInt16LE(4), 1);
    assert.equal(ico[6], 0, 'the entry names 256 px');
    const png = ico.slice(ico.readUInt32LE(18));
    assert.equal(png.length, ico.readUInt32LE(14));
    assert.deepEqual(icons.readPngDimensions(png), { width: 256, height: 256 });
});

test('an icon too large for the executable slot is embedded smaller', () => {
    const png256 = icons.shrinkPng(noisePng(1024), 256), png128 = icons.shrinkPng(png256, 128);
    assert.ok(png128.length < png256.length);
    const slot = Math.round((png128.length + png256.length) / 2);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-exe-icon-'));
    try {
        const exePath = path.join(dir, 'Game.exe');
        fs.writeFileSync(exePath, fakeExe(slot));
        const lines = [];
        icons.embedExeIcon(exePath, icons.createIcoFromPng(noisePng(1024)), line => lines.push(line));
        assert.match(lines.join('\n'), /Embedded icon in Game\.exe/);
        const exe = fs.readFileSync(exePath);
        const data = exe.slice(0x400 + 160, 0x400 + 160 + exe.readUInt32LE(0x400 + 84));
        assert.deepEqual(icons.readPngDimensions(data), { width: 128, height: 128 });
        const group = 0x400 + 160 + slot;
        assert.equal(exe.readUInt16LE(group + 4), 1);
        assert.equal(exe[group + 6], 128);
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

test('scaling an icon down keeps transparent edges from darkening its colors', () => {
    const png = new PNG({ width: 2, height: 2 });
    png.data.fill(0);
    png.data.set([255, 0, 0, 255], 0);
    const one = PNG.sync.read(icons.shrinkPng(PNG.sync.write(png), 1));
    assert.deepEqual([...one.data], [255, 0, 0, 64]);
});
