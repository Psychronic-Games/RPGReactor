//=============================================================================
// reactor_online_voice.js: speaking as your character
//=============================================================================
// Nearby players who have turned voice on hear each other, from where they
// stand, and each one's character moves its mouth with the sound. Audio goes
// straight between players (WebRTC); the server only introduces them, so a
// world's voice costs its server next to nothing.
//
// Connecting to someone shows them your internet address, as any direct call
// does. So nobody connects until they press the voice key, and nobody blocked
// is ever connected to. Design: docs/DESIGN-ONLINE.md.

const ReactorOnlineVoice = {
    POLL_MS: 1000,
    MAX_LINKS: 8,           // a voice goes out once per listener, so this is what a home upload can carry
    NEAR_TILES: 3,          // full volume this close
    KEEP_RANGE: 1.25,       // a link once made lasts this far past hearing range, so walking the edge doesn't redial
    GATHER_MS: 1500,
    CONNECT_MS: 20000,      // some home routers never let a direct call through; try again rather than hang
    SPEAKING_LEVEL: 0.04,
    SPEAKING_HOLD_MS: 300,
    FRAME_SECONDS: 1 / 60,

    on: false,
    transmitting: false,
    links: new Map(),
    talks: new Map(),
    outbox: [],
    listening: [],

    settings() {
        const voice = ReactorOnline.config()?.voice;
        return voice && voice.enabled ? voice : null;
    },

    range() {
        return Number(this.settings()?.range) || 20;
    },

    keyName() {
        return String(this.settings()?.key || "V").toLowerCase();
    },

    pushToTalk() {
        return this.settings()?.mode !== "open";
    },

    /** "stun:host:3478" or "turn:host:3478 user password", one a line. */
    iceServers(text) {
        return String(text || "").split("\n").map(line => line.trim().split(/\s+/)).filter(parts => parts[0])
            .map(([urls, username, credential]) => (username ? { urls, username, credential } : { urls }));
    },

    /** How loud someone this far away is. */
    volumeAt(distance, range) {
        return Math.max(0, Math.min(1, 1 - (distance - this.NEAR_TILES) / Math.max(1, range - this.NEAR_TILES)));
    },

    /** Whom to be connected to: the nearest who have voice on, keeping anyone already linked until they're well away. */
    chooseLinks(people, range, linked) {
        return people.filter(person => person.distance <= (linked.has(person.slot) ? range * this.KEEP_RANGE : range))
            .sort((a, b) => a.distance - b.distance).slice(0, this.MAX_LINKS).map(person => person.slot);
    },

    /** A mouth shape for a sound, from where its energy sits: low is round, middle is open, high is wide. */
    shapeFor(centroidHz) {
        return centroidHz < 500 ? "ou" : centroidHz < 900 ? "oh" : centroidHz < 1800 ? "aa" : centroidHz < 3000 ? "ee" : "ih";
    },

    install() {
        if (this._installed || typeof document === "undefined") return;
        this._installed = true;
        document.addEventListener("keydown", event => this.onKey(event, true));
        document.addEventListener("keyup", event => this.onKey(event, false));
        // A key let go in another window never reports it: the microphone must not stay open.
        addEventListener("blur", () => { if (this.on && this.pushToTalk()) this.transmit(false); });
    },

    /** Whether the game has its own use for the voice key right now. */
    keyTaken() {
        if (typeof $gameFight === "undefined" || !$gameFight?.isAction?.()) return false;
        const code = this.keyName().toUpperCase().charCodeAt(0);
        return !!Input.keyMapper[code];
    },

    /** What the voice key does right now, and who can hear. */
    hintText() {
        if (!this.settings()) return "";
        const key = this.keyName().toUpperCase();
        if (this._turningOn) return "Allow the microphone";
        if (!this.on) return this.keyTaken() ? "" : key + ": turn on voice";
        const heard = [...this.links.values()].filter(link => link.pc.connectionState === "connected").length;
        const who = heard ? heard + " can hear you" : "nobody nearby has voice on";
        if (!this.pushToTalk()) return "Microphone open, " + who;
        return (this.transmitting ? "Speaking, " : "Hold " + key + " to speak, ") + who;
    },

    onKey(event, down) {
        if (!this.settings() || ReactorOnline.slot < 0 || ReactorOnlineChat.typing || event.repeat) return;
        if (event.key.toLowerCase() !== this.keyName() || event.ctrlKey || event.altKey || event.metaKey) return;
        // A real-time battle takes the key for itself (V guards): see `update`.
        if (this.keyTaken()) return;
        if (!this.on) { if (down) this.turnOn(); return; }
        if (this.pushToTalk()) this.transmit(down);
    },

    async turnOn() {
        if (this.on || this._turningOn) return;
        this._turningOn = true;
        ReactorOnlineChat.showHint();
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
            this.context = (typeof WebAudio !== "undefined" && WebAudio._context) || new AudioContext();
            this.context.resume();
            this.microphone = stream;
            this.track = stream.getAudioTracks()[0];
            this.ownMeter = this.meter(this.context.createMediaStreamSource(stream));
            this.on = true;
            this.transmit(!this.pushToTalk());
            ReactorOnlineChat.note(this.pushToTalk() ? `Voice on. Hold ${this.keyName().toUpperCase()} to speak.` : "Voice on. Say /voice off to stop.");
            this.poll();
        } catch (error) {
            ReactorOnlineChat.note("The microphone could not be used. Voice stays off.");
        } finally {
            this._turningOn = false;
            ReactorOnlineChat.showHint();
        }
    },

    turnOff() {
        const wasOn = this.on;
        this.on = false;
        this.transmit(false);
        clearTimeout(this._poll);
        for (const slot of [...this.links.keys()]) this.drop(slot);
        this.microphone?.getTracks().forEach(track => track.stop());
        this.microphone = this.track = this.ownMeter = null;
        this.outbox.length = 0;
        if (wasOn && ReactorOnline.slot >= 0) {
            ReactorOnline.post("voice", { on: false }, this.identity()).catch(() => null);
            ReactorOnlineChat.note("Voice off.");
        }
    },

    transmit(open) {
        this.transmitting = open;
        if (this.track) this.track.enabled = open;
        ReactorOnlineChat.showHint();
    },

    identity() {
        return { s: ReactorOnline.slot, g: ReactorOnline.nonce, t: ReactorOnline.token };
    },

    /** Once a second: who else has voice on, and whatever they have sent to make a connection. */
    async poll() {
        if (!this.on) return;
        try {
            const out = this.outbox.splice(0);
            const answer = await ReactorOnline.post("voice", { on: true, out }, this.identity());
            this.listening = answer.on || [];
            for (const message of answer.inbox || []) await this.receive(message);
            this.connect();
        } catch (error) {
            if (error?.status === 403) { this.turnOff(); return; }
            console.warn("Voice could not reach the server.", error);
        }
        if (this.on) this._poll = setTimeout(() => this.poll(), this.POLL_MS);
    },

    blocked(slot) {
        const peer = ReactorOnline.peers.get(slot);
        return !!peer && ReactorOnlineChat.blocked().has(peer.playerName);
    },

    distanceTo(character) {
        return Math.hypot(character._realX - $gamePlayer._realX, character._realY - $gamePlayer._realY);
    },

    connect() {
        const people = [];
        for (const slot of this.listening) {
            const peer = ReactorOnline.peers.get(slot);
            if (peer && slot !== ReactorOnline.slot && !this.blocked(slot)) people.push({ slot, distance: this.distanceTo(peer) });
        }
        const wanted = new Set(this.chooseLinks(people, this.range(), this.links));
        const now = performance.now();
        for (const [slot, link] of [...this.links]) {
            if (!wanted.has(slot) || (link.pc.connectionState !== "connected" && now - link.made > this.CONNECT_MS)) this.drop(slot);
        }
        // Both ends work out the same list; the lower slot makes the call, so a pair never calls twice.
        for (const slot of wanted) if (!this.links.has(slot) && ReactorOnline.slot < slot) this.call(slot);
    },

    link(slot) {
        const pc = new RTCPeerConnection({ iceServers: this.iceServers(this.settings().servers) });
        const link = { slot, pc, made: performance.now(), speakingUntil: 0 };
        this.links.set(slot, link);
        pc.ontrack = event => this.hear(link, event.streams[0] || new MediaStream([event.track]));
        pc.onconnectionstatechange = () => { if (["failed", "closed"].includes(pc.connectionState) && this.links.get(slot) === link) this.drop(slot); };
        return link;
    },

    /** Every address this end can be reached at, all in one message: slower to connect than sending them singly, with far fewer trips to the server. */
    gathered(pc) {
        if (pc.iceGatheringState === "complete") return Promise.resolve();
        return new Promise(done => {
            const timer = setTimeout(done, this.GATHER_MS);
            pc.addEventListener("icegatheringstatechange", () => { if (pc.iceGatheringState === "complete") { clearTimeout(timer); done(); } });
        });
    },

    async call(slot) {
        const link = this.link(slot), pc = link.pc;
        pc.addTransceiver(this.track, { direction: "sendrecv" });
        await pc.setLocalDescription(await pc.createOffer());
        await this.gathered(pc);
        this.outbox.push({ to: slot, data: pc.localDescription });
    },

    async receive({ from, data }) {
        if (!this.on || !data || this.blocked(from) || !ReactorOnline.peers.has(from)) return;
        if (data.type === "offer" && from < ReactorOnline.slot) {
            this.drop(from);
            const pc = this.link(from).pc;
            await pc.setRemoteDescription(data);
            const transceiver = pc.getTransceivers()[0];
            if (transceiver) { transceiver.direction = "sendrecv"; await transceiver.sender.replaceTrack(this.track); }
            await pc.setLocalDescription(await pc.createAnswer());
            await this.gathered(pc);
            this.outbox.push({ to: from, data: pc.localDescription });
        } else if (data.type === "answer" && this.links.get(from)?.pc.signalingState === "have-local-offer") {
            await this.links.get(from).pc.setRemoteDescription(data);
        }
    },

    /** A sound's level and shape can be read each frame without touching its samples elsewhere. */
    meter(source) {
        const analyser = this.context.createAnalyser();
        analyser.fftSize = 512;
        analyser.smoothingTimeConstant = 0.3;
        source.connect(analyser);
        return { analyser, wave: new Float32Array(analyser.fftSize), spectrum: new Uint8Array(analyser.frequencyBinCount) };
    },

    read(meter) {
        const { analyser, wave, spectrum } = meter;
        analyser.getFloatTimeDomainData(wave);
        let energy = 0;
        for (let i = 0; i < wave.length; i++) energy += wave[i] * wave[i];
        analyser.getByteFrequencyData(spectrum);
        let weighted = 0, total = 0;
        for (let i = 1; i < spectrum.length; i++) { weighted += i * spectrum[i]; total += spectrum[i]; }
        const binHz = this.context.sampleRate / analyser.fftSize;
        return { level: Math.min(1, Math.sqrt(energy / wave.length) * 6), centroid: total ? weighted / total * binHz : 0 };
    },

    hear(link, stream) {
        // Chrome only passes a remote stream on to Web Audio while an element is playing it.
        link.element = new Audio();
        link.element.srcObject = stream;
        link.element.muted = true;
        link.element.play().catch(() => null);
        link.source = this.context.createMediaStreamSource(stream);
        link.meter = this.meter(link.source);
        link.gain = this.context.createGain();
        link.pan = this.context.createStereoPanner();
        link.gain.gain.value = 0;
        link.meter.analyser.connect(link.gain).connect(link.pan).connect(this.context.destination);
    },

    drop(slot) {
        const link = this.links.get(slot);
        if (!link) return;
        this.links.delete(slot);
        link.pc.onconnectionstatechange = null;
        link.pc.close();
        link.source?.disconnect();
        link.meter?.analyser.disconnect();
        link.gain?.disconnect();
        link.pan?.disconnect();
        if (link.element) link.element.srcObject = null;
        const peer = ReactorOnline.peers.get(slot);
        if (peer) peer.speaking = false;
    },

    /** Each frame: everyone's volume, side and mouth. */
    update() {
        // The line in the corner follows a battle taking the key, voice on or not.
        if (!this.on) { if (this.keyTaken() !== !!this._keyWasTaken) { this._keyWasTaken = this.keyTaken(); ReactorOnlineChat.showHint(); } return; }
        // With no key to hold, the microphone stays open for the length of the battle.
        const taken = this.keyTaken();
        if (taken !== !!this._keyWasTaken) { this._keyWasTaken = taken; this.transmit(taken || !this.pushToTalk()); }
        ReactorOnlineChat.showHint();
        const now = performance.now(), range = this.range();
        for (const link of this.links.values()) {
            const peer = ReactorOnline.peers.get(link.slot);
            if (!peer || !link.meter) continue;
            const distance = this.distanceTo(peer), sound = this.read(link.meter);
            link.gain.gain.value = this.volumeAt(distance, range);
            link.pan.pan.value = Math.max(-1, Math.min(1, (peer._realX - $gamePlayer._realX) / range));
            if (sound.level > this.SPEAKING_LEVEL) link.speakingUntil = now + this.SPEAKING_HOLD_MS;
            peer.speaking = now < link.speakingUntil;
            this.mouth(peer, sound);
        }
        if (this.ownMeter && this.transmitting) {
            const sound = this.read(this.ownMeter);
            this.mouth($gamePlayer, sound);
        }
    },

    mouth(character, sound) {
        if (sound.level > this.SPEAKING_LEVEL && !this.talks.has(character)) this.talks.set(character, this.newTalk());
        const talk = this.talks.get(character);
        if (talk) { talk.level = sound.level; talk.shape = sound.centroid; }
    },

    newTalk() {
        const Speech = Reactor3D.Speech, count = Speech.VISEMES.length;
        return { object: null, rig: null, shapes: null, text: null, printed: -1, hold: 0, last: -1, target: new Float32Array(count), weight: new Float32Array(count + 1),
            blinkIn: 1 + Math.random() * 2, blinkAt: -1, ending: false, time: 0, level: 0, shape: 0 };
    },

    /** One frame of every speaking mouth, on the rig a Show Text uses, each with its own state because many can talk at once. */
    drawMouths(scene) {
        const Speech = Reactor3D.Speech;
        for (const [character, talk] of this.talks) {
            const holder = scene._modelInstances?.get(Reactor3D.modelInstanceKey(character));
            const object = holder?.object || null;
            if (object !== talk.object) { if (talk.rig) Speech.restRig(talk.rig); talk.object = object; talk.rig = Speech.talkRig(object); }
            // A Show Text from this character has the mouth for as long as it lasts.
            if (Speech.talk.character === character || !talk.rig) { this.talks.delete(character); continue; }
            const open = talk.level > this.SPEAKING_LEVEL;
            if (open) { talk.last = Speech.VISEMES.indexOf(this.shapeFor(talk.shape)); talk.hold = Speech.TALK.HOLD; }
            const moving = Speech.stepTalk(talk, null, -1, open ? talk.level : null, this.FRAME_SECONDS);
            Speech.writeTalk(talk);
            talk.level = 0;
            if (!open && moving <= 0) { Speech.restRig(talk.rig); this.talks.delete(character); }
        }
    }
};

ReactorOnlineVoice.install();

const _reactorVoiceMapUpdate = Scene_Map.prototype.update;
Scene_Map.prototype.update = function() {
    _reactorVoiceMapUpdate.call(this);
    ReactorOnlineVoice.update();
};

if (typeof Reactor3D !== "undefined" && Reactor3D.MapScene && Reactor3D.Speech) {
    const _reactorVoiceModels = Reactor3D.MapScene.prototype.syncCharacterModels;
    Reactor3D.MapScene.prototype.syncCharacterModels = function() {
        const result = _reactorVoiceModels.apply(this, arguments);
        ReactorOnlineVoice.drawMouths(this);
        return result;
    };
}
