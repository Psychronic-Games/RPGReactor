<?php
// RPG Reactor online server, Lite mode: what players' games talk to. No database: a build
// copies these files into the game's folder beside a config.php holding this server's secret.
// Each player's place is one fixed-size record in one file per map, so an update writes twelve
// bytes and reads the map's file, and the client does the sorting. Players' characters are
// kept as files, named by their contents, and handed to whoever meets them.
// Design: docs/DESIGN-ONLINE.md.
declare(strict_types=1);
require __DIR__ . '/common.php';

header('Access-Control-Allow-Origin: *');   // desktop builds call from their own origin
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

$config = loadConfig();
$secret = (string)$config['secret'];
$action = (string)($_GET['a'] ?? 'info');

if ($action === 'sync') {
    // Kept first and short: this runs several times a second for every player.
    $slot = player($secret);
    $dir = dataDir($config);
    $state = aliveAt($dir, $slot);
    if ($state === REMOVED) fail(403, 'You have been removed from this world.');
    if ($state === REPLACED) fail(403, 'You signed in somewhere else.');
    $map = intParam('m', 1, 9999);
    $now = time();
    $file = fopen($dir . '/p2m' . $map . '.bin', 'c+b');
    if (!$file) fail(500, 'Could not open the map.');
    fseek($file, $slot * RECORD);
    // The sender's own clock travels with the place, so a watcher can replay the walk as it happened.
    fwrite($file, pack('vvvvV', intParam('x', 0, 65535), intParam('y', 0, 65535), intParam('f', 0, 255), $now & 0xffff, intParam('c', 0, 0xffffffff)));
    rewind($file);
    $records = (string)stream_get_contents($file);
    fclose($file);
    touchAlive($dir, $slot, $now);
    $previous = intParam('pm', 0, 9999);
    if ($previous > 0 && $previous !== $map) clearRecord($dir, $previous, $slot);
    header('Content-Type: application/octet-stream');
    echo pack('vVV', $now & 0xffff, chatCount($dir), worldCount($dir)), $records;
    exit;
}

$settings = settingsOf($config);

if ($action === 'join') {
    $dir = dataDir($config);
    $ip = addressKey($secret);
    if (isBanned($dir, $ip)) fail(403, 'You have been banned from this world.');
    $body = jsonBody();
    $account = isset($body['session']) ? sessionAccount((string)$body['session'], $secret, $dir) : null;
    if (!$account && $settings['accounts']['mode'] === 'required') fail(401, 'Sign in to play.');
    $lock = lockPlayers($dir);
    $now = time();
    $alive = (string)@file_get_contents($dir . '/alive.bin');
    $times = strlen($alive) >= 4 ? unpack('V*', substr($alive, 0, strlen($alive) - strlen($alive) % 4)) : [];
    $slot = -1;
    $limit = max(1, min(SLOTS, (int)($config['maxPlayers'] ?? SLOTS)));
    for ($i = 0; $i < $limit; $i++) {
        $seen = $times[$i + 1] ?? 0;
        if ($seen === REMOVED || $seen === REPLACED || $seen < $now - ALIVE_SECONDS) { $slot = $i; break; }
    }
    if ($slot < 0) { flock($lock, LOCK_UN); fail(503, 'This world is full.'); }
    // One person, one body: a second sign-in ends the first, so two games can't overwrite one life.
    if ($account) {
        foreach (readNames($dir) as $other => $known) {
            if (($known['account'] ?? '') === $account['username'] && (int)$other !== $slot) touchAlive($dir, (int)$other, REPLACED);
        }
    }
    touchAlive($dir, $slot, $now);
    $name = cleanName();
    // A guest cannot take a registered player's name.
    if (!$account && readAccount($dir, accountKey($name))) $name = textStart($name, 16) . ' (guest)';
    setPlayer($dir, $slot, $name, intParam('c', 0, 9999), knownModel($dir, (string)($_GET['h'] ?? '')), $account ? (string)$account['username'] : '', $ip);
    flock($lock, LOCK_UN);
    $nonce = bin2hex(random_bytes(8));
    $answer = ['slot' => $slot, 'nonce' => $nonce, 'token' => tokenFor($slot, $nonce, $secret), 'protocol' => PROTOCOL, 'chat' => chatCount($dir), 'world' => worldCount($dir)];
    if (ensureEngine($config, $dir, $settings)) $answer['engine'] = engineAddress();
    respond($answer);
}

if ($action === 'look') {
    $slot = player($secret);
    $dir = dataDir($config);
    $lock = lockPlayers($dir);
    $known = readNames($dir)[$slot] ?? [];
    setPlayer($dir, $slot, cleanName(), intParam('c', 0, 9999), knownModel($dir, (string)($_GET['h'] ?? '')), (string)($known['account'] ?? ''), (string)($known['ip'] ?? ''));
    flock($lock, LOCK_UN);
    respond(['ok' => true]);
}

if ($action === 'who') {
    $names = readNames(dataDir($config));
    $out = [];
    foreach (explode(',', (string)($_GET['ids'] ?? '')) as $id) {
        if (ctype_digit($id) && isset($names[(int)$id])) {
            $entry = $names[(int)$id];
            $out[(int)$id] = ['name' => $entry['name'] ?? '', 'actor' => $entry['actor'] ?? 0, 'model' => $entry['model'] ?? ''];
        }
    }
    respond(['players' => (object)$out]);
}

// ---- Accounts ----

if ($action === 'register') {
    if ($settings['accounts']['mode'] === 'none' || empty($settings['accounts']['registration'])) fail(403, 'New accounts are closed.');
    $dir = dataDir($config);
    $ip = addressKey($secret);
    if (isBanned($dir, $ip)) fail(403, 'You have been banned from this world.');
    if (throttled($dir, 'register.' . $ip, 20)) fail(429, 'Too many new accounts from here. Try again later.');
    $body = jsonBody();
    $username = cleanText((string)($body['username'] ?? ''));
    $password = (string)($body['password'] ?? '');
    $length = textLength($username);
    if ($length < 3 || $length > 20 || !preg_match('/^[\p{L}\p{N}][\p{L}\p{N} _-]*$/u', $username)) fail(422, 'A name needs 3 to 20 letters or numbers.');
    if (filterChat($username, (string)$settings['chat']['blockedWords']) !== $username) fail(422, 'Please choose another name.');
    $minimum = max(4, (int)$settings['accounts']['minPassword']);
    if (strlen($password) < $minimum || strlen($password) > 72) fail(422, "A password needs at least $minimum characters.");
    $key = accountKey($username);
    $lock = lockPlayers($dir);
    if (readAccount($dir, $key)) { flock($lock, LOCK_UN); fail(409, 'That name is taken.'); }
    $account = ['username' => $username, 'password' => password_hash($password, PASSWORD_DEFAULT), 'created' => time(), 'character' => null];
    writeAccount($dir, $key, $account);
    flock($lock, LOCK_UN);
    noteFailure($dir, 'register.' . $ip);       // not a failure, but a cap on accounts per address
    respond(accountView($account, $key, $secret));
}

if ($action === 'login') {
    $dir = dataDir($config);
    $ip = addressKey($secret);
    if (isBanned($dir, $ip)) fail(403, 'You have been banned from this world.');
    $body = jsonBody();
    $username = cleanText((string)($body['username'] ?? ''));
    $key = accountKey($username);
    if (throttled($dir, 'login.' . $key) || throttled($dir, 'login.' . $ip, 40)) fail(429, 'Too many tries. Wait a while and try again.');
    $account = readAccount($dir, $key);
    // Unknown names cost the same as wrong passwords, so a failure says nothing about who has an account.
    $hash = $account ? (string)$account['password'] : '$2y$10$usesomesillystringforsaltuHpHvZk4uY8Z5eM0bO5cVb7yOuJvLZS';
    $right = password_verify((string)($body['password'] ?? ''), $hash);
    if (!$account || !$right) {
        noteFailure($dir, 'login.' . $key);
        noteFailure($dir, 'login.' . $ip);
        fail(401, 'That name and password do not match.');
    }
    if (!empty($account['banned'])) fail(403, 'This account has been banned.');
    clearFailures($dir, 'login.' . $key);
    respond(accountView($account, $key, $secret) + ['progress' => progressOf($dir, $key)]);
}

if ($action === 'me') {
    $dir = dataDir($config);
    $account = sessionAccount((string)(jsonBody()['session'] ?? ''), $secret, $dir);
    if (!$account) fail(401, 'Please sign in again.');
    respond(accountView($account, (string)$account['key'], $secret) + ['progress' => progressOf($dir, (string)$account['key'])]);
}

// ---- Sleeping and waking ----

if ($action === 'save') {
    // A pass on the first line, then the game's own compressed save.
    $dir = dataDir($config);
    if (empty($settings['accounts']['persist'])) fail(403, 'This game keeps progress on each device.');
    $raw = (string)file_get_contents('php://input');
    $break = strpos($raw, "\n");
    $account = $break ? sessionAccount(substr($raw, 0, $break), $secret, $dir) : null;
    if (!$account) fail(401, 'Please sign in again.');
    if (strlen($raw) - $break - 1 < 2 || strlen($raw) > (int)($config['maxSaveBytes'] ?? 6291456)) fail(413, 'That save is too large.');
    $file = $dir . '/accounts/' . $account['key'] . '.save';
    $temporary = $file . '.' . getmypid() . '.tmp';
    if (file_put_contents($temporary, substr($raw, $break + 1)) === false) fail(500, 'Could not keep the save.');
    if (is_file($file)) @rename($file, $file . '.bak');     // one step back, in case a save goes wrong
    rename($temporary, $file);
    respond(['at' => time()]);
}

if ($action === 'load') {
    $dir = dataDir($config);
    $account = sessionAccount((string)(jsonBody()['session'] ?? ''), $secret, $dir);
    if (!$account) fail(401, 'Please sign in again.');
    $file = $dir . '/accounts/' . $account['key'] . '.save';
    if (!is_file($file)) fail(404, 'There is nothing to wake up to.');
    header('Content-Type: text/plain');
    readfile($file);
    exit;
}

if ($action === 'wake') {
    // A small note, often: where this player is, so closing the game loses next to nothing.
    $dir = dataDir($config);
    $body = jsonBody();
    $account = sessionAccount((string)($body['session'] ?? ''), $secret, $dir);
    if (!$account) fail(401, 'Please sign in again.');
    $number = function (string $name, int $high) use ($body): int { return max(0, min($high, (int)($body[$name] ?? 0))); };
    $character = $account['character'] ?? [];
    noteWake($dir, (string)$account['key'], ['map' => max(1, $number('map', 9999)), 'x' => $number('x', 9999), 'y' => $number('y', 9999), 'd' => $number('d', 9), 'slot' => $number('slot', SLOTS - 1)],
        ['name' => (string)($character['name'] ?? $account['username']), 'actor' => (int)($character['actorId'] ?? 0), 'model' => (string)($character['id'] ?? ''), 'account' => (string)$account['username']]);
    respond(['ok' => true]);
}

if ($action === 'sleepers') {
    // The players asleep on this map: everyone who noted a place here and isn't awake now.
    $dir = dataDir($config);
    if (empty($settings['accounts']['sleepers'])) respond(['sleepers' => []]);
    // Awake means an account has a live slot right now, whichever slot or device that is.
    $alive = (string)@file_get_contents($dir . '/alive.bin');
    $awake = [];
    foreach (readNames($dir) as $slot => $known) {
        if (empty($known['account']) || strlen($alive) < ((int)$slot + 1) * 4) continue;
        $seen = (int)unpack('V', substr($alive, (int)$slot * 4, 4))[1];
        if ($seen > time() - ALIVE_SECONDS && $seen < REPLACED) $awake[$known['account']] = true;
    }
    $oldest = time() - 86400 * max(1, (int)$settings['accounts']['sleeperDays']);
    $out = [];
    foreach (array_slice(glob($dir . '/sleep/m' . intParam('m', 1, 9999) . '/*.json') ?: [], 0, 200) as $file) {
        $entry = @json_decode((string)@file_get_contents($file), true);
        if (!is_array($entry) || (int)($entry['at'] ?? 0) < $oldest || isset($awake[$entry['account'] ?? ''])) continue;
        unset($entry['slot'], $entry['account']);
        $out[] = $entry;
        if (count($out) >= 64) break;
    }
    respond(['sleepers' => $out]);
}

if ($action === 'profile') {
    // An account remembers its character, so it follows the player to any device.
    $dir = dataDir($config);
    $body = jsonBody();
    $account = sessionAccount((string)($body['session'] ?? ''), $secret, $dir);
    if (!$account) fail(401, 'Please sign in again.');
    $key = (string)$account['key'];
    unset($account['key']);
    $character = is_array($body['character'] ?? null) ? $body['character'] : [];
    $account['character'] = ['actorId' => max(0, min(9999, (int)($character['actorId'] ?? 0))),
        'id' => knownModel($dir, (string)($character['id'] ?? '')), 'name' => textStart(cleanText((string)($character['name'] ?? '')), 24)];
    writeAccount($dir, $key, $account);
    respond(['ok' => true]);
}

// ---- The world lane ----

if ($action === 'world') {
    $dir = dataDir($config);
    respond(readWorld($dir) + ['count' => worldCount($dir)]);
}

if ($action === 'set') {
    // Changes a player's game made to what the project shares. The last one in stands.
    $slot = player($secret);
    $dir = dataDir($config);
    $world = is_array($settings['world'] ?? null) ? $settings['world'] : [];
    $switches = idList((string)($world['switches'] ?? ''));
    $variables = idList((string)($world['variables'] ?? ''));
    $changes = jsonBody()['changes'] ?? [];
    if (!is_array($changes) || count($changes) > 64) fail(422, 'Too many changes at once.');
    // While the Engine runs it is the world's only writer, so changes keep one order.
    if (!empty($settings['engine']['enabled'])) {
        $answered = askEngine($config, '/set', (string)json_encode(['changes' => $changes]));
        if ($answered !== '') { echo $answered; exit; }
    }
    $lock = fopen($dir . '/world.lock', 'c');
    if (!$lock || !flock($lock, LOCK_EX)) fail(500, 'Could not reach the world.');
    $state = @json_decode((string)@file_get_contents($dir . '/world.json'), true);
    $state = is_array($state) ? $state : [];
    foreach ($changes as $change) {
        $kind = (string)($change['kind'] ?? '');
        $id = (string)($change['id'] ?? '');
        $value = $change['value'] ?? null;
        if ($kind === 's' && isset($switches[(int)$id])) $state['s'][(int)$id] = (bool)$value;
        elseif ($kind === 'v' && isset($variables[(int)$id]) && is_numeric($change['delta'] ?? null)) {
            // "Add 1" stays "add 1": two players adding at once both count.
            $base = $state['v'][(int)$id] ?? 0;
            $state['v'][(int)$id] = (is_numeric($base) ? $base : 0) + $change['delta'];
        }
        elseif ($kind === 'v' && isset($variables[(int)$id]) && (is_int($value) || is_float($value) || is_bool($value) || (is_string($value) && strlen($value) <= 256))) $state['v'][(int)$id] = $value;
        elseif ($kind === 'e' && preg_match('/^\d{1,4},\d{1,6},[A-Da-d]$/', $id) && count($state['e'] ?? []) < 5000) $state['e'][$id] = (bool)$value;
    }
    $temporary = $dir . '/world.' . getmypid() . '.tmp';
    file_put_contents($temporary, json_encode($state));
    rename($temporary, $dir . '/world.json');
    $count = worldCount($dir) + 1;
    $temporary = $dir . '/worldseq.' . getmypid() . '.tmp';
    file_put_contents($temporary, pack('V', $count));
    rename($temporary, $dir . '/worldseq.bin');
    flock($lock, LOCK_UN);
    respond(['count' => $count]);
}

// ---- Voice ----

if ($action === 'voice') {
    if (empty($settings['voice']['enabled'])) fail(403, 'Voice is off in this game.');
    $slot = player($secret);
    $dir = dataDir($config);
    if (aliveAt($dir, $slot) >= REPLACED) fail(403, 'You are no longer in this world.');
    $known = readNames($dir)[$slot] ?? [];
    if ($settings['voice']['who'] === 'accounts' && empty($known['account'])) fail(403, 'Sign in to use voice.');
    $body = jsonBody();
    $on = !empty($body['on']);
    $listening = voicePresence($dir, $slot, $on);
    if (!$on) respond(['on' => [], 'inbox' => []]);
    // Only to someone who has voice on: nobody is sent a call they didn't ask for.
    foreach (array_slice(is_array($body['out'] ?? null) ? $body['out'] : [], 0, 8) as $message) {
        $to = (int)($message['to'] ?? -1);
        $data = $message['data'] ?? null;
        $type = is_array($data) ? ($data['type'] ?? '') : '';
        if (!in_array($to, $listening, true) || !in_array($type, ['offer', 'answer'], true)) continue;
        if (strlen((string)json_encode($data)) > VOICE_MESSAGE) continue;
        voiceDeliver($dir, $to, $slot, ['type' => $type, 'sdp' => (string)($data['sdp'] ?? '')]);
    }
    respond(['on' => $listening, 'inbox' => voiceCollect($dir, $slot)]);
}

// ---- Chat ----

if ($action === 'say') {
    if (empty($settings['chat']['enabled'])) fail(403, 'Chat is off in this game.');
    $slot = player($secret);
    $dir = dataDir($config);
    $known = readNames($dir)[$slot] ?? null;
    if (!$known) fail(401, 'Unknown player.');
    if (isBanned($dir, (string)($known['ip'] ?? ''))) fail(403, 'You have been banned from this world.');
    if ($settings['chat']['who'] === 'accounts' && empty($known['account'])) fail(403, 'Sign in to chat.');
    $body = jsonBody();
    $text = textStart(cleanText((string)($body['text'] ?? '')), max(1, (int)$settings['chat']['maxLength']));
    if ($text === '') fail(422, 'There is nothing to say.');
    $map = intParam('m', 1, 9999);
    $world = !empty($body['world']) && !empty($settings['chat']['world']);
    // Each slot's last message time, in one small file.
    $times = fopen($dir . '/chattime.bin', 'c+b');
    fseek($times, $slot * 4);
    $bytes = (string)fread($times, 4);
    $last = strlen($bytes) === 4 ? (int)unpack('V', $bytes)[1] : 0;
    if ($last > time() - max(0, (int)$settings['chat']['cooldown'])) { fclose($times); fail(429, 'Slow down a moment.'); }
    fseek($times, $slot * 4);
    fwrite($times, pack('V', time()));
    fclose($times);
    $message = ['t' => time(), 'name' => (string)($known['name'] ?? ''), 'slot' => $slot, 'text' => filterChat($text, (string)$settings['chat']['blockedWords']), 'world' => $world];
    if (!$world) $message['map'] = $map;
    respond(postChat($dir, $world ? 'w' : 'm' . $map, $message, max(10, min(500, (int)$settings['chat']['history']))));
}

if ($action === 'chat') {
    // Only asked for when a sync says there is something new.
    $dir = dataDir($config);
    $after = max(0, (int)($_GET['after'] ?? 0));
    $messages = array_merge(readChat($dir, 'w'), readChat($dir, 'm' . intParam('m', 1, 9999)));
    usort($messages, function (array $a, array $b): int { return $a['id'] <=> $b['id']; });
    $fresh = array_values(array_filter($messages, function (array $message) use ($after): bool { return $message['id'] > $after; }));
    $gone = @json_decode((string)@file_get_contents($dir . '/chatgone.json'), true);
    respond(['messages' => array_slice($fresh, -50), 'gone' => is_array($gone) ? array_slice($gone, -50) : [], 'count' => chatCount($dir)]);
}

// ---- Characters ----

if ($action === 'upload') {
    // A package arrives in pieces, so a host's upload limit never matters.
    $slot = player($secret);
    $dir = dataDir($config);
    $id = (string)($_GET['id'] ?? '');
    if (!preg_match('/^[a-f0-9]{32}$/', $id)) fail(400, 'Unknown upload.');
    $models = $dir . '/models';
    if (!is_dir($models)) @mkdir($models, 0770, true);
    $part = $models . '/up-' . $id;
    $index = intParam('i', 0, 4096);
    $count = intParam('n', 1, 4096);
    $limit = (int)($config['maxModelBytes'] ?? 33554432);
    $piece = (string)file_get_contents('php://input');
    if ($piece === '' || strlen($piece) > 4194304) fail(413, 'That piece is the wrong size.');
    if ($index === 0) @unlink($part);
    clearstatcache();
    $held = is_file($part) ? (int)filesize($part) : 0;
    if (($index > 0 && $held === 0) || $held + strlen($piece) > $limit) { @unlink($part); fail(413, 'That character is too large.'); }
    file_put_contents($part, $piece, FILE_APPEND);
    touchAlive($dir, $slot, time());
    if ($index < $count - 1) respond(['received' => $index]);
    register_shutdown_function(function () use ($part) { @unlink($part); });
    $rules = json_decode((string)($config['rules'] ?? '{}'), true);
    checkPackage($part, is_array($rules) ? $rules : []);
    foreach (glob($models . '/up-*') ?: [] as $old) { if (filemtime($old) < time() - 3600) @unlink($old); }
    $used = 0;
    foreach (glob($models . '/*.rrch') ?: [] as $kept) $used += (int)filesize($kept);
    if ($used + filesize($part) > (int)($config['maxStorageBytes'] ?? 2147483648)) fail(507, 'This server has no room for more characters.');
    $hash = hash_file('sha256', $part);
    $target = $models . '/' . $hash . '.rrch';
    if (!is_file($target)) {
        // Kept squeezed too: everyone who meets this player downloads it once.
        @file_put_contents($target . '.gz', gzencode((string)file_get_contents($part), 6));
        rename($part, $target);
    }
    respond(['hash' => $hash]);
}

if ($action === 'model') {
    $dir = dataDir($config);
    $hash = knownModel($dir, (string)($_GET['h'] ?? ''));
    if ($hash === '') fail(404, 'Unknown character.');
    $file = $dir . '/models/' . $hash . '.rrch';
    // A model's name is its contents, so it can be kept for good.
    header_remove('Cache-Control');
    header('Cache-Control: public, max-age=31536000, immutable');
    header('Content-Type: application/octet-stream');
    header('Vary: Accept-Encoding');
    if (is_file($file . '.gz') && strpos((string)($_SERVER['HTTP_ACCEPT_ENCODING'] ?? ''), 'gzip') !== false) {
        header('Content-Encoding: gzip');
        $file .= '.gz';
    }
    header('Content-Length: ' . filesize($file));
    readfile($file);
    exit;
}

if ($action === 'leave') {
    $slot = player($secret);
    $dir = dataDir($config);
    clearRecord($dir, intParam('m', 1, 9999), $slot);
    touchAlive($dir, $slot, 0);
    respond(['left' => true]);
}

if ($action === 'info') {
    respond(['engine' => 'RPG Reactor', 'mode' => 'lite', 'protocol' => PROTOCOL, 'project' => (string)($config['title'] ?? ''), 'runtime' => (string)($config['runtime'] ?? '')]);
}

fail(400, 'Unknown request.');
