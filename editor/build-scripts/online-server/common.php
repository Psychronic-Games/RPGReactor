<?php
// RPG Reactor online server: what api.php (players) and admin.php (the game's owner) share.
// Nothing here runs on its own: asked for directly, it prints nothing.
declare(strict_types=1);

const PROTOCOL = 6;
const VOICE_SECONDS = 6;        // voice.bin: someone who hasn't asked for this long has gone
const VOICE_MAILBOX = 16;
const VOICE_MESSAGE = 16384;    // a connection offer, with every address it can be reached at
const SLOTS = 1024;
const RECORD = 12;
const ALIVE_SECONDS = 15;
const REMOVED = 0xffffffff;     // alive.bin: this slot's player was removed by the owner
const REPLACED = 0xfffffffe;    // alive.bin: this slot's account signed in somewhere else

function fail(int $status, string $message): void {
    http_response_code($status);
    header('Content-Type: text/plain; charset=utf-8');
    echo $message;
    exit;
}

function respond(array $value): void {
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($value);
    exit;
}

/** This server's config; one without a real secret refuses to run rather than accept anyone's token. */
function loadConfig(): array {
    $config = is_file(__DIR__ . '/config.php') ? include __DIR__ . '/config.php' : null;
    if (!is_array($config) || strlen((string)($config['secret'] ?? '')) < 32) fail(503, 'This server is not configured. Deploy it again from the editor.');
    return $config;
}

/** The project's Database › Online settings, as the server must enforce them. */
function settingsOf(array $config): array {
    $settings = json_decode((string)($config['settings'] ?? '{}'), true);
    $settings = is_array($settings) ? $settings : [];
    $settings['accounts'] = array_merge(['mode' => 'none', 'registration' => true, 'minPassword' => 8, 'persist' => true, 'sleepers' => true, 'sleeperDays' => 30], is_array($settings['accounts'] ?? null) ? $settings['accounts'] : []);
    $settings['chat'] = array_merge(['enabled' => true, 'who' => 'all', 'world' => true, 'cooldown' => 2, 'maxLength' => 200, 'history' => 50, 'blockedWords' => ''], is_array($settings['chat'] ?? null) ? $settings['chat'] : []);
    $settings['voice'] = array_merge(['enabled' => false, 'who' => 'all'], is_array($settings['voice'] ?? null) ? $settings['voice'] : []);
    $settings['engine'] = array_merge(['enabled' => true, 'rate' => 15, 'movement' => 'speed', 'maxSpeed' => 16], is_array($settings['engine'] ?? null) ? $settings['engine'] : []);
    return $settings;
}

function textLength(string $text): int {
    return function_exists('mb_strlen') ? mb_strlen($text, 'UTF-8') : strlen($text);
}

function textStart(string $text, int $length): string {
    return function_exists('mb_substr') ? mb_substr($text, 0, $length, 'UTF-8') : substr($text, 0, $length);
}

function textFold(string $text): string {
    return function_exists('mb_strtolower') ? mb_strtolower($text, 'UTF-8') : strtolower($text);
}

/** A JSON body. Passwords and sessions travel here, never in a URL, which servers write to their logs. */
function jsonBody(): array {
    $body = json_decode((string)file_get_contents('php://input', false, null, 0, 65536), true);
    return is_array($body) ? $body : [];
}

/** Where this server keeps its files: above the web root when it can, else a folder nobody can guess. */
function dataDir(array $config): string {
    $project = preg_replace('/[^a-zA-Z0-9_-]/', '', (string)($config['project'] ?? '')) ?: 'game';
    $candidates = [];
    $documentRoot = rtrim((string)($_SERVER['DOCUMENT_ROOT'] ?? ''), '/');
    if ($documentRoot !== '') $candidates[] = dirname($documentRoot) . '/reactor-online-data/' . $project;
    $candidates[] = __DIR__ . '/data-' . substr(hash('sha256', $config['secret'] . 'data'), 0, 24);
    foreach ($candidates as $dir) {
        if (is_dir($dir) && is_writable($dir)) return $dir;
        if (!is_dir($dir) && @mkdir($dir, 0770, true)) {
            @file_put_contents($dir . '/.htaccess', "<IfModule mod_authz_core.c>\nRequire all denied\n</IfModule>\n<IfModule !mod_authz_core.c>\nDeny from all\n</IfModule>\n");
            @file_put_contents($dir . '/index.html', '');
            return $dir;
        }
    }
    fail(500, 'This server has no writable data folder.');
}

function tokenFor(int $slot, string $nonce, string $secret): string {
    return substr(hash_hmac('sha256', $slot . '.' . $nonce, $secret), 0, 24);
}

function intParam(string $name, int $low, int $high): int {
    return max($low, min($high, (int)($_GET[$name] ?? 0)));
}

/** The player a request speaks for, or a refusal. */
function player(string $secret): int {
    $slot = intParam('s', 0, SLOTS - 1);
    $nonce = (string)($_GET['g'] ?? '');
    if ($nonce === '' || !hash_equals(tokenFor($slot, $nonce, $secret), (string)($_GET['t'] ?? ''))) fail(401, 'Unknown player.');
    return $slot;
}

function clearRecord(string $dir, int $map, int $slot): void {
    $file = @fopen($dir . '/p2m' . $map . '.bin', 'r+b');
    if (!$file) return;
    fseek($file, $slot * RECORD);
    fwrite($file, str_repeat("\0", RECORD));
    fclose($file);
}

/** The time this slot was last heard from. */
function aliveAt(string $dir, int $slot): int {
    $file = @fopen($dir . '/alive.bin', 'rb');
    if (!$file) return 0;
    fseek($file, $slot * 4);
    $bytes = (string)fread($file, 4);
    fclose($file);
    return strlen($bytes) === 4 ? (int)unpack('V', $bytes)[1] : 0;
}

function touchAlive(string $dir, int $slot, int $time): void {
    $file = fopen($dir . '/alive.bin', 'c+b');
    if (!$file) return;
    fseek($file, $slot * 4);
    fwrite($file, pack('V', $time));
    fclose($file);
}

function readNames(string $dir): array {
    $names = @json_decode((string)@file_get_contents($dir . '/names.json'), true);
    return is_array($names) ? $names : [];
}

/** Names and looks live in one file, written whole, one writer at a time. The caller may hold $lock. */
function setPlayer(string $dir, int $slot, string $name, int $actor, string $model, string $account, string $ip): void {
    $names = readNames($dir);
    $names[$slot] = ['name' => $name !== '' ? $name : 'Player ' . ($slot + 1), 'actor' => $actor, 'model' => $model, 'account' => $account, 'ip' => $ip];
    $temporary = $dir . '/names.' . getmypid() . '.tmp';
    if (file_put_contents($temporary, json_encode($names)) !== false) rename($temporary, $dir . '/names.json');
}

function lockPlayers(string $dir) {
    $lock = fopen($dir . '/slots.lock', 'c');
    if (!$lock || !flock($lock, LOCK_EX)) fail(500, 'Could not reach the player list.');
    return $lock;
}

/** One line of plain text: no control characters, and only valid UTF-8 survives. */
function cleanText(string $text): string {
    return trim((string)preg_replace('/[\x00-\x1f\x7f]/u', '', $text));
}

function cleanName(): string {
    return textStart(cleanText((string)($_GET['n'] ?? '')), 24);
}

/** A model this server holds, or nothing. */
function knownModel(string $dir, string $hash): string {
    return preg_match('/^[a-f0-9]{64}$/', $hash) && is_file($dir . '/models/' . $hash . '.rrch') ? $hash : '';
}

function speciesRule(array $rules): array {
    $species = $rules['species'] ?? 'human';
    return is_array($species) ? $species : [$species];
}

/**
 * A character package: the header, its JSON, the rig, then a GLB. A client can still
 * send any model, so this holds what it can to the project's rules and refuses
 * anything that is not a self-contained GLB.
 */
function checkPackage(string $file, array $rules): void {
    $size = (int)filesize($file);
    $in = fopen($file, 'rb');
    $head = (string)fread($in, 16);
    if (strlen($head) < 16 || substr($head, 0, 4) !== 'RRCH') fail(422, 'That is not a character.');
    $fields = unpack('Vmagic/Vversion/Vjson/Vrig', $head);
    $glbAt = 16 + $fields['json'] + $fields['rig'];
    if ($fields['version'] !== 1 || $glbAt + 20 > $size) fail(422, 'That character is damaged.');
    $info = json_decode((string)fread($in, $fields['json']), true);
    if (!is_array($info)) fail(422, 'That character is damaged.');
    $recipe = is_array($info['recipe'] ?? null) ? $info['recipe'] : [];
    $species = speciesRule($rules);
    if (!in_array('all', $species, true) && !in_array((string)($recipe['species'] ?? 'human'), $species, true)) fail(422, 'This game does not allow that species.');
    if (empty($rules['anatomy']) && !empty($recipe['anatomy']['detail'])) fail(422, 'This game does not allow that setting.');
    if ((float)($recipe['age'] ?? 25) < 18) fail(422, 'Characters must be adults.');
    if (empty($rules['anatomy']) && empty($recipe['outfit']) && ($recipe['species'] ?? '') !== 'slimefolk') fail(422, 'This game needs characters to be dressed.');
    fseek($in, $glbAt);
    $glb = unpack('Vmagic/Vversion/Vlength/Vchunk/Vtype', (string)fread($in, 20));
    if ($glb['magic'] !== 0x46546C67 || $glb['version'] !== 2 || $glb['type'] !== 0x4E4F534A
        || $glbAt + $glb['length'] !== $size || $glb['chunk'] < 2 || $glb['chunk'] > $size) fail(422, 'That model is not valid.');
    $json = json_decode((string)fread($in, $glb['chunk']), true);
    fclose($in);
    if (!is_array($json)) fail(422, 'That model is not valid.');
    foreach (array_merge($json['images'] ?? [], $json['buffers'] ?? []) as $entry) {
        if (isset($entry['uri'])) fail(422, 'A model must carry its own pictures.');
    }
}


// ---- Who someone is ----

/** A person's address, kept only as a keyed hash, so bans work without storing it. */
function addressKey(string $secret): string {
    return substr(hash_hmac('sha256', 'ip.' . (string)($_SERVER['REMOTE_ADDR'] ?? ''), $secret), 0, 24);
}

function accountKey(string $username): string {
    return hash('sha256', textFold($username));
}

function accountFile(string $dir, string $key): string {
    return $dir . '/accounts/' . $key . '.json';
}

function readAccount(string $dir, string $key): ?array {
    if (!preg_match('/^[a-f0-9]{64}$/', $key)) return null;
    $account = @json_decode((string)@file_get_contents(accountFile($dir, $key)), true);
    return is_array($account) ? $account : null;
}

function writeAccount(string $dir, string $key, array $account): void {
    if (!is_dir($dir . '/accounts')) @mkdir($dir . '/accounts', 0770, true);
    $temporary = accountFile($dir, $key) . '.' . getmypid() . '.tmp';
    if (file_put_contents($temporary, json_encode($account)) === false) fail(500, 'Could not save the account.');
    rename($temporary, accountFile($dir, $key));
}

/** A signed pass good for thirty days, so "stay signed in" needs no session store. */
function sessionFor(string $key, string $secret): string {
    $body = $key . '.' . (time() + 2592000);
    return $body . '.' . substr(hash_hmac('sha256', 'session.' . $body, $secret), 0, 32);
}

/** The account a pass belongs to. A ban, or a changed password, ends it. */
function sessionAccount(string $token, string $secret, string $dir): ?array {
    $parts = explode('.', $token);
    if (count($parts) !== 3 || (int)$parts[1] < time()) return null;
    if (!hash_equals(substr(hash_hmac('sha256', 'session.' . $parts[0] . '.' . $parts[1], $secret), 0, 32), $parts[2])) return null;
    $account = readAccount($dir, $parts[0]);
    if (!$account || !empty($account['banned'])) return null;
    $issued = (int)$parts[1] - 2592000;
    if (($account['passwordChanged'] ?? 0) > $issued) return null;
    return $account + ['key' => $parts[0]];
}

/** The public face of an account. Its password hash goes nowhere. */
function accountView(array $account, string $key, string $secret): array {
    return ['name' => (string)$account['username'], 'id' => substr($key, 0, 16), 'session' => sessionFor($key, $secret), 'character' => $account['character'] ?? null];
}

/** Where an account's progress is, for the first thing a sign-in needs to know: is there a life to wake up to? */
function progressOf(string $dir, string $key): ?array {
    $file = $dir . '/accounts/' . $key . '.save';
    if (!is_file($file)) return null;
    $wake = @json_decode((string)@file_get_contents($dir . '/accounts/' . $key . '.wake'), true);
    return ['at' => (int)filemtime($file), 'wake' => is_array($wake) ? $wake : null];
}

function sleepFile(string $dir, int $map, string $key): string {
    return $dir . '/sleep/m' . $map . '/' . $key . '.json';
}

/** Where a player stopped: the note read when they wake, and the sleeper others see meanwhile. */
function noteWake(string $dir, string $key, array $note, array $look): void {
    $file = $dir . '/accounts/' . $key . '.wake';
    $before = @json_decode((string)@file_get_contents($file), true);
    if (is_array($before) && (int)($before['map'] ?? 0) !== $note['map']) @unlink(sleepFile($dir, (int)($before['map'] ?? 0), $key));
    file_put_contents($file, json_encode($note));
    $sleeper = sleepFile($dir, $note['map'], $key);
    if (!is_dir(dirname($sleeper))) @mkdir(dirname($sleeper), 0770, true);
    file_put_contents($sleeper, json_encode($note + $look + ['id' => substr($key, 0, 16), 'at' => time()]));
}

function forgetAccount(string $dir, string $key): void {
    $wake = @json_decode((string)@file_get_contents($dir . '/accounts/' . $key . '.wake'), true);
    if (is_array($wake)) @unlink(sleepFile($dir, (int)($wake['map'] ?? 0), $key));
    foreach (['.json', '.save', '.save.bak', '.wake'] as $end) @unlink($dir . '/accounts/' . $key . $end);
}

/** Repeated failures wait fifteen minutes. An address gets a higher limit: a school or household shares one. */
function throttled(string $dir, string $key, int $limit = 8): bool {
    $file = $dir . '/throttle/' . hash('sha256', $key);
    $state = @json_decode((string)@file_get_contents($file), true);
    return is_array($state) && ($state['count'] ?? 0) >= $limit && ($state['since'] ?? 0) > time() - 900;
}

function noteFailure(string $dir, string $key): void {
    if (!is_dir($dir . '/throttle')) @mkdir($dir . '/throttle', 0770, true);
    $file = $dir . '/throttle/' . hash('sha256', $key);
    $state = @json_decode((string)@file_get_contents($file), true);
    $fresh = is_array($state) && ($state['since'] ?? 0) > time() - 900;
    file_put_contents($file, json_encode(['count' => ($fresh ? $state['count'] : 0) + 1, 'since' => $fresh ? $state['since'] : time()]));
}

function clearFailures(string $dir, string $key): void {
    @unlink($dir . '/throttle/' . hash('sha256', $key));
}

function readBans(string $dir): array {
    $bans = @json_decode((string)@file_get_contents($dir . '/bans.json'), true);
    return is_array($bans) ? $bans : [];
}

function isBanned(string $dir, string $ip): bool {
    return isset(readBans($dir)[$ip]);
}

// ---- The world lane ----

/** "1-5, 9" as the set of ids the project shares. */
function idList(string $text): array {
    $ids = [];
    foreach (preg_split('/[\s,]+/', $text) ?: [] as $part) {
        if (preg_match('/^(\d+)-(\d+)$/', $part, $range)) {
            for ($id = (int)$range[1]; $id <= min((int)$range[2], (int)$range[1] + 5000); $id++) $ids[$id] = true;
        } elseif (ctype_digit($part)) $ids[(int)$part] = true;
    }
    return $ids;
}

// ---- Voice: the server only introduces players, and the sound goes between them ----

/** Who has voice on, by when each last asked. A slot's stamp is four bytes in one file, like alive.bin. */
function voicePresence(string $dir, int $slot, bool $on): array {
    $file = fopen($dir . '/voice.bin', 'c+b');
    if (!$file || !flock($file, LOCK_EX)) return [];
    $now = time();
    fseek($file, $slot * 4);
    fwrite($file, pack('V', $on ? $now : 0));
    rewind($file);
    $bytes = (string)stream_get_contents($file);
    flock($file, LOCK_UN);
    fclose($file);
    $bytes = substr($bytes, 0, strlen($bytes) - strlen($bytes) % 4);
    $out = [];
    if ($bytes !== '') foreach (unpack('V*', $bytes) as $index => $time) if ($time >= $now - VOICE_SECONDS && $index - 1 !== $slot) $out[] = $index - 1;
    return $out;
}

/** Leaves a message in a player's mailbox. A full one refuses more, so nobody can bury a player. */
function voiceDeliver(string $dir, int $to, int $from, array $data): void {
    $file = fopen($dir . '/voice-' . $to . '.json', 'c+b');
    if (!$file || !flock($file, LOCK_EX)) return;
    $messages = json_decode((string)stream_get_contents($file), true);
    $messages = is_array($messages) ? $messages : [];
    if (count($messages) < VOICE_MAILBOX) {
        $messages[] = ['from' => $from, 'data' => $data, 't' => time()];
        ftruncate($file, 0);
        rewind($file);
        fwrite($file, (string)json_encode($messages));
    }
    flock($file, LOCK_UN);
    fclose($file);
}

/** Empties a player's mailbox, leaving out anything too old to answer. */
function voiceCollect(string $dir, int $slot): array {
    $path = $dir . '/voice-' . $slot . '.json';
    if (!is_file($path)) return [];
    $file = fopen($path, 'r+b');
    if (!$file || !flock($file, LOCK_EX)) return [];
    $messages = json_decode((string)stream_get_contents($file), true);
    ftruncate($file, 0);
    flock($file, LOCK_UN);
    fclose($file);
    $oldest = time() - VOICE_SECONDS * 3;
    $fresh = [];
    foreach (is_array($messages) ? $messages : [] as $message) {
        if (($message['t'] ?? 0) >= $oldest) $fresh[] = ['from' => $message['from'], 'data' => $message['data']];
    }
    return $fresh;
}

// ---- The Engine: the real-time half, when this server can run it ----

function findNode(): string {
    if (!function_exists('shell_exec')) return '';
    foreach (['/usr/bin/node', '/usr/local/bin/node', '/usr/bin/nodejs', '/opt/homebrew/bin/node'] as $path) {
        if (@is_executable($path)) return $path;
    }
    return trim((string)@shell_exec('command -v node 2>/dev/null'));
}

/** Asks the running Engine something; empty if it isn't there. */
function askEngine(array $config, string $path, string $body = ''): string {
    $context = stream_context_create(['http' => ['method' => $body === '' ? 'GET' : 'POST', 'timeout' => 0.5, 'ignore_errors' => true,
        'header' => 'X-Reactor-Secret: ' . $config['secret'] . "\r\nContent-Type: application/json\r\n", 'content' => $body]]);
    return (string)@file_get_contents('http://127.0.0.1:' . (int)$config['enginePort'] . $path, false, $context);
}

/** Changes whenever a build does, so a rebuild reaches a running Engine. */
function engineStamp(): string {
    return md5((string)@filemtime(__DIR__ . '/config.php') . '.' . (string)@filemtime(__DIR__ . '/engine.cjs'));
}

function launchEngine(array $config, string $dir, array $settings, string $node, string $stamp): bool {
    $file = $dir . '/engine.json';
    file_put_contents($file, json_encode(['secret' => $config['secret'], 'port' => (int)$config['enginePort'], 'settings' => $settings, 'folder' => __DIR__, 'stamp' => $stamp]));
    @chmod($file, 0600);
    @shell_exec('cd ' . escapeshellarg($dir) . ' && setsid nohup ' . escapeshellarg($node) . ' ' . escapeshellarg(__DIR__ . '/engine.cjs') . ' ' . escapeshellarg($dir) . ' >> ' . escapeshellarg($dir . '/engine.log') . ' 2>&1 &');
    for ($try = 0; $try < 15; $try++) {
        usleep(100000);
        if (askEngine($config, '/health') !== '') return true;
    }
    return false;
}

/** Starts the Engine as this site's own user if it isn't running. True once it answers. */
function ensureEngine(array $config, string $dir, array $settings): bool {
    if (empty($settings['engine']['enabled']) || empty($config['enginePort'])) return false;
    $stamp = engineStamp();
    $health = @json_decode(askEngine($config, '/health'), true);
    if (is_array($health) && ($health['stamp'] ?? '') === $stamp) return true;
    // It couldn't be reached or started last time: not again until a build changes something.
    $unreached = $dir . '/engine.unreached';
    if (is_file($unreached) && filemtime($unreached) >= (int)@filemtime(__DIR__ . '/config.php')) return false;
    $node = findNode();
    if ($node === '') return false;
    $lock = fopen($dir . '/engine.lock', 'c');
    if (!$lock || !flock($lock, LOCK_EX)) return false;
    // Another request may have done this while we waited.
    $health = @json_decode(askEngine($config, '/health'), true);
    $started = is_array($health) && ($health['stamp'] ?? '') === $stamp;
    if (!$started) {
        if (is_array($health)) {
            askEngine($config, '/stop', '{}');
            for ($try = 0; $try < 10 && askEngine($config, '/health') !== ''; $try++) usleep(50000);
        }
        @unlink($unreached);
        $started = launchEngine($config, $dir, $settings, $node, $stamp);
        if (!$started) @touch($unreached);
    }
    flock($lock, LOCK_UN);
    return $started;
}

/** Where a game can reach the Engine: through this site, so nobody opens a port. */
function engineAddress(): string {
    $host = preg_replace('/[^a-zA-Z0-9.:-]/', '', (string)($_SERVER['HTTP_HOST'] ?? ''));
    $secure = !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off';
    return ($secure ? 'wss://' : 'ws://') . $host . rtrim(dirname((string)($_SERVER['SCRIPT_NAME'] ?? '/reactor-online/api.php')), '/') . '/ws';
}

function worldCount(string $dir): int {
    $file = @fopen($dir . '/worldseq.bin', 'rb');
    if (!$file) return 0;
    $bytes = (string)fread($file, 4);
    fclose($file);
    return strlen($bytes) === 4 ? (int)unpack('V', $bytes)[1] : 0;
}

function readWorld(string $dir): array {
    $world = @json_decode((string)@file_get_contents($dir . '/world.json'), true);
    $world = is_array($world) ? $world : [];
    return ['s' => (object)($world['s'] ?? []), 'v' => (object)($world['v'] ?? []), 'e' => (object)($world['e'] ?? [])];
}

// ---- Chat ----

function chatFile(string $dir, string $channel): string {
    return $dir . '/chat-' . $channel . '.json';
}

function readChat(string $dir, string $channel): array {
    $list = @json_decode((string)@file_get_contents(chatFile($dir, $channel)), true);
    return is_array($list) ? $list : [];
}

/** How many messages this world has ever seen. Every sync carries it, so nobody polls for chat. */
function chatCount(string $dir): int {
    $file = @fopen($dir . '/chatseq.bin', 'rb');
    if (!$file) return 0;
    $bytes = (string)fread($file, 4);
    fclose($file);
    return strlen($bytes) === 4 ? (int)unpack('V', $bytes)[1] : 0;
}

function setChatCount(string $dir, int $count): void {
    $temporary = $dir . '/chatseq.' . getmypid() . '.tmp';
    file_put_contents($temporary, pack('V', $count));
    rename($temporary, $dir . '/chatseq.bin');
}

function lockChat(string $dir) {
    $lock = fopen($dir . '/chat.lock', 'c');
    if (!$lock || !flock($lock, LOCK_EX)) fail(500, 'Could not reach the chat.');
    return $lock;
}

/** The project's blocked words become stars, whole words only, in any case. */
function filterChat(string $text, string $blocked): string {
    foreach (preg_split('/[\s,]+/u', $blocked) ?: [] as $word) {
        if ($word === '') continue;
        $text = (string)preg_replace_callback('/(?<![\p{L}\p{N}])' . preg_quote($word, '/') . '(?![\p{L}\p{N}])/iu', function (array $match): string {
            return str_repeat('*', max(1, textLength($match[0])));
        }, $text);
    }
    return $text;
}

function postChat(string $dir, string $channel, array $message, int $keep): array {
    $lock = lockChat($dir);
    $id = chatCount($dir) + 1;
    $message['id'] = $id;
    $list = readChat($dir, $channel);
    $list[] = $message;
    $list = array_slice($list, -max(1, $keep));
    $temporary = chatFile($dir, $channel) . '.' . getmypid() . '.tmp';
    file_put_contents($temporary, json_encode($list));
    rename($temporary, chatFile($dir, $channel));
    setChatCount($dir, $id);
    flock($lock, LOCK_UN);
    return $message;
}
