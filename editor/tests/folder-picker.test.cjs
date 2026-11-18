'use strict';
// Choosing a folder (owner, 2026-11-17: opening the Demo closed the whole editor). NW.js 0.117 and later abort on
// a folder chosen through <input nwdirectory> ("Check failed: !base_dir.empty()", nwjs/nw.js#8393), so the editor
// browses folders itself with Node's fs (RRFolderPicker). Seen in the editor on the desktop (NW.js 0.120, Linux)
// and in the Windows build of NW.js 0.120 under Wine: Open Project through it opened a copy of the Demo.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const picker = require('../src/utils/FolderPicker.js');
const src = path.join(__dirname, '..', 'src');

test('no picker in the editor uses <input nwdirectory> any more', () => {
    const found = [];
    const walk = dir => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) walk(full);
            else if (/\.(js|html)$/.test(entry.name) && entry.name !== 'FolderPicker.js' && /nwdirectory/.test(fs.readFileSync(full, 'utf8'))) found.push(path.relative(src, full));
        }
    };
    walk(src);
    assert.deepEqual(found, []);
    assert.match(fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8'), /<script src="src\/utils\/FolderPicker\.js"><\/script>/);
});

test('a folder lists its folders by name, projects marked; files, hidden and system folders left out', t => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-folders-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    for (const name of ['b game', 'A game', 'c10', 'c9', '.git', '$RECYCLE.BIN', 'MV game', 'MZ game']) fs.mkdirSync(path.join(root, name));
    fs.mkdirSync(path.join(root, 'A game', 'data'));
    fs.writeFileSync(path.join(root, 'A game', 'data', 'System.json'), '{}');
    fs.writeFileSync(path.join(root, 'MV game', 'Game.rpgproject'), 'RPGMV 1.6.2');
    fs.writeFileSync(path.join(root, 'MZ game', 'game.rmmzproject'), 'RPGMZ 1.0.0');
    fs.writeFileSync(path.join(root, 'notes.txt'), 'a file');
    try { fs.symlinkSync(path.join(root, 'c9'), path.join(root, 'linked')); } catch (error) { /* no symlinks here (Windows without the right) */ }
    const listed = picker.listFolders(root);
    const expected = ['A game', 'b game', 'c9', 'c10'];
    if (fs.existsSync(path.join(root, 'linked'))) expected.push('linked');
    expected.push('MV game', 'MZ game');
    assert.deepEqual(listed.map(f => f.name), expected);
    assert.deepEqual(listed.filter(f => f.project).map(f => f.name), ['A game', 'MV game', 'MZ game']);
    assert.equal(listed[0].path, path.join(root, 'A game'));
    assert.throws(() => picker.listFolders(path.join(root, 'missing')), /ENOENT/);
});

test('it opens where it was asked, or the nearest folder above that exists, or the last one used, or home', t => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-folders-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    fs.mkdirSync(path.join(root, 'kept'));
    assert.equal(picker.startFolder(path.join(root, 'kept')), path.join(root, 'kept'));
    assert.equal(picker.startFolder(path.join(root, 'kept', 'gone', 'deeper')), path.join(root, 'kept'));
    assert.equal(picker.startFolder('', { last: path.join(root, 'kept') }), path.join(root, 'kept'));
    assert.equal(picker.startFolder(''), os.homedir());
});

test("the sidebar has the system's own places, bookmarks, recent folders and drives, on each system", () => {
    const dirs = new Set(['C:\\Users\\a', 'C:\\Users\\a\\OneDrive\\Desktop', 'C:\\Users\\a\\OneDrive\\Documents', 'C:\\Users\\a\\Downloads', 'C:\\Users\\a\\OneDrive', 'C:\\Games', 'C:\\', 'D:\\',
        '/home/a', '/home/a/Bureau', '/home/a/Documents', '/home/a/Téléchargements', '/home/a/Games', '/srv/share', '/', '/mnt', '/mnt/sda1', '/mnt/My Disk', '/media', '/media/a', '/media/a/USB',
        '/Users/a', '/Users/a/Movies', '/Users/a/Library/Mobile Documents/com~apple~CloudDocs', '/Volumes', '/Volumes/Backup']);
    const files = {
        '/home/a/.config/user-dirs.dirs': 'XDG_DESKTOP_DIR="$HOME/Bureau"\nXDG_DOWNLOAD_DIR="$HOME/Téléchargements"\nXDG_MUSIC_DIR="$HOME"\n',
        '/home/a/.config/gtk-3.0/bookmarks': 'file:///home/a/Games Games\nsftp://server/x Remote\nfile:///srv/share\n',
        '/home/a/.local/share/user-places.xbel': '<xbel><bookmark href="file:///home/a/Games"><title>Dup</title></bookmark><bookmark href="file:///mnt/sda1"><title>Big &amp; Disk</title><info><metadata><IsHidden>true</IsHidden></metadata></info></bookmark></xbel>',
        '/proc/mounts': '/dev/sda1 /mnt/sda1 ext4 rw 0 0\n/dev/sdb1 /mnt/My\\040Disk ntfs rw 0 0\nproc /proc proc rw 0 0\n/dev/sdc1 /media/a/USB vfat rw 0 0\n'
    };
    const fake = {
        statSync: dir => { if (!dirs.has(dir)) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' }); return { isDirectory: () => true }; },
        readdirSync: dir => [...dirs].filter(d => d.startsWith(dir + '/') && !d.slice(dir.length + 1).includes('/')).map(d => d.slice(dir.length + 1)),
        readFileSync: file => { if (file in files) return files[file]; throw new Error('ENOENT'); }
    };
    const show = list => list.map(p => p.group + ':' + p.label + '=' + p.path);

    const win = picker.places({ fs: fake, path: path.win32, os: { homedir: () => 'C:\\Users\\a' }, platform: 'win32', env: { OneDrive: 'C:\\Users\\a\\OneDrive' },
        knownFolders: picker.windowsKnownFolders('\r\nHKEY_CURRENT_USER\\...\\User Shell Folders\r\n    Desktop    REG_EXPAND_SZ    %OneDrive%\\Desktop\r\n    Personal    REG_EXPAND_SZ    %OneDrive%\\Documents\r\n    {374DE290-123F-4565-9164-39C4925E467B}    REG_EXPAND_SZ    %USERPROFILE%\\Downloads\r\n', { OneDrive: 'C:\\Users\\a\\OneDrive', USERPROFILE: 'C:\\Users\\a' }),
        recent: ['C:\\Games', 'C:\\Gone'] });
    assert.deepEqual(show(win), ['places:Home Folder=C:\\Users\\a', 'places:Desktop=C:\\Users\\a\\OneDrive\\Desktop', 'places:Documents=C:\\Users\\a\\OneDrive\\Documents',
        'places:Downloads=C:\\Users\\a\\Downloads', 'places:OneDrive=C:\\Users\\a\\OneDrive', 'recent:Games=C:\\Games', 'drives:C:=C:\\', 'drives:D:=D:\\']);

    const linux = picker.places({ fs: fake, path: path.posix, os: { homedir: () => '/home/a' }, platform: 'linux', env: { USER: 'a' }, recent: ['/home/a/Games'] });
    assert.deepEqual(show(linux), ['places:Home Folder=/home/a', 'places:Desktop=/home/a/Bureau', 'places:Documents=/home/a/Documents', 'places:Downloads=/home/a/Téléchargements',
        'bookmarks:Games=/home/a/Games', 'bookmarks:share=/srv/share', 'drives:/=/', 'drives:USB=/media/a/USB', 'drives:My Disk=/mnt/My Disk', 'drives:sda1=/mnt/sda1'],
        'XDG folders in their own names; GTK and KDE bookmarks (local, shown, once); recent ones already listed are not repeated; mounted disks only');

    const mac = picker.places({ fs: fake, path: path.posix, os: { homedir: () => '/Users/a' }, platform: 'darwin', env: {}, recent: [] });
    assert.deepEqual(show(mac), ['places:Home Folder=/Users/a', 'places:Videos=/Users/a/Movies', 'places:iCloud Drive=/Users/a/Library/Mobile Documents/com~apple~CloudDocs', 'drives:/=/', 'drives:Backup=/Volumes/Backup']);
});

test("the system's hidden folders stay out unless asked for; dates come with the folders and sort either way", t => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-folders-'));
    t.after(() => fs.rmSync(home, { recursive: true, force: true }));
    for (const name of ['Games', '.config', 'Old']) fs.mkdirSync(path.join(home, name));
    fs.utimesSync(path.join(home, 'Old'), new Date('2020-01-01'), new Date('2020-01-01'));
    assert.deepEqual(picker.listFolders(home).map(f => f.name), ['Games', 'Old']);
    const all = picker.listFolders(home, { showHidden: true });
    assert.deepEqual(all.map(f => f.name + (f.hidden ? '*' : '')), ['.config*', 'Games', 'Old']);
    assert.deepEqual(picker.sortFolders(all, 'modified').map(f => f.name)[0], 'Old');
    assert.deepEqual(picker.sortFolders(all, 'name', true).map(f => f.name), ['Old', 'Games', '.config']);
    assert.ok(all.every(f => f.modified > 0));
    const win = { platform: 'win32', path: path.win32, home: 'C:\\Users\\a' };
    for (const name of ['AppData', 'Application Data', 'ProgramData', '$WinREAgent', 'Recovery']) assert.equal(picker.isHidden(name, 'C:\\', win), true, name);
    for (const name of ['Games', 'Program Files', 'Users']) assert.equal(picker.isHidden(name, 'C:\\', win), false, name);
    const mac = { platform: 'darwin', path: path.posix, home: '/Users/a' };
    assert.equal(picker.isHidden('usr', '/', mac), true);
    assert.equal(picker.isHidden('Applications', '/', mac), false);
    assert.equal(picker.isHidden('Library', '/Users/a', mac), true);
    assert.equal(picker.isHidden('Library', '/Users/a/Games', mac), false);
});

test('a typed path: ~, %VAR% and $VAR, a bare drive; its completions; the path above the list', t => {
    const linux = { platform: 'linux', path: path.posix, os: { homedir: () => '/home/a' }, env: { HOME: '/home/a', GAMES: '/srv/games' } };
    assert.equal(picker.expandPath('~/Games', linux), '/home/a/Games');
    assert.equal(picker.expandPath('$GAMES/x', linux), '/srv/games/x');
    assert.equal(picker.expandPath('${GAMES}', linux), '/srv/games');
    assert.equal(picker.expandPath(' "/home/a/My Game" ', linux), '/home/a/My Game', 'quotes from a copied path');
    const win = { platform: 'win32', path: path.win32, os: { homedir: () => 'C:\\Users\\a' }, env: { USERPROFILE: 'C:\\Users\\a' } };
    assert.equal(picker.expandPath('%userprofile%\\Documents', win), 'C:\\Users\\a\\Documents');
    assert.equal(picker.expandPath('d:', win), 'd:\\');
    assert.deepEqual(picker.crumbs('/home/a/Games', path.posix).map(c => c.label + '=' + c.path), ['/=/', 'home=/home', 'a=/home/a', 'Games=/home/a/Games']);
    assert.deepEqual(picker.crumbs('C:\\Users\\a', path.win32).map(c => c.label), ['C:', 'Users', 'a']);

    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-folders-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    for (const name of ['Games', 'Gallery', 'Music']) fs.mkdirSync(path.join(root, name));
    assert.deepEqual(picker.completions(path.join(root, 'Ga')).map(p => path.basename(p)), ['Gallery', 'Games']);
    assert.deepEqual(picker.completions(root + path.sep).length, 3);
    assert.equal(picker.commonStart([path.join(root, 'Gallery'), path.join(root, 'Games')]), path.join(root, 'Ga'));
});

test('recent folders: the newest first, each once, eight at most', () => {
    let list = [];
    for (const dir of ['/a', '/b', '/a', '/c', '/d', '/e', '/f', '/g', '/h', '/i']) list = picker.withRecent(list, dir);
    assert.deepEqual(list, ['/i', '/h', '/g', '/f', '/e', '/d', '/c', '/a']);
});
