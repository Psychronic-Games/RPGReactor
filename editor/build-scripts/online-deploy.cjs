'use strict';
// Build › Online Server: the parts that are not the Web build itself. The folder it writes into may
// be a live web root with other people's files beside the game, so nothing here removes a file.
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { copyWebForgeAssets } = require('./web-forge-assets.cjs');

const SERVER_FOLDER = 'reactor-online';
const API_PATH = SERVER_FOLDER + '/api.php';
const ENGINE_DEFAULTS = Object.freeze({ enabled: true, rate: 15, movement: 'speed', maxSpeed: 16 });

/** The API's address for a game: beside the page when no public address is given (a browser game on the same site). */
function apiUrl(publicAddress) {
    const address = String(publicAddress || '').trim().replace(/\/+$/, '');
    if (!address) return API_PATH;
    const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(address) ? address : 'https://' + address;
    return withScheme + '/' + API_PATH;
}

function readData(stagingDir, name) {
    const file = path.join(stagingDir, 'data', name);
    return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, '')) : {};
}

/** Tells the staged game where its server is, keeping the project's Database › Online settings. */
function stampOnlineClient(stagingDir, publicAddress, settings = {}, characters = null) {
    const online = { ...readData(stagingDir, 'ReactorOnline.json'), ...settings, enabled: true, url: apiUrl(publicAddress) };
    online.engine = { ...ENGINE_DEFAULTS, ...online.engine };
    fs.writeFileSync(path.join(stagingDir, 'data', 'ReactorOnline.json'), JSON.stringify(online));
    if (characters) fs.writeFileSync(path.join(stagingDir, 'data', 'ReactorCharacters.json'), JSON.stringify(characters));
    return online;
}

/**
 * A game whose players build characters ships the Forge itself, copied from the
 * editor's own source at build time, so there is only ever one version of it.
 */
function stageCharacterBuilder(stagingDir, appRoot) {
    if (readData(stagingDir, 'ReactorCharacters.json').mode !== 'build') return false;
    copyWebForgeAssets(appRoot, path.join(stagingDir, 'reactor-builder'), path.join(stagingDir, 'js'));
    return true;
}

/**
 * One bit per tile, set where a walker can stand, for the server to hold players to. The same
 * rule as Game_Map.checkPassage: the top layer that isn't a star tile decides, in any direction.
 */
function passabilityGrid(map, flags) {
    const { width, height, data } = map, out = Buffer.alloc(4 + Math.ceil(width * height / 8));
    out.writeUInt16LE(width, 0);
    out.writeUInt16LE(height, 2);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        for (let z = 3; z >= 0; z--) {
            const flag = flags[data[(z * height + y) * width + x] || 0] || 0;
            if (flag & 0x10) continue;
            if ((flag & 0x0f) !== 0x0f) { const at = y * width + x; out[4 + (at >> 3)] |= 1 << (at & 7); }
            break;
        }
    }
    return out;
}

/** The server knows no game logic, so walls reach it as files. Only a project that asks for this needs them. */
function writeGrids(serverFolder, dataFolder) {
    const tilesets = JSON.parse(fs.readFileSync(path.join(dataFolder, 'Tilesets.json'), 'utf8').replace(/^\uFEFF/, ''));
    const target = path.join(serverFolder, 'grids');
    fs.mkdirSync(target, { recursive: true });
    let written = 0;
    for (const name of fs.readdirSync(dataFolder)) {
        const id = /^Map(\d+)\.json$/.exec(name);
        if (!id) continue;
        const map = JSON.parse(fs.readFileSync(path.join(dataFolder, name), 'utf8').replace(/^\uFEFF/, ''));
        const flags = tilesets[map.tilesetId]?.flags;
        if (!flags || !Array.isArray(map.data)) continue;
        fs.writeFileSync(path.join(target, `m${Number(id[1])}.bin`), passabilityGrid(map, flags));
        written++;
    }
    return written;
}

function phpString(value) {
    return "'" + String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";
}

/**
 * Writes reactor-online/ into the deployed folder. The secret is made once and kept, so a rebuild
 * updates the server without signing players out; only api.php and the config's labels change.
 */
function writeOnlineServer(folder, { appRoot, project, title, runtime, maxPlayers = 64, rules = {}, settings = {}, dataFolder = path.join(folder, 'data') }) {
    const target = path.join(folder, SERVER_FOLDER);
    fs.mkdirSync(target, { recursive: true });
    const configPath = path.join(target, 'config.php');
    const before = fs.existsSync(configPath) ? fs.readFileSync(configPath, 'utf8') : '';
    const kept = /'secret'\s*=>\s*'([0-9a-f]{64})'/.exec(before);
    const secret = kept ? kept[1] : crypto.randomBytes(32).toString('hex');
    // The owner's password lives here and nowhere else: never in the project, whose files every player receives.
    // Inside the machine only, and the same for this server across deploys.
    const enginePort = 20000 + (parseInt(secret.slice(0, 8), 16) % 9000);
    const keptAdmin = /'adminKey'\s*=>\s*'([0-9a-f]{20,})'/.exec(before);
    const adminKey = keptAdmin ? keptAdmin[1] : crypto.randomBytes(12).toString('hex');
    const config = `<?php\nreturn [\n    'secret' => '${secret}',\n    'project' => ${phpString(project)},\n    'title' => ${phpString(title)},\n    'runtime' => ${phpString(runtime)},\n    'maxPlayers' => ${Math.max(1, Math.min(1024, Number(maxPlayers) || 64))},\n    'rules' => ${phpString(JSON.stringify(rules || {}))},\n    'settings' => ${phpString(JSON.stringify({ accounts: settings.accounts, chat: settings.chat, world: settings.world, engine: settings.engine, voice: { enabled: !!settings.voice?.enabled, who: settings.voice?.who || 'all' } }))},\n    'adminKey' => '${adminKey}',\n    'enginePort' => ${enginePort},\n];\n`;
    // In place, then swapped, so a player's request never reads half a file.
    const swap = (name, contents) => {
        const temporary = path.join(target, `.${name}.${process.pid}.tmp`);
        fs.writeFileSync(temporary, contents);
        fs.renameSync(temporary, path.join(target, name));
    };
    swap('config.php', config);
    for (const name of ['common.php', 'api.php', 'admin.php', 'engine.cjs']) swap(name, fs.readFileSync(path.join(appRoot, 'build-scripts', 'online-server', name)));
    // With a host's WebSocket proxy on, this one rule carries wss://…/ws to the Engine. Without it, the rule does nothing.
    swap('.htaccess', `<IfModule mod_proxy_wstunnel.c>\nRewriteEngine On\nRewriteCond %{HTTP:Upgrade} =websocket [NC]\nRewriteRule ^ws$ ws://127.0.0.1:${enginePort}/ [P,L]\n</IfModule>\n`);
    const grids = settings.engine?.movement === 'walls' ? writeGrids(target, dataFolder) : 0;
    return { folder: target, newSecret: !kept, adminKey: keptAdmin ? '' : adminKey, grids };
}

module.exports = { SERVER_FOLDER, API_PATH, ENGINE_DEFAULTS, apiUrl, readData, stampOnlineClient, stageCharacterBuilder, passabilityGrid, writeOnlineServer };
