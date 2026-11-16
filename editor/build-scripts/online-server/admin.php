<?php
// RPG Reactor online server: the game's owner's page. Sign in with the admin password the
// build printed, which lives only in config.php on this server. See who is here, ban and
// remove players, reset passwords and take down messages; see what the server holds (its settings, each
// account's character and last visit, the characters stored and who uses them) and clear what is not wanted.
declare(strict_types=1);
require __DIR__ . '/common.php';

header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: DENY');
header('Referrer-Policy: no-referrer');
// One script may run: the page's own, for the live chat, named by a mark made new for each page. Nothing from outside.
$scriptMark = bin2hex(random_bytes(12));
header("Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-$scriptMark'; connect-src 'self'; form-action 'self'; base-uri 'none'");

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

/**
 * The editor theme its author works in, as this page's own colours: the deploy wrote it into config.php from the
 * editor's theme.css (online-theme.cjs). Only plain colours pass; without one the page is the editor's default, gold on black.
 */
function themeCss(array $config): string {
    $theme = json_decode((string)($config['theme'] ?? ''), true);
    if (!is_array($theme)) return '';
    $from = ['--bg' => 'base', '--panel' => 'panel', '--head' => 'deep', '--panel2' => 'surface', '--hover' => 'hover', '--line' => 'border', '--text' => 'text', '--strong' => 'textStrong',
        '--muted' => 'textMuted', '--accent' => 'accent', '--accent-ink' => 'accentOn', '--bad' => 'danger', '--warn' => 'warning', '--good' => 'success', '--button' => 'button', '--input' => 'input'];
    $css = '';
    foreach ($from as $variable => $key) {
        $value = (string)($theme[$key] ?? '');
        if (preg_match('/^(#[0-9a-f]{3,8}|rgba?\([0-9., %]+\))$/i', $value)) $css .= $variable . ':' . $value . ';';
    }
    return $css !== '' ? ':root{' . $css . '}' : '';
}

/** The page's words in the reader's language: the English is the key, and `{name}` parts are filled in. */
function t(string $text, array $with = []): string {
    $words = $GLOBALS['adminWords'] ?? [];
    $out = isset($words[$text]) && is_string($words[$text]) && $words[$text] !== '' ? $words[$text] : $text;
    foreach ($with as $name => $value) $out = str_replace('{' . $name . '}', (string)$value, $out);
    return $out;
}

/** The languages the editor itself speaks, by the name each calls itself. */
const LANGUAGES = ['en' => 'English', 'ja' => '日本語', 'es' => 'Español', 'zh-Hant' => '繁體中文', 'zh-Hans' => '简体中文', 'ru' => 'Русский', 'pt' => 'Português (Brasil)', 'de' => 'Deutsch', 'fr' => 'Français',
    'el' => 'Ελληνικά', 'ko' => '한국어', 'ar' => 'العربية', 'it' => 'Italiano', 'pl' => 'Polski', 'id' => 'Bahasa Indonesia', 'vi' => 'Tiếng Việt', 'th' => 'ไทย', 'tr' => 'Türkçe'];

/** The language asked for by name, as one of LANGUAGES, or ''. */
function languageOf(string $asked): string {
    $tag = strtolower(str_replace('_', '-', trim($asked)));
    if ($tag === '') return '';
    if (in_array($tag, ['zh-tw', 'zh-hk', 'zh-mo', 'zh-hant'], true)) return 'zh-Hant';
    if (strpos($tag, 'zh') === 0) return 'zh-Hans';
    foreach (LANGUAGES as $id => $name) if (strtolower($id) === $tag) return $id;
    $first = explode('-', $tag)[0];
    return isset(LANGUAGES[$first]) ? $first : '';
}

/** The choice of language: the current one named, the others a click away (each its own name, as in the editor). */
function languageMenu(string $base, string $joiner): string {
    global $language;
    $rows = '';
    foreach (LANGUAGES as $id => $name) $rows .= '<a href="' . e($base . $joiner . 'lang=' . $id) . '"' . ($id === $language ? ' class="here"' : '') . ' lang="' . e($id) . '">' . e($name) . '</a>';
    return '<details class="lang"><summary aria-label="' . e(t('Language')) . '">' . e(LANGUAGES[$language] ?? 'English') . '</summary><div>' . $rows . '</div></details>';
}

function page(string $title, string $body, string $shell = 'plain'): void {
    global $config, $language;
    header('Content-Type: text/html; charset=utf-8');
    echo '<!doctype html><html lang="', e($language ?: 'en'), '" dir="', ($language === 'ar' ? 'rtl' : 'ltr'), '"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>', e($title), '</title><style>
:root{--bg:#1a1a1a;--panel:#111111;--head:#000000;--panel2:#1e1e1e;--hover:#37373d;--line:#3e3e42;--text:#cccccc;--strong:#ffffff;--muted:#999999;--accent:#d4af37;--accent-ink:#000000;--good:#3a9a3a;--warn:#ffd083;--bad:#ff6b6b;--button:#2a2a2a;--input:#2d2d2d}
', themeCss($config), '
:root{--bad-bg:color-mix(in srgb,var(--bad) 14%,transparent);--tint:color-mix(in srgb,var(--accent) 12%,transparent);--edge:color-mix(in srgb,var(--accent) 50%,transparent);--shadow:0 4px 12px rgba(0,0,0,.35)}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--text);font:14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif}
a{color:var(--accent);text-decoration:none}a:hover{text-decoration:underline}b{color:var(--strong)}
header.top{position:sticky;top:0;z-index:5;background:var(--panel);border-bottom:1px solid var(--line)}
.bar{max-width:1120px;margin:0 auto;padding:10px 20px;display:flex;align-items:center;gap:12px;flex-wrap:wrap}
.mark{width:32px;height:32px;border-radius:4px;background:var(--accent);display:grid;place-items:center;color:var(--accent-ink);font-weight:700;font-size:16px;flex:none}
.brand{line-height:1.25;min-width:0}.brand b{display:block;font-size:15px;overflow-wrap:anywhere}.brand span{color:var(--text);font-size:11px;font-weight:600;text-transform:uppercase}
.grow{flex:1}
nav.tabs{max-width:1120px;margin:0 auto;padding:0 20px;display:flex;gap:2px;overflow-x:auto}
nav.tabs a{padding:8px 12px;color:var(--muted);font-size:13px;border-bottom:2px solid transparent;white-space:nowrap}nav.tabs a:hover{color:var(--strong);text-decoration:none;background:var(--tint)}nav.tabs a.here{color:var(--strong);font-weight:600;border-bottom-color:var(--accent);background:var(--tint)}
nav.tabs a i{font-style:normal;margin-inline-start:6px;padding:0 6px;border-radius:999px;background:var(--panel2);border:1px solid var(--line);font-size:11px;color:var(--text)}
main{max-width:1120px;margin:0 auto;padding:20px 20px 60px}
.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:12px;margin-bottom:20px}
.tile{background:linear-gradient(100deg,var(--tint),var(--panel) 70%);border:1px solid var(--line);border-left:3px solid var(--accent);border-radius:0 4px 4px 0;padding:12px 16px 14px 14px}
.tile small{display:block;color:var(--text);font-size:12px;text-transform:uppercase;font-weight:600}
.tile b{display:block;font-size:26px;line-height:1.25;margin-top:4px;font-variant-numeric:tabular-nums}.tile b em{font-style:normal;font-size:14px;font-weight:400;color:var(--muted)}
.tile span{color:var(--muted);font-size:12.5px}a.tile{display:block;color:inherit}a.tile:hover{text-decoration:none;border-color:var(--edge);border-left-color:var(--accent)}
.meter{height:4px;background:var(--panel2);border:1px solid var(--line);margin-top:10px;overflow:hidden}.meter u{display:block;height:100%;background:var(--accent)}
section.card{background:var(--panel);border-radius:4px;margin-bottom:14px;padding:10px}
section.card>h2{margin:0 0 10px;padding:4px 8px;font-size:13px;font-weight:bold;color:var(--strong);border-left:3px solid var(--accent);display:flex;align-items:center;gap:10px}
section.card>h2 i{font-style:normal;font-weight:400;font-size:12px;color:var(--text);padding:0 8px;border-radius:999px;border:1px solid var(--line);background:var(--panel2)}
section.card>p{margin:0;padding:6px 8px}section.card>p.empty{border:1px solid var(--line);border-radius:3px;background:var(--bg)}.foot{margin-top:8px!important;display:flex;align-items:center;gap:12px;flex-wrap:wrap}
.scroll{overflow-x:auto;border:1px solid var(--line);border-radius:3px;background:var(--bg)}table{border-collapse:collapse;width:100%;min-width:560px}
th{font-size:11px;text-transform:uppercase;color:var(--text);font-weight:600;text-align:left;padding:7px 12px;background:var(--panel2);border-bottom:1px solid var(--line);white-space:nowrap}
td{padding:8px 12px;border-top:1px solid var(--line);vertical-align:middle}tbody tr:first-child td{border-top:0}tbody tr:hover td{background:var(--tint)}td.acts{text-align:right;white-space:nowrap}td.num{font-variant-numeric:tabular-nums;white-space:nowrap}
.who{display:flex;align-items:center;gap:10px;min-width:0}.who b{font-weight:600;overflow-wrap:anywhere}
.face{width:28px;height:28px;border-radius:3px;background:var(--tint);border:1px solid var(--edge);display:grid;place-items:center;font-size:13px;font-weight:700;color:var(--accent);flex:none;text-transform:uppercase}
.sub{display:block;color:var(--muted);font-size:12px}.note,.empty{color:var(--muted)}.empty{padding:20px 16px!important;text-align:center}
.pill{display:inline-block;padding:0 8px;border-radius:999px;font-size:11.5px;font-weight:600;border:1px solid var(--line);color:var(--muted);vertical-align:middle;line-height:1.7}
.pill.on{color:var(--good);border-color:currentColor}.pill.bad{color:var(--bad);border-color:currentColor;background:var(--bad-bg)}.pill.warn{color:var(--warn);border-color:currentColor}.pill.gold{color:var(--accent);border-color:var(--edge);background:var(--tint)}
code{font:12px Consolas,Menlo,"Courier New",monospace;color:var(--muted)}
button,input{font:inherit}button{cursor:pointer;padding:5px 11px;border-radius:3px;border:1px solid var(--line);background:var(--button);color:var(--text);font-size:13px}
button:hover{border-color:var(--accent);color:var(--strong)}button:focus-visible,input:focus-visible,summary:focus-visible{outline:2px solid var(--accent);outline-offset:1px}
button.primary{background:var(--accent);border-color:var(--accent);color:var(--accent-ink);font-weight:700}button.primary:hover{color:var(--accent-ink);filter:brightness(1.08)}
button.danger{color:var(--bad);border-color:var(--bad)}button.danger:hover{background:var(--bad-bg);color:var(--bad)}
details.lang{position:relative;font-size:13px}details.lang>summary{list-style:none;cursor:pointer;padding:5px 11px;border-radius:3px;border:1px solid var(--line);background:var(--button);color:var(--text);white-space:nowrap}
details.lang>summary::-webkit-details-marker{display:none}details.lang>summary::before{content:"\1F310";margin-inline-end:7px;filter:grayscale(1)}details.lang>summary:hover,details.lang[open]>summary{border-color:var(--accent);color:var(--strong)}
details.lang>div{position:absolute;inset-inline-end:0;top:calc(100% + 6px);z-index:8;width:340px;max-width:86vw;display:grid;grid-template-columns:1fr 1fr;gap:2px;padding:6px;background:var(--panel2);border:1px solid var(--edge);border-radius:4px;box-shadow:var(--shadow)}
details.lang>div a{padding:6px 10px;border-radius:3px;color:var(--text);border-inline-start:3px solid transparent}details.lang>div a:hover{background:var(--tint);color:var(--strong);text-decoration:none}details.lang>div a.here{border-inline-start-color:var(--accent);color:var(--strong);background:var(--tint)}
.gate details.lang{display:inline-block;margin-top:16px;text-align:start}.gate details.lang>div{inset-inline-end:auto;inset-inline-start:50%;transform:translateX(-50%);top:auto;bottom:calc(100% + 6px)}[dir=rtl] .gate details.lang>div{transform:translateX(50%)}
[dir=rtl] th{text-align:right}[dir=rtl] td.acts{text-align:left}[dir=rtl] section.card>h2,[dir=rtl] .tile,[dir=rtl] .flash,[dir=rtl] .gate .card{border-left:0;border-right:3px solid var(--accent)}[dir=rtl] .tile{border-radius:4px 0 0 4px;border-left:1px solid var(--line)}
[dir=rtl] form.inline,[dir=rtl] details.ask{margin:2px 6px 2px 0}[dir=rtl] details.ask{text-align:right}[dir=rtl] details.ask>div{right:auto;left:0}
form.inline{display:inline-block;margin:2px 0 2px 6px}a.button{display:inline-block;padding:5px 11px;border-radius:3px;border:1px solid var(--line);background:var(--button);color:var(--text);font-size:13px}a.button:hover{border-color:var(--accent);color:var(--strong);text-decoration:none}
.log{height:min(58vh,560px);overflow-y:auto;border:1px solid var(--line);border-radius:3px;background:var(--bg);margin-bottom:8px;padding:4px 0}
.log .empty{border:0!important;background:none!important;margin:0}
.line{display:flex;align-items:baseline;gap:10px;padding:5px 12px}.line:hover{background:var(--tint)}.line time{color:var(--muted);font-size:12px;white-space:nowrap;min-width:64px;font-variant-numeric:tabular-nums}
.line .from{color:var(--strong);font-weight:600;white-space:nowrap}.line .whom{color:var(--muted);font-size:12px;white-space:nowrap}.line .said{flex:1;min-width:0;overflow-wrap:anywhere;color:var(--strong)}
.line button,.line form.inline button{padding:1px 8px;font-size:12px;opacity:0}.line form.inline{margin:0}.line:hover button,.line button:focus-visible{opacity:1}
.pick{position:relative;flex:0 1 260px;min-width:200px}.pick .who{width:100%}
.who-list{position:absolute;left:0;right:0;bottom:calc(100% + 4px);z-index:6;max-height:300px;overflow-y:auto;background:var(--panel2);border:1px solid var(--edge);border-radius:3px;box-shadow:var(--shadow)}
.who-row{display:flex;justify-content:space-between;gap:10px;padding:6px 10px;cursor:pointer;font-size:13.5px}.who-row span{color:var(--muted);font-size:12px;white-space:nowrap}.who-row.lit,.who-row:hover{background:var(--tint)}.who-row.chosen b{color:var(--accent)}.who-none{padding:8px 10px;color:var(--muted);font-size:13px}
form.say{display:flex;gap:8px;flex-wrap:wrap;padding:0 0 4px}form.say select,form.say input{padding:7px 10px;border-radius:3px;border:1px solid var(--line);background:var(--input);color:var(--strong);font-size:13.5px}form.say input{flex:1;min-width:220px}form.say button{padding:7px 18px}
details.ask{display:inline-block;position:relative;margin:2px 0 2px 6px;text-align:left}details.ask>summary{list-style:none;cursor:pointer;padding:5px 11px;border-radius:3px;border:1px solid var(--line);background:var(--button);font-size:13px;color:var(--bad)}
details.ask>summary::-webkit-details-marker{display:none}details.ask>summary:hover{border-color:var(--bad)}details.ask[open]>summary{border-color:var(--bad);background:var(--bad-bg)}
details.ask>div{position:absolute;right:0;top:calc(100% + 6px);z-index:4;width:260px;white-space:normal;background:var(--panel2);color:var(--text);border:1px solid var(--edge);border-radius:4px;padding:12px;box-shadow:var(--shadow);font-size:13px}
details.ask>div form.inline{margin:10px 0 0}
.flash{background:var(--tint);border:1px solid var(--edge);border-left:3px solid var(--accent);border-radius:3px;padding:10px 14px;margin-bottom:18px;color:var(--strong);overflow-wrap:anywhere}
dl.facts{margin:8px 0 0;display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:8px}dl.facts div{padding:9px 12px;border:1px solid var(--line);border-radius:3px;background:var(--bg)}dl.facts dt{color:var(--muted);font-size:11px;letter-spacing:.08em;text-transform:uppercase}dl.facts dd{margin:3px 0 0;color:var(--strong)}
.gate{min-height:100vh;display:grid;place-items:center;padding:20px}.gate .card{width:100%;max-width:360px;padding:26px;background:var(--panel);border:1px solid var(--line);border-left:3px solid var(--accent);border-radius:0 4px 4px 0;box-shadow:var(--shadow);text-align:center}
.gate .mark{margin:0 auto 14px;width:44px;height:44px;font-size:21px}.gate h1{font-size:18px;margin:0 0 2px;color:var(--strong)}.gate p{margin:8px 0 0;color:var(--muted);font-size:13px}.gate p.lead{color:var(--text);font-size:11px;font-weight:600;text-transform:uppercase;margin-top:2px}.gate p.bad{color:var(--bad);font-size:14px}
.gate input{width:100%;margin-top:18px;padding:9px 11px;border-radius:3px;border:1px solid var(--line);background:var(--input);color:var(--strong)}.gate button{width:100%;margin-top:10px;padding:9px}
</style></head><body>', ($shell === 'gate' ? '<div class="gate"><div class="card">' . $body . '</div></div>' : $body), '</body></html>';
    exit;
}

// The page's own address, without ".php" where the server rewrites it (this folder's .htaccess, written by the
// deploy: /reactor-online/admin and /reactor-online/admin/accounts). Known by how this request came: an address
// with no "admin.php" in it was rewritten here. A server that does not rewrite keeps admin.php?tab=..., which always works.
$requested = (string)parse_url((string)($_SERVER['REQUEST_URI'] ?? ''), PHP_URL_PATH);
$clean = $requested !== '' && strpos($requested, 'admin.php') === false;
$folder = rtrim(str_replace('\\', '/', dirname((string)($_SERVER['SCRIPT_NAME'] ?? '/reactor-online/admin.php'))), '/');
$link = function (string $tab = 'overview') use ($clean, $folder): string {
    if (!$clean) return 'admin.php' . ($tab !== 'overview' ? '?tab=' . rawurlencode($tab) : '');
    return $folder . '/admin' . ($tab !== 'overview' ? '/' . rawurlencode($tab) : '');
};
// Asked for by its file name on a server that does rewrite (the .htaccess says so): shown at the address without it.
if (!$clean && $_SERVER['REQUEST_METHOD'] === 'GET' && (!empty($_SERVER['RR_CLEAN_URLS']) || !empty($_SERVER['REDIRECT_RR_CLEAN_URLS']))) {
    $wanted = preg_match('/^[a-z]{1,20}$/', (string)($_GET['tab'] ?? '')) ? (string)$_GET['tab'] : 'overview';
    header('Location: ' . $folder . '/admin' . ($wanted !== 'overview' ? '/' . $wanted : ''), true, 302);
    exit;
}

// The reader's language: the one chosen here (kept a year), else the browser's own first choice that the page speaks.
$language = languageOf((string)($_COOKIE['reactor_admin_lang'] ?? ''));
if (isset($_GET['lang']) && languageOf((string)$_GET['lang']) !== '') {
    $language = languageOf((string)$_GET['lang']);
    setcookie('reactor_admin_lang', $language, ['expires' => time() + 31536000, 'path' => '/', 'samesite' => 'Lax']);
    $back = preg_match('/^[a-z]{1,20}$/', (string)($_GET['tab'] ?? '')) ? (string)$_GET['tab'] : 'overview';
    header('Location: ' . $link($back), true, 303);
    exit;
}
if ($language === '') {
    foreach (explode(',', (string)($_SERVER['HTTP_ACCEPT_LANGUAGE'] ?? '')) as $offered) {
        $language = languageOf((string)explode(';', $offered)[0]);
        if ($language !== '') break;
    }
}
if ($language === '') $language = 'en';
$adminWords = [];
if ($language !== 'en') {
    $read = @json_decode((string)@file_get_contents(__DIR__ . '/lang-' . $language . '.json'), true);
    if (is_array($read)) $adminWords = $read;
}
$joiner = $clean ? '?' : '&';
$gateMenu = languageMenu($clean ? $link() : 'admin.php?tab=overview', $joiner);

$address = addressKey($secret);
if (($_POST['do'] ?? '') === 'signin') {
    $tries = 'admin.' . $address;
    if (throttled($dir, $tries)) page(t('Server admin'), '<div class="mark">R</div><h1>' . e(t('Server admin')) . '</h1><p class="bad">' . e(t('Too many tries. Wait a while and try again.')) . '</p>', 'gate');
    if (hash_equals($adminKey, (string)($_POST['password'] ?? ''))) {
        clearFailures($dir, $tries);
        $secure = !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off';
        setcookie('reactor_admin', adminToken($secret, time() + 28800), ['expires' => time() + 28800, 'path' => '/', 'httponly' => true, 'secure' => $secure, 'samesite' => 'Strict']);
        header('Location: ' . $link(), true, 303);
        exit;
    }
    noteFailure($dir, $tries);
    page(t('Server admin'), '<div class="mark">R</div><h1>' . e(t('Server admin')) . '</h1><p class="bad">' . e(t('That is not the password.')) . '</p><p><a href="' . e($link()) . '">' . e(t('Try again')) . '</a></p>', 'gate');
}

if (!isAdmin($secret)) {
    page(t('Server admin'), '<div class="mark">R</div><h1>' . e($config['title'] ?? 'Game') . '</h1><p class="lead">' . e(t('Server admin')) . '</p><form method="post"><input type="hidden" name="do" value="signin">
<input type="password" name="password" placeholder="' . e(t('Admin password')) . '" autocomplete="current-password" autofocus required><button class="primary">' . e(t('Sign in')) . '</button></form>
<p>' . str_replace('{file}', '<code>reactor-online/config.php</code>', e(t('The password was shown when this server was first deployed. It is also in {file} on the server.'))) . '</p>' . $gateMenu, 'gate');
}

$csrf = substr(hash_hmac('sha256', 'csrf.' . (string)$_COOKIE['reactor_admin'], $secret), 0, 32);
// One section at a time (the tabs): which one is in the address, so a button pressed comes back to its own.
$tabs = ['overview' => t('Overview'), 'accounts' => t('Accounts'), 'characters' => t('Characters'), 'chat' => t('Chat'), 'bans' => t('Bans'), 'settings' => t('Settings')];
$tab = isset($tabs[(string)($_GET['tab'] ?? '')]) ? (string)$_GET['tab'] : 'overview';
// What an action has to say is kept for the page that follows it (this visit's own note, read once).
$noteFile = $dir . '/admin-note-' . substr(hash('sha256', (string)$_COOKIE['reactor_admin']), 0, 24) . '.txt';
$flash = '';
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    if (!hash_equals($csrf, (string)($_POST['csrf'] ?? ''))) fail(403, t('That form has expired. Go back and reload.'));
    $do = (string)($_POST['do'] ?? '');
    $slot = max(0, min(SLOTS - 1, (int)($_POST['slot'] ?? 0)));
    $key = (string)($_POST['key'] ?? '');
    if ($do === 'signout') {
        setcookie('reactor_admin', '', ['expires' => 1, 'path' => '/', 'samesite' => 'Strict']);
        header('Location: ' . $link(), true, 303);
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
        $flash = t('Done.');
    }
    // A word from the owner: to everyone (the world's own channel, read on every map), or to one player who is here
    // (a channel of that player's own, kept with their visit's mark so the next player in that place never reads it).
    if ($do === 'say') {
        $text = textStart(cleanText((string)($_POST['text'] ?? '')), 500);
        $to = (string)($_POST['to'] ?? 'all');
        // "all", an account by its key ("a…": read now if its player is here, else when they next play), or a
        // guest by the place they hold ("s…": only while they are here).
        $toAccount = preg_match('/^a([a-f0-9]{64})$/', $to, $found) ? readAccount($dir, $found[1]) : null;
        $keep = max(10, min(500, (int)settingsOf($config)['chat']['history']));
        $message = ['t' => time(), 'name' => 'Server', 'slot' => -1, 'text' => $text, 'world' => true, 'admin' => true];
        if ($text === '') $flash = t('There is nothing to send.');
        elseif ($to === 'all') { postChat($dir, 'w', $message, $keep); $flash = t('Sent to everyone.'); }
        elseif ($toAccount) {
            $name = (string)($toAccount['username'] ?? '');
            $playing = false;
            foreach (readNames($dir) as $place => $known) {
                $seen = aliveAt($dir, (int)$place);
                if (($known['account'] ?? '') === $name && $seen < REPLACED && $seen >= time() - ALIVE_SECONDS) $playing = true;
            }
            postChat($dir, 'a' . substr($found[1], 0, 24), ['world' => false, 'private' => true, 'to' => $name, 'pending' => true] + $message, 50);
            $flash = $playing ? t('Sent to {name} alone.', ['name' => $name]) : t('{name} is not playing now: they will read it when they next play.', ['name' => $name]);
        }
        elseif ($to[0] !== 's' || !ctype_digit(substr($to, 1))) $flash = t('Choose who to write to.');
        else {
            $target = max(0, min(SLOTS - 1, (int)substr($to, 1)));
            $known = readNames($dir)[$target] ?? null;
            $mark = slotNonce($dir, $target);
            $seen = aliveAt($dir, $target);
            if (!$known || $mark === '' || $seen >= REPLACED || $seen < time() - ALIVE_SECONDS) $flash = t('That player is no longer here: nothing was sent.');
            else {
                postChat($dir, 'u' . $target, ['world' => false, 'private' => true, 'to' => (string)($known['name'] ?? ''), 'nonce' => $mark] + $message, 50);
                $flash = t('Sent to {name} alone.', ['name' => (string)($known['name'] ?? '')]);
            }
        }
    }
    if ($do === 'unban-address') {
        $bans = readBans($dir);
        unset($bans[(string)($_POST['address'] ?? '')]);
        file_put_contents($dir . '/bans.json', json_encode($bans));
        $flash = t('Ban lifted.');
    }
    // A character package nobody uses any more: no account's, and no player's who is here now.
    if ($do === 'delete-model' || $do === 'delete-unused-models') {
        $used = modelsInUse($dir);
        $gone = 0;
        foreach (glob($dir . '/models/*.rrch') ?: [] as $file) {
            $hash = basename($file, '.rrch');
            if (isset($used[$hash]) || !preg_match('/^[a-f0-9]{64}$/', $hash)) continue;
            if ($do === 'delete-model' && !hash_equals($hash, (string)($_POST['model'] ?? ''))) continue;
            if (@unlink($file)) $gone++;
        }
        $flash = $gone === 1 ? t('One character package deleted.') : t('{count} character packages deleted.', ['count' => $gone]);
    }
    if (in_array($do, ['ban-account', 'unban-account', 'reset', 'delete-account', 'clear-character'], true)) {
        $account = readAccount($dir, $key);
        if ($account) {
            if ($do === 'delete-account') { forgetAccount($dir, $key); $flash = t('Account deleted.'); }
            else {
                if ($do === 'ban-account') $account['banned'] = true;
                if ($do === 'unban-account') unset($account['banned']);
                // The account keeps its name, password and progress; its player makes or picks a character at the next sign-in.
                if ($do === 'clear-character') { $account['character'] = null; $flash = t('Character removed from {name}.', ['name' => $account['username']]); }
                if ($do === 'reset') {
                    $temporary = bin2hex(random_bytes(6));
                    $account['password'] = password_hash($temporary, PASSWORD_DEFAULT);
                    $account['passwordChanged'] = time();
                    $flash = t('New password for {name}: {password} (shown once).', ['name' => $account['username'], 'password' => $temporary]);
                }
                writeAccount($dir, $key, $account);
                if (!$flash) $flash = t('Done.');
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
        $flash = t('Message removed.');
    }
    // Asked by the page's own script (the live chat): the answer is data, and the page stays as it is.
    if (!empty($_POST['ajax'])) respond(['ok' => true, 'note' => $flash]);
    // Otherwise the page is asked for afresh, so reloading it sends nothing a second time (a message went out twice so).
    if ($flash !== '') { @file_put_contents($noteFile, $flash); @chmod($noteFile, 0600); }
    $again = $link($tab);
    if ($do === 'say' && preg_match('/^(a[a-f0-9]{64}|s[0-9]{1,4})$/', (string)($_POST['to'] ?? ''))) $again .= ($clean ? '?' : '&') . 'to=' . $_POST['to'];
    header('Location: ' . $again, true, 303);
    exit;
}
if (is_file($noteFile)) { $flash = (string)@file_get_contents($noteFile); @unlink($noteFile); }

/** Every stored character that someone uses, by its package's name: [hash => [who, ...]]. */
function modelsInUse(string $dir): array {
    $used = [];
    foreach (glob($dir . '/accounts/*.json') ?: [] as $file) {
        $account = readAccount($dir, basename($file, '.json'));
        $hash = is_array($account) && is_array($account['character'] ?? null) ? (string)($account['character']['id'] ?? '') : '';
        if ($hash !== '') $used[$hash][] = (string)($account['username'] ?? '');
    }
    $alive = (string)@file_get_contents($dir . '/alive.bin');
    $times = strlen($alive) >= 4 ? unpack('V*', substr($alive, 0, strlen($alive) - strlen($alive) % 4)) : [];
    foreach (readNames($dir) as $slot => $known) {
        $hash = (string)($known['model'] ?? '');
        $seen = (int)($times[(int)$slot + 1] ?? 0);
        if ($hash === '' || $seen >= REPLACED || $seen < time() - ALIVE_SECONDS) continue;
        if (($known['account'] ?? '') === '') $used[$hash][] = t('{name} (guest, here now)', ['name' => (string)($known['name'] ?? '?')]);
        elseif (!isset($used[$hash])) $used[$hash][] = (string)$known['account'];
    }
    return $used;
}
$bytes = function (int $count): string { return $count >= 1048576 ? number_format($count / 1048576, 1) . ' MB' : number_format($count / 1024, 0) . ' KB'; };
$day = function (int $time): string { return $time > 0 ? gmdate('Y-m-d', $time) . ' <span class="sub">' . gmdate('H:i', $time) . ' UTC</span>' : '<span class="note">' . e(t('Never')) . '</span>'; };
$post = '<form class="inline" method="post" action="' . e($link($tab)) . '">';
$hidden = function (string $do, array $fields) use ($csrf): string {
    $out = '<input type="hidden" name="do" value="' . e($do) . '"><input type="hidden" name="csrf" value="' . e($csrf) . '">';
    foreach ($fields as $name => $value) $out .= '<input type="hidden" name="' . e($name) . '" value="' . e($value) . '">';
    return $out;
};
/** A button that acts at once. */
$form = function (string $do, string $label, array $fields = [], string $class = '') use ($hidden, $post): string {
    return $post . $hidden($do, $fields) . '<button' . ($class !== '' ? ' class="' . e($class) . '"' : '') . '>' . e($label) . '</button></form>';
};
/** A button that cannot be undone: it opens a question first (no script is allowed on this page, so the question is the page's own). */
$ask = function (string $do, string $label, string $question, string $yes, array $fields = []) use ($hidden, $post): string {
    return '<details class="ask"><summary>' . e($label) . '</summary><div>' . e($question)
        . $post . $hidden($do, $fields) . '<button class="danger">' . e($yes) . '</button></form></div></details>';
};
$face = function (string $name): string { return '<span class="face">' . e(textStart(trim($name) !== '' ? trim($name) : '?', 1)) . '</span>'; };
$pill = function (bool $on, string $yes = '', string $no = ''): string { return '<span class="pill ' . ($on ? 'on' : 'off') . '">' . e($on ? ($yes !== '' ? $yes : t('On')) : ($no !== '' ? $no : t('Off'))) . '</span>'; };
$card = function (string $id, string $title, string $count, string $inside): string {
    return '<section class="card" id="' . e($id) . '"><h2>' . e($title) . ($count !== '' ? '<i>' . e($count) . '</i>' : '') . '</h2>' . $inside . '</section>';
};
$table = function (array $heads, string $rows): string {
    $head = '';
    foreach ($heads as $text) $head .= '<th>' . e($text) . '</th>';
    return '<div class="scroll"><table><thead><tr>' . $head . '</tr></thead><tbody>' . $rows . '</tbody></table></div>';
};

$settings = settingsOf($config);
$title = (string)($config['title'] ?? 'Game');
$most = max(1, min(SLOTS, (int)($config['maxPlayers'] ?? SLOTS)));

// Who is here.
$names = readNames($dir);
$alive = (string)@file_get_contents($dir . '/alive.bin');
$times = strlen($alive) >= 4 ? unpack('V*', substr($alive, 0, strlen($alive) - strlen($alive) % 4)) : [];
$playingRows = '';
$playing = 0;
$here = [];
foreach ($times as $index => $seen) {
    $slot = $index - 1;
    if ($seen >= REPLACED || $seen < time() - ALIVE_SECONDS || !isset($names[$slot])) continue;
    $playing++;
    $name = (string)($names[$slot]['name'] ?? '');
    $account = (string)($names[$slot]['account'] ?? '');
    $here[$slot] = ['name' => $name, 'account' => $account];
    $playingRows .= '<tr><td><span class="who">' . $face($name) . '<b>' . e($name) . '</b></span></td><td>' . ($account !== '' ? e($account) : '<span class="pill gold">' . e(t('Guest')) . '</span>') . '</td><td class="acts">'
        . '<a class="button" href="' . e($link('chat') . ($clean ? '?' : '&') . 'to=' . ($account !== '' ? 'a' . accountKey($account) : 's' . $slot)) . '">' . e(t('Message')) . '</a>' . $form('remove', t('Remove'), ['slot' => $slot]) . $ask('ban-player', t('Ban'), t('Ban {name}? Their address, and their account if they have one, can no longer play.', ['name' => $name]), t('Ban this player'), ['slot' => $slot]) . '</td></tr>';
}

// Accounts.
$accountRows = '';
$files = glob($dir . '/accounts/*.json') ?: [];
foreach (array_slice($files, 0, 500) as $file) {
    $key = basename($file, '.json');
    $account = readAccount($dir, $key);
    if (!$account) continue;
    $name = (string)($account['username'] ?? '');
    $banned = !empty($account['banned']);
    $character = is_array($account['character'] ?? null) ? $account['character'] : null;
    $progress = progressOf($dir, $key);
    $where = $progress && is_array($progress['wake']) && !empty($progress['wake']['map']) ? '<span class="sub">' . e(t('on map {map}', ['map' => (int)$progress['wake']['map']])) . '</span>' : '';
    $look = $character
        ? '<b>' . e((string)($character['name'] ?? '')) . '</b><span class="sub">' . e(!empty($character['id']) ? t('Made in the creator') : t('Actor {id}', ['id' => (int)($character['actorId'] ?? 0)])) . '</span>'
        : '<span class="note">' . e(t('None yet')) . '</span>';
    $accountRows .= '<tr><td><span class="who">' . $face($name) . '<span><b>' . e($name) . '</b>' . ($banned ? ' <span class="pill bad">' . e(t('Banned')) . '</span>' : '') . '</span></span></td>'
        . '<td class="num">' . $day((int)($account['created'] ?? 0)) . '</td><td class="num">' . ($progress ? $day((int)$progress['at']) . $where : '<span class="note">' . e(t('Never')) . '</span>') . '</td><td>' . $look . '</td><td class="acts">'
        . $form('reset', t('Reset password'), ['key' => $key])
        . ($banned ? $form('unban-account', t('Unban'), ['key' => $key]) : $ask('ban-account', t('Ban'), t('Ban {name}? They can no longer sign in.', ['name' => $name]), t('Ban this account'), ['key' => $key]))
        . ($character ? $ask('clear-character', t('Remove character'), t('Remove the character of {name}? The account, its password and its progress stay; a new character is made at the next sign-in.', ['name' => $name]), t('Remove the character'), ['key' => $key]) : '')
        . $ask('delete-account', t('Delete'), t('Delete {name} for good? The account and its progress are erased.', ['name' => $name]), t('Delete this account'), ['key' => $key]) . '</td></tr>';
}

// The characters players made: one package each, shared by everyone who looks the same.
$modelFiles = glob($dir . '/models/*.rrch') ?: [];
$modelBytes = 0;
foreach ($modelFiles as $file) $modelBytes += (int)@filesize($file);
$used = modelsInUse($dir);
$modelRows = '';
$spare = 0;
usort($modelFiles, function (string $a, string $b): int { return (int)@filemtime($b) <=> (int)@filemtime($a); });
foreach (array_slice($modelFiles, 0, 500) as $file) {
    $hash = basename($file, '.rrch');
    $who = $used[$hash] ?? [];
    if (!$who) $spare++;
    $modelRows .= '<tr><td><code>' . e(substr($hash, 0, 12)) . '</code></td><td class="num">' . e($bytes((int)@filesize($file))) . '</td><td class="num">' . $day((int)@filemtime($file)) . '</td><td>'
        . ($who ? e(count($who) > 6 ? t('{names} and {count} more', ['names' => implode(', ', array_slice($who, 0, 6)), 'count' => count($who) - 6]) : implode(', ', $who)) : '<span class="pill warn">' . e(t('Nobody')) . '</span>') . '</td><td class="acts">'
        . ($who ? '' : $ask('delete-model', t('Delete'), t('Delete this character package? Nobody uses it.'), t('Delete it'), ['model' => $hash])) . '</td></tr>';
}

// Chat.
$messages = [];
foreach (glob($dir . '/chat-*.json') ?: [] as $file) {
    $list = @json_decode((string)@file_get_contents($file), true);
    if (is_array($list)) $messages = array_merge($messages, $list);
}
usort($messages, function (array $a, array $b): int { return $b['id'] <=> $a['id']; });
// Everyone who can be written to: every account (here now or not), and the guests who are here.
$people = [];
$nowPlaying = [];
foreach ($here as $slot => $one) { if ($one['account'] !== '') $nowPlaying[$one['account']] = true; }
foreach (array_slice($files, 0, 2000) as $file) {
    $one = readAccount($dir, basename($file, '.json'));
    if (!$one) continue;
    $name = (string)($one['username'] ?? '');
    $people[] = ['id' => 'a' . basename($file, '.json'), 'name' => $name, 'note' => isset($nowPlaying[$name]) ? t('playing now') : t('not playing'), 'away' => !isset($nowPlaying[$name])];
}
foreach ($here as $slot => $one) { if ($one['account'] === '') $people[] = ['id' => 's' . (int)$slot, 'name' => $one['name'], 'note' => t('guest, playing now'), 'away' => false]; }
usort($people, function (array $a, array $b): int { return [$a['away'], strtolower($a['name'])] <=> [$b['away'], strtolower($b['name'])]; });
/** A chat line as the page shows it: who, to whom, when, what. */
$lineOf = function (array $message): array {
    return ['id' => (int)($message['id'] ?? 0), 't' => (int)($message['t'] ?? 0), 'admin' => !empty($message['admin']),
        'from' => !empty($message['admin']) ? t('Server') : (string)($message['name'] ?? ''),
        'to' => t('to {whom}', ['whom' => !empty($message['private']) ? t('{name} alone', ['name' => (string)($message['to'] ?? '')]) : (!empty($message['party']) ? t('their party') : (!empty($message['world']) ? t('everyone') : t('map {map}', ['map' => (int)($message['map'] ?? 0)])))]),
        'text' => (string)($message['text'] ?? '')];
};
// The live chat asks for what is new every two seconds: the lines after the last it has, the ones taken down, and who is here.
if (isset($_GET['feed'])) {
    $after = max(0, (int)$_GET['feed']);
    $fresh = [];
    foreach (array_reverse(array_slice($messages, 0, 100)) as $message) if ((int)($message['id'] ?? 0) > $after) $fresh[] = $lineOf($message);
    $gone = @json_decode((string)@file_get_contents($dir . '/chatgone.json'), true);
    respond(['messages' => $fresh, 'gone' => is_array($gone) ? array_slice($gone, -100) : [], 'people' => $people]);
}
$chatLines = '';
foreach (array_reverse(array_slice($messages, 0, 100)) as $message) {
    $shown = $lineOf($message);
    $chatLines .= '<div class="line" data-id="' . $shown['id'] . '"><time>' . e(gmdate('H:i', $shown['t'])) . ' UTC</time>' . ($shown['admin'] ? '<span class="pill gold">' . e($shown['from']) . '</span>' : '<span class="from">' . e($shown['from']) . '</span>')
        . '<span class="whom">' . e($shown['to']) . '</span><span class="said">' . e($shown['text']) . '</span>' . $form('delete-message', t('Remove'), ['id' => $shown['id']]) . '</div>';
}
$lastLine = $messages ? (int)($messages[0]['id'] ?? 0) : 0;

// Bans.
$bans = readBans($dir);
$banRows = '';
foreach ($bans as $hash => $ban) {
    $banRows .= '<tr><td><b>' . e(($ban['name'] ?? '') !== '' ? $ban['name'] : t('Unnamed')) . '</b></td><td class="num">' . $day((int)($ban['at'] ?? 0)) . '</td><td class="acts">' . $form('unban-address', t('Lift ban'), ['address' => $hash]) . '</td></tr>';
}

$accountsOn = $settings['accounts']['mode'] !== 'none';
$accountsRule = ['none' => t('Guests only'), 'optional' => t('Optional: guests may play'), 'required' => t('Required to play')][(string)$settings['accounts']['mode']] ?? (string)$settings['accounts']['mode'];
$limitMb = (float)$settings['storage']['characterMB'];
$limitGb = (float)$settings['storage']['totalGB'];
$engine = empty($settings['engine']['enabled']) ? [t('Off in the project'), false] : (findNode() !== '' ? [t('Available: Node is on this server'), true] : [t('Lite mode: Node is not installed on this server'), false]);

$html = '<header class="top"><div class="bar"><div class="mark">' . e(textStart($title, 1)) . '</div><div class="brand"><b>' . e($title) . '</b><span>' . e(t('Server admin')) . '</span></div><span class="grow"></span>'
    . '<span class="pill gold">' . e(t('Runtime {version}', ['version' => (string)($config['runtime'] ?? '')])) . '</span>' . languageMenu($link($tab), $joiner) . $form('signout', t('Sign out')) . '</div>'
    . '<nav class="tabs">';
$counts = ['overview' => $playing, 'accounts' => count($files), 'characters' => count($modelFiles), 'chat' => min(50, count($messages)), 'bans' => count($bans)];
foreach ($tabs as $id => $label) {
    $html .= '<a href="' . e($link($id)) . '"' . ($id === $tab ? ' class="here" aria-current="page"' : '') . '>' . e($label)
        . (isset($counts[$id]) && $id !== 'overview' ? '<i>' . (int)$counts[$id] . '</i>' : '') . '</a>';
}
$html .= '</nav></header><main>';
if ($flash !== '') $html .= '<div class="flash">' . e($flash) . '</div>';

if ($tab === 'overview') $html .= '<div class="tiles">'
    . '<div class="tile"><small>' . e(t('Playing now')) . '</small><b>' . $playing . ' <em>' . e(t('of {most}', ['most' => $most])) . '</em></b><div class="meter"><u style="width:' . (int)round(100 * $playing / $most) . '%"></u></div></div>'
    . '<a class="tile" href="' . e($link('accounts')) . '"><small>' . e(t('Accounts')) . '</small><b>' . count($files) . '</b><span>' . e($accountsOn ? (!empty($settings['accounts']['registration']) ? t('New accounts are open') : t('New accounts are closed')) : t('Accounts are off')) . '</span></a>'
    . '<a class="tile" href="' . e($link('characters')) . '"><small>' . e(t('Characters')) . '</small><b>' . count($modelFiles) . '</b><span>' . e(t('{size} stored', ['size' => $bytes($modelBytes)]) . ($spare ? ', ' . t('{count} unused', ['count' => $spare]) : '')) . '</span></a>'
    . '<a class="tile" href="' . e($link('settings')) . '"><small>' . e(t('Server mode')) . '</small><b style="font-size:19px;line-height:1.8">' . e($engine[1] ? t('Live engine') : t('Lite')) . '</b><span>' . e($engine[0]) . '</span></a>'
    . '</div>';

if ($tab === 'overview') $html .= $card('players', t('Playing now'), (string)$playing, $playingRows !== '' ? $table([t('Player'), t('Account'), ''], $playingRows) : '<p class="empty">' . e(t('Nobody is here right now.')) . '</p>');
if ($tab === 'accounts') $html .= $card('accounts', t('Accounts'), (string)count($files), $accountRows !== '' ? $table([t('Account'), t('Created'), t('Last played'), t('Character'), ''], $accountRows) : '<p class="empty">' . e(t('No accounts yet.')) . '</p>');
if ($tab === 'characters') $html .= $card('characters', t('Characters'), count($modelFiles) . ' · ' . $bytes($modelBytes),
    ($modelRows !== '' ? $table([t('Package'), t('Size'), t('Stored'), t('Used by'), ''], $modelRows) : '<p class="empty">' . e(t('No player has made a character yet.')) . '</p>')
    . ($spare ? '<p class="foot"><span class="note">' . e($spare === 1 ? t('One package is used by nobody: a guest who made one and left has no account to keep it.') : t('{count} packages are used by nobody: a guest who made one and left has no account to keep it.', ['count' => $spare])) . '</span>'
        . $ask('delete-unused-models', t('Delete the unused'), t('Delete every character package nobody uses?'), t('Delete {count}', ['count' => $spare])) . '</p>' : ''));
if ($tab === 'chat') {
    // The chat as it happens: every line said in the game as it is said, and a line of the owner's own to everyone or to
    // one of those who are here (chosen already when the page was reached from that player's row). The page's script
    // keeps it current; without it the same page works by its buttons.
    $chosen = (string)($_GET['to'] ?? 'all');
    $options = '<option value="all">' . e(t('Everyone on the server')) . '</option>';
    foreach ($people as $one) $options .= '<option value="' . e($one['id']) . '"' . ($chosen === $one['id'] ? ' selected' : '') . '>' . e($one['name']) . ' (' . e($one['note']) . ')</option>';
    $scriptWords = ['everyone' => t('Everyone on the server'), 'search' => t('Search players'), 'nobody' => t('Nobody by that name.'), 'empty' => t('Nothing has been said yet.'), 'remove' => t('Remove'), 'sent' => t('Sent.'), 'failed' => t('That could not be sent. Check the connection and try again.'), 'to' => t('To')];
    $html .= $card('chat', t('Chat'), '', '<div class="log" id="log" data-last="' . $lastLine . '" data-words="' . e(json_encode($scriptWords)) . '">' . ($chatLines !== '' ? $chatLines : '<p class="empty">' . e(t('Nothing has been said yet.')) . '</p>') . '</div>'
        . '<form class="say" id="say" method="post" action="' . e($link('chat')) . '">' . $hidden('say', [])
        . '<select name="to" aria-label="' . e(t('To')) . '">' . $options . '</select><input type="text" name="text" maxlength="500" placeholder="' . e(t('Write to the players')) . '" aria-label="' . e(t('Message')) . '" autocomplete="off" required autofocus>'
        . '<button class="primary">' . e(t('Send')) . '</button></form><p class="note" id="saynote">' . e(t('Players read it in the game\'s chat as from the Server. Choose one player to write to them alone: an account reads it at once, or when it next plays; a guest only while here.'))
        . (empty($settings['chat']['enabled']) ? ' ' . e(t('Chat is off in this project: players may not see it.')) : '') . '</p>');
    $html .= '<script nonce="' . e($scriptMark) . '">' . <<<'JS'
(() => {
    const log = document.getElementById("log"), form = document.getElementById("say"), note = document.getElementById("saynote");
    if (!log || !form || !window.fetch) return;
    const text = form.elements.text, to = form.elements.to, csrf = form.elements.csrf.value, url = form.getAttribute("action");
    const feed = url + (url.indexOf("?") < 0 ? "?" : "&") + "feed=";
    let last = 0, asking = false;
    const make = (tag, name, words) => { const node = document.createElement(tag); if (name) node.className = name; if (words != null) node.textContent = words; return node; };
    const clock = seconds => new Date(seconds * 1000).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    const send = fields => fetch(url, { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams(Object.assign({ csrf: csrf, ajax: "1" }, fields)).toString() }).then(answer => answer.json());
    const say = words => { note.textContent = words; };
    // Who it is for: a box to type a name into, with the list under it narrowing as it is typed (the plain list
    // stays in the form and holds the choice; it is what the page uses without this script).
    const WORDS = JSON.parse(log.dataset.words || "{}"), EVERYONE = WORDS.everyone || "Everyone on the server";
    let people = [], lit = 0, shown = [];
    const pick = make("div", "pick"), who = make("input", "who"), list = make("div", "who-list");
    who.type = "text"; who.autocomplete = "off"; who.spellcheck = false; who.placeholder = WORDS.search || "Search players"; who.setAttribute("aria-label", WORDS.to || "To");
    list.hidden = true;
    to.before(pick); pick.append(who, list); to.hidden = true;
    const labelOf = id => { if (id === "all") return EVERYONE; const one = people.find(each => each.id === id); return one ? one.name : EVERYONE; };
    const choose = id => { to.value = id; if (to.value !== id) to.value = "all"; who.value = labelOf(to.value); list.hidden = true; };
    const show = () => {
        const asked = who.dataset.all === "1" ? "" : who.value.trim().toLowerCase();
        shown = [{ id: "all", name: EVERYONE, note: "" }].concat(people).filter(one => !asked || one.name.toLowerCase().indexOf(asked) >= 0).slice(0, 60);
        lit = Math.max(0, Math.min(lit, shown.length - 1));
        list.textContent = "";
        shown.forEach((one, index) => {
            const row = make("div", "who-row" + (index === lit ? " lit" : "") + (one.id === to.value ? " chosen" : ""));
            row.append(make("b", "", one.name), make("span", "", one.note));
            row.addEventListener("mousedown", event => { event.preventDefault(); choose(one.id); text.focus(); });
            list.append(row);
        });
        if (!shown.length) list.append(make("div", "who-none", WORDS.nobody || "Nobody by that name."));
        list.hidden = false;
    };
    const open = () => { who.dataset.all = "1"; lit = 0; who.select(); show(); };
    who.addEventListener("focus", open);
    who.addEventListener("click", () => { if (list.hidden) open(); });
    who.addEventListener("input", () => { who.dataset.all = ""; lit = 0; show(); });
    who.addEventListener("blur", () => { list.hidden = true; who.value = labelOf(to.value); });
    who.addEventListener("keydown", event => {
        if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); if (list.hidden) { show(); return; } lit = (lit + (event.key === "ArrowDown" ? 1 : shown.length - 1)) % Math.max(1, shown.length); show(); }
        else if (event.key === "Enter") { event.preventDefault(); if (!list.hidden && shown[lit]) choose(shown[lit].id); text.focus(); }
        else if (event.key === "Escape") { list.hidden = true; who.blur(); }
    });
    for (const option of to.options) if (option.value !== "all") people.push({ id: option.value, name: option.textContent.replace(/ \([^()]*\)$/, ""), note: (/\(([^()]*)\)$/.exec(option.textContent) || [])[1] || "" });
    who.value = labelOf(to.value);
    const line = message => {
        const row = make("div", "line");
        row.dataset.id = message.id;
        const when = make("time", "", clock(message.t));
        when.title = new Date(message.t * 1000).toLocaleString();
        const remove = make("button", "", WORDS.remove || "Remove");
        remove.type = "button";
        remove.addEventListener("click", () => { remove.disabled = true; send({ do: "delete-message", id: message.id }).then(ask, () => { remove.disabled = false; }); });
        row.append(when, make("span", message.admin ? "pill gold" : "from", message.from), make("span", "whom", message.to), make("span", "said", message.text), remove);
        return row;
    };
    const ask = () => {
        if (asking) return;
        asking = true;
        fetch(feed + last, { credentials: "same-origin", cache: "no-store" }).then(answer => answer.json()).then(data => {
            const atEnd = log.scrollHeight - log.scrollTop - log.clientHeight < 40;
            for (const message of data.messages || []) {
                if (message.id <= last) continue;
                last = message.id;
                const empty = log.querySelector(".empty");
                if (empty) empty.remove();
                log.append(line(message));
            }
            for (const id of data.gone || []) { const row = log.querySelector('.line[data-id="' + Number(id) + '"]'); if (row) row.remove(); }
            if (!log.querySelector(".line") && !log.querySelector(".empty")) log.append(make("p", "empty", WORDS.empty || "Nothing has been said yet."));
            if (atEnd) log.scrollTop = log.scrollHeight;
            // Who can be written to: every account and the guests who are here; the one chosen is kept while it is there.
            const chosen = to.value;
            people = data.people || [];
            to.textContent = "";
            to.append(new Option(EVERYONE, "all"));
            for (const one of people) to.append(new Option(one.name + " (" + one.note + ")", one.id));
            to.value = chosen === "all" || people.some(one => one.id === chosen) ? chosen : "all";
            if (document.activeElement !== who) who.value = labelOf(to.value);
            else if (!list.hidden) show();
        }).catch(() => {}).then(() => { asking = false; });
    };
    form.addEventListener("submit", event => {
        event.preventDefault();
        const words = text.value.trim();
        if (!words) return;
        text.disabled = true;
        send({ do: "say", to: to.value, text: words }).then(answer => { say(answer.note || WORDS.sent || "Sent."); text.value = ""; ask(); }, () => say(WORDS.failed || "That could not be sent. Check the connection and try again."))
            .then(() => { text.disabled = false; text.focus(); });
    });
    // The page as the server drew it is taken over: the same lines, in this reader's own time, and current from here on.
    log.textContent = "";
    ask();
    setInterval(() => { if (!document.hidden) ask(); }, 2000);
    document.addEventListener("visibilitychange", () => { if (!document.hidden) ask(); });
})();
JS
        . '</script>';
}
if ($tab === 'bans') $html .= $card('bans', t('Banned addresses'), (string)count($bans), $banRows !== '' ? $table([t('Player'), t('Banned'), ''], $banRows) : '<p class="empty">' . e(t('Nobody is banned.')) . '</p>');

$facts = [
    t('Accounts') => e($accountsRule),
    t('New accounts') => $accountsOn ? $pill(!empty($settings['accounts']['registration']), t('Open'), t('Closed')) : '<span class="note">' . e(t('Accounts are off')) . '</span>',
    t('Players at once') => (string)$most,
    t('Chat') => $pill(!empty($settings['chat']['enabled'])),
    t('Voice') => $pill(!empty($settings['voice']['enabled'])),
    t('Live engine') => e($engine[0]),
    t('Largest character') => $limitMb > 0 ? e($limitMb . ' MB') : '<span class="note">' . e(t('No limit')) . '</span>',
    t('Room for all characters') => $limitGb > 0 ? e($limitGb . ' GB') : '<span class="note">' . e(t('No limit')) . '</span>',
];
$list = '';
foreach ($facts as $label => $value) $list .= '<div><dt>' . e($label) . '</dt><dd>' . $value . '</dd></div>';
if ($tab === 'settings') $html .= $card('settings', t('Settings'), '', '<p class="note">' . e(t('These rules come from the project (Database › Online). Change them in the editor and deploy again.')) . '</p><dl class="facts">' . $list . '</dl>');

page($title . ' · ' . t('Server admin'), $html . '</main>');
