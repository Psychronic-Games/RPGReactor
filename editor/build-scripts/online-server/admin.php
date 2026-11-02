<?php
// RPG Reactor online server: the game's owner's page. Sign in with the admin password the
// build printed, which lives only in config.php on this server. See who is here, ban and
// remove players, reset passwords and take down messages.
declare(strict_types=1);
require __DIR__ . '/common.php';

header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: DENY');
header('Referrer-Policy: no-referrer');
header("Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'");

$config = loadConfig();
$secret = (string)$config['secret'];
$adminKey = (string)($config['adminKey'] ?? '');
if (strlen($adminKey) < 16) fail(503, 'This server has no admin password. Deploy it again from the editor.');
$dir = dataDir($config);

function e($value): string {
    return htmlspecialchars((string)$value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

function adminToken(string $secret, int $expiry): string {
    return $expiry . '.' . substr(hash_hmac('sha256', 'admin.' . $expiry, $secret), 0, 40);
}

function isAdmin(string $secret): bool {
    $parts = explode('.', (string)($_COOKIE['reactor_admin'] ?? ''));
    return count($parts) === 2 && (int)$parts[0] > time() && hash_equals(adminToken($secret, (int)$parts[0]), (string)$_COOKIE['reactor_admin']);
}

function page(string $title, string $body): void {
    header('Content-Type: text/html; charset=utf-8');
    echo '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>', e($title), '</title><style>
body{margin:0;background:#0b0c14;color:#e8e9f2;font:15px/1.4 system-ui,sans-serif}main{max-width:900px;margin:0 auto;padding:20px}h1{font-size:22px;margin:0 0 16px}
h2{font-size:16px;margin:26px 0 8px;color:#aab0d6}table{border-collapse:collapse;width:100%}td,th{padding:6px 8px;border-bottom:1px solid #2a2e4a;text-align:left;vertical-align:top}
button,input{font:inherit;padding:6px 10px;border-radius:4px;border:1px solid #4a52a0;background:#141626;color:inherit}button{cursor:pointer}form.inline{display:inline}.note{color:#aab0d6}.bad{color:#ff9a9a}</style></head><body><main>', $body, '</main></body></html>';
    exit;
}

$address = addressKey($secret);
if (($_POST['do'] ?? '') === 'signin') {
    $tries = 'admin.' . $address;
    if (throttled($dir, $tries)) page('Admin', '<h1>Admin</h1><p class="bad">Too many tries. Wait a while and try again.</p>');
    if (hash_equals($adminKey, (string)($_POST['password'] ?? ''))) {
        clearFailures($dir, $tries);
        $secure = !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off';
        setcookie('reactor_admin', adminToken($secret, time() + 28800), ['expires' => time() + 28800, 'path' => '/', 'httponly' => true, 'secure' => $secure, 'samesite' => 'Strict']);
        header('Location: admin.php', true, 303);
        exit;
    }
    noteFailure($dir, $tries);
    page('Admin', '<h1>Admin</h1><p class="bad">That is not the password.</p><p><a href="admin.php" style="color:inherit">Try again</a></p>');
}

if (!isAdmin($secret)) {
    page('Admin', '<h1>' . e($config['title'] ?? 'Game') . ' admin</h1><form method="post"><input type="hidden" name="do" value="signin">
<p><input type="password" name="password" placeholder="Admin password" autofocus required> <button>Sign in</button></p></form>
<p class="note">The password was shown when this server was first deployed. It is also in reactor-online/config.php.</p>');
}

$csrf = substr(hash_hmac('sha256', 'csrf.' . (string)$_COOKIE['reactor_admin'], $secret), 0, 32);
$flash = '';
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    if (!hash_equals($csrf, (string)($_POST['csrf'] ?? ''))) fail(403, 'That form has expired. Go back and reload.');
    $do = (string)($_POST['do'] ?? '');
    $slot = max(0, min(SLOTS - 1, (int)($_POST['slot'] ?? 0)));
    $key = (string)($_POST['key'] ?? '');
    if ($do === 'signout') {
        setcookie('reactor_admin', '', ['expires' => 1, 'path' => '/', 'samesite' => 'Strict']);
        header('Location: admin.php', true, 303);
        exit;
    }
    if ($do === 'remove' || $do === 'ban-player') {
        $known = readNames($dir)[$slot] ?? [];
        touchAlive($dir, $slot, REMOVED);
        if ($do === 'ban-player') {
            $bans = readBans($dir);
            if (!empty($known['ip'])) $bans[$known['ip']] = ['name' => (string)($known['name'] ?? ''), 'at' => time()];
            file_put_contents($dir . '/bans.json', json_encode($bans));
            if (!empty($known['account'])) {
                $accountKey = accountKey((string)$known['account']);
                $account = readAccount($dir, $accountKey);
                if ($account) { $account['banned'] = true; writeAccount($dir, $accountKey, $account); }
            }
        }
        $flash = 'Done.';
    }
    if ($do === 'unban-address') {
        $bans = readBans($dir);
        unset($bans[(string)($_POST['address'] ?? '')]);
        file_put_contents($dir . '/bans.json', json_encode($bans));
        $flash = 'Ban lifted.';
    }
    if (in_array($do, ['ban-account', 'unban-account', 'reset', 'delete-account'], true)) {
        $account = readAccount($dir, $key);
        if ($account) {
            if ($do === 'delete-account') { forgetAccount($dir, $key); $flash = 'Account deleted.'; }
            else {
                if ($do === 'ban-account') $account['banned'] = true;
                if ($do === 'unban-account') unset($account['banned']);
                if ($do === 'reset') {
                    $temporary = bin2hex(random_bytes(6));
                    $account['password'] = password_hash($temporary, PASSWORD_DEFAULT);
                    $account['passwordChanged'] = time();
                    $flash = 'New password for ' . $account['username'] . ': ' . $temporary . ' (shown once).';
                }
                writeAccount($dir, $key, $account);
                if (!$flash) $flash = 'Done.';
            }
        }
    }
    if ($do === 'delete-message') {
        $id = (int)($_POST['id'] ?? 0);
        $lock = lockChat($dir);
        foreach (glob($dir . '/chat-*.json') ?: [] as $file) {
            $list = @json_decode((string)@file_get_contents($file), true);
            if (is_array($list)) file_put_contents($file, json_encode(array_values(array_filter($list, function (array $message) use ($id): bool { return $message['id'] !== $id; }))));
        }
        $gone = @json_decode((string)@file_get_contents($dir . '/chatgone.json'), true);
        $gone = is_array($gone) ? $gone : [];
        $gone[] = $id;
        file_put_contents($dir . '/chatgone.json', json_encode(array_slice($gone, -200)));
        setChatCount($dir, chatCount($dir));
        flock($lock, LOCK_UN);
        $flash = 'Message removed.';
    }
}

$form = function (string $do, string $label, array $fields = []) use ($csrf): string {
    $hidden = '<input type="hidden" name="do" value="' . e($do) . '"><input type="hidden" name="csrf" value="' . e($csrf) . '">';
    foreach ($fields as $name => $value) $hidden .= '<input type="hidden" name="' . e($name) . '" value="' . e($value) . '">';
    return '<form class="inline" method="post">' . $hidden . '<button>' . e($label) . '</button></form> ';
};

$html = '<h1>' . e($config['title'] ?? 'Game') . ' admin</h1>';
if ($flash !== '') $html .= '<p>' . e($flash) . '</p>';

$names = readNames($dir);
$alive = (string)@file_get_contents($dir . '/alive.bin');
$times = strlen($alive) >= 4 ? unpack('V*', substr($alive, 0, strlen($alive) - strlen($alive) % 4)) : [];
$rows = '';
foreach ($times as $index => $seen) {
    $slot = $index - 1;
    if ($seen >= REPLACED || $seen < time() - ALIVE_SECONDS || !isset($names[$slot])) continue;
    $rows .= '<tr><td>' . e($names[$slot]['name'] ?? '') . '</td><td>' . e(($names[$slot]['account'] ?? '') ?: 'guest') . '</td><td>' . $form('remove', 'Remove', ['slot' => $slot]) . $form('ban-player', 'Ban', ['slot' => $slot]) . '</td></tr>';
}
$html .= '<h2>Playing now</h2>' . ($rows ? "<table>$rows</table>" : '<p class="note">Nobody is here.</p>');

$rows = '';
$files = glob($dir . '/accounts/*.json') ?: [];
foreach (array_slice($files, 0, 500) as $file) {
    $key = basename($file, '.json');
    $account = readAccount($dir, $key);
    if (!$account) continue;
    $banned = !empty($account['banned']);
    $rows .= '<tr><td>' . e($account['username'] ?? '') . ($banned ? ' <span class="bad">banned</span>' : '') . '</td><td>'
        . $form($banned ? 'unban-account' : 'ban-account', $banned ? 'Unban' : 'Ban', ['key' => $key]) . $form('reset', 'Reset password', ['key' => $key]) . $form('delete-account', 'Delete', ['key' => $key]) . '</td></tr>';
}
$html .= '<h2>Accounts (' . count($files) . ')</h2>' . ($rows ? "<table>$rows</table>" : '<p class="note">No accounts yet.</p>');

$messages = [];
foreach (glob($dir . '/chat-*.json') ?: [] as $file) {
    $list = @json_decode((string)@file_get_contents($file), true);
    if (is_array($list)) $messages = array_merge($messages, $list);
}
usort($messages, function (array $a, array $b): int { return $b['id'] <=> $a['id']; });
$rows = '';
foreach (array_slice($messages, 0, 50) as $message) {
    $rows .= '<tr><td>' . e(gmdate('H:i', (int)$message['t'])) . '</td><td>' . e($message['name'] ?? '') . '</td><td>' . e($message['text'] ?? '') . '</td><td>' . $form('delete-message', 'Remove', ['id' => (int)$message['id']]) . '</td></tr>';
}
$html .= '<h2>Recent chat (UTC)</h2>' . ($rows ? "<table>$rows</table>" : '<p class="note">Nothing yet.</p>');

$rows = '';
foreach (readBans($dir) as $hash => $ban) {
    $rows .= '<tr><td>' . e($ban['name'] ?? '') . '</td><td>' . $form('unban-address', 'Lift ban', ['address' => $hash]) . '</td></tr>';
}
if ($rows) $html .= "<h2>Banned addresses</h2><table>$rows</table>";

$html .= '<p style="margin-top:28px">' . $form('signout', 'Sign out') . '</p>';
page('Admin', $html);
