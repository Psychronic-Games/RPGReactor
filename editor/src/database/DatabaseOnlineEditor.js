/**
 * DatabaseOnlineEditor - Database › Online: whether a project is a single-player or an
 * online game, and how an online game behaves: its server, accounts and chat. Kept in
 * data/ReactorOnline.json, which only exists once a project has set something here.
 * The game reads these in runtime/reactor_online.js; the server is given what it must
 * enforce at deploy time. Design: docs/DESIGN-ONLINE.md.
 */
class DatabaseOnlineEditor {
    static DEFAULTS = Object.freeze({ enabled: false, address: '', maxPlayers: 64, updatesPerSecond: 5, party: 'solo', showNames: true, showStatus: true, playtest: false });
    static ACCOUNTS = Object.freeze({ mode: 'none', registration: true, minPassword: 8, title: '', persist: true, autosave: 60, restart: true, sleepers: true, sleeperDays: 30 });
    static WORLD = Object.freeze({ switches: '', variables: '', partySwitches: '', partyVariables: '' });
    static ENGINE = Object.freeze({ enabled: true, rate: 15, movement: 'speed', maxSpeed: 16 });
    static VOICE = Object.freeze({ enabled: false, mode: 'push', key: 'V', range: 20, who: 'all', servers: 'stun:stun.l.google.com:19302' });
    // Characters players send the server: the largest one (MB) and the room for all of them (GB). 0 is no limit.
    static STORAGE = Object.freeze({ characterMB: 0, totalGB: 0 });
    static CHAT = Object.freeze({ enabled: true, who: 'all', world: true, bubbles: true, cooldown: 2, maxLength: 200, history: 50, key: 'T', blockedWords: '' });

    constructor(databaseManager) {
        this.databaseManager = databaseManager;
    }

    /** A copy with every field present. Nothing reaches the project until something is changed. */
    settings(saved) {
        return { ...DatabaseOnlineEditor.DEFAULTS, ...saved,
            accounts: { ...DatabaseOnlineEditor.ACCOUNTS, ...saved?.accounts }, chat: { ...DatabaseOnlineEditor.CHAT, ...saved?.chat }, world: { ...DatabaseOnlineEditor.WORLD, ...saved?.world }, engine: { ...DatabaseOnlineEditor.ENGINE, ...saved?.engine }, voice: { ...DatabaseOnlineEditor.VOICE, ...saved?.voice }, storage: { ...DatabaseOnlineEditor.STORAGE, ...saved?.storage } };
    }

    showOnlineDetail(container) {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        const settings = this.settings(this.databaseManager.getOnlineSettings());
        const accounts = settings.accounts, chat = settings.chat, world = settings.world, engine = settings.engine, voice = settings.voice, storage = settings.storage;
        container.innerHTML = '';
        const { wrapper, form } = DatabaseFlowForm.page(container, tt('Online'));
        // Any change writes the whole settings object, the first one creating the project's file.
        wrapper.addEventListener('change', () => { this.databaseManager.data.online = settings; });

        form.section('online-type', tt('Game type'), `
            <div class="rr-flow-radios">
                <label class="rr-flow-check"><input type="radio" name="online-type" value="single" class="system-radio" ${settings.enabled ? '' : 'checked'}><span>${tt('Single player')}</span></label>
                <label class="rr-flow-check"><input type="radio" name="online-type" value="online" class="system-radio" ${settings.enabled ? 'checked' : ''}><span>${tt('Online')}</span></label>
            </div>
            ${form.note(tt('Online games add other players to the map. Single-player games run no online code.'))}`);
        const sections = [form.section('online-server', tt('Server'), form.fields(
            form.text('online-address', tt('Public address'), 'https://example.com', tt('Where the game is hosted. Desktop builds use it to find the server.'), true),
            form.number('online-max', tt('Most players'), settings.maxPlayers, 1, 1024, tt('A server with no room left turns new players away. Takes effect the next time you deploy.')),
            form.number('online-rate', tt('Updates per second'), settings.updatesPerSecond, 1, 20, tt('Higher is more responsive and works the server harder. 5 suits most web hosts.')),
            form.number('online-character-mb', tt('Largest character (MB)'), storage.characterMB, 0, 100000, tt('The most one player\'s character may take on the server. 0 is no limit. Takes effect the next time you deploy.')),
            form.number('online-storage-gb', tt('Room for characters (GB)'), storage.totalGB, 0, 100000, tt('The most all players\' characters may take on the server together. 0 is no limit. Takes effect the next time you deploy.')),
            form.check('online-playtest', tt('Connect during playtest'), settings.playtest, tt('Playtests stay offline unless this is on.')))),
        form.section('online-accounts', tt('Accounts'), form.fields(
            form.choice('online-account-mode', tt('Signing in'), [['none', tt('Guests only, no accounts')], ['optional', tt('Accounts or guests')], ['required', tt('Accounts required')]], accounts.mode, tt('An account keeps a player\'s character across devices. Use https, because passwords travel to your server.')),
            form.text('online-account-title', tt('Sign-in screen title')),
            form.check('online-registration', tt('Allow new accounts'), accounts.registration !== false),
            form.number('online-min-password', tt('Shortest password'), accounts.minPassword, 6, 32),
            form.check('online-persist', tt('Keep progress on the server'), accounts.persist !== false, tt('Players with accounts wake up where they signed off, on any device.')),
            form.number('online-autosave', tt('Seconds between saves'), accounts.autosave, 10, 600),
            form.check('online-restart', tt('Let players start over'), accounts.restart !== false),
            form.check('online-sleepers', tt('Show sleeping players'), accounts.sleepers !== false, tt('Players who signed off stay in the world, lying where they stopped.')),
            form.number('online-sleeper-days', tt('Days a sleeper stays'), accounts.sleeperDays, 1, 365))),
        form.section('online-players', tt('Players'), form.fields(
            form.choice('online-party', tt('Party'), [['solo', tt('Each player alone')], ['party', tt('Each player leads the starting party')]], settings.party === 'party' ? 'party' : 'solo'),
            form.check('online-respawn', tt('Get up after a defeat'), settings.respawn !== false, tt('Instead of Game Over, a knocked-out player gets up where they last entered a map, fully recovered, and stays in the world.')),
            form.check('online-names', tt('Show names above players'), settings.showNames !== false),
            form.check('online-status', tt('Show connection label'), settings.showStatus !== false))),
        form.section('online-world', tt('Shared with every player'), `
            ${form.fields(form.text('online-world-switches', tt('Switches'), '1-5, 12'), form.text('online-world-variables', tt('Variables'), '20, 21'))}
            ${form.note(tt('Events run the same as in a single-player game. Whatever you list here is shared: when one player\'s game changes it, every player\'s game changes too. Everything else stays personal to each player.'))}
            ${form.note(tt('To share an event\'s self switches, so a chest opens once for everybody, add <world> to its note.').replace('<', '&lt;').replace('>', '&gt;'))}
            ${form.fields(form.text('online-party-switches', tt('Party switches'), '30-35'), form.text('online-party-variables', tt('Party variables'), '40'))}`),
        form.section('online-chat', tt('Chat'), form.fields(
            form.check('online-chat-on', tt('Players can chat'), chat.enabled !== false),
            form.choice('online-chat-who', tt('Who can chat'), [['all', tt('Everyone')], ['accounts', tt('Signed-in players only')]], chat.who === 'accounts' ? 'accounts' : 'all'),
            form.check('online-chat-world', tt('Allow a world channel'), chat.world !== false, tt('Otherwise players only reach others on their map.')),
            form.check('online-chat-bubbles', tt('Show speech above heads'), chat.bubbles !== false),
            form.text('online-chat-key', tt('Chat key'), 'T'),
            form.number('online-chat-cooldown', tt('Seconds between messages'), chat.cooldown, 0, 60),
            form.number('online-chat-length', tt('Longest message'), chat.maxLength, 20, 500),
            form.number('online-chat-history', tt('Messages kept per channel'), chat.history, 10, 500),
            form.area('online-chat-blocked', tt('Blocked words'), 2, tt('Separated by spaces or commas. They become stars, and cannot be account names. The server enforces this.')))),
        form.section('online-voice', tt('Voice'), `
            ${form.fields(
                form.check('online-voice-on', tt('Players can speak as their characters'), voice.enabled),
                form.choice('online-voice-mode', tt('Speaking'), [['push', tt('Hold a key to speak')], ['open', tt('Microphone stays open')]], voice.mode === 'open' ? 'open' : 'push'),
                form.text('online-voice-key', tt('Voice key'), 'V'),
                form.number('online-voice-range', tt('Hearing range, in tiles'), voice.range, 5, 100),
                form.choice('online-voice-who', tt('Who can use voice'), [['all', tt('Everyone')], ['accounts', tt('Signed-in players only')]], voice.who === 'accounts' ? 'accounts' : 'all'),
                form.area('online-voice-servers', tt('Connection servers'), 2, tt('One a line. These help players find each other, and the default is a public Google server. A TURN server, written as "turn:host:port user password", also reaches players a home router would block.')))}
            ${form.note(tt('Nearby players hear each other, and a 3D character\'s mouth moves with the sound. Sound goes directly between players, so each sees the other\'s internet address. A player connects only after pressing the voice key.'))}`),
        form.section('online-engine', tt('Fast connection'), form.fields(
            form.check('online-engine-on', tt('Use a fast connection where the host allows it'), engine.enabled !== false, tt('Needs Node.js and a WebSocket proxy on the server. Without them, the game connects the ordinary way.')),
            form.number('online-engine-rate', tt('Updates per second, fast connection'), engine.rate, 5, 30),
            form.choice('online-engine-movement', tt('Server checks movement'), [['off', tt('Off')], ['speed', tt('Speed')], ['walls', tt('Speed and walls')]], engine.movement, tt('Refuses moves a player\'s game could not have made. Checking walls uses the tileset\'s passage settings, so leave it off if a plugin changes where players can walk.')),
            form.number('online-engine-speed', tt('Fastest speed, in tiles per second'), engine.maxSpeed, 4, 64, tt('Raise this if a vehicle or plugin moves players faster.'))))];

        const field = id => container.querySelector('#' + id);
        // People's text is set as a value, never written into the page's markup.
        field('online-address').value = settings.address || '';
        field('online-account-title').value = accounts.title || '';
        field('online-world-switches').value = world.switches || '';
        field('online-world-variables').value = world.variables || '';
        field('online-party-switches').value = world.partySwitches || '';
        field('online-party-variables').value = world.partyVariables || '';
        field('online-chat-key').value = chat.key || 'T';
        field('online-voice-key').value = voice.key || 'V';
        field('online-voice-servers').value = voice.servers || '';
        field('online-chat-blocked').value = chat.blockedWords || '';
        const showDetails = () => {
            for (const section of sections) section.style.display = settings.enabled ? '' : 'none';
            const signIn = accounts.mode !== 'none';
            DatabaseFlowForm.enable(wrapper, ['online-account-title', 'online-registration', 'online-min-password', 'online-persist', 'online-restart', 'online-sleepers'], signIn);
            DatabaseFlowForm.enable(wrapper, ['online-autosave'], signIn && accounts.persist !== false);
            DatabaseFlowForm.enable(wrapper, ['online-sleeper-days'], signIn && accounts.sleepers !== false);
            DatabaseFlowForm.enable(wrapper, ['online-chat-who', 'online-chat-world', 'online-chat-bubbles', 'online-chat-key', 'online-chat-cooldown', 'online-chat-length', 'online-chat-history', 'online-chat-blocked'], chat.enabled !== false);
            DatabaseFlowForm.enable(wrapper, ['online-voice-mode', 'online-voice-key', 'online-voice-range', 'online-voice-who', 'online-voice-servers'], !!voice.enabled);
            DatabaseFlowForm.enable(wrapper, ['online-engine-rate', 'online-engine-movement', 'online-engine-speed'], engine.enabled !== false);
        };
        showDetails();
        // After each field's own handler, so the page shows what was just chosen.
        wrapper.addEventListener('change', showDetails);
        container.querySelectorAll('input[name="online-type"]').forEach(radio => radio.addEventListener('change', () => {
            settings.enabled = radio.value === 'online' && radio.checked;
            showDetails();
        }));
        const whole = (input, low, high, fallback) => {
            const value = Math.round(Number(input.value));
            const held = Number.isFinite(value) && input.value !== '' ? Math.max(low, Math.min(high, value)) : fallback;
            input.value = held;
            return held;
        };
        const on = (id, apply) => field(id).addEventListener('change', event => apply(event.target));
        on('online-address', input => { settings.address = input.value.trim(); });
        on('online-max', input => { settings.maxPlayers = whole(input, 1, 1024, 64); });
        on('online-rate', input => { settings.updatesPerSecond = whole(input, 1, 20, 5); });
        on('online-character-mb', input => { storage.characterMB = whole(input, 0, 100000, 0); });
        on('online-storage-gb', input => { storage.totalGB = whole(input, 0, 100000, 0); });
        on('online-voice-on', input => { voice.enabled = input.checked; });
        on('online-voice-mode', input => { voice.mode = input.value; });
        on('online-voice-key', input => { voice.key = input.value.trim().slice(0, 1).toUpperCase() || 'V'; input.value = voice.key; });
        on('online-voice-range', input => { voice.range = whole(input, 5, 100, 20); });
        on('online-voice-who', input => { voice.who = input.value; });
        on('online-voice-servers', input => { voice.servers = input.value.trim(); });
        on('online-engine-on', input => { engine.enabled = input.checked; });
        on('online-engine-rate', input => { engine.rate = whole(input, 5, 30, 15); });
        on('online-engine-movement', input => { engine.movement = input.value; });
        on('online-engine-speed', input => { engine.maxSpeed = whole(input, 4, 64, 16); });
        on('online-party', input => { settings.party = input.value; });
        on('online-respawn', input => { settings.respawn = input.checked; });
        on('online-playtest', input => { settings.playtest = input.checked; });
        on('online-names', input => { settings.showNames = input.checked; });
        on('online-status', input => { settings.showStatus = input.checked; });
        on('online-account-mode', input => { accounts.mode = input.value; });
        on('online-registration', input => { accounts.registration = input.checked; });
        on('online-min-password', input => { accounts.minPassword = whole(input, 6, 32, 8); });
        on('online-account-title', input => { accounts.title = input.value; });
        on('online-persist', input => { accounts.persist = input.checked; });
        on('online-autosave', input => { accounts.autosave = whole(input, 10, 600, 60); });
        on('online-restart', input => { accounts.restart = input.checked; });
        on('online-sleepers', input => { accounts.sleepers = input.checked; });
        on('online-sleeper-days', input => { accounts.sleeperDays = whole(input, 1, 365, 30); });
        on('online-world-switches', input => { world.switches = input.value.trim(); });
        on('online-world-variables', input => { world.variables = input.value.trim(); });
        on('online-party-switches', input => { world.partySwitches = input.value.trim(); });
        on('online-party-variables', input => { world.partyVariables = input.value.trim(); });
        on('online-chat-on', input => { chat.enabled = input.checked; });
        on('online-chat-who', input => { chat.who = input.value; });
        on('online-chat-world', input => { chat.world = input.checked; });
        on('online-chat-bubbles', input => { chat.bubbles = input.checked; });
        on('online-chat-key', input => { chat.key = (input.value.trim() || 'T').slice(0, 1).toUpperCase(); input.value = chat.key; });
        on('online-chat-cooldown', input => { chat.cooldown = whole(input, 0, 60, 2); });
        on('online-chat-length', input => { chat.maxLength = whole(input, 20, 500, 200); });
        on('online-chat-history', input => { chat.history = whole(input, 10, 500, 50); });
        on('online-chat-blocked', input => { chat.blockedWords = input.value; });
    }
}

if (typeof window !== 'undefined') window.DatabaseOnlineEditor = DatabaseOnlineEditor;
